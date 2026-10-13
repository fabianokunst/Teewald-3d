import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, joint, mix3, lerp, clamp, wrapA, damp, TAU } from './shapes.js';
import { SFX, noise, tone, fall } from './sfx.js';
import { ps1Material, ensureColor } from '../../engine/ps1material.js';
import { makeCanvas, canvasTex, processPixels } from '../../engine/textures.js';

// ETs de Varginha (o caso de 1996 que saiu no Fantástico e todo mundo lembra):
// bichinhos de 1,2 m, pele marrom oleosa, cabeção com três calombos e olhos
// vermelhos enormes. Andam em bando, de lado, e jogam orbes psíquicos pelas mãos.
// Quando apanham, piscam e somem para o lado. O chefe (O VISITANTE) é alto, cinza
// arroxeado, com colar de metal verde, escudo psíquico, onda de choque e chama os
// pequenos. E o disco voador, cenário das noites de tempestade (e da nave caída).

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

// ---------- texturas ----------
const TEX = {};
const rng = s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// pele lisa e oleosa: manchas suaves, rugas finas e pontos de brilho
function oilyTex() {
  if (TEX.skin) return TEX.skin;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rng(31);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const mott = Math.sin(x * 0.4 + Math.sin(y * 0.3) * 2) * Math.cos(y * 0.39 + x * 0.1);
    const wr = Math.abs(Math.sin(y * 1.1 + Math.sin(x * 0.45) * 1.6)) < 0.13 ? 1 : 0;
    let v = 196 + mott * 22 + R() * 14 - wr * 38;
    if (mott > 0.72) v += 34;
    d.data[i] = clamp(v, 0, 255); d.data[i + 1] = clamp(v * 0.97, 0, 255); d.data[i + 2] = clamp(v * 0.93, 0, 255); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TEX.skin = canvasTex(processPixels(c), true));
}

// brilho redondo (halo das luzes do disco)
function glowTex() {
  if (TEX.glow) return TEX.glow;
  const c = makeCanvas(32, 32), g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  rg.addColorStop(0.45, 'rgba(255,255,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  return (TEX.glow = t);
}

// riscos verticais (raio da nave, rola para baixo)
function streakTex() {
  if (TEX.streak) return TEX.streak;
  const c = makeCanvas(32, 64), g = c.getContext('2d'), d = g.createImageData(32, 64), R = rng(77);
  const col = []; for (let x = 0; x < 32; x++) col.push(0.25 + R() * 0.75);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const v = 255 * col[x] * (0.55 + 0.45 * Math.sin(y * 0.2 + x * 1.7 + Math.sin(y * 0.05) * 3));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = clamp(v, 30, 255); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TEX.streak = canvasTex(c, true));
}

// favos do escudo psíquico
function hexTex() {
  if (TEX.hex) return TEX.hex;
  const c = makeCanvas(64, 64), g = c.getContext('2d'), d = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4;
    const row = Math.floor(y / 8), xx = (x + (row % 2) * 4) % 8, yy = y % 8;
    const edge = xx === 0 || yy === 0 ? 1 : 0;
    const wave = Math.pow(Math.max(0, Math.sin(y * 0.1 + Math.sin(x * 0.2) * 0.8)), 6);
    const v = 50 + edge * 150 + wave * 90;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = clamp(v, 0, 255); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TEX.hex = canvasTex(c, true));
}

// chapas do casco do disco: emendas, rebites e sujeira de chuva
function hullTex() {
  if (TEX.hull) return TEX.hull;
  const c = makeCanvas(64, 64), g = c.getContext('2d'), d = g.createImageData(64, 64), R = rng(5);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4;
    let v = 178 + R() * 18 + Math.sin(x * 0.9) * 4;
    if (x % 32 === 0 || y === 20 || y === 44) v = 92;
    else if (x % 32 === 1 || y === 21 || y === 45) v += 26;
    if ((y === 23 || y === 41) && x % 6 === 3) v = 220;
    if ((x % 32 === 3 || x % 32 === 29) && y % 7 === 2) v = 120;
    const streak = Math.sin(x * 2.3) * Math.sin(x * 0.7) > 0.6 && y > 24 ? 18 : 0;
    v -= streak;
    d.data[i] = clamp(v, 0, 255); d.data[i + 1] = clamp(v * 1.01, 0, 255); d.data[i + 2] = clamp(v * 1.05, 0, 255); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TEX.hull = canvasTex(processPixels(c), true));
}

// material somado à cena (orbes, raio, clarões)
function addMat(o = {}) {
  const m = ps1Material({ map: o.map ?? null, color: o.color ?? 0xffffff, lit: false, fog: o.fog ?? false, transparent: true, depthWrite: false, side: o.side ?? THREE.FrontSide, opacity: o.opacity ?? 1, scroll: o.scroll });
  m.blending = THREE.AdditiveBlending;
  return m;
}

