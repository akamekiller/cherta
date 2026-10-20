/**
 * Упражнения на перевод: предложения из базы примеров 大БКРС по уровням HSK (scripts/build_examples.py).
 *  ZH→RU — читаешь по-китайски, переводишь (можно вписать свой перевод — покажем, насколько близко к образцу), оцениваешь себя;
 *  RU→ZH — собираешь китайское предложение из плиток-слов (среди них пара лишних).
 */
export type ExItem = { zh: string; ru: string; t: string[] };
export type ExProgress = Record<string, { seen: number; ok: number; last: number }>;

const HAN = /\p{Script=Han}/u;
/** Слово — китайские иероглифы или японские (кандзи, кана); пунктуация и цифры — нет. */
const WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
export const isWordTok = (t: string) => WORD.test(t);
/** Перемешать копию массива (Фишер — Йейтс). */
export const shuffled = <T>(a: T[], rnd: () => number) => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
/** Китайский текст без пунктуации и пробелов — для сравнения. */
export const zhKey = (s: string) => [...s].filter((c) => WORD.test(c) || /[0-9A-Za-z]/.test(c)).join("");

/* ---------- японский текст курса ---------- */

const KANA_RE = /[\u3040-\u30ff]/;
const PUNCT_END = /^(.*?)([。、！？!?,.…「」『』（）()・]+)$/u;
/**
 * Японское предложение в файле курса пишется словами через пробел, у слов с кандзи — чтение в скобках:
 * «私[わたし] は 学生[がくせい] です 。». Возвращает слова (без чтений) и чтение каждого (для каны — само слово).
 * Знаки препинания в конце слова отделяются в своё слово.
 */
