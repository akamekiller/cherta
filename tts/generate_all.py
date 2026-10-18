"""
Озвучка всех слов колод голосом zf_047 модели Kokoro-82M-v1.1-zh (Apache 2.0).
Запускается на GitHub Actions (.github/workflows/tts.yml), порциями.

python tts/generate_all.py --limit 1000

- Берёт слова из data/hsk3-*.tsv (и любых data/*.tsv из data/decks.json).
- Читает по пиньиню колоды (tts/phonemes.py), так многозначные иероглифы звучат как в колоде.
- Уже озвученные слова пропускает, поэтому запуск можно повторять: озвучатся только новые.
- Пишет site/audio/zh/<слово>.mp3 и список site/audio/zh/index.json.
"""
import argparse
import json
import os
import subprocess
import sys
import time

import soundfile as sf
import torch
from kokoro import KModel, KPipeline

sys.path.insert(0, os.path.dirname(__file__))
from phonemes import to_phonemes  # noqa: E402

REPO = "hexgrad/Kokoro-82M-v1.1-zh"
VOICE = "zf_047"
SR = 24000
SPEED = 0.9
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "site", "audio", "zh")


def deck_words():
    decks = json.load(open(os.path.join(ROOT, "data", "decks.json"), encoding="utf8"))
    words = {}
    for d in decks:
        lines = open(os.path.join(ROOT, "data", d["file"]), encoding="utf8").read().replace("\r", "").split("\n")[1:]
        for l in lines:
            parts = l.split("\t")
            if len(parts) >= 2 and parts[0].strip():
                words.setdefault(parts[0].strip(), parts[1].strip())
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
    todo = [(h, p) for h, p in words.items() if not os.path.exists(os.path.join(OUT, h + ".mp3"))]
    if args.limit:
        todo = todo[: args.limit]
    print(f"Слов в колодах: {len(words)}, озвучить сейчас: {len(todo)}", flush=True)
    if todo:
        model = KModel(repo_id=REPO).eval()
        pipe = KPipeline(lang_code="z", repo_id=REPO, model=model)
        pack = pipe.load_voice(VOICE).to(model.device)
        t0 = time.time()
        for n, (han, py) in enumerate(todo, 1):
            try:
                ps = to_phonemes(py)
                with torch.no_grad():
                    o = KPipeline.infer(model, ps, pack, SPEED)
                to_mp3(o.audio.numpy(), os.path.join(OUT, han + ".mp3"))
            except Exception as e:  # одно слово не должно ронять всю озвучку
                print("ОШИБКА", han, py, e, flush=True)
            if n % 100 == 0:
                print(f"{n}/{len(todo)} за {time.time() - t0:.0f} с", flush=True)
    done = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith(".mp3"))
    json.dump({"voice": VOICE, "words": done}, open(os.path.join(OUT, "index.json"), "w", encoding="utf8"), ensure_ascii=False)
    left = sum(1 for h in words if h not in set(done))
    print(f"Готово файлов: {len(done)}, осталось: {left}", flush=True)
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f:
        f.write(f"left={left}\n")


if __name__ == "__main__":
    main()
