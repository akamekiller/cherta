/** Состояние приложения: колоды, карточки, правки, настройки, очередь занятия. */
import { schedule, newCard, DEFAULT_PARAMS, type Card, type Grade, type Params } from "./core/fsrs.ts";
import { loadDeck, wordId, type Deck, type DeckFile, type Word } from "./core/deck.ts";
import { applyEdit, isEmptyEdit, type WordEdit, type DictEntry } from "./core/edits.ts";
import { parseIndex, dictShardOf, shardFile, dictPyToNumeric, type DictIndex, type DictArticle } from "./core/dict.ts";
import type { Dialog } from "./core/exercise.ts";
import { cardId, normSkills, pickNext, queueCounts, ALL_SKILLS, DEFAULT_SKILLS, type Skill, type QPick } from "./core/skills.ts";
import { byDay, dayOf, type DayStat } from "./core/stats.ts";
import * as store from "./store.ts";
import { fetchText } from "./loading.ts";
import { makeBlocks, currentBlock, type Block, type Theme } from "./core/blocks.ts";

const MIN = 60_000;
const LEARN_AHEAD = 20 * MIN; // как в Anki: шаги заучивания показываем чуть раньше срока

export type DeckInfo = { id: string; title: string; subtitle: string; group?: string; lang: string; count: number; user?: boolean; hidden?: boolean; baseTitle: string };

export const app = {
  builtinDecks: [] as DeckInfo[],
  userDecks: [] as store.UserDeck[],
  decks: [] as DeckInfo[],
  baseDeck: null as Deck | null,  // колода как в данных
  deck: null as Deck | null,      // колода с правками пользователя
  cards: new Map<string, Card>(),
  edits: new Map<string, WordEdit>(),
  settings: { ...store.DEFAULT_SETTINGS } as store.Settings,
  day: { day: "", newCount: 0, byDeck: {} } as store.DayCounter,
  /** Ответы по дням (для серии, цели на день и статистики). */
  days: new Map<string, DayStat>(),
};

