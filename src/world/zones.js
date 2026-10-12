import { pointInPoly, distToPoly, fbm, obbOverlap } from './geo.js';

// Áreas especiais: onde não construir casas, onde há mata, e nomes de lugares
export class Zones {
  constructor(ctx) {
    this.ctx = ctx;
    this.blocks = [];      // { poly, margin }
    this.places = [];      // { poly, name, prio }
    this.noForest = [];    // polígonos sem mata
    this.obbs = [];        // prédios já posicionados
  }

  block(poly, margin = 0) { this.blocks.push({ poly, margin }); }
  place(poly, name, prio = 1) { this.places.push({ poly, name, prio }); }
  clearForest(poly) { this.noForest.push(poly); }

  isBlocked(x, z, extra = 0) {
    for (const b of this.blocks) if (distToPoly(x, z, b.poly) < b.margin + extra) return true;
    return false;
  }

  addBuilding(obb) { this.obbs.push(obb); }
  overlapsBuilding(obb, margin) {
    for (const o of this.obbs) {
      if (Math.abs(o.x - obb.x) > 60 || Math.abs(o.z - obb.z) > 60) continue;
      if (obbOverlap(obb, o, margin)) return true;
    }
    return false;
  }
  insideBuilding(x, z, margin = 0) {
    for (const o of this.obbs) {
      if (Math.abs(o.x - x) > 40 || Math.abs(o.z - z) > 40) continue;
      const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < o.hx + margin && Math.abs(lz) < o.hz + margin) return true;
    }
    return false;
  }

  isForest(x, z) {
    const { roads, rivers } = this.ctx;
    for (const p of this.noForest) if (pointInPoly(x, z, p)) return false;
    const rc = roads.index.clearance(x, z).d;
    const rv = rivers.index.nearest(x, z);
    const f = fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 3);
    if (rv.seg && rv.d < rv.seg.data.width / 2 + 16 + f * 10 && rc > 5) return true;
    return rc > 24 + f * 22;
  }

  placeAt(x, z) {
    let best = null;
    for (const p of this.places) if ((!best || p.prio > best.prio) && pointInPoly(x, z, p.poly)) best = p;
    return best ? best.name : null;
  }
}
