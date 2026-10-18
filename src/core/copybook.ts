/**
 * Тетрадь прописей: какие иероглифы писать, сколько клеток с контуром, раскладка для печати.
 */
const HAN = /\p{Script=Han}/u;

/** Иероглифы по порядку первого появления (из слов колоды или своего текста), без повторов. */
export function uniqueChars(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) for (const ch of t) if (HAN.test(ch) && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  return out;
}

/** Клетки упражнения: первые trace — по бледному контуру, остальные — по памяти. */
export function cellPlan(total: number, trace: number): boolean[] {
  const n = Math.max(1, Math.min(20, Math.round(total)));
  const t = Math.max(0, Math.min(n, Math.round(trace)));
  return Array.from({ length: n }, (_, i) => i < t);
}

export type PrintCell = "sample" | "trace" | "empty";
export type PrintRow = { char: string; cells: PrintCell[] };
export type PrintOpts = { perRow: number; traces: number; rowsPerChar: number };

/**
 * Строки прописей: в каждой строке первая клетка — образец, затем traces бледных контуров, остальное пусто.
 * Во второй и следующих строках того же иероглифа — только контуры и пустые клетки (образец уже был).
 */
export function printRows(chars: string[], o: PrintOpts): PrintRow[] {
  const per = Math.max(4, Math.min(14, o.perRow));
  const rows: PrintRow[] = [];
  for (const char of chars) {
    for (let r = 0; r < Math.max(1, o.rowsPerChar); r++) {
      const cells: PrintCell[] = [];
      for (let i = 0; i < per; i++) {
        if (r === 0 && i === 0) cells.push("sample");
        else if (i < (r === 0 ? 1 : 0) + Math.max(0, o.traces)) cells.push("trace");
        else cells.push("empty");
      }
      rows.push({ char, cells });
    }
  }
  return rows;
}

/** Деление строк на страницы A4 (строк иероглифа не разрываем, если он помещается целиком). */
export function paginate(rows: PrintRow[], perPage: number): PrintRow[][] {
  const pages: PrintRow[][] = [];
  let cur: PrintRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].char === rows[i].char) j++;
    const group = rows.slice(i, j);
    if (cur.length + group.length > perPage && cur.length) { pages.push(cur); cur = []; }
    for (const r of group) { if (cur.length === perPage) { pages.push(cur); cur = []; } cur.push(r); }
    i = j;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Сколько строк влезает на A4 при данном числе клеток в строке (поля 12 мм, ширина 186 мм). */
export function rowsPerPage(perRow: number): number {
  const cell = 186 / Math.max(4, Math.min(14, perRow)); // мм
  return Math.max(1, Math.floor((297 - 24 - 10) / (cell + 1.5)));
}
