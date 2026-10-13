import * as THREE from 'three';
import { ps1Material, ensureColor } from '../engine/ps1material.js';
import { canvasTex, makeCanvas, processPixels } from '../engine/textures.js';
import { MeshBuilder } from '../engine/builder.js';
import { CollisionWorld } from '../engine/collision.js';
import { makeItemModel } from '../game/itemModels.js';
import { GunAudio } from '../game/gunAudio.js';

// Estandes de tiro ao alvo: tábua sobre cavaletes com latas e garrafas, e uma
// caixa de munição no chão ao lado. Lata acertada voa e quica; garrafa quebra.
// Estande limpo volta a se montar; munição recolhida reaparece depois de um tempo.
// Estandes: Calçadão (perto do início, de costas para o rio), Pavilhão da
// Kartoffelfest (barraca de tiro, como nas festas) e atrás de um gol do campo.

const LAYOUT = ['can', 'bottle', 'can', 'can', 'bottle', 'can', 'bottle', 'can'];
const CAN = { r: 0.033, h: 0.122, hit: 0.046 };
const BOTTLE = { h: 0.285, hit: 0.044 };
const CAN_TINTS = [[0.9, 0.16, 0.12], [0.22, 0.38, 0.85], [0.95, 0.8, 0.2], [0.25, 0.62, 0.28], [0.85, 0.86, 0.9]];
const BOTTLE_TINTS = [[0.45, 0.8, 0.42], [0.72, 0.45, 0.2], [0.8, 0.92, 0.86]];
const AMMO_PICK = 12;

const frame = (x, z, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
};

// ---------- malhas ----------
// sólido de revolução: perfil [[y, r], ...] de baixo para cima, tampa no alto
function lathe(profile, n, vTop) {
  const pos = [], nor = [], uv = [];
  const push = (p, nn, u, v) => { pos.push(...p); nor.push(...nn); uv.push(u, v); };
  for (let i = 0; i < profile.length - 1; i++) {
    const [y0, r0] = profile[i], [y1, r1] = profile[i + 1];
    const slope = (r0 - r1) / Math.max(1e-4, y1 - y0);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const P = (a, y, r) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const N = a => { const l = Math.hypot(1, slope); return [Math.cos(a) / l, slope / l, Math.sin(a) / l]; };
      const v0 = y0 / vTop, v1 = y1 / vTop, u0 = k / n, u1 = (k + 1) / n;
      push(P(a0, y0, r0), N(a0), u0, v0); push(P(a1, y1, r1), N(a1), u1, v1); push(P(a1, y0, r0), N(a1), u1, v0);
      push(P(a0, y0, r0), N(a0), u0, v0); push(P(a0, y1, r1), N(a0), u0, v1); push(P(a1, y1, r1), N(a1), u1, v1);
    }
  }
  const [yt, rt] = profile[profile.length - 1];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    push([0, yt, 0], [0, 1, 0], 0.5, 0.98);
    push([Math.cos(a1) * rt, yt, Math.sin(a1) * rt], [0, 1, 0], 0.5, 0.98);
    push([Math.cos(a0) * rt, yt, Math.sin(a0) * rt], [0, 1, 0], 0.5, 0.98);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return ensureColor(g);
}

function canTexture() {
  const c = makeCanvas(32, 32), g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#b8b8bc'; g.fillRect(0, 0, 32, 3); g.fillRect(0, 29, 32, 3);   // bordas de alumínio
  g.fillStyle = '#ffffff'; g.fillRect(0, 12, 32, 5);                             // faixa clara
  g.fillStyle = '#d8d8d8'; for (let x = 0; x < 32; x += 8) g.fillRect(x + 2, 19, 4, 6);
  g.fillStyle = '#9a9a9e'; g.fillRect(0, 0, 32, 1);
  return canvasTex(processPixels(c), true);
}

function bottleTexture() {
  const c = makeCanvas(32, 32), g = c.getContext('2d');
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#ffffff'; g.fillRect(3, 0, 3, 32);                              // reflexo
  g.fillStyle = '#f2ead6'; g.fillRect(0, 21, 32, 8);                             // rótulo
  g.fillStyle = '#9a3a2a'; g.fillRect(0, 23, 32, 2);
  g.fillStyle = '#d8b040'; g.fillRect(0, 0, 32, 2);                              // tampinha
  return canvasTex(processPixels(c), true);
}

