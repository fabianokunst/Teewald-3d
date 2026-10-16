// Sons das criaturas, sintetizados com WebAudio (sem arquivos). Volume cai com a
// distância (d em metros). Cada função recebe o Audio do jogo. Tudo vai para o
// barramento 'creatures', puxado para o lado da criatura que está pensando (a.at).

// saída padrão (o Audio antigo, sem barramentos, só tinha a.master)
const dest = a => a.out ? a.out('creatures') : a.master;

function noise(a, t, dur, { type = 'lowpass', f = 1000, f1 = null, q = 0.8, vol = 0.2, attack = 0.005, out = null } = {}) {
  const c = a.ctx, src = c.createBufferSource();
  src.buffer = a.white;
  const flt = c.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(out || dest(a));
  src.start(t, Math.random() * 1.5, dur + 0.05);
}

function tone(a, t, dur, { type = 'sawtooth', f = 440, f1 = null, fMid = null, vol = 0.1, attack = 0.01, vib = 0, vibF = 0, out = null } = {}) {
  const c = a.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (fMid) o.frequency.exponentialRampToValueAtTime(fMid, t + dur * 0.3);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (vib) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = vibF || 26 + Math.random() * 8; lg.gain.value = vib;
    l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || dest(a));
  o.start(t); o.stop(t + dur + 0.05);
}

const ok = a => !!(a && a.ctx && a.white);
const fall = (d, r = 70) => Math.max(0, 1 - d / r);

