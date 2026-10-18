/** Поиск рисованием в «Словах»: кнопка-кисточка открывает поле под строкой поиска. */
import { $ } from "./dom.ts";
import { mountHwPad, type HwPad } from "./hwpad.ts";

let pad: HwPad | null = null;

export function toggleHandwrite(open?: boolean) {
  if (!pad) return;
  const show = open ?? !pad.visible();
  if (show) pad.show(); else pad.hide();
  $("w-draw").setAttribute("aria-pressed", String(show));
}

export function initHandwrite(pick: (ch: string) => void) {
  pad = mountHwPad($("w-hw"), pick);
  $("w-draw").addEventListener("click", () => toggleHandwrite());
}
