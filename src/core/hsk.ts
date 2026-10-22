/**
 * Экзамен HSK 3.0 (уровни 1–6): уровни 1–3 — формат по образцам 2025 года (число заданий и время), 4–6 — формат
 * прежнего HSK 4–6 (образцы нового пока не опубликованы); типы заданий — по схеме прежнего HSK (картинки, верно/неверно, выбор ответа, пропуски, порядок слов, иероглиф по пиньиню).
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
  id: string; part: string; kind: "choice" | "order" | "write" | "free";
  audio?: string[]; text?: string; q?: string; pic?: string;
  opts?: Opt[]; a?: number; ans?: string; py?: string; words?: string[]; ru?: string;
  /** Общий текст/запись для нескольких вопросов (группа собирается в вариант целиком). */
  grp?: string;
  /** free: слова, которые нужно использовать, и минимум знаков; ans — образец. */
  need?: string[]; min?: number;
};
/**
 * Вид строк части (fmt):
 *  pic_tf_a — картинка + звучит слово → верно/неверно; a_tf_pic — звучит фраза + картинка → верно/неверно;
 *  t_pic / a_pic — текст/запись → картинка; star_a / star_t — запись/текст + «★ утверждение» → верно/неверно;
 *  a_q / t_q — запись/текст + вопрос → ответ (можно группой: «>> общий текст», затем «? вопрос | варианты»);
 *  q_ans — вопрос или задание → вариант; gap — то же, но с пропуском ___; order — порядок слов/предложений;
 *  pyw — иероглиф по пиньиню; free — написать своё (предложение, сочинение, пересказ).
 */
export type Fmt = "pic_tf_a" | "a_tf_pic" | "t_pic" | "a_pic" | "star_a" | "star_t" | "a_q" | "t_q" | "q_ans" | "gap" | "order" | "pyw" | "free";
export type Part = { id: string; sec: Sec; n: number; title: string; zh: string; fmt: Fmt };
export type LevelSpec = { level: number; minutes: Record<Sec, number>; parts: Part[] };

const P = (id: string, sec: Sec, n: number, title: string, zh: string, fmt: Fmt): Part => ({ id, sec, n, title, zh, fmt });

