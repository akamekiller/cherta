"""Шрифты приложения — свои файлы вместо Google Fonts (в Китае fonts.googleapis.com без VPN не открывается).

Запуск:  python scripts/build_fonts.py <папка с ttf>
В папке: GolosText[wght].ttf, IBMPlexMono-Medium.ttf, NotoSerifSC[wght].ttf
(репозиторий github.com/google/fonts, папки ofl/golostext, ofl/ibmplexmono, ofl/notoserifsc; лицензия SIL OFL 1.1).
Нужно: pip install fonttools brotli

Результат — site/data/fonts/ (сборка папку data не трогает):
  fonts.css      — @font-face; иероглифический шрифт нарезан на части по частоте знаков (unicode-range),
                   браузер скачивает только те части, знаки из которых есть на экране;
  *.woff2        — имена с хэшем содержимого (офлайн-кэш «сначала кэш» не держит старые версии);
  files.json     — список файлов и размеры (для «Скачать для офлайна»).
Порядок знаков — site/data/hw.txt (9574 иероглифа по частоте jieba, есть данные черт).
"""
import hashlib
import io
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data", "fonts")

LATIN = list(range(0x20, 0x250)) + list(range(0x300, 0x370)) + list(range(0x2000, 0x2070)) + [0x20AC, 0x20BD, 0x2116, 0x2122]
CYR = list(range(0x400, 0x500))
CJK_PUNCT = list(range(0x3000, 0x3040)) + list(range(0xFF00, 0xFFF0)) + [0x2014, 0x2026, 0x2018, 0x2019, 0x201C, 0x201D, 0xB7]
# границы частей иероглифического шрифта: первые знаки — маленькими частями (быстрее первая отрисовка)
CUTS = [500, 1200, 2200, 3500, 5000, 7000]


def ranges(cps):
    """Список кодов → строка unicode-range: U+4E00-4E05,U+4E08…"""
    cps = sorted(set(cps))
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" if i == j else f"U+{cps[i]:X}-{cps[j]:X}")
        i = j + 1
    return ",".join(out)


def make(src_font, cps, name):
    """Подмножество шрифта в woff2; возвращает (имя файла, размер, реально попавшие коды)."""
    f = TTFont(src_font) if isinstance(src_font, str) else src_font
    have = set(f.getBestCmap())
    cps = [c for c in cps if c in have]
    o = subset.Options()
    o.flavor = "woff2"
    o.layout_features = ["*"]
    o.name_IDs = ["*"]
    o.notdef_outline = True
    s = subset.Subsetter(o)
    s.populate(unicodes=cps)
    s.subset(f)
    f.flavor = "woff2"
    b = io.BytesIO()
    f.save(b)
    data = b.getvalue()
    fn = f"{name}-{hashlib.sha1(data).hexdigest()[:8]}.woff2"
    with open(os.path.join(OUT, fn), "wb") as fh:
        fh.write(data)
    return fn, len(data), cps


def limit(path, lo, hi):
    """Переменный шрифт, урезанный по оси начертания; заново открытый из байтов (иначе subset падает на ленивых таблицах)."""
    b = io.BytesIO()
    instancer.instantiateVariableFont(TTFont(path), {"wght": (lo, hi)}).save(b)
    return b.getvalue()


def face(family, fn, weight, cps):
    return (f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};font-display:swap;"
            f"src:url({fn}) format('woff2');unicode-range:{ranges(cps)}}}")


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".woff2"):
            os.remove(os.path.join(OUT, f))
    css, files = [], []

    def add(family, fn, size, weight, cps, core):
        css.append(face(family, fn, weight, cps))
        files.append({"file": fn, "size": size, "core": core})

    # интерфейс: латиница с пиньинем + кириллица
    golos = os.path.join(src, "GolosText[wght].ttf")
    fn, size, cps = make(TTFont(io.BytesIO(limit(golos, 400, 700))), LATIN + CYR, "golos")
    add("Golos Text", fn, size, "400 700", cps, True)
    fn, size, cps = make(os.path.join(src, "IBMPlexMono-Medium.ttf"), LATIN + CYR, "plexmono")
    add("IBM Plex Mono", fn, size, "500", cps, True)

    # иероглифы: части по частоте, вес 500–700 (переменный шрифт)
    chars = [l.split("\t")[0] for l in open(os.path.join(ROOT, "site", "data", "hw.txt"), encoding="utf-8")][1:]
    chars = [ord(c) for c in chars if len(c) == 1]
    noto = limit(os.path.join(src, "NotoSerifSC[wght].ttf"), 500, 700)
    bounds = [0] + CUTS + [len(chars)]
    for k in range(len(bounds) - 1):
        cps = chars[bounds[k]:bounds[k + 1]]
        if k == 0:
            cps = LATIN + CJK_PUNCT + cps
        fn, size, got = make(TTFont(io.BytesIO(noto)), cps, f"notoserifsc-{k}")
        add("Noto Serif SC", fn, size, "500 700", got, False)
        print(f"часть {k}: знаков {len(got)}, {size // 1024} КБ")

    with open(os.path.join(OUT, "fonts.css"), "w", encoding="utf-8") as fh:
        fh.write("/* Шрифты: Golos Text, IBM Plex Mono, Noto Serif SC — SIL Open Font License 1.1 */\n" + "\n".join(css) + "\n")
    with open(os.path.join(OUT, "files.json"), "w", encoding="utf-8") as fh:
        json.dump(files, fh)
    print("файлов", len(files), "всего КБ", sum(f["size"] for f in files) // 1024)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "raw", "fonts"))
