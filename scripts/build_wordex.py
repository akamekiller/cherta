"""
Примеры к словам для словаря (как в Trainchinese: у каждого слова — предложения с ним).
Источник — база примеров 大БКРС (raw/examples.gz, ~900 тыс. пар «китайский — русский»).

    python scripts/build_wordex.py [raw/examples.gz]   → dict/x/NNN.json (128 шардов, как статьи)

Предложение делится на слова по индексу словаря (самое длинное совпадение); к каждому слову словаря
берётся до PER предложений, где оно стоит отдельным словом: сначала законченные, средней длины, с коротким переводом.
Шард слова = код первого символа % 128 (dictShardOf), формат {слово: [[китайский, русский], …]}.
Печатает только числа.
"""
import gzip
import heapq
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
DICT = os.path.join(ROOT, "dict")
OUT = os.path.join(DICT, "x")
PER = 5
SHARDS = 128
HAN = re.compile(r"[㐀-鿿]")
CYR = re.compile(r"[А-Яа-яЁё]")
BAD = re.compile(r"[\[\]{}<>=@#*_|\\/A-Za-z0-9０-９~～\-—…·]|\.\.|。。|呵呵|哈哈|嘿嘿")
END = "。！？!?…」”"


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
    words = [l.split("\t", 1)[0] for l in open(os.path.join(DICT, "index.tsv"), encoding="utf8") if l.strip()]
    lex = set(words)
    # простые слова (HSK 1–6): чем их больше в предложении, тем оно полезнее ученику
    easy = set()
    for n in range(1, 7):
        for pre in ("hsk2", "hsk3"):
            f = os.path.join(ROOT, "data", f"{pre}-{n}.tsv")
            if os.path.exists(f):
                easy |= {l.split("\t")[0] for l in open(f, encoding="utf8").read().splitlines()[1:]}
    maxlen = 6
    best = {}  # слово → куча [(оценка, номер)]
    sents = []
    seen = set()
    for zh, ru in pairs(src):
        if zh in seen or BAD.search(zh) or BAD.search(ru) or not CYR.search(ru) or len(ru) > 100:
            continue
        n = sum(1 for c in zh if HAN.match(c))
        if not 4 <= n <= 28:
            continue
        seen.add(zh)
        # оценка: законченное предложение, длина около 12 знаков, короткий перевод
        sid = len(sents)
        i, toks, all_toks = 0, set(), []
        while i < len(zh):
            if not HAN.match(zh[i]):
                i += 1
                continue
            for L in range(min(maxlen, len(zh) - i), 0, -1):
                t = zh[i:i + L]
                if L == 1 or t in lex:
                    all_toks.append(t)
                    if t in lex:
                        toks.add(t)
                    i += L
                    break
        # оценка: законченное предложение, длина около 12 знаков, короткий перевод, простые слова
        simple = sum(1 for t in all_toks if t in easy) / max(1, len(all_toks))
        score = -abs(n - 12) * 0.5 - len(ru) / 40 + (4 if zh[-1] in END else 0) + 8 * simple
        sents.append((zh, ru))
        for t in toks:
            h = best.setdefault(t, [])
            if len(h) < PER:
                heapq.heappush(h, (score, sid))
            elif score > h[0][0]:
                heapq.heapreplace(h, (score, sid))
    os.makedirs(OUT, exist_ok=True)
    shards = [dict() for _ in range(SHARDS)]
    for w, h in best.items():
        shards[ord(w[0]) % SHARDS][w] = [list(sents[s]) for _, s in sorted(h, reverse=True)]
    total = 0
    for k, sh in enumerate(shards):
        with open(os.path.join(OUT, f"{k:03d}.json"), "w", encoding="utf8") as f:
            json.dump(sh, f, ensure_ascii=False, separators=(",", ":"))
        total += os.path.getsize(os.path.join(OUT, f"{k:03d}.json"))
    sys.path.insert(0, os.path.dirname(__file__))
    from build_dict import write_meta  # noqa: E402
    write_meta(DICT, {"wordex": 1})
    print("предложений:", len(sents), "слов с примерами:", len(best), "из", len(words), "размер, МБ:", round(total / 1e6, 1))


if __name__ == "__main__":
    main()
