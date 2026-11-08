// Dress up the tutor: buy items with the coins earned by saying the words, tap an owned one to wear / take it off.
import { sfx } from '../core/audio';
import { say } from '../core/speech';
import { commit, save } from '../core/store';
import type { Hud } from './hud';
import { ITEMS, type Item } from './items';
import { Tutor } from './tutor';

const base = new URL('./', location.href).href;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export class Shop {
  private tutor: Tutor;
  onWear: () => void = () => {};
  onClose: () => void = () => {};
  /** open → true, closed → false (main.ts ?tutor=3d: the stage's 3D tutor sleeps meanwhile) */
  onOpenChange: (open: boolean) => void = () => {};
  constructor(private hud: Hud, level: () => number) {
    this.tutor = new Tutor($('.shop-tutor-spot'), 'shop-t');
    this.tutor.level = level;
    this.tutor.place(-330 * 1.22, -360 * 1.22, 1.22, true);
    this.tutor.el.addEventListener('click', () => { this.tutor.act('hop'); void say(['t:look']); });
    $('#shopClose').addEventListener('click', () => this.close());
  }
  /** ?tutor=3d (main.ts): the dress room's tutor is the 3D one too and turns all the way round (user: "드레스룸에 있는 캐릭터도 인트로에 있는 튜터 캐릭터로 적용해야 360도 회전도 되는거 아냐? 그래야 망또도 확인하지") —
   *  no return to the front after a drag; it draws only while the shop is open */
  use3d(src: string) { this.is3d = true; this.tutor.use3d(src, { autoFront: false, paused: !this.open }); }
  /** ?tutor=3d: list the 3D-only items (headphones) */
  private is3d = false;
  get open() { return !$('#shop').hidden; }
  talk(on: boolean) { this.tutor.talk(on); }

  show() {
    $('#shop').hidden = false;
    $('#over').classList.add('dim');
    this.tutor.pause3d(false); this.onOpenChange(true);
    this.tutor.wear(save.worn);
    this.render();
    this.hud.coins(save.coins);
    this.tutor.act('hop');
    void say(['t:shop']);
  }
  close() {
    sfx('tap');
    $('#shop').hidden = true;
    $('#over').classList.remove('dim');
    this.tutor.pause3d(true); this.onOpenChange(false);
    this.onClose();
  }
  private render() {
    const grid = $('#shopGrid');
    grid.innerHTML = '';
    for (const it of ITEMS) if (!it.only3d || this.is3d) grid.appendChild(this.card(it));
  }
  private card(it: Item) {
    const owned = save.owned.includes(it.id), worn = save.worn[it.slot] === it.id;
    const b = document.createElement('button');
    b.className = `item${owned ? ' owned' : ''}${worn ? ' worn' : ''}${!owned && save.coins < it.price ? ' poor' : ''}`;
    b.dataset.id = it.id;
    b.setAttribute('aria-label', it.name);
    const art = it.src;
    const price = owned
      ? (worn ? '<svg viewBox="0 0 24 24" width="60" height="60" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19.5 7"/></svg>'
        : '<svg viewBox="0 0 24 24" width="62" height="62" fill="none" stroke="#6a5fb0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.2a1.9 1.9 0 1 1 1.9-1.9c0 1-.8 1.5-1.9 2.1v1.4l8.6 5.9c.9.6.5 2-.6 2H4c-1.1 0-1.5-1.4-.6-2L12 7.8"/></svg>')
      : `<img src="${base}art/coin.webp" alt="" draggable="false" /><span>${it.price}</span>`;
    b.innerHTML = `<span class="it-art"><img src="${art}" alt="" draggable="false" style="--icon:${it.icon}" /></span><span class="it-price">${price}</span>`;
    b.addEventListener('click', () => this.tap(it, b));
    return b;
  }
  private tap(it: Item, el: HTMLElement) {
    const owned = save.owned.includes(it.id);
    let mode: 'buy' | 'wear' = 'wear';
    if (!owned) {
      if (save.coins < it.price) {
        sfx('bad');
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
        this.tutor.act('shy');
        void say(['t:poor']);
        return;
      }
      save.coins -= it.price;
      save.owned.push(it.id);
      save.worn[it.slot] = it.id;
      commit();
      sfx('buy');
      this.hud.coins(save.coins, true);
      mode = 'buy';
      void say(['t:thanks']);
    } else if (save.worn[it.slot] === it.id) {
      delete save.worn[it.slot];
      commit();
      sfx('tap');
    } else {
      save.worn[it.slot] = it.id;
      commit();
      sfx('pop');
      if (Math.random() < 0.5) void say(['t:look']);
    }
    this.tutor.wear(save.worn, mode);   // the item's own entrance + the tutor's reaction (tutor.ts MOTION); off = flies away
    this.onWear();
    this.render();
  }
}
