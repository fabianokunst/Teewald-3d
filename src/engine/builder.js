import * as THREE from 'three';

// Acumula triângulos por material (e por pedaço do mapa, para o frustum culling)
// e gera malhas estáticas mescladas. Vetores são arrays [x, y, z].

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export class MeshBuilder {
  constructor(chunk = 200) {
    this.chunk = chunk;
    this.groups = new Map();
    this.col = [1, 1, 1];
  }

  _group(mat, x, z) {
    let key = mat;
    if (this.chunk) key += '|' + Math.floor(x / this.chunk) + ',' + Math.floor(z / this.chunk);
    let g = this.groups.get(key);
    if (!g) { g = { mat, pos: [], uv: [], nor: [], col: [] }; this.groups.set(key, g); }
    return g;
  }

  // triângulo com normal plana; cores por vértice opcionais
  tri(mat, a, b, c, ua, ub, uc, ca, cb, cc) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const g = this._group(mat, (a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3);
    const col = this.col;
    ca = ca || col; cb = cb || ca; cc = cc || ca;
    g.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    g.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    g.nor.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    g.col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  }

  // quadrilátero a-b-c-d (anti-horário visto de frente); seg > 0 subdivide em grade
  quad(mat, a, b, c, d, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], cols = null, seg = 0) {
    let nu = 1, nv = 1;
    if (seg > 0) {
      nu = Math.max(1, Math.min(16, Math.ceil(Math.hypot(...sub(b, a)) / seg)));
      nv = Math.max(1, Math.min(16, Math.ceil(Math.hypot(...sub(d, a)) / seg)));
    }
    const C = cols || [this.col, this.col, this.col, this.col];
    if (nu === 1 && nv === 1) {
      this.tri(mat, a, b, c, uv[0], uv[1], uv[2], C[0], C[1], C[2]);
      this.tri(mat, a, c, d, uv[0], uv[2], uv[3], C[0], C[2], C[3]);
      return;
    }
    const P = (s, t) => lerp3(lerp3(a, b, s), lerp3(d, c, s), t);
    const U = (s, t) => lerp2(lerp2(uv[0], uv[1], s), lerp2(uv[3], uv[2], s), t);
    const K = (s, t) => lerp3(lerp3(C[0], C[1], s), lerp3(C[3], C[2], s), t);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const s0 = i / nu, s1 = (i + 1) / nu, t0 = j / nv, t1 = (j + 1) / nv;
      const pa = P(s0, t0), pb = P(s1, t0), pc = P(s1, t1), pd = P(s0, t1);
      const ua = U(s0, t0), ub = U(s1, t0), uc = U(s1, t1), ud = U(s0, t1);
      const ka = K(s0, t0), kb = K(s1, t0), kc = K(s1, t1), kd = K(s0, t1);
      this.tri(mat, pa, pb, pc, ua, ub, uc, ka, kb, kc);
      this.tri(mat, pa, pc, pd, ua, uc, ud, ka, kc, kd);
    }
  }

  // quadrilátero com a face virada para "out" (qualquer ordem de vértices)
  quadOut(mat, a, b, c, d, out, uv, cols) {
    const u = sub(b, a), v = sub(c, a), n = cross(u, v);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) this.quad(mat, d, c, b, a, uv && [uv[3], uv[2], uv[1], uv[0]], cols && [cols[3], cols[2], cols[1], cols[0]]);
    else this.quad(mat, a, b, c, d, uv, cols);
  }

  // parede vertical de (x0,z0) a (x1,z1), normal para a direita do sentido p0->p1
  // uvScale = metros por repetição da textura
  wall(mat, x0, z0, x1, z1, y0, y1, o = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const s = o.uvScale || 3, u0 = o.u0 || 0;
    const v0 = (o.vOff ?? y0) / s, v1 = (o.vOff !== undefined ? o.vOff + (y1 - y0) : y1) / s;
    const uv = o.uv || [[u0, v0], [u0 + len / s, v0], [u0 + len / s, v1], [u0, v1]];
    const dark = o.ao ?? 0.78;
    const cb = o.col ? o.col.map(v => v * dark) : this.col.map(v => v * dark);
    const ct = o.col || this.col;
    this.quad(mat, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], uv, [cb, cb, ct, ct], o.seg ?? 4);
  }

  // caixa alinhada (com rotação em Y). y = base
  box(mat, cx, y, cz, sx, sy, sz, rot = 0, o = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hx = sx / 2, hz = sz / 2;
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const p = [P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz)];
    const us = o.uvScale || 2;
    const sideMat = o.side || mat;
    const col = o.col;
    // lados (sentido horário visto de cima => normal para fora)
    const order = [[0, 3], [3, 2], [2, 1], [1, 0]];
    let u = 0;
    for (const [i, j] of order) {
      const [x0, z0] = p[i], [x1, z1] = p[j];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (o.faceUV) this.wall(sideMat, x0, z0, x1, z1, y, y + sy, { uv: [[0, 0], [1, 0], [1, 1], [0, 1]], ao: o.ao ?? 0.85, col, seg: o.seg ?? 0 });
      else this.wall(sideMat, x0, z0, x1, z1, y, y + sy, { uvScale: us, u0: u, ao: o.ao ?? 0.85, col, seg: o.seg ?? 0 });
      u += len / us;
    }
    if (o.top !== false) {
      const t = y + sy, tm = o.topMat || mat;
      const tu = o.topUV || ((x, z) => [x / us, z / us]);
      this.quad(tm, [p[0][0], t, p[0][1]], [p[3][0], t, p[3][1]], [p[2][0], t, p[2][1]], [p[1][0], t, p[1][1]],
        [tu(p[0][0], p[0][1]), tu(p[3][0], p[3][1]), tu(p[2][0], p[2][1]), tu(p[1][0], p[1][1])], col ? [col, col, col, col] : null);
    }
    if (o.bottom) {
      const tu = o.faceUV ? null : o.topUV || ((x, z) => [x / us, z / us]);
      this.quad(mat, [p[0][0], y, p[0][1]], [p[1][0], y, p[1][1]], [p[2][0], y, p[2][1]], [p[3][0], y, p[3][1]],
        tu ? [tu(p[0][0], p[0][1]), tu(p[1][0], p[1][1]), tu(p[2][0], p[2][1]), tu(p[3][0], p[3][1])] : undefined, col ? [col, col, col, col] : null);
    }
  }

  // cilindro / cone truncado vertical
  cylinder(mat, x, y, z, r0, r1, h, sides = 6, o = {}) {
    const us = o.uRepeat || 1, vs = o.vRepeat || h / 2;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2 + (o.rot || 0), a1 = ((i + 1) / sides) * Math.PI * 2 + (o.rot || 0);
      const b0 = [x + Math.cos(a0) * r0, y, z + Math.sin(a0) * r0];
      const b1 = [x + Math.cos(a1) * r0, y, z + Math.sin(a1) * r0];
      const t0 = [x + Math.cos(a0) * r1, y + h, z + Math.sin(a0) * r1];
      const t1 = [x + Math.cos(a1) * r1, y + h, z + Math.sin(a1) * r1];
      const u0 = (i / sides) * us, u1 = ((i + 1) / sides) * us;
      this.quad(mat, b1, b0, t0, t1, [[u1, 0], [u0, 0], [u0, vs], [u1, vs]], o.cols || null);
    }
    if (o.cap && r1 > 0) {
      const top = [x, y + h, z];
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2 + (o.rot || 0), a1 = ((i + 1) / sides) * Math.PI * 2 + (o.rot || 0);
        const t0 = [x + Math.cos(a0) * r1, y + h, z + Math.sin(a0) * r1];
        const t1 = [x + Math.cos(a1) * r1, y + h, z + Math.sin(a1) * r1];
        this.tri(o.capMat || mat, top, t1, t0, [0.5, 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5]);
      }
    }
  }

  // polígono horizontal (convexo ou em leque a partir do centroide)
  polygon(mat, pts, y, uvScale = 4, yFn = null) {
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0] / pts.length; cz += p[1] / pts.length; }
    const Y = (x, z) => (yFn ? yFn(x, z) : y);
    const c = [cx, Y(cx, cz), cz];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const pa = [a[0], Y(a[0], a[1]), a[1]], pb = [b[0], Y(b[0], b[1]), b[1]];
      // garante normal para cima
      const n = cross(sub(pb, c), sub(pa, c));
      if (n[1] >= 0) this.tri(mat, c, pb, pa, [cx / uvScale, cz / uvScale], [b[0] / uvScale, b[1] / uvScale], [a[0] / uvScale, a[1] / uvScale]);
      else this.tri(mat, c, pa, pb, [cx / uvScale, cz / uvScale], [a[0] / uvScale, a[1] / uvScale], [b[0] / uvScale, b[1] / uvScale]);
    }
  }

  build(materials) {
    const root = new THREE.Group();
    for (const g of this.groups.values()) {
      if (!g.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      geo.computeBoundingSphere();
      const mat = materials[g.mat];
      if (!mat) { console.warn('material ausente:', g.mat); continue; }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = g.mat;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
    this.groups.clear();
    return root;
  }

  get triangleCount() {
    let n = 0; for (const g of this.groups.values()) n += g.pos.length / 9; return n;
  }
}

// geometria simples (não mesclada) para objetos instanciados / personagem
export function geometryFromBuilder(b, mat) {
  const g = [...b.groups.values()].filter(x => x.mat === mat);
  const pos = [], nor = [], uv = [], col = [];
  for (const x of g) { pos.push(...x.pos); nor.push(...x.nor); uv.push(...x.uv); col.push(...x.col); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}
