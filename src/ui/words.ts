/**
 * «Слова» — начальный экран. Два режима:
 *  словарь (по умолчанию): поиск любого слова по всему 大БКРС — иероглифы, пиньинь, русский, рисованием, голосом;
 *    без запроса — недавно открытые слова;
 *  слова колоды (из обзора колоды): список с фильтрами и порядком, поиск внутри колоды.
 */
import { appLang } from "../state.ts";
import { app, words, isLeech, LEECH, cardOf, deckById, loadThemes, themesOf } from "../state.ts";
import { hashStr } from "../core/skills.ts";
import { say } from "../speech.ts";
import { openAddToDeck } from "./editor.ts";
import { pinyinHTML } from "./dom.ts";
import { searchDict, charHits } from "../core/dict.ts";
import { searchEntries, type DictEntry } from "../core/edits.ts";
import type { Word } from "../core/deck.ts";
import { DAY } from "../core/fsrs.ts";
import { $, esc, plural } from "./dom.ts";
import { onShow, show } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { initHandwrite } from "./handwrite.ts";
import { initVoice } from "./voice.ts";
import { kind, status, itemHTML, otherWord, fromHit, charPartsHTML, hskList, loadHskList, dictNow, loadDict, wordByHan, jdictNow, loadJDict, jWordAt, fromJHit, type ViewMode } from "./lookup.ts";
import { searchJDict } from "../core/jdict.ts";

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

/** Недавние японские: «написание|статья». */
const RECENT_JA = "cherta.recentJa";
function recentJa(): string[] {
  try { return (JSON.parse(localStorage.getItem(RECENT_JA) ?? "[]") as string[]).filter((x) => typeof x === "string"); } catch { return []; }
}
function rememberJa(han: string, jid?: string) {
  const k = `${han}|${jid ?? ""}`;
  const list = [k, ...recentJa().filter((x) => x !== k)].slice(0, 30);
  try { localStorage.setItem(RECENT_JA, JSON.stringify(list)); } catch { /* */ }
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
  // уровни HSK — китайские; у японского слова с тем же написанием они не к месту
  return [w.id.startsWith("ja:") ? (w as { level?: string }).level ?? "" : levelOf.get(w.han) ?? "", "other"];
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
    if (!items.length) {
      const parts = charHits(dict, q);
      box.innerHTML = parts.length
        ? `<p class="empty">Такого слова в словаре нет. По иероглифам:</p><div class="cparts">${charPartsHTML(parts)}</div>`
        : `<p class="empty">Не нашлось. Ищите по иероглифам, пиньиню без тонов или по-русски.</p>`;
      return;
    }
    const total = hits.length > DICT_MAX ? `${DICT_MAX}+` : String(items.length);
    // несколько иероглифов в запросе — сначала что значит каждый
    const parts = charHits(dict, q);
    // чтения в слове — если запрос сам является словом словаря (银行卡: 行 = háng)
    const exact = items.find((w) => w.han === q);
    box.innerHTML = (parts.length ? `<h3 class="grp-title"><span>По иероглифам</span></h3><div class="cparts">${charPartsHTML(parts, exact)}</div>` : "")
      + `<h3 class="grp-title"><span>Найдено</span><span class="grp-n">${total}</span></h3>` + listHTML(items.slice(0, shown))
      + (items.length > shown ? `<button class="btn small ghost more-btn" data-more>Показать ещё</button>` : "")
      + `<p class="hint src-note">Словарь 大БКРС · bkrs.info</p>`;
  }, 80);
}

/* ---------- японский словарь (WARODAI) ---------- */

const JA_SRC = `<p class="hint src-note">Словарь <a href="https://github.com/warodai/warodai-source" target="_blank" rel="noopener">WARODAI</a> · <a href="https://creativecommons.org/licenses/by-nc-nd/3.0/deed.ru" target="_blank" rel="noopener">CC BY-NC-ND 3.0</a></p>`;

function renderJSearch(q: string) {
  if (q !== lastQuery) { shown = STEP; lastQuery = q; }
  const my = ++token;
  const box = $("w-groups");
  $("w-more").hidden = true;
  const x = jdictNow();
  if (!x) {
    box.innerHTML = `<p class="empty">Загружаю японский словарь…</p>`;
    loadJDict().then(() => { if (searchInput().value.trim() === q) renderList(); })
      .catch(() => { if (my === token) box.innerHTML = `<p class="empty">Японский словарь не загрузился. Для первого поиска нужен интернет.</p>`; });
    return;
  }
  clearTimeout(dictTimer);
  dictTimer = window.setTimeout(() => {
    if (my !== token || searchInput().value.trim() !== q) return;
    const hits = searchJDict(x, q, DICT_MAX + 1);
    if (!hits.length) { box.innerHTML = `<p class="empty">Не нашлось. Ищите кандзи, каной, ромадзи (taberu) или по-русски.</p>`; return; }
    const items = hits.slice(0, DICT_MAX).map(fromJHit);
    const total = hits.length > DICT_MAX ? `${DICT_MAX}+` : String(items.length);
    box.innerHTML = `<h3 class="grp-title"><span>Найдено</span><span class="grp-n">${total}</span></h3>` + listHTML(items.slice(0, shown))
      + (items.length > shown ? `<button class="btn small ghost more-btn" data-more>Показать ещё</button>` : "") + JA_SRC;
  }, 80);
}

