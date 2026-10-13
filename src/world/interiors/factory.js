import * as THREE from 'three';
import { MeshBuilder } from '../../engine/builder.js';
import { M } from '../../engine/materials.js';
import { ps1Material } from '../../engine/ps1material.js';
import { makeCanvas, canvasTex, signTexture } from '../../engine/textures.js';
import { sampler, paint, finish, mul, tint } from '../../engine/archTextures.js';
import { solid, floorBox } from '../interiors.js';
import { rng } from '../geo.js';

// Fábrica de calçados de Teewald (anos 70/80), abandonada depois do incêndio:
// portaria com relógio de ponto, salão de costura e montagem, escritório do
// capataz com janela para o salão, almoxarifado e caldeira com o vestiário
// queimado. Chove lá fora; relâmpagos clareiam as janelas altas quebradas.
// Este arquivo também exporta o "kit" de montagem usado pela cripta e pela gruta.

// ---------------------------------------------------------------------------
// kit: geometria em coordenadas locais (relativas à origem do interior)
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { sub, add, scl, crs, nrm };
export const UV1 = [[0, 0], [1, 0], [1, 1], [0, 1]];

// eixos perpendiculares a uma direção
function basis(d) {
  const up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const ax = nrm(crs(up, d));
  return [ax, crs(d, ax)];
}

export function makeKit(ctx, B, o) {
  const ox = o.x, oy = o.y, oz = o.z;
  const W = p => [ox + p[0], oy + p[1], oz + p[2]];
  const K = { ctx, B, o, W };
  K.box = (mat, x, y, z, sx, sy, sz, rot = 0, op = {}) => B.box(mat, ox + x, oy + y, oz + z, sx, sy, sz, rot, op);
  K.solid = (mat, x, y, z, sx, sy, sz, rot = 0, op = {}) => solid(ctx, B, mat, ox + x, oy + y, oz + z, sx, sy, sz, rot, op);
  K.hit = (x, z, hx, hz, rot, y0, y1, cam = false) => ctx.collision.addBox(ox + x, oz + z, hx, hz, rot, oy + y0, oy + y1, { cam });
  K.round = (x, z, r, y0, y1, cam = false) => ctx.collision.addCircle(ox + x, oz + z, r, oy + y0, oy + y1, { cam });
  K.walk = (x, z, hx, hz, y, rot = 0) => floorBox(ctx, ox + x, oz + z, hx, hz, oy + y, rot);
  // rampa caminhável: altura ya em -hz e yb em +hz (eixo z local da caixa)
  K.ramp = (x, z, hx, hz, rot, ya, yb) => ctx.collision.addBox(ox + x, oz + z, hx, hz, rot, oy + Math.min(ya, yb) - 0.5, oy + Math.max(ya, yb), { walk: true, cam: false, ramp: [oy + ya, oy + yb] });
  K.quad = (mat, a, b, c, d, uv = UV1, cols = null, seg = 0) => B.quad(mat, W(a), W(b), W(c), W(d), uv, cols, seg);
  K.quadOut = (mat, a, b, c, d, out, uv = UV1, cols = null) => B.quadOut(mat, W(a), W(b), W(c), W(d), out, uv, cols);
  K.tri = (mat, a, b, c, ua = [0, 0], ub = [1, 0], uc = [0.5, 1], ca, cb, cc) => B.tri(mat, W(a), W(b), W(c), ua, ub, uc, ca, cb, cc);
  // triângulo virado para "out"
  K.triOut = (mat, a, b, c, out, ua = [0, 0], ub = [1, 0], uc = [0.5, 1], ca, cb, cc) => {
    const n = crs(sub(b, a), sub(c, a));
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) K.tri(mat, a, c, b, ua, uc, ub, ca, cc, cb);
    else K.tri(mat, a, b, c, ua, ub, uc, ca, cb, cc);
  };
  K.cyl = (mat, x, y, z, r0, r1, h, sides = 6, op = {}) => B.cylinder(mat, ox + x, oy + y, oz + z, r0, r1, h, sides, op);
  K.poly = (mat, pts, y, us = 2, yFn = null) => B.polygon(mat, pts.map(p => [ox + p[0], oz + p[1]]), oy + y, us, yFn ? (x, z) => oy + yFn(x - ox, z - oz) : null);
  // piso (normal para cima) e teto (normal para baixo), uv em metros locais
  K.floor = (mat, x0, z0, x1, z1, y, us = 2, cols = null, seg = 2) =>
    K.quad(mat, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [[x0 / us, z0 / us], [x0 / us, z1 / us], [x1 / us, z1 / us], [x1 / us, z0 / us]], cols && [cols[0], cols[3], cols[2], cols[1]], seg);
  K.ceil = (mat, x0, z0, x1, z1, y, us = 2, cols = null, seg = 2) =>
    K.quad(mat, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [[x0 / us, z0 / us], [x1 / us, z0 / us], [x1 / us, z1 / us], [x0 / us, z1 / us]], cols, seg);
  // quadro vertical centrado em (cx, cz), base em y, virado para (sen rot, cos rot)
  K.face = (mat, cx, y, cz, w, h, rot, uv = UV1, cols = null) => {
    const c = Math.cos(rot), s = Math.sin(rot), rx = c * w / 2, rz = -s * w / 2;
    K.quad(mat, [cx - rx, y, cz - rz], [cx + rx, y, cz + rz], [cx + rx, y + h, cz + rz], [cx - rx, y + h, cz - rz], uv, cols);
  };
  // face de parede de (x0,z0) a (x1,z1), normal à direita do sentido, uv contínuo
  K.wface = (mat, x0, z0, x1, z1, y0, y1, us = 2, u0 = 0, cols = null, seg = 2) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    K.quad(mat, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [[u0, y0 / us], [u0 + len / us, y0 / us], [u0 + len / us, y1 / us], [u0, y1 / us]], cols, seg);
  };
  // caixa orientada (eixos ax, ay, az unitários), centro c; skip = faces omitidas ('-y', '+y-y'...)
  K.obox = (mat, c, ax, ay, az, sx, sy, sz, col = null, us = 1, skip = '-y') => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const P = (i, j, k) => [c[0] + ax[0] * i * hx + ay[0] * j * hy + az[0] * k * hz, c[1] + ax[1] * i * hx + ay[1] * j * hy + az[1] * k * hz, c[2] + ax[2] * i * hx + ay[2] * j * hy + az[2] * k * hz];
    const cols = col ? [col, col, col, col] : null;
    const F = (key, a, b, cc, d, out, su, sv) => { if (!skip.includes(key)) K.quadOut(mat, a, b, cc, d, out, [[0, 0], [su, 0], [su, sv], [0, sv]], cols); };
    F('+x', P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), ax, sz / us, sy / us);
    F('-x', P(-1, -1, 1), P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), scl(ax, -1), sz / us, sy / us);
    F('+z', P(1, -1, 1), P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1), az, sx / us, sy / us);
    F('-z', P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), scl(az, -1), sx / us, sy / us);
    F('+y', P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), ay, sx / us, sz / us);
    F('-y', P(-1, -1, 1), P(1, -1, 1), P(1, -1, -1), P(-1, -1, -1), scl(ay, -1), sx / us, sz / us);
  };
  // viga de a até b (seção w x h)
  K.beam = (mat, a, b, w, h, col = null, us = 1, skip = '') => {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]), az = scl(d, 1 / len);
    const [ax, ay] = basis(az);
    K.obox(mat, scl(add(a, b), 0.5), ax, ay, az, w, h, len, col, us, skip);
  };
  // prisma / cone de a (raio r0) até b (raio r1)
  K.prism = (mat, a, b, r0, r1, sides = 6, col = null, cap = false, us = 1, twist = 0) => {
    const d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]), az = scl(d, 1 / len);
    const [ax, ay] = basis(az);
    const ring = (c, r, i) => { const t = (i / sides) * Math.PI * 2 + twist; return add(c, add(scl(ax, Math.cos(t) * r), scl(ay, Math.sin(t) * r))); };
    const cols = col ? [col, col, col, col] : null;
    for (let i = 0; i < sides; i++) {
      const t = ((i + 0.5) / sides) * Math.PI * 2 + twist, out = add(scl(ax, Math.cos(t)), scl(ay, Math.sin(t)));
      const u0 = (i / sides) * us, u1 = ((i + 1) / sides) * us;
      K.quadOut(mat, ring(a, r0, i), ring(a, r0, i + 1), ring(b, r1, i + 1), ring(b, r1, i), out, [[u0, 0], [u1, 0], [u1, len / us], [u0, len / us]], cols);
    }
    if (cap) for (const [c, r, out] of [[a, r0, scl(az, -1)], [b, r1, az]]) {
      if (r <= 0 || (cap === 'b' && c === a) || (cap === 'a' && c === b)) continue;
      for (let i = 0; i < sides; i++) K.triOut(mat, c, ring(c, r, i), ring(c, r, i + 1), out, [0.5, 0.5], [0, 0], [1, 0], col, col, col);
    }
  };
  // quadro 3D (posição + guinada, arfagem, rolagem) para montar objetos inclinados
  K.frame = (x, y, z, yaw = 0, pitch = 0, roll = 0) => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')).elements;
    const ax = [m[0], m[1], m[2]], ay = [m[4], m[5], m[6]], az = [m[8], m[9], m[10]];
    const D = (lx, ly, lz) => [ax[0] * lx + ay[0] * ly + az[0] * lz, ax[1] * lx + ay[1] * ly + az[1] * lz, ax[2] * lx + ay[2] * ly + az[2] * lz];
    const P = (lx, ly, lz) => add([x, y, z], D(lx, ly, lz));
    const F = {
      P, D, ax, ay, az,
      // caixa com base em ly (opcional: giro a em torno do eixo y local)
      box: (mat, lx, ly, lz, sx, sy, sz, col = null, us = 1, skip = '-y', a = 0) => {
        let bx = ax, bz = az;
        if (a) { const c = Math.cos(a), s = Math.sin(a); bx = add(scl(ax, c), scl(az, -s)); bz = add(scl(ax, s), scl(az, c)); }
        K.obox(mat, P(lx, ly + sy / 2, lz), bx, ay, bz, sx, sy, sz, col, us, skip);
      },
      beam: (mat, a, b, w, h, col, us, skip) => K.beam(mat, P(...a), P(...b), w, h, col, us, skip),
      prism: (mat, a, b, r0, r1, sides, col, cap, us, twist) => K.prism(mat, P(...a), P(...b), r0, r1, sides, col, cap, us, twist),
      // quadro no plano XY local, virado para +z local
      face: (mat, lx, ly, lz, w, h, uv = UV1, col = null) => {
        const cols = col ? [col, col, col, col] : null;
        K.quadOut(mat, P(lx - w / 2, ly, lz), P(lx + w / 2, ly, lz), P(lx + w / 2, ly + h, lz), P(lx - w / 2, ly + h, lz), az, uv, cols);
      },
    };
    return F;
  };
  // parede de (x0,z0) a (x1,z1) com espessura t e vãos [a, b, base, topo] (distâncias ao longo dela).
  // A = lado direito do sentido, B = lado esquerdo: { mat, band, bandMat, col, us }
  K.wallRun = (x0, z0, x1, z1, y0, y1, op = {}) => {
    const t = op.t ?? 0.3, L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    const nx = -dz, nz = dx;
    const holes = (op.holes || []).slice().sort((p, q) => p[0] - q[0]);
    const pieces = [];
    let u = 0;
    for (const [a, b, bot, top] of holes) {
      if (a > u) pieces.push([u, a, y0, y1]);
      if (top < y1) pieces.push([a, b, top, y1]);
      if (bot > y0) pieces.push([a, b, y0, bot]);
      u = b;
    }
    if (u < L) pieces.push([u, L, y0, y1]);
    const pt = (uu, s) => [x0 + dx * uu + nx * s, z0 + dz * uu + nz * s];
    const shade = (S, v) => { const k = v < (S.band || 1.4) ? 0.6 + 0.4 * Math.min(1, (v - y0) / (S.band || 1.4)) : 1; return (S.col || [1, 1, 1]).map(c => c * k); };
    const side = (S, sgn, u0, u1, v0, v1) => {
      if (!S) return;
      const us = S.us || 2;
      const [ax, az] = sgn > 0 ? pt(u0, t / 2) : pt(u1, -t / 2);
      const [bx, bz] = sgn > 0 ? pt(u1, t / 2) : pt(u0, -t / 2);
      const uu = (sgn > 0 ? u0 : L - u1) / us;
      const cuts = [v0];
      if (S.band && S.band > v0 && S.band < v1) cuts.push(S.band);
      cuts.push(v1);
      for (let i = 0; i < cuts.length - 1; i++) {
        const va = cuts[i], vb = cuts[i + 1], mat = S.band && va < S.band ? S.bandMat : S.mat;
        const ca = shade(S, va), cb = shade(S, vb);
        K.wface(mat, ax, az, bx, bz, va, vb, us, uu, [ca, ca, cb, cb], 2);
      }
    };
    for (const [u0, u1, v0, v1] of pieces) {
      side(op.A, 1, u0, u1, v0, v1);
      side(op.B, -1, u0, u1, v0, v1);
      if (!op.noCol) { const [cx, cz] = pt((u0 + u1) / 2, 0); K.hit(cx, cz, (u1 - u0) / 2, t / 2, Math.atan2(-dz, dx), v0, v1, op.cam !== false); }
    }
    // espessura nos vãos (batentes, verga e peitoril)
    const rm = op.reveal || (op.A || op.B).mat, rc = op.revealCol || [0.7, 0.68, 0.64];
    const rcs = [rc, rc, rc, rc];
    for (const [a, b, bot, top] of holes) {
      const p1 = pt(a, t / 2), p2 = pt(a, -t / 2), q1 = pt(b, -t / 2), q2 = pt(b, t / 2);
      K.wface(rm, p1[0], p1[1], p2[0], p2[1], bot, top, 1, 0, rcs, 0);
      K.wface(rm, q1[0], q1[1], q2[0], q2[1], bot, top, 1, 0, rcs, 0);
      const corners = y => [[p1[0], y, p1[1]], [q2[0], y, q2[1]], [q1[0], y, q1[1]], [p2[0], y, p2[1]]];
      if (top < y1) { const c = corners(top); K.quadOut(rm, c[0], c[1], c[2], c[3], [0, -1, 0], [[0, 0], [(b - a), 0], [(b - a), t], [0, t]], rcs); }
      if (bot > y0) { const c = corners(bot); K.quadOut(rm, c[0], c[1], c[2], c[3], [0, 1, 0], [[0, 0], [(b - a), 0], [(b - a), t], [0, t]], rcs); }
    }
  };
  return K;
}

// peça animada: monta com um MeshBuilder próprio em volta da origem e devolve um grupo-pivô
export function part(ctx, fn, x = 0, y = 0, z = 0) {
  const b = new MeshBuilder(0);
  fn(makeKit(ctx, b, { x: 0, y: 0, z: 0 }));
  const g = b.build(M), pivot = new THREE.Group();
  pivot.add(g);
  pivot.position.set(x, y, z);
  return pivot;
}

// sonda invisível: guarda a câmera do jogo quando a cena é desenhada (para saber em que sala o jogador está)
export function cameraProbe(onCam) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  m.frustumCulled = false;
  m.onBeforeRender = (r, s, cam) => onCam(cam);
  return m;
}

// ---------------------------------------------------------------------------
// texturas: utilidades
// ---------------------------------------------------------------------------
export const hash = (a, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// fonte de pixels 3x5 (maiúsculas, dígitos e alguns sinais)
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111101101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101101111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
  9: '010101011001110', '-': '000000111000000', '.': '000000000000010', '/': '001001010100100', ':': '000010000010000',
  '*': '000101010101000', '+': '010111010010010', '!': '010010010000010', ' ': '000000000000000',
};
const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export function pixText(g, text, x, y, color, s = 1) {
  g.fillStyle = color;
  let cx = x;
  for (const ch of plain(text)) {
    const f = FONT[ch];
    if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(cx + (i % 3) * s, y + Math.floor(i / 3) * s, s, s);
    cx += 4 * s;
  }
}
export const pixW = (text, s = 1) => plain(text).length * 4 * s - s;

// textura com alfa suave (decalques, fumaça, brilho); f(x, y) → [r, g, b, a]
export function softTex(w, h, f, repeat = false) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y), i = (y * w + x) * 4;
    img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = Math.max(0, Math.min(255, v[3]));
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c, repeat);
}

// material aditivo (brilho de lâmpada, feixes de luz)
export function glowMat(map, color = [1, 1, 1], o = {}) {
  const m = ps1Material({ map, lit: false, transparent: true, depthWrite: false, color: new THREE.Color(...color), side: THREE.DoubleSide, affine: false, ...o });
  m.blending = THREE.AdditiveBlending;
  return m;
}
// decalque escuro (fuligem, manchas) com alfa suave
export function decalMat(map, color = [1, 1, 1], o = {}) {
  return ps1Material({ map, transparent: true, depthWrite: false, polygonOffset: -2, color: new THREE.Color(...color), affine: false, ...o });
}

