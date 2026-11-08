"""The tutor's feet inside the shoes: a mask for the body image (alpha 0 = cut) that trims every bit of FOOT left outside the
shoes — the outer top corners beside the toe caps and the slivers under the soles (user: "신발은 발에 신겨야지", "다리에 맞게
들어간거 맞아?"). Foot = the body's protrusions under the ball (alpha minus an opening with a 70-px disk); the shoes are
stamped with tutor.wear()'s CSS math from src/ui/items.ts (centre, width, clockwise rotation, flip first) — rerun this
whenever the shoes' `pieces` change. tutor.ts applies the mask while the shoes are on.
  uv run --with pillow --with numpy --with scipy python tools/feet_mask.py [--sheet out.png]"""
import pathlib
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / 'public' / 'art'
body = Image.open(ART / 'tutor_body.webp').convert('RGBA')
shoe = Image.open(ART / 'item_shoes.webp').convert('RGBA')
W, H = body.size
A = np.asarray(body)[..., 3] > 128
yy, xx = np.mgrid[-70:71, -70:71]
ball = ndi.binary_opening(A, structure=xx ** 2 + yy ** 2 <= 70 ** 2)
lab, n = ndi.label(ball)
ball = lab == (np.argmax(ndi.sum(ball, lab, range(1, n + 1))) + 1)
prot = A & ~ndi.binary_dilation(ball, iterations=2)       # what sticks out of the ball: arms, tuft, feet

block = re.search(r"id: 'shoes'.*?pieces: \[(.*?)\n\s*\]\s*\}", (ROOT / 'src/ui/items.ts').read_text(), re.S).group(1)
pieces = [(list(map(float, m.group(1).split(','))), bool(m.group(2)))
          for m in re.finditer(r"at: \[([-\d., ]+)\]\s*(?:,\s*(flip: true))?", block)]
covered = np.zeros((H, W), bool)
for (cx, cy, w, rot), flip in pieces:
    im = shoe.resize((round(w), round(w * shoe.size[1] / shoe.size[0])), Image.LANCZOS)
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.rotate(-rot, expand=True, resample=Image.BICUBIC)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    layer.alpha_composite(im, (round(cx - im.width / 2), round(cy - im.height / 2)))
    covered |= np.asarray(layer)[..., 3] > 100
if len(pieces) != 2: sys.exit(f'expected 2 shoes in items.ts, found {len(pieces)}')
feet = np.zeros((H, W), bool)
for (cx, cy, _w, _r), _f in pieces:                       # each foot = the biggest protrusion around its shoe
    near = np.zeros((H, W), bool); near[max(0, int(cy) - 110):H, max(0, int(cx) - 110):int(cx) + 110] = True
    fl, fn = ndi.label(prot & near)
    if fn: feet |= fl == (np.argmax(ndi.sum(prot & near, fl, range(1, fn + 1))) + 1)
cut = feet & ~covered
cut = ndi.binary_dilation(cut, iterations=3) & ~ball & ndi.binary_dilation(feet, iterations=4)   # + the foot's soft edge, never the ball or other fur
keep = np.clip(ndi.distance_transform_edt(~cut) / 2.5, 0, 1)   # 2.5-px feather
mask = np.zeros((H, W, 4), np.uint8); mask[..., :3] = 255; mask[..., 3] = (keep * 255).round().astype(np.uint8)
Image.fromarray(mask).save(ART / 'tutor_feet_mask.webp', lossless=True, quality=100, method=6)
print(f'{len(pieces)} shoes from items.ts · cut {int(cut.sum())} px of foot outside them → public/art/tutor_feet_mask.webp')
if '--sheet' in sys.argv:
    out = sys.argv[sys.argv.index('--sheet') + 1]
    a = np.asarray(body).copy(); a[..., 3] = (a[..., 3] * keep).astype(np.uint8)
    Image.fromarray(a).crop((150, 520, 530, 690)).resize((760, 340), Image.LANCZOS).save(out); print('sheet', out)
