"""Pre-made voice clips for Phonics Match (no device speechSynthesis: the voice must be the same on every device).

- Tutor lines: the company TTS (Qwen3-TTS, OpenAI-style /audio/speech), preset 'aiden' with a cheerful 7-year-old-boy
  instruction — the one tutor voice the user picked for Phonics Island / Magic Block. → public/voice/t_<key>.mp3
- Letter sounds (the 20 board letters m a s t p i c f d h o r b l k e g w x z): OFFICIAL FPR K recordings (Phonics
  Island public/fpr) → public/voice/s_<x>.mp3 (TTS can't say a lone phoneme reliably; the textbook recordings can.)
- Words (the 28 FPR K animals, src/data/animals.ts): official recordings — Phonics Island fpr/manifest.json (FPR K /
  Constella) or the approved Constella word assets in Phonics_island/fpr_assets/audio/낱말 (자산_승인…/p-NOUN_<w>_…mp3).
  puppy and iguana: approved e-poly recordings (2026-10-29) downloaded from Constella (자산_추가_20261107/, 목록.csv
  has their asset ids). A word with no recording (None) would get the tutor voice, read back with whisper and retaken
  until heard right. → public/voice/w_<word>.mp3

Clips are cut 0.25 s after speech; lead-in and loudness are applied at playback from src/data/voice.json:
{key: [file, start s, gain, dur s]}.
Run (company network / VPN; TTS_BASE_URL + LLM_API_KEY live in ~/.zshrc — never printed):
  zsh -ic '/Users/jini/.hermes/bin/uv run --with numpy python tools/build_voice.py'
Offline prototype voice: /Users/jini/.hermes/bin/uv run --with edge-tts --with numpy python tools/build_voice.py --engine edge
"""
import asyncio
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'voice'
JSON_OUT = ROOT / 'src' / 'data' / 'voice.json'
PI = pathlib.Path.home() / 'Documents/Jini/2026/Phonics/Phonics_island/phonics-island-3d/public'
NAT = pathlib.Path.home() / 'Documents/Jini/2026/Phonics/Phonics_island/fpr_assets/audio/낱말'   # approved word assets
SR = 24000
ENGINE = sys.argv[sys.argv.index('--engine') + 1] if '--engine' in sys.argv else 'qwen'
CACHE = pathlib.Path.home() / '.cache' / 'phonics-match' / ('voice' if ENGINE == 'edge' else 'voice_qwen')
CHECK_MODELS = pathlib.Path('/Users/jini/.hermes/cache/scratch/jenga/models')

VOICE = 'en-US-AnaNeural'
WORD_RATE, WORD_PITCH = '-10%', '+0Hz'
TUTOR_RATE, TUTOR_PITCH = '-5%', '+10Hz'
QWEN_URL, QWEN_KEY = os.environ.get('TTS_BASE_URL', '').rstrip('/'), os.environ.get('LLM_API_KEY', '')
QWEN_VOICE = 'aiden'
W_INS = ['Say this one word slowly and clearly, like a cheerful 7-year-old boy.',
         'Say this one word clearly, like a cheerful 7-year-old boy.',
         'Say this one word clearly and not too fast, like a cheerful 7-year-old boy.',
         'Say this one word clearly, like a cheerful 7-year-old boy. Make the first sound clear.',
         'Like a cheerful 7-year-old boy, say just this one word, clearly, with a clear first sound.',
         'Say this one word slowly, like a cheerful 7-year-old boy showing a friend how to say it.']
T_INS = ['Speak like a cheerful, energetic 7-year-old boy: bright and excited.',
         'Speak like a cheerful, energetic 7-year-old boy, bright and excited, clearly.',
         'Like a cheerful, energetic 7-year-old boy: bright, excited and clear.']

