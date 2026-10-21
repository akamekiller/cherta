// Пакеты озвучки для «Настройки → Офлайн»: тысячи маленьких mp3 склеиваются в файлы ~2 МБ,
// чтобы скачать всё за несколько десятков запросов, а не за 7–9 тысяч (по одному файлу это очень долго:
// каждый запрос к GitHub Pages — сотни миллисекунд ожидания, особенно из России и Китая).
// Приложение режет пакет обратно на записи и кладёт каждую в кэш под её обычным адресом (src/ui/offline.ts).
//
// Запускается в .github/workflows/pages.yml перед публикацией; в репозиторий пакеты не кладутся (.gitignore),
// чтобы 60 МБ не копились в истории при каждой переозвучке.
// node scripts/build-audio-packs.mjs [папка site]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const SITE = process.argv[2] ?? "site";
const LIMIT = 2 * 1024 * 1024;

for (const lang of ["zh", "ja"]) {
  const dir = join(SITE, "audio", lang);
  const indexFile = join(dir, "index.json");
  if (!existsSync(indexFile)) continue;
  const { words } = JSON.parse(readFileSync(indexFile, "utf8"));
  const out = join(dir, "packs");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const packs = [];
  let cur = { bufs: [], w: [], size: 0 };
  const flush = () => {
    if (!cur.w.length) return;
    const buf = Buffer.concat(cur.bufs);
    const h = createHash("sha1").update(buf).digest("hex").slice(0, 10);
    const f = `${String(packs.length).padStart(2, "0")}.bin`;
    writeFileSync(join(out, f), buf);
    packs.push({ f, h, w: cur.w });
    cur = { bufs: [], w: [], size: 0 };
  };
  let missing = 0;
  for (const w of words) {
    const p = join(dir, `${w}.mp3`);
    if (!existsSync(p)) { missing++; continue; }
    const b = readFileSync(p);
    if (cur.size + b.length > LIMIT) flush();
    cur.bufs.push(b);
    cur.w.push([w, b.length]);
    cur.size += b.length;
  }
  flush();
  writeFileSync(join(dir, "packs.json"), JSON.stringify({ packs }));
  const total = packs.reduce((s, p) => s + p.w.reduce((a, x) => a + x[1], 0), 0);
  console.log(`${lang}: ${packs.length} пакетов, ${packs.reduce((s, p) => s + p.w.length, 0)} записей, ${(total / 1048576).toFixed(1)} МБ, нет файла: ${missing}`);
}
