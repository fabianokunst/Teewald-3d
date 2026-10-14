import { ShapeUtils, Vector2 } from 'three';
import { rng, polyCentroid, pointInPoly, distSeg, resample, chaikin, obbCorners } from './geo.js';
import { buildChurch, CHURCH, pyramid } from './church.js';
import { buildHouse, makeSpec, lotValid, facingRoad, frame, orientToRoad as orientFP, fitBox } from './buildings.js';
import { claimFootprint } from './footprints.js';
import { bench, picnicTable, bin, lantern, orelhao, letreiro, monumento, fountain, railing, car, busStop, stopSign, benchFits, spotFree, boxPts, reserve, treeRadius, groundOk, tube } from './props.js';
import { signMaterial } from '../engine/materials.js';

// Lugares marcantes: Igreja Matriz, Praça 10 de Abril, Calçadão do Rio Cadeia,
// cemitério, campo, Kartoffelfest, prefeitura e outros prédios conhecidos (OSM).

// altura do piso da praça acima do terreno (meio-fio)
const PRACA_DY = 0.12;

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
  // Posição conferida na imagem de satélite e no contorno do prédio (Microsoft):
  // nave de ~34 x 20 m alinhada à Rua 12 de Maio, torre e fachada na ponta OESTE,
  // voltada para o fim da Rua Cônego Afonso Wiest e para a Praça 10 de Abril.
  {
    const ig = poi(md, 'Igreja Matriz de Nossa Senhora Auxiliadora');
    const fx = -0.998, fz = -0.0635;                // direção da fachada (oeste)
    const x = -42.8, z = 40.4, rot = Math.atan2(fx, fz);
    const hl = CHURCH.L / 2;
    const street = roads.list.find(r => r.name === 'Rua Cônego Afonso Wiest');
    const F = [x + fx * hl, z + fz * hl];
    const q = nearestOnPolyline(street.pts, F[0], F[1]);
    const dist = Math.max(hl + 8, (q.x - x) * fx + (q.z - z) * fz); // centro -> rua, ao longo do eixo
    const y = terrain.roadHeight(F[0], F[1]) + 0.05;
    const pad = rectPoly(x, z, rot, -CHURCH.W / 2 - 4, CHURCH.W / 2 + 4, -hl - 1, dist - 3.5);
    terrain.addPad(pad, y, 8, y + 0.02);
    zones.block(pad, 0.5);
    zones.clearForest(pad);
    zones.place(rectPoly(x, z, rot, -CHURCH.W / 2 - 6, CHURCH.W / 2 + 6, -hl - 2, dist + 2), 'IGREJA MATRIZ', 3);
    L.church = { x, z, rot, y, street: q, dist, poi: ig };
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
    // encaixa o polígono longe das ruas e do rio (fora da margem escavada: o piso
    // acompanha o terreno e afundaria no talude)
    const poly = pr.p.map(p => {
      let [x, z] = p;
      for (let k = 0; k < 60; k++) {
        const rc = roads.index.clearance(x, z);
        const rv = rivers.index.nearest(x, z);
        const okRoad = rc.d > (rc.seg && rc.seg.data.sidewalk ? 2.4 : 0.8);
        const okRiver = !rv.seg || rv.d > rv.seg.data.width / 2 + rv.seg.data.bank + 1;
        if (okRoad && okRiver) break;
        const dx = c[0] - x, dz = c[1] - z, l = Math.hypot(dx, dz) || 1;
        x += dx / l * 0.5; z += dz / l * 0.5;
      }
      return [x, z];
    });
    // arredonda os cantos (sem vértices repetidos: o piso é triangulado)
    const smoothPoly = chaikin([...poly, poly[0]], 2).slice(0, -1)
      .filter((p, i, a) => Math.hypot(p[0] - a[(i + 1) % a.length][0], p[1] - a[(i + 1) % a.length][1]) > 0.05);
    const pc = polyCentroid(smoothPoly);
    // A praça fica num declive (uns 4 m de um canto ao outro, descendo para o rio).
    // O chão acompanha a altura das ruas em volta e o piso vai colado nele. Plana,
    // na altura do centro, ela ficava 2,5 m abaixo da rua de um lado (um fosso, com
    // a rua e a calçada no ar) e 2 m acima do barranco do outro
    terrain.addPad(smoothPoly, (x, z) => terrain.roadHeight(x, z), 4);
    zones.block(smoothPoly, 1);
    zones.clearForest(smoothPoly);
    zones.place(smoothPoly, 'PRAÇA 10 DE ABRIL', 3);
    L.praca = { poly: smoothPoly, c: pc, y: terrain.roadHeight(pc[0], pc[1]) + PRACA_DY };
  }

  // ---------------- Calçadão do Rio Cadeia ----------------
  {
    const river = rivers.list.find(r => r.name === 'Rio Cadeia');
    const avenue = roads.list.filter(r => r.name === 'VRS-873');
    const runs = [[]];
    for (let i = 0; i < river.pts.length; i++) {
      const [x, z] = river.pts[i];
      const cut = () => { if (runs[runs.length - 1].length) runs.push([]); };
      if (x < -420 || x > -175 || z < 88 || z > 430) { cut(); continue; }
      const a = river.pts[Math.max(i - 1, 0)], b = river.pts[Math.min(i + 1, river.pts.length - 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      // lado da avenida: a normal que aponta para o ponto mais próximo da VRS-873
      let nx = -tz, nz = tx;
      let best = null;
      for (const r of avenue) { const q = nearestOnPolyline(r.pts, x, z); if (!best || q.d < best.d) best = q; }
      if (best && (best.x - x) * nx + (best.z - z) * nz < 0) { nx = -nx; nz = -nz; }
      const r0 = river.width / 2 + river.bank + 0.5; // depois da margem escavada
      let d = r0;
      while (d < 110) {
        const px = x + nx * d, pz = z + nz * d;
        const rc = roads.index.clearance(px, pz);
        if (rc.d < 1.6) break;
        // outro curso d'água (arroio) ou o próprio rio voltando numa curva
        const w = rivers.index.nearest(px, pz, rv => rv !== river);
        if (w.seg && w.d < w.seg.data.width / 2 + w.seg.data.bank + 1.5) break;
        const self = rivers.index.nearest(px, pz, rv => rv === river);
        if (self.seg && Math.abs(self.seg.i - i) > 3 && self.d < river.width / 2 + river.bank + 1) break;
        d += 1;
      }
      if (d - r0 < 8) { cut(); continue; }
      runs[runs.length - 1].push({ bank: [x + nx * r0, z + nz * r0], edge: [x + nx * (d - 0.5), z + nz * (d - 0.5)] });
    }
    // fica com o trecho contínuo mais longo (sem saltos por cima do rio)
    const run = runs.reduce((p, q) => (q.length > p.length ? q : p), []);
    const bank = run.map(p => p.bank), edge = run.map(p => p.edge);
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
    let bestL = 0, ang = 0;
    for (let i = 0; i < f.p.length; i++) {
      const a = f.p[i], b = f.p[(i + 1) % f.p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > bestL) { bestL = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); }
    }
    terrain.addPad(f.p, y, 8, y + 0.05);
    terrain.addPad(rectPoly(c[0], c[1], ang, -31, 36, -48, 48), y, 8, y + 0.05); // gramado e arquibancada
    zones.block(f.p, 2);
    zones.clearForest(f.p);
    zones.place(f.p, 'CAMPO DA SOCIEDADE', 2);
    L.field = { poly: f.p, c, y, ang };
  }

  // ---------------- Kartoffelfest (pavilhão de lona na Rua Benno Closs) ----------------
  // Para a festa, o pavilhão é montado em cima da rua da Prefeitura (Rua Beno Closs, 88),
  // que fica fechada para carros: só se entra a pé. Vai no trecho reto mais perto da
  // Prefeitura, na saída do estacionamento (conferido na imagem de satélite). A rua
  // continua sendo o chão: nada de piso nem de aterro. x local ao longo da rua
  {
    const hl = 18, hw = 5.3;   // meio comprimento e meia largura (linha dos postes, na calçada)
    const road = roads.list.find(r => r.name === 'Rua Benno Closs');
    const th = poiK(md, 'townhall')[0];
    const P = road.pts, K = Math.round(hl / 2.5);
    let best = null;
    for (let i = K; i < P.length - K; i++) {
      const a = P[i - K], b = P[i + K], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l, c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // reto: o eixo da rua não se afasta mais de 30 cm da cumeeira
      let dev = 0;
      for (let j = i - K; j <= i + K; j++) dev = Math.max(dev, Math.abs((P[j][1] - c[1]) * ux - (P[j][0] - c[0]) * uz));
      const d = Math.hypot(c[0] - th.x, c[1] - th.z);
      if (dev < 0.3 && (!best || d < best.d)) best = { i, c, ux, uz, d };
    }
    const { i, c: [x, z], ux, uz } = best;
    const rot = Math.atan2(-uz, ux);
    // pavilhão, pórtico e cavaletes: sem poste de luz, árvore ou casa no meio
    const poly = rectPoly(x, z, rot, -hl - 4, hl + 4.5, -hw - 0.3, hw + 0.3);
    zones.block(poly, 0);
    zones.clearForest(poly);
    zones.place(poly, 'PAVILHÃO DA KARTOFFELFEST', 3);
    // no meio da rua, uns 45 m depois do pórtico, rumo ao centro (começo do cap. 5)
    const s = P[Math.min(P.length - 1, i + K + 20)];
    L.kartoffel = { x, z, rot, y: terrain.roadHeight(x, z), hl, hw, start: { x: s[0], z: s[1], h: Math.atan2(x - s[0], z - s[1]) } };
  }

  // ---------------- Posto Calçadão (pátio de concreto) ----------------
  // O pátio acompanha a altura das ruas (caimento suave, como num posto de verdade).
  // Plano na altura da rua mais alta, ele virava um palanque de até 1,4 m sobre o
  // terreno, com uma vala de grama entre ele e a avenida
  {
    const a = md.areas.find(x => x.n === 'Posto Calçadão');
    if (a) {
      const o = orientToRoad(ctx, polyToOBB(a.p));
      const slab = rectPoly(o.x, o.z, o.rot, -o.hx - 3, o.hx + 3, -o.hz - 2, o.hz + 2);
      terrain.addPad(slab, (x, z) => terrain.roadHeight(x, z), 5);
      L.posto = { o, slab, y: terrain.roadHeight(o.x, o.z) };
    }
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

// piso colado no relevo (polígono convexo), dy acima do terreno, e registrado como
// piso: os pés pisam na mesma altura do desenho. uv(x, z) dá a textura
function drapeFloor(B, ctx, mat, poly, dy, uv, surface = 'stone') {
  const T = ctx.terrain, up = p => [p[0], p[1] + dy, p[2]];
  T.drape(poly, (a, b, c) => B.tri(mat, up(a), up(b), up(c), uv(a[0], a[2]), uv(b[0], b[2]), uv(c[0], c[2])));
  ctx.floors.push({ poly, y: (x, z) => T.heightAt(x, z) + dy, surface });
}

// fora da pista (e da calçada) de qualquer rua?
function offRoad(ctx, x, z, m = 0.4) {
  const q = ctx.roads.index.clearance(x, z, d => d.rank >= 1);
  return !q.seg || q.d > (q.seg.data.sidewalk ? 2 : 0) + m;
}

// folga (m) entre o ponto e o obstáculo mais próximo já colocado (ignora os que
// ficam todos abaixo de yMin)
function freeGap(ctx, x, z, yMin = -Infinity) {
  let g = Infinity;
  for (const it of ctx.collision.near(x, z, 4)) {
    if (it.y1 < yMin) continue;
    let d;
    if (it.t === 'circle') d = Math.hypot(x - it.x, z - it.z) - it.r;
    else {
      const [lx, lz] = ctx.collision.constructor.local(it, x, z);
      d = Math.hypot(Math.max(Math.abs(lx) - it.hx, 0), Math.max(Math.abs(lz) - it.hz, 0));
    }
    g = Math.min(g, d);
  }
  return g;
}

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
  const res = buildChurch(B, ctx, { x: ch.x, z: ch.z, rot: ch.rot, y: ch.y, apse: false });
  const { P, W } = frame({ x: ch.x, z: ch.z, rot: ch.rot });
  const hl = CHURCH.L / 2;
  // coordenadas locais da igreja (inverso de W)
  const c = Math.cos(ch.rot), s = Math.sin(ch.rot);
  const local = (x, z) => { const dx = x - ch.x, dz = z - ch.z; return [dx * c - dz * s, dx * s + dz * c]; };
  // adro em pedra e calçada em volta, colados no relevo: perto da rua o terreno desce
  // (ela é mais baixa que a igreja) e um piso plano ficava até 75 cm acima do chão
  // onde se pisa. Cada um entra como piso, com a mesma altura do desenho
  const z0 = hl + 1.2, z1 = ch.dist - 2.5;
  const adro = [W(-11, z1), W(11, z1), W(11, z0 - 4), W(-11, z0 - 4)];
  drapeFloor(B, ctx, 'stonePath', adro, 0.02, (x, z) => { const [lx, lz] = local(x, z); return [(lx + 11) / 2, (z1 - lz) / 2]; });
  for (const side of [1, -1]) {
    const x0 = side * (CHURCH.W / 2 + 0.2), x1 = side * (CHURCH.W / 2 + 2.4);
    const a = side > 0 ? [x0, x1] : [x1, x0];
    const walk = [W(a[0], z0 - 4), W(a[1], z0 - 4), W(a[1], -hl - 2), W(a[0], -hl - 2)];
    drapeFloor(B, ctx, 'pavers', walk, 0.02, (x, z) => { const [lx, lz] = local(x, z); return [(lx - a[0]) / 2, (z0 - 4 - lz) / 2]; });
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
    for (const [p0, p1] of pieces) {
      // trechos de até 3 m acompanhando o terreno (um trecho longo afundaria na subida)
      const n = Math.max(1, Math.ceil((p1 - p0) * len / 3));
      for (let k = 0; k < n; k++) {
        const t0 = p0 + (p1 - p0) * k / n, t1 = p0 + (p1 - p0) * (k + 1) / n;
        const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, l = Math.hypot(x1 - x0, z1 - z0);
        const hs = [ctx.terrain.heightAt(x0, z0), ctx.terrain.heightAt(x1, z1), ctx.terrain.heightAt(cx, cz)];
        const y = Math.min(...hs) - 0.4, yTop = Math.max(...hs) + 1.6;
        B.box('plWhite', cx, y, cz, 0.3, yTop - y, l + 0.02, rot, { uvScale: 2, topMat: 'concreteW' });
        ctx.collision.addBox(cx, cz, 0.15, l / 2, rot, y, yTop);
      }
    }
    // pilares do portão
    if (i === gateI) {
      for (const t of [0.5 - 1.6 / len, 0.5 + 1.6 / len]) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = ctx.terrain.heightAt(x, z);
        B.box('plWhite', x, y - 0.3, z, 0.6, 2.8, 0.6, rot, { uvScale: 1 });
        pyramid(B, 'concreteW', [x, y + 2.5, z], 0.42, 0.5, rot + Math.PI / 4, 4);
        ctx.collision.addBox(x, z, 0.3, 0.3, rot, y - 0.3, y + 3.0);
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
    let top;
    if (R.chance(0.55)) {
      const h = R.range(0.6, 1.0);
      B.box('headstone', hp[0], y + 0.3, hp[2], 0.75, h, 0.14, rot, { faceUV: true });
      top = y + 0.3 + h;
    } else {
      B.box(mat, hp[0], y + 0.3, hp[2], 0.12, 1.2, 0.12, rot, { uvScale: 1 });
      B.box(mat, hp[0], y + 1.1, hp[2], 0.6, 0.12, 0.12, rot, { uvScale: 1 });
      top = y + 1.5;
    }
    B.col = [1, 1, 1];
    // túmulo inteiro é sólido (lápide/cruz incluídas); os corredores entre as fileiras ficam livres
    ctx.collision.addBox(x, z, 0.5, 1.0, rot, y - 0.3, top, { cam: false });
  }
  // cruzeiro central e ciprestes
  const y = ctx.terrain.heightAt(c[0], c[1]);
  B.box('granite', c[0], y - 0.2, c[1], 1.4, 0.8, 1.4, ang, { uvScale: 1 });
  B.box('granite', c[0], y + 0.6, c[1], 0.3, 4.2, 0.3, ang, { uvScale: 1 });
  B.box('granite', c[0], y + 3.5, c[1], 2.0, 0.3, 0.3, ang, { uvScale: 1, bottom: true });
  ctx.collision.addCircle(c[0], c[1], 1.0, y - 0.5, y + 4.8);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const x = p[0] + (c[0] - p[0]) * 0.12, z = p[1] + (c[1] - p[1]) * 0.12;
    if (freeGap(ctx, x, z) > 0.6 && ctx.trees.every(t => Math.hypot(t.x - x, t.z - z) > 1.6)) tree(ctx, 'cipreste', x, z, R.range(0.9, 1.2)); // fora dos túmulos
  }
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) / 8;
    const x = c[0] + (t - 0.5) * 80 * cs + 1.0 * sn, z = c[1] - (t - 0.5) * 80 * sn + 1.0 * cs;
    if (pointInPoly(x, z, poly) && freeGap(ctx, x, z) > 0.6 && ctx.trees.every(t => Math.hypot(t.x - x, t.z - z) > 1.6)) tree(ctx, 'cipreste', x, z, R.range(0.8, 1.1));
  }
}

