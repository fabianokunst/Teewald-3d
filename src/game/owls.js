import * as THREE from 'three';
import { ps1Material, G } from '../engine/ps1material.js';
import { makeCanvas, canvasTex, processPixels } from '../engine/textures.js';
import { blob, limb, cone, ellipsoid, joint, mix3, lerp, clamp, wrapA, damp, smooth, TAU } from './creatures/shapes.js';
import { noise, tone } from './creatures/sfx.js';
import { CHURCH } from '../world/church.js';
import { frame } from '../world/buildings.js';
import { rng } from '../world/geo.js';
import { START } from '../config.js';

// Corujas pela cidade. Três espécies da Serra Gaúcha:
// - suindara (Tyto furcata), a coruja-da-igreja: dourada em cima, branca embaixo, disco
//   facial em coração. O grito rouco, de pano rasgando, é o "rasga-mortalha": diz o povo
//   que anuncia morte na casa onde ela pousa. Torre da igreja, chaminés, cumeeiras e postes;
// - murucututu-de-barriga-amarela (Pulsatrix koeniswaldiana): grande e escura, de
//   sobrancelhas brancas, nos galhos das araucárias; uma série de "bu" graves que acelera;
// - coruja-buraqueira (Athene cunicularia): pequena e pernalta, no chão dos campos, em
//   lampiões e cruzetas; "cu-cuu" e, assustada, um matraquear agudo.
// Pousadas, viram a cabeça para seguir o jogador e avisam quando ele chega perto. Perto
// demais (ou com um tiro), levantam voo para longe e pousam em outro poleiro livre.

const SPECIES = {
  suindara: {
    heart: true, size: 0.42, legH: 0.1, legR: [0.05, 0.036], bodyW: 0.94, headR: 0.235, faceCap: 0.55, faceK: 0.95,
    back: [0.72, 0.55, 0.36], belly: [1, 0.98, 0.95], crown: [0.66, 0.5, 0.33],
    disc: [1, 0.99, 0.97], rim: [0.42, 0.27, 0.16], brow: null, throat: null, band: null,
    eye: [0.04, 0.03, 0.03], iris: null, beak: [0.9, 0.83, 0.75], leg: [0.92, 0.88, 0.82],
    wing: [0.72, 0.56, 0.36], tip: [0.52, 0.49, 0.46], under: [1, 0.98, 0.95],
    flush: 10, alert: 19, hear: 120, every: [35, 80], freq: 3.1,
    perch: { church: 4, chimney: 1.2, ridge: 1, pole: 0.7, arm: 0.6, lamp: 0.4, tree: 0.3 },
  },
  murucututu: {
    size: 0.5, legH: 0.05, legR: [0.05, 0.036], bodyW: 1.06, headR: 0.25, faceCap: 0.66, faceK: 0.7,
    back: [0.3, 0.21, 0.14], belly: [0.84, 0.68, 0.4], crown: [0.24, 0.17, 0.12],
    disc: [0.3, 0.22, 0.15], rim: [0.2, 0.14, 0.1], brow: [0.92, 0.89, 0.82], throat: [0.9, 0.87, 0.8], band: [0.32, 0.22, 0.15],
    eye: [0.06, 0.04, 0.03], iris: [0.5, 0.25, 0.08], beak: [0.78, 0.75, 0.62], leg: [0.7, 0.6, 0.45],
    wing: [0.32, 0.23, 0.16], tip: [0.24, 0.18, 0.13], under: [0.66, 0.55, 0.38],
    flush: 11, alert: 21, hear: 140, every: [22, 50], freq: 2.6,
    perch: { tree: 3, pole: 0.35, arm: 0.25, ridge: 0.2, chimney: 0.15 },
  },
  buraqueira: {
    size: 0.29, legH: 0.3, legR: [0.03, 0.021], bodyW: 1.0, headR: 0.225, faceCap: 0.72, faceK: 0.6,
    back: [0.55, 0.42, 0.29], belly: [0.88, 0.82, 0.7], crown: [0.5, 0.38, 0.26],
    disc: [0.66, 0.53, 0.38], rim: [0.45, 0.34, 0.23], brow: [0.95, 0.93, 0.86], throat: [0.95, 0.93, 0.86], band: null,
    eye: [0.04, 0.03, 0.02], iris: [0.95, 0.8, 0.22], beak: [0.72, 0.7, 0.58], leg: [0.7, 0.66, 0.58],
    wing: [0.54, 0.41, 0.28], tip: [0.42, 0.32, 0.22], under: [0.88, 0.83, 0.72],
    flush: 8, alert: 16, hear: 75, every: [18, 45], freq: 4.2, bob: true,
    perch: { ground: 3, lamp: 1, arm: 0.5, pole: 0.3 },
  },
};
const PLAN = [['suindara', 11], ['murucututu', 7], ['buraqueira', 8]];

// asa aberta (x = envergadura, z = corda, bordo de ataque em +z): braço e mão
const ARM = [[0, 0.12], [0.25, 0.13], [0.5, 0.11], [0.5, -0.3], [0.25, -0.34], [0, -0.28]];
const HAND = [[0, 0.1], [0.22, 0.09], [0.4, 0.05], [0.53, -0.03], [0.57, -0.13], [0.51, -0.24], [0.3, -0.3], [0, -0.3]];

const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
// no voo o corpo deita para a frente; a asa aberta fica na horizontal, bordo para a cabeça
const Q_FLIGHT = new THREE.Quaternion().setFromAxisAngle(AX, -Math.PI / 2);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _q = new THREE.Quaternion();

// ---------- textura e geometria ----------

