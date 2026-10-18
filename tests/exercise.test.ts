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
