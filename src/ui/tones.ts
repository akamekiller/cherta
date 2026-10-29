/**
 * Тоны и произношение.
 *  «На слух» — звучит слово из колоды (запись), буквы слогов даны, ставишь тоны кнопками; засчитываются и варианты (3-3 → 2-3, 不/一).
 *  «Произношение» — говоришь слово в микрофон, кривая высоты голоса рисуется поверх образцовых кривых тонов;
 *  экспериментально: оценки «верно/неверно» нет (классификатор ошибался), только график.
 */
import { app, deckById, loadThemes, deckBlocks } from "../state.ts";
import type { Block } from "../core/blocks.ts";
import { spokenTones, sandhiKinds, SANDHI_RULE } from "../core/sandhi.ts";
import { openSheet, closeSheet } from "./sheet.ts";
import { pickDeck, deckWords, deckTitle, setPickLabel } from "./deckpick.ts";
import { hasRecording, loadRecorded, say } from "../speech.ts";
import { mark } from "../core/pinyin.ts";
import { pitchTrack, splitSyllables, semitones, acceptedTones, toneTemplate, resampleCurve, downsample } from "../core/pitch.ts";
import type { Word } from "../core/deck.ts";
import { $, esc, pinyinHTML } from "./dom.ts";
import { onShow, onLeave } from "./nav.ts";

type Tab = "listen" | "speak";
/** Ступени: отдельные слоги → пары тонов (20 сочетаний) → слова (1–3 слога) → изменения тонов (сандхи).
 * Откуда слова — отдельно: базовый набор (HSK 1–3 с записями диктора) или любая добавленная колода, вся или один урок. */
type Stage = "syl" | "pair" | "words" | "sandhi";
type Stat = { n: number; ok: number };
const LS = "cherta.tones";
const st = { tab: "listen" as Tab, stage: "syl" as Stage, base: 0 as number, done: 0, right: 0, src: "", combo: "",
  block: {} as Record<string, number>, stats: {} as Record<string, Stat> };
try {
  const saved = JSON.parse(localStorage.getItem(LS) ?? "{}");
  // прежняя ступень «Мои слова» = слова выбранной колоды
  if (saved.stage === "mine") { saved.stage = "words"; saved.src = saved.deckId ?? ""; }
  Object.assign(st, saved);
} catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify({ tab: st.tab, stage: st.stage, base: st.base, src: st.src, combo: st.combo, block: st.block, stats: st.stats })); } catch { /* */ } };
const STAGE_HINT: Record<Stage, string> = {
  syl: "Слушайте слог и отметьте тон.",
  pair: "20 сочетаний тонов; цифры — сколько раз верно. Тап по клетке — тренировать одно сочетание.",
  words: "Слова в 1–3 слога, тоны как в словаре.",
  sandhi: "",
};
const SANDHI_HINT = `<b>Тоны меняются в речи.</b> Отмечайте тоны так, как слово <b>звучит</b>:<br>
  • 3 + 3 → 2 + 3: 你好 nǐ hǎo → <i>ní hǎo</i><br>
  • 不 перед 4-м тоном → bú: 不是 → <i>bú shì</i><br>
  • 一 перед 4-м → yí, перед 1–3-м → yì: 一个 <i>yí gè</i>, 一起 <i>yì qǐ</i>; в счёте и датах — yī (第一, 一月).`;

const TONE_SVG: Record<number, string> = {
  1: "M4 6H28", 2: "M4 16L28 4", 3: "M4 6L14 16L28 4", 4: "M4 4L28 16",
};
const toneBtn = (t: number) => `<button class="t${t}" data-tone="${t}" aria-label="${t === 5 ? "лёгкий тон" : `${t}-й тон`}">${t === 5 ? `<svg viewBox="0 0 32 20"><circle cx="16" cy="10" r="3.5" fill="currentColor"/></svg>` : `<svg viewBox="0 0 32 20"><path d="${TONE_SVG[t]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</button>`;

