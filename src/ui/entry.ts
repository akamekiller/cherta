/** Карточка слова: шапка (слово, пиньинь, кратко, статус) и вкладки Значения · Примеры · Слова · Черты. */
import { cardOf, words, isHidden, dictArticle, dictWordEx } from "../state.ts";
import { splitArticle, wordsWithChar, countWithChar, pyReadings, safeHtml, type ArticleParts, type CharMode } from "../core/dict.ts";
import type { Word } from "../core/deck.ts";
import { formatGap } from "../core/fsrs.ts";
import { say } from "../speech.ts";
import { $, esc, pinyinHTML } from "./dom.ts";
import { parseRef } from "../core/pinyin.ts";
import { createWriter, type Writer } from "./writer.ts";
import { onLeave, show } from "./nav.ts";
import { showNote } from "./session.ts";
import { openWordEditor, openAddToDeck } from "./editor.ts";
import { toggleBookWord, inBook } from "./deckpick.ts";
import { toDecomp, parts as decompParts, layoutName, TYPE_NAME, type DecompRow } from "../core/decomp.ts";
import { hskLookup, editOf } from "../state.ts";
import { wordId } from "../core/deck.ts";
import { findWord, wordByHan, refreshOther, pyHTML, statusAny, itemHTML, fromHit, loadDict, dictNow, type OtherWord } from "./lookup.ts";

type Tab = "mean" | "ex" | "words" | "strokes";

let word: Word | OtherWord | null = null;
let writer: Writer | null = null;
let tab: Tab = "mean";
let parts: ArticleParts | null = null;
let token = 0;
/** Откуда пришли по ссылкам «см.» и словам с иероглифом, чтобы «назад» вёл туда. */
const trail: string[] = [];

export const entryWriter = () => writer;

/* ---------- открыть ---------- */

export function openEntry(id: string, fromList = false) {
  const w = findWord(id);
  if (!w) return;
  if (fromList) trail.length = 0;
  word = w;
  show("detail");
  renderHead(w);
  wordState = { ch: [...w.han][0], mode: w.han.length > 1 ? "any" : "start", limit: 18 };
  strokeChar = [...w.han][0];
  parts = null;
  $("d-art").innerHTML = `<p class="hint">Загружаю статью…</p>`;
  $("d-ex").innerHTML = "";
  $("d-ex-n").textContent = "";
  $("d-w-n").textContent = "";
  setTab(tab === "strokes" ? "strokes" : "mean");
  loadArticle(w);
  loadWordCount(w);
}

async function openByHan(han: string) {
  const w = await wordByHan(han);
  if (word) trail.push(word.id);
  openEntry(w.id);
}

function renderHead(w: Word | OtherWord) {
  $("d-back").textContent = trail.length ? "← Назад" : "← К словам";
  $("d-han").textContent = w.han;
  $("d-han").classList.toggle("long", [...w.han].length > 3);
  $("d-py").innerHTML = pyHTML(w);
  $("d-ru").textContent = w.ru;
  $("d-ru").hidden = !w.ru;
  showNote($("d-note"), w.id);
  const tags: string[] = [];
  const inDeck = words().some((x) => x.id === w.id);
  const level = (w as OtherWord).level;
  if (level) tags.push(`<span class="tag">${esc(level)}</span>`);
  const c = cardOf(w);
  if (isHidden(w)) tags.push(`<span class="tag">скрыто из занятий</span>`);
  else if (c) tags.push(c.state === "review"
    ? `<span class="tag ok">повторение через ${esc(formatGap(Math.max(0, c.due - Date.now())))}</span>`
    : `<span class="tag mid">учу</span>`);
  else if (inDeck) tags.push(`<span class="tag">в колоде, новое</span>`);
  $("d-tags").innerHTML = tags.join("");
  $("d-tobook").textContent = inBook(w.han) ? "✓ В тетради" : "+ В тетрадь";
  $("d-tags").hidden = !tags.length;
}

/* ---------- вкладки ---------- */

