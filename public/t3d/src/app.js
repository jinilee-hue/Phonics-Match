// Phonics Match — 3D tutor prototype (route A: the tutor built in code, like Phonics Island's Peepo).
// The 2D art (art/tutor2d.webp, 660×680) was measured (scratch pm/t3d_measure.py, t3d_fit*.py, t3d_cmp.py): ball centre
// (349.5, 371.7), radius 256 px incl. fur = 1 unit here, and the canvas maps the art's pixel grid 1:1, so a render at
// yaw 0 overlays the picture. Through this camera the picture is the model turned -8.5° with its head tilted -7.8°
// (eyes fitted on the rendered whites/irises; the painting's mouth sits right of where a symmetric face puts it, the
// model keeps a centred mouth). Body: shell fur on a sphere; arms (mittens with a thumb), feet and the tuft: signed-
// distance blobs meshed by rays from an axis (sdfLimb), arms/feet with the same core + strand fur (3D-cell strands, no
// UVs needed); eyes: balls with the iris painted round a shared gaze point; mouth: painted in the fur shader, a soft
// smile that opens into a talking mouth (uMouthOpen). Lights are fixed to the camera (the model turns, not the light),
// so the fur keeps the painting's top-left light at every angle.
// Pass 6: the tuft wears soft fur (same shapes as pass 4); the shop's gloves and shoes as 3D pieces (__t3d.set({ gloves,
// shoes })); the game can turn it by drag messages and hears back when it faces front again (see remoteDrag below).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D2R = Math.PI / 180;
const ART = { w: 660, h: 680, cx: 349.5, cy: 371.7, R: 256 };
const POSE = { yaw: -8.5 * D2R, roll: -7.8 * D2R };
const SKIN = 0.945, FUR = 0.075, SHELLS = 36, CORE = 0.4, GROUND = -1.163;   // CORE: the solid layer's share of the fur
const LIMB = { fur: 0.028, shells: 16, core: 0.4, freq: 165 };                  // arms, feet: shorter fur, same look
const FOV = 12;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dirYP = (yaw, pitch) => V(Math.sin(yaw * D2R) * Math.cos(pitch * D2R), Math.sin(pitch * D2R), Math.cos(yaw * D2R) * Math.cos(pitch * D2R));
const FACE_C = dirYP(0, 10);              // the face's middle: the body keeps its fitted round shape round here
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the outline at the picture angle, fitted to the 2D's body silhouette (scratch pm/t3d/pass4/m4.py + fit4.py): a radius
// change (units) by the screen angle θ (0 = right, 90° = up) of a direction as seen at the picture pose, as a short
// Fourier series a0 + Σ ak·cos kθ + bk·sin kθ. Nearly round; the top a little fuller, the right side narrower.
const OUTLINE = { a: [-0.017, -0.0083, -0.0275, -0.0042, -0.0141, -0.0022, 0.0052, -0.0025, -0.0007], b: [0, 0.0042, 0.0099, -0.0174, 0.0013, -0.0009, 0.0018, -0.0006, -0.0035] };
const PICK = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, POSE.yaw, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, POSE.roll)));
const _w = new THREE.Vector3();
/** the body's shape by direction d (body frame, unit): s = skin radius scale (the fitted outline + faint lumps),
 *  len = strand length factor, hang = how far the strand tips hang down (units; only a little, so the feet show).
 *  The face cap (eyes, cheeks, mouth) keeps s = 1, len = 1, so the fitted face stays put. */
function bodyShape(d) {
  const w = 1 - sstep(Math.cos(50 * D2R), Math.cos(33 * D2R), d.dot(FACE_C));
  const low = sstep(0.2, -0.55, d.y);
  _w.copy(d).applyQuaternion(PICK);
  const th = Math.atan2(_w.y, _w.x), rim = 1 - _w.z * _w.z;   // rim: 1 on the picture's silhouette, 0 face-on / back-on
  let o = OUTLINE.a[0];
  for (let k = 1; k < OUTLINE.a.length; k++) o += OUTLINE.a[k] * Math.cos(k * th) + OUTLINE.b[k] * Math.sin(k * th);
  const lump = 0.5 * Math.sin(5.3 * d.x + 1.1) * Math.sin(4.1 * d.y + 0.3) + 0.35 * Math.sin(4.6 * d.z + 2.0 * d.x + 2.4) + 0.3 * Math.sin(7.1 * d.y - 3.3 * d.z + 0.8 + 2.0 * d.x);
  return { s: 1 + w * (o * rim + 0.008 * lump), len: 1 + w * (0.3 + 0.08 * low), hang: w * (0.003 + 0.006 * low) };
}
/** radius of the fur's outer surface in direction d (unit, body frame), for things that lie on it (the cape) */
const furTip = (d) => { const b = bodyShape(d); return SKIN * b.s + FUR * (CORE + b.len * (1 - CORE) * 0.8); };
const FACE = {
  eyes: [dirYP(-21.4, 17.3), dirYP(21.4, 17.3)],   // fitted on the visible white (its bbox centre), not the ball centre
  eyeC: 0.95, eyeR: 0.172,                 // eyeball centres sit just under the fur; balls, so they read round from any angle
  gaze: V(0.29, 0.37, 2.27),            // both eyes look at this point (fitted to the painting's irises; pass 8: 2 px up, 1 left)
  mouth: dirYP(0, 3.4), mouthSize: 0.036,  // half width of the little smile, radians
  blush: [dirYP(-28.5, 4), dirYP(28.5, 4)],
  // pass 8 (user: the screen-left iris ran into the fur with no white in front of it): the fur's solid core covered the
  // balls' lower nose side, so it dips there (direction, depth in units; gaussian radius sockR)
  sock: [new THREE.Vector4(...dirYP(-14, 11).toArray(), 0.06), new THREE.Vector4(...dirYP(14, 11).toArray(), 0.03)], sockR: 10 * D2R,
};
const LIGHT = V(-0.55, 0.62, 0.56).normalize();            // view space: from the upper left, in front
const rgb = (hex) => V(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);   // sRGB as is

