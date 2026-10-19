/**
 * «Слова» — начальный экран. Два режима:
 *  словарь (по умолчанию): поиск любого слова по всему 大БКРС — иероглифы, пиньинь, русский, рисованием, голосом;
 *    без запроса — недавно открытые слова;
 *  слова колоды (из обзора колоды): список с фильтрами и порядком, поиск внутри колоды.
 */
import { app, words, isLeech, LEECH, cardOf, deckById } from "../state.ts";
import { searchDict } from "../core/dict.ts";
import { searchEntries, type DictEntry } from "../core/edits.ts";
import type { Word } from "../core/deck.ts";
import { DAY } from "../core/fsrs.ts";
import { $, esc, plural } from "./dom.ts";
import { onShow, show } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { initHandwrite } from "./handwrite.ts";
import { initVoice } from "./voice.ts";
import { renderToday } from "./today.ts";
import { kind, status, itemHTML, otherWord, fromHit, hskList, loadHskList, dictNow, loadDict, wordByHan, type ViewMode } from "./lookup.ts";

type Filter = "all" | "new" | "learn" | "review" | "hidden" | "leech";
type Sort = "deck" | "pinyin" | "due" | "hard";
const LS = "cherta.words";
const ui: { filter: Filter; sort: Sort; view: ViewMode } = { filter: "all", sort: "deck", view: "list" };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* приватный режим */ }
const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify({ filter: ui.filter, sort: ui.sort, view: ui.view })); } catch { /* */ } };

/** Режим экрана: словарь или слова текущей колоды. */
let mode: "dict" | "deck" = "dict";

/** Открыть «Слова» со списком текущей колоды. */
export function openDeckWords() { mode = "deck"; searchInput().value = ""; show("words"); }

/* ---------- недавние ---------- */

const RECENT = "cherta.recent";
function recent(): string[] {
  try { return (JSON.parse(localStorage.getItem(RECENT) ?? "[]") as string[]).filter((x) => typeof x === "string"); } catch { return []; }
}
function remember(han: string) {
  const list = [han, ...recent().filter((x) => x !== han)].slice(0, 30);
  try { localStorage.setItem(RECENT, JSON.stringify(list)); } catch { /* */ }
}

/* ---------- список колоды ---------- */

type Group = { title: string; items: Word[] };
type PendingGroup = Group & { started: boolean };

