import { app, counts, nextDueTime, words } from "../state.ts";
import { countChars } from "../core/deck.ts";
import { formatGap } from "../core/fsrs.ts";
import { $, plural } from "./dom.ts";
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
      : c.unseen ? "Новые слова на сегодня закончились. Лимит можно поднять в настройках." : "";
  } else if (c.unseen === words().length) {
    hint = `Первое занятие: ${c.newLeft} ${plural(c.newLeft, "новое слово", "новых слова", "новых слов")}, около 10 минут.`;
  }
  $("next-hint").textContent = hint;
}

export function initHome() {
  onShow("home", renderHome);
  $("start").addEventListener("click", startSession);
}
