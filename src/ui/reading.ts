/**
 * Чтение: короткие тексты по уровню (data/texts.json, написаны для приложения).
 * Тап по слову — пиньинь, значение, «Статья», «+ В колоду». Пиньинь и перевод включаются кнопками,
 * текст читается голосом целиком или по предложениям, в конце — вопросы на понимание.
 */
import { hskLookup, deckById, app, dictIndex } from "../state.ts";
import { segment, isWordTok } from "../core/exercise.ts";
import { parseRef } from "../core/pinyin.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { say, sayAll } from "../speech.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { onShow, onLeave } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { wordByHan } from "./lookup.ts";
import { openAddToDeck } from "./editor.ts";

type Text = { id: string; level: number; title: string; words: [string, string, string][]; lines: [string, string][]; q: { q: string; o: string[]; a: number }[] };

const LS = "cherta.read";
const ui = { py: true, ru: false, done: {} as Record<string, number> };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

let texts: Text[] = [];
let cur: Text | null = null;
let answers: (number | null)[] = [];
let hsk: ((h: string) => { py: string; ru: string } | undefined) | null = null;
const lex = new Set<string>();
let dict: DictIndex | null = null;
const extraPy = new Map<string, string>();

async function ensure() {
  if (!texts.length) texts = await (await fetch("data/texts.json")).json();
  if (!hsk) {
    hsk = await hskLookup();
    for (const d of app.builtinDecks) if (/^hsk[23]-/.test(d.id)) for (const w of (await deckById(d.id)).words) lex.add(w.han);
  }
  if (!dict) dictIndex().then((d) => { dict = d; for (const w of d.han) if (w.length <= 4) lex.add(w); if (cur) renderText(); }).catch(() => {});
}

function pyOf(w: string): string {
  let p = extraPy.get(w) ?? hsk?.(w)?.py ?? "";
  if (!p && dict) { const i = dict.han.indexOf(w); if (i >= 0) p = dictPyToNumeric(dict.py[i], w) ?? ""; }
  try { return p ? pinyinHTML(parseRef(p)) : ""; } catch { return ""; }
}

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

function renderList() {
  $("rd-list").hidden = false;
  $("rd-text").hidden = true;
  const levels = [...new Set(texts.map((t) => t.level))].sort();
  $("rd-list").innerHTML = `<p class="hint">Короткие тексты из слов своего уровня. Нажмите на слово — перевод и «в колоду».</p>`
    + levels.map((lv) => {
      const list = texts.filter((t) => t.level === lv);
      const read = list.filter((t) => ui.done[t.id] !== undefined).length;
      return `<h3 class="grp-title"><span>Уровень ${lv} · HSK ${lv}</span><span class="grp-n">${read}/${list.length}</span></h3>
        <div class="deck-list">${list.map((t) => `<button class="deck-opt" data-text="${t.id}"><span>${esc(t.title)}<small>${t.lines.length} ${plural(t.lines.length, "предложение", "предложения", "предложений")}${t.words.length ? ` · новых слов: ${t.words.length}` : ""}</small></span>${ui.done[t.id] !== undefined ? `<span class="pick-btn on">✓</span>` : `<span class="pick-btn">→</span>`}</button>`).join("")}</div>`;
    }).join("");
  void CHEV;
}

function tok(t: string) {
  return isWordTok(t)
    ? `<button class="w" data-w="${esc(t)}">${ui.py ? `<small class="py">${pyOf(t)}</small>` : ""}<span>${esc(t)}</span></button>`
    : `<span class="p">${esc(t)}</span>`;
}

function renderText() {
  const t = cur;
  if (!t) return;
  $("rd-list").hidden = true;
  $("rd-text").hidden = false;
  $("rd-py").setAttribute("aria-pressed", String(ui.py));
  $("rd-ru").setAttribute("aria-pressed", String(ui.ru));
  $("rd-head").innerHTML = `<h2 class="deck-name">${esc(t.title)}</h2><p class="hint">Уровень ${t.level}</p>`
    + (t.words.length ? `<div class="rd-new"><span class="label">Новые слова</span>${t.words.map(([h, py, ru]) => `<div><b>${esc(h)}</b> <span class="py">${(() => { try { return pinyinHTML(parseRef(py)); } catch { return esc(py); } })()}</span> — ${esc(ru)}</div>`).join("")}</div>` : "");
  const has = (w: string) => lex.has(w) || extraPy.has(w);
  // знак препинания держится со словом перед ним, чтобы «。» не переносилось на новую строку
  const units = (zh: string) => {
    const out: string[] = [];
    for (const x of segment(zh, has, 4)) {
      if (!isWordTok(x) && out.length) out[out.length - 1] = out[out.length - 1].replace(/<\/span>$/, `${tok(x)}</span>`);
      else out.push(`<span class="u">${tok(x)}</span>`);
    }
    return out.join("");
  };
  $("rd-body").innerHTML = t.lines.map(([zh, ru], i) => `<div class="rd-line"><div class="rd-zh">${units(zh)}</div><button class="icon-btn small-ic" data-line="${i}" aria-label="Послушать">${PLAY}</button>${ui.ru ? `<div class="rd-tr">${esc(ru)}</div>` : ""}</div>`).join("");
  const done = ui.done[t.id];
  $("rd-q").innerHTML = t.q.length ? `<h3 class="grp-title"><span>Вопросы</span></h3>${t.q.map((q, i) => `<div class="q"><div class="q-t">${esc(q.q)}</div><div class="q-o">${q.o.map((o, j) => `<button class="chip-btn" data-q="${i}" data-o="${j}" aria-pressed="false">${esc(o)}</button>`).join("")}</div></div>`).join("")}
    <button class="btn primary wide" id="rd-check" disabled>Проверить</button><div id="rd-res"></div>` : `<button class="btn primary wide" id="rd-check">Прочитал</button>`;
  if (done !== undefined) $("rd-res")?.insertAdjacentHTML("beforeend", `<p class="hint">Уже прочитано: ${Math.round(done * 100)}% верных ответов.</p>`);
  answers = t.q.map(() => null);
}

