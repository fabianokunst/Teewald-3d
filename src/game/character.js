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

  // caps: cápsulas { a, b, r, skip: [ossos] } que fazem sombra de oclusão nos vértices de
  // outras partes (assada na cor dos vértices, na pose de repouso)
  build(caps = []) {
    const occlusion = (p, n, w) => {
      let bone = w[0][0], best = w[0][1], occ = 0;
      for (const [i, k] of w) if (k > best) { best = k; bone = i; }
      for (const c of caps) {
        if (c.skip.includes(bone)) continue;
        const ab = sub(c.b, c.a), t = Math.max(0, Math.min(1, dot(sub(p, c.a), ab) / dot(ab, ab)));
        const v = sub(add(c.a, mul(ab, t)), p), d = Math.hypot(v[0], v[1], v[2]);
        if (d <= c.r * 1.02) continue;
        const cos = dot(n, v) / d;
        if (cos > 0) occ += (c.r * c.r) / (d * d) * cos;
      }
      return 1 - Math.min(0.32, occ * 0.6);
    };
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
        const c = v.c * (caps.length ? occlusion(v.p, n, v.w) : 1);
        col.push(c, c, c);
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
// mechas do cabelo penteado para trás: pontos sobre a calota do cabelo dados por
// [fração da volta (0 = nuca, 0.5 = testa), altura, afastamento], largura e altura na raiz
const LOCKS = [
  // da testa por cima da cabeça até a nuca (dão volume ao topete)
  [[[0.47, 0.232, 0.003], [0.47, 0.258, 0.005], [0.02, 0.255, 0.004], [0.04, 0.212, 0]], 0.055, 0.009],
  [[[0.53, 0.232, 0.003], [0.53, 0.258, 0.005], [0.98, 0.255, 0.004], [0.96, 0.212, 0]], 0.055, 0.009],
  [[[0.41, 0.225, 0.002], [0.405, 0.25, 0.004], [0.09, 0.25, 0.004], [0.1, 0.205, 0]], 0.05, 0.008],
  [[[0.59, 0.225, 0.002], [0.595, 0.25, 0.004], [0.91, 0.25, 0.004], [0.9, 0.205, 0]], 0.05, 0.008],
  // laterais, para trás por cima das orelhas
  [[[0.335, 0.205, 0.001], [0.27, 0.198, 0.003], [0.17, 0.168, 0]], 0.04, 0.007],
  [[[0.665, 0.205, 0.001], [0.73, 0.198, 0.003], [0.83, 0.168, 0]], 0.04, 0.007],
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
    { pts: ring(8, 0, 1.49, 0.012, 0.058, 0.055, 0.053), w: [[b.neck, 1]], v: 15.5, c: 0.9 },
    { pts: ring(8, 0, 1.64, 0.008, 0.055, 0.052, 0.054), w: HD, v: 0.5, c: 0.72 },
  ], { reg: 'skin', g: 'neck' });

  // --- cabeça: anéis do queixo ao alto, com o cabelo "inflado" acima da linha do cabelo ---
  const NH = 10;
  const HR = [ // y, rx, rzF, rzB, cz
    [0.022, 0.046, 0.018, 0.03, 0.058],    // base do queixo (logo atrás dos lábios, não à frente)
    [0.04, 0.069, 0.029, 0.054, 0.05],
    [0.068, 0.083, 0.05, 0.075, 0.03],
    [0.105, 0.089, 0.07, 0.095, 0.01],
    [0.145, 0.094, 0.075, 0.102, 0.002],
    [0.18, 0.095, 0.08, 0.102, -0.002],
    [0.215, 0.09, 0.07, 0.096, -0.006],
    [0.245, 0.068, 0.048, 0.075, -0.01],
  ];
  // relevo do rosto por anel: k = 5 é o centro da frente; 3/4 são espelhados em 7/6
  const MODS = {
    1: { 5: [0, 0, 0.004], 3: [0.009, 0, -0.004] },  // queixo e ângulo da mandíbula (quadrada)
    2: { 5: [0, 0, 0.004] },                     // lábios
    3: { 4: [0.002, 0, 0.003] },                 // maçãs do rosto
    4: { 4: [0, 0, -0.008], 5: [0, 0, 0.004] },  // olhos fundos, dorso do nariz
    5: { 4: [0, 0, 0.003], 5: [0, 0, 0.003] },   // arco das sobrancelhas
  };
  const HC = [0, 0.12, -0.01];
  const hairPush = (p, f, y) => add(p, mul(norm(sub(p, HC)), 0.014 * smooth(hairline(f), hairline(f) + 0.04, y) * (0.65 + 0.35 * smooth(0.17, 0.24, y))));
  // ponto na calota do cabelo (fração da volta, altura), afastado `lift` para fora
  const shellPoint = ([f, y, lift]) => {
    const rows = [...HR, [0.262, 0, 0, 0, -0.012]];
    let i = rows.findIndex(r => r[0] >= y);
    if (i < 1) i = i === 0 ? 1 : rows.length - 1;
    const A = rows[i - 1], Bq = rows[i], t = Math.max(0, Math.min(1, (y - A[0]) / (Bq[0] - A[0])));
    const L = j => A[j] + (Bq[j] - A[j]) * t;
    const an = f * TAU, sn = Math.sin(an), cs = Math.cos(an);
    const p = [L(1) * Math.sign(sn) * Math.abs(sn) ** 0.92, y, L(4) - (cs > 0 ? L(3) : L(2)) * Math.sign(cs) * Math.abs(cs) ** 0.92];
    const q = hairPush(p, f, y);
    return add(HEAD_J, add(q, mul(norm(sub(q, HC)), lift)));
  };
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
    capStart: { p: add(HEAD_J, [0, 0.013, 0.05]), v: headRow(0.012) - REG.head[1] },
    capEnd: { p: add(HEAD_J, [0, 0.276, -0.012]), v: headRow(0.262) - REG.head[1] },
  });

  // nariz (3 triângulos), mapeado na mesma projeção do rosto
  const hv = q => ({ p: add(HEAD_J, q), w: HD, c: 1 });
  const huv = q => {
    const f = ((Math.atan2(q[0] / 0.09, -(q[2] - 0.005) / 0.075) / TAU) + 1) % 1;
    return [headU(f), headRow(q[1])];
  };
  const nb = [0, 0.162, 0.08], nt = [0, 0.108, 0.099], nl = [-0.013, 0.099, 0.084], nr = [0.013, 0.099, 0.084];
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
  LOCKS.forEach(([pts, w0, h0], li) => {
    const P = pts.map(shellPoint), n = P.length - 1, tip = P[n];
    const sec = (i) => {
      const p = P[i], dir = norm(sub(P[i + 1], P[Math.max(0, i - 1)]));
      const nn = norm(sub(p, HCw)), side = norm(cross(dir, nn)), k = 1 - 0.3 * (i / n);
      return [add(add(p, mul(side, w0 * k / 2)), mul(nn, -0.004)), add(add(p, mul(side, -w0 * k / 2)), mul(nn, -0.004)), add(p, mul(nn, h0 * k))];
    };
    const S = P.slice(0, n).map((_, i) => sec(i));
    const off = (li * 7) % 16, us = [off, off + 5, off + 10, off + 15];
    const L = REG.lock, lv = p => ({ p, w: HD, c: 1 }), V = i => L[1] + 0.5 + (i / n) * 20;
    for (let i = 0; i < S.length; i++) {
      const a0 = S[i], a1 = S[i + 1];
      for (let j = 0; j < 3; j++) {
        const k = (j + 1) % 3;
        if (a1) {
          B.quad(lv(a0[j]), lv(a0[k]), lv(a1[k]), lv(a1[j]),
            [L[0] + us[j], V(i)], [L[0] + us[j + 1], V(i)], [L[0] + us[j + 1], V(i + 1)], [L[0] + us[j], V(i + 1)], '!lock', centroid([...a0, ...a1]));
        } else {
          B.tri(lv(a0[j]), lv(a0[k]), lv(tip), [L[0] + us[j], V(i)], [L[0] + us[j + 1], V(i)], [L[0] + (us[j] + us[j + 1]) / 2, L[1] + 31.5], '!lock', centroid(a0));
        }
      }
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
    // a ponta do pé dobra nos dedos (calcanhar sobe ao sair do chão)
    B.loft([
      { pts: sec(-0.07, 0.042, 0.005, -0.07, 0), w: AW, v: 9 },
      { pts: sec(-0.02, 0.051, 0.026, -0.07, 0), w: AW, v: 14 },
      { pts: sec(0.065, 0.056, -0.01, -0.07, 0.004), w: [[ank, 0.8], [b.toe[i], 0.2]], v: 22 },
      { pts: sec(0.14, 0.05, -0.033, -0.07, 0.008), w: [[b.toe[i], 1]], v: 29 },
    ], {
      reg: 'boot', g: 'foot' + s,
      capStart: { p: at(AJ, [0, -0.035, -0.079]), v: 8.5 },
      capEnd: { p: at(AJ, [0.009, -0.051, 0.18]), v: 31.5 },
    });
  }
  // oclusão: tronco, braços e pernas escurecem axilas, lados do tronco e o lado de dentro das coxas
  const caps = [{ a: [0, 0.95, -0.005], b: [0, 1.34, -0.005], r: 0.11, skip: [b.spine, b.hips, b.neck] }];
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, x = s * SH_X;
    caps.push(
      { a: [x, 1.33, 0], b: [x, 1.17, 0], r: 0.048, skip: [b.sh[i], b.el[i]] },
      { a: [x, 1.12, 0.01], b: [x, 0.93, 0.01], r: 0.044, skip: [b.el[i], b.sh[i], b.hand[i]] },
      { a: [s * HIP_X, 0.82, 0], b: [s * HIP_X, 0.5, 0], r: 0.07, skip: [b.hip[i], b.knee[i], b.hips] },
      { a: [s * HIP_X, 0.44, 0], b: [s * HIP_X, 0.14, 0], r: 0.054, skip: [b.knee[i], b.hip[i], b.ankle[i]] },
    );
  }
  return B.build(caps);
}

