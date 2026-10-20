/**
 * Озвучка слов.
 * 1) Готовые записи нейросетевым голосом (Kokoro, голос zf_047): site/audio/zh/<слово>.mp3,
 *    список есть в site/audio/zh/index.json. Офлайн их кэширует service worker после первого прослушивания
 *    (или все сразу — «Скачать для офлайна» в настройках).
 * 2) Если записи нет (своё слово, не из колод) — синтезатор речи устройства (Web Speech API).
 */
let voice: SpeechSynthesisVoice | null = null;
let listeners: (() => void)[] = [];
let recorded: Map<string, string> | null = null; // слово → пиньинь, по которому сделана запись (метка версии)
let recordedLoading: Promise<void> | null = null;
const player = typeof Audio !== "undefined" ? new Audio() : null;

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

function pick() {
  if (!supported()) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /zh[-_]CN/i.test(v.lang)) ?? vs.find((v) => /^zh/i.test(v.lang)) ?? null;
  listeners.forEach((f) => f());
}
if (supported()) { pick(); speechSynthesis.addEventListener?.("voiceschanged", pick); }

/** Загружаем список озвученных слов (один раз, в фоне). */
export function loadRecorded(): Promise<void> {
  if (!recordedLoading) {
    recordedLoading = fetch("audio/zh/index.json")
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((d: { words: string[]; py?: Record<string, string> }) => {
        recorded = new Map(d.words.map((w) => [w, d.py?.[w] ?? ""]));
        listeners.forEach((f) => f());
      })
      .catch(() => { recorded = new Map(); });
  }
  return recordedLoading;
}

export const hasRecording = (text: string) => !!recorded?.has(text);

/** Адрес записи слова. ?v= меняется, когда слово переозвучено — иначе офлайн-кэш играл бы старую запись. */
export function audioUrl(text: string): string {
  const v = recorded?.get(text);
  return `audio/zh/${encodeURIComponent(text)}.mp3${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}

/** Адреса всех записей (для «Скачать для офлайна»). */
export async function allAudioUrls(): Promise<string[]> {
  await loadRecorded();
  return [...(recorded?.keys() ?? [])].map(audioUrl);
}

export function onVoices(f: () => void) { listeners.push(f); }

export function voiceStatus(): string {
  const n = recorded?.size ?? 0;
  if (n) return `Нейросетевой голос, озвучено слов: ${n}. Для остальных — голос устройства${voice ? "" : " (китайский голос не установлен)"}.`;
  if (!supported()) return "Озвучка недоступна в этом браузере";
  if (voice) return `Голос устройства: ${voice.name}`;
  return speechSynthesis.getVoices().length
    ? "Китайский голос не найден. Установите его в настройках речи телефона или Windows"
    : "Ищем китайский голос…";
}

function speakDevice(text: string, rate: number) {
  if (!supported()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    if (voice) u.voice = voice;
    u.rate = rate;
    speechSynthesis.speak(u);
  } catch { /* озвучка необязательна */ }
}

export function say(text: string, rate = 0.85) {
  if (player && hasRecording(text)) {
    try { speechSynthesis?.cancel(); } catch { /* */ }
    player.src = audioUrl(text);
    player.play().catch(() => speakDevice(text, rate));
    return;
  }
  speakDevice(text, rate);
}

/** Прочитать несколько фраз подряд голосом устройства (диалог). */
export function sayAll(texts: string[], rate = 0.85) {
  if (!supported()) return;
  try {
    speechSynthesis.cancel();
    for (const t of texts) {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "zh-CN";
      if (voice) u.voice = voice;
      u.rate = rate;
      speechSynthesis.speak(u);
    }
  } catch { /* озвучка необязательна */ }
}

export const canSpeak = () => supported();
