/**
 * Перья для письма: как выглядит черта, которую рисует пользователь.
 * Чистая геометрия без DOM: из точек черты получается SVG-путь.
 *
 * Точки — в координатах иероглифа (hanzi-writer, 1024×1024, ось y вверх),
 * t — время в мс, p — нажим стилуса 0..1 (если устройство его сообщает).
 */
export type PenType = "pencil" | "brush" | "pen" | "marker";
export type PenPoint = { x: number; y: number; t?: number; p?: number };
/** fill — залитый контур (кисть); stroke — линия заданной ширины. */
export type PenShape = { d: string; mode: "fill" | "stroke"; width: number; opacity: number };

export const PENS: { id: PenType; name: string; hint: string }[] = [
  { id: "brush", name: "Кисть", hint: "толщина от скорости и нажима, острые концы" },
  { id: "pencil", name: "Карандаш", hint: "ровная линия, как раньше" },
  { id: "pen", name: "Ручка", hint: "тонкая аккуратная линия" },
  { id: "marker", name: "Маркер", hint: "толстая мягкая линия" },
];

export const isPen = (x: unknown): x is PenType => PENS.some((p) => p.id === x);

const r1 = (n: number) => Math.round(n * 10) / 10;
const dist = (a: PenPoint, b: PenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function linePath(pts: PenPoint[]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${r1(p.x)} ${r1(p.y)}`).join("");
}

/** Убирает дрожание пальца: сглаживание соседних точек (концы на месте). */
export function smooth(pts: PenPoint[], passes = 2): PenPoint[] {
  let out = pts;
  for (let k = 0; k < passes; k++) {
    if (out.length < 3) break;
    out = out.map((p, i) => {
      if (i === 0 || i === out.length - 1) return p;
      const a = out[i - 1], b = out[i + 1];
      return { ...p, x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
    });
  }
  return out;
}

/** Равномерные точки через шаг step, время и нажим интерполируются. */
export function resample(pts: PenPoint[], step: number): PenPoint[] {
  if (pts.length < 2) return pts.slice();
  const out: PenPoint[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = dist(a, b);
    if (len === 0) continue;
    let s = step - carry;
    while (s <= len) {
      const f = s / len;
      out.push({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        t: a.t !== undefined && b.t !== undefined ? a.t + (b.t - a.t) * f : undefined,
        p: a.p !== undefined && b.p !== undefined ? a.p + (b.p - a.p) * f : undefined,
      });
      s += step;
    }
    carry = len - (s - step);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.3) out.push(last);
  return out;
}

/** Нажим стилуса есть, если устройство сообщает разные значения (мышь и палец дают 0 или 0.5). */
function hasPressure(pts: PenPoint[]): boolean {
  const ps = pts.map((p) => p.p).filter((p): p is number => p !== undefined && p > 0);
  if (ps.length < Math.max(2, pts.length / 2)) return false;
  return Math.max(...ps) - Math.min(...ps) > 0.02 || (ps[0] !== 0.5 && ps[0] !== 1);
}

/**
 * Толщина кисти в каждой точке (в долях base).
 * Медленно — шире (кисть «набухает»), быстро — тоньше; начало — круглое, с нажимом и лёгким утолщением,
 * конец — острый «выход кисти», если черту закончили на скорости, и тупой, если остановились.
 */
export function brushWidths(pts: PenPoint[], base: number): number[] {
  const n = pts.length;
  if (n === 0) return [];
  const pressure = hasPressure(pts);
  const timed = pts.every((p) => p.t !== undefined) && pts[n - 1].t! > pts[0].t!;
  // скорость, единиц иероглифа за мс, сглаженная
  const speed: number[] = new Array(n).fill(1.5);
  if (timed) {
    for (let i = 1; i < n; i++) {
      const dt = Math.max(4, pts[i].t! - pts[i - 1].t!);
      speed[i] = dist(pts[i], pts[i - 1]) / dt;
    }
    speed[0] = speed[1] ?? 1.5;
    for (let i = 1; i < n; i++) speed[i] = speed[i - 1] * 0.7 + speed[i] * 0.3;
  }
  const w = pts.map((p, i) => {
    if (pressure && p.p !== undefined) return 0.3 + 1.0 * clamp(p.p, 0, 1);
    // ~1.5 ед/мс — спокойное письмо (черта через пол-иероглифа за 0.4 с), 4+ — быстрый росчерк.
    // Разброс умеренный: кисть не должна «заливать» иероглиф при медленном письме пальцем.
    return clamp(1.25 - 0.22 * speed[i], 0.45, 1.2);
  });
  // плавность толщины
  for (let i = 1; i < n; i++) w[i] = w[i - 1] * 0.6 + w[i] * 0.4;

  // длины вдоль черты
  const along = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1] + dist(pts[i], pts[i - 1]));
  const total = along[n - 1];

  // начало: кисть ложится с нажимом (顿笔) — круглое начало и лёгкое утолщение, а не острый «наконечник»
  const head = Math.min(base * 1.4, total * 0.3);
  // конец: острый, если уходили быстро
  const endSpeed = timed ? speed[n - 1] : 1.5;
  const tail = Math.min(total * 0.45, base * clamp((endSpeed - 1) * 1.2, 0.4, 4));
  return w.map((v, i) => {
    let k = 1;
    if (head > 0 && along[i] < head) { const u = along[i] / head; k *= 0.85 + 0.15 * u + 0.1 * Math.sin(u * Math.PI); }
    const left = total - along[i];
    if (tail > 0 && left < tail) k *= 0.12 + 0.88 * Math.sin((left / tail) * Math.PI / 2);
    return v * k;
  });
}

/** Залитый контур переменной толщины с круглыми концами. widths — полная толщина в каждой точке. */
export function outlinePath(pts: PenPoint[], widths: number[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return circle(pts[0], widths[0] / 2);
  const L: PenPoint[] = [], R: PenPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // На изгибе (横折, 竖弯) отступ по биссектрисе даёт ширину h·cos(φ/2) — угол «сужается».
    // Компенсация как у соединения «miter», но не больше 1,8 раза, чтобы на острых углах не было шипов.
    const h = (widths[i] / 2) * (i > 0 && i < n - 1 ? miter(pts[i - 1], pts[i], pts[i + 1]) : 1);
    L.push({ x: pts[i].x - dy * h, y: pts[i].y + dx * h });
    R.push({ x: pts[i].x + dy * h, y: pts[i].y - dx * h });
  }
  const cap = (c: PenPoint, from: PenPoint, r: number) => {
    // полукруг вокруг c, начиная от точки from, на 180° (8 шагов)
    const a0 = Math.atan2(from.y - c.y, from.x - c.x);
    const out: PenPoint[] = [];
    for (let k = 1; k < 8; k++) {
      const a = a0 - (Math.PI * k) / 8;
      out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
    return out;
  };
  const ring = [
    ...L,
    ...cap(pts[n - 1], L[n - 1], widths[n - 1] / 2),
    ...R.reverse(),
    ...cap(pts[0], R[n - 1], widths[0] / 2),
  ];
  return linePath(ring) + "Z";
}

/** Во сколько раз увеличить отступ в точке b, чтобы толщина на изгибе a→b→c не сужалась. */
export function miter(a: PenPoint, b: PenPoint, c: PenPoint): number {
  const l1 = dist(a, b), l2 = dist(b, c);
  if (!l1 || !l2) return 1;
  const sx = (b.x - a.x) / l1 + (c.x - b.x) / l2, sy = (b.y - a.y) / l1 + (c.y - b.y) / l2;
  const cosHalf = Math.hypot(sx, sy) / 2; // cos половины угла поворота
  return 1 / Math.max(cosHalf, 1 / 1.8);
}

function circle(c: PenPoint, r: number): string {
  const pts: PenPoint[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (Math.PI * 2 * k) / 12;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return linePath(pts) + "Z";
}

/** Толщина пера в настройках: множитель к обычной толщине. */
export const PEN_SIZE = { min: 0.4, max: 2.5, step: 0.1, def: 1 };
export const clampSize = (v: unknown) => typeof v === "number" && isFinite(v) ? clamp(Math.round(v * 10) / 10, PEN_SIZE.min, PEN_SIZE.max) : PEN_SIZE.def;

/** Образец черты для предпросмотра пера в настройках: горизонталь с нажимом и откидная — в координатах 0…1024 × 0…240. */
export function samplePoints(): PenPoint[] {
  // горизонтальная черта 一: нажим в начале (медленно), быстрый ход с лёгкой дугой, замедление и нажим в конце
  const out: PenPoint[] = [];
  let t = 0;
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push({ x: 140 + u * 740, y: 150 - Math.sin(u * Math.PI) * 22 + (u > 0.92 ? (u - 0.92) * 220 : 0), t, p: 0.5 });
    const ease = Math.sin(u * Math.PI); // быстро в середине
    t += 6 + (1 - ease) * 34;
  }
  return out;
}

/** Главная функция: как нарисовать черту выбранным пером. base — толщина «карандаша», size — множитель из настроек. */
export function penShape(type: PenType, raw: PenPoint[], base: number, size = 1): PenShape {
  base *= size;
  if (raw.length === 0) return { d: "", mode: "stroke", width: base, opacity: 1 };
  if (type === "pencil") return { d: linePath(raw), mode: "stroke", width: base, opacity: 1 };
  const pts = smooth(raw);
  if (type === "pen") return { d: linePath(pts), mode: "stroke", width: base * 0.5, opacity: 1 };
  if (type === "marker") return { d: linePath(pts), mode: "stroke", width: base * 1.8, opacity: 0.88 };
  // кисть: основа шире карандаша (в 1,6 раза, максимум ~2 карандаша), точки через равный шаг
  const b = base * 1.6;
  const even = resample(pts, Math.max(2, b * 0.18));
  return { d: outlinePath(even, brushWidths(even, b).map((k) => k * b)), mode: "fill", width: 0, opacity: 1 };
}
