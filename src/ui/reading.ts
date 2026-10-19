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
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import * as store from "../store.ts";
import { parseTexts, emptyLib, inLib, type ReadText, type ReadLib } from "../core/reading.ts";

type Text = ReadText;

/** Вид (пиньинь, перевод) и свёрнутые уровни — только на этом устройстве. Библиотека и результаты — meta `reading`. */
const LS = "cherta.read";
const ui = { py: true, ru: false, fold: {} as Record<string, boolean>, done: undefined as Record<string, number> | undefined };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { const { done: _d, ...rest } = ui; localStorage.setItem(LS, JSON.stringify(rest)); } catch { /* */ } };

let lib: ReadLib = emptyLib();
async function loadLib() {
  lib = { ...emptyLib(), ...((await store.getMeta<ReadLib>("reading")) ?? {}) };
  // раньше результаты хранились в localStorage — переносим один раз
  if (ui.done) { for (const [k, v] of Object.entries(ui.done)) lib.done[k] = Math.max(v, lib.done[k] ?? 0); ui.done = undefined; save(); await saveLib(); }
}
const saveLib = () => store.setMeta("reading", lib);
const mine = (): Text[] => [...builtin.filter((t) => inLib(lib, t.id)), ...lib.own];

let builtin: Text[] = [];
let texts: Text[] = [];
let cur: Text | null = null;
let answers: (number | null)[] = [];
let hsk: ((h: string) => { py: string; ru: string } | undefined) | null = null;
const lex = new Set<string>();
let dict: DictIndex | null = null;
const extraPy = new Map<string, string>();

