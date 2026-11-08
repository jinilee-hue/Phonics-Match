// Does the game's own reading check (src/core/sttCheck.ts checkReading, whisper-tiny.en q8 — the model the game ships)
// accept each animal word and refuse the others ON ITS BOARD? Per unit board (two levels each, so a letter with two
// animals shows both), feeds the word recordings (and the "/x/ /x/ word" chant built from the letter-sound + word
// recordings) to every word of that board, with the game's rivals (rivalsOf: the board + same-letter animals): the
// diagonal must pass, everything else must fail.
// usage: node tools/qa/word_check.ts
import { env, pipeline } from '@huggingface/transformers';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkReading, type AsrParts } from '../../src/core/sttCheck.ts';
import { ALTS, ANIMALS, PER_UNIT, UNITS, animalTurn, rivalsOf, setTheme, useLevelAnimals, type Theme } from '../../src/data/animals.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
env.allowRemoteModels = false;
env.localModelPath = `${ROOT}public/stt/models/`;
const clips: Record<string, [string, number, number, number]> = JSON.parse(readFileSync(`${ROOT}src/data/voice.json`, 'utf8')).clips;

function pcm(key: string): Float32Array {
  const [file, start, , dur] = clips[key];
  const b = spawnSync('ffmpeg', ['-v', 'error', '-i', `${ROOT}public/voice/${file}`, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 26 }).stdout as Buffer;
  const a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  return a.slice(Math.round(start * 16000), Math.round((start + dur) * 16000));
}
function join(parts: Float32Array[], gap = 0.18, pad = 0.35): Float32Array {
  const g = Math.round(gap * 16000), p = Math.round(pad * 16000);
  const n = parts.reduce((s, x) => s + x.length, 0) + g * (parts.length - 1) + 2 * p;
  const out = new Float32Array(n);
  let o = p;
  parts.forEach((x, i) => { out.set(x, o); o += x.length + (i < parts.length - 1 ? g : 0); });
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.5 / peak;
  return out;
}

const asr = (await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', { dtype: 'q8', device: 'cpu' })) as unknown as AsrParts;
let bad = 0;
const th = process.argv.slice(2).find((a) => /^[a-z]+$/.test(a)) as Theme | undefined;   // node tools/qa/word_check.ts [objects|fruit] [level …]
if (th) setTheme(th);
animalTurn(0);
const only = process.argv.slice(2).map(Number).filter(Boolean);
const levels = only.length ? only : UNITS.flatMap((_, k) => [k * PER_UNIT + 1, k * PER_UNIT + 2]);
for (const n of levels) {
 useLevelAnimals(n);
 const board = ANIMALS.map((a) => ({ ...a }));
 const words = board.map((a) => a.word);
 for (const mode of ['word', 'chant'] as const) {
  console.log(`\nlevel ${n} · ${mode === 'word' ? 'the word alone' : '"/x/ /x/ word" chant'} (rows: what was said · columns: the target)`);
  console.log(''.padEnd(10) + words.map((w) => w.padEnd(10)).join(''));
  for (const a of board) {
    const audio = mode === 'word' ? join([pcm(`w:${a.word}`)]) : join([pcm(`s:${a.letter}`), pcm(`s:${a.letter}`), pcm(`w:${a.word}`)]);
    const row: string[] = [];
    let heard = '';
    for (const t of words) {
      const r = await checkReading(asr, audio, t, ALTS[t] ?? [], rivalsOf(t, board));
      const want = t === a.word;
      if (r.ok !== want) { bad++; console.log(`   ${a.word} → ${t}: ${JSON.stringify({ exact: r.exact, gap: r.gap, rgap: r.rgap, rival: r.rival, sT: r.sT, pNo: r.pNo })}`); }
      row.push(`${r.ok ? 'pass' : '-'}${r.ok !== want ? ' ✗' : ''}`.padEnd(10));
      heard = r.text ?? heard;
    }
    console.log(a.word.padEnd(10) + row.join('') + `  heard ${JSON.stringify(heard)}`);
  }
 }
}
console.log(bad ? `\n${bad} wrong` : '\nall right: each word passes only for itself');
