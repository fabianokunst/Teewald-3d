import * as THREE from 'three';
import { PLAY_BOUNDS } from '../config.js';
import { roadSurfaceAt } from '../world/roads.js';
import { pointInPoly } from '../world/geo.js';

// Controle do protagonista: andar/correr relativo à câmera, pulo, gravidade e colisão
export class Player {
  constructor(ctx, character, audio) {
    this.ctx = ctx;
    this.ch = character;
    this.audio = audio;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.grounded = true;
    this.speed = 0;
    this.radius = 0.32;
    this.auto = null; // caminhada automática (abertura)
    character.onStep = run => this.audio.step(this.surface(), run);
  }

  place(x, z, heading) {
    this.pos.set(x, this.ctx.groundAt(x, z, 1000), z);
    this.heading = heading;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.sync();
  }

  surface() {
    const { x, z } = this.pos;
    if (roadSurfaceAt(this.ctx.roads, this.ctx.terrain, x, z) !== null) return 'stone';
    for (const f of this.ctx.floors) if (pointInPoly(x, z, f.poly)) return 'stone';
    if (this.ctx.landmarks && this.ctx.zones.placeAt(x, z) === 'CALÇADÃO DO RIO CADEIA') return 'stone';
    if (this.ctx.zones.isForest(x, z)) return 'leaves';
    return 'grass';
  }

  update(dt, camYaw, input) {
    let ix = 0, iy = 0, run = false;
    if (this.auto) {
      // segue a trilha da abertura
      const t = this.auto;
      const target = t.path[Math.min(t.i, t.path.length - 1)];
      const dx = target[0] - this.pos.x, dz = target[1] - this.pos.z;
      if (Math.hypot(dx, dz) < 1.2 && t.i < t.path.length - 1) t.i++;
      const want = Math.atan2(dx, dz);
      // converte para eixo relativo à câmera
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const wx = Math.sin(want), wz = Math.cos(want);
      iy = wx * fx + wz * fz; ix = wx * rx + wz * rz;
      const m = Math.hypot(ix, iy) || 1; ix /= m; iy /= m;
    } else if (input) {
      const mv = input.move(); ix = mv.x; iy = mv.y; run = input.running();
    }
    const mag = Math.min(1, Math.hypot(ix, iy));
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = (fx * iy + rx * ix), dz = (fz * iy + rz * ix);
    const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    // analógico: pouco inclinado anda devagar; tecla SHIFT / botão B corre
    const target = mag > 0.05 ? (run ? 7.2 : 1.75) * mag : 0;
    const accel = target > this.speed ? (run ? 10 : 7) : 10;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);
    if (mag > 0.05) {
      const want = Math.atan2(dx, dz);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * (run ? 9 : 7));
    }
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    // move na direção em que o personagem olha (curvas suaves), em passos curtos
    // para não atravessar muros finos quando o quadro demora (até 0,1 s)
    const dist = this.speed * dt, n = Math.max(1, Math.ceil(dist / 0.12));
    let gPrev = this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y);
    for (let i = 0; i < n; i++) {
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += hx * dist / n;
      this.pos.z += hz * dist / n;
      this.ctx.collision.resolve(this.pos, this.radius, 1.7);
      const g = this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y);
      // degrau alto demais (borda de piso elevado, muro de arrimo): não sobe sem pular.
      // Medido em passos de 12 cm, então ladeiras íngremes do terreno continuam subíveis.
      if (g > Math.max(gPrev, this.pos.y) + 0.5) { this.pos.x = ox; this.pos.z = oz; break; }
      // não entra no rio fundo (exceto pontes)
      if (this.ctx.isDeepWater(this.pos.x, this.pos.z, g)) {
        this.pos.x = ox; this.pos.z = oz; this.speed *= 0.5;
        break;
      }
      gPrev = g;
    }
    const b = PLAY_BOUNDS;
    this.pos.x = Math.max(b.x0, Math.min(b.x1, this.pos.x));
    this.pos.z = Math.max(b.z0, Math.min(b.z1, this.pos.z));

    // gravidade e chão
    const ground = this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (input && !this.auto && this.grounded && input.jump()) { this.vel.y = 4.6; this.grounded = false; }
    if (this.grounded) {
      if (ground < this.pos.y - 0.45) { this.grounded = false; this.vel.y = 0; }
      else this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 18);
    }
    if (!this.grounded) {
      this.vel.y -= 13 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vel.y = 0; this.grounded = true; }
    }
    this.ch.update(dt, this.speed, this.grounded, run);
    this.sync(ground);
    return { moving: mag > 0.05 };
  }

  sync(ground = this.pos.y) {
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.heading;
    this.ch.blob.position.set(this.pos.x, ground + 0.03, this.pos.z);
    const k = Math.max(0.3, 1 - (this.pos.y - ground) * 0.4);
    this.ch.blob.scale.setScalar(k);
  }
}
