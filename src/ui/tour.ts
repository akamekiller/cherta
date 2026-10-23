/**
 * Обучение с пандой. При первом запуске панда спрашивает, нужно ли оно; если да — сама открывает разделы
 * (Слова → Карточки → Тетрадь → Упражнения → Чтение → Настройки), подсвечивает нужное место и объясняет.
 * Можно вернуться на шаг, пропустить раздел или закрыть. Повтор — Настройки → «О приложении».
 * Все слушатели снимаются при закрытии (утечки слушателей уже стоили лагов в письме).
 */
import { tourSteps, sectionsOf, sectionIndex, nextSectionStart, type TourStep } from "../core/tour.ts";
import { pandaSvg } from "./panda.ts";
import { appLang } from "../state.ts";
import { esc } from "./dom.ts";
import { show, currentView } from "./nav.ts";

const LS = "cherta.tour";
const get = () => { try { return localStorage.getItem(LS); } catch { return "1"; } };
const mark = () => { try { localStorage.setItem(LS, "1"); } catch { /* */ } };

/** Приглашение ещё не показывалось (где нельзя сохранить флаг, не навязываем). */
export const tourPending = () => get() === null;

let root: HTMLElement | null = null;
let undo: (() => void)[] = [];
let token = 0;

/** Закрыть, если открыто (для кнопки «Назад» и Esc). */
export function closeTour(): boolean {
  if (!root) return false;
  token++;
  undo.forEach((f) => f()); undo = [];
  root.remove(); root = null;
  mark();
  return true;
}
const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeTour(); };

function mount(cls: string): HTMLElement {
  closeTour();
  const el = document.createElement("div");
  el.className = cls;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  document.body.append(el);
  root = el;
  document.addEventListener("keydown", onKey);
  undo.push(() => document.removeEventListener("keydown", onKey));
  return el;
}

/** Первый вопрос: нужно ли обучение. */
export function openInvite() {
  const el = mount("tour");
  el.setAttribute("aria-label", "Обучение по приложению");
  mark(); // спросили один раз — что бы ни ответили
  el.innerHTML = `<div class="tour-scrim" data-no></div>
    <div class="tour-card">
      <div class="tour-pd">${pandaSvg("hello", 150)}</div>
      <h2>Привет! Я панда-помощница</h2>
      <p>Хотите пройти короткое обучение? Я сама открою разделы и покажу, где что находится. Это займёт пару минут, пропустить можно в любой момент.</p>
      <div class="tour-btns"><button class="btn ghost" data-no>Не сейчас</button><button class="btn primary" data-yes>Да, покажи</button></div>
      <p class="hint tour-sub">Обучение всегда можно запустить в Настройках → «О приложении».</p>
    </div>`;
  el.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => closeTour()));
  el.querySelector("[data-yes]")!.addEventListener("click", () => openTour());
  el.querySelector<HTMLElement>("[data-yes]")!.focus({ preventScroll: true });
}

const visible = (e: Element) => (e as HTMLElement).getClientRects().length > 0;
/** Ждём, пока после смены экрана появится нужный элемент (экраны рисуются асинхронно). */
function waitFor(sels: string[], my: number, limit = 2500): Promise<HTMLElement | null> {
  return new Promise((res) => {
    const t0 = Date.now();
    const tick = () => {
      if (my !== token) return res(null);
      for (const s of sels) { const e = document.querySelector<HTMLElement>(s); if (e && visible(e)) return res(e); }
      if (Date.now() - t0 > limit) return res(null);
      setTimeout(tick, 90);
    };
    tick();
  });
}

/** Само обучение. */
export function openTour() {
  const steps = tourSteps(appLang());
  const secs = sectionsOf(steps);
  const el = mount("guide");
  el.setAttribute("aria-label", "Обучение по приложению");
  el.innerHTML = `<div class="gd-block"></div><div class="gd-spot" hidden></div><div class="gd-bubble"></div>`;
  const spot = el.querySelector<HTMLElement>(".gd-spot")!;
  const bubble = el.querySelector<HTMLElement>(".gd-bubble")!;
  let i = 0, cur: HTMLElement | null = null;

  const place = () => {
    if (!cur) { spot.hidden = true; bubble.classList.remove("top"); return; }
    const r = cur.getBoundingClientRect(), pad = 6;
    const top = Math.max(4, r.top - pad), bottom = Math.min(innerHeight - 4, r.bottom + pad);
    spot.hidden = false;
    spot.style.left = `${Math.max(4, r.left - pad)}px`;
    spot.style.top = `${top}px`;
    spot.style.width = `${Math.min(innerWidth - 8, r.width + pad * 2)}px`;
    spot.style.height = `${Math.max(24, bottom - top)}px`;
    // реплика — на той половине экрана, где нет подсветки
    bubble.classList.toggle("top", (top + bottom) / 2 > innerHeight * 0.5 && bottom - top < innerHeight * 0.55);
  };
  const onResize = () => place();
  addEventListener("resize", onResize);
  undo.push(() => removeEventListener("resize", onResize));

  const draw = (s: TourStep) => {
    const last = i === steps.length - 1, hasNext = nextSectionStart(steps, i) !== -1;
    bubble.innerHTML = `<button class="icon-btn gd-x" data-close aria-label="Закрыть обучение">✕</button>
      <div class="gd-pd">${pandaSvg(s.pose, 78)}</div>
      <div class="gd-tx"><div class="gd-sec">Раздел ${sectionIndex(steps, i) + 1} из ${secs.length} · ${esc(s.section)}</div><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>
      <div class="gd-btns">${i > 0 ? `<button class="btn small ghost" data-prev aria-label="Назад">‹</button>` : ""}${hasNext ? `<button class="btn small ghost" data-skip>Пропустить раздел</button>` : ""}<button class="btn small primary" data-next>${last ? "Готово" : "Дальше"}</button></div>`;
    bubble.querySelector("[data-close]")!.addEventListener("click", () => closeTour());
    bubble.querySelector("[data-prev]")?.addEventListener("click", () => void go(i - 1, -1));
    bubble.querySelector("[data-skip]")?.addEventListener("click", () => void go(nextSectionStart(steps, i)));
    bubble.querySelector("[data-next]")!.addEventListener("click", () => { if (last) { closeTour(); show("words"); } else void go(i + 1); });
    bubble.querySelector<HTMLElement>("[data-next]")!.focus({ preventScroll: true });
  };

  async function go(k: number, dir = 1) {
    if (k < 0 || k >= steps.length) return;
    i = k;
    const s = steps[k], my = ++token;
    cur = null;
    el.classList.toggle("dim", !s.target);
    spot.hidden = true;
    if (currentView() !== s.view) show(s.view);
    let t: HTMLElement | null = null;
    if (s.target && s.optional) {
      // шаг только если есть что показать (например, цель дня видна, когда есть колоды): проверяем до реплики
      t = await waitFor(s.target, my, 600);
      if (my !== token) return;
      if (!t) { void go(k + dir, dir); return; }
      draw(s);
    } else {
      draw(s);
      if (!s.target) { place(); return; }
      t = await waitFor(s.target, my);
      if (my !== token) return;
    }
    cur = t;
    el.classList.toggle("dim", !t);
    t?.scrollIntoView({ block: "center" });
    requestAnimationFrame(() => { if (my === token) place(); });
    setTimeout(() => { if (my === token) place(); }, 250); // после прокрутки и дорисовки экрана
  }
  void go(0);
}

/** При запуске: один раз спросить, нужно ли обучение. */
export function initTour() {
  if (tourPending()) setTimeout(openInvite, 900);
}
