/**
 * Экзамен HSK 3.0 (уровни 1–3): формат по образцам 2025 года (число заданий и время), типы заданий — по схеме
 * прежнего HSK (картинки, верно/неверно, выбор ответа, пропуски, порядок слов, иероглиф по пиньиню).
 * Задания свои (scripts/hsk/), собираются в data/hsk/N.json; вариант экзамена каждый раз собирается из банка заново.
 */

export type Sec = "L" | "R" | "W";
/** Вариант ответа: текст (китайский) или картинка (эмодзи-иллюстрация). */
export type Opt = { t?: string; p?: string };
/**
 * Задание банка. choice — выбрать вариант (в т. ч. верно/неверно), order — составить предложение из слов,
 * write — вписать иероглиф(ы) по пиньиню.
 *  audio — что звучит (строки; реплики диалога «男：…»/«女：…»), text — текст на экране, q — вопрос, pic — картинка задания.
 *  ru — перевод для разбора, py — пиньиню для write, words — слова для order (в правильном порядке).
 */
export type Item = {
  id: string; part: string; kind: "choice" | "order" | "write";
  audio?: string[]; text?: string; q?: string; pic?: string;
  opts?: Opt[]; a?: number; ans?: string; py?: string; words?: string[]; ru?: string;
};
export type Part = { id: string; sec: Sec; n: number; title: string; zh: string };
export type LevelSpec = { level: number; minutes: Record<Sec, number>; parts: Part[] };

const P = (id: string, sec: Sec, n: number, title: string, zh: string): Part => ({ id, sec, n, title, zh });

/** Формат уровней (HSK 3.0, образцы 2025: уровень 1 — 40 заданий, 2 — 60, 3 — 70). */
export const LEVELS: LevelSpec[] = [
  { level: 1, minutes: { L: 15, R: 20, W: 0 }, parts: [
    P("1L1", "L", 5, "Послушайте и решите: верно ли подписана картинка", "判断对错"),
    P("1L2", "L", 5, "Послушайте фразу и выберите картинку", "选择图片"),
    P("1L3", "L", 5, "Послушайте диалог и выберите картинку", "选择图片"),
    P("1L4", "L", 5, "Послушайте и ответьте на вопрос", "选择正确答案"),
    P("1R1", "R", 5, "Какая картинка подходит к слову", "选择图片"),
    P("1R2", "R", 5, "Какая картинка подходит к предложению", "选择图片"),
    P("1R3", "R", 5, "Выберите ответ на вопрос", "选择回答"),
    P("1R4", "R", 5, "Вставьте пропущенное слово", "选词填空"),
  ] },
  { level: 2, minutes: { L: 17, R: 25, W: 10 }, parts: [
    P("2L1", "L", 5, "Послушайте фразу и решите: соответствует ли картинка", "判断对错"),
    P("2L2", "L", 5, "Послушайте диалог и выберите картинку", "选择图片"),
    P("2L3", "L", 10, "Послушайте диалог и ответьте на вопрос", "选择正确答案"),
    P("2L4", "L", 5, "Послушайте длинный диалог и ответьте на вопрос", "选择正确答案"),
    P("2R1", "R", 5, "Какая картинка подходит к предложению", "选择图片"),
    P("2R2", "R", 5, "Вставьте пропущенное слово", "选词填空"),
    P("2R3", "R", 5, "Прочитайте и решите: верно ли утверждение ★", "判断对错"),
    P("2R4", "R", 5, "Выберите ответ на вопрос", "选择回答"),
    P("2R5", "R", 5, "Прочитайте текст и ответьте на вопрос", "阅读理解"),
    P("2W1", "W", 5, "Составьте предложение из слов", "完成句子"),
    P("2W2", "W", 5, "Впишите иероглиф по пиньиню", "写汉字"),
  ] },
  { level: 3, minutes: { L: 23, R: 30, W: 20 }, parts: [
    P("3L1", "L", 5, "Послушайте диалог и выберите картинку", "选择图片"),
    P("3L2", "L", 10, "Послушайте и решите: верно ли утверждение ★", "判断对错"),
    P("3L3", "L", 10, "Послушайте диалог и ответьте на вопрос", "选择正确答案"),
    P("3L4", "L", 5, "Послушайте длинный диалог и ответьте на вопрос", "选择正确答案"),
    P("3R1", "R", 5, "Выберите ответ на вопрос", "选择回答"),
    P("3R2", "R", 10, "Вставьте пропущенное слово", "选词填空"),
    P("3R3", "R", 15, "Прочитайте текст и ответьте на вопрос", "阅读理解"),
    P("3W1", "W", 5, "Составьте предложение из слов", "完成句子"),
    P("3W2", "W", 5, "Впишите иероглиф по пиньиню", "写汉字"),
  ] },
];
export const levelSpec = (lv: number) => LEVELS.find((l) => l.level === lv);
export const SEC_NAME: Record<Sec, string> = { L: "Аудирование", R: "Чтение", W: "Письмо" };
export const SEC_ZH: Record<Sec, string> = { L: "听力", R: "阅读", W: "书写" };

