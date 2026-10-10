/* Makes the game's recorded sounds (media/sfx/*.mp3) from the downloaded sound effects: cuts each to
 * the part the game uses, fades it, evens out the levels and encodes it. The loops are cross-faded end
 * into start so they repeat without a seam.
 *
 *   node tools/sfx.js --src <folder with the downloads> [--ffmpeg <path>]
 *
 *   --src      the folder the sound effects were downloaded to (a file is found by the end of its name)
 *   --ffmpeg   ffmpeg with libmp3lame (default: ffmpeg on the PATH)
 *
 * The table below says which download each sound comes from, the part used (seconds), and its fades.
 * Where the game can't load a sound (opened from file://, or HurricaneBrawl.html on its own) it plays
 * its synthesised one instead (js/audio.js).
 */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const SRC = arg('--src'), FFMPEG = arg('--ffmpeg', 'ffmpeg');
const OUT = path.join(__dirname, '../media/sfx');
const RATE = 44100;
if (!SRC) { console.error('usage: node tools/sfx.js --src <folder with the downloads> [--ffmpeg <path>]'); process.exit(1); }

// out: the file the game loads; from: the download; at: [start, end] (s, end null = to the end);
// fadeIn / fadeOut (s); loop: cross-fade (s) to repeat seamlessly (stereo; one-shots are mono);
// picks: how many separate cracks to cut from it (0.45 s each, at its loudest moments)
const LOOPS = [
  { out: 'loop-hurricane', from: '42811_Stormy_rain_with_hurricane_wind_loop-full.mp3', at: [30, 60], loop: 2 },
  { out: 'loop-tornado', from: 'Tornado_PS02_94.wav', at: [20, 50], loop: 2 },
  { out: 'loop-sandstorm', from: 'Blowing_Sand_Storm.mp3', at: [3, 9.5], loop: 1.5 },
  { out: 'loop-supercell', from: '21843_rain_and_rolling_thunders_loop-full.mp3', at: [14, 44], loop: 2 },
  { out: 'loop-wildfire', from: 'Wildfire_Thick_Forest_Loop.mp3', at: [0, null], loop: 2 },
];
const SHOTS = [
  // the specials
  { out: 'surge', from: 'Water_Waves_Surge_Wave_Large_Surge_Hit_Low_09_SDCLBRY_67827.wav', at: [0.25, 4.75], fadeOut: 1.5 },
  { out: 'dash', from: 'WINDGust_Big_Gust_of_Wind_Whoosh.wav', at: [5.25, 7.75], fadeIn: 0.4, fadeOut: 1.2 },
  { out: 'freeze', from: '06826_deep_freeze_spell.WAV', at: [0, null] },
  { out: 'haboob', from: 'Desert-Storm-Whoosh_TTX047401.wav', at: [0.75, 5.75], fadeOut: 2 },
  { out: 'thunder', from: 'LightningThunder_PS02_30.wav', at: [0, 4.5], fadeOut: 2 },
  { out: 'fire', from: 'Fire_Burst_Whoosh.mp3', at: [0, null] },
  // storms colliding (rams and brawls), KOs, the energy surge
  { out: 'thud', from: 'BoomsExplosions_EC09_51_1.wav', at: [0, null] },
  { out: 'ko', from: 'OhmLab_Deep-Impact-Cinematic-Boom.mp3', at: [1.2, 6.2], fadeOut: 2.5 },
  { out: 'pickup', from: 'Energy_Recharge_Game_Power_Up.wav', at: [0, null] },
  // each type's hit (several files: one is picked at random each time)
  { out: 'hit-hurricane', from: 'Water-Ocean_PREM11-2680.wav', at: [1.65, 2.95], fadeOut: 0.8 },
  { out: 'hit-tornado', from: 'Whoosh_Debris_Smash.wav', at: [0, null] },
  ...[1, 2, 3, 4, 5].map((n) => ({ out: 'hit-blizzard', from: `Ice_crack_0${n}.wav`, at: [0, null], picks: 2 })),
  { out: 'hit-sandstorm', from: 'Fighting_Game_Designed_Whoosh_Sand_Sweep_Whip_Sharp_Dirty_Quick.wav', at: [0, null] },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ out: 'hit-supercell', from: `Electric_Zap_0${n}.wav`, at: [0, null] })),
  { out: 'hit-wildfire', from: 'Fire_burst.wav', at: [0, 1.4], fadeOut: 0.8 },
];
// the levels they are evened out to: a loop's loudness (LUFS, held steady through it, so the quiet
// rain between claps of thunder isn't lost; the rumble below 70 Hz, which only takes up room, is cut
// first), a one-shot's loudest 100 ms (dB)
const LOOP_LUFS = -20, SHOT_DB = -10;

