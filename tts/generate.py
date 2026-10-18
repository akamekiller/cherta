"""
Пробная озвучка слов моделью Kokoro-82M-v1.1-zh (Apache 2.0).
Запускается на GitHub Actions (.github/workflows/tts.yml).

python tts/generate.py tts/sample.tsv site/audio-test

Для каждого слова и каждого голоса два файла:
  a — модель сама читает иероглифы (свой разбор пиньиня, может ошибаться в многозначных);
  b — по пиньиню из колоды (через tts/phonemes.py).
Плюс страница index.html для сравнения на слух.
"""
import html
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
import torch
from huggingface_hub import list_repo_files
from kokoro import KModel, KPipeline

sys.path.insert(0, os.path.dirname(__file__))
from phonemes import to_phonemes  # noqa: E402

REPO = "hexgrad/Kokoro-82M-v1.1-zh"
SR = 24000
SPEED = 0.9


def pick_voices():
    files = list_repo_files(REPO)
    names = sorted(f[len("voices/"):-3] for f in files if f.startswith("voices/z") and f.endswith(".pt"))
    female = [v for v in names if v.startswith("zf_")]
    male = [v for v in names if v.startswith("zm_")]
    chosen = []
    if female:
        chosen.append(female[0])
    if len(female) > 10:
        chosen.append(female[len(female) // 2])
    if male:
        chosen.append(male[0])
    print("Голоса в модели:", len(names), "выбраны:", chosen, flush=True)
    return chosen


def to_mp3(wav: np.ndarray, path: str):
    tmp = path[:-4] + ".wav"
    sf.write(tmp, wav, SR)
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", trim, "-ac", "1", "-b:a", "48k", path], check=True)
    os.remove(tmp)


def main(src: str, out: str):
    rows = [l.rstrip("\n").split("\t") for l in open(src, encoding="utf8") if l.strip()]
    os.makedirs(out, exist_ok=True)
    voices = pick_voices()
    model = KModel(repo_id=REPO).eval()
    pipe = KPipeline(lang_code="z", repo_id=REPO, model=model)
    report = []
    for v in voices:
        os.makedirs(os.path.join(out, v), exist_ok=True)
        pack = pipe.load_voice(v).to(model.device)
        for i, (han, py, *_rest) in enumerate(rows):
            # a: модель читает иероглифы сама
            res = list(pipe(han, voice=v, speed=SPEED))
            auto_ps = "".join(r.phonemes for r in res)
            wav = np.concatenate([r.audio.numpy() for r in res if r.audio is not None])
            to_mp3(wav, os.path.join(out, v, f"{i:03d}a.mp3"))
            # b: по пиньиню колоды
            ps = to_phonemes(py)
            with torch.no_grad():
                o = KPipeline.infer(model, ps, pack, SPEED)
            to_mp3(o.audio.numpy(), os.path.join(out, v, f"{i:03d}b.mp3"))
            if v == voices[0]:
                report.append({"han": han, "py": py, "auto": auto_ps, "ours": ps})
            print(v, han, "auto:", auto_ps, "ours:", ps, flush=True)
    json.dump(report, open(os.path.join(out, "phonemes.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    write_page(rows, voices, out)


def write_page(rows, voices, out):
    opts = "".join(f'<option value="{v}">{v}</option>' for v in voices)
    trs = []
    for i, (han, py, *rest) in enumerate(rows):
        ru = rest[0] if rest else ""
        trs.append(
            f'<tr><td class="h">{html.escape(han)}</td><td><div>{html.escape(py)}</div><small>{html.escape(ru)}</small></td>'
            f'<td><button data-i="{i:03d}" data-k="a">1</button><button data-i="{i:03d}" data-k="b">2</button>'
            f'<button data-tts="{html.escape(han)}">тел.</button></td></tr>')
    page = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Черта — пробная озвучка</title>
<style>
:root{{color-scheme:light dark;--bg:#fff;--fg:#18201E;--mut:#5E6A66;--line:#DCE2DF;--acc:#1E7A60}}
@media (prefers-color-scheme:dark){{:root{{--bg:#000;--fg:#F2F2F2;--mut:#8C8C8C;--line:#262626;--acc:#EDEDED}}}}
body{{margin:0;font:15px system-ui,sans-serif;background:var(--bg);color:var(--fg);padding:16px;max-width:560px;margin:auto}}
h1{{font-size:20px}} p{{color:var(--mut)}} select{{font:inherit;padding:6px}}
table{{width:100%;border-collapse:collapse}} td{{border-top:1px solid var(--line);padding:8px 4px;vertical-align:middle}}
td.h{{font-size:28px;font-family:"Noto Serif SC",serif;width:90px}} small{{color:var(--mut)}}
button{{font:600 14px system-ui;min-width:44px;height:40px;margin:2px;border-radius:10px;border:1px solid var(--line);background:none;color:var(--fg)}}
button.on{{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}}
</style></head><body>
<h1>Пробная озвучка</h1>
<p>Модель Kokoro v1.1-zh. <b>1</b> — модель сама читает иероглифы, <b>2</b> — по пиньиню из колоды, <b>тел.</b> — голос телефона, как сейчас в приложении.</p>
<p>Голос: <select id="v">{opts}</select></p>
<table>{''.join(trs)}</table>
<script>
const a=new Audio();
document.addEventListener('click',e=>{{const b=e.target.closest('button');if(!b)return;
document.querySelectorAll('button.on').forEach(x=>x.classList.remove('on'));b.classList.add('on');
if(b.dataset.tts){{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(b.dataset.tts);u.lang='zh-CN';u.rate=.85;speechSynthesis.speak(u);return}}
a.src=document.getElementById('v').value+'/'+b.dataset.i+b.dataset.k+'.mp3';a.play();}});
</script></body></html>"""
    open(os.path.join(out, "index.html"), "w", encoding="utf8").write(page)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
