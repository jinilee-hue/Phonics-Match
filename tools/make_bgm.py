"""Original background music for Phonics Match — "bubble pop" (2026-11-22).

Why a new one (user): the old loop (F major, C–Am–F–G = I–vi–IV–V, off-beat ukulele plucks, kick/clap/hats, glock at the
phrase ends) sat on the same key, the same chords (14 of 16 bars) and the same backing as Croco Phonics' title music, so the
two games sounded like one tune ("귀에는 같은 멜로디로 들림"). Match was made later, so Match changes. Rule: "게임마다 게임에
맞게 음악이 좀 달라야해. 그리고 기본적으로 전체 음악은 신나야해."

What it is: a bouncy candy/bubble-pop loop for a match-3 board that pops. E♭ major (no other phonics game uses it),
128 BPM, 16 bars = exactly 30 s (src/core/audio.ts MUSIC_LOOP). Chords avoid the I–vi–IV–V every other game uses:
A = I–IV–ii–V | I–III7–vi–IV/V, B = a step-down IV–iii–ii–I | IV–V–vi/IV–V7. A soft pulse-wave "bubble" lead with a little
blip into each note, pizzicato-string arpeggios, round bubbly bass (held in A, disco octaves in B), finger snaps in A and
claps + snare in B, 16th hats, and "bloop" bubble pops (like the board's pops) climbing at the phrase ends.
Everything is synthesised here (no samples, no licences). The reverb tail is folded back onto the start, so the loop is
seamless. Loudness -15.4 LUFS like the old loop (MUSIC_VOL was set for it).
→ public/bgm.mp3   Run: ~/.local/bin/uv run --with numpy --with scipy --with pyloudnorm python tools/make_bgm.py
(The previous loop is in git history: 8779cdd tools/make_bgm.py.)
"""
import pathlib
import subprocess
import wave

import numpy as np
import pyloudnorm
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = pathlib.Path(__file__).resolve().parent.parent
SR = 44100
BPM = 128
BEAT = 60 / BPM
BARS = 16
LOOP = BARS * 4 * BEAT               # 30 s
TRANSPOSE = 3                        # written in C, played in E♭
TARGET_LUFS = -15.4
N = int(round(LOOP * SR)) + SR * 3
rng = np.random.default_rng(128)
NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}
hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)


def m(s):  # 'E5' → midi (transposed)
    return NOTE[s[:-1]] + 12 * (int(s[-1]) + 1) + TRANSPOSE


# one chord per bar, or (beats 0–2, beats 2–4)
CHORDS = ['C', 'F', 'Dm', 'G', 'C', 'E7', 'Am', ('F', 'G'),
          'F', 'Em', 'Dm', 'C', 'F', 'G', ('Am', 'F'), 'G7']
TONES = {'C': ['C', 'E', 'G'], 'F': ['F', 'A', 'C'], 'Dm': ['D', 'F', 'A'], 'G': ['G', 'B', 'D'], 'E7': ['E', 'G#', 'B', 'D'],
         'Am': ['A', 'C', 'E'], 'Em': ['E', 'G', 'B'], 'G7': ['G', 'B', 'D', 'F']}
HOOK = [('G5', 0, .25), ('G5', .25, .25), ('E5', .5, .5), ('G5', 1, .5), ('C6', 1.5, .5),
        ('B5', 2.5, .25), ('C6', 2.75, .25), ('E6', 3, .5), ('C6', 3.5, .5)]
