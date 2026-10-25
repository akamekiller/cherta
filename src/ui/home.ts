/** Главная — список колод со счётчиками (как в Anki), обзор колоды, действия с колодой, импорт и экспорт. */
import { appLang } from "../state.ts";
import { useBookDeck } from "./book.ts";
import { useTonesDeck } from "./tones.ts";
import { SKILLS, type Skill } from "../core/skills.ts";
import { app, counts, countsFor, deckById, visibleDecks, nextDueTime, switchDeck, newLimit, deckSkills, setDeckOpts, renameDeck, deleteDeck, deleteDecks, deckBlocks, wordStarted, wordKnown, setFocus,
  deckOrder, addBuiltinDecks, removeBuiltinDeck, isAdded, refreshCharDeck, updateSettings, removeUserDeck, CHAR_DECK, type DeckInfo } from "../state.ts";
import { countChars } from "../core/deck.ts";
import { formatGap } from "../core/fsrs.ts";
import { exportDeckText, fileName } from "../core/importer.ts";
import { openImport } from "./import.ts";
import { $, esc, plural, downloadText, pinyinHTML } from "./dom.ts";
import { currentBlock, blockStat, type Block } from "../core/blocks.ts";
import { say, sayAll } from "../speech.ts";
import { onShow, show } from "./nav.ts";
import { startSession } from "./session.ts";
import { openDeckWords } from "./words.ts";
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
  // колода иероглифов пополняется сама, когда начаты новые слова
  if (app.settings.charDeck) refreshCharDeck().then((n) => { if (n && my === listToken) renderHome(); });
  const decks = visibleDecks();
  // сначала строки без чисел, потом числа по мере загрузки колод
  // заголовки групп (HSK, основа, жизнь в Китае, свои), как вложенные колоды в Anki
  let group = "";
  const fold = folded();
  $("decks").innerHTML = decks.map((d) => {
    const g = d.group ?? "";
    const n = decks.filter((x) => (x.group ?? "") === g).length;
    const head = g && g !== group
      ? `<div class="dt-ghead"><button class="dt-group" data-fold="${esc(g)}" aria-expanded="${!fold.has(g)}"><span>${esc(g)}</span><small>${fold.has(g) ? `${n} ${plural(n, "колода", "колоды", "колод")}` : ""}</small><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><button class="dt-gmenu" data-gmenu="${esc(g)}" aria-label="Действия с группой">${DOTS}</button></div>`
      : "";
    group = g;
    return head + rowHTML(d, null).replace("<div ", `<div ${g && fold.has(g) ? "hidden " : ""}`);
  }).join("");
  const empty = !decks.length;
  $("home-empty").hidden = !empty;
  $("decks-table").hidden = empty;
  $("goal-line").hidden = empty;
  $("deck-catalog").hidden = empty;
  let due = 0, fresh = 0;
  for (const d of decks) {
    try {
      const c = countsFor(await deckById(d.id));
      if (my !== listToken) return;
      due += c.due + c.learning; fresh += c.newLeft;
      const row = document.querySelector<HTMLElement>(`#decks [data-id="${CSS.escape(d.id)}"]`);
      if (row) { const h = row.hidden; row.outerHTML = rowHTML(d, c); if (h) document.querySelector<HTMLElement>(`#decks [data-id="${CSS.escape(d.id)}"]`)!.hidden = true; }
    } catch { /* колода не загрузилась — строка без чисел */ }
  }
  if (my !== listToken) return;
  $("today-line").textContent = empty ? "" : due + fresh
    ? `На сегодня: ${due} ${plural(due, "повторение", "повторения", "повторений")} и ${fresh} ${plural(fresh, "новое слово", "новых слова", "новых слов")}.`
    : "На сегодня всё повторено.";
}

/** Свёрнутые группы колод (хранятся только на этом устройстве). */
const FOLD_KEY = "cherta.fold";
function folded(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || "[]")); } catch { return new Set(); }
}
/** Свернуть/развернуть группу на месте — без перерисовки всего экрана (иначе экран прыгает). */
function toggleFold(g: string, head: HTMLElement) {
  const f = folded();
  const hide = !f.has(g);
  if (hide) f.add(g); else f.delete(g);
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...f])); } catch { /* приватный режим */ }
  const list = visibleDecks().filter((d) => (d.group ?? "") === g);
  for (const d of list) {
    const row = document.querySelector<HTMLElement>(`#decks [data-id="${CSS.escape(d.id)}"]`);
    if (row) row.hidden = hide;
  }
  head.setAttribute("aria-expanded", String(!hide));
  head.querySelector("small")!.textContent = hide ? `${list.length} ${plural(list.length, "колода", "колоды", "колод")}` : "";
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
  $("deck-sub").textContent = `${n} ${plural(n, "слово", "слова", "слов")} · ${ch} ${d.lang === "ja" ? plural(ch, "знак", "знака", "знаков") : plural(ch, "иероглиф", "иероглифа", "иероглифов")} · новых в день: ${newLimit(d.id)}`;
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
  }
  $("next-hint").textContent = hint;
  renderSkills();
  renderBlocks();
}

