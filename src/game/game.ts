// One level of Phonics Match: swaps, cascades, the mission, and the tutor's phonics moment after every pop
// (sound, sound, word → "따라 해 봐!" → the microphone listens → bonus coins when the child says it).
import { ALTS, ANIMALS, animalTurn, levelOf, rivalsOf, splitWord, theme, useLevelAnimals, type Level } from '../data/animals';
/** level 1 of any theme cleared once: no first-time teaching any more */
const played1 = () => Object.keys(save.best).some((k) => k === '1' || k.endsWith(':1'));
import { sfx } from '../core/audio';
import { Listener, type Heard } from '../core/listen';
import { say, stopSpeech, onLineTimes, wait } from '../core/speech';
import { addCoins, commit, save } from '../core/store';
import { Board, BW, BH, CW, CH, FIELD_X, FIELD_Y, animalSrc } from './board';
import { Grid, seeded } from './grid';
import type { Fx } from '../ui/fx';
import type { Hud, Goal } from '../ui/hud';
import type { Tutor } from '../ui/tutor';
import { finger, TIP_X, TIP_Y } from '../ui/hand';
import { boxIn } from '../ui/stage';

const BONUS = 10;                       // coins for saying it
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export interface GameHooks {
  result(win: boolean, stars: number, coins: number): void;
  log?(s: string): void;
}

export class Game {
  grid: Grid;
  board: Board;
  n = 1;
  lv!: Level;
  moves = 0;
  goals: Goal[] = [];
  state: 'off' | 'intro' | 'play' | 'busy' | 'listen' | 'over' | 'paused' = 'off';
  private seq = 0;
  private hintT = 0;
  private hints = 0;
  private listenAbort = false;
  private listener = new Listener();
  private earned = 0;
  private moveSeq = 0;
  private taught = false;
  private card = $('#sayCard');
  rnd: () => number = Math.random;

  constructor(private hud: Hud, private fx: Fx, private tutor: Tutor, private hooks: GameHooks, seed?: number) {
    if (seed != null) { this.rnd = seeded(seed); animalTurn(seed); }
    this.grid = new Grid(BW, BH, ANIMALS.length, () => this.rnd());
    this.board = new Board($('#board'), this.grid);
    this.board.onSwap = (a, b) => { void this.swap(a, b); };
    this.board.onTouch = () => { this.poke(); };
    this.card.querySelector('.sc-skip')?.addEventListener('click', (e) => { e.stopPropagation(); this.skipSay(); });
    // the say card's letter jumps on each letter sound
    onLineTimes((times, now) => {
      for (const t of times) if (t.key.startsWith('s:')) setTimeout(() => this.beat(), Math.max(0, (t.at - now) * 1000 + 60));
    });
  }
  private alive(s: number) { return s === this.seq; }
  private favour() { return this.goals.filter((g) => g.got < g.need).map((g) => g.k); }

  // ── level start ──────────────────────────────────────────────────────────────────────────────────────
  async start(n: number) {
    this.stopAll();                 // (bumps seq itself: take this level's number after it)
    const s = ++this.seq;
    useLevelAnimals(n);             // this level's animal per letter (a slot with several takes them in turn)
    this.n = n; this.lv = levelOf(n); this.moves = this.lv.moves; this.earned = 0; this.hints = 0;
    this.goals = this.lv.goals.map(([k, need]) => ({ k, need, got: 0 }));
    this.hud.level(n); this.hud.moves(this.moves); this.hud.goals(this.goals); this.hud.progress(0);
    this.grid.fill(this.favour(), this.lv.bias);
    this.state = 'intro';
    this.board.locked = true;
    await this.board.build(true);
    if (!this.alive(s)) return;
    // the mission card
    const card = $('#intro');
    card.querySelector('.in-lv')!.textContent = String(n);
    this.hud.goals(this.goals, card.querySelector('.in-goals') as HTMLElement);
    card.hidden = false; card.classList.remove('out');
    this.tutor.act('nod');
    await say(['t:mission']);
    await wait(900);
    if (!this.alive(s)) return;
    card.classList.add('out');
    await wait(260);
    card.hidden = true;
    if (!this.alive(s)) return;
    const first = n === 1 && !played1();
    this.state = 'play'; this.board.locked = false;
    if (first) {
      this.tutor.act('bounce');
      this.showHint(true);
      await say(['t:howto1']);
    } else {
      this.tutor.act('hop');
      await say(['t:go']);
    }
    if (this.alive(s)) this.armHint();
  }

