/**
 * Высота голоса и тоны: алгоритм YIN (de Cheveigné & Kawahara, 2002) по кадрам, кривая тона в полутонах,
 * разбиение на слоги и распознавание тона по форме кривой (1 — ровно высоко, 2 — вверх, 3 — вниз и вверх / низко, 4 — вниз).
 * Чистая логика без Web Audio — её проверяют тесты на синтетических сигналах.
 */

export type PitchTrack = { f0: number[]; hop: number; sr: number }; // f0 в Гц, 0 — нет голоса

/** Частота основного тона одного кадра (YIN) или 0, если кадр не звонкий. */
export function yinFrame(x: Float32Array, start: number, size: number, sr: number, fmin = 70, fmax = 500, threshold = 0.22): number {
  const maxLag = Math.min(Math.floor(sr / fmin), Math.floor(size / 2));
  const minLag = Math.max(2, Math.floor(sr / fmax));
  const W = size - maxLag;
  if (W <= 0) return 0;
  // энергия — тихие кадры не считаем
  let energy = 0;
  for (let i = 0; i < size; i++) energy += x[start + i] * x[start + i];
  if (energy / size < 1e-5) return 0;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[start + i] - x[start + i + tau]; s += v * v; }
    d[tau] = s;
  }
  // нормированная разность
  let run = 0;
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) { run += d[tau]; cmnd[tau] = run ? (d[tau] * tau) / run : 1; }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return 0;
  // параболическая интерполяция
  const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
  const den = a - 2 * b + c;
  const shift = den ? (a - c) / (2 * den) : 0;
  return sr / (tau + Math.max(-1, Math.min(1, shift)));
}

/** Трек высоты: кадры по 40 мс с шагом 10 мс. */
export function pitchTrack(x: Float32Array, sr: number, fmin = 70, fmax = 500): PitchTrack {
  const size = Math.round(sr * 0.04), hop = Math.round(sr * 0.01);
  const f0: number[] = [];
  for (let s = 0; s + size <= x.length; s += hop) f0.push(yinFrame(x, s, size, sr, fmin, fmax));
  return { f0: cleanTrack(f0), hop, sr };
}

/** Убрать одиночные выбросы (октавные скачки) медианой по 5 кадрам и короткие звонкие островки (< 50 мс). */
export function cleanTrack(f0: number[]): number[] {
  const out = f0.map((v, i) => {
    if (!v) return 0;
    const win = f0.slice(Math.max(0, i - 2), i + 3).filter(Boolean).sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)];
    return Math.abs(Math.log2(v / med)) > 0.4 ? med : v;
  });
  // короткие островки голоса — шум
  let i = 0;
  while (i < out.length) {
    if (!out[i]) { i++; continue; }
    let j = i;
    while (j < out.length && out[j]) j++;
    if (j - i < 5) for (let k = i; k < j; k++) out[k] = 0;
    i = j;
  }
  return out;
}

/** Звонкие участки (индексы кадров [начало, конец)). */
export function voicedRuns(f0: number[], gap = 6): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < f0.length) {
    if (!f0[i]) { i++; continue; }
    let j = i;
    while (j < f0.length && (f0[j] || f0.slice(j, j + gap).some(Boolean))) j++;
    runs.push([i, j]);
    i = j;
  }
  return runs;
}

/** Основной звонкий участок (гласная): самый длинный, разрывы до 3 кадров склеиваются. */
export function mainRun(f0: number[]): number[] {
  const runs = voicedRuns(f0, 3);
  if (!runs.length) return [];
  const [a, b] = runs.reduce((best, r) => (r[1] - r[0] > best[1] - best[0] ? r : best));
  return f0.slice(a, b).filter(Boolean);
}

/** Кривая в полутонах относительно опоры (по умолчанию — медианы голоса), только звонкие кадры, сглаженная. */
export function semitones(f0: number[], ref?: number): number[] {
  const v = f0.filter(Boolean);
  if (!v.length) return [];
  const sorted = [...v].sort((a, b) => a - b);
  const base = ref ?? sorted[Math.floor(sorted.length / 2)];
  const st = v.map((f) => 12 * Math.log2(f / base));
  return st.map((_, i) => { const w = st.slice(Math.max(0, i - 2), i + 3); return w.reduce((a, b) => a + b, 0) / w.length; });
}

