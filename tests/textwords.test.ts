import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeText, wordsFromText, guessLevel, titleOf } from "../src/core/textwords.ts";

test("looksLikeText: текст, а не таблица или список", () => {
  assert.equal(looksLikeText("我今天去学校。老师很好。"), true);
  assert.equal(looksLikeText("我今天去学校老师很好我们"), true);
  assert.equal(looksLikeText("学习 | xue2 xi2 | учить\n老师 | lao3 shi1 | учитель"), false);
  assert.equal(looksLikeText("学习\txuéxí\tучить\n老师\tlǎoshī\tучитель"), false);
  assert.equal(looksLikeText("学习 老师 朋友"), false);
  assert.equal(looksLikeText("学习，老师，朋友"), false);
  assert.equal(looksLikeText(""), false);
});

test("wordsFromText: самое длинное совпадение, порядок и повторы", () => {
  const dict = new Set(["我们", "学习", "汉语", "老师"]);
  const r = wordsFromText("我们学习汉语。老师说：我们学习！", (w) => dict.has(w));
  assert.deepEqual(r.map((x) => x.w), ["我们", "学习", "汉语", "老师", "说"]);
  assert.equal(r.find((x) => x.w === "我们")!.n, 2);
});

test("guessLevel: 90% слов не выше уровня", () => {
  const lv: Record<string, number> = { 我: 1, 你: 1, 学习: 1, 环境: 3, 经济: 4 };
  const words = [{ w: "我", n: 5 }, { w: "你", n: 3 }, { w: "学习", n: 1 }, { w: "环境", n: 2 }, { w: "张三", n: 2 }];
  assert.equal(guessLevel(words, (w) => lv[w]), 3);
  assert.equal(guessLevel([{ w: "我", n: 20 }, { w: "经济", n: 1 }], (w) => lv[w]), 1);
  assert.equal(guessLevel([{ w: "张三", n: 1 }], (w) => lv[w]), 0);
});

test("titleOf: первая фраза", () => {
  assert.equal(titleOf("我的周末。我和朋友去公园。"), "我的周末");
  assert.equal(titleOf("hello"), "Мой текст");
});

import { stripFences } from "../src/core/textwords.ts";
import { aiPrompt } from "../src/core/aiprompt.ts";
import { parseExSet } from "../src/core/exercise.ts";
import { checkCourseText } from "../src/core/coursebuild.ts";

test("stripFences: берём содержимое блока кода", () => {
  assert.equal(stripFences("Вот курс:\n```text\n# Курс\n## Урок 1\n```\nУдачи!"), "# Курс\n## Урок 1\n");
  assert.equal(stripFences("学习 老师"), "学习 老师");
});

test("пример из инструкции для ИИ разбирается без замечаний", () => {
  const p = aiPrompt("course");
  const ex = p.slice(p.indexOf("Пример урока:") + 13, p.indexOf("Правила:")).trim();
  const s = parseExSet(ex, "x", (z) => [...z]);
  assert.equal(s.lessons.length, 1);
  assert.equal(s.lessons[0].dialogs[0].q.length, 1);
  assert.equal(checkCourseText(ex).length, 0);
});
