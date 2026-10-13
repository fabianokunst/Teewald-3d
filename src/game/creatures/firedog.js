import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, ellipsoid, joint, mix3, lerp, clamp, wrapA, smooth } from './shapes.js';
import { SFX } from './sfx.js';

// Cão de Fogo (Höllenhund, dizem os velhos em hunsrik): cachorro magro e preto,
// com rachaduras em brasa pelo corpo, olhos amarelos e fogo saindo das costas.
// Vem em matilha: rodeia, um ou dois de cada vez agacham rosnando (o aviso) e dão
// o bote. Imune a fogo; morre se desfazendo em brasas. Os cães da bruxa.

const COAL = [0.09, 0.07, 0.07], EMBER = [1.0, 0.42, 0.08], ASH = [0.22, 0.18, 0.16];
// costas e lados escuros com veios em brasa, barriga cinza
const furCol = (t, a) => {
  const s = Math.sin(a), vein = Math.pow(Math.abs(Math.sin(t * 17 + a * 3)), 26);
  const base = s > 0.3 ? mix3(COAL, ASH, (s - 0.3) * 0.8) : COAL;
  return mix3(base, EMBER, vein * 0.85);
};

export class FireDog extends Creature {
  constructor(deps, o = {}) {
    super(deps, { name: 'CÃO DE FOGO', hp: o.hp ?? 3.2, radius: 0.42, height: 0.85, blood: [1, 0.5, 0.1], death: 'burst', resist: { fire: 0, light: 0.4, explosion: 1.4, dart: 0.5 }, ...o });
    this.burstColor = [1, 0.55, 0.15];
    this.bloodGrav = 2;
    this.immuneColor = [1, 0.6, 0.2];
    this.scale = o.scale ?? (0.92 + Math.random() * 0.16);
    this.build();
    this.root.scale.setScalar(this.scale);
    this.P = { run: 0, crouch: 0, mouth: 0, headX: 0, leap: 0, phase: Math.random() };
    this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.state = o.state || 'prowl';
    this.nextSound = 1 + Math.random() * 2;
    this.fireT = 0;
  }