// textura recortada (alfa binário) que repete
export function finishRep(c) {
  const t = finish(c, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export const lightK = (l, t) => {
  if (!l.flicker) return 1;
  const n = Math.sin(t * 13 + l.x) * Math.sin(t * 7.3 + l.z * 3) + Math.sin(t * 31 + l.x * 2) * 0.3;
  return n > 0.7 - l.flicker * 0.6 ? 1 : n < -0.6 ? 0.05 : 0.85;
};

// mancha redonda (brilho no chão)
export const poolTex = () => softTex(32, 32, (x, y) => {
  const r = Math.min(1, Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 16);
  return [255, 255, 255, Math.pow(1 - r, 2.2) * 255];
});
// chuva: riscos verticais que rolam
export const rainTex = () => softTex(32, 64, (x, y) => {
  if (hash(x, 11) > 0.42) return [200, 210, 225, 0];
  const len = 9 + hash(x, 12) * 22, d = (((y - hash(x, 13) * 64) % 64) + 64) % 64;
  return [205, 215, 230, d < len ? (d / len) * 190 : 0];
}, true);

// ---------------------------------------------------------------------------
// texturas da fábrica (desenhadas; pedra, metal e madeira vêm da pasta)
// ---------------------------------------------------------------------------
function makeMats() {
  if (M['int:f:clock']) return;
  const met = sampler('metalWhite'), mg = sampler('metalGray'), wood = sampler('woodDark'), plank = sampler('woodPlank');

  // relógio de ponto: mostrador parado em 23:47, cartão na fenda, plaqueta PONTO
  {
    const ang = h => -Math.PI / 2 + h * Math.PI * 2;
    const aH = ang((11 + 47 / 60) / 12), aM = ang(47 / 60);
    const hand = (dx, dy, a, len, w) => { const c = Math.cos(a), s = Math.sin(a), t = dx * c + dy * s; return t > -1 && t < len && Math.abs(dx * s - dy * c) < w; };
    const c = paint(32, 48, (x, y) => {
      let col = tint(met(x, y), [0.82, 0.8, 0.7]);
      if (x === 0 || y === 0) col = mul(col, 1.18); else if (x === 31 || y === 47) col = mul(col, 0.6);
      const dx = x + 0.5 - 16, dy = y + 0.5 - 14, r = Math.hypot(dx, dy);
      if (r < 12.5) {
        if (r > 11) return [34, 32, 30];
        let v = [214, 210, 196];
        const a = Math.atan2(dy, dx);
        for (let i = 0; i < 12; i++) {
          const d = Math.abs((((a - ang(i / 12)) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
          if (r > 8.2 && r < 10.4 && d * r < (i % 3 ? 0.55 : 1.0)) v = [28, 26, 24];
        }
        if (hand(dx, dy, aH, 6, 0.9) || hand(dx, dy, aM, 9.2, 0.6) || r < 1.3) v = [24, 22, 20];
        if ((((x - y) % 13) + 13) % 13 < 2 && r < 10) v = mul(v, 1.12);
        return mul(v, 0.9 + 0.1 * (1 - r / 12));
      }
      if (x >= 9 && x <= 22 && y >= 27 && y <= 31) return y === 27 ? [176, 42, 36] : [212, 200, 164];
      if (x >= 8 && x <= 23 && y >= 32 && y <= 34) return [14, 12, 10];
      if (x >= 5 && x <= 26 && y >= 38 && y <= 44) return (x === 5 || x === 26 || y === 38 || y === 44) ? [96, 90, 80] : [30, 30, 34];
      return col;
    });
    pixText(c.getContext('2d'), 'PONTO', 7, 39, '#c8c0a0');
    M['int:f:clock'] = ps1Material({ map: finish(c), affine: false });
  }

  // porta-cartões: duas colunas de dez bolsos, cartões faltando e queimados
  M['int:f:cards'] = ps1Material({
    affine: false, map: finish(paint(32, 64, (x, y) => {
      const m = mul(mg(x, y), 0.8);
      if (x < 2 || x > 29 || y < 2 || y > 61) return mul(m, x === 0 || y === 0 ? 1.3 : 0.9);
      if (x === 15 || x === 16) return mul(m, 0.7);
      const row = Math.floor((y - 2) / 6), ry = (y - 2) % 6, ci = x < 15 ? 0 : 1, cx = ci ? x - 17 : x - 2;
      if (ry >= 3) return mul(m, ry === 3 ? 1.25 : 0.95);
      const h = hash(row, ci + 5);
      if (h < 0.2) return [18, 16, 14];
      if (cx < 1 || cx > 11) return [24, 22, 20];
      let card = [206, 196, 160];
      if (ry === 0) card = ci ? [150, 46, 40] : [56, 76, 132];
      if (ry === 2 && cx > 2 && cx < 9 && (cx + row) % 3) card = [90, 84, 70];
      if (h > 0.8) card = mul(card, ry === 0 ? 0.22 : 0.45);
      return card;
    })),
  });

  // quadro de avisos: cortiça com aviso, escala de turno, foto e calendário
  {
    const c = paint(64, 40, (x, y) => {
      if (x < 2 || x > 61 || y < 2 || y > 37) return mul(wood(x, y), x === 0 || y === 0 ? 1.2 : 0.85);
      const n = hash(x, y) * 30;
      return [140 + n, 102 + n * 0.8, 62 + n * 0.5];
    });
    const g = c.getContext('2d');
    const sheet = (x, y, w, h, col = '#d8d0b8') => { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 1, y + 1, w, h); g.fillStyle = col; g.fillRect(x, y, w, h); };
    const lines = (x, y, w, n, col = '#6a6458') => { g.fillStyle = col; for (let i = 0; i < n; i++) g.fillRect(x, y + i * 2, w - ((i * 7) % 5), 1); };
    sheet(5, 5, 19, 22); pixText(g, 'AVISO', 6, 6, '#9a1a14'); lines(6, 13, 17, 7);
    sheet(27, 4, 15, 15, '#e4dcc4'); pixText(g, 'OUT', 29, 5, '#7a1410');
    g.fillStyle = '#5a5248'; for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) g.fillRect(29 + j * 2.4, 11 + i * 2, 1, 1);
    g.fillStyle = '#b01810'; g.fillRect(33, 12, 3, 1); g.fillRect(33, 14, 3, 1); g.fillRect(32, 13, 1, 1); g.fillRect(36, 13, 1, 1);
    sheet(45, 6, 14, 11, '#c4ccbc'); lines(46, 8, 12, 4);
    sheet(26, 22, 13, 12, '#7c7a72');
    g.fillStyle = '#2a2824'; for (let i = 0; i < 4; i++) { g.fillRect(28 + i * 3, 27, 2, 5); g.fillRect(28 + i * 3, 25, 2, 2); }
    sheet(42, 20, 17, 14, '#ddd4b0'); pixText(g, 'TURNO', 43, 21, '#2a2a2a');
    g.fillStyle = '#7a7468'; for (let i = 0; i < 4; i++) g.fillRect(43, 27 + i * 2, 15, 1); for (let j = 0; j < 4; j++) g.fillRect(46 + j * 4, 27, 1, 7);
    for (const [px, py, col] of [[14, 5, '#c02020'], [34, 4, '#2040c0'], [52, 6, '#20a040'], [32, 22, '#c0c020'], [50, 20, '#c02020']]) { g.fillStyle = col; g.fillRect(px, py, 2, 2); }
    M['int:f:board'] = ps1Material({ map: finish(c), affine: false });
  }

  // fuligem subindo da base (decalque)
  const soot = softTex(64, 64, (x, y) => {
    const yb = 63 - y, T = Math.PI * 2 / 64;
    const h = 30 + 14 * Math.sin(x * T * 3) + 9 * Math.sin(x * T * 7 + 1) + 5 * Math.sin(x * T * 13 + 2);
    let a = Math.min(1, Math.max(0, (h - yb) / 22 + 0.3)) * (0.75 + 0.25 * hash(x, y));
    return [10, 8, 7, a * 235];
  }, true);
  M['int:f:soot'] = decalMat(soot, [1, 1, 1], { side: THREE.DoubleSide });
  // mancha de óleo e marca de queimado no chão
  M['int:f:stain'] = decalMat(softTex(32, 32, (x, y) => {
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 15 + Math.sin(Math.atan2(y - 16, x - 16) * 5) * 0.08 + hash(x, y) * 0.08;
    return [14, 12, 10, r < 1 ? (1 - r * r) * 170 : 0];
  }));
  M['int:f:scorch'] = decalMat(softTex(64, 64, (x, y) => {
    const a = Math.atan2(y - 32, x - 32), r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 31 + Math.sin(a * 7) * 0.07 + Math.sin(a * 3 + 1) * 0.06 + hash(x, y) * 0.1;
    const k = Math.max(0, 1 - r);
    return [24 + (1 - k) * 30, 16 + (1 - k) * 14, 10, Math.min(1, k * 2.2) * 245];
  }));
  // marcas de mãos sujas de fuligem (alguém tentou sair)
  M['int:f:hands'] = decalMat(softTex(64, 64, (x, y) => {
    const prints = [[18, 20, -0.3], [40, 30, 0.2], [26, 46, -0.1], [48, 52, 0.5]];
    let a = 0;
    for (const [cx, cy, r] of prints) {
      const c = Math.cos(r), s = Math.sin(r), dx = (x - cx) * c - (y - cy) * s, dy = (x - cx) * s + (y - cy) * c;
      if ((dx / 4.6) ** 2 + ((dy - 2) / 5) ** 2 < 1) a = 1;
      for (const [fx, len] of [[-4, 6], [-1.6, 8], [1, 8.5], [3.4, 7], [6, 4]]) if (Math.abs(dx - fx - (fx > 5 ? (dy + 2) * -0.4 : 0)) < 1.1 && dy < -1 && dy > -2 - len) a = Math.max(a, 0.9);
      if (Math.abs(dx) < 3.5 && dy > 4 && dy < 4 + 10 * hash(Math.round(dx), cx) && hash(Math.round(dx) + 9, cy) < 0.5) a = Math.max(a, 0.5);
    }
    return [12, 9, 7, a * (0.7 + 0.3 * hash(x, y)) * 230];
  }), [1, 1, 1], { side: THREE.DoubleSide });
  M['int:f:pool'] = glowMat(poolTex());
  M['int:f:fireGlow'] = glowMat(M['int:f:pool'].uniforms.map.value, [0.5, 0.2, 0.05]);

  // janela basculante quebrada: caixilho de aço, vidro aramado sujo, cacos
  M['int:f:win'] = ps1Material({
    lit: false, cutout: true, side: THREE.DoubleSide, color: new THREE.Color(0.42, 0.44, 0.48), map: finishRep(paint(64, 64, (x, y) => {
      const bx = x % 16, by = y % 16;
      if (bx < 2 || by < 2 || x > 61 || y > 61) return mul([40, 44, 44], bx === 0 || by === 0 ? 1.3 : 0.75);
      const pi = Math.floor(x / 16), pj = Math.floor(y / 16), h = hash(pi + 7, pj + 3);
      if (h < 0.5) {
        const ex = Math.min(bx - 2, 15 - bx), ey = Math.min(by - 2, 15 - by), e = Math.min(ex, ey);
        const jag = 0.5 + 4.5 * hash(pi * 3 + Math.floor((bx + by * 0.7) / 2), pj * 5 + 1) * (h < 0.25 ? 1 : 0.4);
        if (e < jag) return [96 - e * 8, 110 - e * 8, 112 - e * 8];
        return null;
      }
      let v = [92, 104, 106];
      if ((bx + by) % 4 === 0) v = [64, 72, 74];
      if (Math.abs((bx - 2) - (by - 2) * 0.7 - h * 8) < 0.6) v = [150, 160, 162];
      return mul(v, 0.8 + 0.35 * (1 - by / 16));
    })),
  });
  // céu noturno de chuva (atrás das janelas)
  M['int:f:sky'] = ps1Material({
    lit: false, fog: false, color: new THREE.Color(0.5, 0.5, 0.5), map: finish(paint(32, 32, (x, y) => {
      const T = Math.PI * 2 / 32;
      const n = Math.sin(x * T * 2 + y * T) * 0.5 + Math.sin(x * T - y * T * 3) * 0.5 + hash(x, y) * 0.3;
      const v = 46 + n * 14 + y * 0.8;
      return [v * 0.72, v * 0.8, v];
    })),
  });
  M['int:f:rain'] = ps1Material({ map: rainTex(), lit: false, transparent: true, depthWrite: false, color: new THREE.Color(0.55, 0.6, 0.7), scroll: [0, 2.4], side: THREE.DoubleSide, affine: false });
  // feixe de luz da janela (relâmpago) e a grade da janela projetada no chão
  M['int:f:shaft'] = glowMat(softTex(16, 64, (x, y) => {
    const e = Math.sin(((x + 0.5) / 16) * Math.PI), f = Math.pow(1 - y / 63, 0.7);
    return [255, 255, 255, e * e * (1 - f * 0.85) * 150];
  }), [0, 0, 0]);
  M['int:f:patch'] = glowMat(softTex(64, 32, (x, y) => {
    const bx = x % 16, by = y % 8, bar = bx < 2 || by < 1;
    const e = Math.min(1, Math.min(x, 63 - x, y, 31 - y) / 3);
    return [255, 255, 255, bar ? 0 : e * 200 * (hash(Math.floor(x / 16), Math.floor(y / 8)) < 0.5 ? 1 : 0.75)];
  }), [0, 0, 0]);

  // couro (cor vem do vértice)
  M['int:f:leather'] = ps1Material({
    map: finish(paint(32, 32, (x, y) => {
      const T = Math.PI * 2 / 32;
      const n = hash(x, y) * 16 + Math.sin(x * T * 4 + Math.sin(y * T * 3) * 2) * 9;
      const v = 196 + n - ((x * 3 + y * 5) % 11 === 0 ? 26 : 0);
      return [v, v * 0.97, v * 0.93];
    })),
  });
  // caixa de sapato: papelão, tampa, etiqueta com o número e um sapato impresso
  {
    const c = paint(32, 16, (x, y) => {
      const n = hash(x, y) * 14;
      let v = [166 + n, 128 + n, 86 + n];
      if (y < 4) v = mul(v, 0.86);
      if (y === 4) v = mul(v, 0.55);
      if (x === 0 || x === 31 || y === 15) v = mul(v, 0.7);
      if (x >= 19 && x <= 29 && y >= 7 && y <= 13) v = (y === 9 || y === 11) && x > 20 && x < 28 ? [70, 66, 60] : [222, 216, 200];
      const sx = x - 3, sy = y - 8;
      if (sx >= 0 && sx < 13 && sy >= 0 && sy < 5 && (sy >= 3 || (sx < 4 && sy >= 0) || (sx >= 4 && sy >= 2 - (sx > 9 ? 1 : 0)))) v = [64, 40, 28];
      return v;
    });
    M['int:f:shoebox'] = ps1Material({ map: finish(c) });
  }
  // caixa de papelão grande com fita e setas
  {
    const c = paint(32, 32, (x, y) => {
      const n = hash(x, y) * 16;
      let v = [158 + n, 120 + n, 78 + n];
      if (x >= 14 && x <= 17) v = [190 + n * 0.5, 170 + n * 0.5, 120];
      if (x === 0 || y === 0 || x === 31 || y === 31) v = mul(v, 0.7);
      return v;
    });
    const g = c.getContext('2d');
    g.fillStyle = '#3a2a1c';
    for (const ax of [5, 23]) { g.fillRect(ax, 5, 1, 6); g.fillRect(ax - 1, 6, 3, 1); g.fillRect(ax - 2, 7, 5, 1); }
    pixText(g, 'TEEWALD', 3, 22, '#3a2a1c');
    M['int:f:carton'] = ps1Material({ map: finish(c) });
  }
  // lombadas de pastas (escritório)
  M['int:f:binders'] = ps1Material({
    map: finish(paint(64, 32, (x, y) => {
      const cols = [[110, 30, 26], [34, 44, 86], [40, 70, 46], [30, 30, 32], [120, 116, 106], [96, 64, 30]];
      let i = 0, x0 = 0;
      while (x0 + 5 + (hash(i, 3) * 4 | 0) <= x) { x0 += 5 + (hash(i, 3) * 4 | 0); i++; }
      const w = 5 + (hash(i, 3) * 4 | 0), lx = x - x0;
      if (lx === w - 1 || hash(i, 9) < 0.08) return [16, 14, 12];
      const top = 2 + (hash(i, 5) * 6 | 0);
      if (y < top) return [16, 14, 12];
      let v = cols[(hash(i, 7) * cols.length) | 0];
      if (y >= 8 && y <= 14 && lx >= 1 && lx <= w - 3) v = [210, 204, 186];
      if (y >= 22 && y <= 24 && lx >= 1 && lx <= w - 3) v = [20, 18, 16];
      return mul(v, lx === 0 ? 1.25 : 1);
    })),
  });
  // calendário OUT 1984 com o dia 12 marcado
  {
    const c = paint(32, 40, (x, y) => {
      const n = hash(x, y) * 14;
      if (y < 16) { // gravura: igreja contra o céu
        const sky = [70 + y * 3, 76 + y * 3, 90 + y * 2];
        const ch = (x >= 13 && x <= 18 && y >= 3) || (x >= 6 && x <= 25 && y >= 9) || (x >= 15 && x <= 16 && y >= 0);
        return ch ? [36, 32, 30] : sky;
      }
      return [222 + n * 0.3, 214 + n * 0.3, 190];
    });
    const g = c.getContext('2d');
    pixText(g, 'OUT 1984', 1, 17, '#7a1410');
    g.fillStyle = '#4a4440';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) g.fillRect(2 + j * 4, 25 + i * 3, 2, 1);
    g.fillStyle = '#b01810'; g.fillRect(9, 27, 5, 1); g.fillRect(9, 29, 5, 1); g.fillRect(8, 28, 1, 1); g.fillRect(14, 28, 1, 1);
    M['int:f:calendar'] = ps1Material({ map: finish(c), affine: false });
  }
  // cartaz de segurança: CUIDADO, mão sob a agulha
  {
    const c = paint(32, 48, (x, y) => {
      if (y < 5 || y > 42) return ((x + y) >> 2) % 2 ? [30, 28, 24] : [214, 170, 30];
      return [218, 210, 186];
    });
    const g = c.getContext('2d');
    pixText(g, 'CUIDADO', 2, 7, '#9a1a14');
    g.fillStyle = '#2a2826'; g.fillRect(8, 16, 16, 4); g.fillRect(20, 20, 3, 6); g.fillRect(21, 26, 1, 3);
    g.fillStyle = '#c8a07a'; g.fillRect(9, 30, 10, 5); for (let i = 0; i < 4; i++) g.fillRect(19, 30 + i, 3, 1);
    g.fillStyle = '#b01810'; for (let i = 0; i < 12; i++) { g.fillRect(10 + i, 24 + i, 2, 1); g.fillRect(21 - i, 24 + i, 2, 1); }
    M['int:f:poster'] = ps1Material({ map: finish(c), affine: false });
  }
  // armário de vestiário: aberturas de ventilação, puxador e plaqueta
  M['int:f:locker'] = ps1Material({
    map: finish(paint(32, 64, (x, y) => {
      const b = tint(mg(x, y), [0.7, 0.8, 0.76]);
      if (x === 0 || y === 0) return mul(b, 1.3);
      if (x === 31 || y === 63) return mul(b, 0.5);
      if ((y >= 6 && y <= 14 || y >= 50 && y <= 58) && x >= 8 && x <= 23) return y % 2 ? [20, 20, 20] : mul(b, 1.1);
      if (x >= 25 && x <= 26 && y >= 28 && y <= 36) return x === 25 ? [150, 150, 150] : [40, 40, 40];
      if (x >= 12 && x <= 19 && y >= 18 && y <= 22) return [200, 196, 180];
      return b;
    })),
  });
  // manômetro
  M['int:f:gauge'] = ps1Material({
    cutout: true, affine: false, map: finish(paint(16, 16, (x, y) => {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8, r = Math.hypot(dx, dy);
      if (r > 7.5) return null;
      if (r > 6.3) return [60, 58, 54];
      const a = Math.atan2(dy, dx);
      if (r > 4.6 && a > -0.6 && a < 0.6) return [170, 30, 26];
      const na = 2.5, t = dx * Math.cos(na) + dy * Math.sin(na);
      if (t > 0 && t < 5.5 && Math.abs(dx * Math.sin(na) - dy * Math.cos(na)) < 0.7) return [20, 20, 20];
      return [206, 200, 184];
    }), true),
  });
  // fogo da fornalha (rola para cima)
  M['int:f:fire'] = ps1Material({
    lit: false, scroll: [0, -0.9], color: new THREE.Color(1, 1, 1), map: finish(paint(32, 32, (x, y) => {
      const T = Math.PI * 2 / 32;
      const f = 0.5 + 0.25 * Math.sin(x * T * 3 + y * T * 2) + 0.25 * Math.sin(x * T * 5 - y * T * 4 + 1) + hash(x, y) * 0.2;
      return f > 0.8 ? [255, 220, 120] : f > 0.55 ? [240, 130, 30] : f > 0.35 ? [160, 50, 14] : [60, 14, 6];
    })),
  });
  // faixas de segurança amarelas e pretas
  M['int:f:hazard'] = ps1Material({ map: finish(paint(32, 8, (x, y) => (((x + y) >> 2) % 2 ? [24, 22, 20] : [190, 150, 30]))) });
  // esteira de borracha com nervuras (rola)
  M['int:f:belt'] = ps1Material({ scroll: [0, -0.5], map: finish(paint(16, 16, (x, y) => (y % 4 === 0 ? [20, 20, 20] : [44 + hash(x, y) * 10, 42, 40]))) });
  // persiana: lâminas, algumas faltando
  M['int:f:blinds'] = ps1Material({
    cutout: true, side: THREE.DoubleSide, map: finishRep(paint(32, 32, (x, y) => {
      if (x === 6 || x === 25) return [180, 176, 160];
      const slat = Math.floor(y / 3), ry = y % 3;
      if (ry === 2 || (hash(slat, 1) < 0.18 && x > 10 + hash(slat, 2) * 12)) return null;
      return mul([206, 198, 172], ry === 0 ? 1.08 : 0.82);
    })),
  });
  // vidro rachado (transparente)
  M['int:f:glass'] = ps1Material({
    lit: false, transparent: true, depthWrite: false, side: THREE.DoubleSide, affine: false, map: softTex(64, 32, (x, y) => {
      const cx = 22, cy = 12, a = Math.atan2(y - cy, x - cx), r = Math.hypot(x - cx, y - cy);
      if (r < 5 + hash(Math.floor(a * 4), 1) * 4) return [0, 0, 0, 0];
      const ray = Math.abs(Math.sin(a * 5 + 0.4)) < 0.05 + 0.4 / (r + 1);
      const ring = Math.abs(r - 13) < 0.5;
      return ray || ring ? [190, 200, 205, 120] : [60, 74, 82, 40];
    }),
  });
  // relógio de parede (redondo, parado)
  M['int:f:wclock'] = ps1Material({
    cutout: true, affine: false, map: finish(paint(32, 32, (x, y) => {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 16, r = Math.hypot(dx, dy);
      if (r > 15.5) return null;
      if (r > 13.5) return [60, 40, 30];
      const a = Math.atan2(dy, dx);
      for (let i = 0; i < 12; i++) { const t = -Math.PI / 2 + i * Math.PI / 6; if (r > 10 && r < 12.5 && Math.abs(Math.sin(a - t)) * r < 0.7 && Math.cos(a - t) > 0) return [30, 28, 26]; }
      const hand = (t, len) => { const c = Math.cos(t), s = Math.sin(t), p = dx * c + dy * s; return p > 0 && p < len && Math.abs(dx * s - dy * c) < 0.8; };
      if (hand(-Math.PI / 2 + (11.78 / 12) * Math.PI * 2, 7) || hand(-Math.PI / 2 + 0.783 * Math.PI * 2, 10.5)) return [24, 22, 20];
      return [214, 208, 190];
    }), true),
  });
  // mapa de Teewald (escritório)
  {
    const c = paint(48, 32, (x, y) => {
      const n = hash(x, y) * 10;
      if (x < 1 || y < 1 || x > 46 || y > 30) return [60, 44, 30];
      const river = Math.abs(y - (20 + Math.sin(x * 0.22) * 4)) < 1.2;
      if (river) return [80, 110, 130];
      const road = Math.abs(x - 24 - Math.sin(y * 0.3) * 2) < 0.6 || Math.abs(y - 11) < 0.6;
      if (road) return [190, 170, 130];
      const town = Math.hypot(x - 24, y - 12) < 7 && hash(x >> 1, y >> 1) < 0.4;
      return town ? [140, 110, 90] : [176 + n, 180 + n, 146 + n];
    });
    const g = c.getContext('2d');
    pixText(g, 'TEEWALD', 10, 25, '#3a2a1c');
    g.fillStyle = '#a01810'; g.fillRect(31, 6, 3, 1); g.fillRect(32, 5, 1, 3);
    M['int:f:map'] = ps1Material({ map: finish(c), affine: false });
  }
  // foto dos operários (sépia), um rosto riscado
  M['int:f:photo'] = ps1Material({
    affine: false, map: finish(paint(32, 24, (x, y) => {
      if (x < 2 || y < 2 || x > 29 || y > 21) return [200, 190, 160];
      const bg = [150 - y * 2, 128 - y * 2, 96 - y];
      for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
        const cx = 5 + i * 4.4 + row * 2, cy = 8 + row * 6;
        if (Math.hypot(x - cx, y - cy) < 1.5) return row === 1 && i === 3 ? [230, 220, 200] : [86, 64, 44];
        if (y > cy + 1 && y < cy + 7 && Math.abs(x - cx) < 1.8) return [52, 40, 30];
      }
      return bg;
    })),
  });
  // porta do cofre
  M['int:f:safe'] = ps1Material({
    map: finish(paint(32, 32, (x, y) => {
      const b = tint(mg(x, y), [0.5, 0.66, 0.54]);
      if (x < 2 || y < 2 || x > 29 || y > 29) return mul(b, 0.75);
      if (x === 2 || y === 2) return mul(b, 1.3);
      if (x >= 10 && x <= 21 && y >= 24 && y <= 26) return [176, 146, 70];
      return b;
    })),
  });
  // gaveteiro de aço (quatro gavetas)
  M['int:f:cabinet'] = ps1Material({
    map: finish(paint(16, 32, (x, y) => {
      const b = tint(mg(x, y), [0.82, 0.84, 0.86]);
      const dy = y % 8;
      if (dy === 0) return [26, 26, 28];
      if (dy === 1) return mul(b, 1.25);
      if (dy >= 3 && dy <= 4 && x >= 5 && x <= 10) return dy === 3 ? [190, 190, 186] : [60, 60, 60];
      if (dy === 6 && x >= 6 && x <= 9) return [200, 196, 180];
      return b;
    })),
  });
  // lâmpadas acesas (sem luz) e apagadas
  M['int:f:tubeDead'] = ps1Material({ color: new THREE.Color(0.5, 0.5, 0.52) });
  M['int:f:bulb'] = ps1Material({ lit: false, color: new THREE.Color(1.0, 0.86, 0.6) });
  M['int:f:deskLamp'] = ps1Material({ lit: false, color: new THREE.Color(1.0, 0.85, 0.5) });
  M['int:f:redLamp'] = ps1Material({ lit: false, color: new THREE.Color(0.9, 0.1, 0.06) });
  // placas
  const plate = (text, o) => ps1Material({ map: signTexture(text, o), affine: false });
  M['int:f:sName'] = plate('CALÇADOS TEEWALD', { w: 128, h: 24, bg: '#25332a', fg: '#d6c68e', borderColor: '#9c8a5a' });
  M['int:f:sCostura'] = plate('SETOR DE COSTURA', { w: 128, h: 20, bg: '#e2dccb', fg: '#26303a', borderColor: '#26303a' });
  M['int:f:sEscritorio'] = plate('ESCRITÓRIO', { w: 96, h: 20, bg: '#e2dccb', fg: '#26303a', borderColor: '#26303a' });
  M['int:f:sAlmox'] = plate('ALMOXARIFADO', { w: 112, h: 20, bg: '#e2dccb', fg: '#26303a', borderColor: '#26303a' });
  M['int:f:sCaldeira'] = plate('CALDEIRA', { w: 96, h: 20, bg: '#b8a020', fg: '#1a1a1a', borderColor: '#1a1a1a' });
  M['int:f:sPerigo'] = plate('PERIGO', { w: 64, h: 24, bg: '#a01812', fg: '#f0e8d0', borderColor: '#f0e8d0' });
  M['int:f:sFumar'] = plate('PROIBIDO FUMAR', { w: 112, h: 24, bg: '#f0ead8', fg: '#a01812', borderColor: '#a01812' });
  M['int:f:sEntrada'] = plate('ENTRADA', { w: 64, h: 16, bg: '#d8d0b8', fg: '#22406a', border: false });
  M['int:f:sSaidaCard'] = plate('SAÍDA', { w: 64, h: 16, bg: '#d8d0b8', fg: '#8a1a14', border: false });
  M['int:f:sSaida'] = ps1Material({ lit: false, affine: false, map: signTexture('SAÍDA', { w: 64, h: 24, bg: '#0e5a2a', fg: '#e0f4d8', borderColor: '#e0f4d8' }) });
  M['int:f:sCapataz'] = plate('CAPATAZ', { w: 64, h: 16, bg: '#b89a50', fg: '#1a1410', border: false });
}

// ---------------------------------------------------------------------------
// a fábrica
// ---------------------------------------------------------------------------
// planta (metros locais; x para leste, z para o fundo):
//   portaria   x 0..12  z 0..9      escritório x 0..12 z 9..18     almoxarifado x 0..12 z 18..30
//   salão      x 12..44 z 0..30 (menos a caldeira x 34..44 z 21..30)
const HH = 6.2, HR = 3.4, HS = 4.2;

export function build(ctx, B, o) {
  makeMats();
  const K = makeKit(ctx, B, o);
  const R = rng(1984);
  const objects = new THREE.Group();
  objects.name = 'interior:fabrica:pecas';
  const anim = [];
  const pt = (x, z, h = 0, y = 0) => ({ x: o.x + x, y: o.y + y, z: o.z + z, h });
  const gray = k => [k, k, k];
  const jit = (c, a = 0.08) => c.map(v => v * (1 - a + R() * a * 2));

  // ---------------- luzes ----------------
  const L = {
    entrada: { x: 6, y: 2.7, z: 4.5, col: [1.5, 1.15, 0.7], range: 10, flicker: 0.12 },
    escritorio: { x: 10.0, y: 1.3, z: 11.2, col: [1.7, 1.25, 0.62], range: 9.5 },
    salaoSO: { x: 21, y: 4.15, z: 4, col: [1.2, 1.4, 1.55], range: 15 },
    salaoSE: { x: 33, y: 4.15, z: 4, col: [1.3, 1.5, 1.65], range: 14, flicker: 0.45 },
    salaoC: { x: 27, y: 4.15, z: 14.5, col: [1.4, 1.6, 1.75], range: 17 },
    salaoNO: { x: 20.5, y: 3.9, z: 25, col: [1.2, 1.42, 1.6], range: 13, flicker: 0.85 },
    salaoL: { x: 39, y: 4.15, z: 14.5, col: [1.3, 1.5, 1.65], range: 15 },
    almox: { x: 5, y: 3.65, z: 23.75, col: [1.3, 1.5, 1.65], range: 12.5, flicker: 0.5 },
    caldeira: { x: 39.2, y: 0.95, z: 23.3, col: [2.2, 0.85, 0.28], range: 10, flicker: 0.3 },
    vestiario: { x: 37.5, y: 3.3, z: 21.8, col: [1.4, 0.16, 0.1], range: 8 },
  };
  const lights = [];
  for (const [name, l] of Object.entries(L)) {
    const w = { name, x: o.x + l.x, y: o.y + l.y, z: o.z + l.z, col: l.col.slice(), range: l.range, flicker: l.flicker || 0, base: l.col.slice() };
    L[name] = w; lights.push(w);
  }
  const lx = l => l.x - o.x, lz = l => l.z - o.z;
  // material das lâmpadas fluorescentes de cada luz (pisca junto) e brilho no chão
  const tubeMat = name => {
    const key = 'int:f:tube:' + name;
    if (!M[key]) M[key] = ps1Material({ lit: false, color: new THREE.Color(0.9, 0.97, 1.0) });
    return key;
  };
  const poolMat = (name, col, k = 0.09) => {
    const key = 'int:f:pool:' + name;
    if (!M[key]) M[key] = glowMat(M['int:f:pool'].uniforms.map.value, col.map(c => c * k));
    return key;
  };

  // ---------------- pisos e colisão do chão ----------------
  K.walk(22, 15, 22.3, 15.3, 0);
  K.floor('pavers', 0, 0, 12, 9, 0, 1.2, [gray(0.82), gray(0.86), gray(0.8), gray(0.84)]);
  K.floor('herring', 0, 9, 12, 18, 0, 1.6, [gray(0.8), gray(0.86), gray(0.82), gray(0.78)]);
  K.floor('concrete', 0, 18, 12, 30, 0, 2, [gray(0.85), gray(0.88), gray(0.8), gray(0.85)]);
  K.floor('concrete', 12, 0, 44, 21, 0, 2.2, [gray(0.95), gray(0.9), gray(0.82), gray(0.92)]);
  K.floor('concrete', 12, 21, 34, 30, 0, 2.2, [gray(0.82), gray(0.8), gray(0.55), gray(0.58)]);
  K.floor('concrete', 34, 21, 44, 30, 0, 2, [gray(0.62), gray(0.68), gray(0.56), gray(0.55)]);

  // ---------------- paredes ----------------
  const side = (mat, band, bandMat, col, us = 2) => ({ mat, band, bandMat, col, us });
  const HALL = side('brick', 1.6, 'plGreen', [0.9, 0.86, 0.8], 2.4);
  const HALLB = side('brick', 1.6, 'plGreen', [0.5, 0.45, 0.41], 2.4);
  const ENTR = side('plCream', 1.1, 'woodDark', [0.92, 0.88, 0.8]);
  const OFFI = side('plBeige', 1.0, 'woodDark', [0.92, 0.86, 0.76]);
  const STOR = side('plGray', 1.2, 'concrete', [0.88, 0.88, 0.85]);
  const BOIL = side('brickOld', 1.3, 'concrete', [0.6, 0.52, 0.48]);
  const rev = { reveal: 'concrete', revealCol: [0.55, 0.53, 0.5] };
  // fachada (z = 0)
  K.wallRun(0, 0, 12, 0, 0, HR, { A: ENTR, holes: [[1.4, 3.6, 1.1, 2.6], [8.4, 10.6, 1.1, 2.6]], ...rev });
  K.wallRun(12, 0, 44, 0, 0, HH, { A: HALL, holes: [[2, 6, 3.2, 5.4], [8, 12, 3.2, 5.4], [14, 18, 3.2, 5.4], [20, 24, 3.2, 5.4], [26, 30, 3.2, 5.4]], ...rev });
  // leste (x = 44): janelas e o exaustor
  K.wallRun(44, 0, 44, 21, 0, HH, { A: HALL, holes: [[2, 6, 3.2, 5.4], [8, 12, 3.2, 5.4], [15, 17, 3.4, 5.4]], ...rev });
  K.wallRun(44, 21, 44, 30, 0, HS, { A: BOIL });
  // fundos (z = 30), o lado queimado
  K.wallRun(44, 30, 34, 30, 0, HS, { A: BOIL });
  K.wallRun(34, 30, 12, 30, 0, HH, { A: HALLB, holes: [[4, 8, 3.2, 5.4], [10, 14, 3.2, 5.4], [16, 20, 3.2, 5.4]], ...rev });
  K.wallRun(12, 30, 0, 30, 0, HS, { A: STOR });
  // oeste (x = 0)
  K.wallRun(0, 30, 0, 18, 0, HS, { A: STOR });
  K.wallRun(0, 18, 0, 9, 0, HR, { A: OFFI, holes: [[3.5, 6.5, 1.1, 2.5]], ...rev });
  K.wallRun(0, 9, 0, 0, 0, HR, { A: ENTR });
  // divisória x = 12: A = salas a oeste, B = salão
  K.wallRun(12, 0, 12, 9, 0, HH, { A: ENTR, B: HALL, holes: [[3, 6, 0, 3.0]], ...rev });
  K.wallRun(12, 9, 12, 18, 0, HH, { A: OFFI, B: HALL, holes: [[1.0, 5.4, 1.0, 2.4], [6.2, 8.6, 0, 2.5]], reveal: 'woodDark', revealCol: [0.5, 0.45, 0.4] });
  K.wallRun(12, 18, 12, 30, 0, HH, { A: STOR, B: HALL, holes: [[6, 9, 0, 3.0]], ...rev });
  K.wallRun(0, 9, 12, 9, 0, HR, { A: OFFI, B: ENTR });
  K.wallRun(0, 18, 12, 18, 0, HS, { A: STOR, B: OFFI });
  // caldeira e vestiário
  K.wallRun(34, 21, 34, 30, 0, HH, { A: HALLB, B: BOIL });
  K.wallRun(34, 21, 44, 21, 0, HH, { A: BOIL, B: HALL, holes: [[2, 5, 0, 3.0]], ...rev });
  // rodapé de concreto no salão
  for (const [x0, z0, x1, z1] of [[12.15, 0.15, 43.85, 0.15], [43.85, 0.15, 43.85, 20.85], [33.85, 29.85, 12.15, 29.85]]) K.wface('concrete', x0, z0, x1, z1, 0, 0.18, 1, 0, [gray(0.4), gray(0.4), gray(0.45), gray(0.45)], 2);

  // ---------------- tetos ----------------
  K.ceil('woodSiding', 0, 0, 12, 18, HR, 1.4, [gray(0.5), gray(0.55), gray(0.45), gray(0.5)]);
  K.hit(6, 9, 6.2, 9.2, 0, HR, HR + 0.4, true);
  for (let z = 0.6; z < 18; z += 2.4) K.box('woodDark', 6, HR - 0.08, z, 11.7, 0.08, 0.1, 0, { col: gray(0.45), top: false, bottom: true });
  K.ceil('concrete', 0, 18, 12, 30, HS, 2, [gray(0.45), gray(0.5), gray(0.42), gray(0.4)]);
  K.hit(6, 24, 6.2, 6.2, 0, HS, HS + 0.4, true);
  K.ceil('concrete', 34, 21, 44, 30, HS, 2, [gray(0.3), gray(0.32), gray(0.22), gray(0.2)]);
  K.hit(39, 25.5, 5.2, 4.7, 0, HS, HS + 0.4, true);
  // telhado de zinco do salão: chapas com o rombo do incêndio (x 22..26, z 24..28)
  const hole = (x, z) => x >= 22 && x < 26 && z >= 24 && z < 28;
  const burnt = (x, z) => Math.min(1, Math.hypot(x - 24, (z - 26) * 1.4) / 13);
  const roofCol = (x, z) => { const k = burnt(x, z); return [0.18 + 0.5 * k, 0.17 + 0.48 * k, 0.16 + 0.46 * k]; };
  for (let x = 12; x < 44; x += 2) for (let z = 0; z < 30; z += 2) {
    if (hole(x, z) || (x >= 34 && z >= 21)) continue;
    K.ceil('metalRoof', x, z, x + 2, z + 2, HH, 2, [roofCol(x, z), roofCol(x + 2, z), roofCol(x + 2, z + 2), roofCol(x, z + 2)], 0);
  }
  K.hit(28, 15, 16.2, 15.2, 0, HH, HH + 0.4, true);
  // céu visto pelo rombo e chapas retorcidas na borda
  K.ceil('int:f:sky', 20, 22, 28, 30, HH + 1.6, 4, null, 0);
  for (const [a, b, droop] of [[[22, HH, 24], [24, HH, 24], 0.9], [[26, HH, 25], [26, HH, 27.5], 0.6], [[22.5, HH, 28], [25, HH, 28], 1.1]]) {
    const dirIn = [24 - (a[0] + b[0]) / 2, 0, 26 - (a[2] + b[2]) / 2], l = Math.hypot(dirIn[0], dirIn[2]);
    const c = [b[0] + dirIn[0] / l * 0.7, HH - droop, b[2] + dirIn[2] / l * 0.7], d = [a[0] + dirIn[0] / l * 0.5, HH - droop * 0.7, a[2] + dirIn[2] / l * 0.5];
    K.quad('metalRust', a, b, c, d, [[0, 0], [2, 0], [2, 0.6], [0, 0.6]], [gray(0.2), gray(0.2), gray(0.12), gray(0.12)]);
    K.quad('metalRust', b, a, d, c, [[0, 0], [2, 0], [2, 0.6], [0, 0.6]], [gray(0.2), gray(0.2), gray(0.12), gray(0.12)]);
  }
  // chuva entrando pelo rombo e a poça embaixo
  for (const r of [0.4, 2.0]) {
    const a = r, c = Math.cos(a) * 1.8, s = Math.sin(a) * 1.8;
    K.quad('int:f:rain', [24 - c, 0, 26 - s], [24 + c, 0, 26 + s], [24 + c, HH + 0.5, 26 + s], [24 - c, HH + 0.5, 26 - s], [[0, 0], [3.5, 0], [3.5, 5], [0, 5]]);
  }
  K.poly('water', Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return [24 + Math.cos(a) * (1.8 + Math.sin(a * 3) * 0.4), 25.4 + Math.sin(a) * (0.75 + Math.cos(a * 2) * 0.15)]; }), 0.012, 2);

  // tesouras de aço e terças
  const trussCol = (x, z) => { const k = burnt(x, z); return [0.2 + 0.35 * k, 0.19 + 0.32 * k, 0.18 + 0.3 * k]; };
  for (const x of [15, 21, 27, 33, 39]) {
    const z1 = x === 39 ? 20.85 : 29.85, sag = x === 21 ? 0.35 : 0;
    const yb = z => 5.3 - (sag && z > 20 ? Math.sin(((z - 20) / 9.85) * Math.PI) * sag : 0);
    for (let z = 0.15; z < z1 - 0.1; z += 1.5) {
      const za = z, zb = Math.min(z1, z + 1.5), zm = (za + zb) / 2, c = trussCol(x, zm);
      K.beam('metalRust', [x, yb(za), za], [x, yb(zb), zb], 0.1, 0.14, c);
      K.beam('metalRust', [x, 6.05, za], [x, 6.05, zb], 0.1, 0.12, c);
      K.beam('metalRust', [x, yb(za), za], [x, 6.05, zm], 0.06, 0.06, c);
      K.beam('metalRust', [x, 6.05, zm], [x, yb(zb), zb], 0.06, 0.06, c);
    }
  }
  for (let z = 1.5; z < 30; z += 3) K.beam('metalRust', [12.15, 6.1, z], [z > 21 ? 33.85 : 43.85, 6.1, z], 0.08, 0.1, trussCol(24, z));

  // pilares de concreto com faixa de segurança
  for (const [x, z] of [[21, 8], [33, 8], [21, 21.5], [33, 21.5]]) {
    const k = z > 20 ? 0.45 : 0.75;
    K.solid('concrete', x, 0, z, 0.5, HH, 0.5, 0, { col: gray(k), uvScale: 1.5, top: false });
    K.box('int:f:hazard', x, 0.05, z, 0.52, 0.9, 0.52, 0, { faceUV: true, top: false, col: gray(k + 0.1) });
    if (z > 20) for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) K.face('int:f:soot', x + Math.sin(r) * 0.262, 0.4, z + Math.cos(r) * 0.262, 0.5, 4.5, r, [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]);
  }

  // ---------------- janelas, chuva e relâmpagos ----------------
  const windows = [];
  // vão da janela: centro (cx, cz) no meio da parede, rot = direção para dentro
  const windowAt = (cx, cz, rot, w, y0, y1, o2 = {}) => {
    const s = Math.sin(rot), c = Math.cos(rot), h = y1 - y0;
    K.face('int:f:win', cx, y0, cz, w, h, rot, [[0, 0], [w / 1.6, 0], [w / 1.6, h / 1.6], [0, h / 1.6]]);
    K.face('int:f:rain', cx - s * 0.45, y0 - 0.6, cz - c * 0.45, w + 1.4, h + 1.2, rot, [[0, 0], [(w + 1.4) / 1.1, 0], [(w + 1.4) / 1.1, (h + 1.2) / 1.4], [0, (h + 1.2) / 1.4]]);
    K.face('int:f:sky', cx - s * 1.6, y0 - 2.5, cz - c * 1.6, w + 6, h + 5, rot, [[0, 0], [2, 0], [2, 2], [0, 2]]);
    if (o2.bars) for (let i = 1; i < 6; i++) {
      const t = (i / 6 - 0.5) * w, bx = cx + c * t + s * 0.1, bz = cz - s * t + c * 0.1;
      K.box('iron', bx, y0, bz, 0.03, h, 0.03, rot, { col: gray(0.5) });
    }
    windows.push({ x: cx, y: (y0 + y1) / 2, z: cz, nx: s, nz: c });
    if (!o2.shaft) return;
    // feixe inclinado até o chão e a grade de luz projetada
    const k = 0.95, near = y0 * k, far = y1 * k;
    const P = (t, d, y) => [cx + c * t + s * d, y, cz - s * t + c * d];
    const hw = w / 2;
    K.quad('int:f:patch', P(-hw, near, 0.02), P(-hw, far, 0.02), P(hw, far, 0.02), P(hw, near, 0.02), [[0, 0], [0, 1], [1, 1], [1, 0]]);
    K.quad('int:f:shaft', P(-hw, 0, y1), P(hw, 0, y1), P(hw, far, 0.05), P(-hw, far, 0.05), [[0, 1], [1, 1], [1, 0], [0, 0]]);
    K.quad('int:f:shaft', P(-hw, 0, y0), P(hw, 0, y0), P(hw, near, 0.05), P(-hw, near, 0.05), [[0, 1], [1, 1], [1, 0], [0, 0]]);
  };
  for (const x of [16, 22, 28, 34, 40]) windowAt(x, 0, 0, 4, 3.2, 5.4, { shaft: true });
  for (const z of [4, 10]) windowAt(44, z, -Math.PI / 2, 4, 3.2, 5.4, { shaft: true });
  for (const x of [28, 22, 16]) windowAt(x, 30, Math.PI, 4, 3.2, 5.4, { shaft: true });
  windowAt(2.5, 0, 0, 2.2, 1.1, 2.6, { bars: true });
  windowAt(9.5, 0, 0, 2.2, 1.1, 2.6, { bars: true });
  windowAt(0, 13, Math.PI / 2, 3, 1.1, 2.5);
  // fuligem por cima das janelas do fundo e na parede queimada
  K.face('int:f:soot', 23, 0.0, 29.83, 21.6, 6.1, Math.PI, [[0, 0], [21.6 / 5, 0], [21.6 / 5, 1], [0, 1]]);
  K.face('int:f:soot', 33.83, 0.0, 25.5, 8.6, 5.2, -Math.PI / 2, [[0, 0], [8.6 / 5, 0], [8.6 / 5, 1], [0, 1]]);
  K.face('int:f:soot', 12.17, 0.0, 26, 7.6, 4.0, Math.PI / 2, [[0, 0], [1.4, 0], [1.4, 0.8], [0, 0.8]]);

  // exaustor na parede leste (gira com o vento)
  {
    const cx = 44, cy = 4.4, cz = 16;
    K.box('metalGray', cx - 0.12, cy - 1.0, cz - 1.0, 0.1, 2.0, 0.08, 0, { col: gray(0.4) });
    K.box('metalGray', cx - 0.12, cy - 1.0, cz + 1.0, 0.1, 2.0, 0.08, 0, { col: gray(0.4) });
    K.face('fenceGrid', cx - 0.2, cy - 1.0, cz, 2.0, 2.0, -Math.PI / 2, [[0, 0], [2.5, 0], [2.5, 2.5], [0, 2.5]]);
    K.face('int:f:sky', cx + 1.2, cy - 2.5, cz, 6, 5, -Math.PI / 2, [[0, 0], [2, 0], [2, 2], [0, 2]]);
    const fan = part(ctx, k => {
      k.prism('metalGray', [-0.1, 0, 0], [0.1, 0, 0], 0.12, 0.12, 8, gray(0.35), true);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, F = k.frame(0, 0, 0, 0, a, 0.0);
        F.box('metalWhite', 0, 0.1, 0, 0.02, 0.8, 0.26, gray(0.4), 1, '');
      }
    }, o.x + cx - 0.05, o.y + cy, o.z + cz);
    objects.add(fan);
    anim.push((dt, t) => { fan.rotation.x += dt * (1.2 + Math.sin(t * 0.3) * 0.6); });
  }

  // ---------------- luminárias ----------------
  const fixture = (x, z, name) => {
    const y = 4.3;
    K.beam('iron', [x - 0.5, 5.3, z], [x - 0.5, y + 0.07, z], 0.02, 0.02, gray(0.4));
    K.beam('iron', [x + 0.5, 5.3, z], [x + 0.5, y + 0.07, z], 0.02, 0.02, gray(0.4));
    K.box('metalWhite', x, y, z, 1.32, 0.08, 0.3, 0, { col: gray(0.45), bottom: true });
    const dead = !name, broken = dead && R() < 0.5;
    for (const dz of [-0.07, 0.07]) {
      const l = broken && dz > 0 ? 0.5 : 1.2;
      K.prism(dead ? 'int:f:tubeDead' : tubeMat(name), [x - 0.6, y - 0.03, z + dz], [x - 0.6 + l, y - 0.03, z + dz], 0.022, 0.022, 5);
    }
    if (name) { const l = L[name]; K.floor(poolMat(name, l.base), x - l.range * 0.42, z - l.range * 0.42, x + l.range * 0.42, z + l.range * 0.42, 0.025, 99, null, 0); }
  };
  for (const x of [15, 21, 27, 33, 39]) for (const z of [4, 14.5, 25]) {
    if (x === 39 && z === 25) continue;
    if (x === 21 && z === 25) continue; // a que caiu de um lado (animada)
    const name = x === 21 && z === 4 ? 'salaoSO' : x === 33 && z === 4 ? 'salaoSE' : x === 27 && z === 14.5 ? 'salaoC' : x === 39 && z === 14.5 ? 'salaoL' : null;
    fixture(x, z, name);
  }
  // luminária pendurada por uma corrente só, balançando (salão, lado queimado)
  {
    const l = L.salaoNO, px = 21.55, pz = 25, py = 5.3;
    K.floor(poolMat('salaoNO', l.base), 20.5 - 5, 25 - 5, 20.5 + 5, 25 + 5, 0.025, 99, null, 0);
    const anchor = new THREE.Object3D();
    const g = part(ctx, k => {
      k.beam('iron', [0, 0, 0], [0, -0.9, 0], 0.02, 0.02, gray(0.4));
      const F = k.frame(0, -0.9, 0, 0, 0, 0.95);
      F.box('metalWhite', -0.66, -0.04, 0, 1.32, 0.08, 0.3, gray(0.4), 1, '');
      F.prism(tubeMat('salaoNO'), [-1.26, -0.07, -0.07], [-0.06, -0.07, -0.07], 0.022, 0.022, 5);
      F.prism('int:f:tubeDead', [-0.66, -0.07, 0.07], [-0.06, -0.07, 0.07], 0.022, 0.022, 5);
      F.beam('iron', [-1.2, 0.04, 0], [-1.25, 0.6, 0.02], 0.015, 0.015, gray(0.35));
    }, o.x + px, o.y + py, o.z + pz);
    anchor.position.set(-0.5, -1.35, 0);
    g.add(anchor);
    objects.add(g);
    const v = new THREE.Vector3();
    anim.push((dt, t) => {
      g.rotation.z = Math.sin(t * 0.8) * 0.1 + Math.sin(t * 1.9) * 0.02;
      g.rotation.x = Math.sin(t * 0.55 + 2) * 0.07;
      g.updateMatrixWorld(true);
      anchor.getWorldPosition(v);
      l.x = v.x; l.y = v.y; l.z = v.z;
    });
  }

  // ---------------- portaria ----------------
  // porta de saída (duas folhas) e placa SAÍDA acesa
  K.face('door', 5.3, 0, 0.16, 1.4, 2.7, 0, [[0, 0], [1, 0], [1, 1], [0, 1]], [gray(0.5), gray(0.5), gray(0.6), gray(0.6)]);
  K.face('door', 6.7, 0, 0.16, 1.4, 2.7, 0, [[1, 0], [0, 0], [0, 1], [1, 1]], [gray(0.5), gray(0.5), gray(0.6), gray(0.6)]);
  K.box('woodDark', 4.55, 0, 0.2, 0.12, 2.8, 0.1, 0, { col: gray(0.5) });
  K.box('woodDark', 7.45, 0, 0.2, 0.12, 2.8, 0.1, 0, { col: gray(0.5) });
  K.box('woodDark', 6, 2.7, 0.2, 3.0, 0.12, 0.1, 0, { col: gray(0.5) });
  K.face('int:f:sSaida', 6, 2.9, 0.17, 0.6, 0.22, 0);
  // relógio de ponto, porta-cartões e a placa da firma
  K.box('metalWhite', 6, 1.2, 8.73, 0.44, 0.66, 0.22, 0, { col: [0.62, 0.6, 0.54], bottom: true });
  K.face('int:f:clock', 6, 1.21, 8.615, 0.42, 0.63, Math.PI);
  for (const [x, lab] of [[4.6, 'int:f:sEntrada'], [7.4, 'int:f:sSaidaCard']]) {
    K.box('metalGray', x, 0.92, 8.81, 0.58, 1.08, 0.06, 0, { col: gray(0.5), bottom: true });
    K.face('int:f:cards', x, 0.93, 8.775, 0.56, 1.06, Math.PI);
    K.face(lab, x, 2.06, 8.84, 0.5, 0.12, Math.PI);
  }
  K.face('int:f:sName', 6, 2.55, 8.84, 3.2, 0.6, Math.PI);
  // quadro de avisos, banco e relógio de parede (oeste)
  K.box('woodDark', 0.19, 1.1, 4.5, 0.06, 1.0, 1.62, 0, { col: gray(0.5) });
  K.face('int:f:board', 0.225, 1.1, 4.5, 1.6, 1.0, Math.PI / 2);
  K.face('int:f:wclock', 0.17, 2.3, 7.4, 0.4, 0.4, Math.PI / 2);
  {
    const F = K.frame(0.45, 0, 4.5, 0);
    F.box('woodBench', 0, 0.42, 0, 0.38, 0.05, 1.8, gray(0.6), 1);
    for (const z of [-0.8, 0.8]) F.box('iron', 0, 0, z, 0.32, 0.42, 0.05, gray(0.4));
    K.hit(0.45, 4.5, 0.2, 0.9, 0, 0, 0.5);
  }
  // bebedouro, extintor, cabideiro com jaqueta
  {
    K.solid('metalWhite', 11.45, 0, 8.45, 0.42, 0.95, 0.42, 0, { col: [0.62, 0.62, 0.6], cam: false });
    K.prism('glass', [11.45, 0.95, 8.45], [11.45, 1.35, 8.45], 0.14, 0.14, 8, [0.5, 0.6, 0.7], true);
    K.box('iron', 11.45, 0.82, 8.22, 0.06, 0.05, 0.05, 0);
    K.prism('awnRed', [11.78, 0.55, 7.3], [11.78, 1.1, 7.3], 0.085, 0.085, 8, [0.7, 0.25, 0.2], true);
    K.box('iron', 11.82, 1.1, 7.3, 0.05, 0.08, 0.05, 0);
    K.face('int:f:sPerigo', 11.84, 1.35, 7.3, 0.3, 0.12, -Math.PI / 2);
    K.box('woodDark', 11.8, 1.62, 1.6, 0.06, 0.1, 1.6, 0, { col: gray(0.5) });
    const F = K.frame(11.65, 0.85, 1.2, -Math.PI / 2);
    F.box('carPaint', 0, 0, 0, 0.5, 0.75, 0.12, [0.16, 0.14, 0.12]);
    F.box('carPaint', 0, 0.55, 0.0, 0.62, 0.2, 0.14, [0.16, 0.14, 0.12]);
  }
  // cadeira caída e papéis no chão
  chair(K, 8.6, 6.2, 0.8, true, gray(0.55));
  scatterPapers(K, R, 3, 1.5, 10, 7.5, 18);
  for (let i = 0; i < 14; i++) { // cacos de vidro sob as janelas
    const x = (i < 7 ? 2.5 : 9.5) + (R() - 0.5) * 2, z = 0.5 + R() * 1.2;
    K.quad('glass', [x, 0.012, z], [x + 0.06, 0.012, z + 0.1], [x + 0.13, 0.012, z + 0.02], [x + 0.05, 0.012, z - 0.05]);
  }
  // lâmpada pendurada balançando
  {
    const l = L.entrada, g = part(ctx, k => {
      k.beam('iron', [0, 0, 0], [0, -0.62, 0], 0.012, 0.012, gray(0.2));
      k.prism('metalWhite', [0, -0.62, 0], [0, -0.78, 0], 0.05, 0.2, 8, gray(0.35));
      k.prism('int:f:bulb', [0, -0.72, 0], [0, -0.86, 0], 0.045, 0.03, 6, null, true);
    }, o.x + 6, o.y + HR, o.z + 4.5);
    const anchor = new THREE.Object3D(); anchor.position.set(0, -0.82, 0); g.add(anchor);
    objects.add(g);
    const v = new THREE.Vector3();
    anim.push((dt, t) => {
      g.rotation.x = Math.sin(t * 1.15) * 0.09 + Math.sin(t * 2.6) * 0.02;
      g.rotation.z = Math.sin(t * 0.83 + 1) * 0.06;
      g.updateMatrixWorld(true);
      anchor.getWorldPosition(v);
      l.x = v.x; l.y = v.y; l.z = v.z;
    });
  }
  // folha da porta para o salão: uma aberta, a outra caída
  {
    const F = K.frame(12, 0, 3.05, -Math.PI / 2 - 1.2);
    F.box('woodDark', 0.74, 0, -0.03, 1.48, 2.9, 0.05, gray(0.45), 1);
    const G = K.frame(14.1, 0.0, 7.6, 1.35, 0.03, 0);
    G.box('woodDark', 0, 0, 0, 1.45, 0.05, 2.9, gray(0.4), 1, '');
    K.walk(14.1, 7.6, 0.72, 1.45, 0.06, 1.35);
  }
  K.face('int:f:sCostura', 11.84, 3.06, 4.5, 1.5, 0.26, -Math.PI / 2);

  // ---------------- escritório do capataz ----------------
  // janela para o salão: caixilho, vidro rachado e persiana meio baixada
  {
    const z0 = 10, z1 = 14.4, y0 = 1.0, y1 = 2.4;
    K.face('int:f:glass', 12, y0, (z0 + z1) / 2, z1 - z0, y1 - y0, Math.PI / 2, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    for (const z of [z0 + 0.03, (z0 + z1) / 2, z1 - 0.03]) K.box('woodDark', 12, y0, z, 0.32, y1 - y0, 0.06, 0, { col: gray(0.4) });
    K.face('int:f:blinds', 11.8, 1.75, (z0 + z1) / 2, z1 - z0 - 0.1, 0.62, -Math.PI / 2, [[0, 0], [3, 0], [3, 1], [0, 1]], [gray(0.7), gray(0.7), gray(0.7), gray(0.7)]);
  }
  // mesa voltada para o salão, cadeira, máquina de escrever, telefone, abajur
  {
    const F = K.frame(10.1, 0, 11.9, Math.PI / 2);
    const wd = gray(0.62);
    F.box('woodDark', 0, 0.72, 0, 1.7, 0.05, 0.8, wd, 1);
    F.box('woodDark', -0.62, 0, 0, 0.45, 0.72, 0.76, wd, 1);
    F.box('woodDark', 0.8, 0, 0, 0.04, 0.72, 0.76, wd, 1);
    F.box('woodDark', 0.1, 0.1, 0.36, 1.3, 0.6, 0.03, gray(0.5), 1);
    for (const y of [0.15, 0.37, 0.57]) F.box('iron', -0.62, y, -0.4, 0.12, 0.02, 0.02, gray(0.6));
    F.box('carPaint', 0.2, 0.77, -0.05, 0.42, 0.13, 0.34, [0.2, 0.22, 0.2]);
    F.box('carPaint', 0.2, 0.86, 0.08, 0.36, 0.06, 0.06, gray(0.12));
    F.box('carPaint', 0.2, 0.92, 0.08, 0.2, 0.2, 0.005, gray(0.85));
    F.box('carPaint', -0.5, 0.77, -0.1, 0.2, 0.08, 0.22, gray(0.08));
    F.box('carPaint', -0.5, 0.85, -0.1, 0.22, 0.04, 0.06, gray(0.06));
    F.face('int:f:sCapataz', 0.0, 0.775, -0.36, 0.3, 0.07, UV1);
    F.box('carPaint', 0.65, 0.77, -0.15, 0.14, 0.02, 0.14, gray(0.25));
    // abajur articulado
    F.box('iron', -0.55, 0.77, 0.22, 0.16, 0.03, 0.16, gray(0.3));
    F.beam('iron', [-0.55, 0.8, 0.22], [-0.45, 1.15, 0.12], 0.025, 0.025, gray(0.3));
    F.beam('iron', [-0.45, 1.15, 0.12], [-0.25, 1.2, -0.02], 0.025, 0.025, gray(0.3));
    F.prism('metalGray', [-0.25, 1.22, -0.02], [-0.2, 1.06, -0.06], 0.03, 0.11, 8, [0.2, 0.3, 0.2]);
    F.prism('int:f:deskLamp', [-0.21, 1.1, -0.05], [-0.2, 1.06, -0.06], 0.06, 0.08, 8, null, true);
    scatterPapers(K, R, 9.6, 11.3, 10.6, 12.6, 6, 0.775);
    K.hit(10.1, 11.9, 0.42, 0.88, 0, 0, 0.8);
    officeChair(K, 9.2, 11.6, Math.PI / 2 + 0.4);
  }
  // arquivos de aço (um com a gaveta aberta) e cofre
  for (const [x, open] of [[3.2, false], [3.75, true]]) {
    K.solid('metalGray', x, 0, 17.5, 0.52, 1.32, 0.62, 0, { col: [0.55, 0.56, 0.58], cam: false });
    K.face('int:f:cabinet', x, 0, 17.185, 0.5, 1.32, Math.PI);
    if (open) { K.box('metalGray', x, 0.68, 16.95, 0.46, 0.3, 0.5, 0, { col: gray(0.45) }); K.box('carPaint', x, 0.95, 16.95, 0.4, 0.04, 0.44, 0, { col: [0.8, 0.76, 0.6] }); }
  }
  {
    K.solid('metalGray', 0.55, 0, 16.6, 0.78, 1.02, 0.8, 0, { col: [0.3, 0.42, 0.34], cam: false });
    K.face('int:f:safe', 0.945, 0.05, 16.6, 0.72, 0.92, Math.PI / 2);
    K.prism('iron', [0.94, 0.62, 16.75], [1.0, 0.62, 16.75], 0.07, 0.07, 10, gray(0.75), true);
    K.beam('iron', [0.97, 0.45, 16.42], [1.04, 0.45, 16.42], 0.03, 0.03, gray(0.6));
    K.beam('iron', [1.04, 0.45, 16.42], [1.04, 0.45, 16.28], 0.03, 0.03, gray(0.6));
  }
  // estante com pastas
  {
    const F = K.frame(0.37, 0, 10.4, Math.PI / 2);
    F.box('woodDark', 0, 0, 0, 1.4, 2.0, 0.04, gray(0.45), 1);
    for (const y of [0.02, 0.5, 1.0, 1.5, 1.96]) F.box('woodDark', 0, y, 0.18, 1.4, 0.03, 0.38, gray(0.55), 1);
    for (const y of [0.05, 0.53, 1.03, 1.53]) F.face('int:f:binders', 0, y, 0.34, 1.32, 0.42, [[0, 0], [1.4, 0], [1.4, 1], [0, 1]]);
    F.box('woodDark', -0.7, 0, 0.18, 0.04, 2.0, 0.4, gray(0.45), 1);
    F.box('woodDark', 0.7, 0, 0.18, 0.04, 2.0, 0.4, gray(0.45), 1);
    K.hit(0.37 + 0.18, 10.4, 0.25, 0.72, 0, 0, 2.0, true);
  }
  // calendário, foto, mapa, cabide com o casaco do capataz
  K.face('int:f:calendar', 6.6, 1.45, 17.84, 0.32, 0.4, Math.PI);
  K.face('int:f:photo', 8.4, 1.55, 17.84, 0.48, 0.36, Math.PI);
  K.face('int:f:map', 6.0, 1.3, 9.16, 1.5, 1.0, 0);
  K.face('int:f:poster', 2.4, 1.2, 9.16, 0.4, 0.6, 0);
  {
    K.prism('woodDark', [11.2, 0, 17.2], [11.2, 1.75, 17.2], 0.025, 0.02, 5, gray(0.4));
    K.prism('woodDark', [11.2, 0.02, 17.2], [11.2, 0.04, 17.2], 0.25, 0.25, 5, gray(0.4), true);
    const F = K.frame(11.2, 0.75, 17.12, 0.2);
    F.box('carPaint', 0, 0, 0, 0.5, 0.95, 0.14, [0.22, 0.2, 0.17]);
    F.box('carPaint', 0, 0.88, 0.02, 0.24, 0.14, 0.24, [0.18, 0.16, 0.14]);
    K.round(11.2, 17.2, 0.25, 0, 1.8);
  }
  chair(K, 7.4, 13.2, 2.4, true, gray(0.5));
  scatterPapers(K, R, 2, 10, 9, 17, 16);
  // porta do escritório aberta para dentro
  { const F = K.frame(12, 0, 17.6, -Math.PI / 2 + 1.75); F.box('woodDark', 1.15, 0, 0.0, 2.3, 2.42, 0.05, gray(0.5), 1); }
  K.face('int:f:sEscritorio', 12.16, 2.6, 16.4, 1.2, 0.26, Math.PI / 2);
  // ventilador de teto girando devagar
  {
    const g = part(ctx, k => {
      k.beam('iron', [0, 0, 0], [0, -0.35, 0], 0.03, 0.03, gray(0.3));
      k.prism('metalGray', [0, -0.35, 0], [0, -0.5, 0], 0.13, 0.11, 8, gray(0.35), true);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, F = k.frame(0, -0.45, 0, a, 0, 0.08);
        F.box('woodDark', 0.48, 0, 0, 0.72, 0.012, 0.15, gray(0.45), 1, '');
      }
    }, o.x + 6, o.y + HR, o.z + 13.5);
    objects.add(g);
    anim.push(dt => { g.rotation.y += dt * 1.8; });
  }
  // cortina rasgada na janela de fora
  K.quad('awnCream', [0.22, 0.9, 11.3], [0.22, 0.9, 11.9], [0.2, 2.6, 12.0], [0.2, 2.6, 11.2], [[0, 0], [1, 0], [1, 2], [0, 2]], [gray(0.35), gray(0.35), gray(0.45), gray(0.45)]);

  // ---------------- almoxarifado ----------------
  {
    const units = [[18.5, 0.6, true], [22.0, 0.9, false], [25.5, 0.9, false], [29.5, 0.6, true]];
    for (const [z, d, wall] of units) {
      shelfRun(K, R, 0.35, 9.0, z, d, 3.6, wall ? (z < 20 ? 1 : -1) : 0);
      K.hit(4.675, z, 4.35, d / 2, 0, 0, 3.6, true);
    }
    fixture2(K, 5, 23.75, 3.85, tubeMat('almox'), true);
    K.floor(poolMat('almox', L.almox.base, 0.06), 1.5, 21.0, 8.5, 26.5, 0.025, 99, null, 0);
    // escada, carrinho e caixas caídas
    ladder(K, 11.25, 18.95, 0.05);
    handTruck(K, 11.0, 28.8, -0.5);
    for (const [x, z, r] of [[7.2, 24.2, 0.5], [3.1, 27.2, 1.2], [9.6, 23.1, 2.2], [6.2, 20.5, 0.2]]) {
      const F = K.frame(x, 0, z, r, 0, R() < 0.5 ? 0 : Math.PI / 2);
      F.box('int:f:carton', 0, -0.2, 0, 0.5, 0.4, 0.4, jit(gray(0.7)), 1, '');
    }
    scatterPapers(K, R, 1, 19, 11, 29, 10);
  }
  K.face('int:f:sAlmox', 12.16, 3.1, 25.5, 1.4, 0.26, Math.PI / 2);
  // porta de correr de chapa, meio aberta
  K.solid('metalWall', 12.38, 0, 27.75, 0.06, 3.0, 1.7, 0, { col: gray(0.45), cam: false });
  K.box('iron', 12.42, 3.05, 26.6, 0.08, 0.08, 4.4, 0);

  // ---------------- salão: bancadas de costura ----------------
  const benches = [];
  for (const zr of [2.4, 5.6]) for (const x0 of [15.5, 21.5, 27.5]) benches.push({ x0, zr, burnt: false });
  for (const zr of [24.2, 27.4]) for (const x0 of [15.5, 21.5, 27.5]) benches.push({ x0, zr, burnt: x0 < 27 ? (x0 === 21.5 ? 2 : 1) : 0 });
  const lucia = { x: 30.5, z: 27.4 };
  for (const b of benches) bench(K, R, b.x0, b.zr, 4, b.burnt, (x, zr) => Math.abs(x - lucia.x) < 0.1 && Math.abs(zr - lucia.z) < 0.1);
  // flores secas num vidro e um retrato virado na mesa dela
  {
    const x = lucia.x - 0.42, z = lucia.z + 0.15;
    K.prism('glass', [x, 0.745, z], [x, 0.92, z], 0.04, 0.05, 6, [0.5, 0.55, 0.55], true);
    for (let i = 0; i < 7; i++) { const a = i * 0.9, l = 0.22 + hash(i, 2) * 0.12; K.beam('woodDark', [x, 0.8, z], [x + Math.cos(a) * 0.07, 0.8 + l, z + Math.sin(a) * 0.07], 0.008, 0.008, [0.3, 0.22, 0.12]); K.box('carPaint', x + Math.cos(a) * 0.075, 0.8 + l - 0.01, z + Math.sin(a) * 0.075, 0.04, 0.03, 0.04, a, { col: [0.32, 0.12, 0.1] }); }
    const F = K.frame(lucia.x + 0.38, 0.745, lucia.z + 0.2, 0.3, -1.35);
    F.box('woodDark', 0, 0, 0, 0.16, 0.012, 0.2, [0.25, 0.2, 0.16], 1);
  }
  // a máquina da Lúcia: costura sozinha, para, recomeça
  {
    const head = part(ctx, k => machine(k, 0, 0, 0, 0, [0.12, 0.16, 0.13], true), o.x + lucia.x, o.y + 0.77, o.z + lucia.z);
    const wheel = part(ctx, k => {
      k.prism('metalWhite', [-0.04, 0, 0], [0.04, 0, 0], 0.075, 0.075, 10, gray(0.55), true);
      k.beam('iron', [0.045, -0.06, 0], [0.045, 0.06, 0], 0.01, 0.015, gray(0.2));
    }, -0.29, 0.3, 0);
    const needle = part(ctx, k => k.box('metalWhite', 0, -0.1, 0, 0.012, 0.1, 0.012, 0, { col: gray(0.7) }), 0.18, 0.2, -0.02);
    head.add(wheel); head.add(needle);
    objects.add(head);
    let run = 0;
    anim.push((dt, t) => {
      const on = Math.sin(t * 0.55) + Math.sin(t * 1.7) * 0.4 > 0.35;
      run += ((on ? 1 : 0) - run) * Math.min(1, dt * 6);
      const ph = t * 26;
      wheel.rotation.x -= dt * 22 * run;
      needle.position.y = 0.2 - Math.abs(Math.sin(ph)) * 0.035 * run;
      head.rotation.z = Math.sin(ph * 0.5) * 0.012 * run;
      head.rotation.x = Math.sin(ph * 0.37) * 0.008 * run;
    });
  }
  // tecidos e cabedais espalhados nos corredores
  for (let i = 0; i < 22; i++) {
    const x = 15.5 + R() * 17, z = R() < 0.5 ? 3.6 + R() * 1 : 25 + R() * 0.8, s = 0.12 + R() * 0.2;
    B.col = jit([0.42, 0.26, 0.15], 0.25);
    K.poly('int:f:leather', Array.from({ length: 6 }, (_, j) => { const a = j / 6 * Math.PI * 2 + R(); return [x + Math.cos(a) * s * (0.6 + R() * 0.5), z + Math.sin(a) * s * (0.6 + R() * 0.5)]; }), 0.012, 0.5);
  }
  B.col = [1, 1, 1];

  // faixas amarelas de circulação (gastas)
  const stripe = (x0, z0, x1, z1) => {
    const L2 = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L2 / 1.2);
    for (let i = 0; i < n; i++) {
      if (R() < 0.18) continue;
      const t0 = i / n, t1 = Math.min(1, t0 + (0.6 + R() * 0.4) / n);
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      const nx = -(z1 - z0) / L2 * 0.06, nz = (x1 - x0) / L2 * 0.06, c = jit([0.6, 0.48, 0.12], 0.15);
      K.quadOut('paint', [ax + nx, 0.008, az + nz], [bx + nx, 0.008, bz + nz], [bx - nx, 0.008, bz - nz], [ax - nx, 0.008, az - nz], [0, 1, 0], UV1, [c, c, c, c]);
    }
  };
  stripe(15.2, 0.6, 15.2, 29.4); stripe(15.6, 6.6, 33.4, 6.6); stripe(15.6, 22.8, 33.4, 22.8); stripe(33.6, 0.6, 33.6, 20.6); stripe(38.2, 1.0, 38.2, 20.4);
  // manchas de óleo e marcas de fogo
  for (let i = 0; i < 16; i++) { const x = 15.5 + R() * 17, z = R() < 0.5 ? 1.5 + R() * 5 : 23 + R() * 5, s = 0.5 + R() * 0.9; K.floor('int:f:stain', x - s, z - s, x + s, z + s, 0.014, 99, null, 0); }
  for (const [x, z, s] of [[24, 26, 4.5], [18, 27, 3.2], [29, 25.6, 2.6], [32.6, 28.4, 2.2], [36.5, 24.5, 3.5], [40.5, 27, 3.0]]) {
    K.quad('int:f:scorch', [x - s, 0.018, z - s], [x - s, 0.018, z + s], [x + s, 0.018, z + s], [x + s, 0.018, z - s], [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }
  // chapa do telhado caída e viga carbonizada
  K.quad('metalRust', [28.0, 0.02, 28.75], [30.3, 0.02, 28.65], [30.4, 2.3, 29.8], [27.9, 2.2, 29.8], [[0, 0], [2, 0], [2, 1], [0, 1]], [gray(0.15), gray(0.15), gray(0.22), gray(0.22)]);
  K.quad('metalRust', [27.9, 2.2, 29.8], [30.4, 2.3, 29.8], [30.3, 0.02, 28.65], [28.0, 0.02, 28.75], [[0, 0], [2, 0], [2, 1], [0, 1]], [gray(0.12), gray(0.12), gray(0.12), gray(0.12)]);
  K.hit(29.15, 29.25, 1.2, 0.55, 0, 0, 1.2);
  K.beam('woodDark', [17.4, 0.12, 28.7], [21.2, 0.55, 28.1], 0.22, 0.24, gray(0.12));
  K.hit(19.3, 28.4, 1.95, 0.2, Math.atan2(-(28.1 - 28.7), 21.2 - 17.4), 0, 0.6);
  for (let i = 0; i < 18; i++) { const x = 16 + R() * 18, z = 28.2 + R() * 1.4; K.box('carPaint', x, 0, z, 0.1 + R() * 0.25, 0.04 + R() * 0.12, 0.1 + R() * 0.2, R() * 3, { col: gray(0.06 + R() * 0.06) }); }
  K.face('int:f:sFumar', 21.26, 1.8, 8, 0.5, 0.11, Math.PI / 2);
  K.face('int:f:poster', 12.17, 1.2, 7.4, 0.4, 0.6, Math.PI / 2);

  // ---------------- mesa de corte e couros ----------------
  {
    const F = K.frame(16.5, 0, 14.5, 0);
    F.box('woodPlank', 0, 0.86, 0, 1.3, 0.06, 2.8, gray(0.55), 1);
    for (const [x, z] of [[-0.58, -1.32], [0.58, -1.32], [-0.58, 1.32], [0.58, 1.32]]) F.box('iron', x, 0, z, 0.06, 0.86, 0.06, gray(0.35));
    F.box('woodPlank', 0, 0.25, 0, 1.2, 0.03, 2.7, gray(0.4), 1);
    B.col = [0.36, 0.2, 0.11];
    K.poly('int:f:leather', [[16.0, 13.4], [16.95, 13.3], [17.05, 14.6], [16.9, 15.6], [16.1, 15.7], [15.95, 14.4]], 0.925, 0.6);
    B.col = [1, 1, 1];
    for (const [x, z, a] of [[16.3, 13.9, 0.3], [16.7, 14.9, -0.5], [16.4, 15.3, 1.2]]) K.box('metalWhite', x, 0.93, z, 0.22, 0.008, 0.12, a, { col: gray(0.6) });
    K.box('iron', 16.8, 0.93, 13.8, 0.025, 0.01, 0.2, 0.4, { col: gray(0.7) });
    K.hit(16.5, 14.5, 0.65, 1.4, 0, 0, 0.95);
  }
  leatherPile(K, R, 16.6, 9.7, 0.2);
  leatherPile(K, R, 16.5, 19.4, -0.1);
  rack(K, R, 18.6, 17.4, 1.3);
  rack(K, R, 35.4, 9.0, 1.4);
  rack(K, R, 37.0, 13.6, -0.2);

  // ---------------- esteira transportadora e embalagem ----------------
  {
    const x = 39, z0 = 2.5, z1 = 19.5, y = 0.85, len = z1 - z0;
    for (const s of [-0.46, 0.46]) K.box('metalGray', x + s, y - 0.18, (z0 + z1) / 2, 0.06, 0.22, len, 0, { col: [0.32, 0.36, 0.4], bottom: true });
    K.quad('int:f:belt', [x - 0.42, y, z0], [x - 0.42, y, z1], [x + 0.42, y, z1], [x + 0.42, y, z0], [[0, 0], [0, len / 1.0], [1, len / 1.0], [1, 0]]);
    for (let z = z0 + 0.3; z < z1; z += 2.2) for (const s of [-0.4, 0.4]) K.box('metalGray', x + s, 0, z, 0.06, y - 0.15, 0.06, 0, { col: gray(0.35) });
    for (let z = z0 + 0.15; z < z1; z += 0.5) K.prism('metalWhite', [x - 0.4, y - 0.08, z], [x + 0.4, y - 0.08, z], 0.05, 0.05, 6, gray(0.3));
    // túneis nas pontas (as caixas entram e saem por eles)
    for (const zc of [z0 + 0.6, z1 - 0.6]) {
      K.box('metalWall', x - 0.5, y, zc, 0.06, 0.55, 1.2, 0, { col: [0.45, 0.4, 0.3] });
      K.box('metalWall', x + 0.5, y, zc, 0.06, 0.55, 1.2, 0, { col: [0.45, 0.4, 0.3] });
      K.box('metalWall', x, y + 0.55, zc, 1.06, 0.06, 1.2, 0, { col: [0.45, 0.4, 0.3], bottom: true });
      K.face('carPaint', x, y + 0.02, zc + (zc < 10 ? -0.58 : 0.58), 0.94, 0.53, zc < 10 ? Math.PI : 0, UV1, [gray(0.02), gray(0.02), gray(0.02), gray(0.02)]);
    }
    K.hit(x, (z0 + z1) / 2, 0.55, len / 2, 0, 0, 1.45);
    // caixas andando na esteira
    const boxes = [];
    for (let i = 0; i < 8; i++) {
      const big = i % 3 === 1;
      const g = part(ctx, k => k.box(big ? 'int:f:carton' : 'int:f:shoebox', 0, 0, 0, big ? 0.5 : 0.36, big ? 0.36 : 0.13, big ? 0.42 : 0.22, R() * 0.3 - 0.15, { faceUV: true, col: gray(0.75) }));
      g.position.set(o.x + x, o.y + y + 0.005, 0);
      objects.add(g); boxes.push(g);
    }
    const run0 = z0 + 0.6, run1 = z1 - 0.6, span = run1 - run0;
    anim.push((dt, t) => boxes.forEach((g, i) => { g.position.z = o.z + run0 + ((t * 0.5 + i * span / boxes.length) % span); }));
  }
  // estantes de fôrmas de madeira (parede leste)
  {
    const x = 43.5, z0 = 1.0, z1 = 20.6;
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 10) K.box('metalGray', x, 0, z, 0.56, 2.5, 0.05, 0, { col: gray(0.4) });
    for (const y of [0.3, 0.85, 1.4, 1.95, 2.45]) K.box('woodPlank', x, y, (z0 + z1) / 2, 0.56, 0.035, z1 - z0, 0, { col: gray(0.55), uvScale: 1 });
    for (const y of [0.335, 0.885, 1.435, 1.985]) {
      for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.36) {
        if (R() < 0.22) continue;
        const c = jit([0.62, 0.46, 0.3], 0.15);
        shoeLast(K, x - 0.08, y, z - 0.05, -Math.PI / 2 + (R() - 0.5) * 0.3, c, false);
        shoeLast(K, x - 0.08, y, z + 0.06, -Math.PI / 2 + (R() - 0.5) * 0.3, c, true);
      }
    }
    for (let i = 0; i < 9; i++) shoeLast(K, 42.2 + R() * 1.0, 0, z0 + R() * (z1 - z0), R() * 6, jit([0.6, 0.45, 0.3]), R() < 0.5);
    K.hit(x, (z0 + z1) / 2, 0.32, (z1 - z0) / 2 + 0.05, 0, 0, 2.5, true);
  }
  // pilhas de caixas de sapato, uma desmoronada; caixas grandes; mesa de embalagem
  for (const [x, z, n, r] of [[35.0, 1.2, 11, 0.05], [35.45, 1.2, 9, -0.04], [35.9, 1.25, 12, 0.1], [35.2, 1.75, 7, 0.0], [36.5, 1.3, 10, 0.2]]) shoeboxStack(K, R, x, z, n, r);
  for (let i = 0; i < 9; i++) {
    const F = K.frame(36.3 + R() * 1.4, 0, 3.2 + R() * 1.6, R() * 6, R() < 0.3 ? Math.PI / 2 : 0, 0);
    F.box('int:f:shoebox', 0, R() < 0.3 ? -0.06 : 0, 0, 0.36, 0.13, 0.22, gray(0.7), 1, '');
  }
  for (const [x, z, s, h] of [[35.0, 15.0, 0.8, 0.7], [35.1, 15.9, 0.7, 0.6], [35.05, 15.4, 0.6, 0.5, 0.7]]) K.box('int:f:carton', x, h === 0.5 ? 0.7 : 0, z, s, h, s, R() * 0.2, { faceUV: true, col: gray(0.65) });
  K.hit(35.05, 15.45, 0.45, 0.85, 0, 0, 1.2);
  {
    const F = K.frame(36.2, 0, 19.6, 0);
    F.box('woodPlank', 0, 0.82, 0, 2.4, 0.05, 0.9, gray(0.55), 1);
    for (const [x, z] of [[-1.1, -0.38], [1.1, -0.38], [-1.1, 0.38], [1.1, 0.38]]) F.box('iron', x, 0, z, 0.05, 0.82, 0.05, gray(0.35));
    for (let i = 0; i < 5; i++) F.box('int:f:shoebox', -0.8 + i * 0.36, 0.87, (R() - 0.5) * 0.4, 0.34, 0.12, 0.2, gray(0.7), 1);
    F.box('carPaint', 0.6, 0.87, 0.1, 0.5, 0.02, 0.4, [0.75, 0.72, 0.62]);
    K.hit(36.2, 19.6, 1.25, 0.5, 0, 0, 0.95);
  }
  palletJack(K, 37.2, 6.6, 0.4);

  // ---------------- caldeira e vestiário queimado ----------------
  {
    const cx = 39.2, cy = 1.55, zf = 24.4, zb = 29.4, r = 1.15;
    K.solid('brickOld', cx, 0, (zf + zb) / 2, 2.1, 0.45, zb - zf + 0.1, 0, { col: gray(0.4), cam: false });
    K.prism('metalRust', [cx, cy, zf], [cx, cy, zb], r, r, 14, [0.42, 0.36, 0.32], true, 3);
    for (const z of [zf + 0.6, (zf + zb) / 2, zb - 0.6]) K.prism('metalGray', [cx, cy, z - 0.04], [cx, cy, z + 0.04], r + 0.03, r + 0.03, 14, gray(0.25));
    K.hit(cx, (zf + zb) / 2, r + 0.05, (zb - zf) / 2, 0, 0, 2.8, true);
    // fornalha: porta entreaberta com o fogo lá dentro
    K.face('int:f:fire', cx, 0.62, zf - 0.02, 0.62, 0.52, Math.PI);
    K.box('metalGray', cx - 0.4, 0.55, zf - 0.04, 0.12, 0.66, 0.06, 0, { col: gray(0.2) });
    K.box('metalGray', cx + 0.4, 0.55, zf - 0.04, 0.12, 0.66, 0.06, 0, { col: gray(0.2) });
    K.box('metalGray', cx, 1.16, zf - 0.04, 0.92, 0.08, 0.06, 0, { col: gray(0.2) });
    { const F = K.frame(cx - 0.34, 0.6, zf - 0.06, -1.22); F.box('metalGray', -0.3, 0, 0, 0.6, 0.54, 0.05, gray(0.22), 1, ''); }
    K.quad('int:f:fireGlow', [cx - 0.9, 0.2, zf - 0.12], [cx + 0.9, 0.2, zf - 0.12], [cx + 0.9, 1.6, zf - 0.12], [cx - 0.9, 1.6, zf - 0.12]);
    K.floor('int:f:fireGlow', cx - 2.2, zf - 3.2, cx + 2.2, zf + 0.0, 0.03, 99, null, 0);
    // manômetros, válvula, chaminé e canos
    for (const gx of [-0.45, 0.45]) {
      K.prism('metalGray', [cx + gx, 2.05, zf], [cx + gx, 2.05, zf - 0.08], 0.11, 0.11, 10, gray(0.35), true);
      K.face('int:f:gauge', cx + gx, 1.95, zf - 0.082, 0.2, 0.2, Math.PI);
    }
    K.prism('iron', [cx, 2.6, zf + 0.3], [cx, 2.6, zf - 0.25], 0.04, 0.04, 6, gray(0.3));
    K.prism('awnRed', [cx, 2.6, zf - 0.26], [cx, 2.6, zf - 0.3], 0.18, 0.18, 10, [0.5, 0.15, 0.1], true);
    K.prism('metalRust', [cx, cy + r - 0.05, zb - 0.9], [cx, HS, zb - 0.9], 0.24, 0.24, 8, gray(0.3));
    K.prism('metalRust', [cx + 0.6, 2.4, zb - 1.5], [43.6, 2.4, zb - 1.5], 0.07, 0.07, 6, gray(0.3));
    K.prism('metalRust', [43.6, 2.4, zb - 1.5], [43.6, 3.7, zb - 1.5], 0.07, 0.07, 6, gray(0.3));
    K.prism('metalRust', [43.6, 3.7, 21.4], [43.6, 3.7, zb - 1.5], 0.07, 0.07, 6, gray(0.3));
    K.prism('metalRust', [34.4, 3.85, 21.4], [43.6, 3.85, 21.4], 0.06, 0.06, 6, gray(0.3));
    K.face('int:f:sPerigo', cx, 2.95, zf + 0.25 - 0.02, 0.5, 0.19, Math.PI);
    // monte de carvão e pá
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.85, x = 43.0 + Math.cos(a) * d, z = 29.0 + Math.sin(a) * d * 0.9, h = (1 - d / 0.9) * 0.6;
      const F = K.frame(x, Math.max(0, h - 0.15), z, R() * 6, R(), R());
      F.box('stoneRock', 0, 0, 0, 0.18 + R() * 0.15, 0.12 + R() * 0.1, 0.16 + R() * 0.12, gray(0.12 + R() * 0.06), 1, '');
    }
    K.round(43.1, 29.1, 0.8, 0, 0.6);
    K.beam('woodDark', [42.2, 0.02, 27.8], [42.6, 1.25, 28.4], 0.04, 0.04, gray(0.4));
    K.box('metalGray', 42.2, 0.0, 27.75, 0.28, 0.03, 0.32, 0.5, { col: gray(0.3) });
    // bancada de ferramentas
    {
      const F = K.frame(43.45, 0, 23.0, -Math.PI / 2);
      F.box('woodDark', 0, 0.85, 0, 1.8, 0.06, 0.7, gray(0.35), 1);
      for (const [x, z] of [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.3], [0.85, 0.3]]) F.box('iron', x, 0, z, 0.06, 0.85, 0.06, gray(0.3));
      F.box('metalRust', -0.5, 0.91, 0, 0.3, 0.18, 0.2, gray(0.4));
      F.box('iron', 0.2, 0.91, 0.1, 0.3, 0.03, 0.05, gray(0.5));
      F.box('iron', 0.5, 0.91, -0.1, 0.05, 0.03, 0.28, gray(0.5));
      K.hit(43.45, 23.0, 0.38, 0.92, 0, 0, 0.95);
    }
    // armários queimados (alguns abertos, um tombado) e banco
    for (let i = 0; i < 18; i++) {
      const z = 21.8 + i * 0.42 + (i >= 9 ? 0.6 : 0), open = hash(i, 4) < 0.3, k = 0.18 + hash(i, 8) * 0.22;
      if (i === 13) continue;
      K.box('metalGray', 34.45, 0, z, 0.45, 1.85, 0.4, 0, { col: gray(k), skip: '-y' });
      if (open) {
        K.face('carPaint', 34.67, 0.05, z, 0.36, 1.75, Math.PI / 2, UV1, [gray(0.02), gray(0.02), gray(0.02), gray(0.02)]);
        const F = K.frame(34.68, 0, z - 0.2, Math.PI / 2 + 0.9 + hash(i, 2));
        F.box('int:f:locker', 0.19, 0.02, 0, 0.38, 1.8, 0.02, gray(k + 0.15), 1);
        if (hash(i, 6) < 0.6) K.box('carPaint', 34.5, 0.8, z, 0.25, 0.8, 0.28, 0, { col: [0.12, 0.1, 0.09] });
      } else K.face('int:f:locker', 34.68, 0.02, z, 0.38, 1.8, Math.PI / 2, UV1, [gray(k + 0.15), gray(k + 0.15), gray(k + 0.1), gray(k + 0.1)]);
    }
    K.hit(34.45, 23.5, 0.25, 1.95, 0, 0, 1.85);
    K.hit(34.45, 27.65, 0.25, 1.95, 0, 0, 1.85);
    { const F = K.frame(35.5, 0, 27.25, 0.4, 0, Math.PI / 2 - 0.12); F.box('metalGray', 0, -0.2, 0, 0.42, 0.42, 1.85, gray(0.2), 1, ''); F.face('int:f:locker', 0, 0.0, 0.93, 0.4, 0.4, [[0, 0], [1, 0], [1, 0.22], [0, 0.22]], gray(0.3)); }
    K.hit(35.5, 27.25, 0.95, 0.3, -0.4 + Math.PI / 2, 0, 0.5);
    {
      const F = K.frame(35.7, 0, 24.3, 0);
      F.box('woodBench', 0, 0.42, 0, 0.36, 0.05, 3.2, gray(0.25), 1);
      for (const z of [-1.4, 0, 1.4]) F.box('iron', 0, 0, z, 0.3, 0.42, 0.05, gray(0.25));
      K.hit(35.7, 24.3, 0.2, 1.6, 0, 0, 0.5);
    }
    K.face('int:f:soot', 34.17, 1.4, 25.6, 8.5, 2.8, Math.PI / 2, [[0, 0], [1.6, 0], [1.6, 0.6], [0, 0.6]]);
    K.face('int:f:soot', 39, 0, 29.83, 9.6, 4.2, Math.PI, [[0, 0], [1.8, 0], [1.8, 1], [0, 1]]);
    K.face('int:f:soot', 39, 1.0, 21.17, 9.6, 3.2, 0, [[0, 0], [1.8, 0], [1.8, 0.7], [0, 0.7]]);
    K.floor('grating', 40.8, 22.3, 41.4, 22.9, 0.01, 0.6, [gray(0.4), gray(0.4), gray(0.4), gray(0.4)], 0);
    // luz de emergência vermelha sobre a porta
    K.box('metalGray', 37.5, 3.3, 21.22, 0.24, 0.16, 0.1, 0, { col: gray(0.3) });
    K.box('int:f:redLamp', 37.5, 3.2, 21.3, 0.16, 0.1, 0.08, 0, { bottom: true });
  }
  K.face('int:f:sCaldeira', 37.5, 3.15, 20.84, 1.2, 0.26, Math.PI);
  K.face('int:f:hands', 39.9, 0.6, 20.83, 1.3, 1.4, Math.PI);
  K.face('int:f:hands', 12.17, 0.7, 7.9, 1.0, 1.1, Math.PI / 2, [[1, 0], [0, 0], [0, 1], [1, 1]]);
  K.face('int:f:sPerigo', 39.9, 1.6, 20.84, 0.5, 0.19, Math.PI);
  // porta de ferro da caldeira escancarada
  { const F = K.frame(36, 0, 20.8, -0.3); F.box('metalWall', -0.75, 0, -0.04, 1.5, 2.95, 0.05, gray(0.3), 1, ''); K.hit(35.28, 20.58, 0.75, 0.06, -0.3, 0, 2.95); }

  // ---------------- pontos para a missão ----------------
  const points = {
    spawn: pt(6, 2.4, 0),
    clock: pt(6, 7.75, 0),
    office: pt(1.75, 16.6, -Math.PI / 2),
    storage: pt(5.0, 23.75, -Math.PI / 2),
    boiler: pt(39.2, 23.0, 0),
    item1: pt(33.1, 29.1, Math.PI / 2),
    item2: pt(0.9, 27.6, -Math.PI / 2),
    item3: pt(41.3, 29.2, 0),
    boss: pt(27, 14.5, Math.PI),
    lucia1: pt(33.0, 3.8, -Math.PI / 2),
    lucia2: pt(8.9, 12.6, Math.PI / 2),
    lucia3: pt(30.5, 26.5, 0),
    ambush1: pt(13.8, 27.0, Math.PI / 2),
    ambush2: pt(36.3, 11.0, -Math.PI / 2),
    hallDoor: pt(13.5, 4.5, Math.PI / 2),
  };

  // ---------------- animação, luzes por sala e relâmpagos ----------------
  let cam = null;
  objects.add(cameraProbe(c => { cam = c; }));
  const SETS = {
    entrada: ['entrada', 'salaoSO', 'escritorio'],
    escritorio: ['escritorio', 'salaoSO', 'salaoC', 'entrada'],
    almox: ['almox', 'salaoNO', 'escritorio'],
    salao: ['salaoSO', 'salaoSE', 'salaoC', 'salaoNO', 'salaoL', 'escritorio', 'caldeira', 'entrada', 'almox'],
    caldeira: ['caldeira', 'vestiario', 'salaoL', 'salaoNO'],
  };
  const roomAt = (x, z) => (x < 12 ? (z < 9 ? 'entrada' : z < 18 ? 'escritorio' : 'almox') : x > 34 && z > 21 ? 'caldeira' : 'salao');
  const flashL = { name: 'raio', x: 0, y: 0, z: 0, col: [0, 0, 0], range: 24, flicker: 0 };
  const v3 = new THREE.Vector3();
  let flash = 0, seq = null, next = 2.5 + Math.random() * 4;
  const shaftU = M['int:f:shaft'].uniforms.uColor.value, patchU = M['int:f:patch'].uniforms.uColor.value;
  const skyU = M['int:f:sky'].uniforms.uColor.value, winU = M['int:f:win'].uniforms.uColor.value, rainU = M['int:f:rain'].uniforms.uColor.value;
  const glowU = M['int:f:fireGlow'].uniforms.uColor.value, fireU = M['int:f:fire'].uniforms.uColor.value, redU = M['int:f:redLamp'].uniforms.uColor.value;
  const tubes = lights.map(l => [l, M['int:f:tube:' + l.name]?.uniforms.uColor.value, M['int:f:pool:' + l.name]?.uniforms.uColor.value, M['int:f:pool:' + l.name] ? l.base.map(c => c * (l.name === 'almox' ? 0.06 : 0.09)) : null]);
  const def = {
    title: 'FÁBRICA DE CALÇADOS',
    bounds: { x0: o.x + 0.3, x1: o.x + 43.7, z0: o.z + 0.3, z1: o.z + 29.7 },
    floorY: o.y,
    spawn: { x: points.spawn.x, z: points.spawn.z, h: 0 },
    exits: [{ x: o.x + 6, z: o.z + 0.7, r: 1.4, label: 'SAIR' }],
    lights,
    lightsAll: lights,
    light: name => L[name],
    points,
    objects,
    onFlash: null,     // a campanha pode tocar o trovão aqui: def.onFlash = k => audio.thunder(k, true)
    dark: false,       // true = falta de luz (lâmpadas apagam; ficam o fogo da caldeira e os relâmpagos)
    lightning(k = 1) { seq = { t: 0, pulses: [[0, k], [0.08 + Math.random() * 0.06, k * 0.45], [0.2 + Math.random() * 0.12, k * 0.85]].map(([at, kk]) => ({ at, k: kk })) }; def.onFlash?.(k); },
    update(dt, t, active) {
      if (!active) return;
      for (const f of anim) f(dt, t);
      // relâmpagos
      next -= dt;
      if (next <= 0) { def.lightning(Math.random() < 0.35 ? 1 : 0.6); next = 7 + Math.random() * 15; }
      flash = Math.max(0, flash - dt * 3.2);
      if (seq) {
        seq.t += dt;
        for (const p of seq.pulses) if (!p.done && seq.t >= p.at) { p.done = true; flash = Math.max(flash, p.k); }
        if (seq.t > 0.7) seq = null;
      }
      if (def.flashHold != null) flash = def.flashHold;   // testes: segura o clarão
      const f = flash;
      skyU.setRGB(0.42 + f * 2.6, 0.44 + f * 2.7, 0.5 + f * 2.9);
      winU.setRGB(0.36 + f * 1.4, 0.38 + f * 1.45, 0.42 + f * 1.6);
      rainU.setRGB(0.5 + f * 0.8, 0.55 + f * 0.8, 0.65 + f * 0.9);
      shaftU.setRGB(0.035 + f * 0.75, 0.04 + f * 0.82, 0.05 + f * 0.95);
      patchU.setRGB(0.03 + f * 0.6, 0.035 + f * 0.66, 0.045 + f * 0.75);
      // lâmpadas piscando junto com as luzes
      for (const [l, tu, pu, pb] of tubes) {
        const k = def.dark && l.name !== 'caldeira' ? 0 : lightK(l, t);
        if (tu) tu.setRGB(0.9 * k + 0.04, 0.97 * k + 0.04, 1.0 * k + 0.05);
        if (pu) pu.setRGB(pb[0] * k, pb[1] * k, pb[2] * k);
      }
      const kf = lightK(L.caldeira, t);
      fireU.setRGB(0.55 + 0.45 * kf, 0.55 + 0.45 * kf, 0.55 + 0.45 * kf);
      glowU.setRGB(0.5 * kf, 0.2 * kf, 0.05 * kf);
      const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.4));
      L.vestiario.col = L.vestiario.base.map(c => c * pulse);
      redU.setRGB(0.3 + 0.7 * pulse, 0.04 + 0.08 * pulse, 0.03 + 0.05 * pulse);
      // onde está o jogador (pela câmera): só as luzes que fazem sentido naquela sala
      let px = null, pz = null;
      if (cam) {
        cam.getWorldDirection(v3);
        const l = Math.hypot(v3.x, v3.z) || 1;
        px = cam.position.x + v3.x / l * 3.6; pz = cam.position.z + v3.z / l * 3.6;
      }
      let set = px === null ? lights : SETS[roomAt(px - o.x, pz - o.z)].map(n => L[n]);
      if (def.dark) set = set.filter(l => l.name === 'caldeira');   // falta de luz: só o fogo da caldeira
      if (f > 0.02 && px !== null) {
        // clarão vindo da janela mais perto
        let best = null, bd = Infinity;
        for (const w of windows) { const d = Math.hypot(o.x + w.x - px, o.z + w.z - pz); if (d < bd) { bd = d; best = w; } }
        const wx = o.x + best.x + best.nx * 1.5, wz = o.z + best.z + best.nz * 1.5, dx = wx - px, dz = wz - pz, dl = Math.hypot(dx, dz) || 1, s = Math.min(2.2, dl);
        flashL.x = px + dx / dl * s; flashL.z = pz + dz / dl * s; flashL.y = o.y + 3.6;
        const k = f * (bd < 14 ? 1.9 : 1.1);
        flashL.col = [0.72 * k, 0.8 * k, 1.0 * k];
        def.lights = [flashL, ...set];
      } else def.lights = set;
    },
  };
  return def;
}

