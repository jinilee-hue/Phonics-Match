// Reading-check evaluation with the game's own code path (src/core/sttCheck.ts) on tools/qa/stt_set.py's set.
// usage: node tools/qa/stt_eval.ts <set_dir> <out.json>
// Every rival is scored (freeOnsets '') so tools/qa/stt_grid.py can try rules afterwards without re-running.
import { env, pipeline } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkReading, RULE, type AsrParts } from '../../src/core/sttCheck.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SET = process.argv[2] ?? '/Users/jini/.hermes/cache/scratch/pm/stt';
const OUT = process.argv[3] ?? `${SET}/eval.json`;
env.allowRemoteModels = false;
env.localModelPath = `${ROOT}public/stt/models/`;

type Item = { id: string; target: string; should: boolean; kind: string; voice: string; said: string };
const items: Item[] = JSON.parse(readFileSync(`${SET}/set.json`, 'utf8'));
const words: { word: string; alts: string[]; rivals: string[] }[] = JSON.parse(readFileSync(`${SET}/words.json`, 'utf8'));
const BY = new Map(words.map((w) => [w.word, w]));
const asr = (await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', { dtype: 'q8', device: 'cpu' })) as unknown as AsrParts;
const res: unknown[] = [];
const t0 = Date.now();
for (const [i, it] of items.entries()) {
  const b = readFileSync(`${SET}/${it.id}.f32`);
  const audio = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const w = BY.get(it.target)!;
  const r = await checkReading(asr, audio, it.target, w.alts, w.rivals, { ...RULE, freeOnsets: '' });
  res.push({ ...it, dur: +(audio.length / 16000).toFixed(2), text: r.text, exact: r.exact, sT: r.sT, sFree: r.sFree, pNo: r.pNo, rv: r.rv });
  if ((i + 1) % 200 === 0) process.stdout.write(`${i + 1}/${items.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
}
writeFileSync(OUT, JSON.stringify(res));
console.log(`${res.length} items → ${OUT}`);