// penas: barras finas, pintas claras e escuras e riscos (a cor vem dos vértices)
let FEATHER = null;
function featherTexture() {
  if (FEATHER) return FEATHER;
  const N = 64, c = makeCanvas(N, N), g = c.getContext('2d'), d = g.createImageData(N, N), R = rng(91);
  const v = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) v[y * N + x] = 205 + Math.sin((y / N) * TAU * 6 + Math.sin(x * 0.4) * 0.6) * 12;
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(R() * N), y = Math.floor(R() * N), k = R() < 0.6 ? -42 : 30, r = 1 + Math.floor(R() * 1.6);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = dx * dx + dy * dy;
      if (q > r * r + 0.5) continue;
      v[((y + dy + N) % N) * N + ((x + dx + N) % N)] += k * (1 - q / (r * r + 1) * 0.5);
    }
  }
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(R() * N), y = Math.floor(R() * N), L = 2 + Math.floor(R() * 4), k = (R() - 0.5) * 34;
    for (let j = 0; j < L; j++) v[((y + j) % N) * N + x] += k * (1 - j / L);
  }
  for (let i = 0; i < N * N; i++) {
    const q = clamp(v[i] + (R() - 0.5) * 14, 70, 255);
    d.data[i * 4] = q; d.data[i * 4 + 1] = q * 0.98; d.data[i * 4 + 2] = q * 0.95; d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (FEATHER = canvasTex(processPixels(c), true));
}

// junta várias geometrias (posição, normal, uv, cor) numa só
function merge(geos) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (const g of geos) {
    const base = pos.length / 3;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv'), C = g.getAttribute('color');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      col.push(C ? C.getX(i) : 1, C ? C.getY(i) : 1, C ? C.getZ(i) : 1);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

// painel de penas plano com as duas faces (dorso por cima, ventre mais claro por baixo).
// side -1 espelha para a asa direita; t0..t1 = trecho da envergadura (ponta mais escura)
function wingPanel(outline, side, S, t0, t1) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const n = outline.length, xMax = Math.max(...outline.map(p => p[0]));
  for (const ny of [1, -1]) {
    const base = pos.length / 3;
    for (const [x, z] of outline) {
      pos.push(x * side, ny * 0.004, z); nor.push(0, ny, 0);
      uv.push(x * 1.6, z * 1.6 + 0.5);
      const t = lerp(t0, t1, x / xMax);
      col.push(...(ny > 0 ? mix3(S.wing, S.tip, smooth(clamp((t - 0.45) / 0.55, 0, 1))) : S.under));
    }
    for (let i = 1; i < n - 1; i++) {
      let a = base, b = base + i, c = base + i + 1;
      const cy = (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]) - (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]);
      if (Math.sign(cy) !== ny) [b, c] = [c, b];
      idx.push(a, b, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// asa dobrada: recolhida para dentro do corpo, pelo flanco em direção à cauda (as penas
// dobradas são pintadas no corpo; a asa aparece abrindo)
function foldQuat(side) {
  const s = new THREE.Vector3(0, -0.6, -0.8).normalize();
  const n = new THREE.Vector3(side, 0, 0);
  n.addScaledVector(s, -n.dot(s)).normalize();
  const X = s.clone().multiplyScalar(side), Z = new THREE.Vector3().crossVectors(X, n);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, n, Z));
}

// corpo: peito claro na frente; costas e flancos com a cor das asas dobradas (pontas mais
// escuras embaixo); faixa escura no peito da murucututu
function bodyColor(S, t, a) {
  const front = Math.sin(a);
  if (S.band && front > 0.35 && t > 0.66 && t < 0.86) return S.band;
  if (front < 0.42 && t > 0.1 && t < 0.86) return mix3(S.wing, S.tip, smooth(clamp((0.45 - t) / 0.35, 0, 1)));
  return mix3(S.back, S.belly, smooth(clamp((front + 0.05) / 0.55, 0, 1)));
}

// disco facial: r = 0 no meio ... 1 na borda, th = ângulo (π/2 em cima). Borda escura;
// sobrancelhas e garganta brancas nas que têm
function faceColor(S, r, th) {
  const up = Math.sin(th), side = Math.abs(Math.cos(th));
  if (S.brow && r > 0.6 && up > 0.3 && side > 0.2) return S.brow;
  if (S.throat && r > 0.6 && up < -0.6) return S.throat;
  return r > 0.9 ? S.rim : S.disc;
}

