import { rng, polyCentroid, pointInPoly, distSeg, resample, chaikin, obbCorners } from './geo.js';
import { buildChurch, CHURCH, pyramid } from './church.js';
import { buildHouse, makeSpec, lotValid, facingRoad, frame, groundFor } from './buildings.js';
import { bench, picnicTable, bin, lantern, orelhao, letreiro, monumento, fountain, railing, car, busStop, stopSign } from './props.js';
import { signMaterial } from '../engine/materials.js';

// Lugares marcantes: Igreja Matriz, Praça 10 de Abril, Calçadão do Rio Cadeia,
// cemitério, campo, Kartoffelfest, prefeitura e outros prédios conhecidos (OSM).

const area = (md, k, n) => md.areas.find(a => a.k === k && (n === undefined || a.n === n));
const poi = (md, n) => md.pois.find(p => p.n === n);
const poiK = (md, k) => md.pois.filter(p => p.k === k);

function nearestOnPolyline(pts, x, z) {
  let best = { d: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const [d, t] = distSeg(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < best.d) best = { d, x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, i };
  }
  return best;
}

function rectPoly(cx, cz, rot, x0, x1, z0, z1) {
  const P = frame({ x: cx, z: cz, rot }).W;
  return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)];
}

function circlePoly(x, z, r, n = 10) {
  return Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * Math.PI * 2) * r, z + Math.sin(i / n * Math.PI * 2) * r]);
}

