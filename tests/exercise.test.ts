// Упражнения на перевод — на выдуманных предложениях.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tilesFor, checkAssembled, ruCloseness, pickLesson, record, zhKey, type ExItem } from "../src/core/exercise.ts";

const A: ExItem = { zh: "甲乙丙。", ru: "первый второй третий", t: ["甲", "乙丙", "。"] };
const B: ExItem = { zh: "丁戊，己。", ru: "четвёртый пятый", t: ["丁", "戊", "，", "己", "。"] };
let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test("плитки: слова предложения и лишние, без пунктуации", () => {
  const t = tilesFor(A, ["丁", "戊", "甲"], rnd, 2);
  assert.equal(t.length, 4);
  assert.ok(t.includes("甲") && t.includes("乙丙"));
  assert.ok(!t.includes("。"));
  assert.equal(t.filter((x) => x === "甲").length, 1);
});

test("проверка собранного ответа", () => {
  assert.ok(checkAssembled(["甲", "乙丙"], A));
  assert.ok(checkAssembled(["丁", "戊", "己"], B));
  assert.ok(!checkAssembled(["乙丙", "甲"], A));
  assert.equal(zhKey("丁戊，己。 "), "丁戊己");
});

test("близость своего перевода", () => {
  assert.ok(ruCloseness("Первый, второй и третий", A.ru) > 0.7);
  assert.ok(ruCloseness("совсем другое", A.ru) < 0.2);
  assert.equal(ruCloseness("", A.ru), 0);
});

test("урок: новые, затем слабые", () => {
  const items = [A, B, { ...A, zh: "庚" }, { ...A, zh: "辛" }];
  let p = record({}, "x:" + B.zh, false, 1);
  p = record(p, "x:" + A.zh, true, 2);
  const l = pickLesson(items, p, 3, "x:");
  assert.deepEqual(l, [1, 2, 3]); // слабое B, затем новые
  assert.deepEqual(pickLesson(items, p, 10, "x:").sort(), [0, 1, 2, 3]);
  assert.deepEqual(p["x:" + B.zh], { seen: 1, ok: 0, last: 1 });
});

/* ---------- упражнения 2.0 (выдуманные данные) ---------- */
import { segment, sentencesFor, gapTask, diffZh, parseExSet, planSession, parseCorpus, type Sent } from "../src/core/exercise.ts";

const LEX = new Set(["学习", "汉语", "我们", "老师", "朋友", "喜欢", "苹果"]);
const seg = (s: string) => segment(s, (w) => LEX.has(w));

test("деление на слова по словарю", () => {
  assert.deepEqual(seg("我们学习汉语。"), ["我们", "学习", "汉语", "。"]);
  assert.deepEqual(seg("我喜欢苹果"), ["我", "喜欢", "苹果"]);
  assert.deepEqual(seg("A 我"), ["A", "我"]);
});

const S = (zh: string, lv = 1): Sent => ({ id: zh, zh, ru: "перевод " + zh, t: seg(zh), lv });

test("предложения для колоды: нужно слово колоды и знакомые остальные", () => {
  const corpus = [S("我们学习汉语。"), S("我喜欢苹果。"), S("老师喜欢朋友。"), S("天地玄黄。")];
  const r = sentencesFor(corpus, new Set(["喜欢"]), new Set(["我", "我们", "苹果", "老师", "朋友"]), 10);
  assert.deepEqual(r.map((s) => s.zh).sort(), ["我喜欢苹果。", "老师喜欢朋友。"].sort());
  assert.equal(sentencesFor(corpus, new Set(["喜欢"]), new Set(), 10).length, 0); // остальные слова незнакомы
});

test("пропуск: слово колоды, 4 варианта, верный среди них", () => {
  const s = S("我们学习汉语。");
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = gapTask(s, new Set(["学习"]), ["老师", "朋友", "喜欢", "苹果", "我们"], rnd)!;
  assert.equal(g.answer, "学习");
  assert.equal(s.t[g.at], "学习");
  assert.equal(g.options.length, 4);
  assert.ok(g.options.includes("学习"));
  assert.ok(!g.options.includes("我们")); // слова из самого предложения не предлагаются
});

test("сравнение ответа по знакам", () => {
  const d = diffZh("我学习汉语", "我们学习汉语。");
  assert.deepEqual(d.ref.map((x) => x.ok), [true, false, true, true, true, true]);
  assert.deepEqual(d.extra, []);
  assert.ok(d.score > 0.8 && d.score < 1);
  assert.equal(diffZh("我们学习汉语", "我们学习汉语！").score, 1);
  assert.deepEqual(diffZh("我们很学习", "我们学习").extra, ["很"]);
});

test("свой набор из файла: разделы, предложения, диалог с вопросами", () => {
  const set = parseExSet([
    "# Мой учебник",
    "## Урок 1",
    "我们学习汉语。 | Мы учим китайский.",
    "我喜欢苹果。\tЯ люблю яблоки.",
    "",
    "@ В магазине",
    "A: 你要什么？ | Что вам нужно?",
    "B: 我要苹果。 | Мне яблоки.",
    "? Что нужно B? | бананы | яблоки* | хлеб",
    "## Урок 2",
    "老师喜欢朋友。",
    "мусор без иероглифов",
  ].join("\n"), "f1", seg);
  assert.equal(set.title, "Мой учебник");
  assert.equal(set.lessons.length, 2);
  assert.equal(set.lessons[0].sents.length, 2);
  assert.equal(set.lessons[0].sents[1].ru, "Я люблю яблоки.");
  assert.equal(set.lessons[0].dialogs[0].lines.length, 2);
  assert.deepEqual(set.lessons[0].dialogs[0].q[0], { q: "Что нужно B?", o: ["бананы", "яблоки", "хлеб"], a: 1 });
  assert.equal(set.lessons[1].sents.length, 1);
});

