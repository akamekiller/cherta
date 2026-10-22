/**
 * Занятие. Навыки слова (как в Skritter): написание (значение → иероглифы → пиньинь, оценка сама),
 * чтение и значение (иероглифы → вспомнить → показать ответ → оценить себя), тоны (иероглифы → тоны жестом → оценка сама).
 */
import { app, counts, nextCard, preview, answer, undoAnswer, skillCard, editOf, words, lapsesOf, LEECH, type UndoInfo, type NextCard } from "../state.ts";
import { SKILLS, cardId, type Skill } from "../core/skills.ts";
import type { P } from "../core/beauty.ts";
import { handResult, beautyLabel } from "./handview.ts";
import { openWordEditor } from "./editor.ts";
import { isJa, langOf, type Word } from "../core/deck.ts";
import { checkKana, isKana, romajiToKana, mainReading } from "../core/kana.ts";
import { formatGap, type Grade } from "../core/fsrs.ts";
import { checkPinyin } from "../core/pinyin.ts";
import { autoGrade } from "../core/grade.ts";
import { say } from "../speech.ts";
import { preload } from "../strokes.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { createWriter, type Writer } from "./writer.ts";
import { show, onLeave } from "./nav.ts";
import { mountFreePad, type FreePad } from "./freepad.ts";
import { loadHwDb } from "./hwpad.ts";
import { recognize } from "../core/handwriting.ts";
import { blindMistakes } from "../core/grade.ts";
import { getChar } from "../strokes.ts";
import { slashFx, deathFx } from "./ambient.ts";
import { initPyPick, resetPyPick, pyAnswer, pyAnswerShown, pyComplete } from "./pypick.ts";

type Session = {
  word: Word | null;
  skill: Skill;
  fresh: NextCard["fresh"];
  /** Последний ответ — для «Отменить». */
  undo: { info: UndoInfo; card: NextCard } | null;
  chars: string[];
  ci: number;
  miss: number[];
  gave: boolean[];
  hint: boolean[];
  isNew: boolean;
  writer: Writer | null;
  answered: boolean;
  grading: boolean;  // идёт сохранение оценки — повторные нажатия игнорируются
  mistakes: number;
  done: number;
  /** Свои черты по иероглифам — для оценки почерка и повтора. */
  drawn: P[][][];
};
let s: Session | null = null;
export const sessionWriter = () => s?.writer ?? null;

const GRADE_NAMES = ["Снова", "Трудно", "Хорошо", "Легко"];

export function startSession() {
  s = { word: null, skill: "write", fresh: null, undo: null, chars: [], ci: 0, miss: [], gave: [], hint: [], isNew: false, writer: null, answered: false, grading: false, mistakes: 0, done: 0, drawn: [] };
  show("session");
  nextQuestion();
}

function stopWriter() {
  try { s?.writer?.cancelQuiz(); } catch { /* нет активного теста */ }
  free?.destroy();
  free = null;
}

/* ---------- письмо без подсказок ---------- */

let free: FreePad | null = null;
/** Без подсказок — если включено в настройках и слово уже не новое (новые пишутся по контуру). */
// японские слова — всегда по данным черт: распознавание рисунка обучено только на китайских иероглифах
const blindNow = () => !!app.settings.blind && !!s && !s.isNew && !!s.word && !isJa(s.word);

function blindTools(on: boolean) {
  $("b-hint").hidden = on;
  $("b-giveup").hidden = on;
  $("b-undo-stroke").hidden = !on;
  $("b-char-done").hidden = !on;
}

function startBlind() {
  if (!s) return;
  const cur = s;
  free = mountFreePad($("hw"));
  const done = $<HTMLButtonElement>("b-char-done");
  done.disabled = true;
  free.onChange(() => { done.disabled = !free?.strokes().length; });
  void cur;
}

