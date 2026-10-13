// Utilitários geométricos 2D (plano XZ) e aleatoriedade determinística

export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a0, a1) => a0 + (a1 - a0) * f();
  f.int = (a0, a1) => Math.floor(a0 + (a1 - a0 + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  return f;
}

// ruído de valor 2D suave (determinístico)
function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 3) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, z * f) * amp; f *= 2; amp *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export function polyLength(pts) {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// suaviza cantos (Chaikin), mantém as pontas
export function chaikin(pts, iter = 2) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// reamostra uma polilinha a cada `step` metros
export function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d < L) {
      const t = d / L;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += step;
    }
    carry = L - (d - step);
  }
  const last = pts[pts.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.3) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

// distância de ponto a segmento; devolve [dist, t]
export function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t, z = az + dz * t;
  return [Math.hypot(px - x, pz - z), t];
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyCentroid(poly) {
  let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

export function distToPoly(x, z, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    d = Math.min(d, distSeg(x, z, a[0], a[1], b[0], b[1])[0]);
  }
  return pointInPoly(x, z, poly) ? -d : d;
}

// interseção de segmentos; devolve [t, u] ou null
export function segIntersect(a, b, c, d) {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a / 2);
}

// menor retângulo (alinhado a uma das arestas) que contém o polígono
export function minRect(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const rot = -Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(rot), s = Math.sin(rot);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { const lx = x * c - z * s, lz = x * s + z * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); }
    const A = (x1 - x0) * (z1 - z0);
    if (!best || A < best.A - 1e-6) {
      const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
      best = { A, x: lx * c + lz * s, z: -lx * s + lz * c, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, rot };
    }
  }
  return best;
}

// caixas orientadas 2D: {x, z, hx, hz, rot}
export function obbCorners(b) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [[-b.hx, -b.hz], [b.hx, -b.hz], [b.hx, b.hz], [-b.hx, b.hz]].map(([lx, lz]) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c]);
}

export function obbOverlap(a, b, margin = 0) {
  const A = obbCorners({ ...a, hx: a.hx + margin, hz: a.hz + margin }), B = obbCorners(b);
  const axes = [];
  for (const P of [A, B]) for (let i = 0; i < 2; i++) {
    const e = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]];
    axes.push([-e[1], e[0]]);
  }
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const v = p[0] * ax[0] + p[1] * ax[1]; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
    for (const p of B) { const v = p[0] * ax[0] + p[1] * ax[1]; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

// índice espacial de segmentos (ruas, rios) para consultas de distância
export class SegmentIndex {
  constructor(cell = 25, reach = 40) {
    this.cell = cell; this.reach = reach; this.map = new Map(); this.segs = [];
  }
  add(ax, az, bx, bz, data) {
    const s = { ax, az, bx, bz, data };
    const id = this.segs.push(s) - 1;
    const r = this.reach, c = this.cell;
    const x0 = Math.floor((Math.min(ax, bx) - r) / c), x1 = Math.floor((Math.max(ax, bx) + r) / c);
    const z0 = Math.floor((Math.min(az, bz) - r) / c), z1 = Math.floor((Math.max(az, bz) + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i * 100000 + j;
      let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); }
      l.push(id);
    }
  }
  addPolyline(pts, data) {
    const first = this.segs.length;
    for (let i = 1; i < pts.length; i++) this.add(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], data);
    // posição de cada trecho na linha: i de n (o primeiro e o último têm uma ponta solta)
    for (let k = first; k < this.segs.length; k++) { this.segs[k].i = k - first; this.segs[k].n = this.segs.length - first; }
  }
  candidates(x, z) {
    return this.map.get(Math.floor(x / this.cell) * 100000 + Math.floor(z / this.cell)) || [];
  }
  // menor distância (até `reach`) e o segmento correspondente
  nearest(x, z, filter = null) {
    let best = Infinity, bs = null, bt = 0;
    for (const id of this.candidates(x, z)) {
      const s = this.segs[id];
      if (filter && !filter(s.data)) continue;
      const [d, t] = distSeg(x, z, s.ax, s.az, s.bx, s.bz);
      if (d < best) { best = d; bs = s; bt = t; }
    }
    return { d: best, seg: bs, t: bt };
  }
  // menor "folga" até a borda: dist - largura/2 (usa data.hw)
  clearance(x, z, filter = null) {
    let best = Infinity, bs = null;
    for (const id of this.candidates(x, z)) {
      const s = this.segs[id];
      if (filter && !filter(s.data)) continue;
      const d = distSeg(x, z, s.ax, s.az, s.bx, s.bz)[0] - (s.data.hw || 0);
      if (d < best) { best = d; bs = s; }
    }
    return { d: best, seg: bs };
  }
}
