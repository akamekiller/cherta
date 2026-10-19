/**
 * Хранилище на IndexedDB.
 * cards   — карточки FSRS (ключ id = "zh:人")
 * reviews — журнал ответов (для будущей подстройки FSRS и статистики)
 * meta    — настройки и счётчик дня
 * edits   — правки пользователя к словам (v2)
 * userDecks — свои колоды (v2)
 * Схема версионируется: DB_VERSION + миграции в onupgradeneeded.
 */
import type { Card, Grade } from "./core/fsrs.ts";
import { isPen, clampSize, type PenType } from "./core/pen.ts";
import type { ThemeChoice, CustomTheme } from "./theme.ts";
import type { WordEdit } from "./core/edits.ts";

/** Своя колода. group — заголовок группы в списке колод (например, «Standard Course HSK 1» для колод по урокам). */
export type UserDeck = { id: string; title: string; words: [string, string, string][]; createdAt: number; group?: string };

export type Settings = {
  newPerDay: number;
  pinyin: boolean;
  voice: boolean;
  deck: string;
  theme: ThemeChoice;
  custom?: CustomTheme | null;
  /** Перо для письма и цвет чернил ("auto" — цвет текста темы). */
  pen: PenType;
  ink: string;
  /** Оставлять свои верные черты вместо эталонных. */
  keepStrokes: boolean;
  /** Толщина пера: множитель 0.5–1.6. */
  penSize: number;
  /** Короткая вибрация при неверной черте (если телефон умеет). */
  vibrate: boolean;
  /** Цель на день: сколько карточек пройти. */
  dailyGoal: number;
  /** Настройки отдельных колод (id → настройки). */
  deckOpts: Record<string, DeckOpts>;
  /** Готовые колоды, которые пользователь добавил к себе (сначала список пуст). undefined — старые данные до этой настройки. */
  added?: string[];
  /** Подключённые встроенные курсы упражнений. */
  courses?: string[];
};
/** Счётчик новых слов за день: всего и по колодам (у каждой колоды свой лимит, как в Anki). */
export type DayCounter = { day: string; newCount: number; byDeck?: Record<string, number> };
/** Настройки колоды поверх данных: своё название, скрыта из списка, свой лимит новых слов. */
export type DeckOpts = { title?: string; hidden?: boolean; newPerDay?: number; skills?: string[] };
export type Review = { id: string; at: number; grade: Grade; state: Card["state"]; mistakes: number };

export const DEFAULT_SETTINGS: Settings = { newPerDay: 10, pinyin: true, voice: true, deck: "", theme: "auto", pen: "brush", ink: "auto", keepStrokes: true, penSize: 1, vibrate: true, dailyGoal: 30, deckOpts: {} };
const DB_NAME = "cherta";
const DB_VERSION = 2;
const EXPORT_FORMAT = "cherta-progress";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
      if (!db.objectStoreNames.contains("reviews")) db.createObjectStore("reviews", { autoIncrement: true });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      // v2: правки и свои колоды
      if (!db.objectStoreNames.contains("edits")) db.createObjectStore("edits", { keyPath: "id" });
      if (!db.objectStoreNames.contains("userDecks")) db.createObjectStore("userDecks", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // другая вкладка обновляет схему — закрываемся, чтобы не мешать
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => { dbp = null; reject(new Error("Закройте другие вкладки с «Чертой» и обновите страницу")); };
  });
  return dbp;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export async function allCards(): Promise<Map<string, Card>> {
  const db = await open();
  const list = await done(db.transaction("cards").objectStore("cards").getAll() as IDBRequest<Card[]>);
  return new Map(list.map((c) => [c.id, c]));
}

/** Сохранить ответ; возвращает ключ записи в журнале (для отмены). */
export async function saveAnswer(card: Card, review: Review, day: DayCounter): Promise<IDBValidKey> {
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"], "readwrite");
  tx.objectStore("cards").put(card);
  const req = tx.objectStore("reviews").add(review);
  tx.objectStore("meta").put(day, "day");
  await txDone(tx);
  return req.result;
}

/** Отменить ответ: вернуть карточку (или удалить новую), убрать запись из журнала, вернуть счётчик дня. */
export async function undoAnswer(id: string, before: Card | undefined, reviewKey: IDBValidKey, day: DayCounter): Promise<void> {
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"], "readwrite");
  if (before) tx.objectStore("cards").put(before); else tx.objectStore("cards").delete(id);
  tx.objectStore("reviews").delete(reviewKey);
  tx.objectStore("meta").put(day, "day");
  await txDone(tx);
}