// bolha do escudo: favos rolando e borda mais acesa (fresnel), somada à cena
function shieldMat() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: hexTex() }, uColor: { value: new THREE.Color(0.55, 0.3, 1.0) }, uOpacity: { value: 0.6 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vRim;
      void main() {
        vec4 vp = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vRim = 1.0 - abs(dot(n, normalize(-vp.xyz)));
        vUv = uv;
        gl_Position = projectionMatrix * vp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec2 vUv; varying float vRim;
      void main() {
        float h = texture2D(map, vUv * vec2(4.0, 3.0) + vec2(uTime * 0.03, uTime * 0.12)).r;
        float r = pow(vRim, 2.2);
        vec3 c = uColor * (0.03 + r * 1.3) * (0.35 + h * (0.4 + r * 0.8));
        gl_FragColor = vec4(c * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ---------- sons próprios ----------
const ok = a => !!(a && a.ctx && a.white);
const ETS = {
  // guincho curto de dor
  squeal(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.2, { type: 'square', f: 2100 * p, f1: 900 * p, vol: 0.035 * v, vib: 120 });
    noise(a, t, 0.12, { type: 'bandpass', f: 3200, q: 3, vol: 0.05 * v });
  },
  // morte: trinado que cai e engasga
  death(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 1.1, { type: 'sawtooth', f: 1500 * p, fMid: 1100 * p, f1: 160 * p, vol: 0.04 * v, vib: 90, vibF: 18 });
    for (let i = 0; i < 4; i++) tone(a, t + 0.3 + i * 0.16, 0.07, { type: 'square', f: (900 - i * 150) * p, f1: 400 * p, vol: 0.025 * v });
  },
  // piscar/teleporte: estalo elétrico subindo
  blink(a, d = 0) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.16, { type: 'sine', f: 260, f1: 2600, vol: 0.07 * v });
    noise(a, t, 0.08, { type: 'highpass', f: 4000, vol: 0.08 * v });
  },
  // disparo do orbe
  zap(a, d = 0, p = 1) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.35, { type: 'sine', f: 1100 * p, f1: 140 * p, vol: 0.07 * v });
    tone(a, t, 0.3, { type: 'triangle', f: 560 * p, f1: 90 * p, vol: 0.04 * v, vib: 30 });
  },
  // escudo quebrando: vidro e zumbido caindo
  shatter(a, d = 0) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    noise(a, t, 0.6, { type: 'highpass', f: 2500, f1: 6000, vol: 0.14 * v });
    for (let i = 0; i < 5; i++) tone(a, t + i * 0.04, 0.4, { type: 'sine', f: 2400 + Math.random() * 1800, f1: 900, vol: 0.025 * v });
    tone(a, t, 0.9, { type: 'sawtooth', f: 300, f1: 60, vol: 0.06 * v });
  },
  // escudo voltando
  shieldUp(a, d = 0) {
    if (!ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.9, { type: 'sine', f: 110, f1: 520, vol: 0.07 * v, attack: 0.3, vib: 20, vibF: 9 });
    tone(a, t, 0.9, { type: 'triangle', f: 112, f1: 525, vol: 0.03 * v, attack: 0.3 });
  },
  // voz do Visitante: zumbido grave dentro da cabeça
  voice(a, d = 0, dur = 1.6) {
    if (!ok(a) || fall(d, 120) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 120);
    tone(a, t, dur, { type: 'sine', f: 70, fMid: 95, f1: 55, vol: 0.14 * v, attack: 0.3, vib: 14, vibF: 6 });
    tone(a, t, dur, { type: 'square', f: 140, fMid: 190, f1: 110, vol: 0.025 * v, attack: 0.4, vib: 20 });
    noise(a, t, dur, { type: 'bandpass', f: 1800, f1: 600, q: 6, vol: 0.04 * v, attack: 0.4 });
  },
  // nave: chiado do raio e estalos da carcaça
  beam(a, d = 0) {
    if (!ok(a) || fall(d, 120) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 120);
    tone(a, t, 2.2, { type: 'sine', f: 420, f1: 445, vol: 0.035 * v, attack: 0.4, vib: 12, vibF: 7 });
    noise(a, t, 2.2, { type: 'bandpass', f: 2600, q: 4, vol: 0.03 * v, attack: 0.5 });
  },
  crackle(a, d = 0) {
    if (!ok(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    for (let i = 0; i < 5; i++) noise(a, t + Math.random() * 0.25, 0.03, { type: 'highpass', f: 3000, vol: 0.12 * v });
    tone(a, t, 0.25, { type: 'square', f: 120, f1: 80, vol: 0.03 * v });
  },
  // nave caindo: ronco que despenca
  dive(a, d = 0, dur = 3) {
    if (!ok(a) || fall(d, 300) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 300);
    tone(a, t, dur, { type: 'sawtooth', f: 260, f1: 45, vol: 0.06 * v, attack: 0.1, vib: 10, vibF: 5 });
    tone(a, t, dur, { type: 'sine', f: 70, f1: 30, vol: 0.2 * v, attack: 0.2 });
    noise(a, t, dur, { type: 'bandpass', f: 900, f1: 2400, q: 1.5, vol: 0.06 * v, attack: 0.5 });
  },
  crash(a, d = 0) {
    if (!ok(a) || fall(d, 300) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 300);
    tone(a, t, 1.6, { type: 'sine', f: 50, f1: 22, vol: 0.4 * v });
    noise(a, t, 1.4, { f: 500, f1: 70, vol: 0.45 * v, attack: 0.01 });
    noise(a, t + 0.05, 1.0, { type: 'bandpass', f: 1800, f1: 500, q: 2, vol: 0.2 * v });
    for (let i = 0; i < 4; i++) tone(a, t + 0.1 + i * 0.12, 0.6, { type: 'sawtooth', f: 700 - i * 90, f1: 300, vol: 0.05 * v });
  },
};

// ---------- corpo (comum aos dois) ----------
// perfil do tronco normalizado: [altura 0..1, raio relativo]
const TORSO = [[-0.12, 0], [-0.08, 0.62], [0.05, 0.8], [0.25, 0.68], [0.45, 0.6], [0.62, 0.84], [0.8, 0.98], [0.93, 0.86], [1.0, 0.45], [1.04, 0]];
// cabeça (ET; o chefe usa a mesma, maior): queixo fino, crânio grande
const HEAD = [[0, 0], [0.012, 0.035], [0.04, 0.068], [0.085, 0.1], [0.14, 0.128], [0.2, 0.143], [0.255, 0.136], [0.295, 0.106], [0.32, 0.06], [0.332, 0]];
// raio relativo do tronco na altura t (interpolado no perfil)
function torsoR(t) {
  for (let i = 1; i < TORSO.length; i++) if (TORSO[i][0] >= t) { const [t0, r0] = TORSO[i - 1], [t1, r1] = TORSO[i]; return lerp(r0, r1, (t - t0) / (t1 - t0)); }
  return 0;
}
const headOff =(y, a) => [0, y < 0.12 ? 0.025 * (1 - y / 0.12) : -0.03 * clamp((y - 0.12) / 0.2, 0, 1)];

// pele brilhante: lado de trás mais escuro, faixas claras que parecem óleo
const oily = C => (t, a) => {
  const front = Math.sin(a), side = Math.cos(a);
  const c = mix3(C.dark, C.base, clamp(0.55 + front * 0.45, 0, 1));
  const band = Math.pow(Math.max(0, Math.sin(t * 11 + side * 2.2)), 8) * clamp(0.4 + front * 0.3 + side * 0.4, 0, 1);
  return mix3(c, C.sheen, band * 0.7);
};
const headColor = C => (t, a) => {
  const front = Math.sin(a), side = Math.cos(a);
  let c = mix3(C.dark, C.base, clamp(0.5 + front * 0.5, 0, 1));
  // órbitas fundas em volta dos olhos
  if (t > 0.3 && t < 0.62 && front > 0.35 && Math.abs(side) > 0.2) c = mix3(c, C.dark, 0.55);
  // brilho na testa e no alto (pele molhada)
  const hl = Math.exp(-((t - 0.74) ** 2) / 0.01) * Math.max(0, Math.sin(a - 0.5)) * (C.hl ?? 1);
  const band = Math.pow(Math.max(0, Math.sin(t * 9 + side * 3)), 10) * 0.5 * (C.hl ?? 1);
  c = mix3(c, C.sheen, clamp(hl * 0.9 + band, 0, 1));
  if (C.vein) c = mix3(c, C.vein, Math.pow(Math.abs(Math.sin(t * 23 + Math.sin(a * 3) * 2)), 30) * (t > 0.5 ? 0.8 : 0));
  return c;
};

class Alien extends Creature {
  // D: medidas; skin/eye: materiais; C: cores
  _body(D, C, skin, eyeMat, eyeCol) {
    const B = this.bones = {}, col = oily(C);
    this.D = D;
    B.hips = joint(this.root, 0, D.thigh + D.shin + D.footH, 0);
    B.torso = joint(B.hips, 0, 0, 0);
    B.torso.add(this.mesh(blob(TORSO.map(([t, r]) => [t * D.torso, r * D.torsoW]), 8, { sz: D.torsoSz, col, vRep: 2 }), skin));
    // costelas marcadas (pele colada no osso)
    if (D.ribs !== false) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const tt = 0.64 + i * 0.1, rr = torsoR(tt) * D.torsoW;
      const r = this.mesh(blob([[-0.6, 0], [0, 0.07], [0.6, 0]], 3, { col: () => C.dark }), skin);
      r.scale.setScalar(D.torsoW * 0.7);
      r.position.set(s * rr * 0.55, D.torso * tt, rr * D.torsoSz * 0.82);
      r.rotation.set(0, s * 0.75, Math.PI / 2 + s * 0.3);
      B.torso.add(r);
    }
    B.neck = joint(B.torso, 0, D.torso * 1.0, 0);
    B.neck.add(this.mesh(blob([[-0.01, D.neckR * 1.3], [D.neck * 0.5, D.neckR], [D.neck, D.neckR * 1.15]], 6, { col }), skin));
    B.head = joint(B.neck, 0, D.neck, 0.005);
    B.skull = joint(B.head, 0, 0, 0);
    if (Array.isArray(D.headS)) B.skull.scale.set(...D.headS); else B.skull.scale.setScalar(D.headS);
    B.skull.add(this.mesh(blob(HEAD, 10, { sz: 0.88, col: headColor(C), off: headOff }), skin));
    // olhos enormes amendoados, puxados para cima nos cantos
    B.eyes = [];
    for (const s of [-1, 1]) {
      const eg = blob([[-0.068, 0], [-0.05, 0.032], [-0.012, 0.043], [0.03, 0.04], [0.058, 0.026], [0.07, 0]], 6, { sz: 0.62, col: eyeCol });
      eg.rotateZ(Math.PI / 2 + s * (D.eyeTilt ?? 0.22));
      const e = this.mesh(eg, eyeMat);
      e.position.set(s * 0.06, 0.15, 0.09); e.rotation.y = s * 0.55;
      if (D.eyeS) e.scale.set(...D.eyeS);
      B.skull.add(e); B.eyes.push(e);
      // brilho molhado no olho
      if (D.glint) {
        const g = this.mesh(blob([[-0.009, 0], [0, 0.007], [0.009, 0]], 3, { sz: 0.5, col: () => D.glint }), eyeMat);
        g.position.set(s * 0.068, 0.167, 0.119); g.rotation.y = s * 0.55;
        B.skull.add(g);
      }
    }
    // boca: um risco escuro, sem lábios
    const mg = blob([[-0.024, 0], [0, 0.005], [0.024, 0]], 3, { sz: 0.5, col: () => [0.04, 0.02, 0.02] });
    mg.rotateZ(Math.PI / 2);
    const mouth = this.mesh(mg, skin); mouth.position.set(0, 0.047, 0.08); B.skull.add(mouth);
    // braços compridos e finos, mão de três dedos
    B.arms = [];
    for (const s of [1, -1]) {
      const sh = joint(B.torso, s * D.shW, D.torso * 0.9, 0);
      sh.add(this.mesh(limb(D.upper, D.armR[0], D.armR[1], 5, col), skin));
      const el = joint(sh, 0, -D.upper, 0);
      el.add(this.mesh(limb(D.fore, D.armR[1], D.armR[2], 4, col), skin));
      const hand = joint(el, 0, -D.fore, 0);
      const palm = this.mesh(blob([[-0.05, 0], [-0.035, 0.024], [0, 0.021], [0.008, 0]], 4, { sz: 0.55, col }), skin);
      palm.scale.setScalar(D.handS); hand.add(palm);
      const fingers = [];
      for (let k = -1; k <= 1; k++) {
        const fg = cone(0.1, 0.011, C.base, C.dark, 3);
        fg.rotateX(Math.PI);
        const f = this.mesh(fg, skin);
        f.scale.setScalar(D.handS);
        f.position.set(k * 0.016 * D.handS, -0.042 * D.handS, 0); f.rotation.z = k * 0.2;
        hand.add(f); fingers.push(f);
      }
      B.arms.push({ sh, el, hand, s, fingers });
    }
    // pernas finas, pé largo e chato
    B.legs = [];
    for (const s of [1, -1]) {
      const th = joint(B.hips, s * D.hipW, 0, 0);
      th.add(this.mesh(limb(D.thigh, D.legR[0], D.legR[1], 5, col), skin));
      const kn = joint(th, 0, -D.thigh, 0);
      kn.add(this.mesh(limb(D.shin, D.legR[1], D.legR[2], 4, col), skin));
      const an = joint(kn, 0, -D.shin, 0);
      const fg = blob([[-0.035, 0], [-0.028, 0.034], [0.03, 0.046], [0.085, 0.042], [0.11, 0]], 5, { sx: 1.35, sz: 0.4, col: () => C.dark });
      fg.rotateX(Math.PI / 2);
      const foot = this.mesh(fg, skin);
      foot.scale.setScalar(D.footS); foot.position.set(0, -D.footH * 0.55, 0.012);
      an.add(foot);
      B.legs.push({ th, kn, an, s });
    }
    this.P = { lean: 0, sway: 0, twist: 0, headX: 0, headY: 0, headZ: 0, crouch: 0, armIn: 0, armF: [0, 0], armOut: [0.15, 0.15], elbow: [0.3, 0.3], vx: 0, vz: 0, ph: Math.random(), walk: 0 };
    this._px = null;
  }

  // velocidade real (para o passo), ignorando saltos de teleporte
  _vel(dt) {
    const P = this.P;
    if (this._px === null || dt <= 0) { this._px = this.pos.x; this._pz = this.pos.z; return; }
    let vx = (this.pos.x - this._px) / dt, vz = (this.pos.z - this._pz) / dt;
    const sp = Math.hypot(vx, vz);
    if (sp > 7) { vx = vz = 0; }
    this._px = this.pos.x; this._pz = this.pos.z;
    P.vx = damp(P.vx, vx, 10, dt); P.vz = damp(P.vz, vz, 10, dt);
  }

  // aplica a pose (T = alvo) com passo desengonçado ou pernas penduradas (levitando)
  _apply(dt, T) {
    this._flashLight(dt);
    const P = this.P, B = this.bones, D = this.D, k = 1 - Math.exp(-dt * (T.snap || 12));
    for (const key of ['lean', 'sway', 'twist', 'headX', 'headY', 'headZ', 'crouch', 'armIn']) P[key] = lerp(P[key], T[key] ?? 0, k);
    for (let i = 0; i < 2; i++) { P.armF[i] = lerp(P.armF[i], T.armF[i], k); P.armOut[i] = lerp(P.armOut[i], T.armOut[i], k); P.elbow[i] = lerp(P.elbow[i], T.elbow[i], k); }
    const h = this.heading, sh = Math.sin(h), ch = Math.cos(h);
    const fwd = P.vx * sh + P.vz * ch, lat = P.vx * ch - P.vz * sh, spd = Math.hypot(fwd, lat);
    const amp = clamp(spd / 2.2, 0, 1.15) * (T.noWalk ? 0 : 1);
    P.walk = lerp(P.walk, amp, 1 - Math.exp(-dt * 8));
    P.ph = (P.ph + dt * (1.1 + spd * 0.85)) % 1;
    const ph = P.ph * TAU, sf = spd > 0.05 ? fwd / spd : 0, sl = spd > 0.05 ? lat / spd : 0, w = P.walk;
    const jit = T.jit || 0;
    if (this.hang) {
      // levitando: pernas soltas, pontas para baixo, arrastando atrás do movimento
      for (const L of B.legs) {
        const sw = Math.sin(this.age * 1.2 + L.s) * 0.06;
        L.th.rotation.set(0.1 + sw - fwd * 0.08 + P.crouch * -0.9, 0, L.s * (0.05 + lat * 0.03 * L.s));
        L.kn.rotation.x = 0.22 + sw * 0.5 + P.crouch * 1.6;
        L.an.rotation.x = 0.7 - P.crouch * 0.5;
      }
      B.hips.position.y = (D.thigh + D.shin + D.footH) * (1 - P.crouch * 0.35);
    } else {
      let drop = 0;
      for (const L of B.legs) {
        const off = L.s > 0 ? 0 : Math.PI, a = Math.sin(ph + off), lift = Math.max(0, Math.cos(ph + off));
        const tx = -a * 0.55 * w * sf - P.crouch * 0.7 - 0.08 + rnd(jit);
        const tz = L.s * 0.05 + a * 0.3 * w * sl + rnd(jit);
        const kx = 0.18 + lift * 1.05 * w + P.crouch * 1.4 + rnd(jit);
        L.th.rotation.set(tx, 0, tz);
        L.kn.rotation.x = kx;
        L.an.rotation.x = -(tx + kx) * 0.85 - lift * 0.3 * w;
        drop = Math.max(drop, (D.thigh * Math.cos(tx) + D.shin * Math.cos(tx + kx)) * Math.cos(tz) + D.footH);
      }
      B.hips.position.y = drop;
    }
    // tronco balança de um lado para o outro, cabeça bamboleia
    B.torso.rotation.set(P.lean + Math.abs(Math.sin(ph)) * 0.05 * w + rnd(jit), P.twist + Math.sin(ph) * 0.12 * w * sf, P.sway + Math.sin(ph) * 0.11 * w + rnd(jit));
    B.neck.rotation.set(-P.lean * 0.6 + P.headX * 0.4, P.headY * 0.4, -Math.sin(ph) * 0.06 * w);
    B.head.rotation.set(P.headX * 0.6 + Math.sin(ph * 2) * 0.06 * w + rnd(jit * 1.5), P.headY * 0.6, P.headZ - Math.sin(ph + 0.6) * 0.17 * w + rnd(jit * 1.5));
    for (const A of B.arms) {
      const i = A.s > 0 ? 0 : 1, off = A.s > 0 ? Math.PI : 0;
      const sw = Math.sin(ph + off - 0.5) * 0.5 * w * sf;
      A.sh.rotation.set(-P.armF[i] - sw - P.lean * 0.5 + rnd(jit * 2), 0, A.s * P.armOut[i] - A.s * P.armIn + rnd(jit * 2));
      A.el.rotation.x = -P.elbow[i] - Math.max(0, -sw) * 0.4 + rnd(jit * 2);
      A.hand.rotation.x = -0.2;
      for (const f of A.fingers) f.rotation.x = (T.claw ?? 0.15) + rnd(jit * 2);
    }
  }

  // orbe psíquico: casca, miolo claro e halo
  _makeOrb(parent) {
    this.orbMat = addMat({ color: 0xb080ff });
    this.coreMat = addMat({ color: 0xe0ffe8 });
    this.orb = new THREE.Mesh(ensureColor(new THREE.IcosahedronGeometry(1, 0)), this.orbMat);
    this.core = new THREE.Mesh(ensureColor(new THREE.IcosahedronGeometry(0.5, 0)), this.coreMat);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xa070ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    for (const m of [this.orb, this.core, this.halo]) { m.frustumCulled = false; m.renderOrder = 6; m.scale.setScalar(0.0001); m.visible = false; parent.add(m); }
  }

  // orbe na mão: tamanho r, cor c, tremendo
  _showOrb(on, r = 0.1, c = ORB_A) {
    this.orb.visible = this.core.visible = this.halo.visible = on;
    if (!on) return;
    const fl = 0.85 + Math.random() * 0.3;
    this.orb.scale.setScalar(r * fl); this.core.scale.setScalar(r * 0.55 * fl); this.halo.scale.setScalar(r * 9 * fl);
    this.orb.rotation.set(this.age * 7, this.age * 5, 0);
    this.orbMat.uniforms.uColor.value.setRGB(c[0], c[1], c[2]);
    this.halo.material.color.setRGB(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
  }

  sync() {
    super.sync();
    this.root.position.y += this.lift || 0;
  }

  dispose() {
    super.dispose();
    this.orbMat?.dispose(); this.coreMat?.dispose(); this.halo?.material.dispose();
    if (this._fls) for (const F of this._fls) { this.scene.remove(F.s); F.s.material.dispose(); }
  }

  // ponto livre para o teleporte (fora de prédios, água e barrancos)
  _free(x, z) {
    const c = this.ctx, b = c.playBounds;
    if (b && (x < b.x0 + 1 || x > b.x1 - 1 || z < b.z0 + 1 || z > b.z1 - 1)) return null;
    if (!c.indoor && c.zones?.insideBuilding?.(x, z, 0.6)) return null;
    const g = c.groundAt(x, z, this.pos.y + 2.5);
    if (Math.abs(g - this.pos.y) > 2.5 || c.isDeepWater(x, z, g)) return null;
    const p = this._t.set(x, g, z);
    c.collision.resolve(p, this.radius, Math.min(1.8, this.height));
    if (Math.hypot(p.x - x, p.z - z) > 0.15) return null;
    return g;
  }

  // clarão de luz psíquica (teleporte, chegada)
  _flash(p, n = 14, col = [0.75, 0.55, 1]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 1.5 + Math.random() * 3;
      this.effects.spawn({ p: v3(p.x, p.y + 0.3 + Math.random() * this.height * 0.8, p.z), v: v3(Math.cos(a) * s, rnd(1.5) + 0.5, Math.sin(a) * s), life: 0.25 + Math.random() * 0.25, s0: 0.09, s1: 0, color: i % 3 ? col : [0.85, 1, 0.9], drag: 4 });
    }
    this.flashLight = { x: p.x, y: p.y + this.height * 0.6, z: p.z, t: 0.22 };
    // clarão (halo somado), dois para valer na saída e na chegada
    if (!this._fls) {
      this._fls = [0, 1].map(() => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xc0a0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        s.visible = false; s.renderOrder = 7; s.frustumCulled = false; this.scene.add(s);
        return { s, t: 0 };
      });
      this._flI = 0;
    }
    const F = this._fls[this._flI++ % 2];
    F.t = 0.3; F.s.visible = true; F.s.position.set(p.x, p.y + this.height * 0.55, p.z);
  }

  _flashLight(dt) {
    if (this._fls) for (const F of this._fls) {
      if (!F.s.visible) continue;
      F.t -= dt;
      const k = Math.max(0, F.t / 0.3);
      F.s.scale.set(this.height * (1.2 + (1 - k) * 1.5), this.height * (2.2 - (1 - k) * 1.2), 1);
      F.s.material.color.setRGB(0.75 * k, 0.65 * k, 1 * k);
      if (F.t <= 0) F.s.visible = false;
    }
    const F = this.flashLight;
    if (!F) return;
    F.t -= dt;
    const k = Math.max(0, F.t / 0.22);
    this.atmo?.light(F.x, F.y, F.z, [1.4 * k, 1.1 * k, 2 * k], 7, 5);
    if (F.t <= 0) this.flashLight = null;
  }

  // conta os ETs comuns vivos
  static countETs(C, filter = null) {
    let n = 0;
    for (const e of C.enemies) if (e instanceof ET && !e.dead && (!filter || filter(e))) n++;
    return n;
  }
}

