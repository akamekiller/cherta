/** Состояние приложения: колоды, карточки, правки, настройки, очередь занятия. */
import { schedule, newCard, type Card, type Grade } from "./core/fsrs.ts";
import { loadDeck, wordId, type Deck, type DeckFile, type Word } from "./core/deck.ts";
import { applyEdit, isEmptyEdit, type WordEdit, type DictEntry } from "./core/edits.ts";
import { parseIndex, dictShardOf, shardFile, type DictIndex, type DictArticle } from "./core/dict.ts";
import * as store from "./store.ts";

const MIN = 60_000;
const LEARN_AHEAD = 20 * MIN; // как в Anki: шаги заучивания показываем чуть раньше срока

export type DeckInfo = { id: string; title: string; subtitle: string; lang: string; count: number; user?: boolean };

export const app = {
  builtinDecks: [] as DeckInfo[],
  userDecks: [] as store.UserDeck[],
  decks: [] as DeckInfo[],
  baseDeck: null as Deck | null,  // колода как в данных
  deck: null as Deck | null,      // колода с правками пользователя
  cards: new Map<string, Card>(),
  edits: new Map<string, WordEdit>(),
  settings: { ...store.DEFAULT_SETTINGS } as store.Settings,
  day: { day: "", newCount: 0 } as store.DayCounter,
};

