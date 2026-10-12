// Sons sintetizados (WebAudio): vento, pássaros, rio, passos e bipes de menu
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.riverGain = null;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    // ruído base
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;
    const white = c.createBuffer(1, len, c.sampleRate), wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = white;
    // vento
    const wind = c.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0.0;
    wind.connect(wf).connect(wg).connect(this.master); wind.start();
    this.windGain = wg; this.windFilter = wf;
    // rio
    const rv = c.createBufferSource(); rv.buffer = white; rv.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 900;
    const rg = c.createGain(); rg.gain.value = 0;
    rv.connect(rf).connect(rg).connect(this.master); rv.start();
    this.riverGain = rg;
    this.ambience = false;
    this.nextBird = 3;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setAmbience(on) { this.ambience = on; }

  update(dt, t, riverDist = 999) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.ambience ? 0.16 + Math.sin(t * 0.13) * 0.06 + Math.sin(t * 0.41) * 0.03 : 0.05;
    this.windGain.gain.setTargetAtTime(target, now, 0.5);
    this.windFilter.frequency.setTargetAtTime(320 + Math.sin(t * 0.21) * 120, now, 0.5);
    const rgain = this.ambience ? Math.max(0, 1 - riverDist / 28) * 0.12 : 0;
    this.riverGain.gain.setTargetAtTime(rgain, now, 0.3);
    if (this.ambience) {
      this.nextBird -= dt;
      if (this.nextBird < 0) { this.bird(); this.nextBird = 4 + Math.random() * 9; }
    }
  }

  tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  menuMove() { this.tone(660, 0.06, 'square', 0.06); }
  menuOk() { this.tone(520, 0.08, 'square', 0.07); setTimeout(() => this.tone(1040, 0.14, 'square', 0.06), 70); }
  menuBack() { this.tone(330, 0.1, 'square', 0.06, -120); }

  bird() {
    const n = 2 + Math.floor(Math.random() * 4), base = 2200 + Math.random() * 1500;
    for (let i = 0; i < n; i++) setTimeout(() => this.tone(base + Math.random() * 600, 0.07, 'sine', 0.025, 500), i * 110);
  }

  step(surface = 'grass', run = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.white;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const cfg = { grass: [700, 'lowpass', 0.09, 0.07], leaves: [2600, 'highpass', 0.05, 0.1], stone: [1600, 'bandpass', 0.12, 0.05], wood: [500, 'bandpass', 0.16, 0.08] }[surface] || [900, 'lowpass', 0.08, 0.07];
    f.type = cfg[1]; f.frequency.value = cfg[0] * (0.9 + Math.random() * 0.2);
    const vol = cfg[2] * (run ? 1.3 : 1);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + cfg[3]);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, cfg[3] + 0.02);
  }
}
