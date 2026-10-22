/**
 * Упражнения — курсы. Курс → урок → шаги по нарастающей: слова урока → узнавание → пропуски → сборка фраз →
 * аудирование → перевод с вводом → диалог. Следующий шаг открывается, когда предыдущий пройден (≥ 70%).
 * Курсы: встроенные (data/courses, подключаются по желанию) и свои из файла (уроки учебника и т. п.).
 * «Своя практика» — предложения корпуса под слова своей колоды, как раньше.
 */
import { app, hskLookup, deckById, exCorpus, loadExSets, saveExSets, dictIndex, updateSettings, saveUserDeck, switchDeck, appLang, type ExSetFile } from "../state.ts";
import {
  KINDS, STEPS, PASS, parseCorpus, segment, sentencesFor, gapTask, diffZh, parseExSet, planSession, tilesFor, checkAssembled, isWordTok, record,
  lessonSteps, stepOpen, lessonDone, stepTasks, reviewTasks, wordOptions, shortRu, stepName, pinyinOptions, pinyinKey, jaTokens, plainJa,
  type Kind, type Sent, type Dialog, type Task, type ExProgress, type ExSet, type StepId, type LessonWord, type Gram, type GramX,
} from "../core/exercise.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { normalizePinyin } from "../core/importer.ts";
import { parseRef, toMarked } from "../core/pinyin.ts";
import * as store from "../store.ts";
import { say, sayAll, stopSpeech } from "../speech.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { onShow, onLeave, show } from "./nav.ts";
import { openEntry } from "./entry.ts";
import { wordByHan, loadJDict, jWordAt } from "./lookup.ts";
import { findJ } from "../core/jdict.ts";
import { romajiToKana, toHiragana } from "../core/kana.ts";
import type { Word } from "../core/deck.ts";
import { openAddToDeck } from "./editor.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import { pickDeck, setPickLabel } from "./deckpick.ts";
import { mountHwPad, type HwPad } from "./hwpad.ts";
import { openImport } from "./import.ts";
import { openBuilder } from "./coursebuilder.ts";
import { openAiPrompt } from "./aisheet.ts";
import { setToCourse } from "../core/coursebuild.ts";

/* ---------- настройки ---------- */

const LS = "cherta.ex3";
/** pyMode — пиньинь над словами в курсах: «auto» (по уровню и шагу) или явно включён/выключен кнопкой в занятии. */
const ui = { kinds: ["tr", "gap", "listen"] as Kind[], n: 10, pinyin: true, trMode: "type" as "type" | "tiles", freeDeck: "", pyMode: "auto" as "auto" | "on" | "off", quiet: false };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };
/** Переключатель «Без звука»: аудирование и диктант не нужны для прохождения урока (нет наушников, шумно). */
const quietChip = () => `<button class="chip-btn quiet-chip" data-quiet aria-pressed="${ui.quiet}" title="Пропускать аудирование и диктант">${ui.quiet ? "🔇" : "🔈"} Без звука</button><small class="hint">${ui.quiet ? "Аудирование и диктант пропускаются" : "Нет наушников? Уроки — без аудирования"}</small>`;

/* ---------- словарь для пиньиня и деления на слова ---------- */

let hsk: ((h: string) => { py: string; ru: string } | undefined) | null = null;
const hskWords = new Set<string>();
let dict: DictIndex | null = null;
let dictWords: Set<string> | null = null;
/** Пиньинь слов текущего курса (из строк «+ слово | пиньинь | значение»). */
const coursePy = new Map<string, string>();

async function ensureLex() {
  if (!hsk) {
    hsk = await hskLookup();
    for (const d of app.builtinDecks) if (/^hsk[23]-/.test(d.id)) for (const w of (await deckById(d.id)).words) hskWords.add(w.han);
  }
  if (!dict) dictIndex().then((d) => { dict = d; dictWords = new Set(d.han.filter((w) => w.length <= 4)); }).catch(() => {});
}
const lexHas = (w: string) => hskWords.has(w) || coursePy.has(w) || !!dictWords?.has(w);
const seg = (zh: string) => segment(zh, lexHas, 4);

/* ---------- японский курс ---------- */

/** Язык открытого курса: у японского — слова через пробел и фуригана, японский голос, ответ каной или ромадзи. */
let clang: "zh" | "ja" = "zh";
let furi: Record<string, string> = {};
const courseRu = new Map<string, string>();
const HANX = /\p{Script=Han}/u;
/** Строка курса словами (с чтением каждого слова в японском). */
const lineHTML = (z: string) => { if (clang !== "ja") return toksHTML(seg(z)); const { t, r } = jaTokens(z); return toksHTML(t, -1, r); };
/** Озвучить строку курса нужным голосом. */
const sayx = (t: string, rate?: number) => (clang === "ja" ? say(plainJa(t), rate ?? 0.9, "ja") : say(t, rate));
const isJaCourse = (c: Course) => c.set.lang === "ja";

function pyOf(w: string, rd?: string): string {
  if (clang === "ja") { const r = rd || furi[w] || coursePy.get(w)?.split("/")[0]; return r && HANX.test(w) && r !== w ? esc(r) : ""; }
  let p = coursePy.get(w) ?? hsk?.(w)?.py ?? "";
  if (!p && dict) { const i = dict.han.indexOf(w); if (i >= 0) p = dictPyToNumeric(dict.py[i], w) ?? ""; }
  if (!p) return "";
  try { return pinyinHTML(parseRef(p)); } catch { return ""; }
}

/** Пиньинь над словами в текущем занятии. */
let pyOn = true;
const tokHTML = (t: string, extra = "", rd?: string) => isWordTok(t)
  ? `<button class="w${extra}" data-w="${esc(t)}"${rd ? ` data-r="${esc(rd)}"` : ""}>${pyOn ? `<small class="py">${pyOf(t, rd)}</small>` : ""}<span>${esc(t)}</span></button>`
  : `<span class="p">${esc(t)}</span>`;
/** Строка слов: знак препинания держится со словом перед ним (не уезжает один на новую строку). */
function toksHTML(toks: string[], mark = -1, rd?: string[]): string {
  const out: string[] = [];
  toks.forEach((t, i) => {
    const h = tokHTML(t, i === mark ? " hl" : "", rd?.[i]);
    if (!isWordTok(t) && out.length) out[out.length - 1] = out[out.length - 1].replace(/<\/span>$/, `${h}</span>`);
    else out.push(`<span class="u">${h}</span>`);
  });
  return out.join("");
}

/* ---------- курсы ---------- */

type BuiltinInfo = { id: string; file: string; title: string; level: number; lessons: number; words: number; about: string };
type Course = { key: string; title: string; set: ExSet; builtin?: string; fileId?: string };
type CourseProg = Record<string, Record<number, Partial<Record<StepId, number>>>>;

let builtinList: BuiltinInfo[] = [];
let sets: ExSetFile[] = [];
const parsed = new Map<string, ExSet>();
let progCourse: CourseProg = {};

async function loadBuiltinList(): Promise<BuiltinInfo[]> {
  if (!builtinList.length) {
    try { builtinList = await (await fetch("data/courses/index.json")).json(); } catch { builtinList = []; }
  }
  return builtinList;
}

async function builtinSet(b: BuiltinInfo): Promise<ExSet> {
  const key = `b:${b.id}`;
  if (!parsed.has(key)) {
    const r = await fetch(`data/courses/${b.file}`);
    if (!r.ok) throw new Error("курс не загрузился");
    const s = parseExSet(await r.text(), key, seg);
    s.title = b.title;
    parsed.set(key, s);
  }
  return parsed.get(key)!;
}

function fileSet(f: ExSetFile): ExSet {
  const key = `f:${f.id}`;
  if (!parsed.has(key)) {
    const s = parseExSet(f.text, key, seg);
    s.title = f.title || s.title;
    parsed.set(key, s);
  }
  return parsed.get(key)!;
}

/** Мои курсы: подключённые встроенные + свои из файлов. */
async function myCourses(): Promise<Course[]> {
  await ensureLex();
  const list = await loadBuiltinList();
  const out: Course[] = [];
  for (const id of appLang() === "ja" ? [] : app.settings.courses ?? []) {
    const b = list.find((x) => x.id === id);
    if (!b) continue;
    try { out.push({ key: `b:${id}`, title: b.title, set: await builtinSet(b), builtin: id }); } catch { /* офлайн и не в кэше */ }
  }
  for (const f of sets) out.push({ key: `f:${f.id}`, title: f.title, set: fileSet(f), fileId: f.id });
  // курсы своего языка: в японском режиме — японские, в китайском — китайские
  const lang = appLang();
  return out.filter((c) => (c.set.lang ?? "zh") === lang);
}

