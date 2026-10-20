import { test } from "node:test";
import assert from "node:assert/strict";
import { penShape, brushWidths, resample, outlinePath, isPen, clampSize, type PenPoint } from "../src/core/pen.ts";

const line = (n: number, dt: number): PenPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: 100 + i * 20, y: 500, t: i * dt }));

test("карандаш — прежняя линия", () => {
  const s = penShape("pencil", line(3, 16), 16);
  assert.equal(s.mode, "stroke");
  assert.equal(s.width, 16);
  assert.equal(s.d, "M100 500L120 500L140 500");
});

test("кисть — залитый замкнутый контур", () => {
  const s = penShape("brush", line(20, 16), 16);
  assert.equal(s.mode, "fill");
  assert.ok(s.d.startsWith("M") && s.d.endsWith("Z"));
  assert.ok(!s.d.includes("NaN"));
});

test("кисть: медленно толще, чем быстро; концы тоньше середины", () => {
  const slow = line(40, 60), fast = line(40, 4);
  const ws = brushWidths(resample(slow, 5), 30), wf = brushWidths(resample(fast, 5), 30);
  const mid = (w: number[]) => w[Math.floor(w.length / 2)];
  assert.ok(mid(ws) > mid(wf));
  assert.ok(wf[wf.length - 1] < mid(wf) * 0.5, "быстрый конец — острый");
  assert.ok(ws[0] < mid(ws));
});

test("нажим стилуса управляет толщиной", () => {
  const pts = line(30, 16).map((p, i) => ({ ...p, p: i < 15 ? 0.2 : 0.9 }));
  const w = brushWidths(resample(pts, 5), 30);
  assert.ok(w[Math.floor(w.length * 0.7)] > w[Math.floor(w.length * 0.3)]);
});

test("точка и черта без времени не ломаются", () => {
  assert.ok(penShape("brush", [{ x: 1, y: 1 }], 16).d.endsWith("Z"));
  const s = penShape("brush", [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 50 }], 16);
  assert.ok(!s.d.includes("NaN"));
  assert.equal(outlinePath([], []), "");
  assert.ok(isPen("brush") && !isPen("crayon"));
});

test("толщина пера из настроек", () => {
  const a = penShape("pencil", line(3, 16), 16, 0.5), b = penShape("pencil", line(3, 16), 16, 1.5);
  assert.equal(a.width, 8);
  assert.equal(b.width, 24);
  assert.equal(clampSize(9), 2.5);
  assert.equal(clampSize("x"), 1);
  assert.equal(clampSize(0.74), 0.7);
});

test("кисть не толще двух карандашей при медленном письме", () => {
  const slow = line(40, 80);
  const s = penShape("brush", slow, 16);
  const ys = [...s.d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 16 * 2 + 1);
});
