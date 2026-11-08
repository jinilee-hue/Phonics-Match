// The tutor (the yellow fluffy friend from the mockups): one body image with the mouth, cap and blinks as their own
// layers, so it can talk (mouth follows the voice), blink, smile with its eyes, hop and wear the shop's items.
import artData from '../data/art.json';
import { itemById, type Slot } from './items';
import { Mouth } from './mouth';

type Box = { x: number; y: number; w: number; h: number };
const ART = artData as unknown as { tutor: Box & { eyes: number[][] }; tutor_mouth: Box };
const base = new URL('./', location.href).href;
const LID = [['#fee481', '#fccd75'], ['#fdd971', '#fbc164']];

export type Eyes = '' | 'happy' | 'closed';
export type Act = 'hop' | 'cheer' | 'wiggle' | 'nod' | 'bounce' | 'shy' | 'proud' | 'groove' | 'clap' | 'stomp' | 'twirl';

// ── putting an item on (user: "아이템을 장착했을때의 모션도 좀 다양하게 해줬으면 좋겠어"): each item makes its own entrance —
// hats drop and bounce, the grad cap is tossed in spinning, the crown descends, the party hat spins down, bunny ears spring
// up, flowers bloom, the bow flutters down, glasses slide down, star glasses twirl
// open, the bow tie spins in, mittens pop on one hand after the other, shoes stomp down, the cape unfurls and flutters —
// with sparkles where it lands and the tutor's own reaction (nod, proud, groove, clap, stomp, twirl…). Every keyframe has
// the same transform list, so spins really turn: translate(x, y) · the item's pose · rotate(r) · translateY(ty %) ·
// scale(sx, sy); ty keeps an edge still while it squashes (bottom: +(1 − sy)/2 · 100, top: −(1 − sy)/2 · 100).
type F = { x?: number; y?: number; r?: number; ty?: number; sx?: number; sy?: number; op?: number; at?: number; ease?: string };
type Motion = { kf: F[]; ms: number; land: number; stagger?: number; react: Act; spark: string[]; sparkDy?: number };
const PASTEL = ['#ffe066', '#ffb3d1', '#8de8cf', '#a9cbff', '#fff4b0'];
const GOLD = ['#ffd54a', '#fff3a6', '#ffb800', '#ffe58a'];
const CONFETTI = ['#ff7eb3', '#6ee7c8', '#ffd54a', '#7cc8ff', '#b28cff'];
const FALL = 'cubic-bezier(.55,0,1,.45)';
const MOTION: Record<string, Motion> = {
  drop: { ms: 760, land: 0.56, react: 'nod', spark: PASTEL, kf: [
    { y: -240, r: -14, op: 0, ease: FALL }, { y: -130, r: -9, at: 0.3, ease: FALL },
    { y: 4, ty: 7, sx: 1.1, sy: 0.86, at: 0.56, ease: 'ease-out' }, { y: -22, r: 4, at: 0.74, ease: 'ease-in' },
    { ty: 2, sx: 1.03, sy: 0.96, at: 0.88, ease: 'ease-out' }, {}] },
  gradcap: { ms: 1000, land: 0.68, react: 'proud', spark: GOLD, kf: [
    { x: -140, y: -60, r: -300, sx: 0.6, op: 0, ease: 'ease-out' }, { x: -60, y: -280, r: -150, sx: 0.9, at: 0.35, ease: 'ease-in' },
    { y: 4, r: 6, ty: 6, sx: 1.08, sy: 0.88, at: 0.68, ease: 'ease-out' }, { y: -14, r: -3, at: 0.84, ease: 'ease-in' }, {}] },
  crown: { ms: 900, land: 0.68, react: 'proud', spark: GOLD, kf: [
    { y: -200, op: 0, ease: 'ease-out' }, { y: -60, r: -5, at: 0.45, ease: 'ease-in' },
    { y: 3, ty: 5, sx: 1.06, sy: 0.9, at: 0.68, ease: 'ease-out' }, {}] },
  party: { ms: 820, land: 0.55, react: 'wiggle', spark: CONFETTI, kf: [
    { y: -260, r: 200, sx: 0.7, op: 0, ease: 'ease-in' }, { y: 4, r: -8, ty: 7, sx: 1.1, sy: 0.86, at: 0.55, ease: 'ease-out' },
    { y: -18, r: 5, at: 0.74, ease: 'ease-in' }, {}] },
  bunny: { ms: 760, land: 0.38, react: 'hop', spark: ['#ffc2da', '#ffe3ef', '#ff9ec4'], kf: [
    { ty: 40, sx: 0.9, sy: 0.2, op: 0, ease: 'ease-out' }, { ty: -14, sx: 0.94, sy: 1.28, at: 0.38 },
    { ty: 7, sx: 1.06, sy: 0.86, at: 0.58 }, { ty: -4, sx: 0.98, sy: 1.08, at: 0.76 }, {}] },
  flowers: { ms: 700, land: 0.6, react: 'shy', spark: ['#ff9ec4', '#ffe066', '#a8e6a1', '#ffc2da'], kf: [
    { ty: 30, sx: 0.3, r: -40, op: 0, ease: 'ease-out' }, { ty: -4, sx: 1.12, r: 6, at: 0.6 }, { sx: 0.97, r: -2, at: 0.8 }, {}] },
  bow: { ms: 950, land: 0.78, react: 'shy', spark: ['#ff8fb8', '#ffd1e3', '#ffb3d1'], kf: [
    { x: -50, y: -200, r: -25, op: 0 }, { x: 40, y: -120, r: 20, at: 0.3, ease: 'ease-in-out' },
    { x: -25, y: -50, r: -12, at: 0.55, ease: 'ease-in-out' }, { y: 3, r: 4, ty: 4, sx: 1.05, sy: 0.92, at: 0.78, ease: 'ease-out' }, {}] },
  glasses: { ms: 560, land: 0.55, react: 'bounce', spark: PASTEL, kf: [
    { y: -110, sx: 0.85, op: 0, ease: 'ease-out' }, { y: 12, sx: 1.04, at: 0.55 }, { y: -5, at: 0.78 }, {}] },
  stars: { ms: 640, land: 0.6, react: 'wiggle', spark: GOLD, kf: [
    { r: -200, sx: 0.1, op: 0, ease: 'ease-out' }, { r: 12, sx: 1.18, at: 0.6 }, { r: -4, sx: 0.96, at: 0.8 }, {}] },
  bowtie: { ms: 800, land: 0.7, react: 'proud', spark: PASTEL, kf: [
    { r: -720, sx: 0.2, op: 0, ease: 'cubic-bezier(.2,.7,.3,1)' }, { r: 10, sx: 1.15, at: 0.7 }, {}] },
  gloves: { ms: 480, land: 0.55, stagger: 180, react: 'clap', spark: PASTEL, kf: [
    { sx: 0.2, r: -30, op: 0, ease: 'ease-out' }, { sx: 1.22, sy: 0.86, r: 6, at: 0.55 }, { sx: 0.92, sy: 1.08, at: 0.75 }, {}] },
  shoes: { ms: 520, land: 0.45, stagger: 220, react: 'stomp', spark: PASTEL, kf: [
    { y: -170, op: 0, ease: FALL }, { ty: 9, sx: 1.16, sy: 0.82, at: 0.45, ease: 'ease-out' },
    { y: -14, sx: 0.96, sy: 1.04, at: 0.68, ease: 'ease-in' }, {}] },
  cape: { ms: 1000, land: 0.4, react: 'twirl', spark: PASTEL, sparkDy: -200, kf: [
    { ty: -45, sx: 0.9, sy: 0.1, op: 0, ease: 'ease-out' }, { ty: 4, sx: 1.04, sy: 1.08, r: -3, at: 0.4 },
    { ty: -1.5, sy: 0.97, r: 2.5, at: 0.62 }, { ty: 0.5, sy: 1.01, r: -1, at: 0.82 }, {}] },
};
const BY_SLOT: Record<Slot, string> = { head: 'drop', face: 'glasses', neck: 'bowtie', hands: 'gloves', feet: 'shoes', back: 'cape' };
const motionOf = (id: string, slot: Slot) => MOTION[id] ?? MOTION[BY_SLOT[slot]]!;
const frame = (pose: string, f: F): Keyframe => {
  const sx = f.sx ?? 1, sy = f.sy ?? sx;
  const k: Keyframe = { transform: `translate(${f.x ?? 0}px, ${f.y ?? 0}px) ${pose} rotate(${f.r ?? 0}deg) translateY(${f.ty ?? 0}%) scale(${sx}, ${sy})`, opacity: f.op ?? 1 };
  if (f.at !== undefined) k.offset = f.at;
  if (f.ease) k.easing = f.ease;
  return k;
};

