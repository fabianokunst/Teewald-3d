import * as THREE from 'three';
import { MeshBuilder, geometryFromBuilder } from '../engine/builder.js';
import { signMaterial } from '../engine/materials.js';

// Acessórios low poly dos moradores: chapéus, lenço, cabelo comprido, saia e os
// objetos que carregam (cuia, vara de pescar, bengala, sacola...). Tudo em cor de
// vértice sobre a textura lisa, ou com uma textura da pasta como material.
// Coordenadas no espaço do osso onde a peça vai presa (cabeça, quadril) ou, para
// os objetos de mão, com a origem no punho fechado e +z para a frente do morador.

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const k3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgb = c => [c[0] / 255, c[1] / 255, c[2] / 255];

// triângulo virado para `out` (vetor de direção)
function face(B, mat, a, b, c, out, uv = [[0, 0], [1, 0], [1, 1]]) {
  if (dot(cross(sub(b, a), sub(c, a)), out) < 0) B.tri(mat, a, c, b, uv[0], uv[2], uv[1]);
  else B.tri(mat, a, b, c, uv[0], uv[1], uv[2]);
}
function quadOut(B, mat, a, b, c, d, out) { face(B, mat, a, b, c, out); face(B, mat, a, c, d, out); }

// sólido de revolução em volta do eixo y: perfil [[y, r], ...]; sx/sz achatam a seção.
// skip(ângulo) pula gomos (abertura do lenço); twoSided também desenha o lado de dentro
function lathe(B, mat, prof, n, o = {}) {
  const { x = 0, z = 0, sx = 1, sz = 1, cap = false, twoSided = false, skip = null, inner = 0.6 } = o;
  const P = (a, y, r) => [x + Math.sin(a) * r * sx, y, z + Math.cos(a) * r * sz];
  const col = B.col;
  for (let i = 0; i < prof.length - 1; i++) {
    const [y0, r0] = prof[i], [y1, r1] = prof[i + 1];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU, am = (a0 + a1) / 2;
      if (skip && skip(am, (y0 + y1) / 2)) continue;
      const q = [P(a0, y0, r0), P(a1, y0, r0), P(a1, y1, r1), P(a0, y1, r1)];
      // normal do perfil no plano (r, y), sempre para fora do eixo
      const dy = y1 - y0, dr = r1 - r0, nr = dy >= 0 ? dy : -dy, ny = dy >= 0 ? -dr : dr;
      const out = [Math.sin(am) * nr * sx, ny, Math.cos(am) * nr * sz];
      B.col = col; quadOut(B, mat, q[0], q[1], q[2], q[3], out);
      if (twoSided) { B.col = k3(col, inner); quadOut(B, mat, q[0], q[1], q[2], q[3], k3(out, -1)); }
    }
  }
  B.col = col;
  const [yt, rt] = prof[prof.length - 1];
  if (cap && rt > 0) for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    face(B, mat, [x, yt, z], P(a0, yt, rt), P(a1, yt, rt), [0, 1, 0]);
  }
}

// aba (anel plano) visível dos dois lados
function brim(B, mat, y, r0, r1, n, o = {}) {
  const { z = 0, droop = 0, under = 0.7 } = o;
  const P = (a, r, dy = 0) => [Math.sin(a) * r, y + dy, z + Math.cos(a) * r];
  const col = B.col;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    // a aba cai um pouco na frente e atrás (chapéu de feltro)
    const d0 = -droop * Math.abs(Math.cos(a0)), d1 = -droop * Math.abs(Math.cos(a1));
    const q = [P(a0, r0), P(a1, r0), P(a1, r1, d1), P(a0, r1, d0)];
    B.col = col; quadOut(B, mat, ...q, [0, 1, 0]);
    B.col = k3(col, under); quadOut(B, mat, ...q, [0, -1, 0]);
  }
  B.col = col;
}

