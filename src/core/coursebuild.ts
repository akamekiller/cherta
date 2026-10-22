/**
 * Конструктор курса: курс как набор полей (без разметки) ⇄ текст курса (формат parseExSet).
 * Хранится курс по-прежнему текстом (meta exsets), конструктор только переводит туда и обратно.
 * Плюс проверка текста курса с номерами строк — чтобы было понятно, что поправить.
 */
import type { ExSet } from "./exercise.ts";

export type BQ = { q: string; o: string[]; a: number };
/** Диалог: реплики по строке — «A: 你好！ | Привет!» (перевод через | необязателен). */
export type BDialog = { title: string; lines: string; q: BQ[] };
export type BX = { zh: string; ru: string; o: string[]; a: number };
/** Правило: объяснение (абзацы по строкам), примеры по строке «китайский | перевод», задания на выбор. */
/** extra — таблица, частые ошибки и заметки по строке: «| ячейка | ячейка» (первая строка таблицы — заголовок), «! частая ошибка», «> заметка». */
export type BRule = { title: string; text: string; ex: string; x: BX[]; extra: string };
/** Урок: слова по строке («学习» или «学习 | xue2 xi2 | учиться»), предложения по строке («китайский | перевод»). */
export type BLesson = { title: string; section: string; goal: string; words: string; sents: string; dialogs: BDialog[]; rules: BRule[] };
export type BCourse = { title: string; level: number; about: string; lessons: BLesson[] };

/** Китайские иероглифы или японские кандзи/кана — «есть текст курса». */
const HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const MARK = /^\s*(#|\+|@|\?|=|&|%)/;
const clean = (s: string) => s.replace(/\r/g, "").replace(/\n+/g, " ").trim();
const lines = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);

export const emptyLesson = (n = 1): BLesson => ({ title: `Урок ${n}`, section: "", goal: "", words: "", sents: "", dialogs: [], rules: [] });
export const emptyCourse = (): BCourse => ({ title: "Мой курс", level: 1, about: "", lessons: [emptyLesson(1)] });

/** Слова урока из поля: по строке или через пробел/запятую; строка с «|» — уже с пиньинем и значением. */
export function wordRows(src: string): [string, string, string][] {
  const out: [string, string, string][] = [];
  const seen = new Set<string>();
  for (const l of lines(src)) {
    if (l.includes("|") || l.includes("\t")) {
      const [h, py = "", ru = ""] = l.replace(/^\+\s*/, "").split(/\s*[|\t]\s*/).map((x) => x.trim());
      if (h && HAN.test(h) && !seen.has(h)) { seen.add(h); out.push([h.replace(/\s+/g, ""), py, ru]); }
    } else {
      for (const t of l.replace(/^\+\s*/, "").split(/[\s,，、;；]+/)) if (t && HAN.test(t) && !seen.has(t)) { seen.add(t); out.push([t, "", ""]); }
    }
  }
  return out;
}

/** Курс → текст в формате parseExSet. */
export function courseToText(c: BCourse): string {
  const out: string[] = [`# ${clean(c.title) || "Мой курс"}`];
  if (c.level > 0) out.push(`#level: ${c.level}`);
  if (clean(c.about)) out.push(`#about: ${clean(c.about)}`);
  let section = "";
  c.lessons.forEach((l, i) => {
    const sec = clean(l.section);
    if (sec && sec !== section) { out.push("", `### ${sec}`); section = sec; }
    out.push("", `## ${clean(l.title) || `Урок ${i + 1}`}`);
    if (clean(l.goal)) out.push(`= ${clean(l.goal)}`);
    for (const [h, py, ru] of wordRows(l.words)) out.push(py || ru ? `+ ${h} | ${py} | ${ru}` : `+ ${h}`);
    for (const r of l.rules) {
      if (!clean(r.title)) continue;
      out.push(`& ${clean(r.title)}`);
      for (const t of lines(r.text)) out.push(`% ${t}`);
      for (const e of lines(r.ex)) if (HAN.test(e)) out.push(`%e ${e}`);
      for (const e of lines(r.extra ?? "")) if (/^[|!>]\s*\S/.test(e)) out.push(`%${e}`);
      for (const x of r.x) {
        const o = x.o.map((s) => clean(s)).filter(Boolean);
        if (!x.zh.includes("___") || o.length < 2 || x.a < 0 || x.a >= x.o.length || !clean(x.o[x.a])) continue;
        out.push(`%x ${clean(x.zh)} | ${clean(x.ru)} | ${x.o.map((s, k) => (clean(s) ? clean(s) + (k === x.a ? "*" : "") : "")).filter(Boolean).join(" | ")}`);
      }
    }
    for (const s of lines(l.sents)) if (HAN.test(s) && !MARK.test(s)) out.push(s);
    for (const d of l.dialogs) {
      const ls = lines(d.lines).filter((x) => HAN.test(x));
      if (!ls.length) continue;
      out.push("", `@ ${clean(d.title) || "Диалог"}`);
      // реплика без «кто:» — по очереди A и B
      ls.forEach((x, k) => out.push(/^[^:：|]{1,12}[:：]/.test(x) ? x : `${k % 2 ? "B" : "A"}: ${x}`));
      for (const q of d.q) {
        const o = q.o.map((s) => clean(s));
        if (!clean(q.q) || o.filter(Boolean).length < 2 || !o[q.a]) continue;
        out.push(`? ${clean(q.q)} | ${o.map((s, k) => (s ? s + (k === q.a ? "*" : "") : "")).filter(Boolean).join(" | ")}`);
      }
    }
  });
  return out.join("\n") + "\n";
}

