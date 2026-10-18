import { test } from "node:test";
import assert from "node:assert/strict";
import { cardId, splitCardId, normSkills, pickNext, queueCounts, type QOpts } from "../src/core/skills.ts";
import { newCard, type Card } from "../src/core/fsrs.ts";

const NOW = 1_000_000_000_000;
const MIN = 60_000;
const mk = (id: string, state: Card["state"], due: number, lapses = 0): Card => ({ ...newCard(id, NOW), state, due, lapses, stability: 1, difficulty: 5, last: NOW - 1 });
const opts = (o: Partial<QOpts> = {}): QOpts => ({ now: NOW, skills: ["write", "tone"], newWordsLeft: 5, learnAhead: 20 * MIN, ...o });

test("id карточек: написание — прежний id слова", () => {
  assert.equal(cardId("zh:学", "write"), "zh:学");
  assert.equal(cardId("zh:学", "tone"), "zh:学#tone");
  assert.deepEqual(splitCardId("zh:学#def"), { wordId: "zh:学", skill: "def" });
  assert.deepEqual(splitCardId("zh:学"), { wordId: "zh:学", skill: "write" });
  assert.deepEqual(normSkills(["def", "write", "x"]), ["write", "def"]);
  assert.deepEqual(normSkills([]), ["write"]);
  assert.deepEqual(normSkills(undefined), ["write", "read", "tone", "def"]);
});

test("порядок: шаг заучивания → повторение → новое слово → новый навык", () => {
  const words = [{ id: "zh:甲" }, { id: "zh:乙" }, { id: "zh:丙" }];
  const cards = new Map<string, Card>();
  const get = (id: string) => cards.get(id);
  // всё новое: первое слово, первый навык
  assert.deepEqual(pickNext(words, get, opts()), { word: 0, skill: "write", fresh: "word" });
  //甲 начато (write в повторении, срок не наступил) — следующее новое слово 乙, а не навык 甲
  cards.set("zh:甲", mk("zh:甲", "review", NOW + 86_400_000));
  assert.deepEqual(pickNext(words, get, opts()), { word: 1, skill: "write", fresh: "word" });
  // лимит новых слов исчерпан — новый навык начатого слова
  assert.deepEqual(pickNext(words, get, opts({ newWordsLeft: 0 })), { word: 0, skill: "tone", fresh: "skill" });
  // повторение по сроку важнее нового
  cards.set("zh:乙#tone", mk("zh:乙#tone", "review", NOW - 5));
  cards.set("zh:乙", mk("zh:乙", "review", NOW + 9e9));
  assert.deepEqual(pickNext(words, get, opts()), { word: 1, skill: "tone", fresh: null });
  // шаг заучивания важнее повторения, но не та же карточка подряд
  cards.set("zh:丙", mk("zh:丙", "learning", NOW - 1));
  assert.deepEqual(pickNext(words, get, opts()), { word: 2, skill: "write", fresh: null });
  assert.deepEqual(pickNext(words, get, opts({ exclude: "zh:丙" })), { word: 1, skill: "tone", fresh: null });
});

test("скрытые слова и шаги заранее", () => {
  const words = [{ id: "zh:甲", hidden: true }, { id: "zh:乙" }];
  const cards = new Map<string, Card>([["zh:乙", mk("zh:乙", "learning", NOW + 5 * MIN)], ["zh:乙#tone", mk("zh:乙#tone", "review", NOW + 9e9)]]);
  const p = pickNext(words, (id) => cards.get(id), opts({ newWordsLeft: 0 }));
  assert.deepEqual(p, { word: 1, skill: "write", fresh: null }); // шаг через 5 минут — показываем заранее
  // если это та же карточка, что только что была, — всё равно показываем (больше нечего)
  assert.deepEqual(pickNext(words, (id) => cards.get(id), opts({ newWordsLeft: 0, exclude: "zh:乙" })), { word: 1, skill: "write", fresh: null });
});

test("счётчики", () => {
  const words = [{ id: "zh:甲" }, { id: "zh:乙" }, { id: "zh:丙" }, { id: "zh:丁" }];
  const cards = new Map<string, Card>([
    ["zh:甲", mk("zh:甲", "review", NOW - 1)],            // к повторению, tone ещё не начат
    ["zh:乙", mk("zh:乙", "learning", NOW + MIN)],         // учу
    ["zh:乙#tone", mk("zh:乙#tone", "review", NOW + 9e9)], // в повторении, не сейчас
  ]);
  const c = queueCounts(words, (id) => cards.get(id), opts({ newWordsLeft: 1 }));
  assert.equal(c.due, 1);
  assert.equal(c.learning, 1);
  assert.equal(c.review, 2);
  assert.equal(c.unseen, 2);
  assert.equal(c.newLeft, 1 + 1); // одно новое слово по лимиту + новый навык 甲
});
