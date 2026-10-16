import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, joint, mix3, lerp, clamp, wrapA, damp, TAU } from './shapes.js';
import { SFX, noise, tone, fall } from './sfx.js';
import { makeCanvas, canvasTex, processPixels } from '../../engine/textures.js';

// Morcegos. O morcego-vampiro (Desmodus) existe no RS e morde o gado de noite;
// estes são do tamanho de um cachorro, com 1,8 m de asa. Rodeiam o jogador no
// alto, guincham (o aviso) e mergulham numa curva até o peito para morder.
// A Rainha dos Morcegos é a mesma bicha 2,6x maior: rasantes longos, guincho
// sônico que derruba, chama a cria e, cansada, pendura-se no poleiro para
// tomar fôlego (aí apanha mais).
//
// Asas de juntas rígidas (ombro → cotovelo → pulso → quatro dedos); a membrana
// é refeita a cada quadro ligando as pontas dos ossos, com os dedos mais claros.

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// dedos 2..5: ângulo para trás em relação ao antebraço (aberto / dobrado)
const OPEN = [0.32, 0.72, 1.28, 1.86];
const SHUT = [2.6, 2.7, 2.8, 2.9];
const HANG = 0.38;   // do centro do corpo até as garras dos pés (pendurado)

// membrana: 0 S ombro, 1 H flanco, 2 cotovelo, 3 pulso, 4..7 pontas dos dedos 2..5,
// 8..10 recortes da borda de fuga (entre dedos 3-4, 4-5 e entre o dedo 5 e o flanco)
const MEMB = [0, 2, 3, 3, 4, 5, 3, 5, 8, 3, 8, 6, 3, 6, 9, 3, 9, 7, 2, 3, 7, 2, 7, 10, 2, 10, 1, 0, 2, 1];
// a da rainha é rasgada: falta um pedaço entre os dedos 3 e 4 da asa direita
const MEMB_TORN = [0, 2, 3, 3, 4, 5, 3, 5, 8, 3, 6, 9, 3, 9, 7, 2, 3, 7, 2, 7, 10, 2, 10, 1, 0, 2, 1];

const LOOK_BAT = {
  fur: [0.3, 0.25, 0.22], belly: [0.42, 0.36, 0.31], blotch: null,
  skin: [0.22, 0.17, 0.17], nose: [0.46, 0.3, 0.3], ear: [0.42, 0.26, 0.26], mouth: [0.4, 0.06, 0.06],
  memb: [0.13, 0.1, 0.1], bone: [0.4, 0.32, 0.29], claw: [0.12, 0.1, 0.09],
  eye: 0xff2a12, eyeR: 0.021, n: 7, fang: 0.04, earLen: 0.15, torn: false, ruff: false,
};
const LOOK_QUEEN = {
  fur: [0.15, 0.115, 0.11], belly: [0.23, 0.17, 0.16], blotch: [0.46, 0.11, 0.08],
  skin: [0.16, 0.11, 0.11], nose: [0.38, 0.2, 0.2], ear: [0.34, 0.15, 0.15], mouth: [0.45, 0.05, 0.04],
  memb: [0.09, 0.07, 0.07], bone: [0.3, 0.2, 0.18], claw: [0.08, 0.06, 0.06],
  eye: 0xff1c0a, eyeR: 0.029, n: 9, fang: 0.05, earLen: 0.16, torn: true, ruff: true,
  glowFur: 0x140505, glowMemb: 0x0b0303,   // tom avermelhado fraco: a silhueta aparece contra o céu escuro
};

// pelo: riscos curtos ao longo do corpo (cinza claro; a cor vem dos vértices)
let FUR = null;
function furTexture() {
  if (FUR) return FUR;
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32);
  let seed = 23;
  const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const v = new Float32Array(1024).fill(212);
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(R() * 32), y = Math.floor(R() * 32), L = 3 + Math.floor(R() * 5), k = (R() - 0.55) * 110;
    for (let j = 0; j < L; j++) v[((y + j) % 32) * 32 + x] += k * (1 - j / L);
  }
  for (let i = 0; i < 1024; i++) {
    const q = clamp(v[i] + (R() - 0.5) * 24, 80, 255);
    d.data[i * 4] = q; d.data[i * 4 + 1] = q * 0.97; d.data[i * 4 + 2] = q * 0.94; d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (FUR = canvasTex(processPixels(c), true));
}

// osso da asa deitado para fora (+x na asa esquerda, -x na direita)
function wingBone(len, r0, r1, s, col) {
  const g = limb(len, r0, r1, 4, () => col);
  g.rotateZ(s * Math.PI / 2);
  return g;
}

// ---------- sons próprios ----------
const ok = a => !!(a && a.ctx && a.white);
export const BSFX = {
  // mordida: estalo seco e um chupão molhado
  bite(a, d = 0) {
    if (!ok(a) || fall(d, 30) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 30);
    noise(a, t, 0.05, { type: 'highpass', f: 2600, vol: 0.22 * v });
    noise(a, t + 0.03, 0.18, { type: 'bandpass', f: 750, f1: 380, q: 2, vol: 0.15 * v, attack: 0.02 });
  },
  // guincho grave da rainha (o aviso do rasante)
  shriek(a, d = 0, p = 1) {
    if (!ok(a) || fall(d, 130) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 130);
    tone(a, t, 1.0, { f: 520 * p, fMid: 920 * p, f1: 360 * p, vol: 0.09 * v, attack: 0.05, vib: 70, vibF: 31 });
    tone(a, t, 1.0, { type: 'square', f: 255 * p, fMid: 430 * p, f1: 180 * p, vol: 0.04 * v, attack: 0.05, vib: 30 });
    noise(a, t, 0.9, { type: 'bandpass', f: 1400 * p, q: 2, vol: 0.1 * v, attack: 0.05 });
  },
  // guincho sônico: carrega subindo...
  charge(a, d = 0, dur = 1) {
    if (!ok(a) || fall(d, 120) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 120);
    tone(a, t, dur, { type: 'sine', f: 180, f1: 2600, vol: 0.07 * v, attack: dur * 0.6, vib: 40, vibF: 18 });
    tone(a, t, dur, { type: 'sawtooth', f: 90, f1: 1300, vol: 0.035 * v, attack: dur * 0.6 });
    noise(a, t, dur, { type: 'bandpass', f: 600, f1: 4200, q: 3, vol: 0.07 * v, attack: dur * 0.7 });
  },
  // ... e estoura
  blast(a, d = 0) {
    if (!ok(a) || fall(d, 140) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 140);
    tone(a, t, 0.9, { type: 'sine', f: 95, f1: 32, vol: 0.32 * v });
    noise(a, t, 0.8, { f: 1600, f1: 160, vol: 0.32 * v });
    tone(a, t, 0.55, { f: 3400, f1: 900, vol: 0.05 * v, vib: 300 });
  },
  // bater de asa pesado (a rainha)
  heavyFlap(a, d = 0) {
    if (!ok(a) || fall(d, 60) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 60);
    noise(a, t, 0.3, { f: 260, f1: 110, q: 0.7, vol: 0.3 * v, attack: 0.05 });
    tone(a, t, 0.26, { type: 'sine', f: 62, f1: 38, vol: 0.1 * v, attack: 0.03 });
  },
  // fôlego curto (a rainha cansada)
  pant(a, d = 0) {
    if (!ok(a) || fall(d, 40) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d, 40);
    noise(a, t, 0.32, { type: 'bandpass', f: 900, q: 1.2, vol: 0.08 * v, attack: 0.08 });
    tone(a, t, 0.3, { type: 'sawtooth', f: 140, f1: 105, vol: 0.025 * v, attack: 0.06 });
  },
};

