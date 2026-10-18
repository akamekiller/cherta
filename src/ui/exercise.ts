/**
 * Упражнения. Источник: колода (предложения из корпуса БКРС под её слова), тема (диалоги + предложения),
 * свой набор из файла (уроки учебника и т. п.). Виды: перевод на китайский (клавиатура, рукой или плитками),
 * пропуски, аудирование, диалоги с вопросами. Занятие — N заданий, прогресс по предложениям в meta «ex».
 */
import { app, hskLookup, deckById, exCorpus, exDialogs, loadExSets, saveExSets, dictIndex, type ExSetFile } from "../state.ts";
import {
  KINDS, parseCorpus, segment, sentencesFor, gapTask, diffZh, parseExSet, planSession, tilesFor, checkAssembled, isWordTok, record,
  type Kind, type Sent, type Dialog, type Task, type ExProgress, type ExSet,
} from "../core/exercise.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { parseRef } from "../core/pinyin.ts";
import * as store from "../store.ts";
import { say, sayAll } from "../speech.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { onShow, onLeave } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { wordByHan } from "./lookup.ts";
import { openAddToDeck } from "./editor.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import { setPickLabel } from "./deckpick.ts";
import { mountHwPad, type HwPad } from "./hwpad.ts";

/* ---------- настройки экрана ---------- */

const LS = "cherta.ex2";
const ui = { src: "", lesson: -1, kinds: ["tr", "gap", "listen", "dialog"] as Kind[], n: 10, pinyin: true, trMode: "type" as "type" | "tiles" };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

/** Темы с диалогами и соответствующие колоды «Жизнь в Китае». */
const THEME_DECK: Record<string, string> = { "Магазин": "life-shop", "Транспорт": "life-transport", "Общежитие": "life-dorm", "Банк": "life-bank", "Врач": "life-doctor", "Университет": "life-uni" };

/* ---------- словарь для пиньиня и деления на слова ---------- */

let hsk: ((h: string) => { py: string; ru: string } | undefined) | null = null;
let hskWords = new Set<string>();
let dict: DictIndex | null = null;
let dictWords: Set<string> | null = null;

async function ensureLex() {
  if (!hsk) {
    hsk = await hskLookup();
    for (const d of app.builtinDecks) if (/^hsk[23]-/.test(d.id)) for (const w of (await deckById(d.id)).words) hskWords.add(w.han);
  }
  if (!dict) dictIndex().then((d) => { dict = d; dictWords = new Set(d.han.filter((w) => w.length <= 4)); }).catch(() => {});
}
const lexHas = (w: string) => hskWords.has(w) || !!dictWords?.has(w);
const seg = (zh: string) => segment(zh, lexHas, 4);

function pyOf(w: string): string {
  const e = hsk?.(w);
  let p = e?.py ?? "";
  if (!p && dict) { const i = dict.han.indexOf(w); if (i >= 0) p = dictPyToNumeric(dict.py[i], w) ?? ""; }
  if (!p) return "";
  try { return pinyinHTML(parseRef(p)); } catch { return ""; }
}

const tokHTML = (t: string, extra = "") => isWordTok(t)
  ? `<button class="w${extra}" data-w="${esc(t)}">${ui.pinyin ? `<small class="py">${pyOf(t)}</small>` : ""}<span>${esc(t)}</span></button>`
  : `<span class="p">${esc(t)}</span>`;

/* ---------- источники ---------- */

type Pool = { sents: Sent[]; dialogs: Dialog[]; focus: Set<string>; title: string };
let corpus: Sent[] | null = null;
let sets: ExSetFile[] = [];
let parsedSets = new Map<string, ExSet>();

async function getCorpus(): Promise<Sent[]> {
  corpus ??= parseCorpus(await exCorpus());
  return corpus;
}

const levelOf = (deckId: string) => Number(/^hsk[23]-(\d)$/.exec(deckId)?.[1] ?? 2);

/** Простые слова: HSK 2.0 и 3.0 до уровня L включительно. */
async function basicWords(L: number): Promise<Set<string>> {
  const out = new Set<string>();
  for (const d of app.builtinDecks) {
    const m = /^hsk[23]-(\d)$/.exec(d.id);
    if (m && Number(m[1]) <= L) for (const w of (await deckById(d.id)).words) out.add(w.han);
  }
  return out;
}

