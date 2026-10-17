import { rng, fbm, clamp, smooth, distToPoly, pointInPoly, minRect, obbCorners, SegmentIndex } from './geo.js';
import { NEAR } from './terrain.js';
import { PLAY_BOUNDS } from '../config.js';
import { buildHouse } from './buildings.js';
import { signMaterial } from '../engine/materials.js';

// O interior em volta da cidade (só com a área ampliada): a represa da Usina Herval, com a
// barragem, a tubulação forçada e a casa de força lá embaixo; cercas de arame farpado na beira
// das roças, milharais secos (é maio, a palha ficou na roça) e fardos nos pastos.
// Tudo com sorteio próprio e longe da grade da cidade: nada daqui muda a cidade.

// a represa termina antes da grade da cidade (lá dentro continua o rio de sempre)
const LAKE_EAST = NEAR.x0 - 40;
const RIVER_HW = 5;

// distância (m) de um ponto até fora de um retângulo (0 dentro)
const outside = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const rectPoly = (o, m = 0) => obbCorners({ ...o, hx: o.hx + m, hz: o.hz + m });

// antes do relevo final: a represa escava o terreno, e as áreas ficam reservadas
// (casas e árvores do interior não nascem dentro da água nem em cima da usina)
export function defineCountryside(ctx) {
  const { terrain, zones, rivers, mapdata: md } = ctx;
  if (!terrain.ring) return;
  const C = ctx.countryside = {};
  const area = md.areas.find(a => a.k === 'water' && /Represa/.test(a.n || ''));
  const rv = rivers.list.find(r => r.name === 'Rio Cadeia');
  const L = area && rv ? makeLake(rv, area.p) : null;
  if (L) {
    C.lake = L;
    terrain.addLake(L);
    zones.block(L.poly, 6);
    zones.place(L.poly, 'REPRESA DA USINA HERVAL', 2);
    rv.hidden = [L.i0, L.i1];
    // logo abaixo da barragem o rio corre uns 5 m mais baixo (a parede aparece, e a água
    // do vertedouro cai até lá)
    for (let i = L.i1 + 1; i < rv.level.length; i++) rv.level[i] = Math.min(rv.level[i], L.level - 5);
    C.dam = makeDam(L);
    zones.block(C.dam.poly, 4);
    zones.place(C.dam.poly, 'REPRESA DA USINA HERVAL', 2);
  }
  const ua = md.areas.find(a => a.n === 'Usina Hidrelétrica Herval');
  if (ua) {
    const o = minRect(ua.p);
    if (o.hx < o.hz) { o.rot += Math.PI / 2; [o.hx, o.hz] = [o.hz, o.hx]; }
    // a frente (+z local) para o lado contrário do rio
    const q = rivers.index.nearest(o.x, o.z);
    if (q.seg) {
      const s = q.seg, px = s.ax + (s.bx - s.ax) * q.t, pz = s.az + (s.bz - s.az) * q.t;
      if (Math.sin(o.rot) * (o.x - px) + Math.cos(o.rot) * (o.z - pz) < 0) o.rot += Math.PI;
    }
    C.usina = o;
    zones.block(rectPoly(o), 5);
    zones.clearForest(rectPoly(o, 16));
    zones.place(rectPoly(o, 28), 'USINA HIDRELÉTRICA HERVAL', 3);
  }
  if (C.dam && C.usina) {
    C.pipe = pipePath(C.dam, C.usina);
    zones.block(C.pipe.corridor, 2);
    zones.clearForest(C.pipe.corridor);
  }
  // nomes dos lugares do interior que aparecem no mapa real
  const poi = n => md.pois.find(p => p.n === n);
  const vila = poi('Vila Amizade');
  if (vila) zones.place([[1200, 400], [1850, 400], [1850, 1115], [1200, 1115]], 'VILA AMIZADE', 1);
  const ctg = poi('CTG Amigos da Tradição');
  if (ctg) zones.place(rectPoly({ x: ctg.x, z: ctg.z, hx: 40, hz: 40, rot: 0 }), 'CTG AMIGOS DA TRADIÇÃO', 3);
}

