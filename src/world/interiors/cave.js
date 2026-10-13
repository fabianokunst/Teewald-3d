import * as THREE from 'three';
import { M } from '../../engine/materials.js';
import { ps1Material } from '../../engine/ps1material.js';
import { sampler, paint, finish, mul } from '../../engine/archTextures.js';
import { rng } from '../geo.js';
import { makeKit, cameraProbe, hash, softTex, glowMat, decalMat, poolTex, UV1, V } from './factory.js';

// Gruta do chupacabras, no morro: túnel sinuoso descendo da boca até o salão
// (~18 m) onde ele luta; ninho num patamar no fundo; ossos, carcaças de ovelha e
// de galinha, penas e sangue; cristais verdes brotando das rochas — pedaços da
// pedra que caiu do céu em 1978 — e o próprio meteorito meio enterrado.

// caminho do túnel (metros locais) e o salão
const PATH = [[2.6, -0.6], [3.4, 3.0], [5.6, 6.6], [9.4, 8.6], [13.6, 7.9], [17.4, 9.8], [19.6, 13.6], [21.4, 17.2], [23.8, 19.4]];
const CH = { x: 30.6, z: 22.0 };
const NEST = { x: 35.0, z: 26.9 };
const METEOR = { x: 38.4, z: 19.6 };
const Rch = a => 9.4 + 0.6 * Math.sin(3 * a + 1) + 0.4 * Math.sin(5 * a + 2);   // raio irregular do salão
const DOME = 7.4;

// curva suave pelos pontos (Catmull-Rom) com comprimento acumulado
function curve(pts, step = 1.0) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  let s = 0;
  return out.map((p, i) => { if (i) s += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]); return { x: p[0], z: p[1], s }; });
}

function makeMats() {
  if (M['int:g:crystal']) return;
  // cristal verde: faces com veios e brilho próprio
  M['int:g:crystal'] = ps1Material({
    lit: false, color: new THREE.Color(0.75, 1.0, 0.8), map: finish(paint(16, 32, (x, y) => {
      const edge = x === 0 || x === 15;
      const vein = Math.abs(x - 8 + Math.sin(y * 0.4) * 3) < 1;
      const k = 0.55 + 0.45 * (y / 31) + (vein ? 0.25 : 0) - (edge ? 0.25 : 0) + hash(x, y) * 0.08;
      return [60 * k, 235 * k, 110 * k];
    })),
  });
  M['int:g:glow'] = glowMat(poolTex(), [0.12, 0.45, 0.18]);
  M['int:g:glowFloor'] = glowMat(M['int:g:glow'].uniforms.map.value, [0.08, 0.3, 0.12]);
  // lado de fora da boca: céu de noite, morro e araucárias recortadas
  M['int:g:night'] = ps1Material({
    lit: false, fog: false, color: new THREE.Color(0.55, 0.55, 0.6), map: finish(paint(64, 48, (x, y) => {
      const hill = 30 + Math.sin(x * 0.11) * 4 + Math.sin(x * 0.31 + 1) * 1.5;
      // araucária: tronco reto e copa em taça (galhos virados para cima), em dois andares
      const tree = (cx, top) => {
        const dx = x - cx, ax = Math.abs(dx);
        if (ax < 1 && y > top + 1) return true;
        for (const [ty, w] of [[top, 7], [top + 4, 5]]) { const cy = ty + 2 - (dx * dx) / (w * 2.2); if (ax <= w && y >= cy && y <= cy + 1.6 + (ax < 2 ? 1 : 0)) return true; }
        return false;
      };
      if (y > hill || tree(12, 18) || tree(44, 15) || tree(56, 21) || tree(29, 23)) return [8, 10, 12];
      const g = y / 48, moon = Math.max(0, 1 - Math.hypot(x - 38, y - 8) / 14);
      return [22 + g * 30 + moon * 40, 26 + g * 32 + moon * 42, 40 + g * 34 + moon * 46];
    })),
  });
  // sangue seco, pena e lã
  M['int:g:blood'] = decalMat(softTex(32, 32, (x, y) => {
    const a = Math.atan2(y - 16, x - 16), r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 13 + Math.sin(a * 6) * 0.1 + hash(x, y) * 0.12;
    const drop = hash(x >> 1, y >> 1) < 0.06 && r < 1.6;
    return [70, 8, 8, r < 1 || drop ? 220 : 0];
  }));
  M['int:g:feather'] = ps1Material({
    cutout: true, side: THREE.DoubleSide, map: finish(paint(8, 16, (x, y) => {
      const w = Math.sin((y / 15) * Math.PI) * 3.6;
      if (Math.abs(x + 0.5 - 4) > w) return null;
      return x === 3 || x === 4 ? [170, 160, 140] : [235, 232, 222];
    }), true),
  });
  M['int:g:scorch'] = decalMat(softTex(64, 64, (x, y) => {
    const a = Math.atan2(y - 32, x - 32), r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 31 + Math.sin(a * 7) * 0.07 + Math.sin(a * 3 + 1) * 0.06 + hash(x, y) * 0.1;
    const k = Math.max(0, 1 - r);
    return [20 + (1 - k) * 24, 14 + (1 - k) * 12, 10, Math.min(1, k * 2.2) * 235];
  }));
  const rock = sampler('stoneRock');
  M['int:g:wool'] = ps1Material({ map: finish(paint(16, 16, (x, y) => { const n = hash(x, y) * 40 + (((x + y) % 3) ? 0 : -30); return [200 + n * 0.5, 192 + n * 0.5, 170 + n * 0.4]; })) });
  M['int:g:rock'] = ps1Material({ map: finish(paint(64, 64, (x, y) => mul(rock(x, y), 0.9 + 0.2 * hash(x >> 3, y >> 3)))) });
}

