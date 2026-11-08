"""Alpha clean-up + colour decontamination for still cut-outs (after the video-sprite-matting skill's refine_edges).
clean(I, a0): keep the main blob, fill pin-holes; refine(I, a0): re-estimate the soft edge, F without the old background."""
import numpy as np
from scipy import ndimage as ndi


def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def gblur(x, s):
    if x.ndim == 3:
        return np.stack([ndi.gaussian_filter(x[..., c], s, mode='nearest') for c in range(x.shape[2])], -1)
    return ndi.gaussian_filter(x, s, mode='nearest')


def normconv(img, w, s):
    ws = gblur(w.astype(np.float32), s)
    num = gblur(img * w[..., None], s) if img.ndim == 3 else gblur(img * w, s)
    den = np.maximum(ws, 1e-6)
    return (num / den[..., None] if img.ndim == 3 else num / den), ws


def disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]; return (x * x + y * y) <= r * r + 0.5


def dil(m, r): return ndi.binary_dilation(m, structure=disk(r))
def ero(m, r): return ndi.binary_erosion(m, structure=disk(r))


def clean(a0, keep=1, min_frac=0.0):
    """keep the `keep` largest solid blobs (alpha>.5) + the soft parts touching them; fill enclosed holes"""
    solid = a0 > 0.5
    lab, n = ndi.label(solid)
    if n == 0:
        return a0
    sizes = ndi.sum(np.ones_like(a0), lab, index=np.arange(1, n + 1))
    order = np.argsort(sizes)[::-1]
    big = [i + 1 for i in order[:keep] if sizes[i] >= min_frac * sizes[order[0]]]
    core = np.isin(lab, big)
    soft = a0 > 0.02
    slab, sn = ndi.label(soft)
    ids = np.unique(slab[core]); ids = ids[ids > 0]
    reach = np.isin(slab, ids)
    a = np.where(reach, a0, 0)
    holes = ndi.binary_fill_holes(a > 0.5) & ~(a > 0.5)
    a = np.where(holes, 1.0, a)
    # inside the solid shape (2 px in from its edge), the alpha must be 1 (birefnet leaves faint dips on faces)
    inner = ero(ndi.binary_fill_holes(a > 0.5), 2)
    a = np.where(inner, 1.0, a)
    return a.astype(np.float32)


def refine(I, a0, wr=(0.6, 0.9), wf=(0.04, 0.3)):
    """I: HxWx3 float 0-255, a0: HxW 0-1 → (F, a1) straight-alpha colour without the old background"""
    K = ~dil(a0 > 0.003, 3)
    Bg = I.copy(); done = K.copy()
    for s in (3, 6, 12, 24, 48):
        est, ws = normconv(I, K.astype(np.float32), s)
        f = (~done) & (ws > (0.05 if s == 3 else 0.02))
        Bg = np.where(f[..., None], est, Bg); done |= f
    Mi = ero(a0 > 0.98, 1).astype(np.float32)
    Fh, wf1 = normconv(I, Mi, 2.0); Fh2, _ = normconv(I, Mi, 6.0)
    Fh = np.where((wf1 > 0.05)[..., None], Fh, Fh2)
    d = Fh - Bg; nd = np.sqrt((d * d).sum(-1)) + 1e-6; diff = I - Bg
    ae = np.clip((diff * d).sum(-1) / (nd * nd), 0, 1)
    perp = np.sqrt(((diff - ae[..., None] * d) ** 2).sum(-1))
    c = smoothstep(nd, 25, 60) * (1 - smoothstep(perp, 10, 30))
    w = 1 - smoothstep(a0, *wr)
    band = (a0 > 0.002) & (a0 < 0.98)
    a1 = np.where(band, a0 + w * c * (ae - a0), a0); a1 = np.where(a1 < 0.012, 0, a1)
    solid = a1 > 0.5; hl, hn = ndi.label(ndi.binary_fill_holes(solid) & ~solid)
    if hn:
        hs = ndi.sum(np.ones_like(a1), hl, index=np.arange(1, hn + 1))
        small = dil(np.isin(hl, 1 + np.where(hs <= 24)[0]), 1)
        a1 = np.where(small, np.maximum(a1, a0), a1)
    F = np.clip(Bg + diff / np.maximum(a1, 0.05)[..., None], 0, 255)
    k = smoothstep(a1, *wf)[..., None]
    F = k * F + (1 - k) * Fh
    F = np.where((a1 >= 0.98)[..., None], I, F)
    return F.astype(np.float32), a1.astype(np.float32)


def bleed(F, a, r=8):
    """colour the transparent pixels with the nearest visible colour (no dark fringes when the image is scaled)"""
    vis = a > 0.05
    if not vis.any():
        return F
    _, (iy, ix) = ndi.distance_transform_edt(~vis, return_indices=True)
    out = F[iy, ix]
    return np.where(vis[..., None], F, gblur(out, 2))


def trim_box(a, pad=4, thr=0.01):
    ys, xs = np.nonzero(a > thr)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return max(0, x0 - pad), max(0, y0 - pad), min(a.shape[1], x1 + pad), min(a.shape[0], y1 + pad)
