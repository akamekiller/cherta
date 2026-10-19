/** Панель снизу (bottom sheet) — общий контейнер для редакторов всех модулей. */
import { $, esc } from "./dom.ts";

let onClose: (() => void) | null = null;

export function openSheet(title: string, body: string, mount?: (root: HTMLElement) => void, closed?: () => void) {
  $("sheet-title").textContent = title;
  // каждый раз новый контейнер: иначе обработчики прошлых открытий копятся и один тап срабатывает дважды
  const old = $("sheet-body");
  const root = old.cloneNode(false) as HTMLElement;
  old.replaceWith(root);
  root.innerHTML = body;
  onClose = closed ?? null;
  $("sheet-scrim").hidden = false;
  $("sheet").hidden = false;
  requestAnimationFrame(() => { $("sheet-scrim").classList.add("open"); $("sheet").classList.add("open"); });
  mount?.(root);
  root.querySelector<HTMLElement>("input,textarea")?.focus({ preventScroll: true });
}

export function closeSheet() {
  const s = $("sheet");
  if (s.hidden) return;
  s.classList.remove("open");
  $("sheet-scrim").classList.remove("open");
  setTimeout(() => { s.hidden = true; $("sheet-scrim").hidden = true; }, 200);
  const f = onClose; onClose = null; f?.();
}

/** Подтверждение внутри панели (confirm() в браузере не всегда доступен). */
export function confirmInline(host: HTMLElement, question: string, yes: string, onYes: () => void) {
  host.hidden = false;
  host.innerHTML = `<span>${esc(question)}</span><button class="btn small danger" data-yes>${esc(yes)}</button><button class="btn small" data-no>Отмена</button>`;
  host.querySelector("[data-yes]")!.addEventListener("click", () => { host.hidden = true; onYes(); });
  host.querySelector("[data-no]")!.addEventListener("click", () => { host.hidden = true; });
}

export function initSheet() {
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet-scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
}