// ---------- ET ----------
const ET_D = {
  thigh: 0.24, shin: 0.235, footH: 0.035, footS: 1.3, hipW: 0.062, legR: [0.034, 0.025, 0.019],
  torso: 0.34, torsoW: 0.1, torsoSz: 0.68,
  shW: 0.1, upper: 0.29, fore: 0.28, armR: [0.028, 0.021, 0.016], handS: 1,
  neck: 0.065, neckR: 0.027, headS: 1, glint: [1, 0.75, 0.7],
};
const ET_C = { base: [0.27, 0.165, 0.095], dark: [0.12, 0.07, 0.04], sheen: [0.62, 0.47, 0.33] };
const ORB_A = [0.6, 0.3, 1], ORB_B = [0.35, 1, 0.55];

// opções: { hp, scale, state: 'arrive' | 'approach' | 'watch' | 'idle', wake (m, para 'watch'), near, far }
export class ET extends Alien {
  constructor(deps, o = {}) {
    super(deps, { name: 'ET', hp: o.hp ?? 3, radius: 0.32, height: 1.2, blood: [0.32, 0.55, 0.2], death: 'fall', resist: { ray: 0.5, light: 0.3, dart: 0.5 }, ...o });
    this.blood = o.blood || [0.3, 0.5, 0.22];
    this.bloodAlt = [0.42, 0.22, 0.5];
    this.immuneColor = [0.7, 0.5, 1];
    this.scale = o.scale ?? (0.9 + Math.random() * 0.1);
    this.build();
    this.root.scale.setScalar(this.scale);
    this.pitch = 1 / this.scale * (0.92 + Math.random() * 0.16);
    this.state = o.state || 'arrive'; this.enter = true;
    this.wake = o.wake ?? 14;
    this.near = o.near ?? 7; this.far = o.far ?? (9 + Math.random() * 3);
    this.side = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1 + Math.random() * 2;
    this.cool = 1.2 + Math.random() * 2; this.blinkCool = 0;
    this.nextChirp = 0.5 + Math.random() * 2;
    this.age = Math.random() * 10;
    this.lookA = 0; this.fallSide = Math.random() < 0.5 ? 1 : -1;
  }

  build() {
    const skin = this.mat({ map: oilyTex(), emissive: 0x070403 });
    const eye = this.mat({ map: null, color: 0xffffff, lit: false, fog: false });
    const eyeCol = (t, a) => mix3([0.22, 0.0, 0.01], [1, 0.12, 0.06], Math.pow(Math.sin(t * Math.PI), 1.2) * clamp(0.55 + 0.45 * Math.sin(a), 0, 1));
    this._body(ET_D, ET_C, skin, eye, eyeCol);
    const B = this.bones;
    // três calombos (chifres curtos e rombudos) no alto da cabeça
    for (const [x, y, z, rx, rz, k] of [[0, 0.3, -0.025, -0.35, 0, 1.15], [0.085, 0.262, 0.0, -0.1, -0.68, 1], [-0.085, 0.262, 0.0, -0.1, 0.68, 1]]) {
      const hg = blob([[-0.01, 0], [0, 0.036], [0.04, 0.027], [0.072, 0]], 5, { col: t => mix3(ET_C.base, ET_C.sheen, t * 0.7) });
      const h = this.mesh(hg, skin);
      h.scale.setScalar(k); h.position.set(x, y, z); h.rotation.set(rx, 0, rz);
      B.skull.add(h);
    }
    // orbe psíquico entre as mãos (aparece ao carregar)
    B.orb = joint(B.torso, 0, ET_D.torso * 0.86, 0.36);
    this._makeOrb(B.orb);
    this.spheres = [
      { bone: B.head, off: v3(0, 0.16, 0.0), r: 0.17, part: 'head' },
      { bone: B.torso, off: v3(0, 0.24, 0), r: 0.13, part: 'body' },
      { bone: B.torso, off: v3(0, 0.07, 0), r: 0.12, part: 'body' },
      { bone: B.legs[0].kn, off: v3(0, -0.05, 0), r: 0.08, part: 'limb' },
      { bone: B.legs[1].kn, off: v3(0, -0.05, 0), r: 0.08, part: 'limb' },
    ];
  }

  _go(s) { this.state = s; this.st = 0; this.clawed = false; this.jumped = false; this.enter = true; }

  // ---------- IA ----------
  think(dt, env) {
    const { dx, dz, d, ang } = this.toPlayer(env), A = this.audio, C = env.combat;
    const enter = this.enter; this.enter = false;
    this.age += dt;
    this.lookA = ang;
    // se a campanha trocar o estado no meio do piscar, volta a ser visível e atingível
    if (this.state !== 'blink' && this.state !== 'vanish' && this.state !== 'arrive') { this.untargetable = false; this.root.visible = true; }
    this.cool -= dt; this.blinkCool -= dt;
    this.nextChirp -= dt;
    if (this.nextChirp <= 0) { this.nextChirp = 2.5 + Math.random() * 4; if (this.state !== 'blink') SFX.chirp(A, d, this.pitch); }
    let mvx = 0, mvz = 0, faceK = 6;
    switch (this.state) {
      case 'arrive': {
        // materializa no lugar
        if (enter) { this._flash(this.pos, 12); ETS.blink(A, d); }
        if (this.st > 0.75) this._go(env.playerAlive ? 'approach' : 'idle');
        break;
      }
      case 'watch': {
        // parado, olhando, cabeça inclinada
        if (env.playerAlive && (d < this.wake || this.hp < this.maxHp)) { this._go('approach'); SFX.chirp(A, d, this.pitch * 1.2); }
        faceK = 2;
        break;
      }
      case 'idle': {
        if (env.playerAlive) this._go('approach');
        faceK = 1.5;
        break;
      }
      case 'approach': {
        if (!env.playerAlive) { this._go('idle'); break; }
        const fx = dx / (d || 1), fz = dz / (d || 1);
        let f = 0;
        if (d > this.far) f = 1; else if (d < this.near) f = -0.85;
        this.strafeT -= dt;
        if (this.strafeT <= 0 || this.stuck) { this.side *= -1; this.strafeT = 1.3 + Math.random() * 2.2; }
        const sideK = d < this.far + 4 ? 1 : 0.35;
        mvx = fx * f + fz * this.side * sideK; mvz = fz * f - fx * this.side * sideK;
        // separação do bando
        for (const e of C.enemies) {
          if (e === this || e.dead || !(e instanceof Alien)) continue;
          const ex = this.pos.x - e.pos.x, ez = this.pos.z - e.pos.z, el = Math.hypot(ex, ez);
          if (el < 1.8 && el > 1e-3) { mvx += ex / el * (1.8 - el) * 1.5; mvz += ez / el * (1.8 - el) * 1.5; }
        }
        const L = Math.hypot(mvx, mvz) || 1, sp = d > this.far + 2 ? 2.7 : 1.8;
        mvx = mvx / L * sp; mvz = mvz / L * sp;
        if (d < 1.7) { this._go('claw'); SFX.chirp(A, d, this.pitch * 0.8); break; }
        // orbe: no máximo dois carregando ao mesmo tempo
        if (d < this.far + 6 && this.cool <= 0 && Alien.countETs(C, e => e.state === 'charge') < 2) { this._go('charge'); SFX.psychic(A, d); }
        break;
      }
      case 'charge': {
        // segura o orbe entre as mãos (0,7 s): o aviso
        faceK = 8;
        if (this.st >= 0.7) { this._fire(env); this._go('cast'); }
        else if (d < 1.4) this._go('claw');
        break;
      }
      case 'cast': {
        if (this.st > 0.35) { this.cool = 2.3 + Math.random() * 2.4; this._go('approach'); }
        break;
      }
      case 'claw': {
        // arranhão de perto
        faceK = 10;
        if (this.st < 0.25 && d > 0.8) { mvx = dx / d * 1.6; mvz = dz / d * 1.6; }
        if (this.st > 0.3 && !this.clawed) { this.clawed = true; if (this.strike(env, 8, 1.25, 0.25, 3.5)) ETS.squeal(A, 0, this.pitch * 0.7); }
        if (this.st > 0.62) { this.cool = Math.max(this.cool, 0.6); this._go(d < 1.5 && Math.random() < 0.5 ? 'claw' : 'approach'); }
        break;
      }
      case 'hurt': {
        faceK = 2;
        if (this.st > 0.32) this._go('approach');
        break;
      }
      case 'blink': {
        // pisca e reaparece 5–8 m para o lado
        faceK = 0;
        this.untargetable = this.st > 0.18 && this.st < 0.36;
        if (!this.jumped && this.st > 0.22) { this.jumped = true; this._teleport(env); }
        if (this.st > 0.5) { this.untargetable = false; this.root.visible = true; this._go('approach'); }
        break;
      }
      case 'flee': {
        // foge correndo e some (a campanha pode mandar)
        const L = d || 1;
        if (this.stuck) this.side *= -1;
        mvx = (-dx / L + dz / L * this.side * 0.6) * 3.4; mvz = (-dz / L - dx / L * this.side * 0.6) * 3.4;
        this.heading = Math.atan2(mvx, mvz); faceK = 0;
        if (this.st > 4 || d > 35) this.vanish();
        break;
      }
      case 'vanish': {
        faceK = 0;
        if (this.st > 0.35) { this.root.visible = false; this.removed = true; }
        break;
      }
    }
    if (mvx || mvz) this.step(dt, mvx, mvz, true);
    if (faceK) this.face(dt, ang, faceK);
    this.stickGround(dt);
    this._charge(dt, env);
  }