/** День начинается в 4 утра, как в Anki. */
export function dayKey(t = Date.now()): string {
  const d = new Date(t - 4 * 3_600_000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function rollDay() {
  const k = dayKey();
  if (app.day.day !== k) app.day = { day: k, newCount: 0, byDeck: {} };
  // старый формат без разбивки по колодам: всё, что выучено сегодня, — в текущей колоде
  if (!app.day.byDeck) app.day = { ...app.day, byDeck: app.day.newCount ? { [app.settings.deck]: app.day.newCount } : {} };
}

export async function init() {
  const [settings, cards, day, edits, userDecks, reviews] = await Promise.all([
    store.loadSettings(), store.allCards(), store.getMeta<store.DayCounter>("day"), store.allEdits(), store.allUserDecks(), store.allReviews(),
  ]);
  app.days = byDay(reviews);
  app.settings = settings;
  app.cards = cards;
  app.edits = edits;
  app.userDecks = userDecks;
  if (day) app.day = day;
  rollDay();
  const idx = await fetch("data/decks/index.json");
  if (!idx.ok) throw new Error("Не удалось загрузить список колод");
  app.builtinDecks = await idx.json();
  await migrateAdded();
  rebuildDeckList();
  await loadFirstDeck();
}

/** Текущая колода из настроек, иначе первая в списке; если колод нет — ничего. */
async function loadFirstDeck() {
  const id = app.decks.some((d) => d.id === app.settings.deck) ? app.settings.deck : app.decks[0]?.id;
  if (id) await loadDeckById(id);
  else { app.baseDeck = null; app.deck = null; }
}

/**
 * Раньше все готовые колоды были в списке сразу. Теперь список сначала пуст, колоды добавляются из каталога.
 * У тех, кто уже занимался, остаются колоды с прогрессом: текущая, со счётчиком новых за день и с настройками.
 */
async function migrateAdded() {
  if (app.settings.added) return;
  const keep = new Set<string>();
  if (app.cards.size) {
    const opts = app.settings.deckOpts ?? {};
    if (app.settings.deck) keep.add(app.settings.deck);
    for (const id of Object.keys(app.day.byDeck ?? {})) keep.add(id);
    for (const [id, o] of Object.entries(opts)) if (!o.hidden) keep.add(id);
    // и все колоды, в которых уже есть начатые слова (один раз, при переходе на пустой список)
    const started = new Set([...app.cards.keys()].map((k) => k.split("#")[0]));
    for (const d of app.builtinDecks) {
      if (keep.has(d.id) || opts[d.id]?.hidden) continue;
      try {
        const f = await fetchDeckFile(d.id);
        if (f.words.some(([han]) => started.has(wordId("zh", han)))) keep.add(d.id);
      } catch { /* офлайн — колоду можно добавить потом */ }
    }
  }
  const added = app.builtinDecks.map((d) => d.id).filter((id) => keep.has(id));
  await updateSettings({ added });
}

/** Добавить готовые колоды в свой список. */
export async function addBuiltinDecks(ids: string[]) {
  const added = [...new Set([...(app.settings.added ?? []), ...ids])].filter((id) => app.builtinDecks.some((d) => d.id === id));
  const opts = { ...(app.settings.deckOpts ?? {}) };
  for (const id of ids) if (opts[id]?.hidden) { const { hidden: _h, ...rest } = opts[id]; if (Object.keys(rest).length) opts[id] = rest; else delete opts[id]; }
  await updateSettings({ added, deckOpts: opts });
  rebuildDeckList();
  if (!app.deck) await loadFirstDeck();
}

/** Убрать готовую колоду из своего списка (прогресс по словам сохраняется). */
export async function removeBuiltinDeck(id: string) {
  await updateSettings({ added: (app.settings.added ?? []).filter((x) => x !== id) });
  rebuildDeckList();
  if (app.deck?.id === id) {
    app.deck = null; app.baseDeck = null;
    await loadFirstDeck();
  }
}

export const isAdded = (id: string) => app.decks.some((d) => d.id === id);

/* ---------- все колоды: для списка со счётчиками ---------- */

const deckFiles = new Map<string, Promise<DeckFile>>();

/** Колода с правками пользователя (для счётчиков в списке колод и экспорта). */
export async function deckById(id: string): Promise<Deck> {
  let f: Promise<DeckFile>;
  if (app.userDecks.some((d) => d.id === id)) f = fetchDeckFile(id);
  else {
    f = deckFiles.get(id) ?? fetchDeckFile(id);
    deckFiles.set(id, f);
    f.catch(() => deckFiles.delete(id));
  }
  const d = loadDeck(await f);
  return { ...d, title: app.decks.find((x) => x.id === id)?.title ?? d.title, words: d.words.map((w) => applyEdit(w, app.edits.get(w.id))) };
}

export type DeckCounts = { due: number; learning: number; review: number; newLeft: number; unseen: number; total: number };

/** Навыки колоды (как в Skritter): по умолчанию все четыре. */
export const deckSkills = (deckId: string): Skill[] => {
  const sk = normSkills(app.settings.deckOpts?.[deckId]?.skills);
  // у японского нет тонов
  if (app.decks.find((d) => d.id === deckId)?.lang !== "ja") return sk;
  const ja = sk.filter((x) => x !== "tone");
  return ja.length ? ja : ["write"];
};

/** Занятие одним уроком колоды (из экрана урока): остальные слова колоды в нём не участвуют. */
let focus: { deckId: string; idx: Set<number> } | null = null;
export const setFocus = (deckId: string | null, idx?: number[]) => { focus = deckId && idx ? { deckId, idx: new Set(idx) } : null; };
export const focusOn = () => focus;
const qWords = (deck: Deck) => deck.words.map((w, i) => ({ id: w.id, hidden: !!app.edits.get(w.id)?.hidden || (focus?.deckId === deck.id && !focus.idx.has(i)) }));

/* ---------- уроки по словам (блоки колоды) ---------- */

let themes: Record<string, Theme[]> = {};
let themesP: Promise<void> | null = null;
/** Темы готовых колод (data/themes.json) — грузятся один раз. */
export const loadThemes = () => (themesP ??= fetch("data/themes.json").then((r) => r.json()).then((j) => { themes = j; }).catch(() => { themesP = null; }));
/** Темы колоды (после loadThemes). */
export const themesOf = (deckId: string): Theme[] => themes[deckId] ?? [];
const blockCache = new WeakMap<Deck, Block[]>();
/** Уроки колоды: темы (если есть) или по 20 слов. */
export function deckBlocks(deck: Deck): Block[] {
  let b = blockCache.get(deck);
  if (!b) { b = makeBlocks(deck.words.map((w) => w.han), themes[deck.id]); blockCache.set(deck, b); }
  return b;
}
/** Слово начато (есть карточка хоть одного навыка) или скрыто — для выбора текущего урока. */
export const wordStarted = (w: Word) => !!app.edits.get(w.id)?.hidden || ALL_SKILLS.some((sk) => app.cards.has(cardId(w.id, sk)));
/** Слово выучено: карточка «написание» (или любого навыка) уже в повторении. */
export const wordKnown = (w: Word) => ALL_SKILLS.some((sk) => app.cards.get(cardId(w.id, sk))?.state === "review");
/** Неначатые слова текущего урока — из них берутся новые слова. */
function newPool(deck: Deck): Set<number> | undefined {
  if (focus?.deckId === deck.id) return undefined;
  const blocks = deckBlocks(deck);
  if (blocks.length < 2) return undefined;
  const cur = currentBlock(blocks, (i) => wordStarted(deck.words[i]));
  return cur < 0 ? undefined : new Set(blocks[cur].idx.filter((i) => !wordStarted(deck.words[i])));
}
const getCard = (id: string) => app.cards.get(id);
/** Порядок новых слов в колоде: вперемешку (по умолчанию) или как в колоде. */
export const deckOrder = (deckId: string): "random" | "seq" => (app.settings.deckOpts?.[deckId]?.order === "seq" ? "seq" : "random");
const qOpts = (deckId: string, exclude?: string, rnd?: () => number) => ({
  now: Date.now(), skills: deckSkills(deckId), learnAhead: LEARN_AHEAD, exclude,
  newWordsLeft: Math.max(0, newLimit(deckId) - newDone(deckId)),
  ...(deckOrder(deckId) === "random" ? { seed: `${dayKey()}:${deckId}`, rnd } : {}),
});

/** Счётчики колоды: к повторению, на шаге заучивания, новых на сегодня (по лимиту колоды). */
export function countsFor(deck: Deck): DeckCounts {
  rollDay();
  return queueCounts(qWords(deck), getCard, { ...qOpts(deck.id), ...(focus?.deckId === deck.id ? { newWordsLeft: focus.idx.size } : {}) });
}

export const newLimit = (deckId: string) => app.settings.deckOpts?.[deckId]?.newPerDay ?? app.settings.newPerDay;
export const newDone = (deckId: string) => app.day.byDeck?.[deckId] ?? 0;

/** Изменить настройки колоды (название, скрыта, лимит). Пустые значения удаляются. */
export async function setDeckOpts(id: string, patch: Partial<store.DeckOpts>) {
  const all = { ...(app.settings.deckOpts ?? {}) };
  const o: store.DeckOpts = { ...(all[id] ?? {}), ...patch };
  if (!o.title?.trim()) delete o.title; else o.title = o.title.trim();
  if (!o.hidden) delete o.hidden;
  if (o.newPerDay === undefined || o.newPerDay === app.settings.newPerDay) delete o.newPerDay;
  if (!o.skills || normSkills(o.skills).join() === DEFAULT_SKILLS.join()) delete o.skills; else o.skills = normSkills(o.skills);
  if (o.order !== "seq") delete o.order;
  if (Object.keys(o).length) all[id] = o; else delete all[id];
  await updateSettings({ deckOpts: all });
  rebuildDeckList();
  if (app.deck?.id === id) app.deck = { ...app.deck, title: app.decks.find((d) => d.id === id)?.title ?? app.deck.title };
}

/** Переименовать: своя колода меняется сама, у встроенной — своё название поверх. */
export async function renameDeck(id: string, title: string) {
  const ud = app.userDecks.find((d) => d.id === id);
  if (ud) { await saveUserDeck({ ...ud, title: title.trim() || ud.title }); return; }
  const base = app.decks.find((d) => d.id === id)?.baseTitle;
  await setDeckOpts(id, { title: title.trim() === base ? "" : title });
}

/** Удалить свою колоду или скрыть встроенную. Прогресс по словам сохраняется. */
export async function deleteDeck(id: string) {
  if (app.userDecks.some((d) => d.id === id)) {
    if (id === CHAR_DECK) await updateSettings({ charDeck: false });
    await removeUserDeck(id);
    await setDeckOpts(id, { title: "", hidden: false, newPerDay: undefined });
  } else {
    await removeBuiltinDeck(id);
  }
}

/** Удалить/убрать сразу несколько колод (например, всю группу). Прогресс по словам остаётся. */
export async function deleteDecks(ids: string[]) {
  const set = new Set(ids);
  const gone: Record<string, number> = {};
  for (const id of ids) if (app.userDecks.some((d) => d.id === id)) {
    if (id === CHAR_DECK) await updateSettings({ charDeck: false });
    await store.deleteUserDeck(id);
    gone[`ud:${id}`] = -Date.now();
  }
  if (Object.keys(gone).length) await updateSettings({ listAt: { ...(app.settings.listAt ?? {}), ...gone } });
  app.userDecks = app.userDecks.filter((d) => !set.has(d.id));
  const opts = { ...(app.settings.deckOpts ?? {}) };
  for (const id of ids) delete opts[id];
  await updateSettings({ added: (app.settings.added ?? []).filter((x) => !set.has(x)), deckOpts: opts });
  rebuildDeckList();
  if (app.deck && set.has(app.deck.id)) { app.deck = null; app.baseDeck = null; await loadFirstDeck(); }
}

/** Язык приложения: китайский или японский. Список колод, каталог и модули — только этого языка. */
export const appLang = (): "zh" | "ja" => (app.settings.lang === "ja" ? "ja" : "zh");

/** Переключить язык: своя текущая колода для каждого языка. */
export async function setAppLang(lang: "zh" | "ja") {
  if (lang === appLang()) return;
  const byLang = { ...(app.settings.deckByLang ?? {}), [appLang()]: app.deck?.id ?? app.settings.deck };
  await updateSettings({ lang, deckByLang: byLang, deck: byLang[lang] ?? "" });
  rebuildDeckList();
  setFocus(null);
  app.deck = null; app.baseDeck = null;
  await loadFirstDeck();
}

function rebuildDeckList() {
  const opts = app.settings.deckOpts ?? {};
  const lang = appLang();
  app.decks = [
    ...app.builtinDecks.filter((d) => (app.settings.added ?? []).includes(d.id) && (d.lang || "zh") === lang)
      .map((d) => ({ ...d, baseTitle: d.baseTitle ?? d.title, title: opts[d.id]?.title || d.baseTitle || d.title, hidden: false })),
    // свои колоды — группами: сначала без группы («Свои колоды»), затем по названию группы, внутри — по времени создания
    ...[...app.userDecks].filter((d) => (d.lang ?? "zh") === lang).sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.createdAt - b.createdAt)
      .map((d) => ({ id: d.id, title: d.title, baseTitle: d.title, subtitle: "Своя колода", group: d.group || "Свои колоды", lang: d.lang ?? "zh", count: d.words.length, user: true, hidden: !!opts[d.id]?.hidden })),
  ];
}

/** Колоды, видимые в списке; текущая — всегда. */
export const visibleDecks = () => app.decks.filter((d) => !d.hidden || d.id === app.deck?.id);

async function fetchDeckFile(id: string): Promise<DeckFile> {
  const ud = app.userDecks.find((d) => d.id === id);
  if (ud) return { id: ud.id, title: ud.title, lang: ud.lang ?? "zh", words: ud.words };
  const res = await fetch(`data/decks/${id}.json`);
  if (!res.ok) throw new Error("Не удалось загрузить колоду");
  return res.json();
}

async function loadDeckById(id: string) {
  await loadThemes();
  app.baseDeck = loadDeck(await fetchDeckFile(id));
  applyEdits();
}

function applyEdits() {
  const b = app.baseDeck;
  app.deck = b ? { ...b, title: app.decks.find((d) => d.id === b.id)?.title ?? b.title, words: b.words.map((w) => applyEdit(w, app.edits.get(w.id))) } : null;
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
  app.days = byDay(await store.allReviews());
  app.day = (await store.getMeta<store.DayCounter>("day")) ?? { day: "", newCount: 0, byDeck: {} };
  rollDay();
  await migrateAdded();
  rebuildDeckList();
  app.deck = null; app.baseDeck = null;
  await loadFirstDeck();
}

export const words = () => app.deck?.words ?? [];
export const cardOf = (w: Word) => app.cards.get(w.id);
export const editOf = (id: string) => app.edits.get(id);
export const isHidden = (w: Word) => !!app.edits.get(w.id)?.hidden;
/** Исходный вариант слова (без правок) — для «Вернуть как было». */
export const baseWord = (id: string) => app.baseDeck?.words.find((w) => w.id === id);

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
  if ((app.settings.listAt?.[`ud:${d.id}`] ?? 0) <= 0) await stamp(`ud:${d.id}`, true);
  app.userDecks = await store.allUserDecks();
  rebuildDeckList();
  if (app.deck?.id === d.id) await loadDeckById(d.id);
  else if (!app.deck) await loadFirstDeck(); // первая колода (например, после импорта в пустой список) — сразу текущая
}