test("план занятия: виды по кругу, диалог один и не первым", () => {
  const sents = ["我们学习汉语。", "我喜欢苹果。", "老师喜欢朋友。", "我们喜欢老师。", "朋友学习汉语。"].map((z) => S(z));
  const dlg = { id: "d1", title: "Д", lines: [["A", "你好", "Привет"]] as [string, string, string][], q: [] };
  const plan = planSession(sents, [dlg], ["tr", "gap", "dialog"], {}, 6, () => 0.1);
  assert.equal(plan.length, 6);
  assert.equal(plan.filter((t) => t.kind === "dialog").length, 1);
  assert.notEqual(plan[0].kind, "dialog");
  assert.deepEqual(plan.filter((t) => t.kind !== "dialog").map((t) => t.kind).slice(0, 4), ["tr", "gap", "tr", "gap"]);
  assert.equal(parseCorpus([["我们。", "Мы.", "我们 。", 1]])[0].t.length, 2);
});

/* ---------- курсы ---------- */
import { lessonSteps, stepOpen, lessonDone, stepTasks, wordOptions, shortRu, reviewTasks, PASS } from "../src/core/exercise.ts";

const COURSE = `# Тестовый курс
#level: 2
#about: Описание курса
## Урок 1. Еда
+ 苹果 | ping2 guo3 | яблоко
+ 米饭 | mi3 fan4 | варёный рис; рис (блюдо)
+ 茶 | cha2 | чай
你吃苹果。 | Ты ешь яблоко.
我喝茶。 | Я пью чай.
他吃米饭。
@ Обед
A: 你吃什么？ | Что ты ешь?
B: 米饭。 | Рис.
? Что ест B? | Рис* | Чай
## Урок 2. Только слова
+ 水 | shui3 | вода
`;

test("parseExSet: слова урока, уровень и описание курса", () => {
  const s = parseExSet(COURSE, "c", (z) => [...z]);
  assert.equal(s.level, 2);
  assert.equal(s.about, "Описание курса");
  assert.equal(s.lessons.length, 2);
  assert.deepEqual(s.lessons[0].words[0], ["苹果", "ping2 guo3", "яблоко"]);
  assert.equal(s.lessons[0].sents.length, 3);
  assert.equal(s.lessons[0].dialogs.length, 1);
  assert.equal(s.lessons[1].words.length, 1);
});

test("lessonSteps: шаги по содержимому урока", () => {
  const s = parseExSet(COURSE, "c", (z) => [...z]);
  assert.deepEqual(lessonSteps(s.lessons[0]), ["words", "recog", "gap", "build", "listen", "write", "dialog"]);
  assert.deepEqual(lessonSteps(s.lessons[1]), ["words"]);
});

test("stepOpen и lessonDone: шаг открыт, когда предыдущие пройдены", () => {
  const steps = ["words", "recog", "gap"] as const;
  assert.equal(stepOpen([...steps], {}, 0), true);
  assert.equal(stepOpen([...steps], {}, 1), false);
  assert.equal(stepOpen([...steps], { words: 1 }, 1), true);
  assert.equal(stepOpen([...steps], { words: 1, recog: PASS - 0.01 }, 2), false);
  assert.equal(lessonDone([...steps], { words: 1, recog: 0.8, gap: 0.9 }), true);
  assert.equal(lessonDone([...steps], { words: 1, recog: 0.8 }), false);
});

test("stepTasks: узнавание в обе стороны, сборка — плитками, перевод — вводом", () => {
  const s = parseExSet(COURSE, "c", (z) => [...z]);
  const l = s.lessons[0];
  const rec = stepTasks("recog", l, {}, () => 0.3);
  assert.ok(rec.some((t) => t.kind === "word" && t.dir === "zh"));
  assert.ok(rec.some((t) => t.kind === "word" && t.dir === "ru"));
  const build = stepTasks("build", l, {}, () => 0.3);
  assert.ok(build.length >= 2 && build.every((t) => t.kind === "tr" && t.tiles === true));
  const write = stepTasks("write", l, {}, () => 0.3);
  assert.ok(write.every((t) => t.kind === "tr" && t.tiles === false && t.sent.ru));
  assert.equal(stepTasks("dialog", l, {}, () => 0.3).length, 1);
});

test("wordOptions: верный вариант и без повторов", () => {
  const ws: [string, string, string][] = [["一", "yi1", "один"], ["二", "er4", "два"], ["三", "san1", "три"], ["四", "si4", "четыре"], ["五", "wu3", "пять"]];
  const o = wordOptions(ws[0], ws, ws, "zh", () => 0.5);
  assert.equal(o.length, 4);
  assert.ok(o.includes("один"));
  assert.equal(new Set(o).size, 4);
  const h = wordOptions(ws[1], ws.slice(0, 2), ws, "ru", () => 0.1);
  assert.ok(h.includes("二"));
});

test("shortRu: первое значение без пометок", () => {
  assert.equal(shortRu("варёный рис; рис (блюдо)"), "варёный рис");
  assert.equal(shortRu("(разг.) привет"), "привет");
});

test("reviewTasks: смесь предложений и слов из пройденных уроков", () => {
  const s = parseExSet(COURSE, "c", (z) => [...z]);
  const t = reviewTasks(s.lessons, {}, 8, () => 0.4);
  assert.ok(t.length > 0 && t.length <= 8);
  assert.ok(t.some((x) => x.kind === "word"));
});