/** «Готово»: распознаём рисунок, считаем ошибки, показываем образец и идём дальше. */
async function finishBlind() {
  if (!s || !free) return;
  const cur = s, i = s.ci, ch = s.chars[i];
  const strokes = free.strokes().map((st) => st.slice());
  if (!strokes.length) return;
  $<HTMLButtonElement>("b-char-done").disabled = true;
  let rank = -1;
  try { rank = recognize(await loadHwDb(), strokes, 10).indexOf(ch); } catch { rank = 0; /* без данных распознавания — не наказываем */ }
  const data = await getChar(ch, cur.word ? langOf(cur.word) : "zh").catch(() => null);
  const diff = data ? strokes.length - data.strokes.length : 0;
  if (s !== cur || cur.ci !== i) return;
  cur.miss[i] = blindMistakes(rank, diff);
  // свои черты — для оценки почерка (координаты hanzi-writer: 1024, ось y вверх)
  cur.drawn[i] = strokes.map((st) => st.map(([x, y]) => ({ x: x * 1024, y: 900 - y * 1024 })));
  const ok = cur.miss[i] === 0;
  const pad = $("pad");
  pad.classList.add(ok ? "hit" : "miss");
  if (!ok && app.settings.vibrate) try { navigator.vibrate?.(35); } catch { /* */ }
  setTimeout(() => pad.classList.remove("hit", "miss"), 400);
  // образец поверх своего рисунка
  free.destroy();
  free = null;
  const wr = createWriter($("hw"), ch, { showOutline: true, showCharacter: false }, cur.word ? langOf(cur.word) : "zh");
  cur.writer = wr;
  wr.animateCharacter({
    onComplete: () => setTimeout(() => {
      if (s !== cur || cur.ci !== i) return;
      cur.ci++;
      renderSlots();
      if (cur.ci < cur.chars.length) startChar();
      else { blindTools(false); charsDone(); }
    }, ok ? 500 : 1200),
  });
}

/** Дополнительная проба письма после ответа: на оценку и расписание не влияет. */
let practiceGen = 0;
function practiceAgain() {
  const cur = s;
  if (!cur?.word || !cur.answered || cur.skill !== "write") return;
  const my = ++practiceGen, word = cur.word;
  $("pad").hidden = false;
  const alive = () => s === cur && cur.word === word && practiceGen === my;
  const step = (i: number) => {
    stopWriter();
    cur.writer = createWriter($("hw"), cur.chars[i], { showOutline: false }, langOf(word));
    cur.writer.quiz({
      onMistake: () => { if (app.settings.vibrate) try { navigator.vibrate?.(35); } catch { /* */ } },
      onComplete: () => setTimeout(() => { if (alive() && i + 1 < cur.chars.length) step(i + 1); }, 350),
    });
  };
  step(0);
}

function endSession() { stopWriter(); s = null; }

const SKILL_TASK: Record<Skill, string> = {
  write: "напишите иероглифы",
  recall: "вспомните иероглифы и пиньинь",
  read: "вспомните пиньинь и значение",
  tone: "поставьте тоны",
  def: "вспомните значение",
};

/** Задание навыка; у японских слов вместо пиньиня — чтение. */
const task = (w: Word, sk: Skill) => (isJa(w) ? SKILL_TASK[sk].replace("иероглифы и пиньинь", "слово и чтение").replace("пиньинь", "чтение") : SKILL_TASK[sk]);

