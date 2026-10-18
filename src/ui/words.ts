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

type Filter = "all" | "new" | "learn" | "review" | "hidden";
type Sort = "deck" | "pinyin" | "due" | "hard";
type ViewMode = "list" | "grid";
const LS = "cherta.words";
const ui: { filter: Filter; sort: Sort; view: ViewMode } = { filter: "all", sort: "deck", view: "list" };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* приватный режим */ }
const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

function kind(w: Word): Exclude<Filter, "all"> {
  if (isHidden(w)) return "hidden";
  const c = cardOf(w);
  if (!c) return "new";
  return c.state === "review" ? "review" : "learn";
}

function status(w: Word): [string, string] {
  const k = kind(w);
  if (k === "hidden") return ["скрыто", "hid"];
  if (k === "new") return ["новое", ""];
  if (k === "learn") return ["учу", "learn"];
  const c = cardOf(w)!;
  return [formatGap(Math.max(DAY, c.due - c.last)), "rev"];
}

let hsk: DictEntry[] = [];
type OtherWord = Word & { level: string };
let others: OtherWord[] = []; // найденные слова из других колод — для открытия карточки

const itemHTML = (w: Word, st: string, cls: string) => ui.view === "grid"
  ? `<button class="tile ${cls}" data-id="${esc(w.id)}" title="${esc(w.ru)}"><span class="h">${esc(w.han)}</span><span class="py">${pinyinHTML(w.ref)}</span><span class="ru">${esc(w.ru)}</span></button>`
  : `<button class="item" data-id="${esc(w.id)}"><span class="h">${esc(w.han)}</span><span class="txt"><span class="py">${pinyinHTML(w.ref)}</span><span class="ru">${esc(w.ru)}</span></span><span class="status ${cls}">${st}</span></button>`;

type Group = { title: string; items: Word[] };
type PendingGroup = Group & { started: boolean };

function groupWords(list: Word[]): Group[] {
  const now = Date.now();
  if (ui.sort === "pinyin") {
    const sorted = [...list].sort((a, b) => a.py.localeCompare(b.py) || a.han.localeCompare(b.han));
    const map = new Map<string, Word[]>();
    for (const w of sorted) { const k = w.py[0].toUpperCase(); (map.get(k) ?? map.set(k, []).get(k)!).push(w); }
    return [...map].map(([title, items]) => ({ title, items }));
  }
  if (ui.sort === "due") {
    const buckets: Record<string, Word[]> = { "Пора повторить": [], "Сегодня позже": [], "Завтра": [], "На этой неделе": [], "Позже": [], "Не начаты": [] };
    const endToday = new Date(now - 4 * 3_600_000); endToday.setHours(28, 0, 0, 0);
    for (const w of list) {
      const c = cardOf(w);
      if (!c) { buckets["Не начаты"].push(w); continue; }
      const k = c.due <= now ? "Пора повторить" : c.due < endToday.getTime() ? "Сегодня позже"
        : c.due < endToday.getTime() + DAY ? "Завтра" : c.due < endToday.getTime() + 7 * DAY ? "На этой неделе" : "Позже";
      buckets[k].push(w);
    }
    for (const k in buckets) buckets[k].sort((a, b) => (cardOf(a)?.due ?? 0) - (cardOf(b)?.due ?? 0));
    return Object.entries(buckets).filter(([, v]) => v.length).map(([title, items]) => ({ title, items }));
  }
  if (ui.sort === "hard") {
    const started = list.filter((w) => cardOf(w));
    const hard = started.filter((w) => (cardOf(w)!.lapses ?? 0) > 0 || (cardOf(w)!.difficulty ?? 0) >= 7)
      .sort((a, b) => (cardOf(b)!.lapses - cardOf(a)!.lapses) || (cardOf(b)!.difficulty - cardOf(a)!.difficulty));
    const rest = started.filter((w) => !hard.includes(w));
    return [{ title: "Трудные: забывал или с ошибками", items: hard }, { title: "Остальные начатые", items: rest }].filter((g) => g.items.length);
  }
  const groups: Group[] = [];
  for (let i = 0; i < list.length; i += 50) groups.push({ title: `Слова ${i + 1}–${Math.min(i + 50, list.length)}`, items: list.slice(i, i + 50) });
  return groups;
}

/* Постепенная отрисовка: длинный список дорисовывается по мере прокрутки. */
let pending: PendingGroup[] = [];
let observer: IntersectionObserver | null = null;
const CHUNK = 100;

