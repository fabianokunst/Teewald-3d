import * as THREE from 'three';
import { MeshBuilder, geometryFromBuilder } from '../engine/builder.js';
import { rng, fbm } from './geo.js';
import { NEAR } from './terrain.js';

// Árvores instanciadas: araucária, plátano (outono), nativas, pinheiro, cipreste,
// arbustos e hortênsias. Geometria low poly com folhagem recortada (alpha test).

function crossQuads(B, mat, w, h, n = 2, y0 = 0, top = false) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
    B.quad(mat, [-c, y0, -s], [c, y0, s], [c, y0 + h, s], [-c, y0 + h, -s]);
  }
  if (top) {
    const y = y0 + h * 0.55, r = w / 2 * 0.9;
    B.quad(mat, [-r, y, r], [r, y, r], [r, y, -r], [-r, y, -r]);
  }
}

function cluster(B, mat, x, y, z, r, rot) {
  for (let i = 0; i < 2; i++) {
    const a = rot + (i / 2) * Math.PI, c = Math.cos(a) * r, s = Math.sin(a) * r;
    B.quad(mat, [x - c, y - r, z - s], [x + c, y - r, z + s], [x + c, y + r, z + s], [x - c, y + r, z - s]);
  }
  const rr = r * 0.95;
  B.quad(mat, [x - rr, y, z + rr], [x + rr, y, z + rr], [x + rr, y, z - rr], [x - rr, y, z - rr]);
}

function makeTypes() {
  const T = {};
  const mk = (name, fn, radius) => {
    const B = new MeshBuilder(0);
    fn(B);
    const mats = [...new Set([...B.groups.values()].map(g => g.mat))];
    T[name] = { parts: mats.map(m => ({ mat: m, geo: geometryFromBuilder(B, m) })), radius };
  };
  mk('araucaria', B => {
    B.cylinder('barkA', 0, 0, 0, 0.36, 0.16, 16.5, 5, { vRepeat: 6 });
    const whorls = [[12.2, 4.4, 6], [13.5, 3.9, 6], [14.8, 3.2, 5], [15.9, 2.3, 5]];
    whorls.forEach(([y, L, n], wi) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + wi * 0.6;
        const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
        const lift = L * 0.38, w = 1.5;
        const p0 = [dx * 0.2, y, dz * 0.2], p1 = [dx * L, y + lift, dz * L];
        // folha horizontal (inclinada) e vertical ao longo do galho
        B.quad('araucariaBranch', [p0[0] - px * w * 0.4, p0[1], p0[2] - pz * w * 0.4], [p0[0] + px * w * 0.4, p0[1], p0[2] + pz * w * 0.4],
          [p1[0] + px * w, p1[1] + 0.3, p1[2] + pz * w], [p1[0] - px * w, p1[1] + 0.3, p1[2] - pz * w]);
        B.quad('araucariaBranch', [p0[0], p0[1] - 0.5, p0[2]], [p1[0], p1[1] - 0.6, p1[2]], [p1[0], p1[1] + 1.4, p1[2]], [p0[0], p0[1] + 0.6, p0[2]]);
      }
    });
  }, 0.4);
  mk('platano', B => {
    B.cylinder('barkP', 0, 0, 0, 0.34, 0.22, 6.2, 6, { vRepeat: 3 });
    const cl = [[0, 7.6, 0, 3.4], [2.2, 6.5, 0.8, 2.6], [-2.1, 6.7, -0.7, 2.7], [0.6, 6.3, -2.2, 2.5], [-0.7, 6.4, 2.1, 2.4], [-0.4, 9.4, 0.3, 2.4]];
    cl.forEach(([x, y, z, r], i) => cluster(B, 'crownAutumn', x, y, z, r, i * 0.7));
  }, 0.4);
  mk('nativa', B => {
    B.cylinder('barkD', 0, 0, 0, 0.28, 0.18, 4.6, 5, { vRepeat: 2 });
    const cl = [[0, 6.0, 0, 2.9], [1.7, 5.0, 0.6, 2.2], [-1.6, 5.2, -0.6, 2.3], [0.2, 7.6, 0.2, 2.0]];
    cl.forEach(([x, y, z, r], i) => cluster(B, 'crownGreen', x, y, z, r, i * 0.9));
  }, 0.3);
  mk('pinheiro', B => {
    B.cylinder('barkD', 0, 0, 0, 0.22, 0.12, 3, 4, { vRepeat: 1 });
    crossQuads(B, 'pine', 5.2, 12.5, 3, 0);
  }, 0.3);
  mk('cipreste', B => crossQuads(B, 'cypress', 1.9, 7.5, 2, 0), 0.35);
  mk('arbusto', B => crossQuads(B, 'bush', 1.8, 1.5, 2, -0.1, true), 0);
  mk('hortensia', B => crossQuads(B, 'hortensia', 1.4, 1.1, 2, -0.05, true), 0);
  mk('far', B => {
    B.cylinder('barkD', 0, 0, 0, 0.3, 0.2, 5, 4, { vRepeat: 2 });
    cluster(B, 'crownAutumn', 0, 7, 0, 3.6, 0);
  }, 0);
  mk('farA', B => {
    B.cylinder('barkA', 0, 0, 0, 0.3, 0.15, 15, 4, { vRepeat: 4 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI, c = Math.cos(a) * 4.5, s = Math.sin(a) * 4.5;
      B.quad('araucariaBranch', [-c, 13.5, -s], [c, 13.5, s], [c, 16.5, s], [-c, 16.5, -s]);
    }
    B.quad('araucariaBranch', [-4, 15.4, 4], [4, 15.4, 4], [4, 15.4, -4], [-4, 15.4, -4]);
  }, 0);
  return T;
}

