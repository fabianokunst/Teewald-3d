import * as THREE from 'three';
import { CollisionWorld } from '../engine/collision.js';
import { roadSurfaceAt } from '../world/roads.js';
import { drawText } from '../ui/overlay.js';
import { makeItemModel, GUN_POINTS } from './itemModels.js';
import { GunAudio } from './gunAudio.js';
import { ITEMS } from './items.js';
import { AimAssist } from './aimAssist.js';

// Armas de fogo e especiais. Ficam na mão direita quando equipadas (cano ao longo
// dos dedos), miram por cima do ombro e atiram com raio contra o mundo.
// Tiro sem mirar levanta a arma, atira e mantém a mira por um instante; no controle
// e no toque ele trava no bicho à frente (mira assistida, aimAssist.js), e segurar o
// gatilho continua atirando num ritmo mais lento. Aperto no intervalo entre tiros fica
// guardado e sai assim que a arma deixa.
// - pistola 9 mm, espingarda de dois canos (chumbo espalhado), revólver com balas de prata;
// - pistola de raios (projétil verde, carga que volta sozinha);
// - rifle de dardos (sedativo: só derruba bicho cansado);
// - lampião bento (segurar o gatilho solta a luz que queima fantasmas; gasta querosene);
// - dinamite (o gatilho acende e joga; a explosão é do sistema de combate).

const v3 = () => new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
// vibração do controle a cada tiro: [motor grande, motor pequeno, ms]
const RUMBLE = { pistol: [0.12, 0.38, 70], shotgun: [0.75, 0.6, 150], revolver: [0.32, 0.55, 100], raygun: [0.08, 0.3, 60], dartgun: [0.05, 0.25, 50] };

export const GUNS = {
  pistol: { label: 'PISTOLA 9MM', mag: 12, ammo: 'ammo9', dmg: 1, kind: 'bullet', cool: 0.17, reload: 1.35, spread: 0.0015, bloom: 0.007, pellets: 1, range: 160, sound: 'shot', kick: 1 },
  shotgun: { label: 'ESPINGARDA', mag: 2, ammo: 'shells', dmg: 0.9, kind: 'bullet', cool: 0.32, reload: 1.6, spread: 0.06, bloom: 0, pellets: 8, range: 45, sound: 'shotgun', kick: 2.4, twoHand: true },
  revolver: { label: 'REVÓLVER .38', mag: 6, ammo: 'silver', dmg: 2.5, kind: 'silver', cool: 0.42, reload: 2.1, spread: 0.0012, bloom: 0.012, pellets: 1, range: 160, sound: 'revolver', kick: 1.5 },
  raygun: { label: 'PISTOLA DE RAIOS', mag: 8, ammo: null, energy: 1.1, dmg: 3, kind: 'ray', cool: 0.36, spread: 0.002, bloom: 0.004, projectile: true, sound: 'ray', kick: 0.8 },
  dartgun: { label: 'RIFLE DE DARDOS', mag: 1, ammo: 'darts', dmg: 0.3, kind: 'dart', cool: 0.5, reload: 1.3, spread: 0.0008, bloom: 0, pellets: 1, range: 90, sound: 'dart', kick: 0.5, twoHand: true },
  lantern: { label: 'LAMPIÃO BENTO', beam: true, ammo: 'oil', dps: 2.4, range: 9.5, cos: 0.9 },
  dynamite: { label: 'DINAMITE', throw: true },
};

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
  return it.surface || 'wall';
}

