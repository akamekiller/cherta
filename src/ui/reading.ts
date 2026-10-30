/**
 * Чтение: короткие тексты по уровню (data/texts.json, написаны для приложения).
 * Тап по слову — пиньинь, значение, «Статья», «+ В колоду». Пиньинь и перевод включаются кнопками,
 * текст читается голосом целиком или по предложениям, в конце — вопросы на понимание.
 */
import { setOpen } from "./motion.ts";
import { hskLookup, deckById, app, dictIndex, appLang } from "../state.ts";
import { segment, isWordTok, jaTokens, plainJa } from "../core/exercise.ts";
import { findJ, type JIndex } from "../core/jdict.ts";
import { loadJDict, jWordAt } from "./lookup.ts";
import { parseRef } from "../core/pinyin.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { say, sayAll, stopSpeech } from "../speech.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { onShow, onLeave, show } from "./nav.ts";
import { openImport } from "./import.ts";
import { openEntry } from "./entry.ts";
import { wordByHan } from "./lookup.ts";
import { openAddToDeck } from "./editor.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import * as store from "../store.ts";
import { emptyLib, inLib, segmentJa, jaStem, type ReadText, type ReadLib } from "../core/reading.ts";

type Text = ReadText;

/** Вид (пиньинь, перевод) и свёрнутые уровни — только на этом устройстве. Библиотека и результаты — meta `reading`. */
const LS = "cherta.read";
const ui = { py: true, ru: false, fold: {} as Record<string, boolean>, done: undefined as Record<string, number> | undefined };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { const { done: _d, ...rest } = ui; localStorage.setItem(LS, JSON.stringify(rest)); } catch { /* */ } };

let lib: ReadLib = emptyLib();
async function loadLib() {
  lib = { ...emptyLib(), ...((await store.getMeta<ReadLib>("reading")) ?? {}) };
  // раньше результаты хранились в localStorage — переносим один раз
  if (ui.done) { for (const [k, v] of Object.entries(ui.done)) lib.done[k] = Math.max(v, lib.done[k] ?? 0); ui.done = undefined; save(); await saveLib(); }
}
const saveLib = () => store.setMeta("reading", lib);
const langOf = (t: Text) => t.lang ?? "zh";
const mine = (): Text[] => [...builtin.filter((t) => inLib(lib, t.id)), ...lib.own.filter((t) => langOf(t) === appLang())];

let builtin: Text[] = [];
const builtins: Record<string, Text[]> = {};
/* японский: словарь WARODAI — слова для деления обычного текста и чтения для фуриганы */
let jx: JIndex | null = null;
const jwords = new Map<string, string>();
const jstems = new Map<string, string>();
function buildJLex(x: JIndex) {
  if (jwords.size) return;
  // индекс отсортирован по важности (N5, N4, частые) — первое чтение написания самое вероятное
  for (let i = 0; i < x.id.length; i++) {
    const first = x.kana[i].split(", ")[0];
    for (const w of x.kanji[i] ? x.kanji[i].split("･") : []) {
      if (!jwords.has(w)) jwords.set(w, first);
      const st = x.tag[i] ? jaStem(w, first) : null;
      if (st && !jstems.has(st[0])) jstems.set(st[0], st[1]);
    }
    // слова каной — только частые, иначе обычный текст режется на случайные редкие слова
    if (x.tag[i]) for (const k of x.kana[i].split(", ")) if (!jwords.has(k)) jwords.set(k, k);
  }
}
let texts: Text[] = [];
let cur: Text | null = null;
let answers: (number | null)[] = [];
let hsk: ((h: string) => { py: string; ru: string } | undefined) | null = null;
const lex = new Set<string>();
let dict: DictIndex | null = null;
const extraPy = new Map<string, string>();

async function ensure() {
  const lang = appLang();
  builtins[lang] ??= await (await fetch(lang === "ja" ? "data/texts-ja.json" : "data/texts.json")).json();
  builtin = builtins[lang];
  await loadLib();
  texts = mine();
  if (cur && langOf(cur) !== lang) cur = null;
}

/**
 * Словари для деления текста на слова и пиньиня — только когда открывают сам текст:
 * список текстов показывается сразу, а индекс словаря (8 МБ) не качается без нужды.
 */
