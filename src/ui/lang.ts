/**
 * Язык приложения: китайский или японский (переключатель в боковом меню).
 * В японском режиме — японские колоды, данные черт KanjiVG и шрифт Noto Serif JP (html[data-lang="ja"]);
 * упражнения, чтение, экзамен HSK и тоны пока только для китайского — их пункты меню скрыты.
 */
import { appLang, setAppLang } from "../state.ts";
import { $ } from "./dom.ts";
import { show } from "./nav.ts";

export function applyLang() {
  const lang = appLang();
  if (lang === "ja") document.documentElement.dataset.lang = "ja";
  else delete document.documentElement.dataset.lang;
  document.querySelectorAll<HTMLButtonElement>("#lang-sw [data-applang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.applang === lang)));
}

export function initLang() {
  applyLang();
  $("lang-sw").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-applang]");
    if (!b) return;
    const lang = b.dataset.applang === "ja" ? "ja" : "zh";
    if (lang === appLang()) return;
    await setAppLang(lang);
    applyLang();
    document.dispatchEvent(new CustomEvent("cherta:lang"));
    show("home");
  });
}