/** Пояснение к выбранным навыкам: что будет в занятии. */
export function skillsHint(sk: Skill[]): string {
  if (sk.length === 1) return SKILLS.find((x) => x.id === sk[0])!.hint[0].toUpperCase() + SKILLS.find((x) => x.id === sk[0])!.hint.slice(1) + ".";
  if (!sk.includes("write") && sk.includes("recall")) return "Без прописи: вспоминаете слово и сами оцениваете ответ, как в Anki.";
  return "Каждое слово по очереди тренируется всеми выбранными способами, у каждого свой интервал.";
}

/** Навыки, которые есть у колоды: у японской нет тонов. */
const skillsFor = (id: string) => SKILLS.filter((k) => k.id !== "tone" || app.decks.find((d) => d.id === id)?.lang !== "ja");

/** «Как учить» на экране колоды: навыки включаются и выключаются сразу, хотя бы один остаётся. */
function renderSkills() {
  const d = app.deck;
  if (!d) return;
  const sk = deckSkills(d.id);
  $("deck-skills").innerHTML = skillsFor(d.id).map((k) => `<button class="chip-btn" data-skill="${k.id}" aria-pressed="${sk.includes(k.id)}" title="${esc(k.hint)}">${k.name}</button>`).join("");
  $("deck-skill-hint").textContent = skillsHint(sk);
}

/* ---------- уроки по словам ---------- */

const DFOLD = "cherta.dfold";
const dfolds = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(DFOLD) ?? "{}"); } catch { return {}; } };
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

/** Список уроков колоды: темы (или по 20 слов), разделы сворачиваются, открыт раздел текущего урока. */
function renderBlocks() {
  const d = app.deck;
  const box = $("deck-blocks");
  if (!d) { box.innerHTML = ""; return; }
  const blocks = deckBlocks(d);
  if (blocks.length < 2) { box.innerHTML = ""; return; }
  const started = (i: number) => wordStarted(d.words[i]);
  const known = (i: number) => wordKnown(d.words[i]);
  const cur = currentBlock(blocks, started);
  if (cur >= 0) {
    const b = blocks[cur], st = blockStat(b, started, known);
    $("next-hint").textContent = ($("next-hint").textContent ? $("next-hint").textContent + " " : "") + `Новые слова — из урока ${cur + 1} «${b.title}» (начато ${st.started} из ${st.total}).`;
  }
  const row = (b: Block, i: number) => {
    const s0 = blockStat(b, started, known);
    const fin = s0.known === s0.total;
    const cls = fin ? "done" : i === cur ? "cur" : "";
    const pct = Math.round((100 * s0.known) / s0.total);
    return `<button class="lesson-row ${cls}" data-block="${i}"><span class="ln">${fin ? "✓" : i + 1}</span>
      <span class="lt"><b>${esc(b.title)}</b><small class="blk-prev">${esc(b.idx.slice(0, 8).map((k) => d.words[k].han).join(" "))}${b.idx.length > 8 ? " …" : ""}</small>
      <small>${s0.total} ${plural(s0.total, "слово", "слова", "слов")} · выучено ${s0.known}${s0.started > s0.known ? ` · учу ${s0.started - s0.known}` : ""}</small>
      <span class="cc-bar"><i style="width:${pct}%"></i></span></span></button>`;
  };
  const secs: { name: string; idx: number[] }[] = [];
  blocks.forEach((b, i) => {
    if (!secs.length || secs[secs.length - 1].name !== b.section) secs.push({ name: b.section, idx: [] });
    secs[secs.length - 1].idx.push(i);
  });
  const f = dfolds();
  box.innerHTML = `<h3 class="grp-title"><span>Уроки по словам</span><span class="grp-n">${blocks.length}</span></h3>`
    + secs.map((sec) => {
      const fin = sec.idx.filter((i) => blockStat(blocks[i], started, known).known === blocks[i].idx.length).length;
      const key = `${d.id}|${sec.name}`;
      const open = f[key] ?? (secs.length === 1 || sec.idx.includes(cur) || (cur < 0 && sec === secs[0]));
      return (sec.name ? `<button class="fold-head" data-dfold="${esc(key)}" aria-expanded="${open}"><span>${esc(sec.name)}</span><small>${fin}/${sec.idx.length}</small>${CHEV}</button>` : "")
        + `<div class="lesson-list" ${open || !sec.name ? "" : "hidden"}>${sec.idx.map((i) => row(blocks[i], i)).join("")}</div>`;
    }).join("");
}

