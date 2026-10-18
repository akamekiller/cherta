/**
 * Рукописный поиск иероглифа: распознавание по чертам без учёта их порядка.
 * Эталоны — средние линии черт (medians) из Make Me a Hanzi, те же данные, что для проверки письма.
 * Данные: site/data/hw.txt (scripts/build-hw.mjs): первая строка «K=6», дальше «иероглиф\tкоды»,
 * каждая черта — K точек, каждая точка — 2 символа алфавита из 64 (x, y в клетке 0..63, y вниз).
 * Строки идут по частоте иероглифа — при равной похожести выше частый.
 */

export type Pt = [number, number];
export const HW_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const DECODE = new Map([...HW_ALPHABET].map((c, i) => [c, i]));

export type HwDb = {
  k: number;
  chars: string[];
  /** Черты в координатах клетки 0..1: strokes[i][s] = [x0,y0,x1,y1,…] */
  box: Float32Array[][];
  /** Те же черты, вписанные в собственную рамку иероглифа (чтобы не зависеть от размера и места на поле). */
  fit: Float32Array[][];
  byCount: Map<number, number[]>;
};

export function parseHw(text: string): HwDb {
  const lines = text.replace(/\r/g, "").split("\n");
  const k = Number(/^K=(\d+)/.exec(lines[0] ?? "")?.[1] ?? 0);
  if (!k) throw new Error("Неверный файл данных рукописного ввода");
  const db: HwDb = { k, chars: [], box: [], fit: [], byCount: new Map() };
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    const tab = line.indexOf("\t");
    const ch = line.slice(0, tab);
    const code = line.slice(tab + 1);
    const per = k * 2;
    const strokes: Float32Array[] = [];
    for (let p = 0; p + per <= code.length; p += per) {
      const a = new Float32Array(per);
      for (let j = 0; j < per; j++) a[j] = (DECODE.get(code[p + j]) ?? 0) / 63;
      strokes.push(a);
    }
    if (!strokes.length) continue;
    const i = db.chars.length;
    db.chars.push(ch);
    db.box.push(strokes);
    db.fit.push(fitToFrame(strokes));
    const n = strokes.length;
    (db.byCount.get(n) ?? db.byCount.set(n, []).get(n)!).push(i);
  }
  return db;
}

/** Кодирование черт (для сборки данных и тестов): точки уже в клетке 0..1, y вниз. */
export function encodeStrokes(strokes: Pt[][], k: number): string {
  let out = "";
  for (const s of strokes) for (const [x, y] of resample(s, k)) {
    out += HW_ALPHABET[Math.max(0, Math.min(63, Math.round(x * 63)))];
    out += HW_ALPHABET[Math.max(0, Math.min(63, Math.round(y * 63)))];
  }
  return out;
}

/** k точек на равных расстояниях вдоль линии. */
export function resample(pts: Pt[], k: number): Pt[] {
  if (!pts.length) return [];
  if (pts.length === 1) return Array.from({ length: k }, () => [pts[0][0], pts[0][1]] as Pt);
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = d[d.length - 1];
  const out: Pt[] = [];
  let j = 0;
  for (let i = 0; i < k; i++) {
    const t = total * (k === 1 ? 0 : i / (k - 1));
    while (j < pts.length - 2 && d[j + 1] < t) j++;
    const seg = d[j + 1] - d[j] || 1;
    const u = Math.min(1, Math.max(0, (t - d[j]) / seg));
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]);
  }
  return out;
}

function toFlat(strokes: Pt[][], k: number): Float32Array[] {
  return strokes.filter((s) => s.length).map((s) => {
    const a = new Float32Array(k * 2);
    resample(s, k).forEach(([x, y], i) => { a[i * 2] = x; a[i * 2 + 1] = y; });
    return a;
  });
}

/** Вписать черты в квадрат 0..1 по рамке всех черт, сохранив пропорции, по центру. */
export function fitToFrame(strokes: Float32Array[]): Float32Array[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.length; i += 2) {
    x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]);
  }
  const size = Math.max(x1 - x0, y1 - y0, 0.15); // точку или короткую черту не растягиваем на всё поле
  const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
  return strokes.map((s) => {
    const a = new Float32Array(s.length);
    for (let i = 0; i < s.length; i += 2) { a[i] = (s[i] - ox) / size + 0.5; a[i + 1] = (s[i + 1] - oy) / size + 0.5; }
    return a;
  });
}