  build() {
    const fur = this.mat({ emissive: 0x0a0200 });
    const eye = this.mat({ map: null, color: 0xffd040, lit: false, fog: false });
    const glow = this.mat({ map: null, color: 0xff7a20, lit: false });
    const B = this.bones = {};
    B.body = joint(this.root, 0, 0.58, 0);
    // tronco: peito fundo, cintura fina
    const torso = blob([[-0.42, 0], [-0.38, 0.12], [-0.2, 0.16], [0.05, 0.19], [0.25, 0.21], [0.38, 0.17], [0.45, 0]], 7, { sz: 0.85, col: furCol, vRep: 2 });
    torso.rotateX(Math.PI / 2);
    B.body.add(this.mesh(torso, fur));
    // costelas em brasa (risco nas laterais)
    for (const s of [-1, 1]) {
      const r = this.mesh(blob([[-0.12, 0], [-0.1, 0.012], [0.1, 0.012], [0.12, 0]], 3), glow);
      r.position.set(s * 0.155, 0.02, 0.15); r.rotation.set(Math.PI / 2, 0, s * 0.3);
      B.body.add(r);
    }
    // pescoço e cabeça
    B.neck = joint(B.body, 0, 0.08, 0.38);
    const neck = blob([[0, 0.09], [0.12, 0.075], [0.22, 0.065]], 6, { sz: 0.9, col: furCol });
    neck.rotateX(0.9);
    B.neck.add(this.mesh(neck, fur));
    B.head = joint(B.neck, 0, 0.16, 0.12);
    const skull = ellipsoid(0.24, 0.1, 0.1, 7, furCol);
    B.head.add(this.mesh(skull, fur));
    const snout = blob([[0, 0.065], [0.1, 0.055], [0.19, 0.035], [0.21, 0]], 6, { sz: 0.75, col: (t) => mix3(COAL, [0.05, 0.04, 0.04], t) });
    snout.rotateX(Math.PI / 2); snout.translate(0, -0.02, 0.08);
    B.head.add(this.mesh(snout, fur));
    B.jaw = joint(B.head, 0, -0.05, 0.08);
    const jaw = blob([[0, 0.04], [0.1, 0.035], [0.17, 0]], 5, { sz: 0.5, col: (t, a) => (Math.sin(a) > 0.2 ? [0.7, 0.2, 0.05] : COAL) });
    jaw.rotateX(Math.PI / 2);
    B.jaw.add(this.mesh(jaw, fur));
    for (const s of [-1, 1]) {
      // orelhas pontudas para trás
      const ear = this.mesh(cone(0.12, 0.035, COAL, EMBER, 4, 0.4), fur);
      ear.position.set(s * 0.06, 0.07, -0.04); ear.rotation.set(-0.7, 0, s * 0.35);
      B.head.add(ear);
      // olhos
      const e = this.mesh(blob([[-0.02, 0], [0, 0.018], [0.02, 0]], 4), eye);
      e.position.set(s * 0.055, 0.025, 0.1); e.rotation.set(0, s * 0.5, Math.PI / 2);
      B.head.add(e);
      // presas
      const f = this.mesh(cone(0.04, 0.008, [1, 0.95, 0.85], [1, 1, 1], 3), fur);
      f.rotation.x = Math.PI; f.position.set(s * 0.025, -0.06, 0.24);
      B.head.add(f);
    }
    // pernas: [x, z, dianteira?]
    B.legs = [];
    for (const [x, z, front] of [[0.11, 0.3, 1], [-0.11, 0.3, 1], [0.11, -0.3, 0], [-0.11, -0.3, 0]]) {
      const hip = joint(B.body, x, -0.05, z);
      hip.add(this.mesh(limb(0.26, 0.07, 0.04, 5, furCol), fur));
      const knee = joint(hip, 0, -0.26, 0);
      knee.add(this.mesh(limb(0.25, 0.04, 0.03, 5, furCol), fur));
      const paw = this.mesh(blob([[-0.02, 0], [-0.01, 0.035], [0.03, 0.03], [0.05, 0]], 5, { col: () => COAL }), fur);
      paw.position.set(0, -0.25, 0.02); paw.rotation.x = Math.PI / 2;
      knee.add(paw);
      B.legs.push({ hip, knee, front, side: x > 0 ? 1 : -1 });
    }
    // rabo
    B.tail = joint(B.body, 0, 0.06, -0.4);
    B.tail.add(this.mesh(limb(0.32, 0.04, 0.015, 4, furCol), fur));
    this.spheres = [
      { bone: B.head, off: new THREE.Vector3(0, 0, 0.06), r: 0.13, part: 'head' },
      { bone: B.body, off: new THREE.Vector3(0, 0, 0.18), r: 0.21, part: 'body' },
      { bone: B.body, off: new THREE.Vector3(0, 0, -0.18), r: 0.2, part: 'body' },
    ];
  }

