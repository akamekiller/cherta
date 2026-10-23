"""
Банк устной части HSKK.

    python scripts/build_hskk.py   → data/hsk/hskk.txt

scripts/hsk/hskk.txt — свои задания (формат — src/core/hskk.ts parseOral). Проверяется, что в китайском тексте только слова
HSK 3.0: уровень 1 (初级) — до 2, уровень 2 (中级) — до 4, уровень 3 (高级) — до 6; печатаются только наши строки с незнакомыми словами.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_courses import lexicon  # noqa: E402
from build_hsk import levels, check  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(os.path.dirname(__file__), "hsk", "hskk.txt")
OUT = os.path.join(ROOT, "data", "hsk", "hskk.txt")
LIMIT = {1: 2, 2: 4, 3: 6}
HAN = re.compile(r"[一-鿿]")


def main():
    lex = lexicon()
    lv, _, _ = levels()
    lines, level, n, problems = [], 1, 0, 0
    for raw in open(SRC, encoding="utf8").read().splitlines():
        s = raw.strip()
        m = re.match(r"^==\s*([123])\s+\w+", s)
        if m:
            level = int(m.group(1))
        elif s and not s.startswith("#"):
            n += 1
            known = {w for w, x in lv.items() if x <= LIMIT[level]}
            fields = s.split("| =")[0].split("|")
            for f in fields:
                if not HAN.search(f) or re.fullmatch(r"[\s\U0001F000-\U0001FFFF‍️]+", f.strip()):
                    continue
                if f.strip() == "":
                    continue
                bad = check(f.strip(), known, lex)
                if bad:
                    problems += 1
                    print(f"HSKK {level}: незнакомые слова {' '.join(sorted(set(bad)))} в «{f.strip()[:40]}»")
        lines.append(s)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf8", newline="\n").write("\n".join(lines) + "\n")
    print(f"HSKK: строк {n}, с незнакомыми словами {problems}")


if __name__ == "__main__":
    main()
