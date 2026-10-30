/** Выбор колоды-источника для тетради прописей, тонов и упражнений: панель снизу со списком колод по группам. */
import { setOpen } from "./motion.ts";
import { app, deckById, saveUserDeck, deleteDeck } from "../state.ts";
import type { Deck } from "../core/deck.ts";
import { $, esc, plural } from "./dom.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import { openDeckEditor } from "./editor.ts";

export type Extra = { id: string; title: string; sub?: string };

/** Колода «Мои прописи» — сюда попадают слова по кнопке «+ В тетрадь». */
export const BOOK_DECK = "u-book";

export function deckTitle(id: string): string {
  return app.decks.find((d) => d.id === id)?.title ?? "Колода";
}

const FOLD = "cherta.pickfold";
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
function folds(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(FOLD) ?? "{}"); } catch { return {}; } }
function setFold(g: string, open: boolean) { const f = folds(); f[g] = open; try { localStorage.setItem(FOLD, JSON.stringify(f)); } catch { /* */ } }

/**
 * Открыть выбор. extras — дополнительные пункты сверху (например, «Свой текст»).
 * Колоды — по группам, группы сворачиваются (открыта группа с выбранной колодой); у каждой колоды — «состав»:
 * посмотреть слова и иероглифы, изменить (своя колода) или убрать из списка.
 */
export function pickDeck(title: string, current: string, onPick: (id: string) => void, extras: Extra[] = []) {
  const decks = app.decks.filter((d) => !d.hidden || d.id === current);
  const groups = new Map<string, typeof decks>();
  for (const d of decks) {
    const g = d.group || (d.user ? "Свои колоды" : "Колоды");
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(d);
  }
  const few = groups.size <= 2;
  const row = (id: string, name: string, sub: string, eye: boolean) =>
    `<div class="pick-row" aria-current="${id === current}"><button class="deck-opt" data-pick="${esc(id)}"><span>${esc(name)}<small>${esc(sub)}</small></span>${id === current ? `<span class="pick-btn on">✓</span>` : ""}</button>${eye ? `<button class="pick-eye" data-peek="${esc(id)}" aria-label="Состав колоды «${esc(name)}»">${EYE}</button>` : ""}</div>`;
  const body = (extras.length ? `<div class="deck-list">${extras.map((x) => row(x.id, x.title, x.sub ?? "", false)).join("")}</div>` : "")
    + [...groups].map(([g, list]) => {
      const open = folds()[g] ?? (few || list.some((d) => d.id === current));
      return `<button class="fold-head" data-pfold="${esc(g)}" aria-expanded="${open}"><span>${esc(g)}</span><small>${list.length}</small>${CHEV}</button>`
        + `<div class="deck-list" ${open ? "" : "hidden"}>${list.map((d) => row(d.id, d.title, `${d.count} ${plural(d.count, "слово", "слова", "слов")}`, true)).join("")}</div>`;
    }).join("")
    + (decks.length ? "" : `<p class="hint">Колод пока нет — добавьте готовые на экране «Карточки».</p>`);
  const again = () => pickDeck(title, current, onPick, extras);
  openSheet(title, `<div class="pick-decks">${body}</div>`, (root) => {
    root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLButtonElement>("[data-pfold]");
      if (f) {
        const open = f.getAttribute("aria-expanded") !== "true";
        f.setAttribute("aria-expanded", String(open));
        setOpen(f.nextElementSibling as HTMLElement, open);
        setFold(f.dataset.pfold!, open);
        return;
      }
      const eye = t.closest<HTMLButtonElement>("[data-peek]");
      if (eye) { peekDeck(eye.dataset.peek!, () => { closeSheet(); onPick(eye.dataset.peek!); }, again); return; }
      const b = t.closest<HTMLButtonElement>("[data-pick]");
      if (!b) return;
      closeSheet();
      onPick(b.dataset.pick!);
    });
  });
}

/** Состав колоды: иероглифы и слова; «Выбрать», «Изменить слова» (своя колода), «Убрать/удалить». back — вернуться к списку. */
export async function peekDeck(id: string, choose: () => void, back: () => void) {
  const info = app.decks.find((d) => d.id === id);
  const deck = await deckWords(id);
  if (!info || !deck) { back(); return; }
  const chars = [...new Set(deck.words.flatMap((w) => [...w.han].filter((c) => /\p{Script=Han}/u.test(c))))];
  const MAX = 300;
  openSheet(info.title, `<div class="stack">
      <p class="hint">${deck.words.length} ${plural(deck.words.length, "слово", "слова", "слов")} · ${chars.length} ${plural(chars.length, "иероглиф", "иероглифа", "иероглифов")}</p>
      <div class="peek-chars">${chars.slice(0, MAX).map((c) => `<span>${esc(c)}</span>`).join("")}${chars.length > MAX ? `<small>и ещё ${chars.length - MAX}</small>` : ""}</div>
      <details class="peek-words"><summary>Слова</summary><div>${deck.words.slice(0, MAX).map((w) => `<div class="pw"><b>${esc(w.han)}</b><span>${esc(w.ru)}</span></div>`).join("")}</div></details>
      <div class="row wrap"><button class="btn" id="pk-back">← К списку</button>${info.user ? `<button class="btn" id="pk-edit">Изменить слова</button>` : ""}<button class="btn danger" id="pk-del">${info.user ? "Удалить" : "Убрать из списка"}</button></div>
      <div class="confirm" id="pk-confirm" hidden></div>
      <button class="btn primary wide" id="pk-choose">Выбрать</button>
    </div>`, (root) => {
    const q = (s: string) => root.querySelector<HTMLElement>(s)!;
    q("#pk-back").addEventListener("click", back);
    q("#pk-choose").addEventListener("click", choose);
    root.querySelector("#pk-edit")?.addEventListener("click", () => {
      const ud = app.userDecks.find((d) => d.id === id);
      if (ud) openDeckEditor(ud, () => back());
    });
    q("#pk-del").addEventListener("click", () => confirmInline(q("#pk-confirm"),
      info.user ? `Удалить «${info.title}»? Прогресс по словам сохранится.` : `Убрать «${info.title}» из списка?`, info.user ? "Удалить" : "Убрать",
      async () => { await deleteDeck(id); back(); }));
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
