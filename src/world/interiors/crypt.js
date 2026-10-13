import * as THREE from 'three';
import { M } from '../../engine/materials.js';
import { ps1Material } from '../../engine/ps1material.js';
import { makeCanvas } from '../../engine/textures.js';
import { sampler, paint, finish, mul, tint } from '../../engine/archTextures.js';
import { FONT_TITLE } from '../../ui/overlay.js';
import { rng } from '../geo.js';
import { makeKit, part, cameraProbe, hash, softTex, glowMat, lightK, poolTex, UV1, V } from './factory.js';

// Cripta dos fundadores, sob o cemitério católico: escada de pedra descendo da
// porta, corredor abobadado com nichos de ossos e caixões, ossário lateral e a
// sala redonda com o sarcófago de mármore (onde fica a cruz de ferro) e as
// lápides das famílias que fundaram Teewald (1850–1890). Raízes furam o teto.

// planta (metros locais): patamar x 0.8..4.2 z 0.3..2.3 (y 2.4); escada descendo para +z até z 8.3;
// canto x 0.8..4.2 z 8.3..11.7; corredor x 4.2..12.43 z 8.3..11.7; ossário x 6..10 z 11.7..16;
// sala redonda centro (18.5, 10), raio 6.3
const C = { x: 18.5, z: 10, r: 6.3 };
const WH = 4.2;          // altura da parede da sala (cúpula por cima)
const VS = 2.4, VR = 1.7; // nascença e raio das abóbadas (ápice 4.1)
const STAIR_TOP = 2.4, SZ0 = 2.3, SZ1 = 8.3;
const stairY = z => (z <= SZ0 ? STAIR_TOP : z >= SZ1 ? 0 : STAIR_TOP * (1 - (z - SZ0) / (SZ1 - SZ0)));

const FAMILIES = [
  ['KRANZ', 'Johann Peter Kranz', '1821', '1867'],
  ['WENDT', 'Carl Friedrich Wendt', '1818', '1874'],
  ['SCHMITT', 'Anna Maria Schmitt', '1830', '1882'],
  ['KLEIN', 'Jakob Klein', '1826', '1890'],
  ['HOFFMANN', 'Philipp Hoffmann', '1815', '1859'],
  ['BECKER', 'Margaretha Becker', '1833', '1878'],
  ['SCHNEIDER', 'Nikolaus Schneider', '1820', '1865'],
  ['WEBER', 'Elisabeth Weber', '1829', '1886'],
];

// texto entalhado na pedra: máscara nítida do texto, depois sombra/realce
function carve(c, lines) {
  const w = c.width, h = c.height, g = c.getContext('2d');
  const m = makeCanvas(w, h), mg = m.getContext('2d');
  mg.fillStyle = '#fff'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
  for (const [text, y, size, font] of lines) {
    let s = size;
    mg.font = `${s}px ${font}`;
    while (mg.measureText(text).width > w - 10 && s > 6) { s--; mg.font = `${s}px ${font}`; }
    mg.fillText(text, w / 2, y);
  }
  const md = mg.getImageData(0, 0, w, h).data, img = g.getImageData(0, 0, w, h), d = img.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && md[(y * w + x) * 4 + 3] > 110;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let k = 1;
    if (on(x, y)) k = on(x - 1, y - 1) ? 0.42 : 0.3;          // fundo do entalhe
    else if (on(x - 1, y - 1)) k = 1.25;                        // borda iluminada
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function makeMats() {
  if (M['int:c:slabs']) return;
  const marble = sampler('marble'), granite = sampler('granite'), stone = sampler('stoneWall'), wood = sampler('woodDark');
  // lápides das famílias (mármore manchado, moldura, cruz, nome e datas)
  FAMILIES.forEach(([fam, name, b, d], i) => {
    const c = paint(96, 64, (x, y) => {
      let v = tint(marble(x + i * 17, y + i * 9), [0.92, 0.9, 0.84]);
      const stain = Math.sin(x * 0.09 + i) * Math.cos(y * 0.13 + i * 2) > 0.55 || (y > 50 && hash(x, y + i) < 0.3);
      if (stain) v = mul(v, 0.78);
      if (x < 3 || y < 3 || x > 92 || y > 60) v = mul(v, x < 1 || y < 1 ? 1.15 : x > 94 || y > 62 ? 0.55 : 0.85);
      if (x === 3 || y === 3) v = mul(v, 0.7);
      return v;
    });
    carve(c, [['+', 9, 11, 'Georgia, serif'], ['Familie ' + fam[0] + fam.slice(1).toLowerCase(), 22, 15, FONT_TITLE], [name, 38, 10, 'Georgia, serif'], ['* ' + b + '   † ' + d, 51, 10, 'Georgia, serif']]);
    M['int:c:plaque' + i] = ps1Material({ map: finish(c), affine: false });
  });
  // lateral do sarcófago: HIER RUHEN DIE GRÜNDER e moldura com cruzes
  {
    const c = paint(128, 48, (x, y) => {
      let v = tint(marble(x, y), [0.96, 0.94, 0.9]);
      if (y < 4 || y > 43) v = mul(v, y < 2 || y > 45 ? 0.7 : 1.12);
      if ((x === 14 || x === 113) && y > 6 && y < 42) v = mul(v, 0.6);
      return v;
    });
    carve(c, [['+', 24, 18, 'Georgia, serif']]);
    const g = c.getContext('2d');
    const sub = makeCanvas(98, 48); sub.getContext('2d').drawImage(c, 15, 0, 98, 48, 0, 0, 98, 48);
    carve(sub, [['Hier ruhen die Gründer', 17, 14, FONT_TITLE], ['TEEWALD  1850', 34, 11, 'Georgia, serif']]);
    g.drawImage(sub, 15, 0);
    M['int:c:sarco'] = ps1Material({ map: finish(c), affine: false });
  }
  // lajes do chão: placas grandes com rejunte escuro
  M['int:c:slabs'] = ps1Material({
    map: finish(paint(64, 64, (x, y) => {
      const sx = Math.floor(x / 32), sy = Math.floor((y + (sx ? 16 : 0)) / 32), lx = x % 32, ly = (y + (sx ? 16 : 0)) % 32;
      if (lx === 0 || ly === 0) return [34, 32, 30];
      const k = 0.8 + hash(sx, sy) * 0.35;
      let v = mul(granite(x, y), k);
      if (lx === 1 || ly === 1) v = mul(v, 1.15);
      if (lx === 31 || ly === 31) v = mul(v, 0.7);
      return v;
    })),
  });
  // teia de aranha (fios radiais e espiral)
  M['int:c:web'] = ps1Material({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, lit: false, color: new THREE.Color(0.55, 0.55, 0.56), affine: false,
    map: (() => {
      // fios radiais saindo do canto e fios cruzados entre eles, frouxos e falhados
      const NR = 6, ang = Array.from({ length: NR }, (_, k) => ((k + 0.3 + hash(k, 2) * 0.4) / NR) * Math.PI / 2);
      const segD = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))); return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
      return softTex(64, 64, (x, y) => {
        const px = x + 0.5, py = y + 0.5, r = Math.hypot(px, py), a = Math.atan2(py, px);
        let on = 0;
        for (const ak of ang) if (r < 60 && r * Math.abs(Math.sin(a - ak)) < 0.55 && Math.cos(a - ak) > 0) on = 1;
        for (let k = 0; k < NR - 1 && !on; k++) for (let j = 1; j < 7; j++) {
          if (hash(k * 7 + j, 5) < 0.25) continue;
          const rr = j * 8 + hash(k, j) * 5, sag = 1.5 + hash(j, k) * 2;
          const ax = Math.cos(ang[k]) * rr, ay = Math.sin(ang[k]) * rr, bx = Math.cos(ang[k + 1]) * rr, by = Math.sin(ang[k + 1]) * rr;
          const mx = (ax + bx) / 2 * (1 - sag / rr), my = (ay + by) / 2 * (1 - sag / rr);
          if (Math.min(segD(px, py, ax, ay, mx, my), segD(px, py, mx, my, bx, by)) < 0.5) on = 0.7;
        }
        return [230, 230, 228, on * (150 - r * 1.6)];
      });
    })(),
  });
  // rosto da caveira
  M['int:c:skull'] = ps1Material({
    affine: false, map: finish(paint(16, 16, (x, y) => {
      const bone = [196 - y * 2, 184 - y * 2, 150 - y * 2];
      const eye = (cx, cy) => Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) < 2.3;
      if (eye(5, 6) || eye(11, 6)) return [14, 10, 8];
      if (y >= 9 && y <= 10 && x >= 7 && x <= 8) return [20, 14, 10];
      if (y >= 12 && y <= 13 && x >= 4 && x <= 11) return x % 2 ? [150, 140, 110] : [40, 32, 24];
      return bone;
    })),
  });
  // porta velha de tábuas com ferragens (frestas acendem com a lua)
  M['int:c:door'] = ps1Material({
    map: finish(paint(32, 64, (x, y) => {
      if (x % 8 === 0) return [20, 16, 14];
      let v = mul(wood(x, y), 0.8);
      if ((y >= 10 && y <= 12) || (y >= 50 && y <= 52)) v = (x % 4 === 1 && y % 2) ? [90, 86, 80] : [44, 40, 38];
      if (Math.hypot(x - 24, y - 33) < 2.6 && Math.hypot(x - 24, y - 33) > 1.4) v = [70, 64, 56];
      return v;
    })),
  });
  // osso, cera, ferro e chama
  M['int:c:flame'] = glowMat(softTex(16, 32, (x, y) => {
    const t = y / 31, w = Math.sin(t * Math.PI) * (1 - t * 0.3) * 6.5, d = Math.abs(x + 0.5 - 8);
    const a = Math.max(0, 1 - d / Math.max(0.5, w));
    return [255, 200 + t * 50, 120 + t * 100, a * 255 * Math.min(1, t * 3)];
  }), [1.0, 0.75, 0.4]);
  M['int:c:glow'] = glowMat(poolTex(), [0.3, 0.17, 0.06]);
  M['int:c:moon'] = glowMat(poolTex(), [0.12, 0.15, 0.24]);
  M['int:c:crack'] = ps1Material({ lit: false, color: new THREE.Color(0.45, 0.52, 0.7) });
}

