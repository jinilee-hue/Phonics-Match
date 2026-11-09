"""Reading-check test set for Phonics Match: the game's 48 words read by many voices (child, adult, Korean-accented)
in rough conditions, plus things that must NOT pass — the user found the game paying coins without the word
("단어 말 안해도 그냥 넘어갈때가 있는지 확인해"): other words, Korean / English chatter, the tutor's own lines,
speech played backwards, music, noise.

usage: node tools/qa/stt_words.ts <dir>/words.json
       /Users/jini/.hermes/bin/uv run --with edge-tts --with numpy python tools/qa/stt_set.py <dir>
writes <dir>/<id>.f32 (16 kHz mono float32, prepared like mic.ts prepareForStt) + <dir>/set.json
then:  node tools/qa/stt_eval.ts <dir> <dir>/eval.json  →  python3 tools/qa/stt_grid.py <dir>/eval.json
(adapted from Phonics-Jenga tools/qa/stt_set.py)"""
import asyncio
import json
import pathlib
import subprocess
import sys

import edge_tts
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/Users/jini/.hermes/cache/scratch/pm/stt')
RAW = OUT / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
SR = 16000
rng = np.random.default_rng(11)

W = json.loads((OUT / 'words.json').read_text())
WORDS = [w['word'] for w in W]
BY = {w['word']: w for w in W}
# how a Korean child might say them (Konglish): read by a Korean voice = a strong accent
KO = {'mouse': '마우스', 'ant': '앤트', 'seal': '씰', 'turtle': '터틀', 'puppy': '퍼피', 'iguana': '이구아나', 'cow': '카우', 'fish': '피쉬',
      'dog': '도그', 'horse': '호스', 'octopus': '옥토퍼스', 'rat': '랫', 'bee': '비', 'lion': '라이언', 'elephant': '엘리펀트', 'goat': '고트',
      'fox': '폭스', 'zebra': '지브라', 'mop': '몹', 'ax': '액스', 'soap': '소프', 'table': '테이블', 'pot': '팟', 'nail': '네일', 'ink': '잉크',
      'car': '카', 'fork': '포크', 'door': '도어', 'hat': '햇', 'robot': '로봇', 'bus': '버스', 'lock': '락', 'key': '키', 'egg': '에그',
      'gift': '기프트', 'window': '윈도우', 'box': '박스', 'violin': '바이올린', 'umbrella': '엄브렐라', 'jar': '자', 'quilt': '퀼트', 'yarn': '얀',
      'zipper': '지퍼', 'apple': '애플', 'grape': '그레이프', 'lemon': '레몬', 'pear': '페어', 'watermelon': '워터멜론'}
missing = [w for w in WORDS if w not in KO]
assert not missing, missing
OTHER = ['sun', 'banana', 'hello', 'red', 'tree', 'jump', 'bed', 'milk', 'book', 'water']
EN_CHAT = ['Your turn', "I don't know", "It's a", 'What is it?', 'Teacher!', 'Okay', 'Yes', 'No', 'Look!', 'Again', 'Mommy', 'Wow']
KO_CHAT = ['몰라요', '음...', '이거 뭐예요?', '선생님!', '네!', '아니야', '잠깐만요', '다시요']

VOICES = {  # name: (edge voice, rate, pitch, kid-shift factor, korean text?)
    'ana': ('en-US-AnaNeural', '-10%', '+0Hz', 1.0, False),
    'maisie': ('en-GB-MaisieNeural', '-5%', '+0Hz', 1.0, False),
    'guy': ('en-US-GuyNeural', '+0%', '+0Hz', 1.0, False),
    'jenny_kid': ('en-US-JennyNeural', '+0%', '+0Hz', 1.22, False),
    'sunhi_kr': ('ko-KR-SunHiNeural', '+0%', '+0Hz', 1.0, True),
    'injoon_kr': ('ko-KR-InJoonNeural', '+0%', '+0Hz', 1.0, True),
    'sunhi_kid': ('ko-KR-SunHiNeural', '+0%', '+0Hz', 1.2, True),
}


async def tts(text, voice, rate, pitch, path):
    if path.exists() and path.stat().st_size > 0:
        return
    for k in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(str(path))
            return
        except Exception as e:  # network hiccup
            print('retry', text, voice, e)
            await asyncio.sleep(1.5 * (k + 1))
    raise RuntimeError(f'tts failed {text} {voice}')


def load(path, shift=1.0, extra=''):
    af = 'aresample=16000' if shift == 1.0 else f'asetrate=24000*{shift},aresample=16000,atempo={1 / shift:.5f}'
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-af', af + extra, '-ac', '1', '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.float32).copy()


CLIPS = json.loads((ROOT / 'src/data/voice.json').read_text())['clips']