/** Формат уровней (HSK 3.0, образцы 2025: уровень 1 — 40 заданий, 2 — 60, 3 — 70). */
export const LEVELS: LevelSpec[] = [
  { level: 1, minutes: { L: 15, R: 20, W: 0 }, parts: [
    P("1L1", "L", 5, "Послушайте и решите: верно ли подписана картинка", "判断对错", "pic_tf_a"),
    P("1L2", "L", 5, "Послушайте фразу и выберите картинку", "选择图片", "a_pic"),
    P("1L3", "L", 5, "Послушайте диалог и выберите картинку", "选择图片", "a_pic"),
    P("1L4", "L", 5, "Послушайте и ответьте на вопрос", "选择正确答案", "a_q"),
    P("1R1", "R", 5, "Какая картинка подходит к слову", "选择图片", "t_pic"),
    P("1R2", "R", 5, "Какая картинка подходит к предложению", "选择图片", "t_pic"),
    P("1R3", "R", 5, "Выберите ответ на вопрос", "选择回答", "q_ans"),
    P("1R4", "R", 5, "Вставьте пропущенное слово", "选词填空", "gap"),
  ] },
  { level: 2, minutes: { L: 17, R: 25, W: 10 }, parts: [
    P("2L1", "L", 5, "Послушайте фразу и решите: соответствует ли картинка", "判断对错", "a_tf_pic"),
    P("2L2", "L", 5, "Послушайте диалог и выберите картинку", "选择图片", "a_pic"),
    P("2L3", "L", 10, "Послушайте диалог и ответьте на вопрос", "选择正确答案", "a_q"),
    P("2L4", "L", 5, "Послушайте длинный диалог и ответьте на вопрос", "选择正确答案", "a_q"),
    P("2R1", "R", 5, "Какая картинка подходит к предложению", "选择图片", "t_pic"),
    P("2R2", "R", 5, "Вставьте пропущенное слово", "选词填空", "gap"),
    P("2R3", "R", 5, "Прочитайте и решите: верно ли утверждение ★", "判断对错", "star_t"),
    P("2R4", "R", 5, "Выберите ответ на вопрос", "选择回答", "q_ans"),
    P("2R5", "R", 5, "Прочитайте текст и ответьте на вопрос", "阅读理解", "t_q"),
    P("2W1", "W", 5, "Составьте предложение из слов", "完成句子", "order"),
    P("2W2", "W", 5, "Впишите иероглиф по пиньиню", "写汉字", "pyw"),
  ] },
  { level: 3, minutes: { L: 23, R: 30, W: 20 }, parts: [
    P("3L1", "L", 5, "Послушайте диалог и выберите картинку", "选择图片", "a_pic"),
    P("3L2", "L", 10, "Послушайте и решите: верно ли утверждение ★", "判断对错", "star_a"),
    P("3L3", "L", 10, "Послушайте диалог и ответьте на вопрос", "选择正确答案", "a_q"),
    P("3L4", "L", 5, "Послушайте длинный диалог и ответьте на вопрос", "选择正确答案", "a_q"),
    P("3R1", "R", 5, "Выберите ответ на вопрос", "选择回答", "q_ans"),
    P("3R2", "R", 10, "Вставьте пропущенное слово", "选词填空", "gap"),
    P("3R3", "R", 15, "Прочитайте текст и ответьте на вопрос", "阅读理解", "t_q"),
    P("3W1", "W", 5, "Составьте предложение из слов", "完成句子", "order"),
    P("3W2", "W", 5, "Впишите иероглиф по пиньиню", "写汉字", "pyw"),
  ] },
  // Уровни 4–6: официальные виды заданий нового формата не опубликованы — схема прежнего HSK 4–6, слова HSK 3.0.
  { level: 4, minutes: { L: 30, R: 40, W: 25 }, parts: [
    P("4L1", "L", 10, "Послушайте и решите: верно ли утверждение ★", "判断对错", "star_a"),
    P("4L2", "L", 15, "Послушайте короткий диалог и ответьте на вопрос", "选择正确答案", "a_q"),
    P("4L3", "L", 20, "Послушайте диалог или рассказ и ответьте на вопросы", "选择正确答案", "a_q"),
    P("4R1", "R", 10, "Вставьте пропущенное слово", "选词填空", "gap"),
    P("4R2", "R", 10, "Расставьте предложения по порядку", "排列顺序", "order"),
    P("4R3", "R", 20, "Прочитайте текст и ответьте на вопросы", "阅读理解", "t_q"),
    P("4W1", "W", 10, "Составьте предложение из слов", "完成句子", "order"),
    P("4W2", "W", 5, "Напишите предложение по картинке со словом", "看图，用词造句", "free"),
  ] },
  { level: 5, minutes: { L: 30, R: 45, W: 40 }, parts: [
    P("5L1", "L", 20, "Послушайте короткий диалог и ответьте на вопрос", "选择正确答案", "a_q"),
    P("5L2", "L", 25, "Послушайте диалог или рассказ и ответьте на вопросы", "选择正确答案", "a_q"),
    P("5R1", "R", 15, "Выберите слово или фразу для пропуска в тексте", "选词填空", "t_q"),
    P("5R2", "R", 10, "Выберите утверждение, которое соответствует тексту", "选择与原文一致的一项", "t_q"),
    P("5R3", "R", 20, "Прочитайте текст и ответьте на вопросы", "阅读理解", "t_q"),
    P("5W1", "W", 8, "Составьте предложение из слов", "完成句子", "order"),
    P("5W2", "W", 2, "Напишите короткий текст (около 80 знаков)", "写短文", "free"),
  ] },
  { level: 6, minutes: { L: 35, R: 50, W: 45 }, parts: [
    P("6L1", "L", 15, "Послушайте и выберите, что соответствует записи", "选择与录音内容一致的一项", "a_q"),
    P("6L2", "L", 15, "Послушайте интервью и ответьте на вопросы", "听采访回答问题", "a_q"),
    P("6L3", "L", 20, "Послушайте рассказ и ответьте на вопросы", "选择正确答案", "a_q"),
    P("6R1", "R", 10, "Найдите предложение с ошибкой", "找出有语病的句子", "q_ans"),
    P("6R2", "R", 10, "Выберите слова для пропусков", "选词填空", "t_q"),
    P("6R3", "R", 10, "Вставьте предложения в текст", "选句填空", "t_q"),
    P("6R4", "R", 20, "Прочитайте текст и ответьте на вопросы", "阅读理解", "t_q"),
    P("6W1", "W", 1, "Прочитайте рассказ и перескажите его (около 400 знаков)", "缩写", "free"),
  ] },
];
export const levelSpec = (lv: number) => LEVELS.find((l) => l.level === lv);
export const SEC_NAME: Record<Sec, string> = { L: "Аудирование", R: "Чтение", W: "Письмо" };
export const SEC_ZH: Record<Sec, string> = { L: "听力", R: "阅读", W: "书写" };

