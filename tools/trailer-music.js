/* The trailer's soundtrack, synthesised here (no samples, no packages): 60 s at 120 BPM in D minor,
 * cut to trailer-shots.js, with hits on the game's own events from the recording.
 *   node tools/trailer-music.js <events.json> <out.wav>
 *
 *   0-5 s     a swelling chord, a heartbeat kick and a riser into the first cut
 *   5-36 s    the six storms: drums (kick on 1 and 3, snare on 2 and 4, eighth-note hats), a bass
 *             riff, a chord pad, and an impact with a crash on every cut
 *   36-46 s   the brawl: a kick on every beat, the bass an octave doubled and driven, stabs on hits,
 *             a growl when storms lock together, a boom on a KO
 *   46-53 s   the melee, with a riser into the end card
 *   53-60 s   one big impact and the chord ringing out
 * The events (events.json, from tools/trailer.js) add their sounds where they happened: specials
 * (surge, dash, whiteout, dust wall, firestorm), lightning bolts, hits and KOs that involve your storm.
 * Written as 16-bit stereo WAV at 44.1 kHz.
 */
'use strict';
const fs = require('fs');
const { FPS, BPM, TAKES, total } = require('./trailer-shots.js');

const [evPath, outPath] = process.argv.slice(2);
if (!evPath || !outPath) { console.error('node tools/trailer-music.js <events.json> <out.wav>'); process.exit(1); }
const events = JSON.parse(fs.readFileSync(evPath, 'utf8'));
const SR = 44100, DUR = total / FPS, N = Math.ceil(SR * DUR), BEAT = 60 / BPM;
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N);
let seed = 7;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const noise = () => rnd() * 2 - 1;
const at = (name) => TAKES.find((t) => t.name === name).t0;

// write v at sample i, panned (-1 left .. 1 right), with a share sent to the reverb
function put(i, v, pan = 0, rev = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * (pan > 0 ? 1 - pan : 1); R[i] += v * (pan < 0 ? 1 + pan : 1); SEND[i] += v * rev;
}
// a voice: fn(t, k) -> sample, for dur seconds from t0
function voice(t0, dur, fn, pan = 0, rev = 0) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let k = 0; k < n; k++) put(i0 + k, fn(k / SR, k), pan, rev);
}
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);   // a MIDI note's frequency

