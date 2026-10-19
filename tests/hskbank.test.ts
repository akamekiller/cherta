// Банк заданий HSK: каждая строка разбирается, на каждую часть хватает заданий на вариант (ничего не печатает).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseBank, LEVELS } from "../src/core/hsk.ts";

for (const spec of LEVELS) {
  const f = `data/hsk/hsk${spec.level}.txt`;
  test(`банк HSK ${spec.level}: все строки разбираются, заданий хватает`, { skip: !existsSync(f) }, () => {
    const src = readFileSync(f, "utf8");
    const items = parseBank(src);
    let part = "", lines = 0;
    const want: Record<string, number> = {};
    for (const l of src.split("\n")) {
      const m = /^==\s*(\d[LRW]\d)/.exec(l);
      if (m) { part = m[1]; continue; }
      if (part && l.trim() && !l.startsWith("#") && !l.trim().startsWith(">>")) { want[part] = (want[part] ?? 0) + 1; lines++; }
    }
    assert.equal(items.length, lines);
    for (const p of spec.parts) assert.ok((want[p.id] ?? 0) >= p.n, `часть ${p.id}: ${want[p.id] ?? 0} < ${p.n}`);
    for (const it of items) if (it.kind === "choice") assert.ok(it.a! >= 0 && it.a! < it.opts!.length);
  });
}
