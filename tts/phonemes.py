"""Пиньинь колоды (ni3 hao3) → фонемы Kokoro v1.1-zh (формат misaki ZHFrontend, без pypinyin)."""
import re

INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s"]
Y_W = {
    "yi": "i", "ya": "ia", "ye": "ie", "yao": "iao", "you": "iou", "yan": "ian", "yin": "in", "yang": "iang",
    "ying": "ing", "yong": "iong", "yu": "v", "yue": "ve", "yuan": "van", "yun": "vn", "yo": "io",
    "wu": "u", "wa": "ua", "wo": "uo", "wai": "uai", "wei": "uei", "wan": "uan", "wen": "uen", "wang": "uang", "weng": "ueng",
}
ZH_MAP = {"b":"ㄅ","p":"ㄆ","m":"ㄇ","f":"ㄈ","d":"ㄉ","t":"ㄊ","n":"ㄋ","l":"ㄌ","g":"ㄍ","k":"ㄎ","h":"ㄏ","j":"ㄐ","q":"ㄑ","x":"ㄒ","zh":"ㄓ","ch":"ㄔ","sh":"ㄕ","r":"ㄖ","z":"ㄗ","c":"ㄘ","s":"ㄙ","a":"ㄚ","o":"ㄛ","e":"ㄜ","ie":"ㄝ","ai":"ㄞ","ei":"ㄟ","ao":"ㄠ","ou":"ㄡ","an":"ㄢ","en":"ㄣ","ang":"ㄤ","eng":"ㄥ","er":"ㄦ","i":"ㄧ","u":"ㄨ","v":"ㄩ","ii":"ㄭ","iii":"十","ve":"月","ia":"压","ian":"言","iang":"阳","iao":"要","in":"阴","ing":"应","iong":"用","iou":"又","ong":"中","ua":"穵","uai":"外","uan":"万","uang":"王","uei":"为","uen":"文","ueng":"瓮","uo":"我","van":"元","vn":"云"}
for _p in "12345R":
    ZH_MAP[_p] = _p


def split(syl: str):
    """'zhang' → ('zh', 'ang'); 'liu' → ('l', 'iou'); 'xue' → ('x', 've')."""
    if syl in ("er",):
        return "", "er"
    if syl in Y_W:
        return "", Y_W[syl]
    ini = next((i for i in INITIALS if syl.startswith(i) and len(syl) > len(i)), "")
    fin = syl[len(ini):]
    if ini in ("j", "q", "x") and fin.startswith("u"):
        fin = "v" + fin[1:]
    fin = {"iu": "iou", "ui": "uei", "un": "uen"}.get(fin, fin)
    if fin == "i" and ini in ("z", "c", "s"):
        fin = "ii"
    elif fin == "i" and ini in ("zh", "ch", "sh", "r"):
        fin = "iii"
    return ini, fin


def third_tone_sandhi(tones):
    """3-3 → 2-3 внутри слова (для 3+ слогов: все, кроме последнего в цепочке)."""
    t = list(tones)
    i = 0
    while i < len(t):
        if t[i] == 3:
            j = i
            while j + 1 < len(t) and t[j + 1] == 3:
                j += 1
            for k in range(i, j):
                t[k] = 2
            i = j + 1
        else:
            i += 1
    return t


def to_phonemes(py: str) -> str:
    syls = []
    for tok in py.split():
        m = re.match(r"^([a-zv]+?)([1-5])", tok)
        if not m:
            raise ValueError(tok)
        # эризация отдельным слогом «r5» (哪儿 = na3 r5) — присоединяем к предыдущему слогу
        if m.group(1) == "r" and syls:
            syls[-1] = (syls[-1][0] + "r", syls[-1][1])
            continue
        syls.append((m.group(1), int(m.group(2))))
    tones = third_tone_sandhi([t for _, t in syls])
    out = []
    for (s, _), tone in zip(syls, tones):
        erhua = s.endswith("r") and s != "er"
        if erhua:
            s = s[:-1]
        ini, fin = split(s)
        # как в misaki: эризация «R» стоит перед цифрой тона (ㄋㄚR3)
        parts = ([ini] if ini else []) + [fin] + (["R"] if erhua else []) + [str(tone)]
        for p in parts:
            if p not in ZH_MAP:
                raise ValueError(f"нет фонемы для {p!r} в {py!r}")
            out.append(ZH_MAP[p])
    return "".join(out)


if __name__ == "__main__":
    for t in ["ni3 hao3", "xue2 xi2", "zhang3 da4", "liu4", "gui4", "lun2", "jue2 de5", "nv3 er2", "lve4", "shi4", "zi4", "nar3", "yu2", "yuan2", "wei4", "er4", "zhan3 lan3 guan3", "lv4 se4"]:
        print(t, "→", to_phonemes(t))