// ---------------------------------------------------------------- instruments
function kick(t0, v = 1) {
  let ph = 0;
  voice(t0, 0.5, (t) => { ph += 2 * Math.PI * (44 + 120 * Math.exp(-t / 0.035)) / SR; return v * (Math.sin(ph) * Math.exp(-t / 0.2) + (t < 0.004 ? noise() * 0.5 : 0)); });
}
function snare(t0, v = 1) {
  let lp = 0;
  voice(t0, 0.35, (t) => { const n = noise(); lp += 0.35 * (n - lp); return v * (0.45 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.06) + 0.7 * (n - lp) * Math.exp(-t / 0.12)); }, 0.05, 0.25);
}
function hat(t0, v = 1, open = false) {
  let prev = 0;
  voice(t0, open ? 0.3 : 0.06, (t) => { const n = noise(), h = n - prev; prev = n; return v * 0.35 * h * Math.exp(-t / (open ? 0.12 : 0.022)); }, 0.25, 0.05);
}
function crash(t0, v = 1) {
  let prev = 0;
  voice(t0, 2.2, (t) => { const n = noise(), h = n - prev; prev = n; return v * 0.3 * h * Math.exp(-t / 0.8); }, -0.2, 0.35);
}
function tom(t0, f, v = 1) {
  let ph = 0;
  voice(t0, 0.5, (t) => { ph += 2 * Math.PI * f * (1 - 0.4 * Math.min(1, t / 0.3)) / SR; return v * Math.sin(ph) * Math.exp(-t / 0.22); }, 0.1, 0.2);
}
// a saw through a one-pole low-pass that opens with the attack, driven a little
function bass(t0, dur, f, v = 1, drive = 1.4) {
  let ph = 0, lp = 0;
  voice(t0, dur, (t) => {
    ph = (ph + f / SR) % 1;
    const saw = 2 * ph - 1, cut = 0.04 + 0.25 * Math.exp(-t / 0.08);
    lp += cut * (saw - lp);
    const env = Math.min(1, t / 0.005) * Math.min(1, (dur - t) / 0.02);
    return v * Math.tanh(lp * drive) * 0.5 * env;
  });
}
function pad(t0, dur, notes, v = 1, attack = 0.6) {
  const ph = notes.flatMap(() => [rnd(), rnd()]);
  let lp = 0;
  voice(t0, dur, (t) => {
    let s = 0;
    notes.forEach((m, j) => { const f = NOTE(m); for (const [k, d] of [[0, 0.997], [1, 1.003]]) { const q = j * 2 + k; ph[q] = (ph[q] + f * d / SR) % 1; s += 2 * ph[q] - 1; } });
    lp += 0.03 * (s - lp);
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / 0.8);
    return v * 0.06 * lp * env;
  }, 0, 0.5);
}
function stab(t0, notes, v = 1) {
  const ph = notes.map(() => rnd());
  let lp = 0;
  voice(t0, 0.5, (t) => {
    let s = 0;
    notes.forEach((m, j) => { ph[j] = (ph[j] + NOTE(m) / SR) % 1; s += 2 * ph[j] - 1; });
    lp += (0.05 + 0.4 * Math.exp(-t / 0.05)) * (s - lp);
    return v * 0.16 * Math.tanh(lp) * Math.exp(-t / 0.18);
  }, 0, 0.3);
}
function impact(t0, v = 1) {
  let ph = 0, lp = 0;
  voice(t0, 2.6, (t) => {
    ph += 2 * Math.PI * (30 + 60 * Math.exp(-t / 0.15)) / SR;
    lp += 0.06 * (noise() - lp);
    return v * (0.9 * Math.sin(ph) * Math.exp(-t / 0.9) + 1.4 * lp * Math.exp(-t / 0.35));
  }, 0, 0.45);
}
// noise through a band-pass sweeping from f0 to f1 (a state-variable filter)
function whoosh(t0, dur, f0, f1, v = 1, pan = 0) {
  let lo = 0, bp = 0;
  voice(t0, dur, (t) => {
    const f = f0 * Math.pow(f1 / f0, t / dur), c = 2 * Math.sin(Math.PI * Math.min(0.45, f / SR));
    const hi = noise() - lo - 0.6 * bp; bp += c * hi; lo += c * bp;
    return v * 0.5 * bp * Math.sin(Math.PI * t / dur);
  }, pan, 0.3);
}
function riser(t0, dur, v = 1) {
  whoosh(t0, dur, 300, 6000, v * 1.2);
  let ph = 0;
  voice(t0, dur, (t) => { ph = (ph + NOTE(50 + 24 * t / dur) / SR) % 1; return v * 0.08 * (2 * ph - 1) * Math.pow(t / dur, 2); }, 0, 0.4);
}
function thunder(t0, v = 1) {
  let prev = 0, lp = 0, flutter = 1;
  voice(t0, 2.4, (t, k) => {
    const n = noise(), crack = (n - prev) * Math.exp(-t / 0.05); prev = n;
    if (k % 600 === 0) flutter = 0.4 + rnd();
    lp += 0.02 * (n - lp);
    return v * (0.9 * crack + 2.2 * lp * flutter * Math.exp(-t / 0.9));
  }, (rnd() - 0.5) * 0.6, 0.4);
}
function shimmer(t0, v = 1) { [86, 89, 93, 98].forEach((m, j) => voice(t0 + j * 0.07, 1.4, (t) => v * 0.05 * Math.sin(2 * Math.PI * NOTE(m) * t) * Math.exp(-t / 0.6), (j - 1.5) * 0.3, 0.6)); }
function crackle(t0, dur, v = 1) { for (let t = 0; t < dur; t += 0.01 + rnd() * 0.05) voice(t0 + t, 0.015, (u) => v * 0.4 * noise() * Math.exp(-u / 0.004), (rnd() - 0.5) * 0.8, 0.1); }
function growl(t0, v = 1) {
  let ph = 0, lp = 0;
  voice(t0, 0.9, (t) => { ph = (ph + (55 + 25 * Math.sin(t * 18)) / SR) % 1; lp += 0.08 * ((2 * ph - 1) - lp); return v * 0.5 * Math.tanh(lp * 3) * Math.sin(Math.PI * t / 0.9); }, 0, 0.2);
}
function boom(t0, v = 1) { whoosh(t0 - 0.6, 0.6, 200, 3000, v * 0.8); impact(t0, v * 1.2); crash(t0, v); }

