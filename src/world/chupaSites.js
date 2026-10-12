import { ps1Material } from '../engine/ps1material.js';
import { M } from '../engine/materials.js';
import { rng, pointInPoly, chaikin, resample } from './geo.js';
import { trackTexture, mudTexture, bloodTexture, posterTexture, noteTexture } from '../game/missionArt.js';

// Cenário da missão do chupacabras (roda antes da vegetação, para a trilha e a
// clareira ficarem sem árvores):
// - galinheiro atacado no terreno aberto entre a escola e a mata, perto da Igreja Matriz;
// - trilha de pegadas em pares (o bicho anda aos pulos) mata adentro;
// - clareira ao norte do cemitério, com a ovelha morta onde ele está comendo;
// - mural de avisos na Praça 10 de Abril com o cartaz de PROCURA-SE.

const COOP_AT = [3, -9];        // conferido no mapa: fora da mata, longe das ruas e prédios
const CLEARING_AT = [52, -2];   // miolo da mata entre a escola e o cemitério
const CLEARING_R = 11;

const frame = (x, z, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
};

function circle(x, z, r, n = 14) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  return out;
}

// faixa (polígono) em volta de uma linha
function strip(pts, hw) {
  const L = [], Rt = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    L.push([pts[i][0] + nx * hw, pts[i][1] + nz * hw]);
    Rt.push([pts[i][0] - nx * hw, pts[i][1] - nz * hw]);
  }
  return [...L, ...Rt.reverse()];
}

// nada da colisão nem árvore pedida perto do ponto
function clearSpot(ctx, x, z, r) {
  for (const it of ctx.collision.near(x, z, r + 2)) {
    if (it.t === 'circle') { if (Math.hypot(x - it.x, z - it.z) < it.r + r) return false; continue; }
    const dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
    if (Math.abs(lx) < it.hx + r && Math.abs(lz) < it.hz + r) return false;
  }
  if (ctx.trees.some(t => Math.hypot(t.x - x, t.z - z) < r + 1.2)) return false;
  if (ctx.roads.index.clearance(x, z).d < r + 0.5) return false;
  return !ctx.zones.insideBuilding(x, z, r);
}

// ---------- peças ----------
// quadrilátero deitado no chão (segue o terreno nos 4 cantos); ang = direção da frente (+v da textura)
function groundQuad(B, mat, gy, x, z, len, wid, ang, lift = 0.03) {
  const f = [Math.sin(ang), Math.cos(ang)], r = [Math.cos(ang), -Math.sin(ang)];
  const P = (u, v) => {
    const px = x + r[0] * u * wid / 2 + f[0] * v * len / 2, pz = z + r[1] * u * wid / 2 + f[1] * v * len / 2;
    return [px, gy(px, pz) + lift, pz];
  };
  // a-d-c-b: normal para cima
  B.quad(mat, P(-1, -1), P(-1, 1), P(1, 1), P(1, -1), [[0, 0], [0, 1], [1, 1], [1, 0]]);
}

// galinha morta deitada de lado, pés para cima
function deadChicken(B, gy, x, z, ang, R) {
  const brown = R.chance(0.45);
  const body = brown ? [0.62, 0.36, 0.18] : [0.96, 0.94, 0.88];
  const at = frame(x, z, ang), y = gy(x, z);
  const P = (lx, lz) => at(lx, lz);
  let p = P(0, 0); B.box('carPaint', p[0], y, p[1], 0.17, 0.13, 0.3, ang, { col: body, uvScale: 1 });
  p = P(0.02, -0.17); B.box('carPaint', p[0], y + 0.04, p[1], 0.12, 0.1, 0.08, ang + 0.3, { col: body.map(v => v * 0.85), uvScale: 1 });   // rabo
  p = P(0.05, 0.2); B.box('carPaint', p[0], y, p[1], 0.07, 0.07, 0.08, ang + 0.6, { col: body, uvScale: 1 });                             // cabeça
  p = P(0.05, 0.21); B.box('carPaint', p[0], y + 0.07, p[1], 0.02, 0.03, 0.06, ang + 0.6, { col: [0.82, 0.1, 0.08], uvScale: 1 });        // crista
  p = P(0.06, 0.255); B.box('carPaint', p[0], y + 0.025, p[1], 0.025, 0.02, 0.03, ang + 0.6, { col: [0.95, 0.72, 0.2], uvScale: 1 });    // bico
  for (const lx of [-0.04, 0.04]) {                                                                                                         // pernas para cima
    p = P(lx, -0.04); B.box('carPaint', p[0], y + 0.12, p[1], 0.018, 0.12, 0.018, ang, { col: [0.92, 0.7, 0.22], uvScale: 1 });
  }
}