// depois das casas (as cercas desviam delas) e antes das árvores (que desviam das cercas)
export function buildCountryside(B, ctx) {
  const C = ctx.countryside;
  if (!C) return;
  if (C.lake) buildLake(B, C.lake);
  if (C.dam) buildDam(B, ctx, C.dam, C.lake);
  if (C.usina) buildUsina(B, ctx, C.usina);
  if (C.pipe) buildPipe(B, ctx, C.pipe, C.dam);
  const fi = ctx.fenceIndex ||= new SegmentIndex(10, 2);
  C.fences = buildFences(B, ctx, fi, rng(7301));
  C.corn = buildCorn(B, ctx, fi);
  C.bales = buildBales(B, ctx, fi, rng(7302));
}

// ---------------------------------------------------------------- represa

// primeira interseção do raio (px, pz) + t (dx, dz), t > 0, com a borda do polígono
function rayDist(px, pz, dx, dz, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - px) * ez - (a[1] - pz) * ex) / den, u = ((a[0] - px) * dz - (a[1] - pz) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

// o contorno da represa sai do rio: em cada ponto do leito, a largura até a margem do
// contorno do mapa para cada lado (suavizada), afinando até a largura do rio perto da cidade
function makeLake(rv, area) {
  const P = rv.pts, n = P.length;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < n; i++) {
    if (P[i][0] > LAKE_EAST) continue;
    if (i0 < 0) i0 = i;
    if (pointInPoly(P[i][0], P[i][1], area)) i1 = i;
  }
  if (i0 < 0 || i1 <= i0 + 4) return null;
  const tan = i => { const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const S = [];
  for (let i = i0; i <= i1; i++) {
    const [x, z] = P[i], [tx, tz] = tan(i), nx = -tz, nz = tx;
    let l = RIVER_HW, r = RIVER_HW;
    if (pointInPoly(x, z, area)) { l = clamp(rayDist(x, z, nx, nz, area), RIVER_HW, 45); r = clamp(rayDist(x, z, -nx, -nz, area), RIVER_HW, 45); }
    S.push({ x, z, nx, nz, l, r });
  }
  // a barragem fica na borda do contorno, rio abaixo do último ponto de dentro
  const e = S[S.length - 1], [tx, tz] = tan(i1), t = rayDist(e.x, e.z, tx, tz, area);
  if (t < 12) S.push({ ...e, x: e.x + tx * t, z: e.z + tz * t });
  for (let pass = 0; pass < 5; pass++) for (const k of ['l', 'r']) {
    const v = S.map(s => s[k]);
    S.forEach((s, j) => { s[k] = (v[Math.max(j - 1, 0)] + 2 * v[j] + v[Math.min(j + 1, v.length - 1)]) / 4; });
  }
  for (const s of S) {
    const k = smooth((s.x - (LAKE_EAST - 120)) / 120);
    s.l += (RIVER_HW - s.l) * k; s.r += (RIVER_HW - s.r) * k;
  }
  let level = -Infinity;
  for (let i = i0; i <= i1; i++) level = Math.max(level, rv.level[i]);
  const poly = [...S.map(s => [s.x + s.nx * s.l, s.z + s.nz * s.l]), ...S.map(s => [s.x - s.nx * s.r, s.z - s.nz * s.r]).reverse()];
  // para quem pergunta "que água é esta" (nado, carro, cães de fogo): larga e funda
  const water = { name: 'Represa', width: 60, depth: 3.5, bank: 4, lake: true };
  return { S, poly, level, depth: 3.5, margin: 22, i0, i1, water, tan: [tx, tz] };
}

// espelho d'água: faixas ao longo do rio, de margem a margem
function buildLake(B, L) {
  const S = L.S, y = L.level, COLS = 4;
  const at = (s, k) => { const w = -s.r + (s.l + s.r) * k / COLS; return [s.x + s.nx * w, y, s.z + s.nz * w]; };
  for (let j = 0; j < S.length - 1; j++) for (let k = 0; k < COLS; k++) {
    const p = [at(S[j], k), at(S[j + 1], k), at(S[j + 1], k + 1), at(S[j], k + 1)];
    B.quadOut('waterLake', p[0], p[1], p[2], p[3], [0, 1, 0], p.map(q => [q[0] / 6, q[2] / 6]));
  }
}

// ---------------------------------------------------------------- barragem

// a barragem atravessa o vale na ponta de baixo da represa: dois muros de concreto
// entrando nas margens e o vertedouro no meio, com uma passarela por cima
function makeDam(L) {
  const e = L.S[L.S.length - 1], t = L.tan, n = [e.nx, e.nz];
  const d = { x: e.x + t[0] * 1.2, z: e.z + t[1] * 1.2, t, n, a: -(e.r + 8), b: e.l + 8, spill: [-6.5, 6.5], thick: 2.4 };
  d.crest = L.level + 0.55;
  const P = (u, v) => [d.x + n[0] * u + t[0] * v, d.z + n[1] * u + t[1] * v];
  d.P = P;
  d.poly = [P(d.a, -3), P(d.b, -3), P(d.b, 8), P(d.a, 8)];
  return d;
}

function buildDam(B, ctx, d, L) {
  const T = ctx.terrain, { P, n, t } = d, rot = Math.atan2(-n[1], n[0]);
  // base: abaixo do chão mais fundo ao longo da barragem (o leito, rio abaixo)
  let base = Infinity;
  for (let u = d.a; u <= d.b; u += 2) for (const v of [-1, 1, 3]) { const [x, z] = P(u, v); base = Math.min(base, T.heightAt(x, z)); }
  base -= 1;
  const crest = d.crest, spillTop = L.level - 0.12, hw = d.thick / 2;
  const block = (u0, u1, top, mat, walk) => {
    const [x, z] = P((u0 + u1) / 2, 0);
    B.box(mat, x, base, z, u1 - u0, top - base, d.thick, rot, { uvScale: 2.5 });
    ctx.collision.addBox(x, z, (u1 - u0) / 2, hw, rot, base, top, { walk });
  };
  block(d.a, d.spill[0], crest, 'concrete', true);
  block(d.spill[1], d.b, crest, 'concrete', true);
  block(d.spill[0], d.spill[1], spillTop, 'concrete', false);
  // água passando por cima do vertedouro e descendo pela face de baixo, com espuma no pé
  const below = (() => { const [x, z] = P(0, 5); return T.waterLevel(x, z) ?? T.heightAt(x, z); })();
  const [s0, s1] = d.spill, y1 = spillTop + 0.06, yb = Math.min(below, y1 - 0.5);
  const Q = (u, v, y) => { const p = P(u, v); return [p[0], y, p[1]]; };
  B.quadOut('waterLake', Q(s0, -hw - 0.3, L.level), Q(s1, -hw - 0.3, L.level), Q(s1, hw, y1), Q(s0, hw, y1), [0, 1, 0], [[0, 0], [3, 0], [3, 0.6], [0, 0.6]]);
  const h = y1 - yb;
  B.quadOut('foam', Q(s0, hw + 0.06, y1), Q(s1, hw + 0.06, y1), Q(s1, hw + 0.06 + h * 0.18, yb), Q(s0, hw + 0.06 + h * 0.18, yb), [t[0], 0.3, t[1]], [[0, 0], [(s1 - s0) / 3, 0], [(s1 - s0) / 3, h / 3], [0, h / 3]]);
  B.quadOut('foam', Q(s0 - 1, hw + h * 0.18, yb + 0.08), Q(s1 + 1, hw + h * 0.18, yb + 0.08), Q(s1 + 1.5, hw + h * 0.18 + 6, yb + 0.05), Q(s0 - 1.5, hw + h * 0.18 + 6, yb + 0.05), [0, 1, 0], [[0, 0], [(s1 - s0) / 3, 0], [(s1 - s0) / 3, 2], [0, 2]]);
  // passarela sobre o vertedouro (na altura da crista)
  {
    const [x, z] = P(0, 0);
    B.box('concreteW', x, crest - 0.3, z, s1 - s0 + 0.4, 0.3, d.thick, rot, { uvScale: 2, bottom: true });
    ctx.collision.addBox(x, z, (s1 - s0) / 2 + 0.2, hw, rot, crest - 0.3, crest, { walk: true });
    for (const u of [s0 / 2, s1 / 2]) { const [px, pz] = P(u, 0); B.box('concrete', px, spillTop, pz, 0.6, crest - 0.3 - spillTop, d.thick - 0.2, rot, { uvScale: 2 }); }
  }
  // guarda-corpo dos dois lados, de ponta a ponta
  for (const v of [-hw + 0.08, hw - 0.08]) {
    for (let u = d.a + 1; u <= d.b - 1; u += 2.2) { const [x, z] = P(u, v); B.box('metalGray', x, crest, z, 0.07, 1.05, 0.07, rot, { uvScale: 1 }); }
    for (const y of [crest + 0.5, crest + 1.0]) { const [x, z] = P((d.a + d.b) / 2, v); B.box('metalGray', x, y, z, d.b - d.a - 2, 0.06, 0.05, rot, { uvScale: 1 }); }
    const [x, z] = P((d.a + d.b) / 2, v);
    ctx.collision.addBox(x, z, (d.b - d.a) / 2 - 1, 0.06, rot, crest, crest + 1.1, { cam: false });
  }
  // tomada d'água da tubulação: torre de concreto na beira, casinha com porta em cima
  const side = d.pipeSide ?? 1, u = side > 0 ? d.b - 4.5 : d.a + 4.5;
  {
    const [x, z] = P(u, -hw - 1.6);
    B.box('concrete', x, base, z, 3.2, crest - base, 3.2, rot, { uvScale: 2.5 });
    ctx.collision.addBox(x, z, 1.6, 1.6, rot, base, crest, { walk: true });
    const spec = { x, z, rot: rot + Math.PI / 2, w: 2.8, d: 2.8, style: 'shed', floors: 1, y0: crest, wall: 'plGray', roof: 'metalRust', roofType: 'gable', pitch: 14, win: 'window2', found: 'concrete', plinth: 0, tint: [0.95, 0.95, 0.92] };
    buildHouse(B, ctx, spec);
  }
}

// ---------------------------------------------------------------- tubulação e usina

// traçado da tubulação: da tomada d'água, na ponta da barragem do lado da usina, em linha
// reta até a parede da casa de força que olha para a represa
function pipePath(d, o) {
  const side = Math.sign(d.n[0] * (o.x - d.x) + d.n[1] * (o.z - d.z)) || 1;
  d.pipeSide = side;
  const [sx, sz] = d.P(side > 0 ? d.b - 4.5 : d.a + 4.5, d.thick / 2 + 0.2);
  // ponto da parede da usina na direção da tomada
  const dx = sx - o.x, dz = sz - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const k = Math.min(o.hx / Math.max(Math.abs(lx), 1e-6), o.hz / Math.max(Math.abs(lz), 1e-6));
  const ex = o.x + dx * k, ez = o.z + dz * k;
  const L = Math.hypot(ex - sx, ez - sz), N = Math.max(2, Math.round(L / 5));
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push([sx + (ex - sx) * i / N, sz + (ez - sz) * i / N]);
  const ux = (ex - sx) / L, uz = (ez - sz) / L, w = 3.5;
  const corridor = [[sx - uz * w, sz + ux * w], [ex - uz * w, ez + ux * w], [ex + uz * w, ez - ux * w], [sx + uz * w, sz - ux * w]];
  return { pts, corridor, dir: [ux, uz] };
}

// cano de aço enferrujado em selas de concreto; sempre descendo (onde o morro sobe
// à frente ele passa enterrado, onde o chão afunda fica em pilares)
function buildPipe(B, ctx, p, d) {
  const T = ctx.terrain, R0 = 0.65, pts = p.pts, n = pts.length;
  const g = pts.map(([x, z]) => T.heightAt(x, z));
  const y = new Array(n);
  y[n - 1] = g[n - 1] + 1.3;
  for (let i = n - 2; i >= 0; i--) y[i] = Math.max(g[i] + R0 + 0.35, y[i + 1]);
  const top = d.crest - 2.2;
  for (let i = 0; i < n; i++) y[i] = Math.min(y[i], top);
  const P3 = pts.map(([x, z], i) => [x, y[i], z]);
  // onde o cano sai de dentro do morro (veio enterrado desde a barragem): boca de concreto
  for (let i = 1; i < n; i++) {
    if (g[i - 1] > y[i - 1] + R0 && g[i] <= y[i] + R0) {
      const [x, z] = pts[i - 1];
      B.box('concrete', x, y[i - 1] - R0 - 1, z, 3.4, R0 * 2 + 2.4, 1.2, Math.atan2(p.dir[0], p.dir[1]), { uvScale: 2 });
    }
  }
  B.col = [0.62, 0.56, 0.5];
  tube(B, 'metalRust', P3, R0, 8);
  B.col = [1, 1, 1];
  const rot = Math.atan2(p.dir[0], p.dir[1]);
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], gap = y[i] - R0 - g[i];
    if (gap > 0.15 && i % 2 === 0) B.box('concrete', x, g[i] - 0.4, z, 1.6, gap + 0.4 + R0 * 0.5, 0.9, rot, { uvScale: 2 });
    if (i < n - 1) {
      const a = P3[i], b = P3[i + 1];
      ctx.collision.addBox((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, R0 + 0.05, Math.hypot(b[0] - a[0], b[2] - a[2]) / 2, rot, Math.min(a[1], b[1]) - R0, Math.max(a[1], b[1]) + R0);
    }
  }
}

