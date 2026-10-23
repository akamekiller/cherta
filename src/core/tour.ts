/**
 * Обучение: панда спрашивает, нужно ли оно, и ведёт по разделам приложения — сама открывает вкладки,
 * подсвечивает нужное место и объясняет. Шаги сгруппированы в разделы; раздел можно пропустить целиком.
 */
import type { View } from "../ui/nav.ts";

export type Pose = "hello" | "think" | "happy" | "sad" | "sleep";
/** target — селекторы по порядку: подсвечивается первый видимый; без target — просто реплика панды. */
export type TourStep = { section: string; view: View; target?: string[]; pose: Pose; title: string; text: string; zhOnly?: boolean; optional?: boolean };

const ALL: TourStep[] = [
  { section: "Слова", view: "words", target: ["#w-search"], pose: "hello", title: "Слова: поиск",
    text: "Здесь словарь. Введите иероглиф, пиньинь или русское слово — найду всё, что есть. Открыв слово, увидите значения, примеры и порядок черт." },
  { section: "Слова", view: "words", target: ["#w-draw"], pose: "think", zhOnly: true, title: "Не знаете иероглиф?",
    text: "Нарисуйте его пальцем — приложение узнает знак по чертам (порядок черт не важен). Рядом кнопка голосового поиска." },
  { section: "Слова", view: "words", target: ["#w-home .wod", "#w-groups"], pose: "happy", title: "Слово дня и темы",
    text: "Ниже — слово дня, слова по темам и иероглифы по ключам. Любое слово можно добавить в колоду кнопкой «+ В колоду»." },

  { section: "Карточки", view: "home", target: ["#deck-catalog", "#decks-table", "#home-empty"], pose: "happy", title: "Колоды",
    text: "Колода — набор слов для заучивания. Готовые (HSK, JLPT, по темам) добавляются из каталога, свои — кнопкой «Новая колода» или импортом из Anki и Pleco." },
  { section: "Карточки", view: "home", target: ["#goal-line"], optional: true, pose: "hello", title: "Цель на день",
    text: "Здесь видно, сколько карточек вы уже прошли сегодня, и серию дней подряд. Цель меняется в «Статистике»." },
  { section: "Карточки", view: "home", pose: "think", title: "Как идёт карточка",
    text: "Видите значение — пишете иероглиф в клетке, потом выбираете или вводите пиньинь. Приложение само оценивает ответ и решает, когда показать слово снова. Ошиблись на черте три раза — она подсветится." },

  { section: "Тетрадь", view: "book", target: ["#bk-src", "#bk-opts"], pose: "hello", title: "Тетрадь прописей",
    text: "Выберите колоду или впишите свой текст — получите иероглифы для прописей. Можно выбрать один урок колоды." },
  { section: "Тетрадь", view: "book", target: ["#bk-hw", "#bk-pad", "#bk-nb"], pose: "happy", title: "Пишите по клеткам",
    text: "Сначала — по контуру, потом по памяти. На планшете тетрадь выглядит как настоящая: строка за строкой, с проверкой после строки. Страницы можно распечатать." },

  { section: "Упражнения", view: "ex", target: ["#ex-add", "#ex-courses"], pose: "think", title: "Курсы",
    text: "Курсы идут урок за уроком, как учебник: теория, слова, задания и диалоги. Добавьте готовый курс или загрузите свой файл. Есть режим «без звука»." },

  { section: "Чтение", view: "read", target: ["#rd-list"], pose: "hello", title: "Чтение",
    text: "Тексты по уровням. Тапните по любому слову — увидите пиньинь и значение, а непонятные слова одной кнопкой отправите в карточки." },

  { section: "Настройки", view: "settings", target: ["#pens"], pose: "happy", title: "Перо",
    text: "Выберите перо — кисть, карандаш, ручку или маркер — и цвет чернил. Образец черты меняется сразу." },
  { section: "Настройки", view: "settings", target: ["#themes"], pose: "sleep", title: "Темы",
    text: "Тем много: светлые, тёмные и живые с анимацией. Это всё! Обучение можно пройти снова в Настройках → «О приложении»." },
];

export function tourSteps(lang: "zh" | "ja"): TourStep[] {
  const ja = lang === "ja";
  return ALL.filter((s) => !(ja && s.zhOnly)).map((s) => {
    if (!ja) return s;
    if (s.title === "Слова: поиск") return { ...s, text: "Здесь словарь. Введите кандзи, кану, ромадзи или русское слово — найду всё, что есть. В статье — значения, примеры и порядок черт." };
    if (s.title === "Как идёт карточка") return { ...s, text: "Видите значение — пишете слово в клетке, потом вводите чтение каной (ромадзи превращаются в кану сами). Приложение оценивает ответ и решает, когда показать слово снова." };
    if (s.title === "Чтение") return { ...s, text: "Тексты по уровням JLPT с фуриганой. Тапните по любому слову — увидите чтение и значение, а непонятные слова одной кнопкой отправите в карточки." };
    return s;
  });
}

/** Подпись счётчика «2 из 6» (для разделов). */
export const stepLabel = (i: number, n: number) => `${i + 1} из ${n}`;

/** Разделы по порядку и номер раздела шага. */
export function sectionsOf(steps: TourStep[]): string[] {
  const out: string[] = [];
  for (const s of steps) if (out[out.length - 1] !== s.section) out.push(s.section);
  return out;
}
export const sectionIndex = (steps: TourStep[], i: number) => sectionsOf(steps).indexOf(steps[i].section);

/** Индекс первого шага следующего раздела; -1, если дальше разделов нет. */
export function nextSectionStart(steps: TourStep[], i: number): number {
  const sec = steps[i].section;
  for (let k = i + 1; k < steps.length; k++) if (steps[k].section !== sec) return k;
  return -1;
}
