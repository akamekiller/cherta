/** Свободное поле для письма без подсказок: черты рисуются как есть, ничего не проверяется по ходу. */
import type { Pt } from "../core/handwriting.ts";
import { inkColor } from "./writer.ts";

export type FreePad = { strokes(): Pt[][]; undo(): void; clear(): void; destroy(): void; onChange(f: () => void): void };

export function mountFreePad(el: HTMLElement, widthRatio = 1 / 18): FreePad {
  el.innerHTML = `<canvas class="free-pad" aria-label="Пишите иероглиф"></canvas>`;
  const canvas = el.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  const strokes: Pt[][] = [];
  let cur: Pt[] | null = null;
  let changed: (() => void) | null = null;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr) || 300;
    canvas.height = Math.round(r.height * dpr) || 300;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const redraw = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = inkColor();
    ctx.lineWidth = Math.max(8, w * widthRatio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of cur ? [...strokes, cur] : strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      if (s.length === 1) ctx.lineTo(s[0][0] * w + 0.1, s[0][1] * h);
      ctx.stroke();
    }
  };
  const pt = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); cur = [pt(e)]; redraw(); });
  canvas.addEventListener("pointermove", (e) => {
    if (!cur) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) cur.push(pt(ev));
    redraw();
  });
  const end = () => { if (!cur) return; strokes.push(cur); cur = null; redraw(); changed?.(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  const onResize = () => size();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(size);
  return {
    strokes: () => strokes,
    undo() { strokes.pop(); redraw(); changed?.(); },
    clear() { strokes.length = 0; redraw(); changed?.(); },
    destroy() { window.removeEventListener("resize", onResize); el.innerHTML = ""; },
    onChange(f) { changed = f; },
  };
}
