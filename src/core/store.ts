// What this device remembers: coins (from saying the words), the highest level reached, the tutor's wardrobe.
const KEY = 'pm-save-v1';
export interface Save { coins: number; level: number; best: Record<string, number>; owned: string[]; worn: Record<string, string>;
  /** the board theme last picked + the other themes' levels (`level` / `best['n']` stay the animals', `best['objects:n']` …) */
  theme?: string; levels?: Record<string, number> }
const fresh = (): Save => ({ coins: 0, level: 1, best: {}, owned: ['gradcap'], worn: { head: 'gradcap' } });

export const save: Save = (() => {
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh(); }
})();
const listeners: (() => void)[] = [];
export const onSave = (f: () => void) => { listeners.push(f); };
export function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode: keeps working for this session */ }
  listeners.forEach((f) => f());
}
// The medal was taken out of the shop. Give the coins back once, and take it off if it was worn.
if (save.owned.includes('medal') || save.worn.neck === 'medal') {
  if (save.owned.includes('medal')) save.coins += 50;
  save.owned = save.owned.filter((id) => id !== 'medal');
  if (save.worn.neck === 'medal') delete save.worn.neck;
  commit();
}
export function addCoins(n: number) { save.coins = Math.max(0, save.coins + n); commit(); }
export function resetSave() { Object.assign(save, fresh()); commit(); }
