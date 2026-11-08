// The title's how-to-play demo (user: "인트로 구성할때 실제 게임하는 내용도 좀 보여주며 설명하는게 어때?", then "왼쪽에 작게
// 넣지말고 로고랑 play 버튼 밑에서 나오는게 나을거 같은데"): while it plays, the logo and PLAY move up and shrink and a 3×3
// board at the game's own cell size comes up under them and plays the real game by itself — a hand swaps two animals,
// three in a row glow and pop (puffs + letter badges), the say card shows the word with its first letter beating, the mic
// listens, then the ✓ and +10 coins that fly to the dress-up button; new animals drop in, the board goes back down.
// The first time (after the hello on the first touch) the tutor narrates it: match three → the sound and the word → say
// it with me → coins → dress me up → press PLAY. Later, after a while on the title with nothing tapped, it plays again
// quietly (one round).
import { sfx } from '../core/audio';
import { onLineTimes, say, stopSpeech } from '../core/speech';
import { allOf, type Animal } from '../data/animals';
import type { Fx } from './fx';
import { boxIn, wait } from './stage';
import type { Title } from './title';
import { finger, TIP_X, TIP_Y } from './hand';
import type { Tutor } from './tutor';

const base = new URL('./', location.href).href;
const CELL = 254, PC = 254;                            // cell + piece in the demo field (the game's scale)
const SLOT_W = 232, SLOT_H = 234;
const IDLE_FIRST = 8000, IDLE = 25000;                  // quiet replays: before the first touch, then after nothing was tapped
const ANIMAL_SET = allOf('animals');      // the demo shows animals in every theme (its narration says 동물)
const animal = (id: string) => ANIMAL_SET.find((a) => a.id === id)!;
/** 3×3 animals row by row; the piece at `a` is dragged onto `b` (that makes three in a row); `refill` drops in after */
interface Scene { grid: string[]; a: number; b: number; refill: string[] }
const SCENES: Scene[] = [
  { grid: ['tiger', 'pig', 'monkey', 'pig', 'monkey', 'pig', 'ant', 'tiger', 'seal'], a: 1, b: 4, refill: ['seal', 'ant', 'tiger'] },
  { grid: ['monkey', 'seal', 'tiger', 'tiger', 'monkey', 'pig', 'monkey', 'ant', 'seal'], a: 4, b: 3, refill: ['pig', 'seal', 'tiger'] },
  { grid: ['seal', 'pig', 'monkey', 'monkey', 'tiger', 'ant', 'tiger', 'seal', 'tiger'], a: 4, b: 7, refill: ['ant', 'monkey', 'pig'] },
];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8]];
const lineOf = (g: string[]) => LINES.find((l) => g[l[0]!] === g[l[1]!] && g[l[1]!] === g[l[2]!]) ?? [];
const STOP = new Error('demo stopped');
const xy = (i: number) => ({ x: (i % 3) * CELL + CELL / 2, y: Math.floor(i / 3) * CELL + CELL / 2 });
const at = (i: number, s = 1, dy = 0) => { const c = xy(i); return `translate(${c.x - PC / 2}px, ${c.y - PC / 2 + dy}px) scale(${s})`; };
const tip = (i: number, s = 1) => { const c = xy(i); return `translate(${c.x - TIP_X}px, ${c.y + 34 - TIP_Y}px) scale(${s})`; };
const fin = (a: Animation) => a.finished.then(() => {}, () => {});

export class Demo {
  readonly el: HTMLElement;
  private field: HTMLElement;
  private pcs: HTMLElement[] = [];
  private slots: HTMLElement[] = [];
  private hand: HTMLElement;
  private card: HTMLElement;
  private g: string[] = [];
  private run = 0;
  private next = 1;
  private on = false;
  private active = false;
  private narrating = false;
  private greeted = false;
  private idleT = 0;

