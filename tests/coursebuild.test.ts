import { test } from "node:test";
import assert from "node:assert/strict";
import { courseToText, setToCourse, checkCourseText, wordRows, emptyCourse, type BCourse } from "../src/core/coursebuild.ts";
import { parseExSet } from "../src/core/exercise.ts";

const seg = (zh: string) => [...zh];

const sample: BCourse = {
  title: "Мой курс", level: 2, about: "Для теста",
  lessons: [{
    title: "Знакомство", section: "Начало", goal: "Здороваться",
    words: "你好\n名字 | ming2 zi5 | имя\n学习，老师",
    sents: "你好！ | Привет!\n我是学生。",
    dialogs: [{ title: "Встреча", lines: "你好！ | Привет!\n你好！\nB: 我叫王明。", q: [{ q: "Как зовут B?", o: ["Ли", "Ван Мин"], a: 1 }] }],
    rules: [{ title: "是", text: "Связка.\nСтавится между.", ex: "我是学生。 | Я студент.", x: [{ zh: "我___学生。", ru: "Я студент.", o: ["是", "有"], a: 0 }] }],
  }],
};

test("courseToText → parseExSet: всё на месте", () => {
  const s = parseExSet(courseToText(sample), "t", seg);
  assert.equal(s.title, "Мой курс");
  assert.equal(s.level, 2);
  assert.equal(s.about, "Для теста");
  const l = s.lessons[0];
  assert.equal(l.title, "Знакомство");
  assert.equal(l.section, "Начало");
  assert.equal(l.goal, "Здороваться");
  assert.deepEqual(l.words.map((w) => w[0]), ["你好", "名字", "学习", "老师"]);
  assert.deepEqual(l.words[1], ["名字", "ming2 zi5", "имя"]);
  assert.equal(l.sents.length, 2);
  assert.equal(l.dialogs[0].lines.length, 3);
  assert.deepEqual(l.dialogs[0].lines.map((x) => x[0]), ["A", "B", "B"]);
  assert.equal(l.dialogs[0].q[0].a, 1);
  assert.equal(l.grammar![0].x[0].o[l.grammar![0].x[0].a], "是");
  assert.equal(l.grammar![0].text.length, 2);
});

test("setToCourse ⇄ courseToText сохраняют курс", () => {
  const s1 = parseExSet(courseToText(sample), "t", seg);
  const s2 = parseExSet(courseToText(setToCourse(s1)), "t", seg);
  assert.deepEqual(JSON.parse(JSON.stringify(s2)), JSON.parse(JSON.stringify(s1)));
});

test("пустые и неполные части не попадают в текст", () => {
  const c = emptyCourse();
  c.lessons[0].dialogs.push({ title: "", lines: "", q: [] });
  c.lessons[0].rules.push({ title: "", text: "x", ex: "", x: [] });
  c.lessons[0].sents = "我是学生。";
  const t = courseToText(c);
  assert.ok(!t.includes("@"));
  assert.ok(!t.includes("&"));
  assert.equal(checkCourseText(t).length, 0);
});

test("wordRows: разные способы записи", () => {
  assert.deepEqual(wordRows("学习 老师\n+ 朋友 | peng2 you5 | друг\n学习").map((r) => r[0]), ["学习", "老师", "朋友"]);
});

test("checkCourseText: номера строк и понятные причины", () => {
  const issues = checkCourseText("# Курс\n+ 你好\n## Урок 1\n@ Д\nA: 你好！\n? Вопрос | да | нет\n\n? Ещё | а* | б\n%x 我是学生 | x | 是* | 有\nhello");
  const by = (n: number) => issues.find((i) => i.line === n)?.msg ?? "";
  assert.match(by(2), /до первого урока/);
  assert.match(by(6), /звёздочкой/);
  assert.match(by(8), /не после диалога/);
  assert.match(by(9), /без правила/);
  assert.match(by(10), /будет пропущена/);
});

test("правило с таблицей и заметками проходит через конструктор без потерь", () => {
  const text = "# К\n## У1\n+ 是 | shi4 | быть\n& Правило\n% Объяснение\n%| форма | значение\n%| 是 | быть\n%! ошибка 我是高兴\n%> заметка\n%e 我是学生。 | Я студент.\n";
  const set = parseExSet(text, "k");
  const back = parseExSet(courseToText(setToCourse(set)), "k");
  assert.deepEqual(back.lessons[0].grammar![0].table, set.lessons[0].grammar![0].table);
  assert.deepEqual(back.lessons[0].grammar![0].notes, set.lessons[0].grammar![0].notes);
  assert.deepEqual(checkCourseText(text), []);
});
