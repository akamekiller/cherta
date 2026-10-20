/**
 * Тетрадь прописей: один иероглиф — ряд клеток. Первые по бледному контуру, остальные по памяти,
 * каждая клетка проверяется. Плюс печать прописей на A4 (через окно печати браузера → «Сохранить как PDF»).
 */
import { app, hskLookup, dictIndex, loadThemes, deckBlocks } from "../state.ts";
import type { Block } from "../core/blocks.ts";
import type { Word } from "../core/deck.ts";
import { pickDeck, deckWords, deckTitle, setPickLabel } from "./deckpick.ts";
import { hashStr } from "../core/skills.ts";
import { uniqueChars, cellPlan, printRows, paginate, rowsPerPage, type PrintCell } from "../core/copybook.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { parseRef, toMarked } from "../core/pinyin.ts";
import { getChar, type StrokeLang } from "../strokes.ts";
import { scoreHandwriting, beautyLabel, type P } from "../core/beauty.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { createWriter, type Writer } from "./writer.ts";
import { onShow, onLeave } from "./nav.ts";
import { openSheet, closeSheet } from "./sheet.ts";

type Src = "deck" | "text";
const LS = "cherta.book";
type SetEdit = { skip: string[]; add: string };
const st = { v: 2, src: "deck" as Src, deckId: "", text: "", total: 10, trace: 3, pos: {} as Record<string, number>, shuffle: true, seed: "1",
  /** Правка набора колоды для тетради: какие иероглифы пропустить и какие добавить (колода не меняется). */
  sets: {} as Record<string, SetEdit>,
  /** Урок колоды (тема из «Уроков по словам»), который пишется в тетради: номер блока, -1 или нет — вся колода. */
  block: {} as Record<string, number>,
  print: { perRow: 10, traces: 3, rowsPerChar: 1, count: 12, labels: true, all: false } };
try {
  const saved = JSON.parse(localStorage.getItem(LS) ?? "{}");
  // v1: по умолчанию было 6 клеток (2 по контуру) — переводим на 10 (3), свои значения не трогаем
  if (!saved.v && saved.total === 6 && saved.trace === 2) { delete saved.total; delete saved.trace; }
  Object.assign(st, saved, { v: 2, print: { ...st.print, ...(saved.print ?? {}) } });
} catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch { /* */ } };

let writer: Writer | null = null;
let chars: string[] = [];
let idx = 0;
let cells: boolean[] = [];
let ci = 0;
let miss: number[] = [];
let scores: (number | null)[] = [];
let drawn: P[][] = [];
let gen = 0;

export const bookWriter = () => writer;

const key = () => (st.src === "deck" ? `deck:${st.deckId}` : "text");
/** «иероглифов» / у японских — «знаков» (в наборе есть кана). */
const unitWord = (n: number) => (bookLang() === "ja" ? plural(n, "знак", "знака", "знаков") : plural(n, "иероглиф", "иероглифа", "иероглифов"));
/** Чьи данные черт: японская колода — KanjiVG (японский порядок черт), свой текст — по выбранному языку приложения. */
const bookLang = (): StrokeLang => (st.src === "deck"
  ? (app.decks.find((d) => d.id === st.deckId)?.lang === "ja" ? "ja" : "zh")
  : (app.settings.lang === "ja" ? "ja" : "zh"));
/** Уроки текущей колоды (темы или по 20 слов) и выбранный урок. */
let blocks: Block[] = [];
const curBlock = () => { const b = st.block[key()]; return st.src === "deck" && b !== undefined && b >= 0 && b < blocks.length ? b : -1; };
/** Позиция запоминается отдельно для каждого урока. */
const posKey = () => key() + (curBlock() >= 0 ? `#${curBlock()}` : "");

/** Слова колоды-источника (для иероглифов, пиньиня и значения). */
let srcWords: Word[] = [];
const words = () => srcWords;