export function build(ctx, B, o) {
  makeMats();
  const K = makeKit(ctx, B, o);
  const R = rng(1978);
  const objects = new THREE.Group();
  objects.name = 'interior:gruta:pecas';
  const anim = [];
  const gray = k => [k, k, k];
  // tom da rocha por posição (manchas suaves, sem faixas)
  const rockShade = (p, base = 0.4) => {
    const n = 0.5 + 0.22 * Math.sin(p[0] * 0.9 + p[2] * 0.4) * Math.cos(p[1] * 1.1 - p[0] * 0.3) + 0.18 * Math.sin(p[2] * 1.7 + p[1] * 0.8) + 0.1 * Math.sin(p[0] * 3.1 + p[1] * 2.3);
    const k = base * (0.6 + 0.8 * n);
    return [k * 1.05, k, k * 0.86];
  };
  const P = curve(PATH, 1.0);
  const LT = P[P.length - 1].s;

  // ---------------- forma: túnel + salão ----------------
  const wAt = s => (s < 2.5 ? 2.5 - s * 0.12 : 2.05 + 0.3 * Math.sin(s * 0.55) + 0.15 * Math.sin(s * 1.3 + 1)) + (s > LT - 3 ? (s - LT + 3) * 0.25 : 0);
  const hAt = s => 3.8 + 0.4 * Math.sin(s * 0.4 + 1) + (s < 2 ? 0.6 : 0);
  const near = (x, z) => {
    let best = { d: Infinity, s: 0, i: 0, t: 0 };
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L2));
      const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
      if (d < best.d) best = { d, s: a.s + (b.s - a.s) * t, i, t };
    }
    return best;
  };
  const smooth = (e0, e1, v) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const Htun = s => 1.5 * (1 - smooth(LT * 0.12, LT * 0.92, s)) + 0.08 * Math.sin(s * 1.7);
  const Hch = (x, z) => 0.1 * Math.sin(x * 0.7) * Math.cos(z * 0.6) + 0.6 * smooth(3.6, 1.6, Math.hypot(x - NEST.x, z - NEST.z)) + 0.25 * smooth(2.6, 1.2, Math.hypot(x - METEOR.x, z - METEOR.z));
  const dCh = (x, z) => Math.hypot(x - CH.x, z - CH.z);
  const H = (x, z) => {
    const dc = dCh(x, z), wch = smooth(Rch(Math.atan2(z - CH.z, x - CH.x)) + 1.5, Rch(Math.atan2(z - CH.z, x - CH.x)) - 1.0, dc);
    const n = near(x, z);
    return Htun(n.s) * (1 - wch) + Hch(x, z) * wch;
  };
  const inside = (x, z, m = 0) => {
    const n = near(x, z);
    if (n.d < wAt(n.s) + m && n.s > -0.5) return true;
    return dCh(x, z) < Rch(Math.atan2(z - CH.z, x - CH.x)) + m;
  };

  // ---------------- piso: malha de terra ----------------
  const G = 0.75, hc = new Map();
  const Hg = (i, j) => { const k = i * 1000 + j; if (!hc.has(k)) hc.set(k, H(i * G, j * G)); return hc.get(k); };
  for (let i = -2; i < 60; i++) for (let j = -4; j < 48; j++) {
    const cx = (i + 0.5) * G, cz = (j + 0.5) * G;
    if (!inside(cx, cz, 1.0)) continue;
    const ya = Hg(i, j), yb = Hg(i + 1, j), yc = Hg(i + 1, j + 1), yd = Hg(i, j + 1);
    const col = (x, z) => { const k = 0.5 + 0.22 * Math.sin(x * 0.8 + Math.sin(z * 0.5) * 2) * Math.cos(z * 0.7) + hash(x * 4 | 0, z * 4 | 0) * 0.12; return [k * 1.05, k * 0.95, k * 0.82]; };
    const x0 = i * G, x1 = x0 + G, z0 = j * G, z1 = z0 + G;
    K.quad('dirt', [x0, ya, z0], [x0, yd, z1], [x1, yc, z1], [x1, yb, z0], [[x0 / 2, z0 / 2], [x0 / 2, z1 / 2], [x1 / 2, z1 / 2], [x1 / 2, z0 / 2]], [col(x0, z0), col(x0, z1), col(x1, z1), col(x1, z0)]);
  }
  // altura exata da malha de terra (os mesmos triângulos do desenho, diagonal de
  // (x0, z0) a (x1, z1)): é o chão de quem anda na gruta. As caixas planas por
  // célula que havia antes deixavam os pés até 10 cm dentro da terra nas subidas,
  // e entre elas e a parede o jogador caía para baixo do chão
  const meshH = (x, z) => {
    const fi = x / G, fj = z / G, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const ya = Hg(i, j), yb = Hg(i + 1, j), yc = Hg(i + 1, j + 1), yd = Hg(i, j + 1);
    return v >= u ? ya + (yd - ya) * v + (yc - yd) * u : ya + (yb - ya) * u + (yc - yb) * v;
  };
  // mancha no chão (brilho, fuligem) colada na terra: um quadrado plano flutuava até
  // 40 cm onde o chão desce e cobria as pernas de quem passava por baixo dele.
  // Recorta cada triângulo da malha pelo retângulo; uv(x, z) em metros locais
  const groundDecal = (mat, x0, z0, x1, z1, lift, uv) => {
    for (let i = Math.floor(x0 / G); i * G < x1; i++) for (let j = Math.floor(z0 / G); j * G < z1; j++) {
      const a0 = i * G, b0 = j * G, a1 = a0 + G, b1 = b0 + G;
      for (const t of [[[a0, b0], [a0, b1], [a1, b1]], [[a0, b0], [a1, b1], [a1, b0]]]) {
        let pts = t;
        for (const [ax, sg, lim] of [[0, 1, x0], [0, -1, x1], [1, 1, z0], [1, -1, z1]]) {
          const out = [];
          for (let m = 0; m < pts.length; m++) {
            const p = pts[m], q = pts[(m + 1) % pts.length], sp = sg * (p[ax] - lim), sq = sg * (q[ax] - lim);
            if (sp >= 0) out.push(p);
            if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
          }
          pts = out;
          if (pts.length < 3) break;
        }
        if (pts.length < 3) continue;
        const P3 = pts.map(([x, z]) => [x, meshH(x, z) + lift, z]);
        for (let m = 1; m < P3.length - 1; m++) {
          const A = P3[0], Bq = P3[m], C = P3[m + 1];
          const ny = (Bq[2] - A[2]) * (C[0] - A[0]) - (Bq[0] - A[0]) * (C[2] - A[2]);
          if (Math.abs(ny) < 1e-7) continue;
          const [p, q] = ny > 0 ? [Bq, C] : [C, Bq];
          K.tri(mat, A, p, q, uv(A[0], A[2]), uv(p[0], p[2]), uv(q[0], q[2]));
        }
      }
    }
  };
  const glowUV = (x, z) => [x / 99, z / 99];
  // mancha quadrada (lado 2s) centrada em (x, z), textura inteira
  K.decal = (mat, x, z, s, lift) => groundDecal(mat, x - s, z - s, x + s, z + s, lift, (px, pz) => [(px - x + s) / (2 * s), (pz - z + s) / (2 * s)]);

  // ---------------- paredes do túnel (anéis de rocha irregular) ----------------
  const JN = 10;
  const rings = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl, w = wAt(p.s), h = hAt(p.s), y = Htun(p.s);
    const vs = [];
    for (let j = 0; j <= JN; j++) {
      const th = (j / JN) * Math.PI, cs = Math.cos(th), sn = Math.sin(th);
      const bump = 1 + 0.24 * (hash(i, j) - 0.5) + 0.12 * Math.sin(i * 0.9 + j * 1.7);
      const lat = Math.sign(cs) * Math.pow(Math.abs(cs), 0.4) * w * (j === 0 || j === JN ? 1.08 : bump);
      const vy = y - 0.4 + Math.pow(sn, 0.8) * (h + 0.4) * (j === 0 || j === JN ? 0 : (1 + 0.07 * (hash(j, i) - 0.5)));
      vs.push([p.x + nx * lat, vy, p.z + nz * lat]);
    }
    return { p, nx, nz, w, h, y, vs };
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], Bn = rings[i + 1];
    for (let j = 0; j < JN; j++) {
      const a = A.vs[j], b = Bn.vs[j], c = Bn.vs[j + 1], d = A.vs[j + 1];
      const axis = [(A.p.x + Bn.p.x) / 2, (A.y + Bn.y) / 2 + A.h * 0.4, (A.p.z + Bn.p.z) / 2];
      const mid = V.scl(V.add(V.add(a, b), V.add(c, d)), 0.25);
      const bs = j === 0 || j === JN - 1 ? 0.34 : 0.46;
      K.quadOut('int:g:rock', a, b, c, d, V.sub(axis, mid), [[A.p.s / 2.2, j * 0.55], [Bn.p.s / 2.2, j * 0.55], [Bn.p.s / 2.2, (j + 1) * 0.55], [A.p.s / 2.2, (j + 1) * 0.55]], [rockShade(a, j === 0 ? 0.3 : bs), rockShade(b, j === 0 ? 0.3 : bs), rockShade(c, j + 1 === JN ? 0.3 : bs), rockShade(d, j + 1 === JN ? 0.3 : bs)]);
    }
    // colisão: lados e teto, até a borda do salão
    const mx = (A.p.x + Bn.p.x) / 2, mz = (A.p.z + Bn.p.z) / 2;
    if (dCh(mx, mz) > Rch(Math.atan2(mz - CH.z, mx - CH.x)) - 0.4) {
      const sl = Math.hypot(Bn.p.x - A.p.x, Bn.p.z - A.p.z), rot = Math.atan2(-(Bn.p.z - A.p.z), Bn.p.x - A.p.x);
      const nx = (A.nx + Bn.nx) / 2, nz = (A.nz + Bn.nz) / 2, w = Math.min(A.w, Bn.w), y = Math.min(A.y, Bn.y), h = Math.min(A.h, Bn.h);
      for (const sd of [-1, 1]) {
        K.hit(mx + nx * sd * (w * 0.82 + 0.7), mz + nz * sd * (w * 0.82 + 0.7), sl / 2 + 0.45, 0.7, rot, y - 1, y + h * 0.75, true);
        K.hit(mx + nx * sd * (w * 0.7 + 0.7), mz + nz * sd * (w * 0.7 + 0.7), sl / 2 + 0.45, 0.7, rot, y + h * 0.6, y + h + 1, true);
      }
      K.hit(mx, mz, sl / 2 + 0.3, w, rot, y + h * 0.82, y + h + 1.5, true);
    }
  }
  // boca da gruta: o lado de fora e uma barreira
  {
    const A = rings[0], tx = P[1].x - P[0].x, tz = P[1].z - P[0].z, tl = Math.hypot(tx, tz), dx = tx / tl, dz = tz / tl;
    const cx = A.p.x - dx * 1.6, cz = A.p.z - dz * 1.6, rot = Math.atan2(dx, dz);
    K.face('int:g:night', cx, A.y - 1.5, cz, 9, 7, rot);
    K.hit(A.p.x - dx * 0.6, A.p.z - dz * 0.6, A.w + 1, 0.3, Math.atan2(-dz, dx) + Math.PI / 2, A.y - 1, A.y + 5, true);
    groundDecal('int:g:glowFloor', A.p.x - 2, A.p.z - 1, A.p.x + 2, A.p.z + 2.5, 0.03, glowUV);
  }

  // ---------------- salão: cúpula irregular ----------------
  const tunEnd = rings[rings.length - 1];
  const holeAt = (x, y, z) => {
    // dentro do perfil do túnel na chegada (o túnel cobre por trás)
    const n = near(x, z);
    if (n.s < LT - 4) return false;
    const w = wAt(n.s), h = hAt(n.s), y0 = Htun(n.s);
    return n.d < w * 0.85 && y < y0 + h * 0.8 && y > y0 - 1;
  };
  {
    const NA = 40, NE = 8;
    const vert = (ia, ie) => {
      const a = (ia / NA) * Math.PI * 2, e = (ie / NE) * Math.PI / 2;
      const lump = ie === 0 ? 1.04 : 1 + 0.2 * (hash(ia % NA, ie) - 0.5) + 0.12 * Math.sin(a * 7 + ie * 1.3) + 0.08 * Math.sin(a * 13 - ie);
      const r = Rch(a) * Math.pow(Math.cos(e), 0.45) * lump;
      const x = CH.x + Math.cos(a) * r, z = CH.z + Math.sin(a) * r;
      const yb = Hch(CH.x + Math.cos(a) * Rch(a), CH.z + Math.sin(a) * Rch(a)) - 0.4;
      return [x, yb + Math.sin(e) * (DOME + 0.4 * Math.sin(a * 3)) + (ie && ie < NE ? 0.7 * (hash(ia % NA, ie + 9) - 0.5) : 0), z];
    };
    for (let ie = 0; ie < NE; ie++) for (let ia = 0; ia < NA; ia++) {
      const a = vert(ia, ie), b = vert(ia + 1, ie), c = vert(ia + 1, ie + 1), d = vert(ia, ie + 1);
      const mid = V.scl(V.add(V.add(a, b), V.add(c, d)), 0.25);
      if (holeAt(mid[0], mid[1], mid[2])) continue;
      const bs = ie === 0 ? 0.32 : 0.42;
      K.quadOut('int:g:rock', a, b, c, d, V.sub([CH.x, 2.5, CH.z], mid), [[ia * 0.7, ie * 0.75], [(ia + 1) * 0.7, ie * 0.75], [(ia + 1) * 0.7, (ie + 1) * 0.75], [ia * 0.7, (ie + 1) * 0.75]], [rockShade(a, bs), rockShade(b, bs), rockShade(c, 0.42), rockShade(d, 0.42)]);
    }
    // colisão em degraus seguindo a cúpula (paredes para o jogador; os anéis altos só seguram a câmera)
    const aT = Math.atan2(tunEnd.p.z - CH.z, tunEnd.p.x - CH.x);
    const NS = 28;
    for (let k = 0; k < NS; k++) {
      const a = (k + 0.5) / NS * Math.PI * 2, r = Rch(a), seg = 2 * Math.PI * r / NS;
      let da = Math.abs(((a - aT + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const open = da < Math.asin(Math.min(0.9, tunEnd.w * 0.8 / r));
      const rot = Math.atan2(-Math.cos(a), -Math.sin(a));
      for (const [f, y0, y1] of [[0.9, -1, 4.2], [0.76, 4.2, 6.0], [0.55, 6.0, 8.5]]) {
        if (open && y0 < 4) continue;
        const rr = r * f + 0.8;
        K.hit(CH.x + Math.cos(a) * rr, CH.z + Math.sin(a) * rr, seg * f / 2 + 0.5, 0.8, rot, y0, y1, true);
      }
    }
    K.hit(CH.x, CH.z, 6, 6, 0, DOME - 0.6, DOME + 1, true);
  }

  // ---------------- rochas, estalactites e estalagmites ----------------
  const rockBlob = (x, y, z, r, k = 0.4, flat = 0.6, coll = true) => {
    const na = 7, ne = 4, rr = [];
    for (let i = 0; i <= na; i++) { rr[i] = []; for (let j = 0; j <= ne; j++) rr[i][j] = r * (0.75 + 0.5 * hash((x * 7 | 0) + i % na, (z * 7 | 0) + j)); }
    const pt = (i, j) => { const a = (i / na) * Math.PI * 2, e = -Math.PI / 2 + (j / ne) * Math.PI, q = rr[i % na][j]; return [x + Math.cos(a) * Math.cos(e) * q, y + Math.sin(e) * q * flat, z + Math.sin(a) * Math.cos(e) * q]; };
    for (let j = 1; j < ne; j++) for (let i = 0; i < na; i++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      K.quadOut('int:g:rock', a, b, c, d, V.sub(V.scl(V.add(V.add(a, b), V.add(c, d)), 0.25), [x, y, z]), [[i * 0.5, j * 0.5], [(i + 1) * 0.5, j * 0.5], [(i + 1) * 0.5, (j + 1) * 0.5], [i * 0.5, (j + 1) * 0.5]], [rockShade(a, k), rockShade(b, k), rockShade(c, k * 1.1), rockShade(d, k * 1.1)]);
    }
    const top = pt(0, ne);
    for (let i = 0; i < na; i++) K.triOut('int:g:rock', top, pt(i, ne - 1), pt(i + 1, ne - 1), [0, 1, 0], [0, 0], [r, 0], [0, r], gray(k * 1.2), gray(k * 1.1), gray(k * 1.1));
    // raio médio da pedra (cada ponto varia de 0,75 a 1,25 r): com 0,75 r o corpo entrava nela
    if (coll && y + r * flat > H(x, z) + 0.3) K.round(x, z, r, y - r, y + r * flat, r > 0.9);
  };
  const cone = (x, y, z, r, len, down, k = 0.38) => {
    const tip = [x + (hash(x * 9 | 0, 1) - 0.5) * 0.1, y + (down ? -len : len), z];
    K.prism('int:g:rock', [x, y, z], tip, r, 0, 6, [k * 1.05, k, k * 0.85], false, 1);
  };
  // estalactites no salão e no túnel
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.85, r = Rch(a) * d, x = CH.x + Math.cos(a) * r, z = CH.z + Math.sin(a) * r;
    const e = Math.acos(Math.min(1, Math.pow(d / 1.0, 1 / 0.45))), y = Math.sin(e) * DOME - 0.6;
    if (y < 3.2) continue;
    cone(x, y + 0.3, z, 0.08 + R() * 0.22, 0.4 + R() * 1.5, true);
  }
  for (const rg of rings) if (R() < 0.6) { const off = (R() - 0.5) * rg.w; cone(rg.p.x + rg.nx * off, rg.y + rg.h - 0.3, rg.p.z + rg.nz * off, 0.06 + R() * 0.12, 0.3 + R() * 0.7, true); }
  // estalagmites e pedras nas bordas
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = Rch(a) * (0.78 + R() * 0.12), x = CH.x + Math.cos(a) * r, z = CH.z + Math.sin(a) * r;
    if (Math.hypot(x - tunEnd.p.x, z - tunEnd.p.z) < 4) continue;
    const y = H(x, z), rr = 0.15 + R() * 0.3, len = 0.4 + R() * 1.6;
    cone(x, y - 0.1, z, rr, len, false);
    K.round(x, z, Math.max(0.12, rr * 0.8), y, y + len);   // as finas também: senão o corpo passa por dentro
  }
  for (let i = 0; i < 22; i++) {
    const a = R() * Math.PI * 2, r = Rch(a) * (0.86 + R() * 0.1), x = CH.x + Math.cos(a) * r, z = CH.z + Math.sin(a) * r;
    if (Math.hypot(x - tunEnd.p.x, z - tunEnd.p.z) < 3.5) continue;
    rockBlob(x, H(x, z), z, 0.6 + R() * 1.1, 0.34 + R() * 0.1);
  }
  for (let i = 2; i < rings.length - 2; i += 2) {
    const rg = rings[i], sd = R() < 0.5 ? -1 : 1, x = rg.p.x + rg.nx * sd * rg.w * 0.8, z = rg.p.z + rg.nz * sd * rg.w * 0.8;
    rockBlob(x, H(x, z), z, 0.4 + R() * 0.5, 0.32, 0.6);
  }
  // pedras escondendo a emenda do túnel com o salão
  for (const sd of [-1, 1]) {
    const x = tunEnd.p.x + tunEnd.nx * sd * (tunEnd.w + 0.3), z = tunEnd.p.z + tunEnd.nz * sd * (tunEnd.w + 0.3);
    rockBlob(x, H(x, z), z, 1.4, 0.32, 1.4);
  }

  // ---------------- cristais verdes ----------------
  const glowAt = [];
  const crystals = (x, y, z, dir, s = 1, n = 7) => {
    const [dx, dy, dz] = V.nrm(dir);
    for (let i = 0; i < n; i++) {
      const sp = i === 0 ? 0.15 : 0.5, d = V.nrm([dx + (hash(i, x * 10 | 0) - 0.5) * sp * 2, dy + (hash(i, z * 10 | 0) - 0.3) * sp * 1.5, dz + (hash(i + 5, x * 10 | 0) - 0.5) * sp * 2]);
      const len = (0.35 + hash(i, 7 + (y * 10 | 0)) * 0.9) * s * (i === 0 ? 1.5 : 1), r = (0.05 + hash(i, 3) * 0.08) * s * (i === 0 ? 1.5 : 1);
      const base = [x + (hash(i, 11) - 0.5) * 0.25 * s, y, z + (hash(i, 13) - 0.5) * 0.25 * s];
      const mid = V.add(base, V.scl(d, len)), tip = V.add(base, V.scl(d, len * 1.3));
      const k = 0.7 + hash(i, 17) * 0.5;
      facetPrism(K, V.add(base, V.scl(d, -0.1)), mid, r, r, k, hash(i, 19) * 2);
      facetPrism(K, mid, tip, r, 0, k * 1.15, hash(i, 19) * 2);
    }
    // o cacho é sólido (os do teto ficam fora do alcance)
    if (s >= 0.5 && y < H(x, z) + 1.2) K.round(x + dx * 0.45 * s, z + dz * 0.45 * s, 0.5 * s, y - 0.3, y + 1.3 * s);
    // brilho: dois quadros cruzados e mancha no chão
    const g = 0.9 * s, cy = y + 0.45 * s;
    K.quad('int:g:glow', [x - g, cy - g, z], [x + g, cy - g, z], [x + g, cy + g, z], [x - g, cy + g, z]);
    K.quad('int:g:glow', [x, cy - g, z - g], [x, cy - g, z + g], [x, cy + g, z + g], [x, cy + g, z - g]);
    groundDecal('int:g:glowFloor', x - 2.4 * s, z - 2.4 * s, x + 2.4 * s, z + 2.4 * s, 0.04, glowUV);
    glowAt.push([x, y, z]);
  };
  // cristal 1: na parede do túnel, no meio do caminho
  const r1 = rings[Math.round(rings.length * 0.47)], c1 = [r1.p.x + r1.nx * r1.w * 0.85, r1.p.z + r1.nz * r1.w * 0.85];
  crystals(c1[0], H(c1[0], c1[1]) + 0.1, c1[1], [-r1.nx, 0.5, -r1.nz], 1.0, 8);
  const r2 = rings[rings.length - 4], c4 = [r2.p.x - r2.nx * r2.w * 0.85, r2.p.z - r2.nz * r2.w * 0.85];
  crystals(c4[0], H(c4[0], c4[1]) + 0.6, c4[1], [r2.nx, 0.3, r2.nz], 0.6, 5);
  // cristal 2: brotando da rocha no lado noroeste do salão
  const a2 = 2.1, c2 = [CH.x + Math.cos(a2) * Rch(a2) * 0.84, CH.z + Math.sin(a2) * Rch(a2) * 0.84];
  rockBlob(c2[0], H(c2[0], c2[1]), c2[1], 1.0, 0.3);
  crystals(c2[0], H(c2[0], c2[1]) + 0.5, c2[1], [CH.x - c2[0], 3, CH.z - c2[1]], 1.25, 9);
  // veio de cristal no alto da cúpula (luz geral da luta)
  for (let i = 0; i < 4; i++) { const a = i * 1.7, x = CH.x + Math.cos(a) * 1.6, z = CH.z + Math.sin(a) * 1.6; crystals(x, DOME - 0.6, z, [Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3], 0.5, 4); }
  // o meteorito de 1978: pedra escura meio enterrada, cristais saindo das rachaduras
  {
    const { x, z } = METEOR, y = H(x, z);
    rockBlob(x, y + 0.1, z, 1.5, 0.16, 0.75);
    groundDecal('int:g:scorch', x - 3.4, z - 3.4, x + 3.4, z + 3.4, 0.035, (px, pz) => [(px - x + 3.4) / 6.8, (pz - z + 3.4) / 6.8]);
    crystals(x - 0.5, y + 0.9, z - 0.3, [-1, 1.2, -0.4], 1.3, 9);
    crystals(x + 0.6, y + 0.7, z + 0.6, [0.6, 1, 0.8], 0.9, 6);
    crystals(x - 0.2, y + 1.15, z + 0.4, [0, 1, 0], 0.8, 5);
  }

  // ---------------- o ninho ----------------
  {
    const { x, z } = NEST, y = H(x, z);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 * 2.3 + R() * 0.3, r = 1.25 + R() * 0.35, h = y + 0.05 + (i / 46) * 0.4 + R() * 0.08;
      const len = 0.9 + R() * 0.7, ta = a + Math.PI / 2 + (R() - 0.5) * 0.6;
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      K.beam('woodDark', [cx - Math.cos(ta) * len / 2, h, cz - Math.sin(ta) * len / 2], [cx + Math.cos(ta) * len / 2, h + (R() - 0.5) * 0.15, cz + Math.sin(ta) * len / 2], 0.05, 0.04, [0.32 + R() * 0.1, 0.24, 0.16]);
    }
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, r = R() * 0.9; woolTuft(K, x + Math.cos(a) * r, y + 0.03, z + Math.sin(a) * r, 0.18 + R() * 0.15, R); }
    feathers(K, R, H, x, z, 40, 1.4);
    for (let i = 0; i < 6; i++) bone(K, x + (R() - 0.5) * 1.6, y + 0.12, z + (R() - 0.5) * 1.6, R() * 6, 0.35 + R() * 0.2);
    sheepSkull(K, x + 0.4, y + 0.1, z - 0.3, 2.4);
    crystals(x - 0.5, y + 0.05, z + 0.5, [0.2, 1, 0.1], 0.35, 4);
    K.decal('int:g:blood', x, z, 1.2, 0.03);
  }

  // ---------------- carcaças, ossos, penas e sangue ----------------
  sheepSkeleton(K, H, 25.0, 25.6, 0.7);
  sheepRemains(K, R, H, 36.2, 16.4, 2.2);
  for (const [x, z, a] of [[27.5, 15.5, 0.4], [33.5, 29.6, 2.0], [23.6, 21.5, 4.1], [38.2, 24.5, 1.2]]) deadChicken(K, x, H(x, z), z, a, R);
  feathers(K, R, H, 28.5, 16.5, 30, 2.5);
  feathers(K, R, H, 36, 24.5, 25, 2.2);
  for (const rg of rings) if (R() < 0.35) feathers(K, R, H, rg.p.x, rg.p.z, 4, rg.w * 0.6);
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 8, x = CH.x + Math.cos(a) * d, z = CH.z + Math.sin(a) * d;
    bone(K, x, H(x, z) + 0.03, z, R() * 6, 0.25 + R() * 0.25);
  }
  for (let i = 0; i < 12; i++) {
    const rg = rings[Math.floor(R() * rings.length)], off = (R() - 0.5) * rg.w * 1.2, x = rg.p.x + rg.nx * off, z = rg.p.z + rg.nz * off;
    bone(K, x, H(x, z) + 0.03, z, R() * 6, 0.25 + R() * 0.2);
  }
  // crânio de boi com chifres na entrada do salão (aviso)
  cowSkull(K, tunEnd.p.x + 1.4, H(tunEnd.p.x + 1.4, tunEnd.p.z - 1.2) + 0.05, tunEnd.p.z - 1.2, 2.6);
  // trilha de sangue arrastado do túnel até o ninho
  for (let i = 0; i < 16; i++) {
    const t = i / 15, x = tunEnd.p.x + (NEST.x - tunEnd.p.x) * t + Math.sin(i * 1.9) * 0.6, z = tunEnd.p.z + (NEST.z - tunEnd.p.z) * t + Math.cos(i * 1.3) * 0.5, s = 0.35 + R() * 0.4;
    K.decal('int:g:blood', x, z, s, 0.03);
  }
  for (let i = 4; i < rings.length; i += 3) { const rg = rings[i], s = 0.3 + R() * 0.3, x = rg.p.x + rg.nx * (R() - 0.5), z = rg.p.z + rg.nz * (R() - 0.5); K.decal('int:g:blood', x, z, s, 0.03); }
  // poças escuras de goteira
  B.col = [0.3, 0.33, 0.32];
  for (const [x, z, s] of [[26.5, 19.0, 1.0], [8.4, 8.0, 0.7], [31.8, 27.8, 0.8]]) K.poly('water', Array.from({ length: 9 }, (_, i) => { const a = i / 9 * 6.28; return [x + Math.cos(a) * s * (0.7 + hash(i, s * 10 | 0) * 0.5), z + Math.sin(a) * s * 0.7]; }), H(x, z) + 0.02, 1);
  B.col = [1, 1, 1];

  // ---------------- luzes ----------------
  const mk = (name, x, y, z, col, range, flicker = 0) => ({ name, x: o.x + x, y: o.y + y, z: o.z + z, col: col.slice(), base: col.slice(), range, flicker });
  const L = {
    boca: mk('boca', P[1].x, Htun(P[1].s) + 2.4, P[1].z, [0.62, 0.72, 1.05], 11),
    cristal1: mk('cristal1', c1[0] - r1.nx * 0.6, H(c1[0], c1[1]) + 1.0, c1[1] - r1.nz * 0.6, [0.4, 1.7, 0.6], 9),
    tunel2: mk('tunel2', c4[0] + r2.nx * 0.5, H(c4[0], c4[1]) + 1.2, c4[1] + r2.nz * 0.5, [0.35, 1.4, 0.55], 7),
    cristal2: mk('cristal2', c2[0] + (CH.x - c2[0]) * 0.12, H(c2[0], c2[1]) + 1.4, c2[1] + (CH.z - c2[1]) * 0.12, [0.45, 1.8, 0.65], 10),
    meteoro: mk('meteoro', METEOR.x - 1.2, H(METEOR.x, METEOR.z) + 1.6, METEOR.z, [0.5, 2.1, 0.75], 12),
    ninho: mk('ninho', NEST.x - 0.4, H(NEST.x, NEST.z) + 0.9, NEST.z + 0.4, [0.35, 1.3, 0.5], 7),
    salao: mk('salao', CH.x, DOME - 1.2, CH.z, [0.4, 1.35, 0.55], 17),
  };
  const lights = Object.values(L);

  // ---------------- pontos ----------------
  const ptAt = (x, z, h = 0) => ({ x: o.x + x, y: o.y + H(x, z), z: o.z + z, h });
  const sp = P.find(p => p.s >= 2.6) || P[2], sp2 = P[P.indexOf(sp) + 1];
  const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const c1f = [c1[0] - r1.nx * 1.4, c1[1] - r1.nz * 1.4], c2f = [c2[0] + (CH.x - c2[0]) * 0.22, c2[1] + (CH.z - c2[1]) * 0.22];
  const c3f = [METEOR.x - 2.3, METEOR.z + 0.2];
  const points = {
    spawn: ptAt(sp.x, sp.z, face(sp.x, sp.z, sp2.x, sp2.z)),
    arena: ptAt(CH.x, CH.z, face(CH.x, CH.z, tunEnd.p.x, tunEnd.p.z)),
    nest: ptAt(NEST.x, NEST.z, Math.PI),
    crystal1: ptAt(c1f[0], c1f[1], face(c1f[0], c1f[1], c1[0], c1[1])),
    crystal2: ptAt(c2f[0], c2f[1], face(c2f[0], c2f[1], c2[0], c2[1])),
    crystal3: ptAt(c3f[0], c3f[1], face(c3f[0], c3f[1], METEOR.x, METEOR.z)),
    entrance: ptAt(tunEnd.p.x + 1.2, tunEnd.p.z + 1.0, face(tunEnd.p.x, tunEnd.p.z, CH.x, CH.z)),
    tunnel: ptAt(P[Math.round(P.length * 0.5)].x, P[Math.round(P.length * 0.5)].z, Math.PI / 2),
  };
  // posições exatas dos cristais (para a missão pôr/quebrar um item)
  points.crystal1.at = { x: o.x + c1[0], y: o.y + H(c1[0], c1[1]) + 0.5, z: o.z + c1[1] };
  points.crystal2.at = { x: o.x + c2[0], y: o.y + H(c2[0], c2[1]) + 0.9, z: o.z + c2[1] };
  points.crystal3.at = { x: o.x + METEOR.x, y: o.y + H(METEOR.x, METEOR.z) + 1.4, z: o.z + METEOR.z };

  // ---------------- animação: cristais pulsando, luzes por trecho ----------------
  let cam = null;
  objects.add(cameraProbe(c => { cam = c; }));
  const v3 = new THREE.Vector3();
  const crU = M['int:g:crystal'].uniforms.uColor.value, glU = M['int:g:glow'].uniforms.uColor.value, gfU = M['int:g:glowFloor'].uniforms.uColor.value;
  const SETS = {
    boca: ['boca', 'cristal1', 'tunel2'],
    tunel: ['cristal1', 'tunel2', 'boca', 'salao'],
    salao: ['salao', 'cristal2', 'meteoro', 'ninho', 'tunel2'],
  };
  const def = {
    title: 'GRUTA DO CHUPACABRAS',
    bounds: { x0: o.x - 1, x1: o.x + 42, z0: o.z - 2, z1: o.z + 34 },
    floorY: o.y,
    spawn: { x: points.spawn.x, z: points.spawn.z, h: points.spawn.h },
    exits: [{ x: o.x + P[1].x, z: o.z + P[1].z, r: 1.6, label: 'SAIR' }],
    lights,
    lightsAll: lights,
    light: name => L[name],
    points,
    objects,
    // ponto (mundo) dentro da gruta? (para a missão sortear lugares)
    dark: false,       // true = os cristais quase apagam (sobra o luar da boca)
    isInside: (x, z, m = -0.6) => inside(x - o.x, z - o.z, m),
    groundY: (x, z) => o.y + meshH(x - o.x, z - o.z),
    // chão de quem anda (world.groundAt): a malha de terra desenhada
    ground: (x, z) => o.y + meshH(x - o.x, z - o.z),
    update(dt, t, active) {
      if (!active) return;
      for (const f of anim) f(dt, t);
      // os cristais respiram juntos
      const k = (0.78 + 0.22 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 4.7)) * (def.dark ? 0.25 : 1);
      crU.setRGB(0.75 * k, 1.0 * k, 0.8 * k);
      glU.setRGB(0.12 * k, 0.45 * k, 0.18 * k);
      gfU.setRGB(0.08 * k, 0.3 * k, 0.12 * k);
      for (const l of lights) if (l.name !== 'boca') l.col = l.base.map(c => c * (0.8 + 0.2 * k));
      let px = null, pz = null;
      if (cam) { cam.getWorldDirection(v3); const l = Math.hypot(v3.x, v3.z) || 1; px = cam.position.x + v3.x / l * 3.6 - o.x; pz = cam.position.z + v3.z / l * 3.6 - o.z; }
      if (px === null) { def.lights = lights; return; }
      const n = near(px, pz), room = dCh(px, pz) < Rch(Math.atan2(pz - CH.z, px - CH.x)) - 0.5 ? 'salao' : n.s < LT * 0.4 ? 'boca' : 'tunel';
      def.lights = SETS[room].map(nm => L[nm]);
      if (def.dark) def.lights = def.lights.filter(l => l.name === 'boca');   // cristais quase apagados
    },
  };
  return def;
}

