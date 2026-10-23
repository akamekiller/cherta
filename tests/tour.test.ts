import { test } from "node:test";
import assert from "node:assert/strict";
import { tourSteps, stepLabel } from "../src/core/tour.ts";

test("экскурсия: 6 шагов, у каждого заголовок и текст", () => {
  for (const lang of ["zh", "ja"] as const) {
    const s = tourSteps(lang);
    assert.equal(s.length, 6);
    for (const x of s) { assert.ok(x.title.length > 2); assert.ok(x.text.length > 20); if (x.go) assert.ok(x.goLabel); }
  }
});
test("экскурсия: японский текст не говорит про пиньинь", () => {
  assert.ok(!tourSteps("ja").some((x) => /пиньин/i.test(x.text)));
  assert.ok(tourSteps("zh").some((x) => /пиньин/i.test(x.text)));
});
test("подпись шага", () => assert.equal(stepLabel(1, 6), "2 из 6"));
