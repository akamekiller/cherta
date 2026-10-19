"""Чтение описаний курсов scripts/courses/hskN.txt: «Тема: слово слово …»."""
import os
HERE = os.path.dirname(__file__)

def load(n):
    """→ (название, [(тема урока, слова)], {номер урока с 1: раздел})"""
    title, lessons, sections = "", [], {}
    for line in open(os.path.join(HERE, f"hsk{n}.txt"), encoding="utf8"):
        line = line.strip()
        if line.startswith("### "): sections[len(lessons) + 1] = line[4:]
        elif line.startswith("# "): title = line[2:]
        elif ":" in line:
            t, ws = line.split(":", 1)
            lessons.append((t.strip(), ws.split()))
    return title, lessons, sections
