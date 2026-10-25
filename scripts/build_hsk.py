"""
Банк заданий экзамена HSK 3.0 (уровни 1–6).

    python scripts/build_hsk.py   → data/hsk/hsk1.txt … hsk6.txt и data/hsk/index.json

Источники:
  scripts/hsk/hskN.txt — свои задания (формат — src/core/hsk.ts parseBank). Проверяется, что в них только слова
    HSK 3.0 уровня ≤ N (или понятные по частям); печатаются только наши строки с незнакомыми словами.
  scripts/hsk/pics.txt — картинки к словам: из них сами собираются «верно ли подписана картинка» (1L1) и «слово → картинка» (1R1).
  dict/ex.json — предложения базы примеров 大БКРС (в терминал не печатаются): из тех, где все слова уровня ≤ N,
    собираются «составьте предложение» (W1) и «иероглиф по пиньиню» (W2) для уровней 2–3.
"""
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_courses import lexicon, segment, composed, NAMES  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(os.path.dirname(__file__), "hsk")
OUT = os.path.join(ROOT, "data", "hsk")
HANRUN = re.compile(r"[一-鿿]+")
EXTRA_OK = set("男 女 ★ 李明 小明 小张 小王 小李 上海 哈尔滨 海南 法国 马克 安娜 大卫 小刘 刘 氵 扌 儿 俄罗斯 张伟 李华 云南 西安 杭州 西湖 小林 短文 四川 陕西 生肖 十二生肖 林 赵 陈 小陈 吴 周 语病 神农 唐朝 伦敦 窑洞 双十一 张明".split()) | set("吧 啊 呢 吗 的 了 着 过 们 地 得 点儿".split())

MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def mark(syl):
    """ren2 → rén (правило: a/e, потом ou, иначе последняя гласная)."""
    m = re.match(r"^([a-zü:v]+?)(r?)([1-5])$", syl.replace("u:", "ü").replace("v", "ü"))
    if not m:
        return syl
    s, r, t = m.group(1) + m.group(2), "", int(m.group(3))
    if t == 5:
        return s
    if "a" in s:
        i = s.index("a")
    elif "e" in s:
        i = s.index("e")
    elif "ou" in s:
        i = s.index("o")
    else:
        i = max(s.rfind(v) for v in "iouü")
    if i < 0:
        return s
    return s[:i] + MARKS[s[i]][t - 1] + s[i + 1:]


def py_marked(py):
    return "".join(mark(x.split("/")[0]) for x in py.split())


def levels():
    lv, py, ru = {}, {}, {}
    for n in range(1, 7):
        for l in open(os.path.join(ROOT, "data", f"hsk3-{n}.tsv"), encoding="utf8").read().splitlines()[1:]:
            p = l.split("\t")
            lv.setdefault(p[0], n)
            py.setdefault(p[0], p[1] if len(p) > 1 else "")
            ru.setdefault(p[0], (p[2] if len(p) > 2 else "").split(";")[0].strip())
    return lv, py, ru


def check(text, known, lex):
    """Незнакомые слова в китайском тексте (кусок, который складывается из известных слов, понятен)."""
    ok = known | NAMES | EXTRA_OK
    bad = []
    for r in HANRUN.findall(text):
        if composed(r, ok):
            continue
        bad += [t for t in segment(r, lex) if t not in ok and not composed(t, ok)]
    return bad