// tubo de seção poligonal ao longo dos pontos [x, y, z]
function tube(B, mat, pts, r, sides) {
  const rings = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let ux = -tz, uz = tx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    // v = t × u
    const vx = ty * uz, vy = tz * ux - tx * uz, vz = -ty * ux;
    return Array.from({ length: sides }, (_, k) => {
      const ang = k / sides * Math.PI * 2, c = Math.cos(ang) * r, s = Math.sin(ang) * r;
      return [p[0] + ux * c + vx * s, p[1] + vy * s, p[2] + uz * c + vz * s];
    });
  });
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides, A = rings[i][k], Bq = rings[i + 1][k], Cq = rings[i + 1][k1], D = rings[i][k1];
      const mid = [(A[0] + Cq[0]) / 2 - (pts[i][0] + pts[i + 1][0]) / 2, (A[1] + Cq[1]) / 2 - (pts[i][1] + pts[i + 1][1]) / 2, (A[2] + Cq[2]) / 2 - (pts[i][2] + pts[i + 1][2]) / 2];
      B.quadOut(mat, A, Bq, Cq, D, mid, [[k / 2, dist / 3], [k / 2, (dist + L) / 3], [(k + 1) / 2, (dist + L) / 3], [(k + 1) / 2, dist / 3]]);
    }
    dist += L;
  }
}