export const SFX = {
  // cão: rosnado grave e áspero
  growl(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.9, { f: 80 * p, f1: 62 * p, vol: 0.12 * v, attack: 0.1, vib: 14 });
    noise(a, t, 0.85, { f: 420 * p, q: 2.5, vol: 0.16 * v, attack: 0.1 });
  },
  bark(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.16, { type: 'square', f: 360 * p, f1: 180 * p, vol: 0.08 * v, attack: 0.01 });
    noise(a, t, 0.14, { type: 'bandpass', f: 900 * p, q: 1.5, vol: 0.2 * v });
  },
  yelp(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.25, { type: 'triangle', f: 900 * p, f1: 500 * p, vol: 0.1 * v });
    noise(a, t, 0.1, { type: 'bandpass', f: 1500, vol: 0.1 * v });
  },
  // fogo: chiado e estalos
  fire(a, d = 0) {
    if (!ok(a) || fall(d, 30) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 30);
    noise(a, t, 0.3, { type: 'bandpass', f: 600, q: 0.7, vol: 0.06 * v, attack: 0.05 });
    if (Math.random() < 0.5) noise(a, t + Math.random() * 0.2, 0.02, { type: 'highpass', f: 3500, vol: 0.1 * v });
  },
  // brasa caindo na água: chiado longo de vapor
  hiss(a, d = 0) {
    if (!ok(a) || fall(d, 50) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 50);
    noise(a, t, 1.3, { type: 'highpass', f: 5200, f1: 1600, q: 0.6, vol: 0.2 * v, attack: 0.02 });
    noise(a, t, 0.5, { type: 'bandpass', f: 900, f1: 300, q: 0.8, vol: 0.12 * v });
    for (let i = 0; i < 4; i++) noise(a, t + 0.05 + Math.random() * 0.5, 0.02, { type: 'highpass', f: 3000, vol: 0.08 * v });
  },
  // morcego: guincho agudo e bater de asas
  screech(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.4, { f: 2600 * p, fMid: 3800 * p, f1: 2200 * p, vol: 0.05 * v, vib: 200 });
    noise(a, t, 0.3, { type: 'bandpass', f: 4000, q: 3, vol: 0.06 * v });
  },
  flap(a, d = 0, k = 1) {
    if (!ok(a) || fall(d, 35) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 35) * k;
    noise(a, t, 0.12, { f: 380, q: 0.6, vol: 0.14 * v, attack: 0.02 });
  },
  // fantasma: lamento que sobe e desce, com eco
  wail(a, d = 0, p = 1, dur = 2.2) {
    if (!ok(a) || fall(d, 60) <= 0) return;
    const c = a.ctx, t = c.currentTime, v = fall(d, 60);
    const dl = c.createDelay(1), fb = c.createGain(), wet = c.createGain();
    dl.delayTime.value = 0.28; fb.gain.value = 0.45; wet.gain.value = 0.5;
    dl.connect(fb).connect(dl); dl.connect(wet).connect(dest(a));
    tone(a, t, dur, { type: 'sine', f: 420 * p, fMid: 620 * p, f1: 300 * p, vol: 0.045 * v, attack: 0.4, vib: 9, vibF: 5, out: dl });
    tone(a, t, dur, { type: 'sine', f: 423 * p, fMid: 610 * p, f1: 305 * p, vol: 0.04 * v, attack: 0.4, vib: 7, vibF: 4 });
    noise(a, t, dur, { type: 'bandpass', f: 900 * p, q: 4, vol: 0.03 * v, attack: 0.5 });
    setTimeout(() => { try { dl.disconnect(); fb.disconnect(); wet.disconnect(); } catch (e) { /* ignora */ } }, (dur + 3) * 1000);
  },
  // choro baixinho (a moça da fábrica)
  sob(a, d = 0) {
    if (!ok(a) || fall(d, 40) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 40);
    for (let i = 0; i < 3; i++) tone(a, t + i * 0.32, 0.26, { type: 'triangle', f: 520 - i * 25, f1: 380, vol: 0.035 * v, attack: 0.04, vib: 12, vibF: 7 });
  },
  // sussurro (fantasmas falando)
  whisper(a, d = 0) {
    if (!ok(a) || fall(d, 30) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 30);
    for (let i = 0; i < 4; i++) noise(a, t + i * 0.18 + Math.random() * 0.08, 0.15, { type: 'bandpass', f: 1800 + Math.random() * 1600, q: 5, vol: 0.05 * v, attack: 0.03 });
  },
  // rugido grande (a fera)
  roar(a, d = 0, p = 1, dur = 1.6) {
    if (!ok(a) || fall(d, 120) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 120);
    tone(a, t, dur, { f: 70 * p, fMid: 110 * p, f1: 45 * p, vol: 0.14 * v, attack: 0.15, vib: 18 });
    tone(a, t, dur, { type: 'square', f: 140 * p, fMid: 200 * p, f1: 80 * p, vol: 0.04 * v, attack: 0.2, vib: 25 });
    noise(a, t, dur, { f: 600 * p, f1: 250, q: 1.5, vol: 0.19 * v, attack: 0.15 });
  },
  stomp(a, d = 0, k = 1) {
    if (!ok(a) || fall(d, 80) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 80) * k;
    tone(a, t, 0.3, { type: 'sine', f: 60, f1: 30, vol: 0.2 * v, attack: 0.004 });
    noise(a, t, 0.2, { f: 250, vol: 0.16 * v });
  },
  // lobisomem: uivo longo
  howl(a, d = 0, p = 1) {
    if (!ok(a) || fall(d, 140) <= 0) return;
    const c = a.ctx, t = c.currentTime, v = fall(d, 140);
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(280 * p, t); o.frequency.linearRampToValueAtTime(520 * p, t + 0.8);
    o.frequency.linearRampToValueAtTime(500 * p, t + 2.2); o.frequency.linearRampToValueAtTime(260 * p, t + 3.2);
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.5);
    g.gain.linearRampToValueAtTime(0.07 * v, t + 2.5); g.gain.linearRampToValueAtTime(0.0001, t + 3.3);
    o.connect(f).connect(g).connect(dest(a)); o.start(t); o.stop(t + 3.4);
  },
  snarl(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.5, { f: 130 * p, f1: 90 * p, vol: 0.12 * v, attack: 0.03, vib: 30 });
    noise(a, t, 0.45, { type: 'bandpass', f: 1200 * p, q: 1.5, vol: 0.18 * v, attack: 0.03 });
  },
  // ET: trinados metálicos e o zumbido psíquico
  chirp(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    for (let i = 0; i < 3; i++) tone(a, t + i * 0.09, 0.08, { type: 'square', f: (1200 + Math.random() * 900) * p, f1: (700 + Math.random() * 400) * p, vol: 0.03 * v });
  },
  psychic(a, d = 0) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.8, { type: 'sine', f: 180, f1: 900, vol: 0.06 * v, attack: 0.3, vib: 40, vibF: 12 });
    tone(a, t, 0.8, { type: 'sine', f: 183, f1: 905, vol: 0.05 * v, attack: 0.3 });
  },
  // nave: ronco grave pulsando
  ufo(a, d = 0, dur = 3) {
    if (!ok(a) || fall(d, 200) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 200);
    tone(a, t, dur, { type: 'sine', f: 55, f1: 60, vol: 0.09 * v, attack: 0.6, vib: 6, vibF: 3 });
    tone(a, t, dur, { type: 'triangle', f: 110, f1: 118, vol: 0.05 * v, attack: 0.6, vib: 8, vibF: 4 });
  },
  // bruxa: risada que cai, rouca
  cackle(a, d = 0) {
    if (!ok(a) || fall(d, 150) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 150);
    for (let i = 0; i < 7; i++) {
      const f = 620 - i * 40 + Math.random() * 30;
      tone(a, t + i * 0.13, 0.11, { type: 'sawtooth', f, f1: f * 0.75, vol: 0.06 * v, attack: 0.01 });
      noise(a, t + i * 0.13, 0.1, { type: 'bandpass', f: 1500, q: 2, vol: 0.06 * v });
    }
  },
  spell(a, d = 0) {
    if (!ok(a) || fall(d, 90) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 90);
    tone(a, t, 0.9, { type: 'triangle', f: 200, f1: 1400, vol: 0.06 * v, attack: 0.2, vib: 30 });
    noise(a, t, 0.9, { type: 'bandpass', f: 600, f1: 3000, q: 3, vol: 0.08 * v, attack: 0.2 });
  },
  whoosh(a, d = 0) {
    if (!ok(a) || fall(d) <= 0) return;
    noise(a, a.ctx.currentTime, 0.35, { type: 'bandpass', f: 500, f1: 1800, q: 1, vol: 0.12 * fall(d), attack: 0.08 });
  },
  // golpe pesado no chão (ondas de choque)
  quake(a, d = 0) {
    if (!ok(a) || fall(d, 100) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 100);
    tone(a, t, 0.8, { type: 'sine', f: 45, f1: 25, vol: 0.22 * v, attack: 0.006 });
    noise(a, t, 0.7, { f: 300, f1: 80, vol: 0.22 * v });
  },
  // vitória curta (criatura derrotada) e sino de alerta
  sting(a) {
    if (!ok(a)) return;
    const t = a.ctx.currentTime;
    [110, 130.8, 164.8].forEach(f => tone(a, t, 2.4, { type: 'triangle', f, vol: 0.06, attack: 0.05 }));
    tone(a, t, 1.6, { type: 'sine', f: 1244, f1: 940, vol: 0.016 });
  },
};

export { noise, tone, fall, dest };
