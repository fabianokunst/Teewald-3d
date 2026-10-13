import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, joint, mix3, lerp, clamp, wrapA, damp, smooth, TAU } from './shapes.js';
import { SFX, noise, tone, fall } from './sfx.js';
import { makeCanvas, canvasTex, processPixels } from '../../engine/textures.js';
import { ps1Material, ensureColor } from '../../engine/ps1material.js';

// Assombrações.
// - Fantasma: colono do século XIX (ou a mulher, ou a criança) que ficou preso por
//   aqui: figura pálida e translúcida, roupa esfarrapada que acaba em fiapos no lugar
//   das pernas, braços compridos, rosto vazio. Vaga, vem flutuando, estende os braços
//   (o aviso) e agarra: um frio que fere; depois some piscando e volta mais adiante.
//   Bala e soco atravessam (ele se desfaz um instante); quem mata é a luz do lampião.
// - Lúcia: a moça da fábrica de calçados (morreu no incêndio de 1983, trancada lá
//   dentro pelo capataz). Não ataca; aparece, chora, aponta, e no fim se liberta.
// - O Capataz: o fantasma carbonizado de quem trancou as portas. Chefe: as balas quase
//   não pegam; a luz do lampião o expõe, ele se ajoelha e fica vulnerável.

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const rng = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------- sons próprios (sintetizados) ----------
const ok = a => !!(a && a.ctx && a.white);
const SND = {
  // agarrão gelado: sopro frio e um tom que despenca
  chill(a, d = 0) {
    if (!ok(a) || fall(d, 30) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 30);
    noise(a, t, 0.9, { type: 'highpass', f: 3200, f1: 1200, vol: 0.13 * v, attack: 0.04 });
    tone(a, t, 0.8, { type: 'sine', f: 760, f1: 170, vol: 0.06 * v, attack: 0.02, vib: 20, vibF: 9 });
  },
  // fantasma queimando na luz: grito agudo e rachado
  shriek(a, d = 0, p = 1) {
    if (!ok(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    tone(a, t, 0.75, { type: 'sawtooth', f: 900 * p, fMid: 1450 * p, f1: 560 * p, vol: 0.03 * v, attack: 0.03, vib: 60, vibF: 11 });
    tone(a, t, 0.75, { type: 'sine', f: 1300 * p, f1: 760 * p, vol: 0.045 * v, attack: 0.03, vib: 40 });
    noise(a, t, 0.6, { type: 'bandpass', f: 2600, q: 3, vol: 0.05 * v, attack: 0.05 });
  },
  // névoa: sopro que cai (desfazer, sumir, reaparecer)
  mist(a, d = 0) {
    if (!ok(a) || fall(d, 35) <= 0) return;
    noise(a, a.ctx.currentTime, 0.7, { type: 'bandpass', f: 1900, f1: 380, q: 1.2, vol: 0.09 * fall(d, 35), attack: 0.08 });
  },
  // libertação: acorde maior que sobe devagar, com cintilância
  release(a) {
    if (!ok(a)) return;
    const t = a.ctx.currentTime;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(a, t + i * 0.4, 4.6 - i * 0.4, { type: 'sine', f, f1: f * 1.003, vol: 0.035, attack: 0.9, vib: 2, vibF: 5 }));
    for (let i = 0; i < 12; i++) tone(a, t + 0.6 + i * 0.33, 0.7, { type: 'triangle', f: 1046 + Math.random() * 1046, vol: 0.012, attack: 0.02 });
  },
  // molho de chaves batendo
  keys(a, d = 0, k = 1) {
    if (!ok(a) || fall(d, 30) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 30) * k;
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.05 + Math.random() * 0.03;
      tone(a, tt, 0.09, { type: 'square', f: 2500 + Math.random() * 1800, vol: 0.012 * v, attack: 0.002 });
      noise(a, tt, 0.05, { type: 'highpass', f: 4500, vol: 0.05 * v, attack: 0.002 });
    }
  },
  // corrente arrastando / chicoteando
  chain(a, d = 0) {
    if (!ok(a) || fall(d, 45) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 45);
    for (let i = 0; i < 8; i++) {
      const tt = t + i * 0.055 + Math.random() * 0.02;
      noise(a, tt, 0.07, { type: 'bandpass', f: 1400 + Math.random() * 1200, q: 4, vol: 0.09 * v, attack: 0.003 });
      tone(a, tt, 0.08, { type: 'square', f: 900 + Math.random() * 500, vol: 0.01 * v, attack: 0.002 });
    }
  },
  // urro do capataz: rouco, grave, com um grito por cima
  bellow(a, d = 0) {
    if (!ok(a) || fall(d, 120) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 120);
    tone(a, t, 1.8, { f: 92, fMid: 140, f1: 58, vol: 0.18 * v, attack: 0.12, vib: 22 });
    tone(a, t, 1.8, { type: 'square', f: 185, fMid: 260, f1: 105, vol: 0.05 * v, attack: 0.15, vib: 35 });
    tone(a, t + 0.1, 1.5, { type: 'sawtooth', f: 520, fMid: 720, f1: 290, vol: 0.03 * v, attack: 0.2, vib: 50, vibF: 13 });
    noise(a, t, 1.7, { f: 900, f1: 280, q: 1.2, vol: 0.28 * v, attack: 0.12 });
  },
  // gemido grave (respira fumaça)
  groan(a, d = 0) {
    if (!ok(a) || fall(d, 50) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 50);
    tone(a, t, 1.6, { f: 68, fMid: 84, f1: 52, vol: 0.1 * v, attack: 0.3, vib: 10, vibF: 6 });
    noise(a, t, 1.5, { f: 340, q: 2, vol: 0.08 * v, attack: 0.3 });
  },
  // brasa chiando (luz nele)
  sizzle(a, d = 0) {
    if (!ok(a) || fall(d, 30) <= 0) return;
    noise(a, a.ctx.currentTime, 0.5, { type: 'highpass', f: 2500, f1: 5200, vol: 0.06 * fall(d, 30), attack: 0.05 });
  },
  // some/surge na fumaça
  smoke(a, d = 0) {
    if (!ok(a) || fall(d, 50) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 50);
    noise(a, t, 0.9, { f: 650, f1: 140, q: 0.7, vol: 0.22 * v, attack: 0.08 });
    noise(a, t, 0.5, { type: 'highpass', f: 3000, vol: 0.05 * v, attack: 0.05 });
  },
};

// ---------- texturas desenhadas ----------
// tecido gasto: fios verticais, trama fraca e manchas (roupa, mechas de cabelo)
let CLOTH = null;
function clothTex() {
  if (CLOTH) return CLOTH;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rng(11);
  const col = []; for (let x = 0; x < 32; x++) col.push(R());
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    let v = 228 + R() * 18 - col[x] * 42 - (y % 4 === 0 ? 8 : 0);
    if (Math.sin(x * 0.45 + 1.3) * Math.cos(y * 0.3) > 0.72) v -= 34;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (CLOTH = canvasTex(processPixels(c), true));
}

// rachadura em brasa: linha que vai mudando de rumo, com um halo escuro avermelhado
function crack(g, R, x, y, len, hot = '#ff7a1a', halo = '#3a1004', w = 1) {
  const pts = [[x, y]];
  let a = R() * TAU;
  for (let i = 0; i < len; i++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; pts.push([x, y]); }
  for (const [lw, s] of [[1.8 * w, halo], [0.9 * w, hot]]) {
    g.strokeStyle = s; g.lineWidth = lw; g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.stroke();
  }
}

// pele carbonizada do capataz: preto-marrom com rede de rachaduras em brasa
let CHAR = null;
function charTex() {
  if (CHAR) return CHAR;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rng(23);
  for (let i = 0; i < 32 * 32; i++) {
    const v = 5 + R() * 9;
    d.data[i * 4] = v * 1.05; d.data[i * 4 + 1] = v * 0.92; d.data[i * 4 + 2] = v * 0.85; d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  for (let i = 0; i < 9; i++) crack(g, R, R() * 32, R() * 32, 4 + R() * 7);
  for (let i = 0; i < 10; i++) { g.fillStyle = R() < 0.5 ? '#ffb040' : '#c04010'; g.fillRect(R() * 32 | 0, R() * 32 | 0, 1, 1); }
  return (CHAR = canvasTex(processPixels(c), true));
}

// pano do terno queimado (mangas, calça, chapéu): quase preto, com rachaduras em brasa
let BURNT = null;
function burntTex() {
  if (BURNT) return BURNT;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), R = rng(41);
  g.fillStyle = '#0d0b0a'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 160; i++) { g.fillStyle = R() < 0.5 ? '#080606' : '#171312'; g.fillRect(R() * 32 | 0, R() * 32 | 0, 1, 2 + (R() * 3 | 0)); }
  for (let i = 0; i < 3; i++) crack(g, R, R() * 32, R() * 32, 3 + R() * 4, '#e85a10', '#220802', 0.85);
  return (BURNT = canvasTex(processPixels(c), true));
}

// terno e colete queimados (frente em u = 0,25): lapelas, colete com botões, camisa
// e gravata, bolsos, buracos de queimadura com borda em brasa e rachaduras
let SUIT = null;
function suitTex() {
  if (SUIT) return SUIT;
  const W = 64, H = 64, c = makeCanvas(W, H), g = c.getContext('2d'), R = rng(5);
  const poly = (col, pts) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  const line = (col, x0, y0, x1, y1, w = 1) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  g.fillStyle = '#0f0c0b'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i++) { g.fillStyle = R() < 0.5 ? '#0e0b0a' : '#1e1917'; g.fillRect(R() * W | 0, R() * H | 0, 1, 2); }
  const fx = 16;
  poly('#20140d', [[fx - 8, 4], [fx + 8, 4], [fx + 6, 44], [fx, 49], [fx - 6, 44]]);           // colete
  poly('#30261e', [[fx - 4, 0], [fx + 4, 0], [fx, 20]]);                                         // camisa
  poly('#160a08', [[fx - 1, 2], [fx + 1, 2], [fx + 1.6, 17], [fx, 20], [fx - 1.6, 17]]);          // gravata
  for (let y = 24; y <= 42; y += 6) { g.fillStyle = '#9a7a38'; g.fillRect(fx, y, 1, 1); }         // botões
  line('#2a2522', fx - 9, 2, fx - 1, 41, 1.5); line('#2a2522', fx + 9, 2, fx + 1, 41, 1.5);      // lapelas
  line('#080605', fx - 10, 3, fx - 2, 42); line('#080605', fx + 10, 3, fx + 2, 42);
  poly('#0a0807', [[fx, 45], [fx + 6, 64], [fx - 6, 64]]);                                      // paletó aberto embaixo
  line('#090706', fx - 13, 47, fx - 7, 47); line('#090706', fx + 7, 47, fx + 13, 47);           // bolsos
  line('#090706', 48, 20, 48, 64);                                                               // costura das costas
  // queimaduras: manchas pretas com borda em brasa
  for (let i = 0; i < 6; i++) {
    const x = R() * W, y = R() * H, r = 0.9 + R() * 1.6;
    g.fillStyle = '#7a2608'; g.beginPath(); g.arc(x, y, r + 0.8, 0, TAU); g.fill();
    g.fillStyle = '#0a0706'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 9; i++) crack(g, R, R() * W, R() * H, 3 + R() * 6, '#ff6a14', '#2e0c03', 0.8);
  return (SUIT = canvasTex(processPixels(c), true));
}