MEL = [
    HOOK,
    [('A5', 0, .5), ('F5', .5, .5), ('C6', 1, .75), ('A5', 1.75, .25), ('F5', 2, .5), ('A5', 2.5, .25), ('G5', 2.75, .25), ('F5', 3, 1)],
    [('F5', 0, .25), ('F5', .25, .25), ('D5', .5, .5), ('F5', 1, .5), ('A5', 1.5, .5), ('D6', 2, .5), ('C6', 2.5, .5), ('A5', 3, .5), ('F5', 3.5, .5)],
    [('G5', 0, .5), ('B5', .5, .5), ('D6', 1, 1), ('D6', 2.5, .25), ('C6', 2.75, .25), ('B5', 3, .5), ('G5', 3.5, .5)],
    HOOK,
    [('G#5', 0, .25), ('G#5', .25, .25), ('E5', .5, .5), ('G#5', 1, .5), ('B5', 1.5, .5), ('D6', 2, .5), ('B5', 2.5, .5), ('G#5', 3, 1)],
    [('A5', 0, .5), ('C6', .5, .5), ('E6', 1, .75), ('D6', 1.75, .25), ('C6', 2, .5), ('A5', 2.5, .5), ('E5', 3, .5), ('A5', 3.5, .5)],
    [('F5', 0, .5), ('A5', .5, .5), ('C6', 1, .5), ('A5', 1.5, .5), ('G5', 2, .5), ('B5', 2.5, .5), ('D6', 3, .25), ('F6', 3.25, .25), ('G6', 3.5, .5)],
    [('C6', 0, .5), ('A5', .5, .25), ('C6', .75, .25), ('F6', 1, 1), ('E6', 2, .5), ('D6', 2.5, .5), ('C6', 3, 1)],
    [('B5', 0, .5), ('G5', .5, .25), ('B5', .75, .25), ('E6', 1, 1), ('D6', 2, .5), ('C6', 2.5, .5), ('B5', 3, 1)],
    [('A5', 0, .5), ('F5', .5, .25), ('A5', .75, .25), ('D6', 1, 1), ('C6', 2, .5), ('B5', 2.5, .5), ('A5', 3, 1)],
    [('G5', 0, .25), ('G5', .25, .25), ('C6', .5, .5), ('E6', 1, .5), ('G6', 1.5, 1.5), ('E6', 3, .5), ('C6', 3.5, .5)],
    [('A5', 0, .25), ('A5', .25, .25), ('C6', .5, .5), ('F6', 1, .5), ('E6', 1.5, .5), ('C6', 2, .5), ('A5', 2.5, .5), ('C6', 3, 1)],
    [('B5', 0, .25), ('B5', .25, .25), ('D6', .5, .5), ('G6', 1, .5), ('F6', 1.5, .5), ('D6', 2, .5), ('B5', 2.5, .5), ('D6', 3, 1)],
    [('E6', 0, .5), ('C6', .5, .5), ('A5', 1, .5), ('C6', 1.5, .5), ('F6', 2, .5), ('E6', 2.5, .5), ('C6', 3, .5), ('A5', 3.5, .5)],
    [('B5', 0, .5), ('D6', .5, .5), ('G6', 1, 1), ('F6', 2, .25), ('E6', 2.25, .25), ('D6', 2.5, .25), ('B5', 2.75, .25), ('G5', 3, .5)],
]
# bubble pops: (bar, beat, note) — climbing "bloops" at the phrase ends, like the board's pops
POPS = [(3, 2, 'C6'), (3, 2.25, 'E6'), (3, 2.5, 'G6'),
        (11, 3, 'G6'), (11, 3.25, 'C7'),
        (7, 2, 'C6'), (7, 2.25, 'D6'), (7, 2.5, 'E6'), (7, 2.75, 'G6'),
        (15, 3.5, 'D6'), (15, 3.625, 'F6'), (15, 3.75, 'G6'), (15, 3.875, 'B6')]
assert len(MEL) == BARS == len(CHORDS)

L = np.zeros(N); R = np.zeros(N)
sendL = np.zeros(N); sendR = np.zeros(N)


def add(sig, t, pan=0.0, gain=1.0, send=0.0):
    i = int(round(t * SR))
    if i >= N:
        return
    j = min(N, i + len(sig))
    s = sig[:j - i] * gain
    gl, gr = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    L[i:j] += s * gl; R[i:j] += s * gr
    if send:
        sendL[i:j] += s * gl * send; sendR[i:j] += s * gr * send


def tt(dur):
    return np.arange(int(dur * SR)) / SR


LP_LEAD = butter(2, 3800, btype='low', fs=SR, output='sos')


