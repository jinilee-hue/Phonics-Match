"""Which animals each level puts on the board (the a/s animals take turns): levels 1-4 headless, the board's piece
kinds + the mission goals per level, and a sheet of the boards. Never the user's browser.
uv run --with playwright --with pillow python tools/qa/mix.py http://127.0.0.1:5197/ <outprefix> [seed]"""
import sys, time
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
out = sys.argv[2]
seed = sys.argv[3] if len(sys.argv) > 3 else '7'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 28)
shots = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + f'?fake=1&seed={seed}', wait_until='load')
    pg.wait_for_function('!!window.__pm', timeout=20000)
    time.sleep(1.0)
    pg.mouse.click(480, 680)
    time.sleep(0.5)
    pg.evaluate("document.querySelector('#btnPlay').click()")
    for n in (1, 2, 3, 4):
        if n > 1:
            pg.evaluate(f"void __pm.game.start({n})")
        pg.wait_for_function(f"__pm.game.state === 'play' && __pm.game.n === {n}", timeout=40000)
        time.sleep(0.6)
        info = pg.evaluate("""(() => ({
          board: [...new Set([...document.querySelectorAll('#board .pc img')].map((i) => i.alt))].sort(),
          goals: [...document.querySelectorAll('#goals .goal img')].map((i) => i.alt),
          broken: [...document.querySelectorAll('#board .pc img, #goals img')].filter((i) => !i.complete || !i.naturalWidth).length,
        }))()""")
        print(f'level {n}: board {info["board"]} · goals {info["goals"]} · broken images {info["broken"]}')
        path = f'{out}_L{n}.png'
        pg.screenshot(path=path)
        shots.append((n, path))
    print('errors', errs)
    b.close()

W, H = 800, 450
sheet = Image.new('RGB', (W * 2, (H + 40) * 2), 'white')
d = ImageDraw.Draw(sheet)
for i, (n, path) in enumerate(shots):
    im = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
    x, y = (i % 2) * W, (i // 2) * (H + 40)
    sheet.paste(im, (x, y + 40))
    d.text((x + 10, y + 6), f'Level {n}', fill='black', font=font)
sheet.save(f'{out}_sheet.png')
print('sheet', f'{out}_sheet.png')
