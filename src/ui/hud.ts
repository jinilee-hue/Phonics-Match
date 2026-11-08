// The game HUD: the coins under the logo; level progress, the Phonics Mission icons and moves left in the card under
// them (index.html .mcard).
import { ANIMALS } from '../data/animals';
import { animalSrc } from '../game/board';

export interface Goal { k: number; need: number; got: number }
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export class Hud {
  private coinsShown = 0;
  level(n: number) { $('#lvNum').textContent = String(n); }
  progress(f: number) {
    const fill = $('#lvFill');
    fill.classList.toggle('zero', f <= 0);
    fill.style.width = `calc(${Math.max(0, Math.min(1, f)) * 100}% - 8px)`;
  }
  moves(n: number) {
    const el = $('#movesNum');
    el.textContent = String(n);
    el.classList.toggle('warn', n <= 3);
  }
  coins(n: number, bump = false) {
    this.coinsShown = n;
    for (const id of ['#coinNum', '#coinNumS']) { const e = document.querySelector(id); if (e) e.textContent = n.toLocaleString('en-US'); }
    if (bump) for (const e of document.querySelectorAll<HTMLElement>('.coin-track, .coin-pill')) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
  }
  get shownCoins() { return this.coinsShown; }
  coinTarget() { return $('.coin-track .coin-ico'); }   // the game HUD's coin (the title has no coin counter)

  goals(goals: Goal[], into = $('#goals')) {
    into.innerHTML = '';
    for (const g of goals) {
      const a = ANIMALS[g.k];
      const d = document.createElement('div');
      d.className = `goal${g.got >= g.need ? ' done' : ''}`; d.dataset.k = String(g.k);
      d.style.setProperty('--c', a.color);
      d.innerHTML = `<img src="${animalSrc(g.k)}" alt="${a.word}" draggable="false" /><b class="gn">${Math.max(0, g.need - g.got)}</b>`;
      into.appendChild(d);
    }
  }
  goalEl(k: number) { return document.querySelector<HTMLElement>(`#goals .goal[data-k="${k}"]`); }
  hitGoal(g: Goal) {
    const el = this.goalEl(g.k); if (!el) return;
    el.querySelector('.gn')!.textContent = String(Math.max(0, g.need - g.got));
    el.classList.toggle('done', g.got >= g.need);
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  }
}
