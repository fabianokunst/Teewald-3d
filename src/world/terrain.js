import * as THREE from 'three';
import { clamp, smooth, fbm, distToPoly, pointInPoly, distSeg } from './geo.js';

// Relevo real (SRTM 30m) da região, com as ruas aplainadas e o leito do rio escavado.
// Duas grades de detalhe: a da cidade (NEAR, 5 m) e a da área ampliada em volta (RING, 10 m,
// costurada na borda da cidade); além delas, o relevo distante (FAR, 40 m) até o horizonte.
// A cidade não muda com a área ampliada: dentro da grade dela o relevo, as ruas e as áreas
// planas são calculados como sempre (o relevo novo só entra do lado de fora).
const BASE = 380;               // altitude (m) que vira y = 0
export const NEAR = { x0: -560, x1: 700, z0: -620, z1: 600, step: 5 };
export const RING = { x0: -1700, x1: 1840, z0: -1760, z1: 1720, step: 10 };
const FAR = { x0: -3400, x1: 3400, z0: -3400, z1: 3400, step: 40 };
// perto dos rios cada célula vira 4x4 (1,25 m na cidade, 2,5 m no anel): o arroio tem 3 m de
// largura e na grade de 5 m o leito e a margem viravam dentes de serra
const SUB = 4;
// faixa de costura: a cidade passa para o relevo novo nos 150 m de fora da grade dela, e as
// ruas, nos últimos 40 m de dentro (fora da área jogável antiga), para o campo das ruas do anel
const BLEND_OUT = 150, SEAM_IN = 40;

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

// distância (m) de um ponto até fora de um retângulo (0 dentro)
const outside = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

