/**
 * Устная часть — HSKK (初级 / 中级 / 高级). Задания: повтор за диктором, ответ на вопрос, рассказ по картинке, пересказ, чтение вслух.
 * Голос диктора — озвучка устройства, ответ распознаёт браузер (Web Speech API, нужен интернет); без распознавания (приложение,
 * компьютер без службы речи) запись можно прослушать и оценить себя самому. Оценка по распознанному тексту примерная,
 * свою оценку (хорошо / частично / не получилось) можно поставить всегда. Результаты — meta `hsk`.oral.
 */
import * as store from "../store.ts";
import {
  OLEVELS, olevel, parseOral, assembleOral, scoreTask, scoreOral, verdict, SELF,
  type OItem, type OPart, type OKind, type TaskScore,
} from "../core/hskk.ts";
import { diffZh } from "../core/exercise.ts";
import { canRecognize, listen, REC_ERRORS, type Listener } from "../speechrec.ts";
import { say, sayAll, stopSpeech } from "../speech.ts";
import { $, esc, plural } from "./dom.ts";
import { confirmInline } from "./sheet.ts";
import { ensurePy, rubyHTML } from "./hskpy.ts";

type OMode = "train" | "exam";
type OHist = { at: number; level: number; mode: OMode; kinds: OKind[]; total: number; passed: boolean; parts: { kind: OKind; pts: number; n: number }[]; tasks: { id: string; pts: number }[] };
type OSaved = { seen: Record<string, number>; hist: OHist[] };
type T = {
  part: OPart; item: OItem; plays: number; said: string; auto: TaskScore | null; self: number | null;
  state: "idle" | "rec" | "done"; text: boolean; audio?: string; err?: string;
};

const LS = "cherta.hskk";
const ui = { level: 1, mode: "train" as OMode };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const saveUi = () => { try { localStorage.setItem(LS, JSON.stringify(ui)); } catch { /* */ } };

let bank: Promise<OItem[]> | null = null;
const loadBank = () => (bank ??= fetch("data/hsk/hskk.txt").then((r) => { if (!r.ok) throw new Error("bank"); return r.text(); }).then(parseOral).catch((e) => { bank = null; throw e; }));

async function loadOral(): Promise<OSaved> {
  const m = (await store.getMeta<{ oral?: OSaved }>("hsk")) ?? {};
  return { seen: {}, hist: [], ...(m.oral ?? {}) };
}
async function updateOral(f: (o: OSaved) => void) {
  const m = ((await store.getMeta<Record<string, unknown>>("hsk")) ?? {}) as Record<string, unknown> & { oral?: OSaved };
  const o: OSaved = { seen: {}, hist: [], ...(m.oral ?? {}) };
  f(o);
  await store.setMeta("hsk", { ...m, oral: o });
}

let sess: { level: number; mode: OMode; ts: T[]; pos: number; at: number; done: boolean; kinds: OKind[] } | null = null;
let lis: Listener | null = null;
let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let tmr = 0, tick = 0, autoPlay = 0;
let setBar: (show: boolean) => void = () => {};

const KIND_NAME: Record<OKind, string> = { repeat: "Повтор", answer: "Ответ на вопрос", prompt: "Ответ с экрана", picture: "Рассказ по картинке", retell: "Пересказ", read: "Чтение вслух" };

/* ---------- главный экран ---------- */