async function loadSource(): Promise<string[]> {
  if (st.src === "text") { srcWords = []; return uniqueChars([st.text]); }
  if (!st.deckId || !app.decks.some((d) => d.id === st.deckId)) st.deckId = app.deck?.id ?? app.decks[0]?.id ?? "";
  // колод нет — сразу «Свой текст», с примером, чтобы было что писать
  if (!st.deckId) { st.src = "text"; st.text ||= app.settings.lang === "ja" ? "日本語 ひらがな" : "你好 谢谢 中国"; save(); srcWords = []; return uniqueChars([st.text]); }
  return applySet(await deckBase());
}

/** Иероглифы колоды или выбранного урока — без правок набора. */
async function deckBase(): Promise<string[]> {
  const [deck] = await Promise.all([deckWords(st.deckId), loadThemes()]);
  srcWords = deck?.words ?? [];
  blocks = deck ? deckBlocks(deck) : [];
  if (blocks.length < 2) blocks = [];
  const b = curBlock();
  const ws = b >= 0 ? blocks[b].idx.map((i) => srcWords[i]) : srcWords;
  return uniqueChars(ws.map((w) => w.han));
}

/** Выбор урока колоды: вся колода или один урок (как «Уроки по словам» в карточках). */
function pickBlock() {
  const cur = curBlock();
  const n = (b: Block) => uniqueChars(b.idx.map((i) => srcWords[i]?.han ?? "")).length;
  const row = (b: Block, i: number) => `<button class="lesson-row ${i === cur ? "cur" : ""}" data-blk="${i}"><span class="ln">${i + 1}</span>
      <span class="lt"><b>${esc(b.title)}</b><small class="blk-prev">${esc(b.idx.slice(0, 8).map((k) => srcWords[k]?.han ?? "").join(" "))}${b.idx.length > 8 ? " …" : ""}</small>
      <small>${n(b)} ${unitWord(n(b))}</small></span></button>`;
  const secs: { name: string; idx: number[] }[] = [];
  blocks.forEach((b, i) => {
    if (!secs.length || secs[secs.length - 1].name !== b.section) secs.push({ name: b.section, idx: [] });
    secs[secs.length - 1].idx.push(i);
  });
  const all = uniqueChars(srcWords.map((w) => w.han)).length;
  openSheet(`Урок: ${deckTitle(st.deckId)}`, `<div class="stack">
      <div class="lesson-list"><button class="lesson-row ${cur < 0 ? "cur" : ""}" data-blk="-1"><span class="ln">∞</span><span class="lt"><b>Вся колода</b><small>${all} ${unitWord(all)}</small></span></button></div>
      ${secs.map((sec) => {
        const open = secs.length === 1 || sec.idx.includes(cur) || (cur < 0 && sec === secs[0]);
        return `<details class="bk-sec" ${open ? "open" : ""}>${sec.name ? `<summary>${esc(sec.name)} <small>${sec.idx.length}</small></summary>` : ""}<div class="lesson-list">${sec.idx.map((i) => row(blocks[i], i)).join("")}</div></details>`;
      }).join("")}
    </div>`, (root) => {
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-blk]");
      if (!b) return;
      const v = Number(b.dataset.blk);
      if (v < 0) delete st.block[key()]; else st.block[key()] = v;
      save();
      closeSheet();
      void render();
    });
  });
}

/** Набор колоды с правками: без пропущенных, плюс добавленные. */
function applySet(base: string[]): string[] {
  const e = st.sets[key()];
  return e ? applySet0(base, e) : base;
}

