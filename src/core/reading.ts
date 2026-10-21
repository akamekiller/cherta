/**
 * Тексты для чтения: разбор файла.
 * Формат (как у встроенных, scripts/texts/texts.txt):
 *   === 2 | Название          — начало текста: уровень и название (уровень можно не писать: «=== Название»)
 *   + 工厂 | gong1 chang3 | завод — новое слово текста (необязательно)
 *   我在工厂工作。 | Я работаю на заводе.   — строка текста и перевод (перевод необязателен)
 *   ? Вопрос | вариант | верный* | вариант — вопрос на понимание (необязательно)
 * Файл без «===» — один текст, название — из первой строки «# Название» или «Мой текст».
 */
export type ReadQ = { q: string; o: string[]; a: number };
/** lang "ja" — японский текст: уровень 5/4 = JLPT N5/N4; строки — словами через пробел с чтением в [скобках] или обычный текст. */
export type ReadText = { id: string; level: number; title: string; words: [string, string, string][]; lines: [string, string][]; q: ReadQ[]; lang?: "ja" };

const HAN_ZH = /\p{Script=Han}/u;
const HAN_JA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function parseTexts(src: string, idPrefix = "o", lang?: "ja"): ReadText[] {
  const HAN = lang === "ja" ? HAN_JA : HAN_ZH;
  const out: ReadText[] = [];
  let cur: ReadText | null = null;
  let fileTitle = "";
  const start = (level: number, title: string) => {
    cur = { id: `${idPrefix}-${out.length + 1}`, level, title: title || "Мой текст", words: [], lines: [], q: [], ...(lang ? { lang } : {}) };
    out.push(cur);
    return cur;
  };
  const all = src.replace(/^﻿/, "").split(/\r?\n/);
  // простой текст без разметки: короткая первая строка без точки в конце — это заголовок («我的周末»)
  const marked = all.some((l) => /^\s*(===|#|\+|\?)/.test(l));
  const body = all.map((l) => l.trim()).filter(Boolean);
  if (!marked && body.length > 1 && HAN.test(body[0]) && [...body[0]].length <= 20 && !/[。！？.!?|]$/.test(body[0]) && !body[0].includes("|")) {
    fileTitle = body[0];
    all.splice(all.findIndex((l) => l.trim() === body[0]), 1);
  }
  for (const raw of all) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^===\s*(?:(\d+)\s*\|)?\s*(.*)$/);
    if (m) { start(m[1] ? Number(m[1]) : 0, m[2].trim()); continue; }
    if (/^#\s/.test(line) && !cur) { fileTitle = line.slice(2).trim(); continue; }
    if (line.startsWith("#")) continue;
    const t: ReadText = cur ?? start(0, fileTitle);
    if (line.startsWith("+")) {
      const [h, py = "", ru = ""] = line.slice(1).split("|").map((x) => x.trim());
      if (h) t.words.push([h, py, ru]);
    } else if (line.startsWith("?")) {
      const [q, ...opts] = line.slice(1).split("|").map((x) => x.trim());
      const a = opts.findIndex((o) => o.endsWith("*"));
      if (q && opts.length >= 2 && a >= 0) t.q.push({ q, o: opts.map((o) => o.replace(/\*$/, "").trim()), a });
    } else if (HAN.test(line)) {
      const i = line.indexOf("|");
      if (i >= 0) t.lines.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
      else {
        // без перевода: длинный абзац делим на предложения
        for (const s of line.match(/[^。！？!?]+[。！？!?」”』]*/g) ?? [line]) if (s.trim()) t.lines.push([s.trim(), ""]);
      }
    }
  }
  return out.filter((t) => t.lines.length);
}

/**
 * Библиотека чтения (meta `reading`): lib — что добавлено (id → время добавления, отрицательное — время удаления;
 * так удаление на одном устройстве не «воскресает» после синхронизации), own — свои тексты, done — лучший результат.
 */
export type ReadLib = { lib: Record<string, number>; own: ReadText[]; done: Record<string, number> };
export const emptyLib = (): ReadLib => ({ lib: {}, own: [], done: {} });
export const inLib = (l: ReadLib, id: string) => (l.lib[id] ?? 0) > 0;

/** Слить две библиотеки: по каждому тексту побеждает последнее действие (добавил/удалил), результаты — лучший. */
export function mergeLib(a: Partial<ReadLib> | undefined, b: Partial<ReadLib> | undefined): ReadLib {
  const out = emptyLib();
  for (const l of [a, b]) {
    for (const [id, t] of Object.entries(l?.lib ?? {})) if (Math.abs(t) > Math.abs(out.lib[id] ?? 0)) out.lib[id] = t;
    for (const [id, v] of Object.entries(l?.done ?? {})) out.done[id] = Math.max(v, out.done[id] ?? 0);
  }
  const own = new Map<string, ReadText>();
  for (const t of [...(b?.own ?? []), ...(a?.own ?? [])]) own.set(t.id, t);
  out.own = [...own.values()].filter((t) => inLib(out, t.id));
  return out;
}

/** Словарь для деления японского текста: слово → чтение (или "" если чтение неизвестно), основа изменяемого слова → чтение основы. */
export type JaLex = { word: (w: string) => string | undefined; stem?: (s: string) => string | undefined };

/** Основы глаголов и прилагательных: 食べる → 食べ (たべ), 行く → 行 (い), 高い → 高 (たか). */
export function jaStem(word: string, reading: string): [string, string] | null {
  if (!/[\p{Script=Han}々]/u.test(word) || !/[るうくぐすつぬぶむい]$/.test(word) || reading.length < 2) return null;
  return [word.slice(0, -1), reading.slice(0, -1)];
}

/**
 * Японский текст без пробелов → слова и чтения: самое длинное слово словаря или основа глагола/прилагательного
 * с окончанием каной (食べました, 行きたい), иначе — подряд идущие кандзи, катакана или кана не из словаря.
 */
export function segmentJa(text: string, lex: JaLex, maxLen = 8): { t: string[]; r: string[] } {
  const ch = [...text];
  const kind = (c: string) => (/[\p{Script=Han}々]/u.test(c) ? "k" : /[\p{Script=Katakana}ー]/u.test(c) ? "t" : /\p{Script=Hiragana}/u.test(c) ? "h" : /\s/.test(c) ? "s" : "o");
  const out: { w: string; r: string; dict: boolean }[] = [];
  let i = 0;
  while (i < ch.length) {
    const k = kind(ch[i]);
    if (k === "s") { i++; continue; }
    if (k === "o") { out.push({ w: ch[i], r: ch[i], dict: true }); i++; continue; }
    // точное слово словаря
    let L = Math.min(maxLen, ch.length - i), rd: string | undefined;
    for (; L >= 1; L--) {
      const seg = ch.slice(i, i + L);
      if (seg.some((c) => kind(c) === "o" || kind(c) === "s")) continue;
      rd = lex.word(seg.join(""));
      if (rd !== undefined) break;
    }
    // основа изменяемого слова + окончание каной
    let best: { len: number; r: string } | null = null;
    if (k === "k" && lex.stem) {
      for (let S = Math.min(maxLen, ch.length - i - 1); S >= 1; S--) {
        if (kind(ch[i + S]) !== "h") continue;
        const sr = lex.stem(ch.slice(i, i + S).join(""));
        if (sr === undefined) continue;
        let j = i + S;
        while (j < ch.length && kind(ch[j]) === "h") j++;
        best = { len: j - i, r: sr + ch.slice(i + S, j).join("") };
        break;
      }
    }
    if (best && best.len > Math.max(L, 0)) { out.push({ w: ch.slice(i, i + best.len).join(""), r: best.r, dict: true }); i += best.len; continue; }
    if (L >= 1 && rd !== undefined) { const w = ch.slice(i, i + L).join(""); out.push({ w, r: rd || (k === "h" || k === "t" ? w : ""), dict: true }); i += L; continue; }
    let j = i + 1;
    if (k !== "h") while (j < ch.length && kind(ch[j]) === k) j++;
    const w = ch.slice(i, j).join("");
    const last = out[out.length - 1];
    // кана не из словаря склеивается с такой же соседней (окончания: ました, ている)
    if (k === "h" && last && !last.dict && kind([...last.w].pop()!) === "h") { last.w += w; last.r += w; }
    else out.push({ w, r: k === "k" ? "" : w, dict: false });
    i = j;
  }
  return { t: out.map((x) => x.w), r: out.map((x) => x.r) };
}