# what the tutor says (the speech bubble shows the same text: src/data/voice.json 'lines')
TUTOR = {
    'hello': "Hi, friends! Let's play Phonics Match!",
    'pressplay': 'Tap play to start!',
    'howto1': 'Swap two animals. Make three in a row!',
    'howto2': 'When they pop, say the sound and the word with me!',
    'howto3': 'Say it with me to win coins. Then dress me up!',
    'mission': 'Here is your mission!',
    'go': "Ready? Let's go!",
    'sayit': 'Your turn! Say it!',
    'great1': 'Great job!',
    'great2': 'Wow! You said it!',
    'great3': 'Super!',
    'great4': 'Perfect!',
    'bonus': 'Bonus coins!',
    'almost': 'Almost! Listen again.',
    'goodtry': 'Good try!',
    'combo': 'Combo!',
    'amazing': 'Amazing!',
    'hint': 'Look here!',
    'shuffle': "Let's mix them up!",
    'moves3': 'Three moves left!',
    'clear': 'Hooray! Mission complete!',
    'fail': 'Out of moves! Try again!',
    'next': "Let's play the next level!",
    'shop': "Let's dress me up!",
    'thanks': 'Thank you! I love it!',
    'poor': 'Say more words to get coins!',
    'look': 'How do I look?',
    'micask': 'Tap allow, so I can hear you!',
    'jump': 'Want to skip? Tap the jump button!',   # the jump button's guide ("점프하고 싶으면 점프버튼 눌러야 하는 안내 가이드도 있으면 좋을거 같은데..")
}
# Korean (the default — the user's concept video narrates in Korean: "친구들 안녕! … 와우! 피그! 따라해봐 피그!").
# A value is the text, or (text, what the voice reads) where they differ.
TUTOR_KO = {
    'hello': '친구들 안녕! 신나는 파닉스 매치 게임을 시작해 볼까?',
    'pressplay': '플레이 버튼을 눌러 봐!',
    'howto1': '같은 동물 친구 셋을 한 줄로 맞춰 봐!',
    'howto2': '동물이 터지면, 소리랑 단어를 나랑 같이 따라 말해 봐!',
    'howto3': '따라 말하면 코인을 줄게! 코인으로 나를 멋지게 꾸며 줘!',
    'mission': '오늘의 미션이야!',
    'go': '준비됐니? 시작!',
    'sayit': '따라 해 봐!',
    'great1': '잘했어!',
    'great2': '와, 정말 잘 말했어!',
    'great3': '최고야!',
    'great4': '딩동댕!',
    'bonus': '보너스 코인!',
    'almost': '아까워! 다시 들어 봐.',
    'goodtry': '좋아, 잘했어!',
    'combo': '콤보!',
    'amazing': '대단해!',
    'hint': '여기 봐!',
    'shuffle': '섞어 볼까?',
    'moves3': '이제 세 번 남았어!',
    'clear': '야호! 미션 성공!',
    'fail': '아쉬워! 다시 해 보자!',
    'next': '다음 레벨로 가 볼까?',
    'shop': '나를 예쁘게 꾸며 줘!',
    'thanks': '고마워! 마음에 쏙 들어!',
    'poor': '단어를 따라 말하면 코인을 모을 수 있어!',
    'look': '나 어때?',
    'micask': '허용 버튼을 눌러 줘! 그래야 내가 들을 수 있어!',
    'jump': '넘어가고 싶으면 점프 버튼을 눌러!',
    'wow': '와우!',
    'nice': '좋아!',
}
assert set(TUTOR_KO) - {'wow', 'nice'} == set(TUTOR), set(TUTOR) ^ set(TUTOR_KO)
TUTOR['wow'] = 'Wow!'
TUTOR['nice'] = 'Nice!'
ko_say = lambda v: v[1] if isinstance(v, tuple) else v
ko_show = lambda v: v[0] if isinstance(v, tuple) else v

