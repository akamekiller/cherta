/** «Слова»: список колоды с фильтрами и поиск — колода → другие колоды HSK → словарь 大БКРС. */
import { words, isLeech, LEECH } from "../state.ts";
import { searchDict } from "../core/dict.ts";
import { searchEntries } from "../core/edits.ts";
import type { Word } from "../core/deck.ts";
import { DAY } from "../core/fsrs.ts";
import { cardOf } from "../state.ts";
import { $, esc } from "./dom.ts";
import { onShow } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { initHandwrite } from "./handwrite.ts";
import { initVoice } from "./voice.ts";
import { kind, status, itemHTML, otherWord, fromHit, hskList, loadHskList, dictNow, loadDict, type ViewMode } from "./lookup.ts";

type Filter = "all" | "new" | "learn" | "review" | "hidden" | "leech";
type Sort = "deck" | "pinyin" | "due" | "hard";
const LS = "cherta.words";
const ui: { filter: Filter; sort: Sort; view: ViewMode } = { filter: "all", sort: "deck", view: "list" };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* приватный режим */ }
const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

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
    html += part.map((w) => { const [st, cls] = status(w); return itemHTML(w, st, cls, ui.view); }).join("") + `</div>`;
    if (!g.items.length) pending.shift();
  }
  box.insertAdjacentHTML("beforeend", html);
  $("w-more").hidden = !pending.length;
}