// casa de força: tijolo velho, janelões industriais, telhado de chapa e o letreiro
function buildUsina(B, ctx, o) {
  const spec = {
    x: o.x, z: o.z, rot: o.rot, w: o.hx * 2, d: o.hz * 2, style: 'factory', floors: 2,
    wall: 'brickOld', roof: 'metalRust', roofType: 'gable', pitch: 20, found: 'concrete', plinth: 0.2, ov: 0.4,
    tint: [1, 0.96, 0.92], signText: 'USINA HERVAL',
  };
  spec.sign = signMaterial(spec.signText, { bg: '#e8dcc0', fg: '#5a2a18', w: 128, h: 24 });
  buildHouse(B, ctx, spec);
  ctx.zones.addBuilding({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, rot: o.rot });
}

// ---------------------------------------------------------------- roças e pastos

// lugar do interior para cerca, milho ou fardo: dentro da área jogável (com folga), longe
// da cidade, em roça ou pasto aberto, fora de rua, rio, casa, cerca e áreas reservadas
function openGround(ctx, fi, x, z, o = {}) {
  const { zones, roads, rivers } = ctx, P = PLAY_BOUNDS;
  if (x < P.x0 - 80 || x > P.x1 + 80 || z < P.z0 - 80 || z > P.z1 + 80) return false;
  if (outside(NEAR, x, z) < 30) return false;
  // (as ruas da cidade que seguem pelo interior têm calçada: a folga começa depois dela)
  const q = roads.index.clearance(x, z), rc = q.d;
  if (rc < (o.road ?? 1.5) + (q.seg?.data.sidewalk ? 2 : 0) || !zones.field(x, z, rc)) return false;
  // a mata ciliar fica (zones.isForest), e a beira do rio também
  const rv = rivers.index.nearest(x, z);
  if (rv.seg && rv.d < rv.seg.data.width / 2 + 26) return false;
  if (zones.insideBuilding(x, z, o.house ?? 5) || zones.isBlocked(x, z, 1)) return false;
  if (o.fence && fi.nearest(x, z).d < o.fence) return false;
  return true;
}