// ---------------------------------------------------------------- the score
const T = { storms: at('hurricane'), brawl: at('brawl'), melee: at('melee'), end: at('end') };
const RIFF = [38, 38, 41, 38, 43, 41, 38, 36];     // D D F D G F D C (eighths)
const CHORDS = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [48, 52, 55]];   // Dm, Bb, F, C
// the open
pad(0, T.storms + 0.4, [50, 53, 57, 62], 1.2, 3);
for (let t = 1; t < T.storms - 0.4; t += 1) kick(t, 0.55);
riser(T.storms - 2.2, 2.2, 0.9);
// the storms and the brawl and the melee: one bar is 2 s
for (let bar = 0, t = T.storms; t < T.end - 1e-6; bar++, t += 4 * BEAT) {
  const brawl = t >= T.brawl && t < T.melee, chord = CHORDS[Math.floor(bar / 2) % 4];
  for (let b = 0; b < 4; b++) {
    const tb = t + b * BEAT;
    if (b % 2 === 0 || brawl) kick(tb, brawl ? 1 : 0.9);
    if (b % 2 === 1) snare(tb, brawl ? 1 : 0.8);
    hat(tb, 0.5); hat(tb + BEAT / 2, 0.35, b === 3);
  }
  RIFF.forEach((m, k) => {
    const shift = chord[0] - 50;   // follow the chord's root
    bass(t + k * BEAT / 2, BEAT / 2 - 0.02, NOTE(m + shift), brawl ? 1.1 : 0.85, brawl ? 2.6 : 1.4);
    if (brawl) bass(t + k * BEAT / 2, BEAT / 2 - 0.02, NOTE(m + shift + 12), 0.35, 2);
  });
  pad(t, 4 * BEAT, chord, 0.7, 0.2);
}
// fills into the brawl and into the end
[[T.brawl - 0.5, [110, 98, 82]], [T.end - 0.5, [130, 110, 98, 82]]].forEach(([t0, fs]) => fs.forEach((f, j) => tom(t0 + j * BEAT / (fs.length / 2) / 2, f, 0.9)));
riser(T.end - 3, 3, 1);
// every cut
for (const t of TAKES.slice(1, -1)) { impact(t.t0, 0.75); crash(t.t0, 0.7); }
// the end card
boom(T.end, 1.1);
pad(T.end, DUR - T.end, [38, 50, 53, 57, 64], 1.6, 0.05);
stab(T.end, [50, 53, 57, 62], 1.2);
stab(T.end + 2.5, [50, 53, 57, 62], 0.6);

// the game's events
for (const [name, list] of Object.entries(events.takes)) {
  for (const e of list) {
    const t = e.f / FPS, mine = e.s === 0 || e.a === 0 || e.b === 0;
    if (e.type === 'special') {
      const v = e.s === 0 ? 1 : 0.5;
      if (e.key === 'surge') { whoosh(t, 1.2, 3000, 150, v); impact(t, 0.5 * v); }
      else if (e.key === 'dash') whoosh(t, 0.9, 250, 4000, 1.1 * v, 0.3);
      else if (e.key === 'whiteout') { shimmer(t, v); whoosh(t, 1.6, 6000, 1500, 0.6 * v); }
      else if (e.key === 'haboob') whoosh(t, 1.6, 120, 900, 1.4 * v);
      else if (e.key === 'firestorm') { crackle(t, 2, v); whoosh(t, 1.2, 400, 2400, 0.7 * v); }
    } else if (e.type === 'bolt') thunder(t, 0.9);
    else if (e.type === 'hit' && mine && e.kind) { tom(t, 70, Math.min(1, 0.4 + (e.amount || 0) / 10)); stab(t, [38, 50, 57], 0.5); }
    else if (e.type === 'brawl' && mine) growl(t, 0.9);
    else if (e.type === 'ko') boom(t, mine ? 1 : 0.5);
  }
}

// ---------------------------------------------------------------- reverb, master, file
// a Schroeder reverb on the send: four combs and two all-passes, a little longer on the right
function reverb(input, spread) {
  const out = new Float32Array(N);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.round((ms + spread) * SR / 1000), buf = new Float32Array(d);
    for (let i = 0, j = 0; i < N; i++, j = (j + 1) % d) { const y = buf[j]; buf[j] = input[i] + y * 0.82; out[i] += y * 0.25; }
  }
  for (const ms of [5, 1.7]) {
    const d = Math.round(ms * SR / 1000), buf = new Float32Array(d);
    for (let i = 0, j = 0; i < N; i++, j = (j + 1) % d) { const y = buf[j], x = out[i]; buf[j] = x + y * 0.7; out[i] = y - 0.7 * x; }
  }
  return out;
}
const wl = reverb(SEND, 0), wr = reverb(SEND, 2.3);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / 0.02) * Math.min(1, (DUR - t) / 2);
  L[i] = Math.tanh((L[i] + wl[i] * 0.6) * 1.1) * fade;
  R[i] = Math.tanh((R[i] + wr[i] * 0.6) * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.9 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4); }
fs.writeFileSync(outPath, buf);
const nEv = Object.values(events.takes).reduce((n, l) => n + l.length, 0);
console.log(`wrote ${outPath}: ${DUR.toFixed(1)} s, ${nEv} game events, peak scaled by ${gain.toFixed(2)}`);
