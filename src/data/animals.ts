// The board's five kinds come from one FPR K unit at a time, in textbook order (user: "교재 Unit 순서대로 판 구성 …
// U1 m a s t p → U2 i c f d + 앞 글자 복습 1 → U3 h o r b l → U4 k e g w x → U6 z + 복습. 같은 글자 동물(monkey/mouse 등)은
// 레벨마다 번갈아"): six levels per unit, then the units again with generated missions.
// Textbook words only (user: "모든건 다 교재기반이어야해", "교재 k레벨에 없는 동물은 빼고 있는걸로만 넣어줘"): all 28 are FPR K
// words (scratch pm/fprk_alpha.py → the textbook ledger); the mockup's alligator and snake are out. FPR K has no animal
// for n (Unit 2) nor for v u j qu y (Unit 5 — skipped), so Unit 2's fifth slot and Unit 6's last four take letters of
// earlier units (review). x = the FINAL sound of fox (the textbook's Xx lesson: box, fox).
// worm is out (user: "worm 단어는 게임에서 빼자 모양이 이상한데"), so are rabbit and kangaroo, whose big ears kept their
// faces small (user: "동물들 얼굴 사이즈가 다 제각각이라 귀가 큰 캥거루와 토끼는 빼도 될까?"): r keeps rat; w and k have no other FPR K animal, so Unit 4 = e g x + two review slots.
// Colours = the mockup's five letter-badge colours (M pink, A green, S purple, T orange, P blue) by board SLOT, so every
// board shows five different colours; `tone` names the slot's colour class (.badge.m … .badge.p in style.css).
export type Tone = 'm' | 'a' | 's' | 't' | 'p';
export interface Animal { id: string; word: string; letter: string; color: string; deep: string; tone: Tone; img: string }
const TONES: [Tone, string, string][] = [['m', '#f2558c', '#c02a63'], ['a', '#5cc84a', '#2f9431'], ['s', '#a55df0', '#7432c4'],
  ['t', '#ff9b2f', '#d8680c'], ['p', '#32a6f2', '#1474c4']];
/** the board themes (user: "동물 과일 사물 세가지 컨셉으로", picked on the title: "타이틀에서 테마 선택 (동물 · 사물 · 과일)"): per letter its FPR K words in
 *  turn order + one board per unit ('' = a review slot, filled with a letter of an earlier unit). Pictures =
 *  art/<prefix>_<word>.webp (Cursor's 3D clay set). Check: python3 tools/check_fprk.py */
