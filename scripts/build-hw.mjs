// Данные для рукописного поиска: средние линии черт из site/data/strokes (Make Me a Hanzi)
// → site/data/hw.txt, по K точек на черту, иероглифы по частоте (jieba, затем HSK, затем по коду).
// Запуск: node scripts/build-hw.mjs [raw/jieba-dict.txt]
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeStrokes } from "../src/core/handwriting.ts";

const K = 6;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdir = join(root, "site/data/strokes");

const chars = new Map();
for (const f of readdirSync(sdir)) if (f.endsWith(".json")) {
  const d = JSON.parse(readFileSync(join(sdir, f), "utf8"));
  for (const [ch, v] of Object.entries(d)) chars.set(ch, v.medians);
}

// частота иероглифа: сумма частот слов jieba, где он встречается
const freq = new Map();
const jieba = process.argv[2] ?? join(root, "raw/jieba-dict.txt");
if (existsSync(jieba)) {
  for (const line of readFileSync(jieba, "utf8").split("\n")) {
    const [w, n] = line.split(" ");
    if (!w || !n) continue;
    for (const ch of new Set(w)) freq.set(ch, (freq.get(ch) ?? 0) + Number(n));
  }
} else console.warn("! Нет частотного списка jieba — порядок по HSK и коду символа");
const hsk = new Map();
for (const d of JSON.parse(readFileSync(join(root, "data/decks.json"), "utf8"))) {
  for (const l of readFileSync(join(root, "data", d.file), "utf8").split("\n").slice(1)) for (const ch of l.split("\t")[0] ?? "") if (!hsk.has(ch)) hsk.set(ch, hsk.size);
}
const order = [...chars.keys()].sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0)
  || (hsk.get(a) ?? 1e9) - (hsk.get(b) ?? 1e9) || a.codePointAt(0) - b.codePointAt(0));

// Make Me a Hanzi: поле 1024×1024, y вверх, базовая линия 900
const toBox = ([x, y]) => [x / 1024, (900 - y) / 1024];
let out = `K=${K}\n`;
for (const ch of order) out += `${ch}\t${encodeStrokes(chars.get(ch).map((s) => s.map(toBox)), K)}\n`;
writeFileSync(join(root, "site/data/hw.txt"), out);
console.log(`Готово: site/data/hw.txt — ${order.length} иероглифов, ${(out.length / 1024 / 1024).toFixed(2)} МБ`);