export function build(ctx, B, o) {
  makeMats();
  const K = makeKit(ctx, B, o);
  const R = rng(1850);
  const objects = new THREE.Group();
  objects.name = 'interior:cripta:pecas';
  const anim = [];
  const pt = (x, z, h = 0, y = 0) => ({ x: o.x + x, y: o.y + y, z: o.z + z, h });
  const gray = k => [k, k, k];
  const stoneCol = (k = 1) => [0.62 * k, 0.58 * k, 0.52 * k];
  const WALL = 'stoneBase', VAULT = 'brickOld';

  // ---------------- luzes ----------------
  const L = {
    lua: { x: 2.5, y: 3.6, z: 1.0, col: [0.45, 0.55, 0.85], range: 6.5 },
    escada: { x: 1.3, y: 1.4, z: 10.9, col: [1.5, 0.85, 0.4], range: 7.5, flicker: 0.25 },
    corredor: { x: 8, y: 1.6, z: 9.0, col: [1.6, 0.9, 0.42], range: 8, flicker: 0.2 },
    ossario: { x: 8, y: 1.0, z: 15.3, col: [1.3, 0.7, 0.32], range: 6.5, flicker: 0.3 },
    lustre: { x: C.x, y: 3.6, z: C.z, col: [1.7, 1.0, 0.5], range: 12, flicker: 0.1 },
    salaSO: { x: 15.6, y: 1.7, z: 7.1, col: [1.4, 0.8, 0.38], range: 7, flicker: 0.25 },
    salaNE: { x: 21.4, y: 1.7, z: 12.9, col: [1.4, 0.8, 0.38], range: 7, flicker: 0.25 },
  };
  const lights = [];
  for (const [name, l] of Object.entries(L)) {
    const w = { name, x: o.x + l.x, y: o.y + l.y, z: o.z + l.z, col: l.col.slice(), range: l.range, flicker: l.flicker || 0, base: l.col.slice() };
    L[name] = w; lights.push(w);
  }

  // ---------------- piso ----------------
  K.walk(12.5, 9, 12.6, 8.8, 0);
  K.walk(2.5, 1.3, 1.75, 1.05, STAIR_TOP);
  K.ramp(2.5, (SZ0 + SZ1) / 2, 1.7, (SZ1 - SZ0) / 2, 0, STAIR_TOP, 0);
  K.floor('int:c:slabs', 0.8, 8.3, 12.6, 11.7, 0, 2.4, [gray(0.75), gray(0.8), gray(0.7), gray(0.72)]);
  K.floor('int:c:slabs', 6, 11.7, 10, 16, 0, 2.4, [gray(0.6), gray(0.65), gray(0.55), gray(0.6)]);
  K.floor('stonePath', 0.8, 0.3, 4.2, SZ0, STAIR_TOP, 1.5, [gray(0.6), gray(0.6), gray(0.6), gray(0.6)]);
  K.poly('int:c:slabs', Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return [C.x + Math.cos(a) * (C.r + 0.2), C.z + Math.sin(a) * (C.r + 0.2)]; }), 0, 2.4);
  // degraus de pedra
  const NS = 16, run = (SZ1 - SZ0) / NS, rise = STAIR_TOP / NS;
  for (let i = 0; i < NS; i++) {
    const z0 = SZ0 + i * run, z1 = z0 + run, y = STAIR_TOP - (i + 1) * rise, k = 0.5 + 0.12 * hash(i, 3);
    K.floor('granite', 0.8, z0, 4.2, z1, y, 1, [gray(k), gray(k), gray(k * 0.9), gray(k * 0.9)], 0);
    K.quad('granite', [0.8, y, z0], [4.2, y, z0], [4.2, y + rise, z0], [0.8, y + rise, z0], [[0, 0], [3.4, 0], [3.4, rise], [0, rise]], [gray(k * 0.6), gray(k * 0.6), gray(k * 0.8), gray(k * 0.8)]);
  }

  // ---------------- escada: paredes inclinadas e abóbada descendo ----------------
  const springAt = z => stairY(z) + VS;
  const vault = (mat, ax, az, bx, bz, ys0, ys1, r, k = 0.45, m = 8, us = 1.6) => {
    const Lh = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / Lh, dz = (bz - az) / Lh, nx = -dz, nz = dx;
    const n = Math.max(1, Math.ceil(Lh / 1.2));
    const P = (i, j) => { const t = i / n, a = (j / m) * Math.PI; return [ax + dx * Lh * t + nx * Math.cos(a) * r, ys0 + (ys1 - ys0) * t + Math.sin(a) * r, az + dz * Lh * t + nz * Math.cos(a) * r]; };
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const t = (i + 0.5) / n, axis = [ax + dx * Lh * t, ys0 + (ys1 - ys0) * t, az + dz * Lh * t];
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      const mid = V.scl(V.add(V.add(a, b), V.add(c, d)), 0.25);
      const ka = k * (0.75 + 0.25 * Math.sin((j / m) * Math.PI)), kb = k * (0.75 + 0.25 * Math.sin(((j + 1) / m) * Math.PI));
      K.quadOut(mat, a, b, c, d, V.sub(axis, mid), [[i * Lh / n / us, j * r * Math.PI / m / us], [(i + 1) * Lh / n / us, j * r * Math.PI / m / us], [(i + 1) * Lh / n / us, (j + 1) * r * Math.PI / m / us], [i * Lh / n / us, (j + 1) * r * Math.PI / m / us]], [gray(ka), gray(ka), gray(kb), gray(kb)]);
    }
  };
  // tímpano: parede acima de um arco (centro cx,cz na nascença ys), virada para (nx, nz)
  const tympanum = (mat, cx, cz, nx, nz, ys, r, ytop, k = 0.45, m = 8) => {
    const lx = nz, lz = -nx;
    for (let j = 0; j < m; j++) {
      const a0 = (j / m) * Math.PI, a1 = ((j + 1) / m) * Math.PI;
      const A = a => [cx + lx * Math.cos(a) * r, ys + Math.sin(a) * r, cz + lz * Math.cos(a) * r];
      const T = a => [cx + lx * Math.cos(a) * r, ytop, cz + lz * Math.cos(a) * r];
      K.quadOut(mat, A(a0), A(a1), T(a1), T(a0), [nx, 0, nz], [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], [gray(k), gray(k), gray(k), gray(k)]);
    }
  };
  // paredes da escada (topo inclinado acompanhando a abóbada)
  for (const [x, out] of [[0.8, 1], [4.2, -1]]) {
    const zs = [0.3, SZ0, SZ0 + 1.5, SZ0 + 3, SZ0 + 4.5, SZ1, 11.7];
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1];
      if (out < 0 && za >= SZ1) continue;   // a parede leste do canto vira o corredor
      const ya = stairY(za) - 0.05, yb = stairY(zb) - 0.05, ta = za >= SZ1 ? VS : springAt(za), tb = zb >= SZ1 ? VS : springAt(zb);
      const cb = stoneCol(0.55), ct = stoneCol(0.8);
      K.quadOut(WALL, [x, Math.min(ya, 0), za], [x, Math.min(yb, 0) + (zb > SZ1 ? 0 : 0), zb], [x, tb, zb], [x, ta, za], [out, 0, 0], [[za / 2, 0], [zb / 2, 0], [zb / 2, tb / 2], [za / 2, ta / 2]], [cb, cb, ct, ct]);
      K.hit(x - out * 0.25, (za + zb) / 2, 0.25, (zb - za) / 2, 0, -0.5, Math.max(ta, tb) + 1.7, true);
    }
  }
  // fundo do patamar (com a porta) e abóbada da escada
  K.wallRun(0.8, 0.3, 4.2, 0.3, STAIR_TOP, STAIR_TOP + VS, { A: { mat: WALL, col: stoneCol(0.75), us: 2 } });
  tympanum(WALL, 2.5, 0.3, 0, 1, STAIR_TOP + VS, VR, STAIR_TOP + VS + VR + 0.2, 0.4);
  vault(VAULT, 2.5, 0.3, 2.5, SZ0, STAIR_TOP + VS, STAIR_TOP + VS, VR, 0.42);
  vault(VAULT, 2.5, SZ0, 2.5, SZ1, STAIR_TOP + VS, VS, VR, 0.42);
  for (let z = 0.3; z < SZ1; z += 1) K.hit(2.5, z + 0.5, 1.8, 0.5, 0, springAt(Math.min(SZ1, z + 1)) + VR * 0.7, springAt(z) + VR + 1, true);
  // canto ao pé da escada: teto plano de lajes e tímpanos das abóbadas que chegam
  K.ceil('stoneBase', 0.8, SZ1, 4.2, 11.7, VS + VR, 1.5, [gray(0.35), gray(0.35), gray(0.35), gray(0.35)], 0);
  tympanum(WALL, 2.5, SZ1, 0, 1, VS, VR, VS + VR, 0.4);
  tympanum(WALL, 4.2, 10, -1, 0, VS, VR, VS + VR, 0.4);
  K.wallRun(0.8, 11.7, 4.2, 11.7, 0, VS + VR, { B: { mat: WALL, col: stoneCol(0.8), band: 1.2, bandMat: WALL, us: 2 } });
  K.hit(2.5, 10, 1.8, 1.8, 0, VS + VR, VS + VR + 0.5, true);
  // porta de saída (fechada) com frestas de luar
  K.face('int:c:door', 2.5, STAIR_TOP, 0.47, 1.3, 2.3, 0, UV1, [gray(0.5), gray(0.5), gray(0.6), gray(0.6)]);
  for (const [x0, y0, x1, y1] of [[1.84, 2.4, 1.86, 4.7], [3.14, 2.4, 3.16, 4.7], [1.85, 4.69, 3.15, 4.71], [2.24, 2.5, 2.25, 4.6], [2.83, 2.6, 2.84, 4.5]]) K.quad('int:c:crack', [x0, y0, 0.48], [x1, y0, 0.48], [x1, y1, 0.48], [x0, y1, 0.48]);
  K.box('iron', 2.5, STAIR_TOP + 2.32, 0.5, 1.5, 0.12, 0.08, 0, { col: gray(0.4) });
  // luar da porta no patamar e nos primeiros degraus (um quadro só, na altura do
  // patamar, ficava flutuando 30 cm acima da escada)
  K.floor('int:c:moon', 1.0, 0.4, 4.0, SZ0, STAIR_TOP + 0.02, 99, null, 0);
  for (let i = 0; SZ0 + i * run < 3.2; i++) K.floor('int:c:moon', 1.0, SZ0 + i * run, 4.0, Math.min(SZ0 + (i + 1) * run, 3.2), STAIR_TOP - (i + 1) * rise + 0.02, 99, null, 0);

  // ---------------- corredor abobadado com nichos ----------------
  const niches = [];
  // parede com nichos (3 níveis) do lado direito do sentido; holes em x onde não há nicho
  const nicheWall = (x0, z, x1, side, skip = []) => {
    const dir = side > 0 ? 1 : -1; // side > 0: parede norte (z maior), face para -z
    const zf = z, out = [0, 0, -dir], depth = 0.7;
    // trechos sólidos (fora dos vãos de passagem)
    const spans = [];
    let s0 = x0;
    for (const [a, b] of skip) { spans.push([s0, a]); s0 = b; }
    spans.push([s0, x1]);
    const bays = [];
    for (let x = x0 + 0.35; x + 0.95 <= x1 - 0.2; x += 1.35) if (!skip.some(([a, b]) => x + 0.95 > a - 0.15 && x < b + 0.15)) bays.push([x, x + 0.95]);
    const rows = [[0.25, 0.8], [0.95, 1.5], [1.65, 2.2]];
    // face da parede: pedaços entre os nichos
    const face = (xa, xb, ya, yb) => {
      if (xb - xa < 0.01 || yb - ya < 0.01) return;
      const kb = ya < 1 ? 0.55 + ya * 0.25 : 0.8, kt = yb < 1 ? 0.55 + yb * 0.25 : 0.8;
      K.quadOut(WALL, [xa, ya, zf], [xb, ya, zf], [xb, yb, zf], [xa, yb, zf], out, [[xa / 2, ya / 2], [xb / 2, ya / 2], [xb / 2, yb / 2], [xa / 2, yb / 2]], [stoneCol(kb), stoneCol(kb), stoneCol(kt), stoneCol(kt)]);
    };
    // face cheia nos intervalos, cortando os vãos de passagem
    const gap = (xa, xb) => { for (const [sa, sb] of spans) face(Math.max(xa, sa), Math.min(xb, sb), 0, VS); };
    let x = x0;
    for (const [a, b] of bays) {
      gap(x, a);
      let y = 0;
      for (const [r0, r1] of rows) { face(a, b, y, r0); y = r1; }
      face(a, b, y, VS);
      // interior do nicho
      for (const [r0, r1] of rows) {
        const zb = zf + dir * depth, k = 0.32;
        const c = [gray(k), gray(k), gray(k), gray(k)];
        K.quadOut(WALL, [a, r0, zb], [b, r0, zb], [b, r1, zb], [a, r1, zb], out, [[0, 0], [0.5, 0], [0.5, 0.3], [0, 0.3]], c);
        K.quadOut(WALL, [a, r0, zf], [a, r0, zb], [a, r1, zb], [a, r1, zf], [1, 0, 0], [[0, 0], [0.4, 0], [0.4, 0.3], [0, 0.3]], c);
        K.quadOut(WALL, [b, r0, zf], [b, r0, zb], [b, r1, zb], [b, r1, zf], [-1, 0, 0], [[0, 0], [0.4, 0], [0.4, 0.3], [0, 0.3]], c);
        K.quadOut(WALL, [a, r1, zf], [b, r1, zf], [b, r1, zb], [a, r1, zb], [0, -1, 0], [[0, 0], [0.5, 0], [0.5, 0.4], [0, 0.4]], c);
        K.quadOut(WALL, [a, r0, zf], [b, r0, zf], [b, r0, zb], [a, r0, zb], [0, 1, 0], [[0, 0], [0.5, 0], [0.5, 0.4], [0, 0.4]], [gray(0.4), gray(0.4), gray(0.4), gray(0.4)]);
        niches.push({ x: (a + b) / 2, y: r0, z: zf + dir * depth / 2, w: b - a, h: r1 - r0, d: depth, dir });
      }
      x = b;
    }
    gap(x, x1);
    for (const [sa, sb] of spans) K.hit((sa + sb) / 2, zf + dir * 0.4, (sb - sa) / 2, 0.4, 0, -0.5, VS + VR, true);
  };
  nicheWall(4.2, 8.3, 12.43, -1);
  // parede norte do corredor com o arco do ossário
  nicheWall(4.2, 11.7, 12.43, 1, [[6.6, 9.4]]);
  vault(VAULT, 4.2, 10, 12.43, 10, VS, VS, VR, 0.42);
  K.hit(8.3, 10, 4.2, 1.8, 0, VS + VR * 0.75, VS + VR + 0.6, true);
  // conteúdo dos nichos: caixões, ossadas, caveiras e lajes fechadas
  niches.forEach((n, i) => {
    const r = hash(i, 17);
    const fz = n.z - n.dir * n.d / 2;     // boca do nicho
    if (r < 0.3) {          // laje de mármore fechando
      const pl = 'int:c:plaque' + (i % FAMILIES.length);
      K.face(pl, n.x, n.y + 0.02, fz + n.dir * 0.03, n.w - 0.04, n.h - 0.04, n.dir > 0 ? Math.PI : 0, UV1, [gray(0.7), gray(0.7), gray(0.75), gray(0.75)]);
    } else if (r < 0.58) {  // ponta de caixão
      const F = K.frame(n.x, n.y, n.z + n.dir * 0.05, 0);
      F.box('woodDark', 0, 0, 0, n.w * 0.72, n.h * 0.78, n.d * 0.9, gray(0.32 + hash(i, 3) * 0.15), 1);
      if (hash(i, 5) < 0.5) skull(K, n.x + 0.15, n.y + n.h * 0.78, fz + n.dir * 0.12, n.dir > 0 ? Math.PI : 0, 0.8);
    } else if (r < 0.85) {  // ossada solta
      for (let b = 0; b < 4; b++) bone(K, n.x + (hash(i, b) - 0.5) * 0.5, n.y + 0.03, n.z + (hash(b, i) - 0.5) * 0.3, hash(i, b + 9) * 3, 0.35 + hash(b, i + 3) * 0.12);
      skull(K, n.x + (hash(i, 31) - 0.5) * 0.4, n.y, fz + n.dir * 0.2, (n.dir > 0 ? Math.PI : 0) + (hash(i, 33) - 0.5) * 0.8, 1);
    }
    if (hash(i, 41) < 0.25) web(K, n.x - n.w / 2, n.y + n.h, fz, n.dir > 0 ? Math.PI : 0, 0.5);
  });
  // castiçal do corredor e vela ao pé da escada
  candelabra(K, objects, anim, 8, 9.0, 1.15, 'corredor');
  candleCluster(K, objects, anim, 1.3, 10.9, 0, 5, 'escada');

  // ---------------- ossário ----------------
  {
    K.wallRun(6.6, 11.7, 9.4, 11.7, VS - 0.1, 3.2, { A: { mat: WALL, col: stoneCol(0.6), us: 2 }, B: { mat: WALL, col: stoneCol(0.6), us: 2 }, t: 0.6 });
    const OS = { mat: WALL, col: stoneCol(0.7), band: 1.0, bandMat: WALL, us: 2 };
    K.wallRun(6.0, 11.7, 6.0, 16.0, 0, 3.2, { B: OS });
    K.wallRun(10.0, 16.0, 10.0, 11.7, 0, 3.2, { B: OS });
    K.wallRun(6.0, 16.0, 10.0, 16.0, 0, 3.2, { B: OS });
    K.wallRun(6.0, 11.7, 6.6, 11.7, 0, 3.2, { A: OS, t: 0.6 });
    K.wallRun(9.4, 11.7, 10.0, 11.7, 0, 3.2, { A: OS, t: 0.6 });
    for (const x of [6.6, 9.4]) K.quadOut(WALL, [x, 0, 11.4], [x, 0, 12.0], [x, VS - 0.1, 12.0], [x, VS - 0.1, 11.4], [x < 8 ? 1 : -1, 0, 0], [[0, 0], [0.3, 0], [0.3, 1.2], [0, 1.2]], [stoneCol(0.5), stoneCol(0.5), stoneCol(0.6), stoneCol(0.6)]);
    K.quadOut(WALL, [6.6, VS - 0.1, 11.4], [9.4, VS - 0.1, 11.4], [9.4, VS - 0.1, 12.0], [6.6, VS - 0.1, 12.0], [0, -1, 0], [[0, 0], [1.4, 0], [1.4, 0.3], [0, 0.3]], [stoneCol(0.5), stoneCol(0.5), stoneCol(0.5), stoneCol(0.5)]);
    K.ceil('stoneBase', 6, 11.7, 10, 16, 3.2, 1.5, [gray(0.3), gray(0.3), gray(0.32), gray(0.3)], 0);
    K.hit(8, 13.85, 2.1, 2.2, 0, 3.2, 3.6, true);
    // paredes de caveiras empilhadas (ossário) e montes de ossos
    for (const [x0, z0, x1, z1, rot] of [[6.25, 12.2, 6.25, 15.7, Math.PI / 2], [9.75, 15.7, 9.75, 12.2, -Math.PI / 2], [6.5, 15.75, 9.5, 15.75, Math.PI]]) {
      const L2 = Math.hypot(x1 - x0, z1 - z0);
      for (let row = 0; row < 7; row++) for (let i = 0; i < Math.floor(L2 / 0.2); i++) {
        const t = (i + 0.5 + (row % 2) * 0.5) / Math.floor(L2 / 0.2);
        if (t > 1 || hash(row * 31 + i, x0 | 0) < 0.12) continue;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (row % 3 === 2) { const F = K.frame(x, row * 0.17, z, rot); F.beam('carPaint', [-0.1, 0.05, 0], [0.1, 0.05, 0], 0.05, 0.05, [0.62, 0.56, 0.44]); }
        else skull(K, x, row * 0.17, z, rot + (hash(i, row) - 0.5) * 0.4, 0.85, row > 4 ? 0.5 : 0.7);
      }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      K.hit(mx, mz, Math.abs(x1 - x0) / 2 + 0.2, Math.abs(z1 - z0) / 2 + 0.2, 0, 0, 1.2);
    }
    for (let i = 0; i < 26; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * 1.2; bone(K, 8 + Math.cos(a) * d, 0.02 + R() * 0.12, 13.8 + Math.sin(a) * d, R() * 6, 0.3 + R() * 0.15); }
    for (let i = 0; i < 6; i++) skull(K, 7.2 + R() * 1.6, R() * 0.12, 13.0 + R() * 1.6, R() * 6, 0.9);
    candleCluster(K, objects, anim, 8, 15.3, 0.95, 3, 'ossario');
    K.box('stoneBase', 8, 0, 15.3, 0.6, 0.95, 0.45, 0, { col: stoneCol(0.6) });
    web(K, 6.05, 3.2, 11.75, Math.PI / 2, 1.1);
    web(K, 9.95, 3.2, 15.95, -Math.PI / 2, 1.0);
  }

  // ---------------- sala redonda ----------------
  const phi = Math.asin(1.7 / C.r), N = 16, a0 = Math.PI + phi, a1 = Math.PI - phi + Math.PI * 2;
  const PA = a => [C.x + Math.cos(a) * C.r, C.z + Math.sin(a) * C.r];
  const plaqueSegs = [1, 3, 5, 7, 9, 11, 13, 15];
  for (let i = 0; i < N; i++) {
    const aa = a0 + (a1 - a0) * i / N, ab = a0 + (a1 - a0) * (i + 1) / N;
    const [ax, az] = PA(aa), [bx, bz] = PA(ab);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, out = [C.x - mx, 0, C.z - mz];
    const len = Math.hypot(bx - ax, bz - az);
    const cs = [stoneCol(0.5), stoneCol(0.5), stoneCol(0.75), stoneCol(0.75)];
    K.quadOut(WALL, [ax, 0, az], [bx, 0, bz], [bx, 1.2, bz], [ax, 1.2, az], out, [[i * len / 2, 0], [(i + 1) * len / 2, 0], [(i + 1) * len / 2, 0.6], [i * len / 2, 0.6]], cs);
    K.quadOut(WALL, [ax, 1.2, az], [bx, 1.2, bz], [bx, WH, bz], [ax, WH, az], out, [[i * len / 2, 0.6], [(i + 1) * len / 2, 0.6], [(i + 1) * len / 2, WH / 2], [i * len / 2, WH / 2]], [stoneCol(0.75), stoneCol(0.75), stoneCol(0.6), stoneCol(0.6)]);
    const ol = Math.hypot(out[0], out[2]), ux = -out[0] / ol, uz = -out[2] / ol;
    K.hit(mx + ux * 0.3, mz + uz * 0.3, len / 2 + 0.15, 0.3, Math.atan2(-(bz - az), bx - ax), -0.5, WH + 0.5, true);
    // lápides das famílias
    const pi = plaqueSegs.indexOf(i);
    if (pi >= 0) {
      const rot = Math.atan2(out[0], out[2]);
      K.box('marble', mx - ux * 0.02, 1.05, mz - uz * 0.02, 1.12, 0.78, 0.06, rot, { col: gray(0.55) });
      K.face('int:c:plaque' + pi, mx - ux * 0.055, 1.08, mz - uz * 0.055, 1.05, 0.7, rot, UV1, [gray(0.8), gray(0.8), gray(0.85), gray(0.85)]);
      K.box('marble', mx - ux * 0.06, 0.95, mz - uz * 0.06, 0.9, 0.1, 0.16, rot, { col: gray(0.5) });
    }
  }
  // tímpano sobre o arco de entrada e cornija
  tympanum(WALL, 12.43, 10, 1, 0, VS, VR, WH, 0.45);
  {
    const n = 32;
    for (let i = 0; i < n; i++) {
      const aa = (i / n) * Math.PI * 2, ab = ((i + 1) / n) * Math.PI * 2;
      const P = (a, r, y) => [C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r];
      K.quadOut('granite', P(aa, C.r - 0.18, WH), P(ab, C.r - 0.18, WH), P(ab, C.r - 0.18, WH + 0.18), P(aa, C.r - 0.18, WH + 0.18), [-Math.cos((aa + ab) / 2), 0, -Math.sin((aa + ab) / 2)], [[0, 0], [0.6, 0], [0.6, 0.1], [0, 0.1]], [gray(0.4), gray(0.4), gray(0.5), gray(0.5)]);
      K.quadOut('granite', P(aa, C.r, WH), P(ab, C.r, WH), P(ab, C.r - 0.18, WH), P(aa, C.r - 0.18, WH), [0, -1, 0], [[0, 0], [0.6, 0], [0.6, 0.1], [0, 0.1]], [gray(0.3), gray(0.3), gray(0.3), gray(0.3)]);
    }
  }
  // cúpula de tijolos
  {
    const n = 24, rings = 6, top = 2.3;
    const P = (i, k) => { const a = (i / n) * Math.PI * 2, e = (k / rings) * Math.PI / 2, r = (C.r - 0.18) * Math.cos(e); return [C.x + Math.cos(a) * r, WH + 0.18 + Math.sin(e) * top, C.z + Math.sin(a) * r]; };
    for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) {
      const a = P(i, k), b = P(i + 1, k), c = P(i + 1, k + 1), d = P(i, k + 1);
      const kk = 0.32 + 0.1 * (k / rings);
      K.quadOut(VAULT, a, b, c, d, V.sub([C.x, WH, C.z], V.scl(V.add(V.add(a, b), V.add(c, d)), 0.25)), [[i * 0.9, k * 0.8], [(i + 1) * 0.9, k * 0.8], [(i + 1) * 0.9, (k + 1) * 0.8], [i * 0.9, (k + 1) * 0.8]], [gray(kk), gray(kk), gray(kk + 0.03), gray(kk + 0.03)]);
    }
    K.hit(C.x, C.z, C.r, C.r, 0, WH + 0.5, WH + 1.0, true);
  }
  // sarcófago de mármore sobre dois degraus, com a cruz em relevo na tampa
  {
    const sx = 1.1, sz = 2.3;
    K.box('granite', C.x, 0, C.z, sx + 1.2, 0.18, sz + 1.2, 0, { col: gray(0.5) });
    K.box('granite', C.x, 0.18, C.z, sx + 0.6, 0.16, sz + 0.6, 0, { col: gray(0.55) });
    K.box('marble', C.x, 0.34, C.z, sx, 0.66, sz, 0, { col: gray(0.72) });
    K.face('int:c:sarco', C.x + sx / 2 + 0.005, 0.38, C.z, sz - 0.1, 0.58, Math.PI / 2, UV1, [gray(0.75), gray(0.75), gray(0.85), gray(0.85)]);
    K.face('int:c:sarco', C.x - sx / 2 - 0.005, 0.38, C.z, sz - 0.1, 0.58, -Math.PI / 2, UV1, [gray(0.7), gray(0.7), gray(0.8), gray(0.8)]);
    K.box('marble', C.x, 1.0, C.z, sx + 0.12, 0.1, sz + 0.12, 0, { col: gray(0.78), bottom: true });
    K.box('marble', C.x, 1.1, C.z - 0.1, 0.12, 0.04, 1.5, 0, { col: gray(0.82) });
    K.box('marble', C.x, 1.1, C.z + 0.3, 0.7, 0.04, 0.12, 0, { col: gray(0.82) });
    K.hit(C.x, C.z, sx / 2 + 0.06, sz / 2 + 0.06, 0, 0, 1.1);
    K.walk(C.x, C.z, sx / 2 + 0.06, sz / 2 + 0.06, 1.1);
    K.walk(C.x, C.z, (sx + 1.2) / 2, (sz + 1.2) / 2, 0.18);
    K.walk(C.x, C.z, (sx + 0.6) / 2, (sz + 0.6) / 2, 0.34);
  }
  // castiçais em volta, lustre de ferro no alto da cúpula
  candelabra(K, objects, anim, 15.6, 7.1, 1.2, 'salaSO');
  candelabra(K, objects, anim, 21.4, 12.9, 1.2, 'salaNE');
  candelabra(K, objects, anim, 21.4, 7.1, 1.2, null, true);
  candelabra(K, objects, anim, 15.6, 12.9, 1.2, null);
  chandelier(ctx, objects, anim, o, C.x, WH + 2.4, C.z, L.lustre);
  K.floor('int:c:glow', C.x - 5, C.z - 5, C.x + 5, C.z + 5, 0.03, 99, null, 0);
  // grade de ferro na entrada da sala (aberta, rangendo)
  {
    const g = part(ctx, k => {
      for (let i = 0; i <= 8; i++) {
        const z = i * 0.21;
        k.beam('iron', [0, 0, z], [0, 2.3, z], 0.035, 0.035, gray(0.3));
        k.prism('iron', [0, 2.3, z], [0, 2.45, z], 0.04, 0, 4, gray(0.3));
      }
      for (const y of [0.15, 1.2, 2.25]) k.beam('iron', [0, y, -0.02], [0, y, 1.7], 0.05, 0.03, gray(0.28));
    }, o.x + 12.55, o.y, o.z + 8.35);
    g.rotation.y = -1.9;
    objects.add(g);
    anim.push((dt, t) => { g.rotation.y = -1.9 + Math.sin(t * 0.6) * 0.04 + Math.sin(t * 1.7) * 0.015; });
    K.hit(12.0, 7.75, 0.15, 0.8, 0, 0, 2.4);
  }
  // raízes atravessando o teto
  const root = (x, y, z, len, lean) => {
    let p = [x, y, z], r = 0.07 + R() * 0.05, a = R() * 6.28;
    for (let i = 0; i < 6; i++) {
      const s = len / 6, q = [p[0] + Math.cos(a) * lean * s, p[1] - s, p[2] + Math.sin(a) * lean * s];
      K.prism('barkD', p, q, r, r * 0.75, 5, gray(0.4), false, 0.5);
      p = q; r *= 0.75; a += (R() - 0.5) * 1.8;
      if (R() < 0.3) { const b = [p[0] + (R() - 0.5) * 0.5, p[1] - 0.3 - R() * 0.3, p[2] + (R() - 0.5) * 0.5]; K.prism('barkD', p, b, r * 0.7, 0.01, 4, gray(0.35)); }
    }
  };
  for (let i = 0; i < 11; i++) { const a = R() * 6.28, d = 1.8 + R() * 3.4; root(C.x + Math.cos(a) * d, WH + 2.3 - d * 0.28, C.z + Math.sin(a) * d, 1.6 + R() * 1.8, 0.3); }
  for (let i = 0; i < 6; i++) root(5 + R() * 7, VS + VR - 0.1, 9.3 + R() * 1.4, 1.1 + R() * 0.9, 0.35);
  // raízes saindo das juntas das paredes
  for (let i = 0; i < 6; i++) { const a = R() * 6.28; root(C.x + Math.cos(a) * (C.r - 0.05), 3.2 + R() * 0.8, C.z + Math.sin(a) * (C.r - 0.05), 1.2 + R() * 1.0, 0.45); }
  for (let i = 0; i < 3; i++) root(1.5 + R() * 2, springAt(3 + i * 1.6) + VR - 0.1, 3 + i * 1.6, 0.5 + R() * 0.7, 0.3);
  // teias nos cantos e entre os castiçais
  web(K, 4.25, VS + 0.6, 8.35, 0, 0.9);
  web(K, 12.35, VS + 0.4, 11.65, Math.PI, 1.0);
  web(K, 0.85, springAt(2.3) - 0.4, 2.4, Math.PI / 2, 0.9);
  web(K, 4.15, springAt(6) - 0.3, 6.0, -Math.PI / 2, 0.8);
  for (let i = 0; i < 5; i++) { const a = R() * 6.28; const [x, z] = PA(a); web(K, C.x + (x - C.x) * 0.98, WH - 0.1, C.z + (z - C.z) * 0.98, Math.atan2(C.x - x, C.z - z) + Math.PI / 2, 1.1); }
  // ossos e restos espalhados, caixão tombado, castiçal caído
  for (let i = 0; i < 14; i++) { const a = R() * 6.28, d = 2.4 + R() * 3.2; bone(K, C.x + Math.cos(a) * d, 0.02, C.z + Math.sin(a) * d, R() * 6, 0.3 + R() * 0.15); }
  skull(K, 22.7, 0, 9.2, -1.2, 1);
  skull(K, 9.2, 0, 9.0, 2.1, 1);
  {
    const F = K.frame(16.2, 0.3, 14.6, 0.5, 0, 1.25);
    F.box('woodDark', 0, -0.3, 0, 0.6, 0.5, 2.0, gray(0.3), 1, '');
    K.box('woodDark', 17.1, 0, 15.1, 0.6, 0.04, 2.0, 0.2, { col: gray(0.25) });
    K.hit(16.4, 14.7, 0.5, 1.05, 0.5, 0, 0.6);
    for (let i = 0; i < 5; i++) bone(K, 16.9 + R() * 0.6, 0.02, 14.2 + R() * 1.2, R() * 6, 0.35);
    skull(K, 17.3, 0, 14.0, 0.4, 1);
  }
  { const F = K.frame(9.8, 0.05, 10.8, 0.4, 0, Math.PI / 2); F.beam('iron', [0, 0, 0], [0, 1.25, 0], 0.035, 0.035, gray(0.3)); F.prism('iron', [0, 0, 0], [0, 0.04, 0], 0.22, 0.22, 6, gray(0.3), true); }
  // poças d'água das goteiras
  B.col = [0.32, 0.34, 0.36];
  for (const [x, z, s] of [[7.1, 10.4, 0.6], [20.4, 6.0, 0.8], [3.0, 10.6, 0.5]]) K.poly('water', Array.from({ length: 8 }, (_, i) => { const a = i / 8 * 6.28; return [x + Math.cos(a) * s * (0.7 + hash(i, s * 10 | 0) * 0.5), z + Math.sin(a) * s * 0.6]; }), 0.012, 1);
  B.col = [1, 1, 1];

  // ---------------- pontos ----------------
  const points = {
    spawn: pt(2.5, 3.1, 0, stairY(3.1)),
    cross: pt(C.x, C.z, Math.PI, 1.1),
    crossFront: pt(C.x - 1.6, C.z, Math.PI / 2),
    stairsBottom: pt(2.5, 10, Math.PI / 2),
    corridor: pt(8.2, 10, Math.PI / 2),
    roomEntry: pt(13.6, 10, Math.PI / 2),
    ossuary: pt(8, 13.4, 0),
    ambush1: pt(8, 13.9, Math.PI),
    ambush2: pt(C.x, C.z - 4.4, 0),
    ambush3: pt(C.x + 4.3, C.z + 1.6, -2.0),
  };

  // ---------------- animação e luzes por trecho ----------------
  let cam = null;
  objects.add(cameraProbe(c => { cam = c; }));
  const SETS = {
    escada: ['lua', 'escada', 'corredor'],
    corredor: ['escada', 'corredor', 'ossario', 'lustre', 'salaSO'],
    ossario: ['ossario', 'corredor', 'escada'],
    sala: ['lustre', 'salaSO', 'salaNE', 'corredor'],
  };
  const roomAt = (x, z) => (z < SZ1 && x < 4.5 ? 'escada' : x < 4.5 ? 'escada' : z > 11.9 && x < 10.5 ? 'ossario' : x < 12.6 ? 'corredor' : 'sala');
  const v3 = new THREE.Vector3();
  const crackU = M['int:c:crack'].uniforms.uColor.value;
  const def = {
    title: 'CRIPTA DOS FUNDADORES',
    bounds: { x0: o.x + 0.9, x1: o.x + 24.7, z0: o.z + 0.4, z1: o.z + 16.3 },
    floorY: o.y,
    spawn: { x: points.spawn.x, z: points.spawn.z, h: 0 },
    exits: [{ x: o.x + 2.5, z: o.z + 0.75, r: 1.0, label: 'SAIR' }],
    lights,
    lightsAll: lights,
    light: name => L[name],
    points,
    objects,
    dark: false,       // true = todas as velas apagam (sobra o luar da porta)
    update(dt, t, active) {
      if (!active) return;
      for (const f of anim) f(dt, t);
      const k = 0.8 + 0.2 * Math.sin(t * 0.7);
      crackU.setRGB(0.45 * k, 0.52 * k, 0.7 * k);
      let px = null, pz = null;
      if (cam) { cam.getWorldDirection(v3); const l = Math.hypot(v3.x, v3.z) || 1; px = cam.position.x + v3.x / l * 3.6; pz = cam.position.z + v3.z / l * 3.6; }
      def.lights = px === null ? lights : SETS[roomAt(px - o.x, pz - o.z)].map(n => L[n]);
      if (def.dark) def.lights = def.lights.filter(l => l.name === 'lua');   // velas apagadas: só o luar da porta
    },
  };
  // chamas acompanham a luz de cada grupo
  const flames = anim.flames || [];
  anim.push((dt, t) => { for (const f of flames) { const l = f.light ? L[f.light] : null; const kk = l ? lightK(l, t) : 1; const s = (0.85 + 0.15 * Math.sin(t * 9 + f.ph) + 0.08 * Math.sin(t * 23 + f.ph * 2)) * (0.5 + 0.5 * kk); f.obj.visible = !def.dark; f.obj.scale.set(s, s * (0.9 + 0.2 * Math.sin(t * 13 + f.ph)), s); } });
  return def;
}

