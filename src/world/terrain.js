import * as THREE from 'three';
import { clamp, smooth, fbm, distToPoly, pointInPoly } from './geo.js';

// Relevo real (SRTM 30m) da região, com as ruas aplainadas e o leito do rio escavado.
const BASE = 380;               // altitude (m) que vira y = 0
export const NEAR = { x0: -560, x1: 700, z0: -620, z1: 600, step: 5 };
const FAR = { x0: -1600, x1: 1600, z0: -1600, z1: 1600, step: 40 };

function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

function sampleGrid(g, x, z) {
  const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const H = (a, b) => g.h[clamp(b, 0, g.nz - 1) * g.nx + clamp(a, 0, g.nx - 1)];
  const row = k => cubic(H(i - 1, k), H(i, k), H(i + 1, k), H(i + 2, k), tx);
  return cubic(row(j - 1), row(j), row(j + 1), row(j + 2), tz);
}

export class Terrain {
  constructor(mapdata) {
    this.fine = mapdata.elev.fine;
    this.wide = mapdata.elev.wide;
    const n = NEAR;
    this.nx = Math.round((n.x1 - n.x0) / n.step) + 1;
    this.nz = Math.round((n.z1 - n.z0) / n.step) + 1;
    this.H0 = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      this.H0[j * this.nx + i] = this.raw(n.x0 + i * n.step, n.z0 + j * n.step);
    }
    // campo suavizado usado pelas ruas (cruzamentos ficam na mesma altura)
    this.HR = this._blur(this.H0, 4, 3);
    this.H = Float32Array.from(this.H0);
    this.pads = [];
  }

  raw(x, z) {
    const f = this.fine;
    const inFine = x > f.x0 + f.step && x < f.x1 - f.step && z > f.z0 + f.step && z < f.z1 - f.step;
    const hw = sampleGrid(this.wide, x, z);
    if (!inFine) return hw - BASE;
    const hf = sampleGrid(f, x, z);
    // transição suave perto da borda da grade fina
    const e = Math.min(x - f.x0, f.x1 - x, z - f.z0, f.z1 - z);
    const k = smooth((e - f.step) / (f.step * 2));
    return hf * k + hw * (1 - k) - BASE;
  }

  _blur(src, r, passes) {
    const { nx, nz } = this;
    let a = Float32Array.from(src), b = new Float32Array(a.length);
    for (let p = 0; p < passes; p++) {
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        let s = 0, c = 0;
        for (let k = -r; k <= r; k++) { const ii = clamp(i + k, 0, nx - 1); s += a[j * nx + ii]; c++; }
        b[j * nx + i] = s / c;
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        let s = 0, c = 0;
        for (let k = -r; k <= r; k++) { const jj = clamp(j + k, 0, nz - 1); s += b[jj * nx + i]; c++; }
        a[j * nx + i] = s / c;
      }
    }
    return a;
  }

  _bilinear(arr, x, z, fallback) {
    const n = NEAR;
    const fx = (x - n.x0) / n.step, fz = (z - n.z0) / n.step;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return fallback(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = arr[j * this.nx + i], b = arr[j * this.nx + i + 1], c = arr[(j + 1) * this.nx + i], d = arr[(j + 1) * this.nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  roadHeight(x, z) { return this._bilinear(this.HR, x, z, (a, b) => this.raw(a, b)); }

  // pad = { poly, h, margin } aplaina uma área (praça, igreja, campo...)
  addPad(poly, h, margin = 8) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    this.pads.push({ poly, h, margin, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
  }

  // aplica ruas, áreas planas e rios na grade final
  finalize(roadIndex, riverIndex) {
    const n = NEAR, { nx, nz } = this;
    this.roadIndex = roadIndex; this.riverIndex = riverIndex;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = n.x0 + i * n.step, z = n.z0 + j * n.step, k = j * nx + i;
      let h = this.H0[k];
      const hr = this.HR[k];
      const r = roadIndex.clearance(x, z);
      if (r.d < 7.5) h = hr;
      else if (r.d < 18) h = hr + (h - hr) * smooth((r.d - 7.5) / 10.5);
      for (const p of this.pads) {
        if (x < p.bb[0] - p.margin || x > p.bb[2] + p.margin || z < p.bb[1] - p.margin || z > p.bb[3] + p.margin) continue;
        const d = distToPoly(x, z, p.poly);
        if (d >= p.margin) continue;
        const ph = typeof p.h === 'function' ? p.h(x, z) : p.h;
        if (d < 0) h = ph;
        else h = ph + (h - ph) * smooth(d / p.margin);
      }
      const w = riverIndex.nearest(x, z);
      if (w.seg) {
        const rv = w.seg.data, wl = rv.levelAt(w.seg, w.t), hw = rv.width / 2;
        if (w.d < hw) h = Math.min(h, wl - rv.depth);
        else if (w.d < hw + rv.bank) h = Math.min(h, (wl - rv.depth * 0.25) + (h - (wl - rv.depth * 0.25)) * smooth((w.d - hw) / rv.bank));
      }
      this.H[k] = h;
    }
  }

  // altura exata da malha (mesma triangulação do desenho)
  heightAt(x, z) {
    const n = NEAR;
    const fx = (x - n.x0) / n.step, fz = (z - n.z0) / n.step;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return this.raw(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const H = this.H, nx = this.nx;
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    // diagonal de a (i,j) até d (i+1,j+1)
    if (tx >= tz) return a + (b - a) * tx + (d - b) * tz;
    return a + (d - c) * tx + (c - a) * tz;
  }

  waterAt(x, z) {
    const w = this.riverIndex?.nearest(x, z);
    if (!w || !w.seg) return null;
    const rv = w.seg.data;
    if (w.d > rv.width / 2) return null;
    return { level: rv.levelAt(w.seg, w.t), river: rv };
  }

  // tipo de chão em cada célula
  groundClass(x, z, zones) {
    const w = this.riverIndex.nearest(x, z);
    if (w.seg && w.d < w.seg.data.width / 2 + w.seg.data.bank * 0.8) return 'mud';
    if (zones.isForest(x, z)) return 'leaves';
    const r = this.roadIndex.clearance(x, z);
    if (r.d < 22) return fbm(x * 0.05, z * 0.05, 2) > 0.62 ? 'grassDry' : 'lawn';
    return fbm(x * 0.03 + 7, z * 0.03, 2) > 0.55 ? 'grassDry' : 'grass';
  }

  buildMesh(materials, zones) {
    const group = new THREE.Group();
    const n = NEAR, CH = 40; // células por pedaço
    const classes = ['grass', 'grassDry', 'lawn', 'leaves', 'mud'];
    const cellClass = new Uint8Array((this.nx - 1) * (this.nz - 1));
    for (let j = 0; j < this.nz - 1; j++) for (let i = 0; i < this.nx - 1; i++) {
      const x = n.x0 + (i + 0.5) * n.step, z = n.z0 + (j + 0.5) * n.step;
      cellClass[j * (this.nx - 1) + i] = classes.indexOf(this.groundClass(x, z, zones));
    }
    const normals = this._normals();
    for (let cj = 0; cj < this.nz - 1; cj += CH) for (let ci = 0; ci < this.nx - 1; ci += CH) {
      const ni = Math.min(CH, this.nx - 1 - ci), nj = Math.min(CH, this.nz - 1 - cj);
      const vx = ni + 1, vz = nj + 1;
      const pos = new Float32Array(vx * vz * 3), nor = new Float32Array(vx * vz * 3), uv = new Float32Array(vx * vz * 2), col = new Float32Array(vx * vz * 3);
      for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
        const gi = ci + i, gj = cj + j, k = gj * this.nx + gi, v = j * vx + i;
        const x = n.x0 + gi * n.step, z = n.z0 + gj * n.step;
        pos[v * 3] = x; pos[v * 3 + 1] = this.H[k]; pos[v * 3 + 2] = z;
        nor[v * 3] = normals[k * 3]; nor[v * 3 + 1] = normals[k * 3 + 1]; nor[v * 3 + 2] = normals[k * 3 + 2];
        uv[v * 2] = x / 6; uv[v * 2 + 1] = z / 6;
        const tint = 0.9 + fbm(x * 0.02, z * 0.02, 2) * 0.2;
        col[v * 3] = tint; col[v * 3 + 1] = tint; col[v * 3 + 2] = tint * 0.97;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const idx = [];
      const mats = [];
      for (let c = 0; c < classes.length; c++) {
        const start = idx.length;
        for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
          if (cellClass[(cj + j) * (this.nx - 1) + ci + i] !== c) continue;
          const a = j * vx + i, b = a + 1, cc = a + vx, d = cc + 1;
          idx.push(a, d, b, a, cc, d);
        }
        if (idx.length > start) { geo.addGroup(start, idx.length - start, mats.length); mats.push(materials[classes[c]]); }
      }
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.add(this._farMesh(materials));
    return group;
  }

  _normals() {
    const { nx, nz, H } = this, s = NEAR.step;
    const out = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const hl = H[j * nx + Math.max(i - 1, 0)], hr = H[j * nx + Math.min(i + 1, nx - 1)];
      const hd = H[Math.max(j - 1, 0) * nx + i], hu = H[Math.min(j + 1, nz - 1) * nx + i];
      let x = hl - hr, y = 2 * s, z = hd - hu;
      const l = Math.hypot(x, y, z);
      out[(j * nx + i) * 3] = x / l; out[(j * nx + i) * 3 + 1] = y / l; out[(j * nx + i) * 3 + 2] = z / l;
    }
    return out;
  }

  // relevo distante (grade grossa), afundado sob a área detalhada
  _farMesh(materials) {
    const f = FAR, n = NEAR;
    const vx = Math.round((f.x1 - f.x0) / f.step) + 1, vz = Math.round((f.z1 - f.z0) / f.step) + 1;
    const pos = new Float32Array(vx * vz * 3), uv = new Float32Array(vx * vz * 2), col = new Float32Array(vx * vz * 3);
    for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
      const x = f.x0 + i * f.step, z = f.z0 + j * f.step, v = j * vx + i;
      let h = this.raw(x, z);
      if (x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1) h -= 8;
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      uv[v * 2] = x / 24; uv[v * 2 + 1] = z / 24;
      col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 0.95;
    }
    const idx = [];
    for (let j = 0; j < vz - 1; j++) for (let i = 0; i < vx - 1; i++) {
      const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, materials.farForest);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  inBounds(x, z) {
    const n = NEAR; return x > n.x0 + 5 && x < n.x1 - 5 && z > n.z0 + 5 && z < n.z1 - 5;
  }
}

export { pointInPoly };
