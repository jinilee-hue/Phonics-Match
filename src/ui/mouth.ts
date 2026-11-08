// The tutor's mouth while it talks (user: "튜터 입모양과 말소리가 안맞아"): every voice clip has Rhubarb Lip Sync cues
// (src/data/mouth.json, tools/build_mouth_cues.py); while a clip plays, the shape at the clip's current time
// (core/audio.ts voiceNow, minus the output latency) is DRAWN here in the art's own look, easing between shapes.
// Not talking = the painted mouth of the mockup (the open smile) — the drawn 'S' shape matches it, so the hand-over
// between drawn and painted is invisible.
import mouthCues from '../data/mouth.json';
import { audioCtx, voiceNow } from '../core/audio';

/** Rhubarb shapes: A closed (m b p) · B a little open · C open (e, a) · D wide (ah) · E rounded (o) · F puckered (oo, w) ·
 *  G f/v · H l (tongue up) · X rest (between words) · S = the painted smile (not talking) */
export type Shape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X' | 'S';
/** art px of the 660×680 tutor frame: width between the corners, the upper lip's two humps over the corners, the dip
 *  between them, the bowl under the corners, tongue size / lift, roundness, smile (corners up) */
interface MP { w: number; lobe: number; dip: number; low: number; tongue: number; up: number; round: number; smile: number }
// S fitted to the painted mouth's dark area (IoU 0.94, ~/.hermes/cache/scratch/pm/fit_mouth.py); the rest scaled from it
const SHAPES: Record<Shape, MP> = {
  S: { w: 56, lobe: 10.5, dip: 5.5, low: 24, tongue: 1, up: 0, round: 0, smile: 1 },
  D: { w: 55, lobe: 10, dip: 5, low: 24, tongue: 1, up: 0, round: 0, smile: 0.9 },
  C: { w: 51, lobe: 6.5, dip: 3, low: 16, tongue: 0.85, up: 0, round: 0.1, smile: 0.8 },
  B: { w: 44, lobe: 3, dip: 1, low: 8, tongue: 0.35, up: 0, round: 0, smile: 0.8 },
  E: { w: 40, lobe: 7.5, dip: 0, low: 18, tongue: 0.6, up: 0, round: 0.7, smile: 0.4 },
  F: { w: 27, lobe: 6, dip: 0, low: 12, tongue: 0.2, up: 0, round: 1, smile: 0.2 },
  G: { w: 44, lobe: 2.2, dip: 1, low: 6, tongue: 0, up: 0, round: 0, smile: 0.7 },
  H: { w: 50, lobe: 6.5, dip: 2, low: 15, tongue: 1, up: 1, round: 0.2, smile: 0.7 },
  A: { w: 36, lobe: 0, dip: 0, low: 0, tongue: 0, up: 0, round: 0, smile: 0.5 },
  X: { w: 40, lobe: 0, dip: 0, low: 0, tongue: 0, up: 0, round: 0, smile: 1 },
};
const CUES = mouthCues as unknown as Record<string, [number, string][]>;
/** the painted mouth's corners meet here (art px) */
export const MOUTH = { x: 324, y: 330.5, rot: 1 };
/** the canvas around it (art px) and its resolution */
export const MBOX = { x: 263, y: 290, w: 120, h: 90, k: 3 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** look this far ahead in the cues: the drawn mouth eases into a shape (45 ms), so it starts moving a beat early */
const AHEAD = 0.04;
/** after a line: the lips stay closed this long, then ease back into the painted smile (slowly: not a syllable) */
const HOLD_MS = 600;

export class Mouth {
  cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  m: MP = { ...SHAPES.S };
  shape: Shape = 'S';
  src: 'cue' | 'level' | 'rest' = 'rest';
  talking = false;
  /** tests: force a shape */
  testShape: Shape | null = null;
  level: () => number = () => 0;
  private quietAt = 0;
  private raf = 0;
  private last = 0;
  onDrawn: (drawn: boolean) => void = () => {};
  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.className = 't-mouth-c';
    this.cv.width = MBOX.w * MBOX.k; this.cv.height = MBOX.h * MBOX.k;
    Object.assign(this.cv.style, { left: `${MBOX.x}px`, top: `${MBOX.y}px`, width: `${MBOX.w}px`, height: `${MBOX.h}px` });
    this.g = this.cv.getContext('2d')!;
  }

  talk(on: boolean) {
    if (on === this.talking) return;
    this.talking = on;
    if (!on) this.quietAt = performance.now();
    this.kick();
  }
  kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.onDrawn(true);
    const step = (now: number) => {
      const dt = Math.min(100, now - this.last); this.last = now;
      this.shape = this.wanted(now);
      const target = SHAPES[this.shape];
      // between talking shapes: quick (45 ms); back to the painted smile after a line: slower
      const e = 1 - Math.exp(-dt / (this.shape === 'S' ? 160 : 45));
      let d = 0;
      for (const k of Object.keys(target) as (keyof MP)[]) { this.m[k] = lerp(this.m[k], target[k], e); d += Math.abs(this.m[k] - target[k]); }
      this.draw();
      if (this.shape === 'S' && d < 0.4 && !this.testShape) { this.raf = 0; this.m = { ...SHAPES.S }; this.onDrawn(false); return; }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** the shape the voice wants now: the clip's Rhubarb cue at its current time, else its loudness */
  private wanted(now: number): Shape {
    if (this.testShape) { this.src = 'cue'; return this.testShape; }
    if (!this.talking) { this.src = 'rest'; return now - this.quietAt < HOLD_MS ? 'X' : 'S'; }
    const on = voiceNow();
    const cues = on ? CUES[on.key] : undefined;
    if (on && cues && cues.length) {
      // what we hear lags the audio clock by the output latency
      const ac = audioCtx() as (AudioContext & { outputLatency?: number }) | null;
      const t = on.t - (ac?.outputLatency ?? ac?.baseLatency ?? 0) + AHEAD;
      let lo = 0, hi = cues.length - 1, i = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (cues[mid][0] <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
      this.src = 'cue';
      return (i < 0 ? 'X' : cues[i][1]) as Shape;
    }
    this.src = on ? 'level' : 'rest';
    if (!on) return 'X';                       // a pause between the parts of a line
    const lv = this.level();
    return lv > 0.12 ? 'C' : lv > 0.04 ? 'B' : 'A';
  }

  /** the mouth in the art's look: maroon inside, darker under the upper lip, a coral tongue, a soft dark rim */
  draw() {
    const g = this.g, m = this.m, K = MBOX.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(K, 0, 0, K, (MOUTH.x - MBOX.x) * K, (MOUTH.y - MBOX.y) * K);
    g.rotate((MOUTH.rot * Math.PI) / 180);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const L = m.w / 2, R = m.w / 2, lift = 2.2 * m.smile;
    if (m.lobe + m.low < 2.2) {
      // closed: a short dark almond, thicker in the middle, fine at the corners, sagging a little (a smile)
      const t = 2.4 + 0.8 * m.smile;
      g.beginPath();
      g.moveTo(-L, -lift);
      g.quadraticCurveTo(0, lift * 1.3 + t, R, -lift);
      g.quadraticCurveTo(0, lift * 1.3 - t * 0.3, -L, -lift);
      g.closePath();
      const gr = g.createLinearGradient(0, -lift, 0, t);
      gr.addColorStop(0, '#4e1308'); gr.addColorStop(1, '#7c2c17');
      g.fillStyle = gr; g.fill();
      return;
    }
    const hump = m.lobe * (1 - 0.15 * m.round), mid = -(m.lobe - m.dip);
    const path = () => {
      g.beginPath();
      g.moveTo(-L, -lift);
      // the upper lip: two soft humps with a dip between them (the painted mouth's bean top); round mouths arch
      g.bezierCurveTo(-L * (0.95 - 0.1 * m.round), -hump * 1.35, -L * 0.45, -hump * 1.15, 0, mid);
      g.bezierCurveTo(R * 0.45, -hump * 1.15, R * (0.95 - 0.1 * m.round), -hump * 1.35, R, -lift);
      // the bowl
      g.bezierCurveTo(R * (0.98 - 0.12 * m.round), m.low * (1.33 + 0.1 * m.round), -L * (0.98 - 0.12 * m.round), m.low * (1.33 + 0.1 * m.round), -L, -lift);
      g.closePath();
    };
    path();
    const top = -hump * 1.05;
    const grad = g.createLinearGradient(0, top, 0, m.low);
    grad.addColorStop(0, '#4b1208'); grad.addColorStop(0.5, '#6c1f0f'); grad.addColorStop(1, '#8a3219');
    g.fillStyle = grad; g.fill();
    g.save(); path(); g.clip();
    if (m.tongue > 0.04) {
      const ty = lerp(m.low * 1.02, m.low * 0.55, m.up), rx = m.w * 0.38, ry = Math.max(1, m.low * 0.5 * m.tongue + 1);
      const tg = g.createLinearGradient(0, ty - ry, 0, ty + ry);
      tg.addColorStop(0, '#ff9575'); tg.addColorStop(0.45, '#fc7256'); tg.addColorStop(1, '#e85a43');
      g.fillStyle = tg;
      g.beginPath(); g.ellipse(0, ty, rx, ry, 0, 0, Math.PI * 2); g.fill();
    }
    // the shadow under the upper lip
    const sh = g.createLinearGradient(0, top, 0, top + (m.low + hump) * 0.45);
    sh.addColorStop(0, 'rgba(36, 6, 2, 0.55)'); sh.addColorStop(1, 'rgba(36, 6, 2, 0)');
    g.fillStyle = sh; g.fillRect(-L - 2, top - 4, m.w + 4, m.low + hump + 8);
    g.restore();
    path();
    g.strokeStyle = 'rgba(86, 26, 8, 0.55)'; g.lineWidth = 1.3; g.stroke();
  }
}
