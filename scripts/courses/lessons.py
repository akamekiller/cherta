"""Чтение описаний курсов scripts/courses/hskN.txt: «Тема: слово слово …»."""
import os
HERE = os.path.dirname(__file__)

def load(n):
    title, lessons = "", []
    for line in open(os.path.join(HERE, f"hsk{n}.txt"), encoding="utf8"):
        line = line.strip()
        if line.startswith("# "): title = line[2:]
        elif ":" in line:
            t, ws = line.split(":", 1)
            lessons.append((t.strip(), ws.split()))
    return title, lessons
