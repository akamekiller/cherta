import { test } from "node:test";
import assert from "node:assert/strict";
import { parts, layoutName, toDecomp } from "../src/core/decomp.ts";

test("parts: листья разложения без повторов и «？»", () => {
  assert.deepEqual(parts("⿰女马"), ["女", "马"]);
  assert.deepEqual(parts("⿱⿰木木？"), ["木"]);
  assert.deepEqual(parts(""), []);
});

test("layoutName и toDecomp", () => {
  assert.equal(layoutName("⿱宀子"), "сверху вниз");
  assert.equal(layoutName("木"), "");
  assert.deepEqual(toDecomp(["⿰女马", "女", "s", "女", "马"]), { ids: "⿰女马", radical: "女", type: "s", semantic: "女", phonetic: "马" });
  assert.equal(toDecomp(undefined), null);
});
