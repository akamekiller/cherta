/** Голосовой поиск через распознавание речи браузера (Chrome, Edge, Safari). Нужен интернет. */
import { $ } from "./dom.ts";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const LS = "cherta.voiceLang";
// В Electron (приложение для Windows) у Chromium нет ключа службы распознавания речи — кнопку не показываем.
const Ctor: RecognitionCtor | undefined = /Electron\//.test(navigator.userAgent) ? undefined :
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

let rec: Recognition | null = null;
let lang = "zh-CN";
try { lang = localStorage.getItem(LS) || lang; } catch { /* */ }
let onText: (t: string) => void = () => {};

const ERRORS: Record<string, string> = {
  "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
  "service-not-allowed": "Распознавание речи недоступно в этом браузере.",
  "no-speech": "Ничего не услышал. Нажмите на микрофон и говорите.",
  network: "Нет интернета — голосовой поиск работает только онлайн.",
  "audio-capture": "Микрофон не найден.",
};

function msg(text: string, listening: boolean) {
  $("w-voice-msg").textContent = text;
  $("w-voice-bar").classList.toggle("on", listening);
}

function renderLang() {
  document.querySelectorAll<HTMLButtonElement>("#w-voice-bar [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}

function start() {
  stop(true);
  if (!Ctor) return;
  const r = new Ctor();
  rec = r;
  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    text = text.replace(/[。，、？！.,?!]/g, " ").replace(/\s+/g, lang.startsWith("zh") ? "" : " ").trim();
    if (text) onText(lang.startsWith("ru") ? text.toLowerCase() : text);
  };
  r.onerror = (e) => { if (e.error !== "aborted") msg(ERRORS[e.error] ?? "Не получилось распознать. Попробуйте ещё раз.", false); };
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    if ($("w-voice-bar").classList.contains("on")) $("w-voice-bar").hidden = true;
    $("w-voice").setAttribute("aria-pressed", "false");
  };
  $("w-voice-bar").hidden = false;
  $("w-voice").setAttribute("aria-pressed", "true");
  renderLang();
  msg(lang.startsWith("zh") ? "Говорите по-китайски…" : "Говорите по-русски…", true);
  try { r.start(); } catch { msg("Не получилось включить микрофон.", false); }
}

function stop(silent = false) {
  const r = rec;
  rec = null;
  try { r?.abort(); } catch { /* */ }
  if (!silent) { $("w-voice-bar").hidden = true; $("w-voice").setAttribute("aria-pressed", "false"); }
}

export function initVoice(cb: (text: string) => void) {
  if (!Ctor) return; // не поддерживается — кнопку не показываем
  onText = cb;
  $("w-voice").hidden = false;
  $("w-voice").addEventListener("click", () => (rec ? stop() : start()));
  $("w-voice-stop").addEventListener("click", () => stop());
  $("w-voice-bar").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-lang]");
    if (!b) return;
    lang = b.dataset.lang!;
    try { localStorage.setItem(LS, lang); } catch { /* */ }
    start();
  });
}

export const stopVoice = () => { if (rec) stop(); };
