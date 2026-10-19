import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank, assemble, shuffleOpts, isRight, scoreExam, levelSpec, LEVELS, freeCheck } from "../src/core/hsk.ts";

const BANK = `
# выдуманные задания
== 1L1
🍎 | 甲乙 | +
🚕 | 甲乙 | -
== 1L3
男：甲乙？ / 女：丙丁。 | 🍎 🚕 🐱 | 2 | = Перевод.
== 1L4
甲乙丙。 | 问题？ | 甲；乙*；丙
== 1R4
我___甲。 | 乙；丙*；丁
нет пропуска | 乙*；丙
== 2R3
甲乙丙丁。 | ★ 甲乙。 | +
== 2W1
甲 / 乙 / 丙丁
== 2W2
我___甲。 | 乙 | yǐ
== 2L1
甲乙丙。 | 🍎 | x
`;

test("банк: разбор частей и строк, ошибки пропускаются", () => {
  const b = parseBank(BANK);
  const by = (p: string) => b.filter((x) => x.part === p);
  assert.equal(by("1L1").length, 2);
  assert.equal(by("1L1")[1].a, 1);
  assert.deepEqual(by("1L3")[0].audio, ["男：甲乙？", "女：丙丁。"]);
  assert.equal(by("1L3")[0].a, 1);
  assert.equal(by("1L3")[0].ru, "Перевод.");
  assert.equal(by("1L4")[0].a, 1);
  assert.equal(by("1R4").length, 1);
  assert.equal(by("2R3")[0].q, "★ 甲乙。");
  assert.deepEqual(by("2W1")[0].words, ["甲", "乙", "丙丁"]);
  assert.equal(by("2W2")[0].ans, "乙");
  assert.equal(by("2L1").length, 0);
});

test("сборка: по n заданий на часть, давно не виденные первыми", () => {
  const items = Array.from({ length: 8 }, (_, i) => `🍎 | 甲${i} | +`).join("\n");
  const b = parseBank(`== 1L1\n${items}`);
  const seen = Object.fromEntries(b.slice(0, 5).map((x) => [x.id, Date.now()]));
  const v = assemble(levelSpec(1)!, b, seen, () => 0.5);
  assert.equal(v.length, 1);
  assert.equal(v[0].items.length, 5);
  assert.ok(v[0].items.slice(0, 3).every((x) => !seen[x.id]));
  assert.equal(assemble(levelSpec(1)!, b, {}, () => 0.5, ["R"]).length, 0);
});

test("проверка ответов и перемешивание вариантов", () => {
  const b = parseBank(BANK);
  const q = b.find((x) => x.part === "1L4")!;
  let k = 0;
  const s = shuffleOpts(q, () => [0.9, 0.1, 0.5][k++ % 3]);
  assert.equal(s.opts![s.a!].t, "乙");
  assert.ok(isRight(s, s.a));
  assert.ok(isRight(b.find((x) => x.part === "2W1")!, ["甲", "乙", "丙丁"]));
  assert.ok(!isRight(b.find((x) => x.part === "2W1")!, ["乙", "甲", "丙丁"]));
  assert.ok(isRight(b.find((x) => x.part === "2W2")!, " 乙 "));
  assert.ok(!isRight(q, null));
});

test("баллы: каждая часть из 100, «сдал» — 60%", () => {
  const b = parseBank(BANK);
  const l = b.find((x) => x.part === "1L1")!, r = b.find((x) => x.part === "1R4")!;
  const sc = scoreExam([{ item: l, sec: "L", ans: 0 }, { item: l, sec: "L", ans: 1 }, { item: r, sec: "R", ans: 1 }]);
  assert.equal(sc.sec.L.points, 50);
  assert.equal(sc.sec.R.points, 100);
  assert.equal(sc.total, 150);
  assert.equal(sc.max, 200);
  assert.equal(sc.passed, true);
  assert.deepEqual(LEVELS.map((l0) => l0.parts.reduce((a, p) => a + p.n, 0)), [40, 60, 70, 100, 100, 101]);
});

test("банк: вопрос-ответ уровня 2 (2R4) без пропуска разбирается", () => {
  const b = parseBank("== 2R4\n你去哪儿？ | 去学校*；很好\n== 2R2\nбез пропуска | 甲*；乙");
  assert.equal(b.filter((x) => x.part === "2R4").length, 1);
  assert.equal(b.filter((x) => x.part === "2R2").length, 0);
});


test("группы: общий текст и несколько вопросов, сборка берёт группу целиком", () => {
  const b = parseBank(`== 4R3
>> 甲乙丙丁。 | = Текст.
? 问一？ | 甲*；乙 | = Вопрос 1.
? 问二？ | 甲；乙*
单个。 | 问？ | 甲*；乙
? без группы | 甲*；乙
== 4L3
>> 男：甲。 / 女：乙。
? 问？ | 甲；乙*；丙`);
  const g = b.filter((x) => x.part === "4R3");
  assert.equal(g.length, 3);
  assert.equal(g[0].text, "甲乙丙丁。");
  assert.equal(g[0].grp, g[1].grp);
  assert.equal(g[0].ru, "Текст. — Вопрос 1.");
  assert.equal(g[1].ru, "Текст.");
  assert.equal(g[2].grp, undefined);
  const l = b.find((x) => x.part === "4L3")!;
  assert.deepEqual(l.audio, ["男：甲。", "女：乙。"]);
  // часть из 3 заданий: группа (2) + одиночное
  const spec = { level: 9, minutes: { L: 1, R: 1, W: 1 }, parts: [{ ...levelSpec(4)!.parts.find((p) => p.id === "4R3")!, n: 3 }] };
  const v = assemble(spec, b, {}, () => 0.5);
  assert.equal(v[0].items.length, 3);
  const i0 = v[0].items.findIndex((x) => x.grp);
  assert.equal(v[0].items[i0 + 1].grp, v[0].items[i0].grp);
});

test("свободное письмо: нужные слова и длина", () => {
  const [p, e] = parseBank(`== 4W2
🏊 | 游泳 | 6 | 他每天下午都去游泳。
== 5W2
请用下面的词写一段话。 | 周末 打算 | 20 | образец`);
  assert.equal(p.kind, "free");
  assert.equal(p.pic, "🏊");
  assert.deepEqual(p.need, ["游泳"]);
  assert.ok(isRight(p, "我很喜欢游泳。"));
  assert.ok(!isRight(p, "我喜欢跑步。"));
  assert.ok(!isRight(p, "游泳。"));
  assert.equal(e.text, "请用下面的词写一段话。");
  assert.deepEqual(freeCheck(e, "周末我打算"), { missing: [], short: 15 });
  assert.deepEqual(freeCheck(e, "我"), { missing: ["周末", "打算"], short: 19 });
});

test("порядок предложений (4R2)", () => {
  const [it] = parseBank("== 4R2\nA甲乙丙。 / B丁戊， / C己庚。");
  assert.equal(it.kind, "order");
  assert.ok(isRight(it, ["A甲乙丙。", "B丁戊，", "C己庚。"]));
});
