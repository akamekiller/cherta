/**
 * Устная часть HSKK (初级 / 中级 / 高级): задания, сборка варианта, оценка по распознанной речи.
 *  repeat — послушать и повторить; answer — послушать вопрос и коротко ответить; prompt — ответить на вопрос с экрана;
 *  picture — рассказать по картинке (эмодзи-сцена); retell — послушать рассказ и пересказать; read — прочитать вслух.
 * Банк — scripts/hsk/hskk.txt → data/hsk/hskk.txt (scripts/build_hskk.py). Оценка — примерная: точность считается по тексту,
 * который распознало устройство, а при ответах своими словами ещё и по словам-опорам и длине; свою оценку можно поставить вручную.
 */
import { diffZh } from "./exercise.ts";
import { hanCount } from "./hsk.ts";

export type OKind = "repeat" | "answer" | "prompt" | "picture" | "retell" | "read";
export type OItem = {
  id: string; level: number; kind: OKind;
  /** repeat/read/retell — текст; answer/prompt — вопрос; picture — эмодзи-сцена. */
  zh: string; ru?: string;
  /** Образец ответа (answer, prompt, picture). */
  sample?: string; keys?: string[];
};
export type OPart = { kind: OKind; n: number; title: string; zh: string; hear: boolean; secs: number; hint: string };
export type OLevel = { level: number; name: string; zh: string; minutes: number; parts: OPart[] };

const P = (kind: OKind, n: number, title: string, zh: string, hear: boolean, secs: number, hint: string): OPart => ({ kind, n, title, zh, hear, secs, hint });
/** Формат — по прежнему HSKK (три части на каждом уровне). */
export const OLEVELS: OLevel[] = [
  { level: 1, name: "Начальный", zh: "初级", minutes: 17, parts: [
    P("repeat", 15, "Послушайте предложение и повторите", "听后重复", true, 12, "Фраза звучит один раз — повторите как можно точнее."),
    P("answer", 10, "Послушайте вопрос и ответьте", "听后回答", true, 15, "Ответьте одним предложением."),
    P("prompt", 2, "Ответьте на вопрос с экрана", "回答问题", false, 45, "Подготовьтесь и ответьте 3–4 предложениями."),
  ] },
  { level: 2, name: "Средний", zh: "中级", minutes: 23, parts: [
    P("repeat", 10, "Послушайте предложение и повторите", "听后重复", true, 18, "Фразы длиннее — запоминайте по смыслу."),
    P("picture", 2, "Расскажите по картинке", "看图说话", false, 60, "Опишите, что происходит: кто, где, что делает."),
    P("prompt", 2, "Ответьте на вопрос с экрана", "回答问题", false, 60, "Ответьте связно, минимум 4–5 предложений."),
  ] },
  { level: 3, name: "Высокий", zh: "高级", minutes: 25, parts: [
    P("retell", 3, "Послушайте рассказ и перескажите", "听后复述", true, 90, "Перескажите главное своими словами."),
    P("read", 1, "Прочитайте текст вслух", "朗读", false, 90, "Читайте чётко, не торопясь."),
    P("prompt", 2, "Выскажите своё мнение", "回答问题", false, 90, "Мнение, причины, пример — связно, 8–10 предложений."),
  ] },
];
export const olevel = (n: number) => OLEVELS.find((l) => l.level === n);
export const orderOf = (level: number) => olevel(level)?.parts ?? [];

/**
 * Файл банка: «== 1 repeat» — уровень и вид; строки:
 *  repeat / read / retell: текст | = перевод
 *  answer / prompt: вопрос | образец | слова-опоры через пробел (или -) | = перевод вопроса
 *  picture: эмодзи | слова-подсказки | образец | = перевод
 */
