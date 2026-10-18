/** Обёртка над hanzi-writer: создание поля для письма в нужных цветах темы. */
import HanziWriter from "../../vendor/hanzi-writer/HanziWriter.ts";
import { charDataLoader } from "../strokes.ts";
import { cssVar } from "./dom.ts";

export type Writer = ReturnType<typeof HanziWriter.create>;

export function themeColors() {
  return {
    strokeColor: cssVar("--ink"),
    outlineColor: cssVar("--outline"),
    drawingColor: cssVar("--ink"),
    highlightColor: cssVar("--jade"),
    radicalColor: null,
  };
}

export function createWriter(el: HTMLElement, ch: string, opts: Record<string, unknown> = {}): Writer {
  el.innerHTML = "";
  const size = Math.round(el.getBoundingClientRect().width) || 300;
  return HanziWriter.create(el, ch, {
    width: size,
    height: size,
    padding: Math.round(size * 0.06),
    charDataLoader,
    showOutline: false,
    showCharacter: false,
    drawingWidth: Math.max(14, size / 18),
    strokeAnimationSpeed: 1.2,
    delayBetweenStrokes: 180,
    showHintAfterMisses: 3,
    leniency: 1.1,
    ...themeColors(),
    ...opts,
  });
}

/** Перекрашивает существующие поля при смене темы. */
export function recolor(writers: (Writer | null | undefined)[]) {
  const c = themeColors();
  for (const w of writers) {
    if (!w) continue;
    for (const [k, v] of Object.entries(c)) if (v) try { w.updateColor(k as never, v); } catch { /* поле ещё грузится */ }
  }
}