export class Tutor {
  el: HTMLElement;
  private rig: HTMLElement;
  private mouth: HTMLElement;
  /** the drawn mouth (lip sync); the painted one shows when it doesn't talk */
  lips = new Mouth();
  private items: { back: HTMLElement; front: HTMLElement };
  private eyesTimer = 0;
  set level(f: () => number) { this.lips.level = f; }
  constructor(parent: HTMLElement, cls = '') {
    const el = document.createElement('div');
    el.className = `tutor ${cls}`;
    el.innerHTML = `<div class="t-rig"><img class="t-body" src="${base}art/tutor_body.webp" alt="" draggable="false" />
      <div class="t-items back"></div><img class="t-mouth" src="${base}art/tutor_mouth.webp" alt="" draggable="false" />
      <div class="t-lid l"><i></i></div><div class="t-lid r"><i></i></div><div class="t-items front"></div></div>`;
    parent.appendChild(el);
    this.el = el;
    this.rig = el.querySelector('.t-rig')!;
    this.mouth = el.querySelector('.t-mouth')!;
    this.items = { back: el.querySelector('.t-items.back')!, front: el.querySelector('.t-items.front')! };
    const m = ART.tutor_mouth;
    Object.assign(this.mouth.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px` });
    this.mouth.after(this.lips.cv);
    this.lips.onDrawn = (on) => { el.classList.toggle('lips', on); };
    el.querySelectorAll<HTMLElement>('.t-lid').forEach((lid, i) => {
      const [cx, cy, rx, ry] = ART.tutor.eyes[i];
      Object.assign(lid.style, { left: `${cx - rx - 5}px`, top: `${cy - ry - 5}px`, width: `${2 * rx + 10}px`, height: `${2 * ry + 10}px`, transform: 'rotate(8deg)' });
      lid.style.setProperty('--lid1', LID[i][0]); lid.style.setProperty('--lid2', LID[i][1]);
    });
    this.blinkLoop();
  }

  /** where it stands: stage px of the art's top-left corner + scale */
  place(x: number, y: number, s: number, instant = false) {
    if (instant) { this.el.style.transition = 'none'; requestAnimationFrame(() => { this.el.style.transition = ''; }); }
    this.el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  /** preview (main.ts ?tutor=3d; user: "게임화면에 적용해서 볼께"): the code-built 3D tutor (Phonics-Match-3D embed.html, its own
   *  server) in the body art's place — same 660×680 frame and picture angle, so places, hops and the 2D items still
   *  fit. Its mouth follows this lip sync: the bowl depth `low` of the current shape (X/A shut … D wide); the smile
   *  between lines is its own. No server → the 2D art stays. */
  private post3d: ((o: object) => void) | null = null;
  /** sent on load (and kept while it loads): autoFront, paused */
  private state3d: Record<string, unknown> = {};
  /** ?tutor=3d: stop / resume the 3D drawing while it can't be seen (the stage's behind the dress room, the dress room's when closed) */
  pause3d(on: boolean) { this.state3d.paused = on; this.post3d?.({ paused: on }); }
  use3d(src: string, opts: { autoFront?: boolean; paused?: boolean } = {}) {
    this.state3d = { shadow: false, ...opts };   // the floor shadow is the game's (.tutor::before, outside the hopping rig; user: "튜터 캐릭터가 뛸때 그림자가 같이 묶여서 올라가던데")
    fetch(src, { mode: 'no-cors' }).then(() => {
      const f = document.createElement('iframe');
      f.className = 't3d-frame'; f.src = src; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
      this.rig.querySelector('.t-body')!.after(f);
      this.el.classList.add('t3d');
      const post = (o: object) => f.contentWindow?.postMessage({ t3d: o }, '*');
      this.post3d = post;
      // the cape's 'twirl' reaction: a real turn of the 3D body (the CSS one squashed the frame flat)
      const act0 = this.act.bind(this);
      this.act = (a) => { if (a === 'twirl') post({ twirl: true }); else act0(a); };
      // gloves / shoes / cape / grad cap: the 3D draws them (they turn with it; user: "꾸미는 아이템하고도 다시 잘 맞춰봐 신발이랑
      // 장갑") — their 2D pictures are hidden by CSS; the other 2D items show only while it faces front (they fit that angle)
      // every worn item the 3D can draw (it lists them: t3dItems) is 3D and turns with it (user: "다른아이템들도 신발, 장갑처럼
      // 몸에 잘 맞게"); its 2D picture is hidden. The rest stay 2D, shown only while it faces front.
      let drawn3d = new Set(['gloves', 'shoes', 'cape', 'gradcap', 'phones']);
      const hide2d = () => this.el.querySelectorAll<HTMLElement>('.t-items > img').forEach((img) => { img.style.visibility = drawn3d.has(img.dataset.item ?? '') ? 'hidden' : ''; });
      const dress = () => {
        const w = this.worn;
        post({ worn: { ...w }, gloves: w.hands === 'gloves', shoes: w.feet === 'shoes', cape: w.back === 'cape', cap: w.head === 'gradcap' });
        hide2d();
      };
      f.addEventListener('load', () => { post(this.state3d); dress(); });
      const wear0 = this.wear.bind(this);
      this.wear = (worn, show = false) => { wear0(worn, show); dress(); };
      addEventListener('message', (e) => {
        if (e.source !== f.contentWindow) return;
        if (e.data?.t3dPose) this.el.classList.toggle('t3d-turned', !e.data.t3dPose.front);
        if (Array.isArray(e.data?.t3dItems)) { drawn3d = new Set(e.data.t3dItems as string[]); hide2d(); }
      });
      // drag = turn it left/right + up/down (user: "근데 캐릭터가 안돌가는데 좌우 상하 회전을 안하잖아?"); a tap stays the tutor's tap
      let down: { x: number; y: number; id: number; moved: number } | null = null, dragged = false;
      this.el.style.touchAction = 'none';
      this.el.addEventListener('pointerdown', (e) => {
        if ((e.target as Element).closest('.dress-btn')) return;
        down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }; dragged = false;
      });
      this.el.addEventListener('pointermove', (e) => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        down.moved += Math.abs(dx) + Math.abs(dy); down.x = e.clientX; down.y = e.clientY;
        if (!dragged && down.moved < 8) return;
        if (!dragged) { dragged = true; this.el.setPointerCapture(e.pointerId); this.el.classList.add('t3d-turned'); }
        post({ drag: [dx, dy] });   // screen px = the 3D page's feel (its canvas shows the art ~1:1); art px (×2.4 here) spun it ~400° per tutor width
      });
      const up = (e: PointerEvent) => { if (!down || e.pointerId !== down.id) return; down = null; if (dragged) post({ dragEnd: true }); };
      this.el.addEventListener('pointerup', up); this.el.addEventListener('pointercancel', up);
      this.el.addEventListener('click', (e) => { if (dragged) { dragged = false; e.stopImmediatePropagation(); } }, true);   // a drag is no tap
      let sent: number | null = null;
      const loop = () => {
        const talk = this.el.classList.contains('lips') && this.lips.shape !== 'S';
        const v = talk ? Math.round(Math.min(1, Math.max(0, this.lips.m.low / 24)) * 50) / 50 : null;
        if (v !== sent) { post({ mouth: v }); sent = v; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }, () => console.warn('3D tutor: nothing at', src, '— keeping the 2D art'));
  }

  // ── mouth: lip sync while a voice clip plays (ui/mouth.ts) ──────────────────────────────────────────
  talk(on: boolean) { this.lips.talk(on); }

  // ── eyes ─────────────────────────────────────────────────────────────────────────────────────────────
  private blinkLoop() {
    const next = () => setTimeout(() => {
      if (!this.el.dataset.eyes) {
        this.el.classList.add('blink');
        setTimeout(() => this.el.classList.remove('blink'), 130);
        if (Math.random() < 0.25) setTimeout(() => { this.el.classList.add('blink'); setTimeout(() => this.el.classList.remove('blink'), 120); }, 260);
      }
      next();
    }, 2200 + Math.random() * 2800);
    next();
  }
  eyes(e: Eyes, ms = 0) {
    clearTimeout(this.eyesTimer);
    if (e) this.el.dataset.eyes = e; else delete this.el.dataset.eyes;
    if (e && ms) this.eyesTimer = window.setTimeout(() => { delete this.el.dataset.eyes; }, ms);
  }

  // ── body ─────────────────────────────────────────────────────────────────────────────────────────────
  act(a: Act) {
    const k: Record<Act, Keyframe[]> = {
      hop: [{ transform: 'none' }, { transform: 'translateY(6px) scale(1.06,.92)', offset: 0.15 }, { transform: 'translateY(-70px) scale(.96,1.05)', offset: 0.45 },
        { transform: 'translateY(4px) scale(1.07,.92)', offset: 0.75 }, { transform: 'none' }],
      cheer: [{ transform: 'none' }, { transform: 'translateY(8px) scale(1.07,.9)', offset: 0.1 }, { transform: 'translateY(-90px) rotate(-6deg) scale(.95,1.06)', offset: 0.3 },
        { transform: 'translateY(4px) scale(1.06,.92)', offset: 0.5 }, { transform: 'translateY(-50px) rotate(6deg)', offset: 0.7 }, { transform: 'translateY(2px) scale(1.04,.95)', offset: 0.88 }, { transform: 'none' }],
      wiggle: [{ transform: 'none' }, { transform: 'rotate(-6deg)', offset: 0.2 }, { transform: 'rotate(6deg)', offset: 0.45 }, { transform: 'rotate(-4deg)', offset: 0.7 }, { transform: 'none' }],
      nod: [{ transform: 'none' }, { transform: 'translateY(10px) rotate(3deg) scale(1.02,.97)', offset: 0.35 }, { transform: 'translateY(-6px)', offset: 0.7 }, { transform: 'none' }],
      bounce: [{ transform: 'none' }, { transform: 'scale(1.05,.94)', offset: 0.3 }, { transform: 'scale(.97,1.04) translateY(-12px)', offset: 0.6 }, { transform: 'none' }],
      shy: [{ transform: 'none' }, { transform: 'rotate(-5deg) scale(.98)', offset: 0.3 }, { transform: 'rotate(-5deg) scale(.98)', offset: 0.7 }, { transform: 'none' }],
      proud: [{ transform: 'none' }, { transform: 'translateY(6px) scale(1.04,.95)', offset: 0.15 }, { transform: 'translateY(-18px) scale(.98,1.05)', offset: 0.4 },
        { transform: 'translateY(-14px) rotate(-3deg) scale(1.02)', offset: 0.65 }, { transform: 'none' }],
      groove: [{ transform: 'none' }, { transform: 'translateX(-10px) rotate(-5deg)', offset: 0.2 }, { transform: 'translateX(10px) rotate(5deg)', offset: 0.45 },
        { transform: 'translateX(-7px) rotate(-4deg)', offset: 0.7 }, { transform: 'translateX(4px) rotate(2deg)', offset: 0.88 }, { transform: 'none' }],
      clap: [{ transform: 'none' }, { transform: 'scale(1.05,.94)', offset: 0.15 }, { transform: 'translateY(-16px)', offset: 0.32 },
        { transform: 'scale(1.05,.94)', offset: 0.5 }, { transform: 'translateY(-12px)', offset: 0.68 }, { transform: 'none' }],
      stomp: [{ transform: 'none' }, { transform: 'translateY(6px) rotate(-3deg) scale(1.05,.94)', offset: 0.2 }, { transform: 'translateY(-16px) rotate(-3deg)', offset: 0.38 },
        { transform: 'translateY(6px) rotate(3deg) scale(1.05,.94)', offset: 0.6 }, { transform: 'translateY(-12px) rotate(3deg)', offset: 0.78 }, { transform: 'none' }],
      twirl: [{ transform: 'none' }, { transform: 'translateY(-30px) scaleX(.15)', offset: 0.25 }, { transform: 'translateY(-40px) scaleX(-1)', offset: 0.5 },
        { transform: 'translateY(-30px) scaleX(.15)', offset: 0.75 }, { transform: 'none' }],
    };
    const dur: Record<Act, number> = { hop: 620, cheer: 1150, wiggle: 700, nod: 520, bounce: 420, shy: 900, proud: 900, groove: 1100, clap: 700, stomp: 800, twirl: 1000 };
    this.rig.animate(k[a], { duration: dur[a], easing: 'ease-in-out', composite: 'add' });
    if (a === 'cheer' || a === 'hop' || a === 'proud' || a === 'groove' || a === 'twirl') this.eyes('happy', dur[a] + 300);
  }

  // ── clothes ─────────────────────────────────────────────────────────────────────────────────────────
  private worn: Partial<Record<Slot, string>> = {};
  /** dress the tutor. `show` (the shop's taps): only what changed moves — the new item makes its entrance (MOTION) and
   *  the tutor reacts; a taken-off one flies away. Without it (startup, the stage's tutor) the items just appear. */
  wear(worn: Partial<Record<Slot, string>>, show: false | 'wear' | 'buy' = false) {
    const prev = this.worn; this.worn = { ...worn };
    const leaving = show ? [...this.el.querySelectorAll<HTMLElement>('.t-items > img')].filter((img) => {
      const s = img.dataset.slot as Slot; return !!prev[s] && prev[s] !== worn[s];
    }) : [];
    this.items.back.innerHTML = ''; this.items.front.innerHTML = '';
    let react: Act | null = null, at = 0;
    // cape sits behind the body; everything else is in front, neck after head.
    // gloves/shoes stamp the same product shot onto each hand/foot via `pieces`.
    for (const slot of ['back', 'face', 'head', 'neck', 'hands', 'feet'] as Slot[]) {
      const it = worn[slot] ? itemById(worn[slot]!) : null;
      if (!it || (it.only3d && !this.el.classList.contains('t3d'))) continue;   // 3D-only items: nothing in 2D
      const layer = slot === 'back' ? this.items.back : this.items.front;
      const stamps = it.pieces?.length ? it.pieces : [{ at: it.at }];
      const mo = show && prev[slot] !== worn[slot] ? motionOf(it.id, slot) : null;
      let n = -1;
      for (const p of stamps) {
        n++;
        const img = document.createElement('img');
        img.src = it.src; img.alt = ''; img.draggable = false;
        const [cx, cy, w, rot] = p.at;
        const flip = p.flip ? ' scaleX(-1)' : '';
        const pose = `translateY(-50%) rotate(${rot}deg)${flip}`;
        img.style.width = `${w}px`;
        if (it.h && !it.pieces) {
          img.style.height = `${it.h}px`;
          img.style.objectFit = 'cover';
          img.style.objectPosition = 'center bottom';
        }
        img.style.left = `${cx - w / 2}px`;
        img.style.top = `${cy}px`;
        img.style.transform = pose;
        img.dataset.slot = slot; img.dataset.item = it.id;
        layer.appendChild(img);
        if (!mo) continue;
        const delay = n * (mo.stagger ?? 0);
        img.animate(mo.kf.map((f) => frame(pose, f)), { duration: mo.ms, delay, fill: 'backwards' });
        this.sparkle(cx, cy + (mo.sparkDy ?? 0), mo.spark, delay + mo.ms * mo.land, show === 'buy');
      }
      if (mo) { react = mo.react; at = mo.ms * mo.land + (stamps.length - 1) * (mo.stagger ?? 0); }
    }
    for (const img of leaving) {         // taken off or swapped: it hops off and flies away
      (img.dataset.slot === 'back' ? this.items.back : this.items.front).appendChild(img);
      const pose = img.style.transform, dir = Math.random() < 0.5 ? -1 : 1;
      img.animate([frame(pose, {}), frame(pose, { y: -40, r: -8 * dir, sx: 1.08, at: 0.3 }), frame(pose, { x: 140 * dir, y: -230, r: 40 * dir, sx: 0.4, op: 0 })],
        { duration: 520, easing: 'ease-in', fill: 'forwards' }).onfinish = () => img.remove();
    }
    // in the shoes, the feet's leftovers (corners beside the toe caps, slivers under the soles) are masked off the body
    // (tools/feet_mask.py; user: "신발은 발에 신겨야지") — on a shop tap once the first shoe has landed
    const shod = worn.feet === 'shoes', fm = MOTION.shoes!;
    if (shod && show && prev.feet !== 'shoes') setTimeout(() => this.feetMask(this.worn.feet === 'shoes'), fm.ms * fm.land);
    else this.feetMask(shod);
    if (react) { const a = react; setTimeout(() => { this.act(a); if (show === 'buy') this.eyes('happy', 1600); }, at); }
    else if (leaving.length) this.act('bounce');
  }

  private feetMask(on: boolean) {
    const b = this.el.querySelector<HTMLElement>('.t-body')!;
    for (const p of ['mask', '-webkit-mask']) {
      if (on) {
        b.style.setProperty(`${p}-image`, `url(${base}art/tutor_feet_mask.webp)`);
        b.style.setProperty(`${p}-size`, '100% 100%'); b.style.setProperty(`${p}-repeat`, 'no-repeat');
      } else b.style.removeProperty(`${p}-image`);
    }
  }

  /** star sparkles bursting from where an item lands (tutor px) */
  private sparkle(cx: number, cy: number, colors: string[], delay: number, many: boolean) {
    const n = many ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 't-spark';
      s.style.left = `${cx}px`; s.style.top = `${cy}px`;
      s.style.setProperty('--c', colors[i % colors.length]!);
      this.items.front.appendChild(s);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = (many ? 120 : 90) + Math.random() * 90, sc = 0.55 + Math.random() * 0.7;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      s.animate([{ transform: 'translate(0px, 0px) scale(0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(${sc}) rotate(90deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0) rotate(180deg)`, opacity: 0 }],
        { duration: 720, delay, easing: 'ease-out', fill: 'backwards' }).onfinish = () => s.remove();
    }
  }
}
