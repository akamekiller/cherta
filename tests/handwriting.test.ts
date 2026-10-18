// Рукописный поиск на выдуманных эталонах из простых линий.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHw, encodeStrokes, recognize, resample, assignCost, type Pt } from "../src/core/handwriting.ts";

const H = (y: number, x0 = 0.15, x1 = 0.85): Pt[] => [[x0, y], [x1, y]];
const V = (x: number, y0 = 0.15, y1 = 0.85): Pt[] => [[x, y0], [x, y1]];
const K = 5;
const FAKE = "K=5\n" + [
  ["一", [H(0.5)]],
  ["丨", [V(0.5)]],
  ["十", [H(0.45), V(0.5)]],
  ["二", [H(0.3, 0.25, 0.75), H(0.7)]],
  ["三", [H(0.2, 0.25, 0.75), H(0.5, 0.3, 0.7), H(0.8)]],
].map(([c, s]) => `${c}\t${encodeStrokes(s as Pt[][], K)}`).join("\n");

test("равномерная расстановка точек", () => {
  const r = resample([[0, 0], [1, 0]], 3);
  assert.deepEqual(r.map(([x]) => +x.toFixed(2)), [0, 0.5, 1]);
  assert.equal(resample([[0.3, 0.3]], 4).length, 4);
});

test("назначение черт: минимальная сумма", () => {
  // 2×3: лучшее — строка 0 → столбец 2 (1), строка 1 → столбец 0 (2)
  assert.equal(assignCost(new Float64Array([5, 9, 1, 2, 7, 8]), 2, 3), 3);
});

test("разбор данных", () => {
  const db = parseHw(FAKE);
  assert.equal(db.chars.length, 5);
  assert.equal(db.byCount.get(1)?.length, 2);
  assert.throws(() => parseHw("мусор"));
});

test("распознаёт по форме, месту и без порядка черт", () => {
  const db = parseHw(FAKE);
  assert.equal(recognize(db, [H(0.52)])[0], "一");
  assert.equal(recognize(db, [V(0.48)])[0], "丨");
  assert.equal(recognize(db, [V(0.5), H(0.45)])[0], "十"); // черты в другом порядке
  assert.equal(recognize(db, [H(0.3, 0.3, 0.7), H(0.68, 0.2, 0.8)])[0], "二");
  // мелко в углу — всё равно 十
  assert.equal(recognize(db, [[[0.1, 0.2], [0.4, 0.2]], [[0.25, 0.05], [0.25, 0.38]]])[0], "十");
  assert.deepEqual(recognize(db, []), []);
});

test("недописанный иероглиф: среди вариантов есть полный", () => {
  const db = parseHw(FAKE);
  assert.ok(recognize(db, [H(0.2, 0.25, 0.75), H(0.5, 0.3, 0.7)]).includes("三"));
});
