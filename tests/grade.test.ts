import { test } from "node:test";
import assert from "node:assert/strict";

test("blindMistakes: по месту в распознавании и числу черт", async () => {
  const { blindMistakes } = await import("../src/core/grade.ts");
  assert.equal(blindMistakes(0, 0), 0);
  assert.equal(blindMistakes(2, 1), 1);
  assert.equal(blindMistakes(5, 0), 2);
  assert.equal(blindMistakes(-1, 0), 4);
  assert.equal(blindMistakes(0, 3), 1);
});