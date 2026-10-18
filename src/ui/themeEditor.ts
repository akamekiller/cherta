/** Редактор своей темы: цвета, скругление, предпросмотр, проверка читаемости. */
import { app, updateSettings } from "../state.ts";
import {
  EDITABLE, PRESETS, THEMES, contrast, currentPreset, customTheme, newCustomFrom, previewCustom, restoreTheme, setTheme,
  type ColorKey, type CustomTheme, type ThemeChoice,
} from "../theme.ts";
import { esc } from "./dom.ts";
import { openSheet, closeSheet } from "./sheet.ts";

const BASES: [keyof typeof PRESETS, string][] = [["light", "Светлая"], ["dark", "Тёмная"], ["black", "Чёрная"]];

export function renderThemeChoices(host: HTMLElement) {
  const c = app.settings.custom;
  const list = [...THEMES, ...(c ? [{ id: "custom" as ThemeChoice, name: "Своя", swatch: [c.colors.paper, c.colors.sheet, c.colors.jade] as [string, string, string] }] : [])];
  host.style.gridTemplateColumns = `repeat(${list.length},1fr)`;
  host.innerHTML = list.map((t) => `<button class="theme-opt" data-theme-id="${t.id}" aria-pressed="${app.settings.theme === t.id}">
    <span class="swatch" aria-hidden="true">${t.swatch.map((x) => `<i style="background:${x}"></i>`).join("")}</span>${t.name}</button>`).join("");
}

export function openThemeEditor(done: () => void) {
  let t: CustomTheme = structuredClone(customTheme() ?? app.settings.custom ?? newCustomFrom(currentPreset()));
  let saved = false;

  const rows = EDITABLE.map(([k, label]) => `
    <label class="color-row"><span>${esc(label)}</span>
      <span class="color-in"><input type="color" data-key="${k}" value="${t.colors[k]}" aria-label="${esc(label)}"><input class="hex" data-hex="${k}" value="${t.colors[k]}" maxlength="7" spellcheck="false" autocapitalize="off" aria-label="${esc(label)}, код цвета"></span>
    </label>`).join("");

  const body = `
    <div class="field"><span class="label">Основа</span>
      <div class="chips-row" id="te-base">${BASES.map(([id, n]) => `<button class="chip-btn" data-base="${id}" aria-pressed="${t.base === id}">${n}</button>`).join("")}</div>
      <small class="hint">Выбор основы сбрасывает цвета к этой теме.</small></div>
    <div class="te-preview" aria-hidden="true">
      <div class="te-card"><span class="te-han">学习</span><span class="te-py"><span class="t2">xué</span> <span class="t2">xí</span> · <span class="t1">mā</span> <span class="t3">mǎ</span> <span class="t4">mà</span></span>
        <span class="te-ru">учиться, изучать</span><span class="te-btn">Начать занятие</span></div>
    </div>
    <p class="note" id="te-warn"></p>
    <div class="color-list">${rows}</div>
    <label class="field"><span class="label">Скругление углов: <b id="te-r-val">${t.radius}</b> px</span>
      <input type="range" id="te-radius" min="0" max="24" step="1" value="${t.radius}"></label>
    <div class="row sticky-actions">
      <button class="btn primary" id="te-save">Сохранить тему</button>
      <button class="btn" id="te-cancel">Отмена</button>
    </div>`;

  openSheet("Свои цвета", body, (root) => {
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const sync = () => {
      for (const [k] of EDITABLE) {
        q<HTMLInputElement>(`[data-key="${k}"]`).value = t.colors[k];
        q<HTMLInputElement>(`[data-hex="${k}"]`).value = t.colors[k];
      }
      q<HTMLInputElement>("#te-radius").value = String(t.radius);
      q("#te-r-val").textContent = String(t.radius);
      root.querySelectorAll<HTMLButtonElement>("[data-base]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.base === t.base)));
    };
    const update = () => {
      previewCustom(t);
      const c = t.colors;
      const warn: string[] = [];
      if (contrast(c.ink, c.paper) < 4.5 || contrast(c.ink, c.sheet) < 4.5) warn.push("основной текст плохо читается на фоне");
      if (contrast(c.muted, c.sheet) < 3) warn.push("подписи почти не видны");
      if (contrast(c.jade, c.sheet) < 2) warn.push("акцент сливается с карточками");
      const w = q("#te-warn");
      w.textContent = warn.length ? `Внимание: ${warn.join(", ")}.` : "";
      w.classList.toggle("danger", warn.length > 0);
    };
    root.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.key) {
        t.colors[el.dataset.key as ColorKey] = el.value;
        q<HTMLInputElement>(`[data-hex="${el.dataset.key}"]`).value = el.value;
      } else if (el.dataset.hex) {
        const v = el.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(v)) {
          t.colors[el.dataset.hex as ColorKey] = v.toUpperCase();
          q<HTMLInputElement>(`[data-key="${el.dataset.hex}"]`).value = v;
        } else return;
      } else if (el.id === "te-radius") {
        t.radius = Number(el.value);
        q("#te-r-val").textContent = el.value;
      } else return;
      update();
    });
    q("#te-base").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-base]");
      if (!b) return;
      t = { ...newCustomFrom(b.dataset.base as keyof typeof PRESETS), radius: t.radius };
      sync(); update();
    });
    q("#te-save").addEventListener("click", async () => {
      saved = true;
      setTheme("custom", t);
      await updateSettings({ theme: "custom", custom: t });
      closeSheet();
      done();
    });
    q("#te-cancel").addEventListener("click", closeSheet);
    update();
  }, () => { if (!saved) restoreTheme(); });
}