// caixa centrada em (x, y, z)
function cube(B, mat, x, y, z, sx, sy, sz) {
  const h = [sx / 2, sy / 2, sz / 2];
  const V = (i, j, k) => [x + i * h[0], y + j * h[1], z + k * h[2]];
  quadOut(B, mat, V(-1, 1, -1), V(1, 1, -1), V(1, 1, 1), V(-1, 1, 1), [0, 1, 0]);
  quadOut(B, mat, V(-1, -1, -1), V(1, -1, -1), V(1, -1, 1), V(-1, -1, 1), [0, -1, 0]);
  quadOut(B, mat, V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1), [0, 0, 1]);
  quadOut(B, mat, V(-1, -1, -1), V(1, -1, -1), V(1, 1, -1), V(-1, 1, -1), [0, 0, -1]);
  quadOut(B, mat, V(1, -1, -1), V(1, 1, -1), V(1, 1, 1), V(1, -1, 1), [1, 0, 0]);
  quadOut(B, mat, V(-1, -1, -1), V(-1, 1, -1), V(-1, 1, 1), V(-1, -1, 1), [-1, 0, 0]);
}

// bastão fino de a até b (seção quadrada)
function stick(B, mat, a, b, r) {
  const d = sub(b, a), l = Math.hypot(...d), u = [d[0] / l, d[1] / l, d[2] / l];
  const e1n = cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), e1l = Math.hypot(...e1n);
  const e1 = k3(e1n, r / e1l), e2 = k3(cross(u, e1n), r / e1l);
  const at = (p, s1, s2) => [p[0] + e1[0] * s1 + e2[0] * s2, p[1] + e1[1] * s1 + e2[1] * s2, p[2] + e1[2] * s1 + e2[2] * s2];
  const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [s1, s2] = C[i], [t1, t2] = C[(i + 1) % 4];
    const mid = [e1[0] * (s1 + t1) + e2[0] * (s2 + t2), e1[1] * (s1 + t1) + e2[1] * (s2 + t2), e1[2] * (s1 + t1) + e2[2] * (s2 + t2)];
    quadOut(B, mat, at(a, s1, s2), at(a, t1, t2), at(b, t1, t2), at(b, s1, s2), mid);
  }
}

