// Импорт и экспорт колод на выдуманных файлах.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport, exportDeckText, normalizePinyin, splitCsv, stripHtml, fileName } from "../src/core/importer.ts";

test("пиньинь в любом виде", () => {
  assert.equal(normalizePinyin("xue2 xi2", "学习"), "xue2 xi2");
  assert.equal(normalizePinyin("xue2xi2", "学习"), "xue2 xi2");
  assert.equal(normalizePinyin("xué xí", "学习"), "xue2 xi2");
  assert.equal(normalizePinyin("xuéxí", "学习"), "xue2 xi2");
  assert.equal(normalizePinyin("Xī'ān", "西安"), "xi1 an1");
  assert.equal(normalizePinyin("nu:3 er2", "女儿"), "nv3 er2");
  assert.equal(normalizePinyin("xue2", "学习"), null); // слогов меньше, чем иероглифов
  assert.equal(normalizePinyin("", "学"), null);
});

test("Anki: заголовки, HTML, колода", () => {
  const r = parseImport("#separator:tab\n#html:true\n#deck:Китайский::Урок 3\n学习\txué xí\tучиться<br>изучать\n<b>人</b>\trén\tчеловек\n", "x.txt");
  assert.equal(r.format, "Anki");
  assert.equal(r.title, "Урок 3");
  assert.deepEqual(r.rows, [
    { han: "学习", py: "xue2 xi2", ru: "учиться; изучать" },
    { han: "人", py: "ren2", ru: "человек" },
  ]);
});

test("Pleco: категория и пиньинь с цифрами слитно", () => {
  const r = parseImport("//Мои слова\n学习\txue2xi2\tto study\n好\thao3\tgood\n");
  assert.equal(r.format, "Pleco");
  assert.equal(r.title, "Мои слова");
  assert.equal(r.rows[0].py, "xue2 xi2");
  assert.equal(r.rows[0].ru, "to study");
});

test("CSV с кавычками, колонки в любом порядке, заголовок пропускается", () => {
  const r = parseImport('word,pinyin,meaning\n"учиться, изучать",xué xí,学习\n大,dà,большой\n', "skritter.csv");
  assert.equal(r.title, "skritter");
  assert.deepEqual(r.rows.map((x) => [x.han, x.py, x.ru]), [["学习", "xue2 xi2", "учиться, изучать"], ["大", "da4", "большой"]]);
  assert.deepEqual(r.skipped, []);
});

test("просто список иероглифов и мусор", () => {
  const r = parseImport("人 大, 学习\nhello\n人\n");
  assert.equal(r.format, "список");
  assert.deepEqual(r.rows.map((x) => x.han), ["人", "大", "学习"]);
  assert.deepEqual(r.skipped, ["hello"]);
  assert.equal(r.rows[0].py, null);
});

test("свой формат через |", () => {
  const r = parseImport("飞船 | fēi chuán | космический корабль\n");
  assert.deepEqual(r.rows[0], { han: "飞船", py: "fei1 chuan2", ru: "космический корабль" });
});

test("экспорт читается обратно", () => {
  const txt = exportDeckText("Урок\t3", [["学习", "xue2 xi2", "учиться"], ["人", "ren2", "человек\tлюди"]]);
  assert.ok(txt.startsWith("#separator:tab\n#html:false\n#deck:Урок 3\n"));
  const back = parseImport(txt);
  assert.equal(back.title, "Урок 3");
  assert.deepEqual(back.rows.map((x) => [x.han, x.py, x.ru]), [["学习", "xue2 xi2", "учиться"], ["人", "ren2", "человек люди"]]);
});

test("мелочи", () => {
  assert.deepEqual(splitCsv('a,"b,c",d', ","), ["a", "b,c", "d"]);
  assert.equal(stripHtml("a&nbsp;<i>b</i>"), "a b");
  assert.equal(fileName('HSK: 1/2', "txt"), "HSK 1 2.txt");
});

test("файл с несколькими колодами: разделы ## и группа", async () => {
  const { parseImportAll } = await import("../src/core/importer.ts");
  const r = parseImportAll("#separator:tab\n#group:Учебник\n## Урок 1\n你\tnǐ\tты\n好\thǎo\tхороший\n## Урок 2\n我\twǒ\tя\n", "x.txt");
  assert.equal(r.length, 2);
  assert.equal(r[0].title, "Урок 1");
  assert.equal(r[0].group, "Учебник");
  assert.equal(r[0].rows.length, 2);
  assert.equal(r[1].rows[0].py, "wo3");
  const one = parseImportAll("你\tnǐ\tты\n", "Мои слова.txt");
  assert.equal(one.length, 1);
  assert.equal(one[0].title, "Мои слова");
});