const lessonBest = (c: Course, i: number) => progCourse[c.key]?.[i] ?? {};
const doneLessons = (c: Course) => c.set.lessons.filter((l, i) => lessonDone(lessonSteps(l, ui.quiet), lessonBest(c, i))).length;
/** Первый незаконченный урок. */
const nextLesson = (c: Course) => {
  const i = c.set.lessons.findIndex((l, k) => !lessonDone(lessonSteps(l, ui.quiet), lessonBest(c, k)));
  return i < 0 ? c.set.lessons.length - 1 : i;
};
const startedLessons = (c: Course) => c.set.lessons.map((_, i) => i).filter((i) => Object.keys(lessonBest(c, i)).length);

function rememberWords(c: Course) {
  coursePy.clear();
  courseRu.clear();
  clang = isJaCourse(c) ? "ja" : "zh";
  furi = c.set.furi ?? {};
  if (clang === "ja") {
    for (const l of c.set.lessons) for (const w of l.words) { if (w[1]) coursePy.set(w[0], w[1]); courseRu.set(w[0], w[2]); }
    return;
  }
  for (const l of c.set.lessons) for (const w of l.words) {
    // пиньинь в файле может быть со знаками тонов («xué xí») — переводим в формат колоды
    const n = w[1] ? normalizePinyin(w[1], w[0]) : null;
    if (n) { w[1] = n; coursePy.set(w[0], n); }
  }
}

/* ---------- экран «Мои курсы» ---------- */

let courses: Course[] = [];
let course: Course | null = null;
let lessonIdx = 0;

function views(v: "home" | "course" | "lesson" | "setup" | "run") {
  $("ex-home").hidden = v !== "home";
  $("ex-course").hidden = v !== "course";
  $("ex-lesson").hidden = v !== "lesson";
  $("ex-setup").hidden = v !== "setup";
  $("ex-run").hidden = v !== "run";
  window.scrollTo(0, 0);
}

async function renderHome() {
  views("home");
  $("ex-courses").innerHTML = `<p class="hint">Загружаю…</p>`;
  sets = await loadExSets();
  progCourse = (await store.getMeta<CourseProg>("course")) ?? {};
  courses = await myCourses();
  if (!courses.length) {
    $("ex-courses").innerHTML = `<div class="empty-start"><span class="han-big" aria-hidden="true">课</span><h2>Курсов пока нет</h2>
      <p class="hint">Уроки по порядку: слова, фразы, аудирование, перевод, диалог. Добавьте готовый курс или соберите свой.</p></div>`;
    return;
  }
  // курсы — по уровням, каждый уровень сворачивается
  const lvlName = (n: number | undefined) => (n ? `Уровень ${n}${n === 1 ? " — начальный" : ""}` : "Свои курсы");
  const groups = new Map<string, Course[]>();
  for (const c of [...courses].sort((a0, b0) => (a0.set.level ?? 99) - (b0.set.level ?? 99))) {
    const g = lvlName(c.set.level);
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(c);
  }
  // по умолчанию открыты только уровни с начатыми курсами (если ничего не начато — первый); мало курсов — всё открыто
  const begun = (c: Course) => doneLessons(c) > 0 || startedLessons(c).length > 0;
  const anyBegun = courses.some(begun);
  const firstG = [...groups.keys()][0];
  $("ex-courses").innerHTML = [...groups].map(([g, list]) => {
    const dflt = courses.length <= 3 || (anyBegun ? list.some(begun) : g === firstG);
    const open = isOpen(`lvl:${g}`, dflt);
    return `<button class="fold-head" data-fold="lvl:${esc(g)}" aria-expanded="${open}"><span>${esc(g)}</span><small>${list.length} ${plural(list.length, "курс", "курса", "курсов")}</small>${CHEV}</button>`
      + `<div class="fold-body stack" ${open ? "" : "hidden"}>${list.map(courseCard).join("")}</div>`;
  }).join("");
}

const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

function courseCard(c: Course): string {
  const n = c.set.lessons.length, done = doneLessons(c), next = nextLesson(c);
  const pct = Math.round((100 * done) / Math.max(1, n));
  return `<button class="course-card panel" data-course="${esc(c.key)}">
      <span class="cc-title">${esc(c.title)}</span>
      <span class="cc-sub">${done ? `Пройдено ${done} из ${n} ${plural(n, "урока", "уроков", "уроков")}` : `${n} ${plural(n, "урок", "урока", "уроков")}`}${c.fileId ? " · из файла" : ""}</span>
      <span class="cc-bar"><i style="width:${pct}%"></i></span>
      <span class="cc-next">${done >= n ? "Курс пройден — можно повторять" : `Дальше: ${esc(c.set.lessons[next].title)}`}</span>
    </button>`;
}

/* Свёрнутые разделы и уровни (только на этом устройстве). Без явного выбора — значение по умолчанию. */
const FOLD = "cherta.exfold";
function folds(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(FOLD) ?? "{}"); } catch { return {}; }
}
const isOpen = (key: string, dflt: boolean) => folds()[key] ?? dflt;
function toggleFold(key: string, now: boolean) {
  const f = folds();
  f[key] = !now;
  try { localStorage.setItem(FOLD, JSON.stringify(f)); } catch { /* */ }
}

/* ---------- каталог курсов ---------- */

const FORMAT_HELP = `<p class="hint">Обычный текстовый файл (.txt, UTF-8). Строки:</p>
<pre class="fmt"># Мой курс
## Урок 1. Знакомство
+ 你好 | ni3 hao3 | здравствуй
+ 名字 | ming2 zi | имя
你好！ | Привет!
你叫什么名字？ | Как тебя зовут?
@ Знакомство
A: 你好！我叫王明。 | Привет! Меня зовут Ван Мин.
B: 你好！ | Привет!
? Как зовут A? | Ли Юэ | Ван Мин*</pre>
<p class="hint"><b>#</b> — название, <b>##</b> — урок, <b>+</b> — слово урока (иероглифы | пиньинь | значение), «китайский | русский» — предложение (вместо | можно Tab), <b>@</b> — диалог (до пустой строки), <b>?</b> — вопрос к диалогу, верный вариант со звёздочкой. Перевод можно не писать — тогда предложение будет только в пропусках и аудировании.</p>`;

async function openCatalog() {
  // готовые курсы — китайские; в японском режиме — только свой курс из файла
  const list = appLang() === "ja" ? [] : await loadBuiltinList();
  const on = (id: string) => (app.settings.courses ?? []).includes(id);
  const row = (b: BuiltinInfo) => `<button class="deck-opt" data-cadd="${esc(b.id)}" aria-pressed="${on(b.id)}"><span>${esc(b.title)}<small>${esc(b.about)}</small></span><span class="pick-btn${on(b.id) ? " on" : ""}">${on(b.id) ? "✓" : "+"}</span></button>`;
  const body = `<p class="hint">Готовые курсы: свои темы уроков, предложения только из пройденных слов, диалоги. Нажмите, чтобы добавить.</p>
    ${[...new Set(list.map((b0) => b0.level))].sort().map((lv) => `<h3 class="grp-title"><span>Уровень ${lv}${lv === 1 ? " — начальный" : ""}</span></h3><div class="deck-list">${list.filter((b0) => b0.level === lv).map(row).join("")}</div>`).join("")}
    <h3 class="grp-title"><span>Свой курс</span></h3>
    <p class="hint">Например, по урокам своего учебника. Хранится на этом устройстве (и в синхронизации).</p>
    <div class="deck-list">
      <button class="deck-opt" id="cat-build"><span>Создать в конструкторе<small>Уроки, слова, предложения, диалоги с вопросами — обычными полями, без файлов</small></span></button>
      <button class="deck-opt" id="cat-ai"><span>Попросить ИИ сделать курс<small>Готовая инструкция для Claude или ChatGPT: приложите фото учебника — и вставьте ответ</small></span></button>
      <button class="deck-opt" id="cat-file"><span>Вставить текст или загрузить файл<small>С проверкой: покажет, какие строки не разобрались и почему</small></span></button>
    </div>
    <details class="paste"><summary>Формат файла курса</summary>FORMAT_SLOT</details>
    <button class="btn primary wide" id="cat-ok">Готово</button>`;
  openSheet("Курсы", `<div class="pick-decks">${body.replace("FORMAT_SLOT", FORMAT_HELP)}</div>`, (root) => {
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("#cat-ok")) { closeSheet(); return; }
      if (t.closest("#cat-file")) { openImport({ mode: "course" }); return; }
      if (t.closest("#cat-build")) { openBuilder(); return; }
      if (t.closest("#cat-ai")) { openAiPrompt("course", async () => { let tx = ""; try { tx = await navigator.clipboard.readText(); } catch { /* */ } openImport({ mode: "course", text: tx }); }); return; }
      const b = t.closest<HTMLButtonElement>("[data-cadd]");
      if (!b) return;
      const id = b.dataset.cadd!;
      const cur = app.settings.courses ?? [];
      await updateSettings({ courses: on(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      b.outerHTML = row(list.find((x) => x.id === id)!);
    });
  }, () => { renderHome(); });
}