// vestido de operária (frente em u = 0,25): azul-claro desbotado com bolinhas, avental
// branco-encardido com peitilho e laço nas costas, gola branca, barra chamuscada
let DRESS = null;
function dressTex() {
  if (DRESS) return DRESS;
  const W = 64, H = 64, c = makeCanvas(W, H), g = c.getContext('2d'), R = rng(31);
  g.fillStyle = '#9db3cb'; g.fillRect(0, 0, W, H);
  for (let y = 1; y < H; y += 4) for (let x = (y % 8 === 1 ? 0 : 2); x < W; x += 4) { g.fillStyle = '#b6c8dc'; g.fillRect(x, y, 1, 1); }
  for (let i = 0; i < 9; i++) { const x = R() * W | 0; g.fillStyle = 'rgba(110,130,160,0.35)'; g.fillRect(x, 26, 1, 38); }   // pregas da saia
  const fx = 16;
  g.fillStyle = '#e2e0d8'; g.fillRect(fx - 9, 26, 18, 32);                                     // avental
  g.fillStyle = '#d2d0c8'; for (let x = fx - 7; x < fx + 9; x += 4) g.fillRect(x, 30, 1, 27);   // dobras
  g.fillStyle = '#e2e0d8'; g.fillRect(fx - 5, 12, 10, 14);                                     // peitilho
  g.fillStyle = '#cfcdc4'; g.fillRect(0, 25, W, 2);                                            // cordão na cintura
  g.fillStyle = '#d8d6ce'; g.fillRect(45, 24, 6, 4); g.fillRect(47, 27, 2, 6);                 // laço nas costas
  g.fillStyle = '#e6eaf0'; g.fillRect(fx - 6, 0, 12, 3);                                       // gola
  g.fillStyle = '#7f93ad'; g.fillRect(fx - 1, 3, 2, 9);                                        // abotoamento
  // barra chamuscada (o incêndio)
  for (let i = 0; i < 14; i++) {
    const x = R() * W, y = 60 + R() * 4, r = 0.8 + R() * 1.6;
    g.fillStyle = '#7e7a80'; g.beginPath(); g.arc(x, y, r + 0.8, 0, TAU); g.fill();
    g.fillStyle = '#4a4a54'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return (DRESS = canvasTex(processPixels(c), true));
}

// rosto da Lúcia (frente em u = 0,25; olhos em v ≈ 0,48): pele muito pálida, olhos
// escuros e tristes com olheiras, sobrancelhas caídas, boca pequena; cabelo escuro atrás
let FACE = null;
function faceTex() {
  if (FACE) return FACE;
  const W = 128, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
  const fx = 32;
  g.fillStyle = '#e8eef6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d6dce8'; g.fillRect(fx - 26, 40, 52, 24);                                    // sombra do queixo/pescoço
  // cabelo: topo, costas e lados
  g.fillStyle = '#1d1a1e'; g.fillRect(0, 0, W, 12); g.fillRect(fx + 22, 0, W - fx - 22 - 10, H); g.fillRect(W - 10, 0, 10, H);
  g.fillRect(0, 0, fx - 22, H);
  g.fillStyle = '#2a262c'; for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, x > fx - 22 && x < fx + 22 ? 12 : H);
  // franja irregular sobre a testa
  g.fillStyle = '#1d1a1e';
  for (let x = fx - 22; x < fx + 22; x++) g.fillRect(x, 12, 1, 3 + Math.round(Math.abs(Math.sin(x * 0.7)) * 5 + (x < fx ? 3 : 0)));
  for (const s of [-1, 1]) {
    const ex = fx + s * 9;
    g.fillStyle = '#c4cbd8'; g.fillRect(ex - 4, 35, 9, 2);                                     // olheiras
    // olho escuro amendoado, um pouco caído para fora
    g.fillStyle = '#1a1620'; g.fillRect(ex - 3, 31, 7, 1); g.fillRect(ex - 4, 32, 9, 2); g.fillRect(ex - 3, 34, 7, 1);
    g.fillStyle = '#060508'; g.fillRect(ex - 1, 32, 3, 2);
    g.fillStyle = '#3c3644'; g.fillRect(ex - 3, 30, 7, 1);                                     // cílios / pálpebra
    g.fillStyle = '#1a1620'; g.fillRect(s > 0 ? ex + 5 : ex - 5, 33, 1, 1);                    // canto caído
    // sobrancelha: ponta de dentro mais alta (tristeza)
    g.fillStyle = '#3a3238';
    for (let i = 0; i < 7; i++) g.fillRect(ex - s * 3 + s * i, 26 + Math.round(i * 0.45), 1, 1);
  }
  g.fillStyle = '#cdd3df'; g.fillRect(fx, 34, 1, 7); g.fillRect(fx - 2, 41, 5, 1);             // nariz
  g.fillStyle = '#a8949c'; g.fillRect(fx - 3, 49, 7, 1); g.fillRect(fx - 4, 50, 1, 1); g.fillRect(fx + 4, 50, 1, 1);   // boca triste
  g.fillStyle = '#c4b4bc'; g.fillRect(fx - 2, 50, 5, 1);
  return (FACE = canvasTex(processPixels(c), true));
}

// ---------- peças ----------
// disco achatado virado para +z (olhos, órbitas, boca); h estica na vertical
function disc(r, h = 1, depth = 0.01, n = 8) {
  const g = blob([[-depth, 0], [-depth * 0.3, r * 0.9], [depth * 0.3, r], [depth, 0]], n, { sz: h });
  g.rotateX(Math.PI / 2);
  return g;
}

// mecha de cabelo: fita achatada pendurada para -y
const lock = (len, w, col, n = 4) => blob([[-len, 0], [-len * 0.85, w * 0.55], [-len * 0.45, w], [0, w * 0.85], [w * 0.4, 0]], n, { sz: 0.35, col, vRep: 3 });

// barra esfarrapada: a primeira volta do sólido desce em pontas irregulares (fiapos);
// guarda as duas primeiras voltas para balançar
function tatter(geo, n, depth, R = Math.random) {
  const p = geo.getAttribute('position');
  const lens = [];
  for (let k = 0; k <= n; k++) lens.push(k % 2 === 0 ? 0.55 + R() * 0.45 : R() * 0.25);
  lens[n] = lens[0];
  const idx = [], base = [];
  for (let ring = 0; ring < 2; ring++) for (let k = 0; k <= n; k++) {
    const i = ring * (n + 1) + k;
    if (ring === 0) p.setY(i, p.getY(i) - depth * lens[k]);
    idx.push(i); base.push(p.getX(i), p.getY(i), p.getZ(i));
  }
  geo.userData.hem = { idx, base, n };
  return geo;
}

// fiapos ao vento (tz = arrasto para trás quando anda)
function waveHem(geo, t, amp, tz = 0) {
  const H = geo.userData.hem; if (!H) return;
  const p = geo.getAttribute('position'), n = H.n;
  for (let j = 0; j < H.idx.length; j++) {
    const k = j % (n + 1), w = j <= n ? 1 : 0.35, kk = k === n ? 0 : k;
    const b = j * 3;
    p.setXYZ(H.idx[j],
      H.base[b] + Math.sin(t * 2.3 + kk * 1.7) * amp * w,
      H.base[b + 1] + Math.sin(t * 3.1 + kk * 2.3) * amp * 0.6 * w,
      H.base[b + 2] + Math.cos(t * 2.1 + kk * 1.3) * amp * w + tz * w);
  }
  p.needsUpdate = true;
}

// braço: ombro → cotovelo → mão com dedos para baixo (palma virada para dentro)
function makeArm(cr, parent, side, x, y, z, o) {
  const sh = joint(parent, x, y, z);
  if (o.sleeve) sh.add(cr.mesh(o.sleeve.isBufferGeometry ? o.sleeve : limb(o.sleeve[0], o.sleeve[1], o.sleeve[2], o.n ?? 6, o.sleeveCol), o.sleeveMat));
  sh.add(cr.mesh(limb(o.l1, o.r0, o.r1, o.n ?? 5, o.col), o.mat));
  const el = joint(sh, 0, -o.l1, 0);
  el.add(cr.mesh(limb(o.l2, o.r1, o.r2, o.n ?? 5, o.col2 || o.col), o.mat2 || o.mat));
  const hand = joint(el, 0, -o.l2, 0);
  const pw = o.palm, hc = o.handCol || o.col, hm = o.handMat || o.mat;
  hand.add(cr.mesh(blob([[-pw * 1.25, 0], [-pw, pw * 0.5], [-pw * 0.3, pw * 0.58], [0, pw * 0.42], [pw * 0.25, 0]], o.pn ?? 5, { sx: 0.42, col: hc }), hm));
  const nf = o.fingers ?? 4;
  for (let i = 0; i < nf; i++) {
    const f = cr.mesh(cone(o.finger * (i === 0 || i === nf - 1 ? 0.8 : 1), pw * 0.13, hc(0.5, 0), hc(1, 0), 3), hm);
    f.rotation.x = Math.PI;
    f.position.set(0, -pw * 1.1, (i - (nf - 1) / 2) * pw * (nf === 3 ? 0.36 : 0.27));
    hand.add(f);
  }
  const th = cr.mesh(cone(o.finger * 0.6, pw * 0.14, hc(0.5, 0), hc(1, 0), 3), hm);
  th.rotation.set(Math.PI - 0.5, 0, side * 0.5);
  th.position.set(-side * pw * 0.12, -pw * 0.4, pw * 0.4);
  hand.add(th);
  return { sh, el, hand, side };
}

// pré-passo de profundidade: só a superfície da frente aparece (translúcido sem ver o
// corpo por dentro). Desenha depois dos opacos, sem cor, um pouco atrás.
let PRE = null;
function depthPrepass(root) {
  if (!PRE) { PRE = ps1Material({ lit: false, polygonOffset: 1 }); PRE.colorWrite = false; }
  const list = [];
  root.traverse(o => { if (o.isMesh && !o.userData.noPre) list.push(o); });
  for (const o of list) {
    const m = new THREE.Mesh(o.geometry, PRE);
    m.renderOrder = 10; m.frustumCulled = false; m.userData.noPre = true;
    o.add(m);
  }
}

// limita (x, z) à arena {x, z, r} e à área jogável
function clampXZ(cr, x, z) {
  const a = cr.arena, b = cr.ctx.playBounds;
  if (a) {
    const dx = x - a.x, dz = z - a.z, L = Math.hypot(dx, dz), R = a.r - 0.6;
    if (L > R) { x = a.x + dx / L * R; z = a.z + dz / L * R; }
  }
  if (b) { x = clamp(x, b.x0 + 0.5, b.x1 - 0.5); z = clamp(z, b.z0 + 0.5, b.z1 - 0.5); }
  return { x, z };
}
function keepIn(cr) { const q = clampXZ(cr, cr.pos.x, cr.pos.z); cr.pos.x = q.x; cr.pos.z = q.z; }

const distP = cr => (cr.player ? Math.hypot(cr.player.pos.x - cr.pos.x, cr.player.pos.z - cr.pos.z) : 10);

// névoa clara (surgir, sumir, desfazer)
function mist(cr, n, spread = 1, col = [0.66, 0.76, 0.92], h = 1.5) {
  const p = cr.pos, s = cr.scale || 1;
  for (let i = 0; i < n; i++) {
    cr.effects.spawn({
      p: v3(p.x + (Math.random() - 0.5) * 0.7 * s, p.y + (0.15 + Math.random() * h) * s, p.z + (Math.random() - 0.5) * 0.7 * s),
      v: v3((Math.random() - 0.5) * spread, Math.random() * 0.7 * spread, (Math.random() - 0.5) * spread),
      life: 0.7 + Math.random() * 0.7, s0: (0.08 + Math.random() * 0.08) * s, s1: 0, color: col, drag: 1.5, grav: -0.3,
    });
  }
}

const HOVER = 0.3;
const GPALE = [0.84, 0.89, 0.96], GGREY = [0.55, 0.61, 0.72], GWHITE = [0.97, 0.98, 1], GFOG = [0.5, 0.58, 0.7], GHOLE = [0.3, 0.34, 0.42];

// =====================================================================
// Fantasma
// =====================================================================
export class Ghost extends Creature {
  // o: { kind: 'colono' | 'mulher' | 'crianca', color, scale, opacity, arena: {x, z, r}, state }
  constructor(deps, o = {}) {
    const r = Math.random(), kind = o.kind || (r < 0.6 ? 'colono' : r < 0.88 ? 'mulher' : 'crianca'), kid = kind === 'crianca';
    super(deps, {
      name: 'FANTASMA', hp: o.hp ?? (kid ? 2 : 2.5), radius: 0.35, height: 1.8, death: 'fade', blood: [0.72, 0.82, 0.96],
      resist: { bullet: 0, melee: 0, silver: 0.5, ray: 0.3, explosion: 0.3, dart: 0, light: 1, fire: 0 }, ...o,
    });
    this.kind = kind;
    this.ghost = true;                         // atravessa paredes e obstáculos
    this.burstColor = [0.75, 0.85, 1];
    this.immuneColor = [0.78, 0.86, 1];
    this.bloodGrav = -0.6;
    this.arena = o.arena || null;
    this.scale = o.scale ?? (kid ? 0.62 : 0.95 + Math.random() * 0.1);
    this.baseScale = this.scale;
    this.op = o.opacity ?? 0.55;
    this.color = o.color ?? 0xc0d6ff;
    this.voice = kid ? 1.5 : kind === 'mulher' ? 1.15 : 0.85;
    this.speedBase = (1.6 + Math.random() * 0.8) * (kid ? 1.35 : 1);
    this.build();
    this.root.scale.setScalar(this.scale);
    this.P = { reach: 0, cover: 0, limp: 0, lean: 0, phase: Math.random() * TAU };
    this.state = o.state || 'wander';
    this.vis = 1; this.clock = 0; this.litT = 0; this.cool = 0; this.wailT = 0; this.lastShriek = -9;
    this.nextSound = 2 + Math.random() * 4;
    this.wanderT = 1 + Math.random() * 3;
    this.mistT = 0; this.home = null; this.hidden = false;
  }

