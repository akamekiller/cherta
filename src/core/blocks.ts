/**
 * Уроки по словам: колода делится на блоки-темы (data/themes.json) или, если тем нет, на блоки по 20 слов
 * по порядку колоды. Новые слова берутся из текущего блока — первого, где ещё есть неначатые слова,
 * поэтому колода проходится урок за уроком, а не вразброс по 500 словам.
 */
export type Theme = { s: string; t: string; w: string[] };
export type Block = { section: string; title: string; idx: number[] };

export const BLOCK = 20;

/** Блоки колоды. hans — иероглифы слов в порядке колоды. Колода до 30 слов — один блок. */
export function makeBlocks(hans: string[], themes?: Theme[], size = BLOCK): Block[] {
  const pos = new Map<string, number>();
  hans.forEach((h, i) => { if (!pos.has(h)) pos.set(h, i); });
  const out: Block[] = [];
  const used = new Set<number>();
  for (const th of themes ?? []) {
    const idx = th.w.map((h) => pos.get(h)).filter((i): i is number => i !== undefined && !used.has(i));
    if (!idx.length) continue;
    idx.forEach((i) => used.add(i));
    out.push({ section: th.s, title: th.t, idx });
  }
  const rest = hans.map((_, i) => i).filter((i) => !used.has(i));
  if (!themes?.length && hans.length <= 30) return hans.length ? [{ section: "", title: "Все слова", idx: rest }] : [];
  const sec = (from: number) => (themes?.length ? "Другие слова" : `Слова ${from + 1}–${Math.min(rest.length, from + size * 5)}`);
  for (let i = 0; i < rest.length; i += size) {
    const part = rest.slice(i, i + size);
    out.push({ section: sec(Math.floor(i / (size * 5)) * size * 5), title: themes?.length ? `Ещё слова ${i / size + 1}` : `Урок ${i / size + 1}`, idx: part });
  }
  return out;
}

/** Текущий блок: первый, где есть неначатое слово; всё начато — -1. */
export function currentBlock(blocks: Block[], started: (i: number) => boolean): number {
  return blocks.findIndex((b) => b.idx.some((i) => !started(i)));
}

export type BlockStat = { total: number; started: number; known: number };
/** Сколько слов блока начато и сколько уже в повторении (устойчиво). */
export function blockStat(b: Block, started: (i: number) => boolean, known: (i: number) => boolean): BlockStat {
  return { total: b.idx.length, started: b.idx.filter(started).length, known: b.idx.filter(known).length };
}
