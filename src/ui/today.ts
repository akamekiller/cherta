/**
 * «Сегодня» — одна кнопка на весь день: повторения карточек (колода за колодой) → следующий шаг курса → пара минут тонов.
 * Что уже сделано сегодня, хранится в localStorage `cherta.today` (сбрасывается с новым днём).
 * Модули сообщают о завершении событиями: cherta:done (занятие карточек), cherta:stepdone (шаг курса), cherta:tone (ответ в тонах).
 */
import { app, countsFor, deckById, switchDeck, dayKey } from "../state.ts";
import { $, esc, plural } from "./dom.ts";
import { show } from "./nav.ts";
import { startSession } from "./session.ts";
import { nextCourseStep, openCourseStep } from "./exercise.ts";
import { useTonesToday } from "./tones.ts";
import type { StepId } from "../core/exercise.ts";
import { openSheet, closeSheet } from "./sheet.ts";

type Item =
  | { kind: "deck"; key: string; id: string; title: string; n: number }
  | { kind: "course"; key: string; course: string; lesson: number; step: StepId; title: string }
  | { kind: "tones"; key: string; title: string; n: number };

const TONES_N = 10;
const LS = "cherta.today";
type Saved = { day: string; done: string[]; tones: number };
function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(LS) ?? "null") as Saved | null;
    if (s && s.day === dayKey()) return { day: s.day, done: s.done ?? [], tones: s.tones ?? 0 };
  } catch { /* */ }
  return { day: dayKey(), done: [], tones: 0 };
}
function store(s: Saved) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* */ } }

let plan: Item[] = [];
let current: Item | null = null;

/** План на сегодня: колоды с карточками на сейчас, шаг курса, тоны. */
export async function buildPlan(): Promise<Item[]> {
  const out: Item[] = [];
  for (const d of app.decks) {
    try {
      const c = countsFor(await deckById(d.id));
      const n = c.due + c.learning + c.newLeft;
      if (n > 0) out.push({ kind: "deck", key: `deck:${d.id}`, id: d.id, title: d.title, n });
    } catch { /* колода не загрузилась */ }
  }
  try {
    const c = await nextCourseStep();
    if (c) out.push({ kind: "course", key: `course:${c.key}:${c.lesson}:${c.step}`, course: c.key, lesson: c.lesson, step: c.step, title: c.label });
  } catch { /* курсы не загрузились */ }
  out.push({ kind: "tones", key: "tones", title: "Тоны на слух", n: TONES_N });
  return out;
}

const itemLine = (it: Item, done: boolean) => {
  const sub = it.kind === "deck" ? `${it.n} ${plural(it.n, "карточка", "карточки", "карточек")}` : it.kind === "tones" ? `${it.n} слов` : "шаг курса";
  const icon = it.kind === "deck" ? "卡" : it.kind === "course" ? "课" : "声";
  return `<li class="${done ? "done" : ""}"><span class="ti">${done ? "✓" : icon}</span><span class="tt"><b>${esc(it.title)}</b><small>${sub}</small></span></li>`;
};

/** Карточка «Сегодня» (на «Словах» и в «Карточках»). */
export async function renderToday(el: HTMLElement) {
  el.innerHTML = `<div class="today panel"><div class="today-head"><b>Сегодня</b><span class="hint">собираю план…</span></div></div>`;
  plan = await buildPlan();
  const s = load();
  const left = plan.filter((it) => !s.done.includes(it.key));
  const all = left.length === 0;
  el.innerHTML = `<div class="today panel">
    <div class="today-head"><b>Сегодня</b><span class="hint">${all ? "всё сделано" : `${plan.length - left.length} из ${plan.length}`}</span></div>
    <ol class="today-list">${plan.map((it) => itemLine(it, s.done.includes(it.key))).join("")}</ol>
    ${all ? `<p class="hint">План на сегодня выполнен. Можно повторить что-нибудь ещё или отдохнуть.</p>` : `<button class="btn primary wide" data-today-go>${s.done.length ? "Продолжить" : "Начать"}</button>`}
  </div>`;
  el.querySelector("[data-today-go]")?.addEventListener("click", () => next());
}

function markDone(key: string) {
  const s = load();
  if (!s.done.includes(key)) s.done.push(key);
  store(s);
}

const nextLabel = () => {
  const s = load();
  const it = plan.find((x) => !s.done.includes(x.key) && x.key !== current?.key);
  return it ? `Дальше: ${it.kind === "deck" ? `колода «${it.title}»` : it.kind === "course" ? "шаг курса" : "тоны"} →` : "Готово на сегодня ✓";
};

/** Следующий пункт плана (или итог). */
export async function next() {
  const s = load();
  const it = plan.find((x) => !s.done.includes(x.key));
  current = it ?? null;
  if (!it) { finishAll(); return; }
  if (it.kind === "deck") { await switchDeck(it.id); startSession(); return; }
  if (it.kind === "course") { await openCourseStep(it.course, it.lesson, it.step); return; }
  useTonesToday();
  show("tones");
  renderTonesBar();
}

function finishAll() {
  current = null;
  openSheet("Сегодня", `<div class="stack center"><div class="deck-han" aria-hidden="true">好</div><p>План на сегодня выполнен. Отличная работа!</p><button class="btn primary wide" id="td-ok">Хорошо</button></div>`, (root) => {
    root.querySelector("#td-ok")!.addEventListener("click", () => { closeSheet(); show("words"); });
  });
}

function renderTonesBar() {
  const bar = document.getElementById("tn-today");
  if (!bar) return;
  if (current?.kind !== "tones") { bar.hidden = true; return; }
  const n = Math.min(TONES_N, load().tones);
  bar.hidden = false;
  bar.innerHTML = n >= TONES_N
    ? `<span>Тоны на сегодня: готово ✓</span><button class="btn small primary" data-today-next>${esc(nextLabel())}</button>`
    : `<span>План на сегодня: тоны — ${n} из ${TONES_N}</span>`;
  bar.querySelector("[data-today-next]")?.addEventListener("click", () => next());
}

export function initToday() {
  // занятие карточек закончилось
  document.addEventListener("cherta:done", () => {
    if (current?.kind !== "deck") return;
    markDone(current.key);
    const b = $("done-next");
    b.hidden = false;
    b.textContent = nextLabel();
  });
  $("done-next").addEventListener("click", () => { $("done-next").hidden = true; next(); });
  // шаг курса закончен
  document.addEventListener("cherta:stepdone", (e) => {
    if (current?.kind !== "course") return;
    if ((e as CustomEvent).detail?.passed) markDone(current.key);
    const btns = document.querySelector("#ex-card .ex-btns");
    if (btns) btns.insertAdjacentHTML("afterend", `<button class="btn wide today-next" data-today-next>${esc(nextLabel())}</button>`);
    document.querySelector("#ex-card [data-today-next]")?.addEventListener("click", () => {
      if (current?.kind === "course") markDone(current.key);
      next();
    });
  });
  // ответы в тонах
  document.addEventListener("cherta:tone", () => {
    if (current?.kind !== "tones") return;
    const s = load();
    s.tones++;
    store(s);
    if (s.tones >= TONES_N) markDone("tones");
    renderTonesBar();
  });
}