function setOf(id: string): ExSet | null {
  if (parsedSets.has(id)) return parsedSets.get(id)!;
  const f = sets.find((x) => x.id === id);
  if (!f) return null;
  const s = parseExSet(f.text, f.id, seg);
  s.title = f.title || s.title;
  parsedSets.set(id, s);
  return s;
}

async function buildPool(): Promise<Pool> {
  const [kind, ...rest] = ui.src.split(":");
  const id = rest.join(":");
  if (kind === "set") {
    const s = setOf(id);
    if (!s) return { sents: [], dialogs: [], focus: new Set(), title: "Набор не найден" };
    const lessons = ui.lesson >= 0 && s.lessons[ui.lesson] ? [s.lessons[ui.lesson]] : s.lessons;
    const sents = lessons.flatMap((l) => l.sents);
    return { sents, dialogs: lessons.flatMap((l) => l.dialogs), focus: new Set(sents.flatMap((x) => x.t.filter(isWordTok))), title: s.title };
  }
  const all = await exDialogs().catch(() => [] as Dialog[]);
  if (kind === "theme") {
    const dialogs = all.filter((d) => d.theme === id);
    const words = new Set(dialogs.flatMap((d) => d.lines.flatMap((l) => seg(l[1]).filter(isWordTok))));
    const deckId = THEME_DECK[id];
    if (deckId) for (const w of (await deckById(deckId)).words) words.add(w.han);
    const level = Math.max(2, ...dialogs.map((d) => d.level ?? 2));
    const sents = sentencesFor(await getCorpus(), words, await basicWords(Math.min(level, 3)), 300);
    return { sents, dialogs, focus: words, title: `Тема: ${id}` };
  }
  // колода
  const deckId = id || app.deck?.id || "hsk2-1";
  const deck = await deckById(deckId);
  const words = new Set(deck.words.map((w) => w.han));
  const L = levelOf(deckId);
  const sents = sentencesFor(await getCorpus(), words, await basicWords(L), 300);
  const lifeTheme = Object.entries(THEME_DECK).find(([, d]) => d === deckId)?.[0];
  const dialogs = all.filter((d) => (lifeTheme ? d.theme === lifeTheme : (d.level ?? 2) <= Math.max(L, 1)));
  return { sents, dialogs, focus: words, title: deck.title };
}

function srcTitle(): string {
  const [kind, ...rest] = ui.src.split(":");
  const id = rest.join(":");
  if (kind === "set") return sets.find((s) => s.id === id)?.title ?? "Мой набор";
  if (kind === "theme") return `Тема: ${id}`;
  return app.decks.find((d) => d.id === id)?.title ?? "Колода";
}

async function pickSource() {
  const all = await exDialogs().catch(() => [] as Dialog[]);
  const themes = [...new Set(all.map((d) => d.theme).filter((x): x is string => !!x))];
  const row = (key: string, name: string, sub: string) =>
    `<button class="deck-opt" data-pick="${esc(key)}" aria-current="${key === ui.src}"><span>${esc(name)}<small>${esc(sub)}</small></span>${key === ui.src ? `<span class="pick-btn on">✓</span>` : ""}</button>`;
  const groups = new Map<string, string[]>();
  for (const d of app.decks.filter((x) => !x.hidden)) {
    const g = d.user ? "Свои колоды" : d.group || "Колоды";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(row(`deck:${d.id}`, d.title, `${d.count} ${plural(d.count, "слово", "слова", "слов")} — предложения с этими словами`));
  }
  const body = (sets.length ? `<h3 class="grp-title"><span>Мои наборы</span></h3><div class="deck-list">${sets.map((s) => row(`set:${s.id}`, s.title, "из файла")).join("")}</div>` : "")
    + `<h3 class="grp-title"><span>Темы с диалогами</span></h3><div class="deck-list">${themes.map((t) => row(`theme:${t}`, t, `${all.filter((d) => d.theme === t).length} ${plural(all.filter((d) => d.theme === t).length, "диалог", "диалога", "диалогов")} и предложения`)).join("")}</div>`
    + [...groups].map(([g, rows]) => `<h3 class="grp-title"><span>${esc(g)}</span></h3><div class="deck-list">${rows.join("")}</div>`).join("");
  openSheet("Откуда брать задания", `<div class="pick-decks">${body}</div>`, (root) => {
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pick]");
      if (!b) return;
      ui.src = b.dataset.pick!;
      ui.lesson = -1;
      save();
      closeSheet();
      renderSetup();
    });
  });
}

