"""Mouth shapes for every voice clip, so the tutor's mouth follows what it says (Rhubarb Lip Sync 1.13).
(Same tool as Phonics Jenga's fox: tools/build_mouth_cues.py there.)

For each clip in src/data/voice.json: decode public/voice/<file> to 16 kHz mono WAV, run rhubarb with the words of the
clip as the dialog (English tutor lines from voice.json `lines`, a word clip = the word; Korean lines and letter sounds
use the language-independent phonetic recognizer), and keep the cues → src/data/mouth.json
{ "<clip key>": [[start s, shape], ...] }, times in the FILE's time (the game maps them to the audio clock:
file time = clip offset + (now - start), core/audio.ts voiceNow).

Shapes (Rhubarb's): A closed (m b p) · B slightly open (most consonants) · C open (e, a as in 'bed', 'cat') ·
D wide (a as in 'father') · E rounded (o as in 'off', er) · F puckered (oo, w) · G f/v · H l · X rest.
Run after tools/build_voice.py:  /Users/jini/.hermes/bin/uv run python tools/build_mouth_cues.py
"""
import hashlib
import json
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RHUBARB = Path(os.environ.get('RHUBARB', os.path.expanduser('~/.cache/rhubarb/Rhubarb-Lip-Sync-1.13.0-macOS/rhubarb')))
VOICE = json.loads((ROOT / 'src' / 'data' / 'voice.json').read_text())
OUT = ROOT / 'src' / 'data' / 'mouth.json'
CACHE = Path(os.environ.get('MOUTH_CACHE', '/Users/jini/.hermes/cache/scratch/pm/mouthcues'))


def dialog(key: str):
    kind, ident = key.split(':', 1)
    if kind == 't':
        return VOICE.get('lines', {}).get(ident)
    if kind == 'w':
        return ident.replace('_', ' ')
    return None                          # k: Korean lines, s: letter sounds → phonetic recognizer, no text


# Letter sounds are drawn by hand from each recording's own sound (Rhubarb's phonetic pass gave /p/ a "f/v" mouth):
# /m/ hums with the lips CLOSED, /a/ opens wide, /s/ hisses through a slightly open mouth, /t/ taps then releases,
# /p/ presses the lips shut, then pops open. Times: (shape, from the sound's start / end + offset s).
LETTER = {
    'm': [('A', 'on', -0.06), ('X', 'off', 0.03)],
    'a': [('C', 'on', -0.05), ('D', 'on', 0.03), ('C', 'off', -0.04), ('X', 'off', 0.03)],
    's': [('B', 'on', -0.05), ('X', 'off', 0.03)],
    't': [('B', 'on', -0.08), ('C', 'on', 0.01), ('B', 'off', -0.01), ('X', 'off', 0.06)],
    'p': [('A', 'on', -0.14), ('B', 'on', -0.01), ('C', 'on', 0.04), ('X', 'off', 0.03)],
    # the unit boards' other letters, by how the mouth makes the sound: lips (b = p), teeth (z = s), lip on teeth (f),
    # tongue (l), stops in the throat (c / k / g / d = t), open vowels (a e i o h), rounded (r w), x = k + s
    'b': [('A', 'on', -0.14), ('B', 'on', -0.01), ('C', 'on', 0.04), ('X', 'off', 0.03)],
    'z': [('B', 'on', -0.05), ('X', 'off', 0.03)],
    'f': [('G', 'on', -0.06), ('X', 'off', 0.03)],
    'l': [('H', 'on', -0.05), ('C', 'on', 0.04), ('X', 'off', 0.03)],
    'c': [('B', 'on', -0.08), ('C', 'on', 0.01), ('B', 'off', -0.01), ('X', 'off', 0.06)],
    'k': [('B', 'on', -0.08), ('C', 'on', 0.01), ('B', 'off', -0.01), ('X', 'off', 0.06)],
    'g': [('B', 'on', -0.08), ('C', 'on', 0.01), ('B', 'off', -0.01), ('X', 'off', 0.06)],
    'd': [('B', 'on', -0.08), ('C', 'on', 0.01), ('B', 'off', -0.01), ('X', 'off', 0.06)],
    'e': [('C', 'on', -0.05), ('C', 'off', -0.04), ('X', 'off', 0.03)],
    'i': [('B', 'on', -0.05), ('C', 'on', 0.02), ('B', 'off', -0.04), ('X', 'off', 0.03)],
    'o': [('E', 'on', -0.05), ('D', 'on', 0.03), ('E', 'off', -0.04), ('X', 'off', 0.03)],
    'h': [('C', 'on', -0.04), ('B', 'off', -0.03), ('X', 'off', 0.03)],
    'r': [('E', 'on', -0.05), ('F', 'on', 0.03), ('E', 'off', -0.03), ('X', 'off', 0.03)],
    'w': [('F', 'on', -0.06), ('C', 'on', 0.06), ('X', 'off', 0.03)],
    'x': [('C', 'on', -0.05), ('B', 'on', 0.04), ('X', 'off', 0.03)],
    # the things' letters: /n/ hums through a slightly open mouth, /v/ = /f/ with voice, /u/ (umbrella) opens,
    # /j/ taps then opens, /kw/ taps then rounds, /y/ glides open
    'n': [('B', 'on', -0.05), ('X', 'off', 0.03)],
    'v': [('G', 'on', -0.06), ('X', 'off', 0.03)],
    'u': [('C', 'on', -0.05), ('X', 'off', 0.03)],
    'j': [('B', 'on', -0.08), ('C', 'on', 0.02), ('X', 'off', 0.03)],
    'qu': [('B', 'on', -0.08), ('F', 'on', 0.03), ('X', 'off', 0.03)],
    'y': [('B', 'on', -0.05), ('C', 'on', 0.04), ('X', 'off', 0.03)],
}


