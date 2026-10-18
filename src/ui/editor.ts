/** Редакторы: слово (значение, пиньинь, заметка, скрыть) и своя колода. */
import { app, baseWord, editOf, saveEdit, revertEdit, hskLookup, saveUserDeck, removeUserDeck } from "../state.ts";
import type { Word } from "../core/deck.ts";
import { toMarked, toNumeric, parseRef } from "../core/pinyin.ts";
import { parseUserDeck } from "../core/edits.ts";
import type { UserDeck } from "../store.ts";
import { esc, plural } from "./dom.ts";
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

export function openDeckEditor(deck?: UserDeck, saved?: (id: string | null) => void) {
  const text = deck ? deck.words.map(([h, p, r]) => `${h} | ${toMarked(parseRef(p))} | ${r}`).join("\n") : "";
  const body = `
    <label class="field"><span class="label">Название</span>
      <input id="dk-title" value="${esc(deck?.title ?? "")}" placeholder="Например: Genki, урок 3" autocomplete="off"></label>
    <label class="field"><span class="label">Слова</span>
      <textarea id="dk-words" rows="8" placeholder="学习\n人 大 中国\n飞船 | fēi chuán | космический корабль">${esc(text)}</textarea>
      <small class="hint">По одному слову в строке или несколько через пробел. Пиньинь и значение подставятся из HSK. Для слов не из HSK пишите: <b>слово | пиньинь | значение</b>.</small></label>
    <p class="note" id="dk-info"></p>
    <div class="row">
      <button class="btn primary" id="dk-save">${deck ? "Сохранить" : "Создать колоду"}</button>
      ${deck ? `<button class="btn danger" id="dk-del">Удалить</button>` : ""}
    </div>
    <div class="confirm" id="dk-confirm" hidden></div>`;
  openSheet(deck ? "Изменить колоду" : "Новая колода", body, (root) => {
    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    const info = q("dk-info");
    q("dk-save").addEventListener("click", async () => {
      const title = q<HTMLInputElement>("dk-title").value.trim() || "Моя колода";
      info.classList.remove("danger");
      info.textContent = "Ищу слова в HSK…";
      const lookup = await hskLookup();
      const { rows, skipped } = parseUserDeck(q<HTMLTextAreaElement>("dk-words").value, lookup);
      if (!rows.length) {
        info.classList.add("danger");
        info.textContent = skipped.length ? `Не нашлось ни одного слова. Не из HSK: ${skipped.join(", ")} — для них укажите пиньинь и значение.` : "Добавьте хотя бы одно слово.";
        return;
      }
      const d: UserDeck = { id: deck?.id ?? `u-${Date.now().toString(36)}`, title, words: rows, createdAt: deck?.createdAt ?? Date.now() };
      await saveUserDeck(d);
      if (skipped.length) {
        info.classList.add("danger");
        info.textContent = `Сохранено ${rows.length} ${plural(rows.length, "слово", "слова", "слов")}. Пропущены (нет в HSK, укажите пиньинь и значение): ${skipped.join(", ")}`;
        saved?.(d.id);
        return;
      }
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

export const userDeckById = (id: string) => app.userDecks.find((d) => d.id === id);
