/* The Hurricane Brawl game's sound, synthesised with Web Audio (no sound files):
 *   voices      each storm type's own sound, looping: the hurricane's deep roar and rain, the tornado's
 *               freight-train roar and whine, the blizzard's whistling wind, the sandstorm's hissing
 *               grit, the supercell's rain and the thunder rolling round it, the wildfire's roar and
 *               crackle. Yours follows your energy and the camera's height; a rival's comes in as it
 *               nears the camera, from the side of the screen it is on
 *   hits        each type's own hit, when it strikes another storm and on the cities your storm wrecks:
 *               a wave breaking, debris smashing, ice cracking, a blast of grit, an electric snap, a flare-up
 *   one-shots   the specials (surge, dash, freeze, dust wall, fire; lightning's bolts thunder), thud
 *               (brawls and rams), KO, energy surge, countdown and menu blips; and a low rumble under
 *               a brawl
 * Recorded sounds (media/sfx/, made by tools/sfx.js) take the place of most of these once they have
 * loaded: five of the voices (the blizzard keeps its synthesised one), every type's hit, the specials,
 * collisions, KOs and the energy surge. Where they can't load (the page opened from file://, or
 * HurricaneBrawl.html on its own) the synthesised sounds play instead.
 * It starts on the first key, click or button (browsers keep audio off until then). M mutes.
 */
