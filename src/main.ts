import { initLessonEnd } from "./ui/lessonend.ts";
import { init } from "./state.ts";
import { requestPersist } from "./store.ts";
import { $ } from "./ui/dom.ts";
import { initNav, show, rerender } from "./ui/nav.ts";
import { initMotion } from "./ui/motion.ts";
import { initHome, openDeck } from "./ui/home.ts";
import { openImport } from "./ui/import.ts";
import { initSession, sessionWriter } from "./ui/session.ts";
import { initWords } from "./ui/words.ts";
import { initEntry, entryWriter } from "./ui/entry.ts";
import { initBook, bookWriter } from "./ui/book.ts";
import { initStats } from "./ui/stats.ts";
import { initExercise } from "./ui/exercise.ts";
import { initTones } from "./ui/tones.ts";
import { initReading } from "./ui/reading.ts";
import { initHsk } from "./ui/hsk.ts";
import { initSync, autoSync } from "./ui/sync.ts";
import { initRemind } from "./ui/remind.ts";
import { initOffline, initLoadBar } from "./ui/offline.ts";
import { initLang } from "./ui/lang.ts";
import { initSettings, penWriter } from "./ui/settings.ts";
import { recolor, setPen } from "./ui/writer.ts";
import { initSheet } from "./ui/sheet.ts";
import { setTheme, onThemeChange } from "./theme.ts";
import { dailySnapshot } from "./autobackup.ts";
import { initWhatsNew } from "./ui/whatsnew.ts";
import { initPerfDiag } from "./ui/perfdiag.ts";
import { initAmbient, fxOpts } from "./ui/ambient.ts";
import { app } from "./state.ts";
import { loadRecorded, setSpeechRate } from "./speech.ts";
import { initNative, NATIVE } from "./native.ts";
import { initInstall } from "./ui/install.ts";
import { initTour } from "./ui/tour.ts";

async function boot() {
  initPerfDiag(); // раньше всего: нужны задержки с первых секунд запуска
  initNative();
  initNav();
  initMotion();
  initSheet();
  initHome();
  initSession();
  initLessonEnd();
  initWords();
  initEntry();
  initBook();
  initStats();
  initExercise();
  initTones();
  initReading();
  initHsk();
  initSettings();
  try {
    await init();
  } catch (e) {
    $("boot-error").hidden = false;
    $("boot-error").textContent = `Не удалось запустить: ${e instanceof Error ? e.message : e}. Обновите страницу.`;
    return;
  }
  setTheme(app.settings.theme, app.settings.custom ?? null);
  initAmbient(app.settings.motion);
  fxOpts.slash = app.settings.fxSlash !== false;
  setPen(app.settings.pen, app.settings.ink, app.settings.keepStrokes, app.settings.penSize);
  setSpeechRate(app.settings.speechRate ?? 1);
  onThemeChange(() => recolor([sessionWriter(), entryWriter(), bookWriter(), penWriter()]));
  initLang();
  show("words");
  initSync();
  initRemind();
  initInstall();
  initOffline();
  initLoadBar();
  // при запуске — тихая синхронизация; если что-то пришло с другого устройства, перерисовать экран
  autoSync().then((changed) => { if (changed) rerender(); });
  requestPersist();
  initWhatsNew();
  initTour();
  // ежедневная копия — в простое, чтобы не мешать письму (на большом журнале это сотни миллисекунд)
  setTimeout(() => {
    const run = () => void dailySnapshot();
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(run, { timeout: 60_000 }); else run();
  }, 8000);
  void openShared();
  loadRecorded();
  // в приложении (Capacitor) кэш данных ведёт native.ts, service worker не нужен
  if (!NATIVE && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* офлайн необязателен */ });
  }
}

/** Пришли через «Поделиться → Черта»: достать текст/файл, который сохранил service worker, и открыть импорт. */
async function openShared() {
  const p = new URLSearchParams(location.search);
  if (!p.has("shared")) return;
  history.replaceState(null, "", location.pathname);
  try {
    const c = await caches.open("cherta-share");
    const r = await c.match("shared.json");
    if (!r) return;
    const d: { title: string; text: string; url: string; file: string; name: string } = await r.json();
    await c.delete("shared.json");
    const text = d.file || d.text || d.title;
    if (text.trim()) openImport({ text, name: d.name || d.title, onDeck: (id) => void openDeck(id) });
  } catch { /* нет кэша — ничего не делать */ }
}

boot();
