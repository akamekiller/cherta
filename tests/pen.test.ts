import { test } from "node:test";
import assert from "node:assert/strict";
import { penShape, brushWidths, resample, outlinePath, isPen, clampSize, miter, type PenPoint } from "../src/core/pen.ts";

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

test("кисть: на изгибе черта не сужается (miter)", () => {
  // уголок 横折: вправо, затем вниз; толщина постоянная
  const pts: PenPoint[] = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: 100 + i * 10, y: 500 });
  for (let i = 1; i <= 20; i++) pts.push({ x: 300, y: 500 - i * 10 });
  const w = 40;
  const d = outlinePath(pts, pts.map(() => w));
  const ring = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  // точки контура у вершины угла (индекс 20): слева L[20], справа R[20]; каждая на расстоянии ≥ w/2 от обеих прямых черты
  const n = pts.length, Lc = ring[20], Rc = ring[n + 7 + (n - 1 - 20)];
  for (const p of [Lc, Rc]) {
    assert.ok(Math.abs(p.y - 500) > (w / 2) * 0.95, `до горизонтали ${Math.abs(p.y - 500)}`);
    assert.ok(Math.abs(p.x - 300) > (w / 2) * 0.95, `до вертикали ${Math.abs(p.x - 300)}`);
  }
  assert.equal(miter({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 1);
  assert.ok(miter({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0.01 }) <= 1.8 + 1e-9);
});

test("кисть: начало круглое, с нажимом, без острого наконечника и без «шейки»", () => {
  const ev = resample(line(60, 16), 4);
  const w = brushWidths(ev, 30);
  const mid = w[Math.floor(w.length / 2)];
  assert.ok(w[0] > mid * 0.75, "начало не острое");
  for (let i = 1; i < w.length / 2; i++) assert.ok(w[i] > w[i - 1] * 0.97, `без провала у точки ${i}`);
});