# the board animals: (word, letter, official clip — a key in Phonics Island fpr/manifest.json, a file under NAT, or None)
ANIMALS = [
          ('monkey', 'm', 'word:monkey'), ('mouse', 'm', 'word:mouse'), ('ant', 'a', 'word:ant'),
          ('seal', 's', 'word:seal'), ('tiger', 't', 'word:tiger'), ('turtle', 't', 'word:turtle'),
          ('pig', 'p', 'word:pig'),
          ('puppy', 'p', '자산_추가_20261107/p-NOUN_puppy_pronunciation.mp3'), ('iguana', 'i', '자산_추가_20261107/iguana.mp3'),
          ('cat', 'c', 'word:cat'),
          ('cow', 'c', 'word:cow'), ('fish', 'f', 'word:fish'), ('duck', 'd', 'word:duck'), ('dog', 'd', 'word:dog'),
          ('hen', 'h', '자산_승인143개_20261030_1924/p-NOUN_hen_pronunciation.mp3'),
          ('horse', 'h', '자산_승인143개_20261030_1924/p-NOUN_horse_pronunciation.mp3'),
          ('octopus', 'o', '자산_승인200개_20261030_1924/p-NOUN_octopus_pronunciation.mp3'),
          ('rat', 'r', '자산_승인200개_20261030_1924/p-NOUN_rat_pronunciation.mp3'),
          ('bear', 'b', '자산_승인143개_20261030_1924/p-VERB_bear_pronunciation.mp3'),
          ('bee', 'b', '자산_승인143개_20261030_1924/p-NOUN_bee_pronunciation.mp3'),
          ('lion', 'l', '자산_승인200개_20261030_1924/p-NOUN_lion_pronunciation.mp3'),
          ('elephant', 'e', '자산_승인143개_20261030_1924/p-NOUN_elephant_pronunciation.mp3'), ('goat', 'g', 'word:goat'),
          ('fox', 'x', '자산_승인143개_20261030_1924/p-NOUN_fox_pronunciation.mp3'),
          ('zebra', 'z', '자산_승인200개_20261030_1924/p-NOUN_zebra_pronunciation.mp3')]
# the other themes (src/data/animals.ts THEMES; user: "동물 과일 사물 세가지 컨셉으로"): all official recordings
# (engine / wagon have none anywhere yet — off the board until a recording exists)
OBJECTS = [('mug', 'm', 'word:mug'), ('mop', 'm', 'word:mop'), ('ax', 'a', 'word:ax'), ('sock', 's', 'word:sock'),
           ('soap', 's', 'word:soap'), ('tent', 't', 'word:tent'), ('table', 't', 'word:table'), ('pencil', 'p', 'word:pencil'),
           ('pot', 'p', 'word:pot'), ('net', 'n', 'word:net'), ('nail', 'n', 'word:nail'), ('ink', 'i', 'word:ink'),
           ('cup', 'c', 'word:cup'), ('car', 'c', 'word:car'), ('fan', 'f', 'word:fan'), ('fork', 'f', 'word:fork'),
           ('doll', 'd', 'word:doll'), ('door', 'd', 'word:door'), ('hat', 'h', 'word:hat'),
           ('ring', 'r', '자산_승인200개_20261030_1924/p-VERB_ring_pronunciation.mp3'),
           ('robot', 'r', '자산_승인200개_20261030_1924/p-NOUN_robot_pronunciation.mp3'),
           ('ball', 'b', 'word:ball'), ('bus', 'b', 'word:bus'),
           ('lamp', 'l', '자산_승인200개_20261030_1924/p-NOUN_lamp_pronunciation.mp3'),
           ('lock', 'l', '자산_승인200개_20261030_1924/p-NOUN_lock_pronunciation.mp3'),
           ('kite', 'k', '자산_승인200개_20261030_1924/p-NOUN_kite_pronunciation.mp3'),
           ('key', 'k', '자산_승인200개_20261030_1924/p-NOUN_key_pronunciation.mp3'),
           ('egg', 'e', '자산_승인143개_20261030_1924/p-NOUN_egg_pronunciation.mp3'),
           ('gift', 'g', '자산_승인143개_20261030_1924/p-NOUN_gift_pronunciation.mp3'),
           ('window', 'w', '자산_승인200개_20261030_1924/p-NOUN_window_pronunciation.mp3'),
           ('box', 'x', '자산_승인143개_20261030_1924/p-NOUN_box_pronunciation.mp3'), ('van', 'v', 'word:van'),
           ('violin', 'v', '자산_승인200개_20261030_1924/p-NOUN_violin_pronunciation.mp3'),
           ('umbrella', 'u', '자산_승인200개_20261030_1924/p-NOUN_umbrella_pronunciation.mp3'),
           ('jet', 'j', '자산_승인200개_20261030_1924/p-NOUN_jet_pronunciation.mp3'),
           ('jar', 'j', '자산_승인143개_20261030_1924/p-NOUN_jar_pronunciation.mp3'),
           ('quilt', 'qu', '자산_승인200개_20261030_1924/p-NOUN_quilt_pronunciation.mp3'),
           ('yarn', 'y', '자산_승인200개_20261030_1924/p-NOUN_yarn_pronunciation.mp3'),
           ('zipper', 'z', '자산_승인200개_20261030_1924/p-NOUN_zipper_pronunciation.mp3')]