// ── shaders ────────────────────────────────────────────────────────────────────────────────────────────────────────
const RAMP = /* glsl */ `
vec3 ramp4(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = mix(c0, c1, smoothstep(0.0, 0.4, t));
  vec3 b = mix(a, c2, smoothstep(0.3, 0.7, t));
  return mix(b, c3, smoothstep(0.62, 1.0, t));
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;

// furp (per vertex, from bodyShape): x = strand length factor here (1 on the face, longer at the sides and bottom),
// y = how far the strand tips hang down here. The solid core keeps the fitted radius; only the strands get longer.
const FUR_VS = /* glsl */ `
attribute float shell;
attribute vec2 furp;
uniform float uFur, uOmega, uCore;
uniform vec4 uSock0, uSock1; uniform float uSockR;   // pass 8: the fur dips (w = depth) round these directions (xyz)
#ifdef FOOT9
uniform sampler2D uFootTex; uniform vec4 uFootA, uFootB, uFootC;   // pass 9: the worn hair ribbon's footprint (see ribbonFoot)
#endif
varying vec3 vN; varying vec3 vDir; varying float vH; varying vec2 vUv;
void main() {
  vH = shell; vUv = uv; vDir = normalize(position);
  float h2 = shell * shell, hs = max(shell - uCore, 0.0) / (1.0 - uCore);
  float a0 = acos(clamp(dot(vDir, uSock0.xyz), -1.0, 1.0)), a1 = acos(clamp(dot(vDir, uSock1.xyz), -1.0, 1.0));
  float sock = uSock0.w * exp(-pow(a0 / uSockR, 2.0)) + uSock1.w * exp(-pow(a1 / uSockR, 2.0));
  vec3 p = position + normal * (uFur * (min(shell, uCore) + furp.x * (shell - min(shell, uCore))) - sock);
#ifdef FOOT9
  {   // pass 9: the fur (core too) dips under the hair ribbon where the ribbon sits deeper than the fur's core
    float dn = dot(vDir, uFootA.xyz);
    vec2 c = vec2(dot(vDir, uFootB.xyz), dot(vDir, uFootC.xyz)) / max(dn, 0.3) * uFootB.w + 0.5;
    if (dn > 0.3 && c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0) p -= normal * (texture2D(uFootTex, c).g * uFootC.w);
  }
#endif
  p -= vec3(uOmega * p.z, 0.0, -uOmega * p.x) * 0.010 * h2;   // fur trails when the body turns
  p.y -= 0.006 * h2 + furp.y * hs * hs;                      // and hangs down, most at the sides and bottom
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// the mouth, painted on the fur: a soft little smile (o = 0) that opens into a round talking mouth with a tongue (o = 1).
// q = mouth-frame coordinates in units of the closed smile's half width, +y up the face.
const MOUTH = /* glsl */ `
// the open mouth's outline as a signed distance (q units; < 0 inside): its top lip yt, its round bottom yb, its width w
float mouthSD(vec2 q, float o) {
  float w = 1.0 + 0.25 * o;
  float x = q.x / w, x2 = min(x * x, 1.0);
  float yt = 0.22 + 0.06 * x2;
  float yb = -(0.35 + 1.6 * o) * sqrt(1.0 - x2) + 0.25 * x2;
  return max(max(q.y - yt, yb - q.y), abs(q.x) - w);
}
vec3 paintMouth(vec3 col, vec2 q, float o) {
  // closed: a soft little smile, blurred like the painting
  float xc = q.x / 1.05;
  float yc = -0.12 + 0.3 * xc * xc;
  float th = 0.36 * (1.0 - 0.45 * xc * xc);
  float a0 = exp(-pow((q.y - yc) / max(th, 0.05), 2.0)) * (1.0 - smoothstep(0.75, 1.2, abs(xc)));
  // open: a round mouth, a tongue in its lower half, a warm lip line round it
  float w = 1.0 + 0.25 * o;
  float sd = mouthSD(q, o);
  float a1 = 1.0 - smoothstep(-0.12, 0.12, sd);
  float ybot = -(0.35 + 1.6 * o);
  float tg = 1.0 - smoothstep(0.85, 1.0, length(vec2(q.x / (0.62 * w), (q.y - ybot - 0.18) / (0.25 + 0.45 * o))));
  vec3 inner = mix(vec3(0.42, 0.12, 0.07), vec3(0.95, 0.47, 0.40), tg * smoothstep(0.25, 0.6, o));
  inner = mix(inner, vec3(0.80, 0.38, 0.16), smoothstep(-0.22, 0.0, sd) * 0.8);
  float k = smoothstep(0.04, 0.25, o);
  col = mix(col, vec3(0.90, 0.55, 0.24), a0 * 0.8 * (1.0 - k));
  return mix(col, inner, a1 * k);
}`;
// The strands are blended (soft, anti-aliased, fading toward their tips), so the edge fades out like an airbrushed
// painting; the shells draw inner to outer (instance order), which is back to front for the front faces.
const FUR_FS = /* glsl */ `
uniform vec3 uMouthCut;
uniform float uDensity, uThick, uCore, uMouthOpen, uMouthSize, uTuftDens, uClump, uLean, uVar, uTip, uSkin;
uniform float uTuftVar, uFade, uSoft, uRimK, uLenVar, uBlushAmt, uLowK;
uniform vec3 uB0, uB1, uB2, uB3, uB4;
uniform vec3 uLight, uC0, uC1, uC2, uC3, uBlushCol, uRim, uAOTint, uTipCol;
uniform vec3 uEye0, uEye1, uEyeS0, uEyeS1, uMouth, uMouthX, uMouthY, uBlush0, uBlush1, uFaceC;
uniform vec2 uEyeMask, uEyeAO, uBlushMask;
uniform vec4 uPressAx, uPressLim; uniform vec3 uPress;   // pass 7: a worn hat/band presses the fur flat under it
#ifdef FOOT9
uniform sampler2D uFootTex; uniform vec4 uFootA, uFootB, uFootC;   // pass 9: the worn hair ribbon's footprint
#endif
#ifdef PHONES10
uniform vec4 uCup0, uCup1; uniform vec2 uCupP;   // pass 10: the headphones' cups (xyz = direction, w = cos of the pressed cap's angle)
#endif
varying vec3 vN; varying vec3 vDir; varying float vH; varying vec2 vUv;
${RAMP}
${MOUTH}
#define PI 3.14159265
// tuft centres: one jittered site per cell of a coarse latitude lattice (rows of roughly square cells)
vec2 tuftSite(float row, float col, float rows, out vec2 id) {
  float ring = max(4.0, floor(uTuftDens * sin((row + 0.5) / rows * PI) + 0.5));
  col = mod(col, ring); id = vec2(col, row + ring * 0.013);
  vec2 j = vec2(hash12(id * vec2(1.0, 3.7) + 1.7), hash12(id * vec2(1.0, 3.7) + 9.2)) - 0.5;
  return vec2((col + 0.5 + 0.75 * j.x) / ring, (row + 0.5 + 0.75 * j.y) / rows);
}
void main() {
  vec2 fwUv = fwidth(vUv);                              // before any discard: the pixel's footprint in uv
  vec3 d = normalize(vDir);
  float m = 1.0 - smoothstep(uEyeMask.x, uEyeMask.y, max(dot(d, uEye0), dot(d, uEye1)));
  vec2 q = vec2(dot(d, uMouthX), dot(d, uMouthY)) / uMouthSize;
  float front = step(0.9, dot(d, uMouth));
  // pass 8 (user: the fur round the mouth went flat while talking): the strands are cut only inside the open mouth
  // (its own outline, soft at the lips, so fur reaches over them a little); the shut smile is painted on the fur
  float mo = smoothstep(0.04, 0.25, uMouthOpen);
  m *= 1.0 - front * (0.94 * mo * (1.0 - smoothstep(uMouthCut.x, uMouthCut.y, mouthSD(q, uMouthOpen))) + uMouthCut.z * (1.0 - mo) * (1.0 - smoothstep(0.9, 1.6, length(vec2(q.x / 1.1, (q.y + 0.1) / 0.6)))));
  if (uPress.z > 0.0) {   // pressed under a worn item: directions between the angles (cos) uPressAx.w (outer) and uPress.x (inner)
    float ca = dot(d, uPressAx.xyz), ps = uPress.y;          // round uPressAx, on the side uPressLim.xyz · d > uPressLim.w
    float pr = smoothstep(uPressAx.w - ps, uPressAx.w + ps, ca) * (1.0 - smoothstep(uPress.x - ps, uPress.x + ps, ca));
    pr *= smoothstep(uPressLim.w - 0.05, uPressLim.w + 0.05, dot(d, uPressLim.xyz));
    m *= 1.0 - uPress.z * pr;
  }
#ifdef PHONES10
  {   // pass 10: under and just round each ear cup the strands lie flat (uCupP.x = the soft edge in cos, y = how flat)
    m *= 1.0 - uCupP.y * smoothstep(uCup0.w - uCupP.x, uCup0.w + uCupP.x, dot(d, uCup0.xyz));
    m *= 1.0 - uCupP.y * smoothstep(uCup1.w - uCupP.x, uCup1.w + uCupP.x, dot(d, uCup1.xyz));
  }
#endif
#ifdef FOOT9
  {   // pass 9: under and round the hair ribbon the strands stop short of it (none poke through it)
    float dn = dot(d, uFootA.xyz);
    vec2 c = vec2(dot(d, uFootB.xyz), dot(d, uFootC.xyz)) / max(dn, 0.3) * uFootB.w + 0.5;
    float fm = texture2D(uFootTex, clamp(c, 0.0, 1.0)).r;   // (sampled before the branch: uniform control flow)
    if (dn > 0.3 && c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0) m *= fm;
  }
#endif
  float h = vH, hs = clamp((h - uCore) / (1.0 - uCore), 0.0, 1.0);
  float shade = 0.5, tipT = 0.0, tuftB = 0.5, alpha = 1.0;
  if (h > uCore + 0.001) {
    float st = max(sqrt(max(1.0 - d.y * d.y, 0.0)), 0.06);
    vec3 E = vec3(d.z, 0.0, -d.x) / st, Nn = vec3(-d.x * d.y / st, st, -d.z * d.y / st);   // east, north on the sphere
    // 1. lean: strands lie over toward their tips, combed down the body and out from the face, with a slow swirl
    vec3 g = -Nn, away = d * dot(d, uFaceC) - uFaceC;
    float wf = smoothstep(0.35, 0.85, dot(d, uFaceC));
    vec3 L = normalize(mix(g, normalize(away + 1e-4 * E), wf) + 1e-4 * E);
    float sw = 0.9 * sin(3.1 * d.x + 1.9 * d.y + 0.7) + 0.6 * sin(4.3 * d.z - 2.7 * d.y + 2.1);
    L = L * cos(sw) + cross(d, L) * sin(sw);
    vec2 uvx = vUv - vec2(dot(L, E) / (2.0 * PI * st), dot(L, Nn) / PI) * (uLean / uSkin) * pow(hs, 1.4);
    uvx.y = clamp(uvx.y, 0.0, 1.0);
    // 2. tufts (uClump > 0): strands gather toward their tuft's centre toward their tips (Voronoi cells round jittered
    //    sites); uTuftVar: how much the length and colour vary from tuft to tuft (soft lumps in the outline)
    vec2 b = uvx;                                       // where this strand grows from
    float k = 0.0, tuftLen, lump = sin(19.0 * d.x + 3.1 * sin(13.0 * d.y)) * sin(17.0 * d.y + 2.7 * sin(11.0 * d.z)) * sin(21.0 * d.z + 1.3);
    tuftLen = 1.0 - uTuftVar * (0.5 + 0.5 * lump);      // without tufts: soft lumps in the length (a gently uneven edge)
    tuftB = 0.5 + 0.5 * uTuftVar * lump;
    if (uClump > 0.0) {                                 // tufts: Voronoi cells round jittered sites
      vec2 met = vec2(2.0 * PI * st, PI);
      float trows = floor(uTuftDens * 0.5), r0 = floor(uvx.y * trows);
      vec2 S[9]; vec2 C = vec2(0.0), Cid = vec2(0.0), id; float best = 1e9;
      for (int j = 0; j < 3; j++) {
        float row = clamp(r0 + float(j - 1), 0.0, trows - 1.0);
        float ring = max(4.0, floor(uTuftDens * sin((row + 0.5) / trows * PI) + 0.5));
        float c0 = floor(fract(uvx.x) * ring);
        for (int i = 0; i < 3; i++) {
          vec2 s = tuftSite(row, c0 + float(i - 1), trows, id);
          vec2 dd = s - uvx; dd.x -= floor(dd.x + 0.5);
          float d2 = dot(dd * met, dd * met);
          S[j * 3 + i] = s;
          if (d2 < best) { best = d2; C = s; Cid = id; }
        }
      }
      k = uClump * pow(hs, 0.75);
      vec2 rel = uvx - C; rel.x -= floor(rel.x + 0.5);
      b = C + rel / (1.0 - k);
      vec2 rb = rel / (1.0 - k);
      float db = dot(rb * met, rb * met);
      if (k > 0.001) for (int n = 0; n < 9; n++) {        // grown from another tuft's cell: a gap between tufts
        vec2 e = b - S[n]; e.x -= floor(e.x + 0.5);
        if (dot(e * met, e * met) < db - 1e-9) discard;
      }
      float tr = sqrt(db) / (2.0 * PI / uTuftDens);       // 0 at the tuft centre, ~0.6 at its edge
      float tl = hash12(Cid * vec2(1.0, 5.1) + 4.4);
      tuftLen = mix(1.0, mix(0.5, 1.0, tl * tl) * (1.0 - 0.45 * smoothstep(0.1, 0.75, tr)), uTuftVar);
      tuftB = mix(0.5, hash12(Cid + 21.3), uTuftVar);
    }
    // 3. the strands: a fine lattice with one strand per cell, jittered about its cell (the near 2x2 cells are searched,
    //    so strands don't line up in rows - a regular lattice reads as a comb at the silhouette), tapering to its tip;
    //    anti-aliased (coverage over the pixel's footprint) and fading toward the tip: a soft haze of fine hairs
    float rows = floor(uDensity * 0.5);
    float v = b.y * rows, row0 = floor(v);
    float ring0 = max(4.0, floor(uDensity * sin((row0 + 0.5) / rows * PI) + 0.5));
    float aa = clamp(0.5 * uSoft * length(vec2(fwUv.x * ring0, fwUv.y * rows)), 0.04, 0.7);
    float bestA = 0.0;
    float rs = fract(v) < 0.5 ? -1.0 : 1.0;
    for (int j = 0; j < 2; j++) {
      float row = row0 + rs * float(j);
      if (row < 0.0 || row > rows - 1.0) continue;
      float ring = max(4.0, floor(uDensity * sin((row + 0.5) / rows * PI) + 0.5));
      float uu = fract(b.x) * ring, c0 = floor(uu), cs = fract(uu) < 0.5 ? -1.0 : 1.0;
      for (int i = 0; i < 2; i++) {
        float ci = c0 + cs * float(i);
        vec2 cell = vec2(mod(ci, ring), row);
        vec2 jit = vec2(hash12(cell + 13.7), hash12(cell + 71.3)) - 0.5;
        float dd = length(vec2(ci + 0.5 + 0.8 * jit.x - uu, row + 0.5 + 0.8 * jit.y - v)) * (1.0 - k);
        float r1 = hash12(cell * vec2(1.0, 7.31) + vec2(ring, 3.0));
        float sh = uCore + (1.0 - uCore) * tuftLen * mix(1.0 - uLenVar, 1.0, r1) * m;
        if (h > sh) continue;
        float tp = (h - uCore) / max(sh - uCore, 1e-3);
        float rad = uThick * (1.0 - 0.9 * tp);
        float a = (1.0 - smoothstep(rad - aa, rad + aa, dd)) * (1.0 - smoothstep(uFade, 1.0, tp));
        if (a > bestA) { bestA = a; tipT = tp; shade = hash12(cell * vec2(3.1, 1.0) + 5.5); }
      }
    }
    if (bestA < 0.004) discard;
    alpha = bestA;
  }
  vec3 N = normalize(vN);
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.2);
  // the painting's light: pale yellow from the upper left, a broad even middle, warm orange on the shadow side
  vec3 col = t < 0.3 ? mix(uB0, uB1, t / 0.3) : t < 0.55 ? mix(uB1, uB2, (t - 0.3) / 0.25) : t < 0.9 ? mix(uB2, uB3, (t - 0.55) / 0.35) : mix(uB3, uB4, (t - 0.9) / 0.1);
  col = mix(col, col * vec3(0.99, 0.86, 0.72), smoothstep(-0.2, -0.95, d.y) * uLowK);   // warmer low down
  // darker = more orange (red kept, green/blue down), never a duller yellow: deep in the fur, darker strands, tufts
  col *= mix(uAOTint, vec3(1.0), pow(hs, 0.8));
  col = mix(col, col * uTipCol, tipT * tipT * uTip);                                   // light strand tips
  col *= mix(vec3(1.0, 1.0 - 1.1 * uVar, 1.0 - 2.2 * uVar), vec3(1.0 + 0.25 * uVar, 1.0 + 0.4 * uVar, 1.0 + 0.6 * uVar), shade);
  col *= mix(vec3(1.0, 0.95, 0.88), vec3(1.0, 1.03, 1.06), tuftB);
  col *= mix(vec3(1.0), vec3(0.94, 0.85, 0.75), smoothstep(uEyeAO.x, uEyeAO.y, max(dot(d, uEyeS0), dot(d, uEyeS1))));   // eye contact shadow
  // blush: a soft gaussian spot (airbrushed, like the painting)
  float ab = acos(clamp(max(dot(d, uBlush0), dot(d, uBlush1)), -1.0, 1.0));
  col = mix(col, uBlushCol, exp(-pow(ab / uBlushMask.x, 2.0)) * uBlushAmt);
  col = mix(col, uRim, pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0) * uRimK * h * (0.3 + 0.7 * t));   // rim: light side only
  if (front > 0.5 && abs(q.x) < 2.2 && q.y > -3.6 && q.y < 1.6) col = paintMouth(col, q, uMouthOpen);
  gl_FragColor = vec4(col, alpha);
}`;

// limb fur: the same core + strands, but strands come from a 3D cell lattice projected onto the surface, so any closed
// mesh gets fur without UVs or seams (arms, feet)
const LIMB_VS = /* glsl */ `
attribute float shell;
uniform float uFur;
varying vec3 vN; varying vec3 vP; varying vec3 vNo; varying float vH; varying float vY;
void main() {
  vH = shell; vP = position; vNo = normal;
  vec4 w = modelMatrix * vec4(position + normal * (uFur * shell), 1.0);
  w.y -= 0.006 * shell * shell;
  vY = w.y;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const LIMB_FS = /* glsl */ `
uniform float uFreq, uThick, uCore;
uniform vec3 uLight, uC0, uC1, uC2, uC3, uRim, uAOTint;
varying vec3 vN; varying vec3 vP; varying vec3 vNo; varying float vH; varying float vY;
${RAMP}
vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
void main() {
  float h = vH;
  if (h > uCore + 0.001) {
    vec3 q = vP * uFreq, n = normalize(vNo), ip = floor(q), fp = q - ip;
    float best = 9.0, rr = 0.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec3 g = vec3(float(i), float(j), float(k)), o = hash33(ip + g), r = g + o - fp;
      float rn = dot(r, n);
      if (abs(rn) > 0.5) continue;
      vec3 rt = r - n * rn;
      float d2 = dot(rt, rt);
      if (d2 < best) { best = d2; rr = fract(o.x * 7.13 + o.y * 3.71 + o.z * 1.37); }
    }
    float sh = mix(0.62, 1.0, rr);
    if (h > sh) discard;
    if (sqrt(best) > uThick * (1.0 - (h - uCore) / max(sh - uCore, 1e-3))) discard;
  }
  vec3 N = normalize(vN);
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.2);
  vec3 col = ramp4(t, uC0, uC1, uC2, uC3);
  col = mix(col, col * vec3(0.99, 0.86, 0.72), smoothstep(0.15, -1.1, vY) * 0.5);
  col *= mix(uAOTint, vec3(1.0), clamp((h - uCore) / (1.0 - uCore), 0.0, 1.0));
  col = mix(col, uRim, pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0) * 0.35 * h);
  gl_FragColor = vec4(col, 1.0);
}`;

// the tuft's fur (pass 6; user: "머리털도 너무 매끈한데 … 털질감"): the limbs' 3D-cell strands in the tuft's colours, but
// soft and combed like the body's fur: each strand anti-aliased over the pixel's footprint and fading toward its tip
// (blended, drawn just before the body fur, which still blends over its foot), leaning toward the lobe's tip (comb)
const TUFT_VS = /* glsl */ `
attribute float shell; attribute vec3 comb;
uniform float uFur;
varying vec3 vN; varying vec3 vP; varying vec3 vNo; varying float vH; varying float vY; varying vec3 vC;
void main() {
  vH = shell; vP = position; vNo = normal; vC = comb;
  vec4 w = modelMatrix * vec4(position + normal * (uFur * shell), 1.0);
  w.y -= 0.006 * shell * shell;
  vY = w.y;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const TUFT_FS = /* glsl */ `
uniform float uFreq, uThick, uCore, uFade, uSoft, uTip, uLean;
uniform vec3 uLight, uC0, uC1, uC2, uC3, uRim, uAOTint, uTipCol;
varying vec3 vN; varying vec3 vP; varying vec3 vNo; varying float vH; varying float vY; varying vec3 vC;
${RAMP}
vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
void main() {
  vec3 n = normalize(vNo);
  float h = vH, alpha = 1.0, tipT = 0.0, hs = clamp((h - uCore) / (1.0 - uCore), 0.0, 1.0);
  vec3 L = vC - n * dot(vC, n);                                  // combed toward the lobe's tip, along the surface
  vec3 q = (vP - L * (uLean * hs)) * uFreq;                     // where this strand grows from
  float aa = clamp(uSoft * length(fwidth(q)), 0.04, 0.6);       // before any discard: the pixel's footprint, in cells
  if (h > uCore + 0.001) {
    vec3 ip = floor(q), fp = q - ip;
    float bestA = 0.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec3 g = vec3(float(i), float(j), float(k)), o = hash33(ip + g), r = g + o - fp;
      float rn = dot(r, n);
      if (abs(rn) > 0.5) continue;
      float sh = mix(0.62, 1.0, fract(o.x * 7.13 + o.y * 3.71 + o.z * 1.37));
      if (h > sh) continue;
      float tp = (h - uCore) / max(sh - uCore, 1e-3), rad = uThick * (1.0 - 0.9 * tp);
      float a = (1.0 - smoothstep(rad - aa, rad + aa, length(r - n * rn))) * (1.0 - smoothstep(uFade, 1.0, tp));
      if (a > bestA) { bestA = a; tipT = tp; }
    }
    if (bestA < 0.02) discard;
    alpha = bestA;
  }
  vec3 N = normalize(vN);
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.2);
  vec3 col = ramp4(t, uC0, uC1, uC2, uC3);
  col *= mix(uAOTint, vec3(1.0), pow(clamp((h - uCore) / (1.0 - uCore), 0.0, 1.0), 0.8));
  col = mix(col, col * uTipCol, tipT * tipT * uTip);
  col = mix(col, uRim, pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0) * 0.35 * h);
  gl_FragColor = vec4(col, alpha);
}`;

// eyeballs: white balls with the iris painted round the gaze axis (+z); catch-lights placed on the iris in screen space
// (a big one up-left, a small one down-right, like the painting) so they stay put however the head turns
const EYE_VS = /* glsl */ `
varying vec3 vO; varying vec3 vN; varying vec3 vG;
void main() {
  vO = position;
  vN = normalize(normalMatrix * normal);
  vG = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const EYE_FS = /* glsl */ `
uniform vec3 uLight, uSocket;
uniform float uIris, uPupil;
varying vec3 vO; varying vec3 vN; varying vec3 vG;
void main() {
  vec3 o = normalize(vO), N = normalize(vN), G = normalize(vG);
  float l = clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.90, 0.80, 0.72), vec3(1.0, 0.995, 0.975), smoothstep(0.32, 0.88, l));
  col *= mix(0.84, 1.0, smoothstep(0.0, 0.5, dot(o, uSocket)));          // a little darker where it sinks into the fur
  float a = acos(clamp(o.z, -1.0, 1.0));
  float ir = 1.0 - smoothstep(uIris - 0.03, uIris + 0.006, a);
  vec2 ip = o.xy / sin(uIris);
  vec3 irc = mix(vec3(0.54, 0.27, 0.13), vec3(0.30, 0.12, 0.05), smoothstep(-0.95, 0.4, ip.y));     // lighter low down
  irc = mix(irc, vec3(0.20, 0.065, 0.02), smoothstep(0.6, 1.0, length(ip)) * 0.65);                // dark rim
  float pa = acos(clamp(dot(o, normalize(vec3(0.0, 0.12, 1.0))), -1.0, 1.0));
  irc = mix(irc, vec3(0.16, 0.045, 0.012), (1.0 - smoothstep(uPupil - 0.07, uPupil + 0.03, pa)) * 0.8);
  col = mix(col, irc, ir);
  vec2 h1 = G.xy + vec2(-0.21, 0.35), h2 = G.xy + vec2(0.30, -0.27);
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.152, 0.172, length(N.xy - h1))) * step(0.0, N.z));
  col = mix(col, vec3(1.0, 0.93, 0.91), (1.0 - smoothstep(0.045, 0.075, length(N.xy - h2))) * 0.75 * ir);
  gl_FragColor = vec4(col, 1.0);
}`;

const SMOOTH_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SMOOTH_FS = /* glsl */ `
uniform vec3 uLight, uC0, uC1, uC2, uC3; uniform float uSpec, uGround, uSheen;
varying vec3 vN; varying vec3 vW;
${RAMP}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.15);
  vec3 col = ramp4(t, uC0, uC1, uC2, uC3);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(N, normalize(uLight + vec3(0.0, 0.0, 1.0))), 0.0), 26.0) * uSpec;
  col = mix(col, uC3, pow(1.0 - clamp(N.z, 0.0, 1.0), 2.5) * uSheen);      // soft velvet edge
  col *= mix(0.8, 1.0, smoothstep(uGround, uGround + 0.2, vW.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const CAPE_VS = /* glsl */ `
attribute vec2 cuv; attribute vec2 cloth;
uniform float uOmega, uTime;
varying vec3 vN; varying vec2 vS;
void main() {
  vec3 p = position;
  float k = cuv.y, k2 = k * k;
  p -= vec3(uOmega * p.z, 0.0, -uOmega * p.x) * 0.10 * k2;                      // trails when turning
  vec3 rad = normalize(vec3(p.x, 0.0, p.z) + vec3(1e-5));
  p += rad * (min(uOmega * uOmega * 0.02, 0.16) + 0.012 * sin(uTime * 2.1 + cuv.x * 5.0)) * k2;   // flares, sways
  vN = normalize(normalMatrix * normal);
  vS = cloth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const CAPE_FS = /* glsl */ `
uniform vec3 uLight, uC0, uC1, uC2, uC3, uDot; uniform float uLin;
varying vec3 vN; varying vec2 vS;
${RAMP}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.1);
  vec3 col = ramp4(t, uC0, uC1, uC2, uC3);
  if (gl_FrontFacing) {
    vec2 q = vS / 0.19;
    q.x += mod(floor(q.y), 2.0) * 0.5;
    float dd = length(fract(q) - 0.5);
    col = mix(col, uDot * (0.78 + 0.22 * t), 1.0 - smoothstep(0.19, 0.225, dd));
  } else col *= uLin;
  gl_FragColor = vec4(col, 1.0);
}`;

const PAL = {
  fur: [0xee8a26, 0xfbb444, 0xffd96e, 0xfff29a],
  body: [0xef8f2c, 0xf9b850, 0xfdd877, 0xfff0a8],          // the body ramp: pale yellow, warm orange on the shadow side
  tuft: [0xf09a32, 0xfcc256, 0xffe184, 0xfff3b8],
  cape: [0xb32c52, 0xd4486a, 0xe65d7e, 0xf3829c],          // pass 7: a little deeper, like item_cape's coral pink
  cap: [0x29234a, 0x3b3466, 0x4e4682, 0x6a62a0],           // pass 7: item_gradcap's darker navy
  tassel: [0xc9701c, 0xe8922a, 0xf6b041, 0xffd27a],
  // the shop's gloves and shoes (sampled from item_gloves.webp / item_shoes.webp)
  glove: [0xd84c63, 0xf2667f, 0xfd8197, 0xffa9b6],
  cuff: [0xcfa98a, 0xe8c9ab, 0xf8e0c7, 0xfdf0e2],
  shoe: [0x2b78ab, 0x3b93c4, 0x4caadc, 0x76c6ee],
  sole: [0xd3b192, 0xe9ccb1, 0xfae5cf, 0xfff4e6],
  lace: [0x3a8cbd, 0x4fa6d8, 0x62bbea, 0x94d5f5],
};
// the body's light ramp (t = light term): stops at t = 0, 0.3, 0.55, 0.9, 1
const BODY = [0xee8e2c, 0xf2a743, 0xfacd66, 0xfede7c, 0xfdef95];
const AO_TINT = V(0.975, 0.925, 0.85);
const FUR_AO = V(1.0, 0.965, 0.905);         // the body's fur roots: a little deeper orange (low contrast, fine fur)
const ramp = (pal) => ({ uC0: { value: rgb(pal[0]) }, uC1: { value: rgb(pal[1]) }, uC2: { value: rgb(pal[2]) }, uC3: { value: rgb(pal[3]) } });
const smoothMat = (pal, spec = 0.14, sheen = 0) => new THREE.ShaderMaterial({
  vertexShader: SMOOTH_VS, fragmentShader: SMOOTH_FS, side: THREE.DoubleSide,
  uniforms: { uLight: { value: LIGHT }, ...ramp(pal), uSpec: { value: spec }, uSheen: { value: sheen }, uGround: { value: GROUND } },
});

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────────────────────────
/** a tube along points whose radius follows radius(t) (t 0..1); TubeGeometry's rings scaled, its normals kept */
function taper(points, radius, segs = 40, radial = 20) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position, P = V(0, 0, 0), Q = V(0, 0, 0);
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, P);
    const r = radius(i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      Q.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(k, Q.x, Q.y, Q.z);
    }
  }
  return { geo, curve };
}
/** put obj on the ball at direction d, radius r, its +z along d and +y up the face */
function onBall(obj, d, r) {
  const z = d.clone().normalize(), x = V(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  obj.position.copy(z).multiplyScalar(r);
  return obj;
}
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// signed distance pieces (p: any {x,y,z}); limbs are smooth unions of these, meshed by sdfLimb()
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** iq's round cone: spheres r1 at a and r2 at b joined by a cone */
function roundCone(a, b, r1, r2) {
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (p) => {
    const px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
    const y = px * bx + py * by + pz * bz, z = y - l2;
    const qx = px * l2 - bx * y, qy = py * l2 - by * y, qz = pz * l2 - bz * y, x2 = qx * qx + qy * qy + qz * qz;
    const y2 = y * y * l2, z2 = z * z * l2, k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
}
/** ellipsoid at c with orthonormal axes ax/ay/az and radii rx/ry/rz (iq's bound) */
function ellipsoid(c, ax, ay, az, rx, ry, rz) {
  return (p) => {
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const u = dx * ax.x + dy * ax.y + dz * ax.z, v = dx * ay.x + dy * ay.y + dz * ay.z, w = dx * az.x + dy * az.y + dz * az.z;
    const k0 = Math.hypot(u / rx, v / ry, w / rz), k1 = Math.hypot(u / (rx * rx), v / (ry * ry), w / (rz * rz));
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}
/** a frame for a hand: a = along the hand, c = the palm's normal (≈ +z), b = c × a */
function handFrame(a, c = V(0, 0, 1)) {
  a = a.clone().normalize(); const b = c.clone().cross(a).normalize(); return { a, b, c: a.clone().cross(b).normalize() };
}
/** mesh an SDF blob by rays from an axis (start cap → axis samples → end cap) out to its zero level; normals = the SDF
 *  gradient, so there are no seams and shell fur can be pushed out along them */
function sdfLimb(sdf, axis, { rows = 40, cols = 40, cap = 12, maxT = 0.9 } = {}) {
  const curve = new THREE.CatmullRomCurve3(axis);
  const fr = curve.computeFrenetFrames(rows, false);
  const P0 = curve.getPointAt(0), P1 = curve.getPointAt(1);
  const rings = [];
  const dir = (T, N, B, ct, al, c, s) => V(0, 0, 0).addScaledVector(T, ct * Math.cos(al)).addScaledVector(N, c * Math.sin(al)).addScaledVector(B, s * Math.sin(al)).normalize();
  for (let a = 0; a < cap; a++) rings.push([P0, fr.tangents[0], fr.normals[0], fr.binormals[0], -1, (a / cap) * Math.PI / 2]);
  for (let i = 0; i <= rows; i++) rings.push([curve.getPointAt(i / rows), fr.tangents[i], fr.normals[i], fr.binormals[i], 0, Math.PI / 2]);
  for (let a = cap - 1; a >= 0; a--) rings.push([P1, fr.tangents[rows], fr.normals[rows], fr.binormals[rows], 1, (a / cap) * Math.PI / 2]);
  const pos = [], nor = [], idx = [], p = V(0, 0, 0), q = V(0, 0, 0), e = 4e-4;
  const f = (x, y, z) => sdf(q.set(x, y, z));
  for (const [O, T, N, B, ct, al] of rings) for (let j = 0; j <= cols; j++) {
    const th = (j / cols) * Math.PI * 2, d = dir(T, N, B, ct, al, Math.cos(th), Math.sin(th));
    let t = 0, prev = 0;
    for (let k = 0; k < 600 && t < maxT; k++) {
      const s = f(O.x + d.x * t, O.y + d.y * t, O.z + d.z * t);
      if (s >= 0) {
        let lo = prev, hi = t;
        for (let b = 0; b < 24; b++) { const mid = (lo + hi) / 2; if (f(O.x + d.x * mid, O.y + d.y * mid, O.z + d.z * mid) >= 0) hi = mid; else lo = mid; }
        t = (lo + hi) / 2; break;
      }
      prev = t; t += Math.max(-s * 0.9, 0.0015);
    }
    p.copy(O).addScaledVector(d, Math.min(t, maxT));
    pos.push(p.x, p.y, p.z);
    const n = V(f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)).normalize();
    nor.push(n.x, n.y, n.z);
  }
  const W = cols + 1;
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < cols; j++) {
    const a = r * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}
/** shell copies of a mesh for the limb fur */
function shells(base, n, core) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const k of Object.keys(base.attributes)) geo.setAttribute(k, base.getAttribute(k));
  geo.setAttribute('shell', new THREE.InstancedBufferAttribute(Float32Array.from({ length: n }, (_, i) => core + ((1 - core) * i) / (n - 1)), 1));
  geo.instanceCount = n;
  return geo;
}
const limbMat = new THREE.ShaderMaterial({
  vertexShader: LIMB_VS, fragmentShader: LIMB_FS,
  uniforms: { uFur: { value: LIMB.fur }, uFreq: { value: LIMB.freq }, uThick: { value: 0.62 }, uCore: { value: LIMB.core },
    uLight: { value: LIGHT }, ...ramp(PAL.fur), uRim: { value: rgb(0xffe09a) }, uAOTint: { value: AO_TINT } },
});
const furry = (geo) => { const m = new THREE.Mesh(shells(geo, LIMB.shells, LIMB.core), limbMat); m.frustumCulled = false; return m; };
// the tuft's fur: short (≈ the limbs'), its solid core sunk under pass 4's smooth surface by `sink`, so the fur's soft
// middle lies where that surface was and the tuft keeps its size
const TUFT = { fur: 0.045, shells: 16, core: 0.4, sink: 0.026, freq: 160, lean: 0.04 };
const tuftMat = new THREE.ShaderMaterial({
  vertexShader: TUFT_VS, fragmentShader: TUFT_FS, transparent: true,
  uniforms: { uFur: { value: TUFT.fur }, uFreq: { value: TUFT.freq }, uThick: { value: 0.38 }, uCore: { value: TUFT.core }, uFade: { value: 0.5 },
    uSoft: { value: 0.5 }, uTip: { value: 0.2 }, uTipCol: { value: V(1.02, 1.03, 1.05) }, uLean: { value: TUFT.lean },
    uLight: { value: LIGHT }, ...ramp(PAL.tuft), uRim: { value: rgb(0xffe09a) }, uAOTint: { value: V(0.99, 0.93, 0.84) } },
});
// its solid core draws in the opaque pass (the body fur blends over its foot, as over the limbs); the strands after the
// body fur (renderOrder 1), so their soft tips blend over the head behind them instead of cutting holes into it
const tuftCoreMat = new THREE.ShaderMaterial({ vertexShader: TUFT_VS, fragmentShader: TUFT_FS, uniforms: tuftMat.uniforms });
/** one indexed geometry from several with the same attributes */
function mergeGeo(list) {
  const out = new THREE.BufferGeometry(), idx = [];
  for (const k of Object.keys(list[0].attributes)) {
    const arr = new Float32Array(list.reduce((n, g) => n + g.getAttribute(k).array.length, 0));
    let o = 0; for (const g of list) { arr.set(g.getAttribute(k).array, o); o += g.getAttribute(k).array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, list[0].getAttribute(k).itemSize));
  }
  let off = 0; for (const g of list) { for (const i of g.index.array) idx.push(i + off); off += g.getAttribute('position').count; }
  out.setIndex(idx);
  return out;
}

// ── the tutor ────────────────────────────────────────────────────────────────────────────────────────────────────
const shared = { uOmega: { value: 0 }, uTime: { value: 0 } };
function buildTutor() {
  const root = new THREE.Group();          // turns (yaw) on the spot
  const upper = new THREE.Group();         // the ball + everything on it: head tilt, breathing, hops
  upper.rotation.z = POSE.roll;
  root.add(upper);
  // fur: SHELLS instanced copies of one body mesh, pushed out along the normal; strands cut out per shell. The body is
  // the sphere reshaped by bodyShape(): a little pear-shaped and lumpy, the face kept as fitted.
  const base = new THREE.SphereGeometry(SKIN, 160, 120);
  {
    const pos = base.attributes.position, nor = base.attributes.normal, n = pos.count, furp = new Float32Array(n * 2);
    const d = V(0, 0, 0), p = V(0, 0, 0), a = V(0, 0, 0), b = V(0, 0, 0), t1 = V(0, 0, 0), t2 = V(0, 0, 0), e = 2e-3;
    const at = (v) => { v.normalize(); return v.multiplyScalar(SKIN * bodyShape(v).s); };
    for (let i = 0; i < n; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const sh = bodyShape(d);
      p.copy(d).multiplyScalar(SKIN * sh.s);
      pos.setXYZ(i, p.x, p.y, p.z);
      furp[2 * i] = sh.len; furp[2 * i + 1] = sh.hang;
      t1.set(0, 1, 0).cross(d); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize(); t2.copy(d).cross(t1);
      at(a.copy(d).addScaledVector(t1, e)).sub(p); at(b.copy(d).addScaledVector(t2, e)).sub(p);
      const nn = a.cross(b).normalize(); if (nn.dot(d) < 0) nn.negate();
      nor.setXYZ(i, nn.x, nn.y, nn.z);
    }
    base.setAttribute('furp', new THREE.BufferAttribute(furp, 2));
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const k of ['position', 'normal', 'uv', 'furp']) geo.setAttribute(k, base.getAttribute(k));
  geo.setAttribute('shell', new THREE.InstancedBufferAttribute(Float32Array.from({ length: SHELLS }, (_, i) => CORE + ((1 - CORE) * i) / (SHELLS - 1)), 1));
  geo.instanceCount = SHELLS;
  const cosd = (deg) => Math.cos(deg * D2R);
  const mX = V(0, 1, 0).cross(FACE.mouth).normalize(), mY = FACE.mouth.clone().cross(mX);
  const eyeShadow = (d) => { const s = d.clone(); s.y -= 0.035; s.x += 0.02 * Math.sign(s.x); return s.normalize(); };
  const furMat = new THREE.ShaderMaterial({
    vertexShader: FUR_VS, fragmentShader: FUR_FS, transparent: true,
    uniforms: {
      uFur: { value: FUR }, uOmega: shared.uOmega, uDensity: { value: 520 }, uThick: { value: 0.42 }, uCore: { value: CORE },
      uTuftDens: { value: 110 }, uClump: { value: 0 }, uTuftVar: { value: 0.25 }, uLenVar: { value: 0.45 },
      uLean: { value: 0.014 }, uVar: { value: 0.05 }, uTip: { value: 0.35 }, uFade: { value: 0.7 }, uSoft: { value: 0.25 },
      uTipCol: { value: V(1.04, 1.06, 1.12) }, uSkin: { value: SKIN }, uFaceC: { value: FACE_C },
      uLight: { value: LIGHT }, ...ramp(PAL.body), uAOTint: { value: FUR_AO }, uLowK: { value: 0.7 },
      uB0: { value: rgb(BODY[0]) }, uB1: { value: rgb(BODY[1]) }, uB2: { value: rgb(BODY[2]) }, uB3: { value: rgb(BODY[3]) }, uB4: { value: rgb(BODY[4]) },
      uBlushCol: { value: rgb(0xfa8a6c) }, uBlushAmt: { value: 0.7 }, uRim: { value: rgb(0xffe09a) }, uRimK: { value: 0.35 },
      uSock0: { value: FACE.sock[0] }, uSock1: { value: FACE.sock[1] }, uSockR: { value: FACE.sockR },
      uEye0: { value: FACE.eyes[0] }, uEye1: { value: FACE.eyes[1] }, uEyeS0: { value: eyeShadow(FACE.eyes[0]) }, uEyeS1: { value: eyeShadow(FACE.eyes[1]) },
      uEyeMask: { value: new THREE.Vector2(cosd(18.5), cosd(12)) }, uEyeAO: { value: new THREE.Vector2(cosd(14.5), cosd(10)) },
      uMouth: { value: FACE.mouth }, uMouthX: { value: mX }, uMouthY: { value: mY }, uMouthSize: { value: FACE.mouthSize }, uMouthOpen: { value: 0 }, uMouthCut: { value: V(-0.08, 0.25, 0.25) },
      uBlush0: { value: FACE.blush[0] }, uBlush1: { value: FACE.blush[1] }, uBlushMask: { value: new THREE.Vector2(7 * D2R, 0) },   // x: gaussian radius
      uPressAx: { value: new THREE.Vector4(0, 1, 0, 2) }, uPress: { value: V(2, 0.02, 0) }, uPressLim: { value: new THREE.Vector4(0, 1, 0, -2) },
      // pass 9: the hair ribbon's footprint (read only by furFoot9, the FOOT9 variant worn with the ribbon)
      uFootTex: { value: null }, uFootA: { value: new THREE.Vector4(0, 1, 0, 1) }, uFootB: { value: new THREE.Vector4(1, 0, 0, 1) }, uFootC: { value: new THREE.Vector4(0, 0, 1, 0) },
      // pass 10: the headphones' cups (read only by the PHONES10 variant worn with them)
      uCup0: { value: new THREE.Vector4(1, 0, 0, 2) }, uCup1: { value: new THREE.Vector4(-1, 0, 0, 2) }, uCupP: { value: new THREE.Vector2(0.02, 0) },
    },
  });
  const fur = new THREE.Mesh(geo, furMat); fur.frustumCulled = false;
  upper.add(fur);
  // eyes: balls just under the fur (pivot: +z out of the face, +y up it — blinking squashes it), turned to the gaze point
  const eyeGeo = new THREE.SphereGeometry(FACE.eyeR, 64, 48);
  const eyes = FACE.eyes.map((d) => {
    const pivot = onBall(new THREE.Group(), d, FACE.eyeC);
    const inv = pivot.quaternion.clone().invert();
    const gz = FACE.gaze.clone().sub(pivot.position).applyQuaternion(inv).normalize();      // gaze, in the pivot's frame
    const gx = V(0, 1, 0).cross(gz).normalize(), gy = gz.clone().cross(gx);                // x right, y up, z = gaze
    const ball = new THREE.Mesh(eyeGeo, new THREE.ShaderMaterial({
      vertexShader: EYE_VS, fragmentShader: EYE_FS,
      uniforms: { uLight: { value: LIGHT }, uIris: { value: 41 * D2R }, uPupil: { value: 20 * D2R }, uSocket: { value: V(0, 0, 1) } },
    }));
    ball.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(gx, gy, gz));
    ball.material.uniforms.uSocket.value = V(0, 0, 1).applyQuaternion(ball.quaternion.clone().invert());
    pivot.scale.z = 0.88;                                                                 // a little flatter out of the face
    pivot.add(ball); upper.add(pivot);
    return pivot;
  });
  // the tuft on top: a plump lobe leaning left from the crown and a short one lying forward in front of it (pass 4's
  // shapes), furry since pass 6: a core sunk TUFT.sink under the old surface + short soft fur combed toward each lobe's
  // tip. Both lobes in one geometry, so the shells go inner -> outer over both (no sorting between the lobes).
  const tuft = [];                       // its meshes (hats hide it)
  const tuftGeo = mergeGeo([
    [V(-0.09, 0.9, 0.03), V(-0.268, 1.05, 0.07), 0.074, 0.064],
    [V(-0.11, 0.93, 0.22), V(-0.215, 0.885, 0.41), 0.062, 0.056],
  ].map(([a, b, r1, r2]) => {
    const geo = sdfLimb(roundCone(a, b, r1 - TUFT.sink, r2 - TUFT.sink), [a, a.clone().lerp(b, 0.5), b], { rows: 20, cols: 32, cap: 10, maxT: 0.3 });
    const ax = b.clone().sub(a).normalize(), n = geo.attributes.position.count;
    geo.setAttribute('comb', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => ax.getComponent(i % 3)), 3));
    return geo;
  }));
  {
    const coreGeo = tuftGeo.clone();
    coreGeo.setAttribute('shell', new THREE.BufferAttribute(new Float32Array(coreGeo.attributes.position.count).fill(TUFT.core), 1));
    tuft.push(new THREE.Mesh(coreGeo, tuftCoreMat)); upper.add(tuft[0]);
    const fr = new THREE.InstancedBufferGeometry();
    fr.index = tuftGeo.index;
    for (const k of Object.keys(tuftGeo.attributes)) fr.setAttribute(k, tuftGeo.getAttribute(k));
    fr.setAttribute('shell', new THREE.InstancedBufferAttribute(Float32Array.from({ length: TUFT.shells }, (_, i) => TUFT.core + ((1 - TUFT.core) * (i + 1)) / TUFT.shells), 1));
    fr.instanceCount = TUFT.shells;
    const fringe = new THREE.Mesh(fr, tuftMat); fringe.frustumCulled = false; fringe.renderOrder = 1; upper.add(fringe); tuft.push(fringe);
  }
  // arms: furry mittens with a thumb, the left one raised (waves), the right one hanging. Built round the shoulder.
  const arm = ({ S, W, H, a, rs, rw, hand, thumb }) => {
    const F = handFrame(a);
    const up = roundCone(S, W, rs, rw), mit = ellipsoid(H, F.a, F.b, F.c, hand[0], hand[1], hand[2]);
    const tb = H.clone().addScaledVector(F.a, thumb[0]).addScaledVector(F.b, thumb[1]);
    const tt = tb.clone().addScaledVector(F.a, thumb[2]).addScaledVector(F.b, thumb[3]);
    const th = roundCone(tb, tt, thumb[4], thumb[5]);
    const sdf = (p) => smin(smin(up(p), mit(p), 0.09), th(p), 0.05);
    const geo = sdfLimb(sdf, [S, S.clone().lerp(W, 0.5), W, H], { rows: 44, cols: 44, cap: 14, maxT: 0.7 });
    geo.translate(-S.x, -S.y, -S.z);
    const g = new THREE.Group(); g.position.copy(S); g.add(furry(geo)); upper.add(g);
    g.userData.hand = { sdf, S, W, H, F, hand };          // for the glove (built on first use)
    return g;
  };
  const armL = arm({ S: V(-0.62, -0.16, 0.02), W: V(-1.0, -0.03, 0.08), H: V(-1.185, 0.17, 0.09), a: V(-0.46, 0.89, 0), rs: 0.135, rw: 0.125,
    hand: [0.235, 0.17, 0.16], thumb: [0.053, -0.072, 0.047, -0.093, 0.05, 0.044] });
  const armR = arm({ S: V(0.6, 0.02, 0.02), W: V(0.98, -0.13, 0.08), H: V(1.07, -0.31, 0.09), a: V(0.5, -0.866, 0), rs: 0.14, rw: 0.13,
    hand: [0.2, 0.15, 0.15], thumb: [0.03, -0.062, 0.045, -0.062, 0.048, 0.043] });
  // feet stand on the ground: they don't tilt with the head
  const feet = [-0.303, 0.285].map((x) => {
    const top = V(x, -0.72, 0.08), bot = V(x, GROUND + LIMB.fur * 0.7 + 0.135, 0.13);
    const foot = roundCone(top, bot, 0.172, 0.135);
    const m = furry(sdfLimb(foot, [top, bot], { rows: 24, cols: 40, cap: 12, maxT: 0.5 }));
    m.userData.at = V(x, GROUND, 0.13);                  // where its shoe goes
    root.add(m);
    return m;
  });
  return { root, upper, eyes, armL, armR, feet, fur, furMat, tuft };
}

// ── items ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** the cape: gathered at the back of the neck under a rolled collar, tied on with two cords that run round the
 *  shoulders to a knot on each side; the cloth drapes over the round back, then falls from the ball's widest point
 *  behind the body, widening a little to a wavy hem just above the ground. Low down its cross-section flattens, so the
 *  sides hang behind the body instead of wrapping round it. It trails and flares when the tutor turns (CAPE_VS).
 *  φ: angle round the body from the back, u: -1..1 across the cloth, k: 0..1 down it. */
function buildCape() {
  const g = new THREE.Group();
  const RC = 1.04;                                            // the cloth lies on the fur tips
  const NU = 64, NV = 52, PHI0 = 27 * D2R, PHI1 = 63 * D2R, HEM = -0.93;
  const topY = (u) => 0.5 - 0.09 * u * u;                     // the gathered top: high at the back of the neck
  const onFur = (phi, y, r = RC) => { const h = Math.sqrt(Math.max(0, r * r - y * y)); return V(-Math.sin(phi) * h, y, -Math.cos(phi) * h); };
  // on the reshaped fur surface (+ off): the ties and bows follow the body's outline, so they stay behind it
  const onBody = (phi, y, off) => { let p = onFur(phi, y); for (let it = 0; it < 3; it++) p = onFur(phi, y, furTip(p.clone().normalize()) + off); return p; };
  const pos = [], cuv = [], idx = [], P = [];
  for (let j = 0; j <= NV; j++) {
    const k = j / NV, row = [];
    for (let i = 0; i <= NU; i++) {
      const u = -1 + (2 * i) / NU;
      const yT = topY(u), yH = HEM + 0.06 * u * u + 0.022 * Math.cos(u * 9.5);
      const y = yT + (yH - yT) * Math.pow(k, 0.9);
      const phiMax = PHI0 + (PHI1 - PHI0) * Math.pow(k, 0.7);
      // the cloth's middle line: on the ball above its widest point, straight down (a little flare) below it
      const rb = (y > 0 ? Math.sqrt(Math.max(0, RC * RC - y * y)) : RC) + 0.01 + 0.02 * k + (y < 0 ? 0.09 * Math.pow(-y, 1.5) : 0);
      const flat = THREE.MathUtils.smoothstep(k, 0.3, 1.0);            // 0: round the ball, 1: a flatter sheet behind it
      const Rarc = rb * (1 + 0.9 * flat);
      const psiMax = Math.asin(Math.min(0.999, (rb * Math.sin(phiMax)) / Rarc)), psi = u * psiMax;
      let x = -Rarc * Math.sin(psi), z = -(rb - Rarc * (1 - Math.cos(psi)));
      // folds fanning out from the gathered neck, deeper toward the hem
      const fold = (0.004 + 0.034 * Math.pow(k, 1.1)) * Math.sin(u * Math.PI * 2.5 + 0.5);
      x += -Math.sin(psi) * fold; z += -Math.cos(psi) * fold;
      let rr = Math.hypot(x, z), need = Math.sqrt(Math.max(0, RC * RC - y * y));      // never inside the fur
      for (let it = 0; it < 2; it++) { const R = furTip(V(x, y, z).normalize()) + 0.03; need = Math.max(need, Math.sqrt(Math.max(0, R * R - y * y))); }
      if (rr < need) { x *= need / rr; z *= need / rr; }
      const p = V(x, y, z);
      pos.push(p.x, p.y, p.z); cuv.push(u, k); row.push(p);
    }
    P.push(row);
  }
  // cloth coordinates for the dots: distance across each row (centred) and down the middle column
  const cloth = [], down = [0];
  for (let j = 1; j <= NV; j++) down.push(down[j - 1] + P[j][NU / 2].distanceTo(P[j - 1][NU / 2]));
  for (let j = 0; j <= NV; j++) {
    const acc = [0];
    for (let i = 1; i <= NU; i++) acc.push(acc[i - 1] + P[j][i].distanceTo(P[j][i - 1]));
    for (let i = 0; i <= NU; i++) cloth.push(acc[i] - acc[NU] / 2, down[j]);
  }
  const W = NU + 1;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, d, a, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('cuv', new THREE.Float32BufferAttribute(cuv, 2));
  geo.setAttribute('cloth', new THREE.Float32BufferAttribute(cloth, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    vertexShader: CAPE_VS, fragmentShader: CAPE_FS, side: THREE.DoubleSide,
    uniforms: { uOmega: shared.uOmega, uTime: shared.uTime, uLight: { value: LIGHT }, ...ramp(PAL.cape),
      uDot: { value: rgb(0xfbead6) }, uLin: { value: 0.86 } },
  });
  const cape = new THREE.Mesh(geo, mat); cape.frustumCulled = false; g.add(cape);
  // the collar: a rolled band along the gathered top; ties from its ends over the shoulders to a little bow each side
  // (far enough back that the bows stay hidden behind the body from the front)
  const collarM = smoothMat([0xd34d6e, 0xec6d88, 0xf88ea4, 0xffc0cc], 0.22);
  const collar = [];
  for (let i = 0; i <= 32; i++) { const u = -1.08 + (2.16 * i) / 32; collar.push(onBody(u * PHI0, topY(u), 0.03)); }
  g.add(new THREE.Mesh(taper(collar, (t) => 0.062 - 0.016 * (2 * t - 1) ** 4, 80, 16).geo, collarM));
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, phi = s * (1.08 * PHI0 + (58 * D2R - 1.08 * PHI0) * t), y = topY(1.08) + (0.24 - topY(1.08)) * Math.sin(t * Math.PI / 2);
      pts.push(onBody(phi, y, -0.004));
    }
    g.add(new THREE.Mesh(taper(pts, () => 0.03, 40, 12).geo, collarM));
    const end = pts[16], out = end.clone().normalize(), dn = V(0, -1, 0).projectOnPlane(out).normalize(), side = out.clone().cross(dn);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 12), collarM); knot.position.copy(end).addScaledVector(out, 0.015); g.add(knot);
    for (const [a, b] of [[1, 0.6], [-1, 0.6], [1, -1.4], [-1, -1.6]]) {      // two loops up-and-out, two tails down
      const tail = b < 0, len = tail ? 0.075 : 0.06;
      const dirv = side.clone().multiplyScalar(a * (tail ? 0.35 : 1)).addScaledVector(dn, -b * (tail ? 1 : 0.5)).normalize();
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), collarM);
      lobe.scale.set(len, tail ? 0.022 : 0.034, 0.016);
      lobe.position.copy(end).addScaledVector(out, 0.012).addScaledVector(dirv, len * 0.85);
      lobe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dirv, out.clone().cross(dirv), out));
      g.add(lobe);
    }
  }
  return g;
}
/** the grad cap: perched on the head top a little to the right, tilted, the tassel on the right */
function buildCap() {
  const g = new THREE.Group();
  const capM = smoothMat(PAL.cap, 0.2), tasM = smoothMat(PAL.tassel, 0.25);
  const skull = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.43, 0.24, 48, 1, true), capM); skull.position.y = 0.0; g.add(skull);
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.06, 0.98, 4, 0.025), capM); board.position.y = 0.14; board.rotation.y = 0.32; g.add(board);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 12), capM); btn.scale.set(1, 0.45, 1); btn.position.y = 0.18; g.add(btn);
  const edge = V(Math.cos(-0.32) * 0.49 + 0.0, 0.17, -Math.sin(-0.32) * 0.0 + 0.2);
  const { geo: cord } = taper([V(0.02, 0.19, 0.0), V(0.25, 0.185, 0.08), edge.clone().setX(0.47), V(0.5, 0.05, 0.22), V(0.5, -0.1, 0.22)], () => 0.016, 40, 8);
  g.add(new THREE.Mesh(cord, tasM));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), tasM); knot.position.set(0.5, -0.11, 0.22); g.add(knot);
  const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.16, 16), tasM); fringe.position.set(0.5, -0.2, 0.22); g.add(fringe);
  // pass 7: the magenta band round the tassel's head (item_gradcap), a little bigger and lower like the 2D cap
  const tband = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.039, 0.04, 16), smoothMat([0x8e2468, 0xb83a86, 0xd456a0, 0xec86c0], 0.2)); tband.position.set(0.5, -0.135, 0.22); g.add(tband);
  g.position.set(0.17, 0.955, -0.04); g.rotation.set(0.08, 0, -0.16); g.scale.setScalar(1.1);
  return g;
}

// ── gloves + shoes (pass 6) ────────────────────────────────────────────────────────────────────────────────────────
// The shop's mittens (item_gloves: coral-pink clay, a cream ribbed knit cuff) and high-tops (item_shoes: sky blue, a
// cream rubber sole and toe cap, blue laces through cream eyelets, a pink bow with cream polka dots) as 3D pieces on
// the tutor's own hands and feet, so they turn with it (user: "꾸미는 아이템하고도 다시 잘 맞춰봐 신발이랑 장갑").
const smax = (a, b, k) => -smin(-a, -b, k);
/** surface nets: mesh an SDF inside the box lo..hi at cell size h; vertices projected onto the zero level, normals =
 *  the SDF gradient (closed and seam-free for any shape inside the box) */
function sdfNets(sdf, lo, hi, h) {
  const nx = Math.ceil((hi.x - lo.x) / h) + 1, ny = Math.ceil((hi.y - lo.y) / h) + 1, nz = Math.ceil((hi.z - lo.z) / h) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k), F = new Float32Array(nx * ny * nz), q = V(0, 0, 0);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[at(i, j, k)] = sdf(q.set(lo.x + i * h, lo.y + j * h, lo.z + k * h));
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];   // corner bits: x 1, y 2, z 4
  const cid = new Int32Array(nx * ny * nz).fill(-1), pos = [], nor = [], c = new Float32Array(8), e = 5e-4;
  const grad = (p) => V(sdf(q.set(p.x + e, p.y, p.z)) - sdf(q.set(p.x - e, p.y, p.z)), sdf(q.set(p.x, p.y + e, p.z)) - sdf(q.set(p.x, p.y - e, p.z)), sdf(q.set(p.x, p.y, p.z + e)) - sdf(q.set(p.x, p.y, p.z - e))).divideScalar(2 * e);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let b = 0; b < 8; b++) { c[b] = F[at(i + (b & 1), j + ((b >> 1) & 1), k + (b >> 2))]; if (c[b] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((c[a] < 0) === (c[b] < 0)) continue;
      const t = c[a] / (c[a] - c[b]);
      sx += (a & 1) + t * ((b & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1)); sz += (a >> 2) + t * ((b >> 2) - (a >> 2)); n++;
    }
    const p = V(lo.x + (i + sx / n) * h, lo.y + (j + sy / n) * h, lo.z + (k + sz / n) * h);
    for (let it = 0; it < 3; it++) { const g = grad(p), sd = sdf(q.copy(p)); p.addScaledVector(g, -sd / Math.max(g.lengthSq(), 1e-9)); }
    const g = grad(p).normalize();
    cid[at(i, j, k)] = pos.length / 3; pos.push(p.x, p.y, p.z); nor.push(g.x, g.y, g.z);
  }
  const idx = [], A = V(0, 0, 0), B = V(0, 0, 0), C = V(0, 0, 0), N = V(0, 0, 0);
  const quad = (a, b, cc, d) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return;
    A.fromArray(pos, 3 * a); B.fromArray(pos, 3 * b); C.fromArray(pos, 3 * cc);       // wind it to face along the gradient
    N.set(nor[3 * a] + nor[3 * b] + nor[3 * cc], nor[3 * a + 1] + nor[3 * b + 1] + nor[3 * cc + 1], nor[3 * a + 2] + nor[3 * b + 2] + nor[3 * cc + 2]);
    if (B.sub(A).cross(C.sub(A)).dot(N) > 0) idx.push(a, b, cc, a, cc, d); else idx.push(a, cc, b, a, d, cc);
  };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const s0 = F[at(i, j, k)] < 0;
    if (j > 0 && k > 0 && s0 !== (F[at(i + 1, j, k)] < 0)) quad(cid[at(i, j, k)], cid[at(i, j - 1, k)], cid[at(i, j - 1, k - 1)], cid[at(i, j, k - 1)]);
    if (i > 0 && k > 0 && s0 !== (F[at(i, j + 1, k)] < 0)) quad(cid[at(i, j, k)], cid[at(i - 1, j, k)], cid[at(i - 1, j, k - 1)], cid[at(i, j, k - 1)]);
    if (i > 0 && j > 0 && s0 !== (F[at(i, j, k + 1)] < 0)) quad(cid[at(i, j, k)], cid[at(i - 1, j, k)], cid[at(i - 1, j - 1, k)], cid[at(i, j - 1, k)]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}
// the pieces' own frame: position (vL) and normals for the item shaders
const DOT_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vN = normalize(normalMatrix * normal); vL = position;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const itemMat = (pal, spec, sheen, ground = GROUND - 0.15) => { const m = smoothMat(pal, spec, sheen); m.uniforms.uGround.value = ground; return m; };

/** a mitten on one hand (arm group frame): the bare mitten + thumb blown up past its fur and cut off inside the cuff;
 *  the cuff a ribbed knit roll round the wrist, just wider than everything it covers (the arm's fur, the mitten's
 *  opening). It sits in the arm's group, so it waves with the hand. */
const GLOVE = { inf: 0.042, len: 0.155, wall: 0.01, ribs: 22, rib: 0.009 };
function buildGlove({ sdf, S, W, H, F, hand }) {
  const g = new THREE.Group();
  const u = F.a.clone().add(H.clone().sub(W).normalize()).normalize();      // the cuff's axis: between forearm and hand
  const e1 = V(0, 0, 1).cross(u).normalize(), e2 = u.clone().cross(e1);
  const q = V(0, 0, 0), O = V(0, 0, 0);
  const radAt = (s, off) => {               // how far the hand (blown up by off) reaches from the axis at H + u·s
    let R = 0;
    for (let k = 0; k < 48; k++) {
      const th = (k / 48) * 2 * Math.PI, cx = Math.cos(th), cy = Math.sin(th);
      O.copy(H).addScaledVector(u, s);
      let t = 0;
      while (t < 0.5 && sdf(q.copy(O).addScaledVector(e1, cx * t).addScaledVector(e2, cy * t)) - off < 0) t += 0.002;
      R = Math.max(R, t);
    }
    return R;
  };
  // the wrist = the narrowest cross-section between forearm and palm; the cuff sits on it, a little toward the hand
  let sw = -0.15, best = 9;
  for (let s = -0.3; s <= -0.04; s += 0.01) { const r = radAt(s, GLOVE.inf); if (r < best) { best = r; sw = s; } }
  const L = GLOVE.len, sc = sw + 0.02, C = H.clone().addScaledVector(u, sc);
  let R = 0;
  for (let s = sc - 0.3 * L; s <= sc + 0.5 * L + 1e-4; s += L / 8) R = Math.max(R, radAt(s, GLOVE.inf));
  // the mitten: the bare mitten + thumb blown up past its fur, cut off inside the cuff
  const cut = L * 0.2, along = (p) => (p.x - C.x) * u.x + (p.y - C.y) * u.y + (p.z - C.z) * u.z;
  const gsdf = (p) => Math.max(sdf(p) - GLOVE.inf, -along(p) - cut);
  const mitten = sdfLimb(gsdf, [C.clone().addScaledVector(u, -cut * 0.6), C.clone().lerp(H, 0.5), H], { rows: 48, cols: 56, cap: 18, maxT: 0.7 });
  // the cuff: a knit roll with ribs (round ribs, narrow grooves) round the wrist, just wider than what it covers
  const Rc = R + GLOVE.wall, rr = 0.034;
  const csdf = (p) => {
    const x = p.x - C.x, y = p.y - C.y, z = p.z - C.z;
    const h = x * u.x + y * u.y + z * u.z, a = x * e1.x + y * e1.y + z * e1.z, b = x * e2.x + y * e2.y + z * e2.z;
    const rib = GLOVE.rib * Math.pow(Math.abs(Math.cos(GLOVE.ribs * 0.5 * Math.atan2(b, a))), 0.4);
    const dx = Math.hypot(a, b) - (Rc + rib - rr), dy = Math.abs(h) - (L / 2 - rr);
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rr;
  };
  const cuff = sdfLimb(csdf, [C.clone().addScaledVector(u, -L * 0.3), C, C.clone().addScaledVector(u, L * 0.3)], { rows: 12, cols: 224, cap: 12, maxT: 0.5 });
  for (const geo of [mitten, cuff]) geo.translate(-S.x, -S.y, -S.z);
  g.add(new THREE.Mesh(mitten, itemMat(PAL.glove, 0.14, 0.12)), new THREE.Mesh(cuff, itemMat(PAL.cuff, 0.04, 0.1)));
  g.userData.fit = { wrist: sw, R, Rc };
  return g;
}

/** one high-top (both feet share it), in a frame on the ground under the foot: +z to the toe, +y up. The body hides it
 *  above ~0.25, so its ankle just closes round the (lifted) furry foot under the fur; what shows is the chubby toe box
 *  with its cream cap, the sole, and the laces + bow on the instep just under the fur. */
const SHOE = { lift: 0.05, toeOut: 7 * D2R };
function uneven2(x, z, r1, r2, h) {          // iq's uneven capsule in 2D: circles r1 at z = 0 and r2 at z = h
  x = Math.abs(x);
  const b = (r1 - r2) / h, a = Math.sqrt(1 - b * b), k = -b * x + a * z;
  if (k < 0) return Math.hypot(x, z) - r1;
  if (k > a * h) return Math.hypot(x, z - h) - r2;
  return a * x + b * z - r1;
}
const slab = (d2, y, y0, y1, r) => { const wx = d2 + r, wy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r); return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - r; };
let shoeParts = null;
function buildShoeParts() {
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const print = (x, z) => uneven2(x, z + 0.045, 0.19, 0.2, 0.215);           // the footprint: heel circle → toe circle
  const sole = (p) => smin(slab(print(p.x, p.z) - 0.012, p.y, 0, 0.036, 0.015), slab(print(p.x, p.z), p.y, 0.024, 0.07, 0.017), 0.006);
  const heel = ellipsoid(V(0, 0.15, -0.025), X, Y, Z, 0.207, 0.175, 0.207);           // a puffy heel...
  const col = roundCone(V(0, 0.2, -0.03), V(0, 0.34, -0.03), 0.188, 0.186);              // ...closing up round the ankle
  const ankle = (p) => smin(heel(p), col(p), 0.06);
  const toe = ellipsoid(V(0, 0.1, 0.165), X, Y, Z, 0.19, 0.122, 0.21);
  // a stitched seam slanting up the side panel (a shallow groove), like the art's quarter panel
  const upper0 = (p) => smax(smax(smin(ankle(p), toe(p), 0.1), 0.045 - p.y, 0.01), p.y - 0.33, 0.02);
  const upper = (p) => {
    const u0 = upper0(p), depth = 0.005 * sstep(0.07, 0.13, Math.abs(p.x));
    const groove = Math.max(Math.abs(p.z - 0.035 + 0.55 * (p.y - 0.05)) - 0.0045, -u0 - depth);
    return smax(u0, -groove, 0.004);
  };
  const capR = ellipsoid(V(0, 0.0, 0.42), X, Y, Z, 0.34, 0.245, 0.245);
  const cap = (p) => smax(upper(p) - 0.009, capR(p), 0.012);
  const parts = {                                                                  // boxes: each part's bound + a margin
    sole: sdfNets(sole, V(-0.235, -0.01, -0.27), V(0.235, 0.08, 0.40), 0.005),
    upper: sdfNets(upper, V(-0.225, 0.025, -0.255), V(0.225, 0.355, 0.395), 0.0065),
    cap: sdfNets(cap, V(-0.225, 0.015, 0.14), V(0.225, 0.27, 0.40), 0.0065),
  };
  // the instep's top surface (y at x, z) and its normal, for the eyelets, laces and bow
  const q = V(0, 0, 0);
  const top = (x, z) => { let a = 0.06, b = 0.5; for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (upper(q.set(x, m, z)) < 0) a = m; else b = m; } return V(x, (a + b) / 2, z); };
  const nrm = (p) => { const e = 1e-3; return V(upper(q.set(p.x + e, p.y, p.z)) - upper(q.set(p.x - e, p.y, p.z)), upper(q.set(p.x, p.y + e, p.z)) - upper(q.set(p.x, p.y - e, p.z)), upper(q.set(p.x, p.y, p.z + e)) - upper(q.set(p.x, p.y, p.z - e))).normalize(); };
  parts.top = top; parts.nrm = nrm;
  // eyelets: two pairs on the instep; laces: a bar across the lower pair, an X up to the upper pair
  const EX = 0.08, ZL = 0.29, ZU = 0.245;
  parts.eyelets = [[-EX, ZL], [EX, ZL], [-EX, ZU], [EX, ZU]].map(([x, z]) => { const p = top(x, z); return { p, n: nrm(p) }; });
  const lace = (x0, z0, x1, z1) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, p = top(x, z); pts.push(p.addScaledVector(nrm(p), 0.013)); } return taper(pts, () => 0.0115, 24, 10).geo; };
  parts.laces = [lace(-EX, ZL, EX, ZL), lace(-EX, ZL, EX, ZU), lace(EX, ZL, -EX, ZU)];
  // the bow: pass 8, a small copy of the hair ribbon (item_shoes' bow: two puffy polka-dot loops, a knot, short tails)
  parts.bow = bowMesh('ribbon', 0.000267, { tails: 0.65, h: 6, dots: RIBBON8.dotsAt.shoe });
  const bp = top(0, 0.225);
  parts.bowAt = bp.addScaledVector(nrm(bp), 0.016);
  parts.bowN = nrm(bp);
  return parts;
}
function buildShoe() {
  shoeParts ??= buildShoeParts();
  const P = shoeParts, g = new THREE.Group();
  const blue = itemMat(PAL.shoe, 0.16, 0.12), cream = itemMat(PAL.sole, 0.07, 0.06), laceM = itemMat(PAL.lace, 0.22, 0.1);
  g.add(new THREE.Mesh(P.sole, cream), new THREE.Mesh(P.upper, blue), new THREE.Mesh(P.cap, cream));
  const ring = new THREE.TorusGeometry(0.017, 0.0065, 10, 24), ringM = itemMat(PAL.sole, 0.25, 0.05);
  for (const { p, n } of P.eyelets) { const m = new THREE.Mesh(ring, ringM); m.position.copy(p).addScaledVector(n, 0.004); m.quaternion.setFromUnitVectors(V(0, 0, 1), n); g.add(m); }
  for (const l of P.laces) g.add(new THREE.Mesh(l, laceM));
  const bow = new THREE.Mesh(P.bow, bowMat(RIBBON8)); bow.scale.setScalar(1.1);
  const bz = P.bowN.clone().add(V(0, 0, 1.4)).normalize(), bx = V(1, 0, 0), by = bz.clone().cross(bx);   // facing forward, a little up
  bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
  bow.position.copy(P.bowAt);
  g.add(bow);
  return g;
}

// ── head, face and neck items (pass 7) ─────────────────────────────────────────────────────────────────────────────
// The shop's other items (Phonics-Match items.ts) as 3D pieces on the tutor, like the gloves and shoes (user: "다른아이템
// 들도 신발, 장갑처럼 몸에 잘 맞게"): each sits on the fur and turns with the body; at the picture angle it lands where the
// game's approved 2D picture sits (its `at`). Hats press the fur flat under them (the fur shader's uPress) and hide the
// tuft where the 2D hides it. Each is built on first use (ITEM7.<id>.build) and then just shown/hidden.
const PAL7 = {
  gold: [0xc26c04, 0xea9a1a, 0xf7bc2e, 0xffe274], goldDeep: [0xa85c04, 0xd98a14, 0xf2b02a, 0xffd860],
  gemBlue: [0x0e4aa0, 0x2373d2, 0x52a2f0, 0xb4dcff], gemPink: [0xa30f3e, 0xdb2962, 0xf45a8e, 0xffb6cf], gemGreen: [0x16701a, 0x2f9f32, 0x5ac65a, 0xbcf0ae],
  hat: [0x3f9ccf, 0x5cbbe6, 0x76cbee, 0xaee3f8], hatPink: [0xe5728a, 0xfa92a2, 0xffa8b4, 0xffccd4], hatYellow: [0xe6b034, 0xfccf4e, 0xffdc68, 0xfff0aa],
  fluff: [0xd8c1a4, 0xeddac4, 0xfbefe2, 0xfffaf3], pom: [0xe46a80, 0xf8889c, 0xfd9eb0, 0xffc6d0],
  frame: [0x4c2812, 0x72401e, 0x93582f, 0xbb7f52],
  star: [0xc22a62, 0xe6457f, 0xf75e98, 0xff8ab8],          // pass 8: item_stars' deeper pink (the thinner rim showed more highlight)
  band: [0xdc6a76, 0xf38894, 0xfb9ea8, 0xffc4ca], earCream: [0xceac8a, 0xe6caad, 0xf5e2cb, 0xfdf3e5], earPink: [0xe0707c, 0xf28a94, 0xf99ea6, 0xffc2c8],
  leaf: [0x5d7f1f, 0x7a9a2e, 0x93b444, 0xc0d880], fcen: [0xe08410, 0xf8ac22, 0xffcb42, 0xffe690],
  petal: { pink: [0xe76e88, 0xf990a8, 0xfdaabc, 0xffd2dc], purple: [0x8d5ec0, 0xa87ad8, 0xbf96ea, 0xdec6f8], orange: [0xe2761a, 0xf69a34, 0xfdb452, 0xffd690], blue: [0x4a8fcf, 0x6cade6, 0x8dc5f2, 0xc0e0fc] },
};
/** an ellipsoid (a scaled sphere) as geometry, centred at c, turned by q */
function blob(c, sx, sy, sz, q = null, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.applyMatrix4(new THREE.Matrix4().compose(c, q || new THREE.Quaternion(), V(sx, sy, sz)));
  return g;
}
/** a quaternion whose +z is n (and +y as close to up as it can be) */
function faceQ(n, up = V(0, 1, 0)) {
  const z = n.clone().normalize(), x = up.clone().cross(z).normalize(), y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
/** pose an item group on the body: its +y = U (tilted fwd° toward +z, then roll° about z), its +z turned yaw° about it,
 *  its origin dist along U (+ off) */
function poseOn(g, { fwd = 0, roll = 0, yaw = 0, dist = 0, off = [0, 0, 0] }) {
  g.quaternion.setFromEuler(new THREE.Euler(fwd * D2R, yaw * D2R, roll * D2R, 'ZXY'));
  g.position.set(0, dist, 0).applyQuaternion(g.quaternion).add(V(...off));
  return g;
}
const L2W = (g, v) => v.clone().applyQuaternion(g.quaternion).add(g.position);   // the group's local point in the body frame
const W2L = (g, v) => v.clone().sub(g.position).applyQuaternion(g.quaternion.clone().invert());

/** the crown: a gold band with three gems in bezels, four points with balls (front/back tall, sides shorter, so from the
 *  front it reads as the shop's three-point crown), flaring a little; meshed from one SDF so the edges are soft. */
function buildCrown() {
  const g = new THREE.Group();
  const rb = 0.455, t = 0.036, hb = 0.25, lip = 0.018, rr = 0.015, hv = 0.15, flare = 0.28;
  const pts = [[0, 0.48, 0.07], [90, 0.4, 0.062], [180, 0.34, 0.055], [270, 0.4, 0.062]];   // azimuth, height above the band, ball r
  const rAt = (y) => rb + flare * Math.max(0, y - hb);
  const H = (phi) => {
    const a = (((phi / (Math.PI / 2)) % 4) + 4) % 4, k = Math.round(a) % 4, u = Math.min(1, Math.abs(a - Math.round(a)) * 2);
    return hb + hv + (pts[k][1] - hv) * Math.pow(1 - u, 1.1);
  };
  const balls = pts.map(([az, h, br]) => { const a = az * D2R, r = rAt(hb + h); return [V(Math.sin(a) * r, hb + h + br * 0.55, Math.cos(a) * r), br]; });
  const sdf = (p) => {
    const rho = Math.hypot(p.x, p.z), wall = Math.abs(rho - rAt(p.y)) - t / 2;
    if (wall > 0.1) return wall;
    const top = (p.y - H(Math.atan2(p.x, p.z))) * 0.6;
    let d = smax(smax(wall, top, 0.014), -p.y, 0.01);
    const bx = Math.abs(rho - rb) - (t / 2 + lip - rr), by = Math.abs(p.y - hb / 2) - (hb / 2 - rr);
    d = smin(d, Math.min(Math.max(bx, by), 0) + Math.hypot(Math.max(bx, 0), Math.max(by, 0)) - rr, 0.01);
    for (const [c, br] of balls) d = smin(d, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) - br, 0.03);
    return d;
  };
  const R = rAt(hb + 0.5) + 0.1;
  g.add(new THREE.Mesh(sdfNets(sdf, V(-R, -0.03, -R), V(R, hb + 0.62, R), 0.0085), smoothMat(PAL7.gold, 0.3, 0.08)));
  // three gems in gold bezels on the band's front
  const bez = new THREE.TorusGeometry(0.06, 0.014, 10, 32), bezM = smoothMat(PAL7.goldDeep, 0.35, 0.05);
  [[-46, PAL7.gemBlue], [0, PAL7.gemPink], [46, PAL7.gemGreen]].forEach(([az, pal]) => {
    const a = az * D2R, n = V(Math.sin(a), 0, Math.cos(a)), c = n.clone().multiplyScalar(rb + t / 2 + lip - 0.002).setY(hb * 0.5);
    const q = faceQ(n);
    const b = new THREE.Mesh(bez, bezM); b.position.copy(c); b.quaternion.copy(q); g.add(b);
    const gem = new THREE.Mesh(blob(V(0, 0, 0), 0.052, 0.052, 0.03, null, 24), smoothMat(pal, 0.6, 0.05)); gem.position.copy(c).addScaledVector(n, 0.004); gem.quaternion.copy(q); g.add(gem);
  });
  g.userData.r = { rb, t, lip, hb };
  return g;
}

// the party hat's stripes: two helical bands (pink, yellow) round a blue cone, painted by angle + height
const PARTY_FS = /* glsl */ `
uniform vec3 uLight, uC0, uC1, uC2, uC3, uP0, uP1, uP2, uP3, uY0, uY1, uY2, uY3; uniform float uH, uTurns;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
${RAMP}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.15);
  float s = fract(atan(vL.x, vL.z) / 6.2831853 + uTurns * vL.y / uH + 0.32);
  float aa = max(fwidth(s), 1e-3) * 1.2;
  float pink = smoothstep(0.0 - aa, 0.0 + aa, s) * (1.0 - smoothstep(0.17 - aa, 0.17 + aa, s));
  float yel = smoothstep(0.5 - aa, 0.5 + aa, s) * (1.0 - smoothstep(0.66 - aa, 0.66 + aa, s));
  vec3 col = ramp4(t, uC0, uC1, uC2, uC3);
  col = mix(col, ramp4(t, uP0, uP1, uP2, uP3), pink);
  col = mix(col, ramp4(t, uY0, uY1, uY2, uY3), yel);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(N, normalize(uLight + vec3(0.0, 0.0, 1.0))), 0.0), 26.0) * 0.12;
  col = mix(col, uC3, pow(1.0 - clamp(N.z, 0.0, 1.0), 2.5) * 0.08);
  gl_FragColor = vec4(col, 1.0);
}`;
/** the party hat: a striped cone with a pink pompom on a puffy cream rim (origin = the rim's centre, +y up the cone) */
function buildParty() {
  const g = new THREE.Group();
  const rB = 0.365, H = 0.86, prof = [];
  for (let i = 0; i <= 40; i++) { const s = i / 40; prof.push(new THREE.Vector2(Math.max(1e-3, rB * Math.pow(1 - s, 0.93) * (1 + 0.06 * Math.sin(Math.PI * s))), H * s)); }
  const cone = new THREE.LatheGeometry(prof, 72);
  const p = (pal, k) => ({ [`u${k}0`]: { value: rgb(pal[0]) }, [`u${k}1`]: { value: rgb(pal[1]) }, [`u${k}2`]: { value: rgb(pal[2]) }, [`u${k}3`]: { value: rgb(pal[3]) } });
  const coneM = new THREE.ShaderMaterial({ vertexShader: DOT_VS, fragmentShader: PARTY_FS, side: THREE.DoubleSide,
    uniforms: { uLight: { value: LIGHT }, ...ramp(PAL7.hat), ...p(PAL7.hatPink, 'P'), ...p(PAL7.hatYellow, 'Y'), uH: { value: H }, uTurns: { value: -1.6 } } });
  g.add(new THREE.Mesh(cone, coneM));
  const pom = new THREE.Mesh(blob(V(0, H + 0.04, 0), 0.085, 0.082, 0.085, null, 28), smoothMat(PAL7.pom, 0.1, 0.12)); g.add(pom);
  // the rim: a ring of puffs over a soft torus
  const rim = [new THREE.TorusGeometry(0.38, 0.07, 14, 72).rotateX(Math.PI / 2)];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2, k = 1 + 0.08 * Math.sin(i * 2.7);
    rim.push(blob(V(Math.sin(a) * 0.385, 0.03, Math.cos(a) * 0.385), 0.098 * k, 0.09 * k, 0.09 * k, faceQ(V(Math.sin(a), 0, Math.cos(a))), 16));
  }
  for (const r of rim) r.deleteAttribute('uv');
  g.add(new THREE.Mesh(mergeGeo(rim), smoothMat(PAL7.fluff, 0.04, 0.1)));
  return g;
}

/** a temple arm: from the hinge (body frame) back along the side of the head, lying on the fur, tucked in at the end */
function templePath(hinge, side, y0) {
  const pts = [hinge.clone(), hinge.clone().add(V(side * 0.03, -0.004, -0.09))];
  for (const az of [66, 80, 92, 102]) {
    const a = az * D2R, el = (y0 - 0.02 * (az - 66) / 36);
    const d = V(side * Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).normalize();
    pts.push(d.multiplyScalar(furTip(d) - (az < 70 ? 0.012 : az < 85 ? 0.03 : 0.08)));     // into the fur, then under its core
  }
  return pts;
}
// lenses: a pale tinted film with a soft diagonal sheen (blended, drawn after the fur and the eyes)
const LENS_FS = /* glsl */ `
uniform vec3 uTint; uniform float uA, uR;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec2 q = vL.xy / uR;
  float sheen = exp(-pow((q.x + q.y * 0.9 + 0.35) / 0.22, 2.0)) * 0.5 + exp(-pow((q.x + q.y * 0.9 - 0.25) / 0.08, 2.0)) * 0.35;
  gl_FragColor = vec4(mix(uTint, vec3(1.0), sheen), uA + sheen * 0.35);
}`;
const lensMat = (tint, a, r) => new THREE.ShaderMaterial({ vertexShader: DOT_VS, fragmentShader: LENS_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uTint: { value: tint }, uA: { value: a }, uR: { value: r } } });
// the star lenses (pass 8): lavender glass that is clear in the middle (the eyes read through it) and deepens toward
// the rim like item_stars' lens, with its soft white streak along the upper left; f = 0 at the centre, 1 at the rim
const STAR_LENS_VS = /* glsl */ `
attribute float f;
varying vec3 vL; varying float vF;
void main() { vL = position; vF = f; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STAR_LENS_FS = /* glsl */ `
uniform vec3 uTint, uEdgeTint; uniform float uA, uEdge, uR;
varying vec3 vL; varying float vF;
void main() {
  vec2 q = vL.xy / uR;
  float e = smoothstep(0.45, 1.0, vF);
  float streak = exp(-pow((q.x + q.y * 0.95 + 0.62) / 0.13, 2.0)) * smoothstep(0.55, 0.9, vF) * 0.75 + exp(-pow((q.x + q.y * 0.95 - 0.1) / 0.06, 2.0)) * 0.12;
  vec3 col = mix(uTint, uEdgeTint, e);
  gl_FragColor = vec4(mix(col, vec3(1.0), streak), uA + uEdge * e + streak * 0.4);
}`;
const GLASSES = { sx: 0.345, dx: 0.025, z: 1.06, y: 0.295, tilt: -8 };      // ring centres ±sx (body x), height y, plane at body z
// item_stars measured (pass 8, scratch pm/t3d/pass8/star_line.py): the rim's centre line round each lens centre, art px
// every 5° (0° = out to the right, counter-clockwise), symmetric about the star's upright axis; the rim is 2 x 27 px
// wide, the bridge a 69 px bar 30 px above the lens centres; the picture is 1157 px wide at the game's 400 css px
const STAR_LINE = [185.7, 203.0, 213.9, 217.6, 218.6, 211.3, 198.9, 184.7, 172.2, 161.8, 154.8, 152.9, 158.0, 166.7, 178.0, 190.9, 204.0, 214.6,
  218.8, 214.6, 204.0, 190.9, 178.0, 166.7, 158.0, 152.9, 154.8, 161.8, 172.2, 184.7, 198.9, 211.3, 218.6, 217.6, 213.9, 203.0, 185.7, 173.6, 164.1,
  157.6, 155.8, 161.2, 169.8, 180.7, 193.8, 207.1, 216.8, 219.7, 213.0, 200.6, 186.4, 173.0, 161.9, 153.8, 150.4, 153.8, 161.9, 173.0, 186.4, 200.6,
  213.0, 219.7, 216.8, 207.1, 193.8, 180.7, 169.8, 161.2, 155.8, 157.6, 164.1, 173.6];
const STARG = { sx: 0.3315, dx: 0.0315, z: 1.07, y: 0.3005, tilt: -8, roll: -0.84, k: 0.3457 / 279.4, half: 27.2, bridgeY: 29.7, bridgeR: 30, reach: 0.25, hy: 0.05 };
/** the star outline (centre line of the rim) in the glasses' plane, units, from STAR_LINE */
function starLine(scale = 1) {
  const pts = STAR_LINE.map((r, i) => { const a = (i * 5) * D2R, rr = r * STARG.k * scale; return V(Math.cos(a) * rr, Math.sin(a) * rr, 0); });
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}
/** the lens: a polar grid inside the star's centre line (f = 0 at the middle, 1 on the line), domed a little */
function starLens(curve) {
  const N = 144, F = [0, 0.25, 0.45, 0.62, 0.76, 0.87, 0.95, 1], out = curve.getSpacedPoints(N);
  const pos = [], fa = [], idx = [];
  for (let j = 0; j < F.length; j++) for (let i = 0; i <= N; i++) {
    const p = out[i % N], f = F[j];
    pos.push(p.x * f, p.y * f, 0.012 * (1 - f * f) - 0.006); fa.push(f);
  }
  for (let j = 0; j < F.length - 1; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('f', new THREE.Float32BufferAttribute(fa, 1)); g.setIndex(idx);
  return g;
}
/** round brown glasses: two rings with pale lenses, a bridge, hinges and temple arms back along the head;
 *  star: item_stars' pink star frames (pass 8: its own outline, rim and bridge at the 2D's size), lavender lenses */
function buildGlasses({ star = false } = {}) {
  const g = new THREE.Group();
  const P = star ? STARG : GLASSES;
  g.position.set(P.dx, P.y, P.z); g.rotation.x = P.tilt * D2R; g.rotation.z = (P.roll || 0) * D2R;
  const mat = smoothMat(star ? PAL7.star : PAL7.frame, star ? 0.2 : 0.22, 0.1);
  const lens = star ? new THREE.ShaderMaterial({ vertexShader: STAR_LENS_VS, fragmentShader: STAR_LENS_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTint: { value: rgb(0xae8ade) }, uEdgeTint: { value: rgb(0x9a6acb) }, uA: { value: 0.3 }, uEdge: { value: 0.4 }, uR: { value: 0.22 } } })
    : lensMat(rgb(0xfff2f4), 0.22, P.rr);
  const curve = star ? starLine() : null;
  for (const s of [-1, 1]) {
    let ring, film;
    if (star) {
      ring = new THREE.TubeGeometry(curve, 288, P.half * P.k, 16, true);
      film = starLens(curve);
    } else {
      ring = new THREE.TorusGeometry(P.rr, P.tube, 18, 72);
      film = new THREE.CircleGeometry(P.rr, 64);
    }
    const m = new THREE.Mesh(ring, mat); m.position.x = s * P.sx; g.add(m);
    const f = new THREE.Mesh(film, lens); f.position.set(s * P.sx, 0, star ? 0 : -0.005); f.renderOrder = 3; g.add(f);
    // hinge block on the outer edge
    const hx = s * (P.sx + P.reach), hinge = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.06, 0.07, 3, 0.02), mat); hinge.position.set(hx, P.hy, -0.03); g.add(hinge);
  }
  if (star) {     // the bridge: a short straight bar between the stars' inner arms, like the picture's
    const by = P.bridgeY * P.k, bx = P.sx - 0.2, br = P.bridgeR * P.k;
    g.add(new THREE.Mesh(taper([V(-bx, by, 0), V(-bx * 0.5, by + 0.002, 0.002), V(0, by + 0.003, 0.003), V(bx * 0.5, by + 0.002, 0.002), V(bx, by, 0)], () => br, 24, 16).geo, mat));
  } else {        // the bridge: a little arch between the rings, above their centres
    const bx = P.sx - P.bridgeIn;
    g.add(new THREE.Mesh(taper([V(-bx, P.by, 0), V(-bx * 0.5, P.by + 0.025, 0.012), V(0, P.by + 0.032, 0.016), V(bx * 0.5, P.by + 0.025, 0.012), V(bx, P.by, 0)], () => P.tube * 0.8, 30, 12).geo, mat));
  }
  // temples (built in the body frame, then brought into the group's frame)
  g.updateMatrix();
  const tube = star ? 0.054 : P.tube;          // the star temples as in pass 7
  for (const s of [-1, 1]) {
    const hinge = L2W(g, V(s * (P.sx + P.reach), P.hy, -0.06));
    const pts = templePath(hinge, s, 0.3).map((v) => W2L(g, v));
    g.add(new THREE.Mesh(taper(pts, (u) => tube * (0.72 - 0.15 * u), 60, 10).geo, mat));
  }
  return g;
}
Object.assign(GLASSES, { rr: 0.226, tube: 0.035, reach: 0.255, hy: 0.04, by: 0.035, bridgeIn: 0.222 });