export type Theme = 'animals' | 'objects' | 'fruit';
export const THEME_IDS: Theme[] = ['animals', 'objects', 'fruit'];
type Unit = { unit: number; slots: string[] };
const THEMES: Record<Theme, { prefix: string; letters: Record<string, string[]>; units: Unit[] }> = {
  animals: { prefix: 'a', letters: {
    m: ['monkey', 'mouse'], a: ['ant'], s: ['seal'], t: ['tiger', 'turtle'], p: ['pig', 'puppy'],
    i: ['iguana'], c: ['cat', 'cow'], f: ['fish'], d: ['duck', 'dog'],
    h: ['hen', 'horse'], o: ['octopus'], r: ['rat'], b: ['bear', 'bee'], l: ['lion'],
    e: ['elephant'], g: ['goat'], x: ['fox'],
    z: ['zebra'],
  }, units: [
    { unit: 1, slots: ['m', 'a', 's', 't', 'p'] },
    { unit: 2, slots: ['i', 'c', 'f', 'd', ''] },
    { unit: 3, slots: ['h', 'o', 'r', 'b', 'l'] },
    { unit: 4, slots: ['e', 'g', 'x', '', ''] },
    { unit: 6, slots: ['z', '', '', '', ''] },
  ] },
  // things: a set for every unit — but no o-thing in FPR K (Unit 3's fifth slot reviews); engine / wagon have no recording
  // yet (no FPR K or Constella clip, the company TTS is off-VPN), so e = egg, w = window for now
  objects: { prefix: 'o', letters: {
    m: ['mug', 'mop'], a: ['ax'], s: ['sock', 'soap'], t: ['tent', 'table'], p: ['pencil', 'pot'],
    n: ['net', 'nail'], i: ['ink'], c: ['cup', 'car'], f: ['fan', 'fork'], d: ['doll', 'door'],
    h: ['hat'], r: ['ring', 'robot'], b: ['ball', 'bus'], l: ['lamp', 'lock'],
    k: ['kite', 'key'], e: ['egg'], g: ['gift'], w: ['window'], x: ['box'],
    v: ['van', 'violin'], u: ['umbrella'], j: ['jet', 'jar'], qu: ['quilt'], y: ['yarn'],
    z: ['zipper'],
  }, units: [
    { unit: 1, slots: ['m', 'a', 's', 't', 'p'] },
    { unit: 2, slots: ['n', 'i', 'c', 'f', 'd'] },
    { unit: 3, slots: ['h', 'r', 'b', 'l', ''] },
    { unit: 4, slots: ['k', 'e', 'g', 'w', 'x'] },
    { unit: 5, slots: ['v', 'u', 'j', 'qu', 'y'] },
    { unit: 6, slots: ['z', '', '', '', ''] },
  ] },
  // fruit: FPR K has one board's worth
  fruit: { prefix: 'f', letters: { a: ['apple'], g: ['grape'], l: ['lemon'], p: ['peach', 'pear'], w: ['watermelon'] },
    units: [{ unit: 1, slots: ['a', 'g', 'l', 'p', 'w'] }] },
};
const IMG: Record<string, string> = { egg: 'f_egg' };             // a picture of another set
/** the theme on the board now (setTheme) */
export let theme: Theme = 'animals';
let LETTERS = THEMES.animals.letters;
/** the theme's boards, one per unit */
export const UNITS: Unit[] = [...THEMES.animals.units];
export const PER_UNIT = 6;
const make = (id: string, letter: string, slot: number, t: Theme = theme): Animal => {
  const [tone, color, deep] = TONES[slot]!;
  return { id, word: id, letter, tone, color, deep, img: `art/${IMG[id] ?? `${THEMES[t].prefix}_${id}`}.webp` };
};
/** every word of a theme once, in its home slot's colour (preload, the title demo, QA) */
export const allOf = (t: Theme): Animal[] =>
  THEMES[t].units.flatMap((u) => u.slots.flatMap((l, i) => (l ? THEMES[t].letters[l]!.map((id) => make(id, l, i, t)) : [])));
/** the current theme's words (rivals) */
export const ALL_ANIMALS: Animal[] = allOf('animals');
/** the five on the board now (index = slot) */
export const ANIMALS: Animal[] = [];
let turn = Math.random() < 0.5 ? 0 : 1;
/** tests (?seed=): a fixed start */
export function animalTurn(seed: number) { turn = Math.abs(Math.round(seed)) % 2; useLevelAnimals(1); }
/** level n → its unit board: Units 1, 2, 3, 4, 6 for six levels each, then one unit per level, round and round */
export function unitIndex(n: number) {
  const i = Math.max(1, Math.round(n)) - 1, span = UNITS.length * PER_UNIT;
  return i < span ? Math.floor(i / PER_UNIT) : (i - span) % UNITS.length;
}
/** the review letters of unit k's empty slots (another each level): Unit 2 → one Unit 1 letter; Unit 4 → one of Unit 2 and one of
 *  Unit 3; Unit 6 → one letter from
 *  each of Units 1, 2, 3, 4 */
