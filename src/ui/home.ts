/** Главная — список колод со счётчиками (как в Anki), обзор колоды, действия с колодой, импорт и экспорт. */
import { SKILLS, type Skill } from "../core/skills.ts";
import { app, counts, countsFor, deckById, visibleDecks, nextDueTime, words, switchDeck, newLimit, deckSkills, setDeckOpts, renameDeck, deleteDeck,
  saveUserDeck, hskLookup, dictIndex, type DeckInfo } from "../state.ts";
import { countChars } from "../core/deck.ts";
import { formatGap } from "../core/fsrs.ts";
import { parseImport, exportDeckText, fileName, type ImportRow } from "../core/importer.ts";
import { dictPyToNumeric } from "../core/dict.ts";
import { $, esc, plural, downloadText } from "./dom.ts";
import { onShow, show } from "./nav.ts";
import { startSession } from "./session.ts";
import { goalLine } from "./stats.ts";
import { openDeckEditor, userDeckById } from "./editor.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";

const DOTS = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`;
const n0 = (n: number, cls: string) => `<span class="${n ? cls : "c-zero"}">${n}</span>`;

/* ---------- список колод ---------- */

let listToken = 0;
export async function renderHome() {
  const my = ++listToken;
  $("goal-line").innerHTML = goalLine();
  const decks = visibleDecks();
  // сначала строки без чисел, потом числа по мере загрузки колод
  // заголовки групп (HSK, основа, жизнь в Китае, свои), как вложенные колоды в Anki
  let group = "";
  $("decks").innerHTML = decks.map((d) => {
    const g = d.group ?? "";
    const head = g && g !== group ? `<div class="dt-group">${esc(g)}</div>` : "";
    group = g;
    return head + rowHTML(d, null);
  }).join("");
  const hidden = app.decks.filter((d) => d.hidden && d.id !== app.deck?.id);
  $("decks-hidden").hidden = !hidden.length;
  $("decks-hidden").textContent = `Скрытые колоды: ${hidden.length}`;
  let due = 0, fresh = 0;
  for (const d of decks) {
    try {
      const c = countsFor(await deckById(d.id));
      if (my !== listToken) return;
      due += c.due + c.learning; fresh += c.newLeft;
      const row = document.querySelector<HTMLElement>(`#decks [data-id="${CSS.escape(d.id)}"]`);
      if (row) row.outerHTML = rowHTML(d, c);
    } catch { /* колода не загрузилась — строка без чисел */ }
  }
  if (my !== listToken) return;
  $("today-line").textContent = due + fresh
    ? `На сегодня: ${due} ${plural(due, "повторение", "повторения", "повторений")} и ${fresh} ${plural(fresh, "новое слово", "новых слова", "новых слов")}.`
    : "На сегодня всё повторено.";
}

function rowHTML(d: DeckInfo, c: { newLeft: number; learning: number; due: number } | null): string {
  const nums = c ? `${n0(c.newLeft, "c-new")}${n0(c.learning, "c-learn")}${n0(c.due, "c-due")}` : `<span class="c-zero">·</span><span class="c-zero">·</span><span class="c-zero">·</span>`;
  return `<div class="dt-row${d.id === app.deck?.id ? " cur" : ""}" data-id="${esc(d.id)}">`
    + `<button class="dt-name" data-open="${esc(d.id)}"><b>${esc(d.title)}</b><small>${d.count} ${plural(d.count, "слово", "слова", "слов")}${d.user ? " · своя" : ""}</small></button>`
    + nums + `<button class="dt-menu" data-menu="${esc(d.id)}" aria-label="Действия с колодой ${esc(d.title)}">${DOTS}</button></div>`;
}

/* ---------- обзор колоды ---------- */

export function renderDeck() {
  const d = app.deck;
  if (!d) return;
  $("deck-title").textContent = d.title;
  const n = d.words.length, ch = countChars(d);
  $("deck-sub").textContent = `${n} ${plural(n, "слово", "слова", "слов")} · ${ch} ${plural(ch, "иероглиф", "иероглифа", "иероглифов")} · новых в день: ${newLimit(d.id)}`;
  const c = counts();
  $("st-new").textContent = String(c.newLeft);
  $("st-learn").textContent = String(c.learning);
  $("st-due").textContent = String(c.due);
  const start = $<HTMLButtonElement>("start");
  start.disabled = c.total === 0;
  start.textContent = c.total ? "Учить" : "На сейчас всё";
  let hint = "";
  if (!c.total) {
    const t = nextDueTime();
    hint = t ? `Следующая карточка через ${formatGap(t - Date.now())}.` : c.unseen ? "Новые слова на сегодня закончились — лимит меняется в меню колоды (⋯)." : "Все слова колоды уже в повторении.";
  } else if (c.unseen === words().length) {
    hint = `Первое занятие: ${c.newLeft} ${plural(c.newLeft, "новое слово", "новых слова", "новых слов")}, около 10 минут.`;
  }
  $("next-hint").textContent = hint;
}

