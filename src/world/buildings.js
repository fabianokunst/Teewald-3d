import { rng, obbCorners, clamp } from './geo.js';
import { signMaterial } from '../engine/materials.js';
import { roadSurfaceAt } from './roads.js';

// Gerador de construções: casas de alvenaria, de madeira, enxaimel, comércio,
// galpões e fábricas de calçados.

export const FLOOR = 2.9;

// janelas por face (a frente sempre tem ao menos a porta)
function openingCount(face, len) {
  return face === 'front' ? Math.max(1, Math.floor((len - 1.2) / 2.6)) : Math.floor((len - 1.2) / 3.2);
}
// enxaimel: uma repetição da textura por vão de janela e por andar
function bayUV(face, len, v0, v1) {
  const n = openingCount(face, len) || Math.max(1, Math.round(len / 2.8));
  return [[0, v0], [n, v0], [n, v1], [0, v1]];
}

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
  const top = y0 + s.floors * FLOOR + 0.2;
  B.col = s.tint || [1, 1, 1];

  // alicerce (aparece em terreno inclinado); nas casas rebocadas, o mesmo reboco do barrado
  const plastered = (s.style === 'masonry' || s.style === 'commercial') && s.found !== 'stoneBase';
  if (plastered) B.col = (s.tint || [1, 1, 1]).map(v => v * 0.62);
  B.box(plastered ? s.wall : s.found || 'stoneBase', s.x, yMin - 0.6, s.z, s.w + 0.04, y0 - yMin + 0.6, s.d + 0.04, s.rot, { uvScale: plastered ? s.wallUV || 3 : 2 });
  B.col = s.tint || [1, 1, 1];

  // paredes: frente (+z local), direita, fundos, esquerda
  const corners = { FL: [-hw, hd], FR: [hw, hd], BR: [hw, -hd], BL: [-hw, -hd] };
  const faces = [['FL', 'FR', 'front'], ['FR', 'BR', 'right'], ['BR', 'BL', 'back'], ['BL', 'FL', 'left']];
  for (const [a, b, name] of faces) {
    const pa = P(corners[a][0], 0, corners[a][1]), pb = P(corners[b][0], 0, corners[b][1]);
    const mat = (name === 'front' && s.frontWall) || s.wall;
    const len = name === 'front' || name === 'back' ? s.w : s.d;
    B.wall(mat, pa[0], pa[2], pb[0], pb[2], y0, top, s.bays ? { uv: bayUV(name, len, 0, (top - y0) / FLOOR), ao: 0.8 } : { uvScale: s.wallUV || 3, ao: 0.8 });
  }
  // barrado: faixa mais escura na base das paredes rebocadas
  if (s.style === 'masonry' || s.style === 'commercial') {
    const e = 0.02, bc = (s.tint || [1, 1, 1]).map(v => v * 0.62);
    const cs = [[-hw - e, hd + e], [hw + e, hd + e], [hw + e, -hd - e], [-hw - e, -hd - e]];
    for (let i = 0; i < 4; i++) {
      const pa = P(cs[i][0], 0, cs[i][1]), pb = P(cs[(i + 1) % 4][0], 0, cs[(i + 1) % 4][1]);
      B.wall(s.wall, pa[0], pa[2], pb[0], pb[2], y0, y0 + 0.5, { uvScale: s.wallUV || 3, col: bc, ao: 0.9, seg: 0 });
    }
  }
  B.col = [1, 1, 1];

  // telhado
  const roofTop = buildRoof(B, s, P, top, y0);

  // aberturas
  if (s.style === 'factory') addFactoryOpenings(B, s, P, y0, top);
  else if (s.style !== 'pavilion') addOpenings(B, s, P, y0, ctx);
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

