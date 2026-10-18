/** Свой почерк после ответа: оценка красоты, повтор своих черт рядом с образцом. */
import { scoreHandwriting, beautyLabel, type P } from "../core/beauty.ts";
import { getChar } from "../strokes.ts";
import { esc } from "./dom.ts";

const FLIP = `transform="translate(0 900) scale(1 -1)"`;
const GRID = `<path d="M512 -124V900M0 388H1024M0 -124L1024 900M1024 -124L0 900" class="hv-grid"/>`;

const userPaths = (strokes: P[][]) => strokes.map((s) => s.length === 1
  ? `<circle cx="${s[0].x}" cy="${s[0].y}" r="22" class="hv-dot"/>`
  : `<polyline points="${s.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ")}" class="hv-ink"/>`).join("");

export type HandResult = { score: number; html: string; play: (root: HTMLElement) => void };

/**
 * Оценка и разметка для всех иероглифов слова. drawn[i] — черты i-го иероглифа (точки в координатах hanzi-writer).
 * Возвращает null, если оценить нечего (например, не было данных черт).
 */
export async function handResult(chars: string[], drawn: P[][][]): Promise<HandResult | null> {
  const parts: { ch: string; score: number; notes: string[]; user: P[][]; ref: string[] }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const data = await getChar(chars[i]).catch(() => null);
    const user = (drawn[i] ?? []).filter(Boolean);
    if (!data || !user.length) continue;
    const b = scoreHandwriting(user, data.medians);
    parts.push({ ch: chars[i], score: b.score, notes: b.notes, user, ref: data.strokes });
  }
  if (!parts.length) return null;
  const score = Math.round(parts.reduce((a, p) => a + p.score, 0) / parts.length);
  const notes = [...new Set(parts.flatMap((p) => p.notes))].slice(0, 3);
  const html = `<div class="hv">
    <div class="hv-pairs">${parts.map((p) => `
      <figure class="hv-pair">
        <svg viewBox="0 -124 1024 1024" class="hv-cell" aria-label="Ваше написание ${esc(p.ch)}">${GRID}<g ${FLIP}>${userPaths(p.user)}</g></svg>
        <svg viewBox="0 -124 1024 1024" class="hv-cell ref" aria-label="Образец ${esc(p.ch)}">${GRID}<g ${FLIP}>${p.ref.map((d) => `<path d="${d}" class="hv-ref"/>`).join("")}</g></svg>
        <span class="hv-cap">вы${parts.length > 1 ? ` · ${p.score}` : ""}</span><span class="hv-cap">образец</span>
      </figure>`).join("")}</div>
    <div class="hv-side">
      <ul class="hv-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <button class="btn small" data-hv-play>▶ Повторить моё письмо</button></div>
  </div>`;
  return { score, html, play };
}

/** Анимация своих черт по очереди (как запись письма). */
function play(root: HTMLElement) {
  const strokes = [...root.querySelectorAll<SVGPolylineElement | SVGCircleElement>(".hv-pair .hv-cell:not(.ref) .hv-ink, .hv-pair .hv-cell:not(.ref) .hv-dot")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let delay = 0;
  for (const el of strokes) {
    const len = el instanceof SVGPolylineElement ? el.getTotalLength() : 1;
    el.style.transition = "none";
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.style.opacity = el instanceof SVGCircleElement ? "0" : "1";
    const ms = reduce ? 0 : Math.max(180, Math.min(700, len * 0.9));
    const d = delay;
    setTimeout(() => {
      el.style.transition = `stroke-dashoffset ${ms}ms linear, opacity ${ms}ms`;
      el.style.strokeDashoffset = "0";
      el.style.opacity = "1";
    }, d + 30);
    delay += ms + (reduce ? 0 : 140);
  }
}

export { beautyLabel };