  build() {
    const woman = this.kind === 'mulher', kid = this.kind === 'crianca';
    const body = this.mat({ map: clothTex(), color: this.color, lit: false, transparent: true, opacity: this.op, depthWrite: false });
    // órbitas e boca: fora da lista da base, para não clarear no clarão do golpe/luz
    const dark = this.darkMat = ps1Material({ map: null, color: 0x020306, lit: false, transparent: true, opacity: Math.min(0.95, this.op + 0.3), depthWrite: false });
    for (const m of [...this.mats, dark]) m.userData.op = m.uniforms.uOpacity.value;
    const B = this.bones = {};
    B.body = joint(this.root, 0, HOVER, 0);
    // roupa: casaco/camisa (colono, criança) ou vestido longo (mulher), acabando em fiapos
    const n = 16;
    const prof = woman
      ? [[0, 0.32], [0.2, 0.285], [0.45, 0.235], [0.66, 0.19], [0.76, 0.165], [0.9, 0.178], [1.04, 0.2], [1.14, 0.205], [1.22, 0.175], [1.27, 0.11], [1.3, 0.055]]
      : [[0, 0.25], [0.15, 0.232], [0.4, 0.205], [0.6, 0.195], [0.66, 0.2], [0.82, 0.212], [0.98, 0.225], [1.1, 0.235], [1.18, 0.22], [1.25, 0.17], [1.29, 0.1], [1.32, 0.055]];
    const top = prof[prof.length - 1][0];
    const col = (t, a) => {
      const y = t * top, fr = Math.sin(a);
      let c = mix3(GFOG, GPALE, smooth(clamp(y / 0.7, 0, 1)));        // embaixo vira névoa azulada
      if (woman) {
        if (fr > 0.85 && y > 0.12 && y < 0.76) c = mix3(c, GWHITE, 0.7);  // avental
        if (y > 0.74 && y < 0.8) c = GGREY;                                // cintura
        if (y > 1.0) c = mix3(c, GGREY, 0.55);                             // xale
      } else {
        if (y > 0.58 && y < 0.67) c = GGREY;                               // cinto
        if (y > 0.67 && y < 1.25 && fr > 0.7 && fr < 0.95) c = mix3(c, GGREY, 0.8);   // suspensórios
      }
      if (Math.sin(y * 17 + a * 5) * Math.cos(a * 7 - y * 9) > 0.7) c = mix3(c, GGREY, 0.6);   // rasgos
      return mix3(c, GGREY, (1 - fr) * 0.12);
    };
    this.robe = tatter(blob(prof, n, { sz: woman ? 0.74 : 0.66, col, vRep: 3 }), n, 0.24);
    B.body.add(this.mesh(this.robe, body));
    // pescoço e cabeça (criança: cabeça maior)
    B.neck = joint(B.body, 0, top - 0.03, 0);
    B.neck.add(this.mesh(blob([[-0.04, 0.05], [0.06, 0.042], [0.12, 0.045]], 6, { col: () => GPALE }), body));
    B.head = joint(B.neck, 0, 0.16, 0.015);
    if (kid) B.head.scale.setScalar(1.18);
    // crânio magro: têmporas e bochechas fundas, sombra em volta das órbitas e da boca
    const headCol = (t, a) => {
      const y = -0.13 + t * 0.31, fr = Math.sin(a), sd = Math.abs(Math.cos(a));
      let c = mix3(GGREY, GPALE, 0.55 + 0.45 * Math.max(0, fr));
      if (fr > 0.3 && y > -0.08 && y < -0.01 && sd > 0.25) c = mix3(c, GHOLE, 0.7);   // bochechas fundas
      if (fr > 0.55 && y > -0.01 && y < 0.06) c = mix3(c, GHOLE, 0.6);                // órbitas
      if (fr > 0.75 && y > -0.11 && y < -0.03) c = mix3(c, GHOLE, 0.45);              // boca
      if (sd > 0.8 && y > 0.02 && y < 0.11) c = mix3(c, GGREY, 0.5);                  // têmporas
      return c;
    };
    B.head.add(this.mesh(blob([[-0.13, 0], [-0.124, 0.032], [-0.1, 0.058], [-0.055, 0.07], [0, 0.083], [0.05, 0.091], [0.1, 0.086], [0.14, 0.064], [0.17, 0.03], [0.18, 0]], 10, { sx: 0.84, col: headCol }), body));
    // rosto vazio: órbitas fundas e caídas, boca aberta num lamento
    for (const s of [-1, 1]) {
      const e = this.mesh(disc(0.024, 1.2, 0.01, 6), dark);
      e.position.set(s * 0.033, 0.02, 0.068); e.rotation.set(0, s * 0.4, -s * 0.35);
      B.head.add(e);
    }
    B.mouth = this.mesh(disc(0.017, 2.4, 0.01, 6), dark);
    B.mouth.position.set(0, -0.072, 0.064); B.mouth.rotation.z = 0.12;
    B.head.add(B.mouth);
    // cabelo ralo (colono, criança) ou comprido e solto (mulher); barba rala no colono
    B.hair = joint(B.head, 0, 0.09, -0.02);
    const hairCol = t => mix3(GFOG, GGREY, t);
    if (woman) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + (i / 5 - 0.5) * 2.5;
        const lk = this.mesh(lock(0.5 + Math.random() * 0.15, 0.04, hairCol, 3), body);
        lk.position.set(Math.sin(a) * 0.078, -0.02, Math.cos(a) * 0.072);
        lk.rotation.set(0.2, a, Math.sin(a) * 0.12);
        B.hair.add(lk);
      }
      for (const s of [-1, 1]) {
        const lk = this.mesh(lock(0.5, 0.035, hairCol, 3), body);
        lk.position.set(s * 0.07, -0.03, 0.035); lk.rotation.set(-0.1, s * 1.25, s * 0.1);
        B.hair.add(lk);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4 - 0.5) * 2.6;
        const st = this.mesh(limb(0.13 + Math.random() * 0.1, 0.012, 0.002, 3, hairCol), body);
        st.position.set(Math.sin(a) * 0.06, 0, Math.cos(a) * 0.05);
        st.rotation.set(0.25 + Math.random() * 0.2, 0, Math.sin(a) * 0.3);
        B.hair.add(st);
      }
      if (!kid) {
        const beard = this.mesh(cone(0.13, 0.038, GPALE, GFOG, 5, 0.6), body);
        beard.rotation.x = Math.PI - 0.3; beard.position.set(0, -0.105, 0.045);
        B.head.add(beard);
      }
    }
    // braços compridos em mangas rasgadas, dedos longos
    const sx = woman ? 0.19 : 0.2, sy = top - 0.13;
    const sleeve = () => tatter(blob([[-0.34, 0.07], [-0.2, 0.06], [-0.06, 0.052], [0, 0.046], [0.03, 0]], 6, { col: t => mix3(GFOG, GPALE, t), vRep: 2 }), 6, 0.08);
    B.arms = [-1, 1].map(s => makeArm(this, B.body, s, s * sx, sy, 0, {
      l1: 0.36, l2: 0.37, r0: 0.042, r1: 0.032, r2: 0.022, palm: 0.05, finger: 0.12, n: 4, pn: 4, fingers: 3,
      col: t => mix3(GPALE, GWHITE, 1 - t), mat: body, sleeve: sleeve(), sleeveMat: body,
    }));
    this.spheres = [
      { bone: B.head, off: v3(0, 0.02, 0), r: 0.15, part: 'head' },
      { bone: B.body, off: v3(0, 1.0, 0), r: 0.26, part: 'body' },
      { bone: B.body, off: v3(0, 0.5, 0), r: 0.26, part: 'body' },
    ];
  }

  _set(s) { this.state = s; this.st = 0; }

  // lugar a r0..r1 m do jogador (dentro da arena, fora de água funda)
  _spot(env, r0, r1) {
    const P = env.player.pos, ctx = this.ctx;
    let best = null;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, r = rnd(r0, r1);
      const q = clampXZ(this, P.x + Math.sin(a) * r, P.z + Math.cos(a) * r);
      const y = ctx.groundAt(q.x, q.z, P.y + 0.5);
      if (ctx.isDeepWater(q.x, q.z, y)) continue;
      best = { x: q.x, y, z: q.z };
      if (Math.hypot(q.x - P.x, q.z - P.z) >= r0 * 0.8) break;
    }
    return best || { x: this.pos.x, y: this.pos.y, z: this.pos.z };
  }

  // fantasma escondido (piscou e sumiu) não leva dano
  damage(amount, info = {}) {
    if (this.hidden) return false;
    return super.damage(amount, info);
  }

  // ---------- IA ----------
  think(dt, env) {
    const A = this.audio, C = env.combat, tp = this.toPlayer(env), d = tp.d;
    if (!this.home) this.home = { x: this.pos.x, z: this.pos.z };
    this.litT = Math.max(0, this.litT - dt);
    this.cool = Math.max(0, this.cool - dt);
    this.wailT = Math.max(0, this.wailT - dt);
    const lit = this.litT > 0;
    let tx = null, tz = null, speed = 0;
    // lamentos e sussurros
    this.nextSound -= dt;
    if (this.nextSound <= 0 && this.vis > 0.5) {
      this.nextSound = 4 + Math.random() * 6;
      if (Math.random() < 0.55) { SFX.wail(A, d, this.voice, 1.6 + Math.random() * 1.2); this.wailT = 1.8; }
      else SFX.whisper(A, d);
    }
    switch (this.state) {
      case 'idle': if (env.playerAlive) this._set('wander'); break;
      case 'wander': {
        if (!this.wp || this.wpT <= 0 || Math.hypot(this.wp.x - this.pos.x, this.wp.z - this.pos.z) < 0.4) {
          const a = Math.random() * TAU, r = rnd(1.5, 5);
          this.wp = clampXZ(this, this.home.x + Math.sin(a) * r, this.home.z + Math.cos(a) * r);
          this.wpT = rnd(3, 6);
        }
        this.wpT -= dt;
        tx = this.wp.x; tz = this.wp.z; speed = 0.55;
        if (env.playerAlive && ((d < 18 && this.st > this.wanderT) || d < 7)) this._set('approach');
        break;
      }
      case 'approach': {
        if (!env.playerAlive) { this._set('wander'); break; }
        // vem devagar, em zigue-zague, sem pressa
        const side = Math.sin(this.st * 0.9 + this.P.phase) * Math.min(1, d / 6) * 1.6;
        tx = env.player.pos.x + Math.cos(tp.ang) * side; tz = env.player.pos.z - Math.sin(tp.ang) * side;
        speed = this.speedBase * (lit ? 0.25 : 1);
        if (d < 1.4 && this.cool <= 0 && !lit) { this._set('reach'); SFX.whisper(A, 0); }
        else if (d > 40) { this.home = { x: this.pos.x, z: this.pos.z }; this._set('wander'); }
        break;
      }
      case 'reach': {
        // braços estendidos (o aviso) e o agarrão gelado
        this.face(dt, tp.ang, 6);
        if (d > 0.8) this.step(dt, Math.sin(this.heading) * 0.7, Math.cos(this.heading) * 0.7, false);
        if (lit) { this._set('approach'); this.cool = 1; break; }
        if (this.st >= 0.6) {
          if (d < 2 && env.playerAlive && Math.abs(tp.dy) < 2) {
            if (C.hurt(10, tp.dx / (d || 1), tp.dz / (d || 1), { knock: 2.5 })) this._chill(env);
            this._set('blinkOut');
          } else { this._set('approach'); this.cool = 0.8; }
        }
        break;
      }
      case 'hurt': if (this.st > 0.35) this._set('approach'); break;
      case 'dissolve': if (this.st > 0.8) { this._set('reform'); SND.mist(A, d); } break;
      case 'reform': if (this.st > 0.45) this._set('approach'); break;
      case 'blinkOut': {
        // pisca e some; volta a 6–10 m dali
        if (this.st > 0.55) { this.hidden = true; this.root.visible = false; this._set('gone'); this.goneT = rnd(0.5, 1.1); }
        break;
      }
      case 'gone': {
        if (this.st > this.goneT) {
          const sp = this._spot(env, 6, 10);
          this.pos.set(sp.x, sp.y, sp.z);
          this.heading = Math.atan2(env.player.pos.x - sp.x, env.player.pos.z - sp.z);
          this.hidden = false; this.root.visible = true;
          mist(this, 16, 1.2);
          SND.mist(A, Math.hypot(env.player.pos.x - sp.x, env.player.pos.z - sp.z));
          this._set('blinkIn');
        }
        break;
      }
      case 'blinkIn': {
        if (this.st > 0.8) {
          this.home = { x: this.pos.x, z: this.pos.z }; this.wanderT = rnd(0.8, 2.2);
          this._set(Math.random() < 0.5 ? 'wander' : 'approach');
        }
        break;
      }
    }
    if (tx !== null) this.moveToward(dt, tx, tz, speed, 3);
    else this.speed = lerp(this.speed, 0, Math.min(1, dt * 6));
    keepIn(this);
    // acompanha o chão (sobe degraus devagar)
    this.pos.y = damp(this.pos.y, this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1), 5, dt);
    this._fx(dt);
  }

  // névoa nos fiapos e a luz fria fraca
  _fx(dt) {
    if (!this.root.visible || this.vis < 0.15) return;
    const s = this.scale, lit = this.litT > 0;
    this.mistT -= dt;
    if (this.mistT <= 0) {
      this.mistT = lit ? 0.035 : 0.14;
      const a = Math.random() * TAU;
      if (lit) {
        // queimando na luz: fumaça clara subindo do corpo
        this.effects.spawn({ p: v3(this.pos.x + Math.sin(a) * 0.2 * s, this.pos.y + (0.5 + Math.random() * 1.2) * s, this.pos.z + Math.cos(a) * 0.2 * s), v: v3(Math.sin(a) * 0.4, 1 + Math.random(), Math.cos(a) * 0.4), life: 0.7, s0: 0.09 * s, s1: 0, color: [0.85, 0.92, 1], drag: 1.2 });
      } else {
        this.effects.spawn({ p: v3(this.pos.x + Math.sin(a) * 0.22 * s, this.pos.y + (0.1 + Math.random() * 0.35) * s, this.pos.z + Math.cos(a) * 0.22 * s), v: v3(Math.sin(a) * 0.25, -0.05 + Math.random() * 0.2, Math.cos(a) * 0.25), life: 0.9, s0: 0.05 * s, s1: 0, color: [0.5, 0.6, 0.76], drag: 1 });
      }
    }
    const k = this.vis;
    this.atmo?.light(this.pos.x, this.pos.y + 1.3 * s, this.pos.z, [0.22 * k, 0.3 * k, 0.5 * k], 4, 2);
  }

  // o agarrão: névoa gelada no jogador
  _chill(env) {
    const P = env.player.pos;
    SND.chill(this.audio, 0);
    for (let i = 0; i < 14; i++) this.effects.spawn({ p: v3(P.x + (Math.random() - 0.5) * 0.5, P.y + 0.8 + Math.random() * 0.9, P.z + (Math.random() - 0.5) * 0.5), v: v3((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2), life: 0.8, s0: 0.07, s1: 0, color: [0.8, 0.9, 1], drag: 2 });
  }

  // bala, soco, dardo, fogo: atravessam; ele se desfaz um instante e volta
  onImmune() {
    if (this.dead || ['dissolve', 'blinkOut', 'gone', 'blinkIn'].includes(this.state)) return;
    this._set('dissolve');
    mist(this, 10, 0.8);
    SND.mist(this.audio, distP(this));
  }

  onHurt(dmg, info) {
    if (info.kind === 'light') {
      // a luz queima: se contorce, chia e fica lento
      this.litT = 0.25;
      if (this.clock - this.lastShriek > 1.3) { this.lastShriek = this.clock; SND.shriek(this.audio, distP(this), this.voice); }
      if (this.state === 'reach') { this._set('approach'); this.cool = 1; }
      return;
    }
    // prata, raio, dinamite: recua gemendo
    SFX.wail(this.audio, distP(this), this.voice * 1.4, 0.6);
    if (!['blinkOut', 'gone', 'blinkIn'].includes(this.state)) this._set('hurt');
  }

  onDeath() {
    this.hidden = false; this.root.visible = true;
    SND.shriek(this.audio, distP(this), this.voice * 0.8);
    SFX.wail(this.audio, distP(this), this.voice * 1.2, 1.4);
    mist(this, 18, 1.4, [0.8, 0.88, 1]);
  }

  // ---------- animação ----------
  animate(dt) {
    this.clock += dt;
    const P = this.P, B = this.bones, s = this.state, t = this.clock;
    const lit = this.litT > 0 && !this.dead;
    const k = Math.min(1, dt * 8);
    P.reach = lerp(P.reach, s === 'reach' ? smooth(clamp(this.st / 0.35, 0, 1)) : 0, k);
    P.cover = lerp(P.cover, lit ? 1 : s === 'hurt' ? 0.7 : 0, k);
    P.limp = lerp(P.limp, s === 'dissolve' || s === 'blinkOut' || this.dead ? 1 : 0, k);
    P.lean = lerp(P.lean, clamp(this.speed / 2.4, 0, 1), Math.min(1, dt * 3));
    const shake = lit ? (Math.random() - 0.5) * 0.14 : 0;
    // flutua balançando
    B.body.position.y = HOVER + Math.sin(t * 1.4 + P.phase) * 0.06 - P.limp * 0.08;
    B.body.rotation.x = 0.2 * P.lean + 0.15 * P.reach - 0.22 * P.cover + shake;
    B.body.rotation.z = Math.sin(t * 0.8 + P.phase) * 0.05 + shake * 0.5;
    // cabeça torta, olhando de baixo; jogada para trás quando a luz queima
    B.head.rotation.z = Math.sin(t * 0.45 + P.phase) * 0.18 + 0.1;
    B.head.rotation.x = 0.18 - 0.28 * P.reach - 0.55 * P.cover + P.limp * 0.4 + shake;
    B.head.rotation.y = Math.sin(t * 0.3 + P.phase) * 0.2;
    const open = Math.max(this.wailT > 0 ? 0.6 : 0, P.reach, P.cover);
    B.mouth.scale.set(1, 0.8 + open * 0.9, 1);
    // braços: soltos / estendidos (aviso) / cobrindo o rosto (luz) / caídos (desfeito)
    for (const L of B.arms) {
      const sw = Math.sin(t * 1.1 + L.side * 1.3 + P.phase) * 0.08;
      let shX = -0.22 + sw + 0.3 * P.lean, shZ = L.side * 0.14, elX = -0.5, hX = 0.1;
      shX = lerp(shX, -1.5 + sw * 0.5, P.reach); shZ = lerp(shZ, -L.side * 0.08, P.reach); elX = lerp(elX, -0.08, P.reach); hX = lerp(hX, -0.3, P.reach);
      shX = lerp(shX, -2.1 + shake * 2, P.cover); shZ = lerp(shZ, L.side * 0.35, P.cover); elX = lerp(elX, -1.9, P.cover); hX = lerp(hX, 0.4, P.cover);
      shX = lerp(shX, 0.05, P.limp); shZ = lerp(shZ, L.side * 0.04, P.limp); elX = lerp(elX, -0.05, P.limp);
      L.sh.rotation.set(shX, 0, shZ); L.el.rotation.x = elX; L.hand.rotation.x = hX;
    }
    waveHem(this.robe, t, 0.03 + P.lean * 0.03, -P.lean * 0.12);
    B.hair.rotation.x = Math.sin(t * 1.6 + P.phase) * 0.12 + P.lean * 0.35 + P.cover * 0.3;
    // visibilidade: desfeito, piscando, sumido, voltando, queimando na luz
    if (!this.dead) {
      let vis = 1;
      if (s === 'dissolve') vis = lerp(1, 0.07, clamp(this.st / 0.15, 0, 1));
      else if (s === 'reform') vis = lerp(0.07, 1, smooth(clamp(this.st / 0.45, 0, 1)));
      else if (s === 'blinkOut') vis = (Math.floor(this.st * 16) % 2 ? 0.1 : 1) * (1 - this.st / 0.6);
      else if (s === 'gone') vis = 0;
      else if (s === 'blinkIn') vis = smooth(clamp(this.st / 0.7, 0, 1)) * (Math.floor(this.st * 14) % 3 === 0 ? 0.5 : 1);
      if (lit) vis *= 0.55 + Math.random() * 0.55;
      this.vis = vis;
      for (const m of this.mats) m.uniforms.uOpacity.value = m.userData.op * Math.min(1, vis);
    }
    const b = this.mats[0];
    this.darkMat.uniforms.uOpacity.value = this.darkMat.userData.op * (b.uniforms.uOpacity.value / b.userData.op);
  }

  dispose() { super.dispose(); this.darkMat.dispose(); }
}