// ---------------------------------------------------------------------------
// peças da fábrica
// ---------------------------------------------------------------------------
// máquina de costura industrial (frente = -z local, operadora sentada em -z)
function machine(K, x, y, z, rot, col, noWheel = false) {
  const F = K.frame(x, y, z, rot);
  F.box('carPaint', 0, 0, 0, 0.5, 0.05, 0.2, col);
  F.box('carPaint', -0.2, 0.05, 0.02, 0.1, 0.28, 0.12, col);
  F.box('carPaint', -0.03, 0.29, 0.02, 0.44, 0.09, 0.1, col);
  F.box('carPaint', 0.17, 0.14, 0.02, 0.1, 0.16, 0.1, col);
  F.box('carPaint', 0.17, 0.12, 0.02, 0.05, 0.02, 0.05, [0.5, 0.5, 0.5]);
  F.box('carPaint', -0.05, 0.31, -0.055, 0.2, 0.04, 0.005, [0.75, 0.7, 0.55]);
  if (!noWheel) F.prism('metalWhite', [-0.25, 0.3, 0.02], [-0.33, 0.3, 0.02], 0.075, 0.075, 8, [0.5, 0.5, 0.5], true);
  // carretéis no suporte
  F.beam('iron', [0.05, 0.05, 0.12], [0.05, 0.62, 0.12], 0.012, 0.012, [0.3, 0.3, 0.3]);
  F.beam('iron', [-0.05, 0.62, 0.12], [0.15, 0.62, 0.12], 0.012, 0.012, [0.3, 0.3, 0.3]);
  for (const [dx, c] of [[-0.02, [0.85, 0.82, 0.75]], [0.12, [0.6, 0.15, 0.12]]]) F.prism('carPaint', [dx, 0.05, 0.18], [dx, 0.17, 0.18], 0.035, 0.015, 6, c, true);
}

