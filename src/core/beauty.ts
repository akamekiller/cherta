/**
 * Оценка почерка: насколько написанный иероглиф похож на образец по пропорциям, месту, длине и наклону черт.
 * Сравниваются черты пользователя (в координатах иероглифа hanzi-writer, 1024, y вверх) со средними линиями
 * образца (medians Make Me a Hanzi) — черта к черте, в порядке написания (проверка порядка уже прошла).
 */
export type P = { x: number; y: number };

export type Beauty = {
  score: number;        // 0–100
  notes: string[];      // подсказки по-русски, самые важные первыми
  strokes: number[];    // оценка каждой черты 0–100
};

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function resample(pts: P[], k: number): P[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: k }, () => pts[0]);
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + dist(pts[i], pts[i - 1]));
  const total = d[d.length - 1] || 1;
  const out: P[] = [];
  let j = 0;
  for (let i = 0; i < k; i++) {
    const t = (total * i) / (k - 1);
    while (j < pts.length - 2 && d[j + 1] < t) j++;
    const seg = d[j + 1] - d[j] || 1;
    const u = Math.min(1, Math.max(0, (t - d[j]) / seg));
    out.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * u, y: pts[j].y + (pts[j + 1].y - pts[j].y) * u });
  }
  return out;
}

function bbox(strokes: P[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

const length = (s: P[]) => s.reduce((a, p, i) => (i ? a + dist(p, s[i - 1]) : 0), 0);
const angle = (s: P[]) => Math.atan2(s[s.length - 1].y - s[0].y, s[s.length - 1].x - s[0].x);
const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** user — черты пользователя; ref — средние линии образца (массивы [x, y]). */
export function scoreHandwriting(user: P[][], refRaw: number[][][]): Beauty {
  const ref: P[][] = refRaw.map((s) => s.map(([x, y]) => ({ x, y })));
  const n = Math.min(user.length, ref.length);
  if (!n || user.slice(0, n).some((s) => s.length < 1)) return { score: 0, notes: ["Нет данных для оценки"], strokes: [] };
  const U = user.slice(0, n), R = ref.slice(0, n);
  const bu = bbox(U), br = bbox(R);
  const sizeR = Math.max(br.w, br.h, 200);
  const sizeU = Math.max(bu.w, bu.h, 1);
  const notes: [number, string][] = [];

  // 1. Место и размер в клетке (как на прописях: иероглиф должен заполнять клетку так же, как образец)
  const ratio = sizeU / sizeR;
  const dx = (bu.cx - br.cx) / 1024, dy = (bu.cy - br.cy) / 1024;
  let place = 0;
  place += Math.min(25, Math.abs(Math.log(ratio)) * 40);
  place += Math.min(20, Math.hypot(dx, dy) * 90);
  if (ratio < 0.75) notes.push([25 - ratio * 20, "Иероглиф мелковат — пишите на всю клетку"]);
  else if (ratio > 1.3) notes.push([ratio * 10, "Иероглиф крупнее образца"]);
  if (Math.abs(dx) > 0.08 || Math.abs(dy) > 0.08) {
    const where = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "вправо" : "влево") : (dy > 0 ? "вверх" : "вниз");
    notes.push([Math.hypot(dx, dy) * 100, `Иероглиф смещён ${where} от центра`]);
  }

  // 2. Форма: черты пользователя, вписанные в рамку образца, против черт образца
  const k = 10;
  const sc = Math.max(br.w, br.h, 200) / Math.max(bu.w, bu.h, 1);
  const fit = U.map((s) => s.map((p) => ({ x: (p.x - bu.cx) * sc + br.cx, y: (p.y - bu.cy) * sc + br.cy })));
  const per: number[] = [];
  let lenErr = 0, slantSum = 0, slantN = 0;
  for (let i = 0; i < n; i++) {
    const a = resample(fit[i], k), b = resample(R[i], k);
    const shape = a.reduce((acc, p, j) => acc + dist(p, b[j]), 0) / k / sizeR; // доля размера иероглифа
    const lr = (length(fit[i]) + 1) / (length(R[i]) + 1);
    const ad = Math.abs(angDiff(angle(fit[i]), angle(R[i])));
    lenErr += Math.log(lr);
    // наклон считаем по длинным почти горизонтальным чертам (横)
    const ra = angle(R[i]);
    if (length(R[i]) > sizeR * 0.3 && Math.abs(Math.sin(ra)) < 0.35) { slantSum += angDiff(angle(fit[i]), ra); slantN++; }
    const s = 100 - Math.min(100, shape * 260 + Math.abs(Math.log(lr)) * 30 + (ad > 0.35 ? (ad - 0.35) * 40 : 0));
    per.push(Math.max(0, Math.round(s)));
  }
  const meanStroke = per.reduce((a, b) => a + b, 0) / n;
  const worst = per.indexOf(Math.min(...per));
  if (n > 1 && per[worst] < 60) notes.push([80 - per[worst], `Черта ${worst + 1} заметно отличается от образца`]);
  const lenAvg = lenErr / n;
  if (lenAvg < -0.18) notes.push([-lenAvg * 60, "Черты короче, чем в образце"]);
  else if (lenAvg > 0.18) notes.push([lenAvg * 60, "Черты длиннее, чем в образце"]);
  if (slantN) {
    const sl = slantSum / slantN;
    if (Math.abs(sl) > 0.12) notes.push([Math.abs(sl) * 80, sl > 0 ? "Горизонтальные черты уходят вверх сильнее образца" : "Горизонтальные черты наклонены вниз"]);
  }

  const score = Math.max(0, Math.min(100, Math.round(meanStroke * 0.8 + (100 - place * 2) * 0.2 - (user.length !== ref.length ? 10 : 0))));
  notes.sort((a, b) => b[0] - a[0]);
  if (!notes.length) notes.push([0, score >= 85 ? "Очень близко к образцу" : "Пропорции в порядке"]);
  return { score, notes: notes.map((x) => x[1]), strokes: per };
}

/** Словесная оценка для подписи. */
export const beautyLabel = (score: number) => score >= 90 ? "отлично" : score >= 75 ? "хорошо" : score >= 55 ? "неплохо" : "есть над чем поработать";
