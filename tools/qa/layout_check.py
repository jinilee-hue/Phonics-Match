"""Layout check (headless, never the user's browser; game = coins under the logo, the board centred): at user 1192×608 · 16:9 1600×900 · iPad 1180×820 · ultra 1600×600 —
title idle (badge vs PLAY, tutor feet), title demo (badge vs SKIP, tutor vs demo board), game (card vs board, card
contents inside, coins vs button rings, badge inside the window, badge vs board). 16:9: clicks (title badge → shop open,
demo off, tutor's own tap not fired; close → demo back; game badge → paused + shop; close → play). Boxes in design px
of the window (÷S, window-relative). Screenshots (png) of the user window → <out>_title/_demo/_game.png + <out>_sheet.png.
uv run --with playwright --with pillow python tools/qa/layout_check.py <base> <out-prefix>"""
import json, sys, time
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
out = sys.argv[2] if len(sys.argv) > 2 else 'layout'
SIZES = {'user': (1192, 608), '169': (1600, 900), 'ipad': (1180, 820), 'ultra': (1600, 600)}
M = """(tag) => {
  const S = document.querySelector('#stage').getBoundingClientRect().width / 2752;
  const box = (el) => { if (!el || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return null; const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v / S)); };
  const W = [Math.round(innerWidth / S), Math.round(innerHeight / S)];
  const d = document.querySelector('#btnDress'), db = box(d);
  const ring = db ? [db[0] - 13, db[1] - 13, db[2] + 13, db[3] + 13] : null;     // the cream ring around it
  const circ = db ? { cx: (db[0] + db[2]) / 2, cy: (db[1] + db[3]) / 2, r: (db[2] - db[0]) / 2 + 13 } : null;
  const pillGap = (b) => { if (!b || !circ) return null; const rad = (b[3] - b[1]) / 2;
    const qx = Math.min(Math.max(circ.cx, b[0] + rad), b[2] - rad), qy = Math.min(Math.max(circ.cy, b[1] + rad), b[3] - rad);
    return Math.round(Math.hypot(circ.cx - qx, circ.cy - qy) - rad - circ.r); };
  const rectGap = (a, b) => (a && b) ? Math.round(Math.max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3])) : null;
  const t = __pm.tutor.el.getBoundingClientRect(), ts = t.width / 660;                 // art box → fur (local x 7-653, y 142-678)
  const fur = [t.left / S + 7 * ts / S, t.top / S + 142 * ts / S, t.left / S + 653 * ts / S, t.top / S + 678 * ts / S].map(Math.round);
  const out = { W, badge: db, badge_ring_right_margin: ring && W[0] - ring[2], badge_ring_bottom_margin: ring && W[1] - ring[3], fur };
  if (tag === 'idle') { const p = box(document.querySelector('#btnPlay')); Object.assign(out, { play: p, badge_play_gap: rectGap(ring, p), feet_y_in_stage: Math.round(fur[3] - (document.querySelector('#stage').getBoundingClientRect().top / S)) }); }
  if (tag === 'demo') { const sk = box(document.querySelector('.skip-btn')), dm = box(document.querySelector('.demo'));
    Object.assign(out, { skip: sk, badge_skip_gap: pillGap(sk), demo: dm, demo_to_fur: dm && Math.round(fur[0] - dm[2]), badge_demo_gap: rectGap(ring, dm) }); }
  if (tag === 'game') {
    const card = box(document.querySelector('.mcard')), board = box(document.querySelector('#board')), coin = box(document.querySelector('.p-coin'));
    const logo = box(document.querySelector('.hud-logo'));
    const btns = [...document.querySelectorAll('.game-bar .sq-btn')].filter((b) => b.offsetParent);
    const bb = btns.map(box);
    const bring = [bb[0][0] - 13, bb[0][1] - 13, bb[bb.length - 1][2] + 13, bb[0][3] + 13];
    const kids = [...document.querySelectorAll('.mcard .mc-row, .mcard .ms-label, .mcard .goal, .mcard .gn, .mcard .mv-num, .mcard .track')].map(box);
    const inside = kids.every((k) => k && k[0] >= card[0] && k[1] >= card[1] && k[2] <= card[2] && k[3] <= card[3]);
    // taps on the top row (it reaches into the HUD's 270-px band): what is hit at the top / middle of each first-row piece
    const els = __pm.game.board.els;
    const row = [0, 1, 2, 3, 4].map((i) => { const r = els[i].getBoundingClientRect();
      const at = (fy) => !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height * fy)?.closest('#board');
      return at(0.2) && at(0.5); });
    // FIELD_X / FIELD_Y (board.ts, the fx positions) vs the field's real top-left, stage px — must be [0, 0]
    // (pieces' own centres are no test: one may still be bouncing in)
    const st = document.querySelector('#stage').getBoundingClientRect(), fr = document.querySelector('#board .field').getBoundingClientRect();
    const fo = __pm.game.fieldOrigin, fieldErr = [Math.round((fr.left - st.left) / S - fo.x), Math.round((fr.top - st.top) / S - fo.y)];
    const btnHit = btns.every((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.sq-btn') === b; });
    const stTop = Math.round(st.top / S);
    Object.assign(out, { logo, coin, card, board, left_edges: [logo[0], coin[0], card[0]], gaps: [coin[1] - logo[3], card[1] - coin[3]],
      board_top_in_stage: board[1] - stTop, board_bottom_margin: W[1] - board[3], card_to_board: board[0] - card[2], board_to_ring: bring[0] - board[2],
      contents_inside: inside, goals: document.querySelectorAll('.mcard .goal').length, buttons: btns.length, top_row_taps: row.every(Boolean) ? 'ok' : row,
      field_vs_FIELD: fieldErr, buttons_hit: btnHit, badge_board_gap: rectGap(ring, board) });
  }
  return out;
}"""
shots = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    errs = []
    for tag, (vw, vh) in SIZES.items():
        pg = b.new_page(viewport={'width': vw, 'height': vh}, device_scale_factor=2 if tag == 'user' else 1)
        pg.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
        pg.goto(base + '?seed=7&fake=1', wait_until='load'); pg.wait_for_function('!!window.__pm', timeout=20000); time.sleep(1.4)
        idle = pg.evaluate(M, 'idle')
        if tag == 'user': pg.screenshot(path=f'{out}_title.png'); shots.append(('인트로', f'{out}_title.png'))
        pg.evaluate('void __pm.demo.quiet()')
        pg.wait_for_function("(() => { const s = document.querySelector('.skip-btn'); return s && s.offsetParent && getComputedStyle(s).opacity > 0.95; })()", timeout=15000)
        time.sleep(1.2)
        demo = pg.evaluate(M, 'demo')
        if tag == 'user': pg.screenshot(path=f'{out}_demo.png'); shots.append(('인트로 시연 중 (SKIP)', f'{out}_demo.png'))
        clicks = None
        if tag == '169':
            pg.evaluate("window.__acts = []; const a = __pm.tutor.act.bind(__pm.tutor); __pm.tutor.act = (x) => { __acts.push(x); return a(x); };")
            pg.click('#btnDress'); time.sleep(0.6)
            c1 = pg.evaluate("({ shop: __pm.shop.open, demoOn: !!document.querySelector('.demo') && getComputedStyle(document.querySelector('.demo')).opacity > 0.5, acts: [...__acts] })")
            pg.evaluate("__pm.shop.hide ? __pm.shop.hide() : document.querySelector('#shopClose').click()"); time.sleep(0.8)
            c2 = pg.evaluate("({ shop: __pm.shop.open })")
            clicks = {'title_click': c1, 'title_after_close': c2}
        pg.evaluate('__pm.toGame(1)')
        pg.wait_for_function("__pm.game.state === 'play'", timeout=30000); time.sleep(1.0)
        game = pg.evaluate(M, 'game')
        if tag == 'user': pg.screenshot(path=f'{out}_game.png'); shots.append(('게임', f'{out}_game.png'))
        if tag == '169':
            pg.click('#btnDress'); time.sleep(0.5)
            g1 = pg.evaluate("({ shop: __pm.shop.open, state: __pm.game.state })")
            pg.click('#shopClose'); time.sleep(0.6)
            g2 = pg.evaluate("({ shop: __pm.shop.open, state: __pm.game.state })")
            clicks.update({'game_click': g1, 'game_after_close': g2})
        print(f'== {tag}')
        print('  idle', json.dumps(idle)); print('  demo', json.dumps(demo)); print('  game', json.dumps(game))
        if clicks: print('  clicks', json.dumps(clicks))
        pg.close()
    print('page errors', errs or 'none')
    b.close()
font = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 30)
W, H = 1192, 608
sheet = Image.new('RGB', (W, (H + 50) * len(shots)), 'white'); d = ImageDraw.Draw(sheet)
for i, (lab, pth) in enumerate(shots):
    y = i * (H + 50); d.text((14, y + 9), lab, fill='black', font=font)
    sheet.paste(Image.open(pth).convert('RGB').resize((W, H), Image.LANCZOS), (0, y + 50))
sheet.save(f'{out}_sheet.png'); print(f'sheet {out}_sheet.png')
