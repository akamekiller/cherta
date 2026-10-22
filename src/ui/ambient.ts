/**
 * Живой фон анимированных тем: сакура (лепестки), ночь (луна и светлячки), тушь (горы, туман, птицы),
 * фонари (небесные фонарики). Только CSS-анимации transform/opacity — работают на видеокарте.
 * На экранах письма (занятие, тетрадь) фон скрыт: правило в styles.css по html[data-view].
 * «Без анимации» оставляет неподвижную картинку.
 */
import { ANIMATED, currentPreset, onThemeChange, type Preset } from "../theme.ts";

let host: HTMLElement | null = null;
let motion = true;
let built = "";

/** Детерминированный «случай»: фон одинаков при каждом запуске. */
function rnd(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const COUNT: Record<string, number> = { sakura: 16, yoru: 18, shuimo: 5, deng: 12, ketsu: 26 };

function particles(p: Preset): string {
  const r = rnd(p.length * 97 + 13);
  const n = COUNT[p] ?? 0;
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (i + r() * 0.9) / n * 100; // равномерно по ширине
    const d = p === "shuimo" ? 70 + r() * 50 : p === "yoru" ? 16 + r() * 14 : p === "ketsu" ? 26 + r() * 30 : 14 + r() * 12;
    const delay = -r() * d;
    const s = 0.55 + r() * 0.7;
    const sw = (r() < 0.5 ? -1 : 1) * (18 + r() * 50);
    const y = r() * 100;
    const b = 2 + r() * 3;
    // кровь: пепел падает (две трети), искры тлеющих углей поднимаются, пара полос тумана плывёт
    const kind = p === "shuimo" ? (i < 3 ? "mist" : "bird") : p === "ketsu" ? (i % 9 === 0 ? "mist" : i % 4 === 0 ? "ember" : "ash") : "";
    out += `<i class="${kind}" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--d:${d.toFixed(1)}s;--delay:${delay.toFixed(1)}s;--s:${s.toFixed(2)};--sw:${sw.toFixed(0)}px;--b:${b.toFixed(1)}s"></i>`;
  }
  return out;
}

const MOUNTAINS = `<svg class="amb-mount" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">
  <path class="m1" d="M0 300V170c60-30 110-90 170-80s90 60 150 50 100-110 170-120 120 90 190 100 90-50 160-60 110 40 170 30 80-40 190-50v260z"/>
  <path class="m2" d="M0 300V220c80-10 120-60 200-60s100 50 180 45 140-80 220-75 120 70 200 70 120-40 200-40 120 30 200 25v115z"/>
  <path class="m3" d="M0 300v-45c100 0 160-30 260-30s180 35 300 35 200-40 320-40 220 35 320 30v50z"/>
</svg>`;

/** Паучья лилия (хиганбана): стебель и тонкие изогнутые лепестки-тычинки с точками на концах. */
function lily(x: number, h: number, flip: boolean, delay: number): string {
  const tips = [[-46, -34], [-34, -50], [-18, -58], [0, -62], [18, -58], [34, -50], [46, -34]];
  let petals = "";
  for (const [tx, ty] of tips) {
    petals += `<path d="M50 78 C ${50 + tx * 0.2} ${78 + ty * 0.9}, ${50 + tx * 0.9} ${78 + ty * 1.25}, ${50 + tx * 1.15} ${78 + ty * 1.05}"/><circle cx="${(50 + tx * 1.15).toFixed(1)}" cy="${(78 + ty * 1.05).toFixed(1)}" r="1.8"/>`;
  }
  return `<svg class="amb-lily" style="--lx:${x}%;--lh:${h}vh;--ld:${delay}s;${flip ? "transform:scaleX(-1)" : ""}" viewBox="0 0 100 160" aria-hidden="true"><g class="lily-sway"><path class="stem" d="M50 160 C 52 130 48 100 50 78"/><g class="bloom">${petals}</g></g></svg>`;
}