/** Посмотреть и изменить набор: тап по иероглифу — убрать/вернуть, поле — добавить свои. */
async function openSetEditor() {
  const base = await deckBase();
  const k = key();
  const e: SetEdit = { skip: [...(st.sets[k]?.skip ?? [])], add: st.sets[k]?.add ?? "" };
  const draw = (root: HTMLElement) => {
    const skip = new Set(e.skip);
    const n = applySet0(base, e).length;
    root.querySelector("#bs-n")!.textContent = `В тетради: ${n} ${unitWord(n)}${e.skip.length ? ` · убрано ${e.skip.length}` : ""}`;
    root.querySelector("#bs-chars")!.innerHTML = base.map((c) => `<button data-ch="${esc(c)}" aria-pressed="${!skip.has(c)}">${esc(c)}</button>`).join("");
  };
  openSheet(`Набор: ${deckTitle(st.deckId)}`, `<div class="stack">
      <p class="hint" id="bs-n"></p>
      <p class="hint">Нажмите на иероглиф, чтобы убрать его из тетради (или вернуть). Колода при этом не меняется.</p>
      <div class="peek-chars" id="bs-chars"></div>
      <label class="field"><span class="label">Добавить свои иероглифы</span><input id="bs-add" value="${esc(e.add)}" placeholder="Например: 机床 车间" autocomplete="off"></label>
      <div class="row"><button class="btn" id="bs-none">Убрать все</button><button class="btn" id="bs-all">Вернуть все</button></div>
      <button class="btn primary wide" id="bs-ok">Готово</button>
    </div>`, (root) => {
    draw(root);
    root.querySelector("#bs-chars")!.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-ch]");
      if (!b) return;
      const c = b.dataset.ch!;
      e.skip = e.skip.includes(c) ? e.skip.filter((x) => x !== c) : [...e.skip, c];
      draw(root);
    });
    root.querySelector<HTMLInputElement>("#bs-add")!.addEventListener("input", (ev) => { e.add = (ev.target as HTMLInputElement).value; draw(root); });
    root.querySelector("#bs-none")!.addEventListener("click", () => { e.skip = [...base]; draw(root); });
    root.querySelector("#bs-all")!.addEventListener("click", () => { e.skip = []; draw(root); });
    root.querySelector("#bs-ok")!.addEventListener("click", () => {
      if (e.skip.length || e.add.trim()) st.sets[k] = { skip: e.skip, add: e.add.trim() }; else delete st.sets[k];
      st.pos[posKey()] = 0;
      save();
      closeSheet();
      render();
    });
  });
}
const applySet0 = (base: string[], e: SetEdit) => { const skip = new Set(e.skip); return uniqueChars([base.filter((c) => !skip.has(c)).join(""), e.add]); };

/** Открыть тетрадь с выбранной колодой (из меню колоды и после «+ В тетрадь»). */
export function useBookDeck(id: string, block?: number) {
  st.src = "deck";
  st.deckId = id;
  if (block !== undefined) st.block[`deck:${id}`] = block;
  save();
}

/* ---------- сведения об иероглифе: пиньинь и значение ---------- */

let lookup: ((h: string) => { py: string; ru: string } | undefined) | null = null;
let dict: DictIndex | null = null;
async function charInfo(ch: string): Promise<{ py: string; ru: string; ja?: boolean } | null> {
  const fromDeck = words().find((w) => w.han === ch);
  if (bookLang() === "ja") {
    // японский: китайские пиньинь и значения не к месту — знак как слово колоды или слова колоды с этим знаком
    if (fromDeck) return { py: fromDeck.py.split("/")[0], ru: fromDeck.ru, ja: true };
    const ws = words().filter((w) => w.han.includes(ch)).slice(0, 3);
    return ws.length ? { py: "", ru: `в словах: ${ws.map((w) => `${w.han} (${w.py.split("/")[0]})`).join(", ")}`, ja: true } : null;
  }
  lookup ??= await hskLookup();
  if (fromDeck) return { py: fromDeck.py, ru: fromDeck.ru };
  const h = lookup(ch);
  if (h) return h;
  try { dict ??= await dictIndex(); } catch { return null; }
  const i = dict.han.indexOf(ch);
  if (i < 0) return null;
  return { py: dictPyToNumeric(dict.py[i], ch) ?? "", ru: dict.ru[i] };
}

/* ---------- упражнение ---------- */

