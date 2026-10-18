// Тесты словаря на выдуманных данных (настоящая база БКРС в тестах не используется).
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitArticle, countWithChar, pyReadings, parseIndex, searchDict, wordsWithChar, lookupIndex, dictPyToNumeric, safeHtml, dictShardOf, shardFile } from "../src/core/dict.ts";

const FAKE = [
  "甲\tjiǎ\tпервый знак",
  "甲乙\tjiǎyǐ\tпервый и второй",
  "乙甲丙\tyǐjiǎbǐng\tтри знака подряд",
  "丙\tbǐng, bìng\tтретий знак",
  "丁丁\tdīngdīng\tучиться звенеть",
  "戊\twù\tслучиться",
  "己己\tjǐjǐ\tучиться",
  "庚\tgēng\t",
].join("\n") + "\n";

test("разбор индекса", () => {
  const idx = parseIndex(FAKE);
  assert.equal(idx.han.length, 8);
  assert.equal(idx.pk[1], "jiayi");
  assert.equal(idx.pka[3], "|bing|bing|");
  assert.equal(lookupIndex(idx, "庚")?.ru, "");
  assert.equal(lookupIndex(idx, "辛"), null);
});

test("поиск по иероглифам: точное, начало, вхождение", () => {
  const idx = parseIndex(FAKE);
  assert.deepEqual(searchDict(idx, "甲").map((h) => h.han), ["甲", "甲乙", "乙甲丙"]);
  assert.deepEqual(searchDict(idx, "甲", 50, new Set(["甲"])).map((h) => h.han), ["甲乙", "乙甲丙"]);
  assert.equal(searchDict(idx, "甲", 1).length, 1);
});

test("поиск по пиньиню без тонов и со знаками", () => {
  const idx = parseIndex(FAKE);
  assert.deepEqual(searchDict(idx, "jia").map((h) => h.han), ["甲", "甲乙"]);
  assert.deepEqual(searchDict(idx, "jia yi").map((h) => h.han), ["甲乙"]);
  assert.deepEqual(searchDict(idx, "jiǎyǐ").map((h) => h.han), ["甲乙"]);
  assert.ok(searchDict(idx, "bing").some((h) => h.han === "丙"));
});

test("поиск по-русски: с начала слова, целое слово выше", () => {
  const idx = parseIndex(FAKE);
  const r = searchDict(idx, "учиться").map((h) => h.han);
  assert.deepEqual(r, ["己己", "丁丁"]); // «случиться» не находится, точное значение выше
  assert.deepEqual(searchDict(idx, "перв").map((h) => h.han), ["甲", "甲乙"]);
  assert.deepEqual(searchDict(idx, "три знака").map((h) => h.han), ["乙甲丙"]);
});

test("слова с иероглифом", () => {
  const idx = parseIndex(FAKE);
  assert.deepEqual(wordsWithChar(idx, "甲").map((h) => h.han), ["甲乙", "乙甲丙"]);
  assert.deepEqual(wordsWithChar(idx, "甲", 24, "甲乙").map((h) => h.han), ["乙甲丙"]);
  assert.deepEqual(wordsWithChar(idx, "甲", 24, undefined, "start").map((h) => h.han), ["甲乙"]);
  assert.deepEqual(countWithChar(idx, "甲"), { start: 1, any: 2 });
  assert.deepEqual(countWithChar(idx, "甲", "甲乙"), { start: 0, any: 1 });
});

test("шард", () => {
  assert.equal(dictShardOf("一"), 0x4e00 % 128);
  assert.equal(shardFile(7), "007.json");
});

test("пиньинь БКРС → формат колоды", () => {
  assert.equal(dictPyToNumeric("xuéxí", "学习"), "xue2 xi2");
  assert.equal(dictPyToNumeric("Xī'ān", "西安"), "xi1 an1");
  assert.equal(dictPyToNumeric("xī'ān", "先"), null); // слогов больше, чем иероглифов
  assert.equal(dictPyToNumeric("xiān", "先"), "xian1");
  assert.equal(dictPyToNumeric("nǚ'ér", "女儿"), "nv3 er2");
  assert.equal(dictPyToNumeric("nǎr", "哪儿"), "na3 r5");
  assert.equal(dictPyToNumeric("dōngxi", "东西"), "dong1 xi5");
  assert.equal(dictPyToNumeric("àihào, àihǎo", "爱好"), "ai4 hao4");
  assert.equal(dictPyToNumeric("tiān'ānmén", "天安门"), "tian1 an1 men2");
  assert.equal(dictPyToNumeric("zhōngguó rén", "中国人"), "zhong1 guo2 ren2");
  assert.equal(dictPyToNumeric("hǎo; hào", "好"), "hao3");
  assert.equal(dictPyToNumeric("", "人"), null);
  assert.equal(dictPyToNumeric("kǎ lā OK", "卡拉OK"), null);
});

test("безопасный HTML статьи", () => {
  assert.equal(safeHtml('<i>a</i><span class="lb">b</span><a data-w="甲">甲</a>'), '<i>a</i><span class="lb">b</span><a data-w="甲">甲</a>');
  assert.equal(safeHtml('<img src=x onerror=alert(1)>'), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(safeHtml('<a href="javascript:x">y</a>'), '&lt;a href="javascript:x"&gt;y</a>');
  assert.equal(safeHtml('<span class="lb" onclick="x">'), '&lt;span class="lb" onclick="x"&gt;');
});

test("чтения из поля пиньиня", () => {
  assert.deepEqual(pyReadings("hǎo, hào"), ["hǎo", "hào"]);
  assert.deepEqual(pyReadings("hǎo; hào [устар.]"), ["hǎo", "hào"]);
  assert.deepEqual(pyReadings(""), []);
});

test("статья по смыслам: примеры под своим значением", () => {
  const p = splitArticle([
    [0, "<b>I</b>"], [1, "первое"], [2, "раз", "甲乙"], [2, "два", "乙甲"],
    [1, "второе"], [0, "без пары", "丙丁"],
  ]);
  assert.equal(p.senses.length, 3);
  assert.equal(p.exampleCount, 3);
  assert.equal(p.examples.length, 2);
  assert.equal(p.examples[0].sense, "первое");
  assert.deepEqual(p.examples[0].items.map((x) => x.zh), ["甲乙", "乙甲"]);
  assert.equal(p.examples[1].sense, "второе");
  assert.equal(splitArticle([[0, "т", "甲"]]).examples[0].sense, null);
});
