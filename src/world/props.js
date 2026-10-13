import * as THREE from 'three';
import { ps1LineMaterial } from '../engine/ps1material.js';
import { pyramid } from './church.js';
import { rng, resample } from './geo.js';

// Mobiliário urbano e objetos (todos low poly, mesclados no builder)

const rotP = (x, z, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
};

// ---------------- espaço livre para o mobiliário ----------------
// Uma peça só entra onde não encosta em nada: colisores (postes, lixeiras, muros,
// guarda-corpos, placas...), árvores e canteiros já pedidos, e as áreas
// reservadas na frente dos bancos, das mesas e da parada (onde fica quem senta).

const TREE_R = { hortensia: 0.75, arbusto: 0.9, cipreste: 0.6 };
export const treeRadius = t => TREE_R[t.t] ?? 0.45 * (t.s || 1);

// área que tem de ficar vazia (caixa girada, mesmo formato dos colisores)
export function reserve(ctx, x, z, hx, hz, rot) {
  (ctx.keepOut ||= []).push({ t: 'box', x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot) });
}

// distância do ponto até a borda da forma (0 ou menos: dentro)
function gap(it, x, z) {
  if (it.t === 'circle') return Math.hypot(x - it.x, z - it.z) - it.r;
  const dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
  return Math.hypot(Math.max(Math.abs(lx) - it.hx, 0), Math.max(Math.abs(lz) - it.hz, 0));
}

export function inKeepOut(ctx, x, z, m = 0) {
  return (ctx.keepOut || []).some(k => gap(k, x, z) < m);
}

// pontos de amostra de uma caixa girada (a cada ~0,3 m, bordas incluídas)
export function boxPts(x, z, hx, hz, rot) {
  const P = rotP(x, z, rot), out = [];
  const nx = Math.max(1, Math.ceil(hx * 2 / 0.3)), nz = Math.max(1, Math.ceil(hz * 2 / 0.3));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const p = P(-hx + (2 * hx * i) / nx, 0, -hz + (2 * hz * j) / nz);
    out.push([p[0], p[2]]);
  }
  return out;
}

// todos os pontos ficam a mais de m de qualquer obstáculo acima do chão?
// o.trees = false ignora as árvores; o.keep = false ignora as áreas reservadas
export function spotFree(ctx, pts, m, o = {}) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rad = Math.hypot(x1 - x0, z1 - z0) / 2 + m + 2;
  const ground = ctx.surfaceAt(cx, cz);
  const cols = ctx.collision.near(cx, cz, rad).filter(it => it.y1 > ground + 0.1);
  const trees = o.trees === false ? [] : ctx.trees.filter(t => !t.far && Math.abs(t.x - cx) < rad + 1 && Math.abs(t.z - cz) < rad + 1);
  const keep = o.keep === false ? [] : (ctx.keepOut || []).filter(k => Math.abs(k.x - cx) < rad + 3 && Math.abs(k.z - cz) < rad + 3);
  for (const [x, z] of pts) {
    for (const it of cols) if (gap(it, x, z) < m) return false;
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) - treeRadius(t) < m) return false;
    for (const k of keep) if (gap(k, x, z) < m) return false;
  }
  return true;
}

// chão firme e quase plano (sem água nem degrau) em todos os pontos
export function groundOk(ctx, pts, y, dy = 0.3) {
  return pts.every(([x, z]) => {
    const w = ctx.terrain.waterAt(x, z);
    if (w && ctx.terrain.heightAt(x, z) < w.level + 0.15) return false;
    return Math.abs(ctx.surfaceAt(x, z) - y) < dy;
  });
}

// o banco cabe aqui? assento livre e, na frente, `reach` metros desimpedidos
// (sem poste, canteiro, lixeira ou grade entre o banco e quem passa)
export function benchFits(ctx, x, z, rot, reach = 1.5) {
  const P = rotP(x, z, rot), f = P(0, 0, 0.3 + reach / 2);
  const body = boxPts(x, z, 0.95, 0.3, rot), front = boxPts(f[0], f[2], 0.85, reach / 2, rot);
  return spotFree(ctx, body, 0.15) && spotFree(ctx, front, 0.05) && groundOk(ctx, [...body, ...front], ctx.surfaceAt(x, z));
}