// ---------- corpo comum ----------
class Bat extends Creature {
  constructor(deps, o, look, def) {
    super(deps, { ...def, ...o, resist: { ...def.resist, ...(o.resist || {}) } });
    this.deps = deps;
    this.L = look;
    this.scale = o.scale ?? def.scale;
    this.build(look);
    this.root.scale.setScalar(this.scale);
    this.P = { ph: Math.random() * TAU, flapW: 1, sweep: 0.3, elbow: -0.75, spread: 1, off: 0.12, twist: 0.05, mouth: 0.1, legX: 1.3, hang: 0, gnd: 0, pitch: 0, roll: 0, headX: 0, headY: 0, flinch: 0, lastCs: 0 };
    this.seed = Math.random() * 100;
    this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.perch = o.perch || null;
    this.hs = 0; this.yawRate = 0; this.pitchT = 0; this.rollT = 0;
    this.flapping = true; this.flapT = 1;
    this.liftT = 0;
    this._a = v3(); this._b = v3(); this._c = v3(); this._inv = new THREE.Matrix4();
  }

  build(L) {
    const fur = this.mat({ map: furTexture(), emissive: L.glowFur ?? 0 });
    const skin = this.mat({ map: null });
    const memb = this.mat({ map: null, side: THREE.DoubleSide, foliage: true, emissive: L.glowMemb ?? 0 });
    const eye = this.eyeMat = this.mat({ map: null, color: L.eye, lit: false, fog: false });
    const glow = this.mat({ map: null, color: L.eye, lit: false, fog: false, transparent: true, opacity: 0.45, depthWrite: false });
    glow.blending = THREE.AdditiveBlending;
    const n = L.n;
    const furCol = (t, a) => {
      const s = Math.sin(a);
      let c = s > 0.2 ? mix3(L.fur, L.belly, Math.min(1, (s - 0.2) * 1.4)) : L.fur;
      if (L.blotch) {
        const b = Math.sin(t * 13 + a * 2.3) * Math.cos(t * 7 - a * 3.1);
        if (b > 0.42) c = mix3(c, L.blotch, Math.min(1, (b - 0.42) * 3));
      }
      return c;
    };
    const B = this.bones = {};
    B.tilt = joint(this.root);
    B.body = joint(B.tilt);
    // tronco: peito largo, traseiro fino
    const torso = blob([[-0.22, 0], [-0.2, 0.06], [-0.12, 0.1], [-0.02, 0.125], [0.08, 0.13], [0.15, 0.11], [0.2, 0.07], [0.225, 0]], n, { sz: 0.88, col: furCol, uRep: 2, vRep: 2 });
    torso.rotateX(Math.PI / 2);
    B.torso = this.mesh(torso, fur);
    B.body.add(B.torso);
    // juba de pelo eriçado em volta do pescoço (a rainha)
    if (L.ruff) {
      const up = v3(0, 1, 0);
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU, sp = this.mesh(cone(0.085, 0.032, L.fur, mix3(L.fur, L.blotch, 0.5), 3), fur);
        sp.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.095 + 0.015, 0.13);
        sp.quaternion.setFromUnitVectors(up, v3(Math.cos(a) * 0.7, Math.sin(a) * 0.6 + 0.25, -1).normalize());
        B.body.add(sp);
      }
    }
    // cabeça: crânio redondo, focinho chato com a "folha" do nariz em U
    B.head = joint(B.body, 0, 0.04, 0.21);
    const skull = blob([[-0.07, 0], [-0.06, 0.045], [-0.025, 0.07], [0.02, 0.075], [0.06, 0.06], [0.09, 0.04], [0.1, 0]], n, { sz: 0.85, col: furCol });
    skull.rotateX(Math.PI / 2);
    B.head.add(this.mesh(skull, fur));
    const snout = blob([[0, 0.044], [0.025, 0.042], [0.042, 0.032], [0.048, 0]], n - 1, { sz: 0.72, col: (t, a) => (Math.sin(a) > 0.55 ? L.mouth : L.skin) });
    snout.rotateX(Math.PI / 2); snout.translate(0, -0.016, 0.072);
    B.head.add(this.mesh(snout, skin));
    const leaf = blob([[0, 0], [0.004, 0.03], [0.012, 0.022], [0.015, 0]], 6, { sz: 0.75, col: () => L.nose });
    leaf.rotateX(Math.PI / 2); leaf.translate(0, -0.006, 0.117);
    B.head.add(this.mesh(leaf, skin));
    // queixo
    B.jaw = joint(B.head, 0, -0.038, 0.05);
    const jaw = blob([[0, 0.036], [0.04, 0.032], [0.072, 0]], n - 2, { sz: 0.42, col: (t, a) => (Math.sin(a) < -0.2 ? L.mouth : L.skin) });
    jaw.rotateX(Math.PI / 2);
    B.jaw.add(this.mesh(jaw, skin));
    const toothA = [0.92, 0.9, 0.82], toothB = [1, 1, 0.96];
    for (const s of [-1, 1]) {
      // presas de navalha (de cima) e caninos pequenos (de baixo)
      const f = this.mesh(cone(L.fang, 0.009, toothA, toothB, 3), skin);
      f.rotation.x = Math.PI; f.position.set(s * 0.015, -0.034, 0.108);
      B.head.add(f);
      const lf = this.mesh(cone(0.02, 0.006, toothA, toothB, 3), skin);
      lf.position.set(s * 0.013, 0.004, 0.058);
      B.jaw.add(lf);
      // orelhas grandes (as da rainha rasgadas, uma sem a ponta)
      const el = L.earLen;
      let prof = [[0, 0.04], [0.04, 0.05], [0.09, 0.042], [0.13, 0.022], [el, 0]];
      if (L.torn) prof = s > 0 ? [[0, 0.04], [0.035, 0.05], [0.06, 0.028], [0.075, 0.048], [0.11, 0.036], [0.14, 0.014], [el, 0]] : [[0, 0.04], [0.04, 0.05], [0.08, 0.044], [0.1, 0.03], [0.104, 0]];
      const ear = this.mesh(blob(prof, 5, { sz: 0.3, col: (t, a) => (Math.sin(a) > 0.1 ? L.ear : L.skin) }), skin);
      ear.position.set(s * 0.042, 0.045, -0.008); ear.rotation.set(-0.28, s * 0.35, -s * 0.42);
      B.head.add(ear);
      (B.ears ||= []).push(ear);
      // olhos vermelhos (brilham no escuro)
      const r = L.eyeR;
      const e = this.mesh(blob([[-r, 0], [-r * 0.5, r * 0.85], [0, r], [r * 0.5, r * 0.85], [r, 0]], 5), eye);
      e.position.set(s * 0.045, 0.028, 0.07); e.rotation.z = Math.PI / 2;
      B.head.add(e);
      // brilho em volta do olho: só aparece de longe (dois pontos vermelhos no escuro)
      const R2 = r * 2.6, hm = this.mesh(blob([[-R2, 0], [-R2 * 0.5, R2 * 0.85], [0, R2], [R2 * 0.5, R2 * 0.85], [R2, 0]], 5), glow);
      hm.position.copy(e.position);
      B.head.add(hm);
      (B.halos ||= []).push(hm);
    }
    // asas: ombro (bate e varre) → cotovelo → pulso → dedos
    B.wings = [];
    const fingers = [0.3, 0.38, 0.32, 0.28], HUM = 0.2, FORE = 0.32;
    for (const s of [1, -1]) {
      const sh = joint(B.body, s * 0.075, 0.055, 0.11);
      sh.rotation.order = 'ZYX';
      sh.add(this.mesh(wingBone(HUM, 0.03, 0.02, s, L.skin), skin));
      const el = joint(sh, s * HUM, 0, 0);
      el.add(this.mesh(wingBone(FORE, 0.022, 0.015, s, L.bone), skin));
      const wr = joint(el, s * FORE, 0, 0);
      // polegar com garra, para a frente
      const th = this.mesh(cone(0.055, 0.012, L.bone, L.claw, 3), skin);
      th.rotation.x = Math.PI / 2 - 0.3; th.position.set(s * 0.008, 0.008, 0.01);
      wr.add(th);
      const dig = [], tips = [];
      fingers.forEach((len) => {
        const dj = joint(wr);
        dj.add(this.mesh(wingBone(len, 0.012, 0.005, s, L.bone), skin));
        dig.push(dj); tips.push(joint(dj, s * len, 0, 0));
      });
      const S = joint(B.body, s * 0.07, 0.045, 0.1), H = joint(B.body, s * 0.05, -0.005, -0.19);
      // membrana (refeita a cada quadro)
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(33), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(22), 2));
      const cl = [], near = mix3(L.memb, L.fur, 0.5);
      [near, near, L.bone, L.bone, L.bone, L.bone, L.bone, L.bone, L.memb, L.memb, L.memb].forEach((c, i) => {
        // pontas dos dedos um pouco mais escuras que o pulso
        const k = i >= 4 && i <= 7 ? 0.75 : 1;
        cl.push(c[0] * k, c[1] * k, c[2] * k);
      });
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      g.setIndex(L.torn && s < 0 ? MEMB_TORN : MEMB);
      const mm = this.mesh(g, memb);
      B.body.add(mm);
      B.wings.push({ s, sh, el, wr, dig, tips, S, H, geo: g, pts: Array.from({ length: 11 }, () => v3()) });
    }
    // pernas finas para trás, garras de pendurar
    B.legs = [];
    for (const s of [1, -1]) {
      const hip = joint(B.body, s * 0.055, -0.045, -0.17);
      hip.add(this.mesh(limb(0.1, 0.022, 0.015, 4, () => L.fur), fur));
      const knee = joint(hip, 0, -0.1, 0);
      knee.add(this.mesh(limb(0.085, 0.014, 0.01, 4, () => L.skin), skin));
      for (const x of [-0.009, 0, 0.009]) {
        const c = this.mesh(cone(0.035, 0.006, L.skin, L.claw, 3), skin);
        c.position.set(x, -0.088, 0); c.rotation.x = Math.PI + 0.6;
        knee.add(c);
      }
      B.legs.push({ hip, knee, s });
    }
    // a membrana vai até o tornozelo (asa larga perto do corpo)
    B.wings.forEach((W, i) => { W.H = joint(B.legs[i].knee, 0, -0.075, 0); });
    // esferas de acerto (generosas: ele voa)
    const W0 = B.wings[0], W1 = B.wings[1];
    this.spheres = [
      { bone: B.head, off: v3(0, 0, 0.03), r: 0.13, part: 'head' },
      { bone: B.body, off: v3(0, 0, 0), r: 0.26, part: 'body' },
      { bone: W0.el, off: v3(0.15, 0, -0.06), r: 0.22, part: 'wing' },
      { bone: W0.wr, off: v3(0.2, 0, -0.1), r: 0.24, part: 'wing' },
      { bone: W1.el, off: v3(-0.15, 0, -0.06), r: 0.22, part: 'wing' },
      { bone: W1.wr, off: v3(-0.2, 0, -0.1), r: 0.24, part: 'wing' },
    ];
  }

  // sem y: entra no ar, na altura de voo. Pendurado no poleiro, fica lá (só vira)
  place(x, z, heading = 0, y = null) {
    if (this.hung && this.state === 'perch') { this.heading = heading + Math.PI; this.sync(); return this; }
    if (y === null) y = this.ctx.groundAt(x, z, 1000) + (this.alt ?? 5);
    return super.place(x, z, heading, y);
  }

  // pendura no poleiro (de cabeça para baixo, a barriga virada para heading)
  hang(heading = this.heading) {
    const p = this.perch;
    this.hung = false;
    super.place(p.x, p.z, heading + Math.PI, p.y - HANG * this.scale);
    this.hung = true;
    this.vel.set(0, 0, 0); this.hs = 0;
    this.P.hang = 1; this.P.spread = 0; this.P.flapW = 0; this.P.sweep = 1.25; this.P.elbow = -2.6; this.P.off = -0.6; this.P.legX = Math.PI / 2;
  }

  // distância até a cabeça do jogador (para o volume)
  _dP(env) { const P = env.player.pos; return Math.hypot(this.pos.x - P.x, this.pos.y - P.y - 1.5, this.pos.z - P.z); }

  // ---------- voo ----------
  // voa para (tx, ty, tz); turn = curva máxima em rad/s
  fly(dt, tx, ty, tz, speed, turn = 2.5, climb = 1.5, collide = true) {
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z), h0 = this.heading;
    this.heading += clamp(wrapA(want - this.heading), -turn * dt, turn * dt);
    this.yawRate = wrapA(this.heading - h0) / Math.max(dt, 1e-4);
    this.hs = damp(this.hs, speed, 2.2, dt);
    this.vel.x = Math.sin(this.heading) * this.hs; this.vel.z = Math.cos(this.heading) * this.hs;
    this.vel.y = damp(this.vel.y, clamp((ty - this.pos.y) * climb, -5, 5), 3, dt);
    this.pitchT = clamp(-this.vel.y * 0.12, -0.45, 0.55);
    this.rollT = clamp(-this.yawRate * this.hs * 0.07, -0.75, 0.75);
    this.move(dt, collide);
  }

  // para no ar (bate as asas no lugar) olhando para ang
  hover(dt, ang, vy = 0, k = 4) {
    this.flapping = true;
    this.hs = damp(this.hs, 0, k, dt);
    this.face(dt, ang, 6);
    this.yawRate = 0;
    this.vel.x = Math.sin(this.heading) * this.hs; this.vel.z = Math.cos(this.heading) * this.hs;
    this.vel.y = damp(this.vel.y, vy, 4, dt);
    this.pitchT = -0.55; this.rollT = 0;
    this.move(dt);
  }

  // integra a velocidade: bate nos prédios, nunca atravessa o chão
  move(dt, collide = true) {
    this.step(dt, this.vel.x, this.vel.z, collide);
    this.pos.y += this.vel.y * dt;
    const g = this.ground() + this.clear;
    if (this.pos.y < g) { this.pos.y = g; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.stuck) { this.orbit *= -1; this.liftT = 3; }
  }

  // alvo na volta em torno de (cx, cz)
  orbitPoint(cx, cz, R, lead = 0.6) {
    const a = Math.atan2(this.pos.x - cx, this.pos.z - cz) + this.orbit * lead;
    return [cx + Math.sin(a) * R, cz + Math.cos(a) * R];
  }

  // bate as asas por um tempo, plana por outro
  flapBursts(dt, on = [0.9, 0.8], off = [1.2, 1.6]) {
    this.flapT -= dt;
    if (this.flapT <= 0) {
      this.flapping = !this.flapping;
      const r = this.flapping ? on : off;
      this.flapT = r[0] + Math.random() * r[1];
    }
    if (this.vel.y > 1.2 || this.hs < 3) this.flapping = true;
  }

  // mergulho em curva (Bézier) até o peito do jogador; o fim da curva acompanha o jogador
  swoopStep(dt, env, S) {
    const P = env.player.pos, a = S.p0, b = this._b, c = this._c;
    b.set(P.x, P.y + S.chest, P.z);
    let dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    b.x += dx * S.over; b.z += dz * S.over;
    const gb = this.ctx.groundAt(b.x, b.z, b.y) + S.clear;
    if (b.y < gb) b.y = gb;
    c.set((a.x + b.x) / 2 - dz * S.side * L * S.bulge, b.y + 0.3 + (a.y - b.y) * 0.15, (a.z + b.z) / 2 + dx * S.side * L * S.bulge);
    const len = a.distanceTo(c) + c.distanceTo(b);
    S.t = Math.min(1, S.t + dt * S.speed / Math.max(1, len));
    const t = S.t, u = 1 - t;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
    const g = this.ground() + S.clear * 0.8;
    if (this.pos.y < g) this.pos.y = g;
    const vx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x), vy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y), vz = 2 * u * (c.z - a.z) + 2 * t * (b.z - c.z);
    const h0 = this.heading;
    this.heading += wrapA(Math.atan2(vx, vz) - this.heading) * Math.min(1, dt * 14);
    this.yawRate = wrapA(this.heading - h0) / Math.max(dt, 1e-4);
    const hl = Math.hypot(vx, vz) || 1e-3, vl = Math.hypot(hl, vy) || 1e-3;
    this.vel.set(vx / vl * S.speed, vy / vl * S.speed, vz / vl * S.speed);
    this.hs = hl / vl * S.speed;
    this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.pitchT = clamp(Math.atan2(-vy, hl) * 0.8, -0.5, 0.9);
    this.rollT = clamp(-this.yawRate * this.hs * 0.05, -0.7, 0.7);
    return S.t >= 1;
  }

  // estado trocado por fora (ex.: c.state = 'swoop'): prepara o que o golpe precisa
  enterState() {
    if (this.state === this._ps) return;
    this._ps = this.state;
    if (this.sw?.fresh) { this.sw.fresh = false; return; }
    const s = this.state;
    if (s === 'swoop' || s === 'dive' || (s === 'rasante' && !this.sw?.p0)) this.sw = this.swoopCfg();
    else if (s === 'sonic') this.sw = { phase: 'approach', t: 0 };
    else if (s === 'summon') this.sw = { done: false };
    else if (s === 'land' && !this.landTo) this.state = 'toPerch';
    if (this.sw) this.sw.fresh = false;
  }

  // distância do corpo até o peito do jogador
  chestDist(env, h = 1.15) {
    const P = env.player.pos;
    return Math.hypot(this.pos.x - P.x, this.pos.y - P.y - h, this.pos.z - P.z);
  }

  // ---------- morte: cai rodopiando até o chão ----------
  onDeath(info) {
    const d = info.dir || this.deathDir || v3();
    this.dv = { x: this.vel.x * 0.4 + d.x * 2, y: Math.min(this.vel.y, 1.5), z: this.vel.z * 0.4 + d.z * 2, spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4), roll: this.P.roll, landed: false, tl: 0 };
    this.P.hang = 0;
    // o brilho dos olhos apaga
    this.eyeMat.uniforms.uColor.value.setRGB(0.18, 0.03, 0.02);
    this.eyeMat.userData.emissive?.setRGB(0, 0, 0);
    this.deathCry?.();
  }

  dying(dt) {
    const D = this.dv, t = this.deadT, rest = 0.12 * this.scale;
    if (!D.landed) {
      D.y -= 13 * dt;
      const k = Math.exp(-dt * 0.8); D.x *= k; D.z *= k;
      this.step(dt, D.x, D.z, true);
      this.pos.y += D.y * dt;
      this.heading += D.spin * dt;
      D.roll += D.spin * 0.45 * dt;
      const g = this.ground();
      if (this.pos.y <= g + rest) {
        this.pos.y = g + rest; D.landed = true; D.tl = t;
        // de costas no chão
        D.roll = Math.round((D.roll - Math.PI) / TAU) * TAU + Math.PI;
        this.onLand?.();
        for (let i = 0; i < 8; i++) this.effects.spawn({ p: v3(this.pos.x, g + 0.05, this.pos.z), v: v3((Math.random() - 0.5) * 2.5, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 2.5), life: 0.7, s0: 0.12 * this.scale, s1: 0.3 * this.scale, color: [0.2, 0.18, 0.15], drag: 2.5 });
      }
    } else {
      const lt = t - D.tl;
      this.pos.y = this.ground() + rest - Math.max(0, lt - this.bodyTime) * 0.3;
      if (lt > this.bodyTime + 1.5) { this.root.visible = false; this.removed = true; }
    }
  }

  // ---------- animação ----------
  animate(dt, env) {
    const P = this.P, B = this.bones, s = this.state;
    let flapOn = this.flapping ? 1 : 0, hz = this.flapHz, amp = 0.85;
    let sweep = 0.3, elbow = -0.75, spread = 1, off = 0.12, twist = 0.05, mouth = 0.08, legX = 1.3, hang = 0, gnd = 0;
    const sw = this.sw;
    if (s === 'perch' || (s === 'rest' && this.perch) || (s === 'land' && this.perch)) {
      hang = 1; flapOn = 0; sweep = 1.25; elbow = -2.6; spread = 0; off = -0.8; legX = Math.PI / 2;
      if (s === 'rest') mouth = 0.55 + Math.sin(this.st * 9) * 0.35;
    } else if (s === 'rest' || s === 'land') {
      gnd = 1; flapOn = 0; sweep = 0.95; elbow = -1.9; spread = 0.25; off = -0.42; legX = 0.9;
      if (s === 'rest') mouth = 0.55 + Math.sin(this.st * 9) * 0.35;
    } else if (s === 'warn' || s === 'dwarn' || s === 'summon' || s === 'intro') {
      flapOn = 1; hz *= 1.3; off = 0.32; amp = 0.95; mouth = 1; legX = 0.9;
    } else if (s === 'sonic') {
      flapOn = 1; mouth = 1;
      if (sw && sw.phase !== 'approach') { hz *= 3; amp = 0.12; off = 0.1; sweep = -0.3; elbow = -0.6; legX = 0.8; }
    } else if (s === 'swoop' || s === 'dive') {
      if (sw && sw.t > 0.78) { flapOn = 0; sweep = -0.1; off = 0.45; mouth = 1; legX = 0.35; }
      else { flapOn = 0; sweep = 0.85; elbow = -0.55; spread = 0.55; off = 0.28; mouth = 0.6; twist = -0.1; }
    } else if (s === 'rasante') {
      flapOn = 0; sweep = 0.2; off = 0.08; mouth = 1; legX = 0.5;
    } else if (s === 'hurt') {
      flapOn = 1; hz *= 1.5; mouth = 0.9; legX = 0.8;
    } else if (s === 'drop' || s === 'takeoff') {
      if (this.st < 0.25) { flapOn = 0; spread = 0.4; sweep = 0.8; elbow = -1.6; off = 0.5; }
      else { flapOn = 1; hz *= 1.3; }
    } else if (s === 'dead') {
      const D = this.dv || {};
      flapOn = 0; spread = 0.8; sweep = 0.45; elbow = -0.95; legX = 0.6; mouth = 0.9;
      off = D.landed ? 0.02 : -0.15 + Math.sin(this.deadT * 19) * 0.5;
      this.pitchT = D.landed ? 0 : 0.7;
      if (D.roll !== undefined) P.roll = D.landed ? damp(P.roll, D.roll, 10, dt) : D.roll;
    }
    const k = Math.min(1, dt * 7);
    P.sweep = lerp(P.sweep, sweep, k); P.elbow = lerp(P.elbow, elbow, k); P.spread = lerp(P.spread, spread, k);
    P.off = lerp(P.off, off, k); P.twist = lerp(P.twist, twist, k); P.mouth = lerp(P.mouth, mouth, Math.min(1, dt * 12));
    P.legX = lerp(P.legX, legX, k);
    P.hang = damp(P.hang, hang, s === 'land' ? 5 : 9, dt); P.gnd = damp(P.gnd, gnd, 5, dt);
    P.flapW = lerp(P.flapW, flapOn, Math.min(1, dt * 5));
    P.pitch = damp(P.pitch, this.pitchT, 6, dt);
    if (s !== 'dead') P.roll = damp(P.roll, this.rollT, 5, dt);
    P.flinch = Math.max(0, P.flinch - dt * 3);
    P.ph += dt * hz * TAU * (0.3 + 0.7 * P.flapW);
    const sn = Math.sin(P.ph), cs = Math.cos(P.ph), fw = P.flapW;
    // subida dobra o cotovelo e os dedos; descida abre tudo e as pontas ficam para trás
    const fold = fw * Math.max(0, cs);
    const glide = (1 - fw) * Math.sin(this.st * 1.7 + this.seed) * 0.06;
    const flap = P.off + fw * amp * sn + glide + P.flinch * 0.4;
    for (const W of B.wings) {
      const w = W.s;
      W.sh.rotation.set(P.twist + 0.2 * fw * cs, w * (P.sweep + 0.2 * fold), w * flap);
      W.el.rotation.y = w * (P.elbow + 0.7 * fold);
      W.wr.rotation.set(0, w * 0.15 * fold, w * -0.4 * cs * fw);
      const sp = clamp(P.spread - 0.4 * fold, 0, 1);
      for (let i = 0; i < 4; i++) W.dig[i].rotation.y = w * lerp(SHUT[i], OPEN[i], sp);
    }
    // corpo sobe quando as asas descem; pendurado ou no chão, respira
    const breath = s === 'rest' ? Math.sin(this.st * 9) * 0.05 : Math.sin(this.st * 2.2) * 0.015;
    B.body.position.y = -0.035 * sn * fw * (1 - P.hang);
    B.torso.scale.set(1 + breath, 1 + breath, 1);
    B.tilt.rotation.x = lerp(lerp(P.pitch, -0.35, P.gnd), Math.PI / 2, P.hang);
    B.tilt.rotation.z = P.roll * (1 - P.hang);
    // cabeça: encara o jogador
    let hy = 0, hx = 0;
    if (env && s !== 'dead') {
      const pl = env.player.pos;
      const dh = Math.hypot(pl.x - this.pos.x, pl.z - this.pos.z);
      if (P.hang > 0.5) { hx = 0.85; hy = 0; }
      else {
        hy = clamp(wrapA(Math.atan2(pl.x - this.pos.x, pl.z - this.pos.z) - this.heading), -1.0, 1.0);
        hx = clamp(Math.atan2(this.pos.y - pl.y - 1.2, dh) - P.pitch, -0.6, 0.8);
      }
    }
    if (s === 'dead') hx = -0.5;
    // brilho dos olhos cresce com a distância (some de perto e na morte)
    if (env) {
      const pl = env.player.pos, dd = Math.hypot(pl.x - this.pos.x, pl.y + 1.5 - this.pos.y, pl.z - this.pos.z);
      const hk = s === 'dead' ? 0 : clamp((dd - 4) / 8, 0, 1);
      for (const h of B.halos) { h.visible = hk > 0.02; h.scale.setScalar((0.3 + hk * clamp(dd / 14, 0.5, 1.8)) * this.haloK); }
    }
    P.headY = damp(P.headY, hy, 6, dt); P.headX = damp(P.headX, hx, 6, dt);
    B.head.rotation.set(P.headX - P.mouth * 0.25 - P.flinch * 0.4, P.headY, 0);
    B.jaw.rotation.x = P.mouth * 0.75;
    // orelhas tremem
    const tw = Math.sin(this.st * 3 + this.seed) > 0.97 ? 0.25 : 0;
    B.ears.forEach((e, i) => { e.rotation.x = -0.28 + tw * (i ? 1 : -1); });
    // pernas para trás; no bote vêm para a frente
    for (const Lg of B.legs) {
      Lg.hip.rotation.x = P.legX + Math.sin(P.ph + Lg.s) * 0.08 * fw;
      Lg.hip.rotation.z = Lg.s * 0.15;
      Lg.knee.rotation.x = P.hang > 0.5 ? 0 : 0.35;
    }
    // som da batida (no alto da asa)
    if (fw > 0.5 && P.lastCs > 0 && cs <= 0) this.onStroke?.(env);
    P.lastCs = cs;
    this.membranes();
  }

  // liga as pontas dos ossos (no espaço do corpo)
  membranes() {
    const B = this.bones;
    B.body.updateMatrixWorld(true);
    const inv = this._inv.copy(B.body.matrixWorld).invert();
    for (const W of B.wings) {
      const p = W.pts, src = [W.S, W.H, W.el, W.wr, W.tips[0], W.tips[1], W.tips[2], W.tips[3]];
      for (let i = 0; i < 8; i++) p[i].setFromMatrixPosition(src[i].matrixWorld).applyMatrix4(inv);
      // recortes da borda de fuga, puxados para o pulso / cotovelo
      p[8].copy(p[5]).add(p[6]).multiplyScalar(0.5).lerp(p[3], 0.3);
      p[9].copy(p[6]).add(p[7]).multiplyScalar(0.5).lerp(p[3], 0.28);
      p[10].copy(p[7]).add(p[1]).multiplyScalar(0.5).lerp(p[2], 0.3);
      const a = W.geo.attributes.position;
      for (let i = 0; i < 11; i++) a.setXYZ(i, p[i].x, p[i].y, p[i].z);
      a.needsUpdate = true;
      W.geo.computeVertexNormals();
    }
  }
}

