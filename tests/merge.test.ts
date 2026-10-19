import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBackups } from "../src/core/merge.ts";

test("mergeBackups: карточки, журнал, колоды, курсы", () => {
  const a = { cards: [{ id: "zh:a", last: 10, reps: 2 }, { id: "zh:b", last: 50, reps: 1 }], reviews: [{ id: "zh:a", at: 10 }], edits: [{ id: "zh:a", updatedAt: 5, ru: "старое" }],
    userDecks: [{ id: "u1", words: [["人", "ren2", "человек"]] }], settings: { theme: "dark", added: ["hsk2-1"] }, ex: { x: { seen: 2, ok: 1, last: 3 } }, exsets: [{ id: "s1" }], course: { "b:hsk1": { 0: { words: 1, recog: 0.5 } } } };
  const b = { cards: [{ id: "zh:a", last: 20, reps: 3 }, { id: "zh:c", last: 1, reps: 1 }, { id: "zh:b", last: 40, reps: 9 }], reviews: [{ id: "zh:a", at: 10 }, { id: "zh:a", at: 20 }], edits: [{ id: "zh:a", updatedAt: 9, ru: "новое" }],
    userDecks: [{ id: "u1", words: [["人", "ren2", "человек"], ["大", "da4", "большой"]] }, { id: "u2", words: [] }], settings: { theme: "light", added: ["hsk3-1"] }, ex: { x: { seen: 5, ok: 0, last: 9 } }, exsets: [{ id: "s2" }], course: { "b:hsk1": { 0: { recog: 0.9 } } } };
  const m = mergeBackups(a, b);
  const card = (id: string) => m.cards.find((c: { id: string }) => c.id === id);
  assert.equal(card("zh:a").last, 20);
  assert.equal(card("zh:b").last, 50);
  assert.ok(card("zh:c"));
  assert.equal(m.reviews.length, 2);
  assert.equal(m.edits[0].ru, "новое");
  assert.equal(m.userDecks.find((d: { id: string }) => d.id === "u1").words.length, 2);
  assert.equal(m.userDecks.length, 2);
  assert.equal(m.settings.theme, "dark");
  assert.deepEqual(m.settings.added.sort(), ["hsk2-1", "hsk3-1"]);
  assert.deepEqual(m.ex.x, { seen: 5, ok: 1, last: 9 });
  assert.equal(m.exsets.length, 2);
  assert.deepEqual(m.course["b:hsk1"][0], { words: 1, recog: 0.9 });
});

test("удалённое на одном устройстве не возвращается с другого", () => {
  const ud = (id: string) => ({ id, title: id, words: [["甲", "jia3", "x"]], createdAt: 1 });
  const local = { cards: [], reviews: [], userDecks: [ud("u-a")], exsets: [], settings: { added: ["hsk3-1"], courses: ["hsk1"], listAt: { "deck:hsk3-2": -200, "ud:u-b": -300, "course:hsk2": -150, "ex:s-1": -100 } } };
  const remote = { cards: [], reviews: [], userDecks: [ud("u-a"), ud("u-b")], exsets: [{ id: "s-1", title: "x", text: "", addedAt: 1 }], settings: { added: ["hsk3-1", "hsk3-2", "hsk3-3"], courses: ["hsk1", "hsk2"], listAt: { "deck:hsk3-2": 100, "deck:hsk3-3": 120, "ex:s-1": 50 } } };
  const m = mergeBackups(local, remote);
  assert.deepEqual(m.settings.added.sort(), ["hsk3-1", "hsk3-3"]);
  assert.deepEqual(m.settings.courses, ["hsk1"]);
  assert.deepEqual(m.userDecks.map((d: { id: string }) => d.id), ["u-a"]);
  assert.equal(m.exsets.length, 0);
  assert.equal(m.settings.listAt["deck:hsk3-2"], -200);
  // добавили снова позже удаления — колода есть
  const again = mergeBackups({ ...local, settings: { ...local.settings, added: ["hsk3-1", "hsk3-2"], listAt: { "deck:hsk3-2": 500 } } }, remote);
  assert.ok(again.settings.added.includes("hsk3-2"));
});
