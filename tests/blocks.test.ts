import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBlocks, currentBlock, blockStat } from "../src/core/blocks.ts";

const hans = Array.from({ length: 45 }, (_, i) => `字${i}`);

test("блоки: без тем — по 20 слов по порядку, разделы по 5 уроков", () => {
  const b = makeBlocks(hans);
  assert.deepEqual(b.map((x) => x.idx.length), [20, 20, 5]);
  assert.equal(b[0].title, "Урок 1");
  assert.equal(b[2].idx[0], 40);
  assert.equal(b[0].section, "Слова 1–45");
  assert.equal(makeBlocks(hans.slice(0, 12)).length, 1);
  assert.deepEqual(makeBlocks([]), []);
});

test("блоки: темы, слова без темы — в конце, повторы и чужие слова пропускаются", () => {
  const b = makeBlocks(hans.slice(0, 25), [
    { s: "Раздел", t: "Первая", w: ["字3", "字1", "нет"] },
    { s: "Раздел", t: "Вторая", w: ["字1", "字2"] },
  ]);
  assert.deepEqual(b[0], { section: "Раздел", title: "Первая", idx: [3, 1] });
  assert.deepEqual(b[1].idx, [2]);
  assert.equal(b[2].title, "Ещё слова 1");
  assert.equal(b[2].section, "Другие слова");
  assert.equal(b.reduce((a, x) => a + x.idx.length, 0), 25);
});

test("текущий блок и статистика", () => {
  const b = makeBlocks(hans);
  const started = (i: number) => i < 20 || i === 21;
  assert.equal(currentBlock(b, started), 1);
  assert.equal(currentBlock(b, () => true), -1);
  assert.deepEqual(blockStat(b[1], started, (i) => i === 21), { total: 20, started: 1, known: 1 });
});
