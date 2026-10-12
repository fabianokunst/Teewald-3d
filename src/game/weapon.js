import * as THREE from 'three';
import { CollisionWorld } from '../engine/collision.js';
import { roadSurfaceAt } from '../world/roads.js';
import { drawText } from '../ui/overlay.js';
import { makeItemModel, PISTOL_POINTS } from './itemModels.js';
import { GunAudio } from './gunAudio.js';
import { PISTOL_MAG } from './items.js';

// Pistola: fica na mão direita quando equipada (cano para baixo), mira por cima
// do ombro, atira com raio contra o mundo e recarrega com a munição do inventário.
// Tiro sem mirar levanta a arma, atira e mantém a mira por um instante.

const RANGE = 160;
const RELOAD_T = 1.35;
const v3 = () => new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- raio contra o mundo ----------
function hitBox(b, o, d) {
  const [lx, lz] = CollisionWorld.local(b, o.x, o.z);
  const ldx = d.x * b.c - d.z * b.s, ldz = d.x * b.s + d.z * b.c;
  let t0 = -Infinity, t1 = Infinity, axis = -1, sign = 0;
  const slab = (org, dir, mn, mx, ax) => {
    if (Math.abs(dir) < 1e-9) return org >= mn && org <= mx;
    let a = (mn - org) / dir, c = (mx - org) / dir, s = -1;
    if (a > c) { [a, c] = [c, a]; s = 1; }
    if (a > t0) { t0 = a; axis = ax; sign = s; }
    t1 = Math.min(t1, c);
    return t0 <= t1;
  };
  if (!slab(lx, ldx, -b.hx, b.hx, 0) || !slab(o.y, d.y, b.y0, b.y1, 1) || !slab(lz, ldz, -b.hz, b.hz, 2)) return null;
  if (t0 <= 1e-4) return null;
  let nx = 0, ny = 0, nz = 0;
  if (axis === 0) nx = sign; else if (axis === 1) ny = sign; else nz = sign;
  return { t: t0, n: [nx * b.c + nz * b.s, ny, -nx * b.s + nz * b.c] };
}

function hitCyl(c, o, d) {
  const fx = o.x - c.x, fz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z, bb = 2 * (fx * d.x + fz * d.z), cc = fx * fx + fz * fz - c.r * c.r;
  const disc = bb * bb - 4 * a * cc;
  if (disc < 0 || a < 1e-9) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * a);
  if (t <= 1e-4) return null;
  const y = o.y + d.y * t;
  if (y < c.y0 || y > c.y1) return null;
  const px = o.x + d.x * t - c.x, pz = o.z + d.z * t - c.z, l = Math.hypot(px, pz) || 1;
  return { t, n: [px / l, 0, pz / l] };
}

// tipo de superfície pelo formato do obstáculo (árvores ocupam 9 m de altura)
function surfaceOf(it) {
  if (it.t === 'circle') {
    if (Math.abs(it.y1 - it.y0 - 9) < 1e-3) return 'wood';
    return it.r <= 0.35 ? 'metal' : 'wall';
  }
  if (Math.min(it.hx, it.hz) <= 0.15 || (!it.cam && it.y1 - it.y0 < 1.2)) return 'wood';
  return 'wall';
}