  // ── a swap ───────────────────────────────────────────────────────────────────────────────────────────
  async swap(a: number, b: number) {
    if (this.state !== 'play' && this.state !== 'listen') return;
    if (this.state === 'listen') { this.listenAbort = true; this.hideCard(); }
    const s = this.seq;
    this.clearHint();
    if (!this.grid.works(a, b)) {
      this.board.locked = true;
      sfx('bad');
      await this.board.swap(a, b, true);
      if (this.alive(s)) { this.board.locked = false; this.armHint(); }
      return;
    }
    this.state = 'busy'; this.board.locked = true;
    const mv = ++this.moveSeq;
    stopSpeech();
    sfx('swap');
    this.grid.swap(a, b);
    await this.board.swap(a, b, false);
    if (!this.alive(s)) return;
    this.moves--; this.hud.moves(this.moves);
    let reading: Promise<boolean> | null = null;
    let focus = -1;
    await this.cascade(s, (k, wave) => {
      if (focus < 0) { focus = k; reading = this.read(k, wave); }
    });
    if (!this.alive(s)) return;
    if (reading) await reading;
    if (!this.alive(s)) return;
    const won = this.goals.every((g) => g.got >= g.need);
    const lost = !won && this.moves <= 0;
    if (!won && !lost && !this.grid.moves().length) {
      say(['t:shuffle']); sfx('shuffle');
      this.grid.shuffle();
      await this.board.shuffle();
      if (!this.alive(s)) return;
    }
    // the child's turn to say it (also after the last move — then the result)
    if (focus >= 0) {
      this.state = won || lost ? 'over' : 'listen';   // the board stays locked: say it or skip (a touch used to end the turn)
      await this.sayItTurn(focus, s);
      // a newer move (the child swapped while the microphone listened) owns the board now
      if (!this.alive(s) || mv !== this.moveSeq) return;
    }
    if (won || lost) { await this.finish(won, s); return; }
    if (this.moves === 3) void say(['t:moves3']);
    this.state = 'play'; this.board.locked = false;
    this.armHint();
  }

  /** pop every line, drop new animals in, repeat while lines keep forming */
  private async cascade(s: number, onFirst: (k: number, wave: number) => void) {
    let wave = 0;
    for (;;) {
      const groups = this.grid.groups();
      if (!groups.length) break;
      wave++;
      // the main group of the first wave is the one the tutor reads
      const main = groups.slice().sort((x, y) => y.cells.length - x.cells.length)[0];
      onFirst(main.kind, wave);
      sfx('pop', wave - 1);
      if (wave >= 2) {
        this.fx.combo(wave, FIELD_X + (CW * BW) / 2, FIELD_Y + (CH * BH) / 2); sfx('combo', wave);   // on the board
        this.tutor.act('cheer');
      }
      const all: number[] = [];
      for (const g of groups) {
        const a = ANIMALS[g.kind];
        let sx = 0, sy = 0;
        g.cells.forEach((i, n) => {
          const p = this.board.stageXY(i);
          sx += p.x; sy += p.y;
          this.fx.pop(p.x, p.y);
          this.fx.badge(a.letter, p.x, p.y - 30, n * 60, a.tone);
          all.push(i);
        });
        const cx = sx / g.cells.length, cy = sy / g.cells.length;
        // the burst sits on the matched animals. It used to fire only on a combo, from the
        // left-hand cell of the middle row, so the light missed the match and often never showed.
        this.fx.rays(cx, cy, 480 + g.cells.length * 90);
        const goal = this.goals.find((q) => q.k === g.kind && q.got < q.need);
        if (goal) {
          const add = Math.min(goal.need - goal.got, g.cells.length);
          goal.got += add;
          const target = this.hud.goalEl(g.kind);
          void this.fx.goldLetter(a.letter, cx, cy - 20, target, () => {
            if (!this.alive(s)) return;
            sfx('star', 1); this.hud.hitGoal(goal); this.hud.progress(this.progress());
          });
        } else {
          void this.fx.goldLetter(a.letter, cx, cy - 20, null);
        }
      }
      await this.board.pop(all);
      if (!this.alive(s)) return;
      this.grid.clear(all);
      const falls = this.grid.collapse(this.favour(), this.lv.bias);
      await wait(90);
      await this.board.fall(falls, () => sfx('land'));
      if (!this.alive(s)) return;
    }
  }
  private progress() {
    const need = this.goals.reduce((a, g) => a + g.need, 0), got = this.goals.reduce((a, g) => a + Math.min(g.need, g.got), 0);
    return need ? got / need : 0;
  }

