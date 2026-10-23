// Веб-часть для Windows: копия site/ без озвучки и японских черт (они берутся с сайта, см. server.cjs).
// service worker остаётся: на localhost он работает и ведёт офлайн-кэш, как на сайте.
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "site");
const www = join(here, "www");
const SKIP = [/^audio(\/|$)/, /^data\/strokes-ja(\/|$)/, /^CNAME$/];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
let n = 0, bytes = 0;
function walk(rel) {
  for (const name of readdirSync(join(site, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    if (SKIP.some((re) => re.test(r))) continue;
    const st = statSync(join(site, r));
    if (st.isDirectory()) walk(r);
    else { mkdirSync(dirname(join(www, r)), { recursive: true }); cpSync(join(site, r), join(www, r)); n++; bytes += st.size; }
  }
}
walk("");
mkdirSync(join(here, "build"), { recursive: true });
copyFileSync(join(here, "..", "static", "icons", "icon-512.png"), join(here, "build", "icon.png"));
console.log(`www: ${n} файлов, ${(bytes / 1048576).toFixed(1)} МБ`);
