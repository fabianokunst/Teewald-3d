import * as THREE from 'three';
import { MeshBuilder, geometryFromBuilder } from '../engine/builder.js';
import { signMaterial, M as MATS } from '../engine/materials.js';
import { ps1Material } from '../engine/ps1material.js';
import { TEX } from '../engine/textures.js';

// Modelos low poly dos itens: na mão, na prévia do inventário e no chão.
// Usam a textura clara 'carPaint' com a cor nos vértices (aço, madeira, latão).
// Armas de fogo em coordenadas próprias: cano para +z, alça de mira para +y,
// origem no topo da empunhadura (onde a mão segura).
// Armas brancas: cabo na origem e haste para +y (sai do punho, como um porrete na mão).

export const PISTOL_POINTS = {
  muzzle: [0, 0.019, 0.156],
  eject: [-0.016, 0.027, 0.03],   // janela de ejeção, lado direito (-x)
};

// boca do cano e janela de ejeção de cada arma
export const GUN_POINTS = {
  pistol: PISTOL_POINTS,
  shotgun: { muzzle: [0, 0.03, 0.66], eject: [0, 0.04, 0.02] },
  revolver: { muzzle: [0, 0.03, 0.2], eject: null },
  raygun: { muzzle: [0, 0.035, 0.24], eject: null },
  dartgun: { muzzle: [0, 0.035, 0.62], eject: null },
  lantern: { muzzle: [0, -0.05, 0.16], eject: null },
  dynamite: { muzzle: [0, 0.12, 0.02], eject: null },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// hexaedro a partir de 4 cantos de baixo e 4 de cima (mesma ordem); faces viradas para fora
function hexa(B, mat, bot, top, uvs = 24) {
  const c = [0, 1, 2].map(i => [...bot, ...top].reduce((s, p) => s + p[i], 0) / 8);
  const face = (a, b, cc, d) => {
    const n = cross(sub(b, a), sub(cc, a));
    const m = [0, 1, 2].map(i => (a[i] + b[i] + cc[i] + d[i]) / 4);
    const uv = p => [(p[0] + p[2]) * uvs, (p[1] + p[2] * 0.5) * uvs];
    if (dot(n, sub(m, c)) >= 0) B.quad(mat, a, b, cc, d, [uv(a), uv(b), uv(cc), uv(d)]);
    else B.quad(mat, a, d, cc, b, [uv(a), uv(d), uv(cc), uv(b)]);
  };
  face(bot[0], bot[1], bot[2], bot[3]);
  face(top[0], top[1], top[2], top[3]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; face(bot[i], bot[j], top[j], top[i]); }
}

// caixa alinhada; inset estreita o topo em x (chanfro do ferrolho)
function block(B, mat, x0, x1, y0, y1, z0, z1, inset = 0) {
  hexa(B, mat,
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0 + inset, y1, z0], [x1 - inset, y1, z0], [x1 - inset, y1, z1], [x0 + inset, y1, z1]]);
}

// cilindro (prisma) entre dois pontos quaisquer; r1 = raio na ponta b
function rod(B, mat, a, b, r, sides = 6, r1 = r, caps = true) {
  const ax = norm(sub(b, a));
  const e1 = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(ax, e1);
  const ring = (c, rr, k) => { const t = (k / sides) * Math.PI * 2; return add(c, add(mul(e1, Math.cos(t) * rr), mul(e2, Math.sin(t) * rr))); };
  for (let k = 0; k < sides; k++) {
    const p0 = ring(a, r, k), p1 = ring(a, r, k + 1), q0 = ring(b, r1, k), q1 = ring(b, r1, k + 1);
    const u0 = k / sides, u1 = (k + 1) / sides;
    B.quad(mat, p1, p0, q0, q1, [[u1, 0], [u0, 0], [u0, 1], [u1, 1]]);
    if (caps) {
      B.tri(mat, a, p0, p1, [0.5, 0.5], [0, 0], [1, 0]);
      if (r1 > 0) B.tri(mat, b, q1, q0, [0.5, 0.5], [0, 0], [1, 0]);
    }
  }
}