/** Ступени сложности: тренировка (пиньинь, перевод, без таймера), как на экзамене, сложнее (одно прослушивание, быстрее, меньше времени). */
export type Mode = "train" | "exam" | "hard";
export const MODES: { id: Mode; name: string; hint: string }[] = [
  { id: "train", name: "Тренировка", hint: "пиньинь и перевод по кнопке, разбор сразу, без таймера" },
  { id: "exam", name: "Экзамен", hint: "как на настоящем экзамене: таймер, аудио дважды, разбор в конце" },
  { id: "hard", name: "Сложнее", hint: "сложнее экзамена: аудио один раз и быстрее, времени на треть меньше" },
];

/* ---------- банк: разбор файла ---------- */

const HAN = /\p{Script=Han}/u;
const split = (s: string) => s.split("|").map((x) => x.trim());
const optsOf = (s: string) => s.split(/[;；]/).map((x) => x.trim()).filter(Boolean);
/** «A；B*；C» → варианты и номер верного (звёздочка). */
function starOpts(s: string): { opts: Opt[]; a: number } {
  const list = optsOf(s);
  const a = list.findIndex((x) => x.endsWith("*"));
  return { opts: list.map((x) => ({ t: x.replace(/\*$/, "").trim() })), a };
}
const picsOf = (s: string): Opt[] => [...s.trim()].length ? s.trim().split(/\s+/).map((p) => ({ p })) : [];
/** Аудио: реплики через « / ». */
const audioOf = (s: string) => s.split(/\s+\/\s+/).map((x) => x.trim()).filter(Boolean);

/**
 * Файл банка: «== 1L3» — часть, дальше строки по её виду (поля через «|», варианты через «;», верный — «*»,
 * последнее поле «= перевод» необязательно). Виды строк:
 *  картинка и подпись (L1 ур.1, R1):   🍎 | 苹果 | +            (+ верно, − неверно)  / R1: 苹果 | 🍎 🚕 🐱 | 1
 *  звучит → картинка (L2, L3, R2, …):  他在喝茶。 | 🍵 🚕 📖 | 1     (диалог: 男：…  / 女：…)
 *  звучит/текст + вопрос → ответ:      男：… / 女：… | 问题？ | 答案；答案*；答案
 *  вопрос → ответ (R «选择回答»):        你去哪儿？ | 去学校*；三个；很好
 *  пропуск:                             我___喝茶。 | 想*；是；有
 *  верно ли ★:                          текст | ★ утверждение | +
 *  порядок слов (W1):                   我 / 想 / 喝 / 茶
 *  иероглиф по пиньиню (W2):            我想喝___。 | 茶 | chá
 */
export function parseBank(src: string): Item[] {
  const out: Item[] = [];
  let part = "";
  let n = 0;
  for (const raw of src.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^==\s*(\d[LRW]\d)\s*$/.exec(line);
    if (m) { part = m[1]; continue; }
    if (!part) continue;
    let ru: string | undefined;
    let body = line;
    const tr = line.lastIndexOf("| =");
    if (tr >= 0) { ru = line.slice(tr + 3).trim(); body = line.slice(0, tr).trim(); }
    const f = split(body);
    const id = `${part}-${++n}`;
    const t = part.slice(1);
    const it = itemOf(id, part, t, f, ru);
    if (it) out.push(it);
  }
  return out;
}