let word: Word | null = null;
let picked: (number | null)[] = [];
let cur = 0;
let checked = false;

/** Слова ступени: слоги и пары — из HSK 1–3 (старого) с записями, «мои» — из выбранной колоды. */
let srcWords: Word[] = [];
let hskBase: Word[] | null = null;
const words = () => srcWords;
async function baseWords(): Promise<Word[]> {
  if (!hskBase) {
    const out: Word[] = [];
    const seen = new Set<string>();
    for (const id of ["hsk2-1", "hsk2-2", "hsk2-3"]) {
      try { for (const w of (await deckById(id)).words) if (!seen.has(w.han)) { seen.add(w.han); out.push(w); } } catch { /* офлайн */ }
    }
    hskBase = out;
  }
  return hskBase;
}
const comboOf = (w: Word) => w.ref.map((x) => x.t).join("");
const tonesOf = (w: Word) => w.ref.map((x) => x.t);
/** Тоны, которые нужно отметить: на ступени сандхи — как звучит, иначе — как в словаре (варианты тоже засчитываются). */
const wantTones = (w: Word) => (st.stage === "sandhi" ? spokenTones(w.han, tonesOf(w)) : tonesOf(w));
const accepted = (w: Word) => (st.stage === "sandhi" ? wantTones(w).map((t) => [t]) : acceptedTones(tonesOf(w), w.ref.map((x) => x.alt)));

/** Уроки выбранной колоды (как в карточках и тетради). */
let blocks: Block[] = [];
let deckAll: Word[] = [];
const curBlock = () => { const b = st.block[st.src]; return st.src && b !== undefined && b >= 0 && b < blocks.length ? b : -1; };
const srcLabel = () => (st.src ? deckTitle(st.src) : "Базовый набор (HSK 1–3)");

async function loadSource() {
  await loadRecorded();
  if (st.src && !app.decks.some((d) => d.id === st.src)) st.src = "";
  $("tn-stage-hint").innerHTML = st.stage === "sandhi" ? SANDHI_HINT : esc(STAGE_HINT[st.stage]);
  document.querySelectorAll<HTMLButtonElement>("#tn-stage [data-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === st.stage)));
  let all: Word[];
  if (st.src) {
    const [deck] = await Promise.all([deckWords(st.src), loadThemes()]);
    deckAll = deck?.words ?? [];
    blocks = deck ? deckBlocks(deck) : [];
    if (blocks.length < 2) blocks = [];
    const bi = curBlock();
    all = bi >= 0 ? blocks[bi].idx.map((i) => deckAll[i]).filter(Boolean) : deckAll;
  } else {
    blocks = []; deckAll = [];
    all = (await baseWords()).filter((w) => hasRecording(w.han));
  }
  all = all.filter((w) => w.ref.length && w.ref.every((x) => x.t >= 1 && x.t <= 5) && [...w.han].length === w.ref.length);
  srcWords = st.stage === "syl" ? all.filter((w) => w.ref.length === 1 && w.ref[0].t <= 4)
    : st.stage === "pair" ? all.filter((w) => w.ref.length === 2 && w.ref[0].t <= 4)
    : st.stage === "sandhi" ? all.filter((w) => w.ref.length <= 4 && sandhiKinds(w.han, tonesOf(w)).length)
    : all.filter((w) => w.ref.length <= 3);
  setPickLabel("tn-src", srcLabel());
  const bb = $("tn-block");
  bb.hidden = !blocks.length;
  const bi = curBlock();
  if (blocks.length) bb.innerHTML = `<span>${bi >= 0 ? `Урок ${bi + 1}. ${esc(blocks[bi].title)}` : `Вся колода · ${blocks.length} уроков`}</span><b>Выбрать урок</b>`;
  renderGrid();
}

/** Выбор урока колоды — как в тетради прописей. */
function pickBlock(after: () => void) {
  const cur = curBlock();
  const row = (b: Block, i: number) => `<button class="lesson-row ${i === cur ? "cur" : ""}" data-blk="${i}"><span class="ln">${i + 1}</span>
      <span class="lt"><b>${esc(b.title)}</b><small class="blk-prev">${esc(b.idx.slice(0, 8).map((k) => deckAll[k]?.han ?? "").join(" "))}${b.idx.length > 8 ? " …" : ""}</small></span></button>`;
  const secs: { name: string; idx: number[] }[] = [];
  blocks.forEach((b, i) => {
    if (!secs.length || secs[secs.length - 1].name !== b.section) secs.push({ name: b.section, idx: [] });
    secs[secs.length - 1].idx.push(i);
  });
  openSheet(`Урок: ${deckTitle(st.src)}`, `<div class="stack">
      <div class="lesson-list"><button class="lesson-row ${cur < 0 ? "cur" : ""}" data-blk="-1"><span class="ln">∞</span><span class="lt"><b>Вся колода</b><small>${deckAll.length} слов</small></span></button></div>
      ${secs.map((sec) => `<details class="bk-sec" ${secs.length === 1 || sec.idx.includes(cur) || (cur < 0 && sec === secs[0]) ? "open" : ""}>${sec.name ? `<summary>${esc(sec.name)} <small>${sec.idx.length}</small></summary>` : ""}<div class="lesson-list">${sec.idx.map((i) => row(blocks[i], i)).join("")}</div></details>`).join("")}
    </div>`, (root) => {
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-blk]");
      if (!b) return;
      const v = Number(b.dataset.blk);
      if (v < 0) delete st.block[st.src]; else st.block[st.src] = v;
      save(); closeSheet(); after();
    });
  });
}

