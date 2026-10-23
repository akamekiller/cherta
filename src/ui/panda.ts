/**
 * Панда-помощница: свой рисунок (SVG, без внешних файлов и фильтров). Цельный силуэт с общей тёмной линией контура:
 * тело и голова — крупные формы, руки — плавные изгибы, шарф оборачивает шею и уходит концом по ветру.
 * Красный шарф с печатью 笔, бамбуковая кисть за ухом, свиток. Позы: глаза, рот, руки.
 */
import type { Pose } from "../core/tour.ts";

const INK = "#2B2420", LN = "#3B302A", FUR = "#FCF9F2", SHADE = "#EDE4D2", PINK = "#F2A79D", RED = "#C23A2F", RED2 = "#9C2A21";
const O = `stroke="${LN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

/** Рука: изогнутая чёрная лента с круглым концом. */
const arm = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="23" stroke-linecap="round"/>`;
const armHi = (d: string) => `<path d="${d}" fill="none" stroke="#5A4D45" stroke-width="3" stroke-linecap="round" opacity=".55" transform="translate(-4 -3)"/>`;

const scroll = `<g transform="translate(66 178) rotate(-22)"><rect x="-27" y="-10" width="54" height="20" rx="5" fill="#F6ECD3" ${O} stroke-width="2.4"/>
  <rect x="-32" y="-12.5" width="10" height="25" rx="5" fill="${RED}" ${O} stroke-width="2.4"/><rect x="22" y="-12.5" width="10" height="25" rx="5" fill="${RED}" ${O} stroke-width="2.4"/>
  <path d="M-14 -3 H14 M-14 3 H7" stroke="#B9A57A" stroke-width="1.8" stroke-linecap="round"/></g>`;

function armsBack(p: Pose): string {
  const L = "M64 140 Q42 158 54 180", R = "M136 140 Q158 158 146 180";
  if (p === "hello" || p === "think") return arm(L);
  if (p === "happy") return "";
  return arm(L) + arm(R);
}

function eye(x: number, rot: number, p: Pose): string {
  const patch = `<ellipse cx="${x}" cy="92" rx="13.5" ry="17.5" transform="rotate(${rot} ${x} 92)" fill="${INK}"/>`;
  if (p === "happy") return patch + `<path d="M${x - 7.5} 95 Q${x} 83 ${x + 7.5} 95" fill="none" stroke="${FUR}" stroke-width="3.4" stroke-linecap="round"/>`;
  if (p === "sleep") return patch + `<path d="M${x - 7.5} 89 Q${x} 99 ${x + 7.5} 89" fill="none" stroke="${FUR}" stroke-width="3.2" stroke-linecap="round"/>`;
  const dx = p === "think" ? 2.2 : 0, dy = p === "think" ? -2 : p === "sad" ? 2 : 0;
  let e = patch + `<circle cx="${x - 2.5 + dx}" cy="${88 + dy}" r="4.6" fill="#fff"/><circle cx="${x + 3.2 + dx}" cy="${96 + dy}" r="2.1" fill="#fff" opacity=".9"/>`;
  return e;
}

function face(p: Pose): string {
  let f = eye(72, -22, p) + eye(128, 22, p);
  f += `<ellipse cx="52" cy="116" rx="10" ry="5.6" fill="${PINK}" opacity=".7"/><ellipse cx="148" cy="116" rx="10" ry="5.6" fill="${PINK}" opacity=".7"/>`;
  f += `<path d="M91 107 Q100 102 109 107 Q107 116 100 118 Q93 116 91 107Z" fill="${INK}"/><ellipse cx="96.5" cy="106.4" rx="3.3" ry="1.5" fill="#fff" opacity=".5"/>`;
  const m = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (p === "happy") f += `<path d="M84 123 Q100 146 116 123 Q100 119 84 123Z" fill="${INK}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M91 133 Q100 127 109 133 Q100 141 91 133Z" fill="#E4635B"/>`;
  else if (p === "sad") f += m("M100 118 V122") + m("M89 130 Q95 122 100 122 Q105 122 111 130");
  else if (p === "sleep") f += m("M100 118 V121") + m("M92 124 Q100 129 108 124") + `<circle cx="117" cy="110" r="5" fill="#CBE6F6" opacity=".8" stroke="#8DC0E4" stroke-width="1.2"/>`;
  else if (p === "think") f += m("M100 118 V122") + m("M93 126 Q101 127 108 123");
  else f += m("M100 118 V121") + m("M89 123 Q94.5 130 100 121 Q105.5 130 111 123");
  if (p === "sad") f += `<path d="M62 106 q3.5 6 0 9 q-3.5 -3 0 -9z" fill="#8DC0E4"/>`;
  return f;
}

