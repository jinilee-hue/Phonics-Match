// The design stage is the mockups' own pixel grid (2752×1536). It is scaled to fit the window; the HUD hangs from the
// window's top edge (its panels are drawn attached to the top), the play stage is centred in the window.
// On a window wider than 16:9 the HUD also spans the empty side bands (CSS reads --hud-band, design px a side), so the
// logo and the exit button keep the same margins from the window's sides as from its top (user: "파닉스 로고 왼쪽에 여백와
// 나가기 버튼 우측에 여백이 넓어 줄여줘" — hung from the stage, the whole band was margin). The panels between them stretch
// by --hud-grow (≤ HUD_GROW); beyond that the row stays centred between the logo and the buttons.
export const DW = 2752, DH = 1536;
const HUD_GROW = 240;
/** phones held sideways only (tablets / PCs never match): style.css sizes their controls in screen px through --fit-s */
const PHONE_L = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
export let S = 1;
/** phones held sideways only: the game's board grows (scale k about its centre, moved by bx, by — design px); the tutor's
 *  game spot (stage px of its top-left + scale) — from the window (phoneLayout below). off (PCs, tablets, a phone held
 *  upright) = the old layout, untouched. */
export const PB = { on: false, k: 1, bx: 0, by: 0, tutor: [0, 0, 1] as [number, number, number], scRoom: 0 };
const listeners: (() => void)[] = [];
export const onFit = (f: () => void) => { listeners.push(f); };

export function fitStage(stage: HTMLElement, hud: HTMLElement, over: HTMLElement) {
  const fit = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    S = Math.min(vw / DW, vh / DH);
    const x = (vw - DW * S) / 2;
    const y = Math.max(0, (vh - DH * S) / 2);
    stage.style.transform = `translate(${x}px, ${y}px) scale(${S})`;
    over.style.transform = `translate(${x}px, ${y}px) scale(${S})`;
    const band = Math.max(0, (vw / S - DW) / 2);
    document.documentElement.style.setProperty('--hud-band', `${band}px`);
    document.documentElement.style.setProperty('--hud-grow', `${Math.min(HUD_GROW, band)}px`);
    document.documentElement.style.setProperty('--win-h', `${vh / S}px`);   // the window's height in HUD px (.lcol centres on it)
    hud.style.transform = `translate(${x - band * S}px, 0px) scale(${S})`;
    if (PHONE_L.matches) document.documentElement.style.setProperty('--fit-s', String(S));   // the stage scale, for the phone rules
    PB.on = PHONE_L.matches;
    if (PB.on) phoneLayout(vw, vh, x, y);
    listeners.forEach((f) => f());
  };
  fit();
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
}

let safeEl: HTMLElement | null = null;
/** the screen's safe-area insets (px; 0 without a notch / home bar) */
function safeArea() {
  if (!safeEl) {
    safeEl = document.createElement('div');
    safeEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(safeEl);
  }
  const c = getComputedStyle(safeEl), n = (v: string) => parseFloat(v) || 0;
  return { t: n(c.paddingTop), r: n(c.paddingRight), b: n(c.paddingBottom), l: n(c.paddingLeft) };
}
/** the phone game layout (screen px, then design px for CSS / JS) — the PC arrangement, only bigger: the board as big as
 *  the height allows (≤ 1.2×), 10 px right of the left column; right of it the tutor (feet on the board's bottom line)
 *  with the mic beside it, the say bubble centred over the tutor's head. When the room can't hold the tutor at ≥ 0.88
 *  and a ≥ 64 px mic, the board gives up width (iPhone 13: board 1.10×, tutor 0.88, mic 64; Pixel 7: 1.17×, 1.04, 88).
 *  12 px from the top and the sides, 14 px from the bottom (the home bar), plus the safe areas. */
