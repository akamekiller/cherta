/**
 * Разбор иероглифа на части (данные Make Me a Hanzi, dictionary.txt, LGPL-3.0 → site/data/decomp.json).
 * Запись: [разложение IDS, ключ, тип, смысловой компонент, звуковой компонент].
 */
export type DecompRow = [string, string, string, string, string];
export type Decomp = { ids: string; radical: string; type: "" | "p" | "i" | "s"; semantic: string; phonetic: string };

const OPS = /[⿰-⿻]/u;

export function toDecomp(r: DecompRow | undefined): Decomp | null {
  if (!r) return null;
  const t = r[2] === "p" || r[2] === "i" || r[2] === "s" ? r[2] : "";
  return { ids: r[0], radical: r[1], type: t, semantic: r[3], phonetic: r[4] };
}

/** Составные части (листья разложения) по порядку, без повторов и без «？». */
export function parts(ids: string): string[] {
  const out: string[] = [];
  for (const c of ids) if (!OPS.test(c) && c !== "？" && !out.includes(c)) out.push(c);
  return out;
}

const LAYOUT: Record<string, string> = {
  "⿰": "слева направо", "⿱": "сверху вниз", "⿲": "три части слева направо", "⿳": "три части сверху вниз",
  "⿴": "внутри рамки", "⿵": "рамка сверху", "⿶": "рамка снизу", "⿷": "рамка слева",
  "⿸": "охват сверху слева", "⿹": "охват сверху справа", "⿺": "охват снизу слева", "⿻": "наложение",
};
/** Как сложен иероглиф: по первому знаку разложения. */
export const layoutName = (ids: string) => LAYOUT[[...ids][0]] ?? "";

export const TYPE_NAME: Record<Decomp["type"], string> = {
  p: "пиктограмма — рисунок предмета",
  i: "идеограмма — смысл складывается из частей",
  s: "фоноидеограмма — одна часть даёт смысл, другая звучание",
  "": "",
};