// ---------- o morcego-vampiro gigante ----------
// opções: { perch: {x,y,z} (começa pendurado), wakeDist, scale, state, hp }
export class GiantBat extends Bat {
  constructor(deps, o = {}) {
    super(deps, o, LOOK_BAT, { name: 'MORCEGO VAMPIRO', hp: 2, radius: 0.45, height: 0.32, hitY0: -0.32, flying: true, death: 'fall', resist: { light: 0.5, dart: 0.3 }, scale: 0.92 + Math.random() * 0.16 });
    this.flapHz = 2.7;
    this.haloK = 1;
    this.clear = 0.45;
    this.bodyTime = 4;
    this.R = 8.5 + Math.random() * 3.5;
    this.alt = 4.8 + Math.random() * 1.2;
    this.wakeDist = o.wakeDist ?? 15;
    this.atkCD = 2 + Math.random() * 3;
    this.sndT = 1 + Math.random() * 3;
    this.scared = 0;
    this.queen = o.queen || null;
    this.state = o.state || (this.perch ? 'perch' : 'circle');
    if (this.perch) this.hang(o.heading ?? 0);
  }

  swoopCfg() { return { p0: this.pos.clone(), side: this.orbit, t: 0, speed: 11.5, chest: 1.15, over: 0.4, bulge: 0.22, clear: 0.45, bit: false, fresh: true }; }

