// Skyharbor Run — renderer: a chase camera over a projected valley, the
// aircraft drawn in frame, and a lit instrument panel with a HUD.
// All drawing is Canvas 2D. The world is real 3D (x east, y north, z up);
// every vertex goes through project(), which places the camera behind and
// above the aircraft, rolled part-way with it so turns feel connected
// without the horizon spinning the player sick.

import { RUNWAY, VIEW, WORLD } from './config.js';
import {
  BUILDINGS, CLOUDS, PEAKS, TREES, groundHeightAt, hash2, patchColour, riverXAt,
} from './world.js';
import { altitudeFeet, headingDegrees, speedKnots, wrapAngle } from './flight.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_FLY = 'fly';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.camHeading = 0;
    this.camPitch = 0;
    this.camRoll = 0;
    this.time = 0;
  }

  /** Build the camera basis from the aircraft state (smoothed by caller dt). */
  frameCamera(p, dt) {
    const ease = Math.min(1, dt * 5);
    this.camHeading += wrapAngle(p.heading - this.camHeading) * ease;
    this.camPitch += ((p.onGround ? 0.02 : p.pitch * 0.55) - this.camPitch) * ease;
    this.camRoll += ((p.onGround ? 0 : p.roll * 0.55) - this.camRoll) * Math.min(1, dt * 4);
    const fx = Math.sin(this.camHeading);
    const fy = Math.cos(this.camHeading);
    this.camPos = {
      x: p.x - fx * VIEW.cameraBack,
      y: p.y - fy * VIEW.cameraBack,
      z: p.z + VIEW.cameraUp,
    };
    // Basis: forward leans down so the aircraft sits proud of the panel
    // instead of sinking behind it.
    const pitch = this.camPitch - 0.13;
    this.fwd = norm3(fx * Math.cos(pitch), fy * Math.cos(pitch), Math.sin(pitch));
    const rawRight = { x: fy, y: -fx, z: 0 };
    const up0 = cross3(rawRight, this.fwd);
    const cr = Math.cos(this.camRoll);
    const sr = Math.sin(this.camRoll);
    this.right = norm3(
      rawRight.x * cr + up0.x * sr,
      rawRight.y * cr + up0.y * sr,
      rawRight.z * cr + up0.z * sr,
    );
    // Screen-up is right × forward in this handedness (x east, y north,
    // z up): forward × right would point at the ground.
    this.up = cross3(this.right, this.fwd);
  }

  /** Project a world point to screen space, or null when behind the camera. */
  project(pt) {
    const dx = pt.x - this.camPos.x;
    const dy = pt.y - this.camPos.y;
    const dz = pt.z - this.camPos.z;
    const cz = dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z;
    if (cz < VIEW.near) return null;
    const cx = dx * this.right.x + dy * this.right.y + dz * this.right.z;
    const cy = dx * this.up.x + dy * this.up.y + dz * this.up.z;
    const scale = VIEW.focal / cz;
    return {
      x: VIEW.width / 2 + cx * scale,
      y: VIEW.height / 2 - cy * scale,
      depth: cz,
      scale,
    };
  }

  poly(points, fill, stroke) {
    const ctx = this.ctx;
    const pts = points.map((pt) => this.project(pt));
    if (pts.some((s) => s === null)) return false;
    ctx.beginPath();
    pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    return true;
  }

  // ------------------------------------------------------------- scenery

  drawSky(p, sortieIndex) {
    const ctx = this.ctx;
    const dusk = sortieIndex >= 3;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    if (dusk) {
      grad.addColorStop(0, '#2c3a63');
      grad.addColorStop(0.55, '#c96f3f');
      grad.addColorStop(0.78, '#e8a35c');
    } else {
      grad.addColorStop(0, '#3d6fb4');
      grad.addColorStop(0.6, '#8fb8dd');
      grad.addColorStop(0.8, '#cfe3ef');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Sun: fixed in the west, projected like any other far point.
    const sun = this.project({ x: this.camPos.x - 4000, y: this.camPos.y + 2600, z: this.camPos.z + 900 });
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, dusk ? 'rgba(255,190,110,0.95)' : 'rgba(255,246,200,0.95)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
      ctx.fillStyle = dusk ? '#ffb066' : '#fff3c4';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClouds(p) {
    const ctx = this.ctx;
    for (const cloud of CLOUDS) {
      // Wrap clouds around the aircraft so the sky never runs out.
      let cy = cloud.y;
      while (cy - p.y > 7000) cy -= 15000;
      while (p.y - cy > 7000) cy += 15000;
      const s = this.project({ x: cloud.x, y: cy, z: cloud.z });
      if (!s || s.depth > VIEW.far) continue;
      const r = cloud.r * s.scale;
      if (r < 3 || r > 300) continue; // a cloud on the lens is just fog
      // Near clouds fade out so they never swallow the panel or the gates.
      const alpha = 0.72 * Math.min(1, s.depth / 800);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      for (const [ox, oy, orad] of [[0, 0, 1], [-0.7, 0.15, 0.62], [0.7, 0.12, 0.66], [0.1, -0.3, 0.55]]) {
        ctx.beginPath();
        ctx.ellipse(s.x + ox * r, s.y + oy * r * 0.4, r * orad, r * orad * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawGround(p) {
    const cell = WORLD.cell;
    const range = 4600;
    const cx0 = Math.floor((p.x - range) / cell);
    const cx1 = Math.floor((p.x + range) / cell);
    const cy0 = Math.floor((p.y - range) / cell);
    const cy1 = Math.floor((p.y + range) / cell);
    const quads = [];
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const x0 = cx * cell;
        const y0 = cy * cell;
        const mx = x0 + cell / 2;
        const my = y0 + cell / 2;
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > range * range) continue;
        quads.push({ x0, y0, cx, cy, dist2 });
      }
    }
    quads.sort((a, b) => b.dist2 - a.dist2); // far first, painter style
    for (const q of quads) {
      const x1 = q.x0 + cell;
      const y1 = q.y0 + cell;
      const corners = [
        { x: q.x0, y: q.y0, z: groundHeightAt(q.x0, q.y0) },
        { x: x1, y: q.y0, z: groundHeightAt(x1, q.y0) },
        { x: x1, y: y1, z: groundHeightAt(x1, y1) },
        { x: q.x0, y: y1, z: groundHeightAt(q.x0, y1) },
      ];
      // River cells are water, not fields.
      const midX = q.x0 + cell / 2;
      const midY = q.y0 + cell / 2;
      const inRiver = Math.abs(midX - riverXAt(midY)) < WORLD.riverWidth * 0.72
        && groundHeightAt(midX, midY) < 4;
      const colour = inRiver ? '#3f6d8e' : patchColour(q.cx, q.cy);
      this.poly(corners, colour);
    }
    this.drawRiverBanks(p);
  }

  drawRiverBanks(p) {
    // A lighter sandy edge either side of the water sells the river's path.
    const ctx = this.ctx;
    const step = 160;
    const yStart = Math.floor((p.y - 4200) / step) * step;
    for (let y = yStart; y < p.y + 4200; y += step) {
      for (const side of [-1, 1]) {
        const xA = riverXAt(y) + side * WORLD.riverWidth * 0.62;
        const xB = riverXAt(y + step) + side * WORLD.riverWidth * 0.62;
        const xA2 = riverXAt(y) + side * WORLD.riverWidth * 0.85;
        const xB2 = riverXAt(y + step) + side * WORLD.riverWidth * 0.85;
        this.poly(
          [{ x: xA, y, z: 0.4 }, { x: xB, y: y + step, z: 0.4 }, { x: xB2, y: y + step, z: 0.4 }, { x: xA2, y, z: 0.4 }],
          'rgba(196,178,128,0.5)',
        );
      }
    }
    void ctx;
  }

  drawPeaks() {
    for (const peak of [...PEAKS].sort((a, b) => dist2(b, this.camPos) - dist2(a, this.camPos))) {
      const base = [
        { x: peak.x - peak.radius, y: peak.y - peak.radius * 0.7, z: 0 },
        { x: peak.x + peak.radius, y: peak.y - peak.radius * 0.7, z: 0 },
        { x: peak.x + peak.radius * 0.6, y: peak.y + peak.radius, z: 0 },
        { x: peak.x - peak.radius * 0.6, y: peak.y + peak.radius, z: 0 },
      ];
      const apex = { x: peak.x, y: peak.y, z: peak.height };
      this.poly([base[0], base[1], apex], '#6d7076');
      this.poly([base[1], base[2], apex], '#7d7f85');
      this.poly([base[2], base[3], apex], '#5d6066');
      this.poly([base[3], base[0], apex], '#71747b');
      // Snow cap: a smaller, paler cone near the top.
      const t = 0.34;
      const cap = base.map((b) => ({
        x: apex.x + (b.x - apex.x) * t,
        y: apex.y + (b.y - apex.y) * t,
        z: apex.z + (b.z - apex.z) * t,
      }));
      this.poly([cap[0], cap[1], apex], '#e8ecf0');
      this.poly([cap[1], cap[2], apex], '#f2f5f8');
      this.poly([cap[2], cap[3], apex], '#dde3e9');
      this.poly([cap[3], cap[0], apex], '#e8ecf0');
    }
  }

  drawRunway() {
    const { x, startY, length, width } = RUNWAY;
    const hw = width / 2;
    const endY = startY + length;
    // Drawn in short segments along its length: one 1500 m quad would be
    // clipped whole whenever the camera is over the strip, which is
    // exactly where the pilot needs to see it.
    const seg = 75;
    for (let y = startY - 30; y < endY + 30; y += seg) {
      const y2 = Math.min(y + seg, endY + 30);
      this.poly(
        [{ x: x - hw - 14, y, z: 0.15 }, { x: x + hw + 14, y, z: 0.15 },
         { x: x + hw + 14, y: y2, z: 0.15 }, { x: x - hw - 14, y: y2, z: 0.15 }],
        '#7a7d72',
      );
      if (y2 > startY && y < endY) {
        this.poly(
          [{ x: x - hw, y: Math.max(y, startY), z: 0.3 }, { x: x + hw, y: Math.max(y, startY), z: 0.3 },
           { x: x + hw, y: Math.min(y2, endY), z: 0.3 }, { x: x - hw, y: Math.min(y2, endY), z: 0.3 }],
          '#3c3f45',
        );
      }
    }
    // Centreline dashes and threshold bars, all projected geometry.
    for (let y = startY + 90; y < endY - 60; y += 90) {
      this.poly(
        [{ x: x - 1.4, y, z: 0.45 }, { x: x + 1.4, y, z: 0.45 },
         { x: x + 1.4, y: y + 42, z: 0.45 }, { x: x - 1.4, y: y + 42, z: 0.45 }],
        '#e8e8e2',
      );
    }
    for (const endSign of [0, 1]) {
      const y = endSign === 0 ? startY + 12 : endY - 26;
      for (let i = -3; i <= 3; i += 1) {
        if (i === 0) continue;
        const bx = x + i * 5.4;
        this.poly(
          [{ x: bx - 1.7, y, z: 0.45 }, { x: bx + 1.7, y, z: 0.45 },
           { x: bx + 1.7, y: y + 14, z: 0.45 }, { x: bx - 1.7, y: y + 14, z: 0.45 }],
          '#f0f0ea',
        );
      }
    }
    // Edge lights: small bright posts the length of the strip.
    const ctx = this.ctx;
    for (let y = startY; y <= endY; y += 100) {
      for (const side of [-1, 1]) {
        const s = this.project({ x: x + side * (hw + 4), y, z: 1.2 });
        if (!s) continue;
        const r = Math.max(1, 90 * s.scale / 10);
        ctx.fillStyle = '#ffd977';
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.min(4, r), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTreesAndBuildings(p) {
    const ctx = this.ctx;
    const items = [];
    for (const t of TREES) items.push({ kind: 'tree', x: t.x, y: t.y, s: t.s, dist: dist2(t, p) });
    for (const b of BUILDINGS) items.push({ kind: 'house', ...b, dist: dist2(b, p) });
    items.sort((a, b) => b.dist - a.dist);
    for (const item of items) {
      if (item.dist > 3600 * 3600) continue;
      if (item.kind === 'tree') {
        const base = this.project({ x: item.x, y: item.y, z: 0 });
        const top = this.project({ x: item.x, y: item.y, z: item.s * 1.7 });
        if (!base || !top) continue;
        const w = Math.max(1.5, item.s * base.scale * 0.8);
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(base.x - w * 0.12, top.y + (base.y - top.y) * 0.55, w * 0.24, (base.y - top.y) * 0.45);
        ctx.fillStyle = '#2f4d2a';
        ctx.beginPath();
        ctx.moveTo(base.x - w, base.y);
        ctx.lineTo(base.x, top.y);
        ctx.lineTo(base.x + w, base.y);
        ctx.closePath();
        ctx.fill();
      } else {
        const z = item.h;
        const c = [
          { x: item.x - item.w / 2, y: item.y - item.d / 2, z: 0 },
          { x: item.x + item.w / 2, y: item.y - item.d / 2, z: 0 },
          { x: item.x + item.w / 2, y: item.y + item.d / 2, z: 0 },
          { x: item.x - item.w / 2, y: item.y + item.d / 2, z: 0 },
        ];
        const wall = item.tone > 0.5 ? '#c9bda6' : '#b5a48c';
        this.poly([c[0], c[1], { ...c[1], z }, { ...c[0], z }], wall);
        this.poly([c[1], c[2], { ...c[2], z }, { ...c[1], z }], '#a08e73');
        this.poly(
          [{ ...c[0], z }, { ...c[1], z }, { ...c[2], z }, { ...c[3], z }],
          item.tone > 0.5 ? '#8a4f3a' : '#74584a',
        );
      }
    }
  }

  drawGates(gates, time) {
    const ctx = this.ctx;
    gates.forEach((gate, index) => {
      if (gate.passed) return;
      const centre = this.project(gate);
      if (!centre || centre.depth > VIEW.far) return;
      const isNext = gates.findIndex((g) => !g.passed && !g.missed) === index;
      const r = WORLD.ringRadius * centre.scale;
      if (r < 2) return;
      const pulse = isNext ? 1 + Math.sin(time * 4) * 0.05 : 1;
      ctx.lineWidth = Math.max(2, WORLD.ringTube * centre.scale);
      ctx.strokeStyle = gate.missed
        ? 'rgba(120,120,120,0.55)'
        : gate.final
          ? '#ffd34d'
          : isNext ? '#ff7847' : 'rgba(255,150,80,0.6)';
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      if (isNext) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, r * pulse + 5, 0, Math.PI * 2);
        ctx.stroke();
        // Guide chevrons pointing at the gate.
        ctx.fillStyle = 'rgba(255,215,120,0.9)';
        ctx.font = `700 ${Math.max(13, Math.min(26, r * 0.5))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`GATE ${index + 1}`, centre.x, centre.y - r - 12);
      }
    });
  }

  // ------------------------------------------------------------- aircraft

  drawAircraft(p) {
    const ctx = this.ctx;
    // The aircraft is drawn in screen space at the chase position: it banks
    // with the roll, rises/dips a little with pitch, and its shadow tracks
    // it over the ground so height reads at a glance.
    const shadow = this.project({ x: p.x, y: p.y, z: groundHeightAt(p.x, p.y) + 0.5 });
    if (shadow && p.z > 2) {
      const sw = Math.max(6, 2400 / shadow.depth * 4);
      ctx.fillStyle = 'rgba(20,26,20,0.30)';
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, sw, sw * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const anchor = this.project({ x: p.x, y: p.y, z: p.z });
    if (!anchor) return;
    const cx = anchor.x;
    const cy = anchor.y + 6 + Math.sin(p.pitch) * -26;
    const s = Math.max(0.55, Math.min(1.5, 900 / anchor.depth)); // screen size factor
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-p.roll * 0.85);
    ctx.scale(s, s);

    // Tailplane and fin.
    ctx.fillStyle = '#d8542e';
    ctx.beginPath();
    ctx.moveTo(-52, 6);
    ctx.lineTo(-30, -2);
    ctx.lineTo(30, -2);
    ctx.lineTo(52, 6);
    ctx.lineTo(30, 12);
    ctx.lineTo(-30, 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, -16);
    ctx.lineTo(0, -34);
    ctx.lineTo(7, -16);
    ctx.closePath();
    ctx.fill();

    // Main wing, slightly swept, with aileron shading.
    const wingGrad = ctx.createLinearGradient(0, -6, 0, 20);
    wingGrad.addColorStop(0, '#f2f4f6');
    wingGrad.addColorStop(1, '#c3cad2');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-118, 14);
    ctx.lineTo(-96, -2);
    ctx.lineTo(-14, -6);
    ctx.lineTo(14, -6);
    ctx.lineTo(96, -2);
    ctx.lineTo(118, 14);
    ctx.lineTo(60, 22);
    ctx.lineTo(-60, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8542e';
    ctx.fillRect(-118, 10, 16, 6);
    ctx.fillRect(102, 10, 16, 6);

    // Fuselage seen from behind-above: rounded body, canopy, spinner.
    const bodyGrad = ctx.createLinearGradient(-20, 0, 20, 0);
    bodyGrad.addColorStop(0, '#dfe4ea');
    bodyGrad.addColorStop(0.5, '#ffffff');
    bodyGrad.addColorStop(1, '#ccd3db');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, 21, 27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b3a4a';
    ctx.beginPath();
    ctx.ellipse(0, -8, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,240,0.85)';
    ctx.beginPath();
    ctx.ellipse(-3, -12, 5, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Spinning propeller disc ahead of the nose (below centre, toward viewer
    // in this rear view it reads as the blurred arc under the spinner).
    const blur = 0.16 + p.throttle * 0.2;
    ctx.strokeStyle = `rgba(40,40,44,${blur})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 16, 17, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    const blade = p.propPhase % Math.PI;
    ctx.strokeStyle = 'rgba(30,30,34,0.75)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(blade) * -16, 16 + Math.sin(blade) * 10);
    ctx.lineTo(Math.cos(blade) * 16, 16 - Math.sin(blade) * 10);
    ctx.stroke();

    // Gear legs when down.
    if (p.gearDown) {
      ctx.strokeStyle = '#3a3f45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-13, 20);
      ctx.lineTo(-17, 32);
      ctx.moveTo(13, 20);
      ctx.lineTo(17, 32);
      ctx.stroke();
      ctx.fillStyle = '#22252a';
      ctx.beginPath();
      ctx.arc(-17, 34, 4.6, 0, Math.PI * 2);
      ctx.arc(17, 34, 4.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Stall buffet shake and damage smoke.
    if (p.stalled) {
      ctx.fillStyle = 'rgba(255,60,40,0.10)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (p.damage > 45 && !p.onGround) {
      ctx.fillStyle = 'rgba(60,60,60,0.35)';
      for (let i = 0; i < 5; i += 1) {
        const wob = Math.sin(this.time * 3 + i * 1.7) * 8;
        ctx.beginPath();
        ctx.arc(cx - 30 - i * 16 + wob, cy - 8 - i * 7, 7 + i * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------- panel & HUD

  drawPanel(p, game) {
    const ctx = this.ctx;
    const panelTop = VIEW.height - 168;
    // Glareshield and panel body.
    const grad = ctx.createLinearGradient(0, panelTop, 0, VIEW.height);
    grad.addColorStop(0, '#2a2e35');
    grad.addColorStop(0.12, '#1d2026');
    grad.addColorStop(1, '#14161a');
    ctx.fillStyle = grad;
    roundRect(ctx, 118, panelTop, VIEW.width - 236, 168, 18);
    ctx.fill();
    ctx.strokeStyle = '#454b55';
    ctx.lineWidth = 2;
    roundRect(ctx, 118, panelTop, VIEW.width - 236, 168, 18);
    ctx.stroke();

    this.drawAttitude(p, 268, panelTop + 84, 62);
    this.drawDial(452, panelTop + 84, 62, 'AIRSPEED', 'kt', speedKnots(p), 0, 240, [40, 80, 120, 160, 200, 240], p.stalled ? '#ff5040' : '#ffd34d');
    this.drawDial(636, panelTop + 84, 62, 'ALTIMETER', 'ft', altitudeFeet(p), 0, 3000, [0, 500, 1000, 1500, 2000, 2500, 3000], '#7fd4ff');
    this.drawCompass(820, panelTop + 84, 62, p);
    this.drawVerticalSpeed(972, panelTop + 84, 46, p);
    this.drawBars(p, 1032, panelTop + 26);
    void game;
  }

  drawAttitude(p, cx, cy, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#101216';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.translate(cx, cy);
    ctx.rotate(p.roll);
    const pitchPx = clampNum(p.pitch * 90, -r * 0.8, r * 0.8);
    ctx.fillStyle = '#3f7fc4';
    ctx.fillRect(-r, -r + pitchPx - 0, r * 2, r + 4);
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(-r, pitchPx, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.4;
    for (const off of [-28, -14, 14, 28]) {
      ctx.beginPath();
      ctx.moveTo(-11, pitchPx + off);
      ctx.lineTo(11, pitchPx + off);
      ctx.stroke();
    }
    ctx.restore();
    // Fixed aircraft symbol and bezel.
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy);
    ctx.lineTo(cx - 9, cy);
    ctx.lineTo(cx - 9, cy + 7);
    ctx.moveTo(cx + 30, cy);
    ctx.lineTo(cx + 9, cy);
    ctx.lineTo(cx + 9, cy + 7);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#59616c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, cx, cy + r + 16, 'ATTITUDE', '#9fb2c8');
  }

  drawDial(cx, cy, r, title, unit, value, min, max, ticks, needleColour) {
    const ctx = this.ctx;
    ctx.fillStyle = '#101216';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#59616c';
    ctx.lineWidth = 3;
    ctx.stroke();
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    ctx.fillStyle = '#cfd8e2';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const tick of ticks) {
      const a = a0 + (a1 - a0) * ((tick - min) / (max - min));
      const x1 = cx + Math.cos(a) * (r - 8);
      const y1 = cy + Math.sin(a) * (r - 8);
      const x2 = cx + Math.cos(a) * (r - 17);
      const y2 = cy + Math.sin(a) * (r - 17);
      ctx.strokeStyle = '#8fa2b5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (tick % 500 === 0 || title === 'AIRSPEED') {
        ctx.fillText(String(tick >= 1000 ? tick / 1000 + 'k' : tick), cx + Math.cos(a) * (r - 27), cy + Math.sin(a) * (r - 27) + 4);
      }
    }
    const a = a0 + (a1 - a0) * clampNum((value - min) / (max - min), 0, 1);
    ctx.strokeStyle = needleColour;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
    ctx.stroke();
    ctx.fillStyle = '#e8eef4';
    ctx.font = '700 17px ui-monospace, monospace';
    ctx.fillText(String(Math.round(value)), cx, cy + r * 0.52);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = '#8fa2b5';
    ctx.fillText(unit, cx, cy + r * 0.72);
    label(ctx, cx, cy + r + 16, title, '#9fb2c8');
  }

  drawCompass(cx, cy, r, p) {
    const ctx = this.ctx;
    ctx.fillStyle = '#101216';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#59616c';
    ctx.lineWidth = 3;
    ctx.stroke();
    const heading = headingDegrees(p);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#cfd8e2';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const cardinals = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (const [deg, text] of cardinals) {
      let rel = ((deg - heading + 540) % 360) - 180;
      const a = -Math.PI / 2 + (rel * Math.PI) / 180;
      const x = cx + Math.cos(a) * (r - 16);
      const y = cy + Math.sin(a) * (r - 16) + 4;
      ctx.fillStyle = deg === 0 ? '#ff7847' : '#cfd8e2';
      ctx.fillText(text, x, y);
    }
    for (let deg = 0; deg < 360; deg += 15) {
      let rel = ((deg - heading + 540) % 360) - 180;
      if (Math.abs(rel) > 90) continue;
      const a = -Math.PI / 2 + (rel * Math.PI) / 180;
      ctx.strokeStyle = '#71808f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
      ctx.stroke();
    }
    ctx.restore();
    // Lubber line and digital readout.
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - r + 2);
    ctx.lineTo(cx + 6, cy - r + 2);
    ctx.lineTo(cx, cy - r + 12);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 17px ui-monospace, monospace';
    ctx.fillText(`${String(Math.round(heading)).padStart(3, '0')}°`, cx, cy + r * 0.55);
    label(ctx, cx, cy + r + 16, 'HEADING', '#9fb2c8');
  }

  drawVerticalSpeed(cx, cy, r, p) {
    const ctx = this.ctx;
    ctx.fillStyle = '#101216';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#59616c';
    ctx.lineWidth = 3;
    ctx.stroke();
    const vs = p.verticalSpeed * 196.85; // ft/min
    const frac = clampNum(vs / 2000, -1, 1);
    const a = Math.PI * 0.75 + (Math.PI * 1.5) * ((frac + 1) / 2);
    ctx.strokeStyle = vs < -1400 ? '#ff5040' : '#7fd4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    ctx.stroke();
    ctx.fillStyle = '#e8eef4';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs / 10) * 10}`, cx, cy + r * 0.55);
    label(ctx, cx, cy + r + 16, 'VERT SPD', '#9fb2c8');
  }

  drawBars(p, x, y) {
    const ctx = this.ctx;
    const rows = [
      ['THR', p.throttle, p.throttle > 0.85 ? '#ff9d47' : '#ffd34d'],
      ['FUEL', p.fuel / 100, p.fuel < 22 ? '#ff5040' : '#69d97f'],
      ['DMG', p.damage / 100, p.damage > 55 ? '#ff5040' : '#c8ccd2'],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([name, frac, colour], i) => {
      const ry = y + i * 34;
      ctx.fillStyle = '#9fb2c8';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(name, x, ry + 11);
      ctx.fillStyle = '#262a31';
      roundRect(ctx, x + 36, ry, 78, 13, 4);
      ctx.fill();
      ctx.fillStyle = colour;
      if (frac > 0.01) {
        roundRect(ctx, x + 36, ry, Math.max(4, 78 * clampNum(frac, 0, 1)), 13, 4);
        ctx.fill();
      }
    });
    ctx.fillStyle = p.gearDown ? '#69d97f' : '#ff5040';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(p.gearDown ? 'GEAR DOWN' : 'GEAR UP', x, y + 118);
    if (p.brake) {
      ctx.fillStyle = '#ffd34d';
      ctx.fillText('BRAKE', x + 84, y + 118);
    }
  }

  // ------------------------------------------------------------- HUD & screens

  drawHud(p, game) {
    const ctx = this.ctx;
    // Top-left flight data block: the numbers the judge and pilot both read.
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    roundRect(ctx, 18, 16, 252, 118, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 21px ui-monospace, monospace';
    ctx.fillText(`ALT ${String(Math.round(altitudeFeet(p))).padStart(4, ' ')} ft`, 34, 48);
    ctx.fillText(`SPD ${String(Math.round(speedKnots(p))).padStart(3, ' ')} kt`, 34, 78);
    ctx.fillText(`HDG ${String(Math.round(headingDegrees(p))).padStart(3, '0')}°`, 34, 108);
    ctx.fillStyle = '#ffd34d';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`VS ${p.verticalSpeed >= 0 ? '+' : ''}${(p.verticalSpeed * 3.281).toFixed(0)} ft/s`, 158, 108);

    // Top-right: sortie, score, gates.
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    roundRect(ctx, VIEW.width - 286, 16, 268, 118, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(`SCORE ${game.score}`, VIEW.width - 268, 48);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = '#cfe0ef';
    ctx.fillText(game.sortieName, VIEW.width - 268, 74);
    const done = game.gates.filter((g) => g.passed).length;
    ctx.fillText(`Gates ${done}/${game.gates.length}   Time ${game.elapsed.toFixed(0)}s`, VIEW.width - 268, 98);
    ctx.fillStyle = game.nextGateFinal ? '#ffd34d' : '#ff9d6b';
    ctx.fillText(game.nextGateText, VIEW.width - 268, 122);

    // Centre warnings.
    ctx.textAlign = 'center';
    if (p.stalled) {
      ctx.fillStyle = '#ff5040';
      ctx.font = '800 34px system-ui, sans-serif';
      ctx.fillText('STALL', VIEW.width / 2, 120);
    } else if (p.fuel <= 0 && !p.onGround) {
      ctx.fillStyle = '#ff5040';
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.fillText('FUEL EMPTY — GLIDE FOR THE RUNWAY', VIEW.width / 2, 120);
    } else if (game.message && game.messageUntil > game.elapsed) {
      ctx.fillStyle = '#ffe9a8';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillText(game.message, VIEW.width / 2, 116);
    }
    if (!p.onGround && p.z < 130) {
      const sinkBad = p.verticalSpeed < -8;
      ctx.fillStyle = sinkBad ? '#ff5040' : '#ffd34d';
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.fillText(sinkBad ? 'PULL UP' : 'LOW', VIEW.width / 2, 148);
    }
  }

  drawScene(p, game, screen) {
    this.time = game.elapsed;
    this.frameCamera(p, Math.max(1 / 240, Math.min(1 / 30, game.frameDt || 1 / 60)));
    this.drawSky(p, game.sortieIndex);
    // Base ground wash below the horizon: cells that straddle the camera
    // are clipped by project(), and without this the sky would show
    // through the hole under the aircraft on the ground and at low level.
    const horizonPt = this.project({
      x: this.camPos.x + this.fwd.x * 4200,
      y: this.camPos.y + this.fwd.y * 4200,
      z: this.camPos.z,
    });
    if (horizonPt) {
      const grad = this.ctx.createLinearGradient(0, horizonPt.y, 0, VIEW.height);
      grad.addColorStop(0, '#7d9a58');
      grad.addColorStop(1, '#55703a');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, Math.max(0, horizonPt.y), VIEW.width, VIEW.height);
    }
    this.drawGround(p);
    this.drawPeaks();
    this.drawRunway();
    this.drawTreesAndBuildings(p);
    this.drawGates(game.gates, game.elapsed);
    this.drawClouds(p);
    this.drawAircraft(p);
    this.drawPanel(p, game);
    this.drawHud(p, game);
    if (screen === SCREEN_TITLE) this.drawTitle(game);
    if (screen === SCREEN_PAUSE) this.drawCentredPanel('PAUSED', ['Press P to resume', 'R/F throttle · arrows/WASD pitch & roll · B brake · G gear']);
    if (screen === SCREEN_LANDED) this.drawResult(game, true);
    if (screen === SCREEN_CRASHED) this.drawResult(game, false);
  }

  drawTitle(game) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,12,20,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.fillText('SKYHARBOR RUN', VIEW.width / 2, 208);
    ctx.fillStyle = '#ffd34d';
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.fillText('Thread the river gates. Come home and land.', VIEW.width / 2, 248);
    ctx.fillStyle = 'rgba(12,16,24,0.78)';
    roundRect(ctx, VIEW.width / 2 - 330, 282, 660, 218, 14);
    ctx.fill();
    ctx.fillStyle = '#e8eef4';
    ctx.font = '500 17px system-ui, sans-serif';
    const lines = [
      'SHIFT / R — throttle up      CTRL / F — throttle down',
      'Arrow keys or WASD — pitch and roll (mouse drag also steers)',
      'B — wheel brake      G — landing gear      P — pause',
      '',
      `Sortie 1: ${game.sortieName} — ${game.gates.length} gates, then land on the strip.`,
      'Centre a gate for bonus points. Land gently, on the centreline,',
      'with fuel to spare. A bent aeroplane scores nothing.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 322 + i * 25));
    ctx.fillStyle = '#69d97f';
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText('Press ENTER or SPACE to start the engine', VIEW.width / 2, 552);
  }

  drawCentredPanel(title, lines) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,12,20,0.5)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText(title, VIEW.width / 2, 330);
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillStyle = '#dbe6f2';
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 378 + i * 28));
  }

  drawResult(game, landed) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(8,12,20,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = landed ? '#69d97f' : '#ff6a55';
    ctx.font = '800 48px system-ui, sans-serif';
    ctx.fillText(landed ? 'DOWN AND SAFE' : 'AIRCRAFT DOWN', VIEW.width / 2, 268);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 21px system-ui, sans-serif';
    const lines = landed ? game.resultLines : [game.crashReason, ...game.resultLines];
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 322 + i * 30));
    ctx.fillStyle = '#ffd34d';
    ctx.font = '800 23px system-ui, sans-serif';
    ctx.fillText(landed ? 'Press ENTER for the next sortie' : 'Press ENTER to fly again', VIEW.width / 2, 322 + lines.length * 30 + 26);
  }
}

// ------------------------------------------------------------- helpers

function norm3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx, x, y, text, colour) {
  ctx.fillStyle = colour;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}