export function defineLandmarks(ctx) {
  const { mapdata: md, terrain, roads, rivers, zones } = ctx;
  const L = ctx.landmarks = {};

  // ---------------- Igreja Matriz ----------------
  {
    const ig = poi(md, 'Igreja Matriz de Nossa Senhora Auxiliadora');
    const street = roads.list.find(r => r.name === 'Rua Cônego Afonso Wiest');
    const q = nearestOnPolyline(street.pts, ig.x, ig.z);
    let fx = q.x - ig.x, fz = q.z - ig.z; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
    const dist = CHURCH.L / 2 + 1.2 + 0.4 + 5 * 0.45 + 5.5;
    const x = q.x - fx * dist, z = q.z - fz * dist, rot = Math.atan2(fx, fz);
    const y = terrain.roadHeight(q.x, q.z) + 0.05;
    const hl = CHURCH.L / 2;
    const pad = rectPoly(x, z, rot, -CHURCH.W / 2 - 5, CHURCH.W / 2 + 5, -hl - 9, dist - 3.5);
    terrain.addPad(pad, y, 10);
    zones.block(pad, 1.5);
    zones.clearForest(pad);
    zones.place(rectPoly(x, z, rot, -CHURCH.W / 2 - 6, CHURCH.W / 2 + 6, -hl - 9, dist + 2), 'IGREJA MATRIZ', 3);
    L.church = { x, z, rot, y, street: q, dist };
  }

  // ---------------- Cemitério ----------------
  {
    const c = area(md, 'cemetery');
    const cc = polyCentroid(c.p);
    const h = terrain.roadHeight(cc[0], cc[1]);
    terrain.addPad(c.p, (x, z) => h + (terrain.roadHeight(x, z) - h) * 0.5, 6);
    zones.block(c.p, 1);
    zones.clearForest(c.p);
    zones.place(c.p, 'CEMITÉRIO CATÓLICO', 2);
    L.cemetery = { poly: c.p, c: cc };
  }

  // ---------------- Praça 10 de Abril ----------------
  {
    const pr = area(md, 'park', 'Praça 10 de Abril');
    const c = polyCentroid(pr.p);
    // encaixa o polígono longe das ruas e do rio
    const poly = pr.p.map(p => {
      let [x, z] = p;
      for (let k = 0; k < 60; k++) {
        const rc = roads.index.clearance(x, z);
        const rv = rivers.index.nearest(x, z);
        const okRoad = rc.d > (rc.seg && rc.seg.data.sidewalk ? 2.4 : 0.8);
        const okRiver = !rv.seg || rv.d > rv.seg.data.width / 2 + 3;
        if (okRoad && okRiver) break;
        const dx = c[0] - x, dz = c[1] - z, l = Math.hypot(dx, dz) || 1;
        x += dx / l * 0.5; z += dz / l * 0.5;
      }
      return [x, z];
    });
    // arredonda os cantos
    const smoothPoly = chaikin([...poly, poly[0]], 2).slice(0, -1);
    const pc = polyCentroid(smoothPoly);
    const y = terrain.roadHeight(pc[0], pc[1]) + 0.12;
    terrain.addPad(smoothPoly, y - 0.15, 4);
    zones.block(smoothPoly, 1);
    zones.clearForest(smoothPoly);
    zones.place(smoothPoly, 'PRAÇA 10 DE ABRIL', 3);
    L.praca = { poly: smoothPoly, c: pc, y };
  }

  // ---------------- Calçadão do Rio Cadeia ----------------
  {
    const river = rivers.list.find(r => r.name === 'Rio Cadeia');
    const bank = [], edge = [];
    for (let i = 0; i < river.pts.length; i++) {
      const [x, z] = river.pts[i];
      if (x < -420 || x > -175 || z < 88 || z > 430) continue;
      const a = river.pts[Math.max(i - 1, 0)], b = river.pts[Math.min(i + 1, river.pts.length - 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      // lado da avenida: normal que aponta para leste/sul
      let nx = -tz, nz = tx;
      if (nx < 0) { nx = -nx; nz = -nz; }
      const r0 = river.width / 2 + 3.5;
      let d = r0;
      while (d < 110) {
        const px = x + nx * d, pz = z + nz * d;
        const rc = roads.index.clearance(px, pz);
        if (rc.d < 1.6) break;
        d += 1;
      }
      if (d - r0 < 8) continue;
      bank.push([x + nx * r0, z + nz * r0]);
      edge.push([x + nx * (d - 0.5), z + nz * (d - 0.5)]);
    }
    const strip = [...bank, ...edge.slice().reverse()];
    terrain.addPad(strip, (x, z) => terrain.roadHeight(x, z) - 0.05, 3);
    zones.block(strip, 0.5);
    zones.clearForest(strip);
    zones.place(strip, 'CALÇADÃO DO RIO CADEIA', 2);
    // caminho sinuoso no meio da faixa
    const path = [];
    for (let i = 0; i < bank.length; i++) {
      const w = Math.hypot(edge[i][0] - bank[i][0], edge[i][1] - bank[i][1]);
      const t = 0.5 + Math.sin(i * 0.33) * Math.min(0.22, 6 / w);
      path.push([bank[i][0] + (edge[i][0] - bank[i][0]) * t, bank[i][1] + (edge[i][1] - bank[i][1]) * t]);
    }
    L.calcadao = { bank, edge, strip, path: resample(chaikin(path, 2), 2) };
  }

  // ---------------- Campo de futebol ----------------
  {
    const f = area(md, 'pitch');
    const c = polyCentroid(f.p);
    const y = terrain.roadHeight(c[0], c[1]);
    terrain.addPad(f.p, y, 8);
    zones.block(f.p, 2);
    zones.clearForest(f.p);
    zones.place(f.p, 'CAMPO DA SOCIEDADE', 2);
    L.field = { poly: f.p, c, y };
  }

  // ---------------- Kartoffelfest (pavilhão) ----------------
  {
    const k = poi(md, 'Kartoffelfest');
    const fr = facingRoad(ctx, k.x, k.z);
    const poly = rectPoly(k.x, k.z, fr.rot, -17, 17, -11, 11);
    const y = terrain.roadHeight(k.x, k.z);
    terrain.addPad(poly, y, 6);
    zones.block(poly, 1);
    zones.clearForest(poly);
    zones.place(poly, 'PAVILHÃO DA KARTOFFELFEST', 2);
    L.kartoffel = { x: k.x, z: k.z, rot: fr.rot, y };
  }
}

// ---------------- construção ----------------

export function buildLandmarks(B, ctx) {
  const L = ctx.landmarks;
  buildChurchArea(B, ctx, L.church);
  buildCemetery(B, ctx, L.cemetery);
  buildPraca(B, ctx, L.praca);
  buildCalcadao(B, ctx, L.calcadao);
  buildField(B, ctx, L.field);
  buildKartoffel(B, ctx, L.kartoffel);
  buildSpecials(B, ctx);
}

function tree(ctx, t, x, z, s = 1, c = null) { ctx.trees.push({ t, x, z, s, c }); }

// arestas do polígono no sentido em que a parede fica virada para fora
export function outwardEdges(poly) {
  let A = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push(A > 0 ? [b, a] : [a, b]);
  }
  return out;
}

function buildChurchArea(B, ctx, ch) {
  const res = buildChurch(B, ctx, { x: ch.x, z: ch.z, rot: ch.rot, y: ch.y });
  const { P, W } = frame({ x: ch.x, z: ch.z, rot: ch.rot });
  const hl = CHURCH.L / 2;
  // adro em pedra
  const z0 = hl + 1.2, z1 = ch.dist - 2.5;
  B.quad('stonePath', P(-11, ch.y + 0.02, z1), P(11, ch.y + 0.02, z1), P(11, ch.y + 0.02, z0 - 4), P(-11, ch.y + 0.02, z0 - 4),
    [[0, 0], [11, 0], [11, (z1 - z0 + 4) / 2], [0, (z1 - z0 + 4) / 2]], null, 4);
  // calçada em volta da igreja
  for (const side of [1, -1]) {
    const x0 = side * (CHURCH.W / 2 + 0.2), x1 = side * (CHURCH.W / 2 + 2.4);
    const a = side > 0 ? [x0, x1] : [x1, x0];
    B.quad('pavers', P(a[0], ch.y + 0.02, z0 - 4), P(a[1], ch.y + 0.02, z0 - 4), P(a[1], ch.y + 0.02, -hl - 2), P(a[0], ch.y + 0.02, -hl - 2),
      [[0, 0], [1.1, 0], [1.1, hl], [0, hl]], null, 4);
  }
  // araucárias e lampiões na frente
  for (const side of [1, -1]) {
    const t = W(side * 9.5, z1 - 2.5); tree(ctx, 'araucaria', t[0], t[1], 1.15);
    const t2 = W(side * 13.5, hl - 6); tree(ctx, 'araucaria', t2[0], t2[1], 1.0);
    const l = W(side * 6.5, z1 - 1.2); lantern(B, ctx, l[0], l[1]);
    const b = W(side * 9.5, z0 + 1.5); bench(B, ctx, b[0], b[1], ch.rot + side * Math.PI / 2);
    const h = W(side * 3.2, z0 + 3.4); tree(ctx, 'hortensia', h[0], h[1], 1.1);
    const h2 = W(side * 4.6, z0 + 3.4); tree(ctx, 'hortensia', h2[0], h2[1], 1.0);
  }
  // plátanos ao lado
  for (let i = 0; i < 4; i++) for (const side of [1, -1]) {
    const t = W(side * (CHURCH.W / 2 + 4.5), hl - 8 - i * 8);
    tree(ctx, 'platano', t[0], t[1], 0.9 + (i % 2) * 0.15);
  }
  // placa
  const sp = W(-8, z1 - 0.3);
  signPost(B, ctx, sp[0], sp[1], ch.rot, signMaterial('PARÓQUIA N. S. AUXILIADORA', { bg: '#e8dcc0', fg: '#4a2a18', w: 128, h: 24, sub: 'desde 1860' }));
  void res;
}

export function signPost(B, ctx, x, z, rot, mat, w = 1.8, h = 0.5) {
  const y = ctx.terrain.heightAt(x, z);
  const { P } = frame({ x, z, rot });
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) { const p = P(lx, 0, 0); B.box('woodDark', p[0], y, p[2], 0.1, 1.6, 0.1, rot, { uvScale: 1 }); }
  B.box('woodDark', x, y + 1.1, z, w, h + 0.1, 0.06, rot, { uvScale: 1 });
  B.quad(mat, P(-w / 2 + 0.05, y + 1.13, 0.04), P(w / 2 - 0.05, y + 1.13, 0.04), P(w / 2 - 0.05, y + 1.13 + h, 0.04), P(-w / 2 + 0.05, y + 1.13 + h, 0.04));
  B.quad(mat, P(w / 2 - 0.05, y + 1.13, -0.04), P(-w / 2 + 0.05, y + 1.13, -0.04), P(-w / 2 + 0.05, y + 1.13 + h, -0.04), P(w / 2 - 0.05, y + 1.13 + h, -0.04));
  ctx.collision.addBox(x, z, w / 2, 0.1, rot, y, y + 1.7, { cam: false });
}