def clip(key):  # an official recording / tutor line, cut like tools/qa/word_check.ts
    file, start, _, dur = CLIPS[key]
    x = load(ROOT / 'public/voice' / file)
    return x[int(start * SR):int((start + dur) * SR)]


def join(parts, gap=0.18):
    g = np.zeros(int(gap * SR), np.float32)
    out = []
    for i, p in enumerate(parts):
        out += [p] + ([g] if i < len(parts) - 1 else [])
    return np.concatenate(out)


def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr * np.abs(x).max())[0]
    if not len(idx):
        return x
    a, b = max(0, idx[0] - int(0.30 * SR)), min(len(x), idx[-1] + int(0.24 * SR))  # like the mic: 300 ms before, 240 ms after
    return x[a:b]


def prepare(x):  # mic.ts prepareForStt: peak to 0.9 (max x8), 0.25 s of silence each side
    p = np.abs(x).max()
    g = min(8, 0.9 / p) if p > 0.001 else 1
    pad = np.zeros(4000, np.float32)
    return np.concatenate([pad, (x * g).astype(np.float32), pad])


BGM = load(ROOT / 'public/bgm.mp3')


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-9)


def cond(x, kind):
    x = trim(x)
    if kind == 'clean':
        return x
    if kind == 'bgm':  # the game's music from the speakers, 6 dB under the voice
        s = int(rng.integers(0, len(BGM) - len(x) - 1))
        m = BGM[s:s + len(x)]
        return x + m * (rms(x) / rms(m)) * 10 ** (-6 / 20)
    if kind == 'room':  # far from the mic: reverb + fan noise + quiet
        t = np.arange(int(0.5 * SR)) / SR
        ir = rng.standard_normal(len(t)) * np.exp(-t / 0.07)
        ir[0] = 6
        ir /= np.abs(ir).sum() ** 0.5 * 4
        y = np.convolve(x, ir)[:len(x) + int(0.2 * SR)]
        n = np.cumsum(rng.standard_normal(len(y))) * 0.02
        n -= np.convolve(n, np.ones(400) / 400, 'same')  # brown-ish noise, no DC
        return 0.25 * (y / np.abs(y).max() + n * (rms(y / np.abs(y).max()) / rms(n)) * 10 ** (-12 / 20))
    raise ValueError(kind)


def chant_text(w):  # the game's own "/x/ /x/ word" alt with a sound, e.g. 'Puh, puh, pig'
    cs = [a for a in BY[w]['alts'] if a.count(',') == 2]
    return cs[-1] if cs else f'{w}, {w}'


def cough(seed):
    r = np.random.default_rng(seed)
    out = np.zeros(int(0.9 * SR), np.float32)
    lp = 0.0
    for t0, ln in ((0.05, 0.22), (0.42, 0.3)):
        n = int(ln * SR)
        for i in range(n):
            lp = lp * 0.6 + r.uniform(-1, 1) * 0.4
            t = i / n
            out[int(t0 * SR) + i] = lp * np.sin(np.pi * t) ** 0.6 * (1 - t * 0.5)
    return out


