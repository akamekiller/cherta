// Service worker «Черты»: офлайн-работа.
// Оболочка приложения кэшируется при установке; данные черт, словаря и шрифты — при первом запросе.
// Файлы словаря (репозиторий cherta-dict) запрашиваются с ?v=<версия из meta.json>: после пересборки адрес новый,
// а старые версии того же файла удаляются из кэша.
const VERSION = "__VERSION__";
const SHELL = `cherta-shell-${VERSION}`;
const DATA = "cherta-data-v1";
const SHELL_FILES = __SHELL_FILES__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("cherta-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isDict = /\/(cherta-)?dict\//.test(url.pathname) && url.searchParams.has("v");
  const versioned = isDict || (url.pathname.endsWith("/data/hw.txt") && url.searchParams.has("v"));
  const isData = versioned || url.pathname.includes("/data/strokes/") || (url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3")) || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com");
  if (isData) {
    // данные не меняются: сначала кэш, потом сеть
    e.respondWith(caches.open(DATA).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") {
        if (versioned) for (const old of await c.keys(req, { ignoreSearch: true })) if (old.url !== req.url) await c.delete(old);
        await c.put(req, res.clone());
      }
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // оболочка: сначала сеть (чтобы обновления приходили сразу), без сети — кэш
  e.respondWith(
    // cache: "no-cache" — не брать страницу из HTTP-кэша браузера (GitHub Pages держит его 10 минут)
    fetch(req, { cache: "no-cache" }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? caches.match("./index.html")),
  );
});