function buildCemetery(B, ctx, cm) {
  const R = rng(1910);
  const poly = cm.poly;
  // muro branco com portão voltado para a igreja
  const ch = ctx.landmarks.church;
  let gateI = 0, gd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = Math.hypot(m[0] - ch.x, m[1] - ch.z);
    if (d < gd) { gd = d; gateI = i; }
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const pieces = i === gateI ? [[0, 0.5 - 1.6 / len], [0.5 + 1.6 / len, 1]] : [[0, 1]];
    for (const [t0, t1] of pieces) {
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, l = Math.hypot(x1 - x0, z1 - z0);
      const y = Math.min(ctx.terrain.heightAt(x0, z0), ctx.terrain.heightAt(x1, z1), ctx.terrain.heightAt(cx, cz)) - 0.4;
      B.box('plWhite', cx, y, cz, 0.3, 2.0, l, rot, { uvScale: 2, topMat: 'concreteW' });
      ctx.collision.addBox(cx, cz, 0.15, l / 2, rot, y, y + 2.0);
    }
    // pilares do portão
    if (i === gateI) {
      for (const t of [0.5 - 1.6 / len, 0.5 + 1.6 / len]) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = ctx.terrain.heightAt(x, z);
        B.box('plWhite', x, y - 0.3, z, 0.6, 2.8, 0.6, rot, { uvScale: 1 });
        pyramid(B, 'concreteW', [x, y + 2.5, z], 0.42, 0.5, rot + Math.PI / 4, 4);
      }
    }
  }
  // túmulos em fileiras alinhadas ao maior lado
  let bestL = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bestL) { bestL = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); }
  }
  const c = cm.c, cs = Math.cos(ang), sn = Math.sin(ang);
  for (let u = -45; u <= 45; u += 3.2) for (let v = -40; v <= 40; v += 2.2) {
    if (Math.abs(v) < 1.8) continue; // corredor central
    const x = c[0] + u * cs + v * sn, z = c[1] - u * sn + v * cs;
    if (!pointInPoly(x, z, poly)) continue;
    let inside = true;
    for (const [ox, oz] of [[1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]) if (!pointInPoly(x + ox, z + oz, poly)) inside = false;
    if (!inside || R.chance(0.4)) continue;
    const y = ctx.terrain.heightAt(x, z);
    const rot = ang + Math.PI / 2;
    const { P } = frame({ x, z, rot });
    const tone = R.range(0.75, 1.0);
    B.col = [tone, tone, tone * 0.98];
    const mat = R.chance(0.6) ? 'marble' : 'granite';
    B.box(mat, x, y - 0.2, z, 0.95, 0.5, 2.0, rot, { uvScale: 1 });
    const hp = P(0, 0, -0.85);
    if (R.chance(0.55)) {
      B.box('headstone', hp[0], y + 0.3, hp[2], 0.75, R.range(0.6, 1.0), 0.14, rot, { faceUV: true });
    } else {
      B.box(mat, hp[0], y + 0.3, hp[2], 0.12, 1.2, 0.12, rot, { uvScale: 1 });
      B.box(mat, hp[0], y + 1.1, hp[2], 0.6, 0.12, 0.12, rot, { uvScale: 1 });
    }
    B.col = [1, 1, 1];
    ctx.collision.addBox(x, z, 0.5, 1.0, rot, y - 0.3, y + 0.35, { walk: true, cam: false });
  }
  // cruzeiro central e ciprestes
  const y = ctx.terrain.heightAt(c[0], c[1]);
  B.box('granite', c[0], y - 0.2, c[1], 1.4, 0.8, 1.4, ang, { uvScale: 1 });
  B.box('granite', c[0], y + 0.6, c[1], 0.3, 4.2, 0.3, ang, { uvScale: 1 });
  B.box('granite', c[0], y + 3.5, c[1], 2.0, 0.3, 0.3, ang, { uvScale: 1 });
  ctx.collision.addCircle(c[0], c[1], 1.0, y - 0.5, y + 4.8);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const x = p[0] + (c[0] - p[0]) * 0.12, z = p[1] + (c[1] - p[1]) * 0.12;
    tree(ctx, 'cipreste', x, z, R.range(0.9, 1.2));
  }
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) / 8;
    const x = c[0] + (t - 0.5) * 80 * cs + 1.0 * sn, z = c[1] - (t - 0.5) * 80 * sn + 1.0 * cs;
    if (pointInPoly(x, z, poly)) tree(ctx, 'cipreste', x, z, R.range(0.8, 1.1));
  }
}

