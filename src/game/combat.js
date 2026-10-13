import * as THREE from 'three';
import { makeItemModel } from './itemModels.js';
import { GunAudio } from './gunAudio.js';
import { ITEMS } from './items.js';
import { castRay, GUNS } from './weapon.js';
import { drawText, textSprite, panel, FONT_UI } from '../ui/overlay.js';
import { settings } from '../config.js';

// Combate corpo a corpo e tudo que é comum às lutas:
// - vida do jogador (golpe com empurrão, tela vermelha, invencível por um instante);
// - soco em combo de três golpes (sempre disponível) e armas brancas achadas no chão
//   (pau, cano, pá, foice, machado), que gastam e quebram; pedras e tijolos para jogar;
// - esquiva rápida; coronhada com a arma de fogo na mão;
// - projéteis (raio, bola de fogo, pedra, dinamite), explosões e a luz do lampião;
// - itens no chão (PEGAR), com brilho e volta depois de um tempo;
// - lista das criaturas vivas, barra do chefe e o HUD da vida.

export const MELEE = {
  hands: { name: 'SOCO', dmg: [0.6, 0.6, 1.25], range: 1.4, time: 0.34, sound: 'punch' },
  gun: { name: 'CORONHADA', dmg: 0.9, range: 1.5, time: 0.42, sound: 'punch' },
  pau: { name: 'PEDAÇO DE PAU', dmg: 1.15, range: 1.8, time: 0.5, dur: 14, sound: 'wood' },
  cano: { name: 'CANO DE FERRO', dmg: 1.5, range: 1.85, time: 0.52, dur: 22, sound: 'metal' },
  pa: { name: 'PÁ', dmg: 1.75, range: 2.0, time: 0.58, dur: 18, sound: 'metal' },
  foice: { name: 'FOICE', dmg: 2.1, range: 2.0, time: 0.55, dur: 16, sound: 'blade' },
  machado: { name: 'MACHADO', dmg: 2.9, range: 1.9, time: 0.68, dur: 14, sound: 'blade', heavy: true },
  pedra: { name: 'PEDRA', throw: true, dmg: 1.4, max: 6 },
  tijolo: { name: 'TIJOLO', throw: true, dmg: 1.9, max: 4 },
};
const MELEE_IDS = ['pau', 'cano', 'pa', 'foice', 'machado', 'pedra', 'tijolo'];

const MAX_HP = 100;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// brilho de item no chão
function glintTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.2, 'rgba(255,220,150,0.6)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(255,250,230,0.9)'; g.fillRect(15, 2, 2, 28); g.fillRect(2, 15, 28, 2);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

