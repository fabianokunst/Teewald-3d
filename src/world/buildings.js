import { rng, obbCorners, clamp } from './geo.js';
import { signMaterial } from '../engine/materials.js';

// Gerador de construções: casas de alvenaria, de madeira, enxaimel (fotos de
// fachada da pasta de texturas), comércio, galpões e fábricas de calçados.

export const FLOOR = 2.9;

// fotos de fachada: proporção (largura/altura do recorte) e fração do frontão
const FACADES = {
  facWidenka: { aspect: 256 / 320, gable: 0.44 },
  facKleiser: { aspect: 240 / 279, gable: 0.5 },
  facWegmann: { aspect: 120 / 292, gable: 0.27 },
  facMeritt: { aspect: 252 / 212, gable: 0.55 },
  facGross: { aspect: 96 / 204, gable: 0 },
  facKulikov: { aspect: 124 / 280, gable: 0 },
  facWoodBlue: { aspect: 236 / 76, gable: 0 },
};

const PLASTER = ['plWhite', 'plCream', 'plYellow', 'plPink', 'plGreen', 'plBlue', 'plBeige', 'plOchre', 'plWhite', 'plCream'];
const ROOFS = ['roofRed', 'roofOrange', 'roofBrown', 'roofClay', 'roofTerra', 'roofOld', 'roofRed', 'roofClay'];
const WOODS = ['woodSiding', 'woodPlank', 'woodGray', 'woodBlue', 'woodSiding'];
const SHUTTERS = [[0.35, 0.55, 0.4], [0.3, 0.42, 0.6], [0.55, 0.3, 0.22], [0.9, 0.9, 0.85], [0.45, 0.32, 0.22]];
const SHOPS = ['PADARIA WEBER', 'FARMÁCIA', 'MERCADO SCHMITT', 'CALÇADOS', 'ARMAZÉM', 'BAZAR', 'LANCHERIA', 'SALÃO DE BELEZA',
  'FERRAGEM KLEIN', 'CONFECÇÕES', 'ÓTICA', 'AÇOUGUE', 'AGROPECUÁRIA', 'BAR DO ALEMÃO', 'FLORICULTURA', 'PAPELARIA',
  'SAPATARIA', 'CAFÉ COLONIAL', 'ELETRO', 'MÓVEIS', 'MALHAS', 'BRECHÓ', 'PIZZARIA', 'VIDEOLOCADORA'];
const SIGN_COLORS = [['#7a2a1c', '#f2e6c8'], ['#1f3f6b', '#f0f0e0'], ['#2f5a2a', '#f6eecf'], ['#e8dcc0', '#5a2a18'], ['#b8860b', '#1a1a1a'], ['#5a1f4a', '#f6e6f0']];

export function frame(s) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  return {
    W: (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c],
    P: (lx, y, lz) => [s.x + lx * c + lz * sn, y, s.z - lx * sn + lz * c],
  };
}

// assenta a construção no terreno; devolve piso e base
export function groundFor(ctx, s) {
  const cs = obbCorners({ x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, rot: s.rot });
  const hs = cs.map(([x, z]) => ctx.terrain.heightAt(x, z));
  hs.push(ctx.terrain.heightAt(s.x, s.z));
  return { yMin: Math.min(...hs), yMax: Math.max(...hs) };
}

