import type { Grade } from "./fsrs.ts";
import type { PinyinCheck } from "./pinyin.ts";

export type Attempt = {
  chars: number;        // сколько иероглифов в слове
  mistakes: number;     // сумма ошибочных черт
  gaveUp: boolean;      // нажал «Не помню» хотя бы на одном иероглифе
  hinted: boolean;      // включал контур на повторении
  isNew: boolean;       // новая карточка (писалась по контуру)
  pinyin: PinyinCheck | null; // null — пиньинь не проверялся
};

/**
 * Автоматическая оценка ответа.
 * «Не помню» или ошибок больше 3 на иероглиф → Снова.
 * Новая карточка: до 1 ошибки на иероглиф → Хорошо, иначе Трудно.
 * Повторение: подсказка или больше 1 ошибки на иероглиф → Трудно, иначе Хорошо.
 * Неверный тон понижает до Трудно, неверные буквы — до Снова.
 */
export function autoGrade(a: Attempt): Grade {
  let g: Grade;
  if (a.gaveUp || a.mistakes > 3 * a.chars) g = 1;
  else if (a.isNew) g = a.mistakes <= a.chars ? 3 : 2;
  else if (a.hinted || a.mistakes > a.chars) g = 2;
  else g = 3;
  if (a.pinyin && !a.pinyin.ok) g = Math.min(g, a.pinyin.letters ? 2 : 1) as Grade;
  return g;
}

/**
 * Письмо без подсказок: сколько «ошибок» засчитать иероглифу по распознаванию рисунка.
 * rank — место нужного иероглифа среди вариантов распознавания (−1 — нет среди них), strokeDiff — разница в числе черт.
 * Первое место — 0, второе-третье — 1, дальше в первой десятке — 2, не узнан — 4; лишние или пропущенные черты (больше 1) — ещё +1.
 */
export function blindMistakes(rank: number, strokeDiff: number): number {
  const base = rank === 0 ? 0 : rank > 0 && rank < 3 ? 1 : rank >= 3 ? 2 : 4;
  return base + (Math.abs(strokeDiff) > 1 ? 1 : 0);
}
