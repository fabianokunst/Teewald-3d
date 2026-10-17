import { pointInPoly, distToPoly, fbm, obbOverlap, obbCorners, smooth } from './geo.js';
import { NEAR } from './terrain.js';

const cellKey = (i, j) => i * 100003 + j;
function bbox(poly) {
  const q = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of poly) { q[0] = Math.min(q[0], x); q[1] = Math.min(q[1], z); q[2] = Math.max(q[2], x); q[3] = Math.max(q[3], z); }
  return q;
}

// Áreas especiais: onde não construir casas, onde há mata, e nomes de lugares
export class Zones {
  constructor(ctx) {
    this.ctx = ctx;
    this.blocks = [];      // { poly, margin }
    this.places = [];      // { poly, name, prio }
    this.noForest = [];    // polígonos sem mata
    this.obbs = [];        // prédios já posicionados
    this.grid = new Map(); // prédios por quadra de 64 m (consultas rápidas no mapa ampliado)
  }

  block(poly, margin = 0) { this.blocks.push({ poly, margin, box: bbox(poly) }); }
  place(poly, name, prio = 1) { this.places.push({ poly, name, prio }); }
  clearForest(poly) { this.noForest.push(poly); poly.box = bbox(poly); }

  isBlocked(x, z, extra = 0) {
    for (const b of this.blocks) {
      // longe da caixa da área (mais a margem), nem precisa medir a distância
      const m = Math.max(0, b.margin + extra), q = b.box;
      if (x < q[0] - m || x > q[2] + m || z < q[1] - m || z > q[3] + m) continue;
      if (distToPoly(x, z, b.poly) < b.margin + extra) return true;
    }
    return false;
  }

  // a caixa invade alguma área reservada? Testa a borda a cada 3 m, o miolo e os
  // vértices da área dentro da caixa (um prédio comprido pode ter o centro de fora)
  obbBlocked(obb, extra = 0) {
    const cs = obbCorners(obb), pts = [];
    for (let i = 0; i < 4; i++) {
      const a = cs[i], b = cs[(i + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) pts.push([(cs[0][0] + cs[2][0]) / 2 + u * (cs[1][0] - cs[0][0]) + v * (cs[3][0] - cs[0][0]), (cs[0][1] + cs[2][1]) / 2 + u * (cs[1][1] - cs[0][1]) + v * (cs[3][1] - cs[0][1])]);
    if (pts.some(([x, z]) => this.isBlocked(x, z, extra))) return true;
    return this.blocks.some(b => b.poly.some(([x, z]) => pointInPoly(x, z, cs)));
  }

  addBuilding(obb) {
    this.obbs.push(obb);
    const k = cellKey(Math.floor(obb.x / 64), Math.floor(obb.z / 64));
    let l = this.grid.get(k); if (!l) this.grid.set(k, l = []);
    l.push(obb);
  }
  // prédios com o centro nas 9 quadras em volta de (x, z): todos os que estão a menos de 64 m
  near(x, z) {
    const i = Math.floor(x / 64), j = Math.floor(z / 64), out = [];
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const l = this.grid.get(cellKey(a, b));
      if (l) for (const o of l) out.push(o);
    }
    return out;
  }
  overlapsBuilding(obb, margin) {
    for (const o of this.near(obb.x, obb.z)) {
      if (Math.abs(o.x - obb.x) > 60 || Math.abs(o.z - obb.z) > 60) continue;
      if (obbOverlap(obb, o, margin)) return true;
    }
    return false;
  }
  insideBuilding(x, z, margin = 0) {
    for (const o of this.near(x, z)) {
      if (Math.abs(o.x - x) > 40 || Math.abs(o.z - z) > 40) continue;
      const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < o.hx + margin && Math.abs(lz) < o.hz + margin) return true;
    }
    return false;
  }

  isForest(x, z) {
    const { roads, rivers } = this.ctx;
    for (const p of this.noForest) {
      const q = p.box;
      if (x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3] && pointInPoly(x, z, p)) return false;
    }
    const rc = roads.index.clearance(x, z).d;
    const rv = rivers.index.nearest(x, z);
    const f = fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 3);
    if (rv.seg && rv.d < rv.seg.data.width / 2 + 16 + f * 10 && rc > 5) return true;
    if (this.field(x, z, rc)) return false;
    return rc > 24 + f * 22;
  }

  // área ampliada: roça ou pasto aberto entre as matas (a mata ciliar fica). Mais perto das
  // estradas o mato foi derrubado para plantar e criar gado. Dentro da grade da cidade nada
  // muda, e a passagem para fora dela é gradual (sem uma linha reta de mato)
  field(x, z, rc = null) {
    if (!this.ctx.terrain?.ring) return false;
    const n = NEAR, e = Math.hypot(Math.max(n.x0 - x, 0, x - n.x1), Math.max(n.z0 - z, 0, z - n.z1));
    if (e <= 0) return false;
    rc ??= this.ctx.roads.index.clearance(x, z).d;
    const f = fbm(x * 0.004 - 11.3, z * 0.004 + 5.7, 3);
    const lim = 0.5 - (rc < 160 ? 0.13 * (1 - rc / 160) : 0) + (1 - smooth(e / 180)) * 0.7;
    return f > lim;
  }

  placeAt(x, z) {
    let best = null;
    for (const p of this.places) if ((!best || p.prio > best.prio) && pointInPoly(x, z, p.poly)) best = p;
    return best ? best.name : null;
  }
}
