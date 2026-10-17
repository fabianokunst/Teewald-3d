import * as THREE from 'three';
import { ps1Material } from '../engine/ps1material.js';
import { TEX } from '../engine/textures.js';
import { SIDE, DOOR_F, DOOR_M, AXLE_F, AXLE_R, WHEEL_R, beltY } from '../engine/heroCarTextures.js';

// O carro do protagonista: sedã preto de quatro portas, comprido e baixo, do fim dos anos 60
// (sem coluna do meio, capô comprido, grade larga com faróis duplos, três lanternas de cada
// lado, muito cromado). Malha montada por seções ao longo do carro, com normais suaves e
// quinas vivas no vinco da cintura; a lataria preta brilha pelo shader (gloss: reflexo do
// céu, do horizonte, do sol e dos postes).
// Eixos do carro: +z para a frente, +x para a esquerda (lado do motorista), y a partir do chão.
// Peças que se mexem: carroceria (balança na suspensão), porta do motorista (abre na
// dobradiça da frente), volante e as quatro rodas (giram e as da frente esterçam).

export const CAR = {
  len: 5.44, hl: 2.72, hw: 1.0, height: 1.38,
  axleF: AXLE_F, axleR: AXLE_R, base: AXLE_F - AXLE_R, track: 0.79, wheelR: WHEEL_R,
  // raiz do motorista sentado (no assoalho, embaixo do quadril) e o volante
  seat: [0.4, 0.3, -0.4],
  wheel: { c: [0.4, 0.86, -0.08], r: 0.2, tilt: 0.62 },
  // dobradiça da porta e onde o motorista fica em pé do lado de fora
  hinge: [0.99, DOOR_F - 0.02], doorOpen: -1.08,
  outside: [1.62, -0.12],
  // faróis e lanternas (centros, no plano da grade e da traseira)
  heads: [[0.8, 0.62], [0.585, 0.62], [-0.585, 0.62], [-0.8, 0.62]],
  tails: [[0.86, 0.63], [0.69, 0.63], [0.52, 0.63], [-0.52, 0.63], [-0.69, 0.63], [-0.86, 0.63]],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- forma ----------
// meia largura na cintura: um pouco mais larga no paralama de trás, ponta da frente e de trás arredondadas
const W = z => 0.982 + 0.02 * Math.exp(-(((z - AXLE_R) / 0.75) ** 2)) + 0.006 * Math.exp(-(((z - AXLE_F) / 0.6) ** 2))
  - 0.05 * smooth(2.25, 2.66, z) - 0.035 * smooth(-2.3, -2.68, z);
// caixa de roda: elipse que nasce na saia (0,24 m) e sobe até 0,8 m sobre o eixo
const ARCH_W = 0.5, ARCH_H = 0.56, SKIRT = 0.24;
const archY = z => {
  let y = SKIRT;
  for (const a of [AXLE_F, AXLE_R]) { const d = (z - a) / ARCH_W; if (Math.abs(d) < 1) y = Math.max(y, SKIRT + ARCH_H * Math.sqrt(1 - d * d)); }
  return y;
};
// borda de cima da lateral (onde começa o capô, o peitoril das janelas ou a tampa de trás)
const topEdge = z => (z > DOOR_F ? lerp(0.875, 0.945, smooth(2.62, 0.75, z)) : z > -1.8 ? 0.952 : lerp(0.955, 0.93, smooth(-1.8, -2.64, z)));
const FRONT = 2.62, REAR = -2.64;

// perfil da lateral (meia seção, de baixo para cima) numa estação z
function sideProfile(z) {
  const w = W(z), yb = archY(z), yt = topEdge(z), belt = beltY(z);
  const y2 = Math.max(yb + 0.06, lerp(yb, belt, 0.55));
  return [[w * 0.905, yb, z], [w * 0.975, yb + 0.035, z], [w, y2, z], [w * 1.004, belt, z], [w * 0.99, belt + 0.05, z], [w * 0.95, yt, z]];
}

// estações ao longo do carro: pontas, caixas de roda (9 cada) e as emendas das portas
const archSt = a => Array.from({ length: 9 }, (_, i) => a + ARCH_W * Math.cos((i / 8) * Math.PI));
const STATIONS = [FRONT, 2.5, 2.34, ...archSt(AXLE_F), 1.0, 0.78, DOOR_F, 0.3, 0.0, -0.3, DOOR_M, -0.72, ...archSt(AXLE_R), -2.0, -2.2, -2.4, -2.55, REAR];

// ---------- acumulador de malha ----------
class Acc {
  constructor() { this.parts = new Map(); }
  _g(part, mat) {
    const k = part + '|' + mat;
    let g = this.parts.get(k);
    if (!g) { g = { part, mat, pos: [], nor: [], uv: [], col: [] }; this.parts.set(k, g); }
    return g;
  }
  // vértices = { p, n, uv, c }
  tri(part, mat, a, b, c, origin = null) {
    const g = this._g(part, mat);
    for (const v of [a, b, c]) {
      const p = origin ? sub(v.p, origin) : v.p, col = v.c || [1, 1, 1];
      g.pos.push(p[0], p[1], p[2]); g.nor.push(v.n[0], v.n[1], v.n[2]); g.uv.push(v.uv[0], v.uv[1]); g.col.push(col[0], col[1], col[2]);
    }
  }
  // polígono plano (leque), virado para "out"
  poly(part, mat, pts, uvs, out, o = {}) {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    let P = pts, U = uvs;
    if (dot(n, out) < 0) { P = [...pts].reverse(); U = [...uvs].reverse(); n = scl(n, -1); }
    const V = i => ({ p: P[i], n, uv: U[i], c: o.c });
    for (let i = 1; i < P.length - 1; i++) this.tri(part, mat, V(0), V(i), V(i + 1), o.origin);
  }
  build(mats) {
    const groups = {};
    for (const g of this.parts.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats[g.mat]);
      m.name = g.mat;
      m.frustumCulled = false;
      if (mats[g.mat].transparent) m.renderOrder = 3;
      (groups[g.part] ||= []).push(m);
    }
    return groups;
  }
  get triangles() { let n = 0; for (const g of this.parts.values()) n += g.pos.length / 9; return n; }
}