/** Сетка 4×5 сочетаний тонов (ступень «пары»): верно / всего. */
function renderGrid() {
  const g = $("tn-grid");
  g.hidden = st.stage !== "pair";
  if (st.stage !== "pair") return;
  const have = new Set(srcWords.map(comboOf));
  let html = `<span></span>${[1, 2, 3, 4, 5].map((t) => `<span class="tg-h t${t}">${t === 5 ? "·" : t}</span>`).join("")}`;
  for (const a of [1, 2, 3, 4]) {
    html += `<span class="tg-h t${a}">${a}</span>`;
    for (const b of [1, 2, 3, 4, 5]) {
      const k = `${a}${b}`, s0 = st.stats[k];
      const cls = !have.has(k) ? "none" : !s0 ? "" : s0.ok / s0.n >= 0.8 ? "good" : s0.ok / s0.n >= 0.5 ? "mid" : "bad";
      html += `<button class="tg-c ${cls}${st.combo === k ? " on" : ""}" data-combo="${k}" ${have.has(k) ? "" : "disabled"} aria-label="Тоны ${a}-${b}">${s0 ? `${s0.ok}/${s0.n}` : ""}</button>`;
    }
  }
  g.innerHTML = html + (st.combo ? `<button class="link-btn tg-all" data-combo="">Все сочетания</button>` : "");
}

/** Ключ статистики слова на ступени: тон слога или сочетание. */
const statKey = (w: Word) => (st.stage === "syl" ? `t${w.ref[0].t}` : st.stage === "pair" ? comboOf(w) : st.stage === "sandhi" ? `s:${sandhiKinds(w.han, tonesOf(w))[0]}` : "");

/** Открыть «Тоны» с выбранной колодой (из меню колоды). */
export function useTonesDeck(id: string) { st.src = id; if (st.stage === "syl" || st.stage === "pair") st.stage = "words"; save(); }

