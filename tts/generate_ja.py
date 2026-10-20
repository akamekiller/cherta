"""
Озвучка японских колод голосом jf_alpha модели Kokoro-82M (hexgrad/Kokoro-82M, Apache 2.0; японский G2P — misaki[ja]).
Запускается на GitHub Actions (.github/workflows/tts-ja.yml), порциями.

python tts/generate_ja.py --limit 500

- Берёт слова японских колод из data/decks.json (lang: "ja").
- Читает по чтению каной из колоды (первое из «/»), а не по кандзи — так многозначные знаки звучат как в колоде.
- Уже озвученные слова пропускает; если чтение в колоде поменялось — переозвучивает.
- Пишет site/audio/ja/<слово>.mp3 и site/audio/ja/index.json ({voice, words, py: {слово: чтение}}).
"""
import argparse
import json
import os
import subprocess
import time

import soundfile as sf
from kokoro import KPipeline

REPO = "hexgrad/Kokoro-82M"
VOICE = "jf_alpha"
SR = 24000
SPEED = 0.9
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "site", "audio", "ja")
BAD = set('/\\:*?"<>|')


def deck_words():
    decks = json.load(open(os.path.join(ROOT, "data", "decks.json"), encoding="utf8"))
    words = {}
    for d in decks:
        if d.get("lang") != "ja":
            continue
        lines = open(os.path.join(ROOT, "data", d["file"]), encoding="utf8").read().replace("\r", "").split("\n")[1:]
        for l in lines:
            parts = l.split("\t")
            if len(parts) >= 2 and parts[0].strip() and not (BAD & set(parts[0])):
                words.setdefault(parts[0].strip(), parts[1].split("/")[0].strip() or parts[0].strip())
    return words


def to_mp3(wav, path):
    tmp = path + ".wav"
    sf.write(tmp, wav, SR)
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", trim, "-ac", "1", "-b:a", "48k", path], check=True)
    os.remove(tmp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="сколько новых слов озвучить за запуск (0 — все)")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    words = deck_words()
    idx_path = os.path.join(OUT, "index.json")
    old = json.load(open(idx_path, encoding="utf8")) if os.path.exists(idx_path) else {}
    voiced = dict(old.get("py", {}))

    def stale(h, r):
        return not os.path.exists(os.path.join(OUT, h + ".mp3")) or voiced.get(h) != r

    todo = [(h, r) for h, r in words.items() if stale(h, r)]
    if args.limit:
        todo = todo[: args.limit]
    print(f"Слов в японских колодах: {len(words)}, озвучить сейчас: {len(todo)}", flush=True)
    if todo:
        pipe = KPipeline(lang_code="j", repo_id=REPO)
        t0 = time.time()
        for n, (han, reading) in enumerate(todo, 1):
            try:
                # одиночный знак каны — с японской точкой, иначе модель иногда глотает звук
                text = reading + "。" if len(reading) == 1 else reading
                chunks = [r.audio for r in pipe(text, voice=VOICE, speed=SPEED) if r.audio is not None]
                if not chunks:
                    raise RuntimeError("пустой звук")
                import torch
                to_mp3(torch.cat(chunks).numpy(), os.path.join(OUT, han + ".mp3"))
                voiced[han] = reading
            except Exception as e:  # одно слово не должно ронять всю озвучку
                print("ОШИБКА", han, reading, e, flush=True)
            if n % 100 == 0:
                print(f"{n}/{len(todo)} за {time.time() - t0:.0f} с", flush=True)
    done = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith(".mp3"))
    voiced = {h: voiced[h] for h in done if h in voiced}
    json.dump({"voice": VOICE, "words": done, "py": voiced}, open(idx_path, "w", encoding="utf8"), ensure_ascii=False)
    left = sum(1 for h, r in words.items() if stale(h, r))
    print(f"Готово файлов: {len(done)}, осталось: {left}", flush=True)


if __name__ == "__main__":
    main()