// ---------------------------------------------------------------------------
// restos de bichos
// ---------------------------------------------------------------------------
function bone(K, x, y, z, rot, len) {
  const F = K.frame(x, y, z, rot), c = [0.7, 0.64, 0.5];
  F.beam('carPaint', [-len / 2, 0.02, 0], [len / 2, 0.02, 0], 0.035, 0.035, c);
  for (const s of [-1, 1]) F.box('carPaint', s * len / 2, -0.005, 0, 0.055, 0.055, 0.07, c);
}

function feathers(K, R, H, x, z, n, rad) {
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * rad, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, y = H(px, pz) + 0.025;
    const r = R() * 6.28, c = Math.cos(r) * 0.04, s = Math.sin(r) * 0.04, c2 = Math.cos(r) * 0.08, s2 = Math.sin(r) * 0.08;
    const col = R() < 0.5 ? [0.6, 0.4, 0.22] : [0.95, 0.93, 0.88];
    K.quadOut('int:g:feather', [px - c - s2, y, pz + s - c2], [px + c - s2, y, pz - s - c2], [px + c + s2, y + 0.02, pz - s + c2], [px - c + s2, y + 0.02, pz + s + c2], [0, 1, 0], UV1, [col, col, col, col]);
  }
}

function woolTuft(K, x, y, z, s, R) {
  const k = 0.42 + R() * 0.2;
  for (let i = 0; i < 3; i++) { const F = K.frame(x + (R() - 0.5) * s, y, z + (R() - 0.5) * s, R() * 6, (R() - 0.5) * 0.6, (R() - 0.5) * 0.6); F.box('int:g:wool', 0, -0.02, 0, s * (0.4 + R() * 0.4), s * 0.3, s * (0.4 + R() * 0.4), [k, k * 0.95, k * 0.85], 0.4, ''); }
}

