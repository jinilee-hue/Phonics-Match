"""Headless screenshots of Phonics Match (never the user's browser).
uv run --with playwright python tools/qa/shot.py <base> <outprefix> [W H] [steps]
steps: title, game (start a level with ?fake=1), pop (do a valid swap and grab frames), shop, result
"""
import json, sys, time
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
out = sys.argv[2]
W, H = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1600, 900)
steps = (sys.argv[5] if len(sys.argv) > 5 else 'title,game').split(',')
ARGS = ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    import atexit
    atexit.register(lambda: print('\n'.join(logs)[-4000:]))
    pg.goto(base + '?fake=1&seed=7&log=1', wait_until='load')
    pg.wait_for_function('!!window.__pm', timeout=20000)
    time.sleep(1.5)
    if 'title' in steps:
        pg.screenshot(path=f'{out}_title.png')
        time.sleep(2.2)
        pg.screenshot(path=f'{out}_title_swirl.png')
    if 'game' in steps or 'pop' in steps or 'result' in steps:
        pg.mouse.click(W * 0.3, H * 0.75)   # first touch (hello)
        time.sleep(0.3)
        pg.evaluate("document.querySelector('#btnPlay').click()")
        time.sleep(1.2)
        pg.screenshot(path=f'{out}_intro.png')
        pg.wait_for_function("__pm.game.state === 'play'", timeout=30000)
        time.sleep(0.6)
        pg.screenshot(path=f'{out}_game.png')
    if 'pop' in steps:
        mv = pg.evaluate("(() => { const g = __pm.game; const m = g.grid.moves(); return m[0]; })()")
        print('move', mv)
        pg.evaluate(f"__pm.game.swap({mv[0]}, {mv[1]})")
        for i, dt in enumerate([0.32, 0.25, 0.3, 0.4, 0.6, 0.8, 1.2]):
            time.sleep(dt)
            pg.screenshot(path=f'{out}_pop{i}.png')
        pg.wait_for_function("__pm.game.state === 'play'", timeout=30000)
        pg.screenshot(path=f'{out}_after.png')
    if 'result' in steps:
        pg.evaluate("__pm.showResult(true, 3, 30)")
        time.sleep(2.6)
        pg.screenshot(path=f'{out}_result.png')
    if 'shop' in steps:
        pg.evaluate("(() => { __pm.save.coins = 300; __pm.commit(); __pm.shop.show(); })()")
        time.sleep(1.0)
        pg.screenshot(path=f'{out}_shop.png')
    print('\n'.join(l for l in logs if 'Download the React' not in l)[-4000:])
    b.close()
