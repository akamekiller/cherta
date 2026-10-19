/** Экраны и боковое меню (кнопка ☰). */
export type View = "home" | "deck" | "session" | "done" | "words" | "detail" | "book" | "ex" | "read" | "hsk" | "tones" | "stats" | "settings";
const VIEWS: View[] = ["home", "deck", "session", "done", "words", "detail", "book", "ex", "read", "hsk", "tones", "stats", "settings"];
const SECTION: Record<View, string> = { home: "home", deck: "home", session: "home", done: "home", words: "words", detail: "words", book: "book", ex: "ex", read: "read", hsk: "hsk", tones: "tones", stats: "stats", settings: "settings" };
const TITLE: Record<string, string> = { home: "Карточки", words: "Слова", book: "Тетрадь прописей", ex: "Упражнения", read: "Чтение", hsk: "Экзамен HSK", tones: "Тоны", stats: "Статистика", settings: "Настройки" };

const handlers: Partial<Record<View, () => void>> = {};
const leaveHandlers: Partial<Record<View, () => void>> = {};
let current: View = "words";

export function onShow(v: View, f: () => void) { handlers[v] = f; }
/** Перерисовать текущий экран (например, после синхронизации). Занятие не трогаем. */
export function rerender() { if (current !== "session") handlers[current]?.(); }
export function onLeave(v: View, f: () => void) { leaveHandlers[v] = f; }

export function show(v: View) {
  if (current !== v) leaveHandlers[current]?.();
  current = v;
  for (const x of VIEWS) document.getElementById(x)!.hidden = x !== v;
  const section = SECTION[v];
  document.querySelectorAll<HTMLButtonElement>(".dr-item[data-view]").forEach((b) =>
    b.setAttribute("aria-current", b.dataset.view === section ? "page" : "false"));
  document.getElementById("view-title")!.textContent = TITLE[section];
  closeMenu();
  window.scrollTo(0, 0);
  handlers[v]?.();
}

const drawer = () => document.getElementById("drawer")!;
const scrim = () => document.getElementById("scrim")!;
const menuBtn = () => document.getElementById("menu-btn")!;

export function openMenu() {
  scrim().hidden = false;
  requestAnimationFrame(() => { scrim().classList.add("open"); drawer().classList.add("open"); });
  drawer().setAttribute("aria-hidden", "false");
  menuBtn().setAttribute("aria-expanded", "true");
  drawer().querySelector<HTMLElement>('.dr-item[aria-current="page"]')?.focus({ preventScroll: true });
}

export function closeMenu() {
  if (!drawer().classList.contains("open")) return;
  drawer().classList.remove("open");
  scrim().classList.remove("open");
  drawer().setAttribute("aria-hidden", "true");
  menuBtn().setAttribute("aria-expanded", "false");
  setTimeout(() => { if (!drawer().classList.contains("open")) scrim().hidden = true; }, 220);
}

export function initNav() {
  menuBtn().addEventListener("click", () => (drawer().classList.contains("open") ? closeMenu() : openMenu()));
  scrim().addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  document.querySelectorAll<HTMLButtonElement>(".dr-item[data-view]").forEach((b) =>
    b.addEventListener("click", () => show(b.dataset.view as View)));
  // свайп влево закрывает меню
  let x0: number | null = null;
  drawer().addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  drawer().addEventListener("touchend", (e) => {
    if (x0 !== null && x0 - e.changedTouches[0].clientX > 60) closeMenu();
    x0 = null;
  });
}