  _attackers(C) {
    let n = 0;
    for (const e of C.enemies) if (e !== this && e instanceof GiantBat && !e.dead && (e.state === 'warn' || e.state === 'swoop')) n++;
    return n;
  }

  think(dt, env) {
    this.enterState();
    const C = env.combat, A = this.audio, P = env.player.pos;
    const { d, ang } = this.toPlayer(env);
    const dP = this._dP(env);
    this.atkCD -= dt; this.scared = Math.max(0, this.scared - dt); this.liftT = Math.max(0, this.liftT - dt);
    if (this.state !== 'perch') {
      this.sndT -= dt;
      if (this.sndT <= 0) { this.sndT = 3 + Math.random() * 5; SFX.screech(A, dP, 0.9 + Math.random() * 0.3); }
    }
    // a rainha morreu: a cria se espalha
    if (this.queen?.dead && this.state !== 'flee' && this.state !== 'perch') { this.state = 'flee'; this.st = 0; }
    const floor = Math.max(this.ground(), P.y);
    switch (this.state) {
      case 'perch': {
        // pendurado; acorda quando o jogador chega perto (ou leva um tiro)
        this.vel.set(0, 0, 0); this.hs = 0;
        this.face(dt, ang + Math.PI, 1.5);
        if (env.playerAlive && Math.hypot(d, this.pos.y - P.y) < this.wakeDist) { this.state = 'drop'; this.st = 0; SFX.screech(A, dP, 0.8); }
        return;
      }
      case 'drop': {
        // solta do poleiro, cai um pouco e abre as asas
        this.flapping = this.st > 0.25;
        this.vel.y = this.st < 0.35 ? this.vel.y - 9.8 * dt : damp(this.vel.y, 2, 4, dt);
        this.hs = damp(this.hs, 5, 2, dt);
        this.vel.x = Math.sin(this.heading) * this.hs; this.vel.z = Math.cos(this.heading) * this.hs;
        this.pitchT = this.st < 0.35 ? 0.6 : -0.2; this.rollT = 0;
        this.move(dt, false);
        if (this.st > 0.9) { this.state = 'circle'; this.st = 0; this.atkCD = 1.5 + Math.random() * 2; }
        break;
      }
      case 'circle': {
        if (!env.playerAlive) { this.state = 'idle'; this.st = 0; break; }
        this.flapBursts(dt);
        const R = clamp(this.R + Math.sin(this.st * 0.4 + this.seed) * 2, 8, 14) + (this.scared ? 6 : 0);
        const alt = clamp(this.alt + Math.sin(this.st * 0.5 + this.seed * 2), 4, 7) + (this.scared ? 2.5 : 0) + (this.liftT > 0 ? 3 : 0);
        if (d > 26) this.fly(dt, P.x, floor + alt, P.z, 8.5, 2.2);
        else {
          const [tx, tz] = this.orbitPoint(P.x, P.z, R);
          this.fly(dt, tx, floor + alt, tz, 6.8, 2.4);
        }
        // mergulho: no máximo dois ao mesmo tempo
        if (this.atkCD <= 0 && d < 20 && d > 3 && !this.scared && this._attackers(C) < 2) {
          this.state = 'warn'; this.st = 0;
          SFX.screech(A, dP, 0.75);
        }
        break;
      }
      case 'warn': {
        // freia no ar, encara e guincha (o aviso)
        this.hover(dt, ang, 0.6);
        if (this.st > 0.6) {
          this.sw = this.swoopCfg();
          this.state = 'swoop'; this.st = 0;
          SFX.flap(A, dP, 1.2);
        }
        break;
      }
      case 'swoop': {
        const S = this.sw;
        const done = this.swoopStep(dt, env, S);
        if (!S.bit && env.playerAlive && this.chestDist(env, S.chest) < 0.8 * this.scale) {
          S.bit = true;
          const dx = P.x - this.pos.x, dz = P.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
          if (C.hurt(8, dx / l, dz / l, { knock: 2.2 })) { BSFX.bite(A, 0); SFX.screech(A, 1, 1.15); }
        }
        if (done) {
          this.state = 'climb'; this.st = 0;
          this.vel.y = Math.max(this.vel.y, 1.5);
        }
        break;
      }
      case 'climb': {
        // passa e sobe de novo
        this.flapping = true;
        this.fly(dt, this.pos.x + Math.sin(this.heading) * 10, floor + this.alt, this.pos.z + Math.cos(this.heading) * 10, 7.5, 1.4, 1.3);
        if (this.st > 1.3) { this.state = 'circle'; this.st = 0; this.atkCD = 3.5 + Math.random() * 3.5; }
        break;
      }
      case 'hurt': {
        // recua batendo as asas (não cai do céu)
        this.flapping = true;
        const f = Math.exp(-dt * 2.5); this.vel.x *= f; this.vel.z *= f;
        this.vel.y = damp(this.vel.y, 1.2, 3, dt);
        this.hs = Math.hypot(this.vel.x, this.vel.z);
        this.face(dt, ang, 4);
        this.pitchT = -0.5; this.rollT = 0;
        this.move(dt);
        if (this.st > 0.7) { this.state = 'circle'; this.st = 0; this.atkCD = Math.max(this.atkCD, 1.2 + Math.random()); }
        break;
      }
      case 'flee': {
        // foge para longe e some no escuro
        this.flapping = true;
        this.fly(dt, this.pos.x - Math.sin(ang) * 20, floor + 14, this.pos.z - Math.cos(ang) * 20, 9, 2.5, 1, false);
        if (this.st > 6 || d > 50) { this.root.visible = false; this.removed = true; }
        break;
      }
      default: { // idle: jogador caído, ronda alto
        this.flapBursts(dt);
        const [tx, tz] = this.orbitPoint(P.x, P.z, 12);
        this.fly(dt, tx, floor + 8, tz, 6, 2);
        if (env.playerAlive) { this.state = 'circle'; this.st = 0; this.atkCD = 2; }
      }
    }
  }