const JA_EXAMPLES = ["食べる", "taberu", "есть", "学校", "terebi", "спасибо"];

async function renderJHome() {
  const box = $("w-home");
  box.hidden = false;
  $("w-groups").innerHTML = "";
  $("w-more").hidden = true;
  const my = ++token;
  let items: ReturnType<typeof jWordAt>[] = [];
  const rec = recentJa().slice(0, 10);
  if (rec.length) {
    try {
      const x = await loadJDict();
      items = rec.map((k) => { const [, jid] = k.split("|"); const i = x.id.indexOf(jid); return i >= 0 ? jWordAt(x, i) : null; }).filter((w): w is NonNullable<typeof w> => !!w);
    } catch { /* офлайн */ }
  } else loadJDict().catch(() => {});
  if (my !== token) return;
  box.innerHTML = `<div class="wh-ex"><span class="hint">Ищите кандзи, каной, ромадзи или по-русски. Например:</span>
       <div class="chips-row wrapped">${JA_EXAMPLES.map((x) => `<button class="chip-btn" data-try="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>`
    + (items.length ? `<h3 class="grp-title"><span>Недавно открытые</span><button class="link-btn small" data-clear-recent>Очистить</button></h3>${listHTML(items)}` : "")
    + (app.deck ? `<button class="deck-opt" data-deck-words><span>Слова колоды «${esc(app.deck.title)}»<small>${app.deck.words.length} ${plural(app.deck.words.length, "слово", "слова", "слов")} — список, статус, фильтры</small></span><span class="pick-btn">→</span></button>` : "")
    + JA_SRC;
}

/* ---------- без запроса: начальный экран словаря ---------- */

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
/** Частые ключи (смысловые части иероглифов) — тап показывает иероглифы с этим ключом. */
const KEYS: [string, string][] = [["亻", "человек"], ["氵", "вода"], ["扌", "рука"], ["口", "рот"], ["木", "дерево"], ["艹", "трава"], ["讠", "речь"], ["女", "женщина"],
  ["心", "сердце"], ["忄", "сердце"], ["日", "солнце"], ["月", "луна, тело"], ["土", "земля"], ["火", "огонь"], ["宀", "крыша"], ["纟", "нить"],
  ["辶", "движение"], ["门", "дверь"], ["钅", "металл"], ["足", "нога"], ["目", "глаз"], ["贝", "деньги"], ["饣", "еда"], ["车", "повозка"]];
const EXAMPLES = ["学习", "xuexi", "учиться", "人", "zhongguo", "спасибо"];

let homeOpen: { kind: "theme" | "key"; id: string } | null = null;
let themesAll = false;
let decompDb: Promise<Record<string, [string, string, string, string, string]>> | null = null;
const loadDecomp = () => (decompDb ??= fetch("data/decomp.json").then((r) => r.json()).catch(() => { decompDb = null; return {}; }));

/** Слово дня: одно и то же весь день, из HSK того уровня, который вы учите (по добавленным колодам, иначе HSK 1–2). */
function wordOfDay(list: DictEntry[]): DictEntry | null {
  const lv = Math.max(0, ...app.decks.map((d) => Number(/^hsk3-(\d)$/.exec(d.id)?.[1] ?? 0)));
  const want = new Set(Array.from({ length: Math.max(2, lv) }, (_, i) => `HSK ${i + 1}`));
  const pool = list.filter((e) => e.level && want.has(e.level) && e.han.length <= 3 && e.ru);
  if (!pool.length) return null;
  const day = new Date().toISOString().slice(0, 10);
  return pool.reduce((m, e) => (hashStr(day + e.han) < hashStr(day + m.han) ? e : m), pool[0]);
}

