/** Список слов колоды, поиск и карточка слова с порядком черт. */
import { cardOf, words, isHidden, hskEntries } from "../state.ts";
import { searchEntries, type DictEntry } from "../core/edits.ts";
import { loadDeck } from "../core/deck.ts";
import { openWordEditor, openAddToDeck } from "./editor.ts";
import { showNote } from "./session.ts";
import type { Word } from "../core/deck.ts";
import { formatGap, DAY } from "../core/fsrs.ts";
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

let hsk: DictEntry[] = [];
let others: Word[] = []; // найденные слова из других колод — для открытия карточки

const itemHTML = (w: Word, st: string, cls: string) =>
  `<button class="item" data-id="${esc(w.id)}"><span class="h">${esc(w.han)}</span><span class="txt"><span class="py">${pinyinHTML(w.ref)}</span><span class="ru">${esc(w.ru)}</span></span><span class="status ${cls}">${st}</span></button>`;

function renderList() {
  const q = $<HTMLInputElement>("w-search").value.trim();
  const list = q ? searchEntries(words().map((w) => ({ han: w.han, py: w.py, ru: w.ru })), q, 500).map((e) => words().find((w) => w.han === e.han)!) : words();
  const inDeck = new Set(words().map((w) => w.han));
  others = q ? searchEntries(hsk.filter((e) => !inDeck.has(e.han)), q, 30).map((e) => {
    const w = loadDeck({ id: "x", title: "", lang: "zh", words: [[e.han, e.py, e.ru]] }).words[0];
    (w as Word & { level?: string }).level = e.level;
    return w;
  }) : [];
  $("w-count").textContent = q ? `В этой колоде: ${list.length}` : `Всего: ${list.length}`;
  $("w-list").innerHTML = (list.length
    ? list.map((w) => { const [st, cls] = status(w); return itemHTML(w, st, cls); }).join("")
    : `<p class="empty">${q ? "В этой колоде не нашлось." : "В колоде нет слов."}</p>`)
    + (others.length ? `<div class="list-sep">В других колодах</div>` + others.map((w) => itemHTML(w, (w as Word & { level?: string }).level ?? "", "other")).join("") : "")
    + (q && !list.length && !others.length ? `<p class="empty">Ищите по иероглифу, пиньиню без тонов или по-русски.</p>` : "");
}

function openDetail(id: string) {
  const w = words().find((x) => x.id === id) ?? others.find((x) => x.id === id);
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
  onShow("words", () => {
    renderList();
    if (!hsk.length) hskEntries().then((e) => { hsk = e; if ($<HTMLInputElement>("w-search").value.trim()) renderList(); });
  });
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
  $("d-todeck").addEventListener("click", () => detailWord && openAddToDeck(detailWord));
  $("d-edit").addEventListener("click", () => {
    if (!detailWord) return;
    openWordEditor(detailWord, () => detailWord && openDetail(detailWord.id));
  });
}