// cadeira de madeira (caída = tombada de lado)
function chair(K, x, z, rot, fallen = false, col = [0.55, 0.55, 0.55]) {
  const F = fallen ? K.frame(x, 0.2, z, rot, 0, Math.PI / 2) : K.frame(x, 0, z, rot);
  const y0 = fallen ? -0.2 : 0;
  F.box('woodDark', 0, y0 + 0.44, 0, 0.4, 0.04, 0.4, col, 1);
  for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) F.box('woodDark', lx, y0, lz, 0.035, 0.44, 0.035, col, 1);
  for (const lx of [-0.17, 0.17]) F.box('woodDark', lx, y0 + 0.48, 0.18, 0.035, 0.42, 0.035, col, 1);
  F.box('woodDark', 0, y0 + 0.74, 0.18, 0.38, 0.12, 0.025, col, 1);
  if (!fallen) K.round(x, z, 0.24, 0, 0.9);
  else K.hit(x, z, 0.45, 0.25, rot, 0, 0.42);
}

function officeChair(K, x, z, rot) {
  const F = K.frame(x, 0, z, rot);
  const c = [0.2, 0.17, 0.14];
  F.box('carPaint', 0, 0.44, 0, 0.46, 0.08, 0.46, c);
  F.box('carPaint', 0, 0.55, 0.22, 0.44, 0.5, 0.07, c);
  F.prism('iron', [0, 0.06, 0], [0, 0.44, 0], 0.025, 0.025, 6, [0.4, 0.4, 0.4]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; F.beam('iron', [0, 0.06, 0], [Math.cos(a) * 0.28, 0.03, Math.sin(a) * 0.28], 0.03, 0.03, [0.3, 0.3, 0.3]); }
  K.round(x, z, 0.28, 0, 1.0);
}