function sheepSkull(K, x, y, z, rot) {
  const F = K.frame(x, y, z, rot), c = [0.74, 0.68, 0.54];
  F.box('carPaint', 0, 0, 0, 0.16, 0.13, 0.3, c);
  F.box('carPaint', 0, 0.02, 0.18, 0.1, 0.08, 0.14, c.map(v => v * 0.92));
  for (const sd of [-1, 1]) {
    F.box('carPaint', sd * 0.05, 0.08, -0.02, 0.03, 0.025, 0.03, [0.05, 0.04, 0.03]);
    let p = [sd * 0.07, 0.11, -0.1];
    for (let i = 0; i < 4; i++) { const a = i * 1.2, q = [sd * (0.1 + Math.sin(a) * 0.09), 0.11 + Math.cos(a) * 0.08 - 0.02 * i, -0.12 + i * 0.03]; F.prism('carPaint', p, q, 0.035 - i * 0.006, 0.03 - i * 0.006, 5, [0.5, 0.45, 0.36]); p = q; }
  }
}

function cowSkull(K, x, y, z, rot) {
  const F = K.frame(x, y, z, rot, -0.25), c = [0.76, 0.7, 0.56];
  F.box('carPaint', 0, 0, 0, 0.28, 0.22, 0.42, c);
  F.box('carPaint', 0, 0.02, 0.3, 0.17, 0.12, 0.24, c.map(v => v * 0.9));
  for (const sd of [-1, 1]) {
    F.box('carPaint', sd * 0.08, 0.13, 0.05, 0.06, 0.05, 0.05, [0.05, 0.04, 0.03]);
    F.prism('carPaint', [sd * 0.13, 0.17, -0.12], [sd * 0.38, 0.28, -0.14], 0.05, 0.035, 6, [0.66, 0.6, 0.46]);
    F.prism('carPaint', [sd * 0.38, 0.28, -0.14], [sd * 0.46, 0.5, -0.1], 0.035, 0.0, 6, [0.4, 0.36, 0.28]);
  }
}

