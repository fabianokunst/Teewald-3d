import * as THREE from 'three';

// Câmera em terceira pessoa com órbita, colisão e acompanhamento automático.
// Mirando, a câmera vai para o ombro direito e fica nivelada: a câmera normal olha
// de cima para o personagem e, sem isso, a mira apontava para o chão.
export const AIM_DROP = 0.3;            // quanto a câmera desce (rad) com a mira ligada
const DISTS = [2.8, 4.6, 6.8];          // direcional ▼: perto, normal, longe

export class ThirdPersonCamera {
  constructor(camera, ctx) {
    this.cam = camera;
    this.ctx = ctx;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = 4.6;
    this.curDist = 4.6;
    this.target = new THREE.Vector3();
    this.camPos = new THREE.Vector3();   // posição sem o tremor (mira assistida)
    this.idle = 0;
    this.v = new THREE.Vector3();
    this.aim = 0;            // 0..1: câmera de mira por cima do ombro
    this.aimWant = false;    // a arma liga enquanto mira
    this.kickP = 0; this.kickY = 0;      // coice: sobe e volta sozinho
    this.turnT = 0;          // analógico no máximo há quanto tempo (giro acelera)
    // mira assistida (controle e toque): a arma escreve antes do update de cada quadro
    this.lookScale = 1;      // atrito sobre o alvo (giro mais lento)
    this.assistYaw = 0; this.assistPitch = 0;
  }

  snap(player) {
    this.yaw = player.heading + Math.PI;
    this.target.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
    this.curDist = this.dist;
    this._place(1);
  }

  // coice do tiro (rad): a câmera sobe e volta em ~0,2 s
  kick(p, y = 0) { this.kickP += p; this.kickY += y; }

  update(dt, player, input, settings, moving) {
    this.aim += ((this.aimWant ? 1 : 0) - this.aim) * Math.min(1, dt * 10);
    // mirando: mais precisa (menos sensível) e com zoom
    const base = (settings.sensitivity || 5) / 5, fr = this.lookScale;
    const sens = base * (1 - 0.45 * this.aim) * fr;
    this.cam.fov = 58 - 12 * this.aim;
    const kd = Math.exp(-dt * 11);
    this.kickP *= kd; this.kickY *= kd;
    let looked = false;
    if (input) {
      const l = input.look();
      const inv = settings.invertY ? -1 : 1;
      if (l.mx || l.my) {
        this.yaw -= l.mx * 0.0032 * sens;
        this.pitch += l.my * 0.0026 * sens * inv;
        looked = true;
      }
      // analógico direito (já com zona morta e curva): segurado no máximo, fora da
      // mira, o giro acelera para dar meia-volta rápido
      if (l.px || l.py) {
        this.turnT = Math.abs(l.px) > 0.85 && this.aim < 0.2 ? this.turnT + dt : 0;
        const boost = 1 + 0.75 * Math.min(1, Math.max(0, (this.turnT - 0.15) / 0.3));
        const ps = base * (1 - 0.5 * this.aim) * fr;
        this.yaw -= l.px * dt * 3.2 * ps * boost;
        this.pitch += l.py * dt * 2.0 * ps * inv;
        looked = true;
      } else this.turnT = 0;
      const zd = input.zoom(dt);
      if (zd) this.dist = Math.max(2.2, Math.min(9, this.dist + zd));
      if (input.camDist()) this.dist = DISTS.find(v => v > this.dist + 0.2) ?? DISTS[0];
      if (input.down('KeyQ')) { this.yaw += dt * 2; looked = true; }
      if (input.down('KeyE')) { this.yaw -= dt * 2; looked = true; }
      // R3 / toque duplo: volta para trás do personagem
      if (input.recenter()) this.recentering = true;
      else if (looked) this.recentering = false;
    }
    // mira assistida: puxão para o alvo e acompanhamento (calculados pela arma)
    if (this.assistYaw || this.assistPitch) {
      this.yaw += this.assistYaw; this.pitch += this.assistPitch;
      this.assistYaw = this.assistPitch = 0;
    }
    this.lookScale = 1;
    if (this.recentering) {
      let d = player.heading + Math.PI - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const k = Math.min(1, dt * 9);
      this.yaw += d * k;
      this.pitch += (0.32 - this.pitch) * k;
      if (Math.abs(d) < 0.01 && Math.abs(0.32 - this.pitch) < 0.01) this.recentering = false;
    }
    // limites do ângulo que a câmera mostra (de -0,3 a 1,15; mirando, de -0,75 a 0,85)
    this.pitch = Math.max(-0.3 - (0.45 - AIM_DROP) * this.aim, Math.min(1.15 - (0.3 - AIM_DROP) * this.aim, this.pitch));
    this.idle = looked ? 0 : this.idle + dt;
    // volta para trás do personagem quando ele anda e o jogador não mexe na câmera
    if (moving && this.idle > 1.4 && this.aim < 0.1) {
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

  // chão para a câmera: o terreno ou a superfície da água (nadando, a câmera não afunda)
  _floor(x, z) {
    const g = this.ctx.terrain.heightAt(x, z), w = this.ctx.waterLevel?.(x, z);
    return w != null && w > g ? w : g;
  }

  _place(dt) {
    // mirando, a câmera desce para o nível do ombro sem mudar o ângulo guardado
    const pitch = this.pitch - AIM_DROP * this.aim - this.kickP, yaw = this.yaw + this.kickY;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = Math.sin(yaw) * cp, dy = sp, dz = Math.cos(yaw) * cp;
    // ao mirar, o centro da órbita vai para o ombro direito e a câmera se aproxima
    const a = this.aim, sh = 0.5 * a;
    let t = this.target;
    if (a > 0.001) {
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const hit = this.ctx.collision.raycast(t.x, t.y, t.z, rx, 0, rz, sh + 0.25);
      const k = hit < sh + 0.25 ? Math.max(0, hit - 0.25) / sh : 1;
      t = this.v.set(t.x + rx * sh * k, t.y + 0.14 * a, t.z + rz * sh * k);
    }
    let d = this.dist + (1.7 - this.dist) * a;
    const hit = this.ctx.collision.raycast(t.x, t.y, t.z, dx, dy, dz, d + 0.4);
    if (hit < d + 0.4) d = Math.max(0.6, hit - 0.4);
    // não entra no chão
    for (let k = 1; k <= 6; k++) {
      const s = (k / 6) * d;
      const g = this._floor(t.x + dx * s, t.z + dz * s);
      if (t.y + dy * s < g + 0.35) { d = Math.max(0.6, s - 0.3); break; }
    }
    this.curDist += (d - this.curDist) * Math.min(1, dt * (d < this.curDist ? 20 : 4));
    const cd = this.curDist;
    this.cam.position.set(t.x + dx * cd, t.y + dy * cd, t.z + dz * cd);
    const g = this._floor(this.cam.position.x, this.cam.position.z);
    if (this.cam.position.y < g + 0.35) this.cam.position.y = g + 0.35;
    this.cam.lookAt(t.x, t.y - 0.1, t.z);
    this.camPos.copy(this.cam.position);
  }
}