function buildPraca(B, ctx, pr) {
  const R = rng(1004);
  const poly = pr.poly, y = pr.y;
  // piso em espinha de peixe com meio-fio
  B.polygon('herring', poly, y, 2.5);
  for (const [a, b] of outwardEdges(poly)) B.wall('concreteW', a[0], a[1], b[0], b[1], y - 0.4, y, { uvScale: 2, ao: 0.9 });
  ctx.floors.push({ poly, y });
  fountain(B, ctx, pr.c[0], pr.c[1], y);
  // canteiros de hortênsias em volta da fonte
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = pr.c[0] + Math.cos(a) * 5.2, z = pr.c[1] + Math.sin(a) * 5.2;
    if (!pointInPoly(x, z, poly)) continue;
    B.col = [0.9, 0.9, 0.9];
    B.cylinder('granite', x, y - 0.1, z, 1.3, 1.3, 0.45, 8, { cap: true, capMat: 'dirt' });
    B.col = [1, 1, 1];
    tree(ctx, 'hortensia', x, z, 1.0);
    ctx.collision.addCircle(x, z, 1.35, y - 0.2, y + 0.35, { cam: false });
  }
  // bancos, lampiões e árvores perto da borda
  const ring = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    ring.push([p[0] + (pr.c[0] - p[0]) * 0.22, p[1] + (pr.c[1] - p[1]) * 0.22]);
  }
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const rot = Math.atan2(pr.c[0] - m[0], pr.c[1] - m[1]);
    if (i % 2 === 0) bench(B, ctx, m[0], m[1], rot);
    else lantern(B, ctx, m[0], m[1]);
    tree(ctx, i % 3 === 0 ? 'araucaria' : 'platano', p[0], p[1], R.range(0.85, 1.1));
  });
  // orelhão real do OSM (fica perto da praça)
  const tel = ctx.mapdata.pois.find(p => p.k === 'telephone' && Math.hypot(p.x - pr.c[0], p.z - pr.c[1]) < 40);
  if (tel) {
    let [x, z] = [tel.x, tel.z];
    if (!pointInPoly(x, z, poly)) { x = x + (pr.c[0] - x) * 0.5; z = z + (pr.c[1] - z) * 0.5; }
    orelhao(B, ctx, x, z, Math.atan2(pr.c[0] - x, pr.c[1] - z) + Math.PI);
  }
  const sp = [poly[0][0] + (pr.c[0] - poly[0][0]) * 0.1, poly[0][1] + (pr.c[1] - poly[0][1]) * 0.1];
  signPost(B, ctx, sp[0], sp[1], Math.atan2(sp[0] - pr.c[0], sp[1] - pr.c[1]), signMaterial('PRAÇA 10 DE ABRIL', { bg: '#2f4a2a', fg: '#f2e8c8', w: 128, h: 24 }));
}