// esqueleto de ovelha: espinha, costelas em arco, bacia, crânio e patas soltas
function sheepSkeleton(K, H, x, z, rot) {
  const y = H(x, z), F = K.frame(x, y, z, rot), c = [0.72, 0.66, 0.52];
  F.beam('carPaint', [0, 0.32, -0.55], [0, 0.36, 0.55], 0.06, 0.06, c);
  for (let i = 0; i < 7; i++) {
    const zz = -0.35 + i * 0.12;
    for (const sd of [-1, 1]) {
      let p = [sd * 0.03, 0.34, zz];
      for (let k = 1; k <= 3; k++) { const a = (k / 3) * Math.PI * 0.62, q = [sd * (0.03 + Math.sin(a) * 0.28), 0.34 - (1 - Math.cos(a)) * 0.32, zz + 0.02 * k]; F.beam('carPaint', p, q, 0.022, 0.03, c); p = q; }
    }
  }
  F.box('carPaint', 0, 0.22, -0.68, 0.24, 0.14, 0.18, c);
  for (const [lx, lz, a] of [[-0.35, -0.6, 0.3], [0.32, -0.5, 2.1], [-0.3, 0.55, 1.2], [0.42, 0.62, 2.7]]) { const G = K.frame(x, y, z, rot); const p = G.P(lx, 0.03, lz); bone(K, p[0], p[1], p[2], rot + a, 0.45); }
  const sk = F.P(0.1, 0.06, 0.95);
  sheepSkull(K, sk[0], sk[1], sk[2], rot + 0.5);
  K.round(x, z, 0.5, y, y + 0.45);
  const s = 1.1;
  K.decal('int:g:blood', x, z, s, 0.025);
}

