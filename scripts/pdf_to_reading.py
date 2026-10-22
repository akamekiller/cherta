"""
PDF учебника → файл для «Чтение → Загрузить файл» (всё делается у вас на компьютере, наружу ничего не уходит).

    pip install pypdf
    python scripts/pdf_to_reading.py "HSK 3.pdf" "Чтение — HSK 3.txt" --level 3
    python scripts/pdf_to_reading.py книга.pdf out.txt --level 2 --pages 10-120 --lesson "第\\s*(\\d+)\\s*课"

Что делает:
  1. достаёт текст из PDF (нужен текстовый слой: если в PDF можно выделить текст мышкой — подойдёт);
  2. делит по урокам по заголовкам «第N课», «Lesson N», «Урок N» (свой образец — ключ --lesson);
  3. оставляет только строки с китайским: пиньинь, русский и английский отбрасываются; номера страниц и колонтитулы тоже;
  4. пишет формат приложения: «=== уровень | Название», дальше предложения (перевода нет — он появляется по тапу в самом приложении).

Если PDF — сканы (картинки без текстового слоя), скрипт скажет об этом. Тогда сначала распознайте:
    pip install ocrmypdf   (и установите Tesseract с китайским: chi_sim)
    ocrmypdf -l chi_sim --force-ocr книга.pdf книга-ocr.pdf
и запустите скрипт на книга-ocr.pdf. Результат OCR проверьте глазами: бывают ошибки в иероглифах.
"""
import argparse
import re
import sys

HAN = re.compile(r"[一-鿿]")
LATIN_WORDS = re.compile(r"[A-Za-zА-Яа-яЁё]{3,}")
PAGE_NO = re.compile(r"^\s*[\d\-–—·.\s]{1,8}$")
DEFAULT_LESSON = r"(?:第\s*([0-9一二三四五六七八九十百]+)\s*课|[Ll]esson\s*(\d+)|Урок\s*(\d+))"


def read_pdf(path, pages):
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("Нужен pypdf:  pip install pypdf")
    r = PdfReader(path)
    n = len(r.pages)
    lo, hi = 1, n
    if pages:
        a, _, b = pages.partition("-")
        lo = int(a)
        hi = int(b) if b else lo
    out = []
    for i in range(lo - 1, min(hi, n)):
        try:
            out.append(r.pages[i].extract_text() or "")
        except Exception:
            out.append("")
    return out


def chinese_ratio(line):
    han = len(HAN.findall(line))
    letters = len(re.findall(r"[A-Za-zА-Яа-яЁё]", line))
    return han, letters


def keep(line):
    """Строка с китайским текстом (не пиньинь, не перевод, не номер страницы)."""
    s = line.strip()
    if not s or PAGE_NO.match(s):
        return False
    han, letters = chinese_ratio(s)
    if han < 4:
        return False
    # китайская строка может содержать немного латиницы/цифр (HSK, номера), но не быть переводом
    return letters <= han


def clean(line):
    s = line.strip()
    s = re.sub(r"\s+", "", s) if len(HAN.findall(s)) > 0.6 * len(s) else re.sub(r"(?<=[一-鿿])\s+(?=[一-鿿])", "", s)
    return s


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--level", type=int, default=0, help="уровень (HSK 1–6), 0 — без уровня")
    ap.add_argument("--pages", default="", help="диапазон страниц, например 10-120")
    ap.add_argument("--lesson", default=DEFAULT_LESSON, help="регулярное выражение заголовка урока")
    ap.add_argument("--name", default="", help="приставка к названию, например «HSK 3»")
    ap.add_argument("--min-lines", type=int, default=3, help="урок короче этого числа строк пропускается")
    a = ap.parse_args()

    pages = read_pdf(a.pdf, a.pages)
    total = sum(len(p.strip()) for p in pages)
    if total < 40:
        sys.exit("В PDF нет текстового слоя (похоже на сканы). Сначала ocrmypdf -l chi_sim — см. подсказку в начале скрипта.")

    head = re.compile(a.lesson)
    lessons = []  # (название, [строки])
    cur = None
    for ptxt in pages:
        for line in ptxt.splitlines():
            m = head.search(line)
            if m and len(line.strip()) < 40 and (HAN.search(line) or re.search(r"[Ll]esson|Урок", line)):
                cur = (line.strip(), [])
                lessons.append(cur)
                continue
            if cur is None:
                continue
            if keep(line):
                cur[1].append(clean(line))
    if not lessons:
        sys.exit("Не нашёл заголовки уроков. Задайте образец ключом --lesson, например --lesson \"第\\s*(\\d+)\\s*课\".")

    n = 0
    with open(a.out, "w", encoding="utf8") as f:
        for title, lines in lessons:
            if len(lines) < a.min_lines:
                continue
            n += 1
            name = f"{a.name} · {title}" if a.name else title
            f.write(f"=== {a.level} | {name}\n")
            for ln in lines:
                f.write(ln + "\n")
            f.write("\n")
    print(f"Готово: {n} текстов → {a.out}. Загрузите: Чтение → Загрузить файл.")


if __name__ == "__main__":
    main()
