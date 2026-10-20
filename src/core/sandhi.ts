/**
 * Изменения тонов в речи (变调):
 *  3 + 3 → 2 + 3 (你好 ní hǎo); в цепочке третьих все, кроме последнего, → 2 (упрощённо: 我很好 → wó hén hǎo);
 *  不 bù → bú перед 4-м тоном (不是 bú shì), иначе bù;
 *  一 yī → yí перед 4-м (一个, 一定), yì перед 1–3-м (一天, 一年, 一起); остаётся yī в конце, в числах и порядковых
 *  (第一, 十一, 一月, 一号, 统一).
 * На вход — иероглифы и тоны слова (как в колоде; у 不/一 в колоде уже может стоять изменённый тон — берётся базовый).
 */

export type SandhiKind = "33" | "bu" | "yi";

const NUM = new Set([..."零〇一二三四五六七八九十百千万第"]);
/** После 一 — счёт или дата: тон не меняется (一月 yī yuè, 一号, 一楼…). */
const KEEP_AFTER = new Set([..."月号日楼层"]);

function baseTones(han: string, tones: number[]): number[] {
  const ch = [...han];
  return tones.map((t, i) => (ch[i] === "不" ? 4 : ch[i] === "一" ? 1 : t));
}

/** Тоны так, как их произносят. */
export function spokenTones(han: string, tones: number[]): number[] {
  const ch = [...han];
  if (ch.length !== tones.length) return [...tones];
  const base = baseTones(han, tones);
  const out = [...base];
  for (let i = 0; i < ch.length; i++) {
    const next = base[i + 1];
    if (ch[i] === "不" && next !== undefined) out[i] = next === 4 ? 2 : 4;
    if (ch[i] === "一" && next !== undefined) {
      const counting = (i > 0 && NUM.has(ch[i - 1])) || NUM.has(ch[i + 1]) || KEEP_AFTER.has(ch[i + 1]);
      if (!counting) out[i] = next === 4 || (next === 5 && ch[i + 1] === "个") ? 2 : 4;
    }
  }
  // цепочка третьих: все, кроме последнего, → 2
  for (let i = 0; i < out.length - 1; i++) if (out[i] === 3 && out[i + 1] === 3) out[i] = 2;
  return out;
}

/** Какие правила работают в слове. */
export function sandhiKinds(han: string, tones: number[]): SandhiKind[] {
  const ch = [...han];
  if (ch.length !== tones.length || ch.length < 2) return [];
  const base = baseTones(han, tones);
  const sp = spokenTones(han, tones);
  const out = new Set<SandhiKind>();
  for (let i = 0; i < ch.length; i++) {
    if (sp[i] === base[i]) continue;
    out.add(ch[i] === "不" ? "bu" : ch[i] === "一" ? "yi" : "33");
  }
  return [...out];
}

/** Объяснение для слова: «nǐ + hǎo → ní hǎo: 3 + 3 → 2 + 3». */
export const SANDHI_RULE: Record<SandhiKind, string> = {
  "33": "Два третьих подряд: первый звучит как второй (3 + 3 → 2 + 3).",
  bu: "不 перед 4-м тоном звучит bú (2-й), перед остальными — bù.",
  yi: "一 перед 4-м тоном — yí, перед 1–3-м — yì; в счёте, датах и в конце — yī.",
};
