import * as THREE from 'three';
import { ps1Material } from '../../engine/ps1material.js';
import { skinTexture } from '../missionArt.js';
import { clamp, wrapA, damp } from './shapes.js';

// Base de todas as criaturas: posição no chão (ou voando), andar desviando de
// obstáculos, esferas de acerto, dano por tipo de arma (resistências), clarão
// branco no golpe, empurrão, sangue e morte (cai, se desfaz em brasa ou some).
// Cada criatura implementa build(), think(dt, env) e animate(dt).
//
// Tipos de dano: bullet, silver (prata), melee, light (lampião), ray (raios),
// explosion (dinamite), dart (sedativo), fire.

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Creature {
  // deps: { ctx, scene, effects, audio, player, atmo }
  constructor(deps, o = {}) {
    Object.assign(this, deps);
    this.name = o.name || 'CRIATURA';
    this.maxHp = this.hp = o.hp ?? 3;
    this.radius = o.radius ?? 0.45;
    this.height = o.height ?? 1.4;
    this.hitY0 = o.hitY0 ?? 0;
    this.resist = { bullet: 1, silver: 1, melee: 1, light: 0.15, ray: 1, explosion: 1, dart: 0.2, fire: 1, ...(o.resist || {}) };
    this.blood = o.blood || [0.45, 0.04, 0.03];
    this.deathStyle = o.death || 'fall';
    this.flying = !!o.flying;
    this.speedMul = 1;
    this.root = new THREE.Group();
    this.root.visible = false;
    this.mats = [];
    this.spheres = [];
    this.pos = v3(); this.vel = v3();
    this.heading = 0; this.speed = 0;
    this.state = 'idle'; this.st = 0;
    this.dead = false; this.removed = false; this.deadT = 0;
    this.flashT = 0; this.knock = null; this.stun = 0;
    this._t = v3(); this._t2 = v3();
    this.scene.add(this.root);
  }

  // material com textura de pele e cor por vértice; guarda para o clarão do golpe
  mat(o = {}) {
    const m = ps1Material({ map: o.map ?? skinTexture(), ...o });
    this.mats.push(m);
    return m;
  }

  mesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat || this.mats[0] || this.mat());
    m.frustumCulled = false;
    return m;
  }

  // ---------- posição ----------
  place(x, z, heading = 0, y = null) {
    this.pos.set(x, y ?? this.ctx.groundAt(x, z, 1000), z);
    this.heading = heading;
    this.root.visible = true;
    this.sync();
    return this;
  }

  ground(x = this.pos.x, z = this.pos.z) { return this.ctx.groundAt(x, z, this.pos.y + 0.8); }

  // anda na direção de (tx, tz); devolve a distância que faltava
  moveToward(dt, tx, tz, speed, turn = 7, collide = true) {
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    const dist = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    this.heading += wrapA(want - this.heading) * Math.min(1, dt * turn);
    const sp = speed * this.speedMul * clamp(Math.cos(wrapA(want - this.heading)), 0.25, 1);
    this.step(dt, Math.sin(this.heading) * sp, Math.cos(this.heading) * sp, collide);
    return dist;
  }

  // desloca (com colisão, chão e limites); vx/vz em m/s
  step(dt, vx, vz, collide = true) {
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += vx * dt; this.pos.z += vz * dt;
    if (collide && !this.ghost) this.ctx.collision.resolve(this.pos, this.radius * 0.8, Math.min(1.8, this.height));
    const b = this.ctx.playBounds;
    if (b) { this.pos.x = clamp(this.pos.x, b.x0, b.x1); this.pos.z = clamp(this.pos.z, b.z0, b.z1); }
    if (!this.flying) {
      const g = this.ground();
      // rio fundo barra quem não entra na água (wades: o cão de fogo entra, e se apaga)
      if ((!this.wades && this.ctx.isDeepWater(this.pos.x, this.pos.z, g)) || (g > this.pos.y + 0.9 && !this.ghost)) { this.pos.x = ox; this.pos.z = oz; }
    }
    this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    // preso: conta para trocar de rumo
    const want = Math.hypot(vx, vz);
    this.stuckT = Math.max(0, (this.stuckT || 0) + (want > 0.5 && this.speed < want * 0.25 ? dt : -dt));
  }

  get stuck() { if (this.stuckT > 0.6) { this.stuckT = 0; return true; } return false; }

  face(dt, ang, k = 8) { this.heading += wrapA(ang - this.heading) * Math.min(1, dt * k); }

  // mantém no chão (suave)
  stickGround(dt, k = 20) {
    if (this.flying) return;
    this.pos.y = damp(this.pos.y, this.ground(), k, dt);
  }

  toPlayer(env) {
    const P = env.player.pos, dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    return { dx, dz, d: Math.hypot(dx, dz), ang: Math.atan2(dx, dz), dy: P.y - this.pos.y };
  }

  // golpe no jogador se estiver ao alcance e à frente
  strike(env, dmg, range, cos = 0.4, knock = 5, invuln = 0.55) {
    if (!env.playerAlive) return false;
    const { dx, dz, d } = this.toPlayer(env);
    // altura: peito do jogador contra o meio do corpo da criatura
    const gap = Math.abs(env.player.pos.y + 1.0 - (this.pos.y + this.height * 0.5));
    if (d > range + 0.35 || gap > 1.1 + this.height * 0.5) return false;
    if (d > 0.3 && (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / d < cos) return false;
    return env.combat.hurt(dmg, dx / (d || 1), dz / (d || 1), { knock, invuln });
  }

  // empurra o jogador para fora do corpo
  pushPlayer(env) {
    if (!env.playerAlive || this.ghost) return;
    const P = env.player.pos, dx = P.x - this.pos.x, dz = P.z - this.pos.z, d = Math.hypot(dx, dz), m = this.radius + 0.3;
    if (d < m && d > 1e-4 && Math.abs(P.y - this.pos.y) < this.height) { P.x = this.pos.x + dx / d * m; P.z = this.pos.z + dz / d * m; }
  }

  // ---------- tiro ----------
  raycast(o, d, maxD) {
    if (this.dead || !this.root.visible || this.untargetable) return null;
    this.root.updateMatrixWorld(true);
    let best = null;
    const c = this._t;
    for (const S of this.spheres) {
      S.bone.localToWorld(c.copy(S.off));
      const r = S.r * (this.root.scale.x || 1);
      const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
      const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxD) continue;
      if (!best || t < best.t) best = { t, target: { owner: this, part: S.part } };
    }
    return best;
  }

  aimPoint() {
    if (this.dead || !this.root.visible || this.untargetable) return null;
    const S = this.spheres.find(s => s.part === 'body') || this.spheres[0];
    if (!S) return this._t2.set(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z);
    this.root.updateMatrixWorld(true);
    return S.bone.localToWorld(this._t2.copy(S.off));
  }

  // bala (pistola, espingarda, revólver, dardo): pelas esferas
  hit(T, dir, p, from, w) {
    const base = w?.dmg ?? 1, kind = w?.kind || 'bullet';
    const mult = T.part === 'head' ? 2 : T.part === 'weak' ? 2.5 : 1;
    this.damage(base * mult, { kind, dir, p, from, part: T.part, weapon: w?.gun, knock: kind === 'bullet' && w?.gun === 'shotgun' ? 1.2 : 0.8 });
  }

  // devolve false se o golpe não teve efeito
  damage(amount, info = {}) {
    if (this.dead) return false;
    const kind = info.kind || 'bullet';
    let m = this.resist[kind] ?? 1;
    if (kind === 'melee' && info.weapon && this.resist['melee:' + info.weapon] !== undefined) m = this.resist['melee:' + info.weapon];
    if (this.shielded && kind !== 'light') m *= 0.1;
    const p = info.p || this.aimPoint() || this.pos;
    if (m <= 0.001) {
      // sem efeito: faísca/névoa e um som abafado
      if (!info.beam) this._noEffect(p, info);
      return false;
    }
    const dmg = amount * m;
    this.hp -= dmg;
    this.lastHit = { kind, t: 0 };
    if (!info.beam) this.flashT = 0.12;
    else this.flashT = Math.max(this.flashT, 0.05);
    const dir = info.dir || v3(0, 0, 1);
    if (info.knock && !this.heavy) this.knock = { x: dir.x * info.knock, z: dir.z * info.knock };
    if (!info.beam) this.bleed(p, dir, dmg);
    this.onHurt?.(dmg, info);
    if (this.hp <= 0) this.die(info);
    return true;
  }

  _noEffect(p, info) {
    for (let i = 0; i < 5; i++) this.effects.spawn({ p: p.clone ? p.clone() : v3(p.x, p.y, p.z), v: v3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), life: 0.3, s0: 0.04, s1: 0, color: this.immuneColor || [0.8, 0.8, 0.8], drag: 2 });
    this.onImmune?.(info);
  }

  // sangue (ou o que a criatura tiver por dentro)
  bleed(p, dir, dmg = 1) {
    const rnd = () => Math.random() - 0.5, c = this.blood;
    const n = Math.min(16, 6 + Math.round(dmg * 3));
    for (let i = 0; i < n; i++) {
      const v = v3(dir.x * 1.5 + rnd() * 2.4, 0.6 + Math.random() * 2.2, dir.z * 1.5 + rnd() * 2.4);
      const k = 0.7 + Math.random() * 0.5;
      this.effects.spawn({ p: p.clone ? p.clone() : v3(p.x, p.y, p.z), v, life: 0.5 + Math.random() * 0.5, s0: 0.035 + Math.random() * 0.03, s1: 0.02, color: [c[0] * k, c[1] * k, c[2] * k], grav: this.bloodGrav ?? 9.8, bounce: 0.1, drag: 0.6 });
    }
  }

  die(info = {}) {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.hp = 0;
    this.state = 'dead'; this.st = 0;
    this.deathDir = info.dir || v3(0, 0, 1);
    this.onDeath?.(info);
    this.combat?.onKill?.(this, info);
  }

  // ---------- quadro a quadro ----------
  update(dt, env) {
    this.st += dt;
    if (this.flashT > 0) this.flashT -= dt;
    const fl = this.flashT > 0 ? 1 : 0;
    for (const m of this.mats) {
      const e = m.uniforms.uEmissive.value, base = m.userData.emissive || (m.userData.emissive = e.clone());
      if (fl) e.setRGB(0.8, 0.75, 0.7); else e.copy(base);
    }
    if (this.knock) {
      this.step(dt, this.knock.x, this.knock.z, !this.flying);
      const f = Math.exp(-dt * 8); this.knock.x *= f; this.knock.z *= f;
      if (Math.hypot(this.knock.x, this.knock.z) < 0.15) this.knock = null;
    }
    if (this.dead) {
      this.deadT += dt;
      this.dying(dt);
    } else {
      this.stun = Math.max(0, this.stun - dt);
      this.think(dt, env);
      this.pushPlayer(env);
    }
    this.animate(dt, env);
    this.sync();
  }

  // morte padrão
  dying(dt) {
    const t = this.deadT;
    if (this.deathStyle === 'burst') {
      // se desfaz em brasas / fumaça na hora
      if (!this.burst) {
        this.burst = true;
        const c = this.burstColor || [1, 0.5, 0.15];
        const p = this.aimPoint() || this.pos;
        for (let i = 0; i < 28; i++) this.effects.spawn({ p: v3(p.x + (Math.random() - 0.5) * this.radius, p.y + (Math.random() - 0.5) * this.height * 0.5, p.z + (Math.random() - 0.5) * this.radius), v: v3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.6 + Math.random() * 0.7, s0: 0.08, s1: 0, color: c, drag: 2, grav: -1 });
        this.root.visible = false;
      }
      if (t > 1.2) this.removed = true;
      return;
    }
    if (this.deathStyle === 'fade') {
      const k = clamp(t / 1.2, 0, 1);
      this.root.scale.setScalar((this.baseScale || 1) * (1 - k * 0.6));
      this.pos.y += dt * 1.2;
      for (const m of this.mats) if (m.transparent) m.uniforms.uOpacity.value = (m.userData.op ?? 0.6) * (1 - k);
      if (Math.random() < 0.6) this.effects.spawn({ p: this.pos.clone().add(v3(0, this.height * 0.6, 0)), v: v3((Math.random() - 0.5), 1.5, (Math.random() - 0.5)), life: 0.8, s0: 0.1, s1: 0, color: this.burstColor || [0.7, 0.85, 1], drag: 1 });
      if (k >= 1) { this.root.visible = false; this.removed = true; }
      return;
    }
    // cai de lado e afunda no chão
    const k = clamp(t / 0.5, 0, 1);
    this.fallAngle = k * k * (Math.PI / 2) * (this.fallSide || 1);
    if (!this.flying) this.stickGround(dt, 10);
    else { this.pos.y = Math.max(this.ground(), this.pos.y - dt * 9); }
    if (t > 4) this.pos.y -= dt * 0.4;
    if (t > 6) { this.root.visible = false; this.removed = true; }
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.heading, 0);
    if (this.fallAngle) this.root.rotateZ(this.fallAngle);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }

  // hooks: build(), think(dt, env), animate(dt, env)
  think() {}
  animate() {}
}
