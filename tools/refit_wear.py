"""Wearable art refit that a position (`at`) can't express (user: "드레스업에 있는 아이템들 캐릭터에 제대로 어울리게 위치
배치할거야 장갑, 신발, 헤드셋, 망또 4개 다시 위치 잡아봐"). Source = the untouched art in design/work/orig/.
- item_phones (the two ear cups, no band, one 660×680 overlay at [330, 340, 660, 0]): the cups sat on the cheeks; they
  move to the head's sides just above eye level, ×0.75, tilted with the face (+8.6°): left (138, 236) — the raised
  left hand is right beside the head at eye level, so the cup sits above it (0 px over the mitten and the eye) — and
  the right one mirrored across the tilted face axis, (592, 305). The overlay keeps its size, so `at` doesn't change.
(The cape is the other session's: items.ts `h` crop.)
  uv run --with pillow --with numpy --with scipy python tools/refit_wear.py"""
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'design' / 'work' / 'orig', ROOT / 'public' / 'art'
CUPS = {'left': ((138, 236), 8.6), 'right': ((592, 305), 8.6)}
CUP_SCALE = 0.75

ph = Image.open(SRC / 'item_phones.webp').convert('RGBA')
a = np.asarray(ph)[..., 3] > 24
lab, n = ndi.label(a)
cups = []
for k in range(1, n + 1):
    if (lab == k).sum() < 500:
        continue
    sl = ndi.find_objects((lab == k).astype(int))[0]
    piece = np.asarray(ph)[sl].copy()
    piece[..., 3] = np.where(lab[sl] == k, piece[..., 3], 0)          # this cup only
    cups.append(((sl[1].start + sl[1].stop) / 2, Image.fromarray(piece)))
cups.sort(key=lambda t: t[0])
assert len(cups) == 2, f'expected 2 cups, found {len(cups)}'
cv = Image.new('RGBA', ph.size, (0, 0, 0, 0))
for (_, cup), side in zip(cups, ('left', 'right')):
    (cx, cy), rot = CUPS[side]
    c = cup.resize((round(cup.size[0] * CUP_SCALE), round(cup.size[1] * CUP_SCALE)), Image.LANCZOS).rotate(-rot, expand=True, resample=Image.BICUBIC)
    cv.alpha_composite(c, (round(cx - c.size[0] / 2), round(cy - c.size[1] / 2)))
cv.save(OUT / 'item_phones.webp', 'WEBP', quality=92, method=6)
print('item_phones', cv.size, 'cups at', {s: v[0] for s, v in CUPS.items()}, (OUT / 'item_phones.webp').stat().st_size // 1024, 'KB')