export async function removeUserDeck(id: string) {
  await store.deleteUserDeck(id);
  await stamp(`ud:${id}`, false);
  app.userDecks = await store.allUserDecks();
  rebuildDeckList();
  if (app.deck?.id === id) { app.deck = null; app.baseDeck = null; await loadFirstDeck(); }
}

/** Параметры планировщика: свои (если подстроены и правильной длины) или по умолчанию. */
export const fsrsParams = (): Params => (app.settings.fsrsW?.length === DEFAULT_PARAMS.w.length ? { ...DEFAULT_PARAMS, w: app.settings.fsrsW } : DEFAULT_PARAMS);

/* ---------- иероглифы из моих слов ---------- */

export const CHAR_DECK = "u-chars";
let charBusy = false;
/**
 * Колода отдельных иероглифов: все иероглифы слов, которые уже начаты (есть хотя бы одна карточка).
 * Пиньинь и значение — из HSK (односложные слова), иначе из словаря. Пополняется сама.
 */
export async function refreshCharDeck(): Promise<number> {
  if (!app.settings.charDeck || charBusy) return 0;
  charBusy = true;
  try {
    const started = new Set([...app.cards.keys()].map((k) => k.split("#")[0].replace(/^zh:/, "")));
    const chars: string[] = [];
    for (const w of started) for (const c of w) if (/\p{Script=Han}/u.test(c) && !chars.includes(c)) chars.push(c);
    const old = app.userDecks.find((d) => d.id === CHAR_DECK);
    const have = new Set(old?.words.map((w) => w[0]) ?? []);
    const need = chars.filter((c) => !have.has(c));
    if (!need.length && old) return 0;
    const look = await hskLookup();
    let idx: DictIndex | null = null;
    const rows = [...(old?.words ?? [])];
    for (const c of need) {
      let py = "", ru = "";
      const h = look(c);
      if (h) { py = h.py; ru = h.ru; }
      else {
        try { idx ??= await dictIndex(); } catch { /* офлайн */ }
        const i = idx ? idx.han.indexOf(c) : -1;
        if (i >= 0) { py = dictPyToNumeric(idx!.py[i], c) ?? ""; ru = idx!.ru[i]; }
      }
      if (py && ru) rows.push([c, py, ru]);
    }
    await saveUserDeck({ id: CHAR_DECK, title: "Иероглифы из моих слов", words: rows, createdAt: old?.createdAt ?? Date.now(), group: "Иероглифы" });
    return rows.length - (old?.words.length ?? 0);
  } finally { charBusy = false; }
}