  // ── the phonics moment ───────────────────────────────────────────────────────────────────────────────
  private showCard(k: number) {
    const a = ANIMALS[k], c = this.card;
    (c.querySelector('.sc-face img') as HTMLImageElement).src = animalSrc(k);
    // the letter is coloured and beats; it is the first letter except fox's final x
    const [pre, l, rest] = splitWord(a);
    let p = c.querySelector('.sc-pre');
    if (!p) { p = document.createElement('span'); p.className = 'sc-pre'; c.querySelector('.sc-l')!.before(p); }
    p.textContent = pre;
    c.querySelector('.sc-l')!.textContent = l;
    c.querySelector('.sc-rest')!.textContent = rest;
    (c.querySelector('.sc-l') as HTMLElement).style.setProperty('--lc', a.color);
    c.classList.remove('listen', 'think', 'ok', 'out');
    c.hidden = false;
  }
  private hideCard() {
    const c = this.card;
    if (c.hidden || c.classList.contains('out')) return;
    c.classList.remove('listen', 'think');            // the mic (on the board, a child of the card) fades, not swoops
    c.classList.add('out');
    setTimeout(() => { if (c.classList.contains('out')) { c.hidden = true; c.classList.remove('out'); } }, 300);
  }
  private beat() { const l = this.card.querySelector('.sc-l') as HTMLElement; l.classList.remove('beat'); void l.offsetWidth; l.classList.add('beat'); }

  /** the tutor reads the popped animal: "와우! /p/ /p/ pig!" */
  private async read(k: number, wave: number) {
    const a = ANIMALS[k];
    this.showCard(k);
    this.tutor.act('bounce');
    const react = wave >= 2 ? 't:amazing' : pick(['t:wow', 't:nice', 't:wow']);
    return say([react, 0.25, `s:${a.letter}`, 0.32, `s:${a.letter}`, 0.4, `w:${a.word}`]);
  }

