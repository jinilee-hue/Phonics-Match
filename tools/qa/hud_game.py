"""SUPERSEDED (old HUD: pause/gear buttons, 4 top panels) — use tools/qa/layout_check.py.
Game HUD + board layout check (headless, never the user's browser): the four top panels vs the gear button (its ring
included), what sits inside each panel vs the panel's bottom rim, the board's gap under the HUD, the letter badges on
the board edge. Prints design px; saves <out>_hud.png (top strip) and <out>_full.png.
uv run --with playwright python tools/qa/hud_game.py <base> <out>"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
out = sys.argv[2]
RIM = 12                      # the panel's bottom rim (inset shadow) — content should stay above it

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=2)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + '?fake=1&seed=7', wait_until='load')
    pg.wait_for_function('!!window.__pm', timeout=20000)
    time.sleep(1.0)
    pg.mouse.click(480, 680)
    time.sleep(0.4)
    pg.evaluate("document.querySelector('#btnPlay').click()")
    pg.wait_for_function("__pm.game.state === 'play'", timeout=40000)
    time.sleep(0.8)
    m = pg.evaluate("""() => {
      const hud = document.querySelector('#hud').getBoundingClientRect(), st = document.querySelector('#stage').getBoundingClientRect();
      const S = hud.width / 2752;
      const box = (el, r0) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v, i) => Math.round(((i % 2 ? v - r0.top : v - r0.left)) / S)); };
      const q = (s) => document.querySelector(s);
      const ring = (el) => { const r = box(el, hud); return [r[0] - 13, r[1] - 13, r[2] + 13, r[3] + 13]; };
      const panels = {};
      for (const n of ['p-level', 'p-coin', 'p-moves', 'p-mission']) {
        const el = q('.hud-game .' + n);
        const kids = [...el.querySelectorAll('.lv-label, .track, .coin-track, .coin-ico, #coinNum, .mv-label, .mv-num, .ms-label, .goal, .goal .gn')]
          .map((k) => [k.id || k.className.split(' ')[0], box(k, hud)]);
        panels[n] = { box: box(el, hud), kids };
      }
      const board = box(q('#board'), st), field = box(q('#board .field'), st);
      const badges = [...document.querySelectorAll('.edge-badge')].map((e) => { const r = box(e, st); return [e.dataset.l, Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)]; });
      return { S, pause: ring(q('#btnPause')), gear: ring(q('.hud-game #btnGear')), panels, board, field, badges };
    }""")
    pg.screenshot(path=f'{out}_hud.png', clip={'x': 0, 'y': 0, 'width': 1600, 'height': 300 * m['S']})
    pg.screenshot(path=f'{out}_full.png')
    b.close()

print('gear ring', m['gear'], '· pause ring', m['pause'])
lowest = 0
for n, v in m['panels'].items():
    pb = v['box'][3]
    lowest = max(lowest, pb)
    over = [(k, r[3]) for k, r in v['kids'] if r[3] > pb - RIM]
    kids = ' '.join(f'{k}:{r[1]}-{r[3]}' for k, r in v['kids'][:6])
    print(f'{n:10s} bottom {pb:4d} (gear ring bottom {m["gear"][3]}, diff {pb - m["gear"][3]:+d}) · {kids}{" · INTO RIM " + str(over) if over else ""}')
print('board', m['board'], '· field', m['field'], '· gap under the HUD', m['board'][1] - lowest, '· board bottom margin', 1536 - m['board'][3])
print('edge badges (letter, x, y; board top/bottom', m['board'][1], m['board'][3], '):', m['badges'])
print('page errors', errs)
