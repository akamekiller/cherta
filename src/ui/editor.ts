/** Редакторы: слово (значение, пиньинь, заметка, скрыть) и своя колода. */
import { app, baseWord, editOf, saveEdit, revertEdit, hskLookup, hskEntries, saveUserDeck, removeUserDeck, toggleInUserDeck } from "../state.ts";
import type { Word } from "../core/deck.ts";
import { toMarked, toNumeric, parseRef } from "../core/pinyin.ts";
import { parseUserDeck, searchEntries, type DictEntry } from "../core/edits.ts";
import type { UserDeck } from "../store.ts";
import { esc, plural, pinyinHTML } from "./dom.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";

/* ---------- слово ---------- */

export function openWordEditor(w: Word, saved?: () => void) {
  const base = baseWord(w.id) ?? w;
  const e = editOf(w.id);
  const body = `
    <div class="ed-word"><span class="ed-han">${esc(w.han)}</span><span class="hint">Исходно: ${esc(toMarked(base.ref))} — ${esc(base.ru)}</span></div>
    <label class="field"><span class="label">Значение</span>
      <textarea id="ed-ru" rows="2" placeholder="${esc(base.ru)}">${esc(e?.ru ?? "")}</textarea></label>
    <label class="field"><span class="label">Пиньинь</span>
      <input id="ed-py" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(toMarked(base.ref))}" value="${esc(e?.py ? toMarked(parseRef(e.py)) : "")}">
      <small class="hint">Слоги через пробел: «xué xí» или «xue2 xi2». Пусто — исходный.</small></label>
    <label class="field"><span class="label">Заметка, мнемоника</span>
      <textarea id="ed-note" rows="2" placeholder="Например: 好 = женщина 女 + ребёнок 子 — это хорошо">${esc(e?.note ?? "")}</textarea></label>
    <label class="check"><input type="checkbox" id="ed-hide" ${e?.hidden ? "checked" : ""}> Скрыть из занятий <small class="hint">слово уже знаю или не нужно</small></label>
    <p class="note danger" id="ed-err"></p>
    <div class="row">
      <button class="btn primary" id="ed-save">Сохранить</button>
      ${e ? `<button class="btn" id="ed-revert">Вернуть как было</button>` : ""}
    </div>
    <div class="confirm" id="ed-confirm" hidden></div>`;
  openSheet("Изменить слово", body, (root) => {
    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    q("ed-save").addEventListener("click", async () => {
      const pyRaw = q<HTMLInputElement>("ed-py").value.trim();
      const py = pyRaw ? toNumeric(pyRaw) : "";
      if (py === null) { q("ed-err").textContent = "Не получилось разобрать пиньинь. Пишите слоги через пробел: «xué xí» или «xue2 xi2»."; return; }
      await saveEdit(w.id, {
        ru: q<HTMLTextAreaElement>("ed-ru").value.trim(),
        py: py === base.py ? "" : py,
        note: q<HTMLTextAreaElement>("ed-note").value.trim(),
        hidden: q<HTMLInputElement>("ed-hide").checked,
      });
      closeSheet();
      saved?.();
    });
    root.querySelector("#ed-revert")?.addEventListener("click", () =>
      confirmInline(q("ed-confirm"), "Убрать все правки этого слова?", "Вернуть", async () => {
        await revertEdit(w.id);
        closeSheet();
        saved?.();
      }));
  });
}

/* ---------- своя колода ---------- */

type Row = [string, string, string];