def bubble_lead(f, dur):
    """soft pulse wave (25 % duty, band-limited) that blips up a semitone into the note, light vibrato on long notes"""
    t = tt(dur + .12)
    blip = f * (1 - .055 * np.exp(-t / .012))
    vib = 1 + .004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - .18) / .15, 0, 1)
    ph = 2 * np.pi * np.cumsum(blip * vib) / SR
    s = np.zeros_like(t)
    for k in range(1, 14):
        if k * f > 9000:
            break
        s += (np.sin(np.pi * k * .25) / k) * np.sin(k * ph)       # pulse-wave series (duty .25)
    s = sosfilt(LP_LEAD, s)
    env = np.minimum(1, t / .006) * (.75 + .25 * np.exp(-t / .08)) * np.where(t < dur * .92, 1, np.exp(-(t - dur * .92) / .03))
    return s * env


def pizz(f, dur=.22):
    """pizzicato string: a plucked tone with a body thump, upper partials dying fast"""
    t = tt(dur + .25)
    s = np.zeros_like(t)
    for k in range(1, 7):
        s += (1 / k ** 1.3) * np.sin(2 * np.pi * k * f * t + rng.random()) * np.exp(-t * (10 + 7 * k))
    body = .4 * np.sin(2 * np.pi * 180 * t) * np.exp(-t / .02)
    return (s + body) * np.minimum(1, t / .002)


def bubble(f):
    """'bloop': a sine that bends up fast as it pops, with a tiny wet click"""
    t = tt(.16)
    ff = f * (.62 + .38 * (1 - np.exp(-t / .022))) * (1 + .25 * t / .16)
    s = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / .05) * np.minimum(1, t / .002)
    return s + .15 * np.sin(2 * np.pi * 2 * np.cumsum(ff) / SR) * np.exp(-t / .02)


def bass(f, dur):
    """round bubbly bass: sine + a soft square body that closes quickly"""
    t = tt(dur + .05)
    s = np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / .06)
    for k in (3, 5, 7):
        s += (.35 / k) * np.sin(2 * np.pi * k * f * t) * np.exp(-t * (12 + 4 * k))
    env = np.minimum(1, t / .005) * np.where(t < dur, 1, np.exp(-(t - dur) / .02))
    return s * env


def kick():
    t = tt(.3)
    f = 48 + 115 * np.exp(-t / .03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .15) * np.minimum(1, t / .001)


BP_SNAP = butter(2, [1800, 4200], btype='band', fs=SR, output='sos')
BP_CLAP = butter(2, [900, 2600], btype='band', fs=SR, output='sos')
HP_HAT = butter(2, 7500, btype='high', fs=SR, output='sos')
BP_SN = butter(2, [1500, 6000], btype='band', fs=SR, output='sos')


def snap():
    t = tt(.08)
    return sosfilt(BP_SNAP, rng.standard_normal(len(t))) * np.exp(-t / .012) * 2.2 + .3 * np.sin(2 * np.pi * 2100 * t) * np.exp(-t / .006)


def clap():
    t = tt(.26)
    env = sum((t >= d) * np.exp(-np.clip(t - d, 0, None) / .008) for d in (0, .01, .02))
    env = env + (t >= .028) * np.exp(-np.clip(t - .028, 0, None) / .1) * .6
    return sosfilt(BP_CLAP, rng.standard_normal(len(t)) * env) * 2.2


def hat(open_=False):
    t = tt(.35 if open_ else .05)
    return sosfilt(HP_HAT, rng.standard_normal(len(t))) * np.exp(-t / (.13 if open_ else .016))


def snare():
    t = tt(.2)
    return sosfilt(BP_SN, rng.standard_normal(len(t))) * np.exp(-t / .07) * 1.6 + .5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / .05)


def chord_at(bar, beat):
    c = CHORDS[bar % BARS]
    return (c[0] if beat < 2 else c[1]) if isinstance(c, tuple) else c


def root_of(c):
    r = m(TONES[c][0] + '2')
    return r - 12 if r > m('F2') else r


