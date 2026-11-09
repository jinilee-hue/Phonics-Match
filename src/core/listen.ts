// "Say it after me": listen for the child's try at the sound + word the tutor just read (on-device recogniser,
// core/stt.ts; nothing is recorded or sent anywhere). One listening session keeps the microphone open for its tries.
import { audioCtx, holdMusic, sfx } from './audio';
import { micBlocked, micSupported, openMic, prepareForStt, type Mic } from './mic';
import { check, sttState, sttWhenReady } from './stt';
import { exactReading } from './readCheck';

export type Heard = 'ok' | 'miss' | 'silence' | 'nomic' | 'aborted';
export interface HearOpts {
  alts: string[]; rivals: string[];
  /** how long to wait for a voice before 'silence' (ms, default 5000) */
  waitMs?: number;
  aborted: () => boolean;
  onState?: (s: 'waiting' | 'voice' | 'thinking') => void;
  onLevel?: (v: number) => void;
  /** the browser is asking for the microphone (the tutor says "tap allow") */
  onAsk?: () => void;
}

/** test hook (?fake=1): queued answers instead of a microphone ('pig', 'cat', null = silence, 'nomic') */
export const fakeMic = { on: false, queue: [] as (string | null)[] };

/** Is a sound the recogniser rejected still the child's TRY at the word (→ "Almost!", two of them → "Good try!")?
 *  Only if it sounds like one (user: "아무말도 안했는데 잘했어 하고 넘어가는데" — two sentences from people a few metres away,
 *  "What do you think?" / "Hello, I'm a", were taken for two wrong tries and the tutor said "좋아, 잘했어!"):
 *    speech — whisper's no-speech guess under 0.35 (accepted readings: 99% under 0.34; noise / music 0.45+) and words other
 *    than its "you" for a click or a hum;  the word ALMOST heard — log P(word) over -9 (a pass needs -7.5);  and short (≤ 2 words) or with a
 *    word close to the target (same first letter, likeness ≥ 0.6: "A, A, ant" yes — "What do you think?" for ant no).
 *  On the tools/qa set (stt_set → stt_eval; scratch pm/try_rule.py): rejected readings of the right word 46% still count
 *  as tries, other people's lines 8% (was all), noise / music never. What isn't a try is ignored — the child keeps the
 *  whole wait to say it, and the tutor reads it again — so the rule leans strict: a missed "Almost!" costs nothing,
 *  praise for someone else's talk does (with -10: other people's lines 18%, ~25% of turns with talk around end in it). */
const TRY = { maxNo: 0.35, minT: -9, maxWords: 2, like: 0.6 };
const wordsOf = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];
/** 2 × longest common subsequence / total length (≈ difflib's ratio) */
function likeness(a: string, b: string) {
  const d = new Array<number>(b.length + 1).fill(0);
  for (const ca of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = d[j]!; d[j] = ca === b[j - 1] ? prev + 1 : Math.max(d[j]!, d[j - 1]!); prev = t; } }
  return (2 * d[b.length]!) / (a.length + b.length);
}
export function triedWord(r: { text: string; pNo: number; sT: number }, targets: string[]) {
  const ws = wordsOf(r.text);
  if (r.pNo >= TRY.maxNo || !ws.length || /^(thank you|you)$/.test(ws.join(' '))) return false;
  if (r.sT <= TRY.minT) return false;
  return ws.length <= TRY.maxWords || ws.some((w) => w.length >= 2 && targets.some((t) => w[0] === t[0]?.toLowerCase() && likeness(w, t.toLowerCase()) >= TRY.like));
}

export class Listener {
  private mic: Mic | null = null;
  lastHeard: string | null = null;
  /** sounds heard and let go in the last hear() (not a try at the word) — for the log */
  ignored: string[] = [];

