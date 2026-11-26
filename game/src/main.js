// Skyharbor Run — game entry point: the state machine and the loop.
// States: title -> fly -> (pause) -> landed -> next sortie, or crashed ->
// retry. Physics runs on a fixed step so the flight feels the same on any
// display; rendering reads whatever the last step left behind.

import { SCORING, SORTIES, STEP, VIEW } from './config.js';
import { Input } from './input.js';
import {
  EVENT_CRASHED, EVENT_LANDED, EVENT_RING, EVENT_RING_MISSED,
  createPlane, stepPlane,
} from './flight.js';
import { buildGates } from './world.js';
import {
  Renderer, SCREEN_CRASHED, SCREEN_FLY, SCREEN_LANDED, SCREEN_PAUSE, SCREEN_TITLE,
} from './render.js';
import { SoundEngine } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const renderer = new Renderer(ctx);
const input = new Input(canvas);
const sound = new SoundEngine();
const statusEl = document.getElementById('status');

const game = {
  screen: SCREEN_TITLE,
  sortieIndex: 0,
  sortieName: SORTIES[0].name,
  plane: null,
  gates: [],
  score: 0,
  totalScore: 0,
  elapsed: 0,
  frameDt: 1 / 60,
  message: '',
  messageUntil: 0,
  crashReason: '',
  resultLines: [],
  nextGateText: '',
  nextGateFinal: false,

  startSortie(index, keepScore = false) {
    this.sortieIndex = Math.min(index, SORTIES.length - 1);
    const sortie = SORTIES[this.sortieIndex];
    this.sortieName = sortie.name;
    this.plane = createPlane(sortie);
    this.gates = buildGates(this.sortieIndex, sortie.rings);
    this.elapsed = 0;
    if (!keepScore) this.score = 0;
    this.message = '';
    this.messageUntil = 0;
    this.updateGateText();
  },

  updateGateText() {
    const next = this.gates.find((g) => !g.passed && !g.missed);
    if (!next) {
      this.nextGateText = 'All gates done — land at Skyharbor';
      this.nextGateFinal = true;
      return;
    }
    const idx = this.gates.indexOf(next) + 1;
    this.nextGateFinal = Boolean(next.final);
    this.nextGateText = next.final
      ? 'Final gate — then land'
      : `Next: gate ${idx} of ${this.gates.length}`;
  },

  say(text, seconds = 2.6) {
    this.message = text;
    this.messageUntil = this.elapsed + seconds;
  },
};

game.startSortie(0);

// Screenshot mode: ?shot=cover|flight|approach|climb freezes a staged scene
// (still rendered every frame, so the propeller and clouds stay alive).
const shotName = new URLSearchParams(window.location.search).get('shot');
let shotMode = false;
if (shotName) {
  const screen = stageShot(shotName, game);
  game.screen = screen === 'title' ? SCREEN_TITLE : SCREEN_FLY;
  game.updateGateText();
  shotMode = true;
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;
  game.frameDt = dt;

  if (!shotMode) update(dt);
  renderer.drawScene(game.plane, game, game.screen);
  sound.update(game.plane);
  input.endFrame();
}