export class Combat {
  // o: { ctx, scene, audio, player, character, tpc, camera, inventory, effects, hud, input, atmo, M, targets }
  constructor(o) {
    Object.assign(this, o);
    this.guns = null;          // main liga depois de criar as armas
    this.enemies = new Set();
    this.projectiles = [];
    this.pickups = [];
    this.boss = null;
    this.glintMat = new THREE.SpriteMaterial({ map: glintTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    // arma branca na mão direita (mesmo encaixe da pistola)
    const holder = this.holder = new THREE.Group();
    holder.position.set(0.004, -0.085, 0.034);
    holder.rotation.x = Math.PI / 2;
    this.character.arms[0].hand.add(holder);
    this.handModels = {};
    for (const id of MELEE_IDS) {
      const m = makeItemModel(id, this.M);
      m.visible = false;
      if (id === 'pedra' || id === 'tijolo') m.position.set(0, -0.03, 0.04);
      holder.add(m);
      this.handModels[id] = m;
    }
    this._v = v3(); this._v2 = v3(); this._v3 = v3();
    this.chip = null; this.touchPick = false;
    addEventListener('touchstart', e => {
      const c = this.chip;
      if (!c) return;
      for (const t of e.changedTouches) {
        const [x, y] = this.R.toInternal(t.clientX, t.clientY), pad = 6 * (this.R.H / 240);
        if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) this.touchPick = true;
      }
    }, { passive: true });
    this.reset();
  }

  reset() {
    this.hp = MAX_HP; this.maxHp = MAX_HP;
    this.hurtT = 99; this.flash = 0; this.shake = 0; this.knock = null; this.hpShow = 0; this.invuln = 0;
    this.dead = false; this.hitStop = 0; this.t = 0;
    this.melee = null;           // { id, dur, n }
    this.atk = null; this.combo = 0; this.comboT = 0; this.queued = false;
    this.dodge = null; this.dodgeCool = 0;
    this.clearEnemies();
    for (const p of this.projectiles) if (p.mesh) this.scene.remove(p.mesh);
    this.projectiles = [];
    this.boss = null;
    this.character.root.rotation.x = 0;
    this.lastFight = 99;
  }

  // ---------- criaturas ----------
  spawn(e) {
    this.enemies.add(e);
    e.combat = this;
    (this.targets.extra ||= []).includes(e) || this.targets.extra.push(e);
    return e;
  }

  remove(e) {
    this.enemies.delete(e);
    const i = this.targets.extra.indexOf(e);
    if (i >= 0) this.targets.extra.splice(i, 1);
    e.dispose?.();
    if (this.boss === e) this.boss = null;
  }

  clearEnemies(filter = null) {
    for (const e of [...this.enemies]) if (!filter || filter(e)) this.remove(e);
  }

  alive(filter = null) { let n = 0; for (const e of this.enemies) if (!e.dead && !e.friendly && (!filter || filter(e))) n++; return n; }

  nearestEnemy(x, z, maxD = Infinity, filter = null) {
    let best = null, bd = maxD;
    for (const e of this.enemies) {
      if (e.dead || e.friendly || e.untargetable || (filter && !filter(e))) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  get inFight() { return this.lastFight < 6; }

  // ---------- vida do jogador ----------
  // dmg em pontos (vida máxima 100); dx/dz = direção do empurrão
  hurt(dmg, dx = 0, dz = 0, o = {}) {
    if (this.dead || this.invuln > 0 || this.dodge?.iframes > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtT = 0; this.flash = Math.min(1, 0.5 + dmg / 30); this.shake = Math.max(this.shake, 0.25 + dmg / 60); this.hpShow = 4;
    this.invuln = o.invuln ?? 0.55;
    const kk = o.knock ?? 5.5;
    if (kk > 0) this.knock = { x: dx * kk, z: dz * kk };
    this.lastFight = 0;
    // gemido e pancada
    const a = this.audio;
    if (a?.ctx) {
      const c = a.ctx, t = c.currentTime;
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(210, t); osc.frequency.exponentialRampToValueAtTime(110, t + 0.22);
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(g).connect(a.master); osc.start(t); osc.stop(t + 0.3);
      GunAudio.thump(a, 'punch', 0.8);
    }
    const p = this.player.pos;
    for (let i = 0; i < 8; i++) {
      this.effects.spawn({ p: this._v.set(p.x, p.y + 1.2, p.z), v: this._v2.set(dx * 1.5 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.5, dz * 1.5 + (Math.random() - 0.5) * 2), life: 0.6, s0: 0.04, s1: 0.02, color: [0.55, 0.05, 0.04], grav: 9.8, bounce: 0.1 });
    }
    if (navigator.vibrate && this.input.lastDevice === 'touch' && settings.vibrate !== false) { try { navigator.vibrate(60); } catch (e) { /* ignora */ } }
    this.input.rumble(0.9, 0.5, 220);
    if (this.hp <= 0) { this.dead = true; this.atk = null; this.dodge = null; }
    return true;
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.hpShow = 3;
    return this.hp - before;
  }

  revive(full = true) {
    this.dead = false; this.hp = full ? this.maxHp : Math.max(this.hp, 60);
    this.flash = 0; this.knock = null; this.shake = 0; this.hurtT = 99; this.invuln = 1.5;
    this.atk = null; this.dodge = null;
    this.character.root.rotation.x = 0;
  }

  // usa o melhor item de cura do inventário (atalho H)
  quickHeal() {
    if (this.hp >= this.maxHp) return false;
    const id = this.hp < 45 && this.inventory.count('cha') ? 'cha' : this.inventory.count('cuca') ? 'cuca' : this.inventory.count('cha') ? 'cha' : null;
    if (!id) { this.hud.toast('SEM COMIDA OU CHÁ'); return false; }
    this.inventory.take(id, 1);
    this.heal(ITEMS[id].heal);
    this.hud.toast(ITEMS[id].name + '  +VIDA');
    this.audio.tone(523, 0.2, 'triangle', 0.06); setTimeout(() => this.audio.tone(784, 0.3, 'triangle', 0.05), 120);
    return true;
  }

  // ---------- arma branca ----------
  meleeName() {
    const m = this.melee;
    if (!m) return 'SOCO';
    return MELEE[m.id].name + (MELEE[m.id].throw ? ' ×' + m.n : '');
  }

  setMelee(id, o = {}) {
    if (!id) { this.melee = null; return; }
    const def = MELEE[id];
    this.melee = { id, dur: o.dur ?? def.dur ?? 0, n: o.n ?? 1 };
  }

  // larga a arma branca no chão (ao pegar outra)
  _dropMelee() {
    const m = this.melee;
    if (!m) return;
    const P = this.player.pos, h = this.player.heading;
    this.addPickup(m.id, P.x - Math.sin(h) * 0.6 + 0.3, P.z - Math.cos(h) * 0.6, { n: m.n, dur: m.dur, temp: true });
    this.melee = null;
  }

  // ---------- antes do jogador: golpes e esquiva ----------
  pre(dt, input) {
    const P = this.player;
    this.comboT += dt;
    if (this.comboT > 0.55 && !this.atk) this.combo = 0;
    this.dodgeCool = Math.max(0, this.dodgeCool - dt);
    if (this.dead) return;
    const gun = this.guns?.cfg;
    // troca de arma
    const wk = input.weaponKey();
    if (wk === 1) { this.guns.equip(false); this.hud.toast(this.meleeName()); }
    else if (wk > 1) {
      const order = ['pistol', 'shotgun', 'revolver', 'lantern', 'raygun', 'dartgun', 'dynamite'];
      const id = order[wk - 2];
      if (id && this.inventory.find(id)) { this.guns.equip(id); this.guns.teach(); this.hud.toast(GUNS[id].label); }
    }
    const cyc = input.weaponCycle();
    if (cyc) { this.guns.cycle(cyc); this.guns.teach(); }
    // cura rápida: H, direcional ▲ ou CURA no toque
    if (input.healHit()) this.quickHeal();
    // ataque: V / RB / GOLPE sempre; o clique/R2/ATIRAR também, se não houver arma de fogo
    const wantAtk = input.meleeHit() || (!gun && input.fireHit());
    if (wantAtk) {
      if (this.atk && this.atk.kind === 'punch' && this.atk.t > this.atk.dur * 0.35) this.queued = true;
      else if (!this.atk && !this.dodge) this._startAttack();
    }
    if (input.dodgeHit() && !this.dodge && this.dodgeCool <= 0 && P.grounded && (!this.atk || this.atk.t > this.atk.dur * 0.5)) this._startDodge(input);
    const busy = !!this.atk || !!this.dodge;
    P.moveScale = this.atk ? 0.25 : this.dodge ? 0 : 1;
    P.lockHeading = busy;
    P.noJump = busy;
    if (busy && this.guns) {
      this.guns.aiming = false; this.guns.queued = false; this.guns.autoAim = 0;
      P.aimYaw = null; this.tpc.aimWant = false;
    }
  }

  _startAttack() {
    const gun = this.guns?.cfg, m = this.melee;
    let kind, def, id;
    if (gun) { kind = 'whip'; def = MELEE.gun; id = 'gun'; }
    else if (m && MELEE[m.id].throw) { kind = 'throw'; def = MELEE[m.id]; id = m.id; }
    else if (m) { kind = 'swing'; def = MELEE[m.id]; id = m.id; }
    else { kind = 'punch'; def = MELEE.hands; id = 'hands'; }
    const combo = kind === 'punch' ? this.combo % 3 : 0;
    const dur = kind === 'throw' ? 0.46 : kind === 'punch' ? def.time * (combo === 2 ? 1.3 : 1) : def.time;
    this.atk = { kind, id, def, t: 0, dur, combo, hit: new Set(), thrown: false, swung: false };
    this.comboT = 0;
    if (kind === 'punch') this.combo++;
    // vira para a criatura mais perto à frente (assistência leve)
    const P = this.player, mv = this.input.move();
    let face = P.heading;
    if (Math.hypot(mv.x, mv.y) > 0.3) {
      const yaw = this.tpc.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      face = Math.atan2(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x);
    }
    const reach = kind === 'throw' ? 18 : (def.range || 1.5) + 1.8;
    let best = null, bs = -Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.untargetable) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + (e.radius || 0.4)) continue;
      const ang = Math.abs(wrapA(Math.atan2(dx, dz) - face));
      if (ang > (kind === 'throw' ? 0.6 : 1.4)) continue;
      const s = -d - ang * 2;
      if (s > bs) { bs = s; best = e; }
    }
    this.atk.target = best;
    if (best) face = Math.atan2(best.pos.x - P.pos.x, best.pos.z - P.pos.z);
    P.heading = face;
    // coronhada guarda a mira
    if (this.guns) { this.guns.reloadT = 0; }
  }

  _startDodge(input) {
    const P = this.player, mv = input.move();
    let dir;
    if (Math.hypot(mv.x, mv.y) > 0.3) {
      const yaw = this.tpc.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      dir = Math.atan2(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x);
    } else dir = P.heading + Math.PI;      // sem direção: pula para trás
    const back = Math.abs(wrapA(dir - P.heading)) > Math.PI / 2;
    this.dodge = { t: 0, dur: 0.36, dx: Math.sin(dir), dz: Math.cos(dir), back, iframes: 0.3 };
    if (!back) P.heading = dir;
    this.atk = null; this.queued = false;
    this.dodgeCool = 0.5;
    GunAudio.swing(this.audio, true);
    this.player.audio?.step?.(this.player.surface?.() || 'grass', true);
  }

  // ---------- depois do jogador (personagem animado): pose do golpe e acertos ----------
  post(dt) {
    const gunOn = !!this.guns?.cfg;
    for (const id of MELEE_IDS) this.handModels[id].visible = !gunOn && this.melee?.id === id;
    const A = this.atk;
    if (A) {
      A.t += dt;
      const p = clamp(A.t / A.dur, 0, 1);
      this._posAttack(A, p);
      this._attackHits(A, p);
      if (A.t >= A.dur) {
        this.atk = null;
        if (this.queued && A.kind === 'punch') { this.queued = false; this._startAttack(); }
        this.queued = false;
      }
    }
    if (this.dodge) {
      const D = this.dodge;
      D.t += dt; D.iframes -= dt;
      const k = Math.sin(clamp(D.t / D.dur, 0, 1) * Math.PI);
      const ch = this.character;
      ch.spine.rotation.x += (D.back ? -0.3 : 0.55) * k;
      ch.hips.position.y -= 0.22 * k;
      for (const L of ch.legs) { L.hip.rotation.x -= 0.6 * k; L.knee.rotation.x += 1.0 * k; }
      for (const a of ch.arms) { a.sh.rotation.x -= 0.5 * k; a.el.rotation.x -= 0.6 * k; }
      if (D.t >= D.dur) this.dodge = null;
    }
  }

  _posAttack(A, p) {
    const ch = this.character, [R, L] = ch.arms;
    if (A.kind === 'punch') {
      const right = A.combo !== 1, arm = right ? R : L, other = right ? L : R, s = right ? 1 : -1;
      const ext = p < 0.3 ? -0.25 * smooth(p / 0.3) : p < 0.5 ? smooth((p - 0.3) / 0.2) : 1 - smooth((p - 0.5) / 0.5);
      const upper = A.combo === 2;
      arm.sh.rotation.set(lerp(-0.6, upper ? -2.3 : -1.55, Math.max(0, ext)), 0, s * lerp(0.25, upper ? 0.05 : 0.1, Math.max(0, ext)) * -1);
      arm.el.rotation.x = lerp(-2.0, upper ? -1.1 : -0.12, Math.max(0, ext));
      // a outra mão em guarda
      other.sh.rotation.set(-0.95, 0, -s * -0.25);
      other.el.rotation.x = -2.1;
      ch.spine.rotation.y = s * 0.42 * ext;
      ch.spine.rotation.x += 0.08 * Math.max(0, ext);
      ch.head.rotation.y = -s * 0.2 * ext;
    } else if (A.kind === 'swing' || A.kind === 'whip') {
      const w = A.kind === 'whip' ? 0.8 : 1;
      let shx, shz, el, tw;
      if (p < 0.38) { const k = smooth(p / 0.38); shx = lerp(-0.2, -2.75 * w, k); shz = lerp(0.1, 0.5, k); el = lerp(-0.3, -0.7, k); tw = lerp(0, -0.4, k); }
      else if (p < 0.58) { const k = smooth((p - 0.38) / 0.2); shx = lerp(-2.75 * w, -0.45, k); shz = lerp(0.5, -0.35, k); el = lerp(-0.7, -0.05, k); tw = lerp(-0.4, 0.5, k); }
      else { const k = smooth((p - 0.58) / 0.42); shx = lerp(-0.45, -0.2, k); shz = lerp(-0.35, 0.1, k); el = lerp(-0.05, -0.3, k); tw = lerp(0.5, 0, k); }
      R.sh.rotation.set(shx, 0, shz);
      R.el.rotation.x = el;
      R.hand.rotation.set(0.3, 0, 0);
      L.sh.rotation.set(-0.6, 0, -0.35); L.el.rotation.x = -1.2;
      ch.spine.rotation.y = tw;
      ch.spine.rotation.x += 0.12 * Math.max(0, Math.sin(p * Math.PI));
    } else if (A.kind === 'throw') {
      let shx, el, tw;
      if (p < 0.42) { const k = smooth(p / 0.42); shx = lerp(0, 0.85, k); el = lerp(-0.3, -1.7, k); tw = lerp(0, -0.5, k); }
      else if (p < 0.6) { const k = smooth((p - 0.42) / 0.18); shx = lerp(0.85, -2.1, k); el = lerp(-1.7, -0.2, k); tw = lerp(-0.5, 0.45, k); }
      else { const k = smooth((p - 0.6) / 0.4); shx = lerp(-2.1, -0.2, k); el = lerp(-0.2, -0.3, k); tw = lerp(0.45, 0, k); }
      R.sh.rotation.set(shx, 0, 0.35);
      R.el.rotation.x = el;
      L.sh.rotation.set(-1.1, 0, -0.4); L.el.rotation.x = -0.5;
      ch.spine.rotation.y = tw;
    }
    ch.root.updateMatrixWorld(true);
  }

  _attackHits(A, p) {
    const P = this.player;
    if (!A.swung && p > 0.3) {
      A.swung = true;
      if (A.kind !== 'throw') GunAudio.swing(this.audio, A.def.heavy || A.kind === 'swing');
    }
    // pequeno avanço no golpe
    if (p > 0.3 && p < 0.55 && A.kind !== 'throw') {
      const d = (A.kind === 'punch' ? 1.6 : 2.2) * (1 / A.dur) * 0.02;
      const tgt = A.target;
      const close = tgt && Math.hypot(tgt.pos.x - P.pos.x, tgt.pos.z - P.pos.z) < (tgt.radius || 0.4) + 0.75;
      if (!close) {
        P.pos.x += Math.sin(P.heading) * d; P.pos.z += Math.cos(P.heading) * d;
        this.ctx.collision.resolve(P.pos, P.radius, 1.7);
      }
    }
    if (A.kind === 'throw') {
      if (!A.thrown && p >= 0.5) { A.thrown = true; this._throwMelee(A); }
      return;
    }
    if (p < 0.36 || p > 0.64) return;
    const def = A.def, range = def.range;
    const dmg = Array.isArray(def.dmg) ? def.dmg[A.combo] : def.dmg;
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    for (const e of this.enemies) {
      if (e.dead || A.hit.has(e) || e.untargetable) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > range + (e.radius || 0.4)) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.25 && d > 0.6) continue;
      // altura: criaturas voando alto não pegam soco
      const ey0 = e.pos.y + (e.hitY0 ?? 0), ey1 = e.pos.y + (e.height ?? 1.6);
      if (ey1 < P.pos.y + 0.2 || ey0 > P.pos.y + 2.1) continue;
      A.hit.add(e);
      const nx = dx / (d || 1), nz = dz / (d || 1);
      const hp = v3(e.pos.x - nx * (e.radius || 0.4), clamp(P.pos.y + 1.2, ey0, ey1), e.pos.z - nz * (e.radius || 0.4));
      const took = e.damage(dmg, { kind: 'melee', weapon: A.id, dir: v3(nx, 0, nz), p: hp, from: P.pos, knock: A.def.heavy ? 5 : A.combo === 2 ? 4 : 2.5 });
      if (took === false) continue;
      this.lastFight = 0;
      this.hitStop = A.def.heavy || A.combo === 2 ? 0.09 : 0.055;
      this.shake = Math.max(this.shake, A.def.heavy ? 0.3 : 0.16);
      GunAudio.thump(this.audio, e.armored ? 'metal' : def.sound || 'punch', 1);
      this.input.rumble(A.def.heavy ? 0.6 : 0.3, 0.35, A.def.heavy ? 120 : 70);
      // gasta a arma branca
      if (this.melee && A.kind === 'swing') {
        this.melee.dur--;
        if (this.melee.dur <= 0) {
          this.hud.toast(MELEE[this.melee.id].name + ' QUEBROU');
          GunAudio.breakWeapon(this.audio);
          const hpos = this.handModels[this.melee.id].getWorldPosition(v3());
          for (let i = 0; i < 10; i++) this.effects.spawn({ p: hpos, v: v3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.9, s0: 0.03, s1: 0.02, sx: 0.5, color: this.melee.id === 'pau' ? [0.45, 0.3, 0.18] : [0.5, 0.5, 0.52], grav: 9.8, bounce: 0.3, spin: 12 });
          this.melee = null;
          break;
        }
      }
    }
  }

  // ---------- arremesso ----------
  _throwMelee(A) {
    const m = this.melee;
    if (!m) return;
    this._launch(m.id, null, A.target, A.def.dmg);
    m.n--;
    if (m.n <= 0) this.melee = null;
  }

  // a arma (dinamite) pede um arremesso; dir = direção da mira (ou null: mira assistida);
  // target = bicho já mirado (controle e toque), recebe o arremesso em arco
  throwItem(id, dir, target = null) {
    if (this.atk || this.dead) return false;
    // animação de arremesso do braço direito
    this.atk = { kind: 'throw', id, def: { dmg: 0 }, t: 0, dur: 0.46, combo: 0, hit: new Set(), thrown: true, swung: true };
    const P = this.player;
    if (target) { dir = null; P.heading = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z); }
    else if (!dir) {
      target = this.nearestEnemy(P.pos.x, P.pos.z, 22, e => Math.abs(wrapA(Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - P.heading)) < 0.8);
      if (target) P.heading = Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z);
    } else P.heading = Math.atan2(dir.x, dir.z);
    setTimeout(() => this._launch(id, dir, target, 0), 200);
    GunAudio.fuse(this.audio);
    return true;
  }

  _launch(id, dir, target, dmg) {
    const P = this.player, h = P.heading;
    const hand = this.character.arms[0].hand.getWorldPosition(v3());
    const o = hand.lengthSq() > 0 ? hand : v3(P.pos.x, P.pos.y + 1.5, P.pos.z);
    o.y = Math.max(o.y, P.pos.y + 1.3);
    let v;
    const g = 12;
    if (target) {
      const tp = target.aimPoint?.() || v3(target.pos.x, target.pos.y + 0.8, target.pos.z);
      const dx = tp.x - o.x, dz = tp.z - o.z, dy = tp.y - o.y, d = Math.hypot(dx, dz);
      const spd = id === 'dynamite' ? 11 : 15, t = Math.max(0.25, d / spd);
      v = v3(dx / t, (dy + 0.5 * g * t * t) / t, dz / t);
    } else if (dir) {
      v = v3(dir.x, dir.y + 0.25, dir.z).normalize().multiplyScalar(id === 'dynamite' ? 13 : 17);
    } else {
      v = v3(Math.sin(h) * 12, 4, Math.cos(h) * 12);
    }
    const mesh = makeItemModel(id, this.M);
    mesh.scale.setScalar(id === 'dynamite' ? 1.4 : 1.6);
    this.scene.add(mesh);
    const isDyn = id === 'dynamite';
    this.projectiles.push({
      p: o.clone(), v, kind: isDyn ? 'dynamite' : 'stone', item: id, dmg: dmg || 1.4, owner: 'player', life: isDyn ? 1.9 : 3, grav: g,
      size: 0.15, mesh, spin: v3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5), bounce: isDyn ? 0.35 : 0.3,
      fuse: isDyn,
    });
  }

  // ---------- projéteis ----------
  // o: { p, v, kind, dmg, owner: 'player' | 'enemy', life, size, color, light, grav, onHit, homing, from }
  projectile(o) {
    const pr = { life: 2, size: 0.12, grav: 0, owner: 'enemy', ...o };
    this.projectiles.push(pr);
    return pr;
  }

  _updateProjectiles(dt) {
    const P = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.homing && pr.owner === 'enemy' && !this.dead) {
        // persegue o jogador de leve
        const tx = P.pos.x - pr.p.x, ty = P.pos.y + 1.2 - pr.p.y, tz = P.pos.z - pr.p.z, L = Math.hypot(tx, ty, tz) || 1;
        const sp = pr.v.length();
        pr.v.addScaledVector(this._v.set(tx / L, ty / L, tz / L), sp * pr.homing * dt).setLength(sp);
      }
      pr.v.y -= pr.grav * dt;
      const step = pr.v.length() * dt;
      const d = this._v2.copy(pr.v).divideScalar(pr.v.length() || 1);
      let done = false;
      if (pr.owner === 'player' && pr.kind !== 'dynamite') {
        for (const e of this.enemies) {
          if (e.dead || e.untargetable) continue;
          if (Math.hypot(e.pos.x - pr.p.x, e.pos.z - pr.p.z) > 6) continue;
          const h = e.raycast(pr.p, d, step + pr.size);
          if (h) {
            const hp = pr.p.clone().addScaledVector(d, h.t);
            e.damage(pr.dmg, { kind: pr.kind === 'ray' ? 'ray' : 'melee', weapon: pr.item || pr.kind, dir: d.clone(), p: hp, from: P.pos, knock: pr.kind === 'stone' ? 2.5 : 3, part: h.target?.part });
            this.lastFight = 0;
            if (pr.kind === 'ray') { this._burst(hp, pr.color || [0.5, 1, 0.45], 12); GunAudio.rayHit(this.audio, hp.distanceTo(P.pos)); }
            else GunAudio.thump(this.audio, 'stone', 0.9);
            done = true;
            if (pr.kind === 'stone') this._dropStone(pr, hp);
            break;
          }
        }
      } else if (pr.owner === 'enemy' && !this.dead) {
        // contra o jogador (cápsula do peito)
        const cx = P.pos.x - pr.p.x, cy = P.pos.y + 1.1 - pr.p.y, cz = P.pos.z - pr.p.z;
        const t = clamp(cx * d.x + cy * d.y + cz * d.z, 0, step);
        const ex = cx - d.x * t, ey = cy - d.y * t, ez = cz - d.z * t;
        if (Math.abs(ey) < 0.9 && Math.hypot(ex, ez) < pr.size + 0.4) {
          const l = Math.hypot(pr.v.x, pr.v.z) || 1;
          if (this.hurt(pr.dmg, pr.v.x / l, pr.v.z / l, { knock: pr.knock ?? 4 })) pr.onHit?.('player');
          this._burst(pr.p, pr.color || [1, 0.5, 0.2], 10);
          done = true;
        }
      }
      if (!done) {
        // mundo
        const hit = castRay(this.ctx, null, pr.p, d, step + 0.02);
        if (hit) {
          if (pr.kind === 'dynamite' || (pr.kind === 'stone' && pr.bounce)) {
            // quica
            const n = this._v3.set(...hit.n);
            pr.p.copy(hit.p).addScaledVector(n, 0.05);
            const vn = pr.v.dot(n);
            pr.v.addScaledVector(n, -(1 + pr.bounce) * vn).multiplyScalar(0.6);
            if (pr.v.length() < 1.2) { pr.v.set(0, 0, 0); pr.grav = 0; if (pr.kind === 'stone') { this._dropStone(pr, pr.p); done = true; } }
            else GunAudio.thump(this.audio, 'stone', 0.4);
          } else {
            this._burst(hit.p, pr.color || [1, 0.6, 0.2], 8);
            if (pr.kind === 'ray') GunAudio.rayHit(this.audio, hit.p.distanceTo(P.pos));
            pr.onWorld?.(hit.p);
            done = true;
          }
        } else pr.p.addScaledVector(pr.v, dt);
      }
      // dinamite: explode no fim do pavio
      if (pr.fuse) {
        if (Math.random() < 0.5) this.effects.spawn({ p: pr.p.clone().add(this._v.set(0, 0.12, 0)), v: v3((Math.random() - 0.5) * 0.5, 1, (Math.random() - 0.5) * 0.5), life: 0.25, s0: 0.03, s1: 0, color: [1, 0.8, 0.3], drag: 1 });
        this.atmo?.light(pr.p.x, pr.p.y + 0.2, pr.p.z, [0.9, 0.5, 0.15], 4, 5);
        if (pr.life <= 0) { this.explode(pr.p.clone(), 4.8, 7, 'player'); done = true; }
      } else if (pr.life <= 0) done = true;
      // visual
      if (pr.mesh) {
        pr.mesh.position.copy(pr.p);
        pr.mesh.rotation.x += pr.spin.x * dt; pr.mesh.rotation.y += pr.spin.y * dt; pr.mesh.rotation.z += pr.spin.z * dt;
      } else if (!done) {
        const c = pr.color || [1, 0.6, 0.2];
        this.effects.spawn({ p: pr.p.clone(), v: v3(0, 0, 0), life: 0.06, s0: pr.size * 2.2, s1: pr.size * 1.2, color: c });
        this.effects.spawn({ p: pr.p.clone(), v: v3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4), life: 0.3, s0: pr.size * 1.2, s1: 0, color: [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], drag: 2 });
        if (pr.light) this.atmo?.light(pr.p.x, pr.p.y, pr.p.z, pr.light, 6, 6);
      }
      if (done) {
        if (pr.mesh) this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // pedra que caiu volta a ser item no chão (dá para pegar de novo)
  _dropStone(pr, p) {
    if (pr.item !== 'pedra' && pr.item !== 'tijolo') return;
    this.addPickup(pr.item, p.x, p.z, { temp: true, life: 40 });
  }

  _burst(p, col, n = 10) {
    for (let i = 0; i < n; i++) {
      const v = v3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
      this.effects.spawn({ p: p.clone(), v, life: 0.3 + Math.random() * 0.3, s0: 0.06, s1: 0, color: col, drag: 2 });
    }
    this.atmo?.light(p.x, p.y, p.z, [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5], 6, 7);
  }

  // explosão: fogo, fumaça, terra, luz, tremor; fere criaturas e o jogador no raio
  explode(p, r = 4.5, dmg = 6, owner = 'player') {
    const P = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, dy = e.pos.y + 0.8 - p.y, d = Math.hypot(dx, dy, dz);
      if (d > r + (e.radius || 0.4)) continue;
      const k = 1 - Math.min(1, d / (r + (e.radius || 0.4)));
      const l = Math.hypot(dx, dz) || 1;
      e.damage(dmg * (0.35 + 0.65 * k), { kind: 'explosion', dir: v3(dx / l, 0, dz / l), p: e.pos.clone(), from: p, knock: 9 * k });
    }
    const pd = Math.hypot(P.pos.x - p.x, P.pos.y + 1 - p.y, P.pos.z - p.z);
    if (pd < r) {
      const l = Math.hypot(P.pos.x - p.x, P.pos.z - p.z) || 1;
      this.hurt(Math.round(38 * (1 - pd / r)) + 6, (P.pos.x - p.x) / l, (P.pos.z - p.z) / l, { knock: 9 });
    }
    this.shake = Math.max(this.shake, clamp(1.1 - pd / 30, 0.15, 0.9));
    this.hitStop = 0.06;
    GunAudio.explosion(this.audio, pd);
    const rk = clamp(1.2 - pd / 25, 0, 1);
    if (rk > 0.05) this.input.rumble(rk, rk * 0.7, 160 + rk * 260);
    const fx = this.effects;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      fx.spawn({ p: p.clone(), v: v3(Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s), life: 0.4 + Math.random() * 0.4, s0: 0.25 + Math.random() * 0.2, s1: 0.5, color: [1, 0.55 + Math.random() * 0.35, 0.15], drag: 3 });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
      fx.spawn({ p: p.clone().add(this._v.set(0, 0.5, 0)), v: v3(Math.cos(a) * s, 1.5 + Math.random() * 2, Math.sin(a) * s), life: 1.4 + Math.random(), s0: 0.4, s1: 1.4, color: [0.22, 0.2, 0.19], drag: 1.5, grav: -0.5 });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 5;
      fx.spawn({ p: p.clone(), v: v3(Math.cos(a) * s, 4 + Math.random() * 5, Math.sin(a) * s), life: 1.2, s0: 0.05, s1: 0.04, color: [0.35, 0.28, 0.2], grav: 12, bounce: 0.2, spin: 10 });
    }
    this.boom = { p: p.clone(), t: 0.35 };
  }

  // luz do lampião: fere o que estiver no cone
  beam(o, d, range, cos, dmg, kind) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.aimPoint?.() || v3(e.pos.x, e.pos.y + 1, e.pos.z);
      const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, L = Math.hypot(dx, dy, dz);
      if (L > range + (e.radius || 0.4) || L < 0.01) continue;
      // cone mais largo para criaturas grandes ou perto
      const k = (dx * d.x + dy * d.y + dz * d.z) / L;
      const tol = cos - Math.atan((e.radius || 0.4) / L) * 0.5;
      if (k < tol) continue;
      e.damage(dmg, { kind, beam: true, dir: v3(dx / L, 0, dz / L), p: c, from: o, knock: 0 });
      this.lastFight = 0;
    }
  }

  // ---------- itens no chão ----------
  // o: { n, dur, respawn (s), onPick(id), label, quest, temp, life, y, solo }
  addPickup(id, x, z, o = {}) {
    const mesh = makeItemModel(id, this.M);
    const big = MELEE[id] && !MELEE[id].throw;
    mesh.scale.setScalar(big ? 1.1 : 1.5);
    if (MELEE[id] || id === 'pistol' || id === 'shotgun' || id === 'revolver' || id === 'dartgun' || id === 'raygun') mesh.rotation.set(Math.PI / 2, Math.random() * 6.28, 0);
    const glint = new THREE.Sprite(this.glintMat);
    glint.scale.setScalar(0.5);
    const grp = new THREE.Group();
    grp.add(mesh, glint);
    const y = o.y ?? this.ctx.groundAt(x, z, 1000) + 0.04;
    grp.position.set(x, y, z);
    glint.position.y = 0.35;
    this.scene.add(grp);
    const pk = { id, x, z, y, o, grp, mesh, glint, t: Math.random() * 6, taken: false, timer: 0, life: o.life ?? 0 };
    this.pickups.push(pk);
    return pk;
  }

  removePickup(pk) {
    this.scene.remove(pk.grp);
    const i = this.pickups.indexOf(pk);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  clearPickups(filter = null) { for (const pk of [...this.pickups]) if (!filter || filter(pk)) this.removePickup(pk); }

  _pickLabel(pk) {
    const id = pk.id, n = pk.o.n || 1;
    const name = MELEE[id]?.name || ITEMS[id]?.name || id;
    return n > 1 ? `${name} ×${n}` : name;
  }

  _updatePickups(dt, state) {
    const P = this.player;
    this.pickFocus = null;
    let bd = 1.8;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      if (pk.taken) {
        if (pk.o.respawn) { pk.timer -= dt; if (pk.timer <= 0) { pk.taken = false; pk.grp.visible = true; } }
        continue;
      }
      if (pk.life) { pk.life -= dt; if (pk.life <= 0) { this.removePickup(pk); continue; } }
      pk.mesh.position.y = 0.06 + Math.sin(pk.t * 2.2) * 0.03;
      if (!MELEE[pk.id]) pk.mesh.rotation.y += dt * 0.8;
      pk.glint.material.opacity = 0.5 + Math.sin(pk.t * 4) * 0.4;
      pk.glint.scale.setScalar(0.35 + Math.sin(pk.t * 4) * 0.12);
      if (state !== 'play') continue;
      const d = Math.hypot(pk.x - P.pos.x, pk.z - P.pos.z);
      if (d < bd && Math.abs(pk.y - P.pos.y) < 1.6) { bd = d; this.pickFocus = pk; }
    }
  }

  pickHit(input) {
    const hit = !!this.pickFocus && !this.atk && (input.hit('KeyF', 'KeyE') || input.padHit('a') || this.touchPick);
    this.touchPick = false;
    if (hit) { input.eat('a'); this.pick(this.pickFocus); }
    return hit;
  }

  pick(pk) {
    const id = pk.id, n = pk.o.n || 1, inv = this.inventory;
    if (MELEE[id]) {
      const def = MELEE[id];
      if (def.throw && this.melee?.id === id) {
        if (this.melee.n >= def.max) { this.hud.toast('NÃO CABE MAIS'); return false; }
        this.melee.n = Math.min(def.max, this.melee.n + n);
      } else {
        this._dropMelee();
        this.setMelee(id, { n, dur: pk.o.dur });
      }
      // arma de fogo volta para o coldre para usar a arma branca
      if (this.guns?.equipped && !def.throw) this.guns.equip(false);
      this.hud.toast(this.meleeName());
    } else {
      const def = ITEMS[id];
      const got = inv.add(id, n, pk.o.data || null);
      if (got <= 0) { this.hud.toast(def.stack ? 'INVENTÁRIO CHEIO' : 'VOCÊ JÁ TEM ' + def.name); return false; }
      if (def.kind === 'gun' && !this.guns?.equipped) { this.guns.equip(id); this.guns.teach(); }
      this.hud.toast(n > 1 ? `${def.name}  +${got}` : def.name);
    }
    GunAudio.pickup(this.audio);
    pk.o.onPick?.(id, pk);
    if (pk.o.respawn) { pk.taken = true; pk.timer = pk.o.respawn; pk.grp.visible = false; }
    else this.removePickup(pk);
    return true;
  }

  // ---------- quadro a quadro ----------
  // tudo que roda fora das telas de pausa: criaturas, projéteis, itens
  update(dt, state) {
    this.t += dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    const sdt = this.hitStop > 0 ? dt * 0.12 : dt;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt);
    this.hpShow = Math.max(0, this.hpShow - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.lastFight += dt;
    this.hurtT += dt;
    // vida volta devagar longe do perigo, só até 40
    if (!this.dead && this.hp < 40 && this.hurtT > 8) this.hp = Math.min(40, this.hp + dt * 3);
    const P = this.player;
    if (this.prevPos && dt > 0) {
      this.pvel = this.pvel || { x: 0, z: 0 };
      this.pvel.x = lerp(this.pvel.x, (P.pos.x - this.prevPos.x) / dt, 0.3);
      this.pvel.z = lerp(this.pvel.z, (P.pos.z - this.prevPos.z) / dt, 0.3);
    }
    this.prevPos = { x: P.pos.x, z: P.pos.z };
    const env = { player: P, combat: this, playerVel: this.pvel || { x: 0, z: 0 }, playerAlive: !this.dead && state !== 'dying', state };
    for (const e of [...this.enemies]) {
      if (e.removed) { this.remove(e); continue; }
      if (!e.external) e.update(sdt, env);
      if (!e.dead && !e.untargetable && !e.passive && !e.static && !e.friendly && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 14) this.lastFight = Math.min(this.lastFight, 2);
    }
    this._updateProjectiles(sdt);
    this._updatePickups(dt, state);
    if (this.boom) { this.boom.t -= dt; const b = this.boom; this.atmo?.light(b.p.x, b.p.y + 1, b.p.z, [2.4, 1.4, 0.5], 16, 10); if (b.t <= 0) this.boom = null; }
  }

  // depois do movimento do jogador: empurrão e esquiva
  afterPlayer(dt) {
    const P = this.player;
    let mx = 0, mz = 0;
    if (this.knock) {
      const k = this.knock;
      mx += k.x; mz += k.z;
      const f = Math.exp(-dt * 7);
      k.x *= f; k.z *= f;
      if (Math.hypot(k.x, k.z) < 0.1) this.knock = null;
    }
    if (this.dodge) {
      const D = this.dodge, sp = 10 * (1 - D.t / D.dur);
      mx += D.dx * sp; mz += D.dz * sp;
    }
    if (!mx && !mz) return;
    const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) * dt / 0.12));
    for (let i = 0; i < n; i++) {
      const ox = P.pos.x, oz = P.pos.z;
      P.pos.x += mx * dt / n; P.pos.z += mz * dt / n;
      this.ctx.collision.resolve(P.pos, P.radius, 1.7);
      const g = this.ctx.groundAt(P.pos.x, P.pos.z, P.pos.y);
      if (this.ctx.isDeepWater(P.pos.x, P.pos.z, g) || g > P.pos.y + 0.5) { P.pos.x = ox; P.pos.z = oz; break; }
      P.pos.y = Math.max(P.pos.y, g);
    }
    const b = this.ctx.playBounds;
    if (b) { P.pos.x = clamp(P.pos.x, b.x0, b.x1); P.pos.z = clamp(P.pos.z, b.z0, b.z1); }
    P.sync();
  }

  // tremor da câmera
  afterCamera() {
    if (this.shake <= 0) return;
    const s = this.shake * this.shake * 0.35;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.position.z += (Math.random() - 0.5) * s;
  }

  _screen(x, y, z, W, H) {
    const v = this._v.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1];
  }

  // ---------- HUD ----------
  drawHud(g, W, H, device, o = {}) {
    const k = H / 240, touch = device === 'touch';
    if (this.flash > 0) { g.globalAlpha = this.flash * 0.45; g.fillStyle = '#a00808'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (this.hp > 0 && this.hp < 35) {
      const a = (0.25 + Math.sin(this.t * 6) * 0.12) * (1 - this.hp / 35);
      const b = Math.round(14 * k);
      g.globalAlpha = a; g.fillStyle = '#8a0606';
      g.fillRect(0, 0, W, b); g.fillRect(0, H - b, W, b); g.fillRect(0, 0, b, H); g.fillRect(W - b, 0, b, H);
      g.globalAlpha = 1;
    }
    // vida e arma branca
    const showHp = this.hp < this.maxHp || this.hpShow > 0 || this.inFight || o.forceHp;
    const x = Math.round(8 * k), y = Math.round(touch ? 72 * k : H - 30 * k);
    if (showHp) {
      const bw = Math.round(64 * k), bh = Math.max(3, Math.round(4 * k)), f = this.hp / this.maxHp;
      drawText(g, 'VIDA', x, y - 10 * k, 9 * k, { color: '#a89878' });
      g.fillStyle = '#140c08'; g.fillRect(x - 1, y - 1, bw + 2, bh + 2);
      g.fillStyle = '#2a2018'; g.fillRect(x, y, bw, bh);
      g.fillStyle = f > 0.6 ? '#6aa84a' : f > 0.3 ? '#d8b040' : (Math.floor(this.t * 4) % 2 ? '#c83020' : '#f05030');
      g.fillRect(x, y, Math.round(bw * f), bh);
      const heals = this.inventory.count('cuca') + this.inventory.count('cha');
      // no toque o botão CURA fica no alto
      if (heals && this.hp < this.maxHp && !touch) drawText(g, (device === 'pad' ? '↑ ' : 'H ') + 'cura ×' + heals, x + bw + 5 * k, y - 4 * k, 9 * k, { color: '#c8b898' });
    }
    if (!this.guns?.equipped && (this.melee || this.inFight)) {
      const yy = touch ? y + 8 * k : y - (showHp ? 22 : 10) * k;
      const m = this.melee;
      drawText(g, this.meleeName(), x, yy, 10 * k, { color: '#e8d8b8' });
      if (m && !MELEE[m.id].throw && MELEE[m.id].dur) {
        const f = m.dur / MELEE[m.id].dur, bw = Math.round(40 * k), bh = Math.max(2, Math.round(2 * k));
        g.fillStyle = '#140c08'; g.fillRect(x - 1, Math.round(yy + 11 * k) - 1, bw + 2, bh + 2);
        g.fillStyle = f > 0.3 ? '#c8b080' : '#d05030'; g.fillRect(x, Math.round(yy + 11 * k), Math.round(bw * f), bh);
      }
    }
    // chefe
    const B = this.boss;
    if (B && !B.dead && !o.hideBoss) {
      const bw = Math.round(170 * k), bh = Math.max(3, Math.round(5 * k)), bx = Math.round(W / 2 - bw / 2), by = Math.round(48 * k);
      drawText(g, B.bossName || B.name || 'CRIATURA', W / 2, by - 12 * k, 11 * k, { align: 'center', color: '#e8c0b0' });
      g.fillStyle = '#140c08'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      g.fillStyle = '#3a1010'; g.fillRect(bx, by, bw, bh);
      g.fillStyle = B.shielded ? '#8090c0' : '#c02818'; g.fillRect(bx, by, Math.round(bw * clamp(B.hp / B.maxHp, 0, 1)), bh);
    }
    // PEGAR
    this.chip = null;
    const f = this.pickFocus;
    if (f && !o.noChip) {
      const s = this._screen(f.x, f.y + 0.55, f.z, W, H);
      if (s) {
        const name = this._pickLabel(f), size = Math.round(10 * k);
        if (touch) {
          const lbl = 'PEGAR ' + name;
          const sp = textSprite(lbl, Math.round(12 * k), FONT_UI, '#140c08', null, true);
          const w = Math.max(56 * k, sp.w + 16 * k), h = 18 * k, cx = Math.round(s[0] - w / 2), cy = Math.round(s[1] - h - 8 * k);
          g.globalAlpha = 0.85; g.fillStyle = '#f2c879'; g.fillRect(cx, cy, w, h); g.globalAlpha = 1;
          g.strokeStyle = '#140c08'; g.lineWidth = 1; g.strokeRect(cx + 0.5, cy + 0.5, w - 1, h - 1);
          drawText(g, lbl, cx + w / 2, cy + 3 * k, 12 * k, { align: 'center', color: '#140c08', shadow: null });
          this.chip = { x: cx, y: cy, w, h };
        } else {
          const key = device === 'pad' ? 'A' : 'F', label = 'PEGAR ' + name;
          const sp = textSprite(label, size, FONT_UI, '#f4ead2', '#140c08', true);
          const kw = 11 * k, w = kw + 4 * k + sp.w + 4 * k, h = 13 * k;
          const cx = Math.round(s[0] - w / 2), cy = Math.round(s[1] - h - 6 * k);
          panel(g, cx, cy, w, h, 0.7);
          g.fillStyle = device === 'pad' ? '#3c8a3c' : '#e9dcc0';
          g.fillRect(Math.round(cx + 2 * k), Math.round(cy + 2 * k), Math.round(kw - 2 * k), Math.round(h - 4 * k));
          drawText(g, key, cx + 2 * k + (kw - 2 * k) / 2, cy + 1.5 * k, size, { align: 'center', color: device === 'pad' ? '#f4ead2' : '#140c08', shadow: null });
          drawText(g, label, cx + kw + 3 * k, cy + 1 * k, size, { color: '#f4ead2' });
        }
      }
    }
  }
}
