/**
 * Навыки слова, как в Skritter: одно слово тренируется по-разному, и у каждого навыка свой интервал (своя карточка FSRS).
 *  write — по значению написать иероглифы (и пиньинь), как раньше;
 *  read  — по иероглифам вспомнить чтение (пиньинь) и значение;
 *  tone  — по иероглифам и значению поставить тоны;
 *  def   — по иероглифам и пиньиню вспомнить значение.
 * Карточка «написания» хранится под прежним id слова («zh:学»), остальные — «zh:学#tone» и т. д.,
 * поэтому сохранённый прогресс не меняется.
 */
import type { Card } from "./fsrs.ts";

export type Skill = "write" | "read" | "tone" | "def";
export const SKILLS: { id: Skill; name: string; hint: string }[] = [
  { id: "write", name: "Написание", hint: "по значению написать иероглифы" },
  { id: "read", name: "Чтение", hint: "по иероглифам вспомнить пиньинь" },
  { id: "tone", name: "Тоны", hint: "по иероглифам поставить тоны" },
  { id: "def", name: "Значение", hint: "по иероглифам вспомнить перевод" },
];
export const ALL_SKILLS: Skill[] = SKILLS.map((s) => s.id);
export const isSkill = (x: unknown): x is Skill => ALL_SKILLS.includes(x as Skill);

export const cardId = (wordId: string, skill: Skill) => (skill === "write" ? wordId : `${wordId}#${skill}`);
export function splitCardId(id: string): { wordId: string; skill: Skill } {
  const i = id.indexOf("#");
  if (i < 0) return { wordId: id, skill: "write" };
  const skill = id.slice(i + 1);
  return { wordId: id.slice(0, i), skill: isSkill(skill) ? skill : "write" };
}

/** Навыки колоды: только известные, в порядке SKILLS, хотя бы один. */
export function normSkills(x: unknown): Skill[] {
  const list = Array.isArray(x) ? ALL_SKILLS.filter((s) => x.includes(s)) : ALL_SKILLS;
  return list.length ? list : ["write"];
}

/* ---------- очередь занятия ---------- */

export type QWord = { id: string; hidden?: boolean };
export type QPick = { word: number; skill: Skill; fresh: "word" | "skill" | null };
export type QOpts = {
  now: number;
  skills: Skill[];
  /** Сколько новых слов ещё можно начать сегодня. */
  newWordsLeft: number;
  /** Не показывать подряд ту же карточку (id карточки). */
  exclude?: string;
  /** Шаги заучивания показываем чуть раньше срока. */
  learnAhead: number;
};

/**
 * Следующая карточка: просроченные шаги заучивания → повторения → новое слово (по лимиту, первый навык) →
 * новый навык уже начатого слова → шаги заранее. Внутри группы — по сроку, новые — в порядке колоды.
 */
export function pickNext(words: QWord[], card: (id: string) => Card | undefined, o: QOpts): QPick | null {
  let learnNow: [number, QPick] | null = null, review: [number, QPick] | null = null, ahead: [number, QPick] | null = null;
  let aheadSame: [number, QPick] | null = null;
  let newWord: QPick | null = null, newSkill: QPick | null = null;
  words.forEach((w, wi) => {
    if (w.hidden) return;
    let started = false;
    const missing: Skill[] = [];
    for (const sk of o.skills) {
      const id = cardId(w.id, sk);
      const c = card(id);
      if (!c) { missing.push(sk); continue; }
      started = true;
      const p: QPick = { word: wi, skill: sk, fresh: null };
      if (c.state !== "review") {
        if (c.due <= o.now && id !== o.exclude) { if (!learnNow || c.due < learnNow[0]) learnNow = [c.due, p]; }
        else if (c.due <= o.now + o.learnAhead) {
          if (id !== o.exclude) { if (!ahead || c.due < ahead[0]) ahead = [c.due, p]; }
          else if (!aheadSame || c.due < aheadSame[0]) aheadSame = [c.due, p];
        }
      } else if (c.due <= o.now) { if (!review || c.due < review[0]) review = [c.due, p]; }
    }
    // карточки других навыков (не из списка колоды) тоже считают слово начатым
    if (!started && ["write", "read", "tone", "def"].some((sk) => card(cardId(w.id, sk as Skill)))) started = true;
    if (!missing.length) return;
    if (started) { if (!newSkill) newSkill = { word: wi, skill: missing[0], fresh: "skill" }; }
    else if (!newWord && o.newWordsLeft > 0) newWord = { word: wi, skill: missing[0], fresh: "word" };
  });
  const pick = (x: [number, QPick] | null) => (x ? x[1] : null);
  return pick(learnNow) ?? pick(review) ?? newWord ?? newSkill ?? pick(ahead) ?? pick(aheadSame);
}

export type QCounts = { due: number; learning: number; review: number; newLeft: number; unseen: number; total: number };

/** Счётчики для списка колод и обзора: повторить сейчас, учу, новых слов на сегодня (+ новые навыки начатых слов). */
export function queueCounts(words: QWord[], card: (id: string) => Card | undefined, o: QOpts): QCounts {
  let due = 0, learning = 0, review = 0, unseen = 0, newSkills = 0;
  for (const w of words) {
    if (w.hidden) continue;
    let started = false, missing = 0;
    for (const sk of o.skills) {
      const c = card(cardId(w.id, sk));
      if (!c) { missing++; continue; }
      started = true;
      if (c.state === "review") { review++; if (c.due <= o.now) due++; }
      else if (c.due <= o.now + o.learnAhead) learning++;
    }
    if (!started && ALL_SKILLS.some((sk) => card(cardId(w.id, sk)))) started = true;
    if (!started) unseen++;
    else newSkills += missing;
  }
  const newWords = Math.min(unseen, Math.max(0, o.newWordsLeft));
  // новые навыки начатых слов и навыки новых слов, которые откроются после первой карточки
  const newLeft = newWords + newSkills;
  return { due, learning, review, newLeft, unseen, total: due + learning + newLeft };
}
