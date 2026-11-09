import './style.css';
import { audioCtx, setVolume, sfx, startMusic, unlock, voiceLevel, voiceNow } from './core/audio';
import { lang, onLang, setLang } from './core/lang';
import { fakeMic } from './core/listen';
import { micTest } from './core/mic';
import { onLineTimes, onTalk, said, say, stopSpeech } from './core/speech';
import { sttPreload, sttState } from './core/stt';
import { addCoins, commit, save } from './core/store';
import { coinSrc, Game } from './game/game';
import { Fx } from './ui/fx';
import { Hud } from './ui/hud';
import { Shop } from './ui/shop';
import { fitStage, wait, boxIn } from './ui/stage';
import { Title } from './ui/title';
import { titleControls } from './ui/corner';
import { Demo } from './ui/demo';
import { Tutor } from './ui/tutor';
import { allOf, setTheme, theme, THEME_IDS, type Theme } from './data/animals';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const params = new URLSearchParams(location.search);
const base = new URL('./', location.href).href;
/** when the three theme names start in the tutor's "pick one" line (s after the line starts; measured on
 *  public/voice/{k,t}_theme.mp3 — re-measure if the line is rebuilt) */
const THEME_BEATS: Record<string, number[]> = { ko: [0, 0.85, 1.58], en: [0, 0.92, 2.0] };   // names at ko 0.11 / 0.95 / 1.68 s,
// en 0.11 / 1.02 / 2.10 s; each hop starts 0.1 s before so it is up as the name is said (scratch pm/theme_beats.py)
const app = $('#app');

// where the tutor stands (stage px of its art's top-left, scale): the mockups' spots; on the title 150 lower and 30 left
// (user: "인트로에서 튜터 캐릭터도 좀 밑으로 내려야할거 같아 지금은 숲 위에 떠있어서") — feet on the ground in front of the
// bushes, its dress-up button 28 px clear of SKIP and its fur 98 px clear of the demo board (16:9)
const SPOT = { title: [1887, 754, 1], game: [2085, 670, 1.04] } as const;   // game: feet on the board's bottom line 1375 (was 793; user: "캐릭터와 단어 말풍선 조금 위로")

async function loadFonts() {
  const f = new FontFace('Baloo', `url(${base}fonts/Baloo2.woff2) format('woff2')`, { weight: '400 800' });
  try { document.fonts.add(await f.load()); } catch (e) { console.warn('font', e); }
}
function preloadImages(urls: string[]) {
  return Promise.all(urls.map((u) => new Promise<void>((res) => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = u; })));
}