function nextQuestion(force?: NextCard) {
  if (!s) return;
  const next = force ?? nextCard(s.word ? cardId(s.word.id, s.skill) : undefined);
  if (!next) {
    const n = s.done;
    endSession();
    $("done-text").textContent = n
      ? `Пройдено карточек: ${n}. Новые слова и повторения на сейчас закончились.`
      : "Новые слова и повторения на сейчас закончились.";
    show("done");
    document.dispatchEvent(new CustomEvent("cherta:done"));
    return;
  }
  const { word: w, skill } = next;
  const c = counts();
  $("left").textContent = `осталось ${c.total}`;
  $("undo").hidden = !s.undo;
  const chars = [...w.han];
  Object.assign(s, { word: w, skill, fresh: next.fresh, chars, ci: 0, miss: chars.map(() => 0), gave: chars.map(() => false), hint: chars.map(() => false), isNew: !skillCard(w, skill), answered: false, grading: false, mistakes: 0, drawn: chars.map(() => []) });
  stopWriter();
  practiceGen++;
  const write = skill === "write";
  const isNew = s.isNew ? "Новое · " : "";
  // вопрос: для написания и «вспомнить слово» — значение, для остальных навыков — иероглифы
  const byMeaning = write || skill === "recall";
  $("q-ru").textContent = byMeaning ? w.ru : w.han;
  $("q-ru").classList.toggle("q-han", !byMeaning);
  $("q-py").hidden = skill !== "def" && skill !== "tone";
  $("q-py").innerHTML = skill === "def" ? readingHTML(w) : skill === "tone" ? esc(w.ru) : "";
  $("q-py").classList.toggle("q-tr", skill === "tone");
  $("q-meta").textContent = write
    ? `${isNew}${chars.length} ${unitWord(w, chars.length)}`
    : skill === "recall"
      ? `${isNew}${task(w, "recall")} · ${chars.length} ${unitWord(w, chars.length)}`
      : `${isNew}${SKILLS.find((x) => x.id === skill)!.name}: ${task(w, skill)}`;
  $("ask").hidden = false;
  $("res").hidden = true;
  document.querySelector<HTMLElement>("#session .prompt")!.hidden = false;
  $("slots").hidden = !write;
  $("pad").hidden = !write;
  $("ask").querySelector<HTMLElement>(".tools")!.hidden = !write;
  const check = $<HTMLButtonElement>("b-check");
  if (write) {
    preload(w.han, langOf(w));
    if (!isJa(w)) resetPyPick(w.id, w.ref);
    $<HTMLInputElement>("kana-in").value = "";
    $("kana-prev").textContent = "";
    $("kana-field").hidden = true;
    // пиньинь — после иероглифов: пока пишешь, экран не загромождён
    $("py-field").hidden = true;
    check.disabled = true;
    check.textContent = app.settings.pinyin ? "Проверить" : "Сначала напишите иероглифы";
    renderSlots();
    startChar();
  } else if (skill === "tone") {
    resetPyPick(w.id, w.ref, true);
    $("py-field").hidden = false;
    check.disabled = false;
    check.textContent = "Проверить";
  } else {
    $("py-field").hidden = true;
    $("kana-field").hidden = true;
    check.disabled = false;
    check.textContent = "Показать ответ";
    check.focus({ preventScroll: true });
  }
}

/** «иероглифа» / у японских слов — «знака» (кана — не иероглифы). */
const unitWord = (w: Word, n: number) => (isJa(w) ? plural(n, "знак", "знака", "знаков") : plural(n, "иероглиф", "иероглифа", "иероглифов"));

/** Чтение японского слова (основное и другие), каной; у слова из одной каны чтение = написание — не повторяем. */
function readingHTML(w: Word): string {
  if (isKana(w.han) && w.py === w.han) return "";
  const all = w.py.split("/");
  return `<span class="py kana" lang="ja">${esc(mainReading(w.py))}</span>${all.length > 1 ? ` <span class="hint" lang="ja">также ${esc(all.slice(1).join("、"))}</span>` : ""}`;
}

function renderSlots() {
  if (!s) return;
  const cur = s;
  $("slots").innerHTML = cur.chars.map((ch, i) => {
    const done = i < cur.ci;
    const bad = done && (cur.miss[i] > 2 || cur.gave[i]);
    return `<div class="slot${i === cur.ci ? " cur" : ""}${bad ? " bad" : ""}">${done ? ch : ""}</div>`;
  }).join("");
}

function startChar() {
  if (!s) return;
  stopWriter();
  blindTools(blindNow());
  if (blindNow()) { startBlind(); return; }
  const outline = s.isNew;
  s.writer = createWriter($("hw"), s.chars[s.ci], { showOutline: outline }, s.word ? langOf(s.word) : "zh");
  if (outline) s.hint[s.ci] = true;
  runQuiz();
}

