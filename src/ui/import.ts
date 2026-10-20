/**
 * Импорт в одном окне: слова в карточки и тексты для чтения.
 * Вставить из буфера, набрать, выбрать файл или перетащить его; «Поделиться → Черта» на телефоне открывает это же окно.
 * Ниже поля — живой предпросмотр: что получится, с галочками у слов; можно поправить значение и убрать лишнее.
 */
import { app, hskEntries, dictIndex, saveUserDeck } from "../state.ts";
import { parseImportAll, type ImportRow, type ImportResult } from "../core/importer.ts";
import { looksLikeText, wordsFromText, guessLevel, titleOf } from "../core/textwords.ts";
import { parseTexts, type ReadText } from "../core/reading.ts";
import { dictPyToNumeric, type DictIndex } from "../core/dict.ts";
import { parseRef } from "../core/pinyin.ts";
import { ALL_SKILLS, cardId } from "../core/skills.ts";
import { esc, pinyinHTML, plural } from "./dom.ts";
import { openSheet, closeSheet } from "./sheet.ts";
import { addOwnTexts, openOwnText } from "./reading.ts";

export type ImportMode = "cards" | "text";
export type ImportOpts = { mode?: ImportMode; text?: string; name?: string; deckId?: string; onDeck?: (id: string) => void };

type Row = { han: string; py: string | null; ru: string; on: boolean; have: boolean; lv?: number; n?: number };

/* ---------- словарь для разбора: HSK (с уровнем) + индекс БКРС, если доступен ---------- */

type Lex = { has: (w: string) => boolean; info: (w: string) => { py: string | null; ru: string } | null; level: (w: string) => number | undefined };
let lexP: Promise<Lex> | null = null;
function lexicon(): Promise<Lex> {
  return (lexP ??= (async () => {
    const hsk = new Map<string, { py: string; ru: string; lv?: number }>();
    for (const e of await hskEntries()) {
      const m = /HSK\s*(\d)/.exec(e.level ?? "");
      hsk.set(e.han, { py: e.py, ru: e.ru, lv: m ? Number(m[1]) : undefined });
    }
    let dict: DictIndex | null = null;
    try { dict = await dictIndex(); } catch { /* офлайн: только HSK */ }
    const pos = new Map<string, number>();
    dict?.han.forEach((h, i) => { if (h.length <= 4 && !pos.has(h)) pos.set(h, i); });
    const lx: Lex = {
      has: (w) => hsk.has(w) || pos.has(w),
      level: (w) => hsk.get(w)?.lv,
      info: (w) => {
        const h = hsk.get(w);
        if (h) return { py: h.py, ru: h.ru };
        const i = pos.get(w);
        return i === undefined || !dict ? null : { py: dictPyToNumeric(dict.py[i], w), ru: dict.ru[i] };
      },
    };
    return lx;
  })().catch((e) => { lexP = null; throw e; }));
}

const started = (w: string) => ALL_SKILLS.some((sk) => app.cards.has(cardId(`zh:${w}`, sk)));
const pyHTML = (py: string | null) => { try { return py ? pinyinHTML(parseRef(py)) : ""; } catch { return esc(py ?? ""); } };
const ownDecks = () => app.userDecks.filter((d) => d.id !== "u-chars");

/* ---------- окно ---------- */