/** Ступени сложности: тренировка (пиньинь, перевод, без таймера), как на экзамене, сложнее (одно прослушивание, быстрее, меньше времени). */
export type Mode = "train" | "exam" | "hard";
export const MODES: { id: Mode; name: string; hint: string }[] = [
  { id: "train", name: "Тренировка", hint: "пиньинь и перевод по кнопке, разбор сразу, без таймера" },
  { id: "exam", name: "Экзамен", hint: "таймер, аудио дважды, разбор в конце" },
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

const FMT: Record<string, Fmt> = Object.fromEntries(LEVELS.flatMap((l) => l.parts.map((p) => [p.id, p.fmt])));

/**
 * Файл банка: «== 4L3» — часть, дальше строки по её виду (fmt части; поля через «|», варианты через «；», верный — «*»,
 * последнее поле «= перевод» необязательно). Примеры:
 *  pic_tf_a: 🍎 | 苹果 | +        a_tf_pic: 他在喝茶。 | 🍵 | +       t_pic / a_pic: 他在喝茶。 | 🍵 🚕 📖 | 1
 *  star_a / star_t: текст | ★ утверждение | +      a_q / t_q: 男：… / 女：… | 问题？ | 答案；答案*；答案
 *  q_ans: 你去哪儿？ | 去学校*；三个；很好          gap: 我___喝茶。 | 想*；是；有
 *  order: 我 / 想 / 喝 / 茶 (в правильном порядке)  pyw: 我想喝___。 | 茶 | chá
 *  free: стимул (картинка или текст) | нужные слова через пробел или «-» | минимум знаков | образец
 * Группа (a_q, t_q): «>> общий текст или запись» (можно «| = перевод»), затем строки «? вопрос | варианты».
 */
export function parseBank(src: string): Item[] {
  const out: Item[] = [];
  let part = "";
  let n = 0, g = 0;
  let group: { text: string; ru?: string; id: string } | null = null;
  for (const raw of src.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^==\s*(\d[LRW]\d)\s*$/.exec(line);
    if (m) { part = m[1]; group = null; continue; }
    if (!part) continue;
    let ru: string | undefined;
    let body = line;
    const tr = line.lastIndexOf("| =");
    if (tr >= 0) { ru = line.slice(tr + 3).trim(); body = line.slice(0, tr).trim(); }
    if (body.startsWith(">>")) { group = { text: body.slice(2).trim(), ru, id: `${part}-g${++g}` }; continue; }
    const fmt = FMT[part];
    const id = `${part}-${++n}`;
    let it: Item | null = null;
    if (body.startsWith("?")) {
      if (group && (fmt === "a_q" || fmt === "t_q")) it = itemOf(id, part, fmt, [group.text, ...split(body.slice(1))], group.ru ?? ru, group.id, group.ru ? ru : undefined);
    } else {
      group = null;
      if (fmt) it = itemOf(id, part, fmt, split(body), ru);
    }
    if (it) out.push(it);
  }
  return out;
}

function itemOf(id: string, part: string, fmt: Fmt, f: string[], ru?: string, grp?: string, qru?: string): Item | null {
  const base = { id, part, ...(ru ? { ru } : {}), ...(grp ? { grp } : {}) };
  const tf = (s: string) => (s === "+" ? 0 : s === "-" || s === "−" ? 1 : -1);
  const TF: Opt[] = [{ t: "对" }, { t: "错" }];
  const qr = qru ? { ru: `${ru ?? ""}${ru ? " — " : ""}${qru}` } : {};
  switch (fmt) {
    case "pic_tf_a": { const a = tf(f[2]); return f[0] && f[1] && a >= 0 ? { ...base, kind: "choice", pic: f[0], audio: [f[1]], opts: TF, a } : null; }
    case "a_tf_pic": { const a = tf(f[2]); return f[0] && f[1] && a >= 0 ? { ...base, kind: "choice", audio: audioOf(f[0]), pic: f[1], opts: TF, a } : null; }
    case "star_a": case "star_t": {
      const a = tf(f[2]);
      if (!f[0] || !f[1] || a < 0) return null;
      const q = `★ ${f[1].replace(/^★\s*/, "")}`;
      return fmt === "star_a" ? { ...base, kind: "choice", audio: audioOf(f[0]), q, opts: TF, a } : { ...base, kind: "choice", text: f[0], q, opts: TF, a };
    }
    case "t_pic": case "a_pic": {
      const opts = picsOf(f[1] ?? ""), a = Number(f[2]) - 1;
      if (!f[0] || opts.length < 2 || !(a >= 0 && a < opts.length)) return null;
      return fmt === "t_pic" ? { ...base, kind: "choice", text: f[0], opts, a } : { ...base, kind: "choice", audio: audioOf(f[0]), opts, a };
    }
    case "a_q": case "t_q": {
      const { opts, a } = starOpts(f[2] ?? "");
      if (!f[0] || !f[1] || opts.length < 2 || a < 0) return null;
      return fmt === "a_q" ? { ...base, ...qr, kind: "choice", audio: audioOf(f[0]), q: f[1], opts, a } : { ...base, ...qr, kind: "choice", text: f[0], q: f[1], opts, a };
    }
    case "q_ans": case "gap": {
      const { opts, a } = starOpts(f[1] ?? "");
      if (!f[0] || opts.length < 2 || a < 0) return null;
      if (fmt === "gap" && !f[0].includes("___")) return null;
      return { ...base, kind: "choice", text: f[0], opts, a };
    }
    case "order": {
      // знаки в конце кусков не показываем — по ним легко угадать первое и последнее предложение
      const words = f[0].split("/").map((x) => x.trim().replace(/[，。！？,.!?；;]+$/, "")).filter(Boolean);
      return words.length >= 3 ? { ...base, kind: "order", words, ans: words.join("") } : null;
    }
    case "pyw": return f[0]?.includes("___") && f[1] && HAN.test(f[1]) && f[2] ? { ...base, kind: "write", text: f[0], ans: f[1], py: f[2] } : null;
    case "free": {
      const need = (f[1] ?? "").split(/\s+/).filter((w) => w && w !== "-");
      const min = Number(f[2]);
      if (!f[0] || !(min > 0) || !f[3]) return null;
      const stim = HAN.test(f[0]) ? { text: f[0] } : { pic: f[0] };
      return { ...base, kind: "free", ...stim, need, min, ans: f[3] };
    }
  }
  return null;
}

/** free: сколько китайских знаков в ответе. */
export const hanCount = (s: string) => [...s].filter((c) => HAN.test(c)).length;
/** free: чего не хватает — неиспользованные слова и недостающие знаки. */
export function freeCheck(it: Item, ans: string): { missing: string[]; short: number } {
  const missing = (it.need ?? []).filter((w) => !ans.includes(w));
  return { missing, short: Math.max(0, (it.min ?? 0) - hanCount(ans)) };
}

/* ---------- сборка варианта ---------- */

/** Вариант экзамена: по каждой части — n заданий из банка; сначала те, что давно не попадались (seen: id → время). */
export function assemble(spec: LevelSpec, bank: Item[], seen: Record<string, number>, rnd: () => number, secs?: Sec[]): { part: Part; items: Item[] }[] {
  return spec.parts.filter((p) => !secs || secs.includes(p.sec)).map((part) => {
    // блоки: одиночное задание или вся группа вопросов к одному тексту; давно не виденные — первыми
    const blocks = new Map<string, Item[]>();
    for (const it of bank) if (it.part === part.id) { const k = it.grp ?? it.id; (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(it); }
    const pool = [...blocks.values()].map((items) => ({ items, k: Math.max(...items.map((it) => seen[it.id] ?? 0)) + rnd() * 1e6 }));
    pool.sort((a, b) => a.k - b.k);
    const items: Item[] = [];
    for (const b of pool) {
      if (items.length >= part.n) break;
      if (items.length + b.items.length <= part.n) items.push(...b.items);
    }
    // если группы не легли ровно — добрать первыми вопросами следующей группы
    for (const b of pool) {
      if (items.length >= part.n) break;
      for (const it of b.items) if (items.length < part.n && !items.includes(it)) items.push(it);
    }
    return { part, items };
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
  if (it.kind === "free") { const c = freeCheck(it, String(ans)); return !c.missing.length && !c.short; }
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
