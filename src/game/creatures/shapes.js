import * as THREE from 'three';

// Peças low poly das criaturas: sólidos de revolução com cor por vértice,
// membros pendurados de uma junta e cones (garras, chifres, espinhos).
// Mesmo jeito do chupacabras: peças rígidas presas a juntas, como no PS1.

export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const smooth = t => t * t * (3 - 2 * t);

// sólido de revolução ao longo de +y; prof = [[y, r], ...] de baixo para cima.
// sx/sz achatam a seção; col(t, a) = cor do vértice (t = 0..1 ao longo, a = π/2 é a frente +z)
export function blob(prof, n, o = {}) {
  const sx = o.sx ?? 1, sz = o.sz ?? 1, col = o.col || (() => [1, 1, 1]);
  const y0 = prof[0][0], len = (prof[prof.length - 1][0] - y0) || 1;
  const pos = [], nor = [], uv = [], cl = [], idx = [];
  prof.forEach(([y, r], i) => {
    const pa = prof[Math.max(0, i - 1)], pb = prof[Math.min(prof.length - 1, i + 1)];
    const slope = (pb[1] - pa[1]) / Math.max(1e-4, pb[0] - pa[0]);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const ox = o.off ? o.off(y, a)[0] : 0, oz = o.off ? o.off(y, a)[1] : 0;
      pos.push(ca * r * sx + ox, y, sa * r * sz + oz);
      if (r < 1e-4) nor.push(0, i === 0 ? -1 : 1, 0);
      else {
        let nx = ca / sx, nz = sa / sz;
        const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        const L = Math.hypot(1, slope);
        nor.push(nx / L, -slope / L, nz / L);
      }
      uv.push((k / n) * (o.uRep ?? 1), ((y - y0) / len) * (o.vRep ?? 1));
      const c = col((y - y0) / len, a);
      cl.push(c[0], c[1], c[2]);
    }
  });
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  return g;
}

// membro pendurado para -y a partir da junta
export const limb = (len, r0, r1, n = 5, col = null) => blob([[-len - r1 * 0.6, 0], [-len, r1], [-len * 0.5, (r0 + r1) * 0.55], [0, r0], [r0 * 0.6, 0]], n, { col: col || (() => [1, 1, 1]), vRep: 2 });

// cone para +y (espinhos, garras, presas, chifres)
export const cone = (len, r, c0, c1, n = 4, sz = 1) => blob([[-0.001, 0], [0, r], [len, 0]], n, { sz, col: t => mix3(c0, c1, t) });

// elipsoide deitado ao longo de +z (corpo de quadrúpede, cabeça)
export function ellipsoid(len, rx, ry, n = 8, col = null, rings = 7) {
  const prof = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = -len / 2 + t * len, r = Math.sin(t * Math.PI);
    prof.push([y, Math.max(i === 0 || i === rings ? 0 : 0.0001, r)]);
  }
  const g = blob(prof, n, { sx: rx, sz: ry, col: col || (() => [1, 1, 1]) });
  g.rotateX(Math.PI / 2);
  return g;
}

// cor de vértice pintada em toda a geometria
export function paint(geo, rgb) {
  const c = geo.getAttribute('color');
  for (let i = 0; i < c.count; i++) c.setXYZ(i, rgb[0], rgb[1], rgb[2]);
  return geo;
}

// grupo/junta com posição
export function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
