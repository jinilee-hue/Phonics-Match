// A candidate rule + "a second look at the last part" (src/core/lastPart.ts) on tools/qa/stt_set.py's set, using
// tools/qa/stt_eval.ts's numbers for the whole audio: what the tail retry wins back (correct readings, chants) and
// what it lets through (things that must fail).
// usage: node tools/qa/stt_tail.ts <set_dir> <eval.json> [gap minT rgap maxNo]
import { env, pipeline } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkReading, type AsrParts } from '../../src/core/sttCheck.ts';
import { lastPart } from '../../src/core/lastPart.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
env.allowRemoteModels = false;
env.localModelPath = `${ROOT}public/stt/models/`;
const [SET, EVAL] = [process.argv[2]!, process.argv[3]!];
const [G, M, V, N] = (process.argv.slice(4, 8).length === 4 ? process.argv.slice(4, 8) : ['6', '-7.5', '2', '0.5']).map(Number);
const rule = { gap: G!, minT: M!, rgap: V!, maxNo: N!, freeOnsets: 'b' };
type E = { id: string; target: string; should: boolean; kind: string; voice: string; exact: boolean; sT: number; sFree: number; pNo: number; rv: Record<string, number>; text: string };
const ev: E[] = JSON.parse(readFileSync(EVAL, 'utf8'));
const words: { word: string; alts: string[]; rivals: string[] }[] = JSON.parse(readFileSync(`${SET}/words.json`, 'utf8'));
const BY = new Map(words.map((w) => [w.word, w]));
const okWhole = (r: E) => {
  const rv = Object.entries(r.rv).filter(([w]) => !rule.freeOnsets.includes(w[0]!.toLowerCase())).map(([, s]) => s);
  const rgap = rv.length ? Math.max(...rv) - r.sT : -99;
  return r.exact || (r.sFree - r.sT < rule.gap && rgap < rule.rgap && r.sT > rule.minT && r.pNo < rule.maxNo);
};
const asr = (await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', { dtype: 'q8', device: 'cpu' })) as unknown as AsrParts;
const tally = new Map<string, { n: number; whole: number; both: number }>();
const add = (k: string, whole: boolean, both: boolean) => { const t = tally.get(k) ?? { n: 0, whole: 0, both: 0 }; t.n++; t.whole += +whole; t.both += +both; tally.set(k, t); };
const won: string[] = [], leaked: string[] = [];
for (const r of ev) {
  const whole = okWhole(r);
  let both = whole;
  if (!whole) {
    const b = readFileSync(`${SET}/${r.id}.f32`);
    const tail = lastPart(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    if (tail) {
      const w = BY.get(r.target)!;
      const t = await checkReading(asr, tail, r.target, w.alts, w.rivals, rule);
      both = t.ok;
      if (both) (r.should ? won : leaked).push(`${r.id} (${JSON.stringify(t.text)})`);
    }
  }
  add(r.should ? `pass  ${r.voice}` : `wrong ${r.kind}`, whole, both);
  if (r.should) add(`pass  kind:${r.kind}`, whole, both);
}
const P = ev.filter((r) => r.should), Nn = ev.filter((r) => !r.should);
const sum = (k: 'whole' | 'both', pre: string) => [...tally].filter(([key]) => key.startsWith(pre) && !key.includes('kind:')).reduce((a, [, t]) => a + t[k], 0);
console.log(`rule gap<${G} sT>${M} rgap<${V} pNo<${N}`);
for (const [k, t] of [...tally].sort()) console.log(`${k.padEnd(22)} ${(100 * t.whole / t.n).toFixed(0).padStart(3)}% → with the tail ${(100 * t.both / t.n).toFixed(0).padStart(3)}%  (${t.n})`);
console.log(`\nall readings ${(100 * sum('whole', 'pass') / P.length).toFixed(1)}% → ${(100 * sum('both', 'pass') / P.length).toFixed(1)}% · wrong passes ${(100 * sum('whole', 'wrong') / Nn.length).toFixed(1)}% → ${(100 * sum('both', 'wrong') / Nn.length).toFixed(1)}%`);
console.log('leaked by the tail:', leaked.slice(0, 20).join(', ') || 'none');
console.log('won back (sample):', won.filter((x) => x.includes('chant')).slice(0, 12).join(', '));