// o rosto como peça própria, colado na parte achatada da cabeça (em coração na suindara:
// recorte em cima e queixo pontudo)
function faceDisc(S, R, hy, yr, sx, sz, cap) {
  const lim = Math.sqrt(Math.max(0.05, 1 - (cap / (R * sz)) ** 2)) * 0.97, N = 24, rings = [0, 0.45, 0.72, 1];
  const pos = [], uv = [], col = [], idx = [];
  for (const rho of rings) for (let k = 0; k < (rho ? N : 1); k++) {
    const th = (k / N) * TAU;
    let r = rho * lim;
    if (S.heart) r *= (1 - 0.2 * Math.max(0, Math.sin(th)) ** 12) * (1 + 0.12 * Math.max(0, -Math.sin(th)) ** 3);
    const x = Math.cos(th) * r * R * sx, y = hy + Math.sin(th) * r * yr;
    const zs = sz * R * Math.sqrt(Math.max(0, 1 - (x / (R * sx)) ** 2 - ((y - hy) / yr) ** 2));
    pos.push(x, y, cap + Math.max(0, zs - cap) * (1 - S.faceK) + 0.004);
    uv.push(0.5 + x * 2, 0.5 + y * 2);
    col.push(...faceColor(S, rho, th));
  }
  for (let k = 0; k < N; k++) idx.push(0, 1 + k, 1 + (k + 1) % N);
  for (let ri = 1; ri < rings.length - 1; ri++) {
    const a0 = 1 + (ri - 1) * N, b0 = 1 + ri * N;
    for (let k = 0; k < N; k++) {
      const a = a0 + k, b = a0 + (k + 1) % N, c = b0 + k, d = b0 + (k + 1) % N;
      idx.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a coruja em unidades (corpo com ~0,67 de altura; a escala da espécie dá o tamanho real).
// root fica nos pés; bodyJ no meio do corpo (gira para deitar no voo)
function buildOwl(S, M) {
  const root = new THREE.Group();
  const bodyJ = joint(root, 0, S.legH + 0.3, 0);
  bodyJ.rotation.order = 'XYZ';
  const parts = [];
  // sino arredondado: barriga cheia, ombros largos, a cabeça encaixa sem pescoço
  parts.push(blob([[-0.32, 0], [-0.3, 0.1], [-0.24, 0.19], [-0.14, 0.245], [-0.02, 0.265], [0.1, 0.26], [0.2, 0.235], [0.28, 0.19], [0.33, 0.1], [0.35, 0]], 10,
    { sx: S.bodyW, sz: 0.86, col: (t, a) => bodyColor(S, t, a), uRep: 4, vRep: 3 }));
  const tail = cone(0.2, 0.1, S.wing, S.tip, 4, 0.3);
  tail.rotateX(-2.75); tail.translate(0, -0.18, -0.15);
  parts.push(tail);
  for (const side of [-1, 1]) {
    const leg = limb(S.legH + 0.06, S.legR[0], S.legR[1], 5, () => S.leg);
    leg.translate(side * 0.08, -0.27, 0.03);
    parts.push(leg);
    const fy = -0.3 - S.legH + 0.012;
    for (const [ry, fwd] of [[-0.35, 1], [0.35, 1], [0, -1]]) {
      const toe = cone(0.07, 0.016, S.leg, [0.1, 0.09, 0.08], 3);
      toe.rotateX(fwd * Math.PI / 2); toe.rotateY(ry); toe.translate(side * 0.08, fy, 0.03);
      parts.push(toe);
    }
  }
  bodyJ.add(new THREE.Mesh(merge(parts), M.body));

  // cabeça larga como o corpo, afundada nos ombros, com o rosto achatado (disco facial)
  const R = S.headR, hy = R * 0.82, yr = R * 0.92, sz = 0.92, cap = S.faceCap * R;
  const headJ = joint(bodyJ, 0, 0.2, 0.02);
  headJ.rotation.order = 'YXZ';
  const prof = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; prof.push([hy - Math.cos(u * Math.PI) * yr, i === 0 || i === 8 ? 0 : Math.sin(u * Math.PI) * R]); }
  const rAt = y => { const k = (y - hy) / yr; return R * Math.sqrt(Math.max(0, 1 - k * k)); };
  const head = blob(prof, 12, {
    sx: 1.08, sz,
    off: (y, a) => { const z = rAt(y) * Math.sin(a) * sz; return [0, z > cap ? -(z - cap) * S.faceK : 0]; },
    col: () => S.crown,
    uRep: 3, vRep: 2,
  });
  head.computeVertexNormals();
  const eyeZ = cap + Math.max(0, R * 0.84 - cap) * (1 - S.faceK) - 0.016;
  const beak = cone(0.07, 0.024, S.beak, mix3(S.beak, [0.2, 0.2, 0.2], 0.4), 4);
  beak.rotateX(2.1); beak.translate(0, hy - R * 0.22, eyeZ + 0.004);
  headJ.add(new THREE.Mesh(merge([head, faceDisc(S, R, hy, yr, 1.08, sz, cap), beak]), M.body));
  // olhos (piscam achatando em y); à noite refletem a luz
  const eyeJ = joint(headJ, 0, hy + R * 0.06, 0);
  const eyes = [-1, 1].map(s => {
    const e = ellipsoid(0.055, 0.036, 0.04, 8, t => (t > 0.85 ? S.eye : S.iris || S.eye), 4);
    e.translate(s * R * 0.38, 0, eyeZ);
    return e;
  });
  eyeJ.add(new THREE.Mesh(merge(eyes), M.eye));

  // asas: ombro → braço; pulso → mão (dobrada, a mão encolhe para baixo do braço)
  const wings = [-1, 1].map(side => {
    const sh = joint(bodyJ, side * 0.17, 0.12, -0.04);
    sh.add(new THREE.Mesh(wingPanel(ARM, side, S, 0, 0.47), M.body));
    const wr = joint(sh, side * 0.5, 0, 0);
    wr.add(new THREE.Mesh(wingPanel(HAND, side, S, 0.47, 1), M.body));
    return { side, sh, wr, qFold: foldQuat(side) };
  });
  return { root, bodyJ, headJ, eyeJ, wings };
}

// ---------- sons ----------

// saída posicionada: volume pela distância, abafada de longe e no lado certo da câmera
export function spatial(a, d, pan, range) {
  const c = a.ctx, v = Math.max(0, 1 - d / range);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400 + 11000 * v * v;
  const g = c.createGain(); g.gain.value = v * (0.25 + 0.75 * v) * 0.7;
  f.connect(g);
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1) * 0.8; g.connect(p).connect(a.bus?.omen || a.master); }
  else g.connect(a.bus?.omen || a.master);
  return f;
}

// volume com subida, sustentação e queda
function env(p, t, a, dur, v) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(v, t + a);
  p.linearRampToValueAtTime(v * 0.7, t + Math.max(a, dur - 0.25));
  p.linearRampToValueAtTime(0.0001, t + dur);
}