// grade de pontos rows × cols (rows ao longo do carro) com normais suaves; creases = colunas com
// quina viva. out(p) = para onde a face aponta; route(centro, coluna) = peça do triângulo
function loft(A, mat, rows, uvf, o) {
  const R = rows.length, C = rows[0].length;
  const fn = [];
  for (let i = 0; i < R - 1; i++) {
    fn.push([]);
    for (let j = 0; j < C - 1; j++) {
      const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
      let n = norm(add(cross(sub(b, a), sub(d, a)), cross(sub(d, c), sub(b, c))));
      const ctr = scl(add(add(a, b), add(c, d)), 0.25);
      if (dot(n, o.out(ctr)) < 0) n = scl(n, -1);
      fn[i].push(n);
    }
  }
  const crease = new Set(o.creases || []);
  // normal do vértice (i, j) para a faixa b (b = j - 1 ou j)
  const vn = (i, j, b) => {
    let s = [0, 0, 0];
    for (const r of [i - 1, i]) {
      if (r < 0 || r >= R - 1) continue;
      s = add(s, fn[r][b]);
      if (!crease.has(j)) {
        const nb = j === b ? b - 1 : b + 1;
        if (nb >= 0 && nb < C - 1) s = add(s, fn[r][nb]);
      }
    }
    return norm(s);
  };
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < C - 1; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    const ctr = scl(add(add(a, b), add(c, d)), 0.25);
    const part = o.route ? o.route(ctr, j) : 'body';
    const V = (p, ii, jj) => ({ p, n: vn(ii, jj, j), uv: uvf(p, ii, jj), c: o.c });
    let va = V(a, i, j), vb = V(b, i + 1, j), vc = V(c, i + 1, j + 1), vd = V(d, i, j + 1);
    const fwd = dot(cross(sub(b, a), sub(d, a)), fn[i][j]) > 0;
    const origin = part === 'door' ? o.doorOrigin : null;
    if (!fwd) [vb, vd] = [vd, vb];
    A.tri(part, mat, va, vb, vc, origin);
    A.tri(part, mat, va, vc, vd, origin);
  }
}

// varredura: perfil (a, b) ao longo de um caminho, com os eixos N (a) e B (b) de cada ponto
function sweep(A, mat, path, prof, o = {}) {
  const rows = path.map(({ p, N, B }) => prof.map(([a, b]) => add(add(p, scl(N, a)), scl(B, b))));
  const center = o.center || [0, 0.5, 0];
  loft(A, mat, rows, o.uv || ((p, i, j) => [j / (prof.length - 1), i / (path.length - 1) * (o.uRep || 4)]), {
    out: o.out || (p => sub(p, center)), route: o.route, creases: o.creases, c: o.c, doorOrigin: o.doorOrigin,
  });
}

