/** Состояние приложения: колода, карточки, настройки, очередь занятия. */
import { schedule, newCard, type Card, type Grade } from "./core/fsrs.ts";
import { loadDeck, type Deck, type DeckFile, type Word } from "./core/deck.ts";
import * as store from "./store.ts";

const MIN = 60_000;
const LEARN_AHEAD = 20 * MIN; // как в Anki: шаги заучивания показываем чуть раньше срока

export const app = {
  deck: null as Deck | null,
  cards: new Map<string, Card>(),
  settings: { ...store.DEFAULT_SETTINGS } as store.Settings,
  day: { day: "", newCount: 0 } as store.DayCounter,
};

/** День начинается в 4 утра, как в Anki. */
export function dayKey(t = Date.now()): string {
  const d = new Date(t - 4 * 3_600_000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function rollDay() {
  const k = dayKey();
  if (app.day.day !== k) app.day = { day: k, newCount: 0 };
}

export async function init() {
  const [settings, cards, day] = await Promise.all([store.loadSettings(), store.allCards(), store.getMeta<store.DayCounter>("day")]);
  app.settings = settings;
  app.cards = cards;
  if (day) app.day = day;
  rollDay();
  const res = await fetch(`data/decks/${settings.deck}.json`);
  if (!res.ok) throw new Error("Не удалось загрузить колоду");
  app.deck = loadDeck((await res.json()) as DeckFile);
}

export async function reloadCards() {
  app.cards = await store.allCards();
  app.day = (await store.getMeta<store.DayCounter>("day")) ?? { day: "", newCount: 0 };
  rollDay();
}

export const words = () => app.deck?.words ?? [];
export const cardOf = (w: Word) => app.cards.get(w.id);

export function counts() {
  rollDay();
  const now = Date.now();
  let due = 0, learning = 0, review = 0;
  for (const w of words()) {
    const c = cardOf(w);
    if (!c) continue;
    if (c.state === "review") { review++; if (c.due <= now) due++; }
    else if (c.due <= now + LEARN_AHEAD) learning++;
  }
  const unseen = words().filter((w) => !cardOf(w)).length;
  const newLeft = Math.min(unseen, Math.max(0, app.settings.newPerDay - app.day.newCount));
  return { due, learning, review, newLeft, unseen, total: due + learning + newLeft };
}

/** Следующее слово: просроченные шаги → повторения → новые → шаги заранее. */
export function nextWord(excludeId?: string): Word | null {
  rollDay();
  const now = Date.now();
  const seen = words().map((w) => [w, cardOf(w)] as const).filter((x): x is readonly [Word, Card] => !!x[1]);
  const earliest = (list: (readonly [Word, Card])[]) => list.sort((a, b) => a[1].due - b[1].due)[0]?.[0] ?? null;
  const learningNow = seen.filter(([w, c]) => c.state !== "review" && c.due <= now && w.id !== excludeId);
  if (learningNow.length) return earliest(learningNow);
  const reviews = seen.filter(([, c]) => c.state === "review" && c.due <= now);
  if (reviews.length) return earliest(reviews);
  if (app.day.newCount < app.settings.newPerDay) {
    const fresh = words().find((w) => !cardOf(w));
    if (fresh) return fresh;
  }
  const ahead = seen.filter(([, c]) => c.state !== "review" && c.due <= now + LEARN_AHEAD);
  const notSame = ahead.filter(([w]) => w.id !== excludeId);
  return earliest(notSame.length ? notSame : ahead);
}

export function preview(w: Word, g: Grade, now = Date.now()): Card {
  return schedule(cardOf(w) ?? newCard(w.id, now), g, now);
}

export async function answer(w: Word, g: Grade, mistakes: number) {
  rollDay();
  const now = Date.now();
  const before = cardOf(w);
  const next = schedule(before ?? newCard(w.id, now), g, now);
  if (!before) app.day = { ...app.day, newCount: app.day.newCount + 1 };
  app.cards.set(w.id, next);
  await store.saveAnswer(next, { id: w.id, at: now, grade: g, state: before?.state ?? "new", mistakes }, app.day);
}

export async function updateSettings(patch: Partial<store.Settings>) {
  app.settings = { ...app.settings, ...patch };
  await store.setMeta("settings", app.settings);
}

export function nextDueTime(): number | null {
  const now = Date.now();
  const list = words().map(cardOf).filter((c): c is Card => !!c && c.due > now).map((c) => c.due);
  return list.length ? Math.min(...list) : null;
}