// papéis espalhados num retângulo
function scatterPapers(K, R, x0, z0, x1, z1, n, y = 0.01) {
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), a = R() * 6.28, c = Math.cos(a) * 0.11, s = Math.sin(a) * 0.11, c2 = Math.cos(a) * 0.15, s2 = Math.sin(a) * 0.15;
    const k = 0.55 + R() * 0.3, col = [k, k * 0.97, k * 0.85];
    K.quadOut('carPaint', [x - c + s2, y + R() * 0.004, z + s + c2], [x + c + s2, y, z - s + c2], [x + c - s2, y, z - s - c2], [x - c - s2, y, z + s - c2], [0, 1, 0], UV1, [col, col, col, col]);
  }
}

// bancada de costura com n postos, cadeiras e motores; burnt: 0 inteira, 1 queimada, 2 desabada
function bench(K, R, x0, zr, n, burnt, skipMachine) {
  const w = n * 1.2, cx = x0 + w / 2;
  const k = burnt ? 0.22 + R() * 0.08 : 1;
  const wood = burnt ? [0.18, 0.15, 0.13] : [0.62, 0.56, 0.48];
  if (burnt === 2) {
    // tampo partido caído num lado
    const F = K.frame(cx - w / 4, 0.38, zr, 0.05, 0, 0.32);
    F.box('woodPlank', 0, 0, 0, w / 2, 0.05, 0.8, wood, 1, '');
    const G = K.frame(cx + w / 4, 0.0, zr + 0.1, -0.08, 0.1, -0.05);
    G.box('woodPlank', 0, 0.02, 0, w / 2 - 0.1, 0.05, 0.8, wood, 1, '');
    for (let i = 0; i < n; i++) {
      const H = K.frame(x0 + 0.6 + i * 1.2 + (R() - 0.5) * 0.4, 0.1, zr - 0.5 + R() * 1.0, R() * 6, R() * 0.5, R() < 0.5 ? Math.PI / 2 : 0.3);
      H.box('carPaint', 0, -0.1, 0, 0.5, 0.18, 0.2, [0.05, 0.05, 0.05], 1, '');
    }
    K.hit(cx, zr, w / 2, 0.45, 0, 0, 0.8);
    return;
  }
  K.box('woodPlank', cx, 0.72, zr, w, 0.05, 0.8, 0, { col: wood, uvScale: 1.2, bottom: true });
  for (let i = 0; i <= n; i += n / 2) for (const s of [-0.34, 0.34]) K.box('iron', x0 + 0.05 + i * (w - 0.1) / n, 0, zr + s, 0.05, 0.72, 0.05, 0, { col: [0.3 * k, 0.3 * k, 0.32 * k] });
  K.box('iron', cx, 0.15, zr + 0.34, w - 0.1, 0.04, 0.04, 0, { col: gray3(0.3 * k) });
  K.hit(cx, zr, w / 2, 0.42, 0, 0, 0.95);
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.6 + i * 1.2;
    K.box('metalGray', x + 0.3, 0.42, zr + 0.05, 0.22, 0.22, 0.3, 0, { col: gray3(0.3 * k), bottom: true });
    K.box('iron', x - 0.05, 0.05, zr - 0.15, 0.3, 0.03, 0.2, 0.0, { col: gray3(0.25 * k) });
    if (!skipMachine(x, zr) && !(burnt && R() < 0.3)) machine(K, x, 0.77, zr, 0, burnt ? [0.05, 0.05, 0.05] : jit3(R, [0.12, 0.16, 0.13]));
    if (!burnt && R() < 0.6) { B3(K, x - 0.35, zr - 0.1, R); }
    if (!skipMachine(x, zr) && R() < (burnt ? 0.4 : 0.85)) {
      const fallen = R() < 0.15;
      chair(K, x + (R() - 0.5) * 0.2, zr - 0.78 - (fallen ? 0.2 : 0), Math.PI + (R() - 0.5) * 0.5 + (fallen ? R() * 2 : 0), fallen, burnt ? gray3(0.15) : gray3(0.5 + R() * 0.1));
    }
  }
}
const gray3 = k => [k, k, k];
const jit3 = (R, c, a = 0.1) => c.map(v => v * (1 - a + R() * a * 2));
// cabedais e retalhos em cima da mesa
function B3(K, x, z, R) {
  const c = jit3(R, [0.4, 0.24, 0.14], 0.3);
  K.box('int:f:leather', x, 0.745, z, 0.22, 0.012, 0.16, R() * 3, { col: c });
  if (R() < 0.5) K.box('int:f:leather', x + 0.05, 0.757, z + 0.03, 0.16, 0.03, 0.09, R() * 3, { col: c.map(v => v * 0.8) });
}

