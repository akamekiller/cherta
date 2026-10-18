/**
 * Упражнения на перевод: предложения из базы примеров 大БКРС по уровням HSK (scripts/build_examples.py).
 *  ZH→RU — читаешь по-китайски, переводишь (можно вписать свой перевод — покажем, насколько близко к образцу), оцениваешь себя;
 *  RU→ZH — собираешь китайское предложение из плиток-слов (среди них пара лишних).
 */
export type ExItem = { zh: string; ru: string; t: string[] };
export type ExProgress = Record<string, { seen: number; ok: number; last: number }>;

const HAN = /\p{Script=Han}/u;
export const isWordTok = (t: string) => HAN.test(t);
/** Китайский текст без пунктуации и пробелов — для сравнения. */
export const zhKey = (s: string) => [...s].filter((c) => HAN.test(c) || /[0-9A-Za-z]/.test(c)).join("");

/** Плитки: слова предложения и distract лишних слов из пула (не совпадающих со словами предложения), перемешанные. */
export function tilesFor(item: ExItem, pool: string[], rnd: () => number, distract = 2): string[] {
  const words = item.t.filter(isWordTok);
  const extra: string[] = [];
  const have = new Set(words);
  for (let k = 0; k < 40 && extra.length < distract && pool.length; k++) {
    const w = pool[Math.floor(rnd() * pool.length)];
    if (!have.has(w) && !extra.includes(w)) extra.push(w);
  }
  const all = [...words, ...extra];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

/** Собранный ответ верен, если без пунктуации совпадает с предложением. */
export const checkAssembled = (answer: string[], item: ExItem) => zhKey(answer.join("")) === zhKey(item.zh);

/** Насколько свой русский перевод близок к образцу: доля общих слов (по основе из первых 5 букв), 0..1. */
export function ruCloseness(mine: string, ref: string): number {
  const stems = (s: string) => new Set(s.toLowerCase().replace(/ё/g, "е").split(/[^а-яa-z0-9]+/).filter((w) => w.length > 1).map((w) => w.slice(0, Math.max(3, Math.min(5, w.length - 1)))));
  const a = stems(mine), b = stems(ref);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return (2 * common) / (a.size + b.size);
}

/** Урок: сначала ни разу не виденные (по порядку), затем с ошибками, затем давно виденные. */
export function pickLesson(items: ExItem[], prog: ExProgress, n = 10, prefix = ""): number[] {
  const key = (i: number) => prefix + items[i].zh;
  const idx = items.map((_, i) => i);
  const fresh = idx.filter((i) => !prog[key(i)]);
  const weak = idx.filter((i) => prog[key(i)] && prog[key(i)].ok < prog[key(i)].seen).sort((a, b) => prog[key(a)].last - prog[key(b)].last);
  const old = idx.filter((i) => prog[key(i)] && prog[key(i)].ok >= prog[key(i)].seen).sort((a, b) => prog[key(a)].last - prog[key(b)].last);
  // в уроке: до 3 повторов слабых, остальное — новые; если новых нет — слабые и старые
  const out = [...weak.slice(0, 3), ...fresh].slice(0, n);
  for (const i of [...weak.slice(3), ...old]) { if (out.length >= n) break; if (!out.includes(i)) out.push(i); }
  return out;
}

export function record(prog: ExProgress, key: string, ok: boolean, now = Date.now()): ExProgress {
  const p = prog[key] ?? { seen: 0, ok: 0, last: 0 };
  return { ...prog, [key]: { seen: p.seen + 1, ok: p.ok + (ok ? 1 : 0), last: now } };
}
