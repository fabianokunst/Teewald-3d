// Sons sintetizados (WebAudio): vento, zumbido grave, rio, chuva, passos, bipes de menu,
// os bichos da cidade (quero-quero, bem-te-vi, pombas, sapos, grilos) e os sinais ao
// longe (corvos, cachorros, o sino da igreja).
//
// Mixagem: cada som entra num barramento (MIX). Os barramentos somam, passam por um
// limitador (nada estoura) e pelo volume do menu. O ambiente e a música abaixam um
// instante quando a arma dispara (duck), para o tiro sobressair. Os níveis foram medidos
// com `npm run sons` (tools/sons.mjs): mexeu aqui, meça de novo.

// ganho de cada barramento, em dB
const MIX = {
  gun: 0,         // tiros e explosões: o som mais alto do jogo
  foley: 0,       // recarga, golpes, impactos, cápsulas, o jogador ferido
  creatures: -4,  // vozes e ataques das criaturas
  steps: 0,       // passos e água do jogador
  amb: 0,         // camada contínua: vento, rio, chuva, zumbido, grilos, sapos
  omen: 0,        // sinais e bichos ao longe: corvos, cachorros, pássaros, rangidos
  bell: -2,       // o sino da igreja
  music: 0,       // tensão das lutas
  fx: 0,          // o resto (corujas, telefones, banda fantasma...): o antigo a.master
  ui: 0,          // menus, avisos e bipes de fala
};
const DUCKED = ['amb', 'omen', 'music'];   // abaixam quando a arma dispara
const db = v => Math.pow(10, v / 20);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