// cercas de arame farpado (palanques a cada 4 m) dos dois lados das estradas do interior,
// onde a beira é roça ou pasto; abrem nas entradas das casas e em alguns trechos
function buildFences(B, ctx, fi, R) {
  const T = ctx.terrain, STEP = 4;
  let posts = 0;
  for (const road of ctx.roads.list) {
    if (road.type === 'path' || road.type === 'footway' || road.type === 'steps') continue;
    for (const side of [-1, 1]) {
      const off = road.hw + (road.sidewalk ? 2 : 0) + 2.4;
      // pontos a cada 4 m ao longo da rua, deslocados para o lado
      const pts = [];
      let carry = 0;
      for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1], b = road.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        for (let s = carry; s < L; s += STEP) pts.push([a[0] + tx * s - tz * off * side, a[1] + tz * s + tx * off * side]);
        carry = (carry - L) % STEP; if (carry < 0) carry += STEP;
      }
      let prevOk = false, prevPost = null;
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const stretch = fbm(ax * 0.012 + side * 17.3, az * 0.012 - 4.1, 2) > 0.36;
        const ok = stretch && len > 1 && len < 6.5 && openGround(ctx, fi, ax, az, { house: 9 }) && openGround(ctx, fi, bx, bz, { house: 9 });
        if (ok) {
          const ya = T.heightAt(ax, az), yb = T.heightAt(bx, bz);
          if (!prevOk || prevPost !== k) { B.box('woodDark', ax, ya - 0.35, az, 0.13, 1.7, 0.13, Math.atan2(bx - ax, bz - az), { uvScale: 1 }); posts++; }
          B.col = [1, 1, 1];
          B.box('woodDark', bx, yb - 0.35, bz, 0.13, 1.7, 0.13, Math.atan2(bx - ax, bz - az) + R.range(-0.2, 0.2), { uvScale: 1 }); posts++;
          B.quad('arame', [ax, ya + 0.18, az], [bx, yb + 0.18, bz], [bx, yb + 1.3, bz], [ax, ya + 1.3, az], [[0, 0], [len / 1.6, 0], [len / 1.6, 1], [0, 1]]);
          fi.add(ax, az, bx, bz, 'arame');
          prevPost = k + 1;
        }
        prevOk = ok;
      }
    }
  }
  return posts;
}