async def main():
    items = []
    jobs = []
    for vn, (voice, rate, pitch, shift, ko) in VOICES.items():
        for w in WORDS:
            text = KO[w] if ko else w
            jobs.append((text, voice, rate, pitch, RAW / f'{voice}_{rate}_{text}.mp3'))
    for vn in ('ana', 'guy'):
        voice, rate, pitch, _, _ = VOICES[vn]
        for w in WORDS:
            jobs.append((chant_text(w), voice, rate, pitch, RAW / f'{voice}_{rate}_{chant_text(w)}.mp3'))
    for o in OTHER:
        jobs.append((o, 'en-US-AnaNeural', '-10%', '+0Hz', RAW / f'en-US-AnaNeural_-10%_{o}.mp3'))
    for c in EN_CHAT:
        for voice, rate in (('en-US-AnaNeural', '-10%'), ('en-US-GuyNeural', '+0%')):
            jobs.append((c, voice, rate, '+0Hz', RAW / f'{voice}_{rate}_{c}.mp3'))
    for c in KO_CHAT:
        for voice in ('ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'):
            jobs.append((c, voice, '+0%', '+0Hz', RAW / f'{voice}_+0%_{c}.mp3'))
    sem = asyncio.Semaphore(6)

    async def run(j):
        async with sem:
            await tts(*j)
    await asyncio.gather(*(run(j) for j in jobs))
    print('tts clips', len(jobs), flush=True)

    def save(id_, x, target, should, kind, voice, said):
        np.asarray(prepare(x), np.float32).tofile(OUT / f'{id_}.f32')
        items.append({'id': id_, 'target': target, 'should': should, 'kind': kind, 'voice': voice, 'said': said})

    # ── must pass: the word (or the "/x/ /x/ word" chant) ──
    for vn, (voice, rate, pitch, shift, ko) in VOICES.items():
        for w in WORDS:
            text = KO[w] if ko else w
            x = load(RAW / f'{voice}_{rate}_{text}.mp3', shift)
            for kind in ('clean', 'bgm', 'room'):
                save(f'pos_{vn}_{w}_{kind}', cond(x, kind), w, True, kind, vn, text)
    for vn in ('ana', 'guy'):
        voice, rate, _, _, _ = VOICES[vn]
        for w in WORDS:
            x = load(RAW / f'{voice}_{rate}_{chant_text(w)}.mp3')
            for kind in ('clean', 'bgm'):
                save(f'chant_{vn}_{w}_{kind}', cond(x, kind), w, True, 'chant', vn, chant_text(w))
    for w in WORDS:
        l = BY[w]['letter']
        save(f'official_{w}', cond(clip(f'w:{w}'), 'clean'), w, True, 'official', 'official', w)
        save(f'officialchant_{w}', cond(join([clip(f's:{l}'), clip(f's:{l}'), clip(f'w:{w}')]), 'clean'), w, True, 'official', 'official', f'/{l}/ /{l}/ {w}')
    # ── must NOT pass ──
    for i, w in enumerate(WORDS):
        board = [r for r in BY[w]['rivals'] if f'w:{r}' in CLIPS][:3]
        for r in board:   # another word of its board, the official recording
            save(f'board_{w}_{r}', cond(clip(f'w:{r}'), 'clean'), w, False, 'board', 'official', r)
        for o in (OTHER[i % len(OTHER)], OTHER[(i + 3) % len(OTHER)]):
            save(f'other_{w}_{o}', cond(load(RAW / f'en-US-AnaNeural_-10%_{o}.mp3'), 'clean'), w, False, 'other', 'ana', o)
    for i, c in enumerate(EN_CHAT):
        for voice, rate in (('en-US-AnaNeural', '-10%'), ('en-US-GuyNeural', '+0%')):
            x = cond(load(RAW / f'{voice}_{rate}_{c}.mp3'), 'clean')
            for w in (WORDS[(i * 4) % len(WORDS)], WORDS[(i * 4 + 17) % len(WORDS)], WORDS[(i * 4 + 31) % len(WORDS)]):
                save(f'enchat_{voice[6:9]}_{i}_{w}', x, w, False, 'english', voice, c)
    for i, c in enumerate(KO_CHAT):
        for voice in ('ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'):
            x = cond(load(RAW / f'{voice}_+0%_{c}.mp3'), 'clean')
            for w in (WORDS[(i * 5) % len(WORDS)], WORDS[(i * 5 + 13) % len(WORDS)], WORDS[(i * 5 + 29) % len(WORDS)]):
                save(f'kochat_{voice[6:12]}_{i}_{w}', x, w, False, 'korean', voice, c)
    tutor = sorted(k for k in CLIPS if k.startswith(('t:', 'k:')))
    for i, k in enumerate(tutor):   # the tutor's own lines (Korean k:, English t:) — someone talking, the room's echo
        x = cond(clip(k), 'clean')
        for w in (WORDS[(i * 7) % len(WORDS)], WORDS[(i * 7 + 23) % len(WORDS)]):
            save(f'tutor_{k.replace(":", "_")}_{w}', x, w, False, 'tutor-ko' if k.startswith('k:') else 'tutor-en', 'tutor', k)
    for i, w in enumerate(WORDS[::4]):   # speech played backwards: a voice, no word
        x = cond(clip(f'w:{w}')[::-1].copy(), 'clean')
        for t in (WORDS[(i * 9 + 2) % len(WORDS)], WORDS[(i * 9 + 25) % len(WORDS)], WORDS[(i * 9 + 40) % len(WORDS)]):
            if t != w:
                save(f'rev_{w}_{t}', x, t, False, 'backwards', 'official', f'{w} (backwards)')
    for i in range(6):  # music alone, fan noise, a cough
        s = int(rng.integers(0, len(BGM) - 2 * SR))
        save(f'music_{i}', BGM[s:s + int(1.6 * SR)].copy(), WORDS[(i * 7) % len(WORDS)], False, 'music', '-', '(music)')
        n = np.cumsum(rng.standard_normal(int(1.2 * SR))).astype(np.float32)
        n -= np.convolve(n, np.ones(400) / 400, 'same').astype(np.float32)
        save(f'noise_{i}', n / np.abs(n).max() * 0.05, WORDS[(i * 7 + 2) % len(WORDS)], False, 'noise', '-', '(noise)')
        save(f'cough_{i}', cough(i), WORDS[(i * 7 + 4) % len(WORDS)], False, 'noise', '-', '(cough)')
    (OUT / 'set.json').write_text(json.dumps(items, ensure_ascii=False, indent=0))
    from collections import Counter
    print(len(items), 'items', Counter((it['should'], it['kind']) for it in items))

asyncio.run(main())
