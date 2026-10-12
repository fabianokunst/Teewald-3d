import { chaikin, resample, SegmentIndex, segIntersect, distSeg } from './geo.js';

// Ruas a partir do OpenStreetMap: largura por tipo, pavimento pela tag "surface"
const TYPES = {
  secondary: { w: 8, rank: 6 },
  tertiary: { w: 7, rank: 5 },
  unclassified: { w: 6, rank: 4 },
  residential: { w: 5.5, rank: 3 },
  service: { w: 3.6, rank: 2 },
  track: { w: 3, rank: 1 },
  path: { w: 1.4, rank: 0 },
  footway: { w: 1.6, rank: 0 },
};
const SURF = {
  asphalt: 'asphalt', sett: 'sett', paving_stones: 'sett', cobblestone: 'sett',
  compacted: 'dirt', unpaved: 'dirt', gravel: 'dirt', dirt: 'dirt', ground: 'dirt',
};
const MAT_OFF = { asphalt: 0.1, sett: 0.085, concrete: 0.08, dirt: 0.07 };
const UVS = { asphalt: 6, sett: 2.5, concrete: 3, dirt: 5 };
export const CURB = 0.15;

export function prepareRoads(mapdata) {
  const list = [];
  const index = new SegmentIndex(20, 30);
  mapdata.roads.forEach((r, id) => {
    const T = TYPES[r.t];
    if (!T) return;
    let mat = SURF[r.s];
    if (!mat) {
      if (r.t === 'secondary' || r.t === 'tertiary') mat = 'asphalt';
      else if (r.t === 'residential') mat = 'sett';
      else if (r.t === 'unclassified') mat = 'sett';
      else if (r.t === 'service') mat = 'concrete';
      else mat = 'dirt';
    }
    const pts = resample(chaikin(r.p, 2), 2.5);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const central = Math.hypot(cx + 80, cz) < 380;
    const road = {
      id, name: r.n, type: r.t, mat, rank: T.rank, hw: T.w / 2, pts,
      off: MAT_OFF[mat] + T.rank * 0.002,
      sidewalk: (r.t === 'secondary' || r.t === 'tertiary' || (central && (r.t === 'residential' || r.t === 'unclassified'))) && mat !== 'dirt',
    };
    list.push(road);
    index.addPolyline(pts, road);
  });
  return { list, index };
}

// altura da superfície (rua/calçada) num ponto, ou null fora das ruas
export function roadSurfaceAt(roads, terrain, x, z) {
  let best = null;
  for (const id of roads.index.candidates(x, z)) {
    const s = roads.index.segs[id], r = s.data;
    const d = distSeg(x, z, s.ax, s.az, s.bx, s.bz)[0];
    if (d <= r.hw) { const y = terrain.roadHeight(x, z) + r.off; if (best === null || y > best) best = y; }
    else if (r.sidewalk && d <= r.hw + 2.0) { const y = terrain.roadHeight(x, z) + r.off + CURB; if (best === null || y > best) best = y; }
  }
  return best;
}

