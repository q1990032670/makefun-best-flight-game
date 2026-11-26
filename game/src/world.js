// Skyharbor Run — the valley: ground patches, a meandering river, mountain
// ridges on both sides, the home runway and the gates of each sortie.
// Everything is procedural and deterministic: a cell's colour comes from a
// hash of its coordinates, so the valley looks the same on every visit and
// no image files are needed.

import { RUNWAY, WORLD } from './config.js';

/** Small deterministic hash -> 0..1, stable across runs and machines. */
export function hash2(a, b) {
  let h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** The river's centreline: x as a function of distance north (y). */
export function riverXAt(y) {
  return Math.sin(y * 0.00042) * WORLD.riverAmplitude
    + Math.sin(y * 0.0013 + 1.7) * 160;
}

/** Ground height at a point: flat valley floor, rising into the ridges. */
export function groundHeightAt(x, y) {
  const ax = Math.abs(x);
  if (ax < 1500) return 0;
  const t = Math.min(1, (ax - 1500) / 1400);
  const ridge = t * t * 620;
  const bumps = hash2(Math.floor(x / 300), Math.floor(y / 300)) * 90 * t;
  return ridge + bumps;
}

/** Colour of one ground patch, chosen from fields, meadow and woodland. */
export function patchColour(cx, cy) {
  const h = hash2(cx, cy);
  const h2 = hash2(cx * 3 + 11, cy * 5 - 7);
  if (h < 0.34) {
    // cultivated field: wheat, ploughed earth or young crop
    const fields = ['#b39b58', '#8a6f43', '#a8a04c', '#97784a'];
    return fields[Math.floor(h2 * fields.length)];
  }
  if (h < 0.72) {
    const greens = ['#5d7d3a', '#688a42', '#54743a', '#718f47'];
    return greens[Math.floor(h2 * greens.length)];
  }
  return '#42603a'; // woodland block
}

/** Mountain peaks: fixed cones along both ridges, snow above 480 m. */
export const PEAKS = buildPeaks();

function buildPeaks() {
  const peaks = [];
  for (let i = 0; i < 26; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = -600 + i * 620 + hash2(i, 4) * 260;
    const x = side * (2050 + hash2(i, 9) * 700);
    const height = 520 + hash2(i, 21) * 380;
    const radius = 480 + hash2(i, 33) * 320;
    peaks.push({ x, y, height, radius });
  }
  return peaks;
}

/** Scattered tree clusters on the valley floor, drawn as dark cones. */
export const TREES = buildTrees();

function buildTrees() {
  const trees = [];
  for (let i = 0; i < 240; i += 1) {
    const x = (hash2(i, 51) * 2 - 1) * 1900;
    const y = -700 + hash2(i, 77) * 14200;
    if (Math.abs(x - riverXAt(y)) < 130) continue; // not in the river
    if (Math.abs(x - RUNWAY.x) < 90 && y > RUNWAY.startY - 120 && y < RUNWAY.startY + RUNWAY.length + 120) continue;
    trees.push({ x, y, s: 7 + hash2(i, 91) * 8 });
  }
  return trees;
}

/** Farmsteads and the harbour town near the strip: little lit blocks. */
export const BUILDINGS = buildBuildings();

function buildBuildings() {
  const out = [];
  for (let i = 0; i < 46; i += 1) {
    const nearTown = i < 26;
    const cx = nearTown ? -420 + hash2(i, 5) * 300 : (hash2(i, 5) * 2 - 1) * 1600;
    const cy = nearTown ? -350 + hash2(i, 6) * 700 : hash2(i, 6) * 13000;
    if (Math.abs(cx - RUNWAY.x) < 80 && cy > RUNWAY.startY - 80 && cy < RUNWAY.startY + RUNWAY.length + 80) continue;
    out.push({
      x: cx,
      y: cy,
      w: 16 + hash2(i, 7) * 22,
      d: 14 + hash2(i, 8) * 18,
      h: 7 + hash2(i, 9) * 13,
      tone: hash2(i, 10),
    });
  }
  return out;
}

/** Drifting cloud puffs, placed once and wrapped around the player. */
export const CLOUDS = buildClouds();

function buildClouds() {
  const out = [];
  for (let i = 0; i < 42; i += 1) {
    out.push({
      x: (hash2(i, 61) * 2 - 1) * 3200,
      y: hash2(i, 62) * 15000 - 600,
      z: 330 + hash2(i, 63) * 260,
      r: 90 + hash2(i, 64) * 150,
    });
  }
  return out;
}

/**
 * The gates of a sortie: a slalom that follows the river north, climbing as
 * it goes, then a final gate lined up with the runway so the approach flows
 * straight out of the last turn. Gate 0 is the next one to fly through.
 */
export function buildGates(sortie, count) {
  const gates = [];
  const climb = sortie >= 2 ? 30 : 16; // later sorties place gates higher
  for (let i = 0; i < count; i += 1) {
    const y = 1500 + i * 1250;
    const x = riverXAt(y) + Math.sin(i * 1.35) * 260;
    const z = 120 + i * climb + Math.sin(i * 2.1) * 26;
    gates.push({ x, y, z: Math.max(70, z), passed: false, missed: false });
  }
  // Final gate on the runway centreline, low, pointing the way home.
  gates.push({
    x: RUNWAY.x,
    y: RUNWAY.startY + RUNWAY.length + 620,
    z: 64,
    passed: false,
    missed: false,
    final: true,
  });
  return gates;
}

/** Is a point inside the runway strip (with a small margin)? */
export function onRunway(x, y, margin = 0) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 + margin
    && y >= RUNWAY.startY - margin
    && y <= RUNWAY.startY + RUNWAY.length + margin;
}
