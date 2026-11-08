// Effects in design px of the play stage: a canvas for particles (cotton puffs, pastel stars, sparkles, light rays)
// and DOM pieces for the golden letter, letter bubbles, "Combo N!", coins and floating numbers.
import { S, onFit, DW, DH, boxIn, wait } from './stage';

type P = { kind: 'puff' | 'star' | 'spark' | 'dot'; x: number; y: number; vx: number; vy: number; r: number; r1: number; a: number; va: number;
  life: number; age: number; col: string; g: number; delay: number };
type Ray = { x: number; y: number; age: number; life: number; r: number; rot: number };

const STAR_COLS = ['#ff9ec7', '#ffe066', '#8fe3ff', '#a8f08a', '#c9a8ff', '#ffb3d9'];
// the golden letter's burst = Magic Block's right-block reveal (Phonics-Jenga src/game/cheer.ts, itself Word Mashup's
// result card), drawn flat: candy streaks, spinning puffy stars, glossy candy dots, a warm glow — no smoke
const CANDY = ['#ffd23f', '#ff4fa3', '#ff5a5a', '#3fa7ff', '#ff9a2e', '#6bd66b', '#9b6bff', '#37d6ff'];
const STAR3 = ['#ffd23f', '#ffd23f', '#ffd23f', '#ffc21f', '#4db8ff', '#ff7ac0'];
const BASE = 560;                                  // design px: the burst's scale (Magic Block: min(screen w, h))
type Streak = { x: number; y: number; t0: number; life: number; ang: number; r0: number; v: number; len: number; w: number; col: string };
type Star3 = { x: number; y: number; vx: number; vy: number; t0: number; life: number; size: number; spin: number; rot: number; col: string };
type Candy = { x: number; y: number; vx: number; vy: number; t0: number; life: number; size: number; col: string };
type Glow = { x: number; y: number; t0: number; life: number; r: number };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const lin = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const sstep = (a: number, b: number, x: number) => { const t = lin(a, b, x); return t * t * (3 - 2 * t); };
const backOut = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const shade = (hex: string, k: number) => { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; };

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private rayList: Ray[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;                                   // the burst's clock (s)
  private streaks: Streak[] = [];
  private stars3: Star3[] = [];
  private candies: Candy[] = [];
  private glows: Glow[] = [];
  constructor(private canvas: HTMLCanvasElement, public dom: HTMLElement, public stage: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    onFit(() => this.resize());
    this.resize();
  }
  private resize() {
    const k = S * Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(DW * k); this.canvas.height = Math.round(DH * k);
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
  }
  private kick() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); } }
  private tick = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const c = this.ctx;
    c.clearRect(0, 0, DW, DH);
    this.t += dt;
    this.drawGlows();
    // rays under the particles
    for (let i = this.rayList.length - 1; i >= 0; i--) {
      const r = this.rayList[i]; r.age += dt; r.rot += dt * 0.5;
      if (r.age >= r.life) { this.rayList.splice(i, 1); continue; }
      const t = r.age / r.life, a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      c.save(); c.translate(r.x, r.y); c.rotate(r.rot); c.globalAlpha = a * 0.75;
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r.r);
      g.addColorStop(0, 'rgba(255,253,235,1)'); g.addColorStop(0.35, 'rgba(255,246,200,.75)'); g.addColorStop(1, 'rgba(255,246,200,0)');
      c.fillStyle = g;
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * Math.PI * 2, w = 0.09 + (k % 3) * 0.035;
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r.r * (0.75 + (k % 2) * 0.25), a0 - w, a0 + w); c.closePath(); c.fill();
      }
      c.restore();
    }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      if (p.age >= p.life) { this.ps.splice(i, 1); continue; }
      const t = p.age / p.life;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
      const damp = p.kind === 'puff' ? 0.9 : 0.985;
      p.vx *= Math.pow(damp, dt * 60); p.vy *= Math.pow(damp, dt * 60);
      const r = p.r + (p.r1 - p.r) * (1 - Math.pow(1 - t, 2));
      if (p.kind === 'puff') this.puff(p.x, p.y, r, t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
      else if (p.kind === 'star') this.star(p.x, p.y, r, p.a, p.col, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      else if (p.kind === 'spark') this.spark(p.x, p.y, r * (0.6 + 0.4 * Math.sin(t * Math.PI)), p.a, p.col, Math.sin(t * Math.PI));
      else { c.globalAlpha = 1 - t; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); c.globalAlpha = 1; }
    }
    this.drawBurst();
    if (this.ps.length || this.rayList.length || this.streaks.length || this.stars3.length || this.candies.length || this.glows.length) this.raf = requestAnimationFrame(this.tick);
    else { this.raf = 0; c.clearRect(0, 0, DW, DH); }
  };
  private puff(x: number, y: number, r: number, a: number) {
    const c = this.ctx;
    c.globalAlpha = Math.max(0, a);
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#fdfcff'); g.addColorStop(1, '#e3e8f4');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.globalAlpha = 1;
  }
  private star(x: number, y: number, r: number, rot: number, col: string, a: number) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = Math.max(0, a);
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.5 : r, an = -Math.PI / 2 + (k * Math.PI) / 5;
      const px = Math.cos(an) * rr, py = Math.sin(an) * rr;
      k ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
    c.lineJoin = 'round'; c.lineWidth = r * 0.28; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.fill();
    c.globalAlpha *= 0.55; c.fillStyle = '#fff';
    c.beginPath(); c.arc(-r * 0.18, -r * 0.22, r * 0.18, 0, 7); c.fill();
    c.restore();
  }
  private spark(x: number, y: number, r: number, rot: number, col: string, a: number) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = Math.max(0, a);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, -r); c.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0); c.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
    c.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0); c.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r);
    c.fill(); c.restore();
  }
  /** the warm glow behind a golden letter */
  private drawGlows() {
    const c = this.ctx;
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const gl = this.glows[i], a = this.t - gl.t0;
      if (a > gl.life) { this.glows.splice(i, 1); continue; }
      if (a < 0) continue;
      const on = sstep(0, 0.18, a) * (1 - sstep(gl.life - 0.4, gl.life, a));
      const r = gl.r * (0.85 + 0.15 * sstep(0, 0.3, a));
      const g = c.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, r);
      g.addColorStop(0, 'rgba(255,246,205,1)'); g.addColorStop(0.3, 'rgba(255,224,130,.75)'); g.addColorStop(0.65, 'rgba(255,200,90,.25)'); g.addColorStop(1, 'rgba(255,190,80,0)');
      c.globalAlpha = 0.8 * on; c.fillStyle = g; c.beginPath(); c.arc(gl.x, gl.y, r, 0, 7); c.fill(); c.globalAlpha = 1;
    }
  }
  /** the burst, frame by frame (Magic Block's motion): streaks fly out, slow down and thin; candies under drag + gravity;
   *  stars thrown up, turning over on their axis */
  private drawBurst() {
    const c = this.ctx, t = this.t;
    this.streaks = this.streaks.filter((s) => {
      const a = t - s.t0;
      if (a > s.life) return false;
      if (a < 0) return true;
      const u = a / s.life;
      const head = s.r0 + s.v * a * (1 - 0.45 * u);
      const len = s.len * Math.min(1, a / 0.07) * (1 - 0.35 * u);
      const w = s.w * (1 - sstep(0.6, 1, u));
      if (w > 0.5 && len > 1) {
        const mid = head - len / 2;
        c.save(); c.translate(s.x + Math.cos(s.ang) * mid, s.y + Math.sin(s.ang) * mid); c.rotate(s.ang);
        this.streak(len, w, s.col); c.restore();
      }
      return true;
    });
    const gc = 1.1 * BASE, drag = 1.6;
    this.candies = this.candies.filter((f) => {
      const a = t - f.t0;
      if (a > f.life) return false;
      if (a < 0) return true;
      const e = (1 - Math.exp(-drag * a)) / drag;
      const x = f.x + f.vx * e, y = f.y + (f.vy - gc / drag) * e + (gc / drag) * a;
      const r = f.size * backOut(lin(0, 0.12, a)) * (1 - sstep(0.8, 1, a / f.life));
      if (r > 0.3) this.candy(x, y, r, f.col);
      return y < DH + 60;
    });
    const g = 0.95 * BASE;
    this.stars3 = this.stars3.filter((s) => {
      const a = t - s.t0;
      if (a > s.life) return false;
      if (a < 0) return true;
      const r = s.size * backOut(lin(0, 0.12, a)) * (1 - sstep(0.72, 1, a / s.life));
      if (r > 0.5) this.star3(s.x + s.vx * a, s.y + s.vy * a + 0.5 * g * a * a, r, s.rot + s.spin * a * 0.18, Math.cos(s.spin * a), s.col);
      return true;
    });
  }
  /** a candy streak along +x: thin tail, fat round head at the front, a glossy stripe */
  private streak(len: number, w: number, col: string) {
    const c = this.ctx, h = w / 2, x0 = -len / 2, xh = len / 2 - h;
    c.beginPath();
    c.moveTo(x0, 0);
    c.quadraticCurveTo(x0 + len * 0.45, -h * 0.42, xh, -h);
    c.arc(xh, 0, h, -Math.PI / 2, Math.PI / 2);
    c.quadraticCurveTo(x0 + len * 0.45, h * 0.42, x0, 0);
    c.closePath();
    c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.globalAlpha = 0.6; c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(xh - len * 0.22, -h * 0.4, len * 0.27, Math.max(1, h * 0.24), -0.06, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  /** a puffy star turning on its axis (face = cos of the turn: narrow edge-on, a shade darker from behind) */
  private star3(x: number, y: number, r: number, rot: number, face: number, col: string) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(Math.max(0.12, Math.abs(face)), 1);
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.46 : r, an = -Math.PI / 2 + (k * Math.PI) / 5;
      k ? c.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : c.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    c.closePath();
    const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.05);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, col); g.addColorStop(1, shade(col, face < 0 ? 0.62 : 0.8));
    c.lineJoin = 'round'; c.lineWidth = r * 0.3; c.strokeStyle = g; c.fillStyle = g;
    c.stroke(); c.fill();
    c.restore();
  }
  /** a glossy candy dot */
  private candy(x: number, y: number, r: number, col: string) {
    const c = this.ctx;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, shade(col, 0.72));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  private add(p: Partial<P> & Pick<P, 'kind' | 'x' | 'y'>) {
    this.ps.push({ vx: 0, vy: 0, r: 20, r1: 20, a: 0, va: 0, life: 1, age: 0, col: '#fff', g: 0, delay: 0, ...p });
    if (this.ps.length > 900) this.ps.splice(0, this.ps.length - 900);
    this.kick();
  }

  /** a matched animal pops: cotton puffs + pastel stars */
  pop(x: number, y: number, k = 1) {
    for (let i = 0; i < 7; i++) {
      const an = Math.random() * Math.PI * 2, d = 20 + Math.random() * 60;
      this.add({ kind: 'puff', x: x + Math.cos(an) * d, y: y + Math.sin(an) * d * 0.8, vx: Math.cos(an) * 140, vy: Math.sin(an) * 110 - 40,
        r: 30 + Math.random() * 22, r1: 56 + Math.random() * 30, life: 0.75 + Math.random() * 0.35, delay: Math.random() * 0.05 });
    }
    for (let i = 0; i < 9 * k; i++) {
      const an = Math.random() * Math.PI * 2, sp = 380 + Math.random() * 520;
      this.add({ kind: 'star', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 260, g: 1300, r: 16 + Math.random() * 18, r1: 14 + Math.random() * 12,
        a: Math.random() * 6, va: (Math.random() - 0.5) * 10, life: 0.9 + Math.random() * 0.5, col: STAR_COLS[i % STAR_COLS.length] });
    }
    for (let i = 0; i < 5; i++) {
      const an = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
      this.add({ kind: 'spark', x: x + Math.cos(an) * d, y: y + Math.sin(an) * d, r: 18 + Math.random() * 16, r1: 18, life: 0.5 + Math.random() * 0.4, col: '#fffbe6', delay: Math.random() * 0.2 });
    }
  }
  /** little twinkles (a hint glow, a landing) */
  twinkle(x: number, y: number, n = 6, spread = 120, col = '#fff7d1') {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'spark', x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 2, vy: -30, r: 14 + Math.random() * 20, r1: 16,
        life: 0.6 + Math.random() * 0.6, col, delay: Math.random() * 0.4, a: Math.random() });
    }
  }
  /** a sparkle trail point (title letters, the flying golden letter) */
  trail(x: number, y: number, col = '#fff6c8') {
    this.add({ kind: Math.random() < 0.6 ? 'spark' : 'dot', x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 60, vy: 20 + Math.random() * 40,
      r: 8 + Math.random() * 14, r1: 4, life: 0.5 + Math.random() * 0.5, col });
  }
  /** the golden letter comes out: Magic Block's burst out of it (user: "나올때 파티클도 다른 파닉스 게임에 쓴거 참고해서") */
  cheer(x: number, y: number) {
    const t = this.t, B = BASE;
    this.glows.push({ x, y, t0: t, life: 0.95, r: B * 0.9 });
    const n = 22;
    for (let i = 0; i < n; i++) {
      this.streaks.push({ x, y, t0: t + rnd(0, 0.05), life: rnd(0.5, 0.8), ang: (i / n) * Math.PI * 2 + rnd(-0.22, 0.22),
        r0: B * 0.14, v: B * rnd(1.6, 2.5), len: B * rnd(0.2, 0.34), w: B * rnd(0.036, 0.052), col: CANDY[i % CANDY.length] });
    }
    for (let i = 0; i < 12; i++) {
      const a = rnd(0, Math.PI * 2), sp = B * rnd(0.6, 1.25);
      this.stars3.push({ x: x + rnd(-0.04, 0.04) * B, y: y + rnd(-0.04, 0.04) * B, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.85 - B * 0.35,
        t0: t + rnd(0, 0.08), life: rnd(0.9, 1.25), size: B * rnd(0.07, 0.11), spin: rnd(4, 9) * (Math.random() < 0.5 ? -1 : 1), rot: rnd(-0.4, 0.4), col: STAR3[i % STAR3.length] });
    }
    for (let i = 0; i < 44; i++) {
      const a = rnd(0, Math.PI * 2), sp = B * rnd(0.5, 1.6);
      this.candies.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - B * 0.45, t0: t, life: rnd(1.1, 1.8), size: B * rnd(0.016, 0.028),
        col: CANDY[Math.floor(Math.random() * CANDY.length)] });
    }
    // cascades fire several in a row
    if (this.streaks.length > 160) this.streaks.splice(0, this.streaks.length - 160);
    if (this.stars3.length > 60) this.stars3.splice(0, this.stars3.length - 60);
    if (this.candies.length > 320) this.candies.splice(0, this.candies.length - 320);
    this.kick();
  }
  rays(x: number, y: number, r = 1300, life = 1.4) { this.rayList.push({ x, y, r, life, age: 0, rot: Math.random() }); this.kick(); }
  confetti(n = 120) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: Math.random() < 0.5 ? 'star' : 'dot', x: Math.random() * DW, y: -60 - Math.random() * 400, vx: (Math.random() - 0.5) * 160, vy: 300 + Math.random() * 300, g: 260,
        r: 14 + Math.random() * 16, r1: 12, a: Math.random() * 6, va: (Math.random() - 0.5) * 6, life: 3 + Math.random(), col: STAR_COLS[i % STAR_COLS.length] });
    }
  }

  // ── DOM effects ─────────────────────────────────────────────────────────────────────────────────────
  private el(cls: string, html = '') { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; this.dom.appendChild(e); return e; }

  /** the big golden letter: rises over the popped animals, then flies into `target` (the mission icon) */
  async goldLetter(letter: string, x: number, y: number, target: Element | null, onArrive?: () => void) {
    const w = this.el('gold-wrap', `<b class="gold">${letter.toUpperCase()}</b>`);
    setTimeout(() => this.cheer(x, y - 40), 110);              // the burst as it comes out (behind it: canvas < DOM)
    const set = (px: number, py: number, s: number, r = 0) => { w.style.transform = `translate(${px}px, ${py}px) scale(${s}) rotate(${r}deg)`; };
    set(x, y, 0.2);
    await w.animate([
      { transform: `translate(${x}px, ${y + 30}px) scale(.2)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 50}px) scale(1.18)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x}px, ${y - 40}px) scale(1)`, opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' }).finished.catch(() => {});
    set(x, y - 40, 1);
    await w.animate([{ transform: `translate(${x}px, ${y - 40}px) scale(1)` }, { transform: `translate(${x}px, ${y - 64}px) scale(1.05)` }, { transform: `translate(${x}px, ${y - 40}px) scale(1)` }],
      { duration: 520, easing: 'ease-in-out' }).finished.catch(() => {});
    if (!target) {
      await w.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(${x}px, ${y - 160}px) scale(.8)` }], { duration: 400, fill: 'forwards' }).finished.catch(() => {});
      w.remove(); return;
    }
    const b = boxIn(this.stage, target);
    const x0 = x, y0 = y - 40, x1 = b.cx, y1 = b.cy, mx = (x0 + x1) / 2 + 120, my = Math.min(y0, y1) - 260;
    const T = 640, t0 = performance.now();
    await new Promise<void>((res) => {
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / T), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const px = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * mx + e * e * x1;
        const py = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * my + e * e * y1;
        set(px, py, 1 - 0.8 * e, e * 20);                       // (420 px → about the mission icon's size)
        this.trail(px, py + 40, '#ffe9a0'); if (Math.random() < 0.5) this.trail(px, py + 20, '#fff');
        if (u < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    w.remove();
    this.twinkle(x1, y1, 8, 60, '#fff3b0');
    onArrive?.();
  }

  /** a small letter bubble rising out of a popped animal */
  badge(letter: string, x: number, y: number, delay = 0, tone = letter) {
    const e = this.el(`badge ${tone}`); e.dataset.l = letter;   // tone = the board slot's colour class (m a s t p)
    e.style.left = `${x}px`; e.style.top = `${y}px`; e.style.opacity = '0';
    e.animate([
      { transform: 'translateY(10px) scale(.3)', opacity: 0 },
      { transform: 'translateY(-50px) scale(1.1)', opacity: 1, offset: 0.25 },
      { transform: 'translateY(-150px) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translateY(-210px) scale(.9)', opacity: 0 },
    ], { duration: 1150, delay, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => e.remove(), () => e.remove());
  }

  /** "Combo N!" over a starburst at (x, y) stage px — the game puts it on the board (user: "콤보로 맞췄을때는 단어
   *  나오는 말풍선 위가 아니라 게임화면에서 콤보라는 표시가 나오는게 나아"); without a spot it sits by the tutor (.combo) */
  combo(n: number, x?: number, y?: number) {
    this.dom.querySelectorAll('.combo').forEach((e) => e.remove());
    const txt = `<span>Combo</span> <em>${n}!</em>`;
    const e = this.el('combo', `<i class="rays"></i><b class="cb cb-back">${txt}</b><b class="cb cb-mid">${txt}</b><b class="cb cb-front">${txt}</b>`);
    if (x != null && y != null) { e.style.left = `${x}px`; e.style.top = `${y}px`; }
    e.animate([
      { transform: 'scale(.2) rotate(-12deg)', opacity: 0 },
      { transform: 'scale(1.15) rotate(3deg)', opacity: 1, offset: 0.18 },
      { transform: 'scale(1) rotate(0)', opacity: 1, offset: 0.3 },
      { transform: 'scale(1.04) rotate(-1deg)', opacity: 1, offset: 0.75 },
      { transform: 'scale(.9) translateY(-40px)', opacity: 0 },
    ], { duration: 1700, easing: 'ease-out', fill: 'forwards' }).finished.then(() => e.remove(), () => e.remove());
    const b = boxIn(this.stage, e);
    for (let i = 0; i < 3; i++) setTimeout(() => this.twinkle(b.x, b.y, 7, 220, i % 2 ? '#ffe680' : '#fff'), i * 260);
  }

  /** "+10" etc. rising from a point */
  text(t: string, x: number, y: number, gold = false) {
    const e = this.el(`float-txt${gold ? ' gold-t' : ''}`, t);
    e.style.left = `${x}px`; e.style.top = `${y}px`;
    e.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%,-170%) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%,-220%) scale(.95)', opacity: 0 },
    ], { duration: 1300, easing: 'ease-out', fill: 'forwards' }).finished.then(() => e.remove(), () => e.remove());
  }

  /** coins jump out of (x, y) and fly into `target` one by one; `onEach` fires as each lands */
  async coins(n: number, x: number, y: number, target: Element, coinSrc: string, onEach: (i: number) => void) {
    const b = boxIn(this.stage, target);
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      jobs.push((async () => {
        await wait(i * 70);
        const img = document.createElement('img'); img.className = 'float-coin'; img.src = coinSrc; img.alt = '';
        this.dom.appendChild(img);
        const an = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, d = 120 + Math.random() * 110;
        const sx = x + Math.cos(an) * d, sy = y + Math.sin(an) * d;
        await img.animate([
          { transform: `translate(${x}px, ${y}px) scale(.3)` },
          { transform: `translate(${sx}px, ${sy}px) scale(1.05)` },
        ], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' }).finished.catch(() => {});
        await wait(120 + Math.random() * 80);
        await img.animate([
          { transform: `translate(${sx}px, ${sy}px) scale(1.05)` },
          { transform: `translate(${(sx + b.cx) / 2}px, ${Math.min(sy, b.cy) - 140}px) scale(.9)`, offset: 0.45 },
          { transform: `translate(${b.cx - 60}px, ${b.cy}px) scale(.62)` },
        ], { duration: 520, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' }).finished.catch(() => {});
        img.remove();
        this.twinkle(b.cx - 60, b.cy, 2, 30, '#fff3b0');
        onEach(i);
      })());
    }
    await Promise.all(jobs);
  }

  clear() {
    this.ps.length = 0; this.rayList.length = 0; this.dom.innerHTML = '';
    this.streaks.length = 0; this.stars3.length = 0; this.candies.length = 0; this.glows.length = 0;
  }
}