function buildPraca(B, ctx, pr) {
  const R = rng(1004);
  const poly = pr.poly, T = ctx.terrain;
  // piso em espinha de peixe colado no declive: o contorno é triangulado e cada
  // triângulo recortado na malha do terreno (a mesma do chão em volta)
  const y = (x, z) => T.heightAt(x, z) + PRACA_DY;
  const up = p => [p[0], p[1] + PRACA_DY, p[2]], uv = p => [p[0] / 2.5, p[2] / 2.5];
  for (const [a, b, c] of ShapeUtils.triangulateShape(poly.map(([x, z]) => new Vector2(x, z)), [])) {
    T.drape([poly[a], poly[b], poly[c]], (p, q, r) => B.tri('herring', up(p), up(q), up(r), uv(p), uv(q), uv(r)));
  }
  ctx.floors.push({ poly, y, surface: 'stone' });
  // meio-fio acompanhando o declive, em trechos de até 1 m; onde o terreno cai
  // para fora (lado do rio) ele desce até o chão
  let u = 0;
  for (const [a, b] of outwardEdges(poly)) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    const n = Math.max(1, Math.ceil(len));
    const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const lo = ([x, z]) => Math.min(T.heightAt(x, z), T.heightAt(x + nx * 0.6, z + nz * 0.6)) - 0.12;
    const cb = B.col.map(v => v * 0.9);
    for (let k = 0; k < n; k++) {
      const p = at(k / n), q = at((k + 1) / n), u1 = u + len / n / 2;
      const yp = y(p[0], p[1]), yq = y(q[0], q[1]), lp = lo(p), lq = lo(q);
      B.quad('concreteW', [p[0], lp, p[1]], [q[0], lq, q[1]], [q[0], yq, q[1]], [p[0], yp, p[1]],
        [[u, lp / 2], [u1, lq / 2], [u1, yq / 2], [u, yp / 2]], [cb, cb, B.col, B.col]);
      u = u1;
    }
  }
  // a fonte fica numa base de pedra nivelada (o espelho d'água é plano): no lado
  // de baixo do declive a base aparece como um degrau alto
  {
    const [cx, cz] = pr.c, rim = circlePoly(cx, cz, 3.0, 12).map(([x, z]) => y(x, z));
    const top = Math.max(...rim) + 0.05, lo = Math.min(...rim) - 0.1;
    B.col = [0.92, 0.92, 0.92];
    B.cylinder('granite', cx, lo, cz, 3.0, 3.0, top - lo, 12, { cap: true, uRepeat: 6, vRepeat: (top - lo) / 2 });
    B.col = [1, 1, 1];
    fountain(B, ctx, cx, cz, top);
    ctx.collision.addCircle(cx, cz, 3.0, lo - 0.3, top + 2.6);
  }
  // canteiros de hortênsias em volta da fonte (a borda segue o declive por fora)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = pr.c[0] + Math.cos(a) * 5.2, z = pr.c[1] + Math.sin(a) * 5.2;
    if (!pointInPoly(x, z, poly)) continue;
    const rim = circlePoly(x, z, 1.3, 8).map(([px, pz]) => y(px, pz)), lo = Math.min(...rim) - 0.1, top = Math.max(...rim) + 0.35;
    B.col = [0.9, 0.9, 0.9];
    B.cylinder('granite', x, lo, z, 1.3, 1.3, top - lo, 8, { cap: true, capMat: 'dirt' });
    B.col = [1, 1, 1];
    tree(ctx, 'hortensia', x, z, 1.0);
    ctx.collision.addCircle(x, z, 1.35, lo - 0.1, top, { cam: false });
  }
  // bancos, lampiões e árvores perto da borda
  const ring = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    ring.push([p[0] + (pr.c[0] - p[0]) * 0.22, p[1] + (pr.c[1] - p[1]) * 0.22]);
  }
  // 8 vagas espaçadas por igual ao longo do anel (os cantos arredondados têm muitos
  // vértices juntos), bancos e lampiões alternados. Cada peça desliza pela borda
  // até achar lugar livre: banco com a frente desimpedida (sem canteiro, poste ou
  // árvore entre ele e a fonte), lampião a 5 m de outro
  const inside = pts => pts.every(([x, z]) => pointInPoly(x, z, poly));
  const dense = resample([...ring, ring[0]], 0.5), N = dense.length;
  const spot = (j, dr) => {
    const m = dense[((j % N) + N) % N];
    const dx = pr.c[0] - m[0], dz = pr.c[1] - m[1], l = Math.hypot(dx, dz) || 1;
    return { x: m[0] + dx / l * dr, z: m[1] + dz / l * dr, rot: Math.atan2(dx, dz) };
  };
  const lit = s => ctx.lights.every(l => Math.hypot(l[0] - s.x, l[2] - s.z) > 5);
  for (let k = 0; k < 8; k++) {
    const j0 = Math.floor(N * k / 8);
    const spots = [0, 2, -2, 4, -4, 6, -6].flatMap(dj => [0, 0.6, -0.6].map(dr => spot(j0 + dj, dr)));
    if (k % 2 === 0) {
      const s = spots.find(s => inside(boxPts(s.x, s.z, 1, 0.4, s.rot)) && benchFits(ctx, s.x, s.z, s.rot, 1.6));
      if (s) bench(B, ctx, s.x, s.z, s.rot);
    } else {
      const s = spots.find(s => inside([[s.x, s.z]]) && lit(s) && spotFree(ctx, [[s.x, s.z]], 0.7));
      if (s) lantern(B, ctx, s.x, s.z);
      // árvore entre o lampião e o próximo banco, mais perto da borda
      const t = spot(j0 + Math.round(N / 16), -1.5);
      if (inside([[t.x, t.z]]) && spotFree(ctx, [[t.x, t.z]], 1.0)) tree(ctx, k % 4 === 1 ? 'araucaria' : 'platano', t.x, t.z, R.range(0.85, 1.05));
    }
  }
  // orelhão real do OSM (fica perto da praça)
  const tel = ctx.mapdata.pois.find(p => p.k === 'telephone' && Math.hypot(p.x - pr.c[0], p.z - pr.c[1]) < 40);
  if (tel) {
    // vai para a borda da praça mais perto do ponto real, num lugar livre de
    // bancos, canteiros, postes e árvores, com o aparelho virado para a praça
    const free = ([x, z]) => pointInPoly(x, z, poly) && freeGap(ctx, x, z, y(x, z) - 0.5) > 1.4 && ctx.trees.every(t => Math.hypot(t.x - x, t.z - z) > 2.2);
    const cands = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      for (let t = 0.1; t < 1; t += 0.2) {
        const ex = a[0] + (b[0] - a[0]) * t, ez = a[1] + (b[1] - a[1]) * t;
        const dx = pr.c[0] - ex, dz = pr.c[1] - ez, l = Math.hypot(dx, dz);
        cands.push([ex + dx / l * 1.5, ez + dz / l * 1.5]);
      }
    }
    cands.sort((p, q) => Math.hypot(p[0] - tel.x, p[1] - tel.z) - Math.hypot(q[0] - tel.x, q[1] - tel.z));
    const at = cands.find(free);
    if (at) orelhao(B, ctx, at[0], at[1], Math.atan2(pr.c[0] - at[0], pr.c[1] - at[1]));
  }
  const sp = [poly[0][0] + (pr.c[0] - poly[0][0]) * 0.1, poly[0][1] + (pr.c[1] - poly[0][1]) * 0.1];
  signPost(B, ctx, sp[0], sp[1], Math.atan2(sp[0] - pr.c[0], sp[1] - pr.c[1]), signMaterial('PRAÇA 10 DE ABRIL', { bg: '#2f4a2a', fg: '#f2e8c8', w: 128, h: 24 }));
}

