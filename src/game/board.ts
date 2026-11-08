// The board on screen: slots, animal pieces, swipe / tap input and the piece animations.
// Positions are design px inside .field (1348×1098, the mockup's inner board); a cell is FW/W × FH/H.
import { ANIMALS } from '../data/animals';
import { Grid, type Fall } from './grid';

export const BW = 5, BH = 4;
const FW = 1348, FH = 1098;
export const CW = FW / BW, CH = FH / BH;
const PIECE = 270;                     // the art's own scale: the mockup's animals in its 246 px slots
const SLOT_W = 246, SLOT_H = 250;
/** field origin in stage px (board 642,161 + field 58,58 — style.css .board) */
export const FIELD_X = 700, FIELD_Y = 219;

const base = new URL('./', location.href).href;
export const animalSrc = (k: number) => `${base}${ANIMALS[k].img}`;

export class Board {
  els: (HTMLElement | null)[] = [];
  locked = true;
  onSwap: (a: number, b: number) => void = () => {};
  onTouch: () => void = () => {};
  private slots: HTMLElement[] = [];
  private sel = -1;
  constructor(public root: HTMLElement, public grid: Grid) {
    const slots = root.querySelector('.slots')!;
    for (let i = 0; i < BW * BH; i++) {
      const s = document.createElement('i'); s.className = 'slot';
      const { x, y } = this.center(i);
      s.style.left = `${x - SLOT_W / 2}px`; s.style.top = `${y - SLOT_H / 2}px`;
      slots.appendChild(s); this.slots.push(s);
    }
    this.input();
  }
  get pieces() { return this.root.querySelector('.pieces') as HTMLElement; }
  center(i: number) { const x = i % BW, y = Math.floor(i / BW); return { x: CW * (x + 0.5), y: CH * (y + 0.5) }; }
  /** a cell's centre in stage px */
  stageXY(i: number) { const c = this.center(i); return { x: FIELD_X + c.x, y: FIELD_Y + c.y }; }
  private tf(x: number, y: number, s = 1) { return `translate(${x - PIECE / 2}px, ${y - PIECE / 2}px) scale(${s})`; }
  private make(k: number) {
    const d = document.createElement('div'); d.className = 'pc';
    const img = document.createElement('img'); img.src = animalSrc(k); img.alt = ANIMALS[k].word; img.draggable = false;
    d.appendChild(img); d.dataset.k = String(k);
    this.pieces.appendChild(d);
    return d;
  }
  place(i: number, el: HTMLElement) { const c = this.center(i); el.style.transform = this.tf(c.x, c.y); }