// =====================================================================
// Lúcia, a moça da fábrica
// =====================================================================
const L_HOVER = 0.1;
const SKIN = [0.92, 0.94, 0.98], HAIR = [0.11, 0.1, 0.12], GOLD = new THREE.Color(1, 0.86, 0.55);

export class LuciaGhost extends Creature {
  // o: { color, scale, opacity, hidden: true (começa escondida; use appear) }
  constructor(deps, o = {}) {
    super(deps, { name: 'LÚCIA', hp: 999, radius: 0.3, height: 1.7, death: 'fade', ...o });
    this.untargetable = true;   // tiros e golpes atravessam
    this.ghost = true; this.friendly = true;
    this.op = o.opacity ?? 0.68;
    this.color = o.color ?? 0xe2ecff;
    this.scale = o.scale ?? 1;
    this.baseScale = this.scale;
    this.build();
    this.root.scale.setScalar(this.scale);
    this.P = { cry: 0, point: 0, free: 0, look: 0, phase: Math.random() * TAU };
    this.vis = 1; this.clock = 0; this.lift = 0; this.fadeT = 9; this.lookYaw = 0; this.sobbing = 0;
    this.state = o.hidden ? 'hidden' : 'idle';
    this.freedDone = false; this.arrived = true;
    this.sobT = 0; this.mistT = 0; this.pointAng = 0; this.pointDur = 0;
  }

