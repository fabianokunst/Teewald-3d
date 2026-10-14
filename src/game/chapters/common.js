import * as THREE from 'three';
import { CHURCH } from '../../world/church.js';
import { distToPoly, pointInPoly } from '../../world/geo.js';
import { ps1Material } from '../../engine/ps1material.js';
import { M } from '../../engine/materials.js';
import { signMaterial } from '../../engine/materials.js';

// Lugares de Teewald usados pelos capítulos e peças de cenário simples
// (caixotes, velas, ninhos, cratera, forja, túmulo, boca da gruta).

export const frame = (x, z, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
};

// prédio especial pelo texto da placa (o mais perto de near, se houver vários)
export function building(G, re, near = null) {
  const list = (G.L.specials || []).filter(s => re.test(s.sign || s.signText || ''));
  if (!list.length) return null;
  if (!near) return list[0];
  return list.reduce((a, b) => (Math.hypot(a.x - near[0], a.z - near[1]) < Math.hypot(b.x - near[0], b.z - near[1]) ? a : b));
}

// ponto diante da frente do prédio (a frente é o +z local), virado para a porta
export function front(s, k = 3, side = 0) {
  const f = frame(s.x, s.z, s.rot)(side, s.d / 2 + k);
  return { x: f[0], z: f[1], h: s.rot + Math.PI };
}

// lugares fixos (calculados uma vez)
export function places(G) {
  if (G._places) return G._places;
  const L = G.L, ch = L.church;
  const cf = frame(ch.x, ch.z, ch.rot);
  const hl = CHURCH.L / 2;
  const door = cf(0, hl + 1.5), yard = cf(0, hl + 9), side = cf(CHURCH.W / 2 + 2.5, -4);
  const tower = cf(0, hl - CHURCH.towerD / 2 + 1.2), gable = cf(0, hl + 0.6);
  const fab = building(G, /INDÚSTRIA DE CALÇADOS/, [6, -46]);
  const soc = building(G, /SOCIEDADE CULTURAL/);
  const pref = L.prefeitura || building(G, /PREFEITURA/);
  const museu = building(G, /MUSEU/);
  const agro = building(G, /AGROPECU/);
  const escola = building(G, /ESCOLA/);
  const salao = building(G, /SALÃO PAROQUIAL/);
  const chupa = G.ctx.chupa;
  const P = G._places = {
    church: { x: ch.x, z: ch.z, y: ch.y, rot: ch.rot },
    churchDoor: { x: door[0], z: door[1], h: ch.rot + Math.PI },
    churchYard: { x: yard[0], z: yard[1], h: ch.rot + Math.PI },
    sacristy: { x: side[0], z: side[1], h: ch.rot - Math.PI / 2 },
    tower: { x: tower[0], z: tower[1], y: ch.y + CHURCH.floor + CHURCH.towerH + 1 },
    gable: { x: gable[0], z: gable[1], y: ch.y + CHURCH.floor + CHURCH.wallH + 2.5 },
    cemetery: { x: L.cemetery.c[0], z: L.cemetery.c[1], poly: L.cemetery.poly },
    praca: { x: L.praca.c[0], z: L.praca.c[1] },
    field: { x: L.field.c[0], z: L.field.c[1], ang: L.field.ang },
    kartoffel: { x: L.kartoffel.x, z: L.kartoffel.z, rot: L.kartoffel.rot, hl: L.kartoffel.hl, hw: L.kartoffel.hw, start: L.kartoffel.start },
    factory: fab, factoryDoor: fab ? front(fab, 2.5) : { x: 6, z: -24, h: Math.PI },
    sociedade: soc, sociedadeDoor: soc ? front(soc, 2.5) : { x: -172, z: 120, h: 0 },
    prefeitura: pref, prefeituraBack: pref ? (() => { const f = frame(pref.x, pref.z, pref.rot)(0, -pref.d / 2 - 3); return { x: f[0], z: f[1], h: pref.rot }; })() : { x: -168, z: 160, h: 0 },
    museu: museu, museuDoor: museu ? front(museu, 2.5) : { x: -128, z: -95, h: 0 },
    agro: agro, agroDoor: agro ? front(agro, 3) : { x: 468, z: 80, h: 0 },
    escola: escola, salao: salao,
    coop: { x: chupa.coop.x, z: chupa.coop.z },
    clearing: { x: chupa.clearing.x, z: chupa.clearing.z, r: chupa.clearing.r },
    trail: chupa.trail,
    calcadao: L.calcadao.path,
  };
  // túmulo da bruxa e boca da gruta: o miolo da mata perto da clareira (longe de ruas e casas)
  const cl = P.clearing;
  const g0 = deepForest(G, cl.x, cl.z, 24, 70);
  P.grave = (g0 && spotInForest(G, g0.x, g0.z, 8)) || { x: cl.x + 20, z: cl.z - 18 };
  const c0 = deepForest(G, cl.x, cl.z, 50, 140, P.grave, 40, 1.2);
  P.caveMouth = (c0 && spotInForest(G, c0.x, c0.z, 5)) || { x: cl.x + 40, z: cl.z - 50 };
  return P;
}

