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
export type PenShape = {
  d: string; mode: "fill" | "stroke"; width: number; opacity: number;
  /** Длина черты от начала, до которой её вид уже не изменится, сколько бы точек ни добавили (0 — рисовать целиком). */
  stable?: number;
};
/** Кусок черты по длине от начала: from…to (to не задан — до конца). */
export type PenRange = { from: number; to?: number };

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
/** Сглаженная скорость кисти в каждой точке (единиц за мс). */
function brushSpeed(pts: PenPoint[]): number[] {
  const n = pts.length;
  const speed: number[] = new Array(n).fill(1.5);
  const timed = n > 1 && pts.every((p) => p.t !== undefined) && pts[n - 1].t! > pts[0].t!;
  if (timed) {
    for (let i = 1; i < n; i++) {
      const dt = Math.max(4, pts[i].t! - pts[i - 1].t!);
      speed[i] = dist(pts[i], pts[i - 1]) / dt;
    }
    speed[0] = speed[1] ?? 1.5;
    for (let i = 1; i < n; i++) speed[i] = speed[i - 1] * 0.7 + speed[i] * 0.3;
  }
  return speed;
}

/** Длина острого «выхода» в конце черты. */
const tailLen = (total: number, base: number, endSpeed: number) => Math.min(total * 0.45, base * clamp((endSpeed - 1) * 1.2, 0.4, 4));

export function brushWidths(pts: PenPoint[], base: number): number[] {
  const n = pts.length;
  if (n === 0) return [];
  const pressure = hasPressure(pts);
  const timed = pts.every((p) => p.t !== undefined) && pts[n - 1].t! > pts[0].t!;
  // скорость, единиц иероглифа за мс, сглаженная
  const speed = brushSpeed(pts);
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
  const tail = tailLen(total, base, endSpeed);
  return w.map((v, i) => {
    let k = 1;
    if (head > 0 && along[i] < head) { const u = along[i] / head; k *= 0.85 + 0.15 * u + 0.1 * Math.sin(u * Math.PI); }
    const left = total - along[i];
    if (tail > 0 && left < tail) k *= 0.12 + 0.88 * Math.sin((left / tail) * Math.PI / 2);
    return v * k;
  });
}

/**
 * Залитый контур переменной толщины с круглыми концами. widths — полная толщина в каждой точке.
 * На резком повороте (больше ~50°) одна обводка выворачивается внутрь угла и даёт дыру или «обрыв»,
 * поэтому черта режется на куски по углам, а угол закрывается кругом. Все куски обходятся в одну сторону —
 * при обычном правиле заливки (nonzero) их наложения остаются залитыми.
 */
export function outlinePath(pts: PenPoint[], widths: number[], from = 0, to = pts.length - 1): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1 || from >= to) return circle(pts[from], widths[from] / 2);
  // углы ищутся по всей черте — у куска на краю угол не потеряется
  const corners = sharpCorners(pts, widths).filter((c) => c > from && c < to);
  let d = "";
  let s = from;
  for (const c of [...corners, to]) {
    d += ringPath(pts.slice(s, c + 1), widths.slice(s, c + 1));
    s = c;
  }
  for (const c of corners) d += circle(pts[c], widths[c] / 2);
  return d;
}

/** Точки, где черта резко поворачивает: угол меряется по отрезкам длиной около толщины (дрожание пальца не в счёт). */
export function sharpCorners(pts: PenPoint[], widths: number[], minTurn = 50): number[] {
  const n = pts.length;
  const turn: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const r = Math.max(widths[i] * 0.75, 3);
    let j = i - 1, k = i + 1;
    while (j > 0 && dist(pts[j], pts[i]) < r) j--;
    while (k < n - 1 && dist(pts[k], pts[i]) < r) k++;
    const ax = pts[i].x - pts[j].x, ay = pts[i].y - pts[j].y, bx = pts[k].x - pts[i].x, by = pts[k].y - pts[i].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (!la || !lb) continue;
    turn[i] = (Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1)) * 180) / Math.PI;
  }
  // из подряд идущих «углов» берём самый острый; куски не короче двух точек
  const out: number[] = [];
  for (let i = 1; i < n - 1; ) {
    if (turn[i] <= minTurn) { i++; continue; }
    let best = i;
    while (i < n - 1 && turn[i] > minTurn) { if (turn[i] > turn[best]) best = i; i++; }
    if (best - (out.at(-1) ?? 0) >= 1 && n - 1 - best >= 1) out.push(best);
  }
  return out;
}