/** Похожесть двух черт: средняя дистанция точек; обратное направление допускается со штрафом. */
function strokeCost(a: Float32Array, b: Float32Array): number {
  const k = a.length / 2;
  let fwd = 0, rev = 0;
  for (let i = 0; i < k; i++) {
    const j = k - 1 - i;
    fwd += Math.hypot(a[i * 2] - b[i * 2], a[i * 2 + 1] - b[i * 2 + 1]);
    rev += Math.hypot(a[i * 2] - b[j * 2], a[i * 2 + 1] - b[j * 2 + 1]);
  }
  return Math.min(fwd, rev + 0.25 * k) / k;
}

/**
 * Минимальное назначение строк столбцам (венгерский алгоритм), n ≤ m. Возвращает сумму стоимостей.
 * cost — плоский массив n×m.
 */
export function assignCost(cost: Float64Array, n: number, m: number): number {
  const INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  const minv = new Float64Array(m + 1);
  const used = new Uint8Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(INF); used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[(i0 - 1) * m + (j - 1)] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  let sum = 0;
  for (let j = 1; j <= m; j++) if (p[j]) sum += cost[(p[j] - 1) * m + (j - 1)];
  return sum;
}

const MISSING = 0.035; // за каждую ненаписанную черту эталона (иероглиф ещё дописывается)
const EXTRA = 0.12;    // за лишнюю черту пользователя

function charCost(user: Float32Array[], ref: Float32Array[]): number {
  const n = user.length, m = ref.length;
  const rows = Math.min(n, m), cols = Math.max(n, m);
  const [A, B] = n <= m ? [user, ref] : [ref, user];
  const cost = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) cost[i * cols + j] = strokeCost(A[i], B[j]);
  const sum = assignCost(cost, rows, cols);
  return sum / rows + (m > n ? (m - n) * MISSING : (n - m) * EXTRA);
}

/** Быстрая оценка для отбора: каждой черте пользователя — ближайшая черта эталона по концам (без назначения). */
function roughCost(user: Float32Array[], ref: Float32Array[]): number {
  let sum = 0;
  for (const a of user) {
    const L = a.length;
    let best = Infinity;
    for (const b of ref) {
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[L - 2] - b[L - 2]) + Math.abs(a[L - 1] - b[L - 1]);
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / user.length;
}

const SHORTLIST = 250;

/**
 * Похожие иероглифы для нарисованных черт (координаты в клетке 0..1, y вниз), лучшие первыми.
 * Полный иероглиф сравнивается и по месту в клетке, и по форме в собственной рамке (можно писать мельче или сбоку);
 * недописанный — по месту в клетке. Сначала грубый отбор, потом точное сравнение с назначением черт.
 */
export function recognize(db: HwDb, strokes: Pt[][], limit = 10): string[] {
  const user = toFlat(strokes, db.k);
  const n = user.length;
  if (!n) return [];
  const userFit = fitToFrame(user);
  const rough: [number, number][] = [];
  for (let m = Math.max(1, n - 1); m <= n + 4; m++) {
    for (const i of db.byCount.get(m) ?? []) {
      const full = m <= n + 1;
      const c = full ? 0.4 * roughCost(user, db.box[i]) + 0.6 * roughCost(userFit, db.fit[i]) : roughCost(user, db.box[i]);
      rough.push([c + (m > n ? (m - n) * MISSING : 0), i]);
    }
  }
  rough.sort((a, b) => a[0] - b[0]);
  const scored: [number, number][] = [];
  for (const [, i] of rough.slice(0, SHORTLIST)) {
    const m = db.box[i].length;
    const c = m <= n + 1 ? 0.4 * charCost(user, db.box[i]) + 0.6 * charCost(userFit, db.fit[i]) : charCost(user, db.box[i]);
    scored.push([c + i * 2e-6, i]); // при равенстве — частый иероглиф выше
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map(([, i]) => db.chars[i]);
}