  build() {
    const mk = (map, op = this.op) => this.mat({ map, color: this.color, lit: false, transparent: true, opacity: op, depthWrite: false });
    const dress = mk(dressTex()), face = mk(faceTex()), skin = mk(null), hair = mk(clothTex()), legs = mk(null, this.op * 0.4);
    for (const m of this.mats) { m.userData.op = m.uniforms.uOpacity.value; m.userData.col = m.uniforms.uColor.value.clone(); m.userData.emissive = m.uniforms.uEmissive.value.clone(); }
    const B = this.bones = {};
    B.body = joint(this.root, 0, L_HOVER, 0);
    // vestido até a canela, barra chamuscada; frente um pouco mais clara
    const shade = (t, a) => { const k = 0.84 + 0.16 * Math.max(0, Math.sin(a)); return [k, k, k]; };
    this.dress = tatter(blob([[0.42, 0.235], [0.55, 0.225], [0.7, 0.205], [0.85, 0.185], [0.95, 0.168], [1.0, 0.155], [1.08, 0.16], [1.17, 0.172], [1.25, 0.165], [1.31, 0.14], [1.36, 0.08], [1.39, 0.05]], 16, { sz: 0.72, col: shade }), 16, 0.05);
    B.body.add(this.mesh(this.dress, dress));
    // pernas descalças sumindo em névoa
    for (const s of [-1, 1]) {
      const hip = joint(B.body, s * 0.065, 0.56, 0);
      hip.add(this.mesh(limb(0.44, 0.042, 0.03, 5, t => mix3([0.6, 0.66, 0.78], SKIN, t)), legs));
      const foot = this.mesh(blob([[-0.03, 0], [-0.02, 0.028], [0.06, 0.026], [0.09, 0]], 5, { sz: 0.6, col: () => [0.62, 0.68, 0.8] }), legs);
      foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.44, 0.0);
      hip.add(foot);
      hip.rotation.set(0.04, 0, s * 0.03);
    }
    // pescoço e cabeça
    B.neck = joint(B.body, 0, 1.36, 0);
    B.neck.add(this.mesh(blob([[-0.03, 0.045], [0.06, 0.038], [0.13, 0.04]], 8, { col: () => SKIN }), skin));
    B.head = joint(B.neck, 0, 0.14, 0.012);
    B.head.add(this.mesh(blob([[-0.115, 0], [-0.11, 0.03], [-0.088, 0.056], [-0.05, 0.07], [-0.01, 0.078], [0.03, 0.083], [0.07, 0.084], [0.105, 0.077], [0.135, 0.058], [0.155, 0.032], [0.165, 0]], 14, { sx: 0.87, col: (t, a) => { const k = 0.9 + 0.1 * Math.max(0, Math.sin(a)); return [k, k, k]; } }), face));
    const nose = this.mesh(cone(0.022, 0.011, SKIN, SKIN, 4), skin);
    nose.rotation.x = Math.PI / 2 + 0.25; nose.position.set(0, -0.012, 0.074);
    B.head.add(nose);
    // cabelo comprido, escuro e solto; mechas caindo no rosto
    B.hair = joint(B.head, 0, 0.04, -0.01);
    const cap = this.mesh(blob([[0, 0.091], [0.04, 0.092], [0.08, 0.088], [0.112, 0.077], [0.138, 0.058], [0.156, 0.03], [0.163, 0]], 10, { sx: 0.9, col: () => HAIR }), hair);
    cap.rotation.x = -0.3; cap.position.set(0, -0.032, -0.008);
    B.hair.add(cap);
    B.locks = [];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6 - 0.5) * 2.9;
      const lk = this.mesh(lock(0.48 + Math.random() * 0.14, 0.04, () => HAIR), hair);
      lk.position.set(Math.sin(a) * 0.085, -0.02, Math.cos(a) * 0.08);
      lk.rotation.set(0.18, a, Math.sin(a) * 0.1);
      B.hair.add(lk); B.locks.push(lk);
    }
    for (const [x, z, L, ry, rz] of [[-0.078, 0.035, 0.42, -1.25, -0.05], [0.078, 0.035, 0.4, 1.25, 0.05], [-0.04, 0.086, 0.2, -0.25, -0.12]]) {
      const lk = this.mesh(lock(L, x < -0.05 || x > 0.05 ? 0.034 : 0.022, () => HAIR), hair);
      lk.position.set(x, 0.0, z); lk.rotation.set(-0.08, ry, rz);
      B.hair.add(lk); B.locks.push(lk);
    }
    // braços finos, mangas curtas do vestido
    B.arms = [-1, 1].map(s => makeArm(this, B.body, s, s * 0.17, 1.29, 0, {
      l1: 0.27, l2: 0.25, r0: 0.034, r1: 0.028, r2: 0.021, palm: 0.04, finger: 0.07, n: 6,
      col: () => SKIN, mat: skin, sleeve: blob([[-0.12, 0.044], [-0.04, 0.046], [0, 0.042], [0.03, 0]], 8, { col: shade }), sleeveMat: dress,
    }));
    depthPrepass(this.root);
    this.spheres = [{ bone: B.head, off: v3(0, 0.02, 0), r: 0.14, part: 'head' }, { bone: B.body, off: v3(0, 1.0, 0), r: 0.25, part: 'body' }];
  }

  _set(s) { this.state = s; this.st = 0; }

  // ---------- comandos da campanha ----------
  place(x, z, heading = 0, y = null) {
    super.place(x, z, heading, y);
    if (this.state === 'hidden' || this.state === 'gone') this.root.visible = false;
    return this;
  }
  // aparece com névoa (fade-in); sem argumentos, aparece onde está
  appear(x, z, heading) {
    this._set('appear');
    if (x !== undefined) super.place(x, z, heading ?? this.heading);
    this.root.visible = true; this.vis = 0; this.lift = 0; this.fadeT = 0;
    mist(this, 18, 1.1);
    SND.mist(this.audio, distP(this));
    return this;
  }
  // some em névoa (fica escondida; pode aparecer de novo)
  vanish() {
    if (['hidden', 'gone', 'vanish', 'free'].includes(this.state)) return this;
    this._set('vanish');
    mist(this, 14, 1);
    SND.mist(this.audio, distP(this));
    return this;
  }
  // flutua até (x, z) e para; this.arrived = true ao chegar
  glideTo(x, z, speed = 1.2) { this.target = { x, z }; this.glideSpeed = speed; this.arrived = false; this._set('glide'); return this; }
  // estende o braço apontando a direção ang (mesma convenção de heading: atan2(dx, dz));
  // dur > 0 volta a ficar parada depois de dur s
  point(ang, dur = 0) { this.pointAng = ang; this.pointDur = dur; this._set('point'); return this; }
  pointAt(x, z, dur = 0) { return this.point(Math.atan2(x - this.pos.x, z - this.pos.z), dur); }
  // cabisbaixa, mãos no rosto, soluçando
  cry() { this._set('cry'); this.sobT = 0.4; return this; }
  idle() { this._set('idle'); return this; }
  // libertação (~5 s): ergue a cabeça, sobe envolta em luz dourada e some; freedDone = true
  free() {
    if (this.state === 'free' || this.freedDone) return this;
    this.root.visible = true;
    this._set('free');
    SND.release(this.audio);
    return this;
  }

  damage() { return false; }   // não é hostil: nada a fere
  die() {}                     // nem "mata todos" a leva; ela sai com vanish() ou free()
  pushPlayer() {}

  // ---------- quadro a quadro ----------
  think(dt, env) {
    const Pl = env?.player || this.player, A = this.audio;
    const dP = Pl ? Math.hypot(Pl.pos.x - this.pos.x, Pl.pos.z - this.pos.z) : 99;
    this.sobbing = Math.max(0, this.sobbing - dt);
    switch (this.state) {
      case 'hidden': case 'gone': return;
      case 'appear': if (this.st > 1.5) this._set('idle'); break;
      case 'glide': {
        const left = this.moveToward(dt, this.target.x, this.target.z, this.glideSpeed, 3, false);
        if (left < 0.12) { this.arrived = true; this._set('idle'); }
        break;
      }
      case 'point': this.face(dt, this.pointAng, 3); if (this.pointDur > 0 && this.st > this.pointDur) this._set('idle'); break;
      case 'cry': {
        this.sobT -= dt;
        if (this.sobT <= 0) { this.sobT = rnd(2.2, 3.8); SFX.sob(A, dP); this.sobbing = 1; }
        break;
      }
      case 'vanish': if (this.st > 1.3) { this.root.visible = false; this._set('gone'); return; } break;
      case 'free': this._free(dt); break;
    }
    if (this.state !== 'glide') this.speed = lerp(this.speed, 0, Math.min(1, dt * 5));
    // de perto, vira a cabeça para o jogador
    let look = 0;
    if (Pl && dP < 7 && (this.state === 'idle' || this.state === 'glide' || this.state === 'appear')) {
      look = clamp(wrapA(Math.atan2(Pl.pos.x - this.pos.x, Pl.pos.z - this.pos.z) - this.heading), -0.9, 0.9);
    }
    this.lookYaw = look;
    if (this.state !== 'free') this.pos.y = damp(this.pos.y, this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1), 5, dt);
    // névoa nos pés e o brilho frio
    if (this.root.visible && this.vis > 0.2 && this.state !== 'free') {
      this.mistT -= dt;
      if (this.mistT <= 0) {
        this.mistT = 0.09;
        const a = Math.random() * TAU, s = this.scale;
        this.effects.spawn({ p: v3(this.pos.x + Math.sin(a) * 0.14 * s, this.pos.y + (0.02 + Math.random() * 0.2) * s, this.pos.z + Math.cos(a) * 0.14 * s), v: v3(Math.sin(a) * 0.2, 0.05 + Math.random() * 0.15, Math.cos(a) * 0.2), life: 1.1, s0: 0.06 * s, s1: 0, color: [0.55, 0.64, 0.8], drag: 1 });
      }
      const k = this.vis;
      this.atmo?.light(this.pos.x, this.pos.y + 1.3 * this.scale, this.pos.z, [0.3 * k, 0.38 * k, 0.56 * k], 4.5, 3);
    }
  }

  // a cena da libertação
  _free(dt) {
    const t = this.st, s = this.scale;
    this.lift = smooth(clamp((t - 0.9) / 4, 0, 1)) * 2.6;
    const g = clamp(t / 1.5, 0, 1) * (1 - smooth(clamp((t - 4.2) / 0.8, 0, 1)));
    // partículas douradas subindo em volta
    if (Math.random() < dt * 30) {
      const a = Math.random() * TAU, r = (0.2 + Math.random() * 0.4) * s;
      this.effects.spawn({ p: v3(this.pos.x + Math.sin(a) * r, this.pos.y + this.lift + Math.random() * 1.6 * s, this.pos.z + Math.cos(a) * r), v: v3(Math.sin(a) * 0.15, 0.8 + Math.random() * 0.9, Math.cos(a) * 0.15), life: 1.2 + Math.random() * 0.6, s0: 0.05 * s, s1: 0, color: Math.random() < 0.5 ? [1, 0.88, 0.55] : [1, 0.97, 0.85], drag: 0.6 });
    }
    this.atmo?.light(this.pos.x, this.pos.y + this.lift + 1.2 * s, this.pos.z, [1.4 * g, 1.15 * g, 0.65 * g], lerp(3, 7.5, g), 6);
    if (t > 5) {
      this.freedDone = true;
      this.root.visible = false;
      this.state = 'gone';
      this.removed = true;   // a campanha (ou o combate) pode descartar
    }
  }

  // ---------- animação ----------
  animate(dt) {
    this.clock += dt;
    const P = this.P, B = this.bones, s = this.state, t = this.clock, k = Math.min(1, dt * 4);
    P.cry = lerp(P.cry, s === 'cry' ? 1 : 0, k);
    P.point = lerp(P.point, s === 'point' ? 1 : 0, k);
    P.free = lerp(P.free, s === 'free' ? 1 : 0, Math.min(1, dt * 2));
    P.look = lerp(P.look, this.lookYaw, Math.min(1, dt * 2.5));
    const sob = this.sobbing * Math.sin(t * 11) * (s === 'cry' ? 1 : 0);
    // flutua de leve; na libertação, sobe
    B.body.position.y = L_HOVER + Math.sin(t * 1.2 + P.phase) * 0.025 + this.lift / this.scale + Math.abs(sob) * 0.012;
    B.body.rotation.z = Math.sin(t * 0.7 + P.phase) * 0.025;
    B.body.rotation.x = 0.03 + P.cry * 0.12 - P.free * 0.1;
    // cabeça baixa (triste); enterrada nas mãos no choro; olhando para cima, liberta
    B.head.rotation.x = lerp(lerp(0.24, 0.55, P.cry), -0.5, P.free) + sob * 0.05;
    B.head.rotation.y = P.look * (1 - P.cry) * (1 - P.free) + P.point * 0.3 * 0;
    B.head.rotation.z = (0.09 + Math.sin(t * 0.4 + P.phase) * 0.03) * (1 - P.free);
    B.neck.rotation.x = 0.06 + P.cry * 0.15 - P.free * 0.15;
    // braços
    for (const L of B.arms) {
      const sw = Math.sin(t * 0.9 + L.side * 1.7 + P.phase) * 0.03;
      let shX = 0.04 + sw, shZ = L.side * 0.07, shY = 0, elX = -0.18, hX = 0.05;
      // chorando: mãos no rosto
      shX = lerp(shX, -1.14 + sob * 0.04, P.cry); shY = lerp(shY, -L.side * 0.6, P.cry); shZ = lerp(shZ, L.side * 0.04, P.cry); elX = lerp(elX, -2.25, P.cry); hX = lerp(hX, 0.15, P.cry);
      // apontando: braço direito estendido, o outro junto ao peito
      if (L.side < 0) { shX = lerp(shX, -1.42, P.point); shZ = lerp(shZ, 0.06, P.point); elX = lerp(elX, -0.05, P.point); hX = lerp(hX, -0.15, P.point); }
      else { shX = lerp(shX, 0.52, P.point); shY = lerp(shY, -0.79, P.point); shZ = lerp(shZ, 0.66, P.point); elX = lerp(elX, -2.22, P.point); }
      // liberta: braços abrindo, palmas para fora
      shX = lerp(shX, -0.3, P.free); shZ = lerp(shZ, L.side * 0.6, P.free); elX = lerp(elX, -0.25, P.free); shY = lerp(shY, -L.side * 0.4, P.free);
      L.sh.rotation.set(shX, shY, shZ); L.el.rotation.x = elX; L.hand.rotation.x = hX;
    }
    // cabelo e barra mexendo
    B.hair.rotation.x = Math.sin(t * 0.9 + P.phase) * 0.04 + P.free * 0.25;
    B.locks.forEach((lk, i) => { lk.rotation.z = (lk.userData.rz ??= lk.rotation.z) + Math.sin(t * 1.3 + i * 0.9) * 0.05; });
    waveHem(this.dress, t, 0.012 + P.free * 0.02, 0);
    // visibilidade e brilho dourado (o surgir conta à parte: appear() + cry() no mesmo quadro)
    this.fadeT += dt;
    let vis = smooth(clamp(this.fadeT / 1.4, 0, 1));
    if (s === 'vanish') vis *= 1 - smooth(clamp(this.st / 1.2, 0, 1));
    else if (s === 'free') vis *= 1 - smooth(clamp((this.st - 3.9) / 1.1, 0, 1));
    else if (s === 'hidden' || s === 'gone') vis = 0;
    vis *= 0.95 + 0.05 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    this.vis = vis;
    const g = P.free * clamp(this.st / 2, 0, 1);
    for (const m of this.mats) {
      m.uniforms.uOpacity.value = m.userData.op * vis * (1 + g * 0.25);
      m.uniforms.uColor.value.copy(m.userData.col).lerp(GOLD, g * 0.75);
      m.userData.emissive.setRGB(0.28 * g, 0.22 * g, 0.1 * g);
      if (this.flashT <= 0) m.uniforms.uEmissive.value.copy(m.userData.emissive);
    }
  }
}