FRUIT = [('apple', 'a', 'word:apple'), ('grape', 'g', '자산_승인143개_20261030_1924/p-NOUN_grape_pronunciation.mp3'),
         ('lemon', 'l', '자산_승인200개_20261030_1924/p-NOUN_lemon_pronunciation.mp3'), ('peach', 'p', 'word:peach'),
         ('pear', 'p', '자산_승인200개_20261030_1924/p-NOUN_pear_pronunciation.mp3'),
         ('watermelon', 'w', '자산_승인200개_20261030_1924/p-NOUN_watermelon_pronunciation.mp3')]
TTS_WORDS = [w for w, _l, off in ANIMALS if off is None]

fname = lambda s: re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
tag = lambda *p: hashlib.md5('|'.join(p).encode()).hexdigest()[:8]
JOBS = [(f'w:{w}', w) for w in TTS_WORDS] + [(f't:{k}', t) for k, t in TUTOR.items()] + [(f'k:{k}', ko_say(v)) for k, v in TUTOR_KO.items()]


def take_of(key, text, take):
    """input text, instruction and cache file of one take (None = no more takes)"""
    if key[0] == 'w':
        if take >= len(W_INS):
            return None
        ins = W_INS[take]
        inp = f'{text.capitalize()}.' if take < 4 else f'{text.capitalize()}!'
        return inp, ins, CACHE / f'w_{fname(text)}_{tag(QWEN_VOICE, ins, inp)}.mp3'
    if take >= len(T_INS):
        return None
    ins = T_INS[take]
    if key[0] == 'k':
        return text, ins, CACHE / f'k_{fname(key[2:])}_{tag(QWEN_VOICE, ins, text, "ko", str(take))}.mp3'
    return text, ins, CACHE / f't_{fname(text)}_{tag(QWEN_VOICE, ins, str(take))}.mp3'


async def fetch_edge(todo):
    import edge_tts
    sem = asyncio.Semaphore(6)

    async def one(j):
        key, text, dst = j
        rate, pitch = (WORD_RATE, WORD_PITCH) if key[0] == 'w' else (TUTOR_RATE, TUTOR_PITCH)
        async with sem:
            for attempt in range(5):
                try:
                    tmp = dst.with_suffix('.part')
                    await edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch).save(str(tmp))
                    tmp.rename(dst)
                    return
                except Exception as e:
                    if attempt == 4:
                        raise RuntimeError(f'{key}: {e}')
                    await asyncio.sleep(1.5 * (attempt + 1))
    await asyncio.gather(*(one(j) for j in todo))


