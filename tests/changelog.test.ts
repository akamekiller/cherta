import { test } from "node:test";
import assert from "node:assert/strict";
import { unseen, type Change } from "../src/core/changelog.ts";

const L: Change[] = [
  { id: "3", date: "", title: "c", items: [] },
  { id: "2", date: "", title: "b", items: [] },
  { id: "1", date: "", title: "a", items: [] },
];
test("первый запуск — ничего не показываем", () => assert.deepEqual(unseen(null, L), []));
test("видел последнюю — пусто", () => assert.deepEqual(unseen("3", L), []));
test("видел старую — все новее", () => assert.deepEqual(unseen("1", L).map((c) => c.id), ["3", "2"]));
test("неизвестный id — только самая новая", () => assert.deepEqual(unseen("zzz", L).map((c) => c.id), ["3"]));