async function render() {
  const my = ++gen;
  const list = await loadSource();
  if (my !== gen) return;
  // колода — вперемешку (порядок постоянный, пока не нажать «Перемешать»), свой текст — как написан
  chars = st.shuffle && st.src === "deck" ? [...list].sort((a, b) => hashStr(st.seed + a) - hashStr(st.seed + b)) : list;
  setPickLabel("bk-src", st.src === "text" ? "Свой текст" : deckTitle(st.deckId));
  $("bk-text-field").hidden = st.src !== "text";
  const bb = $("bk-block");
  bb.hidden = st.src !== "deck" || !blocks.length;
  if (!bb.hidden) {
    const b = curBlock();
    bb.innerHTML = `<span>${b >= 0 ? `Урок ${b + 1}. ${esc(blocks[b].title)}` : `Вся колода · ${blocks.length} ${plural(blocks.length, "урок", "урока", "уроков")}`}</span><b>Выбрать урок</b>`;
  }
  const bs = $("bk-set");
  bs.hidden = st.src !== "deck";
  if (st.src === "deck") {
    const ed = st.sets[key()];
    bs.innerHTML = `<span>Набор: ${chars.length} ${unitWord(chars.length)}${ed ? " (изменён)" : ""}</span><b>Посмотреть и изменить</b>`;
  }
  $<HTMLInputElement>("bk-text").value = st.text;
  const empty = !chars.length;
  for (const id of ["bk-pad", "bk-strip"]) $(id).hidden = empty;
  $("bk-anim").toggleAttribute("disabled", empty);
  $("bk-again").toggleAttribute("disabled", empty);
  if (empty) {
    stop();
    $("bk-han").textContent = "";
    $("bk-py").innerHTML = "";
    $("bk-ru").textContent = "";
    $("bk-status").textContent = st.src === "text" ? "Впишите иероглифы или слова — по ним будут прописи." : st.sets[key()] ? "Все иероглифы убраны из набора — откройте «Набор» и верните нужные." : "В колоде нет слов. Добавьте их кнопкой «+ В тетрадь» в карточке слова или выберите другую колоду.";
    return;
  }
  idx = Math.max(0, Math.min(chars.length - 1, st.pos[posKey()] ?? 0));
  startChar();
}

async function startChar() {
  const ch = chars[idx];
  const my = ++gen;
  st.pos[posKey()] = idx;
  save();
  $("bk-han").textContent = ch;
  $("bk-py").innerHTML = "";
  $("bk-ru").textContent = "";
  $("bk-prev").toggleAttribute("disabled", idx === 0);
  $("bk-next").toggleAttribute("disabled", idx >= chars.length - 1);
  cells = cellPlan(st.total, st.trace);
  miss = cells.map(() => 0);
  scores = cells.map(() => null);
  ci = 0;
  renderStrip();
  startCell();
  const info = await charInfo(ch);
  if (my !== gen || !info) return;
  if (info.ja) $("bk-py").innerHTML = info.py && info.py !== ch ? `<span class="kana" lang="ja">${esc(info.py)}</span>` : "";
  else try { $("bk-py").innerHTML = info.py ? pinyinHTML(parseRef(info.py)) : ""; } catch { /* */ }
  $("bk-ru").textContent = info.ru;
}

function renderStrip() {
  const ch = chars[idx];
  $("bk-strip").innerHTML = cells.map((outline, i) => {
    const done = i < ci;
    const cls = done ? (miss[i] ? "done bad" : "done ok") : i === ci ? "cur" : outline ? "trace" : "";
    const sc = scores[i];
    return `<span class="bk-cell ${cls}" title="${outline ? "по контуру" : "по памяти"}${sc !== null ? ` · почерк ${sc}` : ""}">${done || outline ? esc(ch) : ""}${sc !== null ? `<small>${sc}</small>` : ""}</span>`;
  }).join("");
  $("bk-status").textContent = ci < cells.length
    ? `Клетка ${ci + 1} из ${cells.length}: ${cells[ci] ? "по контуру" : "по памяти"} · ${idx + 1} из ${chars.length}`
    : summary();
}

function summary(): string {
  const clean = miss.filter((m) => !m).length;
  const sc = scores.filter((x): x is number => x !== null);
  const avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
  return `${avg !== null ? `Почерк в среднем: ${avg} — ${beautyLabel(avg)}. ` : ""}Готово: ${clean} из ${cells.length} ${plural(cells.length, "клетки", "клеток", "клеток")} без ошибок. ${idx < chars.length - 1 ? "Дальше — следующий иероглиф." : "Это последний иероглиф."}`;
}

