/** Обёртка над hanzi-writer: поле для письма в цветах темы и выбранным пером. */
import HanziWriter from "../../vendor/hanzi-writer/HanziWriter.ts";
import { setStrokePainter } from "../../vendor/hanzi-writer/renderers/svg/UserStrokeRenderer.ts";
import { setKeepUserStrokes } from "../../vendor/hanzi-writer/Quiz.ts";
import { loaderFor, type StrokeLang } from "../strokes.ts";
import { penShape, type PenType } from "../core/pen.ts";
import { cssVar } from "./dom.ts";

export type Writer = ReturnType<typeof HanziWriter.create>;

/** Цвета чернил. "auto" — цвет текста темы, "accent" — акцент темы. */
export const INKS: { id: string; name: string }[] = [
  { id: "auto", name: "Как текст" },
  { id: "accent", name: "Акцент темы" },
  { id: "#C8372D", name: "Киноварь" },
  { id: "#2F5FD0", name: "Синие" },
  { id: "#8A5A2B", name: "Сепия" },
];

let ink = "auto";

export function inkColor(id = ink): string {
  if (id === "auto") return cssVar("--ink");
  if (id === "accent") return cssVar("--jade");
  return /^#[0-9a-f]{6}$/i.test(id) ? id : cssVar("--ink");
}

/** Выбор пера и чернил для всех полей письма (уже открытые перекрашиваются через recolor). */
export function setPen(type: PenType, inkId: string, keep: boolean, size = 1) {
  ink = inkId;
  setKeepUserStrokes(keep);
  setStrokePainter((points, width) => penShape(type, points, width, size));
}

export function themeColors() {
  return {
    strokeColor: cssVar("--ink"),
    outlineColor: cssVar("--outline"),
    drawingColor: inkColor(),
    highlightColor: cssVar("--jade"),
    radicalColor: null,
  };
}

/** Поле письма; lang — чьи данные черт брать (японский порядок черт отличается от китайского). */
export function createWriter(el: HTMLElement, ch: string, opts: Record<string, unknown> = {}, lang: StrokeLang = "zh"): Writer {
  el.innerHTML = "";
  const size = Math.round(el.getBoundingClientRect().width) || 300;
  return HanziWriter.create(el, ch, {
    width: size,
    height: size,
    padding: Math.round(size * 0.06),
    charDataLoader: loaderFor(lang),
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

/** Перекрашивает существующие поля при смене темы или чернил. */
export function recolor(writers: (Writer | null | undefined)[]) {
  const c = themeColors();
  for (const w of writers) {
    if (!w) continue;
    for (const [k, v] of Object.entries(c)) if (v) try { w.updateColor(k as never, v); } catch { /* поле ещё грузится */ }
  }
}
