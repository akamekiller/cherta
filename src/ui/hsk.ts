/**
 * Экзамен HSK 3.0 (уровни 1–6). Вариант собирается из банка заданий (data/hsk/hskN.txt) заново каждый раз:
 * сначала задания, которых давно не было. Три ступени: тренировка (пиньинь и перевод, разбор сразу, без таймера),
 * как на экзамене (таймер, аудио дважды, разбор в конце), сложнее (аудио один раз и быстрее, времени на треть меньше).
 * Прогресс — meta `hsk`: {seen: id → время, hist: результаты}.
 */
import { hskEntries } from "../state.ts";
import * as store from "../store.ts";
import {
  LEVELS, MODES, SEC_NAME, SEC_ZH, levelSpec, parseBank, assemble, shuffleOpts, isRight, scoreExam, freeCheck, hanCount,
  type Item, type Part, type Sec, type Mode, type Score,
} from "../core/hsk.ts";
import { parseRef } from "../core/pinyin.ts";
import { say, sayAll } from "../speech.ts";
import { $, esc, pinyinHTML, plural } from "./dom.ts";
import { onShow, onLeave } from "./nav.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import { mountHwPad, type HwPad } from "./hwpad.ts";

type Hist = { at: number; level: number; mode: Mode; secs: Sec[]; total: number; max: number; passed: boolean; sec: Partial<Record<Sec, [number, number]>>; secsUsed: number };
type Saved = { seen: Record<string, number>; hist: Hist[] };
type Ans = number | string | string[] | null;
type Q = { item: Item; part: Part; ans: Ans; tiles?: string[]; plays: number; shown: boolean; hid?: boolean };

const LS = "cherta.hsk";
const ui = { level: 1, mode: "exam" as Mode, py: true };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

const banks = new Map<number, Promise<Item[]>>();
const bankOf = (lv: number) => {
  let p = banks.get(lv);
  if (!p) {
    p = fetch(`data/hsk/hsk${lv}.txt`).then((r) => { if (!r.ok) throw new Error("bank"); return r.text(); }).then(parseBank);
    p.catch(() => banks.delete(lv));
    banks.set(lv, p);
  }
  return p;
};
/** Уровни, для которых есть банк (data/hsk/index.json); без сети — все из LEVELS, банк загрузится, если он в кэше. */
let avail: number[] | null = null;
async function levelsAvail(): Promise<number[]> {
  if (avail) return avail;
  try { const r = await fetch("data/hsk/index.json"); if (r.ok) avail = ((await r.json()) as { level: number }[]).map((x) => x.level); } catch { /* */ }
  return avail ?? LEVELS.map((l) => l.level);
}
const loadSaved = async (): Promise<Saved> => ({ seen: {}, hist: [], ...((await store.getMeta<Saved>("hsk")) ?? {}) });

let run: { level: number; mode: Mode; secs: Sec[]; qs: Q[]; pos: number; started: number; deadline: number; done: boolean; gplays: Record<string, number> } | null = null;
/** Прослушивания: у вопросов к одной записи — общий счётчик (запись звучит для группы, а не для каждого вопроса). */
const playsOf = (q: Q) => (q.item.grp ? run?.gplays[q.item.grp] ?? 0 : q.plays);
const addPlays = (q: Q, n: number) => { if (q.item.grp && run) run.gplays[q.item.grp] = playsOf(q) + n; else q.plays += n; };
let timer = 0;
let pad: HwPad | null = null;

/* ---------- пиньинь для тренировки ---------- */

let pyMap: Map<string, string> | null = null;
async function ensurePy() {
  if (pyMap) return;
  pyMap = new Map();
  for (const e of await hskEntries()) if (!pyMap.has(e.han)) pyMap.set(e.han, e.py);
}
/** Китайский текст; в тренировке с включённым пиньинем — над словами. */
function zhHTML(text: string): string {
  if (!(run?.mode === "train" && ui.py) || !pyMap) return esc(text);
  const out: string[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length;) {
    if (!/\p{Script=Han}/u.test(chars[i])) { out.push(`<span class="p">${esc(chars[i])}</span>`); i++; continue; }
    let L = Math.min(4, chars.length - i);
    for (; L > 1 && !pyMap.has(chars.slice(i, i + L).join("")); L--);
    const w = chars.slice(i, i + L).join("");
    let p = "";
    try { const py = pyMap.get(w); p = py ? pinyinHTML(parseRef(py)) : ""; } catch { p = ""; }
    out.push(`<ruby>${esc(w)}<rt>${p}</rt></ruby>`);
    i += L;
  }
  return out.join("");
}
const stripWho = (s: string) => s.replace(/^[男女][：:]\s*/, "");

