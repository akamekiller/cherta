/**
 * Импорт: что вставил человек — таблицу слов или обычный китайский текст, слова из текста, уровень текста.
 */
import { segment } from "./exercise.ts";

const HAN = /\p{Script=Han}/u;
const HAN_RUN = /[\p{Script=Han}]+/gu;
const ZH_PUNCT = /[。，！？、：；“”「」『』（）《》…]/;

/**
 * Похоже на обычный текст (а не на таблицу или список слов): есть китайская пунктуация внутри строки
 * или кусок из иероглифов длиннее 6 знаков без разделителей.
 */
export function looksLikeText(src: string): boolean {
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  // таблица: в большинстве строк есть табуляция, «|» или кириллица/латиница рядом с иероглифами
  const tabular = lines.filter((l) => /\t|\|/.test(l) || (HAN.test(l) && /[A-Za-zА-Яа-яЁё]/.test(l))).length;
  if (tabular >= lines.length * 0.6) return false;
  const han = lines.filter((l) => HAN.test(l));
  // список через запятые: «学习，老师，朋友» — короткие куски и только разделители
  const runs = han.flatMap((l) => l.match(HAN_RUN) ?? []);
  if (runs.every((r) => r.length <= 4) && han.every((l) => /^[\p{Script=Han}\s,，、;；]+$/u.test(l))) return false;
  return han.some((l) => ZH_PUNCT.test(l.replace(/[、，,]\s*$/, ""))) || han.some((l) => (l.match(HAN_RUN) ?? []).some((r) => r.length > 6));
}

export type TextWord = { w: string; n: number };

/**
 * Слова из текста по порядку первого появления, с числом повторов. has — есть ли слово в словаре
 * (самое длинное совпадение до maxLen знаков); то, что словарь не знает, идёт по одному иероглифу.
 */
export function wordsFromText(src: string, has: (w: string) => boolean, maxLen = 4): TextWord[] {
  const out = new Map<string, number>();
  for (const run of src.match(HAN_RUN) ?? []) {
    for (const w of segment(run, has, maxLen)) if (HAN.test(w)) out.set(w, (out.get(w) ?? 0) + 1);
  }
  return [...out].map(([w, n]) => ({ w, n }));
}

/**
 * Уровень текста 1–6: самый низкий уровень HSK, при котором известны 90% слов текста с уровнем
 * (слова без уровня — имена, редкие — не считаются). Нет слов с уровнем — 0.
 */
export function guessLevel(words: TextWord[], levelOf: (w: string) => number | undefined, share = 0.9): number {
  const lv: number[] = [];
  for (const { w, n } of words) {
    const l = levelOf(w);
    if (l) for (let i = 0; i < n; i++) lv.push(l);
  }
  if (!lv.length) return 0;
  lv.sort((a, b) => a - b);
  return Math.min(6, Math.max(1, lv[Math.min(lv.length - 1, Math.ceil(lv.length * share) - 1)]));
}

/** Название текста по умолчанию: первая строка без пунктуации, до 16 знаков. */
export function titleOf(src: string): string {
  const first = src.split(/\r?\n/).map((l) => l.trim()).find((l) => HAN.test(l)) ?? "";
  const cut = first.split(/[。！？!?\n]/)[0].replace(/[，、：；“”「」"]/g, " ").trim();
  return cut.length > 16 ? cut.slice(0, 15) + "…" : cut || "Мой текст";
}