// ovelha meio comida: corpo de lã aberto nas costelas
function sheepRemains(K, R, H, x, z, rot) {
  const y = H(x, z), F = K.frame(x, y, z, rot);
  const wool = [0.62, 0.58, 0.5];
  F.box('int:g:wool', 0, 0.0, -0.25, 0.55, 0.42, 0.55, wool, 0.5);
  F.box('int:g:wool', 0.05, 0.0, 0.42, 0.45, 0.32, 0.35, wool, 0.5);
  F.box('carPaint', 0, 0.02, 0.12, 0.42, 0.2, 0.32, [0.38, 0.06, 0.05]);
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) F.beam('carPaint', [sd * 0.03, 0.24, 0.0 + i * 0.08], [sd * 0.22, 0.05, 0.02 + i * 0.08], 0.02, 0.025, [0.75, 0.66, 0.52]);
  F.box('int:g:wool', 0.0, 0.05, 0.78, 0.18, 0.2, 0.26, wool.map(v => v * 0.9), 0.5);
  for (const [lx, lz] of [[-0.18, -0.4], [0.2, -0.45], [-0.2, 0.5]]) F.beam('carPaint', [lx, 0.1, lz], [lx * 2.2, 0.03, lz * 1.4], 0.05, 0.05, [0.2, 0.17, 0.14]);
  K.round(x, z, 0.6, y, y + 0.5);
  const s = 1.3;
  K.decal('int:g:blood', x, z, s, 0.025);
  for (let i = 0; i < 6; i++) woolTuft(K, x + (R() - 0.5) * 2.4, y + 0.02, z + (R() - 0.5) * 2.4, 0.12 + R() * 0.1, R);
}