function update(dt) {
  const p = game.plane;

  if (game.screen === SCREEN_TITLE) {
    if (input.tapped('enter') || input.tapped('space')) {
      sound.start();
      game.screen = SCREEN_FLY;
      game.say('Throttle up — SHIFT — and pull back at 50 kt', 4);
    }
    // Idle scene: the parked aircraft still breathes (prop tick-over).
    p.propPhase += dt * (2 + p.throttle * 20);
    return;
  }

  if (game.screen === SCREEN_PAUSE) {
    if (input.tapped('p')) game.screen = SCREEN_FLY;
    return;
  }

  if (game.screen === SCREEN_LANDED || game.screen === SCREEN_CRASHED) {
    if (input.tapped('enter') || input.tapped('space')) {
      if (game.screen === SCREEN_LANDED) {
        game.totalScore += game.score;
        game.startSortie(game.sortieIndex + 1);
      } else {
        game.startSortie(game.sortieIndex);
      }
      game.screen = SCREEN_FLY;
      game.say('Throttle up — SHIFT — and pull back at 50 kt', 4);
    }
    // Roll-out / wreck: let the aircraft coast to a stop on screen.
    if (p.speed > 0) {
      p.speed = Math.max(0, p.speed - dt * 5);
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.y += Math.cos(p.heading) * p.speed * dt;
      p.propPhase += dt * 3;
    }
    return;
  }

  // SCREEN_FLY
  if (input.tapped('p')) {
    game.screen = SCREEN_PAUSE;
    return;
  }
  if (input.tapped('g')) p.gearDown = !p.gearDown;
  p.brake = input.held('b') || input.held('space');

  const axes = input.axes();
  const controls = {
    pitch: axes.pitch,
    roll: axes.roll,
    throttleDelta: input.throttleDelta(),
  };

  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard < 40) {
    accumulator -= STEP;
    guard += 1;
    game.elapsed += STEP;
    const events = stepPlane(p, STEP, controls, game.gates);
    if (events & EVENT_RING) onRing(p);
    if (events & EVENT_RING_MISSED) {
      game.say('Gate missed — carry on to the next');
      game.updateGateText();
    }
    if (events & EVENT_LANDED) {
      onLanded(p);
      break;
    }
    if (events & EVENT_CRASHED) {
      onCrashed(p);
      break;
    }
  }
  if (!p.gearDown && !p.onGround) {
    // Belly risk is handled at touchdown; here just remind the pilot.
    if (p.z < 160 && game.elapsed > 5) game.say('Gear is UP — press G', 0.4);
  }
  announceStatus();
}

function onRing(p) {
  const offset = p.lastRingOffset ?? 26;
  const centred = Math.max(0, 1 - offset / 26);
  const gained = SCORING.ringBase + Math.round(SCORING.ringCentreBonus * centred);
  game.score += gained;
  const gate = game.gates.find((g) => g.passed && !g.counted);
  if (gate) gate.counted = true;
  game.say(centred > 0.6 ? `Gate — CENTRED  +${gained}` : `Gate  +${gained}`);
  sound.gateChime();
  game.updateGateText();
}

function onLanded(p) {
  const t = p.touchdown;
  let gained = SCORING.landingBase;
  const lines = [];
  if (t && t.ok) {
    if (t.sink < 2.2) {
      gained += SCORING.landingSoftBonus;
      lines.push(`Feathered it on — sink ${t.sink.toFixed(1)} m/s  +${SCORING.landingSoftBonus}`);
    } else if (t.sink < 4) {
      lines.push(`Firm arrival — sink ${t.sink.toFixed(1)} m/s`);
    } else {
      lines.push(`Heavy landing — sink ${t.sink.toFixed(1)} m/s, gear bent`);
    }
    if (t.centreOffset < 6) {
      gained += SCORING.landingCentreBonus;
      lines.push(`On the centreline  +${SCORING.landingCentreBonus}`);
    }
    const fuelBonus = Math.round(p.fuel) * SCORING.secondPerFuelLeft;
    gained += fuelBonus;
    lines.push(`Fuel in hand: ${p.fuel.toFixed(0)} units  +${fuelBonus}`);
    const missed = game.gates.filter((g) => g.missed).length;
    if (missed > 0) lines.push(`${missed} gate(s) missed on the way`);
    if (p.damage > 0) lines.push(`Damage carried: ${Math.round(p.damage)}%`);
  }
  game.score += gained;
  lines.push(`Sortie score ${game.score}   (landing +${gained})`);
  game.resultLines = lines;
  game.screen = SCREEN_LANDED;
  sound.thud();
  setStatus(`Landed safely. Sortie score ${game.score}.`);
}

function onCrashed(p) {
  game.crashReason = p.touchdown && p.touchdown.reason
    ? p.touchdown.reason
    : 'The valley collects another aeroplane';
  game.resultLines = [
    `Sortie score kept: ${game.score}`,
    `Gates threaded: ${game.gates.filter((g) => g.passed).length} of ${game.gates.length}`,
    p.fuel <= 0 ? 'The tanks were dry.' : 'Fuel and pride both spent.',
  ];
  game.screen = SCREEN_CRASHED;
  sound.thud();
  setStatus(`Crashed. ${game.crashReason}.`);
}

let lastAnnounce = 0;
function announceStatus() {
  const now = performance.now();
  if (now - lastAnnounce < 4000) return;
  lastAnnounce = now;
  const p = game.plane;
  setStatus(
    `Flying. Altitude ${Math.round(p.z * 3.281)} feet, speed ${Math.round(p.speed * 1.944)} knots, score ${game.score}.`,
  );
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

requestAnimationFrame(frame);
