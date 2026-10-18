// Высота голоса и тоны на синтетических сигналах (без настоящих записей).
import { test } from "node:test";
import assert from "node:assert/strict";
import { yinFrame, pitchTrack, semitones, classifyTone, splitSyllables, acceptedTones, cleanTrack } from "../src/core/pitch.ts";

const SR = 16000;
/** Голосоподобный сигнал: основной тон с гармониками, частота меняется по функции f(t), t ∈ [0,1]. */
function voice(dur: number, f: (t: number) => number, sr = SR): Float32Array {
  const n = Math.round(dur * sr);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * f(i / n)) / sr;
    x[i] = 0.5 * Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph);
  }
  return x;
}
const silence = (dur: number) => new Float32Array(Math.round(dur * SR));
const concat = (...xs: Float32Array[]) => { const out = new Float32Array(xs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };

test("YIN находит частоту", () => {
  for (const f of [110, 200, 320]) {
    const x = voice(0.1, () => f);
    const est = yinFrame(x, 0, Math.round(SR * 0.04), SR);
    assert.ok(Math.abs(est - f) / f < 0.02, `${f} → ${est}`);
  }
  assert.equal(yinFrame(silence(0.1), 0, 640, SR), 0);
});

test("трек и полутоны: тишина без голоса, рост частоты — рост кривой", () => {
  const tr = pitchTrack(concat(silence(0.1), voice(0.4, (t) => 180 + 80 * t), silence(0.1)), SR);
  assert.ok(tr.f0.slice(0, 5).every((v) => v === 0));
  const st = semitones(tr.f0);
  assert.ok(st[st.length - 1] - st[0] > 4);
  assert.deepEqual(cleanTrack([0, 200, 0, 0, 0]), [0, 0, 0, 0, 0]); // одиночный кадр — шум
});

test("тоны по форме кривой", () => {
  // опора говорящего ~200 Гц; 1 — ровно и чуть выше, 2 — вверх, 3 — вниз и вверх, 4 — резко вниз
  const shapes: [number, (t: number) => number][] = [
    [1, () => 235],
    [2, (t) => 180 + 90 * t * t],
    [3, (t) => 190 - 120 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.6 + 30 * t],
    [4, (t) => 280 - 140 * t],
  ];
  for (const [tone, f] of shapes) {
    const tr = pitchTrack(voice(0.35, f), SR);
    const g = classifyTone(semitones(tr.f0, 200));
    assert.equal(g.tone, tone, `тон ${tone}: ${g.scores.map((s) => s.toFixed(2)).join(" ")}`);
  }
});

test("слоги разделяются по паузе", () => {
  const tr = pitchTrack(concat(voice(0.25, () => 220), silence(0.12), voice(0.25, (t) => 260 - 100 * t)), SR);
  const parts = splitSyllables(tr.f0, 2);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length > 10));
});

test("засчитываемые тоны при прослушивании", () => {
  assert.deepEqual(acceptedTones([3, 3], [[], []]), [[3, 2], [3]]);
  assert.deepEqual(acceptedTones([4, 4], [[2], []]), [[4, 2], [4]]);
});

test("образцовые кривые и ресэмплинг", async () => {
  const { toneTemplate, resampleCurve, downsample } = await import("../src/core/pitch.ts");
  const t2 = toneTemplate(2, 5), t4 = toneTemplate(4, 5), t3 = toneTemplate(3, 9);
  assert.ok(t2[4] > t2[0] && t4[4] < t4[0]);
  assert.ok(Math.min(...t3) < t3[0] && Math.min(...t3) < t3[8]);
  assert.deepEqual(resampleCurve([0, 10], 3), [0, 5, 10]);
  assert.equal(downsample(new Float32Array([1, 3, 5, 7]), 2)[1], 6);
});
