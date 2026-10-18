"""
Предложения для упражнений на перевод из базы примеров 大БКРС (examples.gz, bkrs.info).

python scripts/build_examples.py [raw/examples.gz]

Корпус предложений для упражнений. Берутся пары «китайский — русский», где все иероглифы встречаются в словах
HSK (старого 2.0 и нового 3.0, уровень слова — меньший из двух), уровень предложения — самый высокий из его слов.
Китайская часть делится на слова (самое длинное совпадение со словами HSK) — это плитки, пропуски и подсказки.
Результат: dict/ex.json (публикуется вместе со словарём в cherta-dict) — [[китайский, русский, "слово слово …", уровень], …],
до PER_LEVEL[n] предложений на уровень, сначала законченные предложения.
"""
import gzip
import json
import os
import random
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "dict")
PER_LEVEL = {1: 1500, 2: 2500, 3: 3500, 4: 3500, 5: 3500, 6: 3500}
HAN = re.compile(r"[㐀-鿿]")
CYR = re.compile(r"[А-Яа-яЁё]")
BAD = re.compile(r"[\[\]{}<>=@#*_|\\/A-Za-z]")
PUNCT = "，。？！、；：,.?!;:“”\"'（）() …—·"
LIMITS = {1: (2, 10), 2: (3, 12), 3: (4, 14), 4: (4, 18), 5: (5, 22), 6: (5, 26)}


def load_hsk():
    decks = json.load(open(os.path.join(ROOT, "data", "decks.json"), encoding="utf8"))
    level = {}
    for d in decks:
        m = re.match(r"hsk[23]-(\d)", d["id"])
        if not m:
            continue
        n = int(m.group(1))
        for l in open(os.path.join(ROOT, "data", d["file"]), encoding="utf8").read().splitlines()[1:]:
            w = l.split("\t")[0].strip()
            if w and (w not in level or n < level[w]):
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
        if zh in seen or BAD.search(zh) or BAD.search(ru) or not CYR.search(ru) or len(ru) > 110:
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
    out = []
    for n, items in found.items():
        rnd.shuffle(items)
        # сначала законченные предложения (с точкой, вопросом), потом словосочетания; внутри уровня — от коротких к длинным
        items.sort(key=lambda x: 0 if x["zh"][-1] in "。？！?!." else 1)
        pick = sorted(items[:PER_LEVEL[n]], key=lambda x: len(x["zh"]))
        out += [[x["zh"], x["ru"], " ".join(t for t in x["t"] if t.strip()), n] for x in pick]
        print(f"Уровень {n}: подходит {len(items)}, взято {len(pick)}")
    with open(os.path.join(OUT, "ex.json"), "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Всего: {len(out)}, {os.path.getsize(os.path.join(OUT, 'ex.json')) // 1024} КБ")
    # новая версия данных словаря (ex.json публикуется вместе с ним)
    sys.path.insert(0, os.path.dirname(__file__))
    from build_dict import write_meta
    write_meta(OUT, {})


if __name__ == "__main__":
    main()
