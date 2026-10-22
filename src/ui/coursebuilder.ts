/**
 * Конструктор курса: курс без разметки — название, уроки, у урока поля (слова, предложения, диалоги с вопросами,
 * правила с заданиями). Сохраняется в обычный текст курса (meta exsets), его же можно открыть и поправить.
 * Черновик держится в localStorage, чтобы случайно закрытая панель не теряла работу.
 */
import { courseToText, emptyCourse, emptyLesson, wordRows, type BCourse, type BLesson } from "../core/coursebuild.ts";
import { esc, plural } from "./dom.ts";
import { $ } from "./dom.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import { lexicon } from "./import.ts";
import { addOwnCourse, updateOwnCourse } from "./exercise.ts";

const DRAFT = "cherta.cbuild";
type Draft = { c: BCourse; fileId?: string };
let B: BCourse = emptyCourse();
let fileId: string | undefined;

const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ c: B, fileId } satisfies Draft)); } catch { /* */ } };
const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch { /* */ } };
const loadDraft = (): Draft | null => { try { return JSON.parse(localStorage.getItem(DRAFT) ?? "null"); } catch { return null; } };

/** Открыть конструктор: новый курс, свой курс для правки (fileId) или копия встроенного. */
export function openBuilder(c?: BCourse, id?: string) {
  const d = loadDraft();
  if (!c && d && (d.c.lessons.length > 1 || d.c.lessons.some((l) => l.words || l.sents || l.dialogs.length))) {
    openSheet("Конструктор курса", `<div class="stack"><p>Есть несохранённый черновик «${esc(d.c.title)}» (${d.c.lessons.length} ${plural(d.c.lessons.length, "урок", "урока", "уроков")}).</p>
      <button class="btn primary wide" id="cb-cont">Продолжить черновик</button><button class="btn wide" id="cb-new">Начать новый курс</button></div>`, (root) => {
      root.querySelector("#cb-cont")!.addEventListener("click", () => { B = d.c; fileId = d.fileId; main(); });
      root.querySelector("#cb-new")!.addEventListener("click", () => { B = emptyCourse(); fileId = undefined; saveDraft(); main(); });
    });
    return;
  }
  B = c ? structuredClone(c) : emptyCourse();
  if (!B.lessons.length) B.lessons.push(emptyLesson(1));
  fileId = id;
  saveDraft();
  main();
}

/* ---------- путь к полю: «title», «lessons.0.dialogs.1.q.0.o.2» ---------- */
function setPath(obj: unknown, path: string, v: unknown) {
  const k = path.split(".");
  let o = obj as Record<string, unknown>;
  for (const p of k.slice(0, -1)) o = o[p] as Record<string, unknown>;
  o[k[k.length - 1]] = v;
}

/** Перерисовать панель, не прыгая наверх и без всплывающей клавиатуры. */
function redraw(f: () => void) {
  const y = $("sheet").scrollTop;
  f();
  (document.activeElement as HTMLElement | null)?.blur();
  $("sheet").scrollTop = y;
}

const sum = (l: BLesson) => {
  const w = wordRows(l.words).length, s = l.sents.split("\n").filter((x) => x.trim()).length;
  const parts = [w && `${w} ${plural(w, "слово", "слова", "слов")}`, s && `${s} ${plural(s, "предложение", "предложения", "предложений")}`,
    l.dialogs.length && `${l.dialogs.length} ${plural(l.dialogs.length, "диалог", "диалога", "диалогов")}`, l.rules.length && `${l.rules.length} ${plural(l.rules.length, "правило", "правила", "правил")}`].filter(Boolean);
  return parts.join(" · ") || "пока пусто";
};

/* ---------- курс: название и уроки ---------- */

