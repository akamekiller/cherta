"""
Колоды старого HSK 2.0 (уровни 1–6: 150 / 150 / 300 / 600 / 1300 / 2500 слов, по ним написаны учебники Standard Course).

python scripts/build_hsk2.py <папка complete-hsk-vocabulary> [dict/]

Слова и пиньинь — github.com/drkameleon/complete-hsk-vocabulary (MIT), wordlists/exclusive/old/N.json.
Для слов, которые есть в колодах HSK 3.0, пиньинь и русское значение берутся оттуда (там уже исправлены
многозначные иероглифы). Остальным: чтение выбирается по словарю 大БКРС (если в списке несколько),
значение — первое русское значение статьи БКРС. Результат: data/hsk2-N.tsv.
"""
import glob
import html
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.join(os.path.dirname(__file__), "..")
GLOSS = 70


def numeric(s: str) -> str:
    s = s.strip().lower().replace("u:", "v").replace("ü", "v")
    # «yi1fu5» → «yi1 fu5»; нейтральный тон без цифры не встречается в списке
    return re.sub(r"(\d)(?=[a-z])", r"\1 ", s)


def load_ours():
    ours = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "hsk3-*.tsv"))):
        for line in open(f, encoding="utf8").read().splitlines()[1:]:
            p = line.split("\t")
            if len(p) >= 3 and p[0]:
                ours.setdefault(p[0], (p[1], p[2]))
    return ours


MARKS = {"\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4}


def bkrs_as(form: str, reading: str):
    """Чтение БКРС («hǎochù») в разбиении формы списка («hao3 chu4») → «hao3 chu4» с тонами БКРС или None, если буквы не совпали."""
    letters, tones = "", []
    for ch in unicodedata.normalize("NFD", reading.lower()):
        if ch in MARKS and letters:
            tones.append((len(letters) - 1, MARKS[ch]))
        elif ch == "\u0308":
            letters = letters[:-1] + "v" if letters.endswith("u") else letters
        elif "a" <= ch <= "z":
            letters += ch
    sylls = [re.sub(r"\d", "", x) for x in form.split()]
    if "".join(sylls) != letters:
        return None
    out, pos = [], 0
    for sy in sylls:
        t = [tn for i, tn in tones if pos <= i < pos + len(sy)]
        out.append(f"{sy}{t[-1] if t else 5}")
        pos += len(sy)
    return " ".join(out)


def plain(h: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", h))).strip()


def first_meaning(rows):
    """Первое русское значение статьи без помет и пиньиня, до GLOSS символов по границе «;» или «,»."""
    for r in rows:
        if len(r) == 3:
            continue
        t = re.sub(r'<span class="(lb|c)">.*?</span>|<b>.*?</b>', "", r[1])
        t = plain(t)
        t = re.sub(r"^[\s,;.*]*(\d+\)|[а-я]\))?[\s,;.*]*", "", t).strip()
        if not re.search(r"[А-Яа-яЁё]{2,}", t):
            continue
        if len(t) > GLOSS:
            cut = max(t.rfind(";", 0, GLOSS), t.rfind(",", 0, GLOSS))
            t = t[:cut] if cut > 10 else t[:GLOSS].rstrip() + "…"
        return t.strip(" ,;")
    return ""


def main():
    src = sys.argv[1]
    dict_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "dict")
    sys.path.insert(0, os.path.dirname(__file__))
    ours = load_ours()
    shards = {}

    def article(word):
        n = ord(word[0]) % 128
        if n not in shards:
            shards[n] = json.load(open(os.path.join(dict_dir, f"{n:03d}.json"), encoding="utf8"))
        return shards[n].get(word)

    stats = {"из HSK 3.0": 0, "из БКРС": 0, "без значения": 0}
    seen = set()
    for level in range(1, 7):
        rows = []
        for e in json.load(open(os.path.join(src, "wordlists", "exclusive", "old", f"{level}.json"), encoding="utf8")):
            w = e["simplified"].strip()
            if not w or w in seen or not re.fullmatch(r"[㐀-鿿]+", w):
                continue
            seen.add(w)
            if w in ours:
                py, ru = ours[w]
                stats["из HSK 3.0"] += 1
            else:
                forms = [numeric(f["transcriptions"]["numeric"]) for f in e["forms"]]
                art = article(w)
                py = forms[0]
                if art and len(set(forms)) > 1:
                    # из нескольких чтений списка берём то, что БКРС даёт первым (с его тонами)
                    first = re.split(r"[,;]", art["p"])[0].strip()
                    for f in forms:
                        b = bkrs_as(f, first)
                        if b and b in forms:
                            py = b
                            break
                ru = first_meaning(art["r"]) if art else ""
                if ru:
                    stats["из БКРС"] += 1
                else:
                    stats["без значения"] += 1
                    continue
            if len(py.split()) != len(w) and not w.endswith("儿"):
                continue
            rows.append(f"{w}\t{py}\t{ru}")
        with open(os.path.join(ROOT, "data", f"hsk2-{level}.tsv"), "w", encoding="utf8", newline="\n") as f:
            f.write("word\tpinyin\tmeaning_ru\n" + "\n".join(rows) + "\n")
        print(f"HSK 2.0 уровень {level}: {len(rows)} слов")
    print(stats)


if __name__ == "__main__":
    main()
