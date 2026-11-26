// Skyharbor Run — the flight model.
// A light but honest simulation: thrust fights drag, pitch trades speed for
// height, bank turns the aircraft, the wing stalls below stall speed, and
// the ground is unforgiving unless you arrive on the runway, slowly, gently
// and pointing the right way.

import { PLANE, RUNWAY } from './config.js';
import { groundHeightAt, onRunway } from './world.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_RING_MISSED = 2;
export const EVENT_LANDED = 3;
export const EVENT_CRASHED = 4;
export const EVENT_RING_CLIP = 5;

export function createPlane(sortie) {
  return {
    // Position: x east, y north, z up, all metres. Starts on the threshold.
    x: RUNWAY.x,
    y: RUNWAY.startY + 60,
    z: 0,
    heading: 0, // radians, 0 = north, positive turning east
    pitch: 0, // radians, positive nose up
    roll: 0, // radians, positive right wing down
    speed: 0, // m/s along the flight path
    verticalSpeed: 0,
    throttle: 0,
    onGround: true,
    gearDown: true,
    brake: false,
    fuel: sortie.fuel,
    damage: 0, // 0..100, 100 is a wreck
    stalled: false,
    windX: sortie.wind * 0.6, // gentle crosswind drift, m/s
    windY: sortie.wind * 0.25,
    propPhase: 0,
    touchdown: null, // filled in at the moment of landing
  };
}

/**
 * Advance the aircraft one fixed step.
 * controls: { pitch, roll } in -1..1, throttleDelta -1..1, brake bool.
 * Returns a bitmask of EVENT_* values.
 */
export function stepPlane(p, dt, controls, gates) {
  let events = EVENT_NONE;

  // --- throttle and engine
  p.throttle = clamp(p.throttle + controls.throttleDelta * dt * 0.55, 0, 1);
  const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurnFull - PLANE.fuelBurnIdle) * p.throttle;
  p.fuel = Math.max(0, p.fuel - burn * dt);
  const engineOut = p.fuel <= 0;
  const thrust = engineOut ? 0 : p.throttle * PLANE.maxThrustAccel;

  // --- attitude: controls move pitch and roll toward commanded deflections
  const authority = clamp(p.speed / PLANE.cruiseSpeed, 0.25, 1.15);
  const targetRoll = controls.roll * PLANE.maxBank;
  p.roll += clamp(targetRoll - p.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt) * (p.onGround ? 0.25 : 1);
  if (!p.onGround) {
    const targetPitch = controls.pitch * 0.42;
    p.pitch += clamp(targetPitch - p.pitch, -PLANE.pitchRate * dt * authority, PLANE.pitchRate * dt * authority);
    // A banked wing drops the nose a little; the pilot must hold some pull.
    p.pitch -= Math.abs(p.roll) * 0.05 * dt;
  } else {
    // On the ground the nose follows the speed: rotate when fast enough.
    if (p.speed > PLANE.stallSpeed * 0.92 && controls.pitch > 0.25) {
      p.pitch = Math.min(0.16, p.pitch + dt * 0.5);
    } else {
      p.pitch = Math.max(0, p.pitch - dt * 0.8);
    }
    p.roll *= Math.max(0, 1 - dt * 6);
  }

  // --- turn from bank, stronger with speed up to a point
  if (!p.onGround) {
    const turnRate = Math.sin(p.roll) * PLANE.turnPerBank * clamp(p.speed / 55, 0.3, 1.2);
    p.heading += turnRate * dt;
  } else if (p.speed > 4) {
    p.heading += controls.roll * 0.35 * dt * clamp(p.speed / 30, 0, 1);
  }

  // --- speed: thrust, drag and the gravity trade along the flight path
  const drag = PLANE.dragBase * p.speed * p.speed
    + PLANE.dragInduced * Math.abs(p.roll) * Math.max(0, p.speed - 20) * 0.06;
  let accel = thrust - drag / 4.2 - Math.sin(p.pitch) * PLANE.gravity * (p.onGround ? 0 : 1);
  if (p.onGround) {
    accel -= PLANE.groundRollFriction * (p.brake ? 4 : 1) * (p.speed > 0.5 ? 1 : 0);
    if (p.brake) accel -= PLANE.brakeDecel * clamp(p.speed / 12, 0, 1);
  }
  p.speed = Math.max(0, p.speed + accel * dt);
  if (p.speed > PLANE.maxSpeed) p.speed = PLANE.maxSpeed;

  // --- lift and vertical motion
  p.stalled = !p.onGround && p.speed < PLANE.stallSpeed;
  let climb = Math.sin(p.pitch) * p.speed;
  if (p.stalled) climb -= (PLANE.stallSpeed - p.speed) * 0.55; // the wing lets go
  if (p.onGround) climb = p.pitch > 0.1 && p.speed > PLANE.stallSpeed ? climb : 0;

  const forwardX = Math.sin(p.heading);
  const forwardY = Math.cos(p.heading);
  p.x += (forwardX * Math.cos(p.pitch) * p.speed + p.windX * (p.onGround ? 0 : 1)) * dt;
  p.y += (forwardY * Math.cos(p.pitch) * p.speed + p.windY * (p.onGround ? 0 : 1)) * dt;
  p.z += climb * dt;
  p.verticalSpeed = climb;
  p.propPhase += dt * (4 + p.throttle * 46);

  // --- gates: crossing the plane of the next gate inside its radius scores
  const gate = gates.find((g) => !g.passed && !g.missed);
  if (gate && !p.onGround) {
    const dx = p.x - gate.x;
    const dy = p.y - gate.y;
    const dz = p.z - gate.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (p.prevGateDist !== undefined && dist > p.prevGateDist && p.prevGateDist < 90 && !gate.passed) {
      // We just passed its closest point without threading it.
      const radial = Math.sqrt(dx * dx + dz * dz);
      if (radial <= 26 + 3.2 && Math.abs(dy) < 40) {
        gate.passed = true;
        p.lastRingOffset = radial;
        events |= EVENT_RING;
      } else if (dist < 120) {
        gate.missed = true;
        events |= EVENT_RING_MISSED;
      }
    }
    if (dist < 340 && Math.abs(dz) < 90 && radialHit(p, gate)) {
      gate.passed = true;
      p.lastRingOffset = Math.sqrt((p.x - gate.x) ** 2 + (p.z - gate.z) ** 2);
      events |= EVENT_RING;
    }
    p.prevGateDist = dist;
  }

  // --- the ground
  const ground = groundHeightAt(p.x, p.y);
  const ceiling = onRunway(p.x, p.y, 4) ? 0 : ground;
  if (p.z <= ceiling) {
    p.z = ceiling;
    if (!p.onGround) {
      events |= judgeTouchdown(p);
      if (events & EVENT_LANDED) {
        p.onGround = true;
        p.pitch = 0;
      }
    }
  } else if (p.z > ceiling + 0.4) {
    p.onGround = false;
  }
  if (p.onGround && p.speed < 0.4 && p.throttle < 0.05) p.speed = 0;

  // Valley walls: flying into a peak is a crash wherever it happens.
  if (!p.onGround && ground > 2 && p.z <= ground + 1) {
    p.damage = 100;
    events |= EVENT_CRASHED;
  }
  if (p.damage >= 100) events |= EVENT_CRASHED;
  return events;
}

