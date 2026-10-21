/**
 * «Скачать для офлайна»: очередь загрузок с ограничением одновременных запросов.
 * Сама загрузка и проверка кэша передаются снаружи (в приложении — fetch и Cache API), здесь только порядок,
 * пропуск уже скачанного, остановка и подсчёт прогресса — чтобы это можно было проверить тестами.
 */

export type QueueOpts = {
  /** уже есть в кэше — не качать */
  has: (url: string) => boolean;
  /** скачать один файл, вернуть число байт */
  get: (url: string, signal?: AbortSignal) => Promise<number>;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (p: QueueProgress) => void;
};

export type QueueProgress = { done: number; total: number; bytes: number; failed: number };

/** Скачать все ещё не скачанные адреса. Ошибки отдельных файлов не останавливают очередь, они считаются в failed. */
export async function runQueue(urls: string[], o: QueueOpts): Promise<QueueProgress & { aborted: boolean; failedUrls: string[] }> {
  const todo = [...new Set(urls)].filter((u) => !o.has(u));
  const p: QueueProgress = { done: 0, total: todo.length, bytes: 0, failed: 0 };
  const failedUrls: string[] = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length && !o.signal?.aborted) {
      const url = todo[i++];
      try {
        const n = await o.get(url, o.signal); // не «p.bytes += await …»: так сумма читается до ожидания и теряется
        p.bytes += n;
      } catch {
        if (o.signal?.aborted) break;
        p.failed++;
        failedUrls.push(url);
      }
      p.done++;
      o.onProgress?.({ ...p });
    }
  };
  o.onProgress?.({ ...p });
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? 6, todo.length || 1)) }, worker));
  return { ...p, aborted: !!o.signal?.aborted, failedUrls };
}

/** Сколько адресов из списка уже есть. */
export const countCached = (urls: string[], has: (u: string) => boolean) => new Set(urls.filter(has)).size;

/** Размер для людей: 950 КБ, 3,4 МБ, 120 МБ. */
export function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} МБ`;
}

/* ---------- пакеты озвучки (scripts/build-audio-packs.mjs) ---------- */

/** packs.json: пакет — файл f (метка версии h) и записи в нём по порядку: [слово, длина в байтах]. */
export type AudioPack = { f: string; h: string; w: [string, number][] };

/** Пакеты, в которых есть хоть одна ещё не скачанная запись. */
export const packsToFetch = (packs: AudioPack[], hasWord: (w: string) => boolean) =>
  packs.filter((p) => p.w.some(([w]) => !hasWord(w)));

/** Разрезать пакет на записи. Если длина не сходится (пакет от другой версии) — ошибка, а не битые записи. */
export function splitPack(buf: ArrayBuffer, w: [string, number][]): [string, ArrayBuffer][] {
  const total = w.reduce((s, [, n]) => s + n, 0);
  if (total !== buf.byteLength) throw new Error(`пакет: ${buf.byteLength} байт, ожидалось ${total}`);
  let at = 0;
  return w.map(([word, n]) => { const part = buf.slice(at, at + n); at += n; return [word, part]; });
}
