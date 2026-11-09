"""Cut the counters (the enclosed holes of A and P) out of the title letters (user: "인트로에 움직이는 알파벳에 누끼 제대로
안따져서 배경 컬러 달라지면 표시나. p와 a 알파벳"): the cut left the holes opaque, filled with the mockup's background
(cream in the P's, sky blue in the A), which showed as soon as a letter flew over another colour.

Per letter: seed = the largest pale component (far from the letter's own colour) that never reaches the sprite's
transparent outside; hole H = every pixel connected to it that is nearer the hole colour than the letter's. Deep inside
H → transparent; on its ±1-2 px edge the alpha comes from projecting the pixel onto (nearest letter colour − hole
colour), and the colour becomes that letter colour (decontaminated). Everything else is left exactly as it was.

  uv run --with pillow --with numpy --with scipy python tools/letter_counters.py           # fix public/art in place
  uv run --with pillow --with numpy --with scipy python tools/letter_counters.py --sheet x.png --dry   # preview only
The untouched sprites are kept in design/work/orig/ (copied there on the first run) and are always the input, so a
re-run never cuts twice. build_art.py's title_pieces() calls fix() on freshly cut letters too."""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from matte import bleed, dil, ero  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'art'
ORIG = ROOT / 'design' / 'work' / 'orig'
NAMES = ['l_a_blue', 'l_p_top', 'l_p_bot']          # the title letters with a counter (M and T have none)


def fix(rgba: np.ndarray, log=print):
    """rgba uint8 H×W×4 → (fixed rgba uint8, info)"""
    C = rgba[..., :3].astype(np.float32); a = rgba[..., 3].astype(np.float32) / 255
    mx, mn = C.max(-1), C.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    opaque = a > 0.98
    outside = ndi.binary_dilation(a < 0.5, iterations=3)            # the transparent surround (+3 px)
    body = np.logical_and(opaque, ~outside)
    L = np.median(C[np.logical_and(body, sat > np.percentile(sat[body], 40))], 0)   # the letter's own colour
    # pale candidates: far from the letter colour
    dL = np.linalg.norm(C - L, axis=-1)
    pale = np.logical_and(body, dL > 0.55 * np.percentile(dL[body], 99))
    lab, k = ndi.label(pale)
    if not k:
        return rgba, {'hole': 0}
    sizes = ndi.sum(pale, lab, range(1, k + 1))
    seed_id = int(np.argmax(sizes)) + 1
    seed = lab == seed_id
    core = ero(seed, 2) if ero(seed, 2).sum() > 20 else seed
    B = np.median(C[core], 0)                                         # the hole's colour
    LB = L - B
    # grow: connected pixels nearer the hole colour than the letter's
    t_glob = ((C - B) @ LB) / float(LB @ LB)
    cand = np.logical_and(a > 0.5, t_glob < 0.5)
    lab2, _ = ndi.label(cand)
    ids = np.unique(lab2[seed]); ids = ids[ids > 0]
    H = np.isin(lab2, ids)
    if np.logical_and(H, outside).any():
        log('  hole touches the outside — skipped'); return rgba, {'hole': 0}
    band = np.logical_and(dil(H, 2), ~ero(H, 1))
    pure = np.logical_and(opaque, ~dil(H, 2))
    _, (iy, ix) = ndi.distance_transform_edt(~pure, return_indices=True)
    F = C[iy, ix]                                                     # nearest pure letter colour
    FB = F - B
    t = np.clip(((C - B) * FB).sum(-1) / np.maximum((FB * FB).sum(-1), 1e-3), 0, 1)
    k_ = np.ones_like(a)
    k_[band] = t[band]
    k_[ero(H, 1)] = 0
    a2 = a * k_
    C2 = C.copy()
    C2[band] = F[band]
    C2 = bleed(C2, a2)
    out = np.dstack([np.clip(C2, 0, 255), np.clip(a2 * 255, 0, 255)]).astype(np.uint8)
    info = {'hole': int(H.sum()), 'band': int(band.sum()), 'B': [round(float(v)) for v in B], 'L': [round(float(v)) for v in L],
            'seed': int(seed.sum()), 'components': k}
    return out, info


def fix_file(n, fresh=False, write=True):
    """public/art/<n>.webp from its untouched copy in design/work/orig/. fresh=True (build_art.py just cut the letter):
    the new cut becomes that copy first."""
    ORIG.mkdir(parents=True, exist_ok=True)
    src = ORIG / f'{n}.webp'
    if fresh or not src.exists():
        shutil.copy2(OUT / f'{n}.webp', src)
    rgba = np.asarray(Image.open(src).convert('RGBA'))
    fixed, info = fix(rgba)
    print(n, 'counter cut', info, flush=True)
    if write and info['hole']:
        Image.fromarray(fixed, 'RGBA').save(OUT / f'{n}.webp', 'WEBP', quality=90, alpha_quality=100, method=6, exact=True)
    return rgba, fixed, info


def main():
    dry = '--dry' in sys.argv
    sheet_path = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    pairs = []
    for n in NAMES:
        rgba, fixed, _ = fix_file(n, write=not dry)
        pairs.append((n, rgba, fixed))
    if sheet_path:
        from PIL import ImageDraw
        Hh = 240; cells = []
        for n, before, after in pairs:
            row = []
            for im in (before, after):
                for bg in ((255, 0, 255), (30, 30, 80), (120, 200, 120)):
                    c = Image.new('RGBA', (im.shape[1], im.shape[0]), bg + (255,)); c.alpha_composite(Image.fromarray(im, 'RGBA'))
                    row.append(c.convert('RGB').resize((round(im.shape[1] * Hh / im.shape[0]), Hh)))
            cells.append((n, row))
        W = max(sum(c.width + 6 for c in r) for _, r in cells) + 30
        sh = Image.new('RGB', (W, len(cells) * (Hh + 30) + 10), 'white'); d = ImageDraw.Draw(sh)
        for k, (n, r) in enumerate(cells):
            x = 0; d.text((4, k * (Hh + 30) + 4), f'{n}: before (3) | after (3)', fill='black')
            for j, c in enumerate(r):
                if j == 3: x += 24
                sh.paste(c, (x, k * (Hh + 30) + 22)); x += c.width + 6
        sh.save(sheet_path); print(sheet_path)


if __name__ == '__main__':
    main()
