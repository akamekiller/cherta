/**
 * Словарь (данные 大БКРС, собираются scripts/build_dict.py в site/data/dict/).
 * index.tsv: слово \t пиньинь (знаками, как в БКРС) \t краткое значение — по убыванию важности (HSK, частота).
 * NNN.json: статьи, шард = код первого символа % shards.
 * Здесь только чистая логика: разбор индекса, поиск, пиньинь БКРС → формат колоды, безопасный HTML статьи.
 */
import { searchKey, toNumeric, parseRef, SYLLABLES as SYL } from "./pinyin.ts";

export type DictIndex = {
  han: string[];
  py: string[];   // как в БКРС: «xuéxí», несколько чтений через запятую
  ru: string[];   // краткое значение
  pk: string[];   // ключ поиска по пиньиню первого чтения: «xuexi»
  pka: string[];  // ключи всех чтений через «|»: «|xuexi|» (для многочтенных)
  rl: string[];   // значение в нижнем регистре
};

/** Строка статьи: [уровень, html] или пример [уровень, html перевода, текст по-китайски]. */
export type DictRow = [number, string] | [number, string, string];
export type DictArticle = { p: string; r: DictRow[] };
export type DictHit = { i: number; han: string; py: string; ru: string };

/** Чтения из поля пиньиня БКРС: через «,» или «;», пометки в скобках отбрасываются. */
export function pyReadings(py: string): string[] {
  return py.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").split(/[,;]/).map((x) => x.trim()).filter((x) => x && !/[а-яё]/i.test(x));
}

export function parseIndex(text: string): DictIndex {
  const idx: DictIndex = { han: [], py: [], ru: [], pk: [], pka: [], rl: [] };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (!line) continue;
    const [han, py = "", ru = ""] = line.split("\t");
    if (!han) continue;
    const readings = pyReadings(py);
    idx.han.push(han);
    idx.py.push(py);
    idx.ru.push(ru);
    idx.pk.push(readings.length ? searchKey(readings[0]) : "");
    idx.pka.push(readings.length > 1 ? `|${readings.map(searchKey).join("|")}|` : "");
    idx.rl.push(ru.toLowerCase());
  }
  return idx;
}

const HAN = /\p{Script=Han}/u;

/**
 * Поиск по всему словарю. Иероглифы: точное → начинается с → содержит.
 * Латиница — пиньинь без тонов (слитно или через пробел): точное → начинается с.
 * Кириллица — по словам краткого значения: целое слово → начало слова → фраза целиком.
 * Внутри одного уровня совпадения — в порядке индекса (HSK, затем частота), чтобы редкие иероглифы не всплывали наверх.
 */
