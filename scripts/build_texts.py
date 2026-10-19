"""
Тексты для чтения по уровню (свои, написаны для приложения): scripts/texts/texts.txt → data/texts.json.

    python scripts/build_texts.py

Формат: «=== уровень | название», строки «китайский | русский», «? вопрос | вариант | верный*».
Проверка: в тексте уровня N только слова старого HSK 1…N (и пройденные в курсах вспомогательные слова);
печатаются только наши собственные тексты.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_courses import lexicon, segment, composed, tsv, COMPOSED, NAMES, BASE, EXTRA  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")


def main():
    lex = lexicon()
    levels = {n: set(tsv(os.path.join(ROOT, "data", f"hsk2-{n}.tsv"))) for n in (1, 2, 3, 4)}
    texts, cur = [], None
    for line in open(os.path.join(os.path.dirname(__file__), "texts", "texts.txt"), encoding="utf8").read().splitlines():
        line = line.strip()
        m = re.match(r"^===\s*(\d+)\s*\|\s*(.+)$", line)
        if m:
            cur = {"level": int(m.group(1)), "title": m.group(2).strip(), "words": [], "lines": [], "q": []}
            texts.append(cur)
        elif line.startswith("+") and cur:
            cur["words"].append([x.strip() for x in line[1:].split("|")])
        elif line.startswith("?") and cur:
            q, *opts = [x.strip() for x in line[1:].split("|")]
            a = next(i for i, o in enumerate(opts) if o.endswith("*"))
            cur["q"].append({"q": q, "o": [o.rstrip("*").strip() for o in opts], "a": a})
        elif "|" in line and cur:
            zh, ru = [x.strip() for x in line.split("|", 1)]
            cur["lines"].append([zh, ru])
    bad = 0
    for i, t in enumerate(texts):
        t["id"] = f"t{i + 1}"
        known = set(BASE) | set(EXTRA) | {"不一样", "样"} | {w[0] for w in t["words"]} | set().union(*[levels[n] for n in range(1, t["level"] + 1)])
        ok = known | NAMES | set(COMPOSED)
        for zh, _ in t["lines"]:
            # кусок без знаков препинания, который целиком складывается из известных слов, понятен (新手机 = 新 + 手机)
            runs = re.findall(r"[\u4e00-\u9fff]+", zh)
            unk = [w for r in runs if not composed(r, ok) for w in segment(r, lex) if w not in ok and not composed(w, ok)]
            if unk:
                bad += 1
                print(f"{t['title']}: {' '.join(unk)} в «{zh}»")
    json.dump(texts, open(os.path.join(ROOT, "data", "texts.json"), "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print("текстов:", len(texts), "строк с незнакомыми словами:", bad)


if __name__ == "__main__":
    main()
