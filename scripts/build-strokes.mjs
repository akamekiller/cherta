// Делит all.json из hanzi-writer-data на 64 файла site/data/strokes/NN.json.
// Запуск: node scripts/build-strokes.mjs путь/к/all.json
// all.json: https://github.com/chanind/hanzi-writer-data (папка data)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SHARDS = 64;
const src = process.argv[2];
if (!src) { console.error("Укажите путь к all.json"); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site/data/strokes");
mkdirSync(out, { recursive: true });

const all = JSON.parse(readFileSync(src, "utf8"));
const shards = Array.from({ length: SHARDS }, () => ({}));
let n = 0;
for (const [ch, d] of Object.entries(all)) {
  shards[ch.codePointAt(0) % SHARDS][ch] = { strokes: d.strokes, medians: d.medians };
  n++;
}
shards.forEach((s, i) => writeFileSync(join(out, `${String(i).padStart(2, "0")}.json`), JSON.stringify(s)));
console.log(`Символов: ${n}, файлов: ${SHARDS}`);
