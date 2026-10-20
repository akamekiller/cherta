/**
 * Японско-русский словарь WARODAI (scripts/build_ja_dict.py → dict/ja/, CC BY-NC-ND 3.0).
 * index.tsv: id \t каной (через «, ») \t написания (через «･») \t Поливанов \t кратко \t метка — по убыванию важности.
 * NNN.json: {id: текст статьи как есть}; часть = цифры id % shards.
 * Здесь чистая логика: разбор индекса, поиск (кандзи, кана, ромадзи, русский, Поливанов), слова с кандзи,
 * безопасный HTML статьи (текст не меняется — только экранирование и ссылки «см.»).
 */
import { romajiToKana, toHiragana } from "./kana.ts";

export type JIndex = {
  id: string[];
  kana: string[];   // для показа: «たべる, くう»
  kanji: string[];  // «食べる･喰べる»
  pol: string[];    // Поливанов как есть
  ru: string[];
  tag: string[];    // N5 / N4 / частое / ""
  kk: string[];     // «|たべる|くう|» — хираганой
  kj: string[];     // «|食べる|喰べる|»
  pk: string[];     // Поливанов без долгот и дефисов, через «|»
  rl: string[];
};

export type JHit = { i: number; id: string; han: string; kana: string; ru: string; tag: string };

