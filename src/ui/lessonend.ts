// Плашка пройденного урока: повторить ещё раз / начать заново / следующий урок.
import { app, deckBlocks, focusInfo, setFocus, resetLesson, wordStarted } from "../state.ts";
import { startSession, startPractice } from "./session.ts";
import { confirmInline } from "./sheet.ts";
import { esc } from "./dom.ts";

/** Все слова урока начаты (есть карточки) — новых слов в нём не осталось. */
export function lessonFinished(deckId: string, block: number): boolean {
  const d = app.deck;
  if (!d || d.id !== deckId) return false;
  const b = deckBlocks(d)[block];
  return !!b && b.idx.length > 0 && b.idx.every((i) => wordStarted(d.words[i]));
}

/** Рисует кнопки в `host` для урока `block` текущей колоды. `before` вызывается перед запуском занятия (закрыть панель). */
export function renderLessonActions(host: HTMLElement, block: number, before?: () => void) {
  const d = app.deck;
  const blocks = d ? deckBlocks(d) : [];
  const b = blocks[block];
  if (!d || !b) { host.hidden = true; return; }
  const next = blocks[block + 1];
  host.hidden = false;
  host.innerHTML = `<div class="lesson-end">
      <div class="le-head"><b>Слова урока «${esc(b.title)}» пройдены</b><small>Можно продолжить: расписание повторений от этого не собьётся.</small></div>
      <button class="btn primary wide" data-le="more">Продолжить обучение</button>
      ${next ? `<button class="btn wide" data-le="next">Следующий урок: ${esc(next.title)}</button>` : ""}
      <button class="btn wide" data-le="again">Начать урок заново</button>
      <div class="confirm" data-le-ask hidden></div>
    </div>`;
  const go = (fn: () => void) => { before?.(); setFocus(d.id, b.idx, block); fn(); };
  host.querySelector('[data-le="more"]')!.addEventListener("click", () => go(startPractice));
  host.querySelector('[data-le="next"]')?.addEventListener("click", () => { before?.(); setFocus(d.id, next!.idx, block + 1); startSession(); });
  host.querySelector('[data-le="again"]')!.addEventListener("click", () => {
    confirmInline(host.querySelector<HTMLElement>("[data-le-ask]")!, "Слова урока снова станут новыми. Журнал ответов останется.", "Начать заново", async () => {
      await resetLesson(d, b.idx);
      go(startSession);
    });
  });
}

export function initLessonEnd() {
  // экран «Готово» после занятия одним уроком
  document.addEventListener("cherta:done", () => {
    const host = document.getElementById("done-lesson");
    if (!host) return;
    const f = focusInfo();
    if (f && f.block >= 0 && lessonFinished(f.deckId, f.block)) renderLessonActions(host, f.block);
    else host.hidden = true;
  });
}