// ---------------------------------------------------------------------------
// peças da cripta
// ---------------------------------------------------------------------------
function bone(K, x, y, z, rot, len) {
  const F = K.frame(x, y, z, rot), c = [0.66, 0.6, 0.48];
  F.beam('carPaint', [-len / 2, 0.025, 0], [len / 2, 0.025, 0], 0.04, 0.04, c);
  for (const s of [-1, 1]) F.box('carPaint', s * len / 2, 0, 0, 0.06, 0.06, 0.08, c);
}

function skull(K, x, y, z, rot, s = 1, k = 0.8) {
  const F = K.frame(x, y, z, rot), c = [0.74 * k, 0.68 * k, 0.54 * k];
  F.box('carPaint', 0, 0.035 * s, -0.01 * s, 0.15 * s, 0.13 * s, 0.17 * s, c);
  F.box('carPaint', 0, 0.0, 0.05 * s, 0.1 * s, 0.05 * s, 0.07 * s, c.map(v => v * 0.9));
  F.face('int:c:skull', 0, 0.02 * s, 0.076 * s, 0.13 * s, 0.13 * s, UV1, [k, k, k]);
}

function web(K, x, y, z, rot, s) {
  // canto superior: a teia desce do ponto (x, y, z) para dentro do plano virado para rot
  const c = Math.cos(rot), sn = Math.sin(rot);
  const P = (u, v) => [x + c * u * s, y - v * s, z - sn * u * s];
  K.quad('int:c:web', P(0, 0), P(1, 0), P(1, 1), P(0, 1), [[0, 1], [1, 1], [1, 0], [0, 0]]);
}