function backdrop(p: Preset): string {
  if (p === "ketsu") {
    const lilies = [[3, 17, false, 0], [14, 12, true, -2.4], [27, 9, false, -4.1], [70, 10, true, -1.3], [82, 15, false, -3.3], [94, 19, true, -0.6]]
      .map(([x, h, f, d]) => lily(x as number, h as number, f as boolean, d as number)).join("");
    return `<div class="amb-moon"></div><div class="amb-fog"></div>${MOUNTAINS}${lilies}<div class="amb-vignette"></div>`;
  }
  if (p === "yoru") {
    const r = rnd(7);
    let stars = "";
    for (let i = 0; i < 40; i++) stars += `<b style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 60).toFixed(1)}%;--o:${(0.25 + r() * 0.6).toFixed(2)};--b:${(2 + r() * 4).toFixed(1)}s"></b>`;
    return `<div class="amb-moon"></div><div class="amb-stars">${stars}</div>`;
  }
  if (p === "shuimo") return `<div class="amb-sun"></div>${MOUNTAINS}`;
  if (p === "deng") return `<div class="amb-glow"></div>`;
  return `<div class="amb-glow"></div>`;
}

function build() {
  if (!host) return;
  const p = currentPreset();
  const key = `${p}:${motion}`;
  if (key === built) return;
  built = key;
  if (!ANIMATED.includes(p)) { host.hidden = true; host.innerHTML = ""; host.removeAttribute("data-kind"); return; }
  host.hidden = false;
  host.dataset.kind = p;
  host.classList.toggle("still", !motion);
  host.innerHTML = backdrop(p) + `<div class="amb-p">${particles(p)}</div>`;
}

export function initAmbient(on: boolean | undefined) {
  host = document.getElementById("ambient");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  motion = on ?? !reduce;
  onThemeChange(build);
  build();
}

export function setMotion(on: boolean) {
  motion = on;
  build();
}
export const motionOn = () => motion;

/* ---------- эффекты темы «Кровь»: росчерк меча и печать 死 ---------- */
let fxBusy = 0;
const bloodTheme = () => currentPreset() === "ketsu" && motion;

/** Фильтр «грубая кисть»: края иероглифа рваные, как мазок тушью (создаётся один раз). */
function inkFilter() {
  if (document.getElementById("fx-ink")) return;
  document.body.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="fx-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
}

/** Росчерк: быстрый клинок (острый с обоих концов) и брызги крови вдоль разреза — на верный иероглиф и «Хорошо/Легко». */
export function slashFx() {
  if (!bloodTheme()) return;
  const flip = Math.random() < 0.5 ? -1 : 1;
  const ang = flip * (16 + Math.random() * 18);
  const el = document.createElement("div");
  el.className = "fx-slash";
  el.setAttribute("aria-hidden", "true");
  let drops = "";
  for (let i = 0; i < 16; i++) {
    const along = (Math.random() - 0.5) * 70;           // вдоль разреза, vmin
    const side = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 24); // в стороны
    const size = 3 + Math.random() * 7;
    const delay = 0.12 + Math.random() * 0.1;
    drops += `<u style="--ax:${along.toFixed(1)}vmin;--sd:${side.toFixed(1)}vmin;--sz:${size.toFixed(1)}px;--dl:${delay.toFixed(2)}s"></u>`;
  }
  el.innerHTML = `<div class="sl-flash"></div><div class="sl-cut" style="--ang:${ang.toFixed(1)}deg"><i class="blade"></i><i class="blade thin"></i><span class="spray">${drops}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/** Печать «死» — на ошибке и провале карточки: тёмная полоса, иероглиф рваной кистью, потёки; не накладывается сама на себя. */
export function deathFx() {
  if (!bloodTheme() || Date.now() < fxBusy) return;
  fxBusy = Date.now() + 2000;
  inkFilter();
  const el = document.createElement("div");
  el.className = "fx-death";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="dt-band"></div><b>死</b><span class="dt-drips"><i></i><i></i><i></i><i></i></span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
