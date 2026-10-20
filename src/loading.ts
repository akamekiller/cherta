/**
 * Загрузка больших файлов с прогрессом (индекс словаря, данные рукописного ввода).
 * Модуль без интерфейса: полоску показывает ui/loadbar.ts, подписавшись на события.
 */
export type LoadEvent = { key: string; label: string; loaded: number; done: boolean; error?: boolean };
const listeners = new Set<(e: LoadEvent) => void>();
export const onLoad = (f: (e: LoadEvent) => void) => { listeners.add(f); return () => listeners.delete(f); };
const emit = (e: LoadEvent) => listeners.forEach((f) => f(e));

/** fetch → текст, по ходу сообщает, сколько байт пришло. Из офлайн-кэша приходит сразу — полоска не успеет показаться. */
export async function fetchText(url: string, label: string): Promise<string> {
  const key = url;
  let loaded = 0;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!r.body) { const t = await r.text(); emit({ key, label, loaded: t.length, done: true }); return t; }
    const reader = r.body.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      emit({ key, label, loaded, done: false });
    }
    const all = new Uint8Array(loaded);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    emit({ key, label, loaded, done: true });
    return new TextDecoder().decode(all);
  } catch (err) {
    emit({ key, label, loaded, done: true, error: true });
    throw err;
  }
}
