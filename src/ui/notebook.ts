/**
 * Тетрадь прописей на планшете: страница как в настоящей тетради. Строка — один иероглиф: образец слева,
 * дальше клетки 米字格 (первые — с бледным контуром). Пишется вся строка свободно, проверка — после строки
 * (core/rowcheck.ts: черты, порядок, направление, красота). Перо — из настроек, толщина — по размеру клетки.
 * Если писали стилусом, касания пальцем (ладонью) не рисуют, а прокручивают страницу.
 */
import { getChar, type CharData, type StrokeLang } from "../strokes.ts";
import { checkCell, type CellCheck } from "../core/rowcheck.ts";
import { beautyLabel, type P } from "../core/beauty.ts";
import type { PenPoint } from "../core/pen.ts";
import { parseRef } from "../core/pinyin.ts";
import { paintStroke, inkColor } from "./writer.ts";
import { esc, pinyinHTML, plural } from "./dom.ts";
import { openSheet, closeSheet } from "./sheet.ts";
import { app } from "../state.ts";

export type NbCtx = {
  chars: string[];
  start: number;
  lang: StrokeLang;
  total: number;
  trace: number;
  title: string;
  info(ch: string): Promise<{ py: string; ru: string; ja?: boolean } | null>;
  setStart(i: number): void;
};

type Cell = { strokes: PenPoint[][]; res?: CellCheck };
type Row = { ch: string; data: CharData | null; cells: Cell[]; checked: boolean };

export const NB_ROWS = 5;
/** Поле клетки 1000 × 1000; иероглиф (1024, y вверх, базовая линия 900) вписан с отступом 60. */
const PAD = 60, S = 880 / 1024;
const GLYPH = `translate(${PAD} ${PAD}) scale(${S}) translate(0 900) scale(1 -1)`;
const toChar = (p: PenPoint): P => ({ x: (p.x - PAD) / S, y: 900 - (p.y - PAD) / S });
/** Толщина пера в единицах клетки: как у большого поля (1/18 ширины), поэтому кисть растёт и уменьшается вместе с клеткой. */
const BASE = 1000 / 18;
const GRID = `<path class="nb-grid" d="M500 0V1000M0 500H1000M0 0L1000 1000M1000 0L0 1000"/>`;

let rows: Row[] = [];
let ctx: NbCtx | null = null;
let host: HTMLElement | null = null;
let penSeen = false;
let timer = 0;
let gen = 0;

const glyph = (d: CharData | null, cls: string) => (d ? `<g class="${cls}" transform="${GLYPH}">${d.strokes.map((s) => `<path d="${s}"/>`).join("")}</g>` : "");

function strokeSVG(pts: PenPoint[]): string {
  const sh = paintStroke(pts, BASE);
  return sh.mode === "fill"
    ? `<path d="${sh.d}" fill="currentColor" opacity="${sh.opacity}"/>`
    : `<path d="${sh.d}" fill="none" stroke="currentColor" stroke-width="${sh.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${sh.opacity}"/>`;
}

function cellHTML(r: Row, ri: number, ci: number): string {
  const c = r.cells[ci];
  const trace = ci < (ctx?.trace ?? 0);
  const st = c.res ? (c.res.ok ? "ok" : "bad") : "";
  const badge = c.res ? `<span class="nb-badge">${c.res.ok ? c.res.score : "✕"}</span>` : "";
  return `<div class="nb-cell ${st} ${trace ? "trace" : ""}" data-r="${ri}" data-c="${ci}" role="img" aria-label="Клетка ${ci + 1}${trace ? ", по контуру" : ""}">
    <svg viewBox="0 0 1000 1000">${GRID}${trace ? glyph(r.data, "nb-trace") : ""}<g class="nb-ink" style="color:${inkColor()}">${c.strokes.map(strokeSVG).join("")}</g><path class="nb-live"/></svg>${badge}</div>`;
}

