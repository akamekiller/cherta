/**
 * Навыки слова, как в Skritter: одно слово тренируется по-разному, и у каждого навыка свой интервал (своя карточка FSRS).
 *  write — по значению написать иероглифы (и пиньинь), как раньше;
 *  read  — по иероглифам вспомнить чтение (пиньинь) и значение;
 *  tone  — по иероглифам и значению поставить тоны;
 *  def   — по иероглифам и пиньиню вспомнить значение;
 *  recall — по значению вспомнить иероглифы и пиньинь без письма, оценка себе (как в Anki).
 * Карточка «написания» хранится под прежним id слова («zh:学»), остальные — «zh:学#tone» и т. д.,
 * поэтому сохранённый прогресс не меняется.
 */
import type { Card } from "./fsrs.ts";

export type Skill = "write" | "recall" | "read" | "tone" | "def";
export const SKILLS: { id: Skill; name: string; hint: string }[] = [
  { id: "write", name: "Пропись", hint: "по значению написать иероглифы" },
  { id: "recall", name: "Вспомнить слово", hint: "по значению вспомнить иероглифы и пиньинь без письма, оценить себя" },
  { id: "read", name: "Чтение", hint: "по иероглифам вспомнить пиньинь" },
  { id: "tone", name: "Тоны", hint: "по иероглифам поставить тоны" },
  { id: "def", name: "Значение", hint: "по иероглифам вспомнить перевод" },
];
export const ALL_SKILLS: Skill[] = SKILLS.map((s) => s.id);
/** Навыки по умолчанию (как было до «Вспомнить слово»): колоды без своих настроек не меняются. */
export const DEFAULT_SKILLS: Skill[] = ["write", "read", "tone", "def"];
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
  const list = Array.isArray(x) ? ALL_SKILLS.filter((s) => x.includes(s)) : DEFAULT_SKILLS;
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
  /** Вперемешку: новые слова — в случайном порядке, постоянном в течение дня (seed — например, дата). Без seed — по порядку колоды. */
  seed?: string;
  /** Новые слова — только из этих слов (индексы в колоде): текущий урок колоды. */
  newPool?: Set<number>;
  /** Случайность для выбора среди повторений и навыков (без неё — самое просроченное и первый навык). */
  rnd?: () => number;
};

/** Хэш строки (FNV-1a) — для стабильного случайного порядка новых слов. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Следующая карточка: просроченные шаги заучивания → повторения → новое слово (по лимиту, первый навык) →
 * новый навык уже начатого слова → шаги заранее. Внутри группы — по сроку, новые — в порядке колоды.
 */
export function pickNext(words: QWord[], card: (id: string) => Card | undefined, o: QOpts): QPick | null {
  let learnNow: [number, QPick] | null = null, ahead: [number, QPick] | null = null;
  let aheadSame: [number, QPick] | null = null;
  let review: [number, QPick] | null = null;
  let nReview = 0;
  let newWord: [number, QPick] | null = null, newSkill: QPick | null = null;
  let nNewSkill = 0;
  const rnd = o.rnd;
  const pickSkill = (missing: Skill[]) => (rnd ? missing[Math.floor(rnd() * missing.length)] : missing[0]);
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
      } else if (c.due <= o.now && id !== o.exclude) {
        // повторения: вперемешку (равновероятно среди всех готовых) или самое просроченное
        nReview++;
        if (rnd) { if (rnd() * nReview < 1) review = [c.due, p]; }
        else if (!review || c.due < review[0]) review = [c.due, p];
      }
    }
    // карточки других навыков (не из списка колоды) тоже считают слово начатым
    if (!started && ALL_SKILLS.some((sk) => card(cardId(w.id, sk)))) started = true;
    if (!missing.length) return;
    if (started) {
      nNewSkill++;
      if (!newSkill || (rnd && rnd() * nNewSkill < 1)) newSkill = { word: wi, skill: pickSkill(missing), fresh: "skill" };
    } else if (o.newWordsLeft > 0 && (!o.newPool || o.newPool.has(wi))) {
      const key = o.seed ? hashStr(o.seed + w.id) : wi;
      if (!newWord || key < newWord[0]) newWord = [key, { word: wi, skill: pickSkill(missing), fresh: "word" }];
    }
  });
  const pick = (x: [number, QPick] | null) => (x ? x[1] : null);
  return pick(learnNow) ?? pick(review) ?? pick(newWord) ?? newSkill ?? pick(ahead) ?? pick(aheadSame);
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
