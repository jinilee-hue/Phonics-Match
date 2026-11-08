"""The mockup's stars and speed marks next to the floating letters, as sprites that ride with their letter (user: "인트로에
알파벳 돌아다닐대 옆에 별이미지랑 스피드 표시 나는 표시들 배경 바꾸면서 빠져버렸어" → "스펠링이랑 별들이랑 별밑에 꾸미는
에셋이미지들은 단어들이랑 같이 움직이게 모션을 만들어야지?"). Painting them into the background left them behind when the
letters flew off.

The user's clean background has none of them and is a different picture from the mockup (median pixel diff 6, p75 25), so
they are matted out of the old processed background (design/work/bg_title_smooth.png), one box each: the pixels that stand
out from their own surroundings AND are gone in the new picture (components inside the box only, so cloud edges that differ
are left out) → the old picture's background under them (membrane fill) → alpha by projecting each pixel onto (nearest core
colour − background); the core (holes filled — a star's flat middle has no contrast) is opaque. Boxes are matted one after
the other against the picture with the earlier marks already on it, so a mark inside two padded boxes is taken once.
Each sprite belongs to the letter whose box is nearest; ui/title.ts moves it with that letter (translate, rotate, flip,
depth scale, fade) and keeps it under the letters of its layer.
  build: tools/build_art.py bg (calls export) · alone: uv run --with pillow --with numpy --with scipy python tools/title_deco.py
  (alone it also writes design/work/title_deco_sprites.png: the sprites on the clean background, boxed with their letter)"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from membrane import membrane

ROOT = Path(__file__).resolve().parent.parent
OLD = ROOT / 'design' / 'work' / 'bg_title_smooth.png'   # the mockup with the logo/letters/tutor filled out: has the marks
OUT = ROOT / 'public' / 'art'
DATA = ROOT / 'src' / 'data' / 'deco.json'
LETTERS = ['l_m_red', 'l_a_blue', 'l_t_top', 'l_p_top', 'l_m_blue', 'l_t_bot', 'l_p_bot']
# boxes (design px) of the marks around the letters' home spots, from a diff of the two backgrounds
BOXES = [
    (2027, 152, 2118, 242),    # red star by the top T
    (2094, 248, 2126, 333),    # swoosh under it
    (2070, 395, 2175, 505),    # swoosh + dots
    (2305, 148, 2398, 252),    # orange dashes between the top T and P
    (2562, 355, 2638, 452),    # pink dashes
    (198, 268, 278, 364),      # orange dashes by the red M
    (557, 330, 624, 398),      # yellow sparkle
    (403, 518, 470, 584),      # pink star
    (466, 462, 606, 567),      # white swooshes + green dot
    (507, 617, 592, 700),      # yellow star
    (100, 669, 167, 755),      # yellow dashes by the blue M
    (751, 670, 816, 758),      # orange dashes by the A
    (557, 782, 666, 889),      # blue swoosh + yellow sparkle
    (324, 849, 423, 936),      # teal swooshes
    (1216, 1246, 1325, 1385),  # red star + dot + swirl by the bottom T
    (1915, 1160, 2000, 1262),  # orange dashes by the bottom P
    (1833, 1357, 1950, 1459),  # swooshes under it
]
PAD = 18


def _mark(O, N):
    """O, N: the same crop of the old / new picture (float RGB) → alpha, colour of the old picture's mark in it"""
    h, w = O.shape[:2]
    # a mark stands out from the old picture's own surroundings (so leaves or clouds that only the new picture has, or
    # soft cloud areas that differ, aren't taken) and is gone in the new one
    contrast = np.abs(O - ndi.gaussian_filter(O, (6, 6, 0), mode='nearest')).max(2)
    m = (contrast > 16) & (np.abs(O - N).max(2) > 24)
    m = ndi.binary_closing(m, iterations=2) & (np.abs(O - N).max(2) > 12)
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    seed = np.zeros_like(m)
    for i, sl in enumerate(ndi.find_objects(lab)):
        comp = lab[sl] == i + 1
        if comp.sum() < 12 or sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == h or sl[1].stop == w:
            continue                                            # tiny, or runs out of the box (a cloud edge that differs)
        seed[sl] |= comp
    if not seed.any():
        return np.zeros((h, w)), O
    U = ndi.binary_fill_holes(ndi.binary_dilation(seed, iterations=5))   # (a star's flat middle has no contrast: fill it)
    B = membrane(O, U)
    dist = np.sqrt(((O - B) ** 2).sum(2))
    core = ndi.binary_fill_holes((dist > max(28.0, 0.35 * np.percentile(dist[seed], 90))) & U)
    if not core.any():
        return np.zeros((h, w)), O
    idx = ndi.distance_transform_edt(~core, return_indices=True)[1]
    F = O[idx[0], idx[1]]
    a = np.clip(((O - B) * (F - B)).sum(2) / (((F - B) ** 2).sum(2) + 1e-6), 0, 1)
    a[core] = 1
    a[~U] = 0
    a[a < 0.05] = 0
    return a, np.where(core[..., None], O, F)


