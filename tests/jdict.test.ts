import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJIndex, searchJDict, findJ, jWordsWithChar, countJWithChar, jArticleHTML, queryKana, jHan, jHeadPol, jShardOf } from "../src/core/jdict.ts";

// выдуманные данные в формате index.tsv
const IDX = [
  ["100-00-01", "たべる", "食べる", "табэру", "есть, кушать", "N5"],
  ["100-00-02", "たべもの", "食べ物", "табэмоно", "еда", "N5"],
  ["100-00-03", "テレビ", "", "тэрэби", "телевизор", "N5"],
  ["100-00-04", "くう", "食う･喰う", "ку:", "жрать", ""],
  ["100-00-05", "がくせい", "学生", "гакусэй", "студент", "частое"],
  ["100-00-06", "しょく", "食", "сёку", "пища; еда", ""],
  ["100-00-07", "いい, よい", "良い", "ий, ёй", "хороший", "N5"],
  ["100-00-08", "いい", "", "ий", "<i>см.</i> よい", ""],
].map((r) => r.join("\t")).join("\n");
const x = parseJIndex(IDX);

test("индекс разбирается", () => {
  assert.equal(x.id.length, 8);
  assert.equal(jHan(x, 0), "食べる");
  assert.equal(jHan(x, 2), "テレビ");
  assert.equal(x.kk[6], "|いい|よい|");
});

test("ромадзи → кана для поиска", () => {
  assert.equal(queryKana("taberu"), "たべる");
  assert.equal(queryKana("terebi"), "てれび");
  assert.equal(queryKana("テレビ"), "てれび");
  assert.equal(queryKana("tabe ru"), "たべる");
  assert.equal(queryKana("xyz1"), null);
});

test("поиск по кандзи: точное → начало → вхождение", () => {
  const r = searchJDict(x, "食べる").map((h) => h.id);
  assert.deepEqual(r, ["100-00-01"]);
  const r2 = searchJDict(x, "食").map((h) => h.id);
  assert.equal(r2[0], "100-00-06"); // точное
  assert.ok(r2.indexOf("100-00-01") < r2.indexOf("100-00-04") || r2.includes("100-00-04"));
  assert.equal(r2.length, 4);
});

test("поиск каной и ромадзи, катакана = хирагана", () => {
  assert.deepEqual(searchJDict(x, "taberu").map((h) => h.id), ["100-00-01"]);
  assert.deepEqual(searchJDict(x, "tabe").map((h) => h.id), ["100-00-01", "100-00-02"]);
  assert.deepEqual(searchJDict(x, "てれび").map((h) => h.id), ["100-00-03"]);
  assert.deepEqual(searchJDict(x, "yoi").map((h) => h.id), ["100-00-07"]);
});

test("поиск по-русски и Поливановым", () => {
  assert.deepEqual(searchJDict(x, "еда").map((h) => h.id), ["100-00-02", "100-00-06"]);
  assert.deepEqual(searchJDict(x, "табэру").map((h) => h.id), ["100-00-01"]);
  assert.equal(searchJDict(x, "ку")[0].id, "100-00-04"); // «ку:» без долготы — первым, дальше «кушать»
  assert.equal(searchJDict(x, "студ")[0].id, "100-00-05");
});

test("слово из колоды находит свою статью", () => {
  assert.deepEqual(findJ(x, "食べる", "たべる"), [0]);
  assert.deepEqual(findJ(x, "テレビ"), [2]);
  assert.deepEqual(findJ(x, "いい"), [7]); // каной: сначала статья без кандзи
  assert.deepEqual(findJ(x, "良い", "よい"), [6]);
});

test("слова с кандзи", () => {
  assert.deepEqual(jWordsWithChar(x, "食").map((h) => h.id), ["100-00-01", "100-00-02", "100-00-04"]);
  assert.deepEqual(jWordsWithChar(x, "食", 24, "100-00-01", "start").map((h) => h.id), ["100-00-02", "100-00-04"]);
  assert.equal(countJWithChar(x, "食"), 3);
});

test("статья: текст экранируется, разрешены только <i> и ссылки", () => {
  const t = "たべる【食べる】(табэру)〔100-00-01〕\n1) есть; <i>разг.</i> жить <script>x</script>\n2) <i>см.</i> <a href=\"#100-00-04\">くう</a>\n～させる кормить";
  const { head, html } = jArticleHTML(t);
  assert.equal(jHeadPol(head), "табэру");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<i>разг.</i>"));
  assert.ok(html.includes('data-jid="100-00-04"'));
  assert.ok(html.includes('class="r1"'));
  assert.ok(html.includes('class="der"'));
  assert.equal(jArticleHTML("x(y)〔1〕\n<i>незакрыт").html, "<p><i>незакрыт</i></p>");
});

test("часть файла по id", () => {
  assert.equal(jShardOf("000-00-01", 128), 1);
  assert.equal(jShardOf("009-56-22", 128), 95622 % 128);
});