export function parseOral(src: string): OItem[] {
  const out: OItem[] = [];
  let level = 0, kind: OKind | "" = "";
  const n: Record<string, number> = {};
  for (const raw of src.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const h = /^==\s*([123])\s+(repeat|answer|prompt|picture|retell|read)\s*$/.exec(line);
    if (h) { level = Number(h[1]); kind = h[2] as OKind; continue; }
    if (!kind) continue;
    let ru: string | undefined, body = line;
    const tr = line.lastIndexOf("| =");
    if (tr >= 0) { ru = line.slice(tr + 3).trim(); body = line.slice(0, tr).trim(); }
    const f = body.split("|").map((x) => x.trim());
    const key = `${level}${kind}`;
    const id = `${level}${kind[0].toUpperCase()}${kind.slice(1, 3)}-${(n[key] = (n[key] ?? 0) + 1)}`;
    const words = (s?: string) => (s ?? "").split(/\s+/).filter((w) => w && w !== "-");
    if (kind === "repeat" || kind === "read" || kind === "retell") { if (f[0]) out.push({ id, level, kind, zh: f[0], ...(ru ? { ru } : {}) }); }
    else if (kind === "answer" || kind === "prompt") { if (f[0] && f[1]) out.push({ id, level, kind, zh: f[0], sample: f[1], keys: words(f[2]), ...(ru ? { ru } : {}) }); }
    else if (f[0] && f[2]) out.push({ id, level, kind, zh: f[0], keys: words(f[1]), sample: f[2], ...(ru ? { ru } : {}) });
  }
  return out;
}

/** Вариант: по каждой части — n заданий из банка уровня, давно не попадавшиеся первыми (seen: id → время). */
export function assembleOral(level: number, bank: OItem[], seen: Record<string, number>, rnd: () => number, kinds?: OKind[]): { part: OPart; items: OItem[] }[] {
  return orderOf(level).filter((p) => !kinds || kinds.includes(p.kind)).map((part) => {
    const pool = bank.filter((it) => it.level === level && it.kind === part.kind).map((it) => ({ it, k: (seen[it.id] ?? 0) + rnd() * 1e6 }));
    pool.sort((a, b) => a.k - b.k);
    return { part, items: pool.slice(0, part.n).map((x) => x.it) };
  }).filter((x) => x.items.length);
}

/** Сколько знаков ждём в свободном ответе. */
export function wantLen(it: OItem): number {
  if (it.kind === "answer") return 3;
  if (it.kind === "picture") return 35;
  return it.level === 1 ? 20 : it.level === 2 ? 35 : 50;
}

export type TaskScore = { pts: number; share: number; missing: string[]; short: number; auto: boolean };
/** Оценка ответа по распознанному тексту (0–100). Точные задания — по совпадению знаков, свободные — по опорам и длине. */
export function scoreTask(it: OItem, said: string): TaskScore {
  const text = said.trim();
  if (!hanCount(text)) return { pts: 0, share: 0, missing: it.keys ?? [], short: wantLen(it), auto: true };
  if (it.kind === "repeat" || it.kind === "read") {
    const d = diffZh(text, it.zh);
    return { pts: Math.min(100, Math.round((100 * d.score) / 0.9)), share: d.score, missing: [], short: 0, auto: true };
  }
  if (it.kind === "retell") {
    const d = diffZh(text, it.zh);
    const recall = d.ref.length ? d.ref.filter((x) => x.ok).length / d.ref.length : 0;
    return { pts: Math.min(100, Math.round((100 * recall) / 0.55)), share: recall, missing: [], short: 0, auto: true };
  }
  const keys = it.keys ?? [];
  const hit = keys.filter((k) => text.includes(k));
  const keyShare = keys.length ? hit.length / keys.length : 1;
  const need = wantLen(it), have = hanCount(text);
  const lenShare = Math.min(1, have / need);
  return { pts: Math.round(100 * (0.5 * keyShare + 0.5 * lenShare)), share: keyShare, missing: keys.filter((k) => !hit.includes(k)), short: Math.max(0, need - have), auto: true };
}

export const verdict = (pts: number) => (pts >= 85 ? "Отлично" : pts >= 65 ? "Хорошо" : pts >= 40 ? "Частично" : "Ещё раз");
/** Самооценка: хорошо / частично / не получилось → баллы. */
export const SELF = { good: 100, part: 60, bad: 20 } as const;

export type OScore = { parts: { kind: OKind; pts: number; n: number }[]; total: number; passed: boolean };
/** Итог: каждая часть — среднее по заданиям (из 100), итог — среднее частей; «сдал» — от 60 (ориентир). */
export function scoreOral(tasks: { kind: OKind; pts: number }[]): OScore {
  const by = new Map<OKind, number[]>();
  for (const t of tasks) (by.get(t.kind) ?? by.set(t.kind, []).get(t.kind)!).push(t.pts);
  const parts = [...by].map(([kind, l]) => ({ kind, n: l.length, pts: Math.round(l.reduce((a, b) => a + b, 0) / l.length) }));
  const total = parts.length ? Math.round(parts.reduce((a, p) => a + p.pts, 0) / parts.length) : 0;
  return { parts, total, passed: total >= 60 };
}