/* ---------- очередь ---------- */

export function counts(): DeckCounts {
  return app.deck ? countsFor(app.deck) : { due: 0, learning: 0, review: 0, newLeft: 0, unseen: 0, total: 0 };
}

/** Следующая карточка текущей колоды: слово и навык. */
export type NextCard = { word: Word; skill: Skill; fresh: QPick["fresh"] };
export function nextCard(excludeCardId?: string): NextCard | null {
  rollDay();
  const d = app.deck;
  if (!d) return null;
  // занятие одним уроком — выбор пользователя, дневной лимит новых слов на него не действует
  const lesson = focus?.deckId === d.id ? { newWordsLeft: focus.idx.size } : {};
  const p = pickNext(qWords(d), getCard, { ...qOpts(d.id, excludeCardId, Math.random), newPool: newPool(d), ...lesson });
  return p ? { word: d.words[p.word], skill: p.skill, fresh: p.fresh } : null;
}

export const skillCard = (w: Word, skill: Skill) => app.cards.get(cardId(w.id, skill));

export function preview(w: Word, skill: Skill, g: Grade, now = Date.now()): Card {
  const id = cardId(w.id, skill);
  return schedule(app.cards.get(id) ?? newCard(id, now), g, now, fsrsParams());
}

/** Что нужно, чтобы отменить ответ (как Ctrl+Z в Anki). */
export type UndoInfo = { id: string; before: Card | undefined; reviewKey: IDBValidKey; day: store.DayCounter; at: number; grade: Grade };

