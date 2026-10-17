// Sons do carro, sintetizados (WebAudio) como o resto do jogo:
// - motor V8 grande: dente de serra na frequência das explosões (rpm / 15), uma onda na
//   metade (o "galope" da marcha lenta), um grave por baixo e o chiado da admissão, tudo
//   saturado e filtrado (o filtro abre com o acelerador); marcha lenta balança devagar
// - partida (motor de arranque), desligar, troca de marcha
// - rodando: pneu cantando, ronco do asfalto, trepidação do paralelepípedo, cascalho e
//   capim na terra, vento na velocidade, chuva batendo no teto (de dentro)
// - buzina dupla, portas (trinco, rangido, batida), batidas e atropelos
// Tudo no barramento 'car' (audio.js); fora do carro o som vem do lado dele e cai com a distância.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CarAudio {
  constructor(audio) {
    this.a = audio;
    this.ok = false;
    this.horning = false;
  }

  _init() {
    const A = this.a, c = A.ctx;
    if (!c || this.ok) return !!c;
    this.ok = true;
    const out = this.out = c.createGain();
    out.gain.value = 1;
    this.pan = c.createStereoPanner ? c.createStereoPanner() : null;
    this.far = c.createBiquadFilter(); this.far.type = 'lowpass'; this.far.frequency.value = 18000;
    out.connect(this.far);
    if (this.pan) this.far.connect(this.pan).connect(A.bus.car); else this.far.connect(A.bus.car);
    const loop = (b, rate = 1, off = 0) => { const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(0, off); return s; };
    // ---- motor ----
    const eng = this.eng = c.createGain(); eng.gain.value = 0;
    const lp = this.engLP = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.4;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    const sum = c.createGain(); sum.gain.value = 0.55;
    sum.connect(shaper).connect(lp).connect(eng);
    // balanço da marcha lenta: o volume sobe e desce no tempo do comando
    const am = this.am = c.createGain(); am.gain.value = 1;
    eng.connect(am).connect(out);
    const lfo = this.lfo = c.createOscillator(); lfo.frequency.value = 3;
    const lfoG = this.lfoG = c.createGain(); lfoG.gain.value = 0;
    lfo.connect(lfoG).connect(am.gain); lfo.start();
    const osc = (type, g) => { const o = c.createOscillator(); o.type = type; const gg = c.createGain(); gg.gain.value = g; o.connect(gg).connect(sum); o.start(); return o; };
    this.o1 = osc('sawtooth', 0.6);
    this.o2 = osc('square', 0.28);
    this.o3 = osc('sine', 0.9);
    const nb = this.intakeF = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 400; nb.Q.value = 1.1;
    const ng = this.intakeG = c.createGain(); ng.gain.value = 0;
    loop(A.white, 1, 0.7).connect(nb).connect(ng).connect(sum);
    // ---- rodando ----
    const mk = (src, type, f, q, rate = 1, off = 0) => {
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      loop(src, rate, off).connect(fl).connect(g).connect(out);
      return { f: fl, g };
    };
    this.skid = mk(A.white, 'bandpass', 2300, 3.2, 1, 1.9);
    this.road = mk(A.noise, 'lowpass', 260, 0.7, 1, 2.2);
    this.wind = mk(A.white, 'highpass', 1900, 0.5, 1, 3.1);
    this.gravel = mk(A.white, 'bandpass', 1100, 0.6, 1, 4.4);
    this.rainRoof = mk(A.white, 'bandpass', 3600, 0.6, 1, 0.3);
    // paralelepípedo: ronco grave que treme no ritmo das pedras
    const sett = this.sett = mk(A.noise, 'bandpass', 150, 0.8, 1, 5.1);
    const trem = this.trem = c.createOscillator(); trem.type = 'square'; trem.frequency.value = 20;
    const tremG = this.tremG = c.createGain(); tremG.gain.value = 0;
    trem.connect(tremG).connect(sett.g.gain); trem.start();
    // ---- buzina: dois tons graves ----
    const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 900; hf.Q.value = 0.8;
    const hg = this.hornG = c.createGain(); hg.gain.value = 0;
    for (const f of [352, 440]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(hg).connect(out);
    return true;
  }

  // s = { on, rpm, load, speed, skid, surface, inside, x, z, rain, crank }
  update(dt, s) {
    if (!this._init()) return;
    const A = this.a, c = A.ctx, now = c.currentTime, T = 0.04;
    // fora do carro: cai com a distância, abafa e vem do lado dele
    const L = A.lis, d = s.inside || !L ? 0 : Math.hypot(s.x - L.x, s.z - L.z);
    const fall = s.inside ? 1 : 1 / Math.pow(1 + d / 7, 1.35);
    this.out.gain.setTargetAtTime(fall, now, 0.08);
    this.far.frequency.setTargetAtTime(s.inside ? 9000 : clamp(14000 / (1 + d / 12), 700, 12000), now, 0.1);
    if (this.pan) this.pan.pan.setTargetAtTime(s.inside ? 0 : A.panOf(s.x, s.z), now, 0.08);
    // motor
    const on = s.on || s.crank > 0, rpm = Math.max(1, s.rpm), F = rpm / 15, load = clamp(s.load, 0, 1);
    this.o1.frequency.setTargetAtTime(F, now, T);
    this.o2.frequency.setTargetAtTime(F * 0.5, now, T);
    this.o3.frequency.setTargetAtTime(F * 0.5, now, T);
    this.intakeF.frequency.setTargetAtTime(F * 4, now, T);
    this.intakeG.gain.setTargetAtTime(on ? 0.05 + load * 0.35 : 0, now, 0.05);
    this.engLP.frequency.setTargetAtTime(220 + load * 1500 + rpm * 0.22, now, 0.05);
    const idle = clamp(1 - (rpm - 700) / 700, 0, 1);
    const vol = on ? (0.07 + load * 0.075 + clamp((rpm - 800) / 4000, 0, 1) * 0.04) * (s.inside ? 0.8 : 1) : 0;
    this.eng.gain.setTargetAtTime(vol, now, s.on ? 0.06 : 0.25);
    this.lfo.frequency.setTargetAtTime(F / 4, now, T);
    this.lfoG.gain.setTargetAtTime(on ? idle * 0.32 + 0.04 : 0, now, 0.1);
    // rodando
    const v = Math.abs(s.speed), paved = s.surface === 'asphalt' || s.surface === 'concrete' || s.surface === 'walk';
    const loose = s.surface === 'dirt' || s.surface === 'grass' || s.surface === 'leaves';
    this.skid.g.gain.setTargetAtTime(paved || s.surface === 'sett' ? clamp(s.skid, 0, 1) * 0.06 : 0, now, 0.05);
    this.skid.f.frequency.setTargetAtTime(2100 + clamp(s.skid, 0, 1) * 500, now, 0.1);
    this.road.g.gain.setTargetAtTime(clamp(v / 25, 0, 1) * (paved ? 0.06 : 0.04), now, 0.1);
    this.road.f.frequency.setTargetAtTime(180 + v * 12, now, 0.1);
    const st = s.surface === 'sett' ? clamp(v / 14, 0, 1) : 0;
    this.sett.g.gain.setTargetAtTime(st * 0.05, now, 0.08);
    this.tremG.gain.setTargetAtTime(st * 0.04, now, 0.08);
    this.trem.frequency.setTargetAtTime(clamp(v * 7, 4, 90), now, 0.08);
    this.gravel.g.gain.setTargetAtTime(loose ? clamp(v / 12, 0, 1) * 0.035 + clamp(s.skid, 0, 1) * 0.03 : 0, now, 0.08);
    this.wind.g.gain.setTargetAtTime(Math.pow(clamp(v / 32, 0, 1), 2) * (s.inside ? 0.012 : 0.02), now, 0.15);
    this.rainRoof.g.gain.setTargetAtTime(s.inside ? clamp(s.rain, 0, 1) * 0.022 : 0, now, 0.3);
  }

  // motor de arranque: o pistão comprimindo, umas voltas e ele pega (ou não)
  crank(dur = 0.7) {
    if (!this._init()) return;
    const A = this.a, c = A.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + dur);
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
    g.gain.setValueAtTime(0.05, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pump = c.createOscillator(), pg = c.createGain();
    pump.type = 'square'; pump.frequency.value = 9.5; pg.gain.value = 0.03;
    pump.connect(pg).connect(g.gain);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); pump.start(t); o.stop(t + dur + 0.05); pump.stop(t + dur + 0.05);
    for (let i = 0; i < dur * 9.5; i++) A._wash(t + i / 9.5, 0.06, 500, 260, 0.025, 'lowpass', 0.8, this.out, 0.008);
    // a chave girando no miolo
    A._wash(t - 0.02, 0.05, 4200, 3000, 0.03, 'bandpass', 3, this.out, 0.003);
  }

  // desligou: o motor tosse e para
  stop() {
    if (!this._init()) return;
    const A = this.a, t = A.ctx.currentTime;
    A._wash(t, 0.25, 260, 90, 0.08, 'lowpass', 0.8, this.out, 0.01);
    A._wash(t + 0.02, 0.05, 4000, 3000, 0.025, 'bandpass', 3, this.out, 0.003);
  }

  shift() {
    if (!this._init()) return;
    const A = this.a, t = A.ctx.currentTime;
    A._wash(t, 0.08, 300, 140, 0.03, 'lowpass', 0.8, this.out, 0.005);
  }

  // porta: abrindo (trinco + rangido) ou batendo
  door(open) {
    if (!this._init()) return;
    const A = this.a, c = A.ctx, t = c.currentTime, out = this.out;
    if (open) {
      A._wash(t, 0.035, 3800, 2600, 0.05, 'bandpass', 2.2, out, 0.002);
      A._wash(t + 0.03, 0.12, 900, 400, 0.03, 'lowpass', 0.7, out, 0.01);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(560, t + 0.08); o.frequency.exponentialRampToValueAtTime(330, t + 0.45);
      g.gain.setValueAtTime(0.0001, t + 0.08); g.gain.exponentialRampToValueAtTime(0.008, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
      o.connect(g).connect(out); o.start(t + 0.08); o.stop(t + 0.5);
    } else {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(100, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.26);
      A._wash(t, 0.16, 800, 180, 0.14, 'lowpass', 0.8, out, 0.003);
      A._wash(t + 0.015, 0.03, 3600, 2800, 0.045, 'bandpass', 2.5, out, 0.002);
    }
  }

  horn(on) {
    if (!this._init() || on === this.horning) return;
    this.horning = on;
    const t = this.a.ctx.currentTime, g = this.hornG.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0.07 : 0, t, on ? 0.01 : 0.03);
  }

  // batida (k = 0..1+): lataria amassando, o metal soando e, forte, vidro
  crash(k = 1) {
    if (!this._init()) return;
    const A = this.a, c = A.ctx, t = c.currentTime, out = this.out;
    k = clamp(k, 0.2, 1.4);
    A._wash(t, 0.3 + 0.3 * k, 1600, 220, 0.12 + 0.16 * k, 'lowpass', 0.7, out, 0.003);
    A._wash(t + 0.01, 0.15, 3000, 900, 0.05 * k, 'bandpass', 1.2, out, 0.003);
    for (const f of [612, 1130, 1790]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * (0.95 + Math.random() * 0.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 * k, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35 + 0.3 * k);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.8);
    }
    if (k > 0.85) for (let i = 0; i < 5; i++) A._wash(t + 0.03 + Math.random() * 0.25, 0.05, 6000 + Math.random() * 2500, 4500, 0.02, 'highpass', 1, out, 0.002);
  }

  // atropelou um bicho: pancada surda e o estalo molhado
  thud(k = 1) {
    if (!this._init()) return;
    const A = this.a, c = A.ctx, t = c.currentTime, out = this.out;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * clamp(k, 0.3, 1.2), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    A._wash(t, 0.2, 700, 180, 0.12 * k, 'bandpass', 0.9, out, 0.004);
    A._wash(t + 0.03, 0.12, 1400, 600, 0.04 * k, 'bandpass', 1.4, out, 0.004);
  }

  // empurrãozinho num morador ou num poste devagar
  bump(k = 0.4) {
    if (!this._init()) return;
    const A = this.a, t = A.ctx.currentTime;
    A._wash(t, 0.12, 500, 160, 0.06 * k + 0.02, 'lowpass', 0.8, this.out, 0.004);
  }

  // pneu caindo do meio-fio, pouso depois de um pulo
  clunk(k = 0.5) {
    if (!this._init()) return;
    const A = this.a, t = A.ctx.currentTime;
    A._wash(t, 0.14, 420, 120, 0.05 + 0.1 * clamp(k, 0, 1), 'lowpass', 0.8, this.out, 0.004);
    if (k > 0.5) A._wash(t + 0.02, 0.1, 2400, 1200, 0.02 * k, 'bandpass', 2, this.out, 0.003);
  }
}
