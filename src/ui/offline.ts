/**
 * Офлайн: «Скачать для офлайна» в настройках и полоска загрузки больших файлов.
 *
 * Обычно данные кэшируются по мере использования (service worker, кэш DATA в static/sw.js). Здесь всё скачивается
 * заранее — нужно там, где интернета нет или сайты GitHub/Google открываются плохо (Китай без VPN).
 * Файлы запрашиваются обычным fetch по тем же адресам, что и в работе приложения, — их сохраняет service worker,
 * поэтому скачанное потом находится и при обычной работе.
 */
import { runQueue, countCached, fmtSize, type QueueProgress } from "../core/offline.ts";
import { strokeFile, SHARDS } from "../strokes.ts";
import { hwUrl } from "./hwpad.ts";
import { dictFiles, jdictFiles, appLang } from "../state.ts";
import { allAudioUrls } from "../speech.ts";
import { onLoad } from "../loading.ts";
import { $, esc } from "./dom.ts";

const DATA_CACHE = "cherta-data-v1"; // то же имя, что DATA в static/sw.js

type Pack = { id: string; title: string; hint: string; approx: string; lang: "zh" | "ja"; urls: () => Promise<string[]> };
const fontUrls = async (lang: "zh" | "ja") => {
  const r = await fetch("data/fonts/files.json");
  const list: { file: string; core: boolean; lang?: string }[] = await r.json();
  return list.filter((f) => !f.core && (f.lang ?? "zh") === lang).map((f) => `data/fonts/${f.file}`);
};
const PACKS: Pack[] = [
  { id: "strokes", lang: "zh", title: "Черты иероглифов", hint: "Письмо, тетрадь прописей, рисование в поиске", approx: "14 МБ",
    urls: async () => [...Array.from({ length: SHARDS }, (_, n) => strokeFile(n)), hwUrl()] },
  { id: "fonts", lang: "zh", title: "Шрифт иероглифов", hint: "Иероглифы выглядят одинаково на всех устройствах", approx: "4 МБ", urls: () => fontUrls("zh") },
  { id: "strokes-ja", lang: "ja", title: "Японские черты", hint: "Кана и кандзи: письмо и тетрадь прописей (KanjiVG)", approx: "9 МБ",
    urls: async () => Array.from({ length: SHARDS }, (_, n) => strokeFile(n, "ja")) },
  { id: "fonts-ja", lang: "ja", title: "Японский шрифт", hint: "Японские начертания кандзи и каны", approx: "3 МБ", urls: () => fontUrls("ja") },
  { id: "dict-ja", lang: "ja", title: "Словарь WARODAI", hint: "Японско-русский словарь: поиск и статьи", approx: "10 МБ", urls: jdictFiles },
  { id: "dict", lang: "zh", title: "Словарь 大БКРС", hint: "Поиск и статьи", approx: "12 МБ", urls: async () => (await dictFiles()).dict },
  { id: "examples", lang: "zh", title: "Примеры к словам", hint: "Вкладка «Примеры» и своя практика", approx: "11 МБ", urls: async () => (await dictFiles()).examples },
  { id: "audio", lang: "zh", title: "Озвучка", hint: "Записи нейросетевого голоса для слов колод", approx: "36 МБ", urls: allAudioUrls },
];

const abs = (u: string) => new URL(u, location.href).href;
let cached = new Set<string>();
const has = (u: string) => cached.has(abs(u));
async function refreshCached() {
  if (!("caches" in window)) return;
  const c = await caches.open(DATA_CACHE);
  cached = new Set((await c.keys()).map((r) => r.url));
}

const urlCache = new Map<string, string[]>();
async function packUrls(p: Pack): Promise<string[] | null> {
  if (!urlCache.has(p.id)) {
    try { urlCache.set(p.id, await p.urls()); } catch { return null; }
  }
  return urlCache.get(p.id)!;
}

let running: { id: string; ctl: AbortController; prog?: QueueProgress } | null = null;

const canWork = () => "caches" in window && "serviceWorker" in navigator && !!navigator.serviceWorker.controller;

