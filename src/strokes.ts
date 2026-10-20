/**
 * Данные черт, разбиты на 64 файла по коду символа. Файл грузится один раз и держится в памяти;
 * офлайн их кэширует service worker.
 *  - китайские: Make Me a Hanzi через hanzi-writer-data → data/strokes/NN.json;
 *  - японские (кана и кандзи, свой порядок черт): KanjiVG → data/strokes-ja/NN.json (scripts/build-strokes-ja.mjs).
 */
export type CharData = { strokes: string[]; medians: number[][][] };
export type StrokeLang = "zh" | "ja";
export const SHARDS = 64;

const shards = new Map<string, Promise<Record<string, CharData>>>();

export const shardOf = (ch: string) => (ch.codePointAt(0) ?? 0) % SHARDS;

/** Адрес файла черт — один и тот же для загрузки и для «Скачать для офлайна». */
export const strokeFile = (n: number, lang: StrokeLang = "zh") =>
  `data/${lang === "ja" ? "strokes-ja" : "strokes"}/${String(n).padStart(2, "0")}.json`;

function loadShard(n: number, lang: StrokeLang) {
  const key = `${lang}${n}`;
  let p = shards.get(key);
  if (!p) {
    p = fetch(strokeFile(n, lang)).then((r) => {
      if (!r.ok) throw new Error(`Нет файла черт ${n}`);
      return r.json();
    });
    p.catch(() => shards.delete(key));
    shards.set(key, p);
  }
  return p;
}

export async function getChar(ch: string, lang: StrokeLang = "zh"): Promise<CharData | null> {
  const shard = await loadShard(shardOf(ch), lang);
  return shard[ch] ?? null;
}

/** Загрузчик в формате hanzi-writer для нужного языка. */
export const loaderFor = (lang: StrokeLang = "zh") =>
  (ch: string, onLoad: (d: CharData) => void, onError: (e?: unknown) => void) => {
    getChar(ch, lang).then((d) => (d ? onLoad(d) : onError(new Error(`Нет данных черт для ${ch}`)))).catch(onError);
  };

export const charDataLoader = loaderFor("zh");

export function preload(text: string, lang: StrokeLang = "zh") {
  for (const ch of new Set(text)) loadShard(shardOf(ch), lang).catch(() => {});
}
