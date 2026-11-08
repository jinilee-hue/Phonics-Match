// Title and game corner buttons. The speaker is a mute toggle: one tap silences everything and the icon
// switches to the crossed-out speaker; the next tap brings the previous volume back. The title's exit leaves the page,
// the game's goes back to the title.
import { setVolume, settings, sfx, unlock } from '../core/audio';
import { stopSpeech } from '../core/speech';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

function bindMute() {
  let remembered = settings.volume > 0 ? settings.volume : 1;
  const paint = () => {
    const muted = settings.volume === 0;
    document.querySelectorAll<HTMLButtonElement>('.sound-btn').forEach((btn) => {
      btn.classList.toggle('muted', muted);
      btn.setAttribute('aria-pressed', String(muted));
      btn.setAttribute('aria-label', muted ? '음소거 해제' : '음소거');
    });
  };
  document.querySelectorAll<HTMLButtonElement>('.sound-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      unlock();
      if (settings.volume > 0) {
        remembered = settings.volume;
        sfx('tap');
        setVolume(0);
      } else {
        setVolume(remembered > 0 ? remembered : 1);
        sfx('tap');
      }
      paint();
    });
  });
  paint();
  return paint;
}

/** back to the previous page (a launcher) when there is one; with none it stays — window.close() shut a fresh tab
 *  (user: "화면 또 닫혔어" → "타이틀 나가기는 탭을 닫지 않게") */
function bindExit(btn: HTMLElement) {
  btn.addEventListener('click', () => {
    sfx('tap');
    stopSpeech();
    if (history.length > 1) { history.back(); setTimeout(() => location.reload(), 700); }
  });
}

/** Title and game speaker buttons mute on tap; the title's exit leaves the page, the game's goes to the title
 *  (user: "게임 화면 나가기는 타이틀로"). */
export function titleControls(o: { toTitle: () => void }) {
  const paint = bindMute();
  bindExit($('#btnExit'));
  $('#btnExitGame').addEventListener('click', () => { sfx('tap'); stopSpeech(); o.toTitle(); });
  return { close() {}, sync: paint };
}
