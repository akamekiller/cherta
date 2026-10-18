/**
 * Тоны и произношение.
 *  «На слух» — звучит слово из колоды (запись), буквы слогов даны, ставишь тоны кнопками; засчитываются и варианты (3-3 → 2-3, 不/一).
 *  «Произношение» — говоришь слово в микрофон, кривая высоты голоса рисуется поверх образцовых кривых тонов;
 *  для каждого слога — примерная оценка, на какой тон похоже.
 */
import { words } from "../state.ts";
import { hasRecording, loadRecorded, say } from "../speech.ts";
import { mark } from "../core/pinyin.ts";
import { pitchTrack, splitSyllables, semitones, classifyTone, acceptedTones, toneTemplate, resampleCurve, downsample } from "../core/pitch.ts";
import type { Word } from "../core/deck.ts";
import { $, esc, pinyinHTML } from "./dom.ts";
import { onShow, onLeave } from "./nav.ts";

type Tab = "listen" | "speak";
const LS = "cherta.tones";
const st = { tab: "listen" as Tab, base: 0 as number, done: 0, right: 0 };
try { Object.assign(st, JSON.parse(localStorage.getItem(LS) ?? "{}")); } catch { /* */ }
const save = () => { try { localStorage.setItem(LS, JSON.stringify({ tab: st.tab, base: st.base })); } catch { /* */ } };

const TONE_SVG: Record<number, string> = {
  1: "M4 6H28", 2: "M4 16L28 4", 3: "M4 6L14 16L28 4", 4: "M4 4L28 16",
};
const toneBtn = (t: number) => `<button class="t${t}" data-tone="${t}" aria-label="${t === 5 ? "лёгкий тон" : `${t}-й тон`}">${t === 5 ? `<svg viewBox="0 0 32 20"><circle cx="16" cy="10" r="3.5" fill="currentColor"/></svg>` : `<svg viewBox="0 0 32 20"><path d="${TONE_SVG[t]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</button>`;

let word: Word | null = null;
let picked: (number | null)[] = [];
let cur = 0;
let checked = false;

/** Слова колоды с записью, 1–3 слога; случайное, но не то же подряд. */
function nextWord(): Word | null {
  const list = words().filter((w) => hasRecording(w.han) && w.ref.length <= 3);
  if (!list.length) return null;
  let w = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && w.id === word?.id) w = list[(list.indexOf(w) + 1) % list.length];
  return w;
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
  if (!word) { $("tn-l-syl").innerHTML = `<p class="hint">В этой колоде нет слов с записью озвучки.</p>`; return; }
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
    const cls = checked ? (acceptedTones(word!.ref.map((x) => x.t), word!.ref.map((x) => x.alt))[i].includes(t ?? 0) ? "ok" : "bad") : i === cur ? "cur" : "";
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
  const ok = acceptedTones(word.ref.map((x) => x.t), word.ref.map((x) => x.alt)).every((acc, i) => acc.includes(picked[i] ?? 0));
  st.done++; if (ok) st.right++;
  $("tn-l-res").hidden = false;
  $("tn-l-res").innerHTML = `<span class="chip ${ok ? "ok" : "no"}">${ok ? "Верно" : "Не совсем"}</span> <span class="tn-word">${esc(word.han)}</span> <span class="py">${pinyinHTML(word.ref)}</span> <span class="hint">${esc(word.ru)}</span>`;
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
  $("tn-graph").innerHTML = graph([], word?.ref.map((x) => x.t) ?? []);
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
    if (voiced.length < 8) { $("tn-s-res").innerHTML = `<p class="hint">Голос почти не слышен — скажите громче и ближе к микрофону.</p>`; $("tn-graph").innerHTML = graph([], word.ref.map((s) => s.t)); return; }
    // опора — обычная высота вашего голоса: копится по записям, чтобы 1-й тон (высокий) отличался от 3-го (низкого)
    const med = [...voiced].sort((a, b) => a - b)[Math.floor(voiced.length / 2)];
    st.base = st.base ? st.base * 0.7 + med * 0.3 : med;
    save();
    const parts = splitSyllables(tr.f0, word.ref.length);
    const curves = parts.map((p) => semitones(p, st.base));
    const want = word.ref.map((s) => s.t);
    const acc = acceptedTones(want, word.ref.map((s) => s.alt));
    $("tn-graph").innerHTML = graph(curves, want);
    $("tn-s-res").innerHTML = `<div class="tn-verdicts">${curves.map((c, i) => {
      const g = classifyTone(c);
      const syl = mark(word!.ref[i].s, want[i]);
      if (want[i] === 5) return `<span class="chip">${esc(syl)}: лёгкий тон</span>`;
      if (!g.tone) return `<span class="chip mid">${esc(syl)}: не расслышал</span>`;
      const ok = acc[i].includes(g.tone);
      return `<span class="chip ${ok ? "ok" : "no"}">${esc(syl)}: ${ok ? "похоже ✓" : `похоже на ${g.tone}-й`}</span>`;
    }).join("")}</div><p class="hint">Оценка примерная: высота голоса меряется прямо в браузере. Сверяйте форму своей линии с пунктиром.</p>`;
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
  onShow("tones", () => { render(); if (st.tab === "listen") listenNext(); else speakNext(); });
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