  // ---------- IA ----------
  think(dt, env) {
    const { d, ang } = this.toPlayer(env), A = this.audio;
    const C = env.combat;
    let want = null, speed = 0;
    this.nextSound -= dt;
    if (this.nextSound <= 0) { this.nextSound = 2 + Math.random() * 3; if (Math.random() < 0.6) SFX.growl(A, d, 1.1 / this.scale); else SFX.bark(A, d, 1 / this.scale); }
    switch (this.state) {
      case 'howl': {
        // aparece uivando (ou saindo do chão em brasa)
        this.face(dt, ang);
        if (this.st > 1.1) this.state = 'chase', this.st = 0;
        break;
      }
      case 'prowl': {
        // longe: vem trotando; perto: rodeia
        if (!env.playerAlive) { this.state = 'idle'; break; }
        if (d > 9) { want = ang; speed = 5.5; }
        else {
          const a = Math.atan2(this.pos.x - env.player.pos.x, this.pos.z - env.player.pos.z) + this.orbit * 0.6;
          const r = 5.5;
          const tx = env.player.pos.x + Math.sin(a) * r, tz = env.player.pos.z + Math.cos(a) * r;
          want = Math.atan2(tx - this.pos.x, tz - this.pos.z); speed = 4.2;
          // bote: no máximo dois cães atacando ao mesmo tempo
          if (this.st > 1.2 + Math.random() * 0.8 && this._attackers(C) < 2) { this.state = 'chase'; this.st = 0; }
        }
        if (this.stuck) this.orbit *= -1;
        break;
      }
      case 'chase': {
        if (!env.playerAlive) { this.state = 'idle'; break; }
        want = ang; speed = 7.6;
        if (d < 3.2) { this.state = 'windup'; this.st = 0; SFX.snarl(A, d, 1.1); }
        else if (this.st > 3.5) { this.state = 'prowl'; this.st = 0; }
        break;
      }
      case 'windup': {
        this.face(dt, ang, 10);
        if (this.st > 0.42) {
          // bote no ponto previsto
          const pv = env.playerVel;
          const tx = env.player.pos.x + pv.x * 0.25, tz = env.player.pos.z + pv.z * 0.25;
          let lx = tx - this.pos.x, lz = tz - this.pos.z;
          const L = Math.hypot(lx, lz) || 1, reach = Math.min(L + 0.8, 4.5);
          this.leap = { vx: lx / L * reach / 0.5, vz: lz / L * reach / 0.5, vy: 4.2, done: false };
          this.heading = Math.atan2(lx, lz);
          this.state = 'leap'; this.st = 0;
          SFX.bark(A, d, 0.9);
        }
        break;
      }
      case 'leap': {
        const Lp = this.leap;
        Lp.vy -= 16 * dt;
        this.step(dt, Lp.vx, Lp.vz, true);
        this.pos.y += Lp.vy * dt;
        if (!Lp.done && d < 0.95 + this.radius) { Lp.done = true; if (this.strike(env, 14, 1.6, -0.2, 4)) SFX.snarl(A, 0, 1.2); }
        const g = this.ground();
        if (this.pos.y <= g && Lp.vy < 0) { this.pos.y = g; this.state = 'recover'; this.st = 0; }
        return this._fire(dt, env);
      }
      case 'recover': {
        if (this.st > 0.5) { this.state = 'retreat'; this.st = 0; }
        break;
      }
      case 'retreat': {
        want = ang + Math.PI + this.orbit * 0.6; speed = 6;
        if (this.stuck) this.orbit *= -1;
        if (this.st > 0.9) { this.state = 'prowl'; this.st = 0; }
        break;
      }
      case 'hurt': {
        if (this.st > 0.35) { this.state = Math.random() < 0.5 ? 'retreat' : 'prowl'; this.st = 0; }
        break;
      }
      case 'idle': {
        if (env.playerAlive) { this.state = 'prowl'; this.st = 0; }
        break;
      }
    }
    if (want !== null && speed > 0) {
      this.heading += wrapA(want - this.heading) * Math.min(1, dt * 7);
      const sp = speed * clamp(Math.cos(wrapA(want - this.heading)), 0.3, 1);
      this.step(dt, Math.sin(this.heading) * sp, Math.cos(this.heading) * sp, true);
    } else this.speed = lerp(this.speed, 0, Math.min(1, dt * 10));
    this.stickGround(dt);
    this._fire(dt, env);
  }

  _attackers(C) {
    let n = 0;
    for (const e of C.enemies) if (e !== this && e instanceof FireDog && !e.dead && (e.state === 'chase' || e.state === 'windup' || e.state === 'leap')) n++;
    return n;
  }