export function openImport(o: ImportOpts = {}) {
  let mode: ImportMode = o.mode ?? (o.text && looksLikeText(o.text) && o.text.length > 40 ? "text" : "cards");
  let name = o.name ?? "";
  let rows: Row[] = [];
  let parts: (ImportResult & { ok: [string, string, string][] })[] = [];
  let texts: ReadText[] = [];
  let showHave = false;
  let target = o.deckId && ownDecks().some((d) => d.id === o.deckId) ? o.deckId : "new";
  let gen = 0;
  const canPaste = !!navigator.clipboard?.readText;

  openSheet("Импорт", `<div class="stack im">
      <div class="chips-row" role="group" aria-label="Что импортировать">
        <button class="chip-btn" data-mode="cards">Слова → карточки</button><button class="chip-btn" data-mode="text">Текст для чтения</button>
      </div>
      <div class="field"><textarea id="im-src" rows="5" spellcheck="false" autocomplete="off"></textarea></div>
      <div class="row wrap im-tools">
        ${canPaste ? `<button class="btn small primary" id="im-paste">Вставить</button>` : ""}
        <button class="btn small" id="im-file">Файл</button>
        <button class="btn small ghost" id="im-clear">Очистить</button>
        <input type="file" id="im-file-in" accept=".txt,.tsv,.csv,text/plain,text/csv,text/tab-separated-values" hidden>
      </div>
      <div id="im-prev" class="stack" aria-live="polite"></div>
    </div>`, (root) => {
    const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const src = q<HTMLTextAreaElement>("#im-src");
    const prev = q("#im-prev");
    src.value = o.text ?? "";

    const setMode = (m: ImportMode) => {
      mode = m;
      root.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      src.placeholder = m === "cards"
        ? "Вставьте слова: 学习 老师 朋友 — или таблицу из Anki, Pleco, Skritter, Excel — или любой китайский текст: из него возьмутся слова."
        : "Вставьте китайский текст — статью, диалог, урок учебника. Предложения разделятся сами, перевод можно добавить через «|».";
      void update();
    };

    /* предпросмотр */
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = window.setTimeout(() => void update(), 300); };
    async function update() {
      const my = ++gen;
      const text = src.value;
      if (!text.trim()) { prev.innerHTML = help(); return; }
      if (mode === "text") return previewText(text);
      prev.innerHTML = `<p class="hint">Разбираю…</p>`;
      let lex: Lex | null = null;
      try { lex = await lexicon(); } catch { /* нет даже HSK — останутся только строки с пиньинем и значением */ }
      if (my !== gen) return;
      if (looksLikeText(text)) {
        const ws = wordsFromText(text, (w) => !!lex?.has(w));
        parts = [];
        rows = ws.map(({ w, n }) => {
          const inf = lex?.info(w) ?? null;
          const have = started(w);
          return { han: w, py: inf?.py ?? null, ru: inf?.ru ?? "", on: !have && !!inf, have, lv: lex?.level(w), n };
        });
      } else {
        const ps = parseImportAll(text, name);
        const fill = (r: ImportRow): Row => {
          const inf = !r.py || !r.ru ? lex?.info(r.han) ?? null : null;
          const py = r.py ?? inf?.py ?? null, ru = r.ru || inf?.ru || "";
          return { han: r.han, py, ru, on: !!(py && ru), have: started(r.han), lv: lex?.level(r.han) };
        };
        if (ps.length > 1) {
          parts = ps.map((p) => ({ ...p, ok: p.rows.map(fill).filter((r) => r.py && r.ru).map((r) => [r.han, r.py!, r.ru] as [string, string, string]) }));
          rows = [];
        } else {
          parts = [];
          rows = (ps[0]?.rows ?? []).map(fill);
          if (ps[0]?.title && ps[0].title !== "Импорт" && !name) name = ps[0].title;
        }
      }
      if (my === gen) drawCards();
    }

    function drawCards() {
      if (parts.length) {
        const total = parts.reduce((a, p) => a + p.ok.length, 0);
        prev.innerHTML = `<p class="hint">Колод в файле: <b>${parts.length}</b>, слов: <b>${total}</b>.</p>
          <label class="field"><span class="label">Группа в списке колод</span><input id="im-group" value="${esc(parts[0].group ?? name.replace(/\.[^.]+$/, ""))}" autocomplete="off"></label>
          <div class="deck-list">${parts.map((p) => `<div class="deck-opt"><span>${esc(p.title)}<small>${p.ok.length} ${plural(p.ok.length, "слово", "слова", "слов")}</small></span></div>`).join("")}</div>
          <button class="btn primary wide" id="im-go" ${total ? "" : "disabled"}>Создать ${parts.length} ${plural(parts.length, "колоду", "колоды", "колод")}</button>`;
        return;
      }
      if (!rows.length) { prev.innerHTML = `<p class="note">Китайских слов не нашлось.</p>${help()}`; return; }
      const have = rows.filter((r) => r.have).length;
      const vis = rows.map((r, i) => [r, i] as const).filter(([r]) => showHave || !r.have);
      const on = rows.filter((r) => r.on && r.py && r.ru).length;
      const decks = ownDecks();
      const MAX = 400;
      prev.innerHTML = `<div class="row wrap im-sum"><span class="hint">Слов: <b>${rows.length}</b>${have ? ` · уже учу: ${have}` : ""} · выбрано: <b id="im-n">${on}</b></span>
          <button class="link-btn" id="im-all">Выбрать все</button><button class="link-btn" id="im-none">Снять все</button>
          ${have ? `<button class="link-btn" id="im-have">${showHave ? "Скрыть изучаемые" : `Показать изучаемые (${have})`}</button>` : ""}</div>
        <div class="im-list">${vis.slice(0, MAX).map(([r, i]) => rowHTML(r, i)).join("")}</div>
        ${vis.length > MAX ? `<p class="hint">Показаны первые ${MAX} из ${vis.length}; остальные тоже будут добавлены, если отмечены.</p>` : ""}
        <div class="field"><span class="label">Куда</span>
          <select id="im-target"><option value="new">Новая колода</option>${decks.map((d) => `<option value="${esc(d.id)}" ${d.id === target ? "selected" : ""}>В колоду «${esc(d.title)}»</option>`).join("")}</select></div>
        <label class="field" id="im-title-f" ${target === "new" ? "" : "hidden"}><span class="label">Название колоды</span><input id="im-title" value="${esc(name.replace(/\.[^.]+$/, "") || "Мои слова")}" autocomplete="off"></label>
        <button class="btn primary wide" id="im-go">${goLabel(on)}</button>`;
    }
    const goLabel = (n: number) => (target === "new" ? `Создать колоду · ${n} ${plural(n, "слово", "слова", "слов")}` : `Добавить ${n} ${plural(n, "слово", "слова", "слов")}`);
    function rowHTML(r: Row, i: number) {
      const miss = !r.py || !r.ru;
      return `<div class="im-row ${r.on ? "" : "off"}" data-i="${i}">
        <input type="checkbox" data-chk="${i}" ${r.on ? "checked" : ""} aria-label="Добавить ${esc(r.han)}">
        <b class="im-h">${esc(r.han)}</b>
        <span class="im-t">${miss
          ? `<input class="im-in" data-py="${i}" placeholder="пиньинь: xue2 xi2" value="${esc(r.py ?? "")}"><input class="im-in" data-ru="${i}" placeholder="значение" value="${esc(r.ru)}">`
          : `<span class="py">${pyHTML(r.py)}</span><button class="im-ru" data-edit="${i}" title="Изменить значение">${esc(r.ru)}</button>`}
        </span>
        <small class="im-tag">${r.have ? "учу" : r.lv ? `HSK ${r.lv}` : ""}${r.n && r.n > 1 ? ` ×${r.n}` : ""}</small></div>`;
    }
    const recount = () => {
      const n = rows.filter((r) => r.on && r.py && r.ru).length;
      const el = root.querySelector("#im-n"); if (el) el.textContent = String(n);
      const go = root.querySelector<HTMLButtonElement>("#im-go"); if (go) { go.textContent = goLabel(n); go.disabled = !n; }
    };

    function previewText(text: string) {
      texts = parseTexts(text, `o-${Date.now().toString(36)}`);
      if (!texts.length) { prev.innerHTML = `<p class="note">Китайского текста не нашлось.</p>${help()}`; return; }
      const one = texts.length === 1 ? texts[0] : null;
      if (one) {
        if (one.title === "Мой текст") one.title = name.replace(/\.[^.]+$/, "") || titleOf(text);
        const draw = (lex: Lex | null) => {
          const ws = wordsFromText(one.lines.map((l) => l[0]).join("\n"), (w) => !!lex?.has(w));
          if (!one.level && lex) one.level = guessLevel(ws, lex.level);
          prev.innerHTML = `<p class="hint">Предложений: <b>${one.lines.length}</b> · слов: <b>${ws.length}</b>${one.lines.some((l) => l[1]) ? " · с переводом" : ""}${one.q.length ? ` · вопросов: ${one.q.length}` : ""}</p>
            <label class="field"><span class="label">Название</span><input id="im-ttitle" value="${esc(one.title)}" autocomplete="off"></label>
            <label class="field"><span class="label">Уровень${lex ? " (подобран по словам HSK, можно поменять)" : ""}</span>
              <select id="im-lv">${[0, 1, 2, 3, 4, 5, 6].map((l) => `<option value="${l}" ${l === one.level ? "selected" : ""}>${l ? `HSK ${l}` : "Без уровня"}</option>`).join("")}</select></label>
            <div class="panel im-tprev">${one.lines.slice(0, 4).map(([zh, ru]) => `<p><span class="han">${esc(zh)}</span>${ru ? `<small>${esc(ru)}</small>` : ""}</p>`).join("")}${one.lines.length > 4 ? `<p class="hint">…и ещё ${one.lines.length - 4}</p>` : ""}</div>
            <button class="btn primary wide" id="im-tgo">Добавить в «Чтение»</button>`;
        };
        draw(null);
        lexicon().then((lex) => { if (mode === "text" && texts[0] === one && !root.querySelector("#im-ttitle:focus")) draw(lex); }).catch(() => {});
      } else {
        prev.innerHTML = `<p class="hint">Текстов в файле: <b>${texts.length}</b></p>
          <div class="deck-list">${texts.map((t) => `<div class="deck-opt"><span>${esc(t.title)}<small>${t.level ? `HSK ${t.level} · ` : ""}${t.lines.length} ${plural(t.lines.length, "предложение", "предложения", "предложений")}</small></span></div>`).join("")}</div>
          <button class="btn primary wide" id="im-tgo">Добавить ${texts.length} ${plural(texts.length, "текст", "текста", "текстов")} в «Чтение»</button>`;
      }
    }

    /* сохранение */
    async function goCards() {
      const t0 = Date.now();
      if (parts.length) {
        const group = q<HTMLInputElement>("#im-group").value.trim() || undefined;
        for (const [k, p] of parts.entries()) if (p.ok.length) await saveUserDeck({ id: `u-${(t0 + k).toString(36)}`, title: p.title, words: p.ok, createdAt: t0 + k, ...(group ? { group } : {}) });
        done(`Создано колод: ${parts.length}.`);
        return;
      }
      const pick = rows.filter((r) => r.on && r.py && r.ru).map((r) => [r.han, r.py!, r.ru.trim()] as [string, string, string]);
      if (!pick.length) return;
      if (target === "new") {
        const title = q<HTMLInputElement>("#im-title").value.trim() || "Мои слова";
        const id = `u-${t0.toString(36)}`;
        await saveUserDeck({ id, title, words: pick, createdAt: t0 });
        done(`Колода «${title}»: ${pick.length} ${plural(pick.length, "слово", "слова", "слов")}.`, id);
      } else {
        const d = ownDecks().find((x) => x.id === target)!;
        const have = new Set(d.words.map((w) => w[0]));
        const add = pick.filter((r) => !have.has(r[0]));
        await saveUserDeck({ ...d, words: [...d.words, ...add] });
        done(`В колоду «${d.title}» добавлено ${add.length} ${plural(add.length, "слово", "слова", "слов")}${pick.length > add.length ? `, уже были: ${pick.length - add.length}` : ""}.`, d.id);
      }
    }
    function done(msg: string, deckId?: string) {
      openSheet("Импорт", `<div class="stack"><p>${esc(msg)}</p>
        ${deckId && o.onDeck ? `<button class="btn primary wide" id="im-open">Открыть колоду</button>` : ""}
        <button class="btn wide" id="im-more">Импортировать ещё</button><button class="btn ghost wide" id="im-close">Готово</button></div>`, (r2) => {
        r2.querySelector("#im-open")?.addEventListener("click", () => { closeSheet(); o.onDeck!(deckId!); });
        r2.querySelector("#im-more")!.addEventListener("click", () => openImport({ ...o, text: "", name: "" }));
        r2.querySelector("#im-close")!.addEventListener("click", closeSheet);
      });
    }
    async function goTexts() {
      const one = texts.length === 1 ? texts[0] : null;
      if (one) {
        one.title = q<HTMLInputElement>("#im-ttitle").value.trim() || one.title;
        one.level = Number(q<HTMLSelectElement>("#im-lv").value);
      }
      await addOwnTexts(texts);
      const all = texts.map((t) => t.lines.map((l) => l[0]).join("\n")).join("\n");
      openSheet("Импорт", `<div class="stack"><p>Добавлено в «Чтение»: ${texts.length === 1 ? `«${esc(texts[0].title)}»` : `${texts.length} ${plural(texts.length, "текст", "текста", "текстов")}`}.</p>
        ${one ? `<button class="btn primary wide" id="im-read">Читать</button>` : ""}
        <button class="btn wide" id="im-words">Слова из ${one ? "текста" : "текстов"} → в карточки</button><button class="btn ghost wide" id="im-close">Готово</button></div>`, (r2) => {
        r2.querySelector("#im-read")?.addEventListener("click", () => { closeSheet(); openOwnText(one!.id); });
        r2.querySelector("#im-words")!.addEventListener("click", () => openImport({ ...o, mode: "cards", text: all, name: one?.title ?? "" }));
        r2.querySelector("#im-close")!.addEventListener("click", closeSheet);
      });
    }

    /* события */
    const loadFile = async (f: File) => {
      try { src.value = await f.text(); name = f.name; } catch { prev.innerHTML = `<p class="note danger">Не получилось прочитать файл. Нужен текстовый: .txt, .tsv или .csv.</p>`; return; }
      if (!o.mode) setMode(looksLikeText(src.value) && src.value.length > 40 && !/\t/.test(src.value) ? "text" : "cards"); else void update();
    };
    src.addEventListener("input", later);
    src.addEventListener("paste", () => setTimeout(() => void update(), 0));
    root.addEventListener("dragover", (e) => { e.preventDefault(); root.classList.add("drop"); });
    root.addEventListener("dragleave", () => root.classList.remove("drop"));
    root.addEventListener("drop", (e) => { e.preventDefault(); root.classList.remove("drop"); const f = e.dataTransfer?.files?.[0]; if (f) void loadFile(f); });
    q<HTMLInputElement>("#im-file-in").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; const f = i.files?.[0]; i.value = ""; if (f) void loadFile(f); });
    root.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      const ip = t.dataset.py, ir = t.dataset.ru;
      if (ip !== undefined || ir !== undefined) {
        const r = rows[Number(ip ?? ir)];
        if (ip !== undefined) { try { const v = t.value.trim(); r.py = v && parseRef(v).length ? v : null; } catch { r.py = null; } }
        else r.ru = t.value;
        if (r.py && r.ru.trim()) { r.on = true; const c = root.querySelector<HTMLInputElement>(`[data-chk="${ip ?? ir}"]`); if (c) c.checked = true; }
        recount();
      }
    });
    root.addEventListener("change", (e) => {
      const t = e.target as HTMLElement;
      if (t.id === "im-target") {
        target = (t as HTMLSelectElement).value;
        q("#im-title-f").hidden = target !== "new";
        recount();
        return;
      }
      const c = (t as HTMLInputElement).dataset.chk;
      if (c !== undefined) { rows[Number(c)].on = (t as HTMLInputElement).checked; t.closest(".im-row")?.classList.toggle("off", !rows[Number(c)].on); recount(); }
    });
    root.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      const m = t.closest<HTMLElement>("[data-mode]");
      if (m) { setMode(m.dataset.mode as ImportMode); return; }
      if (t.closest("#im-paste")) {
        try { src.value = await navigator.clipboard.readText(); name = ""; void update(); }
        catch { prev.innerHTML = `<p class="note">Браузер не дал прочитать буфер. Нажмите в поле и вставьте долгим нажатием (или Ctrl+V).</p>`; src.focus(); }
        return;
      }
      if (t.closest("#im-file")) { q("#im-file-in").click(); return; }
      if (t.closest("#im-clear")) { src.value = ""; name = ""; void update(); src.focus(); return; }
      if (t.closest("#im-all") || t.closest("#im-none")) { const v = !!t.closest("#im-all"); for (const r of rows) if (showHave || !r.have) r.on = v && !!(r.py && r.ru); drawCards(); return; }
      if (t.closest("#im-have")) { showHave = !showHave; drawCards(); return; }
      const ed = t.closest<HTMLElement>("[data-edit]");
      if (ed) {
        const i = Number(ed.dataset.edit);
        ed.outerHTML = `<input class="im-in" data-ru="${i}" value="${esc(rows[i].ru)}">`;
        root.querySelector<HTMLInputElement>(`[data-ru="${i}"]`)?.focus();
        return;
      }
      const go = t.closest<HTMLButtonElement>("#im-go");
      if (go) { go.disabled = true; try { await goCards(); } catch { go.disabled = false; } return; }
      const tg = t.closest<HTMLButtonElement>("#im-tgo");
      if (tg) { tg.disabled = true; try { await goTexts(); } catch { tg.disabled = false; } }
    });
    setMode(mode);
    if (!o.text) src.focus();
  });
}

function help() {
  return `<details class="paste"><summary>Что можно вставить</summary>
    <div class="stack hint">
      <p><b>Слова:</b> через пробел или по одному в строке — <span class="han">学习 老师 朋友</span>. Пиньинь и значение подставятся сами (HSK, затем словарь).</p>
      <p><b>Таблицы:</b> экспорт Anki (.txt), Pleco, Skritter (.csv), колонки из Excel или Google Таблиц: иероглифы | пиньинь | значение, в любом порядке.</p>
      <p><b>Несколько колод в одном файле:</b> строки <code>## Название</code> перед каждой колодой.</p>
      <p><b>Обычный текст</b> (статья, переписка, урок): для карточек из него возьмутся слова с галочками; для чтения он разделится на предложения. Перевод строки можно дописать через «|», вопросы — строкой «? вопрос | ответ* | ответ».</p>
    </div></details>`;
}