const polKey = (s: string) => s.toLowerCase().replace(/[:\-…ʼ' ]/g, "").replace(/ў/g, "у").replace(/й/g, "и");

export function parseJIndex(text: string): JIndex {
  const x: JIndex = { id: [], kana: [], kanji: [], pol: [], ru: [], tag: [], kk: [], kj: [], pk: [], rl: [] };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (!line) continue;
    const [id, kana = "", kanji = "", pol = "", ru = "", tag = ""] = line.split("\t");
    if (!id) continue;
    x.id.push(id); x.kana.push(kana); x.kanji.push(kanji); x.pol.push(pol); x.ru.push(ru); x.tag.push(tag);
    x.kk.push(`|${kana.split(", ").map((k) => toHiragana(k)).join("|")}|`);
    x.kj.push(kanji ? `|${kanji.split("･").join("|")}|` : "");
    x.pk.push(`|${pol.split(",").map(polKey).join("|")}|`);
    x.rl.push(ru.toLowerCase());
  }
  return x;
}

/** Главное написание статьи: первое иероглифическое, иначе кана. */
export const jHan = (x: JIndex, i: number) => (x.kanji[i] ? x.kanji[i].split("･")[0] : x.kana[i].split(", ")[0]);
export const jReadings = (x: JIndex, i: number) => x.kana[i].split(", ");
const hit = (x: JIndex, i: number): JHit => ({ i, id: x.id[i], han: jHan(x, i), kana: x.kana[i], ru: x.ru[i], tag: x.tag[i] });

const HAN = /\p{Script=Han}/u;
const KANA = /^[぀-ヿー]+$/;

/** Запрос латиницей → кана (ромадзи), если переводится целиком; иначе null. */
export function queryKana(q: string): string | null {
  const s = q.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (KANA.test(s)) return toHiragana(s);
  if (!/^[a-z'\-āīūēô]+$/.test(s)) return null;
  const k = romajiToKana(s, true);
  return KANA.test(k) ? toHiragana(k) : null;
}

/**
 * Поиск. Иероглифы (можно с каной: 食べる) — по написаниям: точное → начало → вхождение.
 * Кана или ромадзи — по чтениям: точное → начало. Кириллица — Поливанов целиком, затем русское значение
 * (целое слово → начало слова → вхождение во фразу). Внутри уровня — порядок индекса (JLPT, частые, остальные).
 */
export function searchJDict(x: JIndex, query: string, limit = 50): JHit[] {
  const q = query.trim();
  if (!q) return [];
  const b: number[][] = [[], [], [], [], []];
  const n = x.id.length;
  if (HAN.test(q)) {
    for (let i = 0; i < n; i++) {
      const kj = x.kj[i];
      if (!kj) continue;
      if (kj.includes(`|${q}|`)) b[0].push(i);
      else if (kj.includes(`|${q}`)) b[1].push(i);
      else if (kj.includes(q)) b[2].push(i);
    }
  } else if (queryKana(q)) {
    const k = queryKana(q)!;
    for (let i = 0; i < n; i++) {
      const kk = x.kk[i];
      if (kk.includes(`|${k}|`)) b[0].push(i);
      else if (kk.includes(`|${k}`)) b[1].push(i);
    }
  } else if (/[а-яё]/i.test(q)) {
    const ql = q.toLowerCase();
    const pk = polKey(q);
    const phrase = /\s/.test(ql);
    for (let i = 0; i < n; i++) {
      if (pk.length > 1 && x.pk[i].includes(`|${pk}|`)) { b[0].push(i); continue; }
      const ru = x.rl[i];
      let p = ru.indexOf(ql);
      if (p < 0) continue;
      if (ru === ql) { b[0].push(i); continue; }
      if (phrase) { b[p === 0 ? 1 : 3].push(i); continue; }
      let best = -1;
      while (p >= 0) {
        const before = p === 0 ? "" : ru[p - 1];
        if (!before || !/[\p{L}-]/u.test(before)) {
          const after = ru[p + ql.length] ?? "";
          const whole = !after || !/\p{L}/u.test(after);
          const lvl = whole ? (p === 0 ? 1 : 2) : (p === 0 ? 3 : 4);
          if (best < 0 || lvl < best) best = lvl;
          if (best === 1) break;
        }
        p = ru.indexOf(ql, p + 1);
      }
      if (best >= 0) b[best].push(i);
    }
  }
  const out: JHit[] = [];
  for (const g of b) for (const i of g) { out.push(hit(x, i)); if (out.length >= limit) return out; }
  return out;
}

/** Статьи, где слово написано так (и, если дано, с таким чтением) — для слов из колод. */
export function findJ(x: JIndex, han: string, reading?: string): number[] {
  const rs = reading ? reading.split("/").map((r) => toHiragana(r.trim())).filter(Boolean) : [];
  const kanaWord = KANA.test(han);
  const all: number[] = [];
  if (kanaWord) {
    // слово каной: статьи с таким чтением — сначала без кандзи (или с этим написанием), потом с меткой JLPT/частое
    const h = toHiragana(han);
    for (let i = 0; i < x.id.length; i++) if (x.kk[i].includes(`|${h}|`)) all.push(i);
    const plain = all.filter((i) => !x.kanji[i] || x.kj[i].includes(`|${han}|`));
    if (plain.length) return plain;
    const tagged = all.filter((i) => x.tag[i]);
    return tagged.length ? tagged : all.slice(0, 3);
  }
  for (let i = 0; i < x.id.length; i++) if (x.kj[i].includes(`|${han}|`)) all.push(i);
  if (!rs.length) return all;
  const same = all.filter((i) => rs.some((r) => x.kk[i].includes(`|${r}|`)));
  return same.length ? same : all;
}

/** Слова, где есть кандзи ch (кроме статьи except), в порядке индекса. */
export function jWordsWithChar(x: JIndex, ch: string, limit = 24, except?: string, mode: "start" | "any" = "any"): JHit[] {
  const out: JHit[] = [];
  for (let i = 0; i < x.id.length && out.length < limit; i++) {
    const kj = x.kj[i];
    if (!kj || x.id[i] === except) continue;
    const h = jHan(x, i);
    if ([...h].length < 2) continue;
    if (mode === "start" ? kj.includes(`|${ch}`) : kj.includes(ch)) out.push(hit(x, i));
  }
  return out;
}

export function countJWithChar(x: JIndex, ch: string): number {
  let n = 0;
  for (let i = 0; i < x.id.length; i++) if (x.kj[i].includes(ch) && [...jHan(x, i)].length > 1) n++;
  return n;
}

export const jShardOf = (id: string, shards: number) => Number(id.replace(/-/g, "")) % shards;

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Текст статьи → HTML. Текст не меняется: всё экранируется, обратно разрешены только <i>…</i> и ссылки
 * <a href="#id">…</a> (становятся кнопками-ссылками data-jid). Заголовок (первая строка) — отдельно, в шапке.
 * Строки-рубрики («1)», «а)») получают отступ.
 */
export function jArticleHTML(text: string): { head: string; html: string } {
  const lines = text.replace(/\r/g, "").split("\n");
  const head = lines.shift() ?? "";
  const html = lines.filter((l) => l.trim()).map((l) => {
    let s = escHtml(l)
      .replace(/&lt;i&gt;/g, "<i>").replace(/&lt;\/i&gt;/g, "</i>")
      .replace(/&lt;a href=&quot;#(\d{3}-\d{2}-\d{2})&quot;&gt;(.*?)&lt;\/a&gt;/g, '<a class="xref" data-jid="$1">$2</a>');
    // незакрытые <i> не должны тянуться на следующие строки
    const open = (s.match(/<i>/g) ?? []).length - (s.match(/<\/i>/g) ?? []).length;
    if (open > 0) s += "</i>".repeat(open);
    let cls = /^\s*\d+[.)]/.test(l) ? "r1" : /^\s*[а-я]\)/.test(l) ? "r2" : /^\s*:|^\s*～|^\s*…/.test(l) ? "der" : "";
    // пример: японская часть в начале строки — своим шрифтом (текст тот же)
    const jp = /^(\s*(?:[぀-ヿ一-鿿々〆ヵヶー～…・／/、。「」『』（）！？0-9０-９A-Za-zＡ-Ｚａ-ｚ\s]|<a [^>]*>[^<]*<\/a>)+?)(?=\s+[а-яёА-ЯЁ(<]|\s*$)/.exec(s);
    if (jp && /[぀-ヿ一-鿿]/.test(jp[1])) { s = `<span class="jx" lang="ja">${jp[1]}</span>${s.slice(jp[1].length)}`; if (!cls) cls = "jex"; }
    return `<p${cls ? ` class="${cls}"` : ""}>${s}</p>`;
  }).join("");
  return { head, html };
}

/** Поливанов из заголовка статьи (для шапки слова): «(табэру)» → «табэру». */
export function jHeadPol(head: string): string {
  const m = /\(([^()]+)\)(?:\s*\[[^\]]*\])?〔/.exec(head);
  return m ? m[1] : "";
}