/** Слова колоды, 1–3 слога; сначала с записью озвучки (в своих колодах записей может не быть — тогда голос браузера). */
function nextWord(): Word | null {
  const short = words().filter((w) => w.ref.length && w.ref.length <= 3);
  const rec = short.filter((w) => hasRecording(w.han));
  let list = rec.length ? rec : short;
  if (st.stage === "pair" && st.combo) list = list.filter((w) => comboOf(w) === st.combo);
  else if (st.stage !== "words" && list.length) {
    // чаще — то, что хуже получается: тон (сочетание) с наименьшей долей верных, неопробованные — первыми
    const keys = [...new Set(list.map(statKey))];
    const score = (k: string) => { const s0 = st.stats[k]; return s0 ? (s0.ok + 1) / (s0.n + 2) : 0; };
    keys.sort((a, b) => score(a) - score(b));
    const pickK = keys[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * keys.length)];
    list = list.filter((w) => statKey(w) === pickK);
  }
  if (!list.length) return null;
  let w = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && w.id === word?.id) w = list[(list.indexOf(w) + 1) % list.length];
  return w;
}

function emptyMsg(): string {
  if (!st.src) return "Нет слов с записями — нужен интернет при первом запуске.";
  const what = st.stage === "syl" ? "односложных слов" : st.stage === "pair" ? "двусложных слов" : st.stage === "sandhi" ? "слов, где меняется тон" : "подходящих слов (1–3 слога)";
  return `В ${curBlock() >= 0 ? "этом уроке" : "этой колоде"} нет ${what}. Выберите другой урок, колоду или базовый набор.`;
}