// penas espalhadas
function feathers(B, gy, x, z, n, rad, R, brown = false) {
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * rad, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    B.col = brown && R.chance(0.6) ? [0.6, 0.38, 0.2] : [0.97, 0.96, 0.92];
    groundQuad(B, 'carPaint', gy, px, pz, 0.07, 0.03, R() * 6.28, 0.02 + R() * 0.01);
  }
  B.col = [1, 1, 1];
}

function blood(B, gy, x, z, s, R) { groundQuad(B, 'chupa:blood', gy, x, z, s, s, R() * 6.28, 0.025); }

// galinheiro de tábuas com cercado de tela (frente = +z local, cercado atrás, rasgado no fundo)
function buildCoop(B, ctx, at, rot, gy) {
  const col = ctx.collision;
  const base = Math.min(...[[-1.7, 2.5], [1.7, 2.5], [-1.7, -3.3], [1.7, -3.3], [0, 0]].map(([lx, lz]) => gy(...at(lx, lz))));
  const y0 = base - 0.15;
  // casinha: paredes de tábua, telhado de zinco inclinado para trás
  let p = at(0, 1.3);
  B.box('woodGray', p[0], y0, p[1], 3.2, 1.75, 2.2, rot, { uvScale: 1.4, top: false });
  const roof = (lx, lz, h) => { const q = at(lx, lz); return [q[0], base + h, q[1]]; };
  B.quad('metalRust', roof(-1.85, 2.65, 1.98), roof(1.85, 2.65, 1.98), roof(1.85, -0.1, 1.62), roof(-1.85, -0.1, 1.62), [[0, 0], [3, 0], [3, 2], [0, 2]]);
  // oitões
  for (const s of [-1, 1]) {
    const a = roof(1.6 * s, 2.4, 1.6), b = roof(1.6 * s, 0.2, 1.6), c = roof(1.6 * s, 0.2, 1.65), d = roof(1.6 * s, 2.4, 1.94);
    if (s > 0) B.quad('woodGray', a, b, c, d, [[0, 0], [1.5, 0], [1.5, 0.2], [0, 0.3]]);
    else B.quad('woodGray', b, a, d, c, [[0, 0], [1.5, 0], [1.5, 0.3], [0, 0.2]]);
  }
  // porta da frente escancarada (vão escuro + folha aberta)
  p = at(0.55, 2.41); B.box('woodDark', p[0], base, p[1], 0.7, 1.35, 0.02, rot, { col: [0.12, 0.1, 0.09], uvScale: 1 });
  p = at(1.18, 2.72); B.box('woodPlank', p[0], base + 0.02, p[1], 0.05, 1.3, 0.68, rot + 0.35, { uvScale: 1 });
  // portinhola das galinhas e rampa para o cercado
  p = at(-0.6, 0.19); B.box('woodDark', p[0], base + 0.1, p[1], 0.36, 0.4, 0.02, rot, { col: [0.1, 0.08, 0.07], uvScale: 1 });
  for (let i = 0; i < 4; i++) { p = at(-0.6, -0.05 - i * 0.16); B.box('woodPlank', p[0], base + 0.08 - i * 0.03, p[1], 0.4, 0.04, 0.16, rot, { uvScale: 1 }); }
  // comedouro
  p = at(1.0, -0.3); B.box('woodPlank', p[0], base, p[1], 0.9, 0.14, 0.22, rot, { uvScale: 1 });
  col.addBox(...at(0, 1.3), 1.62, 1.12, rot, y0, base + 2.0);

  // cercado: palanques e tela; o fundo (lz = -3.2) rasgado no meio
  const H = 1.2;
  const posts = [[-1.6, 0.2], [1.6, 0.2], [-1.6, -1.5], [1.6, -1.5], [-1.6, -3.2], [1.6, -3.2], [-0.55, -3.2], [0.55, -3.2]];
  for (const [lx, lz] of posts) { p = at(lx, lz); B.box('woodDark', p[0], gy(p[0], p[1]) - 0.1, p[1], 0.08, H + 0.18, 0.08, rot, { uvScale: 1 }); }
  const mesh = (l0, l1) => {
    const a = at(...l0), b = at(...l1);
    const ya = gy(a[0], a[1]), yb = gy(b[0], b[1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    B.quad('fenceGrid', [a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + H, b[1]], [a[0], ya + H, a[1]], [[0, 0], [len / 1.2, 0], [len / 1.2, 1], [0, 1]]);
    // ripa no alto
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    B.box('woodDark', m[0], (ya + yb) / 2 + H - 0.02, m[1], 0.04, 0.05, len, Math.atan2(b[0] - a[0], b[1] - a[1]), { uvScale: 1 });
  };
  mesh([-1.6, 0.2], [-1.6, -3.2]);
  mesh([1.6, 0.2], [1.6, -3.2]);
  mesh([-1.6, -3.2], [-0.55, -3.2]);
  mesh([0.55, -3.2], [1.6, -3.2]);
  // tela arrancada caída para fora
  {
    const a = at(-0.5, -3.25), b = at(0.5, -3.25), c = at(0.6, -4.2), d = at(-0.45, -4.3);
    const Y = q => gy(q[0], q[1]);
    B.quad('fenceGrid', [a[0], Y(a) + 0.35, a[1]], [b[0], Y(b) + 0.3, b[1]], [c[0], Y(c) + 0.05, c[1]], [d[0], Y(d) + 0.04, d[1]], [[0, 0], [0.9, 0], [0.9, 0.8], [0, 0.8]]);
  }
  for (const [l0, l1] of [[[-1.6, 0.2], [-1.6, -3.2]], [[1.6, 0.2], [1.6, -3.2]], [[-1.6, -3.2], [-0.55, -3.2]], [[0.55, -3.2], [1.6, -3.2]]]) {
    const a = at(...l0), b = at(...l1), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    col.addBox(m[0], m[1], 0.05, len / 2, Math.atan2(b[0] - a[0], b[1] - a[1]), base - 0.3, base + H, { cam: false });
  }
  return base;
}

// mural de avisos com telhadinho (frente = +z local)
function buildBoard(B, ctx, x, z, rot) {
  const at = frame(x, z, rot), y = ctx.terrain.heightAt(x, z) - 0.05;
  for (const lx of [-0.8, 0.8]) { const p = at(lx, 0); B.box('woodDark', p[0], y, p[1], 0.1, 2.15, 0.1, rot, { uvScale: 1 }); }
  let p = at(0, 0.02);
  B.box('woodPlank', p[0], y + 0.95, p[1], 1.7, 1.05, 0.06, rot, { uvScale: 1 });
  B.box('woodDark', p[0], y + 0.9, p[1], 1.8, 0.06, 0.1, rot, { uvScale: 1 });
  const R = (lx, lz, h) => { const q = at(lx, lz); return [q[0], y + h, q[1]]; };
  B.quad('roofOld', R(-1.0, 0.38, 2.12), R(1.0, 0.38, 2.12), R(1.0, 0, 2.32), R(-1.0, 0, 2.32), [[0, 0], [2, 0], [2, 0.4], [0, 0.4]]);
  B.quad('roofOld', R(1.0, -0.38, 2.12), R(-1.0, -0.38, 2.12), R(-1.0, 0, 2.32), R(1.0, 0, 2.32), [[0, 0], [2, 0], [2, 0.4], [0, 0.4]]);
  // papéis pregados na frente
  const sheet = (mat, lx, ly, w, h, tilt = 0) => {
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const Q = (u, v) => { const q = at(lx + u * c - v * s, 0.06); return [q[0], y + ly + u * s + v * c, q[1]]; };
    B.quad(mat, Q(-w / 2, -h / 2), Q(w / 2, -h / 2), Q(w / 2, h / 2), Q(-w / 2, h / 2));
  };
  sheet('chupa:poster', -0.18, 1.48, 0.5, 0.75, 0.03);
  sheet('chupa:note1', 0.5, 1.68, 0.3, 0.37, -0.08);
  sheet('chupa:note2', 0.46, 1.2, 0.3, 0.37, 0.06);
  ctx.collision.addBox(x, z, 0.88, 0.12, rot, y, y + 2.2);
  return y;
}

// mural: na praça, ao lado (não em cima) do fim do calçadão, de frente para o caminho
function boardSpot(ctx) {
  const { praca, calcadao } = ctx.landmarks, poly = praca.poly, c = praca.c, path = calcadao.path;
  const e0 = path[0], e1 = path[path.length - 1];
  const end = Math.hypot(e0[0] - c[0], e0[1] - c[1]) < Math.hypot(e1[0] - c[0], e1[1] - c[1]) ? e0 : e1;
  const nearPath = (x, z) => {
    let bd = Infinity, bp = null;
    for (const p of path) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; bp = p; } }
    return [bd, bp];
  };
  let best = null;
  for (let dz = -12; dz <= 12; dz += 0.5) for (let dx = -12; dx <= 12; dx += 0.5) {
    const x = end[0] + dx, z = end[1] + dz, de = Math.hypot(dx, dz);
    if (de < 3 || de > 12 || !pointInPoly(x, z, poly)) continue;
    const [dp, p] = nearPath(x, z);
    if (dp < 2.6 || dp > 5) continue;
    if (!clearSpot(ctx, x, z, 1.4)) continue;
    const score = Math.abs(de - 6) + Math.abs(dp - 3.2);
    if (!best || score < best.score) best = { x, z, score, rot: Math.atan2(p[0] - x, p[1] - z) };
  }
  return best;
}

