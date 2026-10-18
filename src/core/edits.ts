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

export type DictEntry = { han: string; py: string; ru: string; level?: string };

/**
 * Поиск по словам для добавления в колоду: иероглифы, пиньинь (с тонами или без), русский.
 * Точные совпадения выше, затем начинающиеся с запроса, затем содержащие.
 */
export function searchEntries(entries: DictEntry[], query: string, limit = 40): DictEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isHan = /\p{Script=Han}/u.test(q);
  const qk = q.normalize("NFD").replace(/u\u0308/g, "v").replace(/[\u0300-\u036f]/g, "").replace(/[\s\d']/g, "");
  const scored: [number, number, DictEntry][] = [];
  entries.forEach((e, i) => {
    let score = -1;
    if (isHan) {
      if (e.han === q) score = 0; else if (e.han.startsWith(q)) score = 1; else if (e.han.includes(q)) score = 2;
    } else {
      const pk = e.py.replace(/[\d\s/]/g, "");
      const ru = e.ru.toLowerCase();
      const words = ru.split(/[^\p{L}-]+/u);
      if (qk && pk === qk) score = 0;
      else if (words.includes(q)) score = 1;
      else if (qk && pk.startsWith(qk)) score = 2;
      else if (words.some((w) => w.startsWith(q))) score = 3;
      else if (q.includes(" ") && ru.includes(q)) score = 4; // фразу ищем целиком; одно слово — только с начала слова («учиться» ≠ «сл-учиться»)
    }
    if (score >= 0) scored.push([score, i, e]);
  });
  scored.sort((a, b) => a[0] - b[0] || a[2].han.length - b[2].han.length || a[1] - b[1]);
  return scored.slice(0, limit).map((x) => x[2]);
}