/* ---------- главный экран ---------- */

async function renderHome() {
  $("hk-run").hidden = true;
  const home = $("hk-home");
  home.hidden = false;
  const saved = await loadSaved();
  const lvs = await levelsAvail();
  if (!lvs.includes(ui.level)) ui.level = lvs[0] ?? 1;
  const spec = levelSpec(ui.level)!;
  const n = (secs?: Sec[]) => spec.parts.filter((p) => !secs || secs.includes(p.sec)).reduce((a, p) => a + p.n, 0);
  const mins = (secs: Sec[]) => Math.round(secs.reduce((a, s) => a + spec.minutes[s], 0) * (ui.mode === "hard" ? 2 / 3 : 1));
  const all = (["L", "R", "W"] as Sec[]).filter((s) => spec.parts.some((p) => p.sec === s));
  const card = (secs: Sec[], title: string, sub: string) => `<button class="hk-card panel" data-start="${secs.join("")}"><b>${title}</b><small>${sub}</small></button>`;
  const hist = saved.hist.filter((h) => h.level === ui.level).slice(-5).reverse();
  home.innerHTML = `
    <div class="hk-intro"><p class="hint">Новый HSK 3.0. ${ui.level <= 3 ? "Число заданий и время — по образцам экзамена" : "Образцы нового экзамена для уровней 4–6 ещё не опубликованы: формат — как у прежнего HSK, слова — HSK 3.0"}; задания написаны для «Черты» по схеме HSK, каждый вариант собирается заново из банка.</p></div>
    <div class="seg wide-seg hk-lv" role="group" aria-label="Уровень">${LEVELS.filter((l) => lvs.includes(l.level)).map((l) => `<button data-lv="${l.level}" aria-pressed="${l.level === ui.level}">HSK ${l.level}</button>`).join("")}</div>
    <div class="seg wide-seg" role="group" aria-label="Сложность">${MODES.map((m) => `<button data-mode="${m.id}" aria-pressed="${m.id === ui.mode}">${m.name}</button>`).join("")}</div>
    <p class="hint">${esc(MODES.find((m) => m.id === ui.mode)!.hint)}</p>
    ${card(all, "Полный экзамен", `${n()} ${plural(n(), "задание", "задания", "заданий")}${ui.mode === "train" ? "" : ` · ${mins(all)} мин`} · ${all.map((s) => SEC_NAME[s].toLowerCase()).join(", ")}`)}
    <div class="hk-secs">${all.map((s) => card([s], `${SEC_NAME[s]} <span class="zh">${SEC_ZH[s]}</span>`, `${n([s])} ${plural(n([s]), "задание", "задания", "заданий")}${ui.mode === "train" ? "" : ` · ${mins([s])} мин`}`)).join("")}</div>
    ${hist.length ? `<h3 class="grp-title"><span>Мои результаты · HSK ${ui.level}</span></h3><div class="hk-hist">${hist.map(histRow).join("")}</div>` : ""}
    <p class="hint">Баллы: каждая часть — из 100, «сдал» — от 60% суммы. Официальные пороги HSK 3.0 ещё не опубликованы, это ориентир. Устной части пока нет.</p>`;
}

const histRow = (h: Hist) => `<div class="hk-h"><span>${new Date(h.at).toLocaleDateString("ru-RU")} · ${esc(MODES.find((m) => m.id === h.mode)?.name ?? "")}${h.secs.length < 2 ? ` · ${esc(SEC_NAME[h.secs[0]])}` : ""}</span><b class="${h.passed ? "ok" : "no"}">${h.total}/${h.max}</b></div>`;

/* ---------- экзамен ---------- */

