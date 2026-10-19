/**
 * Подстройка параметров FSRS под пользователя по журналу ответов (упрощённая версия оптимизатора FSRS).
 * Журнал проигрывается заново с параметрами w; для каждого повторения после перерыва ≥ 12 ч сравнивается
 * прогноз «вспомню» (retrievability) с тем, что было на самом деле (оценка > «Снова»). Ошибка — лог-лосс.
 * Параметры подбираются покоординатным поиском в разумных границах, остальные остаются по умолчанию.
 */
import { schedule, newCard, retrievability, DEFAULT_PARAMS, DEFAULT_W, DAY, type Card, type Grade } from "./fsrs.ts";

export type Rev = { id: string; at: number; grade: Grade };

/** Какие параметры подбираем и в каких границах (как в оптимизаторе FSRS). */
const TUNE: [number, number, number][] = [
  [0, 0.01, 100], [1, 0.01, 100], [2, 0.01, 100], [3, 0.01, 100],
  [8, 0, 6], [9, 0.001, 0.8], [10, 0.001, 6],
  [11, 0.001, 5], [12, 0.001, 0.25], [13, 0.001, 0.9], [14, 0, 6],
  [15, 0, 1], [16, 1, 6],
];

/** Сгруппировать журнал по карточкам, по времени. */
export function byCard(revs: Rev[]): Rev[][] {
  const m = new Map<string, Rev[]>();
  for (const r of revs) (m.get(r.id) ?? m.set(r.id, []).get(r.id)!).push(r);
  for (const l of m.values()) l.sort((a, b) => a.at - b.at);
  return [...m.values()];
}

/** Лог-лосс прогноза и число повторений, по которым он считался. */
export function evaluate(cards: Rev[][], w: number[]): { loss: number; n: number } {
  const p = { ...DEFAULT_PARAMS, w };
  let sum = 0, n = 0;
  for (const list of cards) {
    let c: Card = newCard(list[0].id, list[0].at);
    for (const r of list) {
      if (c.state === "review" && c.last) {
        const days = (r.at - c.last) / DAY;
        if (days >= 0.5) {
          const pr = Math.min(0.999, Math.max(0.001, retrievability(days, c.stability)));
          const y = r.grade > 1 ? 1 : 0;
          sum += -(y * Math.log(pr) + (1 - y) * Math.log(1 - pr));
          n++;
        }
      }
      c = schedule(c, r.grade, r.at, p);
    }
  }
  return { loss: n ? sum / n : 0, n };
}

export type OptResult = { w: number[]; before: number; after: number; n: number };

/** Подобрать параметры. Нужно хотя бы minN повторений после перерыва, иначе null. */
export function optimize(revs: Rev[], minN = 100, rounds = 6): OptResult | null {
  const cards = byCard(revs);
  const w = [...DEFAULT_W];
  const start = evaluate(cards, w);
  if (start.n < minN) return null;
  let best = start.loss;
  let step = 0.3;
  for (let k = 0; k < rounds; k++) {
    let improved = false;
    for (const [i, lo, hi] of TUNE) {
      for (const dir of [1, -1]) {
        const old = w[i];
        // большие параметры — множителем, маленькие — сдвигом
        const next = Math.min(hi, Math.max(lo, old > 1 ? old * (1 + dir * step) : old + dir * step * Math.max(0.1, Math.abs(old))));
        if (next === old) continue;
        w[i] = next;
        const l = evaluate(cards, w).loss;
        if (l < best - 1e-6) { best = l; improved = true; break; }
        w[i] = old;
      }
    }
    if (!improved) step /= 2;
    if (step < 0.01) break;
  }
  return { w: w.map((x) => Math.round(x * 1e5) / 1e5), before: start.loss, after: best, n: start.n };
}
