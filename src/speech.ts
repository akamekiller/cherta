/** Озвучка через синтезатор речи системы (Web Speech API). */
let voice: SpeechSynthesisVoice | null = null;
let listeners: (() => void)[] = [];

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

function pick() {
  if (!supported()) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /zh[-_]CN/i.test(v.lang)) ?? vs.find((v) => /^zh/i.test(v.lang)) ?? null;
  listeners.forEach((f) => f());
}
if (supported()) { pick(); speechSynthesis.addEventListener?.("voiceschanged", pick); }

export function onVoices(f: () => void) { listeners.push(f); }

export function voiceStatus(): string {
  if (!supported()) return "Браузер не поддерживает озвучку";
  if (voice) return `Голос: ${voice.name}`;
  return speechSynthesis.getVoices().length
    ? "Китайский голос не найден. Установите его в настройках речи телефона или Windows"
    : "Ищем китайский голос…";
}

export function say(text: string, rate = 0.85) {
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
