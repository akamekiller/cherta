import { test } from "node:test";
import assert from "node:assert/strict";
import { noteAnswer, wrongPool, wrongCount, permOf, applyPerm, addPartStats, weakParts, mergeProg, type WrongRec } from "../src/core/hskprog.ts";
import type { Item } from "../src/core/hsk.ts";

const it = (id: string, opts?: string[], a?: number): Item => ({ id, part: id.split("-")[0], kind: "choice", opts: opts?.map((t) => ({ t })), a });

test("ошибка уходит из списка после двух верных ответов подряд", () => {
  const w: Record<string, WrongRec> = {};
  noteAnswer(w, "1L1-1", false, 1);
  assert.equal(wrongCount(w, 1), 1);
  noteAnswer(w, "1L1-1", true, 2);
  assert.equal(wrongCount(w, 1), 1);
  noteAnswer(w, "1L1-1", false, 3);
  assert.equal(w["1L1-1"].streak, 0);
  assert.equal(w["1L1-1"].n, 2);
  noteAnswer(w, "1L1-1", true, 4); noteAnswer(w, "1L1-1", true, 5);
  assert.equal(wrongCount(w, 1), 0);
  noteAnswer(w, "2L1-1", true, 6); // верный ответ на не ошибочное задание ничего не создаёт
  assert.equal(w["2L1-1"], undefined);
});

test("пул ошибок: давние первыми, решённые не берутся, по уровню", () => {
  const w: Record<string, WrongRec> = { "1L1-1": { n: 1, streak: 0, last: 5 }, "1L1-2": { n: 1, streak: 0, last: 2 }, "1L1-3": { n: 1, streak: 2, last: 1 } };
  const bank = [it("1L1-1"), it("1L1-2"), it("1L1-3"), it("2L1-1")];
  assert.deepEqual(wrongPool(w, bank).map((x) => x.id), ["1L1-2", "1L1-1"]);
  assert.deepEqual(wrongPool(w, bank, 1).map((x) => x.id), ["1L1-2"]);
});

test("порядок вариантов восстанавливается", () => {
  const o = it("1R3-1", ["a", "b", "c"], 1);
  const s = { ...o, opts: [{ t: "c" }, { t: "a" }, { t: "b" }], a: 2 };
  const perm = permOf(o, s)!;
  assert.deepEqual(perm, [2, 0, 1]);
  assert.deepEqual(applyPerm(o, perm), s);
  assert.equal(permOf(o, o), undefined);
});

test("слабые части", () => {
  const st = {};
  addPartStats(st, Array.from({ length: 10 }, (_, i) => ({ part: "2R3", right: i < 4 })));
  addPartStats(st, Array.from({ length: 10 }, () => ({ part: "2R4", right: true })));
  addPartStats(st, [{ part: "2L1", right: false }]);
  const w = weakParts(st, 2);
  assert.equal(w.length, 1);
  assert.equal(w[0].part, "2R3");
  assert.equal(weakParts(st, 1).length, 0);
});

test("слияние: ошибки по свежести, варианты объединяются", () => {
  const a = { seen: { x: 5 }, hist: [{ at: 1 }], runs: [{ at: 1 }], wrong: { "1L1-1": { n: 1, streak: 0, last: 1 } }, stat: { "1L1": [1, 2] } };
  const b = { seen: { x: 9 }, hist: [{ at: 2 }], runs: [{ at: 2 }], wrong: { "1L1-1": { n: 1, streak: 2, last: 7 } }, stat: { "1L1": [3, 4] }, cur: { at: 4 } };
  const m = mergeProg(a, b) as never as { seen: Record<string, number>; hist: unknown[]; runs: unknown[]; wrong: Record<string, WrongRec>; stat: Record<string, number[]>; cur: unknown };
  assert.equal(m.seen.x, 9);
  assert.equal(m.hist.length, 2);
  assert.equal(m.runs.length, 2);
  assert.equal(m.wrong["1L1-1"].streak, 2);
  assert.deepEqual(m.stat["1L1"], [3, 4]);
  assert.deepEqual(m.cur, { at: 4 });
});

test("слияние: устная часть", () => {
  const a = { oral: { seen: { a: 1, b: 5 }, hist: [{ at: 1 }] } };
  const b = { oral: { seen: { a: 3 }, hist: [{ at: 2 }] } };
  const m = mergeProg(a, b) as never as { oral: { seen: Record<string, number>; hist: unknown[] } };
  assert.deepEqual(m.oral.seen, { a: 3, b: 5 });
  assert.equal(m.oral.hist.length, 2);
  assert.equal((mergeProg({}, {}) as { oral?: unknown }).oral, undefined);
});
