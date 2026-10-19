import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBank, assemble, shuffleOpts, isRight, scoreExam, levelSpec, LEVELS } from "../src/core/hsk.ts";

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
  assert.deepEqual(LEVELS.map((l0) => l0.parts.reduce((a, p) => a + p.n, 0)), [40, 60, 70]);
});

test("банк: вопрос-ответ уровня 2 (2R4) без пропуска разбирается", () => {
  const b = parseBank("== 2R4\n你去哪儿？ | 去学校*；很好\n== 2R2\nбез пропуска | 甲*；乙");
  assert.equal(b.filter((x) => x.part === "2R4").length, 1);
  assert.equal(b.filter((x) => x.part === "2R2").length, 0);
});
