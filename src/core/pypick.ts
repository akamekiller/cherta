/**
 * Ввод пиньиня без клавиатуры: варианты слога (верный + похожие) и распознавание тона по жесту.
 */
import { SYLLABLES } from "./pinyin.ts";

const SPECIAL = ["m", "n", "ng", "hm", "hng", "r"];
const INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];

/** Похожие на слух или на письме начальные и конечные части. */
const INITIAL_GROUPS = [["z", "zh", "j"], ["c", "ch", "q"], ["s", "sh", "x"], ["b", "p"], ["d", "t"], ["g", "k", "h"], ["n", "l", "r"], ["f", "h"], ["m", "n"], ["y", "w", ""]];
const FINAL_GROUPS = [
  ["an", "ang", "en"], ["en", "eng", "in"], ["in", "ing", "ian"], ["ian", "iang", "ie"], ["uan", "uang", "un"], ["un", "ong", "uen"],
  ["u", "v", "ou", "uo"], ["e", "o", "ei"], ["ie", "ve", "ei"], ["ou", "uo", "ao"], ["ui", "ei", "uai"], ["ao", "ou", "iao"],
  ["iu", "ou", "iao"], ["a", "ai", "ao"], ["i", "ie", "ei"], ["ue", "ve", "ie"], ["ua", "uo", "a"], ["ong", "iong", "eng"],
  ["ang", "iang", "uang"], ["eng", "ing", "ong"], ["ai", "uai", "ei"], ["uan", "an", "ian"],
];

export function splitSyllable(s: string): [string, string] {
  for (const i of INITIALS) if (s.startsWith(i) && s.length > i.length) return [i, s.slice(i.length)];
  return ["", s];
}

/** Детерминированный генератор случайных чисел — варианты не перемешиваются при перерисовке. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Варианты слога: верный и count−1 похожих существующих слогов (другая начальная или конечная часть).
 * Эризация («nar») — варианты от основы с той же «r».
 */
export function syllableOptions(syl: string, count = 6, seed = syl): string[] {
  const rnd = seeded(seed);
  const er = syl.length > 1 && syl.endsWith("r") && !SYLLABLES.has(syl) ? "r" : "";
  const base = er ? syl.slice(0, -1) : syl;
  const [ini, fin] = splitSyllable(base);
  const near = new Set<string>();
  const add = (x: string) => { if (x !== base && SYLLABLES.has(x) && !SPECIAL.includes(x)) near.add(x); };
  for (const g of INITIAL_GROUPS) if (g.includes(ini)) for (const i2 of g) add(i2 + fin);
  for (const g of FINAL_GROUPS) if (g.includes(fin)) for (const f2 of g) add(ini + f2);
  // y/w — особая запись: yi/wu/yu… сравниваем и с «голыми» финалями
  if (ini === "" || ini === "y" || ini === "w") for (const g of FINAL_GROUPS) if (g.includes(fin)) for (const f2 of g) { add("y" + f2); add("w" + f2); }
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const picked = shuffle([...near]).slice(0, count - 1);
  // мало похожих — добираем слогами с той же начальной или конечной частью
  if (picked.length < count - 1) {
    const extra = shuffle([...SYLLABLES].filter((x) => x !== base && !picked.includes(x) && !SPECIAL.includes(x)
      && (splitSyllable(x)[0] === ini || splitSyllable(x)[1] === fin)));
    picked.push(...extra.slice(0, count - 1 - picked.length));
  }
  return shuffle([base, ...picked]).map((x) => x + er);
}

/**
 * Тон по жесту (точки экрана, y вниз): короткое касание — лёгкий (5);
 * провал вниз и подъём — 3; иначе по наклону: ровно — 1, вверх — 2, вниз — 4.
 * Направление по горизонтали не важно (можно вести справа налево).
 */