async function gloss(w: string) {
  const box = $("rd-gloss");
  const word = await wordByHan(w);
  box.innerHTML = `<div class="g-head"><b>${esc(w)}</b> <span class="py">${word.ref.length ? pinyinHTML(word.ref) : ""}</span><button class="icon-btn small-ic" data-say="${esc(w)}" aria-label="Послушать">${PLAY}</button></div><div class="g-ru">${esc(word.ru || "—")}</div>
    <div class="g-act"><button class="btn small" data-open>Статья</button><button class="btn small" data-add>+ В колоду</button></div>`;
  box.hidden = false;
  box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true));
  box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
  box.querySelector("[data-say]")!.addEventListener("click", () => say(w));
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function check() {
  const t = cur;
  if (!t) return;
  let good = 0;
  t.q.forEach((q, i) => {
    if (answers[i] === q.a) good++;
    document.querySelectorAll<HTMLButtonElement>(`#rd-q [data-q="${i}"]`).forEach((b) => {
      const j = Number(b.dataset.o);
      b.classList.toggle("right", j === q.a);
      b.classList.toggle("wrong", j === answers[i] && j !== q.a);
      b.disabled = true;
    });
  });
  const score = t.q.length ? good / t.q.length : 1;
  ui.done[t.id] = Math.max(ui.done[t.id] ?? 0, score);
  save();
  $<HTMLButtonElement>("rd-check").disabled = true;
  const res = document.getElementById("rd-res");
  if (res) res.innerHTML = `<div class="chip ${score === 1 ? "ok" : score ? "mid" : "no"}">Верно ${good} из ${t.q.length}</div>`;
  else renderList();
}

export function initReading() {
  onShow("read", async () => {
    $("rd-list").innerHTML = `<p class="hint">Загружаю…</p>`;
    try { await ensure(); } catch { $("rd-list").innerHTML = `<p class="hint">Тексты не загрузились.</p>`; return; }
    if (cur) renderText(); else renderList();
  });
  onLeave("read", () => { try { speechSynthesis.cancel(); } catch { /* */ } });
  $("rd-list").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-text]");
    if (!b) return;
    cur = texts.find((t) => t.id === b.dataset.text) ?? null;
    extraPy.clear();
    for (const [h, py] of cur?.words ?? []) extraPy.set(h, py);
    $("rd-gloss").hidden = true;
    renderText();
    window.scrollTo(0, 0);
  });
  $("rd-back").addEventListener("click", () => { cur = null; try { speechSynthesis.cancel(); } catch { /* */ } renderList(); });
  $("rd-all").addEventListener("click", () => cur && sayAll(cur.lines.map((l) => l[0]), 0.85));
  $("rd-py").addEventListener("click", () => { ui.py = !ui.py; save(); renderText(); });
  $("rd-ru").addEventListener("click", () => { ui.ru = !ui.ru; save(); renderText(); });
  $("rd-body").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const w = t.closest<HTMLButtonElement>("[data-w]");
    if (w) { gloss(w.dataset.w!); return; }
    const l = t.closest<HTMLButtonElement>("[data-line]");
    if (l && cur) say(cur.lines[Number(l.dataset.line)][0], 0.85);
  });
  $("rd-q").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#rd-check")) { check(); return; }
    const q = t.closest<HTMLButtonElement>("[data-q]");
    if (!q || q.disabled) return;
    const i = Number(q.dataset.q);
    answers[i] = Number(q.dataset.o);
    document.querySelectorAll<HTMLButtonElement>(`#rd-q [data-q="${i}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b === q)));
    $<HTMLButtonElement>("rd-check").disabled = answers.some((x) => x === null);
  });
}