export function buildHouse(B, ctx, s) {
  const { P } = frame(s);
  const { yMin, yMax } = groundFor(ctx, s);
  const y0 = s.y0 ?? yMax + (s.plinth ?? 0.25);
  const hw = s.w / 2, hd = s.d / 2;
  const fac = s.facade ? FACADES[s.facade] : null;
  let wallH = s.floors * FLOOR + 0.2;
  let rise = null;
  if (fac) {
    const Ht = s.w / fac.aspect;
    if (fac.gable > 0) { wallH = Ht * (1 - fac.gable); rise = Ht * fac.gable; }
    else if (s.facadeTile) { wallH = s.floors * FLOOR + 0.2; }
    else wallH = Ht;
  }
  const top = y0 + wallH;
  B.col = s.tint || [1, 1, 1];

  // alicerce (aparece em terreno inclinado)
  B.box(s.found || 'stoneBase', s.x, yMin - 0.6, s.z, s.w + 0.12, y0 - yMin + 0.6, s.d + 0.12, s.rot, { top: false, uvScale: 2 });

  // paredes: frente (+z local), direita, fundos, esquerda
  const corners = { FL: [-hw, hd], FR: [hw, hd], BR: [hw, -hd], BL: [-hw, -hd] };
  const faces = [['FL', 'FR', 'front'], ['FR', 'BR', 'right'], ['BR', 'BL', 'back'], ['BL', 'FL', 'left']];
  for (const [a, b, name] of faces) {
    const pa = P(corners[a][0], 0, corners[a][1]), pb = P(corners[b][0], 0, corners[b][1]);
    if (name === 'front' && fac) {
      const v1 = fac.gable > 0 ? 1 - fac.gable : 1;
      const ur = s.facadeTile ? Math.max(1, Math.round(s.w / (wallH * fac.aspect))) : 1;
      B.wall(s.facade, pa[0], pa[2], pb[0], pb[2], y0, top, { uv: [[0, 0], [ur, 0], [ur, v1], [0, v1]], ao: 0.92, seg: 0 });
      continue;
    }
    const mat = (name === 'front' && s.frontWall) || s.wall;
    B.wall(mat, pa[0], pa[2], pb[0], pb[2], y0, top, { uvScale: s.wallUV || 3, ao: 0.8 });
  }
  B.col = [1, 1, 1];

  // telhado
  const roofTop = buildRoof(B, s, P, top, rise, fac);

  // aberturas
  if (s.style !== 'factory' && s.style !== 'pavilion') addOpenings(B, s, P, y0, fac);
  if (s.sign) addSign(B, s, P, y0, top);
  if (s.chimney) {
    const cx = hw * 0.45, cz = -hd * 0.3;
    const p = P(cx, 0, cz);
    B.box('brickOld', p[0], top - 0.5, p[2], 0.6, (roofTop - top) + 1.2, 0.6, s.rot, { uvScale: 1.5 });
  }

  // colisão
  ctx.collision.addBox(s.x, s.z, hw + 0.06, hd + 0.06, s.rot, yMin - 1, roofTop);
  if (s.fence) addFence(B, ctx, s, P);
  return { y0, top, roofTop };
}

function slopeUV(a, b, c, d, scale = 2.2) {
  // u ao longo do beiral, v subindo a água do telhado
  const lenAB = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lenAD = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
  const off = (Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]) - lenAB) / 2;
  return [[0, 0], [lenAB / scale, 0], [(lenAB + off) / scale, lenAD / scale], [-off / scale, lenAD / scale]];
}

