// The white glove from the other phonics games (Jenga's swipe hand). The fingertip sits at
// 37.8% across and 0.6% down, so a translate of (x - TIP_X, y - TIP_Y) plants the finger on a piece.
const base = new URL('./', location.href).href;
export const HAND_W = 200;
export const HAND_H = 200 * 320 / 240;
export const TIP_X = HAND_W * 0.378;
export const TIP_Y = HAND_H * 0.006;

export function finger(cls: string) {
  const el = document.createElement('img');
  el.className = cls;
  el.alt = '';
  el.draggable = false;
  el.src = `${base}art/hand.webp`;
  return el;
}
