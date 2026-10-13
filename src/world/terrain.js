import * as THREE from 'three';
import { clamp, smooth, fbm, distToPoly, pointInPoly, distSeg } from './geo.js';

// Relevo real (SRTM 30m) da região, com as ruas aplainadas e o leito do rio escavado.
const BASE = 380;               // altitude (m) que vira y = 0
export const NEAR = { x0: -560, x1: 700, z0: -620, z1: 600, step: 5 };
const FAR = { x0: -1600, x1: 1600, z0: -1600, z1: 1600, step: 40 };
// perto dos rios cada célula de 5 m vira 4x4 (1,25 m): o arroio tem 3 m de largura
// e na grade de 5 m o leito e a margem viravam dentes de serra
const SUB = 4;

// largura da margem escavada: a normal do rio, ou mais se o desnível for grande
function bankWidth(rv, rise) {
  return clamp(rise * 2.2, rv.bank, rv.bank * 3);
}

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
  // floor: altura de um piso desenhado em cima; o terreno em volta (até uma
  // célula da grade) fica abaixo dele, senão os triângulos da borda o cortam
  addPad(poly, h, margin = 8, floor = null) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    this.pads.push({ poly, h, margin, floor, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
  }

  // aplica ruas, áreas planas e rios na grade final
  finalize(roadIndex, riverIndex) {
    const n = NEAR, { nx, nz } = this;
    this.roadIndex = roadIndex; this.riverIndex = riverIndex;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      this.H[k] = this._shape(n.x0 + i * n.step, n.z0 + j * n.step, this.H0[k], this.HR[k], n.step);
    }
    this._refine();
  }

  // altura final num ponto: relevo bruto h, rua (hr), áreas planas, pisos e rios.
  // step = espaçamento da grade onde o ponto vai ser usado
  _shape(x, z, h, hr, step) {
    const r = this.roadIndex.clearance(x, z);
    if (r.d < 7.5) h = hr;
    else if (r.d < 18) h = hr + (h - hr) * smooth((r.d - 7.5) / 10.5);
    // o interior de cada área vale mais que a margem de transição das vizinhas
    let inside = null;
    const near = step * 1.45;
    const floors = [];
    for (const p of this.pads) {
      const reach = Math.max(p.margin, p.floor !== null ? near : 0);
      if (x < p.bb[0] - reach || x > p.bb[2] + reach || z < p.bb[1] - reach || z > p.bb[3] + reach) continue;
      const d = distToPoly(x, z, p.poly);
      if (p.floor !== null && d < near) floors.push(p.floor);
      if (d >= p.margin) continue;
      const ph = typeof p.h === 'function' ? p.h(x, z) : p.h;
      if (d < 0) inside = ph;
      else h = ph + (h - ph) * smooth(d / p.margin);
    }
    if (inside !== null) h = inside;
    for (const fy of floors) h = Math.min(h, fy - 0.04);
    // uma área aplainada não pode erguer o terreno por cima de rua ou calçada
    if (r.seg && r.d < (r.seg.data.sidewalk ? 2 : 0) + step * 0.8) h = Math.min(h, hr);
    // cada rio por perto escava (não só o mais próximo: na confluência a troca de
    // um para o outro fazia um paredão)
    const onRoad = r.seg && r.d < (r.seg.data.sidewalk ? 2 : 0) + 1;
    const h0 = h;
    // até onde o talude pode avançar: não entra na rua (a margem termina no
    // acostamento) nem embaixo de praça, adro e outras áreas planas
    const roadRoom = r.seg ? Math.max(0, r.d - (r.seg.data.sidewalk ? 2 : 0) - 0.5) : Infinity;
    for (const w of this._riversNear(x, z)) {
      const rv = w.seg.data, wl = rv.levelAt(w.seg, w.t), hw = rv.width / 2, base = wl - rv.depth * 0.25;
      // onde a margem é alta, ela fica mais larga (talude de uns 35°, não um paredão);
      // na rua e na calçada vale a margem normal (a ponte precisa do leito embaixo)
      let bank = onRoad || inside !== null || floors.length ? rv.bank : bankWidth(rv, h0 - base);
      if (!onRoad) bank = Math.max(rv.bank, Math.min(bank, w.d - hw + roadRoom));
      if (w.d < hw) h = Math.min(h, wl - rv.depth);
      else if (w.d < hw + bank) h = Math.min(h, base + (h0 - base) * smooth((w.d - hw) / bank));
    }
    return h;
  }

  // segmento mais próximo de cada rio, perto do ponto
  _riversNear(x, z) {
    const idx = this.riverIndex, best = new Map();
    for (const id of idx.candidates(x, z)) {
      const s = idx.segs[id], [d, t] = distSeg(x, z, s.ax, s.az, s.bx, s.bz);
      const b = best.get(s.data);
      if (!b || d < b.d) best.set(s.data, { d, t, seg: s });
    }
    return best.values();
  }

  // grade fina nas células perto dos rios. Cantos = grade normal; na borda com uma
  // célula comum os pontos ficam sobre a reta entre os cantos (sem rachaduras)
  _refine() {
    const n = NEAR, { nx, nz } = this, cx = nx - 1, cz = nz - 1, V = SUB + 1;
    this.refined = new Uint8Array(cx * cz);
    this.fineH = new Map();
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      const x = n.x0 + (i + 0.5) * n.step, z = n.z0 + (j + 0.5) * n.step;
      const w = this.riverIndex.nearest(x, z);
      if (!w.seg) continue;
      const rv = w.seg.data, base = rv.levelAt(w.seg, w.t) - rv.depth * 0.25;
      if (w.d < rv.width / 2 + bankWidth(rv, this.raw(x, z) - base) + 5) this.refined[j * cx + i] = 1;
    }
    const isRef = (i, j) => i >= 0 && j >= 0 && i < cx && j < cz && this.refined[j * cx + i] === 1;
    const fstep = n.step / SUB;
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      if (!this.refined[j * cx + i]) continue;
      const c00 = this.H[j * nx + i], c10 = this.H[j * nx + i + 1], c01 = this.H[(j + 1) * nx + i], c11 = this.H[(j + 1) * nx + i + 1];
      const arr = new Float32Array(V * V);
      for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
        const u = a / SUB, v = b / SUB;
        let h;
        if ((a === 0 || a === SUB) && (b === 0 || b === SUB)) h = a ? (b ? c11 : c10) : (b ? c01 : c00);
        else if (a === 0 && !isRef(i - 1, j)) h = c00 + (c01 - c00) * v;
        else if (a === SUB && !isRef(i + 1, j)) h = c10 + (c11 - c10) * v;
        else if (b === 0 && !isRef(i, j - 1)) h = c00 + (c10 - c00) * u;
        else if (b === SUB && !isRef(i, j + 1)) h = c01 + (c11 - c01) * u;
        else {
          const x = n.x0 + (i + u) * n.step, z = n.z0 + (j + v) * n.step;
          h = this._shape(x, z, this.raw(x, z), this.roadHeight(x, z), fstep);
        }
        arr[b * V + a] = h;
      }
      this.fineH.set(j * cx + i, arr);
    }
  }

  // altura exata da malha (mesma triangulação do desenho)
  heightAt(x, z) {
    const n = NEAR;
    const fx = (x - n.x0) / n.step, fz = (z - n.z0) / n.step;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return this.raw(x, z);
    const i = Math.floor(fx), j = Math.floor(fz);
    let tx = fx - i, tz = fz - j;
    const H = this.H, nx = this.nx;
    let a, b, c, d;
    const fine = this.fineH && this.fineH.get(j * (nx - 1) + i);
    if (fine) {
      const V = SUB + 1, sx = Math.min(Math.floor(tx * SUB), SUB - 1), sz = Math.min(Math.floor(tz * SUB), SUB - 1);
      tx = tx * SUB - sx; tz = tz * SUB - sz;
      a = fine[sz * V + sx]; b = fine[sz * V + sx + 1]; c = fine[(sz + 1) * V + sx]; d = fine[(sz + 1) * V + sx + 1];
    } else {
      a = H[j * nx + i]; b = H[j * nx + i + 1]; c = H[(j + 1) * nx + i]; d = H[(j + 1) * nx + i + 1];
    }
    // diagonal de a (i,j) até d (i+1,j+1)
    if (tx >= tz) return a + (b - a) * tx + (d - b) * tz;
    return a + (d - c) * tx + (c - a) * tz;
  }

  // piso colado no relevo: os triângulos da malha do terreno (a mesma triangulação
  // do desenho, inclusive a grade fina dos rios) recortados por um polígono convexo.
  // Um quadrado plano por cima do relevo flutua onde o chão desce e some onde sobe.
  // emit(a, b, c) recebe pontos [x, y, z] na altura exata do terreno, virados para cima
  drape(poly, emit) {
    const n = NEAR, cx = this.nx - 1, cz = this.nz - 1;
    let area = 0;
    for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sg = area > 0 ? 1 : -1;
    // Sutherland-Hodgman: fica com a parte do lado de dentro de cada aresta
    const clip = pts => {
      for (let k = 0; k < poly.length && pts.length >= 3; k++) {
        const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
        const side = p => sg * ((bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax));
        const out = [];
        for (let m = 0; m < pts.length; m++) {
          const p = pts[m], q = pts[(m + 1) % pts.length], sp = side(p), sq = side(q);
          if (sp >= 0) out.push(p);
          if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        }
        pts = out;
      }
      return pts;
    };
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - n.x0) / n.step)), i1 = Math.min(cx - 1, Math.floor((Math.max(...xs) - n.x0) / n.step));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - n.z0) / n.step)), j1 = Math.min(cz - 1, Math.floor((Math.max(...zs) - n.z0) / n.step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = this.refined && this.refined[j * cx + i] ? SUB : 1, s = n.step / k;
      for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
        const x0 = n.x0 + i * n.step + a * s, z0 = n.z0 + j * n.step + b * s, x1 = x0 + s, z1 = z0 + s;
        // mesma diagonal da malha: de (x0, z0) a (x1, z1)
        for (const t of [[[x0, z0], [x1, z0], [x1, z1]], [[x0, z0], [x1, z1], [x0, z1]]]) {
          const c = clip(t);
          if (c.length < 3) continue;
          const P = c.map(([x, z]) => [x, this.heightAt(x, z), z]);
          for (let m = 1; m < P.length - 1; m++) {
            const A = P[0], B = P[m], C = P[m + 1];
            const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
            if (Math.abs(ny) < 1e-7) continue;
            if (ny > 0) emit(A, B, C); else emit(A, C, B);
          }
        }
      }
    }
  }

  waterAt(x, z) {
    const w = this.riverIndex?.nearest(x, z);
    if (!w || !w.seg) return null;
    const rv = w.seg.data;
    if (w.d > rv.width / 2) return null;
    return { level: rv.levelAt(w.seg, w.t), river: rv };
  }

  // margem molhada: escurece a cor do vértice perto da água (degradê contínuo, sem
  // a escada de quadradinhos que uma textura de barro por célula fazia no talude)
  wetTint(x, z) {
    const w = this.riverIndex.nearest(x, z);
    if (!w.seg) return 1;
    const rv = w.seg.data, k = 1 - smooth(clamp((w.d - rv.width / 2) / (rv.bank * 0.8), 0, 1));
    return 1 - k * 0.42;
  }

  // tipo de chão em cada célula
  groundClass(x, z, zones) {
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
        const tint = 0.9 + fbm(x * 0.02, z * 0.02, 2) * 0.2, wet = this.wetTint(x, z);
        col[v * 3] = tint * wet; col[v * 3 + 1] = tint * wet * (0.88 + wet * 0.12); col[v * 3 + 2] = tint * 0.97 * wet * (0.8 + wet * 0.2);
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
          if (this.refined[(cj + j) * (this.nx - 1) + ci + i]) continue;
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
      const fineMesh = this._fineMesh(materials, zones, classes, ci, cj, ni, nj);
      if (fineMesh) group.add(fineMesh);
    }
    group.add(this._farMesh(materials));
    return group;
  }

  _fineMesh(materials, zones, classes, ci, cj, ni, nj) {
    const n = NEAR, cx = this.nx - 1, V = SUB + 1, fs = n.step / SUB;
    const cells = [];
    for (let j = cj; j < cj + nj; j++) for (let i = ci; i < ci + ni; i++) if (this.refined[j * cx + i]) cells.push([i, j]);
    if (!cells.length) return null;
    const nv = cells.length * V * V;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const byClass = classes.map(() => []);
    cells.forEach(([i, j], q) => {
      const arr = this.fineH.get(j * cx + i), base = q * V * V;
      for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
        const v = base + b * V + a, x = n.x0 + i * n.step + a * fs, z = n.z0 + j * n.step + b * fs;
        pos[v * 3] = x; pos[v * 3 + 1] = arr[b * V + a]; pos[v * 3 + 2] = z;
        const hl = this.heightAt(x - fs, z), hr = this.heightAt(x + fs, z), hd = this.heightAt(x, z - fs), hu = this.heightAt(x, z + fs);
        const nxv = hl - hr, nyv = 2 * fs, nzv = hd - hu, l = Math.hypot(nxv, nyv, nzv);
        nor[v * 3] = nxv / l; nor[v * 3 + 1] = nyv / l; nor[v * 3 + 2] = nzv / l;
        uv[v * 2] = x / 6; uv[v * 2 + 1] = z / 6;
        const tint = 0.9 + fbm(x * 0.02, z * 0.02, 2) * 0.2, wet = this.wetTint(x, z);
        col[v * 3] = tint * wet; col[v * 3 + 1] = tint * wet * (0.88 + wet * 0.12); col[v * 3 + 2] = tint * 0.97 * wet * (0.8 + wet * 0.2);
      }
      for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
        const cls = classes.indexOf(this.groundClass(n.x0 + i * n.step + (a + 0.5) * fs, n.z0 + j * n.step + (b + 0.5) * fs, zones));
        const p = base + b * V + a, pb = p + 1, pc = p + V, pd = pc + 1;
        byClass[cls].push(p, pd, pb, p, pc, pd);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = [], mats = [];
    byClass.forEach((list, c) => {
      if (!list.length) return;
      geo.addGroup(idx.length, list.length, mats.length); mats.push(materials[classes[c]]);
      for (const v of list) idx.push(v);
    });
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats);
    mesh.matrixAutoUpdate = false;
    return mesh;
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
      // célula toda dentro da área detalhada: a malha de perto já cobre, e este
      // relevo grosso (40 m) ficava acima do fundo dos vales estreitos (leito do rio)
      const x0 = f.x0 + i * f.step, z0 = f.z0 + j * f.step;
      if (x0 >= n.x0 && x0 + f.step <= n.x1 && z0 >= n.z0 && z0 + f.step <= n.z1) continue;
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
