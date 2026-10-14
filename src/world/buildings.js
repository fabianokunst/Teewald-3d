import { rng, obbCorners, clamp, SegmentIndex } from './geo.js';
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

// cercamento da frente do lote, conforme o estilo da casa
export function pickFence(R, s, dist) {
  const plaster = ['plWhite', 'plCream', 'plYellow', 'plBeige', 'plGray'];
  let f;
  if (s.style === 'wood' || s.style === 'shed') f = R.chance(0.75) ? { kind: 'madeira' } : { kind: 'pedra' };
  else if (s.style === 'enxaimel') f = R.chance(0.55) ? { kind: 'pedra' } : { kind: 'madeira' };
  else {
    const r = R();
    f = r < 0.4 ? { kind: 'muro', mat: R.chance(0.6) ? s.wall : R.pick(plaster) } : r < 0.75 ? { kind: 'grade', mat: R.chance(0.5) ? 'brick' : R.pick(plaster) } : { kind: 'tijolo' };
  }
  if (f.kind === 'madeira') f.col = R.pick([[1, 1, 1], [1, 1, 1], [0.62, 0.78, 0.62], [0.68, 0.76, 0.9], [0.92, 0.86, 0.72]]);
  f.dist = dist;
  return f;
}

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
  if (s.sign) addSign(B, s, P, y0, top, ctx);
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
  let doorT = null; // onde a porta da frente ficou de fato
  // à noite, dois terços das casas têm gente acordada: alguns cômodos (andar de uma face)
  // com a luz acesa. Sorteio pela posição, para ser sempre igual
  const LR = rng((Math.floor(s.x * 7.3) * 92821) ^ Math.floor(s.z * 9.1));
  const awake = LR.chance(s.style === 'shed' ? 0.15 : 0.65);
  const winLit = ['window1', 'window2', 'window3'].includes(win) ? win + 'Lit' : win;
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
        // algumas vitrines ficam acesas a noite toda
        quadOn(s.roll ? 'rollDoor' : LR.chance(0.35) ? 'shopLit' : 'shop', m, 1 - m, yb + 0.05, yb + 2.45, [[0, 0], [Math.max(1, Math.round(f.len / 4)), 0], [Math.max(1, Math.round(f.len / 4)), 1], [0, 1]]);
        continue;
      }
      const roomLit = awake && LR.chance(0.5);
      let doorDone = !(ground && f.name === 'front');
      const doorAt = s.doorAt ?? (n >= 2 ? 0.5 : 0.3);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        if (!doorDone && Math.abs(t - doorAt) < 0.5 / n + 0.01) {
          const dw = 1.0 / f.len / 2;
          quadOn('door', t - dw, t + dw, yb, yb + 2.15);
          doorDone = true;
          if (f.name === 'front') doorT = t;
          continue;
        }
        const ww = 1.1 / f.len / 2;
        quadOn(roomLit && LR.chance(0.8) ? winLit : win, t - ww, t + ww, yb + 0.95, yb + 2.25);
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
        if (f.name === 'front') doorT = doorAt;
      }
    }
  }
  // degrau embaixo da porta de verdade; se a porta fica alta (terreno em declive),
  // patamar e escada descendo rente à parede, sem avançar sobre a calçada
  if (s.style !== 'commercial' && doorT !== null) {
    const dx = -hw + s.w * doorT;
    s.doorFoot = [dx, hd + 0.75];
    const ground = (lx, lz) => { const q = P(lx, 0, lz); return ctx.terrain.heightAt(q[0], q[2]); };
    const base = Math.min(ground(dx - 0.6, hd + 0.65), ground(dx + 0.6, hd + 0.65)) - 0.1;
    const h = y0 - base;
    if (h > 0.08 && h <= 0.7) {
      const p = P(dx, 0, hd + 0.35);
      B.box('concrete', p[0], base, p[2], 1.4, h, 0.7, s.rot, { uvScale: 1 });
      ctx.collision.addBox(p[0], p[2], 0.7, 0.35, s.rot, base, y0, { walk: true, cam: false });
    } else if (h > 0.7) {
      const p = P(dx, 0, hd + 0.55);
      B.box('concrete', p[0], base, p[2], 1.4, h, 1.1, s.rot, { uvScale: 1 });
      ctx.collision.addBox(p[0], p[2], 0.7, 0.55, s.rot, base, y0, { walk: true, cam: false });
      // degraus de 19 cm para o lado em que a escada chega ao chão antes (ladeira abaixo)
      const RISE = 0.19, TREAD = 0.28;
      const plan = dir => {
        const steps = [];
        for (let i = 0; i < 40; i++) {
          const lx = dx + dir * (0.7 + TREAD * (i + 0.5));
          const g = Math.max(ground(lx, hd + 0.1), ground(lx, hd + 1.0));
          const top = y0 - (i + 1) * RISE;
          if (top < g + 0.02) return { dir, steps, ok: true };
          steps.push({ lx, top, g: Math.min(ground(lx, hd + 0.1), ground(lx, hd + 1.0)) - 0.1 });
        }
        return { dir, steps, ok: false };
      };
      const [best] = [plan(1), plan(-1)].sort((p, q) => (q.ok - p.ok) || (p.steps.length - q.steps.length));
      for (const st of best.steps) {
        const q = P(st.lx, 0, hd + 0.55);
        B.box('concrete', q[0], st.g, q[2], TREAD + 0.01, st.top - st.g, 1.0, s.rot, { uvScale: 1 });
      }
      if (best.steps.length) {
        const run = best.steps.length * TREAD, c = P(dx + best.dir * (0.7 + run / 2), 0, hd + 0.55);
        s.doorFoot = [dx + best.dir * (0.7 + run + 0.3), hd + 0.55];
        ctx.collision.addBox(c[0], c[2], 0.5, run / 2, s.rot + best.dir * Math.PI / 2, base, y0, { walk: true, cam: false, ramp: [y0, best.steps[best.steps.length - 1].top] });
      }
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

function addSign(B, s, P, y0, top, ctx) {
  const hd = s.d / 2 + 0.06;
  const sw = Math.min(s.w * 0.8, 7), sh = s.signH || 0.8;
  const y = s.signY ?? (s.style === 'commercial' ? y0 + 2.55 : top - sh - 0.3);
  B.quad(s.sign, P(-sw / 2, y, hd), P(sw / 2, y, hd), P(sw / 2, y + sh, hd), P(-sw / 2, y + sh, hd));
  if (s.awning) {
    // toldo listrado. A ponta desce até 50 cm, mas fica a pelo menos 2,15 m do chão
    // embaixo dele: onde a rua é mais alta que a loja, ficava na altura da cabeça.
    // Se nem reto ele passa por cima de quem anda na calçada, a loja fica sem toldo
    const aw = s.w * 0.92 / 2, ay = y0 + 2.5;
    let g = -Infinity;
    for (let lx = -aw; lx <= aw + 0.01; lx += Math.max(0.5, aw / 8)) for (const lz of [hd + 0.3, hd + 0.8, hd + 1.3]) { const p = P(lx, 0, lz); g = Math.max(g, ctx.surfaceAt(p[0], p[2])); }
    if (g + 2.15 <= ay) {
      const ye = Math.max(ay - 0.5, g + 2.15);
      const a = P(-aw, ye, hd + 1.3), b = P(aw, ye, hd + 1.3), c = P(aw, ay, hd), d = P(-aw, ay, hd);
      B.quad(s.awning, a, b, c, d, [[0, 0], [aw * 2 / 1.5, 0], [aw * 2 / 1.5, 1], [0, 1]]);
    }
  }
}

// medidas de cada tipo: altura, espessura, material, coroa e pilares
const FENCE = {
  muro: { h: 1.0, t: 0.18, cap: 'concreteW', pillars: true },
  tijolo: { h: 1.0, t: 0.2, mat: 'brick', cap: 'concreteW', pillars: true },
  grade: { h: 0.5, t: 0.18, cap: 'concreteW', pillars: true, grid: 0.9 },
  pedra: { h: 0.75, t: 0.4, mat: 'stoneWall' },
  madeira: { h: 1.0, picket: true },
};

// muro/cerca da frente do lote: frente inteira com portão alinhado à porta e
// laterais voltando até os fundos da casa (param ao encontrar vizinho, rua ou rio).
// Se a frente não cabe inteira, a casa fica sem cercamento (nada de pedaços soltos).
function addFence(B, ctx, s, P) {
  const f = s.fence, T = FENCE[f.kind], hw = s.w / 2, hd = s.d / 2, W = hw + 1.2;
  const fi = ctx.fenceIndex ||= new SegmentIndex(10, 2);
  const L = (lx, lz) => { const p = P(lx, 0, lz); return [p[0], p[2]]; };
  // chão onde se pisa: terreno, rua ou calçada
  const ground = (x, z) => {
    const t = ctx.terrain.heightAt(x, z), r = roadSurfaceAt(ctx.roads, ctx.terrain, x, z);
    return r === null ? t : Math.max(t, r);
  };
  const free = ([x, z]) => {
    const rc = ctx.roads.index.clearance(x, z);
    if (rc.d < (rc.seg && rc.seg.data.sidewalk ? 2.1 : 0.4)) return false;
    const rv = ctx.rivers.index.nearest(x, z);
    if (rv.seg && rv.d < rv.seg.data.width / 2 + 1.5) return false;
    if (ctx.zones.insideBuilding(x, z, 0.25) || ctx.zones.isBlocked(x, z)) return false;
    return fi.nearest(x, z).d > 0.5;
  };
  const pieceFree = (a, b) => [0, 0.5, 1].every(k => free(L(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)));
  // pedaços de até 2,5 m
  const split = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5)), out = [];
    for (let k = 0; k < n; k++) out.push([[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]]);
    return out;
  };
  // frente: recua até caber
  const foot = s.doorFoot || [0, hd + 0.75];
  let zF = null, gx = 0, front = null;
  for (let dist = f.dist; dist >= 1.4; dist -= 0.4) {
    const z = hd + dist;
    gx = clamp(foot[0], -W + 0.9, W - 0.9);
    const left = split([-W, z], [gx - 0.55, z]), right = split([gx + 0.55, z], [W, z]);
    if ([...left, ...right].every(([a, b]) => pieceFree(a, b))) { zF = z; front = [left, right]; break; }
  }
  if (zF === null) return;
  // laterais: da frente até os fundos da casa, parando no primeiro obstáculo
  const sides = [-W, W].map(x => {
    const run = [];
    for (const [a, b] of split([x, zF], [x, -hd])) { if (!pieceFree(a, b)) break; run.push([a, b]); }
    return run;
  });
  const runs = [[...sides[0]].reverse().map(([a, b]) => [b, a]).concat(front[0]), front[1].concat(sides[1])];

  const mat = f.mat || T.mat || 'plWhite';
  const col = f.col || [1, 1, 1];
  for (const run of runs) {
    if (!run.length) continue;
    for (let k = 0; k < run.length; k++) {
      const [a, b] = run[k];
      const A = L(a[0], a[1]), Bw = L(b[0], b[1]);
      const ga = ground(A[0], A[1]), gb = ground(Bw[0], Bw[1]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // normal local do pedaço (para os dois lados do muro)
      const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
      const off = (p, k2) => P(p[0] + nx * k2, 0, p[1] + nz * k2);
      const W3 = (p, k2, y) => { const q = off(p, k2); return [q[0], y, q[2]]; };
      const dirW = (p, dx, dz) => { const q0 = P(p[0], 0, p[1]), q1 = P(p[0] + dx, 0, p[1] + dz); return [q1[0] - q0[0], 0, q1[2] - q0[2]]; };
      const outN = sd => dirW(a, nx * sd, nz * sd);
      const u0 = (k * 2.5) / 2, u1 = u0 + len / 2;
      fi.add(A[0], A[1], Bw[0], Bw[1], s);
      const rot = Math.atan2(Bw[0] - A[0], Bw[1] - A[1]);
      if (T.picket) {
        // cerca de ripas (textura recortada) e mourões
        B.col = col;
        B.quadOut('picket', W3(a, 0, ga - 0.05), W3(b, 0, gb - 0.05), W3(b, 0, gb + T.h), W3(a, 0, ga + T.h), outN(1), [[u0 * 2, 0], [u1 * 2, 0], [u1 * 2, 1], [u0 * 2, 1]]);
        B.col = [0.8, 0.8, 0.8];
        for (const [p, g] of [[a, ga], ...(k === run.length - 1 ? [[b, gb]] : [])]) {
          const q = P(p[0], 0, p[1]);
          B.box('woodDark', q[0], g - 0.2, q[2], 0.1, T.h + 0.25, 0.1, s.rot, { uvScale: 1 });
        }
        B.col = [1, 1, 1];
        ctx.collision.addBox((A[0] + Bw[0]) / 2, (A[1] + Bw[1]) / 2, 0.06, len / 2, rot, Math.min(ga, gb) - 0.3, Math.max(ga, gb) + T.h, { cam: false });
        continue;
      }
      // muro maciço: duas faces, topo e (nas pontas) cabeceiras; o topo acompanha o terreno
      const t = T.t / 2, h = T.h;
      B.col = col;
      for (const sd of [1, -1]) {
        B.quadOut(mat, W3(a, sd * t, ga - 0.4), W3(b, sd * t, gb - 0.4), W3(b, sd * t, gb + h), W3(a, sd * t, ga + h), outN(sd), [[u0, (ga - 0.4) / 2], [u1, (gb - 0.4) / 2], [u1, (gb + h) / 2], [u0, (ga + h) / 2]]);
      }
      const capM = T.cap || mat, ct = T.cap ? t + 0.03 : t;
      B.col = T.cap ? [1, 1, 1] : col;
      B.quadOut(capM, W3(a, -ct, ga + h), W3(a, ct, ga + h), W3(b, ct, gb + h), W3(b, -ct, gb + h), [0, 1, 0], [[0, 0], [0.2, 0], [0.2, len / 2], [0, len / 2]]);
      B.col = col;
      if (k === 0) B.quadOut(mat, W3(a, -t, ga - 0.4), W3(a, t, ga - 0.4), W3(a, t, ga + h), W3(a, -t, ga + h), dirW(a, -(b[0] - a[0]), -(b[1] - a[1])));
      if (k === run.length - 1) B.quadOut(mat, W3(b, -t, gb - 0.4), W3(b, t, gb - 0.4), W3(b, t, gb + h), W3(b, -t, gb + h), dirW(b, b[0] - a[0], b[1] - a[1]));
      // grade sobre a mureta
      if (T.grid) {
        B.col = [0.85, 0.85, 0.85];
        B.quadOut('fenceGrid', W3(a, 0, ga + h), W3(b, 0, gb + h), W3(b, 0, gb + h + T.grid), W3(a, 0, ga + h + T.grid), outN(1), [[u0 * 2, 0], [u1 * 2, 0], [u1 * 2, 1], [u0 * 2, 1]]);
      }
      // pilares nas pontas e nas emendas
      if (T.pillars) {
        const top = h + (T.grid || 0) + 0.15;
        for (const [p, g] of [[a, ga], ...(k === run.length - 1 ? [[b, gb]] : [])]) {
          const q = P(p[0], 0, p[1]);
          B.col = col;
          B.box(mat, q[0], g - 0.4, q[2], 0.34, top + 0.4, 0.34, s.rot, { uvScale: 2, top: false });
          B.col = [1, 1, 1];
          B.box(T.cap, q[0], g + top, q[2], 0.42, 0.06, 0.42, s.rot, { uvScale: 1, bottom: true });
        }
      }
      B.col = [1, 1, 1];
      ctx.collision.addBox((A[0] + Bw[0]) / 2, (A[1] + Bw[1]) / 2, t + 0.04, len / 2, rot, Math.min(ga, gb) - 0.4, Math.max(ga, gb) + h + (T.grid || 0), { cam: false });
    }
  }
  // calçadinha do portão até a porta
  const pts = [[gx, zF + 0.1], [gx, (zF + foot[1]) / 2], foot];
  B.col = [1, 1, 1];
  for (let m = 0; m < pts.length - 1; m++) for (const [a, b] of split(pts[m], pts[m + 1])) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len * 0.5, nz = (b[0] - a[0]) / len * 0.5;
    const V = (p, k2) => { const q = P(p[0] + nx * k2, 0, p[1] + nz * k2); return [q[0], ground(q[0], q[2]) + 0.04, q[2]]; };
    const vs = [V(a, -1), V(b, -1), V(b, 1), V(a, 1)];
    B.quadOut('stonePath', ...vs, [0, 1, 0], vs.map(v => [v[0] / 2, v[2] / 2]));
  }
  // as lajotas ficam 4 cm acima do chão: entram no chão de quem pisa nelas
  ctx.walkways?.addPolyline(pts.map(p => L(p[0], p[1])), { hw: 0.5, dy: 0.04, edge: 0, edgeDy: 0.04 });
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
            if (dist > 1.4) spec.fence = pickFence(R, spec, dist);
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
    if (zones.overlapsBuilding(o, -0.4) || zones.obbBlocked(o)) continue;
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
      s.fence = pickFence(R, s, Math.min(front - 0.6, 7));
    }
    zones.addBuilding({ x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, rot: s.rot });
    f.used = true;
    placed.push(s);
  }
  for (const s of placed) buildHouse(B, ctx, s);
  return placed;
}