/** Разобранный курс → поля конструктора (чтобы поправить свой курс или копию встроенного). */
export function setToCourse(s: ExSet): BCourse {
  return {
    title: s.title, level: s.level ?? 0, about: s.about ?? "",
    lessons: s.lessons.map((l) => ({
      title: l.title, section: l.section ?? "", goal: l.goal ?? "",
      words: l.words.map(([h, py, ru]) => (py || ru ? `${h} | ${py} | ${ru}` : h)).join("\n"),
      sents: l.sents.map((x) => (x.ru ? `${x.zh} | ${x.ru}` : x.zh)).join("\n"),
      dialogs: l.dialogs.map((d) => ({ title: d.title, lines: d.lines.map(([w, zh, ru]) => `${w}: ${zh}${ru ? ` | ${ru}` : ""}`).join("\n"), q: d.q.map((q) => ({ q: q.q, o: [...q.o], a: q.a })) })),
      rules: (l.grammar ?? []).map((g) => ({ title: g.title, text: g.text.join("\n"), ex: g.ex.map(([zh, ru]) => (ru ? `${zh} | ${ru}` : zh)).join("\n"), x: g.x.map((x) => ({ ...x, o: [...x.o] })),
        extra: [...(g.table ?? []).map((r) => `| ${r.join(" | ")}`), ...(g.notes ?? []).map((n) => `${n.k === "err" ? "!" : ">"} ${n.t}`)].join("\n") })),
    })),
  };
}

export type Issue = { line: number; msg: string; src: string };

/** Проверка текста курса: что приложение пропустит и почему (номер строки с 1). */
export function checkCourseText(text: string): Issue[] {
  const out: Issue[] = [];
  let inDialog = false, inRule = false, lesson = false;
  text.replace(/\r/g, "").split("\n").forEach((raw, i) => {
    const l = raw.trim();
    const add = (msg: string) => out.push({ line: i + 1, msg, src: l });
    if (!l) { inDialog = false; return; }
    if (l.startsWith("### ")) { inDialog = false; return; }
    if (l.startsWith("## ")) { lesson = true; inDialog = false; inRule = false; return; }
    if (l.startsWith("#")) return;
    if (l.startsWith("= ")) return;
    if (l.startsWith("& ")) { inRule = true; inDialog = false; return; }
    const opts = (s: string) => s.split(/\s*[|\t]\s*/).map((x) => x.trim()).filter(Boolean);
    if (l.startsWith("%")) {
      if (!inRule) add("строка «%» без правила: сначала нужна строка «& Название правила»");
      else if (l.startsWith("%x")) {
        const [zh = "", , ...o] = opts(l.slice(2));
        if (!zh.includes("___")) add("в задании нет пропуска ___ (три подчёркивания)");
        else if (o.length < 2) add("в задании меньше двух вариантов ответа");
        else if (o.filter((x) => x.endsWith("*")).length !== 1) add("отметьте один верный вариант звёздочкой: 是*");
      }
      return;
    }
    if (l.startsWith("+")) {
      const p = opts(l.slice(1));
      if (!p[0] || !HAN.test(p[0])) add("после «+» должны быть иероглифы слова");
      else if (p.length > 1 && p.length < 3) add("слово: нужно «иероглифы | пиньинь | значение» (или только иероглифы — остальное подставится)");
      if (!lesson) add("слово до первого урока: добавьте строку «## Урок 1»");
      return;
    }
    if (l.startsWith("@")) { inDialog = true; inRule = false; return; }
    if (l.startsWith("?")) {
      const [q = "", ...o] = opts(l.slice(1));
      if (!inDialog) add("вопрос не после диалога: вопросы пишутся сразу под репликами диалога, без пустой строки");
      else if (!q) add("нет текста вопроса");
      else if (o.length < 2) add("у вопроса меньше двух вариантов");
      else if (o.filter((x) => x.endsWith("*")).length !== 1) add("отметьте один верный вариант звёздочкой: «На поезде*»");
      return;
    }
    if (!HAN.test(l)) { add("строка без иероглифов и без значка в начале — будет пропущена"); return; }
    if (!lesson && !inDialog) add("предложение до первого урока: добавьте строку «## Урок 1»");
  });
  return out;
}
