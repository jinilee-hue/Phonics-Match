"""Offline: do the Rhubarb cues line up with each clip's sound? For every clip: RMS envelope (10 ms) of the played part
of the file vs the cues' mouth opening; the lag (ms) where they agree best (positive = mouth LATE).
uv run --with numpy python tools/qa/cue_lag.py [keys…]"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
V = json.loads((ROOT / 'src/data/voice.json').read_text())['clips']
C = json.loads((ROOT / 'src/data/mouth.json').read_text())
OPEN = {'X': 0, 'A': 0, 'D': 39, 'C': 25, 'B': 11.5, 'E': 28, 'F': 19, 'G': 8.5, 'H': 24}
SR, F = 16000, 160
keys = sys.argv[1:] or list(V)
lags, rows = [], []
for k in keys:
    f, start, gain, dur = V[k]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ROOT / 'public/voice' / f), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    n = len(x) // F
    rms = np.sqrt((x[:n * F].reshape(n, F) ** 2).mean(1))
    voiced = rms > rms.max() * 0.12
    cues = C[k]
    op = np.zeros(n)
    for i, (t, s) in enumerate(cues):
        t1 = cues[i + 1][0] if i + 1 < len(cues) else n * F / SR
        op[int(t * 100):int(t1 * 100)] = OPEN[s]
    opened = op > 0
    s0 = int(start * 100)                       # only the part the game plays
    best = None
    for lag in range(-30, 31):                  # mouth shifted by lag*10 ms
        sh = np.roll(opened, -lag)              # value at t = mouth at t+lag → positive lag: mouth late
        a = (sh[s0:] == voiced[s0:]).mean()
        if best is None or a > best[1]:
            best = (lag * 10, a)
    agree0 = (opened[s0:] == voiced[s0:]).mean()
    # onsets: first voiced 10 ms vs first open cue after the start
    v_on = s0 + int(np.argmax(voiced[s0:])) if voiced[s0:].any() else -1
    o_on = s0 + int(np.argmax(opened[s0:])) if opened[s0:].any() else -1
    v_off = len(voiced) - 1 - int(np.argmax(voiced[::-1]))
    o_off = len(opened) - 1 - int(np.argmax(opened[::-1]))
    rows.append((k, round(agree0, 2), best[0], round(best[1], 2), (o_on - v_on) * 10, (o_off - v_off) * 10))
    lags.append(best[0])
print(f'{"clip":14s} agree@0  best_lag_ms agree@best  onset_diff_ms  end_diff_ms   (+ = mouth late)')
for r in rows:
    print(f'{r[0]:14s} {r[1]:7.2f} {r[2]:10d} {r[3]:10.2f} {r[4]:12d} {r[5]:12d}')
print('median best lag', float(np.median(lags)), 'ms · mean onset diff', np.mean([r[4] for r in rows]), '· mean end diff', np.mean([r[5] for r in rows]))