  async hear(word: string, o: HearOpts): Promise<Heard> {
    this.lastHeard = null; this.ignored = [];
    if (fakeMic.on) {
      o.onState?.('waiting'); sfx('listen');
      for (let i = 0; i < 14; i++) { if (o.aborted()) return 'aborted'; o.onLevel?.(0.3 + 0.5 * Math.abs(Math.sin(i))); await new Promise((r) => setTimeout(r, 70)); }
      o.onLevel?.(0);
      const next = fakeMic.queue.length ? fakeMic.queue.shift()! : word;
      if (next === 'nomic') return 'nomic';
      if (next === null) return 'silence';
      this.lastHeard = next; o.onState?.('thinking');
      await new Promise((r) => setTimeout(r, 300));
      return exactReading(word, next) || o.alts.some((a) => exactReading(a, next)) ? 'ok' : 'miss';
    }
    if (!micSupported() || micBlocked()) return 'nomic';
    if (!this.mic) {
      const t0 = performance.now();
      let asked = false;
      const ask = window.setTimeout(() => { asked = true; o.onAsk?.(); }, 1200);
      const m = await openMic(() => o.aborted() || performance.now() - t0 > 14000);
      clearTimeout(ask);
      if (m.kind === 'aborted') return o.aborted() ? 'aborted' : 'nomic';
      if (m.kind !== 'ok') return 'nomic';
      this.mic = m.mic;
      if (asked) await new Promise((r) => setTimeout(r, 250));
    }
    holdMusic(true);
    try {
      // the cue and the fox's last word reach the room a device's output latency late (Bluetooth / HDMI speakers:
      // 0.1–0.3 s) — past a fixed guard they were heard as a voice
      const ac = audioCtx() as (AudioContext & { outputLatency?: number }) | null;
      const lat = Math.min(400, Math.round((ac?.outputLatency || 0) * 1000));
      const until = performance.now() + (o.waitMs ?? 5000);
      for (let first = true; ; first = false) {
        const r = await this.mic.listen({
          startTimeoutMs: Math.max(0, until - performance.now()), maxMs: 4500, endSilenceMs: 750, guardMs: first ? 280 + lat : 0,
          onState: (st) => { if (st === 'waiting') { o.onState?.('waiting'); if (first) sfx('listen'); } else o.onState?.('voice'); },
          onLevel: (v) => o.onLevel?.(v),
          aborted: o.aborted,
        });
        o.onLevel?.(0);
        if (r.kind === 'denied' || r.kind === 'error') { this.close(); return 'nomic'; }
        if (r.kind === 'aborted') return 'aborted';
        // nothing — or a click too short to be a word, which used to end the wait early: keep listening till the end
        if (r.kind === 'silence') { if (until - performance.now() > 400) continue; return 'silence'; }
        o.onState?.('thinking');
        // still downloading: wait for it (≤ 30 s, the mic shows 'thinking') — passing any voice meanwhile paid coins for no
        // word (user: "단어 말 안해도 그냥 넘어갈때가 있는지 확인해"); still not there → no coins, and no "wrong" either
        const tw = performance.now();
        while (sttState() === 'loading' && performance.now() - tw < 30000) {
          if (o.aborted()) return 'aborted';
          await sttWhenReady(250);
        }
        if (sttState() === 'loading') return 'nomic';
        if (sttState() !== 'ready') return 'ok';            // no recogniser on this device at all: a clear voice was heard
        const out = await check(await prepareForStt(r.pcm, r.sr), word, o.alts, o.rivals);
        if (!out) return 'ok';
        if (o.aborted()) return 'aborted';
        if (out.ok) { this.lastHeard = out.text; return 'ok'; }
        // not the word, and nothing like a try at it (the room, a knock, other people talking): not the child's turn —
        // keep listening for the rest of the wait
        if (!triedWord(out, [word, ...o.alts])) {
          this.ignored.push(`${out.text || '·'} [no ${out.pNo} word ${out.sT}]`);
          if (until - performance.now() > 400) { o.onState?.('waiting'); continue; }
          return 'silence';
        }
        this.lastHeard = out.text;
        return 'miss';
      }
    } finally {
      holdMusic(false);
    }
  }
  close() { this.mic?.close(); this.mic = null; }
}