function review(n: number, k: number): string[] {
  const groups = UNITS.slice(0, k).map((u) => u.slots.filter(Boolean));
  const empty = UNITS[k]!.slots.filter((l) => !l).length;
  if (!empty) return [];
  if (empty === 1) { const all = groups.flat(); return [all[(n - 1) % all.length]!]; }
  return groups.slice(-empty).map((g, j) => g[(n - 1 + j) % g.length]!);
}
/** level n's five: its unit's letters (+ review letters); a letter with two animals takes them in turn */
export function useLevelAnimals(n: number) {
  const k = unitIndex(n), u = UNITS[k]!, rv = review(n, k);
  let r = 0;
  u.slots.forEach((l, i) => {
    const letter = l || rv[r++]!;
    const ids = LETTERS[letter]!;
    ANIMALS[i] = make(ids[(n + turn) % ids.length]!, letter, i);
  });
  ANIMALS.length = u.slots.length;
}
useLevelAnimals(1);
/** switch the board set (the title's theme card) */
export function setTheme(t: Theme) {
  theme = t; LETTERS = THEMES[t].letters;
  UNITS.splice(0, UNITS.length, ...THEMES[t].units);
  ALL_ANIMALS.splice(0, ALL_ANIMALS.length, ...allOf(t));
  useLevelAnimals(1);
}
/** the word split round its letter for the say card: [before, letter, after] (x is fox's last letter) */
export const splitWord = (a: Animal): [string, string, string] => {
  const i = a.word.startsWith(a.letter) ? 0 : Math.max(0, a.word.lastIndexOf(a.letter));   // qu: two letters
  return [a.word.slice(0, i), a.word.slice(i, i + a.letter.length), a.word.slice(i + a.letter.length)];
};

/** what the child may say for each word (the recogniser's spellings + the sound-sound-word chant) */
export const ALTS: Record<string, string[]> = {
  monkey: ['monkeys', 'Mm, mm, monkey', 'M, m, monkey', 'Mmm, monkey'],
  mouse: ['mice', 'Mm, mm, mouse', 'M, m, mouse', 'Mmm, mouse'],
  ant: ['ants', 'aunt', 'Ah, ah, ant', 'A, a, ant'],
  seal: ['seals', 'Sss, sss, seal', 'S, s, seal', 'Ss, seal'],
  tiger: ['tigers', 'T, t, tiger', 'Tuh, tuh, tiger'],
  turtle: ['turtles', 'T, t, turtle', 'Tuh, tuh, turtle'],
  pig: ['pigs', 'P, p, pig', 'Puh, puh, pig'],
  puppy: ['puppies', 'P, p, puppy', 'Puh, puh, puppy'],
  iguana: ['iguanas', 'I, i, iguana', 'Ih, ih, iguana'],
  cat: ['cats', 'C, c, cat', 'K, k, cat', 'Kuh, kuh, cat'],
  cow: ['cows', 'C, c, cow', 'K, k, cow', 'Kuh, kuh, cow'],
  fish: ['fishes', 'F, f, fish', 'Fff, fff, fish', 'Ff, fish'],
  duck: ['ducks', 'D, d, duck', 'Duh, duh, duck'],
  dog: ['dogs', 'D, d, dog', 'Duh, duh, dog'],
  hen: ['hens', 'H, h, hen', 'Huh, huh, hen', 'Ha, ha, hen'],
  horse: ['horses', 'H, h, horse', 'Huh, huh, horse', 'Ha, ha, horse'],
  octopus: ['octopuses', 'O, o, octopus', 'Ah, ah, octopus', 'Aw, aw, octopus'],
  rat: ['rats', 'R, r, rat', 'Rrr, rrr, rat', 'Ruh, ruh, rat'],
  bear: ['bears', 'B, b, bear', 'Buh, buh, bear'],
  bee: ['bees', 'B', 'B, b, bee', 'Buh, buh, bee'],
  lion: ['lions', 'L, l, lion', 'Lll, lll, lion', 'Luh, luh, lion'],
  elephant: ['elephants', 'E, e, elephant', 'Eh, eh, elephant'],
  goat: ['goats', 'G, g, goat', 'Guh, guh, goat'],
  fox: ['foxes', 'X, x, fox', 'Ks, ks, fox'],
  zebra: ['zebras', 'Z, z, zebra', 'Zzz, zzz, zebra', 'Zee, zee, zebra'],
};
// things and fruit: the plural (+ spellings whisper writes) and the letter's name / sound chants, as for the animals
const CHANT: Record<string, string[]> = { m: ['M, m', 'Mm, mm'], a: ['A, a', 'Ah, ah'], s: ['S, s', 'Sss, sss'], t: ['T, t', 'Tuh, tuh'],
  p: ['P, p', 'Puh, puh'], n: ['N, n', 'Nn, nn'], i: ['I, i', 'Ih, ih'], c: ['C, c', 'K, k', 'Kuh, kuh'], f: ['F, f', 'Fff, fff'],
  d: ['D, d', 'Duh, duh'], h: ['H, h', 'Huh, huh'], r: ['R, r', 'Rrr, rrr'], b: ['B, b', 'Buh, buh'], l: ['L, l', 'Lll, lll'],
  k: ['K, k', 'Kuh, kuh'], e: ['E, e', 'Eh, eh'], g: ['G, g', 'Guh, guh'], w: ['W, w', 'Wuh, wuh'], x: ['X, x', 'Ks, ks'],
  v: ['V, v', 'Vvv, vvv'], u: ['U, u', 'Uh, uh'], j: ['J, j', 'Juh, juh'], qu: ['Q, q', 'Kwuh, kwuh'], y: ['Y, y', 'Yuh, yuh'],
  z: ['Z, z', 'Zzz, zzz'] };
