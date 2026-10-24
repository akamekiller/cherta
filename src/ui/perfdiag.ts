/** «Диагностика письма»: на телефоне записывает долгие задержки и кадры во время письма, показывает сводку цифрами. */
import { PerfLog, summarize } from "../core/perflog.ts";
import { openSheet } from "./sheet.ts";
import { app } from "../state.ts";
import { esc } from "./dom.ts";

const log = new PerfLog();
let started = false;

/** Запускается в самом начале приложения: нужны задержки с первых секунд. Ничего не пишет на диск и не отправляет. */
export function initPerfDiag() {
  if (started) return;
  started = true;
  const obs = (type: string, opts: Record<string, unknown>, cb: (list: PerformanceEntryList) => void) => {
    try { new PerformanceObserver((l) => cb(l.getEntries())).observe({ type, buffered: true, ...opts } as PerformanceObserverInit); } catch { /* не поддерживается */ }
  };
  obs("longtask", {}, (es) => es.forEach((e) => log.addLong(e.startTime, e.duration)));
  obs("event", { durationThreshold: 16 }, (es) => es.forEach((e) => log.addEvent(e.startTime, e.duration, e.name)));

  // кадры считаем только пока палец (перо, мышь) на экране — постоянный requestAnimationFrame не нужен
  let down = 0, raf = 0, last = 0;
  const loop = (t: number) => {
    if (last) log.addFrame(t, t - last);
    last = t;
    raf = down > 0 ? requestAnimationFrame(loop) : 0;
  };
  addEventListener("pointerdown", (e) => {
    down++;
    if ((e.target as Element | null)?.closest?.("svg")) log.writes++;
    if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  }, { capture: true, passive: true });
  const up = () => { down = Math.max(0, down - 1); };
  addEventListener("pointerup", up, { capture: true, passive: true });
  addEventListener("pointercancel", up, { capture: true, passive: true });
}

function info(): Record<string, string> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ver = /Черта\s+(\S+)/.exec(document.getElementById("set-about")?.textContent ?? "")?.[1] ?? "?";
  const ua = navigator.userAgent;
  const where = /Electron\//.test(ua) ? "программа Windows" : (window as unknown as { Capacitor?: unknown }).Capacitor ? "Android-приложение" : matchMedia("(display-mode: standalone)").matches ? "сайт с главного экрана" : "сайт в браузере";
  return {
    "Версия": ver,
    "Где открыто": where,
    "Тема": `${document.documentElement.dataset.theme ?? "?"}${app.settings.motion === false ? " (живой фон выключен)" : ""}`,
    "Перо": `${app.settings.pen}, толщина ${Math.round(app.settings.penSize * 100)}%, ${app.settings.keepStrokes ? "оставлять мои черты" : "без оставления черт"}`,
    "Экран": `${innerWidth}×${innerHeight}, плотность ${devicePixelRatio}`,
    "Устройство": `ядер ${navigator.hardwareConcurrency ?? "?"}, память ${nav.deviceMemory ?? "?"} ГБ`,
    "Браузер": (/(Chrome|Firefox|Safari|Electron)\/[\d.]+/.exec(ua)?.[0]) ?? ua.slice(0, 60),
  };
}

export function openPerfDiag() {
  const text = () => summarize(log, performance.now(), info());
  openSheet("Диагностика письма", `<p class="hint">Напишите несколько иероглифов так, чтобы появлялись задержки, затем откройте это окно. Цифры остаются на устройстве; пришлите их разработчику (кнопка «Скопировать»).</p>
    <pre id="pd-out" style="white-space:pre-wrap;font:13px/1.45 var(--f-mono,monospace);margin:0">${esc(text())}</pre>
    <div class="row"><button class="btn primary" id="pd-copy">Скопировать</button><button class="btn" id="pd-reset">Начать заново</button></div>
    <p class="hint" id="pd-msg"></p>`, (root) => {
    const out = root.querySelector<HTMLElement>("#pd-out")!, msg = root.querySelector<HTMLElement>("#pd-msg")!;
    root.querySelector("#pd-copy")!.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(out.textContent ?? ""); msg.textContent = "Скопировано."; }
      catch { const r = document.createRange(); r.selectNodeContents(out); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); msg.textContent = "Текст выделен — скопируйте вручную."; }
    });
    root.querySelector("#pd-reset")!.addEventListener("click", () => { log.reset(); out.textContent = text(); msg.textContent = "Счётчики сброшены."; });
  });
}