export function jaTokens(raw: string): { t: string[]; r: string[] } {
  const t: string[] = [], r: string[] = [];
  const push = (w: string, rd: string) => { if (w) { t.push(w); r.push(rd); } };
  for (const part of raw.trim().split(/\s+/)) {
    if (!part) continue;
    const m = /^(.+?)\[([^\]]+)\](.*)$/.exec(part);
    let word = m ? m[1] + m[3] : part;
    let rd = m ? m[2] + m[3] : part;
    const pm = PUNCT_END.exec(word);
    if (pm && pm[1]) {
      word = pm[1];
      rd = rd.slice(0, rd.length - pm[2].length);
      push(word, rd);
      push(pm[2], "");
      continue;
    }
    push(word, WORD.test(word) ? rd : /[0-9０-９]/.test(word) ? word : "");
  }
  return { t, r };
}
/** Японская строка без пробелов и чтений — как её показывать и озвучивать. */
export const plainJa = (raw: string) => (/\s|\[/.test(raw) && KANA_RE.test(raw) ? jaTokens(raw).t.join("") : raw);
/** Чтение японской строки каной (для проверки ответа, набранного каной или ромадзи). */
export const readingJa = (raw: string) => jaTokens(raw).r.join("");

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
export type Sent = { id: string; zh: string; ru: string; t: string[]; lv: number; kana?: string; /** чтения слов (японский) */ r?: string[] };
export type Question = { q: string; o: string[]; a: number };
export type Dialog = { id: string; title: string; theme?: string; level?: number; lines: [string, string, string][]; q: Question[] };
/** Слово урока: иероглифы, пиньинь (как в колоде), значение. */
export type LessonWord = [string, string, string];
/** section — раздел курса (тема, уровень), к которому относится урок: строка «### Раздел» перед уроками. */
/** Грамматика урока: заголовок, объяснение (абзацы), примеры [китайский, перевод], задания на выбор (___ — пропуск). */
export type GramX = { zh: string; ru: string; o: string[]; a: number };
export type Gram = { title: string; text: string[]; ex: [string, string][]; x: GramX[] };
export type Lesson = { title: string; words: LessonWord[]; sents: Sent[]; dialogs: Dialog[]; section?: string; goal?: string; grammar?: Gram[] };
export type ExSet = { id: string; title: string; lessons: Lesson[]; level?: number; about?: string; lang?: "zh" | "ja";
  /** Японский курс: чтения слов с кандзи из предложений и слов урока (для фуриганы). */
  furi?: Record<string, string> };
export type Kind = "tr" | "gap" | "listen" | "dict" | "dialog";
/** Задание: предложение (перевод, пропуск, аудирование), диалог или слово (узнавание: иероглифы → значение или наоборот). */
export type Task = { kind: Exclude<Kind, "dialog">; sent: Sent; tiles?: boolean } | { kind: "dialog"; dialog: Dialog }
  | { kind: "word"; word: LessonWord; dir: "zh" | "ru" | "py" }
  | { kind: "choice"; x: GramX; rule: Gram };

export const KINDS: { id: Kind; name: string; hint: string }[] = [
  { id: "tr", name: "Перевод", hint: "написать по-китайски рукой или с клавиатуры" },
  { id: "gap", name: "Пропуски", hint: "вставить пропущенное слово" },
  { id: "listen", name: "Аудирование", hint: "послушать и собрать предложение" },
  { id: "dict", name: "Диктант", hint: "послушать и написать по-китайски" },
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
 *   + 学习 | xue2 xi2 | учиться         — слово урока (для курса: «Слова урока», узнавание, карточки)
 *   #level: 1   #about: описание       — уровень и описание курса
 *   ### Еда и покупки                  — раздел (тема) для следующих уроков
 */
export function parseExSet(text: string, id: string, seg: (zh: string) => string[]): ExSet {
  const set: ExSet = { id, title: "", lessons: [] };
  // японский курс: «#lang: ja» или кана в тексте (в китайском её нет)
  const ja = /^#lang:\s*ja/im.test(text) || KANA_RE.test(text);
  if (ja) { set.lang = "ja"; set.furi = {}; }
  const jaSeg = (raw: string) => {
    const { t, r } = jaTokens(raw);
    t.forEach((w, i) => { if (HAN.test(w) && r[i] && r[i] !== w) set.furi![w] ??= r[i]; });
    return t;
  };
  let lesson: Lesson | null = null;
  let dialog: Dialog | null = null;
  let section: string | undefined;
  let gram: Gram | null = null;
  const ensureLesson = () => (lesson ??= (set.lessons.push({ title: "Без раздела", words: [], sents: [], dialogs: [], ...(section ? { section } : {}) }), set.lessons[set.lessons.length - 1]));
  const split = (l: string) => l.split(/\s*[|\t]\s*/).map((x) => x.trim());
  let n = 0;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { dialog = null; continue; }
    if (line.startsWith("### ")) { section = line.slice(4).trim() || undefined; lesson = null; dialog = null; continue; }
    if (line.startsWith("## ")) { gram = null; lesson = { title: line.slice(3).trim(), words: [], sents: [], dialogs: [], ...(section ? { section } : {}) }; set.lessons.push(lesson); dialog = null; continue; }
    if (line.startsWith("# ")) { set.title ||= line.slice(2).trim(); continue; }
    if (/^#lang:/i.test(line)) continue;
    const meta = /^#(level|about):\s*(.*)$/i.exec(line);
    if (meta) {
      if (meta[1].toLowerCase() === "level") { const n = Number(meta[2]); if (n > 0) set.level = n; } else set.about = meta[2].trim();
      continue;
    }
    if (line.startsWith("#")) continue;
    // теория урока: «= цель», «& правило», «% объяснение», «%e пример | перевод», «%x 我___学生。 | перевод | 是* | 有»
    if (line.startsWith("= ")) { ensureLesson().goal = line.slice(2).trim(); dialog = null; continue; }
    if (line.startsWith("& ")) { gram = { title: line.slice(2).trim(), text: [], ex: [], x: [] }; (ensureLesson().grammar ??= []).push(gram); dialog = null; continue; }
    if (line.startsWith("%") && gram) {
      if (line.startsWith("%e ")) { const [zh, ru = ""] = split(line.slice(3)); if (zh) { if (ja) jaSeg(zh); gram.ex.push([zh, ru]); } }
      else if (line.startsWith("%x ")) {
        const [zh, ru = "", ...opts] = split(line.slice(3));
        const a = opts.findIndex((o) => o.endsWith("*"));
        if (zh.includes("___") && opts.length >= 2 && a >= 0) {
          if (ja) jaSeg(zh);
          // японский вариант может быть с чтением: «起きます[おきます]*»
          const o = opts.map((x) => {
            const c = x.replace(/\*$/, "").trim();
            const m = /^(.+?)\[([^\]]+)\]$/.exec(c);
            if (m && ja) { set.furi![m[1]] ??= m[2]; return m[1]; }
            return c;
          });
          gram.x.push({ zh, ru, o, a });
        }
      } else gram.text.push(line.slice(1).trim());
      continue;
    }
    if (line.startsWith("+")) {
      const [han, py = "", ru = ""] = split(line.slice(1));
      if (han && WORD.test(han)) {
        ensureLesson().words.push([han, py, ru]);
        if (ja && HAN.test(han) && py) set.furi![han] ??= py.split("/")[0].trim();
      }
      dialog = null;
      continue;
    }
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
      if (m && WORD.test(m[2])) { if (ja) jaSeg(m[2]); dialog.lines.push([m[1].trim(), m[2].trim(), ru]); continue; }
    }
    if (!WORD.test(zhRaw)) continue;
    dialog = null;
    if (ja) {
      const t = jaSeg(zhRaw);
      ensureLesson().sents.push({ id: `${id}:${t.join("")}`, zh: t.join(""), ru, t, lv: 0, kana: readingJa(zhRaw), r: jaTokens(zhRaw).r });
    } else ensureLesson().sents.push({ id: `${id}:${zhRaw}`, zh: zhRaw, ru, t: seg(zhRaw), lv: 0 });
  }
  set.lessons = set.lessons.filter((l) => l.sents.length || l.dialogs.length || l.words.length || l.grammar?.length);
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
    // первые 60 подходящих — вперемешку, чтобы занятия не повторяли один и тот же порядок
    const pool = [...shuffled(sents.slice(0, 60), rnd), ...sents.slice(60)];
    const items: ExItem[] = pool.map((s) => ({ zh: s.zh, ru: s.ru, t: s.t }));
    const order = pickLesson(items, prog, Math.max(0, n - out.length), "");
    order.forEach((i, k) => out.push({ kind: sentKinds[k % sentKinds.length], sent: pool[i] }));
  }
  // диалог — в середину занятия, не первым
  if (out.length > 3 && out[0].kind === "dialog") out.splice(Math.floor(out.length / 2), 0, out.shift()!);
  return out;
}