// ── polka-dot bows (pass 8) ────────────────────────────────────────────────────────────────────────────────────────
// The hair ribbon, the bow tie and the shoes' bows rebuilt from their shop pictures (user: "리본들은 좀더 이미지처럼 디테일
// 하게"): each part's outline was read off item_bow / item_bowtie (art px, y up, from the knot's centre) and inflated
// into a puffy satin pillow (rounded rim, fuller in the middle), the loops' lower edges rolled in over a hollow that
// shows the ribbon's darker inside, soft folds running into a plump creased knot, tails with V-cut ends; one SDF,
// meshed by surface nets. Polka dots are discs where the surface passes through small spheres spread over it (so they
// wrap round the edges like printed cloth); each vertex keeps its distance to the nearest dot rim (smooth there, so
// the interpolated disc edge stays crisp and round).
/** a closed outline (control points, art px) as a 2D signed distance (negative inside), on a grid, bilinear */
function outline2D(ctrl, h = 3, pad = 70) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, y]) => V(x, y, 0)), true, 'centripetal');
  const pts = curve.getSpacedPoints(180).slice(0, 180).map((v) => [v.x, v.y]), n = pts.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bx = [x0, y0, x1, y1];
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, G = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const px = x0 + i * h, py = y0 + j * h;
    let dm = Infinity, inside = false;
    for (let k = 0, l = n - 1; k < n; l = k++) {
      const [ax, ay] = pts[l], [cx, cy] = pts[k], ex = cx - ax, ey = cy - ay, wx = px - ax, wy = py - ay;
      const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey))), dx = wx - ex * t, dy = wy - ey * t;
      dm = Math.min(dm, dx * dx + dy * dy);
      if ((ay > py) !== (cy > py) && px < ax + ((py - ay) * (cx - ax)) / (cy - ay)) inside = !inside;
    }
    G[i + nx * j] = (inside ? -1 : 1) * Math.sqrt(dm);
  }
  const look = (u, v) => {
    const i = Math.min(nx - 2, Math.floor(u)), j = Math.min(ny - 2, Math.floor(v)), fu = u - i, fv = v - j, a = i + nx * j;
    return (G[a] * (1 - fu) + G[a + 1] * fu) * (1 - fv) + (G[a + nx] * (1 - fu) + G[a + nx + 1] * fu) * fv;
  };
  const f = (x, y) => {
    const u = (x - x0) / h, v = (y - y0) / h, cu = Math.min(nx - 1, Math.max(0, u)), cv = Math.min(ny - 1, Math.max(0, v));
    return u === cu && v === cv ? look(u, v) : look(cu, cv) + Math.hypot((u - cu) * h, (v - cv) * h);
  };
  f.box = bx;
  return f;
}
const ellRim = (e, R) => { const u = Math.min(Math.max(e / R, 0), 1); return Math.sqrt(1 - (1 - u) * (1 - u)); };
/** a puffy pillow on a 2D outline D: centre surface z = zc(x, y), half thickness th(x, y, e) inside (e = depth inside
 *  the outline), a rounded rim; ≈ a distance near its faces (|z - zc| - th), exact outside the outline */