export function buildRoads(B, ctx) {
  const { terrain, roads, rivers } = ctx;
  const H = (x, z) => terrain.roadHeight(x, z);
  const bridges = [];

  for (const r of roads.list) {
    const P = r.pts, n = P.length;
    if (n < 2) continue;
    const tan = P.map((p, i) => {
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    });
    // prolonga um pouco as pontas para fechar os cruzamentos
    const ext = (p, t, s) => [p[0] + t[0] * s, p[1] + t[1] * s];
    const pts = P.map(p => p.slice());
    pts[0] = ext(P[0], tan[0], -0.8); pts[n - 1] = ext(P[n - 1], tan[n - 1], 0.8);
    const L = (i, w) => [pts[i][0] + tan[i][1] * w, pts[i][1] - tan[i][0] * w];
    const R = (i, w) => [pts[i][0] - tan[i][1] * w, pts[i][1] + tan[i][0] * w];
    const us = UVS[r.mat];
    const V = (q, dy) => [q[0], H(q[0], q[1]) + r.off + dy, q[1]];
    const UV = q => [q[0] / us, q[1] / us];
    for (let i = 0; i < n - 1; i++) {
      const a = R(i, r.hw), b = R(i + 1, r.hw), c = L(i + 1, r.hw), d = L(i, r.hw);
      B.quad(r.mat, V(a, 0), V(b, 0), V(c, 0), V(d, 0), [UV(a), UV(b), UV(c), UV(d)]);
    }

    // calçadas com meio-fio
    if (r.sidewalk) {
      for (const side of [1, -1]) {
        for (let i = 0; i < n - 1; i++) {
          const off = (k, w) => (side > 0 ? L(k, w) : R(k, w));
          const i0a = off(i, r.hw), i1a = off(i + 1, r.hw), o0 = off(i, r.hw + 2), o1 = off(i + 1, r.hw + 2);
          // corta onde invade outra rua
          const mid = [(o0[0] + i1a[0]) / 2, (o0[1] + i1a[1]) / 2];
          const other = roads.index.clearance(mid[0], mid[1], d => d !== r && d.rank >= 1);
          const otherIn = roads.index.clearance(o1[0], o1[1], d => d !== r && d.rank >= 1);
          if (other.d < 0.6 || otherIn.d < 0.3) continue;
          const top = (q) => V(q, CURB);
          const [A, Bq, C, D] = side > 0 ? [i0a, i1a, o1, o0] : [i1a, i0a, o0, o1];
          B.quad('pavers', top(A), top(Bq), top(C), top(D), [UV2(A), UV2(Bq), UV2(C), UV2(D)]);
          // face do meio-fio (virada para a rua)
          const [p0, p1] = side > 0 ? [i1a, i0a] : [i0a, i1a];
          B.quad('concreteW', V(p1, 0), V(p0, 0), V(p0, CURB), V(p1, CURB), [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
        }
      }
    }

    // faixa central tracejada (asfalto)
    if (r.mat === 'asphalt' && r.rank >= 5) {
      B.col = [0.95, 0.78, 0.25];
      let acc = 0;
      for (let i = 0; i < n - 1; i++) {
        const seg = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
        acc += seg;
        if ((acc % 7) < 3.2) {
          const a = R(i, 0.07), b = R(i + 1, 0.07), c = L(i + 1, 0.07), d = L(i, 0.07);
          B.quad('paint', V(a, 0.012), V(b, 0.012), V(c, 0.012), V(d, 0.012));
        }
      }
      B.col = [1, 1, 1];
    }

    // pontes onde a rua cruza um rio
    for (const rv of rivers.list) {
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < rv.pts.length - 1; k++) {
        const hit = segIntersect(P[i], P[i + 1], rv.pts[k], rv.pts[k + 1]);
        if (!hit) continue;
        const x = P[i][0] + (P[i + 1][0] - P[i][0]) * hit[0], z = P[i][1] + (P[i + 1][1] - P[i][1]) * hit[0];
        if (bridges.some(b => Math.hypot(b.x - x, b.z - z) < 6)) continue;
        bridges.push({ x, z, tan: tan[i], road: r, river: rv, len: rv.width + 5 });
      }
    }
  }

  for (const b of bridges) buildBridge(B, ctx, b);
  return bridges;
}

const UV2 = q => [q[0] / 2, q[1] / 2];

function buildBridge(B, ctx, br) {
  const { terrain, collision } = ctx;
  const r = br.road, [tx, tz] = br.tan, nx = tz, nz = -tx;
  const half = br.len / 2, hw = r.hw + (r.sidewalk ? 2 : 0) + 0.15;
  const y = terrain.roadHeight(br.x, br.z) + r.off;
  const rot = Math.atan2(tx, tz);
  for (const side of [1, -1]) {
    const cx = br.x + nx * hw * side, cz = br.z + nz * hw * side;
    // mureta de concreto
    B.box('concreteW', cx, y - 0.9, cz, 0.3, 1.9, br.len, rot, { uvScale: 2 });
    collision.addBox(cx, cz, 0.15, half, rot, y - 1, y + 1.0);
  }
  // tabuleiro (plataforma caminhável) e face lateral
  const deckHW = hw;
  B.box('concrete', br.x, y - 0.75, br.z, deckHW * 2, 0.7, br.len, rot, { top: false });
  collision.addBox(br.x, br.z, deckHW, half, rot, y - 1.5, y, { walk: true });
}
