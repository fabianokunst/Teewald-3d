import * as THREE from 'three';
import { ps1LineMaterial } from '../engine/ps1material.js';
import { pyramid } from './church.js';
import { rng, resample } from './geo.js';

// Mobiliário urbano e objetos (todos low poly, mesclados no builder)

const rotP = (x, z, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
};

export function bench(B, ctx, x, z, rot) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.col = [1, 1, 1];
  for (const lx of [-0.75, 0.75]) {
    const p = P(lx, 0, 0);
    B.box('iron', p[0], y, p[2], 0.08, 0.45, 0.5, rot, { uvScale: 1 });
    const q = P(lx, 0, -0.22);
    B.box('iron', q[0], y + 0.45, q[2], 0.06, 0.45, 0.06, rot, { uvScale: 1 });
  }
  for (let i = 0; i < 3; i++) {
    const p = P(0, 0, 0.16 - i * 0.16);
    B.box('woodBench', p[0], y + 0.42, p[2], 1.8, 0.05, 0.12, rot, { uvScale: 1 });
  }
  for (let i = 0; i < 2; i++) {
    const p = P(0, 0, -0.24);
    B.box('woodBench', p[0], y + 0.6 + i * 0.2, p[2], 1.8, 0.12, 0.05, rot, { uvScale: 1 });
  }
  ctx.collision.addBox(x, z, 0.95, 0.3, rot, y, y + 0.9, { cam: false });
}

export function picnicTable(B, ctx, x, z, rot) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.box('woodBench', x, y + 0.72, z, 1.9, 0.06, 0.8, rot, { uvScale: 1 });
  for (const lx of [-0.7, 0.7]) { const p = P(lx, 0, 0); B.box('woodBench', p[0], y, p[2], 0.1, 0.72, 0.1, rot, { uvScale: 1 }); }
  for (const lz of [-0.75, 0.75]) {
    const p = P(0, 0, lz);
    B.box('woodBench', p[0], y + 0.42, p[2], 1.9, 0.05, 0.3, rot, { uvScale: 1 });
    for (const lx of [-0.7, 0.7]) { const q = P(lx, 0, lz); B.box('woodBench', q[0], y, q[2], 0.08, 0.42, 0.08, rot, { uvScale: 1 }); }
  }
  ctx.collision.addBox(x, z, 1.0, 1.0, rot, y, y + 0.8, { cam: false });
}

export function bin(B, ctx, x, z) {
  const y = ctx.terrain.heightAt(x, z);
  B.col = [0.35, 0.5, 0.35];
  B.cylinder('metalGray', x, y, z, 0.25, 0.28, 0.8, 6, { cap: true, capMat: 'iron' });
  B.col = [1, 1, 1];
  ctx.collision.addCircle(x, z, 0.3, y, y + 0.8);
}

// lampião de ferro (praça / calçadão)
export function lantern(B, ctx, x, z, h = 3.6) {
  const y = ctx.terrain.heightAt(x, z);
  B.col = [1, 1, 1];
  B.cylinder('iron', x, y, z, 0.16, 0.12, 0.5, 6, { cap: true });
  B.cylinder('iron', x, y + 0.5, z, 0.06, 0.05, h - 0.5, 5);
  B.box('lamp', x, y + h, z, 0.36, 0.5, 0.36, 0, { faceUV: true, top: false, topMat: 'iron' });
  pyramid(B, 'iron', [x, y + h + 0.5, z], 0.3, 0.35, Math.PI / 4, 4);
  ctx.collision.addCircle(x, z, 0.18, y, y + h + 0.8);
  ctx.lights?.push([x, y + h + 0.25, z]);
}

// poste de concreto com braço de luz (ruas)
export function streetPole(B, ctx, x, z, rot, withLamp = true) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.col = [0.85, 0.85, 0.82];
  B.box('concrete', x, y, z, 0.24, 8.5, 0.24, rot, { uvScale: 2 });
  B.box('concrete', x, y + 7.6, z, 1.2, 0.12, 0.12, rot, { uvScale: 1 });
  if (withLamp) {
    const a = P(0, 0, 1.0);
    B.box('metalGray', (x + a[0]) / 2, y + 7.2, (z + a[2]) / 2, 0.08, 0.08, 1.2, rot, { uvScale: 1 });
    B.col = [1, 1, 1];
    B.box('lamp', a[0], y + 7.0, a[2], 0.25, 0.14, 0.45, rot, { faceUV: true });
  }
  B.col = [1, 1, 1];
  ctx.collision.addCircle(x, z, 0.2, y, y + 8.5);
  return [P(-0.55, y + 7.7, 0), P(0.55, y + 7.7, 0)];
}

