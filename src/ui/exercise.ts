/** Упражнения на перевод: уровни HSK, «С китайского» и «На китайский» (плитки), уроки по 10 предложений. */
import { app, hskLookup } from "../state.ts";
import { pickLesson, record, tilesFor, checkAssembled, ruCloseness, isWordTok, type ExItem, type ExProgress } from "../core/exercise.ts";
import { parseRef } from "../core/pinyin.ts";
import * as store from "../store.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { onShow } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { wordByHan } from "./lookup.ts";
import { openAddToDeck } from "./editor.ts";

type Mode = "zhru" | "ruzh";
const LS = "cherta.ex";
const ui = { level: 0, mode: "ruzh" as Mode, pinyin: true };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

const cache = new Map<number, Promise<ExItem[]>>();
function loadLevel(n: number): Promise<ExItem[]> {
  let p = cache.get(n);
  if (!p) {
    p = fetch(`data/ex/hsk${n}.json`).then((r) => { if (!r.ok) throw new Error("нет данных"); return r.json(); });
    p.catch(() => cache.delete(n));
    cache.set(n, p);
  }
  return p;
}

let items: ExItem[] = [];
let lesson: number[] = [];
let pos = 0;
let right = 0;
let prog: ExProgress = {};
let answer: string[] = [];
let pool: string[] = [];
let checked = false;
let py: ((h: string) => { py: string; ru: string } | undefined) | null = null;
let rnd = Math.random;

const key = (i: number) => `${ui.level}:${items[i].zh}`;
const item = () => items[lesson[pos]];

function defaultLevel(): number {
  const m = /^hsk3-(\d)$/.exec(app.deck?.id ?? "");
  return m ? Number(m[1]) : 1;
}

async function start() {
  if (!ui.level) ui.level = defaultLevel();
  renderHead();
  $("ex-q").innerHTML = `<p class="hint">Загружаю предложения…</p>`;
  try { items = await loadLevel(ui.level); } catch {
    $("ex-q").innerHTML = `<p class="hint">Не удалось загрузить предложения. Для первого раза нужен интернет.</p>`;
    return;
  }
  py ??= await hskLookup();
  prog = (await store.getMeta<ExProgress>("ex")) ?? {};
  lesson = pickLesson(items, prog, 10, `${ui.level}:`);
  pos = 0;
  right = 0;
  showItem();
}

