import * as THREE from 'three';
import { Chupacabra, ChupaAudio, makeSheep } from './chupacabra.js';
import { G } from '../engine/ps1material.js';

// A presença: nas noites antes da captura (capítulos 2 a 8), de vez em quando o
// chupacabras aparece na beira da neblina, agachado sobre uma ovelha morta. Não é
// luta: o barulho de mastigar chega antes da imagem. Quando o jogador chega perto,
// mira nele ou fica olhando muito tempo, ele levanta a cabeça, guincha e foge aos
// pulos, deixando um rastro de sangue. A ovelha fica lá.

const FIRST = [70, 130];          // primeira aparição no capítulo (s)
const EVERY = [170, 280];         // intervalo entre aparições (s)

export class Presence {
  // o: { ctx, scene, effects, audio, player, camera, combat, campaign, atmo, pistol }
  constructor(o) {
    Object.assign(this, o);
    this.c = new Chupacabra({ ctx: o.ctx, scene: o.scene, effects: o.effects, audio: o.audio, player: o.player });
    this.sheep = makeSheep();
    this.sheep.visible = false;
    o.scene.add(this.sheep);
    this.chapter = 0;
    this.t = 0; this.next = 0; this.live = null;
    this._v = new THREE.Vector3();
  }

  // capítulos em que ele ronda a cidade (no covil ele é capturado; na última noite está amarrado)
  get allowed() {
    const C = this.campaign, k = C.S?.def.key;
    return C.index >= 2 && !!C.S && !C.S.done && k !== 'covil' && k !== 'bruxa';
  }

  reset() {
    this.c.hide(); this.c.clearBlood();
    this.sheep.visible = false;
    this.live = null;
    this.next = FIRST[0] + Math.random() * (FIRST[1] - FIRST[0]);
  }

  _quiet() {
    const C = this.campaign, cb = this.combat;
    return !this.ctx.indoor && !cb.inFight && !(cb.boss && !cb.boss.dead) && !C.S?.cut && !C.S?.narr && cb.alive() === 0;
  }

  // lugar na beira da neblina, mais ou menos na frente da câmera, em chão firme e livre
  _spot() {
    const ctx = this.ctx, P = this.player.pos, cam = this.camera.getWorldDirection(this._v);
    const yaw = Math.atan2(cam.x, cam.z);
    const fog = G.uFogFar.value;
    const d0 = Math.max(22, Math.min(34, fog * 0.55));
    for (let k = 0; k < 40; k++) {
      const a = yaw + (Math.random() - 0.5) * 1.6, d = d0 + Math.random() * 6;
      const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      const b = ctx.playBounds;
      if (x < b.x0 + 10 || x > b.x1 - 10 || z < b.z0 + 10 || z > b.z1 - 10) continue;
      if (ctx.zones.insideBuilding(x, z, 2)) continue;
      const y = ctx.groundAt(x, z, 1000);
      if (ctx.waterDepth(x, z, y) > 0 || Math.abs(y - P.y) > 6) continue;
      if (ctx.roads.index.clearance(x, z).d < 1.5) continue;
      let ok = true;
      for (const it of ctx.collision.near(x, z, 2)) {
        if (it.walk) continue;
        if (it.t === 'circle' ? Math.hypot(x - it.x, z - it.z) < it.r + 1.2 : Math.abs((x - it.x) * it.c - (z - it.z) * it.s) < it.hx + 1.2 && Math.abs((x - it.x) * it.s + (z - it.z) * it.c) < it.hz + 1.2) { ok = false; break; }
      }
      if (ok) return { x, z, y };
    }
    return null;
  }

  _show() {
    const s = this._spot();
    if (!s) return false;
    const P = this.player.pos;
    const away = Math.atan2(s.x - P.x, s.z - P.z);
    // de costas meio de lado para o jogador, comendo
    this.c.spawnFeeding(s.x, s.z, away + (Math.random() < 0.5 ? 0.9 : -0.9));
    this.sheep.position.set(s.x + Math.sin(this.c.heading) * 0.55, s.y - 0.06, s.z + Math.cos(this.c.heading) * 0.55);
    this.sheep.rotation.y = this.c.heading + Math.PI / 2;
    this.sheep.visible = true;
    this.live = { t: 0, seen: 0, x: s.x, z: s.z, fled: false };
    return true;
  }

  update(dt) {
    const n = this.campaign.index;
    if (n !== this.chapter || (this.campaign.S && this.campaign.S !== this.S)) { this.chapter = n; this.S = this.campaign.S; this.reset(); }
    const L = this.live;
    if (!L) {
      if (!this.allowed) return;
      if (!this._quiet()) { this.next = Math.max(this.next, 15); return; }
      this.next -= dt;
      if (this.next <= 0) { if (!this._show()) this.next = 20; }
      return;
    }
    const P = this.player.pos, c = this.c;
    L.t += dt;
    const d = Math.hypot(P.x - c.pos.x, P.z - c.pos.z);
    // olhando para ele (perto do meio da tela)?
    const v = this.camera.getWorldDirection(this._v), dx = c.pos.x - this.camera.position.x, dz = c.pos.z - this.camera.position.z, l = Math.hypot(dx, dz) || 1;
    const look = (v.x * dx + v.z * dz) / (l * (Math.hypot(v.x, v.z) || 1));
    if (look > 0.97) L.seen += dt;
    const aimed = this.pistol?.aiming && look > 0.95;
    const shot = (this.pistol?.recoil ?? 0) > 0.5;
    if (c.state === 'feed' && (d < 19 || L.seen > 1.8 || aimed || shot || L.t > 16 || !this._quiet() || this.ctx.indoor)) {
      // levanta a cabeça e encara
      c._set('alert');
      ChupaAudio.screech(this.audio, d, 0.8);
      L.alertT = 0;
    }
    if (c.state === 'alert') {
      L.alertT += dt;
      if (L.alertT > (d < 12 ? 0.35 : 1.1)) { c._set('flee'); c.fleeDir = Math.atan2(c.pos.x - P.x, c.pos.z - P.z); ChupaAudio.hiss(this.audio, d); }
    }
    c.update(dt, { player: this.player, playerVel: { x: 0, z: 0 }, arena: { x: L.x, z: L.z }, playerAlive: true, onHitPlayer: () => {} });
    if (c.gone || c.state === 'off') {
      this.live = null;
      this.next = EVERY[0] + Math.random() * (EVERY[1] - EVERY[0]);
    }
  }
}