/* ---------- экран выбора ---------- */

let poolCache: { key: string; pool: Promise<Pool> } | null = null;
function currentPool(): Promise<Pool> {
  const key = `${ui.src}|${ui.lesson}|${sets.length}`;
  if (!poolCache || poolCache.key !== key) poolCache = { key, pool: buildPool() };
  return poolCache.pool;
}

async function renderSetup() {
  $("ex-setup").hidden = false;
  $("ex-run").hidden = true;
  if (!ui.src) ui.src = `deck:${app.deck?.id ?? "hsk2-1"}`;
  setPickLabel("ex-src", srcTitle());
  $("ex-kinds").innerHTML = KINDS.map((k) => `<button class="chip-btn" data-kind="${k.id}" aria-pressed="${ui.kinds.includes(k.id)}" title="${esc(k.hint)}">${k.name}</button>`).join("");
  $("ex-n").textContent = String(ui.n);
  $<HTMLInputElement>("ex-py").checked = ui.pinyin;
  renderSets();
  // уроки набора
  const [kind, ...rest] = ui.src.split(":");
  const set = kind === "set" ? setOf(rest.join(":")) : null;
  $("ex-lessons").hidden = !set || set.lessons.length < 2;
  if (set) $("ex-lessons").innerHTML = [`<button class="chip-btn" data-lesson="-1" aria-pressed="${ui.lesson < 0}">Все уроки</button>`,
    ...set.lessons.map((l, i) => `<button class="chip-btn" data-lesson="${i}" aria-pressed="${ui.lesson === i}">${esc(l.title)}</button>`)].join("");
  $("ex-src-info").textContent = "Подбираю задания…";
  $<HTMLButtonElement>("ex-start").disabled = true;
  try {
    await ensureLex();
    const p = await currentPool();
    const nd = p.dialogs.length, ns = p.sents.length;
    $("ex-src-info").textContent = `${ns} ${plural(ns, "предложение", "предложения", "предложений")}${nd ? `, ${nd} ${plural(nd, "диалог", "диалога", "диалогов")}` : ""}`;
    const usable = (ns && ui.kinds.some((k) => k !== "dialog")) || (nd && ui.kinds.includes("dialog"));
    $<HTMLButtonElement>("ex-start").disabled = !usable;
    $("ex-start").textContent = usable ? "Начать" : ns || nd ? "Выберите вид заданий" : "Нет подходящих заданий";
  } catch {
    $("ex-src-info").textContent = "Не удалось загрузить предложения. Для первого раза нужен интернет.";
  }
}

function renderSets() {
  $("ex-set-list").innerHTML = sets.length
    ? sets.map((s) => {
      const p = setOf(s.id);
      const n = p ? p.lessons.reduce((a, l) => a + l.sents.length, 0) : 0;
      const d = p ? p.lessons.reduce((a, l) => a + l.dialogs.length, 0) : 0;
      return `<div class="deck-opt set-row-x"><button class="set-open" data-set="${esc(s.id)}"><span>${esc(s.title)}<small>${p?.lessons.length ?? 0} ${plural(p?.lessons.length ?? 0, "урок", "урока", "уроков")} · ${n} ${plural(n, "предложение", "предложения", "предложений")}${d ? ` · ${d} ${plural(d, "диалог", "диалога", "диалогов")}` : ""}</small></span></button><button class="dt-menu" data-del-set="${esc(s.id)}" aria-label="Удалить набор">×</button></div>`;
    }).join("") + `<div class="confirm" id="ex-set-confirm" hidden></div>`
    : `<p class="hint pad-msg">Загрузите текстовый файл с предложениями и диалогами — например, уроки учебника. Наборы хранятся только на этом устройстве.</p>`;
}

