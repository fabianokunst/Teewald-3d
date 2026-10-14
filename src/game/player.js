import * as THREE from 'three';
import { PLAY_BOUNDS } from '../config.js';
import { roadSurfaceAt } from '../world/roads.js';
import { pointInPoly } from '../world/geo.js';

// água: até a cintura anda (mais devagar quanto mais funda); mais funda, nada.
// Nadando, a raiz (os pés em pé) fica SWIM_Y abaixo da superfície
const SWIM_IN = 1.05, SWIM_OUT = 0.9, SWIM_Y = 1.0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
    this.aimYaw = null; // direção da mira (a arma define enquanto mira)
    this.moveScale = 1;   // golpes e esquiva deixam o passo mais curto
    this.lockHeading = false;   // durante um golpe o corpo não vira com o analógico
    this.noJump = false;
    this.stepT = 0;       // tempo que ainda sobe/desce suave depois de um degrau
    this.swimming = false; // na água funda: nada (sem pulo, sem armas, sem esquiva)
    this.wade = 0;        // 0..1: o quanto a água segura as pernas
    this.waterY = null;   // superfície da água sobre o jogador (null = seco)
    this.rippleT = 0;
    this.effects = null;  // main.js liga (respingos e marolas)
    character.onStep = run => this._footstep(run);
    character.onStroke = k => this._stroke(k);
  }

  place(x, z, heading) {
    this.pos.set(x, this.ctx.groundAt(x, z, 1000), z);
    this.heading = heading;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.swimming = false; this.wade = 0; this.waterY = null;
    this.sync();
  }

  surface() {
    const { x, z } = this.pos;
    if (roadSurfaceAt(this.ctx.roads, this.ctx.terrain, x, z) !== null) return 'stone';
    for (const f of this.ctx.floors) if (pointInPoly(x, z, f.poly)) return f.surface || 'stone';
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
    // mirando (aimYaw definido pela arma): sem correr, vira para a mira e anda devagar em qualquer direção
    const swim = this.swimming;
    const aiming = this.aimYaw != null && !this.auto && !swim;
    if (aiming) run = false;
    // analógico: pouco inclinado anda devagar; tecla SHIFT / botão B corre.
    // Na água rasa as pernas vão contra a água (correr perde mais); nadando, nado de peito
    // (correr = braçadas mais rápidas), arrancando e parando devagar
    const slow = 1 - (run ? 0.6 : 0.35) * this.wade;
    const target = mag > 0.05 ? (swim ? (run ? 2.3 : 1.35) : (run ? 7.2 : aiming ? 1.3 : 1.75) * slow) * mag * this.moveScale : 0;
    const accel = swim ? (target > this.speed ? 2.6 : 1.8) : target > this.speed ? (run ? 10 : 7) * (1 - 0.4 * this.wade) : 10;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);
    if ((aiming || mag > 0.05) && !this.lockHeading) {
      const want = aiming ? this.aimYaw : Math.atan2(dx, dz);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * (aiming ? 16 : swim ? 3.5 : run ? 9 : 7));
    }
    let hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    if (aiming) {
      if (mag > 0.05) this.strafe = [dx, dz];
      if (this.strafe) [hx, hz] = this.strafe;
    } else this.strafe = null;
    // direção do passo no espaço do personagem: mirando, anda de lado e de costas
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading), step = this._step ||= {};
    step.mx = hx * ch - hz * sh; step.mz = hx * sh + hz * ch;
    // move na direção em que o personagem olha (curvas suaves), em passos curtos
    // para não atravessar muros finos quando o quadro demora (até 0,1 s)
    const dist = this.speed * dt, n = Math.max(1, Math.ceil(dist / 0.12));
    let gPrev = this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y);
    // maior desnível entre dois passos de 12 cm (degrau, meio-fio, borda de piso), ou
    // entre os pés e o chão (ainda subindo o degrau anterior, esquiva, empurrão)
    let edge = this.grounded && !swim ? Math.abs(gPrev - this.pos.y) : 0;
    for (let i = 0; i < n; i++) {
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += hx * dist / n;
      this.pos.z += hz * dist / n;
      this.ctx.collision.resolve(this.pos, this.radius, 1.7);
      const g = this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y);
      // degrau alto demais (borda de piso elevado, muro de arrimo): não sobe sem pular.
      // Medido em passos de 12 cm, então ladeiras íngremes do terreno continuam subíveis.
      // Nadando, sai por qualquer margem que não passe muito da superfície
      if (swim ? g > this.pos.y + SWIM_Y + 0.35 : g > Math.max(gPrev, this.pos.y) + 0.5) { this.pos.x = ox; this.pos.z = oz; break; }
      edge = Math.max(edge, Math.abs(g - gPrev));
      gPrev = g;
    }
    const b = PLAY_BOUNDS;
    this.pos.x = Math.max(b.x0, Math.min(b.x1, this.pos.x));
    this.pos.z = Math.max(b.z0, Math.min(b.z1, this.pos.z));

    // gravidade e chão
    const ground = this.ctx.groundAt(this.pos.x, this.pos.z, this.pos.y);
    // água: profundidade sobre o chão; entra a nado (andando para o fundo ou caindo
    // de cima) e volta a andar quando dá pé
    const wl = this.ctx.waterLevel(this.pos.x, this.pos.z);
    const depth = wl === null ? 0 : wl - ground;
    this.waterY = depth > 0 ? wl : null;
    if (this.swimming && depth < SWIM_OUT) {
      this.swimming = false; this.stepT = 0.3;
      this.grounded = ground > this.pos.y - 0.45;
      if (this.grounded) this.vel.y = 0;
    } else if (!this.swimming && depth > SWIM_IN && (this.grounded || this.pos.y < wl - SWIM_Y + 0.3)) {
      this.swimming = true;
      const k = this.grounded ? 0.6 : Math.max(0.6, Math.min(2.5, -this.vel.y / 4));
      this.effects?.splash(this.pos.x, wl, this.pos.z, k);
      this.audio.splash?.(k);
      this.grounded = true;
    }
    const jumpOk = !this.swimming && depth < 0.6;
    if (input && !this.auto && !aiming && !this.noJump && jumpOk && this.grounded && input.jump()) { this.vel.y = 4.6; this.grounded = false; }
    if (edge > 0.08) this.stepT = 0.15;
    if (this.swimming) {
      // boia: mola até a altura de nado, com um balanço leve (afunda um pouco ao cair na água)
      this.bobT = (this.bobT || 0) + dt;
      const goal = wl - SWIM_Y + Math.sin(this.bobT * 2.1) * 0.025;
      this.vel.y += ((goal - this.pos.y) * 26 - this.vel.y * 7) * dt;
      this.pos.y += this.vel.y * dt;
      // nunca abaixo do leito
      if (this.pos.y < ground - 0.3) { this.pos.y = ground - 0.3; this.vel.y = Math.max(0, this.vel.y); }
    } else if (this.grounded) {
      if (ground < this.pos.y - 0.45) { this.grounded = false; this.vel.y = 0; }
      // degrau: desce suave (~0,1 s) e sobe quase na hora (no máximo 5 cm dentro do
      // degrau). Ladeira e rampa: os pés acompanham o chão na hora — com o atraso,
      // correndo morro acima afundavam até 12 cm
      else if (this.stepT > 0) this.pos.y = Math.max(this.pos.y + (ground - this.pos.y) * Math.min(1, dt * 18), ground - 0.05);
      else this.pos.y = ground;
    }
    if (this.stepT > 0) this.stepT -= dt;
    if (!this.grounded) {
      this.vel.y -= 13 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= ground) {
        // caiu na água rasa: respingo
        if (depth > 0.05 && this.vel.y < -2.5) { const k = Math.min(1.4, -this.vel.y / 5); this.effects?.splash(this.pos.x, wl, this.pos.z, k); this.audio.splash?.(k); }
        this.pos.y = ground; this.vel.y = 0; this.grounded = true;
      }
    }
    // o quanto a água segura (da canela até a cintura)
    const wk = this.swimming ? 1 : clamp((depth - 0.12) / 0.8, 0, 1);
    this.wade += (wk - this.wade) * Math.min(1, dt * 6);
    this._waterFx(dt, depth);
    step.vy = this.swimming ? 0 : this.vel.y;
    step.still = !input;   // conversa, leitura, cena: olha para a frente (sem olhar em volta)
    step.swim = this.swimming;
    step.wade = this.swimming ? 0 : this.wade;
    this.ch.update(dt, this.speed, this.grounded, run, step);
    this.sync(ground);
    return { moving: mag > 0.05 };
  }

  // passo: na água o pé espirra
  _footstep(run) {
    if (this.waterY !== null && this.waterY - this.pos.y > 0.04) {
      this.audio.splash?.(run ? 0.75 : 0.45);
      const h = this.heading, s = Math.random() < 0.5 ? -1 : 1;
      this.effects?.splash(this.pos.x + Math.sin(h) * 0.25 + Math.cos(h) * 0.1 * s, this.waterY, this.pos.z + Math.cos(h) * 0.25 - Math.sin(h) * 0.1 * s, run ? 0.45 : 0.25);
    } else this.audio.step(this.surface(), run);
  }

  // braçada: barulho de água e gotas nas mãos
  _stroke(k) {
    this.audio.stroke?.(k);
    if (this.waterY === null || !this.effects) return;
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h);
    for (const s of [-1, 1]) this.effects.splash(this.pos.x + fx * 0.55 + fz * 0.35 * s, this.waterY, this.pos.z + fz * 0.55 - fx * 0.35 * s, 0.12 + 0.25 * k);
  }

  // marolas em volta do corpo: nadando, boiando e andando na água
  _waterFx(dt, depth) {
    if (this.waterY === null || !this.effects) return;
    if (!this.swimming && !(depth > 0.15 && this.grounded)) return;
    this.rippleT -= dt;
    if (this.rippleT > 0) return;
    const mv = Math.min(1, this.speed / 1.5);
    this.rippleT = this.swimming ? 0.55 - 0.3 * mv : mv > 0.1 ? 0.3 : 0.9;
    if (!this.swimming && mv <= 0.1 && depth < 0.3) return;
    const back = this.swimming ? 0.35 : 0;
    this.effects.ripple(this.pos.x - Math.sin(this.heading) * back, this.waterY, this.pos.z - Math.cos(this.heading) * back, this.swimming ? 1.3 + 0.6 * mv : 0.9 + 0.5 * mv, 1.2, 0.2 + 0.08 * mv);
  }

  sync(ground = this.pos.y) {
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.heading;
    this.ch.blob.position.set(this.pos.x, ground + 0.03, this.pos.z);
    const k = Math.max(0.3, 1 - (this.pos.y - ground) * 0.4);
    this.ch.blob.scale.setScalar(k);
  }
}