// ---------- animação ----------
// Andar e correr por fase de passada, com IK nas pernas: o pé apoiado fica parado no chão
// (no espaço do corpo ele anda para trás na mesma velocidade), rola do calcanhar para a
// ponta, e o quadril só sobe até onde as pernas alcançam. Braços, tronco e cabeça seguem
// a mesma fase. Os moradores usam a mesma animação.
const LEG_A = -KNEE_DY, LEG_B = -ANKLE_DY, LEG_MAX = (LEG_A + LEG_B) * 0.999;
const ANKLE_H = HIPS_Y + HIP_DY + KNEE_DY + ANKLE_DY;   // tornozelo acima do chão, em pé
const HEEL_Z = -0.062, BALL_Z = 0.088;                 // calcanhar e bola do pé no chão (z a partir do tornozelo)
const TOE_J = [0, -0.056, 0.088];                     // junta dos dedos
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t * t * (3 - 2 * t);
const wrapPi = a => a - Math.round(a / TAU) * TAU;

// nado de peito, quadros-chave pela fase da braçada (0..1, volta ao começo)
// braço: [fase, ombro x (- = para a frente), ombro z (abre), cotovelo x, mão x]
const SWIM_ARM = [
  [0.00, -2.6, 0.12, -0.1, 0.1],     // deslizando: braços esticados à frente
  [0.12, -2.55, 0.35, -0.15, 0.3],   // começa a abrir
  [0.38, -1.75, 0.95, -1.1, 0.45],   // puxada: para fora e para baixo
  [0.52, -1.15, 0.25, -2.1, -0.2],   // mãos juntas embaixo do queixo
  [0.70, -2.6, 0.1, -0.15, 0.05],    // estica de novo
];
// perna: [fase, quadril x (- = coxa para a frente), quadril z (abre), joelho, tornozelo (+ = ponta)]
const SWIM_LEG = [
  [0.00, 0.05, 0.05, 0.1, 1.2],      // juntas e esticadas, pés em ponta
  [0.40, 0.05, 0.08, 0.15, 1.1],
  [0.56, -0.7, 0.4, 2.0, -0.1],      // encolhe: calcanhares sobem, joelhos abrem
  [0.68, -0.25, 0.6, 0.5, 0.0],      // chuta para fora
  [0.80, 0.05, 0.06, 0.1, 1.2],      // fecha
];
function keyAt(K, u, out) {
  let i = K.length - 1;
  for (let j = 0; j < K.length; j++) if (K[j][0] <= u) i = j;
  const a = K[i], b = K[(i + 1) % K.length];
  const span = (b[0] - a[0] + 1) % 1 || 1, t = ease(((u - a[0] + 1) % 1) / span);
  for (let j = 1; j < a.length; j++) out[j - 1] = lerp(a[j], b[j], t);
  return out;
}
const _kA = [0, 0, 0, 0], _kL = [0, 0, 0, 0], _eu2 = new THREE.Euler();
const _hj = new THREE.Vector3(), _d = new THREE.Vector3(), _pn = new THREE.Vector3(), _th = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _tg = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');