export function orelhao(B, ctx, x, z, rot) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.col = [0.7, 0.7, 0.7];
  B.box('metalGray', x, y, z, 0.1, 2.0, 0.1, rot, { uvScale: 1 });
  B.col = [1, 1, 1];
  // concha (telhado de orelhão)
  const c = P(0, y + 1.25, 0.32);
  const n = 8, r = 0.62;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const b0 = (j / 3) * (Math.PI / 2), b1 = ((j + 1) / 3) * (Math.PI / 2);
      const pt = (a, b) => { const q = P(Math.cos(a) * Math.cos(b) * r * 0.9, 0, 0.32 + Math.sin(a) * Math.cos(b) * r); return [q[0], c[1] + Math.sin(b) * r * 1.1, q[2]]; };
      B.quad('orelhaoShell', pt(a1, b0), pt(a0, b0), pt(a0, b1), pt(a1, b1), [[(i + 1) / n, j / 3], [i / n, j / 3], [i / n, (j + 1) / 3], [(i + 1) / n, (j + 1) / 3]]);
    }
  }
  // aparelho
  const ph = P(0, 0, 0.12);
  B.box('orelhao', ph[0], y + 1.2, ph[2], 0.28, 0.5, 0.16, rot, { faceUV: true });
  ctx.collision.addCircle(x, z, 0.25, y, y + 2.0);
}

export function stopSign(B, ctx, x, z, rot) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.col = [0.75, 0.75, 0.75];
  B.box('metalGray', x, y, z, 0.07, 2.2, 0.07, rot, { uvScale: 1 });
  B.col = [1, 1, 1];
  const r = 0.38, cy = y + 2.2, n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI / 8 + (i / n) * Math.PI * 2, a1 = Math.PI / 8 + ((i + 1) / n) * Math.PI * 2;
    const p0 = P(Math.cos(a0) * r, 0, 0.05), p1 = P(Math.cos(a1) * r, 0, 0.05), c = P(0, 0, 0.05);
    B.tri('pare', [c[0], cy, c[2]], [p0[0], cy + Math.sin(a0) * r, p0[2]], [p1[0], cy + Math.sin(a1) * r, p1[2]],
      [0.5, 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5]);
  }
  ctx.collision.addCircle(x, z, 0.12, y, y + 2.6);
}

export function busStop(B, ctx, x, z, rot) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.box('concrete', x, y - 0.3, z, 3.4, 0.45, 1.8, rot, { uvScale: 2 });
  for (const lx of [-1.5, 1.5]) { const p = P(lx, 0, -0.6); B.box('metalGray', p[0], y + 0.15, p[2], 0.1, 2.3, 0.1, rot); }
  const back = P(0, 0, -0.7);
  B.box('glass', back[0], y + 0.4, back[2], 3.0, 1.6, 0.05, rot, { faceUV: true });
  B.col = [0.85, 0.85, 0.85];
  B.box('metalWhite', x, y + 2.45, z, 3.6, 0.1, 2.0, rot, { uvScale: 2 });
  B.col = [1, 1, 1];
  const seat = P(0, 0, -0.4);
  B.box('woodBench', seat[0], y + 0.6, seat[2], 2.4, 0.06, 0.35, rot);
  ctx.collision.addBox(back[0], back[2], 1.6, 0.15, rot, y, y + 2.5);
}

// carro estacionado simples (estilo Fusca/Brasília/pick-up de 1990)
export function car(B, ctx, x, z, rot, color) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  B.col = color;
  B.box('carPaint', x, y + 0.35, z, 1.65, 0.6, 3.9, rot, { uvScale: 2 });
  const cab = P(0, 0, -0.2);
  B.box('carPaint', cab[0], y + 0.95, cab[2], 1.5, 0.5, 2.0, rot, { top: true, side: 'glass', faceUV: true });
  B.col = [1, 1, 1];
  for (const [lx, lz] of [[-0.8, 1.25], [0.8, 1.25], [-0.8, -1.25], [0.8, -1.25]]) {
    const p = P(lx, 0, lz);
    B.box('tire', p[0], y, p[2], 0.22, 0.55, 0.55, rot, { uvScale: 1 });
  }
  ctx.collision.addBox(x, z, 0.85, 1.95, rot, y, y + 1.45);
}