// suindara: o rasga-mortalha, chiado rouco e longo, de pano rasgando
function screech(a, out, t, dur, k = 1) {
  const c = a.ctx;
  const src = c.createBufferSource(); src.buffer = a.white; src.loop = true;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(2300, t); bp.frequency.linearRampToValueAtTime(3600, t + 0.3); bp.frequency.linearRampToValueAtTime(2600, t + dur);
  // aspereza: o volume treme rápido (as "rasgadas")
  const am = c.createGain(); am.gain.value = 0.55;
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.type = 'triangle'; lfo.frequency.value = 36 + Math.random() * 14; lg.gain.value = 0.45;
  lfo.connect(lg).connect(am.gain);
  const g = c.createGain(); env(g.gain, t, 0.08, dur, 0.12 * k);
  src.connect(hp).connect(bp).connect(am).connect(g).connect(out);
  // a parte de "voz": serra aguda com tremido num filtro estreito
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(1300, t); o.frequency.linearRampToValueAtTime(1520, t + 0.25); o.frequency.linearRampToValueAtTime(1080, t + dur);
  const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 21; vg.gain.value = 45;
  vib.connect(vg).connect(o.frequency);
  const of = c.createBiquadFilter(); of.type = 'bandpass'; of.frequency.value = 2700; of.Q.value = 3;
  const og = c.createGain(); env(og.gain, t, 0.1, dur, 0.03 * k);
  o.connect(of).connect(og).connect(out);
  const end = t + dur + 0.05;
  src.start(t, Math.random() * 1.5, dur + 0.05); lfo.start(t); vib.start(t); o.start(t);
  lfo.stop(end); vib.stop(end); o.stop(end);
}

// estalo do bico (ameaça)
function clack(a, out, t) {
  noise(a, t, 0.03, { type: 'bandpass', f: 2400, q: 1.8, vol: 0.18, attack: 0.002, out });
  tone(a, t, 0.04, { type: 'square', f: 900, f1: 420, vol: 0.035, attack: 0.002, out });
}

// suindara acuada: bufa e estala o bico
function hiss(a, out, t) {
  noise(a, t, 0.9, { type: 'highpass', f: 2600, q: 0.5, vol: 0.09, attack: 0.18, out });
  noise(a, t, 0.8, { type: 'bandpass', f: 4800, q: 1.5, vol: 0.05, attack: 0.25, out });
  clack(a, out, t + 1.0); clack(a, out, t + 1.12);
}

// murucututu: um "bu" grave
function hoot(a, out, t, f, vol) {
  tone(a, t, 0.2, { type: 'sine', f, f1: f * 0.86, vol, attack: 0.03, out });
  tone(a, t, 0.16, { type: 'triangle', f: f * 2, f1: f * 1.7, vol: vol * 0.12, attack: 0.03, out });
  noise(a, t, 0.12, { type: 'lowpass', f: 500, vol: vol * 0.15, attack: 0.02, out });
}

// ... em série, acelerando e sumindo
function hoots(a, out, t) {
  const n = 7 + Math.floor(Math.random() * 5), f0 = 285 + Math.random() * 25;
  let tt = t;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    hoot(a, out, tt, f0 - i * 3, 0.13 * (i === 0 ? 0.6 : 1) * (1 - k * 0.45));
    tt += lerp(0.34, 0.12, Math.pow(k, 0.7));
  }
}

// buraqueira: "cu-cuu"
function cucu(a, out, t) {
  const f = 400 + Math.random() * 40;
  tone(a, t, 0.16, { type: 'triangle', f: f * 1.06, f1: f, vol: 0.07, attack: 0.03, out });
  tone(a, t + 0.26, 0.5, { type: 'triangle', f: f * 1.02, f1: f * 0.9, vol: 0.075, attack: 0.05, vib: 6, vibF: 7, out });
}

// buraqueira assustada: matraqueado agudo
function chatter(a, out, t, n) {
  for (let i = 0; i < n; i++) {
    const tt = t + i * (0.085 + Math.random() * 0.02);
    tone(a, tt, 0.07, { type: 'sawtooth', f: 1350, f1: 950, vol: 0.05, attack: 0.006, out });
    noise(a, tt, 0.05, { type: 'bandpass', f: 2600, q: 2, vol: 0.05, out });
  }
}

// asas na decolagem (a coruja quase não faz barulho voando: só o arranque)
function whoosh(a, out, t) {
  for (let i = 0; i < 3; i++) noise(a, t + i * 0.24, 0.2, { type: 'lowpass', f: 650, f1: 220, q: 0.7, vol: 0.12 * (1 - i * 0.25), attack: 0.06, out });
  noise(a, t, 0.1, { type: 'highpass', f: 3200, vol: 0.03, attack: 0.01, out });
}

export const VOICES = {
  suindara: {
    song: (a, out, t) => screech(a, out, t, 1.3 + Math.random() * 0.7),
    alert: hiss,
    flush: (a, out, t) => screech(a, out, t, 0.75, 1.15),
    wings: whoosh,
  },
  murucututu: {
    song: hoots,
    alert: (a, out, t) => { for (let i = 0; i < 3; i++) clack(a, out, t + i * 0.13); },
    flush: (a, out, t) => { hoot(a, out, t, 250, 0.13); hoot(a, out, t + 0.22, 238, 0.12); },
    wings: whoosh,
  },
  buraqueira: {
    song: cucu,
    alert: (a, out, t) => chatter(a, out, t, 3),
    flush: (a, out, t) => chatter(a, out, t, 6),
    wings: whoosh,
  },
};

// ---------- poleiros ----------

// chão aberto (pasto, terreno baldio): nada de rua, casa, mato, água, árvore ou objeto
function openGround(ctx, x, z) {
  const { terrain, zones, roads, rivers, collision } = ctx;
  if (!terrain.inBounds(x, z) || zones.isForest(x, z) || zones.isBlocked(x, z) || zones.insideBuilding(x, z, 4)) return false;
  if (roads.index.clearance(x, z).d < 5) return false;
  const rv = rivers.index.nearest(x, z);
  if ((rv.seg && rv.d < rv.seg.data.width / 2 + 5) || terrain.waterLevel(x, z) !== null) return false;
  const h = terrain.heightAt(x, z);
  if (Math.abs(ctx.surfaceAt(x, z) - h) > 0.05) return false;
  if (Math.abs(terrain.heightAt(x + 1.5, z) - terrain.heightAt(x - 1.5, z)) + Math.abs(terrain.heightAt(x, z + 1.5) - terrain.heightAt(x, z - 1.5)) > 1.2) return false;
  const busy = collision.near(x, z, 3).some(it => {
    if (it.t === 'circle') return Math.hypot(x - it.x, z - it.z) < it.r + 2;
    const dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
    return Math.abs(lx) < it.hx + 2 && Math.abs(lz) < it.hz + 2;
  });
  if (busy || (ctx.fenceIndex && ctx.fenceIndex.nearest(x, z).d < 2)) return false;
  return !ctx.trees.some(t => !t.far && Math.abs(t.x - x) < 3 && Math.abs(t.z - z) < 3);
}