function setTab(t: Tab) {
  tab = t;
  document.querySelectorAll<HTMLButtonElement>("#d-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  for (const x of ["mean", "ex", "words", "strokes"] as Tab[]) $(`tab-${x}`).hidden = x !== t;
  if (t === "strokes") renderStrokes();
  else { try { writer?.cancelQuiz(); } catch { /* */ } }
  if (t === "words") renderWords();
}

/* ---------- значения и примеры ---------- */

const SENSES_SHOWN = 12;
const EX_SHOWN = 8;

/** Примеры вкладки: из статьи (с пометкой значения) и из базы примеров — как в Trainchinese, у почти каждого слова. */
type Ex = { zh: string; tr: string; html: boolean; sense?: string | null };
let exList: Ex[] = [];
const EXPY = "cherta.expy";
let exPy = (() => { try { return localStorage.getItem(EXPY) !== "0"; } catch { return true; } })();

async function loadArticle(w: Word) {
  const my = ++token;
  $("d-src").setAttribute("href", `https://bkrs.info/slovo.php?ch=${encodeURIComponent(w.han)}`);
  let art = null;
  const exP = dictWordEx(w.han).catch(() => [] as [string, string][]);
  try { art = await dictArticle(w.han); } catch { /* офлайн, шард не в кэше */ }
  if (my !== token) return;
  $("d-art-more").hidden = true;
  $("d-ex-more").hidden = true;
  parts = art ? splitArticle(art.r) : null;
  if (!art) {
    $("d-art").innerHTML = `<p class="hint">${navigator.onLine ? "В словаре этого слова нет." : "Статья недоступна офлайн: её ещё не открывали с интернетом."}</p>`;
  } else {
    // другие чтения 多音字 — рядом с пиньинем
    const readings = pyReadings(art.p);
    if (readings.length > 1 && w.ref.length) $("d-py").insertAdjacentHTML("beforeend", ` <span class="alt-py">также ${esc(readings.slice(1).join(", "))}</span>`);
    if (!w.ru) {
      const d = dictNow();
      const i = d ? d.han.indexOf(w.han) : -1;
      if (i >= 0 && d!.ru[i]) { $("d-ru").textContent = d!.ru[i]; $("d-ru").hidden = false; }
    }
    renderSenses(false);
  }
  // примеры: сначала из статьи, потом из базы (без повторов)
  exList = (parts?.examples ?? []).flatMap((g) => g.items.map((x) => ({ zh: x.zh, tr: x.tr, html: true, sense: g.sense })));
  const seen = new Set(exList.map((x) => x.zh.replace(/\s/g, "")));
  for (const [zh, ru] of await exP) if (!seen.has(zh)) { seen.add(zh); exList.push({ zh, tr: ru, html: false }); }
  if (my !== token) return;
  renderExamples(false);
  $("d-ex-n").textContent = exList.length ? String(exList.length) : "";
}

const senseHTML = (r: ArticleParts["senses"][number]) => `<div class="ar l${Math.min(r[0], 3)}">${safeHtml(r[1])}</div>`;

function renderSenses(all: boolean) {
  if (!parts) return;
  const list = parts.senses;
  $("d-art").innerHTML = list.length ? (all ? list : list.slice(0, SENSES_SHOWN)).map(senseHTML).join("")
    : `<p class="hint">Только примеры — откройте вкладку «Примеры».</p>`;
  const more = $("d-art-more");
  more.hidden = all || list.length <= SENSES_SHOWN;
  more.textContent = `Показать всю статью (ещё ${list.length - SENSES_SHOWN})`;
}

/** Пиньинь строки: деление на слова по словарю (самое длинное совпадение), чтение каждого слова. */
let pyMap: Map<string, string> | null = null;
function pyLine(zh: string): string {
  const d = dictNow();
  if (!d) return "";
  if (!pyMap) { pyMap = new Map(); d.han.forEach((h, i) => { if (h.length <= 4 && !pyMap!.has(h)) pyMap!.set(h, d.py[i]); }); }
  const out: string[] = [];
  const chars = [...zh];
  for (let i = 0; i < chars.length;) {
    if (!/\p{Script=Han}/u.test(chars[i])) { if (/[，。！？、；：,.!?]/.test(chars[i]) && out.length) out[out.length - 1] += chars[i]; i++; continue; }
    let L = Math.min(4, chars.length - i);
    for (; L > 1 && !pyMap.has(chars.slice(i, i + L).join("")); L--);
    const t = chars.slice(i, i + L).join("");
    const p = pyMap.get(t);
    // в индексе пиньинь уже со знаками тона (как в БКРС); у 多音字 — первое чтение
    out.push(p ? p.split(/[,;，]/)[0].trim() : "…");
    i += L;
  }
  return out.join(" ");
}

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
/** Слово в примере выделено. */
function markWord(zh: string): string {
  const h = word?.han ?? "";
  return h ? esc(zh).split(esc(h)).join(`<b class="ex-hl">${esc(h)}</b>`) : esc(zh);
}

function renderExamples(all: boolean) {
  const list = all ? exList : exList.slice(0, EX_SHOWN);
  let html = `<div class="ex-tools"><span class="hint">${exList.length ? `${exList.length} ${exList.length === 1 ? "пример" : exList.length < 5 ? "примера" : "примеров"}` : ""}</span><button class="chip-btn small" id="d-ex-py" aria-pressed="${exPy}">pīnyīn</button></div>`;
  let sense: string | null | undefined = undefined;
  list.forEach((x, i) => {
    if (x.html && x.sense && x.sense !== sense) html += `<div class="ex-sense">${safeHtml(x.sense)}</div>`;
    if (!x.html && sense !== null && i > 0 && list[i - 1].html) html += `<div class="ex-sense">Ещё примеры</div>`;
    sense = x.html ? x.sense : null;
    html += `<div class="ex"><div class="ex-row"><div class="ex-zh">${markWord(x.zh)}</div><button class="icon-btn small-ic" data-exsay="${i}" aria-label="Послушать">${PLAY}</button></div>`
      + (exPy ? `<div class="ex-py">${esc(pyLine(x.zh))}</div>` : "")
      + `<div class="ex-tr">${x.html ? safeHtml(x.tr) : esc(x.tr)}</div></div>`;
  });
  $("d-ex").innerHTML = exList.length ? html : `<p class="hint">Примеров пока нет.</p>`;
  const more = $("d-ex-more");
  more.hidden = all || exList.length <= EX_SHOWN;
  more.textContent = `Все примеры (${exList.length})`;
}

/* ---------- слова с иероглифом ---------- */

let wordState: { ch: string; mode: CharMode; limit: number } = { ch: "", mode: "any", limit: 18 };

async function loadWordCount(w: Word) {
  try { await loadDict(); } catch { return; }
  if (word !== w) return;
  const n = [...new Set(w.han)].reduce((s, ch) => s + countWithChar(dictNow()!, ch, w.han).any, 0);
  $("d-w-n").textContent = n ? (n > 999 ? "999+" : String(n)) : "";
}

async function renderWords() {
  const w = word;
  if (!w) return;
  const chars = [...new Set(w.han)];
  $("d-wchars").innerHTML = chars.length > 1
    ? chars.map((c) => `<button data-c="${esc(c)}" aria-pressed="${c === wordState.ch}">${esc(c)}</button>`).join("") : "";
  $("d-wchars").hidden = chars.length < 2;
  let d;
  try { d = await loadDict(); } catch {
    $("d-rel").innerHTML = `<p class="hint">Словарь не загрузился. Нужен интернет.</p>`;
    return;
  }
  if (word !== w) return;
  const { ch, mode, limit } = wordState;
  const n = countWithChar(d, ch, w.han);
  $("d-wfilter").innerHTML = `<button class="chip-btn" data-mode="start" aria-pressed="${mode === "start"}">Начинаются с ${esc(ch)}<b>${n.start}</b></button>`
    + `<button class="chip-btn" data-mode="any" aria-pressed="${mode === "any"}">Все с ${esc(ch)}<b>${n.any}</b></button>`;
  const hits = wordsWithChar(d, ch, limit + 1, w.han, mode);
  $("d-rel").innerHTML = hits.length ? hits.slice(0, limit).map(fromHit).map((x) => {
    const own = words().find((y) => y.id === x.id) ?? x;
    const [st, cls] = statusAny(own);
    return itemHTML(own, st, cls, "grid");
  }).join("") : `<p class="hint">Других слов с ${esc(ch)} в словаре нет.</p>`;
  $("d-rel-more").hidden = hits.length <= limit;
}

/* ---------- черты ---------- */

let strokeChar = "";
function renderStrokes() {
  const w = word;
  if (!w) return;
  const chars = [...w.han];
  $("d-chars").innerHTML = chars.length > 1
    ? chars.map((c) => `<button data-c="${esc(c)}" aria-pressed="${c === strokeChar}">${esc(c)}</button>`).join("") : "";
  $("d-chars").hidden = chars.length < 2;
  try { writer?.cancelQuiz(); } catch { /* */ }
  // поле создаётся, когда вкладка видна: иначе у него нулевая ширина
  requestAnimationFrame(() => { writer = createWriter($("d-hw"), strokeChar, { showCharacter: true, showOutline: true }); });
  renderDecomp(strokeChar);
}

/* ---------- состав иероглифа и мнемоника ---------- */

let decompDb: Promise<Record<string, DecompRow>> | null = null;
let radicals: Promise<Map<string, [string, string]>> | null = null;
const loadDecomp = () => (decompDb ??= fetch("data/decomp.json").then((r) => r.json()).catch(() => { decompDb = null; return {}; }));
/** Ключи из колоды «Ключи»: форма → [пиньинь, значение без примеров]. */
const loadRadicals = () => (radicals ??= fetch("data/decks/radicals.json").then((r) => r.json()).then((f: { words: [string, string, string][] }) =>
  new Map(f.words.map(([h, py, ru]) => [h, [py, ru.replace(/\s*\(.*\)\s*$/, "")] as [string, string]]))).catch(() => { radicals = null; return new Map(); }));

/** Короткое значение части: ключ → HSK → словарь. */
async function partInfo(ch: string): Promise<{ py: string; ru: string }> {
  const r = (await loadRadicals()).get(ch);
  if (r) return { py: r[0], ru: r[1] };
  const h = (await hskLookup())(ch);
  if (h) return { py: h.py, ru: h.ru.split(/[;,]/)[0] };
  const w = await wordByHan(ch);
  return { py: w.py, ru: (w.ru || "").split(/[;,]/)[0] };
}

const pyMarked = (py: string) => { try { return pinyinHTML(parseRef(py)); } catch { return esc(py); } };

async function renderDecomp(ch: string) {
  const box = $("d-decomp");
  box.innerHTML = "";
  const d = toDecomp((await loadDecomp())[ch]);
  if (ch !== strokeChar) return;
  const ps = d ? decompParts(d.ids).filter((p) => p !== ch) : [];
  const info = await Promise.all(ps.map(partInfo));
  if (ch !== strokeChar) return;
  const note = editOf(wordId("zh", ch))?.note;
  const lay = d ? layoutName(d.ids) : "";
  const role = (p: string) => (d?.type === "s" ? (p === d.semantic ? "смысл" : p === d.phonetic ? "звучание" : "") : "");
  box.innerHTML = `<h3 class="grp-title"><span>Состав ${esc(ch)}</span>${lay ? `<span class="grp-n">${lay}</span>` : ""}</h3>`
    + (ps.length
      ? `<div class="dc-parts">${ps.map((p, i) => `<button class="dc-part" data-part="${esc(p)}"><span class="dc-h">${esc(p)}</span><span class="dc-t"><span class="py">${pyMarked(info[i].py)}</span><span class="dc-ru">${esc(info[i].ru || "—")}</span>${role(p) ? `<span class="dc-role">${role(p)}</span>` : ""}</span></button>`).join("")}</div>`
      : `<p class="hint">${d ? "Простой иероглиф — на части не делится." : "Нет данных о составе."}</p>`)
    + (d?.type ? `<p class="hint">${TYPE_NAME[d.type]}${d.radical && d.radical !== ch ? ` · ключ ${esc(d.radical)}` : ""}</p>` : d?.radical && d.radical !== ch ? `<p class="hint">Ключ ${esc(d.radical)}</p>` : "")
    + `<div class="dc-mn"><span class="label">Мнемоника</span>${note ? `<p class="word-note">${esc(note)}</p>` : `<p class="hint">Придумайте короткую историю из частей — так иероглиф запоминается быстрее.</p>`}<button class="btn small" data-mnemo>${note ? "Изменить" : "Написать мнемонику"}</button></div>`
    + `<p class="art-src">Состав — Make Me a Hanzi (LGPL)</p>`;
}

/* ---------- обработчики ---------- */

export function initEntry() {
  onLeave("detail", () => { try { writer?.cancelQuiz(); } catch { /* */ } });
  $("d-tabs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    if (b) setTab(b.dataset.tab as Tab);
  });
  $("d-art-more").addEventListener("click", () => renderSenses(true));
  $("d-ex-more").addEventListener("click", () => renderExamples(true));
  $("d-ex").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const sb = t.closest<HTMLButtonElement>("[data-exsay]");
    if (sb) { const x = exList[Number(sb.dataset.exsay)]; if (x) say(x.zh.replace(/\s/g, ""), 0.85); return; }
    if (t.closest("#d-ex-py")) {
      exPy = !exPy;
      try { localStorage.setItem(EXPY, exPy ? "1" : "0"); } catch { /* */ }
      renderExamples(!$("d-ex-more").hidden ? false : exList.length > EX_SHOWN);
    }
  });
  // ссылки «см. …» в статье и примерах
  for (const id of ["d-art", "d-ex"]) $(id).addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-w]");
    if (a?.dataset.w) { e.preventDefault(); openByHan(a.dataset.w); }
  });
  $("d-wchars").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-c]");
    if (!b) return;
    wordState = { ...wordState, ch: b.dataset.c!, limit: 18 };
    renderWords();
  });
  $("d-wfilter").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
    if (!b) return;
    wordState = { ...wordState, mode: b.dataset.mode as CharMode, limit: 18 };
    renderWords();
  });
  $("d-rel").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-id]");
    const w = b?.dataset.id ? findWord(b.dataset.id) : undefined;
    if (w) openByHan(w.han);
  });
  $("d-rel-more").addEventListener("click", () => { wordState = { ...wordState, limit: wordState.limit + 36 }; renderWords(); });
  $("d-decomp").addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const p = t.closest<HTMLButtonElement>("[data-part]");
    if (p) { openByHan(p.dataset.part!); return; }
    if (t.closest("[data-mnemo]")) {
      const ch = strokeChar;
      const w = await wordByHan(ch);
      openWordEditor(w, () => renderDecomp(ch));
    }
  });
  $("d-chars").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-c]");
    if (!b) return;
    strokeChar = b.dataset.c!;
    renderStrokes();
  });
  $("d-anim").addEventListener("click", () => {
    if (!writer) return;
    try { writer.cancelQuiz(); } catch { /* */ }
    writer.showOutline();
    writer.animateCharacter();
  });
  $("d-try").addEventListener("click", () => {
    if (!writer) return;
    writer.hideCharacter();
    writer.showOutline();
    writer.quiz();
  });
  $("d-say").addEventListener("click", () => word && say(word.han));
  $("d-back").addEventListener("click", () => {
    const prev = trail.pop();
    if (prev && findWord(prev)) openEntry(prev); else { trail.length = 0; show("words"); }
  });
  $("d-todeck").addEventListener("click", () => word && openAddToDeck(word, () => word && renderHead(word)));
  // «В тетрадь» — в колоду «Мои прописи»; без пиньиня или значения — через обычное «В колоду», там их можно вписать
  $("d-tobook").addEventListener("click", async () => {
    const w = word;
    if (!w) return;
    if (!w.py || !w.ru) { openAddToDeck(w, () => renderHead(w)); return; }
    const added = await toggleBookWord([w.han, w.py, w.ru]);
    $("d-tobook").textContent = added ? "✓ В тетради" : "+ В тетрадь";
  });
  $("d-edit").addEventListener("click", () => {
    const w = word;
    if (!w) return;
    openWordEditor(w, () => { refreshOther(w.id); const x = findWord(w.id); if (x) { word = x; renderHead(x); } }, (w as OtherWord).base);
  });
}