// guarda-corpo de madeira ao longo de uma polilinha
export function railing(B, ctx, pts, o = {}) {
  const P = resample(pts, 2.2);
  const h = o.h || 1.0;
  for (let i = 0; i < P.length; i++) {
    const [x, z] = P[i];
    const y = ctx.terrain.heightAt(x, z);
    B.box('woodDark', x, y, z, 0.12, h, 0.12, 0, { uvScale: 1 });
    if (i < P.length - 1) {
      const [x1, z1] = P[i + 1], y1 = ctx.terrain.heightAt(x1, z1);
      for (const k of [0.45, 0.9]) {
        const a = [x, y + h * k, z], b = [x1, y1 + h * k, z1];
        const dx = x1 - x, dz = z1 - z, L = Math.hypot(dx, dz), nx = -dz / L * 0.04, nz = dx / L * 0.04;
        B.quad('woodDark', [a[0] - nx, a[1], a[2] - nz], [b[0] - nx, b[1], b[2] - nz], [b[0] - nx, b[1] + 0.09, b[2] - nz], [a[0] - nx, a[1] + 0.09, a[2] - nz], [[0, 0], [L / 1.5, 0], [L / 1.5, 0.1], [0, 0.1]]);
        B.quad('woodDark', [b[0] + nx, b[1], b[2] + nz], [a[0] + nx, a[1], a[2] + nz], [a[0] + nx, a[1] + 0.09, a[2] + nz], [b[0] + nx, b[1] + 0.09, b[2] + nz], [[0, 0], [L / 1.5, 0], [L / 1.5, 0.1], [0, 0.1]]);
      }
      const cx = (x + x1) / 2, cz = (z + z1) / 2, L = Math.hypot(x1 - x, z1 - z);
      ctx.collision.addBox(cx, cz, 0.1, L / 2 + 0.05, Math.atan2(x1 - x, z1 - z), Math.min(y, y1) - 0.5, Math.max(y, y1) + h, { cam: false });
    }
  }
}

// letreiro colorido da cidade (como o do Calçadão do Rio Cadeia)
export function letreiro(B, ctx, x, z, rot, text = 'TEEWALD') {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  const colors = [[0.85, 0.2, 0.15], [0.95, 0.75, 0.15], [0.2, 0.55, 0.3], [0.2, 0.45, 0.75], [0.9, 0.45, 0.15], [0.6, 0.25, 0.55], [0.85, 0.2, 0.15]];
  const cw = 1.25, H = 1.8, gap = 0.18;
  const total = text.length * (cw + gap) - gap;
  B.col = [0.9, 0.9, 0.9];
  B.box('concrete', x, y - 0.3, z, total + 1, 0.55, 1.4, rot, { uvScale: 2 });
  for (let i = 0; i < text.length; i++) {
    const lx = -total / 2 + i * (cw + gap) + cw / 2;
    B.col = colors[i % colors.length];
    glyph(B, P, lx, y + 0.25, 0, cw, H, text[i], rot);
  }
  B.col = [1, 1, 1];
  ctx.collision.addBox(x, z, total / 2 + 0.5, 0.7, rot, y - 0.5, y + 0.25 + H);
}

// letras em blocos (grade 3x5)
const FONT = {
  T: ['111', '010', '010', '010', '010'], E: ['111', '100', '110', '100', '111'], W: ['101', '101', '101', '111', '101'],
  A: ['010', '101', '111', '101', '101'], L: ['100', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
};
function glyph(B, P, lx, y, lz, w, h, ch, rot) {
  const g = FONT[ch];
  if (!g) return;
  const cw = w / 3, chh = h / 5;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    if (g[r][c] !== '1') continue;
    const p = P(lx - w / 2 + cw * (c + 0.5), 0, lz);
    B.box('carPaint', p[0], y + (4 - r) * chh, p[2], cw, chh, 0.45, rot, { uvScale: 1 });
  }
}

