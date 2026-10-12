import * as THREE from 'three';

// Câmera em terceira pessoa com órbita, colisão e acompanhamento automático
export class ThirdPersonCamera {
  constructor(camera, ctx) {
    this.cam = camera;
    this.ctx = ctx;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = 4.6;
    this.curDist = 4.6;
    this.target = new THREE.Vector3();
    this.idle = 0;
    this.v = new THREE.Vector3();
  }

  snap(player) {
    this.yaw = player.heading + Math.PI;
    this.target.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
    this.curDist = this.dist;
    this._place(1);
  }

  update(dt, player, input, settings, moving) {
    const sens = (settings.sensitivity || 5) / 5;
    let looked = false;
    if (input) {
      const l = input.look();
      const inv = settings.invertY ? -1 : 1;
      if (l.mx || l.my) {
        this.yaw -= l.mx * 0.0032 * sens;
        this.pitch += l.my * 0.0026 * sens * inv;
        looked = true;
      }
      if (l.px || l.py) {
        this.yaw -= l.px * dt * 2.6 * sens;
        this.pitch += l.py * dt * 1.8 * sens * inv;
        looked = true;
      }
      const zd = input.zoom(dt);
      if (zd) this.dist = Math.max(2.2, Math.min(9, this.dist + zd));
      if (input.down('KeyQ')) { this.yaw += dt * 2; looked = true; }
      if (input.down('KeyE')) { this.yaw -= dt * 2; looked = true; }
      // R3 / toque duplo: volta para trás do personagem
      if (input.recenter()) this.recentering = true;
      else if (looked) this.recentering = false;
    }
    if (this.recentering) {
      let d = player.heading + Math.PI - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const k = Math.min(1, dt * 9);
      this.yaw += d * k;
      this.pitch += (0.32 - this.pitch) * k;
      if (Math.abs(d) < 0.01 && Math.abs(0.32 - this.pitch) < 0.01) this.recentering = false;
    }
    this.pitch = Math.max(-0.3, Math.min(1.15, this.pitch));
    this.idle = looked ? 0 : this.idle + dt;
    // volta para trás do personagem quando ele anda e o jogador não mexe na câmera
    if (moving && this.idle > 1.4) {
      let want = player.heading + Math.PI, d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 0.9);
    }
    const tx = player.pos.x, ty = player.pos.y + 1.5, tz = player.pos.z;
    this.target.x += (tx - this.target.x) * Math.min(1, dt * 14);
    this.target.y += (ty - this.target.y) * Math.min(1, dt * 8);
    this.target.z += (tz - this.target.z) * Math.min(1, dt * 14);
    this._place(dt);
  }

  _place(dt) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dy = sp, dz = Math.cos(this.yaw) * cp;
    const t = this.target;
    let d = this.dist;
    const hit = this.ctx.collision.raycast(t.x, t.y, t.z, dx, dy, dz, d + 0.4);
    if (hit < d + 0.4) d = Math.max(0.6, hit - 0.4);
    // não entra no chão
    for (let k = 1; k <= 6; k++) {
      const s = (k / 6) * d;
      const g = this.ctx.terrain.heightAt(t.x + dx * s, t.z + dz * s);
      if (t.y + dy * s < g + 0.35) { d = Math.max(0.6, s - 0.3); break; }
    }
    this.curDist += (d - this.curDist) * Math.min(1, dt * (d < this.curDist ? 20 : 4));
    const cd = this.curDist;
    this.cam.position.set(t.x + dx * cd, t.y + dy * cd, t.z + dz * cd);
    const g = this.ctx.terrain.heightAt(this.cam.position.x, this.cam.position.z);
    if (this.cam.position.y < g + 0.35) this.cam.position.y = g + 0.35;
    this.cam.lookAt(t.x, t.y - 0.1, t.z);
  }
}