const files = fs.readdirSync(SRC);
function find(name) {
  const f = files.find((x) => x === name || x.endsWith('-' + name));
  if (!f) throw new Error(`not in ${SRC}: ${name}`);
  return path.join(SRC, f);
}
function run(args, input) {
  const r = spawnSync(FFMPEG, ['-v', 'error', ...args], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
// the download as interleaved samples, ch channels at RATE (from..to seconds, through filter af)
function decode(file, ch, from = 0, to = null, af = null) {
  const b = run(['-ss', String(from), ...(to == null ? [] : ['-to', String(to)]), '-i', file, '-map', '0:a:0', ...(af ? ['-af', af] : []), '-ac', String(ch), '-ar', String(RATE), '-f', 'f32le', '-']);
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice();
}
function encode(x, ch, name) {
  const file = path.join(OUT, name + '.mp3');
  run(['-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(ch), '-i', '-', '-c:a', 'libmp3lame', '-b:a', ch === 2 ? '128k' : '96k', file], Buffer.from(x.buffer, x.byteOffset, x.byteLength));
  return file;
}
const cut = (x, ch, a, b) => x.slice(Math.round(a * RATE) * ch, b == null ? x.length : Math.round(b * RATE) * ch);
function fade(x, ch, fin = 0, fout = 0) {
  const n = x.length / ch, fi = Math.round(fin * RATE), fo = Math.round(fout * RATE);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fi) g *= i / fi;
    if (i >= n - fo) g *= (n - i) / fo;
    for (let c = 0; c < ch; c++) x[i * ch + c] *= g;
  }
  return x;
}
// starts xf seconds in and ends with its last xf seconds fading into its first, so it repeats seamlessly
function loopify(x, ch, xf) {
  const n = x.length / ch, f = Math.round(xf * RATE), m = n - f, out = new Float32Array(m * ch);
  for (let i = 0; i < m - f; i++) for (let c = 0; c < ch; c++) out[i * ch + c] = x[(i + f) * ch + c];
  for (let j = 0; j < f; j++) {
    const t = j / f, a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2);
    for (let c = 0; c < ch; c++) out[(m - f + j) * ch + c] = x[(n - f + j) * ch + c] * a + x[j * ch + c] * b;
  }
  return out;
}
const db = (p) => 10 * Math.log10(p + 1e-20);
function loudestDb(x, ch) {
  const w = Math.round(0.1 * RATE) * ch; let best = 0;
  for (let i = 0; i + w <= x.length; i += w / 2) { let s = 0; for (let k = i; k < i + w; k++) s += x[k] * x[k]; best = Math.max(best, s / w); }
  return db(best || x.reduce((a, v) => a + v * v, 0) / x.length);
}
function level(x, now, want) {
  let g = 10 ** ((want - now) / 20), peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  g = Math.min(g, 0.97 / peak);   // never clip
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
// the starts (s) of the n loudest moments of x, at least 0.6 s apart
function onsets(x, n) {
  const w = Math.round(0.01 * RATE), e = [];
  for (let i = 0; i + w <= x.length; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += x[k] * x[k]; e.push(s); }
  const picked = [];
  for (const i of e.map((v, i) => i).sort((a, b) => e[b] - e[a])) {
    const t = i * 0.01;
    if (t + 0.45 > x.length / RATE) continue;
    if (picked.every((p) => Math.abs(p - t) > 0.6)) picked.push(t);
    if (picked.length === n) break;
  }
  return picked.map((t) => Math.max(0, t - 0.02));
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(OUT, f));
const counts = {}, report = [];
const name = (out) => { counts[out] = (counts[out] || 0) + 1; return out; };
for (const L of LOOPS) {
  const x = loopify(decode(find(L.from), 2, L.at[0], L.at[1], `highpass=f=70,loudnorm=I=${LOOP_LUFS}:LRA=5:TP=-2`), 2, L.loop);
  report.push([encode(x, 2, name(L.out)), x.length / 2 / RATE]);
}
for (const S of SHOTS) {
  const x = cut(decode(find(S.from), 1), 1, S.at[0], S.at[1]);
  const parts = S.picks ? onsets(x, S.picks).map((t) => fade(cut(x, 1, t, t + 0.45), 1, 0.003, 0.25)) : [fade(x, 1, S.fadeIn || 0.003, S.fadeOut || 0.01)];
  for (const p of parts) {
    level(p, loudestDb(p, 1), SHOT_DB);
    const many = SHOTS.filter((s) => s.out === S.out).length > 1 || S.picks;
    report.push([encode(p, 1, many ? `${S.out}-${(counts[S.out] || 0) + 1}` : S.out), p.length / RATE]);
    name(S.out);
  }
}
for (const [f, secs] of report) console.log(`${path.relative(process.cwd(), f).padEnd(34)} ${secs.toFixed(2)} s  ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
console.log(`${report.length} files, ${(report.reduce((a, [f]) => a + fs.statSync(f).size, 0) / 1048576).toFixed(1)} MB`);
console.log('counts:', JSON.stringify(counts));
