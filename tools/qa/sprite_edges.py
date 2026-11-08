"""Title sprites cut short? A letter whose alpha is still solid on a sprite border was clipped by its crop box in
tools/art_boxes.py (the red M's left leg was: box bottom 510, the leg ends at 515). Run after any cut / box change:
  uv run --with pillow --with numpy python tools/qa/sprite_edges.py      → 'none' for every sprite"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
art = json.loads((ROOT / 'src' / 'data' / 'art.json').read_text())
bad = 0
for n in ['l_m_red', 'l_a_blue', 'l_t_top', 'l_p_top', 'l_m_blue', 'l_t_bot', 'l_p_bot', 'logo', 'play']:
    p = ROOT / 'public' / 'art' / f'{n}.webp'
    if not p.exists():
        continue
    a = np.asarray(Image.open(p).convert('RGBA'))[..., 3].astype(int)
    edges = {'left': a[:, :2].max(1), 'right': a[:, -2:].max(1), 'top': a[:2, :].max(0), 'bottom': a[-2:, :].max(0)}
    cut = {k: int((v > 128).sum()) for k, v in edges.items() if (v > 128).sum()}
    bad += bool(cut) and n != 'play'          # PLAY is a full stadium shape cut on purpose
    print(f'{n:9s} {a.shape[1]}x{a.shape[0]} at {art.get(n, {}).get("x")},{art.get(n, {}).get("y")} · solid px on a border: {cut or "none"}')
print('cut sprites:', bad)