function buildCalcadao(B, ctx, cd) {
  const R = rng(25);
  const path = cd.path;
  const T = ctx.terrain;
  // caminho de lajotas, em faixas estreitas: cada vértice segue o terreno (a grade
  // do terreno é de 5 m e um quadrado largo afundaria nas dobras da margem)
  const hw = 1.7, ACROSS = [1, 0.5, 0, -0.5, -1];
  const V = (p, t, s, w = hw, dy = 0.12) => { const x = p[0] - t[1] * w * s, z = p[1] + t[0] * w * s; return [x, T.heightAt(x, z) + dy, z]; };
  const uv = p => [p[0] / 2, p[2] / 2];
  for (let i = 0; i < path.length - 1; i++) {
    const ta = tan(path, i), tb = tan(path, i + 1);
    const rows = [0, 0.5, 1].map(f => {
      const p = [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
      let t = [ta[0] + (tb[0] - ta[0]) * f, ta[1] + (tb[1] - ta[1]) * f]; const l = Math.hypot(t[0], t[1]) || 1; t = [t[0] / l, t[1] / l];
      return { p, t };
    });
    for (let r = 0; r < 2; r++) {
      const A = rows[r], C = rows[r + 1];
      for (let k = 0; k < ACROSS.length - 1; k++) {
        const pa = V(A.p, A.t, ACROSS[k]), pb = V(C.p, C.t, ACROSS[k]), pc = V(C.p, C.t, ACROSS[k + 1]), pd = V(A.p, A.t, ACROSS[k + 1]);
        B.quad('pavers', pa, pb, pc, pd, [uv(pa), uv(pb), uv(pc), uv(pd)]);
      }
      // bordas de concreto
      for (const s of [1, -1]) {
        const e0 = V(A.p, A.t, s), e1 = V(C.p, C.t, s), o0 = V(A.p, A.t, s, hw + 0.25, 0.15), o1 = V(C.p, C.t, s, hw + 0.25, 0.15);
        if (s > 0) B.quad('concreteW', e0, o0, o1, e1, [[0, 0], [0.2, 0], [0.2, 1], [0, 1]]);
        else B.quad('concreteW', e1, o1, o0, e0, [[0, 0], [0.2, 0], [0.2, 1], [0, 1]]);
      }
    }
  }
  // o caminho fica 12 cm acima do terreno (15 na borda): entra no chão de quem anda
  // nele, senão os pés afundam nas lajotas
  ctx.walkways.addPolyline(path, { hw, dy: 0.12, edge: 0.25, edgeDy: 0.15 });
  // passarela de madeira onde o caminho cruza o rio (sem ela o caminho afunda na água)
  const wet = p => { const w = T.waterAt(p[0], p[1]); return w && w.river.width > 5 && T.heightAt(p[0], p[1]) < w.level + 0.2 ? w : null; };
  for (let i = 1; i < path.length - 1; i++) {
    if (!wet(path[i]) || wet(path[i - 1])) continue;
    let j = i;
    while (j < path.length - 1 && wet(path[j])) j++;
    footbridge(B, ctx, path, i - 1, j, wet(path[i]).level);
    i = j;
  }
  // guarda-corpo na margem do rio
  const bankRail = cd.bank.map((p, i) => {
    const e = cd.edge[i];
    const dx = e[0] - p[0], dz = e[1] - p[1], l = Math.hypot(dx, dz);
    return [p[0] + dx / l * 1.2, p[1] + dz / l * 1.2];
  });
  // interrompe onde a praça (piso elevado) avança sobre a margem e onde cruza
  // uma rua ou a calçada dela (senão o guarda-corpo atravessa a ponte)
  const onRoad = (x, z) => { const q = ctx.roads.index.clearance(x, z, d => d.rank >= 2); return q.seg && q.d < (q.seg.data.sidewalk ? 2 : 0) + 0.8; };
  const runs = [[]];
  for (const p of chaikin(bankRail, 2)) {
    if (pointInPoly(p[0], p[1], ctx.landmarks.praca.poly) || onRoad(p[0], p[1])) { if (runs[runs.length - 1].length) runs.push([]); }
    else runs[runs.length - 1].push(p);
  }
  for (const r of runs) if (r.length > 1) railing(B, ctx, r);
  // ---------- o que fica ao lado do caminho ----------
  // Nada em cima do caminho e nada encaixado em outra peça: as peças grandes
  // entram primeiro (letreiro, monumento, placas, parada) e o mobiliário desvia
  // delas. Banco só com a frente desimpedida até o caminho, sem poste, lixeira,
  // canteiro ou grade entre ele e quem passa.
  const EDGE = hw + 0.25;                                   // meia largura com o meio-fio
  const pathD = (x, z) => nearestOnPolyline(path, x, z).d;
  const offPath = (pts, m) => pts.every(([x, z]) => pathD(x, z) > EDGE + m);
  const inStrip = pts => pts.every(([x, z]) => pointInPoly(x, z, cd.strip) && offRoad(ctx, x, z, 0.6));
  // ponto ao lado do caminho: vértice i, lado s (1 ou -1), d m do eixo, u m adiante
  const beside = (i, s, d, u = 0) => { const t = tan(path, i), p = path[i]; return [p[0] - t[1] * s * d + t[0] * u, p[1] + t[0] * s * d + t[1] * u]; };
  const facing = (i, s) => { const t = tan(path, i); return Math.atan2(t[1] * s, -t[0] * s); };   // virado para o caminho
  const nearIdx = q => nearestOnPolyline(path, q[0], q[1]).i;
  // lado do rio no vértice i
  const riverSide = i => { const a = beside(i, 1, 4), b = beside(i, -1, 4); return ctx.rivers.index.nearest(a[0], a[1]).d < ctx.rivers.index.nearest(b[0], b[1]).d ? 1 : -1; };
  const ring = (x, z, r, n = 12) => [[x, z], ...circlePoly(x, z, r, n)];
  const clamp = i => Math.max(1, Math.min(path.length - 2, i));
  // a melhor posição entre os candidatos (menor nota) que passa no teste
  const pick = (cands, test) => cands.sort((a, b) => a.score - b.score).find(test) || null;

  // letreiro TEEWALD perto da praça: do lado do rio, de frente para o caminho (e
  // para a avenida do outro lado); a frente fica livre para a foto
  {
    const pi = nearIdx(cd.bank[Math.floor(cd.bank.length * 0.22)]);
    const cands = [];
    for (let i = clamp(pi - 14); i <= clamp(pi + 14); i++) for (const s of [1, -1]) for (const g of [0.5, 0.8, 1.2, 1.7, 2.3]) {
      const d = EDGE + 0.7 + g;
      cands.push({ i, s, d, score: Math.abs(i - pi) * 0.5 + g + (s === riverSide(i) ? 0 : 4) });
    }
    const box = c => { const q = beside(c.i, c.s, c.d); return { q, rot: facing(c.i, c.s), pts: boxPts(q[0], q[1], 6.5, 0.7, facing(c.i, c.s)) }; };
    const c = pick(cands, c => { const { q, pts } = box(c); return inStrip(pts) && offPath(pts, 0.3) && spotFree(ctx, pts, 0.3) && groundOk(ctx, pts, ctx.surfaceAt(q[0], q[1]), 0.5); });
    if (c) {
      const { q, rot } = box(c);
      letreiro(B, ctx, q[0], q[1], rot, 'TEEWALD');
      // da frente das letras até 2 m depois do caminho: nada de poste ou árvore na foto
      const f = beside(c.i, c.s, (c.d - 0.7 - EDGE - 2) / 2);
      reserve(ctx, f[0], f[1], 6.5, (c.d - 0.7 + EDGE + 2) / 2, rot);
      ctx.landmarks.letreiro = { x: q[0], z: q[1], rot };
    } else {
      console.warn('Teewald: letreiro sem lugar livre no calçadão');
      const b = cd.bank[Math.floor(cd.bank.length * 0.22)];
      ctx.landmarks.letreiro = { x: b[0], z: b[1], rot: 0 };
    }
  }
  // Monumento ao Imigrante, na ponta sul, perto do acesso à cidade: a base
  // redonda (3,2 m) fica ao lado do caminho, sem invadi-lo
  {
    const pi = nearIdx(cd.bank[Math.floor(cd.bank.length * 0.82)]);
    const cands = [];
    for (let i = clamp(pi - 12); i <= clamp(pi + 12); i++) for (const s of [1, -1]) for (const g of [0.5, 1, 1.6, 2.4]) cands.push({ i, s, d: EDGE + 3.2 + g, score: Math.abs(i - pi) * 0.5 + g });
    const c = pick(cands, c => {
      const q = beside(c.i, c.s, c.d), pts = ring(q[0], q[1], 3.3);
      return inStrip(pts) && offPath(pts, 0.3) && spotFree(ctx, pts, 0.3) && groundOk(ctx, pts, ctx.surfaceAt(q[0], q[1]), 0.6);
    });
    const q = c ? beside(c.i, c.s, c.d) : cd.bank[Math.floor(cd.bank.length * 0.82)];
    monumento(B, ctx, q[0], q[1], c ? facing(c.i, c.s) : 0);
    ctx.landmarks.monumento = { x: q[0], z: q[1] };
    if (!c) console.warn('Teewald: monumento sem lugar livre no calçadão');
    // placa ao lado (não na frente) do monumento, de frente para o caminho
    const toPath = c ? facing(c.i, c.s) : 0, sc = [];
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2, off = Math.abs(Math.atan2(Math.sin(ang - toPath), Math.cos(ang - toPath)));
      if (off < 0.9 || off > 2.2) continue;   // nem entre o monumento e o caminho, nem atrás dele
      const x = q[0] + Math.sin(ang) * 4.6, z = q[1] + Math.cos(ang) * 4.6;
      sc.push({ x, z, score: pathD(x, z) });
    }
    const rotTo = s => { const n = nearestOnPolyline(path, s.x, s.z); return Math.atan2(n.x - s.x, n.z - s.z); };
    const s = pick(sc, s => { const pts = boxPts(s.x, s.z, 0.95, 0.15, rotTo(s)); return inStrip(pts) && offPath(pts, 0.4) && spotFree(ctx, pts, 0.25); });
    if (s) signPost(B, ctx, s.x, s.z, rotTo(s), signMaterial('MONUMENTO AO IMIGRANTE', { bg: '#3a2a1a', fg: '#f0e0c0', w: 128, h: 24, sub: '1847 - 2017' }));
  }
  // placa do calçadão no começo do caminho
  {
    const cands = [];
    for (let i = 2; i < Math.min(14, path.length - 1); i++) for (const s of [1, -1]) cands.push({ i, s, score: i });
    const c = pick(cands, c => { const q = beside(c.i, c.s, EDGE + 0.6), pts = boxPts(q[0], q[1], 0.95, 0.15, facing(c.i, c.s)); return inStrip(pts) && spotFree(ctx, pts, 0.25); });
    if (c) { const q = beside(c.i, c.s, EDGE + 0.6); signPost(B, ctx, q[0], q[1], facing(c.i, c.s), signMaterial('CALÇADÃO DO RIO CADEIA', { bg: '#2f4a2a', fg: '#f2e8c8', w: 128, h: 24 })); }
  }
  // parada de ônibus na beira da avenida, no meio do calçadão, de frente para a rua
  {
    const mid = Math.floor(cd.edge.length * 0.5), cands = [];
    for (let i = Math.max(0, mid - 10); i <= Math.min(cd.edge.length - 1, mid + 10); i++) for (const back of [1.4, 1.8, 2.3]) cands.push({ i, back, score: Math.abs(i - mid) + back });
    const at = c => {
      const e = cd.edge[c.i], b = cd.bank[c.i], dx = e[0] - b[0], dz = e[1] - b[1], l = Math.hypot(dx, dz);
      return { x: e[0] - dx / l * c.back, z: e[1] - dz / l * c.back, rot: Math.atan2(dx, dz) };
    };
    const c = pick(cands, c => { const a = at(c), pts = boxPts(a.x, a.z, 1.8, 1.0, a.rot); return pts.every(([x, z]) => pointInPoly(x, z, cd.strip)) && offPath(pts, 0.3) && spotFree(ctx, pts, 0.2); });
    if (c) { const a = at(c); busStop(B, ctx, a.x, a.z, a.rot); }
  }

  // ---------- mobiliário a cada ~9 m, lados alternados ----------
  // Onde há banco, o lampião vai para o outro lado do caminho (iluminando o
  // banco); a lixeira fica ao lado do banco e a hortênsia atrás dele.
  const U = [0, 1, -1, 2, -2, 3, -3];
  const tryAt = (i, s, ds, us, test) => { for (const u of us) for (const d of ds) { const q = beside(i, s, d, u); if (test(q, d, u)) return { q, d, u }; } return null; };
  const small = r => q => inStrip([q]) && pathD(q[0], q[1]) > EDGE + r + 0.3 && spotFree(ctx, [q], r + 0.25) && groundOk(ctx, [q], ctx.surfaceAt(q[0], q[1]));
  const treeOk = t => q => { const r = treeRadius({ t }); return pathD(q[0], q[1]) > EDGE + r + 0.2 && offRoad(ctx, q[0], q[1], r + 0.4) && spotFree(ctx, [q], r + 0.3); };
  const benchOk = (i, s) => q => {
    const rot = facing(i, s), body = boxPts(q[0], q[1], 1.05, 0.4, rot);
    return inStrip(body) && offPath(body, 0.4) && benchFits(ctx, q[0], q[1], rot, Math.max(0.8, pathD(q[0], q[1]) - 0.3 - EDGE + 0.1));
  };
  let acc = 0, k = 0;
  for (let i = 1; i < path.length - 1; i++) {
    acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (acc < 9) continue;
    acc = 0; k++;
    const t = tan(path, i);
    const side = k % 2 ? 1 : -1;
    let seat = null;
    if (k % 3 === 1) {
      seat = tryAt(i, side, [2.9, 3.3], U, benchOk(i, side));
      if (seat) {
        bench(B, ctx, seat.q[0], seat.q[1], facing(i, side));
        if (k % 2 === 1) { const b = tryAt(i, side, [seat.d], [seat.u + 1.65, seat.u - 1.65], small(0.3)); if (b) bin(B, ctx, b.q[0], b.q[1]); }
        if (R.chance(0.6)) { const h = tryAt(i, side, [seat.d + 1.45], [seat.u], treeOk('hortensia')); if (h) tree(ctx, 'hortensia', h.q[0], h.q[1], 0.9); }
      }
    }
    if (k % 2 === 0 || seat) {
      const l = tryAt(i, seat ? -side : side, [2.6, 2.9], U, small(0.2));
      if (l) lantern(B, ctx, l.q[0], l.q[1]);
    }
    if (!seat && k % 7 === 3) { const b = tryAt(i, side, [3.0], U, small(0.3)); if (b) bin(B, ctx, b.q[0], b.q[1]); }
    if (k % 9 === 5) {
      const rot = Math.atan2(t[0], t[1]);
      const m = tryAt(i, -side, [6, 5.2, 7], U, q => {
        const pts = boxPts(q[0], q[1], 1.0, 1.0, rot);
        return inStrip(pts) && offPath(pts, 0.6) && spotFree(ctx, boxPts(q[0], q[1], 1.4, 1.6, rot), 0.2) && groundOk(ctx, pts, ctx.surfaceAt(q[0], q[1]));
      });
      if (m) picnicTable(B, ctx, m.q[0], m.q[1], rot);
    }
    // árvores: plátanos em fila, araucárias em grupos (fora da frente dos bancos)
    const tt = k % 4 === 0 ? 'araucaria' : 'platano';
    const tq = tryAt(i, side, [5.5 + R.range(0, 2)], [0, 1.5, -1.5], treeOk(tt));
    if (tq) tree(ctx, tt, tq.q[0], tq.q[1], R.range(0.85, 1.15));
    if (R.chance(0.6)) {
      const t2 = R.chance(0.25) ? 'araucaria' : R.chance(0.5) ? 'platano' : 'nativa';
      const q2 = tryAt(i, -side, [4.5 + R.range(0, 3)], [0, 1.5, -1.5], treeOk(t2));
      if (q2) tree(ctx, t2, q2.q[0], q2.q[1], R.range(0.8, 1.1));
    }
    if (!seat && R.chance(0.35)) { const h = tryAt(i, side, [3.4], [R.range(-1, 1), 1.5, -1.5], treeOk('hortensia')); if (h) tree(ctx, 'hortensia', h.q[0], h.q[1], 0.9); }
  }
}

