import { chaikin, resample, SegmentIndex, polyLength } from './geo.js';
import { NEAR } from './terrain.js';

const smooth = t => t * t * (3 - 2 * t);

// Rio Cadeia e arroios: leito escavado, nível descendo no sentido da correnteza
export function prepareRivers(mapdata, terrain) {
  const list = [];
  const index = new SegmentIndex(20, 30);
  for (const r of joinWays(mapdata.rivers)) {
    const isRiver = r.k === 'river';
    const pts = resample(chaikin(r.p, 3), 4);
    if (pts.length < 2) continue;
    const rv = {
      name: r.n || (isRiver ? 'Rio' : 'Arroio'),
      width: isRiver ? 9 : 3,
      depth: isRiver ? 1.4 : 0.6,
      bank: isRiver ? 6 : 3,
      pts,
      level: [],
    };
    // nível: abaixo do terreno suavizado e do terreno bruto local
    const side = rv.width / 2 + 2.5;
    const levels = (raw, road) => {
      let lv = pts.map(([x, z], i) => {
        const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * side, nz = (b[0] - a[0]) / l * side;
        return Math.min(road(x, z) - (isRiver ? 1.6 : 1.0), raw(x, z) - 0.7, raw(x + nx, z + nz) - 0.4, raw(x - nx, z - nz) - 0.4);
      });
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < lv.length; i++) if (lv[i] > lv[i - 1]) lv[i] = lv[i - 1];
        lv = lv.map((v, i) => (lv[Math.max(i - 2, 0)] + lv[Math.max(i - 1, 0)] + v + lv[Math.min(i + 1, lv.length - 1)] + lv[Math.min(i + 2, lv.length - 1)]) / 5);
      }
      for (let i = 1; i < lv.length; i++) if (lv[i] > lv[i - 1]) lv[i] = lv[i - 1];
      return lv;
    };
    let lv = levels((x, z) => terrain.raw(x, z), (x, z) => terrain.roadHeight(x, z));
    if (terrain.ring) {
      // com a área ampliada: dentro da cidade o nível de sempre (o relevo novo rio acima não
      // pode baixar a água no centro); fora, o do relevo novo, emendado em 120 m
      const lv1 = levels((x, z) => terrain.raw1(x, z), (x, z) => terrain.roadHeight1(x, z));
      const w = pts.map(([x, z]) => { const e = Math.hypot(Math.max(NEAR.x0 - x, 0, x - NEAR.x1), Math.max(NEAR.z0 - z, 0, z - NEAR.z1)); return e <= 0 ? 1 : 1 - smooth(Math.min(1, e / 120)); });
      lv = lv.map((v, i) => v + (lv1[i] - v) * w[i]);
      // descendo o rio a água nunca sobe: corrige só os pontos de fora da cidade
      for (let i = 1; i < lv.length; i++) if (w[i] < 1 && lv[i] > lv[i - 1]) lv[i] = lv[i - 1];
      for (let i = lv.length - 2; i >= 0; i--) if (w[i] < 1 && lv[i] < lv[i + 1]) lv[i] = lv[i + 1];
    }
    rv.level = lv;
    rv.levelAt = (seg, t) => lv[seg.i] + (lv[seg.i + 1] - lv[seg.i]) * t;
    for (let i = 0; i < pts.length - 1; i++) {
      const id = index.segs.length;
      index.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rv);
      index.segs[id].i = i;
    }
    list.push(rv);
  }
  // afluente desce até o nível do rio em que deságua (nos últimos 40 m), em vez de
  // chegar lá em cima e despencar num paredão
  for (const rv of list) {
    const end = rv.pts[rv.pts.length - 1];
    const q = index.nearest(end[0], end[1], d => d !== rv);
    if (!q.seg || q.d > q.seg.data.width / 2 + 10) continue;
    const target = q.seg.data.levelAt(q.seg, q.t) + 0.05, lv = rv.level, n = lv.length;
    if (lv[n - 1] <= target) continue;
    let acc = 0, k = n - 1;
    while (k > 0 && acc < 40) { acc += Math.hypot(rv.pts[k][0] - rv.pts[k - 1][0], rv.pts[k][1] - rv.pts[k - 1][1]); k--; }
    const top = lv[k];
    let dist = 0;
    for (let i = n - 1; i > k; i--) {
      lv[i] = Math.min(lv[i], target + (top - target) * (dist / acc));
      dist += Math.hypot(rv.pts[i][0] - rv.pts[i - 1][0], rv.pts[i][1] - rv.pts[i - 1][1]);
    }
  }
  return { list, index };
}

export function buildWater(B, rivers) {
  for (const rv of rivers.list) {
    const P = rv.pts, n = P.length, hw = rv.width / 2 + rv.bank * 0.5;
    let dist = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1];
      const tA = tangent(P, i), tB = tangent(P, i + 1);
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ya = rv.level[i], yb = rv.level[i + 1];
      const aR = [a[0] - tA[1] * hw, ya, a[1] + tA[0] * hw], aL = [a[0] + tA[1] * hw, ya, a[1] - tA[0] * hw];
      const bR = [b[0] - tB[1] * hw, yb, b[1] + tB[0] * hw], bL = [b[0] + tB[1] * hw, yb, b[1] - tB[0] * hw];
      const v0 = dist / 5, v1 = (dist + seg) / 5, uw = (hw * 2) / 5;
      // o trecho coberto pela represa (world/countryside.js) fica embaixo da água parada
      if (!(rv.hidden && i >= rv.hidden[0] && i < rv.hidden[1])) B.quad('water', aR, bR, bL, aL, [[0, v0], [0, v1], [uw, v1], [uw, v0]]);
      dist += seg;
    }
  }
}

// o OSM divide um arroio em vários caminhos; junta os que continuam um no outro
function joinWays(ways) {
  const out = ways.map(w => ({ ...w, p: w.p.slice() }));
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5;
  for (let merged = true; merged;) {
    merged = false;
    for (const a of out) {
      const b = out.find(o => o !== a && o.k === a.k && near(a.p[a.p.length - 1], o.p[0]));
      if (!b) continue;
      a.p.push(...b.p.slice(1));
      if (!a.n && b.n) a.n = b.n;
      out.splice(out.indexOf(b), 1);
      merged = true;
      break;
    }
  }
  return out;
}

function tangent(P, i) {
  const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

export { polyLength };