  /** draw the whole grid; `drop` = animals fall in row by row (level start) */
  async build(drop = false) {
    this.pieces.innerHTML = ''; this.els = []; this.sel = -1;
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < BW * BH; i++) {
      const el = this.make(this.grid.c[i]);
      this.els[i] = el; this.place(i, el);
      if (drop) {
        const c = this.center(i), y = Math.floor(i / BW);
        const from = this.tf(c.x, c.y - FH * 0.75 - (BH - y) * 40);
        jobs.push(el.animate([{ transform: from, opacity: 0 }, { transform: this.tf(c.x, c.y), opacity: 1, offset: 0.8 }, { transform: this.tf(c.x, c.y, 1) }],
          { duration: 520, delay: (BH - 1 - y) * 90 + (i % BW) * 35, easing: 'cubic-bezier(.4,0,.6,1.35)', fill: 'backwards' }).finished.catch(() => {}));
      }
    }
    await Promise.all(jobs);
  }

  // ── input: swipe a piece toward a neighbour, or tap two neighbours ───────────────────────────────────
  private cellAt(e: PointerEvent) {
    const f = this.root.querySelector('.field')!.getBoundingClientRect();
    const fx = ((e.clientX - f.left) / f.width) * FW, fy = ((e.clientY - f.top) / f.height) * FH;
    if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return -1;
    return Math.floor(fy / CH) * BW + Math.floor(fx / CW);
  }
  private input() {
    const field = this.root.querySelector('.field') as HTMLElement;
    let start: { i: number; x: number; y: number; id: number } | null = null;
    field.addEventListener('pointerdown', (e) => {
      this.onTouch();
      if (this.locked) return;
      const i = this.cellAt(e);
      if (i < 0) return;
      start = { i, x: e.clientX, y: e.clientY, id: e.pointerId };
      try { field.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    field.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id || this.locked) return;
      const f = field.getBoundingClientRect(), k = FW / f.width;
      const dx = (e.clientX - start.x) * k, dy = (e.clientY - start.y) * k;
      if (Math.hypot(dx, dy) < CW * 0.26) return;
      const { i } = start; start = null;
      const x = i % BW, y = Math.floor(i / BW);
      let j = -1;
      if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && x < BW - 1) j = i + 1; else if (dx < 0 && x > 0) j = i - 1; }
      else if (dy > 0 && y < BH - 1) j = i + BW; else if (dy < 0 && y > 0) j = i - BW;
      this.select(-1);
      if (j >= 0) this.onSwap(i, j);
    });
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const { i } = start; start = null;
      if (this.locked) return;
      if (this.sel >= 0 && this.sel !== i && this.grid.adjacent(this.sel, i)) { const a = this.sel; this.select(-1); this.onSwap(a, i); return; }
      this.select(this.sel === i ? -1 : i);
    };
    field.addEventListener('pointerup', up);
    field.addEventListener('pointercancel', () => { start = null; });
  }
  select(i: number) {
    if (this.sel >= 0) this.els[this.sel]?.classList.remove('sel');
    this.sel = i;
    if (i >= 0) this.els[i]?.classList.add('sel');
  }

  // ── animations ──────────────────────────────────────────────────────────────────────────────────────
  async swap(a: number, b: number, back: boolean) {
    const ea = this.els[a]!, eb = this.els[b]!, ca = this.center(a), cb = this.center(b);
    const T = 210, ease = 'cubic-bezier(.45,.05,.4,1)';
    if (back) {
      const mid = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x + (q.x - p.x) * 0.62, y: p.y + (q.y - p.y) * 0.62 });
      const ma = mid(ca, cb), mb = mid(cb, ca);
      await Promise.all([
        ea.animate([{ transform: this.tf(ca.x, ca.y) }, { transform: this.tf(ma.x, ma.y, 1.04) }, { transform: this.tf(ca.x, ca.y) }], { duration: 380, easing: ease }).finished,
        eb.animate([{ transform: this.tf(cb.x, cb.y) }, { transform: this.tf(mb.x, mb.y, 0.96) }, { transform: this.tf(cb.x, cb.y) }], { duration: 380, easing: ease }).finished,
      ]).catch(() => {});
      return;
    }
    ea.style.transform = this.tf(cb.x, cb.y); eb.style.transform = this.tf(ca.x, ca.y);
    ea.style.zIndex = '2';
    await Promise.all([
      ea.animate([{ transform: this.tf(ca.x, ca.y) }, { transform: this.tf((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, 1.1), offset: 0.5 }, { transform: this.tf(cb.x, cb.y) }], { duration: T, easing: ease }).finished,
      eb.animate([{ transform: this.tf(cb.x, cb.y) }, { transform: this.tf((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, 0.9), offset: 0.5 }, { transform: this.tf(ca.x, ca.y) }], { duration: T, easing: ease }).finished,
    ]).catch(() => {});
    ea.style.zIndex = '';
    this.els[a] = eb; this.els[b] = ea;
  }

  /** matched pieces swell, flash and vanish */
  async pop(cells: number[]) {
    await Promise.all(cells.map((i, n) => {
      const el = this.els[i]; this.els[i] = null;
      if (!el) return Promise.resolve();
      const c = this.center(i);
      return el.animate([
        { transform: this.tf(c.x, c.y), filter: 'brightness(1)' },
        { transform: this.tf(c.x, c.y, 1.2), filter: 'brightness(1.35)', offset: 0.45 },
        { transform: this.tf(c.x, c.y, 0.2), filter: 'brightness(2)', opacity: 0 },
      ], { duration: 300, delay: n * 18, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'forwards' }).finished.catch(() => {}).then(() => el.remove());
    }));
  }

  /** gravity: moved pieces slide down, new ones drop in from above the board */
  async fall(falls: Fall[], onLand?: () => void) {
    const moved = new Map<number, HTMLElement>();
    for (const f of falls) if (f.from >= 0) { const src = f.from * BW + f.x; moved.set(f.id, this.els[src]!); this.els[src] = null; }
    const jobs: Promise<unknown>[] = [];
    let landed = 0;
    for (const f of falls) {
      const el = f.from >= 0 ? moved.get(f.id)! : this.make(this.grid.c[f.id]);
      this.els[f.id] = el;
      const c = this.center(f.id), y0 = CH * (f.from + 0.5);
      const dist = f.to - f.from;
      const dur = 170 + 70 * Math.sqrt(dist) * 1.6;
      const delay = f.from < 0 ? (-1 - f.from) * 45 + 40 : 0;
      el.style.transform = this.tf(c.x, c.y);
      jobs.push(el.animate([
        { transform: this.tf(c.x, y0), opacity: f.from < 0 ? 0 : 1 },
        { transform: this.tf(c.x, y0 + (c.y - y0) * 0.3), opacity: 1, offset: 0.3 },
        { transform: this.tf(c.x, c.y + 6, 1.03), offset: 0.82 },
        { transform: this.tf(c.x, c.y) },
      ], { duration: dur, delay, easing: 'cubic-bezier(.55,0,.9,.6)', fill: 'backwards' }).finished.then(() => { if (landed++ % 3 === 0) onLand?.(); }, () => {}));
    }
    await Promise.all(jobs);
  }

  /** the whole board swirls and lands in its new order (the grid is already shuffled) */
  async shuffle() {
    const old = this.els.slice();
    await Promise.all(old.map((el, i) => {
      if (!el) return Promise.resolve();
      const c = this.center(i);
      return el.animate([{ transform: this.tf(c.x, c.y) }, { transform: this.tf(FW / 2, FH / 2, 0.4), opacity: 0.6 }], { duration: 320, delay: i * 8, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    }));
    await this.build(false);
    await Promise.all(this.els.map((el, i) => {
      const c = this.center(i);
      return el!.animate([{ transform: this.tf(FW / 2, FH / 2, 0.4), opacity: 0.6 }, { transform: this.tf(c.x, c.y, 1.08), offset: 0.8 }, { transform: this.tf(c.x, c.y) }], { duration: 420, delay: i * 10, easing: 'cubic-bezier(.2,.8,.3,1.2)' }).finished.catch(() => {});
    }));
  }

  /** a hop for the hint: the three pieces of a ready match glow */
  glow(cells: number[]) { this.slots.forEach((s, i) => s.classList.toggle('glow', cells.includes(i))); }

  /** the hint guide: the piece slides toward its neighbour and back, looping, while a finger drags it */
  private drag: { el: HTMLElement; i: number; anim: Animation } | null = null;
  hintDrag(a: number, b: number) {
    this.stopHintDrag();
    const el = this.els[a];
    if (!el) return;
    const ca = this.center(a), cb = this.center(b);
    const mx = ca.x + (cb.x - ca.x) * 0.62, my = ca.y + (cb.y - ca.y) * 0.62;
    el.style.zIndex = '3';
    const anim = el.animate([
      { transform: this.tf(ca.x, ca.y), offset: 0 },
      { transform: this.tf(ca.x, ca.y, 1.05), offset: 0.16 },
      { transform: this.tf(ca.x, ca.y, 0.98), offset: 0.28 },
      { transform: this.tf(mx, my, 1.04), offset: 0.62 },
      { transform: this.tf(ca.x, ca.y), offset: 0.88 },
      { transform: this.tf(ca.x, ca.y), offset: 1 },
    ], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' });
    this.drag = { el, i: a, anim };
  }
  stopHintDrag() {
    const h = this.drag;
    if (!h) return;
    h.anim.cancel();
    if (this.els[h.i] === h.el) { h.el.style.zIndex = ''; this.place(h.i, h.el); }
    this.drag = null;
  }
  wiggle(i: number) {
    const el = this.els[i]; if (!el) return;
    const c = this.center(i);
    el.animate([{ transform: this.tf(c.x, c.y) }, { transform: this.tf(c.x, c.y - 26, 1.06) }, { transform: this.tf(c.x, c.y) }, { transform: this.tf(c.x, c.y - 12, 1.03) }, { transform: this.tf(c.x, c.y) }],
      { duration: 700, easing: 'ease-in-out' });
  }
}