function runQuiz() {
  if (!s?.writer) return;
  const i = s.ci, cur = s;
  s.writer.quiz({
    onCorrectStroke: (d: { strokeNum: number; drawnPath: { points: P[] } }) => {
      if (s === cur) cur.drawn[i][d.strokeNum] = d.drawnPath.points.map((p) => ({ x: p.x, y: p.y }));
    },
    onMistake: () => {
      cur.miss[i]++;
      if (app.settings.vibrate) try { navigator.vibrate?.(35); } catch { /* не все устройства умеют */ }
      const pad = $("pad");
      pad.classList.add("miss");
      setTimeout(() => pad.classList.remove("miss"), 280);
    },
    onComplete: () => {
      slashFx();
      setTimeout(() => {
        if (s !== cur || cur.ci !== i) return;
        cur.ci++;
        renderSlots();
        if (cur.ci < cur.chars.length) startChar();
        else charsDone();
      }, 450);
    },
  });
}

/** Японскому слову нужно вводить чтение, только если в нём есть кандзи (у слова из каны чтение = написание). */
const needsKana = (w: Word) => isJa(w) && !isKana(w.han);

function charsDone() {
  if (!s) return;
  if (!app.settings.pinyin || (s.word && isJa(s.word) && !needsKana(s.word))) { reveal(); return; }
  if (s.word && isJa(s.word)) {
    const check = $<HTMLButtonElement>("b-check");
    check.disabled = false;
    check.textContent = "Проверить";
    $("ask").querySelector<HTMLElement>(".tools")!.hidden = true;
    $("kana-field").hidden = false;
    $("b-check").scrollIntoView({ behavior: "smooth", block: "end" });
    // на телефоне клавиатура сама не открывается: поле открывается касанием, а письмо рядом остаётся видно
    if (!matchMedia("(pointer: coarse)").matches) $<HTMLInputElement>("kana-in").focus({ preventScroll: true });
    return;
  }
  const check = $<HTMLButtonElement>("b-check");
  check.disabled = false;
  check.textContent = "Проверить";
  $("ask").querySelector<HTMLElement>(".tools")!.hidden = true;
  $("py-field").hidden = false;
  $("b-check").scrollIntoView({ behavior: "smooth", block: "end" });
  const py = $<HTMLInputElement>("py-in");
  if (!py.hidden && !py.value) py.focus({ preventScroll: true });
}

/** « в слоге 3» / « в слогах 1, 3» — если неверны не все слоги. */
function wrongSyl(per: boolean[]): string {
  const bad = per.map((x, i) => (x ? 0 : i + 1)).filter(Boolean);
  if (!bad.length || bad.length === per.length) return "";
  return bad.length === 1 ? ` в слоге ${bad[0]}` : ` в слогах ${bad.join(", ")}`;
}