  // orbe crescendo, luz roxa-esverdeada e partículas sendo puxadas para as mãos
  _charge(dt, env) {
    const on = this.state === 'charge';
    const k = clamp(this.st / 0.7, 0, 1), c = mix3(ORB_A, ORB_B, 0.5 + 0.5 * Math.sin(this.st * 22));
    this._showOrb(on, 0.03 + 0.08 * k, c);
    if (!on) return;
    this.root.updateMatrixWorld(true);
    const p = this.bones.orb.getWorldPosition(this._t2);
    this.atmo?.light(p.x, p.y, p.z, [c[0] * (0.8 + k), c[1] * (0.8 + k), c[2] * (0.8 + k)], 3 + k * 3, 4);
    this.sparkT = (this.sparkT || 0) - dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.035;
      const o = v3(rnd(1), rnd(1), rnd(1)).normalize().multiplyScalar(0.35);
      this.effects.spawn({ p: v3(p.x + o.x, p.y + o.y, p.z + o.z), v: o.multiplyScalar(-2.6), life: 0.13, s0: 0.035, s1: 0.01, color: Math.random() < 0.5 ? ORB_A : ORB_B });
    }
  }

  _fire(env) {
    this.root.updateMatrixWorld(true);
    const o = this.bones.orb.getWorldPosition(v3());
    const P = env.player.pos, pv = env.playerVel || { x: 0, z: 0 };
    const tt = o.distanceTo(P) / 11;
    const tx = P.x + pv.x * tt * 0.6 - o.x, ty = P.y + 1.1 - o.y, tz = P.z + pv.z * tt * 0.6 - o.z;
    const L = Math.hypot(tx, ty, tz) || 1;
    env.combat.projectile({ p: o, v: v3(tx / L * 11, ty / L * 11, tz / L * 11), kind: 'psy', dmg: 10, owner: 'enemy', size: 0.18, color: [0.7, 0.4, 1], light: [0.6, 0.3, 1], homing: 1.2, life: 3, knock: 3 });
    for (let i = 0; i < 6; i++) this.effects.spawn({ p: o.clone(), v: v3(rnd(1.5), rnd(1.5), rnd(1.5)), life: 0.2, s0: 0.07, s1: 0, color: i % 2 ? ORB_A : ORB_B, drag: 3 });
    ETS.zap(this.audio, Math.sqrt(tx * tx + tz * tz), this.pitch);
  }

  _teleport(env) {
    const P = env.player.pos, ax = this.pos.x - P.x, az = this.pos.z - P.z, L = Math.hypot(ax, az) || 1;
    const rx = az / L, rz = -ax / L, side = Math.random() < 0.5 ? 1 : -1;
    this._flash(this.pos);
    ETS.blink(this.audio, L);
    for (let i = 0; i < 10; i++) {
      const sd = i % 2 ? -side : side, dist = 5 + Math.random() * 3, back = rnd(1.5);
      const x = this.pos.x + rx * sd * dist + ax / L * back, z = this.pos.z + rz * sd * dist + az / L * back;
      const g = this._free(x, z);
      if (g === null) continue;
      this.pos.set(x, g, z);
      this._px = null;
      this._flash(this.pos, 10);
      this.heading = Math.atan2(P.x - x, P.z - z);
      return true;
    }
    return false;
  }

  // some num piscar (a campanha pode chamar: nave indo embora, etc.)
  vanish() {
    if (this.dead || this.state === 'vanish') return;
    this._flash(this.pos, 12);
    ETS.blink(this.audio, this.player ? Math.hypot(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z) : 10);
    this.untargetable = true;
    this._go('vanish');
  }

  onHurt(dmg, info) {
    if (this.state === 'blink' || this.state === 'arrive' || this.state === 'vanish') return;
    // sangue verde e roxo misturado
    const t = this.blood; this.blood = this.bloodAlt; this.bloodAlt = t;
    if (info.beam) {
      // o lampião incomoda: às vezes pisca para longe da luz
      if (this.blinkCool <= 0 && Math.random() < 0.025) { this._go('blink'); this.blinkCool = 3; }
      return;
    }
    ETS.squeal(this.audio, 4, this.pitch);
    if (this.hp > 0 && this.blinkCool <= 0 && Math.random() < 0.45) { this._go('blink'); this.blinkCool = 3.5; return; }
    if (this.state !== 'claw') this._go('hurt');
  }

  onDeath() {
    ETS.death(this.audio, 4, this.pitch);
    this._showOrb(false);
    this.untargetable = false; this.root.visible = true;
  }

  // ---------- animação ----------
  animate(dt) {
    const s = this.state, t = this.st;
    this._vel(dt);
    const T = {
      lean: 0.1, sway: 0, twist: 0, headX: 0, headY: clamp(wrapA(this.lookA - this.heading), -0.8, 0.8), headZ: Math.sin(this.age * 1.3) * 0.08,
      crouch: 0.12, armIn: 0, armF: [0.06, 0.06], armOut: [0.16, 0.16], elbow: [0.35, 0.35], claw: 0.15,
    };
    let scale = this.scale;
    if (s === 'arrive') {
      const k = clamp(t / 0.6, 0, 1);
      scale *= 0.05 + 0.95 * k * k;
      this.root.visible = t > 0.5 || Math.floor(t * 30) % 2 === 0;
      T.crouch = 0.6 * (1 - k); T.armOut = [0.8, 0.8]; T.headX = -0.4;
    } else if (s === 'watch') {
      T.headZ = Math.sin(this.age * 0.7) * 0.35; T.headX = -0.1; T.armF = [0.12, 0.05]; T.elbow = [0.4, 0.3];
    } else if (s === 'charge') {
      // braços para a frente, mãos juntas segurando o orbe; tremendo
      const tr = Math.sin(t * 60) * 0.04;
      T.armF = [1.05 + tr, 1.05 - tr]; T.armOut = [-0.02, -0.02]; T.armIn = 0.17; T.elbow = [0.85, 0.85];
      T.lean = 0.02; T.crouch = 0.3; T.headX = 0.12; T.claw = -0.3;
    } else if (s === 'cast') {
      T.armF = [1.45, 1.45]; T.armIn = 0.08; T.elbow = [0.05, 0.05]; T.lean = -0.12; T.crouch = 0.2; T.claw = -0.5; T.snap = 20;
    } else if (s === 'claw') {
      // braço direito sobe por cima e desce rasgando
      const k = clamp((t - 0.3) / 0.12, 0, 1);
      T.armF = [lerp(2.7, 0.5, k), 0.4]; T.armOut = [lerp(0.35, -0.1, k), 0.3]; T.elbow = [lerp(0.9, 0.2, k), 0.6];
      T.lean = lerp(-0.1, 0.35, k); T.twist = lerp(0.35, -0.3, k); T.crouch = 0.3; T.claw = 0.6; T.headX = -0.15; T.snap = k > 0 ? 28 : 14;
    } else if (s === 'hurt') {
      const k = Math.sin(clamp(t / 0.32, 0, 1) * Math.PI);
      T.lean = 0.1 - 0.45 * k; T.headX = -0.6 * k; T.headZ = 0.3 * k; T.armOut = [0.2 + 0.7 * k, 0.2 + 0.6 * k]; T.armF = [0.4 * k, 0.5 * k]; T.snap = 20;
    } else if (s === 'blink') {
      T.crouch = 0.4; T.armOut = [0.6, 0.6]; T.headX = -0.3;
      const vis = t < 0.22 ? Math.floor(t * 34) % 2 === 0 : t < 0.32 ? false : Math.floor(t * 34) % 2 === 0;
      this.root.visible = vis;
      if (t >= 0.5) this.root.visible = true;
    } else if (s === 'flee') {
      T.lean = 0.35; T.armF = [-0.4, -0.4]; T.armOut = [0.3, 0.3]; T.headX = 0.1;
    } else if (s === 'vanish') {
      const k = clamp(t / 0.35, 0, 1);
      scale *= 1 - k * 0.9;
      this.root.visible = Math.floor(t * 34) % 2 === 0;
    } else if (s === 'dead') {
      // espasmos que vão parando
      const k = Math.exp(-this.deadT * 1.3) * (this.deadT < 2.6 ? 1 : 0);
      const burst = Math.sin(this.deadT * 9) > 0.2 ? 1 : 0.25;
      T.jit = 0.35 * k * burst; T.crouch = 0.9; T.armOut = [0.9, 0.7]; T.armF = [0.6, 1.2]; T.elbow = [1.2, 0.4]; T.headX = -0.5; T.claw = 0.8; T.noWalk = true;
    }
    this.root.scale.setScalar(scale);
    this._apply(dt, T);
  }
}

// ---------- O VISITANTE (chefe) ----------
const LEADER_D = {
  thigh: 0.47, shin: 0.46, footH: 0.05, footS: 1.5, hipW: 0.1, legR: [0.06, 0.042, 0.032],
  torso: 0.6, torsoW: 0.17, torsoSz: 0.66,
  shW: 0.2, upper: 0.5, fore: 0.48, armR: [0.05, 0.036, 0.026], handS: 1.7,
  neck: 0.11, neckR: 0.045, headS: [1.62, 1.78, 1.7], ribs: false, eyeTilt: 0.4, eyeS: [1.22, 1.15, 1.1],
};
const LEADER_C = { base: [0.43, 0.39, 0.5], dark: [0.22, 0.19, 0.28], sheen: [0.66, 0.62, 0.78], vein: [0.26, 0.14, 0.32], hl: 0.35 };
const GREEN = [0.35, 1, 0.5];

// opções: { hp, state: 'idle' | 'hover' | 'descend', wake (m), bossBar (false = não liga a barra sozinho) }
export class ETLeader extends Alien {
  constructor(deps, o = {}) {
    super(deps, { name: 'O VISITANTE', hp: o.hp ?? 40, radius: 0.55, height: 2.2, blood: [0.4, 0.25, 0.55], death: 'fall', resist: { ray: 1, light: 0.25, dart: 0.05, explosion: 1.2 }, ...o });
    this.deps = deps;
    this.bossName = 'O VISITANTE';
    this.heavy = true;
    this.hang = true;
    this.immuneColor = [0.6, 0.5, 1];
    this.build();
    this.shielded = true; this.rayHits = 0; this.vulnT = 0; this.shieldK = 1; this.shieldFlash = 0;
    this.spheres.push(this.shieldSphere);
    this.state = o.state || 'idle';
    this.wake = o.wake ?? 26;
    this.bossBar = o.bossBar !== false;
    this.lift = this.state === 'descend' ? 7 : 0.28;
    this.cool = 2; this.summonCool = 4; this.side = 1; this.strafeT = 2;
    this.age = 0; this.lookA = 0; this.fallSide = 1;
    this.wave = null;
    this.glowK = 0;
  }