// chama com brilho (peça animada) registrada para tremular
function flame(objects, anim, ctx, x, y, z, light, ph) {
  const g = part(ctx, k => {
    k.quad('int:c:flame', [-0.05, 0, 0], [0.05, 0, 0], [0.05, 0.16, 0], [-0.05, 0.16, 0], UV1);
    k.quad('int:c:flame', [0, 0, -0.05], [0, 0, 0.05], [0, 0.16, 0.05], [0, 0.16, -0.05], UV1);
  }, x, y, z);
  objects.add(g);
  (anim.flames ||= []).push({ obj: g, light, ph });
}

// castiçal de ferro com três velas
function candelabra(K, objects, anim, x, z, h, light, fallen = false) {
  const o = K.o, iron = [0.25, 0.24, 0.24], wax = [0.86, 0.82, 0.7];
  if (fallen) {
    const F = K.frame(x, 0.06, z, 0.7, 0, Math.PI / 2);
    F.beam('iron', [0, 0, 0], [0, h, 0], 0.035, 0.035, iron);
    F.beam('iron', [-0.25, h, 0], [0.25, h, 0], 0.03, 0.03, iron);
    K.box('carPaint', x + 0.6, 0, z + 0.4, 0.05, 0.05, 0.16, 1.2, { col: wax });
    return;
  }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; K.beam('iron', [x, 0.25, z], [x + Math.cos(a) * 0.28, 0.0, z + Math.sin(a) * 0.28], 0.035, 0.035, iron); }
  K.beam('iron', [x, 0.2, z], [x, h, z], 0.04, 0.04, iron);
  K.beam('iron', [x - 0.28, h, z], [x + 0.28, h, z], 0.03, 0.03, iron);
  for (const dx of [-0.28, 0, 0.28]) {
    const top = h + (dx === 0 ? 0.12 : 0);
    if (dx === 0) K.beam('iron', [x, h, z], [x, top, z], 0.03, 0.03, iron);
    K.prism('iron', [x + dx, top, z], [x + dx, top + 0.03, z], 0.06, 0.07, 6, iron, true);
    const hh = 0.14 + hash(x * 10 | 0, dx * 10 | 0) * 0.12;
    K.prism('carPaint', [x + dx, top + 0.03, z], [x + dx, top + 0.03 + hh, z], 0.025, 0.025, 6, wax, true);
    K.box('carPaint', x + dx + 0.03, top + 0.03, z, 0.012, hh * 0.6, 0.012, 0, { col: wax.map(v => v * 0.95) });
    flame(objects, anim, K.ctx, o.x + x + dx, o.y + top + 0.03 + hh, o.z + z, light, x + dx * 7);
  }
  K.round(x, z, 0.3, 0, h);
}

