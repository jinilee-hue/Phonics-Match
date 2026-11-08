"""Board tiles from the FPR K animal art: one FACE size for every animal.

The new tiles (design/tiles/a_<id>.webp — 320 px, made in Cursor from its Gemini pictures) were fitted by bounding box,
so a round head with nothing sticking out (ant, cat, duck…) came out ~20 % bigger than one with ears or antennae, and
bigger than the mockup's monkey / tiger / pig (user: "ant 얼굴이 너무 커. 다른 동물들 얼굴이랑 맞춰줘").
Face size = the diameter of the largest disk inside the alpha (ears, antennae, tentacles and legs don't count). Each tile
is scaled so its face equals the mockup trio's mean (monkey / tiger / pig, built by build_art.py animals), × SIZE_K,
capped so the picture stays inside its board slot (17 px margins; at 2 px the rabbit's ears left the cell, user:
"rabbit은 커서 영역을 벗어나네"); the goat keeps 28 px for its horns and beard (MARGIN_OF; user: "염소도 뿔과 수염이
있어서 여백이 없어", "염소만 좀 작게"); rabbit and kangaroo, whose ears forced ~20 % smaller faces, are out of the game;
centred on its bounding box.
The worm has no head blob: it matches √(alpha area) instead.
  uv run --with pillow --with numpy --with scipy python tools/tiles.py [ids…]   (then check: tools/tiles.py --sheet)"""
import hashlib
import json
import pathlib
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from scipy.optimize import minimize
from scipy.spatial import ConvexHull

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'design' / 'tiles', ROOT / 'public' / 'art'
PX, MARGIN = 320, 17                    # = the board slot (246 of the 270 piece): less and tall ears leave the cell
# per-tile margins: the goat's horns and beard get some air while its face stays close to the rest (user: "염소만 좀
# 작게 넣으면 다른 동물들이랑 얼굴 크기가 비슷한거 아냐?"). A 34-px rule for every tile near the slot shrank six faces
# ~12 % — the big-eared rabbit and kangaroo left the game instead ("귀가 큰 캥거루와 토끼는 빼도 될까?").
MARGIN_OF: dict[str, int] = {'goat': 28}
TRIO = ('monkey', 'tiger', 'pig')                       # the mockup cuts (tools/build_art.py animals) = the reference
IDS = ('mouse', 'ant', 'seal', 'turtle', 'puppy', 'iguana', 'cat', 'cow', 'fish', 'duck', 'dog', 'hen', 'horse', 'octopus', 'rat', 'bear', 'bee', 'lion', 'elephant', 'goat', 'fox', 'zebra')
STAMP = SRC / 'built.json'                              # sha1 of each tile written here
BY_AREA = {'worm'}
# the other themes (user: "과일이 너무 큰거 아냐?" — Cursor fitted them by bounding box). Fruit first matched the animals'
# FACE, but a round fruit is all face, so it weighed as much as a whole animal ("과일은 아직도 좀 큰감이 있는데") → fruit
# take the things' rule. Things (user: "사물에도 너무 이미지들이 크게 들어갔어"): the animals' √area
# counts their ears, so a thing at √area 207 outweighed the faces and long ones ran to the cell edge → a thing gets the
# area of a face disk (T_face·√π/2 ≈ 184) and at most THING_CIRCLE across (smallest enclosing circle: a diagonal pencil's
# length, a van's diagonal) = the animal tiles' median bounding box. Their ids carry the file prefix.
THING_CIRCLE = 244
FRUIT = ('f_apple', 'f_egg', 'f_grape', 'f_lemon', 'f_peach', 'f_pear', 'f_watermelon')
THINGS = tuple(f'o_{w}' for w in ('ax', 'ball', 'box', 'bus', 'car', 'cup', 'doll', 'door', 'engine', 'fan', 'fork', 'gift', 'hat',
    'ink', 'jar', 'jet', 'key', 'kite', 'lamp', 'lock', 'mop', 'mug', 'nail', 'net', 'pencil', 'pot', 'quilt', 'ring', 'robot',
    'soap', 'sock', 'table', 'tent', 'umbrella', 'van', 'violin', 'wagon', 'window', 'yarn', 'zipper'))
stem = lambda id_: id_ if id_[:2] in ('f_', 'o_') else f'a_{id_}'      # the file name (animals keep plain ids)
SIZE_K: dict[str, float] = {'octopus': 1.05}   # its dome reads small over the tentacles


def alpha(im: Image.Image) -> np.ndarray:
    return np.asarray(im.convert('RGBA'))[..., 3] > 128


def face(a: np.ndarray) -> float:
    return 2 * float(ndi.distance_transform_edt(a).max())


def area(a: np.ndarray) -> float:
    return float(np.sqrt(a.sum()))