def export(new: Image.Image):
    """the marks as public/art/deco_NN.webp + src/data/deco.json [{src, x, y, w, h, of}] (design px, the letter it rides with)"""
    if not OLD.exists():
        print('title marks: missing', OLD)
        return []
    old = np.asarray(Image.open(OLD).convert('RGB')).astype(np.float32)
    cur = np.asarray(new.convert('RGB')).astype(np.float32).copy()
    H, W = cur.shape[:2]
    art = json.loads((ROOT / 'src' / 'data' / 'art.json').read_text())

    def gap(n, X0, Y0, X1, Y1):
        b = art[n]
        dx = max(0, b['x'] - X1, X0 - (b['x'] + b['w']))
        dy = max(0, b['y'] - Y1, Y0 - (b['y'] + b['h']))
        return float(np.hypot(dx, dy))

    for p in OUT.glob('deco_*.webp'):
        p.unlink()
    out = []
    for i, (x0, y0, x1, y1) in enumerate(BOXES):
        x0, y0, x1, y1 = max(0, x0 - PAD), max(0, y0 - PAD), min(W, x1 + PAD), min(H, y1 + PAD)
        a, col = _mark(old[y0:y1, x0:x1], cur[y0:y1, x0:x1])
        cur[y0:y1, x0:x1] = cur[y0:y1, x0:x1] * (1 - a[..., None]) + col * a[..., None]
        ys, xs = np.nonzero(a > 0.02)
        if not len(xs):
            print('title mark', i, 'empty')
            continue
        bx0, by0 = max(0, xs.min() - 3), max(0, ys.min() - 3)
        bx1, by1 = min(a.shape[1], xs.max() + 4), min(a.shape[0], ys.max() + 4)
        rgba = np.dstack([col[by0:by1, bx0:bx1], a[by0:by1, bx0:bx1, None] * 255])
        name = f'deco_{i:02d}'
        Image.fromarray(np.clip(rgba + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(OUT / f'{name}.webp', 'WEBP', lossless=True, quality=100, method=6)
        X0, Y0, X1, Y1 = x0 + bx0, y0 + by0, x0 + bx1, y0 + by1
        of = min(LETTERS, key=lambda n: gap(n, X0, Y0, X1, Y1))
        out.append({'src': f'art/{name}.webp', 'x': int(X0), 'y': int(Y0), 'w': int(X1 - X0), 'h': int(Y1 - Y0), 'of': of})
    DATA.write_text(json.dumps(out, indent=1) + '\n')
    print('title marks:', len(out), 'sprites →', DATA.relative_to(ROOT), '·', {n: sum(d['of'] == n for d in out) for n in LETTERS})
    return out


if __name__ == '__main__':
    from PIL import ImageDraw, ImageFont
    new = Image.open(ROOT / 'design' / 'phonics_match_bg.png').convert('RGB')
    marks = export(new)
    art = json.loads((ROOT / 'src' / 'data' / 'art.json').read_text())
    im = new.copy().convert('RGBA')
    for d in marks:
        im.alpha_composite(Image.open(ROOT / 'public' / d['src']).convert('RGBA'), (d['x'], d['y']))
    dr = ImageDraw.Draw(im)
    f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
    COL = {'l_m_red': (230, 40, 40), 'l_a_blue': (40, 90, 230), 'l_t_top': (20, 150, 40), 'l_p_top': (230, 60, 160),
           'l_m_blue': (40, 160, 230), 'l_t_bot': (90, 120, 20), 'l_p_bot': (170, 40, 120)}
    for n in LETTERS:
        b = art[n]
        dr.rectangle([b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']], outline=COL[n], width=4)
        dr.text((b['x'] + 6, b['y'] + 4), n[2:], fill=COL[n], font=f)
    for d in marks:
        dr.rectangle([d['x'], d['y'], d['x'] + d['w'], d['y'] + d['h']], outline=COL[d['of']], width=3)
    im.convert('RGB').resize((1376, 768), Image.LANCZOS).save(ROOT / 'design' / 'work' / 'title_deco_sprites.png')
    print('check:', ROOT / 'design' / 'work' / 'title_deco_sprites.png')