// ponto mais fundo da mata num anel em volta de (cx, cz): o mais longe de ruas e casas
export function deepForest(G, cx, cz, r0, r1, avoid = null, avoidR = 0, high = 0) {
  const ctx = G.ctx;
  let best = null, bs = -Infinity;
  for (let r = r0; r <= r1; r += 6) {
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!ctx.zones.isForest(x, z)) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < avoidR) continue;
      const b = ctx.playBounds;
      if (x < b.x0 + 20 || x > b.x1 - 20 || z < b.z0 + 20 || z > b.z1 - 20) continue;
      const rq = ctx.roads.index.nearest(x, z);
      const road = Math.min(70, rq.seg ? rq.d : 70);
      const cem = G.L.cemetery.poly, cd = pointInPoly(x, z, cem) ? -1 : distToPoly(x, z, cem);
      if (cd < 12) continue;
      let house = 40;
      for (const o of ctx.zones.obbs) { const d = Math.hypot(o.x - x, o.z - z) - Math.max(o.hx, o.hz); if (d < house) house = d; }
      const w = ctx.terrain.waterAt(x, z);
      if (w) continue;
      const sc = Math.min(road, house * 1.2, cd * 1.5) - r * 0.05 + high * (ctx.terrain.heightAt(x, z) - ctx.terrain.heightAt(cx, cz));
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
  }
  return best;
}

// lugar sem prédio, árvore nem colisão perto (raio r)
export function spotInForest(G, x, z, r) {
  const ctx = G.ctx;
  for (let k = 0; k < 60; k++) {
    const a = k * 2.4, d = k * 0.7;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (ctx.zones.insideBuilding(px, pz, r)) continue;
    if (ctx.roads.index.clearance(px, pz).d < r * 0.6) continue;
    if (ctx.trees.some(t => Math.hypot(t.x - px, t.z - pz) < r * 0.55)) continue;
    let ok = true;
    for (const it of ctx.collision.near(px, pz, r)) {
      if (it.walk) continue;
      if (it.t === 'circle' && Math.hypot(px - it.x, pz - it.z) < it.r + r * 0.5) { ok = false; break; }
      if (it.t === 'box') { const dx = px - it.x, dz = pz - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c; if (Math.abs(lx) < it.hx + r * 0.5 && Math.abs(lz) < it.hz + r * 0.5) { ok = false; break; } }
    }
    if (ok && !ctx.isDeepWater(px, pz, ctx.groundAt(px, pz, 1000))) return { x: px, z: pz };
  }
  return null;
}

