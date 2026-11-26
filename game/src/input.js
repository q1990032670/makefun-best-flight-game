// Skyharbor Run — keyboard and mouse input.
// Keys are tracked as a held-set; the axes the flight model reads are derived
// from that set each frame, and the mouse can steer when it is held down and
// dragged, which gives players without a feel for the keys a second way in.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys that went down since the last frame
    this.mouseDown = false;
    this.mouseX = 0.5; // normalised 0..1 across the canvas
    this.mouseY = 0.5;
    this.canvas = canvas;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const code = normaliseCode(event);
      this.keys.add(code);
      this.pressed.add(code);
      if (HANDLED.has(code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(normaliseCode(event));
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    canvas.addEventListener('mousedown', (event) => {
      this.mouseDown = true;
      this.updateMouse(event);
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (event) => {
      this.updateMouse(event);
    });
    canvas.addEventListener('touchstart', (event) => {
      this.mouseDown = true;
      if (event.touches.length > 0) this.updateMouse(event.touches[0]);
      event.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (event) => {
      if (event.touches.length > 0) this.updateMouse(event.touches[0]);
      event.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => {
      this.mouseDown = false;
    });
  }

  updateMouse(event) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, rect.width);
    const py = (event.clientY - rect.top) / Math.max(1, rect.height);
    this.mouseX = Math.min(1, Math.max(0, px));
    this.mouseY = Math.min(1, Math.max(0, py));
  }

  held(code) {
    return this.keys.has(code);
  }

  /** True once per physical press; reading it consumes the press. */
  tapped(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  /**
   * The four control axes in -1..1 (throttle is 0..1 handled separately).
   * Arrow keys and WASD both work; holding the mouse blends its position in.
   */
  axes() {
    let pitch = 0;
    let roll = 0;
    if (this.held('up') || this.held('w')) pitch -= 1; // push nose down
    if (this.held('down') || this.held('s')) pitch += 1; // pull nose up
    if (this.held('left') || this.held('a')) roll -= 1;
    if (this.held('right') || this.held('d')) roll += 1;
    if (this.mouseDown) {
      const mx = (this.mouseX - 0.5) * 2;
      const my = (this.mouseY - 0.5) * 2;
      roll = clampUnit(roll + mx * 0.9);
      pitch = clampUnit(pitch + my * 0.9);
    }
    return { pitch, roll };
  }

  throttleDelta() {
    let delta = 0;
    if (this.held('shift')) delta += 1;
    if (this.held('control')) delta -= 1;
    if (this.held('r')) delta += 1;
    if (this.held('f')) delta -= 1;
    return delta;
  }
}

const HANDLED = new Set([
  'up', 'down', 'left', 'right', 'space', 'shift', 'control',
  'w', 'a', 's', 'd', 'r', 'f', 'b', 'p', 'enter',
]);

function normaliseCode(event) {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return 'shift';
  if (event.code === 'ControlLeft' || event.code === 'ControlRight') return 'control';
  if (event.code === 'Space') return 'space';
  if (event.code === 'Enter') return 'enter';
  if (event.code === 'KeyP' || event.code === 'Escape') return 'p';
  if (event.code === 'KeyB') return 'b';
  if (event.code === 'KeyR') return 'r';
  if (event.code === 'KeyF') return 'f';
  if (event.code === 'KeyG') return 'g';
  if (event.code.startsWith('Arrow')) return event.code.slice(5).toLowerCase();
  if (event.code.startsWith('Key')) return event.code.slice(3).toLowerCase();
  return event.key.toLowerCase();
}

function clampUnit(value) {
  return Math.min(1, Math.max(-1, value));
}
