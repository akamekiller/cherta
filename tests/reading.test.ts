import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTexts, mergeLib, inLib } from "../src/core/reading.ts";

test("тексты: уровень, слова, строки, вопросы", () => {
  const t = parseTexts(`=== 2 | Утро
+ 甲乙 | jia3 yi3 | выдуманное слово
甲乙丙。 | Перевод один.
丁戊。|Перевод два.
? Вопрос | да | нет* | может быть
=== Без уровня
甲。`);
  assert.equal(t.length, 2);
  assert.equal(t[0].level, 2);
  assert.equal(t[0].title, "Утро");
  assert.deepEqual(t[0].words, [["甲乙", "jia3 yi3", "выдуманное слово"]]);
  assert.deepEqual(t[0].lines, [["甲乙丙。", "Перевод один."], ["丁戊。", "Перевод два."]]);
  assert.deepEqual(t[0].q, [{ q: "Вопрос", o: ["да", "нет", "может быть"], a: 1 }]);
  assert.equal(t[1].level, 0);
  assert.equal(t[1].title, "Без уровня");
});

test("тексты: файл без заголовков и без перевода делится на предложения", () => {
  const t = parseTexts("﻿# Мой рассказ\n甲乙丙。丁戊！己庚？\n\n辛。");
  assert.equal(t.length, 1);
  assert.equal(t[0].title, "Мой рассказ");
  assert.deepEqual(t[0].lines.map((l) => l[0]), ["甲乙丙。", "丁戊！", "己庚？", "辛。"]);
  assert.equal(parseTexts("просто русский текст").length, 0);
});

test("библиотека: последнее действие побеждает, результаты — лучший", () => {
  const txt = { id: "o-1", level: 1, title: "x", words: [], lines: [["甲。", ""]] as [string, string][], q: [] };
  const a = { lib: { t1: 100, t2: -300, "o-1": 50 }, own: [txt], done: { t1: 0.5 } };
  const b = { lib: { t1: -200, t2: 250, t3: 10 }, own: [], done: { t1: 1 } };
  const m = mergeLib(a, b);
  assert.deepEqual(m.lib, { t1: -200, t2: -300, "o-1": 50, t3: 10 });
  assert.deepEqual(m.done, { t1: 1 });
  assert.equal(m.own.length, 1);
  assert.equal(inLib(m, "t1"), false);
  assert.equal(inLib(m, "t3"), true);
  assert.equal(mergeLib(undefined, undefined).own.length, 0);
});

test("parseTexts: короткая первая строка простого текста — заголовок", () => {
  const t = parseTexts("我的周末\n上个星期六，我去了公园。天气很好。");
  assert.equal(t[0].title, "我的周末");
  assert.equal(t[0].lines.length, 2);
  const u = parseTexts("我去了公园。天气很好。");
  assert.equal(u[0].title, "Мой текст");
});