def main():
    lex = lexicon()
    lv, py, ru_of = levels()
    pics = []
    for l in open(os.path.join(SRC, "pics.txt"), encoding="utf8"):
        if "|" in l and not l.startswith("#"):
            w, p = [x.strip() for x in l.split("|")]
            if w in lv:
                pics.append((w, p, lv[w]))
    corpus = []
    exf = os.path.join(ROOT, "dict", "ex.json")
    if os.path.exists(exf):
        corpus = json.load(open(exf, encoding="utf8"))
    os.makedirs(OUT, exist_ok=True)
    rnd = random.Random(11)
    index = []
    problems = 0
    for n in (1, 2, 3, 4, 5, 6):
        if not os.path.exists(os.path.join(SRC, f"hsk{n}.txt")):
            continue
        known = {w for w, x in lv.items() if x <= n}
        lines = [f"# HSK {n} (3.0): банк заданий, собран scripts/build_hsk.py — не править вручную"]
        path = os.path.join(SRC, f"hsk{n}.txt")
        own = open(path, encoding="utf8").read().splitlines() if os.path.exists(path) else []

        def add_own(own):
            nonlocal problems
            for l in own:
                s = l.strip()
                if not s or s.startswith("#") or s.startswith("=="):
                    lines.append(s)
                    continue
                zh = s.split("| =")[0]
                bad = check(zh, known, lex)
                if bad:
                    problems += 1
                    print(f"HSK{n}: незнакомые слова {' '.join(sorted(set(bad)))} в «{zh.strip()}»")
                lines.append(s)
        add_own(own)
        # картинки к словам уровня
        mine = [(w, p) for w, p, x in pics if x == n] or [(w, p) for w, p, x in pics if x <= n]
        allp = [(w, p) for w, p, x in pics if x <= n + 1]
        if n == 1:
            lines.append("== 1L1")
            for w, p in mine:
                if rnd.random() < 0.5:
                    lines.append(f"{p} | {w} | + | = {w} {py_marked(py[w])} — {ru_of[w]}")
                else:
                    o = rnd.choice([q for q in allp if q[1] != p and q[0] != w])
                    lines.append(f"{o[1]} | {w} | - | = {w} {py_marked(py[w])} — {ru_of[w]}; на картинке другое")
            lines.append("== 1R1")
            for w, p in mine:
                others = rnd.sample([q for q in allp if q[1] != p and q[0] != w], 2)
                opts = [p] + [q[1] for q in others]
                rnd.shuffle(opts)
                lines.append(f"{w} | {' '.join(opts)} | {opts.index(p) + 1} | = {w} {py_marked(py[w])} — {ru_of[w]}")
        # письмо: предложения базы, где все слова уровня ≤ n
        if 2 <= n <= 5 and corpus:
            order, write = [], []
            seen = set()
            for zh, ru, toks, _ in corpus:
                t = [x for x in toks.split() if x]
                words = [x for x in t if HANRUN.fullmatch(x)]
                if zh in seen or not words or any(x not in known for x in words):
                    continue
                seen.add(zh)
                core = [x for x in t if HANRUN.fullmatch(x)]
                # порядок слов: 4–6 слов, хотя бы два многосложных, без чисел, законченное предложение
                num = set("一二三四五六七八九十百千万两几零")
                lo, hi, clo, chi = {2: (4, 6, 6, 14), 3: (4, 6, 6, 14), 4: (5, 8, 9, 18), 5: (6, 9, 11, 22)}.get(n, (0, 0, 0, 0))
                if (lo <= len(core) <= hi and len(t) - len(core) <= 1 and clo <= len(zh) <= chi and zh[-1] in "。？！"
                        and sum(1 for x in core if len(x) >= 2) >= 2 and not any(set(x) <= num for x in core)
                        and (n < 4 or any(lv.get(x, 0) >= n - 1 for x in core))):
                    order.append(f"{' / '.join(core)} | = {ru.replace('|', '/')}")
                cand = [x for x in core if lv.get(x) == n and 1 <= len(x) <= 2 and py.get(x)] if n <= 3 else []
                if cand and len(zh) <= 18:
                    w = rnd.choice(cand)
                    if zh.count(w) == 1:
                        write.append(f"{zh.replace(w, '___')} | {w} | {py_marked(py[w])} | = {ru.replace('|', '/')}")
            rnd.shuffle(order)
            rnd.shuffle(write)
            if n <= 5:
                lines.append(f"== {n}W1")
                lines += order[:120]
            if n <= 3:
                lines.append(f"== {n}W2")
                lines += write[:120]
        # пополнение банка (25.10.2026) — в конце файла, чтобы номера прежних заданий (id в прогрессе) не сдвинулись
        more = os.path.join(SRC, f"hsk{n}-more.txt")
        if os.path.exists(more):
            add_own(open(more, encoding="utf8").read().splitlines())
        text = "\n".join(lines) + "\n"
        open(os.path.join(OUT, f"hsk{n}.txt"), "w", encoding="utf8", newline="\n").write(text)
        parts = {}
        cur = ""
        for l in lines:
            m = re.match(r"^==\s*(\d[LRW]\d)", l)
            if m:
                cur = m.group(1)
            elif cur and l and not l.startswith("#"):
                parts[cur] = parts.get(cur, 0) + 1
        index.append({"level": n, "file": f"hsk{n}.txt", "parts": parts})
        print(f"HSK{n}: заданий по частям", parts)
    json.dump(index, open(os.path.join(OUT, "index.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("строк с незнакомыми словами:", problems)


if __name__ == "__main__":
    main()