// { x, y, z, h (para onde a coruja olha), out (lado aberto, por onde chega), kind, owl }
function gatherPerches(ctx) {
  const list = [], b = ctx.playBounds, R = rng(5150);
  const ch = ctx.landmarks?.church, c0 = ch || { x: -110, z: -10 };
  // só na cidade e em volta (as araucárias do mato, mais perto)
  const add = (x, y, z, h, kind) => {
    if (x < b.x0 + 5 || x > b.x1 - 5 || z < b.z0 + 5 || z > b.z1 - 5) return;
    if (Math.hypot(x - c0.x, z - c0.z) > (kind === 'tree' ? 380 : 480)) return;
    list.push({ x, y, z, h, out: [Math.sin(h), Math.cos(h)], kind, owl: null });
  };
  // postes, cruzetas, lampiões, chaminés e cumeeiras (registrados ao montar a cidade)
  for (const p of ctx.perches || []) add(p.x, p.y, p.z, p.h ?? R() * TAU, p.kind);
  // igreja: beiral da torre ao lado da agulha, friso sob a rosácea e a cumeeira da nave
  if (ch) {
    const { P } = frame(ch), C = CHURCH, fy = ch.y + C.floor, hl = C.L / 2, tz1 = hl + 1.2;
    for (const s of [-1, 1]) {
      let p = P(s * 2.1, 0, tz1 - 0.15);
      add(p[0], fy + C.towerH, p[2], ch.rot, 'church');
      p = P(s * 2.3, 0, tz1 + 0.1);
      add(p[0], fy + C.wallH + 1.8, p[2], ch.rot, 'church');
      p = P(0, 0, -hl + 6 + s * 3);
      add(p[0], fy + C.ridge, p[2], ch.rot + s * Math.PI / 2, 'church');
    }
  }
  // araucárias: perto da ponta de um galho do verticilo de baixo (o mais largo), ao lado
  // da folhagem vertical (mais para dentro, a copa esconde a coruja)
  for (const t of ctx.trees) {
    if (t.t !== 'araucaria' || t.far || t.rot === undefined || !R.chance(0.6)) continue;
    const s = t.s || 1, sy = t.sy || s, L = 4.4, f = 0.88;
    const a = (R.int(0, 5) / 6) * TAU, dx = Math.cos(a), dz = Math.sin(a), off = R.chance(0.5) ? 0.42 : -0.42;
    const lx = dx * (0.2 + (L - 0.2) * f) - dz * off, lz = dz * (0.2 + (L - 0.2) * f) + dx * off;
    const ly = 12.2 + (L * 0.38 + 0.3) * f;
    const c = Math.cos(t.rot), sn = Math.sin(t.rot);
    add(t.x + (lx * c + lz * sn) * s, t.y + ly * sy, t.z + (-lx * sn + lz * c) * s, Math.atan2(dx * c + dz * sn, -dx * sn + dz * c), 'tree');
  }
  // campo aberto em volta da cidade (as buraqueiras ficam no chão)
  for (let k = 0, n = 0; k < 5000 && n < 60; k++) {
    const x = c0.x + (R() - 0.5) * 900, z = c0.z + (R() - 0.5) * 900;
    if (Math.hypot(x - c0.x, z - c0.z) > 450 || !openGround(ctx, x, z)) continue;
    add(x, ctx.terrain.heightAt(x, z), z, R() * TAU, 'ground'); n++;
  }
  return list;
}

// ---------- coruja ----------

class Owl {
  constructor(kind, S, M) {
    this.kind = kind; this.S = S;
    Object.assign(this, buildOwl(S, M));
    this.root.scale.setScalar(S.size * (0.94 + Math.random() * 0.12));
    this.pos = this.root.position;
    this.vel = new THREE.Vector3(); this.flee = new THREE.Vector3();
    this.heading = 0; this.face = null; this.bank = 0;
    this.state = 'perch'; this.st = 0;
    this.perch = null; this.target = null; this.threat = null; this.seen = null;
    this.flushT = null; this.alert = 0; this.warned = false;
    this.open = 0; this.pitch = 0.1; this.amp = 0; this.ph = Math.random() * TAU; this.breath = Math.random() * TAU;
    this.flapping = true; this.cycle = 1; this.bobT = 0;
    this.callT = 4 + Math.random() * S.every[1];
    this.blinkT = 1 + Math.random() * 5;
    this.head = { yaw: 0, pitch: 0, tilt: 0, ty: 0, tp: 0, tt: 0, next: 0 };
  }
}

