import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRef, checkPinyin, mark, toMarked, searchKey } from "../src/core/pinyin.ts";
import { newCard, schedule, DAY, retrievability, type Grade } from "../src/core/fsrs.ts";
import { autoGrade } from "../src/core/grade.ts";
import { parseTSV, loadDeck } from "../src/core/deck.ts";

const ok = (input: string, ref: string) => checkPinyin(input, parseRef(ref));

test("пиньинь: цифры, знаки, ü, слитно и с пробелами", () => {
  assert.equal(ok("ren2", "ren2").ok, true);
  assert.equal(ok("rén", "ren2").ok, true);
  assert.equal(ok("Rén", "ren2").ok, true);
  assert.equal(ok("zhōngguó", "zhong1 guo2").ok, true);
  assert.equal(ok("zhong1 guo2", "zhong1 guo2").ok, true);
  assert.equal(ok("nü3er2", "nv3 er2").ok, true);
  assert.equal(ok("nu:3 er2", "nv3 er2").ok, true);
  assert.equal(ok("nǚ'ér", "nv3 er2").ok, true);
});

test("пиньинь: неверный тон и неверные буквы различаются", () => {
  const r = ok("ren4", "ren2");
  assert.deepEqual(r, { ok: false, per: [false], letters: true });
  const l = ok("ran2", "ren2");
  assert.equal(l.letters, false);
});

test("пиньинь: нейтральный тон можно не писать, сандхи 不/一 засчитывается", () => {
  assert.equal(ok("xie4xie", "xie4 xie5").ok, true);
  assert.equal(ok("xie4xie5", "xie4 xie5").ok, true);
  assert.equal(ok("bu4 ke4 qi", "bu2/4 ke4 qi5").ok, true);
  assert.equal(ok("búkèqi", "bu2/4 ke4 qi5").ok, true);
  assert.equal(ok("bu3 ke4 qi", "bu2/4 ke4 qi5").ok, false);
});

test("знаки тонов ставятся по правилам", () => {
  assert.equal(mark("guo", 2), "guó");
  assert.equal(mark("liu", 4), "liù");
  assert.equal(mark("dui", 4), "duì");
  assert.equal(mark("hao", 3), "hǎo");
  assert.equal(mark("lv", 4), "lǜ");
  assert.equal(mark("de", 5), "de");
  assert.equal(toMarked(parseRef("nv3 er2")), "nǚ ér");
  assert.equal(searchKey("Nǚ ér"), "nver");
});

test("FSRS: новая карточка проходит шаги 1 мин → 10 мин → дни", () => {
  const t0 = Date.UTC(2026, 0, 1);
  let c = newCard("zh:人", t0);
  c = schedule(c, 3, t0);
  assert.equal(c.state, "learning");
  assert.equal(c.due - t0, 10 * 60_000);
  c = schedule(c, 3, c.due);
  assert.equal(c.state, "review");
  assert.ok(c.due - c.last >= DAY);
});

test("FSRS: «Снова» на повторении отправляет на переучивание", () => {
  const t0 = Date.UTC(2026, 0, 1);
  let c = schedule(newCard("x", t0), 4, t0);
  assert.equal(c.state, "review");
  const s = c.stability;
  c = schedule(c, 1, c.due);
  assert.equal(c.state, "relearning");
  assert.equal(c.lapses, 1);
  assert.ok(c.stability < s);
});

test("FSRS: интервалы Трудно < Хорошо < Легко и растут со временем", () => {
  const t0 = Date.UTC(2026, 0, 1);
  let c = schedule(newCard("x", t0), 3, t0);
  c = schedule(c, 3, c.due);
  const gaps = ([2, 3, 4] as Grade[]).map((g) => schedule(c, g, c.due).due - c.due);
  assert.ok(gaps[0] < gaps[1] && gaps[1] < gaps[2], gaps.join(","));
  const next = schedule(c, 3, c.due);
  const after = schedule(next, 3, next.due);
  assert.ok(after.due - next.due > next.due - c.due);
});

test("FSRS: вероятность вспомнить 0.9 при t = S", () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
});

test("авто-оценка", () => {
  const base = { chars: 2, mistakes: 0, gaveUp: false, hinted: false, isNew: false, pinyin: null };
  assert.equal(autoGrade(base), 3);
  assert.equal(autoGrade({ ...base, gaveUp: true }), 1);
  assert.equal(autoGrade({ ...base, mistakes: 7 }), 1);
  assert.equal(autoGrade({ ...base, mistakes: 3 }), 2);
  assert.equal(autoGrade({ ...base, hinted: true }), 2);
  assert.equal(autoGrade({ ...base, isNew: true, hinted: true, mistakes: 2 }), 3);
  assert.equal(autoGrade({ ...base, pinyin: { ok: false, per: [true, false], letters: true } }), 2);
  assert.equal(autoGrade({ ...base, pinyin: { ok: false, per: [false, false], letters: false } }), 1);
});

test("колода из TSV", () => {
  const rows = parseTSV("word\tpinyin\tmeaning_ru\n人\tren2\tчеловек\r\n中国\tzhong1 guo2\tКитай\n");
  const d = loadDeck({ id: "t", title: "T", lang: "zh", words: rows });
  assert.equal(d.words.length, 2);
  assert.equal(d.words[1].id, "zh:中国");
  assert.equal(d.words[1].ref[1].t, 2);
});