def qwen_one(key, inp, ins, dst):
    body = json.dumps({'model': 'qwen-tts', 'input': inp, 'voice': QWEN_VOICE, 'language': 'ko' if key[0] == 'k' else 'en',
                       'response_format': 'wav', 'instructions': ins}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(QWEN_URL + '/audio/speech', data=body, method='POST',
                                         headers={'Authorization': 'Bearer ' + QWEN_KEY, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as r:
                wav = r.read()
            with tempfile.NamedTemporaryFile(suffix='.wav') as f:
                f.write(wav); f.flush()
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f.name, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '64k', str(dst)], check=True)
            return
        except Exception as e:  # 503 = the GPU is busy (one request at a time): wait and retry
            if attempt == 5:
                raise RuntimeError(f'{key}: {type(e).__name__} {getattr(e, "code", "")}')
            time.sleep(4 + 3 * attempt)


def read_back(items):
    """[(file, target, start, dur)] → {file: (ok, heard, seconds of sound)} via whisper (tools/qa/voice_check.ts)"""
    if not items:
        return {}
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump([{'file': str(p), 'target': t, 'start': s, 'dur': d} for p, t, s, d in items], f)
    env = {**os.environ, 'STT_MODEL': 'onnx-community/whisper-base.en', 'STT_MODELS_DIR': f'{CHECK_MODELS}/'} \
        if (CHECK_MODELS / 'onnx-community/whisper-base.en').exists() else dict(os.environ)
    r = subprocess.run(['node', str(ROOT / 'tools/qa/voice_check.ts'), f.name], capture_output=True, text=True, env=env, cwd=ROOT)
    os.unlink(f.name)
    last = [l for l in r.stdout.splitlines() if l.startswith('[')]
    for l in r.stdout.splitlines():
        if l and not l.startswith('['):
            print('   ', l)
    if r.returncode or not last:
        print('  read-back failed:', r.stderr[-400:]); return {}
    return {o['file']: (o['ok'], o['text'], o['sound']) for o in json.loads(last[-1])}


def read_back_ko(items):
    """Korean lines: [(file, target, start, dur)] → {file: (ok, heard, seconds)} via faster-whisper small
    (tools/qa/ko_check.py). Very short lines (\"와우!\") pass on a sane length alone."""
    if not items:
        return {}
    norm = lambda s: ''.join(ch for ch in s if ch.isalnum())
    out, todo = {}, []
    for p, t, s, d in items:
        if len(norm(t)) <= 2:
            out[str(p)] = (0.15 < d < 2.0, f'({d:.2f}s)', d)
        else:
            todo.append({'file': str(p), 'target': t, 'dur': d})
    if todo:
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(todo, f, ensure_ascii=False)
        uv = os.environ.get('UV', '/Users/jini/.hermes/bin/uv')
        r = subprocess.run([uv, 'run', '--with', 'faster-whisper', 'python', str(ROOT / 'tools/qa/ko_check.py'), '--json', f.name],
                           capture_output=True, text=True, cwd=ROOT)
        print(r.stdout[-3000:])
        res = pathlib.Path(f.name.replace('.json', '_out.json'))
        if r.returncode or not res.exists():
            print('  Korean read-back failed:', r.stderr[-400:])
            return {**out, **{o['file']: (True, '?', o['dur']) for o in todo}}
        for o in json.loads(res.read_text()):
            out[o['file']] = (o['sim'] >= 0.75, o['heard'], o['dur'])
        os.unlink(f.name); res.unlink()
    return out


LEAD, TAIL = .10, .25
FR = int(SR * .01)


def decode(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def speech(x, floor_db=-50):
    n = len(x) // FR
    rms = np.sqrt((x[:n * FR].reshape(n, FR) ** 2).mean(1) + 1e-12)
    return rms, np.nonzero(rms > rms.max() * 10 ** (floor_db / 20))[0]


def trim(raw, dst, target_db=-17, floor_db=-50):
    """the clip as the game plays it: cut 0.25 s after the speech → dst; returns (start, gain, dur) for voice.json"""
    _, act = speech(decode(raw), floor_db)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-t', f'{(act[-1] + 1) * FR / SR + TAIL:.3f}',
                    '-c:a', 'copy', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', str(dst)],
                   check=True)
    y = decode(dst)
    rms, act = speech(y, floor_db)
    voiced = rms[act[0]:act[-1] + 1]
    loud = np.sqrt((voiced[voiced > voiced.max() * .1] ** 2).mean())
    g = min(10 ** (target_db / 20) / loud, 10 ** (-1 / 20) / np.abs(y).max())
    start = max(0., act[0] * FR / SR - LEAD)
    return round(start, 3), round(float(g), 3), round(len(y) / SR - start, 3)


CACHE.mkdir(parents=True, exist_ok=True)
chosen = {}
if ENGINE == 'edge':
    todo = []
    for key, text in JOBS:
        if key[0] == 'k':
            continue
        rate, pitch = (WORD_RATE, WORD_PITCH) if key[0] == 'w' else (TUTOR_RATE, TUTOR_PITCH)
        dst = CACHE / f'{key[0]}_{fname(text)}_{rate}{pitch}.mp3'
        chosen[key] = dst
        if not dst.exists():
            todo.append((key, f'{text}.' if key[0] == 'w' else text, dst))
    asyncio.run(fetch_edge(todo))
else:
    if not (QWEN_URL and QWEN_KEY):
        sys.exit('TTS_BASE_URL / LLM_API_KEY not set: run inside `zsh -ic` on the company network (or use --engine edge)')
    pending, first, verdicts = list(JOBS), {}, {}
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='pm_voice_'))
    for take in range(len(W_INS)):
        batch = []
        for key, text in pending:
            got = take_of(key, text, take)
            if got is None:
                continue
            inp, ins, dst = got
            if not dst.exists():
                qwen_one(key, inp, ins, dst)
                print('  tts', key, 'take', take + 1, flush=True)
            first.setdefault(key, dst)
            batch.append((key, text, dst))
        if not batch:
            break
        checks = []
        for key, text, dst in batch:
            cut = tmp / f'{key[0]}_{fname(key[2:])}_{take}.mp3'
            start, _, dur = trim(dst, cut)
            checks.append((cut, text, start, dur))
        heard = read_back([c for c, (k, *_r) in zip(checks, batch) if k[0] != 'k'])
        heard.update(read_back_ko([c for c, (k, *_r) in zip(checks, batch) if k[0] == 'k']))
        still = []
        for (key, text, dst), (cut, *_rest) in zip(batch, checks):
            ok, got, snd = heard.get(str(cut), (True, '?', 0))
            verdicts[key] = (got, snd)
            if ok:
                chosen[key] = dst
            else:
                still.append((key, text))
        print(f'take {take + 1}: {len(batch) - len(still)}/{len(batch)} heard right', flush=True)
        pending = still
        if not pending:
            break
    for key, _ in pending:
        chosen[key] = first[key]
    if pending:
        print('never heard right (kept take 1 — check by ear):', [(k, verdicts[k][0]) for k, _ in pending])