  onStroke(env) {
    if (!env) return;
    const d = this._dP(env);
    if (d < 24 && Math.random() < 0.5) SFX.flap(this.audio, d, 0.9);
  }

  onHurt(dmg, info) {
    // a luz do lampião espanta (vem aos poucos, quadro a quadro)
    if (info.beam) {
      this.scared = 2.5;
      if (this.state === 'warn' || this.state === 'swoop' || this.state === 'perch') { this.state = 'hurt'; this.st = 0; this.vel.y = 2; }
      return;
    }
    SFX.screech(this.audio, 6, 1.25);
    if (this.state === 'perch') this.P.hang = 0.9;
    const d = info.dir || v3();
    this.vel.set(d.x * 5, 2.5, d.z * 5);
    this.state = 'hurt'; this.st = 0;
    this.atkCD = Math.max(this.atkCD, 1.5);
  }

  deathCry() { SFX.screech(this.audio, 5, 0.7); }
  onLand() { SFX.flap(this.audio, 8, 1.2); }
}

// ---------- a Rainha dos Morcegos (chefe) ----------
// opções: { perch: {x,y,z} (poleiro, ex. torre da igreja), arena: {x,z,r},
//           asleep (começa pendurada no poleiro), wakeDist, hp }
export class BatQueen extends Bat {
  constructor(deps, o = {}) {
    super(deps, o, LOOK_QUEEN, { name: 'RAINHA DOS MORCEGOS', hp: 45, radius: 1.0, height: 0.85, hitY0: -0.85, flying: true, death: 'fall', blood: [0.38, 0.03, 0.03], resist: { light: 0.5, dart: 0.15 }, scale: 2.6 });
    this.bossName = 'A RAINHA DOS MORCEGOS';
    this.heavy = true;
    this.flapHz = 1.1;
    this.haloK = 0.22;
    this.clear = 1.1;
    this.bodyTime = 8;
    this.R = 13; this.alt = 9.5;
    this.arena = o.arena || (this.perch ? { x: this.perch.x, z: this.perch.z, r: 30 } : null);
    this.wakeDist = o.wakeDist ?? 25;
    this.atkCD = 2.5; this.summonCD = 5; this.restCD = 0; this.cryT = 0; this.lastAtk = null; this.wasLow = false;
    this.state = o.state || (o.asleep && this.perch ? 'perch' : 'intro');
    if (this.state === 'perch') this.hang(o.heading ?? 0);
  }