/** Одна обводка без резких углов: левый край, полукруг конца, правый край, полукруг начала. */
function ringPath(pts: PenPoint[], widths: number[]): string {
  const n = pts.length;
  if (n === 1) return circle(pts[0], widths[0] / 2);
  const L: PenPoint[] = [], R: PenPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // На плавном изгибе отступ по биссектрисе даёт ширину h·cos(φ/2) — угол «сужается»; компенсация как у «miter».
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
  return polyPath(ring);
}

/** Замкнутый многоугольник, всегда обходом против часовой (положительная площадь) — чтобы куски складывались, а не вычитались. */
function polyPath(ring: PenPoint[]): string {
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a.x * b.y - b.x * a.y; }
  return linePath(area < 0 ? ring.slice().reverse() : ring) + "Z";
}

/** Во сколько раз увеличить отступ в точке b, чтобы толщина на изгибе a→b→c не сужалась. */
export function miter(a: PenPoint, b: PenPoint, c: PenPoint): number {
  const l1 = dist(a, b), l2 = dist(b, c);
  if (!l1 || !l2) return 1;
  const sx = (b.x - a.x) / l1 + (c.x - b.x) / l2, sy = (b.y - a.y) / l1 + (c.y - b.y) / l2;
  const cosHalf = Math.hypot(sx, sy) / 2; // cos половины угла поворота
  return 1 / Math.max(cosHalf, 1 / 1.4);
}

function circle(c: PenPoint, r: number): string {
  const pts: PenPoint[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (Math.PI * 2 * k) / 12;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return polyPath(pts);
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

/** Индексы точек, которые покрывают кусок черты по длине [from, to] (с крайними точками — куски стыкуются). */
export function rangeIdx(pts: PenPoint[], from: number, to = Infinity): [number, number] {
  let s = 0, i0 = 0, i1 = pts.length - 1;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += dist(pts[i], pts[i - 1]);
    if (s <= from) i0 = i;
    if (s > to) { i1 = i; break; }
  }
  return [i0, Math.max(i0, i1)];
}

const pathLen = (pts: PenPoint[]) => { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i], pts[i - 1]); return s; };

/**
 * Главная функция: как нарисовать черту выбранным пером. base — толщина «карандаша», size — множитель из настроек.
 * range — только кусок черты (для рисования по частям: старая часть замораживается отдельным путём,
 * и телефон перерисовывает только конец черты, а не всю клетку — длинная диагональ иначе тормозит).
 */
export function penShape(type: PenType, raw: PenPoint[], base: number, size = 1, range?: PenRange): PenShape {
  base *= size;
  if (raw.length === 0) return { d: "", mode: "stroke", width: base, opacity: 1, stable: 0 };
  // запас от конца: последние точки ещё сглаживаются (два прохода — три последних отрезка),
  // предсказанный хвост (до 40) убирается при отпускании
  let near = 50;
  for (let i = Math.max(1, raw.length - 3); i < raw.length; i++) near += dist(raw[i], raw[i - 1]);
  const line = (pts: PenPoint[], width: number, opacity: number): PenShape => {
    const total = pathLen(pts);
    const [a, b] = range ? rangeIdx(pts, range.from, range.to) : [0, pts.length - 1];
    // у полупрозрачного маркера стыки кусков были бы темнее — его рисуем целиком
    return { d: linePath(pts.slice(a, b + 1)), mode: "stroke", width, opacity, stable: opacity < 1 ? 0 : Math.max(0, total - near - width) };
  };
  if (type === "pencil") return line(raw, base, 1);
  const pts = smooth(raw);
  if (type === "pen") return line(pts, base * 0.5, 1);
  if (type === "marker") return line(pts, base * 1.8, 0.88);
  // кисть: основа шире карандаша (в 1,6 раза, максимум ~2 карандаша), точки через равный шаг
  const b = base * 1.6;
  const even = resample(pts, Math.max(2, b * 0.18));
  const widths = brushWidths(even, b).map((k) => k * b);
  const total = pathLen(even);
  // начало «устоялось», когда утолщение в начале перестало зависеть от длины; конец — острый «выход» нынешней длины
  // (если к отпусканию он станет длиннее, рисовальщик увидит, что stable уменьшилось, и перерисует черту целиком)
  const speed = brushSpeed(even);
  const stable = total * 0.3 < b * 1.4 ? 0 : Math.max(0, total - tailLen(total, b, speed[speed.length - 1]) - near - b);
  if (!range) return { d: outlinePath(even, widths), mode: "fill", width: 0, opacity: 1, stable };
  const [i0, i1] = rangeIdx(even, range.from, range.to);
  return { d: outlinePath(even, widths, i0, i1), mode: "fill", width: 0, opacity: 1, stable };
}