// uma grade de detalhe: alturas brutas (H0), campo suavizado das ruas (HR), final (H) e as
// células refinadas perto dos rios
class Grid {
  constructor(def, raw, blur) {
    Object.assign(this, def);
    this.def = def;
    this.nx = Math.round((def.x1 - def.x0) / def.step) + 1;
    this.nz = Math.round((def.z1 - def.z0) / def.step) + 1;
    this.H0 = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.H0[j * this.nx + i] = raw(def.x0 + i * def.step, def.z0 + j * def.step);
    // campo suavizado usado pelas ruas (cruzamentos ficam na mesma altura)
    this.HR = this._blur(this.H0, blur, 3);
    this.H = Float32Array.from(this.H0);
    this.refined = null; this.fineH = null;
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

  // dentro da área onde a grade interpola
  has(x, z) {
    const fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
    return !(fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1);
  }

  bilinear(arr, x, z) {
    const fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = arr[j * this.nx + i], b = arr[j * this.nx + i + 1], c = arr[(j + 1) * this.nx + i], d = arr[(j + 1) * this.nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  // altura exata da malha (mesma triangulação do desenho)
  heightAt(x, z) {
    const fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
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

  normals() {
    const { nx, nz, H } = this, s = this.step;
    const out = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const hl = H[j * nx + Math.max(i - 1, 0)], hr = H[j * nx + Math.min(i + 1, nx - 1)];
      const hd = H[Math.max(j - 1, 0) * nx + i], hu = H[Math.min(j + 1, nz - 1) * nx + i];
      const x = hl - hr, y = 2 * s, z = hd - hu;
      const l = Math.hypot(x, y, z);
      out[(j * nx + i) * 3] = x / l; out[(j * nx + i) * 3 + 1] = y / l; out[(j * nx + i) * 3 + 2] = z / l;
    }
    return out;
  }
}

export class Terrain {
  constructor(mapdata) {
    this.fine = mapdata.elev.fine;
    this.wide = mapdata.elev.wide;
    this.mid = mapdata.elev.mid || null;
    this.far = mapdata.elev.far || null;
    this.pads = [];
    this.lakes = [];   // { poly, level, depth, margin } (world/countryside.js)
    this.near = new Grid(NEAR, (x, z) => this.raw(x, z), 4);
    // o anel só existe com o relevo da área ampliada
    this.ring = this.mid ? new Grid(RING, (x, z) => this.raw(x, z), 2) : null;
    this.grids = this.ring ? [this.near, this.ring] : [this.near];
  }

  // nomes antigos (outros módulos leem a grade da cidade)
  get nx() { return this.near.nx; }
  get nz() { return this.near.nz; }
  get H() { return this.near.H; }

  // relevo da cidade, como sempre: grade fina (50 m) com a larga (100 m) em volta
  raw1(x, z) {
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

  // relevo da área ampliada: grade média (50 m) com a distante (100 m) em volta
  raw2(x, z) {
    const m = this.mid, hf = sampleGrid(this.far, x, z);
    const e = Math.min(x - m.x0, m.x1 - x, z - m.z0, m.z1 - z);
    if (e <= m.step) return hf - BASE;
    const k = smooth((e - m.step) / (m.step * 2));
    return sampleGrid(m, x, z) * k + hf * (1 - k) - BASE;
  }

  // relevo bruto: o da cidade dentro da grade dela; fora, passa para o da área ampliada
  raw(x, z) {
    if (!this.mid) return this.raw1(x, z);
    const e = outside(NEAR, x, z);
    if (e <= 0) return this.raw1(x, z);
    if (e >= BLEND_OUT) return this.raw2(x, z);
    const t = smooth(e / BLEND_OUT);
    return this.raw1(x, z) * (1 - t) + this.raw2(x, z) * t;
  }

  // costura das ruas na borda de dentro da cidade (0 no miolo, 1 na borda)
  _seam(x, z) {
    if (!this.ring) return 0;
    const n = NEAR, e = Math.min(x - n.x0, n.x1 - x, z - n.z0, n.z1 - z);
    return e >= SEAM_IN ? 0 : 1 - smooth(Math.max(0, e) / SEAM_IN);
  }

  // campo das ruas: o suavizado da cidade, o do anel, ou o relevo bruto mais longe
  roadHeight(x, z) {
    const N = this.near, R = this.ring;
    if (N.has(x, z)) {
      const h = N.bilinear(N.HR, x, z), t = this._seam(x, z);
      return t > 0 && R.has(x, z) ? h + (R.bilinear(R.HR, x, z) - h) * t : h;
    }
    if (R && R.has(x, z)) return R.bilinear(R.HR, x, z);
    return this.raw(x, z);
  }

  // como era antes da área ampliada (o nível dos rios da cidade continua o mesmo)
  roadHeight1(x, z) {
    const N = this.near;
    return N.has(x, z) ? N.bilinear(N.HR, x, z) : this.raw1(x, z);
  }

  // pad = { poly, h, margin } aplaina uma área (praça, igreja, campo...)
  // floor: altura de um piso desenhado em cima; o terreno em volta (até uma
  // célula da grade) fica abaixo dele, senão os triângulos da borda o cortam
  addPad(poly, h, margin = 8, floor = null) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    this.pads.push({ poly, h, margin, floor, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
  }

  // represa (lago parado): água em level, fundo até depth abaixo, margem de margin metros
  addLake(lake) {
    const xs = lake.poly.map(p => p[0]), zs = lake.poly.map(p => p[1]);
    lake.box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    this.lakes.push(lake);
  }

  // represa que contém o ponto
  lakeAt(x, z) {
    for (const L of this.lakes) {
      const q = L.box;
      if (x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3] && pointInPoly(x, z, L.poly)) return L;
    }
    return null;
  }

  // aplica ruas, áreas planas e rios nas grades finais
  finalize(roadIndex, riverIndex) {
    this.roadIndex = roadIndex; this.riverIndex = riverIndex;
    const N = this.near, R = this.ring;
    for (const g of this.grids) {
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        const k = j * g.nx + i, x = g.x0 + i * g.step, z = g.z0 + j * g.step;
        let hr = g.HR[k];
        // borda de dentro da cidade: as ruas passam para o campo do anel (igual ao roadHeight)
        if (g === N && R) { const t = this._seam(x, z); if (t > 0) hr += (R.bilinear(R.HR, x, z) - hr) * t; }
        g.H[k] = this._shape(x, z, g.H0[k], hr, g.step);
      }
      this._refine(g);
    }
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
    // represa: fundo escavado dentro do contorno e margem descendo até a beira d'água
    // (antes dos rios: o leito do rio que chega nela continua aberto)
    for (const L of this.lakes) {
      const m = L.margin, q = L.box;
      if (x < q[0] - m || x > q[2] + m || z < q[1] - m || z > q[3] + m) continue;
      const d = distToPoly(x, z, L.poly);
      if (d < 0) h = Math.min(h, L.level - Math.min(L.depth, 0.5 - d * 0.22));
      else if (d < m) { const s = L.level + 0.25; h = s + (h - s) * smooth(d / m); }
    }
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
  _refine(g) {
    const { nx, nz } = g, cx = nx - 1, cz = nz - 1, V = SUB + 1;
    g.refined = new Uint8Array(cx * cz);
    g.fineH = new Map();
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      const x = g.x0 + (i + 0.5) * g.step, z = g.z0 + (j + 0.5) * g.step;
      // o anel por baixo da cidade não é desenhado
      if (g !== this.near && this.near.has(x, z)) continue;
      const w = this.riverIndex.nearest(x, z);
      if (!w.seg) continue;
      const rv = w.seg.data, base = rv.levelAt(w.seg, w.t) - rv.depth * 0.25;
      if (w.d < rv.width / 2 + bankWidth(rv, this.raw(x, z) - base) + g.step) g.refined[j * cx + i] = 1;
    }
    const isRef = (i, j) => i >= 0 && j >= 0 && i < cx && j < cz && g.refined[j * cx + i] === 1;
    const fstep = g.step / SUB;
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      if (!g.refined[j * cx + i]) continue;
      const c00 = g.H[j * nx + i], c10 = g.H[j * nx + i + 1], c01 = g.H[(j + 1) * nx + i], c11 = g.H[(j + 1) * nx + i + 1];
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
          const x = g.x0 + (i + u) * g.step, z = g.z0 + (j + v) * g.step;
          h = this._shape(x, z, this.raw(x, z), this.roadHeight(x, z), fstep);
        }
        arr[b * V + a] = h;
      }
      g.fineH.set(j * cx + i, arr);
    }
  }

