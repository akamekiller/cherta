// Локальный сервер без зависимостей: раздаёт папку site/ на компьютере и в домашней сети.
// Запуск: npm start   (или node scripts/serve.mjs)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    path = normalize(path).replace(/^([/\\])+/, "");
    let file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Не найдено");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`\nЧерта запущена.\n  На этом компьютере:  http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) console.log(`  С телефона (та же Wi-Fi сеть):  http://${a.address}:${PORT}`);
  }
  console.log("\nОстановить: Ctrl+C\n");
});