print('clips', len(chosen), '· engine', ENGINE)

OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob('*.mp3'):
    f.unlink()
manifest = {}


def place(key, raw, dst, target_db=-17, floor_db=-50):
    manifest[key] = [dst.name, *trim(raw, dst, target_db, floor_db)]


for key, _ in JOBS:
    if key in chosen:
        place(key, chosen[key], OUT / f'{key[0]}_{fname(key[2:])}.mp3')

# official recordings (FPR K / Constella) — they carry ~0.5 s of silence before the sound; trim + level them too
fpr = json.loads((PI / 'fpr/manifest.json').read_text())['clips']
BOARD = ANIMALS + OBJECTS + FRUIT
for L in dict.fromkeys(L for _w, L, _o in BOARD):          # qu = the manifest's sound:q (/kw/)
    place(f's:{L}', PI / fpr[f'sound:{"q" if L == "qu" else L}'], OUT / f's_{L}.mp3', target_db=-18, floor_db=-40)
for word, L, off in BOARD:
    if off:
        place(f'w:{word}', PI / fpr[off] if off.startswith('word:') else NAT / off, OUT / f'w_{word}.mp3', target_db=-17, floor_db=-40)

voice = {'engine': 'edge', 'voice': VOICE} if ENGINE == 'edge' else {'engine': 'company-tts', 'voice': QWEN_VOICE}
JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
JSON_OUT.write_text(json.dumps({**voice, 'clips': manifest, 'lines': TUTOR, 'lines_ko': {k: ko_show(v) for k, v in TUTOR_KO.items()}},
                               indent=0, ensure_ascii=False), encoding='utf-8')
d = sorted((v[3], k) for k, v in manifest.items())
size = sum((OUT / v[0]).stat().st_size for v in manifest.values())
print(f'{len(manifest)} clips · {size / 1024:.0f} KB · shortest {d[:3]} · longest {d[-3:]}')