/* ======================= курсы: урок по шагам ======================= */

export type StepId = "words" | "recog" | "gap" | "build" | "listen" | "dict" | "write" | "dialog";
/** Порядок как в учебнике: теория → текст урока → упражнения от простых к сложным. Id шагов прежние (прогресс сохраняется). */
export const STEPS: { id: StepId; name: string; hint: string }[] = [
  { id: "words", name: "Теория", hint: "цель урока, новые слова, грамматика" },
  { id: "dialog", name: "Текст урока", hint: "прочитать, послушать, ответить" },
  { id: "recog", name: "Слова", hint: "значение, иероглифы, чтение" },
  { id: "gap", name: "Грамматика", hint: "правила урока и пропуски" },
  { id: "build", name: "Сборка фраз", hint: "собрать перевод из слов" },
  { id: "listen", name: "Аудирование", hint: "услышать и собрать" },
  { id: "dict", name: "Диктант", hint: "услышать и написать" },
  { id: "write", name: "Перевод", hint: "написать по-китайски" },
];
/** Название шага в этом уроке: без грамматики «Теория» — это «Слова урока», «Грамматика» — «Пропуски». */
export function stepName(id: StepId, l: Lesson): string {
  const g = !!l.grammar?.length;
  if (id === "words" && !g) return "Слова урока";
  if (id === "gap" && !g) return "Пропуски";
  return STEPS.find((s) => s.id === id)!.name;
}
/** Шаг засчитан, если верно не меньше этой доли заданий. */
export const PASS = 0.7;

