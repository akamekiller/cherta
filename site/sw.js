// Service worker «Черты»: офлайн-работа.
// Оболочка приложения кэшируется при установке; данные черт, словаря и шрифты — при первом запросе
// или все сразу (Настройки → Офлайн, src/ui/offline.ts).
// Файлы словаря (репозиторий cherta-dict) запрашиваются с ?v=<версия из meta.json>: после пересборки адрес новый,
// а старые версии того же файла удаляются из кэша.
const VERSION = "0.49.5-mvly9l83";
const SHELL = `cherta-shell-${VERSION}`;
const DATA = "cherta-data-v1";
const SHELL_FILES = ["./","index.html","app.js","styles.css","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","data/fonts/fonts.css","data/fonts/golos-c424fb53.woff2","data/fonts/plexmono-5448f24b.woff2","audio/zh/index.json","data/decks/index.json","data/decks/hsk3-1.json","data/decks/hsk3-2.json","data/decks/hsk3-3.json","data/decks/hsk3-4.json","data/decks/hsk3-5.json","data/decks/hsk3-6.json","data/decks/hsk2-1.json","data/decks/hsk2-2.json","data/decks/hsk2-3.json","data/decks/hsk2-4.json","data/decks/hsk2-5.json","data/decks/hsk2-6.json","data/decks/radicals.json","data/decks/life-uni.json","data/decks/life-dorm.json","data/decks/life-bank.json","data/decks/life-transport.json","data/decks/life-shop.json","data/decks/life-doctor.json","data/decks/ja-hira.json","data/decks/ja-kata.json","data/decks/ja-n5.json","data/decks/ja-n4.json","data/dialogs.json","data/texts.json","data/texts-ja.json","data/themes.json","data/hsk/index.json","data/hsk/hskk.txt","data/hsk/hsk1.txt","data/hsk/hsk2.txt","data/hsk/hsk3.txt","data/hsk/hsk4.txt","data/hsk/hsk5.txt","data/hsk/hsk6.txt","data/decomp.json","data/courses/index.json","data/courses/hsk1.txt","data/courses/hsk2.txt","data/courses/hsk3.txt","data/courses/life.txt","data/courses/eng.txt"];

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
  // «Поделиться → Черта» (share target): текст или файл сохраняем и открываем приложение с окном импорта
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      const fd = await req.formData();
      const f = fd.get("file");
      const isFile = f && typeof f !== "string";
      const data = { title: fd.get("title") || "", text: fd.get("text") || "", url: fd.get("url") || "", file: isFile ? await f.text() : "", name: isFile ? f.name : "" };
      await (await caches.open("cherta-share")).put("shared.json", new Response(JSON.stringify(data)));
      return Response.redirect(new URL("./?shared=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // пакеты озвучки (Настройки → Офлайн) режет само приложение — сами пакеты хранить незачем
  if (url.pathname.includes("/audio/") && url.pathname.includes("/packs/")) return;
  const isDict = /\/(cherta-)?dict\//.test(url.pathname) && url.searchParams.has("v");
  const versioned = isDict || (url.pathname.endsWith("/data/hw.txt") && url.searchParams.has("v"));
  // шрифты — свои файлы с хэшем в имени (data/fonts, scripts/build_fonts.py), содержимое по адресу не меняется
  const isFont = url.pathname.includes("/data/fonts/") && url.pathname.endsWith(".woff2");
  const isData = versioned || isFont || url.pathname.includes("/data/strokes/") || url.pathname.includes("/data/strokes-ja/") || (url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3"));
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

// Напоминание (периодическая фоновая проверка, Chrome на Android): сегодня ещё не занимались — показать уведомление.
function idbGet(key) {
  return new Promise((resolve) => {
    const r = indexedDB.open("cherta");
    r.onerror = () => resolve(undefined);
    r.onsuccess = () => {
      try {
        const q = r.result.transaction("meta").objectStore("meta").get(key);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    };
  });
}
async function remindCheck() {
  const remind = await idbGet("remind");
  if (!remind || !remind.on) return;
  const now = new Date();
  const d = new Date(now.getTime() - 4 * 3600000);
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const day = await idbGet("day");
  if (day && day.day === today && day.newCount > 0) return;
  const [h, m] = String(remind.time || "20:00").split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  await self.registration.showNotification("Черта", { body: "Пора повторить слова — план на сегодня ждёт.", icon: "icons/icon-192.png", tag: "cherta-remind" });
}
self.addEventListener("periodicsync", (e) => { if (e.tag === "cherta-remind") e.waitUntil(remindCheck()); });
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow("./"))));
});