function buildRoof(B, s, P, top, riseFixed, fac) {
  const hw = s.w / 2, hd = s.d / 2, ov = s.ov ?? 0.45;
  const tan = Math.tan((s.pitch ?? 30) * Math.PI / 180);
  const R = s.roof;
  const wallMat = s.gableWall || s.wall;
  const type = s.roofType || 'gable';
  if (type === 'flat') {
    // laje com platibanda
    B.quad('concrete', P(-hw, top, hd), P(hw, top, hd), P(hw, top, -hd), P(-hw, top, -hd), [[0, 0], [s.w / 3, 0], [s.w / 3, s.d / 3], [0, s.d / 3]]);
    const ph = s.parapet ?? 0.9;
    const c = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      const pa = P(a[0], 0, a[1]), pb = P(b[0], 0, b[1]);
      B.wall(s.frontWall && i === 0 ? s.frontWall : s.wall, pa[0], pa[2], pb[0], pb[2], top, top + ph, { uvScale: 3, ao: 1 });
      B.wall(s.wall, pb[0], pb[2], pa[0], pa[2], top, top + ph, { uvScale: 3, ao: 0.7 });
    }
    // cimalha
    B.col = [0.85, 0.85, 0.85];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      const ia = [a[0] * 0.97, a[1] * 0.97], ib = [b[0] * 0.97, b[1] * 0.97];
      B.quad('concreteW', P(a[0], top + ph, a[1]), P(b[0], top + ph, b[1]), P(ib[0], top + ph, ib[1]), P(ia[0], top + ph, ia[1]));
    }
    B.col = [1, 1, 1];
    return top + ph;
  }
  if (type === 'shed') {
    const rise = s.d * tan;
    const eF = top + rise, eB = top;
    B.quad(R, P(-hw - ov, eB - ov * tan, -hd - ov), P(hw + ov, eB - ov * tan, -hd - ov), P(hw + ov, eF + ov * tan, hd + ov), P(-hw - ov, eF + ov * tan, hd + ov));
    // corrige normal: a água sobe para a frente => quad invertido
    B.tri(wallMat, P(hw, top, hd), P(hw, top, -hd), P(hw, top + rise, hd), [0, 0], [s.d / 3, 0], [0, rise / 3]);
    B.tri(wallMat, P(-hw, top, -hd), P(-hw, top, hd), P(-hw, top + rise, hd), [0, 0], [s.d / 3, 0], [s.d / 3, rise / 3]);
    B.wall(wallMat, ...xz(P(-hw, 0, hd)), ...xz(P(hw, 0, hd)), top, top + rise, { uvScale: 3, ao: 1 });
    return top + rise + ov * tan;
  }
  if (type === 'gable') {
    // cumeeira ao longo de x (beirais na frente e nos fundos)
    const rise = riseFixed ?? hd * tan;
    const e = top - ov * (rise / hd), r = top + rise;
    const X = hw + ov, Z = hd + ov;
    let a = P(-X, e, Z), b = P(X, e, Z), c = P(X, r, 0), d = P(-X, r, 0);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    a = P(X, e, -Z); b = P(-X, e, -Z); c = P(-X, r, 0); d = P(X, r, 0);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    const us = 3;
    B.tri(wallMat, P(-hw, top, -hd), P(-hw, top, hd), P(-hw, r, 0), [0, top / us], [s.d / us, top / us], [s.d / 2 / us, r / us]);
    B.tri(wallMat, P(hw, top, hd), P(hw, top, -hd), P(hw, r, 0), [0, top / us], [s.d / us, top / us], [s.d / 2 / us, r / us]);
    return r;
  }
  if (type === 'gableFront') {
    // cumeeira ao longo de z (frontão virado para a rua)
    const rise = riseFixed ?? hw * tan;
    const e = top - ov * (rise / hw), r = top + rise;
    const X = hw + ov, Z = hd + ov;
    let a = P(-X, e, -Z), b = P(-X, e, Z), c = P(0, r, Z), d = P(0, r, -Z);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    a = P(X, e, Z); b = P(X, e, -Z); c = P(0, r, -Z); d = P(0, r, Z);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    const us = 3;
    if (fac && fac.gable > 0) {
      const v0 = 1 - fac.gable;
      B.tri(s.facade, P(-hw, top, hd), P(hw, top, hd), P(0, r, hd), [0, v0], [1, v0], [0.5, 1]);
    } else {
      B.tri(wallMat, P(-hw, top, hd), P(hw, top, hd), P(0, r, hd), [0, top / us], [s.w / us, top / us], [s.w / 2 / us, r / us]);
    }
    B.tri(wallMat, P(hw, top, -hd), P(-hw, top, -hd), P(0, r, -hd), [0, top / us], [s.w / us, top / us], [s.w / 2 / us, r / us]);
    return r;
  }
  // quatro águas
  const along = s.w >= s.d;
  const A = (along ? hw : hd) + ov, C = (along ? hd : hw) + ov;
  const M = along ? (u, y, v) => P(u, y, v) : (u, y, v) => P(v, y, -u);
  const e = top - ov * tan, r = e + C * tan;
  const rx = Math.max(A - C, 0);
  let a = M(-A, e, C), b = M(A, e, C), c = M(rx, r, 0), d = M(-rx, r, 0);
  B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
  a = M(A, e, -C); b = M(-A, e, -C); c = M(-rx, r, 0); d = M(rx, r, 0);
  B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
  const ts = 2.2;
  B.tri(R, M(-A, e, -C), M(-A, e, C), M(-rx, r, 0), [0, 0], [2 * C / ts, 0], [C / ts, C * 1.1 / ts]);
  B.tri(R, M(A, e, C), M(A, e, -C), M(rx, r, 0), [0, 0], [2 * C / ts, 0], [C / ts, C * 1.1 / ts]);
  return r;
}

