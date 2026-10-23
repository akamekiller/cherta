/**
 * Панда-помощница: свой рисунок (SVG, без внешних файлов, без фильтров — рисуется быстро и чётко).
 * Чёрно-белая, красный шарфик с печатью 笔, бамбуковая кисть за ухом, свиток. Позы отличаются глазами, ртом и лапами.
 */
import type { Pose } from "../core/tour.ts";

const INK = "#2A2420", INK2 = "#463C36", FUR = "#FBF8F1", FUR2 = "#E9E0CE", LINE = "#CFC3AB", PINK = "#F0A096";
let uid = 0;

/** Лапа: чёрная «колбаска» с подушечкой и тремя пальцами на конце (рисуется в своих осях, поворот — снаружи). */
const paw = (x: number, y: number, rot: number, len = 30) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-10" y="${-len}" width="20" height="${len * 2}" rx="10" fill="url(#ink)"/>
  <ellipse cx="0" cy="${len - 7}" rx="5.6" ry="4.2" fill="#5B4F47"/><circle cx="-5.5" cy="${len - 12}" r="1.9" fill="#5B4F47"/><circle cx="0" cy="${len - 13.5}" r="1.9" fill="#5B4F47"/><circle cx="5.5" cy="${len - 12}" r="1.9" fill="#5B4F47"/></g>`;

const scroll = (x: number, y: number, rot: number) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-26" y="-9" width="52" height="18" rx="4" fill="#F4E9D0" stroke="#D8C79E" stroke-width="1.2"/>
  <rect x="-30" y="-11" width="9" height="22" rx="4.5" fill="#B8322A"/><rect x="21" y="-11" width="9" height="22" rx="4.5" fill="#B8322A"/>
  <path d="M-14 -3 H12 M-14 2 H6" stroke="#B9A57A" stroke-width="1.6" stroke-linecap="round"/><path d="M-2 -9 v18" stroke="#B8322A" stroke-width="2.4" opacity=".85"/></g>`;

function arms(p: Pose): string {
  if (p === "hello") return paw(46, 152, 20) + paw(160, 112, -150, 26);
  if (p === "happy") return paw(40, 118, 150, 26) + paw(160, 118, -150, 26);
  if (p === "think") return paw(46, 152, 20);
  return paw(46, 152, 18) + paw(154, 152, -18);
}

/** Один глаз: x,y — центр пятна; look — куда смотрит (-1…1 по x, y). */
function eye(x: number, rot: number, p: Pose, side: 1 | -1, look: [number, number]): string {
  const patch = `<ellipse cx="${x}" cy="90" rx="14.5" ry="19" transform="rotate(${rot} ${x} 90)" fill="url(#ink)"/>`;
  if (p === "happy") return patch + `<path d="M${x - 8} 94 Q${x} 82 ${x + 8} 94" fill="none" stroke="${FUR}" stroke-width="3.4" stroke-linecap="round"/>`;
  if (p === "sleep") return patch + `<path d="M${x - 8} 87 Q${x} 98 ${x + 8} 87" fill="none" stroke="${FUR}" stroke-width="3.2" stroke-linecap="round"/><path d="M${x - 9} 87 l-3 -2.5 M${x + 9} 87 l3 -2.5" stroke="${FUR}" stroke-width="1.6" stroke-linecap="round"/>`;
  const [lx, ly] = look, cx = x + lx * 2.5, cy = 90 + ly * 2.5;
  let e = patch +
    `<ellipse cx="${x}" cy="90" rx="8.3" ry="10.2" fill="${FUR}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="6" ry="7.8" fill="#4A3426"/><ellipse cx="${cx}" cy="${cy}" rx="3.6" ry="4.9" fill="#120E0C"/>` +
    `<circle cx="${cx - 2.2}" cy="${cy - 3}" r="2.5" fill="#fff"/><circle cx="${cx + 2.4}" cy="${cy + 3.2}" r="1.15" fill="#fff" opacity=".9"/>` +
    `<path d="M${x - 8.6} 85.5 Q${x} 78.5 ${x + 8.6} 85.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  if (p === "sad") {
    e += `<path d="M${x - 9 * side} 74 L${x + 9 * side} 70" stroke="${INK2}" stroke-width="2.6" stroke-linecap="round" opacity="0"/>`;
    e += `<path d="M${x + 5 * side} 103 q3.5 6 0 9 q-3.5 -3 0 -9z" fill="#8DC0E4" opacity=".95"/>`;
  }
  return e;
}

function face(p: Pose): string {
  const look: [number, number] = p === "think" ? [0.8, -0.9] : p === "sad" ? [0, 0.6] : [0, 0];
  let f = eye(72, -24, p, 1, look) + eye(128, 24, p, -1, look);
  if (p === "sad") f += `<path d="M58 70 Q68 63 82 67" fill="none" stroke="${INK2}" stroke-width="2.6" stroke-linecap="round" opacity=".0"/>`;
  f += `<ellipse cx="55" cy="112" rx="9.5" ry="5.4" fill="${PINK}" opacity=".6"/><ellipse cx="145" cy="112" rx="9.5" ry="5.4" fill="${PINK}" opacity=".6"/>`;
  f += `<path d="M91.5 103.5 Q100 98.5 108.5 103.5 Q106.5 112.5 100 114.5 Q93.5 112.5 91.5 103.5Z" fill="url(#ink)"/><ellipse cx="96.5" cy="103" rx="3.4" ry="1.6" fill="#fff" opacity=".45"/>`;
  const m = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (p === "happy") f += `<path d="M100 114.5 V117 M82 119 Q100 142 118 119 Z" fill="url(#ink)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M90 130 Q100 123 110 130 Q100 139 90 130Z" fill="#E0605A"/>`;
  else if (p === "sad") f += m("M100 114.5 V119") + m("M88 126 Q94 119 100 119 Q106 119 112 126");
  else if (p === "sleep") f += m("M100 114.5 V118") + m("M91 120 Q100 125 109 120") + `<circle cx="116" cy="106" r="5" fill="#BFE0F2" opacity=".7" stroke="#8DC0E4" stroke-width="1"/>`;
  else if (p === "think") f += m("M100 114.5 V118") + m("M93 121 Q100 122 108 119");
  else f += m("M100 114.5 V118") + m("M88 119 Q94 126 100 118 Q106 126 112 119");
  return f;
}

function extras(p: Pose): string {
  if (p === "sleep") return `<g font-family="sans-serif" font-weight="800" fill="${INK}" opacity=".5"><text x="34" y="22" font-size="20">z</text><text x="20" y="4" font-size="14">z</text><text x="10" y="-12" font-size="10">z</text></g>`;
  if (p === "think") return paw(128, 148, 200, 20) + `<circle cx="158" cy="44" r="3" fill="${INK}" opacity=".3"/><circle cx="170" cy="30" r="4.6" fill="${INK}" opacity=".3"/><circle cx="184" cy="14" r="6.4" fill="${INK}" opacity=".3"/>`;
  if (p === "happy") return `<path d="M24 58 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#E7B64F"/><path d="M172 70 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#E7B64F"/>`;
  return "";
}

/** SVG панды. size — ширина в px (высота пропорциональна). */
export function pandaSvg(pose: Pose = "hello", size = 132): string {
  const n = ++uid;
  const id = (s: string) => `${s}${n}`;
  const svg = `<svg class="panda" data-pose="${pose}" viewBox="0 -38 200 248" width="${size}" height="${Math.round(size * 248 / 200)}" role="img" aria-label="Панда-помощница" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A3F38"/><stop offset=".45" stop-color="${INK}"/><stop offset="1" stop-color="#171210"/></linearGradient>
  <radialGradient id="fur" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".65" stop-color="${FUR}"/><stop offset="1" stop-color="${FUR2}"/></radialGradient>
  <linearGradient id="scarf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9483C"/><stop offset="1" stop-color="#A32921"/></linearGradient>
  <linearGradient id="bamboo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D9A04A"/><stop offset="1" stop-color="#9C6A2B"/></linearGradient>
</defs>
<ellipse cx="100" cy="202" rx="62" ry="6.5" fill="#000" opacity=".16"/>
<g transform="rotate(32 142 54)"><rect x="138" y="-2" width="7" height="68" rx="3.5" fill="url(#bamboo)"/><rect x="137" y="30" width="9" height="4" rx="1.5" fill="#7C5120"/><rect x="137" y="12" width="9" height="3.4" rx="1.5" fill="#C9C2B5"/>
  <path d="M141.5 -2 C134 -8 134 -24 141.5 -34 C149 -24 149 -8 141.5 -2Z" fill="url(#ink)"/><path d="M139 -8 C137 -16 138 -22 141 -28" fill="none" stroke="#6A5D54" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></g>
<ellipse cx="68" cy="186" rx="21" ry="14" fill="url(#ink)"/><ellipse cx="132" cy="186" rx="21" ry="14" fill="url(#ink)"/>
<ellipse cx="68" cy="190" rx="9" ry="5.5" fill="#5B4F47"/><ellipse cx="132" cy="190" rx="9" ry="5.5" fill="#5B4F47"/>
<ellipse cx="100" cy="154" rx="52" ry="44" fill="url(#fur)" stroke="${LINE}" stroke-width="1.3"/>
<ellipse cx="100" cy="164" rx="32" ry="28" fill="#fff" opacity=".55"/>
${arms(pose)}
${pose === "hello" || pose === "think" ? scroll(62, 176, -24) : ""}
<circle cx="52" cy="48" r="21" fill="url(#ink)"/><circle cx="148" cy="48" r="21" fill="url(#ink)"/><ellipse cx="53" cy="50" rx="10" ry="9" fill="#6A5A50"/><ellipse cx="147" cy="50" rx="10" ry="9" fill="#6A5A50"/>
<path d="M46 124 Q100 156 154 124 L151 142 Q100 174 49 142Z" fill="url(#scarf)"/><path d="M52 128 Q100 156 148 128" fill="none" stroke="#F08A7E" stroke-width="2" opacity=".55" stroke-linecap="round"/><path d="M60 146 Q100 168 140 146" fill="none" stroke="#7C1D17" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>
<path d="M118 148 Q128 158 138 154 L146 196 Q136 188 128 198 L116 152Z" fill="url(#scarf)"/><path d="M126 152 L136 154 L144 190 Q138 186 133 190Z" fill="#8F231C" opacity=".35"/>
<path d="M122 176 H143 M122.8 181 H144" stroke="#EBC163" stroke-width="2.2" stroke-linecap="round"/><text x="133" y="168" font-size="12" text-anchor="middle" fill="#FBF3E4" font-family="'Noto Serif SC',serif" font-weight="700" transform="rotate(8 133 164)">笔</text>
<path d="M92 128 Q104 142 116 132 Q112 152 100 150 Q90 146 92 128Z" fill="#B82F26"/><path d="M96 134 Q104 144 112 136" fill="none" stroke="#E8776C" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>
<ellipse cx="100" cy="86" rx="59" ry="51" fill="url(#fur)" stroke="${LINE}" stroke-width="1.3"/>
<path d="M44 96 q-9 6 -4 16 q6 -2 9 -8z" fill="${FUR}" stroke="${LINE}" stroke-width="1.1"/><path d="M156 96 q9 6 4 16 q-6 -2 -9 -8z" fill="${FUR}" stroke="${LINE}" stroke-width="1.1"/>
<path d="M98 36 q-5 -9 2 -13 q-1 8 6 12" fill="${FUR}" stroke="${LINE}" stroke-width="1.1" stroke-linejoin="round"/>
${face(pose)}
${extras(pose)}
</svg>`;
  return svg.replace(/url\(#(ink|fur|scarf|bamboo)\)/g, (_m, s) => `url(#${id(s)})`).replace(/id="(ink|fur|scarf|bamboo)"/g, (_m, s) => `id="${id(s)}"`);
}
