// Title screen motion (from the concept video): the floating letters lift off, swirl once around the logo leaving
// sparkle trails — behind the logo across the top, in front of it along the bottom — and settle back; the logo bobs,
// PLAY pulses (CSS), the tutor waves hello.
// On the orbit the letters ride ONE ring, evenly spaced by arc length (user: "m과 a 알파벳이 겹쳐서 도는데"): flying each
// letter to the orbit point at its own home angle put the blue M and A (1.9° apart) on one spot, T and P too, and the
// per-letter lag let letters catch up with each other. Check: tools/qa/title_orbit.py (closest approach per pair).
// The swirl moves like Halli Galli's title cards (user: "단어들 돌때 할리갈리 카드 도는거처럼 좀 자연스럽게"): one slow
// lap with a soft start and stop, far letters smaller, a gentle sway, and each letter hops and turns over once in real 3D,
// one after another — it used to whizz round in 3.6 s with every letter squashed flat twice at the same moment.
// The mockup's stars and speed marks next to the letters (data/deco.json, tools/title_deco.py) belong to the resting
// picture: they pop out one by one just before their letter lifts off and back in after it lands, twinkling meanwhile
// (user: "자연스럽게 나왔다가 사라졌다가 해야지 같이 통으로 움직이는것두 어색해" — riding rigidly with the letter looked stiff).
import artData from '../data/art.json';
import decoData from '../data/deco.json';
import type { Fx } from './fx';

type Box = { x: number; y: number; w: number; h: number };
const ART = artData as unknown as Record<string, Box>;
const base = new URL('./', location.href).href;
const LETTERS = ['l_m_red', 'l_a_blue', 'l_t_top', 'l_p_top', 'l_m_blue', 'l_t_bot', 'l_p_bot'];
const TRAIL = ['#fff6c8', '#ffd1e6', '#d4f2ff', '#e4ffd2'];
const CX = 1381, CY = 560, RX = 1010, RY = 480;
// one loop (s): rest at home → lift onto the ring → one slow lap → back home with a little overshoot → rest
const CYCLE = 17, REST0 = 1.4, LIFT = 1.4, ORBIT = 9.5, BACK = 1.7;
const LAND = LIFT + ORBIT + BACK;
const RING = LIFT * 0.6 + ORBIT - 0.2;                 // the ring turns from 40% into the lift-off to just before the return
const FLIP = 1.1, HOP = 46, PERSP = 1400;              // one hop-and-turn: 1.1 s, cubic, like the Halli Galli cards
const FLIP_ORDER = [0, 4, 2, 6, 1, 5, 3];              // who turns over when: across the ring, not neighbour after neighbour
const FLIP_AT = LETTERS.map((_n, i) => LIFT + 0.7 + FLIP_ORDER.indexOf(i) * ((ORBIT - 1.3 - FLIP) / (LETTERS.length - 1)));
const TILT = [-6, 5, -4, 7, -5, 4, -7];                // each letter's lean on the ring (deg); it sways ±5 around it
/** home nudges (design px): the top T sits right under the title's buttons (dress up · sound · exit, y 33-209) — lower,
 *  so they never cover it (12 px clear at the top of its bob) */
const NUDGE: Record<string, [number, number]> = { l_t_top: [0, 75] };

// the orbit ellipse by arc length: ARC[j] = length from angle 0 to angle 2πj/TAB
const TAB = 720;
const ARC: number[] = [0];
for (let j = 1; j <= TAB; j++) {
  const a = ((j - 0.5) / TAB) * Math.PI * 2;
  ARC.push(ARC[j - 1]! + Math.hypot(RX * Math.sin(a), RY * Math.cos(a)) * ((Math.PI * 2) / TAB));
}
const PER = ARC[TAB]!;
/** the orbit angle at arc length s (any s: wraps) */
function thetaAt(s: number) {
  s = ((s % PER) + PER) % PER;
  let lo = 0, hi = TAB;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ARC[mid]! <= s) lo = mid; else hi = mid; }
  return ((lo + (s - ARC[lo]!) / (ARC[lo + 1]! - ARC[lo]!)) / TAB) * Math.PI * 2;
}
/** the arc length at orbit angle th */
function arcAt(th: number) {
  const f = ((((th / (Math.PI * 2)) % 1) + 1) % 1) * TAB, j = Math.floor(f);
  return ARC[j]! + (ARC[Math.min(TAB, j + 1)]! - ARC[j]!) * (f - j);
}

