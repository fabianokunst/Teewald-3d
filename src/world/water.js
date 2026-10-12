import { chaikin, resample, SegmentIndex, polyLength } from './geo.js';

// Rio Cadeia e arroios: leito escavado, nível descendo no sentido da correnteza
export function prepareRivers(mapdata, terrain) {
  const list = [];
  const index = new SegmentIndex(20, 30);
  for (const r of mapdata.rivers) {
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
    let lv = pts.map(([x, z]) => Math.min(terrain.roadHeight(x, z) - (isRiver ? 1.6 : 1.0), terrain.raw(x, z) - 0.7));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < lv.length; i++) if (lv[i] > lv[i - 1]) lv[i] = lv[i - 1];
      lv = lv.map((v, i) => (lv[Math.max(i - 2, 0)] + lv[Math.max(i - 1, 0)] + v + lv[Math.min(i + 1, lv.length - 1)] + lv[Math.min(i + 2, lv.length - 1)]) / 5);
    }
    for (let i = 1; i < lv.length; i++) if (lv[i] > lv[i - 1]) lv[i] = lv[i - 1];
    rv.level = lv;
    rv.levelAt = (seg, t) => lv[seg.i] + (lv[seg.i + 1] - lv[seg.i]) * t;
    for (let i = 0; i < pts.length - 1; i++) {
      const id = index.segs.length;
      index.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rv);
      index.segs[id].i = i;
    }
    list.push(rv);
  }
  return { list, index };
}

export function buildWater(B, rivers) {
  for (const rv of rivers.list) {
    const P = rv.pts, n = P.length, hw = rv.width / 2 + 1.5;
    let dist = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1];
      const tA = tangent(P, i), tB = tangent(P, i + 1);
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ya = rv.level[i], yb = rv.level[i + 1];
      const aR = [a[0] - tA[1] * hw, ya, a[1] + tA[0] * hw], aL = [a[0] + tA[1] * hw, ya, a[1] - tA[0] * hw];
      const bR = [b[0] - tB[1] * hw, yb, b[1] + tB[0] * hw], bL = [b[0] + tB[1] * hw, yb, b[1] - tB[0] * hw];
      const v0 = dist / 5, v1 = (dist + seg) / 5, uw = (hw * 2) / 5;
      B.quad('water', aR, bR, bL, aL, [[0, v0], [0, v1], [uw, v1], [uw, v0]]);
      dist += seg;
    }
  }
}

function tangent(P, i) {
  const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

export { polyLength };