const FORMAT_HELP = `<p class="hint">Обычный текстовый файл (.txt, UTF-8). Строки:</p>
<pre class="fmt"># Название набора
## Урок 1. Знакомство
你好！ | Привет!
我是学生。 | Я студент.
@ В магазине
A: 你要什么？ | Что вам нужно?
B: 我要苹果。 | Мне яблоки.
? Что нужно B? | бананы | яблоки* | хлеб</pre>
<p class="hint"><b>#</b> — название, <b>##</b> — урок, строка «китайский | русский» — предложение (вместо | можно Tab), <b>@</b> — начало диалога (до пустой строки), <b>?</b> — вопрос к диалогу, верный вариант со звёздочкой. Русский перевод можно не писать — тогда предложение будет только в пропусках и аудировании.</p>`;

/* ---------- занятие ---------- */

let tasks: Task[] = [];
let pos = 0;
let right = 0;
let prog: ExProgress = {};
let pool: Pool | null = null;
let rnd: () => number = Math.random;
let answered = false;
// состояние текущего задания
let tiles: string[] = [];
let picked: string[] = [];
let gap: ReturnType<typeof gapTask> = null;
let qAns: (number | null)[] = [];
let hwPad: HwPad | null = null;

async function startSession() {
  pool = await currentPool();
  prog = (await store.getMeta<ExProgress>("ex")) ?? {};
  rnd = Math.random;
  tasks = planSession(pool.sents, pool.dialogs, ui.kinds, prog, ui.n, rnd);
  if (!tasks.length) return;
  pos = 0;
  right = 0;
  $("ex-setup").hidden = true;
  $("ex-run").hidden = false;
  showTask();
}

const wordPool = () => [...new Set([...(pool?.focus ?? []), ...(pool?.sents ?? []).slice(0, 200).flatMap((s) => s.t.filter(isWordTok))])];

function showTask() {
  answered = false;
  hwPad = null;
  $("ex-gloss").hidden = true;
  $("ex-prog").style.width = `${(100 * pos) / Math.max(1, tasks.length)}%`;
  if (pos >= tasks.length) { finish(); return; }
  $("ex-count").textContent = `${pos + 1} из ${tasks.length}`;
  const t = tasks[pos];
  const card = $("ex-card");
  if (t.kind === "dialog") { renderDialog(t.dialog); return; }
  const s = t.sent;
  if (t.kind === "tr") {
    if (!s.ru) { tasks[pos] = { kind: "gap", sent: s }; showTask(); return; }
    card.innerHTML = `<div class="ex-top"><span class="label">Переведите на китайский</span></div>
      <div class="ex-ru">${esc(s.ru)}</div>
      <div class="seg tr-mode" role="group" aria-label="Как отвечать"><button data-tr="type" aria-pressed="${ui.trMode === "type"}">Написать</button><button data-tr="tiles" aria-pressed="${ui.trMode === "tiles"}">Собрать из слов</button></div>
      <div id="ex-tr-body"></div>
      <div class="ex-res" id="ex-res" hidden></div>
      <div class="ex-btns" id="ex-btns"><button class="btn primary wide" data-act="check">Проверить</button></div>`;
    renderTrBody(s);
    return;
  }
  if (t.kind === "gap") {
    gap = gapTask(s, pool?.focus ?? new Set(), wordPool(), rnd);
    if (!gap) { pos++; showTask(); return; }
    card.innerHTML = `<div class="ex-top"><span class="label">Вставьте пропущенное слово</span><button class="icon-btn small-ic" data-act="say" aria-label="Послушать">${PLAY}</button></div>
      <div class="ex-zh">${s.t.map((x, i) => (i === gap!.at ? `<span class="gap-slot">＿＿</span>` : tokHTML(x))).join("")}</div>
      ${s.ru ? `<div class="ex-ru small">${esc(s.ru)}</div>` : ""}
      <div class="gap-opts">${gap.options.map((o) => `<button class="tile-w" data-opt="${esc(o)}">${ui.pinyin ? `<small class="py">${pyOf(o)}</small>` : ""}<span>${esc(o)}</span></button>`).join("")}</div>
      <div class="ex-res" id="ex-res" hidden></div>
      <div class="ex-btns" id="ex-btns"></div>`;
    return;
  }
  // аудирование
  tiles = tilesFor({ zh: s.zh, ru: s.ru, t: s.t }, wordPool(), rnd, Math.min(3, 1 + Math.floor(s.t.length / 5)));
  picked = [];
  card.innerHTML = `<div class="ex-top"><span class="label">Послушайте и соберите предложение</span></div>
    <div class="listen-btns"><button class="btn" data-act="say">${PLAY} Слушать</button><button class="btn" data-act="slow">Медленно</button></div>
    <div class="ex-ans" id="ex-ans"></div><div class="ex-pool" id="ex-pool"></div>
    <div class="ex-res" id="ex-res" hidden></div>
    <div class="ex-btns" id="ex-btns"><button class="btn primary wide" data-act="check" disabled>Проверить</button></div>`;
  renderTiles();
  setTimeout(() => say(s.zh, 0.8), 250);
}

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;

