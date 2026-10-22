/**
 * Автокопии прогресса на этом устройстве: отдельная база IndexedDB (не та, где живёт сам прогресс),
 * раз в день и перед заменой/сбросом. Хранится 5 последних. Если основная база повредится — прогресс можно вернуть.
 */
import { exportAll, importAll } from "./store.ts";

const DB = "cherta-backup";
const KEEP = 5;
export type Snap = { at: number; label: string; cards: number; json: string };

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore("snaps", { keyPath: "at" });
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
const done = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function listSnaps(): Promise<Omit<Snap, "json">[]> {
  try {
    const db = await open();
    const all = await done(db.transaction("snaps").objectStore("snaps").getAll()) as Snap[];
    return all.map(({ at, label, cards }) => ({ at, label, cards })).sort((a, b) => b.at - a.at);
  } catch { return []; }
}

/** Сохранить копию. Пустой прогресс не копируем (чтобы он не вытеснил хорошие копии). */
export async function snapshot(label: string): Promise<boolean> {
  try {
    const json = await exportAll();
    const cards = (JSON.parse(json).cards as unknown[]).length;
    if (!cards) return false;
    const db = await open();
    const tx = db.transaction("snaps", "readwrite");
    const st = tx.objectStore("snaps");
    st.put({ at: Date.now(), label, cards, json } satisfies Snap);
    const keys = (await done(st.getAllKeys())) as number[];
    keys.sort((a, b) => b - a).slice(KEEP).forEach((k) => st.delete(k));
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    return true;
  } catch { return false; }
}

/** Раз в сутки при запуске. */
export async function dailySnapshot() {
  const last = (await listSnaps())[0];
  if (!last || Date.now() - last.at > 20 * 3600 * 1000) await snapshot("Ежедневная копия");
}

export async function restoreSnap(at: number): Promise<number> {
  const db = await open();
  const s = (await done(db.transaction("snaps").objectStore("snaps").get(at))) as Snap | undefined;
  if (!s) throw new Error("Копия не найдена.");
  await snapshot("Перед возвратом копии");
  return importAll(s.json);
}
