/**
 * Проверка свободно написанного иероглифа (тетрадь на планшете: пишется вся строка, проверка — после неё).
 * Черты пользователя сравниваются со средними линиями образца: число черт, какая черта какой соответствует
 * (по форме и месту после вписывания в рамку образца), порядок и направление, затем красота — scoreHandwriting.
 * Координаты — как у hanzi-writer: 1024 × 1024, y вверх.
 */
import { scoreHandwriting, type P } from "./beauty.ts";

export type CellCheck = {
  ok: boolean;            // иероглиф написан верно: все черты на месте, порядок и направление верные
  score: number;          // красота 0–100 (0 — если не похоже)
  notes: string[];        // что не так, самое важное первым
  got: number;            // сколько черт написано
  need: number;           // сколько черт в образце
};

const K = 12;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function resample(pts: P[], k = K): P[] {
  if (!pts.length) return [];
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
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

const meanDist = (a: P[], b: P[]) => a.reduce((s, p, i) => s + dist(p, b[i]), 0) / a.length;

export function checkCell(user: P[][], medians: number[][][]): CellCheck {
  const ref: P[][] = medians.map((s) => s.map(([x, y]) => ({ x, y })));
  const need = ref.length, got = user.length;
  if (!got) return { ok: false, score: 0, notes: ["Клетка пустая"], got, need };
  const bu = bbox(user), br = bbox(ref);
  const size = Math.max(br.w, br.h, 200);
  const sc = size / Math.max(bu.w, bu.h, 1);
  const fit = user.map((s) => resample(s.map((p) => ({ x: (p.x - bu.cx) * sc + br.cx, y: (p.y - bu.cy) * sc + br.cy }))));
  const R = ref.map((s) => resample(s));
  // стоимость пары «черта пользователя — черта образца»: лучшая из прямого и обратного хода
  const pairs: { i: number; j: number; c: number; rev: boolean }[] = [];
  for (let i = 0; i < got; i++) for (let j = 0; j < need; j++) {
    const f = meanDist(fit[i], R[j]) / size;
    const b = meanDist([...fit[i]].reverse(), R[j]) / size;
    pairs.push({ i, j, c: Math.min(f, b), rev: b < f * 0.7 && b < 0.12 });
  }
  pairs.sort((a, b) => a.c - b.c);
  const ui = new Map<number, (typeof pairs)[number]>(), rj = new Set<number>();
  for (const p of pairs) if (!ui.has(p.i) && !rj.has(p.j)) { ui.set(p.i, p); rj.add(p.j); }
  const notes: string[] = [];
  if (got !== need) notes.push(got < need ? `Черт ${got} вместо ${need} — какой-то не хватает` : `Черт ${got} вместо ${need} — есть лишние`);
  const matched = [...ui.values()];
  const cost = matched.reduce((s, p) => s + p.c, 0) / Math.max(1, matched.length);
  // при неверном числе черт рамка сбита, поэтому порог мягче, а «не похоже» не пишем — главное там число черт
  const like = cost < (got === need ? 0.2 : 0.3);
  if (!like && got === need) notes.push("Не похоже на образец");
  // порядок: черты пользователя по очереди должны соответствовать чертам образца по очереди
  let order = true;
  if (like) {
    const seq = [...ui.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p.j);
    for (let k = 0; k < seq.length; k++) {
      const wrong = got === need ? seq[k] !== k : k > 0 && seq[k] < seq[k - 1];
      if (wrong) { order = false; notes.push(`Порядок черт: ${k + 1}-й написана черта ${seq[k] + 1}`); break; }
    }
    const rev = matched.filter((p) => p.rev).map((p) => p.j + 1).sort((a, b) => a - b);
    if (rev.length) notes.push(`Не в ту сторону: ${rev.length === 1 ? "черта" : "черты"} ${rev.join(", ")}`);
  }
  // красота — по чертам в порядке образца
  let score = 0;
  if (like) {
    const byRef: P[][] = [];
    for (const [i, p] of ui) byRef[p.j] = user[i];
    const listU: P[][] = [], listR: number[][][] = [];
    byRef.forEach((s, j) => { if (s) { listU.push(s); listR.push(medians[j]); } });
    const b = scoreHandwriting(listU, listR);
    score = Math.max(0, b.score - (got !== need ? 10 : 0));
    // при пропущенных или лишних чертах замечания о месте и размере только запутают
    if (got === need) for (const n of b.notes) if (!notes.includes(n) && n !== "Пропорции в порядке" && n !== "Очень близко к образцу") notes.push(n);
  }
  const ok = like && got === need && order && !matched.some((p) => p.rev);
  return { ok, score, notes: notes.length ? notes : ["Верно"], got, need };
}