async function openDeck(id: string) {
  if (id !== app.deck?.id) await switchDeck(id);
  show("deck");
}

/* ---------- меню колоды ---------- */

function openDeckMenu(id: string) {
  const d = app.decks.find((x) => x.id === id);
  if (!d) return;
  const limit = newLimit(id);
  const body = `
    <label class="field"><span class="label">Название</span><input id="dm-title" value="${esc(d.title)}" autocomplete="off"></label>
    <div class="set-row dm-row"><div class="t"><div>Новых слов в день</div><div>Для этой колоды</div></div>
      <div class="stepper"><button class="icon-btn" id="dm-minus" aria-label="Меньше">−</button><output id="dm-new">${limit}</output><button class="icon-btn" id="dm-plus" aria-label="Больше">+</button></div></div>
    <div class="field"><span class="label">Что тренировать</span>
      <div class="chips-row wrap" id="dm-skills">${SKILLS.map((k) => `<button class="chip-btn" data-skill="${k.id}" aria-pressed="${deckSkills(id).includes(k.id)}" title="${esc(k.hint)}">${k.name}</button>`).join("")}</div>
      <small class="hint" id="dm-skill-hint">У каждого навыка свой интервал повторения, как в Skritter.</small></div>
    <div class="dm-list">
      ${d.user ? `<button class="deck-opt" id="dm-edit"><span>Изменить слова<small>Добавить или убрать слова</small></span></button>` : ""}
      <button class="deck-opt" id="dm-words"><span>Слова колоды<small>Список, поиск, статус</small></span></button>
      <button class="deck-opt" id="dm-export"><span>Экспорт в файл<small>Текст для Anki, Pleco или таблицы</small></span></button>
      <button class="deck-opt danger" id="dm-del"><span>${d.user ? "Удалить колоду" : "Скрыть колоду"}<small>${d.user ? "Прогресс по словам сохранится" : "Вернуть можно внизу списка колод"}</small></span></button>
    </div>
    <div class="confirm" id="dm-confirm" hidden></div>
    <button class="btn primary wide" id="dm-save">Готово</button>`;
  let nNew = limit;
  let skills: Skill[] = deckSkills(id);
  openSheet(d.title, body, (root) => {
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(`#${s}`)!;
    q("dm-skills").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-skill]");
      if (!b) return;
      const k = b.dataset.skill as Skill;
      const next = skills.includes(k) ? skills.filter((x) => x !== k) : [...skills, k];
      if (!next.length) { q("dm-skill-hint").textContent = "Нужен хотя бы один навык."; return; }
      skills = SKILLS.map((x) => x.id).filter((x) => next.includes(x));
      b.setAttribute("aria-pressed", String(skills.includes(k)));
    });
    const step = (k: number) => { nNew = Math.max(0, Math.min(200, nNew + k)); q("dm-new").textContent = String(nNew); };
    q("dm-minus").addEventListener("click", () => step(nNew > 20 ? -5 : -1));
    q("dm-plus").addEventListener("click", () => step(nNew >= 20 ? 5 : 1));
    const save = async () => {
      const t = q<HTMLInputElement>("dm-title").value.trim();
      if (t && t !== d.title) await renameDeck(id, t);
      if (nNew !== limit) await setDeckOpts(id, { newPerDay: nNew });
      if (skills.join() !== deckSkills(id).join()) await setDeckOpts(id, { skills });
    };
    q("dm-save").addEventListener("click", async () => { await save(); closeSheet(); refresh(); });
    root.querySelector("#dm-edit")?.addEventListener("click", async () => {
      await save();
      openDeckEditor(userDeckById(id), () => refresh());
    });
    q("dm-words").addEventListener("click", async () => { await save(); closeSheet(); await switchDeck(id); show("words"); });
    q("dm-export").addEventListener("click", async () => {
      const deck = await deckById(id);
      const rows = deck.words.map((w): [string, string, string] => [w.han, w.py, w.ru]);
      downloadText(fileName(deck.title, "txt"), exportDeckText(deck.title, rows));
      q("dm-export").querySelector("small")!.textContent = `Сохранено: ${rows.length} ${plural(rows.length, "слово", "слова", "слов")}`;
    });
    q("dm-del").addEventListener("click", () => confirmInline(q("dm-confirm"),
      d.user ? `Удалить «${d.title}»? Прогресс по словам сохранится.` : `Скрыть «${d.title}» из списка?`, d.user ? "Удалить" : "Скрыть",
      async () => { await deleteDeck(id); closeSheet(); show("home"); }));
  });
}

