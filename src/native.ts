/**
 * Приложение для Android (Capacitor, сборка — .github/workflows/android.yml).
 * В APK лежит только основа: оболочка, шрифты, китайские черты, данные распознавания. Остальное (японские черты,
 * озвучка, словари) берётся с сайта и сохраняется в том же кэше, что у service worker на сайте (`cherta-data-v1`),
 * поэтому «Настройки → Офлайн» работает и в приложении. Service worker внутри приложения не используется:
 * у Capacitor на Android запросы идут через его собственный сервер, поэтому кэш ведётся прямо здесь.
 */
type Cap = { isNativePlatform?: () => boolean };
const cap = (globalThis as { Capacitor?: Cap }).Capacitor;
export const NATIVE = !!cap?.isNativePlatform?.();
export const SITE = "https://akamekiller.github.io/cherta/";

/** Файлы, которых нет в APK: в приложении — адрес на сайте, в браузере — как есть. */
const REMOTE = /^(audio\/|data\/strokes-ja\/)/;
export const asset = (path: string) => (NATIVE && REMOTE.test(path) ? SITE + path : path);

const DATA = "cherta-data-v1"; // то же имя, что DATA в static/sw.js
const HOSTS = new Set(["akamekiller.github.io"]);

/** Данные, которые по адресу не меняются (как в sw.js): сначала кэш, потом сеть. */
function isData(u: URL): boolean {
  const p = u.pathname;
  const versioned = (/\/(cherta-)?dict\//.test(p) || p.endsWith("/data/hw.txt")) && u.searchParams.has("v");
  return versioned || (p.includes("/data/fonts/") && p.endsWith(".woff2")) || p.includes("/data/strokes") || (p.includes("/audio/") && p.endsWith(".mp3"));
}

export function initNative() {
  if (!NATIVE) return;
  document.documentElement.dataset.native = "1";
  if (!("caches" in window)) return;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (req.method !== "GET" || !HOSTS.has(url.hostname)) return orig(input, init);
    const c = await caches.open(DATA);
    if (isData(url)) {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await orig(input, init);
      if (res.ok) {
        // новая версия файла словаря — старые версии того же файла не нужны
        if (url.searchParams.has("v")) for (const old of await c.keys(req, { ignoreSearch: true })) if (old.url !== req.url) await c.delete(old);
        await c.put(req, res.clone());
      }
      return res;
    }
    // списки (meta.json, index.json озвучки): сначала сеть, без сети — последняя сохранённая копия
    try {
      const res = await orig(input, init);
      if (res.ok) await c.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  };
}

/**
 * Голос устройства в приложении: в WebView Android нет speechSynthesis, поэтому — плагин
 * @capacitor-community/text-to-speech напрямую через мост Capacitor (без JS-пакета плагина).
 */
type Bridge = { nativePromise?: (plugin: string, method: string, opts?: object) => Promise<unknown> };
const bridge = () => (globalThis as { Capacitor?: Bridge }).Capacitor;
export const nativeTts = () => NATIVE && typeof bridge()?.nativePromise === "function";
let ttsRun = 0;
/** Прочитать строки по очереди; новая команда прерывает прежнюю. */
export async function nativeSpeak(texts: string[], lang: "zh" | "ja", rate: number) {
  const b = bridge();
  if (!b?.nativePromise) return;
  const my = ++ttsRun;
  try { await b.nativePromise("TextToSpeech", "stop", {}); } catch { /* */ }
  for (const text of texts) {
    if (my !== ttsRun) return;
    try { await b.nativePromise("TextToSpeech", "speak", { text, lang: lang === "ja" ? "ja-JP" : "zh-CN", rate, pitch: 1, volume: 1, category: "playback" }); }
    catch { return; }
  }
}
export function nativeStop() {
  ttsRun++;
  bridge()?.nativePromise?.("TextToSpeech", "stop", {}).catch(() => {});
}

/**
 * Сохранить файл в приложении: ссылки на скачивание в WebView не работают, поэтому файл пишется во временную папку
 * (плагин Filesystem) и открывается окно «Поделиться» — сохранить в Файлы, на Диск, отправить в мессенджер.
 * true — сделано (или человек сам закрыл окно), false — не получилось, пусть пробует обычное скачивание.
 */
export async function nativeSave(name: string, text: string): Promise<boolean> {
  const b = bridge();
  if (!NATIVE || !b?.nativePromise) return false;
  try {
    const r = await b.nativePromise("Filesystem", "writeFile", { path: name, data: text, directory: "CACHE", encoding: "utf8", recursive: true }) as { uri: string };
    await b.nativePromise("Share", "share", { title: name, files: [r.uri], dialogTitle: "Сохранить или отправить файл" });
    return true;
  } catch (e) {
    return /cancel/i.test(String((e as { message?: string })?.message ?? e));
  }
}

/**
 * Адрес для <audio>: в приложении запись берётся через fetch (из кэша, если скачана) и отдаётся как blob,
 * иначе офлайн она бы не играла. В браузере — адрес как есть (кэширует service worker).
 */
let lastBlob = "";
export async function playable(url: string): Promise<string> {
  if (!NATIVE || !/^https?:/.test(url)) return url;
  const r = await fetch(url);
  if (!r.ok) throw new Error("нет записи");
  if (lastBlob) URL.revokeObjectURL(lastBlob);
  lastBlob = URL.createObjectURL(await r.blob());
  return lastBlob;
}
