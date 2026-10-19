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
  | { kind: "deck"; key: string; id: string; title: string; group: string; n: number; review: boolean }
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

/** План на сегодня: повторения из всех колод (одной строкой), новые слова — только из текущей колоды, шаг курса, тоны. */
export async function buildPlan(): Promise<Item[]> {
  const out: Item[] = [];
  let fresh: Item | null = null;
  const main = app.deck?.id;
  for (const d of app.decks) {
    if (d.hidden) continue;
    try {
      const c = countsFor(await deckById(d.id));
      const due = c.due + c.learning;
      if (due > 0) out.push({ kind: "deck", key: `rev:${d.id}`, id: d.id, title: d.title, group: d.group ?? d.title, n: due, review: true });
      if (c.newLeft > 0 && (d.id === main || (!main && !fresh)))
        fresh = { kind: "deck", key: `new:${d.id}`, id: d.id, title: d.title, group: d.group ?? d.title, n: c.newLeft, review: false };
    } catch { /* колода не загрузилась */ }
  }
  if (fresh) out.push(fresh);
  try {
    const c = await nextCourseStep();
    if (c) out.push({ kind: "course", key: `course:${c.key}:${c.lesson}:${c.step}`, course: c.key, lesson: c.lesson, step: c.step, title: c.label });
  } catch { /* курсы не загрузились */ }
  out.push({ kind: "tones", key: "tones", title: "Тоны на слух", n: TONES_N });
  return out;
}

const cards = (n: number) => `${n} ${plural(n, "карточка", "карточки", "карточек")}`;
const li = (icon: string, title: string, sub: string, done: boolean, extra = "") =>
  `<li class="${done ? "done" : ""}"><span class="ti">${done ? "✓" : icon}</span><span class="tt"><b>${esc(title)}</b><small>${sub}</small>${extra}</span></li>`;

/** Строки плана: все колоды с повторениями — одна строка (состав по группам колод — по кнопке). */
function rows(s: Saved): { html: string; total: number; done: number } {
  const isDone = (it: Item) => s.done.includes(it.key);
  const rev = plan.filter((it): it is Extract<Item, { kind: "deck" }> => it.kind === "deck" && it.review);
  const out: string[] = [];
  let total = 0, done = 0;
  if (rev.length) {
    total++;
    const left = rev.filter((it) => !isDone(it));
    const fin = !left.length;
    if (fin) done++;
    const groups = new Map<string, number>();
    for (const it of left) groups.set(it.group, (groups.get(it.group) ?? 0) + it.n);
    const n = left.reduce((a, it) => a + it.n, 0);
    const sub = fin ? "готово" : `${cards(n)} · ${groups.size} ${plural(groups.size, "колода", "колоды", "колод")}`;
    const extra = !fin && groups.size > 1
      ? `<button class="linkish td-more" data-td-more aria-expanded="false">состав ▾</button><span class="td-groups" hidden>${[...groups].map(([g, k]) => `<span>${esc(g)} — ${k}</span>`).join("")}</span>`
      : !fin ? `<small>${esc([...groups.keys()][0])}</small>` : "";
    out.push(li("卡", "Повторить карточки", sub, fin, extra));
  }
  for (const it of plan) {
    if (it.kind === "deck" && it.review) continue;
    total++;
    if (isDone(it)) done++;
    if (it.kind === "deck") out.push(li("新", "Новые слова", `${esc(it.title)} · до ${cards(it.n)}`, isDone(it)));
    else if (it.kind === "course") out.push(li("课", it.title, "шаг курса", isDone(it)));
    else out.push(li("声", it.title, `${it.n} слов`, isDone(it)));
  }
  return { html: out.join(""), total, done };
}

/** Карточка «Сегодня» (на «Словах» и в «Карточках»). */
export async function renderToday(el: HTMLElement) {
  el.innerHTML = `<div class="today panel"><div class="today-head"><b>Сегодня</b><span class="hint">собираю план…</span></div></div>`;
  plan = await buildPlan();
  const s = load();
  const r = rows(s);
  const all = r.done >= r.total;
  el.innerHTML = `<div class="today panel">
    <div class="today-head"><b>Сегодня</b><span class="hint">${all ? "всё сделано" : `${r.done} из ${r.total}`}</span></div>
    <ol class="today-list">${r.html}</ol>
    ${all ? `<p class="hint">План на сегодня выполнен. Можно повторить что-нибудь ещё или отдохнуть.</p>` : `<button class="btn primary wide" data-today-go>${s.done.length ? "Продолжить" : "Начать"}</button>`}
  </div>`;
  el.querySelector("[data-today-go]")?.addEventListener("click", () => next());
  el.querySelector("[data-td-more]")?.addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLElement;
    const box = b.nextElementSibling as HTMLElement;
    box.hidden = !box.hidden;
    b.setAttribute("aria-expanded", String(!box.hidden));
    b.textContent = box.hidden ? "состав ▾" : "скрыть ▴";
  });
}

function markDone(key: string) {
  const s = load();
  if (!s.done.includes(key)) s.done.push(key);
  store(s);
}

const nextLabel = () => {
  const s = load();
  const it = plan.find((x) => !s.done.includes(x.key) && x.key !== current?.key);
  return it ? `Дальше: ${it.kind === "deck" ? (it.review ? `повторение «${it.title}»` : "новые слова") : it.kind === "course" ? "шаг курса" : "тоны"} →` : "Готово на сегодня ✓";
};

/** Следующий пункт плана (или итог). */
export async function next() {
  let it: Item | undefined;
  for (;;) {
    const s = load();
    it = plan.find((x) => !s.done.includes(x.key));
    if (!it || it.kind !== "deck") break;
    // карточки общие для колод: повторения могли уже пройти в другой колоде — тогда пункт пропускаем
    try {
      const c = countsFor(await deckById(it.id));
      if ((it.review ? c.due + c.learning : c.newLeft) > 0) break;
    } catch { /* */ }
    markDone(it.key);
  }
  current = it ?? null;
  if (!it) { finishAll(); return; }
  if (it.kind === "deck") { await switchDeck(it.id); startSession({ reviewOnly: it.review }); return; }
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
