import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueChars, cellPlan, printRows, paginate, rowsPerPage } from "../src/core/copybook.ts";

test("иероглифы без повторов и не-иероглифов", () => {
  assert.deepEqual(uniqueChars(["学习", "学生", "a1 好！"]), ["学", "习", "生", "好"]);
  assert.deepEqual(uniqueChars([]), []);
});

test("клетки упражнения", () => {
  assert.deepEqual(cellPlan(5, 2), [true, true, false, false, false]);
  assert.deepEqual(cellPlan(2, 9), [true, true]);
  assert.equal(cellPlan(0, 0).length, 1);
});

test("строки для печати", () => {
  const rows = printRows(["甲", "乙"], { perRow: 6, traces: 2, rowsPerChar: 2 });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0].cells, ["sample", "trace", "trace", "empty", "empty", "empty"]);
  assert.deepEqual(rows[1].cells, ["trace", "trace", "empty", "empty", "empty", "empty"]);
  assert.equal(rows[2].char, "乙");
});

test("страницы не разрывают иероглиф", () => {
  const rows = printRows(["甲", "乙", "丙"], { perRow: 8, traces: 1, rowsPerChar: 2 });
  const pages = paginate(rows, 3);
  assert.deepEqual(pages.map((p) => p.map((r) => r.char).join("")), ["甲甲", "乙乙", "丙丙"]);
  assert.equal(paginate(printRows(["甲"], { perRow: 8, traces: 1, rowsPerChar: 5 }), 3).length, 2);
  assert.ok(rowsPerPage(10) >= 12 && rowsPerPage(6) < rowsPerPage(10));
});
