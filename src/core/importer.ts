/**
 * Импорт и экспорт колод текстовыми файлами.
 * Понимает: текстовый экспорт Anki (заголовки «#separator:tab», «#html:true», «#deck:…»), экспорт Pleco
 * (TSV, строки «//Категория»), CSV Skritter и любые таблицы, где в одной колонке иероглифы, в другой — пиньинь
 * (с цифрами или знаками, слитно или по слогам), в третьей — значение. Просто список иероглифов тоже подходит.
 * Пропущенные пиньинь и значение подставляет приложение (HSK, затем словарь).
 */
import { toNumeric, parseRef, toMarked } from "./pinyin.ts";
import { dictPyToNumeric } from "./dict.ts";

export type ImportRow = { han: string; py: string | null; ru: string };
export type ImportResult = { title: string; rows: ImportRow[]; skipped: string[]; format: string; group?: string };

const HAN = /\p{Script=Han}/u;
const HAN_ONLY = /^[\p{Script=Han}\u3007·・]+$/u;
const CYR = /[А-Яа-яЁё]/;
const PY_CHARS = /^[a-zA-Züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ1-5\s'’\-:·,]+$/;

/** HTML из полей Anki → текст. */
export function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "; ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

/** Разбор строки CSV с кавычками. */
export function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"' && !cur.trim()) { q = true; cur = ""; } else if (c === sep) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Пиньинь в любом виде → формат колоды «xue2 xi2», с проверкой числа слогов. null — не удалось. */
export function normalizePinyin(py: string, han: string): string | null {
  const raw = py.trim().toLowerCase().replace(/u:/g, "v").replace(/[’·]/g, "'");
  if (!raw) return null;
  const count = [...han].filter((c) => HAN.test(c)).length;
  const ok = (s: string | null) => {
    if (!s) return null;
    try {
      const n = s.split(" ").length;
      parseRef(s);
      return n === count || (han.endsWith("儿") && n === count - 1) ? s : null;
    } catch { return null; }
  };
  return ok(toNumeric(raw.replace(/[',-]/g, " ")))
    ?? ok(toNumeric(raw.replace(/([1-5])(?=[a-zü])/g, "$1 ").replace(/[',-]/g, " "))) // xue2xi2
    ?? ok(dictPyToNumeric(raw, han)); // xuéxí
}

function detectSep(lines: string[], declared: string | null): string {
  if (declared) return declared;
  const sample = lines.slice(0, 50);
  const score = (sep: string) => sample.filter((l) => l.includes(sep)).length;
  for (const sep of ["\t", "|", ";", ","]) if (score(sep) >= Math.max(1, sample.length * 0.6)) return sep;
  return "";
}

const SEP_NAMES: Record<string, string> = { tab: "\t", comma: ",", semicolon: ";", pipe: "|", space: " ", "\\t": "\t" };

export function parseImport(text: string, filename = ""): ImportResult {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  let title = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  let declared: string | null = null;
  let html = false;
  let format = "";
  const body: string[] = [];
  for (const l of lines) {
    const m = /^#(\w[\w ]*):(.*)$/.exec(l);
    if (m) { // заголовки текстового экспорта Anki
      format = "Anki";
      const key = m[1].trim().toLowerCase(), val = m[2].trim();
      if (key === "separator") declared = SEP_NAMES[val.toLowerCase()] ?? val;
      if (key === "html") html = val === "true";
      if (key === "deck" && val) title = val.split("::").pop()!.trim();
      continue;
    }
    if (l.startsWith("//")) { // категории Pleco
      format = "Pleco";
      if (!body.length && l.slice(2).trim()) title = l.slice(2).split("/").filter(Boolean).pop()!.trim();
      continue;
    }
    if (l.trim()) body.push(l);
  }
  const sep = detectSep(body, declared);
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  const add = (han: string, pyRaw: string, ru: string) => {
    han = han.replace(/\s+/g, "");
    if (!han || !HAN_ONLY.test(han)) { if (han) skipped.push(han); return; }
    if (seen.has(han)) return;
    seen.add(han);
    rows.push({ han, py: pyRaw ? normalizePinyin(pyRaw, han) : null, ru: ru.trim() });
  };
  if (!sep) {
    // список без колонок: «人 大 学习» или по слову в строке
    for (const l of body) for (const tok of l.split(/[\s,，、;；]+/)) if (tok) add(tok, "", "");
    return { title: title || "Импорт", rows, skipped, format: format || "список" };
  }
  if (!format) format = sep === "," ? "CSV" : "таблица";
  for (const l of body) {
    const fields = (sep === "," || sep === ";" ? splitCsv(l, sep) : l.split(sep)).map((f) => (html || /<[a-z][^>]*>/i.test(f) ? stripHtml(f) : f.trim()));
    const hi = fields.findIndex((f) => HAN.test(f) && HAN_ONLY.test(f.replace(/\s+/g, "")));
    if (hi < 0) { const f = fields.find((x) => x.trim()); if (f && !/^(word|слово|hanzi|simplified|иероглиф)/i.test(f)) skipped.push(f); continue; }
    const rest = fields.filter((_, i) => i !== hi);
    const pi = rest.findIndex((f) => f && PY_CHARS.test(f) && /[a-zü]/i.test(f) && !CYR.test(f));
    const py = pi >= 0 ? rest[pi] : "";
    const others = rest.filter((_, i) => i !== pi && rest[i]);
    const ru = others.find((f) => CYR.test(f)) ?? others.find((f) => !HAN_ONLY.test(f.replace(/\s+/g, ""))) ?? "";
    add(fields[hi], py, ru);
  }
  return { title: title || "Импорт", rows, skipped, format };
}

/** Колода → текстовый файл, который понимают Anki (Файл → Импорт), Pleco и таблицы. */
export function exportDeckText(title: string, rows: [string, string, string][]): string {
  const clean = (s: string) => s.replace(/[\t\n\r]+/g, " ").trim();
  const head = ["#separator:tab", "#html:false", `#deck:${clean(title)}`, "#columns:Иероглифы\tПиньинь\tЗначение"];
  const body = rows.map(([han, py, ru]) => {
    let marked = py;
    try { marked = toMarked(parseRef(py)); } catch { /* оставляем как есть */ }
    return [han, marked, ru].map(clean).join("\t");
  });
  return [...head, ...body].join("\n") + "\n";
}

/** Безопасное имя файла. */
export const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "колода"}.${ext}`;

/**
 * Файл с несколькими колодами: разделы «## Название» (или категории Pleco «//Название») — каждая своя колода.
 * Заголовок «#group:Название» задаёт группу, под которой колоды встанут в списке. Без разделов — одна колода.
 */
export function parseImportAll(text: string, filename = ""): ImportResult[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const head: string[] = [];
  const parts: { title: string; lines: string[] }[] = [];
  let group = "";
  for (const l of lines) {
    const g = /^#group:(.*)$/i.exec(l);
    if (g) { group = g[1].trim(); continue; }
    const pleco = /^\/\/(.+)$/.exec(l);
    const sec = /^##\s+(.+)$/.exec(l)?.[1] ?? (pleco ? pleco[1].split("/").filter(Boolean).pop() : undefined);
    if (sec) { parts.push({ title: sec.trim(), lines: [] }); continue; }
    if (!parts.length) head.push(l); else parts[parts.length - 1].lines.push(l);
  }
  if (parts.length < 2) {
    const r = parseImport(text.split("\n").filter((l) => !/^#group:/i.test(l.replace(/\r/g, ""))).join("\n"), filename);
    if (parts.length === 1 && !/^#deck:/im.test(text)) r.title = parts[0].title;
    return [{ ...r, group: group || undefined }];
  }
  const meta = head.filter((l) => /^#\w[\w ]*:/.test(l) && !/^#deck:/i.test(l));
  return parts.map((p) => {
    const r = parseImport([...meta, ...p.lines].join("\n"), "");
    return { ...r, title: p.title, group: group || undefined };
  }).filter((r) => r.rows.length || r.skipped.length);
}

/* ---------- японский ---------- */

const JA_WORD = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+$/u;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+(\/[\p{Script=Hiragana}\p{Script=Katakana}ー]+)*$/u;

/**
 * Японские колоды из файла: строки «слово | чтение | значение» (или через Tab), чтение каной («いく/ゆく» — варианты),
 * у слова из одной каны чтение можно не писать. Разделы «## Название» — отдельные колоды, «#group:Имя» — группа.
 * Строки, где нет японского слова или чтения, попадают в skipped.
 */
export function parseJaImportAll(text: string, filename = ""): ImportResult[] {
  const lines = text.replace(/^﻿/, "").replace(/\r/g, "").split("\n");
  let group = "";
  const parts: ImportResult[] = [];
  const cur = () => {
    if (!parts.length) parts.push({ title: filename.replace(/\.[^.]+$/, "").trim() || "Импорт", rows: [], skipped: [], format: "японский" });
    return parts[parts.length - 1];
  };
  const seen = new Map<ImportResult, Set<string>>();
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const g = /^#group:(.*)$/i.exec(l);
    if (g) { group = g[1].trim(); continue; }
    if (/^#\w[\w ]*:/.test(l)) continue;
    const sec = /^##\s+(.+)$/.exec(l)?.[1];
    if (sec) { parts.push({ title: sec.trim(), rows: [], skipped: [], format: "японский" }); continue; }
    if (l.startsWith("#")) continue;
    const f = (l.includes("\t") ? l.split("\t") : l.split("|")).map((x) => x.trim());
    const han = f[0].replace(/\s+/g, "");
    const p = cur();
    if (!han || !JA_WORD.test(han)) { p.skipped.push(f[0]); continue; }
    let reading = (f[1] ?? "").replace(/\s+/g, "").replace(/[、,;]/g, "/");
    if (!reading && KANA_ONLY.test(han)) reading = han;
    if (!KANA_ONLY.test(reading)) { p.skipped.push(han); continue; }
    const s = seen.get(p) ?? seen.set(p, new Set()).get(p)!;
    if (s.has(han)) continue;
    s.add(han);
    p.rows.push({ han, py: reading, ru: (f[2] ?? "").trim() });
  }
  return parts.filter((r) => r.rows.length || r.skipped.length).map((r) => ({ ...r, group: group || undefined }));
}