async function ensureLex() {
  if (appLang() === "ja") {
    if (!jx) loadJDict().then((x) => { jx = x; buildJLex(x); if (cur) renderText(); }).catch(() => {});
    return;
  }
  if (!hsk) {
    hsk = await hskLookup();
    for (const d of app.builtinDecks) if (/^hsk[23]-/.test(d.id)) for (const w of (await deckById(d.id)).words) lex.add(w.han);
  }
  if (!dict) dictIndex().then((d) => { dict = d; for (const w of d.han) if (w.length <= 4) lex.add(w); if (cur) renderText(); }).catch(() => {});
}
/** Открыть текст: сначала словари (быстро — HSK уже в памяти после первого раза), потом показ. */
async function openText() {
  if (!cur) return;
  try { await ensureLex(); } catch { /* без словаря текст делится по знакам */ }
  if (cur) renderText();
}

function pyOf(w: string): string {
  let p = extraPy.get(w) ?? hsk?.(w)?.py ?? "";
  if (!p && dict) { const i = dict.han.indexOf(w); if (i >= 0) p = dictPyToNumeric(dict.py[i], w) ?? ""; }
  try { return p ? pinyinHTML(parseRef(p)) : ""; } catch { return ""; }
}

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

const isJa = () => appLang() === "ja";
const lvlName = (lv: number) => (!lv ? "Без уровня" : isJa() ? `JLPT N${lv}` : `Уровень ${lv} · HSK ${lv}`);
/** Порядок уровней: китайский — HSK 1, 2…; японский — N5, N4… */
const lvlKey = (lv: number) => (!lv ? 99 : isJa() ? 10 - lv : lv);
const TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`;

function renderList() {
  $("rd-list").hidden = false;
  $("rd-text").hidden = true;
  texts = mine();
  const tools = `<div class="tools"><button class="btn small primary" id="rd-cat">Добавить из готовых</button><button class="btn small" id="rd-file">Вставить или загрузить свой</button></div>`;
  if (!texts.length) {
    $("rd-list").innerHTML = `<div class="empty-start"><span class="han-big" aria-hidden="true">${isJa() ? "読" : "读"}</span><h2>Текстов пока нет</h2>
      <p class="hint">Добавьте готовые тексты по своему уровню или загрузите свои.</p></div>${tools}`;
    return;
  }
  // свои тексты из одного файла (учебника) — отдельным набором; остальные — по уровням
  const sets = [...new Set(texts.map(setOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  const rest = texts.filter((t) => !setOf(t));
  const levels = [...new Set(rest.map((t) => t.level))].sort((x, y) => lvlKey(x) - lvlKey(y));
  const groups = [
    ...sets.map((s) => ({ key: `set:${s}`, title: s, list: texts.filter((t) => setOf(t) === s) })),
    ...levels.map((lv) => ({ key: `lv${lv}`, title: lvlName(lv), list: rest.filter((t) => t.level === lv) })),
  ];
  groupIds.clear();
  const unread = groups.find((g) => g.list.some((t) => lib.done[t.id] === undefined))?.key;
  const row = (t: Text) => `<div class="pick-row"><button class="deck-opt" data-text="${esc(t.id)}"><span>${esc(shortTitle(t))}<small>${t.lines.length} ${plural(t.lines.length, "предложение", "предложения", "предложений")}${t.words.length ? ` · новых слов: ${t.words.length}` : ""}${t.id.startsWith("o-") && !setOf(t) ? " · свой" : ""}</small></span>${lib.done[t.id] !== undefined ? `<span class="pick-btn on">✓</span>` : ""}</button><button class="pick-eye" data-rdel="${esc(t.id)}" aria-label="Убрать «${esc(t.title)}»">${TRASH}</button></div>`;
  $("rd-list").innerHTML = tools + groups.map((g) => {
    groupIds.set(g.key, { title: g.title, ids: g.list.map((t) => t.id) });
    const read = g.list.filter((t) => lib.done[t.id] !== undefined).length;
    const open = ui.fold[g.key] ?? (groups.length <= 2 || g.key === unread);
    return `<div class="rd-ghead"><button class="fold-head" data-rfold="${esc(g.key)}" aria-expanded="${open}"><span>${esc(g.title)}</span><small>${read}/${g.list.length}</small>${CHEV}</button><button class="pick-eye" data-rgdel="${esc(g.key)}" aria-label="Убрать все тексты: ${esc(g.title)}">${TRASH}</button></div>
      <div class="deck-list" ${open ? "" : "hidden"}>${g.list.map(row).join("")}</div>`;
  }).join("") + `<div class="confirm" id="rd-confirm" hidden></div>`;
}

/** Каталог готовых текстов: по уровням, «+» — добавить, «Добавить все» на уровень. */
function openCatalog() {
  const levels = [...new Set(builtin.map((t) => t.level))].sort((x, y) => lvlKey(x) - lvlKey(y));
  const row = (t: Text) => `<button class="deck-opt" data-cadd="${esc(t.id)}" aria-pressed="${inLib(lib, t.id)}"><span>${esc(t.title)}<small>${t.lines.length} ${plural(t.lines.length, "предложение", "предложения", "предложений")}${t.q.length ? ` · вопросов: ${t.q.length}` : ""}</small></span><span class="pick-btn ${inLib(lib, t.id) ? "on" : ""}">${inLib(lib, t.id) ? "✓" : "+"}</span></button>`;
  const body = (isJa()
    ? `<p class="hint">Тексты написаны для приложения: кандзи — из слов колод JLPT этого уровня и проще, у всех слов есть фуригана; новые слова — с переводом.</p>`
    : `<p class="hint">Тексты написаны для приложения: в тексте уровня N только слова HSK 1…N (старый стандарт, как в учебниках) и несколько новых слов с переводом.</p>`)
    + levels.map((lv) => {
      const list = builtin.filter((t) => t.level === lv);
      return `<div class="cat-lv"><h3 class="grp-title"><span>${esc(lvlName(lv))}</span><button class="btn small" data-call="${lv}">Добавить все</button></h3><div class="deck-list">${list.map(row).join("")}</div></div>`;
    }).join("") + `<button class="btn primary wide" id="rc-ok">Готово</button>`;
  openSheet("Готовые тексты", `<div class="pick-decks">${body}</div>`, (root) => {
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("#rc-ok")) { closeSheet(); return; }
      const all = t.closest<HTMLButtonElement>("[data-call]");
      const one = t.closest<HTMLButtonElement>("[data-cadd]");
      if (!all && !one) return;
      const ids = all ? builtin.filter((x) => x.level === Number(all.dataset.call)).map((x) => x.id) : [one!.dataset.cadd!];
      const on = all ? true : !inLib(lib, ids[0]);
      for (const id of ids) lib.lib[id] = on ? Date.now() : -Date.now();
      await saveLib();
      for (const id of ids) {
        const b = root.querySelector<HTMLElement>(`[data-cadd="${CSS.escape(id)}"]`);
        if (b) b.outerHTML = row(builtin.find((x) => x.id === id)!);
      }
      renderList();
    });
  }, () => renderList());
}

/** Добавить свои тексты в библиотеку (из окна импорта). */
export async function addOwnTexts(list: Text[]) {
  await ensure();
  for (const t of list) { lib.own.push(t); lib.lib[t.id] = Date.now(); }
  await saveLib();
  texts = mine();
  if (!$("read").hidden) renderList();
}

/** Открыть свой текст в «Чтении». */
let wantId: string | null = null;
export function openOwnText(id: string) {
  wantId = id;
  cur = null;
  show("read");
}

async function removeText(id: string) { await removeTexts([id]); }
async function removeTexts(ids: string[]) {
  const del = new Set(ids);
  for (const id of ids) lib.lib[id] = -Date.now();
  lib.own = lib.own.filter((t) => !del.has(t.id));
  await saveLib();
  renderList();
}

/** Набор своего текста: из файла (`set`) или из начала названия «HSK 1 · Урок 1…» у текстов, загруженных раньше. */
function setOf(t: Text): string {
  if (!t.id.startsWith("o-")) return "";
  if (t.set) return t.set;
  const m = t.title.match(/^(.+?) · /);
  return m && !/^урок/i.test(m[1]) ? m[1] : "";
}
/** В наборе «HSK 1» название «HSK 1 · Урок 1. …» показывается без повтора набора. */
const shortTitle = (t: Text) => { const s = setOf(t); return s && t.title.startsWith(`${s} · `) ? t.title.slice(s.length + 3) : t.title; };
/** Подтверждение — сразу под строкой, на которую нажали (а не в конце длинного списка). */
const confirmAt = (el: HTMLElement) => { const c = $("rd-confirm"); (el.closest(".rd-ghead, .pick-row") ?? el).after(c); return c; };
const groupIds = new Map<string, { title: string; ids: string[] }>();

const KANJI = /[\p{Script=Han}々]/u;
function tok(t: string, rd?: string) {
  if (!isWordTok(t)) return `<span class="p">${esc(t)}</span>`;
  if (rd !== undefined) {
    // японский: фуригана только у слов с кандзи
    const f = ui.py && KANJI.test(t) && rd && rd !== t ? `<small class="py" lang="ja">${esc(rd)}</small>` : ui.py ? `<small class="py"> </small>` : "";
    return `<button class="w" data-w="${esc(t)}" data-r="${esc(rd)}">${f}<span lang="ja">${esc(t)}</span></button>`;
  }
  return `<button class="w" data-w="${esc(t)}">${ui.py ? `<small class="py">${pyOf(t)}</small>` : ""}<span>${esc(t)}</span></button>`;
}
/** Японская строка → слова и чтения: размеченная (пробелы, [чтение]) или обычная (делится по словарю). */
function jaLine(line: string): { t: string[]; r: string[] } {
  if (/\s|\[/.test(line.trim())) return jaTokens(line);
  const x = segmentJa(line, { word: (w) => extraPy.get(w) ?? jwords.get(w), stem: (st) => jstems.get(st) });
  // у одиночного кандзи чтение из словаря часто не то (食 — しょく), фуригану не показываем
  return { t: x.t, r: x.r.map((r, k) => ([...x.t[k]].length === 1 && KANJI.test(x.t[k]) && !extraPy.has(x.t[k]) ? "" : r)) };
}
const plainLine = (t: Text, raw: string) => (t.lang === "ja" ? plainJa(raw) : raw);

function renderText() {
  const t = cur;
  if (!t) return;
  $("rd-list").hidden = true;
  $("rd-text").hidden = false;
  $("rd-py").setAttribute("aria-pressed", String(ui.py));
  $("rd-ru").setAttribute("aria-pressed", String(ui.ru));
  $("rd-py").textContent = t.lang === "ja" ? "ふりがな" : "Пиньинь";
  $("rd-head").innerHTML = `<h2 class="deck-name">${esc(t.title)}</h2><div class="row wrap"><p class="hint">${t.level ? (t.lang === "ja" ? `JLPT N${t.level}` : `Уровень ${t.level}`) : "Без уровня"}</p><button class="btn small" id="rd-towords">Слова текста → в карточки</button></div>`
    + (t.words.length ? `<div class="rd-new"><span class="label">Новые слова</span>${t.words.map(([h, py, ru]) => `<div><b ${t.lang === "ja" ? 'lang="ja"' : ""}>${esc(h)}</b> <span class="py" ${t.lang === "ja" ? 'lang="ja"' : ""}>${t.lang === "ja" ? esc(py) : (() => { try { return pinyinHTML(parseRef(py)); } catch { return esc(py); } })()}</span> — ${esc(ru)}</div>`).join("")}</div>` : "");
  const has = (w: string) => lex.has(w) || extraPy.has(w);
  // знак препинания держится со словом перед ним, чтобы «。» не переносилось на новую строку
  const units = (zh: string) => {
    const out: string[] = [];
    const ja = t.lang === "ja" ? jaLine(zh) : null;
    const list = ja ? ja.t : segment(zh, has, 4);
    list.forEach((x, k) => {
      const html = tok(x, ja ? ja.r[k] : undefined);
      if (!isWordTok(x) && out.length) out[out.length - 1] = out[out.length - 1].replace(/<\/span>$/, `${html}</span>`);
      else out.push(`<span class="u">${html}</span>`);
    });
    return out.join("");
  };
  $("rd-body").innerHTML = t.lines.map(([zh, ru], i) => `<div class="rd-line"><div class="rd-zh" ${t.lang === "ja" ? 'lang="ja"' : ""}>${units(zh)}</div><button class="icon-btn small-ic" data-line="${i}" aria-label="Послушать">${PLAY}</button>${ui.ru ? `<div class="rd-tr">${esc(ru)}</div>` : ""}</div>`).join("");
  const done = lib.done[t.id];
  $("rd-q").innerHTML = t.q.length ? `<h3 class="grp-title"><span>Вопросы</span></h3>${t.q.map((q, i) => `<div class="q"><div class="q-t">${esc(q.q)}</div><div class="q-o">${q.o.map((o, j) => `<button class="chip-btn" data-q="${i}" data-o="${j}" aria-pressed="false">${esc(o)}</button>`).join("")}</div></div>`).join("")}
    <button class="btn primary wide" id="rd-check" disabled>Проверить</button><div id="rd-res"></div>` : `<button class="btn primary wide" id="rd-check">Прочитал</button>`;
  if (done !== undefined) $("rd-res")?.insertAdjacentHTML("beforeend", `<p class="hint">Уже прочитано: ${Math.round(done * 100)}% верных ответов.</p>`);
  answers = t.q.map(() => null);
}

/** Японское слово: чтение из текста, значение и статья — WARODAI. */
async function glossJa(w: string, r: string) {
  const box = $("rd-gloss");
  let ru = cur?.words.find((x) => x[0] === w)?.[2] ?? "";
  let jw: ReturnType<typeof jWordAt> | null = null;
  try {
    const x = jx ?? (jx = await loadJDict());
    const i = findJ(x, w, r || undefined)[0];
    if (i !== undefined) { jw = jWordAt(x, i); ru ||= x.ru[i]; r ||= x.kana[i].split(", ")[0]; }
  } catch { /* словарь не загрузился */ }
  box.innerHTML = `<div class="g-head"><b lang="ja">${esc(w)}</b> <span class="py" lang="ja">${r && r !== w ? esc(r) : ""}</span><button class="icon-btn small-ic" data-say aria-label="Послушать">${PLAY}</button></div><div class="g-ru">${esc(ru || "—")}</div>
    <div class="g-act">${jw ? `<button class="btn small" data-open>Статья</button><button class="btn small" data-add>+ В колоду</button>` : ""}</div>`;
  box.hidden = false;
  box.querySelector("[data-say]")!.addEventListener("click", () => say(w, 0.9, "ja"));
  if (jw) {
    const word = jw;
    box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true, (word as { jid?: string }).jid));
    box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
  }
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function gloss(w: string) {
  const box = $("rd-gloss");
  const word = await wordByHan(w);
  box.innerHTML = `<div class="g-head"><b>${esc(w)}</b> <span class="py">${word.ref.length ? pinyinHTML(word.ref) : ""}</span><button class="icon-btn small-ic" data-say="${esc(w)}" aria-label="Послушать">${PLAY}</button></div><div class="g-ru">${esc(word.ru || "—")}</div>
    <div class="g-act"><button class="btn small" data-open>Статья</button><button class="btn small" data-add>+ В колоду</button></div>`;
  box.hidden = false;
  box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true));
  box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
  box.querySelector("[data-say]")!.addEventListener("click", () => say(w));
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function check() {
  const t = cur;
  if (!t) return;
  let good = 0;
  t.q.forEach((q, i) => {
    if (answers[i] === q.a) good++;
    document.querySelectorAll<HTMLButtonElement>(`#rd-q [data-q="${i}"]`).forEach((b) => {
      const j = Number(b.dataset.o);
      b.classList.toggle("right", j === q.a);
      b.classList.toggle("wrong", j === answers[i] && j !== q.a);
      b.disabled = true;
    });
  });
  const score = t.q.length ? good / t.q.length : 1;
  lib.done[t.id] = Math.max(lib.done[t.id] ?? 0, score);
  void saveLib();
  $<HTMLButtonElement>("rd-check").disabled = true;
  const res = document.getElementById("rd-res");
  if (res) res.innerHTML = `<div class="chip ${score === 1 ? "ok" : score ? "mid" : "no"}">Верно ${good} из ${t.q.length}</div>`;
  else renderList();
}