// pedra irregular (icosaedro amassado)
function rock(B, mat, cx, cy, cz, r, seed = 1) {
  const g = new THREE.IcosahedronGeometry(r, 0), p = g.getAttribute('position');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const map = new Map();
  const V = i => {
    const k = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(3)).join();
    if (!map.has(k)) map.set(k, 0.75 + rnd() * 0.4);
    const f = map.get(k);
    return [cx + p.getX(i) * f, cy + p.getY(i) * f * 0.75, cz + p.getZ(i) * f];
  };
  for (let i = 0; i < p.count; i += 3) B.tri(mat, V(i), V(i + 1), V(i + 2), [0, 0], [1, 0], [0, 1]);
}

function glow(name, color) {
  const key = 'item:' + name;
  if (!MATS[key]) MATS[key] = ps1Material({ map: TEX.carPaint, lit: false, color });
  return key;
}

// ---------- armas de fogo ----------
function pistol(B) {
  B.col = [0.36, 0.37, 0.4];
  block(B, 'carPaint', -0.013, 0.013, 0, 0.032, -0.046, 0.152, 0.003);          // ferrolho
  B.col = [0.24, 0.24, 0.26];
  block(B, 'carPaint', -0.0115, 0.0115, -0.014, 0, 0.018, 0.134);               // armação
  B.col = [0.13, 0.12, 0.12];
  hexa(B, 'carPaint',                                                            // empunhadura inclinada
    [[-0.0145, -0.108, -0.072], [0.0145, -0.108, -0.072], [0.0145, -0.108, -0.03], [-0.0145, -0.108, -0.03]],
    [[-0.0135, -0.004, -0.046], [0.0135, -0.004, -0.046], [0.0135, -0.004, 0.002], [-0.0135, -0.004, 0.002]]);
  B.col = [0.28, 0.28, 0.3];
  block(B, 'carPaint', -0.016, 0.016, -0.116, -0.106, -0.076, -0.026);          // base do carregador
  block(B, 'carPaint', -0.004, 0.004, -0.042, -0.035, -0.002, 0.046);           // guarda-mato
  block(B, 'carPaint', -0.004, 0.004, -0.042, -0.012, 0.04, 0.047);
  B.col = [0.18, 0.18, 0.19];
  block(B, 'carPaint', -0.0028, 0.0028, -0.031, -0.012, 0.012, 0.02);           // gatilho
  block(B, 'carPaint', -0.008, 0.008, 0.032, 0.039, -0.044, -0.034);            // alça de mira
  block(B, 'carPaint', -0.0025, 0.0025, 0.032, 0.04, 0.138, 0.146);             // massa de mira
  // boca do cano e janela de ejeção escuras
  B.col = [0.03, 0.03, 0.03];
  B.quad('carPaint', [-0.005, 0.012, 0.1525], [0.005, 0.012, 0.1525], [0.005, 0.025, 0.1525], [-0.005, 0.025, 0.1525]);
  B.quad('carPaint', [-0.0131, 0.018, 0.012], [-0.0131, 0.018, 0.05], [-0.0131, 0.03, 0.05], [-0.0131, 0.03, 0.012]);
  B.col = [1, 1, 1];
}

// espingarda de dois canos lado a lado, coronha de madeira
function shotgun(B) {
  B.col = [0.2, 0.2, 0.22];
  for (const x of [-0.013, 0.013]) rod(B, 'carPaint', [x, 0.03, 0.06], [x, 0.03, 0.66], 0.0135, 7);
  B.col = [0.03, 0.03, 0.03];
  for (const x of [-0.013, 0.013]) B.quad('carPaint', [x - 0.008, 0.022, 0.6605], [x + 0.008, 0.022, 0.6605], [x + 0.008, 0.038, 0.6605], [x - 0.008, 0.038, 0.6605]);
  B.col = [0.28, 0.27, 0.27];
  block(B, 'carPaint', -0.022, 0.022, 0.0, 0.048, -0.04, 0.08);                 // báscula
  block(B, 'carPaint', -0.004, 0.004, 0.044, 0.05, 0.6, 0.62);                  // massa de mira
  B.col = [0.42, 0.24, 0.12];
  hexa(B, 'carPaint',                                                            // telha (sob os canos)
    [[-0.02, 0.0, 0.1], [0.02, 0.0, 0.1], [0.02, 0.0, 0.36], [-0.02, 0.0, 0.36]],
    [[-0.024, 0.02, 0.1], [0.024, 0.02, 0.1], [0.024, 0.02, 0.36], [-0.024, 0.02, 0.36]]);
  hexa(B, 'carPaint',                                                            // coronha
    [[-0.018, -0.03, -0.04], [0.018, -0.03, -0.04], [0.02, -0.11, -0.38], [-0.02, -0.11, -0.38]],
    [[-0.018, 0.035, -0.04], [0.018, 0.035, -0.04], [0.022, 0.01, -0.38], [-0.022, 0.01, -0.38]]);
  B.col = [0.12, 0.08, 0.06];
  block(B, 'carPaint', -0.023, 0.023, -0.115, 0.015, -0.392, -0.376);           // soleira
  B.col = [0.18, 0.18, 0.19];
  block(B, 'carPaint', -0.003, 0.003, -0.03, -0.005, 0.0, 0.012);               // gatilhos
  block(B, 'carPaint', -0.003, 0.003, -0.03, -0.005, 0.022, 0.032);
  B.col = [1, 1, 1];
}

