/** Короткая экскурсия при первом запуске (6 шагов, можно пропустить) и повтор из настроек. */
import { tourSteps, stepLabel } from "../core/tour.ts";
import { pandaSvg } from "./panda.ts";
import { appLang } from "../state.ts";
import { esc } from "./dom.ts";
import { show } from "./nav.ts";

const LS = "cherta.tour";
const get = () => { try { return localStorage.getItem(LS); } catch { return "1"; } };
const mark = () => { try { localStorage.setItem(LS, "1"); } catch { /* */ } };

/** Экскурсия ещё не показывалась (на устройстве, где нельзя сохранить флаг, не навязываем). */
export const tourPending = () => get() === null;

let root: HTMLElement | null = null;
let prevFocus: HTMLElement | null = null;

/** Закрыть, если открыта (для кнопки «Назад»). */
export function closeTour(): boolean {
  if (!root) return false;
  root.remove(); root = null;
  document.removeEventListener("keydown", onKey);
  mark();
  prevFocus?.focus?.({ preventScroll: true });
  return true;
}
function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeTour(); }

export function openTour() {
  closeTour();
  const steps = tourSteps(appLang());
  let i = 0;
  prevFocus = document.activeElement as HTMLElement | null;
  const el = document.createElement("div");
  el.className = "tour";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Экскурсия по приложению");
  root = el;
  document.body.append(el);
  document.addEventListener("keydown", onKey);

  const draw = () => {
    const s = steps[i], last = i === steps.length - 1;
    el.innerHTML = `<div class="tour-scrim" data-skip></div>
      <div class="tour-card">
        <div class="tour-pd">${pandaSvg(s.pose, 150)}</div>
        <div class="tour-n">${stepLabel(i, steps.length)}</div>
        <h2>${esc(s.title)}</h2>
        <p>${esc(s.text)}</p>
        <div class="tour-dots" aria-hidden="true">${steps.map((_, k) => `<span${k === i ? ' class="on"' : ""}></span>`).join("")}</div>
        ${s.go ? `<button class="btn small ghost" data-go>${esc(s.goLabel ?? "Открыть")}</button>` : ""}
        <div class="tour-btns">
          ${last ? "" : `<button class="btn ghost" data-skip>Пропустить</button>`}
          <button class="btn primary" data-next>${last ? "Начать" : "Дальше"}</button>
        </div>
      </div>`;
    el.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", () => closeTour()));
    el.querySelector("[data-next]")!.addEventListener("click", () => { if (last) closeTour(); else { i++; draw(); } });
    el.querySelector("[data-go]")?.addEventListener("click", () => { const v = s.go!; closeTour(); show(v); });
    el.querySelector<HTMLElement>("[data-next]")!.focus({ preventScroll: true });
  };
  draw();
}

/** При запуске: один раз показать экскурсию. */
export function initTour() {
  if (tourPending()) setTimeout(openTour, 900);
}
