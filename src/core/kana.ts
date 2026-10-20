/**
 * Кана: ромадзи → хирагана (ввод чтения японских слов с обычной клавиатуры), катакана ↔ хирагана, проверка чтения.
 * Понимает Хэпбёрн и «вапуро»: shi/si, chi/ti, tsu/tu, fu/hu, ji/zi, удвоенная согласная → っ, n/nn/n' → ん, «-» → ー.
 * Кана, набранная прямо (японская клавиатура), остаётся как есть.
 */

const BASE: Record<string, string> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", si: "し", shi: "し", su: "す", se: "せ", so: "そ",
  ta: "た", ti: "ち", chi: "ち", tu: "つ", tsu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", hu: "ふ", fu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", wi: "うぃ", we: "うぇ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", zi: "じ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
  xa: "ぁ", xi: "ぃ", xu: "ぅ", xe: "ぇ", xo: "ぉ", la: "ぁ", li: "ぃ", lu: "ぅ", le: "ぇ", lo: "ぉ",
  xya: "ゃ", xyu: "ゅ", xyo: "ょ", lya: "ゃ", lyu: "ゅ", lyo: "ょ", xtu: "っ", ltu: "っ", xtsu: "っ",
};
//拗音: kya → きゃ, sha → しゃ, cha → ちゃ, ja → じゃ …
const YOON: Record<string, string> = { ky: "き", gy: "ぎ", sy: "し", sh: "し", zy: "じ", j: "じ", jy: "じ", ty: "ち", ch: "ち", cy: "ち", dy: "ぢ", ny: "に", hy: "ひ", by: "び", py: "ぴ", my: "み", ry: "り" };
const SMALL: Record<string, string> = { a: "ゃ", u: "ゅ", o: "ょ", e: "ぇ" };
for (const [c, k] of Object.entries(YOON)) for (const [v, s] of Object.entries(SMALL)) {
  if (v === "e" && !["sh", "ch", "j"].includes(c)) continue; // しぇ ちぇ じぇ
  BASE[c + v] ??= k + s;
}
const VOWELS = "aiueo";

/**
 * Ромадзи (и уже набранная кана) → хирагана. Незаконченный хвост («k», «sh») остаётся латиницей — его допечатают;
 * n в конце — тоже (может стать な/に…), а при final = true (ввод закончен) становится ん.
 * «nn» перед гласной: обычно おんな (onna), а при nnStrict — как в IME Windows: ん + гласная (konnya = こんや).
 */
export function romajiToKana(input: string, final = false, nnStrict = false): string {
  const s = input.toLowerCase().replace(/[āâ]/g, "aa").replace(/[īî]/g, "ii").replace(/[ūû]/g, "uu").replace(/[ēê]/g, "ee").replace(/[ōô]/g, "ou");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (!/[a-z'\-]/.test(ch)) { out += ch; i++; continue; }
    if (ch === "-") { out += "ー"; i++; continue; }
    if (ch === "'") { i++; continue; }
    // n: перед согласной (кроме y) или в конце — ん; nn — ん; n' — ん
    if (ch === "n") {
      const nx = s[i + 1];
      // nn: «onna» = おんな (вторая n начинает слог), «konn» = こん
      if (nx === "n") { const n3 = s[i + 2]; out += "ん"; i += !nnStrict && n3 !== undefined && (VOWELS.includes(n3) || n3 === "y") ? 1 : 2; continue; }
      if (nx === "'") { out += "ん"; i += 2; continue; }
      if (nx === undefined) { out += final ? "ん" : "n"; i++; continue; } // ещё печатают: na/ni/nyo…
      if (!VOWELS.includes(nx) && nx !== "y") { out += "ん"; i++; continue; }
    }
    // удвоенная согласная → っ (tt, kk, ss, pp, tch)
    if (!VOWELS.includes(ch) && ch !== "n" && (s[i + 1] === ch || (ch === "t" && s[i + 1] === "c" && s[i + 2] === "h"))) {
      out += "っ"; i++; continue;
    }
    let hit = "";
    for (const len of [4, 3, 2, 1]) {
      const part = s.slice(i, i + len);
      if (BASE[part]) { hit = part; break; }
    }
    if (hit) { out += BASE[hit]; i += hit.length; continue; }
    // нет такого слога: оставляем как есть (незаконченный ввод)
    out += ch; i++;
  }
  return out;
}

/** Катакана → хирагана (ー остаётся). */
export const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Только кана (и ー): слово без кандзи — его чтение совпадает с написанием. */
export const isKana = (s: string) => /^[぀-ヿー]+$/.test(s);

/** Есть ли в строке японская кана (чтобы отличить японское слово от китайского). */
export const hasKana = (s: string) => /[぀-ヿ]/.test(s);

const clean = (s: string) => s.replace(/[\s・.,、。]/g, "");
const norm = (s: string, strict = false) => clean(toHiragana(romajiToKana(s.trim(), true, strict)));

/** Верно ли чтение: любое из вариантов колоды («いく/ゆく»), без разницы хирагана/катакана/ромадзи. */
export function checkKana(typed: string, reading: string): { ok: boolean; typed: string } {
  const t = norm(typed);
  const alt = norm(typed, true); // «konnya» = こんや, «onna» = おんな — засчитываем любое прочтение nn
  const refs = reading.split("/").map((r) => norm(r));
  const ok = !!t && (refs.includes(t) || refs.includes(alt));
  return { ok, typed: refs.includes(alt) && !refs.includes(t) ? alt : t };
}

/** Первое (основное) чтение для показа. */
export const mainReading = (reading: string) => reading.split("/")[0];