  build() {
    const skin = this.mat({ map: oilyTex(), emissive: 0x0a080d });
    const eye = this.mat({ map: null, color: 0xffffff, lit: false, fog: false });
    // olho preto brilhante com reflexo vermelho embaixo
    const eyeCol = (t, a) => mix3([0.015, 0.0, 0.008], [0.45, 0.02, 0.05], clamp(-Math.cos(a) * 0.9 + (1 - Math.sin(t * Math.PI)) * 0.25 - 0.1, 0, 1));
    this._body(LEADER_D, LEADER_C, skin, eye, eyeCol);
    const B = this.bones, D = LEADER_D;
    // brilho vermelho no fundo dos olhos pretos
    const glint = this.mat({ map: null, color: 0xff2010, lit: false, fog: false });
    for (const e of B.eyes) {
      const g = this.mesh(blob([[-0.012, 0], [0, 0.008], [0.012, 0]], 4, { sz: 0.5 }), glint);
      g.position.set(e.position.x * 1.22, e.position.y + 0.014, e.position.z + 0.031); g.rotation.y = e.rotation.y;
      B.skull.add(g);
    }
    // colar e cinto de metal com faixa verde acesa
    const metal = this.mat({ map: null, color: 0x8c9498, emissive: 0x101414 });
    this.glowMat = this.mat({ map: null, color: 0x60ff90, lit: false });
    const ring = (r, tube, parent, y, glow) => {
      const g = ensureColor(new THREE.TorusGeometry(r, tube, 4, 14));
      g.rotateX(Math.PI / 2);
      const m = this.mesh(g, glow ? this.glowMat : metal);
      m.position.y = y; m.scale.z = D.torsoSz + 0.12;
      parent.add(m);
      return m;
    };
    ring(D.neckR * 1.7, 0.028, B.neck, 0.02, false);
    ring(D.neckR * 1.95, 0.012, B.neck, 0.02, true);
    ring(D.torsoW * 0.66, 0.032, B.torso, D.torso * 0.42, false);
    ring(D.torsoW * 0.7, 0.013, B.torso, D.torso * 0.42, true);
    // pingente do colar e fivela
    for (const [parent, y, z, s] of [[B.torso, D.torso * 0.86, D.torsoW * 0.62, 0.05], [B.torso, D.torso * 0.42, D.torsoW * 0.5, 0.045]]) {
      const g = ensureColor(new THREE.OctahedronGeometry(s, 0));
      const m = this.mesh(g, this.glowMat); m.position.set(0, y, z); m.scale.z = 0.45;
      parent.add(m);
    }
    // escudo psíquico: bolha somada à cena em volta do corpo
    this.shieldMat = shieldMat();
    const sg = new THREE.SphereGeometry(1, 18, 12);
    this.shield = new THREE.Mesh(sg, this.shieldMat);
    this.shield.frustumCulled = false; this.shield.renderOrder = 7;
    this.shield.position.y = 1.2; this.shield.scale.set(1.25, 1.42, 1.25);
    this.root.add(this.shield);
    this.shieldSphere = { bone: this.root, off: v3(0, 1.25, 0), r: 1.3, part: 'shield' };
    // orbe grande entre as mãos
    B.orb = joint(B.torso, 0, D.torso * 0.85, 0.6);
    this._makeOrb(B.orb);
    // anel da onda de choque (no chão, fora do corpo)
    this.ringMat = addMat({ color: 0xffffff, side: THREE.DoubleSide });
    // anel no chão (borda acesa, miolo some) e uma parede baixa de luz na frente da onda
    const rg = new THREE.RingGeometry(0.86, 1, 40, 1);
    rg.rotateX(-Math.PI / 2);
    const rp = rg.getAttribute('position'), cl = [];
    for (let i = 0; i < rp.count; i++) { const k = Math.hypot(rp.getX(i), rp.getZ(i)) > 0.95 ? 1 : 0; cl.push(0.75 * k, 0.45 * k, 1 * k); }
    rg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    this.ringMesh = new THREE.Mesh(rg, this.ringMat);
    this.ringMesh.frustumCulled = false; this.ringMesh.visible = false; this.ringMesh.renderOrder = 5;
    const wg = new THREE.CylinderGeometry(1, 1, 0.7, 40, 1, true); wg.translate(0, 0.35, 0);
    const wp = wg.getAttribute('position'), wc = [];
    for (let i = 0; i < wp.count; i++) { const k = wp.getY(i) < 0.1 ? 1 : 0; wc.push(0.6 * k, 0.5 * k, 1 * k); }
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    const wall = new THREE.Mesh(wg, this.ringMat); wall.frustumCulled = false; wall.renderOrder = 5;
    this.ringMesh.add(wall);
    this.scene.add(this.ringMesh);
    this.spheres = [
      { bone: B.head, off: v3(0, 0.3, 0.02), r: 0.32, part: 'head' },
      { bone: B.torso, off: v3(0, 0.42, 0), r: 0.25, part: 'body' },
      { bone: B.torso, off: v3(0, 0.14, 0), r: 0.21, part: 'body' },
    ];
  }

  _go(s) { this.state = s; this.st = 0; this.fired = false; this.slammed = false; this.summoned = false; this.enter = true; }

  // ---------- escudo ----------
  breakShield() {
    if (!this.shielded) return;
    this.shielded = false; this.vulnT = 7; this.rayHits = 0;
    const i = this.spheres.indexOf(this.shieldSphere);
    if (i >= 0) this.spheres.splice(i, 1);
    const c = v3(this.pos.x, this.pos.y + this.lift + 1.2, this.pos.z);
    for (let k = 0; k < 26; k++) {
      const n = v3(rnd(1), rnd(1), rnd(1)).normalize();
      this.effects.spawn({ p: c.clone().addScaledVector(n, 1.3), v: n.multiplyScalar(3 + Math.random() * 3), life: 0.5 + Math.random() * 0.4, s0: 0.08, s1: 0, color: k % 3 ? [0.7, 0.5, 1] : [0.85, 1, 0.9], grav: 3, drag: 1.5 });
    }
    this.flashLight = { x: c.x, y: c.y, z: c.z, t: 0.3 };
    if (this.combat) this.combat.shake = Math.max(this.combat.shake, 0.35);
    ETS.shatter(this.audio, this._dP || 8);
    if (!this.dead) this._go('stagger');
  }

  raiseShield() {
    this.shielded = true; this.rayHits = 0; this.shieldK = 0;
    if (!this.spheres.includes(this.shieldSphere)) this.spheres.push(this.shieldSphere);
    ETS.shieldUp(this.audio, this._dP || 8);
  }

  onHurt(dmg, info) {
    if (this.shielded) {
      this.shieldFlash = 1;
      if (info.kind === 'ray') { this.rayHits++; if (this.rayHits >= 3) this.breakShield(); }
      else if (info.kind === 'explosion') this.breakShield();
      else if (!info.beam) ETS.blink(this.audio, this._dP || 8);
    } else if (!info.beam) {
      ETS.squeal(this.audio, 6, 0.45);
      this.glowK = 1;
    }
  }

  onDeath() {
    ETS.voice(this.audio, 4, 2.4);
    ETS.death(this.audio, 4, 0.4);
    this._showOrb(false);
    if (this.shielded) {
      // a bolha estoura junto
      const c = v3(this.pos.x, this.pos.y + this.lift + 1.2, this.pos.z);
      for (let k = 0; k < 18; k++) { const n = v3(rnd(1), rnd(1), rnd(1)).normalize(); this.effects.spawn({ p: c.clone().addScaledVector(n, 1.3), v: n.multiplyScalar(3), life: 0.5, s0: 0.08, s1: 0, color: [0.7, 0.5, 1], drag: 1.5 }); }
    }
    this.shielded = false; this.shield.visible = false;
    this.wave = null; this.ringMesh.visible = false;
    if (this.combat?.boss === this) this.combat.boss = null;
  }

  // ---------- IA ----------
  think(dt, env) {
    const { dx, dz, d, ang } = this.toPlayer(env), A = this.audio, C = env.combat;
    const enter = this.enter; this.enter = false;
    this.age += dt; this.lookA = ang; this._dP = d;
    this.cool -= dt; this.summonCool -= dt;
    if (!this.shielded) {
      this.vulnT -= dt;
      if (this.vulnT <= 0 && (this.state === 'hover' || this.state === 'idle')) this._go('reshield');
    }
    let mvx = 0, mvz = 0, faceK = 4, lift = 0.28 + Math.sin(this.age * 1.4) * 0.07;
    switch (this.state) {
      case 'descend': {
        // desce do raio da nave devagar
        lift = Math.max(0.28, this.lift - dt * 1.6);
        this.lift = lift;
        if (lift <= 0.29) { this._go('hover'); ETS.voice(A, d); }
        break;
      }
      case 'idle': {
        faceK = 1.5;
        if (env.playerAlive && (d < this.wake || this.hp < this.maxHp)) { this._go('hover'); ETS.voice(A, d); }
        break;
      }
      case 'hover': {
        if (this.bossBar && C && !C.boss) C.boss = this;
        if (!env.playerAlive) break;
        // flutua mantendo distância, de lado
        const fx = dx / (d || 1), fz = dz / (d || 1);
        const f = d > 13 ? 1 : d < 7 ? -0.8 : 0;
        this.strafeT -= dt;
        if (this.strafeT <= 0 || this.stuck) { this.side *= -1; this.strafeT = 2 + Math.random() * 3; }
        mvx = (fx * f + fz * this.side * 0.7) * 1.7; mvz = (fz * f - fx * this.side * 0.7) * 1.7;
        if (this.cool <= 0) {
          const nET = Alien.countETs(C);
          const r = Math.random();
          if (this.summonCool <= 0 && nET < 3) this._go('summon');
          else if (d < 6.5 && r < 0.65) this._go('quake');
          else if (r < 0.75 || d > 10) this._go('fan');
          else this._go('quake');
          if (this.state !== 'hover') ETS.voice(A, d, 1.1);
        }
        break;
      }
      case 'fan': {
        // carrega o orbe grande e solta um leque de 3–5
        faceK = 7;
        if (enter) SFX.psychic(A, d);
        if (this.st > 0.9 && !this.fired) { this.fired = true; this._fan(env); }
        if (this.st > 1.35) { this.cool = 2 + Math.random() * 1.5; this._go('hover'); }
        break;
      }
      case 'quake': {
        // sobe com os braços erguidos e bate no chão: anel de choque (pular evita)
        faceK = 3;
        if (this.st < 0.85) lift = 0.28 + this.st * 1.1;
        else lift = Math.max(0.05, 1.2 - (this.st - 0.85) * 14);
        if (this.st > 0.92 && !this.slammed) { this.slammed = true; this._slam(); }
        if (this.st > 1.7) { this.cool = 2.2 + Math.random() * 1.5; this._go('hover'); }
        break;
      }
      case 'summon': {
        // braços abertos, colar acende, chama dois pequenos
        faceK = 2; lift = 0.28 + Math.min(this.st, 1) * 0.5;
        if (this.st > 1.0 && !this.summoned) { this.summoned = true; this._summon(env); }
        if (this.st > 1.6) { this.cool = 2.5; this.summonCool = 14 + Math.random() * 6; this._go('hover'); }
        break;
      }
      case 'stagger': {
        // escudo quebrado: cai quase no chão, cambaleando
        faceK = 0.8; lift = 0.06 + Math.max(0, 0.25 - this.st * 0.5);
        if (this.st > 1.6) { this.cool = Math.max(this.cool, 1.2); this._go('hover'); }
        break;
      }
      case 'reshield': {
        faceK = 2;
        if (enter) this.raiseShield();
        if (this.st > 1.0) { this.cool = Math.max(this.cool, 1); this._go('hover'); }
        break;
      }
    }
    if (this.state !== 'descend') this.lift = damp(this.lift, lift, this.state === 'quake' && this.st > 0.85 ? 30 : 5, dt);
    if (mvx || mvz) this.step(dt, mvx, mvz, true);
    if (faceK) this.face(dt, ang, faceK);
    this.stickGround(dt);
    this._fx(dt, env);
  }