/** Разбить кривую слова на n слогов: по звонким участкам, если их ровно n, иначе на равные части. */
export function splitSyllables(f0: number[], n: number): number[][] {
  const runs = voicedRuns(f0, 3).filter(([a, b]) => b - a >= 5);
  if (runs.length === n) return runs.map(([a, b]) => f0.slice(a, b).filter(Boolean));
  if (n === 1) return [mainRun(f0)];
  const voiced = f0.filter(Boolean);
  const len = voiced.length;
  return Array.from({ length: n }, (_, k) => voiced.slice(Math.floor((k * len) / n), Math.floor(((k + 1) * len) / n)));
}

export type ToneGuess = { tone: number; confidence: number; scores: number[] };

/**
 * Тон слога по кривой в полутонах (относительно среднего голоса говорящего).
 * Признаки: наклон, изгиб (провал в середине), средняя высота. Возвращает оценки для тонов 1–4.
 */
export function classifyTone(st: number[]): ToneGuess {
  if (st.length < 4) return { tone: 0, confidence: 0, scores: [0, 0, 0, 0] };
  const n = st.length;
  const q = (a: number, b: number) => { const s = st.slice(Math.floor(a * n), Math.max(Math.floor(a * n) + 1, Math.floor(b * n))); return s.reduce((x, y) => x + y, 0) / s.length; };
  const start = q(0, 0.25), mid = q(0.35, 0.65), end = q(0.75, 1);
  const min = Math.min(...st), minAt = st.indexOf(min) / (n - 1);
  const delta = end - start;                 // изменение за слог, полутоны
  const dip = Math.min(start, end) - min;    // провал ниже обоих концов
  const level = (start + mid + end) / 3;     // высота относительно обычного голоса говорящего
  const sig = (x: number) => 1 / (1 + Math.exp(-x));
  const s1 = sig(2.5 - Math.abs(delta)) * sig(1.5 - dip) * sig(level + 1.5);
  const s2 = sig(delta - 1.5) * sig(2 - dip) * sig((0.75 - minAt) * 6);
  const s3 = Math.max(sig(dip - 1.5) * sig((0.25 - Math.abs(minAt - 0.55)) * 10), sig(-level - 2) * sig(2 - Math.abs(delta)));
  const s4 = sig(-delta - 2.5) * sig(start + 0.5) * sig(2 - dip);
  const scores = [s1, s2, s3, s4];
  const best = scores.indexOf(Math.max(...scores));
  const sum = scores.reduce((a, b) => a + b, 0) || 1;
  return { tone: best + 1, confidence: scores[best] / sum, scores };
}

/**
 * Тоны, которые засчитываются при прослушивании записи: тон колоды и его варианты, плюс правило 3-3 → 2-3
 * (в записи первый из двух третьих звучит вторым) и 不/一 по варианту колоды.
 */
export function acceptedTones(tones: number[], alts: number[][]): number[][] {
  return tones.map((t, i) => {
    const ok = new Set([t, ...(alts[i] ?? [])]);
    if (t === 3 && tones[i + 1] === 3) ok.add(2);
    if (t === 5) ok.add(5);
    return [...ok];
  });
}

/** Образцовая кривая тона по шкале Чао (1–5) в полутонах относительно середины голоса, k точек. */
export function toneTemplate(tone: number, k = 20): number[] {
  const chao: Record<number, number[]> = { 1: [5, 5], 2: [3, 5], 3: [2, 1, 4], 4: [5, 1], 5: [3, 3] };
  const pts = chao[tone] ?? chao[5];
  return Array.from({ length: k }, (_, i) => {
    const t = (i / (k - 1)) * (pts.length - 1);
    const a = Math.floor(t), b = Math.min(pts.length - 1, a + 1);
    const v = pts[a] + (pts[b] - pts[a]) * (t - a);
    return (v - 3) * 2.5;
  });
}

/** Равномерно сжать/растянуть кривую до k точек (для графика). */
export function resampleCurve(xs: number[], k: number): number[] {
  if (!xs.length) return [];
  return Array.from({ length: k }, (_, i) => {
    const t = (i / Math.max(1, k - 1)) * (xs.length - 1);
    const a = Math.floor(t), b = Math.min(xs.length - 1, a + 1);
    return xs[a] + (xs[b] - xs[a]) * (t - a);
  });
}

/** Понизить частоту дискретизации в целое число раз (усреднением) — для быстрого YIN по записи с микрофона. */
export function downsample(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) { let s = 0; for (let k = 0; k < factor; k++) s += x[i * factor + k]; out[i] = s / factor; }
  return out;
}