const xz = p => [p[0], p[2]];

// janelas, portas, venezianas, vitrines
function addOpenings(B, s, P, y0, fac) {
  const hw = s.w / 2, hd = s.d / 2, out = 0.04;
  const win = s.win || 'window1';
  const faces = [
    { name: 'front', a: [-hw, hd + out], b: [hw, hd + out], len: s.w },
    { name: 'right', a: [hw + out, hd], b: [hw + out, -hd], len: s.d },
    { name: 'back', a: [hw, -hd - out], b: [-hw, -hd - out], len: s.w },
    { name: 'left', a: [-hw - out, -hd], b: [-hw - out, hd], len: s.d },
  ];
  const floors = s.floors;
  for (const f of faces) {
    if (f.name === 'front' && fac) continue;
    if (s.style === 'enxaimel' && f.name !== 'front') continue; // textura já tem janelas
    const at = (t, y) => {
      const lx = f.a[0] + (f.b[0] - f.a[0]) * t, lz = f.a[1] + (f.b[1] - f.a[1]) * t;
      return P(lx, y, lz);
    };
    const quadOn = (mat, t0, t1, ya, yb, uv) => B.quad(mat, at(t0, ya), at(t1, ya), at(t1, yb), at(t0, yb), uv);
    const spacing = f.name === 'front' ? 2.6 : 3.2;
    const n = Math.max(f.name === 'front' ? 1 : 0, Math.floor((f.len - 1.2) / spacing));
    for (let fl = 0; fl < floors; fl++) {
      const yb = y0 + fl * FLOOR;
      const ground = fl === 0;
      // vitrine no térreo do comércio
      if (ground && f.name === 'front' && s.style === 'commercial') {
        const m = 0.6 / f.len;
        quadOn(s.roll ? 'rollDoor' : 'shop', m, 1 - m, yb + 0.05, yb + 2.45, [[0, 0], [Math.max(1, Math.round(f.len / 4)), 0], [Math.max(1, Math.round(f.len / 4)), 1], [0, 1]]);
        continue;
      }
      let doorDone = !(ground && f.name === 'front');
      const doorAt = s.doorAt ?? (n >= 2 ? 0.5 : 0.3);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        if (!doorDone && Math.abs(t - doorAt) < 0.5 / n + 0.01) {
          const dw = 1.0 / f.len / 2;
          quadOn('door', t - dw, t + dw, yb, yb + 2.15);
          doorDone = true;
          continue;
        }
        const ww = 1.1 / f.len / 2;
        quadOn(win, t - ww, t + ww, yb + 0.95, yb + 2.25);
        if (s.shutters) {
          const sw = 0.5 / f.len;
          B.col = s.shutters;
          quadOn('woodPlank', t - ww - sw, t - ww, yb + 0.95, yb + 2.25, [[0, 0], [0.3, 0], [0.3, 1], [0, 1]]);
          quadOn('woodPlank', t + ww, t + ww + sw, yb + 0.95, yb + 2.25, [[0, 0], [0.3, 0], [0.3, 1], [0, 1]]);
          B.col = [1, 1, 1];
        }
      }
      if (!doorDone) {
        const dw = 1.0 / f.len / 2;
        quadOn('door', doorAt - dw, doorAt + dw, yb, yb + 2.15);
      }
    }
  }
  // degrau na porta
  if (!fac && s.style !== 'commercial') {
    const dz = hd + 0.35, dx = -hw + s.w * (s.doorAt ?? (Math.floor((s.w - 1.2) / 2.6) >= 2 ? 0.5 : 0.3));
    const p = P(dx, 0, dz);
    B.box('concrete', p[0], y0 - 0.6, p[2], 1.4, 0.6, 0.7, s.rot, { uvScale: 1 });
  }
}