function itemOf(id: string, part: string, t: string, f: string[], ru?: string): Item | null {
  const base = { id, part, ...(ru ? { ru } : {}) };
  const tf = (s: string) => (s === "+" ? 0 : s === "-" || s === "−" ? 1 : -1);
  const TF: Opt[] = [{ t: "对" }, { t: "错" }];
  // уровень 1, аудирование 1: картинка + звучит слово/фраза → верно/неверно
  if (part === "1L1") { const a = tf(f[2]); return f[0] && f[1] && a >= 0 ? { ...base, kind: "choice", pic: f[0], audio: [f[1]], opts: TF, a } : null; }
  // уровень 2, аудирование 1: звучит фраза, картинка → верно/неверно
  if (part === "2L1") { const a = tf(f[2]); return f[0] && f[1] && a >= 0 ? { ...base, kind: "choice", audio: audioOf(f[0]), pic: f[1], opts: TF, a } : null; }
  // «★ верно ли»: текст/аудио + утверждение
  if (part === "2R3" || part === "3L2") {
    const a = tf(f[2]);
    if (!f[0] || !f[1] || a < 0) return null;
    const st = f[1].replace(/^★\s*/, "");
    return part === "3L2" ? { ...base, kind: "choice", audio: audioOf(f[0]), q: `★ ${st}`, opts: TF, a } : { ...base, kind: "choice", text: f[0], q: `★ ${st}`, opts: TF, a };
  }
  // слово/предложение → картинка (чтение)
  if (part === "1R1" || part === "1R2" || part === "2R1") {
    const opts = picsOf(f[1] ?? ""), a = Number(f[2]) - 1;
    return f[0] && opts.length >= 2 && a >= 0 && a < opts.length ? { ...base, kind: "choice", text: f[0], opts, a } : null;
  }
  // звучит → картинка
  if (part === "1L2" || part === "1L3" || part === "2L2" || part === "3L1") {
    const opts = picsOf(f[1] ?? ""), a = Number(f[2]) - 1;
    return f[0] && opts.length >= 2 && a >= 0 && a < opts.length ? { ...base, kind: "choice", audio: audioOf(f[0]), opts, a } : null;
  }
  // звучит + вопрос → ответ
  if (part === "1L4" || part === "2L3" || part === "2L4" || part === "3L3" || part === "3L4") {
    const { opts, a } = starOpts(f[2] ?? "");
    return f[0] && f[1] && opts.length >= 2 && a >= 0 ? { ...base, kind: "choice", audio: audioOf(f[0]), q: f[1], opts, a } : null;
  }
  // текст + вопрос → ответ
  if (part === "2R5" || part === "3R3") {
    const { opts, a } = starOpts(f[2] ?? "");
    return f[0] && f[1] && opts.length >= 2 && a >= 0 ? { ...base, kind: "choice", text: f[0], q: f[1], opts, a } : null;
  }
  // вопрос → ответ; пропуск
  if (part === "1R3" || part === "2R4" || part === "3R1" || part === "1R4" || part === "2R2" || part === "3R2") {
    const { opts, a } = starOpts(f[1] ?? "");
    if (!f[0] || opts.length < 2 || a < 0) return null;
    if ((part === "1R4" || part === "2R2" || part === "3R2") && !f[0].includes("___")) return null;
    return { ...base, kind: "choice", text: f[0], opts, a };
  }
  if (t === "W1") {
    const words = f[0].split("/").map((x) => x.trim()).filter(Boolean);
    return words.length >= 3 ? { ...base, kind: "order", words, ans: words.join("") } : null;
  }
  if (t === "W2") return f[0]?.includes("___") && f[1] && HAN.test(f[1]) && f[2] ? { ...base, kind: "write", text: f[0], ans: f[1], py: f[2] } : null;
  return null;
}

/* ---------- сборка варианта ---------- */

/** Вариант экзамена: по каждой части — n заданий из банка; сначала те, что давно не попадались (seen: id → время). */
export function assemble(spec: LevelSpec, bank: Item[], seen: Record<string, number>, rnd: () => number, secs?: Sec[]): { part: Part; items: Item[] }[] {
  return spec.parts.filter((p) => !secs || secs.includes(p.sec)).map((part) => {
    const pool = bank.filter((it) => it.part === part.id).map((it) => ({ it, k: (seen[it.id] ?? 0) + rnd() * 1e6 }));
    pool.sort((a, b) => a.k - b.k);
    return { part, items: pool.slice(0, part.n).map((x) => x.it) };
  }).filter((x) => x.items.length);
}

/** Перемешать варианты ответа (кроме «对/错»); возвращает задание с новым порядком и номером верного. */
export function shuffleOpts(it: Item, rnd: () => number): Item {
  if (it.kind !== "choice" || !it.opts || it.opts.length < 3) return it;
  const idx = it.opts.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...it, opts: idx.map((i) => it.opts![i]), a: idx.indexOf(it.a!) };
}

/** Верен ли ответ. choice — номер варианта; order — слова в порядке; write — строка. */
export function isRight(it: Item, ans: number | string | string[] | null | undefined): boolean {
  if (ans === null || ans === undefined) return false;
  if (it.kind === "choice") return ans === it.a;
  const norm = (s: string) => s.replace(/[\s，。？！,.?!]/g, "");
  if (it.kind === "order") return norm(Array.isArray(ans) ? ans.join("") : String(ans)) === norm(it.ans ?? "");
  return norm(String(ans)) === norm(it.ans ?? "");
}

export type Score = { sec: Record<Sec, { right: number; total: number; points: number }>; total: number; max: number; passed: boolean };
/** Баллы: каждая часть экзамена — из 100 (как в HSK), «сдал» — ориентир 60% от суммы (официальный порог HSK 3.0 ещё не опубликован). */
export const PASS_SHARE = 0.6;
export function scoreExam(items: { item: Item; sec: Sec; ans: unknown }[]): Score {
  const sec = { L: { right: 0, total: 0, points: 0 }, R: { right: 0, total: 0, points: 0 }, W: { right: 0, total: 0, points: 0 } };
  for (const x of items) {
    const s = sec[x.sec];
    s.total++;
    if (isRight(x.item, x.ans as never)) s.right++;
  }
  let total = 0, max = 0;
  for (const k of ["L", "R", "W"] as Sec[]) {
    const s = sec[k];
    if (!s.total) continue;
    s.points = Math.round((100 * s.right) / s.total);
    total += s.points; max += 100;
  }
  return { sec, total, max, passed: max > 0 && total >= max * PASS_SHARE };
}
