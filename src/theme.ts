/**
 * Темы оформления: готовые (Авто, Светлая, Тёмная, Чёрная) и своя.
 * Выбор хранится в настройках и дублируется в localStorage, чтобы встроенный скрипт в <head>
 * применил тему до отрисовки (без вспышки). Своя тема — набор цветов поверх одной из готовых.
 */
export type ThemeChoice = "auto" | "light" | "dark" | "black" | "custom";
type Preset = "light" | "dark" | "black";

/** Цвета, которые можно менять в редакторе. */
export const EDITABLE = [
  ["paper", "Фон"],
  ["sheet", "Карточки и панели"],
  ["ink", "Основной текст"],
  ["muted", "Подписи и второстепенный текст"],
  ["line", "Линии и рамки"],
  ["jade", "Акцент: кнопки, выделение"],
  ["grid", "Сетка клетки для письма"],
  ["t1", "1-й тон"],
  ["t2", "2-й тон"],
  ["t3", "3-й тон"],
  ["t4", "4-й тон"],
] as const;
export type ColorKey = (typeof EDITABLE)[number][0];
export type CustomTheme = { base: Preset; colors: Record<ColorKey, string>; radius: number };

export const PRESETS: Record<Preset, Record<ColorKey, string>> = {
  light: { paper: "#F2F4F2", sheet: "#FFFFFF", ink: "#18201E", muted: "#5E6A66", line: "#DCE2DF", jade: "#1E7A60", grid: "#D9705F", t1: "#D23B33", t2: "#D98A12", t3: "#2E9447", t4: "#2F6FD1" },
  dark: { paper: "#111615", sheet: "#1A2120", ink: "#E7ECEA", muted: "#97A39F", line: "#2B3533", jade: "#4CC59E", grid: "#B55A4C", t1: "#F0625A", t2: "#F0A940", t3: "#54C06E", t4: "#6F9FF0" },
  black: { paper: "#000000", sheet: "#0E0E0E", ink: "#F2F2F2", muted: "#8C8C8C", line: "#262626", jade: "#EDEDED", grid: "#4A4A4A", t1: "#F0625A", t2: "#F0A940", t3: "#54C06E", t4: "#6F9FF0" },
};

export const THEMES: { id: ThemeChoice; name: string; swatch: [string, string, string] }[] = [
  { id: "auto", name: "Авто", swatch: ["#F2F4F2", "#111615", "#1E7A60"] },
  { id: "light", name: "Светлая", swatch: ["#F2F4F2", "#FFFFFF", "#1E7A60"] },
  { id: "dark", name: "Тёмная", swatch: ["#111615", "#1A2120", "#4CC59E"] },
  { id: "black", name: "Чёрная", swatch: ["#000000", "#0E0E0E", "#EDEDED"] },
];

const LS_KEY = "cherta.theme";
const LS_CUSTOM = "cherta.custom";
const dark = matchMedia("(prefers-color-scheme: dark)");
let choice: ThemeChoice = "auto";
let custom: CustomTheme | null = null;
let listeners: (() => void)[] = [];

/* ---------- цвет ---------- */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: number[]) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Все токены темы из редактируемых цветов: производные считаются автоматически. */
export function tokensFor(t: CustomTheme): Record<string, string> {
  const c = t.colors;
  const isDark = luminance(c.paper) < 0.18;
  return {
    ...Object.fromEntries(Object.entries(c).map(([k, v]) => [`--${k}`, v])),
    "--outline": mix(c.line, c.sheet, 0.35),
    "--jade-soft": mix(c.sheet, c.jade, isDark ? 0.18 : 0.12),
    "--on-accent": contrast(c.jade, "#000000") >= contrast(c.jade, "#FFFFFF") ? "#000000" : "#FFFFFF",
    "--good": c.t3,
    "--t5": c.muted,
    "--r": `${t.radius}px`,
    "color-scheme": isDark ? "dark" : "light",
  };
}

/* ---------- применение ---------- */

function resolved(): Preset | "custom" {
  if (choice === "custom") return custom ? "custom" : "black";
  return choice === "auto" ? (dark.matches ? "dark" : "light") : choice;
}

const STYLE_PROPS = [...EDITABLE.map(([k]) => `--${k}`), "--outline", "--jade-soft", "--on-accent", "--good", "--t5", "--r", "color-scheme"];

function apply() {
  const root = document.documentElement;
  const r = resolved();
  for (const p of STYLE_PROPS) root.style.removeProperty(p);
  if (r === "custom" && custom) {
    root.dataset.theme = custom.base;
    for (const [k, v] of Object.entries(tokensFor(custom))) root.style.setProperty(k, v);
  } else {
    root.dataset.theme = r;
  }
  const bg = getComputedStyle(root).getPropertyValue("--paper").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = bg;
  document.head.appendChild(meta);
  listeners.forEach((f) => f());
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, choice);
    if (custom) localStorage.setItem(LS_CUSTOM, JSON.stringify(tokensForHead(custom)));
    else localStorage.removeItem(LS_CUSTOM);
  } catch { /* приватный режим */ }
}
/** Для встроенного скрипта в <head>: база + готовые CSS-переменные. */
const tokensForHead = (t: CustomTheme) => ({ base: t.base, vars: tokensFor(t) });

export function setTheme(c: ThemeChoice, customTheme?: CustomTheme | null) {
  choice = c === "custom" || THEMES.some((t) => t.id === c) ? c : "auto";
  if (customTheme !== undefined) custom = customTheme;
  persist();
  apply();
}

/** Временный показ темы при редактировании, без сохранения. */
export function previewCustom(t: CustomTheme) {
  const saved = { choice, custom };
  choice = "custom"; custom = t;
  apply();
  choice = saved.choice; custom = saved.custom;
}
export const restoreTheme = () => apply();

export const customTheme = () => custom;
export function currentPreset(): Preset {
  const r = resolved();
  return r === "custom" ? custom!.base : r;
}
export function newCustomFrom(base: Preset): CustomTheme {
  return { base, colors: { ...PRESETS[base] }, radius: 14 };
}
export function onThemeChange(f: () => void) { listeners.push(f); }

dark.addEventListener("change", () => { if (choice === "auto") apply(); });