// passada para a velocidade v (m/s); act dá o ritmo (girar no lugar também dá passos); r = corrida
function gaitParams(v, act, r, g) {
  const f = a => lerp(0.62 + 0.47 * a, 1.2 + 0.125 * a, r);   // ciclos por segundo (andando a 1,75 m/s: 1,4)
  g.f = f(act);
  const S = v / f(v);                                         // passada (um ciclo) em metros
  g.duty = lerp(0.6, clamp(0.42 - 0.014 * v, 0.3, 0.38), r);   // parte do ciclo com o pé no chão
  g.e = g.duty * S / 2;                                       // meio curso do pé apoiado
  g.c = -lerp(0.025, 0.12, r) * Math.min(1, S / 1.2);         // centro do apoio, um pouco atrás do quadril
  const k = Math.min(1, v / 1.4);
  g.lift = lerp(0.025 + 0.05 * Math.min(1, act / 1.4), 0.12 + 0.045 * v, r);   // altura do pé no ar
  g.hs = lerp(0.3 * k, 0.1, r);       // ponta para cima no toque (calcanhar primeiro)
  g.sH = lerp(0.17, 0.08, r);         // parte do apoio rolando do calcanhar
  g.sT = lerp(0.52, 0.32, r);         // daqui em diante o calcanhar sobe
  g.to = lerp(0.6 * k, 0.85, r);      // calcanhar levantado na saída
  g.run = r;
}

// pé apoiado na fração s do apoio, com o ponto plantado em G (ao longo do movimento):
// gira em volta do calcanhar no toque e em volta da bola do pé na saída
function stanceFoot(s, G, g, o) {
  if (s < g.sH && g.hs > 0) {
    const t = g.hs * (1 - ease(s / g.sH)), c = Math.cos(t), sn = Math.sin(t);
    o.z = G + HEEL_Z - HEEL_Z * c - ANKLE_H * sn; o.y = -HEEL_Z * sn + ANKLE_H * c; o.pitch = -t; o.toe = 0;
  } else if (s > g.sT) {
    const q = (s - g.sT) / (1 - g.sT), t = g.to * q * q * (1.6 - 0.6 * q), c = Math.cos(t), sn = Math.sin(t);
    o.z = G + BALL_Z - BALL_Z * c + ANKLE_H * sn; o.y = BALL_Z * sn + ANKLE_H * c; o.pitch = t; o.toe = -t;
  } else { o.z = G; o.y = ANKLE_H; o.pitch = 0; o.toe = 0; }
}