// fôrma de sapato: contorno de pé extrudado (bico mais baixo que o calcanhar)
const LAST = [[0, -0.13], [0.035, -0.115], [0.045, -0.05], [0.05, 0.03], [0.045, 0.1], [0.02, 0.13], [-0.015, 0.125], [-0.04, 0.08], [-0.038, -0.02], [-0.03, -0.11]];
function shoeLast(K, x, y, z, rot, col, mirror) {
  const c = Math.cos(rot), s = Math.sin(rot), m = mirror ? -1 : 1;
  const P = ([lx, lz]) => [x + lx * m * c + lz * s, z - lx * m * s + lz * c];
  const hAt = lz => 0.12 - (lz + 0.13) * 0.27;
  const pts = LAST.map(P);
  const top = LAST.map(p => hAt(p[1]));
  const n = pts.length, dark = col.map(v => v * 0.7);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], ha = top[i], hb = top[(i + 1) % n];
    const out = [(a[0] + b[0]) / 2 - x, 0, (a[1] + b[1]) / 2 - z];
    K.quadOut('woodPlank', [a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + hb, b[1]], [a[0], y + ha, a[1]], out, [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]], [dark, dark, col, col]);
  }
  for (let i = 1; i < n - 1; i++) K.triOut('woodPlank', [pts[0][0], y + top[0], pts[0][1]], [pts[i][0], y + top[i], pts[i][1]], [pts[i + 1][0], y + top[i + 1], pts[i + 1][1]], [0, 1, 0], [0, 0], [0.1, 0], [0, 0.1], col, col, col);
  const hp = P([0.005, -0.09]);
  K.box('woodPlank', hp[0], y + 0.1, hp[1], 0.035, 0.05, 0.05, rot, { col: dark, uvScale: 0.2 });
}

