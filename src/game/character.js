import * as THREE from 'three';
import { ATLAS, REG, headU, headRow, hairline } from './heroTexture.js';

// Protagonista: loiro, pele clara, jaqueta de lona marrom, calça marrom-escura e botas.
// Malha única com esqueleto (~1200 triângulos) e sombreamento Gouraud. As juntas são
// "costuradas" (o anel do cotovelo/joelho divide o peso entre dois ossos), como nos
// personagens de PS1 da fase final; ombros, quadris e pés se sobrepõem ao tronco.
// Medidas em metros, na pose de repouso (braços caídos, frente para +z, +x = lado esquerdo).

const TAU = Math.PI * 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const centroid = pts => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// anel horizontal: φ = 0 nas costas (-z), 90° em +x, 180° na frente (+z).
// p < 1 deixa a seção mais quadrada; rzF/rzB = profundidade da frente/das costas
function ring(n, cx, y, cz, rx, rzF, rzB, p = 1) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, s = Math.sin(a), c = Math.cos(a);
    const ps = Math.sign(s) * Math.abs(s) ** p, pc = Math.sign(c) * Math.abs(c) ** p;
    pts.push([cx + rx * ps, y, cz - (c > 0 ? rzB : rzF) * pc]);
  }
  return pts;
}

// arco aberto na frente (gola); as pontas podem descer e avançar (bicos da gola)
function arc(y, cz, rx, rzF, rzB, a0, a1, segs, tip) {
  const pts = [];
  for (let j = 0; j <= segs; j++) {
    let a = a0 + ((a1 - a0) * j) / segs, yy = y;
    if (tip && (j === 0 || j === segs)) { a += (j === 0 ? -1 : 1) * tip.da; yy = tip.y; }
    const s = Math.sin(a), c = Math.cos(a);
    pts.push([rx * s, yy, cz - (c > 0 ? rzB : rzF) * c]);
  }
  return pts;
}

// anel em torno de um eixo qualquer (polegar)
function ringAxis(c, axis, r, n) {
  const e1 = norm(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1])), e2 = cross(axis, e1);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    pts.push(add(c, add(mul(e1, Math.cos(a) * r), mul(e2, Math.sin(a) * r))));
  }
  return pts;
}

// Junta triângulos com pesos de osso; normais suaves por grupo ('!' = facetado)
class SkinBuilder {
  constructor() { this.tris = []; }

  // vértice = { p, w: [[osso, peso]...], c: sombra }; uv em pixels do atlas.
  // inside = ponto interno da peça: a face é virada para fora dele
  tri(A, B, C, ua, ub, uc, g, inside) {
    let n = cross(sub(B.p, A.p), sub(C.p, A.p));
    if (inside && dot(n, sub(centroid([A.p, B.p, C.p]), inside)) < 0) {
      [B, C] = [C, B]; [ub, uc] = [uc, ub]; n = mul(n, -1);
    }
    this.tris.push({ v: [A, B, C], uv: [ua, ub, uc], n, g });
  }

  quad(A, B, C, D, ua, ub, uc, ud, g, inside) {
    this.tri(A, B, C, ua, ub, uc, g, inside);
    this.tri(A, C, D, ua, uc, ud, g, inside);
  }

