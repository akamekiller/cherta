/** Выбор колоды-источника для тетради прописей, тонов и упражнений: панель снизу со списком колод по группам. */
import { app, deckById, saveUserDeck } from "../state.ts";
import type { Deck } from "../core/deck.ts";
import { $, esc, plural } from "./dom.ts";
import { openSheet, closeSheet } from "./sheet.ts";

export type Extra = { id: string; title: string; sub?: string };

/** Колода «Мои прописи» — сюда попадают слова по кнопке «+ В тетрадь». */
export const BOOK_DECK = "u-book";

export function deckTitle(id: string): string {
  return app.decks.find((d) => d.id === id)?.title ?? "Колода";
}

/** Открыть выбор. extras — дополнительные пункты сверху (например, «Свой текст»). */
export function pickDeck(title: string, current: string, onPick: (id: string) => void, extras: Extra[] = []) {
  const decks = app.decks.filter((d) => !d.hidden || d.id === current);
  const groups = new Map<string, typeof decks>();
  for (const d of decks) {
    const g = d.user ? "Свои колоды" : d.group ?? "Колоды";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(d);
  }
  const row = (id: string, name: string, sub: string) =>
    `<button class="deck-opt" data-pick="${esc(id)}" aria-current="${id === current}"><span>${esc(name)}<small>${esc(sub)}</small></span>${id === current ? `<span class="pick-btn on">✓</span>` : ""}</button>`;
  const body = (extras.length ? `<div class="deck-list">${extras.map((x) => row(x.id, x.title, x.sub ?? "")).join("")}</div>` : "")
    + [...groups].map(([g, list]) => `<h3 class="grp-title"><span>${esc(g)}</span></h3><div class="deck-list">${list.map((d) => row(d.id, d.title, `${d.count} ${plural(d.count, "слово", "слова", "слов")}`)).join("")}</div>`).join("");
  openSheet(title, `<div class="pick-decks">${body}</div>`, (root) => {
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pick]");
      if (!b) return;
      closeSheet();
      onPick(b.dataset.pick!);
    });
  });
}

/** Слова колоды по id; если колоды нет (удалили) — null. */
export async function deckWords(id: string): Promise<Deck | null> {
  if (!app.decks.some((d) => d.id === id)) return null;
  try { return await deckById(id); } catch { return null; }
}

/** Добавить слово в «Мои прописи» (колода создаётся при первом добавлении). Возвращает true, если слово добавлено, false — если убрано. */
export async function toggleBookWord(row: [string, string, string]): Promise<boolean> {
  const d = app.userDecks.find((x) => x.id === BOOK_DECK);
  const words = d?.words ?? [];
  const has = words.some((w) => w[0] === row[0]);
  await saveUserDeck({ id: BOOK_DECK, title: d?.title ?? "Мои прописи", words: has ? words.filter((w) => w[0] !== row[0]) : [...words, row], createdAt: d?.createdAt ?? Date.now() });
  return !has;
}

export const inBook = (han: string) => !!app.userDecks.find((x) => x.id === BOOK_DECK)?.words.some((w) => w[0] === han);

/** Кнопка выбора источника: «HSK 1 ▾». */
export function setPickLabel(id: string, text: string) {
  $(id).innerHTML = `<span>${esc(text)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
}
