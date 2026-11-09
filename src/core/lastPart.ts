// The last voiced stretch of a reading (16 kHz mono, as prepared for the recogniser) — a child who repeats the whole
// "/l/ /l/ lion" chant gets a second look at just "lion": whisper hears a long held "lll" as "O, O, O…" and the
// stricter check (user: "단어 말 안해도 그냥 넘어갈때가 있는지 확인해" → "수정해") would turn the chant down.
// null when the audio is a single stretch. No dependencies: used by core/listen.ts and the tools/qa scripts.
export function lastPart(x: Float32Array, sr = 16000): Float32Array | null {
  const F = Math.round(sr * 0.02), n = Math.floor(x.length / F);
  if (n < 10) return null;
  const e = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * F; k < (i + 1) * F; k++) s += x[k]! * x[k]!;
    e[i] = Math.sqrt(s / F); if (e[i]! > peak) peak = e[i]!;
  }
  if (peak <= 0) return null;
  // voiced runs (frames over 12 % of the loudest), joined across gaps up to 140 ms; a part is ≥ 140 ms
  const segs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (e[i]! <= peak * 0.12) continue;
    const last = segs[segs.length - 1];
    if (last && i - last[1] <= 7) last[1] = i; else segs.push([i, i]);
  }
  const parts = segs.filter(([a, b]) => b - a >= 7);
  if (parts.length < 2) return null;
  const [a, b] = parts[parts.length - 1]!;
  const s = Math.max(0, (a - 3) * F), t = Math.min(x.length, (b + 4) * F);
  let p = 0; for (let k = s; k < t; k++) p = Math.max(p, Math.abs(x[k]!));
  const g = p > 0.001 ? Math.min(8, 0.9 / p) : 1;           // like prepareForStt: peak to 0.9, at most ×8
  const pad = Math.round(0.25 * sr), out = new Float32Array(t - s + 2 * pad);
  for (let k = s; k < t; k++) out[pad + k - s] = x[k]! * g;
  return out;
}
