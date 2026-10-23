/**
 * Установка на главный экран (сайт как приложение — PWA).
 * iPhone/iPad: установить можно только через меню «Поделиться» → «На экран „Домой“» — показываем подсказку
 * (один раз полосой внизу и всегда в Настройках). Android в браузере: кнопка системной установки
 * (beforeinstallprompt), если браузер её предлагает, и ссылка на APK.
 * Уже установленное (открыто с главного экрана) или приложение для Android (Capacitor) — ничего не показываем.
 */
import { $ } from "./dom.ts";
import { NATIVE } from "../native.ts";
import { openSheet } from "./sheet.ts";

const LS = "cherta.installHint";
export const APK_URL = "https://github.com/akamekiller/cherta/releases/download/android/cherta.apk";

type BIP = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let bip: BIP | null = null;

const ua = () => navigator.userAgent;
/** iPhone, iPad (iPadOS выдаёт себя за Mac, но у него есть касания). */
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(ua());
const isElectron = () => /Electron\//.test(ua());
const isWindows = () => /Windows/.test(ua()) && !isAndroid();
export const WIN_URL = "https://github.com/akamekiller/cherta/releases/download/windows/Cherta-Setup.exe";
/** Открыто с главного экрана. */
export const isStandalone = () =>
  (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;

const SHARE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;

/** Пошаговая подсказка для iPhone/iPad. */
const iosSteps = () => `<ol class="inst-steps">
    <li>Откройте сайт в <b>Safari</b> (в Chrome на iPhone тоже можно — через ту же кнопку).</li>
    <li>Нажмите <b>«Поделиться»</b> ${SHARE_ICON} — внизу экрана (на iPad — вверху справа).</li>
    <li>Прокрутите список и выберите <b>«На экран „Домой“»</b> ${PLUS_ICON}.</li>
    <li>Нажмите <b>«Добавить»</b>. На главном экране появится иконка «Черта» — открывайте приложение с неё.</li>
  </ol>
  <p class="hint">С иконки «Черта» открывается на весь экран, без адресной строки, работает без интернета, а прогресс iPhone не удаляет (у открытого просто в Safari он может стереться, если долго не заходить). Резервная копия или синхронизация — в Настройках.</p>`;

function render() {
  const box = document.getElementById("inst-box");
  if (!box) return;
  if (NATIVE) { box.innerHTML = `<p class="hint">Это приложение для Android — уже установлено.</p>`; return; }
  if (isElectron()) { box.innerHTML = `<p class="hint">Это приложение для Windows — уже установлено. Обновление: скачайте новый установщик с сайта.</p>`; return; }
  if (isStandalone()) { box.innerHTML = `<p class="hint">«Черта» уже на главном экране — вы открыли её оттуда. Обновления приходят сами.</p>`; return; }
  if (isIOS()) { box.innerHTML = iosSteps(); return; }
  box.innerHTML = `${bip ? `<button class="btn primary wide" id="inst-go">Установить на этот телефон / компьютер</button>` : ""}
    ${isAndroid()
      ? `<p class="hint">${bip ? "Или" : "В Chrome:"} меню ⋮ → <b>«Добавить на главный экран»</b> (или «Установить приложение»). Есть и отдельное приложение для Android: <a href="${APK_URL}">скачать cherta.apk</a>.</p>`
      : `<p class="hint">${bip ? "Или" : "В Chrome и Edge:"} значок установки в адресной строке или меню → «Установить приложение». На iPhone — Safari → «Поделиться» → «На экран „Домой“».${isWindows() ? ` Есть и отдельная программа для Windows: <a href="${WIN_URL}">скачать Cherta-Setup.exe</a> (Windows может предупредить про неподписанный установщик: «Подробнее» → «Выполнить в любом случае»).` : ""}</p>`}`;
  box.querySelector("#inst-go")?.addEventListener("click", async () => {
    if (!bip) return;
    await bip.prompt();
    await bip.userChoice.catch(() => null);
    bip = null;
    render();
  });
}

/** Полоса внизу на iPhone (один раз, пока не закрыли и пока сайт не установлен). */
function iosBanner() {
  let seen = false;
  try { seen = localStorage.getItem(LS) === "1"; } catch { /* */ }
  if (seen || NATIVE || !isIOS() || isStandalone()) return;
  const bar = document.createElement("div");
  bar.className = "inst-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Установка на главный экран");
  bar.innerHTML = `<span class="inst-ic" aria-hidden="true">笔</span><span class="inst-t"><b>Установите «Черту» на главный экран</b><small>Поделиться ${SHARE_ICON} → «На экран „Домой“»</small></span>
    <button class="btn small" data-how>Как</button><button class="icon-btn" data-x aria-label="Закрыть">✕</button>`;
  document.body.append(bar);
  const close = () => { bar.remove(); try { localStorage.setItem(LS, "1"); } catch { /* */ } };
  bar.querySelector("[data-x]")!.addEventListener("click", close);
  bar.querySelector("[data-how]")!.addEventListener("click", () => { close(); openSheet("На главный экран iPhone", `<div class="stack">${iosSteps()}</div>`); });
}

export function initInstall() {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); bip = e as BIP; render(); });
  window.addEventListener("appinstalled", () => { bip = null; render(); });
  render();
  // не сразу: сначала приложение должно открыться
  setTimeout(iosBanner, 2500);
  $("set-install").hidden = NATIVE;
}
