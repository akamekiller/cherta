import { app, updateSettings, reloadCards } from "../state.ts";
import * as store from "../store.ts";
import { say, voiceStatus, onVoices } from "../speech.ts";
import { $, esc } from "./dom.ts";
import { THEMES, setTheme, type ThemeChoice } from "../theme.ts";
import { onShow } from "./nav.ts";

function renderThemes() {
  $("themes").innerHTML = THEMES.map((t) => `<button class="theme-opt" data-theme-id="${t.id}" aria-pressed="${app.settings.theme === t.id}">
    <span class="swatch" aria-hidden="true">${t.swatch.map((c) => `<i style="background:${c}"></i>`).join("")}</span>${t.name}</button>`).join("");
}

function render() {
  renderThemes();
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
  $("themes").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".theme-opt");
    if (!b) return;
    const id = b.dataset.themeId as ThemeChoice;
    setTheme(id);
    await updateSettings({ theme: id });
    renderThemes();
  });
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
        await reloadCards();
        app.settings = await store.loadSettings();
        render();
        note(`Загружено карточек: ${n}.`);
      } catch (err) {
        note(err instanceof Error ? err.message : "Не удалось прочитать файл.", true);
      }
    });
  });
  $("reset").addEventListener("click", () => confirmBox("Удалить весь прогресс? Настройки останутся.", "Удалить", async () => {
    await store.resetProgress();
    await reloadCards();
    render();
    note("Прогресс удалён.");
  }));
}