function renderTrBody(s: Sent) {
  const body = $("ex-tr-body");
  if (ui.trMode === "tiles") {
    tiles = tilesFor({ zh: s.zh, ru: s.ru, t: s.t }, wordPool(), rnd, Math.min(3, 1 + Math.floor(s.t.length / 5)));
    picked = [];
    body.innerHTML = `<div class="ex-ans" id="ex-ans"></div><div class="ex-pool" id="ex-pool"></div>`;
    renderTiles();
  } else {
    body.innerHTML = `<div class="tr-in-row"><input id="ex-in" lang="zh-CN" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Китайская раскладка или «рукой»" enterkeyhint="done"><button class="icon-btn" data-act="hw" aria-label="Писать рукой" aria-pressed="false">✍</button></div><div id="ex-hw" hidden></div>`;
    hwPad = mountHwPad($("ex-hw"), (ch) => { const i = $<HTMLInputElement>("ex-in"); i.value += ch; },
      { label: "⌫", onClick: () => { const i = $<HTMLInputElement>("ex-in"); i.value = [...i.value].slice(0, -1).join(""); } });
  }
}

function renderTiles() {
  const pyT = (w: string) => (ui.pinyin && isWordTok(w) ? `<small class="py">${pyOf(w)}</small>` : "");
  $("ex-ans").innerHTML = picked.map((w, i) => `<button class="tile-w" data-ans="${i}">${pyT(w)}<span>${esc(w)}</span></button>`).join("") || `<span class="hint">Нажимайте на слова снизу по порядку</span>`;
  const used = [...picked];
  $("ex-pool").innerHTML = tiles.map((w, i) => {
    const k = used.indexOf(w);
    if (k >= 0) { used.splice(k, 1); return `<span class="tile-w ghost"><span>${esc(w)}</span></span>`; }
    return `<button class="tile-w" data-pool="${i}">${pyT(w)}<span>${esc(w)}</span></button>`;
  }).join("");
  const b = $("ex-btns").querySelector<HTMLButtonElement>("[data-act=check]");
  if (b) b.disabled = !picked.length;
}

function sentenceView(s: Sent, mark?: number) {
  return `<div class="ex-zh ans">${s.t.map((x, i) => tokHTML(x, i === mark ? " hl" : "")).join("")}</div>${s.ru ? `<div class="ex-ru small">${esc(s.ru)}</div>` : ""}`;
}

async function result(ok: boolean, html: string, selfGrade = false) {
  answered = true;
  const res = $("ex-res");
  res.innerHTML = html;
  res.hidden = false;
  if (selfGrade) {
    $("ex-btns").innerHTML = `<button class="btn" data-self="0">Не засчитывать</button><button class="btn primary" data-self="1">Мой вариант верный</button>`;
    return;
  }
  await mark(ok);
  $("ex-btns").innerHTML = `<button class="btn primary wide" data-act="next">${pos + 1 < tasks.length ? "Дальше" : "Итог"}</button>`;
}

