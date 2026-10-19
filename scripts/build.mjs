// Сборка сайта в папку site/ (её и выкладываем на GitHub Pages).
// Запуск: npm run build   (нужен esbuild: npm install)
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const VERSION = `${pkg.version}-${Date.now().toString(36)}`;

// 1. Чистим всё, кроме данных черт (они тяжёлые и меняются редко)
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (!["data", "audio"].includes(f)) rmSync(join(out, f), { recursive: true, force: true });

// 2. Код. Версия данных рукописного ввода — по содержимому файла (в адресе ?v=, чтобы офлайн-кэш обновлялся)
const hwFile = join(out, "data/hw.txt");
const HW_VERSION = existsSync(hwFile) ? createHash("sha1").update(readFileSync(hwFile)).digest("hex").slice(0, 10) : "0";
if (!existsSync(hwFile)) console.warn("! Нет site/data/hw.txt — запустите: node scripts/build-hw.mjs");
await build({
  define: { __HW_VERSION__: JSON.stringify(HW_VERSION) },
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  format: "esm",
  target: ["es2020", "safari15"],
  minify: true,
  sourcemap: false,
  outfile: join(out, "app.js"),
  legalComments: "eof",
  logLevel: "warning",
});

// 3. Статика с подстановкой версии
cpSync(join(root, "static/icons"), join(out, "icons"), { recursive: true });
for (const f of ["styles.css", "manifest.webmanifest"]) cpSync(join(root, "static", f), join(out, f));
writeFileSync(join(out, "index.html"), readFileSync(join(root, "static/index.html"), "utf8").replaceAll("__VERSION__", VERSION));

// 4. Колоды из data/*.tsv
const decksOut = join(out, "data/decks");
mkdirSync(decksOut, { recursive: true });
const decks = JSON.parse(readFileSync(join(root, "data/decks.json"), "utf8"));
const index = [];
for (const d of decks) {
  const rows = readFileSync(join(root, "data", d.file), "utf8").replace(/\r/g, "").split("\n").slice(1)
    .map((l) => l.trim()).filter(Boolean).map((l) => l.split("\t").map((x) => x.trim()));
  writeFileSync(join(decksOut, `${d.id}.json`), JSON.stringify({ id: d.id, title: d.title, lang: d.lang, words: rows }));
  index.push({ id: d.id, title: d.title, subtitle: d.subtitle ?? "", group: d.group ?? "", lang: d.lang, count: rows.length });
}
writeFileSync(join(decksOut, "index.json"), JSON.stringify(index));
// Диалоги для упражнений (написаны для приложения)
writeFileSync(join(out, "data/dialogs.json"), JSON.stringify(JSON.parse(readFileSync(join(root, "data/dialogs.json"), "utf8"))));
// Тексты для чтения (python scripts/build_texts.py → data/texts.json)
writeFileSync(join(out, "data/texts.json"), JSON.stringify(JSON.parse(readFileSync(join(root, "data/texts.json"), "utf8"))));
// Темы готовых колод — уроки по словам (python scripts/build_themes.py → data/themes.json)
writeFileSync(join(out, "data/themes.json"), readFileSync(join(root, "data/themes.json"), "utf8"));
// Экзамен HSK: банк заданий (python scripts/build_hsk.py → data/hsk/)
mkdirSync(join(out, "data/hsk"), { recursive: true });
const hskIndex = JSON.parse(readFileSync(join(root, "data/hsk/index.json"), "utf8"));
for (const x of hskIndex) writeFileSync(join(out, "data/hsk", x.file), readFileSync(join(root, "data/hsk", x.file), "utf8"));
writeFileSync(join(out, "data/hsk/index.json"), JSON.stringify(hskIndex));
// Встроенные курсы упражнений (python scripts/build_courses.py → data/courses)
const coursesOut = join(out, "data/courses");
mkdirSync(coursesOut, { recursive: true });
const courses = JSON.parse(readFileSync(join(root, "data/courses/index.json"), "utf8"));
writeFileSync(join(coursesOut, "index.json"), JSON.stringify(courses));
for (const c of courses) writeFileSync(join(coursesOut, c.file), readFileSync(join(root, "data/courses", c.file), "utf8"));

// 5. Данные черт должны быть собраны заранее (scripts/build-strokes.mjs)
if (!existsSync(join(out, "data/strokes/00.json"))) {
  console.warn("! Нет site/data/strokes — запустите: node scripts/build-strokes.mjs <путь к all.json>");
}

// 6. Service worker со списком файлов оболочки
const shell = ["./", "index.html", "app.js", "styles.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "data/decks/index.json", ...decks.map((d) => `data/decks/${d.id}.json`),
  "data/dialogs.json", "data/texts.json", "data/themes.json", "data/hsk/index.json", ...hskIndex.map((x) => `data/hsk/${x.file}`), "data/decomp.json", "data/courses/index.json", ...courses.map((c) => `data/courses/${c.file}`)];
writeFileSync(join(out, "sw.js"), readFileSync(join(root, "static/sw.js"), "utf8")
  .replace("__VERSION__", VERSION).replace("__SHELL_FILES__", JSON.stringify(shell)));
writeFileSync(join(out, ".nojekyll"), "");

console.log(`Готово: site/ (версия ${VERSION})`);
