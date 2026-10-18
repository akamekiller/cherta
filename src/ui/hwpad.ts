/** Поле для рисования иероглифа с подбором похожих (рукописный ввод). Можно создать несколько: в поиске и в упражнениях. */
import { parseHw, recognize, type HwDb, type Pt } from "../core/handwriting.ts";
import { esc } from "./dom.ts";
import { inkColor } from "./writer.ts";

declare const __HW_VERSION__: string;

let db: Promise<HwDb> | null = null;
export function loadHwDb(): Promise<HwDb> {
  if (!db) {
    db = fetch(`data/hw.txt?v=${__HW_VERSION__}`).then(async (r) => {
      if (!r.ok) throw new Error("Нет данных рукописного ввода");
      return parseHw(await r.text());
    });
    db.catch(() => { db = null; });
  }
  return db;
}

const GRID = `<svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g stroke="currentColor" stroke-width=".5" stroke-dasharray="2 1.6" fill="none"><line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/><line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/></g></svg>`;

export type HwPad = { show(): void; hide(): void; clear(): void; visible(): boolean };

/** Рисует в container: ряд вариантов, клетку и кнопки «Стереть черту / Очистить». onPick — выбран иероглиф. */
export function mountHwPad(container: HTMLElement, onPick: (ch: string) => void, extra?: { label: string; onClick: () => void }): HwPad {
  container.classList.add("hw-panel");
  container.innerHTML = `<div class="hw-cands" aria-live="polite"></div>
    <div class="hw-pad">${GRID}<canvas aria-label="Поле для рисования иероглифа"></canvas></div>
    <div class="hw-tools"><button class="btn small" data-a="undo" disabled>Стереть черту</button><button class="btn small" data-a="clear" disabled>Очистить</button>${extra ? `<button class="btn small" data-a="extra">${esc(extra.label)}</button>` : ""}</div>`;
  const cands = container.querySelector<HTMLElement>(".hw-cands")!;
  const canvas = container.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  const strokes: Pt[][] = [];
  let current: Pt[] | null = null;

  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const redraw = () => {
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
  };
  const point = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const update = async () => {
    container.querySelector("[data-a=undo]")!.toggleAttribute("disabled", !strokes.length);
    container.querySelector("[data-a=clear]")!.toggleAttribute("disabled", !strokes.length);
    if (!strokes.length) { cands.innerHTML = `<span class="hint">Нарисуйте иероглиф — порядок черт не важен</span>`; return; }
    let d: HwDb;
    try { d = await loadHwDb(); } catch { cands.innerHTML = `<span class="hint">Не удалось загрузить данные. Нужен интернет при первом запуске.</span>`; return; }
    cands.innerHTML = recognize(d, strokes, 10).map((c) => `<button class="hw-cand" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  };
  const clear = () => { strokes.length = 0; current = null; redraw(); update(); };

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
  const end = () => { if (!current) return; strokes.push(current); current = null; redraw(); update(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  container.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLButtonElement>("[data-c]");
    if (c) { onPick(c.dataset.c!); clear(); return; }
    const a = t.closest<HTMLButtonElement>("[data-a]")?.dataset.a;
    if (a === "undo") { strokes.pop(); redraw(); update(); }
    else if (a === "clear") clear();
    else if (a === "extra") extra?.onClick();
  });
  window.addEventListener("resize", () => { if (!container.hidden) size(); });

  return {
    show() { container.hidden = false; size(); update(); loadHwDb().catch(() => {}); },
    hide() { container.hidden = true; },
    clear,
    visible: () => !container.hidden,
  };
}