/** Свой курс из текста (импорт, конструктор): сохранить и открыть. Возвращает id файла. */
export async function addOwnCourse(text: string, title: string): Promise<string> {
  sets = await loadExSets();
  const id = `s-${Date.now().toString(36)}`;
  sets = [...sets, { id, title: title || "Мой курс", text, addedAt: Date.now() }];
  await saveExSets(sets);
  await showOwnCourse(id);
  return id;
}

/** Изменённый в конструкторе свой курс: текст заменяется, прогресс по урокам остаётся. */
export async function updateOwnCourse(fileId: string, text: string, title: string) {
  sets = await loadExSets();
  sets = sets.map((f) => (f.id === fileId ? { ...f, title: title || f.title, text } : f));
  parsed.delete(`f:${fileId}`);
  await saveExSets(sets);
  await showOwnCourse(fileId);
}

async function showOwnCourse(fileId: string) {
  closeSheet();
  show("ex");
  await renderHome();
  const c = courses.find((x) => x.fileId === fileId);
  if (c) openCourse(c.key);
}

/* ---------- курс: список уроков ---------- */

function openCourse(key: string) {
  const c = courses.find((x) => x.key === key);
  if (!c) { renderHome(); return; }
  course = c;
  rememberWords(c);
  views("course");
  const n = c.set.lessons.length, done = doneLessons(c), next = nextLesson(c);
  const started = startedLessons(c).length;
  $("ex-c-head").innerHTML = `<h2 class="deck-name">${esc(c.title)}</h2>
    ${c.set.about ? `<p class="hint">${esc(c.set.about)}</p>` : ""}
    <p class="hint">Пройдено ${done} из ${n} ${plural(n, "урока", "уроков", "уроков")}</p>
    <div class="c-actions"><button class="btn primary wide" data-lesson="${next}">${done >= n ? "Повторить последний урок" : done || started ? `Продолжить: урок ${next + 1}` : "Начать с урока 1"}</button>
    ${started ? `<button class="btn wide" data-review>Повторение пройденного</button>` : ""}</div>
    <div class="quiet-row">${quietChip()}</div>`;
  const row = (l: (typeof c.set.lessons)[number], i: number) => {
    const steps = lessonSteps(l, ui.quiet), best = lessonBest(c, i);
    const ok = steps.filter((s0) => (best[s0] ?? 0) >= PASS).length;
    const fin = lessonDone(steps, best);
    const cls = fin ? "done" : i === next ? "cur" : "";
    return `<button class="lesson-row ${cls}" data-lesson="${i}"><span class="ln">${fin ? "✓" : i + 1}</span>
      <span class="lt"><b>${esc(l.title.replace(/^\d+[.)]\s*/, ""))}</b><small>${l.words.length ? `${l.words.length} ${plural(l.words.length, "слово", "слова", "слов")} · ` : ""}${ok} из ${steps.length} ${plural(steps.length, "шага", "шагов", "шагов")}</small>
      <span class="lp">${steps.map((s0) => `<i class="${(best[s0] ?? 0) >= PASS ? "on" : ""}"></i>`).join("")}</span></span></button>`;
  };
  // разделы (темы): раздел с текущим уроком открыт, остальные свёрнуты — пока не раскрыть вручную
  // в файле нет разделов, а уроков много — режем по 5, чтобы список не вываливался целиком
  const auto = c.set.lessons.length > 6 && !c.set.lessons.some((l) => l.section);
  const n5 = c.set.lessons.length;
  const secs: { name: string; idx: number[] }[] = [];
  c.set.lessons.forEach((l, i) => {
    const name = auto ? `Уроки ${Math.floor(i / 5) * 5 + 1}–${Math.min(n5, Math.floor(i / 5) * 5 + 5)}` : l.section ?? "";
    if (!secs.length || secs[secs.length - 1].name !== name) secs.push({ name, idx: [] });
    secs[secs.length - 1].idx.push(i);
  });
  if (secs.length <= 1 && !secs[0]?.name) {
    $("ex-c-lessons").innerHTML = `<div class="lesson-list">${c.set.lessons.map(row).join("")}</div>`;
    return;
  }
  $("ex-c-lessons").innerHTML = secs.map((sec, k) => {
    const fin = sec.idx.filter((i) => lessonDone(lessonSteps(c.set.lessons[i], ui.quiet), lessonBest(c, i))).length;
    const key = `${c.key}|${k}|${sec.name}`;
    const open = isOpen(key, sec.idx.includes(next));
    return `<button class="fold-head" data-fold="${esc(key)}" aria-expanded="${open}"><span>${esc(sec.name || "Уроки")}</span><small>${fin === sec.idx.length ? "✓ " : ""}${fin}/${sec.idx.length}</small>${CHEV}</button>`
      + `<div class="fold-body lesson-list" ${open ? "" : "hidden"}>${sec.idx.map((i) => row(c.set.lessons[i], i)).join("")}</div>`;
  }).join("");
}

function courseMenu() {
  const c = course;
  if (!c) return;
  const body = `<div class="dm-list">
      <button class="deck-opt" id="cm-decks"><span>Все слова курса — в карточки<small>Сейчас в колоду «${esc(c.title)}» попадают слова пройденных уроков</small></span></button>
      <button class="deck-opt" id="cm-edit"><span>${c.fileId ? "Изменить в конструкторе" : "Сделать свою копию и изменить"}<small>${c.fileId ? "Уроки, слова, предложения, диалоги; прогресс сохранится" : "Встроенный курс не меняется — правится копия в «Своих курсах»"}</small></span></button>
      <button class="deck-opt danger" id="cm-del"><span>${c.fileId ? "Удалить курс" : "Убрать курс"}<small>${c.fileId ? "Файл удалится с устройства, прогресс останется" : "Прогресс сохранится, вернуть — «Добавить курс»"}</small></span></button>
    </div><div class="confirm" id="cm-confirm" hidden></div>`;
  openSheet(c.title, body, (root) => {
    root.querySelector("#cm-decks")!.addEventListener("click", async () => {
      const r = await addToCourseDeck(c, c.set.lessons.map((_, i) => i));
      root.querySelector("#cm-decks small")!.textContent = `Добавлено слов: ${r.added}. Колода «${c.title}» — в «Карточках», группа «Курсы».`;
    });
    root.querySelector("#cm-edit")!.addEventListener("click", () => {
      const f = c.fileId ? sets.find((x) => x.id === c.fileId) : null;
      const b = setToCourse(f ? parseExSet(f.text, c.key, seg) : c.set);
      if (f) { b.title = f.title; openBuilder(b, f.id); } else { b.title = `${c.title} (моя копия)`; openBuilder(b); }
    });
    root.querySelector("#cm-del")!.addEventListener("click", () => confirmInline(root.querySelector("#cm-confirm")!, `${c.fileId ? "Удалить" : "Убрать"} «${c.title}»?`, c.fileId ? "Удалить" : "Убрать", async () => {
      if (c.fileId) { sets = sets.filter((s) => s.id !== c.fileId); await saveExSets(sets); parsed.delete(c.key); }
      else await updateSettings({ courses: (app.settings.courses ?? []).filter((x) => x !== c.builtin) });
      closeSheet();
      renderHome();
    }));
  });
}

/** Колода курса: одна своя колода на курс, слова уроков добавляются в неё по мере прохождения («Слова урока»). */
const courseDeckId = (c: Course) => `u-c-${c.key.replace(/[^a-z0-9]/gi, "")}`;
async function addToCourseDeck(c: Course, lessons: number[]): Promise<{ id: string; added: number }> {
  const id = courseDeckId(c);
  const look = await hskLookup();
  const old = app.userDecks.find((d) => d.id === id);
  const words = [...(old?.words ?? [])];
  const have = new Set(words.map((w) => w[0]));
  let added = 0;
  const ja = isJaCourse(c);
  for (const i of lessons) for (const [h, py, ru] of c.set.lessons[i]?.words ?? []) {
    if (have.has(h)) continue;
    const row: [string, string, string] = ja ? [h, py || h, ru] : [h, (py && normalizePinyin(py, h)) || look(h)?.py || "", ru || look(h)?.ru || ""];
    if (!row[1] || !row[2]) continue;
    words.push(row); have.add(h); added++;
  }
  if (added || !old) await saveUserDeck({ id, title: c.title, words, createdAt: old?.createdAt ?? Date.now(), group: "Курсы", ...(ja ? { lang: "ja" as const } : {}) });
  return { id, added };
}