  place(x, z, heading = 0, y = null) {
    super.place(x, z, heading, y);
    if (!this.arena) this.arena = { x, z, r: 32 };
    return this;
  }

  // fica dentro da arena
  inArena(x, z, m = 2) {
    const A = this.arena;
    if (!A) return [x, z];
    const dx = x - A.x, dz = z - A.z, L = Math.hypot(dx, dz), r = A.r - m;
    return L > r ? [A.x + dx / L * r, A.z + dz / L * r] : [x, z];
  }

  swoopCfg() { return { p0: this.pos.clone(), side: this.orbit, t: 0, speed: 15, chest: 1.25, over: 1.5, bulge: 0.12, clear: 1.1, bit: false, fresh: true }; }

  bats(C) { let n = 0; for (const e of C.enemies) if (e instanceof GiantBat && !e.dead) n++; return n; }

  // descansada mais vulnerável
  damage(amount, info = {}) {
    return super.damage(this.state === 'rest' ? amount * 1.5 : amount, info);
  }

  // escolhe o próximo golpe
  choose(env) {
    const C = env.combat, { d } = this.toPlayer(env);
    const low = this.hp < this.maxHp * 0.4;
    if (low && this.restCD <= 0 && (!this.wasLow || Math.random() < 0.45)) {
      this.wasLow = true;
      this.state = 'toPerch'; this.st = 0;
      return;
    }
    const opts = [['dive', 1.4], ['sonic', d < 15 ? 1.2 : 0.3]];
    const nb = this.bats(C);
    if (this.summonCD <= 0 && nb < 4) opts.push(['summon', nb < 2 ? 1.8 : 0.5]);
    for (const o of opts) if (o[0] === this.lastAtk) o[1] *= 0.35;
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), pick = opts[0][0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
    this.lastAtk = pick;
    this.st = 0;
    if (pick === 'dive') { this.state = 'dwarn'; BSFX.shriek(this.audio, this._dP(env), 0.8); }
    else if (pick === 'sonic') { this.state = 'sonic'; this.sw = { phase: 'approach', t: 0, fresh: true }; }
    else { this.state = 'summon'; this.sw = { done: false, fresh: true }; SFX.screech(this.audio, this._dP(env), 0.6); }
  }