// ---------- peças de cenário (MeshBuilder) ----------
// caixote de madeira com ripas
export function crate(B, G, x, z, rot = 0, s = 0.8, label = null) {
  const y = G.y(x, z) - 0.02;
  B.box('woodPlank', x, y, z, s, s * 0.75, s * 0.7, rot, { uvScale: 1 });
  B.col = [0.6, 0.45, 0.3];
  const f = frame(x, z, rot);
  for (const lz of [-s * 0.36, s * 0.36]) { const p = f(0, lz); B.box('woodDark', p[0], y + s * 0.3, p[1], s * 1.02, 0.06, 0.03, rot, { uvScale: 1 }); }
  B.col = [1, 1, 1];
  if (label) {
    const m = signMaterial(label, { w: 64, h: 24, bg: '#5a4024', fg: '#f2dcb0', border: false });
    const p = f(0, s * 0.351 + 0.005);
    const c = Math.cos(rot), sn = Math.sin(rot), hw = s * 0.35;
    B.quad(m, [p[0] - c * hw, y + s * 0.42, p[1] + sn * hw], [p[0] + c * hw, y + s * 0.42, p[1] - sn * hw], [p[0] + c * hw, y + s * 0.62, p[1] - sn * hw], [p[0] - c * hw, y + s * 0.62, p[1] + sn * hw]);
  }
  G.solid(x, z, s / 2, s * 0.35, rot, y, y + s * 0.75, { cam: false });
  return y + s * 0.75;
}

// vela acesa (o fogo é pedido como luz pelo capítulo)
export function candle(B, x, y, z) {
  B.col = [0.92, 0.9, 0.82];
  B.cylinder('carPaint', x, y, z, 0.035, 0.035, 0.22, 6, { cap: true });
  B.col = [1, 1, 1];
}

// túmulo antigo: lápide de pedra e laje
export function grave(B, G, x, z, rot, name = null) {
  const y = G.y(x, z) - 0.05;
  B.box('granite', x, y, z, 0.9, 0.25, 1.9, rot, { uvScale: 1 });
  const f = frame(x, z, rot), h = f(0, -0.85);
  B.box('granite', h[0], y, h[1], 0.75, 1.0, 0.16, rot, { uvScale: 1 });
  if (name) {
    const m = signMaterial(name, { w: 64, h: 32, bg: '#6e6a62', fg: '#1e1c1a', border: false, sub: '' });
    const p = f(0, -0.85 + 0.081), c = Math.cos(rot), s = Math.sin(rot), hw = 0.3;
    B.quad(m, [p[0] - c * hw, y + 0.45, p[1] + s * hw], [p[0] + c * hw, y + 0.45, p[1] - s * hw], [p[0] + c * hw, y + 0.85, p[1] - s * hw], [p[0] - c * hw, y + 0.85, p[1] + s * hw]);
  }
  G.solid(x, z, 0.45, 0.95, rot, y, y + 0.3, { cam: false, walk: true });
  return { x: h[0], z: h[1], y: y + 1.0 };
}

// ninho de morcegos: bolo escuro de galhos e pelos grudado numa parede
export function nestMesh() {
  const g = new THREE.Group();
  const mat = ps1Material({ map: null, color: 0x2a2018 });
  const geo = new THREE.IcosahedronGeometry(0.9, 1);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const k = 0.75 + Math.random() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const cols = []; for (let i = 0; i < p.count; i++) { const v = 0.6 + Math.random() * 0.5; cols.push(0.35 * v, 0.27 * v, 0.2 * v); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
  g.add(m);
  // olhinhos vermelhos lá dentro
  const eye = ps1Material({ map: null, color: 0xff2010, lit: false });
  for (let i = 0; i < 6; i++) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.04), eye);
    e.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(e.geometry.getAttribute('position').count * 3).fill(1), 3));
    const a = Math.random() * Math.PI * 2;
    e.position.set(Math.cos(a) * 0.75, (Math.random() - 0.5) * 0.4, Math.sin(a) * 0.75);
    g.add(e);
  }
  return g;
}

