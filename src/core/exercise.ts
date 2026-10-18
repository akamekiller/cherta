/**
 * Упражнения на перевод: предложения из базы примеров 大БКРС по уровням HSK (scripts/build_examples.py).
 *  ZH→RU — читаешь по-китайски, переводишь (можно вписать свой перевод — покажем, насколько близко к образцу), оцениваешь себя;
 *  RU→ZH — собираешь китайское предложение из плиток-слов (среди них пара лишних).
 */
export type ExItem = { zh: string; ru: string; t: string[] };
export type ExProgress = Record<string, { seen: number; ok: number; last: number }>;

const HAN = /\p{Script=Han}/u;
export const isWordTok = (t: string) => HAN.test(t);
/** Китайский текст без пунктуации и пробелов — для сравнения. */
export const zhKey = (s: string) => [...s].filter((c) => HAN.test(c) || /[0-9A-Za-z]/.test(c)).join("");

/** Плитки: слова предложения и distract лишних слов из пула (не совпадающих со словами предложения), перемешанные. */
export function tilesFor(item: ExItem, pool: string[], rnd: () => number, distract = 2): string[] {
  const words = item.t.filter(isWordTok);
  const extra: string[] = [];
  const have = new Set(words);
  for (let k = 0; k < 40 && extra.length < distract && pool.length; k++) {
    const w = pool[Math.floor(rnd() * pool.length)];
    if (!have.has(w) && !extra.includes(w)) extra.push(w);
  }
  const all = [...words, ...extra];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

/** Собранный ответ верен, если без пунктуации совпадает с предложением. */
export const checkAssembled = (answer: string[], item: ExItem) => zhKey(answer.join("")) === zhKey(item.zh);

/** Насколько свой русский перевод близок к образцу: доля общих слов (по основе из первых 5 букв), 0..1. */
export function ruCloseness(mine: string, ref: string): number {
  const stems = (s: string) => new Set(s.toLowerCase().replace(/ё/g, "е").split(/[^а-яa-z0-9]+/).filter((w) => w.length > 1).map((w) => w.slice(0, Math.max(3, Math.min(5, w.length - 1)))));
  const a = stems(mine), b = stems(ref);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return (2 * common) / (a.size + b.size);
}

/** Урок: сначала ни разу не виденные (по порядку), затем с ошибками, затем давно виденные. */
export function pickLesson(items: ExItem[], prog: ExProgress, n = 10, prefix = ""): number[] {
  const key = (i: number) => prefix + items[i].zh;
  const idx = items.map((_, i) => i);
  const fresh = idx.filter((i) => !prog[key(i)]);
  const weak = idx.filter((i) => prog[key(i)] && prog[key(i)].ok < prog[key(i)].seen).sort((a, b) => prog[key(a)].last - prog[key(b)].last);
  const old = idx.filter((i) => prog[key(i)] && prog[key(i)].ok >= prog[key(i)].seen).sort((a, b) => prog[key(a)].last - prog[key(b)].last);
  // в уроке: до 3 повторов слабых, остальное — новые; если новых нет — слабые и старые
  const out = [...weak.slice(0, 3), ...fresh].slice(0, n);
  for (const i of [...weak.slice(3), ...old]) { if (out.length >= n) break; if (!out.includes(i)) out.push(i); }
  return out;
}

export function record(prog: ExProgress, key: string, ok: boolean, now = Date.now()): ExProgress {
  const p = prog[key] ?? { seen: 0, ok: 0, last: 0 };
  return { ...prog, [key]: { seen: p.seen + 1, ok: p.ok + (ok ? 1 : 0), last: now } };
}

/* ======================= упражнения 2.0 ======================= */

/** Предложение корпуса или набора. t — слова и знаки препинания (для плиток, пропусков и подсказок). */
export type Sent = { id: string; zh: string; ru: string; t: string[]; lv: number };
export type Question = { q: string; o: string[]; a: number };
export type Dialog = { id: string; title: string; theme?: string; level?: number; lines: [string, string, string][]; q: Question[] };
export type Lesson = { title: string; sents: Sent[]; dialogs: Dialog[] };
export type ExSet = { id: string; title: string; lessons: Lesson[] };
export type Kind = "tr" | "gap" | "listen" | "dialog";
export type Task = { kind: Exclude<Kind, "dialog">; sent: Sent } | { kind: "dialog"; dialog: Dialog };

export const KINDS: { id: Kind; name: string; hint: string }[] = [
  { id: "tr", name: "Перевод", hint: "написать по-китайски рукой или с клавиатуры" },
  { id: "gap", name: "Пропуски", hint: "вставить пропущенное слово" },
  { id: "listen", name: "Аудирование", hint: "послушать и собрать предложение" },
  { id: "dialog", name: "Диалоги", hint: "прочитать диалог и ответить на вопросы" },
];

/** Корпус из dict/ex.json: [китайский, русский, "слово слово …", уровень]. */
export function parseCorpus(raw: [string, string, string, number][]): Sent[] {
  return raw.map(([zh, ru, t, lv]) => ({ id: `c:${zh}`, zh, ru, t: t.split(" ").filter(Boolean), lv }));
}

/** Деление китайского текста на слова: самое длинное совпадение со словарём (до maxLen знаков), прочее — по знаку. */
export function segment(text: string, has: (w: string) => boolean, maxLen = 4): string[] {
  const out: string[] = [];
  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (!HAN.test(c)) {
      if (c.trim()) out.push(c);
      i++;
      continue;
    }
    let L = Math.min(maxLen, chars.length - i);
    for (; L > 1; L--) {
      const w = chars.slice(i, i + L).join("");
      if ([...w].every((x) => HAN.test(x)) && has(w)) break;
    }
    out.push(chars.slice(i, i + L).join(""));
    i += L;
  }
  return out;
}