// passarela entre os pontos a e b do caminho: tabuleiro caminhável e guarda-corpos
function footbridge(B, ctx, path, a, b, level) {
  const T = ctx.terrain, w = 1.4;
  const ya = T.heightAt(path[a][0], path[a][1]) + 0.06, yb = T.heightAt(path[b][0], path[b][1]) + 0.06;
  const L = [];
  for (let i = a; i < b; i++) L.push(Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]));
  const tot = L.reduce((s, v) => s + v, 0);
  let acc = 0;
  for (let i = a; i < b; i++) {
    const p = path[i], q = path[i + 1], len = L[i - a];
    const t = (acc + len / 2) / tot; acc += len;
    const y = Math.max(ya + (yb - ya) * t, level + 0.45);
    const cx = (p[0] + q[0]) / 2, cz = (p[1] + q[1]) / 2, rot = Math.atan2(q[0] - p[0], q[1] - p[1]);
    B.box('woodPlank', cx, y - 0.2, cz, w * 2, 0.2, len + 0.05, rot, { uvScale: 1 });
    ctx.collision.addBox(cx, cz, w, len / 2, rot, y - 0.2, y, { walk: true, cam: false });
    for (const s of [1, -1]) {
      const ox = Math.cos(rot) * w * s, oz = -Math.sin(rot) * w * s;
      B.box('woodDark', cx + ox, y, cz + oz, 0.1, 1.0, len + 0.05, rot, { uvScale: 1 });
      ctx.collision.addBox(cx + ox, cz + oz, 0.08, len / 2, rot, y - 0.2, y + 1.0, { cam: false });
    }
  }
}

