"""Clean backgrounds for the title and game screens: everything the game draws itself (logo, PLAY, letters, tutor,
HUD panels, board, badges) and the Gemini sparkle are masked out and filled with LaMa (big-lama).
uv run --with simple-lama-inpainting --with pillow --with numpy --with scipy python tools/clean_bg.py [game|title]
→ design/work/bg_<name>_clean.png (+ _mask.png)
"""
import pathlib, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'
W = D / 'work'
CUT = W / 'cut'

# crop boxes used by tools/cut_sprites.py (the cuts are crops of the reference images)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from art_boxes import BOXES  # noqa: E402


def disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def cut_mask(shape, name, grow):
    """the cut's own alpha (>2%), placed back where it was cropped, grown by `grow` px"""
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = BOXES[name]
    a = np.asarray(Image.open(CUT / f'{name}.png').split()[3]) > 5
    m[y0:y0 + a.shape[0], x0:x0 + a.shape[1]] |= a
    return ndi.binary_dilation(m, structure=disk(grow))


def rect_mask(shape, boxes, radius=0):
    im = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    for b in boxes:
        d.rounded_rectangle(b, radius=radius, fill=255)
    return np.asarray(im) > 0


def build(name):
    src = Image.open(D / f'ref_{name}.png').convert('RGB')
    shape = (src.height, src.width)
    if name == 'title':
        m = np.zeros(shape, bool)
        for c, g in [('logo', 22), ('tutor_t', 26), ('l_m_red', 18), ('l_m_blue', 18), ('l_a_blue', 18),
                     ('l_t_top', 18), ('l_p_top', 18), ('l_t_bot', 18), ('l_p_bot', 18)]:
            m |= cut_mask(shape, c, g)
        m |= rect_mask(shape, [(1018, 866, 1737, 1188)], 160)       # PLAY (the matte only found the text)
        m |= rect_mask(shape, [(2575, 1355, 2705, 1490)], 30)      # Gemini sparkle (bottom right)
    else:
        m = rect_mask(shape, [(50, 0, 2535, 252)], 40)               # HUD buttons + panels (+ their shadows)
        m |= rect_mask(shape, [(615, 250, 2128, 1518)], 120)         # board + its shadow
        im = Image.new('L', (shape[1], shape[0]), 0)
        d = ImageDraw.Draw(im)
        for cx, cy, r in [(652, 475, 82), (668, 968, 82), (2083, 435, 82), (2080, 688, 84)]:   # letter badges
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        m |= np.asarray(im) > 0
        m |= cut_mask(shape, 'tutor_g', 26)
        m |= rect_mask(shape, [(2570, 1355, 2715, 1495)], 30)      # Gemini sparkle
    Image.fromarray((m * 255).astype(np.uint8)).save(W / f'bg_{name}_mask.png')
    print(name, 'masked', f'{m.mean() * 100:.1f}%', flush=True)
    if '--membrane' in sys.argv:
        from membrane import membrane
        t0 = time.time()
        res = membrane(np.asarray(src, np.float32), m)
        print(name, f'membrane {time.time() - t0:.1f}s', flush=True)
        Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).save(W / f'bg_{name}_smooth.png')
        return
    from simple_lama_inpainting import SimpleLama
    lama = SimpleLama()
    scale = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2][0].isdigit() else 1.0
    t0 = time.time()
    if scale != 1.0:
        sw, sh = int(src.width * scale), int(src.height * scale)
        out = lama(src.resize((sw, sh), Image.LANCZOS), Image.fromarray((m * 255).astype(np.uint8)).resize((sw, sh), Image.BILINEAR))
        out = out.crop((0, 0, sw, sh)).resize(src.size, Image.LANCZOS)
    else:
        out = lama(src, Image.fromarray((m * 255).astype(np.uint8)))
        out = out.crop((0, 0, src.width, src.height))
    print(name, f'lama {time.time() - t0:.1f}s', flush=True)
    # keep the original outside the mask, feather the seam a little
    k = ndi.gaussian_filter(m.astype(np.float32), 3)[..., None]
    k = np.clip(k * 1.6, 0, 1)
    res = np.asarray(out, np.float32) * k + np.asarray(src, np.float32) * (1 - k)
    Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).save(W / f'bg_{name}_clean.png')


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'game')