function renderHead() {
  $("ex-levels").innerHTML = [1, 2, 3, 4, 5, 6].map((n) => `<button class="chip-btn" data-level="${n}" aria-pressed="${n === ui.level}">HSK ${n}</button>`).join("");
  document.querySelectorAll<HTMLButtonElement>("#ex-modes [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === ui.mode)));
  $<HTMLInputElement>("ex-py").checked = ui.pinyin;
}

function pyOf(w: string): string {
  const e = py?.(w);
  if (!e) return "";
  try { return pinyinHTML(parseRef(e.py)); } catch { return ""; }
}

const tileHTML = (w: string, i: number, where: "pool" | "ans") =>
  `<button class="tile-w" data-${where}="${i}">${ui.pinyin ? `<small class="py">${pyOf(w)}</small>` : ""}<span>${esc(w)}</span></button>`;

function showItem() {
  checked = false;
  $("ex-ans").classList.remove("ok", "bad");
  $("ex-res").hidden = true;
  $("ex-gloss").hidden = true;
  $("ex-prog").style.width = `${(100 * pos) / Math.max(1, lesson.length)}%`;
  if (pos >= lesson.length) { finish(); return; }
  const it = item();
  $("ex-count").textContent = `${pos + 1} из ${lesson.length}`;
  if (ui.mode === "zhru") {
    $("ex-task").textContent = "Переведите на русский";
    $("ex-q").innerHTML = `<div class="ex-zh">${it.t.map((t) => isWordTok(t) ? `<button class="w" data-w="${esc(t)}">${ui.pinyin ? `<small class="py">${pyOf(t)}</small>` : ""}<span>${esc(t)}</span></button>` : `<span class="p">${esc(t)}</span>`).join("")}</div>`;
    $("ex-ru-in").hidden = false;
    $<HTMLTextAreaElement>("ex-ru-in").value = "";
    $("ex-ans").hidden = $("ex-pool").hidden = true;
    $("ex-btns").innerHTML = `<button class="btn primary wide" id="ex-check">Показать перевод</button>`;
  } else {
    $("ex-task").textContent = "Соберите перевод на китайский";
    $("ex-q").innerHTML = `<div class="ex-ru">${esc(it.ru)}</div>`;
    $("ex-ru-in").hidden = true;
    const allWords = items.flatMap((x) => x.t.filter(isWordTok));
    pool = tilesFor(it, allWords, rnd, Math.min(3, 1 + Math.floor(it.t.length / 5)));
    answer = [];
    $("ex-ans").hidden = $("ex-pool").hidden = false;
    renderTiles();
    $("ex-btns").innerHTML = `<button class="btn primary wide" id="ex-check" disabled>Проверить</button>`;
  }
}

function renderTiles() {
  $("ex-ans").innerHTML = answer.map((w, i) => tileHTML(w, i, "ans")).join("") || `<span class="hint">Нажимайте на слова снизу по порядку</span>`;
  const used = [...answer];
  $("ex-pool").innerHTML = pool.map((w, i) => {
    const k = used.indexOf(w);
    if (k >= 0) { used.splice(k, 1); return `<span class="tile-w ghost">${esc(w)}</span>`; }
    return tileHTML(w, i, "pool");
  }).join("");
  const b = document.getElementById("ex-check") as HTMLButtonElement | null;
  if (b) b.disabled = !answer.length;
}

async function check() {
  if (checked) { pos++; showItem(); return; }
  checked = true;
  const it = item();
  let ok: boolean | null;
  let html = "";
  if (ui.mode === "ruzh") {
    ok = checkAssembled(answer, it);
    html = `<div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не совсем"}</div>${ok ? "" : `<div class="ex-zh ans">${esc(it.zh)}</div>`}`;
    $("ex-ans").classList.toggle("ok", ok);
    $("ex-ans").classList.toggle("bad", !ok);
  } else {
    const mine = $<HTMLTextAreaElement>("ex-ru-in").value.trim();
    const close = mine ? ruCloseness(mine, it.ru) : null;
    ok = null;
    html = `<div class="ex-ru ans">${esc(it.ru)}</div>${close !== null ? `<div class="chip ${close >= 0.5 ? "ok" : close >= 0.25 ? "mid" : "no"}">Совпадение по словам: ${Math.round(close * 100)}%</div>` : ""}`;
  }
  $("ex-res").innerHTML = html;
  $("ex-res").hidden = false;
  if (ok === null) {
    $("ex-btns").innerHTML = `<button class="btn" data-self="0">Не понял</button><button class="btn primary" data-self="1">Понял</button>`;
  } else {
    await mark(ok);
    $("ex-btns").innerHTML = `<button class="btn primary wide" id="ex-check">Дальше</button>`;
  }
}

async function mark(ok: boolean) {
  if (ok) right++;
  prog = record(prog, key(lesson[pos]), ok);
  await store.setMeta("ex", prog);
}

function finish() {
  $("ex-count").textContent = "";
  $("ex-task").textContent = "Урок пройден";
  $("ex-q").innerHTML = `<div class="ex-done"><b>${right}</b> из ${lesson.length} ${plural(lesson.length, "предложения", "предложений", "предложений")} без ошибок</div>`;
  $("ex-ru-in").hidden = true;
  $("ex-ans").hidden = $("ex-pool").hidden = true;
  const seen = items.filter((x) => prog[`${ui.level}:${x.zh}`]).length;
  $("ex-res").innerHTML = `<p class="hint">Пройдено предложений уровня: ${seen} из ${items.length}.</p>`;
  $("ex-res").hidden = false;
  $("ex-btns").innerHTML = `<button class="btn primary wide" id="ex-again">Ещё 10 предложений</button>`;
}

async function gloss(w: string) {
  const box = $("ex-gloss");
  const word = await wordByHan(w);
  box.innerHTML = `<div class="g-head"><b>${esc(w)}</b> <span class="py">${word.ref.length ? pinyinHTML(word.ref) : ""}</span></div><div class="g-ru">${esc(word.ru || "—")}</div>
    <div class="g-act"><button class="btn small" data-open="${esc(word.id)}">Статья</button><button class="btn small" data-add>+ В колоду</button></div>`;
  box.hidden = false;
  box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true));
  box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
}

export function initExercise() {
  onShow("ex", start);
  $("ex-levels").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
    if (!b) return;
    ui.level = Number(b.dataset.level); save(); start();
  });
  $("ex-modes").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
    if (!b) return;
    ui.mode = b.dataset.mode as Mode; save(); renderHead(); if (items.length && pos < lesson.length) showItem();
  });
  $("ex-py").addEventListener("change", (e) => { ui.pinyin = (e.target as HTMLInputElement).checked; save(); if (!checked && pos < lesson.length) { if (ui.mode === "ruzh") renderTiles(); else showItem(); } });
  $("ex-pool").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pool]");
    if (!b || checked) return;
    answer.push(pool[Number(b.dataset.pool)]);
    renderTiles();
  });
  $("ex-ans").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-ans]");
    if (!b || checked) return;
    answer.splice(Number(b.dataset.ans), 1);
    renderTiles();
  });
  $("ex-q").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-w]");
    if (b) gloss(b.dataset.w!);
  });
  $("ex-btns").addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#ex-check")) { check(); return; }
    if (t.closest("#ex-again")) { start(); return; }
    const s = t.closest<HTMLButtonElement>("[data-self]");
    if (s) { await mark(s.dataset.self === "1"); pos++; showItem(); }
  });
}