// devolve { t, p, n, kind: 'target' | 'world' | 'ground' | 'water', surface, target } ou null
export function castRay(ctx, targets, o, d, maxD) {
  let best = { t: maxD, kind: null };
  const tg = targets?.raycast(o, d, maxD);
  if (tg && tg.t < best.t) best = { t: tg.t, kind: 'target', target: tg.target };
  const col = ctx.collision, seen = new Set();
  for (let t = 0; t <= best.t + 2; t += 2) {
    for (const it of col.near(o.x + d.x * t, o.z + d.z * t, 1.5)) {
      if (seen.has(it) || it.ghost) continue;
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
    if (w && y < w.level && yp >= w.level && !ctx.indoor) {
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
        let n = [0, 1, 0], surface = 'dirt';
        if (!ctx.indoor) {
          const nn = new THREE.Vector3(T.heightAt(x2 - e, z2) - T.heightAt(x2 + e, z2), 2 * e, T.heightAt(x2, z2 - e) - T.heightAt(x2, z2 + e)).normalize();
          n = [nn.x, nn.y, nn.z];
          surface = roadSurfaceAt(ctx.roads, T, x2, z2) !== null ? 'road' : 'dirt';
        } else surface = 'road';
        best = { t: b, kind: 'ground', n, surface };
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

// cone de luz do lampião (somado à cena)
function beamMesh() {
  const L = 7, R = 2.3, n = 10, pos = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a0) * R, Math.sin(a0) * R, L, Math.cos(a1) * R, Math.sin(a1) * R, L);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const cols = [];
  for (let i = 0; i < pos.length / 3; i++) { const tip = i % 3 === 0; cols.push(tip ? 0.55 : 0.0, tip ? 0.45 : 0.0, tip ? 0.22 : 0.0); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false; m.renderOrder = 6; m.visible = false;
  return m;
}

export class Guns {
  // o: { ctx, character, player, tpc, camera, inventory, effects, targets, audio, hud, input, M, atmo, combat }
  constructor(o) {
    Object.assign(this, o);
    const ch = this.character;
    // a arma vai na mão direita (lado -x do personagem), com o cano ao longo dos dedos
    this.holder = new THREE.Group();
    this.holder.position.set(0.004, -0.085, 0.034);
    this.holder.rotation.x = Math.PI / 2;
    ch.arms[0].hand.add(this.holder);
    this.models = {};
    for (const id of Object.keys(GUNS)) {
      const m = makeItemModel(id, this.M);
      m.visible = false;
      this.holder.add(m);
      this.models[id] = m;
    }
    // clarão do cano (um por arma de fogo)
    this.flashes = {};
    for (const id of ['pistol', 'shotgun', 'revolver', 'raygun']) {
      const f = this.effects.makeFlash();
      f.position.set(...GUN_POINTS[id].muzzle);
      if (id === 'shotgun') f.scale.setScalar(1.6);
      this.models[id].add(f);
      this.flashes[id] = f;
    }
    this.beam = beamMesh();
    this.models.lantern.add(this.beam);
    this.beam.position.set(...GUN_POINTS.lantern.muzzle);
    this.aim = 0; this.aiming = false; this.autoAim = 0; this.queued = false; this.queuedT = 0;
    this.wasHeld = false; this.hipLock = null; this.repT = 0;
    // mira assistida (controle e toque); a linha de visão ignora os alvos, só o mundo
    const losV = v3();
    this.assist = new AimAssist({
      targets: this.targets, camera: this.camera, tpc: this.tpc,
      los: (o, p) => {
        const d = losV.copy(p).sub(o), L = d.length();
        const hit = castRay(this.ctx, null, o, d.divideScalar(L || 1), L);
        return !hit || hit.t > L - 0.3;
      },
    });
    this.cool = 0; this.reloadT = 0; this.reloadPart = 0; this.reloadDelay = 0;
    this.recoil = 0; this.bloom = 0; this.flashT = 0; this.hitMark = 0; this.overTarget = false;
    this.beamOn = false; this.flameT = 0;
    this.taught = {};
    this._v = v3(); this._v2 = v3(); this._v3 = v3(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._q3 = new THREE.Quaternion();
    this._down = new THREE.Vector3(0, -1, 0); this._up = new THREE.Vector3(0, 1, 0);
  }

  // arma de fogo/especial na mão (null = mãos livres ou arma branca)
  get id() { const e = this.inventory.equipped; return e && GUNS[e] && this.inventory.find(e) ? e : null; }
  get cfg() { return GUNS[this.id] || null; }
  get slot() { const id = this.id; return id ? this.inventory.find(id) : null; }
  get equipped() { return !!this.id; }
  get model() { return this.models[this.id || 'pistol']; }
  get mag() {
    const s = this.slot, c = this.cfg;
    if (!s || !c) return 0;
    if (c.throw) return s.n;
    if (c.beam) return Math.round(s.data?.fuel ?? 100);
    return s.data?.mag ?? 0;
  }
  set mag(v) { const s = this.slot; if (s) (s.data ||= {}).mag = v; }
  get ammo() { const c = this.cfg; return c?.ammo ? this.inventory.count(c.ammo) : 0; }
  get fuel() { return this.slot?.data?.fuel ?? 100; }
  set fuel(v) { const s = this.slot; if (s) (s.data ||= {}).fuel = v; }

  // on: true = pistola (compatível com a missão 1), false = guarda, 'id' = arma específica
  equip(on) {
    const id = on === true ? 'pistol' : on || null;
    if (id && !this.inventory.find(id)) return;
    if (this.inventory.equipped !== id) GunAudio.equip(this.audio);
    this.inventory.equipped = id;
    this.reloadT = 0; this.queued = false; this.hipLock = null;
    this.assist.reset();
    if (!id) this.aiming = false;
    // pente cheio na primeira vez
    const s = this.slot, c = this.cfg;
    if (s && c && !c.beam && !c.throw && s.data?.mag === undefined) (s.data ||= {}).mag = c.ammo ? 0 : c.mag;
    if (s && c?.beam && s.data?.fuel === undefined) (s.data ||= {}).fuel = 100;
  }

  // troca para a próxima arma (dir = 1 / -1); passa pelas mãos livres
  cycle(dir = 1) {
    const list = [null, ...this.inventory.guns()];
    const i = Math.max(0, list.indexOf(this.id));
    const next = list[(i + dir + list.length) % list.length];
    this.equip(next || false);
    const name = next ? GUNS[next].label : (this.combat?.meleeName?.() || 'MÃOS LIVRES');
    this.hud.toast(name);
  }

  // dica de controles na primeira vez em que cada arma vai para a mão
  teach() {
    const id = this.id;
    if (!id || this.taught[id]) return;
    this.taught[id] = true;
    this.hud.toast(GUNS[id].label + ' NA MÃO');
    const c = GUNS[id];
    if (c.beam) {
      this.hud.showHints({
        keyboard: ['BOTÃO DIREITO mirar   SEGURE O ESQUERDO para a luz', 'A luz queima fantasmas   R reabastece'],
        pad: ['L2 mirar   SEGURE R2 para a luz', 'X reabastece   ◀▶ troca de arma'],
        touch: ['SEGURE ATIRAR para soltar a luz', 'Arraste o dedo para mover a luz   REC reabastece'],
      });
    } else if (c.throw) {
      this.hud.showHints({
        keyboard: ['ESQUERDO acende e joga a dinamite', 'Corra depois de jogar!'],
        pad: ['R2 acende e joga   com L2, no bicho mirado', 'Corra depois de jogar!'],
        touch: ['ATIRAR acende e joga a dinamite', 'Corra depois de jogar!'],
      });
    } else {
      this.hud.showHints({
        keyboard: ['BOTÃO DIREITO mirar   ESQUERDO atirar', 'R recarregar   1-8 armas   V golpe'],
        pad: ['L2 mira no bicho   R2 atira (segure: continua)', 'X recarrega   RB golpe   ◀▶ troca de arma'],
        touch: ['ATIRAR mira sozinho no bicho à frente', 'Arraste o dedo no ATIRAR para mirar   MIRAR liga a mira', 'REC recarrega   ARMA troca'],
      });
    }
  }

  // carregar pelo inventário: instantâneo
  reloadNow() {
    const c = this.cfg;
    if (!c) return false;
    if (c.beam) {
      if (this.fuel >= 99 || this.inventory.count('oil') <= 0) return false;
      this.inventory.take('oil', 1); this.fuel = 100; GunAudio.reload(this.audio, 'in');
      return true;
    }
    if (!c.ammo) return false;
    const n = Math.min(c.mag - this.mag, this.ammo);
    if (n <= 0) return false;
    this.inventory.take(c.ammo, n);
    this.mag += n;
    GunAudio.reload(this.audio, 'in');
    setTimeout(() => GunAudio.reload(this.audio, 'slide'), 160);
    return true;
  }

  // carregar uma arma pelo inventário (qualquer uma, não só a da mão)
  reloadGun(id) {
    const c = GUNS[id], s = this.inventory.find(id);
    if (!c || !s || c.throw || c.energy) return false;
    if (c.beam) {
      if ((s.data?.fuel ?? 100) >= 99 || this.inventory.count('oil') <= 0) return false;
      this.inventory.take('oil', 1); (s.data ||= {}).fuel = 100; GunAudio.reload(this.audio, 'in');
      return true;
    }
    const mag = s.data?.mag ?? 0, n = Math.min(c.mag - mag, this.inventory.count(c.ammo));
    if (n <= 0) return false;
    this.inventory.take(c.ammo, n);
    (s.data ||= {}).mag = mag + n;
    GunAudio.reload(this.audio, 'in');
    setTimeout(() => GunAudio.reload(this.audio, 'slide'), 160);
    return true;
  }

  reload() {
    const c = this.cfg;
    if (!c || this.reloadT > 0 || c.throw || c.energy) return;
    if (c.beam) { if (!this.reloadNow()) this.hud.toast(this.inventory.count('oil') ? 'LAMPIÃO CHEIO' : 'SEM QUEROSENE'); return; }
    if (this.mag >= c.mag) return;
    if (this.ammo <= 0) { this.hud.toast('SEM MUNIÇÃO'); GunAudio.dry(this.audio); return; }
    this.reloadT = 1e-4; this.reloadPart = 0; this.queued = false;
  }

  // antes do jogador: decide se está mirando (o jogador vira para a mira e anda devagar)
  pre(dt, input) {
    // nadando, a arma fica guardada (as duas mãos vão na braçada)
    const id = this.player.holstered ? null : this.id, c = this.cfg, A = this.assist;
    for (const k in this.models) this.models[k].visible = k === id;
    if (!id) {
      this.aiming = false; this.queued = false; this.autoAim = 0; this.beamOn = false; this.hipLock = null;
      this.player.aimYaw = null; this.tpc.aimWant = false; input.aimLock = false;
      this.wasHeld = false; A.reset();
      return;
    }
    if (input.reloadHit()) this.reload();
    const held = input.aimHeld();
    // começou a mirar (L2 / MIRAR): no controle e no toque a mira vai até o bicho mais perto
    const aimStart = held && !this.wasHeld;
    this.wasHeld = held;
    if (aimStart) A.pick(input, 'snap', c.range);
    // dinamite: o gatilho joga (mirando ou não); mirando num bicho, joga nele
    if (c.throw) {
      this.aiming = held;
      if (input.fireHit() && this.cool <= 0 && this.combat) {
        let tgt = held ? (A.snap?.can === false ? A.snap.X : A.cur && !A.cur.can ? A.cur.X : null) : null;
        // longe demais: o pavio acabaria no ar
        if (tgt && Math.hypot(tgt.pos.x - this.player.pos.x, tgt.pos.z - this.player.pos.z) > 22) tgt = null;
        const dir = held && !tgt ? this.camera.getWorldDirection(this._v).clone() : null;
        if (this.combat.throwItem('dynamite', dir, tgt)) { this.inventory.take('dynamite', 1); this.cool = 0.9; }
      }
      this.player.aimYaw = this.aiming ? this.tpc.yaw + Math.PI : null;
      this.tpc.aimWant = this.aiming;
      input.aimLock = this.aiming;
      return;
    }
    if (c.beam) {
      // segurar o gatilho mantém a luz (e a mira)
      const fire = input.fireHeld();
      this.beamOn = fire && this.fuel > 0 && this.reloadT <= 0;
      if (fire && this.fuel <= 0 && input.fireHit()) { GunAudio.dry(this.audio); this.hud.toast(this.inventory.count('oil') ? 'R: REABASTECER' : 'SEM QUEROSENE'); }
      if (input.fireHit() && !held && this.beamOn) A.pick(input, 'hip', c.range);
      this.aiming = held || this.beamOn;
    } else {
      if (input.fireHit() && this.reloadT <= 0) {
        this.queued = true; this.queuedT = 0; this.repT = 0;
        if (!held) {
          this.autoAim = Math.max(this.autoAim, 1.1);
          // sem mirar: trava no bicho à frente (controle e toque)
          this.hipLock = A.pick(input, 'hip', c.range);
        }
      } else if (input.lastDevice !== 'keyboard' && input.fireHeld() && this.aiming && this.reloadT <= 0) {
        // controle e toque: segurando o gatilho, continua atirando (mais devagar que apertando)
        this.repT += dt;
        if (!held) this.autoAim = Math.max(this.autoAim, 0.5);
        if (!this.queued && this.repT >= Math.max(0.26, c.cool * 1.45)) { this.repT = 0; this.queued = true; this.queuedT = 0; }
      }
      this.autoAim = Math.max(0, this.autoAim - dt);
      this.aiming = this.reloadT <= 0 && (held || this.autoAim > 0);
    }
    this.player.aimYaw = this.aiming ? this.tpc.yaw + Math.PI : null;
    this.tpc.aimWant = this.aiming;
    input.aimLock = this.aiming;
  }

  // depois do jogador (personagem já animado): pose, tiro, recarga
  post(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.recoil *= Math.exp(-dt * 11);
    this.bloom *= Math.exp(-dt * 4);
    this.hitMark = Math.max(0, this.hitMark - dt);
    this.aim += ((this.aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) for (const f of Object.values(this.flashes)) f.visible = false; }
    const c = this.player.holstered ? null : this.cfg;
    // pistola de raios: a carga volta sozinha
    for (const s of this.inventory.slots) {
      if (s?.id === 'raygun') { (s.data ||= {}); s.data.mag = Math.min(GUNS.raygun.mag, (s.data.mag ?? GUNS.raygun.mag) + dt * GUNS.raygun.energy * (this.cool > 0 ? 0.3 : 1)); }
    }
    if (!c) { this.aim = 0; this.beam.visible = false; this.beamOn = false; return; }

    if (this.reloadDelay > 0) { this.reloadDelay -= dt; if (this.reloadDelay <= 0) this.reload(); }
    if (this.reloadT > 0) this._reloadStep(dt, c);
    this._pose();
    if (c.beam) this._beam(dt);
    else this.beam.visible = false;
    // mira assistida (controle e toque): puxão, atrito e acompanhamento antes da câmera
    if (this.aiming) this.assist.update(dt, this.input);
    else this.assist.reset();
    if (c.throw) return;
    if (this.aiming) this._scanTargets();
    // tiro na fila: sai quando a arma subiu (travado num bicho, antes: a bala vai nele de
    // qualquer jeito) e o intervalo entre tiros acabou; espera no máximo 0,6 s
    if (this.queued && this.cool <= 0 && this.aim > (this.hipLock ? 0.55 : 0.85)) {
      this.queued = false;
      this._fire();
      if (this.autoAim > 0) this.autoAim = Math.max(this.autoAim, 0.9);
    }
    if (this.queued) { this.queuedT += dt; if (!this.aiming || this.queuedT > 0.6) this.queued = false; }
    if (!this.queued) this.hipLock = null;
  }

  _reloadStep(dt, c) {
    this.reloadT += dt;
    const t = this.reloadT, id = this.id, R = c.reload;
    if (id === 'shotgun') {
      if (this.reloadPart === 0 && t > 0.15) { this.reloadPart = 1; GunAudio.breakOpen(this.audio, 'open'); }
      if (this.reloadPart === 1 && t > 0.6) { this.reloadPart = 2; GunAudio.breakOpen(this.audio, 'shell'); }
      if (this.reloadPart === 2 && t > 0.95) { this.reloadPart = 3; GunAudio.breakOpen(this.audio, 'shell'); }
      if (this.reloadPart === 3 && t > 1.35) { this.reloadPart = 4; GunAudio.breakOpen(this.audio, 'close'); }
    } else {
      if (this.reloadPart === 0 && t > 0.15) { this.reloadPart = 1; GunAudio.reload(this.audio, 'out'); }
      if (this.reloadPart === 1 && t > R * 0.55) { this.reloadPart = 2; GunAudio.reload(this.audio, 'in'); }
      if (this.reloadPart === 2 && t > R * 0.83) { this.reloadPart = 3; GunAudio.reload(this.audio, 'slide'); }
    }
    if (t >= R) {
      const n = Math.min(c.mag - this.mag, this.ammo);
      this.inventory.take(c.ammo, n);
      this.mag += n;
      this.reloadT = 0;
    }
  }

  _aimDir(out) { return this.camera.getWorldDirection(out); }

  _pose() {
    const ch = this.character, a = this.aim, c = this.cfg;
    // recarga: traz a arma para a frente do peito e a mão esquerda até ela
    if (this.reloadT > 0) {
      const t = this.reloadT, R0 = c.reload, rb = Math.min(1, t / 0.22) * Math.min(1, (R0 - t) / 0.22);
      const [R, L] = ch.arms;
      R.sh.rotation.x = lerp(R.sh.rotation.x, -0.55, rb); R.sh.rotation.z = lerp(R.sh.rotation.z, 0.28, rb);
      R.el.rotation.x = lerp(R.el.rotation.x, -1.45, rb); R.hand.rotation.x = lerp(R.hand.rotation.x, 0.15, rb);
      const shake = this.reloadPart === 1 || this.reloadPart === 2 ? Math.sin(t * 30) * 0.08 : 0;
      L.sh.rotation.x = lerp(L.sh.rotation.x, -0.5 + shake, rb); L.sh.rotation.z = lerp(L.sh.rotation.z, -0.32, rb);
      L.el.rotation.x = lerp(L.el.rotation.x, -1.55, rb);
      ch.head.rotation.x = lerp(ch.head.rotation.x, 0.35, rb);
      return;
    }
    // lampião sem mirar: braço um pouco à frente, segurando a alça
    if (c.beam && a < 0.99) {
      const R = ch.arms[0], k = 1 - a;
      R.sh.rotation.x = lerp(R.sh.rotation.x, -0.55, k); R.el.rotation.x = lerp(R.el.rotation.x, -0.5, k);
      R.hand.rotation.x = lerp(R.hand.rotation.x, 0.6, k);
    }
    if (a < 0.01) return;
    const f = this._aimDir(this._v);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    ch.spine.rotation.x = lerp(ch.spine.rotation.x, -pitch * 0.3, a);
    // o tronco fica de frente para a mira; o quadril segue as pernas (andando de lado, vira junto)
    ch.spine.rotation.y = lerp(ch.spine.rotation.y, -ch.hips.rotation.y, a);
    ch.head.rotation.x = lerp(ch.head.rotation.x, -pitch * 0.45, a);
    ch.head.rotation.y = lerp(ch.head.rotation.y, 0, a);
    ch.root.updateMatrixWorld(true);
    // as duas mãos se encontram à frente do peito, na linha da mira (armas longas: a esquerda vai no cano)
    const chest = ch.spine.localToWorld(this._v2.set(0, 0.43, 0.02));
    const reach = c.twoHand ? 0.42 : 0.56;
    const grip = this._v3.copy(chest).addScaledVector(f, reach).addScaledVector(this._up, this.recoil * 0.05);
    const spineQ = ch.spine.getWorldQuaternion(this._q2).invert();
    ch.arms.forEach((arm, i) => {
      const target = i === 0 ? grip : this._v2.copy(grip).addScaledVector(f, c.twoHand ? 0.26 : -0.06).addScaledVector(this._up, c.twoHand ? 0.0 : -0.04);
      if (c.beam && i === 1) target.copy(chest).addScaledVector(f, 0.2).addScaledVector(this._up, -0.25);
      const S = arm.sh.getWorldPosition(new THREE.Vector3());
      const d = S.sub(target).negate().normalize().applyQuaternion(spineQ);
      this._q.setFromUnitVectors(this._down, d);
      arm.sh.quaternion.slerp(this._q, a);
      arm.el.rotation.x = lerp(arm.el.rotation.x, i === 0 ? -0.12 - this.recoil * 0.25 : (c.twoHand ? -0.25 : -0.55), a);
      arm.el.rotation.y = lerp(arm.el.rotation.y, 0, a); arm.el.rotation.z = lerp(arm.el.rotation.z, 0, a);
    });
    ch.root.updateMatrixWorld(true);
    // mão da arma: cano na direção da mira (levantado pelo coice) e alça de mira para cima
    const hand = ch.arms[0].hand;
    const aimD = this._v2.copy(f).addScaledVector(this._up, this.recoil * 0.3 * (c.kick || 1) / 1.5).normalize();
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

  // luz do lampião: queima o que estiver no cone (fantasmas), gasta querosene
  _beam(dt) {
    const m = this.models.lantern;
    m.updateMatrixWorld(true);
    const p = m.localToWorld(this._v2.set(...GUN_POINTS.lantern.muzzle));
    const on = this.beamOn && this.aim > 0.6;
    this.beam.visible = on;
    if (!on) {
      // lampião aceso na mão: luz quente em volta
      this.atmo?.light(p.x, p.y + 0.1, p.z, [0.75, 0.55, 0.25], 7, 4);
      return;
    }
    const d = this._aimDir(this._v);
    this.fuel = Math.max(0, this.fuel - dt * 5.5);
    // o cone aponta para a mira
    const q = this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const pq = m.getWorldQuaternion(this._q2).invert();
    this.beam.quaternion.copy(pq.multiply(q));
    this.beam.scale.set(1, 1, 1 + Math.sin(performance.now() * 0.03) * 0.04);
    this.atmo?.light(p.x + d.x * 3, p.y + d.y * 3, p.z + d.z * 3, [1.6, 1.25, 0.6], 11, 6);
    this.atmo?.light(p.x, p.y, p.z, [0.9, 0.7, 0.35], 5, 5);
    this.combat?.beam(p, d, GUNS.lantern.range, GUNS.lantern.cos, GUNS.lantern.dps * dt, 'light');
    this.flameT -= dt;
    if (this.flameT <= 0) { this.flameT = 0.12; GunAudio.flame(this.audio); }
    if (this.fuel <= 0) { this.beamOn = false; this.hud.toast(this.inventory.count('oil') ? 'R: REABASTECER' : 'SEM QUEROSENE'); }
  }

  _fire() {
    if (this.cool > 0) return;
    const c = this.cfg, id = this.id;
    if (Math.floor(this.mag) <= 0) {
      GunAudio.dry(this.audio);
      this.cool = 0.25;
      if (c.energy) this.hud.toast('RECARREGANDO A ENERGIA...');
      else if (this.ammo > 0) this.reload(); else this.hud.toast('SEM MUNIÇÃO');
      return;
    }
    this.mag = this.mag - 1;
    this.cool = c.cool;
    const cam = this.camera, o0 = cam.position.clone();
    const base = this._aimDir(v3());
    this.model.updateMatrixWorld(true);
    const muzzle = this.model.localToWorld(v3().set(...GUN_POINTS[id].muzzle));
    // controle e toque: travado num bicho (tiro sem mirar) ou bala que passaria raspando
    const sd = this.assist.shotDir(this.input, o0, base, this.hipLock, c.range || 120);
    if (sd) base.copy(sd);
    const pellets = c.pellets || 1;
    let worldFx = 0;
    for (let k = 0; k < pellets; k++) {
      const f = base.clone();
      // espalhamento pequeno, que cresce com tiros seguidos (espingarda: chumbo aberto)
      const spread = c.spread + this.bloom;
      const side = v3().crossVectors(f, this._up).normalize(), up = v3().crossVectors(side, f);
      const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      f.addScaledVector(side, Math.cos(ang) * r).addScaledVector(up, Math.sin(ang) * r).normalize();
      if (c.projectile) {
        // raio: projétil que sai do cano na direção do ponto mirado
        const o = o0.clone();
        const chest = v3().copy(this.player.pos).add(this._v3.set(0, 1.3, 0));
        o.addScaledVector(f, Math.max(0, chest.sub(o).dot(f) - 0.4));
        const first = castRay(this.ctx, this.targets, o, f, 120);
        const P = first ? first.p : o.clone().addScaledVector(f, 120);
        const d2 = P.clone().sub(muzzle).normalize();
        this.combat?.projectile({ p: muzzle.clone(), v: d2.multiplyScalar(46), kind: 'ray', dmg: c.dmg, owner: 'player', life: 2.6, color: [0.5, 1, 0.45], size: 0.12, light: [0.5, 1.4, 0.5] });
        continue;
      }
      // pula o trecho entre a câmera e o personagem
      const o = o0.clone();
      const chest = v3().copy(this.player.pos).add(this._v3.set(0, 1.3, 0));
      const skip = Math.max(0, chest.sub(o).dot(f) - 0.4);
      o.addScaledVector(f, skip);
      const first = castRay(this.ctx, this.targets, o, f, c.range);
      const P = first ? first.p : o.clone().addScaledVector(f, c.range);
      // do cano até o ponto mirado (algo na frente do cano bloqueia)
      const d2 = P.clone().sub(muzzle);
      const L = d2.length();
      d2.divideScalar(L || 1);
      const hit = castRay(this.ctx, this.targets, muzzle, d2, L + 0.05);
      if (hit) {
        if (hit.kind === 'target') { this.targets.hit(hit.target, d2, hit.p, muzzle, { kind: c.kind, dmg: c.dmg, gun: id }); this.hitMark = 0.25; }
        else if (worldFx < 4) {
          worldFx++;
          this.effects.impact([hit.p.x, hit.p.y, hit.p.z], hit.n, hit.surface);
          if (worldFx <= 2) GunAudio.impact(this.audio, hit.surface, hit.t);
        }
      }
    }
    // clarão, som, cápsula, coice
    GunAudio[c.sound]?.(this.audio);
    // o estampido espanta as corujas em volta
    this.ctx.scare?.(this.player.pos.x, this.player.pos.z, 55);
    const fl = this.flashes[id];
    if (fl) {
      fl.visible = true; this.flashT = 0.05;
      fl.rotation.z = Math.random() * Math.PI;
      fl.scale.setScalar((id === 'shotgun' ? 1.5 : 0.8) + Math.random() * 0.45);
      const col = id === 'raygun' ? [0.4, 1.4, 0.4] : [1.8, 1.3, 0.6];
      this.atmo?.light(muzzle.x, muzzle.y, muzzle.z, col, id === 'shotgun' ? 12 : 8, 9);
      this._flashLight = { p: muzzle.clone(), t: 0.06, col };
    }
    const ej = GUN_POINTS[id].eject;
    if (ej && id === 'pistol') {
      const e = this.model.localToWorld(v3().set(...ej));
      const right = v3(-1, 0, 0).transformDirection(this.model.matrixWorld);
      const vel = right.multiplyScalar(1.4 + Math.random() * 0.6).addScaledVector(this._up, 1.8 + Math.random() * 0.8).addScaledVector(base, -0.3);
      const pp = this.player.pos;
      this.effects.casing(e, vel, P2 => GunAudio.casing(this.audio, P2.p.distanceTo(pp)));
    }
    this.recoil = 1;
    this.bloom = Math.min(0.03, this.bloom + (c.bloom || 0));
    // coice: a câmera sobe e volta sozinha (a mira não fica mais alta a cada tiro)
    const kick = c.kick || 1;
    this.tpc.kick(0.028 * kick, (Math.random() - 0.5) * 0.012 * kick);
    if (c.kick > 2 && this.combat) this.combat.shake = Math.max(this.combat.shake, 0.18);
    const rb = RUMBLE[id];
    if (rb) this.input.rumble(rb[0], rb[1], rb[2]);
    if (Math.floor(this.mag) === 0 && this.ammo > 0 && !c.energy) this.reloadDelay = 0.35;
  }

  // clarão do tiro continua iluminando por alguns quadros
  lights(dt) {
    const F = this._flashLight;
    if (!F) return;
    F.t -= dt;
    if (F.t <= 0) { this._flashLight = null; return; }
    this.atmo?.light(F.p.x, F.p.y, F.p.z, F.col, 9, 9);
  }

  // munição no canto superior esquerdo (no toque, abaixo dos botões) e mira no centro
  drawHud(g, W, H, device) {
    const c = this.cfg;
    if (!c) return;
    const k = H / 240;
    const x = 8 * k, y = device === 'touch' ? 44 * k : 22 * k;
    drawText(g, c.label, x, y - 9 * k, 9 * k, { color: '#a89878' });
    if (c.beam || c.energy) {
      // barra de querosene / energia
      const f = c.beam ? this.fuel / 100 : this.mag / c.mag, bw = Math.round(60 * k), bh = Math.max(3, Math.round(5 * k));
      g.fillStyle = '#140c08'; g.fillRect(Math.round(x) - 1, Math.round(y + 4 * k) - 1, bw + 2, bh + 2);
      g.fillStyle = '#2a2018'; g.fillRect(Math.round(x), Math.round(y + 4 * k), bw, bh);
      g.fillStyle = c.beam ? '#e8b048' : '#78e868'; g.fillRect(Math.round(x), Math.round(y + 4 * k), Math.round(bw * f), bh);
      if (c.beam) drawText(g, '+' + this.inventory.count('oil'), x + bw + 4 * k, y + 1 * k, 11 * k, { color: '#c8b898' });
    } else if (c.throw) {
      drawText(g, '× ' + this.mag, x, y, 18 * k, { color: '#f2e6c8' });
    } else {
      const s = drawText(g, String(this.mag), x, y, 18 * k, { color: this.mag === 0 ? '#ff7060' : '#f2e6c8' });
      drawText(g, '/ ' + this.ammo, x + s.w + 2 * k, y + 6 * k, 11 * k, { color: this.ammo === 0 ? '#ff7060' : '#c8b898' });
      if (this.reloadT > 0 && Math.floor(this.reloadT * 6) % 2 === 0) drawText(g, 'RECARREGANDO', x + s.w + 34 * k, y + 6 * k, 10 * k, { color: '#f2c879' });
    }
    if (this.aim > 0.6 && !c.throw) {
      const cx = Math.round(W / 2), cy = Math.round(H / 2);
      const wide = this.id === 'shotgun' ? 10 : 0;
      const gap = Math.round((2 + wide + this.bloom * 220 + this.recoil * 3) * k), len = Math.round(4 * k), t = Math.max(1, Math.round(k));
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

// nome antigo (a missão 1 e as telas usam "pistol")
export { Guns as Pistol };
export const gunLabel = id => GUNS[id]?.label || ITEMS[id]?.name || id;
