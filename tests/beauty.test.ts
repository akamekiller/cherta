// Оценка почерка на выдуманном «иероглифе» из трёх черт.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreHandwriting, beautyLabel, type P } from "../src/core/beauty.ts";

// 王-подобный образец: три горизонтали и вертикаль (координаты 1024, y вверх)
const REF = [
  [[250, 750], [500, 755], [770, 760]],
  [[300, 450], [520, 452], [720, 455]],
  [[500, 760], [505, 450], [510, 120]],
  [[200, 130], [500, 125], [820, 120]],
];
const asUser = (r: number[][][], f: (p: P) => P = (p) => p): P[][] => r.map((s) => s.map(([x, y]) => f({ x, y })));

test("точная копия — почти 100", () => {
  const b = scoreHandwriting(asUser(REF), REF);
  assert.ok(b.score >= 95, String(b.score));
  assert.equal(b.strokes.length, 4);
  assert.equal(beautyLabel(b.score), "отлично");
});

test("мелко и в углу — ниже и с подсказками", () => {
  const b = scoreHandwriting(asUser(REF, (p) => ({ x: p.x * 0.45 + 30, y: p.y * 0.45 + 520 })), REF);
  assert.ok(b.score < 85, String(b.score));
  assert.ok(b.notes.some((n) => n.includes("мелковат")));
  assert.ok(b.notes.some((n) => n.includes("смещён")));
});

test("кривая черта и наклон замечаются", () => {
  const bent = asUser(REF);
  bent[1] = [{ x: 300, y: 380 }, { x: 520, y: 470 }, { x: 720, y: 560 }]; // средняя горизонталь сильно вверх
  const b = scoreHandwriting(bent, REF);
  const good = scoreHandwriting(asUser(REF), REF);
  assert.ok(b.score < good.score);
  assert.ok(b.strokes[1] < b.strokes[0]);
  assert.ok(b.notes.some((n) => n.includes("Черта 2") || n.includes("Горизонтальные")));
});

test("короткие черты", () => {
  const short = asUser(REF).map((s) => { const c = s[1]; return s.map((p) => ({ x: c.x + (p.x - c.x) * 0.5, y: c.y + (p.y - c.y) * 0.5 })); });
  const b = scoreHandwriting(short, REF);
  assert.ok(b.notes.some((n) => n.includes("короче")), b.notes.join("; "));
});

test("пустой ввод", () => {
  assert.equal(scoreHandwriting([], REF).score, 0);
});
