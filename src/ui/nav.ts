export type View = "home" | "session" | "done" | "words" | "detail" | "settings";
const VIEWS: View[] = ["home", "session", "done", "words", "detail", "settings"];
const TAB: Record<View, string> = { home: "home", session: "home", done: "home", words: "words", detail: "words", settings: "settings" };

const handlers: Partial<Record<View, () => void>> = {};
const leaveHandlers: Partial<Record<View, () => void>> = {};
let current: View = "home";

export function onShow(v: View, f: () => void) { handlers[v] = f; }
export function onLeave(v: View, f: () => void) { leaveHandlers[v] = f; }

export function show(v: View) {
  if (current !== v) leaveHandlers[current]?.();
  current = v;
  for (const x of VIEWS) document.getElementById(x)!.hidden = x !== v;
  document.querySelectorAll<HTMLButtonElement>("nav button").forEach((b) =>
    b.setAttribute("aria-current", b.dataset.view === TAB[v] ? "page" : "false"));
  window.scrollTo(0, 0);
  handlers[v]?.();
}

export const currentView = () => current;

export function initNav() {
  document.querySelectorAll<HTMLButtonElement>("nav button").forEach((b) =>
    b.addEventListener("click", () => show(b.dataset.view as View)));
}