  think(dt, env) {
    this.enterState();
    const C = env.combat, A = this.audio, P = env.player.pos;
    const { d, ang } = this.toPlayer(env);
    const dP = this._dP(env);
    this.atkCD -= dt; this.summonCD -= dt; this.restCD -= dt; this.cryT -= dt; this.liftT = Math.max(0, this.liftT - dt);
    const floor = Math.max(this.ground(), P.y);
    if (this.state !== 'perch' && this.state !== 'rest' && !C.boss) C.boss = this;
    switch (this.state) {
      case 'perch': {
        this.vel.set(0, 0, 0); this.hs = 0;
        this.face(dt, ang + Math.PI, 1);
        if (env.playerAlive && Math.hypot(d, this.pos.y - P.y) < this.wakeDist) { this.state = 'takeoff'; this.st = 0; BSFX.shriek(A, dP, 0.7); }
        break;
      }
      case 'intro': {
        // aparece guinchando
        this.hover(dt, ang, 0);
        if (!this.introCry) { this.introCry = true; BSFX.shriek(A, dP, 0.75); }
        if (this.st > 1.6) { this.state = 'circle'; this.st = 0; }
        break;
      }
      case 'circle': {
        if (!env.playerAlive) { this.flapBursts(dt, [1.6, 0.6], [1.2, 1]); const [tx, tz] = this.inArena(...this.orbitPoint(P.x, P.z, 16)); this.fly(dt, tx, floor + 13, tz, 6, 1.2, 1); break; }
        this.flapBursts(dt, [1.5, 0.8], [1.1, 1.0]);
        const R = this.R + Math.sin(this.st * 0.3 + this.seed) * 3;
        const alt = this.alt + Math.sin(this.st * 0.45) * 1.5 + (this.liftT > 0 ? 3 : 0);
        const [tx, tz] = this.inArena(...this.orbitPoint(P.x, P.z, R, 0.5));
        this.fly(dt, tx, floor + alt, tz, 8, 1.4, 1.0);
        if (this.atkCD <= 0) this.choose(env);
        break;
      }
      case 'dwarn': {
        // aviso do rasante: para no ar, abre as asas e guincha grave
        this.hover(dt, ang, 0.3, 5);
        if (this.st > 0.8) {
          this.sw = this.swoopCfg();
          this.state = 'dive'; this.st = 0;
          BSFX.heavyFlap(A, dP);
        }
        break;
      }
      case 'dive': {
        const S = this.sw;
        const done = this.swoopStep(dt, env, S);
        this._ram(env, S);
        if (done) { this.state = 'rasante'; this.st = 0; }
        break;
      }
      case 'rasante': {
        // continua rente ao chão um trecho antes de subir
        const S = this.sw;
        this.hs = damp(this.hs, 13, 2, dt);
        this.vel.x = Math.sin(this.heading) * this.hs; this.vel.z = Math.cos(this.heading) * this.hs;
        this.vel.y = damp(this.vel.y, 0, 6, dt);
        this.pitchT = 0; this.rollT = 0;
        this.move(dt);
        this._ram(env, S);
        if (this.st > 0.65) { this.state = 'climb'; this.st = 0; }
        break;
      }
      case 'climb': {
        this.flapping = true;
        this.fly(dt, this.pos.x + Math.sin(this.heading) * 12, floor + this.alt, this.pos.z + Math.cos(this.heading) * 12, 9, 1.0, 1.1);
        if (this.st > 1.6) { this.state = 'circle'; this.st = 0; this.atkCD = 2 + Math.random() * 1.6; }
        break;
      }
      case 'sonic': {
        const S = this.sw;
        if (S.phase === 'approach') {
          // vem para cima do jogador, a uns 4 m de altura
          const dx = this.pos.x - P.x, dz = this.pos.z - P.z, l = Math.hypot(dx, dz) || 1;
          const hx = P.x + dx / l * 3.5, hz = P.z + dz / l * 3.5, hy = this.ground() + 4.2;
          const dist = Math.hypot(hx - this.pos.x, hz - this.pos.z);
          if (dist > 2.5 && this.st < 3) { this.flapping = true; this.fly(dt, hx, hy, hz, Math.min(10, dist * 1.6), 3, 2.2); }
          else { S.phase = 'charge'; S.t = 0; BSFX.charge(A, dP, 1.0); }
        } else if (S.phase === 'charge') {
          // abre as asas e enche o peito
          S.t += dt;
          this.hover(dt, ang, (this.ground() + 4.2 - this.pos.y) * 2, 6);
          if (Math.random() < 0.7) {
            const a = Math.random() * TAU, r = 3 + Math.random() * 2;
            const p = v3(this.pos.x + Math.cos(a) * r, this.pos.y + (Math.random() - 0.5) * 2, this.pos.z + Math.sin(a) * r);
            this.effects.spawn({ p, v: v3((this.pos.x - p.x) * 2.5, (this.pos.y - p.y) * 2.5, (this.pos.z - p.z) * 2.5), life: 0.4, s0: 0.06, s1: 0.18, color: [0.42, 0.36, 0.5], drag: 0 });
          }
          if (S.t > 1.0) { S.phase = 'blast'; S.t = 0; this._blast(env); }
        } else {
          S.t += dt;
          this.hover(dt, ang, 0.5, 6);
          if (S.t > 0.7) { this.state = 'circle'; this.st = 0; this.atkCD = 2.2 + Math.random() * 1.5; }
        }
        break;
      }
      case 'summon': {
        // chama a cria: no máximo 4 morcegos vivos
        const S = this.sw;
        this.hover(dt, ang, 0.4);
        if (!S.done && this.st > 0.7) {
          S.done = true;
          const free = 4 - this.bats(C), n = Math.min(free, 2 + (Math.random() < 0.5 ? 1 : 0));
          for (let i = 0; i < n; i++) {
            const a = this.heading + (i - (n - 1) / 2) * 1.3 + Math.PI;
            const b = new GiantBat(this.deps, { state: 'climb', queen: this, scale: 0.85 + Math.random() * 0.2 });
            const ox = Math.sin(a) * 1.2, oz = Math.cos(a) * 1.2;
            b.place(this.pos.x + ox, this.pos.z + oz, a, this.pos.y - 0.3);
            b.vel.set(ox * 3, 2, oz * 3); b.hs = 4; b.atkCD = 2 + i;
            C.spawn(b);
            for (let j = 0; j < 6; j++) this.effects.spawn({ p: b.pos.clone(), v: v3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), life: 0.6, s0: 0.25, s1: 0.5, color: [0.12, 0.1, 0.1], drag: 2 });
          }
          if (n > 0) SFX.screech(A, dP, 1.1);
          this.summonCD = 10 + Math.random() * 4;
        }
        if (this.st > 1.4) { this.state = 'circle'; this.st = 0; this.atkCD = 1.8 + Math.random(); }
        break;
      }
      case 'toPerch': {
        // cansada: vai para o poleiro (ou desce no chão, se não tiver)
        this.flapping = true;
        const Pp = this.perch;
        const tx = Pp ? Pp.x : this.pos.x, tz = Pp ? Pp.z : this.pos.z;
        const ty = Pp ? Pp.y - HANG * this.scale : this.ground() + 0.32 * this.scale;
        const dist = Math.hypot(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
        if (dist > 2.5 && this.st < 8) this.fly(dt, tx, ty + (Pp ? 0.8 : 1), tz, Math.min(10, 1 + dist * 1.2), 2.2, 1.6, !Pp);
        else { this.state = 'land'; this.st = 0; this.landFrom = this.pos.clone(); this.landTo = v3(tx, ty, tz); }
        break;
      }
      case 'land': {
        const k = Math.min(1, this.st / 0.6);
        this.pos.lerpVectors(this.landFrom, this.landTo, k * k * (3 - 2 * k));
        this.vel.set(0, 0, 0); this.hs = 0;
        this.face(dt, ang + (this.perch ? Math.PI : 0), 3);
        this.pitchT = 0; this.rollT = 0;
        if (k >= 1) { this.state = 'rest'; this.st = 0; this.pantT = 0; }
        break;
      }
      case 'rest': {
        // 3 s recuperando o fôlego (leva dano x1,5)
        this.vel.set(0, 0, 0); this.hs = 0;
        this.face(dt, ang + (this.perch ? Math.PI : 0), 1.5);
        if (!this.perch) this.pos.y = this.ground() + 0.32 * this.scale;
        this.pantT -= dt;
        if (this.pantT <= 0) { this.pantT = 0.55; BSFX.pant(A, dP); }
        if (this.st > 3) { this.state = 'takeoff'; this.st = 0; this.restCD = 14 + Math.random() * 5; }
        break;
      }
      case 'takeoff': {
        // solta do poleiro, abre as asas e sobe
        this.flapping = this.st > 0.25;
        this.vel.y = this.st < 0.3 && this.perch ? this.vel.y - 9.8 * dt : damp(this.vel.y, 4, 3, dt);
        this.hs = damp(this.hs, 6, 1.5, dt);
        const Ar = this.arena, far = Ar && Math.hypot(Ar.x - this.pos.x, Ar.z - this.pos.z) > 4;
        const away = far ? Math.atan2(Ar.x - this.pos.x, Ar.z - this.pos.z) : ang;
        this.heading += wrapA(away - this.heading) * Math.min(1, dt * 1.5);
        this.vel.x = Math.sin(this.heading) * this.hs; this.vel.z = Math.cos(this.heading) * this.hs;
        this.pitchT = this.st < 0.3 ? 0.5 : -0.3; this.rollT = 0;
        this.move(dt, false);
        if (this.st > 1.4) { this.state = 'circle'; this.st = 0; this.atkCD = 1.5; }
        break;
      }
    }
    // luz vermelha fraca dos olhos
    const h = this.bones.head.getWorldPosition(this._a);
    // no aviso (rasante ou guincho) os olhos acendem mais forte
    const warn = this.state === 'dwarn' || (this.state === 'sonic' && this.sw?.phase === 'charge') ? 1 : 0;
    this.eyeK = damp(this.eyeK ?? 0, warn, 8, dt);
    const ek = 1 + this.eyeK * 1.2;
    this.atmo?.light(h.x, h.y, h.z, [0.9 * ek, 0.08 * ek, 0.05 * ek], 6 + this.eyeK * 4, 5);
    if (this.flashL > 0) { this.flashL -= dt; this.atmo?.light(this.pos.x, this.pos.y, this.pos.z, [0.8, 0.7, 1.0], 12, 7); }
  }