function rowSummary(r: Row): string {
  if (!r.checked) return "";
  const done = r.cells.filter((c) => c.res);
  const ok = done.filter((c) => c.res!.ok);
  const sc = ok.map((c) => c.res!.score);
  const avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
  return `${ok.length} из ${r.cells.length} верно${avg !== null ? ` · почерк ${avg}` : ""}`;
}

function rowHTML(r: Row, ri: number): string {
  return `<div class="nb-row ${r.checked ? "checked" : ""}" data-row="${ri}">
    <div class="nb-sample"><div class="nb-cell sample"><svg viewBox="0 0 1000 1000">${GRID}${r.data ? glyph(r.data, "nb-glyph") : `<text x="500" y="760" text-anchor="middle" font-size="720">${esc(r.ch)}</text>`}</svg></div>
      <div class="nb-info" data-info="${ri}"></div></div>
    <div class="nb-cells" style="--n:${r.cells.length}">${r.cells.map((_, ci) => cellHTML(r, ri, ci)).join("")}</div>
    <div class="nb-end">
      <button class="icon-btn nb-undo" data-undo="${ri}" aria-label="Стереть последнюю черту" ${r.checked ? "hidden" : ""}>↶</button>
      <button class="icon-btn nb-check" data-check="${ri}" aria-label="Проверить строку" ${r.checked ? "hidden" : ""}>✓</button>
      <button class="icon-btn" data-redo="${ri}" aria-label="Написать строку заново" ${r.checked ? "" : "hidden"}>⟲</button>
    </div>
    <div class="nb-sum" data-sum="${ri}">${rowSummary(r)}</div>
  </div>`;
}

function render() {
  if (!host || !ctx) return;
  const c = ctx;
  const pages = Math.ceil(c.chars.length / NB_ROWS);
  const page = Math.floor(c.start / NB_ROWS) + 1;
  const date = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const allChecked = rows.every((r) => r.checked);
  host.innerHTML = `<div class="nb-page">
      <div class="nb-head"><span class="nb-title">${esc(c.title)}</span><span class="nb-date">${esc(date)} · стр. ${page} из ${pages}</span></div>
      <p class="nb-hint">Пишите всю строку — проверка после строки (✓ или сама, когда все клетки заполнены). ${penSeen ? "Пальцем страница прокручивается." : "Пишете стилусом — касания пальцем перестанут рисовать."}</p>
      ${rows.map(rowHTML).join("")}
      <div class="nb-foot">
        <button class="btn" id="nb-prev" ${c.start === 0 ? "disabled" : ""}>‹ Назад</button>
        <span class="nb-total" id="nb-total">${pageSummary()}</span>
        <button class="btn ${allChecked ? "primary" : ""}" id="nb-next" ${c.start + NB_ROWS >= c.chars.length ? "disabled" : ""}>Дальше ›</button>
      </div>
    </div>`;
  host.classList.toggle("pen", penSeen);
  rows.forEach((r, ri) => fillInfo(r, ri));
}

function pageSummary(): string {
  const checked = rows.filter((r) => r.checked);
  if (!checked.length) return `${rows.length} ${plural(rows.length, "строка", "строки", "строк")}`;
  const cells = checked.flatMap((r) => r.cells.filter((c) => c.res));
  const ok = cells.filter((c) => c.res!.ok);
  const sc = ok.map((c) => c.res!.score);
  const avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
  return `Верно ${ok.length} из ${cells.length}${avg !== null ? ` · почерк ${avg} — ${beautyLabel(avg)}` : ""}`;
}

async function fillInfo(r: Row, ri: number) {
  const my = gen;
  const info = await ctx?.info(r.ch).catch(() => null);
  const el = host?.querySelector<HTMLElement>(`[data-info="${ri}"]`);
  if (my !== gen || !el || !info) return;
  let py = "";
  if (info.ja) py = info.py && info.py !== r.ch ? `<span lang="ja">${esc(info.py)}</span>` : "";
  else try { py = info.py ? pinyinHTML(parseRef(info.py)) : ""; } catch { /* */ }
  el.innerHTML = `<span class="py">${py}</span><span class="ru">${esc(info.ru.split(/[;,]/)[0] ?? "")}</span>`;
}

