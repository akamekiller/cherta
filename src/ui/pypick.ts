/**
 * Пиньинь в карточке: для каждого слога — выбрать буквы из похожих вариантов и поставить тон
 * жестом по полосе тонов (как в Skritter) или нажатием на знак. Можно переключиться на ввод с клавиатуры.
 */
import { mark, type Syllable } from "../core/pinyin.ts";
import { syllableOptions, toneFromGesture } from "../core/pypick.ts";
import { $, esc } from "./dom.ts";

type Slot = { s: string | null; t: number | null };
const LS = "cherta.pyMode";

let ref: Syllable[] = [];
let slots: Slot[] = [];
let options: string[][] = [];
let cur = 0;
let keyboard = false;
try { keyboard = localStorage.getItem(LS) === "keys"; } catch { /* */ }
let changed: () => void = () => {};

/** Ответ в формате «xue2 xi2» для checkPinyin; пустые слоги — пустые. */
export function pyAnswer(): string {
  if (keyboard) return $<HTMLInputElement>("py-in").value.trim();
  return slots.map((x) => (x.s ? x.s + (x.t ?? 5) : "")).join(" ").trim();
}

/** Ответ, как его показать человеку: «xué xí». */
export function pyAnswerShown(): string {
  if (keyboard) return $<HTMLInputElement>("py-in").value.trim();
  return slots.map((x) => (x.s ? mark(x.s.replace(/ü/g, "v"), x.t ?? 5) : "?")).join(" ");
}

export const pyComplete = () => keyboard ? !!$<HTMLInputElement>("py-in").value.trim() : slots.every((x) => x.s && x.t);

export function resetPyPick(id: string, syllables: Syllable[]) {
  ref = syllables;
  slots = ref.map(() => ({ s: null, t: null }));
  options = ref.map((x, i) => syllableOptions(x.s, 6, `${id}:${i}`));
  cur = 0;
  $<HTMLInputElement>("py-in").value = "";
  render();
}

function render() {
  $("py-tap").hidden = keyboard;
  $("py-slots").hidden = keyboard;
  $("py-in").hidden = !keyboard;
  $("py-mode").textContent = keyboard ? "Выбрать кнопками" : "Набрать с клавиатуры";
  if (keyboard) return;
  $("py-slots").innerHTML = slots.map((x, i) => {
    const text = x.s ? mark(x.s, x.t ?? 5) : "";
    return `<button type="button" class="py-slot${i === cur ? " cur" : ""}${x.s && x.t ? ` t${x.t}` : ""}" data-i="${i}" aria-label="Слог ${i + 1}">${text ? esc(text) : "<span>?</span>"}${x.s && !x.t ? "<small>тон?</small>" : ""}</button>`;
  }).join("");
  const opts = options[cur] ?? [];
  const chosen = slots[cur]?.s;
  $("py-opts").innerHTML = opts.map((o) => `<button type="button" class="py-opt" data-s="${esc(o)}" aria-pressed="${o === chosen}">${esc(o.replace(/v/g, "ü"))}</button>`).join("");
  document.querySelectorAll<HTMLButtonElement>("#tone-pad [data-t]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.t) === slots[cur]?.t)));
}

function advance() {
  const x = slots[cur];
  if (x?.s && x.t) {
    const next = slots.findIndex((y, i) => i > cur && !(y.s && y.t));
    const any = slots.findIndex((y) => !(y.s && y.t));
    if (next >= 0) cur = next; else if (any >= 0) cur = any;
  }
  render();
  changed();
}

function setTone(t: number) {
  if (!slots[cur]) return;
  slots[cur].t = t;
  advance();
}

/* Жест по полосе тонов: короткое касание — знак под пальцем, линия — тон по форме. */
function initTonePad() {
  const pad = $("tone-pad");
  const trail = pad.querySelector<SVGPathElement>("#tone-trail path")!;
  let pts: [number, number][] | null = null;
  let start: HTMLElement | null = null;
  const local = (e: PointerEvent): [number, number] => {
    const r = pad.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    pts = [local(e)];
    start = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
    trail.setAttribute("d", "");
  });
  pad.addEventListener("pointermove", (e) => {
    if (!pts) return;
    pts.push(local(e));
    trail.setAttribute("d", "M" + pts.map((p) => p.join(" ")).join("L"));
  });
  const end = () => {
    if (!pts) return;
    const raw = pts;
    pts = null;
    setTimeout(() => trail.setAttribute("d", ""), 250);
    let len = 0;
    for (let i = 1; i < raw.length; i++) len += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    if (len < 14) { if (start?.dataset.t) setTone(Number(start.dataset.t)); return; }
    // полоса широкая и низкая: по горизонтали сжимаем, чтобы наклон считался как на квадрате
    const r = pad.getBoundingClientRect();
    setTone(toneFromGesture(raw.map(([x, y]) => [(x / r.width) * 2, y / r.height] as [number, number]), 0));
  };
  pad.addEventListener("pointerup", end);
  // с клавиатуры (Enter/пробел на знаке) — без жеста
  pad.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-t]");
    if (b && (e as MouseEvent).detail === 0) setTone(Number(b.dataset.t));
  });
  pad.addEventListener("pointercancel", () => { pts = null; trail.setAttribute("d", ""); });
}

export function initPyPick(onChange: () => void) {
  changed = onChange;
  $("py-slots").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-i]");
    if (!b) return;
    cur = Number(b.dataset.i);
    render();
  });
  $("py-opts").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-s]");
    if (!b || !slots[cur]) return;
    slots[cur].s = b.dataset.s!;
    advance();
  });
  $("py-mode").addEventListener("click", () => {
    keyboard = !keyboard;
    try { localStorage.setItem(LS, keyboard ? "keys" : "tap"); } catch { /* */ }
    render();
    if (keyboard) $<HTMLInputElement>("py-in").focus();
    changed();
  });
  $("py-in").addEventListener("input", () => changed());
  initTonePad();
}
