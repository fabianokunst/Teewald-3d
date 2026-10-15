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
    // chuva: chiado largo + batidas graves (abafada nos interiores)
    const rn = c.createBufferSource(); rn.buffer = white; rn.loop = true;
    const rnf = c.createBiquadFilter(); rnf.type = 'bandpass'; rnf.frequency.value = 2400; rnf.Q.value = 0.35;
    const rnl = c.createBiquadFilter(); rnl.type = 'lowpass'; rnl.frequency.value = 9000;
    const rng = c.createGain(); rng.gain.value = 0;
    rn.connect(rnf).connect(rnl).connect(rng).connect(this.master); rn.start();
    this.rainGain = rng; this.rainLow = rnl;
    // tensão das lutas: baixo pulsando como batimento + cordas dissonantes no chefe
    const tg = c.createGain(); tg.gain.value = 0;
    const tl = c.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 220;
    const pulse = c.createGain(); pulse.gain.value = 0.5;
    const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 1.9; lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(pulse.gain); lfo.start();
    for (const f of [55, 58.27]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(tl); o.start(); }
    tl.connect(pulse).connect(tg).connect(this.master);
    const bg = c.createGain(); bg.gain.value = 0;
    const bl = c.createBiquadFilter(); bl.type = 'bandpass'; bl.frequency.value = 700; bl.Q.value = 0.8;
    const trem = c.createOscillator(), tremG = c.createGain(); trem.frequency.value = 7; tremG.gain.value = 0.35;
    const bmod = c.createGain(); bmod.gain.value = 0.6; trem.connect(tremG).connect(bmod.gain); trem.start();
    for (const f of [220, 233.08, 329.6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bl); o.start(); }
    bl.connect(bmod).connect(bg).connect(this.master);
    this.tensionGain = tg; this.bossGain = bg; this.lfo = lfo;
    this.tension = this.tension || { k: 0, boss: 0 };
    this.ambience = false;
    this.nextOmen = 6;
    this.nextCricket = 1;
    this.weather = this.weather || { rain: 0, storm: 0, night: 0, crickets: 0, wind: 0.2, indoor: 0 };
  }

  // tensão da música: k 0..1 (criaturas por perto), boss 0..1 (luta com chefe)
  setTension(k, boss = 0) { this.tension = { k, boss }; }

  // clima atual (world/atmosphere.js chama a cada quadro)
  setWeather(w) { this.weather = w; }

  // trovão: estalo seco (perto) e ronco grave que rola por segundos
  thunder(k = 1, indoor = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, v = k * (indoor ? 0.5 : 1);
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(indoor ? 260 : 900 * k, t); f.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 4.6);
    if (k > 0.8 && !indoor) {
      const s2 = c.createBufferSource(); s2.buffer = this.white;
      const f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 1200;
      const g2 = c.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      s2.connect(f2).connect(g2).connect(this.master); s2.start(t, 0, 0.4);
    }
  }

  // grilo: três trinados agudos
  cricket() {
    const c = this.ctx, t = c.currentTime, f = 4200 + Math.random() * 600, v = 0.006 + Math.random() * 0.006;
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.06);
    }
  }

  // coruja buraqueira ao longe: dois pios curtos
  owl() {
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'triangle'; const t0 = t + i * 0.32;
      o.frequency.setValueAtTime(620, t0); o.frequency.exponentialRampToValueAtTime(470, t0 + 0.22);
      f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.02, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      o.connect(f).connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.3);
    }
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
    const W = this.weather, inside = W.indoor > 0.5;
    const windK = (0.6 + W.wind * 1.6) * (inside ? 0.25 : 1);
    const target = this.ambience ? (0.2 + Math.sin(t * 0.09) * 0.08 + Math.sin(t * 0.37) * 0.04) * windK : 0.06;
    this.windGain.gain.setTargetAtTime(target, now, 0.5);
    this.windFilter.frequency.setTargetAtTime(320 + Math.sin(t * 0.21) * 120 + W.wind * 200, now, 0.5);
    const rgain = this.ambience && !inside ? Math.max(0, 1 - riverDist / 28) * 0.12 : 0;
    this.riverGain.gain.setTargetAtTime(rgain, now, 0.3);
    this.droneGain.gain.setTargetAtTime(this.ambience ? (0.07 + Math.sin(t * 0.06) * 0.03 + W.night * 0.03) * (1 - (W.calm || 0) * 0.6) : 0.035, now, 1.5);
    this.rainGain.gain.setTargetAtTime(this.ambience ? W.rain * (inside ? 0.06 : 0.13) : 0, now, 0.6);
    const Tn = this.tension || { k: 0, boss: 0 };
    this.tensionGain.gain.setTargetAtTime(this.ambience ? Tn.k * 0.07 : 0, now, Tn.k > 0.1 ? 0.4 : 2.5);
    this.bossGain.gain.setTargetAtTime(this.ambience ? Tn.boss * 0.012 : 0, now, Tn.boss > 0.1 ? 0.8 : 2.5);
    this.lfo.frequency.setTargetAtTime(1.6 + Tn.k * 0.9 + Tn.boss * 0.6, now, 1);
    this.rainLow.frequency.setTargetAtTime(inside ? 700 : 9000, now, 0.3);
    if (this.ambience) {
      this.nextOmen -= dt;
      if (this.nextOmen < 0) { this.omen(); this.nextOmen = (W.night > 0.5 ? 7 : 10) + Math.random() * 16; }
      // grilos nas noites sem chuva
      if (W.crickets > 0.05 && W.rain < 0.3 && !inside) {
        this.nextCricket -= dt * W.crickets;
        if (this.nextCricket < 0) { this.cricket(); this.nextCricket = 0.4 + Math.random() * 1.6; }
      }
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
    const r = Math.random(), W = this.weather || {};
    if (W.indoor > 0.5) { if (r < 0.5) this.bell(); return; }
    // de noite: coruja e uivos no lugar dos corvos
    if (W.night > 0.5) { if (r < 0.4) this.owl(); else if (r < 0.85) this.howl(); else this.bell(); return; }
    // tarde tranquila: só os corvos e o sino da igreja
    if (W.calm > 0.5) { if (r < 0.65) this.crow(); else this.bell(); return; }
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
    if (!this.ctx) return;
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
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; f.connect(this.master);
    for (const [m, v] of [[1, 0.03], [2.0, 0.014], [2.4, 0.01], [3.0, 0.007], [0.5, 0.012]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 196 * m;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 5 / Math.sqrt(m));
      o.connect(g).connect(f); o.start(t); o.stop(t + 5.2);
    }
  }

  // ruído filtrado curto (respingos e braçadas)
  _wash(t, dur, f0, f1, vol, type = 'bandpass', q = 0.9) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.white;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  // respingo: k = 0,5 passo na água rasa ... 2 mergulho
  splash(k = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.12 + 0.18 * k, 2600, 700, 0.07 + 0.06 * k);
    this._wash(t + 0.01, 0.06 + 0.06 * k, 420, 160, 0.05 + 0.05 * k, 'lowpass', 0.7);
    if (k > 1) this._wash(t + 0.08, 0.6, 1400, 500, 0.06, 'bandpass', 0.6);
  }

  // braçada: a água empurrada (k = 0 boiando ... 1 nadando rápido)
  stroke(k = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.4, 700, 1500, 0.035 + 0.04 * k, 'bandpass', 0.8);
    this._wash(t + 0.28, 0.16, 2200, 900, 0.025 + 0.035 * k);
  }

  step(surface = 'grass', run = false) {
    if (!this.ctx) return;
    if (surface === 'water') { this.splash(run ? 0.75 : 0.45); return; }
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