function toGroup(B, M) {
  const g = new THREE.Group();
  for (const mat of new Set([...B.groups.values()].map(x => x.mat))) {
    const mesh = new THREE.Mesh(geometryFromBuilder(B, mat), M[mat]);
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}

// ---------- cabeça (coordenadas do osso da cabeça: topo do cabelo ~0,29 m) ----------
export function makeHat(kind, color, M) {
  const B = new MeshBuilder(0), c = rgb(color);
  B.col = c;
  if (kind === 'chapeu' || kind === 'palha') {
    const mat = kind === 'palha' ? 'woodBench' : 'flat';
    lathe(B, mat, [[0.19, 0.114], [0.25, 0.108], [0.3, 0.098], [0.318, 0.07]], 10, { z: -0.008, cap: true });
    B.col = k3(c, 0.55);
    lathe(B, mat, [[0.19, 0.116], [0.215, 0.114]], 10, { z: -0.008 });
    B.col = c;
    brim(B, mat, 0.19, 0.112, 0.2, 12, { z: -0.008, droop: 0.012 });
  } else if (kind === 'gaucho') {
    lathe(B, 'flat', [[0.2, 0.112], [0.272, 0.106], [0.282, 0.09]], 10, { z: -0.008, cap: true });
    brim(B, 'flat', 0.2, 0.11, 0.23, 12, { z: -0.008 });
    B.col = [0.55, 0.12, 0.1];
    lathe(B, 'flat', [[0.2, 0.114], [0.215, 0.112]], 10, { z: -0.008 });
  } else if (kind === 'tirol') {
    lathe(B, 'flat', [[0.19, 0.11], [0.26, 0.094], [0.296, 0.06], [0.304, 0.0]], 10, { z: -0.008, sx: 0.92 });
    brim(B, 'flat', 0.19, 0.108, 0.17, 10, { z: -0.008, droop: -0.01 });
    B.col = [0.85, 0.82, 0.74];
    face(B, 'flat', [0.085, 0.21, -0.03], [0.1, 0.36, -0.07], [0.09, 0.22, -0.07], [1, 0, 0]);
    face(B, 'flat', [0.085, 0.21, -0.03], [0.1, 0.36, -0.07], [0.09, 0.22, -0.07], [-1, 0, 0]);
  } else if (kind === 'bone') {
    lathe(B, 'flat', [[0.165, 0.116], [0.225, 0.11], [0.27, 0.088], [0.298, 0.05], [0.306, 0]], 10, { z: -0.006 });
    // pala inclinada para a frente, dos dois lados
    const p = [[-0.08, 0.175, 0.085], [0.08, 0.175, 0.085], [0.07, 0.158, 0.19], [-0.07, 0.158, 0.19]];
    quadOut(B, 'flat', ...p, [0, 1, 0]);
    B.col = k3(c, 0.6); quadOut(B, 'flat', ...p, [0, -1, 0]);
  } else if (kind === 'boina') {
    lathe(B, 'flat', [[0.205, 0.108], [0.235, 0.128], [0.27, 0.118], [0.29, 0.06], [0.294, 0]], 10, { z: -0.012 });
    B.col = k3(c, 0.7);
    lathe(B, 'flat', [[0.294, 0.008], [0.312, 0.004]], 4, { z: -0.012 });
  } else if (kind === 'lenco') {
    // lenço amarrado: cobre alto e nuca, aberto no rosto, ponta caída atrás
    const skip = (a, y) => y < 0.235 && Math.cos(a) > 0.42;
    lathe(B, 'awnCream', [[0.05, 0.106], [0.12, 0.12], [0.2, 0.122], [0.255, 0.1], [0.288, 0.055], [0.298, 0]], 10, { z: -0.012, skip, twoSided: true });
    const t = [[-0.07, 0.1, -0.112], [0.07, 0.1, -0.112], [0, -0.04, -0.13]];
    face(B, 'awnCream', ...t, [0, 0, -1]); B.col = k3(c, 0.6); face(B, 'awnCream', ...t, [0, 0, 1]);
  }
  return toGroup(B, M);
}

// cabelo além da textura: coque, rabo de cavalo ou cabelo solto até os ombros
export function makeHair(kind, color, M) {
  const B = new MeshBuilder(0), c = rgb(color);
  B.col = c;
  if (kind === 'coque') {
    lathe(B, 'flat', [[0.17, 0.0], [0.19, 0.04], [0.23, 0.052], [0.27, 0.036], [0.285, 0]], 7, { z: -0.105 });
  } else if (kind === 'rabo') {
    lathe(B, 'flat', [[-0.04, 0], [0.0, 0.026], [0.12, 0.036], [0.2, 0.03]], 6, { z: -0.128 });
  } else if (kind === 'longo') {
    const skip = a => Math.cos(a) > -0.05;
    lathe(B, 'flat', [[-0.11, 0.128], [0.0, 0.124], [0.1, 0.118], [0.17, 0.112]], 12, { z: -0.012, skip, twoSided: true, inner: 0.55 });
  }
  return toGroup(B, M);
}

// saia presa ao osso do quadril (origem na junta, cintura um pouco acima)
export function makeSkirt(color, length, M, apron = null) {
  const B = new MeshBuilder(0), c = rgb(color);
  B.col = c;
  const prof = [[0.075, 0.168], [-0.03, 0.19], [-0.22, 0.236], [length, 0.272]];
  lathe(B, 'awnCream', prof, 12, { sz: 0.74, twoSided: true, inner: 0.45 });
  if (apron) {
    // avental: faixa na frente, por cima da saia
    B.col = rgb(apron);
    const zAt = y => { for (let i = 0; i < prof.length - 1; i++) { const [y0, r0] = prof[i], [y1, r1] = prof[i + 1]; if (y <= y0 && y >= y1) return (r0 + (r1 - r0) * (y0 - y) / (y0 - y1)) * 0.74 + 0.008; } return 0.2; };
    const ys = [0.07, -0.03, -0.22, length + 0.07];
    for (let i = 0; i < ys.length - 1; i++) {
      const y0 = ys[i], y1 = ys[i + 1], w0 = 0.12 + (0.07 - y0) * 0.1, w1 = 0.12 + (0.07 - y1) * 0.1;
      quadOut(B, 'flat', [-w0, y0, zAt(y0)], [w0, y0, zAt(y0)], [w1, y1, zAt(y1)], [-w1, y1, zAt(y1)], [0, 0, 1]);
    }
  }
  return toGroup(B, M);
}

// ---------- objetos de mão (origem no punho, +y para cima, +z para a frente) ----------
export function makeItem(kind, M, color = [200, 200, 200]) {
  const B = new MeshBuilder(0), c = rgb(color);
  B.col = c;
  if (kind === 'cuia') {
    B.col = [0.55, 0.36, 0.2];
    lathe(B, 'woodDark', [[-0.05, 0.0], [-0.04, 0.026], [-0.005, 0.044], [0.025, 0.036], [0.035, 0.03]], 7, { cap: false });
    B.col = [0.38, 0.5, 0.2];
    lathe(B, 'flat', [[0.03, 0.03], [0.034, 0]], 7);
    B.col = [0.85, 0.85, 0.82];
    stick(B, 'flat', [0.0, 0.0, 0.0], [0.012, 0.11, -0.01], 0.004);
  } else if (kind === 'caneca') {
    B.col = [0.86, 0.8, 0.6];
    lathe(B, 'flat', [[-0.07, 0.0], [-0.07, 0.042], [0.06, 0.044], [0.07, 0.04]], 8);
    B.col = [0.98, 0.96, 0.9];
    lathe(B, 'flat', [[0.06, 0.04], [0.075, 0.0]], 8);
    B.col = [0.82, 0.76, 0.58];
    cube(B, 'flat', 0.055, -0.005, 0, 0.018, 0.08, 0.012);
  } else if (kind === 'bengala') {
    B.col = [0.36, 0.24, 0.16];
    stick(B, 'woodDark', [0, 0.02, 0.012], [0, -0.82, 0.012], 0.011);
    stick(B, 'woodDark', [0, 0.02, 0.012], [0, 0.03, 0.09], 0.011);
  } else if (kind === 'rastelo') {
    // de pé, dentes no chão
    B.col = [0.6, 0.46, 0.3];
    stick(B, 'woodDark', [0, -0.95, 0.04], [0, 0.42, 0.02], 0.013);
    B.col = [0.45, 0.45, 0.48];
    cube(B, 'flat', 0, -0.95, 0.05, 0.42, 0.03, 0.03);
    for (let i = -3; i <= 3; i++) stick(B, 'flat', [i * 0.06, -0.95, 0.05], [i * 0.06, -1.01, 0.1], 0.004);
  } else if (kind === 'sacola') {
    cube(B, 'awnCream', 0, -0.22, 0, 0.13, 0.28, 0.26);
    B.col = k3(c, 0.7);
    stick(B, 'flat', [0, -0.08, -0.08], [0, 0.0, 0], 0.006);
    stick(B, 'flat', [0, -0.08, 0.08], [0, 0.0, 0], 0.006);
  } else if (kind === 'cesta') {
    B.col = [0.66, 0.5, 0.3];
    lathe(B, 'woodBench', [[-0.32, 0.1], [-0.2, 0.14]], 8, { sz: 0.7, twoSided: true });
    lathe(B, 'woodBench', [[-0.32, 0.0], [-0.32, 0.1]], 8, { sz: 0.7, cap: false });
    B.col = [0.72, 0.56, 0.36];
    for (const [x, z] of [[-0.05, 0], [0.05, 0.03], [0, -0.04], [0.03, -0.03]]) lathe(B, 'flat', [[-0.22, 0], [-0.2, 0.035], [-0.17, 0.03], [-0.16, 0]], 5, { x, z });
    B.col = [0.5, 0.36, 0.2];
    stick(B, 'woodDark', [0, -0.2, -0.13], [0, 0.0, 0], 0.007);
    stick(B, 'woodDark', [0, -0.2, 0.13], [0, 0.0, 0], 0.007);
  } else if (kind === 'livro') {
    cube(B, 'flat', 0, -0.07, 0.03, 0.035, 0.22, 0.16);
    B.col = [0.92, 0.9, 0.84];
    cube(B, 'flat', 0, -0.07, 0.03, 0.039, 0.2, 0.15);
  } else if (kind === 'regador') {
    lathe(B, 'metalWhite', [[-0.3, 0.075], [-0.12, 0.07], [-0.1, 0.0]], 8, { z: 0.02, cap: false });
    stick(B, 'flat', [0, -0.26, 0.09], [0, -0.1, 0.28], 0.012);
    stick(B, 'flat', [0, -0.12, -0.04], [0, 0.0, 0.0], 0.008);
    stick(B, 'flat', [0, -0.12, 0.08], [0, 0.0, 0.0], 0.008);
  } else if (kind === 'camera') {
    B.col = [0.12, 0.12, 0.13];
    cube(B, 'flat', 0, 0, 0, 0.12, 0.075, 0.05);
    B.col = [0.3, 0.3, 0.32];
    lathe(B, 'flat', [[0, 0.022], [0.04, 0.02]], 6);
    B.col = [0.9, 0.9, 0.9];
    cube(B, 'flat', 0.035, 0.044, 0, 0.02, 0.012, 0.02);
  } else if (kind === 'bola') {
    // icosaedro com gomos pretos e brancos
    const g = new THREE.IcosahedronGeometry(0.11, 1).toNonIndexed();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const a = [p.getX(i), p.getY(i), p.getZ(i)], b = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], d = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
      const m = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
      B.col = (i / 3) % 4 === 0 ? [0.12, 0.12, 0.12] : [0.95, 0.95, 0.92];
      face(B, 'flat', a, b, d, m);
    }
  }
  // mala de viagem no chão (origem embaixo)
  if (kind === 'mala') {
    cube(B, 'flat', 0, 0.2, 0, 0.56, 0.38, 0.17);
    B.col = k3(c, 0.6);
    cube(B, 'flat', 0, 0.2, 0, 0.58, 0.04, 0.18);
    cube(B, 'flat', 0, 0.41, 0, 0.14, 0.03, 0.03);
  }
  // vara de pescar: ao longo de +z (o morador inclina para cima)
  if (kind === 'vara') {
    B.col = [0.42, 0.3, 0.18];
    stick(B, 'woodDark', [0, 0, -0.35], [0, 0, 0.5], 0.014);
    B.col = [0.62, 0.52, 0.34];
    stick(B, 'woodBench', [0, 0, 0.5], [0, 0, 2.5], 0.007);
    B.col = [0.3, 0.3, 0.32];
    cube(B, 'flat', 0, -0.035, 0.05, 0.05, 0.05, 0.05);
  }
  return toGroup(B, M);
}

