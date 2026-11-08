"""Title swirl check: do the floating letters ever touch each other? Drives the real Title.frame(t) over one cycle
(headless Chrome, never the user's browser), reads each letter's on-screen transform, rasterises its alpha at 1/Q scale
and reports per letter pair the closest approach (stage px; overlap area when they overlap) + a contact sheet.
uv run --with playwright --with pillow --with numpy --with scipy python tools/qa/title_orbit.py <base> <outprefix>"""
import pathlib
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parents[2]
base = sys.argv[1].rstrip('/') + '/'
out = sys.argv[2]
SW, SH, Q, FPS = 2752, 1536, 4, 30
SHEET_T = [1.3, 1.7, 2.1, 2.6, 3.2, 3.8, 4.4, 5.0, 5.6, 6.0, 6.4, 6.8]
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 26)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + '?seed=7', wait_until='load')
    pg.wait_for_function('!!window.__pm', timeout=20000)
    time.sleep(1.0)
    data = pg.evaluate("""(fps) => {
      const T = __pm.title; T.stop();
      const trail = __pm.fx.trail; __pm.fx.trail = () => {};
      const els = T.ls.map((l) => l.el);
      const names = els.map((e) => e.src.split('/').pop().replace('.webp', ''));
      const cycle = T.cycle ?? 11, frames = [];
      for (let i = 0; i <= cycle * fps; i++) {
        T.frame(i / fps);
        frames.push(els.map((e) => { const m = new DOMMatrix(getComputedStyle(e).transform);
          return [m.a, m.b, m.c, m.d, m.e, m.f, e.offsetWidth, e.offsetHeight]; }));
      }
      __pm.fx.trail = trail;
      return { names, frames, cycle };
    }""", FPS)
    shots = []
    for t in SHEET_T:
        pg.evaluate(f"__pm.title.frame({t})")
        time.sleep(0.05)
        path = f'{out}_t{t:.1f}.png'
        pg.screenshot(path=path)
        shots.append((t, path))
    pg.evaluate("__pm.title.start()")
    print('page errors', errs)
    b.close()

names, frames = data['names'], data['frames']
alpha = {}
for n in names:
    im = Image.open(ROOT / 'public' / 'art' / f'{n}.webp').convert('RGBA')
    alpha[n] = im.split()[3]


def mask(n, a, b_, c, d, e, f, w, h):
    """element px p → stage = M (p - o) + (e, f) + o, o = centre; PIL wants output → input"""
    img = alpha[n]
    iw, ih = img.size
    sx, sy = iw / w, ih / h
    det = a * d - b_ * c
    ia, ib, ic, id_ = d / det, -c / det, -b_ / det, a / det       # M⁻¹ = [[ia, ib], [ic, id]]
    ox, oy = w / 2, h / 2
    # p = M⁻¹ (Q X - e - ox, Q Y - f - oy) + o ; image px = p * (sx, sy)
    tx, ty = -e - ox, -f - oy
    coef = (sx * ia * Q, sx * ib * Q, sx * (ia * tx + ib * ty + ox),
            sy * ic * Q, sy * id_ * Q, sy * (ic * tx + id_ * ty + oy))
    m = img.transform((SW // Q, SH // Q), Image.AFFINE, coef, resample=Image.BILINEAR)
    return np.asarray(m) > 127


pairs = {}
for fi, fr in enumerate(frames):
    ms = [mask(n, *v) for n, v in zip(names, fr)]
    dist = [None] * len(ms)
    for i in range(len(ms)):
        for j in range(i + 1, len(ms)):
            key = (names[i], names[j])
            ov = int((ms[i] & ms[j]).sum())
            if ov:
                gap = -ov * Q * Q                                     # overlap area (stage px²), negative
            else:
                if dist[i] is None:
                    dist[i] = ndi.distance_transform_edt(~ms[i])
                gap = float(dist[i][ms[j]].min()) * Q if ms[j].any() else 9999
            best = pairs.get(key)
            if best is None or gap < best[0]:
                pairs[key] = (gap, fi / FPS)

print(f'{len(frames)} frames over {data["cycle"]} s · closest approach per pair (stage px; negative = overlap area px²):')
for key, (gap, t) in sorted(pairs.items(), key=lambda kv: kv[1][0]):
    flag = 'OVERLAP' if gap < 0 else ('close' if gap < 40 else '')
    print(f'  {key[0]:9s} ↔ {key[1]:9s} {gap:9.0f} at t={t:5.2f}s  {flag}')
bad = [k for k, (g, _t) in pairs.items() if g < 40]
print('pairs under 40 px:', len(bad))

W, H = 640, 360
sheet = Image.new('RGB', (W * 4, (H + 36) * 3), 'white')
d = ImageDraw.Draw(sheet)
for i, (t, path) in enumerate(shots):
    im = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
    x, y = (i % 4) * W, (i // 4) * (H + 36)
    sheet.paste(im, (x, y + 36))
    d.text((x + 8, y + 4), f't = {t:.1f} s', fill='black', font=font)
sheet.save(f'{out}_sheet.png')
print('sheet', f'{out}_sheet.png')
