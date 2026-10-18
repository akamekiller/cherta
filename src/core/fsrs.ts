/**
 * FSRS-5 — алгоритм интервальных повторений (как в современной Anki).
 * Параметры по умолчанию из open-spaced-repetition. Без «фаза» (fuzz) — интервалы детерминированы.
 *
 * Оценки: 1 Снова, 2 Трудно, 3 Хорошо, 4 Легко.
 * Состояния: new → learning → review ⇄ relearning.
 */

export type Grade = 1 | 2 | 3 | 4;
export type CardState = "new" | "learning" | "review" | "relearning";

export type Card = {
  id: string;
  state: CardState;
  due: number;        // ms
  stability: number;  // дни
  difficulty: number; // 1..10
  step: number;       // индекс шага заучивания
  reps: number;
  lapses: number;
  last: number;       // ms последнего повторения, 0 если не было
};

export type Params = {
  w: number[];
  retention: number;       // желаемая вероятность вспомнить
  learningSteps: number[]; // минуты
  relearningSteps: number[];
  maxInterval: number;     // дни
};

export const DEFAULT_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

export const DEFAULT_PARAMS: Params = {
  w: DEFAULT_W,
  retention: 0.9,
  learningSteps: [1, 10],
  relearningSteps: [10],
  maxInterval: 36500,
};

const DECAY = -0.5;
const FACTOR = 19 / 81; // 0.9^(1/DECAY) - 1
const MIN = 60_000;
export const DAY = 86_400_000;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function newCard(id: string, now = Date.now()): Card {
  return { id, state: "new", due: now, stability: 0, difficulty: 0, step: 0, reps: 0, lapses: 0, last: 0 };
}

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function interval(stability: number, p: Params): number {
  const ivl = (stability / FACTOR) * (Math.pow(p.retention, 1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, p.maxInterval);
}

const initStability = (g: Grade, w: number[]) => Math.max(w[g - 1], 0.1);
const initDifficulty = (g: Grade, w: number[]) => clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d: number, g: Grade, w: number[]): number {
  const delta = -w[6] * (g - 3);
  const dp = d + (delta * (10 - d)) / 9; // линейное затухание
  const target = initDifficulty(4, w);
  return clamp(w[7] * target + (1 - w[7]) * dp, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Grade, w: number[]): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy);
}

function forgetStability(d: number, s: number, r: number, w: number[]): number {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(sf, s);
}

function shortTermStability(s: number, g: Grade, w: number[]): number {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

/** Следующее состояние карточки после оценки. Не меняет исходный объект. */
export function schedule(card: Card, g: Grade, now = Date.now(), p: Params = DEFAULT_PARAMS): Card {
  const w = p.w;
  const c: Card = { ...card, reps: card.reps + 1, last: now };

  if (card.state === "new") {
    c.stability = initStability(g, w);
    c.difficulty = initDifficulty(g, w);
    return afterLearningStep(c, card.state, 0, g, now, p);
  }

  if (card.state === "learning" || card.state === "relearning") {
    c.stability = shortTermStability(card.stability, g, w);
    c.difficulty = nextDifficulty(card.difficulty, g, w);
    return afterLearningStep(c, card.state, card.step, g, now, p);
  }

  // review
  const elapsed = Math.max(0, (now - card.last) / DAY);
  const r = retrievability(elapsed, card.stability);
  c.difficulty = nextDifficulty(card.difficulty, g, w);
  if (g === 1) {
    c.stability = forgetStability(card.difficulty, card.stability, r, w);
    c.lapses = card.lapses + 1;
    if (p.relearningSteps.length) {
      c.state = "relearning";
      c.step = 0;
      c.due = now + p.relearningSteps[0] * MIN;
    } else {
      c.state = "review";
      c.due = now + interval(c.stability, p) * DAY;
    }
    return c;
  }
  // Считаем все три варианта, чтобы Трудно < Хорошо < Легко по интервалам.
  const sHard = recallStability(card.difficulty, card.stability, r, 2, w);
  const sGood = recallStability(card.difficulty, card.stability, r, 3, w);
  const sEasy = recallStability(card.difficulty, card.stability, r, 4, w);
  let iHard = interval(sHard, p);
  let iGood = interval(sGood, p);
  let iEasy = interval(sEasy, p);
  iHard = Math.min(iHard, iGood);
  iGood = Math.max(iGood, iHard + 1);
  iEasy = Math.max(iEasy, iGood + 1);
  const pick = { 2: [sHard, iHard], 3: [sGood, iGood], 4: [sEasy, iEasy] }[g as 2 | 3 | 4];
  c.stability = pick[0];
  c.state = "review";
  c.step = 0;
  c.due = now + Math.min(pick[1], p.maxInterval) * DAY;
  return c;
}

function afterLearningStep(c: Card, from: CardState, step: number, g: Grade, now: number, p: Params): Card {
  const steps = from === "relearning" ? p.relearningSteps : p.learningSteps;
  const graduate = () => {
    c.state = "review";
    c.step = 0;
    let days = interval(c.stability, p);
    if (g === 4) days = Math.max(days, from === "new" ? 2 : 1);
    c.due = now + days * DAY;
    return c;
  };
  const learnState: CardState = from === "relearning" ? "relearning" : "learning";

  if (g === 4 || steps.length === 0) return graduate();
  if (g === 1) {
    c.state = learnState; c.step = 0; c.due = now + steps[0] * MIN; return c;
  }
  if (g === 2) {
    c.state = learnState; c.step = step;
    const cur = steps[step] ?? steps[steps.length - 1];
    const next = steps[step + 1];
    // как в Anki: «Трудно» на первом шаге — среднее между первым и вторым шагом
    const mins = step === 0 && next !== undefined ? (cur + next) / 2 : cur * 1.5;
    c.due = now + Math.round(mins) * MIN;
    return c;
  }
  // g === 3
  const nextStep = from === "new" ? 0 : step + 1;
  if (from === "new" && steps.length > 1) {
    c.state = learnState; c.step = 1; c.due = now + steps[1] * MIN; return c;
  }
  if (nextStep >= steps.length || from === "new") return graduate();
  c.state = learnState; c.step = nextStep; c.due = now + steps[nextStep] * MIN;
  return c;
}

/** Человекочитаемый интервал: «10 мин», «3 дн», «2 мес». */
export function formatGap(ms: number): string {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} мин`;
  if (ms < DAY) return `${Math.round(ms / 3_600_000)} ч`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d} дн`;
  if (d < 365) return `${Math.round(d / 30)} мес`;
  return `${(d / 365).toFixed(1).replace(".0", "")} г`;
}