function phoneLayout(vw: number, vh: number, ox: number, oy: number) {
  const root = document.documentElement.style, px = (v: number) => `${v.toFixed(2)}px`, sa = safeArea();
  const lcol = document.querySelector('.lcol')?.getBoundingClientRect(), bar = document.querySelector('.game-bar')?.getBoundingClientRect();
  const L = (lcol ? lcol.right : 159) + 10, R = bar && bar.width ? bar.right : vw - 12 - sa.r;   // (the bar keeps the right edge + safe area)
  const TOP = 12 + sa.t, BOT = vh - 14 - sa.b;
  const T_MAX = 1.04, T_MIN = 0.88, MIC_MAX = 88, MIC_MIN = 64, K_MAX = 1.2, G = 8;
  const tw = (s: number) => 660 * s * S;                                    // the tutor's box width (screen px)
  let k = Math.min(K_MAX, (BOT - TOP) / (1214 * S));
  const room = (kk: number) => R - (L + 1464 * kk * S) - G;                 // right of the board (+ the gap)
  let st = T_MAX, mic = Math.min(MIC_MAX, room(k) - tw(T_MAX) - G);
  if (mic < MIC_MIN) {
    st = Math.max(T_MIN, Math.min(T_MAX, (room(k) - G - MIC_MIN) / (660 * S)));
    mic = room(k) - tw(st) - G;
    if (mic < MIC_MIN) { st = T_MIN; mic = MIC_MIN; k = (R - L - G - (tw(T_MIN) + G + MIC_MIN)) / (1464 * S); }
  }
  mic = Math.min(MIC_MAX, mic);
  // the board: scale k about its centre (1374, 768), its left edge at L, centred between TOP and BOT
  const cx = ox + 1374 * S, cy = oy + 768 * S, bw = 1464 * k * S, bh = 1214 * k * S, bl = L, mid = (TOP + BOT) / 2, bottom = mid + bh / 2;
  const bx = (bl + bw / 2 - cx) / S, by = (mid - cy) / S;
  PB.k = k; PB.bx = bx; PB.by = by;
  root.setProperty('--pm-bk', k.toFixed(4)); root.setProperty('--pm-bx', px(bx)); root.setProperty('--pm-by', px(by));
  // the tutor: right of the board, feet on its bottom line; the bubble over its head; the mic flush right, below the bubble
  const tl = bl + bw + G, th = 680 * st * S, tt = bottom - th;
  PB.tutor = [(tl - ox) / S, (tt - oy) / S, st];
  const head = tl + 0.53 * tw(st);                                           // the bubble's tail points here (PC: 0.53 of the box)
  // the bubble's bottom 7 design px under the box top (PC) — but low enough that the jump button on its top edge (64 px,
  // centre 14 px above the edge) stays 8 px under the top bar
  const bTop = Math.max(tt + 7 * S - 330 * S, TOP + 42 + G + 46);
  root.setProperty('--pm-sc-x', px((head - ox) / S)); root.setProperty('--pm-sc-top', px((bTop - oy) / S));
  // a long word's bubble slides right to stay clear of the board, never past the right edge (style.css #sayCard)
  root.setProperty('--pm-sc-a', px((bl + bw + G - head) / S)); root.setProperty('--pm-sc-b', px((R - head) / S));
  PB.scRoom = R - (bl + bw + G);                                             // the widest bubble (main.ts shrinks a longer word)
  const micL = R - mic, micT = Math.max(bTop + 330 * S + 12, tt);            // below the bubble
  root.setProperty('--pm-mic', px(mic / S)); root.setProperty('--pm-mic-dx', px((micL - head) / S)); root.setProperty('--pm-mic-top', px((micT - bTop) / S));
}

/** a point on the screen (client px) → design px of the play stage */
export function toStage(stage: HTMLElement, cx: number, cy: number) {
  const r = stage.getBoundingClientRect();
  return { x: (cx - r.left) / S, y: (cy - r.top) / S };
}
/** an element's box in design px of the play stage */
export function boxIn(stage: HTMLElement, el: Element) {
  const r = stage.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: (b.left - r.left) / S, y: (b.top - r.top) / S, w: b.width / S, h: b.height / S, cx: (b.left + b.width / 2 - r.left) / S, cy: (b.top + b.height / 2 - r.top) / S };
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