export class Owls {
  // deps: { ctx, scene, audio, atmo }
  constructor({ ctx, scene, audio, atmo }) {
    this.ctx = ctx; this.audio = audio; this.atmo = atmo;
    this.M = { body: ps1Material({ map: featherTexture() }), eye: ps1Material({}) };
    this.root = new THREE.Group();
    scene.add(this.root);
    this.perches = gatherPerches(ctx);
    this.core = ctx.landmarks?.church || { x: -110, z: -10 };
    this.list = [];
    this.voiceCd = 4;
    this.listener = { p: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };
    this._f = new THREE.Vector3();
    // as primeiras: uma suindara no friso da igreja e uma buraqueira num lampião perto do
    // calçadão (onde o jogo começa); as outras espalhadas, mais delas perto do centro
    const show = [['suindara', p => p.kind === 'church' && p.y - this.core.y < 15],
      ['buraqueira', p => p.kind === 'lamp' && Math.hypot(p.x - START.x, p.z - START.z) < 140]];
    const plan = [...show.map(s => [s[0], 1, s[1]]), ...PLAN.map(([kind, n]) => [kind, n - (show.some(s => s[0] === kind) ? 1 : 0)])];
    for (const [kind, n, want] of plan) for (let i = 0; i < n; i++) {
      const o = new Owl(kind, SPECIES[kind], this.M);
      const p = (want && this.perches.find(q => !q.owl && want(q))) || this.choose(o, null, null);
      if (!p) continue;
      this.seat(o, p, p.h);
      this.root.add(o.root);
      this.list.push(o);
    }
    // tiros e explosões espantam as que estão por perto (weapon.js, combat.js)
    // (encadeado: os moradores também escutam, npcs.js)
    const prev = ctx.scare;
    ctx.scare = (x, z, r, kind) => { prev?.(x, z, r, kind); this.scare(x, z, r); };
  }

  // poleiro livre para a coruja: longe das outras; voando (from), entre 45 e 220 m e,
  // fugindo (threat), longe da ameaça e de preferência para o lado da fuga
  choose(o, from, threat) {
    const S = o.S, c = this.core;
    const taken = this.list.filter(q => q !== o).map(q => q.perch || q.target || q.pos);
    let best = null, bk = -1;
    for (const p of this.perches) {
      const w = S.perch[p.kind];
      if (!w || p.owl || taken.some(q => Math.abs(q.x - p.x) < 28 && Math.abs(q.z - p.z) < 28)) continue;
      let k = w;
      if (from) {
        const d = Math.hypot(p.x - from.x, p.z - from.z);
        if (d < 45 || d > 220) continue;
        if (threat) {
          if (Math.hypot(p.x - threat.x, p.z - threat.z) < 55) continue;
          const fx = from.x - threat.x, fz = from.z - threat.z, fl = Math.hypot(fx, fz) || 1;
          k *= 0.25 + Math.max(0, ((p.x - from.x) * fx + (p.z - from.z) * fz) / (d * fl)) * 1.5;
        }
        k /= 1 + d / 120;
      } else k /= 1 + Math.hypot(p.x - c.x, p.z - c.z) / 160;   // mais delas perto do centro
      const key = Math.random() ** (1 / k);
      if (key > bk) { bk = key; best = p; }
    }
    return best;
  }

  seat(o, p, heading) {
    o.perch = p; p.owl = o; o.target = null;
    o.pos.set(p.x, p.y, p.z);
    o.vel.set(0, 0, 0);
    o.heading = heading; o.face = Math.abs(wrapA(p.h - heading)) > 0.3 ? p.h + (Math.random() - 0.5) * 0.5 : null;
    o.state = 'perch'; o.st = 0; o.flushT = null; o.alert = 0; o.warned = false; o.bank = 0;
  }

  scare(x, z, r) {
    for (const o of this.list) {
      if (o.state !== 'perch' || Math.hypot(o.pos.x - x, o.pos.z - z) > r) continue;
      o.threat = { x, z };
      o.flushT = Math.min(o.flushT ?? 9, 0.05 + Math.random() * 0.5);
    }
  }

  // player: o jogador (null na tela título e no fim: ninguém espanta as corujas)
  update(dt, player, camera) {
    const ctx = this.ctx;
    this.root.visible = !ctx.indoor;
    if (ctx.indoor) return;
    this.voiceCd -= dt;
    const L = this.listener, night = this.atmo?.cur?.night ?? 0;
    L.p.copy(camera.position);
    camera.getWorldDirection(this._f);
    L.right.set(-this._f.z, 0, this._f.x).normalize();
    // olhos refletem a luz à noite
    const ek = night * 0.6;
    this.M.eye.uniforms.uEmissive.value.setRGB(ek * 0.9, ek * 0.55, ek * 0.18);
    const cull = Math.min(160, G.uFogFar.value * 1.1);
    for (const o of this.list) {
      const dc = o.pos.distanceTo(L.p);
      if (o.state === 'perch') this.perched(o, dt, player, dc, night);
      else this.flight(o, dt, player);
      o.root.visible = dc < cull;
      if (o.root.visible) this.animate(o, dt);
      o.root.rotation.y = o.heading;
    }
  }

  perched(o, dt, player, dc, night) {
    const S = o.S;
    o.st += dt;
    o.seen = null;
    let dP = Infinity;
    if (player) {
      const dx = player.pos.x - o.pos.x, dz = player.pos.z - o.pos.z, h = Math.hypot(dx, dz);
      dP = Math.hypot(h, (o.pos.y - player.pos.y - 1) * 0.6);
      o.seen = { dx, dz, h, dy: o.pos.y + S.size * 0.8 - (player.pos.y + 1.6) };
    }
    const run = player && player.speed > 4.5 ? 1.35 : 1;
    if (dP < S.alert * run) {
      o.alert = Math.min(1, o.alert + dt * 2);
      if (!o.warned && o.st > 1) { o.warned = true; this.say(o, 'alert'); }
    } else {
      o.alert = Math.max(0, o.alert - dt * 0.4);
      if (dP > S.alert * 1.6) o.warned = false;
    }
    // vira para o lado aberto depois de pousar, ou para o jogador quando ele passa por trás
    if (o.face === null && o.alert > 0.3 && Math.abs(o.head.ty) > 2.1) o.face = o.heading + o.head.ty * 0.75;
    if (o.face !== null && o.st > 0.8) {
      const d = wrapA(o.face - o.heading), k = Math.min(1, dt * 4);
      o.heading += d * k; o.head.yaw -= d * k;
      if (Math.abs(d) < 0.05) o.face = null;
    }
    if (o.flushT === null && dP < S.flush * run) o.flushT = 0.08 + Math.random() * 0.3;
    if (o.flushT !== null) {
      o.flushT -= dt;
      if (o.flushT <= 0) { this.takeoff(o, o.threat || (player ? player.pos : null)); return; }
    }
    // canto: mais à noite; calada quando desconfiada
    o.callT -= dt * (0.35 + night * 0.65);
    if (o.callT <= 0) {
      o.callT = lerp(S.every[0], S.every[1], Math.random());
      if (o.alert < 0.2 && dc < S.hear && this.voiceCd <= 0) { this.say(o, 'song'); this.voiceCd = 2.5 + Math.random() * 3; }
    }
  }