const tan = (P, i) => {
  const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};

function buildField(B, ctx, f) {
  // gramado listrado e linhas brancas, num retângulo dentro do polígono
  const ang = f.ang;
  const { P } = frame({ x: f.c[0], z: f.c[1], rot: ang });
  const hl = 44, hw = 27, y = f.y + 0.05;
  B.quad('field', P(-hw - 3, y, -hl - 3), P(-hw - 3, y, hl + 3), P(hw + 3, y, hl + 3), P(hw + 3, y, -hl - 3), [[0, 0], [0, 8], [5, 8], [5, 0]], null, 6);
  // o gramado fica 5 cm acima do terreno aplainado
  ctx.floors.push({ poly: [P(-hw - 3, 0, -hl - 3), P(-hw - 3, 0, hl + 3), P(hw + 3, 0, hl + 3), P(hw + 3, 0, -hl - 3)].map(p => [p[0], p[2]]), y, surface: 'grass' });
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
    const t = P(0, 0, s * hl); B.box('concreteW', t[0], y + 2.38, t[2], 7.44, 0.12, 0.12, ang, { uvScale: 1, bottom: true });
  }
  // arquibancada simples num lado
  for (let i = 0; i < 4; i++) {
    const p = P(hw + 5 + i * 0.8, 0, 0);
    B.box('concrete', p[0], y - 0.3, p[2], 0.8, 0.5 + i * 0.4, 30, ang, { uvScale: 2 });
    // cada degrau é um piso (0,4 m de um para o outro: dá para subir)
    ctx.collision.addBox(p[0], p[2], 0.4, 15, ang, y - 0.3, y + 0.2 + i * 0.4, { walk: true, cam: false });
  }
}

