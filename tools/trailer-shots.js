/* The trailer's shot list: ten takes, 60 s at 30 fps (1,800 frames), cut on the soundtrack's beats
 * (120 BPM: a cut on every whole second is on a beat). Each take is a fresh run of the game.
 *
 *   query     the page's URL query (play.html)
 *   ffwd      seconds of game played before the take starts recording
 *   stage     where to put your storm and the rival (lat, lon, energy, heading, special cooldown;
 *             rivals by bearing and distance or at a point), the camera's height and the sun (radians
 *             east of your storm)
 *   keys      [frame, 'down' | 'up' | 'press', key] during the take (your storm's controls)
 *   titles    [frame, kind, text...] laid over the picture (trailer.js draws them)
 *   hud       false hides the game's HUD and labels (the open and the end card)
 * Used by tools/trailer.js (the pictures) and tools/trailer-music.js (the cuts).
 */
'use strict';
const FPS = 30, BPM = 120;
const TAKES = [
  { name: 'open', frames: 150, query: 'storm=hurricane&rivals=3&seed=7', select: true, hud: false, sun: 1.7,
    titles: [[8, 'slam', 'Six forces of nature'], [78, 'slam', 'One planet']] },
  { name: 'hurricane', frames: 180, query: 'storm=hurricane&rivals=1&time=300&seed=2&demo=0',
    stage: { lat: 23.6, lon: -87.5, E: 95, alt: 5600, head: 20, rivals: [{ at: [-50, 60] }] },
    keys: [[0, 'down', 'KeyW'], [48, 'up', 'KeyW'], [60, 'press', 'Space']],
    titles: [[12, 'lower', 'Hurricane', 'Storm surge', '#e9f4ff']] },
  { name: 'tornado', frames: 150, query: 'storm=tornado&rivals=1&time=300&seed=2&demo=0',
    stage: { lat: 35.4, lon: -103, E: 95, alt: 3300, head: 90, rivals: [{ bearing: 92, km: 1300, E: 70, cool: 99 }] },
    keys: [[0, 'down', 'KeyD'], [40, 'press', 'Space']],
    titles: [[10, 'lower', 'Tornado', 'Twister dash', '#b9bcc6']] },
  { name: 'blizzard', frames: 150, query: 'storm=blizzard&rivals=1&time=300&seed=2&demo=0',
    stage: { lat: 57.2, lon: 45, E: 95, alt: 5600, head: 270, sun: 0.4, rivals: [{ bearing: 250, km: 950, E: 70, cool: 99 }] },
    keys: [[0, 'down', 'KeyA'], [36, 'press', 'Space']],
    titles: [[10, 'lower', 'Blizzard', 'Whiteout', '#cfe9ff']] },
  { name: 'sandstorm', frames: 150, query: 'storm=sandstorm&rivals=1&time=300&seed=2&demo=0',
    stage: { lat: 29.5, lon: 20, E: 95, alt: 5000, head: 90, rivals: [{ bearing: 88, km: 1700, E: 70, cool: 99 }] },
    keys: [[0, 'down', 'KeyD'], [34, 'press', 'Space']],
    titles: [[10, 'lower', 'Sandstorm', 'Dust wall', '#e3b071']] },
  { name: 'supercell', frames: 150, query: 'storm=supercell&rivals=1&time=300&seed=2&demo=0',
    stage: { lat: 23.5, lon: 79, E: 95, alt: 5600, head: 90, sun: 0.8, rivals: [{ at: [22.6, 88.0], E: 70, cool: 99 }] },
    keys: [[0, 'down', 'KeyD'], [30, 'press', 'Space']],
    titles: [[10, 'lower', 'Supercell', 'Lightning', '#a9b4d8']] },
  { name: 'wildfire', frames: 150, query: 'storm=wildfire&rivals=1&time=300&seed=2&demo=0',
    stage: { lat: 47.6, lon: -1.5, E: 95, alt: 4600, head: 70, sun: 1.1, rivals: [{ at: [-50, 60] }] },
    keys: [[0, 'down', 'KeyD'], [44, 'press', 'Space']],
    titles: [[10, 'lower', 'Wildfire', 'Firestorm', '#ff8a3d']] },
  // an AI plays your hurricane (?test=1) and hunts the wildfire over the open sea, where it can't feed;
  // neither uses its special, so they lock together (Fujiwhara) until the wildfire is knocked out
  { name: 'brawl', frames: 300, query: 'test=1&storm=hurricane&vs=wildfire&time=300&seed=4', test: true,
    stage: { lat: 24, lon: -48, E: 92, alt: 5400, cool: 99, rivals: [{ bearing: 95, km: 700, E: 70, cool: 99 }] },
    titles: [[52, 'slam', 'When storms collide']] },
  { name: 'melee', frames: 210, query: 'test=1&storm=supercell&rivals=5&time=300&seed=11', test: true, ffwd: 24, alt: 15000,
    titles: [[6, 'slam', 'Wreck the world'], [100, 'slam', 'Most damage wins']] },
  { name: 'end', frames: 210, query: 'storm=hurricane&rivals=3&seed=3', select: true, hud: false, sun: 0.9,
    titles: [[4, 'card']] },
];
// the landing page's background loop: [take, first frame, end frame], saved again without the titles or
// the HUD while the takes are recorded
const LOOP = [['brawl', 20, 140], ['hurricane', 56, 150], ['tornado', 36, 96], ['sandstorm', 30, 96], ['supercell', 28, 88], ['wildfire', 40, 120]];
const total = TAKES.reduce((n, t) => n + t.frames, 0);
// where each take starts, in frames and seconds
let at = 0;
for (const t of TAKES) { t.start = at; t.t0 = at / FPS; at += t.frames; }
module.exports = { FPS, BPM, TAKES, LOOP, total };