function main() {
  openSheet(fileId ? "Изменить курс" : "Новый курс", `<div class="stack cb">
      <label class="field"><span class="label">Название курса</span><input data-k="title" value="${esc(B.title)}" autocomplete="off"></label>
      <div class="row cb-row2">
        <label class="field"><span class="label">Уровень</span><select data-k="level" data-num>${[0, 1, 2, 3, 4, 5, 6].map((l) => `<option value="${l}" ${l === B.level ? "selected" : ""}>${l ? `HSK ${l}` : "Без уровня"}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span class="label">Описание (необязательно)</span><input data-k="about" value="${esc(B.about)}" autocomplete="off" placeholder="Например: уроки 1–10 учебника"></label>
      <h3 class="grp-title"><span>Уроки</span><span class="grp-n">${B.lessons.length}</span></h3>
      <div class="lesson-list">${B.lessons.map((l, i) => `<button class="lesson-row" data-les="${i}"><span class="ln">${i + 1}</span><span class="lt"><b>${esc(l.title || `Урок ${i + 1}`)}</b><small>${l.section ? `${esc(l.section)} · ` : ""}${sum(l)}</small></span></button>`).join("")}</div>
      <button class="btn wide" id="cb-add">+ Добавить урок</button>
      <p class="note" id="cb-msg" hidden></p>
      <button class="btn primary wide" id="cb-save">${fileId ? "Сохранить изменения" : "Сохранить курс"}</button>
      <details class="paste"><summary>Текст курса (для файла или ИИ)</summary><textarea id="cb-text" rows="10" readonly></textarea><button class="btn small" id="cb-copy">Скопировать</button></details>
      <button class="btn ghost wide" id="cb-close">Закрыть (черновик сохранится)</button>
    </div>`, (root) => {
    bind(root, () => {});
    root.querySelector("details")!.addEventListener("toggle", () => { root.querySelector<HTMLTextAreaElement>("#cb-text")!.value = courseToText(B); });
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      const le = t.closest<HTMLElement>("[data-les]");
      if (le) { lesson(Number(le.dataset.les)); return; }
      if (t.closest("#cb-add")) { B.lessons.push(emptyLesson(B.lessons.length + 1)); saveDraft(); lesson(B.lessons.length - 1); return; }
      if (t.closest("#cb-copy")) { const ta = root.querySelector<HTMLTextAreaElement>("#cb-text")!; try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); } return; }
      if (t.closest("#cb-close")) { closeSheet(); return; }
      if (t.closest("#cb-save")) await save(root);
    });
    (document.activeElement as HTMLElement | null)?.blur();
  });
}

/** Сохранить: подставить пиньинь и значения словам, предупредить о том, чего не хватает, записать курс. */
async function save(root: HTMLElement, force = false) {
  const msg = root.querySelector<HTMLElement>("#cb-msg")!;
  await fillWords();
  const missing = B.lessons.flatMap((l) => wordRows(l.words).filter(([, py, ru]) => !py || !ru).map(([h]) => h));
  const empty = B.lessons.filter((l) => !l.words.trim() && !l.sents.trim() && !l.dialogs.length && !l.rules.length).length;
  if (!force && (missing.length || empty)) {
    msg.hidden = false;
    msg.innerHTML = `${missing.length ? `Нет пиньиня или значения у ${missing.length} ${plural(missing.length, "слова", "слов", "слов")}: ${esc(missing.slice(0, 12).join(", "))}${missing.length > 12 ? "…" : ""} — допишите в уроке «слово | пиньинь | значение». ` : ""}${empty ? `Пустых уроков: ${empty} — они не сохранятся. ` : ""}<button class="link-btn" id="cb-force">Сохранить как есть</button>`;
    msg.querySelector("#cb-force")!.addEventListener("click", () => void save(root, true));
    return;
  }
  const text = courseToText(B);
  const title = B.title.trim() || "Мой курс";
  if (fileId) await updateOwnCourse(fileId, text, title); else fileId = await addOwnCourse(text, title);
  dropDraft();
}

/** Слова без пиньиня и значения — из HSK, потом из словаря. */
async function fillWords() {
  let lex: Awaited<ReturnType<typeof lexicon>> | null = null;
  try { lex = await lexicon(); } catch { return; }
  for (const l of B.lessons) {
    const rows = wordRows(l.words);
    if (!rows.some(([, py, ru]) => !py || !ru)) continue;
    l.words = rows.map(([h, py, ru]) => {
      const inf = !py || !ru ? lex!.info(h) : null;
      const p = py || inf?.py || "", r = ru || inf?.ru || "";
      return p || r ? `${h} | ${p} | ${r}` : h;
    }).join("\n");
  }
  saveDraft();
}

/* ---------- урок ---------- */

function lesson(i: number) {
  const l = B.lessons[i];
  if (!l) { main(); return; }
  const P = `lessons.${i}`;
  const secs = [...new Set(B.lessons.map((x) => x.section).filter(Boolean))];
  const opt = (path: string, o: string[], a: number, n: number) => o.concat(Array(Math.max(0, n - o.length)).fill("")).map((v, k) =>
    `<label class="cb-opt"><input type="radio" name="${path}.a" data-k="${path}.a" data-num value="${k}" ${k === a ? "checked" : ""} aria-label="Верный ответ ${k + 1}"><input data-k="${path}.o.${k}" value="${esc(v)}" placeholder="вариант ${k + 1}"></label>`).join("");
  openSheet(`Урок ${i + 1}`, `<div class="stack cb">
      <button class="btn ghost small cb-back" data-back>← Все уроки</button>
      <label class="field"><span class="label">Название урока</span><input data-k="${P}.title" value="${esc(l.title)}" autocomplete="off"></label>
      <label class="field"><span class="label">Раздел (необязательно — объединяет уроки в тему)</span><input data-k="${P}.section" value="${esc(l.section)}" list="cb-secs" autocomplete="off"><datalist id="cb-secs">${secs.map((s) => `<option value="${esc(s)}">`).join("")}</datalist></label>
      <label class="field"><span class="label">Цель урока (необязательно)</span><input data-k="${P}.goal" value="${esc(l.goal)}" autocomplete="off" placeholder="Например: научиться знакомиться"></label>

      <h3 class="cb-h">Слова урока</h3>
      <p class="hint">Просто иероглифы — по одному в строке или через пробел. Пиньинь и значение подставятся сами; свои можно дописать так: <span class="han">学习 | xue2 xi2 | учиться</span>.</p>
      <div class="field"><textarea data-k="${P}.words" rows="4" placeholder="你好 名字 学生">${esc(l.words)}</textarea></div>
      <button class="btn small" data-fill>Подставить пиньинь и значения</button>

      <h3 class="cb-h">Предложения</h3>
      <p class="hint">По одному в строке. Перевод — после «|» (необязательно): <span class="han">你好！ | Привет!</span></p>
      <div class="field"><textarea data-k="${P}.sents" rows="5" placeholder="你好！ | Привет!">${esc(l.sents)}</textarea></div>

      <h3 class="cb-h">Диалоги</h3>
      ${l.dialogs.map((d, k) => `<div class="panel stack cb-box">
        <div class="row"><input class="cb-in" data-k="${P}.dialogs.${k}.title" value="${esc(d.title)}" placeholder="Название диалога"><button class="btn small danger" data-del="dialogs.${k}">Удалить</button></div>
        <p class="hint">Реплики по строке: <span class="han">A: 你好！ | Привет!</span> (без «A:» — по очереди A и B).</p>
        <div class="field"><textarea data-k="${P}.dialogs.${k}.lines" rows="4">${esc(d.lines)}</textarea></div>
        ${d.q.map((q, m) => `<div class="cb-q"><div class="row"><input class="cb-in" data-k="${P}.dialogs.${k}.q.${m}.q" value="${esc(q.q)}" placeholder="Вопрос по диалогу"><button class="icon-btn small-ic" data-del="dialogs.${k}.q.${m}" aria-label="Удалить вопрос">✕</button></div>
          <p class="hint">Отметьте кружком верный вариант:</p>${opt(`${P}.dialogs.${k}.q.${m}`, q.o, q.a, 3)}</div>`).join("")}
        <button class="btn small" data-addq="${k}">+ Вопрос</button>
      </div>`).join("")}
      <button class="btn small" data-add="dialog">+ Диалог</button>

      <h3 class="cb-h">Грамматика (необязательно)</h3>
      ${l.rules.map((r, k) => `<div class="panel stack cb-box">
        <div class="row"><input class="cb-in" data-k="${P}.rules.${k}.title" value="${esc(r.title)}" placeholder="Правило, например: 是 — «являться»"><button class="btn small danger" data-del="rules.${k}">Удалить</button></div>
        <div class="field"><span class="label">Объяснение</span><textarea data-k="${P}.rules.${k}.text" rows="3">${esc(r.text)}</textarea></div>
        <div class="field"><span class="label">Примеры: китайский | перевод</span><textarea data-k="${P}.rules.${k}.ex" rows="3">${esc(r.ex)}</textarea></div>
        <div class="field"><span class="label">Таблица, ошибки, заметки (необязательно)</span><textarea data-k="${P}.rules.${k}.extra" rows="3" placeholder="| форма | значение | пример&#10;| 是 | быть | 我是学生&#10;! Частая ошибка: 我是高兴 — нет, 我很高兴&#10;> Заметка: 是 не нужен перед прилагательным">${esc(r.extra ?? "")}</textarea></div>
        ${r.x.map((x, m) => `<div class="cb-q"><div class="row"><input class="cb-in han" data-k="${P}.rules.${k}.x.${m}.zh" value="${esc(x.zh)}" placeholder="我___学生。 (___ — пропуск)"><button class="icon-btn small-ic" data-del="rules.${k}.x.${m}" aria-label="Удалить задание">✕</button></div>
          <input class="cb-in" data-k="${P}.rules.${k}.x.${m}.ru" value="${esc(x.ru)}" placeholder="Перевод">
          <p class="hint">Варианты, кружок — верный:</p>${opt(`${P}.rules.${k}.x.${m}`, x.o, x.a, 3)}</div>`).join("")}
        <button class="btn small" data-addx="${k}">+ Задание «вставь слово»</button>
      </div>`).join("")}
      <button class="btn small" data-add="rule">+ Правило</button>

      <div class="row wrap cb-move"><button class="btn small" data-move="-1" ${i ? "" : "disabled"}>↑ Выше</button><button class="btn small" data-move="1" ${i < B.lessons.length - 1 ? "" : "disabled"}>↓ Ниже</button><button class="btn small danger" data-dellesson>Удалить урок</button></div>
      <div class="confirm" id="cb-confirm" hidden></div>
      <button class="btn primary wide" data-back>Готово</button>
    </div>`, (root) => {
    bind(root, () => {});
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-back]")) { main(); return; }
      if (t.closest("[data-fill]")) { await fillWords(); redraw(() => lesson(i)); return; }
      const add = t.closest<HTMLElement>("[data-add]");
      if (add) { if (add.dataset.add === "dialog") l.dialogs.push({ title: "", lines: "", q: [] }); else l.rules.push({ title: "", text: "", ex: "", x: [], extra: "" }); saveDraft(); redraw(() => lesson(i)); return; }
      const aq = t.closest<HTMLElement>("[data-addq]");
      if (aq) { l.dialogs[Number(aq.dataset.addq)].q.push({ q: "", o: ["", "", ""], a: 0 }); saveDraft(); redraw(() => lesson(i)); return; }
      const ax = t.closest<HTMLElement>("[data-addx]");
      if (ax) { l.rules[Number(ax.dataset.addx)].x.push({ zh: "", ru: "", o: ["", "", ""], a: 0 }); saveDraft(); redraw(() => lesson(i)); return; }
      const del = t.closest<HTMLElement>("[data-del]");
      if (del) {
        const k = del.dataset.del!.split(".");
        let arr = l as unknown as Record<string, unknown>;
        for (const p of k.slice(0, -2)) arr = arr[p] as Record<string, unknown>;
        (arr[k[k.length - 2]] as unknown[]).splice(Number(k[k.length - 1]), 1);
        saveDraft(); redraw(() => lesson(i)); return;
      }
      const mv = t.closest<HTMLElement>("[data-move]");
      if (mv) { const j = i + Number(mv.dataset.move); [B.lessons[i], B.lessons[j]] = [B.lessons[j], B.lessons[i]]; saveDraft(); redraw(() => lesson(j)); return; }
      if (t.closest("[data-dellesson]")) {
        confirmInline(root.querySelector<HTMLElement>("#cb-confirm")!, `Удалить урок «${l.title}»?`, "Удалить", () => { B.lessons.splice(i, 1); if (!B.lessons.length) B.lessons.push(emptyLesson(1)); saveDraft(); main(); });
      }
    });
    (document.activeElement as HTMLElement | null)?.blur();
  });
}

/** Поля с data-k пишут прямо в модель курса и в черновик. */
function bind(root: HTMLElement, after: () => void) {
  const on = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.k;
    if (!k) return;
    if (t.type === "radio" && !t.checked) return;
    setPath(B, k, t.dataset.num !== undefined ? Number(t.value) : t.value);
    saveDraft();
    after();
  };
  root.addEventListener("input", on);
  root.addEventListener("change", on);
}