// pilha de caixas de sapato
function shoeboxStack(K, R, x, z, n, rot) {
  for (let i = 0; i < n; i++) K.box('int:f:shoebox', x + (R() - 0.5) * 0.03, i * 0.13, z + (R() - 0.5) * 0.03, 0.36, 0.13, 0.22, rot + (R() - 0.5) * 0.08, { faceUV: true, col: jit3(R, [0.72, 0.72, 0.72], 0.08) });
  K.hit(x, z, 0.2, 0.13, rot, 0, n * 0.13);
}

// estrado com pilha de couros
function leatherPile(K, R, x, z, rot) {
  const F = K.frame(x, 0, z, rot);
  F.box('woodPlank', 0, 0, 0, 1.2, 0.14, 1.0, [0.5, 0.45, 0.38], 0.6);
  const cols = [[0.36, 0.2, 0.11], [0.12, 0.09, 0.08], [0.44, 0.14, 0.1], [0.5, 0.32, 0.18]];
  for (let i = 0; i < 9; i++) {
    const c = jit3(R, cols[i % cols.length], 0.15), y = 0.14 + i * 0.05, a = (R() - 0.5) * 0.4;
    const ring = Array.from({ length: 9 }, (_, j) => {
      const t = j / 9 * Math.PI * 2, r = 0.62 + Math.sin(t * 3 + i) * 0.08 + R() * 0.06;
      const lx = Math.cos(t + a) * r * 1.05, lz = Math.sin(t + a) * r * 0.85, p = F.P(lx, 0, lz);
      return [p[0], p[2]];
    });
    K.B.col = c;
    K.poly('int:f:leather', ring, y + 0.05, 0.6);
    for (let j = 0; j < ring.length; j++) {
      const a2 = ring[j], b2 = ring[(j + 1) % ring.length];
      K.quadOut('int:f:leather', [a2[0], y, a2[1]], [b2[0], y, b2[1]], [b2[0], y + 0.05, b2[1]], [a2[0], y + 0.05, a2[1]], [(a2[0] + b2[0]) / 2 - x, 0, (a2[1] + b2[1]) / 2 - z], UV1, [c.map(v => v * 0.6), c.map(v => v * 0.6), c, c]);
    }
  }
  K.B.col = [1, 1, 1];
  K.hit(x, z, 0.72, 0.62, rot, 0, 0.62);
}

