"""
Сборка словаря из базы 大БКРС (bkrs.info, «базы можно использовать свободно в любых целях»).

python scripts/build_dict.py raw/dabkrs.gz [путь/к/jieba/dict.txt]

Из 3,4 млн статей берём употребительные: слова из частотного словаря jieba (MIT) с частотой >= MIN_FREQ,
все слова колод HSK и все отдельные иероглифы, для которых есть данные черт.

Результат в dict/ (в Git основного проекта не входит, публикуется отдельно: scripts/publish-dict.ps1):
  index.tsv     — по строке на слово: слово \t пиньинь \t краткое значение (по убыванию частоты)
  NNN.json      — статьи, шард = код первого символа % SHARDS
  meta.json     — версия данных (хэш), число статей
Статья: {"p": пиньинь, "r": [[уровень, html] | [уровень, html, пример_по-китайски]]}
html — только <i>, <b>, <span class="lb|c">, <a data-w>, всё остальное экранировано.
"""
import gzip
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "dict")  # публикуется в репозиторий cherta-dict: scripts/publish-dict.ps1
SHARDS = 128
MIN_FREQ = 5
MAX_EX_PER_SENSE = 4
MAX_ROWS = 140
GLOSS = 48

TAG = re.compile(r"(?<!\\)\[(/?)(m\d?|p|i|c|b|ref|ex|\*|trn|com|lang[^\]]*|sup|sub|u|s)\]")
CYR = re.compile(r"[А-Яа-яЁё]")
HAN = re.compile(r"[\u3400-\u9fff]")


def load_entries(path):
    with gzip.open(path, "rt", encoding="utf-8-sig") as f:
        text = f.read()
    for block in text.split("\n\n"):
        lines = block.strip("\n").split("\n")
        if len(lines) < 3 or lines[0].startswith("#"):
            continue
        head = lines[0].strip()
        py = lines[1].strip()
        body = " ".join(l.strip() for l in lines[2:])
        yield head, ("" if py in ("_", "--") else py), body


def to_html(s):
    """DSL-разметка → безопасный HTML."""
    out, pos = [], 0
    for m in TAG.finditer(s):
        out.append(html.escape(s[pos:m.start()], quote=False))
        pos = m.end()
        close, name = m.group(1) == "/", m.group(2)
        if name == "i":
            out.append("</i>" if close else "<i>")
        elif name == "b":
            out.append("</b>" if close else "<b>")
        elif name == "p":
            out.append("</span>" if close else '<span class="lb">')
        elif name == "c":
            out.append("</span>" if close else '<span class="c">')
        elif name == "ref":
            out.append("\x00" if close else "\x01")
        # прочие теги просто убираем
    out.append(html.escape(s[pos:], quote=False))
    res = "".join(out)
    res = re.sub(r"\x01(.*?)\x00", lambda m: f'<a data-w="{html.escape(m.group(1))}">{m.group(1)}</a>', res)
    res = res.replace("\x00", "").replace("\x01", "")
    res = re.sub(r"\\([\[\]\\(){}~@^])", r"\1", res)  # экранирование DSL: \[ → [
    return balance(re.sub(r"\s+", " ", res).strip())


HTML_TAG = re.compile(r"<(/?)(i|b|span|a)\b[^>]*>")


def balance(h):
    """Убирает лишние закрывающие теги и закрывает незакрытые (разметка БКРС бывает разорвана между строками)."""
    out, stack, pos = [], [], 0
    for m in HTML_TAG.finditer(h):
        out.append(h[pos:m.start()])
        pos = m.end()
        close, name = m.group(1) == "/", m.group(2)
        if not close:
            stack.append(name)
            out.append(m.group(0))
        elif name in stack:
            while stack:  # закрываем вложенные до нужного
                t = stack.pop()
                out.append(f"</{t}>")
                if t == name:
                    break
    out.append(h[pos:])
    out.extend(f"</{t}>" for t in reversed(stack))
    res = "".join(out)
    return re.sub(r"<(i|b|span)[^>]*>\s*</\1>", "", res).strip()