/** Урок по словам: слова с пиньинем и значением, прослушивание, «Учить этот урок». */
function openBlock(i: number) {
  const d = app.deck;
  if (!d) return;
  const b = deckBlocks(d)[i];
  if (!b) return;
  const ws = b.idx.map((k) => d.words[k]);
  const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
  const mark = (k: number) => (wordKnown(d.words[k]) ? `<span class="bw-st ok" title="выучено">✓</span>` : wordStarted(d.words[k]) ? `<span class="bw-st mid" title="учу">•</span>` : `<span class="bw-st"></span>`);
  openSheet(`Урок ${i + 1}. ${b.title}`, `<div class="stack">
      <div class="row"><button class="btn small" id="bl-all">▶ Все слова</button><span class="hint">${ws.length} ${plural(ws.length, "слово", "слова", "слов")}</span></div>
      <div class="blk-words">${b.idx.map((k) => { const w = d.words[k]; return `<div class="bw">${mark(k)}<b class="bw-han">${esc(w.han)}</b><span class="bw-t"><span class="py">${w.ref.length ? pinyinHTML(w.ref) : esc(w.py)}</span><small>${esc(w.ru)}</small></span><button class="icon-btn small-ic" data-say="${esc(w.han)}" aria-label="Послушать">${PLAY}</button></div>`; }).join("")}</div>
      <button class="btn primary wide" id="bl-learn">Учить этот урок</button>
      <button class="btn wide" id="bl-book">Писать в тетради прописей</button>
      <p class="hint center">Карточки только из слов этого урока: новые и повторение.</p>
    </div>`, (root) => {
    root.querySelector("#bl-all")!.addEventListener("click", () => sayAll(ws.map((w) => w.han), 0.85));
    root.addEventListener("click", (e) => {
      const sb = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-say]");
      if (sb) say(sb.dataset.say!);
    });
    root.querySelector("#bl-book")!.addEventListener("click", () => { closeSheet(); useBookDeck(d.id, i); show("book"); });
    root.querySelector("#bl-learn")!.addEventListener("click", () => {
      closeSheet();
      setFocus(d.id, b.idx);
      startSession();
    });
  });
}