  constructor(private host: HTMLElement, private fx: Fx, private tutor: Tutor, private title: Title) {
    const el = this.el = document.createElement('div');
    el.className = 'demo'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="demo-field"></div>
      <div class="say-card demo-card" hidden>
        <div class="sc-face"><img alt="" draggable="false" /></div>
        <div class="sc-word"><b class="sc-l"></b><span class="sc-rest"></span></div>
        <div class="sc-mic"><i class="ring"></i><svg viewBox="0 0 24 24"><rect x="8.6" y="2.8" width="6.8" height="11.6" rx="3.4" /><path d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0M12 17.8v3.4" /></svg></div>
        <svg class="sc-ok" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19.5 7" /></svg>
      </div>`;
    host.appendChild(el);
    // SKIP, bottom right, only while it plays (PLAY is away then): kids hear it once and then want to get on
    const skip = document.createElement('button');
    skip.className = 'skip-btn'; skip.setAttribute('aria-label', 'Skip');
    skip.innerHTML = '<span>SKIP</span>';
    skip.addEventListener('click', () => this.skip());
    host.appendChild(skip);
    this.field = el.querySelector('.demo-field')!;
    this.card = el.querySelector('.demo-card')!;
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('i'); s.className = 'demo-slot';
      const c = xy(i); s.style.left = `${c.x - SLOT_W / 2}px`; s.style.top = `${c.y - SLOT_H / 2}px`;
      this.field.appendChild(s); this.slots.push(s);
    }
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('div'); p.className = 'demo-pc';
      const img = document.createElement('img'); img.alt = ''; img.draggable = false;
      p.appendChild(img); this.field.appendChild(p); this.pcs.push(p);
    }
    this.hand = finger('demo-hand');
    this.field.appendChild(this.hand);
    this.setGrid(SCENES[0]!.grid);
    // the card's first letter jumps on each letter sound while the tutor reads it
    onLineTimes((times, now) => {
      if (!this.narrating) return;
      for (const t of times) if (t.key.startsWith('s:')) setTimeout(() => this.beat(), Math.max(0, (t.at - now) * 1000 + 60));
    });
  }

  /** the title is on screen: quiet replays after a while with nothing tapped */
  start() { this.on = true; this.arm(); }
  /** the title went away: everything stops, the board is down */
  stop() { this.on = false; this.run++; this.active = false; this.narrating = false; clearTimeout(this.idleT); this.leave(); }
  /** something was tapped on the title: the quiet replay waits again */
  poke() { if (this.on && !this.active) this.arm(); }
  /** after SKIP (main.ts: music on, no hello later) */
  onSkip: () => void = () => {};
  /** SKIP: the explanation stops mid-word, the board goes down, the logo and PLAY are back */
  skip() {
    if (!this.active) return;
    stopSpeech();
    this.run++;                                 // narrate() / quiet() stop at their next step
    this.narrating = false; this.active = false; this.greeted = true;
    this.leave();
    this.onSkip();
    if (this.on) this.arm();
  }
  /** the tutor is explaining the demo (taps on the tutor shouldn't start another line) */
  get talking() { return this.narrating; }
  private arm() { clearTimeout(this.idleT); this.idleT = window.setTimeout(() => void this.quiet(), this.greeted ? IDLE : IDLE_FIRST); }

  /** the hello, then the tutor shows how to play on the demo board, then "press PLAY" as the board goes down */
  async narrate() {
    const r = ++this.run;                       // (stops a quiet replay at its next step)
    clearTimeout(this.idleT);
    this.greeted = this.active = this.narrating = true;
    this.leave();
    try {
      this.tutor.act('hop');
      await this.talk(['t:hello'], r);
      this.next = 1;
      await this.enter(SCENES[0]!, r);
      await this.round(SCENES[0]!, r, true);
      this.tutor.act('nod');
      const bye = say(['t:pressplay']);
      await this.w(250, r);
      this.leave();
      await bye;
    } catch (e) {
      if (e !== STOP) throw e;
      if (r === this.run) this.leave();         // a line was cut (a tap on the tutor): back to the title as it was
    } finally {
      if (r === this.run) { this.narrating = false; this.active = false; if (this.on) this.arm(); }
    }
  }

  private async quiet() {
    if (!this.on || this.active) return;
    const r = ++this.run;
    this.active = true;
    try {
      const sc = SCENES[this.next++ % SCENES.length]!;
      await this.enter(sc, r);
      await this.round(sc, r, false);
      await this.w(600, r);
      this.leave();
    } catch (e) {
      if (e !== STOP) throw e;
      if (r === this.run) this.leave();
    } finally {
      if (r === this.run) { this.active = false; if (this.on) this.arm(); }
    }
  }

  private check(r: number) { if (r !== this.run) throw STOP; }
  private async w(ms: number, r: number) { await wait(ms); this.check(r); }
  private async talk(parts: Parameters<typeof say>[0], r: number) { if (!(await say(parts))) throw STOP; this.check(r); }

  /** the board comes up under the logo and PLAY (which move up and shrink); the letters stay home meanwhile */
  private async enter(sc: Scene, r: number) {
    this.reset();
    this.setGrid(sc.grid);
    this.title.hold(true);
    this.host.classList.add('demo-on');
    await this.w(750, r);
  }
  private leave() {
    this.host.classList.remove('demo-on');
    this.title.hold(false);
    this.reset();
  }

  /** one round: swap → glow → pop → the word → say it → ✓ + coins → new animals (talk = the tutor narrates) */
  private async round(sc: Scene, r: number, talk: boolean) {
    await this.w(talk ? 150 : 450, r);
    const how = talk ? say(['t:howto1']) : null;
    if (talk) { this.tutor.act('nod'); await this.w(900, r); }
    await this.swipe(sc.a, sc.b, r, talk);
    if (how && !(await how)) throw STOP;
    const line = lineOf(this.g), a = animal(this.g[line[0]!]!);
    line.forEach((i) => this.slots[i]!.classList.add('glow'));
    await this.w(480, r);
    line.forEach((i) => this.slots[i]!.classList.remove('glow'));
    await this.pop(line, a.letter, r, talk);
    this.showCard(a);
    if (talk) { this.tutor.act('bounce'); await this.talk(['t:wow', 0.25, `s:${a.letter}`, 0.32, `s:${a.letter}`, 0.4, `w:${a.word}`], r); }
    else { await this.w(520, r); this.beat(); await this.w(430, r); this.beat(); await this.w(800, r); }
    this.card.classList.add('listen');
    if (talk) await this.talk(['t:howto2'], r); else await this.w(1400, r);
    this.card.classList.remove('listen'); this.card.classList.add('ok');
    if (talk) sfx('success');
    const coins = this.coins(talk, r);
    if (talk) { this.tutor.act('cheer'); await this.talk(['t:howto3'], r); }
    await coins; this.check(r);
    await this.hideCard(r);
    await this.refill(line, sc.refill, r);
  }

  private paint(i: number) {
    const p = this.pcs[i]!;
    p.getAnimations().forEach((x) => x.cancel());
    (p.firstChild as HTMLImageElement).src = `${base}${animal(this.g[i]!).img}`;
    p.style.transform = at(i); p.style.opacity = '1'; p.style.zIndex = '';
  }
  private setGrid(grid: string[]) { this.g = grid.slice(); this.pcs.forEach((_p, i) => this.paint(i)); }
  /** the hand presses the piece at a and drags it onto b; the two trade places */
  private async swipe(a: number, b: number, r: number, talk: boolean) {
    const h = this.hand, pa = this.pcs[a]!, pb = this.pcs[b]!;
    await fin(h.animate([{ transform: tip(a, 1.1), opacity: 0 }, { transform: tip(a), opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'forwards' })); this.check(r);
    await fin(h.animate([{ transform: tip(a), opacity: 1 }, { transform: tip(a, 0.86), opacity: 1 }], { duration: 180, fill: 'forwards' })); this.check(r);
    pa.style.zIndex = '2';
    if (talk) sfx('swap');
    await Promise.all([
      fin(h.animate([{ transform: tip(a, 0.86), opacity: 1 }, { transform: tip(b, 0.86), opacity: 1 }], { duration: 460, easing: 'ease-in-out', fill: 'forwards' })),
      fin(pa.animate([{ transform: at(a, 1.08) }, { transform: at(b, 1.08) }], { duration: 460, easing: 'ease-in-out', fill: 'forwards' })),
      fin(pb.animate([{ transform: at(b) }, { transform: at(a) }], { duration: 460, easing: 'ease-in-out', fill: 'forwards' })),
    ]);
    this.check(r);
    [this.pcs[a], this.pcs[b]] = [pb, pa];
    [this.g[a], this.g[b]] = [this.g[b]!, this.g[a]!];
    this.paint(a); this.paint(b);
    await fin(h.animate([{ transform: tip(b, 0.86), opacity: 1 }, { transform: tip(b, 1.05), opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' })); this.check(r);
  }
  private async pop(line: number[], letter: string, r: number, talk: boolean) {
    if (talk) sfx('pop', 0);
    line.forEach((i, n) => {
      const b = boxIn(this.fx.stage, this.pcs[i]!);
      this.fx.pop(b.cx, b.cy);
      this.fx.badge(letter, b.cx, b.cy - 30, n * 60);
    });
    await Promise.all(line.map((i) => fin(this.pcs[i]!.animate([{ transform: at(i), opacity: 1 }, { transform: at(i, 1.25), opacity: 1, offset: 0.35 }, { transform: at(i, 0.2), opacity: 0 }],
      { duration: 320, easing: 'ease-in', fill: 'forwards' }))));
    this.check(r);
  }
  /** +10 and coins flying to the dress-up button (a picture of the reward only: no real coins) */
  private async coins(talk: boolean, r: number) {
    const b = boxIn(this.fx.stage, this.card.querySelector('.sc-word')!);
    this.fx.text('+10', b.cx, b.y - 10, true);
    const target = document.querySelector<HTMLElement>('#btnDress');
    if (!target) return;
    await this.fx.coins(6, b.cx, b.cy, target, `${base}art/coin.webp`, () => { if (talk && r === this.run) sfx('coin'); });
    if (r !== this.run) return;
    target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
  }
  private async refill(line: number[], ids: string[], r: number) {
    line.forEach((i, n) => { this.g[i] = ids[n]!; this.paint(i); });
    await Promise.all(line.map((i, n) => fin(this.pcs[i]!.animate([{ transform: at(i, 1, -200), opacity: 0 }, { transform: at(i, 1, 10), opacity: 1, offset: 0.75 }, { transform: at(i) }],
      { duration: 480, delay: n * 70, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' }))));
    this.check(r);
  }

  private showCard(a: Animal) {
    const c = this.card;
    (c.querySelector('.sc-face img') as HTMLImageElement).src = `${base}${a.img}`;
    c.querySelector('.sc-l')!.textContent = a.word[0]!;
    c.querySelector('.sc-rest')!.textContent = a.word.slice(1);
    (c.querySelector('.sc-l') as HTMLElement).style.setProperty('--lc', a.color);
    c.classList.remove('listen', 'ok', 'out', 'think');
    c.hidden = false;
  }
  private async hideCard(r: number) {
    this.card.classList.add('out');
    await this.w(300, r);
    this.card.hidden = true; this.card.classList.remove('out', 'listen', 'ok');
  }
  private beat() { const l = this.card.querySelector('.sc-l') as HTMLElement; l.classList.remove('beat'); void l.offsetWidth; l.classList.add('beat'); }
  /** no hand, no card, no glow; the animals sit in their cells */
  private reset() {
    this.hand.getAnimations().forEach((x) => x.cancel()); this.hand.style.opacity = '0';
    this.card.hidden = true; this.card.classList.remove('out', 'listen', 'ok');
    this.slots.forEach((s) => s.classList.remove('glow'));
    if (this.g.length) this.pcs.forEach((_p, i) => this.paint(i));
  }
}
