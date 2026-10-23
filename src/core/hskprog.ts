/**
 * Прогресс экзамена HSK: сохранённые варианты (разбор можно открыть снова), незаконченный вариант (продолжить),
 * «Работа над ошибками» (задание уходит из списка, когда решено верно два раза подряд) и статистика по частям.
 */
import type { Item, Sec } from "./hsk.ts";

/** Ответ в сохранённом варианте. */
export type SavedQ = { id: string; perm?: number[]; tiles?: string[]; ans: number | string | string[] | null; shown?: boolean; hid?: boolean };
/** Законченный вариант (runs) или незаконченный (cur): всё, чтобы восстановить его по банку. */
export type SavedRun = {
  at: number; level: number; mode: string; secs: Sec[]; fix?: boolean;
  qs: SavedQ[]; pos?: number;
  /** cur: сколько миллисекунд осталось на экзамене и сколько уже прошло. */
  left?: number; spent?: number; gplays?: Record<string, number>;
  /** runs: итог. */
  total?: number; max?: number; passed?: boolean;
};
export type WrongRec = { n: number; streak: number; last: number };
/** Статистика части: верных, всего, когда обновлена. */
export type PartStat = [number, number];

export const KEEP_RUNS = 20;
export const FIX_STREAK = 2;
export const FIX_SIZE = 20;

/** Номера вариантов в новом порядке относительно банка (для восстановления перемешанного задания). */
export function permOf(orig: Item, shuffled: Item): number[] | undefined {
  if (!orig.opts || !shuffled.opts) return undefined;
  const used = new Set<number>();
  const perm = shuffled.opts.map((o) => {
    let k = orig.opts!.findIndex((x, i) => !used.has(i) && x.t === o.t && x.p === o.p);
    if (k < 0) k = 0;
    used.add(k);
    return k;
  });
  return perm.every((p, i) => p === i) ? undefined : perm;
}
/** Задание из банка с сохранённым порядком вариантов. */
export function applyPerm(it: Item, perm?: number[]): Item {
  if (!perm || !it.opts || perm.length !== it.opts.length) return it;
  return { ...it, opts: perm.map((i) => it.opts![i]), a: it.a === undefined ? it.a : perm.indexOf(it.a) };
}

/** Ответ на задание: верно — серия растёт (две подряд — задание больше не в ошибках), неверно — серия с нуля. */
export function noteAnswer(wrong: Record<string, WrongRec>, id: string, right: boolean, now: number): void {
  const w = wrong[id];
  if (right) {
    if (!w) return;
    w.streak++; w.last = now; // запись остаётся (решённое помечено серией ≥ 2), чтобы слияние не воскрешало его
  } else wrong[id] = { n: (w?.n ?? 0) + 1, streak: 0, last: now };
}

/** Задания для «Работы над ошибками»: сначала самые давние ошибки; группы вопросов к одному тексту — целиком. */
export function wrongPool(wrong: Record<string, WrongRec>, bank: Item[], size = FIX_SIZE): Item[] {
  const items = bank.filter((it) => open(wrong[it.id]));
  items.sort((a, b) => wrong[a.id].last - wrong[b.id].last);
  const out: Item[] = [];
  for (const it of items) {
    if (out.length >= size) break;
    if (!out.includes(it)) out.push(it);
  }
  return out;
}
const open = (w?: WrongRec) => !!w && w.streak < FIX_STREAK;
export const wrongCount = (wrong: Record<string, WrongRec>, level: number) =>
  Object.entries(wrong).filter(([id, w]) => id.startsWith(String(level)) && open(w)).length;

/** Обновить статистику частей по итогам варианта. */
export function addPartStats(stat: Record<string, PartStat>, results: { part: string; right: boolean }[]): void {
  for (const r of results) {
    const s = stat[r.part] ?? (stat[r.part] = [0, 0]);
    s[1]++; if (r.right) s[0]++;
  }
}
/** Слабые части: доля верных ниже порога, хотя бы minTotal ответов; от худшей. */
export function weakParts(stat: Record<string, PartStat>, level: number, minTotal = 6, below = 0.75): { part: string; share: number; total: number }[] {
  return Object.entries(stat)
    .filter(([id, s]) => id.startsWith(String(level)) && s[1] >= minTotal && s[0] / s[1] < below)
    .map(([part, s]) => ({ part, share: s[0] / s[1], total: s[1] }))
    .sort((a, b) => a.share - b.share);
}

/** Слияние прогресса двух устройств. */
export function mergeProg(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): Record<string, unknown> {
  type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const x = (a ?? {}) as Any, y = (b ?? {}) as Any;
  const seen: Record<string, number> = { ...(y.seen ?? {}) };
  for (const [k, v] of Object.entries((x.seen ?? {}) as Record<string, number>)) seen[k] = Math.max(v, seen[k] ?? 0);
  const byAt = (l: Any[]) => [...new Map(l.map((h) => [h.at, h] as [number, Any])).values()].sort((p, q) => p.at - q.at);
  const hist = byAt([...(y.hist ?? []), ...(x.hist ?? [])]);
  const runs = byAt([...(y.runs ?? []), ...(x.runs ?? [])]).slice(-KEEP_RUNS);
  const wrong: Record<string, WrongRec> = { ...(y.wrong ?? {}) };
  for (const [k, v] of Object.entries((x.wrong ?? {}) as Record<string, WrongRec>)) if (!wrong[k] || v.last > wrong[k].last) wrong[k] = v;
  const stat: Record<string, PartStat> = {};
  for (const src of [y.stat ?? {}, x.stat ?? {}]) for (const [k, v] of Object.entries(src as Record<string, PartStat>)) if (!stat[k] || v[1] > stat[k][1]) stat[k] = v;
  const curs = [x.cur, y.cur].filter(Boolean) as SavedRun[];
  const cur = curs.sort((p, q) => q.at - p.at)[0];
  return { ...y, ...x, seen, hist, runs, wrong, stat, ...(cur ? { cur } : {}) };
}