// devolve { t, p, n, kind: 'target' | 'world' | 'ground' | 'water', surface, target } ou null
export function castRay(ctx, targets, o, d, maxD) {
  let best = { t: maxD, kind: null };
  const tg = targets?.raycast(o, d, maxD);
  if (tg && tg.t < best.t) best = { t: tg.t, kind: 'target', target: tg.target };
  const col = ctx.collision, seen = new Set();
  for (let t = 0; t <= best.t + 2; t += 2) {
    for (const it of col.near(o.x + d.x * t, o.z + d.z * t, 1.5)) {
      if (seen.has(it)) continue;
      seen.add(it);
      const h = it.t === 'box' ? hitBox(it, o, d) : hitCyl(it, o, d);
      if (h && h.t < best.t) best = { t: h.t, kind: 'world', n: h.n, surface: surfaceOf(it) };
    }
  }
  // chão (terreno, ruas, pisos) e água: marcha e bissecção
  const T = ctx.terrain, gy = (x, z, y) => ctx.groundAt(x, z, y);
  let tp = 0, yp = o.y;
  for (let t = 0.6; t < best.t + 0.6; t += 0.6) {
    const tt = Math.min(t, best.t), x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
    const w = T.waterAt(x, z);
    if (w && y < w.level && yp >= w.level) {
      const tw = tp + ((w.level - yp) / (y - yp)) * (tt - tp);
      if (tw < best.t) best = { t: tw, kind: 'water', n: [0, 1, 0], surface: 'water' };
      break;
    }
    if (y < gy(x, z, y)) {
      let a = tp, b = tt;
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2, mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
        if (my < gy(mx, mz, my)) b = m; else a = m;
      }
      if (b < best.t) {
        const x2 = o.x + d.x * b, z2 = o.z + d.z * b, e = 0.25;
        const n = new THREE.Vector3(T.heightAt(x2 - e, z2) - T.heightAt(x2 + e, z2), 2 * e, T.heightAt(x2, z2 - e) - T.heightAt(x2, z2 + e)).normalize();
        const road = roadSurfaceAt(ctx.roads, T, x2, z2) !== null;
        best = { t: b, kind: 'ground', n: [n.x, n.y, n.z], surface: road ? 'road' : 'dirt' };
      }
      break;
    }
    tp = tt; yp = y;
    if (tt >= best.t) break;
  }
  if (!best.kind) return null;
  best.p = new THREE.Vector3().copy(o).addScaledVector(d, best.t);
  return best;
}

