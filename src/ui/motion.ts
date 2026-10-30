/** Плавное появление: экраны, вкладки, раскрытые списки и смена содержимого. Быстро (как в AnkiDroid), только opacity и transform. */
const SKIP_SELF = new Set(["sheet", "sheet-scrim", "scrim", "drawer", "ambient"]);
const SKIP_IN = "#session, #book, #print-area, .guide, .tour, #ambient, .sheet-scrim, .scrim, .drawer, .fx-slash";
/** Блоки, содержимое которых заменяется целиком (следующее задание, список, статья, вкладка…) — при замене плавно проявляются. */
const SWAP = ["ex-card", "ex-courses", "ex-c-head", "ex-c-lessons", "ex-l-head", "ex-l-steps", "rd-list", "rd-head", "rd-body", "rd-q",
  "d-art", "d-ex", "d-rel", "d-wchars", "w-groups", "hk-card", "ho-card", "st-tiles", "st-fc", "st-hist", "st-cal", "tn-s-res", "tn-l-res"];

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const last = new WeakMap<Element, number>();

function play(el: HTMLElement, dy: number, ms: number) {
  const now = performance.now();
  if ((last.get(el) ?? -1e9) > now - 90) return; // не дёргать, если только что проявлялся
  last.set(el, now);
  try {
    el.animate(
      [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: "none" }],
      { duration: ms, easing: "cubic-bezier(.2,.75,.3,1)" },
    );
  } catch { /* старый браузер без Web Animations — без анимации */ }
}

function ok(el: HTMLElement) {
  return !reduced.matches && !SKIP_SELF.has(el.id) && el.isConnected && !el.closest(SKIP_IN) && el.getBoundingClientRect().height > 0;
}

export function initMotion() {
  // показали экран, вкладку, раскрыли список
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      if (el.hidden || !ok(el)) continue;
      if (el.tagName === "SECTION") play(el, 22, 220); else play(el, 10, 190);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

  // содержимое блока заменили целиком
  const swap = new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      if (m.addedNodes.length && ok(el)) play(el, 8, 170);
    }
  });
  for (const id of SWAP) {
    const el = document.getElementById(id);
    if (el) swap.observe(el, { childList: true });
  }
}

/** Сворачиваемые списки: без анимации (анимация выдвигания фризила на телефоне), просто показать или спрятать. */
export function setOpen(el: HTMLElement | null | undefined, open: boolean) {
  if (el) el.hidden = !open;
}