// revólver: tambor, cano curto, cabo de madeira
function revolver(B) {
  B.col = [0.5, 0.5, 0.54];
  rod(B, 'carPaint', [0, 0.03, 0.06], [0, 0.03, 0.2], 0.009, 6);                 // cano
  block(B, 'carPaint', -0.004, 0.004, 0.039, 0.046, 0.18, 0.195);               // massa
  block(B, 'carPaint', -0.012, 0.012, 0.0, 0.045, -0.03, 0.065);                // armação
  B.col = [0.42, 0.42, 0.46];
  rod(B, 'carPaint', [0, 0.025, 0.0], [0, 0.025, 0.055], 0.021, 6);              // tambor
  B.col = [0.38, 0.22, 0.12];
  hexa(B, 'carPaint',
    [[-0.014, -0.095, -0.07], [0.014, -0.095, -0.07], [0.014, -0.095, -0.035], [-0.014, -0.095, -0.035]],
    [[-0.013, 0.0, -0.04], [0.013, 0.0, -0.04], [0.013, 0.0, -0.005], [-0.013, 0.0, -0.005]]);
  B.col = [0.2, 0.2, 0.22];
  block(B, 'carPaint', -0.003, 0.003, -0.03, -0.004, 0.012, 0.022);
  block(B, 'carPaint', -0.003, 0.003, 0.044, 0.056, -0.04, -0.028);             // cão
  B.col = [1, 1, 1];
}

// pistola de raios: corpo bojudo de metal escuro, bobina verde acesa
function raygun(B) {
  const G = glow('green', 0x7dff6a);
  B.col = [0.3, 0.33, 0.3];
  rod(B, 'carPaint', [0, 0.03, -0.05], [0, 0.03, 0.08], 0.03, 8, 0.036);
  rod(B, 'carPaint', [0, 0.03, 0.08], [0, 0.03, 0.2], 0.036, 8, 0.016);
  B.col = [0.55, 0.6, 0.55];
  for (const z of [0.1, 0.13, 0.16]) rod(B, 'carPaint', [0, 0.03, z], [0, 0.03, z + 0.012], 0.04 - (z - 0.1) * 0.25, 8);
  B.col = [1, 1, 1];
  rod(B, G, [0, 0.03, 0.2], [0, 0.03, 0.245], 0.012, 6);
  rod(B, G, [0, 0.07, -0.02], [0, 0.07, 0.07], 0.008, 5);
  B.col = [0.22, 0.24, 0.22];
  hexa(B, 'carPaint',
    [[-0.014, -0.1, -0.06], [0.014, -0.1, -0.06], [0.014, -0.1, -0.03], [-0.014, -0.1, -0.03]],
    [[-0.016, 0.0, -0.035], [0.016, 0.0, -0.035], [0.016, 0.0, 0.0], [-0.016, 0.0, 0.0]]);
  B.col = [1, 1, 1];
}

