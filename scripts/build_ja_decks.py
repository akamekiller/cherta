"""
Японские колоды: кана и слова JLPT N5/N4.
    python scripts/build_ja_decks.py [папка src из open-anki-jlpt-decks]
Источник слов: github.com/jamsinclair/open-anki-jlpt-decks (MIT; исходно tanos.co.uk), src/n5.csv, src/n4.csv —
написание, чтение и метки (в т. ч. урок Genki). Русские значения — scripts/ja/nN-ru.txt (написаны Claude).
Результат: data/ja-hira.tsv, data/ja-kata.tsv, data/ja-n5.tsv, data/ja-n4.tsv (слово, чтение каной, значение)
и темы-уроки scripts/themes/ja-*.txt (по рядам годзюон; по урокам Genki) — их подхватывает build_themes.py.
Чтения через «/» — засчитываются все, первое показывается. Одно написание в колоде — одна карточка (чтения объединяются).
Проверка: у каждого знака должны быть японские данные черт (site/data/strokes-ja/chars.txt). Печатает только числа.
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "raw", "jlpt", "src")

# кана: (знак, русская запись по Поливанову, ромадзи)
ROWS = [
    ("а", "あいうえお", "а и у э о", "a i u e o"),
    ("ка", "かきくけこ", "ка ки ку кэ ко", "ka ki ku ke ko"),
    ("са", "さしすせそ", "са си су сэ со", "sa shi su se so"),
    ("та", "たちつてと", "та ти цу тэ то", "ta chi tsu te to"),
    ("на", "なにぬねの", "на ни ну нэ но", "na ni nu ne no"),
    ("ха", "はひふへほ", "ха хи фу хэ хо", "ha hi fu he ho"),
    ("ма", "まみむめも", "ма ми му мэ мо", "ma mi mu me mo"),
    ("я", "やゆよ", "я ю ё", "ya yu yo"),
    ("ра", "らりるれろ", "ра ри ру рэ ро", "ra ri ru re ro"),
    ("ва", "わをん", "ва о н", "wa wo n"),
    ("га", "がぎぐげご", "га ги гу гэ го", "ga gi gu ge go"),
    ("дза", "ざじずぜぞ", "дза дзи дзу дзэ дзо", "za ji zu ze zo"),
    ("да", "だぢづでど", "да дзи дзу дэ до", "da ji zu de do"),
    ("ба", "ばびぶべぼ", "ба би бу бэ бо", "ba bi bu be bo"),
    ("па", "ぱぴぷぺぽ", "па пи пу пэ по", "pa pi pu pe po"),
]
HIRA_TO_KATA = {chr(c): chr(c + 0x60) for c in range(0x3041, 0x3097)}


def kana_deck(kata):
    rows, themes = [], []
    for name, chars, ru, ro in ROWS:
        ks = [HIRA_TO_KATA[c] if kata else c for c in chars]
        for k, r, o in zip(ks, ru.split(), ro.split()):
            rows.append((k, k, f"{r} ({o})"))
        sec = "Основные знаки" if name in ("а", "ка", "са", "та", "на", "ха", "ма", "я", "ра", "ва") else "Звонкие и полузвонкие"
        themes.append((sec, f"Ряд {name}", ks))
    return rows, themes


def clean_reading(expr, r):
    r = re.sub(r"\(.*?\)", "", r).replace("～", "").replace("〜", "").strip()
    if r.endswith("する") and not expr.endswith("する"):
        r = r[:-2]
    return "/".join(x.strip() for x in re.split(r"[;、]", r) if x.strip())


def clean_expr(e):
    e = re.sub(r"\s*\(.*?\)", "", e)
    return re.split(r"[;、]", e)[0].replace("～", "").replace("〜", "").strip()


def jlpt_deck(level):
    over = {}
    for line in open(os.path.join(HERE, "ja", f"n{level}-ru.txt"), encoding="utf-8"):
        if line.startswith("#") or not line.strip():
            continue
        p = [x.strip() for x in line.rstrip("\n").split("|")]
        over[int(p[0])] = p[1:]
    src = list(csv.DictReader(open(os.path.join(SRC, f"n{level}.csv"), encoding="utf-8")))
    missing = [i for i in range(len(src)) if i not in over]
    if missing:
        sys.exit(f"n{level}: нет значений для строк {missing[:10]}")
    words, order, genki = {}, [], {}
    for i, r in enumerate(src):
        o = over[i]
        if o[0] == "-":
            continue
        han = o[1] if len(o) > 1 else clean_expr(r["expression"])
        reading = o[2] if len(o) > 2 else clean_reading(r["expression"], r["reading"])
        if not han or not reading:
            sys.exit(f"n{level}: строка {i} без написания или чтения")
        if han not in words:
            words[han] = {"r": [], "ru": []}
            order.append(han)
        w = words[han]
        for x in reading.split("/"):
            if x not in w["r"]:
                w["r"].append(x)
        if o[0] not in w["ru"]:
            w["ru"].append(o[0])
        m = re.search(r"Genki_Ln\.(\d+)", r["tags"])
        if m:
            genki.setdefault(han, int(m.group(1)))
    rows = [(h, "/".join(words[h]["r"]), "; ".join(words[h]["ru"])) for h in order]
    lessons = {}
    for h in order:
        if h in genki:
            lessons.setdefault(genki[h], []).append(h)
    themes = [("Genki I" if n <= 12 else "Genki II", f"Genki, урок {n}", ws) for n, ws in sorted(lessons.items())]
    return rows, themes


def write(deck_id, rows, themes, head):
    with open(os.path.join(ROOT, "data", f"{deck_id}.tsv"), "w", encoding="utf-8") as f:
        f.write("word\treading\tmeaning_ru\n")
        for r in rows:
            f.write("\t".join(r) + "\n")
    with open(os.path.join(HERE, "themes", f"{deck_id}.txt"), "w", encoding="utf-8") as f:
        f.write(f"# {head} (создано scripts/build_ja_decks.py, не править вручную)\n")
        sec = None
        for s, t, ws in themes:
            if s != sec:
                f.write(f"### {s}\n")
                sec = s
            f.write(f"{t}: {' '.join(ws)}\n")


def main():
    have = set(open(os.path.join(ROOT, "site", "data", "strokes-ja", "chars.txt"), encoding="utf-8").read())
    total_missing = 0
    for deck_id, (rows, themes), head in [
        ("ja-hira", kana_deck(False), "Хирагана по рядам"),
        ("ja-kata", kana_deck(True), "Катакана по рядам"),
        ("ja-n5", jlpt_deck(5), "JLPT N5: уроки Genki по меткам списка"),
        ("ja-n4", jlpt_deck(4), "JLPT N4: уроки Genki по меткам списка"),
    ]:
        miss = {c for h, _, _ in rows for c in h if c not in have}
        total_missing += len(miss)
        write(deck_id, rows, themes, head)
        print(deck_id, "слов", len(rows), "уроков Genki/рядов", len(themes), "знаков без данных черт", len(miss))
    if total_missing:
        sys.exit("есть знаки без данных черт")


if __name__ == "__main__":
    main()
