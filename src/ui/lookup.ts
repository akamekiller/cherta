/** Общее для «Слов» и карточки слова: слова не из колоды (HSK, словарь), статус слова, строка списка. */
import { cardOf, words, isHidden, hskEntries, editOf, dictIndex } from "../state.ts";
import { dictPyToNumeric, type DictIndex, type DictHit } from "../core/dict.ts";
import { applyEdit, type DictEntry } from "../core/edits.ts";
import { parseRef } from "../core/pinyin.ts";
import { wordId, type Word } from "../core/deck.ts";
import { formatGap, DAY } from "../core/fsrs.ts";
import { esc, pinyinHTML } from "./dom.ts";

/** Слово не из текущей колоды. raw — пиньинь БКРС как есть, если в формат колоды не перевёлся; base — без правок. */
export type OtherWord = Word & { level?: string; raw?: string; base?: Word };

const others = new Map<string, OtherWord>();
let hsk: DictEntry[] = [];
let hskLoading: Promise<DictEntry[]> | null = null;
let dict: DictIndex | null = null;

export const hskList = () => hsk;
export function loadHskList(): Promise<DictEntry[]> {
  hskLoading ??= hskEntries().then((e) => (hsk = e));
  return hskLoading;
}

export const dictNow = () => dict;
export async function loadDict(): Promise<DictIndex> {
  dict ??= await dictIndex();
  return dict;
}

/** Слово из HSK или словаря с наложенными правками пользователя. */
export function otherWord(han: string, py: string, ru: string, level?: string, raw?: string): OtherWord {
  let ref: Word["ref"] = [];
  try { if (py) ref = parseRef(py); } catch { py = ""; }
  const base: Word = { id: wordId("zh", han), han, py, ref, ru };
  const w: OtherWord = { ...applyEdit(base, editOf(base.id)), level, raw: py ? undefined : raw, base };
  others.set(w.id, w);
  return w;
}

export const fromHit = (h: DictHit) => otherWord(h.han, dictPyToNumeric(h.py, h.han) ?? "", h.ru, undefined, h.py);

/** Пересобрать слово после правки (у слов из колоды правки накладывает state). */
export function refreshOther(id: string) {
  const o = others.get(id);
  if (o?.base) others.set(id, { ...o, ...applyEdit(o.base, editOf(id)) });
}

export function findWord(id: string): Word | OtherWord | undefined {
  return words().find((x) => x.id === id) ?? others.get(id);
}

/** Найти или создать слово по иероглифам: колода → HSK → словарь. */
export async function wordByHan(han: string): Promise<Word | OtherWord> {
  const id = wordId("zh", han);
  const found = findWord(id);
  if (found) return found;
  await loadHskList();
  const e = hsk.find((x) => x.han === han);
  if (e) return otherWord(e.han, e.py, e.ru, e.level);
  try { await loadDict(); } catch { /* без словаря */ }
  const i = dict ? dict.han.indexOf(han) : -1;
  return i >= 0 ? fromHit({ i, han, py: dict!.py[i], ru: dict!.ru[i] }) : otherWord(han, "", "");
}

export const pyHTML = (w: Word | OtherWord) => w.ref.length ? pinyinHTML(w.ref) : `<span class="raw">${esc((w as OtherWord).raw ?? "")}</span>`;

export type Kind = "new" | "learn" | "review" | "hidden";
export function kind(w: Word): Kind {
  if (isHidden(w)) return "hidden";
  const c = cardOf(w);
  if (!c) return "new";
  return c.state === "review" ? "review" : "learn";
}

/** Подпись статуса и класс: «новое», «учу», интервал повторения, «скрыто». */
export function status(w: Word): [string, string] {
  const k = kind(w);
  if (k === "hidden") return ["скрыто", "hid"];
  if (k === "new") return ["новое", ""];
  if (k === "learn") return ["учу", "learn"];
  const c = cardOf(w)!;
  return [formatGap(Math.max(DAY, c.due - c.last)), "rev"];
}

/** Статус для любого слова: из колоды — как в колоде; карточка есть — по ней; иначе подпись (уровень HSK). */
export function statusAny(w: Word | OtherWord): [string, string] {
  if (words().some((x) => x.id === w.id) || cardOf(w)) return status(w);
  return [(w as OtherWord).level ?? "", "other"];
}

export type ViewMode = "list" | "grid";
export const itemHTML = (w: Word, st: string, cls: string, view: ViewMode) => view === "grid"
  ? `<button class="tile ${cls}" data-id="${esc(w.id)}" title="${esc(w.ru)}"><span class="h">${esc(w.han)}</span><span class="py">${pyHTML(w)}</span><span class="ru">${esc(w.ru)}</span></button>`
  : `<button class="item" data-id="${esc(w.id)}"><span class="h">${esc(w.han)}</span><span class="txt"><span class="py">${pyHTML(w)}</span><span class="ru">${esc(w.ru)}</span></span><span class="status ${cls}">${st}</span></button>`;