/** Перерисовать одну строку (после проверки или стирания), не трогая остальные. */
function redrawRow(ri: number) {
  const el = host?.querySelector(`[data-row="${ri}"]`);
  if (!el) return;
  el.outerHTML = rowHTML(rows[ri], ri);
  fillInfo(rows[ri], ri);
  const t = host?.querySelector("#nb-total");
  if (t) t.textContent = pageSummary();
  host?.querySelector("#nb-next")?.classList.toggle("primary", rows.every((r) => r.checked));
}

function checkRow(ri: number) {
  const r = rows[ri];
  if (!r || r.checked || !r.data) return;
  if (!r.cells.some((c) => c.strokes.length)) return;
  for (const c of r.cells) if (c.strokes.length) c.res = checkCell(c.strokes.map((s) => s.map(toChar)), r.data.medians);
  r.checked = true;
  if (app.settings.vibrate && r.cells.some((c) => c.res && !c.res.ok)) try { navigator.vibrate?.(35); } catch { /* */ }
  redrawRow(ri);
}

/** Подробности клетки: свой иероглиф рядом с образцом и замечания. */
function openCell(ri: number, ci: number) {
  const r = rows[ri], c = r.cells[ci];
  if (!c.res) return;
  const big = (inner: string) => `<div class="nb-cell nb-big"><svg viewBox="0 0 1000 1000">${GRID}${inner}</svg></div>`;
  openSheet(`Клетка ${ci + 1}: ${r.ch}`, `<div class="stack">
      <div class="nb-cmp">${big(`<g class="nb-ink" style="color:${inkColor()}">${c.strokes.map(strokeSVG).join("")}</g>`)}${big(glyph(r.data, "nb-glyph"))}</div>
      <p class="hint center">Ваш иероглиф · образец</p>
      <div class="chip ${c.res.ok ? "ok" : "no"}">${c.res.ok ? `Верно · почерк ${c.res.score} — ${beautyLabel(c.res.score)}` : "Есть ошибки"}</div>
      <ul class="nb-notes">${c.res.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
    </div>`);
}

/* ---------- письмо ---------- */

let drawing: { ri: number; ci: number; pts: PenPoint[]; svg: SVGSVGElement; live: SVGPathElement; id: number } | null = null;

function ptOf(e: PointerEvent, svg: SVGSVGElement): PenPoint {
  const b = svg.getBoundingClientRect();
  return { x: ((e.clientX - b.left) / b.width) * 1000, y: ((e.clientY - b.top) / b.height) * 1000, t: e.timeStamp, p: e.pointerType === "pen" ? e.pressure : undefined };
}

function drawLive() {
  if (!drawing) return;
  const sh = paintStroke(drawing.pts, BASE);
  const l = drawing.live;
  l.setAttribute("d", sh.d);
  l.style.color = inkColor();
  if (sh.mode === "fill") { l.setAttribute("fill", "currentColor"); l.removeAttribute("stroke"); }
  else { l.setAttribute("fill", "none"); l.setAttribute("stroke", "currentColor"); l.setAttribute("stroke-width", String(sh.width)); l.setAttribute("stroke-linecap", "round"); l.setAttribute("stroke-linejoin", "round"); }
  l.setAttribute("opacity", String(sh.opacity));
}

function onDown(e: PointerEvent) {
  const cell = (e.target as Element).closest<HTMLElement>(".nb-cell[data-r]");
  if (!cell || drawing) return;
  if (e.pointerType === "pen" && !penSeen) { penSeen = true; host?.classList.add("pen"); const h = host?.querySelector(".nb-hint"); if (h) h.textContent = "Пишите всю строку — проверка после строки (✓ или сама, когда все клетки заполнены). Пальцем страница прокручивается."; }
  if (e.pointerType === "touch" && penSeen) return; // ладонь или палец при письме стилусом — прокрутка
  const ri = Number(cell.dataset.r), ci = Number(cell.dataset.c);
  const r = rows[ri];
  if (!r || r.checked) { if (r?.cells[ci].res) openCell(ri, ci); return; }
  e.preventDefault();
  clearTimeout(timer);
  // начали писать в другой строке — заполненные строки выше проверяются
  rows.forEach((x, k) => { if (k !== ri && !x.checked && x.cells.every((c) => c.strokes.length)) checkRow(k); });
  const svg = cell.querySelector("svg")!;
  try { cell.setPointerCapture(e.pointerId); } catch { /* */ }
  drawing = { ri, ci, pts: [ptOf(e, svg)], svg, live: cell.querySelector<SVGPathElement>(".nb-live")!, id: e.pointerId };
  drawLive();
}