// rifle de dardos: cano fino comprido, coronha de madeira e um dardo vermelho
function dartgun(B) {
  B.col = [0.22, 0.23, 0.25];
  rod(B, 'carPaint', [0, 0.035, 0.05], [0, 0.035, 0.62], 0.01, 6);
  block(B, 'carPaint', -0.016, 0.016, 0.0, 0.05, -0.06, 0.12);
  rod(B, 'carPaint', [0, 0.075, -0.02], [0, 0.075, 0.12], 0.012, 6);            // luneta
  B.col = [0.5, 0.32, 0.16];
  hexa(B, 'carPaint',
    [[-0.016, -0.03, -0.06], [0.016, -0.03, -0.06], [0.018, -0.1, -0.36], [-0.018, -0.1, -0.36]],
    [[-0.016, 0.03, -0.06], [0.016, 0.03, -0.06], [0.02, 0.01, -0.36], [-0.02, 0.01, -0.36]]);
  hexa(B, 'carPaint',
    [[-0.015, -0.005, 0.12], [0.015, -0.005, 0.12], [0.015, -0.005, 0.4], [-0.015, -0.005, 0.4]],
    [[-0.017, 0.025, 0.12], [0.017, 0.025, 0.12], [0.017, 0.025, 0.4], [-0.017, 0.025, 0.4]]);
  B.col = [0.85, 0.15, 0.12];
  rod(B, 'carPaint', [0.03, 0.05, -0.02], [0.03, 0.05, 0.06], 0.006, 4, 0.0);
  B.col = [1, 1, 1];
}

// lampião de querosene: base, globo de vidro aceso, chapéu e alça (a mão segura a alça)
function lantern(B) {
  const Y = glow('flame', 0xffd27a);
  const o = [0, -0.2, 0.13];
  const at = (x, y, z) => [o[0] + x, o[1] + y, o[2] + z];
  B.col = [0.55, 0.12, 0.1];
  rod(B, 'carPaint', at(0, 0, 0), at(0, 0.05, 0), 0.06, 8, 0.065);             // tanque
  B.col = [1, 1, 1];
  rod(B, Y, at(0, 0.05, 0), at(0, 0.14, 0), 0.045, 8, 0.05);                    // globo
  B.col = [0.2, 0.2, 0.2];
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4, x = Math.cos(a) * 0.055, z = Math.sin(a) * 0.055; rod(B, 'carPaint', at(x, 0.05, z), at(x, 0.15, z), 0.004, 3); }
  B.col = [0.55, 0.12, 0.1];
  rod(B, 'carPaint', at(0, 0.14, 0), at(0, 0.18, 0), 0.055, 8, 0.02);          // chapéu
  B.col = [0.25, 0.25, 0.25];
  rod(B, 'carPaint', at(-0.05, 0.15, 0), [0, 0, 0], 0.004, 3);                  // alça até a mão
  rod(B, 'carPaint', at(0.05, 0.15, 0), [0, 0, 0], 0.004, 3);
  B.col = [1, 1, 1];
}

// dinamite: três bananas amarradas e o pavio
function dynamite(B) {
  B.col = [0.72, 0.16, 0.12];
  for (const [x, z] of [[-0.016, 0], [0.016, 0], [0, 0.026]]) rod(B, 'carPaint', [x, -0.08, z], [x, 0.1, z], 0.016, 6);
  B.col = [0.85, 0.82, 0.7];
  for (const y of [-0.04, 0.06]) rod(B, 'carPaint', [-0.04, y, 0.009], [0.04, y, 0.009], 0.03, 6, 0.03, false);
  B.col = [0.15, 0.12, 0.1];
  rod(B, 'carPaint', [0, 0.1, 0.01], [0.02, 0.15, 0.0], 0.003, 3);
  B.col = [1, 1, 1];
}

