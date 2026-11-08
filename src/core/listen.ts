// "Say it after me": listen for the child's try at the sound + word the tutor just read (on-device recogniser,
// core/stt.ts; nothing is recorded or sent anywhere). One listening session keeps the microphone open for its tries.
import { holdMusic, sfx } from './audio';
import { micBlocked, micSupported, openMic, prepareForStt, type Mic } from './mic';
import { check, sttState, sttWhenReady } from './stt';
import { exactReading } from './readCheck';

export type Heard = 'ok' | 'miss' | 'silence' | 'nomic' | 'aborted';
export interface HearOpts {
  alts: string[]; rivals: string[];
  aborted: () => boolean;
  onState?: (s: 'waiting' | 'voice' | 'thinking') => void;
  onLevel?: (v: number) => void;
  /** the browser is asking for the microphone (the tutor says "tap allow") */
  onAsk?: () => void;
}

/** test hook (?fake=1): queued answers instead of a microphone ('pig', 'cat', null = silence, 'nomic') */
export const fakeMic = { on: false, queue: [] as (string | null)[] };

export class Listener {
  private mic: Mic | null = null;
  lastHeard: string | null = null;

  async hear(word: string, o: HearOpts): Promise<Heard> {
    this.lastHeard = null;
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
      const r = await this.mic.listen({
        startTimeoutMs: 5000, maxMs: 4500, endSilenceMs: 750, guardMs: 280,
        onState: (st) => { if (st === 'waiting') { o.onState?.('waiting'); sfx('listen'); } else o.onState?.('voice'); },
        onLevel: (v) => o.onLevel?.(v),
        aborted: o.aborted,
      });
      o.onLevel?.(0);
      if (r.kind === 'denied' || r.kind === 'error') { this.close(); return 'nomic'; }
      if (r.kind === 'aborted') return 'aborted';
      if (r.kind === 'silence') return 'silence';
      o.onState?.('thinking');
      if (sttState() === 'loading') await sttWhenReady(6000);
      if (sttState() !== 'ready') return 'ok';            // no recogniser on this device: a clear voice was heard
      const out = await check(await prepareForStt(r.pcm, r.sr), word, o.alts, o.rivals);
      if (!out) return 'ok';
      this.lastHeard = out.text;
      if (o.aborted()) return 'aborted';
      return out.ok ? 'ok' : 'miss';
    } finally {
      holdMusic(false);
    }
  }
  close() { this.mic?.close(); this.mic = null; }
}