const AUTUMN = [[1, 1, 1], [1.12, 0.72, 0.45], [1.08, 0.95, 0.62], [0.92, 0.68, 0.42], [1.15, 0.85, 0.5], [0.8, 0.85, 0.5], [1.18, 0.6, 0.38]];
const GREEN = [[1, 1, 1], [0.9, 1, 0.85], [1.1, 1.02, 0.7], [1.2, 0.95, 0.55], [0.85, 0.9, 0.95]];

export function scatterVegetation(ctx) {
  const R = rng(777);
  const { terrain, roads, rivers, zones, trees, collision } = ctx;
  // não nasce dentro de bancos, mesas, postes, muros, cercas, carros...
  const clear = (x, z, r) => !collision.near(x, z, r + 1).some(it => {
    if (it.t === 'circle') return Math.hypot(x - it.x, z - it.z) < it.r + r;
    const dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
    return Math.abs(lx) < it.hx + r && Math.abs(lz) < it.hz + r;
  });
  const ok = (x, z, r = 1.5, allowBlocked = false) => {
    if (!terrain.inBounds(x, z)) return false;
    if (!clear(x, z, 0.8)) return false;
    if (roads.index.clearance(x, z).d < r + (roads.index.clearance(x, z).seg?.data.sidewalk ? 2.2 : 0)) return false;
    const rv = rivers.index.nearest(x, z);
    if (rv.seg && rv.d < rv.seg.data.width / 2 + 1.2) return false;
    if (zones.insideBuilding(x, z, 1.8)) return false;
    if (ctx.fenceIndex && ctx.fenceIndex.nearest(x, z).d < 0.9) return false; // muros e cercas
    if (!allowBlocked && zones.isBlocked(x, z)) return false;
    return true;
  };
  // validação das árvores pedidas pelos marcos (praça, calçadão, igreja...)
  const req = trees.splice(0).filter(t => ok(t.x, t.z, 0.6, true) || t.t === 'hortensia' || t.t === 'cipreste');
  trees.push(...req);
  const play = ctx.playBounds;
  // mata: grade com jitter
  const n = NEAR;
  for (let z = n.z0 + 4; z < n.z1 - 4; z += 9) for (let x = n.x0 + 4; x < n.x1 - 4; x += 9) {
    const inPlay = x > play.x0 - 60 && x < play.x1 + 60 && z > play.z0 - 60 && z < play.z1 + 60;
    if (!inPlay && ((Math.floor(x / 9) + Math.floor(z / 9)) & 1)) continue;
    const px = x + R.range(-4, 4), pz = z + R.range(-4, 4);
    if (!zones.isForest(px, pz)) continue;
    if (!ok(px, pz)) continue;
    const f = fbm(px * 0.02, pz * 0.02, 2);
    const r = R();
    let t;
    if (f > 0.58) t = r < 0.55 ? 'araucaria' : r < 0.8 ? 'pinheiro' : 'nativa';
    else t = r < 0.42 ? 'platano' : r < 0.72 ? 'nativa' : r < 0.86 ? 'araucaria' : 'pinheiro';
    trees.push({ t, x: px, z: pz, s: R.range(0.75, 1.25) });
    if (R.chance(0.25)) {
      const bx = px + R.range(-3, 3), bz = pz + R.range(-3, 3);
      if (ok(bx, bz)) trees.push({ t: 'arbusto', x: bx, z: bz, s: R.range(0.8, 1.4) });
    }
  }
  // quintais e terrenos da cidade
  for (let z = play.z0; z < play.z1; z += 17) for (let x = play.x0; x < play.x1; x += 17) {
    const px = x + R.range(-7, 7), pz = z + R.range(-7, 7);
    if (zones.isForest(px, pz) || !ok(px, pz, 2.5)) continue;
    if (!R.chance(0.55)) continue;
    const r = R();
    const t = r < 0.35 ? 'platano' : r < 0.55 ? 'nativa' : r < 0.7 ? 'araucaria' : r < 0.82 ? 'arbusto' : r < 0.92 ? 'hortensia' : 'cipreste';
    trees.push({ t, x: px, z: pz, s: R.range(0.7, 1.15) });
  }
  // plátanos nas ruas do centro
  const core = [-110, -10];
  for (const road of roads.list) {
    if (road.rank < 3) continue;
    const P = road.pts;
    for (let i = 2; i < P.length - 2; i += 6) {
      const [x, z] = P[i];
      if (Math.hypot(x - core[0], z - core[1]) > 300) continue;
      const a = P[i - 1], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const side = (i / 6) % 2 ? 1 : -1;
      const off = road.hw + (road.sidewalk ? 1.5 : 2.6);
      const tx = x - (dz / l) * off * side, tz = z + (dx / l) * off * side;
      if (!R.chance(0.55)) continue;
      if (roads.index.clearance(tx, tz, d => d !== road).d < 2 || zones.insideBuilding(tx, tz, 2) || zones.isBlocked(tx, tz) || !clear(tx, tz, 0.8)) continue;
      trees.push({ t: 'platano', x: tx, z: tz, s: R.range(0.8, 1.0) });
    }
  }
  // anel distante (morros)
  for (let z = -1300; z <= 1300; z += 20) for (let x = -1300; x <= 1300; x += 20) {
    if (x > n.x0 && x < n.x1 && z > n.z0 && z < n.z1) continue;
    if (Math.hypot(x, z) > 1350 || !R.chance(0.65)) continue;
    const px = x + R.range(-8, 8), pz = z + R.range(-8, 8);
    trees.push({ t: R.chance(0.35) ? 'farA' : 'far', x: px, z: pz, s: R.range(0.9, 1.4), far: true });
  }
}

