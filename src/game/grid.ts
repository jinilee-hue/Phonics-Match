// Match-3 rules on a W×H grid of animal ids (0..4, -1 = empty). Pure logic: no DOM, no timing.
// A "group" is every cell of one animal that a run of 3+ in a row or column reaches; touching runs of the same animal
// (L / T / + shapes) merge into one group.

export type Pos = { x: number; y: number };
export interface Group { kind: number; cells: number[]; len: number /* longest straight run */ }
export interface Fall { id: number; from: number /* y (negative = spawned above) */; to: number; x: number }

export class Grid {
  c: Int8Array;
  constructor(public w: number, public h: number, public kinds: number, private rnd: () => number = Math.random) {
    this.c = new Int8Array(w * h).fill(-1);
  }
  idx(x: number, y: number) { return y * this.w + x; }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -2 : this.c[y * this.w + x]; }
  set(x: number, y: number, v: number) { this.c[y * this.w + x] = v; }
  pos(i: number): Pos { return { x: i % this.w, y: Math.floor(i / this.w) }; }
  clone() { const g = new Grid(this.w, this.h, this.kinds, this.rnd); g.c.set(this.c); return g; }

  /** a random animal, a little more often one of `favour` (the mission's animals) */
  pick(favour: number[] = [], bias = 0) {
    if (favour.length && this.rnd() < bias) return favour[Math.floor(this.rnd() * favour.length)];
    return Math.floor(this.rnd() * this.kinds);
  }

  /** a full board with no ready-made line and at least `minMoves` possible swaps */
  fill(favour: number[] = [], bias = 0, minMoves = 3) {
    for (let tries = 0; tries < 200; tries++) {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        let v = 0, guard = 0;
        do { v = this.pick(favour, bias); guard++; }
        while (guard < 30 && ((x >= 2 && this.get(x - 1, y) === v && this.get(x - 2, y) === v) || (y >= 2 && this.get(x, y - 1) === v && this.get(x, y - 2) === v)));
        this.set(x, y, v);
      }
      if (!this.groups().length && this.moves().length >= minMoves) return;
    }
  }

  /** every line of 3+ on the board, merged into groups */
  groups(): Group[] {
    const { w, h } = this;
    const mark = new Int32Array(w * h).fill(-1);     // run id per cell
    const runs: { kind: number; cells: number[] }[] = [];
    const scan = (horiz: boolean) => {
      const A = horiz ? h : w, B = horiz ? w : h;
      for (let a = 0; a < A; a++) {
        let b = 0;
        while (b < B) {
          const at = (k: number) => (horiz ? this.get(k, a) : this.get(a, k));
          const v = at(b);
          let e = b + 1;
          while (e < B && at(e) === v) e++;
          if (v >= 0 && e - b >= 3) {
            const cells: number[] = [];
            for (let k = b; k < e; k++) cells.push(horiz ? this.idx(k, a) : this.idx(a, k));
            runs.push({ kind: v, cells });
          }
          b = e;
        }
      }
    };
    scan(true); scan(false);
    // union runs that share a cell
    const parent = runs.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    runs.forEach((r, i) => r.cells.forEach((c) => { if (mark[c] >= 0) parent[find(i)] = find(mark[c]); else mark[c] = i; }));
    const by = new Map<number, Group>();
    runs.forEach((r, i) => {
      const root = find(i);
      let g = by.get(root);
      if (!g) { g = { kind: r.kind, cells: [], len: 0 }; by.set(root, g); }
      for (const c of r.cells) if (!g.cells.includes(c)) g.cells.push(c);
      g.len = Math.max(g.len, r.cells.length);
    });
    return [...by.values()];
  }

  swap(a: number, b: number) { const t = this.c[a]; this.c[a] = this.c[b]; this.c[b] = t; }
  adjacent(a: number, b: number) {
    const p = this.pos(a), q = this.pos(b);
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
  }
  /** does swapping a and b make a line? */
  works(a: number, b: number) {
    if (this.c[a] === this.c[b]) return false;
    this.swap(a, b);
    const ok = this.lineAt(a) || this.lineAt(b);
    this.swap(a, b);
    return ok;
  }
  private lineAt(i: number) {
    const { x, y } = this.pos(i), v = this.c[i];
    if (v < 0) return false;
    let l = 0, r = 0, u = 0, d = 0;
    while (this.get(x - l - 1, y) === v) l++;
    while (this.get(x + r + 1, y) === v) r++;
    while (this.get(x, y - u - 1) === v) u++;
    while (this.get(x, y + d + 1) === v) d++;
    return l + r + 1 >= 3 || u + d + 1 >= 3;
  }
  /** every swap that makes a line */
  moves(): [number, number][] {
    const out: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y);
      if (x + 1 < this.w && this.works(i, i + 1)) out.push([i, i + 1]);
      if (y + 1 < this.h && this.works(i, i + this.w)) out.push([i, i + this.w]);
    }
    return out;
  }

  /** remove these cells (set empty) */
  clear(cells: number[]) { for (const c of cells) this.c[c] = -1; }

  /** gravity + refill. Returns where every moved / new animal goes: `id` is the index it ends at. */
  collapse(favour: number[] = [], bias = 0): Fall[] {
    const falls: Fall[] = [];
    for (let x = 0; x < this.w; x++) {
      let write = this.h - 1;
      for (let y = this.h - 1; y >= 0; y--) {
        const v = this.get(x, y);
        if (v < 0) continue;
        if (write !== y) { this.set(x, write, v); this.set(x, y, -1); falls.push({ id: this.idx(x, write), from: y, to: write, x }); }
        write--;
      }
      // new animals drop in from above, the lowest first
      let k = 0;
      for (let y = write; y >= 0; y--) {
        this.set(x, y, this.pick(favour, bias));
        falls.push({ id: this.idx(x, y), from: -1 - k, to: y, x });
        k++;
      }
    }
    return falls;
  }

  /** a new arrangement of the same animals with no ready-made line and a possible swap */
  shuffle() {
    const vals = Array.from(this.c);
    for (let t = 0; t < 300; t++) {
      for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
      this.c.set(vals);
      if (!this.groups().length && this.moves().length) return;
    }
    this.fill();
  }
}

/** a small seeded PRNG (mulberry32) so tests can replay a board */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