function stop() { try { writer?.cancelQuiz(); } catch { /* */ } }

function startCell() {
  stop();
  if (ci >= cells.length) return;
  const my = gen, i = ci;
  writer = createWriter($("bk-hw"), chars[idx], { showOutline: cells[i] }, bookLang());
  drawn = [];
  writer.quiz({
    onCorrectStroke: (d: { strokeNum: number; drawnPath: { points: P[] } }) => { drawn[d.strokeNum] = d.drawnPath.points.map((p) => ({ x: p.x, y: p.y })); },
    onMistake: () => {
      miss[i]++;
      if (app.settings.vibrate) try { navigator.vibrate?.(35); } catch { /* */ }
      const pad = $("bk-pad");
      pad.classList.add("miss");
      setTimeout(() => pad.classList.remove("miss"), 280);
    },
    onComplete: () => setTimeout(() => {
      if (my !== gen || ci !== i) return;
      const mine = drawn.filter(Boolean);
      getChar(chars[idx], bookLang()).then((data) => {
        if (my !== gen || !data || !mine.length) return;
        scores[i] = scoreHandwriting(mine, data.medians).score;
        renderStrip();
      }).catch(() => {});
      ci++;
      renderStrip();
      if (ci < cells.length) startCell();
      else if (idx < chars.length - 1) setTimeout(() => { if (my === gen) { idx++; startChar(); } }, 1400);
    }, 350),
  });
}

/* ---------- настройки ---------- */

function openOptions() {
  const body = `
    <div class="set-row dm-row"><div class="t"><div>Клеток на иероглиф</div><div>Сколько раз написать</div></div>
      <div class="stepper"><button class="icon-btn" data-k="total" data-d="-1" aria-label="Меньше">−</button><output id="bo-total">${st.total}</output><button class="icon-btn" data-k="total" data-d="1" aria-label="Больше">+</button></div></div>
    <div class="set-row"><div class="t"><div>Из них по контуру</div><div>Остальные — по памяти</div></div>
      <div class="stepper"><button class="icon-btn" data-k="trace" data-d="-1" aria-label="Меньше">−</button><output id="bo-trace">${st.trace}</output><button class="icon-btn" data-k="trace" data-d="1" aria-label="Больше">+</button></div></div>
    <div class="field"><span class="label">Порядок иероглифов колоды</span>
      <div class="seg wide-seg" role="group" id="bo-order"><button data-shuffle="1" aria-pressed="${st.shuffle}">Вперемешку</button><button data-shuffle="0" aria-pressed="${!st.shuffle}">По порядку</button></div>
      <button class="link-btn" id="bo-reshuffle">Перемешать заново</button></div>
    <button class="btn primary wide" id="bo-done">Готово</button>`;
  let reordered = false;
  openSheet("Прописи", body, (root) => {
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-k]");
      if (b) {
        const k = b.dataset.k as "total" | "trace";
        st[k] = Math.max(k === "total" ? 1 : 0, Math.min(k === "total" ? 16 : st.total, st[k] + Number(b.dataset.d)));
        if (st.trace > st.total) st.trace = st.total;
        root.querySelector("#bo-total")!.textContent = String(st.total);
        root.querySelector("#bo-trace")!.textContent = String(st.trace);
        save();
      }
      const sh = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-shuffle]");
      if (sh) {
        st.shuffle = sh.dataset.shuffle === "1"; st.pos[posKey()] = 0; save();
        root.querySelectorAll("[data-shuffle]").forEach((x) => x.setAttribute("aria-pressed", String(x === sh)));
        reordered = true;
      }
      if ((e.target as HTMLElement).closest("#bo-reshuffle")) {
        st.shuffle = true; st.seed = String(Date.now()); st.pos[posKey()] = 0; save();
        root.querySelectorAll("[data-shuffle]").forEach((x) => x.setAttribute("aria-pressed", String((x as HTMLElement).dataset.shuffle === "1")));
        reordered = true;
      }
      if ((e.target as HTMLElement).closest("#bo-done")) { closeSheet(); if (reordered) render(); else if (chars.length) startChar(); }
    });
  });
}