const BrawlAudio = (() => {
  'use strict';
  let ctx = null, master = null, rumble = null, muted = false;
  const bufs = {}, voices = {};
  try { muted = localStorage.getItem('brawl-muted') === '1'; } catch (e) { /* no storage */ }

  // Each type's voice: layers of a looping source through a filter. buf is 'noise' (wind), 'crackle'
  // (sparse pops of every size) or 'grit' (thousands of tiny grains a second); type, f (Hz) and q the
  // filter; g the level. sweep [Hz, rate]: the filter wanders up and down; pulse [0-1, rate]: the
  // level swells and falls back (both by two slow waves, so it never quite repeats).
  const VOICES = {
    hurricane: [
      { buf: 'noise', type: 'lowpass', f: 220, q: 0.7, g: 1.4, pulse: [0.5, 0.12] },     // the roar
      { buf: 'noise', type: 'bandpass', f: 600, q: 2, g: 1.9, sweep: [220, 0.08] },      // the howl
      { buf: 'grit', type: 'highpass', f: 3500, q: 0.5, g: 2.3 },                        // the rain
    ],
    tornado: [
      { buf: 'noise', type: 'bandpass', f: 220, q: 1.2, g: 2.2, pulse: [0.6, 6] },       // the freight train
      { buf: 'noise', type: 'bandpass', f: 1050, q: 10, g: 3, sweep: [160, 0.5] },       // the whine
      { buf: 'grit', type: 'bandpass', f: 800, q: 1.2, g: 12, pulse: [0.7, 2.3] },       // debris
    ],
    blizzard: [
      { buf: 'noise', type: 'bandpass', f: 1900, q: 16, g: 3.5, sweep: [550, 0.15] },    // the whistle
      { buf: 'noise', type: 'bandpass', f: 2900, q: 20, g: 2.2, sweep: [450, 0.21] },
      { buf: 'noise', type: 'highpass', f: 6500, q: 0.5, g: 0.4 },                       // blown snow
      { buf: 'noise', type: 'lowpass', f: 320, q: 0.7, g: 0.5, pulse: [0.6, 0.18] },
    ],
    sandstorm: [
      { buf: 'grit', type: 'highpass', f: 2600, q: 0.6, g: 3.7, pulse: [0.4, 0.3] },     // grit
      { buf: 'noise', type: 'highpass', f: 3200, q: 0.5, g: 0.5, pulse: [0.6, 0.45] },   // hiss
      { buf: 'noise', type: 'bandpass', f: 480, q: 0.9, g: 1.1, sweep: [140, 0.1] },     // the dry wind
    ],
    supercell: [
      { buf: 'noise', type: 'bandpass', f: 2400, q: 0.6, g: 0.85 },                      // the rain
      { buf: 'grit', type: 'highpass', f: 3000, q: 0.5, g: 2.4 },                        // drops
      { buf: 'noise', type: 'lowpass', f: 95, q: 0.8, g: 1.6, pulse: [0.7, 0.06] },      // thunder far off
    ],
    wildfire: [
      { buf: 'noise', type: 'lowpass', f: 300, q: 0.9, g: 1.3, pulse: [0.5, 0.45] },     // the roar
      { buf: 'crackle', type: 'bandpass', f: 1800, q: 0.7, g: 9.5 },                     // crackle
      { buf: 'noise', type: 'bandpass', f: 900, q: 1, g: 0.5, pulse: [0.7, 1.2] },       // flames licking
    ],
  };
  const VOICE = 0.3;   // a voice at full

  // the recorded sounds: how many files of each (name-1.mp3 ... when more than one; one is picked at
  // random each time), and the level each plays at
  const SFX = document.currentScript && document.currentScript.src ? new URL('../media/sfx/', document.currentScript.src).href : new URL('media/sfx/', location.href).href;
  const FILES = {
    'loop-hurricane': 1, 'loop-tornado': 1, 'loop-sandstorm': 1, 'loop-supercell': 1, 'loop-wildfire': 1,
    surge: 1, dash: 1, freeze: 1, haboob: 1, thunder: 1, fire: 1, thud: 1, ko: 1, pickup: 1,
    'hit-hurricane': 1, 'hit-tornado': 1, 'hit-blizzard': 10, 'hit-sandstorm': 1, 'hit-supercell': 9, 'hit-wildfire': 1,
  };
  const LEVEL = {
    'loop-hurricane': 0.8, 'loop-tornado': 0.8, 'loop-sandstorm': 0.8, 'loop-supercell': 0.8, 'loop-wildfire': 0.8,
    surge: 0.9, dash: 0.24, freeze: 0.29, haboob: 0.57, thunder: 0.44, fire: 0.34, thud: 0.86, ko: 0.38, pickup: 0.25,
    'hit-hurricane': 0.3, 'hit-tornado': 0.3, 'hit-blizzard': 0.64, 'hit-sandstorm': 0.3, 'hit-supercell': 0.3, 'hit-wildfire': 0.3,
  };
  const samples = {};
  let loading = 0;   // files still on their way
  function load() {
    if (location.protocol === 'file:') return;   // browsers don't let a page fetch files from disk
    for (const [name, n] of Object.entries(FILES)) {
      const urls = Array.from({ length: n }, (_, i) => SFX + (n > 1 ? `${name}-${i + 1}` : name) + '.mp3');
      loading++;
      Promise.all(urls.map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b))))
        .then((list) => { samples[name] = list; }, () => { /* the synthesised sound plays instead */ })
        .finally(() => loading--);
    }
  }
  // plays a recorded sound at volume v, into out; false if it isn't loaded
  function sample(name, v, out = master) {
    const list = samples[name];
    if (!list) return false;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = list[(Math.random() * list.length) | 0]; g.gain.value = v * LEVEL[name];
    src.connect(g).connect(out); src.start();
    return true;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const n = ctx.sampleRate * 4, make = (fill) => { const b = ctx.createBuffer(1, n, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
    bufs.noise = make((d) => { for (let i = 0, b = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 3; } });
    // perSec pops, each a burst of noise about ms long dying away, at a size from size()
    const pops = (perSec, ms, size) => (d) => {
      for (let k = 0; k < perSec * 4; k++) {
        const at = (Math.random() * d.length) | 0, len = (ctx.sampleRate * ms * (0.3 + Math.random()) / 1000) | 0, a = size();
        for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += a * (Math.random() * 2 - 1) * Math.exp(-5 * i / len);
      }
    };
    bufs.crackle = make(pops(60, 5, () => Math.random() ** 2));
    bufs.grit = make(pops(900, 0.8, () => 0.2 + 0.3 * Math.random()));
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = bufs.noise; src.loop = true;
    f.type = 'lowpass'; f.frequency.value = 110; f.Q.value = 0.8;
    rumble = ctx.createGain(); rumble.gain.value = 0;
    src.connect(f).connect(rumble).connect(master); src.start();
    load();
  }
  ['keydown', 'pointerdown', 'gamepadconnected'].forEach((t) => window.addEventListener(t, start, { passive: true }));

  // a voice is made the first time it is heard, and keeps running (silent when it isn't)
  function voice(type) {
    const out = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    out.gain.value = 0;
    if (pan) out.connect(pan).connect(master); else out.connect(master);
    const rec = samples['loop-' + type];
    if (rec) {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = rec[0]; src.loop = true; g.gain.value = LEVEL['loop-' + type] / VOICE;
      src.connect(g).connect(out); src.start(0, Math.random() * src.buffer.duration);
      return { out, pan, roll: Infinity };   // (the recording has its own thunder)
    }
    const wave = (param, depth, rate) => {
      for (const [k, share] of [[1, 0.6], [2.37, 0.4]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = rate * k * (0.85 + 0.3 * Math.random()); g.gain.value = depth * share;
        o.connect(g).connect(param); o.start();
      }
    };
    for (const L of VOICES[type]) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = bufs[L.buf]; src.loop = true;
      f.type = L.type; f.frequency.value = L.f; f.Q.value = L.q;
      g.gain.value = L.g * (L.pulse ? 1 - L.pulse[0] / 2 : 1);
      if (L.sweep) wave(f.frequency, L.sweep[0], L.sweep[1]);
      if (L.pulse) wave(g.gain, L.g * L.pulse[0] / 2, L.pulse[1]);
      src.connect(f).connect(g).connect(out); src.start(0, Math.random() * 4);
    }
    return { out, pan, roll: ctx.currentTime + 2 + Math.random() * 4 };
  }

  // heard: { type: { v: 0-1, pan: -1 (left) to 1 (right) } } for the storms to hear; brawl 0-1; on
  // (false when paused)
  function update(heard, brawl, on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const type in VOICES) {
      const h = heard[type], v = on && h ? Math.min(1.2, h.v) : 0;
      if (!voices[type] && (v < 0.01 || loading > 0)) continue;   // a voice waits for its recording
      const V = voices[type] || (voices[type] = voice(type));
      V.out.gain.setTargetAtTime(v * VOICE, t, 0.25);
      if (V.pan && h) V.pan.pan.setTargetAtTime(h.pan, t, 0.15);
      // thunder rolls round a supercell every few seconds
      if (type === 'supercell' && v > 0.05 && t > V.roll) { V.roll = t + 3 + Math.random() * 6; noiseShot('lowpass', 340, 55, 0.7, 1.4, 0.3, 2.8, 0, V.out); }
    }
    rumble.gain.setTargetAtTime(on ? 0.5 * brawl : 0, t, 0.2);
  }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('brawl-muted', m ? '1' : '0'); } catch (e) { /* no storage */ }
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  }

  const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  function noiseShot(type, f0, f1, q, peak, a, dur, delay = 0, out = master) {
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = bufs.noise; src.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, peak, a, dur, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const SOUNDS = {
    whoosh: (v) => noiseShot('bandpass', 300, 1800, 1.2, 0.5 * v, 0.08, 0.7),
    dash: (v) => { noiseShot('bandpass', 200, 2400, 1.5, 0.7 * v, 0.03, 0.6); tone('sawtooth', 90, 45, 0.15 * v, 0.02, 0.6); },
    surge: (v) => { noiseShot('lowpass', 1800, 160, 0.7, 0.9 * v, 0.02, 1.4); tone('sine', 70, 35, 0.4 * v, 0.02, 1.2); },
    haboob: (v) => { noiseShot('lowpass', 900, 200, 0.6, 0.8 * v, 0.15, 1.6); noiseShot('bandpass', 2500, 600, 0.8, 0.25 * v, 0.1, 1.2); },
    thunder: (v) => { noiseShot('highpass', 3000, 1500, 0.5, 0.9 * v, 0.003, 0.18); noiseShot('lowpass', 400, 60, 0.7, 0.8 * v, 0.05, 2.2, 0.06); },
    freeze: (v) => { for (const [f, d] of [[1760, 0], [2349, 0.06], [2637, 0.12], [3520, 0.18]]) tone('sine', f, f * 1.01, 0.08 * v, 0.02, 1.2, d); noiseShot('highpass', 6000, 3000, 0.7, 0.2 * v, 0.2, 1.5); },
    fire: (v) => { noiseShot('lowpass', 700, 300, 0.7, 0.6 * v, 0.1, 1.6); for (let i = 0; i < 14; i++) noiseShot('highpass', 2500, 2000, 2, 0.25 * v, 0.002, 0.03, Math.random() * 1.4); },
    thud: (v) => { tone('sine', 110, 38, 0.8 * v, 0.005, 0.45); noiseShot('lowpass', 600, 120, 0.8, 0.5 * v, 0.005, 0.35); },
    ko: (v) => { tone('sawtooth', 320, 50, 0.3 * v, 0.01, 1.1); noiseShot('bandpass', 1500, 150, 1, 0.6 * v, 0.02, 1.3); },
    win: (v) => { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22 * v, 0.01, 0.35, i * 0.09)); },
    pickup: (v) => { [440, 660, 880, 1320].forEach((f, i) => tone('sine', f, f * 1.02, 0.2 * v, 0.01, 0.25, i * 0.06)); },
    beep: (v) => tone('square', 880, 880, 0.12 * v, 0.005, 0.12),
    go: (v) => tone('square', 1320, 1320, 0.16 * v, 0.005, 0.4),
    blip: (v) => tone('sine', 660, 760, 0.08 * v, 0.005, 0.07),
  };
  const HITS = {
    hurricane: (v) => { noiseShot('lowpass', 2400, 260, 0.8, 0.3 * v, 0.015, 0.55); tone('sine', 75, 40, 0.18 * v, 0.01, 0.4); },   // a wave breaking
    tornado: (v) => { for (let i = 0; i < 3; i++) noiseShot('bandpass', 900 + Math.random() * 900, 500, 2.5, 0.5 * v, 0.002, 0.08, i * 0.045); tone('sine', 95, 45, 0.3 * v, 0.004, 0.25); },   // debris smashing
    blizzard: (v) => { noiseShot('highpass', 5000, 3000, 0.7, 0.6 * v, 0.001, 0.06); tone('sine', 2800, 2500, 0.18 * v, 0.002, 0.35); tone('sine', 3730, 3400, 0.1 * v, 0.002, 0.25, 0.01); },   // ice cracking
    sandstorm: (v) => noiseShot('highpass', 3500, 1200, 0.6, 0.5 * v, 0.01, 0.4),   // a blast of grit
    supercell: (v) => { tone('sawtooth', 1400, 180, 0.25 * v, 0.002, 0.2); noiseShot('highpass', 4000, 2500, 0.6, 0.7 * v, 0.001, 0.12); },   // an electric snap
    wildfire: (v) => { noiseShot('bandpass', 350, 1600, 1, 1 * v, 0.03, 0.35); for (let i = 0; i < 4; i++) noiseShot('highpass', 2500, 2000, 2, 0.45 * v, 0.002, 0.03, Math.random() * 0.3); },   // a flare-up
  };
  // a one-shot at volume v (0-1)
  function play(name, v = 1) {
    if (!ctx || muted || v < 0.02 || !SOUNDS[name]) return;
    if (!sample(name, Math.min(1, v))) SOUNDS[name](Math.min(1, v));
  }
  // a storm type's hit at volume v (0-1)
  function hit(type, v = 1) {
    if (!ctx || muted || v < 0.02 || !HITS[type]) return;
    if (!sample('hit-' + type, Math.min(1, v))) HITS[type](Math.min(1, v));
  }
  return { start, update, play, hit, setMuted, get muted() { return muted; } };
})();
