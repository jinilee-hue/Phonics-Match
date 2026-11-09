// The words the reading check judges, per theme, with the game's alts and the rivals of the first unit board each
// word appears on (rivalsOf) — the input of tools/qa/stt_set.py / stt_eval.ts.
// usage: node tools/qa/stt_words.ts <out.json>
import { writeFileSync } from 'node:fs';
import { ALTS, ANIMALS, PER_UNIT, THEME_IDS, UNITS, animalTurn, rivalsOf, setTheme, useLevelAnimals } from '../../src/data/animals.ts';

const out: { theme: string; word: string; letter: string; alts: string[]; rivals: string[] }[] = [];
for (const th of THEME_IDS) {
  setTheme(th); animalTurn(0);
  const seen = new Set<string>();
  for (let k = 0; k < UNITS.length; k++) {
    useLevelAnimals(k * PER_UNIT + 1);
    const board = ANIMALS.map((a) => ({ ...a }));
    for (const a of board) {
      if (seen.has(a.word)) continue;
      seen.add(a.word);
      out.push({ theme: th, word: a.word, letter: a.letter, alts: ALTS[a.word] ?? [], rivals: rivalsOf(a.word, board) });
    }
  }
}
writeFileSync(process.argv[2] ?? 'stt_words.json', JSON.stringify(out, null, 1));
console.log(out.length, 'words:', out.map((w) => w.word).join(' '));