// passos: baque do calcanhar + textura do chão (filtro, freq., Q, volume, duração)
const STEP = {
  grass: { heel: [380, 0.08, 0.07], tex: ['bandpass', 1500, 0.6, 0.027, 0.1] },
  leaves: { heel: [340, 0.045, 0.07], tex: ['bandpass', 2800, 0.5, 0.016, 0.13], crackle: 0.007 },
  stone: { heel: [520, 0.1, 0.05], tex: ['bandpass', 2300, 1.1, 0.03, 0.045] },
  wood: { heel: [240, 0.05, 0.09], tex: ['bandpass', 1050, 1.8, 0.012, 0.05], hollow: 0.015 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.riverGain = null;
    this.at = null;      // de onde vem o som da criatura que está pensando agora (pan)
    this.lis = null;     // ouvinte: posição e lado direito da câmera
  }

  start() {
    if (this.ctx) { if (!this.paused) this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    // saída: soma -> limitador -> volume do menu
    this.out_ = c.createGain(); this.out_.gain.value = Math.min(1, this.volume * 1.25); this.out_.connect(c.destination);
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -5; lim.knee.value = 3; lim.ratio.value = 16; lim.attack.value = 0.002; lim.release.value = 0.2;
    lim.connect(this.out_);
    this.mix = c.createGain(); this.mix.connect(lim);
    this.duckG = c.createGain(); this.duckG.connect(this.mix);
    this.bus = {};
    for (const k in MIX) {
      const g = c.createGain(); g.gain.value = db(MIX[k]);
      g.connect(DUCKED.includes(k) ? this.duckG : this.mix);
      this.bus[k] = g;
    }
    this.master = this.bus.fx;   // quem liga direto em a.master cai no barramento geral
    // ruídos base (6 s, para o laço não se notar): marrom (vento, trovão) e branco
    const len = c.sampleRate * 6;
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.noise = buf;
    const white = c.createBuffer(1, len, c.sampleRate), wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = white;
    const loop = (b, rate = 1, off = 0) => { const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(0, off); return s; };
    const amb = this.bus.amb;
    // vento: duas correntes descorrelacionadas, uma de cada lado
    this.winds = [[-0.65, 0.97, 0], [0.65, 1.03, 2.7]].map(([pan, rate, off]) => {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0;
      loop(buf, rate, off).connect(f).connect(g).connect(this._route(pan, amb));
      return { f, g };
    });
    // folhas chiando nas rajadas
    const lf = c.createBiquadFilter(); lf.type = 'bandpass'; lf.frequency.value = 5200; lf.Q.value = 0.5;
    const lg = c.createGain(); lg.gain.value = 0;
    loop(white, 1, 1.3).connect(lf).connect(lg).connect(amb);
    this.leafGain = lg;
    // rio: chiado grave + borbulho (o volume treme devagar)
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 800;
    const rb = c.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 2400; rb.Q.value = 0.7;
    const rbg = c.createGain(); rbg.gain.value = 0.35;
    const rlfo = c.createOscillator(), rlg = c.createGain(); rlfo.frequency.value = 3.3; rlg.gain.value = 0.2; rlfo.connect(rlg).connect(rbg.gain); rlfo.start();
    const rg = c.createGain(); rg.gain.value = 0;
    const rv = loop(white, 1, 3.1); rv.connect(rf).connect(rg); rv.connect(rb).connect(rbg).connect(rg);
    rg.connect(amb);
    this.riverGain = rg;
    // zumbido grave que pulsa devagar (quase não se ouve, mas pesa); o 143 Hz chega nas caixinhas pequenas
    const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 170;
    const dg = c.createGain(); dg.gain.value = 0;
    for (const [f, type, v] of [[48, 'sine', 1], [48.6, 'sine', 1], [71.7, 'triangle', 0.8], [143.4, 'sine', 0.25]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f; og.gain.value = v; o.connect(og).connect(df); o.start();
    }
    df.connect(dg).connect(amb);
    this.droneGain = dg;
    // chuva: chiado largo dos dois lados (abafada nos interiores)
    const rnl = c.createBiquadFilter(); rnl.type = 'lowpass'; rnl.frequency.value = 9000;
    for (const [pan, off] of [[-0.5, 0.4], [0.5, 4.2]]) {
      const rnf = c.createBiquadFilter(); rnf.type = 'bandpass'; rnf.frequency.value = 2400; rnf.Q.value = 0.35;
      loop(white, 1, off).connect(rnf).connect(this._route(pan, rnl));
    }
    const rng = c.createGain(); rng.gain.value = 0;
    rnl.connect(rng).connect(amb);
    this.rainGain = rng; this.rainLow = rnl;
    // tensão das lutas: baixo pulsando como batimento + cordas dissonantes no chefe
    const music = this.bus.music;
    const tg = c.createGain(); tg.gain.value = 0;
    const tl = c.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 260;
    const pulse = c.createGain(); pulse.gain.value = 0.5;
    const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 1.9; lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(pulse.gain); lfo.start();
    for (const f of [55, 58.27, 110]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(tl); o.start(); }
    tl.connect(pulse).connect(tg).connect(music);
    const bg = c.createGain(); bg.gain.value = 0;
    const bl = c.createBiquadFilter(); bl.type = 'bandpass'; bl.frequency.value = 700; bl.Q.value = 0.8;
    const trem = c.createOscillator(), tremG = c.createGain(); trem.frequency.value = 7; tremG.gain.value = 0.35;
    const bmod = c.createGain(); bmod.gain.value = 0.6; trem.connect(tremG).connect(bmod.gain); trem.start();
    for (const [f, pan] of [[220, -0.4], [233.08, 0.4], [329.6, 0]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(this._route(pan, bl)); o.start(); }
    bl.connect(bmod).connect(bg).connect(music);
    this.tensionGain = tg; this.bossGain = bg; this.lfo = lfo;
    this.tension = this.tension || { k: 0, boss: 0 };
    this.ambience = false;
    this.nextOmen = 6;
    this.nextCricket = 1;
    this.nextBird = 4;
    this.nextFrog = 1;
    this.weather = this.weather || { rain: 0, storm: 0, night: 0, crickets: 0, wind: 0.2, indoor: 0 };
  }

  // ---------- roteamento ----------

  // nó que leva ao destino com pan (-1 esquerda ... 1 direita)
  _route(pan, dest) {
    if (!pan || !this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(dest);
    return p;
  }

  // destino de um som: o barramento, puxado para o lado de onde vem. at = { x, z } da
  // origem; nas criaturas vale a que está pensando agora (this.at, posto por base.js)
  out(name = 'fx', at) {
    const b = this.bus?.[name] || this.master;
    const p = at !== undefined ? at : (name === 'creatures' ? this.at : null);
    return p ? this._route(this.panOf(p.x, p.z), b) : b;
  }

  // lado de um ponto para o ouvinte: perto fica no meio, longe vai para o lado
  panOf(x, z) {
    const L = this.lis;
    if (!L) return 0;
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return 0;
    return (dx * L.rx + dz * L.rz) / d * Math.min(1, d / 6) * 0.8;
  }

  // ouvinte (main.js chama a cada quadro): posição, câmera (para o lado direito),
  // a igreja (o sino) e onde está: null na rua, 'igreja' ou 'casa'
  listen(p, cam = null, church = null, inside = null) {
    const L = this.lis || (this.lis = { x: 0, z: 0, rx: 1, rz: 0, ox: 0, oz: 0 });
    L.x = p.x; L.z = p.z;
    const e = cam?.matrixWorld?.elements;
    if (e) { const l = Math.hypot(e[0], e[2]) || 1; L.rx = e[0] / l; L.rz = e[2] / l; }
    if (!inside) { L.ox = p.x; L.oz = p.z; }   // a última posição na rua (de onde se ouve o sino)
    this.church = church; this.inside = inside;
  }

  // abaixa o ambiente e a música por um instante (tiros, explosões)
  duck(dB = 6, hold = 0.08, release = 0.8) {
    if (!this.ctx) return;
    const g = this.duckG.gain, t = this.ctx.currentTime, k = db(-dB), cur = g.value;
    g.cancelScheduledValues(t); g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(Math.min(cur, k), t + 0.012);
    g.setTargetAtTime(1, t + 0.012 + hold, release / 3);
  }

  // saída de um som ao longe: abafado (lp Hz) e de um lado
  _far(pan = rnd(-0.8, 0.8), lp = 2400, bus = 'omen') {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    f.connect(this._route(pan, this.bus[bus]));
    return f;
  }

  // tensão da música: k 0..1 (criaturas por perto), boss 0..1 (luta com chefe)
  setTension(k, boss = 0) { this.tension = { k, boss }; }

  // clima atual (world/atmosphere.js chama a cada quadro)
  setWeather(w) { this.weather = w; }

  // trovão: estalo seco (perto) e ronco grave que rola por segundos
  thunder(k = 1, indoor = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, v = k * (indoor ? 0.5 : 1);
    const out = this._route(rnd(-0.5, 0.5), this.bus.amb);
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(indoor ? 260 : 900 * k, t); f.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random(), 4.6);
    if (k > 0.8 && !indoor) {
      const s2 = c.createBufferSource(); s2.buffer = this.white;
      const f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 1200;
      const g2 = c.createGain(); g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      s2.connect(f2).connect(g2).connect(out); s2.start(t, 0, 0.4);
    }
  }

  // grilo: três trinados agudos
  cricket() {
    const c = this.ctx, t = c.currentTime, f = 4200 + Math.random() * 600, v = 0.014 + Math.random() * 0.012;
    const out = this._route(rnd(-0.9, 0.9), this.bus.amb);
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.06);
    }
  }

  // coruja buraqueira ao longe: dois pios curtos
  owl() {
    const c = this.ctx, t = c.currentTime, out = this._far(undefined, 1400);
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; const t0 = t + i * 0.32;
      o.frequency.setValueAtTime(620, t0); o.frequency.exponentialRampToValueAtTime(470, t0 + 0.22);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.038, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.3);
    }
  }

  // app em segundo plano: silencia; ao voltar, retoma (no iOS pode precisar de um toque)
  suspend() { this.paused = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
  }

  // o menu manda até 0,8; com o limitador segurando os picos, o volume máximo vai a 1
  setVolume(v) { this.volume = v; if (this.out_) this.out_.gain.value = Math.min(1, v * 1.25); }

  setAmbience(on) { this.ambience = on; }

  update(dt, t, riverDist = 999) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const W = this.weather, inside = W.indoor > 0.5, A = this.ambience;
    // vento em rajadas longas; cada lado respira num tempo
    const windK = (0.6 + W.wind * 1.6) * (inside ? 0.22 : 1);
    const gust = clamp(0.5 + Math.sin(t * 0.11 + 1) * 0.3 + Math.sin(t * 0.29) * 0.2 + Math.sin(t * 0.73) * 0.1, 0, 1);
    this.winds.forEach((w, i) => {
      const own = 0.85 + Math.sin(t * (0.17 + i * 0.06) + i * 2) * 0.15;
      w.g.gain.setTargetAtTime(A ? (0.036 + gust * 0.032) * own * windK : 0.016, now, 0.5);
      w.f.frequency.setTargetAtTime(300 + gust * 160 + W.wind * 220 + i * 40, now, 0.5);
    });
    this.leafGain.gain.setTargetAtTime(A && !inside ? Math.max(0, gust - 0.45) * (0.2 + W.wind) * 0.006 : 0, now, 0.6);
    const rgain = A && !inside ? Math.pow(Math.max(0, 1 - riverDist / 30), 1.5) * 0.06 : 0;
    this.riverGain.gain.setTargetAtTime(rgain, now, 0.3);
    this.droneGain.gain.setTargetAtTime(A ? (0.017 + Math.sin(t * 0.06) * 0.006 + W.night * 0.007) * (1 - (W.calm || 0) * 0.6) * (inside ? 0.45 : 1) : 0.01, now, 1.5);
    this.rainGain.gain.setTargetAtTime(A ? W.rain * (inside ? 0.024 : 0.034) : 0, now, 0.6);
    const Tn = this.tension || { k: 0, boss: 0 };
    this.tensionGain.gain.setTargetAtTime(A ? Tn.k * 0.026 : 0, now, Tn.k > 0.1 ? 0.4 : 2.5);
    this.bossGain.gain.setTargetAtTime(A ? Tn.boss * 0.007 : 0, now, Tn.boss > 0.1 ? 0.8 : 2.5);
    this.lfo.frequency.setTargetAtTime(1.6 + Tn.k * 0.9 + Tn.boss * 0.6, now, 1);
    this.rainLow.frequency.setTargetAtTime(inside ? 700 : 9000, now, 0.3);
    if (!A) return;
    this.nextOmen -= dt;
    if (this.nextOmen < 0) { this.omen(); this.nextOmen = (W.night > 0.5 ? 7 : 10) + Math.random() * 16; }
    // grilos nas noites sem chuva
    if (W.crickets > 0.05 && W.rain < 0.3 && !inside) {
      this.nextCricket -= dt * W.crickets;
      if (this.nextCricket < 0) { this.cricket(); this.nextCricket = 0.4 + Math.random() * 1.6; }
    }
    // pássaros de dia (quero-quero, bem-te-vi, pombas), nunca na chuva nem dentro de casa
    if (!inside && W.night < 0.4 && W.rain < 0.3) {
      this.nextBird -= dt;
      if (this.nextBird < 0) { this.bird(); this.nextBird = 7 + Math.random() * 14; }
    }
    // sapos perto da água, de noite ou com chuva
    const frogs = !inside && (W.night > 0.5 || W.rain > 0.3) ? Math.max(0, 1 - riverDist / 60) : 0;
    if (frogs > 0) {
      this.nextFrog -= dt * frogs;
      if (this.nextFrog < 0) { this.frog(0.35 + frogs * 0.65); this.nextFrog = 0.25 + Math.random() * 1.4; }
    }
  }

  // tom simples (bipes, avisos); delay em segundos
  tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus.ui); o.start(t); o.stop(t + dur + 0.02);
  }

  menuMove() { this.tone(294, 0.08, 'triangle', 0.08); }
  menuOk() { this.tone(220, 0.12, 'triangle', 0.09); this.tone(147, 0.3, 'triangle', 0.08, 0, 0.09); }
  menuBack() { this.tone(196, 0.16, 'triangle', 0.07, -70); }

  // jogador ferido: gemido curto e pancada no corpo
  hurtSound() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, out = this.bus.foley;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.065, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    this._wash(t, 0.1, 600, 300, 0.11, 'lowpass', 0.7, out, 0.004);
    const b = c.createOscillator(), bg = c.createGain();
    b.frequency.setValueAtTime(130, t); b.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.1, t + 0.006); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    b.connect(bg).connect(out); b.start(t); b.stop(t + 0.15);
  }

  // um som ao longe, de vez em quando
  omen() {
    const r = Math.random(), W = this.weather || {};
    // dentro de casa: a madeira range; o sino só de vez em quando, abafado
    if (W.indoor > 0.5) { if (r < 0.5) this.creak(); else if (r < 0.65) this.bell(0.6); return; }
    // de noite: coruja e uivos no lugar dos corvos
    if (W.night > 0.5) { if (r < 0.35) this.owl(); else if (r < 0.75) this.howl(); else if (r < 0.88) this.dogBark(); else this.bell(0.6); return; }
    // tarde tranquila: corvos, um cachorro, o sino
    if (W.calm > 0.5) { if (r < 0.55) this.crow(); else if (r < 0.82) this.dogBark(); else this.bell(0.6); return; }
    if (r < 0.45) this.crow(); else if (r < 0.68) this.howl(); else if (r < 0.88) this.dogBark(); else this.bell(0.6);
  }

  // corvo: dois ou três grasnados ásperos
  crow() {
    if (!this.ctx) return;
    const c = this.ctx, n = 2 + Math.floor(Math.random() * 2), base = 380 + Math.random() * 140, out = this._far(undefined, 3000);
    let t = c.currentTime;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.3, t); o.frequency.exponentialRampToValueAtTime(base * 0.75, t + 0.24);
      f.type = 'bandpass'; f.frequency.value = 1050; f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.32);
      t += 0.33 + Math.random() * 0.12;
    }
  }

  // cachorro uivando longe (sobe, segura e cai, com tremido)
  howl() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, k = 0.85 + Math.random() * 0.3, out = this._far(undefined, 900);
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(360 * k, t); o.frequency.linearRampToValueAtTime(560 * k, t + 0.9);
    o.frequency.linearRampToValueAtTime(530 * k, t + 2.0); o.frequency.linearRampToValueAtTime(320 * k, t + 2.9);
    lfo.frequency.value = 5.5; lg.gain.value = 9; lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016, t + 0.6);
    g.gain.linearRampToValueAtTime(0.013, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 3.0);
    o.connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(t + 3.1); lfo.stop(t + 3.1);
  }

  // cachorro latindo num quintal longe: "au, au... au"
  dogBark() {
    if (!this.ctx) return;
    const c = this.ctx, n = 2 + Math.floor(Math.random() * 3), p = rnd(0.85, 1.2), out = this._far(undefined, 1600);
    let t = c.currentTime;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(420 * p, t); o.frequency.exponentialRampToValueAtTime(260 * p, t + 0.14);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.18);
      this._wash(t, 0.12, 900 * p, 700 * p, 0.05, 'bandpass', 1.5, out, 0.01);
      t += (i % 2 ? 0.55 : 0.24) + Math.random() * 0.12;
    }
  }

  // pássaros de dia, ao longe
  bird() {
    if (!this.ctx) return;
    const r = Math.random(), W = this.weather || {};
    if (W.calm > 0.5 && r < 0.3) return this.dove();
    if (r < 0.4) this.queroQuero(); else if (r < 0.75) this.bemTeVi(); else this.dove();
  }

  // quero-quero: "kéh-kéh-kéh" metálico, às vezes respondido por outro
  queroQuero(again = true) {
    const c = this.ctx, out = this._far(undefined, 4200), n = 3 + Math.floor(Math.random() * 5), f0 = rnd(2300, 2700);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 1.1; bp.Q.value = 2.5; bp.connect(out);
    let t = c.currentTime;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.12, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.82, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(bp); o.start(t); o.stop(t + 0.1);
      t += rnd(0.12, 0.17);
    }
    if (again && Math.random() < 0.4) setTimeout(() => this.ctx && this.queroQuero(false), (t - c.currentTime + rnd(0.2, 0.6)) * 1000);
  }

  // bem-te-vi: "bem-te-VIII"
  bemTeVi() {
    const c = this.ctx, out = this._far(undefined, 5000), k = rnd(0.93, 1.07);
    let t = c.currentTime;
    for (const [f, f1, dur, v, gap] of [[1650, 1500, 0.11, 0.03, 0.17], [2050, 1900, 0.07, 0.025, 0.12], [1700, 2500, 0.32, 0.035, 0]]) {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
      o.type = 'sine'; o2.type = 'sine';
      o.frequency.setValueAtTime(f * k, t); o.frequency.exponentialRampToValueAtTime(f1 * k, t + dur);
      o2.frequency.setValueAtTime(f * k * 2, t); o2.frequency.exponentialRampToValueAtTime(f1 * k * 2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g2.gain.value = 0.25;
      o.connect(g).connect(out); o2.connect(g2).connect(g);
      o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
      t += dur + gap;
    }
  }

  // pomba-asa-branca: "hu-huuu-hu" grave e manso
  dove() {
    const c = this.ctx, out = this._far(undefined, 1200), f = rnd(400, 470);
    let t = c.currentTime;
    for (const [dur, k, gap] of [[0.2, 1, 0.12], [0.45, 1.08, 0.18], [0.22, 0.95, 0]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f * k, t); o.frequency.exponentialRampToValueAtTime(f * k * 0.9, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.034, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
      t += dur + gap;
    }
  }

  // sapo coaxando na beira d'água (k = perto)
  frog(k = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, f = rnd(110, 260), dur = rnd(0.12, 0.3), out = this._far(undefined, 1800, 'amb');
    const o = c.createOscillator(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), bp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
    lfo.type = 'square'; lfo.frequency.value = rnd(22, 40); lg.gain.value = 0.5; am.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    bp.type = 'bandpass'; bp.frequency.value = rnd(600, 1000); bp.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(am).connect(bp).connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  }

  // dentro de casa: a madeira range devagar
  creak() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = rnd(0.5, 1.1), f = rnd(70, 120), out = this._far(undefined, 1600);
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), bp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rnd(0.8, 1.3), t + dur);
    lfo.frequency.value = rnd(9, 16); lg.gain.value = f * 0.25; lfo.connect(lg).connect(o.frequency);
    bp.type = 'bandpass'; bp.frequency.value = rnd(700, 1200); bp.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  }

  // uma badalada do sino da igreja. k = força (as badaladas soltas, ao longe, são mais
  // fracas). O volume e o abafado vêm da distância até a torre; dentro de casa, bem
  // abafado; dentro da igreja, o sino está logo acima.
  bell(k = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, L = this.lis, ch = this.church;
    let d = 90, pan = 0;
    if (this.inside === 'igreja') d = 18;
    else if (L && ch) { d = Math.max(16, Math.hypot(L.ox - ch.x, L.oz - ch.z)); if (!this.inside) pan = this.panOf(ch.x, ch.z) * 0.7; }
    let v = k * Math.max(0.12, Math.min(1, Math.pow(20 / d, 0.75)));
    let lp = 700 + 3800 * Math.pow(clamp(1 - d / 350, 0, 1), 2);
    if (this.inside === 'casa') { v *= 0.4; lp = 480; }
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = c.createGain(); g.gain.value = v;
    f.connect(g).connect(this._route(pan, this.bus.bell));
    // parciais de um sino de bronze: hum, fundamental, terça menor, quinta, oitava...
    // cada uma com um gêmeo desafinado (o batimento que faz o sino "ondular")
    for (const [m, a, dec] of [[0.5, 0.5, 9], [1, 1, 6], [1.19, 0.5, 4.5], [1.5, 0.28, 3.5], [2, 0.55, 3], [2.5, 0.18, 2], [3, 0.2, 1.5]]) {
      for (const det of [0, rnd(0.6, 1.6)]) {
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sine'; o.frequency.value = 196 * m + det;
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(a * 0.016, t + 0.005);
        og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(og).connect(f); o.start(t); o.stop(t + dec + 0.05);
      }
    }
    this._wash(t, 0.06, 2600, 1800, 0.05, 'bandpass', 1.2, f, 0.002);   // a batida do badalo
  }

  // ruído filtrado curto (respingos, braçadas, passos)
  _wash(t, dur, f0, f1, vol, type = 'bandpass', q = 0.9, out = this.bus.steps, attack = 0) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.white;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || Math.min(0.03, dur * 0.3)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 5, dur + 0.02);
  }

  // respingo: k = 0,5 passo na água rasa ... 2 mergulho
  splash(k = 1, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.12 + 0.18 * k, 2600, 700, (0.03 + 0.05 * k) * vol);
    this._wash(t + 0.01, 0.06 + 0.06 * k, 420, 160, (0.03 + 0.05 * k) * vol, 'lowpass', 0.7);
    if (k > 1) this._wash(t + 0.08, 0.6, 1400, 500, 0.06, 'bandpass', 0.6);
  }

  // braçada: a água empurrada (k = 0 boiando ... 1 nadando rápido)
  stroke(k = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._wash(t, 0.4, 700, 1500, 0.025 + 0.03 * k, 'bandpass', 0.8);
    this._wash(t + 0.28, 0.16, 2200, 900, 0.018 + 0.025 * k);
  }

  // passo: baque macio do calcanhar e a textura do chão, sem estalo no começo
  step(surface = 'grass', run = false) {
    if (!this.ctx) return;
    if (surface === 'water') { this.splash(run ? 0.6 : 0.38, 0.4); return; }
    const S = STEP[surface] || STEP.grass, t = this.ctx.currentTime;
    const k = (run ? 1.28 : 1) * rnd(0.85, 1.1), r = rnd(0.9, 1.1);
    const [hf, hv, hd] = S.heel, [type, tf, q, tv, td] = S.tex;
    this._wash(t, hd, hf * r, hf * 0.6 * r, hv * k, 'lowpass', 0.7, undefined, 0.006);
    this._wash(t + 0.012, td, tf * r, tf * 0.75 * r, tv * k, type, q, undefined, 0.008);
    if (S.crackle) for (let i = 0; i < 2; i++) this._wash(t + rnd(0.02, 0.09), 0.025, rnd(3500, 5500), 3000, S.crackle * k, 'bandpass', 2, undefined, 0.003);
    if (S.hollow) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(rnd(105, 125), t); o.frequency.exponentialRampToValueAtTime(80, t + 0.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(S.hollow * k, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(this.bus.steps); o.start(t); o.stop(t + 0.13);
    }
  }
}