export async function answer(w: Word, skill: Skill, g: Grade, mistakes: number, fresh: QPick["fresh"]): Promise<UndoInfo> {
  rollDay();
  const now = Date.now();
  const id = cardId(w.id, skill);
  const before = app.cards.get(id);
  const dayBefore = app.day;
  const next = schedule(before ?? newCard(id, now), g, now, fsrsParams());
  if (fresh === "word") {
    const deckId = app.deck?.id ?? app.settings.deck;
    app.day = { ...app.day, newCount: app.day.newCount + 1, byDeck: { ...app.day.byDeck, [deckId]: (app.day.byDeck?.[deckId] ?? 0) + 1 } };
  }
  app.cards.set(id, next);
  const reviewKey = await store.saveAnswer(next, { id, at: now, grade: g, state: before?.state ?? "new", mistakes }, app.day);
  const k = dayOf(now), ds = app.days.get(k) ?? { count: 0, again: 0 };
  app.days.set(k, { count: ds.count + 1, again: ds.again + (g === 1 ? 1 : 0) });
  return { id, before, reviewKey, day: dayBefore, at: now, grade: g };
}

export async function undoAnswer(u: UndoInfo) {
  if (u.before) app.cards.set(u.id, u.before); else app.cards.delete(u.id);
  app.day = u.day;
  const ds = app.days.get(dayOf(u.at));
  if (ds) app.days.set(dayOf(u.at), { count: Math.max(0, ds.count - 1), again: Math.max(0, ds.again - (u.grade === 1 ? 1 : 0)) });
  await store.undoAnswer(u.id, u.before, u.reviewKey, u.day);
}