/** Шаги со звуком: без возможности слушать их можно пропускать (режим «Без звука»). */
export const AUDIO_STEPS: StepId[] = ["listen", "dict"];

/** Шаги, которые есть в уроке (без слов нет узнавания, без предложений — сборки и т. д.); quiet — без аудирования и диктанта. */
export function lessonSteps(l: Lesson, quiet = false): StepId[] {
  const withRu = l.sents.filter((s) => s.ru).length;
  const gx = (l.grammar ?? []).reduce((a, g) => a + g.x.length, 0);
  const out: StepId[] = [];
  if (l.words.length || l.grammar?.length) out.push("words");
  if (l.dialogs.length) out.push("dialog");
  if (l.words.length >= 2) out.push("recog");
  if (l.sents.length >= 2 || gx >= 2) out.push("gap");
  if (withRu >= 2) out.push("build");
  if (l.sents.length >= 2 && !quiet) out.push("listen");
  if (l.sents.length >= 2 && !quiet) out.push("dict");
  if (withRu >= 2) out.push("write");
  return out;
}

/** Теория необязательна: её можно пропустить и открыть в любой момент. */
const required = (s: StepId) => s !== "words";
/** Открыт ли шаг: все предыдущие обязательные шаги урока пройдены. */
export function stepOpen(steps: StepId[], best: Partial<Record<StepId, number>>, i: number): boolean {
  return steps.slice(0, i).filter(required).every((s) => (best[s] ?? 0) >= PASS);
}

/** Урок пройден: все обязательные шаги засчитаны. */
export const lessonDone = (steps: StepId[], best: Partial<Record<StepId, number>>) => steps.some(required) ? steps.filter(required).every((s) => (best[s] ?? 0) >= PASS) : steps.length > 0 && steps.every((s) => (best[s] ?? 0) >= PASS);

/** Короткое значение для вариантов ответа: до первой «;», без пометок в скобках. */
export function shortRu(ru: string): string {
  const t = ru.replace(/\([^)]*\)/g, "").split(/[;；]/)[0].trim();
  return (t.length > 40 ? t.slice(0, 40).replace(/[,\s]+[^,\s]*$/, "") + "…" : t) || ru;
}


/** Варианты для узнавания слова: верный и 3 других из урока, потом из курса; без повторов значения. */
export function wordOptions(word: LessonWord, lesson: LessonWord[], course: LessonWord[], dir: "zh" | "ru", rnd: () => number): string[] {
  const key = (w: LessonWord) => (dir === "zh" ? shortRu(w[2]) : w[0]);
  const right = key(word);
  const opts = [right];
  for (const list of [lesson, course]) {
    for (const w of shuffled(list.filter((x) => x[0] !== word[0]), rnd)) {
      if (opts.length >= 4) break;
      const c = key(w);
      if (!opts.includes(c)) opts.push(c);
    }
  }
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return opts;
}


/**
 * Варианты чтения слова (пиньинь с цифрами): верный, тот же слог с другими тонами и чтения других слов той же длины.
 * Возвращает 4 строки (или меньше, если не из чего).
 */
/** Пиньинь слова в виде варианта ответа (как в pinyinOptions): слоги через пробел, первый вариант тона. */
export const pinyinKey = (p: string) => p.trim().toLowerCase().split(/\s+/).map((x) => x.split("/")[0]).join(" ");

export function pinyinOptions(py: string, others: string[], rnd: () => number): string[] {
  const norm = pinyinKey;
  const right = norm(py);
  const syl = right.split(" ");
  const opts = [right];
  const add = (o: string) => { if (opts.length < 4 && !opts.includes(o)) opts.push(o); };
  // другие тоны: меняем тон одного слога (или двух)
  for (let k = 0; k < 12 && opts.length < 3; k++) {
    const i = Math.floor(rnd() * syl.length);
    const m = /^(.*?)([1-5])$/.exec(syl[i]);
    if (!m) break;
    const t = 1 + Math.floor(rnd() * 4);
    if (String(t) === m[2]) continue;
    add(syl.map((x, j) => (j === i ? m[1] + t : x)).join(" "));
  }
  for (const o of shuffled(others.map(norm).filter((o) => o.split(" ").length === syl.length), rnd)) add(o);
  return shuffled(opts, rnd);
}

