/**
 * Тетрадь прописей: один иероглиф — ряд клеток. Первые по бледному контуру, остальные по памяти,
 * каждая клетка проверяется. Плюс печать прописей на A4 (через окно печати браузера → «Сохранить как PDF»).
 */
import { app, words, hskLookup, dictIndex } from "../state.ts";
import { uniqueChars, cellPlan, printRows, paginate, rowsPerPage, type PrintCell } from "../core/copybook.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { parseRef, toMarked } from "../core/pinyin.ts";
import { getChar } from "../strokes.ts";
import { scoreHandwriting, beautyLabel, type P } from "../core/beauty.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { createWriter, type Writer } from "./writer.ts";
import { onShow, onLeave } from "./nav.ts";
import { openSheet, closeSheet } from "./sheet.ts";

type Src = "deck" | "text";
const LS = "cherta.book";
const st = { src: "deck" as Src, text: "", total: 6, trace: 2, pos: {} as Record<string, number>,
  print: { perRow: 10, traces: 3, rowsPerChar: 1, count: 12, labels: true, all: false } };
try { const saved = JSON.parse(localStorage.getItem(LS) ?? "{}"); Object.assign(st, saved, { print: { ...st.print, ...(saved.print ?? {}) } }); } catch { /* */ }
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

const key = () => (st.src === "deck" ? `deck:${app.deck?.id ?? ""}` : "text");

function sourceChars(): string[] {
  return st.src === "deck" ? uniqueChars(words().map((w) => w.han)) : uniqueChars([st.text]);
}

/* ---------- сведения об иероглифе: пиньинь и значение ---------- */

let lookup: ((h: string) => { py: string; ru: string } | undefined) | null = null;
let dict: DictIndex | null = null;
async function charInfo(ch: string): Promise<{ py: string; ru: string } | null> {
  lookup ??= await hskLookup();
  const fromDeck = words().find((w) => w.han === ch);
  if (fromDeck) return { py: fromDeck.py, ru: fromDeck.ru };
  const h = lookup(ch);
  if (h) return h;
  try { dict ??= await dictIndex(); } catch { return null; }
  const i = dict.han.indexOf(ch);
  if (i < 0) return null;
  return { py: dictPyToNumeric(dict.py[i], ch) ?? "", ru: dict.ru[i] };
}

/* ---------- упражнение ---------- */

function render() {
  chars = sourceChars();
  $("bk-src-deck").textContent = app.deck?.title ?? "Колода";
  document.querySelectorAll<HTMLButtonElement>(".book-src [data-src]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === st.src)));
  $("bk-text-field").hidden = st.src !== "text";
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
    $("bk-status").textContent = st.src === "text" ? "Впишите иероглифы или слова — по ним будут прописи." : "В колоде нет иероглифов.";
    return;
  }
  idx = Math.max(0, Math.min(chars.length - 1, st.pos[key()] ?? 0));
  startChar();
}

async function startChar() {
  const ch = chars[idx];
  const my = ++gen;
  st.pos[key()] = idx;
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
  try { $("bk-py").innerHTML = info.py ? pinyinHTML(parseRef(info.py)) : ""; } catch { /* */ }
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
  writer = createWriter($("bk-hw"), chars[idx], { showOutline: cells[i] });
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
      getChar(chars[idx]).then((data) => {
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
    <button class="btn primary wide" id="bo-done">Готово</button>`;
  openSheet("Прописи", body, (root) => {
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-k]");
      if (b) {
        const k = b.dataset.k as "total" | "trace";
        st[k] = Math.max(k === "total" ? 1 : 0, Math.min(k === "total" ? 12 : st.total, st[k] + Number(b.dataset.d)));
        if (st.trace > st.total) st.trace = st.total;
        root.querySelector("#bo-total")!.textContent = String(st.total);
        root.querySelector("#bo-trace")!.textContent = String(st.trace);
        save();
      }
      if ((e.target as HTMLElement).closest("#bo-done")) { closeSheet(); if (chars.length) startChar(); }
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
    try { data.set(ch, (await getChar(ch))?.strokes ?? null); } catch { data.set(ch, null); }
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

export function initBook() {
  onShow("book", render);
  onLeave("book", stop);
  document.querySelector(".book-src")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-src]");
    if (!b) return;
    st.src = b.dataset.src as Src;
    save();
    render();
    if (st.src === "text" && !st.text) $<HTMLInputElement>("bk-text").focus();
  });
  let t = 0;
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
  $("bk-print").addEventListener("click", () => { if (chars.length) openPrint(); });
  window.addEventListener("afterprint", () => { $("print-area").innerHTML = ""; });
}
