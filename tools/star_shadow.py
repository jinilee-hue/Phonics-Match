"""Result-card stars with a smaller contact shadow (user: "결과에 그림자 별 밑에 그림자가 너무 커").
The Gemini stars came with a big baked shadow (design/work/orig/star_gold.webp, star_dim.webp — the untouched
originals, this script's only input). The star is split from its shadow (core = opaque golden pixels of the gold one,
holes filled; a 1.5-px anti-aliased rim coloured from its nearest core pixel; the dim star shares the alpha), then a
new soft elliptical shadow is drawn under it — centred under the legs, `K` × the old one's spread, `P` × its strength,
in each image's own shadow colour — and the star composited over it. Same canvas, so CSS sizes don't change.
  uv run --with pillow --with numpy --with scipy python tools/star_shadow.py [K P] [--out DIR]
(no DIR → public/art). K 0 → no shadow."""
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'work' / 'orig'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
K = float(args[0]) if args else 0.55
P = float(args[1]) if len(args) > 1 else 0.75
OUT = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else ROOT / 'public' / 'art'


def load(name):
    return np.asarray(Image.open(SRC / f'{name}.webp').convert('RGBA')).astype(float)


gold = load('star_gold')
R, G, A = gold[..., 0], gold[..., 1], gold[..., 3]
core = (A >= 200) & (G >= 135) & (R >= 205)
core = ndi.binary_opening(core, iterations=1)
lab, n = ndi.label(core)
core = ndi.binary_fill_holes(lab == (np.bincount(lab.ravel())[1:].argmax() + 1))
dist, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
star_a = np.where(core, A, np.minimum(A, 255 * np.clip(1 - (dist - 0.5) / 1.5, 0, 1)))
H, W = A.shape
ys, xs = np.nonzero(core)
# the old shadow: what is left outside the star (2+ px out, past the rim), alpha-weighted
old = np.clip(A - star_a, 0, 255) * (dist > 2.5)
yy, xx = np.mgrid[0:H, 0:W]
w = old / old.sum()
ocx, ocy = (w * xx).sum(), (w * yy).sum()
osx = np.sqrt((w * (xx - ocx) ** 2).sum())
legs = ys.max()                                                     # the star's lowest point
below = old[legs:, :]
osy = max(4.0, np.sqrt((below / below.sum() * (np.arange(legs, H)[:, None] - legs) ** 2).sum()))
peak = old.max()
print(f'star x {xs.min()}-{xs.max()} y {ys.min()}-{legs} · old shadow: centre x {ocx:.0f}, spread x {osx:.0f}, reach below the legs {osy:.0f}, peak alpha {peak:.0f}')


def shadow_rgb(src):
    m = old > 20
    return (src[..., :3][m] * old[m, None]).sum(0) / old[m].sum()


for name in ('star_gold', 'star_dim'):
    src = load(name)
    rgb = src[..., :3].copy()
    rim = ~core & (star_a > 0)
    rgb[rim] = src[iy[rim], ix[rim], :3]
    out = np.zeros((H, W, 4))
    if K > 0:
        sx, sy = osx * K * 1.25, osy * K * 1.6                        # gaussian spread → visible ellipse ≈ K × the old one
        cy = legs - sy * 0.6
        g = np.exp(-(((xx - ocx) / sx) ** 2 + ((yy - cy) / sy) ** 2) / 2)
        sa = peak * P * g
        out[..., :3] = shadow_rgb(src)
        out[..., 3] = sa
    # star over the shadow (straight alpha "over")
    a1 = star_a / 255; a0 = out[..., 3] / 255
    ao = a1 + a0 * (1 - a1)
    co = (rgb * a1[..., None] + out[..., :3] * (a0 * (1 - a1))[..., None]) / np.maximum(ao, 1e-6)[..., None]
    img = Image.fromarray(np.dstack([co, ao * 255]).clip(0, 255).astype(np.uint8))
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f'{name}.webp'
    img.save(p, 'WEBP', quality=92, method=6)
    vis = (ao * 255 > 8) & ~core & (dist > 2.5)
    vy = np.nonzero(vis.any(1))[0]
    print(f'{name}: K {K} P {P} → {p} ({p.stat().st_size // 1024} KB) · visible shadow below the legs: {max(0, vy.max() - legs) if len(vy) else 0} px (old {595 - legs})')