  _fan(env) {
    this.root.updateMatrixWorld(true);
    const o = this.bones.orb.getWorldPosition(v3()), P = env.player.pos;
    const n = this.hp > this.maxHp * 0.5 ? 3 : 5, spread = n === 3 ? 0.26 : 0.22;
    const tx = P.x - o.x, ty = P.y + 1.1 - o.y, tz = P.z - o.z, hd = Math.hypot(tx, tz) || 1;
    const aim = Math.atan2(tx, tz), pitch = Math.atan2(ty, hd);
    for (let i = 0; i < n; i++) {
      const a = aim + (i - (n - 1) / 2) * spread, sp = 10;
      env.combat.projectile({ p: o.clone(), v: v3(Math.sin(a) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, Math.cos(a) * Math.cos(pitch) * sp), kind: 'psy', dmg: 10, owner: 'enemy', size: 0.2, color: [0.7, 0.4, 1], light: [0.6, 0.3, 1], homing: 0.35, life: 3.2, knock: 4 });
    }
    for (let i = 0; i < 10; i++) this.effects.spawn({ p: o.clone(), v: v3(rnd(2.5), rnd(2.5), rnd(2.5)), life: 0.25, s0: 0.1, s1: 0, color: i % 2 ? ORB_A : ORB_B, drag: 3 });
    ETS.zap(this.audio, hd, 0.55);
  }

  _slam() {
    const g = this.ground();
    this.wave = { x: this.pos.x, z: this.pos.z, y: g, r: 0.4, hit: false };
    this.ringMesh.visible = true;
    SFX.quake(this.audio, this._dP || 5);
    if (this.combat) this.combat.shake = Math.max(this.combat.shake, 0.5);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU, s = 9 + Math.random() * 2;
      this.effects.spawn({ p: v3(this.pos.x + Math.sin(a) * 0.6, g + 0.15, this.pos.z + Math.cos(a) * 0.6), v: v3(Math.sin(a) * s, 0.6 + Math.random(), Math.cos(a) * s), life: 0.62, s0: 0.14, s1: 0.04, color: i % 2 ? [0.6, 0.45, 1] : [0.35, 0.3, 0.28], drag: 0.6 });
    }
  }

  _summon(env) {
    const C = env.combat, n = Math.min(2, 4 - Alien.countETs(C));
    const P = env.player.pos;
    for (let i = 0; i < n; i++) {
      const s = i ? -1 : 1, rx = Math.cos(this.heading) * s, rz = -Math.sin(this.heading) * s;
      let x = this.pos.x + rx * 3 + Math.sin(this.heading) * 1.5, z = this.pos.z + rz * 3 + Math.cos(this.heading) * 1.5;
      if (this._free(x, z) === null) { x = this.pos.x + Math.sin(this.heading) * 2 + rnd(1); z = this.pos.z + Math.cos(this.heading) * 2 + rnd(1); }
      const et = new ET(this.deps, { state: 'arrive' });
      et.place(x, z, Math.atan2(P.x - x, P.z - z));
      C.spawn(et);
      // risco de luz do colar até o pequeno
      this.root.updateMatrixWorld(true);
      const o = this.bones.neck.getWorldPosition(v3());
      for (let k = 0; k < 8; k++) {
        const f = k / 8;
        this.effects.spawn({ p: v3(lerp(o.x, x, f), lerp(o.y, et.pos.y + 0.8, f), lerp(o.z, z, f)), v: v3(rnd(0.3), 0.4, rnd(0.3)), life: 0.35, s0: 0.07, s1: 0, color: GREEN });
      }
    }
    if (n <= 0) this.summonCool = 6;
  }

  // escudo pulsando, orbe, colar aceso, onda de choque
  _fx(dt, env) {
    const S = this.shieldMat.uniforms;
    S.uTime.value = this.age;
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 4);
    this.shieldK = this.shielded ? Math.min(1, this.shieldK + dt * 1.6) : Math.max(0, this.shieldK - dt * 6);
    this.shield.visible = this.shieldK > 0.01;
    if (this.shield.visible) {
      const k = this.shieldK;
      this.shield.scale.set(1.25 * k, 1.42 * k, 1.25 * k);
      this.shield.rotation.y = this.age * 0.3;
      const hits = this.rayHits / 3;
      S.uOpacity.value = (0.55 + 0.18 * Math.sin(this.age * 3.1) + this.shieldFlash * 1.2) * (1 - hits * 0.35) * (this.dead ? 0 : 1);
      // rachando: fica mais esverdeado a cada raio
      S.uColor.value.setRGB(lerp(0.55, 0.4, hits), lerp(0.3, 0.9, hits), lerp(1, 0.6, hits));
    }
    // colar
    this.glowK = Math.max(0, this.glowK - dt * 2);
    const busy = this.state === 'summon' ? 1 : this.state === 'fan' || this.state === 'quake' ? 0.5 : 0;
    const gk = 0.55 + 0.25 * Math.sin(this.age * 4) + busy * 0.6 + this.glowK * 0.5;
    this.glowMat.uniforms.uColor.value.setRGB(GREEN[0] * gk, GREEN[1] * gk, GREEN[2] * gk);
    if (!this.dead) {
      this.root.updateMatrixWorld(true);
      const p = this.bones.neck.getWorldPosition(this._t2);
      this.atmo?.light(p.x, p.y, p.z + 0, [0.25 * gk, 0.8 * gk, 0.4 * gk], 4 + busy * 4, 5);
      if (this.shielded && this.shield.visible) this.atmo?.light(this.pos.x, this.pos.y + 1.2, this.pos.z, [0.35, 0.2, 0.7], 5, 5);
    }
    // orbe do leque
    const on = this.state === 'fan' && !this.fired;
    const k = clamp(this.st / 0.9, 0, 1), c = mix3(ORB_A, ORB_B, 0.5 + 0.5 * Math.sin(this.st * 18));
    this._showOrb(on, 0.05 + 0.16 * k, c);
    if (on) {
      const p = this.bones.orb.getWorldPosition(this._t2);
      this.atmo?.light(p.x, p.y, p.z, [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)], 4 + k * 4, 6);
      if (Math.random() < 0.6) {
        const o = v3(rnd(1), rnd(1), rnd(1)).normalize().multiplyScalar(0.6);
        this.effects.spawn({ p: v3(p.x + o.x, p.y + o.y, p.z + o.z), v: o.multiplyScalar(-3), life: 0.18, s0: 0.05, s1: 0.01, color: Math.random() < 0.5 ? ORB_A : ORB_B });
      }
    }
    // aviso da onda: brilho subindo do chão
    if (this.state === 'quake' && this.st < 0.9 && Math.random() < 0.5) {
      const a = Math.random() * TAU, r = 0.5 + Math.random() * 1.2, g = this.ground();
      this.effects.spawn({ p: v3(this.pos.x + Math.sin(a) * r, g + 0.1, this.pos.z + Math.cos(a) * r), v: v3(0, 2 + Math.random() * 2, 0), life: 0.4, s0: 0.06, s1: 0, color: ORB_A });
    }
    // onda de choque correndo pelo chão
    const W = this.wave;
    if (W) {
      const r0 = W.r;
      W.r += dt * 11;
      this.ringMesh.position.set(W.x, W.y + 0.12, W.z);
      this.ringMesh.scale.set(W.r, 1, W.r);
      this.ringMat.uniforms.uOpacity.value = clamp(1.3 - W.r / 6.5, 0, 1);
      this.atmo?.light(W.x, W.y + 0.6, W.z, [0.6, 0.4, 1.1], W.r + 3, 6);
      if (env.playerAlive && !W.hit) {
        const P = env.player.pos, pd = Math.hypot(P.x - W.x, P.z - W.z);
        if (pd > r0 - 0.3 && pd <= W.r + 0.3 && pd <= 6.2 && env.player.grounded && Math.abs(P.y - W.y) < 1.6) {
          W.hit = true;
          env.combat.hurt(14, (P.x - W.x) / (pd || 1), (P.z - W.z) / (pd || 1), { knock: 7 });
        }
      }
      if (W.r > 7) { this.wave = null; this.ringMesh.visible = false; }
    }
  }

  // ---------- animação ----------
  animate(dt) {
    const s = this.state, t = this.st;
    this._vel(dt);
    const T = {
      lean: 0.04, sway: Math.sin(this.age * 0.9) * 0.04, twist: 0, headX: -0.05, headY: clamp(wrapA(this.lookA - this.heading), -0.7, 0.7), headZ: Math.sin(this.age * 0.6) * 0.1,
      crouch: 0, armIn: 0, armF: [0.35, 0.25], armOut: [0.35, 0.35], elbow: [0.9, 0.7], claw: 0.3, noWalk: true,
    };
    if (s === 'fan') {
      const k = clamp(t / 0.9, 0, 1);
      if (!this.fired) { T.armF = [1.05, 1.05]; T.armOut = [-0.02, -0.02]; T.armIn = 0.16; T.elbow = [0.85, 0.85]; T.claw = -0.3; T.headX = 0.1 * k; T.lean = -0.05; }
      else { T.armF = [1.4, 1.4]; T.armOut = [0.45, 0.45]; T.elbow = [0.05, 0.05]; T.lean = -0.15; T.claw = -0.6; T.snap = 20; }
    } else if (s === 'quake') {
      if (t < 0.88) { T.armF = [2.8, 2.8]; T.armOut = [0.5, 0.5]; T.elbow = [0.4, 0.4]; T.headX = -0.4; T.lean = -0.12; T.crouch = 0.1; }
      else { T.armF = [0.9, 0.9]; T.armOut = [0.2, 0.2]; T.elbow = [0.1, 0.1]; T.headX = 0.35; T.lean = 0.35; T.crouch = 0.7; T.snap = 30; }
    } else if (s === 'summon') {
      T.armF = [1.4, 1.4]; T.armOut = [1.3, 1.3]; T.elbow = [0.15, 0.15]; T.headX = -0.55; T.lean = -0.1; T.claw = -0.5;
    } else if (s === 'stagger') {
      const k = Math.sin(clamp(t / 1.6, 0, 1) * Math.PI);
      T.lean = 0.45 * k; T.crouch = 0.8 * k; T.headX = 0.4 * k; T.headZ = Math.sin(t * 5) * 0.3 * k; T.armF = [1.6 * k, 1.3 * k]; T.armOut = [0.2, 0.2]; T.elbow = [1.8 * k, 1.9 * k];
    } else if (s === 'reshield') {
      T.armOut = [1.0, 1.0]; T.armF = [0.6, 0.6]; T.elbow = [0.5, 0.5]; T.headX = -0.3;
    } else if (s === 'descend') {
      T.armOut = [0.7, 0.7]; T.armF = [0.2, 0.2]; T.elbow = [0.2, 0.2]; T.headX = 0.1;
    } else if (s === 'dead') {
      const k = Math.exp(-this.deadT * 1.1) * (this.deadT < 3 ? 1 : 0);
      T.jit = 0.2 * k; T.crouch = 0.9; T.armOut = [1.0, 0.6]; T.armF = [0.4, 1.0]; T.elbow = [1.0, 0.3]; T.headX = -0.5;
      this.lift = damp(this.lift, 0, 6, dt);
    }
    this._apply(dt, T);
  }

  dispose() {
    super.dispose();
    this.scene.remove(this.ringMesh);
    this.ringMesh.traverse(o => o.geometry?.dispose());
    for (const m of [this.shieldMat, this.ringMat]) m.dispose();
  }
}

// ---------- DISCO VOADOR (cenário) ----------
const LIGHT_COLS = [[1, 0.12, 0.08], [1, 0.7, 0.1], [0.25, 1, 0.3], [0.2, 0.55, 1], [1, 1, 1]];
const N_RIM = 20, N_LENS = 8;
// focos de fogo na nave caída: [x, y, z] no espaço do corpo, no lado que ficou para cima (+x)
const FIRES = [[4.0, 0.6, 1.2], [2.6, 0.75, -2.9], [-0.3, 1.9, 0.9]];
// perfil do casco [y, raio]: barriga rasa, borda fina, tampa até a cúpula
const HULL = [[-1.06, 0], [-1.02, 1.0], [-0.92, 2.2], [-0.74, 3.5], [-0.47, 4.8], [-0.2, 5.68], [-0.05, 5.98], [0.04, 6.0], [0.16, 5.78], [0.4, 4.95], [0.64, 3.7], [0.84, 2.5], [0.9, 2.2], [0.93, 0]];
const UNDER = [0.4, 0.41, 0.45], METAL = [0.6, 0.62, 0.66], TOPC = [0.48, 0.5, 0.54], RIMC = [0.78, 0.8, 0.84];