export function bench(B, ctx, x, z, rot) {
  const y = ctx.surfaceAt(x, z);
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
    B.box('woodBench', p[0], y + 0.42, p[2], 1.8, 0.05, 0.12, rot, { uvScale: 1, bottom: true });
  }
  for (let i = 0; i < 2; i++) {
    const p = P(0, 0, -0.24);
    B.box('woodBench', p[0], y + 0.6 + i * 0.2, p[2], 1.8, 0.12, 0.05, rot, { uvScale: 1 });
  }
  ctx.collision.addBox(x, z, 0.95, 0.3, rot, y, y + 0.9, { cam: false });
  // frente livre (pernas de quem senta): nada é colocado ali depois
  const f = P(0, 0, 0.95);
  reserve(ctx, f[0], f[2], 0.85, 0.65, rot);
  // assento (os moradores sentam aqui): frente para +z local, tampo a 0,47 m
  (ctx.seats ||= []).push({ x, z, rot, y, seat: 0.47, kind: 'bench' });
}

export function picnicTable(B, ctx, x, z, rot) {
  const y = ctx.surfaceAt(x, z);
  const P = rotP(x, z, rot);
  B.box('woodBench', x, y + 0.72, z, 1.9, 0.06, 0.8, rot, { uvScale: 1, bottom: true });
  for (const lx of [-0.7, 0.7]) { const p = P(lx, 0, 0); B.box('woodBench', p[0], y, p[2], 0.1, 0.72, 0.1, rot, { uvScale: 1 }); }
  for (const lz of [-0.75, 0.75]) {
    const p = P(0, 0, lz);
    B.box('woodBench', p[0], y + 0.42, p[2], 1.9, 0.05, 0.3, rot, { uvScale: 1, bottom: true });
    for (const lx of [-0.7, 0.7]) { const q = P(lx, 0, lz); B.box('woodBench', q[0], y, q[2], 0.08, 0.42, 0.08, rot, { uvScale: 1 }); }
  }
  ctx.collision.addBox(x, z, 1.0, 1.0, rot, y, y + 0.8, { cam: false });
  reserve(ctx, x, z, 1.4, 1.6, rot);   // espaço para sentar dos dois lados
}

export function bin(B, ctx, x, z) {
  const y = ctx.surfaceAt(x, z);
  B.col = [0.35, 0.5, 0.35];
  B.cylinder('metalGray', x, y, z, 0.25, 0.28, 0.8, 6, { cap: true, capMat: 'iron' });
  B.col = [1, 1, 1];
  ctx.collision.addCircle(x, z, 0.3, y, y + 0.8);
}

// lampião de ferro (praça / calçadão)
export function lantern(B, ctx, x, z, h = 3.6) {
  const y = ctx.surfaceAt(x, z);
  B.col = [1, 1, 1];
  B.cylinder('iron', x, y, z, 0.16, 0.12, 0.5, 6, { cap: true });
  B.cylinder('iron', x, y + 0.5, z, 0.06, 0.05, h - 0.5, 5);
  B.box('lamp', x, y + h, z, 0.36, 0.5, 0.36, 0, { faceUV: true, top: false, topMat: 'iron', bottom: true });
  pyramid(B, 'iron', [x, y + h + 0.5, z], 0.3, 0.35, Math.PI / 4, 4);
  ctx.collision.addCircle(x, z, 0.18, y, y + h + 0.8);
  ctx.lights?.push([x, y + h + 0.25, z]);
}

// poste de concreto com braço de luz (ruas)
export function streetPole(B, ctx, x, z, rot, withLamp = true) {
  const y = ctx.surfaceAt(x, z);
  const P = rotP(x, z, rot);
  B.col = [0.85, 0.85, 0.82];
  B.box('concrete', x, y, z, 0.24, 8.5, 0.24, rot, { uvScale: 2 });
  B.box('concrete', x, y + 7.6, z, 1.2, 0.12, 0.12, rot, { uvScale: 1, bottom: true });
  if (withLamp) {
    const a = P(0, 0, 1.0);
    B.box('metalGray', (x + a[0]) / 2, y + 7.2, (z + a[2]) / 2, 0.08, 0.08, 1.2, rot, { uvScale: 1 });
    B.col = [1, 1, 1];
    B.box('lamp', a[0], y + 7.0, a[2], 0.25, 0.14, 0.45, rot, { faceUV: true, bottom: true });
  }
  B.col = [1, 1, 1];
  ctx.collision.addCircle(x, z, 0.2, y, y + 8.5);
  return [P(-0.55, y + 7.7, 0), P(0.55, y + 7.7, 0)];
}