// pé de uma perna na fase u (0 = toque no chão): tornozelo (z ao longo do movimento, y),
// inclinação, dedos e peso de apoio (w)
const F0 = {}, F1 = {};
function gaitFoot(u, g, o) {
  if (u < g.duty) {
    const s = u / g.duty;
    stanceFoot(s, g.c + g.e - 2 * g.e * s, g, o);
    o.w = Math.min(1, s / 0.1, (1 - s) / 0.1);
    return;
  }
  // no ar: da saída até o próximo toque; correndo, o calcanhar sobe atrás antes de ir à frente
  const s = (u - g.duty) / (1 - g.duty), r = g.run;
  stanceFoot(1, g.c - g.e, g, F0);
  stanceFoot(0, g.c + g.e, g, F1);
  o.z = lerp(F0.z, F1.z, lerp(ease(s), ease(clamp((s - 0.14) / 0.78, 0, 1)), r));
  o.y = lerp(F0.y, F1.y, s) + g.lift * Math.sin(Math.PI * Math.pow(s, lerp(0.75, 0.8, r)));
  o.pitch = lerp(F0.pitch, F1.pitch, ease(clamp((s - 0.08) / 0.75, 0, 1)));
  o.toe = F0.toe * (1 - ease(Math.min(1, s / 0.3)));
  o.w = 0;
}

export class Character {
  // material: atlas de outro personagem (moradores usam a mesma malha e o mesmo esqueleto)
  constructor(M, material = M.hero) {
    this.hero = material === M.hero;
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.95);
    const bones = [];
    const J = (parent, x, y, z) => { const o = new THREE.Bone(); o.position.set(x, y, z); parent.add(o); bones.push(o); return o; };
    const idx = o => bones.indexOf(o);

    this.hips = J(this.root, 0, HIPS_Y, 0);
    this.spine = J(this.hips, 0, 0.05, 0);
    this.neck = J(this.spine, 0, NECK_Y - HIPS_Y - 0.05, 0);
    this.head = J(this.neck, HEAD_J[0], HEAD_J[1] - NECK_Y, HEAD_J[2]);
    for (const o of [this.hips, this.spine, this.neck, this.head]) o.rotation.order = 'YXZ';
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
    // dedos dos pés (bola do pé): dobram quando o calcanhar sobe
    for (const l of this.legs) l.toe = J(l.ankle, ...TOE_J);

    // os ossos nascem sempre na mesma ordem: a geometria é a mesma para todos
    const geo = Character.geo ||= buildHero({
      hips: idx(this.hips), spine: idx(this.spine), neck: idx(this.neck), head: idx(this.head),
      sh: this.arms.map(a => idx(a.sh)), el: this.arms.map(a => idx(a.el)), hand: this.arms.map(a => idx(a.hand)),
      hip: this.legs.map(l => idx(l.hip)), knee: this.legs.map(l => idx(l.knee)), ankle: this.legs.map(l => idx(l.ankle)),
      toe: this.legs.map(l => idx(l.toe)),
    });
    this.triangles = geo.getAttribute('position').count / 3;
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    this.mesh = mesh;
    // cabeça um pouco menor que a do modelo: proporção adulta, menos cartunesca
    this.head.scale.setScalar(0.93);