let MATS = null, BLOB = null;
const M_BLOB = () => (BLOB ||= ps1Material({ map: TEX.blob, lit: false, transparent: true, fog: true, polygonOffset: -2, color: 0x9a9a9a }));
function materials() {
  if (MATS) return MATS;
  const paint = [0.85, 1.6, 70, 0.06];
  MATS = {
    side: ps1Material({ map: TEX.hcSide, gloss: paint, affine: false }),
    top: ps1Material({ map: TEX.hcTop, gloss: paint, affine: false }),
    chrome: ps1Material({ map: TEX.hcChrome, color: 0xb8b8bc, gloss: [0.9, 2.4, 36, 0.55], affine: false }),
    front: ps1Material({ map: TEX.hcFront, gloss: [0.5, 1.3, 50, 0.12], affine: false }),
    rear: ps1Material({ map: TEX.hcRear, gloss: [0.5, 1.3, 50, 0.12], affine: false }),
    headLens: ps1Material({ map: TEX.hcHeadLens, gloss: [0.5, 1.6, 90, 0.12], affine: false }),
    tailLens: ps1Material({ map: TEX.hcTailLens, gloss: [0.4, 1.4, 80, 0.1], affine: false }),
    glass: ps1Material({ color: 0x182026, transparent: true, opacity: 0.36, gloss: [1.0, 2.4, 160, 0.16], side: THREE.DoubleSide, affine: false }),
    wheel: ps1Material({ map: TEX.hcWheel, color: 0xa8a8ac, gloss: [0.55, 1.6, 40, 0.3], affine: false }),
    tire: ps1Material({ map: TEX.hcTire }),
    seat: ps1Material({ map: TEX.hcSeat, gloss: [0.18, 0.45, 18, 0.04] }),
    cloth: ps1Material({ map: TEX.hcCloth, side: THREE.DoubleSide }),
    dash: ps1Material({ map: TEX.hcDash, affine: false }),
    plate: ps1Material({ map: TEX.hcPlate, affine: false }),
    under: ps1Material({ color: 0x0c0c0d, side: THREE.DoubleSide }),
    black: ps1Material({ color: 0x141416, gloss: [0.3, 0.8, 30, 0.05] }),
  };
  return MATS;
}

