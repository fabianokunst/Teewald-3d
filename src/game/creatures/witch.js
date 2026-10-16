import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, ellipsoid, joint, mix3, lerp, clamp, wrapA, damp, smooth, paint, TAU } from './shapes.js';
import { SFX, noise, tone, fall } from './sfx.js';
import { ps1Material, ensureColor } from '../../engine/ps1material.js';
import { makeCanvas, canvasTex } from '../../engine/textures.js';

// A Bruxa Otília (die Hex, em hunsrik): a curandeira Otília Kranz, enterrada viva
// pelos colonos em 1878, acusada de matar o gado (era o bicho dela, o chupacabras).
// Selaram o túmulo com a cruz de ferro e o sino benzido; o sangue do chupacabras
// ferido caiu na cova e ela voltou. Agora a noite não acaba.
// Velha alta e magra, flutuando, manto preto forrado de vermelho, olhos verdes.
// Quase sempre protegida (10% do dano); depois de cada ritual grande fica exausta
// no chão por uns segundos: é a hora de ferir e, no fim, de selar com a cruz.

const RESIST = { silver: 1.25, light: 0.25, dart: 0, fire: 0 };
const THR = [1, 0.66, 0.34];                 // início das fases 1, 2 e 3 (fração da vida)
const SKIN = [0.76, 0.77, 0.72], DARK = [0.09, 0.08, 0.09], LIP = [0.2, 0.07, 0.07];
const MOUTH = [0.1, 0.03, 0.03], BONE = [0.86, 0.8, 0.64], TOOTH = [0.76, 0.68, 0.45];
const NAIL0 = [0.24, 0.2, 0.11], NAIL1 = [0.08, 0.06, 0.04];
const BLACK = [0.24, 0.21, 0.21], RED = [0.42, 0.07, 0.08];
const HAIR = [0.92, 0.9, 0.84];
const POSE = ['kneel', 'up', 'castR', 'castL', 'point', 'jaw', 'back', 'hair', 'push', 'open', 'cover', 'look'];
const FIRE = { kind: 'fire', dmg: 12, owner: 'enemy', size: 0.22, color: [0.4, 1, 0.3], light: [0.4, 1.2, 0.3], life: 4 };
const WARN = 1.2, RING_R = 1.7;              // círculo de fogo: aviso e raio
const rnd = () => Math.random() - 0.5;

// ---------- sons próprios (risada rasgada, cântico, ofego) ----------
const okA = a => !!(a && a.ctx && a.white);
const GRIT = new WeakMap();
// distorção (o grito e a risada do fim)
function grit(a) {
  let s = GRIT.get(a);
  if (!s) {
    const c = a.ctx, n = 512, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * 7); }
    s = c.createWaveShaper(); s.curve = cv;
    const g = c.createGain(); g.gain.value = 0.22;
    s.connect(g).connect(a.bus?.creatures || a.master);
    GRIT.set(a, s);
  }
  return s;
}