async function mark(ok: boolean) {
  if (ok) right++;
  const t = tasks[pos];
  prog = record(prog, t.kind === "dialog" ? t.dialog.id : t.sent.zh, ok);
  await store.setMeta("ex", prog);
}

async function check() {
  const t = tasks[pos];
  if (t.kind === "dialog") { checkDialog(t.dialog); return; }
  const s = t.sent;
  if (t.kind === "tr" && ui.trMode === "type") {
    const mine = $<HTMLInputElement>("ex-in").value.trim();
    if (!mine) return;
    hwPad?.hide();
    const d = diffZh(mine, s.zh);
    const ok = d.score === 1;
    const refHTML = d.ref.map((x) => `<span class="${x.ok ? "c-ok" : "c-miss"}">${esc(x.c)}</span>`).join("");
    await result(ok, `<div class="chip ${ok ? "ok" : d.score >= 0.7 ? "mid" : "no"}">${ok ? "Верно" : `Совпадение ${Math.round(d.score * 100)}%`}</div>
      ${ok ? "" : `<div class="diff"><div class="label">Образец (красным — чего нет в ответе)</div><div class="diff-ref">${refHTML}</div>${d.extra.length ? `<div class="hint">Лишнее: ${esc(d.extra.join(" "))}</div>` : ""}</div>`}
      ${sentenceView(s)}`, !ok);
    return;
  }
  // плитки: перевод или аудирование
  const ok = checkAssembled(picked, { zh: s.zh, ru: s.ru, t: s.t });
  $("ex-ans").classList.toggle("ok", ok);
  $("ex-ans").classList.toggle("bad", !ok);
  await result(ok, `<div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не совсем"}</div>${sentenceView(s)}`);
}

/* ---------- диалог ---------- */

function renderDialog(d: Dialog) {
  qAns = d.q.map(() => null);
  const card = $("ex-card");
  card.innerHTML = `<div class="ex-top"><span class="label">Диалог: ${esc(d.title)}</span><button class="btn small" data-act="say-all">${PLAY} Весь</button></div>
    <div class="dl">${d.lines.map((l, i) => `<div class="dl-line"><span class="dl-who">${esc(l[0])}</span><div class="dl-body"><div class="ex-zh">${seg(l[1]).map((x) => tokHTML(x)).join("")}</div><div class="dl-ru" hidden>${esc(l[2])}</div></div><button class="icon-btn small-ic" data-line="${i}" aria-label="Послушать реплику">${PLAY}</button></div>`).join("")}</div>
    <button class="link-btn" data-act="ru">Показать перевод</button>
    ${d.q.length ? `<div class="dl-q">${d.q.map((q, i) => `<div class="q"><div class="q-t">${esc(q.q)}</div><div class="q-o">${q.o.map((o, j) => `<button class="chip-btn" data-q="${i}" data-o="${j}" aria-pressed="false">${esc(o)}</button>`).join("")}</div></div>`).join("")}</div>` : ""}
    <div class="ex-res" id="ex-res" hidden></div>
    <div class="ex-btns" id="ex-btns"><button class="btn primary wide" data-act="check" ${d.q.length ? "disabled" : ""}>${d.q.length ? "Проверить ответы" : "Прочитал"}</button></div>`;
}

async function checkDialog(d: Dialog) {
  if (!d.q.length) { await result(true, ""); return; }
  let good = 0;
  d.q.forEach((q, i) => {
    const sel = qAns[i];
    if (sel === q.a) good++;
    document.querySelectorAll<HTMLButtonElement>(`#ex-card [data-q="${i}"]`).forEach((b) => {
      const j = Number(b.dataset.o);
      b.classList.toggle("right", j === q.a);
      b.classList.toggle("wrong", j === sel && sel !== q.a);
      b.disabled = true;
    });
  });
  document.querySelectorAll<HTMLElement>("#ex-card .dl-ru").forEach((x) => (x.hidden = false));
  const ok = good === d.q.length;
  await result(ok, `<div class="chip ${ok ? "ok" : good ? "mid" : "no"}">Верно ${good} из ${d.q.length}</div>`);
}