function render() {
  document.querySelectorAll<HTMLButtonElement>("#tn-tabs [data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === st.tab)));
  $("tn-listen").hidden = st.tab !== "listen";
  $("tn-speak").hidden = st.tab !== "speak";
}

/* ---------- на слух ---------- */

async function listenNext() {
  await loadRecorded();
  word = nextWord();
  checked = false;
  $("tn-l-res").hidden = true;
  if (!word) { $("tn-l-syl").innerHTML = `<p class="hint">${emptyMsg()}</p>`; return; }
  picked = word.ref.map(() => null);
  cur = 0;
  renderListen();
  setTimeout(() => word && say(word.han), 200);
}

function renderListen() {
  if (!word) return;
  $("tn-l-syl").innerHTML = word.ref.map((s, i) => {
    const t = picked[i];
    const shown = t ? mark(s.s, t) : s.s.replace(/v/g, "ü");
    const cls = checked ? (accepted(word!)[i].includes(t ?? 0) ? "ok" : "bad") : i === cur ? "cur" : "";
    return `<button class="py-slot ${cls}${t ? ` t${t}` : ""}" data-i="${i}">${esc(shown)}</button>`;
  }).join("");
  ($("tn-l-check") as HTMLButtonElement).disabled = picked.some((x) => !x) && !checked;
  $("tn-l-check").textContent = checked ? "Дальше" : "Проверить";
  $("tn-score").textContent = st.done ? `${st.right} из ${st.done}` : "";
}

function listenCheck() {
  if (!word) return;
  if (checked) { listenNext(); return; }
  checked = true;
  const ok = accepted(word).every((acc, i) => acc.includes(picked[i] ?? 0));
  st.done++; if (ok) st.right++;
  const k = statKey(word);
  if (k) { const s0 = st.stats[k] ?? { n: 0, ok: 0 }; st.stats[k] = { n: s0.n + 1, ok: s0.ok + (ok ? 1 : 0) }; save(); renderGrid(); }
  $("tn-l-res").hidden = false;
  let extra = "";
  if (st.stage === "sandhi") {
    const sp = wantTones(word);
    const spoken = word.ref.map((x, i) => mark(x.s, sp[i])).join(" ");
    const written = word.ref.map((x, i) => mark(x.s, [...word!.han][i] === "不" ? 4 : [...word!.han][i] === "一" ? 1 : x.t)).join(" ");
    extra = `<div class="tn-sandhi">Пишется <b>${esc(written)}</b> → звучит <b>${esc(spoken)}</b><br>${sandhiKinds(word.han, tonesOf(word)).map((k) => esc(SANDHI_RULE[k])).join("<br>")}</div>`;
  }
  $("tn-l-res").innerHTML = `<span class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не совсем"}</span> <span class="tn-word">${esc(word.han)}</span> <span class="py">${pinyinHTML(word.ref)}</span> <span class="hint">${esc(word.ru)}</span>${extra}`;
  renderListen();
}

/* ---------- произношение ---------- */

let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let myAudio: string | null = null;
let stopTimer = 0;

function speakNext() {
  word = nextWord() ?? words()[0] ?? null;
  $("tn-s-word").innerHTML = word ? `<span class="tn-han">${esc(word.han)}</span><span class="py">${pinyinHTML(word.ref)}</span><span class="hint">${esc(word.ru)}</span>` : "";
  $("tn-graph").innerHTML = graph([], word ? spokenTones(word.han, tonesOf(word)) : []);
  $("tn-s-res").innerHTML = "";
  $("tn-mine").hidden = true;
}

async function record() {
  if (rec) { stopRec(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  } catch {
    $("tn-s-res").innerHTML = `<p class="note danger">Нет доступа к микрофону. Разрешите его в настройках браузера.</p>`;
    return;
  }
  const chunks: Blob[] = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => analyze(new Blob(chunks, { type: rec?.mimeType || "audio/webm" }));
  rec.start();
  $("tn-rec").classList.add("on");
  $("tn-rec").textContent = "■ Стоп";
  $("tn-s-res").innerHTML = `<p class="hint">Говорите… запись остановится сама через 3 секунды.</p>`;
  stopTimer = window.setTimeout(stopRec, 3000);
}

function stopRec() {
  clearTimeout(stopTimer);
  if (rec && rec.state !== "inactive") rec.stop();
  stream?.getTracks().forEach((t) => t.stop());
  $("tn-rec").classList.remove("on");
  $("tn-rec").textContent = "● Записать";
}

async function analyze(blob: Blob) {
  rec = null;
  if (myAudio) URL.revokeObjectURL(myAudio);
  myAudio = URL.createObjectURL(blob);
  $("tn-mine").hidden = false;
  if (!word) return;
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const factor = Math.max(1, Math.round(buf.sampleRate / 16000));
    const x = downsample(buf.getChannelData(0), factor);
    const tr = pitchTrack(x, buf.sampleRate / factor);
    const voiced = tr.f0.filter(Boolean);
    if (voiced.length < 8) { $("tn-s-res").innerHTML = `<p class="hint">Голос почти не слышен — скажите громче и ближе к микрофону.</p>`; $("tn-graph").innerHTML = graph([], spokenTones(word.han, tonesOf(word))); return; }
    // опора — обычная высота вашего голоса: копится по записям, чтобы 1-й тон (высокий) отличался от 3-го (низкого)
    const med = [...voiced].sort((a, b) => a - b)[Math.floor(voiced.length / 2)];
    st.base = st.base ? st.base * 0.7 + med * 0.3 : med;
    save();
    const parts = splitSyllables(tr.f0, word.ref.length);
    const curves = parts.map((p) => semitones(p, st.base));
    // образец — как слово звучит (3+3, 不, 一 уже изменены); засчитываются и тоны словаря
    const want = spokenTones(word.han, tonesOf(word));
    $("tn-graph").innerHTML = graph(curves, want);
    $("tn-s-res").innerHTML = `<div class="tn-verdicts">${want.map((t, i) => `<span class="chip">${esc(mark(word!.ref[i].s, t))}: ${t === 5 ? "лёгкий тон" : `${t}-й тон`}</span>`).join("")}</div><p class="hint">Экспериментально: оценки нет, программа не судит, верно или нет. Сравните форму своей сплошной линии с пунктиром образца и послушайте образец и свою запись.</p>`;
  } catch {
    $("tn-s-res").innerHTML = `<p class="note danger">Не получилось разобрать запись.</p>`;
  }
}

/** График: пунктир — образцовые кривые тонов по слогам, сплошная — ваш голос. */
function graph(curves: number[][], tones: number[]): string {
  const W = 320, H = 140, n = Math.max(1, tones.length), pad = 6, slot = (W - pad * (n - 1)) / n;
  const y = (v: number) => H / 2 - Math.max(-9, Math.min(9, v)) * (H / 2 - 10) / 9;
  const line = (vals: number[], x0: number) => vals.map((v, i) => `${(x0 + (i / Math.max(1, vals.length - 1)) * slot).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  let out = `<line x1="0" y1="${y(0)}" x2="${W}" y2="${y(0)}" class="mid"/>`;
  tones.forEach((t, i) => {
    const x0 = i * (slot + pad);
    out += `<polyline points="${line(toneTemplate(t, 20), x0)}" class="tpl t${t}"/>`;
    const c = curves[i];
    if (c?.length) out += `<polyline points="${line(resampleCurve(c, 30), x0)}" class="mine"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="tn-svg" role="img" aria-label="Кривая высоты голоса и образцы тонов">${out}</svg>`;
}

/* ---------- обработчики ---------- */

export function initTones() {
  const start = async () => { await loadSource(); render(); if (st.tab === "listen") listenNext(); else speakNext(); };
  onShow("tones", start);
  $("tn-src").addEventListener("click", () => pickDeck("Слова для тонов", st.src || "__base", (id) => { st.src = id === "__base" ? "" : id; st.combo = ""; save(); start(); },
    [{ id: "__base", title: "Базовый набор", sub: "Слова HSK 1–3 с записями диктора" }]));
  $("tn-block").addEventListener("click", () => pickBlock(() => { st.combo = ""; void start(); }));
  $("tn-stage").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-stage]");
    if (!b) return;
    st.stage = b.dataset.stage as Stage; st.done = 0; st.right = 0; save(); start();
  });
  $("tn-grid").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-combo]");
    if (!b || b.disabled) return;
    st.combo = st.combo === b.dataset.combo ? "" : b.dataset.combo!; save(); renderGrid();
    if (st.tab === "listen") listenNext(); else speakNext();
  });
  onLeave("tones", stopRec);
  $("tn-tabs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    if (!b) return;
    st.tab = b.dataset.tab as Tab; save(); render();
    if (st.tab === "listen") listenNext(); else speakNext();
  });
  $("tn-l-pad").innerHTML = [1, 2, 3, 4, 5].map(toneBtn).join("");
  $("tn-l-pad").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tone]");
    if (!b || !word || checked) return;
    picked[cur] = Number(b.dataset.tone);
    const next = picked.findIndex((x, i) => i > cur && !x);
    cur = next >= 0 ? next : picked.findIndex((x) => !x) >= 0 ? picked.findIndex((x) => !x) : cur;
    renderListen();
  });
  $("tn-l-syl").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-i]");
    if (b && !checked) { cur = Number(b.dataset.i); renderListen(); }
  });
  $("tn-l-play").addEventListener("click", () => word && say(word.han));
  $("tn-l-check").addEventListener("click", listenCheck);
  $("tn-s-ref").addEventListener("click", () => word && say(word.han));
  $("tn-s-next").addEventListener("click", speakNext);
  $("tn-rec").addEventListener("click", record);
  $("tn-mine").addEventListener("click", () => { if (myAudio) new Audio(myAudio).play().catch(() => {}); });
  if (!("mediaDevices" in navigator) || typeof MediaRecorder === "undefined") {
    $("tn-rec").setAttribute("disabled", "");
    $("tn-s-res").innerHTML = `<p class="hint">Запись голоса в этом браузере недоступна.</p>`;
  }
}
