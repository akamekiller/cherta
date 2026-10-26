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

/** Залито ли место (правило nonzero по всем кускам контура). */
function filled(d: string, q: { x: number; y: number }): boolean {
  let wn = 0;
  for (const sub of d.split("Z").filter((s) => s.trim())) {
    const ring = [...sub.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const cross = (b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y);
      if (a.y <= q.y) { if (b.y > q.y && cross > 0) wn++; }
      else if (b.y <= q.y && cross < 0) wn--;
    }
  }
  return wn !== 0;
}
/** Все места ближе 0,45 толщины к средней линии черты залиты — нет дыр и «обрывов». */
function noHoles(pts: PenPoint[], w: number) {
  const d = outlinePath(pts, pts.map(() => w));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let s = 0; s <= 4; s++) {
      const c = { x: a.x + ((b.x - a.x) * s) / 4, y: a.y + ((b.y - a.y) * s) / 4 };
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const q = { x: c.x + Math.cos(ang) * w * 0.45, y: c.y + Math.sin(ang) * w * 0.45 };
        assert.ok(filled(d, q), `дыра у (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`);
      }
    }
  }
}

test("кисть: на изгибе черта не сужается и резкий поворот не даёт дыр", () => {
  // уголок 横折: вправо, затем вниз
  const corner: PenPoint[] = [];
  for (let i = 0; i <= 20; i++) corner.push({ x: 100 + i * 10, y: 500 });
  for (let i = 1; i <= 20; i++) corner.push({ x: 300, y: 500 - i * 10 });
  noHoles(corner, 40);
  // резкий разворот почти назад (острая «галочка»)
  const vee: PenPoint[] = [];
  for (let i = 0; i <= 30; i++) vee.push({ x: 100 + i * 8, y: 500 - i * 2 });
  for (let i = 1; i <= 30; i++) vee.push({ x: 340 - i * 8, y: 440 - i * 6 });
  noHoles(vee, 60);
  // зигзаг с плотными точками и толстой кистью
  const zig: PenPoint[] = [];
  for (let i = 0; i <= 80; i++) { const u = i % 20; zig.push({ x: 100 + i * 5, y: 500 + (u < 10 ? u : 20 - u) * 12 }); }
  noHoles(zig, 70);
  // тугая петля-крючок (钩): радиус меньше толщины
  const hook: PenPoint[] = [];
  for (let i = 0; i <= 30; i++) hook.push({ x: 300, y: 800 - i * 15 });
  for (let i = 1; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI * 0.9; hook.push({ x: 280 + Math.cos(a) * -20, y: 350 + Math.sin(a) * 20 }); }
  noHoles(hook, 50);
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