  /** "따라 해 봐!" → listen → bonus coins. The child says it or taps the card's skip button (user: "단어 말 안해도 그냥 넘어갈때가 있는지 확인해 그리고 말하기 버튼 스킵할수 있게 하는게 나은지도 확인해" → "수정해"):
   *  silence no longer closes the card after 5 s — the tutor reads it again and waits once more (~20 s in all), and the
   *  board stays locked meanwhile (a touch used to end the turn); two wrong tries end it kindly ("Good try!"); no
   *  microphone ends it at once. No coins without the word. */
  private async sayItTurn(k: number, s: number) {
    const a = ANIMALS[k];
    if (this.card.hidden) this.showCard(k);
    this.listenAbort = false;
    this.card.classList.add('can-skip');
    const teach = this.n === 1 && !played1() && !this.taught;
    this.taught = true;
    let misses = 0, quiet = 0;
    for (let round = 0; round < 6; round++) {
      await this.sayTurn([round === 0 && teach ? 't:howto2' : 't:sayit']);
      if (!this.alive(s) || this.listenAbort) break;
      this.card.classList.add('listen');
      const ring = this.card.querySelector('.sc-mic .ring') as HTMLElement;
      let asked = false;
      const r: Heard = await this.listener.hear(a.word, {
        alts: ALTS[a.word] ?? [], rivals: rivalsOf(a.word),
        waitMs: quiet ? 9000 : 6000,
        aborted: () => this.listenAbort || !this.alive(s),
        onState: (st) => { this.card.classList.toggle('think', st === 'thinking'); if (st === 'voice') this.tutor.eyes('', 0); },
        onLevel: (v) => ring.style.setProperty('--lv', (1 + v * 0.5).toFixed(3)),
        onAsk: () => { if (!asked) { asked = true; void say(['t:micask']); } },
      });
      this.card.classList.remove('listen', 'think');
      this.hooks.log?.(`heard ${a.word}: ${r} ${this.listener.lastHeard ?? ''}`);
      if (!this.alive(s) || r === 'aborted' || r === 'nomic') break;
      if (r === 'ok') { this.card.classList.remove('can-skip'); await this.bonus(s); break; }
      if (r === 'miss') {
        this.tutor.act('nod');
        if (++misses >= 2) { await this.sayTurn(['t:goodtry']); break; }
        await this.sayTurn(['t:almost', 0.25, `s:${a.letter}`, 0.3, `s:${a.letter}`, 0.4, `w:${a.word}`]);
      } else {
        // silence: the tutor reads it again and waits once more; quiet again → on, without coins
        if (++quiet >= 2) break;
        this.tutor.act('bounce');
        await this.sayTurn([`s:${a.letter}`, 0.3, `s:${a.letter}`, 0.4, `w:${a.word}`]);
      }
      if (!this.alive(s) || this.listenAbort) break;
    }
    this.card.classList.remove('can-skip');
    this.listener.close();
    if (this.alive(s)) this.hideCard();
  }

  /** a tutor line inside the say turn — the skip button cuts it short (say() itself waits out the line's length) */
  private sayTurn(parts: Parameters<typeof say>[0]) {
    if (this.listenAbort) return Promise.resolve(false);
    return Promise.race([say(parts), new Promise<boolean>((r) => { this.skipped = () => r(false); })]);
  }
  private skipped: (() => void) | null = null;
  /** the say card's skip button: no coins, the board is back at once */
  skipSay() {
    if (this.card.hidden || !this.card.classList.contains('can-skip')) return;
    sfx('tap'); this.listenAbort = true; stopSpeech();
    this.skipped?.(); this.skipped = null;
  }

  private async bonus(s: number) {
    const c = this.card;
    c.classList.add('ok');
    sfx('success');
    this.tutor.act('cheer');
    const b = boxIn(this.fx.stage, c);
    this.fx.text(`+${BONUS}`, b.cx, b.y + 20, true);
    void say([pick(['t:great1', 't:great2', 't:great3', 't:great4']), 0.15, 't:bonus']);
    this.earned += BONUS;
    await this.fx.coins(BONUS, b.cx, b.cy, this.hud.coinTarget(), coinSrc(), () => { addCoins(1); this.hud.coins(save.coins, true); sfx('coin'); });
    if (!this.alive(s)) return;
    await wait(500);
  }

  // ── end of level ─────────────────────────────────────────────────────────────────────────────────────
  private async finish(win: boolean, s: number) {
    this.state = 'over'; this.board.locked = true; this.clearHint();
    await wait(400);
    if (!this.alive(s)) return;
    if (win) {
      const left = this.moves / this.lv.moves;
      const stars = left >= 0.34 ? 3 : left >= 0.12 ? 2 : 1;
      const reward = 15 + stars * 5;
      const key = theme === 'animals' ? String(this.n) : `${theme}:${this.n}`;     // each theme keeps its own progress
      save.best[key] = Math.max(save.best[key] ?? 0, stars);
      if (theme === 'animals') save.level = Math.max(save.level, this.n + 1);
      else save.levels = { ...save.levels, [theme]: Math.max(save.levels?.[theme] ?? 1, this.n + 1) };
      commit();
      this.fx.confetti(140);
      this.tutor.act('cheer');
      sfx('success');
      void say(['t:clear']);
      this.hooks.result(true, stars, reward);
    } else {
      this.tutor.act('shy');
      sfx('wrong');
      void say(['t:fail']);
      this.hooks.result(false, 0, 0);
    }
  }