export function openDeckEditor(deck?: UserDeck, saved?: (id: string | null) => void, seed: Row[] = []) {
  const selected: Row[] = deck ? deck.words.map((w) => [...w] as Row) : [...seed];
  let entries: DictEntry[] = [];
  hskEntries().then((e) => { entries = e; renderResults(); });

  const body = `
    <label class="field"><span class="label">Название</span>
      <input id="dk-title" value="${esc(deck?.title ?? "")}" placeholder="Например: Genki, урок 3" autocomplete="off"></label>
    <div class="field">
      <span class="label">Найти и добавить</span>
      <input id="dk-q" type="search" placeholder="学习, xuexi или «учиться»" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <div class="pick-list" id="dk-results"></div>
      <div class="own-word" id="dk-own" hidden></div>
    </div>
    <div class="field">
      <span class="label" id="dk-count"></span>
      <div class="pick-list chosen" id="dk-chosen"></div>
    </div>
    <details class="paste">
      <summary>Вставить списком</summary>
      <textarea id="dk-paste" rows="4" placeholder="人 大 中国\n飞船 | fēi chuán | космический корабль"></textarea>
      <small class="hint">Иероглифы через пробел или по строкам. Для слов не из HSK: <b>слово | пиньинь | значение</b>.</small>
      <button class="btn small" id="dk-paste-add">Добавить из списка</button>
    </details>
    <p class="note" id="dk-info"></p>
    <div class="row sticky-actions">
      <button class="btn primary" id="dk-save">${deck ? "Сохранить" : "Создать колоду"}</button>
      ${deck ? `<button class="btn danger" id="dk-del">Удалить</button>` : ""}
    </div>
    <div class="confirm" id="dk-confirm" hidden></div>`;

  let root!: HTMLElement;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const has = (han: string) => selected.some((r) => r[0] === han);
  const row = (e: Row, on: boolean, action: string) =>
    `<div class="pick"><span class="h">${esc(e[0])}</span><span class="t"><span class="py">${pinyinHTML(parseRef(e[1]))}</span><span class="ru">${esc(e[2])}</span></span>${action === "remove"
      ? `<button class="pick-btn" data-remove="${esc(e[0])}" aria-label="Убрать из колоды">×</button>`
      : `<button class="pick-btn${on ? " on" : ""}" data-${action}="${esc(e[0])}" aria-label="${on ? "Убрать" : "Добавить"}">${on ? "✓" : "+"}</button>`}</div>`;

  function renderResults() {
    if (!root?.querySelector("#dk-q")) return; // панель уже закрыта или заменена другой
    const query = q<HTMLInputElement>("dk-q").value;
    const found = searchEntries(entries, query, 30);
    q("dk-results").innerHTML = query.trim() && !entries.length ? `<p class="hint pad-msg">Загружаю слова HSK…</p>`
      : found.map((e) => row([e.han, e.py, e.ru], has(e.han), "toggle")).join("")
        || (query.trim() ? `<p class="hint pad-msg">В HSK не нашлось.</p>` : "");
    const han = query.trim();
    const own = q("dk-own");
    const canOwn = /^\p{Script=Han}+$/u.test(han) && !found.some((e) => e.han === han) && !has(han);
    own.hidden = !canOwn;
    if (canOwn) {
      own.innerHTML = `<div class="hint">Добавить «${esc(han)}» своим словом:</div>
        <div class="own-row"><input id="dk-own-py" placeholder="пиньинь: fēi chuán" autocomplete="off" autocapitalize="off" spellcheck="false"><input id="dk-own-ru" placeholder="значение" autocomplete="off"><button class="btn small" id="dk-own-add">Добавить</button></div>`;
    }
  }
  function renderChosen() {
    q("dk-count").textContent = selected.length ? `В колоде: ${selected.length} ${plural(selected.length, "слово", "слова", "слов")}` : "В колоде пока пусто";
    q("dk-chosen").innerHTML = [...selected].reverse().map((r) => row(r, true, "remove")).join("");
  }
  function info(text: string, bad = false) { q("dk-info").textContent = text; q("dk-info").classList.toggle("danger", bad); }

  openSheet(deck ? "Изменить колоду" : "Новая колода", body, (r) => {
    root = r;
    renderChosen();
    q("dk-q").addEventListener("input", renderResults);
    q("dk-results").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-toggle]");
      if (!b) return;
      const han = b.dataset.toggle!;
      if (has(han)) selected.splice(selected.findIndex((x) => x[0] === han), 1);
      else { const en = entries.find((x) => x.han === han); if (en) selected.push([en.han, en.py, en.ru]); }
      renderResults(); renderChosen(); info("");
    });
    q("dk-chosen").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-remove]");
      if (!b) return;
      selected.splice(selected.findIndex((x) => x[0] === b.dataset.remove), 1);
      renderResults(); renderChosen();
    });
    q("dk-own").addEventListener("click", (e) => {
      if (!(e.target as HTMLElement).closest("#dk-own-add")) return;
      const han = q<HTMLInputElement>("dk-q").value.trim();
      const py = toNumeric(q<HTMLInputElement>("dk-own-py").value);
      const ru = q<HTMLInputElement>("dk-own-ru").value.trim();
      if (!py) { info("Укажите пиньинь слогами через пробел: «fēi chuán» или «fei1 chuan2».", true); return; }
      if (!ru) { info("Укажите значение.", true); return; }
      selected.push([han, py, ru]);
      q<HTMLInputElement>("dk-q").value = "";
      renderResults(); renderChosen(); info(`«${han}» добавлено.`);
    });
    q("dk-paste-add").addEventListener("click", async () => {
      const lookup = await hskLookup();
      const { rows, skipped } = parseUserDeck(q<HTMLTextAreaElement>("dk-paste").value, lookup);
      let added = 0;
      for (const r2 of rows) if (!has(r2[0])) { selected.push(r2); added++; }
      renderChosen(); renderResults();
      q<HTMLTextAreaElement>("dk-paste").value = skipped.join(" ");
      info(`Добавлено ${added} ${plural(added, "слово", "слова", "слов")}.${skipped.length ? ` Не из HSK (остались в поле — допишите пиньинь и значение): ${skipped.join(", ")}` : ""}`, skipped.length > 0);
    });
    q("dk-save").addEventListener("click", async () => {
      if (!selected.length) { info("Добавьте хотя бы одно слово.", true); return; }
      const title = q<HTMLInputElement>("dk-title").value.trim() || "Моя колода";
      const d: UserDeck = { id: deck?.id ?? `u-${Date.now().toString(36)}`, title, words: selected, createdAt: deck?.createdAt ?? Date.now() };
      await saveUserDeck(d);
      closeSheet();
      saved?.(d.id);
    });
    root.querySelector("#dk-del")?.addEventListener("click", () =>
      confirmInline(q("dk-confirm"), "Удалить колоду? Прогресс по словам сохранится.", "Удалить", async () => {
        await removeUserDeck(deck!.id);
        closeSheet();
        saved?.(null);
      }));
  });
}

