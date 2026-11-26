// Skyharbor Run — procedural sound, no audio files.
// A WebAudio engine hum whose pitch and roughness follow the throttle, a
// soft wind wash that grows with speed, and short blips for gates and the
// touchdown chirp. Everything is synthesised; the context only starts
// after a user gesture, as browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(c.destination);

      // Engine: two detuned saws through a low-pass, plus a sub sine.
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineFilter = filter;
      this.oscA = c.createOscillator();
      this.oscA.type = 'sawtooth';
      this.oscB = c.createOscillator();
      this.oscB.type = 'sawtooth';
      this.oscB.detune.value = 9;
      this.sub = c.createOscillator();
      this.sub.type = 'sine';
      this.oscA.connect(filter);
      this.oscB.connect(filter);
      this.sub.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.oscA.start();
      this.oscB.start();
      this.sub.start();

      // Wind: looped noise buffer through a band-pass.
      const len = c.sampleRate * 1.2;
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      this.wind = c.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      this.windGain = c.createGain();
      this.windGain.gain.value = 0;
      this.wind.connect(band);
      band.connect(this.windGain);
      this.windGain.connect(this.master);
      this.wind.start();
      this.started = true;
    } catch (err) {
      this.ctx = null;
      void err;
    }
  }

  update(p) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + p.throttle * 95;
    this.oscA.frequency.setTargetAtTime(rpm, t, 0.08);
    this.oscB.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);
    this.sub.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + p.throttle * 700, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.1 + p.throttle * 0.3, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.4, p.speed * 0.004), t, 0.15);
  }

  blip(freq, seconds = 0.16, gain = 0.3) {
    if (!this.started || !this.ctx) return;
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + seconds);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(c.currentTime + seconds + 0.02);
  }

  gateChime() {
    this.blip(880, 0.14, 0.28);
    setTimeout(() => this.blip(1318, 0.2, 0.28), 70);
  }

  thud() {
    this.blip(72, 0.3, 0.5);
  }
}
