"""Японско-русский словарь WARODAI → dict/ja/ (публикуется вместе с китайским словарём в cherta-dict, publish-dict.ps1).

Запуск:  python scripts/build_ja_dict.py <warodai-source> [jmdict-eng-common.json]
  warodai-source — git clone https://github.com/warodai/warodai-source (папки 000…, по файлу на статью);
  jmdict-eng-common.json — из релизов github.com/scriptin/jmdict-simplified (CC BY-SA 4.0), только чтобы
  поднять частые слова выше в выдаче (признак common), текст из него не берётся.

Лицензия WARODAI — CC BY-NC-ND 3.0: только некоммерческое использование и без переделки текста.
Поэтому статьи кладутся целиком, как есть (текст файла без изменений), меняется только формат хранения (JSON).
В приложении — подпись и ссылка на лицензию. Если приложение станет платным, WARODAI нужно убрать.

Результат:
  index.tsv  — id \t каной (через «, ») \t написания (через «･») \t Поливанов \t кратко \t метка (N5/N4/частое)
               по убыванию важности: JLPT N5, N4 (наши колоды data/ja-n5.tsv, ja-n4.tsv), частые по JMdict, остальные;
  NNN.json   — 128 частей: {id: текст статьи}, часть = цифры id % 128;
  meta.json  — {v: хэш, count, shards}.
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dict", "ja")
SHARDS = 128
HDR = re.compile(r"^(.+?)(?:【(.+?)】)?\((.+?)\)(?:\s*\[[^\]]*\])?〔(\d{3}-\d{2}-\d{2})〕")
ROMAN = re.compile(r"(?<=[^A-Za-z])(?:IV|V?I{1,3}|V)$")


def clean(s):
    """Написание для поиска: без римских цифр омограмм и пробелов."""
    s = s.strip()
    return ROMAN.sub("", s).strip()


def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


TAG = re.compile(r"<[^>]+>")
ITAL = re.compile(r"<i>.*?</i>")


def short(body):
    """Краткое значение для списка: первый русский перевод статьи (обрезка, текст не меняется по смыслу)."""
    for line in body.split("\n"):
        s = ITAL.sub("", line)
        s = TAG.sub("", s)
        s = re.sub(r"\([^()а-яёА-ЯЁ]*\)", "", s)           # (тж. 不味い) без русского — убрать
        s = re.sub(r"^\s*(\d+[.)]|[а-я]\))\s*", "", s)       # 1) 1. а)
        s = re.sub(r"^\s*:?\s*[^а-яёА-ЯЁ]*?(?=[а-яёА-ЯЁ])", "", s) if not re.match(r"^\s*[а-яёА-ЯЁ]", s) else s
        s = s.strip(" ;,.:")
        if not re.search(r"[а-яёА-ЯЁ]", s):
            continue
        s = re.sub(r"\s+([,;.])", r"\1", re.sub(r"\s{2,}", " ", s))   # пробелы от убранных помет
        s = s.split(";")[0].strip(" ,.")
        if len(s) > 70:
            s = s[:70].rsplit(" ", 1)[0] + "…"
        return s
    # статья-отсылка («см. …») — первая строка без разметки
    first = TAG.sub("", body.strip().split("\n")[0]).strip(" ;,.")
    return first[:70]


def jlpt():
    out = {}
    for lv, f in (("N5", "ja-n5.tsv"), ("N4", "ja-n4.tsv")):
        p = os.path.join(ROOT, "data", f)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8").read().splitlines()[1:]:
            w, r = line.split("\t")[:2]
            for rd in r.split("/"):
                out.setdefault((w, hira(rd)), lv)
    return out


def common(path):
    kanji, kana = set(), set()
    if not path or not os.path.exists(path):
        return kanji, kana
    for w in json.load(open(path, encoding="utf-8"))["words"]:
        for k in w["kanji"]:
            if k["common"]:
                kanji.add(k["text"])
        if not w["kanji"]:
            for k in w["kana"]:
                if k["common"]:
                    kana.add(hira(k["text"]))
    return kanji, kana


def main(src, jm=None):
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".json") or f.endswith(".tsv"):
            os.remove(os.path.join(OUT, f))
    jl = jlpt()
    ck, cn = common(jm)
    rows, shards, bad = [], [dict() for _ in range(SHARDS)], 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in files:
            if not fn.endswith(".txt"):
                continue
            text = open(os.path.join(root, fn), encoding="utf-8").read()
            head, _, body = text.partition("\n")
            m = HDR.match(head.strip())
            if not m:
                bad += 1
                continue
            kana_s, kanji_s, pol, aid = m.groups()
            kana = [clean(x) for x in kana_s.split(",") if clean(x)]
            kanji = [clean(y) for x in (kanji_s or "").split(",") for y in x.split("･") if clean(y)]
            hk = [hira(k) for k in kana]
            tag, rank = "", 4
            for k in kanji or [kana[0]]:
                for r in hk:
                    lv = jl.get((k, r))
                    if lv:
                        tag, rank = lv, min(rank, 0 if lv == "N5" else 1)
            if not tag:
                if any(k in ck for k in kanji) or (not kanji and any(r in cn for r in hk)):
                    tag, rank = "частое", 2
            if "…" in kana_s:
                rank = 5
            rows.append((rank, len(hk[0]) if hk else 99, aid, ", ".join(kana), "･".join(dict.fromkeys(kanji)), pol.strip(), short(body), tag))
            shards[int(aid.replace("-", "")) % SHARDS][aid] = text
    rows.sort()
    with open(os.path.join(OUT, "index.tsv"), "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            fh.write("\t".join(x.replace("\t", " ") for x in r[2:]) + "\n")
    for n, sh in enumerate(shards):
        with open(os.path.join(OUT, f"{n:03d}.json"), "w", encoding="utf-8") as fh:
            json.dump(sh, fh, ensure_ascii=False, separators=(",", ":"))
    h = hashlib.sha1()
    for f in sorted(os.listdir(OUT)):
        if f != "meta.json":
            h.update(open(os.path.join(OUT, f), "rb").read())
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump({"v": h.hexdigest()[:10], "count": len(rows), "shards": SHARDS}, fh)
    tags = {}
    for r in rows:
        tags[r[7] or "-"] = tags.get(r[7] or "-", 0) + 1
    print("статей", len(rows), "не разобрано", bad, "без краткого", sum(1 for r in rows if not r[6]), "метки", tags)
    print("индекс КБ", os.path.getsize(os.path.join(OUT, "index.tsv")) // 1024,
          "всего КБ", sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) // 1024)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
