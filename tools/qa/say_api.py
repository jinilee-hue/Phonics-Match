"""The say-it turn end to end with the phonics-api judge (headless Chrome, never the user's browser).
getUserMedia is replaced by a stream the test plays clips into (macOS privacy blocks real fake-devices from an agent);
the rest is real: PLAY (?level=1) → a real move → the tutor's say card → listen → phonics-api → coins / "Almost!" / re-read.
usage: uv run --with playwright==1.62.0 python tools/qa/say_api.py [api|device] [base] [case …]
  api (default): ~/.config/phonics-api/key goes into this browser's localStorage (never printed); device: no key → whisper.
Each case is one say turn; the clips are chosen once the turn's word is known (Listener.hear is wrapped):
  word     the game's own official clip                          → ok
  child    phonics-api TTS, child voice (en-US-AnaNeural)        → ok (or reported)
  chant    /x/ /x/ word from the game's clips                    → ok
  other    another board word, then the word                     → miss, ok
  talk     Korean talk nearby (TTS), then the word               → silence (not the child's), ok
"""
import functools
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.parse

from playwright.sync_api import sync_playwright

print = functools.partial(print, flush=True)

MODE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ('api', 'device') else 'api'
BASE = next((a for a in sys.argv[1:] if a.startswith('http')), 'http://127.0.0.1:5197/')
ROOT = pathlib.Path(__file__).resolve().parents[2]
KIT = pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit'
sys.path.insert(0, str(KIT / 'tools'))
import papi  # noqa: E402

CLIPS = KIT / 'cache' / 'qa' / 'match'
CLIPS.mkdir(parents=True, exist_ok=True)
KEY = (pathlib.Path.home() / '.config/phonics-api/key').read_text().strip() if MODE == 'api' else ''
VOICE = json.loads((ROOT / 'src/data/voice.json').read_text())['clips']


def game_clip(key):                       # the game's own clip, trimmed as it plays (start + dur from voice.json)
    f, start, _g, dur = VOICE[key]
    out = CLIPS / f"{key.replace(':', '_')}.wav"
    if not out.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-t', str(dur), '-i', str(ROOT / 'public/voice' / f),
                        '-ac', '1', '-ar', '24000', str(out)], check=True)
    return out


def tts_clip(text, voice):
    out = CLIPS / f"tts_{voice}_{text.replace(' ', '_')}.wav"
    if not out.exists():
        out.write_bytes(papi.tts(text, voice))
    return out


def chant(word, letter):
    out = CLIPS / f'chant_{word}.wav'
    if not out.exists():
        parts = [game_clip(f's:{letter}'), game_clip(f's:{letter}'), game_clip(f'w:{word}')]
        lst = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False)
        for p in parts:
            lst.write(f"file '{p}'\nfile '{CLIPS / 'gap.wav'}'\n")
        lst.close()
        gap = CLIPS / 'gap.wav'
        if not gap.exists():
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.3', str(gap)], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst.name, '-ac', '1', '-ar', '24000', str(out)], check=True)
    return out


INIT = '''(() => {
  let ctx = null, dest = null;
  const live = () => { if (!ctx) { ctx = new AudioContext(); dest = ctx.createMediaStreamDestination(); } return ctx; };
  // a new stream each time: the game closes the mic after every say turn (track.stop() ends a stream for good)
  navigator.mediaDevices.getUserMedia = async () => { live(); await ctx.resume(); dest = ctx.createMediaStreamDestination(); return dest.stream; };
  window.__qaPlay = async (url) => {
    live(); await ctx.resume();
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(dest); s.start();
    return buf.duration;
  };
  localStorage.%s;
})()''' % (f"setItem('phonics_api_key', {json.dumps(KEY)})" if KEY else "removeItem('phonics_api_key')")