function addSign(B, s, P, y0, top) {
  const hd = s.d / 2 + 0.06;
  const sw = Math.min(s.w * 0.8, 7), sh = s.signH || 0.8;
  const y = s.signY ?? (s.style === 'commercial' ? y0 + 2.55 : top - sh - 0.3);
  B.quad(s.sign, P(-sw / 2, y, hd), P(sw / 2, y, hd), P(sw / 2, y + sh, hd), P(-sw / 2, y + sh, hd));
  if (s.awning) {
    // toldo listrado
    const aw = s.w * 0.92 / 2, ay = y0 + 2.5;
    const a = P(-aw, ay - 0.5, hd + 1.3), b = P(aw, ay - 0.5, hd + 1.3), c = P(aw, ay, hd), d = P(-aw, ay, hd);
    B.quad(s.awning, a, b, c, d, [[0, 0], [aw * 2 / 1.5, 0], [aw * 2 / 1.5, 1], [0, 1]]);
  }
}

function addFence(B, ctx, s, P) {
  const f = s.fence, hw = s.w / 2 + 1.2, z = s.d / 2 + f.dist;
  const gateX = -s.w / 2 + s.w * (s.doorAt ?? 0.5);
  const segs = [[-hw, gateX - 0.7], [gateX + 0.7, hw]];
  for (const [a, b] of segs) {
    if (b - a < 0.3) continue;
    const pa = P(a, 0, z), pb = P(b, 0, z);
    const cx = (pa[0] + pb[0]) / 2, cz = (pa[2] + pb[2]) / 2;
    const y = Math.min(ctx.terrain.heightAt(pa[0], pa[2]), ctx.terrain.heightAt(pb[0], pb[2]), ctx.terrain.heightAt(cx, cz)) - 0.3;
    const len = b - a;
    B.col = f.col || [1, 1, 1];
    B.box(f.mat, cx, y, cz, len, f.h + 0.3, 0.16, s.rot, { uvScale: 2 });
    B.col = [1, 1, 1];
    ctx.collision.addBox(cx, cz, len / 2, 0.12, s.rot, y, y + f.h + 0.3, { cam: false });
  }
}

// ---------- posicionamento ao longo das ruas ----------

function pointAlong(pts, dist) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= dist) {
      const t = (dist - acc) / L;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
    }
    acc += L;
  }
  return null;
}

