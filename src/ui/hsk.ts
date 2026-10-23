/**
 * Экзамен HSK 3.0 (уровни 1–6). Вариант собирается из банка заданий (data/hsk/hskN.txt) заново каждый раз:
 * сначала задания, которых давно не было. Три ступени: тренировка (пиньинь и перевод, разбор сразу, без таймера),
 * как на экзамене (таймер, аудио дважды, разбор в конце), сложнее (аудио один раз и быстрее, времени на треть меньше).
 * Прогресс — meta `hsk`: {seen: id → время, hist: результаты}.
 */
import * as store from "../store.ts";
import {
  LEVELS, MODES, SEC_NAME, SEC_ZH, levelSpec, parseBank, assemble, shuffleOpts, isRight, scoreExam, freeCheck, hanCount,
  type Item, type Part, type Sec, type Mode, type Score,
} from "../core/hsk.ts";
import { noteAnswer, wrongPool, wrongCount, weakParts, addPartStats, permOf, applyPerm, KEEP_RUNS, type SavedRun, type SavedQ, type WrongRec, type PartStat } from "../core/hskprog.ts";
import { ensurePy, rubyHTML } from "./hskpy.ts";
import { say, sayAll, stopSpeech } from "../speech.ts";
import { $, esc, plural } from "./dom.ts";
import { onShow, onLeave } from "./nav.ts";
import { openSheet, closeSheet, confirmInline } from "./sheet.ts";
import { mountHwPad, type HwPad } from "./hwpad.ts";
import { initHskk, renderOralHome, leaveOral } from "./hskk.ts";

type Hist = { at: number; level: number; mode: Mode; secs: Sec[]; total: number; max: number; passed: boolean; sec: Partial<Record<Sec, [number, number]>>; secsUsed: number; fix?: boolean };
type Saved = { seen: Record<string, number>; hist: Hist[]; runs: SavedRun[]; wrong: Record<string, WrongRec>; stat: Record<string, PartStat>; cur?: SavedRun };
type Ans = number | string | string[] | null;
type Q = { item: Item; part: Part; ans: Ans; tiles?: string[]; plays: number; shown: boolean; hid?: boolean; perm?: number[] };

const LS = "cherta.hsk";
const ui = { level: 1, mode: "exam" as Mode, py: true, kind: "w" as "w" | "o" };
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
const loadSaved = async (): Promise<Saved> => ({ seen: {}, hist: [], runs: [], wrong: {}, stat: {}, ...((await store.getMeta<Saved>("hsk")) ?? {}) });
/** Прочитать, изменить и записать прогресс (ответы в тренировке пишутся сразу, не дожидаясь конца). */
async function update(f: (s: Saved) => void) { const s = await loadSaved(); f(s); await store.setMeta("hsk", s); }

let run: { level: number; mode: Mode; secs: Sec[]; qs: Q[]; pos: number; started: number; deadline: number; done: boolean; gplays: Record<string, number>; fix?: boolean; at: number; spent: number; bank: Item[] } | null = null;
/** Прослушивания: у вопросов к одной записи — общий счётчик (запись звучит для группы, а не для каждого вопроса). */
const playsOf = (q: Q) => (q.item.grp ? run?.gplays[q.item.grp] ?? 0 : q.plays);
const addPlays = (q: Q, n: number) => { if (q.item.grp && run) run.gplays[q.item.grp] = playsOf(q) + n; else q.plays += n; };
let timer = 0;
let pad: HwPad | null = null;

/* ---------- пиньинь для тренировки ---------- */

/** Китайский текст; в тренировке с включённым пиньинем — над словами. */
function zhHTML(text: string): string {
  if (!(run?.mode === "train" && ui.py)) return esc(text);
  return rubyHTML(text);
}
const stripWho = (s: string) => s.replace(/^[男女][：:]\s*/, "");

/* ---------- главный экран ---------- */