  // rasante: acerta com o corpo ou as asas
  _ram(env, S) {
    if (S.bit || !env.playerAlive) return;
    const P = env.player.pos, dx = P.x - this.pos.x, dz = P.z - this.pos.z, dh = Math.hypot(dx, dz);
    if (dh < 2.0 && Math.abs(this.pos.y - P.y - 1.1) < 1.4) {
      S.bit = true;
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      if (env.combat.hurt(18, hx, hz, { knock: 8 })) { BSFX.bite(this.audio, 0); env.combat.shake = Math.max(env.combat.shake, 0.4); }
    }
  }

  // o estouro do guincho sônico: anel no ar e no chão, tremor, empurrão forte
  _blast(env) {
    const C = env.combat, P = env.player.pos, p = this.pos, fx = this.effects;
    const g = this.ground();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      fx.spawn({ p: v3(p.x + ca * 0.8, p.y, p.z + sa * 0.8), v: v3(ca * 10, 0, sa * 10), life: 0.8, s0: 0.35, s1: 1.6, color: [0.6, 0.56, 0.7], drag: 0.3 });
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + 0.1, ca = Math.cos(a), sa = Math.sin(a);
      fx.spawn({ p: v3(p.x + ca, g + 0.2, p.z + sa), v: v3(ca * 9, 0.3, sa * 9), life: 0.75, s0: 0.4, s1: 1.5, color: [0.3, 0.26, 0.22], drag: 0.4 });
    }
    const dP = this._dP(env);
    BSFX.blast(this.audio, dP);
    C.shake = Math.max(C.shake, 0.6 * clamp(1.3 - dP / 25, 0.25, 1));
    this.flashL = 0.2;
    if (env.playerAlive && this.chestDist(env, 1.2) < 7) {
      const dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1;
      C.hurt(15, dx / l, dz / l, { knock: 13 });
    }
  }

  onStroke(env) {
    if (!env) return;
    const d = this._dP(env);
    BSFX.heavyFlap(this.audio, d);
    // poeira quando bate as asas perto do chão
    const g = this.ground();
    if (this.pos.y - g < 4) for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU;
      this.effects.spawn({ p: v3(this.pos.x + Math.cos(a) * 1.5, g + 0.1, this.pos.z + Math.sin(a) * 1.5), v: v3(Math.cos(a) * 3, 0.5, Math.sin(a) * 3), life: 0.8, s0: 0.25, s1: 0.7, color: [0.24, 0.21, 0.18], drag: 2 });
    }
  }

  onHurt(dmg, info) {
    if (!this.combat?.boss && this.combat) this.combat.boss = this;
    if (this.state === 'perch') { this.state = 'takeoff'; this.st = 0; }
    if (info.beam) return;
    this.P.flinch = 1;
    if (this.cryT <= 0) { this.cryT = 1.2; SFX.screech(this.audio, 8, 0.55); }
  }

  deathCry() { BSFX.shriek(this.audio, 6, 0.6); SFX.screech(this.audio, 6, 0.45); }
  onLand() {
    SFX.stomp(this.audio, 10, 1.2);
    if (this.combat) this.combat.shake = Math.max(this.combat.shake, 0.45);
  }
}
