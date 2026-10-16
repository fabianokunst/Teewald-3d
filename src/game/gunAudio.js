// Sons das armas e dos alvos, sintetizados com WebAudio (sem arquivos), usando o
// contexto e o ruído do Audio do jogo. Tiros e explosões vão para o barramento 'gun'
// (o mais alto da mixagem) e abaixam o ambiente por um instante; recarga, golpes e
// impactos vão para 'foley'; avisos de item para 'ui'. Níveis medidos com npm run sons.

// barramento do Audio (ou a saída antiga, se for um Audio sem barramentos)
const to = (a, name) => a.out ? a.out(name, null) : a.master;

// tau: em vez de cair até o fim de 'dur', o volume cai devagar (constante de tempo):
// corpo mais cheio, como o estrondo de um tiro
export function noise(a, t, dur, { type = 'lowpass', f = 1000, f1 = null, q = 0.7, vol = 0.3, attack = 0.001, tau = 0, out = null } = {}) {
  const c = a.ctx, src = c.createBufferSource();
  src.buffer = a.white;
  const flt = c.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  if (tau) { g.gain.setTargetAtTime(0, t + attack, tau); g.gain.setValueAtTime(0, t + dur); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(out || to(a, 'foley'));
  src.start(t, Math.random() * 4, dur + 0.05);
}

export function osc(a, t, dur, { type = 'sine', f = 440, f1 = null, vol = 0.1, attack = 0, out = null } = {}) {
  const c = a.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); }
  else g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || to(a, 'foley'));
  o.start(t); o.stop(t + dur + 0.05);
}

// volume pela distância até o jogador
const fall = d => Math.max(0, 1 - d / 90);