export async function renderOralHome() {
  $("ho-run").hidden = true;
  const home = $("ho-home");
  home.hidden = false;
  setBar(true);
  const lv = olevel(ui.level) ?? OLEVELS[0];
  const saved = await loadOral();
  const n = (kinds?: OKind[]) => lv.parts.filter((p) => !kinds || kinds.includes(p.kind)).reduce((a, p) => a + p.n, 0);
  const mins = (kinds: OKind[]) => Math.round(lv.minutes * n(kinds) / n());
  const card = (kinds: OKind[], title: string, sub: string) => `<button class="hk-card panel" data-ostart="${kinds.join(",")}"><b>${title}</b><small>${sub}</small></button>`;
  const all = lv.parts.map((p) => p.kind);
  const hist = saved.hist.filter((h) => h.level === ui.level).slice(-5).reverse();
  home.innerHTML = `
    <div class="seg wide-seg hk-lv" role="group" aria-label="Уровень HSKK">${OLEVELS.map((l) => `<button data-olv="${l.level}" aria-pressed="${l.level === ui.level}">${l.zh} <span class="zh-sm">${l.name}</span></button>`).join("")}</div>
    <div class="seg wide-seg" role="group" aria-label="Режим"><button data-omode="train" aria-pressed="${ui.mode === "train"}">Тренировка</button><button data-omode="exam" aria-pressed="${ui.mode === "exam"}">Экзамен</button></div>
    <p class="hint">${ui.mode === "train" ? "пиньинь и текст по кнопке, разбор после каждого ответа, без ограничений" : "как на экзамене: фраза звучит один раз, текста нет, результат — в конце"}</p>
    ${canRecognize() ? "" : `<p class="note">На этом устройстве нет распознавания речи: ваша запись сохранится, прослушайте её и оцените себя сами (в браузере Chrome на телефоне или компьютере речь распознаётся сама).</p>`}
    ${card(all, "Полный экзамен HSKK", `${n()} ${plural(n(), "задание", "задания", "заданий")} · около ${lv.minutes} мин · ${lv.parts.map((p) => KIND_NAME[p.kind].toLowerCase()).join(", ")}`)}
    <div class="hk-secs">${lv.parts.map((p) => card([p.kind], `${KIND_NAME[p.kind]} <span class="zh">${p.zh}</span>`, `${p.n} ${plural(p.n, "задание", "задания", "заданий")} · ${mins([p.kind])} мин`)).join("")}</div>
    ${hist.length ? `<h3 class="grp-title"><span>Мои результаты · ${lv.zh}</span></h3><div class="hk-hist">${hist.map((h) => `<div class="hk-h"><span>${new Date(h.at).toLocaleDateString("ru-RU")} · ${h.mode === "exam" ? "Экзамен" : "Тренировка"}${h.kinds.length < lv.parts.length ? ` · ${esc(h.kinds.map((k) => KIND_NAME[k]).join(", "))}` : ""}</span><b class="${h.passed ? "ok" : "no"}">${h.total}/100</b></div>`).join("")}</div>` : ""}
    <details class="hk-about"><summary>О формате и баллах</summary><p class="hint">HSKK — устный экзамен к HSK, три уровня: 初级 (≈ HSK 1–2), 中级 (≈ 3–4), 高级 (≈ 5–6). Каждый уровень — три части: повтор и ответы, рассказ по картинке или пересказ, ответы на вопросы. Задания написаны для «Черты» по схеме экзамена.</p><p class="hint">Оценка примерная: распознанный текст сравнивается с образцом (для повтора, чтения и пересказа — по знакам, для ответов — по словам-опорам и длине). Распознавание ошибается в тонах и редких словах — поэтому свою оценку можно поставить вручную. Итог — среднее по частям из 100, «сдал» — от 60 (ориентир, официальные пороги другие).</p></details>`;
}

/* ---------- занятие ---------- */

async function start(kinds: OKind[]) {
  let items: OItem[];
  try { items = await loadBank(); } catch { $("ho-home").insertAdjacentHTML("afterbegin", `<p class="note danger">Задания не загрузились. Для первого раза нужен интернет.</p>`); return; }
  const saved = await loadOral();
  const parts = assembleOral(ui.level, items, saved.seen, Math.random, kinds);
  const ts: T[] = parts.flatMap(({ part, items }) => items.map((item): T => ({ part, item, plays: 0, said: "", auto: null, self: null, state: "idle", text: false })));
  if (!ts.length) return;
  if (ui.mode === "train") await ensurePy();
  sess = { level: ui.level, mode: ui.mode, ts, pos: 0, at: Date.now(), done: false, kinds: parts.map((p) => p.part.kind) };
  setBar(false);
  $("ho-home").hidden = true;
  $("ho-run").hidden = false;
  show();
}