const pillow = (D, zc, th, slope = null) => (p) => {
  const d = D(p.x, p.y), dz = (p.z - zc(p.x, p.y)) / (slope ? Math.hypot(1, slope(p.x, p.y)) : 1);   // a curved one: z along its normal
  return d >= 0 ? Math.hypot(d, dz) : Math.abs(dz) - th(p.x, p.y, -d);
};
/** pass 9: the same surface as pillow() with th = A(x, y)·ellRim(e, R), as an elliptic field across the rim (normalised
 *  by its gradient, so ≈ a distance): smooth through the outline, where pillow()'s two branches met with a kinked
 *  gradient - it meshed as a row of pits along every rim and shaded as specks there */
const pillow9 = (D, zc, A, R, slope = null) => (p) => {
  const a = A(p.x, p.y), u = Math.max(0, 1 + D(p.x, p.y) / R), dz = (p.z - zc(p.x, p.y)) / (slope ? Math.hypot(1, slope(p.x, p.y)) : 1);
  const q = dz / a, l = Math.hypot(u, q), g = Math.hypot((u * a) / R, q);
  return g < 1e-6 ? -a : ((l - 1) * a * l) / g;
};
/** a shallow groove along the segment a→b (art px, front view) as an SDF bump: depth A, half width w, fading toward b */
const groove = (a, b, A, w) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
  return (x, y) => {
    const t = ((x - a[0]) * ex + (y - a[1]) * ey) / L2;
    if (t < -0.15 || t > 1.05) return 0;
    const px = x - a[0] - ex * t, py = y - a[1] - ey * t;
    return A * Math.exp(-(px * px + py * py) / (w * w)) * sstep(-0.15, 0.1, t) * (1 - sstep(0.45, 1.05, t));
  };
};
/** the polyline y(x) through pts (sorted by x); past its ends it drops steeply, so a cut below it closes there */
const lineY = (pts) => (x) => {
  const n = pts.length;
  if (x <= pts[0][0]) return pts[0][1] - 6 * (pts[0][0] - x);
  for (let i = 1; i < n; i++) if (x <= pts[i][0]) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; return ay + ((by - ay) * (x - ax)) / (bx - ax); }
  return pts[n - 1][1] - 6 * (x - pts[n - 1][0]);
};

