// Sons sintetizados (WebAudio): vento, zumbido grave, rio, passos, bipes de menu e
// os sinais ao longe (corvos, cachorro uivando, um toque de sino)
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.riverGain = null;
  }

  start() {
    if (this.ctx) { if (!this.paused) this.resume(); return; }
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
    // zumbido grave que pulsa devagar (quase não se ouve, mas pesa)
    const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 160;
    const dg = c.createGain(); dg.gain.value = 0;
    for (const [f, type] of [[48, 'sine'], [48.6, 'sine'], [71.7, 'triangle']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(df); o.start();
    }
    df.connect(dg).connect(this.master);
    this.droneGain = dg;
    this.ambience = false;
    this.nextOmen = 6;
  }

  // app em segundo plano: silencia; ao voltar, retoma (no iOS pode precisar de um toque)
  suspend() { this.paused = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setAmbience(on) { this.ambience = on; }

  update(dt, t, riverDist = 999) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // vento em rajadas mais longas e frias
    const target = this.ambience ? 0.2 + Math.sin(t * 0.09) * 0.08 + Math.sin(t * 0.37) * 0.04 : 0.06;
    this.windGain.gain.setTargetAtTime(target, now, 0.5);
    this.windFilter.frequency.setTargetAtTime(320 + Math.sin(t * 0.21) * 120, now, 0.5);
    const rgain = this.ambience ? Math.max(0, 1 - riverDist / 28) * 0.12 : 0;
    this.riverGain.gain.setTargetAtTime(rgain, now, 0.3);
    this.droneGain.gain.setTargetAtTime(this.ambience ? 0.07 + Math.sin(t * 0.06) * 0.03 : 0.035, now, 1.5);
    if (this.ambience) {
      this.nextOmen -= dt;
      if (this.nextOmen < 0) { this.omen(); this.nextOmen = 10 + Math.random() * 16; }
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

  menuMove() { this.tone(294, 0.08, 'triangle', 0.08); }
  menuOk() { this.tone(220, 0.12, 'triangle', 0.09); setTimeout(() => this.tone(147, 0.3, 'triangle', 0.08), 90); }
  menuBack() { this.tone(196, 0.16, 'triangle', 0.07, -70); }

  // um som ao longe, de vez em quando
  omen() {
    const r = Math.random();
    if (r < 0.5) this.crow(); else if (r < 0.82) this.howl(); else this.bell();
  }

  // corvo: dois ou três grasnados ásperos
  crow() {
    const n = 2 + Math.floor(Math.random() * 2), base = 380 + Math.random() * 140;
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.3, t); o.frequency.exponentialRampToValueAtTime(base * 0.75, t + 0.24);
      f.type = 'bandpass'; f.frequency.value = 1050; f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.32);
    }, i * (330 + Math.random() * 120));
  }

  // cachorro uivando longe (sobe, segura e cai, com tremido)
  howl() {
    const c = this.ctx, t = c.currentTime, k = 0.85 + Math.random() * 0.3;
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(360 * k, t); o.frequency.linearRampToValueAtTime(560 * k, t + 0.9);
    o.frequency.linearRampToValueAtTime(530 * k, t + 2.0); o.frequency.linearRampToValueAtTime(320 * k, t + 2.9);
    lfo.frequency.value = 5.5; lg.gain.value = 9; lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 0.6);
    g.gain.linearRampToValueAtTime(0.018, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 3.0);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + 3.1); lfo.stop(t + 3.1);
  }

  // uma badalada do sino da igreja, abafada pela neblina
  bell() {
    const c = this.ctx, t = c.currentTime;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; f.connect(this.master);
    for (const [m, v] of [[1, 0.03], [2.0, 0.014], [2.4, 0.01], [3.0, 0.007], [0.5, 0.012]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 196 * m;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 5 / Math.sqrt(m));
      o.connect(g).connect(f); o.start(t); o.stop(t + 5.2);
    }
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
