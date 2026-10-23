/** Распознавание речи (Web Speech API: Chrome, Edge, Safari; нужен интернет). Для устной части HSKK. */
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const Ctor: (new () => Rec) | undefined = /Electron\//.test(navigator.userAgent) ? undefined :
  (window as unknown as { SpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

/** Может ли устройство распознавать речь (в приложении Android и Windows — нет, там своя запись и самооценка). */
export const canRecognize = () => !!Ctor && !(window as unknown as { Capacitor?: unknown }).Capacitor;

export const REC_ERRORS: Record<string, string> = {
  "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
  "service-not-allowed": "Распознавание речи недоступно в этом браузере.",
  "no-speech": "Ничего не услышал. Нажмите «Говорить» и скажите ещё раз.",
  network: "Нет интернета — распознавание речи работает только онлайн.",
  "audio-capture": "Микрофон не найден.",
};

export type Listener = { stop(): void; abort(): void };
/** Слушать: onUpdate — текст по мере речи, onEnd — итог (и ошибка, если была). */
export function listen(o: { continuous?: boolean; onUpdate?: (t: string) => void; onEnd: (text: string, err?: string) => void }): Listener | null {
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "zh-CN";
  r.interimResults = true;
  r.continuous = !!o.continuous;
  r.maxAlternatives = 1;
  const finals: string[] = [];
  let interim = "", err: string | undefined, done = false;
  const text = () => (finals.join("") + interim).replace(/\s+/g, "");
  r.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finals[i] = t; else interim += t;
    }
    o.onUpdate?.(text());
  };
  r.onerror = (e) => { if (e.error !== "aborted") err = e.error; };
  r.onend = () => { if (done) return; done = true; o.onEnd(text(), err); };
  try { r.start(); } catch { return null; }
  return { stop: () => { try { r.stop(); } catch { /* */ } }, abort: () => { done = true; try { r.abort(); } catch { /* */ } } };
}
