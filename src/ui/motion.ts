/** Анимации переходов отключены (1.0.15): на телефоне они давали фризы на длинных списках и больших колодах.
 *  setOpen оставлен как единая точка для сворачиваемых списков — сейчас просто показывает или прячет. */
export function setOpen(el: HTMLElement | null | undefined, open: boolean) {
  if (el) el.hidden = !open;
}

export function initMotion() { /* без анимаций */ }