// item_bow read off the picture (681 x 606; knot centre at (338, 222) = 0, y up). Left side; the right one mirrors it.
const RIBBON8 = {
  loop: [[-46, 84], [-88, 122], [-138, 164], [-188, 196], [-238, 214], [-280, 214], [-309, 196], [-324, 160], [-329, 100], [-331, 22],
    [-333, -48], [-326, -110], [-308, -152], [-280, -170], [-228, -170], [-178, -161], [-128, -143], [-83, -113], [-50, -80], [-36, 2]],
  lip: [[-322, -122], [-290, -134], [-238, -134], [-188, -124], [-138, -108], [-96, -86], [-62, -66]],   // the front sheet's rolled lower edge
  tail: [[-40, -70], [-100, -122], [-160, -172], [-215, -215], [-255, -243], [-276, -258], [-284, -274], [-272, -288], [-240, -298],
    [-190, -318], [-160, -346], [-136, -366], [-112, -380], [-86, -374], [-58, -340], [-40, -282], [-28, -200], [-20, -130], [-16, -78]],
  knot: [62, 88, 46, 40],                  // half width, half height, half depth, corner radius
  folds: [[[-62, 18], [-188, 96]], [[-62, -4], [-200, 6]], [[-60, -30], [-170, -96]], [[-40, -96], [-120, -210]]],
  col: [0xc22843, 0xe64a66, 0xf9667f, 0xfc8a9f], dot: 0xfce1d2, inner: V(0.86, 0.45, 0.52),
  dots: { gap: 96, r: [22, 28], seed: 7 },
  // pass 9: the rolled edge rounder (lip thickness, slot corners, lip/floor edges, art px), the inner band's fade-in over
  // the hollow's depth (cav) + relax steps, AO relax steps
  edge: { p9: true, lipT: 14, slot: 26, rim: 14, back: 14, kIn: 10, kOut: 10, in: [-12, 6], inIt: 8, aoIt: 3 },
  // pass 9: pass 8's dots as they came out of the Poisson spread (art px: centre, normal, radius), kept fixed so the
  // rounder edge (a different mesh = a different spread) doesn't move them: the head ribbon, the shoes' small copy
  dotsAt: {
    head: [
    [-116.2,76.8,26.2,0.321,0.112,0.94,27], [185.1,-161.5,-24,-0.267,-0.915,-0.302,28],
    [-182.6,-154.6,-34.5,0.286,-0.727,-0.624,22.9], [-69,-326,86.5,0.328,-0.69,-0.646,24.4],
    [-289.8,200.6,-44.2,-0.27,0.686,-0.676,27.5], [-200.8,99.3,-61.7,0.191,0.101,-0.976,26.6],
    [74.7,-115.1,-7.9,0.346,0.212,-0.914,24.4], [135.4,-353.9,115.7,0.279,-0.819,-0.502,24.2],
    [-260.7,-76.6,-75.5,0.02,0.01,-1,26.1], [237.6,186.7,-48.3,-0.271,0.472,-0.839,24.6],
    [-66.8,-134.8,-10.5,-0.08,-0.096,-0.992,25], [-309.8,4.7,-1.5,-0.591,0,0.807,26.6],
    [-244.6,-267.5,95.5,-0.079,0.531,0.844,27.1], [161.3,118.4,-48.2,-0.322,0.232,-0.918,25.7],
    [236.3,-298.9,88.7,0.286,-0.945,-0.161,26.5], [45.3,-265.8,47.8,-0.561,-0.5,-0.66,24],
    [302.5,-102.9,-2.3,0.564,-0.142,0.813,22.2], [313.5,78.3,-3.5,0.649,-0.007,0.76,24.6],
    [-98.2,-218.9,63.6,0,0.441,0.898,26.8], [-241.3,90.2,32.9,-0.283,-0.025,0.959,25.6],
    [185.3,-13.3,39.8,0.073,-0.007,0.997,26.6], [73.1,58.8,-29.9,-0.329,0.057,-0.943,26.6],
    [266.3,-44.7,-75,0.003,0.022,-1,23.4], [-156.7,-26.8,38.8,0.116,-0.022,0.993,23.3],
    [144.8,-233.8,71.7,-0.026,0.48,0.877,22.3], [-75.2,-22.3,-29.8,0.42,-0.135,-0.897,24.8],
    [-170.2,-8.7,-60.5,0.235,0.163,-0.958,22.5], [-161.3,-322.6,131.1,-0.309,0.441,0.843,25.8],
    [149.2,-44.8,-56.6,-0.287,-0.026,-0.958,24.3], [-155.9,176.8,-5.2,0.633,0.774,0,27.2],
    [234.8,130.8,34.3,0.137,0.098,0.986,23.1], [-313.9,103.7,-56.2,-0.587,0.054,-0.808,26],
    [243.7,49.8,-70.6,-0.098,0.032,-0.995,22.9], [-246.8,-89.8,25.6,-0.21,-0.127,0.969,22.7],
    [-289.6,-164.2,-25.7,-0.44,-0.815,0.378,27.4], [-188.3,-234.9,23.8,-0.124,-0.348,-0.929,25.7],
    [90.7,-22.2,20.2,-0.352,0.016,0.936,25]],
    shoe: [
    [92.9,42.8,16.7,-0.15,-0.301,0.942,23], [73.6,-228.4,15.7,-0.211,-0.211,0.954,26.1],
    [273,37,-71.7,0.064,0.035,-0.997,22.9], [-329.9,79.1,-31.6,-0.982,0.024,0.187,24.4],
    [-197.6,-85.7,34,-0.1,-0.167,0.981,22.5], [-147,115,30.9,0.339,0.206,0.918,27.6],
    [-282.5,-53,-74.1,-0.128,0.016,-0.992,24.8], [285.1,-154.5,-58,0.179,-0.6,-0.78,27.9],
    [-189,7,-63.2,0.192,0.004,-0.981,22.1], [-41.1,-203.1,5.4,0.786,-0.283,0.55,26.1],
    [-16.5,-93.8,3.6,0.299,-0.285,-0.911,27], [-305.5,176.3,-2.5,-0.665,0.221,0.714,24.1],
    [239.2,-84.6,27.9,0.183,-0.132,0.974,24.7], [132.8,-121.8,3.1,0.57,0.822,-0.001,26.8],
    [189,109,-58.1,-0.204,0.155,-0.967,23], [-168.5,-224.5,-20.2,-0.248,-0.255,-0.935,25.9],
    [267.1,181.3,17.3,0.224,0.37,0.901,26.6], [308.2,-23,-0.4,0.566,-0.008,0.825,23.4],
    [-141.1,7.3,32.8,0.221,-0.362,0.906,27.9], [297.1,85,8.3,0.521,-0.01,0.853,26.8],
    [195,7,39,0.08,-0.041,0.996,26.9], [165,13,-58.1,-0.239,-0.19,-0.952,22.5],
    [166.8,161,22.6,-0.346,0.438,0.83,27.5], [-313.1,-141.3,-46,-0.826,-0.443,-0.348,22.4],
    [-117,-77,-39.9,0.22,0.144,-0.965,27.6], [-201,192.4,12.5,0.223,0.682,0.696,28],
    [224.9,-215.5,-10.2,0.183,-0.619,-0.764,25], [-285,7,13.4,-0.451,-0.013,0.892,26.3],
    [-213,-143,-52.8,0.219,-0.464,-0.858,25.3], [70.9,-49.3,-26.3,-0.16,0.271,-0.949,26],
    [-68.5,91.5,-21.8,0.333,0.346,-0.877,25.3], [255,-59,-75,-0.057,0.022,-0.998,23],
    [-205.7,109,-61.6,0.21,0.122,-0.97,22.7], [-273.7,-203.6,15.6,-0.343,-0.456,0.821,22.6],
    [-254.2,97,28.8,-0.341,-0.021,0.94,24.1]],
  },
};
// item_bowtie (688 x 404; knot centre at (343, 204) = 0, y up), left wing
const TIE8 = {
  wing: [[-60, 74], [-113, 98], [-163, 132], [-223, 168], [-273, 192], [-308, 196], [-331, 180], [-338, 134], [-341, 64], [-342, -1],
    [-340, -66], [-335, -126], [-323, -170], [-298, -190], [-243, -188], [-183, -176], [-133, -156], [-93, -128], [-62, -86], [-46, -1]],
  lip: null,                               // no hollow: its lower edge is just a soft fold (the last groove)
  knot: [72, 98, 46, 40],
  folds: [[[-70, 6], [-200, 22]], [[-68, 40], [-190, 120]], [[-68, -36], [-190, -110]], [[-80, -118], [-300, -172]]],
  col: [0x9c0605, 0xc20f0c, 0xdc1c16, 0xf03a2e], dot: 0xfbd8b3, inner: V(0.78, 0.62, 0.62),
  dots: { gap: 92, r: [22, 27], seed: 3 },
};