// arara/carrinho de prateleiras com sapatos prontos
function rack(K, R, x, z, rot) {
  const F = K.frame(x, 0, z, rot), m = [0.4, 0.42, 0.44];
  for (const [lx, lz] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) { F.box('iron', lx, 0.08, lz, 0.03, 1.5, 0.03, m); F.prism('iron', [lx, 0.0, lz], [lx, 0.08, lz], 0.035, 0.035, 5, [0.1, 0.1, 0.1]); }
  for (const y of [0.35, 0.8, 1.25]) {
    F.box('metalGray', 0, y, 0, 1.12, 0.025, 0.58, m, 1);
    for (let i = 0; i < 5; i++) {
      if (R() < 0.25) continue;
      const c = jit3(R, R() < 0.5 ? [0.08, 0.07, 0.06] : [0.32, 0.18, 0.1], 0.2);
      for (const s of [-0.06, 0.06]) {
        F.box('carPaint', -0.44 + i * 0.22 + s, y + 0.025, 0, 0.09, 0.03, 0.26, [0.12, 0.1, 0.08]);
        F.box('carPaint', -0.44 + i * 0.22 + s, y + 0.055, 0.03, 0.085, 0.07, 0.17, c);
      }
    }
  }
  K.hit(x, z, 0.6, 0.32, rot, 0, 1.6);
}

// estante alta de aço com caixas; wallSide: 1/-1 = encostada (um lado só), 0 = dupla
function shelfRun(K, R, x0, x1, z, d, h, wallSide) {
  const m = [0.36, 0.38, 0.4];
  const n = Math.round((x1 - x0) / 2.15);
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * (x1 - x0) / n;
    for (const s of [-d / 2 + 0.03, d / 2 - 0.03]) K.box('metalGray', x, 0, z + s, 0.05, h, 0.05, 0, { col: m });
  }
  const levels = [0.12, 0.95, 1.8, 2.65, 3.5];
  for (const y of levels) {
    K.box('woodPlank', (x0 + x1) / 2, y, z, x1 - x0, 0.035, d, 0, { col: [0.45, 0.4, 0.34], uvScale: 1, bottom: true });
    if (y > 3.4) continue;
    let x = x0 + 0.1;
    while (x < x1 - 0.3) {
      const r = R(), w = r < 0.35 ? 0.36 : 0.3 + R() * 0.5;
      if (R() < 0.18) { x += w + 0.1; continue; }
      const bh = Math.min(0.78, r < 0.35 ? 0.13 : 0.25 + R() * 0.45);
      const bd = Math.min(d - 0.05, 0.3 + R() * 0.4);
      const bz = wallSide ? z + wallSide * (d / 2 - bd / 2 - 0.04) : z + (R() - 0.5) * (d - bd);
      if (r < 0.35) {
        const cnt = 1 + Math.floor(R() * 5);
        for (let k = 0; k < cnt; k++) K.box('int:f:shoebox', x + w / 2, y + 0.035 + k * 0.13, bz, 0.36, 0.13, 0.22, Math.PI / 2 * (wallSide ? 0 : 1) * 0 + (R() - 0.5) * 0.06, { faceUV: true, col: jit3(R, [0.7, 0.7, 0.7], 0.1) });
      } else if (r < 0.45) {
        K.prism('int:f:leather', [x, y + 0.035 + 0.12, bz], [x + w, y + 0.035 + 0.12, bz], 0.12, 0.12, 8, jit3(R, [0.4, 0.22, 0.12], 0.2), true, 1);
      } else K.box('int:f:carton', x + w / 2, y + 0.035, bz, w, bh, bd, (R() - 0.5) * 0.08, { faceUV: true, col: jit3(R, [0.7, 0.68, 0.64], 0.12) });
      x += w + 0.06;
    }
  }
}

// luminária fluorescente simples (sala)
function fixture2(K, x, z, y, mat) {
  K.box('metalWhite', x, y, z, 1.32, 0.08, 0.3, 0, { col: [0.4, 0.4, 0.4], bottom: true });
  for (const dz of [-0.07, 0.07]) K.prism(mat, [x - 0.6, y - 0.03, z + dz], [x + 0.6, y - 0.03, z + dz], 0.022, 0.022, 5);
  K.beam('iron', [x, y + 0.08, z], [x, y + 0.36, z], 0.02, 0.02, [0.3, 0.3, 0.3]);
}

// escada de abrir de madeira
function ladder(K, x, z, rot) {
  const F = K.frame(x, 0, z, rot), c = [0.5, 0.42, 0.32];
  for (const s of [-1, 1]) for (const lx of [-0.22, 0.22]) F.beam('woodPlank', [lx, 0, s * 0.45], [lx, 1.9, s * 0.04], 0.05, 0.03, c);
  for (let i = 1; i < 6; i++) { const t = i / 6; F.beam('woodPlank', [-0.22, 1.9 * t, -0.45 * (1 - t) - 0.02], [0.22, 1.9 * t, -0.45 * (1 - t) - 0.02], 0.04, 0.12, c); }
  K.hit(x, z, 0.28, 0.5, rot, 0, 1.9);
}

// carrinho de mão (de caixas)
function handTruck(K, x, z, rot) {
  const F = K.frame(x, 0, z, rot, -0.25), c = [0.5, 0.15, 0.1];
  for (const lx of [-0.18, 0.18]) F.beam('iron', [lx, 0.05, 0], [lx, 1.25, 0], 0.03, 0.03, c);
  F.box('iron', 0, 0.02, -0.12, 0.42, 0.02, 0.22, [0.3, 0.3, 0.3]);
  for (const lx of [-0.24, 0.24]) F.prism('tire', [lx, 0.12, 0.05], [lx + Math.sign(lx) * 0.06, 0.12, 0.05], 0.12, 0.12, 8, null, true);
  F.box('int:f:carton', 0, 0.05, -0.2, 0.36, 0.36, 0.3, [0.6, 0.6, 0.6], 1);
  K.hit(x, z, 0.3, 0.3, rot, 0, 1.2);
}

// paleteira
function palletJack(K, x, z, rot) {
  const F = K.frame(x, 0, z, rot), c = [0.6, 0.45, 0.1];
  for (const lx of [-0.2, 0.2]) F.box('metalGray', lx, 0.03, 0, 0.16, 0.06, 1.15, c);
  F.box('metalGray', 0, 0.03, -0.62, 0.6, 0.25, 0.2, c);
  F.beam('iron', [0, 0.25, -0.65], [0, 1.15, -1.05], 0.035, 0.035, [0.2, 0.2, 0.2]);
  F.box('iron', 0, 1.13, -1.06, 0.3, 0.04, 0.04, [0.2, 0.2, 0.2]);
  K.hit(x, z - 0.1, 0.35, 0.75, rot, 0, 0.4);
}