export function buildVegetation(ctx, materials) {
  const T = makeTypes();
  const R = rng(4321);
  const CH = 200;
  const groups = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const t of ctx.trees) {
    const y = t.far ? ctx.terrain.raw(t.x, t.z) : ctx.terrain.heightAt(t.x, t.z);
    const key = t.t + '|' + Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH);
    let g = groups.get(key);
    if (!g) { g = { type: t.t, list: [] }; groups.set(key, g); }
    const tint = t.c || (t.t === 'platano' || t.t === 'far' ? R.pick(AUTUMN) : t.t === 'nativa' ? R.pick(GREEN) : t.t === 'araucaria' || t.t === 'farA' ? [R.range(0.85, 1.05), R.range(0.9, 1.05), R.range(0.85, 1)] : [R.range(0.9, 1.05), R.range(0.9, 1.05), R.range(0.85, 1.0)]);
    g.list.push({ x: t.x, y: y - 0.1, z: t.z, s: t.s || 1, r: R.range(0, Math.PI * 2), c: tint });
    // colisão do tronco
    const rad = T[t.t].radius * (t.s || 1);
    if (rad > 0 && !t.far) ctx.collision.addCircle(t.x, t.z, rad, y - 1, y + 8, { cam: t.t === 'araucaria' || t.t === 'platano' });
  }
  const root = new THREE.Group();
  const color = new THREE.Color();
  for (const g of groups.values()) {
    const type = T[g.type];
    for (const part of type.parts) {
      const mesh = new THREE.InstancedMesh(part.geo, materials[part.mat], g.list.length);
      g.list.forEach((it, i) => {
        e.set(0, it.r, 0); q.setFromEuler(e);
        v.set(it.x, it.y, it.z); sc.set(it.s, it.s * (0.9 + (i % 5) * 0.05), it.s);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, color.setRGB(it.c[0], it.c[1], it.c[2]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  return root;
}
