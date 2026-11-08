// Tutor language: Korean guide lines by default (the concept video narrates in Korean); English is the other choice.
// Letter sounds and words are English either way.
export type Lang = 'ko' | 'en';
const KEY = 'pm-lang';
let cur: Lang = (() => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; } })();
const listeners: ((l: Lang) => void)[] = [];
export const lang = () => cur;
export const onLang = (f: (l: Lang) => void) => { listeners.push(f); };
export function setLang(l: Lang) {
  if (l === cur) return;
  cur = l;
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f(l));
}