  // anéis: { pts, w (lista ou função do ponto), v, c }; o: { reg, u(k), g, closed, inside(i, centro), capStart, capEnd }
  // v de cada anel e u(k) são relativos à região do atlas
  loft(rings, o) {
    const [rx, ry, rw] = REG[o.reg];
    const n = rings[0].pts.length, segs = o.closed === false ? n - 1 : n;
    const U = o.u || (k => (k / segs) * rw);
    const V = (r, k) => ({ p: r.pts[k % n], w: typeof r.w === 'function' ? r.w(r.pts[k % n]) : r.w, c: r.c ?? 1 });
    const T = (r, k) => [rx + U(k), ry + r.v];
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1];
      const mid = mul(add(centroid(A.pts), centroid(B.pts)), 0.5);
      for (let k = 0; k < segs; k++) {
        const q = [A.pts[k % n], A.pts[(k + 1) % n], B.pts[(k + 1) % n], B.pts[k % n]];
        const inside = o.inside?.(i, centroid(q)) ?? mid;
        this.quad(V(A, k), V(A, k + 1), V(B, k + 1), V(B, k), T(A, k), T(A, k + 1), T(B, k + 1), T(B, k), o.g, inside);
      }
    }
    const cap = (r, cp, inside) => {
      const P = { p: cp.p, w: r.w, c: cp.c ?? r.c ?? 1 };
      for (let k = 0; k < segs; k++) {
        this.tri(V(r, k), V(r, k + 1), P, T(r, k), T(r, k + 1), [rx + (U(k) + U(k + 1)) / 2, ry + cp.v], o.g, inside);
      }
    };
    if (o.capStart) cap(rings[0], o.capStart, centroid(rings[1].pts));
    if (o.capEnd) cap(rings[rings.length - 1], o.capEnd, centroid(rings[rings.length - 2].pts));
  }

  build() {
    const key = (g, p) => g + '|' + p.map(v => Math.round(v * 1e4)).join(',');
    const acc = new Map();
    for (const t of this.tris) {
      if (t.g[0] === '!') continue;
      for (const v of t.v) {
        const k = key(t.g, v.p), a = acc.get(k);
        if (a) { a[0] += t.n[0]; a[1] += t.n[1]; a[2] += t.n[2]; } else acc.set(k, [...t.n]);
      }
    }
    const pos = [], nor = [], uv = [], col = [], si = [], sw = [];
    for (const t of this.tris) {
      const fn = norm(t.n);
      t.v.forEach((v, j) => {
        const n = t.g[0] === '!' ? fn : norm(acc.get(key(t.g, v.p)));
        pos.push(...v.p); nor.push(...n);
        uv.push(t.uv[j][0] / ATLAS, 1 - t.uv[j][1] / ATLAS);
        col.push(v.c, v.c, v.c);
        const tot = v.w.reduce((s, w) => s + w[1], 0);
        for (let q = 0; q < 4; q++) { si.push(v.w[q] ? v.w[q][0] : 0); sw.push(v.w[q] ? v.w[q][1] / tot : 0); }
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.computeBoundingSphere();
    return geo;
  }
}

// ---------- modelo ----------
// juntas na pose de repouso (as mesmas posições dos ossos criados no Character)
const HIPS_Y = 0.93, NECK_Y = 1.48, HEAD_J = [0, 1.56, 0.01];
const SH_X = 0.23, SH_Y = 1.44, EL_DY = -0.29, WR_DY = -0.25;
const HIP_X = 0.09, HIP_DY = -0.06, KNEE_DY = -0.42, ANKLE_DY = -0.38;

// mechas: raiz, meio, ponta (coordenadas da cabeça), largura e altura na raiz
const LOCKS = [
  // franja penteada para o lado direito (-x)
  [[0.055, 0.252, 0.014], [0.048, 0.236, 0.064], [0.026, 0.202, 0.082], 0.05, 0.018],
  [[0.024, 0.26, 0.018], [0.014, 0.24, 0.068], [-0.012, 0.2, 0.084], 0.052, 0.02],
  [[-0.01, 0.26, 0.016], [-0.022, 0.238, 0.066], [-0.046, 0.206, 0.078], 0.05, 0.02],
  [[-0.042, 0.254, 0.008], [-0.058, 0.232, 0.056], [-0.078, 0.2, 0.062], 0.046, 0.018],
  // sobre as orelhas
  [[0.078, 0.218, -0.008], [0.097, 0.186, 0.006], [0.1, 0.152, 0.016], 0.04, 0.012],
  [[-0.078, 0.218, -0.008], [-0.097, 0.186, 0.006], [-0.1, 0.152, 0.016], 0.04, 0.012],
  // coroa e nuca
  [[0.012, 0.274, -0.03], [0.02, 0.262, -0.084], [0.026, 0.226, -0.114], 0.056, 0.02],
  [[-0.034, 0.264, -0.046], [-0.044, 0.236, -0.1], [-0.05, 0.182, -0.117], 0.05, 0.018],
];

function buildHero(b) {
  const B = new SkinBuilder();
  const S = [[b.spine, 1]], H = [[b.hips, 1]], HD = [[b.head, 1]];

  // --- tronco (jaqueta) ---
  const NT = 10;
  const T = (y, rx, f, bk, z, p, w, v, c) => ({ pts: ring(NT, 0, y, z, rx, f, bk, p), w, v, c });
  const hemW = [[b.hips, 0.6], [b.spine, 0.4]];
  const shoulderW = p => (Math.abs(p[0]) > 0.14 ? [[b.spine, 0.7], [b.sh[p[0] < 0 ? 0 : 1], 0.3]] : S);
  const torso = [
    T(0.875, 0.168, 0.114, 0.11, 0, 0.9, hemW, 47.5),
    T(1.08, 0.168, 0.115, 0.106, 0.004, 0.9, S, 34),
    T(1.25, 0.186, 0.126, 0.11, 0.008, 0.85, S, 22),
    T(1.36, 0.192, 0.118, 0.108, 0.006, 0.8, S, 14),
    T(1.44, 0.212, 0.096, 0.094, 0, 0.75, shoulderW, 8),
    T(1.493, 0.15, 0.08, 0.076, 0, 0.75, S, 3),
    T(1.517, 0.074, 0.07, 0.064, 0.004, 1, S, 0.5),
  ];
  B.loft(torso, { reg: 'jacket', g: 'torso' });
  // camisa no decote e barra por baixo (fecha a jaqueta)
  B.loft([{ ...torso[6], v: 0.5, c: 0.85 }, T(1.507, 0.056, 0.056, 0.052, 0.006, 1, [[b.spine, 0.5], [b.neck, 0.5]], 7.5, 0.7)],
    { reg: 'shirt', g: 'shirt', inside: () => [0, 1.3, 0] });
  B.loft([{ ...torso[0], c: 0.7 }, T(0.885, 0.14, 0.092, 0.09, 0, 1, hemW, 47.9, 0.45)],
    { reg: 'jacket', g: 'hem', inside: () => [0, 1.2, 0] });

  // --- gola dobrada, aberta na frente ---
  const a0 = TAU * (0.5 + 34 / 360), a1 = TAU * (1.5 - 34 / 360);
  const CA = { pts: arc(1.513, 0.004, 0.079, 0.074, 0.068, a0, a1, 8), w: S, v: 7.5, c: 0.8 };
  const CB = { pts: arc(1.572, 0.004, 0.084, 0.08, 0.076, a0, a1, 8), w: S, v: 0.5 };
  const CC = { pts: arc(1.508, 0.004, 0.122, 0.112, 0.104, a0, a1, 8, { da: 0.3, y: 1.462 }), w: S, v: 7.5 };
  B.loft([CA, CB], { reg: 'collarIn', g: 'collarIn', closed: false, inside: (i, c) => [c[0] * 3, c[1], c[2] * 3] });
  B.loft([CB, CC], { reg: 'collar', g: 'collar', closed: false, inside: () => [0, 1.42, 0.004] });

  // --- pescoço ---
  B.loft([
    { pts: ring(8, 0, 1.49, 0.012, 0.055, 0.052, 0.05), w: [[b.neck, 1]], v: 15.5, c: 0.9 },
    { pts: ring(8, 0, 1.64, 0.008, 0.052, 0.05, 0.052), w: HD, v: 0.5, c: 0.72 },
  ], { reg: 'skin', g: 'neck' });

  // --- cabeça: anéis do queixo ao alto, com o cabelo "inflado" acima da linha do cabelo ---
  const NH = 10;
  const HR = [ // y, rx, rzF, rzB, cz
    [0.02, 0.04, 0.022, 0.02, 0.078],
    [0.038, 0.07, 0.028, 0.05, 0.052],
    [0.068, 0.085, 0.05, 0.075, 0.03],
    [0.105, 0.09, 0.07, 0.095, 0.01],
    [0.145, 0.094, 0.075, 0.102, 0.002],
    [0.18, 0.095, 0.08, 0.102, -0.002],
    [0.215, 0.09, 0.07, 0.096, -0.006],
    [0.245, 0.068, 0.048, 0.075, -0.01],
  ];
  // relevo do rosto por anel: k = 5 é o centro da frente; 3/4 são espelhados em 7/6
  const MODS = {
    1: { 5: [0, 0, 0.004], 3: [0.006, 0, 0] },  // queixo e ângulo da mandíbula
    2: { 5: [0, 0, 0.004] },                     // lábios
    3: { 4: [0.003, 0, 0.004] },                 // maçãs do rosto
    4: { 4: [0, 0, -0.006], 5: [0, 0, 0.004] },  // olhos fundos, dorso do nariz
    5: { 4: [0, 0, 0.003] },                     // sobrancelhas
  };
  const HC = [0, 0.12, -0.01];
  const hairPush = (p, f, y) => add(p, mul(norm(sub(p, HC)), 0.014 * smooth(hairline(f), hairline(f) + 0.04, y)));
  const headRings = HR.map(([y, rx, f, bk, cz], i) => ({
    pts: ring(NH, 0, y, cz, rx, f, bk, 0.92).map((p, k) => {
      const m = MODS[i]?.[k] ?? (k > 5 && MODS[i]?.[NH - k] ? [-MODS[i][NH - k][0], MODS[i][NH - k][1], MODS[i][NH - k][2]] : null);
      if (m) p = add(p, m);
      return add(HEAD_J, hairPush(p, k / NH, y));
    }),
    w: HD, v: headRow(y) - REG.head[1], c: i < 2 ? 0.85 : 1,
  }));
  B.loft(headRings, {
    reg: 'head', g: 'head', u: k => headU(k / NH),
    capStart: { p: add(HEAD_J, [0, 0.01, 0.074]), v: headRow(0.012) - REG.head[1] },
    capEnd: { p: add(HEAD_J, [0, 0.276, -0.012]), v: headRow(0.262) - REG.head[1] },
  });

  // nariz (3 triângulos), mapeado na mesma projeção do rosto
  const hv = q => ({ p: add(HEAD_J, q), w: HD, c: 1 });
  const huv = q => {
    const f = ((Math.atan2(q[0] / 0.09, -(q[2] - 0.005) / 0.075) / TAU) + 1) % 1;
    return [headU(f), headRow(q[1])];
  };
  const nb = [0, 0.156, 0.08], nt = [0, 0.112, 0.098], nl = [-0.015, 0.1, 0.084], nr = [0.015, 0.1, 0.084];
  const nIn = add(HEAD_J, [0, 0.12, 0.05]);
  B.tri(hv(nb), hv(nl), hv(nt), huv(nb), huv(nl), huv(nt), 'nose', nIn);
  B.tri(hv(nb), hv(nt), hv(nr), huv(nb), huv(nt), huv(nr), 'nose', nIn);
  B.tri(hv(nl), hv(nr), hv(nt), huv(nl), huv(nr), huv(nt), 'nose', add(HEAD_J, [0, 0.13, 0.09]));

  // orelhas: contorno preso à cabeça, aba saliente e concha
  const EAR = [[0, 0.158], [-0.022, 0.168], [-0.036, 0.145], [-0.03, 0.112], [-0.01, 0.1]]; // (z, y)
  const euv = q => [REG.ear[0] + ((q[2] + 0.04) / 0.05) * 16, REG.ear[1] + ((0.172 - q[1]) / 0.075) * 16];
  for (const s of [-1, 1]) {
    const base = EAR.map(([z, y]) => [s * 0.088, y, z]);
    const rim = EAR.map(([z, y], i) => [s * (i >= 1 && i <= 3 ? 0.108 : 0.1), y, z - 0.004]);
    const ctr = [s * 0.1, 0.135, -0.016], inside = add(HEAD_J, [s * 0.07, 0.135, -0.016]);
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      B.quad(hv(base[i]), hv(base[j]), hv(rim[j]), hv(rim[i]), euv(base[i]), euv(base[j]), euv(rim[j]), euv(rim[i]), 'ear' + s, inside);
      B.tri(hv(rim[i]), hv(rim[j]), hv(ctr), euv(rim[i]), euv(rim[j]), euv(ctr), 'ear' + s, inside);
    }
  }

  // mechas de cabelo: prismas triangulares afinando até a ponta
  const HCw = add(HEAD_J, HC);
  LOCKS.forEach(([r, m, t, w0, h0], li) => {
    const P0 = add(HEAD_J, r), P1 = add(HEAD_J, m), P2 = add(HEAD_J, t);
    const sec = (p, dir, w, h) => {
      const n = norm(sub(p, HCw)), side = norm(cross(dir, n));
      return [add(add(p, mul(side, w / 2)), mul(n, -0.004)), add(add(p, mul(side, -w / 2)), mul(n, -0.004)), add(p, mul(n, h))];
    };
    const s0 = sec(P0, norm(sub(P1, P0)), w0, h0), s1 = sec(P1, norm(sub(P2, P0)), w0 * 0.75, h0 * 0.8);
    const off = (li * 7) % 16, us = [off, off + 5, off + 10, off + 15];
    const L = REG.lock, lv = p => ({ p, w: HD, c: 1 });
    const inside = centroid([...s0, ...s1]);
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3;
      B.quad(lv(s0[j]), lv(s0[k]), lv(s1[k]), lv(s1[j]),
        [L[0] + us[j], L[1] + 0.5], [L[0] + us[j + 1], L[1] + 0.5], [L[0] + us[j + 1], L[1] + 16], [L[0] + us[j], L[1] + 16], '!lock', inside);
      B.tri(lv(s1[j]), lv(s1[k]), lv(P2), [L[0] + us[j], L[1] + 16], [L[0] + us[j + 1], L[1] + 16], [L[0] + (us[j] + us[j + 1]) / 2, L[1] + 31.5], '!lock', centroid(s1));
    }
  });

  // --- bacia (calça) ---
  B.loft([
    { pts: ring(10, 0, 0.935, 0, 0.15, 0.098, 0.104, 0.9), w: H, v: 0.5, c: 0.6 },
    { pts: ring(10, 0, 0.855, 0, 0.152, 0.096, 0.106, 0.9), w: H, v: 10, c: 0.85 },
  ], { reg: 'pelvis', g: 'pelvis', capEnd: { p: [0, 0.79, 0.004], v: 15.5 } });

  for (const [i, s] of [[0, -1], [1, 1]]) {
    const sh = b.sh[i], el = b.el[i], hd = b.hand[i], hip = b.hip[i], knee = b.knee[i], ank = b.ankle[i];
    // coordenadas locais do lado +x, espelhadas para o outro lado (a textura espelha junto)
    const at = (j, q) => [s * (j[0] + q[0]), j[1] + q[1], j[2] + q[2]];
    const R = (j, n, y, rx, f, bk, cx, w, v, c, cz = 0) => ({ pts: ring(n, cx, y, cz, rx, f, bk).map(q => at(j, q)), w, v, c });

    // braço: ombro (domo sobre o tronco), cotovelo costurado, punho canelado
    const SJ = [SH_X, SH_Y, 0];
    const half = [[sh, 0.5], [el, 0.5]];
    const arm = [
      R(SJ, 8, -0.02, 0.057, 0.058, 0.056, 0, [[sh, 1]], 4),
      R(SJ, 8, -0.2, 0.047, 0.05, 0.048, 0, [[sh, 1]], 18),
      R(SJ, 8, EL_DY, 0.045, 0.046, 0.048, 0, half, 24),
      R(SJ, 8, EL_DY - 0.06, 0.046, 0.049, 0.05, 0, [[el, 1]], 29),
      R(SJ, 8, EL_DY - 0.16, 0.045, 0.047, 0.047, 0, [[el, 1]], 37),
      R(SJ, 8, EL_DY - 0.245, 0.045, 0.047, 0.047, 0, [[el, 1]], 47.5),
      R(SJ, 8, EL_DY - 0.232, 0.03, 0.032, 0.032, 0, [[el, 1]], 47.9, 0.5),
    ];
    B.loft(arm, {
      reg: 'sleeve', g: 'arm' + s, capStart: { p: at(SJ, [-0.025, 0.018, 0]), v: 0.5 },
      inside: k => (k === arm.length - 2 ? at(SJ, [0, -0.3, 0]) : undefined),
    });

    // mão: palma voltada para o corpo, dedos levemente curvados, polegar à frente
    const WJ = [SH_X, SH_Y + EL_DY + WR_DY, 0], HW = [[hd, 1]];
    B.loft([
      R(WJ, 6, 0.02, 0.022, 0.028, 0.028, 0, HW, 0.5),
      R(WJ, 6, -0.03, 0.02, 0.036, 0.034, 0, HW, 4),
      R(WJ, 6, -0.08, 0.021, 0.045, 0.042, -0.003, HW, 10),
      R(WJ, 6, -0.13, 0.017, 0.042, 0.04, -0.01, HW, 17, 1, 0.002),
      R(WJ, 6, -0.163, 0.011, 0.034, 0.032, -0.02, HW, 22),
    ], { reg: 'hand', g: 'hand' + s, capEnd: { p: at(WJ, [-0.025, -0.172, 0]), v: 23.5 } });
    const tb = [-0.012, -0.035, 0.026], tm = [-0.022, -0.072, 0.044], tt = [-0.026, -0.098, 0.048];
    B.loft([
      { pts: ringAxis(tb, norm(sub(tm, tb)), 0.012, 4).map(q => at(WJ, q)), w: HW, v: 0.5 },
      { pts: ringAxis(tm, norm(sub(tt, tb)), 0.01, 4).map(q => at(WJ, q)), w: HW, v: 5 },
    ], { reg: 'thumb', g: 'thumb' + s, capEnd: { p: at(WJ, tt), v: 7.5 } });

    // perna: coxa, joelho costurado, canela e barra sobre a bota
    const LJ = [HIP_X, HIPS_Y + HIP_DY, 0];
    const leg = [
      R(LJ, 8, 0.03, 0.078, 0.086, 0.092, 0, [[hip, 1]], 0.5, 0.85),
      R(LJ, 8, -0.24, 0.068, 0.074, 0.072, 0, [[hip, 1]], 20),
      R(LJ, 8, KNEE_DY, 0.056, 0.062, 0.056, 0, [[hip, 0.5], [knee, 0.5]], 33),
      R(LJ, 8, KNEE_DY - 0.07, 0.054, 0.056, 0.062, 0, [[knee, 1]], 38),
      R(LJ, 8, KNEE_DY - 0.18, 0.055, 0.055, 0.066, 0, [[knee, 1]], 46),
      R(LJ, 8, KNEE_DY - 0.325, 0.062, 0.066, 0.066, 0, [[knee, 1]], 63.5),
      R(LJ, 8, KNEE_DY - 0.312, 0.046, 0.048, 0.048, 0, [[knee, 1]], 63.9, 0.5),
    ];
    B.loft(leg, { reg: 'pants', g: 'leg' + s, inside: k => (k === leg.length - 2 ? at(LJ, [0, -0.6, 0]) : undefined) });

    // bota: cano dentro da barra da calça + pé com solado
    const AJ = [HIP_X, HIPS_Y + HIP_DY + KNEE_DY + ANKLE_DY, 0], AW = [[ank, 1]];
    B.loft([
      R(AJ, 8, 0.075, 0.046, 0.05, 0.05, 0, AW, 0.5),
      R(AJ, 8, -0.025, 0.05, 0.056, 0.054, 0, AW, 7.5, 1, 0.002),
    ], { reg: 'boot', g: 'shaft' + s });
    const sec = (z, hw, top, bot, cx) => [
      [cx + 0.55 * hw, top, z], [cx + hw, (top + bot) / 2 + 0.01, z], [cx + 1.05 * hw, bot + 0.016, z], [cx + 0.8 * hw, bot, z],
      [cx - 0.8 * hw, bot, z], [cx - 1.05 * hw, bot + 0.016, z], [cx - hw, (top + bot) / 2 + 0.01, z], [cx - 0.55 * hw, top, z],
    ].map(q => at(AJ, q));
    B.loft([
      { pts: sec(-0.07, 0.042, 0.005, -0.07, 0), w: AW, v: 9 },
      { pts: sec(-0.02, 0.051, 0.026, -0.07, 0), w: AW, v: 14 },
      { pts: sec(0.065, 0.056, -0.01, -0.07, 0.004), w: AW, v: 22 },
      { pts: sec(0.14, 0.05, -0.033, -0.07, 0.008), w: AW, v: 29 },
    ], {
      reg: 'boot', g: 'foot' + s,
      capStart: { p: at(AJ, [0, -0.035, -0.079]), v: 8.5 },
      capEnd: { p: at(AJ, [0.009, -0.051, 0.18]), v: 31.5 },
    });
  }
  return B.build();
}