// orelhão: cúpula de fibra laranja aberta na frente, poste atrás e o aparelho
export function orelhao(B, ctx, x, z, rot) {
  const y = ctx.surfaceAt(x, z);
  (ctx.phones ||= []).push({ x, z, rot, y });   // o telefone fica do lado +z local
  const P = rotP(x, z, rot);
  B.col = [0.62, 0.62, 0.64];
  B.box('metalGray', x, y, z, 0.1, 2.15, 0.1, rot, { uvScale: 1 });
  // cúpula: elipsoide sem a frente (|a| > 2 rad) e sem o fundo
  B.col = [1, 1, 1];
  const C = [0, y + 1.62, 0.34], RX = 0.42, RY = 0.62, RZ = 0.46, NA = 10, NE = 5;
  const A0 = -1.9, E0 = -0.35, E1 = Math.PI / 2;
  const pt = (a, e) => P(C[0] + Math.sin(a) * Math.cos(e) * RX, C[1] + Math.sin(e) * RY, C[2] - Math.cos(a) * Math.cos(e) * RZ);
  for (let i = 0; i < NA; i++) for (let j = 0; j < NE; j++) {
    const a0 = A0 + (i / NA) * -A0 * 2, a1 = A0 + ((i + 1) / NA) * -A0 * 2;
    const e0 = E0 + (j / NE) * (E1 - E0), e1 = E0 + ((j + 1) / NE) * (E1 - E0);
    const uv = [[i / NA, j / NE], [(i + 1) / NA, j / NE], [(i + 1) / NA, (j + 1) / NE], [i / NA, (j + 1) / NE]];
    B.col = [1, 1, 1];
    B.quad('orelhaoShell', pt(a0, e0), pt(a0, e1), pt(a1, e1), pt(a1, e0), [uv[0], uv[3], uv[2], uv[1]]);
    B.col = [0.45, 0.42, 0.4]; // dentro, na sombra
    B.quad('orelhaoShell', pt(a0, e0), pt(a1, e0), pt(a1, e1), pt(a0, e1), uv);
  }
  // aparelho preso ao poste, virado para +z
  const ph = P(0, 0, 0.14);
  B.col = [0.55, 0.12, 0.1];
  B.box('metalGray', ph[0], y + 1.2, ph[2], 0.3, 0.52, 0.18, rot, { uvScale: 1 });
  B.col = [1, 1, 1];
  B.quad('orelhaoPhone', P(-0.15, y + 1.2, 0.234), P(0.15, y + 1.2, 0.234), P(0.15, y + 1.72, 0.234), P(-0.15, y + 1.72, 0.234));
  // poste e aparelho; a cúpula só na altura da cabeça
  ctx.collision.addCircle(ph[0], ph[2], 0.3, y, y + 2.2);
  const sc = P(0, 0, 0.36);
  ctx.collision.addCircle(sc[0], sc[2], 0.55, y + 1.45, y + 2.3);
}