function refresh() {
  if (!$("deck").hidden) renderDeck(); else renderHome();
}

function openHiddenDecks() {
  const list = app.decks.filter((d) => d.hidden);
  openSheet("Скрытые колоды", `<div class="deck-list">${list.map((d) => `<button class="deck-opt" data-show="${esc(d.id)}"><span>${esc(d.title)}<small>${d.count} ${plural(d.count, "слово", "слова", "слов")}</small></span><span class="pick-btn">+</span></button>`).join("")}</div>`, (root) => {
    root.addEventListener("click", async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-show]");
      if (!b) return;
      await setDeckOpts(b.dataset.show!, { hidden: false });
      b.remove();
      if (!root.querySelector("[data-show]")) closeSheet();
      renderHome();
    });
  });
}

/* ---------- импорт ---------- */

async function importFile(file: File) {
  const text = await file.text();
  const res = parseImport(text, file.name);
  // недостающее: HSK, затем словарь
  const hsk = await hskLookup();
  let dict: Awaited<ReturnType<typeof dictIndex>> | null = null;
  if (res.rows.some((r) => !r.py || !r.ru)) { try { dict = await dictIndex(); } catch { /* офлайн */ } }
  const filled: ImportRow[] = res.rows.map((r) => {
    if (r.py && r.ru) return r;
    const h = hsk(r.han);
    if (h) return { han: r.han, py: r.py ?? h.py, ru: r.ru || h.ru };
    const i = dict ? dict.han.indexOf(r.han) : -1;
    if (i >= 0) return { han: r.han, py: r.py ?? dictPyToNumeric(dict!.py[i], r.han), ru: r.ru || dict!.ru[i] };
    return r;
  });
  const ok = filled.filter((r): r is ImportRow & { py: string } => !!r.py && !!r.ru);
  const bad = filled.filter((r) => !r.py || !r.ru).map((r) => r.han);
  const skipped = [...res.skipped, ...bad];
  const body = `
    <p class="hint">Формат: ${esc(res.format)}. Найдено слов: <b>${ok.length}</b>${skipped.length ? `, пропущено: ${skipped.length}` : ""}.</p>
    <label class="field"><span class="label">Название колоды</span><input id="im-title" value="${esc(res.title)}" autocomplete="off"></label>
    <div class="pick-list">${ok.slice(0, 8).map((r) => `<div class="pick"><span class="h">${esc(r.han)}</span><span class="t"><span class="ru">${esc(r.ru)}</span></span></div>`).join("")}</div>
    ${ok.length > 8 ? `<p class="hint">…и ещё ${ok.length - 8}</p>` : ""}
    ${skipped.length ? `<details class="paste"><summary>Пропущено: ${skipped.length}</summary><p class="hint">${esc(skipped.slice(0, 60).join(", "))}${skipped.length > 60 ? "…" : ""}</p><p class="hint">Нет иероглифов, пиньиня или значения — их не нашлось ни в HSK, ни в словаре. Слова можно добавить вручную в редакторе колоды.</p></details>` : ""}
    <button class="btn primary wide" id="im-go" ${ok.length ? "" : "disabled"}>Создать колоду</button>`;
  openSheet("Импорт", body, (root) => {
    root.querySelector("#im-go")!.addEventListener("click", async () => {
      const title = root.querySelector<HTMLInputElement>("#im-title")!.value.trim() || res.title;
      const id = `u-${Date.now().toString(36)}`;
      await saveUserDeck({ id, title, words: ok.map((r) => [r.han, r.py, r.ru]), createdAt: Date.now() });
      closeSheet();
      renderHome();
    });
  });
}

/* ---------- обработчики ---------- */

export function initHome() {
  onShow("home", renderHome);
  onShow("deck", renderDeck);
  $("start").addEventListener("click", startSession);
  $("decks").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const m = t.closest<HTMLButtonElement>("[data-menu]");
    if (m) { openDeckMenu(m.dataset.menu!); return; }
    const o = t.closest<HTMLElement>("[data-id]");
    if (o) openDeck(o.dataset.id!);
  });
  $("deck-back").addEventListener("click", () => show("home"));
  $("deck-menu").addEventListener("click", () => app.deck && openDeckMenu(app.deck.id));
  $("deck-words").addEventListener("click", () => show("words"));
  $("deck-create").addEventListener("click", () => openDeckEditor(undefined, () => renderHome()));
  $("deck-import").addEventListener("click", () => $<HTMLInputElement>("deck-import-file").click());
  $<HTMLInputElement>("deck-import-file").addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = "";
    if (f) importFile(f).catch(() => openSheet("Импорт", `<p class="note danger">Не получилось прочитать файл. Нужен текстовый файл: .txt, .tsv или .csv.</p>`));
  });
  $("decks-hidden").addEventListener("click", openHiddenDecks);
}
