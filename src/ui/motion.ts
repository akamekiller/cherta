/** Плавное появление: экраны, вкладки, раскрытые списки и группы. Быстро (как в AnkiDroid), только opacity и transform. */
const DUR = 170;
const SKIP_SELF = new Set(["sheet", "sheet-scrim", "scrim", "drawer", "ambient"]);
const SKIP_IN = "#session, #book, #print-area, .guide, .tour, #ambient, .sheet-scrim, .scrim, .drawer, .fx-slash";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

function appear(el: HTMLElement) {
  if (reduced.matches || SKIP_SELF.has(el.id) || el.closest(SKIP_IN) || !el.isConnected) return;
  if (!el.getBoundingClientRect().height) return; // пустое — анимировать нечего
  const section = el.tagName === "SECTION";
  try {
    el.animate(
      [{ opacity: 0, transform: `translateY(${section ? 8 : 5}px)` }, { opacity: 1, transform: "none" }],
      { duration: DUR, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
  } catch { /* старый браузер без Web Animations — без анимации */ }
}

export function initMotion() {
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      if (m.attributeName === "hidden" && !el.hidden) appear(el);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
}
