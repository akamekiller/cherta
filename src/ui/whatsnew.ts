import { CHANGES, unseen, type Change } from "../core/changelog.ts";
import { openSheet } from "./sheet.ts";
import { esc } from "./dom.ts";

const LS = "cherta.seenChange";
const get = () => { try { return localStorage.getItem(LS); } catch { return null; } };
const set = (v: string) => { try { localStorage.setItem(LS, v); } catch { /* */ } };

function html(list: Change[]): string {
  return list.map((c) => `<div class="stack"><div class="label">${esc(c.date)}</div><h3 style="margin:0">${esc(c.title)}</h3>
    <ul class="lic">${c.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
}

/** Показать сводку (из настроек — всю). */
export function openWhatsNew(all = true) {
  openSheet("Что нового", html(all ? CHANGES : unseen(get())));
  set(CHANGES[0].id);
}

/** При запуске: после обновления — один раз показать, что изменилось; на первом запуске просто запомнить. */
export function initWhatsNew() {
  const seen = get();
  if (seen === null) { set(CHANGES[0].id); return; }
  if (unseen(seen).length) setTimeout(() => openWhatsNew(false), 1200);
}