// grupo de velas derretidas no chão ou numa pedra
function candleCluster(K, objects, anim, x, z, y, n, light) {
  const o = K.o, wax = [0.84, 0.8, 0.68];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, d = i === 0 ? 0 : 0.12 + (i % 2) * 0.08, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, h = 0.08 + hash(i, n) * 0.25;
    K.prism('carPaint', [cx, y, cz], [cx, y + h, cz], 0.03 + (i % 2) * 0.008, 0.026, 6, wax, true);
    K.poly('carPaint', Array.from({ length: 6 }, (_, j) => [cx + Math.cos(j) * 0.07, cz + Math.sin(j) * 0.07]), y + 0.006, 1);
    flame(objects, anim, K.ctx, o.x + cx, o.y + y + h, o.z + cz, light, i * 1.7 + x);
  }
}

// lustre de ferro (aro com velas) pendurado por corrente, balançando
function chandelier(ctx, objects, anim, o, x, y, z, light) {
  const n = 6, rr = 0.7, drop = 1.6;
  const g = part(ctx, k => {
    k.beam('iron', [0, 0, 0], [0, -drop, 0], 0.025, 0.025, [0.2, 0.2, 0.2]);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      k.beam('iron', [Math.cos(a0) * rr, -drop, Math.sin(a0) * rr], [Math.cos(a1) * rr, -drop, Math.sin(a1) * rr], 0.04, 0.04, [0.22, 0.21, 0.2]);
      k.beam('iron', [0, -drop + 0.5, 0], [Math.cos(a0) * rr, -drop, Math.sin(a0) * rr], 0.015, 0.015, [0.2, 0.2, 0.2]);
      k.prism('carPaint', [Math.cos(a0) * rr, -drop + 0.02, Math.sin(a0) * rr], [Math.cos(a0) * rr, -drop + 0.16, Math.sin(a0) * rr], 0.025, 0.025, 6, [0.84, 0.8, 0.68], true);
    }
  }, x + o.x * 0, y, z);
  g.position.set(o.x + x, o.y + y, o.z + z);
  const flames = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const f = part(ctx, k => {
      k.quad('int:c:flame', [-0.05, 0, 0], [0.05, 0, 0], [0.05, 0.16, 0], [-0.05, 0.16, 0], UV1);
      k.quad('int:c:flame', [0, 0, -0.05], [0, 0, 0.05], [0, 0.16, 0.05], [0, 0.16, -0.05], UV1);
    }, Math.cos(a) * rr, -drop + 0.16, Math.sin(a) * rr);
    g.add(f); flames.push(f);
    (anim.flames ||= []).push({ obj: f, light: 'lustre', ph: i * 1.3 });
  }
  objects.add(g);
  const anchor = new THREE.Object3D(); anchor.position.set(0, -drop + 0.2, 0); g.add(anchor);
  const v = new THREE.Vector3();
  anim.push((dt, t) => {
    g.rotation.z = Math.sin(t * 0.5) * 0.03; g.rotation.x = Math.sin(t * 0.37 + 1) * 0.025;
    g.updateMatrixWorld(true); anchor.getWorldPosition(v); light.x = v.x; light.y = v.y; light.z = v.z;
  });
}