// ---------- munição e consumíveis ----------
function labelBox(B, text, sub, bg, fg, x = 0.05, y = 0.055, z = 0.035) {
  const label = signMaterial(text, { bg, fg, w: 64, h: 32, sub, borderColor: fg });
  B.col = [0.64, 0.5, 0.26];
  B.quad('flat', [-x, 0, z], [x, 0, z], [x, 0, -z], [-x, 0, -z]);
  B.quad('flat', [x, 0, z], [x, 0, -z], [x, y, -z], [x, y, z]);
  B.quad('flat', [-x, 0, -z], [-x, 0, z], [-x, y, z], [-x, y, -z]);
  B.col = [0.85, 0.85, 0.85];
  B.quad('flat', [x, 0, -z], [-x, 0, -z], [-x, y, -z], [x, y, -z]);
  B.col = [1, 1, 1];
  B.quad(label, [-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z]);
  B.quad(label, [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [[0, 0.15], [1, 0.15], [1, 0.85], [0, 0.85]]);
}

const ammoBox = B => labelBox(B, '9MM', 'CARTUCHOS', '#6b5524', '#f2dc96');
const shells = B => labelBox(B, 'CAL. 12', 'CHUMBO', '#7a1c16', '#f2dcb0', 0.055, 0.05, 0.04);
const silver = B => labelBox(B, 'PRATA', '.38', '#2a2e38', '#d8dce6', 0.04, 0.045, 0.03);
const darts = B => labelBox(B, 'DARDOS', 'SEDATIVO', '#2f5a2a', '#e6f0d0', 0.06, 0.04, 0.03);

function oil(B) {
  B.col = [0.62, 0.14, 0.1];
  block(B, 'carPaint', -0.06, 0.06, 0, 0.16, -0.035, 0.035);
  B.col = [0.75, 0.7, 0.6];
  rod(B, 'carPaint', [0.03, 0.16, 0], [0.05, 0.2, 0], 0.012, 5);
  B.col = [0.3, 0.3, 0.3];
  rod(B, 'carPaint', [-0.04, 0.16, 0], [-0.04, 0.19, 0], 0.006, 3, 0.006, false);
  rod(B, 'carPaint', [-0.04, 0.19, 0], [0.0, 0.19, 0], 0.006, 3, 0.006, false);
  B.col = [1, 1, 1];
}

function cuca(B) {
  B.col = [0.82, 0.62, 0.32];
  block(B, 'carPaint', -0.1, 0.1, 0, 0.05, -0.07, 0.07);
  B.col = [0.95, 0.85, 0.55];
  for (let i = 0; i < 9; i++) block(B, 'carPaint', -0.09 + (i % 3) * 0.065, -0.06 + (i % 3) * 0.065, 0.05, 0.065, -0.06 + Math.floor(i / 3) * 0.045, -0.035 + Math.floor(i / 3) * 0.045);
  B.col = [0.45, 0.1, 0.3];
  for (const [x, z] of [[-0.05, 0.02], [0.04, -0.03], [0.02, 0.04]]) block(B, 'carPaint', x, x + 0.025, 0.05, 0.07, z, z + 0.02);
  B.col = [1, 1, 1];
}

function cha(B) {
  B.col = [0.2, 0.42, 0.28];
  rod(B, 'carPaint', [0, 0, 0], [0, 0.22, 0], 0.04, 8);
  B.col = [0.75, 0.75, 0.72];
  rod(B, 'carPaint', [0, 0.22, 0], [0, 0.26, 0], 0.035, 8, 0.03);
  B.col = [0.9, 0.82, 0.4];
  block(B, 'carPaint', -0.042, 0.042, 0.08, 0.13, -0.042, 0.042);
  B.col = [1, 1, 1];
}

// ---------- itens da história ----------
function crossItem(B) {
  B.col = [0.22, 0.2, 0.2];
  block(B, 'carPaint', -0.02, 0.02, -0.25, 0.2, -0.012, 0.012);
  block(B, 'carPaint', -0.13, 0.13, 0.04, 0.08, -0.012, 0.012);
  B.col = [0.38, 0.22, 0.14];
  for (const [x, y] of [[0, 0.2], [0, -0.25], [-0.13, 0.06], [0.13, 0.06]]) block(B, 'carPaint', x - 0.028, x + 0.028, y - 0.015, y + 0.015, -0.016, 0.016);
  B.col = [1, 1, 1];
}
function medal(B) {
  B.col = [0.85, 0.72, 0.3];
  rod(B, 'carPaint', [0, 0, -0.004], [0, 0, 0.004], 0.025, 10);
  B.col = [0.7, 0.7, 0.7];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI, b = (i + 1) / 8 * Math.PI; rod(B, 'carPaint', [Math.cos(a) * 0.04, 0.025 + Math.sin(a) * 0.06, 0], [Math.cos(b) * 0.04, 0.025 + Math.sin(b) * 0.06, 0], 0.002, 3); }
  B.col = [1, 1, 1];
}
function shoe(B) {
  B.col = [0.72, 0.08, 0.08];
  hexa(B, 'carPaint', [[-0.03, 0, -0.1], [0.03, 0, -0.1], [0.035, 0, 0.1], [-0.035, 0, 0.1]], [[-0.03, 0.05, -0.1], [0.03, 0.05, -0.1], [0.02, 0.02, 0.1], [-0.02, 0.02, 0.1]]);
  B.col = [0.3, 0.06, 0.05];
  block(B, 'carPaint', -0.012, 0.012, 0, 0.06, -0.1, -0.08);               // salto
  B.col = [0.2, 0.15, 0.12];
  block(B, 'carPaint', -0.031, 0.031, 0.045, 0.052, -0.095, -0.02);        // chamuscado
  B.col = [1, 1, 1];
}
function card(B) {
  B.col = [0.92, 0.88, 0.74];
  block(B, 'carPaint', -0.045, 0.045, 0, 0.003, -0.07, 0.07);
  B.col = [0.5, 0.2, 0.15];
  for (let i = 0; i < 5; i++) block(B, 'carPaint', -0.035, 0.035, 0.003, 0.004, -0.05 + i * 0.022, -0.046 + i * 0.022);
  B.col = [1, 1, 1];
}
function keyItem(B) {
  B.col = [0.5, 0.42, 0.28];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2; rod(B, 'carPaint', [Math.cos(a) * 0.025, 0, 0.08 + Math.sin(a) * 0.025], [Math.cos(b) * 0.025, 0, 0.08 + Math.sin(b) * 0.025], 0.005, 4); }
  rod(B, 'carPaint', [0, 0, 0.055], [0, 0, -0.06], 0.006, 4);
  block(B, 'carPaint', 0, 0.025, -0.006, 0.006, -0.06, -0.045);
  block(B, 'carPaint', 0, 0.018, -0.006, 0.006, -0.035, -0.025);
  B.col = [1, 1, 1];
}
function silverware(B) {
  B.col = [0.78, 0.8, 0.84];
  rod(B, 'carPaint', [0, 0, 0], [0, 0.02, 0], 0.05, 8, 0.04);
  rod(B, 'carPaint', [0, 0.02, 0], [0, 0.2, 0], 0.012, 6, 0.008);
  rod(B, 'carPaint', [0, 0.2, 0], [0, 0.23, 0], 0.03, 8, 0.012);
  B.col = [1, 1, 1];
}
function crystal(B) {
  const G = glow('crystal', 0x8dff9a);
  B.col = [1, 1, 1];
  rod(B, G, [0, 0, 0], [0, 0.06, 0], 0.03, 5, 0.035);
  rod(B, G, [0, 0.06, 0], [0, 0.13, 0], 0.035, 5, 0.0);
}
function diary(B) {
  B.col = [0.35, 0.16, 0.1];
  block(B, 'carPaint', -0.07, 0.07, 0, 0.03, -0.1, 0.1);
  B.col = [0.9, 0.86, 0.72];
  block(B, 'carPaint', -0.066, 0.072, 0.004, 0.026, -0.096, 0.096);
  B.col = [1, 1, 1];
}

