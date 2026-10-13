import * as THREE from 'three';
import { Chupacabra, CHUPA_HP, ChupaAudio } from '../chupacabra.js';

// O chupacabras na gruta, para ser capturado vivo (capítulo 9). Usa o mesmo bicho da
// missão 1, com a luta dele; aqui ele não foge: com pouca vida fica cansado (ofegante,
// mais lento) e só então os dardos fazem efeito. Dois dardos e ele dorme.

export class ChupaCapture {
  // deps: { ctx, scene, effects, audio, player, atmo }; o: { arena: {x, z, r} }
  constructor(deps, o = {}) {
    Object.assign(this, deps);
    this.c = new Chupacabra({ ctx: deps.ctx, scene: deps.scene, effects: deps.effects, audio: deps.audio, player: deps.player });
    this.arena = o.arena || null;
    this.name = 'CHUPACABRAS'; this.bossName = 'O CHUPACABRAS';
    this.radius = 0.42; this.height = 1.25; this.maxHp = CHUPA_HP;
    this.tired = false; this.darts = 0; this.asleep = false; this.removed = false;
    this.root = this.c.root;
    this.t = 0;
  }

  get pos() { return this.c.pos; }
  get hp() { return this.c.hp; }
  set hp(v) { this.c.hp = v; }
  // dormindo conta como "vencido" para as ondas e a barra do chefe
  get dead() { return this.asleep; }
  get untargetable() { return this.asleep; }

  place(x, z, h = 0) {
    this.c.spawnFight(x, z, h);
    this.c.hp = CHUPA_HP;
    if (!this.arena) this.arena = { x, z, r: 12 };
    return this;
  }

  raycast(o, d, maxD) {
    if (this.asleep) return null;
    const h = this.c.raycast(o, d, maxD);
    if (h) h.target.owner = this;
    return h;
  }

  aimPoint() { return this.asleep ? null : this.c.aimPoint(); }

  hit(T, dir, p, from, w) { this.damage(w?.dmg ?? 1, { kind: w?.kind || 'bullet', dir, p, from, part: T.part }); }

  damage(amount, info = {}) {
    if (this.asleep) return false;
    const c = this.c, kind = info.kind || 'bullet';
    if (kind === 'light') return false;
    if (kind === 'dart') {
      if (!this.tired) { this.onDartWasted?.(); ChupaAudio.hiss(this.audio, 5); return false; }
      this.darts++;
      ChupaAudio.hurt(this.audio, 5);
      c.knock = null;
      if (this.darts >= 2) this.sleep(); else this.onDart?.(this.darts);
      return true;
    }
    const mult = info.part === 'head' ? 2 : 1;
    let dmg = amount;
    if (c.hp - dmg * mult < 1) { dmg = Math.max(0.0001, (c.hp - 1) / mult); if (!this.tired) { this.tired = true; this.onTired?.(); } }
    const p = info.p || c.aimPoint() || c.pos;
    c.hit({ owner: c, part: info.part || 'body' }, info.dir || new THREE.Vector3(0, 0, 1), p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z), info.from, { dmg, kind });
    if (c.hp < 1) c.hp = 1;
    return true;
  }

  sleep() {
    this.asleep = true;
    const c = this.c;
    c.state = 'sleep'; c.st = 0;
    ChupaAudio.growl(this.audio, 3);
    this.onSleep?.();
  }

  update(dt, env) {
    const c = this.c;
    this.t += dt;
    if (this.asleep) {
      // deitado de lado, respirando devagar
      c.root.rotation.z += (1.45 - c.root.rotation.z) * Math.min(1, dt * 3);
      c.root.position.y += (c.pos.y + 0.12 - c.root.position.y) * Math.min(1, dt * 3);
      c.root.scale.y = 1 + Math.sin(this.t * 1.6) * 0.03;
      return;
    }
    // cansado: mais lento e ofegante (espera mais entre os botes)
    if (this.tired && (c.state === 'stalk' || c.state === 'charge')) {
      if (Math.random() < dt * 0.6) { c._set('wait'); ChupaAudio.hiss(this.audio, 6); }
    }
    c.update(dt * (this.tired ? 0.7 : 1), {
      player: env.player, playerVel: env.playerVel, arena: this.arena, playerAlive: env.playerAlive,
      onHitPlayer: (d, x, z) => { if (env.combat.hurt(d * (this.tired ? 0.6 : 1), x, z)) ChupaAudio.claw(this.audio); },
    });
    // nunca foge da gruta
    if (c.state === 'flee' || c.state === 'gone') { c.state = 'wait'; c.active = true; c.root.visible = true; }
  }

  dispose() { this.c.hide(); this.scene.remove(this.c.root); }
}