// Monumento ao Imigrante: pedras grandes e mãos segurando o globo
export function monumento(B, ctx, x, z, rot) {
  const y = ctx.terrain.heightAt(x, z);
  const P = rotP(x, z, rot);
  const R = rng(73);
  B.col = [1, 1, 1];
  B.cylinder('granite', x, y - 0.3, z, 3.2, 3.2, 0.5, 8, { cap: true, capMat: 'stonePath' });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, r = R.range(1.4, 2.5);
    const sx = R.range(0.9, 1.6), sy = R.range(0.8, 1.9), sz = R.range(0.8, 1.4);
    B.col = [R.range(0.85, 1), R.range(0.85, 0.95), R.range(0.8, 0.9)];
    B.box('stoneRock', x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, sx, sy, sz, R.range(0, 3), { uvScale: 1.2 });
  }
  // pedestal e mãos
  B.col = [0.95, 0.95, 0.95];
  B.box('granite', x, y + 0.2, z, 1.2, 1.6, 1.2, rot, { uvScale: 1 });
  B.col = [1, 1, 1];
  for (const side of [-1, 1]) {
    const p = P(side * 0.45, 0, 0);
    B.box('bronze', p[0], y + 1.8, p[2], 0.35, 1.3, 0.4, rot + side * 0.25, { uvScale: 1 });
    const f = P(side * 0.62, 0, 0);
    B.box('bronze', f[0], y + 2.8, f[2], 0.2, 0.7, 0.35, rot + side * 0.5, { uvScale: 1 });
  }
  // globo (icosfera baixa)
  sphere(B, 'globe', x, y + 3.55, z, 0.75, 8, 5);
  ctx.collision.addCircle(x, z, 3.0, y - 0.5, y + 4.4);
}

export function sphere(B, mat, x, y, z, r, seg = 8, rings = 5) {
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const t0 = (j / rings) * Math.PI, t1 = ((j + 1) / rings) * Math.PI;
    const p0 = (i / seg) * Math.PI * 2, p1 = ((i + 1) / seg) * Math.PI * 2;
    const pt = (t, p) => [x + Math.sin(t) * Math.cos(p) * r, y + Math.cos(t) * r, z + Math.sin(t) * Math.sin(p) * r];
    const a = pt(t0, p0), b = pt(t0, p1), c = pt(t1, p1), d = pt(t1, p0);
    B.quad(mat, a, b, c, d, [[i / seg, 1 - j / rings], [(i + 1) / seg, 1 - j / rings], [(i + 1) / seg, 1 - (j + 1) / rings], [i / seg, 1 - (j + 1) / rings]]);
  }
}

// fonte da praça
export function fountain(B, ctx, x, z, y) {
  B.col = [1, 1, 1];
  B.cylinder('granite', x, y, z, 2.6, 2.6, 0.55, 10, { uRepeat: 4, vRepeat: 0.3 });
  B.cylinder('granite', x, y + 0.55, z, 2.6, 2.3, 0.08, 10, { cap: false });
  B.polygon('water', Array.from({ length: 10 }, (_, i) => [x + Math.cos(i / 10 * Math.PI * 2) * 2.3, z + Math.sin(i / 10 * Math.PI * 2) * 2.3]), y + 0.42, 2);
  B.cylinder('granite', x, y + 0.4, z, 0.35, 0.25, 1.4, 6, { cap: true });
  B.cylinder('granite', x, y + 1.8, z, 0.9, 0.9, 0.18, 8, { cap: true });
  B.cylinder('granite', x, y + 1.98, z, 0.12, 0.1, 0.7, 5, { cap: true });
  ctx.collision.addCircle(x, z, 2.7, y - 0.5, y + 2.6);
}

// postes e fios ao longo das ruas
export function utilityLines(ctx, B) {
  const { roads } = ctx;
  const R = rng(99);
  const segs = [];
  for (const r of roads.list) {
    if (r.rank < 3) continue;
    const c = r.pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map(v => v / r.pts.length);
    if (Math.hypot(c[0] + 80, c[1]) > 520) continue;
    const off = r.hw + (r.sidewalk ? 1.6 : 1.3);
    const P = resample(r.pts, 32);
    let prev = null;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const x = P[i][0] - (dz / l) * off, z = P[i][1] + (dx / l) * off;
      if (roads.index.clearance(x, z, d => d !== r).d < 1.2 || ctx.zones.insideBuilding(x, z, 0.6) || ctx.zones.isBlocked(x, z)) { prev = null; continue; }
      const rv = ctx.rivers.index.nearest(x, z);
      if (rv.seg && rv.d < rv.seg.data.width / 2 + 1.5) { prev = null; continue; }
      const rot = Math.atan2(dx / l, dz / l) + Math.PI / 2;
      const ends = streetPole(B, ctx, x, z, rot, R.chance(0.7));
      if (prev) for (let k = 0; k < 2; k++) segs.push(prev[k], ends[k]);
      prev = ends;
    }
  }
  // fios com catenária
  const pos = [];
  for (let i = 0; i < segs.length; i += 2) {
    const a = segs[i], b = segs[i + 1], N = 6;
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N;
      const p = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.6, a[2] + (b[2] - a[2]) * t];
      pos.push(...p(t0), ...p(t1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, ps1LineMaterial(0x202020));
  lines.frustumCulled = false;
  return lines;
}