export class Pistol {
  // o: { ctx, character, player, tpc, camera, inventory, effects, targets, audio, hud, input, M }
  constructor(o) {
    Object.assign(this, o);
    const ch = this.character;
    // a arma vai na mão direita (lado -x do personagem), com o cano ao longo dos dedos
    this.holder = new THREE.Group();
    this.holder.position.set(0.004, -0.085, 0.034);
    this.holder.rotation.x = Math.PI / 2;
    ch.arms[0].hand.add(this.holder);
    this.model = makeItemModel('pistol', this.M);
    this.holder.add(this.model);
    this.flash = this.effects.makeFlash();
    this.flash.position.set(...PISTOL_POINTS.muzzle);
    this.model.add(this.flash);
    this.model.visible = false;
    this.aim = 0; this.aiming = false; this.autoAim = 0; this.queued = false;
    this.cool = 0; this.reloadT = 0; this.reloadPart = 0; this.reloadDelay = 0;
    this.recoil = 0; this.bloom = 0; this.flashT = 0; this.hitMark = 0; this.overTarget = false;
    this.taught = false;
    this._v = v3(); this._v2 = v3(); this._v3 = v3(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._q3 = new THREE.Quaternion();
    this._down = new THREE.Vector3(0, -1, 0); this._up = new THREE.Vector3(0, 1, 0); this._zAxis = new THREE.Vector3(0, 0, 1);
  }

  get slot() { return this.inventory.find('pistol'); }
  get equipped() { return this.inventory.equipped === 'pistol' && !!this.slot; }
  get mag() { return this.slot?.data?.mag ?? 0; }
  set mag(v) { const s = this.slot; if (s) (s.data ||= {}).mag = v; }
  get ammo() { return this.inventory.count('ammo9'); }

  equip(on) {
    this.inventory.equipped = on ? 'pistol' : null;
    GunAudio.equip(this.audio);
    if (!on) { this.reloadT = 0; this.aiming = false; }
  }

  // dica de controles na primeira vez em que a arma vai para a mão
  teach() {
    if (this.taught || !this.equipped) return;
    this.taught = true;
    this.hud.toast('PISTOLA NA MÃO');
    this.hud.showHints({
      keyboard: ['BOTÃO DIREITO mirar   ESQUERDO atirar', 'R recarregar   I inventário'],
      pad: ['L2 mirar   R2 atirar   X recarregar', 'RB atira sem mirar   Y inventário'],
      touch: ['MIRAR liga a mira   ATIRAR dispara', 'REC recarrega   INV inventário'],
    });
  }

  // carregar pelo inventário: instantâneo
  reloadNow() {
    const n = Math.min(PISTOL_MAG - this.mag, this.ammo);
    if (n <= 0) return false;
    this.inventory.take('ammo9', n);
    this.mag += n;
    GunAudio.reload(this.audio, 'in');
    setTimeout(() => GunAudio.reload(this.audio, 'slide'), 160);
    return true;
  }

  reload() {
    if (!this.equipped || this.reloadT > 0 || this.mag >= PISTOL_MAG) return;
    if (this.ammo <= 0) { this.hud.toast('SEM MUNIÇÃO'); GunAudio.dry(this.audio); return; }
    this.reloadT = 1e-4; this.reloadPart = 0; this.queued = false;
  }

  // antes do jogador: decide se está mirando (o jogador vira para a mira e anda devagar)
  pre(dt, input) {
    const eq = this.equipped;
    this.model.visible = eq;
    if (!eq) {
      this.aiming = false; this.queued = false; this.autoAim = 0;
      this.player.aimYaw = null; this.tpc.aimWant = false;
      return;
    }
    if (input.reloadHit()) this.reload();
    const held = input.aimHeld();
    if (input.fireHit() && this.reloadT <= 0) {
      this.queued = true;
      if (!held) this.autoAim = Math.max(this.autoAim, 1.1);
    }
    this.autoAim = Math.max(0, this.autoAim - dt);
    this.aiming = this.reloadT <= 0 && (held || this.autoAim > 0);
    this.player.aimYaw = this.aiming ? this.tpc.yaw + Math.PI : null;
    this.tpc.aimWant = this.aiming;
  }

  // depois do jogador (personagem já animado): pose, tiro, recarga
  post(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.recoil *= Math.exp(-dt * 11);
    this.bloom *= Math.exp(-dt * 4);
    this.hitMark = Math.max(0, this.hitMark - dt);
    this.aim += ((this.aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (!this.equipped) { this.aim = 0; this.flash.visible = false; return; }

    if (this.reloadDelay > 0) { this.reloadDelay -= dt; if (this.reloadDelay <= 0) this.reload(); }
    if (this.reloadT > 0) {
      this.reloadT += dt;
      const t = this.reloadT;
      if (this.reloadPart === 0 && t > 0.15) { this.reloadPart = 1; GunAudio.reload(this.audio, 'out'); }
      if (this.reloadPart === 1 && t > 0.75) { this.reloadPart = 2; GunAudio.reload(this.audio, 'in'); }
      if (this.reloadPart === 2 && t > 1.12) { this.reloadPart = 3; GunAudio.reload(this.audio, 'slide'); }
      if (t >= RELOAD_T) {
        const n = Math.min(PISTOL_MAG - this.mag, this.ammo);
        this.inventory.take('ammo9', n);
        this.mag += n;
        this.reloadT = 0;
      }
    }
    this._pose();
    if (this.aiming) this._scanTargets();
    if (this.queued && this.aim > 0.85) {
      this.queued = false;
      this._fire();
      if (this.autoAim > 0) this.autoAim = 0.9;
    }
    if (this.queued && !this.aiming) this.queued = false;
  }

  _aimDir(out) { return this.camera.getWorldDirection(out); }

  _pose() {
    const ch = this.character, a = this.aim;
    // recarga: traz a arma para a frente do peito e a mão esquerda até ela
    if (this.reloadT > 0) {
      const t = this.reloadT, rb = Math.min(1, t / 0.22) * Math.min(1, (RELOAD_T - t) / 0.22);
      const [R, L] = ch.arms;
      R.sh.rotation.x = lerp(R.sh.rotation.x, -0.55, rb); R.sh.rotation.z = lerp(R.sh.rotation.z, 0.28, rb);
      R.el.rotation.x = lerp(R.el.rotation.x, -1.45, rb); R.hand.rotation.x = lerp(R.hand.rotation.x, 0.15, rb);
      const shake = this.reloadPart === 1 ? Math.sin(t * 30) * 0.08 : 0;
      L.sh.rotation.x = lerp(L.sh.rotation.x, -0.5 + shake, rb); L.sh.rotation.z = lerp(L.sh.rotation.z, -0.32, rb);
      L.el.rotation.x = lerp(L.el.rotation.x, -1.55, rb);
      ch.head.rotation.x = lerp(ch.head.rotation.x, 0.35, rb);
      return;
    }
    if (a < 0.01) return;
    const f = this._aimDir(this._v);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    ch.spine.rotation.x = lerp(ch.spine.rotation.x, -pitch * 0.3, a);
    ch.spine.rotation.y = lerp(ch.spine.rotation.y, 0, a);
    ch.hips.rotation.y = lerp(ch.hips.rotation.y, 0, a);
    ch.head.rotation.x = lerp(ch.head.rotation.x, -pitch * 0.45, a);
    ch.head.rotation.y = lerp(ch.head.rotation.y, 0, a);
    ch.root.updateMatrixWorld(true);
    // as duas mãos se encontram à frente do peito, na linha da mira
    const chest = ch.spine.localToWorld(this._v2.set(0, 0.43, 0.02));
    const grip = this._v3.copy(chest).addScaledVector(f, 0.56).addScaledVector(this._up, this.recoil * 0.05);
    const spineQ = ch.spine.getWorldQuaternion(this._q2).invert();
    ch.arms.forEach((arm, i) => {
      const target = i === 0 ? grip : this._v2.copy(grip).addScaledVector(f, -0.06).addScaledVector(this._up, -0.04);
      const S = arm.sh.getWorldPosition(new THREE.Vector3());
      const d = S.sub(target).negate().normalize().applyQuaternion(spineQ);
      this._q.setFromUnitVectors(this._down, d);
      arm.sh.quaternion.slerp(this._q, a);
      arm.el.rotation.x = lerp(arm.el.rotation.x, i === 0 ? -0.12 - this.recoil * 0.25 : -0.55, a);
      arm.el.rotation.y = lerp(arm.el.rotation.y, 0, a); arm.el.rotation.z = lerp(arm.el.rotation.z, 0, a);
    });
    ch.root.updateMatrixWorld(true);
    // mão da arma: cano na direção da mira (levantado pelo coice) e alça de mira para cima
    const hand = ch.arms[0].hand;
    const aimD = this._v2.copy(f).addScaledVector(this._up, this.recoil * 0.3).normalize();
    const Qh = hand.getWorldQuaternion(this._q);
    const u = this._v3.copy(this._down).applyQuaternion(Qh);
    const R1 = this._q2.setFromUnitVectors(u, aimD);
    Qh.premultiply(R1);
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(Qh);
    z.addScaledVector(aimD, -z.dot(aimD)).normalize();
    const upP = new THREE.Vector3(0, 1, 0).addScaledVector(aimD, -aimD.y).normalize();
    Qh.premultiply(this._q2.setFromUnitVectors(z, upP));
    const parentQ = ch.arms[0].el.getWorldQuaternion(this._q3).invert();
    hand.quaternion.slerp(parentQ.multiply(Qh), a);
    ch.root.updateMatrixWorld(true);
  }

  // mira vermelha sobre um alvo
  _scanTargets() {
    const f = this._aimDir(this._v);
    const hit = this.targets.raycast(this.camera.position, f, 60);
    this.overTarget = !!hit;
  }

  _fire() {
    if (this.cool > 0) return;
    if (this.mag <= 0) {
      GunAudio.dry(this.audio);
      this.cool = 0.25;
      if (this.ammo > 0) this.reload(); else this.hud.toast('SEM MUNIÇÃO');
      return;
    }
    this.mag = this.mag - 1;
    this.cool = 0.17;
    const cam = this.camera, o = cam.position.clone();
    const f = this._aimDir(v3());
    // espalhamento pequeno, que cresce com tiros seguidos
    const spread = 0.0015 + this.bloom;
    const side = v3().crossVectors(f, this._up).normalize(), up = v3().crossVectors(side, f);
    const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    f.addScaledVector(side, Math.cos(ang) * r).addScaledVector(up, Math.sin(ang) * r).normalize();
    // controle e toque: puxa de leve para um alvo perto da mira
    if (this.input.lastDevice !== 'keyboard') {
      let best = null, bestA = 0.04;
      for (const T of this.targets.targets) {
        if (T.state === 'broken' || T.grow < 0.5) continue;
        const c = v3().copy(T.pos).add(this._v3.set(0, T.type === 'can' ? 0.06 : 0.13, 0)).sub(o);
        const dist = c.length();
        if (dist > 45) continue;
        const angle = c.normalize().angleTo(f);
        if (angle < bestA) { bestA = angle; best = c.clone(); }
      }
      if (best) f.copy(best);
    }
    // pula o trecho entre a câmera e o personagem
    const chest = v3().copy(this.player.pos).add(this._v3.set(0, 1.3, 0));
    const skip = Math.max(0, chest.sub(o).dot(f) - 0.4);
    o.addScaledVector(f, skip);
    const first = castRay(this.ctx, this.targets, o, f, RANGE);
    const P = first ? first.p : o.clone().addScaledVector(f, RANGE);
    // do cano até o ponto mirado (algo na frente do cano bloqueia)
    this.model.updateMatrixWorld(true);
    const muzzle = this.model.localToWorld(v3().set(...PISTOL_POINTS.muzzle));
    const d2 = P.clone().sub(muzzle);
    const L = d2.length();
    d2.divideScalar(L || 1);
    const hit = castRay(this.ctx, this.targets, muzzle, d2, L + 0.05);
    if (hit) {
      if (hit.kind === 'target') { this.targets.hit(hit.target, d2, hit.p, muzzle); this.hitMark = 0.25; }
      else {
        this.effects.impact([hit.p.x, hit.p.y, hit.p.z], hit.n, hit.surface);
        GunAudio.impact(this.audio, hit.surface, hit.t);
      }
    }
    // clarão, som, cápsula, coice
    GunAudio.shot(this.audio);
    this.flash.visible = true; this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.45);
    const ej = this.model.localToWorld(v3().set(...PISTOL_POINTS.eject));
    const right = v3(-1, 0, 0).transformDirection(this.model.matrixWorld);
    const vel = right.multiplyScalar(1.4 + Math.random() * 0.6).addScaledVector(this._up, 1.8 + Math.random() * 0.8).addScaledVector(d2, -0.3);
    const pp = this.player.pos;
    this.effects.casing(ej, vel, P2 => GunAudio.casing(this.audio, P2.p.distanceTo(pp)));
    this.recoil = 1;
    this.bloom = Math.min(0.03, this.bloom + 0.007);
    this.tpc.pitch -= 0.014;
    this.tpc.yaw += (Math.random() - 0.5) * 0.008;
    if (this.mag === 0 && this.ammo > 0) this.reloadDelay = 0.35;
  }

  // munição no canto superior esquerdo (no toque, abaixo dos botões) e mira no centro
  drawHud(g, W, H, device) {
    if (!this.equipped) return;
    const k = H / 240;
    const x = 8 * k, y = device === 'touch' ? 44 * k : 22 * k;
    drawText(g, 'PISTOLA 9MM', x, y - 9 * k, 9 * k, { color: '#a89878' });
    const s = drawText(g, String(this.mag), x, y, 18 * k, { color: this.mag === 0 ? '#ff7060' : '#f2e6c8' });
    drawText(g, '/ ' + this.ammo, x + s.w + 2 * k, y + 6 * k, 11 * k, { color: this.ammo === 0 ? '#ff7060' : '#c8b898' });
    if (this.reloadT > 0 && Math.floor(this.reloadT * 6) % 2 === 0) drawText(g, 'RECARREGANDO', x + s.w + 34 * k, y + 6 * k, 10 * k, { color: '#f2c879' });
    if (this.aim > 0.6) {
      const cx = Math.round(W / 2), cy = Math.round(H / 2);
      const gap = Math.round((2 + this.bloom * 220 + this.recoil * 3) * k), len = Math.round(4 * k), t = Math.max(1, Math.round(k));
      const col = this.overTarget ? '#ff5a48' : '#f4f0e0';
      const bar = (x0, y0, w, h) => { g.fillStyle = '#140c08'; g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2); g.fillStyle = col; g.fillRect(x0, y0, w, h); };
      bar(cx - gap - len, cy, len, t); bar(cx + gap + 1, cy, len, t);
      bar(cx, cy - gap - len, t, len); bar(cx, cy + gap + 1, t, len);
      g.fillStyle = col; g.fillRect(cx, cy, t, t);
      if (this.hitMark > 0) {
        g.fillStyle = '#ffe6a0';
        for (let i = 0; i < 3; i++) {
          const o = gap + len + 2 * k + i;
          for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) g.fillRect(cx + sx * o, cy + sy * o, t, t);
        }
      }
    }
  }
}
