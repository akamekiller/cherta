import { parseRef, type Syllable } from "./pinyin.ts";

export type Word = { id: string; han: string; py: string; ref: Syllable[]; ru: string };
export type DeckFile = { id: string; title: string; lang: "zh" | "ja"; words: [string, string, string][] };
export type Deck = { id: string; title: string; lang: "zh" | "ja"; words: Word[] };

/** TSV: заголовок word / pinyin / meaning_ru, дальше строки. */
export function parseTSV(text: string): [string, string, string][] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = lines[0]?.startsWith("word\t") ? lines.slice(1) : lines;
  return rows.map((l, i) => {
    const [w, py, ru] = l.split("\t");
    if (!w || !py || !ru) throw new Error(`Строка ${i + 2}: нужно три колонки через Tab`);
    return [w.trim(), py.trim(), ru.trim()];
  });
}

/** id карточки общий для всех колод: одно и то же слово учится один раз. */
export const wordId = (lang: string, han: string) => `${lang}:${han}`;

export function loadDeck(f: DeckFile): Deck {
  return {
    id: f.id, title: f.title, lang: f.lang,
    words: f.words.map(([han, py, ru]) => ({ id: wordId(f.lang, han), han, py, ref: parseRef(py), ru })),
  };
}

export function countChars(deck: Deck): number {
  return new Set(deck.words.flatMap((w) => [...w.han])).size;
}