export function nextDueTime(): number | null {
  const d = app.deck;
  if (!d) return null;
  const now = Date.now();
  let best: number | null = null;
  for (const w of d.words) {
    if (isHidden(w)) continue;
    for (const sk of deckSkills(d.id)) {
      const c = app.cards.get(cardId(w.id, sk));
      if (c && c.due > now && (best === null || c.due < best)) best = c.due;
    }
  }
  return best;
}

/** Слова с частыми провалами («пиявки», как в Anki): забыты ≥ n раз хотя бы в одном навыке. */
export function lapsesOf(w: Word): number {
  return Math.max(0, ...ALL_SKILLS.map((sk) => app.cards.get(cardId(w.id, sk))?.lapses ?? 0));
}
export const LEECH = 4;
export const isLeech = (w: Word) => lapsesOf(w) >= LEECH;

export async function updateSettings(patch: Partial<store.Settings>) {
  const at = { ...(app.settings.listAt ?? {}) };
  stampDiff(at, "deck:", app.settings.added, patch.added);
  stampDiff(at, "course:", app.settings.courses, patch.courses);
  app.settings = { ...app.settings, ...patch, listAt: { ...at, ...(patch.listAt ?? {}) } };
  await store.setMeta("settings", app.settings);
}

/** Отметить, что добавлено/удалено (для синхронизации). */
function stampDiff(at: Record<string, number>, prefix: string, before: string[] | undefined, after: string[] | undefined) {
  if (!after) return;
  const now = Date.now(), b = new Set(before ?? []), a = new Set(after);
  for (const id of a) if (!b.has(id)) at[prefix + id] = now;
  for (const id of b) if (!a.has(id)) at[prefix + id] = -now;
}
const stamp = (key: string, on: boolean) => updateSettings({ listAt: { ...(app.settings.listAt ?? {}), [key]: on ? Date.now() : -Date.now() } });


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
      return parseIndex(await fetchText(`${dictBase}index.tsv?v=${m.v}`, "Словарь загружается (один раз)"));
    });
    dictIdx.catch(() => { dictIdx = null; });
  }
  return dictIdx;
}

