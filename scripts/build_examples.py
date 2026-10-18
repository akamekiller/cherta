"""
Предложения для упражнений на перевод из базы примеров 大БКРС (examples.gz, bkrs.info).

python scripts/build_examples.py [raw/examples.gz]

Для каждого уровня HSK берутся пары «китайский — русский», где все иероглифы встречаются в словах HSK этого
уровня и ниже, и есть хотя бы одно слово именно этого уровня. Китайская часть делится на слова (самое длинное
совпадение со словами HSK) — из них собираются плитки для упражнения «собери перевод».
Результат: site/data/ex/hskN.json — [{"zh", "ru", "t": [слова]}], до PER_LEVEL штук, сначала законченные предложения, по длине.
"""
import gzip
import json
import os
import random
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "site", "data", "ex")
PER_LEVEL = 400
HAN = re.compile(r"[㐀-鿿]")
CYR = re.compile(r"[А-Яа-яЁё]")
BAD = re.compile(r"[\[\]{}<>=@#*_|\\/A-Za-z]")
PUNCT = "，。？！、；：,.?!;:“”\"'（）() …—·"
LIMITS = {1: (2, 10), 2: (3, 12), 3: (4, 14), 4: (4, 18), 5: (5, 22), 6: (5, 26)}


def load_hsk():
    decks = json.load(open(os.path.join(ROOT, "data", "decks.json"), encoding="utf8"))
    level = {}
    for d in decks:
        m = re.match(r"hsk3-(\d)", d["id"])
        if not m:
            continue
        n = int(m.group(1))
        for l in open(os.path.join(ROOT, "data", d["file"]), encoding="utf8").read().splitlines()[1:]:
            w = l.split("\t")[0].strip()
            if w and w not in level:
                level[w] = n
    return level


def segment(text, words, maxlen):
    out, i = [], 0
    while i < len(text):
        ch = text[i]
        if not HAN.match(ch):
            if ch.strip() and ch not in PUNCT:
                out.append(ch)
            elif ch.strip() and out is not None:
                out.append(ch)
            i += 1
            continue
        for L in range(min(maxlen, len(text) - i), 0, -1):
            if text[i:i + L] in words or L == 1:
                out.append(text[i:i + L])
                i += L
                break
    return out


def pairs(path):
    with gzip.open(path, "rt", encoding="utf-8-sig") as f:
        zh = None
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                zh = None
                continue
            if not line.startswith((" ", "\t")):
                zh = line.strip()
            elif zh:
                yield zh, line.strip()
                zh = None


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "raw", "examples.gz")
    level = load_hsk()
    maxlen = max(len(w) for w in level)
    chars_upto = {n: set() for n in range(1, 7)}
    for w, n in level.items():
        for m in range(n, 7):
            chars_upto[m].update(w)
    found = {n: [] for n in range(1, 7)}
    seen = set()
    for zh, ru in pairs(src):
        if zh in seen or BAD.search(zh) or BAD.search(ru) or not CYR.search(ru) or len(ru) > 90:
            continue
        han = [c for c in zh if HAN.match(c)]
        if not han:
            continue
        need = max((min((n for n in range(1, 7) if c in chars_upto[n]), default=9) for c in han), default=9)
        if need > 6:
            continue
        lo, hi = LIMITS[need]
        if not lo <= len(han) <= hi:
            continue
        toks = segment(zh, level, maxlen)
        words = [t for t in toks if HAN.match(t[0])]
        # хотя бы одно слово этого уровня; все слова — из HSK не выше уровня (одиночные иероглифы допускаем)
        lv = [level.get(t, 0) for t in words]
        if need not in lv or any(x > need for x in lv) or len(words) < 3:
            continue
        seen.add(zh)
        found[need].append({"zh": zh, "ru": ru, "t": toks})
    os.makedirs(OUT, exist_ok=True)
    rnd = random.Random(7)
    for n, items in found.items():
        rnd.shuffle(items)
        # сначала законченные предложения (с точкой, вопросом), потом словосочетания; выбранное — от коротких к длинным
        items.sort(key=lambda x: 0 if x["zh"][-1] in "。？！?!." else 1)
        pick = sorted(items[:PER_LEVEL], key=lambda x: len(x["zh"]))
        with open(os.path.join(OUT, f"hsk{n}.json"), "w", encoding="utf8") as f:
            json.dump(pick, f, ensure_ascii=False, separators=(",", ":"))
        print(f"HSK {n}: подходит {len(items)}, взято {len(pick)}")


if __name__ == "__main__":
    main()