for bar in range(BARS):
    t0 = bar * 4 * BEAT
    B = bar >= 8
    fill = bar in (7, 15)
    # lead + (B half) a quiet octave-up double
    for note, b, ln in MEL[bar]:
        f = hz(m(note))
        add(bubble_lead(f, ln * BEAT), t0 + b * BEAT, pan=.1, gain=.20, send=.25)
        if B:
            add(bubble_lead(2 * f, ln * BEAT), t0 + b * BEAT + .005, pan=-.3, gain=.045, send=.3)
    # pizzicato arpeggio in 8ths: root · 5th · 3rd · 5th · octave · 5th · 3rd · 5th
    for k in range(8):
        tones = TONES[chord_at(bar, k / 2)]
        idx = [0, 2, 1, 2, 3, 2, 1, 2][k]
        n = m(tones[idx] + '4') if idx < 3 else m(tones[0] + '5')
        add(pizz(hz(n)), t0 + k * BEAT / 2, pan=-.35, gain=.13 if k % 2 == 0 else .10, send=.15)
    # bass: held + bounce in A, disco octaves in B
    if B:
        for k in range(8):
            r = root_of(chord_at(bar, k / 2))
            add(bass(hz(r + (12 if k % 2 else 0)), .4 * BEAT), t0 + k * BEAT / 2, gain=.36 if k % 2 == 0 else .26)
    else:
        for b, iv, ln in ((0, 0, 1.2), (1.5, 0, .4), (2, 7, .9), (3, 0, .4), (3.5, 12, .4)):
            add(bass(hz(root_of(chord_at(bar, b)) + iv), ln * BEAT), t0 + b * BEAT, gain=.38 if iv == 0 else .3)
    # drums
    for b in ((0, 1, 2, 3) if B else ((0, 2, 2.75) if bar % 2 else (0, 2))):
        add(kick(), t0 + b * BEAT, gain=.6)
    for b in (1, 3):
        if fill and b == 3:
            continue
        if B:
            add(clap(), t0 + b * BEAT, pan=.05, gain=.22, send=.1)
            add(snare(), t0 + b * BEAT, gain=.08)
        else:
            add(snap(), t0 + b * BEAT, pan=.2, gain=.2, send=.2)
    for k in range(16):
        if k % 2 == 1 or B:
            acc = .05 if k % 4 == 2 else .03
            add(hat(), t0 + k * BEAT / 4, pan=.35, gain=acc)
    if B:
        add(hat(True), t0 + 3.5 * BEAT, pan=.35, gain=.05)
    if fill:                                     # snare 16ths into the next bar, louder towards the downbeat
        for k in range(4):
            add(snare(), t0 + (3 + k / 4) * BEAT, pan=-.05, gain=.1 + .04 * k)
for bar, b, n in POPS:
    add(bubble(hz(m(n))), (bar * 4 + b) * BEAT, pan=.45 if (b * 4) % 2 else -.45, gain=.16, send=.3)

# a little room
ir_t = np.arange(int(1.0 * SR)) / SR
irL = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / .2); irR = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / .2)
irL[:int(.012 * SR)] = 0; irR[:int(.016 * SR)] = 0
irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
L2 = L + .5 * fftconvolve(sendL, irL)[:N]; R2 = R + .5 * fftconvolve(sendR, irR)[:N]

# seamless loop: fold everything after LOOP back onto the start
n = int(round(LOOP * SR))
st = np.stack([L2[:n], R2[:n]], 1)
tail = np.stack([L2[n:], R2[n:]], 1)
st[:len(tail)] += tail
st -= st.mean(0)
st /= np.abs(st).max()
st = np.tanh(st * 1.4) / np.tanh(1.4)                      # gentle glue
meter = pyloudnorm.Meter(SR)
st *= 10 ** ((TARGET_LUFS - meter.integrated_loudness(np.tile(st, (2, 1)))) / 20)
st *= min(1, 10 ** (-1 / 20) / np.abs(st).max())           # peaks ≤ -1 dBFS
print(f'loop {LOOP:.2f}s · {BPM} BPM · E♭ · LUFS {meter.integrated_loudness(np.tile(st, (2, 1))):.1f} · '
      f'peak {20 * np.log10(np.abs(st).max()):.1f} dBFS')

wav = ROOT / 'tools' / 'bgm_loop.wav'
pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
with wave.open(str(wav), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', '160k', str(ROOT / 'public' / 'bgm.mp3')], check=True)
wav.unlink()
print('→', ROOT / 'public' / 'bgm.mp3', (ROOT / 'public' / 'bgm.mp3').stat().st_size // 1024, 'KB')