/** «В колоду»: отметить, в каких своих колодах слово, или создать новую с ним. */
export function openAddToDeck(w: Word, changed?: () => void) {
  const rowOf: Row = [w.han, w.py, w.ru];
  const render = () => app.userDecks.map((d) => {
    const on = d.words.some((x) => x[0] === w.han);
    return `<button class="deck-opt" data-deck="${esc(d.id)}" aria-pressed="${on}"><span>${esc(d.title)}<small>${d.words.length} ${plural(d.words.length, "слово", "слова", "слов")}</small></span><span class="pick-btn${on ? " on" : ""}">${on ? "✓" : "+"}</span></button>`;
  }).join("") + `<button class="deck-opt deck-add" id="ad-new">+ Новая колода с этим словом</button>`;
  openSheet(`«${w.han}» в колоду`, `<div class="deck-list" id="ad-list">${render()}</div>`, (root) => {
    root.querySelector("#ad-list")!.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("#ad-new")) { openDeckEditor(undefined, () => changed?.(), [rowOf]); return; }
      const b = t.closest<HTMLButtonElement>("[data-deck]");
      if (!b) return;
      await toggleInUserDeck(b.dataset.deck!, rowOf);
      root.querySelector("#ad-list")!.innerHTML = render();
      changed?.();
    });
  });
}

export const userDeckById = (id: string) => app.userDecks.find((d) => d.id === id);