export class Character {
  constructor(M) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.95);
    const bones = [];
    const J = (parent, x, y, z) => { const o = new THREE.Bone(); o.position.set(x, y, z); parent.add(o); bones.push(o); return o; };
    const idx = o => bones.indexOf(o);

    this.hips = J(this.root, 0, HIPS_Y, 0);
    this.spine = J(this.hips, 0, 0.05, 0);
    this.neck = J(this.spine, 0, NECK_Y - HIPS_Y - 0.05, 0);
    this.head = J(this.neck, HEAD_J[0], HEAD_J[1] - NECK_Y, HEAD_J[2]);
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = J(this.spine, side * SH_X, SH_Y - HIPS_Y - 0.05, 0);
      const el = J(sh, 0, EL_DY, 0);
      const hand = J(el, 0, WR_DY, 0);
      this.arms.push({ sh, el, hand, side });
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = J(this.hips, side * HIP_X, HIP_DY, 0);
      const knee = J(hip, 0, KNEE_DY, 0);
      const ankle = J(knee, 0, ANKLE_DY, 0);
      this.legs.push({ hip, knee, ankle, side });
    }

    const geo = buildHero({
      hips: idx(this.hips), spine: idx(this.spine), neck: idx(this.neck), head: idx(this.head),
      sh: this.arms.map(a => idx(a.sh)), el: this.arms.map(a => idx(a.el)), hand: this.arms.map(a => idx(a.hand)),
      hip: this.legs.map(l => idx(l.hip)), knee: this.legs.map(l => idx(l.knee)), ankle: this.legs.map(l => idx(l.ankle)),
    });
    this.triangles = geo.getAttribute('position').count / 3;
    const mesh = new THREE.SkinnedMesh(geo, M.hero);
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    this.mesh = mesh;

    // sombra redonda
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), M.blob);
    blob.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    this.blob = blob;

    this.phase = 0; this.walk = 0; this.run = 0; this.air = 0; this.t = 0;
    this.lastStepSign = 1;
    this.onStep = null;
  }

  update(dt, speed, grounded, running) {
    this.t += dt;
    const targetWalk = Math.min(1, speed / 1.6);
    const targetRun = Math.max(0, Math.min(1, (speed - 2.4) / 2.2));
    this.walk += (targetWalk - this.walk) * Math.min(1, dt * 8);
    this.run += (targetRun - this.run) * Math.min(1, dt * 6);
    this.air += ((grounded ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    const stride = 1.25 + this.run * 2.0;
    this.phase += (speed / stride) * Math.PI * 2 * dt * (grounded ? 1 : 0.2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const w = this.walk * (1 - this.air), r = this.run;
    const A = 0.42 * w + 0.32 * r * (1 - this.air);
    const K = 0.55 * w + 0.7 * r;
    const [L, Rr] = this.legs;
    L.hip.rotation.x = -s * A - this.air * 0.55;
    Rr.hip.rotation.x = s * A - this.air * 0.25;
    L.knee.rotation.x = Math.max(0, c) * K + 0.06 * w + this.air * 0.9;
    Rr.knee.rotation.x = Math.max(0, -c) * K + 0.06 * w + this.air * 0.5;
    L.ankle.rotation.x = -L.knee.rotation.x * 0.3; Rr.ankle.rotation.x = -Rr.knee.rotation.x * 0.3;
    const AA = 0.38 * w + 0.45 * r;
    const [aL, aR] = this.arms;
    const idle = (1 - w) * (1 - this.air);
    aL.sh.rotation.x = s * AA - this.air * 0.9; aR.sh.rotation.x = -s * AA - this.air * 0.9;
    aL.sh.rotation.z = -0.08 - this.air * 0.3 - idle * 0.03; aR.sh.rotation.z = 0.08 + this.air * 0.3 + idle * 0.03;
    aL.el.rotation.x = -0.2 - 0.9 * r - 0.15 * w; aR.el.rotation.x = -0.2 - 0.9 * r - 0.15 * w;
    // punhos acompanham o balanço dos braços
    aL.hand.rotation.x = -0.1 - s * 0.12 * w; aR.hand.rotation.x = -0.1 + s * 0.12 * w;
    this.hips.position.y = HIPS_Y - Math.abs(c) * 0.035 * w - Math.abs(c) * 0.05 * r + Math.sin(this.t * 1.6) * 0.004 * idle;
    this.spine.rotation.x = 0.04 * w + 0.22 * r + Math.sin(this.t * 1.6) * 0.012 * idle;
    this.spine.rotation.y = -s * 0.08 * w;
    this.hips.rotation.y = s * 0.06 * w;
    this.head.rotation.x = -0.1 * r + Math.sin(this.t * 0.7) * 0.02 * idle;
    this.head.rotation.y = Math.sin(this.t * 0.37) * 0.25 * idle * (Math.sin(this.t * 0.11) > 0.6 ? 1 : 0.2);
    // passos
    const sign = Math.sign(s) || 1;
    if (grounded && speed > 0.3 && sign !== this.lastStepSign) this.onStep?.(running);
    this.lastStepSign = sign;
  }
}
