/**
 * Статистика занятий: дни с занятиями, серия дней, прогноз нагрузки, точность, сколько иероглифов умеешь писать.
 * День начинается в 4 утра, как в Anki.
 */
import type { Card, Grade } from "./fsrs.ts";

export type ReviewLog = { id: string; at: number; grade: Grade; state: Card["state"] };
const DAY = 86_400_000;
const SHIFT = 4 * 3_600_000;

/** Ключ дня «2026-10-18» (местное время, день с 4 утра). */
export function dayOf(t: number): string {
  const d = new Date(t - SHIFT);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ключ дня, отстоящего на n дней от t. */
export const dayShift = (t: number, n: number) => dayOf(t + n * DAY);

export type DayStat = { count: number; again: number };

export function byDay(reviews: ReviewLog[]): Map<string, DayStat> {
  const m = new Map<string, DayStat>();
  for (const r of reviews) {
    const k = dayOf(r.at);
    const s = m.get(k) ?? { count: 0, again: 0 };
    s.count++;
    if (r.grade === 1) s.again++;
    m.set(k, s);
  }
  return m;
}

/** Серия: сколько дней подряд были занятия, считая сегодня (если сегодня ещё не занимались — со вчера). */
export function streak(days: Map<string, DayStat>, now: number): { current: number; best: number; today: boolean } {
  const today = days.has(dayOf(now));
  let current = 0;
  for (let i = today ? 0 : 1; days.has(dayShift(now, -i)); i++) current++;
  // лучшая серия — по всем дням
  const keys = [...days.keys()].sort();
  let best = 0, run = 0, prev = "";
  for (const k of keys) {
    const next = prev ? dayOf(Date.parse(prev + "T12:00:00") + DAY + SHIFT) : "";
    run = prev && k === next ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { current, best: Math.max(best, current), today };
}

/** Прогноз: сколько карточек к повторению в каждый из следующих n дней (сегодня — с просроченными). */
export function forecast(cards: Iterable<Card>, now: number, n = 30): number[] {
  const out = new Array(n).fill(0);
  const today = dayOf(now);
  const keys = Array.from({ length: n }, (_, i) => dayShift(now, i));
  const index = new Map(keys.map((k, i) => [k, i]));
  for (const c of cards) {
    if (c.state === "new") continue;
    const k = c.due <= now ? today : dayOf(c.due);
    const i = index.get(k);
    if (i !== undefined) out[i]++;
  }
  return out;
}

/** Точность за последние days дней: доля ответов не «Снова» среди повторений (карточки в состоянии review). */
export function accuracy(reviews: ReviewLog[], now: number, days = 30): { pct: number | null; n: number } {
  const from = now - days * DAY;
  const rs = reviews.filter((r) => r.at >= from && r.state === "review");
  if (!rs.length) return { pct: null, n: 0 };
  return { pct: Math.round((100 * rs.filter((r) => r.grade > 1).length) / rs.length), n: rs.length };
}

/**
 * Иероглифы, которые умеешь писать: из слов, у которых карточка «написание» в повторении
 * (прошла заучивание) и не просрочена сильно — устойчивость не меньше дня.
 */
export function writableChars(words: { id: string; han: string }[], card: (id: string) => Card | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    const c = card(w.id);
    if (c && c.state === "review" && c.stability >= 1) for (const ch of w.han) if (/\p{Script=Han}/u.test(ch)) out.add(ch);
  }
  return out;
}

/** Календарь: последние weeks недель по 7 дней (столбцы — недели, с понедельника), значение — число ответов. */
export function calendar(days: Map<string, DayStat>, now: number, weeks = 18): { key: string; count: number; future: boolean }[][] {
  const d = new Date(now - SHIFT);
  const dow = (d.getDay() + 6) % 7; // 0 = понедельник
  const start = -(weeks - 1) * 7 - dow;
  const cols: { key: string; count: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const off = start + w * 7 + i;
      const key = dayShift(now, off);
      col.push({ key, count: days.get(key)?.count ?? 0, future: off > 0 });
    }
    cols.push(col);
  }
  return cols;
}