interface L { el: HTMLImageElement; hx: number; hy: number; w: number; h: number; hs: number; s: number; ph: number; front: boolean; under: boolean; decos: Deco[] }
/** a mark riding with a letter: its top-left at home (design px, with the letter's nudge) */
interface Deco { el: HTMLImageElement; x0: number; y0: number }
/** the letters whose home is where the demo board comes up (ui/demo.ts): they fade while it's up */
const UNDER_DEMO = new Set(['l_t_bot', 'l_p_bot']);

export class Title {
  private ls: L[] = [];
  private raf = 0;
  private t0 = 0;
  /** seconds of one loop (QA) */
  readonly cycle = CYCLE;
  constructor(private root: HTMLElement, private fx: Fx) {
    const front = root.querySelector('.orbit.front')!;
    LETTERS.forEach((n, i) => {
      const b = ART[n];
      const el = document.createElement('img');
      el.src = `${base}art/${n}.webp`; el.alt = ''; el.draggable = false;
      el.style.width = `${b.w}px`; el.style.height = `${b.h}px`;
      const [nx, ny] = NUDGE[n] ?? [0, 0];
      const hx = b.x + b.w / 2 + nx, hy = b.y + b.h / 2 + ny;
      const hs = arcAt(Math.atan2((hy - CY) / RY, (hx - CX) / RX));     // where its home points to on the orbit
      const l: L = { el, hx, hy, w: b.w, h: b.h, hs, s: hs, ph: i * 0.9, front: true, under: UNDER_DEMO.has(n), decos: [] };
      front.appendChild(el);
      this.ls.push(l);
    });
    // its marks, at home beside it (they don't fly: they pop out and back in, see marks())
    for (const d of decoData as { src: string; x: number; y: number; w: number; h: number; of: string }[]) {
      const l = this.ls[LETTERS.indexOf(d.of)];
      if (!l) continue;
      const el = document.createElement('img');
      el.src = `${base}${d.src}`; el.alt = ''; el.draggable = false; el.className = 'deco';
      el.style.width = `${d.w}px`; el.style.height = `${d.h}px`;
      const [nx, ny] = NUDGE[d.of] ?? [0, 0];
      const x0 = d.x + nx, y0 = d.y + ny;
      el.style.transform = `translate(${x0}px, ${y0}px)`;
      front.prepend(el);                                           // under every letter of its layer
      l.decos.push({ el, x0, y0 });
    }
    // the ring's seats: the letters keep their order round the logo, evenly spaced, as near their homes as can be
    // (the offset = circular mean of home − seat)
    const order = [...this.ls].sort((a, b) => a.hs - b.hs), step = PER / order.length;
    let cx = 0, cy = 0;
    order.forEach((l, r) => { const f = ((l.hs - r * step) / PER) * Math.PI * 2; cx += Math.cos(f); cy += Math.sin(f); });
    const s0 = (Math.atan2(cy, cx) / (Math.PI * 2)) * PER;
    order.forEach((l, r) => { l.s = s0 + r * step; });
  }
  private holdOn = false;
  private holdV = 0;
  /** the demo board is up: the letters ease home and only bob; the ones under the board fade */
  hold(on: boolean) { this.holdOn = on; }
  start() {
    if (this.raf) return;
    this.t0 = performance.now();
    let last = this.t0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.holdV += ((this.holdOn ? 1 : 0) - this.holdV) * (1 - Math.exp(-dt / 0.16));
      this.frame((now - this.t0) / 1000); this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  private frame(t: number) {
    const back = this.root.querySelector('.orbit.back')!, front = this.root.querySelector('.orbit.front')!;
    const c = t % CYCLE;
    // the ring turns as one (no lag in it, so no letter catches up with another), already moving when they join it
    const e = easeSine((c - REST0 - LIFT * 0.4) / RING);
    this.ls.forEach((l, i) => {
      // lift-off and the return stay a little out of step
      const lag = (i % 3) * 0.14;
      const u = c - REST0 - lag;
      let k = 0, th = thetaAt(l.s), turn = 0, hop = 0;
      if (u > 0 && u < LAND) {
        th = thetaAt(l.s - e * PER);
        k = u < LIFT ? smooth(u / LIFT) : u > LIFT + ORBIT ? 1 - settle((u - LIFT - ORBIT) / BACK) : 1;
        // on the ring each letter hops and turns over once, one after another
        const p = (u - FLIP_AT[i]!) / FLIP;
        if (p > 0 && p < 1) { turn = 360 * easeCubic(p); hop = Math.sin(Math.PI * p) * HOP; }
      }
      k *= 1 - this.holdV;
      turn *= 1 - this.holdV;
      l.el.style.opacity = l.under ? (1 - this.holdV).toFixed(3) : '';
      const ko = clamp01(k);
      const ox = CX + Math.cos(th) * RX, oy = CY + Math.sin(th) * RY;
      const bob = Math.sin(t * 1.6 + l.ph) * 12 * (1 - ko) + Math.sin(t * 1.3 + l.ph) * 14 * ko;
      const x = l.hx + (ox - l.hx) * k, y = l.hy + (oy - l.hy) * k + bob - hop * ko;
      const depth = (Math.sin(th) + 1) / 2;                       // 0 = top (far), 1 = bottom (near)
      const s = 1 + k * (0.36 * depth - 0.2);                     // on the ring: far 0.8 → near 1.16
      const rot = Math.sin(t * 1.2 + l.ph) * 6 * (1 - ko) + ko * (TILT[i]! + 5 * Math.sin(t * 0.7 + l.ph));
      l.el.style.transform = `translate(${x - l.w / 2}px, ${y - l.h / 2}px) perspective(${PERSP}px) rotate(${rot}deg) rotateY(${turn}deg) scale(${s})`;
      const wantFront = k < 0.5 || Math.sin(th) > -0.15;
      if (wantFront !== l.front) { (wantFront ? front : back).appendChild(l.el); l.front = wantFront; }
      if (k > 0.3 && Math.random() < 0.3) this.fx.trail(x + (Math.random() - 0.5) * l.w * 0.4, y + l.h * 0.15, TRAIL[Math.floor(Math.random() * TRAIL.length)]);
      this.marks(l, u, t);
    });
  }

  /** a letter's marks: out one by one just before it lifts off, back one by one after it lands, twinkling at rest */
  private marks(l: L, u: number, t: number) {
    l.decos.forEach((d, j) => {
      let v: number, sc: number, r: number;
      if (u > -0.4 && u < LAND) {
        const q = smooth((u + 0.32 - j * 0.06) / 0.3);
        v = 1 - q; sc = 1 - 0.65 * q; r = q * (j % 2 ? 35 : -35);
      } else {
        const since = u >= LAND ? u - LAND : u + CYCLE - LAND;   // since it landed (in the last loop, while waiting)
        const q = clamp01((since - 0.1 - j * 0.12) / 0.5);
        v = smooth(q * 1.8); sc = backOut(q); r = (1 - q) * -30;
      }
      // the demo board is up: the letters are home, so are their marks (the ones under the board fade with their letter)
      v += (1 - v) * this.holdV; sc += (1 - sc) * this.holdV;
      if (l.under) v *= 1 - this.holdV;
      const tw = 1 + 0.06 * Math.sin(t * 2.3 + j * 1.7 + l.ph);
      const fy = Math.sin(t * 1.4 + j * 2.1 + l.ph) * 5;
      d.el.style.opacity = clamp01(v).toFixed(3);
      d.el.style.transform = `translate(${d.x0}px, ${d.y0 + fy}px) rotate(${r + Math.sin(t * 1.1 + j * 1.3) * 5}deg) scale(${Math.max(0, sc * tw)})`;
    });
  }
}
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** ease-in-out (sine) of 0..1, clamped: the ring's lap */
const easeSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
/** ease-in-out (cubic) of 0..1, clamped: slow → fast → slow, the hop-and-turn */
const easeCubic = (x: number) => { const o = clamp01(x); return o < 0.5 ? 4 * o * o * o : 1 - Math.pow(-2 * o + 2, 3) / 2; };
/** 0 → 1 overshooting to ~1.1 on the way: the marks' pop */
const backOut = (x: number) => { const o = clamp01(x) - 1; return 1 + 2.70158 * o * o * o + 1.70158 * o * o; };
/** 0 → 1 for the way home: leaves the ring gently (x² in), overshoots ~6 % and settles (backOut starting at full speed
 *  shot the letters off the ring at 2200 px/s) */
const settle = (x: number) => { const o = clamp01(x) ** 2 - 1; return 1 + 2.3 * o * o * o + 1.3 * o * o; };