  // ── hints: after a while with no move, the match glows and a finger drags one animal toward it ──────────
  private bestMove(): { a: number; b: number; cells: number[] } | null {
    const ms = this.grid.moves();
    if (!ms.length) return null;
    let best: { a: number; b: number; cells: number[] } | null = null;
    for (const [a, b] of ms) {
      const g = this.grid.clone(); g.swap(a, b);
      const grp = g.groups().filter((q) => q.cells.includes(a) || q.cells.includes(b));
      const cells = grp.flatMap((q) => q.cells);
      // a mission animal first, then the bigger line
      const score = cells.length + (grp.some((q) => this.favour().includes(q.kind)) ? 3 : 0);
      if (!best || score > best.cells.length + 0.5 || this.rnd() < 0.15) best = { a, b, cells };
    }
    return best;
  }
  private showHint(say1 = false) {
    const m = this.bestMove();
    if (!m) return;
    this.board.glow(m.cells.map((c) => (c === m.a ? m.b : c === m.b ? m.a : c)));
    this.board.hintDrag(m.a, m.b);
    this.hand(m.a, m.b);
    if (say1) return;
    if (this.hints++ < 2) { void say(['t:hint']); this.tutor.act('nod'); }
  }
  private hand(a: number, b: number) {
    document.querySelectorAll('.hand').forEach((e) => e.remove());
    const h = finger('hand');
    this.fx.dom.appendChild(h);
    const p = this.board.stageXY(a), q = this.board.stageXY(b);
    const mx = p.x + (q.x - p.x) * 0.62, my = p.y + (q.y - p.y) * 0.62;
    // the white glove's fingertip rests just below the piece's centre
    const at = (x: number, y: number, s = 1) => `translate(${x - TIP_X}px, ${y + 34 - TIP_Y}px) scale(${s})`;
    h.animate([
      { transform: at(p.x, p.y, 1.08), opacity: 0, offset: 0 },
      { transform: at(p.x, p.y), opacity: 1, offset: 0.16 },
      { transform: at(p.x, p.y, 0.9), offset: 0.28 },
      { transform: at(mx, my, 0.9), offset: 0.62 },
      { transform: at(p.x, p.y), opacity: 1, offset: 0.88 },
      { transform: at(p.x, p.y, 1.08), opacity: 0, offset: 1 },
    ], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' });
  }
  private armHint(ms = 8000) { this.clearHint(); this.hintT = window.setTimeout(() => { if (this.state === 'play') this.showHint(); }, ms); }
  private clearHint() { clearTimeout(this.hintT); this.board.glow([]); this.board.stopHintDrag(); document.querySelectorAll('.hand').forEach((e) => e.remove()); }
  /** any touch on the board: the hint goes away, the clock restarts */
  poke() { if (this.state === 'play') { this.clearHint(); this.armHint(); } }

  // ── pause / leave ────────────────────────────────────────────────────────────────────────────────────
  private paused: Game['state'] = 'off';
  pause() { if (this.state === 'off' || this.state === 'paused') return; this.paused = this.state; this.state = 'paused'; this.board.locked = true; this.clearHint(); this.listenAbort = true; stopSpeech(); this.hideCard(); }
  resume() { if (this.state !== 'paused') return; this.state = this.paused === 'listen' || this.paused === 'busy' ? 'play' : this.paused; if (this.state === 'play') { this.board.locked = false; this.armHint(); } }
  stopAll() { this.seq++; this.clearHint(); this.listenAbort = true; this.listener.close(); stopSpeech(); this.card.hidden = true; this.fx.clear(); this.state = 'off'; this.board.locked = true; }
  get coinsThisLevel() { return this.earned; }
  get fieldOrigin() { return { x: FIELD_X, y: FIELD_Y }; }
}

export const coinSrc = () => `${new URL('./', location.href).href}art/coin.webp`;