export function buildChupaSites(B, ctx) {
  M['chupa:mud'] = ps1Material({ map: mudTexture(), cutout: true, polygonOffset: -1 });
  M['chupa:track'] = ps1Material({ map: trackTexture(), cutout: true, polygonOffset: -3 });
  M['chupa:blood'] = ps1Material({ map: bloodTexture(), cutout: true, polygonOffset: -3 });
  M['chupa:poster'] = ps1Material({ map: posterTexture(), cutout: true, affine: false });
  M['chupa:note1'] = ps1Material({ map: noteTexture('MISSA', '#2a3a7a', 11), cutout: true, affine: false });
  M['chupa:note2'] = ps1Material({ map: noteTexture('CUCA', '#7a3a10', 23, [226, 214, 160]), cutout: true, affine: false });

  const T = ctx.terrain, R = rng(1997);   // 1997: o ano em que o chupacabras "chegou" ao Brasil
  const gy = (x, z) => T.heightAt(x, z);
  const out = {};

  // ---------- galinheiro ----------
  const cl = { x: CLEARING_AT[0], z: CLEARING_AT[1] };
  let [cx, cz] = COOP_AT;
  // de frente para longe da mata (cercado virado para a clareira)
  const rot = Math.atan2(cx - cl.x, cz - cl.z);
  const at = frame(cx, cz, rot);
  const base = buildCoop(B, ctx, at, rot, gy);
  ctx.zones.block(strip([at(0, 3.2), at(0, -4.5)], 2.6), 1.5);
  const run = at(0, -1.6);
  out.coop = { x: cx, z: cz, rot, y: base, look: [run[0], base + 0.3, run[1]] };
  // galinhas mortas no cercado e penas por todo lado
  const inRun = [[-0.9, -0.8], [0.7, -1.1], [-0.3, -2.3], [1.0, -2.6], [-1.1, -2.0]];
  inRun.forEach(([lx, lz], i) => { const q = at(lx, lz); deadChicken(B, gy, q[0], q[1], rot + i * 1.9 + 0.4, R); });
  feathers(B, gy, run[0], run[1], 46, 1.8, R, true);
  for (const [lx, lz, s] of [[-0.6, -1.0, 0.5], [0.8, -2.2, 0.4], [0.1, -3.0, 0.35]]) { const q = at(lx, lz); blood(B, gy, q[0], q[1], s, R); }

  // ---------- trilha até a clareira ----------
  const t0 = at(0, -3.9);
  const ux = cl.x - t0[0], uz = cl.z - t0[1], ul = Math.hypot(ux, uz), dx = ux / ul, dz = uz / ul;
  const ctrl = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N, side = i === 0 || i === N ? 0 : Math.sin(i * 1.9) * 3.2;
    const k = t * (ul - 2.2);
    ctrl.push([t0[0] + dx * k - dz * side, t0[1] + dz * k + dx * side]);
  }
  const path = resample(chaikin(ctrl, 3), 1.35);
  ctx.zones.block(strip(path, 1.3), 1.0);
  // pegadas em pares, lado a lado, a cada pulo, sobre o barro remexido
  path.forEach((p, i) => {
    if (i === 0) return;
    const a = path[i - 1], b = path[Math.min(path.length - 1, i + 1)];
    const ang = Math.atan2(b[0] - a[0], b[1] - a[1]), nx = Math.cos(ang), nz = -Math.sin(ang);
    groundQuad(B, 'chupa:mud', gy, p[0], p[1], 1.0 + R() * 0.25, 0.8 + R() * 0.2, ang + (R() - 0.5) * 0.4, 0.022);
    for (const s of [-1, 1]) {
      const j = (R() - 0.5) * 0.08;
      groundQuad(B, 'chupa:track', gy, p[0] + nx * 0.17 * s + j, p[1] + nz * 0.17 * s + j, 0.36, 0.32, ang + s * 0.18 + (R() - 0.5) * 0.15, 0.034);
    }
    if (i % 5 === 2) blood(B, gy, p[0] + (R() - 0.5) * 0.8, p[1] + (R() - 0.5) * 0.8, 0.14 + R() * 0.1, R);
    if (i % 9 === 4) feathers(B, gy, p[0], p[1], 4, 0.6, R, true);
  });
  // galinha arrastada no meio do caminho
  {
    const p = path[Math.floor(path.length * 0.42)];
    deadChicken(B, gy, p[0] + 0.6, p[1] - 0.4, R() * 6, R);
    feathers(B, gy, p[0] + 0.5, p[1] - 0.3, 18, 1.0, R, true);
    blood(B, gy, p[0] + 0.5, p[1] - 0.4, 0.4, R);
  }
  out.trail = path.map(([x, z]) => [x, z]);

  // ---------- clareira ----------
  const ring = circle(cl.x, cl.z, CLEARING_R, 16);
  ctx.zones.clearForest(ring);
  ctx.zones.block(ring, 0);
  // a ovelha (modelo arredondado) é posta pela missão (game/chupacabra.js: makeSheep)
  out.sheep = { x: cl.x, z: cl.z, rot: Math.atan2(dx, dz) + 1.2 };
  for (let i = 0; i < 6; i++) blood(B, gy, cl.x + (R() - 0.5) * 1.6, cl.z + (R() - 0.5) * 1.6, 0.5 + R() * 0.4, R);
  for (let i = 0; i < 10; i++) {
    const a = R() * 6.28, d = 1 + R() * 3.5;
    B.col = [0.86, 0.82, 0.72];
    groundQuad(B, 'carPaint', gy, cl.x + Math.cos(a) * d, cl.z + Math.sin(a) * d, 0.16, 0.12, R() * 6.28, 0.025);
  }
  B.col = [1, 1, 1];
  out.clearing = { x: cl.x, z: cl.z, y: gy(cl.x, cl.z), r: CLEARING_R };
  // o bicho come de costas para quem chega pela trilha
  out.feed = { x: cl.x - dx * 0.95, z: cl.z - dz * 0.95, heading: Math.atan2(dx, dz) };
  // ponto de retorno (morrendo na luta): na trilha, antes da clareira
  {
    let k = path.length - 1;
    while (k > 0 && Math.hypot(path[k][0] - cl.x, path[k][1] - cl.z) < 18) k--;
    const p = path[k];
    out.checkpoint = { x: p[0], z: p[1], heading: Math.atan2(cl.x - p[0], cl.z - p[1]) };
  }

  // ---------- mural na praça ----------
  const bs = boardSpot(ctx);
  if (bs) {
    const y = buildBoard(B, ctx, bs.x, bs.z, bs.rot);
    const f = frame(bs.x, bs.z, bs.rot)(-0.18, 0.1);
    out.board = { x: bs.x, z: bs.z, rot: bs.rot, y, look: [f[0], y + 1.5, f[1]] };
  } else console.warn('Teewald: mural da praça sem lugar livre');

  ctx.chupa = out;
  return out;
}