export function searchDict(idx: DictIndex, query: string, limit = 50, skip?: Set<string>): DictHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const buckets: number[][] = [[], [], [], [], [], []];
  const n = idx.han.length;
  if (HAN.test(q)) {
    const qh = [...q].filter((c) => HAN.test(c)).join("");
    for (let i = 0; i < n; i++) {
      const h = idx.han[i];
      if (h === qh) buckets[0].push(i);
      else if (h.startsWith(qh)) buckets[1].push(i);
      else if (h.includes(qh)) buckets[2].push(i);
    }
  } else if (/[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü:]/.test(q) && !/[а-яё]/.test(q)) {
    const qk = searchKey(q);
    if (!qk) return [];
    for (let i = 0; i < n; i++) {
      const k = idx.pk[i];
      if (k === qk || (idx.pka[i] && idx.pka[i].includes(`|${qk}|`))) buckets[0].push(i);
      else if (k.startsWith(qk)) buckets[1].push(i);
    }
  } else {
    const isPhrase = /\s/.test(q);
    for (let i = 0; i < n; i++) {
      const ru = idx.rl[i];
      const at = ru.indexOf(q);
      if (at < 0) continue;
      if (ru === q) { buckets[0].push(i); continue; }
      if (isPhrase) { buckets[at === 0 ? 1 : 3].push(i); continue; }
      // совпадение только с начала слова: «учиться» не находит «случиться»
      let p = at, best = -1;
      while (p >= 0) {
        const before = p === 0 ? "" : ru[p - 1];
        if (!before || !/[\p{L}-]/u.test(before)) {
          const after = ru[p + q.length] ?? "";
          const whole = !after || !/[\p{L}]/u.test(after);
          const lvl = whole ? (p === 0 ? 1 : 2) : (p === 0 ? 3 : 4);
          if (best < 0 || lvl < best) best = lvl;
          if (best === 1) break;
        }
        p = ru.indexOf(q, p + 1);
      }
      if (best >= 0) buckets[best].push(i);
    }
  }
  const out: DictHit[] = [];
  for (const b of buckets) {
    for (const i of b) {
      if (skip?.has(idx.han[i])) continue;
      out.push({ i, han: idx.han[i], py: idx.py[i], ru: idx.ru[i] });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type CharMode = "start" | "any";

/** Слова, в которых есть иероглиф (кроме самого слова except), в порядке индекса.
 * mode "start" — только начинающиеся с него, "any" — все, где он встречается. */
export function wordsWithChar(idx: DictIndex, ch: string, limit = 24, except?: string, mode: CharMode = "any"): DictHit[] {
  const out: DictHit[] = [];
  for (let i = 0; i < idx.han.length && out.length < limit; i++) {
    const h = idx.han[i];
    if (h.length > 1 && h !== except && (mode === "start" ? h.startsWith(ch) : h.includes(ch))) out.push({ i, han: h, py: idx.py[i], ru: idx.ru[i] });
  }
  return out;
}

/** Сколько слов с иероглифом: начинающихся с него и всего. */
export function countWithChar(idx: DictIndex, ch: string, except?: string): { start: number; any: number } {
  let start = 0, any = 0;
  for (const h of idx.han) {
    if (h.length < 2 || h === except || !h.includes(ch)) continue;
    any++;
    if (h.startsWith(ch)) start++;
  }
  return { start, any };
}

/** Статья по смыслам: значения без примеров и примеры, сгруппированные под своим значением. */
export type ArticleParts = {
  senses: DictRow[];
  examples: { sense: string | null; items: { zh: string; tr: string }[] }[];
  exampleCount: number;
};

export function splitArticle(rows: DictRow[]): ArticleParts {
  const senses: DictRow[] = [];
  const examples: ArticleParts["examples"] = [];
  let current: ArticleParts["examples"][number] | null = null;
  let lastSense: string | null = null;
  let count = 0;
  for (const r of rows) {
    if (isExample(r)) {
      if (!current) { current = { sense: lastSense, items: [] }; examples.push(current); }
      current.items.push({ zh: r[2], tr: r[1] });
      count++;
    } else {
      senses.push(r);
      lastSense = r[1];
      current = null;
    }
  }
  return { senses, examples, exampleCount: count };
}

export function lookupIndex(idx: DictIndex, han: string): DictHit | null {
  const i = idx.han.indexOf(han);
  return i < 0 ? null : { i, han, py: idx.py[i], ru: idx.ru[i] };
}

export const dictShardOf = (word: string, shards = 128) => (word.codePointAt(0) ?? 0) % shards;
export const shardFile = (n: number) => `${String(n).padStart(3, "0")}.json`;

/* ---------- пиньинь БКРС → формат колоды ---------- */

const TONES: Record<string, number> = { "\u0304": 1, "\u0301": 2, "\u030C": 3, "\u0300": 4 };

/** Делит слитные буквы на слоги пиньиня; хотим ровно count слогов (или любое число, если count = 0). */
function splitSyllables(letters: string, count: number): number[] | null {
  const n = letters.length;
  // memo[pos][k] — можно ли разобрать хвост с pos ровно на k слогов (k ≤ count)
  const memo = new Map<string, number[] | null>();
  const go = (pos: number, left: number): number[] | null => {
    if (pos === n) return left === 0 || count === 0 ? [] : null;
    if (count && left <= 0) return null;
    const key = `${pos}:${left}`;
    if (memo.has(key)) return memo.get(key)!;
    let res: number[] | null = null;
    for (let len = Math.min(6, n - pos); len >= 1 && !res; len--) {
      if (!SYL.has(letters.slice(pos, pos + len))) continue;
      const rest = go(pos + len, left - 1);
      if (rest) res = [pos + len, ...rest];
    }
    memo.set(key, res);
    return res;
  };
  return go(0, count);
}

/**
 * Пиньинь из БКРС («xuéxí», «Xī'ān», «nǎr», «ài hào») → формат колоды «xue2 xi2».
 * Берётся первое чтение. Число слогов сверяется с числом иероглифов (儿 на конце может слиться: na3 r5).
 * Возвращает null, если разобрать не удалось — тогда слово можно добавить, указав пиньинь вручную.
 */
export function dictPyToNumeric(py: string, han: string): string | null {
  const first = (pyReadings(py)[0] ?? "").toLowerCase().replace(/u:/g, "v");
  if (!first) return null;
  const hanCount = [...han].filter((c) => HAN.test(c)).length;
  if (!hanCount || hanCount !== [...han].length) return null; // слова с латиницей и цифрами не берём
  // группы, разделённые пробелами, дефисами и апострофами, разбираем по отдельности
  let letters = "";
  const tones: { pos: number; t: number }[] = [];
  const breaks = new Set<number>();
  for (const ch of first.normalize("NFD")) {
    if (ch === "\u0308") { if (letters.endsWith("u")) letters = letters.slice(0, -1) + "v"; continue; }
    if (TONES[ch]) { if (letters) tones.push({ pos: letters.length - 1, t: TONES[ch] }); continue; }
    if (/[a-zü]/.test(ch)) { letters += ch === "ü" ? "v" : ch; continue; }
    if (/[\s'’\-·]/.test(ch)) { breaks.add(letters.length); continue; }
    return null;
  }
  if (!letters) return null;
  const build = (cuts: number[]) => {
    const out: string[] = [];
    let a = 0;
    for (const b of cuts) {
      const s = letters.slice(a, b);
      const t = tones.filter((x) => x.pos >= a && x.pos < b);
      out.push(s + (t.length ? t[t.length - 1].t : 5));
      a = b;
    }
    return out.join(" ");
  };
  const erhua = han.endsWith("儿") && hanCount > 1;
  const tryCount = (count: number): string | null => {
    // уважаем явные границы: режем по группам, в каждой — DP
    const groups: [number, number][] = [];
    let a = 0;
    for (const b of [...[...breaks].filter((x) => x > 0 && x < letters.length).sort((x, y) => x - y), letters.length]) {
      if (b > a) groups.push([a, b]);
      a = b;
    }
    // распределение слогов по группам ищем перебором: групп обычно 1–4
    const parts = groups.map(([x, y]) => letters.slice(x, y));
    const solve = (gi: number, left: number): number[] | null => {
      if (gi === parts.length) return left === 0 ? [] : null;
      for (let k = 1; k <= Math.min(left, 8); k++) {
        const cut = splitSyllables(parts[gi], k);
        if (!cut) continue;
        const rest = solve(gi + 1, left - k);
        if (rest) return [...cut.map((c) => c + groups[gi][0]), ...rest];
      }
      return null;
    };
    const cuts = solve(0, count);
    return cuts ? build(cuts) : null;
  };
  let res = tryCount(hanCount);
  if (!res && erhua) {
    // nǎr → na3 r5: отрезаем конечную r как отдельный слог
    if (letters.endsWith("r")) {
      const saved = letters;
      letters = letters.slice(0, -1);
      const base = tryCount(hanCount - 1);
      letters = saved;
      if (base) res = `${base} r5`;
    }
  }
  if (!res) return null;
  try { parseRef(res); } catch { return null; }
  return toNumeric(res) ?? null;
}

/* ---------- HTML статьи ---------- */

const ALLOWED = /^<(\/?)(i|b|span|a)(\s+class="(lb|c)"|\s+data-w="[^"<>]*")?\s*>$/;

/** Оставляет только теги, которые пишет сборка (i, b, span.lb|c, a[data-w]); остальное экранирует. */
export function safeHtml(h: string): string {
  return h.replace(/<[^>]*>?/g, (tag) => (ALLOWED.test(tag) ? tag : tag.replace(/</g, "&lt;").replace(/>/g, "&gt;")));
}

/** Пустой ли перевод у примера (бывает, что в БКРС есть только китайская фраза). */
export const isExample = (r: DictRow): r is [number, string, string] => r.length === 3;