function drawMore() {
  const box = $("w-groups");
  let budget = CHUNK;
  let html = "";
  while (pending.length && budget > 0) {
    const g = pending[0];
    if (!g.items.length) { pending.shift(); continue; }
    if (!g.started) {
      html += `<h3 class="grp-title"><span>${esc(g.title)}</span><span class="grp-n">${g.items.length}</span></h3>`;
      g.started = true;
    }
    html += `<div class="grp ${ui.view}">`;
    const part = g.items.splice(0, budget);
    budget -= part.length;
    html += part.map((w) => { const [st, cls] = status(w); return itemHTML(w, st, cls); }).join("") + `</div>`;
    if (!g.items.length) pending.shift();
  }
  box.insertAdjacentHTML("beforeend", html);
  $("w-more").hidden = !pending.length;
}

function renderControls(all: Word[]) {
  const n: Record<Filter, number> = { all: all.length, new: 0, learn: 0, review: 0, hidden: 0 };
  for (const w of all) n[kind(w)]++;
  const names: [Filter, string][] = [["all", "Все"], ["new", "Новые"], ["learn", "Учу"], ["review", "Повторяю"], ["hidden", "Скрыто"]];
  $("w-filters").innerHTML = names.filter(([f]) => f === "all" || n[f] || f === ui.filter)
    .map(([f, t]) => `<button class="chip-btn" data-filter="${f}" aria-pressed="${ui.filter === f}">${t}<b>${n[f]}</b></button>`).join("");
  $<HTMLSelectElement>("w-sort").value = ui.sort;
  document.querySelectorAll<HTMLButtonElement>("[data-view-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewMode === ui.view)));
}

function renderList() {
  const q = $<HTMLInputElement>("w-search").value.trim();
  $("w-controls").hidden = !!q;
  $("w-groups").innerHTML = "";
  if (q) {
    const byHan = new Map(words().map((w) => [w.han, w]));
    const list = searchEntries(words().map((w) => ({ han: w.han, py: w.py, ru: w.ru })), q, 500).map((e) => byHan.get(e.han)!);
    others = searchEntries(hsk.filter((e) => !byHan.has(e.han)), q, 30).map((e) => ({
      ...loadDeck({ id: "x", title: "", lang: "zh", words: [[e.han, e.py, e.ru]] }).words[0], level: e.level ?? "",
    }));
    pending = [];
    $("w-groups").innerHTML = `<h3 class="grp-title"><span>В этой колоде</span><span class="grp-n">${list.length}</span></h3>`
      + (list.length ? `<div class="grp ${ui.view}">${list.map((w) => { const [st, cls] = status(w); return itemHTML(w, st, cls); }).join("")}</div>` : `<p class="empty">Не нашлось.</p>`)
      + (others.length ? `<h3 class="grp-title"><span>В других колодах</span><span class="grp-n">${others.length}</span></h3><div class="grp ${ui.view}">${others.map((w) => itemHTML(w, w.level, "other")).join("")}</div>` : "")
      + (!list.length && !others.length ? `<p class="empty">Ищите по иероглифу, пиньиню без тонов или по-русски.</p>` : "");
    $("w-more").hidden = true;
    return;
  }
  const all = words();
  renderControls(all);
  const list = ui.filter === "all" ? all : all.filter((w) => kind(w) === ui.filter);
  pending = groupWords(list).map((g) => ({ ...g, items: [...g.items], started: false }));
  if (!list.length) $("w-groups").innerHTML = `<p class="empty">${ui.filter === "all" ? "В колоде нет слов." : "Таких слов пока нет."}</p>`;
  drawMore();
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
  $("w-filters").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-filter]");
    if (!b) return;
    ui.filter = b.dataset.filter as Filter; saveUi(); renderList();
  });
  $("w-sort").addEventListener("change", (e) => { ui.sort = (e.target as HTMLSelectElement).value as Sort; saveUi(); renderList(); });
  document.querySelectorAll<HTMLButtonElement>("[data-view-mode]").forEach((b) => b.addEventListener("click", () => {
    ui.view = b.dataset.viewMode as ViewMode; saveUi(); renderList();
  }));
  $("w-more").addEventListener("click", drawMore);
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting) && pending.length) drawMore(); }, { rootMargin: "600px" });
    observer.observe($("w-more"));
  }
  $("w-groups").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".item,.tile");
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
