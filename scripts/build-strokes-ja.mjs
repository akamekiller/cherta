// Японские данные черт из KanjiVG → формат hanzi-writer (strokes + medians), как у китайских.
// Запуск: node scripts/build-strokes-ja.mjs <папка kanjivg/kanji>
// KanjiVG (https://kanjivg.tagaini.net, © Ulrich Apel, CC BY-SA 3.0) даёт только средние линии черт (svg 109×109).
// Контур черты (нужен hanzi-writer для показа и анимации) строится здесь: линия обводится переменной толщиной —
// чуть толще в начале, сужение к концу у откидных черт (㇒ ㇏ ㇀ …), круглые концы у остальных.
// Результат: site/data/strokes-ja/NN.json (64 части по коду символа, как site/data/strokes) и chars.txt (список знаков).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] ?? join(root, "raw/kanjivg/kanji");
const out = join(root, "site/data/strokes-ja");
const SHARDS = 64;
const K = 1024 / 109;

/** Разбор svg-пути KanjiVG (M m C c S s L l Z z, числа через запятую/пробел/минус) → ломаная. */
export function pathPoints(d) {
  const toks = d.match(/[MmCcSsLlZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, lc = null;
  const num = () => Number(toks[i++]);
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const n = 12;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      pts.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
    lc = [x2, y2]; x = x3; y = y3;
  };
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    switch (cmd) {
      case "M": x = num(); y = num(); sx = x; sy = y; pts.push([x, y]); cmd = "L"; lc = null; break;
      case "m": x += num(); y += num(); sx = x; sy = y; pts.push([x, y]); cmd = "l"; lc = null; break;
      case "L": x = num(); y = num(); pts.push([x, y]); lc = null; break;
      case "l": x += num(); y += num(); pts.push([x, y]); lc = null; break;
      case "C": { const a = [num(), num(), num(), num(), num(), num()]; cubic(...a); break; }
      case "c": { const a = [num(), num(), num(), num(), num(), num()]; cubic(x + a[0], y + a[1], x + a[2], y + a[3], x + a[4], y + a[5]); break; }
      case "S": case "s": {
        const rel = cmd === "s";
        const [x2, y2, x3, y3] = [num(), num(), num(), num()];
        const x1 = lc ? 2 * x - lc[0] : x, y1 = lc ? 2 * y - lc[1] : y;
        cubic(x1, y1, rel ? x + x2 : x2, rel ? y + y2 : y2, rel ? x + x3 : x3, rel ? y + y3 : y3);
        break;
      }
      case "Z": case "z": x = sx; y = sy; pts.push([x, y]); break;
      default: i++;
    }
  }
  return pts;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = dist(a, b);
    if (!len) continue;
    let s = step - carry;
    while (s <= len) { const f = s / len; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); s += step; }
    carry = len - (s - step);
  }
  if (dist(out.at(-1), pts.at(-1)) > step * 0.3) out.push(pts.at(-1));
  return out;
}

/** Упрощение Рамера — Дугласа — Пойкера (средняя линия для проверки черты: 2–10 точек, как у Make Me a Hanzi). */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  const L = dist(a, b) || 1e-9;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dd = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
    if (dd > far) { far = dd; at = i; }
  }
  if (far <= eps) return [a, b];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

const SWEEP = /[㇒㇏㇀㇓㇇㇋㇌]/; // откидные: сужаются к концу

/** Контур черты: обводка ломаной переменной толщиной (полуширина в единицах 109), круглые концы. */
export function outline(line, type = "") {
  const pts = resample(line, 0.8);
  if (pts.length < 2) pts.push([pts[0][0] + 0.01, pts[0][1]]);
  const n = pts.length;
  const total = pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0) || 1;
  const sweep = SWEEP.test(type);
  const dot = /㇔/.test(type) && total < 14;
  let run = 0;
  const half = pts.map((p, i) => {
    if (i) run += dist(pts[i - 1], p);
    const t = run / total;
    let w = 2.8 + 0.4 * Math.max(0, 1 - t / 0.15); // нажим в начале
    if (sweep && t > 0.55) w *= 1 - 0.78 * ((t - 0.55) / 0.45) ** 1.3; // выход кисти
    if (dot) w = 2.2 + 1.3 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ;
    return w;
  });
  // нормали по сглаженному направлению (через соседей) — меньше изломов на поворотах
  const nrm = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const left = pts.map((p, i) => [p[0] + nrm[i][0] * half[i], p[1] + nrm[i][1] * half[i]]);
  const right = pts.map((p, i) => [p[0] - nrm[i][0] * half[i], p[1] - nrm[i][1] * half[i]]);
  const cap = (c, from, r, steps = 6) => { // полукруг вокруг конца c, начиная с направления from
    const a0 = Math.atan2(from[1], from[0]);
    return Array.from({ length: steps - 1 }, (_, k) => {
      const a = a0 - (Math.PI * (k + 1)) / steps;
      return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    });
  };
  const endR = half[n - 1], startR = half[0];
  const poly = [
    ...left,
    ...(endR > 0.6 ? cap(pts[n - 1], nrm[n - 1], endR) : []),
    ...right.reverse(),
    ...cap(pts[0], [-nrm[0][0], -nrm[0][1]], startR),
  ];
  // контур упрощается (точки почти на прямой не нужны) — файлы в разы меньше; замкнутый контур — двумя половинами
  const mid = Math.floor(poly.length / 2);
  return [...rdp(poly.slice(0, mid + 1), 0.12).slice(0, -1), ...rdp([...poly.slice(mid), poly[0]], 0.12).slice(0, -1)];
}

const X = (x) => Math.round(x * K);
const Y = (y) => Math.round(900 - y * K);
const pathOf = (poly) => `M ${poly.map(([x, y]) => `${X(x)} ${Y(y)}`).join(" L ")} Z`;

export function convert(svg) {
  const strokes = [], medians = [];
  for (const m of svg.matchAll(/<path[^>]*?(?:kvg:type="([^"]*)")?[^>]*?\sd="([^"]+)"/g)) {
    const type = (m[0].match(/kvg:type="([^"]*)"/) ?? [])[1] ?? "";
    const line = pathPoints(m[2]);
    if (line.length < 1) continue;
    strokes.push(pathOf(outline(line, type)));
    const med = rdp(resample(line, 0.8), 0.9);
    medians.push((med.length < 2 ? [line[0], line.at(-1)] : med).map(([x, y]) => [X(x), Y(y)]));
  }
  return { strokes, medians };
}

const isCjk = (cp) => (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || cp === 0x3005;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = readdirSync(src).filter((f) => /^[0-9a-f]{5}\.svg$/.test(f));
  const shards = Array.from({ length: SHARDS }, () => ({}));
  const chars = [];
  for (const f of files) {
    const cp = parseInt(f.slice(0, 5), 16);
    if (!isCjk(cp)) continue;
    const ch = String.fromCodePoint(cp);
    const data = convert(readFileSync(join(src, f), "utf8"));
    if (!data.strokes.length) continue;
    shards[cp % SHARDS][ch] = data;
    chars.push(ch);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let bytes = 0;
  shards.forEach((s, n) => { const t = JSON.stringify(s); bytes += t.length; writeFileSync(join(out, `${String(n).padStart(2, "0")}.json`), t); });
  writeFileSync(join(out, "chars.txt"), chars.join(""));
  console.log(`знаков: ${chars.length}, всего ${(bytes / 1048576).toFixed(1)} МБ`);
}
