"""
Состав иероглифов для «разбора на части»: из dictionary.txt проекта Make Me a Hanzi (LGPL-3.0, данные Unihan и CJKlib).

    python scripts/build_decomp.py [raw/mmah-dictionary.txt]  →  site/data/decomp.json

Берутся только иероглифы, для которых есть данные черт (site/data/strokes). Для каждого:
[разложение IDS, ключ, тип (p — пиктограмма, i — идеограмма, s — фоноидеограмма, "" — нет), смысловой компонент, звуковой компонент].
Английские подсказки (hint) не берём — в приложении всё по-русски.
"""
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
TYPES = {"pictographic": "p", "ideographic": "i", "pictophonetic": "s"}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "raw", "mmah-dictionary.txt")
    have = set()
    for f in glob.glob(os.path.join(ROOT, "site", "data", "strokes", "*.json")):
        have |= set(json.load(open(f, encoding="utf8")).keys())
    out = {}
    for line in open(src, encoding="utf8"):
        d = json.loads(line)
        ch = d["character"]
        if ch not in have:
            continue
        dec = d.get("decomposition") or ""
        if dec.startswith("？"):
            dec = ""
        ety = d.get("etymology") or {}
        t = TYPES.get(ety.get("type"), "")
        out[ch] = [dec, d.get("radical") or "", t, ety.get("semantic") or "", ety.get("phonetic") or ""]
    path = os.path.join(ROOT, "site", "data", "decomp.json")
    json.dump(out, open(path, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print("иероглифов:", len(out), "размер:", os.path.getsize(path))


if __name__ == "__main__":
    main()
