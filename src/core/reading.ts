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
export type ReadText = { id: string; level: number; title: string; words: [string, string, string][]; lines: [string, string][]; q: ReadQ[] };

const HAN = /\p{Script=Han}/u;

export function parseTexts(src: string, idPrefix = "o"): ReadText[] {
  const out: ReadText[] = [];
  let cur: ReadText | null = null;
  let fileTitle = "";
  const start = (level: number, title: string) => {
    cur = { id: `${idPrefix}-${out.length + 1}`, level, title: title || "Мой текст", words: [], lines: [], q: [] };
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
        for (const s of line.match(/[^。！？!?]+[。！？!?」”]*/g) ?? [line]) if (s.trim()) t.lines.push([s.trim(), ""]);
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