export function initReading() {
  $("rd-head").addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("#rd-towords") || !cur) return;
    if (cur.lang !== "ja") { openImport({ mode: "cards", text: cur.lines.map((l) => l[0]).join("\n"), name: cur.title }); return; }
    // японский: слова с кандзи — «слово | чтение | значение» для импорта карточек
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const [line] of cur.lines) {
      const { t, r } = jaLine(line);
      t.forEach((w, k) => {
        if (!KANJI.test(w) || seen.has(w)) return;
        seen.add(w);
        const i = jx ? findJ(jx, w, r[k] || undefined)[0] : undefined;
        const ru = cur!.words.find((x) => x[0] === w)?.[2] || (i !== undefined ? jx!.ru[i] : "");
        rows.push(`${w} | ${r[k] || (i !== undefined ? jx!.kana[i].split(", ")[0] : "")} | ${ru}`);
      });
    }
    openImport({ mode: "cards", text: rows.join("\n"), name: cur.title });
  });
  onShow("read", async () => {
    $("rd-list").innerHTML = `<p class="hint">Загружаю…</p>`;
    try { await ensure(); } catch { $("rd-list").innerHTML = `<p class="hint">Тексты не загрузились.</p>`; return; }
    if (wantId) { cur = texts.find((t) => t.id === wantId) ?? null; wantId = null; if (cur) { extraPy.clear(); for (const [h, py] of cur.words) extraPy.set(h, py); } }
    if (cur) void openText(); else renderList();
  });
  onLeave("read", () => { stopSpeech(); });
  $("rd-list").addEventListener("click", (e) => {
    const t0 = e.target as HTMLElement;
    if (t0.closest("#rd-cat")) { openCatalog(); return; }
    if (t0.closest("#rd-file")) { openImport({ mode: "text" }); return; }
    const f = t0.closest<HTMLButtonElement>("[data-rfold]");
    if (f) {
      const open = f.getAttribute("aria-expanded") !== "true";
      f.setAttribute("aria-expanded", String(open));
      setOpen(f.closest(".rd-ghead")?.nextElementSibling as HTMLElement | null, open);
      ui.fold[f.dataset.rfold!] = open;
      save();
      return;
    }
    const gdel = t0.closest<HTMLButtonElement>("[data-rgdel]");
    if (gdel) {
      const g = groupIds.get(gdel.dataset.rgdel!);
      if (!g) return;
      const own = g.ids.filter((id) => id.startsWith("o-")).length;
      const n = g.ids.length;
      const what = `${n} ${plural(n, "текст", "текста", "текстов")}`;
      confirmInline(confirmAt(gdel), own === n ? `Удалить «${g.title}» — ${what}? Свои тексты удалятся совсем.`
        : own ? `Убрать «${g.title}» — ${what}? Свои удалятся, готовые можно вернуть в «Готовых».` : `Убрать «${g.title}» — ${what}? Вернуть можно в «Готовых».`,
        own ? "Удалить" : "Убрать", () => removeTexts(g.ids));
      $("rd-confirm").scrollIntoView({ block: "nearest" });
      return;
    }
    const del = t0.closest<HTMLButtonElement>("[data-rdel]");
    if (del) {
      const id = del.dataset.rdel!;
      const tt = texts.find((x) => x.id === id);
      confirmInline(confirmAt(del), id.startsWith("o-") ? `Удалить свой текст «${tt?.title ?? ""}»?` : `Убрать «${tt?.title ?? ""}» из списка? Вернуть можно в «Готовых».`, id.startsWith("o-") ? "Удалить" : "Убрать", () => removeText(id));
      $("rd-confirm").scrollIntoView({ block: "nearest" });
      return;
    }
    const b = t0.closest<HTMLButtonElement>("[data-text]");
    if (!b) return;
    cur = texts.find((t) => t.id === b.dataset.text) ?? null;
    extraPy.clear();
    for (const [h, py] of cur?.words ?? []) extraPy.set(h, py);
    $("rd-gloss").hidden = true;
    void openText().then(() => window.scrollTo(0, 0));
  });
  $("rd-back").addEventListener("click", () => { cur = null; stopSpeech(); renderList(); });
  $("rd-all").addEventListener("click", () => cur && sayAll(cur.lines.map((l) => plainLine(cur!, l[0])), 0.85, cur.lang === "ja" ? "ja" : undefined));
  $("rd-py").addEventListener("click", () => { ui.py = !ui.py; save(); renderText(); });
  $("rd-ru").addEventListener("click", () => { ui.ru = !ui.ru; save(); renderText(); });
  $("rd-body").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const w = t.closest<HTMLButtonElement>("[data-w]");
    if (w) { if (cur?.lang === "ja") glossJa(w.dataset.w!, w.dataset.r ?? ""); else gloss(w.dataset.w!); return; }
    const l = t.closest<HTMLButtonElement>("[data-line]");
    if (l && cur) say(plainLine(cur, cur.lines[Number(l.dataset.line)][0]), 0.85, cur.lang === "ja" ? "ja" : undefined);
  });
  $("rd-q").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#rd-check")) { check(); return; }
    const q = t.closest<HTMLButtonElement>("[data-q]");
    if (!q || q.disabled) return;
    const i = Number(q.dataset.q);
    answers[i] = Number(q.dataset.o);
    document.querySelectorAll<HTMLButtonElement>(`#rd-q [data-q="${i}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b === q)));
    $<HTMLButtonElement>("rd-check").disabled = answers.some((x) => x === null);
  });
}