  // chamas nas costas e luz alaranjada
  _fire(dt, env) {
    this.fireT -= dt;
    const body = this.bones.body;
    if (this.fireT <= 0) {
      this.fireT = 0.03;
      this.root.updateMatrixWorld(true);
      const p = body.localToWorld(this._t.set((Math.random() - 0.5) * 0.15, 0.16, (Math.random() - 0.5) * 0.6));
      const hot = Math.random();
      this.effects.spawn({ p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), life: 0.4 + Math.random() * 0.3, s0: 0.12 * this.scale, s1: 0, color: hot > 0.5 ? [1, 0.75, 0.25] : [1, 0.38, 0.08], drag: 1.5 });
    }
    if (Math.random() < dt * 0.5) SFX.fire(this.audio, this.toPlayer(env).d);
    this.atmo?.light(this.pos.x, this.pos.y + 0.8, this.pos.z, [1.1, 0.45, 0.12], 5.5, 2);
  }

  onHurt(dmg, info) {
    SFX.yelp(this.audio, 5, 1.1 / this.scale);
    if (this.state !== 'leap') { this.state = 'hurt'; this.st = 0; }
  }

  onDeath() { SFX.yelp(this.audio, 3, 0.8); }

  // ---------- animação ----------
  animate(dt) {
    const P = this.P, B = this.bones, s = this.state;
    const run = clamp(this.speed / 6, 0, 1);
    P.run = lerp(P.run, run, Math.min(1, dt * 8));
    P.phase = (P.phase + dt * (1.2 + this.speed * 0.45)) % 1;
    const ph = P.phase * Math.PI * 2;
    let crouch = 0, mouth = 0.15 + Math.max(0, Math.sin(this.st * 2)) * 0.2, headX = 0, leap = 0;
    if (s === 'windup') { crouch = 1; mouth = 1; headX = 0.25; }
    else if (s === 'leap') { leap = 1; mouth = 1; headX = -0.2; }
    else if (s === 'howl') { headX = -0.9; mouth = 0.8; crouch = 0.3; }
    else if (s === 'hurt') { headX = -0.4; mouth = 0.7; }
    else if (s === 'chase') mouth = 0.5;
    const k = Math.min(1, dt * 12);
    P.crouch = lerp(P.crouch, crouch, k); P.mouth = lerp(P.mouth, mouth, k); P.headX = lerp(P.headX, headX, k); P.leap = lerp(P.leap, leap, k);
    // galope: patas da frente e de trás em oposição
    for (const L of B.legs) {
      const off = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : 0.5);
      const sw = Math.sin(ph + off) * (0.25 + 0.55 * P.run) * (1 - P.leap);
      L.hip.rotation.x = sw + (L.front ? -0.25 : 0.35) * P.leap - (L.front ? 0.15 : -0.1) * P.crouch;
      L.knee.rotation.x = (L.front ? 0.1 : -0.25) + Math.max(0, -Math.sin(ph + off)) * 0.7 * P.run * (L.front ? 1 : -1) + (L.front ? 0.8 : -0.8) * P.crouch * 0.6;
    }
    const bob = Math.abs(Math.sin(ph)) * 0.05 * P.run;
    B.body.position.y = 0.58 - 0.17 * P.crouch + bob;
    B.body.rotation.x = -0.12 * P.crouch + Math.sin(ph) * 0.05 * P.run - 0.2 * P.leap;
    B.neck.rotation.x = -0.1 + P.headX * 0.5 + 0.2 * P.run;
    B.head.rotation.x = P.headX * 0.6 - 0.15 * P.run;
    B.jaw.rotation.x = P.mouth * 0.55;
    B.tail.rotation.x = 1.45 + 0.45 * P.run + Math.sin(ph * 2) * 0.15;
    B.tail.rotation.z = Math.sin(this.st * 3) * 0.3;
  }
}