const LIMIT: Record<OKind, number> = { repeat: 1, answer: 1, retell: 2, prompt: 0, picture: 0, read: 0 };
const maxPlays = (t: T) => (sess?.mode === "train" ? Infinity : LIMIT[t.part.kind]);
const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const zh = (s: string) => (sess?.mode === "train" ? rubyHTML(s) : esc(s));

function speak(text: string, rate = 0.85) {
  const parts = text.split(/(?<=[。！？])/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) sayAll(parts, rate); else say(text, rate);
}

function clearRec() {
  clearTimeout(tmr); clearInterval(tick); clearTimeout(autoPlay);
  lis?.abort(); lis = null;
  if (rec && rec.state !== "inactive") { rec.onstop = null; try { rec.stop(); } catch { /* */ } }
  rec = null;
  stream?.getTracks().forEach((x) => x.stop()); stream = null;
}

function show() {
  if (!sess) return;
  clearRec();
  stopSpeech();
  const t = sess.ts[sess.pos];
  const { part, item } = t;
  const train = sess.mode === "train";
  const inPart = sess.ts.filter((x) => x.part === part);
  $("ho-count").textContent = `${sess.pos + 1} из ${sess.ts.length}`;
  $("ho-prog").style.width = `${(100 * sess.ts.filter((x) => x.state === "done").length) / sess.ts.length}%`;
  const hears = part.hear;
  let body = `<p class="hint">${esc(part.hint)}</p>`;
  if (hears) {
    const left = maxPlays(t) - t.plays;
    body += `<div class="hk-audio"><button class="btn" data-oplay ${left <= 0 ? "disabled" : ""}>${PLAY} Слушать <small>${train ? "сколько угодно раз" : left <= 0 ? "прослушано" : `осталось ${left}`}</small></button></div>`;
    if (train) body += t.text ? `<div class="hk-text${item.zh.length > 40 ? " long" : ""}">${zh(item.zh)}</div>${item.ru ? `<div class="hk-ru">${esc(item.ru)}</div>` : ""}` : `<button class="link-btn" data-otext>Показать текст</button>`;
  } else if (part.kind === "picture") {
    body += `<div class="hk-pic ho-pic">${esc(item.zh)}</div><div class="hk-need">${(item.keys ?? []).map((w) => `<span class="chip">${esc(w)}</span>`).join("")}</div>`;
  } else {
    body += `<div class="hk-text${item.zh.length > 40 ? " long" : ""}">${zh(item.zh)}</div>`;
    if (part.kind === "prompt") body += `<div class="hk-audio"><button class="btn small" data-oplay>${PLAY} Прочитать вопрос вслух</button></div>${train && item.ru ? `<div class="hk-ru">${esc(item.ru)}</div>` : ""}`;
  }
  body += `<div id="ho-mic" class="ho-mic"></div>`;
  const last = sess.pos === sess.ts.length - 1;
  body += `<div id="ho-nav" class="ex-btns"></div>`;
  $("ho-card").innerHTML = `<div class="hk-head"><span class="label">${part.zh} · ${esc(KIND_NAME[part.kind])} · ${inPart.indexOf(t) + 1} из ${inPart.length}</span></div>
    <p class="hk-instr">${esc(part.title)} <span class="zh">${part.zh}</span></p>${body}`;
  micUi(t);
  void last;
  if (hears && !train && t.plays === 0 && t.state === "idle") autoPlay = window.setTimeout(() => { if (sess?.ts[sess.pos] === t) playItem(t); }, 500);
}

function playItem(t: T) {
  if (t.plays >= maxPlays(t)) return;
  t.plays++;
  speak(t.item.zh, 0.85);
  const b = document.querySelector<HTMLButtonElement>("#ho-card [data-oplay]");
  if (b && t.part.hear) { const left = maxPlays(t) - t.plays; b.disabled = left <= 0; const sm = b.querySelector("small"); if (sm) sm.textContent = sess?.mode === "train" ? "сколько угодно раз" : left <= 0 ? "прослушано" : `осталось ${left}`; }
}