async function start(secs: Sec[]) {
  const spec = levelSpec(ui.level)!;
  let bank: Item[];
  try { bank = await bankOf(ui.level); } catch { openSheet("Экзамен HSK", `<p class="note danger">Задания не загрузились. Для первого раза нужен интернет.</p>`); return; }
  const saved = await loadSaved();
  const parts = assemble(spec, bank, saved.seen, Math.random, secs);
  const qs: Q[] = parts.flatMap(({ part, items }) => items.map((it): Q => {
    const item = shuffleOpts(it, Math.random);
    const tiles = item.kind === "order" ? shuffled(item.words!) : undefined;
    return { item, part, ans: item.kind === "order" ? [] : null, tiles, plays: 0, shown: false, hid: false };
  }));
  if (!qs.length) return;
  if (ui.mode === "train") await ensurePy();
  const minutes = secs.reduce((a, s) => a + spec.minutes[s], 0) * (ui.mode === "hard" ? 2 / 3 : 1);
  run = { level: ui.level, mode: ui.mode, secs, qs, pos: 0, started: Date.now(), deadline: ui.mode === "train" ? 0 : Date.now() + minutes * 60_000, done: false, gplays: {} };
  $("hk-home").hidden = true;
  $("hk-run").hidden = false;
  clearInterval(timer);
  if (run.deadline) { timer = window.setInterval(tick, 1000); tick(); } else $("hk-timer").textContent = "";
  show();
}

function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  // не отдавать в правильном порядке
  if (b.length > 2 && b.every((x, i) => x === a[i])) [b[0], b[1]] = [b[1], b[0]];
  return b;
}

