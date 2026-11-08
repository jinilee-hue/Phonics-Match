"""Game background, final: LaMa (quarter res) for the board / tutor area, softened (the room is out of focus anyway, and
the 4x upscale left a fine grain), and the smooth membrane fill for the HUD strip (LaMa painted a dark band there).
uv run --with pillow --with numpy --with scipy python tools/final_bg.py → design/work/bg_game_final.png"""
import pathlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W = pathlib.Path(__file__).resolve().parent.parent / 'design' / 'work'
src = np.asarray(Image.open(W.parent / 'ref_game.png').convert('RGB'), np.float32)
lama = np.asarray(Image.open(W / 'bg_game_clean.png').convert('RGB'), np.float32)
smooth = np.asarray(Image.open(W / 'bg_game_smooth.png').convert('RGB'), np.float32)
mask = np.asarray(Image.open(W / 'bg_game_mask.png')) > 127
H, Wd = mask.shape
soft = np.stack([ndi.gaussian_filter(lama[..., c], 5) for c in range(3)], -1)
yy = np.mgrid[0:H, 0:Wd][0]
top = np.clip((300 - yy) / 80, 0, 1)[..., None]          # HUD strip → membrane, blending out by y 300
fill = soft * (1 - top) + smooth * top
k = np.clip(ndi.gaussian_filter(mask.astype(np.float32), 3) * 1.6, 0, 1)[..., None]
out = fill * k + src * (1 - k)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(W / 'bg_game_final.png')
print('ok')