/** Нижняя часть карточки: кнопка записи → идёт запись → результат. */
function micUi(t: T) {
  if (!sess) return;
  const mic = $("ho-mic"), nav = $("ho-nav");
  const train = sess.mode === "train";
  const last = sess.pos === sess.ts.length - 1;
  const next = `<button class="btn primary wide" data-onext ${t.state === "done" && (train && !canRecognize() && t.self === null) ? "disabled" : ""}>${last ? "Итог" : "Дальше"}</button>`;
  if (t.state === "idle") {
    mic.innerHTML = `${t.err ? `<p class="note danger">${esc(t.err)}</p>` : ""}<button class="btn primary wide ho-rec" data-orec>● Говорить <small>до ${t.part.secs} с</small></button>`;
    nav.innerHTML = sess.pos > 0 && !train ? "" : "";
  } else if (t.state === "rec") {
    mic.innerHTML = `<div class="ho-live"><span class="ho-dot"></span><span id="ho-left">${t.part.secs} с</span></div><div class="ho-said" id="ho-said">${esc(t.said) || "<span class='hint'>Говорите…</span>"}</div><button class="btn primary wide" data-ostop>■ Готово</button>`;
    nav.innerHTML = "";
  } else {
    mic.innerHTML = train ? resultHTML(t, true) : `<div class="hk-rev ok"><div class="chip ok">Ответ записан</div><div class="hint">Результат — в конце экзамена.</div></div>`;
    nav.innerHTML = next;
  }
}

/* ---------- запись ---------- */

const FREE: OKind[] = ["prompt", "picture", "retell", "read"];
function startRec(t: T) {
  stopSpeech();
  clearRec();
  t.err = undefined; t.said = ""; t.state = "rec"; t.audio = undefined;
  micUi(t);
  const secs = t.part.secs;
  let left = secs;
  const stop = () => { stopRec(t); };
  tmr = window.setTimeout(stop, secs * 1000);
  tick = window.setInterval(() => { left--; const el = document.getElementById("ho-left"); if (el) el.textContent = `${Math.max(0, left)} с`; }, 1000);
  if (canRecognize()) {
    lis = listen({
      continuous: FREE.includes(t.part.kind),
      onUpdate: (x) => { t.said = x; const el = document.getElementById("ho-said"); if (el) el.textContent = x || "…"; },
      onEnd: (text, err) => { if (sess?.ts[sess.pos] !== t || t.state !== "rec") return; finishRec(t, text, err); },
    });
    if (lis) return;
  }
  // без распознавания — обычная запись голоса
  void recordAudio(t);
}

async function recordAudio(t: T) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch { clearRec(); t.state = "idle"; t.err = REC_ERRORS["not-allowed"]; micUi(t); return; }
  const chunks: Blob[] = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    if (t.audio) URL.revokeObjectURL(t.audio);
    t.audio = URL.createObjectURL(new Blob(chunks, { type: rec?.mimeType || "audio/webm" }));
    clearRec();
    t.state = "done"; t.said = "";
    micUi(t);
  };
  rec.start();
}

function stopRec(t: T) {
  clearTimeout(tmr); clearInterval(tick);
  if (lis) { lis.stop(); return; } // onEnd завершит
  if (rec && rec.state !== "inactive") { rec.stop(); return; }
  if (t.state === "rec") { t.state = "idle"; micUi(t); }
}

function finishRec(t: T, text: string, err?: string) {
  clearTimeout(tmr); clearInterval(tick);
  lis = null;
  if (!text && err) { t.state = "idle"; t.err = REC_ERRORS[err] ?? "Не получилось распознать. Попробуйте ещё раз."; micUi(t); return; }
  if (!text) { t.state = "idle"; t.err = REC_ERRORS["no-speech"]; micUi(t); return; }
  t.said = text;
  t.state = "done";
  t.auto = scoreTask(t.item, text);
  micUi(t);
}

/* ---------- результат ---------- */

const pointsOf = (t: T): number | null => (t.self !== null ? t.self : t.auto ? t.auto.pts : null);

