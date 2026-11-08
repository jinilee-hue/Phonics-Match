// The design stage is the mockups' own pixel grid (2752×1536). It is scaled to fit the window; the HUD hangs from the
// window's top edge (its panels are drawn attached to the top), the play stage is centred in the window.
// On a window wider than 16:9 the HUD also spans the empty side bands (CSS reads --hud-band, design px a side), so the
// logo and the exit button keep the same margins from the window's sides as from its top (user: "파닉스 로고 왼쪽에 여백와
// 나가기 버튼 우측에 여백이 넓어 줄여줘" — hung from the stage, the whole band was margin). The panels between them stretch
// by --hud-grow (≤ HUD_GROW); beyond that the row stays centred between the logo and the buttons.
export const DW = 2752, DH = 1536;
const HUD_GROW = 240;
export let S = 1;
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
    listeners.forEach((f) => f());
  };
  fit();
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
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
