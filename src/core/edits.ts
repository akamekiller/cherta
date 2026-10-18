/**
 * Правки пользователя поверх данных колод. Базовые данные не меняются:
 * правка хранится отдельно и применяется при показе, её можно откатить.
 */
import { parseRef, toNumeric } from "./pinyin.ts";
import type { Word } from "./deck.ts";

export type WordEdit = {
  id: string;          // id слова: "zh:人"
  ru?: string;         // своё значение
  py?: string;         // свой пиньинь (формат колоды, с цифрами)
  note?: string;       // заметка, мнемоника
  hidden?: boolean;    // не показывать в занятиях
  updatedAt: number;
};

export function applyEdit(w: Word, e: WordEdit | undefined): Word {
  if (!e) return w;
  const out: Word = { ...w };
  if (e.ru) out.ru = e.ru;
  if (e.py) { try { out.ref = parseRef(e.py); out.py = e.py; } catch { /* битая правка — оставляем исходный */ } }
  return out;
}

/** Есть ли в правке что-то, кроме служебных полей. Пустую правку можно удалить. */
export function isEmptyEdit(e: WordEdit): boolean {
  return !e.ru && !e.py && !e.note && !e.hidden;
}

export type Lookup = (han: string) => { py: string; ru: string } | undefined;
export type ParsedDeck = { rows: [string, string, string][]; skipped: string[] };

/**
 * Разбор своей колоды. Каждая строка — одно слово:
 *   学习                              — пиньинь и значение подставятся из HSK
 *   学习 | xué xí | учиться           — всё своё (разделитель | или Tab)
 *   学习 | | учиться                  — своё значение, пиньинь из HSK
 * Можно вставить строку иероглифов через пробел или запятую: «人 大 学习».
 */
export function parseUserDeck(text: string, lookup: Lookup): ParsedDeck {
  const rows: [string, string, string][] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.includes("|") || line.includes("\t") ? [line.split(/[|\t]/).map((x) => x.trim())] : line.split(/[\s,，、;；]+/).filter(Boolean).map((x) => [x]);
    for (const [han, pyIn = "", ruIn = ""] of parts) {
      if (!han || !/\p{Script=Han}/u.test(han) || seen.has(han)) { if (han && !seen.has(han)) skipped.push(han); continue; }
      const known = lookup(han);
      const py = pyIn ? toNumeric(pyIn) : known?.py ?? null;
      const ru = ruIn || known?.ru || "";
      if (!py || !ru) { skipped.push(han); continue; }
      seen.add(han);
      rows.push([han, py, ru]);
    }
  }
  return { rows, skipped };
}