function resultHTML(t: T, withSelf: boolean): string {
  const it = t.item, k = t.part.kind;
  const strict = k === "repeat" || k === "read" || k === "retell";
  const pts = pointsOf(t);
  let h = `<div class="hk-rev ${pts !== null && pts >= 65 ? "ok" : "no"}">`;
  if (t.auto) {
    h += `<div class="chip ${t.auto.pts >= 65 ? "ok" : "no"}">${t.self !== null ? "Ваша оценка" : `${verdict(t.auto.pts)}`}${pts !== null ? ` · ${pts}` : ""}</div>`;
    h += `<div class="ho-heard"><span class="label">Распознано</span><div class="zh">${esc(t.said) || "—"}</div></div>`;
    if (strict) {
      const d = diffZh(t.said, it.zh);
      h += `<div class="ho-diff zh">${d.ref.map((x) => `<span class="${x.ok ? "ok" : "miss"}">${esc(x.c)}</span>`).join("")}</div><div class="hint">Зелёные знаки распознаны, красные — пропущены или сказаны иначе.</div>`;
    } else {
      if (t.auto.missing.length) h += `<div class="hint">Не прозвучали слова-опоры: ${esc(t.auto.missing.join("、"))}</div>`;
      if (t.auto.short) h += `<div class="hint">Короче, чем нужно: не хватает около ${t.auto.short} знаков.</div>`;
    }
  } else if (t.audio) {
    h += `<div class="ho-heard"><span class="label">Ваша запись</span><audio controls src="${t.audio}"></audio></div><div class="hint">Распознавания на этом устройстве нет — прослушайте и оцените себя.</div>`;
  }
  h += `<div class="hk-tr"><span class="label">${strict ? "Текст" : "Образец ответа"}</span><div class="zh">${strict ? esc(it.zh) : esc(it.sample ?? "")}</div>${it.ru ? `<div class="hk-ru">${esc(it.ru)}</div>` : ""}<button class="btn small" data-osample>${PLAY} Послушать</button></div>`;
  if (withSelf) h += `<div class="ho-self"><span class="label">Как вам кажется?</span><div class="seg wide-seg" role="group">${(["good", "part", "bad"] as const).map((x) => `<button data-oself="${x}" aria-pressed="${t.self === SELF[x]}">${x === "good" ? "Хорошо" : x === "part" ? "Частично" : "Нет"}</button>`).join("")}</div></div>`;
  if (sess?.mode === "train" && withSelf) h += `<button class="btn small" data-oretry>↺ Ещё раз</button>`;
  return h + "</div>";
}

/* ---------- итог ---------- */

async function finish() {
  if (!sess || sess.done) return;
  sess.done = true;
  clearRec(); stopSpeech();
  const s = sess;
  const now = Date.now();
  await updateOral((o) => { for (const t of s.ts) o.seen[t.item.id] = now; });
  renderFinish();
  await persist();
}

function scoreNow() { return scoreOral(sess!.ts.map((t) => ({ kind: t.part.kind, pts: pointsOf(t) ?? 0 }))); }

async function persist() {
  if (!sess) return;
  const s = sess, sc = scoreNow();
  const h: OHist = { at: s.at, level: s.level, mode: s.mode, kinds: s.kinds, total: sc.total, passed: sc.passed, parts: sc.parts, tasks: s.ts.map((t) => ({ id: t.item.id, pts: pointsOf(t) ?? 0 })) };
  await updateOral((o) => { o.hist = [...o.hist.filter((x) => x.at !== h.at), h].slice(-60); });
}

