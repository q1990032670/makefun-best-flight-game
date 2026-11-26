// Skyharbor Run — screenshot scenes behind ?shot=<name>.
// Each scene places the real aircraft in a real flight state the game can
// reach, so the published screenshots are honest renders of play: the
// title over the strip, a banked turn toward the first gates, a low final
// approach, and the panel close on a high sortie. No fake overlays.

import { RUNWAY } from './config.js';
import { riverXAt } from './world.js';

/**
 * Position the plane and camera for the named scene.
 * game is the live game state object from main.js.
 */
export function stageShot(name, game) {
  game.startSortie(0, true); // reset to sortie 1, engine state clean
  const p = game.plane; // fetched after the reset: startSortie replaces it
  if (name === 'flight') {
    // Airborne over the river, banked toward gate 3, mid-sortie.
    game.sortieIndex = 0;
    p.onGround = false;
    p.x = riverXAt(3600) - 120;
    p.y = 3600;
    p.z = 235;
    p.heading = 0.32;
    p.roll = 0.52;
    p.pitch = 0.03;
    p.speed = 64;
    p.throttle = 0.78;
    p.fuel = 71;
    game.gates[0].passed = true;
    game.gates[1].passed = true;
    game.score = 320;
    game.elapsed = 74;
    game.message = 'GATE 2 — CENTRED  +160';
    game.messageUntil = 9999;
    return 'fly';
  }
  if (name === 'approach') {
    // Low final: all gates done, lined up on the strip, gear down.
    p.onGround = false;
    p.x = RUNWAY.x + 14;
    p.y = RUNWAY.startY + RUNWAY.length + 1050;
    p.z = 88;
    p.heading = Math.PI + 0.012; // heading south, back toward the threshold
    // The final gate sits north of the strip; approach flies south over it.
    p.roll = 0.04;
    p.pitch = -0.045;
    p.speed = 41;
    p.throttle = 0.34;
    p.fuel = 38;
    for (const g of game.gates) g.passed = true;
    game.gates[game.gates.length - 1].passed = false;
    game.score = 1180;
    game.elapsed = 168;
    game.message = 'FINAL GATE, THEN LAND';
    game.messageUntil = 9999;
    return 'fly';
  }
  if (name === 'climb') {
    // High sortie: climbing turn over the town with the ridge behind.
    game.startSortie(2, true);
    const q = game.plane;
    q.onGround = false;
    q.x = -420;
    q.y = 5200;
    q.z = 430;
    q.heading = -0.5;
    q.roll = -0.44;
    q.pitch = 0.13;
    q.speed = 71;
    q.throttle = 0.92;
    q.fuel = 63;
    q.damage = 12;
    game.gates[0].passed = true;
    game.score = 540;
    game.elapsed = 96;
    return 'fly';
  }
  // 'cover' and anything else: the title scene, parked on the threshold
  // with the valley and first gate ahead.
  p.throttle = 0.18;
  return 'title';
}
