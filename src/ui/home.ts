import { app, counts, nextDueTime, words, switchDeck } from "../state.ts";
import { countChars } from "../core/deck.ts";
import { formatGap } from "../core/fsrs.ts";
import { $, esc, plural } from "./dom.ts";
import { onShow } from "./nav.ts";
import { startSession } from "./session.ts";

export function renderHome() {
  const d = app.deck;
  if (!d) return;
  $("deck-title").textContent = d.title;
  const n = d.words.length, ch = countChars(d);
  $("deck-sub").textContent = `${n} ${plural(n, "слово", "слова", "слов")} · ${ch} ${plural(ch, "иероглиф", "иероглифа", "иероглифов")}`;
  const c = counts();
  $("st-due").textContent = String(c.due + c.learning);
  $("st-new").textContent = String(c.newLeft);
  $("st-known").textContent = String(c.review);
  const start = $<HTMLButtonElement>("start");
  start.disabled = c.total === 0;
  start.textContent = c.total ? "Начать занятие" : "Карточек на сейчас нет";
  let hint = "";
  if (!c.total) {
    const t = nextDueTime();
    hint = t ? `Следующая карточка через ${formatGap(t - Date.now())}. Лимит новых слов можно поднять в настройках.`
      : c.unseen ? "Новые слова на сегодня закончились. Лимит можно поднять в настройках." : "Все слова колоды уже в повторении.";
  } else if (c.unseen === words().length) {
    hint = `Первое занятие: ${c.newLeft} ${plural(c.newLeft, "новое слово", "новых слова", "новых слов")}, около 10 минут.`;
  }
  $("next-hint").textContent = hint;
  closeDecks();
}

function renderDecks() {
  $("deck-list").innerHTML = app.decks.map((d) =>
    `<button class="deck-opt" data-id="${esc(d.id)}" aria-current="${d.id === app.deck?.id}"><span>${esc(d.title)}<small>${esc(d.subtitle)}</small></span><span class="n">${d.count} ${plural(d.count, "слово", "слова", "слов")}</span></button>`,
  ).join("");
}
function closeDecks() {
  $("deck-list").hidden = true;
  $("deck-btn").setAttribute("aria-expanded", "false");
}

export function initHome() {
  onShow("home", renderHome);
  $("start").addEventListener("click", startSession);
  $("deck-btn").addEventListener("click", () => {
    const open = $("deck-list").hidden;
    if (open) renderDecks();
    $("deck-list").hidden = !open;
    $("deck-btn").setAttribute("aria-expanded", String(open));
  });
  $("deck-list").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-opt");
    if (!b?.dataset.id) return;
    if (b.dataset.id !== app.deck?.id) await switchDeck(b.dataset.id);
    renderHome();
  });
}
