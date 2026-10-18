/** Занятие: значение → пишешь иероглифы → пиньинь → оценка. */
import { app, counts, nextWord, preview, answer, cardOf, editOf, words } from "../state.ts";
import { openWordEditor } from "./editor.ts";
import type { Word } from "../core/deck.ts";
import { formatGap, type Grade } from "../core/fsrs.ts";
import { checkPinyin } from "../core/pinyin.ts";
import { autoGrade } from "../core/grade.ts";
import { say } from "../speech.ts";
import { preload } from "../strokes.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { createWriter, type Writer } from "./writer.ts";
import { show, onLeave } from "./nav.ts";

type Session = {
  word: Word | null;
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
};
let s: Session | null = null;
export const sessionWriter = () => s?.writer ?? null;

const GRADE_NAMES = ["Снова", "Трудно", "Хорошо", "Легко"];

export function startSession() {
  s = { word: null, chars: [], ci: 0, miss: [], gave: [], hint: [], isNew: false, writer: null, answered: false, grading: false, mistakes: 0, done: 0 };
  show("session");
  nextQuestion();
}

function stopWriter() {
  try { s?.writer?.cancelQuiz(); } catch { /* нет активного теста */ }
}

function endSession() { stopWriter(); s = null; }

function nextQuestion() {
  if (!s) return;
  const w = nextWord(s.word?.id);
  if (!w) {
    const n = s.done;
    endSession();
    $("done-text").textContent = n
      ? `Пройдено карточек: ${n}. Новые слова и повторения на сейчас закончились.`
      : "Новые слова и повторения на сейчас закончились.";
    show("done");
    return;
  }
  const c = counts();
  $("left").textContent = `осталось ${c.total}`;
  const chars = [...w.han];
  Object.assign(s, { word: w, chars, ci: 0, miss: chars.map(() => 0), gave: chars.map(() => false), hint: chars.map(() => false), isNew: !cardOf(w), answered: false, grading: false, mistakes: 0 });
  preload(w.han);
  $("q-ru").textContent = w.ru;
  $("q-meta").textContent = `${s.isNew ? "Новое слово · " : ""}${chars.length} ${plural(chars.length, "иероглиф", "иероглифа", "иероглифов")}`;
  $("ask").hidden = false;
  $("res").hidden = true;
  const py = $<HTMLInputElement>("py-in");
  py.value = "";
  $("py-field").hidden = !app.settings.pinyin;
  const check = $<HTMLButtonElement>("b-check");
  check.disabled = true;
  check.textContent = app.settings.pinyin ? "Проверить" : "Сначала напишите иероглифы";
  renderSlots();
  startChar();
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
  const outline = s.isNew;
  s.writer = createWriter($("hw"), s.chars[s.ci], { showOutline: outline });
  if (outline) s.hint[s.ci] = true;
  runQuiz();
}

function runQuiz() {
  if (!s?.writer) return;
  const i = s.ci, cur = s;
  s.writer.quiz({
    onMistake: () => {
      cur.miss[i]++;
      const pad = $("pad");
      pad.classList.add("miss");
      setTimeout(() => pad.classList.remove("miss"), 280);
    },
    onComplete: () => {
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

function charsDone() {
  if (!s) return;
  if (!app.settings.pinyin) { reveal(); return; }
  const check = $<HTMLButtonElement>("b-check");
  check.disabled = false;
  check.textContent = "Проверить";
  const py = $<HTMLInputElement>("py-in");
  if (!py.value) py.focus({ preventScroll: true });
}

function reveal() {
  if (!s?.word || s.answered) return;
  s.answered = true;
  const w = s.word;
  const mistakes = s.miss.reduce((a, b) => a + b, 0);
  const gaveUp = s.gave.some(Boolean);
  const hinted = s.hint.some(Boolean);
  const typed = $<HTMLInputElement>("py-in").value.trim();
  const py = app.settings.pinyin ? checkPinyin(typed, w.ref) : null;
  const g = autoGrade({ chars: s.chars.length, mistakes, gaveUp, hinted, isNew: s.isNew, pinyin: py });

  $("ask").hidden = true;
  $("res").hidden = false;
  $("r-han").textContent = w.han;
  $("r-py").innerHTML = pinyinHTML(w.ref, py?.per);
  $("r-ru").textContent = w.ru;
  showNote($("r-note"), w.id);
  const chips: string[] = [];
  if (gaveUp) chips.push(`<span class="chip no">Подсмотрено</span>`);
  else if (mistakes === 0) chips.push(`<span class="chip ok">Черты без ошибок</span>`);
  else chips.push(`<span class="chip ${mistakes > s.chars.length ? "no" : "mid"}">Ошибок в чертах: ${mistakes}</span>`);
  if (hinted && !gaveUp && !s.isNew) chips.push(`<span class="chip mid">С контуром</span>`);
  if (py) {
    chips.push(py.ok ? `<span class="chip ok">Пиньинь верно</span>`
      : `<span class="chip no">Пиньинь: ${py.letters ? "тоны" : "ошибка"}${typed ? ` · вы: ${esc(typed)}` : ""}</span>`);
  }
  $("r-verdict").innerHTML = chips.join("");
  const now = Date.now();
  $("grades").innerHTML = GRADE_NAMES.map((name, i) => {
    const gr = (i + 1) as Grade;
    const gap = preview(w, gr, now).due - now;
    return `<button class="grade${gr === g ? " suggest" : ""}" data-g="${gr}">${name}<small>${formatGap(gap)}</small></button>`;
  }).join("");
  s.mistakes = mistakes;
  if (app.settings.voice) say(w.han);
  ($("grades").querySelector(".suggest") as HTMLButtonElement | null)?.focus({ preventScroll: true });
}

async function grade(g: Grade) {
  if (!s?.word || !s.answered || s.grading) return;
  const cur = s;
  cur.grading = true;
  await answer(cur.word!, g, cur.mistakes);
  if (s !== cur) return;
  cur.done++;
  nextQuestion();
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
  $("r-py").innerHTML = pinyinHTML(fresh.ref);
  $("r-ru").textContent = fresh.ru;
  showNote($("r-note"), fresh.id);
}

export function initSession() {
  $("r-edit").addEventListener("click", () => s?.word && openWordEditor(s.word, refreshAfterEdit));
  $("quit").addEventListener("click", () => show("home"));
  $("done-home").addEventListener("click", () => show("home"));
  onLeave("session", endSession);
  $("b-hint").addEventListener("click", () => {
    if (!s?.writer || s.ci >= s.chars.length) return;
    s.hint[s.ci] = true;
    s.writer.showOutline();
  });
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
  $("py-in").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$<HTMLButtonElement>("b-check").disabled) { e.preventDefault(); reveal(); }
  });
  $("b-check").addEventListener("click", reveal);
  $("grades").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".grade");
    if (b) grade(Number(b.dataset.g) as Grade);
  });
  $("r-say").addEventListener("click", () => s?.word && say(s.word.han));
  document.addEventListener("keydown", (e) => {
    // клавиши 1–4 ставят оценку, но не когда печатаешь в поле (например, в редакторе слова)
    const t = e.target as HTMLElement;
    if (!s?.answered || $("res").hidden || !$("sheet").hidden || t.closest("input,textarea,select")) return;
    if (["1", "2", "3", "4"].includes(e.key)) grade(Number(e.key) as Grade);
  });
}
