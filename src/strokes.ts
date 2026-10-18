/**
 * Данные черт (Make Me a Hanzi через hanzi-writer-data), разбиты на 64 файла
 * по коду символа: data/strokes/NN.json. Файл грузится один раз и держится в памяти;
 * офлайн их кэширует service worker.
 */
export type CharData = { strokes: string[]; medians: number[][][] };
export const SHARDS = 64;

const shards = new Map<number, Promise<Record<string, CharData>>>();

export const shardOf = (ch: string) => (ch.codePointAt(0) ?? 0) % SHARDS;

function loadShard(n: number) {
  let p = shards.get(n);
  if (!p) {
    p = fetch(`data/strokes/${String(n).padStart(2, "0")}.json`).then((r) => {
      if (!r.ok) throw new Error(`Нет файла черт ${n}`);
      return r.json();
    });
    p.catch(() => shards.delete(n));
    shards.set(n, p);
  }
  return p;
}

export async function getChar(ch: string): Promise<CharData | null> {
  const shard = await loadShard(shardOf(ch));
  return shard[ch] ?? null;
}

/** Загрузчик в формате hanzi-writer. */
export function charDataLoader(ch: string, onLoad: (d: CharData) => void, onError: (e?: unknown) => void) {
  getChar(ch).then((d) => (d ? onLoad(d) : onError(new Error(`Нет данных черт для ${ch}`)))).catch(onError);
}

export function preload(text: string) {
  for (const ch of new Set(text)) loadShard(shardOf(ch)).catch(() => {});
}