/* ---------- урок: шаги ---------- */

function openLesson(i: number) {
  const c = course;
  if (!c) return;
  lessonIdx = Math.max(0, Math.min(i, c.set.lessons.length - 1));
  const l = c.set.lessons[lessonIdx];
  views("lesson");
  $("ex-l-words").hidden = true;
  $("ex-l-steps").hidden = false;
  $("ex-l-num").textContent = `Урок ${lessonIdx + 1} из ${c.set.lessons.length}`;
  $("ex-l-head").innerHTML = `<h2 class="deck-name">${esc(l.title)}</h2>${l.goal ? `<p class="l-goal">${esc(l.goal)}</p>` : ""}<p class="hint">${[
    l.words.length && `${l.words.length} ${plural(l.words.length, "слово", "слова", "слов")}`,
    l.sents.length && `${l.sents.length} ${plural(l.sents.length, "предложение", "предложения", "предложений")}`,
    l.grammar?.length && `${l.grammar.length} ${plural(l.grammar.length, "правило", "правила", "правил")}`,
    l.dialogs.length && `${l.dialogs.length} ${plural(l.dialogs.length, "диалог", "диалога", "диалогов")}`].filter(Boolean).join(" · ")}</p>`;
  const steps = lessonSteps(l, ui.quiet), best = lessonBest(c, lessonIdx);
  const firstOpen = steps.findIndex((s) => (best[s] ?? 0) < PASS);
  $("ex-l-steps").innerHTML = steps.map((s, k) => {
    const info = STEPS.find((x) => x.id === s)!;
    const open = stepOpen(steps, best, k);
    const b = best[s];
    const theory = s === "words";
    const state = theory ? (b ? `<span class="st ok">✓</span>` : `<span class="st go">→</span>`)
      : b !== undefined && b >= PASS ? `<span class="st ok">✓ ${Math.round(b * 100)}%</span>` : !open ? `<span class="st lock" aria-label="Закрыто">🔒</span>` : b !== undefined ? `<span class="st mid">${Math.round(b * 100)}%</span>` : `<span class="st go">→</span>`;
    const hint = theory && !l.grammar?.length ? "послушать и запомнить" : info.hint;
    return `<button class="step-row${k === firstOpen ? " cur" : ""}${theory ? " theory" : ""}" data-step="${s}" ${open ? "" : "disabled"}><span class="sn">${theory ? "📖" : k}</span><span class="lt"><b>${stepName(s, l)}</b><small>${hint}${theory ? " · по желанию" : ""}</small></span>${state}</button>`;
  }).join("") + (lessonDone(steps, best) && lessonIdx + 1 < c.set.lessons.length ? `<button class="btn primary wide" data-lesson="${lessonIdx + 1}">Следующий урок →</button>` : "")
    + (!steps.length ? `<p class="hint">В этом уроке нет заданий.</p>` : "")
    + `<div class="quiet-row">${quietChip()}</div>`
    + `<p class="hint">Шаг засчитывается от ${Math.round(PASS * 100)}% верных ответов — тогда открывается следующий. Теорию можно открыть в любой момент.</p>`;
  // урок ещё не начат и есть теория — спросить, нужна ли она
  if (l.grammar?.length && !Object.keys(best).length) {
    $("ex-l-steps").insertAdjacentHTML("afterbegin", `<div class="panel theory-ask"><b>Начать с теории?</b><p class="hint">Цель урока, новые слова и ${l.grammar.length} ${plural(l.grammar.length, "правило", "правила", "правил")} с примерами — как в учебнике.</p>
      <div class="ex-btns"><button class="btn" data-skip-theory>Сразу к заданиям</button><button class="btn primary" data-step="words">Показать теорию</button></div></div>`);
  }
}

/** Смесь русского и китайского/японского: иероглифы — шрифтом иероглифов (без плиток пиньиня: в таблице они слишком громоздки), остальное — как есть. */
const mixHTML = (t: string) => t.split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}，。？！、：；（）\s+]*)/u).map((p, i) => (i % 2 ? `<span class="han">${esc(p)}</span>` : esc(p))).join("");