  // grade de detalhe que cobre o ponto (a cidade tem prioridade sobre o anel)
  gridAt(x, z) {
    if (this.near.has(x, z)) return this.near;
    if (this.ring && this.ring.has(x, z)) return this.ring;
    return null;
  }

  // altura exata da malha (mesma triangulação do desenho)
  heightAt(x, z) {
    const g = this.gridAt(x, z);
    return g ? g.heightAt(x, z) : this.raw(x, z);
  }

  // piso colado no relevo: os triângulos da malha do terreno (a mesma triangulação
  // do desenho, inclusive a grade fina dos rios) recortados por um polígono convexo.
  // Um quadrado plano por cima do relevo flutua onde o chão desce e some onde sobe.
  // emit(a, b, c) recebe pontos [x, y, z] na altura exata do terreno, virados para cima
  drape(poly, emit) {
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const g = this.gridAt((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2) || this.near;
    const cx = g.nx - 1, cz = g.nz - 1;
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
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - g.x0) / g.step)), i1 = Math.min(cx - 1, Math.floor((Math.max(...xs) - g.x0) / g.step));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - g.z0) / g.step)), j1 = Math.min(cz - 1, Math.floor((Math.max(...zs) - g.z0) / g.step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = g.refined && g.refined[j * cx + i] ? SUB : 1, s = g.step / k;
      for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
        const x0 = g.x0 + i * g.step + a * s, z0 = g.z0 + j * g.step + b * s, x1 = x0 + s, z1 = z0 + s;
        // mesma diagonal da malha: de (x0, z0) a (x1, z1)
        for (const t of [[[x0, z0], [x1, z0], [x1, z1]], [[x0, z0], [x1, z1], [x0, z1]]]) {
          const c = clip(t);
          if (c.length < 3) continue;
          const P = c.map(([x, z]) => [x, g.heightAt(x, z), z]);
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
    const L = this.lakeAt(x, z);
    if (L) return { level: L.level, river: L.water };
    const w = this.riverIndex?.nearest(x, z);
    if (!w || !w.seg) return null;
    const rv = w.seg.data;
    if (w.d > rv.width / 2) return null;
    return { level: rv.levelAt(w.seg, w.t), river: rv };
  }

  // nível da superfície da água desenhada sobre o ponto (leito e beira molhada), ou null.
  // Onde o barranco sobe acima desse nível o chão está seco
  waterLevel(x, z) {
    if (!this.riverIndex) return null;
    let lv = this.lakeAt(x, z)?.level ?? null;
    for (const w of this._riversNear(x, z)) {
      const rv = w.seg.data;
      if (w.d > rv.width / 2 + rv.bank * 0.5) continue;
      const l = rv.levelAt(w.seg, w.t);
      if (lv === null || l > lv) lv = l;
    }
    return lv;
  }

  // margem molhada: escurece a cor do vértice perto da água (degradê contínuo, sem
  // a escada de quadradinhos que uma textura de barro por célula fazia no talude)
  wetTint(x, z) {
    let k = 0;
    for (const L of this.lakes) {
      const q = L.box;
      if (x < q[0] - 6 || x > q[2] + 6 || z < q[1] - 6 || z > q[3] + 6) continue;
      k = Math.max(k, 1 - smooth(clamp(distToPoly(x, z, L.poly) / 6, 0, 1)));
    }
    const w = this.riverIndex.nearest(x, z);
    if (w.seg) { const rv = w.seg.data; k = Math.max(k, 1 - smooth(clamp((w.d - rv.width / 2) / (rv.bank * 0.8), 0, 1))); }
    return 1 - k * 0.42;
  }

  // tipo de chão em cada célula
  groundClass(x, z, zones) {
    if (zones.isForest(x, z)) return 'leaves';
    const r = this.roadIndex.clearance(x, z);
    // roça ou pasto da área ampliada: em maio quase tudo seco, com manchas verdes grandes
    // (nas células de 10 m, manchas pequenas viravam um tabuleiro)
    if (zones.field?.(x, z, r.d)) return fbm(x * 0.004 + 3, z * 0.004 - 2, 2) > 0.6 ? 'grass' : 'grassDry';
    if (this.ring && outside(NEAR, x, z) > 0) {
      if (r.d < 22) return fbm(x * 0.012, z * 0.012, 2) > 0.62 ? 'grassDry' : 'lawn';
      return fbm(x * 0.01 + 7, z * 0.01, 2) > 0.55 ? 'grassDry' : 'grass';
    }
    if (r.d < 22) return fbm(x * 0.05, z * 0.05, 2) > 0.62 ? 'grassDry' : 'lawn';
    return fbm(x * 0.03 + 7, z * 0.03, 2) > 0.55 ? 'grassDry' : 'grass';
  }

  buildMesh(materials, zones) {
    const group = new THREE.Group();
    const classes = ['grass', 'grassDry', 'lawn', 'leaves', 'mud'];
    for (const g of this.grids) this._gridMesh(group, g, materials, zones, classes);
    if (this.ring) group.add(this._seamSkirt(materials));
    group.add(this._farMesh(materials));
    return group;
  }

  // malha de uma grade em pedaços de 200 m; no anel, as células por baixo da cidade ficam de fora
  _gridMesh(group, g, materials, zones, classes) {
    // pedaços de 200 m na cidade e de 400 m no anel (menos chamadas de desenho)
    const N = this.near, under = g !== N, CH = Math.round((under ? 400 : 200) / g.step), cw = g.nx - 1;
    const cellClass = g.cellClass = new Uint8Array(cw * (g.nz - 1));
    g.classes = classes;
    for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < cw; i++) {
      const x = g.x0 + (i + 0.5) * g.step, z = g.z0 + (j + 0.5) * g.step;
      cellClass[j * cw + i] = under && N.has(x, z) ? 255 : classes.indexOf(this.groundClass(x, z, zones));
    }
    const normals = g.normals();
    for (let cj = 0; cj < g.nz - 1; cj += CH) for (let ci = 0; ci < cw; ci += CH) {
      const ni = Math.min(CH, cw - ci), nj = Math.min(CH, g.nz - 1 - cj);
      let any = false;
      for (let j = 0; j < nj && !any; j++) for (let i = 0; i < ni; i++) if (cellClass[(cj + j) * cw + ci + i] !== 255) { any = true; break; }
      if (!any) continue;
      const vx = ni + 1, vz = nj + 1;
      const pos = new Float32Array(vx * vz * 3), nor = new Float32Array(vx * vz * 3), uv = new Float32Array(vx * vz * 2), col = new Float32Array(vx * vz * 3);
      for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
        const gi = ci + i, gj = cj + j, k = gj * g.nx + gi, v = j * vx + i;
        const x = g.x0 + gi * g.step, z = g.z0 + gj * g.step;
        pos[v * 3] = x; pos[v * 3 + 1] = g.H[k]; pos[v * 3 + 2] = z;
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
          if (g.refined[(cj + j) * cw + ci + i]) continue;
          if (cellClass[(cj + j) * cw + ci + i] !== c) continue;
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
      const fineMesh = this._fineMesh(g, materials, zones, classes, ci, cj, ni, nj);
      if (fineMesh) group.add(fineMesh);
    }
  }

  _fineMesh(g, materials, zones, classes, ci, cj, ni, nj) {
    const cx = g.nx - 1, V = SUB + 1, fs = g.step / SUB;
    const cells = [];
    for (let j = cj; j < cj + nj; j++) for (let i = ci; i < ci + ni; i++) if (g.refined[j * cx + i]) cells.push([i, j]);
    if (!cells.length) return null;
    const nv = cells.length * V * V;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const byClass = classes.map(() => []);
    cells.forEach(([i, j], q) => {
      const arr = g.fineH.get(j * cx + i), base = q * V * V;
      for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
        const v = base + b * V + a, x = g.x0 + i * g.step + a * fs, z = g.z0 + j * g.step + b * fs;
        pos[v * 3] = x; pos[v * 3 + 1] = arr[b * V + a]; pos[v * 3 + 2] = z;
        const hl = g.heightAt(x - fs, z), hr = g.heightAt(x + fs, z), hd = g.heightAt(x, z - fs), hu = g.heightAt(x, z + fs);
        const nxv = hl - hr, nyv = 2 * fs, nzv = hd - hu, l = Math.hypot(nxv, nyv, nzv);
        nor[v * 3] = nxv / l; nor[v * 3 + 1] = nyv / l; nor[v * 3 + 2] = nzv / l;
        uv[v * 2] = x / 6; uv[v * 2 + 1] = z / 6;
        const tint = 0.9 + fbm(x * 0.02, z * 0.02, 2) * 0.2, wet = this.wetTint(x, z);
        col[v * 3] = tint * wet; col[v * 3 + 1] = tint * wet * (0.88 + wet * 0.12); col[v * 3 + 2] = tint * 0.97 * wet * (0.8 + wet * 0.2);
      }
      for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
        const cls = classes.indexOf(this.groundClass(g.x0 + i * g.step + (a + 0.5) * fs, g.z0 + j * g.step + (b + 0.5) * fs, zones));
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

  // saia na borda da cidade: o anel tem um vértice a cada 10 m e a cidade a cada 5; nos
  // vértices do meio ficaria uma fresta entre as duas malhas. Uma tira descendo 1,5 m tapa
  _seamSkirt(materials) {
    const N = this.near, pos = [], uv = [], col = [], nor = [];
    const edge = (x0, z0, x1, z1, nx, nz) => {
      const ha = N.heightAt(clamp(x0, N.x0, N.x1 - 0.01), clamp(z0, N.z0, N.z1 - 0.01)), hb = N.heightAt(clamp(x1, N.x0, N.x1 - 0.01), clamp(z1, N.z0, N.z1 - 0.01));
      const q = [[x0, ha, z0], [x1, hb, z1], [x1, hb - 1.5, z1], [x0, ha - 1.5, z0]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...q[k]); uv.push(q[k][0] / 6, q[k][1] / 6); col.push(0.75, 0.72, 0.66); nor.push(nx, 0.5, nz); }
    };
    const s = N.step;
    for (let x = N.x0; x < N.x1 - 1e-6; x += s) { edge(x, N.z0, x + s, N.z0, 0, -1); edge(x + s, N.z1, x, N.z1, 0, 1); }
    for (let z = N.z0; z < N.z1 - 1e-6; z += s) { edge(N.x0, z + s, N.x0, z, -1, 0); edge(N.x1, z, N.x1, z + s, 1, 0); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, materials.grass);
    m.matrixAutoUpdate = false;
    return m;
  }

  // relevo distante (grade grossa), afundado sob as grades de detalhe. Com a área ampliada
  // ele passa por baixo de tudo (bem fundo no miolo): os pedaços além da neblina deixam de ser
  // desenhados e, sem ele embaixo, ficaria um buraco preto no lugar da cidade
  _farMesh(materials) {
    const f = this.ring ? FAR : { x0: -1600, x1: 1600, z0: -1600, z1: 1600, step: 40 };
    const n = this.ring ? RING : NEAR;
    const vx = Math.round((f.x1 - f.x0) / f.step) + 1, vz = Math.round((f.z1 - f.z0) / f.step) + 1;
    const pos = new Float32Array(vx * vz * 3), uv = new Float32Array(vx * vz * 2), col = new Float32Array(vx * vz * 3);
    for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
      const x = f.x0 + i * f.step, z = f.z0 + j * f.step, v = j * vx + i;
      let h = this.raw(x, z);
      if (x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1) {
        const e = Math.min(x - n.x0, n.x1 - x, z - n.z0, n.z1 - z);
        h -= this.ring ? 8 + 32 * smooth((e - 40) / 80) : 8;
      }
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      uv[v * 2] = x / 24; uv[v * 2 + 1] = z / 24;
      col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 0.95;
    }
    const idx = [];
    for (let j = 0; j < vz - 1; j++) for (let i = 0; i < vx - 1; i++) {
      // célula toda dentro da área detalhada: a malha de perto já cobre, e este
      // relevo grosso (40 m) ficava acima do fundo dos vales estreitos (leito do rio)
      const x0 = f.x0 + i * f.step, z0 = f.z0 + j * f.step;
      if (!this.ring && x0 >= n.x0 && x0 + f.step <= n.x1 && z0 >= n.z0 && z0 + f.step <= n.z1) continue;
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

  // tipo de chão de cada célula já calculado ao montar a malha: cb(x, z, tamanho, classe)
  // (o minimapa pinta o mato e as roças sem perguntar de novo célula por célula)
  eachCell(cb) {
    for (const g of this.grids) {
      if (!g.cellClass) continue;
      const cw = g.nx - 1;
      for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < cw; i++) {
        const c = g.cellClass[j * cw + i];
        if (c !== 255) cb(g.x0 + i * g.step, g.z0 + j * g.step, g.step, g.classes[c]);
      }
    }
  }

  // dentro da área de detalhe (cidade ou anel)
  inBounds(x, z) {
    for (const g of this.grids) if (x > g.x0 + 5 && x < g.x1 - 5 && z > g.z0 + 5 && z < g.z1 - 5) return true;
    return false;
  }

  // dentro da grade da cidade (o que era inBounds antes da área ampliada)
  inNear(x, z) {
    const n = NEAR; return x > n.x0 + 5 && x < n.x1 - 5 && z > n.z0 + 5 && z < n.z1 - 5;
  }
}

export { pointInPoly };
