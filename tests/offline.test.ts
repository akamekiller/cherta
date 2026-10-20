import { test } from "node:test";
import assert from "node:assert/strict";
import { runQueue, countCached, fmtSize } from "../src/core/offline.ts";

test("runQueue: качает только недостающее, без повторов, считает байты", async () => {
  const got: string[] = [];
  const res = await runQueue(["a", "b", "b", "c", "d"], {
    has: (u) => u === "a",
    get: async (u) => { got.push(u); return 10; },
    concurrency: 2,
  });
  assert.deepEqual(got.sort(), ["b", "c", "d"]);
  assert.equal(res.total, 3);
  assert.equal(res.done, 3);
  assert.equal(res.bytes, 30);
  assert.equal(res.failed, 0);
});

test("runQueue: ошибка одного файла не останавливает остальные", async () => {
  const res = await runQueue(["a", "b", "c"], {
    has: () => false,
    get: async (u) => { if (u === "b") throw new Error("404"); return 1; },
  });
  assert.equal(res.done, 3);
  assert.equal(res.failed, 1);
  assert.deepEqual(res.failedUrls, ["b"]);
});

test("runQueue: остановка прерывает очередь", async () => {
  const ctl = new AbortController();
  let n = 0;
  const res = await runQueue(Array.from({ length: 50 }, (_, i) => `u${i}`), {
    has: () => false, concurrency: 1, signal: ctl.signal,
    get: async () => { if (++n === 5) ctl.abort(); return 1; },
  });
  assert.equal(res.aborted, true);
  assert.ok(res.done < 50);
});

test("runQueue: всё уже скачано — пустая очередь", async () => {
  const res = await runQueue(["a"], { has: () => true, get: async () => { throw new Error("не должно"); } });
  assert.equal(res.total, 0);
});

test("countCached и fmtSize", () => {
  assert.equal(countCached(["a", "a", "b", "c"], (u) => u !== "c"), 2);
  assert.equal(fmtSize(500), "1 КБ");
  assert.equal(fmtSize(300 * 1024), "300 КБ");
  assert.equal(fmtSize(3.4 * 1024 * 1024), "3,4 МБ");
  assert.equal(fmtSize(120 * 1024 * 1024), "120 МБ");
});