export function toneFromGesture(pts: [number, number][], tapSize = 12): number {
  if (pts.length < 2) return 5;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (len < tapSize) return 5;
  const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
  let lowI = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i][1] > pts[lowI][1]) lowI = i;
  const low = pts[lowI][1];
  const extentY = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  const extentX = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const extent = Math.max(extentX, extentY, 1);
  // 3-й: нижняя точка заметно ниже и начала, и конца, и не на краю пути
  const dipStart = low - y0, dipEnd = low - y1;
  if (lowI > 0 && lowI < pts.length - 1 && Math.min(dipStart, dipEnd) > 0.22 * extent) return 3;
  const angle = Math.atan2(y0 - y1, Math.abs(x1 - x0) || 0.0001) * 180 / Math.PI; // вверх — положительный
  if (angle > 22) return 2;
  if (angle < -22) return 4;
  return 1;
}

export type TypedSyl = { s: string; t: number | null };

/**
 * Набор с клавиатуры: буквы (тоны можно не писать) → n слогов для кнопок тонов.
 * Сначала по пробелам/апострофам (если слогов столько же), затем по эталону (буквы совпали),
 * затем делим на n настоящих слогов, иначе — примерно поровну. Тон из цифры или знака, если он был написан.
 */
export function splitTyped(input: string, ref: { s: string }[]): TypedSyl[] {
  const n = ref.length;
  const toks = input.trim().split(/[\s']+/).filter(Boolean).map(parseTok).filter((x) => x.s);
  if (!toks.length || !n) return [];
  if (toks.length === n) return toks.map(({ s, t }) => ({ s, t }));
  const letters = toks.map((x) => x.s).join("");
  // тоны, написанные внутри слитного ввода: позиция буквы → тон
  const toneAt = new Map<number, number>();
  let off = 0;
  for (const t of toks) { for (const [p, tt] of t.inner) toneAt.set(off + p, tt); off += t.s.length; }
  let cuts: number[] | null = null;
  if (letters === ref.map((x) => x.s).join("")) {
    cuts = []; let p = 0; for (const x of ref) { p += x.s.length; cuts.push(p); }
  } else cuts = segment(letters, n);
  if (!cuts) {
    cuts = [];
    for (let i = 1; i <= n; i++) cuts.push(Math.round((letters.length * i) / n));
  }
  const out: TypedSyl[] = [];
  let a = 0;
  for (const b of cuts) {
    let t: number | null = null;
    for (let i = a; i < b; i++) if (toneAt.has(i)) t = toneAt.get(i)!;
    out.push({ s: letters.slice(a, b), t });
    a = b;
  }
  return out.filter((x) => x.s);
}

type Tok = TypedSyl & { inner: [number, number][] };
const COMB: Record<string, number> = { "\u0304": 1, "\u0301": 2, "\u030C": 3, "\u0300": 4 };
function parseTok(tok: string): Tok {
  let s = "";
  const inner: [number, number][] = [];
  for (const ch of tok.toLowerCase().replace(/u:/g, "v").normalize("NFD")) {
    if (ch === "\u0308") { if (s.endsWith("u")) s = s.slice(0, -1) + "v"; continue; }
    if (COMB[ch]) { if (s) inner.push([s.length - 1, COMB[ch]]); continue; }
    if (/[a-z]/.test(ch)) { s += ch; continue; }
    if (/[1-5]/.test(ch) && s) inner.push([s.length - 1, Number(ch)]);
  }
  // тон всего токена — последний написанный; внутренние нужны для слитного ввода «xue2xi2»
  const last = inner.length ? inner[inner.length - 1][1] : null;
  return { s, t: last, inner };
}

const isSyl = (x: string) => SYLLABLES.has(x) || (x.length > 1 && x.endsWith("r") && SYLLABLES.has(x.slice(0, -1)));

/** Деление строки ровно на n настоящих слогов (первое найденное, длинные слоги раньше). */
function segment(s: string, n: number): number[] | null {
  const memo = new Map<string, number[] | null>();
  const go = (i: number, k: number): number[] | null => {
    if (k === 0) return i === s.length ? [] : null;
    const key = i + ":" + k;
    if (memo.has(key)) return memo.get(key)!;
    let res: number[] | null = null;
    for (let L = Math.min(7, s.length - i); L >= 1 && !res; L--) {
      if (!isSyl(s.slice(i, i + L))) continue;
      const rest = go(i + L, k - 1);
      if (rest) res = [i + L, ...rest];
    }
    memo.set(key, res);
    return res;
  };
  return go(0, n);
}
