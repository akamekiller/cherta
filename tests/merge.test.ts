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