function buildCalcadao(B, ctx, cd) {
  const R = rng(25);
  const path = cd.path;
  const T = ctx.terrain;
  // caminho de lajotas
  const hw = 1.7;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const ta = tan(path, i), tb = tan(path, i + 1);
    const V = (p, t, s) => { const x = p[0] - t[1] * hw * s, z = p[1] + t[0] * hw * s; return [x, T.heightAt(x, z) + 0.06, z]; };
    const pa = V(a, ta, 1), pb = V(b, tb, 1), pc = V(b, tb, -1), pd = V(a, ta, -1);
    const uv = p => [p[0] / 2, p[2] / 2];
    B.quad('pavers', pa, pb, pc, pd, [uv(pa), uv(pb), uv(pc), uv(pd)]);
    // bordas de concreto
    for (const s of [1, -1]) {
      const e0 = V(a, ta, s), e1 = V(b, tb, s);
      const o0 = [a[0] - ta[1] * (hw + 0.25) * s, 0, a[1] + ta[0] * (hw + 0.25) * s], o1 = [b[0] - tb[1] * (hw + 0.25) * s, 0, b[1] + tb[0] * (hw + 0.25) * s];
      o0[1] = T.heightAt(o0[0], o0[2]) + 0.1; o1[1] = T.heightAt(o1[0], o1[2]) + 0.1;
      if (s > 0) B.quad('concreteW', e0, o0, o1, e1, [[0, 0], [0.2, 0], [0.2, 1], [0, 1]]);
      else B.quad('concreteW', e1, o1, o0, e0, [[0, 0], [0.2, 0], [0.2, 1], [0, 1]]);
    }
  }
  // guarda-corpo na margem do rio
  const bankRail = cd.bank.map((p, i) => {
    const e = cd.edge[i];
    const dx = e[0] - p[0], dz = e[1] - p[1], l = Math.hypot(dx, dz);
    return [p[0] + dx / l * 1.2, p[1] + dz / l * 1.2];
  });
  railing(B, ctx, chaikin(bankRail, 2));
  // mobiliário ao longo do caminho
  let acc = 0, k = 0;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (acc < 9) continue;
    acc = 0; k++;
    const t = tan(path, i), p = path[i];
    const side = k % 2 ? 1 : -1;
    const ox = -t[1] * side, oz = t[0] * side;
    const at = d => [p[0] + ox * d, p[1] + oz * d];
    if (k % 2 === 0) { const q = at(2.6); lantern(B, ctx, q[0], q[1]); }
    if (k % 3 === 1) { const q = at(2.9); bench(B, ctx, q[0], q[1], Math.atan2(-ox, -oz)); }
    if (k % 7 === 3) { const q = at(3.0); bin(B, ctx, q[0], q[1]); }
    if (k % 9 === 5) { const q = at(-6); picnicTable(B, ctx, q[0], q[1], Math.atan2(t[0], t[1])); }
    // árvores: plátanos em fila, araucárias em grupos
    const tq = at(5.5 + R.range(0, 2));
    tree(ctx, k % 4 === 0 ? 'araucaria' : 'platano', tq[0], tq[1], R.range(0.85, 1.15));
    const tq2 = at(-4.5 - R.range(0, 3));
    if (R.chance(0.6)) tree(ctx, R.chance(0.25) ? 'araucaria' : R.chance(0.5) ? 'platano' : 'nativa', tq2[0], tq2[1], R.range(0.8, 1.1));
    if (R.chance(0.35)) { const h = at(side * 0 + 3.4); tree(ctx, 'hortensia', h[0] + R.range(-1, 1), h[1] + R.range(-1, 1), 0.9); }
  }
  // letreiro TEEWALD perto da praça, virado para a avenida
  const li = Math.floor(cd.bank.length * 0.22);
  {
    const b = cd.bank[li], e = cd.edge[li];
    const x = b[0] + (e[0] - b[0]) * 0.72, z = b[1] + (e[1] - b[1]) * 0.72;
    const rot = Math.atan2(e[0] - b[0], e[1] - b[1]);
    letreiro(B, ctx, x, z, rot, 'TEEWALD');
    ctx.landmarks.letreiro = { x, z, rot };
  }
  // Monumento ao Imigrante, na ponta sul, perto do acesso à cidade
  {
    const mi = Math.floor(cd.bank.length * 0.82);
    const b = cd.bank[mi], e = cd.edge[mi];
    const x = b[0] + (e[0] - b[0]) * 0.55, z = b[1] + (e[1] - b[1]) * 0.55;
    monumento(B, ctx, x, z, Math.atan2(e[0] - b[0], e[1] - b[1]));
    ctx.landmarks.monumento = { x, z };
    const sp = [x + (e[0] - b[0]) * 0.12, z + (e[1] - b[1]) * 0.12];
    signPost(B, ctx, sp[0] + 3.6, sp[1] - 1, Math.atan2(e[0] - b[0], e[1] - b[1]), signMaterial('MONUMENTO AO IMIGRANTE', { bg: '#3a2a1a', fg: '#f0e0c0', w: 128, h: 24, sub: '1847 - 2017' }));
  }
  const sp = cd.path[3];
  signPost(B, ctx, sp[0] + 2.5, sp[1] + 1, 0.6, signMaterial('CALÇADÃO DO RIO CADEIA', { bg: '#2f4a2a', fg: '#f2e8c8', w: 128, h: 24 }));
}

const tan = (P, i) => {
  const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};

function buildField(B, ctx, f) {
  // gramado listrado e linhas brancas, num retângulo dentro do polígono
  const poly = f.poly;
  let bestL = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bestL) { bestL = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); }
  }
  const { P } = frame({ x: f.c[0], z: f.c[1], rot: ang });
  const hl = 44, hw = 27, y = f.y + 0.05;
  B.quad('field', P(-hw - 3, y, -hl - 3), P(-hw - 3, y, hl + 3), P(hw + 3, y, hl + 3), P(hw + 3, y, -hl - 3), [[0, 0], [0, 8], [5, 8], [5, 0]], null, 6);
  const line = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * 0.06, nz = dx / l * 0.06;
    B.quad('paint', P(x0 - nx, y + 0.02, z0 - nz), P(x0 + nx, y + 0.02, z0 + nz), P(x1 + nx, y + 0.02, z1 + nz), P(x1 - nx, y + 0.02, z1 - nz));
  };
  line(-hw, -hl, hw, -hl); line(hw, -hl, hw, hl); line(hw, hl, -hw, hl); line(-hw, hl, -hw, -hl); line(-hw, 0, hw, 0);
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    line(Math.cos(a0) * 7, Math.sin(a0) * 7, Math.cos(a1) * 7, Math.sin(a1) * 7);
  }
  for (const s of [1, -1]) {
    line(-16, s * hl, -16, s * (hl - 14)); line(16, s * hl, 16, s * (hl - 14)); line(-16, s * (hl - 14), 16, s * (hl - 14));
    // traves
    B.col = [1, 1, 1];
    for (const x of [-3.66, 3.66]) { const p = P(x, 0, s * hl); B.box('concreteW', p[0], y, p[2], 0.12, 2.44, 0.12, ang, { uvScale: 1 }); ctx.collision.addCircle(p[0], p[2], 0.1, y, y + 2.44); }
    const t = P(0, 0, s * hl); B.box('concreteW', t[0], y + 2.38, t[2], 7.44, 0.12, 0.12, ang, { uvScale: 1 });
  }
  // arquibancada simples num lado
  for (let i = 0; i < 4; i++) {
    const p = P(hw + 5 + i * 0.8, 0, 0);
    B.box('concrete', p[0], y - 0.3, p[2], 0.8, 0.5 + i * 0.4, 30, ang, { uvScale: 2 });
  }
  const st = P(hw + 6.2, 0, 0);
  ctx.collision.addBox(st[0], st[2], 1.6, 15, ang, y - 0.3, y + 1.0, { walk: true, ramp: null });
}

