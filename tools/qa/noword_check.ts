// Can the game's reading check (src/core/sttCheck.ts checkReading, the model the game ships) be passed WITHOUT the
// word? Feeds sounds that are not the word — words played backwards (a voice, no word), the tutor's Korean and English
// lines (someone else talking), the game's music, a cough-like burst — to every word of every unit board (the game's
// alts + rivals), all three themes. Every pass here is coins for not saying the word.
// usage: node tools/qa/noword_check.ts            (prints per sound: passes / words, and which words)
import { env, pipeline } from '@huggingface/transformers';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSaid as checkReading, type AsrParts } from '../../src/core/sttCheck.ts';   // the game's check (with its second look)
import { ALTS, ANIMALS, PER_UNIT, THEME_IDS, UNITS, animalTurn, rivalsOf, setTheme, useLevelAnimals } from '../../src/data/animals.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
env.allowRemoteModels = false;
env.localModelPath = `${ROOT}public/stt/models/`;

function decode(file: string, filters: string[] = []): Float32Array {
  const b = spawnSync('ffmpeg', ['-v', 'error', '-i', `${ROOT}public/${file}`, ...(filters.length ? ['-af', filters.join(',')] : []), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 27 }).stdout as Buffer;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function pad(x: Float32Array, p = 0.35): Float32Array {
  const n = Math.round(p * 16000), out = new Float32Array(x.length + 2 * n);
  out.set(x, n);
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.5 / peak;
  return out;
}
function cough(): Float32Array {           // two short bursts of breathy noise
  const sr = 16000, out = new Float32Array(Math.round(0.9 * sr));
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff * 2 - 1; };
  let lp = 0;
  for (const [t0, len] of [[0.05, 0.22], [0.42, 0.3]] as const)
    for (let i = 0; i < len * sr; i++) { const t = i / (len * sr); lp = lp * 0.6 + rnd() * 0.4; out[Math.round(t0 * sr) + i] = lp * Math.sin(Math.PI * t) ** 0.6 * (1 - t * 0.5); }
  return out;
}
const SOUNDS: [string, Float32Array][] = [
  ['backwards elephant', pad(decode('voice/w_elephant.mp3', ['areverse']))],
  ['backwards umbrella', pad(decode('voice/w_umbrella.mp3', ['areverse']))],
  ['Korean: k_almost', pad(decode('voice/k_almost.mp3'))],
  ['Korean: k_combo', pad(decode('voice/k_combo.mp3'))],
  ['English: t_great1', pad(decode('voice/t_great1.mp3'))],
  ['English: t_sayit', pad(decode('voice/t_sayit.mp3'))],
  ['music (bgm 8-11 s)', pad(decode('bgm.mp3', ['atrim=8:11']), 0)],
  ['cough-like noise', pad(cough())],
];

const asr = (await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', { dtype: 'q8', device: 'cpu' })) as unknown as AsrParts;
const passes: Record<string, string[]> = Object.fromEntries(SOUNDS.map(([n]) => [n, []]));
let checks = 0, words = 0;
for (const th of THEME_IDS) {
  setTheme(th); animalTurn(0);
  const seen = new Set<string>();
  for (let k = 0; k < UNITS.length; k++) {
    useLevelAnimals(k * PER_UNIT + 1);
    const board = ANIMALS.map((a) => ({ ...a }));
    for (const a of board) {
      if (seen.has(a.word)) continue;
      seen.add(a.word); words++;
      for (const [n, audio] of SOUNDS) {
        const r = await checkReading(asr, audio, a.word, ALTS[a.word] ?? [], rivalsOf(a.word, board));
        checks++;
        if (r.ok) passes[n]!.push(`${th}:${a.word} (heard ${JSON.stringify(r.text)})`);
      }
    }
  }
  process.stdout.write(`${th}: ${seen.size} words\n`);
}
let total = 0;
for (const [n] of SOUNDS) {
  const p = passes[n]!; total += p.length;
  console.log(`${n.padEnd(22)} passed for ${String(p.length).padStart(2)} / ${words} words${p.length ? ': ' + p.join(', ') : ''}`);
}
console.log(`\n${total} passes in ${checks} checks (${(100 * total / checks).toFixed(1)}% per try)`);