// milharais: lotes de 48 m com fileiras de palha seca (uma faixa recortada a cada 2,4 m),
// na mesma direção nos lotes vizinhos
function buildCorn(B, ctx, fi) {
  const T = ctx.terrain, P = PLAY_BOUNDS, PLOT = 48, ROW = 2.4, SEGL = 4;
  // o meio de cada pedaço de fileira (o minimapa pinta a roça)
  const spots = ctx.countryside.cornSpots = [];
  for (let cz = P.z0 - 48; cz < P.z1 + 48; cz += PLOT) for (let cx = P.x0 - 48; cx < P.x1 + 48; cx += PLOT) {
    const mx = cx + PLOT / 2, mz = cz + PLOT / 2;
    if (outside(NEAR, mx, mz) < 50) continue;
    if (fbm(mx * 0.0045 + 41.7, mz * 0.0045 - 13.2, 3) < 0.6) continue;
    if (!ctx.zones.field(mx, mz)) continue;
    const ang = Math.round(fbm(mx * 0.002 - 7.3, mz * 0.002 + 3.1, 2) * 6) * Math.PI / 6;
    const ax = Math.cos(ang), az = Math.sin(ang), px = -az, pz = ax;
    const inPlot = (x, z) => x >= cx && x < cx + PLOT && z >= cz && z < cz + PLOT;
    const ok = (x, z) => inPlot(x, z) && openGround(ctx, fi, x, z, { road: 4, house: 7, fence: 1.4 });
    for (let o = -36; o <= 36; o += ROW) {
      // cada ponta serve a dois pedaços da fileira: testa uma vez só
      let prev = ok(mx + px * o + ax * -36, mz + pz * o + az * -36);
      for (let s = -36; s < 36; s += SEGL) {
        const x0 = mx + px * o + ax * s, z0 = mz + pz * o + az * s, x1 = x0 + ax * SEGL, z1 = z0 + az * SEGL;
        const was = prev;
        prev = ok(x1, z1);
        if (!was || !prev) continue;
        const y0 = T.heightAt(x0, z0) - 0.12, y1 = T.heightAt(x1, z1) - 0.12;
        const k = 0.86 + 0.18 * fbm(x0 * 0.05, z0 * 0.05, 2), h = 1.75 + 0.5 * fbm(x0 * 0.09 + 5, z0 * 0.09, 2);
        B.col = [k, k * 0.98, k * 0.92];
        const u0 = s / 2.5;
        B.quad('milho', [x0, y0, z0], [x1, y1, z1], [x1, y1 + h, z1], [x0, y0 + h, z0], [[u0, 0], [u0 + SEGL / 2.5, 0], [u0 + SEGL / 2.5, 1], [u0, 1]]);
        spots.push([(x0 + x1) / 2, (z0 + z1) / 2]);
      }
    }
  }
  B.col = [1, 1, 1];
  return spots.length;
}