export function stopSign(B, ctx, x, z, rot) {
  const y = ctx.surfaceAt(x, z);
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
  const y = ctx.surfaceAt(x, z);
  const P = rotP(x, z, rot);
  B.box('concrete', x, y - 0.3, z, 3.4, 0.45, 1.8, rot, { uvScale: 2 });
  for (const lx of [-1.5, 1.5]) { const p = P(lx, 0, -0.6); B.box('metalGray', p[0], y + 0.15, p[2], 0.1, 2.3, 0.1, rot); }
  const back = P(0, 0, -0.7);
  B.box('glass', back[0], y + 0.4, back[2], 3.0, 1.6, 0.05, rot, { faceUV: true });
  B.col = [0.85, 0.85, 0.85];
  B.box('metalWhite', x, y + 2.45, z, 3.6, 0.1, 2.0, rot, { uvScale: 2, bottom: true });
  B.col = [1, 1, 1];
  const seat = P(0, 0, -0.4);
  B.box('woodBench', seat[0], y + 0.6, seat[2], 2.4, 0.06, 0.35, rot, { bottom: true });
  ctx.collision.addBox(back[0], back[2], 1.6, 0.15, rot, y, y + 2.5);
  // banco e plataforma (a plataforma é um degrau baixo: dá para subir)
  ctx.collision.addBox(seat[0], seat[2], 1.2, 0.2, rot, y, y + 0.66, { cam: false });
  ctx.collision.addBox(x, z, 1.7, 0.9, rot, y - 0.3, y + 0.15, { walk: true, cam: false });
  // embarque: da plataforma até a rua fica livre
  const f = P(0, 0, 1.6);
  reserve(ctx, f[0], f[2], 1.8, 0.8, rot);
  (ctx.seats ||= []).push({ x: seat[0], z: seat[2], rot, y: y + 0.15, seat: 0.51, kind: 'bus' });
}

export { car } from './vehicles.js';

// guarda-corpo de madeira ao longo de uma polilinha
export function railing(B, ctx, pts, o = {}) {
  const P = resample(pts, 2.2);
  const h = o.h || 1.0;
  B.col = [1, 1, 1];
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
  const y = ctx.surfaceAt(x, z);
  const P = rotP(x, z, rot);
  // tinta velha, desbotada e encardida
  const colors = [[0.46, 0.22, 0.19], [0.52, 0.45, 0.26], [0.25, 0.36, 0.28], [0.26, 0.32, 0.4], [0.5, 0.33, 0.22], [0.36, 0.26, 0.33], [0.46, 0.22, 0.19]];
  const cw = 1.5, H = 1.8, gap = 0.25;
  const total = text.length * (cw + gap) - gap;
  B.col = [0.9, 0.9, 0.9];
  B.box('concrete', x, y - 0.3, z, total + 1, 0.55, 1.4, rot, { uvScale: 2 });
  for (let i = 0; i < text.length; i++) {
    const lx = -total / 2 + i * (cw + gap) + cw / 2;
    B.col = colors[i % colors.length];
    glyph(B, P, lx, y + 0.25, 0, cw, H, text[i], rot);
  }
  B.col = [1, 1, 1];
  // base baixa (dá para subir) e as letras (0,45 m de espessura)
  ctx.collision.addBox(x, z, total / 2 + 0.5, 0.7, rot, y - 0.5, y + 0.25, { walk: true, cam: false });
  ctx.collision.addBox(x, z, total / 2, 0.28, rot, y + 0.25, y + 0.25 + H);
}

// letras em blocos (grade 5x5)
const FONT = {
  T: ['11111', '00100', '00100', '00100', '00100'], E: ['11111', '10000', '11110', '10000', '11111'],
  W: ['10001', '10001', '10101', '11011', '10001'], A: ['01110', '10001', '11111', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '11111'], D: ['11110', '10001', '10001', '10001', '11110'],
};
function glyph(B, P, lx, y, lz, w, h, ch, rot) {
  const g = FONT[ch];
  if (!g) return;
  const cw = w / 5, chh = h / 5;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    if (g[r][c] !== '1') continue;
    const p = P(lx - w / 2 + cw * (c + 0.5), 0, lz);
    B.box('letter', p[0], y + (4 - r) * chh, p[2], cw * 1.02, chh * 1.02, 0.45, rot, { uvScale: 1 });
  }
}

// Monumento ao Imigrante: pedras grandes e mãos segurando o globo
export function monumento(B, ctx, x, z, rot) {
  const y = ctx.surfaceAt(x, z);
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
    B.box('bronze', p[0], y + 1.8, p[2], 0.35, 1.3, 0.4, rot + side * 0.25, { uvScale: 1, bottom: true });
    const f = P(side * 0.62, 0, 0);
    B.box('bronze', f[0], y + 2.8, f[2], 0.2, 0.7, 0.35, rot + side * 0.5, { uvScale: 1, bottom: true });
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