export async function allReviews(): Promise<Review[]> {
  const db = await open();
  return done(db.transaction("reviews").objectStore("reviews").getAll() as IDBRequest<Review[]>);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return done(db.transaction("meta").objectStore("meta").get(key) as IDBRequest<T | undefined>);
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  await txDone(tx);
}

export async function loadSettings(): Promise<Settings> {
  const s: Settings = { ...DEFAULT_SETTINGS, ...((await getMeta<Partial<Settings>>("settings")) ?? {}) };
  if (!isPen(s.pen)) s.pen = DEFAULT_SETTINGS.pen;
  s.penSize = clampSize(s.penSize);
  if (!s.deckOpts || typeof s.deckOpts !== "object") s.deckOpts = {};
  return s;
}

const ALL = ["cards", "reviews", "meta", "edits", "userDecks"] as const;

export async function exportAll(): Promise<string> {
  const db = await open();
  const tx = db.transaction([...ALL]);
  const [cards, reviews, settings, day, ex, exsets, edits, userDecks] = await Promise.all([
    done(tx.objectStore("cards").getAll()),
    done(tx.objectStore("reviews").getAll()),
    done(tx.objectStore("meta").get("settings")),
    done(tx.objectStore("meta").get("day")),
    done(tx.objectStore("meta").get("ex")),
    done(tx.objectStore("meta").get("exsets")),
    done(tx.objectStore("edits").getAll()),
    done(tx.objectStore("userDecks").getAll()),
  ]);
  return JSON.stringify({ format: EXPORT_FORMAT, version: DB_VERSION, exportedAt: new Date().toISOString(), cards, reviews, settings, day, ex, exsets, edits, userDecks });
}

export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json);
  if (data?.format !== EXPORT_FORMAT || !Array.isArray(data.cards)) throw new Error("Это не файл прогресса «Черты».");
  const db = await open();
  const tx = db.transaction([...ALL], "readwrite");
  for (const s of ["cards", "reviews", "edits", "userDecks"] as const) tx.objectStore(s).clear();
  for (const c of data.cards) tx.objectStore("cards").put(c);
  for (const r of data.reviews ?? []) tx.objectStore("reviews").add(r);
  for (const e of data.edits ?? []) tx.objectStore("edits").put(e);
  for (const d of data.userDecks ?? []) tx.objectStore("userDecks").put(d);
  if (data.settings) tx.objectStore("meta").put(data.settings, "settings");
  if (data.day) tx.objectStore("meta").put(data.day, "day");
  if (data.ex) tx.objectStore("meta").put(data.ex, "ex");
  if (data.exsets) tx.objectStore("meta").put(data.exsets, "exsets");
  await txDone(tx);
  return data.cards.length;
}

/** Удаляет прогресс повторений. Правки и свои колоды остаются. */
export async function resetProgress(): Promise<void> {
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"], "readwrite");
  tx.objectStore("cards").clear();
  tx.objectStore("reviews").clear();
  tx.objectStore("meta").delete("day");
  await txDone(tx);
}

export async function allEdits(): Promise<Map<string, WordEdit>> {
  const db = await open();
  const list = await done(db.transaction("edits").objectStore("edits").getAll() as IDBRequest<WordEdit[]>);
  return new Map(list.map((e) => [e.id, e]));
}
export async function putEdit(e: WordEdit): Promise<void> {
  const db = await open();
  const tx = db.transaction("edits", "readwrite");
  tx.objectStore("edits").put(e);
  await txDone(tx);
}
export async function deleteEdit(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("edits", "readwrite");
  tx.objectStore("edits").delete(id);
  await txDone(tx);
}

export async function allUserDecks(): Promise<UserDeck[]> {
  const db = await open();
  const list = await done(db.transaction("userDecks").objectStore("userDecks").getAll() as IDBRequest<UserDeck[]>);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}
export async function putUserDeck(d: UserDeck): Promise<void> {
  const db = await open();
  const tx = db.transaction("userDecks", "readwrite");
  tx.objectStore("userDecks").put(d);
  await txDone(tx);
}
export async function deleteUserDeck(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("userDecks", "readwrite");
  tx.objectStore("userDecks").delete(id);
  await txDone(tx);
}

/** Просим браузер не удалять данные при нехватке места (важно для iPhone). */
export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