    // sombra redonda
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), M.blob);
    blob.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    this.blob = blob;

    // estado da animação
    this.shY = this.arms.map(a => a.sh.position.y);
    this.t = 0; this.cyc = 0;                 // fase da passada (0..1): a perna 0 toca o chão em 0
    this.move = 0; this.run = 0; this.air = 0; // misturas: andando, correndo, no ar
    this.dir = [0, 1]; this.back = 1;          // direção do movimento (no espaço do personagem); -1 = de costas
    this.turn = 0; this.yaw0 = null; this.acc = 0; this.v0 = 0; this.ex = 0;
    this.drop = 0; this.landY = 0; this.landV = 0; this.vy = 0; this.grounded = true; this.lead = 0;
    this.ws = 0; this.wsGoal = 0; this.wsT = 2 + Math.random() * 3;    // troca do peso entre as pernas (parado)
    this.look = { y: 0, p: 0, tw: 0, ty: 0, tp: 0, ttw: 0, timer: 1 + Math.random() * 2 };
    this.feet = [{}, {}]; this.from = null; this.fade = 0;
    this.g = {}; this.F = {};
    this.onStep = null;
    // água: rasa (wade 0..1 segura as pernas) e funda (swim: nado de peito / boiando)
    this.wade = 0; this.swim = 0; this.swMove = 0; this.swc = 0;
    this.onStroke = null;
  }

  // dt; speed em m/s; grounded; running (som dos passos);
  // o = { mx, mz: direção do movimento no espaço do personagem, vy: velocidade vertical,
  //       wade: 0..1 água pelas pernas, swim: nadando }
  // (um número em `o` é o formato antigo: 1 = para a frente, -1 = de costas)
  update(dt, speed, grounded, running, o = {}) {
    if (typeof o === 'number') o = { mz: o };
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const v = Math.max(0, speed || 0), k = rate => Math.min(1, dt * rate);
    this.swim += ((o.swim ? 1 : 0) - this.swim) * k(o.swim ? 3 : 4);
    this.wade += ((o.wade ?? 0) - this.wade) * k(6);

    // giro do corpo: quem move o personagem gira a raiz depois de animar (um quadro de atraso)
    const yaw = this.root.rotation.y;
    let w = this.yaw0 === null || dt <= 0 ? 0 : wrapPi(yaw - this.yaw0) / dt;
    if (Math.abs(w) > 20) w = 0;
    this.yaw0 = yaw;
    this.turn += (w - this.turn) * k(10);
    // aceleração: inclina para a frente ao arrancar e para trás ao frear
    this.acc += (clamp(dt > 0 ? (v - this.v0) / dt : 0, -14, 14) - this.acc) * k(6);
    this.v0 = v;

    // direção do movimento; de costas inverte e a fase corre para trás
    let mx = o.mx ?? 0, mz = o.mz ?? 1;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-4) { mx /= ml; mz /= ml; } else { mx = 0; mz = 1; }
    if (this.back > 0 ? mz < -0.2 : mz > 0.05) {
      this.back = -this.back;
      this.from = this.feet.map(f => ({ ...f })); this.fade = 1;
      this.dir[0] = mx * this.back; this.dir[1] = mz * this.back;
    }
    if (this.back < 0) { mx = -mx; mz = -mz; }
    this.dir[0] += (mx - this.dir[0]) * k(10); this.dir[1] += (mz - this.dir[1]) * k(10);
    const dl = Math.hypot(this.dir[0], this.dir[1]) || 1, dx = this.dir[0] / dl, dz = this.dir[1] / dl;

    // misturas (girar no lugar também dá passos)
    const act = Math.max(v, grounded ? Math.abs(this.turn) * 0.3 : 0);
    this.move += ((act > 0.06 ? 1 : 0) - this.move) * k(act > 0.06 ? 9 : 5);
    this.run += (smooth(1.9, 3.3, v) - this.run) * k(6);
    this.air += ((grounded ? 0 : 1) - this.air) * k(grounded ? 14 : 9);
    this.ex += ((this.run > 0.5 ? 1 : 0) - this.ex) * k(this.run > 0.5 ? 0.25 : 0.08);  // fôlego depois de correr
    const r = this.run, air = this.air, m = this.move * (1 - air), idle = (1 - m) * (1 - air);
    const fall = clamp(-(o.vy ?? 0) / 4, 0, 1);

    // pouso: mola que amassa o corpo
    if (!grounded) { if (this.grounded) this.lead = this.cyc < 0.5 ? 1 : 0; this.vy = o.vy ?? this.vy; }
    else if (!this.grounded) this.landV -= 0.5 + 3.2 * clamp((-this.vy - 1.5) / 6, 0, 1);
    this.grounded = grounded;
    for (let n = Math.ceil(dt / 0.008), i = 0; i < n; i++) {
      const h = dt / n;
      this.landV += (-150 * this.landY - 24 * this.landV) * h;
      this.landY += this.landV * h;
    }

    // fase da passada e som dos passos (quando um pé toca o chão)
    const g = this.g;
    gaitParams(v, act, r, g);
    const prev = this.cyc;
    if (grounded) this.cyc = (this.cyc + this.back * g.f * dt * this.move + 1) % 1;
    if (grounded && act > 0.3 && this.swim < 0.3) {
      for (let i = 0; i < 2; i++) {
        const u0 = (prev + i * 0.5) % 1, u1 = (this.cyc + i * 0.5) % 1;
        if (this.back > 0 ? u1 < u0 - 0.5 : u0 >= g.duty && u1 < g.duty && u0 - u1 < 0.5) this.onStep?.(running);
      }
    }

    // parado: o peso passa de uma perna para a outra de vez em quando
    this.wsT -= dt;
    if (this.wsT <= 0) {
      const s = Math.sign(this.wsGoal) || 1;
      this.wsGoal = (Math.random() < 0.75 ? -s : s) * (0.45 + Math.random() * 0.55);
      this.wsT = 3.5 + Math.random() * 5;
    }
    this.ws += (this.wsGoal * (1 - m) - this.ws) * k(1.3);
    const br = Math.sin(this.t * TAU / lerp(4.2, 1.6, this.ex)) * (1 + 1.4 * this.ex);   // respiração
    // olhar em volta (o protagonista desconfia e às vezes olha por cima do ombro)
    const Lk = this.look;
    Lk.timer -= dt;
    if (o.still) { Lk.ty = Lk.tp = Lk.ttw = 0; Lk.timer = Math.max(Lk.timer, 1.5); }
    else if (Lk.timer <= 0) this._newLook();
    Lk.y += (Lk.ty - Lk.y) * k(4); Lk.p += (Lk.tp - Lk.p) * k(4); Lk.tw += (Lk.ttw - Lk.tw) * k(3);

    // ---- quadril ----
    const kv = Math.min(1, v / 1.4), kw = kv * (1 - r);
    const ph = TAU * (this.cyc - g.duty / 2);                              // 0 = meio do apoio da perna 0
    const yawG = m * lerp(0.07 * kw, 0.1, r) * Math.cos(TAU * this.cyc);   // a bacia gira com a perna que avança
    const rollG = m * -lerp(0.045 * kw, 0.035, r) * Math.cos(ph);          // cai do lado da perna no ar
    const lowYaw = m * clamp(Math.atan2(dx, dz), -1.3, 1.3) * 0.45;        // de lado: o quadril vira para onde anda
    const lean = -clamp(Math.atan(v * this.turn / 9.8) * lerp(0.12, 0.5, r), -0.28, 0.28) * m;   // curva
    const accLean = clamp(this.acc * 0.016, -0.1, 0.12) * m;
    const H = this.hips;
    H.rotation.set(m * lerp(0.025, 0.13, r) + accLean * 0.4 + air * 0.05, yawG + lowYaw, rollG + idle * 0.032 * this.ws + lean);
    const hx = m * -lerp(0.022 * kw, 0.006, r) * Math.cos(ph) + idle * 0.03 * this.ws;
    // (com a perna quase reta, 1 cm a menos já dobra o joelho uns 15°)
    let hy = HIPS_Y - lerp(0.004 + 0.004 * Math.abs(this.ws), lerp(0.006, 0.035, r), m) - m * r * 0.02 * Math.cos(2 * ph);

    // ---- pés ----
    const F = this.F, wStep = lerp(0.075, 0.05, r);
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      const s = this.legs[i].side, ft = this.feet[i];
      gaitFoot((this.cyc + i * 0.5) % 1, g, F);
      // andando: ao longo da direção do movimento, um pouco afastado da linha do meio
      const gx = s * wStep * dz + dx * F.z, gz = -s * wStep * dx + dz * F.z;
      // parado: pés afastados, pontas para fora; a perna sem peso dobra e vai um pouco à frente
      const free = Math.max(0, -s * this.ws);
      ft.x = lerp(s * (0.112 + 0.012 * free), gx, m);
      ft.z = lerp(0.012 * s + 0.045 * free, gz, m);
      ft.y = lerp(ANKLE_H, F.y, m);
      ft.pitch = F.pitch * m; ft.toe = F.toe * m;
      ft.yaw = lerp(s * (0.13 + 0.05 * free), s * lerp(0.06, 0.03, r), m) + lowYaw;
      ft.w = lerp(1, F.w, m);
      // na água rasa: o pé no ar sobe mais (tira a perna da água a cada passo)
      if (this.wade > 0.01) ft.y += this.wade * 0.1 * (1 - ft.w);
      // no ar: a perna da frente encolhe e a outra fica para trás; caindo, as duas descem para o pouso
      if (air > 0.001) {
        const ld = i === this.lead;
        ft.x = lerp(ft.x, s * 0.1, air);
        ft.y = lerp(ft.y, ld ? lerp(0.42, 0.16, fall) : lerp(0.2, 0.1, fall), air);
        ft.z = lerp(ft.z, ld ? lerp(0.16, 0.1, fall) : lerp(-0.16, -0.04, fall), air);
        ft.pitch = lerp(ft.pitch, lerp(0.45, 0.1, fall), air); ft.toe *= 1 - air;
        ft.yaw = lerp(ft.yaw, s * 0.06, air); ft.w *= 1 - air;
      }
      // trocou entre andar de frente e de costas: os pés deslizam da pose anterior
      if (this.fade > 0 && this.from?.[i].x !== undefined) {
        const p = this.from[i], f = ease(this.fade);
        for (const key of ['x', 'y', 'z', 'pitch', 'yaw', 'toe']) ft[key] = lerp(ft[key], p[key], f);
      }
      // o quadril não sobe além do que a perna apoiada alcança
      if (ft.w > 0) {
        const ddx = ft.x - (hx + s * HIP_X);
        const reach = Math.sqrt(Math.max(0, LEG_MAX * LEG_MAX * 0.995 - ddx * ddx - ft.z * ft.z));
        drop = Math.max(drop, (hy + HIP_DY - ft.y - reach) * ft.w);
      }
    }
    this.fade = Math.max(0, this.fade - dt * 7);
    this.drop += (Math.max(0, drop) - this.drop) * k(30);
    H.position.set(hx, hy - this.drop + this.landY, 0);
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i], s = this.legs[i].side;
      this._leg(this.legs[i], _tg.set(ft.x, ft.y, ft.z), _pole.set(Math.sin(ft.yaw) + s * 0.04, 0, Math.cos(ft.yaw)), ft.yaw, ft.pitch, ft.toe);
    }

    // ---- tronco e cabeça ----
    const S = this.spine;
    S.rotation.set(
      m * lerp(0.02, 0.16, r) + accLean * 0.6 - br * 0.012 + air * lerp(0.1, -0.06, fall) - this.landY * 1.6 + (this.hero ? 0.03 * idle : 0),
      -yawG * lerp(1.6, 1.3, r) - lowYaw + Lk.tw * idle,
      -0.6 * rollG - idle * 0.02 * this.ws + lean * 0.3,
    );
    // a cabeça compensa o balanço do tronco e olha em volta
    const tYaw = H.rotation.y + S.rotation.y, tPitch = H.rotation.x + S.rotation.x, tRoll = H.rotation.z + S.rotation.z;
    const lookW = (1 - 0.65 * m) * (1 - air);
    this.neck.rotation.set(-tPitch * 0.35, 0, -tRoll * 0.3);
    this.head.rotation.set(
      Lk.p * lookW - tPitch * 0.4 - m * r * 0.04,
      Lk.y * lookW - tYaw * 0.9 + clamp(this.turn * 0.13, -0.4, 0.4) * m,
      -tRoll * 0.45,
    );

    // ---- braços: balançam ao contrário da perna do mesmo lado; correndo, cotovelos a 90° ----
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i], s = A.side;
      const sw = Math.cos(TAU * ((this.cyc + i * 0.5) % 1 - lerp(0.05, 0.03, r)));   // +1 = braço atrás
      const fw = Math.max(0, -sw), bk = Math.max(0, sw);
      let shx = lerp(-0.06, -0.15, r) + lerp(0.27 * kv, 0.6, r) * sw;
      let shz = s * lerp(0.095 - 0.05 * fw * kv, 0.16 - 0.1 * fw, r);
      let elx = -lerp(0.2 + 0.3 * fw * kv, 1.475 + 0.275 * fw - 0.275 * bk, r);
      let hdx = lerp(-0.14, -0.3, r);
      // parado: braços soltos, cotovelo um pouco dobrado, ombros sobem com a respiração
      shx = lerp(-0.035 - 0.008 * br, shx, m); shz = lerp(s * (0.105 + 0.004 * br), shz, m);
      elx = lerp(-0.24, elx, m); hdx = lerp(-0.13, hdx, m);
      // no ar: braços abertos para o equilíbrio
      if (air > 0.001) {
        shx = lerp(shx, lerp(-0.42, -0.15, fall), air); shz = lerp(shz, s * lerp(0.42, 0.72, fall), air);
        elx = lerp(elx, -0.55, air);
      }
      // na água rasa: braços um pouco abertos e dobrados, equilibrando
      shz += s * 0.22 * this.wade * (1 - air); elx -= 0.35 * this.wade;
      shx -= this.landY * 2.5;
      A.sh.rotation.set(shx, 0, shz);
      A.el.rotation.set(elx, 0, 0);
      A.hand.rotation.set(hdx, 0, s * 0.05);
      A.sh.position.y = this.shY[i] + 0.004 * br * idle;
    }
    if (this.swim > 0.001) this._swim(dt, v, k);
  }

  // água funda, por cima da pose de terra: nado de peito andando, boiando parado
  // (corpo quase em pé, mãos abanando, pernas pedalando). A cabeça fica fora d'água
  _swim(dt, v, k) {
    const w = ease(clamp(this.swim, 0, 1));
    this.swMove += (smooth(0.2, 1.0, v) - this.swMove) * k(3);
    const mv = this.swMove;
    const prev = this.swc;
    this.swc = (this.swc + lerp(0.7, lerp(0.75, 1.15, smooth(1.4, 2.2, v)), mv) * dt) % 1;
    // som da braçada no começo da puxada (boiando: duas abanadas por ciclo)
    const cross = p => (prev < p && this.swc >= p) || (prev > this.swc && (prev < p || this.swc >= p));
    if (w > 0.6 && (cross(0.12) || (mv < 0.4 && cross(0.62)))) this.onStroke?.(mv);
    const u = this.swc, P = TAU * u;
    // corpo: deitado nadando (o peito sobe na puxada para respirar), quase em pé boiando
    const breath = mv * Math.sin(Math.PI * clamp(u / 0.55, 0, 1));
    const hipsX = lerp(0.2, 1.05, mv) - 0.12 * breath, spineX = lerp(0.04, 0.16, mv) - 0.1 * breath;
    const H = this.hips, S = this.spine;
    H.rotation.set(lerp(H.rotation.x, hipsX, w), lerp(H.rotation.y, 0, w), lerp(H.rotation.z, 0, w));
    H.position.set(lerp(H.position.x, 0, w), lerp(H.position.y, lerp(0.5 + Math.sin(P * 2) * 0.02, 0.78 + breath * 0.05, mv), w), lerp(H.position.z, -0.12 * mv, w));
    S.rotation.set(lerp(S.rotation.x, spineX, w), lerp(S.rotation.y, 0, w), lerp(S.rotation.z, 0, w));
    // pescoço e cabeça compensam o tronco: olha para a frente, rente à água
    const T = hipsX + spineX;
    this.neck.rotation.set(lerp(this.neck.rotation.x, -T * 0.5, w), lerp(this.neck.rotation.y, 0, w), lerp(this.neck.rotation.z, 0, w));
    this.head.rotation.set(lerp(this.head.rotation.x, -T * 0.5 + 0.08, w), lerp(this.head.rotation.y, this.look.y * (1 - mv) * 0.8, w), lerp(this.head.rotation.z, 0, w));
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i], L = this.legs[i], s = A.side;
      // braços: braçada / mãos abanando à frente, para fora e para dentro
      keyAt(SWIM_ARM, u, _kA);
      const sc = Math.sin(P * 2 + i * 0.4);
      const ax = lerp(-0.75 + 0.1 * sc, _kA[0], mv), az = lerp(0.8 + 0.3 * sc, _kA[1], mv);
      const ex = lerp(-0.7, _kA[2], mv), hx = lerp(0.2 * sc, _kA[3], mv);
      A.sh.rotation.set(lerp(A.sh.rotation.x, ax, w), lerp(A.sh.rotation.y, 0, w), lerp(A.sh.rotation.z, s * az, w));
      A.el.rotation.set(lerp(A.el.rotation.x, ex, w), 0, 0);
      A.hand.rotation.set(lerp(A.hand.rotation.x, hx, w), 0, lerp(A.hand.rotation.z, s * 0.05, w));
      A.sh.position.y = this.shY[i];
      // pernas: pernada de sapo / pedalando (as duas fora de fase)
      keyAt(SWIM_LEG, u, _kL);
      const pd = P + i * Math.PI;
      const lx = lerp(-0.5 + 0.35 * Math.sin(pd), _kL[0], mv), lz = lerp(0.2, _kL[1], mv);
      const kn = lerp(1.0 + 0.45 * Math.cos(pd), _kL[2], mv), an = lerp(0.4, _kL[3], mv);
      L.hip.quaternion.slerp(_q.setFromEuler(_eu2.set(lx, 0, s * lz)), w);
      L.knee.rotation.x = lerp(L.knee.rotation.x, kn, w);
      L.ankle.quaternion.slerp(_q.setFromEuler(_eu2.set(an, 0, 0)), w);
      L.toe.rotation.x = lerp(L.toe.rotation.x, 0, w);
    }
  }

  // novo ponto para onde olhar quando parado
  _newLook() {
    const L = this.look, R = Math.random();
    if (this.hero && R < 0.16) {
      // olha por cima do ombro, girando um pouco o tronco
      const s = Math.random() < 0.5 ? -1 : 1;
      L.ty = s * (0.95 + Math.random() * 0.25); L.ttw = s * 0.32; L.tp = 0.02; L.timer = 1.1 + Math.random() * 0.7;
    } else if (R < 0.5) {
      L.ty = (Math.random() - 0.5) * 0.3; L.ttw = 0; L.tp = (Math.random() - 0.5) * 0.1; L.timer = 2 + Math.random() * 3.5;
    } else {
      L.ty = (Math.random() * 2 - 1) * (this.hero ? 0.8 : 0.6); L.ttw = 0; L.tp = Math.random() * 0.18 - 0.08; L.timer = 1.4 + Math.random() * 2.8;
    }
  }

  // IK de duas juntas no espaço do personagem: tornozelo no alvo, joelho para o polo,
  // pé com guinada/inclinação (+ = ponta para baixo) e dedos dobrados (+ = para baixo)
  _leg(L, target, pole, yaw, pitch, toe) {
    const H = this.hips;
    const hj = _hj.set(L.side * HIP_X, HIP_DY, 0).applyQuaternion(H.quaternion).add(H.position);
    const d = _d.subVectors(target, hj);
    const len = clamp(d.length(), 0.1, LEG_MAX);
    d.normalize();
    const knee = Math.PI - Math.acos(clamp((LEG_A * LEG_A + LEG_B * LEG_B - len * len) / (2 * LEG_A * LEG_B), -1, 1));
    const al = Math.acos(clamp((LEG_A * LEG_A + len * len - LEG_B * LEG_B) / (2 * LEG_A * len), -1, 1));
    // coxa: gira da linha quadril-tornozelo para o lado do joelho
    const pn = _pn.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    const th = _th.copy(d).multiplyScalar(Math.cos(al)).addScaledVector(pn, Math.sin(al));
    _Y.copy(th).negate();
    _Z.copy(pn).addScaledVector(th, -pn.dot(th)).normalize();
    _X.crossVectors(_Y, _Z);
    const qT = _q.setFromRotationMatrix(_m4.makeBasis(_X, _Y, _Z));
    L.hip.quaternion.copy(H.quaternion).invert().multiply(qT);
    L.knee.rotation.set(knee, 0, 0);
    _eu.set(pitch, yaw, 0);
    L.ankle.quaternion.setFromEuler(_eu).premultiply(_q2.copy(qT).multiply(L.knee.quaternion).invert());
    L.toe.rotation.set(toe, 0, 0);
  }
}
