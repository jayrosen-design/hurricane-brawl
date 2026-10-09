/* Records the Hurricane Brawl trailer from the game itself, in headless Chromium:
 *   media/trailer.mp4          60 s, 1280 x 720, 30 fps, H.264 with an AAC soundtrack
 *   media/trailer.webm         the same in VP9 and Opus, for browsers without H.264 (Chromium builds)
 *   media/trailer-poster.jpg   its poster frame
 *   media/hero-loop.mp4, .webm 15 s of the action without titles, HUD or sound, for the landing page's
 *                              background, and media/hero-poster.jpg, its first frame
 *
 *   node tools/trailer.js [--three <dir>] [--chrome <path>] [--ffmpeg <path>] [--work <dir>]
 *                         [--takes a,b] [--encode-only]
 *   --three     serve three.js from a local copy of its npm package (npm pack three@0.170.0), when
 *               the CDN can't be reached
 *   --chrome    a Chromium or Chrome to use instead of Playwright's
 *   --ffmpeg    ffmpeg with libx264 (default: ffmpeg on the PATH)
 *   --work      where the frames and events.json go (default tools/out/trailer)
 *   --takes     re-record only these takes (the others' frames are kept); --encode-only records none
 * Needs Node 18+, Playwright (npm i playwright) and ffmpeg with libx264, libvpx-vp9 and libopus.
 *
 * The page runs on a virtual clock: requestAnimationFrame, performance.now, setTimeout and the CSS
 * animations all advance exactly 1/30 s per captured frame, so the video is smooth however long a
 * frame takes to draw (software WebGL takes about a third of a second). The takes and their timing
 * are in trailer-shots.js; the game's events (specials, bolts, hits, KOs) go to events.json with
 * their frame, and tools/trailer-music.js writes the soundtrack from them.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FPS, TAKES, LOOP, total } = require('./trailer-shots.js');

const ROOT = path.join(__dirname, '..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const THREE_DIR = arg('--three', null);
const CHROME = arg('--chrome', null);
const FFMPEG = arg('--ffmpeg', 'ffmpeg');
const WORK = path.resolve(arg('--work', path.join(ROOT, 'tools/out/trailer')));
const ONLY = arg('--takes', null);
const ENCODE_ONLY = process.argv.includes('--encode-only');
const FRAMES = path.join(WORK, 'frames'), CLEAN = path.join(WORK, 'clean');
const W = 1280, H = 720;

// ---------------------------------------------------------------- in the page
// the virtual clock: everything the game times itself by advances only in __tick(ms)
function clock() {
  let now = 0, raf = [], timers = [], id = 1;
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (fn, ms = 0, ...a) => { const t = { id: id++, at: now + (ms || 0), fn: () => fn(...a) }; timers.push(t); return t.id; };
  window.clearTimeout = (k) => { timers = timers.filter((t) => t.id !== k); };
  const born = new WeakMap();
  window.__tick = (ms) => {
    now += ms;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);
    for (const t of due) t.fn();
    const list = raf; raf = [];
    for (const cb of list) cb(now);
    for (const a of document.getAnimations()) {
      if (!born.has(a)) { born.set(a, now); a.pause(); }
      a.currentTime = now - born.get(a);
    }
  };
  // the trailer's own layer: titles and a flash on every cut
  window.__overlay = () => {
    const css = document.createElement('style');
    css.textContent = `
      @font-face { font-family: Anton; src: url(fonts/anton-latin-400-normal.woff2); }
      @font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url(fonts/barlow-condensed-latin-700-normal.woff2); }
      @font-face { font-family: Barlow; font-weight: 600; src: url(fonts/barlow-latin-600-normal.woff2); }
      body.trailer #select, body.trailer #h-hint, body.trailer #h-feed, body.trailer.nohud #hud, body.trailer.nohud #labels,
        body.trailer.clean #tt, body.trailer.clean #hud, body.trailer.clean #labels { display: none !important; }
      #tt { position: fixed; inset: 0; z-index: 100; pointer-events: none; color: #fff; font-family: Barlow, sans-serif; }
      #tt .tt-vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(10, 4, 0, 0.55)); }
      #tt .tt-flash { position: absolute; inset: 0; background: #fff6e0; animation: tt-flash 0.25s ease-out forwards; }
      @keyframes tt-flash { from { opacity: 0.8; } to { opacity: 0; } }
      #tt .tt-slam { position: absolute; left: 0; right: 0; top: 38%; text-align: center; font: 400 128px/0.95 Anton, Impact, sans-serif; text-transform: uppercase;
        letter-spacing: 0.01em; transform: skewX(-7deg); text-shadow: 0 0 2px #000, 0 10px 40px rgba(0, 0, 0, 0.75); animation: tt-slam 2.4s both; }
      #tt .tt-slam::after { content: ''; display: block; width: 220px; height: 10px; margin: 18px auto 0; background: linear-gradient(90deg, #ff4b1f, #ffb238); transform: skewX(-24deg); }
      @keyframes tt-slam { 0% { opacity: 0; transform: scale(2.2) skewX(-7deg); filter: blur(10px); } 9% { opacity: 1; transform: scale(0.97) skewX(-7deg); filter: none; }
        13% { transform: scale(1) skewX(-7deg); } 86% { opacity: 1; transform: scale(1.04) skewX(-7deg); } 100% { opacity: 0; transform: scale(1.1) skewX(-7deg); } }
      #tt .tt-lower { position: absolute; left: 70px; bottom: 190px; animation: tt-lower 4.6s both; }
      #tt .tt-lower b { display: block; font: 400 122px/0.9 Anton, Impact, sans-serif; text-transform: uppercase; transform: skewX(-7deg); text-shadow: 0 8px 30px rgba(0, 0, 0, 0.7); }
      #tt .tt-lower span { display: inline-block; margin-top: 12px; padding: 6px 18px 6px 14px; font: 700 34px/1 "Barlow Condensed", sans-serif; letter-spacing: 0.14em;
        text-transform: uppercase; color: #140a02; background: var(--c); transform: skewX(-14deg); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5); }
      #tt .tt-lower i { position: absolute; left: -26px; top: 6px; bottom: 54px; width: 12px; background: var(--c); transform: skewX(-14deg); }
      @keyframes tt-lower { 0% { opacity: 0; transform: translateX(-80px); } 8% { opacity: 1; transform: none; } 90% { opacity: 1; } 100% { opacity: 0; transform: translateX(30px); } }
      #tt .tt-card { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; background: radial-gradient(ellipse at center, rgba(20, 8, 0, 0.35), rgba(10, 4, 0, 0.82) 70%); animation: tt-card 1s both; }
      #tt .tt-card h1 { margin: 0; font: 400 168px/0.9 Anton, Impact, sans-serif; text-transform: uppercase; transform: skewX(-7deg);
        background: linear-gradient(180deg, #fff 30%, #ffd27a 62%, #ff6a1f); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.8)); }
      #tt .tt-card p { margin: 18px 0 0; font: 700 40px/1.1 "Barlow Condensed", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #ffe6bf; }
      #tt .tt-card .tt-cta { display: inline-block; margin: 34px auto 0; padding: 14px 34px; font: 400 44px/1 Anton, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: #1a0a00;
        background: linear-gradient(180deg, #ffd27a, #ff7a1f); transform: skewX(-10deg); box-shadow: 0 10px 40px rgba(255, 106, 31, 0.45); }
      #tt .tt-card small { display: block; margin-top: 20px; font: 600 26px/1 Barlow, sans-serif; color: #f3d7b0; letter-spacing: 0.06em; }
      @keyframes tt-card { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: none; } }`;
    document.head.appendChild(css);
    const tt = document.createElement('div');
    tt.id = 'tt';
    tt.innerHTML = '<div class="tt-vig"></div>';
    document.body.appendChild(tt);
    document.body.classList.add('trailer');
    return Promise.all(['128px Anton', '700 34px "Barlow Condensed"', '600 26px Barlow'].map((f) => document.fonts.load(f)));
  };
  window.__title = (kind, a, b, c) => {
    const tt = document.getElementById('tt'), el = document.createElement('div');
    if (kind === 'slam') { tt.querySelectorAll('.tt-slam').forEach((x) => x.remove()); el.className = 'tt-slam'; el.textContent = a; }
    else if (kind === 'lower') { el.className = 'tt-lower'; el.style.setProperty('--c', c); el.innerHTML = `<i></i><b></b><span></span>`; el.querySelector('b').textContent = a; el.querySelector('span').textContent = b; }
    else if (kind === 'card') { el.className = 'tt-card'; el.innerHTML = '<h1>Hurricane Brawl</h1><p>Pick a disaster · Brawl the planet</p><div class="tt-cta">Play free in your browser</div><small>Keyboard · Mouse · Controller</small>'; }
    else if (kind === 'flash') el.className = 'tt-flash';
    tt.appendChild(el);
  };
  // put your storm (and the rivals) where the take wants them, with the camera and the sun
  window.__stage = (o) => {
    const g = BrawlGame, E = BrawlEarth, Sim = BrawlSim, me = g.sim.storms[0];
    const compass = (p, deg) => E.turn(p, E.north(p), -deg * E.DEG);
    const put = (s, p, en, h, cool) => { s.p = p; s.E = en; s.r = Sim.radius(s.def, en); s.heading = h || E.east(p); s.v = [0, 0, 0]; s.k = [0, 0, 0]; s.shield = 0; s.cool = cool || 0; s.alive = true; };
    const p0 = E.vec(o.lat, o.lon);
    put(me, p0, o.E || 95, o.head == null ? null : compass(p0, o.head), o.cool);
    g.sim.storms.forEach((s, i) => {
      if (!i) return;
      const r = (o.rivals || [])[i - 1] || { at: [-55, o.lon + 160] };
      const p = r.at ? E.vec(r.at[0], r.at[1]) : E.along(me.p, compass(me.p, r.bearing), r.km);
      put(s, p, r.E || 60, null, r.cool);
    });
    g.cam.p = me.p.slice(); g.cam.fwd = E.north(me.p); g.cam.alt = g.cam.altT = o.alt || 5000; g.cam.mode = 'north';
    g.sun = o.lon * E.DEG + (o.sun == null ? 0.35 : o.sun);
    g.render.setSim(g.sim);
  };
  // the game's events, with the frame they happened in
  window.__ev = []; window.__frame = 0;
  window.__watch = () => {
    const s = BrawlGame.sim, step = s.step;
    s.step = (inp) => { step(inp); for (const e of s.events) window.__ev.push({ f: window.__frame, type: e.type, key: e.key, s: e.s, a: e.a, b: e.b, by: e.by, kind: e.kind, amount: e.amount }); };
  };
}

// ---------------------------------------------------------------- recording
async function recordTake(browser, take) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(clock);
  if (THREE_DIR) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => {
      const file = path.join(THREE_DIR, r.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.170.0/', ''));
      r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(file) });
    });
  }
  const tick = () => page.evaluate((ms) => window.__tick(ms), 1000 / FPS);
  const until = async (fn, what, max = 4000) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(fn).catch(() => false)) return;
      await tick();
      if (i % 10 === 0) await page.waitForTimeout(15);   // let the modules and textures load
    }
    throw new Error(`${take.name}: timed out waiting for ${what}`);
  };
  await page.goto('file://' + path.join(ROOT, 'play.html') + '?' + take.query);
  await until(() => typeof BrawlGame !== 'undefined' && document.getElementById('loading').hidden, 'the game');
  await page.evaluate(() => window.__overlay());
  if (take.hud === false) await page.evaluate(() => document.body.classList.add('nohud'));
  if (take.select) {
    await page.evaluate((sun) => { BrawlGame.sun = BrawlEarth.latLon(BrawlGame.cam.p).lon * BrawlEarth.DEG + sun; }, take.sun || 0.5);
    for (let i = 0; i < 30; i++) await tick();
  } else {
    if (!take.test) { await page.keyboard.press('Enter'); await tick(); }
    await until(() => BrawlGame.state === 'play', 'the match');
    if (take.stage) await page.evaluate((o) => window.__stage(o), take.stage);
    if (take.alt) await page.evaluate((a) => { BrawlGame.cam.altT = a; BrawlGame.cam.alt = a; }, take.alt);
    for (let i = 0; i < (take.ffwd || 0) * FPS; i++) { await tick(); if (i % 30 === 0) await page.waitForTimeout(5); }
    await page.evaluate(() => { document.getElementById('banner').innerHTML = ''; document.getElementById('popups').innerHTML = ''; window.__watch(); });
  }
  const keys = take.keys || [], titles = take.titles || [];
  await page.evaluate(() => window.__title('flash'));
  for (let f = 0; f < take.frames; f++) {
    for (const [at, how, key] of keys) if (at === f) await (how === 'down' ? page.keyboard.down(key) : how === 'up' ? page.keyboard.up(key) : page.keyboard.press(key));
    for (const [at, kind, ...a] of titles) if (at === f) await page.evaluate(([k, x, y, z]) => window.__title(k, x, y, z), [kind, ...a]);
    await page.evaluate((n) => { window.__frame = n; }, take.start + f);
    await tick();
    await page.screenshot({ path: path.join(FRAMES, String(take.start + f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    // the same moment without the titles and the HUD, for the background loop (the clock holds still)
    if (LOOP.some(([name, a, b]) => name === take.name && f >= a && f < b)) {
      await page.evaluate(() => document.body.classList.add('clean'));
      await page.screenshot({ path: path.join(CLEAN, `${take.name}-${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      await page.evaluate(() => document.body.classList.remove('clean'));
    }
  }
  const events = await page.evaluate(() => window.__ev);
  await ctx.close();
  if (errors.length) throw new Error(`${take.name}: ${errors.join(' | ')}`);
  return events;
}

async function record() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { throw new Error('Playwright is needed: npm i playwright (and npx playwright install chromium)'); }
  fs.mkdirSync(FRAMES, { recursive: true });
  fs.mkdirSync(CLEAN, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const evPath = path.join(WORK, 'events.json');
  const kept = fs.existsSync(evPath) ? JSON.parse(fs.readFileSync(evPath, 'utf8')).takes : {};
  // every take's events: the ones kept from the last recording, replaced as each take is recorded again
  const takes = Object.fromEntries(TAKES.map((t) => [t.name, kept[t.name] || []]));
  for (const take of TAKES) {
    if (ONLY && !ONLY.split(',').includes(take.name)) continue;
    const t0 = Date.now();
    takes[take.name] = await recordTake(browser, take);
    console.log(`${take.name}: ${take.frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${takes[take.name].length} events`);
    fs.writeFileSync(evPath, JSON.stringify({ fps: FPS, total, takes }, null, 1));
  }
  await browser.close();
}

// ---------------------------------------------------------------- the soundtrack and the encodes
function encode() {
  const ff = (args) => execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  const missing = [];
  for (let f = 0; f < total; f++) if (!fs.existsSync(path.join(FRAMES, String(f).padStart(5, '0') + '.jpg'))) missing.push(f);
  if (missing.length) throw new Error(`${missing.length} frames missing (first ${missing[0]})`);
  const wav = path.join(WORK, 'music.wav');
  execFileSync(process.execPath, [path.join(__dirname, 'trailer-music.js'), path.join(WORK, 'events.json'), wav], { stdio: 'inherit' });
  const media = path.join(ROOT, 'media');
  fs.mkdirSync(media, { recursive: true });
  ff(['-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.jpg'), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', path.join(media, 'trailer.mp4')]);
  const vp9 = (crf) => ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p'];
  ff(['-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.jpg'), '-i', wav, ...vp9(33), '-c:a', 'libopus', '-b:a', '128k', '-shortest', path.join(media, 'trailer.webm')]);
  // the poster: the brawl, at the moment the storms lock together
  const brawl = TAKES.find((t) => t.name === 'brawl');
  fs.copyFileSync(path.join(FRAMES, String(brawl.start + 150).padStart(5, '0') + '.jpg'), path.join(WORK, 'poster.jpg'));
  ff(['-i', path.join(WORK, 'poster.jpg'), '-q:v', '3', path.join(media, 'trailer-poster.jpg')]);
  // the landing page's background: the brawl and the specials, from the clean copies of those frames
  const loopDir = path.join(WORK, 'loop');
  fs.rmSync(loopDir, { recursive: true, force: true });
  fs.mkdirSync(loopDir);
  let n = 0;
  for (const [name, a, b] of LOOP) for (let f = a; f < b; f++) fs.copyFileSync(path.join(CLEAN, `${name}-${String(f).padStart(4, '0')}.jpg`), path.join(loopDir, String(n++).padStart(5, '0') + '.jpg'));
  ff(['-i', path.join(loopDir, '00000.jpg'), '-q:v', '3', path.join(media, 'hero-poster.jpg')]);
  ff(['-framerate', String(FPS), '-i', path.join(loopDir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', path.join(media, 'hero-loop.mp4')]);
  ff(['-framerate', String(FPS), '-i', path.join(loopDir, '%05d.jpg'), ...vp9(38), '-an', path.join(media, 'hero-loop.webm')]);
  for (const f of ['trailer.mp4', 'trailer.webm', 'trailer-poster.jpg', 'hero-loop.mp4', 'hero-loop.webm', 'hero-poster.jpg']) console.log(`wrote media/${f}: ${(fs.statSync(path.join(media, f)).size / 1048576).toFixed(1)} MB`);
}

(async () => {
  if (!ENCODE_ONLY) await record();
  encode();
})().catch((e) => { console.error(e); process.exit(1); });