function groupWords(list: Word[]): Group[] {
  const now = Date.now();
  if (ui.sort === "pinyin") {
    const sorted = [...list].sort((a, b) => a.py.localeCompare(b.py) || a.han.localeCompare(b.han));
    const map = new Map<string, Word[]>();
    for (const w of sorted) { const k = (w.py[0] ?? "?").toUpperCase(); (map.get(k) ?? map.set(k, []).get(k)!).push(w); }
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
      if (g.title) html += `<h3 class="grp-title"><span>${esc(g.title)}</span><span class="grp-n">${g.items.length}</span></h3>`;
      g.started = true;
    }
    html += `<div class="grp ${ui.view}">`;
    const part = g.items.splice(0, budget);
    budget -= part.length;
    html += part.map((w) => { const [st, cls] = statusOf(w); return itemHTML(w, st, cls, ui.view); }).join("") + `</div>`;
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

/* ---------- метки ---------- */

/** Уровни HSK по слову (для подписи у слов, которые ещё не учатся). */
let levelOf = new Map<string, string>();
function statusOf(w: Word): [string, string] {
  if (cardOf(w)) return status(w);
  return [levelOf.get(w.han) ?? "", "other"];
}

/* ---------- слова моих колод ---------- */

let mine: { key: string; list: DictEntry[] } | null = null;
/** Все слова колод из моего списка (для поиска слов, которых может не быть в словаре). */
async function myWords(): Promise<DictEntry[]> {
  const key = app.decks.map((d) => `${d.id}:${d.count}`).join();
  if (mine?.key === key) return mine.list;
  const seen = new Set<string>();
  const list: DictEntry[] = [];
  for (const d of app.decks) {
    try {
      for (const w of (await deckById(d.id)).words) if (!seen.has(w.han)) { seen.add(w.han); list.push({ han: w.han, py: w.py, ru: w.ru, level: d.title }); }
    } catch { /* колода не загрузилась */ }
  }
  mine = { key, list };
  return list;
}

/* ---------- поиск по словарю ---------- */

const STEP = 40;
const DICT_MAX = 400;
let shown = STEP;
let lastQuery = "";
let dictTimer = 0;
let token = 0;

const searchInput = () => $<HTMLInputElement>("w-search");

function listHTML(items: Word[]): string {
  return `<div class="grp ${ui.view}">${items.map((w) => { const [st, cls] = statusOf(w); return itemHTML(w, st, cls, ui.view); }).join("")}</div>`;
}

async function renderDictSearch(q: string) {
  if (q !== lastQuery) { shown = STEP; lastQuery = q; }
  const my = ++token;
  const box = $("w-groups");
  $("w-more").hidden = true;
  const own = searchEntries(await myWords(), q, 60);
  if (my !== token) return;
  const dict = dictNow();
  if (!dict) {
    // пока словарь грузится — совпадения из своих колод и HSK
    const hsk = searchEntries(hskList(), q, 30).filter((e) => !own.some((o) => o.han === e.han));
    const quick = [...own, ...hsk].map((e) => otherWord(e.han, e.py, e.ru, e.level));
    box.innerHTML = (quick.length ? listHTML(quick.slice(0, shown)) : "") + `<p class="empty">Загружаю словарь…</p>`;
    loadDict().then(() => { if (searchInput().value.trim() === q) renderDictSearch(q); })
      .catch(() => { if (my === token) box.insertAdjacentHTML("beforeend", `<p class="empty">Словарь не загрузился. Для первого поиска нужен интернет.</p>`); });
    return;
  }
  clearTimeout(dictTimer);
  dictTimer = window.setTimeout(() => {
    if (my !== token || searchInput().value.trim() !== q) return;
    const hits = searchDict(dict, q, DICT_MAX + 1);
    const inDict = new Set(hits.map((h) => h.han));
    // слова своих колод, которых в словаре нет (термины, свои слова), — в начало
    const extra = own.filter((e) => !inDict.has(e.han)).map((e) => otherWord(e.han, e.py, e.ru, e.level));
    const items = [...extra, ...hits.slice(0, DICT_MAX).map(fromHit)];
    if (!items.length) { box.innerHTML = `<p class="empty">Не нашлось. Ищите по иероглифам, пиньиню без тонов или по-русски.</p>`; return; }
    const total = hits.length > DICT_MAX ? `${DICT_MAX}+` : String(items.length);
    box.innerHTML = `<h3 class="grp-title"><span>Найдено</span><span class="grp-n">${total}</span></h3>` + listHTML(items.slice(0, shown))
      + (items.length > shown ? `<button class="btn small ghost more-btn" data-more>Показать ещё</button>` : "")
      + `<p class="hint src-note">Словарь 大БКРС · bkrs.info</p>`;
  }, 80);
}

/* ---------- без запроса: недавние ---------- */

async function renderDictHome() {
  const box = $("w-home");
  box.hidden = false;
  $("w-groups").innerHTML = "";
  $("w-more").hidden = true;
  const list = recent();
  const deck = app.deck;
  const my = ++token;
  const items = await Promise.all(list.slice(0, 20).map((h) => wordByHan(h)));
  if (my !== token) return;
  box.innerHTML = `<div id="w-today"></div><p class="hint">Ищите любое слово: иероглифами, пиньинем без тонов, по-русски, рисованием ✍ или голосом.</p>`
    + (items.length ? `<h3 class="grp-title"><span>Недавно открытые</span><button class="link-btn small" data-clear-recent>Очистить</button></h3>${listHTML(items)}` : "")
    + (deck ? `<button class="deck-opt" data-deck-words><span>Слова колоды «${esc(deck.title)}»<small>${deck.words.length} ${plural(deck.words.length, "слово", "слова", "слов")} — список, статус, фильтры</small></span><span class="pick-btn">→</span></button>` : "");
  renderToday($("w-today"));
}

/* ---------- отрисовка ---------- */

function renderList() {
  const q = searchInput().value.trim();
  const deckMode = mode === "deck" && !!app.deck;
  $("w-deckbar").hidden = !deckMode;
  if (deckMode) $("w-decktitle").textContent = app.deck!.title;
  searchInput().placeholder = deckMode ? "Поиск в колоде" : "Любое слово: 学, xue или учиться";
  $("w-controls").hidden = !deckMode || !!q;
  $("w-home").hidden = true;
  $("w-groups").innerHTML = "";
  pending = [];
  if (!deckMode) {
    if (q) renderDictSearch(q); else renderDictHome();
    return;
  }
  const all = words();
  if (q) {
    const byHan = new Map(all.map((w) => [w.han, w]));
    const found = searchEntries(all.map((w) => ({ han: w.han, py: w.py, ru: w.ru })), q, 500).map((e) => byHan.get(e.han)!);
    $("w-groups").innerHTML = found.length ? listHTML(found) : `<p class="empty">В колоде не нашлось. <button class="link-btn" data-search-all>Искать во всём словаре</button></p>`;
    $("w-more").hidden = true;
    return;
  }
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

function open(id: string, han?: string) {
  if (han) remember(han);
  openEntry(id, true);
}

export function initWords() {
  onShow("words", () => {
    renderList();
    loadHskList().then((list) => {
      levelOf = new Map(list.map((e) => [e.han, e.level ?? ""]));
      if (searchInput().value.trim()) renderList();
    });
    // словарь — заранее, чтобы первый поиск был быстрым
    loadDict().catch(() => {});
  });
  searchInput().addEventListener("input", renderList);
  // из меню — всегда словарь (до обработчика меню, поэтому на этапе погружения)
  document.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest('.dr-item[data-view="words"]')) mode = "dict";
  }, true);
  initHandwrite((ch) => setSearch(ch, true));
  initVoice((text) => setSearch(text));
  $("w-back").addEventListener("click", () => show("deck"));
  $("w-all").addEventListener("click", () => { mode = "dict"; renderList(); });
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
  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-more]")) { shown += STEP * 2; renderDictSearch(searchInput().value.trim()); return; }
    if (t.closest("[data-search-all]")) { mode = "dict"; renderList(); return; }
    if (t.closest("[data-deck-words]")) { mode = "deck"; renderList(); return; }
    if (t.closest("[data-clear-recent]")) { try { localStorage.removeItem(RECENT); } catch { /* */ } renderList(); return; }
    const b = t.closest<HTMLButtonElement>(".item,.tile");
    if (b?.dataset.id) open(b.dataset.id, b.querySelector(".h")?.textContent ?? undefined);
  };
  $("w-groups").addEventListener("click", onClick);
  $("w-home").addEventListener("click", onClick);
}