/** Все файлы словаря с текущей версией — для «Скачать для офлайна» (адреса те же, что при обычной загрузке). */
export async function dictFiles(): Promise<{ dict: string[]; examples: string[] }> {
  const m = await loadDictMeta();
  const shards = Array.from({ length: m.shards }, (_, n) => shardFile(n));
  return {
    dict: [`${dictBase}index.tsv?v=${m.v}`, ...shards.map((f) => `${dictBase}${f}?v=${m.v}`)],
    examples: [`${dictBase}ex.json?v=${m.v}`, ...((m as { wordex?: number }).wordex ? shards.map((f) => `${dictBase}x/${f}?v=${m.v}`) : [])],
  };
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

/** Примеры к слову из базы 大БКРС (dict/x/, build_wordex.py): [[китайский, русский], …]; нет данных — пусто. */
const exShards = new Map<number, Promise<Record<string, [string, string][]>>>();
export async function dictWordEx(han: string): Promise<[string, string][]> {
  const m = await loadDictMeta();
  if (!(m as { wordex?: number }).wordex) return [];
  const n = dictShardOf(han, m.shards);
  let p = exShards.get(n);
  if (!p) {
    p = fetch(`${dictBase}x/${shardFile(n)}?v=${m.v}`).then((r) => (r.ok ? r.json() : {}));
    p.catch(() => exShards.delete(n));
    exShards.set(n, p);
  }
  try { return (await p)[han] ?? []; } catch { return []; }
}

/** Сколько карточек пройдено сегодня. */
export const todayCount = () => app.days.get(dayOf(Date.now()))?.count ?? 0;

/* ---------- упражнения: корпус предложений, диалоги, свои наборы ---------- */

let corpus: Promise<[string, string, string, number][]> | null = null;
/** Корпус предложений (dict/ex.json, публикуется вместе со словарём). */
export function exCorpus(): Promise<[string, string, string, number][]> {
  if (!corpus) {
    corpus = loadDictMeta().then(async (m) => {
      const r = await fetch(`${dictBase}ex.json?v=${m.v}`);
      if (!r.ok) throw new Error("Нет предложений для упражнений");
      return r.json();
    });
    corpus.catch(() => { corpus = null; });
  }
  return corpus;
}

let dialogs: Promise<Dialog[]> | null = null;
/** Диалоги из data/dialogs.json (написаны для приложения). */
export function exDialogs(): Promise<Dialog[]> {
  if (!dialogs) {
    dialogs = fetch("data/dialogs.json").then((r) => { if (!r.ok) throw new Error("нет диалогов"); return r.json(); });
    dialogs.catch(() => { dialogs = null; });
  }
  return dialogs;
}

/** Свои наборы упражнений (текст файла хранится как есть, разбирается при открытии). */
export type ExSetFile = { id: string; title: string; text: string; addedAt: number };
export const loadExSets = async () => (await store.getMeta<ExSetFile[]>("exsets")) ?? [];
export async function saveExSets(list: ExSetFile[]) {
  const before = (await loadExSets()).map((x) => x.id);
  await store.setMeta("exsets", list);
  const at = { ...(app.settings.listAt ?? {}) };
  stampDiff(at, "ex:", before, list.map((x) => x.id));
  await updateSettings({ listAt: at });
}