async function ensure() {
  if (!builtin.length) builtin = await (await fetch("data/texts.json")).json();
  await loadLib();
  texts = mine();
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

const lvlName = (lv: number) => (lv ? `Уровень ${lv} · HSK ${lv}` : "Без уровня");
const TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`;

function renderList() {
  $("rd-list").hidden = false;
  $("rd-text").hidden = true;
  texts = mine();
  const tools = `<div class="tools"><button class="btn small primary" id="rd-cat">Добавить из готовых</button><button class="btn small" id="rd-file">Загрузить файл</button><button class="btn small" id="rd-help">Формат файла</button></div>`;
  if (!texts.length) {
    $("rd-list").innerHTML = `<div class="empty-start panel"><span class="han-big" aria-hidden="true">读</span><h2>Текстов пока нет</h2>
      <p class="hint">Добавьте готовые тексты по своему уровню или загрузите свои (например, из учебника). Нажатие на слово в тексте — перевод и «в колоду».</p></div>${tools}`;
    return;
  }
  const levels = [...new Set(texts.map((t) => t.level))].sort((x, y) => (x || 99) - (y || 99));
  const unreadLv = levels.find((lv) => texts.some((t) => t.level === lv && lib.done[t.id] === undefined));
  $("rd-list").innerHTML = tools + levels.map((lv) => {
    const list = texts.filter((t) => t.level === lv);
    const read = list.filter((t) => lib.done[t.id] !== undefined).length;
    const key = `lv${lv}`;
    const open = ui.fold[key] ?? (levels.length <= 2 || lv === unreadLv);
    return `<button class="fold-head" data-rfold="${key}" aria-expanded="${open}"><span>${esc(lvlName(lv))}</span><small>${read}/${list.length}</small>${CHEV}</button>
      <div class="deck-list" ${open ? "" : "hidden"}>${list.map((t) => `<div class="pick-row"><button class="deck-opt" data-text="${esc(t.id)}"><span>${esc(t.title)}<small>${t.lines.length} ${plural(t.lines.length, "предложение", "предложения", "предложений")}${t.words.length ? ` · новых слов: ${t.words.length}` : ""}${t.id.startsWith("o-") ? " · свой" : ""}</small></span>${lib.done[t.id] !== undefined ? `<span class="pick-btn on">✓</span>` : ""}</button><button class="pick-eye" data-rdel="${esc(t.id)}" aria-label="Убрать «${esc(t.title)}»">${TRASH}</button></div>`).join("")}</div>`;
  }).join("") + `<div class="confirm" id="rd-confirm" hidden></div>`;
}

/** Каталог готовых текстов: по уровням, «+» — добавить, «Добавить все» на уровень. */
function openCatalog() {
  const levels = [...new Set(builtin.map((t) => t.level))].sort();
  const row = (t: Text) => `<button class="deck-opt" data-cadd="${esc(t.id)}" aria-pressed="${inLib(lib, t.id)}"><span>${esc(t.title)}<small>${t.lines.length} ${plural(t.lines.length, "предложение", "предложения", "предложений")}${t.q.length ? ` · вопросов: ${t.q.length}` : ""}</small></span><span class="pick-btn ${inLib(lib, t.id) ? "on" : ""}">${inLib(lib, t.id) ? "✓" : "+"}</span></button>`;
  const body = `<p class="hint">Тексты написаны для приложения: в тексте уровня N только слова HSK 1…N (старый стандарт, как в учебниках) и несколько новых слов с переводом.</p>`
    + levels.map((lv) => {
      const list = builtin.filter((t) => t.level === lv);
      return `<div class="cat-lv"><h3 class="grp-title"><span>${esc(lvlName(lv))}</span><button class="btn small" data-call="${lv}">Добавить все</button></h3><div class="deck-list">${list.map(row).join("")}</div></div>`;
    }).join("") + `<button class="btn primary wide" id="rc-ok">Готово</button>`;
  openSheet("Готовые тексты", `<div class="pick-decks">${body}</div>`, (root) => {
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("#rc-ok")) { closeSheet(); renderList(); return; }
      const all = t.closest<HTMLButtonElement>("[data-call]");
      const one = t.closest<HTMLButtonElement>("[data-cadd]");
      if (!all && !one) return;
      const ids = all ? builtin.filter((x) => x.level === Number(all.dataset.call)).map((x) => x.id) : [one!.dataset.cadd!];
      const on = all ? true : !inLib(lib, ids[0]);
      for (const id of ids) lib.lib[id] = on ? Date.now() : -Date.now();
      await saveLib();
      for (const id of ids) {
        const b = root.querySelector<HTMLElement>(`[data-cadd="${CSS.escape(id)}"]`);
        if (b) b.outerHTML = row(builtin.find((x) => x.id === id)!);
      }
    });
  });
}

const FORMAT_HELP = `<div class="stack"><p>Обычный текстовый файл (.txt, UTF-8). Можно просто вставить китайский текст — он разделится на предложения. Или подробно:</p>
<pre class="fmt">=== 2 | Название текста
+ 工厂 | gong1 chang3 | завод
我在工厂工作。 | Я работаю на заводе.
工厂离我家不远。 | Завод недалеко от дома.
? Где работает автор? | В школе | На заводе* | В банке</pre>
<p class="hint">«=== уровень | название» — начало текста (в одном файле может быть много текстов), «+» — новое слово с пиньинем и переводом, «китайский | перевод» — строка (перевод можно не писать), «?» — вопрос, верный ответ со звёздочкой.</p></div>`;

async function loadFile(f: File) {
  const list = parseTexts(await f.text(), `o-${Date.now().toString(36)}`);
  if (!list.length) { openSheet("Загрузка текстов", `<p class="note danger">В файле не нашлось китайского текста.</p>${FORMAT_HELP}`); return; }
  const fallback = f.name.replace(/\.[^.]+$/, "");
  for (const t of list) {
    if (t.title === "Мой текст" && list.length === 1) t.title = fallback;
    lib.own.push(t);
    lib.lib[t.id] = Date.now();
  }
  await saveLib();
  renderList();
  openSheet("Загрузка текстов", `<p>Добавлено ${list.length} ${plural(list.length, "текст", "текста", "текстов")}: ${list.slice(0, 5).map((t) => `«${esc(t.title)}»`).join(", ")}${list.length > 5 ? "…" : ""}</p><button class="btn primary wide" id="rl-ok">Хорошо</button>`, (root) => {
    root.querySelector("#rl-ok")!.addEventListener("click", closeSheet);
  });
}

async function removeText(id: string) {
  lib.lib[id] = -Date.now();
  lib.own = lib.own.filter((t) => t.id !== id);
  await saveLib();
  renderList();
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
  const done = lib.done[t.id];
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
  lib.done[t.id] = Math.max(lib.done[t.id] ?? 0, score);
  void saveLib();
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
  $("rd-file-in").addEventListener("change", (e) => {
    const inp = e.target as HTMLInputElement;
    const f = inp.files?.[0];
    inp.value = "";
    if (f) loadFile(f);
  });
  $("rd-list").addEventListener("click", (e) => {
    const t0 = e.target as HTMLElement;
    if (t0.closest("#rd-cat")) { openCatalog(); return; }
    if (t0.closest("#rd-file")) { $("rd-file-in").click(); return; }
    if (t0.closest("#rd-help")) { openSheet("Формат файла с текстами", FORMAT_HELP); return; }
    const f = t0.closest<HTMLButtonElement>("[data-rfold]");
    if (f) {
      const open = f.getAttribute("aria-expanded") !== "true";
      f.setAttribute("aria-expanded", String(open));
      (f.nextElementSibling as HTMLElement).hidden = !open;
      ui.fold[f.dataset.rfold!] = open;
      save();
      return;
    }
    const del = t0.closest<HTMLButtonElement>("[data-rdel]");
    if (del) {
      const id = del.dataset.rdel!;
      const tt = texts.find((x) => x.id === id);
      confirmInline($("rd-confirm"), id.startsWith("o-") ? `Удалить свой текст «${tt?.title ?? ""}»?` : `Убрать «${tt?.title ?? ""}» из списка? Вернуть можно в «Готовых».`, id.startsWith("o-") ? "Удалить" : "Убрать", () => removeText(id));
      $("rd-confirm").scrollIntoView({ block: "nearest" });
      return;
    }
    const b = t0.closest<HTMLButtonElement>("[data-text]");
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
