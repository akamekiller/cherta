/** Пиньинь над словами для тренировки (экзамен HSK и HSKK). */
import { hskEntries } from "../state.ts";
import { parseRef } from "../core/pinyin.ts";
import { esc, pinyinHTML } from "./dom.ts";

let pyMap: Map<string, string> | null = null;
export async function ensurePy() {
  if (pyMap) return;
  pyMap = new Map();
  for (const e of await hskEntries()) if (!pyMap.has(e.han)) pyMap.set(e.han, e.py);
}
/** Китайский текст с пиньинем над словами (если справочник загружен — иначе простой текст). */
export function rubyHTML(text: string): string {
  if (!pyMap) return esc(text);
  const out: string[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length;) {
    if (!/\p{Script=Han}/u.test(chars[i])) { out.push(`<span class="p">${esc(chars[i])}</span>`); i++; continue; }
    let L = Math.min(4, chars.length - i);
    for (; L > 1 && !pyMap.has(chars.slice(i, i + L).join("")); L--);
    const w = chars.slice(i, i + L).join("");
    let p = "";
    try { const py = pyMap.get(w); p = py ? pinyinHTML(parseRef(py)) : ""; } catch { p = ""; }
    out.push(`<ruby>${esc(w)}<rt>${p}</rt></ruby>`);
    i += L;
  }
  return out.join("");
}