async function renderDictHome() {
  const box = $("w-home");
  box.hidden = false;
  $("w-groups").innerHTML = "";
  $("w-more").hidden = true;
  const my = ++token;
  const [hsk] = await Promise.all([loadHskList().catch(() => [] as DictEntry[]), loadThemes()]);
  const list = recent();
  const items = await Promise.all(list.slice(0, 8).map((h) => wordByHan(h)));
  // трудные слова: забытые много раз в любой колоде
  const leechHan = [...new Set([...app.cards.values()].filter((c) => (c.lapses ?? 0) >= LEECH).map((c) => c.id.replace(/^zh:/, "").replace(/#.*$/, "")))].slice(0, 8);
  const leeches = await Promise.all(leechHan.map((h) => wordByHan(h)));
  if (my !== token) return;
  const wod = wordOfDay(hsk);
  let wodHTML = "";
  if (wod) {
    const w = await wordByHan(wod.han);
    if (my !== token) return;
    wodHTML = `<div class="panel wod"><span class="label">Слово дня · ${esc(wod.level ?? "")}</span>
      <div class="wod-main"><button class="wod-han" data-open-han="${esc(w.han)}">${esc(w.han)}</button>
        <div class="wod-t"><span class="py">${w.ref.length ? pinyinHTML(w.ref) : esc(w.py)}</span><span class="wod-ru">${esc(w.ru)}</span></div>
        <button class="icon-btn" data-say-han="${esc(w.han)}" aria-label="Послушать">${PLAY}</button></div>
      <div class="row"><button class="btn small" data-open-han="${esc(w.han)}">Статья</button><button class="btn small" data-add-han="${esc(w.han)}">+ В колоду</button></div></div>`;
  }
  const themes = themesOf("hsk3-1");
  box.innerHTML = wodHTML
    + `<div class="wh-ex"><div class="chips-row wrapped">${EXAMPLES.map((x) => `<button class="chip-btn" data-try="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>`
    + (items.length ? `<h3 class="grp-title"><span>Недавно открытые</span><button class="link-btn small" data-clear-recent>Очистить</button></h3>${listHTML(items)}` : "")
    + (themes.length ? `<h3 class="grp-title"><span>Слова по темам · HSK 1</span><span class="grp-n">${themes.length}</span></h3>
       <div class="chips-row wrapped" id="wh-themes">${themes.map((t, i) => `<button class="chip-btn" data-wtheme="${i}" aria-pressed="${homeOpen?.kind === "theme" && homeOpen.id === String(i)}" ${i >= 8 && !themesAll ? "hidden" : ""}>${esc(t.t)}</button>`).join("")}${themes.length > 8 && !themesAll ? `<button class="chip-btn more" data-wthemes-all>Все темы (${themes.length}) ▾</button>` : ""}</div><div id="wh-theme"></div>` : "")
    + `<h3 class="grp-title"><span>Иероглифы по ключу</span><span class="grp-n">${KEYS.length}</span></h3>
       <div class="keys">${KEYS.map(([k, ru]) => `<button class="key-btn" data-wkey="${esc(k)}" aria-pressed="${homeOpen?.kind === "key" && homeOpen.id === k}" title="${esc(ru)}"><b>${esc(k)}</b><small>${esc(ru)}</small></button>`).join("")}</div><div id="wh-key"></div>`
    + (leeches.length ? `<h3 class="grp-title"><span>Трудные слова</span><span class="grp-n">${leeches.length}</span></h3><p class="hint">Забыты ${LEECH} и больше раз — откройте и придумайте мнемонику («Изменить» → заметка).</p>${listHTML(leeches)}` : "")
    + (app.deck ? `<button class="deck-opt" data-deck-words><span>Слова колоды «${esc(app.deck.title)}»<small>${app.deck.words.length} ${plural(app.deck.words.length, "слово", "слова", "слов")} — список, статус, фильтры</small></span><span class="pick-btn">→</span></button>` : "");
  if (homeOpen) showHomeList(homeOpen.kind, homeOpen.id);
}

/** Слова темы или иероглифы с ключом — под кнопками, повторный тап сворачивает. */
async function showHomeList(kind0: "theme" | "key", id: string) {
  const box = document.getElementById(kind0 === "theme" ? "wh-theme" : "wh-key");
  const other = document.getElementById(kind0 === "theme" ? "wh-key" : "wh-theme");
  if (!box) return;
  if (other) other.innerHTML = "";
  document.querySelectorAll<HTMLElement>("#w-home [data-wtheme],#w-home [data-wkey]").forEach((b) =>
    b.setAttribute("aria-pressed", String((kind0 === "theme" ? b.dataset.wtheme : b.dataset.wkey) === id)));
  const my = ++token;
  let hans: string[] = [];
  let title = "";
  if (kind0 === "theme") {
    const t = themesOf("hsk3-1")[Number(id)];
    if (!t) return;
    hans = t.w; title = `${t.t} · ${t.w.length} ${plural(t.w.length, "слово", "слова", "слов")}`;
  } else {
    const db = await loadDecomp();
    const hsk = new Map((hskList() ?? []).map((e, i) => [e.han, i]));
    // иероглифы с этим ключом, сначала те, что встречаются в HSK (и чем раньше, тем выше)
    hans = Object.entries(db as Record<string, string[]>).filter(([ch, r]) => r[1] === id && hsk.has(ch)).map(([ch]) => ch).sort((x, y) => hsk.get(x)! - hsk.get(y)!).slice(0, 40);
    title = `Ключ ${id} · ${hans.length} ${plural(hans.length, "иероглиф", "иероглифа", "иероглифов")} из HSK`;
  }
  const ws = await Promise.all(hans.map((h) => wordByHan(h)));
  if (my !== token) return;
  box.innerHTML = `<div class="wh-list"><div class="wh-head"><b>${esc(title)}</b><button class="link-btn small" data-home-close>Свернуть</button></div>${ws.length ? listHTML(ws) : `<p class="empty">Нет слов.</p>`}</div>`;
}

/* ---------- отрисовка ---------- */

function renderList() {
  const q = searchInput().value.trim();
  const ja = appLang() === "ja";
  const deckMode = mode === "deck" && !!app.deck;
  $("w-deckbar").hidden = !deckMode;
  if (deckMode) $("w-decktitle").textContent = app.deck!.title;
  searchInput().placeholder = deckMode ? "Поиск в колоде" : ja ? "Любое слово: 食べる, taberu или есть" : "Любое слово: 学, xue или учиться";
  $("w-controls").hidden = !deckMode || !!q;
  $("w-home").hidden = true;
  $("w-groups").innerHTML = "";
  pending = [];
  if (!deckMode) {
    if (ja) { if (q) renderJSearch(q); else renderJHome(); return; }
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

function open(id: string, han?: string, jid?: string) {
  if (han) { if (appLang() === "ja") rememberJa(han, jid); else remember(han); }
  openEntry(id, true, jid);
}

export function initWords() {
  onShow("words", () => {
    renderList();
    loadHskList().then((list) => {
      levelOf = new Map(list.map((e) => [e.han, e.level ?? ""]));
      if (searchInput().value.trim()) renderList();
    });
    // словарь — заранее, чтобы первый поиск был быстрым
    if (appLang() === "ja") loadJDict().catch(() => {}); else loadDict().catch(() => {});
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
    if (t.closest("[data-more]")) { shown += STEP * 2; const q = searchInput().value.trim(); if (appLang() === "ja") renderJSearch(q); else renderDictSearch(q); return; }
    if (t.closest("[data-search-all]")) { mode = "dict"; renderList(); return; }
    if (t.closest("[data-deck-words]")) { mode = "deck"; renderList(); return; }
    if (t.closest("[data-clear-recent]")) { try { localStorage.removeItem(appLang() === "ja" ? RECENT_JA : RECENT); } catch { /* */ } renderList(); return; }
    if (t.closest("[data-wthemes-all]")) { themesAll = true; document.querySelectorAll<HTMLElement>("#wh-themes [data-wtheme]").forEach((x) => (x.hidden = false)); t.closest("[data-wthemes-all]")!.remove(); return; }
    const tr = t.closest<HTMLButtonElement>("[data-try]");
    if (tr) { searchInput().value = tr.dataset.try!; renderList(); return; }
    const th = t.closest<HTMLButtonElement>("[data-wtheme]");
    const ky = t.closest<HTMLButtonElement>("[data-wkey]");
    if (th || ky) {
      const k: "theme" | "key" = th ? "theme" : "key", id = th ? th.dataset.wtheme! : ky!.dataset.wkey!;
      if (homeOpen?.kind === k && homeOpen.id === id) { homeOpen = null; $(k === "theme" ? "wh-theme" : "wh-key").innerHTML = ""; (th ?? ky)!.setAttribute("aria-pressed", "false"); return; }
      homeOpen = { kind: k, id };
      showHomeList(k, id);
      return;
    }
    if (t.closest("[data-home-close]")) {
      homeOpen = null;
      for (const x of ["wh-theme", "wh-key"]) { const el = document.getElementById(x); if (el) el.innerHTML = ""; }
      document.querySelectorAll<HTMLElement>("#w-home [data-wtheme],#w-home [data-wkey]").forEach((x) => x.setAttribute("aria-pressed", "false"));
      return;
    }
    const sh = t.closest<HTMLButtonElement>("[data-say-han]");
    if (sh) { say(sh.dataset.sayHan!); return; }
    const oh = t.closest<HTMLButtonElement>("[data-open-han]");
    if (oh) { wordByHan(oh.dataset.openHan!).then((w) => open(w.id, w.han)); return; }
    const ah = t.closest<HTMLButtonElement>("[data-add-han]");
    if (ah) { wordByHan(ah.dataset.addHan!).then((w) => openAddToDeck(w)); return; }
    const b = t.closest<HTMLButtonElement>(".item,.tile,.cpart");
    if (b?.dataset.id) open(b.dataset.id, b.querySelector(".h")?.textContent ?? undefined, b.dataset.jid);
  };
  $("w-groups").addEventListener("click", onClick);
  $("w-home").addEventListener("click", onClick);
}
