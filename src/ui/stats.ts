/** Статистика: серия дней, цель на день, точность, сколько иероглифов умеешь писать, календарь, прогноз, ответы по дням. */
import { app, updateSettings, todayCount } from "../state.ts";
import { streak, forecast, accuracy, writableChars, calendar, dayShift } from "../core/stats.ts";
import { splitCardId } from "../core/skills.ts";
import * as store from "../store.ts";
import { $, esc, plural } from "./dom.ts";
import { onShow } from "./nav.ts";

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const human = (key: string) => { const [, m, d] = key.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
const DOW = ["пн", "", "ср", "", "пт", "", ""];

/** Строка для главной: цель на день и серия. */
export function goalLine(): string {
  const goal = app.settings.dailyGoal;
  const done = todayCount();
  const st = streak(app.days, Date.now());
  const pct = Math.min(100, Math.round((100 * done) / Math.max(1, goal)));
  return `<div class="goal" role="img" aria-label="Сегодня ${done} из ${goal}">
    <div class="goal-top"><span>Сегодня <b>${done}</b> из ${goal}${done >= goal ? " — цель выполнена" : ""}</span><span>${st.current ? `серия ${st.current} ${plural(st.current, "день", "дня", "дней")}` : "серия не начата"}</span></div>
    <div class="goal-bar"><i style="width:${pct}%"></i></div></div>`;
}

function bars(values: number[], labels: string[], fmt: (v: number, i: number) => string, cls = ""): string {
  const W = 320, H = 96, gap = 2, n = values.length;
  const max = Math.max(1, ...values);
  const bw = (W - gap * (n - 1)) / n;
  const rects = values.map((v, i) => {
    const h = v ? Math.max(2, (v / max) * (H - 18)) : 0;
    const x = i * (bw + gap), y = H - 14 - h;
    return `<g class="bar-hit"><rect x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H - 14}" fill="transparent"/>${h ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(2, bw / 2)}" class="bar ${cls}"/>` : ""}<title>${esc(fmt(v, i))}</title></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">
    <line x1="0" y1="${H - 14}" x2="${W}" y2="${H - 14}" class="axis"/>
    ${rects}
    <text x="0" y="${H - 2}" class="tick">${esc(labels[0])}</text>
    <text x="${W}" y="${H - 2}" class="tick" text-anchor="end">${esc(labels[1])}</text>
    <text x="${W}" y="9" class="tick" text-anchor="end">макс. ${max}</text>
  </svg>`;
}

async function render() {
  const now = Date.now();
  const st = streak(app.days, now);
  const reviews = await store.recentReviews(now - 30 * 86400e3);
  const acc = accuracy(reviews, now);
  const writeCards = [...app.cards.keys()].filter((id) => splitCardId(id).skill === "write").map((id) => ({ id, han: id.split(":")[1] ?? "" }));
  const chars = writableChars(writeCards, (id) => app.cards.get(id));
  const goal = app.settings.dailyGoal;
  const done = todayCount();

  $("st-tiles").innerHTML = [
    [String(st.current), `${plural(st.current, "день", "дня", "дней")} подряд`, st.best > st.current ? `лучшая серия: ${st.best}` : st.current ? "это ваш рекорд" : "позанимайтесь сегодня"],
    [`${done}<small>/${goal}</small>`, "сегодня из цели", done >= goal ? "цель выполнена" : `осталось ${goal - done}`],
    [acc.pct === null ? "—" : `${acc.pct}%`, "точность за 30 дней", acc.n ? `${acc.n} ${plural(acc.n, "повторение", "повторения", "повторений")}` : "пока нет повторений"],
    [String(chars.size), `${plural(chars.size, "иероглиф", "иероглифа", "иероглифов")} умею писать`, "слова прошли заучивание"],
  ].map(([v, l, h]) => `<div class="tile-st"><b>${v}</b><span>${l}</span><small>${h}</small></div>`).join("");
  $("goal-val").textContent = String(goal);

  // календарь
  const cal = calendar(app.days, now, 18);
  const max = Math.max(1, ...cal.flat().map((c) => c.count));
  const level = (n: number) => (n === 0 ? 0 : n < max * 0.25 ? 1 : n < max * 0.5 ? 2 : n < max * 0.75 ? 3 : 4);
  const C = 13, G = 3, L = 18;
  const months: string[] = [];
  cal.forEach((col, w) => { const d = Number(col[0].key.split("-")[2]); if (d <= 7) months.push(`<text x="${L + w * (C + G)}" y="9" class="tick">${MONTHS[Number(col[0].key.split("-")[1]) - 1]}</text>`); });
  $("st-cal").innerHTML = `<svg viewBox="0 0 ${L + cal.length * (C + G)} ${14 + 7 * (C + G)}" class="cal" role="img" aria-label="Календарь занятий за 18 недель">
    ${months.join("")}
    ${DOW.map((d, i) => d ? `<text x="0" y="${14 + i * (C + G) + 10}" class="tick">${d}</text>` : "").join("")}
    ${cal.map((col, w) => col.map((c, i) => c.future ? "" : `<rect x="${L + w * (C + G)}" y="${14 + i * (C + G)}" width="${C}" height="${C}" rx="3" class="lv${level(c.count)}"><title>${human(c.key)}: ${c.count ? `${c.count} ${plural(c.count, "ответ", "ответа", "ответов")}` : "без занятий"}</title></rect>`).join("")).join("")}
  </svg>`;

  // прогноз на 30 дней (все навыки, все колоды)
  const f = forecast(app.cards.values(), now, 30);
  $("st-fc").innerHTML = bars(f, ["сегодня", "через 30 дн"], (v, i) => `${i === 0 ? "Сегодня" : human(dayShift(now, i))}: ${v} ${plural(v, "карточка", "карточки", "карточек")}`);
  $("st-fc-sum").textContent = `Завтра — ${f[1]}, за неделю — ${f.slice(0, 7).reduce((a, b) => a + b, 0)}.`;

  // ответы за 30 дней
  const last = Array.from({ length: 30 }, (_, i) => app.days.get(dayShift(now, i - 29))?.count ?? 0);
  $("st-hist").innerHTML = bars(last, ["30 дн назад", "сегодня"], (v, i) => `${human(dayShift(now, i - 29))}: ${v} ${plural(v, "ответ", "ответа", "ответов")}`, "past");
  const total = last.reduce((a, b) => a + b, 0);
  $("st-hist-sum").textContent = `Всего ${total} ${plural(total, "ответ", "ответа", "ответов")}, в среднем ${Math.round(total / 30)} в день.`;

  // карточки по состоянию
  let rev = 0, learn = 0;
  for (const c of app.cards.values()) { if (c.state === "review") rev++; else if (c.state !== "new") learn++; }
  $("st-cards").textContent = `Карточек в повторении: ${rev}, на заучивании: ${learn}. Начато слов: ${writeCards.length || new Set([...app.cards.keys()].map((id) => splitCardId(id).wordId)).size}.`;
}

export function initStats() {
  onShow("stats", () => { render(); });
  $("goal-minus").addEventListener("click", async () => { await updateSettings({ dailyGoal: Math.max(5, app.settings.dailyGoal - 5) }); render(); });
  $("goal-plus").addEventListener("click", async () => { await updateSettings({ dailyGoal: Math.min(500, app.settings.dailyGoal + 5) }); render(); });
}
