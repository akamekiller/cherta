import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOf, dayShift, byDay, streak, forecast, accuracy, writableChars, calendar, type ReviewLog } from "../src/core/stats.ts";
import { newCard, type Card } from "../src/core/fsrs.ts";

const NOW = new Date(2026, 9, 18, 15, 0).getTime(); // 18 октября, 15:00
const DAY = 86_400_000;
const rv = (daysAgo: number, grade: 1 | 2 | 3 | 4 = 3, state: Card["state"] = "review"): ReviewLog => ({ id: "x", at: NOW - daysAgo * DAY, grade, state });

test("день начинается в 4 утра", () => {
  assert.equal(dayOf(new Date(2026, 9, 18, 3, 59).getTime()), "2026-10-17");
  assert.equal(dayOf(new Date(2026, 9, 18, 4, 1).getTime()), "2026-10-18");
  assert.equal(dayShift(NOW, -1), "2026-10-17");
});

test("серия дней", () => {
  const d = byDay([rv(0), rv(1), rv(2), rv(5), rv(6), rv(7), rv(8)]);
  assert.deepEqual(streak(d, NOW), { current: 3, best: 4, today: true });
  // сегодня ещё не занимался — серия со вчера не обрывается
  assert.deepEqual(streak(byDay([rv(1), rv(2)]), NOW), { current: 2, best: 2, today: false });
  assert.equal(streak(byDay([]), NOW).current, 0);
});

test("прогноз нагрузки", () => {
  const c = (id: string, due: number, state: Card["state"] = "review"): Card => ({ ...newCard(id, NOW), state, due });
  const f = forecast([c("a", NOW - DAY), c("b", NOW + 3_600_000), c("c", NOW + 2 * DAY), c("d", NOW, "new"), c("e", NOW + 99 * DAY)], NOW, 7);
  assert.equal(f.length, 7);
  assert.equal(f[0], 2); // просроченная + сегодня позже
  assert.equal(f[2], 1);
  assert.equal(f.reduce((a, b) => a + b, 0), 3);
});

test("точность и иероглифы", () => {
  assert.deepEqual(accuracy([rv(1, 3), rv(2, 1), rv(3, 4), rv(4, 2, "learning"), rv(40, 1)], NOW), { pct: 67, n: 3 });
  assert.deepEqual(accuracy([], NOW), { pct: null, n: 0 });
  const cards = new Map<string, Card>([["zh:学习", { ...newCard("zh:学习", NOW), state: "review", stability: 3 }], ["zh:人", { ...newCard("zh:人", NOW), state: "learning", stability: 3 }]]);
  assert.deepEqual([...writableChars([{ id: "zh:学习", han: "学习" }, { id: "zh:人", han: "人" }], (id) => cards.get(id))], ["学", "习"]);
});

test("календарь", () => {
  const cal = calendar(byDay([rv(0), rv(0), rv(3)]), NOW, 4);
  assert.equal(cal.length, 4);
  assert.ok(cal.every((c) => c.length === 7));
  const flat = cal.flat();
  assert.equal(flat.find((x) => x.key === "2026-10-18")?.count, 2);
  assert.ok(flat.filter((x) => x.future).length < 7);
});
