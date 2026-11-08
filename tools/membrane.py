"""Smooth 'membrane' fill (harmonic / Laplace) for masked image regions, solved coarse-to-fine.
Right for soft gradients (a sky behind a logo); LaMa invents grey cloud blobs there."""
import numpy as np
from scipy import ndimage as ndi


def _down(img, known):
    h, w = known.shape
    h2, w2 = (h + 1) // 2, (w + 1) // 2
    pad_h, pad_w = h2 * 2 - h, w2 * 2 - w
    k = np.pad(known.astype(np.float32), ((0, pad_h), (0, pad_w)))
    im = np.pad(img * known[..., None], ((0, pad_h), (0, pad_w), (0, 0)))
    ks = k.reshape(h2, 2, w2, 2).sum((1, 3))
    ims = im.reshape(h2, 2, w2, 2, img.shape[2]).sum((1, 3))
    out = ims / np.maximum(ks, 1e-6)[..., None]
    return out, ks > 0


def _relax(x, unknown, iters):
    if not unknown.any():
        return x
    ys, xs = np.nonzero(unknown)
    for _ in range(iters):
        p = np.pad(x, ((1, 1), (1, 1), (0, 0)), mode='edge')
        avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) * 0.25
        x[ys, xs] = avg[ys, xs]
    return x


def membrane(img, unknown, iters=40):
    """img: HxWxC float, unknown: HxW bool → img with the unknown pixels filled smoothly from the known ones"""
    img = img.astype(np.float32).copy()
    known = ~unknown
    if min(unknown.shape) <= 16 or known.sum() == 0:
        img[unknown] = img[known].mean(0) if known.any() else 0
        return _relax(img, unknown, 400)
    small, sk = _down(img, known)
    filled_small = membrane(small, ~sk, iters)
    up = ndi.zoom(filled_small, (unknown.shape[0] / small.shape[0], unknown.shape[1] / small.shape[1], 1), order=1)
    up = up[:unknown.shape[0], :unknown.shape[1]]
    img[unknown] = up[unknown]
    return _relax(img, unknown, iters)