// ---------- montagem ----------
export function buildHeroCar() {
  const A = new Acc(), mats = materials();
  const [hx, hz] = CAR.hinge, hinge = [hx, 0, hz];
  // peças da porta do motorista (lado +x, entre as emendas): a malha fica no espaço da dobradiça
  const inDoor = (p, minY = 0.2) => p[0] > 0.45 && p[2] < DOOR_F + 1e-3 && p[2] > DOOR_M - 1e-3 && p[1] > minY;
  const sideUV = p => [(p[2] - SIDE.z0) / (SIDE.z1 - SIDE.z0), (p[1] - SIDE.y0) / (SIDE.y1 - SIDE.y0)];
  const awayX = p => [Math.sign(p[0]) || 1, 0.15, 0];

  // ---- laterais ----
  for (const s of [1, -1]) {
    const rows = STATIONS.map(z => sideProfile(z).map(p => [p[0] * s, p[1], p[2]]));
    loft(A, 'side', rows, sideUV, {
      out: awayX, creases: [3],
      route: s > 0 ? ctr => (inDoor(ctr) ? 'door' : 'body') : null, doorOrigin: hinge,
    });
    // embaixo: fundo e o teto das caixas de roda
    const bottom = STATIONS.map(z => { const p = sideProfile(z)[0]; return [[p[0] * s, p[1], z], [0, Math.max(SKIRT, p[1]) + (p[1] > SKIRT + 0.01 ? 0 : 0.04), z]]; });
    loft(A, 'under', bottom, () => [0, 0], { out: () => [0, -1, 0] });
  }

  // ---- capô e tampa do porta-malas ----
  const topRows = (zs, front) => zs.map(z => {
    const e = sideProfile(z)[5], tip = (x) => (front ? 0.06 : -0.02) * (1 - x / e[0]) * smooth(front ? 2.3 : -2.4, front ? 2.62 : -2.64, z);
    const row = [];
    for (const k of [-1, -0.62, -0.2, 0, 0.2, 0.62, 1]) {
      const x = e[0] * k, ax = Math.abs(k);
      const y = e[1] - (ax < 0.99 ? 0.012 + (1 - ax) * 0.01 : 0) + (front ? 0 : 0.003);
      row.push([x, y, z + tip(Math.abs(x))]);
    }
    return row;
  });
  const hood = topRows([FRONT, 2.5, 2.34, 2.18, 2.0, 1.68, 1.33, 1.0, 0.78, DOOR_F], true);
  const deck = topRows([-1.8, -2.0, -2.2, -2.4, -2.55, REAR], false);
  const topUV = p => [p[0] * 0.9, p[2] * 0.9];
  loft(A, 'top', hood, topUV, { out: () => [0, 1, 0] });
  loft(A, 'top', deck, topUV, { out: () => [0, 1, 0] });

  // ---- frente: fundo escuro, grade com faróis, a beira do capô e o para-choque ----
  const endCap = (z, rowTop, dir) => {
    const L = sideProfile(z), pts = [];
    for (let j = 0; j < L.length; j++) pts.push([-L[j][0], L[j][1], z]);
    for (const p of rowTop) pts.push([p[0], p[1], z]);
    for (let j = L.length - 1; j >= 0; j--) pts.push([L[j][0], L[j][1], z]);
    const c = [0, 0.55, z];
    for (let i = 0; i < pts.length; i++) A.poly('body', 'under', [c, pts[i], pts[(i + 1) % pts.length]], [[0, 0], [0, 0], [0, 0]], [0, 0, dir]);
  };
  endCap(FRONT - 0.01, hood[0].slice(1, -1), 1);
  endCap(REAR + 0.01, deck[deck.length - 1].slice(1, -1), -1);
  // grade em "V" (o meio avança): três faixas na largura
  const gz = x => 2.625 + 0.055 * (1 - Math.abs(x) / 0.98);
  const gxs = [-0.98, -0.5, 0, 0.5, 0.98];
  // altura da beira do capô na frente (os paralamas um pouco mais altos que o meio)
  const e0 = sideProfile(FRONT)[5], lipY = x => e0[1] - (Math.abs(x) < e0[0] * 0.99 ? 0.012 + (1 - Math.min(1, Math.abs(x) / e0[0])) * 0.01 : 0);
  for (let i = 0; i < gxs.length - 1; i++) {
    const x0 = gxs[i], x1 = gxs[i + 1], u = x => (x + 1) / 2, v = y => (y - 0.4) / 0.4;
    A.poly('body', 'front', [[x0, 0.44, gz(x0)], [x1, 0.44, gz(x1)], [x1, 0.8, gz(x1)], [x0, 0.8, gz(x0)]], [[u(x0), v(0.44)], [u(x1), v(0.44)], [u(x1), v(0.8)], [u(x0), v(0.8)]], [0, 0, 1]);
    // beira do capô acima da grade
    A.poly('body', 'top', [[x0, 0.8, gz(x0)], [x1, 0.8, gz(x1)], [x1, lipY(x1), gz(x1) + 0.003], [x0, lipY(x0), gz(x0) + 0.003]], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [0, 0.2, 1]);
  }
  // lentes dos faróis (brilham com o farol ligado)
  const lensRing = (cx, cy, z, r, n, mat, out, sx = 1) => {
    const pts = [], uvs = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r, z]); uvs.push([0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5]); }
    A.poly('body', mat, pts, uvs, out);
  };
  for (const [cx, cy] of CAR.heads) lensRing(cx, cy, gz(cx) + 0.012, 0.064, 10, 'headLens', [0, 0, 1]);

  // ---- traseira: painel das lanternas e a beira da tampa ----
  {
    const z = REAR - 0.015, u = x => (x + 1) / 2, v = y => (y - 0.44) / 0.36;
    A.poly('body', 'rear', [[-0.97, 0.44, z], [0.97, 0.44, z], [0.97, 0.8, z], [-0.97, 0.8, z]], [[u(-0.97), v(0.44)], [u(0.97), v(0.44)], [u(0.97), v(0.8)], [u(-0.97), v(0.8)]], [0, 0, -1]);
    A.poly('body', 'top', [[-0.97, 0.8, z], [0.97, 0.8, z], [0.97, 0.928, z - 0.005], [-0.97, 0.928, z - 0.005]], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [0, 0.2, -1]);
    for (const [cx, cy] of CAR.tails) {
      const x0 = cx - 0.07, x1 = cx + 0.07, y0 = cy - 0.042, y1 = cy + 0.042;
      A.poly('body', 'tailLens', [[x0, y0, z - 0.008], [x1, y0, z - 0.008], [x1, y1, z - 0.008], [x0, y1, z - 0.008]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    }
  }

  // ---- para-choques cromados (envolvem as quinas) ----
  const bumper = (zc, dir) => {
    const plan = [[-1.0, 0.24], [-1.008, 0.08], [-0.975, -0.02], [-0.82, -0.07], [-0.42, -0.1], [0, -0.11], [0.42, -0.1], [0.82, -0.07], [0.975, -0.02], [1.008, 0.08], [1.0, 0.24]];
    const path = plan.map(([x, d], i) => {
      const a = plan[Math.max(0, i - 1)], b = plan[Math.min(plan.length - 1, i + 1)];
      const t = norm([b[0] - a[0], 0, -(b[1] - a[1]) * dir]);
      let N = norm(cross([0, 1, 0], t));
      const p = [x, 0, zc - d * dir];
      if (dot(N, sub(p, [0, 0, zc - dir * 0.6])) < 0) N = scl(N, -1);
      return { p, N, B: [0, 1, 0] };
    });
    const prof = [[-0.07, 0.44], [0.0, 0.438], [0.03, 0.415], [0.038, 0.37], [0.026, 0.322], [-0.02, 0.3], [-0.08, 0.298]];
    sweep(A, 'chrome', path, prof, { center: [0, 0.36, zc - dir * 0.6], uv: (p, i, j) => [i / 4, 1 - j / (prof.length - 1)] });
    // placa no meio
    const pz = zc + dir * 0.115, w = 0.2;
    A.poly('body', 'plate', [[-w, 0.3, pz], [w, 0.3, pz], [w, 0.39, pz], [-w, 0.39, pz]], dir > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]], [0, 0, dir]);
  };
  bumper(2.62, 1);
  bumper(-2.63, -1);

  // ---- frisos cromados das caixas de roda ----
  for (const s of [1, -1]) for (const a of [AXLE_F, AXLE_R]) {
    const path = [];
    for (let i = 0; i <= 10; i++) {
      const th = (i / 10) * Math.PI, z = a + ARCH_W * Math.cos(th), y = SKIRT + ARCH_H * Math.sin(th);
      const x = W(z) * 0.905 * s;
      const rad = norm([0, Math.sin(th) / ARCH_H, Math.cos(th) / ARCH_W]);
      path.push({ p: [x, y, z], N: rad, B: [s, 0, 0] });
    }
    sweep(A, 'chrome', path, [[-0.012, 0.0], [-0.012, 0.022], [0.016, 0.026], [0.02, 0.0]], {
      out: p => [Math.sign(p[0]), 0, 0], uv: (p, i, j) => [i / 3, j / 3],
      route: s > 0 ? ctr => (inDoor(ctr) ? 'door' : 'body') : null, doorOrigin: hinge,
    });
  }

  // ---- cabine: para-brisa, teto, vidro de trás, colunas e vidros laterais ----
  const GB = 0.955, GX = 0.865, RX = 0.705, RY = 1.36;   // base dos vidros e borda do teto
  const wsBase = k => [GX * k, GB + 0.004, 0.62 - 0.12 * k * k];
  const wsTop = k => [RX * k, RY + 0.012 * (1 - k * k), -0.14 - 0.08 * k * k];
  const rwTop = k => [RX * 0.96 * k, RY + 0.01 * (1 - k * k), -1.04 + 0.03 * k * k];
  const rwBase = k => [0.8 * k, 0.968, -1.8 + 0.05 * k * k];
  const KS = [-1, -0.65, -0.3, 0, 0.3, 0.65, 1];
  const grid = (f0, f1, n = 1) => Array.from({ length: n + 1 }, (_, i) => KS.map(k => { const a = f0(k), b = f1(k), t = i / n; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }));
  loft(A, 'glass', grid(wsBase, wsTop), () => [0.5, 0.5], { out: () => [0, 0.6, 1] });
  loft(A, 'glass', grid(rwTop, rwBase), () => [0.5, 0.5], { out: () => [0, 0.6, -1] });
  // teto com a curva do meio e a calha descendo nas bordas
  const roof = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    roof.push(KS.map(k => { const a = wsTop(k), b = rwTop(k), p = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; p[1] += 0.008 * Math.sin(Math.PI * t) * (1 - k * k); return p; }));
  }
  loft(A, 'top', roof, p => [p[0] * 0.9, p[2] * 0.9], { out: () => [0, 1, 0] });
  // forro do teto, por dentro
  A.poly('body', 'cloth', [wsTop(-0.97), wsTop(0.97), rwTop(0.97), rwTop(-0.97)].map(p => [p[0], p[1] - 0.03, p[2]]), [[0, 0], [1, 0], [1, 1], [0, 1]], [0, -1, 0]);
  for (const s of [1, -1]) {
    const S = q => [q[0] * s, q[1], q[2]];
    const out = [s, 0.35, 0];
    // coluna do para-brisa (cromada) e a calha do teto
    const a0 = wsBase(s), a1 = wsTop(s);
    A.poly('body', 'chrome', [a0, add(a0, [0.035 * s, -0.004, -0.03]), add(a1, [0.02 * s, -0.006, -0.03]), a1], [[0, 0], [1, 0], [1, 1], [0, 1]], [s, 0.3, 0.4]);
    sweep(A, 'chrome', [
      { p: add(a1, [0.008 * s, -0.004, -0.02]), N: [s, 0, 0], B: [0, 1, 0] },
      { p: S([RX + 0.008, RY - 0.004, -0.6]), N: [s, 0, 0], B: [0, 1, 0] },
      { p: add(rwTop(s), [0.008 * s, -0.004, 0.0]), N: [s, 0, 0], B: [0, 1, 0] },
    ], [[0, -0.02], [0.012, -0.012], [0.012, 0.006], [0, 0.01]], { out: () => [s, 0.2, 0] });
    // vidro da porta da frente (vai com a porta), vidro de trás e a coluna larga de trás
    const fg = [S([GX, GB, 0.5]), S([GX, GB, DOOR_M + 0.01]), S([RX, RY - 0.012, DOOR_M + 0.01]), S([RX, RY - 0.012, -0.2])];
    const glassPart = s > 0 ? 'door' : 'body';
    A.poly(glassPart, 'glass', fg, [[0, 0], [1, 0], [1, 1], [0, 1]], out, { origin: s > 0 ? hinge : null });
    A.poly('body', 'glass', [S([GX, GB, DOOR_M - 0.01]), S([GX, GB, -1.3]), S([RX, RY - 0.012, -0.9]), S([RX, RY - 0.012, DOOR_M - 0.01])], [[0, 0], [1, 0], [1, 1], [0, 1]], out);
    const sail = [S([GX + 0.01, GB, -1.3]), S([0.81, 0.963, -1.8]), S([rwTop(1)[0], rwTop(1)[1], rwTop(1)[2]]), S([RX, RY - 0.004, -0.9])];
    A.poly('body', 'top', sail, sail.map(p => [p[2] * 0.9, p[1] * 0.9]), out);
    // molduras cromadas dos vidros: a emenda dos vidros sem coluna e a borda da coluna de trás
    const edge = (p0, p1, part = 'body') => {
      const d = norm(sub(p1, p0)), side = norm(cross(d, [s, 0, 0])), w = 0.012;
      const o = [0.006 * s, 0, 0];
      A.poly(part, 'chrome', [add(add(p0, o), scl(side, -w)), add(add(p0, o), scl(side, w)), add(add(p1, o), scl(side, w)), add(add(p1, o), scl(side, -w))], [[0, 0], [1, 0], [1, 1], [0, 1]], [s, 0.3, 0], { origin: part === 'door' ? hinge : null });
    };
    edge(S([GX, GB, DOOR_M + 0.012]), S([RX, RY - 0.012, DOOR_M + 0.012]), s > 0 ? 'door' : 'body');
    edge(S([GX, GB, DOOR_M - 0.012]), S([RX, RY - 0.012, DOOR_M - 0.012]));
    edge(S([GX + 0.004, GB, -1.3]), S([RX, RY - 0.008, -0.9]));
    // friso cromado embaixo dos vidros, do para-brisa até a tampa de trás
    const belt = [];
    for (const z of [0.52, DOOR_F, 0.0, DOOR_M, -1.0, -1.5, -1.8]) belt.push({ p: S([GX + 0.004, GB - 0.004, z]), N: [s, 0, 0], B: [0, 1, 0] });
    sweep(A, 'chrome', belt, [[-0.01, 0.012], [0.012, 0.01], [0.022, -0.006], [0.02, -0.016]], {
      out: () => [s, 0.4, 0], route: s > 0 ? ctr => (inDoor(ctr, 0) ? 'door' : 'body') : null, doorOrigin: hinge,
    });
  }

  // ---- interior: peitoril, painéis das portas e assoalho ----
  const CAB = [DOOR_F, 0.3, 0.0, -0.3, DOOR_M, -0.72, -0.9, -1.1, -1.3, -1.55, -1.8];
  for (const s of [1, -1]) {
    // peitoril (pintado) e, para dentro, o painel da porta e o assoalho
    const sill = CAB.map(z => { const e = sideProfile(z)[5]; return [[e[0] * s, e[1], z], [GX * s, GB, z]]; });
    loft(A, 'top', sill, p => [p[2] * 0.9, p[0] * 0.9], {
      out: () => [0, 1, 0], route: s > 0 ? ctr => (inDoor(ctr, 0.45) ? 'door' : 'body') : null, doorOrigin: hinge,
    });
    const rows = CAB.map(z => [[GX * s, GB, z], [0.81 * s, 0.93, z], [0.79 * s, 0.45, z], [0.4 * s, 0.3, z], [0, 0.3, z]]);
    loft(A, 'cloth', rows, p => [p[2] * 2, p[1] * 2], {
      out: p => [-Math.sign(p[0]) || -1, 0.6, 0], creases: [1, 2],
      route: s > 0 ? (ctr, j) => (j <= 1 && inDoor(ctr, 0.45) ? 'door' : 'body') : null, doorOrigin: hinge,
    });
  }
  // painel: almofada de cima, frente com os relógios e a parede de baixo
  {
    const y0 = 0.58, y1 = 0.92, zf = 0.36, zt = 0.5;
    A.poly('body', 'black', [[-0.84, y1, zf], [0.84, y1, zf], [0.84, 0.975, zt + 0.08], [-0.84, 0.975, zt + 0.08]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, -0.3]);
    A.poly('body', 'dash', [[0.84, y0, zf + 0.04], [-0.84, y0, zf + 0.04], [-0.84, y1, zf], [0.84, y1, zf]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    A.poly('body', 'cloth', [[0.84, 0.3, 0.62], [-0.84, 0.3, 0.62], [-0.84, y0, zf + 0.04], [0.84, y0, zf + 0.04]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0.5, -1]);
    // coluna da direção
    const [wx, wy, wz] = CAR.wheel.c;
    A.poly('body', 'black', [[wx - 0.03, 0.72, zf + 0.02], [wx + 0.03, 0.72, zf + 0.02], [wx + 0.025, wy - 0.02, wz + 0.04], [wx - 0.025, wy - 0.02, wz + 0.04]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, -1]);
    // retrovisor interno
    A.poly('body', 'chrome', [[-0.12, 1.25, -0.06], [0.12, 1.25, -0.06], [0.12, 1.31, -0.08], [-0.12, 1.31, -0.08]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
  }
  // bancos inteiriços (couro cor de vinho): assento e encosto, na frente e atrás
  const bench = (zFront, zBack, top, backTop, backLean) => {
    const xs = [-0.78, 0.78], u = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const [xa, xb] = xs;
    const f = zFront, b = zBack, y0 = 0.3;
    A.poly('body', 'seat', [[xa, top, f], [xb, top, f], [xb, top - 0.02, b], [xa, top - 0.02, b]], u, [0, 1, 0]);
    A.poly('body', 'seat', [[xa, y0, f + 0.03], [xb, y0, f + 0.03], [xb, top, f], [xa, top, f]], u, [0, 0, 1]);
    const bt = b - backLean;
    A.poly('body', 'seat', [[xa, top - 0.02, b], [xb, top - 0.02, b], [xb, backTop, bt], [xa, backTop, bt]], u, [0, 0.2, 1]);
    A.poly('body', 'seat', [[xa, backTop, bt], [xb, backTop, bt], [xb, backTop - 0.02, bt - 0.12], [xa, backTop - 0.02, bt - 0.12]], u, [0, 1, 0]);
    A.poly('body', 'seat', [[xa, y0, b - 0.1], [xb, y0, b - 0.1], [xb, backTop - 0.02, bt - 0.12], [xa, backTop - 0.02, bt - 0.12]], u, [0, 0, -1]);
    // lados: o do assento e o do encosto (separados: juntos, o leque taparia o lugar de sentar)
    for (const x of xs) {
      A.poly('body', 'seat', [[x, y0, f + 0.03], [x, top, f], [x, top - 0.02, b], [x, y0, b]], [[0, 0], [1, 0], [1, 0.4], [0, 0.4]], [Math.sign(x), 0, 0]);
      A.poly('body', 'seat', [[x, y0, b], [x, top - 0.02, b], [x, backTop, bt], [x, backTop - 0.02, bt - 0.12], [x, y0, b - 0.1]], [[0, 0], [0.4, 0], [1, 0.5], [1, 0.6], [0, 0.6]], [Math.sign(x), 0, 0]);
    }
  };
  bench(-0.1, -0.64, 0.44, 1.0, 0.26);
  bench(-1.08, -1.52, 0.48, 0.94, 0.14);
  // prateleira de trás, embaixo do vidro
  A.poly('body', 'cloth', [[-0.8, 0.94, -1.5], [0.8, 0.94, -1.5], [0.8, 0.96, -1.8], [-0.8, 0.96, -1.8]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);

  // retrovisores externos (o do motorista vai na porta)
  for (const s of [1, -1]) {
    const base = [0.985 * s, 0.97, 0.42], part = s > 0 ? 'door' : 'body', o = { origin: s > 0 ? hinge : null };
    const q = (dx, dy, dz) => add(base, [dx * s, dy, dz]);
    A.poly(part, 'chrome', [q(0, 0, 0.04), q(0.06, 0.06, 0.03), q(0.06, 0.06, -0.03), q(0, 0, -0.04)], [[0, 0], [1, 0], [1, 1], [0, 1]], [s, 0.3, 0], o);
    A.poly(part, 'chrome', [q(0.05, 0.05, 0.05), q(0.15, 0.05, 0.05), q(0.15, 0.13, 0.05), q(0.05, 0.13, 0.05)], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, 1], o);
    A.poly(part, 'glass', [q(0.05, 0.05, 0.035), q(0.15, 0.05, 0.035), q(0.15, 0.13, 0.035), q(0.05, 0.13, 0.035)], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1], o);
  }
  // antena no paralama da frente (lado do passageiro)
  A.poly('body', 'chrome', [[-0.93, 0.88, 1.25], [-0.925, 0.88, 1.255], [-0.89, 1.72, 1.1], [-0.895, 1.72, 1.095]], [[0, 0], [1, 0], [1, 1], [0, 1]], [-1, 0, 0]);
  // escapamento
  A.poly('body', 'black', [[-0.62, 0.22, -2.66], [-0.5, 0.22, -2.66], [-0.5, 0.29, -2.66], [-0.62, 0.29, -2.66]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);

  // ---- volante: aro, aro da buzina e dois raios ----
  const WA = new Acc();
  {
    const R = CAR.wheel.r, n = 16, tube = 0.016;
    const ring = (r, t, mat) => {
      const path = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; path.push({ p: [Math.cos(a) * r, Math.sin(a) * r, 0], N: [Math.cos(a), Math.sin(a), 0], B: [0, 0, 1] }); }
      // a face aponta para fora do tubo (do eixo do aro), não do centro do volante
      const out = p => { const l = Math.hypot(p[0], p[1]) || 1; return [p[0] - p[0] / l * r, p[1] - p[1] / l * r, p[2]]; };
      sweep(WA, mat, path, [[t, 0], [0, t], [-t, 0], [0, -t], [t, 0]], { out, route: () => 'steer', uv: (p, i, j) => [i / n, j / 4] });
    };
    ring(R, tube, 'black');
    ring(R * 0.55, 0.006, 'chrome');
    for (const a of [-0.35, Math.PI + 0.35]) {
      const c = Math.cos(a), s = Math.sin(a);
      WA.poly('steer', 'black', [[c * 0.03, s * 0.03 + 0.012, 0.01], [c * R, s * R + 0.012, 0], [c * R, s * R - 0.012, 0], [c * 0.03, s * 0.03 - 0.012, 0.01]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    }
    WA.poly('steer', 'chrome', Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return [Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.015]; }), Array.from({ length: 8 }, () => [0.5, 0.5]), [0, 0, -1]);
  }

  // ---- rodas: pneu (16 lados), calota e o lado de dentro ----
  const RA = new Acc();
  {
    const R = WHEEL_R, w = 0.105, n = 16;
    const rim = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // seção do pneu: de dentro para fora (x), com o ombro arredondado
      rim.push([[-w, c * R * 0.86, s * R * 0.86], [-w * 0.9, c * R * 0.98, s * R * 0.98], [-w * 0.55, c * R, s * R], [w * 0.55, c * R, s * R], [w * 0.9, c * R * 0.98, s * R * 0.98], [w, c * R * 0.86, s * R * 0.86]]);
    }
    loft(RA, 'tire', rim, (p, i, j) => [i / 2, j / 5], { out: p => [0, p[1], p[2]], route: () => 'wheel' });
    const cap = (x, mat, dir, dome) => {
      const pts = [], uvs = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x, Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88]); uvs.push([0.5 + Math.cos(a) * 0.46, 0.5 + Math.sin(a) * 0.46]); }
      const c = { p: [x + dome * dir, 0, 0], n: [dir, 0, 0], uv: [0.5, 0.5] };
      for (let i = 0; i < n; i++) {
        const a = { p: pts[i], n: norm([dir, Math.cos(i / n * Math.PI * 2) * 0.3, Math.sin(i / n * Math.PI * 2) * 0.3]), uv: uvs[i] };
        const j = (i + 1) % n, b = { p: pts[j], n: norm([dir, Math.cos(j / n * Math.PI * 2) * 0.3, Math.sin(j / n * Math.PI * 2) * 0.3]), uv: uvs[j] };
        const fwd = dot(cross(sub(a.p, c.p), sub(b.p, c.p)), [dir, 0, 0]) > 0;
        RA.tri('wheel', mat, c, fwd ? a : b, fwd ? b : a);
      }
    };
    cap(w * 0.86, 'wheel', 1, 0.03);
    cap(-w * 0.86, 'under', -1, 0);
  }

  // ---- peças ----
  const body = A.build(mats), wheelParts = RA.build(mats), steerParts = WA.build(mats);
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  root.add(bodyG);
  for (const m of body.body || []) bodyG.add(m);
  const door = new THREE.Group();
  door.position.set(hinge[0], 0, hinge[2]);
  for (const m of body.door || []) door.add(m);
  bodyG.add(door);
  // o volante fica de frente para o motorista, perpendicular à coluna (o alto inclinado para a frente)
  const steer = new THREE.Group();
  steer.position.set(...CAR.wheel.c);
  steer.rotation.x = CAR.wheel.tilt;
  const steerSpin = new THREE.Group();
  steer.add(steerSpin);
  for (const m of steerParts.steer || []) steerSpin.add(m);
  bodyG.add(steer);
  const wheels = [];
  // rodas: esterço (turn) → meia-volta nas da direita, para a calota ficar para fora (flip) → giro (spin)
  for (const [x, z, front] of [[CAR.track, AXLE_F, true], [-CAR.track, AXLE_F, true], [CAR.track, AXLE_R, false], [-CAR.track, AXLE_R, false]]) {
    const turn = new THREE.Group(), flip = new THREE.Group(), spin = new THREE.Group();
    turn.position.set(x, WHEEL_R, z);
    flip.rotation.y = x < 0 ? Math.PI : 0;
    turn.add(flip); flip.add(spin);
    for (const m of wheelParts.wheel) spin.add(new THREE.Mesh(m.geometry, m.material));
    root.add(turn);
    wheels.push({ turn, spin, x, z, front, dir: x < 0 ? -1 : 1, y: WHEEL_R, vy: 0 });
  }

  // sombra de contato embaixo do carro (escurece o chão entre as rodas)
  const blobGeo = new THREE.PlaneGeometry(2.3, 5.9);
  blobGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
  const blob = new THREE.Mesh(blobGeo, M_BLOB());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.04;
  blob.renderOrder = 2;
  root.add(blob);

  const tris = A.triangles + RA.triangles * 4 + WA.triangles;
  return { root, body: bodyG, door, steer: steerSpin, wheels, mats, blob, triangles: tris };
}