// linha de pesca: fio vertical de altura 1 (escalado a cada quadro) e boia
export function makeLine(M) {
  const B = new MeshBuilder(0), B2 = new MeshBuilder(0);
  B.col = [0.85, 0.85, 0.8];
  stick(B, 'flat', [0, 0, 0], [0, -1, 0], 0.003);
  B2.col = [0.9, 0.2, 0.15];
  cube(B2, 'flat', 0, 0, 0, 0.025, 0.04, 0.025);
  const group = new THREE.Group(), line = toGroup(B, M), bob = toGroup(B2, M);
  group.add(line, bob);
  return { group, line, bob };
}

// garrafa térmica do chimarrão (fica no banco, ao lado de quem toma mate)
export function makeThermos(M) {
  const B = new MeshBuilder(0);
  B.col = [0.72, 0.1, 0.08];
  lathe(B, 'flat', [[0, 0.045], [0.24, 0.045], [0.27, 0.03], [0.3, 0.03]], 8, { cap: true });
  B.col = [0.2, 0.2, 0.2];
  lathe(B, 'flat', [[0.3, 0.032], [0.33, 0.028]], 8, { cap: true });
  return toGroup(B, M);
}

// banca de rua (pinhão, cuca e pão caseiro); frente para +z, origem no chão.
// closed: banca sendo desmontada, só com os sacos de pinhão em cima
export function makeStall(M, text, closed = false) {
  const B = new MeshBuilder(0);
  B.col = [1, 1, 1];
  B.box('woodBench', 0, 0.82, 0, 1.7, 0.05, 0.72, 0, { uvScale: 1 });
  for (const x of [-0.78, 0.78]) for (const z of [-0.3, 0.3]) B.box('woodDark', x, 0, z, 0.06, 0.82, 0.06, 0, { uvScale: 1 });
  // toalha xadrez caindo na frente
  B.box('awnRed', 0, 0.6, 0.35, 1.72, 0.27, 0.02, 0, { faceUV: true });
  // placa
  const sign = closed
    ? signMaterial(text, { bg: '#3a3430', fg: '#b8ac98', w: 128, h: 32, borderColor: '#5a5048' })
    : signMaterial(text, { bg: '#f2e6c8', fg: '#7a2a1c', w: 128, h: 32, sub: 'FEITO EM CASA' });
  // placa no alto, acima da cabeça de quem vende
  B.box('woodDark', -0.86, 0.85, 0.33, 0.04, 1.42, 0.04, 0, { uvScale: 1 });
  B.box('woodDark', 0.86, 0.85, 0.33, 0.04, 1.42, 0.04, 0, { uvScale: 1 });
  B.quad(sign, [-0.84, 1.95, 0.34], [0.84, 1.95, 0.34], [0.84, 2.27, 0.34], [-0.84, 2.27, 0.34]);
  B.quad(sign, [0.84, 1.95, 0.33], [-0.84, 1.95, 0.33], [-0.84, 2.27, 0.33], [0.84, 2.27, 0.33]);
  // sacos de pinhão, cucas e pães
  B.col = [0.82, 0.74, 0.56];
  lathe(B, 'awnCream', [[0.87, 0.12], [1.0, 0.13], [1.06, 0.1]], 7, { x: -0.5, z: 0.0 });
  lathe(B, 'awnCream', [[0.87, 0.11], [0.98, 0.12], [1.03, 0.09]], 7, { x: -0.2, z: -0.1 });
  B.col = [0.52, 0.3, 0.18];
  for (const [x, z] of [[-0.5, 0], [-0.2, -0.1]]) lathe(B, 'flat', [[1.0, 0.09], [1.06, 0.07], [1.08, 0]], 7, { x, z });
  if (closed) return toGroup(B, M);
  for (const [x, z] of [[0.25, 0.08], [0.6, -0.05]]) {
    B.col = [0.8, 0.58, 0.3];
    lathe(B, 'flat', [[0.845, 0.16], [0.9, 0.16], [0.92, 0.12], [0.925, 0]], 9, { x, z });
    B.col = [0.96, 0.9, 0.7];
    for (let i = 0; i < 5; i++) { const a = i * 1.3; cube(B, 'flat', x + Math.sin(a) * 0.08, 0.925, z + Math.cos(a) * 0.08, 0.04, 0.012, 0.04); }
  }
  B.col = [0.74, 0.5, 0.28];
  lathe(B, 'flat', [[0.845, 0.06], [0.88, 0.07], [0.92, 0.05], [0.93, 0]], 7, { x: 0.25, z: -0.22, sz: 1.8 });
  return toGroup(B, M);
}
