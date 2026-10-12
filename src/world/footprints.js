import { minRect, polyArea, pointInPoly } from './geo.js';

// Contornos reais de prédios (Microsoft Building Footprints) viram caixas.
// Contornos em L ou mesclados são divididos em retângulos numa grade de 1 m.
export function footprintRects(poly) {
  const r = minRect(poly);
  const area = polyArea(poly);
  if (poly.length <= 5 || area / (4 * r.hx * r.hz) > 0.86) return [{ x: r.x, z: r.z, hx: r.hx, hz: r.hz, rot: r.rot }];
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  const local = poly.map(([x, z]) => { const dx = x - r.x, dz = z - r.z; return [dx * c - dz * s, dx * s + dz * c]; });
  const cell = 1;
  const nx = Math.max(1, Math.round((r.hx * 2) / cell)), nz = Math.max(1, Math.round((r.hz * 2) / cell));
  const sx = (r.hx * 2) / nx, sz = (r.hz * 2) / nz;
  const inside = [];
  for (let j = 0; j < nz; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) row.push(pointInPoly(-r.hx + (i + 0.5) * sx, -r.hz + (j + 0.5) * sz, local) ? 1 : 0);
    inside.push(row);
  }
  const out = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (inside[j][i] !== 1) continue;
    let i1 = i;
    while (i1 + 1 < nx && inside[j][i1 + 1] === 1) i1++;
    let j1 = j;
    const rowOk = jj => { for (let k = i; k <= i1; k++) if (inside[jj][k] !== 1) return false; return true; };
    while (j1 + 1 < nz && rowOk(j1 + 1)) j1++;
    for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) inside[jj][k] = 2;
    const w = (i1 - i + 1) * sx, d = (j1 - j + 1) * sz;
    if (w < 2.5 || d < 2.5 || w * d < 9) continue;
    const lx = -r.hx + (i + (i1 - i + 1) / 2) * sx, lz = -r.hz + (j + (j1 - j + 1) / 2) * sz;
    out.push({ x: r.x + lx * c + lz * s, z: r.z - lx * s + lz * c, hx: w / 2, hz: d / 2, rot: r.rot });
  }
  return out;
}

export function prepareFootprints(mapdata) {
  const list = [];
  (mapdata.buildings || []).forEach((poly, id) => {
    for (const r of footprintRects(poly)) list.push({ ...r, id, area: 4 * r.hx * r.hz, used: false });
  });
  return list;
}

// reserva o contorno mais adequado perto de um ponto (prédios conhecidos)
export function claimFootprint(ctx, x, z, maxD = 25, minArea = 0) {
  let best = null, bd = Infinity;
  for (const f of ctx.footprints) {
    if (f.used || f.area < minArea) continue;
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const ox = Math.max(0, Math.abs(lx) - f.hx), oz = Math.max(0, Math.abs(lz) - f.hz);
    const d = Math.hypot(ox, oz) - Math.min(f.area, 2000) * 0.001; // dentro: d=0 (prefere os maiores)
    if (d < bd && d < maxD) { bd = d; best = f; }
  }
  if (best) best.used = true;
  return best;
}
