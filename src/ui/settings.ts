import { app, updateSettings, reloadAll, revertEdit } from "../state.ts";
import * as store from "../store.ts";
import { say, voiceStatus, onVoices } from "../speech.ts";
import { $, esc, plural } from "./dom.ts";
import { setTheme, type ThemeChoice } from "../theme.ts";
import { renderThemeChoices, openThemeEditor } from "./themeEditor.ts";
import { onShow } from "./nav.ts";

function renderThemes() {
  renderThemeChoices($("themes"));
}

function renderEdits() {
  const list = [...app.edits.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  $("edits-info").textContent = list.length
    ? `Изменено ${list.length} ${plural(list.length, "слово", "слова", "слов")}. Исходные данные не меняются — любую правку можно вернуть.`
    : "Правок пока нет. Изменить слово можно в его карточке или после ответа в занятии.";
  $("edits-list").innerHTML = list.map((e) => {
    const parts = [e.ru && `значение: ${e.ru}`, e.py && "пиньинь", e.note && "заметка", e.hidden && "скрыто"].filter(Boolean).join(" · ");
    return `<div class="edit-row"><span class="h">${esc(e.id.split(":")[1] ?? e.id)}</span><span class="d">${esc(parts)}</span><button class="btn small" data-revert="${esc(e.id)}">Вернуть</button></div>`;
  }).join("");
}

function render() {
  renderThemes();
  renderEdits();
  $("n-val").textContent = String(app.settings.newPerDay);
  $<HTMLInputElement>("s-py").checked = app.settings.pinyin;
  $<HTMLInputElement>("s-voice").checked = app.settings.voice;
  $("voice-info").textContent = voiceStatus();
  $("progress-info").textContent = `Начато слов: ${app.cards.size}. Прогресс хранится в этом браузере на этом устройстве.`;
}

function note(text: string, bad = false) {
  const el = $("io-note");
  el.textContent = text;
  el.classList.toggle("danger", bad);
}

function confirmBox(question: string, yes: string, onYes: () => void) {
  const box = $("confirm-box");
  box.hidden = false;
  box.innerHTML = `<span>${esc(question)}</span><button class="btn small danger" id="c-yes">${esc(yes)}</button><button class="btn small" id="c-no">Отмена</button>`;
  $("c-yes").addEventListener("click", () => { box.hidden = true; onYes(); });
  $("c-no").addEventListener("click", () => { box.hidden = true; });
}

export function initSettings() {
  onShow("settings", render);
  $("edits-list").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-revert]");
    if (!b) return;
    await revertEdit(b.dataset.revert!);
    renderEdits();
  });
  $("themes").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".theme-opt");
    if (!b) return;
    const id = b.dataset.themeId as ThemeChoice;
    setTheme(id, app.settings.custom ?? null);
    await updateSettings({ theme: id });
    renderThemes();
  });
  $("theme-edit").addEventListener("click", () => openThemeEditor(renderThemes));
  onVoices(() => { const el = document.getElementById("voice-info"); if (el) el.textContent = voiceStatus(); });
  $("n-minus").addEventListener("click", async () => { await updateSettings({ newPerDay: Math.max(0, app.settings.newPerDay - 5) }); render(); });
  $("n-plus").addEventListener("click", async () => { await updateSettings({ newPerDay: Math.min(50, app.settings.newPerDay + 5) }); render(); });
  $("s-py").addEventListener("change", (e) => updateSettings({ pinyin: (e.target as HTMLInputElement).checked }));
  $("s-voice").addEventListener("change", (e) => updateSettings({ voice: (e.target as HTMLInputElement).checked }));
  $("s-test").addEventListener("click", () => say("你好"));

  $("export").addEventListener("click", async () => {
    const json = await store.exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cherta-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    note("Файл прогресса сохранён в загрузки.");
  });
  $("import").addEventListener("click", () => $<HTMLInputElement>("import-file").click());
  $<HTMLInputElement>("import-file").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const text = await file.text();
    confirmBox("Заменить текущий прогресс данными из файла?", "Заменить", async () => {
      try {
        const n = await store.importAll(text);
        await reloadAll();
        setTheme(app.settings.theme, app.settings.custom ?? null);
        render();
        note(`Загружено карточек: ${n}.`);
      } catch (err) {
        note(err instanceof Error ? err.message : "Не удалось прочитать файл.", true);
      }
    });
  });
  $("reset").addEventListener("click", () => confirmBox("Удалить весь прогресс? Настройки останутся.", "Удалить", async () => {
    await store.resetProgress();
    await reloadAll();
    render();
    note("Прогресс удалён.");
  }));
}
