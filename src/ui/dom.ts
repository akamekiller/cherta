import { mark, type Syllable } from "../core/pinyin.ts";

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Нет элемента #${id}`);
  return el as T;
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Пиньинь со знаками, раскрашенный по тонам; per[i] = false подчёркивает неверный слог. */
export function pinyinHTML(ref: Syllable[], per?: boolean[]): string {
  return ref.map((x, i) => `<span class="s t${x.t}${per && !per[i] ? " wrong" : ""}">${mark(x.s, x.t)}</span>`).join(" ");
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