function buildKartoffel(B, ctx, k) {
  const { P } = frame({ x: k.x, z: k.z, rot: k.rot });
  const y = k.y, hw = 15, hd = 9, H = 5.2, rise = 3;
  // chão de concreto
  B.quad('concrete', P(-hw - 1, y + 0.05, hd + 1), P(hw + 1, y + 0.05, hd + 1), P(hw + 1, y + 0.05, -hd - 1), P(-hw - 1, y + 0.05, -hd - 1),
    [[0, 0], [10, 0], [10, 6], [0, 6]], null, 6);
  // pilares
  for (let i = 0; i <= 5; i++) for (const s of [1, -1]) {
    const p = P(-hw + i * (hw * 2 / 5), 0, s * hd);
    B.box('concreteW', p[0], y, p[2], 0.4, H, 0.4, k.rot, { uvScale: 2 });
    ctx.collision.addBox(p[0], p[2], 0.2, 0.2, k.rot, y, y + H);
  }
  // telhado metálico de duas águas
  const e = y + H, r = y + H + rise;
  B.quad('metalRoof', P(-hw - 0.6, e, hd + 0.8), P(hw + 0.6, e, hd + 0.8), P(hw + 0.6, r, 0), P(-hw - 0.6, r, 0), [[0, 0], [12, 0], [12, 4], [0, 4]]);
  B.quad('metalRoof', P(hw + 0.6, e, -hd - 0.8), P(-hw - 0.6, e, -hd - 0.8), P(-hw - 0.6, r, 0), P(hw + 0.6, r, 0), [[0, 0], [12, 0], [12, 4], [0, 4]]);
  B.tri('woodPlank', P(-hw, e, -hd), P(-hw, e, hd), P(-hw, r, 0), [0, 0], [6, 0], [3, 1.2]);
  B.tri('woodPlank', P(hw, e, hd), P(hw, e, -hd), P(hw, r, 0), [0, 0], [6, 0], [3, 1.2]);
  // placa e bandeirolas
  B.quad(signMaterial('KARTOFFELFEST', { bg: '#7a4a1a', fg: '#ffe9a0', w: 128, h: 24, sub: 'Festa da Batata' }), P(-4, e - 1.1, hd + 0.25), P(4, e - 1.1, hd + 0.25), P(4, e - 0.05, hd + 0.25), P(-4, e - 0.05, hd + 0.25));
  for (let i = 0; i < 5; i++) {
    const z0 = -hd + 1 + i * ((hd * 2 - 2) / 4);
    for (let j = 0; j < 6; j++) {
      const x0 = -hw + j * 5, x1 = x0 + 5;
      B.quad('flags', P(x0, e - 0.1, z0), P(x1, e - 0.1, z0), P(x1, e - 0.75, z0), P(x0, e - 0.75, z0), [[0, 1], [1, 1], [1, 0], [0, 0]]);
    }
  }
  // mesas compridas
  for (let i = 0; i < 4; i++) {
    const p = P(-8 + i * 5.3, 0, -1);
    picnicTable(B, ctx, p[0], p[2], k.rot + Math.PI / 2);
    const p2 = P(-8 + i * 5.3, 0, 3);
    picnicTable(B, ctx, p2[0], p2[2], k.rot + Math.PI / 2);
  }
}

// prédios conhecidos do OpenStreetMap
function polyToOBB(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const rot = -th, c = Math.cos(rot), s = Math.sin(rot);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { const lx = x * c - z * s, lz = x * s + z * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); }
    const A = (x1 - x0) * (z1 - z0);
    if (!best || A < best.A) {
      const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
      best = { A, x: lx * c + lz * s, z: -lx * s + lz * c, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, rot };
    }
  }
  return best;
}

