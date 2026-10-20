import { test } from "node:test";
import assert from "node:assert/strict";
import { romajiToKana, toHiragana, checkKana, isKana, mainReading } from "../src/core/kana.ts";

test("romajiToKana: основные слоги, Хэпбёрн и вапуро", () => {
  assert.equal(romajiToKana("gakusei"), "がくせい");
  assert.equal(romajiToKana("shinbun", true), "しんぶん");
  assert.equal(romajiToKana("shinbun"), "しんぶn");
  assert.equal(romajiToKana("sinbun", true), "しんぶん");
  assert.equal(romajiToKana("tsukue"), "つくえ");
  assert.equal(romajiToKana("tukue"), "つくえ");
  assert.equal(romajiToKana("chiisai"), "ちいさい");
  assert.equal(romajiToKana("fuyu"), "ふゆ");
  assert.equal(romajiToKana("jisho"), "じしょ");
  assert.equal(romajiToKana("zisyo"), "じしょ");
});

test("romajiToKana: ん, っ, ょう, долгий знак", () => {
  assert.equal(romajiToKana("kon'ya"), "こんや");
  assert.equal(romajiToKana("konnya", false, true), "こんや");
  assert.equal(romajiToKana("kitte"), "きって");
  assert.equal(romajiToKana("matcha"), "まっちゃ");
  assert.equal(romajiToKana("benkyou"), "べんきょう");
  assert.equal(romajiToKana("toukyou"), "とうきょう");
  assert.equal(romajiToKana("kyaku"), "きゃく");
  assert.equal(romajiToKana("ko-hi-"), "こーひー");
  assert.equal(romajiToKana("onna"), "おんな");
  assert.equal(romajiToKana("hon"), "ほn"); // ещё печатают — n в конце может стать «な/に…»
  assert.equal(romajiToKana("honn"), "ほん");
});

test("romajiToKana: кана остаётся как есть, незаконченный хвост — латиницей", () => {
  assert.equal(romajiToKana("がくせい"), "がくせい");
  assert.equal(romajiToKana("gakus"), "がくs");
  assert.equal(romajiToKana("ky"), "ky");
});

test("toHiragana и isKana", () => {
  assert.equal(toHiragana("アパート"), "あぱーと");
  assert.ok(isKana("アパート"));
  assert.ok(isKana("ああ"));
  assert.ok(!isKana("会う"));
});

test("checkKana: варианты колоды, катакана, ромадзи, n в конце", () => {
  assert.ok(checkKana("iku", "いく/ゆく").ok);
  assert.ok(checkKana("konnya", "こんや").ok);
  assert.ok(checkKana("onna", "おんな").ok);
  assert.ok(checkKana("yuku", "いく/ゆく").ok);
  assert.ok(!checkKana("kuru", "いく/ゆく").ok);
  assert.ok(checkKana("apa-to", "アパート").ok);
  assert.ok(checkKana("hon", "ほん").ok); // в конце ввода n засчитывается как ん
  assert.ok(checkKana("ほん", "ほん").ok);
  assert.ok(!checkKana("", "ほん").ok);
  assert.equal(mainReading("いく/ゆく"), "いく");
});