def letter_cues(key: str, file: Path):
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    n = len(x) // 160
    rms = np.sqrt((x[:n * 160].reshape(n, 160) ** 2).mean(1))
    act = np.nonzero(rms > rms.max() * 0.12)[0]
    on, off = act[0] / 100, (act[-1] + 1) / 100
    out = [[0.0, 'X']]
    for shape, ref, dt in LETTER[key[2:]]:
        out.append([round(max(0.0, (on if ref == 'on' else off) + dt), 3), shape])
    out.sort(key=lambda c: c[0])
    return key, out


def cues_for(key: str, file: Path):
    if key.startswith('s:') and key[2:] in LETTER:
        return letter_cues(key, file)
    text = dialog(key)
    h = hashlib.sha1(file.read_bytes() + (text or '').encode()).hexdigest()[:16]
    hit = CACHE / f'{key.replace(":", "_")}_{h}.json'
    if hit.exists():
        return key, json.loads(hit.read_text())
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'a.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(file), '-ac', '1', '-ar', '16000', str(wav)], check=True)
        cmd = [str(RHUBARB), '-q', '-f', 'json', '--extendedShapes', 'GHX']
        if text:
            d = Path(tmp) / 'd.txt'; d.write_text(text)
            cmd += ['-d', str(d)]
        else:
            cmd += ['-r', 'phonetic']
        r = subprocess.run(cmd + [str(wav)], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f'rhubarb failed on {key}: {r.stderr[-300:]}')
        data = json.loads(r.stdout)
    out = [[round(c['start'], 3), c['value']] for c in data['mouthCues']]
    hit.write_text(json.dumps(out))
    return key, out


def main():
    if not RHUBARB.exists():
        raise SystemExit(f'rhubarb not found at {RHUBARB} (download the macOS release of rhubarb-lip-sync 1.13)')
    CACHE.mkdir(parents=True, exist_ok=True)
    clips = VOICE['clips']
    jobs = [(k, ROOT / 'public' / 'voice' / v[0]) for k, v in clips.items()]
    missing = [k for k, f in jobs if not f.exists()]
    if missing:
        raise SystemExit(f'missing voice files: {missing}')
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = dict(ex.map(lambda j: cues_for(*j), jobs))
    out = {k: res[k] for k in sorted(res)}
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    shapes = {}
    for cs in out.values():
        for _, s in cs:
            shapes[s] = shapes.get(s, 0) + 1
    print(f'{len(out)} clips → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB) · shapes {dict(sorted(shapes.items()))}')


if __name__ == '__main__':
    main()
