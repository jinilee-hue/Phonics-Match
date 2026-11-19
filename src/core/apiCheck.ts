// The say-it check on the company phonics-api (phonics-kit, the 2026-11-19 rule for every phonics game): with a key on this
// device (the title's key button), the try goes once to /v1/speech/analyze (Wav2Vec2 on the company server; the audio is
// not stored) and PhonicsAPI.judge compares the phonemes it heard with the word and the board's rivals (one-word ones —
// the chant forms are covered by the judge: the word's own first sound said again before it costs almost nothing).
// null = no answer (no key, offline, busy, timeout) → the on-device whisper judges as before.
import '../vendor/phonics-api.js';
import PH from '../data/phonemes.json';

const table = PH as Record<string, string[]>;

export interface ApiHeard { verdict: PhonicsJudge['verdict']; heard: string; rel: number; ms: number }

export async function apiCheck(pcm16k: Float32Array, word: string, rivals: string[]): Promise<ApiHeard | null> {
  const PA = window.PhonicsAPI;
  const w = word.toLowerCase();
  if (!PA || !PA.usable() || !table[w]) return null;
  const r = await PA.analyze(PA.encodeWav(pcm16k, 16000), w);
  if (!r.ok) return null;
  const others = [...new Set(rivals.map((x) => x.toLowerCase()).filter((x) => x !== w && table[x]))];
  const j = PA.judge(r.data, w, others, table);
  return { verdict: j.verdict, heard: j.heard, rel: j.rel, ms: r.ms ?? 0 };
}
