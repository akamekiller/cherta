import { test } from "node:test";
import assert from "node:assert/strict";
import { PerfLog, summarize, percentile, CAP } from "../src/core/perflog.ts";

test("percentile", () => {
  assert.equal(percentile([], 95), 0);
  assert.equal(percentile([5], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 100], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 100], 95), 100);
});

test("журнал не растёт бесконечно", () => {
  const l = new PerfLog();
  for (let i = 0; i < CAP + 50; i++) l.addLong(i, 60);
  assert.equal(l.long.length, CAP);
  assert.equal(l.long[0].t, 50);
});

test("кадры считаются по порогам", () => {
  const l = new PerfLog();
  [16, 17, 40, 60, 150].forEach((g, i) => l.addFrame(i * 1000, g));
  assert.deepEqual(l.frames, { n: 5, slow: 3, bad: 1, max: 150 });
  assert.equal(l.slowFrames.length, 2);
});

test("сводка: задержки по времени от запуска", () => {
  const l = new PerfLog();
  l.addLong(5000, 120); l.addLong(20000, 300); l.addLong(70000, 80); l.addLong(700000, 55);
  const s = summarize(l, 800000, { Тема: "tush" });
  assert.match(s, /Прошло с запуска: 13:20/);
  assert.match(s, /Тема: tush/);
  assert.match(s, /первые 30 с после запуска: 2 раз, всего 420 мс, самая долгая 300 мс/);
  assert.match(s, /30 с – 2 мин: 1 раз/);
  assert.match(s, /позже 10 мин: 1 раз/);
  assert.doesNotMatch(s, /2 – 10 мин/);
});

test("сводка без данных", () => {
  const s = summarize(new PerfLog(), 1000, {});
  assert.match(s, /не было/);
  assert.match(s, /кадров не записано/);
});

test("касания: типичное и хвост", () => {
  const l = new PerfLog();
  for (let i = 0; i < 20; i++) l.addEvent(1000 * i, 20, "pointermove");
  l.addEvent(30000, 400, "pointerup");
  l.addEvent(31000, 900, "click");
  const s = summarize(l, 60000, {});
  assert.match(s, /дольше 16 мс: 21/);
  assert.match(s, /самое долгое 400 мс/);
});
