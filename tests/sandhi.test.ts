import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenTones, sandhiKinds } from "../src/core/sandhi.ts";

test("3 + 3 → 2 + 3", () => {
  assert.deepEqual(spokenTones("你好", [3, 3]), [2, 3]);
  assert.deepEqual(spokenTones("我很好", [3, 3, 3]), [2, 2, 3]);
  assert.deepEqual(spokenTones("好吃", [3, 1]), [3, 1]);
  assert.deepEqual(sandhiKinds("你好", [3, 3]), ["33"]);
  assert.deepEqual(sandhiKinds("好吃", [3, 1]), []);
});

test("不", () => {
  assert.deepEqual(spokenTones("不是", [4, 4]), [2, 4]);
  assert.deepEqual(spokenTones("不是", [2, 4]), [2, 4]); // в колоде уже bu2
  assert.deepEqual(spokenTones("不好", [4, 3]), [4, 3]);
  assert.deepEqual(spokenTones("不要", [4, 4]), [2, 4]);
  assert.deepEqual(sandhiKinds("不对", [4, 4]), ["bu"]);
  assert.deepEqual(sandhiKinds("不好", [4, 3]), []);
});

test("一", () => {
  assert.deepEqual(spokenTones("一定", [1, 4]), [2, 4]);
  assert.deepEqual(spokenTones("一起", [1, 3]), [4, 3]);
  assert.deepEqual(spokenTones("一天", [1, 1]), [4, 1]);
  assert.deepEqual(spokenTones("一个", [1, 5]), [2, 5]);
  assert.deepEqual(spokenTones("一月", [1, 4]), [1, 4]); // дата
  assert.deepEqual(spokenTones("第一", [4, 1]), [4, 1]);
  assert.deepEqual(spokenTones("十一", [2, 1]), [2, 1]);
  assert.deepEqual(spokenTones("统一", [3, 1]), [3, 1]); // в конце
  assert.deepEqual(sandhiKinds("一起", [1, 3]), ["yi"]);
});

test("несовпадение длины — без изменений", () => {
  assert.deepEqual(spokenTones("你好吗", [3, 3]), [3, 3]);
});