const SPELL: Record<string, string[]> = { ax: ['axe', 'axes'], box: ['boxes'], bus: ['buses'], peach: ['peaches'], pear: ['pears', 'pair'],
  key: ['keys'] };
for (const t of ['objects', 'fruit'] as Theme[])
  for (const [l, ws] of Object.entries(THEMES[t].letters)) for (const w of ws) ALTS[w] ??= [...(SPELL[w] ?? [`${w}s`]), ...CHANT[l]!.map((c) => `${c}, ${w}`)];
/** the words that must NOT count for `word`: the other animals on the board now, and any animal sharing its letter
 *  (with its chant forms — against plain words the shared letter sounds won the chant for the wrong animal,
 *  tools/qa/word_check.ts) */
export const rivalsOf = (word: string, board: Animal[] = ANIMALS) => {
  const me = ALL_ANIMALS.find((a) => a.word === word);
  const out = new Set(board.filter((a) => a.word !== word).map((a) => a.word));
  for (const a of ALL_ANIMALS) if (a.word !== word && a.letter === me?.letter) [a.word, ...(ALTS[a.word] ?? [])].forEach((w) => out.add(w));
  return [...out];
};

export interface Level { moves: number; goals: [number, number][] /* [slot, count] */; bias: number }
// each unit's six: every level brings in its letters (slots), like Unit 1 always did
const INTRO: Level[] = [
  { moves: 15, goals: [[0, 6]], bias: 0.12 },
  { moves: 15, goals: [[1, 6], [0, 4]], bias: 0.1 },
  { moves: 16, goals: [[2, 8]], bias: 0.1 },
  { moves: 18, goals: [[3, 8], [4, 8]], bias: 0.08 },
  { moves: 20, goals: [[0, 5], [1, 5], [2, 5]], bias: 0.06 },
  { moves: 20, goals: [[3, 6], [4, 6], [2, 6]], bias: 0.05 },
];
// Unit 6 = z + review: z leads every mission
const REVIEW: Level[] = [
  { moves: 15, goals: [[0, 6]], bias: 0.12 },
  { moves: 16, goals: [[0, 5], [1, 5]], bias: 0.1 },
  { moves: 18, goals: [[0, 5], [2, 6]], bias: 0.08 },
  { moves: 18, goals: [[0, 5], [3, 5], [4, 5]], bias: 0.06 },
  { moves: 20, goals: [[0, 6], [1, 5], [2, 5]], bias: 0.05 },
  { moves: 20, goals: [[0, 6], [3, 6], [4, 6]], bias: 0.05 },
];
export function levelOf(n: number): Level {
  const span = UNITS.length * PER_UNIT;
  if (n <= span) {
    const k = unitIndex(n);
    return (UNITS[k]!.slots.filter(Boolean).length === 1 ? REVIEW : INTRO)[(n - 1) % PER_UNIT]!;   // REVIEW = z leading four review letters
  }
  // after the units: 2-3 random animals, a few more each level, a little fewer spare moves
  let s = n * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const k = 2 + Math.floor(r() * 2);
  const ids = [0, 1, 2, 3, 4].sort(() => r() - 0.5).slice(0, k);
  const each = Math.min(14, 6 + Math.floor((n - span) / 2));
  return { moves: Math.max(16, 22 - Math.floor((n - span) / 3)), goals: ids.map((i) => [i, each] as [number, number]), bias: 0.04 };
}
