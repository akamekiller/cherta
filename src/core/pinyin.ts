/**
 * Пиньинь: разбор эталона из колоды, разбор ввода пользователя, проверка по слогам.
 *
 * Эталон в колоде: слоги через пробел, тон цифрой 1–5 (5 = нейтральный),
 * ü пишется как v, допустимые варианты тона через "/": "bu2/4 ke4 qi5".
 * Ввод пользователя: цифры (ren2), знаки (rén), v / ü / u:, слитно или с пробелами.
 */

export type Syllable = { s: string; t: number; alt: number[] };
export type PinyinCheck = { ok: boolean; per: boolean[]; letters: boolean };

const MARKS: Record<string, string> = {
  a: "āáǎàa", e: "ēéěèe", i: "īíǐìi", o: "ōóǒòo", u: "ūúǔùu", v: "ǖǘǚǜü",
};
const TONE_COMBINING: Record<string, number> = { "\u0304": 1, "\u0301": 2, "\u030C": 3, "\u0300": 4 };

export function parseRef(str: string): Syllable[] {
  const out: Syllable[] = [];
  for (const syl of parseTokens(str)) {
    // эризация записана отдельным слогом «r5» (哪儿 = na3 r5) — присоединяем к предыдущему: nǎr
    if (syl.s === "r" && out.length) { out[out.length - 1].s += "r"; continue; }
    out.push(syl);
  }
  return out;
}

function parseTokens(str: string): Syllable[] {
  return str.trim().split(/\s+/).map((tok) => {
    const m = tok.match(/^([a-zü]+?)([1-5])((?:\/[1-5])*)$/i);
    if (!m) throw new Error(`Неверный слог пиньиня в колоде: "${tok}"`);
    return {
      s: m[1].toLowerCase().replace(/ü/g, "v"),
      t: Number(m[2]),
      alt: m[3] ? m[3].split("/").filter(Boolean).map(Number) : [],
    };
  });
}

/** Ставит знак тона: a/e → ou → последняя гласная. */
export function mark(s: string, t: number): string {
  const tone = t >= 1 && t <= 4 ? t - 1 : 4;
  let idx = -1;
  if (s.includes("a")) idx = s.indexOf("a");
  else if (s.includes("e")) idx = s.indexOf("e");
  else if (s.includes("ou")) idx = s.indexOf("o");
  else {
    for (let i = s.length - 1; i >= 0; i--) if ("iouv".includes(s[i])) { idx = i; break; }
  }
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += i === idx ? MARKS[c][tone] : c === "v" ? "ü" : c;
  }
  return out;
}

export function toMarked(ref: Syllable[]): string {
  return ref.map((x) => mark(x.s, x.t)).join(" ");
}

/** Только буквы без тонов: "xue2 xi2" → "xuexi". Для поиска. */
export function plain(ref: Syllable[]): string {
  return ref.map((x) => x.s).join("");
}

type ParsedInput = { letters: string; tones: { pos: number; t: number }[] };

export function parseInput(input: string): ParsedInput {
  const s = input.toLowerCase().replace(/u:/g, "v").normalize("NFD");
  let letters = "";
  const tones: { pos: number; t: number }[] = [];
  for (const ch of s) {
    if (ch === "\u0308") { if (letters.endsWith("u")) letters = letters.slice(0, -1) + "v"; continue; }
    if (TONE_COMBINING[ch]) { if (letters) tones.push({ pos: letters.length - 1, t: TONE_COMBINING[ch] }); continue; }
    if (/[a-z]/.test(ch)) { letters += ch; continue; }
    if (/[0-5]/.test(ch)) { if (letters) tones.push({ pos: letters.length - 1, t: Number(ch) || 5 }); continue; }
  }
  return { letters, tones };
}

export function checkPinyin(input: string, ref: Syllable[]): PinyinCheck {
  const u = parseInput(input);
  if (u.letters !== plain(ref)) return { ok: false, per: ref.map(() => false), letters: false };
  let pos = 0;
  const per: boolean[] = [];
  for (const syl of ref) {
    const a = pos, b = pos + syl.s.length;
    pos = b;
    const mine = u.tones.filter((x) => x.pos >= a && x.pos < b);
    const t = mine.length ? mine[mine.length - 1].t : 5;
    per.push(t === syl.t || syl.alt.includes(t));
  }
  return { ok: per.every(Boolean), per, letters: true };
}

/**
 * Пиньинь, введённый человеком, → формат колоды с цифрами.
 * Слоги разделяются пробелами: "xué xí", "xue2 xi2", "nü3 er2", "ma" (без тона = нейтральный).
 * Возвращает null, если строку не удалось разобрать.
 */
export function toNumeric(input: string): string | null {
  const tokens = input.trim().toLowerCase().replace(/u:/g, "v").split(/[\s']+/).filter(Boolean);
  if (!tokens.length) return null;
  const out: string[] = [];
  for (const tok of tokens) {
    if (/^[a-zü]+[1-5](\/[1-5])*$/.test(tok)) { out.push(tok.replace(/ü/g, "v")); continue; }
    let letters = "", tone = 5;
    for (const ch of tok.normalize("NFD")) {
      if (ch === "\u0308") { if (letters.endsWith("u")) letters = letters.slice(0, -1) + "v"; continue; }
      if (TONE_COMBINING[ch]) { tone = TONE_COMBINING[ch]; continue; }
      if (/[a-z]/.test(ch)) { letters += ch; continue; }
      return null;
    }
    if (!letters) return null;
    out.push(letters + tone);
  }
  const s = out.join(" ");
  try { parseRef(s); return s; } catch { return null; }
}

/** Нормализация строки для поиска по пиньиню: без тонов, ü→v, без пробелов и цифр. */
export function searchKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/u\u0308/g, "v").replace(/[\u0300-\u036f]/g, "")
    .replace(/u:/g, "v").replace(/[\s\d']/g, "");
}
