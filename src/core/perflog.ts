/** Журнал задержек для «Диагностики письма»: чистая логика (наблюдатели браузера — в ui/perfdiag.ts). */

export type Sample = { t: number; d: number; n?: string };

/** Сколько записей каждого вида хранить (старые вытесняются). */
export const CAP = 400;

export class PerfLog {
  long: Sample[] = [];
  ev: Sample[] = [];
  /** Кадры, пока палец на экране: сколько всего и самые долгие. */
  frames = { n: 0, slow: 0, bad: 0, max: 0 };
  slowFrames: Sample[] = [];
  writes = 0;

  private push(a: Sample[], s: Sample) { a.push(s); if (a.length > CAP) a.shift(); }
  addLong(t: number, d: number) { this.push(this.long, { t, d }); }
  addEvent(t: number, d: number, n: string) { this.push(this.ev, { t, d, n }); }
  addFrame(t: number, gap: number) {
    this.frames.n++;
    if (gap > 34) this.frames.slow++;
    if (gap > 100) this.frames.bad++;
    if (gap > this.frames.max) this.frames.max = gap;
    if (gap > 50) this.push(this.slowFrames, { t, d: gap });
  }
  reset() { this.long = []; this.ev = []; this.slowFrames = []; this.frames = { n: 0, slow: 0, bad: 0, max: 0 }; this.writes = 0; }
}

export const BUCKETS: [number, number, string][] = [
  [0, 30, "первые 30 с после запуска"],
  [30, 120, "30 с – 2 мин"],
  [120, 600, "2 – 10 мин"],
  [600, Infinity, "позже 10 мин"],
];

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
}

const ms = (x: number) => `${Math.round(x)} мс`;
const mmss = (t: number) => `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, "0")}`;

/** Сводка текстом: её читает автор и присылает разработчику. */
export function summarize(log: PerfLog, uptimeMs: number, info: Record<string, string>): string {
  const out: string[] = [];
  out.push(`Прошло с запуска: ${mmss(uptimeMs)}`);
  for (const [k, v] of Object.entries(info)) out.push(`${k}: ${v}`);
  out.push("", "Долгие задержки (страница стояла 50 мс и дольше):");
  if (!log.long.length) out.push("  не было");
  for (const [lo, hi, name] of BUCKETS) {
    const xs = log.long.filter((s) => s.t / 1000 >= lo && s.t / 1000 < hi);
    if (!xs.length) continue;
    const sum = xs.reduce((s, x) => s + x.d, 0);
    out.push(`  ${name}: ${xs.length} раз, всего ${ms(sum)}, самая долгая ${ms(Math.max(...xs.map((x) => x.d)))}`);
  }
  const worst = [...log.long].sort((a, b) => b.d - a.d).slice(0, 5);
  if (worst.length) out.push("  самые долгие: " + worst.map((s) => `${ms(s.d)} на ${mmss(s.t)}`).join(", "));

  out.push("", "Письмо (пока палец на экране):");
  const f = log.frames;
  if (!f.n) out.push("  кадров не записано — напишите пару иероглифов и откройте ещё раз");
  else {
    out.push(`  кадров ${f.n}, медленных (больше 34 мс) ${f.slow}, провалов (больше 100 мс) ${f.bad}, самый долгий ${ms(f.max)}`);
    const w = [...log.slowFrames].sort((a, b) => b.d - a.d).slice(0, 5);
    if (w.length) out.push("  самые долгие кадры: " + w.map((s) => `${ms(s.d)} на ${mmss(s.t)}`).join(", "));
  }
  const pe = log.ev.filter((e) => /^(pointer|touch|mouse)/.test(e.n ?? ""));
  if (pe.length) {
    const ds = pe.map((e) => e.d);
    out.push(`  касания, которые обрабатывались дольше 16 мс: ${pe.length}, типичное ${ms(percentile(ds, 50))}, 95% не дольше ${ms(percentile(ds, 95))}, самое долгое ${ms(Math.max(...ds))}`);
    const early = pe.filter((e) => e.t < 120000).length;
    if (pe.length >= 10) out.push(`  из них в первые 2 минуты после запуска: ${early}`);
  } else out.push("  касаний с задержкой больше 16 мс не было");
  out.push(`  записано жестов: ${log.writes}`);
  return out.join("\n");
}
