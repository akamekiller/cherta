"""
Встроенные курсы упражнений: scripts/courses/hskN.txt (темы уроков и их слова) + hskN-text.txt (свои предложения и диалоги)
+ предложения из корпуса dict/ex.json, в которых все слова уже пройдены к этому уроку.

    python scripts/build_courses.py            → data/courses/hsk1.txt … и data/courses/index.json

Проверка: в своих предложениях и диалогах печатаются слова, которых ученик к этому уроку ещё не знает
(печатаются только наши собственные тексты, не данные БКРС).
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "courses"))
from lessons import load  # noqa: E402

HAN = re.compile(r"[㐀-鿿]")
# служебные и самые частые слова — известны с первого урока
BASE = set("的了吗呢吧啊我你他她们是不也都很这那有在一二三四五六七八九十个".replace("", " ").split())
# сочетания, которые сегментатор берёт целым словом, а ученик понимает по частям
COMPOSED = set("黄色 蓝色 绿色 这边 那边 外面 南方 河边 画画 每天 一杯 两杯 红色 白色 黑色 晴天 阴天 一点儿 好的 好玩 同事 走路 洗手 来到 这是 那是 这儿 那儿 哪儿 哪里 这里 那里 下面 上面 里面 前边 后边 这个 那个 这些 那些 不是 没有 一下 吃饭 一个 两个 几个 多大 怎么样 十五 二十 二十一 十九 四十 一日 九月 十月 星期一 星期三 什么时候 今年 明年".split())
NAMES = set("王明 李月 安娜 大卫 小王 小李 老王 王 李 张 马丁".split())
PER_LESSON = 10
# слова, которых нет в списке уровня, но без них не обойтись (说 в старом HSK 1 есть только в 说话)
EXTRA = {"说": ("shuo1", "говорить, сказать"), "足球": ("zu2 qiu2", "футбол"), "对": ("dui4", "верно, да; к, по отношению к"), "天": ("tian1", "день; небо"), "饭": ("fan4", "еда; варёный рис"), "车": ("che1", "машина"), "等": ("deng3", "ждать"), "头": ("tou2", "голова"), "风": ("feng1", "ветер")}


def tsv(path):
    out = {}
    for line in open(path, encoding="utf8").read().splitlines()[1:]:
        p = line.split("\t")
        if len(p) >= 3 and p[0]:
            out.setdefault(p[0], (p[1], p[2]))
    return out


def lexicon():
    words = set()
    for n in range(1, 7):
        for pre in ("hsk2", "hsk3"):
            f = os.path.join(ROOT, "data", f"{pre}-{n}.tsv")
            if os.path.exists(f):
                words |= set(tsv(f))
    idx = os.path.join(ROOT, "dict", "index.tsv")
    if os.path.exists(idx):
        for line in open(idx, encoding="utf8"):
            w = line.split("\t", 1)[0]
            if 1 < len(w) <= 4:
                words.add(w)
    return words | COMPOSED | NAMES


def segment(text, lex):
    out, i = [], 0
    while i < len(text):
        c = text[i]
        if not HAN.match(c):
            i += 1
            continue
        L = min(4, len(text) - i)
        while L > 1 and text[i:i + L] not in lex:
            L -= 1
        out.append(text[i:i + L])
        i += L
    return out


def composed(t, known):
    """Слово можно понять по частям: делится на уже известные слова (几岁 = 几 + 岁)."""
    ok = [True] + [False] * len(t)
    for i in range(len(t)):
        if ok[i]:
            for j in range(i + 1, len(t) + 1):
                if t[i:j] in known:
                    ok[j] = True
    return ok[len(t)]


def read_text(n):
    """Свои предложения и диалоги по урокам: {номер урока: [строки]}."""
    path = os.path.join(os.path.dirname(__file__), "courses", f"hsk{n}-text.txt")
    if not os.path.exists(path):
        return {}
    out, cur = {}, None
    for line in open(path, encoding="utf8").read().splitlines():
        m = re.match(r"^## (\d+)", line)
        if m:
            cur = out.setdefault(int(m.group(1)), [])
        elif cur is not None:
            cur.append(line.rstrip())
    return out


def zh_of(line):
    """Китайская часть строки своего текста (предложение или реплика диалога), иначе None."""
    if not line or line[0] in "@?#":
        return None
    zh = line.split("|")[0].strip()
    m = re.match(r"^[A-Za-zА-Яа-я]{1,3}[:：]\s*(.+)$", zh)
    if m:
        zh = m.group(1)
    return zh if HAN.search(zh) else None


def main():
    lex = lexicon()
    words_info = {}
    for n in range(1, 4):
        for k, v in tsv(os.path.join(ROOT, "data", f"hsk2-{n}.tsv")).items():
            words_info.setdefault(k, v)
    corpus = json.load(open(os.path.join(ROOT, "dict", "ex.json"), encoding="utf8"))
    toks = [[t for t in c[2].split() if HAN.search(t)] for c in corpus]
    known = set(BASE)
    used = set()
    os.makedirs(os.path.join(ROOT, "data", "courses"), exist_ok=True)
    index = []
    problems = 0
    for n in range(1, 4):
        title, lessons, sections = load(n)
        text = read_text(n)
        lines = [f"# {title}", f"#level: {n}",
                 f"#about: {len(lessons)} уроков по темам, {sum(len(w) for _, w in lessons)} слов старого HSK {n}. Предложения — свои и из базы примеров 大БКРС, только из пройденных слов.", ""]
        for i, (lt, ws) in enumerate(lessons, 1):
            known |= set(ws)
            if i in sections:
                lines.append(f"### {sections[i]}")
            lines.append(f"## {i}. {lt}")
            for w in ws:
                py, ru = words_info.get(w) or EXTRA[w]
                lines.append(f"+ {w} | {py} | {ru}")
            own = text.get(i, [])
            # проверка своих текстов: все слова должны быть уже пройдены
            for l in own:
                zh = zh_of(l)
                if not zh:
                    continue
                bad = [t for t in segment(zh, lex) if t not in known and t not in COMPOSED and t not in NAMES and not composed(t, known | NAMES)]
                if bad:
                    problems += 1
                    print(f"HSK{n} урок {i}: незнакомые слова {' '.join(bad)} в «{zh}»")
            own_sents = [l for l in own if l and not l.startswith(("@", "?")) and not re.match(r"^[A-Za-z]{1,3}[:：]", l)]
            own_zh = {l.split("|")[0].strip() for l in own_sents}
            lines += own_sents
            # корпус: есть слово урока, все слова известны, короткие выше
            wset = set(ws)
            cand = []
            for (zh, ru, _, _), t in zip(corpus, toks):
                if not t or zh in used or zh in own_zh or not ru:
                    continue
                hit = sum(1 for x in t if x in wset)
                if hit and all(x in known for x in t):
                    cand.append((-hit * 2 + len(zh) / 6 + len(ru) / 50, zh, ru))
            cand.sort()
            for _, zh, ru in cand[:PER_LESSON]:
                used.add(zh)
                lines.append(f"{zh.replace('|', '/')} | {ru.replace('|', '/')}")
            # диалоги — после предложений, через пустую строку
            dl, cur = [], []
            for l in own:
                if l.startswith("@"):
                    if cur:
                        dl.append(cur)
                    cur = [l]
                elif cur and l:
                    cur.append(l)
            if cur:
                dl.append(cur)
            for d in dl:
                lines += [""] + d
            lines.append("")
        fname = f"hsk{n}.txt"
        open(os.path.join(ROOT, "data", "courses", fname), "w", encoding="utf8", newline="\n").write("\n".join(lines) + "\n")
        index.append({"id": f"hsk{n}", "file": fname, "title": title, "level": n, "lessons": len(lessons),
                      "words": sum(len(w) for _, w in lessons),
                      "about": f"Для начинающих: {len(lessons)} уроков по темам, {sum(len(w) for _, w in lessons)} слов." if n == 1 else
                               f"{len(lessons)} уроков по темам, {sum(len(w) for _, w in lessons)} слов. Продолжение курса HSK {n - 1}."})
    index.append(build_life(corpus, toks, known, used))
    index.append(build_own("eng"))
    json.dump(index, open(os.path.join(ROOT, "data", "courses", "index.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("уроков:", sum(x["lessons"] for x in index), "проблем в своих текстах:", problems)


def build_own(key):
    """Курс, целиком написанный вручную (scripts/courses/<key>.txt): копируется как есть, в индекс — счётчики."""
    text = open(os.path.join(ROOT, "scripts", "courses", f"{key}.txt"), encoding="utf8").read()
    ls = text.splitlines()
    title = ls[0][2:].strip()
    level = int(next(l.split(":", 1)[1] for l in ls if l.startswith("#level:")))
    lessons = sum(1 for l in ls if l.startswith("## "))
    words = sum(1 for l in ls if l.startswith("+ "))
    open(os.path.join(ROOT, "data", "courses", f"{key}.txt"), "w", encoding="utf8", newline="\n").write(text)
    return {"id": key, "file": f"{key}.txt", "title": title, "level": level, "lessons": lessons, "words": words,
            "about": f"Для работы на производстве: {lessons} уроков, {words} терминов — ЧПУ и CAM, станки, чертежи, допуски, безопасность, диалоги «в цеху»."}


LIFE = [("Университет", "life-uni", ["d-teacher"]), ("Общежитие", "life-dorm", ["d-dorm"]),
        ("Магазин и рынок", "life-shop", ["d-shop", "d-canteen"]), ("Транспорт", "life-transport", ["d-taxi"]),
        ("Банк и связь", "life-bank", ["d-bank", "d-phone"]), ("Врач и аптека", "life-doctor", ["d-doctor"])]


def build_life(corpus, toks, known_hsk, used):
    """Курс «Жизнь в Китае»: колоды life-*, каждая на два урока; диалоги из data/dialogs.json; предложения корпуса."""
    dialogs = {d["id"]: d for d in json.load(open(os.path.join(ROOT, "data", "dialogs.json"), encoding="utf8"))}
    lines = ["# Жизнь в Китае", "#level: 3",
             "#about: Университет, общежитие, магазин, транспорт, банк, врач — слова и диалоги для жизни в Китае. Лучше после курса HSK 2.", ""]
    n_lessons = n_words = 0
    for title, deck, dl in LIFE:
        words = list(tsv(os.path.join(ROOT, "data", f"{deck}.tsv")).items())
        half = (len(words) + 1) // 2
        lines.append(f"### {title}")
        for part, chunk in enumerate((words[:half], words[half:]), 1):
            n_lessons += 1
            n_words += len(chunk)
            lines.append(f"## {n_lessons}. {title} — {part}")
            for w, (py, ru) in chunk:
                lines.append(f"+ {w} | {py} | {ru}")
            wset = {w for w, _ in chunk}
            ok = known_hsk | {w for w, _ in words}
            cand = []
            for (zh, ru, _, _), t in zip(corpus, toks):
                if not t or zh in used or not ru:
                    continue
                hit = sum(1 for x in t if x in wset)
                unknown = sum(1 for x in t if x not in ok)
                # бытовых предложений мало: допускаем одно незнакомое слово, но такие — ниже
                if hit and unknown <= 1 and len(t) >= 2:
                    cand.append((unknown * 5 - hit * 2 + len(zh) / 6 + len(ru) / 50, zh, ru))
            cand.sort()
            for _, zh, ru in cand[:PER_LESSON]:
                used.add(zh)
                lines.append(f"{zh.replace('|', '/')} | {ru.replace('|', '/')}")
            for did in (dl[:1] if part == 1 else dl[1:]):
                d = dialogs[did]
                lines += ["", f"@ {d['title']}"]
                lines += [f"{who}: {zh} | {ru}" for who, zh, ru in d["lines"]]
                lines += ["? " + q["q"] + " | " + " | ".join(o + ("*" if i == q["a"] else "") for i, o in enumerate(q["o"])) for q in d["q"]]
            lines.append("")
    open(os.path.join(ROOT, "data", "courses", "life.txt"), "w", encoding="utf8", newline="\n").write("\n".join(lines) + "\n")
    return {"id": "life", "file": "life.txt", "title": "Жизнь в Китае", "level": 3, "lessons": n_lessons, "words": n_words,
            "about": f"{n_lessons} уроков: университет, общежитие, магазин, транспорт, банк, врач. Лучше после курса HSK 2."}


if __name__ == "__main__":
    main()