function deadChicken(K, x, y, z, ang, R) {
  const brown = R() < 0.45;
  const body = brown ? [0.55, 0.32, 0.16] : [0.9, 0.88, 0.82];
  const F = K.frame(x, y, z, ang);
  F.box('carPaint', 0, 0, 0, 0.17, 0.13, 0.3, body);
  F.box('carPaint', 0.02, 0.04, -0.17, 0.12, 0.1, 0.08, body.map(v => v * 0.85));
  F.box('carPaint', 0.05, 0, 0.2, 0.07, 0.07, 0.08, body);
  F.box('carPaint', 0.05, 0.07, 0.21, 0.02, 0.03, 0.06, [0.7, 0.08, 0.06]);
  for (const lx of [-0.04, 0.04]) F.box('carPaint', lx, 0.12, -0.04, 0.018, 0.12, 0.018, [0.85, 0.65, 0.2]);
  F.box('carPaint', 0, 0.005, 0.0, 0.3, 0.005, 0.4, [0.35, 0.04, 0.04]);
}

// prisma de cristal com faces de tons diferentes (lapidação falsa, o material não tem luz)
function facetPrism(K, a, b, r0, r1, k, twist) {
  const d = V.sub(b, a), len = Math.hypot(d[0], d[1], d[2]), az = V.scl(d, 1 / len);
  const up = Math.abs(az[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const ax = V.nrm(V.crs(up, az)), ay = V.crs(az, ax), n = 6;
  const ring = (c, r, i) => { const t = (i / n) * Math.PI * 2 + twist; return V.add(c, V.add(V.scl(ax, Math.cos(t) * r), V.scl(ay, Math.sin(t) * r))); };
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * Math.PI * 2 + twist, out = V.add(V.scl(ax, Math.cos(t)), V.scl(ay, Math.sin(t)));
    const s = k * (0.55 + 0.45 * Math.max(0, Math.cos(t - 0.9))) + (i % 2 ? 0.05 : 0);
    const c0 = [s * 0.8, s * 0.8, s * 0.8], c1 = [s * 1.15, s * 1.15, s * 1.15];
    K.quadOut('int:g:crystal', ring(a, r0, i), ring(a, r0, i + 1), ring(b, r1, i + 1), ring(b, r1, i), out, [[i / n, 0], [(i + 1) / n, 0], [(i + 1) / n, 1], [i / n, 1]], [c0, c0, c1, c1]);
  }
}
