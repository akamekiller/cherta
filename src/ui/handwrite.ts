/** Поиск рисованием: поле для иероглифа под строкой поиска и ряд похожих иероглифов. */
import { parseHw, recognize, type HwDb, type Pt } from "../core/handwriting.ts";
import { $, esc } from "./dom.ts";
import { inkColor } from "./writer.ts";

declare const __HW_VERSION__: string;

let db: Promise<HwDb> | null = null;
function loadDb(): Promise<HwDb> {
  if (!db) {
    db = fetch(`data/hw.txt?v=${__HW_VERSION__}`).then(async (r) => {
      if (!r.ok) throw new Error("Нет данных рукописного ввода");
      return parseHw(await r.text());
    });
    db.catch(() => { db = null; });
  }
  return db;
}

const strokes: Pt[][] = [];
let current: Pt[] | null = null;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let onPick: (ch: string) => void = () => {};

function size() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function redraw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = inkColor();
  ctx.lineWidth = Math.max(5, w / 34);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of current ? [...strokes, current] : strokes) {
    ctx.beginPath();
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    if (s.length === 1) ctx.lineTo(s[0][0] * w + 0.1, s[0][1] * h);
    ctx.stroke();
  }
}

const point = (e: PointerEvent): Pt => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
};

async function update() {
  const box = $("w-hw-cands");
  $("w-hw-undo").toggleAttribute("disabled", !strokes.length);
  $("w-hw-clear").toggleAttribute("disabled", !strokes.length);
  if (!strokes.length) { box.innerHTML = `<span class="hint">Нарисуйте иероглиф — порядок черт не важен</span>`; return; }
  let d: HwDb;
  try { d = await loadDb(); } catch { box.innerHTML = `<span class="hint">Не удалось загрузить данные. Нужен интернет при первом запуске.</span>`; return; }
  const found = recognize(d, strokes, 10);
  box.innerHTML = found.map((c) => `<button class="hw-cand" data-c="${esc(c)}">${esc(c)}</button>`).join("");
}

export function clearPad() {
  strokes.length = 0;
  current = null;
  if (ctx) redraw();
  if (canvas) update();
}

export function toggleHandwrite(open?: boolean) {
  const panel = $("w-hw");
  const show = open ?? panel.hidden;
  panel.hidden = !show;
  $("w-draw").setAttribute("aria-pressed", String(show));
  if (show) { size(); update(); loadDb().catch(() => {}); }
}

export function initHandwrite(pick: (ch: string) => void) {
  onPick = pick;
  canvas = $<HTMLCanvasElement>("w-hw-canvas");
  ctx = canvas.getContext("2d")!;
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = [point(e)];
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) current.push(point(ev));
    redraw();
  });
  const end = () => {
    if (!current) return;
    strokes.push(current);
    current = null;
    redraw();
    update();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  $("w-hw-undo").addEventListener("click", () => { strokes.pop(); redraw(); update(); });
  $("w-hw-clear").addEventListener("click", clearPad);
  $("w-hw-cands").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-c]");
    if (!b) return;
    onPick(b.dataset.c!);
    clearPad();
  });
  $("w-draw").addEventListener("click", () => toggleHandwrite());
  window.addEventListener("resize", () => { if (!$("w-hw").hidden) size(); });
}
