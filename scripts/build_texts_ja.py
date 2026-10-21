"""
Японские тексты для чтения (свои, написаны для приложения): scripts/texts/texts-ja.txt → data/texts-ja.json.

    python scripts/build_texts_ja.py

Формат как у китайских, уровень 5 — JLPT N5, 4 — N4. Японский текст — словами через пробел, у слов с кандзи
чтение в [скобках]. Проверки: у каждого слова с кандзи есть чтение; все кандзи текста встречаются в словах колод
JLPT уровня текста и проще (data/ja-n5.tsv, ja-n4.tsv) или в новых словах текста («+»). Печатаются только наши тексты.
"""
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
KANJI = re.compile(r"[一-鿿々]")
# названия городов и устойчивые фразы: 東京, 京都, お願いします
ALLOW = set("京都願")


def deck_kanji(name):
    out = set()
    for line in open(os.path.join(ROOT, "data", f"ja-{name}.tsv"), encoding="utf8").read().splitlines()[1:]:
        out |= set(KANJI.findall(line.split("\t")[0]))
    return out


def main():
    known = {5: deck_kanji("n5")}
    known[4] = known[5] | deck_kanji("n4")
    texts, cur = [], None
    for line in open(os.path.join(os.path.dirname(__file__), "texts", "texts-ja.txt"), encoding="utf8").read().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^===\s*(\d+)\s*\|\s*(.+)$", line)
        if m:
            cur = {"level": int(m.group(1)), "title": m.group(2).strip(), "words": [], "lines": [], "q": [], "lang": "ja"}
            texts.append(cur)
        elif line.startswith("+"):
            cur["words"].append([x.strip() for x in line[1:].split("|")])
        elif line.startswith("?"):
            q, *opts = [x.strip() for x in line[1:].split("|")]
            assert sum(o.endswith("*") for o in opts) == 1, f"{cur['title']}: {q}"
            a = next(i for i, o in enumerate(opts) if o.endswith("*"))
            cur["q"].append({"q": q, "o": [o.rstrip("*").strip() for o in opts], "a": a})
        elif "|" in line:
            ja, ru = [x.strip() for x in line.split("|", 1)]
            cur["lines"].append([ja, ru])
    bad = 0
    for i, t in enumerate(texts):
        t["id"] = f"j{i + 1}"
        ok = known[t["level"]] | ALLOW | {c for w in t["words"] for c in KANJI.findall(w[0])}
        for ja, ru in t["lines"]:
            assert ru, f"{t['title']}: нет перевода"
            for part in ja.split():
                word = re.sub(r"\[.*?\]", "", part)
                if KANJI.search(word) and "[" not in part:
                    bad += 1
                    print(f"{t['title']}: нет чтения у «{part}»")
                unk = [c for c in KANJI.findall(word) if c not in ok]
                if unk:
                    bad += 1
                    print(f"{t['title']}: кандзи не из колод уровня — {''.join(unk)} в «{word}»")
    json.dump(texts, open(os.path.join(ROOT, "data", "texts-ja.json"), "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print("текстов:", len(texts), "замечаний:", bad)


if __name__ == "__main__":
    main()
