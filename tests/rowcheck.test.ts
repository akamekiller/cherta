import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCell } from "../src/core/rowcheck.ts";

// выдуманный «иероглиф»: горизонталь сверху, вертикаль, горизонталь снизу (y вверх)
const MED = [
  [[200, 700], [800, 700]],
  [[500, 800], [500, 100]],
  [[150, 150], [850, 150]],
];
const line = (a: number[], b: number[], n = 8) => Array.from({ length: n }, (_, k) => ({ x: a[0] + (b[0] - a[0]) * k / (n - 1), y: a[1] + (b[1] - a[1]) * k / (n - 1) }));
const asUser = (m: number[][][], scale = 1, dx = 0) => m.map((s) => line(s[0].map((v) => v), s[1]).map((p) => ({ x: p.x * scale + dx, y: p.y * scale })));

test("верно написанный иероглиф — ок, высокая оценка", () => {
  const r = checkCell(asUser(MED), MED);
  assert.equal(r.ok, true);
  assert.ok(r.score >= 80, String(r.score));
  // мельче и в стороне — всё ещё верно (порядок и черты), но оценка ниже
  const s = checkCell(asUser(MED, 0.5, 100), MED);
  assert.equal(s.ok, true);
  assert.ok(s.score < r.score);
});

test("пропущенная черта, порядок, направление", () => {
  const u = asUser(MED);
  const miss = checkCell(u.slice(0, 2), MED);
  assert.equal(miss.ok, false);
  assert.match(miss.notes[0], /Черт 2 вместо 3/);
  const swapped = checkCell([u[1], u[0], u[2]], MED);
  assert.equal(swapped.ok, false);
  assert.ok(swapped.notes.some((n) => /Порядок черт/.test(n)));
  const rev = checkCell([u[0], [...u[1]].reverse(), u[2]], MED);
  assert.equal(rev.ok, false);
  assert.ok(rev.notes.some((n) => /Не в ту сторону: черта 2/.test(n)));
  assert.equal(checkCell([], MED).ok, false);
});

test("каракули не засчитываются", () => {
  const r = checkCell([line([0, 0], [1000, 900]), line([1000, 0], [0, 900]), line([0, 450], [100, 500])], MED);
  assert.equal(r.ok, false);
});