async function boot() {
  document.documentElement.style.setProperty('--bg-title', `url(${base}art/bg_title.webp)`);
  document.documentElement.style.setProperty('--bg-game', `url(${base}art/bg_game.webp)`);
  const stage = $('#stage'), hudEl = $('#hud'), over = $('#over');
  fitStage(stage, hudEl, over);
  await Promise.race([Promise.all([loadFonts(), preloadImages([`${base}art/bg_title.webp`, `${base}art/logo.webp`, `${base}art/tutor_body.webp`])]), wait(6000)]);

  const fx = new Fx($<HTMLCanvasElement>('#fx'), $('#fxDom'), stage);
  const hud = new Hud();
  const tutor = new Tutor(stage);
  // ?tutor=3d: the code-built 3D tutor instead of the body art (preview; user: "게임화면에 적용해서 볼께") — needs the 3D server
  // dev: the live 3D project on :5198; the build: its copy in public/t3d (tools/sync_t3d.sh). top: room for crown / party hat / bunny ears
  const t3dSrc = params.get('tutor') === '3d' ? params.get('t3d') ?? (import.meta.env.DEV ? 'http://127.0.0.1:5198/embed.html?top=130' : './t3d/embed.html?top=130') : null;
  if (t3dSrc) tutor.use3d(t3dSrc);
  tutor.level = voiceLevel;
  tutor.wear(save.worn);
  const shop = new Shop(hud, voiceLevel);
  if (t3dSrc) { shop.use3d(t3dSrc); shop.onOpenChange = (open) => tutor.pause3d(open); }   // the dress room's tutor is 3D too (user: "드레스룸에 있는 캐릭터도 인트로에 있는 튜터 캐릭터로 적용해야 360도 회전도 되는거 아냐? 그래야 망또도 확인하지")
  onTalk((on) => { tutor.talk(on); shop.talk(on); });
  const title = new Title($('#title'), fx);
  const demo = new Demo($('#title'), fx, tutor, title);
  hud.coins(save.coins);
  void preloadImages(THEME_IDS.flatMap((t) => allOf(t)).map((a) => `${base}${a.img}`));   // every theme's pictures: the board changes per unit / level / theme
  // the speech recogniser (~29 MB) starts downloading on the title, not on PLAY, so the first say-it turns don't meet it
  // still loading (it waits for it then; any voice used to pass meanwhile)
  setTimeout(() => sttPreload(), 1500);

  const place = (where: keyof typeof SPOT, instant = false) => { const [x, y, s] = SPOT[where]; tutor.place(x, y, s, instant); };
  place('title', true);

  const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
  const game = new Game(hud, fx, tutor, {
    result: (win, stars, coins) => showResult(win, stars, coins),
    log: params.has('log') ? (s) => console.log('[pm]', s) : undefined,
  }, seed);
  fakeMic.on = params.has('fake');

  // ── screens ──────────────────────────────────────────────────────────────────────────────────────────
  const screen = (s: 'title' | 'game') => { app.dataset.screen = s; };
  const toTitle = () => {
    game.stopAll();
    closeCards();
    screen('title'); place('title');
    title.start(); demo.start();
    tutor.act('hop');
  };
  const toGame = (n: number) => {
    closeCards();
    screen('game'); place('game');
    title.stop(); demo.stop();
    void game.start(n);
  };
  { const t0 = (params.get('theme') ?? save.theme ?? 'animals') as Theme; if (THEME_IDS.includes(t0)) setTheme(t0); }   // ?theme= for QA
  title.start(); demo.start();

  // first touch anywhere on the title: sound on + hello (browsers keep audio off until then)
  let greeted = false;
  const hello = () => {
    if (greeted || app.dataset.screen !== 'title') return;
    greeted = true;
    void startMusic();
    void demo.narrate();          // hello, then how to play on the demo board (ui/demo.ts)
  };
  const firstTouch = (e: Event) => {
    window.removeEventListener('pointerdown', firstTouch, true);
    unlock();
    if ((e.target as Element | null)?.closest?.('#btnPlay, .skip-btn, #btnDress')) { greeted = true; return; }   // (SKIP on the quiet demo, dress up: no hello)
    hello();
  };
  window.addEventListener('pointerdown', firstTouch, true);
  demo.onSkip = () => { greeted = true; void startMusic(); };
  window.addEventListener('pointerdown', () => { if (app.dataset.screen === 'title') demo.poke(); });   // the quiet replay waits

  $('#btnPlay').addEventListener('click', () => {
    unlock(); sfx('start'); void startMusic(); sttPreload();
    greeted = true;
    stopSpeech();
    if (params.has('level')) { toGame(Number(params.get('level'))); return; }
    openThemes();                     // pick animals / things / fruits first
  });
  tutor.el.addEventListener('click', () => {
    unlock();
    // while the tutor explains the demo a tap only makes it hop (a new line would cut the explanation)
    if (app.dataset.screen === 'title') { hello(); tutor.act('hop'); if (!demo.talking) void say([Math.random() < 0.5 ? 't:hello' : 't:look']); }
    else if (game.state === 'play') { tutor.act('wiggle'); }
  });

  // ── pause / settings ────────────────────────────────────────────────────────────────────────────────
  const cards = ['#intro', '#pause', '#settings', '#result', '#themes'];
  function closeCards() { cards.forEach((c) => { $(c).hidden = true; }); over.classList.remove('dim'); }
  const openCard = (sel: string) => { closeCards(); $(sel).hidden = false; $(sel).classList.remove('out'); over.classList.add('dim'); };
  // the theme card (user: "타이틀에서 테마 선택 (동물 · 사물 · 과일)" → "테마 고르고 나서 play 버튼 있어야 하는거 아냐?그리고 안내도 해야지. 테마를 고를수 있다는"): PLAY opens it; a picture only picks the theme (the
  // orange ring moves, the picture pops) and the green Play starts it at its own level. As the card opens the tutor says
  // "동물, 사물, 과일 중에 하나를 골라 봐!" and each picture hops as its name is said; the first pick → "플레이 버튼을 눌러 봐!"
  // and Play pulses. The title's quiet demo waits while the card is up.
  const levelFor = (t: Theme) => (t === 'animals' ? save.level : save.levels?.[t] ?? 1);
  let picked: Theme = theme, toldPlay = false;
  const themeRow = $('#themes .th-row'), themeGo = $('#themes .th-go');
  const markPicked = () => document.querySelectorAll<HTMLElement>('#themes .th-btn').forEach((b) => b.classList.toggle('on', b.dataset.theme === picked));
  const hopThemes = () => { themeRow.classList.remove('guide'); void themeRow.offsetWidth; themeRow.classList.add('guide'); };
  onLineTimes((times, now) => {
    const t = times.find((x) => x.key === 't:theme');
    if (!t || $('#themes').hidden) return;
    (THEME_BEATS[lang()] ?? THEME_BEATS.en).forEach((s, i) => themeRow.style.setProperty(`--d${i + 1}`, `${s}s`));
    window.setTimeout(hopThemes, Math.max(0, (t.at - now) * 1000));
  });
  const openThemes = () => {
    picked = theme; toldPlay = false; markPicked();
    themeGo.classList.remove('call'); themeRow.classList.remove('guide');
    openCard('#themes');
    demo.stop();
    tutor.act('nod');
    void say(['t:theme']);
  };
  $('#themes').addEventListener('click', (e) => {
    const el = e.target as Element;
    if (el.closest('[data-act="close"]')) { sfx('tap'); stopSpeech(); closeCards(); if (app.dataset.screen === 'title') demo.start(); return; }
    if (el.closest('[data-act="go"]')) {
      sfx('start'); stopSpeech();
      setTheme(picked); save.theme = picked; commit();
      toGame(levelFor(picked));
      return;
    }
    const b = el.closest<HTMLElement>('.th-btn');
    if (!b) return;
    picked = b.dataset.theme as Theme;
    sfx('tap'); markPicked(); themeRow.classList.remove('guide');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    if (!toldPlay) { toldPlay = true; themeGo.classList.add('call'); void say(['t:pressplay']); }
  });
  $('#pause').addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    sfx('tap'); closeCards();
    if (act === 'resume') game.resume();
    else if (act === 'restart') toGame(game.n);
    else if (act === 'home') toTitle();
  });
  let settingsFrom = 'title' as 'game' | 'title';   // only the title opens the settings now; the cast keeps the 'game' check type-correct
  $('#vol').addEventListener('input', (e) => { setVolume(Number((e.target as HTMLInputElement).value) / 100); corner.sync(); });
  $('#vol').addEventListener('change', () => sfx('tap'));
  const langBtn = $<HTMLButtonElement>('#btnLang');
  const paintLang = () => {
    const ko = lang() === 'ko';
    langBtn.textContent = ko ? '한글' : 'EN';
    langBtn.setAttribute('aria-label', ko ? '한글, 영어로 바꾸기' : 'English, switch to Korean');
  };
  const syncLang = () => {
    paintLang();
    document.querySelectorAll<HTMLElement>('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.l === lang())));
  };
  onLang(paintLang);
  paintLang();
  langBtn.addEventListener('click', () => {
    unlock(); setLang(lang() === 'ko' ? 'en' : 'ko'); syncLang(); sfx('tap'); void say(['t:look']);
  });
  document.querySelectorAll<HTMLElement>('.seg button').forEach((b) => b.addEventListener('click', () => {
    setLang(b.dataset.l as 'ko' | 'en'); syncLang(); sfx('tap'); void say(['t:look']);
  }));
  $('#settings').addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-act="close"]')) { sfx('tap'); closeCards(); if (settingsFrom === 'game') game.resume(); }
  });

  // ── level result ────────────────────────────────────────────────────────────────────────────────────
  async function showResult(win: boolean, stars: number, coins: number) {
    await wait(win ? 900 : 700);
    const r = $('#result');
    r.classList.toggle('clear', win); r.classList.toggle('fail', !win);
    r.querySelector('.rs-title')!.textContent = win ? 'Mission Clear!' : 'Out of Moves!';
    r.querySelectorAll('.rs-stars i').forEach((s) => s.classList.remove('on'));
    (r.querySelector('.rs-coins') as HTMLElement).hidden = !win;
    r.querySelector('.rs-n')!.textContent = `+${coins}`;
    openCard('#result');
    if (!win) return;
    for (let i = 0; i < stars; i++) {
      await wait(330);
      r.querySelectorAll('.rs-stars i')[i].classList.add('on'); sfx('star', i);
    }
    await wait(400);
    const from = boxIn(stage, r.querySelector('.rs-coins')!);
    await fx.coins(Math.min(coins, 20), from.cx, from.cy, hud.coinTarget(), coinSrc(), (i) => {
      addCoins(i < Math.min(coins, 20) - 1 ? Math.floor(coins / Math.min(coins, 20)) : coins - Math.floor(coins / Math.min(coins, 20)) * (Math.min(coins, 20) - 1));
      hud.coins(save.coins, true); sfx('coin');
    });
  }
  $('#result').addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    sfx('tap'); closeCards();
    if (act === 'next') { void say(['t:next']); toGame(game.n + 1); }
    else if (act === 'retry') toGame(game.n);
    else if (act === 'home') toTitle();
    else if (act === 'shop') { shop.onClose = () => { shop.onClose = () => {}; openCard('#result'); }; shop.show(); }
  });

  // ── shop + the title's sound / exit buttons ─────────────────────────────────────────────────────────
  const corner = titleControls({ toTitle });
  shop.onWear = () => tutor.wear(save.worn);
  // dress up: one round button fixed to the tutor's lower right on both screens (user: "옷걸이 버튼은 캐릭터 우측 하단에
  // 고정으로 별도로 넣는게 좋겠어 원 버튼으로") — a child of the tutor, so it goes where the tutor goes but not with its hops
  // (those move .t-rig); spot in style.css (.dress-btn)
  const dress = document.createElement('button');
  dress.id = 'btnDress'; dress.className = 'round-btn dress-btn'; dress.setAttribute('aria-label', 'Dress up');
  dress.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 6.2a1.9 1.9 0 1 1 1.9-1.9c0 1-.8 1.5-1.9 2.1v1.4l8.6 5.9c.9.6.5 2-.6 2H4c-1.1 0-1.5-1.4-.6-2L12 7.8" /></svg>';
  tutor.el.appendChild(dress);
  const onDress = (e: Event) => {
    e.stopPropagation();                          // not a tap on the tutor
    unlock(); sfx('tap');
    if (app.dataset.screen === 'title') {
      greeted = true;
      demo.stop();                                // the demo board goes down while dressing up; back on close
      shop.onClose = () => { shop.onClose = () => {}; if (app.dataset.screen === 'title') demo.start(); };
    } else {
      game.pause();
      shop.onClose = () => { shop.onClose = () => {}; if (app.dataset.screen === 'game') game.resume(); };
    }
    shop.show();
  };
  dress.addEventListener('click', onDress);
  // the game screen's: a rounded box next to the coins (index.html #btnDressGame; the round one is hidden there)
  $('#btnDressGame').addEventListener('click', onDress);

  // ── done loading ────────────────────────────────────────────────────────────────────────────────────
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading').remove(), 500);
  if (params.has('play')) { unlock(); toGame(params.has('level') ? Number(params.get('level')) : levelFor(theme)); }

  // test / debug hooks
  Object.assign(window, { __pm: { setTheme, game, fx, hud, tutor, shop, title, save, commit, said, say, sttState, micTest, fakeMic, toTitle, toGame, showResult, audioCtx, voiceNow, demo } });
}

void boot();
