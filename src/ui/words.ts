/** Список слов колоды, поиск и карточка слова с порядком черт. */
import { cardOf, words, isHidden } from "../state.ts";
import { openWordEditor } from "./editor.ts";
import { showNote } from "./session.ts";
import type { Word } from "../core/deck.ts";
import { formatGap, DAY } from "../core/fsrs.ts";
import { plain, searchKey } from "../core/pinyin.ts";
import { say } from "../speech.ts";
import { $, esc, pinyinHTML } from "./dom.ts";
import { createWriter, type Writer } from "./writer.ts";
import { onShow, onLeave, show } from "./nav.ts";

let detailWord: Word | null = null;
let detailWriter: Writer | null = null;
export const wordsWriter = () => detailWriter;

function status(w: Word): [string, string] {
  if (isHidden(w)) return ["скрыто", "hid"];
  const c = cardOf(w);
  if (!c) return ["новое", ""];
  if (c.state !== "review") return ["учу", "learn"];
  return [formatGap(Math.max(DAY, c.due - c.last)), "rev"];
}

function renderList() {
  const q = $<HTMLInputElement>("w-search").value.trim();
  const qk = searchKey(q), ql = q.toLowerCase();
  const list = words().filter((w) => !q || w.han.includes(q) || (qk && plain(w.ref).includes(qk)) || w.ru.toLowerCase().includes(ql));
  $("w-count").textContent = q ? `Найдено: ${list.length}` : `Всего: ${list.length}`;
  $("w-list").innerHTML = list.length
    ? list.map((w) => {
      const [st, cls] = status(w);
      return `<button class="item" data-id="${esc(w.id)}"><span class="h">${esc(w.han)}</span><span class="txt"><span class="py">${pinyinHTML(w.ref)}</span><span class="ru">${esc(w.ru)}</span></span><span class="status ${cls}">${st}</span></button>`;
    }).join("")
    : `<p class="empty">Ничего не нашлось. Ищите по иероглифу, пиньиню без тонов или по-русски.</p>`;
}

function openDetail(id: string) {
  const w = words().find((x) => x.id === id);
  if (!w) return;
  detailWord = w;
  show("detail");
  $("d-han").textContent = w.han;
  $("d-py").innerHTML = pinyinHTML(w.ref);
  $("d-ru").textContent = w.ru;
  showNote($("d-note"), w.id);
  const chars = [...w.han];
  $("d-chars").innerHTML = chars.length > 1
    ? chars.map((c, i) => `<button data-c="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`).join("") : "";
  const c = cardOf(w);
  $("d-state").textContent = isHidden(w) ? "Слово скрыто из занятий." : !c ? "Слово ещё не изучалось."
    : c.state !== "review" ? "Слово на этапе заучивания."
    : `Следующее повторение через ${formatGap(Math.max(0, c.due - Date.now()))}.`;
  showChar(chars[0]);
}

function showChar(ch: string) {
  try { detailWriter?.cancelQuiz(); } catch { /* */ }
  detailWriter = createWriter($("d-hw"), ch, { showCharacter: true, showOutline: true });
}

export function initWords() {
  onShow("words", renderList);
  onLeave("detail", () => { try { detailWriter?.cancelQuiz(); } catch { /* */ } });
  $("w-search").addEventListener("input", renderList);
  $("w-list").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".item");
    if (b?.dataset.id) openDetail(b.dataset.id);
  });
  $("d-chars").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b?.dataset.c) return;
    $("d-chars").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    showChar(b.dataset.c);
  });
  $("d-anim").addEventListener("click", () => {
    if (!detailWriter) return;
    try { detailWriter.cancelQuiz(); } catch { /* */ }
    detailWriter.showOutline();
    detailWriter.animateCharacter();
  });
  $("d-try").addEventListener("click", () => {
    if (!detailWriter) return;
    detailWriter.hideCharacter();
    detailWriter.showOutline();
    detailWriter.quiz();
  });
  $("d-say").addEventListener("click", () => detailWord && say(detailWord.han));
  $("d-back").addEventListener("click", () => show("words"));
  $("d-edit").addEventListener("click", () => {
    if (!detailWord) return;
    openWordEditor(detailWord, () => detailWord && openDetail(detailWord.id));
  });
}
