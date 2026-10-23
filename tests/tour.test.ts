import { test } from "node:test";
import assert from "node:assert/strict";
import { tourSteps, stepLabel, sectionsOf, sectionIndex, nextSectionStart } from "../src/core/tour.ts";

const VIEWS = ["home", "words", "book", "ex", "read", "settings", "stats"];

test("обучение: у каждого шага есть заголовок, текст и существующий экран", () => {
  for (const lang of ["zh", "ja"] as const) {
    const s = tourSteps(lang);
    assert.ok(s.length >= 10);
    for (const x of s) { assert.ok(x.title.length > 2); assert.ok(x.text.length > 20); assert.ok(VIEWS.includes(x.view)); }
  }
});
test("обучение: японский режим без рисования и пиньиня", () => {
  const ja = tourSteps("ja"), zh = tourSteps("zh");
  assert.ok(ja.length < zh.length);
  assert.ok(!ja.some((x) => x.zhOnly));
  assert.ok(!ja.some((x) => /пиньин/i.test(x.text)));
});
test("разделы идут подряд и пропуск ведёт в следующий", () => {
  const s = tourSteps("zh");
  const secs = sectionsOf(s);
  assert.deepEqual(secs.slice(0, 3), ["Слова", "Карточки", "Тетрадь"]);
  assert.equal(new Set(secs).size, secs.length);        // раздел не повторяется
  assert.equal(sectionIndex(s, 0), 0);
  const n = nextSectionStart(s, 0);
  assert.equal(s[n].section, "Карточки");
  assert.equal(nextSectionStart(s, s.length - 1), -1);
});
test("подпись шага", () => assert.equal(stepLabel(1, 6), "2 из 6"));