// Pavilhão de lona da Kartoffelfest em cima da Rua Benno Closs: postes de alumínio,
// lona listrada com bambinela, bandeirolas e varais de lâmpadas; palco das bandinhas,
// mesas compridas com toalha xadrez, Kartoffelhaus e chope. Pórtico enxaimel na ponta
// do centro e cavaletes fechando a rua nas duas pontas (só se entra a pé). A festa
// deste ano foi cancelada: a faixa CANCELADA está colada por cima dos letreiros
function buildKartoffel(B, ctx, k) {
  const { P, W } = frame(k);
  const { hl, hw, rot } = k, col = ctx.collision;
  const S = (lx, lz) => { const [x, z] = W(lx, lz); return ctx.surfaceAt(x, z); };
  const EAVE = 3.5, RISE = 1.9, OVER = 0.45, DROP = OVER * RISE / hw;
  // placa num plano vertical: centro (lx, y, lz), r = direita de quem olha a placa
  // ([0, -1] = virada para +x local, [1, 0] = para +z), largura, altura e giro no plano
  const plate = (mat, lx, y, lz, r, w, h, ang = 0) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const at = (a, b) => { const ra = a * c - b * s; return P(lx + r[0] * ra, y + a * s + b * c, lz + r[1] * ra); };
    B.quad(mat, at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2));
  };
  const cancel = signMaterial('CANCELADA', { bg: '#efe9da', fg: '#a01818', w: 96, h: 20, borderColor: '#a01818' });
  const notice = signMaterial('COMUNICADO', { bg: '#f2eee2', fg: '#2a2a2a', w: 96, h: 64, border: false, sub: 'Festa cancelada este ano' });
  B.col = [1, 1, 1];

  // ---- estrutura: tesouras a cada 6 m, cada uma na altura do chão dela ----
  const xs = [];
  for (let lx = -hl; lx <= hl + 0.01; lx += 6) xs.push(lx);
  const eave = xs.map(lx => Math.max(S(lx, -hw), S(lx, hw)) + EAVE);
  const eaveAt = lx => { const t = Math.min(xs.length - 1.001, Math.max(0, (lx + hl) / 6)), i = Math.floor(t); return eave[i] + (eave[i + 1] - eave[i]) * (t - i); };
  xs.forEach((lx, i) => {
    const e = eave[i];
    for (const s of [-1, 1]) {
      const [x, z] = W(lx, s * hw), y0 = S(lx, s * hw);
      B.box('metalWhite', x, y0, z, 0.12, e - y0, 0.12, rot, { uvScale: 1 });
      B.box('concrete', x, y0 - 0.05, z, 0.45, 0.25, 0.45, rot, { uvScale: 1 });   // peso no pé do poste
      col.addBox(x, z, 0.12, 0.12, rot, y0, e);
      tube(B, 'metalWhite', P(lx, e, s * hw), P(lx, e + RISE, 0), 0.05);         // caibro
    }
    tube(B, 'metalWhite', P(lx, e - 0.05, -hw), P(lx, e - 0.05, hw), 0.04);       // tirante
  });
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], e0 = eave[i], e1 = eave[i + 1];
    tube(B, 'metalWhite', P(x0, e0 + RISE, 0), P(x1, e1 + RISE, 0), 0.05);
    for (const s of [1, -1]) {
      const [a0, a1] = s > 0 ? [x0, x1] : [x1, x0], [f0, f1] = s > 0 ? [e0, e1] : [e1, e0], ez = s * (hw + OVER);
      tube(B, 'metalWhite', P(x0, e0, s * hw), P(x1, e1, s * hw), 0.04);
      // lona: gomos de 1 m da beirada à cumeeira; bambinela pendurada na aba
      B.quad('awnLona', P(a0, f0 - DROP, ez), P(a1, f1 - DROP, ez), P(a1, f1 + RISE, 0), P(a0, f0 + RISE, 0),
        [[a0 / 2, 0], [a1 / 2, 0], [a1 / 2, 1], [a0 / 2, 1]]);
      B.quad('awnValance', P(a0, f0 - DROP - 0.42, ez), P(a1, f1 - DROP - 0.42, ez), P(a1, f1 - DROP, ez), P(a0, f0 - DROP, ez),
        [[a0 / 2, 0], [a1 / 2, 0], [a1 / 2, 1], [a0 / 2, 1]]);
    }
  }
  // oitões fechados de lona, com a faixa da festa (e a de papel por cima)
  const banner = signMaterial('KARTOFFELFEST', { bg: '#7a4a1a', fg: '#ffe9a0', w: 128, h: 24, sub: 'Festa da Batata' });
  for (const [i, s] of [[0, -1], [xs.length - 1, 1]]) {
    const lx = xs[i] + s * 0.02, e = eave[i], za = s * hw, r = [0, -s];
    B.tri('awnLona', P(lx, e, za), P(lx, e, -za), P(lx, e + RISE, 0), [za / 2, 0], [-za / 2, 0], [0, 1]);
    B.quad('awnValance', P(lx, e - 0.42, za), P(lx, e - 0.42, -za), P(lx, e, -za), P(lx, e, za), [[0, 0], [hw, 0], [hw, 1], [0, 1]]);
    plate(banner, lx + s * 0.03, e - 0.95, 0, r, 6.4, 1.1);
    plate(cancel, lx + s * 0.06, e - 0.9, 0.5, r, 3.2, 0.5, 0.2);
  }

  // ---- bandeirolas e varais de lâmpadas (acendem à noite: o Seu Ivo não fica no escuro) ----
  const flagLine = (a, b, sag) => {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2];
    for (const [p, q] of [[a, m], [m, b]]) {
      const u = Math.hypot(q[0] - p[0], q[2] - p[2]) / 3;
      B.quad('flags', P(p[0], p[1], p[2]), P(q[0], q[1], q[2]), P(q[0], q[1] - 0.5, q[2]), P(p[0], p[1] - 0.5, p[2]), [[0, 1], [u, 1], [u, 0], [0, 0]]);
    }
  };
  for (const lz of [-2.7, 0, 2.7]) for (let i = 0; i < xs.length - 1; i++) flagLine([xs[i], eave[i] + 0.2, lz], [xs[i + 1], eave[i + 1] + 0.2, lz], 0.35);
  for (let i = 1; i < xs.length - 1; i++) flagLine([xs[i], eave[i] + 0.05, -hw], [xs[i], eave[i] + 0.05, hw], 0.3);
  for (const lz of [-1.35, 1.35]) {
    for (let i = 0; i < xs.length - 1; i++) tube(B, 'iron', P(xs[i], eave[i] + 0.8, lz), P(xs[i + 1], eave[i + 1] + 0.8, lz), 0.012);
    for (let lx = -hl + 0.75; lx < hl; lx += 1.5) { const p = P(lx, eaveAt(lx) + 0.62, lz); B.box('lampLens', p[0], p[1], p[2], 0.1, 0.14, 0.1, rot, { uvScale: 1, bottom: true }); }
  }
  for (const lx of [-9, 0, 9]) ctx.lights?.push(P(lx, eaveAt(lx) + 0.6, 0));

  // ---- palco das bandinhas, na ponta de baixo ----
  {
    const x0 = -hl + 0.4, x1 = -hl + 4.6, zz = hw - 1.0, cx = (x0 + x1) / 2;
    const g = [[x0, -zz], [x1, -zz], [x1, zz], [x0, zz]].map(([a, b]) => S(a, b));
    const top = Math.max(...g) + 0.75, low = Math.min(...g) - 0.1, c = P(cx, 0, 0);
    B.box('woodPlank', c[0], low, c[2], x1 - x0, top - low, zz * 2, rot, { uvScale: 2 });
    col.addBox(c[0], c[2], (x1 - x0) / 2, zz, rot, low, top, { walk: true });
    // degraus no meio da frente (até 0,38 m cada: dá para subir)
    const fy = S(x1 + 0.5, 0), n = Math.max(1, Math.ceil((top - fy) / 0.38) - 1);
    for (let j = 1; j <= n; j++) {
      const sy = top - (top - fy) * j / (n + 1), p = P(x1 + 0.2 + (j - 1) * 0.4, 0, 0);
      B.box('woodPlank', p[0], fy - 0.1, p[2], 0.4, sy - fy + 0.1, 2.4, rot, { uvScale: 1 });
      col.addBox(p[0], p[2], 0.2, 1.2, rot, fy - 0.1, sy, { walk: true });
    }
    // fundo com o letreiro, caixas de som e cadeiras empilhadas
    const b = P(x0 + 0.05, 0, 0);
    B.box('woodDark', b[0], top, b[2], 0.1, 2.6, zz * 2, rot, { uvScale: 2 });
    col.addBox(b[0], b[2], 0.05, zz, rot, top, top + 2.6);
    plate(signMaterial('KARTOFFELFEST', { bg: '#7a4a1a', fg: '#ffe9a0', w: 128, h: 40, sub: 'BANDINHAS · TEEWALD' }), x0 + 0.11, top + 1.55, 0, [0, -1], 5.0, 1.56);
    for (const s of [-1, 1]) {
      const p = P(x1 - 0.45, 0, s * (zz - 0.45));
      B.box('iron', p[0], top, p[2], 0.6, 1.15, 0.6, rot, { uvScale: 1 });
      col.addBox(p[0], p[2], 0.3, 0.3, rot, top, top + 1.15);
      const q = P(x0 + 0.6, 0, s * (zz - 0.6));
      for (let j = 0; j < 6; j++) B.box('metalWhite', q[0], top + j * 0.13, q[2], 0.45, 0.13, 0.45, rot + j * 0.04, { uvScale: 1 });
    }
  }

  // ---- mesas compridas (duas fileiras, toalha xadrez) ----
  for (const lz of [-2.1, 2.1]) for (let j = 0; j < 6; j++) {
    const lx = -8.5 + j * 2, [x, z] = W(lx, lz), y = ctx.surfaceAt(x, z) + 0.785;
    picnicTable(B, ctx, x, z, rot);
    B.quad('tablecloth', P(lx - 0.98, y, lz - 0.44), P(lx - 0.98, y, lz + 0.44), P(lx + 0.98, y, lz + 0.44), P(lx + 0.98, y, lz - 0.44), [[0, 0], [0, 1], [2, 1], [2, 0]]);
  }
  // banco onde a rainha da festa espera (de frente para a mesa)
  { const [x, z] = W(-6.5, 2.85); (ctx.seats ||= []).push({ x, z, rot: rot + Math.PI, y: ctx.surfaceAt(x, z), seat: 0.47, kind: 'festa' }); }

  // ---- barracas: Kartoffelhaus (+z) e chope (-z), viradas para o meio ----
  const sack = (lx, lz, a = 0) => { const [x, z] = W(lx, lz); B.box('sack', x, S(lx, lz), z, 0.5, 0.62, 0.36, rot + a, { uvScale: 1, topMat: 'potatoes' }); };
  const crate = (lx, lz, y, a = 0) => { const [x, z] = W(lx, lz); B.box('woodPlank', x, y, z, 0.6, 0.34, 0.45, rot + a, { uvScale: 1, topMat: 'potatoes' }); };
  for (const [s, title, sub, bg] of [[1, 'KARTOFFELHAUS', 'batata recheada · Kartoffelpuffer', '#3a2a1a'], [-1, 'CHOPE', 'Bier · Schnaps', '#1f3f2a']]) {
    const x0 = 8.6, x1 = 11.4, cx = (x0 + x1) / 2, zf = s * 3.3, y = S(cx, zf), c = P(cx, 0, zf);
    B.box('woodPlank', c[0], y, c[2], x1 - x0, 1.0, 0.6, rot, { uvScale: 1 });
    B.box('woodDark', c[0], y + 1.0, c[2], x1 - x0 + 0.1, 0.05, 0.7, rot, { uvScale: 1 });
    col.addBox(c[0], c[2], (x1 - x0) / 2, 0.3, rot, y, y + 1.05);
    for (const lx of [x0, x1]) { const p = P(lx, 0, zf); B.box('woodDark', p[0], S(lx, zf), p[2], 0.1, 2.55, 0.1, rot, { uvScale: 1 }); }
    B.box('woodDark', c[0], y + 2.05, c[2], x1 - x0 + 0.1, 0.5, 0.06, rot, { uvScale: 1 });
    plate(signMaterial(title, { bg, fg: '#f0e0c0', w: 128, h: 24, sub }), cx, y + 2.3, zf - s * 0.04, [-s, 0], x1 - x0 - 0.1, 0.46);
    const zb = s * 4.5;
    if (s > 0) {
      // sacos e caixas de batata; panela da sopa da Dona Gertrud no fogareiro
      sack(8.9, zb, 0.2); sack(8.9, zb + 0.45 * s, -0.3); sack(9.4, zb + 0.3 * s, 0.1);
      crate(11.0, zb + 0.2 * s, S(11.0, zb)); crate(11.0, zb + 0.2 * s, S(11.0, zb) + 0.34, 0.15);
      const p = P(11.0, 0, zb - 0.55 * s), py = S(11.0, zb - 0.55 * s);
      B.box('iron', p[0], py, p[2], 0.45, 0.7, 0.45, rot, { uvScale: 1 });
      B.cylinder('metalGray', p[0], py + 0.7, p[2], 0.3, 0.3, 0.38, 8, { cap: true, capMat: 'iron' });
      col.addBox(...W(9.15, zb + 0.15 * s), 0.45, 0.45, rot, y, y + 0.7);
      col.addBox(...W(11.0, zb), 0.35, 0.75, rot, y, y + 1.1);
    } else {
      // barris de chope e engradados
      for (const [lx, dz] of [[8.9, 0], [9.4, 0.25], [8.95, 0.55]]) { const [x, z] = W(lx, zb + dz * s); B.cylinder('metalGray', x, S(lx, zb), z, 0.22, 0.22, 0.6, 8, { cap: true, capMat: 'metalGray' }); }
      for (let j = 0; j < 3; j++) { const [x, z] = W(11.0, zb); B.box('woodDark', x, S(11.0, zb) + j * 0.3, z, 0.55, 0.3, 0.4, rot + j * 0.08, { uvScale: 1 }); }
      col.addBox(...W(9.15, zb + 0.25 * s), 0.5, 0.5, rot, y, y + 0.7);
      col.addBox(...W(11.0, zb), 0.32, 0.25, rot, y, y + 0.9);
    }
  }
  // batata direto do produtor, na entrada
  for (const s of [-1, 1]) {
    for (const [lx, dz, a] of [[15.4, 0, 0.1], [15.9, 0.3, -0.2], [16.4, 0, 0.3], [15.65, 0.65, 0]]) sack(lx, s * (4.3 - dz), a);
    col.addBox(...W(15.9, s * 4.0), 0.75, 0.55, rot, S(15.9, s * 4.0), S(15.9, s * 4.0) + 0.65);
  }
  { const [x, z] = W(14.6, 4.6); signPost(B, ctx, x, z, rot + Math.PI / 2, signMaterial('BATATA DO PRODUTOR', { bg: '#e8dcc0', fg: '#4a2a18', w: 128, h: 24, sub: 'saco de 25 kg' }), 1.4, 0.4); }

  // ---- pórtico enxaimel na ponta do centro ----
  {
    const lx = hl + 1.3, tz = hw - 0.6, TH = 4.4, tops = [];
    for (const s of [-1, 1]) {
      const [x, z] = W(lx, s * tz), y0 = S(lx, s * tz);
      B.box('enxCreme', x, y0, z, 0.9, TH, 0.9, rot, { uvScale: 2.2 });
      col.addBox(x, z, 0.45, 0.45, rot, y0, y0 + TH);
      pyramid(B, 'roofClay', [x, y0 + TH, z], 0.78, 1.1, -rot + Math.PI / 4, 4);
      plate(notice, lx + 0.46, y0 + 1.6, s * tz, [0, -1], 0.6, 0.42, s * 0.05);
      tops.push(y0 + TH);
    }
    const yb = Math.min(...tops) - 0.95, c = P(lx, 0, 0), w = tz * 2 - 0.9;
    B.box('woodDark', c[0], yb, c[2], 0.3, 0.8, w, rot, { uvScale: 1, bottom: true });
    const sign = signMaterial('KARTOFFELFEST', { bg: '#3a2a1a', fg: '#f0d890', w: 128, h: 24, sub: 'Festa da Batata · Teewald' });
    plate(sign, lx + 0.16, yb + 0.4, 0, [0, -1], w - 0.2, 0.7);
    plate(sign, lx - 0.16, yb + 0.4, 0, [0, 1], w - 0.2, 0.7);
    plate(cancel, lx + 0.19, yb + 0.42, -0.9, [0, -1], 2.6, 0.42, 0.18);
  }
  // aviso no primeiro poste da outra ponta
  plate(notice, -hl - 0.07, S(-hl, -hw) + 1.6, -hw, [0, 1], 0.6, 0.42, -0.04);

  // ---- cavaletes fechando a rua nas duas pontas: três por ponta, com vão para pedestre ----
  const closed = signMaterial('RUA FECHADA', { bg: '#f4f0e8', fg: '#a01818', w: 128, h: 32, sub: 'ENTRADA SÓ A PÉ' });
  for (const [lx, s] of [[-hl - 2.5, -1], [hl + 3.6, 1]]) for (const lz of [-2.45, 0, 2.45]) {
    const [x, z] = W(lx, lz), y = S(lx, lz);
    for (const e of [-0.7, 0.7]) for (const f of [-0.14, 0.14]) { const p = P(lx + f, 0, lz + e); B.box('woodGray', p[0], y, p[2], 0.05, 1.12, 0.05, rot, { uvScale: 1 }); }
    B.box('barrier', x, y + 0.92, z, 0.05, 0.22, 1.6, rot, { faceUV: true });
    B.box('barrier', x, y + 0.45, z, 0.05, 0.16, 1.6, rot, { faceUV: true });
    col.addBox(x, z, 0.16, 0.8, rot, y, y + 1.15);
    if (lz === 0) { plate(closed, lx + s * 0.04, y + 1.42, 0, [0, -s], 1.1, 0.42); plate(closed, lx - s * 0.04, y + 1.42, 0, [0, s], 1.1, 0.42); }
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
  // primeiro tenta o contorno real do prédio mais próximo
  if (ctx.footprints?.length) {
    const f = claimFootprint(ctx, x, z, 22, extra.minArea ?? 40);
    const o = f && fitBox(ctx, orientFP(ctx, f));
    if (o && !ctx.zones.overlapsBuilding(o, -0.4) && !ctx.zones.obbBlocked(o)) {
      const spec = makeSpec(R, style, o.x, o.z, o.rot, o.hx * 2, o.hz * 2, extra);
      spec.w = Math.min(spec.w, o.hx * 2); spec.d = Math.min(spec.d, o.hz * 2);
      ctx.zones.addBuilding({ x: o.x, z: o.z, hx: spec.w / 2, hz: spec.d / 2, rot: o.rot });
      return spec;
    }
  }
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
    Object.assign(s, { wall: 'enxBranco', floors: 2, roofType: 'gableFront', sign: sign('MUSEU', { bg: '#3a2a1a', fg: '#f0e0c0', sub: 'Prof. Laurindo Vier' }), signY: undefined, signH: 0.6 });
    ctx.zones.addBuilding({ x: o.x, z: o.z, hx: s.w / 2, hz: s.d / 2, rot: o.rot });
    add(s);
  }
  // Comércio da praça (TEEWALD STORE)
  {
    const a = md.areas.find(x => x.k === 'building' && !x.n && Math.hypot(polyCentroid(x.p)[0] + 165, polyCentroid(x.p)[1] - 30) < 15);
    if (a) {
      const o = orientToRoad(ctx, polyToOBB(a.p));
      const s = makeSpec(R, 'commercial', o.x, o.z, o.rot, Math.max(o.hx * 2, 10), Math.max(o.hz * 2, 10), { floors: 2, sign: sign('TEEWALD STORE', { bg: '#7a1c16', fg: '#f6eed8' }) });
      s.signH = 0.9; s.awning = 'awnRed';
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
    const s = add(placeAtPOI(ctx, R, p.x, p.z, R.range(20, 26), R.range(28, 36), 'factory', { setback: 3, minArea: 250 }));
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
  ctx.landmarks.specials = specs;   // prédios especiais (os moradores usam as fachadas)

  // Posto Calçadão: cobertura, bombas e loja
  {
    const { o, slab } = ctx.landmarks.posto;
    const { P } = frame(o);
    // pátio colado no chão, 9 cm acima dele: cobre o acesso de concreto que entra
    // no posto e fica abaixo do asfalto da avenida
    const DY = 0.09, fy = (x, z) => ctx.terrain.heightAt(x, z) + DY;
    drapeFloor(B, ctx, 'concrete', slab, DY, (x, z) => [x / 4.8, z / 4.8]);
    const cw = Math.min(o.hx * 2, 18), cd = 9;
    const legs = [[-cw / 2 + 1, 2], [cw / 2 - 1, 2], [-cw / 2 + 1, 2 + cd - 2], [cw / 2 - 1, 2 + cd - 2]].map(([lx, lz]) => P(lx, 0, o.hz - lz));
    // a cobertura é plana: 5 m acima do pé mais alto
    const y = Math.max(...legs.map(p => fy(p[0], p[2])));
    for (const p of legs) {
      const b = fy(p[0], p[2]);
      B.box('concreteW', p[0], b - 0.05, p[2], 0.45, y + 5.05 - b, 0.45, o.rot);
      ctx.collision.addBox(p[0], p[2], 0.25, 0.25, o.rot, b, y + 5);
    }
    // cobertura: frente em z local = o.hz
    const cc = P(0, 0, o.hz - cd / 2);
    B.col = [1, 1, 1];
    B.box('metalWhite', cc[0], y + 5, cc[2], cw, 0.7, cd, o.rot, { uvScale: 3, bottom: true });
    const fz = o.hz + 0.02;
    B.quad(sign('POSTO CALÇADÃO', { bg: '#f4f0e8', fg: '#a01818' }), P(-5, y + 5.02, fz), P(5, y + 5.02, fz), P(5, y + 5.68, fz), P(-5, y + 5.68, fz));
    // luminárias embaixo da cobertura
    for (const lx of [-cw / 4, cw / 4]) {
      const a = P(lx - 1.2, y + 4.96, o.hz - cd / 2 - 0.4), b = P(lx + 1.2, y + 4.96, o.hz - cd / 2 - 0.4);
      const c = P(lx + 1.2, y + 4.96, o.hz - cd / 2 + 0.4), d = P(lx - 1.2, y + 4.96, o.hz - cd / 2 + 0.4);
      B.quad('lamp', a, b, c, d);
    }
    // ilhas com bombas de combustível (visor dos dois lados)
    for (const lx of [-3, 3]) {
      const p = P(lx, 0, o.hz - cd / 2);
      // a ilha tem o topo plano: do ponto mais baixo do pátio embaixo dela até 18 cm
      // acima do mais alto
      const hs = [[-0.65, -1.7], [0.65, -1.7], [0.65, 1.7], [-0.65, 1.7]].map(([a, b]) => { const q = P(lx + a, 0, o.hz - cd / 2 + b); return fy(q[0], q[2]); });
      const lo = Math.min(...hs) - 0.05, iy = Math.max(...hs) + 0.18;
      B.col = [0.95, 0.95, 0.95];
      B.box('concreteW', p[0], lo, p[2], 1.3, iy - lo, 3.4, o.rot, { uvScale: 1 });
      B.col = [1, 1, 1];
      B.box('metalWhite', p[0], iy, p[2], 0.5, 1.75, 0.8, o.rot, { uvScale: 2 });
      for (const s of [1, -1]) {
        const q = (dz, yy) => P(lx + s * 0.252, yy, o.hz - cd / 2 + dz * s);
        B.quad('pump', q(0.4, iy), q(-0.4, iy), q(-0.4, iy + 1.75), q(0.4, iy + 1.75));
      }
      ctx.collision.addBox(p[0], p[2], 0.65, 1.7, o.rot, lo, iy + 1.77);
    }
    // loja de conveniência nos fundos
    const st = { x: P(0, 0, -o.hz + 4)[0], z: P(0, 0, -o.hz + 4)[2], rot: o.rot, w: Math.min(o.hx * 2, 14), d: 7, style: 'commercial', floors: 1, wall: 'plWhite', roofType: 'flat', roof: 'concrete', win: 'window2', sign: sign('CONVENIÊNCIA', { bg: '#a01818', fg: '#f6eed8' }), signH: 1.0, found: 'concrete', plinth: 0.1 };
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
  // (a parada de ônibus é posta junto com o calçadão; as placas de PARE, depois das casas)
  void obbCorners;
}

// placas de PARE nas ruas que chegam às avenidas (depois de todas as casas)
export function placeStopSigns(B, ctx) {
  for (const r of ctx.roads.list) {
    if (r.rank !== 3 && r.rank !== 4) continue;
    for (const end of [0, r.pts.length - 1]) {
      const [x, z] = r.pts[end];
      const major = ctx.roads.index.clearance(x, z, d => d.rank >= 5);
      if (major.d > 1) continue;
      const k = end === 0 ? Math.min(3, r.pts.length - 1) : Math.max(r.pts.length - 4, 0);
      const t = tan(r.pts, k);
      // lado direito de quem chega; se cair na pista de outra rua, tenta o outro lado
      for (const side of [1, -1]) {
        const px = r.pts[k][0] - t[1] * (r.hw + 0.8) * side, pz = r.pts[k][1] + t[0] * (r.hw + 0.8) * side;
        if (ctx.zones.isBlocked(px, pz) || ctx.zones.insideBuilding(px, pz, 0.5) || !offRoad(ctx, px, pz, -2) || !spotFree(ctx, [[px, pz]], 0.35)) continue;
        stopSign(B, ctx, px, pz, Math.atan2(t[0], t[1]) + (end === 0 ? Math.PI : 0));
        break;
      }
    }
  }
}