/** День начинается в 4 утра, как в Anki. */
export function dayKey(t = Date.now()): string {
  const d = new Date(t - 4 * 3_600_000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function rollDay() {
  const k = dayKey();
  if (app.day.day !== k) app.day = { day: k, newCount: 0 };
}

export async function init() {
  const [settings, cards, day, edits, userDecks] = await Promise.all([
    store.loadSettings(), store.allCards(), store.getMeta<store.DayCounter>("day"), store.allEdits(), store.allUserDecks(),
  ]);
  app.settings = settings;
  app.cards = cards;
  app.edits = edits;
  app.userDecks = userDecks;
  if (day) app.day = day;
  rollDay();
  const idx = await fetch("data/decks/index.json");
  if (!idx.ok) throw new Error("Не удалось загрузить список колод");
  app.builtinDecks = await idx.json();
  rebuildDeckList();
  const id = app.decks.some((d) => d.id === settings.deck) ? settings.deck : app.decks[0].id;
  await loadDeckById(id);
}

function rebuildDeckList() {
  app.decks = [
    ...app.builtinDecks,
    ...app.userDecks.map((d) => ({ id: d.id, title: d.title, subtitle: "Своя колода", lang: "zh", count: d.words.length, user: true })),
  ];
}

async function fetchDeckFile(id: string): Promise<DeckFile> {
  const ud = app.userDecks.find((d) => d.id === id);
  if (ud) return { id: ud.id, title: ud.title, lang: "zh", words: ud.words };
  const res = await fetch(`data/decks/${id}.json`);
  if (!res.ok) throw new Error("Не удалось загрузить колоду");
  return res.json();
}

async function loadDeckById(id: string) {
  app.baseDeck = loadDeck(await fetchDeckFile(id));
  applyEdits();
}

function applyEdits() {
  const b = app.baseDeck;
  app.deck = b ? { ...b, words: b.words.map((w) => applyEdit(w, app.edits.get(w.id))) } : null;
}

export async function switchDeck(id: string) {
  await loadDeckById(id);
  await updateSettings({ deck: id });
}

/** Перечитать всё из хранилища (после импорта или сброса). */
export async function reloadAll() {
  app.settings = await store.loadSettings();
  app.cards = await store.allCards();
  app.edits = await store.allEdits();
  app.userDecks = await store.allUserDecks();
  app.day = (await store.getMeta<store.DayCounter>("day")) ?? { day: "", newCount: 0 };
  rollDay();
  rebuildDeckList();
  const id = app.decks.some((d) => d.id === app.settings.deck) ? app.settings.deck : app.decks[0].id;
  await loadDeckById(id);
}

export const words = () => app.deck?.words ?? [];
export const cardOf = (w: Word) => app.cards.get(w.id);
export const editOf = (id: string) => app.edits.get(id);
export const isHidden = (w: Word) => !!app.edits.get(w.id)?.hidden;
/** Исходный вариант слова (без правок) — для «Вернуть как было». */
export const baseWord = (id: string) => app.baseDeck?.words.find((w) => w.id === id);
const active = () => words().filter((w) => !isHidden(w));

/* ---------- правки ---------- */

export async function saveEdit(id: string, patch: Partial<Omit<WordEdit, "id" | "updatedAt">>) {
  const e: WordEdit = { ...(app.edits.get(id) ?? { id, updatedAt: 0 }), ...patch, id, updatedAt: Date.now() };
  for (const k of ["ru", "py", "note"] as const) if (e[k] !== undefined && !e[k]!.trim()) delete e[k];
  if (!e.hidden) delete e.hidden;
  if (isEmptyEdit(e)) { app.edits.delete(id); await store.deleteEdit(id); }
  else { app.edits.set(id, e); await store.putEdit(e); }
  applyEdits();
}

export async function revertEdit(id: string) {
  app.edits.delete(id);
  await store.deleteEdit(id);
  applyEdits();
}

/* ---------- свои колоды ---------- */

let hskAll: DictEntry[] | null = null;
/** Все слова встроенных колод (HSK) — для поиска при составлении своих колод. Грузится по требованию. */
async function loadHsk(): Promise<DictEntry[]> {
  if (!hskAll) {
    const seen = new Set<string>();
    const all: DictEntry[] = [];
    for (const d of app.builtinDecks) {
      const f: DeckFile = await (await fetch(`data/decks/${d.id}.json`)).json();
      for (const [han, py, ru] of f.words) if (!seen.has(han)) { seen.add(han); all.push({ han, py, ru, level: d.title }); }
    }
    hskAll = all;
  }
  return hskAll;
}

/** Слова HSK с учётом правок пользователя. */
export async function hskEntries(): Promise<DictEntry[]> {
  const all = await loadHsk();
  return all.map((e) => {
    const ed = app.edits.get(wordId("zh", e.han));
    return ed && (ed.py || ed.ru) ? { ...e, py: ed.py || e.py, ru: ed.ru || e.ru } : e;
  });
}

/** Слово → пиньинь и значение по HSK (с учётом правок). */
export async function hskLookup() {
  const map = new Map((await hskEntries()).map((e) => [e.han, e]));
  return (han: string) => map.get(han);
}

/** Добавить или убрать слово из своей колоды. */
export async function toggleInUserDeck(deckId: string, row: [string, string, string]) {
  const d = app.userDecks.find((x) => x.id === deckId);
  if (!d) return;
  const has = d.words.some((w) => w[0] === row[0]);
  await saveUserDeck({ ...d, words: has ? d.words.filter((w) => w[0] !== row[0]) : [...d.words, row] });
}

export async function saveUserDeck(d: store.UserDeck) {
  await store.putUserDeck(d);
  app.userDecks = await store.allUserDecks();
  rebuildDeckList();
  if (app.deck?.id === d.id) await loadDeckById(d.id);
}

export async function removeUserDeck(id: string) {
  await store.deleteUserDeck(id);
  app.userDecks = await store.allUserDecks();
  rebuildDeckList();
  if (app.deck?.id === id) await switchDeck(app.decks[0].id);
}

/* ---------- очередь ---------- */

export function counts() {
  rollDay();
  const now = Date.now();
  let due = 0, learning = 0, review = 0;
  const list = active();
  for (const w of list) {
    const c = cardOf(w);
    if (!c) continue;
    if (c.state === "review") { review++; if (c.due <= now) due++; }
    else if (c.due <= now + LEARN_AHEAD) learning++;
  }
  const unseen = list.filter((w) => !cardOf(w)).length;
  const newLeft = Math.min(unseen, Math.max(0, app.settings.newPerDay - app.day.newCount));
  return { due, learning, review, newLeft, unseen, total: due + learning + newLeft };
}

/** Следующее слово: просроченные шаги → повторения → новые → шаги заранее. */
export function nextWord(excludeId?: string): Word | null {
  rollDay();
  const now = Date.now();
  const list = active();
  const seen = list.map((w) => [w, cardOf(w)] as const).filter((x): x is readonly [Word, Card] => !!x[1]);
  const earliest = (l: (readonly [Word, Card])[]) => l.sort((a, b) => a[1].due - b[1].due)[0]?.[0] ?? null;
  const learningNow = seen.filter(([w, c]) => c.state !== "review" && c.due <= now && w.id !== excludeId);
  if (learningNow.length) return earliest(learningNow);
  const reviews = seen.filter(([, c]) => c.state === "review" && c.due <= now);
  if (reviews.length) return earliest(reviews);
  if (app.day.newCount < app.settings.newPerDay) {
    const fresh = list.find((w) => !cardOf(w));
    if (fresh) return fresh;
  }
  const ahead = seen.filter(([, c]) => c.state !== "review" && c.due <= now + LEARN_AHEAD);
  const notSame = ahead.filter(([w]) => w.id !== excludeId);
  return earliest(notSame.length ? notSame : ahead);
}

export function preview(w: Word, g: Grade, now = Date.now()): Card {
  return schedule(cardOf(w) ?? newCard(w.id, now), g, now);
}

export async function answer(w: Word, g: Grade, mistakes: number) {
  rollDay();
  const now = Date.now();
  const before = cardOf(w);
  const next = schedule(before ?? newCard(w.id, now), g, now);
  if (!before) app.day = { ...app.day, newCount: app.day.newCount + 1 };
  app.cards.set(w.id, next);
  await store.saveAnswer(next, { id: w.id, at: now, grade: g, state: before?.state ?? "new", mistakes }, app.day);
}

export async function updateSettings(patch: Partial<store.Settings>) {
  app.settings = { ...app.settings, ...patch };
  await store.setMeta("settings", app.settings);
}

export function nextDueTime(): number | null {
  const now = Date.now();
  const list = active().map(cardOf).filter((c): c is Card => !!c && c.due > now).map((c) => c.due);
  return list.length ? Math.min(...list) : null;
}

/* ---------- словарь (大БКРС) ---------- */

type DictMeta = { v: string; count: number; shards: number };
/** Данные словаря лежат в отдельном репозитории (cherta-dict, свой GitHub Pages), чтобы не раздувать историю основного.
 * Локально (npm start) сначала пробуем папку dict/ рядом с проектом. */
export const DICT_REMOTE = "https://akamekiller.github.io/cherta-dict/";
const DICT_BASES = location.hostname.endsWith("github.io") ? [DICT_REMOTE] : ["dict/", DICT_REMOTE];
const META_LS = "cherta.dictMeta";
let dictBase = DICT_BASES[0];
let dictMeta: Promise<DictMeta> | null = null;
let dictIdx: Promise<DictIndex> | null = null;
const dictShards = new Map<number, Promise<Record<string, DictArticle>>>();

async function fetchMeta(): Promise<DictMeta> {
  for (const base of DICT_BASES) {
    try {
      const r = await fetch(`${base}meta.json`, { cache: "no-cache" });
      if (!r.ok) continue;
      const m: DictMeta = await r.json();
      dictBase = base;
      try { localStorage.setItem(META_LS, JSON.stringify({ base, m })); } catch { /* */ }
      return m;
    } catch { /* следующий адрес */ }
  }
  // офлайн: последняя известная версия — файлы с ней лежат в кэше service worker
  try {
    const saved = JSON.parse(localStorage.getItem(META_LS) ?? "null") as { base: string; m: DictMeta } | null;
    if (saved) { dictBase = saved.base; return saved.m; }
  } catch { /* */ }
  throw new Error("Словарь не найден");
}

function loadDictMeta(): Promise<DictMeta> {
  if (!dictMeta) {
    dictMeta = fetchMeta();
    dictMeta.catch(() => { dictMeta = null; });
  }
  return dictMeta;
}

/** Индекс всего словаря. Грузится один раз по требованию (~3,5 МБ сжатым), офлайн — из кэша SW. */
export function dictIndex(): Promise<DictIndex> {
  if (!dictIdx) {
    dictIdx = loadDictMeta().then(async (m) => {
      const r = await fetch(`${dictBase}index.tsv?v=${m.v}`);
      if (!r.ok) throw new Error("Не удалось загрузить словарь");
      return parseIndex(await r.text());
    });
    dictIdx.catch(() => { dictIdx = null; });
  }
  return dictIdx;
}

/** Статья словаря или null, если слова нет. */
export async function dictArticle(han: string): Promise<DictArticle | null> {
  const m = await loadDictMeta();
  const n = dictShardOf(han, m.shards);
  let p = dictShards.get(n);
  if (!p) {
    p = fetch(`${dictBase}${shardFile(n)}?v=${m.v}`).then((r) => {
      if (!r.ok) throw new Error("Не удалось загрузить статью");
      return r.json();
    });
    p.catch(() => dictShards.delete(n));
    dictShards.set(n, p);
  }
  return (await p)[han] ?? null;
}
