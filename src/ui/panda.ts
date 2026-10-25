/**
 * Панда-помощница: свой рисунок (SVG, без внешних файлов и фильтров). Цельный силуэт с общей тёмной линией контура, сонные полузакрытые глаза, руки сужаются от плеча к лапке с подушечкой:
 * тело и голова — крупные формы, руки — плавные изгибы, шарф оборачивает шею и уходит концом по ветру.
 * Красный шарф с печатью 笔, бамбуковая кисть за ухом, свиток. Позы: глаза, рот, руки.
 */
import type { Pose } from "../core/tour.ts";

const LID = "#F4EBDD", INK = "#2B2420", LN = "#3B302A", FUR = "#FCF9F2", SHADE = "#EDE4D2", RED = "#C23A2F", RED2 = "#9C2A21";
const O = `stroke="${LN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

type Pt = [number, number];
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 16): Pt[] => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]] as Pt;
});
const f1 = (n: number) => n.toFixed(1);
/** Рука: сужается от плеча к запястью, на конце круглая лапка (palm — ладошкой к зрителю: подушечка и пальчики). */
function arm(c: Pt[], w0 = 25, w1 = 20, palm = false): string {
  const n = c.length, L: Pt[] = [], R: Pt[] = [];
  c.forEach(([x, y], i) => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * i / (n - 1)) / 2;
    L.push([x - dy / l * w, y + dx / l * w]); R.push([x + dy / l * w, y - dx / l * w]);
  });
  const d = "M" + [...L, ...R.reverse()].map(([x, y]) => `${f1(x)} ${f1(y)}`).join(" L") + "Z";
  const e = c[n - 1], q = c[n - 3];
  const dx = e[0] - q[0], dy = e[1] - q[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const r = w1 / 2 + 2.4, cx = e[0] + ux * 3, cy = e[1] + uy * 3;
  let paw = `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${INK}"/>`;
  const bean = (px: number, py: number, rr: number) => `<circle cx="${f1(px)}" cy="${f1(py)}" r="${rr}" fill="#6B5B52"/>`;
  if (palm) {
    paw += `<ellipse cx="${f1(cx - ux * 2.2)}" cy="${f1(cy - uy * 2.2)}" rx="6.4" ry="5.2" transform="rotate(${f1(Math.atan2(uy, ux) * 180 / Math.PI + 90)} ${f1(cx - ux * 2.2)} ${f1(cy - uy * 2.2)})" fill="#6B5B52"/>`;
    for (const k of [-1, 0, 1]) paw += bean(cx + ux * (r - 5.2 - (k === 0 ? 0 : 1.6)) + nx * k * 5.4, cy + uy * (r - 5.2 - (k === 0 ? 0 : 1.6)) + ny * k * 5.4, 2.4);
    paw += `<ellipse cx="${f1(cx - ux * 4 - nx * 3)}" cy="${f1(cy - uy * 4 - ny * 3)}" rx="1.6" ry="1" fill="#fff" opacity=".25"/>`;
  } else {
    for (const k of [-1, 1]) paw += `<path d="M${f1(cx + ux * (r - 1) + nx * k * 3.4)} ${f1(cy + uy * (r - 1) + ny * k * 3.4)} l${f1(-ux * 5)} ${f1(-uy * 5)}" stroke="#5E4F47" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  return `<path d="${d}" fill="${INK}"/>${paw}`;
}

const scroll = `<g transform="translate(66 178) rotate(-22)"><rect x="-27" y="-10" width="54" height="20" rx="5" fill="#F6ECD3" ${O} stroke-width="2.4"/>
  <rect x="-32" y="-12.5" width="10" height="25" rx="5" fill="${RED}" ${O} stroke-width="2.4"/><rect x="22" y="-12.5" width="10" height="25" rx="5" fill="${RED}" ${O} stroke-width="2.4"/>
  <path d="M-14 -3 H14 M-14 3 H7" stroke="#B9A57A" stroke-width="1.8" stroke-linecap="round"/></g>`;

const DL = () => arm(bez([64, 138], [44, 148], [44, 166], [64, 176]), 25, 21);
const DR = () => arm(bez([136, 138], [156, 148], [156, 166], [136, 176]), 25, 21);
const UL = () => arm(bez([62, 140], [34, 138], [26, 116], [36, 92]), 25, 20, true);
const UR = () => arm(bez([138, 140], [166, 138], [174, 116], [164, 92]), 25, 20, true);
function armsBack(p: Pose): string {
  if (p === "hello" || p === "think") return DL();
  if (p === "happy") return "";
  return DL() + DR();
}

function eye(x: number, rot: number, p: Pose): string {
  const out = x < 100 ? -1 : 1, sad = p === "sad";
  // тёмное пятно поменьше, ниже и наклонено вниз к вискам — «опускается» вместе с веком
  const patch = `<ellipse cx="${x + out * 0.5}" cy="97.5" rx="14" ry="17" transform="rotate(${rot * 1.15} ${x} 97.5)" fill="${INK}"/>`;
  if (p === "happy") return patch + `<path d="M${x - 7} 100 Q${x} 89 ${x + 7} 100" fill="none" stroke="${FUR}" stroke-width="3.2" stroke-linecap="round"/>`;
  if (p === "sleep") return patch + `<path d="M${x - 7} 96 Q${x} 105 ${x + 7} 96" fill="none" stroke="${FUR}" stroke-width="3" stroke-linecap="round"/>`;
  const up = p === "think" ? -1.2 : 0, dxs = p === "think" ? 1.4 : 0;
  const y0 = (sad ? 93 : 93.5) + up, w = 10.4;
  const xo = x + out * (w + 1) + dxs, xi = x - out * (w + 1) + dxs;
  const yo = y0 + (sad ? -1.6 : 1.8), yi = y0 + (sad ? 1 : -0.6);
  return patch +
    `<path d="M${xo} ${yo} Q${x + dxs} ${y0 - 2.8} ${xi} ${yi} Q${x + dxs} ${y0 + w + 5} ${xo} ${yo}Z" fill="url(#iris)"/>` +
    `<circle cx="${x - 3 + dxs}" cy="${y0 + 5.2}" r="3.6" fill="#fff"/><circle cx="${x + 3.8 + dxs}" cy="${y0 + 9.6}" r="1.6" fill="#fff" opacity=".85"/>` +
    `<path d="M${xo} ${yo} Q${x + dxs} ${y0 - 3.6} ${xi} ${yi}" fill="none" stroke="${LID}" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`;
}

function face(p: Pose): string {
  let f = eye(72, -22, p) + eye(128, 22, p);
  const bl = (cx: number, k: number) => `<ellipse cx="${cx}" cy="116" rx="14" ry="8.5" fill="url(#blush)"/><path d="M${cx - 6 * k} 117.5 l3 -4 M${cx - 1 * k} 118.5 l3 -4 M${cx + 4 * k} 117.5 l3 -4" stroke="#E27D78" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>`;
  f += bl(52, 1) + bl(148, 1);
  f += `<path d="M91 107 Q100 102 109 107 Q107 116 100 118 Q93 116 91 107Z" fill="${INK}"/><ellipse cx="96.5" cy="106.4" rx="3.3" ry="1.5" fill="#fff" opacity=".5"/>`;
  const m = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (p === "happy") f += `<path d="M84 123 Q100 146 116 123 Q100 119 84 123Z" fill="${INK}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M91 133 Q100 127 109 133 Q100 141 91 133Z" fill="#E4635B"/>`;
  else if (p === "sad") f += m("M100 118 V122") + m("M89 130 Q95 122 100 122 Q105 122 111 130");
  else if (p === "sleep") f += m("M100 118 V121") + m("M92 124 Q100 129 108 124") + `<circle cx="117" cy="110" r="5" fill="#CBE6F6" opacity=".8" stroke="#8DC0E4" stroke-width="1.2"/>`;
  else if (p === "think") f += m("M100 118 V122") + m("M93 126 Q101 127 108 123");
  else f += m("M100 118 V121") + m("M90 123.5 Q95 128.5 100 121.5 Q105 128 110.5 122.5");
  if (p === "sad") f += `<path d="M62 106 q3.5 6 0 9 q-3.5 -3 0 -9z" fill="#8DC0E4"/>`;
  return f;
}

/** Всё, что рисуется поверх головы. */
function front(p: Pose): string {
  if (p === "hello") return UR();
  if (p === "happy") return UL() + UR() + `<path d="M20 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#E7B64F"/><path d="M176 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#E7B64F"/>`;
  if (p === "think") return arm(bez([140, 148], [156, 140], [142, 124], [122, 126]), 25, 20, true) + `<g font-family="sans-serif"><circle cx="160" cy="46" r="3" fill="${INK}" opacity=".3"/><circle cx="172" cy="32" r="4.6" fill="${INK}" opacity=".3"/><circle cx="186" cy="16" r="6.4" fill="${INK}" opacity=".3"/></g>`;
  if (p === "sleep") return `<g font-family="sans-serif" font-weight="800" fill="${INK}" opacity=".5"><text x="30" y="30" font-size="20">z</text><text x="16" y="10" font-size="14">z</text></g>`;
  return "";
}

/** SVG панды. size — ширина в px (высота пропорциональна). */
export function pandaSvg(pose: Pose = "hello", size = 132): string {
  return `<svg class="panda" data-pose="${pose}" viewBox="0 -34 200 244" width="${size}" height="${Math.round(size * 244 / 200)}" role="img" aria-label="Панда-помощница" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A5644"/><stop offset="1" stop-color="#46302A"/></linearGradient><radialGradient id="blush" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#EE8E86" stop-opacity=".9"/><stop offset=".55" stop-color="#F2A79D" stop-opacity=".55"/><stop offset="1" stop-color="#F6B9B0" stop-opacity="0"/></radialGradient></defs>
<g transform="rotate(30 144 50)"><rect x="140" y="-4" width="8" height="70" rx="4" fill="#C98F3F" ${O} stroke-width="2.4"/><rect x="139" y="26" width="10" height="4.5" rx="1.5" fill="#8A5A22"/><rect x="139" y="10" width="10" height="4" rx="1.5" fill="#D8D2C6" stroke="${LN}" stroke-width="1.4"/>
  <path d="M144 -4 C136 -10 136 -26 144 -38 C152 -26 152 -10 144 -4Z" fill="${INK}" ${O} stroke-width="2"/><path d="M141 -10 C139 -18 140 -25 143 -31" fill="none" stroke="#6B5E55" stroke-width="1.6" stroke-linecap="round"/></g>
<ellipse cx="70" cy="190" rx="22" ry="13" fill="${INK}"/><ellipse cx="130" cy="190" rx="22" ry="13" fill="${INK}"/>
<path d="M50 150 C44 120 68 110 100 110 C132 110 156 120 150 150 C155 180 132 197 100 197 C68 197 45 180 50 150Z" fill="${FUR}" ${O}/>
<path d="M150 150 C155 180 132 197 100 197 C122 192 138 176 138 150 C138 134 130 124 118 118 C140 122 154 132 150 150Z" fill="${SHADE}"/>
${armsBack(pose)}${pose === "hello" || pose === "think" ? scroll : ""}
<g>
<g transform="translate(200 0) scale(-1 1)">
<path d="M120 128 C138 116 152 136 168 127 C180 120 190 114 199 120 L188 134 L198 152 C186 156 178 142 164 151 C150 160 138 148 122 155Z" fill="${RED}" ${O} stroke-width="2.6"/>
<path d="M128 136 C142 130 152 144 168 137 C176 133 182 130 188 130" fill="none" stroke="#EE8B7F" stroke-width="2" stroke-linecap="round" opacity=".6"/>
<path d="M130 148 C142 146 150 150 164 143" fill="none" stroke="${RED2}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
<path d="M178 122 C178 131 177 140 175 148 M184 120 C184 129 183 138 182 146" stroke="#EBC163" stroke-width="2.2" stroke-linecap="round" fill="none"/>
</g><text x="46" y="147" font-size="10" text-anchor="middle" fill="#FBF3E4" font-family="'Noto Serif SC',serif" font-weight="700" transform="rotate(14 46 143)">笔</text>
<path d="M50 124 C54 112 78 108 100 108 C122 108 146 112 150 124 C152 142 134 158 100 158 C66 158 48 142 50 124Z" fill="${RED}" ${O}/>
<path d="M58 140 C74 152 126 152 142 140" fill="none" stroke="${RED2}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
<path d="M62 126 C70 120 84 118 96 119" fill="none" stroke="#EE8B7F" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>
<path d="M103 146 C101 156 98 166 94 176 L103 181 L107 171 L112 178 L118 170 C114 162 112 154 112 146Z" fill="#B53127" ${O} stroke-width="2.6"/>
<path d="M110 146 C112 158 118 168 124 178 L133 172 L127 168 L131 160 C124 156 120 150 118 144Z" fill="${RED}" ${O} stroke-width="2.6"/>
<path d="M106 150 C105 158 103 166 100 173" fill="none" stroke="${RED2}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
<path d="M99 134 C100 128 112 127 119 131 C124 139 121 150 112 152 C103 153 97 144 99 134Z" fill="${RED}" ${O} stroke-width="2.6"/>
<path d="M104 133 C108 138 108 145 106 150 M112 132 C115 138 115 145 113 150 M120 136 C117 139 116 142 116 146" fill="none" stroke="${RED2}" stroke-width="1.7" stroke-linecap="round" opacity=".6"/>
<path d="M102 131 C106 129 113 129 117 132" fill="none" stroke="#EE8B7F" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>
</g>
<g transform="translate(100 34) scale(.84) translate(-100 -34) rotate(3 100 120)"><circle cx="56" cy="46" r="21" fill="${INK}"/><circle cx="144" cy="46" r="21" fill="${INK}"/><ellipse cx="57" cy="49" rx="10" ry="9" fill="#6A5A50"/><ellipse cx="143" cy="49" rx="10" ry="9" fill="#6A5A50"/>
<path d="M100 34 C150 34 170 64 166 94 C162 128 134 142 100 142 C66 142 38 128 34 94 C30 64 50 34 100 34Z" fill="${FUR}" ${O}/>
<path d="M166 94 C162 128 134 142 100 142 C126 138 150 124 154 94 C156 74 150 56 138 46 C160 56 168 76 166 94Z" fill="${SHADE}"/>
${face(pose)}</g>
${front(pose)}
</svg>`;
}