CASES = [c for c in sys.argv[1:] if c in ('word', 'child', 'chant', 'other', 'talk')] or ['word', 'child', 'chant', 'other', 'talk']

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    logs, errors = [], []
    pg.on('console', lambda m: logs.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.route('**/qa-clip/**', lambda route: route.fulfill(body=(CLIPS / urllib.parse.unquote(route.request.url.split('/qa-clip/')[1])).read_bytes(), content_type='audio/wav'))
    pg.add_init_script(INIT)
    pg.goto(BASE + '?level=1&seed=7&log=1')
    pg.wait_for_function("window.__pm && document.querySelector('#app')?.dataset.screen === 'title'", timeout=90000)
    pg.wait_for_function("window.PhonicsAPI && PhonicsAPI.status() !== 'unknown'", timeout=20000)
    print('phonics-api:', pg.evaluate('PhonicsAPI.status()'), f'({MODE})')
    pg.evaluate("document.querySelector('#btnPlay').click()")
    pg.wait_for_function("__pm.game.state === 'play'", timeout=90000)
    pg.evaluate('''() => { const L = __pm.game.listener, h = L.hear.bind(L);
      L.hear = (w, o) => { window.__qaWord = w; window.__qaRivals = o.rivals; window.__qaTurns = (window.__qaTurns || 0) + 1; return h(w, o); }; }''')
    for case in CASES:
        # a finished level (result card): the next one
        pg.wait_for_function("__pm.game.state === 'play' || __pm.game.state === 'over'", timeout=120000)
        print(f"  [{time.strftime('%H:%M:%S')}] {case}: state {pg.evaluate('__pm.game.state')}")
        if pg.evaluate("__pm.game.state") == 'over':
            vis = "[...document.querySelectorAll('#result [data-act=next], #result [data-act=retry]')].find(e => e.offsetParent)"
            pg.wait_for_function(f"!!({vis})", timeout=60000)
            pg.evaluate(f"({vis}).click()")
            pg.wait_for_function("__pm.game.state === 'play'", timeout=120000)
        n0 = len(logs)
        turns0 = pg.evaluate('window.__qaTurns || 0')
        pg.evaluate('() => { const m = __pm.game.grid.moves(); __pm.game.swap(...m[0]); }')
        feeds, fed = None, 0
        t0 = time.time()
        while time.time() - t0 < 120:
            st = pg.evaluate("({ turns: window.__qaTurns || 0, word: window.__qaWord, listen: !!document.querySelector('#sayCard.listen'), state: __pm.game.state, hidden: document.querySelector('#sayCard').hidden })")
            if st['turns'] > turns0 and feeds is None:
                w = st['word']
                letter = w[0] if not w.startswith('qu') else 'qu'
                # another word ON THE BOARD (a rival), with another first sound
                rivals = pg.evaluate('window.__qaRivals || []')
                other = next((r for r in rivals if f'w:{r}' in VOICE and r[0] != w[0]), 'seal')
                feeds = {'word': [game_clip(f'w:{w}')], 'child': [tts_clip(w, 'en-US-AnaNeural')], 'chant': [chant(w, letter)],
                         'other': [game_clip(f'w:{other}'), game_clip(f'w:{w}')],
                         'talk': [tts_clip('선생님 이거 다음에 뭐 해요?', 'ko-KR-SunHiNeural'), game_clip(f'w:{w}')]}[case]
            if feeds is not None and st['listen'] and fed < len(feeds) and st['turns'] - turns0 == fed + 1:
                time.sleep(0.9)
                pg.evaluate(f"__qaPlay('./qa-clip/{feeds[fed].name}')")
                fed += 1
            if feeds is not None and st['hidden'] and st['state'] == 'play':
                break
            time.sleep(0.25)
        if not (feeds is not None and st['hidden'] and st['state'] == 'play'):
            print(f"  ({case}: not settled after 120 s — state {st['state']}, turns {st['turns'] - turns0}, fed {fed})")
        heard = [l for l in logs[n0:] if 'heard ' in l]
        print(f"{case:6s} {st['word'] or '?':8s} |", ' · '.join(h.split('heard ', 1)[1][:110] for h in heard) or 'no turn')
    b.close()
print('errors:', errors or 'none')