  takeoff(o, threat) {
    const p = o.perch;
    if (p) p.owl = null;
    o.perch = null;
    // para longe da ameaça, puxando para o lado aberto do poleiro
    let ang = threat ? Math.atan2(o.pos.x - threat.x, o.pos.z - threat.z) : o.heading;
    if (p) ang += wrapA(p.h - ang) * 0.3;
    ang += (Math.random() - 0.5) * 0.7;
    o.flee.set(Math.sin(ang), 0, Math.cos(ang));
    o.vel.set(o.flee.x * 2.5, p?.kind === 'ground' ? 2.6 : 0.3, o.flee.z * 2.5);
    o.state = 'takeoff'; o.st = 0; o.flushT = null; o.face = null;
    o.target = this.choose(o, o.pos, threat);
    if (o.target) o.target.owl = o;
    this.say(o, 'flush');
    this.say(o, 'wings');
    o.threat = null;
  }

  retarget(o, threat) {
    if (o.target) o.target.owl = null;
    o.target = this.choose(o, o.pos, threat);
    if (o.target) o.target.owl = o;
    o.state = 'cruise'; o.st = 2.5;
  }

  flight(o, dt, player) {
    const ter = this.ctx.terrain, T = o.target, P = o.pos, V = o.vel;
    o.st += dt;
    const gy = Math.max(ter.heightAt(P.x, P.z), ter.heightAt(P.x + V.x * 1.5, P.z + V.z * 1.5));
    let tx, ty, tz, sp = 8, k = 1.8, line = false;
    if (o.state === 'takeoff') {
      // arranca batendo forte e ganha altura
      tx = P.x + o.flee.x * 10; tz = P.z + o.flee.z * 10; ty = P.y + 3; sp = 5.5; k = 2.2;
      if (o.st > 0.9) { o.state = 'cruise'; o.st = 0; }
    } else if (o.state === 'cruise') {
      if (!T) {
        // nenhum poleiro livre: segue fugindo e procura de novo
        tx = P.x + o.flee.x * 30; tz = P.z + o.flee.z * 30; ty = gy + 14;
        if (o.st > 4) this.retarget(o, null);
      } else {
        // primeiro foge, depois faz a curva até um ponto 12 m à frente do poleiro, mais alto
        const ax = T.x + T.out[0] * 12, az = T.z + T.out[1] * 12, ay = T.y + 4;
        const fl = clamp(1 - o.st / 2.5, 0, 1);
        tx = lerp(ax, P.x + o.flee.x * 25, fl); tz = lerp(az, P.z + o.flee.z * 25, fl);
        ty = Math.max(gy + 12, ay);
        if (fl === 0 && Math.hypot(ax - P.x, az - P.z) < 6) { o.state = 'approach'; o.st = 0; }
        else if (o.st > 35) this.retarget(o, null);
      }
    } else if (o.state === 'approach') {
      tx = T.x; ty = T.y; tz = T.z; line = true;
      const d = Math.hypot(tx - P.x, ty - P.y, tz - P.z);
      sp = clamp(d * 0.75, 1.2, 7); k = 3.2;
      if (d < 0.45 || o.st > 12) { o.state = 'land'; o.st = 0; }
      // o jogador está no poleiro: desiste e procura outro
      else if (player && Math.hypot(player.pos.x - T.x, player.pos.z - T.z) < o.S.flush * 1.3) { this.retarget(o, player.pos); return; }
    } else if (o.state === 'land') {
      // assenta e fecha as asas
      const e = 1 - Math.exp(-9 * dt);
      P.x += (T.x - P.x) * e; P.y += (T.y - P.y) * e; P.z += (T.z - P.z) * e;
      V.multiplyScalar(Math.exp(-10 * dt));
      if (o.st > 0.55) this.seat(o, T, o.heading);
      return;
    }
    const dx = tx - P.x, dy = ty - P.y, dz = tz - P.z;
    let vx, vy, vz;
    if (line) { const d = Math.hypot(dx, dy, dz) || 1; vx = dx / d * sp; vy = dy / d * sp; vz = dz / d * sp; }
    else { const h = Math.hypot(dx, dz) || 1; vx = dx / h * sp; vz = dz / h * sp; vy = clamp(dy * 0.9, -3, 3.2); }
    V.x = damp(V.x, vx, k, dt); V.y = damp(V.y, vy, k * 1.2, dt); V.z = damp(V.z, vz, k, dt);
    P.addScaledVector(V, dt);
    // nunca abaixo do chão (só descendo para pousar)
    const floor = ter.heightAt(P.x, P.z) + (o.state === 'approach' ? 0 : 1.2);
    if (P.y < floor) { P.y = floor; if (V.y < 0) V.y = 0; }
    // rumo pela velocidade e inclinação nas curvas
    if (Math.hypot(V.x, V.z) > 0.4) {
      const turn = wrapA(Math.atan2(V.x, V.z) - o.heading) * Math.min(1, dt * 7);
      o.heading += turn;
      o.bank = damp(o.bank, clamp((turn / Math.max(dt, 1e-3)) * 0.22, -0.75, 0.75), 4, dt);
    }
  }