// =====================================================================
// O Capataz (chefe)
// =====================================================================
const C_SUIT = [1, 1, 1], C_CH = [1, 1, 1];
// sombreado simples (frente mais clara) multiplicando a textura
const shadeK = k => (t, a) => { const v = k * (0.78 + 0.22 * Math.max(0, Math.sin(a))); return [v, v, v]; };

// objetos da fábrica que ele arremessa (fôrma de sapato, engrenagem, pedaço de máquina)
let JUNK = null;
function junk() {
  if (JUNK) return JUNK;
  const wood = ps1Material({ map: clothTex(), color: 0xffffff, lit: false });
  const iron = ps1Material({ map: null, color: 0xffffff, lit: false });
  const last = blob([[-0.13, 0], [-0.12, 0.04], [-0.05, 0.056], [0.04, 0.05], [0.1, 0.042], [0.13, 0]], 7, { sx: 0.62, sz: 0.55, col: t => mix3([0.42, 0.28, 0.16], [0.55, 0.38, 0.22], t) });
  last.rotateX(Math.PI / 2);
  const gear = blob([[-0.022, 0], [-0.022, 0.11], [0.022, 0.11], [0.022, 0]], 24, { off: (y, a) => { const b = Math.cos(a * 8) > 0 && Math.abs(y) > 0.001 ? 0.03 : 0; return [Math.cos(a) * b, Math.sin(a) * b]; }, col: (t, a) => (Math.sin(a * 3) > 0.6 ? [0.42, 0.28, 0.18] : [0.42, 0.42, 0.45]) });
  gear.rotateX(Math.PI / 2);
  const bar = ensureColor(new THREE.BoxGeometry(0.34, 0.08, 0.08), [0.4, 0.27, 0.17]);
  for (const g of [last, gear, bar]) g.userData.shared = true;
  return (JUNK = [{ g: last, m: wood, col: [0.45, 0.3, 0.18] }, { g: gear, m: iron, col: [0.45, 0.45, 0.48] }, { g: bar, m: iron, col: [0.42, 0.3, 0.2] }]);
}

export class Capataz extends Creature {
  // o: { arena: {x, z, r}, scale (1,3), hp (30), state: 'stalk' | 'intro' (surge da fumaça) }
  // callbacks opcionais: onScream() (o grito: piscar as luzes), onDefeated() (sumiu de vez)
  constructor(deps, o = {}) {
    super(deps, {
      name: 'CAPATAZ', hp: o.hp ?? 30, radius: 0.55, height: 2.3, blood: [1, 0.45, 0.1], death: 'custom',
      resist: { bullet: 1, melee: 1, silver: 1.2, ray: 1, explosion: 1, dart: 0, fire: 0, light: 1 }, ...o,
    });
    this.bossName = o.bossName || 'O CAPATAZ';
    this.shielded = true; this.heavy = true; this.ghost = true;
    this.bloodGrav = -1.5; this.burstColor = [1, 0.45, 0.1]; this.immuneColor = [1, 0.55, 0.2];
    this.scale = o.scale ?? 1.3; this.baseScale = this.scale;
    this.arena = o.arena || null;
    this.op = o.opacity ?? 0.82;
    this.build();
    this.root.scale.setScalar(this.scale);
    this.P = { walk: 0, phase: 0, thr: 0, rel: 0, up: 0, down: 0, guard: 0, scream: 0, kneel: 0, sink: 0, flinch: 0, heat: 0 };
    this.state = o.state || 'intro';
    if (this.state === 'intro') this.P.sink = 1;
    this.atkT = 2.5; this.screamCd = 5; this.windT = 0.6;
    this.litLog = []; this.exposure = 0; this.litNow = 0; this._lit = false;
    this.vis = 1; this.clock = 0; this.smokeT = 0; this.emberT = 0; this.groanT = rnd(3, 6); this.sizzleT = 0;
    this.thrown = []; this.held = null; this.volley = 0; this.hidden = false;
    this.lastStep = 0; this.lastGrunt = -9;
  }

  build() {
    const mk = (map, o = {}) => this.mat({ map, color: 0xffffff, lit: false, transparent: true, opacity: this.op, depthWrite: false, ...o });
    const suit = mk(suitTex()), char = mk(charTex()), cloth = mk(clothTex()), scorch = mk(burntTex());
    const glow = mk(null, { color: 0xff6a14, fog: false, opacity: 1 });
    const metal = mk(null, { opacity: Math.min(1, this.op + 0.1) });
    for (const m of this.mats) { m.userData.op = m.uniforms.uOpacity.value; m.userData.col = m.uniforms.uColor.value.clone(); }
    this.charMat = char; this.glowMat = glow; this.suitMat = suit;
    const B = this.bones = {};
    B.hips = joint(this.root, 0, 0.95, 0);
    B.torso = joint(B.hips, 0, 0, 0);
    // tronco: barriga grande, ombros largos; terno com colete (textura)
    B.torso.add(this.mesh(blob([[-0.27, 0], [-0.26, 0.2], [-0.15, 0.215], [-0.02, 0.225], [0.1, 0.25], [0.22, 0.26], [0.34, 0.255], [0.44, 0.25], [0.52, 0.235], [0.58, 0.18], [0.62, 0.11], [0.66, 0.07]], 16, { sx: 1.15, sz: 0.82, col: (t, a) => { const k = 0.8 + 0.2 * Math.max(0, Math.sin(a)); return [k * C_SUIT[0], k * C_SUIT[1], k * C_SUIT[2]]; } }), suit));
    // botões de latão do colete
    // pescoço e cabeça carbonizados
    B.neck = joint(B.torso, 0, 0.62, 0.02);
    B.neck.add(this.mesh(blob([[-0.04, 0.09], [0.08, 0.08], [0.14, 0.085]], 8, { col: () => C_CH, uRep: 2 }), char));
    B.head = joint(B.neck, 0, 0.17, 0.02);
    B.head.add(this.mesh(blob([[-0.14, 0], [-0.135, 0.05], [-0.11, 0.09], [-0.06, 0.105], [0, 0.11], [0.05, 0.112], [0.1, 0.1], [0.14, 0.07], [0.165, 0.03], [0.17, 0]], 12, { sx: 0.95, col: () => C_CH, uRep: 2 }), char));
    const nose = this.mesh(cone(0.04, 0.022, [0.5, 0.4, 0.35], [0.3, 0.25, 0.2], 4), char);
    nose.rotation.x = Math.PI / 2 + 0.3; nose.position.set(0, -0.015, 0.1);
    B.head.add(nose);
    // olhos de brasa e a boca rachada em brasa
    B.eyes = [];
    for (const s of [-1, 1]) {
      const e = this.mesh(disc(0.015, 0.65, 0.008), glow);
      e.position.set(s * 0.042, 0.022, 0.098); e.rotation.y = s * 0.3; e.userData.noPre = true;
      B.head.add(e); B.eyes.push(e);
      // bigode
      const m = this.mesh(cone(0.07, 0.016, [0.08, 0.06, 0.05], [0.12, 0.1, 0.08], 4, 0.5), cloth);
      m.position.set(s * 0.012, -0.045, 0.103); m.rotation.set(0, 0, s * 1.9);
      B.head.add(m);
    }
    B.mouth = this.mesh(disc(0.026, 0.2, 0.008), glow);
    B.mouth.position.set(0, -0.075, 0.095); B.mouth.userData.noPre = true;
    B.head.add(B.mouth);
    // chapéu (aba e copa com fita), furado de queimadura
    B.hat = joint(B.head, 0, 0.105, -0.005);
    B.hat.rotation.x = 0.1;
    B.hat.add(this.mesh(blob([[0, 0], [0, 0.205], [0.012, 0.2], [0.014, 0]], 14, { sz: 1.1, col: shadeK(0.85) }), scorch));
    B.hat.add(this.mesh(blob([[0.008, 0.125], [0.03, 0.124], [0.034, 0.123], [0.075, 0.118], [0.11, 0.104], [0.125, 0.07], [0.13, 0]], 12, { sz: 1.12, col: (t, a) => (t < 0.25 ? [0.35, 0.35, 0.35] : shadeK(0.85)(t, a)) }), scorch));
    // pernas (calça) e sapatos
    B.legs = [];
    for (const s of [-1, 1]) {
      const hip = joint(B.hips, s * 0.12, -0.08, 0);
      hip.add(this.mesh(limb(0.45, 0.105, 0.08, 6, shadeK(1)), scorch));
      const knee = joint(hip, 0, -0.45, 0);
      knee.add(this.mesh(limb(0.43, 0.08, 0.065, 6, shadeK(1)), scorch));
      const shoe = blob([[-0.06, 0], [-0.055, 0.05], [0.05, 0.055], [0.14, 0.045], [0.17, 0]], 6, { sz: 0.7, col: () => [0.12, 0.1, 0.09] });
      shoe.rotateX(Math.PI / 2); shoe.translate(0, -0.45, 0.04);
      knee.add(this.mesh(shoe, cloth));
      B.legs.push({ hip, knee, side: s });
    }
    // braços grossos, mãos grandes carbonizadas
    B.arms = [-1, 1].map(s => makeArm(this, B.torso, s, s * 0.3, 0.5, 0, {
      l1: 0.33, l2: 0.31, r0: 0.09, r1: 0.075, r2: 0.06, palm: 0.075, finger: 0.09, n: 6,
      col: shadeK(1), mat: scorch, handCol: () => C_CH, handMat: char,
    }));
    // molho de chaves na cintura (lado esquerdo)
    B.keys = joint(B.torso, 0.19, -0.06, 0.15);
    B.keys.rotation.y = 0.75;
    const ring = ensureColor(new THREE.TorusGeometry(0.045, 0.007, 3, 10), [0.3, 0.25, 0.18]);
    B.keys.add(this.mesh(ring, metal));
    B.keyList = [];
    for (let i = 0; i < 5; i++) {
      const kj = joint(B.keys, (i - 2) * 0.016, -0.04, 0.004);
      const key = this.mesh(blob([[-0.075, 0], [-0.07, 0.009], [-0.02, 0.006], [0, 0.007], [0.008, 0.016], [0.022, 0.014], [0.026, 0]], 4, { sz: 0.35, col: t => mix3([0.26, 0.2, 0.12], [0.36, 0.3, 0.18], t) }), metal);
      key.rotation.z = Math.PI;
      key.position.y = 0.02;
      kj.add(key); kj.rotation.z = (i - 2) * 0.18;
      B.keyList.push(kj);
    }
    // corrente com cadeado na mão direita (com ela trancou as portas)
    B.chain = [];
    let parent = B.arms[0].hand;
    for (let i = 0; i < 8; i++) {
      const j = joint(parent, 0, i === 0 ? -0.09 : -0.07, i === 0 ? 0.03 : 0);
      const lk = ensureColor(new THREE.TorusGeometry(0.03, 0.009, 3, 6), [0.2, 0.18, 0.16]);
      lk.scale(1, 1.45, 1);
      const m = this.mesh(lk, metal);
      m.rotation.y = i % 2 ? Math.PI / 2 : 0; m.position.y = -0.03;
      j.add(m); B.chain.push(j); parent = j;
    }
    const lockBody = ensureColor(new THREE.BoxGeometry(0.07, 0.08, 0.035), [0.26, 0.21, 0.13]);
    const lockM = this.mesh(lockBody, metal); lockM.position.y = -0.09;
    parent.add(lockM);
    depthPrepass(this.root);
    this.spheres = [
      { bone: B.head, off: v3(0, 0.02, 0.01), r: 0.16, part: 'head' },
      { bone: B.torso, off: v3(0, 0.36, 0), r: 0.3, part: 'body' },
      { bone: B.torso, off: v3(0, 0.02, 0), r: 0.28, part: 'body' },
      { bone: B.hips, off: v3(0, -0.5, 0), r: 0.22, part: 'body' },
    ];
  }

