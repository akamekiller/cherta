/**
 * Панда-помощница: свой рисунок (SVG, без внешних файлов). Чёрно-белая, красный шарфик, кисть за ухом.
 * Позы отличаются глазами, ртом и лапами; цвета фиксированные — читается на любой теме.
 */
import type { Pose } from "../core/tour.ts";

const INK = "#2A2521", FUR = "#FBF8F0", RED = "#B8322A", RED2 = "#8F2620", WOOD = "#A8742F";

const paw = (cx: number, cy: number, rot: number) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="7.5" ry="13" transform="rotate(${rot} ${cx} ${cy})" fill="${INK}"/>`;

function arms(p: Pose): string {
  if (p === "hello") return paw(24, 90, 18) + paw(98, 64, -38);              // правая машет
  if (p === "happy") return paw(22, 66, 36) + paw(98, 66, -36);               // обе вверх
  if (p === "think") return paw(24, 90, 18) + paw(72, 80, 55);                // лапа у подбородка
  return paw(26, 92, 14) + paw(94, 92, -14);                                  // опущены
}

function eyes(p: Pose): string {
  const patch = (x: number, rot: number) => `<ellipse cx="${x}" cy="50" rx="8.4" ry="10.5" transform="rotate(${rot} ${x} 50)" fill="${INK}"/>`;
  const shine = (x: number) => `<circle cx="${x}" cy="48" r="2.6" fill="${FUR}"/><circle cx="${x + 2.2}" cy="52.5" r="1.1" fill="${FUR}"/>`;
  const arc = (x: number, up: boolean) =>
    `<path d="M${x - 4.5} ${up ? 52 : 49} Q${x} ${up ? 45 : 56} ${x + 4.5} ${up ? 52 : 49}" fill="none" stroke="${FUR}" stroke-width="2.2" stroke-linecap="round"/>`;
  const tilt = p === "sad" ? 8 : 0;
  let e = patch(44, -22 - tilt) + patch(76, 22 + tilt);
  if (p === "happy") e += arc(44, true) + arc(76, true);
  else if (p === "sleep") e += arc(44, false) + arc(76, false);
  else e += shine(44) + shine(76);
  return e;
}

function mouth(p: Pose): string {
  if (p === "happy") return `<path d="M53 65 Q60 78 67 65 Z" fill="${INK}"/><path d="M56.5 71.5 Q60 74.5 63.5 71.5 Q60 69.5 56.5 71.5Z" fill="${RED}"/>`;
  if (p === "sad") return `<path d="M54 71 Q60 65.5 66 71" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  if (p === "sleep") return `<path d="M55 67 Q60 70 65 67" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  if (p === "think") return `<path d="M55 68 L64 67" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  return `<path d="M53.5 65.5 Q60 72.5 66.5 65.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
}

function extras(p: Pose): string {
  if (p === "sleep") return `<text x="92" y="22" font-size="11" font-weight="700" fill="${INK}" opacity=".55" font-family="sans-serif">z</text><text x="100" y="12" font-size="8" font-weight="700" fill="${INK}" opacity=".4" font-family="sans-serif">z</text>`;
  if (p === "think") return `<circle cx="96" cy="26" r="2" fill="${INK}" opacity=".35"/><circle cx="103" cy="18" r="3" fill="${INK}" opacity=".35"/><circle cx="112" cy="8" r="4.2" fill="${INK}" opacity=".35"/>`;
  if (p === "sad") return `<path d="M88 30 q3 5 0 8 q-3 -3 0 -8z" fill="#7FB0D6"/>`;
  return "";
}

/** SVG панды. size — сторона в px. */
export function pandaSvg(pose: Pose = "hello", size = 132): string {
  return `<svg class="panda" data-pose="${pose}" viewBox="0 0 120 124" width="${size}" height="${size * 124 / 120}" role="img" aria-label="Панда-помощница" xmlns="http://www.w3.org/2000/svg">
  <path d="M84 30 L102 8" stroke="${WOOD}" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M100.2 10.6 Q104 2 108.5 2.6 Q108.5 8.5 103 12.2 Z" fill="${INK}"/>
  <ellipse cx="40" cy="113" rx="11.5" ry="8" fill="${INK}"/><ellipse cx="80" cy="113" rx="11.5" ry="8" fill="${INK}"/>
  <ellipse cx="60" cy="94" rx="31" ry="25" fill="${FUR}" stroke="#D8CCB2" stroke-width="1.2"/>
  ${arms(pose)}
  <circle cx="34" cy="27" r="11.5" fill="${INK}"/><circle cx="86" cy="27" r="11.5" fill="${INK}"/>
  <path d="M33 74 Q60 90 87 74 L85 84 Q60 99 35 84 Z" fill="${RED}"/>
  <path d="M75 87 L89 85 L96 112 L82 109 Z" fill="${RED}"/><path d="M75 87 L89 85 L90 90 L76 92 Z" fill="${RED2}"/>
  <text x="85.5" y="104" font-size="9" fill="${FUR}" text-anchor="middle" font-family="'Noto Serif SC',serif" font-weight="700" transform="rotate(-8 85.5 100)">笔</text>
  <ellipse cx="60" cy="50" rx="34" ry="29" fill="${FUR}" stroke="#D8CCB2" stroke-width="1.2"/>
  ${eyes(pose)}
  <ellipse cx="60" cy="59.5" rx="4.4" ry="3.1" fill="${INK}"/>
  ${mouth(pose)}
  ${extras(pose)}
</svg>`;
}
