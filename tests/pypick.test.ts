import { test } from "node:test";
import assert from "node:assert/strict";
import { syllableOptions, toneFromGesture, splitSyllable } from "../src/core/pypick.ts";
import { SYLLABLES } from "../src/core/pinyin.ts";

test("деление слога", () => {
  assert.deepEqual(splitSyllable("zhang"), ["zh", "ang"]);
  assert.deepEqual(splitSyllable("an"), ["", "an"]);
  assert.deepEqual(splitSyllable("xue"), ["x", "ue"]);
});

test("варианты слога: верный, похожие, существующие, без повторов, стабильно", () => {
  for (const syl of ["xue", "zhang", "an", "lv", "yi", "er", "shi", "chuang"]) {
    const o = syllableOptions(syl, 6, "id");
    assert.equal(o.length, 6, syl);
    assert.ok(o.includes(syl), syl);
    assert.equal(new Set(o).size, 6, syl);
    for (const x of o) assert.ok(SYLLABLES.has(x), `${syl}: ${x}`);
    assert.deepEqual(syllableOptions(syl, 6, "id"), o);
  }
  const zh = syllableOptions("zhang", 6, "a");
  assert.ok(zh.some((x) => ["zang", "jang", "zhan", "zheng"].includes(x)));
});

test("варианты для эризации", () => {
  const o = syllableOptions("nar", 5, "s");
  assert.ok(o.includes("nar"));
  assert.ok(o.every((x) => x.endsWith("r") && SYLLABLES.has(x.slice(0, -1))));
});

test("тон по жесту", () => {
  const line = (pts: [number, number][]) => toneFromGesture(pts);
  assert.equal(line([[0, 0], [1, 0]]), 5);                      // касание
  assert.equal(line([[0, 50], [100, 48]]), 1);                   // ровно
  assert.equal(line([[0, 80], [100, 10]]), 2);                   // вверх
  assert.equal(line([[0, 10], [100, 80]]), 4);                   // вниз
  assert.equal(line([[100, 10], [0, 80]]), 4);                   // вниз справа налево
  assert.equal(line([[0, 20], [40, 70], [100, 10]]), 3);         // провал
  assert.equal(line([[0, 20], [50, 60], [70, 64], [100, 30]]), 3);
  assert.equal(line([[0, 40], [50, 44], [100, 40]]), 1);         // дрожь — всё ещё ровно
});

import { splitTyped } from "../src/core/pypick.ts";
test("splitTyped: буквы → слоги для кнопок тонов", () => {
  const ref = [{ s: "xue" }, { s: "xi" }];
  assert.deepEqual(splitTyped("xuexi", ref), [{ s: "xue", t: null }, { s: "xi", t: null }]);
  assert.deepEqual(splitTyped("xue2 xi", ref).map((x) => [x.s, x.t]), [["xue", 2], ["xi", null]]);
  assert.deepEqual(splitTyped("xué xí", ref).map((x) => [x.s, x.t]), [["xue", 2], ["xi", 2]]);
  assert.deepEqual(splitTyped("xue2xi2", ref).map((x) => [x.s, x.t]), [["xue", 2], ["xi", 2]]);
  // неверные буквы — делим на настоящие слоги
  assert.deepEqual(splitTyped("zhangxi", ref).map((x) => x.s), ["zhang", "xi"]);
  assert.deepEqual(splitTyped("nüer", [{ s: "nv" }, { s: "er" }]).map((x) => x.s), ["nv", "er"]);
  assert.deepEqual(splitTyped("", ref), []);
  assert.equal(splitTyped("qqqq", ref).length, 2);
});