// gira a caixa para a frente (+z local) apontar para a rua mais próxima
function orientToRoad(ctx, o) {
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

function placeAtPOI(ctx, R, x, z, w, d, style, extra = {}) {
  const fr = facingRoad(ctx, x, z);
  let cx = x, cz = z;
  if (fr.road && fr.d < 30) {
    const off = fr.road.hw + (fr.road.sidewalk ? 2 : 0) + (extra.setback ?? 1.5) + d / 2;
    cx = fr.px + fr.nx * off; cz = fr.pz + fr.nz * off;
  }
  for (let attempt = 0; attempt < 14; attempt++) {
    const sh = 1 - Math.floor(attempt / 3) * 0.12;
    const push = (attempt % 3) * 3;
    const px = cx + (fr.nx || 0) * push, pz = cz + (fr.nz || 0) * push;
    const obb = { x: px, z: pz, hx: (w * sh) / 2, hz: (d * sh) / 2, rot: fr.rot };
    if (lotValid(ctx, obb, { slope: 6, margin: 0.8 })) {
      const spec = makeSpec(R, style, px, pz, fr.rot, w * sh, d * sh, extra);
      ctx.zones.addBuilding({ x: px, z: pz, hx: spec.w / 2, hz: spec.d / 2, rot: fr.rot });
      return spec;
    }
  }
  return null;
}

function buildSpecials(B, ctx) {
  const md = ctx.mapdata, R = rng(4242);
  const specs = [];
  const add = s => { if (s) specs.push(s); return s; };
  const sign = (t, o = {}) => signMaterial(t, { w: 128, h: 24, ...o });

  // Sociedade Cultural e Beneficente (salão centenário)
  {
    const a = md.areas.find(x => x.n === 'Sociedade Cultural e Beneficente Herval');
    const o = orientToRoad(ctx, polyToOBB(a.p));
    const s = makeSpec(R, 'masonry', o.x, o.z, o.rot, o.hx * 2, o.hz * 2, { floors: 2 });
    Object.assign(s, { wall: 'plCream', roof: 'roofClay', roofType: 'gableFront', pitch: 32, win: 'window1', shutters: [0.35, 0.5, 0.38], sign: sign('SOCIEDADE CULTURAL', { bg: '#e8dcc0', fg: '#5a2a18', sub: 'fundada em 1902' }), signY: undefined, doorAt: 0.5 });
    ctx.zones.addBuilding({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, rot: o.rot });
    add(s);
  }
  // Museu Professor Laurindo Vier (casa enxaimel de 1906)
  {
    const a = md.areas.find(x => x.n === 'Museu Professor Laurindo Vier');
    const o = orientToRoad(ctx, polyToOBB(a.p));
    const s = makeSpec(R, 'enxaimel', o.x, o.z, o.rot, Math.max(o.hx * 2, 9), Math.max(o.hz * 2, 9));
    Object.assign(s, { facade: 'facKleiser', roofType: 'gableFront', sign: sign('MUSEU', { bg: '#3a2a1a', fg: '#f0e0c0', sub: 'Prof. Laurindo Vier' }), signY: undefined, signH: 0.6 });
    ctx.zones.addBuilding({ x: o.x, z: o.z, hx: s.w / 2, hz: s.d / 2, rot: o.rot });
    add(s);
  }
  // Comércio da praça (TEEWALD STORE, textura comercial.png)
  {
    const a = md.areas.find(x => x.k === 'building' && !x.n && Math.hypot(polyCentroid(x.p)[0] + 165, polyCentroid(x.p)[1] - 30) < 15);
    if (a) {
      const o = orientToRoad(ctx, polyToOBB(a.p));
      const s = makeSpec(R, 'commercial', o.x, o.z, o.rot, Math.max(o.hx * 2, 10), Math.max(o.hz * 2, 10), { floors: 2, sign: 'comercial' });
      s.signH = 1.6; s.awning = 'awnRed';
      ctx.zones.addBuilding({ x: o.x, z: o.z, hx: s.w / 2, hz: s.d / 2, rot: o.rot });
      add(s);
    }
  }
  // Prefeitura
  {
    const p = md.pois.find(x => x.k === 'townhall');
    const s = add(placeAtPOI(ctx, R, p.x, p.z, 20, 12, 'masonry', { floors: 2, setback: 6 }));
    if (s) {
      Object.assign(s, { wall: 'plWhite', roof: 'roofTerra', roofType: 'hip', win: 'window3', shutters: null, sign: sign('PREFEITURA MUNICIPAL', { bg: '#f0ece0', fg: '#1f3f6b', sub: 'TEEWALD' }), doorAt: 0.5 });
      ctx.landmarks.prefeitura = s;
    }
  }
  // fábricas de calçados
  for (const p of poiK(md, 'works')) {
    const s = add(placeAtPOI(ctx, R, p.x, p.z, R.range(20, 26), R.range(28, 36), 'factory', { setback: 3 }));
    if (s) s.sign = sign('INDÚSTRIA DE CALÇADOS', { bg: '#1f3f6b', fg: '#f0f0e0' });
  }
  // escola, hospital, mercados, bancos, igrejas, lojas, correio
  const list = [
    ['school', null, 30, 11, 'masonry', { floors: 2, wall: 'plYellow', roof: 'roofTerra', roofType: 'hip', win: 'window3' }, 'ESCOLA ESTADUAL', '#2f5a2a'],
    ['hospital', null, 26, 12, 'masonry', { floors: 2, wall: 'plWhite', roof: 'roofRed', roofType: 'hip', win: 'window2' }, 'HOSPITAL', '#a01818'],
    ['supermarket', 'Supermercado Kunst', 24, 18, 'commercial', { floors: 1 }, 'SUPERMERCADO', '#a01818'],
    ['supermarket', 'Super Piá e Agro Piá', 20, 15, 'commercial', { floors: 1 }, 'AGROPECUÁRIA', '#2f5a2a'],
    ['bank', 'Banrisul', 14, 12, 'commercial', { floors: 2 }, 'BANCO', '#1f3f6b'],
    ['bank', 'Sicredi', 14, 12, 'commercial', { floors: 2 }, 'COOPERATIVA DE CRÉDITO', '#2f5a2a'],
    ['post_office', null, 10, 10, 'commercial', { floors: 1 }, 'CORREIO', '#b8860b'],
    ['yes', 'Lojas Taqi', 12, 12, 'commercial', { floors: 2 }, 'MAGAZINE', '#7a2a1c'],
    ['yes', 'A Legítima Super 10', 12, 12, 'commercial', { floors: 2 }, 'BAZAR', '#5a1f4a'],
    ['department_store', null, 14, 12, 'commercial', { floors: 2 }, 'LOJA DE MÓVEIS', '#7a2a1c'],
    ['community_centre', null, 14, 20, 'masonry', { floors: 2, wall: 'plCream', roof: 'roofClay', roofType: 'gableFront' }, 'SALÃO PAROQUIAL', '#5a2a18'],
  ];
  for (const [k, n, w, d, style, extra, text, color] of list) {
    const p = md.pois.find(x => x.k === k && (!n || x.n === n));
    if (!p) continue;
    const s = add(placeAtPOI(ctx, R, p.x, p.z, w, d, style, { ...extra, setback: style === 'commercial' ? 0.6 : 4 }));
    if (s) { Object.assign(s, extra); s.sign = sign(text, { bg: color === '#a01818' ? '#f4f0e8' : color, fg: color === '#a01818' ? '#a01818' : '#f6eed8' }); }
  }
  for (const p of md.pois.filter(x => x.k === 'place_of_worship' && !x.n.startsWith('Igreja Matriz'))) {
    const s = add(placeAtPOI(ctx, R, p.x, p.z, 10, 16, 'masonry', { floors: 2, setback: 4 }));
    if (s) Object.assign(s, { wall: 'plWhite', roof: 'roofRed', roofType: 'gableFront', pitch: 38, win: 'window2', sign: sign('IGREJA', { bg: '#f4f0e8', fg: '#3a3a3a' }), shutters: null });
  }

  for (const s of specs) buildHouse(B, ctx, s);

  // Posto Calçadão: cobertura, bombas e loja
  {
    const a = md.areas.find(x => x.n === 'Posto Calçadão');
    const o = orientToRoad(ctx, polyToOBB(a.p));
    const { P } = frame(o);
    const y = groundFor(ctx, { x: o.x, z: o.z, w: o.hx * 2, d: o.hz * 2, rot: o.rot }).yMax;
    B.quad('concrete', P(-o.hx - 3, y + 0.05, o.hz + 2), P(o.hx + 3, y + 0.05, o.hz + 2), P(o.hx + 3, y + 0.05, -o.hz - 2), P(-o.hx - 3, y + 0.05, -o.hz - 2), [[0, 0], [8, 0], [8, 8], [0, 8]], null, 5);
    const cw = Math.min(o.hx * 2, 18), cd = 9;
    for (const [lx, lz] of [[-cw / 2 + 1, 2], [cw / 2 - 1, 2], [-cw / 2 + 1, 2 + cd - 2], [cw / 2 - 1, 2 + cd - 2]]) {
      const p = P(lx, 0, o.hz - lz);
      B.box('concreteW', p[0], y, p[2], 0.45, 5, 0.45, o.rot);
      ctx.collision.addBox(p[0], p[2], 0.25, 0.25, o.rot, y, y + 5);
    }
    // cobertura: frente em z local = o.hz
    const cc = P(0, 0, o.hz - cd / 2);
    B.col = [1, 1, 1];
    B.box('metalWhite', cc[0], y + 5, cc[2], cw, 0.7, cd, o.rot, { uvScale: 3 });
    const fz = o.hz + 0.02;
    B.quad(sign('POSTO CALÇADÃO', { bg: '#f4f0e8', fg: '#a01818' }), P(-5, y + 5.02, fz), P(5, y + 5.02, fz), P(5, y + 5.68, fz), P(-5, y + 5.68, fz));
    for (const lx of [-3, 3]) {
      const p = P(lx, 0, o.hz - 2 - (cd - 2) / 2);
      B.col = [0.85, 0.2, 0.15];
      B.box('carPaint', p[0], y, p[2], 0.8, 1.6, 0.5, o.rot, { uvScale: 1 });
      B.col = [1, 1, 1];
      ctx.collision.addBox(p[0], p[2], 0.45, 0.3, o.rot, y, y + 1.6);
    }
    // loja de conveniência nos fundos
    const st = { x: P(0, 0, -o.hz + 4)[0], z: P(0, 0, -o.hz + 4)[2], rot: o.rot, w: Math.min(o.hx * 2, 14), d: 7, style: 'commercial', floors: 1, wall: 'plWhite', roofType: 'flat', roof: 'concrete', win: 'window2', sign: 'posto', signH: 1.0, found: 'concrete', plinth: 0.1 };
    buildHouse(B, ctx, st);
    ctx.zones.addBuilding({ x: o.x, z: o.z, hx: o.hx + 2, hz: o.hz + 2, rot: o.rot });
    car(B, ctx, P(5, 0, o.hz - 6)[0], P(5, 0, o.hz - 6)[2], o.rot, [0.2, 0.3, 0.55]);
  }
  // revenda de veículos
  {
    const a = md.areas.find(x => x.k === 'building' && !x.n && Math.hypot(polyCentroid(x.p)[0] + 288, polyCentroid(x.p)[1] - 365) < 15);
    if (a) {
      const o = orientToRoad(ctx, polyToOBB(a.p));
      const s = makeSpec(R, 'commercial', o.x, o.z, o.rot, Math.max(o.hx * 2, 12), Math.max(o.hz * 2, 12), { floors: 1, signText: 'VEÍCULOS' });
      ctx.zones.addBuilding({ x: o.x, z: o.z, hx: s.w / 2, hz: s.d / 2, rot: o.rot });
      buildHouse(B, ctx, s);
      const { P } = frame(o);
      const cols = [[0.8, 0.1, 0.1], [0.9, 0.9, 0.85], [0.15, 0.2, 0.4]];
      cols.forEach((c, i) => { const p = P(-4 + i * 4, 0, o.hz + 4.5); car(B, ctx, p[0], p[2], o.rot + Math.PI / 2, c); });
    }
  }
  // parada de ônibus e placas de PARE
  {
    const cd = ctx.landmarks.calcadao, i = Math.floor(cd.edge.length * 0.5);
    const e = cd.edge[i], b = cd.bank[i];
    const dx = e[0] - b[0], dz = e[1] - b[1], l = Math.hypot(dx, dz);
    busStop(B, ctx, e[0] - dx / l * 1.5, e[1] - dz / l * 1.5, Math.atan2(dx, dz));
  }
  for (const r of ctx.roads.list) {
    if (r.rank !== 3 && r.rank !== 4) continue;
    for (const end of [0, r.pts.length - 1]) {
      const [x, z] = r.pts[end];
      const major = ctx.roads.index.clearance(x, z, d => d.rank >= 5);
      if (major.d > 1) continue;
      const k = end === 0 ? Math.min(3, r.pts.length - 1) : Math.max(r.pts.length - 4, 0);
      const t = tan(r.pts, k), side = 1;
      const px = r.pts[k][0] - t[1] * (r.hw + 0.8) * side, pz = r.pts[k][1] + t[0] * (r.hw + 0.8) * side;
      if (ctx.zones.isBlocked(px, pz) || ctx.zones.insideBuilding(px, pz, 0.5)) continue;
      stopSign(B, ctx, px, pz, Math.atan2(t[0], t[1]) + (end === 0 ? Math.PI : 0));
    }
  }
  void obbCorners;
}