/* ---------- печать ---------- */

function openPrint() {
  const p = st.print;
  const body = `
    <div class="seg wide-seg" role="group" aria-label="Какие иероглифы"><button data-all="0" aria-pressed="${!p.all}">С текущего</button><button data-all="1" aria-pressed="${p.all}">Все (${chars.length})</button></div>
    <div class="set-row dm-row" id="pr-count-row" ${p.all ? "hidden" : ""}><div class="t"><div>Сколько иероглифов</div><div>Начиная с «${esc(chars[idx] ?? "")}»</div></div>
      <div class="stepper"><button class="icon-btn" data-k="count" data-d="-1">−</button><output id="pr-count">${p.count}</output><button class="icon-btn" data-k="count" data-d="1">+</button></div></div>
    <div class="set-row"><div class="t"><div>Клеток в строке</div></div>
      <div class="stepper"><button class="icon-btn" data-k="perRow" data-d="-1">−</button><output id="pr-perRow">${p.perRow}</output><button class="icon-btn" data-k="perRow" data-d="1">+</button></div></div>
    <div class="set-row"><div class="t"><div>Бледных контуров</div><div>После образца</div></div>
      <div class="stepper"><button class="icon-btn" data-k="traces" data-d="-1">−</button><output id="pr-traces">${p.traces}</output><button class="icon-btn" data-k="traces" data-d="1">+</button></div></div>
    <div class="set-row"><div class="t"><div>Строк на иероглиф</div></div>
      <div class="stepper"><button class="icon-btn" data-k="rowsPerChar" data-d="-1">−</button><output id="pr-rowsPerChar">${p.rowsPerChar}</output><button class="icon-btn" data-k="rowsPerChar" data-d="1">+</button></div></div>
    <label class="set-row"><span class="t"><div>Пиньинь и значение</div><div>Подпись над строкой</div></span><input type="checkbox" class="switch" id="pr-labels" ${p.labels ? "checked" : ""}></label>
    <p class="note" id="pr-note">В окне печати выберите принтер или «Сохранить как PDF».</p>
    <button class="btn primary wide" id="pr-go">Печать / PDF</button>`;
  const LIM: Record<string, [number, number]> = { count: [1, 300], perRow: [6, 14], traces: [0, 8], rowsPerChar: [1, 4] };
  openSheet("Печать прописей", body, (root) => {
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      const all = t.closest<HTMLButtonElement>("[data-all]");
      if (all) {
        p.all = all.dataset.all === "1";
        root.querySelectorAll("[data-all]").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.all === all.dataset.all)));
        (root.querySelector("#pr-count-row") as HTMLElement).hidden = p.all;
        save();
      }
      const b = t.closest<HTMLButtonElement>("[data-k]");
      if (b) {
        const k = b.dataset.k as "count" | "perRow" | "traces" | "rowsPerChar";
        const [lo, hi] = LIM[k];
        const stepBy = k === "count" && p.count >= 20 ? 10 : 1;
        p[k] = Math.max(lo, Math.min(hi, p[k] + Number(b.dataset.d) * stepBy));
        root.querySelector(`#pr-${k}`)!.textContent = String(p[k]);
        save();
      }
      if (t.closest("#pr-go")) {
        p.labels = root.querySelector<HTMLInputElement>("#pr-labels")!.checked;
        save();
        const list = p.all ? chars.slice(0, 300) : chars.slice(idx, idx + p.count);
        root.querySelector("#pr-note")!.textContent = "Готовлю страницы…";
        await buildPrint(list);
        closeSheet();
        setTimeout(() => window.print(), 50);
      }
    });
  });
}

const GRID_SVG = `<path d="M50 0V100M0 50H100M0 0L100 100M100 0L0 100" stroke="#e7a59a" stroke-width=".6" stroke-dasharray="2.2 1.8" fill="none"/>`;