function buildRoof(B, s, P, top, y0) {
  const hw = s.w / 2, hd = s.d / 2, ov = s.ov ?? 0.45;
  const tan = Math.tan((s.pitch ?? 30) * Math.PI / 180);
  const R = s.roof;
  const wallMat = s.gableWall || s.wall;
  const type = s.roofType || 'gable';
  // UV do oitão: enxaimel segue os vãos das paredes; o resto, metros / 3
  const gableUV = (face, len, r) => {
    if (s.bays) { const [a, b, , d] = bayUV(face, len, (top - y0) / FLOOR, (r - y0) / FLOOR); return [a, b, [b[0] / 2, d[1]]]; }
    return [[0, top / 3], [len / 3, top / 3], [len / 2 / 3, r / 3]];
  };
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
    const rise = hd * tan;
    const e = top - ov * (rise / hd), r = top + rise;
    const X = hw + ov, Z = hd + ov;
    let a = P(-X, e, Z), b = P(X, e, Z), c = P(X, r, 0), d = P(-X, r, 0);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    a = P(X, e, -Z); b = P(-X, e, -Z); c = P(-X, r, 0); d = P(X, r, 0);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    B.tri(wallMat, P(-hw, top, -hd), P(-hw, top, hd), P(-hw, r, 0), ...gableUV('left', s.d, r));
    B.tri(wallMat, P(hw, top, hd), P(hw, top, -hd), P(hw, r, 0), ...gableUV('right', s.d, r));
    return r;
  }
  if (type === 'gableFront') {
    // cumeeira ao longo de z (frontão virado para a rua)
    const rise = hw * tan;
    const e = top - ov * (rise / hw), r = top + rise;
    const X = hw + ov, Z = hd + ov;
    let a = P(-X, e, -Z), b = P(-X, e, Z), c = P(0, r, Z), d = P(0, r, -Z);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    a = P(X, e, Z); b = P(X, e, -Z); c = P(0, r, -Z); d = P(0, r, Z);
    B.quad(R, a, b, c, d, slopeUV(a, b, c, d));
    B.tri(wallMat, P(-hw, top, hd), P(hw, top, hd), P(0, r, hd), ...gableUV('front', s.w, r));
    B.tri(wallMat, P(hw, top, -hd), P(-hw, top, -hd), P(0, r, -hd), ...gableUV('back', s.w, r));
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
function addOpenings(B, s, P, y0, ctx) {
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
    const at = (t, y) => {
      const lx = f.a[0] + (f.b[0] - f.a[0]) * t, lz = f.a[1] + (f.b[1] - f.a[1]) * t;
      return P(lx, y, lz);
    };
    const quadOn = (mat, t0, t1, ya, yb, uv) => B.quad(mat, at(t0, ya), at(t1, ya), at(t1, yb), at(t0, yb), uv);
    const n = openingCount(f.name, f.len);
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
          quadOn('shutter', t - ww - sw, t - ww, yb + 0.95, yb + 2.25);
          quadOn('shutter', t + ww, t + ww + sw, yb + 0.95, yb + 2.25);
          B.col = [1, 1, 1];
        }
      }
      if (!doorDone) {
        const dw = 1.0 / f.len / 2;
        quadOn('door', doorAt - dw, doorAt + dw, yb, yb + 2.15);
      }
    }
  }
  // degrau na porta: desce até o chão e dá para subir nele
  if (s.style !== 'commercial') {
    const dz = hd + 0.35, dx = -hw + s.w * (s.doorAt ?? (Math.floor((s.w - 1.2) / 2.6) >= 2 ? 0.5 : 0.3));
    const p = P(dx, 0, dz);
    const base = Math.min(...[-0.6, 0.6].map(o => { const q = P(dx + o, 0, dz + 0.3); return ctx.terrain.heightAt(q[0], q[2]); })) - 0.1;
    if (y0 - base > 0.08) {
      B.box('concrete', p[0], base, p[2], 1.4, y0 - base, 0.7, s.rot, { uvScale: 1 });
      ctx.collision.addBox(p[0], p[2], 0.7, 0.35, s.rot, base, y0, { walk: true, cam: false });
    }
  }
}