def plain(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", h))).strip()


def split_example(inner):
    """«学习计划 учебный план» → китайская часть до последнего пробела перед первой русской буквой."""
    m = CYR.search(re.sub(r"\[[^\]]*\]", lambda t: " " * len(t.group(0)), inner))
    if not m:
        return inner, ""
    cut = inner.rfind(" ", 0, m.start())
    if cut <= 0:
        return inner, ""
    return inner[:cut], inner[cut + 1:]


def segments(body):
    """Блоки [mN]…[/m] и текст между ними (в части статей основное значение стоит вне [m])."""
    pos = 0
    for m in re.finditer(r"\[m(\d)\](.*?)\[/m\]", body):
        gap = body[pos:m.start()]
        pos = m.end()
        if useful(gap):
            yield 1, gap.strip()
        if useful(m.group(2)):
            yield int(m.group(1)), m.group(2)
    if useful(body[pos:]):
        yield 1, body[pos:].strip()


def useful(s):
    """Не пусто и не разделитель «-----»."""
    return bool(re.search(r"[^\s\-—_.,;]", TAG.sub("", s)))


def parse_body(body):
    rows = []
    ex_in_sense = 0
    for lvl, raw in segments(body):
        if "[ex]" in raw:
            inner = re.sub(r"\[/?\*\]", "", raw)
            inner = re.sub(r"\[/?ex\]", "", inner).strip()
            ex_in_sense += 1
            if ex_in_sense > MAX_EX_PER_SENSE:
                continue
            # «学习计划 учебный план»: китайская часть — до первого пробела перед русским текстом
            zh_raw, ru_raw = split_example(inner)
            zh = plain(to_html(zh_raw))
            if CYR.search(zh):  # не смогли разделить — показываем как есть
                rows.append([lvl, to_html(inner)])
            else:
                rows.append([lvl, to_html(ru_raw), zh])
        else:
            ex_in_sense = 0
            h = to_html(raw)
            if h:
                rows.append([lvl, h])
        if len(rows) >= MAX_ROWS:
            break
    if rows:
        top = min(r[0] for r in rows)
        for r in rows:
            r[0] -= top
    return rows


def gloss(rows):
    for r in rows:
        if len(r) == 3:
            continue
        # без пометок (гл., сущ.), пиньиня в <b> и нумерации
        t = re.sub(r'<span class="(lb|c)">.*?</span>|<b>.*?</b>', "", r[1])
        t = plain(t)
        t = re.sub(r"^[\s,;.*]*(\d+\)|[а-я]\))?[\s,;.*]*", "", t).strip()
        if not re.search(r"[А-Яа-яЁё]{2,}", t):
            continue
        return t if len(t) <= GLOSS else t[: GLOSS - 1].rstrip(" ,;") + "…"
    return ""


def write_meta(out, extra):
    """meta.json: версия = хэш всех файлов папки (кроме самой meta). По ней приложение и service worker
    понимают, что данные пересобраны. Вызывается и из build_examples.py после ex.json."""
    h = hashlib.sha1()
    # все файлы, включая подпапки (x/ — примеры к словам)
    for dirpath, dirs, files in sorted(os.walk(out)):
        dirs.sort()
        for f in sorted(files):
            if f != "meta.json" or dirpath != out:
                h.update(os.path.relpath(os.path.join(dirpath, f), out).encode())
                h.update(open(os.path.join(dirpath, f), "rb").read())
    path = os.path.join(out, "meta.json")
    old = json.load(open(path, encoding="utf8")) if os.path.exists(path) else {}
    with open(path, "w", encoding="utf8") as f:
        json.dump({**old, **extra, "v": h.hexdigest()[:10]}, f)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "raw", "dabkrs.gz")
    jieba = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "raw", "jieba-dict.txt")
    freq = {}
    for l in open(jieba, encoding="utf8"):
        parts = l.split(" ")
        if len(parts) >= 2:
            freq[parts[0]] = int(parts[1])
    hsk = {}
    for d in json.load(open(os.path.join(ROOT, "data", "decks.json"), encoding="utf8")):
        for l in open(os.path.join(ROOT, "data", d["file"]), encoding="utf8").read().splitlines()[1:]:
            w = l.split("\t")[0].strip()
            if w:
                hsk.setdefault(w, len(hsk))
    chars = set()
    sdir = os.path.join(ROOT, "site", "data", "strokes")
    for f in os.listdir(sdir):
        if f.endswith(".json"):
            chars.update(json.load(open(os.path.join(sdir, f), encoding="utf8")).keys())

    picked = {}
    for head, py, body in load_entries(src):
        if not HAN.search(head):
            continue
        if not (head in hsk or freq.get(head, 0) >= MIN_FREQ or (len(head) == 1 and head in chars)):
            continue
        rows = parse_body(body)
        if not rows or (head not in hsk and not any(CYR.search(r[1]) for r in rows)):
            continue  # статьи только на английском пропускаем
        picked[head] = {"p": py, "r": rows}

    # статьи, на которые ссылаются отобранные («см. …»), — тоже берём (второй проход, один уровень)
    targets = {html.unescape(t) for e in picked.values() for r in e["r"] for t in re.findall(r'data-w="([^"]+)"', r[1])}
    targets -= picked.keys()
    added = 0
    for head, py, body in load_entries(src):
        if head in targets:
            rows = parse_body(body)
            if rows and any(CYR.search(r[1]) for r in rows):
                picked[head] = {"p": py, "r": rows}
                added += 1
    # ссылки на слова, которых нет в словаре, — простым текстом
    dead = 0
    for e in picked.values():
        for r in e["r"]:
            def fix(m):
                nonlocal dead
                if html.unescape(m.group(1)) in picked:
                    return m.group(0)
                dead += 1
                return m.group(2)
            r[1] = re.sub(r'<a data-w="([^"]+)">(.*?)</a>', fix, r[1])
    print(f"Добавлено по ссылкам: {added}; ссылок без статьи: {dead}")

    # порядок: слова HSK по уровням, затем по частоте
    def rank(w):
        return (0, hsk[w]) if w in hsk else (1, -freq.get(w, 0), len(w))
    order = sorted(picked, key=rank)

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):  # только свои файлы: ex.json (корпус упражнений) собирается отдельно
        if f == "index.tsv" or re.fullmatch(r"\d{3}\.json", f):
            os.remove(os.path.join(OUT, f))
    glosses = {w: gloss(picked[w]["r"]) for w in order}
    for w in order:  # «см. 那儿» — берём значение из той статьи
        if not glosses[w]:
            m = re.search(r'data-w="([^"]+)"', picked[w]["r"][0][1])
            if m:
                glosses[w] = glosses.get(m.group(1)) or f"см. {m.group(1)}"
    with open(os.path.join(OUT, "index.tsv"), "w", encoding="utf8") as f:
        for w in order:
            f.write(f"{w}\t{picked[w]['p']}\t{glosses[w]}\n".replace("\r", ""))
    shards = [{} for _ in range(SHARDS)]
    for w in order:
        shards[ord(w[0]) % SHARDS][w] = picked[w]
    for i, s in enumerate(shards):
        with open(os.path.join(OUT, f"{i:03d}.json"), "w", encoding="utf8") as f:
            json.dump(s, f, ensure_ascii=False, separators=(",", ":"))
    write_meta(OUT, {"count": len(order), "shards": SHARDS})
    missing = [w for w in hsk if w not in picked]
    print(f"Статей: {len(picked)}; из HSK нет в БКРС: {len(missing)} {' '.join(missing[:30])}")


if __name__ == "__main__":
    main()