function tick() {
  if (!run || run.done || !run.deadline) return;
  const left = Math.max(0, run.deadline - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const el = $("hk-timer");
  el.textContent = `⏱ ${m}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", left < 120_000);
  if (left <= 0) finish();
}

const LETTERS = "ABCD";
const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;

function playLimit(): number { return run?.mode === "train" ? Infinity : run?.mode === "hard" ? 1 : 2; }
/** Прослушать: times раз подряд (на экзамене запись звучит дважды сама, «сложнее» — один раз). */
function play(q: Q, times = 1) {
  if (!run || !q.item.audio || playsOf(q) >= playLimit()) return;
  const n = Math.min(times, playLimit() - playsOf(q));
  addPlays(q, n);
  const lines = q.item.audio.map(stripWho);
  const rate = run.mode === "hard" ? 1.0 : 0.85;
  if (n === 1 && lines.length === 1 && [...lines[0]].length <= 4) say(lines[0], rate);
  else sayAll(Array.from({ length: n }, () => lines).flat(), rate);
  const b = document.querySelector<HTMLButtonElement>("#hk-card [data-play]");
  if (b) { b.disabled = playsOf(q) >= playLimit(); b.querySelector("small")!.textContent = playHint(q); }
}
const playHint = (q: Q) => (run?.mode === "train" ? "сколько угодно раз" : playsOf(q) >= playLimit() ? "прослушано" : `осталось ${playLimit() - playsOf(q)}`);
/** Номер вопроса в группе: «вопрос 2 из 3 к этому тексту». */
function grpHint(q: Q): string {
  if (!run || !q.item.grp) return "";
  const g = run.qs.filter((x) => x.item.grp === q.item.grp);
  return g.length > 1 ? `<p class="hint hk-gh">Вопрос ${g.indexOf(q) + 1} из ${g.length} к ${q.item.audio ? "этой записи" : "этому тексту"}</p>` : "";
}
const isLong = (s: string) => [...s].length > 40;

function show() {
  if (!run) return;
  const q = run.qs[run.pos];
  const it = q.item;
  pad = null;
  try { speechSynthesis.cancel(); } catch { /* */ }
  $("hk-count").textContent = `${run.pos + 1} из ${run.qs.length}`;
  $("hk-prog").style.width = `${(100 * run.qs.filter((x) => answered(x)).length) / run.qs.length}%`;
  const sec = q.part.sec;
  const partNo = levelSpec(run.level)!.parts.filter((p) => p.sec === sec).indexOf(q.part) + 1;
  const train = run.mode === "train";
  const checked = train && q.shown;
  let body = "";
  body += grpHint(q);
  if (it.audio) body += `<div class="hk-audio"><button class="btn" data-play ${playsOf(q) >= playLimit() ? "disabled" : ""}>${PLAY} Слушать <small>${playHint(q)}</small></button></div>`;
  if (it.pic && (it.kind === "choice" || it.kind === "free")) body += `<div class="hk-pic">${esc(it.pic)}</div>`;
  if (it.text && it.kind === "choice") body += `<div class="hk-text${isLong(it.text) ? " long" : ""}">${zhHTML(it.text).replaceAll("___", `<span class="gap-slot">＿＿</span>`)}</div>`;
  if (it.q) body += `<div class="hk-q">${zhHTML(it.q)}</div>`;
  if (it.kind === "choice") {
    const pics = it.opts!.every((o) => o.p);
    const tf = it.opts!.length === 2 && it.opts![0].t === "对";
    body += `<div class="hk-opts ${pics ? "pics" : tf ? "tf" : ""}">${it.opts!.map((o, i) => {
      const cls = checked ? (i === it.a ? " right" : i === q.ans ? " wrong" : "") : "";
      const label = tf ? (i === 0 ? "✓ 对 верно" : "✗ 错 неверно") : o.p ? esc(o.p) : zhHTML(o.t ?? "");
      return `<button class="hk-opt${cls}" data-opt="${i}" aria-pressed="${q.ans === i}" ${checked ? "disabled" : ""}><span class="hk-l">${tf ? "" : LETTERS[i]}</span><span class="hk-o">${label}</span></button>`;
    }).join("")}</div>`;
  } else if (it.kind === "order") {
    const picked = q.ans as string[];
    const left = [...q.tiles!];
    for (const w of picked) { const k = left.indexOf(w); if (k >= 0) left.splice(k, 1); }
    const sent = q.tiles!.some((w) => [...w].length > 6);
    body += `<div class="ex-ans hk-ans${sent ? " sent" : ""}">${picked.map((w, i) => `<button class="tile-w" data-ans="${i}" ${checked ? "disabled" : ""}><span>${esc(w)}</span></button>`).join("") || `<span class="hint">Нажимайте на ${sent ? "предложения" : "слова"} снизу по порядку</span>`}</div>
      <div class="ex-pool${sent ? " sent" : ""}">${left.map((w) => `<button class="tile-w" data-tile="${esc(w)}" ${checked ? "disabled" : ""}><span>${esc(w)}</span></button>`).join("")}</div>`;
  } else if (it.kind === "free") {
    const v = String(q.ans ?? "");
    const summary = (it.min ?? 0) >= 200;
    if (it.text) {
      // пересказ: на экзамене текст читают и прячут перед письмом (в тренировке — можно открыть снова)
      if (q.hid && !train) body += `<p class="hint">Текст скрыт — пишите пересказ по памяти.</p>`;
      else body += `<div class="hk-text long">${zhHTML(it.text)}</div>${summary && !checked ? `<button class="btn" data-hide>${train ? "Спрятать текст" : "Прочитал — спрятать текст и писать"}</button>` : ""}`;
    }
    if (it.need?.length) body += `<div class="hk-need">${it.need.map((w) => `<span class="chip${v.includes(w) ? " ok" : ""}">${esc(w)}</span>`).join("")}</div>`;
    const canWrite = !summary || q.hid || train;
    if (canWrite) body += `<textarea id="hk-free" class="hk-free" lang="zh-CN" rows="${summary ? 10 : 4}" placeholder="${summary ? "Перескажите текст своими словами" : it.need?.length ? "Напишите, используя слова выше" : "Напишите предложение"}" ${checked ? "disabled" : ""}>${esc(v)}</textarea>
      <div class="hk-cnt"><span id="hk-n">${hanCount(v)}</span> / ${it.min} знаков<button class="icon-btn" data-hw aria-label="Писать рукой">✍</button></div><div id="hk-hw" hidden></div>`;
  } else {
    const [a, b] = (it.text ?? "").split("___");
    body += `<div class="hk-text">${esc(a)}<span class="hk-blank"><small>${esc(it.py ?? "")}</small><span>${esc(String(q.ans ?? "")) || "＿"}</span></span>${esc(b ?? "")}</div>
      <div class="tr-in-row"><input id="hk-in" lang="zh-CN" autocomplete="off" spellcheck="false" placeholder="Иероглиф по пиньиню" value="${esc(String(q.ans ?? ""))}" ${checked ? "disabled" : ""}><button class="icon-btn" data-hw aria-label="Писать рукой">✍</button></div><div id="hk-hw" hidden></div>`;
  }
  if (checked) body += reviewHTML(q);
  const last = run.pos === run.qs.length - 1;
  const nav = train
    ? (q.shown ? `<button class="btn primary wide" data-next>${last ? "Итог" : "Дальше"}</button>` : `<button class="btn primary wide" data-check ${answered(q) ? "" : "disabled"}>Проверить</button>`)
    : `<div class="ex-btns"><button class="btn" data-prev ${run.pos ? "" : "disabled"}>← Назад</button>${last ? `<button class="btn primary" data-finish>Завершить</button>` : `<button class="btn primary" data-next>Дальше →</button>`}</div>
       <button class="link-btn" data-sheet>Бланк ответов</button>`;
  $("hk-card").innerHTML = `<div class="hk-head"><span class="label">${SEC_ZH[sec]} · ${SEC_NAME[sec]} · часть ${partNo}</span>${train ? `<button class="chip-btn small" data-py aria-pressed="${ui.py}">pīnyīn</button>` : ""}</div>
    <p class="hk-instr">${esc(q.part.title)} <span class="zh">${q.part.zh}</span></p>${body}${nav}`;
  if (it.kind === "free" && !checked && document.getElementById("hk-hw")) {
    pad = mountHwPad($("hk-hw"), (ch) => { const i = $<HTMLTextAreaElement>("hk-free"); i.value += ch; setFree(i.value); },
      { label: "⌫", onClick: () => { const i = $<HTMLTextAreaElement>("hk-free"); i.value = [...i.value].slice(0, -1).join(""); setFree(i.value); } });
  }
  if (it.kind === "write" && !checked) {
    pad = mountHwPad($("hk-hw"), (ch) => { const i = $<HTMLInputElement>("hk-in"); i.value += ch; setWrite(i.value); },
      { label: "⌫", onClick: () => { const i = $<HTMLInputElement>("hk-in"); i.value = [...i.value].slice(0, -1).join(""); setWrite(i.value); } });
  }
  // аудио само — при первом показе (в тренировке — по кнопке)
  if (it.audio && !train && playsOf(q) === 0) setTimeout(() => { if (run?.qs[run.pos] === q) play(q, playLimit()); }, 400);
}

function setWrite(v: string) {
  if (!run) return;
  const q = run.qs[run.pos];
  q.ans = v.trim() || null;
  const blank = document.querySelector("#hk-card .hk-blank span");
  if (blank) blank.textContent = v.trim() || "＿";
  const c = document.querySelector<HTMLButtonElement>("#hk-card [data-check]");
  if (c) c.disabled = !answered(q);
}

function setFree(v: string) {
  if (!run) return;
  const q = run.qs[run.pos];
  q.ans = v.trim() ? v : null;
  const n = document.getElementById("hk-n");
  if (n) n.textContent = String(hanCount(v));
  document.querySelectorAll<HTMLElement>("#hk-card .hk-need .chip").forEach((c) => c.classList.toggle("ok", v.includes(c.textContent ?? "")));
  const c = document.querySelector<HTMLButtonElement>("#hk-card [data-check]");
  if (c) c.disabled = !answered(q);
}

const answered = (q: Q) => (Array.isArray(q.ans) ? q.ans.length > 0 : q.ans !== null && q.ans !== "");

/** Разбор задания: что звучало, текст, перевод, верный ответ. */
function reviewHTML(q: Q): string {
  const it = q.item;
  const ok = isRight(it, q.ans as never);
  if (it.kind === "free") {
    const c = freeCheck(it, String(q.ans ?? ""));
    const why = [c.missing.length ? `не использованы слова: ${c.missing.join("、")}` : "", c.short ? `не хватает ${c.short} знаков` : ""].filter(Boolean).join("; ");
    return `<div class="hk-rev ${ok ? "ok" : "no"}"><div class="chip ${ok ? "ok" : "no"}">${ok ? "Засчитано" : "Не засчитано"}</div>
      ${why ? `<div>${esc(why)}</div>` : ""}<div class="hint">Проверяются только длина и нужные слова; сравните с образцом сами.</div>
      <div class="hk-tr"><span class="label">Образец</span><div class="zh">${esc(it.ans ?? "")}</div></div>${it.ru ? `<div class="hk-ru">${esc(it.ru)}</div>` : ""}</div>`;
  }
  const right = it.kind === "choice" ? (it.opts![it.a!].p ?? it.opts![it.a!].t ?? "") : it.kind === "order" && it.words!.some((w) => [...w].length > 6) ? it.words!.join(" ") : it.ans ?? "";
  return `<div class="hk-rev ${ok ? "ok" : "no"}"><div class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Неверно"}</div>
    ${ok ? "" : `<div>Правильно: <b class="zh">${esc(it.kind === "choice" && it.opts!.length === 2 && it.opts![0].t === "对" ? (it.a === 0 ? "对 — верно" : "错 — неверно") : right)}</b></div>`}
    ${it.audio ? `<div class="hk-tr"><span class="label">Звучало</span>${it.audio.map((l) => `<div class="zh">${esc(l)}</div>`).join("")}</div>` : ""}
    ${it.ru ? `<div class="hk-ru">${esc(it.ru)}</div>` : ""}</div>`;
}

async function finish() {
  if (!run || run.done) return;
  run.done = true;
  clearInterval(timer);
  try { speechSynthesis.cancel(); } catch { /* */ }
  const r = run;
  const sc: Score = scoreExam(r.qs.map((q) => ({ item: q.item, sec: q.part.sec, ans: q.ans })));
  const saved = await loadSaved();
  const now = Date.now();
  for (const q of r.qs) saved.seen[q.item.id] = now;
  const sec: Hist["sec"] = {};
  for (const s of r.secs) if (sc.sec[s].total) sec[s] = [sc.sec[s].right, sc.sec[s].total];
  saved.hist = [...saved.hist, { at: now, level: r.level, mode: r.mode, secs: r.secs, total: sc.total, max: sc.max, passed: sc.passed, sec, secsUsed: Math.round((now - r.started) / 1000) }].slice(-200);
  await store.setMeta("hsk", saved);
  const wrong = r.qs.filter((q) => !isRight(q.item, q.ans as never));
  const used = Math.round((now - r.started) / 60000);
  $("hk-count").textContent = "Итог";
  $("hk-timer").textContent = "";
  $("hk-prog").style.width = "100%";
  $("hk-card").innerHTML = `<div class="hk-result">
      <div class="hk-total ${sc.passed ? "ok" : "no"}"><b>${sc.total}</b><span>из ${sc.max}</span></div>
      <p class="center">${sc.passed ? "Сдано — уровень HSK " + r.level + " по силам!" : "Пока не сдано: нужно от " + Math.round(sc.max * 0.6) + " баллов."} · ${used} мин</p>
      ${(["L", "R", "W"] as Sec[]).filter((s) => sc.sec[s].total).map((s) => `<div class="hk-sec"><span>${SEC_NAME[s]}</span><span class="cc-bar"><i style="width:${sc.sec[s].points}%"></i></span><b>${sc.sec[s].points}</b><small>${sc.sec[s].right}/${sc.sec[s].total}</small></div>`).join("")}
    </div>
    ${wrong.length ? `<h3 class="grp-title"><span>Разбор ошибок</span><span class="grp-n">${wrong.length}</span></h3>${wrong.map((q, i) => `<div class="hk-wrong">${wrongHTML(q, i)}</div>`).join("")}` : `<p class="center">Без ошибок!</p>`}
    <div class="ex-btns"><button class="btn" data-home>К выбору</button><button class="btn primary" data-again>Ещё вариант</button></div>`;
}

function wrongHTML(q: Q, i: number): string {
  const it = q.item;
  const your = q.ans === null || (Array.isArray(q.ans) && !q.ans.length) ? "нет ответа"
    : it.kind === "choice" ? (it.opts![q.ans as number]?.p ?? it.opts![q.ans as number]?.t ?? "") : Array.isArray(q.ans) ? q.ans.join("") : String(q.ans);
  return `<div class="hk-wq"><span class="label">${i + 1}. ${SEC_NAME[q.part.sec]} · ${esc(q.part.title)}</span>
    ${it.pic && it.kind === "choice" ? `<span class="hk-mini">${esc(it.pic)}</span>` : ""}
    ${it.text && it.kind !== "free" ? `<div class="zh">${esc(it.text)}${it.py ? ` <small>(${esc(it.py)})</small>` : ""}</div>` : ""}
    ${it.q ? `<div class="zh">${esc(it.q)}</div>` : ""}
    <div>Ваш ответ: <span class="no zh">${esc(your)}</span></div></div>${reviewHTML(q)}`;
}

/** Бланк ответов: номера заданий, отмечены отвеченные, тап — перейти. */
function openSheetAnswers() {
  if (!run) return;
  const r = run;
  openSheet("Бланк ответов", `<div class="hk-grid">${r.qs.map((q, i) => `<button class="hk-cell${answered(q) ? " on" : ""}${i === r.pos ? " cur" : ""}" data-go="${i}">${i + 1}</button>`).join("")}</div>
    <p class="hint">Отвечено ${r.qs.filter(answered).length} из ${r.qs.length}.</p><button class="btn primary wide" id="hk-fin">Завершить экзамен</button>`, (root) => {
    root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const g = t.closest<HTMLButtonElement>("[data-go]");
      if (g) { r.pos = Number(g.dataset.go); closeSheet(); show(); return; }
      if (t.closest("#hk-fin")) { closeSheet(); finish(); }
    });
  });
}

function quit() {
  if (!run || run.done) { stop(); renderHome(); return; }
  confirmInline($("hk-confirm"), "Выйти? Ответы этого варианта не сохранятся.", "Выйти", () => { stop(); renderHome(); });
}
function stop() { clearInterval(timer); run = null; try { speechSynthesis.cancel(); } catch { /* */ } }

export function initHsk() {
  onShow("hsk", () => { if (!run) renderHome(); });
  onLeave("hsk", () => { try { speechSynthesis.cancel(); } catch { /* */ } });
  $("hk-home").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const lv = t.closest<HTMLButtonElement>("[data-lv]");
    if (lv) { ui.level = Number(lv.dataset.lv); save(); renderHome(); return; }
    const m = t.closest<HTMLButtonElement>("[data-mode]");
    if (m) { ui.mode = m.dataset.mode as Mode; save(); renderHome(); return; }
    const s = t.closest<HTMLButtonElement>("[data-start]");
    if (s) start([...s.dataset.start!] as Sec[]);
  });
  $("hk-quit").addEventListener("click", quit);
  $("hk-card").addEventListener("input", (e) => {
    const id = (e.target as HTMLElement).id;
    if (id === "hk-in") setWrite((e.target as HTMLInputElement).value);
    if (id === "hk-free") setFree((e.target as HTMLTextAreaElement).value);
  });
  $("hk-card").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (!run) return;
    if (t.closest("[data-home]")) { stop(); renderHome(); return; }
    if (t.closest("[data-again]")) { const secs = run.secs; stop(); start(secs); return; }
    if (run.done) return;
    const q = run.qs[run.pos];
    if (t.closest("[data-play]")) { play(q); return; }
    if (t.closest("[data-py]")) { ui.py = !ui.py; save(); show(); return; }
    if (t.closest("[data-hide]")) { q.hid = !q.hid; show(); return; }
    if (t.closest("[data-hw]")) { if (pad?.visible()) pad.hide(); else pad?.show(); return; }
    if (t.closest("[data-sheet]")) { openSheetAnswers(); return; }
    if (t.closest("[data-finish]")) {
      const left = run.qs.filter((x) => !answered(x)).length;
      if (left) confirmInline($("hk-confirm"), `Без ответа ${left} ${plural(left, "задание", "задания", "заданий")}. Завершить?`, "Завершить", finish);
      else finish();
      return;
    }
    if (t.closest("[data-prev]")) { if (run.pos > 0) { run.pos--; show(); window.scrollTo(0, 0); } return; }
    if (t.closest("[data-next]")) {
      if (run.pos < run.qs.length - 1) { run.pos++; show(); window.scrollTo(0, 0); } else finish();
      return;
    }
    if (t.closest("[data-check]")) {
      if (!answered(q)) return;
      q.shown = true;
      show();
      return;
    }
    if (run.mode === "train" && q.shown) return;
    const o = t.closest<HTMLButtonElement>("[data-opt]");
    if (o) {
      q.ans = Number(o.dataset.opt);
      document.querySelectorAll<HTMLButtonElement>("#hk-card [data-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b === o)));
      if (run.mode === "train") { q.shown = true; show(); }
      else $("hk-prog").style.width = `${(100 * run.qs.filter((x) => answered(x)).length) / run.qs.length}%`;
      return;
    }
    const tile = t.closest<HTMLButtonElement>("[data-tile]");
    if (tile) { (q.ans as string[]).push(tile.dataset.tile!); show(); return; }
    const a = t.closest<HTMLButtonElement>("[data-ans]");
    if (a) { (q.ans as string[]).splice(Number(a.dataset.ans), 1); show(); return; }
  });
}