function finish() {
  $("ex-count").textContent = "";
  $("ex-card").innerHTML = `<div class="ex-done"><b>${right}</b> из ${tasks.length} ${plural(tasks.length, "задания", "заданий", "заданий")} без ошибок</div>
    <p class="hint center">Ошибочные предложения вернутся в следующих занятиях.</p>
    <div class="ex-btns"><button class="btn" data-act="setup">К выбору</button><button class="btn primary" data-act="again">Ещё ${ui.n}</button></div>`;
}

async function gloss(w: string) {
  const box = $("ex-gloss");
  const word = await wordByHan(w);
  box.innerHTML = `<div class="g-head"><b>${esc(w)}</b> <span class="py">${word.ref.length ? pinyinHTML(word.ref) : ""}</span><button class="icon-btn small-ic" data-say="${esc(w)}" aria-label="Послушать">${PLAY}</button></div><div class="g-ru">${esc(word.ru || "—")}</div>
    <div class="g-act"><button class="btn small" data-open="${esc(word.id)}">Статья</button><button class="btn small" data-add>+ В колоду</button></div>`;
  box.hidden = false;
  box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true));
  box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
  box.querySelector("[data-say]")!.addEventListener("click", () => say(w));
}

/* ---------- обработчики ---------- */

export function initExercise() {
  onShow("ex", async () => { sets = await loadExSets(); parsedSets = new Map(); renderSetup(); });
  onLeave("ex", () => { try { speechSynthesis.cancel(); } catch { /* */ } });
  $("ex-src").addEventListener("click", pickSource);
  $("ex-lessons").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-lesson]");
    if (!b) return;
    ui.lesson = Number(b.dataset.lesson); save(); renderSetup();
  });
  $("ex-kinds").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-kind]");
    if (!b) return;
    const k = b.dataset.kind as Kind;
    ui.kinds = ui.kinds.includes(k) ? ui.kinds.filter((x) => x !== k) : [...ui.kinds, k];
    save(); renderSetup();
  });
  $("ex-n-minus").addEventListener("click", () => { ui.n = Math.max(5, ui.n - 5); save(); $("ex-n").textContent = String(ui.n); });
  $("ex-n-plus").addEventListener("click", () => { ui.n = Math.min(40, ui.n + 5); save(); $("ex-n").textContent = String(ui.n); });
  $("ex-py").addEventListener("change", (e) => { ui.pinyin = (e.target as HTMLInputElement).checked; save(); });
  $("ex-start").addEventListener("click", startSession);
  $("ex-quit").addEventListener("click", () => { try { speechSynthesis.cancel(); } catch { /* */ } renderSetup(); });

  // свои наборы
  $("ex-set-add").addEventListener("click", () => $<HTMLInputElement>("ex-set-file").click());
  $("ex-set-help").addEventListener("click", () => openSheet("Формат файла с упражнениями", FORMAT_HELP));
  $<HTMLInputElement>("ex-set-file").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = "";
    if (!f) return;
    await ensureLex();
    const text = await f.text();
    const id = `s-${Date.now().toString(36)}`;
    const parsed = parseExSet(text, id, seg);
    const n = parsed.lessons.reduce((a, l) => a + l.sents.length + l.dialogs.length, 0);
    if (!n) { openSheet("Загрузка набора", `<p class="note danger">В файле не нашлось ни предложений, ни диалогов.</p>${FORMAT_HELP}`); return; }
    sets = [...sets, { id, title: parsed.title === "Мой набор" ? f.name.replace(/\.[^.]+$/, "") : parsed.title, text, addedAt: Date.now() }];
    await saveExSets(sets);
    parsedSets.delete(id);
    ui.src = `set:${id}`; ui.lesson = -1; save();
    renderSetup();
  });
  $("ex-set-list").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const o = t.closest<HTMLButtonElement>("[data-set]");
    if (o) { ui.src = `set:${o.dataset.set}`; ui.lesson = -1; save(); renderSetup(); window.scrollTo(0, 0); return; }
    const d = t.closest<HTMLButtonElement>("[data-del-set]");
    if (d) {
      const id = d.dataset.delSet!;
      confirmInline($("ex-set-confirm"), `Удалить набор «${sets.find((s) => s.id === id)?.title ?? ""}»?`, "Удалить", async () => {
        sets = sets.filter((s) => s.id !== id);
        await saveExSets(sets);
        if (ui.src === `set:${id}`) ui.src = "";
        save(); renderSetup();
      });
    }
  });

  // задания
  $("ex-card").addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const task = tasks[pos];
    const w = t.closest<HTMLButtonElement>("[data-w]");
    if (w) { gloss(w.dataset.w!); return; }
    const act = t.closest<HTMLButtonElement>("[data-act]")?.dataset.act;
    if (act === "check") { check(); return; }
    if (act === "next") { pos++; showTask(); window.scrollTo(0, 0); return; }
    if (act === "again") { startSession(); return; }
    if (act === "setup") { renderSetup(); return; }
    if (act === "say" && task && task.kind !== "dialog") { say(task.sent.zh, 0.8); return; }
    if (act === "slow" && task && task.kind !== "dialog") { say(task.sent.zh, 0.55); return; }
    if (act === "say-all" && task?.kind === "dialog") { sayAll(task.dialog.lines.map((l) => l[1]), 0.8); return; }
    if (act === "ru") { document.querySelectorAll<HTMLElement>("#ex-card .dl-ru").forEach((x) => (x.hidden = !x.hidden)); return; }
    if (act === "hw") { const b = t.closest<HTMLButtonElement>("[data-act]")!; if (hwPad?.visible()) hwPad.hide(); else hwPad?.show(); b.setAttribute("aria-pressed", String(!!hwPad?.visible())); return; }
    const line = t.closest<HTMLButtonElement>("[data-line]");
    if (line && task?.kind === "dialog") { say(task.dialog.lines[Number(line.dataset.line)][1], 0.8); return; }
    const tr = t.closest<HTMLButtonElement>("[data-tr]");
    if (tr && task?.kind === "tr" && !answered) {
      ui.trMode = tr.dataset.tr as "type" | "tiles"; save();
      document.querySelectorAll<HTMLButtonElement>("#ex-card [data-tr]").forEach((x) => x.setAttribute("aria-pressed", String(x === tr)));
      renderTrBody(task.sent);
      const c = $("ex-btns").querySelector<HTMLButtonElement>("[data-act=check]");
      if (c) c.disabled = ui.trMode === "tiles";
      return;
    }
    if (answered) {
      const s = t.closest<HTMLButtonElement>("[data-self]");
      if (s) { await mark(s.dataset.self === "1"); $("ex-btns").innerHTML = `<button class="btn primary wide" data-act="next">${pos + 1 < tasks.length ? "Дальше" : "Итог"}</button>`; }
      return;
    }
    const pl = t.closest<HTMLButtonElement>("[data-pool]");
    if (pl) { picked.push(tiles[Number(pl.dataset.pool)]); renderTiles(); return; }
    const an = t.closest<HTMLButtonElement>("[data-ans]");
    if (an) { picked.splice(Number(an.dataset.ans), 1); renderTiles(); return; }
    const opt = t.closest<HTMLButtonElement>("[data-opt]");
    if (opt && gap && task && task.kind === "gap") {
      const ok = opt.dataset.opt === gap.answer;
      document.querySelectorAll<HTMLButtonElement>("#ex-card [data-opt]").forEach((b) => {
        b.classList.toggle("right", b.dataset.opt === gap!.answer);
        b.classList.toggle("wrong", b === opt && !ok);
        b.disabled = true;
      });
      await result(ok, `<div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не то слово"}</div>${sentenceView(task.sent, gap.at)}`);
      return;
    }
    const q = t.closest<HTMLButtonElement>("[data-q]");
    if (q && task?.kind === "dialog") {
      const i = Number(q.dataset.q);
      qAns[i] = Number(q.dataset.o);
      document.querySelectorAll<HTMLButtonElement>(`#ex-card [data-q="${i}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b === q)));
      const c = $("ex-btns").querySelector<HTMLButtonElement>("[data-act=check]");
      if (c) c.disabled = qAns.some((x) => x === null);
    }
  });
  $("ex-card").addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).id === "ex-in" && e.key === "Enter") { e.preventDefault(); if (!answered) check(); }
  });
}