  _set(s) { this.state = s; this.st = 0; this.screamed = false; this.swung = false; }
  _toStalk() { this._set('stalk'); this.atkT = rnd(1.2, 2.6); }

  // escondido na fumaça não leva dano; a luz, com o escudo, só expõe (fere pouco)
  damage(amount, info = {}) {
    if (this.hidden || this.state === 'gone') return false;
    if (info.kind === 'light' && this.shielded) { this._lit = true; amount *= 0.12; }
    return super.damage(amount, info);
  }

  // ---------- IA ----------
  think(dt, env) {
    const C = env.combat, A = this.audio, tp = this.toPlayer(env), d = tp.d, P = env.player.pos;
    if (!this.engaged) { this.engaged = true; if (!C.boss) C.boss = this; }
    // luz do lampião: exposição acumulada nos últimos 6 s
    if (this._lit) { this.litLog.push([this.clock, dt]); this.litNow = 0.2; this._lit = false; }
    while (this.litLog.length && this.litLog[0][0] < this.clock - 6) this.litLog.shift();
    let ex = 0; for (const e of this.litLog) ex += e[1];
    this.exposure = ex;
    this.litNow = Math.max(0, this.litNow - dt);
    const lit = this.litNow > 0 && this.shielded;
    if (lit) { this.sizzleT -= dt; if (this.sizzleT <= 0) { this.sizzleT = 0.45; SND.sizzle(A, d); } }
    if (this.shielded && this.exposure >= 2.5 && !['stagger', 'rise', 'vanish', 'gone', 'appear', 'intro'].includes(this.state)) this._stagger(C, d);
    this.screamCd -= dt; this.atkT -= dt;
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = rnd(5, 9); SND.groan(A, d); }
    let tx = null, tz = null, speed = 0, turn = 5;
    switch (this.state) {
      case 'intro': {
        // surge da fumaça
        this.face(dt, tp.ang, 3);
        if (this.st < 1.4 && Math.random() < 0.5) this._smoke(2);
        if (this.st > 1.6) this._set('scream');
        break;
      }
      case 'idle': if (env.playerAlive) this._toStalk(); break;
      case 'stalk': {
        if (!env.playerAlive) { this._set('idle'); break; }
        if (lit) {
          // luz na cara: recua protegendo o rosto
          this.face(dt, tp.ang, 4);
          this.step(dt, -Math.sin(tp.ang) * 0.6, -Math.cos(tp.ang) * 0.6, false);
        } else if (d > 4) { tx = P.x; tz = P.z; speed = 1.5; }
        else this.face(dt, tp.ang, 4);
        if (this.atkT <= 0 && !lit) this._attack(d);
        break;
      }
      case 'throwWind': {
        this.face(dt, tp.ang, 5);
        this._lift();
        if (this.st >= 0.8) { this._throw(env); this._set('throwEnd'); }
        break;
      }
      case 'throwEnd': {
        if (this.st > 0.45) {
          if (--this.volley > 0) { this._grab(); this._set('throwWind'); } else this._toStalk();
        }
        break;
      }
      case 'charge': {
        tx = P.x; tz = P.z; speed = lit ? 2 : 4.4; turn = 2.5;
        if (d < 2.3) { this.windT = 0.6; this._set('swingWind'); SND.chain(A, d); }
        else if (this.st > 2.4) this._toStalk();
        break;
      }
      case 'swingWind': this.face(dt, tp.ang, 6); if (this.st >= this.windT) this._set('swing'); break;
      case 'swing': {
        // golpe com a corrente e as chaves
        if (!this.swung && this.st > 0.08) {
          this.swung = true;
          SFX.whoosh(A, d);
          if (this.strike(env, 16, 2, 0.25, 7)) { SND.chain(A, 0); C.shake = Math.max(C.shake, 0.35); }
        }
        const f = Math.max(0, 1 - this.st / 0.35) * 1.4;
        this.step(dt, Math.sin(this.heading) * f, Math.cos(this.heading) * f, false);
        if (this.st > 0.4) this._set('recover');
        break;
      }
      case 'recover': if (this.st > 0.7) this._toStalk(); break;
      case 'vanish': {
        if (Math.random() < 0.6) this._smoke(1);
        if (this.st > 0.8) { this.hidden = true; this.root.visible = false; this._set('gone'); }
        break;
      }
      case 'gone': {
        // reaparece atrás do jogador
        if (this.st > 0.7) {
          const h = env.player.heading, q = clampXZ(this, P.x - Math.sin(h) * 2.6, P.z - Math.cos(h) * 2.6);
          this.pos.set(q.x, this.ctx.groundAt(q.x, q.z, P.y + 0.5), q.z);
          this.heading = Math.atan2(P.x - q.x, P.z - q.z);
          this.hidden = false; this.root.visible = true;
          this._smoke(26, true);
          SND.smoke(A, 2.6);
          this._set('appear');
        }
        break;
      }
      case 'appear': {
        this.face(dt, tp.ang, 6);
        if (this.st > 0.5) { this.windT = 0.8; this._set('swingWind'); SND.keys(A, d); SND.groan(A, d); }
        break;
      }
      case 'scream': {
        // o grito: luzes piscam, chão treme
        this.face(dt, tp.ang, 3);
        if (!this.screamed && this.st > 0.35) {
          this.screamed = true;
          SND.bellow(A, d);
          C.shake = Math.max(C.shake, 0.55);
          this._embers(26);
          this.onScream?.();
        }
        if (this.st > 1.7) this._toStalk();
        break;
      }
      case 'stagger': {
        // ajoelhado e vulnerável
        if (Math.random() < 0.4) this._smoke(1);
        if (this.st > 6) { this.shielded = true; this.litLog.length = 0; this.exposure = 0; this._set('rise'); SND.groan(A, d); }
        break;
      }
      case 'rise': if (this.st > 1) { this.screamCd = 8; this._set('scream'); } break;
    }
    if (tx !== null) this.moveToward(dt, tx, tz, speed, turn, false);
    else if (this.state !== 'stalk' || !lit) this.speed = lerp(this.speed, 0, Math.min(1, dt * 8));
    keepIn(this);
    this.pos.y = damp(this.pos.y, this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1), 12, dt);
    this._fx(dt, C);
  }

  _attack(d) {
    const r = Math.random(), A = this.audio;
    let a;
    if (this.screamCd <= 0 && r < 0.2) a = 'scream';
    else if (d < 3.2) a = r < 0.75 ? 'swing' : 'vanish';
    else if (d < 7.5) a = r < 0.45 ? 'charge' : r < 0.8 ? 'throw' : 'vanish';
    else a = r < 0.6 ? 'throw' : r < 0.82 ? 'charge' : 'vanish';
    if (a === 'scream') { this.screamCd = rnd(14, 22); this._set('scream'); }
    else if (a === 'swing') { this.windT = 0.6; this._set('swingWind'); SND.chain(A, d); }
    else if (a === 'charge') { this._set('charge'); SND.groan(A, d); }
    else if (a === 'throw') { this.volley = 1 + Math.floor(Math.random() * 3); this._grab(); this._set('throwWind'); }
    else { this._set('vanish'); this._smoke(22, true); SND.smoke(A, d); }
  }

  // um objeto da fábrica levanta do chão ao lado dele (o aviso do arremesso)
  _grab() {
    this._drop();
    const J = junk(), it = J[Math.floor(Math.random() * J.length)];
    const m = new THREE.Mesh(it.g, it.m);
    m.frustumCulled = false;
    const s = this.scale, h = this.heading;
    const x = this.pos.x + Math.cos(h) * 0.75 * s + Math.sin(h) * 0.35, z = this.pos.z - Math.sin(h) * 0.75 * s + Math.cos(h) * 0.35;
    m.position.set(x, this.ctx.groundAt(x, z, this.pos.y + 0.3) + 0.08, z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(m);
    this.held = { mesh: m, p0: m.position.clone(), spin: v3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)), col: it.col };
    for (let i = 0; i < 6; i++) this.effects.spawn({ p: m.position.clone(), v: v3((Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5), life: 0.6, s0: 0.08, s1: 0.18, color: [0.3, 0.27, 0.24], drag: 2 });
  }

  // o objeto sobe girando até a mão erguida
  _lift() {
    const H = this.held; if (!H) return;
    this.root.updateMatrixWorld(true);
    const hand = this.bones.arms[1].hand.localToWorld(this._t.set(0, -0.12, 0.1));
    const k = smooth(clamp(this.st / 0.65, 0, 1));
    H.mesh.position.lerpVectors(H.p0, hand, k);
    H.mesh.position.y += Math.sin(this.st * 9) * 0.03;
    H.mesh.rotation.x += 2.5 * 0.016; H.mesh.rotation.y += 3 * 0.016;
    if (Math.random() < 0.35) this.effects.spawn({ p: H.mesh.position.clone(), v: v3((Math.random() - 0.5) * 0.3, 0.4, (Math.random() - 0.5) * 0.3), life: 0.5, s0: 0.05, s1: 0.12, color: [0.08, 0.07, 0.07], drag: 1 });
  }

  // arremesso em arco, calculado para cair no jogador (com um pouco de antecipação)
  _throw(env) {
    const H = this.held; if (!H) return;
    const P = env.player.pos, pv = env.playerVel, p = H.mesh.position.clone();
    const D0 = Math.hypot(P.x - p.x, P.z - p.z), T = clamp(D0 / 10, 0.45, 1.2), g = 9;
    const tx = P.x + pv.x * T * 0.6, tz = P.z + pv.z * T * 0.6, ty = P.y + 1.1;
    const v = v3((tx - p.x) / T, (ty - p.y + 0.5 * g * T * T) / T, (tz - p.z) / T);
    const pr = env.combat.projectile({ p, v, kind: 'debris', dmg: 12, owner: 'enemy', life: 3, size: 0.2, color: H.col, grav: g, knock: 5, mesh: H.mesh, spin: H.spin });
    this.thrown.push(pr);
    this.held = null;
    SFX.whoosh(this.audio, D0);
  }

  _drop() { if (this.held) { this.scene.remove(this.held.mesh); this.held = null; } }

  // fica exposto: urra, ajoelha e perde o escudo por 6 s
  _stagger(C, d) {
    this._drop();
    this.shielded = false;
    this._set('stagger');
    SND.bellow(this.audio, d);
    C.shake = Math.max(C.shake, 0.4);
    this._embers(30);
    this._smoke(14, true);
  }

  // fumaça preta (n puffs; burst = em volta do corpo todo)
  _smoke(n, burst = false) {
    const s = this.scale, B = this.bones;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      let p;
      if (burst) p = v3(this.pos.x + (Math.random() - 0.5) * 1.2 * s, this.pos.y + Math.random() * 1.9 * s, this.pos.z + (Math.random() - 0.5) * 1.2 * s);
      else { const src = Math.random() < 0.65 ? B.torso : B.head; p = src.localToWorld(v3(rnd(-0.22, 0.22), src === B.head ? rnd(0, 0.15) : rnd(0.05, 0.6), rnd(-0.18, 0.08))); }
      this.effects.spawn({ p, v: v3(rnd(-0.25, 0.25) * (burst ? 3 : 1), 0.6 + Math.random() * 0.7, rnd(-0.25, 0.25) * (burst ? 3 : 1)), life: 1 + Math.random() * 0.7, s0: (burst ? 0.18 : 0.09) * s, s1: (burst ? 0.4 : 0.28) * s, color: Math.random() < 0.5 ? [0.05, 0.045, 0.045] : [0.09, 0.08, 0.075], drag: 1.3, grav: -0.25 });
    }
  }

  _embers(n) {
    const s = this.scale;
    for (let i = 0; i < n; i++) this.effects.spawn({ p: v3(this.pos.x + (Math.random() - 0.5) * 0.6 * s, this.pos.y + (0.6 + Math.random() * 1.2) * s, this.pos.z + (Math.random() - 0.5) * 0.6 * s), v: v3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.5 + Math.random() * 0.6, s0: 0.035, s1: 0, color: Math.random() < 0.5 ? [1, 0.5, 0.12] : [1, 0.78, 0.35], drag: 1.5, grav: -0.5 });
  }

  // fumaça e brasas constantes, rastro dos objetos, luz alaranjada fraca
  _fx(dt, C) {
    if (!this.root.visible) return;
    const s = this.scale;
    this.smokeT -= dt;
    if (this.smokeT <= 0) { this.smokeT = this.litNow > 0 || this.state === 'stagger' ? 0.035 : 0.07; this._smoke(1); }
    this.emberT -= dt;
    if (this.emberT <= 0) {
      this.emberT = rnd(0.1, 0.22);
      const B = this.bones;
      const p = B.torso.localToWorld(v3(rnd(-0.25, 0.25), rnd(0, 0.6), rnd(-0.1, 0.2)));
      this.effects.spawn({ p, v: v3(rnd(-0.3, 0.3), 1 + Math.random(), rnd(-0.3, 0.3)), life: 0.7, s0: 0.03, s1: 0, color: Math.random() < 0.5 ? [1, 0.5, 0.12] : [1, 0.75, 0.3], drag: 1, grav: -0.3 });
    }
    // objetos voando soltam fumaça
    this.thrown = this.thrown.filter(pr => C.projectiles.includes(pr));
    for (const pr of this.thrown) if (Math.random() < 0.5) this.effects.spawn({ p: pr.p.clone(), v: v3(0, 0.3, 0), life: 0.4, s0: 0.06, s1: 0.14, color: [0.1, 0.09, 0.08], drag: 1 });
    const f = 0.85 + Math.sin(this.clock * 13) * 0.07 + Math.random() * 0.1;
    const k = this.vis * f * (this.state === 'stagger' ? 0.55 : 1) * (1 + this.P.heat * 0.6);
    this.atmo?.light(this.pos.x, this.pos.y + 1.6 * s, this.pos.z, [0.95 * k, 0.4 * k, 0.12 * k], 5, 5);
  }

  onHurt(dmg, info) {
    if (info.kind === 'light') return;
    if (this.shielded) return;        // quase nada: só a faísca e a brasa
    this.P.flinch = 1;
    if (this.clock - this.lastGrunt > 0.7) { this.lastGrunt = this.clock; SND.groan(this.audio, distP(this)); }
  }

  onDeath() { this._drop(); this.hidden = false; this.root.visible = true; }

  // morte: cai de joelhos urrando e se desfaz em cinza e brasa
  dying(dt) {
    const t = this.deadT, d = distP(this);
    if (!this.deathInit) {
      this.deathInit = true;
      SND.bellow(this.audio, d); SFX.roar(this.audio, d, 0.7, 2);
      if (this.combat) this.combat.shake = Math.max(this.combat.shake, 0.6);
      this._embers(30);
    }
    const k = clamp((t - 1.2) / 2, 0, 1);
    this.vis = 1 - k;
    if (t > 1.2) { this.pos.y -= dt * 0.3; if (Math.random() < 0.8) this._smoke(2, true); if (Math.random() < 0.6) this._embers(2); }
    else if (Math.random() < 0.5) this._smoke(1);
    const f = (1 - k) * (1 + Math.sin(t * 20) * 0.2);
    this.atmo?.light(this.pos.x, this.pos.y + 1.5 * this.scale, this.pos.z, [1.6 * f, 0.7 * f, 0.2 * f], 7, 6);
    if (t > 3.4) { this.root.visible = false; this.removed = true; this.onDefeated?.(); }
  }

  // ---------- animação ----------
  animate(dt) {
    this.clock += dt;
    const P = this.P, B = this.bones, s = this.state, t = this.clock, st = this.st;
    const k = Math.min(1, dt * 10), dead = this.dead;
    P.walk = lerp(P.walk, clamp(this.speed / 2, 0, 1), Math.min(1, dt * 6));
    P.phase += dt * this.speed / (1.5 * this.scale) * TAU * 0.5;
    P.thr = lerp(P.thr, s === 'throwWind' ? 1 : 0, k);
    P.rel = lerp(P.rel, s === 'throwEnd' ? 1 : 0, Math.min(1, dt * 18));
    P.up = lerp(P.up, s === 'swingWind' || s === 'appear' ? 1 : 0, k);
    P.down = lerp(P.down, s === 'swing' ? 1 : 0, Math.min(1, dt * 22));
    P.guard = lerp(P.guard, this.litNow > 0 && this.shielded && (s === 'stalk' || s === 'charge') ? 1 : 0, k);
    P.scream = lerp(P.scream, (s === 'scream' && st > 0.25 && st < 1.5) || (dead && this.deadT < 1.4) ? 1 : 0, k);
    P.kneel = lerp(P.kneel, s === 'stagger' || dead ? 1 : 0, Math.min(1, dt * 6));
    const sinkT = s === 'vanish' ? smooth(clamp(st / 0.8, 0, 1)) : s === 'gone' ? 1 : s === 'appear' ? 1 - smooth(clamp(st / 0.5, 0, 1)) : s === 'intro' ? 1 - smooth(clamp(st / 1.5, 0, 1)) : 0;
    P.sink = s === 'intro' || s === 'appear' || s === 'vanish' || s === 'gone' ? sinkT : lerp(P.sink, 0, k);
    P.flinch = Math.max(0, P.flinch - dt * 4);
    P.heat = lerp(P.heat, clamp(this.exposure / 2.5, 0, 1), Math.min(1, dt * 5));
    const ph = P.phase, w = P.walk * (1 - P.kneel);
    // corpo: passo pesado, curvado; ajoelha exposto; afunda na fumaça
    const bob = Math.abs(Math.sin(ph)) * 0.04 * w;
    B.hips.position.y = 0.95 - 0.44 * P.kneel + bob - P.sink * 1.6;
    B.hips.rotation.x = P.kneel * 0.1;
    B.torso.rotation.x = 0.1 + 0.08 * w + P.kneel * 0.35 - P.scream * 0.3 + P.down * 0.35 - P.up * 0.12 + P.thr * -0.1 + P.rel * 0.25 + P.flinch * -0.2 + (dead ? clamp((this.deadT - 1) / 1.5, 0, 1) * 0.6 : 0);
    B.torso.rotation.y = P.thr * 0.45 - P.rel * 0.35 - P.up * 0.3 + P.down * 0.35 + Math.sin(ph) * 0.06 * w;
    B.torso.rotation.z = Math.sin(ph) * 0.03 * w;
    B.head.rotation.x = -0.05 + P.kneel * 0.35 - P.scream * 0.55 + P.guard * 0.3;
    B.head.rotation.y = P.guard * 0.6 - P.thr * 0.3 + P.down * -0.2;
    B.neck.rotation.x = P.kneel * 0.15;
    B.mouth.scale.set(1, 1 + P.scream * 3, 1);
    // pernas: passo; ajoelhado (direita no chão, esquerda dobrada à frente)
    for (const L of B.legs) {
      const off = L.side > 0 ? 0 : Math.PI;
      let hx = Math.sin(ph + off) * 0.42 * w, kx = (0.08 + Math.max(0, -Math.sin(ph + off)) * 0.7) * w;
      const kh = L.side > 0 ? -1.45 : -0.15, kk = L.side > 0 ? 1.45 : 1.55;
      hx = lerp(hx, kh, P.kneel); kx = lerp(kx, kk, P.kneel);
      L.hip.rotation.x = hx; L.knee.rotation.x = kx;
    }
    // passos pesados (som) e chaves tilintando
    const sp = Math.sin(ph);
    if (w > 0.2 && Math.sign(sp) !== Math.sign(this.lastStep) && this.root.visible) {
      const dd = distP(this);
      SFX.stomp(this.audio, dd, 0.3);
      if (Math.random() < 0.35) SND.keys(this.audio, dd, 0.6);
    }
    this.lastStep = sp;
    // braços: [0] direito (corrente), [1] esquerdo (arremesso / protege o rosto)
    const [R, Lf] = B.arms;
    {
      let shX = 0.05 - Math.sin(ph) * 0.3 * w, shZ = -0.12, elX = -0.25;
      shX = lerp(shX, -2.9, P.up); shZ = lerp(shZ, -0.3, P.up); elX = lerp(elX, -0.7, P.up);
      shX = lerp(shX, -0.45, P.down); shZ = lerp(shZ, 0.1, P.down); elX = lerp(elX, -0.1, P.down);
      shX = lerp(shX, -0.5, P.scream); shZ = lerp(shZ, -0.9, P.scream); elX = lerp(elX, -0.4, P.scream);
      shX = lerp(shX, -0.35, P.kneel); shZ = lerp(shZ, -0.05, P.kneel); elX = lerp(elX, -0.3, P.kneel);
      R.sh.rotation.set(shX, 0, shZ); R.el.rotation.x = elX;
    }
    {
      let shX = 0.05 + Math.sin(ph) * 0.3 * w, shZ = 0.12, elX = -0.25;
      shX = lerp(shX, -2.7, P.thr); shZ = lerp(shZ, 0.35, P.thr); elX = lerp(elX, -0.4, P.thr);
      shX = lerp(shX, -0.8, P.rel); shZ = lerp(shZ, 0.05, P.rel); elX = lerp(elX, -0.1, P.rel);
      shX = lerp(shX, -1.75, P.guard); shZ = lerp(shZ, -0.45, P.guard); elX = lerp(elX, -1.85, P.guard);
      shX = lerp(shX, -0.5, P.scream); shZ = lerp(shZ, 0.9, P.scream); elX = lerp(elX, -0.4, P.scream);
      shX = lerp(shX, -0.75, P.kneel); shZ = lerp(shZ, 0.1, P.kneel); elX = lerp(elX, -0.6, P.kneel);
      Lf.sh.rotation.set(shX, 0, shZ); Lf.el.rotation.x = elX; Lf.hand.rotation.x = -P.thr * 0.6;
    }
    // corrente balançando (chicoteia no golpe)
    B.chain.forEach((j, i) => {
      j.rotation.x = Math.sin(t * 2.2 - i * 0.5) * 0.12 + Math.sin(ph) * 0.15 * w + P.up * 0.5 - P.down * 0.6 * Math.sin(st * 20 - i * 0.6) - R.sh.rotation.x * 0.12;
      j.rotation.z = Math.cos(t * 1.7 - i * 0.4) * 0.08;
    });
    B.keyList.forEach((j, i) => { j.rotation.x = Math.sin(t * 6 + i) * 0.25 * w; });
    // brilho: olhos e rachaduras inflamam com a luz (exposição); ajoelhado, fracos
    const flick = 0.85 + Math.sin(t * 17) * 0.08 + Math.random() * 0.07;
    const heat = (1 + P.heat * 0.5 + P.scream * 0.4) * (s === 'stagger' ? 0.65 : 1) * flick;
    this.charMat.uniforms.uColor.value.setScalar(heat);
    this.glowMat.uniforms.uColor.value.copy(this.glowMat.userData.col).multiplyScalar(heat);
    // visibilidade (some e surge na fumaça)
    let vis = dead ? this.vis : 1;
    if (!dead) {
      if (s === 'vanish') vis = 1 - smooth(clamp(st / 0.8, 0, 1));
      else if (s === 'gone') vis = 0;
      else if (s === 'appear') vis = smooth(clamp(st / 0.5, 0, 1));
      else if (s === 'intro') vis = smooth(clamp(st / 1.4, 0, 1));
      this.vis = vis;
    }
    for (const m of this.mats) m.uniforms.uOpacity.value = m.userData.op * vis;
  }

  dispose() { this._drop(); super.dispose(); }
}