def circle(a: np.ndarray) -> float:
    """diameter of the smallest circle round the alpha (convex hull + minimax centre)"""
    ys, xs = np.nonzero(a)
    pts = np.c_[xs, ys].astype(float)
    hull = pts[ConvexHull(pts).vertices]
    far = lambda c: float(np.sqrt(((hull - c) ** 2).sum(1)).max())
    c0 = np.array([(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2])
    return 2 * minimize(far, c0, method='Nelder-Mead', options={'xatol': .05, 'fatol': .02}).fun + 1


def target():
    ims = [alpha(Image.open(OUT / f'a_{t}.webp')) for t in TRIO]
    return float(np.mean([face(a) for a in ims])), float(np.mean([area(a) for a in ims]))


def sha(p: pathlib.Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()


def adopt(ids):
    """a public/art tile that isn't the one written here was replaced by someone (Cursor re-cuts tiles too): it becomes
    the source, so a re-run never puts the old picture back"""
    built = json.loads(STAMP.read_text()) if STAMP.exists() else {}
    for id_ in ids:
        live, src = OUT / f'{stem(id_)}.webp', SRC / f'{stem(id_)}.webp'
        if live.exists() and (not src.exists() or (id_ in built and sha(live) != built[id_])):
            shutil.copy2(live, src); print('adopted', live.name, '(replaced since the last run) as the new source')


def build(ids):
    adopt(ids)
    built = json.loads(STAMP.read_text()) if STAMP.exists() else {}
    T_face, T_area = target()
    print(f'target face {T_face:.1f} px · √area {T_area:.1f} px (mean of {", ".join(TRIO)})')
    for id_ in ids:
        im = Image.open(SRC / f'{stem(id_)}.webp').convert('RGBA')
        a = alpha(im)
        ys, xs = np.nonzero(a)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        if id_[:2] in ('o_', 'f_'):                                # things + fruit: a face disk's area, ≤ THING_CIRCLE across
            k = min(T_face * np.sqrt(np.pi) / 2 / area(a), THING_CIRCLE / circle(a))
        else:
            k = (T_area / area(a)) if id_ in BY_AREA else (T_face / face(a))
        k *= SIZE_K.get(id_, 1.0)
        cap = (PX - 2 * MARGIN_OF.get(id_, MARGIN)) / max(x1 - x0, y1 - y0)
        s = min(k, cap)
        crop = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.float32) / 255
        pre = crop.copy(); pre[..., :3] *= pre[..., 3:4]                      # premultiplied: no dark fringe when resampling
        w, h = max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))
        res = np.stack([np.asarray(Image.fromarray(pre[..., c]).resize((w, h), Image.LANCZOS)) for c in range(4)], -1)
        res = np.clip(res, 0, 1)
        rgb = np.where(res[..., 3:4] > 1e-4, res[..., :3] / np.maximum(res[..., 3:4], 1e-4), 0)
        out = np.zeros((PX, PX, 4), np.float32)
        ox, oy = (PX - w) // 2, (PX - h) // 2
        out[oy:oy + h, ox:ox + w, :3] = np.clip(rgb, 0, 1); out[oy:oy + h, ox:ox + w, 3] = res[..., 3]
        Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT / f'{stem(id_)}.webp', 'WEBP', quality=90, method=6)
        built[id_] = sha(OUT / f'{stem(id_)}.webp')
        STAMP.write_text(json.dumps(built, indent=1))
        na = alpha(Image.open(OUT / f'{stem(id_)}.webp'))
        note = ' (capped by the margins)' if s < k - 1e-6 else ''
        print(f'{id_:12s} face {face(a):6.1f} → {face(na):6.1f}  √area {area(a):6.1f} → {area(na):6.1f}  ×{s:.3f}{note}')


def sheet(ids, path):
    font = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 20)
    T, cols = 150, 8
    rows = (len(ids) + cols - 1) // cols
    sh = Image.new('RGB', (cols * (T + 8), rows * (T + 30)), (250, 236, 214))
    d = ImageDraw.Draw(sh)
    T_face, _ = target()
    for i, id_ in enumerate(ids):
        im = Image.open(OUT / f'{stem(id_)}.webp').convert('RGBA').resize((T, T), Image.LANCZOS)
        x, y = (i % cols) * (T + 8), (i // cols) * (T + 30)
        sh.paste(im, (x, y + 26), im)
        r = T_face / PX * T / 2
        d.ellipse([x + T / 2 - r, y + 26 + T / 2 - r, x + T / 2 + r, y + 26 + T / 2 + r], outline=(120, 170, 255), width=1)
        d.text((x + 4, y + 2), id_, fill=(70, 45, 25), font=font)
    sh.save(path)
    print('sheet', path, sh.size)


if __name__ == '__main__':
    have = [*IDS, *FRUIT, *THINGS]
    if '--sheet' in sys.argv:
        order = json.loads((ROOT / 'src' / 'data' / 'animal_order.json').read_text()) if (ROOT / 'src/data/animal_order.json').exists() else [*TRIO, *have]
        sheet([i for i in [*order, *FRUIT, *THINGS] if (OUT / f'{stem(i)}.webp').exists()], sys.argv[sys.argv.index('--sheet') + 1] if len(sys.argv) > sys.argv.index('--sheet') + 1 else '/tmp/tiles_sheet.png')
    else:
        build([i for i in (sys.argv[1:] or have) if i not in TRIO])