export const GunAudio = {
  ok(a) { return !!(a && a.ctx && a.white); },

  // eco do vale para os tiros: devolve o barramento (som seco + repetições abafadas)
  _echoBus(a, delay = 0.32, fbk = 0.32, wetK = 0.35) {
    const c = a.ctx, gun = to(a, 'gun');
    const dl = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter(), wet = c.createGain();
    dl.delayTime.value = delay; fb.gain.value = fbk; lp.type = 'lowpass'; lp.frequency.value = 1000; wet.gain.value = wetK;
    dl.connect(lp).connect(fb).connect(dl);
    lp.connect(wet).connect(gun);
    const bus = c.createGain(); bus.gain.value = 1;
    bus.connect(gun); bus.connect(dl);
    setTimeout(() => { try { bus.disconnect(); dl.disconnect(); lp.disconnect(); fb.disconnect(); wet.disconnect(); } catch (e) { /* já desligado */ } }, 3200);
    return bus;
  },

  // a cauda difusa: o vale devolvendo o estrondo
  _tail(a, t, vol, f = 1300, dur = 1.3) {
    noise(a, t + 0.03, dur, { f, f1: 240, vol, attack: 0.05, tau: dur * 0.22, out: to(a, 'gun') });
  },

  // pistola: estalo, estrondo e o soco grave
  shot(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, bus = this._echoBus(a, 0.32, 0.32, 0.45);
    a.duck?.(8, 0.12, 1.0);
    noise(a, t, 0.03, { type: 'highpass', f: 2500, vol: 0.4, out: bus });
    noise(a, t, 0.5, { f: 3600, f1: 420, vol: 0.62, tau: 0.085, out: bus });
    osc(a, t, 0.28, { f: 165, f1: 45, vol: 0.6, out: bus });
    this._tail(a, t, 0.16);
  },

  dry(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    noise(a, t, 0.03, { type: 'bandpass', f: 3500, q: 3, vol: 0.2 });
    osc(a, t, 0.02, { type: 'square', f: 1900, vol: 0.04 });
  },

  // partes da recarga: 'out' tira o pente, 'in' encaixa, 'slide' puxa o ferrolho
  reload(a, part) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    if (part === 'out') { noise(a, t, 0.05, { type: 'bandpass', f: 1800, q: 2, vol: 0.2 }); osc(a, t, 0.04, { type: 'triangle', f: 900, vol: 0.06 }); }
    if (part === 'in') { noise(a, t, 0.06, { type: 'bandpass', f: 1200, q: 2, vol: 0.28 }); noise(a, t + 0.05, 0.04, { type: 'bandpass', f: 2600, q: 3, vol: 0.18 }); }
    if (part === 'slide') { noise(a, t, 0.08, { type: 'bandpass', f: 2200, f1: 1400, q: 2, vol: 0.22 }); noise(a, t + 0.11, 0.05, { type: 'bandpass', f: 3000, q: 3, vol: 0.25 }); }
  },

  equip(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    noise(a, t, 0.04, { type: 'bandpass', f: 2400, q: 3, vol: 0.16 });
    noise(a, t + 0.09, 0.05, { type: 'bandpass', f: 1500, q: 2, vol: 0.18 });
  },

  casing(a, d = 0) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, v = 0.03 * fall(d * 3);
    if (v <= 0) return;
    osc(a, t, 0.07, { f: 4200 + Math.random() * 900, vol: v });
    osc(a, t + 0.09, 0.05, { f: 3900 + Math.random() * 900, vol: v * 0.6 });
  },

  can(a, d = 0) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, v = fall(d);
    osc(a, t, 0.3, { type: 'triangle', f: 1450 + Math.random() * 200, vol: 0.07 * v });
    osc(a, t, 0.22, { f: 2350 + Math.random() * 300, vol: 0.04 * v });
    noise(a, t, 0.05, { type: 'highpass', f: 2500, vol: 0.1 * v });
  },

  canBounce(a, d = 0, k = 1) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, v = fall(d) * k;
    if (v < 0.05) return;
    osc(a, t, 0.12, { type: 'triangle', f: 1200 + Math.random() * 400, vol: 0.035 * v });
  },

  glass(a, d = 0) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, v = fall(d);
    noise(a, t, 0.3, { type: 'highpass', f: 3000, vol: 0.2 * v });
    for (let i = 0; i < 5; i++) osc(a, t + Math.random() * 0.12, 0.08, { f: 3000 + Math.random() * 3500, vol: 0.035 * v });
  },

  // impacto em superfície: 'wall' | 'wood' | 'metal' | 'dirt' | 'road' | 'water'
  impact(a, surface, d = 0) {
    if (!this.ok(a)) return;
    const v = fall(d);
    if (v <= 0) return;
    // o som chega um pouco depois do tiro, conforme a distância
    const t = a.ctx.currentTime + Math.min(0.25, d / 340);
    if (surface === 'water') { noise(a, t, 0.25, { f: 1800, f1: 400, vol: 0.2 * v }); return; }
    if (surface === 'metal') {
      osc(a, t, 0.15, { type: 'triangle', f: 2100, vol: 0.05 * v });
      if (Math.random() < 0.6) osc(a, t + 0.02, 0.4, { f: 2700, f1: 900, vol: 0.04 * v });   // ricochete
    }
    const f = { wall: 900, wood: 650, metal: 1800, dirt: 380, road: 1200 }[surface] || 700;
    noise(a, t, 0.08, { type: 'bandpass', f, q: 1.2, vol: 0.26 * v });
  },

  pickup(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, out = to(a, 'ui');
    osc(a, t, 0.08, { type: 'square', f: 660, vol: 0.04, attack: 0.004, out });
    osc(a, t + 0.08, 0.08, { type: 'square', f: 880, vol: 0.04, attack: 0.004, out });
    osc(a, t + 0.16, 0.16, { type: 'square', f: 1320, vol: 0.04, attack: 0.004, out });
  },

  ding(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, out = to(a, 'ui');
    osc(a, t, 0.5, { type: 'triangle', f: 1320, vol: 0.05, attack: 0.004, out });
    osc(a, t + 0.12, 0.6, { type: 'triangle', f: 1760, vol: 0.04, attack: 0.004, out });
  },

  // jogador ferido (o mesmo de combat.hurt)
  hurt(a) { a?.hurtSound?.(); },

  // espingarda: estrondo grave e longo
  shotgun(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, bus = this._echoBus(a, 0.38, 0.36, 0.45);
    a.duck?.(10, 0.18, 1.4);
    noise(a, t, 0.05, { type: 'highpass', f: 2000, vol: 0.4, out: bus });
    noise(a, t, 0.8, { f: 2600, f1: 220, vol: 0.75, tau: 0.12, out: bus });
    osc(a, t, 0.36, { f: 115, f1: 32, vol: 0.75, out: bus });
    this._tail(a, t, 0.2, 1100, 1.8);
  },
  // abrir a espingarda e enfiar os cartuchos
  breakOpen(a, part) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    if (part === 'open') { noise(a, t, 0.06, { type: 'bandpass', f: 1300, q: 2, vol: 0.26 }); osc(a, t, 0.05, { type: 'triangle', f: 600, vol: 0.07 }); }
    if (part === 'shell') noise(a, t, 0.05, { type: 'bandpass', f: 900, q: 3, vol: 0.22 });
    if (part === 'close') { noise(a, t, 0.05, { type: 'bandpass', f: 2200, q: 2, vol: 0.3 }); noise(a, t + 0.04, 0.04, { type: 'bandpass', f: 1500, q: 3, vol: 0.2 }); }
  },
  // revólver: estalo seco
  revolver(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, bus = this._echoBus(a, 0.3, 0.3, 0.42);
    a.duck?.(8, 0.12, 1.0);
    noise(a, t, 0.025, { type: 'highpass', f: 3200, vol: 0.45, out: bus });
    noise(a, t, 0.45, { f: 4400, f1: 600, vol: 0.62, tau: 0.075, out: bus });
    osc(a, t, 0.2, { f: 200, f1: 52, vol: 0.5, out: bus });
    osc(a, t, 0.05, { type: 'square', f: 2600, f1: 1200, vol: 0.06, out: bus });
    this._tail(a, t, 0.15, 1500);
  },
  // raio: zumbido que desce, com chiado
  ray(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, out = to(a, 'gun');
    a.duck?.(4, 0.1, 0.6);
    osc(a, t, 0.35, { type: 'sawtooth', f: 1800, f1: 160, vol: 0.14, out });
    osc(a, t, 0.3, { type: 'square', f: 900, f1: 90, vol: 0.08, out });
    noise(a, t, 0.2, { type: 'bandpass', f: 3000, f1: 800, q: 2, vol: 0.2, out });
  },
  rayHit(a, d = 0) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, v = fall(d);
    if (v <= 0) return;
    noise(a, t, 0.25, { type: 'bandpass', f: 1600, f1: 300, q: 1.5, vol: 0.2 * v });
    osc(a, t, 0.2, { type: 'triangle', f: 500, f1: 80, vol: 0.08 * v });
  },
  // dardo: sopro de ar comprimido
  dart(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, out = to(a, 'gun');
    noise(a, t, 0.14, { type: 'bandpass', f: 1400, f1: 700, q: 1, vol: 0.45, out });
    osc(a, t, 0.05, { type: 'triangle', f: 300, vol: 0.12, out });
  },
  // lampião: chama soprando e crepitando
  flame(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    noise(a, t, 0.18, { type: 'bandpass', f: 700 + Math.random() * 300, q: 0.8, vol: 0.08 });
    if (Math.random() < 0.4) noise(a, t + Math.random() * 0.1, 0.02, { type: 'highpass', f: 3000, vol: 0.08 });
  },
  // golpe no ar
  swing(a, heavy = false) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    noise(a, t, heavy ? 0.24 : 0.14, { type: 'bandpass', f: heavy ? 500 : 900, f1: heavy ? 1500 : 2400, q: 1.2, vol: heavy ? 0.22 : 0.15, attack: 0.04 });
  },
  // golpe acertando: 'punch' | 'wood' | 'metal' | 'blade' | 'stone'
  thump(a, kind = 'punch', k = 1) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    if (kind === 'metal') { osc(a, t, 0.25, { type: 'triangle', f: 1300, f1: 900, vol: 0.07 * k }); noise(a, t, 0.08, { f: 1600, vol: 0.32 * k }); }
    else if (kind === 'blade') { noise(a, t, 0.12, { type: 'highpass', f: 2200, vol: 0.24 * k }); noise(a, t, 0.1, { f: 500, vol: 0.28 * k }); }
    else if (kind === 'wood') { noise(a, t, 0.09, { type: 'bandpass', f: 600, q: 1.5, vol: 0.45 * k }); osc(a, t, 0.08, { f: 180, f1: 90, vol: 0.22 * k }); }
    else if (kind === 'stone') { noise(a, t, 0.1, { type: 'bandpass', f: 900, q: 1, vol: 0.38 * k }); }
    else { noise(a, t, 0.08, { f: 700, vol: 0.42 * k }); osc(a, t, 0.1, { f: 140, f1: 60, vol: 0.3 * k }); }
  },
  // arma branca quebrando
  breakWeapon(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    noise(a, t, 0.18, { type: 'bandpass', f: 1200, q: 0.8, vol: 0.35 });
    noise(a, t + 0.05, 0.12, { type: 'highpass', f: 2500, vol: 0.18 });
  },
  // explosão de dinamite: estalo, ronco e eco
  explosion(a, d = 0) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime, v = Math.max(0.15, 1 - d / 140), bus = this._echoBus(a, 0.45, 0.42, 0.5);
    a.duck?.(12 * v, 0.3, 2);
    noise(a, t, 1.6, { f: 1800, f1: 60, vol: 0.85 * v, tau: 0.3, out: bus });
    noise(a, t, 0.1, { type: 'highpass', f: 1500, vol: 0.4 * v, out: bus });
    osc(a, t, 0.8, { f: 70, f1: 22, vol: 0.85 * v, out: bus });
    this._tail(a, t, 0.16 * v, 900, 2.4);
  },
  // pavio aceso
  fuse(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    noise(a, t, 0.5, { type: 'highpass', f: 3500, vol: 0.06, attack: 0.05 });
  },
};