const bar = (show: boolean) => { $("hk-kind").hidden = !show; };
/** Письменная часть или устная (HSKK). */
function showKind() {
  document.querySelectorAll<HTMLButtonElement>("#hk-kind [data-kind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === ui.kind)));
  const oral = ui.kind === "o";
  $("hk-oral").hidden = !oral;
  if (oral) { $("hk-home").hidden = true; $("hk-run").hidden = true; void renderOralHome(); }
  else void renderHome();
}

async function renderHome() {
  bar(true);
  $("hk-oral").hidden = true;
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
  const have = new Set(saved.runs.map((r) => r.at));
  const cur = saved.cur;
  const nWrong = wrongCount(saved.wrong, ui.level);
  const weak = weakParts(saved.stat, ui.level).slice(0, 3);
  const partName = (id: string) => { const p = spec.parts.find((x) => x.id === id); return p ? `${SEC_NAME[p.sec]} · ${p.title}` : id; };
  home.innerHTML = `
    ${cur ? `<div class="hk-cur panel"><button class="hk-card" data-resume><b>Продолжить: HSK ${cur.level}${cur.fix ? " · работа над ошибками" : ""}</b><small>${esc(MODES.find((m) => m.id === cur.mode)?.name ?? "")} · отвечено ${cur.qs.filter((q) => q.ans !== null && !(Array.isArray(q.ans) && !q.ans.length)).length} из ${cur.qs.length}${cur.left ? ` · осталось ${Math.ceil(cur.left / 60000)} мин` : ""}</small></button><button class="link-btn" data-drop-cur>Не продолжать</button></div>` : ""}
    <div class="seg wide-seg hk-lv" role="group" aria-label="Уровень">${LEVELS.filter((l) => lvs.includes(l.level)).map((l) => `<button data-lv="${l.level}" aria-pressed="${l.level === ui.level}">HSK ${l.level}</button>`).join("")}</div>
    <div class="seg wide-seg" role="group" aria-label="Сложность">${MODES.map((m) => `<button data-mode="${m.id}" aria-pressed="${m.id === ui.mode}">${m.name}</button>`).join("")}</div>
    <p class="hint">${esc(MODES.find((m) => m.id === ui.mode)!.hint)}</p>
    ${nWrong ? `<button class="hk-card panel hk-fixbtn" data-fix><b>Работа над ошибками <span class="chip">${nWrong}</span></b><small>задания, в которых вы ошибались; уходят из списка после двух верных ответов подряд</small></button>` : ""}
    ${card(all, "Полный экзамен", `${n()} ${plural(n(), "задание", "задания", "заданий")}${ui.mode === "train" ? "" : ` · ${mins(all)} мин`} · ${all.map((s) => SEC_NAME[s].toLowerCase()).join(", ")}`)}
    <div class="hk-secs">${all.map((s) => card([s], `${SEC_NAME[s]} <span class="zh">${SEC_ZH[s]}</span>`, `${n([s])} ${plural(n([s]), "задание", "задания", "заданий")}${ui.mode === "train" ? "" : ` · ${mins([s])} мин`}`)).join("")}</div>
    ${weak.length ? `<h3 class="grp-title"><span>Слабые места</span></h3><div class="hk-hist">${weak.map((w) => `<div class="hk-h"><span>${esc(partName(w.part))}</span><b class="no">${Math.round(w.share * 100)}%</b></div>`).join("")}</div>` : ""}
    ${hist.length ? `<h3 class="grp-title"><span>Мои результаты · HSK ${ui.level}</span></h3><div class="hk-hist">${hist.map((h) => histRow(h, have.has(h.at))).join("")}</div>` : ""}
    <details class="hk-about"><summary>О формате и баллах</summary><p class="hint">Новый HSK 3.0. ${ui.level <= 3 ? "Число заданий и время — по образцам экзамена" : "Образцы нового экзамена для уровней 4–6 ещё не опубликованы: формат — как у прежнего HSK, слова — HSK 3.0"}; задания написаны для «Черты» по схеме HSK, каждый вариант собирается заново из банка.</p><p class="hint">Баллы: каждая часть — из 100, «сдал» — от 60% суммы. Официальные пороги HSK 3.0 ещё не опубликованы, это ориентир. Устная часть — HSKK — переключатель «Устная · HSKK» вверху.</p></details>`;
}

const histRow = (h: Hist, open: boolean) => `<${open ? `button data-run="${h.at}"` : "div"} class="hk-h${open ? " link" : ""}"><span>${new Date(h.at).toLocaleDateString("ru-RU")} · ${h.fix ? "Ошибки" : esc(MODES.find((m) => m.id === h.mode)?.name ?? "")}${h.secs.length < 2 ? ` · ${esc(SEC_NAME[h.secs[0]])}` : ""}</span><b class="${h.fix ? "" : h.passed ? "ok" : "no"}">${h.total}/${h.max}</b></${open ? "button" : "div"}>`;

/* ---------- экзамен ---------- */

/** Собрать Q из заданий банка (перемешав варианты и слова). */
function makeQs(spec: ReturnType<typeof levelSpec> & {}, items: Item[]): Q[] {
  return items.map((it): Q => {
    const part = spec.parts.find((p) => p.id === it.part)!;
    const item = shuffleOpts(it, Math.random);
    const tiles = item.kind === "order" ? shuffled(item.words!) : undefined;
    return { item, part, ans: item.kind === "order" ? [] : null, tiles, plays: 0, shown: false, hid: false, perm: permOf(it, item) };
  });
}

async function begin(level: number, mode: Mode, secs: Sec[], qs: Q[], bank: Item[], opt: { fix?: boolean; from?: SavedRun } = {}) {
  const spec = levelSpec(level)!;
  if (mode === "train") await ensurePy();
  const f = opt.from;
  const minutes = secs.reduce((a, s) => a + spec.minutes[s], 0) * (mode === "hard" ? 2 / 3 : 1);
  const now = Date.now();
  run = {
    level, mode, secs, qs, pos: Math.min(f?.pos ?? 0, qs.length - 1), started: now - (f?.spent ?? 0), at: f?.at ?? now, spent: f?.spent ?? 0, bank,
    deadline: mode === "train" ? 0 : now + (f?.left ?? minutes * 60_000), done: false, gplays: { ...(f?.gplays ?? {}) }, fix: opt.fix,
  };
  bar(false);
  $("hk-home").hidden = true;
  $("hk-run").hidden = false;
  clearInterval(timer);
  if (run.deadline) { timer = window.setInterval(tick, 1000); tick(); } else $("hk-timer").textContent = "";
  show();
  persist();
}

async function start(secs: Sec[]) {
  const spec = levelSpec(ui.level)!;
  let bank: Item[];
  try { bank = await bankOf(ui.level); } catch { openSheet("Экзамен HSK", `<p class="note danger">Задания не загрузились. Для первого раза нужен интернет.</p>`); return; }
  const saved = await loadSaved();
  const parts = assemble(spec, bank, saved.seen, Math.random, secs);
  const qs = parts.flatMap(({ items }) => makeQs(spec, items));
  if (!qs.length) return;
  await begin(ui.level, ui.mode, secs, qs, bank);
}

/** Работа над ошибками: задания, в которых ошибались (тренировка: проверка после каждого). */
async function startFix() {
  const spec = levelSpec(ui.level)!;
  let bank: Item[];
  try { bank = await bankOf(ui.level); } catch { openSheet("Экзамен HSK", `<p class="note danger">Задания не загрузились. Для первого раза нужен интернет.</p>`); return; }
  const saved = await loadSaved();
  const items = wrongPool(saved.wrong, bank);
  if (!items.length) { renderHome(); return; }
  // тексты групп идут вместе с заданием, поэтому одиночные вопросы годятся; порядок — по частям, как на экзамене
  items.sort((a, b) => spec.parts.findIndex((p) => p.id === a.part) - spec.parts.findIndex((p) => p.id === b.part));
  const qs = makeQs(spec, items);
  const secs = (["L", "R", "W"] as Sec[]).filter((s) => qs.some((q) => q.part.sec === s));
  ui.mode = "train";
  await begin(ui.level, "train", secs, qs, bank, { fix: true });
}

/** Сохранить ход: ответы, место, оставшееся время (продолжить можно с главного экрана). */
const snapQ = (q: Q): SavedQ => ({ id: q.item.id, ...(q.perm ? { perm: q.perm } : {}), ...(q.tiles ? { tiles: q.tiles } : {}), ans: q.ans, ...(q.shown ? { shown: true } : {}), ...(q.hid ? { hid: true } : {}) });
function snap(): SavedRun | null {
  if (!run) return null;
  return {
    at: run.at, level: run.level, mode: run.mode, secs: run.secs, ...(run.fix ? { fix: true } : {}), qs: run.qs.map(snapQ), pos: run.pos,
    ...(run.deadline ? { left: Math.max(1000, run.deadline - Date.now()) } : {}), spent: Date.now() - run.started, gplays: run.gplays,
  };
}
let saveT = 0;
function persist() {
  clearTimeout(saveT);
  saveT = window.setTimeout(() => {
    if (!run || run.done) return;
    const c = snap();
    if (c) update((s) => { s.cur = c; });
  }, 400);
}
/** Восстановить вариант по банку (бланк ответов, место, перемешанные варианты). */
function restore(sr: SavedRun, bank: Item[]): Q[] {
  const spec = levelSpec(sr.level)!;
  const byId = new Map(bank.map((it) => [it.id, it]));
  return sr.qs.flatMap((sq): Q[] => {
    const base = byId.get(sq.id);
    if (!base) return [];
    const item = applyPerm(base, sq.perm);
    const part = spec.parts.find((p) => p.id === item.part);
    if (!part) return [];
    return [{ item, part, ans: sq.ans, tiles: sq.tiles, plays: 0, shown: !!sq.shown, hid: !!sq.hid, perm: sq.perm }];
  });
}

async function resume() {
  const saved = await loadSaved();
  const c = saved.cur;
  if (!c) return;
  let bank: Item[];
  try { bank = await bankOf(c.level); } catch { openSheet("Экзамен HSK", `<p class="note danger">Задания не загрузились.</p>`); return; }
  const qs = restore(c, bank);
  if (!qs.length) { await update((s) => { delete s.cur; }); renderHome(); return; }
  ui.level = c.level; ui.mode = c.mode as Mode; save();
  await begin(c.level, c.mode as Mode, c.secs, qs, bank, { fix: c.fix, from: c });
}

/** Открыть сохранённый вариант: итог и разбор ошибок. */
async function view(at: number) {
  const saved = await loadSaved();
  const sr = saved.runs.find((r) => r.at === at);
  if (!sr) return;
  let bank: Item[];
  try { bank = await bankOf(sr.level); } catch { openSheet("Экзамен HSK", `<p class="note danger">Задания не загрузились.</p>`); return; }
  const qs = restore(sr, bank);
  run = { level: sr.level, mode: sr.mode as Mode, secs: sr.secs, qs, pos: 0, started: Date.now(), at: sr.at, spent: sr.spent ?? 0, bank, deadline: 0, done: true, gplays: {}, fix: sr.fix };
  bar(false);
  $("hk-home").hidden = true;
  $("hk-run").hidden = false;
  clearInterval(timer);
  $("hk-timer").textContent = "";
  renderResult(sr.spent ? Math.round(sr.spent / 60000) : 0);
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
  stopSpeech();
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
      else body += `<div class="hk-text long">${it.text.split(/\u3000{2,}/).map((x) => `<p>${zhHTML(x.trim())}</p>`).join("")}</div>${summary && !checked ? `<button class="btn" data-hide>${train ? "Спрятать текст" : "Прочитал — спрятать текст и писать"}</button>` : ""}`;
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

/** Тренировка: ответ проверен — сразу учесть в «Работе над ошибками». */
function noteQ(q: Q) {
  const right = isRight(q.item, q.ans as never), now = Date.now();
  update((s) => { noteAnswer(s.wrong, q.item.id, right, now); s.seen[q.item.id] = now; });
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
  stopSpeech();
  clearTimeout(saveT);
  const r = run;
  const sc: Score = scoreExam(r.qs.map((q) => ({ item: q.item, sec: q.part.sec, ans: q.ans })));
  const now = Date.now();
  const rights = r.qs.map((q) => isRight(q.item, q.ans as never));
  const nRight = rights.filter(Boolean).length;
  const sec: Hist["sec"] = {};
  for (const s of r.secs) if (sc.sec[s].total) sec[s] = [sc.sec[s].right, sc.sec[s].total];
  const sr = snap()!;
  delete sr.left; delete sr.pos;
  await update((s) => {
    r.qs.forEach((q, i) => {
      s.seen[q.item.id] = now;
      if (!q.shown) noteAnswer(s.wrong, q.item.id, rights[i], now); // в тренировке проверенные уже учтены
    });
    addPartStats(s.stat, r.qs.map((q, i) => ({ part: q.part.id, right: rights[i] })));
    const total = r.fix ? nRight : sc.total, max = r.fix ? r.qs.length : sc.max;
    s.hist = [...s.hist, { at: r.at, level: r.level, mode: r.mode, secs: r.secs, total, max, passed: sc.passed, sec, secsUsed: Math.round((now - r.started) / 1000), ...(r.fix ? { fix: true } : {}) }].slice(-200);
    s.runs = [...s.runs.filter((x) => x.at !== r.at), { ...sr, total, max, passed: sc.passed }].slice(-KEEP_RUNS);
    delete s.cur;
  });
  renderResult(Math.round((now - r.started) / 60000));
}

/** Итог варианта и разбор ошибок (после экзамена и при открытии сохранённого). */
function renderResult(used: number) {
  if (!run) return;
  const r = run;
  const sc: Score = scoreExam(r.qs.map((q) => ({ item: q.item, sec: q.part.sec, ans: q.ans })));
  const wrong = r.qs.filter((q) => !isRight(q.item, q.ans as never));
  const right = r.qs.length - wrong.length;
  $("hk-count").textContent = "Итог";
  $("hk-timer").textContent = "";
  $("hk-prog").style.width = "100%";
  const head = r.fix
    ? `<div class="hk-total ${wrong.length ? "no" : "ok"}"><b>${right}</b><span>из ${r.qs.length}</span></div><p class="center">Работа над ошибками${wrong.length ? ": эти задания вернутся" : ": всё верно!"}${used ? ` · ${used} мин` : ""}</p>`
    : `<div class="hk-total ${sc.passed ? "ok" : "no"}"><b>${sc.total}</b><span>из ${sc.max}</span></div>
      <p class="center">${sc.passed ? "Сдано — уровень HSK " + r.level + " по силам!" : "Пока не сдано: нужно от " + Math.round(sc.max * 0.6) + " баллов."}${used ? ` · ${used} мин` : ""}</p>
      ${(["L", "R", "W"] as Sec[]).filter((s) => sc.sec[s].total).map((s) => `<div class="hk-sec"><span>${SEC_NAME[s]}</span><span class="cc-bar"><i style="width:${sc.sec[s].points}%"></i></span><b>${sc.sec[s].points}</b><small>${sc.sec[s].right}/${sc.sec[s].total}</small></div>`).join("")}`;
  $("hk-card").innerHTML = `<div class="hk-result">${head}</div>
    ${wrong.length ? `<h3 class="grp-title"><span>Разбор ошибок</span><span class="grp-n">${wrong.length}</span></h3>${wrong.map((q, i) => `<div class="hk-wrong">${wrongHTML(q, i)}</div>`).join("")}` : `<p class="center">Без ошибок!</p>`}
    <div class="ex-btns"><button class="btn" data-home>К выбору</button>${r.fix ? "" : `<button class="btn primary" data-again>Ещё вариант</button>`}</div>`;
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
  // ход сохраняется сам: продолжить можно с главного экрана
  confirmInline($("hk-confirm"), run.mode === "train" ? "Выйти? Вариант сохранится — продолжите с главного экрана." : "Выйти? Вариант сохранится вместе со временем — продолжите с главного экрана.", "Выйти", async () => {
    clearTimeout(saveT);
    const c = snap();
    if (c) await update((s) => { s.cur = c; });
    stop(); renderHome();
  });
}
function stop() { clearInterval(timer); clearTimeout(saveT); run = null; stopSpeech(); }

export function initHsk() {
  initHskk(bar);
  $("hk-kind").addEventListener("click", (e) => {
    const k = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-kind]");
    if (k) { ui.kind = k.dataset.kind as "w" | "o"; save(); showKind(); }
  });
  onShow("hsk", () => { if (!run) showKind(); });
  onLeave("hsk", () => {
    stopSpeech();
    leaveOral();
    if (run && !run.done) { clearTimeout(saveT); const c = snap(); if (c) update((x) => { x.cur = c; }); }
  });
  $("hk-home").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const lv = t.closest<HTMLButtonElement>("[data-lv]");
    if (lv) { ui.level = Number(lv.dataset.lv); save(); renderHome(); return; }
    const m = t.closest<HTMLButtonElement>("[data-mode]");
    if (m) { ui.mode = m.dataset.mode as Mode; save(); renderHome(); return; }
    if (t.closest("[data-resume]")) { resume(); return; }
    if (t.closest("[data-drop-cur]")) { confirmInline($("hk-confirm-home"), "Удалить незаконченный вариант?", "Удалить", async () => { await update((x) => { delete x.cur; }); renderHome(); }); return; }
    if (t.closest("[data-fix]")) { startFix(); return; }
    const v = t.closest<HTMLElement>("[data-run]");
    if (v) { view(Number(v.dataset.run)); return; }
    const s = t.closest<HTMLButtonElement>("[data-start]");
    if (s) start([...s.dataset.start!] as Sec[]).catch((err) => console.error("hsk start", err));
  });
  $("hk-quit").addEventListener("click", quit);
  $("hk-card").addEventListener("input", (e) => {
    const id = (e.target as HTMLElement).id;
    if (id === "hk-in") setWrite((e.target as HTMLInputElement).value);
    if (id === "hk-free") setFree((e.target as HTMLTextAreaElement).value);
    persist();
  });
  $("hk-card").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (!run) return;
    if (t.closest("[data-home]")) { stop(); renderHome(); return; }
    if (t.closest("[data-again]")) { const secs = run.secs; ui.level = run.level; stop(); start(secs); return; }
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
    if (t.closest("[data-prev]")) { if (run.pos > 0) { run.pos--; show(); persist(); window.scrollTo(0, 0); } return; }
    if (t.closest("[data-next]")) {
      if (run.pos < run.qs.length - 1) { run.pos++; show(); persist(); window.scrollTo(0, 0); } else finish();
      return;
    }
    if (t.closest("[data-check]")) {
      if (!answered(q)) return;
      q.shown = true;
      noteQ(q);
      show(); persist();
      return;
    }
    if (run.mode === "train" && q.shown) return;
    const o = t.closest<HTMLButtonElement>("[data-opt]");
    if (o) {
      q.ans = Number(o.dataset.opt);
      document.querySelectorAll<HTMLButtonElement>("#hk-card [data-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b === o)));
      if (run.mode === "train") { q.shown = true; noteQ(q); show(); }
      else $("hk-prog").style.width = `${(100 * run.qs.filter((x) => answered(x)).length) / run.qs.length}%`;
      persist();
      return;
    }
    const tile = t.closest<HTMLButtonElement>("[data-tile]");
    if (tile) { (q.ans as string[]).push(tile.dataset.tile!); show(); persist(); return; }
    const a = t.closest<HTMLButtonElement>("[data-ans]");
    if (a) { (q.ans as string[]).splice(Number(a.dataset.ans), 1); show(); persist(); return; }
  });
}