function renderControls(all: Word[]) {
  const n: Record<Filter, number> = { all: all.length, new: 0, learn: 0, review: 0, hidden: 0, leech: 0 };
  for (const w of all) { n[kind(w)]++; if (isLeech(w)) n.leech++; }
  const names: [Filter, string][] = [["all", "Все"], ["new", "Новые"], ["learn", "Учу"], ["review", "Повторяю"], ["leech", "Пиявки"], ["hidden", "Скрыто"]];
  $("w-filters").innerHTML = names.filter(([f]) => f === "all" || n[f] || f === ui.filter)
    .map(([f, t]) => `<button class="chip-btn" data-filter="${f}" aria-pressed="${ui.filter === f}">${t}<b>${n[f]}</b></button>`).join("");
  $<HTMLSelectElement>("w-sort").value = ui.sort;
  document.querySelectorAll<HTMLButtonElement>("[data-view-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewMode === ui.view)));
}

/* ---------- поиск ---------- */

/** Сколько показывать в разделе, пока его не раскрыли. */
const SHOW = { deck: 5, hsk: 5, dict: 12 };
const DICT_MAX = 300;
let expanded = new Set<string>();
let lastQuery = "";
let dictTimer = 0;

const searchInput = () => $<HTMLInputElement>("w-search");

function section(id: string, title: string, items: [Word, string, string][], total: number, empty?: string): string {
  if (!items.length && !empty) return "";
  const open = expanded.has(id);
  const limit = open ? items.length : SHOW[id as keyof typeof SHOW];
  const shown = items.slice(0, limit);
  const n = total > items.length ? `${items.length}+` : String(items.length);
  return `<section class="res" data-sec="${id}"><h3 class="grp-title"><span>${esc(title)}</span><span class="grp-n">${items.length ? n : ""}</span></h3>`
    + (shown.length ? `<div class="grp ${ui.view}">${shown.map(([w, st, cls]) => itemHTML(w, st, cls, ui.view)).join("")}</div>` : `<p class="empty">${empty}</p>`)
    + (items.length > shown.length ? `<button class="btn small ghost more-btn" data-expand="${id}">Показать все ${n}</button>` : "")
    + `</section>`;
}

function renderSearch(q: string) {
  if (q !== lastQuery) { expanded = new Set(); lastQuery = q; }
  const deck = words();
  const byHan = new Map(deck.map((w) => [w.han, w]));
  const inDeck = searchEntries(deck.map((w) => ({ han: w.han, py: w.py, ru: w.ru })), q, 500)
    .map((e) => byHan.get(e.han)!).map((w): [Word, string, string] => [w, ...status(w)]);
  const hskFound = searchEntries(hskList().filter((e) => !byHan.has(e.han)), q, 60)
    .map((e) => otherWord(e.han, e.py, e.ru, e.level)).map((w): [Word, string, string] => [w, w.level ?? "", "other"]);
  $("w-groups").innerHTML = section("deck", "В этой колоде", inDeck, inDeck.length, "Не нашлось.")
    + section("hsk", "В других колодах", hskFound, hskFound.length)
    + `<div id="w-dict"></div>`;
  $("w-more").hidden = true;
  renderDictSection(q, new Set([...byHan.keys(), ...hskFound.map(([w]) => w.han)]));
}

/* Словарь: индекс грузится при первом поиске, раздел дорисовывается ниже. */
function renderDictSection(q: string, skip: Set<string>) {
  const box = document.getElementById("w-dict");
  if (!box) return;
  const dict = dictNow();
  if (!dict) {
    box.innerHTML = `<h3 class="grp-title"><span>В словаре</span></h3><p class="empty">Загружаю словарь…</p>`;
    loadDict().then(() => { if (searchInput().value.trim() === q) renderDictSection(q, skip); })
      .catch(() => { box.innerHTML = `<h3 class="grp-title"><span>В словаре</span></h3><p class="empty">Словарь не загрузился. Для первого поиска нужен интернет.</p>`; });
    return;
  }
  clearTimeout(dictTimer);
  dictTimer = window.setTimeout(() => {
    if (searchInput().value.trim() !== q) return;
    const hits = searchDict(dict, q, DICT_MAX + 1, skip);
    const items = hits.slice(0, DICT_MAX).map(fromHit).map((w): [Word, string, string] => {
      const own = cardOf(w);
      return own ? [w, ...status(w)] : [w, "", "other"];
    });
    box.innerHTML = section("dict", "В словаре", items, hits.length, "Не нашлось. Ищите по иероглифу, пиньиню без тонов или по-русски.");
  }, 100);
}

function renderList() {
  const q = searchInput().value.trim();
  $("w-controls").hidden = !!q;
  $("w-groups").innerHTML = "";
  if (q) { pending = []; renderSearch(q); return; }
  const all = words();
  renderControls(all);
  const list = ui.filter === "all" ? all : ui.filter === "leech" ? all.filter(isLeech) : all.filter((w) => kind(w) === ui.filter);
  pending = groupWords(list).map((g) => ({ ...g, items: [...g.items], started: false }));
  if (!list.length) $("w-groups").innerHTML = `<p class="empty">${ui.filter === "all" ? "В колоде нет слов." : "Таких слов пока нет."}</p>`;
  else if (ui.filter === "leech") $("w-groups").insertAdjacentHTML("afterbegin", `<p class="hint">Пиявки — слова, которые забыты ${LEECH} и больше раз. Помогает заметка-мнемоника: откройте слово → «Изменить».</p>`);
  drawMore();
}

/** Подставить текст в поиск (рукописный и голосовой ввод). */
export function setSearch(text: string, append = false) {
  const el = searchInput();
  el.value = append ? el.value + text : text;
  renderList();
}

export function initWords() {
  onShow("words", () => {
    renderList();
    loadHskList().then(() => { if (searchInput().value.trim()) renderList(); });
  });
  searchInput().addEventListener("input", renderList);
  initHandwrite((ch) => setSearch(ch, true));
  initVoice((text) => setSearch(text));
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
    const t = e.target as HTMLElement;
    const ex = t.closest<HTMLButtonElement>("[data-expand]");
    if (ex) {
      expanded.add(ex.dataset.expand!);
      const q = searchInput().value.trim();
      renderSearch(q);
      return;
    }
    const b = t.closest<HTMLButtonElement>(".item,.tile");
    if (b?.dataset.id) openEntry(b.dataset.id, true);
  });
}