async function render() {
  const box = $("off-list");
  await refreshCached();
  const rows: string[] = [];
  let allDone = true;
  for (const p of PACKS.filter((x) => x.lang === appLang())) {
    const urls = await packUrls(p);
    let state = "";
    let btn = "";
    if (running?.id === p.id) {
      const g = running.prog;
      const pct = g && g.total ? Math.round((g.done / g.total) * 100) : 0;
      state = `<div class="off-bar"><i style="width:${pct}%"></i></div><div class="off-st">${g ? `${g.done} из ${g.total} · ${fmtSize(g.bytes)}` : "Готовлю список…"}</div>`;
      btn = `<button class="btn small" data-off-stop>Стоп</button>`;
      allDone = false;
    } else if (!urls) {
      state = `<div class="off-st">Нет связи с сервером — список файлов не получить</div>`;
      allDone = false;
    } else {
      const n = countCached(urls, has);
      const full = n >= new Set(urls).size;
      if (!full) allDone = false;
      // часть файлов обычно уже есть — то, что открывали раньше
      state = `<div class="off-st${full ? " ok" : ""}">${full ? "✓ Скачано" : n ? `Частично: ${n} из ${new Set(urls).size} файлов · всего около ${p.approx}` : `Около ${p.approx}`}</div>`;
      btn = full ? "" : `<button class="btn small" data-off="${p.id}" ${running || !canWork() ? "disabled" : ""}>${n ? "Докачать" : "Скачать"}</button>`;
    }
    rows.push(`<div class="set-row off-row"><div class="t"><div>${esc(p.title)}</div><div>${esc(p.hint)}</div>${state}</div>${btn}</div>`);
  }
  box.innerHTML = rows.join("");
  $<HTMLButtonElement>("off-all").disabled = !!running || allDone || !canWork();
  $("off-all").textContent = allDone ? "Всё скачано ✓" : "Скачать всё";
  if (!canWork()) $("off-msg").textContent = "Скачивание заработает, когда приложение откроется с сайта ещё раз (нужен офлайн-режим браузера).";
  showUsage();
}

async function showUsage() {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.usage) $("off-usage").textContent = `Занято на устройстве: ${fmtSize(e.usage)}`;
  } catch { /* */ }
}

async function download(ids: string[]) {
  if (running) return;
  try { await navigator.storage?.persist?.(); } catch { /* браузер может не дать — тогда кэш просто может быть очищен при нехватке места */ }
  const conn = (navigator as { connection?: { type?: string } }).connection;
  $("off-msg").textContent = conn?.type === "cellular" ? "Сейчас мобильный интернет — объём большой, лучше по Wi-Fi." : "";
  let failed = 0;
  for (const id of ids) {
    const p = PACKS.find((x) => x.id === id)!;
    const ctl = new AbortController();
    running = { id, ctl };
    render();
    const urls = await packUrls(p);
    if (!urls) { failed++; continue; }
    await refreshCached();
    let last = 0;
    const res = await runQueue(urls, {
      has, signal: ctl.signal, concurrency: id === "audio" ? 8 : 4,
      get: async (u, signal) => {
        const r = await fetch(u, { signal });
        if (!r.ok) throw new Error(String(r.status));
        return (await r.arrayBuffer()).byteLength;
      },
      onProgress: (g) => {
        if (running) running.prog = g;
        const now = Date.now();
        if (now - last > 250 || g.done === g.total) { last = now; render(); }
      },
    });
    failed += res.failed;
    if (res.aborted) { running = null; $("off-msg").textContent = "Остановлено. Скачанное сохранено — можно докачать позже."; render(); return; }
  }
  running = null;
  $("off-msg").textContent = failed ? `Не скачалось файлов: ${failed}. Проверьте связь и нажмите «Докачать».` : "Готово — эти данные работают без интернета.";
  render();
}

export function initOffline() {
  $("off-list").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-off-stop]")) { running?.ctl.abort(); return; }
    const b = t.closest<HTMLElement>("[data-off]");
    if (b) download([b.dataset.off!]);
  });
  $("off-all").addEventListener("click", async () => {
    const left: string[] = [];
    await refreshCached();
    for (const p of PACKS.filter((x) => x.lang === appLang())) {
      const urls = await packUrls(p);
      if (urls && countCached(urls, has) < new Set(urls).size) left.push(p.id);
    }
    download(left);
  });
}

/** Показать состояние, когда открыли настройки. */
export const renderOffline = () => { if (!running) urlCache.clear(); render(); };

/* ---------- полоска загрузки больших файлов (словарь, распознавание рисунка) ---------- */

export function initLoadBar() {
  const bar = $("loadbar");
  const active = new Map<string, { label: string; loaded: number; since: number }>();
  let timer = 0;
  const paint = () => {
    const now = Date.now();
    // показываем, только если грузится дольше 400 мс — из кэша всё приходит сразу
    const vis = [...active.values()].filter((a) => now - a.since > 400);
    bar.hidden = !vis.length;
    if (vis.length) bar.innerHTML = vis.map((a) => `<span class="spin" aria-hidden="true"></span>${esc(a.label)}… ${fmtSize(a.loaded)}`).join("<br>");
  };
  onLoad((ev) => {
    if (ev.done) {
      active.delete(ev.key);
      if (ev.error) { bar.hidden = false; bar.textContent = "Не удалось загрузить — нет связи. Скачанное для офлайна работает."; setTimeout(paint, 3000); return; }
    } else {
      const a = active.get(ev.key);
      if (a) a.loaded = ev.loaded; else active.set(ev.key, { label: ev.label, loaded: ev.loaded, since: Date.now() });
    }
    clearTimeout(timer);
    timer = window.setTimeout(paint, ev.done ? 0 : 120);
    if (!ev.done) paint();
  });
}