export async function openDeck(id: string) {
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
    <div class="field"><span class="label">Как учить</span>
      <div class="chips-row wrapped" id="dm-skills">${skillsFor(id).map((k) => `<button class="chip-btn" data-skill="${k.id}" aria-pressed="${deckSkills(id).includes(k.id)}" title="${esc(k.hint)}">${k.name}</button>`).join("")}</div>
      <small class="hint" id="dm-skill-hint">${esc(skillsHint(deckSkills(id)))}</small></div>
    <div class="field"><span class="label">Новые слова</span>
      <div class="seg wide-seg" role="group" id="dm-order"><button data-order="random" aria-pressed="${deckOrder(id) === "random"}">Вперемешку</button><button data-order="seq" aria-pressed="${deckOrder(id) === "seq"}">По порядку колоды</button></div></div>
    <div class="dm-list">
      ${d.user ? `<button class="deck-opt" id="dm-edit"><span>Изменить слова<small>Добавить или убрать слова</small></span></button>` : ""}
      <button class="deck-opt" id="dm-words"><span>Слова колоды<small>Список, поиск, статус</small></span></button>
      <button class="deck-opt" id="dm-book"><span>Писать в тетради прописей<small>Иероглифы этой колоды по клеткам</small></span></button>
      <button class="deck-opt" id="dm-tones"><span>Тренировать тоны<small>На слух и произношение по словам колоды</small></span></button>
      <button class="deck-opt" id="dm-export"><span>Экспорт в файл<small>Текст для Anki, Pleco или таблицы</small></span></button>
      <button class="deck-opt danger" id="dm-del"><span>${d.user ? "Удалить колоду" : "Убрать из списка"}<small>${d.user ? "Прогресс по словам сохранится" : "Прогресс сохранится, вернуть — «Готовые»"}</small></span></button>
    </div>
    <div class="confirm" id="dm-confirm" hidden></div>
    <button class="btn primary wide" id="dm-save">Готово</button>`;
  let nNew = limit;
  let skills: Skill[] = deckSkills(id);
  let order = deckOrder(id);
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
      q("dm-skill-hint").textContent = skillsHint(skills);
    });
    q("dm-order").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-order]");
      if (!b) return;
      order = b.dataset.order as "random" | "seq";
      q("dm-order").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
    const step = (k: number) => { nNew = Math.max(0, Math.min(200, nNew + k)); q("dm-new").textContent = String(nNew); };
    q("dm-minus").addEventListener("click", () => step(nNew > 20 ? -5 : -1));
    q("dm-plus").addEventListener("click", () => step(nNew >= 20 ? 5 : 1));
    const save = async () => {
      const t = q<HTMLInputElement>("dm-title").value.trim();
      if (t && t !== d.title) await renameDeck(id, t);
      if (nNew !== limit) await setDeckOpts(id, { newPerDay: nNew });
      if (skills.join() !== deckSkills(id).join()) await setDeckOpts(id, { skills });
      if (order !== deckOrder(id)) await setDeckOpts(id, { order });
    };
    q("dm-save").addEventListener("click", async () => { await save(); closeSheet(); refresh(); });
    root.querySelector("#dm-edit")?.addEventListener("click", async () => {
      await save();
      openDeckEditor(userDeckById(id), () => refresh());
    });
    q("dm-words").addEventListener("click", async () => { await save(); closeSheet(); await switchDeck(id); openDeckWords(); });
    q("dm-book").addEventListener("click", async () => { await save(); closeSheet(); useBookDeck(id); show("book"); });
    q("dm-tones").addEventListener("click", async () => { await save(); closeSheet(); useTonesDeck(id); show("tones"); });
    q("dm-export").addEventListener("click", async () => {
      const deck = await deckById(id);
      const rows = deck.words.map((w): [string, string, string] => [w.han, w.py, w.ru]);
      void downloadText(fileName(deck.title, "txt"), exportDeckText(deck.title, rows));
      q("dm-export").querySelector("small")!.textContent = `Сохранено: ${rows.length} ${plural(rows.length, "слово", "слова", "слов")}`;
    });
    q("dm-del").addEventListener("click", () => confirmInline(q("dm-confirm"),
      d.user ? `Удалить «${d.title}»? Прогресс по словам сохранится.` : `Убрать «${d.title}» из списка?`, d.user ? "Удалить" : "Убрать",
      async () => { await deleteDeck(id); closeSheet(); show("home"); }));
  });
}

function refresh() {
  if (!$("deck").hidden) renderDeck(); else renderHome();
}

/** Каталог готовых колод: тап — добавить в свой список или убрать. */
export function openCatalog(onDone?: () => void) {
  const groups = new Map<string, typeof app.builtinDecks>();
  for (const d of app.builtinDecks.filter((x) => (x.lang || "zh") === appLang())) { const g = d.group || "Колоды"; (groups.get(g) ?? groups.set(g, []).get(g)!).push(d); }
  const row = (d: DeckInfo) => {
    const on = isAdded(d.id);
    return `<button class="deck-opt" data-cat="${esc(d.id)}" aria-pressed="${on}"><span>${esc(d.title)}<small>${d.count} ${plural(d.count, "слово", "слова", "слов")}${d.subtitle ? ` · ${esc(d.subtitle)}` : ""}</small></span><span class="pick-btn${on ? " on" : ""}">${on ? "✓" : "+"}</span></button>`;
  };
  const charRow = () => `<button class="deck-opt" data-chars aria-pressed="${!!app.settings.charDeck}"><span>Иероглифы из моих слов<small>Каждый иероглиф начатых слов — отдельной карточкой, как в Skritter. Пополняется сама.</small></span><span class="pick-btn${app.settings.charDeck ? " on" : ""}">${app.settings.charDeck ? "✓" : "+"}</span></button>`;
  const body = `<p class="hint">Нажмите, чтобы добавить колоду к себе. Прогресс по словам общий: если слово уже выучено в другой колоде, оно не начнётся заново.</p>`
    + (appLang() === "zh" ? `<h3 class="grp-title"><span>Иероглифы</span></h3><div class="deck-list">${charRow()}</div>` : "")
    + [...groups].map(([g, list]) => `<h3 class="grp-title"><span>${esc(g)}</span></h3><div class="deck-list">${list.map(row).join("")}</div>`).join("")
    + `<button class="btn primary wide" id="cat-done">Готово</button>`;
  openSheet("Готовые колоды", `<div class="pick-decks">${body}</div>`, (root) => {
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("#cat-done")) { closeSheet(); renderHome(); onDone?.(); return; }
      const ch = t.closest<HTMLButtonElement>("[data-chars]");
      if (ch) {
        const on = !app.settings.charDeck;
        await updateSettings({ charDeck: on });
        if (on) await refreshCharDeck(); else if (app.userDecks.some((d) => d.id === CHAR_DECK)) await removeUserDeck(CHAR_DECK);
        ch.outerHTML = charRow();
        renderHome();
        return;
      }
      const b = t.closest<HTMLButtonElement>("[data-cat]");
      if (!b) return;
      const id = b.dataset.cat!;
      if (isAdded(id)) await removeBuiltinDeck(id); else await addBuiltinDecks([id]);
      const d = app.builtinDecks.find((x) => x.id === id)!;
      b.outerHTML = row(d);
      renderHome();
    });
  });
}

/* ---------- импорт ---------- */

/** Меню группы колод: свернуть все/развернуть, убрать или удалить всю группу сразу. */
function openGroupMenu(g: string) {
  const list = visibleDecks().filter((d) => (d.group ?? "") === g);
  const own = list.filter((d) => d.user).length;
  const n = list.length;
  const what = own === n ? "Удалить" : own ? "Удалить и убрать" : "Убрать из списка";
  openSheet(g, `<div class="dm-list">
      <button class="deck-opt danger" id="gm-del"><span>${what}: все ${n} ${plural(n, "колода", "колоды", "колод")}<small>${own ? "Свои колоды удаляются, готовые — убираются из списка. " : ""}Прогресс по словам сохранится.</small></span></button>
    </div><div class="confirm" id="gm-confirm" hidden></div>`, (root) => {
    root.querySelector("#gm-del")!.addEventListener("click", () => confirmInline(root.querySelector<HTMLElement>("#gm-confirm")!,
      `${what} всю группу «${g}» (${n})?`, own ? "Удалить" : "Убрать",
      async () => { await deleteDecks(list.map((d) => d.id)); closeSheet(); renderHome(); }));
  });
}

/* ---------- обработчики ---------- */

export function initHome() {
  onShow("home", renderHome);
  // вернулись к колоде — занятие одним уроком закончено
  onShow("deck", () => { setFocus(null); renderDeck(); });
  $("start").addEventListener("click", () => startSession());
  $("decks").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const gm = t.closest<HTMLButtonElement>("[data-gmenu]");
    if (gm) { openGroupMenu(gm.dataset.gmenu!); return; }
    const fg = t.closest<HTMLButtonElement>("[data-fold]");
    if (fg) { toggleFold(fg.dataset.fold!, fg); return; }
    const m = t.closest<HTMLButtonElement>("[data-menu]");
    if (m) { openDeckMenu(m.dataset.menu!); return; }
    const o = t.closest<HTMLElement>("[data-id]");
    if (o) openDeck(o.dataset.id!);
  });
  $("deck-back").addEventListener("click", () => show("home"));
  $("deck-blocks").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const f = t.closest<HTMLButtonElement>("[data-dfold]");
    if (f) {
      const open = f.getAttribute("aria-expanded") !== "true";
      f.setAttribute("aria-expanded", String(open));
      (f.nextElementSibling as HTMLElement).hidden = !open;
      const all = dfolds(); all[f.dataset.dfold!] = open;
      try { localStorage.setItem(DFOLD, JSON.stringify(all)); } catch { /* */ }
      return;
    }
    const b = t.closest<HTMLButtonElement>("[data-block]");
    if (b) openBlock(Number(b.dataset.block));
  });
  $("deck-menu").addEventListener("click", () => app.deck && openDeckMenu(app.deck.id));
  $("deck-words").addEventListener("click", openDeckWords);
  $("deck-skills").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-skill]");
    const d = app.deck;
    if (!b || !d) return;
    const k = b.dataset.skill as Skill;
    const cur = deckSkills(d.id);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    if (!next.length) { $("deck-skill-hint").textContent = "Нужен хотя бы один способ."; return; }
    await setDeckOpts(d.id, { skills: SKILLS.map((x) => x.id).filter((x) => next.includes(x)) });
    renderDeck();
  });
  $("deck-create").addEventListener("click", () => openDeckEditor(undefined, () => renderHome()));
  $("deck-import").addEventListener("click", () => openImport({ mode: "cards", onDeck: (id) => void openDeck(id) }));
  // колоды добавлены импортом — список на главной обновляется сразу (без перезагрузки)
  document.addEventListener("cherta:decks", () => { if (!$("home").hidden) void renderHome(); });
  $("deck-catalog").addEventListener("click", () => openCatalog());
  $("deck-catalog-empty").addEventListener("click", () => openCatalog());
}
