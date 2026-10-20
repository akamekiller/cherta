"""
Темы для готовых колод: колода делится на уроки-темы по 10–30 слов (как уроки по словам в учебнике).
    python scripts/build_themes.py → data/themes.json
Источники: scripts/themes/<id колоды>.txt и темы курсов HSK 1–3 (scripts/courses/hskN.txt) для колод старого HSK.
Формат: «### Раздел», «Тема: слово слово …» (тема больше 28 слов делится на уроки до 25). Слово идёт в первую тему, где встретилось; слова колоды без темы
сборка допишет блоками «Ещё слова» (печатает только числа).
"""
import json
import os
import sys

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(HERE, "courses"))


def read_theme_file(path):
    out, sec = [], ""
    for line in open(path, encoding="utf8"):
        line = line.strip()
        if line.startswith("### "):
            sec = line[4:].strip()
        elif ":" in line and not line.startswith("#"):
            t, ws = line.split(":", 1)
            out.append((sec, t.strip(), ws.split()))
    return out


def deck_words(deck_id):
    return [l.split("\t")[0] for l in open(os.path.join(ROOT, "data", f"{deck_id}.tsv"), encoding="utf8").read().splitlines()[1:] if l.strip()]


def build(deck_id, themes):
    words = deck_words(deck_id)
    have, seen, out = set(words), set(), []
    for sec, title, ws in themes:
        x = [w for w in ws if w in have and w not in seen]
        if x:
            seen |= set(x)
            # большая тема делится на уроки поровну, не больше 25 слов (Чувства 1, Чувства 2)
            k = -(-len(x) // 25) if len(x) > 28 else 1
            for j in range(k):
                part = x[j * len(x) // k:(j + 1) * len(x) // k]
                # «Чувства 1»; если название уже кончается числом («Genki, урок 2») — «Genki, урок 2 · часть 1»
                name = title if k == 1 else f"{title} · часть {j + 1}" if title[-1:].isdigit() else f"{title} {j + 1}"
                out.append({"s": sec, "t": name, "w": part})
    rest = [w for w in words if w not in seen]
    for i in range(0, len(rest), 20):
        out.append({"s": "Другие слова", "t": f"Ещё слова {i // 20 + 1}", "w": rest[i:i + 20]})
    print(deck_id, "слов", len(words), "тем", len(out), "без темы", len(rest))
    return out


def main():
    res = {}
    for f in sorted(os.listdir(os.path.join(HERE, "themes"))):
        if f.endswith(".txt"):
            res[f[:-4]] = build(f[:-4], read_theme_file(os.path.join(HERE, "themes", f)))
    from lessons import load  # noqa: E402
    for n in (1, 2, 3):
        _, lessons, sections = load(n)
        sec, th = "", []
        for i, (t, ws) in enumerate(lessons, 1):
            sec = sections.get(i, sec)
            th.append((sec, t, ws))
        res[f"hsk2-{n}"] = build(f"hsk2-{n}", th)
    json.dump(res, open(os.path.join(ROOT, "data", "themes.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