/** Таблица правила: первая строка — заголовок. */
function gramTable(g: Gram): string {
  if (!g.table?.length) return "";
  const [head, ...rows] = g.table;
  return `<div class="g-table-wrap"><table class="g-table"><thead><tr>${head.map((c) => `<th>${mixHTML(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${mixHTML(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
/** «Частая ошибка» и «Заметка». */
function gramNotes(g: Gram): string {
  return (g.notes ?? []).map((n) => `<div class="g-note ${n.k}"><b>${n.k === "err" ? "Частая ошибка" : "Заметка"}</b><span>${mixHTML(n.t)}</span></div>`).join("");
}

/** Шаг «Теория»: цель урока, новые слова (с озвучкой, «Учить карточками»), правила с примерами. */
function showWords() {
  const c = course!;
  const l = c.set.lessons[lessonIdx];
  $("ex-l-steps").hidden = true;
  const box = $("ex-l-words");
  box.hidden = false;
  const exLine = ([zh, ru]: [string, string], k: string) => `<div class="g-ex"><div class="ex-zh">${lineHTML(zh)}</div><button class="icon-btn small-ic" data-gsay="${esc(k)}" data-zh="${esc(zh)}" aria-label="Послушать">${PLAY}</button>${ru ? `<div class="g-ru">${esc(ru)}</div>` : ""}</div>`;
  box.innerHTML = `<div class="topbar"><button class="btn ghost small" data-words-back>← К шагам</button>${l.grammar?.length ? `<button class="chip-btn small" data-th-py aria-pressed="${pyOn}">${clang === "ja" ? "ふりがな" : "pīnyīn"}</button>` : ""}</div>
    ${l.goal ? `<div class="panel th-goal"><span class="label">Цель урока</span><p>${esc(l.goal)}</p></div>` : ""}
    ${l.words.length ? `<h3 class="grp-title"><span>Новые слова</span><span class="grp-n">${l.words.length}</span></h3>
    <div class="grp list">${l.words.map(([h, py, ru], i) => {
      let p = "";
      if (clang === "ja") p = py && py !== h ? `<span lang="ja">${esc(py.split("/").join(", "))}</span>` : "";
      else try { p = py ? pinyinHTML(parseRef(py)) : pyOf(h); } catch { p = pyOf(h); }
      return `<div class="item lw"><button class="h" data-wopen="${esc(h)}">${esc(h)}</button><span class="txt"><span class="py">${p}</span><span class="ru">${esc(ru)}</span></span><button class="icon-btn small-ic" data-wsay="${i}" aria-label="Послушать">${PLAY}</button></div>`;
    }).join("")}</div>
    <button class="btn wide" data-words-deck>Учить слова карточками</button>
    <p class="hint" id="ex-words-msg">Слова урока сами попадут в колоду курса «${esc(c.title)}» в «Карточках».</p>` : ""}
    ${(l.grammar ?? []).map((g, gi) => `<div class="panel gram">
      <h3 class="gram-t"><span class="gram-n">${gi + 1}</span>${esc(g.title)}</h3>
      ${g.text.map((t) => `<p>${esc(t)}</p>`).join("")}
      ${gramTable(g)}
      ${g.ex.length ? `<div class="g-exs"><span class="label">Примеры</span>${g.ex.map((e, k) => exLine(e, `${gi}:${k}`)).join("")}</div>` : ""}
      ${gramNotes(g)}
    </div>`).join("")}
    <div class="ex-btns"><button class="btn primary wide" data-words-ok>${l.dialogs.length ? "Понятно — к тексту урока" : "Понятно — к заданиям"}</button></div>`;
}

async function saveBest(step: StepId, score: number) {
  const c = course;
  if (!c) return;
  progCourse = (await store.getMeta<CourseProg>("course")) ?? {};
  const cp = progCourse[c.key] ?? {};
  const lb = cp[lessonIdx] ?? {};
  lb[step] = Math.max(lb[step] ?? 0, score);
  cp[lessonIdx] = lb;
  progCourse[c.key] = cp;
  await store.setMeta("course", progCourse);
}

/* ---------- своя практика (колода) ---------- */

type Pool = { sents: Sent[]; dialogs: Dialog[]; focus: Set<string>; title: string };
let corpus: Sent[] | null = null;
async function getCorpus(): Promise<Sent[]> { corpus ??= parseCorpus(await exCorpus()); return corpus; }
const levelOf = (deckId: string) => Number(/^hsk[23]-(\d)$/.exec(deckId)?.[1] ?? 2);
async function basicWords(L: number): Promise<Set<string>> {
  const out = new Set<string>();
  for (const d of app.builtinDecks) {
    const m = /^hsk[23]-(\d)$/.exec(d.id);
    if (m && Number(m[1]) <= L) for (const w of (await deckById(d.id)).words) out.add(w.han);
  }
  return out;
}

let freePool: { key: string; pool: Promise<Pool> } | null = null;
function currentFree(): Promise<Pool> {
  const id = ui.freeDeck;
  if (!freePool || freePool.key !== id) freePool = { key: id, pool: (async () => {
    const deck = await deckById(id);
    const words = new Set(deck.words.map((w) => w.han));
    const sents = sentencesFor(await getCorpus(), words, await basicWords(levelOf(id)), 300);
    return { sents, dialogs: [], focus: words, title: deck.title };
  })() };
  return freePool.pool;
}

async function renderSetup() {
  views("setup");
  if (!app.decks.some((d) => d.id === ui.freeDeck)) ui.freeDeck = app.deck?.id ?? app.decks[0]?.id ?? "";
  setPickLabel("ex-src", app.decks.find((d) => d.id === ui.freeDeck)?.title ?? "Выберите колоду");
  const kinds = KINDS.filter((k) => k.id !== "dialog");
  $("ex-kinds").innerHTML = kinds.map((k) => `<button class="chip-btn" data-kind="${k.id}" aria-pressed="${ui.kinds.includes(k.id)}" title="${esc(k.hint)}">${k.name}</button>`).join("");
  $("ex-n").textContent = String(ui.n);
  $<HTMLInputElement>("ex-py").checked = ui.pinyin;
  const start = $<HTMLButtonElement>("ex-start");
  start.disabled = true;
  if (!ui.freeDeck) { $("ex-src-info").textContent = "Сначала добавьте колоду в «Карточках»."; start.textContent = "Нет колод"; return; }
  $("ex-src-info").textContent = "Подбираю предложения…";
  try {
    await ensureLex();
    const p = await currentFree();
    const ns = p.sents.length;
    $("ex-src-info").textContent = `${ns} ${plural(ns, "предложение", "предложения", "предложений")}`;
    const usable = ns > 0 && ui.kinds.length > 0;
    start.disabled = !usable;
    start.textContent = usable ? "Начать" : ns ? "Выберите вид заданий" : "Нет подходящих предложений";
  } catch {
    $("ex-src-info").textContent = "Не удалось загрузить предложения. Для первого раза нужен интернет.";
  }
}

/* ---------- занятие ---------- */

type Run = { mode: "step" | "review" | "free"; step?: StepId; focus: Set<string>; words: LessonWord[]; courseWords: LessonWord[]; distract: number; title: string };
let run: Run = { mode: "free", focus: new Set(), words: [], courseWords: [], distract: 2, title: "" };
let tasks: Task[] = [];
let pos = 0;
let right = 0;
let prog: ExProgress = {};
let rnd: () => number = Math.random;
let answered = false;
let tiles: string[] = [];
let picked: string[] = [];
let gap: ReturnType<typeof gapTask> = null;
let wopts: string[] = [];
let qAns: (number | null)[] = [];
let hwPad: HwPad | null = null;
let poolWords: string[] = [];

async function begin(list: Task[], r: Run) {
  if (!list.length) return;
  run = r;
  tasks = list;
  pos = 0;
  right = 0;
  poolWords = [...new Set([...r.focus, ...list.flatMap((t) => (t.kind === "dialog" || t.kind === "word" || t.kind === "choice" ? [] : t.sent.t.filter(isWordTok))), ...r.courseWords.map((w) => w[0])])];
  views("run");
  showTask();
}

/** Пиньинь над словами: в первом курсе всегда, дальше — в первых шагах; в переводе и диалоге — только на уровне 1. */
function autoPinyin(step: StepId | undefined): boolean {
  if (run.mode === "free") return ui.pinyin;
  if (ui.pyMode !== "auto") return ui.pyMode === "on";
  const lvl = course?.set.level ?? 2;
  if (lvl <= 1) return true;
  return step === "recog" || step === "gap" || step === "build" || step === "listen";
}

async function startStep(step: StepId) {
  const c = course!;
  const l = c.set.lessons[lessonIdx];
  if (step === "words") { pyOn = ui.pyMode !== "off"; showWords(); window.scrollTo(0, 0); return; }
  prog = (await store.getMeta<ExProgress>("ex")) ?? {};
  const list = stepTasks(step, l, prog, rnd = Math.random);
  pyOn = autoPinyin(step);
  const all = c.set.lessons.flatMap((x) => x.words);
  await begin(list, { mode: "step", step, focus: new Set([...l.words.map((w) => w[0]), ...l.sents.flatMap((s) => s.t.filter(isWordTok))]), words: l.words, courseWords: all,
    distract: Math.min(3, 1 + Math.floor(lessonIdx / 5)), title: stepName(step, l) });
}

async function startReview() {
  const c = course!;
  const idx = startedLessons(c);
  if (!idx.length) return;
  prog = (await store.getMeta<ExProgress>("ex")) ?? {};
  const lessons = idx.map((i) => c.set.lessons[i]);
  pyOn = ui.pyMode === "auto" ? (c.set.level ?? 2) <= 1 : ui.pyMode === "on";
  await begin(reviewTasks(lessons, prog, 12, rnd = Math.random, ui.quiet), { mode: "review", focus: new Set(lessons.flatMap((l) => l.words.map((w) => w[0]))), words: lessons.flatMap((l) => l.words),
    courseWords: c.set.lessons.flatMap((x) => x.words), distract: 2, title: "Повторение" });
}

async function startFree() {
  clang = "zh"; furi = {};
  const p = await currentFree();
  prog = (await store.getMeta<ExProgress>("ex")) ?? {};
  pyOn = ui.pinyin;
  await begin(planSession(p.sents, [], ui.kinds, prog, ui.n, rnd = Math.random), { mode: "free", focus: p.focus, words: [], courseWords: [], distract: 2, title: p.title });
}

function showTask() {
  answered = false;
  hwPad = null;
  $("ex-gloss").hidden = true;
  $("ex-prog").style.width = `${(100 * pos) / Math.max(1, tasks.length)}%`;
  if (pos >= tasks.length) { finish(); return; }
  $("ex-count").textContent = `${run.title ? `${run.title} · ` : ""}${pos + 1} из ${tasks.length}`;
  const t = tasks[pos];
  const card = $("ex-card");
  $("ex-pyt").setAttribute("aria-pressed", String(pyOn));
  $("ex-pyt").textContent = clang === "ja" ? "ふりがな" : "pīnyīn";
  if (t.kind === "dialog") { renderDialog(t.dialog); return; }
  if (t.kind === "word") { renderWord(t.word, t.dir); return; }
  if (t.kind === "choice") { renderChoice(t.x, t.rule); return; }
  const s = t.sent;
  if (t.kind === "tr") {
    if (!s.ru) { tasks[pos] = { kind: "gap", sent: s }; showTask(); return; }
    const mode = t.tiles === undefined ? ui.trMode : t.tiles ? "tiles" : "type";
    card.innerHTML = `<div class="ex-top"><span class="label">${mode === "tiles" && t.tiles ? "Соберите перевод из слов" : clang === "ja" ? "Переведите на японский" : "Переведите на китайский"}</span></div>
      <div class="ex-ru">${esc(s.ru)}</div>
      ${t.tiles === undefined ? `<div class="seg tr-mode" role="group" aria-label="Как отвечать"><button data-tr="type" aria-pressed="${mode === "type"}">Написать</button><button data-tr="tiles" aria-pressed="${mode === "tiles"}">Собрать из слов</button></div>` : ""}
      <div id="ex-tr-body"></div>
      <div class="ex-res" id="ex-res" hidden></div>
      <div class="ex-btns" id="ex-btns"><button class="btn primary wide" data-act="check">Проверить</button></div>`;
    renderTrBody(s, mode);
    return;
  }
  if (t.kind === "dict") {
    card.innerHTML = `<div class="ex-top"><span class="label">Диктант: послушайте и напишите</span></div>
      <div class="listen-btns"><button class="btn" data-act="say">${PLAY} Слушать</button><button class="btn" data-act="slow">Медленно</button></div>
      <div id="ex-tr-body"></div>
      <div class="ex-res" id="ex-res" hidden></div>
      <div class="ex-btns" id="ex-btns"><button class="btn primary wide" data-act="check">Проверить</button></div>`;
    renderTrBody(s, "type");
    setTimeout(() => sayx(s.zh, 0.8), 250);
    return;
  }
  if (t.kind === "gap") {
    gap = gapTask(s, run.focus, poolWords, rnd);
    if (!gap) { tasks.splice(pos, 1); showTask(); return; }
    card.innerHTML = `<div class="ex-top"><span class="label">Вставьте пропущенное слово</span><button class="icon-btn small-ic" data-act="say" aria-label="Послушать">${PLAY}</button></div>
      <div class="ex-zh">${s.t.map((x, i) => (i === gap!.at ? `<span class="gap-slot">＿＿</span>` : tokHTML(x, "", s.r?.[i]))).join("")}</div>
      ${s.ru ? `<div class="ex-ru small">${esc(s.ru)}</div>` : ""}
      <div class="gap-opts">${gap.options.map((o) => `<button class="tile-w" data-opt="${esc(o)}">${pyOn ? `<small class="py">${pyOf(o)}</small>` : ""}<span>${esc(o)}</span></button>`).join("")}</div>
      <div class="ex-res" id="ex-res" hidden></div>
      <div class="ex-btns" id="ex-btns"></div>`;
    return;
  }
  // аудирование
  tiles = tilesFor({ zh: s.zh, ru: s.ru, t: s.t }, poolWords, rnd, Math.min(run.distract, 1 + Math.floor(s.t.length / 5)));
  picked = [];
  card.innerHTML = `<div class="ex-top"><span class="label">Послушайте и соберите предложение</span></div>
    <div class="listen-btns"><button class="btn" data-act="say">${PLAY} Слушать</button><button class="btn" data-act="slow">Медленно</button></div>
    <div class="ex-ans" id="ex-ans"></div><div class="ex-pool" id="ex-pool"></div>
    <div class="ex-res" id="ex-res" hidden></div>
    <div class="ex-btns" id="ex-btns"><button class="btn primary wide" data-act="check" disabled>Проверить</button></div>`;
  renderTiles();
  setTimeout(() => sayx(s.zh, 0.8), 250);
}

const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;

function wordPy(w: LessonWord): string {
  if (clang === "ja") return w[1] && w[1] !== w[0] ? `<span lang="ja">${esc(w[1].split("/")[0])}</span>` : "";
  try { return w[1] ? pinyinHTML(parseRef(w[1])) : pyOf(w[0]); } catch { return pyOf(w[0]); }
}

/** Узнавание слова: иероглифы → значение или значение → иероглифы, 4 варианта. */
let wRight = "";
const markPy = (p: string) => { if (clang === "ja") return esc(p); try { return esc(toMarked(parseRef(p))); } catch { return esc(p); } };
function renderWord(w: LessonWord, dir: "zh" | "ru" | "py") {
  if (dir === "py") {
    wopts = pinyinOptions(w[1], [...run.words, ...run.courseWords].filter((x) => x[0] !== w[0] && x[1]).map((x) => x[1]), rnd);
    wRight = pinyinKey(w[1]);
    $("ex-card").innerHTML = `<div class="ex-top"><span class="label">Как читается это слово?</span></div>
       <div class="wq"><span class="wq-han">${esc(w[0])}</span><span class="hint">${esc(shortRu(w[2]))}</span></div>
       <div class="w-opts">${wopts.map((o, i) => `<button class="opt-btn py-opt" data-wopt="${i}">${markPy(o)}</button>`).join("")}</div>
       <div class="ex-res" id="ex-res" hidden></div><div class="ex-btns" id="ex-btns"></div>`;
    return;
  }
  wopts = wordOptions(w, run.words, run.courseWords, dir, rnd);
  wRight = dir === "zh" ? shortRu(w[2]) : w[0];
  $("ex-card").innerHTML = dir === "zh"
    ? `<div class="ex-top"><span class="label">Что значит это слово?</span><button class="icon-btn small-ic" data-act="say-word" aria-label="Послушать">${PLAY}</button></div>
       <div class="wq"><span class="wq-han">${esc(w[0])}</span>${pyOn ? `<span class="py">${wordPy(w)}</span>` : ""}</div>
       <div class="w-opts">${wopts.map((o, i) => `<button class="opt-btn" data-wopt="${i}">${esc(o)}</button>`).join("")}</div>
       <div class="ex-res" id="ex-res" hidden></div><div class="ex-btns" id="ex-btns"></div>`
    : `<div class="ex-top"><span class="label">${clang === "ja" ? "Как это по-японски?" : "Как это по-китайски?"}</span></div>
       <div class="ex-ru">${esc(shortRu(w[2]))}</div>
       <div class="w-opts han">${wopts.map((o, i) => `<button class="opt-btn han" data-wopt="${i}">${esc(o)}</button>`).join("")}</div>
       <div class="ex-res" id="ex-res" hidden></div><div class="ex-btns" id="ex-btns"></div>`;
  if (dir === "zh") setTimeout(() => sayx(w[0]), 200);
}

/** Грамматика: предложение с пропуском и варианты; при ошибке — напоминание правила. */
let cOpts: number[] = [];
function renderChoice(x: GramX, g: Gram) {
  cOpts = x.o.map((_, i) => i);
  for (let i = cOpts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cOpts[i], cOpts[j]] = [cOpts[j], cOpts[i]]; }
  const [a, b = ""] = x.zh.split("___");
  const toks = (z: string) => lineHTML(z);
  $("ex-card").innerHTML = `<div class="ex-top"><span class="label">Грамматика · ${esc(g.title)}</span></div>
    <div class="ex-zh">${toks(a)}<span class="gap-slot">＿＿</span>${toks(b)}</div>
    ${x.ru ? `<div class="ex-ru small">${esc(x.ru)}</div>` : ""}
    <div class="gap-opts">${cOpts.map((i) => `<button class="tile-w" data-copt="${i}">${pyOn && isWordTok(x.o[i]) ? `<small class="py">${pyOf(x.o[i])}</small>` : ""}<span>${esc(x.o[i])}</span></button>`).join("")}</div>
    <div class="ex-res" id="ex-res" hidden></div>
    <div class="ex-btns" id="ex-btns"></div>`;
}
const filled = (x: GramX) => x.zh.replace("___", x.o[x.a]);

function renderTrBody(s: Sent, mode: "type" | "tiles") {
  const body = $("ex-tr-body");
  if (mode === "tiles") {
    tiles = tilesFor({ zh: s.zh, ru: s.ru, t: s.t }, poolWords, rnd, Math.min(run.distract, 1 + Math.floor(s.t.length / 5)));
    picked = [];
    body.innerHTML = `<div class="ex-ans" id="ex-ans"></div><div class="ex-pool" id="ex-pool"></div>`;
    renderTiles();
  } else {
    if (clang === "ja") {
      body.innerHTML = `<div class="tr-in-row"><input id="ex-in" lang="ja" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Японская раскладка или ромадзи: watashi wa…" enterkeyhint="done"></div><div class="hint" id="ex-kana-prev"></div>`;
      const inp = $<HTMLInputElement>("ex-in");
      inp.addEventListener("input", () => { const v = inp.value; $("ex-kana-prev").textContent = /[a-z]/i.test(v) ? romajiToKana(v) : ""; });
      return;
    }
    body.innerHTML = `<div class="tr-in-row"><input id="ex-in" lang="zh-CN" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Китайская раскладка или «рукой»" enterkeyhint="done"><button class="icon-btn" data-act="hw" aria-label="Писать рукой" aria-pressed="false">✍</button></div><div id="ex-hw" hidden></div>`;
    hwPad = mountHwPad($("ex-hw"), (ch) => { const i = $<HTMLInputElement>("ex-in"); i.value += ch; },
      { label: "⌫", onClick: () => { const i = $<HTMLInputElement>("ex-in"); i.value = [...i.value].slice(0, -1).join(""); } });
  }
}

const trModeNow = (t: Task) => (t.kind === "tr" ? (t.tiles === undefined ? ui.trMode : t.tiles ? "tiles" : "type") : "tiles");

function renderTiles() {
  const pyT = (w: string) => (pyOn && isWordTok(w) ? `<small class="py">${pyOf(w)}</small>` : "");
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
  return `<div class="ex-zh ans">${toksHTML(s.t, mark, s.r)}</div>${s.ru ? `<div class="ex-ru small">${esc(s.ru)}</div>` : ""}`;
}

const nextBtn = () => `<button class="btn primary wide" data-act="next">${pos + 1 < tasks.length ? "Дальше" : "Итог"}</button>`;

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
  $("ex-btns").innerHTML = nextBtn();
}

async function mark(ok: boolean) {
  if (ok) right++;
  const t = tasks[pos];
  const key = t.kind === "dialog" ? t.dialog.id : t.kind === "word" ? `w:${t.word[0]}` : t.kind === "choice" ? `g:${t.x.zh}` : t.sent.zh;
  prog = record(prog, key, ok);
  await store.setMeta("ex", prog);
}

async function check() {
  const t = tasks[pos];
  if (t.kind === "dialog") { checkDialog(t.dialog); return; }
  if (t.kind === "word" || t.kind === "choice") return;
  const s = t.sent;
  if (t.kind === "dict" || (t.kind === "tr" && trModeNow(t) === "type")) {
    let mine = $<HTMLInputElement>("ex-in").value.trim();
    if (!mine) return;
    hwPad?.hide();
    // японский: ромадзи → кана; сравниваем и с записью кандзи, и с чтением каной — засчитывается лучшее
    if (clang === "ja" && /[a-z]/i.test(mine)) mine = romajiToKana(mine, true);
    let d = diffZh(mine, s.zh);
    if (clang === "ja" && s.kana) {
      // частицы は・へ・を читаются «ва・э・о» — набранные ромадзи wa/e/o засчитываем
      const pn = (x: string) => toHiragana(x).replace(/は/g, "わ").replace(/へ/g, "え").replace(/を/g, "お");
      const dk = diffZh(pn(mine), pn(s.kana));
      if (dk.score > d.score) d = { ...diffZh(toHiragana(mine), s.kana), score: dk.score };
    }
    const ok = d.score === 1;
    const refHTML = d.ref.map((x) => `<span class="${x.ok ? "c-ok" : "c-miss"}">${esc(x.c)}</span>`).join("");
    await result(ok, `<div class="chip ${ok ? "ok" : d.score >= 0.7 ? "mid" : "no"}">${ok ? "Верно" : `Совпадение ${Math.round(d.score * 100)}%`}</div>
      ${ok ? "" : `<div class="diff"><div class="label">Образец (красным — чего нет в ответе)</div><div class="diff-ref">${refHTML}</div>${d.extra.length ? `<div class="hint">Лишнее: ${esc(d.extra.join(" "))}</div>` : ""}</div>`}
      ${sentenceView(s)}`, !ok);
    return;
  }
  const ok = checkAssembled(picked, { zh: s.zh, ru: s.ru, t: s.t });
  $("ex-ans").classList.toggle("ok", ok);
  $("ex-ans").classList.toggle("bad", !ok);
  await result(ok, `<div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не совсем"}</div>${sentenceView(s)}`);
}

/* ---------- диалог ---------- */

function renderDialog(d: Dialog) {
  qAns = d.q.map(() => null);
  $("ex-card").innerHTML = `<div class="ex-top"><span class="label">${run.mode === "step" && run.step === "dialog" ? "Текст урока" : "Диалог"}: ${esc(d.title)}</span><button class="btn small" data-act="say-all">${PLAY} Весь</button></div>
    <div class="dl">${d.lines.map((l, i) => `<div class="dl-line"><span class="dl-who">${esc(l[0])}</span><div class="dl-body"><div class="ex-zh">${lineHTML(l[1])}</div><div class="dl-ru" hidden>${esc(l[2])}</div></div><button class="icon-btn small-ic" data-line="${i}" aria-label="Послушать реплику">${PLAY}</button></div>`).join("")}</div>
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

/* ---------- итог ---------- */

async function finish() {
  $("ex-count").textContent = "";
  const score = tasks.length ? right / tasks.length : 0;
  const pct = Math.round(score * 100);
  if (run.mode === "step" && course && run.step) {
    await saveBest(run.step, score);
    const l = course.set.lessons[lessonIdx];
    const steps = lessonSteps(l, ui.quiet);
    const k = steps.indexOf(run.step);
    const passed = score >= PASS;
    const next = passed ? steps[k + 1] : undefined;
    const lessonFin = passed && !next;
    $("ex-card").innerHTML = `<div class="ex-done"><b>${pct}%</b>${right} из ${tasks.length} верно</div>
      <p class="hint center">${passed ? (lessonFin ? "Урок пройден! Слова урока можно повторять карточками." : "Шаг засчитан — следующий открыт.") : `Нужно ${Math.round(PASS * 100)}%. Ошибки попадутся снова — попробуйте ещё раз.`}</p>
      <div class="ex-btns">${passed
        ? `<button class="btn" data-act="to-lesson">К уроку</button>${next ? `<button class="btn primary" data-act="step" data-step="${next}">${stepName(next, l)} →</button>` : lessonIdx + 1 < course.set.lessons.length ? `<button class="btn primary" data-act="lesson" data-lesson="${lessonIdx + 1}">Урок ${lessonIdx + 2} →</button>` : ""}`
        : `<button class="btn" data-act="to-lesson">К уроку</button><button class="btn primary" data-act="step" data-step="${run.step}">Ещё раз</button>`}</div>`;
    return;
  }
  $("ex-card").innerHTML = `<div class="ex-done"><b>${right}</b> из ${tasks.length} ${plural(tasks.length, "задания", "заданий", "заданий")} без ошибок</div>
    <p class="hint center">Ошибочные предложения вернутся в следующих занятиях.</p>
    <div class="ex-btns"><button class="btn" data-act="${run.mode === "review" ? "to-course" : "setup"}">${run.mode === "review" ? "К курсу" : "Назад"}</button><button class="btn primary" data-act="again">Ещё</button></div>`;
}

async function gloss(w: string) {
  const box = $("ex-gloss");
  if (clang === "ja") { glossJa(w); return; }
  const word = await wordByHan(w);
  box.innerHTML = `<div class="g-head"><b>${esc(w)}</b> <span class="py">${word.ref.length ? pinyinHTML(word.ref) : ""}</span><button class="icon-btn small-ic" data-say="${esc(w)}" aria-label="Послушать">${PLAY}</button></div><div class="g-ru">${esc(word.ru || "—")}</div>
    <div class="g-act"><button class="btn small" data-open="${esc(word.id)}">Статья</button><button class="btn small" data-add>+ В колоду</button></div>`;
  box.hidden = false;
  box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true));
  box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
  box.querySelector("[data-say]")!.addEventListener("click", () => say(w));
}

/** Японское слово в занятии: чтение и значение из курса, «Статья» — японский словарь. */
async function glossJa(w: string) {
  const box = $("ex-gloss");
  const r = furi[w] ?? coursePy.get(w)?.split("/")[0] ?? "";
  let ru = courseRu.get(w) ?? "";
  let jw: Word | null = null;
  try {
    const x = await loadJDict();
    const i = findJ(x, w, r || undefined)[0];
    if (i !== undefined) { jw = jWordAt(x, i); ru ||= x.ru[i]; }
  } catch { /* словарь не загрузился */ }
  box.innerHTML = `<div class="g-head"><b lang="ja">${esc(w)}</b> <span class="py" lang="ja">${r && r !== w ? esc(r) : ""}</span><button class="icon-btn small-ic" data-say aria-label="Послушать">${PLAY}</button></div><div class="g-ru">${esc(ru || "—")}</div>
    <div class="g-act">${jw ? `<button class="btn small" data-open>Статья</button><button class="btn small" data-add>+ В колоду</button>` : ""}</div>`;
  box.hidden = false;
  box.querySelector("[data-say]")!.addEventListener("click", () => say(w, 0.9, "ja"));
  if (jw) {
    const word = jw;
    box.querySelector("[data-open]")!.addEventListener("click", () => openEntry(word.id, true, (word as { jid?: string }).jid));
    box.querySelector("[data-add]")!.addEventListener("click", () => openAddToDeck(word));
  }
}

/* ---------- обработчики ---------- */

function quitRun() {
  stopSpeech();
  if (run.mode === "step") openLesson(lessonIdx);
  else if (run.mode === "review" && course) openCourse(course.key);
  else renderSetup();
}

export function initExercise() {
  onShow("ex", () => { renderHome(); });
  onLeave("ex", () => { stopSpeech(); });
  $("ex-add").addEventListener("click", openCatalog);
  $("ex").addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("[data-quiet]")) return;
    ui.quiet = !ui.quiet;
    save();
    if (!$("ex-lesson").hidden && course) openLesson(lessonIdx);
    else if (course) openCourse(course.key);
  });
  $("ex-free").addEventListener("click", renderSetup);
  $("ex-s-back").addEventListener("click", renderHome);
  $("ex-c-back").addEventListener("click", renderHome);
  $("ex-c-menu").addEventListener("click", courseMenu);
  $("ex-l-back").addEventListener("click", () => course && openCourse(course.key));
  const onFold = (e: Event) => {
    const f = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-fold]");
    if (!f) return false;
    const now = f.getAttribute("aria-expanded") === "true";
    toggleFold(f.dataset.fold!, now);
    f.setAttribute("aria-expanded", String(!now));
    (f.nextElementSibling as HTMLElement).hidden = now;
    return true;
  };
  $("ex-courses").addEventListener("click", (e) => {
    if (onFold(e)) return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-course]");
    if (b) openCourse(b.dataset.course!);
  });
  const onCourseClick = (e: Event) => {
    if (onFold(e)) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-review]")) { startReview(); return; }
    const l = t.closest<HTMLButtonElement>("[data-lesson]");
    if (l) openLesson(Number(l.dataset.lesson));
  };
  $("ex-c-head").addEventListener("click", onCourseClick);
  $("ex-c-lessons").addEventListener("click", onCourseClick);
  $("ex-l-steps").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const l = t.closest<HTMLButtonElement>("[data-lesson]");
    if (l) { openLesson(Number(l.dataset.lesson)); return; }
    if (t.closest("[data-skip-theory]")) { saveBest("words", 0).then(() => openLesson(lessonIdx)); return; }
    const s = t.closest<HTMLButtonElement>("[data-step]");
    if (s && !s.disabled) startStep(s.dataset.step as StepId);
  });
  $("ex-l-words").addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const c = course;
    if (!c) return;
    const l = c.set.lessons[lessonIdx];
    if (t.closest("[data-words-back]")) { $("ex-l-steps").hidden = false; openLesson(lessonIdx); return; }
    const sw = t.closest<HTMLButtonElement>("[data-wsay]");
    if (sw) { sayx(l.words[Number(sw.dataset.wsay)][0]); return; }
    const gs = t.closest<HTMLButtonElement>("[data-gsay]");
    if (gs) { sayx(gs.dataset.zh!, 0.8); return; }
    const tw = t.closest<HTMLButtonElement>("[data-w]");
    if (tw) { sayx(tw.dataset.w!); return; }
    if (t.closest("[data-th-py]")) { pyOn = !pyOn; ui.pyMode = pyOn ? "on" : "off"; save(); const y = window.scrollY; showWords(); window.scrollTo(0, y); return; }
    const wo = t.closest<HTMLButtonElement>("[data-wopen]");
    if (wo) { const w = await wordByHan(wo.dataset.wopen!); openEntry(w.id, true); return; }
    if (t.closest("[data-words-ok]")) { await saveBest("words", 1); await addToCourseDeck(c, [lessonIdx]); $("ex-l-steps").hidden = false; const steps = lessonSteps(l, ui.quiet); const nx = steps[steps.indexOf("words") + 1]; if (nx) startStep(nx); else openLesson(lessonIdx); return; }
    if (t.closest("[data-words-deck]")) {
      const { id } = await addToCourseDeck(c, [lessonIdx]);
      await switchDeck(id);
      show("deck");
    }
  });

  // своя практика
  $("ex-src").addEventListener("click", () => pickDeck("Колода для практики", ui.freeDeck, (id) => { ui.freeDeck = id; save(); renderSetup(); }));
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
  $("ex-start").addEventListener("click", startFree);
  $("ex-quit").addEventListener("click", quitRun);
  // пиньинь над словами: включить/выключить (запоминается); текущее задание перерисовывается, если ещё не отвечено
  $("ex-pyt").addEventListener("click", () => {
    pyOn = !pyOn;
    if (run.mode === "free") ui.pinyin = pyOn; else ui.pyMode = pyOn ? "on" : "off";
    save();
    $("ex-pyt").setAttribute("aria-pressed", String(pyOn));
    if (!answered && (tasks[pos]?.kind !== "dialog" || qAns.every((x) => x === null))) showTask();
    else document.querySelectorAll<HTMLElement>("#ex-card .w .py").forEach((x) => (x.hidden = !pyOn));
  });

  // задания
  $("ex-card").addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const task = tasks[pos];
    const w = t.closest<HTMLButtonElement>("[data-w]");
    if (w) { gloss(w.dataset.w!); return; }
    const actBtn = t.closest<HTMLButtonElement>("[data-act]");
    const act = actBtn?.dataset.act;
    if (act === "check") { check(); return; }
    if (act === "next") { pos++; showTask(); window.scrollTo(0, 0); return; }
    if (act === "again") { if (run.mode === "review") startReview(); else startFree(); return; }
    if (act === "setup") { renderSetup(); return; }
    if (act === "to-course") { if (course) openCourse(course.key); return; }
    if (act === "to-lesson") { openLesson(lessonIdx); return; }
    if (act === "step") { startStep(actBtn!.dataset.step as StepId); return; }
    if (act === "lesson") { openLesson(Number(actBtn!.dataset.lesson)); return; }
    if (act === "say-word" && task?.kind === "word") { sayx(task.word[0]); return; }
    if (act === "say" && task && task.kind !== "dialog" && task.kind !== "word" && task.kind !== "choice") { sayx(task.sent.zh, 0.8); return; }
    if (act === "slow" && task && task.kind !== "dialog" && task.kind !== "word" && task.kind !== "choice") { sayx(task.sent.zh, 0.55); return; }
    if (act === "say-x" && task?.kind === "choice") { sayx(filled(task.x), 0.8); return; }
    if (act === "say-all" && task?.kind === "dialog") { sayAll(task.dialog.lines.map((l) => (clang === "ja" ? plainJa(l[1]) : l[1])), 0.8, clang); return; }
    if (act === "ru") { document.querySelectorAll<HTMLElement>("#ex-card .dl-ru").forEach((x) => (x.hidden = !x.hidden)); return; }
    if (act === "hw") { if (hwPad?.visible()) hwPad.hide(); else hwPad?.show(); actBtn!.setAttribute("aria-pressed", String(!!hwPad?.visible())); return; }
    const line = t.closest<HTMLButtonElement>("[data-line]");
    if (line && task?.kind === "dialog") { sayx(task.dialog.lines[Number(line.dataset.line)][1], 0.8); return; }
    const tr = t.closest<HTMLButtonElement>("[data-tr]");
    if (tr && task?.kind === "tr" && !answered) {
      ui.trMode = tr.dataset.tr as "type" | "tiles"; save();
      document.querySelectorAll<HTMLButtonElement>("#ex-card [data-tr]").forEach((x) => x.setAttribute("aria-pressed", String(x === tr)));
      renderTrBody(task.sent, ui.trMode);
      const c = $("ex-btns").querySelector<HTMLButtonElement>("[data-act=check]");
      if (c) c.disabled = ui.trMode === "tiles";
      return;
    }
    if (answered) {
      const s = t.closest<HTMLButtonElement>("[data-self]");
      if (s) { await mark(s.dataset.self === "1"); $("ex-btns").innerHTML = nextBtn(); }
      return;
    }
    const wo = t.closest<HTMLButtonElement>("[data-wopt]");
    const co = t.closest<HTMLButtonElement>("[data-copt]");
    if (co && task?.kind === "choice") {
      const i = Number(co.dataset.copt), ok = i === task.x.a;
      document.querySelectorAll<HTMLButtonElement>("#ex-card [data-copt]").forEach((b) => {
        b.classList.toggle("right", Number(b.dataset.copt) === task.x.a);
        b.classList.toggle("wrong", b === co && !ok);
        b.disabled = true;
      });
      const full = filled(task.x);
      sayx(full, 0.8);
      await result(ok, `<div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не так"}</div>
        <div class="ex-zh ans">${lineHTML(full)}<button class="icon-btn small-ic" data-act="say-x" aria-label="Послушать">${PLAY}</button></div>
        ${ok ? "" : `<div class="rule-hint"><b>${esc(task.rule.title)}</b>${task.rule.text.map((t) => `<p>${esc(t)}</p>`).join("")}${gramTable(task.rule)}${gramNotes(task.rule)}${task.rule.ex[0] ? `<div class="g-ex"><div class="ex-zh">${lineHTML(task.rule.ex[0][0])}</div>${task.rule.ex[0][1] ? `<div class="g-ru">${esc(task.rule.ex[0][1])}</div>` : ""}</div>` : ""}</div>`}`);
      return;
    }
    if (wo && task?.kind === "word") {
      const right0 = wRight;
      const ok = wopts[Number(wo.dataset.wopt)] === right0;
      document.querySelectorAll<HTMLButtonElement>("#ex-card [data-wopt]").forEach((b) => {
        b.classList.toggle("right", wopts[Number(b.dataset.wopt)] === right0);
        b.classList.toggle("wrong", b === wo && !ok);
        b.disabled = true;
      });
      if (task.dir !== "zh") sayx(task.word[0]);
      await result(ok, `<div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не то"}</div><div class="w-ans"><b>${esc(task.word[0])}</b> <span class="py">${wordPy(task.word)}</span> — ${esc(task.word[2])}</div>`);
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