function standMesh(M, P, y) {
  const B = new MeshBuilder(0);
  const rot = P.rot;
  const at = P.at;
  B.col = [1, 1, 1];
  const top = at(0, 0);
  B.box('woodPlank', top[0], y + 0.86, top[1], 2.5, 0.05, 0.32, rot, { uvScale: 1 });
  for (const lx of [-1.0, 1.0]) {
    for (const lz of [-0.13, 0.13]) { const p = at(lx, lz); B.box('woodDark', p[0], y, p[2] ?? p[1], 0.06, 0.86, 0.06, rot, { uvScale: 1 }); }
    const p = at(lx, 0);
    B.box('woodDark', p[0], y + 0.3, p[1], 0.06, 0.06, 0.3, rot, { uvScale: 1 });
  }
  return B.build(M);
}

// distância livre: nada da colisão a menos de `rad` do ponto
function clearAt(col, x, z, rad) {
  for (const it of col.near(x, z, rad + 2)) {
    if (it.t === 'circle') { if (Math.hypot(x - it.x, z - it.z) < it.r + rad) return false; continue; }
    const [lx, lz] = CollisionWorld.local(it, x, z);
    const dx = Math.max(0, Math.abs(lx) - it.hx), dz = Math.max(0, Math.abs(lz) - it.hz);
    if (Math.hypot(dx, dz) < rad) return false;
  }
  return true;
}