// o: { scene, atmo, effects, audio, ctx?, player?, combat? }  (ctx sai de atmo.ctx se faltar)
export class Saucer {
  constructor(o) {
    this.scene = o.scene; this.atmo = o.atmo; this.effects = o.effects; this.audio = o.audio;
    this.ctx = o.ctx || o.atmo?.ctx || null; this.player = o.player || null; this.combat = o.combat || null;
    this.pos = v3(); this.target = v3(); this.vel = v3();
    this.speed = 8; this.t = Math.random() * 10; this.beamK = 0; this.beaming = false;
    this.visible = false; this.crashed = false; this.crashing = null; this.onCrash = null;
    this.humT = 0; this.beamHumT = 0; this.partT = 0; this.sparkT = 1; this.smokeT = 0;
    this.mats = [];
    this.root = new THREE.Group(); this.root.visible = false;
    this._v = v3();
    this._build();
    this.scene.add(this.root);
  }

  _mat(o) { const m = ps1Material(o); this.mats.push(m); return m; }
  _mesh(geo, mat, parent) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; parent.add(m); return m; }

  _build() {
    const R = this.root;
    this.body = joint(R);       // balanço e inclinação
    this.spin = joint(this.body); // gira devagar
    // casco
    const hullCol = (t, a) => {
      const rimK = Math.exp(-(((t - 0.545) / 0.06) ** 2));
      let c = t < 0.545 ? mix3(UNDER, METAL, Math.pow(t / 0.545, 1.5)) : mix3(METAL, TOPC, (t - 0.545) / 0.455);
      c = mix3(c, RIMC, rimK * 0.8);
      const k = 0.92 + 0.08 * Math.sin(a * 3);
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    this.hullMat = this._mat({ map: hullTex(), emissive: 0x272b33 });
    this.hullMat.uniforms.uFogMul.value = 0.35;
    this._mesh(blob(HULL, 28, { col: hullCol, uRep: 14, vRep: 4 }), this.hullMat, this.spin);
    // faixa escura na borda (onde ficam as luzes)
    const band = blob([[-0.12, 6.02], [0, 6.1], [0.12, 6.02]], 28, { col: () => [0.18, 0.19, 0.21] });
    this._mesh(band, this._mat({ map: null, lit: false, fog: false, color: 0x7a8890 }), this.spin);
    // cúpula de vidro escuro com brilho esverdeado por dentro
    this.domeMat = this._mat({ map: null, lit: false, fog: true });
    this.domeMat.uniforms.uFogMul.value = 0.25;
    this._mesh(blob([[0.88, 2.28], [1.25, 2.16], [1.62, 1.86], [1.96, 1.35], [2.2, 0.75], [2.3, 0]], 18, { col: t => mix3([0.22, 0.66, 0.54], [0.04, 0.12, 0.12], Math.pow(t, 0.8)) }), this.domeMat, this.spin);
    // aro de metal na base da cúpula e antena
    this._mesh(blob([[0.82, 2.42], [0.92, 2.42], [0.98, 2.25]], 18, { col: () => [0.5, 0.52, 0.56] }), this.hullMat, this.spin);
    const ant = cone(0.9, 0.06, [0.5, 0.5, 0.52], [0.3, 0.3, 0.32], 4); ant.translate(0, 2.25, 0);
    this._mesh(ant, this.hullMat, this.spin);
    // luzes da borda: cubinhos sem luz que trocam de cor
    const lg = ensureColor(new THREE.BoxGeometry(0.42, 0.26, 0.42));
    this.lightMat = this._mat({ map: null, lit: false, fog: false });
    this.rim = new THREE.InstancedMesh(lg, this.lightMat, N_RIM);
    this.rim.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = v3(1, 1, 1), white = new THREE.Color(1, 1, 1);
    this.halos = [];
    const gt = glowTex();
    for (let i = 0; i < N_RIM; i++) {
      const a = (i / N_RIM) * TAU, x = Math.sin(a) * 6.08, z = Math.cos(a) * 6.08;
      q.setFromAxisAngle(v3(0, 1, 0), a);
      m4.compose(v3(x, 0, z), q, s1);
      this.rim.setMatrixAt(i, m4); this.rim.setColorAt(i, white);
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      h.position.set(Math.sin(a) * 6.25, 0, Math.cos(a) * 6.25); h.scale.setScalar(2.4);
      h.frustumCulled = false; h.renderOrder = 6;
      this.spin.add(h); this.halos.push(h);
    }
    this.spin.add(this.rim);
    // lentes embaixo, em volta, e a lente grande do centro
    this.lensMat = this._mat({ map: null, lit: false, fog: false });
    const lens = [];
    for (let i = 0; i < N_LENS; i++) {
      const a = (i / N_LENS) * TAU + 0.2, g = ensureColor(new THREE.CircleGeometry(0.42, 8));
      g.rotateX(Math.PI / 2); g.translate(Math.sin(a) * 3.55, -0.69, Math.cos(a) * 3.55);
      lens.push(g);
    }
    this.lenses = lens.map(g => this._mesh(g, this._mat({ map: null, lit: false, fog: false }), this.spin));
    const cg = ensureColor(new THREE.CircleGeometry(1.15, 18)); cg.rotateX(Math.PI / 2); cg.translate(0, -1.075, 0);
    this.centerMat = this._mat({ map: null, lit: false, fog: false });
    this._mesh(cg, this.centerMat, this.body);
    this.centerHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0x80ffb0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.centerHalo.position.y = -1.3; this.centerHalo.scale.setScalar(4); this.centerHalo.renderOrder = 6;
    this.body.add(this.centerHalo);
    this.topHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.topHalo.position.y = 3.2; this.topHalo.scale.setScalar(1.2); this.topHalo.renderOrder = 6;
    this.spin.add(this.topHalo);
    // raio: dois cones somados, riscos rolando para baixo
    const beamGeo = (r0, r1, c0, c1) => {
      const g = new THREE.CylinderGeometry(r0, r1, 1, 22, 4, true); g.translate(0, -0.5, 0);
      const p = g.getAttribute('position'), cl = [];
      for (let i = 0; i < p.count; i++) { const k = Math.pow(1 + p.getY(i), 1.6); cl.push(lerp(c1[0], c0[0], k), lerp(c1[1], c0[1], k), lerp(c1[2], c0[2], k)); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      return g;
    };
    this.beamMat = addMat({ map: streakTex(), side: THREE.DoubleSide, scroll: [0.02, 0.55], opacity: 0 });
    this.beamMat2 = addMat({ map: streakTex(), side: THREE.DoubleSide, scroll: [-0.03, 0.9], opacity: 0 });
    this.beamG = joint(R);
    this.beam1 = this._mesh(beamGeo(1.1, 6.6, [0.5, 0.75, 0.6], [0.04, 0.08, 0.06]), this.beamMat, this.beamG);
    this.beam2 = this._mesh(beamGeo(0.7, 3.2, [0.8, 1, 0.85], [0.08, 0.14, 0.1]), this.beamMat2, this.beamG);
    for (const b of [this.beam1, this.beam2]) b.renderOrder = 5;
    // mancha de luz no chão
    const sg = new THREE.CircleGeometry(6.8, 28); sg.rotateX(-Math.PI / 2);
    const sp = sg.getAttribute('position'), sc = [];
    for (let i = 0; i < sp.count; i++) { const k = Math.pow(Math.max(0, 1 - Math.hypot(sp.getX(i), sp.getZ(i)) / 6.8), 1.2); sc.push(0.45 * k, 0.65 * k, 0.5 * k); }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    this.spotMat = addMat({ opacity: 0 });
    this.spotMat.polygonOffset = true; this.spotMat.polygonOffsetFactor = -4; this.spotMat.polygonOffsetUnits = -4;
    this.spot = this._mesh(sg, this.spotMat, R);
    this.spot.renderOrder = 4;
    this.beamG.visible = this.spot.visible = false;
    this.wreck = null;
  }

  ground(x = this.pos.x, z = this.pos.z) { return this.ctx ? this.ctx.groundAt(x, z, 1000) : 0; }
  _dist() { return this.player ? this.player.pos.distanceTo(this.pos) : 40; }

  show(x, y, z) {
    this.pos.set(x, y, z); this.target.set(x, y, z); this.vel.set(0, 0, 0);
    this.visible = this.root.visible = true;
    if (this.crashed) this._uncrash();
    this.crashing = null;
    this.humT = 0;
    this._sync();
    return this;
  }

  hide() {
    this.visible = this.root.visible = false;
    this.beaming = false; this.beamK = 0;
    this.beamG.visible = this.spot.visible = false;
  }

  beam(on = true) {
    this.beaming = !!on;
    if (on) this.beamHumT = 0;
  }

  flyTo(x, y, z, speed = 8) {
    this.target.set(x, y, z); this.speed = speed;
    return this;
  }

  get arrived() { return this.pos.distanceTo(this.target) < 0.6 && this.vel.length() < 0.8; }

  // cai inclinado e fica fumegando no chão (instant = já caída, para a cena da nave)
  crash(x, z, instant = false) {
    const g = this.ground(x, z);
    this.beam(false); this.beamK = 0;
    if (instant || !this.visible) {
      this.visible = this.root.visible = true;
      this.pos.set(x, g, z);
      this._settle();
      return this;
    }
    const from = this.pos.clone(), dist = Math.hypot(x - from.x, z - from.z);
    this.crashing = { from, to: v3(x, g, z), t: 0, dur: clamp(dist / 16, 2.2, 5), spin: 0 };
    ETS.dive(this.audio, this._dist(), this.crashing.dur);
    return this;
  }

  // pousada torta, meio enterrada
  _settle() {
    this.crashing = null; this.crashed = true;
    this.vel.set(0, 0, 0); this.target.copy(this.pos);
    this.body.position.set(0, -0.45, 0);
    this.body.rotation.set(0.1, 0, 0.3);
    this.spin.rotation.y = 0.7;
    // chão queimado e pedaços espalhados
    if (!this.wreck) {
      const W = this.wreck = joint(this.root);
      const sg = new THREE.CircleGeometry(9.5, 22); sg.rotateX(-Math.PI / 2);
      const p = sg.getAttribute('position'), cl = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r > 1) { const k = 0.75 + Math.sin(Math.atan2(x, z) * 5) * 0.15 + Math.random() * 0.12; p.setXYZ(i, x * k, 0, z * k); }
        const c = mix3([0.05, 0.04, 0.035], [0.16, 0.13, 0.1], r / 9.5);
        cl.push(c[0], c[1], c[2]);
      }
      sg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      const scorch = this._mat({ map: null, polygonOffset: -3 });
      this._mesh(sg, scorch, W);
      const bits = ensureColor(new THREE.BoxGeometry(1, 0.12, 0.6));
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * TAU, r = 5 + Math.random() * 6, m = this._mesh(bits, this.hullMat, W);
        m.position.set(Math.sin(a) * r, 0.05, Math.cos(a) * r);
        m.rotation.set(rnd(0.4), Math.random() * TAU, rnd(0.4)); m.scale.setScalar(0.5 + Math.random() * 0.8);
      }
    }
    this.wreck.visible = true;
    this.wreck.position.y = 0.04;
  }

  _uncrash() {
    this.crashed = false;
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    if (this.wreck) this.wreck.visible = false;
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    const t = this.t;
    if (this.crashing) this._fall(dt);
    else if (this.crashed) this._wreck(dt);
    else {
      // vai até o alvo freando perto
      const to = this._v.copy(this.target).sub(this.pos), d = to.length();
      const want = d > 0.01 ? to.multiplyScalar(Math.min(this.speed, d * 0.7) / d) : to.set(0, 0, 0);
      this.vel.x = damp(this.vel.x, want.x, 1.4, dt); this.vel.y = damp(this.vel.y, want.y, 1.4, dt); this.vel.z = damp(this.vel.z, want.z, 1.4, dt);
      this.pos.addScaledVector(this.vel, dt);
      // balança devagar e inclina para onde vai
      this.body.position.y = Math.sin(t * 0.9) * 0.35;
      this.body.rotation.set(Math.sin(t * 0.7) * 0.035 + clamp(this.vel.z * 0.025, -0.25, 0.25), 0, Math.sin(t * 0.55) * 0.035 - clamp(this.vel.x * 0.025, -0.25, 0.25));
      this.spin.rotation.y += dt * 0.22;
    }
    this._lights(dt);
    this._beam(dt);
    // ronco em intervalos (um emenda no outro)
    this.humT -= dt;
    if (this.humT <= 0 && !this.crashed) { this.humT = 2.6; SFX.ufo(this.audio, this._dist(), 3.2); }
    if (this.beaming) { this.beamHumT -= dt; if (this.beamHumT <= 0) { this.beamHumT = 1.9; ETS.beam(this.audio, this._dist()); } }
    this._sync();
  }

  _sync() { this.root.position.copy(this.pos); }

  // anel de luzes correndo em cores, lentes pulsando, cúpula respirando
  _lights(dt) {
    const t = this.t, c = new THREE.Color(), dead = this.crashed || this.crashing;
    for (let i = 0; i < N_RIM; i++) {
      let col = LIGHT_COLS[(i + Math.floor(t * 3)) % LIGHT_COLS.length], k = (i + Math.floor(t * 9)) % 5 === 0 ? 0.15 : 1;
      const chase = Math.max(0, Math.cos(((i / N_RIM) * TAU - t * 2.4))) ** 6;
      k = Math.min(1.4, k + chase * 0.8);
      if (dead) {
        // quebrada: quase tudo apagado, umas poucas piscando
        const alive = i % 6 === 1;
        k = alive && Math.random() < (this.crashing ? 0.6 : 0.35) ? 0.9 : 0.04;
        col = alive ? LIGHT_COLS[i % 3] : [0.4, 0.4, 0.4];
      }
      this.rim.setColorAt(i, c.setRGB(col[0] * k, col[1] * k, col[2] * k));
      const h = this.halos[i];
      h.visible = k > 0.3;
      h.material.color.setRGB(col[0] * k * 0.8, col[1] * k * 0.8, col[2] * k * 0.8);
      h.scale.setScalar(2.1 + chase * 1.6);
    }
    this.rim.instanceColor.needsUpdate = true;
    this.lenses.forEach((m, i) => {
      const k = dead ? 0.05 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 3 - i * (TAU / N_LENS)));
      m.material.uniforms.uColor.value.setRGB(0.75 * k + 0.08, 1 * k + 0.1, 0.85 * k + 0.08);
    });
    const bk = this.beamK, pulse = 0.75 + 0.25 * Math.sin(t * 5);
    const ck = dead ? 0.08 + (Math.random() < 0.1 ? 0.3 : 0) : 0.45 * pulse + bk * 0.6;
    this.centerMat.uniforms.uColor.value.setRGB(0.7 * ck + 0.1, 1 * ck + 0.1, 0.8 * ck + 0.1);
    this.centerHalo.visible = !dead;
    this.centerHalo.material.color.setRGB(0.3 * ck + 0.2 * bk, 0.55 * ck + 0.3 * bk, 0.4 * ck + 0.25 * bk);
    this.centerHalo.scale.setScalar(4 + bk * 5);
    const dk = dead ? (Math.random() < 0.15 ? 0.6 : 0.25) : 0.8 + 0.35 * Math.sin(t * 1.7);
    this.domeMat.uniforms.uColor.value.setRGB(dk, dk, dk);
    this.topHalo.visible = !dead && Math.sin(t * 4) > 0.2;
    // luz do disco por baixo (pinta a barriga e o chão perto)
    if (!dead) {
      const by = this.pos.y + this.body.position.y - 2.4;
      this.atmo?.light(this.pos.x, by, this.pos.z, [0.45 + bk * 0.5, 0.75 + bk * 0.6, 0.55 + bk * 0.5], 10 + bk * 4, 5);
    }
  }

  _beam(dt) {
    const k = this.beamK = damp(this.beamK, this.beaming ? 1 : 0, 3, dt);
    const on = k > 0.02;
    this.beamG.visible = this.spot.visible = on;
    if (!on) return;
    const top = this.body.position.y - 1.05, g = this.ground(), h = Math.max(1, this.pos.y + top - g);
    this.beamG.position.y = top;
    this.beam1.scale.set(1, h, 1); this.beam2.scale.set(1, h, 1);
    const fl = 0.85 + Math.random() * 0.15;
    this.beamMat.uniforms.uOpacity.value = 0.85 * k * fl;
    this.beamMat2.uniforms.uOpacity.value = 0.7 * k * fl;
    this.spot.position.y = g - this.pos.y + 0.06;
    this.spotMat.uniforms.uOpacity.value = k * fl;
    // luz forte branca-esverdeada no chão
    this.atmo?.light(this.pos.x, g + 2.5, this.pos.z, [1.5 * k, 2 * k, 1.65 * k], 17, 6);
    // partículas subindo dentro do raio
    this.partT -= dt;
    while (this.partT <= 0) {
      this.partT += 0.05;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 4.8, x = this.pos.x + Math.sin(a) * r, z = this.pos.z + Math.cos(a) * r;
      const vy = 3.5 + Math.random() * 3.5, dark = Math.random() < 0.25;
      this.effects.spawn({ p: v3(x, g + 0.2 + Math.random() * 1.5, z), v: v3(Math.cos(a) * 0.8 - Math.sin(a) * 0.3, vy, -Math.sin(a) * 0.8 - Math.cos(a) * 0.3), life: Math.min(3, h / vy), s0: dark ? 0.06 : 0.07, s1: 0.02, color: dark ? [0.22, 0.2, 0.16] : [0.7, 1, 0.8], spin: dark ? 8 : 0 });
    }
  }

  // caindo: fumaça preta, faíscas, girando torto
  _fall(dt) {
    const F = this.crashing;
    F.t += dt;
    const k = clamp(F.t / F.dur, 0, 1), e = k * k;
    this.pos.x = lerp(F.from.x, F.to.x, k < 1 ? 1 - (1 - k) * (1 - k) : 1);
    this.pos.z = lerp(F.from.z, F.to.z, k < 1 ? 1 - (1 - k) * (1 - k) : 1);
    this.pos.y = lerp(F.from.y, F.to.y, e);
    F.spin += dt * (1 + k * 3);
    this.spin.rotation.y += dt * (0.5 + k * 2.5);
    this.body.rotation.set(Math.sin(F.t * 3) * 0.12 * (1 - k) + 0.1 * k, 0, 0.3 * k + Math.sin(F.t * 5) * 0.08 * (1 - k));
    this.body.position.y = -0.45 * k;
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.04;
      // fumaça preta, fogo na borda rachada e faíscas
      const p = this._v.set(this.pos.x + rnd(2), this.pos.y + 0.5, this.pos.z + rnd(2));
      this.effects.spawn({ p, v: v3(rnd(0.6), 1.2, rnd(0.6)), life: 1.6, s0: 0.6, s1: 2.2, color: [0.12, 0.11, 0.1], drag: 0.5, grav: -0.3 });
      this.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        const a = 0.6 + rnd(0.7), f = this.spin.localToWorld(v3(Math.sin(a) * 5.4, 0.4, Math.cos(a) * 5.4));
        this.effects.spawn({ p: f, v: v3(rnd(1), 2.5 + Math.random() * 2, rnd(1)), life: 0.5, s0: 0.8, s1: 0.15, color: Math.random() < 0.5 ? [1, 0.75, 0.3] : [1, 0.4, 0.1], drag: 1 });
      }
      if (Math.random() < 0.5) this.effects.spawn({ p: v3(this.pos.x + rnd(5), this.pos.y, this.pos.z + rnd(5)), v: v3(rnd(4), 2 + Math.random() * 3, rnd(4)), life: 0.5, s0: 0.06, s1: 0, color: [1, 0.8, 0.4], grav: 8 });
    }
    this.atmo?.light(this.pos.x, this.pos.y - 3, this.pos.z, [2.2, 1.1, 0.45], 22, 7);
    if (k >= 1) {
      // impacto
      const p = this.pos, d = this._dist();
      for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, s = 4 + Math.random() * 7; this.effects.spawn({ p: v3(p.x, p.y + 0.5, p.z), v: v3(Math.sin(a) * s, 3 + Math.random() * 6, Math.cos(a) * s), life: 1.3, s0: 0.12, s1: 0.08, color: [0.3, 0.24, 0.18], grav: 12, bounce: 0.2, spin: 10 }); }
      for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, s = 3 + Math.random() * 6; this.effects.spawn({ p: v3(p.x, p.y + 1, p.z), v: v3(Math.sin(a) * s, 2 + Math.random() * 4, Math.cos(a) * s), life: 0.6, s0: 0.06, s1: 0, color: [1, 0.85, 0.45], grav: 9 }); }
      for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; this.effects.spawn({ p: v3(p.x + Math.sin(a) * 3, p.y + 0.5, p.z + Math.cos(a) * 3), v: v3(Math.sin(a) * 2, 1.5 + Math.random(), Math.cos(a) * 2), life: 2.5, s0: 1, s1: 3, color: [0.2, 0.18, 0.16], drag: 1, grav: -0.3 }); }
      ETS.crash(this.audio, d);
      if (this.combat) this.combat.shake = Math.max(this.combat.shake, clamp(1.2 - d / 60, 0.2, 0.9));
      this.flashT = 0.4;
      this._settle();
      this.onCrash?.(this);
    }
  }

  // caída: fumaça subindo, faíscas de vez em quando, brilho verde fraco piscando
  _wreck(dt) {
    const p = this.pos;
    this.root.updateMatrixWorld(true);
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.09;
      const s = this.spin.localToWorld(this._v.set(rnd(1.5), 1.2, rnd(1.5)));
      const g = 0.12 + Math.random() * 0.1;
      this.effects.spawn({ p: s.clone(), v: v3(rnd(0.4) + 0.3, 1.4 + Math.random(), rnd(0.4)), life: 3, s0: 0.35, s1: 1.4, color: [g, g * 0.95, g * 0.9], drag: 0.3, grav: -0.25 });
    }
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.5 + Math.random() * 1.6;
      const a = rnd(1.4), s = this.body.localToWorld(this._v.set(Math.cos(a) * 5.9, 0.1, Math.sin(a) * 5.9)).clone();
      for (let i = 0; i < 7; i++) this.effects.spawn({ p: s.clone(), v: v3(rnd(2.5), 1 + Math.random() * 2.5, rnd(2.5)), life: 0.45, s0: 0.045, s1: 0, color: [0.8, 1, 0.9], grav: 9 });
      this.sparkFlash = { p: s, t: 0.12 };
      ETS.crackle(this.audio, this._dist());
    }
    if (this.sparkFlash) { this.sparkFlash.t -= dt; const s = this.sparkFlash.p; this.atmo?.light(s.x, s.y + 0.3, s.z, [1.2, 1.5, 1.4], 6, 4); if (this.sparkFlash.t <= 0) this.sparkFlash = null; }
    if (this.flashT > 0) { this.flashT -= dt; this.atmo?.light(p.x, p.y + 3, p.z, [3, 1.6, 0.8], 25, 9); }
    // focos de fogo na carcaça (chuva não apaga)
    this.fireT = (this.fireT || 0) - dt;
    if (this.fireT <= 0) {
      this.fireT = 0.06;
      const [fx, fy, fz] = FIRES[Math.floor(Math.random() * FIRES.length)];
      const f = this.body.localToWorld(this._v.set(fx + rnd(0.4), fy, fz + rnd(0.4)));
      this.effects.spawn({ p: f.clone(), v: v3(rnd(0.4), 1.6 + Math.random() * 1.2, rnd(0.4)), life: 0.55, s0: 0.45, s1: 0.08, color: Math.random() < 0.5 ? [1, 0.7, 0.25] : [1, 0.38, 0.08], drag: 1 });
    }
    const fk = 0.75 + Math.random() * 0.35;
    const fp = this.body.localToWorld(this._v.set(2.6, 2.2, 0));
    this.atmo?.light(fp.x, fp.y, fp.z, [1.5 * fk, 0.75 * fk, 0.25 * fk], 13, 4);
    const gk = Math.random() < 0.08 ? 0.15 : 0.5 + 0.15 * Math.sin(this.t * 7);
    this.atmo?.light(p.x, p.y + 1.5, p.z, [0.25 * gk, 0.75 * gk, 0.45 * gk], 9, 3);
    if (Math.random() < dt * 0.4) SFX.ufo(this.audio, this._dist() * 1.6, 1.2);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
    for (const m of [...this.mats, this.beamMat, this.beamMat2, this.spotMat]) m.dispose();
  }
}
