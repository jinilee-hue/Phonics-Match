"""Does the game's clip clock (audio.voiceNow → file time) match the sound actually going through the voice bus?
Samples [file time, loudness] every ~8 ms while lines play (headless Chrome), then finds the shift of the file time
that best matches the file's own loudness envelope (0 ms = exact; + = the mouth would be late).
uv run --with playwright --with numpy python tools/qa/clock_check.py <base> [keys…]"""
import json, subprocess, sys, time
from pathlib import Path
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
V = json.loads((ROOT / 'src/data/voice.json').read_text())['clips']
base = sys.argv[1].rstrip('/') + '/'
keys = sys.argv[2:] or ['k:hello', 't:hello', 'k:howto2', 's:p', 'w:pig']
SR = 48000

def env_at(x, ts, win=1024):
    out = []
    for t in ts:
        e = int(t * SR); s = max(0, e - win)
        seg = x[s:e] if e > s else np.zeros(1)
        out.append(float(np.sqrt((seg ** 2).mean())) if len(seg) else 0.0)
    return np.array(out)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.goto(base, wait_until='load')
    pg.wait_for_function('!!window.__pm', timeout=20000)
    time.sleep(1.0)
    pg.mouse.click(200, 600)
    time.sleep(4.5)
    for key in keys:
        rows = pg.evaluate("""async (key) => {
          const rows = []; let on = true;
          const iv = setInterval(() => { const v = __pm.voiceNow(); if (v) rows.push([v.key, v.t, __pm.tutor.lips.level()]); }, 8);
          await __pm.say([key]);
          await new Promise((r) => setTimeout(r, 200));
          clearInterval(iv);
          return rows;
        }""", key)
        f, start, gain, dur = V[key]
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ROOT / 'public/voice' / f), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
        x = np.frombuffer(raw, np.float32) * gain
        ts = np.array([r[1] for r in rows if r[0] == key]); lv = np.array([r[2] for r in rows if r[0] == key])
        best = None
        for sh in range(-200, 201, 5):
            e = env_at(x, ts + sh / 1000)
            if e.std() == 0 or lv.std() == 0:
                continue
            c = float(np.corrcoef(e, lv)[0, 1])
            if best is None or c > best[1]:
                best = (sh, c)
        print(f'{key:12s} samples {len(ts):4d}  best shift {best[0]:+4d} ms (corr {best[1]:.2f})  [+ = sound is LATER in the file than voiceNow says → mouth early]')
    b.close()
