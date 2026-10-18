/**
 * Хранилище на IndexedDB.
 * cards   — карточки FSRS (ключ id = "zh:人")
 * reviews — журнал ответов (для будущей подстройки FSRS и статистики)
 * meta    — настройки и счётчик дня
 * Схема версионируется: DB_VERSION + миграции в onupgradeneeded.
 */
import type { Card, Grade } from "./core/fsrs.ts";
import type { ThemeChoice } from "./theme.ts";

export type Settings = {
  newPerDay: number;
  pinyin: boolean;
  voice: boolean;
  deck: string;
  theme: ThemeChoice;
};
export type DayCounter = { day: string; newCount: number };
export type Review = { id: string; at: number; grade: Grade; state: Card["state"]; mistakes: number };

export const DEFAULT_SETTINGS: Settings = { newPerDay: 10, pinyin: true, voice: true, deck: "hsk1", theme: "auto" };
const DB_NAME = "cherta";
const DB_VERSION = 1;
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export async function saveAnswer(card: Card, review: Review, day: DayCounter): Promise<void> {
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"], "readwrite");
  tx.objectStore("cards").put(card);
  tx.objectStore("reviews").add(review);
  tx.objectStore("meta").put(day, "day");
  await txDone(tx);
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
  return { ...DEFAULT_SETTINGS, ...((await getMeta<Partial<Settings>>("settings")) ?? {}) };
}

export async function exportAll(): Promise<string> {
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"]);
  const [cards, reviews, settings, day] = await Promise.all([
    done(tx.objectStore("cards").getAll()),
    done(tx.objectStore("reviews").getAll()),
    done(tx.objectStore("meta").get("settings")),
    done(tx.objectStore("meta").get("day")),
  ]);
  return JSON.stringify({ format: EXPORT_FORMAT, version: DB_VERSION, exportedAt: new Date().toISOString(), cards, reviews, settings, day });
}

export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json);
  if (data?.format !== EXPORT_FORMAT || !Array.isArray(data.cards)) throw new Error("Это не файл прогресса «Черты».");
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"], "readwrite");
  for (const s of ["cards", "reviews"] as const) tx.objectStore(s).clear();
  for (const c of data.cards) tx.objectStore("cards").put(c);
  for (const r of data.reviews ?? []) tx.objectStore("reviews").add(r);
  if (data.settings) tx.objectStore("meta").put(data.settings, "settings");
  if (data.day) tx.objectStore("meta").put(data.day, "day");
  await txDone(tx);
  return data.cards.length;
}

export async function resetProgress(): Promise<void> {
  const db = await open();
  const tx = db.transaction(["cards", "reviews", "meta"], "readwrite");
  tx.objectStore("cards").clear();
  tx.objectStore("reviews").clear();
  tx.objectStore("meta").delete("day");
  await txDone(tx);
}

/** Просим браузер не удалять данные при нехватке места (важно для iPhone). */
export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