/** the SDF of a ribbon bow (kind 'ribbon': loops + knot + tails; 'tie': wings + knot), art px, x right, y up, z out */
function bowSDF(kind, { tails = 1, bend = 0 } = {}) {
  const B = kind === 'tie' ? TIE8 : RIBBON8;
  const loopD = outline2D(kind === 'tie' ? B.wing : B.loop), yLip = B.lip ? lineY(B.lip) : null;
  const tailD = kind === 'tie' ? null : outline2D(B.tail.map(([x, y]) => [x, y < -70 ? -70 + (y + 70) * tails : y]));
  const folds = B.folds.map(([a, b]) => groove(a, b, kind === 'tie' ? 5 : 6, 11));
  const xEnd = loopD.box[0];
  // the loop: thicker toward its outer end, curving back there; the knot end pinched thinner
  const zLoop = (x, y) => -8 - 26 * sstep(-80, xEnd, x) ** 2 + 0.03 * y * sstep(-60, -200, x);
  const tLoop = (x, y, e) => (kind === 'tie' ? 46 : 52) * (0.55 + 0.45 * sstep(-50, -190, x)) * ellRim(e, kind === 'tie' ? 95 : 110);
  const loopP = B.edge && B.edge.p9 ? pillow9(loopD, zLoop, (x) => 52 * (0.55 + 0.45 * sstep(-50, -190, x)), 110) : pillow(loopD, zLoop, tLoop);
  // the rolled lower edge: a slot under the lip (rising behind it, so the lip overhangs it) down to a floor above the
  // loop's round bottom rim and back to a wall that keeps ~half the loop's thickness; it closes toward the lip's ends
  // pass 9 (user: "머리에 다는 리본은 좀 깨져보이는데"): rounder (B.edge: the lip's thickness, the slot's inner corners, the
  // lip's and floor's edges), so the mesh resolves a smooth rolled edge instead of a zig-zag crease
  const E9 = B.edge || { lipT: 8, kIn: 6, kOut: 8 };
  const lipT = kind === 'tie' ? 14 : E9.lipT, kys = kind === 'tie' ? 0.5 : 0.9, slot = kind === 'tie' ? 14 : 30;
  const lx0 = B.lip ? B.lip[0][0] : 0, lx1 = B.lip ? B.lip[B.lip.length - 1][0] : 0;
  const loopCut = (p) => {           // [the loop, the hollow's cut] (the cut wins where the hollow is)
    let d = loopP(p);
    for (const g of folds) d += g(p.x, p.y);
    const tp = B.lip ? sstep(lx0, lx0 + 45, p.x) * sstep(lx1, lx1 - 45, p.x) : 0;
    if (tp <= 0) return [d, -1e9];
    const zf = zLoop(p.x, p.y), e = Math.max(0, -loopD(p.x, p.y)), yl = yLip(p.x);
    const under = (p.y - yl - kys * tp * Math.max(0, zf + lipT - p.z)) / Math.hypot(1, kys * tp);
    if (!E9.p9) return [d, -smax(smax(under, yl - slot * tp - p.y, E9.kIn), zf - 0.6 * tLoop(p.x, p.y, e) - p.z, E9.kIn)];
    // pass 9: nothing in it thinner than ~3 mesh cells (thin slivers meshed as spikes, a zig-zag lip and holes): the
    // floor stays rim px inside the outline (a bottom rim, not a sliver), the back wall keeps back px of the loop, and
    // toward the lip's ends the slot gets shallower as well as lower (it closes, rather than thinning to a slit)
    const t = tLoop(p.x, p.y, e), dep = Math.min(1.6 * t, 2 * t - E9.back) * tp;
    const floor = smax(yl - E9.slot * Math.sqrt(tp) - p.y, E9.rim - e, E9.kIn);
    return [d, -smax(smax(under, floor, E9.kIn), zf + t - dep - p.z, E9.kIn)];
  };
  const loop = (p) => { const [d, c] = loopCut(p); return c < -1e8 ? d : smax(d, c, E9.kOut); };
  const [kx, ky, kz, kr] = B.knot;
  const knotBox = (p) => {
    const bul = 1 + 0.06 * (1 - (p.y / ky) ** 2);                       // a little barrel-shaped
    const qx = Math.abs(p.x) / bul - (kx - kr), qy = Math.abs(p.y) - (ky - kr), qz = Math.abs(p.z - 12) - (kz - kr);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - kr;
  };
  const bumps = kind === 'tie' ? [] : [ellipsoid(V(-28, ky - 14, 14), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 30, 20, 34), ellipsoid(V(30, ky - 12, 14), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 30, 20, 34)];
  const kGr = kind === 'tie' ? [groove([-50, -ky], [-44, ky], 1.5, 8), groove([52, -ky], [46, ky], 1.5, 8)] : [groove([8, -ky], [-2, ky * 0.7], 4, 8), groove([60, -50], [10, -ky], 4, 10)];
  const knot = (p) => {
    let d = knotBox(p);
    for (const b of bumps) d = smin(d, b(p), 10);
    for (const g of kGr) d += g(p.x, p.y);
    return d;
  };
  // the tails: thinner strips from behind the knot, a little in front of the loops' lower inner corners; on the head
  // they curve forward (bend), so they hang over the fur of the forehead like the 2D's instead of into it
  const zTail = (x, y) => 4 - 12 * sstep(-80, -320, y) + 6 * sstep(-120, -280, x) + bend * Math.max(0, -60 - y) ** 2 / 300;
  const tTail = (x, y, e) => 22 * ellRim(e, 40);
  const tSlope = (x, y) => (bend * 2 * Math.max(0, -60 - y)) / 300;
  const tail = !tailD ? null : B.edge && B.edge.p9 ? pillow9(tailD, zTail, () => 22, 40, tSlope) : pillow(tailD, zTail, tTail, tSlope);
  const f = (p) => {
    const q = { x: -Math.abs(p.x), y: p.y, z: p.z };                    // symmetric: the left side's parts serve both
    const fl = loopD(q.x, q.y), ft = tailD ? tailD(q.x, q.y) : 1e9;
    if (fl > 24 && ft > 24 && Math.abs(p.x) > kx + 24) return Math.min(fl, ft);   // far outside every part: a bound
    let d = loop(q);
    if (tail) d = smin(d, tail(q), 6);
    return smin(d, knot(p), 9);
  };
  f.parts = { loop: (p) => loop({ x: -Math.abs(p.x), y: p.y, z: p.z }), tail: tail ? (p) => tail({ x: -Math.abs(p.x), y: p.y, z: p.z }) : () => 1e9, knot,
    cav: (p) => { const [d, c] = loopCut({ x: -Math.abs(p.x), y: p.y, z: p.z }); return c - d; } };
  const bx = kind === 'tie' ? [-350, -205, 350, 205] : [-340, -390, 340, 222];
  f.box = [V(bx[0] - 8, bx[1] - 8, -80), V(bx[2] + 8, bx[3] + 8, 75 + bend * 340)];
  f.B = B;
  return f;
}
/** vertex neighbours of an indexed mesh (CSR: list[start[i] .. start[i + 1]]) */
function meshNbrs(index, n) {
  const ix = index.array, start = new Uint32Array(n + 1);
  for (let t = 0; t < ix.length; t++) start[ix[t] + 1] += 2;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n), list = new Uint32Array(start[n]);
  for (let t = 0; t < ix.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = ix[t + e]; list[fill[a]++] = ix[t + (e + 1) % 3]; list[fill[a]++] = ix[t + (e + 2) % 3];
  }
  return { start, list };
}
/** relax a per-vertex value over the mesh (each step: half its own, half its neighbours' mean) */
function smoothAttr(nb, a, iters) {
  const tmp = new Float32Array(a.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < a.length; i++) {
      const s0 = nb.start[i], s1 = nb.start[i + 1];
      let s = 0; for (let j = s0; j < s1; j++) s += a[nb.list[j]];
      tmp[i] = s1 > s0 ? 0.5 * a[i] + (0.5 * s) / (s1 - s0) : a[i];
    }
    a.set(tmp);
  }
}
/** mesh a bow: geometry in units (k per art px) with per-vertex AO, the inner side, and the offset to its polka dot.
 *  pass 9 (opt.dots = a fixed dot list, art px [x, y, z, nx, ny, nz, r]: the ribbons keep pass 8's pattern): the inner
 *  band fades in over the rounded lip and is relaxed over the mesh, so it shades like a soft fold (a one-cell step
 *  followed the mesh in stair-steps); AO relaxed too; a dot shrinks smoothly where the cloth turns away from it or into
 *  the hollow (a hard per-vertex cut-off left cream specks along rims and in the hollow) */