// fardos redondos nos pastos, perto das estradas: fileiras de palha ou de silagem
// embrulhada em plástico branco, esperando o trator
function buildBales(B, ctx, fi, R) {
  const T = ctx.terrain;
  let count = 0;
  for (const road of ctx.roads.list) {
    if (road.type === 'path' || road.type === 'footway') continue;
    for (let i = 1; i < road.pts.length; i += 15) {
      if (!R.chance(0.22)) continue;
      const a = road.pts[i - 1], b = road.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, side = R.chance(0.5) ? 1 : -1, off = road.hw + R.range(10, 28);
      const cx = b[0] - tz * off * side, cz = b[1] + tx * off * side;
      if (!openGround(ctx, fi, cx, cz, { road: 6, house: 8, fence: 2 })) continue;
      const silage = R.chance(0.5), nb = R.int(3, 8), ang = Math.atan2(tz, tx) + R.range(-0.5, 0.5);
      const dx = Math.cos(ang), dz = Math.sin(ang);
      for (let k = 0; k < nb; k++) {
        const x = cx + dx * k * 1.9 + R.range(-0.3, 0.3), z = cz + dz * k * 1.9 + R.range(-0.3, 0.3);
        if (!openGround(ctx, fi, x, z, { road: 5, house: 6, fence: 1.5 })) continue;
        // eixo deitado, atravessado na fileira
        bale(B, ctx, x, T.heightAt(x, z), z, ang + Math.PI / 2 + R.range(-0.25, 0.25), silage);
        count++;
      }
    }
  }
  return count;
}

function bale(B, ctx, x, g, z, ang, silage) {
  const r = 0.72, hl = 0.62, sides = 8, ax = Math.cos(ang), az = Math.sin(ang), y = g + r - 0.06;
  const side = silage ? 'silagem' : 'fardo', end = silage ? 'silagem' : 'fardoEnd';
  // anel em volta do eixo: u = direção horizontal perpendicular, vertical
  const ring = s => Array.from({ length: sides }, (_, k) => {
    const a = k / sides * Math.PI * 2, c = Math.cos(a) * r, sn = Math.sin(a) * r;
    return [x + ax * hl * s - az * c, y + sn, z + az * hl * s + ax * c];
  });
  const A = ring(-1), Bq = ring(1);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides, a = (k + 0.5) / sides * Math.PI * 2;
    B.quadOut(side, A[k], Bq[k], Bq[k1], A[k1], [-az * Math.cos(a), Math.sin(a), ax * Math.cos(a)], [[k / 4, 0], [k / 4, 1], [(k + 1) / 4, 1], [(k + 1) / 4, 0]]);
  }
  for (const [R, s] of [[A, -1], [Bq, 1]]) {
    const c = [x + ax * hl * s, y, z + az * hl * s];
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides, a0 = k / sides * Math.PI * 2, a1 = k1 / sides * Math.PI * 2;
      const uv = a => [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5];
      // normal para fora da ponta
      const n = [ax * s, 0, az * s], u = [R[k][0] - c[0], R[k][1] - c[1], R[k][2] - c[2]], v = [R[k1][0] - c[0], R[k1][1] - c[1], R[k1][2] - c[2]];
      const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) B.tri(end, c, R[k], R[k1], [0.5, 0.5], uv(a0), uv(a1));
      else B.tri(end, c, R[k1], R[k], [0.5, 0.5], uv(a1), uv(a0));
    }
  }
  ctx.collision.addBox(x, z, r, hl + 0.02, Math.atan2(ax, az), g - 0.2, g + r * 2 - 0.06);
}
