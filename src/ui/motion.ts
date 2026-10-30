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

const own = new WeakSet<Element>();
const running = new WeakMap<Element, Animation>();
const EASE = "cubic-bezier(.2,.75,.3,1)";

/** Высоту анимируем только у коротких списков: на каждом кадре она пересчитывает раскладку. У длинных — только прозрачность (на графическом процессоре). */
const light = (el: HTMLElement, h: number) => h <= 400 && el.querySelectorAll("*").length <= 60;

/** Выдвинуть или задвинуть список (высота + прозрачность, ~200 мс). Задвигание прячет элемент после анимации. */
export function setOpen(el: HTMLElement | null | undefined, open: boolean) {
  if (!el) return;
  running.get(el)?.cancel();
  el.style.overflow = "";
  const visible = !el.hidden && el.getBoundingClientRect().height > 0;
  if (reduced.matches || !el.isConnected || el.closest(SKIP_IN) || (!open && !visible)) { el.hidden = !open; return; }
  let frames: Keyframe[];
  if (open) {
    own.add(el);
    el.hidden = false;
    const h = el.offsetHeight;
    if (h <= 0) { own.delete(el); return; }
    frames = !light(el, h)
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ height: "0px", opacity: 0 }, { height: `${h}px`, opacity: 1 }];
  } else {
    const h = el.offsetHeight;
    frames = !light(el, h)
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ height: `${h}px`, opacity: 1 }, { height: "0px", opacity: 0 }];
  }
  el.style.overflow = "hidden";
  try {
    const a = el.animate(frames, { duration: open ? 210 : 170, easing: EASE });
    running.set(el, a);
    a.onfinish = () => { el.style.overflow = ""; running.delete(el); own.delete(el); if (!open) el.hidden = true; };
    a.oncancel = () => { el.style.overflow = ""; own.delete(el); };
  } catch { el.style.overflow = ""; own.delete(el); el.hidden = !open; }
}

export function initMotion() {
  // показали экран, вкладку, раскрыли список
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      if (el.hidden || own.has(el) || !ok(el)) continue;
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
