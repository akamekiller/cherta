/**
 * Пиньинь в карточке: для каждого слога — выбрать буквы из похожих вариантов и поставить тон
 * жестом по полосе тонов (как в Skritter) или нажатием на знак. Можно переключиться на ввод с клавиатуры.
 */
import { mark, type Syllable } from "../core/pinyin.ts";
import { syllableOptions, toneFromGesture, splitTyped } from "../core/pypick.ts";
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
let tonesOnly = false;
/** Тоны, поставленные кнопками в режиме клавиатуры (по номеру слога): буквы можно править, тоны остаются. */
let keyTones: (number | null)[] = [];
/** Клавиатура: буквы набираются, тоны ставятся кнопками (у навыка «Тоны» буквы уже даны — только кнопки). */
const kb = () => keyboard && !tonesOnly;

/** Ответ в формате «xue2 xi2» для checkPinyin; пустые слоги — пустые. */
export function pyAnswer(): string {
  return slots.map((x) => (x.s ? x.s + (x.t ?? 5) : "")).join(" ").trim();
}

/** Ответ, как его показать человеку: «xué xí». */
export function pyAnswerShown(): string {
  return slots.map((x) => (x.s ? mark(x.s.replace(/ü/g, "v"), x.t ?? 5) : "?")).join(" ");
}

export const pyComplete = () => slots.length > 0 && slots.every((x) => x.s && x.t);

/** Набранные буквы → слоги; тон — кнопкой, иначе написанный цифрой или знаком. */
function fromKeys() {
  const typed = splitTyped($<HTMLInputElement>("py-in").value, ref);
  slots = typed.length ? typed.map((x, i) => ({ s: x.s, t: keyTones[i] ?? x.t })) : ref.map((_, i) => ({ s: null, t: keyTones[i] ?? null }));
  const free = slots.findIndex((x) => !x.t);
  cur = Math.min(cur, slots.length - 1);
  if (free >= 0 && slots[cur]?.t) cur = free;
}

/** onlyTones — буквы слогов уже даны, ставятся только тоны (навык «Тоны»). */
export function resetPyPick(id: string, syllables: Syllable[], onlyTones = false) {
  ref = syllables;
  tonesOnly = onlyTones;
  slots = ref.map((x) => ({ s: onlyTones ? x.s : null, t: null }));
  options = ref.map((x, i) => (onlyTones ? [x.s] : syllableOptions(x.s, 6, `${id}:${i}`)));
  cur = 0;
  keyTones = [];
  $<HTMLInputElement>("py-in").value = "";
  if (kb()) fromKeys();
  render();
}

function render() {
  $("py-in").hidden = !kb();
  $("py-mode").hidden = tonesOnly;
  $("py-mode").textContent = keyboard ? "Выбрать слоги кнопками" : "Набрать с клавиатуры";
  $("py-opts").hidden = tonesOnly || kb();
  $("tone-hint").textContent = tonesOnly ? "Проведите тон по полосе или нажмите знак — для каждого слога"
    : kb() ? "Наберите буквы, затем поставьте тон каждому слогу: проведите по полосе или нажмите знак"
    : "Выберите слог, затем проведите тон по полосе или нажмите знак";
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
  if (kb()) keyTones[cur] = t;
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
    // при переключении начинаем заново: в режиме кнопок слоги выбираются из вариантов
    slots = ref.map(() => ({ s: null, t: null }));
    keyTones = [];
    cur = 0;
    $<HTMLInputElement>("py-in").value = "";
    if (kb()) fromKeys();
    render();
    if (keyboard) $<HTMLInputElement>("py-in").focus();
    changed();
  });
  $("py-in").addEventListener("input", () => { if (kb()) { fromKeys(); render(); } changed(); });
  initTonePad();
}