/**
 * Предложения для колоды: есть хотя бы одно слово колоды, а остальные слова — из колоды или «простых» (basic),
 * не меньше minKnown долей. Сортировка: больше слов колоды, ниже уровень, короче.
 */
export function sentencesFor(corpus: Sent[], deck: Set<string>, basic: Set<string>, limit = 300, minKnown = 0.8): Sent[] {
  const scored: [number, Sent][] = [];
  for (const s of corpus) {
    const words = s.t.filter(isWordTok);
    if (!words.length) continue;
    let inDeck = 0, known = 0;
    for (const w of words) {
      if (deck.has(w)) { inDeck++; known++; }
      else if (basic.has(w)) known++;
    }
    if (!inDeck || known / words.length < minKnown) continue;
    // короткие и простые выше: доля слов колоды, уровень, длина (длинные русские переводы — часто вольные)
    scored.push([(inDeck / words.length) * 6 + Math.min(inDeck, 3) - s.lv * 1.5 - words.length * 0.4 - s.ru.length / 40, s]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map((x) => x[1]);
}

/** Пропуск: убираем слово (лучше — из колоды), варианты — само слово и 3 похожих по длине из пула. */
export function gapTask(s: Sent, prefer: Set<string>, pool: string[], rnd: () => number): { at: number; answer: string; options: string[] } | null {
  const idx = s.t.map((t, i) => [t, i] as const).filter(([t]) => isWordTok(t));
  if (idx.length < 2) return null;
  const good = idx.filter(([t]) => prefer.has(t));
  const from = good.length ? good : idx.filter(([t]) => t.length > 1).length ? idx.filter(([t]) => t.length > 1) : idx;
  const [answer, at] = from[Math.floor(rnd() * from.length)];
  const same = pool.filter((w) => w !== answer && w.length === answer.length && !s.t.includes(w));
  const any = pool.filter((w) => w !== answer && !s.t.includes(w));
  const options = new Set<string>([answer]);
  for (const list of [same, any]) {
    for (let k = 0; k < 60 && options.size < 4 && list.length; k++) options.add(list[Math.floor(rnd() * list.length)]);
  }
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return { at, answer, options: arr };
}

/** Сравнение своего китайского ответа с образцом по знакам (LCS): какие знаки образца есть в ответе, какие лишние. */
export function diffZh(mine: string, ref: string): { ref: { c: string; ok: boolean }[]; extra: string[]; score: number } {
  const a = [...zhKey(mine)], b = [...zhKey(ref)];
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const okRef = new Array<boolean>(b.length).fill(false);
  const extra: string[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { okRef[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { extra.push(a[i]); i++; }
    else j++;
  }
  extra.push(...a.slice(i));
  const score = b.length ? (2 * dp[0][0]) / (a.length + b.length) : 0;
  return { ref: b.map((c, k) => ({ c, ok: okRef[k] })), extra, score };
}

/**
 * Свой набор упражнений из текстового файла:
 *   # Название набора
 *   ## Урок 1. Знакомство            — раздел
 *   你好！ | Привет!                  — предложение (разделитель | или Tab)
 *   @ В магазине                      — начало диалога (до пустой строки или следующего @/##)
 *   A: 你要什么？ | Что вам нужно?
 *   ? Что покупают? | яблоки* | хлеб  — вопрос к диалогу, верный вариант со звёздочкой
 */
export function parseExSet(text: string, id: string, seg: (zh: string) => string[]): ExSet {
  const set: ExSet = { id, title: "", lessons: [] };
  let lesson: Lesson | null = null;
  let dialog: Dialog | null = null;
  const ensureLesson = () => (lesson ??= (set.lessons.push({ title: "Без раздела", sents: [], dialogs: [] }), set.lessons[set.lessons.length - 1]));
  const split = (l: string) => l.split(/\s*[|\t]\s*/).map((x) => x.trim());
  let n = 0;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { dialog = null; continue; }
    if (line.startsWith("## ")) { lesson = { title: line.slice(3).trim(), sents: [], dialogs: [] }; set.lessons.push(lesson); dialog = null; continue; }
    if (line.startsWith("# ")) { set.title ||= line.slice(2).trim(); continue; }
    if (line.startsWith("@")) {
      dialog = { id: `${id}:d${n++}`, title: line.slice(1).trim() || "Диалог", lines: [], q: [] };
      ensureLesson().dialogs.push(dialog);
      continue;
    }
    if (line.startsWith("?") && dialog) {
      const [q, ...opts] = split(line.slice(1));
      const a = opts.findIndex((o) => o.endsWith("*"));
      if (q && opts.length >= 2 && a >= 0) dialog.q.push({ q, o: opts.map((o) => o.replace(/\*$/, "").trim()), a });
      continue;
    }
    const [zhRaw, ru = ""] = split(line);
    if (dialog) {
      const m = /^([^:：]{1,12})[:：]\s*(.+)$/.exec(zhRaw);
      if (m && HAN.test(m[2])) { dialog.lines.push([m[1].trim(), m[2].trim(), ru]); continue; }
    }
    if (!HAN.test(zhRaw)) continue;
    dialog = null;
    ensureLesson().sents.push({ id: `${id}:${zhRaw}`, zh: zhRaw, ru, t: seg(zhRaw), lv: 0 });
  }
  set.lessons = set.lessons.filter((l) => l.sents.length || l.dialogs.length);
  set.title ||= "Мой набор";
  return set;
}

/** Задания занятия: предложения — по виду по кругу, с приоритетом новых и слабых; диалог — одно задание. */
export function planSession(sents: Sent[], dialogs: Dialog[], kinds: Kind[], prog: ExProgress, n: number, rnd: () => number): Task[] {
  const sentKinds = kinds.filter((k): k is Exclude<Kind, "dialog"> => k !== "dialog");
  const out: Task[] = [];
  if (kinds.includes("dialog") && dialogs.length) {
    const fresh = dialogs.filter((d) => !prog[d.id]);
    const list = fresh.length ? fresh : [...dialogs].sort((a, b) => (prog[a.id]?.last ?? 0) - (prog[b.id]?.last ?? 0));
    const d = list[Math.floor(rnd() * Math.min(list.length, 3))];
    out.push({ kind: "dialog", dialog: d });
  }
  if (sentKinds.length && sents.length) {
    const items: ExItem[] = sents.map((s) => ({ zh: s.zh, ru: s.ru, t: s.t }));
    const order = pickLesson(items, prog, Math.max(0, n - out.length), "");
    order.forEach((i, k) => out.push({ kind: sentKinds[k % sentKinds.length], sent: sents[i] }));
  }
  // диалог — в середину занятия, не первым
  if (out.length > 3 && out[0].kind === "dialog") out.splice(Math.floor(out.length / 2), 0, out.shift()!);
  return out;
}