function renderFinish() {
  if (!sess) return;
  const s = sess;
  const sc = scoreNow();
  const pending = s.ts.filter((t) => pointsOf(t) === null).length;
  $("ho-count").textContent = "Итог";
  $("ho-prog").style.width = "100%";
  $("ho-card").innerHTML = `<div class="hk-result" id="ho-total">
      <div class="hk-total ${sc.passed ? "ok" : "no"}"><b>${sc.total}</b><span>из 100</span></div>
      <p class="center">${sc.passed ? "Хороший результат!" : "Пока ниже 60 — потренируйтесь ещё."} <span class="hint">Оценка примерная.</span></p>
      ${sc.parts.map((p) => `<div class="hk-sec"><span>${esc(KIND_NAME[p.kind])}</span><span class="cc-bar"><i style="width:${p.pts}%"></i></span><b>${p.pts}</b><small>${p.n}</small></div>`).join("")}
      ${pending ? `<p class="note">У ${pending} ${plural(pending, "задания", "заданий", "заданий")} нет оценки — отметьте ниже, как получилось.</p>` : ""}
    </div>
    <h3 class="grp-title"><span>Разбор</span></h3>
    ${s.ts.map((t, i) => `<div class="hk-wrong" data-oi="${i}"><div class="hk-wq"><span class="label">${i + 1}. ${esc(KIND_NAME[t.part.kind])}</span><div class="zh">${t.part.kind === "picture" ? esc(t.item.zh) : esc(t.part.hear ? "(звучало) " + t.item.zh : t.item.zh)}</div></div>${t.state === "done" ? resultHTML(t, true) : `<p class="hint">Не отвечали.</p>`}</div>`).join("")}
    <div class="ex-btns"><button class="btn" data-ohome>К выбору</button><button class="btn primary" data-oagain>Ещё вариант</button></div>`;
}

function quit() {
  if (!sess || sess.done) { stopAll(); void renderOralHome(); return; }
  confirmInline($("ho-confirm"), "Выйти? Ответы этого варианта не сохранятся.", "Выйти", () => { stopAll(); void renderOralHome(); });
}
function stopAll() { clearRec(); stopSpeech(); sess = null; }
export function leaveOral() { clearRec(); stopSpeech(); }

export function initHskk(bar: (show: boolean) => void) {
  setBar = bar;
  $("ho-home").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const lv = t.closest<HTMLButtonElement>("[data-olv]");
    if (lv) { ui.level = Number(lv.dataset.olv); saveUi(); void renderOralHome(); return; }
    const m = t.closest<HTMLButtonElement>("[data-omode]");
    if (m) { ui.mode = m.dataset.omode as OMode; saveUi(); void renderOralHome(); return; }
    const s = t.closest<HTMLButtonElement>("[data-ostart]");
    if (s) void start(s.dataset.ostart!.split(",") as OKind[]);
  });
  $("ho-quit").addEventListener("click", quit);
  $("ho-card").addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (!sess) return;
    if (el.closest("[data-ohome]")) { stopAll(); void renderOralHome(); return; }
    if (el.closest("[data-oagain]")) { const k = sess.kinds; stopAll(); void start(k); return; }
    const wrap = el.closest<HTMLElement>("[data-oi]");
    const t = wrap ? sess.ts[Number(wrap.dataset.oi)] : sess.ts[sess.pos];
    if (!t) return;
    if (el.closest("[data-osample]")) { speak(t.part.hear || t.part.kind === "read" ? t.item.zh : t.item.sample ?? t.item.zh, 0.9); return; }
    const sf = el.closest<HTMLButtonElement>("[data-oself]");
    if (sf) {
      t.self = SELF[sf.dataset.oself as keyof typeof SELF];
      if (sess.done) { renderFinish(); void persist(); } else micUi(t);
      return;
    }
    if (sess.done) return;
    if (el.closest("[data-oplay]")) { playItem(t); return; }
    if (el.closest("[data-otext]")) { t.text = true; show(); return; }
    if (el.closest("[data-orec]")) { startRec(t); return; }
    if (el.closest("[data-ostop]")) { stopRec(t); return; }
    if (el.closest("[data-oretry]")) { t.state = "idle"; t.said = ""; t.auto = null; t.self = null; t.err = undefined; if (t.audio) { URL.revokeObjectURL(t.audio); t.audio = undefined; } micUi(t); return; }
    if (el.closest("[data-onext]")) {
      if (sess.pos < sess.ts.length - 1) { sess.pos++; show(); window.scrollTo(0, 0); } else void finish();
    }
  });
}