/** Всё, что рисуется поверх головы. */
function front(p: Pose): string {
  if (p === "hello") return arm("M140 142 Q170 132 164 98");
  if (p === "happy") return arm("M60 142 Q30 132 36 98") + arm("M140 142 Q170 132 164 98") + `<path d="M20 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#E7B64F"/><path d="M176 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#E7B64F"/>`;
  if (p === "think") return arm("M142 148 Q152 134 122 128") + `<g font-family="sans-serif"><circle cx="160" cy="46" r="3" fill="${INK}" opacity=".3"/><circle cx="172" cy="32" r="4.6" fill="${INK}" opacity=".3"/><circle cx="186" cy="16" r="6.4" fill="${INK}" opacity=".3"/></g>`;
  if (p === "sleep") return `<g font-family="sans-serif" font-weight="800" fill="${INK}" opacity=".5"><text x="30" y="30" font-size="20">z</text><text x="16" y="10" font-size="14">z</text></g>`;
  return "";
}

/** SVG панды. size — ширина в px (высота пропорциональна). */
export function pandaSvg(pose: Pose = "hello", size = 132): string {
  return `<svg class="panda" data-pose="${pose}" viewBox="0 -34 200 244" width="${size}" height="${Math.round(size * 244 / 200)}" role="img" aria-label="Панда-помощница" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="100" cy="203" rx="64" ry="6" fill="#000" opacity=".14"/>
<g transform="rotate(30 144 50)"><rect x="140" y="-4" width="8" height="70" rx="4" fill="#C98F3F" ${O} stroke-width="2.4"/><rect x="139" y="26" width="10" height="4.5" rx="1.5" fill="#8A5A22"/><rect x="139" y="10" width="10" height="4" rx="1.5" fill="#D8D2C6" stroke="${LN}" stroke-width="1.4"/>
  <path d="M144 -4 C136 -10 136 -26 144 -38 C152 -26 152 -10 144 -4Z" fill="${INK}" ${O} stroke-width="2"/><path d="M141 -10 C139 -18 140 -25 143 -31" fill="none" stroke="#6B5E55" stroke-width="1.6" stroke-linecap="round"/></g>
<ellipse cx="70" cy="190" rx="22" ry="13" fill="${INK}"/><ellipse cx="130" cy="190" rx="22" ry="13" fill="${INK}"/>
<path d="M50 150 C44 120 68 110 100 110 C132 110 156 120 150 150 C155 180 132 197 100 197 C68 197 45 180 50 150Z" fill="${FUR}" ${O}/>
<path d="M150 150 C155 180 132 197 100 197 C122 192 138 176 138 150 C138 134 130 124 118 118 C140 122 154 132 150 150Z" fill="${SHADE}"/>
${armsBack(pose)}${pose === "hello" || pose === "think" ? scroll : ""}
<g transform="translate(100 34) scale(.87) translate(-100 -34)"><circle cx="56" cy="46" r="21" fill="${INK}"/><circle cx="144" cy="46" r="21" fill="${INK}"/><ellipse cx="57" cy="49" rx="10" ry="9" fill="#6A5A50"/><ellipse cx="143" cy="49" rx="10" ry="9" fill="#6A5A50"/>
<path d="M100 34 C150 34 170 64 166 94 C162 128 134 142 100 142 C66 142 38 128 34 94 C30 64 50 34 100 34Z" fill="${FUR}" ${O}/>
<path d="M166 94 C162 128 134 142 100 142 C126 138 150 124 154 94 C156 74 150 56 138 46 C160 56 168 76 166 94Z" fill="${SHADE}"/>
${face(pose)}</g>
<g transform="translate(0 -9)"><path d="M48 134 C66 150 134 150 152 134 L150 154 C132 174 68 174 50 154Z" fill="${RED}" ${O}/>
<path d="M56 138 C76 152 124 152 144 138" fill="none" stroke="#EE8B7F" stroke-width="2.4" stroke-linecap="round" opacity=".6"/><path d="M62 160 C80 168 120 168 138 160" fill="none" stroke="${RED2}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
<path d="M118 152 C134 150 146 160 162 156 C174 153 184 160 194 172 C178 170 170 178 158 180 C146 182 138 172 122 176Z" fill="${RED}" ${O}/>
<path d="M130 160 C140 164 148 166 158 164" fill="none" stroke="#EE8B7F" stroke-width="2" stroke-linecap="round" opacity=".55"/><path d="M142 177 C148 176 154 175 160 171 M146 173 C152 172 158 170 164 166" stroke="#EBC163" stroke-width="2.2" stroke-linecap="round" fill="none" transform="translate(0 1)"/>
<path d="M104 142 C104 134 116 133 121 140 C125 148 119 158 110 158 C102 158 100 150 104 142Z" fill="${RED}" ${O} stroke-width="2.6"/>
<text x="172" y="168" font-size="11" text-anchor="middle" fill="#FBF3E4" font-family="'Noto Serif SC',serif" font-weight="700" transform="rotate(14 172 164)">笔</text></g>
${front(pose)}
</svg>`;
}