// fábrica: uma faixa de janelas industriais por andar, portão de enrolar e porta
function addFactoryOpenings(B, s, P, y0, top) {
  const hw = s.w / 2, hd = s.d / 2, out = 0.04;
  const faces = [
    { name: 'front', a: [-hw, hd + out], b: [hw, hd + out], len: s.w },
    { name: 'right', a: [hw + out, hd], b: [hw + out, -hd], len: s.d },
    { name: 'back', a: [hw, -hd - out], b: [-hw, -hd - out], len: s.w },
    { name: 'left', a: [-hw - out, -hd], b: [-hw - out, hd], len: s.d },
  ];
  for (const f of faces) {
    if (f.len < 5) continue;
    const at = (t, y) => P(f.a[0] + (f.b[0] - f.a[0]) * t, y, f.a[1] + (f.b[1] - f.a[1]) * t);
    const quadOn = (mat, t0, t1, ya, yb, uv) => B.quad(mat, at(t0, ya), at(t1, ya), at(t1, yb), at(t0, yb), uv);
    const m = 1.2 / f.len, reps = Math.max(1, Math.round((f.len - 2.4) / 3.2));
    for (let fl = 0; fl < s.floors; fl++) {
      const ya = y0 + fl * FLOOR + 1.1, yb = ya + 1.4;
      if (yb > top - 0.3 || (fl === 0 && f.name === 'front')) continue;
      quadOn('winFactory', m, 1 - m, ya, yb, [[0, 0], [reps, 0], [reps, 1], [0, 1]]);
    }
    if (f.name === 'front') {
      const gw = Math.min(4.5, f.len * 0.4) / f.len / 2, gh = Math.min(3.8, top - y0 - 0.6);
      quadOn('rollDoor', 0.35 - gw, 0.35 + gw, y0, y0 + gh, [[0, 0], [gw * f.len * 2 / 1.6, 0], [gw * f.len * 2 / 1.6, gh / 1.6], [0, gh / 1.6]]);
      const dw = 0.5 / f.len;
      quadOn('door', 0.75 - dw, 0.75 + dw, y0, y0 + 2.15);
    }
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
  // chão onde se pisa: terreno, rua ou calçada
  const ground = (x, zz) => {
    const t = ctx.terrain.heightAt(x, zz), r = roadSurfaceAt(ctx.roads, ctx.terrain, x, zz);
    return r === null ? t : Math.max(t, r);
  };
  const segs = [[-hw, gateX - 0.7], [gateX + 0.7, hw]];
  for (const [a, b] of segs) {
    if (b - a < 0.3) continue;
    // trechos curtos que acompanham o terreno (um muro reto afundaria na subida)
    const n = Math.max(1, Math.ceil((b - a) / 2.5));
    for (let i = 0; i < n; i++) {
      const a0 = a + (b - a) * i / n, a1 = a + (b - a) * (i + 1) / n;
      const pa = P(a0, 0, z), pb = P(a1, 0, z);
      const cx = (pa[0] + pb[0]) / 2, cz = (pa[2] + pb[2]) / 2;
      const onRoad = [[pa[0], pa[2]], [pb[0], pb[2]], [cx, cz]].some(([x, zz]) => {
        const rc = ctx.roads.index.clearance(x, zz);
        return rc.d < (rc.seg && rc.seg.data.sidewalk ? 2.1 : 0.3) || ctx.zones.insideBuilding(x, zz, 0.2);
      });
      if (onRoad) continue;
      const gs = [ground(pa[0], pa[2]), ground(pb[0], pb[2]), ground(cx, cz)];
      const y = Math.min(...gs) - 0.3, yTop = Math.max(...gs) + f.h;
      const len = a1 - a0;
      B.col = f.col || [1, 1, 1];
      B.box(f.mat, cx, y, cz, len, yTop - y, 0.16, s.rot, { uvScale: 2 });
      B.col = [1, 1, 1];
      ctx.collision.addBox(cx, cz, len / 2, 0.12, s.rot, y, yTop, { cam: false });
    }
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
  } else if (style === 'enxaimel') {
    // vigas escuras com reboco branco, creme ou tijolo à vista
    s.wall = R.pick(['enxBranco', 'enxBranco', 'enxTijolo', 'enxCreme']);
    s.bays = true;
    s.roof = R.pick(['roofOld', 'roofClay', 'roofDark', 'roofBrown']);
    s.roofType = R.chance(0.6) ? 'gableFront' : 'gable';
    s.pitch = R.range(38, 46);
    s.floors = o.floors ?? (R.chance(0.6) ? 2 : 1);
    s.win = R.pick(['window1', 'window3']);
    s.found = 'stoneWall';
    s.plinth = R.range(0.3, 0.6);
    s.chimney = R.chance(0.5);
    s.tint = [R.range(0.96, 1.03), R.range(0.95, 1.01), R.range(0.92, 0.98)];
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
        const dens = clamp(1.2 - dc / 560, 0.18, 0.97) * (road.rank >= 6 && dc > 320 ? 0.5 : 1);
        const central = dc < 230;
        const lotW = central ? R.range(8.5, 12.5) : R.range(10, 17);
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

// gira a caixa para a frente (+z local) apontar para a rua mais próxima
export function orientToRoad(ctx, o) {
  const fr = facingRoad(ctx, o.x, o.z);
  if (!fr.road) return o;
  const want = [-fr.nx, -fr.nz];
  let bk = 0, bd = -Infinity;
  for (let k = 0; k < 4; k++) {
    const r = o.rot + k * Math.PI / 2;
    const d = Math.sin(r) * want[0] + Math.cos(r) * want[1];
    if (d > bd) { bd = d; bk = k; }
  }
  const r = o.rot + bk * Math.PI / 2;
  return bk % 2 ? { ...o, rot: r, hx: o.hz, hz: o.hx } : { ...o, rot: r };
}

// encolhe a caixa até ela não invadir ruas/calçadas nem o rio
export function fitBox(ctx, o) {
  let b = { ...o };
  for (let it = 0; it < 6; it++) {
    const cs = obbCorners(b);
    const pts = [...cs];
    for (let i = 0; i < 4; i++) pts.push([(cs[i][0] + cs[(i + 1) % 4][0]) / 2, (cs[i][1] + cs[(i + 1) % 4][1]) / 2]);
    let bad = false;
    for (const [x, z] of pts) {
      const rc = ctx.roads.index.clearance(x, z);
      const need = rc.seg && rc.seg.data.sidewalk ? 2.2 : 0.4;
      const rv = ctx.rivers.index.nearest(x, z);
      if (rc.d < need || (rv.seg && rv.d < rv.seg.data.width / 2 + 1.5)) { bad = true; break; }
    }
    if (!bad) return b;
    // afasta um pouco da rua e encolhe
    const fr = facingRoad(ctx, b.x, b.z);
    if (fr.road) { b.x += fr.nx * 0.4; b.z += fr.nz * 0.4; }
    b.hx = Math.max(1.2, b.hx - 0.35); b.hz = Math.max(1.2, b.hz - 0.35);
  }
  return null;
}

// construções nos contornos reais (Microsoft Building Footprints)
export function placeFootprintBuildings(ctx, B) {
  const R = rng(1853);
  const { zones } = ctx;
  const core = [-110, -10];
  const placed = [];
  for (const f of ctx.footprints) {
    if (f.used) continue;
    if (!ctx.terrain.inBounds(f.x, f.z) || zones.isBlocked(f.x, f.z)) continue;
    let o = fitBox(ctx, orientToRoad(ctx, f));
    if (!o || o.hx < 1.25 || o.hz < 1.25) continue;
    if (zones.overlapsBuilding(o, -0.4)) continue;
    const A = 4 * o.hx * o.hz, w = o.hx * 2, d = o.hz * 2;
    const dc = Math.hypot(o.x - core[0], o.z - core[1]);
    const fr = facingRoad(ctx, o.x, o.z);
    const road = fr.road;
    const main = road && (road.rank >= 5 || road.name === 'Rua 12 de Maio' || road.name === 'Rua Professor Laurindo Vier');
    const front = road ? fr.d - o.hz - road.hw - (road.sidewalk ? 2 : 0) : 99;
    const r = R();
    let style, extra = {};
    if (A > 750) style = 'factory';
    else if (A > 320) style = main && dc < 320 ? 'commercial' : r < 0.45 ? 'factory' : 'masonry';
    else if (A < 30) { style = 'shed'; extra.floors = 1; }
    else if (main && dc < 300 && front < 4) style = r < 0.6 ? 'commercial' : r < 0.85 ? 'masonry' : 'enxaimel';
    else if (dc < 230) style = r < 0.1 ? 'commercial' : r < 0.66 ? 'masonry' : r < 0.84 ? 'enxaimel' : 'wood';
    else style = r < 0.55 ? 'masonry' : r < 0.85 ? 'wood' : r < 0.93 ? 'enxaimel' : 'shed';
    if (style === 'enxaimel' && (w < 5.5 || w > 14 || d < 5.5)) style = 'masonry';
    if (style === 'masonry' && A > 160) extra.floors = R.chance(0.55) ? 2 : 1;
    if (style === 'factory') extra.floors = A > 1500 ? 3 : 2;
    const s = makeSpec(R, style, o.x, o.z, o.rot, w, d, extra);
    s.w = Math.min(s.w, w); s.d = Math.min(s.d, d);
    if (style === 'shed') { s.floors = 1; s.roof = R.pick(['metalRoof', 'metalRust', 'roofOld']); }
    if (style !== 'commercial' && style !== 'factory' && front > 2.2 && R.chance(0.5)) {
      s.fence = { dist: Math.min(front - 0.6, 7), h: R.range(0.7, 1.2), mat: R.pick(['plWhite', 'brick', 'plCream', 'woodPlank', 'stoneBase']), col: [1, 1, 1] };
    }
    zones.addBuilding({ x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, rot: s.rot });
    f.used = true;
    placed.push(s);
  }
  for (const s of placed) buildHouse(B, ctx, s);
  return placed;
}