export class Targets {
  // deps: { effects, audio, inventory, hud }
  constructor(scene, ctx, M, deps) {
    this.ctx = ctx; this.deps = deps;
    this.stands = [];
    this.targets = [];
    this.pickups = [];
    this.extra = [];   // outros alvos (o chupacabras): raycast(o, d, maxD), hit(alvo, dir, p, from), aimPoint()
    const spots = this._findSpots();
    const nCan = spots.length * LAYOUT.filter(t => t === 'can').length;
    const nBottle = spots.length * LAYOUT.filter(t => t === 'bottle').length;
    this.canMesh = new THREE.InstancedMesh(lathe([[0, CAN.r * 0.86], [0.006, CAN.r], [CAN.h - 0.008, CAN.r], [CAN.h, CAN.r * 0.84]], 8, CAN.h), ps1Material({ map: canTexture() }), Math.max(1, nCan));
    this.bottleMesh = new THREE.InstancedMesh(lathe([[0, 0.028], [0.16, 0.031], [0.2, 0.022], [0.228, 0.012], [0.272, 0.012], [BOTTLE.h, 0.014]], 8, BOTTLE.h), ps1Material({ map: bottleTexture() }), Math.max(1, nBottle));
    for (const m of [this.canMesh, this.bottleMesh]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    let ic = 0, ib = 0;
    const col = new THREE.Color();
    spots.forEach((S, si) => {
      const stand = { ...S, targets: [], cleared: 0 };
      scene.add(standMesh(M, S, S.y));
      ctx.collision.addBox(S.x, S.z, 1.27, 0.17, S.rot, S.y, S.y + 0.91, { cam: false });
      LAYOUT.forEach((type, k) => {
        const [x, z] = S.at(-1.05 + k * 0.3, 0);
        const mesh = type === 'can' ? this.canMesh : this.bottleMesh;
        const idx = type === 'can' ? ic++ : ib++;
        const tint = type === 'can' ? CAN_TINTS[(k + si) % CAN_TINTS.length] : BOTTLE_TINTS[(k + si) % BOTTLE_TINTS.length];
        mesh.setColorAt(idx, col.setRGB(tint[0], tint[1], tint[2]));
        const T = {
          type, mesh, idx, tint, stand,
          home: new THREE.Vector3(x, S.y + 0.885, z), yaw: k * 1.7,
          pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), spin: new THREE.Vector3(),
          state: 'idle', t: 0, grow: 1,
        };
        this._reset(T);
        stand.targets.push(T);
        this.targets.push(T);
      });
      // caixa de munição no chão, perto da ponta da tábua
      const [px, pz] = S.at(1.75, 0.55);
      const model = makeItemModel('ammo9', M);
      model.scale.setScalar(1.6);
      const py = ctx.groundAt(px, pz, S.y + 0.3) + 0.02;
      model.position.set(px, py, pz);
      scene.add(model);
      this.pickups.push({ model, x: px, y: py, z: pz, active: true, t: 0 });
      this.stands.push(stand);
    });
    for (const m of [this.canMesh, this.bottleMesh]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this._sync();
    this._tmpQ = new THREE.Quaternion(); this._tmpV = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // ---------- onde montar os estandes ----------
  _findSpots() {
    const ctx = this.ctx, L = ctx.landmarks, col = ctx.collision, T = ctx.terrain;
    const spots = [];
    const flatEnough = (at, y) => [-1.3, 1.3].every(lx => { const [x, z] = at(lx, 0); return Math.abs(T.heightAt(x, z) - y) < 0.3 && !T.waterAt(x, z); });
    const tryAt = (x, z, rot, yFn) => {
      const at = frame(x, z, rot);
      if (!clearAt(col, x, z, 1.5)) return false;
      const y = yFn(x, z);
      if (!flatEnough(at, y) && !yFn.flat) return false;
      spots.push({ x, z, rot, y, at, name: '' });
      return true;
    };
    const ground = (x, z) => ctx.groundAt(x, z, T.heightAt(x, z) + 0.3);

    // 1. calçadão: à frente do ponto inicial (a abertura anda para índices menores), do lado do rio
    if (L.calcadao) {
      const { path, bank } = L.calcadao;
      const i0 = Math.floor(path.length * 0.72);
      let done = false;
      for (let i = i0 - 7; i > i0 - 22 && i > 1 && !done; i--) {
        const p = path[i], a = path[i + 1], b = path[i - 1];
        const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / tl, tz = (b[1] - a[1]) / tl;
        let best = null, bd = Infinity;
        for (const q of bank) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }
        if (!best) break;
        const ox = (best[0] - p[0]) / bd, oz = (best[1] - p[1]) / bd;
        for (const d of [3.6, 4.4, 5.2]) {
          if (d > bd - 2.2) break;
          if (tryAt(p[0] + ox * d, p[1] + oz * d, Math.atan2(-tz, tx), ground)) { done = true; break; }
        }
      }
    }
    // 2. pavilhão da Kartoffelfest: barraca de tiro numa ponta, tábua ao longo do lado curto
    if (L.kartoffel) {
      const k = L.kartoffel, at = frame(k.x, k.z, k.rot);
      const fl = Object.assign(() => k.y + 0.05, { flat: true });
      for (const lx of [12.4, -12.4]) { const [x, z] = at(lx, 0); if (tryAt(x, z, k.rot - Math.PI / 2, fl)) break; }
    }
    // 3. campo: atrás de um dos gols
    if (L.field) {
      const f = L.field, poly = f.poly;
      let bestL = 0, ang = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l > bestL) { bestL = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); }
      }
      const at = frame(f.c[0], f.c[1], ang);
      outer: for (const lz of [-48, 48, -47, 47]) for (const lx of [0, 4, -4]) { const [x, z] = at(lx, lz); if (tryAt(x, z, ang, ground)) break outer; }
    }
    return spots;
  }

  _reset(T) {
    T.state = 'idle'; T.t = 0; T.grow = 0;
    T.pos.copy(T.home);
    T.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), T.yaw);
    T.vel.set(0, 0, 0); T.spin.set(0, 0, 0);
  }

  _sync() {
    const m = new THREE.Matrix4(), s = new THREE.Vector3();
    for (const T of this.targets) {
      const k = T.state === 'broken' ? 0 : T.grow;
      m.compose(T.pos, T.quat, s.set(k, k, k));
      T.mesh.setMatrixAt(T.idx, m);
    }
    this.canMesh.instanceMatrix.needsUpdate = true;
    this.bottleMesh.instanceMatrix.needsUpdate = true;
  }

  // raio contra os alvos (cápsula do pé ao topo); devolve { t, target } ou null
  raycast(o, d, maxD) {
    let best = null;
    const a = new THREE.Vector3(), e = new THREE.Vector3(), w = new THREE.Vector3();
    for (const T of this.targets) {
      if (T.state === 'broken' || T.grow < 0.5) continue;
      const h = T.type === 'can' ? CAN.h : BOTTLE.h, r = T.type === 'can' ? CAN.hit : BOTTLE.hit;
      a.copy(T.pos);
      e.set(0, h, 0).applyQuaternion(T.quat);
      // aproximação mais próxima entre o raio o + d·t e o segmento a + e·s
      w.subVectors(o, a);
      const ee = e.dot(e), de = d.dot(e), dw = d.dot(w), ew = e.dot(w);
      const den = ee - de * de;
      let s = den > 1e-9 ? (ew - de * dw) / den : 0;
      s = Math.max(0, Math.min(1, s));
      const t = Math.max(0, de * s - dw);
      const cx = o.x + d.x * t - (a.x + e.x * s), cy = o.y + d.y * t - (a.y + e.y * s), cz = o.z + d.z * t - (a.z + e.z * s);
      const dist = Math.hypot(cx, cy, cz);
      if (dist > r || t > maxD) continue;
      const th = t - Math.sqrt(Math.max(0, r * r - dist * dist));
      if (!best || th < best.t) best = { t: th, target: T };
    }
    for (const X of this.extra) {
      if (X.dead || X.removed) continue;
      const h = X.raycast(o, d, maxD);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  // alvos em pé, para a mira assistida: cb(alvo, x, y, z, raio)
  aimPoints(cb) {
    for (const T of this.targets) {
      if (T.state !== 'idle' || T.grow < 0.5) continue;
      const can = T.type === 'can';
      cb(T, T.pos.x, T.pos.y + (can ? CAN.h : BOTTLE.h) * 0.45, T.pos.z, (can ? CAN.hit : BOTTLE.hit) * 1.3);
    }
  }

  // w: { kind, dmg } da arma (bala, prata, raio, dardo...)
  hit(T, dir, p, from, w = null) {
    if (T.owner) { T.owner.hit(T, dir, p, from, w); return; }
    const { effects, audio } = this.deps;
    const dist = from ? from.distanceTo(p) : 0;
    if (T.type === 'bottle') {
      const c = this._tmpV.set(0, BOTTLE.h * 0.45, 0).applyQuaternion(T.quat).add(T.pos);
      effects.shatter(c.clone(), dir, T.tint);
      GunAudio.glass(audio, dist);
      T.state = 'broken'; T.t = 0;
    } else {
      T.vel.copy(dir).multiplyScalar(3.2 + Math.random() * 1.6);
      T.vel.y += 2.4 + Math.random() * 1.8;
      T.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 12);
      effects.impact([p.x, p.y, p.z], [-dir.x, -dir.y, -dir.z], 'metal', false);
      GunAudio.can(audio, dist);
      T.state = 'flying'; T.t = 0; T.bounces = 0;
    }
    T.stand.cleared = 0;
  }

  update(dt, player, playing) {
    const ctx = this.ctx, { audio, hud, inventory } = this.deps;
    const pp = player.pos;
    for (const T of this.targets) {
      if (T.grow < 1) T.grow = Math.min(1, T.grow + dt * 4);
      T.t += dt;
      if (T.state !== 'flying') continue;
      T.vel.y -= 9.8 * dt;
      T.pos.addScaledVector(T.vel, dt);
      const w = T.spin.length();
      if (w > 1e-3) { this._tmpQ.setFromAxisAngle(this._tmpV.copy(T.spin).divideScalar(w), w * dt); T.quat.premultiply(this._tmpQ); }
      const g = ctx.groundAt(T.pos.x, T.pos.z, T.pos.y + 0.2) + CAN.r;
      if (T.pos.y < g) {
        T.pos.y = g;
        if (T.vel.y < -1.2 && T.bounces < 4) {
          GunAudio.canBounce(audio, pp.distanceTo(T.pos), Math.min(1, -T.vel.y / 5));
          T.vel.y *= -0.35; T.vel.x *= 0.55; T.vel.z *= 0.55; T.spin.multiplyScalar(0.5); T.bounces++;
        } else {
          // deita de lado e para
          T.state = 'down'; T.t = 0;
          const yaw = Math.atan2(T.vel.x, T.vel.z) + Math.random();
          T.quat.setFromAxisAngle(this._up, yaw).multiply(this._tmpQ.setFromAxisAngle(this._tmpV.set(1, 0, 0), Math.PI / 2));
          T.vel.set(0, 0, 0); T.spin.set(0, 0, 0);
        }
      }
    }
    // estande limpo: remonta depois de alguns segundos; alvo caído longe do jogador volta sozinho
    for (const S of this.stands) {
      const allDown = S.targets.every(T => T.state === 'down' || T.state === 'broken');
      if (allDown) {
        if (S.cleared === 0 && playing) hud?.toast('ESTANDE LIMPO!');
        S.cleared += dt;
        if (S.cleared > 3.5) { S.targets.forEach(T => this._reset(T)); S.cleared = 0; GunAudio.ding(audio); }
      } else {
        S.cleared = 0;
        for (const T of S.targets) if (T.state !== 'idle' && T.state !== 'flying' && T.t > 40 && pp.distanceTo(T.home) > 25) this._reset(T);
      }
    }
    this._sync();
    // caixas de munição: giram, são recolhidas ao passar e reaparecem depois
    for (const P of this.pickups) {
      if (P.active) {
        P.t += dt;
        P.model.rotation.y = P.t * 1.6;
        P.model.position.y = P.y + 0.04 + Math.sin(P.t * 3) * 0.02;
        if (playing && Math.hypot(pp.x - P.x, pp.z - P.z) < 0.9 && Math.abs(pp.y - P.y) < 1.2) {
          const got = inventory.add('ammo9', AMMO_PICK);
          if (got > 0) {
            P.active = false; P.t = 0; P.model.visible = false;
            GunAudio.pickup(audio);
            hud?.toast('MUNIÇÃO 9MM  +' + got);
          } else if (!P.warned) { P.warned = true; hud?.toast('INVENTÁRIO CHEIO'); }
        } else P.warned = false;
      } else {
        P.t += dt;
        if (P.t > 60 && Math.hypot(pp.x - P.x, pp.z - P.z) > 15) { P.active = true; P.t = 0; P.model.visible = true; }
      }
    }
  }
}
