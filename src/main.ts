import { init } from "./state.ts";
import { requestPersist } from "./store.ts";
import { $ } from "./ui/dom.ts";
import { initNav, show, rerender } from "./ui/nav.ts";
import { initHome } from "./ui/home.ts";
import { initSession, sessionWriter } from "./ui/session.ts";
import { initWords } from "./ui/words.ts";
import { initEntry, entryWriter } from "./ui/entry.ts";
import { initBook, bookWriter } from "./ui/book.ts";
import { initStats } from "./ui/stats.ts";
import { initExercise } from "./ui/exercise.ts";
import { initTones } from "./ui/tones.ts";
import { initReading } from "./ui/reading.ts";
import { initSync, autoSync } from "./ui/sync.ts";
import { initRemind } from "./ui/remind.ts";
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
  initBook();
  initStats();
  initExercise();
  initTones();
  initReading();
  initSettings();
  try {
    await init();
  } catch (e) {
    $("boot-error").hidden = false;
    $("boot-error").textContent = `Не удалось запустить: ${e instanceof Error ? e.message : e}. Обновите страницу.`;
    return;
  }
  setTheme(app.settings.theme, app.settings.custom ?? null);
  setPen(app.settings.pen, app.settings.ink, app.settings.keepStrokes, app.settings.penSize);
  onThemeChange(() => recolor([sessionWriter(), entryWriter(), bookWriter(), penWriter()]));
  show("words");
  initSync();
  initRemind();
  // при запуске — тихая синхронизация; если что-то пришло с другого устройства, перерисовать экран
  autoSync().then((changed) => { if (changed) rerender(); });
  requestPersist();
  loadRecorded();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* офлайн необязателен */ });
  }
}

boot();
