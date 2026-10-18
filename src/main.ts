import { init } from "./state.ts";
import { requestPersist } from "./store.ts";
import { $ } from "./ui/dom.ts";
import { initNav, show } from "./ui/nav.ts";
import { initHome } from "./ui/home.ts";
import { initSession, sessionWriter } from "./ui/session.ts";
import { initWords } from "./ui/words.ts";
import { initEntry, entryWriter } from "./ui/entry.ts";
import { initSettings, penWriter } from "./ui/settings.ts";
import { recolor, setPen } from "./ui/writer.ts";
import { initSheet } from "./ui/sheet.ts";
import { setTheme, onThemeChange } from "./theme.ts";
import { app } from "./state.ts";
import { loadRecorded } from "./speech.ts";

async function boot() {
  initNav();
  initSheet();
  initHome();
  initSession();
  initWords();
  initEntry();
  initSettings();
  try {
    await init();
  } catch (e) {
    $("boot-error").hidden = false;
    $("boot-error").textContent = `Не удалось запустить: ${e instanceof Error ? e.message : e}. Обновите страницу.`;
    return;
  }
  setTheme(app.settings.theme, app.settings.custom ?? null);
  setPen(app.settings.pen, app.settings.ink, app.settings.keepStrokes);
  onThemeChange(() => recolor([sessionWriter(), entryWriter(), penWriter()]));
  show("home");
  requestPersist();
  loadRecorded();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* офлайн необязателен */ });
  }
}

boot();
