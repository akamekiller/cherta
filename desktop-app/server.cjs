// Локальный сервер приложения: раздаёт веб-часть из папки www и на localhost, поэтому всё работает как на сайте
// (service worker, офлайн-кэш, IndexedDB). Озвучки и японских черт в установщике нет — они берутся с сайта
// и сохраняются кэшем service worker (как в «Настройки → Офлайн»).
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const SITE = "https://akamekiller.github.io/cherta/";
const REMOTE = /^(audio\/|data\/strokes-ja\/)/;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".tsv": "text/tab-separated-values; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".bin": "application/octet-stream",
};

/** Раздаёт root на host:port. Возвращает Promise<http.Server>; ошибка (например, порт занят) — отказ промиса. */
function startServer(root, port, host = "127.0.0.1", fetchImpl = globalThis.fetch) {
  const server = http.createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      rel = path.posix.normalize(rel).replace(/^\/+/, "");
      if (rel.startsWith("..")) { res.writeHead(403).end(); return; }
      if (!rel || rel.endsWith("/")) rel += "index.html";
      const file = path.join(root, rel);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      let body = null;
      try {
        const st = await fs.stat(file);
        body = await fs.readFile(st.isDirectory() ? path.join(file, "index.html") : file);
      } catch { /* нет файла */ }
      if (body) {
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
        res.end(body);
        return;
      }
      if (REMOTE.test(rel) && fetchImpl) {
        const headers = {};
        if (req.headers.range) headers.range = req.headers.range;
        const r = await fetchImpl(SITE + rel, { headers });
        const out = { "Content-Type": r.headers.get("content-type") ?? "application/octet-stream" };
        for (const k of ["content-length", "content-range", "accept-ranges", "etag"]) if (r.headers.get(k)) out[k] = r.headers.get(k);
        res.writeHead(r.status, out);
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Не найдено");
    } catch {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }).end("Нет связи с сайтом");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

module.exports = { startServer };
