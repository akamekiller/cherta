import { test } from "node:test";
import assert from "node:assert/strict";
import { optimize, evaluate, byCard, type Rev } from "../src/core/fsrsopt.ts";
import { schedule, newCard, retrievability, DEFAULT_PARAMS, DAY, type Grade } from "../src/core/fsrs.ts";

/** Выдуманный ученик: помнит лучше, чем считает FSRS по умолчанию (стабильность ×3). */
function simulate(nCards: number, seed = 1): Rev[] {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const out: Rev[] = [];
  for (let k = 0; k < nCards; k++) {
    const id = `zh:${k}`;
    let t = k * 60_000;
    let c = newCard(id, t);
    let trueS = 1;
    for (let r = 0; r < 6; r++) {
      let g: Grade;
      if (c.state === "review") {
        const days = (t - c.last) / DAY;
        const p = retrievability(days, trueS * 3);
        g = rnd() < p ? 3 : 1;
      } else g = 3;
      out.push({ id, at: t, grade: g });
      c = schedule(c, g, t, DEFAULT_PARAMS);
      trueS = Math.max(trueS, c.stability);
      t = c.due + Math.floor(rnd() * DAY);
    }
  }
  return out;
}

test("optimize: мало данных — null", () => {
  assert.equal(optimize(simulate(5), 100), null);
});

test("optimize: лог-лосс после подстройки не хуже, чем до", () => {
  const revs = simulate(150);
  const r = optimize(revs, 50, 3)!;
  assert.ok(r);
  assert.ok(r.after <= r.before);
  assert.ok(Math.abs(evaluate(byCard(revs), r.w).loss - r.after) < 1e-3);
});
