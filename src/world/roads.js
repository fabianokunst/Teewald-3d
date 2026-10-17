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

// eixo desenhado de uma rua: tangente média em cada ponto, pontas prolongadas 0,8 m
// (fecham os cruzamentos) e o deslocamento para cada lado (L, R)
function roadFrame(r) {
  if (r.frame) return r.frame;
  const P = r.pts, n = P.length;
  const tan = P.map((p, i) => {
    const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  });
  const ext = (p, t, s) => [p[0] + t[0] * s, p[1] + t[1] * s];
  const pts = P.map(p => p.slice());
  pts[0] = ext(P[0], tan[0], -0.8); pts[n - 1] = ext(P[n - 1], tan[n - 1], 0.8);
  const L = (i, w) => [pts[i][0] + tan[i][1] * w, pts[i][1] - tan[i][0] * w];
  const R = (i, w) => [pts[i][0] - tan[i][1] * w, pts[i][1] + tan[i][0] * w];
  return (r.frame = { tan, pts, L, R });
}

// altura no triângulo a-b-c (cantos em XZ, alturas hf(canto)), ou null fora dele
function triAt(x, z, a, b, c, hf) {
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(det) < 1e-12) return null;
  const l0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det;
  const l1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det;
  const l2 = 1 - l0 - l1;
  if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) return null;
  return l0 * hf(a) + l1 * hf(b) + l2 * hf(c);
}
// quadrilátero desenhado por B.quad: triângulos (a, b, c) e (a, c, d)
const quadAt = (x, z, a, b, c, d, hf) => triAt(x, z, a, b, c, hf) ?? triAt(x, z, a, c, d, hf);