// ---------- armas brancas e de arremesso (cabo na origem, haste para +y) ----------
function pau(B) {
  B.col = [0.4, 0.28, 0.17];
  rod(B, 'carPaint', [0, -0.08, 0], [0.01, 0.35, 0.005], 0.022, 6, 0.028);
  rod(B, 'carPaint', [0.01, 0.35, 0.005], [-0.005, 0.68, 0.01], 0.028, 6, 0.034);
  B.col = [0.3, 0.2, 0.12];
  rod(B, 'carPaint', [0.01, 0.4, 0.0], [0.07, 0.48, 0.0], 0.01, 4, 0.004);
  B.col = [1, 1, 1];
}
function cano(B) {
  B.col = [0.45, 0.42, 0.4];
  rod(B, 'carPaint', [0, -0.1, 0], [0, 0.66, 0], 0.02, 7);
  B.col = [0.35, 0.3, 0.26];
  rod(B, 'carPaint', [0, 0.62, 0], [0, 0.7, 0], 0.028, 7);
  rod(B, 'carPaint', [0, 0.7, 0], [0.06, 0.74, 0], 0.025, 7);
  B.col = [1, 1, 1];
}
function pa(B) {
  B.col = [0.5, 0.35, 0.2];
  rod(B, 'carPaint', [0, -0.15, 0], [0, 0.72, 0], 0.017, 6);
  B.col = [0.3, 0.2, 0.12];
  block(B, 'carPaint', -0.05, 0.05, -0.17, -0.14, -0.015, 0.015);
  B.col = [0.42, 0.43, 0.45];
  hexa(B, 'carPaint', [[-0.1, 0.72, -0.008], [0.1, 0.72, -0.008], [0.1, 0.72, 0.008], [-0.1, 0.72, 0.008]], [[-0.08, 0.98, 0.004], [0.08, 0.98, 0.004], [0.08, 0.98, 0.016], [-0.08, 0.98, 0.016]]);
  B.col = [1, 1, 1];
}
function foice(B) {
  B.col = [0.45, 0.3, 0.17];
  rod(B, 'carPaint', [0, -0.08, 0], [0, 0.5, 0], 0.018, 6);
  B.col = [0.55, 0.56, 0.6];
  let prev = [0, 0.5, 0];
  for (let i = 1; i <= 6; i++) {
    const a = i / 6 * 2.2, p = [Math.sin(a) * 0.22, 0.5 + (1 - Math.cos(a)) * 0.1 + Math.sin(a) * 0.12, 0];
    hexa(B, 'carPaint', [[prev[0], prev[1], -0.004], [p[0], p[1], -0.004], [p[0], p[1] - 0.04 * (1 - i / 7), -0.004], [prev[0], prev[1] - 0.04 * (1 - (i - 1) / 7), -0.004]],
      [[prev[0], prev[1], 0.004], [p[0], p[1], 0.004], [p[0], p[1] - 0.04 * (1 - i / 7), 0.004], [prev[0], prev[1] - 0.04 * (1 - (i - 1) / 7), 0.004]]);
    prev = p;
  }
  B.col = [1, 1, 1];
}
function machado(B) {
  B.col = [0.5, 0.33, 0.18];
  rod(B, 'carPaint', [0, -0.1, 0], [0, 0.6, 0], 0.02, 6);
  B.col = [0.4, 0.41, 0.44];
  hexa(B, 'carPaint', [[-0.03, 0.5, -0.016], [0.03, 0.5, -0.016], [0.03, 0.62, -0.016], [-0.03, 0.62, -0.016]], [[-0.03, 0.5, 0.016], [0.03, 0.5, 0.016], [0.03, 0.62, 0.016], [-0.03, 0.62, 0.016]]);
  hexa(B, 'carPaint', [[0.03, 0.51, -0.01], [0.17, 0.46, -0.003], [0.17, 0.68, -0.003], [0.03, 0.61, -0.01]], [[0.03, 0.51, 0.01], [0.17, 0.46, 0.003], [0.17, 0.68, 0.003], [0.03, 0.61, 0.01]]);
  B.col = [1, 1, 1];
}
function pedra(B) { B.col = [0.55, 0.53, 0.5]; rock(B, 'carPaint', 0, 0.05, 0, 0.065, 3); B.col = [1, 1, 1]; }
function tijolo(B) { B.col = [0.7, 0.36, 0.24]; block(B, 'carPaint', -0.05, 0.05, 0, 0.055, -0.1, 0.1); B.col = [1, 1, 1]; }

const BUILDERS = {
  pistol, ammo9: ammoBox, shotgun, shells, revolver, silver, raygun, dartgun, darts, lantern, oil, dynamite,
  cuca, cha, cross: crossItem, medal, shoe, card, key: keyItem, silverware, crystal, diary,
  pau, cano, pa, foice, machado, pedra, tijolo,
};

// THREE.Group com uma malha por material
export function makeItemModel(id, M = MATS) {
  const B = new MeshBuilder(0);
  (BUILDERS[id] || diary)(B);
  const g = new THREE.Group();
  for (const mat of new Set([...B.groups.values()].map(x => x.mat))) {
    const mesh = new THREE.Mesh(geometryFromBuilder(B, mat), M[mat] || MATS[mat]);
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}
