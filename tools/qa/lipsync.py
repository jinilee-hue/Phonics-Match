"""Lip-sync check (headless Chrome, never the user's browser).
1) every mouth shape drawn vs the painted mouth → <out>_shapes.png
2) lines played for real: per frame the drawn shape (Rhubarb cue at the clip's time) vs the voice loudness →
   agreement numbers + <out>_timeline.png (loudness on top, mouth opening below)
uv run --with playwright --with pillow python tools/qa/lipsync.py <base> <outprefix> [keys…]
"""
import json, sys, time
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
out = sys.argv[2]
keys = [k for k in sys.argv[3:] if not k.startswith('--')] or ['k:hello', 't:hello', 'k:sayit', 'k:great2', 's:p', 'w:pig']
OPEN = {'X': 0, 'A': 0, 'S': 42, 'D': 39, 'C': 25, 'B': 11.5, 'E': 28, 'F': 19, 'G': 8.5, 'H': 24}
ARGS = ['--autoplay-policy=no-user-gesture-required']
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    pg = b.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=2)
    # the loudness probe taps the graph BEFORE the output latency, so compare at latency 0 (the game itself subtracts
    # the real output latency: the mouth follows what is HEARD)
    if '--lat0' in sys.argv:
        pg.add_init_script("Object.defineProperty(AudioContext.prototype, 'outputLatency', { get() { return 0; } }); Object.defineProperty(AudioContext.prototype, 'baseLatency', { get() { return 0; } });")
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base, wait_until='load')
    pg.wait_for_function('!!window.__pm', timeout=20000)
    time.sleep(1.2)
    pg.mouse.click(300, 700)            # unlock audio (the hello starts: wait it out)
    time.sleep(4.5)
    print('latency', pg.evaluate("(() => { const a = __pm.audioCtx(); return [a.outputLatency, a.baseLatency, a.sampleRate]; })()"))

    # ── 1) the shapes ────────────────────────────────────────────────────────────────────────────────────────
    def mouth_box():
        return pg.evaluate("""(() => { const r = __pm.tutor.el.querySelector('.t-mouth-c').getBoundingClientRect();
          return [r.left, r.top, r.width, r.height]; })()""")
    tiles = []
    pg.evaluate("__pm.tutor.lips.testShape = null")
    time.sleep(0.6)
    x, y, w, h = mouth_box()
    clip = {'x': x - w * 0.15, 'y': y - h * 0.25, 'width': w * 1.3, 'height': h * 1.3}
    pg.screenshot(path=f'{out}_tmp.png', clip=clip)
    tiles.append(('painted', Image.open(f'{out}_tmp.png').convert('RGB')))
    for s in ['S', 'D', 'C', 'B', 'E', 'F', 'G', 'H', 'A', 'X']:
        pg.evaluate(f"(() => {{ const l = __pm.tutor.lips; l.testShape = '{s}'; l.kick(); }})()")
        time.sleep(0.45)
        pg.screenshot(path=f'{out}_tmp.png', clip=clip)
        tiles.append((s, Image.open(f'{out}_tmp.png').convert('RGB')))
    pg.evaluate("(() => { const l = __pm.tutor.lips; l.testShape = null; })()")
    tw, th = tiles[0][1].size
    sheet = Image.new('RGB', (tw * 6, (th + 30) * 2), 'white')
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(tiles):
        cx, cy = (i % 6) * tw, (i // 6) * (th + 30)
        sheet.paste(im, (cx, cy + 30)); d.text((cx + 6, cy + 4), name, fill='black', font=font)
    sheet.save(f'{out}_shapes.png')

    # ── 2) real lines ────────────────────────────────────────────────────────────────────────────────────────
    report = {}
    lanes = []
    for key in keys:
        time.sleep(0.8)
        data = pg.evaluate("""async (key) => {
          const L = __pm.tutor.lips, rows = [];
          let on = true;
          const t0 = performance.now();
          const tick = () => { rows.push([performance.now() - t0, L.shape, L.src, L.level()]); if (on) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          await __pm.say([key]);
          await new Promise((r) => setTimeout(r, 500));
          on = false;
          return rows;
        }""", key)
        cue = [r for r in data if r[2] == 'cue']
        voiced = [r[3] > 0.02 for r in cue]
        opened = [OPEN.get(r[1], 0) > 0 for r in cue]
        agree = sum(1 for v, o in zip(voiced, opened) if v == o) / max(1, len(cue))
        open_silent = sum(1 for v, o in zip(voiced, opened) if o and not v) / max(1, len(cue))
        shut_voiced = sum(1 for v, o, r in zip(voiced, opened, cue) if v and not o and r[1] != 'A') / max(1, len(cue))
        after = [r for r in data if r[2] == 'rest']
        report[key] = {'frames': len(data), 'cue_frames': len(cue), 'agree': round(agree, 3), 'open_while_silent': round(open_silent, 3),
                       'closed_while_voiced(not A)': round(shut_voiced, 3), 'shapes': ''.join(r[1] for r in cue[::3])}
        lanes.append((key, data))
    print(json.dumps(report, indent=1, ensure_ascii=False))
    print('errors', errs)

    # timeline picture
    W, LH = 1400, 150
    img = Image.new('RGB', (W, LH * len(lanes) + 20), 'white')
    d = ImageDraw.Draw(img)
    for n, (key, data) in enumerate(lanes):
        y0 = n * LH + 10
        T = max(r[0] for r in data) or 1
        d.text((8, y0), key, fill='black', font=font)
        mid = y0 + LH * 0.55
        for i in range(1, len(data)):
            xa, xb = 10 + data[i - 1][0] / T * (W - 20), 10 + data[i][0] / T * (W - 20)
            lv = min(1, data[i][3] / 0.2)
            d.rectangle((xa, mid - lv * 50, xb, mid), fill=(120, 170, 230))                 # loudness (up)
            op = OPEN.get(data[i][1], 0) / 42 if data[i][2] != 'rest' else 0
            d.rectangle((xa, mid + 2, xb, mid + 2 + op * 50), fill=(232, 96, 120))           # mouth opening (down)
        d.line((10, mid + 1, W - 10, mid + 1), fill='gray')
    img.save(f'{out}_timeline.png')
    b.close()
