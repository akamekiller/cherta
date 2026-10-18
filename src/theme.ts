/**
 * Темы оформления. Выбор хранится в настройках и дублируется в localStorage,
 * чтобы встроенный скрипт в <head> применил тему до отрисовки (без вспышки).
 */
export type ThemeChoice = "auto" | "light" | "dark" | "black";
export const THEMES: { id: ThemeChoice; name: string; swatch: [string, string, string] }[] = [
  { id: "auto", name: "Авто", swatch: ["#F2F4F2", "#111615", "#1E7A60"] },
  { id: "light", name: "Светлая", swatch: ["#F2F4F2", "#FFFFFF", "#1E7A60"] },
  { id: "dark", name: "Тёмная", swatch: ["#111615", "#1A2120", "#4CC59E"] },
  { id: "black", name: "Чёрная", swatch: ["#000000", "#0E0E0E", "#EDEDED"] },
];
const LS_KEY = "cherta.theme";
const dark = matchMedia("(prefers-color-scheme: dark)");
let choice: ThemeChoice = "auto";
let listeners: (() => void)[] = [];

function resolved(): "light" | "dark" | "black" {
  return choice === "auto" ? (dark.matches ? "dark" : "light") : choice;
}

function apply() {
  const t = resolved();
  document.documentElement.dataset.theme = t;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = bg;
  document.head.appendChild(meta);
  listeners.forEach((f) => f());
}

export function setTheme(c: ThemeChoice) {
  choice = THEMES.some((t) => t.id === c) ? c : "auto";
  try { localStorage.setItem(LS_KEY, choice); } catch { /* приватный режим */ }
  apply();
}

export const themeChoice = () => choice;
export function onThemeChange(f: () => void) { listeners.push(f); }

dark.addEventListener("change", () => { if (choice === "auto") apply(); });