/** Задания шага урока. Предложения — сначала новые и с ошибками (prog), слова — в обе стороны. */
export function stepTasks(step: StepId, l: Lesson, prog: ExProgress, rnd: () => number): Task[] {
  // вперемешку: сначала новые и с ошибками (pickLesson), но внутри — в случайном порядке
  const order = (list: Sent[], n: number) => { const sh = shuffled(list, rnd); return pickLesson(sh.map((s) => ({ zh: s.zh, ru: s.ru, t: s.t })), prog, n).map((i) => sh[i]); };
  const withRu = l.sents.filter((s) => s.ru);
  switch (step) {
    case "recog": {
      // разные виды вперемешку: значение, иероглифы, чтение (пиньинь)
      const ws = shuffled(l.words, rnd).slice(0, 8);
      const zh = ws.map((w): Task => ({ kind: "word", word: w, dir: "zh" }));
      const ru = shuffled(ws, rnd).slice(0, Math.min(ws.length, 5)).map((w): Task => ({ kind: "word", word: w, dir: "ru" }));
      const py = shuffled(ws.filter((w) => w[1]), rnd).slice(0, 3).map((w): Task => ({ kind: "word", word: w, dir: "py" }));
      return shuffled([...zh, ...ru, ...py], rnd);
    }
    case "gap": {
      const gx = gramTasks(l, rnd, 6);
      return shuffled([...gx, ...order(l.sents, gx.length ? 4 : 8).map((s): Task => ({ kind: "gap", sent: s }))], rnd);
    }
    case "build": return order(withRu, 6).map((s) => ({ kind: "tr", sent: s, tiles: true }));
    case "listen": return order(l.sents, 6).map((s) => ({ kind: "listen", sent: s }));
    case "dict": return order(l.sents, 5).map((s) => ({ kind: "dict", sent: s }));
    case "write": return [...order(withRu, 5).map((s): Task => ({ kind: "tr", sent: s, tiles: false })), ...gramTasks(l, rnd, 2)];
    case "dialog": return l.dialogs.map((d) => ({ kind: "dialog", dialog: d }));
    default: return [];
  }
}

/** Задания на грамматику урока (выбор пропущенного), не больше n. */
export function gramTasks(l: Lesson, rnd: () => number, n: number): Task[] {
  return shuffled((l.grammar ?? []).flatMap((g) => g.x.map((x): Task => ({ kind: "choice", x, rule: g }))), rnd).slice(0, n);
}

/** Повторение пройденного: из нескольких уроков — слабые и давние предложения разными видами, плюс слова. */
export function reviewTasks(lessons: Lesson[], prog: ExProgress, n: number, rnd: () => number, quiet = false): Task[] {
  const sents = lessons.flatMap((l) => l.sents);
  const words = lessons.flatMap((l) => l.words);
  const kinds: ("gap" | "build" | "listen" | "write")[] = quiet ? ["gap", "build", "write"] : ["gap", "build", "listen", "write"];
  const out: Task[] = [];
  const sh = shuffled(sents, rnd);
  const picked = pickLesson(sh.map((s) => ({ zh: s.zh, ru: s.ru, t: s.t })), prog, Math.max(0, n - 3)).map((i) => sh[i]);
  picked.forEach((s, k) => {
    const kind = kinds[k % kinds.length];
    if (!s.ru && (kind === "build" || kind === "write")) out.push({ kind: "gap", sent: s });
    else if (kind === "build" || kind === "write") out.push({ kind: "tr", sent: s, tiles: kind === "build" });
    else out.push({ kind, sent: s });
  });
  for (const l of shuffled(lessons, rnd).slice(0, 2)) out.push(...gramTasks(l, rnd, 1));
  for (const w of shuffled(words, rnd).slice(0, Math.max(0, n - out.length))) out.push({ kind: "word", word: w, dir: rnd() < 0.5 ? "zh" : "ru" });
  return shuffled(out, rnd);
}
