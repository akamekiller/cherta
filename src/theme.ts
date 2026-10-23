/**
 * Темы оформления: готовые (Авто, Светлая, Тёмная, Чёрная) и своя.
 * Выбор хранится в настройках и дублируется в localStorage, чтобы встроенный скрипт в <head>
 * применил тему до отрисовки (без вспышки). Своя тема — набор цветов поверх одной из готовых.
 */
import { nativeBars } from "./native.ts";
export type ThemeChoice = "auto" | "light" | "dark" | "black" | "sakura" | "yoru" | "shuimo" | "deng" | "ketsu" | "kami" | "yun" | "custom";
export type Preset = "light" | "dark" | "black" | "sakura" | "yoru" | "shuimo" | "deng" | "ketsu" | "kami" | "yun";
/** Темы с живым фоном (src/ui/ambient.ts): японские — сакура и ночь, китайские — тушь и фонари. */
export const ANIMATED: Preset[] = ["sakura", "yoru", "shuimo", "deng", "ketsu", "yun"];

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
  sakura: { paper: "#F8F1EF", sheet: "#FFFFFF", ink: "#2B2024", muted: "#76666B", line: "#EBDCDC", jade: "#B03A5B", grid: "#D98A9A", t1: "#D23B33", t2: "#D98A12", t3: "#2E9447", t4: "#2F6FD1" },
  yoru: { paper: "#0E1324", sheet: "#161C32", ink: "#E9E7F2", muted: "#9DA0BA", line: "#262D48", jade: "#E9B860", grid: "#7E6A9E", t1: "#F0625A", t2: "#F0A940", t3: "#54C06E", t4: "#7FA8F5" },
  shuimo: { paper: "#F2EDE3", sheet: "#FBF8F1", ink: "#1F1C19", muted: "#6B645B", line: "#E0D8C8", jade: "#A8322D", grid: "#C46A4F", t1: "#C9302A", t2: "#C77F12", t3: "#2E8A45", t4: "#2F64C0" },
  deng: { paper: "#170D0C", sheet: "#241514", ink: "#F4E8DC", muted: "#B79F8F", line: "#3D2523", jade: "#EDA93E", grid: "#A14C3C", t1: "#F0625A", t2: "#F0B04A", t3: "#5CC274", t4: "#79A4F2" },
  ketsu: { paper: "#1B1819", sheet: "#252122", ink: "#E4DCD3", muted: "#A89E97", line: "#3A3334", jade: "#B9514F", grid: "#7A4A48", t1: "#E5746C", t2: "#E0A25A", t3: "#7FB48A", t4: "#8EA9D6" },
  yun: { paper: "#E6E6E3", sheet: "#F4F4F2", ink: "#1C1C1B", muted: "#62625F", line: "#CFCFCB", jade: "#7D5A0E", grid: "#9A8F7E", t1: "#C0392F", t2: "#B8760F", t3: "#2E7D46", t4: "#2F62B5" },
  kami: { paper: "#EFE6D3", sheet: "#F8F2E4", ink: "#2A211C", muted: "#7B6D60", line: "#D9CBB0", jade: "#B8322A", grid: "#C98E7C", t1: "#C0392F", t2: "#C27A12", t3: "#3A8A4C", t4: "#3567B5" },
  black: { paper: "#000000", sheet: "#0E0E0E", ink: "#F2F2F2", muted: "#8C8C8C", line: "#262626", jade: "#EDEDED", grid: "#4A4A4A", t1: "#F0625A", t2: "#F0A940", t3: "#54C06E", t4: "#6F9FF0" },
};

export const THEMES: { id: ThemeChoice; name: string; swatch: [string, string, string] }[] = [
  { id: "auto", name: "Авто", swatch: ["#F2F4F2", "#111615", "#1E7A60"] },
  { id: "light", name: "Светлая", swatch: ["#F2F4F2", "#FFFFFF", "#1E7A60"] },
  { id: "dark", name: "Тёмная", swatch: ["#111615", "#1A2120", "#4CC59E"] },
  { id: "black", name: "Чёрная", swatch: ["#000000", "#0E0E0E", "#EDEDED"] },
  { id: "sakura", name: "Сакура", swatch: ["#F8F1EF", "#F2B8C6", "#B03A5B"] },
  { id: "yoru", name: "Ночь", swatch: ["#0E1324", "#161C32", "#E9B860"] },
  { id: "shuimo", name: "Тушь", swatch: ["#F2EDE3", "#B8B0A2", "#A8322D"] },
  { id: "deng", name: "Фонари", swatch: ["#170D0C", "#7A1E1A", "#EDA93E"] },
  { id: "kami", name: "Бумага", swatch: ["#EFE6D3", "#F8F2E4", "#B8322A"] },
  { id: "yun", name: "Золотое облако", swatch: ["#E6E6E3", "#8E8E8A", "#C99A2E"] },
  { id: "ketsu", name: "Кровь", swatch: ["#1B1819", "#4A2A2B", "#B9514F"] },
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
  nativeBars(bg);
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