// altura da rua ou calçada desenhada num ponto, ou null fora delas. Usa os mesmos
// triângulos do desenho (e a calçada só onde ela foi desenhada). A conta anterior,
// pela distância ao eixo, deixava o jogador 15 cm acima do asfalto em boa parte das
// ruas com calçada (a ponta arredondada do trecho seguinte contava como calçada) e
// punha meio-fios invisíveis nos cruzamentos, onde o desenho corta a calçada
export function roadSurfaceAt(roads, terrain, x, z) {
  let best = null;
  for (const id of roads.index.candidates(x, z)) {
    const s = roads.index.segs[id], r = s.data;
    if (distSeg(x, z, s.ax, s.az, s.bx, s.bz)[0] > r.hw + (r.sidewalk ? 2 : 0) + 1) continue;
    const { L, R } = roadFrame(r), i = s.i, w = r.hw;
    const lane = q => terrain.roadHeight(q[0], q[1]) + r.off, curb = q => lane(q) + CURB;
    let y = quadAt(x, z, R(i, w), R(i + 1, w), L(i + 1, w), L(i, w), lane);
    if (r.sidewalk) {
      // sem r.walk (antes de buildRoads) vale a calçada inteira
      let v = !r.walk || r.walk[0][i] ? quadAt(x, z, L(i, w), L(i + 1, w), L(i + 1, w + 2), L(i, w + 2), curb) : null;
      if (v !== null && (y === null || v > y)) y = v;
      v = !r.walk || r.walk[1][i] ? quadAt(x, z, R(i + 1, w), R(i, w), R(i, w + 2), R(i + 1, w + 2), curb) : null;
      if (v !== null && (y === null || v > y)) y = v;
    }
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

// pavimento da rua num ponto ('asphalt', 'sett', 'concrete', 'dirt'; 'walk' = calçada), ou
// null fora das ruas (mesmos triângulos de roadSurfaceAt)
export function roadMatAt(roads, terrain, x, z) {
  let walk = false;
  for (const id of roads.index.candidates(x, z)) {
    const s = roads.index.segs[id], r = s.data;
    if (distSeg(x, z, s.ax, s.az, s.bx, s.bz)[0] > r.hw + (r.sidewalk ? 2 : 0) + 1) continue;
    const { L, R } = roadFrame(r), i = s.i, w = r.hw, one = () => 0;
    if (quadAt(x, z, R(i, w), R(i + 1, w), L(i + 1, w), L(i, w), one) !== null) return r.mat;
    if (r.sidewalk && (quadAt(x, z, L(i, w), L(i + 1, w), L(i + 1, w + 2), L(i, w + 2), one) !== null ||
      quadAt(x, z, R(i + 1, w), R(i, w), R(i, w + 2), R(i + 1, w + 2), one) !== null)) walk = true;
  }
  return walk ? 'walk' : null;
}

export function buildRoads(B, ctx) {
  const { terrain, roads, rivers } = ctx;
  const H = (x, z) => terrain.roadHeight(x, z);
  const bridges = [];

  for (const r of roads.list) {
    const P = r.pts, n = P.length;
    if (n < 2) continue;
    const { tan, pts, L, R } = roadFrame(r);
    const us = UVS[r.mat];
    const V = (q, dy) => [q[0], H(q[0], q[1]) + r.off + dy, q[1]];
    const UV = q => [q[0] / us, q[1] / us];
    for (let i = 0; i < n - 1; i++) {
      const a = R(i, r.hw), b = R(i + 1, r.hw), c = L(i + 1, r.hw), d = L(i, r.hw);
      B.quad(r.mat, V(a, 0), V(b, 0), V(c, 0), V(d, 0), [UV(a), UV(b), UV(c), UV(d)]);
    }

    // calçadas com meio-fio; r.walk guarda quais trechos foram desenhados (lado L, lado R)
    if (r.sidewalk) {
      r.walk = [new Uint8Array(n - 1), new Uint8Array(n - 1)];
      const top = (q) => V(q, CURB);
      // pé das faces de fora e das pontas: um pouco abaixo do terreno (ou da rua, se o
      // terreno ali for mais alto), no máximo 0,9 m abaixo da pista (na ponte o terreno
      // é o leito do rio; a mureta cobre até aí)
      const foot = (q) => {
        const y = H(q[0], q[1]);
        return [q[0], Math.max(Math.min(y, terrain.heightAt(q[0], q[1])) - 0.15, y + r.off - 0.9), q[1]];
      };
      for (const side of [1, -1]) {
        const off = (k, w) => (side > 0 ? L(k, w) : R(k, w));
        const walk = r.walk[side > 0 ? 0 : 1];
        // corta onde invade outra rua (antes de desenhar: as pontas dependem do vizinho)
        for (let i = 0; i < n - 1; i++) {
          const i1a = off(i + 1, r.hw), o0 = off(i, r.hw + 2), o1 = off(i + 1, r.hw + 2);
          const mid = [(o0[0] + i1a[0]) / 2, (o0[1] + i1a[1]) / 2];
          const other = roads.index.clearance(mid[0], mid[1], d => d !== r && d.rank >= 1);
          const otherIn = roads.index.clearance(o1[0], o1[1], d => d !== r && d.rank >= 1);
          if (other.d >= 0.6 && otherIn.d >= 0.3) walk[i] = 1;
        }
        for (let i = 0; i < n - 1; i++) {
          if (!walk[i]) continue;
          const i0a = off(i, r.hw), i1a = off(i + 1, r.hw), o0 = off(i, r.hw + 2), o1 = off(i + 1, r.hw + 2);
          const [A, Bq, C, D] = side > 0 ? [i0a, i1a, o1, o0] : [i1a, i0a, o0, o1];
          B.quad('pavers', top(A), top(Bq), top(C), top(D), [UV2(A), UV2(Bq), UV2(C), UV2(D)]);
          // face do meio-fio (virada para a rua)
          const [p0, p1] = side > 0 ? [i1a, i0a] : [i0a, i1a];
          B.quad('concreteW', V(p1, 0), V(p0, 0), V(p0, CURB), V(p1, CURB), [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
          // face de fora (lado oposto da rua): sem ela a laje ficava aberta e via-se
          // por baixo da calçada até a rua
          const out = [o0[0] - i0a[0], 0, o0[1] - i0a[1]];
          quadOut(B, 'concreteW', foot(o0), foot(o1), top(o1), top(o0), out, [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
          // pontas do trecho (fim da rua ou corte num cruzamento)
          const cap = (k, a, b, dir) => quadOut(B, 'concreteW', foot(a), foot(b), top(b), top(a),
            [tan[k][0] * dir, 0, tan[k][1] * dir], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
          if (i === 0 || !walk[i - 1]) cap(i, i0a, o0, -1);
          if (i === n - 2 || !walk[i + 1]) cap(i + 1, i1a, o1, 1);
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
        // o vão cobre a margem escavada inteira (o terreno embaixo da rua desce até o
        // rio ao longo de rv.bank); mais curta, a rua ficava no ar depois da cabeceira.
        // Cruzando o rio na diagonal, a borda da rua (e da calçada) que fica do lado
        // agudo só sai da margem bem depois do eixo
        const kx = rv.pts[k + 1][0] - rv.pts[k][0], kz = rv.pts[k + 1][1] - rv.pts[k][1], kl = Math.hypot(kx, kz) || 1;
        const sin = Math.max(Math.abs(tan[i][0] * kz - tan[i][1] * kx) / kl, 0.5), cos = Math.sqrt(1 - sin * sin);
        const W = r.hw + (r.sidewalk ? 2 : 0);
        const len = 2 * ((rv.width / 2 + rv.bank + 0.5 + W * cos) / sin);
        bridges.push({ x, z, tan: tan[i], road: r, river: rv, len, seg: i, t: hit[0] });
      }
    }
  }

  for (const b of bridges) buildBridge(B, ctx, b);
  return bridges;
}

const UV2 = q => [q[0] / 2, q[1] / 2];

const quadOut = (B, mat, a, b, c, d, out, uv) => B.quadOut(mat, a, b, c, d, out, uv);

// Ponte que acompanha o traçado e o perfil da rua (curvas e rampas): tabuleiro e
// muretas contínuos, sem degraus entre trechos
function buildBridge(B, ctx, br) {
  const { terrain, collision } = ctx;
  const r = br.road, P = r.pts, half = br.len / 2, hw = r.hw + (r.sidewalk ? 2 : 0) + 0.15;
  const acc = [0];
  for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const s0 = acc[br.seg] + (acc[br.seg + 1] - acc[br.seg]) * br.t;
  const pointAt = s => {
    let i = 1;
    while (i < P.length - 1 && acc[i] < s) i++;
    const a = P[i - 1], b = P[i], f = Math.max(0, Math.min(1, (s - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1)));
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const sA = Math.max(0, s0 - half), sB = Math.min(acc[acc.length - 1], s0 + half);
  const ss = [sA, ...acc.filter(v => v > sA + 0.3 && v < sB - 0.3), sB];
  const st = ss.map(v => { const [x, z] = pointAt(v); return { x, z, s: v, y: terrain.roadHeight(x, z) + r.off }; });
  st.forEach((p, k) => { // tangente média e normal (lado esquerdo = +n)
    const a = st[Math.max(k - 1, 0)], b = st[Math.min(k + 1, st.length - 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / l; p.tz = (b.z - a.z) / l; p.nx = p.tz; p.nz = -p.tx;
  });
  // altura no ponto lateral (a rua pode ter caimento para um lado)
  const V = (p, w, dy) => { const x = p.x + p.nx * w, z = p.z + p.nz * w; return [x, terrain.roadHeight(x, z) + r.off + dy, z]; };
  const N = (p, k) => [p.nx * k, 0, p.nz * k];
  const T = (p, k) => [p.tx * k, 0, p.tz * k];
  const uvs = (a, b, y0, y1) => [[a.s / 2, y0 / 2], [b.s / 2, y0 / 2], [b.s / 2, y1 / 2], [a.s / 2, y1 / 2]];
  // na cabeceira a mureta pode cair dentro de outra rua ou do barranco: ali não entra
  const blocked = (a, b, side) => {
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, nx: (a.nx + b.nx) / 2, nz: (a.nz + b.nz) / 2, y: (a.y + b.y) / 2 };
    const [cx, , cz] = V(m, hw * side, 0);
    const rs = roadSurfaceAt(ctx.roads, terrain, cx, cz);
    return Math.max(terrain.heightAt(cx, cz), rs ?? -Infinity) > m.y + 0.5;
  };
  const W0 = hw - 0.15, W1 = hw + 0.15;
  for (const side of [1, -1]) {
    let run = false;
    for (let k = 0; k < st.length - 1; k++) {
      const a = st[k], b = st[k + 1];
      const on = !blocked(a, b, side);
      if (on !== run) { const p = on ? a : st[k]; quadOut(B, 'concreteW', V(p, W0 * side, -0.9), V(p, W1 * side, -0.9), V(p, W1 * side, 1.0), V(p, W0 * side, 1.0), T(p, on ? -1 : 1)); run = on; }
      if (!on) continue;
      quadOut(B, 'concreteW', V(a, W1 * side, -0.9), V(b, W1 * side, -0.9), V(b, W1 * side, 1.0), V(a, W1 * side, 1.0), N(a, side), uvs(a, b, -0.9, 1.0));
      quadOut(B, 'concreteW', V(a, W0 * side, -0.05), V(b, W0 * side, -0.05), V(b, W0 * side, 1.0), V(a, W0 * side, 1.0), N(a, -side), uvs(a, b, -0.05, 1.0));
      quadOut(B, 'concreteW', V(a, W0 * side, 1.0), V(b, W0 * side, 1.0), V(b, W1 * side, 1.0), V(a, W1 * side, 1.0), [0, 1, 0], uvs(a, b, 0, 0.3));
      quadOut(B, 'concreteW', V(a, W0 * side, -0.9), V(b, W0 * side, -0.9), V(b, W1 * side, -0.9), V(a, W1 * side, -0.9), [0, -1, 0], uvs(a, b, 0, 0.3));
      const L = Math.hypot(b.x - a.x, b.z - a.z), rot = Math.atan2(b.x - a.x, b.z - a.z);
      const c = V({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, nx: (a.nx + b.nx) / 2, nz: (a.nz + b.nz) / 2, y: Math.min(a.y, b.y) }, hw * side, 0);
      // walk: pela pista bloqueia (1 m), mas se o barranco chega quase no topo dá para pisar nela
      collision.addBox(c[0], c[2], 0.15, L / 2, rot, c[1] - 0.9, c[1] + 1.0 + Math.abs(a.y - b.y) / 2, { walk: true });
      if (k === st.length - 2) quadOut(B, 'concreteW', V(b, W0 * side, -0.9), V(b, W1 * side, -0.9), V(b, W1 * side, 1.0), V(b, W0 * side, 1.0), T(b, 1));
    }
  }
  // tabuleiro: face de baixo e testeiras nas cabeceiras
  for (let k = 0; k < st.length - 1; k++) {
    const a = st[k], b = st[k + 1];
    quadOut(B, 'concrete', V(a, -hw, -0.75), V(b, -hw, -0.75), V(b, hw, -0.75), V(a, hw, -0.75), [0, -1, 0], uvs(a, b, -hw, hw));
    const L = Math.hypot(b.x - a.x, b.z - a.z), rot = Math.atan2(b.x - a.x, b.z - a.z);
    // o topo não passa da pista desenhada (que tem caimento para os lados e sobe ao
    // longo da ponte): no meio, plano, deixava o jogador até 30 cm acima do asfalto.
    // Quem pisa na ponte fica na altura da rua (roadSurfaceAt); a caixa é o volume
    const top = Math.min(V(a, -hw, 0)[1], V(a, hw, 0)[1], V(b, -hw, 0)[1], V(b, hw, 0)[1]) - 0.02;
    collision.addBox((a.x + b.x) / 2, (a.z + b.z) / 2, hw, L / 2, rot, Math.min(Math.min(a.y, b.y) - 0.75, top - 0.5), top, { walk: true });
  }
  for (const [p, k] of [[st[0], -1], [st[st.length - 1], 1]]) quadOut(B, 'concrete', V(p, -hw, -0.75), V(p, hw, -0.75), V(p, hw, -0.35), V(p, -hw, -0.35), T(p, k));
}
