"""Build the game's art from the reference images (design/ref_*.png) + the birefnet cuts (tools/cut_sprites.py).
→ public/art/*.webp and src/data/art.json (where each piece sits on the 2752×1536 design stage).
uv run --with pillow --with numpy --with scipy python tools/build_art.py
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from art_boxes import BOXES  # noqa: E402
from matte import bleed, clean, dil, ero, gblur, refine, smoothstep, trim_box  # noqa: E402
from membrane import membrane  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'
W = D / 'work'
CUT = W / 'cut'
OUT = ROOT / 'public' / 'art'
OUT.mkdir(parents=True, exist_ok=True)
DBG = W / 'parts'
DBG.mkdir(parents=True, exist_ok=True)
art = {}


def load_cut(name):
    im = np.asarray(Image.open(CUT / f'{name}.png').convert('RGBA')).astype(np.float32)
    return im[..., :3], im[..., 3] / 255


def save_rgba(F, a, path, size=None, q=90):
    F = bleed(F, a)
    im = Image.fromarray(np.dstack([np.clip(F, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8), 'RGBA')
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(path, 'WEBP', quality=q, alpha_quality=100, method=6, exact=True)
    return im


def sprite(name, out, keep=1, max_side=None, q=90, do_refine=True):
    """clean + decontaminate + trim one cut; returns its box on the stage"""
    I, a0 = load_cut(name)
    a0 = clean(a0, keep=keep)
    F, a = refine(I, a0) if do_refine else (I, a0)
    x0, y0, x1, y1 = trim_box(a)
    F, a = F[y0:y1, x0:x1], a[y0:y1, x0:x1]
    bx, by = BOXES[name][:2]
    size = None
    if max_side and max(a.shape) > max_side:
        k = max_side / max(a.shape)
        size = (round(a.shape[1] * k), round(a.shape[0] * k))
    save_rgba(F, a, OUT / f'{out}.webp', size, q)
    art[out] = {'x': bx + x0, 'y': by + y0, 'w': x1 - x0, 'h': y1 - y0}
    print(out, art[out], flush=True)
    return F, a


# ── animals (board pieces): square 320 px images, the face centred, same scale for all five ───────────────────
# monkey / tiger / pig: cut from the game mockup (265 px boxes: one scale for all, kept) — the size reference.
# The other 25 FPR K animals (src/data/animals.ts) are tiles from design/tiles/ scaled to the trio's face size by
# tools/tiles.py (run it after this). The mockup's alligator and snake are not FPR K words (user: "교재 k레벨에 없는 동물은
# 빼고 있는걸로만 넣어줘") — out, so the cleanup below deletes them. HD = big art cut here (√(alpha area) = the trio's mean ×
# SIZE_K); the old ant / seal (design/ant_seal.png) went that way, replaced by the new tiles.
MOCKUP = {'monkey': 'monkey_a', 'tiger': 'tiger_a', 'pig': 'pig_a'}
HD: dict[str, str] = {}
SIZE_K: dict[str, float] = {}
ANIMAL_IDS = ('monkey', 'mouse', 'ant', 'seal', 'tiger', 'turtle', 'pig', 'puppy', 'iguana', 'cat', 'cow', 'fish', 'duck', 'dog', 'hen', 'horse', 'octopus', 'rat', 'bear', 'bee', 'lion',  'elephant', 'goat', 'fox', 'zebra')


def animals():
    S, PX = 270, 320
    seen = []
    for animal, name in MOCKUP.items():
        I, a0 = load_cut(name)
        a0 = clean(a0)
        F, a = refine(I, a0)
        x0, y0, x1, y1 = trim_box(a, pad=0)
        # one scale for all: the cut boxes are the same size (265 px) → keep it, centre on the bbox
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        canvas_F = np.zeros((S, S, 3), np.float32); canvas_a = np.zeros((S, S), np.float32)
        ox, oy = int(round(S / 2 - cx)), int(round(S / 2 - cy))
        h, w = a.shape
        ys, xs = slice(max(0, oy), min(S, oy + h)), slice(max(0, ox), min(S, ox + w))
        canvas_F[ys, xs] = F[ys.start - oy:ys.stop - oy, xs.start - ox:xs.stop - ox]
        canvas_a[ys, xs] = a[ys.start - oy:ys.stop - oy, xs.start - ox:xs.stop - ox]
        save_rgba(canvas_F, canvas_a, OUT / f'a_{animal}.webp', (PX, PX))
        art[f'a_{animal}'] = {'w': x1 - x0, 'h': y1 - y0, 'S': S}
        seen.append(float(np.sqrt(a.sum())))
        print('animal', animal, x1 - x0, y1 - y0, 'size', round(seen[-1], 1), flush=True)
    target = float(np.mean(seen))
    for animal, name in HD.items():
        I, a0 = load_cut(name)
        a0 = clean(a0)
        F, a = refine(I, a0)
        F = bleed(F, a)
        x0, y0, x1, y1 = trim_box(a, pad=0)
        F, a = F[y0:y1, x0:x1], a[y0:y1, x0:x1]
        k = target * SIZE_K[animal] / float(np.sqrt(a.sum()))      # source px → 270-unit px
        r = k * PX / S                                               # → output px
        w, h = max(1, round((x1 - x0) * r)), max(1, round((y1 - y0) * r))
        assert max(w, h) <= PX - 16, (animal, w, h)
        Fi = np.asarray(Image.fromarray(np.clip(F, 0, 255).astype(np.uint8), 'RGB').resize((w, h), Image.LANCZOS)).astype(np.float32)
        ai = np.asarray(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'L').resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
        canvas_F = np.zeros((PX, PX, 3), np.float32); canvas_a = np.zeros((PX, PX), np.float32)
        ox, oy = (PX - w) // 2, (PX - h) // 2
        canvas_F[oy:oy + h, ox:ox + w] = Fi; canvas_a[oy:oy + h, ox:ox + w] = ai
        save_rgba(canvas_F, canvas_a, OUT / f'a_{animal}.webp')
        art[f'a_{animal}'] = {'w': round(w * S / PX), 'h': round(h * S / PX), 'S': S}
        print('animal', animal, art[f'a_{animal}']['w'], art[f'a_{animal}']['h'], 'size', round(float(np.sqrt(ai.sum())) * S / PX, 1),
              f'(target {target:.1f}, source {x1 - x0}×{y1 - y0} px, ×{k:.3f})', flush=True)
    # animals no longer on the board
    for key in [key for key in art if key.startswith('a_') and key[2:] not in ANIMAL_IDS]:
        del art[key]
        (OUT / f'{key}.webp').unlink(missing_ok=True)
        print('removed', key)


# ── title pieces ─────────────────────────────────────────────────────────────────────────────────────────────
def title_pieces():
    sprite('logo', 'logo')
    for n in ('l_m_red', 'l_m_blue', 'l_a_blue', 'l_t_top', 'l_p_top', 'l_t_bot', 'l_p_bot'):
        sprite(n, n)
    # PLAY: the matte only found the text, so the button is cut as its own stadium shape (orange pill + cream ring)
    T = Image.open(D / 'ref_title.png').convert('RGB')
    x0, y0, x1, y1 = 1029, 876, 1726, 1178
    k = 4
    m = Image.new('L', ((x1 - x0) * k, (y1 - y0) * k), 0)
    ImageDraw.Draw(m).rounded_rectangle((3 * k, 3 * k, (x1 - x0 - 3) * k, (y1 - y0 - 3) * k), radius=(y1 - y0 - 6) * k // 2, fill=255)
    m = m.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    im = T.crop((x0, y0, x1, y1)).convert('RGBA'); im.putalpha(m)
    im.save(OUT / 'play.webp', 'WEBP', quality=92, alpha_quality=100, method=6, exact=True)
    art['play'] = {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}


# ── the tutor: body without cap / eyes / mouth + those parts on their own ────────────────────────────────────
def tutor():
    I, a0 = load_cut('tutor_t')
    a0 = clean(a0)
    F, a = refine(I, a0)
    H, Wd = a.shape
    lum = F @ np.array([0.299, 0.587, 0.114], np.float32)
    r, g, b = F[..., 0], F[..., 1], F[..., 2]
    mx, mn = F.max(-1), F.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    yy, xx = np.mgrid[0:H, 0:Wd]
    solid = a > 0.5

    # cap: the dark board + crown, the cord and the tassel (top right of the head)
    zone = (xx > 320) & (xx < 625) & (yy < 245)
    dark = (lum < 125) & zone & (a > 0.2)
    tassel = (r > 190) & (g > 90) & (g < 190) & (b < 110) & (sat > 0.5) & zone & (xx > 535)
    capm = dark | tassel
    lab, n = ndi.label(dil(capm, 1))
    if n:
        sizes = ndi.sum(np.ones_like(a), lab, index=np.arange(1, n + 1))
        capm = np.isin(lab, 1 + np.where(sizes > 300)[0])
    capm = ndi.binary_fill_holes(capm)
    cap_soft = np.clip(gblur(dil(capm, 2).astype(np.float32), 1.2), 0, 1)
    cap_a = a * cap_soft

    # the head outline without the cap: a circle through the visible top of the head
    edge = solid & ~ero(solid, 1)
    near_cap = dil(capm, 14)
    pts = np.argwhere(edge & ~near_cap & (yy > 150) & (yy < 330) & (xx > 300) & (xx < 660))
    py, px = pts[:, 0].astype(np.float64), pts[:, 1].astype(np.float64)
    A = np.c_[px, py, np.ones_like(px)]
    sol, *_ = np.linalg.lstsq(A, -(px ** 2 + py ** 2), rcond=None)
    cx, cy = -sol[0] / 2, -sol[1] / 2
    R = np.sqrt(cx ** 2 + cy ** 2 - sol[2])
    print(f'head circle c=({cx:.1f},{cy:.1f}) r={R:.1f} from {len(pts)} edge points', flush=True)
    dist_in = R - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)              # >0 inside the head
    rng = np.random.default_rng(3)
    fuzz = gblur(rng.standard_normal((H, Wd)).astype(np.float32), 1.6) * 7
    head_a = smoothstep(dist_in + fuzz, -3, 5)

    # where the cap was: head fur inside the circle, nothing outside
    hole = dil(capm, 3)
    base_a = np.where(hole, np.maximum(a * (1 - cap_soft), np.where(dist_in > -12, head_a, 0)), a)
    base_a = np.where(hole & (dist_in <= -12), a * (1 - cap_soft), base_a)

    # face parts
    face = (yy > 260) & (yy < 420) & (xx > 210) & (xx < 520)
    white = (lum > 205) & (sat < 0.2) & face
    iris = (lum < 120) & face & (yy < 392) & ~((xx > 325) & (xx < 395) & (yy > 355))
    eyes = ndi.binary_fill_holes(dil(white | iris, 2))
    lab, n = ndi.label(eyes)
    sizes = ndi.sum(np.ones_like(a), lab, index=np.arange(1, n + 1))
    eye_ids = 1 + np.argsort(sizes)[::-1][:2]
    eyes_l = [lab == i for i in eye_ids]
    eyes_l.sort(key=lambda m: np.argwhere(m)[:, 1].mean())
    mouth = ((lum < 140) | ((r - g > 50) & (r > 150))) & (xx > 320) & (xx < 400) & (yy > 352) & (yy < 405)
    mouth = ndi.binary_fill_holes(dil(mouth, 2))
    lab, n = ndi.label(mouth)
    sizes = ndi.sum(np.ones_like(a), lab, index=np.arange(1, n + 1))
    mouth = lab == (1 + int(np.argmax(sizes)))

    # the eyes stay painted on the body (blinks are lids drawn over them); only the mouth moves on its own
    parts = {'mouth': mouth}
    eye_fit = []
    for m in eyes_l:
        ys_, xs_ = np.nonzero(m)
        eye_fit.append([float(xs_.mean()), float(ys_.mean()), float((xs_.max() - xs_.min()) / 2), float((ys_.max() - ys_.min()) / 2)])
    # fill under the mouth and the cap with fur: smooth membrane from the fur around + fur grain from the belly
    # (12 px below the cap too: fur strands there are mixed with the dark crown)
    under = dil(mouth, 4) | (dil(capm, 12) & (dist_in > -12))
    fur_known = (base_a > 0.97) & ~under & ~dil(capm, 14)
    work = (yy < 470)
    fill = membrane(np.where(fur_known[..., None], F, 0), (work & ~fur_known) | ~work)
    patch = (F - gblur(F, 2.5))[470:600, 250:420]
    reps = (H // patch.shape[0] + 2, Wd // patch.shape[1] + 2, 1)
    tile = np.tile(np.concatenate([patch, patch[:, ::-1]], 1), (reps[0], reps[1] // 2 + 1, 1))[:H, :Wd]
    grain = np.clip(tile, -14, 14) * 0.8
    # feather the patch into the fur around it (no seam line where the fill meets the painted fur)
    wfill = np.clip(gblur(under.astype(np.float32), 2.0) * 1.8, 0, 1)
    wfill = np.where(under, np.maximum(wfill, 0.92), wfill)[..., None]
    Ff = F * (1 - wfill) + (fill + grain) * wfill
    # the head top where the cap was: a little lighter at the very edge, like the rest of the outline
    rim = smoothstep(dist_in, 22, 2) * (hole & (dist_in > -12))
    Ff = Ff + rim[..., None] * np.array([10, 8, 2], np.float32)

    # export: body, cap, eyes, mouth — all on the same canvas (the tutor crop), trimmed together
    x0, y0, x1, y1 = trim_box(np.maximum(base_a, cap_a), pad=6)
    sl = (slice(y0, y1), slice(x0, x1))
    bx, by = BOXES['tutor_t'][:2]
    art['tutor'] = {'x': bx + x0, 'y': by + y0, 'w': x1 - x0, 'h': y1 - y0, 'head': [round(cx - x0, 1), round(cy - y0, 1), round(R, 1)],
                    'eyes': [[round(e[0] - x0, 1), round(e[1] - y0, 1), round(e[2], 1), round(e[3], 1)] for e in eye_fit]}
    save_rgba(Ff[sl], base_a[sl], OUT / 'tutor_body.webp')
    save_rgba(F[sl], cap_a[sl], OUT / 'tutor_cap.webp')
    save_rgba(F[sl], a[sl], OUT / 'tutor_full.webp')
    for k, m in parts.items():
        soft = np.clip(gblur(dil(m, 1).astype(np.float32), 0.8), 0, 1) * a
        ys, xs = np.nonzero(soft > 0.01)
        px0, py0, px1, py1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
        save_rgba(F[py0:py1, px0:px1], soft[py0:py1, px0:px1], OUT / f'tutor_{k}.webp')
        art[f'tutor_{k}'] = {'x': int(px0 - x0), 'y': int(py0 - y0), 'w': int(px1 - px0), 'h': int(py1 - py0)}
        print(k, art[f'tutor_{k}'], flush=True)
    # debug views
    dbg = Image.fromarray(np.dstack([np.clip(Ff[sl], 0, 255), base_a[sl] * 255]).astype(np.uint8), 'RGBA')
    bg = Image.new('RGBA', dbg.size, (60, 120, 200, 255)); bg.alpha_composite(dbg); bg.save(DBG / 'tutor_body_dbg.png')


# ── game HUD bits cut from the game screen ───────────────────────────────────────────────────────────────────
def hud_bits():
    for n in ('coin', 'btn_pause', 'btn_gear'):
        if (CUT / f'{n}.png').exists():
            sprite(n, n)


def backgrounds():
    # the user's own clean backgrounds (2752×1536): title design/phonics_match_bg.png (it replaced the mockup with the
    # logo/letters/tutor filled out, work/bg_title_smooth.png), game design/phonics_match_game_bg.png (the playroom; it
    # replaced the mockup with the HUD/board filled out, work/bg_game_final.png)
    for name, p in (('title', D / 'phonics_match_bg.png'), ('game', D / 'phonics_match_game_bg.png')):
        if not p.exists():
            print('missing', p); continue
        im = Image.open(p).convert('RGB')
        if name == 'title':
            from title_deco import export     # the mockup's stars + speed marks: sprites riding with the letters (title.ts)
            export(im)
        im.save(OUT / f'bg_{name}.webp', 'WEBP', quality=84, method=6)
        im.resize((1376, 768), Image.LANCZOS).save(OUT / f'bg_{name}_s.webp', 'WEBP', quality=80, method=6)
        print('bg', name, (OUT / f'bg_{name}.webp').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    which = set(sys.argv[1:]) or {'animals', 'title', 'tutor', 'hud', 'bg'}
    prev = ROOT / 'src' / 'data' / 'art.json'
    if prev.exists():
        art.update(json.loads(prev.read_text()))
    if 'animals' in which: animals()
    if 'title' in which: title_pieces()
    if 'tutor' in which: tutor()
    if 'hud' in which: hud_bits()
    if 'bg' in which: backgrounds()
    prev.write_text(json.dumps(art, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o)))