function onMove(e: PointerEvent) {
  if (!drawing || e.pointerId !== drawing.id) return;
  for (const ev of e.getCoalescedEvents?.() ?? [e]) drawing.pts.push(ptOf(ev, drawing.svg));
  drawLive();
}

function onUp(e: PointerEvent) {
  if (!drawing || e.pointerId !== drawing.id) return;
  const d = drawing;
  drawing = null;
  d.live.removeAttribute("d");
  const r = rows[d.ri];
  if (d.pts.length > 1 || d.pts.length === 1) {
    r.cells[d.ci].strokes.push(d.pts);
    d.svg.querySelector(".nb-ink")!.insertAdjacentHTML("beforeend", strokeSVG(d.pts));
  }
  if (r.cells.every((c) => c.strokes.length)) {
    const my = gen;
    timer = window.setTimeout(() => { if (my === gen) checkRow(d.ri); }, 1800);
  }
}

function onClick(e: Event) {
  const t = e.target as HTMLElement;
  const b = t.closest<HTMLButtonElement>("button");
  if (!b || !ctx) return;
  if (b.dataset.check) { clearTimeout(timer); checkRow(Number(b.dataset.check)); return; }
  if (b.dataset.undo) {
    const r = rows[Number(b.dataset.undo)];
    const last = [...r.cells].reverse().find((c) => c.strokes.length);
    if (last) { last.strokes.pop(); redrawRow(Number(b.dataset.undo)); }
    return;
  }
  if (b.dataset.redo) {
    const ri = Number(b.dataset.redo);
    openSheet("Написать строку заново?", `<div class="stack"><p class="hint">Всё написанное в этой строке сотрётся.</p><div class="row"><button class="btn danger" id="nb-redo-yes">Да, заново</button><button class="btn" id="nb-redo-no">Отмена</button></div></div>`, (r) => {
      r.querySelector("#nb-redo-yes")!.addEventListener("click", () => {
        closeSheet();
        rows[ri].cells = rows[ri].cells.map(() => ({ strokes: [] }));
        rows[ri].checked = false;
        redrawRow(ri);
      });
      r.querySelector("#nb-redo-no")!.addEventListener("click", closeSheet);
    });
    return;
  }
  if (b.id === "nb-prev") { ctx.setStart(Math.max(0, ctx.start - NB_ROWS)); return; }
  if (b.id === "nb-next") { ctx.setStart(Math.min(ctx.chars.length - 1, ctx.start + NB_ROWS)); return; }
}

let bound: HTMLElement | null = null;

/** Показать страницу тетради с c.start (позиция страницы — первый иероглиф). */
export async function showNotebook(el: HTMLElement, c: NbCtx) {
  const my = ++gen;
  host = el;
  ctx = c;
  clearTimeout(timer);
  drawing = null;
  const list = c.chars.slice(c.start, c.start + NB_ROWS);
  rows = list.map((ch) => ({ ch, data: null, cells: Array.from({ length: c.total }, () => ({ strokes: [] })), checked: false }));
  render();
  if (bound !== el) {
    bound = el;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick);
  }
  const data = await Promise.all(list.map((ch) => getChar(ch, c.lang).catch(() => null)));
  if (my !== gen) return;
  rows.forEach((r, i) => { r.data = data[i]; });
  render();
}

/** Ушли с экрана или выключили тетрадь — остановить отложенную проверку. */
export function stopNotebook() { gen++; clearTimeout(timer); drawing = null; }