function radialHit(p, gate) {
  const dx = p.x - gate.x;
  const dz = p.z - gate.z;
  return dx * dx + dz * dz <= 26 * 26 && Math.abs(p.y - gate.y) < 30;
}

/** Decide whether a touchdown is a landing, a hard arrival or a crash. */
function judgeTouchdown(p) {
  const sink = -p.verticalSpeed;
  const onStrip = onRunway(p.x, p.y, 2);
  // The strip takes landings in either direction: the final gate is north
  // of it, so a pilot may land southbound straight ahead or fly a circuit
  // and land northbound. What matters is being aligned with the strip.
  const headingError = Math.min(
    Math.abs(wrapAngle(p.heading)),
    Math.abs(wrapAngle(p.heading - Math.PI)),
  );
  if (!onStrip) {
    p.damage = 100;
    p.touchdown = { ok: false, reason: 'Put down off the runway' };
    return EVENT_CRASHED;
  }
  if (sink > 9 || p.speed > 62 || headingError > 0.5) {
    p.damage = 100;
    p.touchdown = {
      ok: false,
      reason: sink > 9 ? 'Arrived far too hard' : p.speed > 62 ? 'Far too fast to land' : 'Sideways on touchdown',
    };
    return EVENT_CRASHED;
  }
  if (!p.gearDown) {
    // A belly landing is survivable only when slow and gentle; the
    // airframe pays for it either way.
    if (sink > 4 || p.speed > 48) {
      p.damage = 100;
      p.touchdown = { ok: false, reason: 'Came down with the gear up' };
      return EVENT_CRASHED;
    }
    p.damage = Math.min(95, p.damage + 55);
    p.touchdown = {
      ok: true, sink, centreOffset: Math.abs(p.x - RUNWAY.x), speed: p.speed, belly: true,
    };
    return EVENT_LANDED;
  }
  p.touchdown = {
    ok: true,
    sink,
    centreOffset: Math.abs(p.x - RUNWAY.x),
    speed: p.speed,
    rollOut: RUNWAY.startY + RUNWAY.length - p.y,
  };
  if (sink > 5.5) p.damage = Math.min(90, p.damage + 30); // bent gear, but alive
  return EVENT_LANDED;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function headingDegrees(p) {
  const deg = (p.heading * 180 / Math.PI) % 360;
  return (deg + 360) % 360;
}

export function speedKnots(p) {
  return p.speed * 1.944;
}

export function altitudeFeet(p) {
  return p.z * 3.281;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