export function lotValid(ctx, obb, o = {}) {
  const { roads, rivers, zones, terrain } = ctx;
  const cs = obbCorners(obb);
  const pts = [...cs, [obb.x, obb.z]];
  for (let i = 0; i < 4; i++) pts.push([(cs[i][0] + cs[(i + 1) % 4][0]) / 2, (cs[i][1] + cs[(i + 1) % 4][1]) / 2]);
  let hmin = Infinity, hmax = -Infinity;
  for (const [x, z] of pts) {
    if (!terrain.inBounds(x, z)) return false;
    const rc = roads.index.clearance(x, z);
    const need = rc.seg && rc.seg.data.sidewalk ? 2.6 : 1.0;
    if (rc.d < need) return false;
    const rv = rivers.index.nearest(x, z);
    if (rv.seg && rv.d < rv.seg.data.width / 2 + 3.5) return false;
    if (zones.isBlocked(x, z)) return false;
    const h = terrain.heightAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  if (hmax - hmin > (o.slope ?? 4)) return false;
  if (zones.overlapsBuilding(obb, o.margin ?? 1.2)) return false;
  return true;
}

export function facingRoad(ctx, x, z) {
  const q = ctx.roads.index.nearest(x, z, d => d.rank >= 2);
  if (!q.seg) return { rot: 0, road: null };
  const s = q.seg, px = s.ax + (s.bx - s.ax) * q.t, pz = s.az + (s.bz - s.az) * q.t;
  let nx = x - px, nz = z - pz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  return { rot: Math.atan2(-nx, -nz), road: s.data, px, pz, nx, nz, d: q.d };
}

// cria a especificação de uma casa conforme o estilo
export function makeSpec(R, style, x, z, rot, w, d, o = {}) {
  const s = { x, z, rot, w, d, style, floors: 1, tint: [R.range(0.92, 1.05), R.range(0.92, 1.03), R.range(0.9, 1.0)], ...o };
  if (style === 'masonry') {
    s.floors = o.floors ?? (R.chance(0.35) ? 2 : 1);
    s.wall = R.pick(PLASTER);
    s.roof = R.pick(ROOFS);
    s.roofType = R.chance(0.45) ? 'hip' : R.chance(0.6) ? 'gable' : 'gableFront';
    s.pitch = R.range(24, 32);
    s.win = R.pick(['window1', 'window3', 'window2', 'window1']);
    s.shutters = R.chance(0.3) ? R.pick(SHUTTERS) : null;
    s.found = R.chance(0.5) ? 'stoneBase' : 'concrete';
  } else if (style === 'wood') {
    s.wall = R.pick(WOODS);
    s.roof = R.pick(['roofOld', 'roofRed', 'roofBrown', 'metalRust', 'roofClay']);
    s.roofType = R.chance(0.7) ? 'gable' : 'gableFront';
    s.pitch = R.range(26, 34);
    s.win = R.pick(['window1', 'window3']);
    s.shutters = R.chance(0.5) ? R.pick(SHUTTERS) : null;
    s.plinth = R.range(0.5, 1.0);
    s.found = 'stoneBase';
    s.chimney = R.chance(0.4);
    s.wallUV = 2.5;
    if (R.chance(0.35) && w > 7.5) { s.facade = 'facWoodBlue'; s.facadeTile = true; s.w = Math.max(w, 8.5); }
  } else if (style === 'enxaimel') {
    const key = R.pick(['facWidenka', 'facKleiser', 'facWegmann', 'facMeritt', 'facKleiser', 'facWidenka']);
    s.facade = key;
    s.wall = 'enxaimelWall';
    s.gableWall = 'enxaimelWall';
    s.wallUV = 6;
    s.roof = R.pick(['roofOld', 'roofClay', 'roofDark', 'roofBrown']);
    s.roofType = FACADES[key].gable > 0 ? 'gableFront' : 'gable';
    s.floors = 2;
    s.found = 'stoneWall';
    s.chimney = R.chance(0.5);
    if (key === 'facWegmann') s.w = Math.min(w, 6.5);
    if (key === 'facMeritt') { s.wall = 'woodBlue'; s.gableWall = 'woodBlue'; s.wallUV = 3; }
  } else if (style === 'commercial') {
    s.floors = o.floors ?? R.int(2, 3);
    s.wall = R.pick(PLASTER);
    s.roofType = 'flat';
    s.roof = 'concrete';
    s.win = R.pick(['window2', 'window1', 'window3']);
    const [bg, fg] = R.pick(SIGN_COLORS);
    s.sign = o.sign ?? signMaterial(o.signText || R.pick(SHOPS), { bg, fg, w: 128, h: 24 });
    s.awning = R.chance(0.5) ? R.pick(['awnRed', 'awnBlue', 'awnCream']) : null;
    s.roll = R.chance(0.3);
    s.found = 'concrete';
    s.plinth = 0.12;
  } else if (style === 'shed') {
    s.wall = R.pick(['woodPlank', 'woodGray', 'brick', 'plGray']);
    s.roof = R.pick(['metalRoof', 'metalRust', 'roofOld']);
    s.roofType = 'gable';
    s.pitch = 18;
    s.win = 'window2';
    s.found = 'concrete';
    s.plinth = 0.1;
  } else if (style === 'factory') {
    s.wall = R.pick(['plGray', 'brick', 'plWhite', 'metalWall']);
    s.roof = 'metalRoof';
    s.roofType = 'gable';
    s.pitch = 12;
    s.floors = 3;
    s.found = 'concrete';
    s.plinth = 0.1;
    s.ov = 0.3;
  }
  return s;
}

export function placeTownBuildings(ctx, B) {
  const R = rng(20251011);
  const { roads, zones } = ctx;
  const placed = [];
  const core = [-110, -10];
  for (const road of roads.list) {
    if (road.rank < 3) continue;
    const pts = road.pts;
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const side of [1, -1]) {
      let s = R.range(1, 8);
      while (s < L - 4) {
        const at = pointAlong(pts, s + 6);
        if (!at) break;
        const dc = Math.hypot(at.p[0] - core[0], at.p[1] - core[1]);
        const dens = clamp(1.08 - dc / 520, 0.12, 0.95) * (road.rank >= 6 && dc > 320 ? 0.45 : 1);
        const central = dc < 230;
        const lotW = central ? R.range(9, 13) : R.range(11, 19);
        if (!R.chance(dens)) { s += lotW * R.range(0.6, 1.4); continue; }
        // estilo
        let style;
        const main = road.rank >= 5 || road.name === 'Rua 12 de Maio' || road.name === 'Rua Professor Laurindo Vier';
        const r = R();
        if (main && dc < 280) style = r < 0.55 ? 'commercial' : r < 0.85 ? 'masonry' : 'enxaimel';
        else if (dc < 220) style = r < 0.15 ? 'commercial' : r < 0.68 ? 'masonry' : r < 0.84 ? 'enxaimel' : 'wood';
        else style = r < 0.55 ? 'masonry' : r < 0.82 ? 'wood' : r < 0.9 ? 'enxaimel' : 'shed';
        const w = lotW - R.range(1.2, 3.5);
        const d = style === 'commercial' ? R.range(10, 14) : style === 'shed' ? R.range(6, 9) : R.range(7.5, 11.5);
        const nx = -at.t[1] * side, nz = at.t[0] * side; // normal para o lado escolhido
        const sidewalk = road.sidewalk ? 2 : 0;
        const setback = road.hw + sidewalk + (style === 'commercial' ? 0.4 : R.range(2.5, 6.5));
        const x = at.p[0] + nx * (setback + d / 2), z = at.p[1] + nz * (setback + d / 2);
        const rot = Math.atan2(-nx, -nz);
        let spec = makeSpec(R, style, x, z, rot, w, d);
        const obb = { x, z, hx: spec.w / 2, hz: spec.d / 2, rot };
        if (lotValid(ctx, obb, { slope: style === 'wood' ? 5 : 3.8 })) {
          // muro ou cerca na frente
          if (style !== 'commercial' && R.chance(0.45)) {
            const dist = setback - road.hw - sidewalk - 0.4;
            if (dist > 1.2) spec.fence = { dist, h: R.range(0.7, 1.2), mat: R.pick(['plWhite', 'brick', 'plCream', 'woodPlank', 'stoneBase']), col: [1, 1, 1] };
          }
          zones.addBuilding(obb);
          placed.push(spec);
          s += lotW + R.range(0, 2.5);
        } else s += 3;
      }
    }
  }
  for (const spec of placed) buildHouse(B, ctx, spec);
  return placed;
}

export { FACADES };