// alvo que não é criatura (ninho, cristal): recebe tiros, golpes e explosões
export class Breakable {
  constructor(G, obj, x, y, z, o = {}) {
    this.G = G; this.root = obj; this.name = o.name || 'NINHO';
    this.pos = new THREE.Vector3(x, y, z);
    obj.position.set(x, y, z);
    this.hp = this.maxHp = o.hp ?? 4;
    this.radius = o.r ?? 0.9; this.height = o.h ?? 1.6; this.hitY0 = -0.8;
    this.dead = false; this.removed = false; this.static = true;
    this.onBreak = o.onBreak || null;
    this.color = o.color || [0.3, 0.22, 0.15];
    this.resist = o.resist || {};
    G.group(obj);
  }
  raycast(o, d) {
    if (this.dead) return null;
    const c = this.pos, r = this.radius;
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? { t, target: { owner: this, part: 'body' } } : null;
  }
  aimPoint() { return this.dead ? null : this.pos; }
  hit(T, dir, p, from, w) { this.damage(w?.dmg ?? 1, { kind: w?.kind || 'bullet', dir, p }); }
  damage(n, info = {}) {
    if (this.dead) return false;
    const m = this.resist[info.kind] ?? 1;
    if (m <= 0) return false;
    this.hp -= n * m;
    const fx = this.G.effects;
    for (let i = 0; i < 8; i++) fx.spawn({ p: this.pos.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.8, s0: 0.05, s1: 0.02, color: this.color, grav: 9.8, bounce: 0.2 });
    this.root.scale.setScalar(0.9 + Math.random() * 0.15);
    if (this.hp <= 0) {
      this.dead = true;
      for (let i = 0; i < 30; i++) fx.spawn({ p: this.pos.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), life: 1.2, s0: 0.08, s1: 0.03, color: this.color, grav: 9.8, bounce: 0.2, spin: 8 });
      this.root.visible = false;
      this.onBreak?.(this);
      this.removed = true;
    }
    return true;
  }
  update() {}
  dispose() {}
}

// boca da gruta: arco de pedras no barranco
export function caveMouth(B, G, x, z, rot) {
  const y = G.y(x, z);
  const f = frame(x, z, rot);
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI, lx = Math.cos(a) * 2.6, h = Math.sin(a) * 3.2;
    const p = f(lx, 0);
    B.col = [0.62 + (i % 3) * 0.05, 0.6, 0.56];
    B.box('stoneRock', p[0], y + h - 0.6, p[1], 1.4, 1.4, 1.6, rot + i * 0.3, { uvScale: 1.2 });
  }
  // fundo preto (a entrada)
  const a = f(-2.0, 0.2), b = f(2.0, 0.2);
  B.col = [0.02, 0.02, 0.02];
  B.quad('carPaint', [b[0], y - 0.2, b[1]], [a[0], y - 0.2, a[1]], [a[0], y + 2.9, a[1]], [b[0], y + 2.9, b[1]]);
  B.col = [1, 1, 1];
  for (const s of [-1, 1]) { const p = f(s * 3.4, -0.5); B.box('stoneRock', p[0], y - 0.4, p[1], 2.2, 2.6, 2.4, rot + s, { uvScale: 1.2 }); G.solid(p[0], p[1], 1.1, 1.2, rot + s, y - 0.4, y + 2.2); }
  const back = f(0, 1.6);
  G.solid(back[0], back[1], 2.8, 0.6, rot, y - 0.5, y + 3.5);
  return { x: f(0, -1.2)[0], z: f(0, -1.2)[1], y };
}

// túmulo da bruxa: laje rachada, cruz arrancada caída, pedras em círculo
export function witchGrave(B, G, x, z) {
  const y = G.y(x, z);
  B.col = [0.55, 0.56, 0.5];
  B.box('stoneRock', x, y - 0.3, z, 1.4, 0.5, 2.4, 0.3, { uvScale: 1 });
  B.col = [0.3, 0.32, 0.26];
  B.box('stoneRock', x + 0.4, y - 0.1, z + 0.2, 0.7, 0.25, 1.1, 0.7, { uvScale: 1 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 4.5;
    B.col = [0.5 + (i % 2) * 0.08, 0.5, 0.46];
    B.box('stoneRock', x + Math.cos(a) * r, y - 0.2, z + Math.sin(a) * r, 0.7, 0.6 + (i % 3) * 0.25, 0.6, a, { uvScale: 1 });
  }
  B.col = [1, 1, 1];
  G.solid(x, z, 0.7, 1.2, 0.3, y - 0.3, y + 0.2, { cam: false, walk: true });
  return { x, z, y };
}
