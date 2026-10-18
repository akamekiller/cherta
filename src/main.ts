import { init } from "./state.ts";
import { requestPersist } from "./store.ts";
import { $ } from "./ui/dom.ts";
import { initNav, show } from "./ui/nav.ts";
import { initHome } from "./ui/home.ts";
import { initSession, sessionWriter } from "./ui/session.ts";
import { initWords, wordsWriter } from "./ui/words.ts";
import { initSettings } from "./ui/settings.ts";
import { recolor } from "./ui/writer.ts";
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
  initSettings();
  try {
    await init();
  } catch (e) {
    $("boot-error").hidden = false;
    $("boot-error").textContent = `Не удалось запустить: ${e instanceof Error ? e.message : e}. Обновите страницу.`;
    return;
  }
  setTheme(app.settings.theme, app.settings.custom ?? null);
  onThemeChange(() => recolor([sessionWriter(), wordsWriter()]));
  show("home");
  requestPersist();
  loadRecorded();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* офлайн необязателен */ });
  }
}

boot();