function cellSVG(paths: string[] | null, kind: PrintCell, ch: string): string {
  const fill = kind === "sample" ? "#1a1a1a" : "#cfcfcf";
  const glyph = kind === "empty" ? "" : paths
    ? `<g transform="translate(5 5) scale(.087890625) translate(0 900) scale(1 -1)" fill="${fill}">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`
    : `<text x="50" y="80" text-anchor="middle" font-size="80" fill="${fill}" font-family="Noto Serif SC, serif">${esc(ch)}</text>`;
  return `<svg viewBox="0 0 100 100" class="pr-cell">${GRID_SVG}${glyph}</svg>`;
}

async function buildPrint(list: string[]) {
  const p = st.print;
  const rows = printRows(list, { perRow: p.perRow, traces: p.traces, rowsPerChar: p.rowsPerChar });
  const perPage = rowsPerPage(p.perRow) - (p.labels ? Math.ceil(rowsPerPage(p.perRow) / (p.rowsPerChar * 3 + 1)) : 0);
  const data = new Map<string, string[] | null>();
  const info = new Map<string, { py: string; ru: string } | null>();
  await Promise.all(list.map(async (ch) => {
    try { data.set(ch, (await getChar(ch, bookLang()))?.strokes ?? null); } catch { data.set(ch, null); }
    if (p.labels) info.set(ch, await charInfo(ch).catch(() => null));
  }));
  const cellMm = 186 / p.perRow;
  const pages = paginate(rows, Math.max(1, perPage));
  $("print-area").innerHTML = `<style>.pr-row{grid-template-columns:repeat(${p.perRow},${cellMm.toFixed(2)}mm)}.pr-cell{width:${cellMm.toFixed(2)}mm;height:${cellMm.toFixed(2)}mm}</style>`
    + pages.map((page) => `<div class="pr-page">${page.map((r, i) => {
      const first = r.cells[0] === "sample" || i === 0;
      const lab = p.labels && r.cells[0] === "sample" ? info.get(r.char) : null;
      let label = "";
      if (lab) {
        let py = lab.py;
        try { py = toMarked(parseRef(lab.py)); } catch { /* как есть */ }
        label = `<div class="pr-label"><b>${esc(r.char)}</b> ${esc(py)}${lab.ru ? ` — ${esc(lab.ru)}` : ""}</div>`;
      }
      return `${first ? label : ""}<div class="pr-row">${r.cells.map((c) => cellSVG(data.get(r.char) ?? null, c, r.char)).join("")}</div>`;
    }).join("")}</div>`).join("");
}

/* ---------- обработчики ---------- */

let t = 0;
export function initBook() {
  onShow("book", render);
  onLeave("book", stop);
  $("bk-src").addEventListener("click", () => pickDeck("Что писать", st.src === "text" ? "text" : st.deckId, (id) => {
    if (id === "text") st.src = "text"; else { st.src = "deck"; st.deckId = id; }
    save();
    render();
    if (st.src === "text" && !st.text) $<HTMLInputElement>("bk-text").focus();
  }, [{ id: "text", title: "Свой текст", sub: "Впишите любые иероглифы или слова" }]));
  $("bk-text").addEventListener("input", (e) => {
    st.text = (e.target as HTMLInputElement).value;
    st.pos.text = 0;
    save();
    clearTimeout(t);
    t = window.setTimeout(render, 400);
  });
  $("bk-prev").addEventListener("click", () => { if (idx > 0) { idx--; startChar(); } });
  $("bk-next").addEventListener("click", () => { if (idx < chars.length - 1) { idx++; startChar(); } });
  $("bk-again").addEventListener("click", () => { gen++; startChar(); });
  $("bk-anim").addEventListener("click", () => {
    if (!writer) return;
    stop();
    const my = gen, w = writer;
    w.showOutline();
    w.animateCharacter({ onComplete: () => setTimeout(() => { if (my === gen && writer === w) { w.hideCharacter(); startCell(); } }, 500) });
  });
  $("bk-opts").addEventListener("click", openOptions);
  $("bk-set").addEventListener("click", openSetEditor);
  $("bk-block").addEventListener("click", pickBlock);
  $("bk-print").addEventListener("click", () => { if (chars.length) openPrint(); });
  window.addEventListener("afterprint", () => { $("print-area").innerHTML = ""; });
}