export const SND = {
  // cântico grave murmurado (o ritual)
  chant(a, d = 0, dur = 3) {
    if (!okA(a) || fall(d, 90) <= 0) return;
    const c = a.ctx, t = c.currentTime, v = fall(d, 90);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(480, t); bp.frequency.linearRampToValueAtTime(820, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(420, t + dur);
    bp.connect(a.out ? a.out('creatures') : a.master);
    tone(a, t, dur, { f: 98, f1: 92, vol: 0.12 * v, attack: 0.4, vib: 3, vibF: 5, out: bp });
    tone(a, t, dur, { f: 147, f1: 139, vol: 0.08 * v, attack: 0.5, vib: 4, vibF: 6.5, out: bp });
    noise(a, t, dur, { type: 'bandpass', f: 2400, q: 6, vol: 0.03 * v, attack: 0.7 });
    setTimeout(() => { try { bp.disconnect(); } catch (e) { /* ignora */ } }, (dur + 1) * 1000);
  },
  // ofego de velha cansada
  pant(a, d = 0) {
    if (!okA(a) || fall(d, 30) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 30);
    noise(a, t, 0.26, { type: 'bandpass', f: 1100, f1: 700, q: 1.2, vol: 0.09 * v, attack: 0.05 });
    tone(a, t, 0.22, { f: 170, f1: 120, vol: 0.025 * v, attack: 0.04, vib: 25 });
  },
  // gemido rouco quando a bala entra
  croak(a, d = 0) {
    if (!okA(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    tone(a, t, 0.35, { f: 300, f1: 170, vol: 0.06 * v, attack: 0.02, vib: 40 });
    noise(a, t, 0.3, { type: 'bandpass', f: 900, q: 2, vol: 0.08 * v });
  },
  // tiro batendo na proteção
  ting(a, d = 0) {
    if (!okA(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    tone(a, t, 0.3, { type: 'sine', f: 1700, f1: 1150, vol: 0.035 * v });
    tone(a, t, 0.2, { type: 'sine', f: 2550, f1: 2100, vol: 0.02 * v });
  },
  // chiado (luz benta na cara)
  hiss(a, d = 0) {
    if (!okA(a) || fall(d, 50) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 50);
    noise(a, t, 0.7, { type: 'highpass', f: 2800, f1: 4000, vol: 0.12 * v, attack: 0.08 });
    tone(a, t, 0.6, { f: 330, f1: 240, vol: 0.04 * v, attack: 0.05, vib: 50 });
  },
  // grito rasgado
  shriek(a, d = 0, dur = 1.4, p = 1) {
    if (!okA(a) || fall(d, 150) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 150), out = grit(a);
    tone(a, t, dur, { f: 700 * p, fMid: 1250 * p, f1: 500 * p, vol: 0.06 * v, attack: 0.06, vib: 60, vibF: 9, out });
    tone(a, t, dur, { type: 'square', f: 350 * p, fMid: 620 * p, f1: 250 * p, vol: 0.025 * v, attack: 0.08, vib: 30 });
    noise(a, t, dur, { type: 'bandpass', f: 2200 * p, f1: 1100, q: 2, vol: 0.1 * v, attack: 0.05 });
  },
  // risada distorcida, mais grave (o fim)
  cackleX(a, d = 0, p = 0.72) {
    if (!okA(a) || fall(d, 150) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 150), out = grit(a);
    for (let i = 0; i < 10; i++) {
      const f = (560 - i * 28 + Math.random() * 40) * p;
      tone(a, t + i * 0.15, 0.13, { f, f1: f * 0.7, vol: 0.06 * v, attack: 0.01, out });
      noise(a, t + i * 0.15, 0.12, { type: 'bandpass', f: 1300, q: 2, vol: 0.06 * v });
    }
  },
  // labareda saindo do chão
  flare(a, d = 0) {
    if (!okA(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    noise(a, t, 0.7, { f: 900, f1: 260, q: 0.8, vol: 0.15 * v, attack: 0.02 });
    tone(a, t, 0.5, { type: 'sine', f: 90, f1: 45, vol: 0.12 * v });
  },
  // cinzas caindo
  ash(a, d = 0) {
    if (!okA(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    noise(a, t, 1.6, { f: 500, f1: 120, q: 0.6, vol: 0.18 * v, attack: 0.05 });
    for (let i = 0; i < 6; i++) noise(a, t + Math.random() * 1.2, 0.05, { type: 'highpass', f: 2500, vol: 0.07 * v });
  },
};

// ---------- texturas (geradas uma vez) ----------
const TX = {};
const rng = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const K32 = TAU / 32;

// pano grosso: dobras verticais, trama, furinhos
function clothTex() {
  if (TX.cloth) return TX.cloth;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rng(11);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const fold = Math.sin(x * K32 * 4 + Math.sin(y * K32) * 1.6) * 22;
    const v = clamp(208 + fold - ((x + y) % 2 ? 0 : 12) + R() * 26 - (R() < 0.03 ? 70 : 0), 0, 255);
    d.data[i] = v; d.data[i + 1] = v * 0.97; d.data[i + 2] = v * 0.95; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TX.cloth = canvasTex(c, true));
}

// pele velha: rugas e manchas
function skinTex() {
  if (TX.skin) return TX.skin;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rng(23);
  const spots = Array.from({ length: 6 }, () => [R() * 32, R() * 32, 0.8 + R() * 1.3]);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    let v = 220 + R() * 14;
    const w = Math.sin(y * K32 * 6 + Math.sin(x * K32 * 2) * 1.3);
    if (w > 0.75) v -= 20 + (w - 0.75) * 120;
    let br = 0;
    for (const [sx, sy, r] of spots) {
      const dx = Math.min(Math.abs(x - sx), 32 - Math.abs(x - sx)), dy = Math.min(Math.abs(y - sy), 32 - Math.abs(y - sy));
      if (dx * dx + dy * dy < r * r) br = 1;
    }
    d.data[i] = v - br * 40; d.data[i + 1] = v * 0.98 - br * 52; d.data[i + 2] = v * 0.95 - br * 62; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TX.skin = canvasTex(c, true));
}

// cabelo branco em mechas
function hairTex() {
  if (TX.hair) return TX.hair;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rng(37);
  const col = Array.from({ length: 32 }, () => (R() < 0.15 ? 110 : 170 + R() * 85));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4, v = clamp(col[x] + (R() - 0.5) * 24 + Math.sin(y * K32 * 3 + x) * 8, 0, 255);
    d.data[i] = v; d.data[i + 1] = v * 0.98; d.data[i + 2] = v * 0.93; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (TX.hair = canvasTex(c, true));
}

// runas antigas numa faixa (círculo do ritual e aviso das labaredas)
const RUNES = [
  [[0, 0, 0, 10], [0, 0, 5, 2], [0, 4, 5, 6]], [[0, 10, 0, 0], [0, 0, 5, 3], [5, 3, 5, 10]],
  [[0, 0, 0, 10], [0, 3, 4, 5], [4, 5, 0, 7]], [[0, 0, 0, 10], [0, 0, 4, 2.5], [4, 2.5, 0, 5], [0, 5, 4, 10]],
  [[4, 0, 0, 5], [0, 5, 4, 10]], [[0, 0, 5, 10], [5, 0, 0, 10]], [[0, 0, 0, 10], [5, 0, 5, 10], [0, 3, 5, 6]],
  [[2.5, 0, 2.5, 10], [0, 3, 5, 6]], [[4, 0, 0, 4], [0, 4, 5, 6], [5, 6, 1, 10]],
  [[2.5, 0, 2.5, 10], [2.5, 0, 0, 3], [2.5, 0, 5, 3]], [[0, 0, 0, 10], [5, 0, 5, 10], [0, 0, 5, 5], [5, 0, 0, 5]],
  [[2.5, 0, 0, 3], [2.5, 0, 5, 3], [0, 3, 5, 9], [5, 3, 0, 9]],
];
function runeTex() {
  if (TX.rune) return TX.rune;
  const c = makeCanvas(128, 16), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 16);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 14, 128, 2);
  g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'square';
  for (let i = 0; i < 12; i++) {
    const x0 = 2.5 + i * 10.6;
    g.beginPath();
    for (const [a, b, e, f] of RUNES[(i * 5) % RUNES.length]) { g.moveTo(x0 + a * 1.1, 3 + b); g.lineTo(x0 + e * 1.1, 3 + f); }
    g.stroke();
  }
  return (TX.rune = canvasTex(c, true));
}

// ---------- geometria ----------
function mkGeo(pos, nor, uv, cl, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  return g;
}

// junta várias peças numa malha só (menos chamadas de desenho)
function merge(list) {
  const P = [], N = [], U = [], C = [], I = [];
  let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv'), c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      U.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); C.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) I.push(ix.getX(i) + off);
    else for (let i = 0; i < p.count; i++) I.push(i + off);
    off += p.count;
    g.dispose();
  }
  return mkGeo(P, N, U, C, I);
}

// sólido de revolução aberto na frente (capa, cabelo) ou inteiro sem tampa (manga, capuz).
// open(t) = meia abertura na frente (rad) em cada anel; jag = barra serrilhada embaixo
function shell(prof, n, o = {}) {
  const sx = o.sx ?? 1, sz = o.sz ?? 1, col = o.col || (() => [1, 1, 1]);
  const y0 = prof[0][0], len = (prof[prof.length - 1][0] - y0) || 1;
  const pos = [], nor = [], uv = [], cl = [], idx = [];
  prof.forEach(([y, r], i) => {
    const pa = prof[Math.max(0, i - 1)], pb = prof[Math.min(prof.length - 1, i + 1)];
    const slope = (pb[1] - pa[1]) / Math.max(1e-4, pb[0] - pa[0]), L = Math.hypot(1, slope);
    const t = (y - y0) / len, h = o.open ? o.open(t) : 0, a0 = Math.PI / 2 + h, span = TAU - 2 * h;
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * span, ca = Math.cos(a), sa = Math.sin(a);
      const yy = y + (i === 0 && o.jag ? (k % 2 ? o.jag : -o.jag * 0.4) : 0);
      pos.push(ca * r * sx, yy, sa * r * sz);
      let nx = ca / sx, nz = sa / sz; const nl = Math.hypot(nx, nz) || 1;
      nor.push(nx / nl / L, -slope / L, nz / nl / L);
      uv.push((k / n) * (o.uRep ?? 1), t * (o.vRep ?? 1));
      const c = col(t, a); cl.push(c[0], c[1], c[2]);
    }
  });
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return mkGeo(pos, nor, uv, cl, idx);
}

// fiapos da barra: tiras penduradas em volta da saia (uma malha só)
function tatters(count, R, sz, yHem, rr) {
  const pos = [], nor = [], uv = [], cl = [], idx = [];
  for (let s = 0; s < count; s++) {
    const a = (s / count) * TAU + (rr() - 0.5) * 0.2, ca = Math.cos(a), sa = Math.sin(a);
    const len = 0.22 + rr() * 0.38, w0 = 0.1 + rr() * 0.06, segs = 3, base = pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const u = j / segs, y = yHem + 0.05 - len * u, out = 0.035 * u, w = w0 * (1 - u * 0.8) * 0.5, jx = (rr() - 0.5) * 0.025;
      const cx = ca * (R + out), cz = sa * (R + out) * sz;
      for (const side of [-1, 1]) {
        pos.push(cx - sa * (side * w + jx), y, cz + ca * (side * w + jx));
        nor.push(ca, 0, sa); uv.push(side < 0 ? 0 : 0.5, u * 0.6);
        const k = 1 - u * 0.4; cl.push(k, k, k);
      }
    }
    for (let j = 0; j < segs; j++) { const b = base + j * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  return mkGeo(pos, nor, uv, cl, idx);
}

// faixa plana no chão (runas)
function flatRing(r0, r1, n, rep) {
  const pos = [], nor = [], uv = [], cl = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    pos.push(ca * r0, 0, sa * r0, ca * r1, 0, sa * r1);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push((k / n) * rep, 0, (k / n) * rep, 1);
    cl.push(1, 1, 1, 1, 1, 1);
  }
  for (let k = 0; k < n; k++) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  return mkGeo(pos, nor, uv, cl, idx);
}

// labareda: línguas de fogo verde, finas e tortas, espalhadas no círculo (raio nominal RING_R)
function flameGeo() {
  const parts = [], hot = [0.95, 1, 0.62], tip = [0.04, 0.38, 0.07], R = rng(5);
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996, r = RING_R * Math.sqrt((i + 0.5) / 22) * 0.95, h = 0.8 + R() * 1.5 + (r < 0.6 ? 0.6 : 0);
    const g = cone(h, 0.12 + R() * 0.1, hot, tip, 4);
    g.rotateZ((R() - 0.5) * 0.35); g.rotateX((R() - 0.5) * 0.35);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(g);
  }
  return merge(parts);
}

// ---------- olhos e rosto ----------
const EYE_A = 0.39;
const dEye = a => Math.min(Math.abs(wrapA(a - (Math.PI / 2 - EYE_A))), Math.abs(wrapA(a - (Math.PI / 2 + EYE_A))));
const dFront = a => Math.abs(wrapA(a - Math.PI / 2));
const near = (y, v) => Math.abs(y - v) < 0.004;

// crânio comprido: órbitas fundas, sobrancelha saltada, bochechas chupadas, nuca comprida
const SKULL = [[-0.065, 0], [-0.06, 0.05], [-0.045, 0.064], [-0.02, 0.07], [0.01, 0.078], [0.035, 0.08], [0.06, 0.082], [0.1, 0.08], [0.14, 0.066], [0.17, 0.04], [0.185, 0]];
const skullOff = (y, a) => {
  const ca = Math.cos(a), sa = Math.sin(a), df = dFront(a);
  let k = 0, f = 0;
  if (near(y, 0.035) && dEye(a) < 0.05) k = 0.016;
  if (near(y, 0.06) && df < 0.6) k = -0.006;
  if (near(y, -0.02) && df > 0.6 && df < 1.0) k = 0.012;
  if (near(y, 0.01) && df > 0.6 && df < 1.0) k = 0.006;
  if (y > 0.03 && df > 2.0) f = -0.014;
  return [-ca * k, -sa * k + f];
};
const skullCol = (t, a) => {
  const y = -0.065 + t * 0.25, de = dEye(a), df = dFront(a);
  if (y < -0.055) return MOUTH;
  if (near(y, -0.045) && df < 0.5) return LIP;
  if (near(y, 0.035) && de < 0.05) return DARK;
  if (near(y, 0.01) && de < 0.2) return [0.24, 0.21, 0.25];
  if (near(y, 0.06) && de < 0.2) return [0.38, 0.37, 0.37];
  if (near(y, -0.02) && df > 0.6 && df < 1.0) return [0.46, 0.46, 0.44];
  return SKIN;
};
const JAW = [[-0.14, 0], [-0.135, 0.022], [-0.115, 0.04], [-0.09, 0.054], [-0.065, 0.062], [-0.048, 0.064], [-0.04, 0.03], [-0.038, 0]];
const jawOff = (y, a) => [0, y < -0.1 ? 0.012 * Math.min(1, (-0.1 - y) / 0.03) + 0.012 : 0.012];
const jawCol = (t, a) => {
  const y = -0.14 + t * 0.102;
  if (y > -0.042) return MOUTH;
  if (near(y, -0.048) && dFront(a) < 0.5) return LIP;
  return SKIN;
};

export class Witch extends Creature {
  // o: { hp, arena: {x, z, r}, intro (sai da cova, padrão true), summon(tipo, x, z) }
  constructor(deps, o = {}) {
    super(deps, { name: 'BRUXA', radius: 0.45, height: 1.9, ...o, hp: o.hp ?? 90, flying: true, death: 'fade', blood: [0.2, 0.05, 0.05], resist: { ...RESIST, ...(o.resist || {}) } });
    this.bossName = 'A BRUXA OTÍLIA';
    this.heavy = true;
    this.shielded = true;        // quase sempre: só 10% do dano
    this.exhausted = false;      // ajoelhada no chão: ferida normal, e a cruz pode selar
    this.sealing = false; this.sealed = false;
    this.spent = false;          // vida acabou sem a cruz: fica no chão esperando o selo
    this.hitY0 = 0.35;
    this.immuneColor = [0.5, 1, 0.4];
    this.arena = o.arena || null;
    this.summon = o.summon || null;
    this.intro = o.intro ?? true;
    this.fx = []; this.rings = []; this.pool = []; this.minions = []; this.rips = [];
    this._fp = new THREE.Vector3(); this._fv = new THREE.Vector3();
    this.build();
    this.P = {}; this.want = {};
    for (const k of POSE) this.P[k] = this.want[k] = 0;
    this.P.flinch = 0;
    this.T = 0; this.hy = 1.6; this.gy = 0; this.vx = 0; this.vz = 0; this.lean = 0; this.trail = [0, 0];
    this.cool = 2.5; this.acts = 0; this.sumCool = 3; this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.pd = 10; this.rune = 0; this.cackleT = 0; this.moteT = 0; this.sndT = 5;
    this.litT = 0; this.litLast = -9; this.closeT = 0; this.tingT = -9; this.ouchT = -9; this.laughT = -9;
    this.state = 'hover';
  }

  get phase() { const f = this.hp / this.maxHp; return f > THR[1] ? 1 : f > THR[2] ? 2 : 3; }
  // a campanha mostra USAR A CRUZ quando isto for verdade (e o jogador estiver perto)
  get canSeal() { return this.exhausted && !this.sealing && !this.sealed && this.hp <= this.maxHp * THR[2] + 1e-6; }

  build() {
    const B = this.bones = {};
    const cloth = this.mat({ map: clothTex(), color: 0x3a3333 });
    // forro: vermelho escuro sem luz (por dentro a normal aponta para fora)
    const lining = this.mat({ map: clothTex(), color: 0x520e10, lit: false, side: THREE.BackSide });
    const rag = this.mat({ map: clothTex(), color: 0x3a3333, side: THREE.DoubleSide });
    const bodice = this.mat({ map: clothTex() });
    const skin = this.mat({ map: skinTex() });
    const hair = this.mat({ map: hairTex(), color: 0xdcd8cc, side: THREE.DoubleSide });
    const bone = this.mat({ map: null });
    const eye = this.eyeMat = this.mat({ map: null, color: 0xa8ff88, lit: false, fog: false });
    const both = (geo, parent) => { parent.add(this.mesh(geo, cloth)); parent.add(this.mesh(geo, lining)); };
    const R = rng(77);
    const dirt = (t, a) => { const k = mix3([0.6, 0.58, 0.56], [1, 1, 1], smooth(clamp(t * 2.5, 0, 1))); const f = 0.88 + 0.12 * Math.sin(a * 7); return [k[0] * f, k[1] * f, k[2] * f]; };

    // cintura (flutua balançando)
    B.body = joint(this.root, 0, 1.05, 0);
    // vestido longo: forro vermelho por dentro (mesma malha, lado de trás)
    const skirt = blob([[-1.09, 0.44], [-0.9, 0.38], [-0.65, 0.3], [-0.4, 0.22], [-0.18, 0.165], [-0.05, 0.14], [0.02, 0.13]], 14, { sz: 0.85, col: dirt, uRep: 4, vRep: 3 });
    this.skirt = new THREE.Group(); B.body.add(this.skirt);
    both(skirt, this.skirt);
    this._rip(skirt, -0.15, -1.09);
    const rags = tatters(18, 0.43, 0.85, -1.09, R);
    this.skirt.add(this.mesh(rags, rag));
    this._rip(rags, -0.15, -1.09);

    // tronco magro e curvado (corpete preto com cordão vermelho na frente)
    B.chest = joint(B.body, 0, 0, 0);
    const torso = blob([[0, 0.115], [0.1, 0.12], [0.25, 0.135], [0.38, 0.15], [0.46, 0.14], [0.51, 0.1], [0.535, 0.05], [0.545, 0]], 10, {
      sx: 1.25, sz: 0.72, col: (t, a) => (dFront(a) < 0.2 && t < 0.85 ? RED : BLACK),
    });
    B.chest.add(this.mesh(torso, bodice));
    // manto: preso nos ombros, aberto na frente, barra serrilhada
    this.cloak = new THREE.Group(); B.chest.add(this.cloak);
    const cloak = shell([[-1.08, 0.5], [-0.8, 0.43], [-0.45, 0.34], [-0.1, 0.27], [0.2, 0.225], [0.4, 0.205], [0.5, 0.17], [0.56, 0.1]], 12, {
      sx: 1.12, sz: 0.92, jag: 0.07, col: dirt, uRep: 4, vRep: 3, open: t => lerp(0.95, 0.42, t),
    });
    both(cloak, this.cloak);
    this._rip(cloak, 0.1, -1.08);
    // capuz caído nas costas
    const hood = shell([[-0.15, 0], [-0.13, 0.075], [-0.09, 0.12], [-0.04, 0.145], [0, 0.15]], 8, { col: () => [0.9, 0.9, 0.9] });
    const hg = new THREE.Group(); hg.position.set(0, 0.44, -0.15); hg.rotation.x = -0.55; hg.scale.set(1.15, 0.75, 0.6);
    B.chest.add(hg); both(hood, hg);
    // colar de ossinhos e dentes
    const neck = [];
    const cord = new THREE.TorusGeometry(1, 0.05, 3, 12);
    cord.rotateX(Math.PI / 2); cord.scale(0.078, 0.078, 0.07); cord.rotateX(-0.38); cord.translate(0, 0.5, 0.012);
    ensureColor(cord); paint(cord, [0.12, 0.08, 0.06]);
    neck.push(cord);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + (i / 6 - 0.5) * 2.6, x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.072 + 0.012, y = 0.5 - Math.sin(a) * 0.03;
      let g;
      if (i % 3 === 0) { g = cone(0.034, 0.008, BONE, TOOTH, 4); g.rotateX(Math.PI); }
      else if (i % 3 === 1) { g = ellipsoid(0.042, 0.008, 0.008, 4, () => BONE, 3); g.rotateX(Math.PI / 2); g.translate(0, -0.021, 0); }
      else { g = ellipsoid(0.02, 0.012, 0.012, 5, () => TOOTH, 3); g.translate(0, -0.008, 0); }
      g.translate(x, y, z);
      neck.push(g);
    }
    B.chest.add(this.mesh(merge(neck), bone));

    // pescoço fino e cabeça para a frente
    B.neck = joint(B.chest, 0, 0.52, 0.02);
    B.neck.add(this.mesh(blob([[0, 0.05], [0.05, 0.041], [0.1, 0.038], [0.15, 0.036]], 7, { col: (t, a) => (dFront(a) > 0.3 && dFront(a) < 0.6 ? [0.5, 0.5, 0.48] : SKIN) }), skin));
    B.head = joint(B.neck, 0, 0.14, 0.015);
    B.head.scale.setScalar(0.88);
    const skull = blob(SKULL, 16, { off: skullOff, col: skullCol });
    // nariz adunco, verruga e dentes tortos
    const nose = cone(0.058, 0.016, SKIN, [0.55, 0.5, 0.5], 4, 0.75);
    nose.rotateX(2.0); nose.translate(0, 0.022, 0.074);
    const wart = ellipsoid(0.008, 0.007, 0.007, 4, () => [0.5, 0.44, 0.4], 3); wart.translate(0.014, 0.0, 0.098);
    const teeth = [-0.02, 0.003, 0.021].map((x, i) => { const g = cone(0.02 + i * 0.004, 0.006, TOOTH, [0.6, 0.52, 0.3], 3); g.rotateX(Math.PI + (i - 1) * 0.15); g.translate(x, -0.05, 0.05); return g; });
    B.head.add(this.mesh(merge([skull, nose, wart, ...teeth]), skin));
    B.jaw = joint(B.head, 0, -0.045, -0.005);
    const jaw = blob(JAW, 10, { sx: 0.8, sz: 0.95, off: jawOff, col: jawCol });
    jaw.translate(0, 0.045, 0.005);
    B.jaw.add(this.mesh(jaw, skin));
    // olhos verdes acesos no fundo das órbitas
    const eyes = [-1, 1].map(s => { const g = ellipsoid(0.012, 0.013, 0.008, 4, null, 3); g.rotateY(s * 0.35); g.translate(s * 0.019, 0.035, 0.064); return g; });
    B.head.add(this.mesh(merge(eyes), eye));
    // cabelo: touca sobre o crânio e mechas compridas e desgrenhadas
    const cap = shell([[-0.035, 0.084], [0, 0.09], [0.04, 0.094], [0.08, 0.094], [0.12, 0.086], [0.155, 0.064], [0.18, 0.036], [0.195, 0]], 12, {
      sx: 0.88, sz: 1.1, col: t => mix3([0.75, 0.73, 0.68], HAIR, t), uRep: 3,
      open: t => { const y = -0.035 + t * 0.23; return y < 0.075 ? 1.05 : y < 0.125 ? lerp(1.05, 0, (y - 0.075) / 0.05) : 0; },
    });
    B.head.add(this.mesh(cap, hair));
    this._buildHair(B.head, hair, R);

    // braços compridos, mangas largas forradas, mãos ossudas de unhas compridas
    B.arms = [];
    for (const s of [1, -1]) {
      const sh = joint(B.chest, s * 0.175, 0.47, -0.01);
      sh.add(this.mesh(limb(0.33, 0.052, 0.042, 5, () => [0.9, 0.9, 0.9]), cloth));
      const el = joint(sh, 0, -0.33, 0);
      both(shell([[-0.31, 0.11], [-0.22, 0.08], [-0.12, 0.058], [-0.03, 0.047], [0.03, 0.044]], 7, { jag: 0.035, col: t => mix3([0.7, 0.7, 0.7], [1, 1, 1], t) }), el);
      el.add(this.mesh(limb(0.3, 0.026, 0.019, 4, () => SKIN), skin));
      const wr = joint(el, 0, -0.3, 0);
      wr.add(this.mesh(blob([[-0.085, 0], [-0.08, 0.022], [-0.05, 0.03], [-0.015, 0.026], [0, 0.018], [0.012, 0]], 5, { sz: 0.42, col: t => (t < 0.15 ? [0.55, 0.55, 0.52] : SKIN) }), skin));
      const fingers = [];
      for (let f = 0; f < 5; f++) {
        const thumb = f === 4, len = thumb ? 0.07 : 0.1 + (f === 1 || f === 2 ? 0.016 : 0);
        const fj = thumb ? joint(wr, -s * 0.026, -0.03, -0.006) : joint(wr, (f - 1.5) * 0.0145, -0.08, 0);
        const fg = limb(len, 0.0085, 0.0055, 3, t => (t < 0.5 && t > 0.4 ? [0.52, 0.52, 0.5] : SKIN));
        const nail = cone(0.034, 0.0068, NAIL0, NAIL1, 3); nail.rotateX(Math.PI + 0.35); nail.translate(0, -len, 0);
        fj.add(this.mesh(merge([fg, nail]), skin));
        if (thumb) fj.rotation.z = -s * 0.6;
        fingers.push(fj);
      }
      B.arms.push({ s, sh, el, wr, fingers });
    }

    // círculo de runas no chão (ritual)
    const runeMat = ps1Material({ map: runeTex(), color: 0x70ff60, lit: false, cutout: true, side: THREE.DoubleSide });
    this.fx.push(runeMat);
    B.rune = joint(this.root, 0, 0, 0);
    B.rune.add(this.mesh(flatRing(1.75, 2.15, 32, 8), runeMat));
    B.runeIn = joint(B.rune, 0, 0.01, 0);
    B.runeIn.add(this.mesh(flatRing(0.95, 1.18, 24, 5), runeMat));
    B.rune.visible = false;

    // labaredas (malha e material divididos pelos círculos de fogo)
    this.ringGeo = flatRing(RING_R - 0.28, RING_R + 0.06, 36, 6);
    this.flameG = flameGeo();
    this.flameMat = ps1Material({ map: null, lit: false });
    this.fx.push(this.flameMat);

    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    this.spheres = [
      { bone: B.head, off: v(0, 0.04, 0.01), r: 0.13, part: 'head' },
      { bone: B.chest, off: v(0, 0.3, 0), r: 0.22, part: 'body' },
      { bone: B.body, off: v(0, -0.2, 0), r: 0.24, part: 'body' },
      { bone: B.body, off: v(0, -0.65, 0), r: 0.3, part: 'body' },
    ];
  }

  // mechas: geometria única, cada mecha gira em torno da raiz (balança e levanta no ritual)
  _buildHair(head, mat, R) {
    const parts = [], meta = [], n = 11;
    for (let i = 0; i < n; i++) {
      const th = Math.PI / 2 + 0.95 + (i / (n - 1)) * (TAU - 1.9) + (R() - 0.5) * 0.15;
      const back = Math.abs(wrapA(th - Math.PI * 1.5)) < 1.2;
      const L = back ? 0.55 + R() * 0.22 : 0.36 + R() * 0.2;
      const ry = 0.03 + R() * 0.06, rx = Math.cos(th) * 0.078, rz = Math.sin(th) * 0.096;
      const g = blob([[-L, 0], [-L * 0.8, 0.016], [-L * 0.45, 0.032], [-L * 0.1, 0.04], [0, 0.034], [0.016, 0]], 3, { sz: 0.5, col: t => mix3([0.66, 0.64, 0.6], HAIR, t), vRep: 2 });
      g.rotateY(Math.PI / 2 - th);
      g.translate(rx, ry, rz);
      parts.push(g);
      const wild = R() < 0.18;
      meta.push({ n: g.getAttribute('position').count, rx, ry, rz, th, lift: wild ? 0.28 + R() * 0.15 : 0.04 + R() * 0.14, tilt: (R() - 0.5) * 0.4 });
    }
    const geo = merge(parts), p = geo.getAttribute('position');
    p.setUsage(THREE.DynamicDrawUsage);
    // posição de cada vértice na base (tangente, para fora, para cima) da sua mecha
    const rel = new Float32Array(p.count * 3), sid = new Uint8Array(p.count);
    let v = 0;
    meta.forEach((m, s) => {
      const ox = Math.cos(m.th), oz = Math.sin(m.th), tx = -oz, tz = ox;
      for (let i = 0; i < m.n; i++, v++) {
        const dx = p.getX(v) - m.rx, dy = p.getY(v) - m.ry, dz = p.getZ(v) - m.rz;
        rel[v * 3] = dx * tx + dz * tz; rel[v * 3 + 1] = dx * ox + dz * oz; rel[v * 3 + 2] = dy;
        sid[v] = s;
      }
    });
    this.hairData = { geo, meta, rel, sid };
    head.add(this.mesh(geo, mat));
  }

  // guarda a forma original para ondular a barra (peso 0 em cima, 1 na barra, >1 nos fiapos)
  _rip(geo, yTop, yHem) {
    const p = geo.getAttribute('position'), n = p.count;
    const base = new Float32Array(p.array), ca = new Float32Array(n), sa = new Float32Array(n), ang = new Float32Array(n), w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(base[i * 3 + 2], base[i * 3]);
      ang[i] = a; ca[i] = Math.cos(a); sa[i] = Math.sin(a);
      w[i] = clamp((yTop - base[i * 3 + 1]) / (yTop - yHem), 0, 1.8);
    }
    p.setUsage(THREE.DynamicDrawUsage);
    this.rips.push({ geo, base, ca, sa, ang, w, n });
  }

  place(x, z, heading = 0) {
    super.place(x, z, heading);
    this.gy = this.pos.y;
    if (!this.arena) this.arena = { x, z, r: 14 };
    this.hy = this.intro ? -2.1 : 1.6;
    this.state = this.intro ? 'appear' : 'hover'; this.st = 0;
    this.pos.y = this.gy + this.hy;
    this.sync();
    return this;
  }

  // ---------- dano ----------
  damage(amount, info = {}) {
    if (this.hidden || this.sealing || this.dead) return false;
    const ph0 = this.phase;
    this._zero = false;
    const ok = super.damage(amount, info);
    if (!ok) return ok;
    if (this._zero && ph0 === 3) {
      // sem a cruz ela não morre: fica com 1 de vida, caída, esperando o selo
      this.hp = 1; this.spent = true;
      if (!this.exhausted) this._exhaust();
    } else if (this.phase > ph0) {
      // passou de fase: a vida para no começo da fase nova e ela se ergue gritando
      this.hp = Math.max(this.hp, THR[ph0] * this.maxHp - 0.5);
      this._rage();
    }
    return ok;
  }

  die() { this.hp = 1; this._zero = true; }   // só a cruz acaba com ela

  bleed(p, dir, dmg) {
    if (!this.shielded) return super.bleed(p, dir, dmg);
    // protegida: a bala bate numa casca verde
    for (let i = 0; i < 6; i++) this._fx(p.x, p.y, p.z, rnd() * 3 - dir.x, Math.random() * 2, rnd() * 3 - dir.z, 0.35, 0.06, 0, [0.5, 1, 0.45], 0, 2);
  }

  onHurt(dmg, info) {
    if (info.kind === 'light') { this.litLast = this.T; return; }
    if (this.shielded) {
      if (this.T - this.tingT > 0.12) { this.tingT = this.T; SND.ting(this.audio, this.pd); }
      return;
    }
    this.P.flinch = 1;
    if (this.T - this.ouchT > 0.35) { this.ouchT = this.T; SND.croak(this.audio, this.pd); }
  }

  onImmune() {
    // fogo e dardo não fazem nada: ela ri
    if (this.T - this.laughT > 3) { this.laughT = this.T; this.cackleT = 0.9; SFX.cackle(this.audio, this.pd); }
  }

  // ---------- IA ----------
  think(dt, env) {
    const W = this.want, tp = this.toPlayer(env), P = env.player.pos, alive = env.playerAlive;
    for (const k of POSE) W[k] = 0;
    const ph = this.phase, fast = ph === 3 ? 1.35 : ph === 2 ? 1.15 : 1, A = this.audio;
    this.pd = tp.d;
    this.cool -= dt; this.sumCool -= dt; this.sndT -= dt; this.cackleT -= dt;
    this.litT = this.T - this.litLast < 0.15 ? this.litT + dt : Math.max(0, this.litT - dt);
    this.gy = damp(this.gy, this.ctx.groundAt(this.pos.x, this.pos.z, this.gy + 2.5), 8, dt);
    W.look = clamp(wrapA(tp.ang - this.heading), -0.9, 0.9);
    let hyT = 1.75 + 0.75 * Math.sin(this.T * 0.45), move = false;
    this._rings(dt, env);

    if (this.sealing) hyT = this._seal(dt, env, W);
    else switch (this.state) {
      case 'appear': {
        // sai da cova entre terra e fumaça verde
        const k = clamp(this.st / 2.6, 0, 1);
        this.hy = hyT = lerp(-2.1, 1.6, smooth(k));
        W.up = 0.7; W.back = 0.6; W.hair = 0.7; W.jaw = 0.4;
        this.face(dt, tp.ang, 3);
        if (this.st < 1.9 && Math.random() < dt * 30) {
          const a = Math.random() * TAU, r = Math.random() * 0.7;
          this._fx(this.pos.x + Math.cos(a) * r, this.gy + 0.05, this.pos.z + Math.sin(a) * r, Math.cos(a) * 1.5, 2 + Math.random() * 3, Math.sin(a) * 1.5, 0.9, 0.06, 0.03, [0.22, 0.16, 0.1], 9.8, 0.3);
        }
        if (!this.fired && this.st > 1.3) { this.fired = true; SFX.cackle(A, tp.d); this.cackleT = 0.9; }
        if (this.st > 2.8) { this.state = 'hover'; this.st = 0; this.cool = 1.5; }
        break;
      }
      case 'hover': {
        this.face(dt, tp.ang, 4);
        if (!alive) {
          if (this.sndT <= 0) { this.sndT = 6; SFX.cackle(A, tp.d); this.cackleT = 0.9; }
          break;
        }
        // rodeia o jogador a meia distância, dentro da arena
        const D = ph === 1 ? 8.5 : ph === 2 ? 7.5 : 6.5;
        const a = Math.atan2(this.pos.x - P.x, this.pos.z - P.z) + this.orbit * 0.35;
        const [tx, tz] = this._clampA(P.x + Math.sin(a) * D, P.z + Math.cos(a) * D, 1.5);
        this._glide(dt, tx, tz, 2.4 * fast); move = true;
        if (Math.random() < dt * 0.08) this.orbit *= -1;
        if (this.sndT <= 0) { this.sndT = 7 + Math.random() * 5; if (Math.random() < 0.5) { SFX.cackle(A, tp.d); this.cackleT = 0.9; } else SFX.whisper(A, tp.d); }
        // luz benta na cara: cobre o rosto, chia e some
        W.cover = this.litT > 0.15 ? 1 : 0;
        if (this.litT > 1.3) { this.litT = 0; SND.hiss(A, tp.d); this._go('teleport'); break; }
        // perto demais: empurra e some
        this.closeT = tp.d < 2.6 ? this.closeT + dt : 0;
        if (this.closeT > 0.5) { this.closeT = 0; this._go('repel'); break; }
        if (this.cool <= 0) this._choose(ph);
        break;
      }
      case 'cast': case 'combo': {
        // bolas de fogo verdes, uma mão de cada vez
        this.face(dt, tp.ang, 6);
        const wind = 0.65 / fast, gap = 0.32 / fast;
        if (this.state === 'combo' && !this.fired && this.st > 0.2) { this.fired = true; if (alive) this._ring(env, P.x, P.z); }
        for (let i = 0; i < this.nThrow; i++) {
          const ti = wind + i * gap, u = this.st - ti, key = i % 2 ? 'castL' : 'castR';
          if (u > -0.5 && u < 0) W[key] = 1; else if (u >= 0 && u < 0.25) W[key] = -1;
        }
        if (W.castR > 0) this._handGlow(this.bones.arms[0].wr);
        if (W.castL > 0) this._handGlow(this.bones.arms[1].wr);
        if (this.thrown < this.nThrow && this.st >= wind + this.thrown * gap) {
          if (alive) this._fireball(env, this.thrown % 2 ? 1 : 0, { homing: 0.8, speed: ph === 3 ? 11 : 9.5 });
          this.thrown++;
        }
        if (this.thrown >= this.nThrow && this.st > wind + this.nThrow * gap + 0.35) this._done(1.9 / fast);
        break;
      }
      case 'teleport': {
        // some na fumaça e volta do outro lado
        W.jaw = 0.8;
        if (!this.hidden && this.st >= 0.35) {
          this.hidden = true; this.untargetable = true; this.root.visible = false;
          const [x, z] = this._dest(env);
          this.pos.x = x; this.pos.z = z; this.vx = this.vz = 0;
          this.gy = this.ctx.groundAt(x, z, this.gy + 3);
          this.heading = Math.atan2(P.x - x, P.z - z);
        }
        if (this.hidden && this.st >= 0.9) {
          this.hidden = false; this.untargetable = false; this.root.visible = true;
          this._smoke(); SFX.whoosh(A, tp.d);
        }
        if (this.st > 1.3) { if (this.chain) { this.chain = false; this._go('cast'); } else this._done(1.2 / fast); }
        break;
      }
      case 'repel': {
        // onda de choque: joga o jogador longe
        this.face(dt, tp.ang, 8);
        W.push = 1; W.jaw = 0.8; W.hair = 0.6;
        if (!this.fired && this.st > 0.3) {
          this.fired = true;
          this._shock(0.4);
          if (alive && tp.d < 4.2) env.combat.hurt(8, tp.dx / (tp.d || 1), tp.dz / (tp.d || 1), { knock: 12 });
          env.combat.shake = Math.max(env.combat.shake, 0.4);
          SFX.quake(A, tp.d);
        }
        if (this.st > 0.7) { this.chain = ph >= 2; this._go('teleport'); }
        break;
      }
      case 'summon': {
        // ergue os braços e chama os bichos dela em volta do jogador
        this.face(dt, tp.ang, 4);
        W.up = 1; W.hair = 0.5; W.jaw = 0.3 + 0.2 * Math.sin(this.T * 9);
        if (!this.fired && this.st > 1.0) { this.fired = true; if (alive) this._summon(env); }
        if (this.st > 1.6) this._done(1.6 / fast);
        break;
      }
      case 'firering': {
        // aponta: o chão marca o círculo e depois sobe a labareda
        this.face(dt, tp.ang, 6);
        W.point = 1;
        if (!this.fired && this.st > 0.45) {
          this.fired = true;
          if (alive) {
            this._ring(env, P.x, P.z);
            const pv = env.playerVel;
            if (ph === 3 || Math.random() < 0.5) this._ring(env, P.x + pv.x * 1.3 + rnd() * 2, P.z + pv.z * 1.3 + rnd() * 2);
            if (ph === 3) { const a = Math.random() * TAU; this._ring(env, P.x + Math.sin(a) * 3.4, P.z + Math.cos(a) * 3.4); }
          }
        }
        if (this.st > 1.0) this._done(1.7 / fast);
        break;
      }
      case 'ritual': {
        // braços para o céu, runas no chão, cântico; no fim solta a chuva de fogo
        const dur = this._ritualDur();
        hyT = 2.4;
        this.face(dt, tp.ang, 3);
        W.up = 1; W.back = 0.8; W.hair = 1; W.jaw = 0.25 + 0.25 * Math.sin(this.T * 9);
        this.rune = clamp(this.st / 0.6, 0, 1);
        this._runeFx(dt);
        if (ph >= 2 && alive && this.st > this.nextRing && this.st < dur - 0.6) { this._ring(env, P.x, P.z); this.nextRing += ph === 3 ? 1.1 : 1.6; }
        if (this.st > dur) this._go('release');
        break;
      }
      case 'release': {
        this.face(dt, tp.ang, 6);
        const n = ph === 3 ? 12 : 8;
        W.castR = W.castL = -1; W.jaw = 1; W.hair = 0.6;
        this.rune = Math.max(0, 1 - this.st * 2);
        if (!this.fired) {
          this.fired = true;
          if (alive && ph >= 2) {
            this._ring(env, P.x, P.z);
            const a0 = Math.random() * TAU, m = ph === 3 ? 4 : 3;
            for (let i = 0; i < m; i++) { const a = a0 + i * TAU / m; this._ring(env, P.x + Math.sin(a) * 3.4, P.z + Math.cos(a) * 3.4); }
          }
        }
        while (this.thrown < n && this.st >= this.thrown * 0.05) { if (alive) this._fan(env, this.thrown, n); this.thrown++; }
        if (this.st > n * 0.05 + 0.6) this._exhaust();
        break;
      }
      case 'exhausted': {
        // desce, ajoelha e ofega: sem proteção
        hyT = 0;
        this.face(dt, tp.ang, 1.2);
        W.kneel = this.hy < 0.7 ? 1 : 0.3;
        W.jaw = 0.3;
        if (!this.fired && this.hy < 0.1) {
          this.fired = true;
          SFX.stomp(A, tp.d, 0.5);
          for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; this._fx(this.pos.x + Math.cos(a) * 0.4, this.gy + 0.05, this.pos.z + Math.sin(a) * 0.4, Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5, 0.8, 0.12, 0.25, [0.2, 0.18, 0.15], 0, 2); }
        }
        this.panT -= dt;
        if (this.panT <= 0) { this.panT = 0.75; SND.pant(A, tp.d); }
        if (!this.spent && this.st > this.exT) this._go('rise');
        break;
      }
      case 'rise': {
        hyT = 1.6; W.up = 0.3; W.jaw = 0.6;
        this.face(dt, tp.ang, 3);
        if (this.st > 1.2) { this.state = 'hover'; this.st = 0; this.cool = 1.2; }
        break;
      }
      case 'rage': {
        // mudou de fase: grita, empurra tudo e some
        hyT = 2.2; W.up = 1; W.back = 1; W.jaw = 1; W.hair = 1;
        if (!this.fired && this.st > 0.25) {
          this.fired = true;
          this._shock(0.6);
          if (alive && tp.d < 6) env.combat.hurt(10, tp.dx / (tp.d || 1), tp.dz / (tp.d || 1), { knock: 11 });
          env.combat.shake = Math.max(env.combat.shake, 0.6);
        }
        if (this.st > 1.6) this._go('teleport');
        break;
      }
    }

    // flutua e desliza (atravessa o mato; fica dentro da arena)
    this.hy = damp(this.hy, hyT, this.state === 'exhausted' ? 3 : 2, dt);
    this.pos.y = this.gy + this.hy;
    if (!move) { this.vx = damp(this.vx, 0, 4, dt); this.vz = damp(this.vz, 0, 4, dt); }
    this.step(dt, this.vx, this.vz, false);
    const [cx, cz] = this._clampA(this.pos.x, this.pos.z, 0);
    this.pos.x = cx; this.pos.z = cz;
    const h = this.heading, lx = this.vx * Math.cos(h) - this.vz * Math.sin(h), lz = this.vx * Math.sin(h) + this.vz * Math.cos(h);
    this.lean = clamp(lz * 0.05, -0.2, 0.2);
    this.trail[0] = clamp(-lx * 0.04, -0.15, 0.15); this.trail[1] = clamp(-lz * 0.04, -0.15, 0.15);
    if (!this.sealing) this._aura(dt);
  }

  _ritualDur() { const ph = this.phase; return ph === 1 ? 3 : ph === 2 ? 4 : 4.5; }

  _choose(ph) {
    if (this.acts >= (ph === 3 ? 3 : 4)) return this._go('ritual');
    const r = Math.random(), canSum = this.summon && this.sumCool <= 0 && this._minionsAlive() < 4;
    if (ph === 1) return this._go(r < 0.7 ? 'cast' : 'teleport');
    if (ph === 2) {
      if (canSum && r < 0.3) return this._go('summon');
      return this._go(r < 0.62 ? 'cast' : r < 0.9 ? 'firering' : 'teleport');
    }
    if (canSum && r < 0.22) return this._go('summon');
    return this._go(r < 0.45 ? 'combo' : r < 0.72 ? 'cast' : r < 0.88 ? 'firering' : 'teleport');
  }

  _go(s) {
    const A = this.audio, d = this.pd;
    this.state = s; this.st = 0; this.fired = false; this.thrown = 0;
    if (s === 'cast' || s === 'combo') { this.nThrow = this.phase === 1 ? 1 : this.phase === 2 ? 2 : 3; SFX.spell(A, d); }
    else if (s === 'teleport') { SFX.cackle(A, d); SFX.whoosh(A, d); this.cackleT = 0.9; this._smoke(); }
    else if (s === 'summon') { SFX.spell(A, d); SND.chant(A, d, 1.6); }
    else if (s === 'firering') SFX.spell(A, d);
    else if (s === 'ritual') { SND.chant(A, d, this._ritualDur()); SFX.spell(A, d); this.nextRing = 1.2; }
    else if (s === 'release') SND.shriek(A, d, 1.1);
    else if (s === 'repel') SND.shriek(A, d, 0.6, 1.2);
    else if (s === 'rise') { this.exhausted = false; this.shielded = true; SFX.cackle(A, d); this.cackleT = 0.9; }
  }

  _done(cool) { this.acts++; this.cool = cool; this.state = 'hover'; this.st = 0; }

  _exhaust() {
    this.state = 'exhausted'; this.st = 0; this.fired = false;
    this.exhausted = true; this.shielded = false; this.acts = 0; this.rune = 0;
    this.exT = (this.phase === 3 ? 7 : 5) + 1.0;     // + a descida
    this.panT = 0.5;
    this.hidden = false; this.untargetable = false; this.root.visible = true;
  }

  _rage() {
    this._go('rage');
    this.exhausted = false; this.shielded = true; this.rune = 0; this.acts = 0;
    this.hidden = false; this.untargetable = false; this.root.visible = true;
    SND.shriek(this.audio, this.pd, 1.5, 0.9); SFX.quake(this.audio, this.pd);
  }

  // desliza até (tx, tz), freando na chegada
  _glide(dt, tx, tz, sp) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, L = Math.hypot(dx, dz) || 1, v = Math.min(sp, L * 1.2);
    this.vx = damp(this.vx, dx / L * v, 3, dt); this.vz = damp(this.vz, dz / L * v, 3, dt);
  }

  _clampA(x, z, m = 0) {
    const A = this.arena;
    if (!A) return [x, z];
    const dx = x - A.x, dz = z - A.z, d = Math.hypot(dx, dz), r = Math.max(1, A.r - m);
    return d > r ? [A.x + dx / d * r, A.z + dz / d * r] : [x, z];
  }

  // lugar para reaparecer: longe de onde estava e não em cima do jogador
  _dest(env) {
    const P = env.player.pos;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU, r = 6 + Math.random() * 4;
      const [x, z] = this._clampA(P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, 1.5);
      if (Math.hypot(x - this.pos.x, z - this.pos.z) > 4.5 && Math.hypot(x - P.x, z - P.z) > 4.5) return [x, z];
    }
    const A = this.arena;
    return this._clampA(A.x + rnd() * A.r, A.z + rnd() * A.r, 1.5);
  }

  _minionsAlive() {
    this.minions = this.minions.filter(c => c && !c.dead && !c.removed);
    return this.minions.length;
  }

  // invoca: cães (matilha), fantasma ou morcegos, a 8–12 m do jogador
  _summon(env) {
    const ph = this.phase, P = env.player.pos;
    const types = ['dog', 'ghost', 'bat'].filter(t => t !== this.lastSummon);
    const type = types[Math.floor(Math.random() * types.length)];
    this.lastSummon = type;
    const n = type === 'ghost' ? (ph === 3 ? 2 : 1) : type === 'dog' ? (ph === 3 ? 3 : 2) : (ph === 3 ? 4 : 3);
    const a0 = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, ok = false;
      for (let k = 0; k < 6 && !ok; k++) {
        const a = a0 + (i / n) * TAU + rnd() * 0.6, r = 8 + Math.random() * 4;
        x = P.x + Math.sin(a) * r; z = P.z + Math.cos(a) * r;
        const g = this.ctx.groundAt(x, z, P.y + 4);
        ok = !this.ctx.isDeepWater?.(x, z, g);
      }
      if (!ok) continue;
      const g = this.ctx.groundAt(x, z, P.y + 4);
      for (let k = 0; k < 8; k++) this._fx(x + rnd() * 0.6, g + 0.1, z + rnd() * 0.6, rnd() * 0.8, 1 + Math.random() * 2, rnd() * 0.8, 0.8, 0.1, 0, [0.35, 1, 0.35], 0, 1);
      const c = this.summon?.(type, x, z);
      if (c && typeof c === 'object') this.minions.push(c);
    }
    this.sumCool = 10;     // no máximo uma invocação a cada 10 s
  }

  // bola de fogo verde da mão (0 = direita, 1 = esquerda)
  _fireball(env, hand, o = {}) {
    this.root.updateMatrixWorld(true);
    const p = this.bones.arms[hand].wr.localToWorld(new THREE.Vector3(0, -0.12, 0));
    let v = o.v;
    if (!v) {
      const P = env.player.pos, pv = env.playerVel;
      const tx = P.x + pv.x * 0.3 - p.x, ty = P.y + 1.1 - p.y, tz = P.z + pv.z * 0.3 - p.z, L = Math.hypot(tx, ty, tz) || 1, sp = o.speed ?? 9.5;
      v = new THREE.Vector3(tx / L * sp, ty / L * sp, tz / L * sp);
    }
    env.combat.projectile({ ...FIRE, p, v, homing: o.homing ?? 0.8, grav: o.grav ?? 0 });
    SFX.whoosh(this.audio, this.pd);
  }

  // chuva em leque: sobem abertas e caem numa linha atravessada no caminho do jogador
  // (parado, leva uma; tem que correr para a frente ou para trás). Na fase 3, duas linhas.
  _fan(env, i, n) {
    const P = env.player.pos, pv = env.playerVel, rows = n > 8 ? 2 : 1, per = Math.ceil(n / rows);
    const row = Math.floor(i / per), j = i % per;
    const ax = P.x - this.pos.x, az = P.z - this.pos.z, L = Math.hypot(ax, az) || 1, fx = ax / L, fz = az / L;
    const side = lerp(-3.5, 3.5, per > 1 ? j / (per - 1) : 0.5), fwd = rows > 1 ? (row ? 1.6 : -1.6) : 0;
    const T = 1.15 + j * 0.03 + row * 0.25, g = 6;
    const tx = P.x + pv.x * 0.5 - fz * side + fx * fwd, tz = P.z + pv.z * 0.5 + fx * side + fz * fwd;
    const ty = this.ctx.groundAt(tx, tz, P.y + 2);
    this.root.updateMatrixWorld(true);
    const p = this.bones.arms[i % 2].wr.localToWorld(this._fp.set(0, -0.12, 0));
    const v = new THREE.Vector3((tx - p.x) / T, (ty - p.y + 0.5 * g * T * T) / T, (tz - p.z) / T);
    this._fireball(env, i % 2, { v, homing: 0, grav: g });
  }

  // ---------- círculos de fogo ----------
  _ring(env, x, z) {
    // não empilha dois no mesmo lugar
    for (const R of this.rings) if (R.t < WARN && Math.hypot(R.x - x, R.z - z) < 1.2) return;
    let R = this.pool.pop();
    if (!R) {
      const m = ps1Material({ map: runeTex(), color: 0x90ff50, lit: false, cutout: true, side: THREE.DoubleSide });
      this.fx.push(m);
      R = { ring: new THREE.Mesh(this.ringGeo, m), flame: new THREE.Mesh(this.flameG, this.flameMat), mat: m };
      R.ring.frustumCulled = R.flame.frustumCulled = false;
      this.scene.add(R.ring, R.flame);
    }
    const y = this.ctx.groundAt(x, z, env.player.pos.y + 2);
    Object.assign(R, { x, z, y, t: 0, fired: false, hit: false, pT: 0 });
    R.ring.position.set(x, y + 0.07, z); R.ring.visible = true; R.ring.scale.setScalar(1.35);
    R.flame.position.set(x, y, z); R.flame.visible = false;
    this.rings.push(R);
  }

  _rings(dt, env) {
    const P = env.player.pos;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const R = this.rings[i];
      R.t += dt;
      if (R.t < WARN) {
        // aviso: runas encolhendo até o tamanho certo, cada vez mais claras
        const k = R.t / WARN, pulse = 0.6 + 0.4 * Math.sin(R.t * 18) * k;
        R.ring.scale.setScalar(lerp(1.35, 1, smooth(k)));
        R.ring.rotation.y += dt * (0.8 + 2.5 * k);
        R.mat.uniforms.uColor.value.setRGB(0.35 + 0.5 * k * pulse, 0.7 + 0.3 * pulse, 0.2 + 0.2 * k);
        R.pT -= dt;
        if (R.pT <= 0) {
          R.pT = 0.12;
          const a = Math.random() * TAU;
          this._fx(R.x + Math.cos(a) * RING_R, R.y + 0.1, R.z + Math.sin(a) * RING_R, 0, 0.6 + Math.random() * 0.6, 0, 0.6, 0.07, 0, [0.5, 1, 0.3], 0, 0.5);
        }
        continue;
      }
      const u = (R.t - WARN) / 0.6;
      if (!R.fired) {
        R.fired = true;
        R.flame.visible = true;
        SND.flare(this.audio, Math.hypot(P.x - R.x, P.z - R.z));
        for (let k = 0; k < 12; k++) { const a = Math.random() * TAU, r = Math.random() * RING_R; this._fx(R.x + Math.cos(a) * r, R.y + 0.2, R.z + Math.sin(a) * r, rnd(), 3 + Math.random() * 3, rnd(), 0.5 + Math.random() * 0.3, 0.16, 0, Math.random() < 0.5 ? [0.7, 1, 0.4] : [0.3, 0.9, 0.25], 0, 1.5); }
        for (let k = 0; k < 4; k++) this._fx(R.x + rnd() * 2, R.y + 1, R.z + rnd() * 2, rnd() * 0.5, 1.2, rnd() * 0.5, 1.2, 0.3, 0.6, [0.05, 0.07, 0.05], -0.3, 1);
      }
      // ainda dentro quando a labareda sobe: queima
      if (!R.hit && u < 0.35 && env.playerAlive) {
        const dx = P.x - R.x, dz = P.z - R.z, d = Math.hypot(dx, dz);
        if (d < RING_R + 0.2 && Math.abs(P.y - R.y) < 1.6) { R.hit = true; env.combat.hurt(16, dx / (d || 1), dz / (d || 1), { knock: 6 }); }
      }
      const sy = u < 0.15 ? u / 0.15 : Math.max(0, 1 - (u - 0.15) / 0.85);
      R.flame.scale.set(1 + 0.08 * Math.sin(this.T * 31 + i), Math.max(0.01, sy * (0.9 + 0.15 * Math.sin(this.T * 23 + i))), 1 + 0.08 * Math.cos(this.T * 27 + i));
      R.flame.rotation.y += dt * 3;
      R.ring.scale.setScalar(1 + u * 0.3);
      const f = Math.max(0, 1 - u);
      this.atmo?.light(R.x, R.y + 1, R.z, [0.6 * f, 1.8 * f, 0.5 * f], 8, 6);
      if (u >= 1) {
        R.ring.visible = R.flame.visible = false;
        this.rings.splice(i, 1);
        this.pool.push(R);
      }
    }
  }

  // ---------- efeitos ----------
  _fx(x, y, z, vx, vy, vz, life, s0, s1, color, grav = 0, drag = 0) {
    this.effects.spawn({ p: this._fp.set(x, y, z), v: this._fv.set(vx, vy, vz), life, s0, s1, color, grav, drag });
  }

  _smoke() {
    const p = this.pos;
    for (let i = 0; i < 14; i++) this._fx(p.x + rnd() * 0.5, p.y + 0.2 + Math.random() * 1.6, p.z + rnd() * 0.5, rnd() * 1.4, 0.3 + Math.random() * 0.8, rnd() * 1.4, 0.8 + Math.random() * 0.5, 0.22, 0.45, i < 9 ? [0.05, 0.06, 0.05] : [0.3, 0.9, 0.3], -0.2, 1.5);
  }

  // anel verde que se espalha no chão
  _shock(s = 0.5) {
    const n = Math.round(14 + s * 14);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this._fx(this.pos.x, this.gy + 0.3, this.pos.z, Math.cos(a) * 9, 0.4, Math.sin(a) * 9, 0.55, 0.14, 0.05, [0.4, 1, 0.35], 0, 2.5); }
  }

  _handGlow(wr) {
    if (Math.random() > 0.35) return;
    const p = wr.localToWorld(this._fp.set(0, -0.1, 0));
    this.effects.spawn({ p, v: this._fv.set(rnd() * 0.4, 0.5, rnd() * 0.4), life: 0.35, s0: 0.1, s1: 0, color: [0.5, 1, 0.4], drag: 1 });
  }

  _runeFx(dt) {
    this.runeT = (this.runeT || 0) - dt;
    if (this.runeT > 0) return;
    this.runeT = 0.11;
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * TAU, r = 1.95;
      this._fx(this.pos.x + Math.cos(a) * r, this.gy + 0.1, this.pos.z + Math.sin(a) * r, 0, 0.8 + Math.random() * 0.7, 0, 0.9, 0.07, 0, [0.35, 1, 0.4], 0, 0.3);
    }
  }

  // aura: luz verde forte nela, partículas subindo, fumaça escura dos fiapos
  _aura(dt) {
    if (this.hidden) return;
    const pulse = 0.85 + 0.15 * Math.sin(this.T * 7);
    let col, range;
    if (this.exhausted) { col = [0.18, 0.48, 0.18]; range = 6; }
    else if (this.state === 'ritual') { col = [0.6 * pulse, 1.8 * pulse, 0.55 * pulse]; range = 12; }
    else { col = [0.38, 1.2, 0.4]; range = 9; }
    // na frente dela (por dentro do manto a luz não pega no pano)
    const h = this.heading;
    this.atmo?.light(this.pos.x + Math.sin(h) * 0.8, this.pos.y + 1.5, this.pos.z + Math.cos(h) * 0.8, col, range, 6);
    this.moteT -= dt;
    if (this.moteT > 0) return;
    this.moteT = this.exhausted ? 0.3 : 0.07;
    const a = Math.random() * TAU, r = 0.15 + Math.random() * 0.45, g = 0.75 + Math.random() * 0.25;
    this._fx(this.pos.x + Math.cos(a) * r, this.pos.y + Math.random() * 1.6, this.pos.z + Math.sin(a) * r, rnd() * 0.3, 0.6 + Math.random() * 0.7, rnd() * 0.3, 0.9 + Math.random() * 0.6, 0.05 + Math.random() * 0.03, 0, [0.3 * g, g, 0.32 * g], 0, 0.6);
    if (!this.exhausted && Math.random() < 0.35) this._fx(this.pos.x + rnd() * 0.6, this.pos.y - 0.15, this.pos.z + rnd() * 0.6, rnd() * 0.3, -0.2 + Math.random() * 0.4, rnd() * 0.3, 1.2, 0.12, 0.22, [0.04, 0.06, 0.04], 0, 1);
  }

  // ---------- selo (cena final) ----------
  // a campanha chama quando a cruz é usada com ela exausta e vida ≤ 34%
  seal() {
    if (this.sealing || this.sealed || this.dead) return false;
    this.sealing = true; this.exhausted = false; this.shielded = true; this.untargetable = true;
    this.hidden = false; this.root.visible = true;
    this.state = 'seal'; this.st = 0; this.sq = 0; this.spin = 0; this.rune = 0;
    for (const R of this.rings) { R.ring.visible = R.flame.visible = false; this.pool.push(R); }
    this.rings.length = 0;
    return true;
  }

  _seal(dt, env, W) {
    const t = this.st, A = this.audio, d = this.pd, p = this.pos;
    W.back = t < 2.9 ? 1 : 0.3; W.jaw = 1; W.hair = 0.6; W.open = t > 0.4 && t < 2.9 ? 1 : 0.3; W.kneel = t < 0.6 ? 1 : 0; W.look = 0;
    // grito longo e grave, risada rasgada
    if (this.sq === 0) { this.sq = 1; SFX.wail(A, d, 0.5, 3.6); SND.cackleX(A, d); SFX.quake(A, d); }
    if (this.sq === 1 && t > 1.3) { this.sq = 2; SND.shriek(A, d, 1.7, 0.75); }
    if (this.sq === 2 && t > 2.8) {
      this.sq = 3; SFX.stomp(A, d, 1.5); SND.shriek(A, d, 0.8, 0.6);
      env.combat.shake = Math.max(env.combat.shake, 0.8);
      for (let i = 0; i < 22; i++) this._fx(p.x, p.y + 1.2, p.z, rnd() * 9, rnd() * 9, rnd() * 9, 0.6, 0.12, 0, i % 3 ? [1, 1, 0.95] : [0.5, 1, 0.45], 0, 2);
    }
    if (this.sq === 3 && t > 3.0) {
      this.sq = 4; SND.ash(A, d);
      for (let i = 0; i < 36; i++) { const k = 0.3 + Math.random() * 0.4; this._fx(p.x + rnd() * 0.7, p.y + Math.random() * 1.9, p.z + rnd() * 0.7, rnd() * 1.2, Math.random() * 0.8, rnd() * 1.2, 2 + Math.random(), 0.05 + Math.random() * 0.05, 0.03, [k, k * 0.96, k * 0.92], 1.3, 1.2); }
    }
    // gira subindo
    const hy = lerp(0, 3, smooth(clamp((t - 0.6) / 2.2, 0, 1)));
    this.spin = t < 0.6 ? 0 : t < 2.8 ? Math.min(16, (t - 0.6) * 8) : Math.max(0, this.spin - dt * 40);
    this.heading += this.spin * dt;
    // luz branca saindo de dentro dela
    const g = t < 2.8 ? clamp((t - 0.3) / 2.5, 0, 1) : Math.max(0, 1 - (t - 2.8) / 1.2);
    for (const m of this.mats) m.userData.emissive?.setRGB(g * 0.95, g, g * 0.9);
    const L = t < 2.8 ? 0.4 + g * 2.2 : t < 3.1 ? 3.5 : Math.max(0, 2.6 * (1 - (t - 3.1) / 1.1));
    if (L > 0.02) this.atmo?.light(p.x, p.y + 1.2, p.z, [L, L, L * 0.95], 9 + g * 9, 9);
    if (t < 2.85 && Math.random() < dt * (12 + 40 * g)) {
      const a = Math.random() * TAU, s = 2 + Math.random() * 3;
      this._fx(p.x, p.y + 0.6 + Math.random() * 1.2, p.z, Math.cos(a) * s, rnd() * 2, Math.sin(a) * s, 0.5, 0.09, 0, Math.random() < 0.6 ? [1, 1, 0.95] : [0.45, 1, 0.4], 0, 1.5);
    }
    if (t > 1 && t < 2.8) env.combat.shake = Math.max(env.combat.shake, 0.15 + g * 0.2);
    // desaba em cinzas
    if (t > 3.0) {
      const k = clamp((t - 3.0) / 0.35, 0, 1);
      this.root.scale.set(1 + k * 0.25, Math.max(0.01, 1 - k), 1 + k * 0.25);
      if (k >= 1) this.root.visible = false;
      if (Math.random() < dt * 12) { const c = 0.3 + Math.random() * 0.3; this._fx(p.x + rnd() * 0.6, p.y + Math.random() * 0.5, p.z + rnd() * 0.6, rnd() * 0.4, 0, rnd() * 0.4, 1.6, 0.06, 0.03, [c, c, c], 1.3, 1.2); }
    }
    if (t > 4.2) {
      // fim: selada para sempre
      this.sealing = false; this.sealed = true;
      this.dead = true; this.hp = 0; this.state = 'dead'; this.deadT = 0;
      this.root.visible = false;
      this.combat?.onKill?.(this, { kind: 'seal' });
      this.onSealed?.(this);
    }
    return hy;
  }

  dying(dt) {
    if (this.sealed) { this.root.visible = false; if (this.deadT > 0.5) this.removed = true; return; }
    super.dying(dt);
  }

  // ---------- animação ----------
  animate(dt) {
    this.T += dt;
    const P = this.P, W = this.want, B = this.bones, t = this.T;
    const k = Math.min(1, dt * 7), kc = Math.min(1, dt * 16);
    for (const key of POSE) P[key] = lerp(P[key], W[key], key === 'castR' || key === 'castL' ? kc : k);
    P.flinch = Math.max(0, P.flinch - dt * 4);
    const kn = smooth(clamp(P.kneel, 0, 1));
    const br = Math.sin(t * lerp(1.6, 6.5, kn));
    // corpo flutuando, balança de leve; ajoelhada, desce e ofega
    B.body.position.y = lerp(1.05 + Math.sin(t * 1.6) * 0.04, 0.5, kn);
    B.body.rotation.x = this.lean * (1 - kn) - P.flinch * 0.12;
    B.body.rotation.z = Math.sin(t * 0.9) * 0.05 * (1 - kn);
    B.chest.rotation.x = 0.2 - P.back * 0.45 + kn * 0.55 + br * 0.03 * (1 + kn * 1.5) - P.flinch * 0.2 - P.open * 0.1;
    B.chest.position.y = br * 0.012 * kn;
    B.neck.rotation.x = 0.3 - P.back * 0.35 + kn * 0.2;
    B.head.rotation.x = -0.6 - P.back * 0.4 + kn * 0.35 - P.flinch * 0.3;
    B.head.rotation.y = P.look * 0.8;
    B.head.rotation.z = Math.sin(t * 0.7) * 0.12 * (1 - P.back);
    const chatter = this.cackleT > 0 ? (0.5 + 0.5 * Math.sin(t * 24)) * 0.3 : 0;
    B.jaw.rotation.x = 0.03 + P.jaw * 0.45 + chatter + kn * (0.12 + 0.08 * br);
    // braços: pose de descanso misturada com as poses dos feitiços
    for (const Ar of B.arms) {
      const s = Ar.s, c = s > 0 ? P.castR : P.castL;
      let v = [-0.5 + Math.sin(t * 1.3 + s) * 0.08, s * 0.24, -0.9 + Math.sin(t * 1.1 + s * 2) * 0.1, 0.75, 0.15, 0.25, s * 1.2];
      const mixP = (q, f) => { if (f > 0.001) for (let i = 0; i < 7; i++) v[i] = lerp(v[i], q[i], f); };
      mixP([-1.05, s * 0.12, -0.15, 0.35, 0.3, -0.5, 0], kn);
      mixP([-2.75 + Math.sin(t * 9 + s) * 0.04, s * 0.5, -0.3, 0.15, 0.5, 0.2, s * 1.4], P.up);
      if (s > 0) mixP([-1.55, 0.02, -0.05, 0.05, 0.05, 0, 0], P.point);
      if (c > 0) mixP([-2.3, s * 0.75, -1.7, 0.2, 0.45, 0.5, s * 0.8], c);
      else if (c < 0) mixP([-1.45, s * 0.05, -0.05, 0, 0.55, -0.2, 0], -c);
      mixP([-1.5, s * 0.12, -0.05, 0, 0.6, -0.9, 0], P.push);
      mixP([-0.3, s * 1.45, -0.15, 0.1, 0.6, 0, s * 0.6], P.open);
      if (s < 0) mixP([-2.1, -s * 0.7, -1.9, 0.6, 0.2, 0, 0], P.cover);
      Ar.sh.rotation.x = v[0]; Ar.sh.rotation.z = v[1];
      Ar.el.rotation.x = v[2];
      Ar.wr.rotation.x = v[5]; Ar.wr.rotation.y = v[6];
      Ar.fingers.forEach((f, i) => {
        if (i === 4) { f.rotation.x = v[3] * 0.6; return; }
        f.rotation.x = v[3] + Math.sin(t * 2 + i + s) * 0.06;
        f.rotation.z = (i - 1.5) * v[4] * 0.25;
      });
    }
    // manto e vestido: barra ondulando, fiapos tremulando; ajoelhada, o pano empoça
    const amp = (1 + P.up * 0.8 + Math.min(1, this.speed * 0.25)) * (1 - kn * 0.7);
    this._ripple(t, amp, this.trail[0], this.trail[1]);
    this.skirt.scale.set(1 + kn * 0.28, 1 - kn * 0.54, 1 + kn * 0.28);
    this.cloak.scale.set(1 + kn * 0.18, 1 - kn * 0.42, 1 + kn * 0.18);
    this._hair(t, P.hair);
    // teletransporte: estica, afina e some
    if (this.state === 'teleport' && !this.sealing) {
      const st = this.st, a = clamp(st / 0.35, 0, 1), b = clamp((st - 0.9) / 0.3, 0, 1), f = st < 0.9 ? a : 1 - b;
      this.root.scale.set(1 - 0.85 * f, 1 + 0.5 * f, 1 - 0.85 * f);
    } else if (!this.sealing) this.root.scale.set(1, 1, 1);
    // runas do ritual no chão
    B.rune.visible = this.rune > 0.01 && !this.hidden;
    if (B.rune.visible) {
      B.rune.position.y = this.gy - this.pos.y + 0.06;
      B.rune.scale.setScalar(smooth(this.rune));
      B.rune.rotation.y += dt * 0.7; B.runeIn.rotation.y -= dt * 2;
    }
    // olhos: acesos, mais fortes no ritual, apagados quando exausta
    const e = this.eyeMat.uniforms.uColor.value;
    if (this.sealing) e.setRGB(1, 1, 1);
    else if (this.exhausted) e.setRGB(0.22, 0.42, 0.18);
    else if (this.state === 'ritual') e.setRGB(0.85, 1, 0.75);
    else e.setRGB(0.66, 1, 0.53);
  }

  _ripple(t, amp, tx, tz) {
    for (const R of this.rips) {
      const a = R.geo.getAttribute('position'), arr = a.array, { base, ca, sa, ang, w } = R;
      for (let i = 0; i < R.n; i++) {
        const j = i * 3, wi = w[i], ww = wi * wi;
        if (ww < 0.002) continue;
        const g = ang[i], ex = Math.max(0, wi - 1);
        const dr = (Math.sin(g * 3 + t * 2.1) * 0.035 + Math.sin(g * 5 - t * 3.3) * 0.02 + ex * 0.1) * ww * amp;
        arr[j] = base[j] + ca[i] * dr + tx * ww + Math.sin(t * 5 + g * 7) * 0.06 * ex * amp;
        arr[j + 1] = base[j + 1] + Math.sin(g * 4 + t * 2.7) * 0.025 * ww * amp + ex * Math.sin(t * 6 + g * 5) * 0.04 * amp;
        arr[j + 2] = base[j + 2] + sa[i] * dr + tz * ww + Math.cos(t * 4.3 + g * 5) * 0.06 * ex * amp;
      }
      a.needsUpdate = true;
    }
  }

  // mechas: cada uma gira na raiz (para fora = levanta no ritual) e balança
  _hair(t, up) {
    const H = this.hairData, p = H.geo.getAttribute('position'), arr = p.array, { meta, rel, sid } = H;
    const cs = meta.map((m, i) => {
      const lift = m.lift + up * (0.22 + (i % 3) * 0.1) + Math.sin(t * 1.3 + i * 1.7) * 0.06 * (1 + up * 2.5);
      const tilt = m.tilt + Math.sin(t * 1.1 + i * 2.3) * 0.05 * (1 + up * 2);
      return [Math.cos(lift), Math.sin(lift), Math.cos(tilt), Math.sin(tilt), Math.cos(m.th), Math.sin(m.th)];
    });
    for (let v = 0; v < p.count; v++) {
      const m = meta[sid[v]], [cl, sl, ct, stl, ox, oz] = cs[sid[v]];
      const rt = rel[v * 3], ro = rel[v * 3 + 1], ry = rel[v * 3 + 2];
      const o2 = ro * cl - ry * sl, y2 = ro * sl + ry * cl;
      const t2 = rt * ct - y2 * stl, y3 = rt * stl + y2 * ct;
      arr[v * 3] = m.rx - oz * t2 + ox * o2;
      arr[v * 3 + 1] = m.ry + y3;
      arr[v * 3 + 2] = m.rz + ox * t2 + oz * o2;
    }
    p.needsUpdate = true;
  }

  dispose() {
    super.dispose();
    for (const R of [...this.rings, ...this.pool]) this.scene.remove(R.ring, R.flame);
    this.rings.length = 0; this.pool.length = 0;
    this.ringGeo.dispose(); this.flameG.dispose();
    for (const m of this.fx) m.dispose();
  }
}