  animate(o, dt) {
    const S = o.S, st = o.state, perched = st === 'perch';
    // postura: em pé pousada, deitada voando; no pouso, freia em pé com as asas abertas
    let pitchT = 0.1 + o.alert * 0.06, openT = 0, ampT = 0;
    if (st === 'takeoff') { pitchT = lerp(0.6, 1.3, Math.min(1, o.st / 0.5)); openT = 1; ampT = 1.05; }
    else if (st === 'cruise') {
      o.cycle -= dt;
      if (o.cycle <= 0) { o.flapping = !o.flapping; o.cycle = o.flapping ? 1.2 + Math.random() * 0.8 : 0.8 + Math.random() * 0.8; }
      pitchT = 1.42 - clamp(o.vel.y * 0.08, -0.25, 0.3); openT = 1; ampT = o.flapping || o.vel.y > 0.5 ? 0.72 : 0;
    } else if (st === 'approach') {
      const T = o.target, d = Math.hypot(T.x - o.pos.x, T.y - o.pos.y, T.z - o.pos.z);
      pitchT = lerp(0.35, 1.35, clamp(d / 8, 0, 1)); openT = 1; ampT = d < 4 ? 0.95 : 0.3;
    } else if (st === 'land') { pitchT = 0.25; openT = clamp(1 - o.st / 0.45, 0, 1); ampT = o.st < 0.25 ? 0.8 : 0; }
    o.pitch = damp(o.pitch, pitchT, 7, dt);
    o.open = damp(o.open, openT, openT > o.open ? 10 : 6, dt);
    o.amp = damp(o.amp, ampT, 6, dt);
    o.ph += dt * TAU * S.freq * (ampT > 0.9 ? 1.25 : 1);
    if (perched) o.bank = damp(o.bank, 0, 6, dt);
    // asas: dobradas no flanco <-> abertas batendo (a ponta atrasa um pouco)
    const ko = smooth(clamp(o.open, 0, 1));
    const flap = o.amp * Math.sin(o.ph) + 0.14 * ko, wflap = o.amp * 0.55 * Math.sin(o.ph - 0.9);
    const sweep = 0.1 + o.amp * 0.09 * (1 - Math.cos(o.ph));
    for (const w of o.wings) {
      _qa.setFromAxisAngle(AZ, w.side * flap); _qb.setFromAxisAngle(AY, w.side * sweep);
      _q.copy(Q_FLIGHT).multiply(_qa).multiply(_qb);
      w.sh.quaternion.slerpQuaternions(w.qFold, _q, ko);
      w.sh.scale.setScalar(lerp(0.3, 1, ko));
      w.sh.visible = ko > 0.02;
      w.wr.rotation.set(0, 0, w.side * wflap * ko);
      w.wr.scale.x = lerp(0.1, 1, ko);
    }
    // corpo: respira; desconfiada, fica fina e alta (a buraqueira sobe e desce)
    o.breath += dt * 1.6;
    const br = Math.sin(o.breath) * 0.012, sl = perched ? o.alert : 0;
    o.bodyJ.rotation.set(o.pitch, -o.bank * ko, 0);
    o.bodyJ.scale.set(1 + br - 0.07 * sl, 1 - br * 0.5 + 0.05 * sl, 1 + br - 0.07 * sl);
    let bob = 0;
    if (S.bob && perched && o.alert > 0.3) { o.bobT += dt; bob = -Math.abs(Math.sin(o.bobT * 6.5)) * 0.05 * o.alert * (Math.sin(o.bobT * 0.9) > -0.3 ? 1 : 0); }
    o.bodyJ.position.y = S.legH + 0.3 + bob;
    // cabeça: segue o jogador aos trancos (gira até 135° para cada lado); sem ele, olha em volta
    const H = o.head;
    if (perched) {
      H.next -= dt;
      if (H.next <= 0) {
        if (o.seen && o.seen.h < 45) {
          H.ty = clamp(wrapA(Math.atan2(o.seen.dx, o.seen.dz) - o.heading), -2.35, 2.35);
          H.tp = clamp(Math.atan2(o.seen.dy, o.seen.h), -0.4, 0.9);
          H.next = 0.2 + Math.random() * 0.45;
          H.tt = Math.random() < 0.08 ? (Math.random() - 0.5) * 0.9 : H.tt * 0.6;
        } else {
          H.ty = (Math.random() - 0.5) * 3.2; H.tp = Math.random() * 0.5 - 0.15;
          H.tt = Math.random() < 0.25 ? (Math.random() - 0.5) * 0.7 : 0;
          H.next = 1.2 + Math.random() * 3.5;
        }
      }
    } else { H.ty = 0; H.tp = 0; H.tt = 0; H.next = 0; }
    H.yaw = damp(H.yaw, H.ty, 16, dt); H.pitch = damp(H.pitch, H.tp, 12, dt); H.tilt = damp(H.tilt, H.tt, 8, dt);
    // voando, a cabeça compensa o corpo deitado e olha para a frente
    o.headJ.rotation.set(H.pitch - o.pitch * (perched ? 1 : 0.9) + (perched ? 0.1 : 0), H.yaw, H.tilt);
    // pisca
    o.blinkT -= dt;
    if (o.blinkT < 0) o.blinkT = 2 + Math.random() * 6;
    o.eyeJ.scale.y = o.blinkT < 0.12 ? 0.15 : 1;
  }

  // voz da coruja no lugar dela (what: song | alert | flush | wings)
  say(o, what) {
    const A = this.audio;
    if (!A?.ctx || !A.white || !A.ambience || A.paused) return;
    const L = this.listener, dx = o.pos.x - L.p.x, dy = o.pos.y - L.p.y, dz = o.pos.z - L.p.z;
    const d = Math.hypot(dx, dy, dz), range = what === 'wings' ? 30 : o.S.hear;
    if (d > range) return;
    const out = spatial(A, d, (dx * L.right.x + dz * L.right.z) / (Math.hypot(dx, dz) || 1), range);
    VOICES[o.kind][what](A, out, A.ctx.currentTime + 0.02 + d / 340);
  }
}