function bowMesh(kind, k, opt = {}) {
  const f = bowSDF(kind, opt), B = f.B, h = opt.h ?? 4.5, soft = !!opt.dots;
  const geo = sdfNets(f, f.box[0], f.box[1], h);
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
  const ao = new Float32Array(n), inner = new Float32Array(n), dotv = new Float32Array(n), part = new Uint8Array(n);
  const p = V(0, 0, 0), q = V(0, 0, 0), nn = V(0, 0, 0);
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i); nn.fromBufferAttribute(nor, i);
    let occ = 0;
    for (let s = 1; s <= 5; s++) { const dl = 7 * s; occ += (dl - f(q.copy(p).addScaledVector(nn, dl))) / dl / 2 ** s; }
    ao[i] = Math.min(1, Math.max(0, 1 - 1.6 * occ));
    const dl = f.parts.loop(p), dt = f.parts.tail(p), dk = f.parts.knot(p);
    part[i] = dk <= Math.min(dl, dt) + 1 ? 2 : dt < dl ? 1 : 0;
    inner[i] = part[i] === 0 ? (soft ? sstep(B.edge.in[0], B.edge.in[1], f.parts.cav(p)) : sstep(-5, 0, f.parts.cav(p))) : 0;   // the hollow under the rolled lip
  }
  if (soft) {
    const nb = meshNbrs(geo.index, n);
    smoothAttr(nb, inner, B.edge.inIt); smoothAttr(nb, ao, B.edge.aoIt);
    // (the dots on the undersides of the rims - the loops' bottom rims, the tails' lower edges - are left out: seen from
    // the front they only ever showed as cream slivers and specks along those edges)
    const dots = opt.dots.map(([x, y, z, nx, ny, nz, r]) => ({ c: V(x, y, z), n: V(nx, ny, nz), r })).filter((d) => !(d.n.y < -0.4 && d.n.z < 0.5));
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i); nn.fromBufferAttribute(nor, i);
      const fade = 1 - sstep(0.12, 0.5, inner[i]);
      let best = Infinity;
      if (fade > 0) for (const d of dots) {
        const w = sstep(0.12, 0.5, d.n.dot(nn)) * fade;
        if (w > 0) best = Math.min(best, d.c.distanceTo(p) - d.r * w);
      }
      dotv[i] = Math.min(best * k, 1);
    }
    geo.scale(k, k, k);
    geo.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    geo.setAttribute('inner', new THREE.BufferAttribute(inner, 1));
    geo.setAttribute('dotd', new THREE.BufferAttribute(dotv, 1));
    geo.userData = { dots: dots.length, verts: n };
    return geo;
  }
  // dots: a seeded Poisson spread over the loops and tails (and the tie's knot), never on the inside
  let seed = B.dots.seed * 9973 + 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const dots = [], gap2 = B.dots.gap ** 2;
  for (const i of order) {
    if (inner[i] > 0.05 || (part[i] === 2 && kind !== 'tie')) continue;
    p.fromBufferAttribute(pos, i);
    if (dots.every((d) => d.c.distanceToSquared(p) > gap2)) dots.push({ c: p.clone(), n: V(0, 0, 0).fromBufferAttribute(nor, i), r: B.dots.r[0] + (B.dots.r[1] - B.dots.r[0]) * rnd() });
  }
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i); nn.fromBufferAttribute(nor, i);
    let best = null, bd = Infinity;
    if (inner[i] < 0.5) for (const d of dots) { const dd = d.c.distanceToSquared(p); if (dd < bd && d.n.dot(nn) > 0.35) { bd = dd; best = d; } }
    dotv[i] = best ? (Math.sqrt(bd) - best.r) * k : 1;
  }
  geo.scale(k, k, k);
  geo.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  geo.setAttribute('inner', new THREE.BufferAttribute(inner, 1));
  geo.setAttribute('dotd', new THREE.BufferAttribute(dotv, 1));
  geo.userData = { dots: dots.length, verts: n };
  return geo;
}
const BOW_VS = /* glsl */ `
attribute float ao; attribute float inner; attribute float dotd;
varying vec3 vN; varying float vAO; varying float vIn; varying float vDot;
void main() {
  vN = normalize(normalMatrix * normal); vAO = ao; vIn = inner; vDot = dotd;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// satin: the art's light ramp, a broad soft sheen and a small highlight from the upper left; folds and the loops'
// insides darker (baked SDF occlusion), the inside a deeper pink without dots; cream dots, crisp but anti-aliased
const BOW_FS = /* glsl */ `
uniform vec3 uLight, uC0, uC1, uC2, uC3, uDot, uInner; uniform float uSheen, uSpec, uAO;
varying vec3 vN; varying float vAO; varying float vIn; varying float vDot;
${RAMP}
void main() {
  vec3 N = normalize(vN);            // the SDF's own normal (a surface-nets quad wound the wrong way at a crease stays lit)
  float t = pow(clamp(dot(N, uLight) * 0.5 + 0.5, 0.0, 1.0), 1.1);
  vec3 col = ramp4(t, uC0, uC1, uC2, uC3);
  float dd = vDot, aa = max(fwidth(dd), 1e-6) * 0.75;
  float dotA = 1.0 - smoothstep(-aa, aa, dd);
  col = mix(col, uDot * (0.82 + 0.18 * t), dotA);
  col *= mix(vec3(1.0), uInner, vIn);
  float occ = mix(1.0 - uAO, 1.0, vAO);
  col *= mix(vec3(0.88, 0.72, 0.74), vec3(1.0), occ) * mix(0.82, 1.0, occ);
  vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);
  col += vec3(1.0, 0.95, 0.95) * (pow(nh, 7.0) * uSheen + pow(nh, 46.0) * uSpec) * (1.0 - 0.6 * dotA) * occ * (1.0 - vIn);
  gl_FragColor = vec4(col, 1.0);
}`;
const bowMat = (B, o = {}) => new THREE.ShaderMaterial({ vertexShader: BOW_VS, fragmentShader: BOW_FS, side: THREE.DoubleSide,
  uniforms: { uLight: { value: LIGHT }, ...ramp(B.col), uDot: { value: rgb(B.dot) }, uInner: { value: B.inner }, uSheen: { value: o.sheen ?? 0.1 }, uSpec: { value: o.spec ?? 0.14 }, uAO: { value: o.ao ?? 0.75 } } });
function buildBowtie() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bowMesh('tie', 0.000775, { h: 5 }), bowMat(TIE8, { sheen: 0.1, spec: 0.16 })));
  return g;
}
function buildRibbon() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bowMesh('ribbon', 0.00075, { h: 4.5, bend: RIBBON.bend, dots: RIBBON8.dotsAt.head }), bowMat(RIBBON8)));
  return g;
}

/** bunny ears on a pink headband: the band an arc over the head top (lying in the pressed fur, its ends tucked in), the
 *  ears cream with pink insides, standing up from it and splayed a little */
const BUNNY = { fwd: 35, th: 53, ears: 18.5, splay: 14, back: 10 };
function bandPoint(th, r0) {          // on the great circle through the top point T (tilted fwd) and the body's x axis
  const b = BUNNY.fwd * D2R, T = V(0, Math.cos(b), Math.sin(b));
  const d = T.clone().multiplyScalar(Math.cos(th * D2R)).add(V(Math.sin(th * D2R), 0, 0)).normalize();
  return { d, p: d.clone().multiplyScalar(furTip(d) * (1 - BUNNY.press) + (SKIN + FUR * CORE) * BUNNY.press + r0) };
}
BUNNY.press = 0.8;
function buildBunny() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 36; i++) {
    const th = -BUNNY.th + (2 * BUNNY.th * i) / 36, tuck = sstep(36, BUNNY.th, Math.abs(th));
    pts.push(bandPoint(th, 0.03 - 0.075 * tuck).p);
  }
  g.add(new THREE.Mesh(taper(pts, () => 0.03, 120, 14).geo, smoothMat(PAL7.band, 0.18, 0.1)));
  const cream = smoothMat(PAL7.earCream, 0.06, 0.1), pink = smoothMat(PAL7.earPink, 0.06, 0.06);
  for (const s of [-1, 1]) {
    const { d, p } = bandPoint(s * BUNNY.ears, 0.03);
    const ear = new THREE.Group(); ear.position.copy(p);
    ear.quaternion.setFromEuler(new THREE.Euler(-BUNNY.back * D2R, 0, -s * BUNNY.splay * D2R, 'ZXY'));
    ear.add(new THREE.Mesh(blob(V(0, 0.38, 0), 0.185, 0.42, 0.055, null, 32), cream));
    ear.add(new THREE.Mesh(blob(V(0, 0.39, 0.037), 0.11, 0.32, 0.024, null, 28), pink));
    ear.add(new THREE.Mesh(blob(V(0, 0.02, 0), 0.07, 0.06, 0.045, null, 16), cream));     // the root, round the band
    g.add(ear);
  }
  return g;
}

/** a flower crown: flowers (five petals round a yellow centre) with leaves between them on a ring round the head,
 *  tilted back, so its front lies over the top of the forehead like the 2D */
const FLOWERS = { tilt: -15, h: 0.74, rho: 0.72, n: 14, cols: ['orange', 'blue', 'pink', 'purple'] };
function buildFlowers() {
  const g = new THREE.Group();
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(FLOWERS.tilt * D2R, 0, 0));
  const A = V(0, 1, 0).applyQuaternion(q0), F = V(0, 0, 1).applyQuaternion(q0), X = V(1, 0, 0);
  const geos = { leaf: [], cen: [] };
  for (const c of FLOWERS.cols) geos[c] = [];
  const N = FLOWERS.n;
  for (let k = 0; k < N; k++) {
    for (const half of [0, 0.5]) {
      const ph = ((k + half) / N) * Math.PI * 2;
      const radial = F.clone().multiplyScalar(Math.cos(ph)).addScaledVector(X, Math.sin(ph));
      const c = A.clone().multiplyScalar(FLOWERS.h).addScaledVector(radial, FLOWERS.rho);
      const dn = c.clone().normalize();
      c.copy(dn).multiplyScalar(furTip(dn) + (half ? 0.0 : 0.03));
      const nrm = radial.clone().addScaledVector(dn, 0.45).normalize(), q = faceQ(nrm, A);
      if (half) {     // two leaves in the gap, pointing along the ring
        const along = A.clone().cross(radial).normalize();
        for (const s of [-1, 1]) {
          const dir = along.clone().multiplyScalar(s).addScaledVector(nrm, 0.25).normalize();
          const lq = faceQ(nrm, dir);
          geos.leaf.push(blob(c.clone().addScaledVector(dir, 0.07).addScaledVector(nrm, -0.005), 0.045, 0.09, 0.018, lq, 14));
        }
        continue;
      }
      const kk = k <= N / 2 ? k : k - N, col = FLOWERS.cols[((kk % 4) + 4) % 4], spin = k * 0.7;   // symmetric from the front
      for (let i = 0; i < 5; i++) {
        const a = spin + (i / 5) * Math.PI * 2, u = V(Math.cos(a), Math.sin(a), 0);
        const pq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a - Math.PI / 2));
        geos[col].push(blob(c.clone().add(u.applyQuaternion(q).multiplyScalar(0.094)), 0.08, 0.1, 0.044, pq, 16));
      }
      geos.cen.push(blob(c.clone().addScaledVector(nrm, 0.036), 0.06, 0.06, 0.04, q, 18));
    }
  }
  const mats = { leaf: smoothMat(PAL7.leaf, 0.1, 0.06), cen: smoothMat(PAL7.fcen, 0.15, 0.06) };
  for (const c of FLOWERS.cols) mats[c] = smoothMat(PAL7.petal[c], 0.08, 0.1);
  for (const [k, list] of Object.entries(geos)) if (list.length) g.add(new THREE.Mesh(mergeGeo(list), mats[k]));
  g.userData.A = A;
  return g;
}

// ── headphones (pass 10) ─────────────────────────────────────────────────────────────────────────────────────────
// user: "기존에 없앴던 헤드셋도 만들어서 넣으면 되는거 아닌가?" The shop's old item_phones (a tall band made for a human head,
// big cups over the cheeks; the game dropped it: "헤드셋은 이상한데") redrawn for the ball with that picture's parts and
// colours: a padded band (light pink over a deep-pink pad) lying on the head top just behind the tuft (its plane tipped
// back PHONES.tilt°), lifting off over the sides into a slider each side, and two big round cups where ears would be, a
// little above eye height: a puffy pale-pink cushion hugging the fur, a deep-pink shell, a pale peach cap. The fur lies
// flat under the band (the uPress ring, like the bunny band) and under the cups (PHONES10: a fur variant like the
// ribbon's FOOT9, so every other render stays bit-identical).
const PHONES = { tilt: 14, el: 25, press: 0.85, cush: 0.31, shell: 0.29, cap: 0.23, y: [0.115, 0.21, 0.255], band: [0.14, 0.088], pad: [0.1, 0.05],
  stem: 0.072, slider: [0.08, 0.095], cupPress: 21, cupEdge: 0.02, bandPress: 6, bandLim: 40 };
const PAL10 = {
  band: [0xd65a76, 0xf07e94, 0xfa9fb0, 0xffc4cf], pad: [0xbc3e5a, 0xda5a74, 0xec728a, 0xf898ab],
  slider: [0xc84c6a, 0xe86e8a, 0xf688a0, 0xffb2c2], cushion: [0xdc7884, 0xf29aa4, 0xfbb4ba, 0xffd6da],
  shell: [0xc63f5e, 0xe45f7e, 0xf47a94, 0xfda2b6], cap: [0xd38a86, 0xeaa6a0, 0xf6bfb6, 0xfdd6cc],
};
/** the fur's outer radius along d with its strands at m of their length (m = 1: furTip) */
const furAt = (d, m) => { const b = bodyShape(d); return SKIN * b.s + FUR * (CORE + m * b.len * (1 - CORE) * 0.8); };
/** the band's plane: through the body's x axis, its top U tipped back; at(t) = its direction at angle t from +x;
 *  tc = the right cup's angle (the cups sit at elevation PHONES.el) */
function phonesPlane() {
  const b = PHONES.tilt * D2R, X = V(1, 0, 0), U = V(0, Math.cos(b), -Math.sin(b)), N = V(0, Math.sin(b), Math.cos(b));
  const at = (t) => X.clone().multiplyScalar(Math.cos(t)).addScaledVector(U, Math.sin(t));
  return { X, U, N, at, tc: Math.asin(Math.sin(PHONES.el * D2R) / Math.cos(b)) };
}
/** a lathe profile (r, y) of a rounded disc: bottom face y0 + bottom(r), side at R, top face y1 (+ dome), fillets f0, f1 */
function discProfile(R, y0, y1, f0, f1, { bottom = () => 0, dome = 0, n = 10 } = {}) {
  const P = [], v = (r, y) => P.push(new THREE.Vector2(Math.max(r, 1e-4), y));
  for (let i = 0; i < n; i++) { const r = ((R - f0) * i) / n; v(r, y0 + bottom(r)); }
  const yb = y0 + bottom(R - f0);
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); v(R - f0 + f0 * Math.cos(a), yb + f0 + f0 * Math.sin(a)); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); v(R - f1 + f1 * Math.cos(a), y1 - f1 + f1 * Math.sin(a)); }
  for (let i = 1; i <= n; i++) { const r = (R - f1) * (1 - i / n); v(r, y1 + dome * (1 - (r / (R - f1)) ** 2)); }
  return P;
}
/** a padded strap along a curve: a soft rounded-rectangle section w(u) across (along `side`) by h(u) out from the head,
 *  pushed out from the curve by off(u) */
function strap(curve, side, w, h, off = () => 0, segs = 180, rad = 28) {
  const pos = [], idx = [], P = V(0, 0, 0), T = V(0, 0, 0), S = V(0, 0, 0), O = V(0, 0, 0);
  for (let i = 0; i <= segs; i++) {
    const u = i / segs; curve.getPointAt(u, P); curve.getTangentAt(u, T);
    S.copy(side).addScaledVector(T, -side.dot(T)).normalize();
    O.copy(T).cross(S).normalize(); if (O.dot(P) < 0) O.negate();
    const ww = w(u) / 2, hh = h(u) / 2, oo = off(u);
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
      const x = Math.sign(c) * Math.abs(c) ** 0.7 * ww, y = Math.sign(s) * Math.abs(s) ** 0.7 * hh + oo;
      pos.push(P.x + S.x * x + O.x * y, P.y + S.y * x + O.y * y, P.z + S.z * x + O.z * y);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * rad + j, b = i * rad + ((j + 1) % rad);
    idx.push(a, a + rad, b, b, a + rad, b + rad);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function buildPhones() {
  const g = new THREE.Group(), F = phonesPlane(), { X, U, N, at, tc } = F, m0 = 1 - PHONES.press, [y0, y1, y2] = PHONES.y;
  const mat = {};
  for (const [k, pal] of Object.entries(PAL10)) mat[k] = smoothMat(pal, k === 'shell' || k === 'slider' ? 0.18 : 0.1, 0.1);
  const cups = [], ends = [];
  for (const s of [1, -1]) {            // right (+x), left
    const t = s > 0 ? tc : Math.PI - tc, c = at(t), up = at(t + (s * Math.PI) / 2);   // up: toward the head top
    const r0 = furAt(c, m0) - 0.004, cup = new THREE.Group();
    cup.position.copy(c).multiplyScalar(r0);
    cup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(c.clone().cross(N), c, N));   // lathe +y = out of the head
    const head = (r) => Math.sqrt(Math.max(r0 * r0 - r * r, 0)) - r0;      // the pressed fur under the cushion, cup frame
    cup.add(new THREE.Mesh(new THREE.LatheGeometry(discProfile(PHONES.cush, -0.006, y0 + 0.012, 0.06, 0.05, { bottom: head }), 72), mat.cushion));
    cup.add(new THREE.Mesh(new THREE.LatheGeometry(discProfile(PHONES.shell, y0 - 0.01, y1, 0.035, 0.04), 72), mat.shell));
    cup.add(new THREE.Mesh(new THREE.LatheGeometry(discProfile(PHONES.cap, y1 - 0.012, y2, 0.02, 0.04, { dome: 0.02 }), 72), mat.cap));
    g.add(cup);
    cups.push(new THREE.Vector4(c.x, c.y, c.z, Math.cos(PHONES.cupPress * D2R)));
    const mid = c.clone().multiplyScalar(r0 + (y0 + y1) / 2);
    const slider = mid.clone().addScaledVector(up, PHONES.shell + PHONES.slider[1] * 0.5 + 0.02);
    ends.push({ inShell: mid.clone().addScaledVector(up, PHONES.shell - 0.07), slider, t: Math.atan2(slider.dot(U), slider.dot(X)), r: slider.length() });
  }
  // the band's middle line: out of the right cup's shell, through its slider, down onto the head top (lying on its pad
  // on the pressed fur), over it and back up to the left cup. It rests on a smooth fit of the fur's core over its span
  // (a short Fourier series in t, least squares, lifted to clear every sample), not on the fur's lumps.
  const [R, L] = ends;
  const basis = (t) => [1, Math.cos(t), Math.sin(t), Math.cos(2 * t), Math.sin(2 * t)], S = [], A = basis(0).map(() => new Array(6).fill(0));
  for (let t = R.t - 0.1; t <= L.t + 0.1; t += 0.01) S.push([t, furAt(at(t), 0)]);
  for (const [t, r] of S) { const f = basis(t); for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) A[i][j] += f[i] * f[j]; A[i][5] += f[i] * r; } }
  for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) if (k !== i) { const q = A[k][i] / A[i][i]; for (let j = i; j < 6; j++) A[k][j] -= q * A[i][j]; }
  const fit = (t) => basis(t).reduce((s, f, i) => s + (f * A[i][5]) / A[i][i], 0), clear = Math.max(...S.map(([t, r]) => r - fit(t)));
  const rest = (t) => fit(t) + clear + 0.006 + PHONES.pad[1] * 0.75 + PHONES.band[1] * 0.5;
  // from each slider a straight run onto the head, tangent to the resting arc (a band stretched over a ball: convex
  // everywhere, no shoulder); r(t) = the run's radius along direction t (band-plane coordinates along X, U)
  const run = (E, side) => {
    let tT = Math.PI / 2;
    for (let it = 0; it < 5; it++) tT = E.t + side * Math.acos(Math.min(1, rest(tT) / E.r));
    const A = [E.slider.dot(X), E.slider.dot(U)], D = [rest(tT) * Math.cos(tT) - A[0], rest(tT) * Math.sin(tT) - A[1]], AxD = A[0] * D[1] - A[1] * D[0];
    return { tT, r: (t) => AxD / (Math.cos(t) * D[1] - Math.sin(t) * D[0]) };
  };
  const runR = run(R, 1), runL = run(L, -1);
  const bandR = (t) => Math.max(rest(t), t < runR.tT ? runR.r(t) : 0, t > runL.tT ? runL.r(t) : 0);
  const pts = [R.inShell, R.slider], n = 40;
  for (let i = 1; i < n; i++) { const t = R.t + ((L.t - R.t) * i) / n; pts.push(at(t).multiplyScalar(bandR(t))); }
  pts.push(L.slider, L.inShell);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const uS = R.inShell.distanceTo(R.slider) / curve.getLength(), grow = (u) => sstep(uS, uS + 0.07, Math.min(u, 1 - u));
  const [bw, bh] = PHONES.band, [pw, ph] = PHONES.pad;
  g.add(new THREE.Mesh(strap(curve, N, (u) => PHONES.stem + (bw - PHONES.stem) * grow(u), (u) => PHONES.stem + (bh - PHONES.stem) * grow(u)), mat.band));
  const pk = (u) => 0.15 + 0.85 * sstep(uS - 0.01, uS + 0.05, Math.min(u, 1 - u));   // the pad's ends tucked into the sliders
  g.add(new THREE.Mesh(strap(curve, N, (u) => pw * pk(u), (u) => ph * pk(u), (u) => -(bh * 0.5 + ph * 0.25) * grow(u)), mat.pad));
  for (const u of [uS, 1 - uS]) {         // the sliders: soft collars round the band where it comes out of the cups
    const sl = new THREE.Mesh(new THREE.LatheGeometry(discProfile(PHONES.slider[0], -PHONES.slider[1] / 2, PHONES.slider[1] / 2, 0.022, 0.022), 48), mat.slider);
    sl.position.copy(curve.getPointAt(u)); sl.quaternion.setFromUnitVectors(V(0, 1, 0), curve.getTangentAt(u)); g.add(sl);
  }
  g.userData.plane = F;
  g.userData.cups = { a: cups[0], b: cups[1], p: new THREE.Vector2(PHONES.cupEdge, PHONES.press) };
  return g;
}

// where each piece goes (body frame) and what it does to the head: press = the fur flattened under it (axis, outer
// angle°, inner angle° or 0 = a cap, limit = [axis, cos] or null), tuft = false hides the hair tuft (the 2D hides it)
const CROWN = { fwd: 14, roll: 2, yaw: 8.5, dist: 0.85, off: [0, 0, 0] };
const PARTY = { fwd: 10, roll: -9, yaw: 0, dist: 0.93, off: [-0.15, -0.02, 0] };
const TIE = { at: V(0.025, -0.215, 0), r: 1.06, up: 8, scale: 1.16 };
const RIBBON = { dir: V(-0.352, 0.7, 0.62), r: 1.09, face: 1.4, roll: 19, scale: 1.3, bend: 0.5 };
// pass 9 (user: the hair ribbon looked broken - fur strands poked through its loops' lower edges, where the ribbon sits
// down in the fur): its footprint on the head, a texture in a gnomonic chart round its direction (u, v = d·e1, d·e2 over
// d·n0, ±U): r = how much of the strands' length may stay, g = how far the fur (core too) dips. Per texel: the radius
// where the ribbon starts along that direction (its underside, from the mesh's vertices), minus a gap; spread to the
// texels round it rising at a slope, so the fur ramps back to full length over a few hundredths of a unit round it.
const FOOT = { N: 128, U: 0.5, gapT: 0.008, slopeT: 0.5, gapC: 0.004, slopeC: 0.45, dip: 0.06, reach: 0.1 };
function ribbonFoot(g) {
  const { N, U } = FOOT, cell = (2 * U) / N, n0 = g.position.clone().normalize();
  const e1 = V(0, 1, 0).cross(n0).normalize(), e2 = n0.clone().cross(e1);
  const hit = new Float32Array(N * N).fill(Infinity), P = V(0, 0, 0);
  g.updateMatrix();
  const M = g.matrix.clone().multiply(g.children[0].matrix), pos = g.children[0].geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    P.fromBufferAttribute(pos, i).applyMatrix4(M);
    const r = P.length(), dn = P.dot(n0) / r;
    if (dn < 0.5) continue;
    const iu = Math.floor((P.dot(e1) / (r * dn) + U) / cell), iv = Math.floor((P.dot(e2) / (r * dn) + U) / cell);
    if (iu >= 0 && iv >= 0 && iu < N && iv < N && r < hit[iu + N * iv]) hit[iu + N * iv] = r;
  }
  const R = Math.ceil(FOOT.reach / cell), tip = new Float32Array(N * N).fill(Infinity), core = new Float32Array(N * N).fill(Infinity);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    const hk = hit[u + N * v];
    if (hk === Infinity) continue;
    for (let dv = -R; dv <= R; dv++) for (let du = -R; du <= R; du++) {
      const uu = u + du, vv = v + dv;
      if (uu < 0 || vv < 0 || uu >= N || vv >= N) continue;
      const dist = Math.hypot(du, dv) * cell, k = uu + N * vv;
      tip[k] = Math.min(tip[k], hk - FOOT.gapT + FOOT.slopeT * dist);
      core[k] = Math.min(core[k], hk - FOOT.gapC + FOOT.slopeC * dist);
    }
  }
  const data = new Uint8Array(N * N * 4), d = V(0, 0, 0);
  let pressed = 0, dipMax = 0;
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    const k = u + N * v, edge = u === 0 || v === 0 || u === N - 1 || v === N - 1;
    d.copy(n0).addScaledVector(e1, (u + 0.5) * cell - U).addScaledVector(e2, (v + 0.5) * cell - U).normalize();
    const b = bodyShape(d), rc = SKIN * b.s + FUR * CORE;
    const dip = edge ? 0 : Math.min(FOOT.dip, Math.max(0, rc - core[k]));
    const m = edge ? 1 : Math.min(1, Math.max(0, (tip[k] - (rc - dip)) / (FUR * b.len * (1 - CORE))));
    data[4 * k] = Math.round(255 * m); data[4 * k + 1] = Math.round((255 * dip) / FOOT.dip); data[4 * k + 3] = 255;
    if (m < 1) pressed++; dipMax = Math.max(dipMax, dip);
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, n0, e1, e2, pressed, dipMax };
}
const ITEM7 = {
  crown: { slot: 'head', tuft: false, build: () => poseOn(buildCrown(), CROWN),
    press: (g) => ({ axis: V(0, 1, 0).applyQuaternion(g.quaternion), outer: 31, inner: 19 }) },
  party: { slot: 'head', tuft: false, build: () => poseOn(buildParty(), PARTY),
    press: (g) => ({ axis: V(0, 1, 0).applyQuaternion(g.quaternion), outer: 29, inner: 0 }) },
  flowers: { slot: 'head', tuft: false, build: buildFlowers,
    press: (g) => ({ axis: g.userData.A, outer: 52, inner: 35 }) },
  bunny: { slot: 'head', tuft: true, build: buildBunny,
    press: () => { const b = BUNNY.fwd * D2R; return { axis: V(0, Math.sin(b), -Math.cos(b)), outer: 93.6, inner: 86.4, limit: [V(0, Math.cos(b), Math.sin(b)), Math.cos(46 * D2R)] }; } },
  bow: { slot: 'head', tuft: true, build: () => {
    const g = buildRibbon(), n = RIBBON.dir.clone().normalize(), view = V(0.147, 0.02, 0.989);
    const z = n.clone().multiplyScalar(1 - RIBBON.face * 0.5).addScaledVector(view, RIBBON.face * 0.5).normalize();
    g.quaternion.copy(faceQ(z, V(0, 1, 0).applyAxisAngle(z, RIBBON.roll * D2R)));
    g.position.copy(n).multiplyScalar(RIBBON.r); g.scale.setScalar(RIBBON.scale); g.userData.foot = ribbonFoot(g); return g; } },
  glasses: { slot: 'face', build: () => buildGlasses() },
  stars: { slot: 'face', build: () => buildGlasses({ star: true }) },
  // pass 10: the headphones' band presses a ring along its plane, down to where it lifts off toward the sliders (the
  // cups press theirs in the PHONES10 fur variant, see wearSlot); the tuft stays, standing up in front of the band
  phones: { slot: 'head', tuft: true, build: buildPhones,
    press: (g) => { const { U, N } = g.userData.plane; return { axis: N, outer: 90 + PHONES.bandPress, inner: 90 - PHONES.bandPress, limit: [U, Math.cos(PHONES.bandLim * D2R)] }; } },
  bowtie: { slot: 'neck', build: () => {
    const g = buildBowtie(), d = V(TIE.at.x, TIE.at.y, Math.sqrt(1 - TIE.at.x ** 2 - TIE.at.y ** 2)).normalize();
    g.quaternion.copy(faceQ(d.clone().add(V(0, 0.12, 0)).normalize())); g.position.copy(d).multiplyScalar(TIE.r); g.scale.setScalar(TIE.scale); return g; } },
};

// ── scene, camera, layout ──────────────────────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('c3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
const T = buildTutor();
scene.add(T.root);
const cape = buildCape(); T.upper.add(cape);
const cap = buildCap(); cap.visible = false; T.upper.add(cap);
// gloves and shoes: built on first use (a few tens of ms), then just shown/hidden
const wear = { gloves: false, shoes: false, gloveMeshes: null, shoeMeshes: null };
function setGloves(on) {
  if (on && !wear.gloveMeshes) wear.gloveMeshes = [T.armL, T.armR].map((a) => { const g = buildGlove(a.userData.hand); a.add(g); return g; });
  wear.gloves = on;
  if (wear.gloveMeshes) for (const g of wear.gloveMeshes) g.visible = on;
  const b = document.getElementById('bGloves'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (typeof syncChips === 'function') syncChips();
}
function setShoes(on) {
  if (on && !wear.shoeMeshes) wear.shoeMeshes = T.feet.map((f, i) => {
    const s = buildShoe(); s.position.copy(f.userData.at); s.rotation.y = (i === 0 ? -1 : 1) * SHOE.toeOut; T.root.add(s); return s;
  });
  wear.shoes = on;
  if (wear.shoeMeshes) for (const s of wear.shoeMeshes) s.visible = on;
  for (const f of T.feet) f.position.y = on ? SHOE.lift : 0;      // the foot stands on the insole, its fur inside the shoe
  const b = document.getElementById('bShoes'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (typeof syncChips === 'function') syncChips();
}
// pass 7: one piece per slot, head + face + neck together. worn = { head, face, neck, back, hands, feet } (item ids); the
// grad cap, cape, gloves and shoes are the pieces above, the rest ITEM7's (built on first use)
const T3D_ITEMS = ['gradcap', 'crown', 'party', 'flowers', 'bunny', 'bow', 'phones', 'glasses', 'stars', 'bowtie', 'cape', 'gloves', 'shoes'];
const worn = { head: null, face: null, neck: null };
const built7 = {};
let furFoot9 = null;                     // pass 9: the body fur's material while the hair ribbon is worn (see wearSlot)
let furPhones10 = null;                  // pass 10: ... while the headphones are worn
function piece7(id) {
  if (!built7[id]) { built7[id] = ITEM7[id].build(); built7[id].visible = false; T.upper.add(built7[id]); }
  return built7[id];
}
/** put on (id) or take off (null) the piece in a head/face/neck slot; the head's piece presses the fur, may hide the tuft */
function wearSlot(slot, id) {
  if (id && !(slot === 'head' && id === 'gradcap') && !(ITEM7[id] && ITEM7[id].slot === slot)) id = null;
  worn[slot] = id || null;
  for (const [k, it] of Object.entries(ITEM7)) if (it.slot === slot && built7[k]) built7[k].visible = k === id;
  if (id && ITEM7[id]) piece7(id).visible = true;
  if (slot === 'head') {
    cap.visible = id === 'gradcap'; toggle($('bCap'), cap.visible);
    const it = ITEM7[id], u = T.furMat.uniforms;
    for (const m of T.tuft) m.visible = !(id === 'gradcap' || (it && it.tuft === false));
    const pr = id === 'gradcap' ? { axis: cap.position.clone().normalize(), outer: 31, inner: 0, k: 0.8 } : it && it.press ? it.press(built7[id]) : null;   // the cap's skull too
    if (pr) {
      u.uPressAx.value.set(pr.axis.x, pr.axis.y, pr.axis.z, Math.cos(pr.outer * D2R));
      u.uPress.value.set(pr.inner ? Math.cos(pr.inner * D2R) : 2, 0.012, pr.k ?? 0.85);
      if (pr.limit) u.uPressLim.value.set(pr.limit[0].x, pr.limit[0].y, pr.limit[0].z, pr.limit[1]); else u.uPressLim.value.set(0, 1, 0, -2);
    } else u.uPress.value.z = 0;
    // pass 9: with the ribbon the fur draws with furFoot9 (FOOT9: its footprint presses the fur), else with furMat as is
    const ft = id === 'bow' ? built7.bow.userData.foot : null;
    if (ft) {
      furFoot9 ??= new THREE.ShaderMaterial({ vertexShader: FUR_VS, fragmentShader: FUR_FS, transparent: true, uniforms: u, defines: { FOOT9: '' } });
      u.uFootTex.value = ft.tex; u.uFootA.value.set(ft.n0.x, ft.n0.y, ft.n0.z, 1);
      u.uFootB.value.set(ft.e1.x, ft.e1.y, ft.e1.z, 1 / (2 * FOOT.U)); u.uFootC.value.set(ft.e2.x, ft.e2.y, ft.e2.z, FOOT.dip);
    }
    // pass 10: with the headphones it draws with furPhones10 (PHONES10: the cups press the fur flat too)
    const cu = id === 'phones' ? built7.phones.userData.cups : null;
    if (cu) {
      furPhones10 ??= new THREE.ShaderMaterial({ vertexShader: FUR_VS, fragmentShader: FUR_FS, transparent: true, uniforms: u, defines: { PHONES10: '' } });
      u.uCup0.value.copy(cu.a); u.uCup1.value.copy(cu.b); u.uCupP.value.copy(cu.p);
    }
    T.fur.material = ft ? furFoot9 : cu ? furPhones10 : T.furMat;
  }
  syncChips();
}
function setWorn(w) {
  for (const slot of ['head', 'face', 'neck']) wearSlot(slot, w[slot]);
  cape.visible = w.back === 'cape'; toggle($('bCape'), cape.visible);
  setGloves(w.hands === 'gloves'); setShoes(w.feet === 'shoes');
  syncChips();
}
function syncChips() {
  document.querySelectorAll('[data-slot]').forEach((b) => {
    const sl = b.dataset.slot, id = b.dataset.item || null;
    const cur = sl === 'back' ? (cape.visible ? 'cape' : null) : sl === 'hands' ? (wear.gloves ? 'gloves' : null) : sl === 'feet' ? (wear.shoes ? 'shoes' : null) : worn[sl];
    b.setAttribute('aria-pressed', (cur || null) === id ? 'true' : 'false');
  });
}
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.75), new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x8a5a30, transparent: true, opacity: 0.32, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, GROUND + 0.003, 0.1); scene.add(shadow);

const view = { target: V(0, 0, 0), dist: 10 };
// headroom above the art frame (pass 7; art px, `?top=N` or the canvas's data-top): the crown, party hat and bunny ears
// reach above the picture's frame, so a page can give the canvas that much extra room on top. The camera stays the
// frame's own (setViewOffset only widens the view upward), so the tutor renders exactly as without it.
const TOP = Math.max(0, +(new URLSearchParams(location.search).get('top') ?? canvas.dataset.top ?? 0) || 0);
function layout() {
  const box = (TOP > 0 ? canvas : canvas.parentElement).getBoundingClientRect();
  const W = Math.max(1, box.width), H = Math.max(1, box.height);
  renderer.setSize(W, H, false);
  if (TOP > 0) {        // the frame = the box at the bottom middle, under TOP art px of headroom
    const s = Math.min(W / ART.w, H / (ART.h + TOP)), fw = ART.w * s, fh = ART.h * s, fx = (W - fw) / 2, fy = (H - (ART.h + TOP) * s) / 2 + TOP * s;
    const ppu = ART.R * s;
    view.dist = fh / (2 * Math.tan((FOV * D2R) / 2) * ppu);
    view.target.set((fw / 2 - ART.cx * s) / ppu, (ART.cy * s - fh / 2) / ppu, 0);
    camera.setViewOffset(fw, fh, -fx, -fy, W, H);          // also sets the aspect (fw / fh) and the projection
    return;
  }
  const s = Math.min(W / ART.w, H / ART.h), ox = (W - ART.w * s) / 2, oy = (H - ART.h * s) / 2;
  const ppu = ART.R * s;                                   // css px per unit at depth 0 = the 2D picture's scale
  camera.aspect = W / H; camera.updateProjectionMatrix();
  view.dist = H / (2 * Math.tan((FOV * D2R) / 2) * ppu);
  view.target.set((W / 2 - (ox + ART.cx * s)) / ppu, ((oy + ART.cy * s) - H / 2) / ppu, 0);
}
addEventListener('resize', layout);
layout();

// ── interaction + animation ─────────────────────────────────────────────────────────────────────────────────────
const st = { yaw: 0, vel: 0, pitch: 0, drag: null, spin: false, still: false, talkUntil: 0, mouth: 0, mouthSet: null, waveUntil: 0, hopAt: -9, blinkAt: 1.5, omega: 0, last: 0,
  paused: false, twirl: null, twirlOff: 0 };   // pass 10: paused = no frames; twirl = { u: 0..1 } while one turns, twirlOff its angle
const hint = document.getElementById('hint');
canvas.addEventListener('pointerdown', (e) => {
  stopTwirl();
  st.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; st.vel = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!st.drag) return;
  const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y, now = performance.now(), dt = Math.max(1, now - st.drag.t) / 1000;
  st.yaw += dx * 0.011; st.vel = (dx * 0.011) / dt;
  st.pitch = Math.min(0.42, Math.max(-0.08, st.pitch + dy * 0.004));
  st.drag.moved += Math.abs(dx) + Math.abs(dy); st.drag.x = e.clientX; st.drag.y = e.clientY; st.drag.t = now;
  if (st.drag.moved > 12) { hint.style.opacity = '0'; setSpin(false); }
});
const up = () => { if (st.drag && st.drag.moved < 8) { st.hopAt = clock; st.waveUntil = clock + 1.8; } st.drag = null; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

const $ = (id) => document.getElementById(id);
const toggle = (btn, on) => btn.setAttribute('aria-pressed', on ? 'true' : 'false');
function setSpin(on) { st.spin = on; toggle($('bSpin'), on); }
$('bCape').onclick = () => { cape.visible = !cape.visible; toggle($('bCape'), cape.visible); syncChips(); };
$('bCap').onclick = () => wearSlot('head', cap.visible ? null : 'gradcap');
$('bSpin').onclick = () => setSpin(!st.spin);
$('bTalk').onclick = () => { st.talkUntil = clock + 2.6; };
$('bWave').onclick = () => { st.waveUntil = clock + 2.0; };
$('bFront').onclick = () => { setSpin(false); st.vel = 0; st.back = true; };
if ($('bGloves')) $('bGloves').onclick = () => setGloves(!wear.gloves);
if ($('bShoes')) $('bShoes').onclick = () => setShoes(!wear.shoes);
// the item chips (index.html): data-slot + data-item ('' = nothing in that slot)
document.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => {
  const sl = b.dataset.slot, id = b.dataset.item || null;
  if (sl === 'back') { cape.visible = id === 'cape'; toggle($('bCape'), cape.visible); syncChips(); }
  else if (sl === 'hands') setGloves(id === 'gloves');
  else if (sl === 'feet') setShoes(id === 'shoes');
  else wearSlot(sl, id);
}; });
syncChips();

// the game turns it (pass 6; user: "캐릭터가 안돌아가는데 좌우 상하 회전을 안하잖아"). In the game the 3D tutor is an iframe
// (embed.html) with pointer-events: none, so the game posts { t3d: { drag: [dx, dy] } } while a finger drags over the
// tutor (art px of the 660×680 frame since the last message) and { t3d: { dragEnd: true } } on release: the same turn as
// a drag on this canvas, inertia on release, then ~1.2 s later it eases back to the picture angle. It answers with
// { t3dPose: { front } } (front: not dragged and within 3° of the picture angle), so the game knows when its own 2D
// layers fit again.
// Pass 10 (the game's dress room gets this 3D tutor too, in a second iframe; user: "드레스룸에 있는 캐릭터도 … 360도 회전도
// 되는거 아냐? 그래야 망또도 확인하지"): set({ autoFront: false }) = after dragEnd only the inertia, it stays turned (true,
// the default, = back to the picture angle ~1.2 s after the release; switching it back doesn't move it), { toFront: true }
// = ease back to the picture angle the short way now (like the 정면 chip), { twirl: true } = one smooth full turn (~1.3 s,
// eased in and out) that ends at the angle it started from, so the back and the cape show (a drag stops it where it is),
// { paused: true } = no frames at all while the game hides that iframe (messages still apply; paused: false picks up
// without a time jump).
const EMBED = window.parent !== window, RETURN_MS = 1200, TAU = 2 * Math.PI, TWIRL_S = 1.3;
let returnAt = 0, poseFront = null, autoFront = true;
/** pass 10: stop a twirl where it is (its angle folded into the yaw, so nothing jumps) */
function stopTwirl() { if (st.twirl) { st.yaw += st.twirlOff; st.twirlOff = 0; st.twirl = null; } }
function remoteDrag(dx, dy) {
  const now = performance.now();
  stopTwirl();
  let d = st.drag;
  if (!d || !d.remote) {                              // the first move after a release starts a new drag
    d = st.drag = { t: now - 16, t0: now - 32, acc: 0, moved: 0, remote: true };
    st.vel = 0; st.back = false;
  }
  returnAt = 0;
  const dyaw = dx * 0.011, gap = now - d.t;
  st.yaw += dyaw;
  // the inertia's velocity as the canvas estimates it (this move / the time since the last one); messages that arrive
  // bunched in one task count as one move, so a late frame doesn't fling it
  if (gap < 4) { d.acc += dyaw; st.vel = d.acc / (Math.max(1, now - d.t0) / 1000); }
  else { d.t0 = d.t; d.acc = dyaw; st.vel = dyaw / (gap / 1000); }
  st.pitch = Math.min(0.42, Math.max(-0.08, st.pitch + dy * 0.004));
  d.moved += Math.abs(dx) + Math.abs(dy); d.t = now;
  if (d.moved > 12) { hint.style.opacity = '0'; setSpin(false); }
}
function remoteEnd() {
  const now = performance.now();
  if (st.drag && st.drag.remote) { st.vel *= Math.exp(-(now - st.drag.t) / 120); st.drag = null; }   // held still, then let go: no fling
  returnAt = autoFront ? now + RETURN_MS : 0;                        // pass 10: autoFront false = it stays turned
}
const isFront = () => !st.drag && !st.twirl && Math.abs((((st.yaw % TAU) + TAU + Math.PI) % TAU) - Math.PI) < 3 * D2R && Math.abs(st.pitch) < 3 * D2R;
function postPose(force = false) {
  const f = isFront();
  if (f !== poseFront || force) { poseFront = f; parent.postMessage({ t3dPose: { front: f } }, '*'); }
}
/** pass 10: paused = the loop stops (no render, no per-frame work); back on, the paused time is skipped: pending
 *  deadlines move by it and the first frame steps 1 ms, so nothing catches up in a burst */
let raf = 0, pausedAt = 0;
function setPaused(on) {
  if (on === st.paused) return;
  st.paused = on;
  const now = performance.now();
  if (on) { pausedAt = now; if (raf) { cancelAnimationFrame(raf); raf = 0; } return; }
  const gap = now - pausedAt;
  if (returnAt) returnAt += gap;
  if (st.drag && st.drag.remote) { st.drag.t += gap; st.drag.t0 += gap; }
  st.last = 0;
  if (!raf) raf = requestAnimationFrame(tick);
}

let clock = 0;
const ease = (t) => t * t * (3 - 2 * t);
function tick(now) {
  raf = 0;
  if (st.paused) return;
  const t = now / 1000, dt = Math.min(0.05, Math.max(0.001, t - (st.last || t))); st.last = t;
  if (!st.still) clock += dt;
  const prevYaw = st.yaw + st.twirlOff;
  if (st.drag && st.drag.remote && now - st.drag.t > 4000) remoteEnd();   // no dragEnd came (a lost pointerup): let go
  if (returnAt && !st.drag && now >= returnAt) { returnAt = 0; st.vel = 0; st.back = true; }
  if (!st.drag) {
    if (st.spin) st.yaw += 0.9 * dt;
    else { st.yaw += st.vel * dt; st.vel *= Math.exp(-dt * 2.4); }
    if (st.back) {                                          // "정면": back to the picture's angle by the short way
      const k = Math.round(st.yaw / (2 * Math.PI)) * 2 * Math.PI;
      st.yaw += (k - st.yaw) * (1 - Math.exp(-dt * 6)); st.pitch *= Math.exp(-dt * 6);
      if (Math.abs(k - st.yaw) < 1e-3 && Math.abs(st.pitch) < 1e-3) { st.yaw = 0; st.pitch = 0; st.back = false; }
    }
  }
  // pass 10: a twirl = one full turn on top of the yaw (so a return to the front can run under it), eased in and out;
  // its last frame folds the full turn away (wrap keeps omega continuous, so the cape doesn't flick)
  let wrap = 0;
  if (st.twirl) {
    st.twirl.u = Math.min(1, st.twirl.u + dt / TWIRL_S);
    st.twirlOff = TAU * ease(st.twirl.u);
    if (st.twirl.u >= 1) { wrap = TAU; st.twirlOff = 0; st.twirl = null; }
  }
  const omega = (st.yaw + st.twirlOff + wrap - prevYaw) / dt;
  st.omega += (omega - st.omega) * (1 - Math.exp(-dt * 5));
  shared.uOmega.value = st.still ? 0 : Math.max(-6, Math.min(6, st.omega));
  shared.uTime.value = clock;
  T.root.rotation.y = POSE.yaw + st.yaw + st.twirlOff;
  if (EMBED) postPose();
  // breathing, a hop on tap
  const br = st.still ? 0 : Math.sin(clock * 1.9);
  const hop = st.still ? 0 : Math.max(0, Math.sin(Math.min(1, (clock - st.hopAt) / 0.45) * Math.PI)) * 0.12;
  T.upper.scale.set(1 - 0.006 * br, 1 + 0.012 * br, 1 - 0.006 * br);
  T.upper.position.y = hop;
  // blink
  if (!st.still && clock > st.blinkAt) st.blinkAt = clock + 2.4 + Math.random() * 2.6;
  const bl = (() => { const d = st.blinkAt - clock; return d > 0 && d < 0.14 ? 0.12 + 0.88 * Math.abs(d - 0.07) / 0.07 : 1; })();
  for (const e of T.eyes) e.scale.y = st.still ? 1 : bl;   // the 140 ms before each blinkAt: shut and open
  // wave the raised arm
  const w = !st.still && clock < st.waveUntil ? Math.sin(clock * 10) * 0.32 * ease(Math.min(1, (st.waveUntil - clock) / 0.4)) : 0;
  T.armL.rotation.z = w;
  // talk: a babble of open/close shapes (a frozen clock keeps the current shape for stills)
  const talking = clock < st.talkUntil;
  const target = talking ? 0.2 + 0.8 * Math.abs(Math.sin(clock * 11.0) * Math.sin(clock * 4.3 + 1.0)) : 0;
  st.mouth += (target - st.mouth) * (1 - Math.exp(-dt * 22));
  T.furMat.uniforms.uMouthOpen.value = st.mouthSet ?? st.mouth;
  // camera: orbit for pitch, the light rides with it (view-space lighting)
  const c = view.target, d = view.dist;
  camera.position.set(c.x, c.y + Math.sin(st.pitch) * d, c.z + Math.cos(st.pitch) * d);
  camera.lookAt(c);
  renderer.render(scene, camera);
  raf = requestAnimationFrame(tick);
}
raf = requestAnimationFrame(tick);
if (EMBED) postPose(true);
if (EMBED) parent.postMessage({ t3dItems: T3D_ITEMS }, '*');   // pass 7: the game hides the 2D pictures of exactly these

// QA hooks (headless screenshots)
window.__t3d = {
  set(o) {
    if ('yaw' in o) { st.yaw = o.yaw * D2R; st.vel = 0; st.back = false; returnAt = 0; st.twirl = null; st.twirlOff = 0; }
    if ('pitch' in o) st.pitch = o.pitch * D2R;
    if ('cape' in o) { cape.visible = !!o.cape; toggle($('bCape'), cape.visible); syncChips(); }
    if (o.worn && typeof o.worn === 'object') setWorn(o.worn);       // pass 7: the whole outfit by slot (item ids)
    if ('cap' in o && !!o.cap !== cap.visible) wearSlot('head', o.cap ? 'gradcap' : (worn.head === 'gradcap' ? null : worn.head));
    if ('still' in o) st.still = o.still;
    if ('shadow' in o) shadow.visible = !!o.shadow;               // the game draws its own floor shadow (it stays down when the tutor hops; user: "튜터 캐릭터가 뛸때 그림자가 같이 묶여서 올라가던데")
    if ('spin' in o) setSpin(o.spin);
    if ('talk' in o) { st.talkUntil = o.talk ? clock + 1e6 : 0; }   // talk: true babbles until talk: false
    if ('mouth' in o) st.mouthSet = o.mouth;                        // 0..1 holds the mouth open that far; null releases it
    if (o.drag) remoteDrag(+o.drag[0] || 0, +o.drag[1] || 0);      // the game's drag over the tutor (art px since the last one)
    if (o.dragEnd) remoteEnd();                                     // released: inertia, then back to the picture angle
    if ('gloves' in o) setGloves(!!o.gloves);
    if ('shoes' in o) setShoes(!!o.shoes);
    // pass 10 (the dress room): see the note above EMBED
    if ('autoFront' in o) { autoFront = !!o.autoFront; if (!autoFront) returnAt = 0; }
    if (o.toFront) { setSpin(false); st.vel = 0; st.back = true; returnAt = 0; }
    if (o.twirl && !st.twirl && !st.drag) { st.twirl = { u: 0 }; st.twirlOff = 0; }
    if ('paused' in o) setPaused(!!o.paused);
  },
  info: () => ({ gl: renderer.getContext().getParameter(renderer.getContext().VERSION), dpr: renderer.getPixelRatio(), mouth: T.furMat.uniforms.uMouthOpen.value,
    yaw: st.yaw / D2R, pitch: st.pitch / D2R, vel: st.vel, dragging: !!st.drag, back: !!st.back, front: isFront(), gloves: wear.gloves, shoes: wear.shoes, cape: cape.visible, worn: { ...worn }, items: T3D_ITEMS,
    autoFront, twirl: st.twirl ? st.twirlOff / D2R : null, paused: st.paused, frame: renderer.info.render.frame }),
  dbg: { furMat: T.furMat, limbMat, tuftMat, camera, scene, T, wear, hands: [T.armL.userData.hand, T.armR.userData.hand], shoe: () => shoeParts, built7, ITEM7, cap, cape, RIBBON8, buildRibbon, bowMesh },
};