function reveal() {
  if (!s?.word || s.answered) return;
  s.answered = true;
  const w = s.word;
  const skill = s.skill;
  const chips: string[] = [];
  let g: Grade = 3;
  let per: boolean[] | undefined;
  if (skill === "write") {
    const mistakes = s.miss.reduce((a, b) => a + b, 0);
    const gaveUp = s.gave.some(Boolean);
    const hinted = s.hint.some(Boolean);
    const ja = isJa(w);
    const kanaTyped = $<HTMLInputElement>("kana-in").value;
    const kana = ja && needsKana(w) && app.settings.pinyin ? checkKana(kanaTyped, w.py) : null;
    const typed = ja ? kanaTyped : pyAnswer();
    const py = ja ? (kana ? { ok: kana.ok, per: [kana.ok], letters: false } : null) : app.settings.pinyin ? checkPinyin(typed, w.ref) : null;
    g = autoGrade({ chars: s.chars.length, mistakes, gaveUp, hinted, isNew: s.isNew, pinyin: py });
    if (gaveUp) chips.push(`<span class="chip no">Подсмотрено</span>`);
    else if (mistakes === 0) chips.push(`<span class="chip ok">Черты без ошибок</span>`);
    else chips.push(`<span class="chip ${mistakes > s.chars.length ? "no" : "mid"}">Ошибок в чертах: ${mistakes}</span>`);
    if (hinted && !gaveUp && !s.isNew) chips.push(`<span class="chip mid">С контуром</span>`);
    if (kana) {
      chips.push(kana.ok ? `<span class="chip ok">Чтение верно</span>`
        : `<span class="chip no">Чтение: ошибка${kana.typed ? ` · вы: <span lang="ja">${esc(kana.typed)}</span>` : ""}</span>`);
    } else if (py) {
      per = py.per;
      chips.push(py.ok ? `<span class="chip ok">Пиньинь верно</span>`
        : `<span class="chip no">Пиньинь: ${py.letters ? "тоны" : "ошибка"}${wrongSyl(py.per)}${typed ? ` · вы: ${esc(pyAnswerShown())}` : ""}</span>`);
    }
    s.mistakes = mistakes;
  } else if (skill === "tone") {
    const py = checkPinyin(pyAnswer(), w.ref);
    per = py.per;
    const wrong = py.per.filter((x) => !x).length;
    g = py.ok ? 3 : 1;
    s.mistakes = wrong;
    chips.push(py.ok ? `<span class="chip ok">Тоны верно</span>` : `<span class="chip no">Неверных тонов: ${wrong} · вы: ${esc(pyAnswerShown())}</span>`);
  } else {
    chips.push(`<span class="chip">Оцените себя: вспомнили?</span>`);
  }
  const lapses = lapsesOf(w);
  if (lapses >= LEECH) chips.push(`<button class="chip mid leech" id="r-leech">Пиявка: забыто ${lapses} раз — добавить подсказку</button>`);

  if (g === 1) deathFx();
  $("ask").hidden = true;
  $("res").hidden = false;
  // у чтения, тонов и значения ответ повторяет вопрос — вопрос прячем
  document.querySelector<HTMLElement>("#session .prompt")!.hidden = skill !== "write";
  $("pad").hidden = skill !== "write";
  $("slots").hidden = skill !== "write";
  $("r-han").textContent = w.han;
  $("r-again").hidden = skill !== "write";
  $("r-py").innerHTML = isJa(w) ? readingHTML(w) : pinyinHTML(w.ref, per);
  $("r-ru").textContent = w.ru;
  showNote($("r-note"), w.id);
  $("r-verdict").innerHTML = chips.join("");
  document.getElementById("r-leech")?.addEventListener("click", () => s?.word && openWordEditor(s.word, refreshAfterEdit));
  const now = Date.now();
  $("grades").innerHTML = GRADE_NAMES.map((name, i) => {
    const gr = (i + 1) as Grade;
    const gap = preview(w, skill, gr, now).due - now;
    return `<button class="grade${gr === g ? " suggest" : ""}" data-g="${gr}">${name}<small>${formatGap(gap)}</small></button>`;
  }).join("");
  if (app.settings.voice) say(w.han, 0.85, langOf(w));
  ($("grades").querySelector(".suggest") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  $("r-hand").hidden = true;
  $("r-hand").innerHTML = "";
  if (skill === "write") showHand(s);
}

/** Оценка почерка: метка в ответе, по нажатию — свои черты рядом с образцом и повтор письма. */
async function showHand(cur: Session) {
  const word = cur.word;
  const res = await handResult(cur.chars, cur.drawn, word ? langOf(word) : "zh");
  if (s !== cur || cur.word !== word || !res) return;
  const chip = document.createElement("button");
  chip.className = `chip hand ${res.score >= 75 ? "ok" : res.score >= 55 ? "mid" : "no"}`;
  chip.textContent = `Почерк: ${res.score} — ${beautyLabel(res.score)}`;
  chip.setAttribute("aria-expanded", "false");
  $("r-verdict").append(chip);
  const box = $("r-hand");
  box.innerHTML = res.html;
  chip.addEventListener("click", () => {
    box.hidden = !box.hidden;
    chip.setAttribute("aria-expanded", String(!box.hidden));
    if (!box.hidden) res.play(box);
  });
  box.querySelector("[data-hv-play]")?.addEventListener("click", () => res.play(box));
}

async function grade(g: Grade) {
  if (!s?.word || !s.answered || s.grading) return;
  const cur = s;
  cur.grading = true;
  if (g === 1) deathFx(); else if (g >= 3) slashFx();
  const card: NextCard = { word: cur.word!, skill: cur.skill, fresh: cur.fresh };
  const info = await answer(cur.word!, cur.skill, g, cur.mistakes, cur.fresh);
  if (s !== cur) return;
  cur.undo = { info, card };
  cur.done++;
  nextQuestion();
}

/** Отменить последний ответ и показать ту карточку снова. */
async function undo() {
  if (!s?.undo || s.grading) return;
  const cur = s, u = s.undo;
  cur.undo = null;
  cur.grading = true;
  await undoAnswer(u.info);
  if (s !== cur) return;
  cur.done = Math.max(0, cur.done - 1);
  nextQuestion(u.card);
}

export function showNote(el: HTMLElement, id: string) {
  const n = editOf(id)?.note;
  el.hidden = !n;
  el.textContent = n ?? "";
}

/** После правки обновляем показанный ответ: значение, пиньинь, заметку. */
function refreshAfterEdit() {
  if (!s) return;
  const fresh = words().find((x) => x.id === s!.word?.id);
  if (!fresh) return;
  s.word = fresh;
  $("r-py").innerHTML = isJa(fresh) ? readingHTML(fresh) : pinyinHTML(fresh.ref);
  $("r-ru").textContent = fresh.ru;
  showNote($("r-note"), fresh.id);
}

export function initSession() {
  $("r-again").addEventListener("click", practiceAgain);
  $("r-edit").addEventListener("click", () => s?.word && openWordEditor(s.word, refreshAfterEdit));
  $("quit").addEventListener("click", () => show("deck"));
  $("done-home").addEventListener("click", () => show("deck"));
  onLeave("session", endSession);
  $("b-hint").addEventListener("click", () => {
    if (!s?.writer || s.ci >= s.chars.length) return;
    s.hint[s.ci] = true;
    s.writer.showOutline();
  });
  $("b-undo-stroke").addEventListener("click", () => free?.undo());
  $("b-char-done").addEventListener("click", () => { finishBlind(); });
  $("b-giveup").addEventListener("click", () => {
    if (!s?.writer || s.ci >= s.chars.length) return;
    const cur = s, i = s.ci, wr = s.writer;
    cur.gave[i] = true;
    stopWriter();
    wr.showOutline();
    wr.animateCharacter({
      onComplete: () => setTimeout(() => {
        if (s !== cur || cur.ci !== i) return;
        wr.hideCharacter();
        runQuiz();
      }, 400),
    });
  });
  initPyPick(() => {});
  $("py-in").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // тоны ещё не поставлены — убираем клавиатуру, чтобы были видны кнопки тонов
    if (!pyComplete()) { $<HTMLInputElement>("py-in").blur(); return; }
    if (!$<HTMLButtonElement>("b-check").disabled) reveal();
  });
  $("b-check").addEventListener("click", reveal);
  $("grades").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".grade");
    if (b) grade(Number(b.dataset.g) as Grade);
  });
  $("r-say").addEventListener("click", () => s?.word && say(s.word.han, 0.85, langOf(s.word)));
  // чтение каной: ромадзи переводятся на лету (показ под полем), Enter — проверить
  $("kana-in").addEventListener("input", () => {
    const v = $<HTMLInputElement>("kana-in").value;
    const k = romajiToKana(v);
    const tail = k.match(/[a-z']+$/i)?.[0] ?? "";
    $("kana-prev").innerHTML = `${esc(k.slice(0, k.length - tail.length))}<span class="rest">${esc(tail)}</span>`;
  });
  $("kana-in").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $<HTMLButtonElement>("b-check").click(); }
  });
  $("undo").addEventListener("click", undo);
  document.addEventListener("keydown", (e) => {
    // Ctrl+Z — отменить последний ответ, как в Anki
    if (s && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); undo(); return; }
    // клавиши 1–4 ставят оценку, но не когда печатаешь в поле (например, в редакторе слова)
    const t = e.target as HTMLElement;
    if (!s?.answered || $("res").hidden || !$("sheet").hidden || t.closest("input,textarea,select")) return;
    if (["1", "2", "3", "4"].includes(e.key)) grade(Number(e.key) as Grade);
  });
}
