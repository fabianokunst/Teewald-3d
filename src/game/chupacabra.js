import * as THREE from 'three';
import { ps1Material } from '../engine/ps1material.js';
import { PLAY_BOUNDS } from '../config.js';
import { skinTexture, bloodTexture, woolTexture } from './missionArt.js';

// O chupacabras: bípede corcunda que anda aos pulos (pernas de canguru), espinhos
// nas costas, garras compridas e olhos vermelhos que brilham. Peças rígidas presas
// a juntas, como nos primeiros jogos de PS1, animadas por código (~900 triângulos).
// Luta: rodeia o jogador, investe, agacha chiando (o aviso) e dá o bote; um tiro
// durante o aviso cancela o bote. Ferido demais, foge mata adentro sangrando.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export const CHUPA_HP = 9;          // tiro no corpo tira 1, na cabeça 2
const LEG = [0.33, 0.33, 0.22];     // coxa, canela, pé (metatarso)
const GRAV = 16;

// ---------- sons (WebAudio, sem arquivos) ----------
function noise(a, t, dur, { type = 'lowpass', f = 1000, f1 = null, q = 0.8, vol = 0.2, attack = 0.005, out = null } = {}) {
  const c = a.ctx, src = c.createBufferSource();
  src.buffer = a.white;
  const flt = c.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(out || a.master);
  src.start(t, Math.random() * 1.5, dur + 0.05);
}

function tone(a, t, dur, { type = 'sawtooth', f = 440, f1 = null, fMid = null, vol = 0.1, attack = 0.01, vib = 0, out = null } = {}) {
  const c = a.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (fMid) o.frequency.exponentialRampToValueAtTime(fMid, t + dur * 0.25);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (vib) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = 26 + Math.random() * 8; lg.gain.value = vib;
    l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || a.master);
  o.start(t); o.stop(t + dur + 0.05);
}

const fall = d => Math.max(0, 1 - d / 75);

export const ChupaAudio = {
  ok(a) { return !!(a && a.ctx && a.white); },
  // guincho: serras desafinadas num passa-banda, subindo e caindo, com tremido
  screech(a, d = 0, k = 1) {
    if (!this.ok(a) || fall(d) <= 0) return;
    const c = a.ctx, t = c.currentTime, v = fall(d) * k;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.6;
    const g = c.createGain(); g.gain.value = 1;
    bp.connect(g).connect(a.master);
    for (const det of [1, 1.013, 0.987]) tone(a, t, 1.05, { f: 620 * det, fMid: 1500 * det, f1: 520 * det, vol: 0.09 * v, attack: 0.04, vib: 90, out: bp });
    noise(a, t, 0.9, { type: 'bandpass', f: 2600, f1: 1400, q: 1.2, vol: 0.12 * v, attack: 0.05 });
    setTimeout(() => { try { bp.disconnect(); g.disconnect(); } catch (e) { /* já desligado */ } }, 1600);
  },
  growl(a, d = 0) {
    if (!this.ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 1.1, { f: 62, f1: 48, vol: 0.16 * v, attack: 0.12, vib: 9 });
    tone(a, t, 1.1, { type: 'square', f: 93, f1: 70, vol: 0.05 * v, attack: 0.15, vib: 14 });
    noise(a, t, 1.0, { f: 320, q: 2, vol: 0.18 * v, attack: 0.15 });
  },
  hiss(a, d = 0) {
    if (!this.ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    noise(a, t, 0.7, { type: 'highpass', f: 2400, f1: 3600, vol: 0.2 * v, attack: 0.12 });
    tone(a, t, 0.6, { f: 140, f1: 110, vol: 0.05 * v, attack: 0.1, vib: 20 });
  },
  hurt(a, d = 0) {
    if (!this.ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d);
    tone(a, t, 0.32, { f: 1500, f1: 480, vol: 0.13 * v, attack: 0.01, vib: 120 });
    tone(a, t, 0.28, { type: 'square', f: 760, f1: 300, vol: 0.05 * v });
    noise(a, t, 0.18, { type: 'bandpass', f: 1800, vol: 0.12 * v });
  },
  thud(a, d = 0, k = 1) {
    if (!this.ok(a) || fall(d) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d) * k;
    noise(a, t, 0.12, { f: 260, vol: 0.2 * v });
    noise(a, t, 0.08, { type: 'highpass', f: 2400, vol: 0.05 * v });   // folhas
  },
  chew(a, d = 0) {
    if (!this.ok(a) || fall(d * 2) <= 0) return;
    const t = a.ctx.currentTime, v = fall(d * 2);
    noise(a, t, 0.07, { type: 'bandpass', f: 700 + Math.random() * 400, q: 2, vol: 0.12 * v, attack: 0.01 });
  },
  whoosh(a, d = 0) {
    if (!this.ok(a) || fall(d) <= 0) return;
    noise(a, a.ctx.currentTime, 0.35, { type: 'bandpass', f: 500, f1: 1800, q: 1, vol: 0.12 * fall(d), attack: 0.08 });
  },
  claw(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    for (let i = 0; i < 3; i++) noise(a, t + i * 0.035, 0.06, { type: 'highpass', f: 3000 + i * 400, vol: 0.14 });
  },
  // jogador ferido: gemido curto e pancada
  playerHurt(a) {
    if (!this.ok(a)) return;
    const t = a.ctx.currentTime;
    tone(a, t, 0.22, { f: 210, f1: 120, vol: 0.12, attack: 0.01 });
    tone(a, t, 0.22, { type: 'square', f: 105, f1: 60, vol: 0.05 });
    noise(a, t, 0.2, { f: 400, vol: 0.3 });
  },
};

// ---------- malha ----------
// sólido de revolução ao longo de +y; prof = [[y, r], ...] de baixo para cima.
// sx/sz achatam a seção; col(t, a) = cor do vértice (t = 0..1 ao longo, a = π/2 é a frente +z)
function blob(prof, n, o = {}) {
  const sx = o.sx ?? 1, sz = o.sz ?? 1, col = o.col || (() => [1, 1, 1]);
  const y0 = prof[0][0], len = (prof[prof.length - 1][0] - y0) || 1;
  const pos = [], nor = [], uv = [], cl = [], idx = [];
  prof.forEach(([y, r], i) => {
    const pa = prof[Math.max(0, i - 1)], pb = prof[Math.min(prof.length - 1, i + 1)];
    const slope = (pb[1] - pa[1]) / Math.max(1e-4, pb[0] - pa[0]);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ca * r * sx, y, sa * r * sz);
      if (r < 1e-4) nor.push(0, i === 0 ? -1 : 1, 0);
      else {
        let nx = ca / sx, nz = sa / sz;
        const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        const L = Math.hypot(1, slope);
        nor.push(nx / L, -slope / L, nz / L);
      }
      uv.push((k / n) * (o.uRep ?? 1), ((y - y0) / len) * (o.vRep ?? 1));
      const c = col((y - y0) / len, a);
      cl.push(c[0], c[1], c[2]);
    }
  });
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  return g;
}

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const SKIN = [0.52, 0.55, 0.43], BACK = [0.3, 0.32, 0.28], BELLY = [0.72, 0.68, 0.54];
const SPINE = [0.42, 0.13, 0.2], SPINE_TIP = [0.75, 0.3, 0.32], CLAW = [0.16, 0.13, 0.1];
// costas escuras, barriga clara
const bodyCol = (t, a) => { const s = Math.sin(a); return s > 0 ? mix3(SKIN, BELLY, s * s) : mix3(SKIN, BACK, s * s); };
const limbCol = (t, a) => mix3(BACK, SKIN, 0.4 + t * 0.6 + Math.sin(a) * 0.15);

// membro pendurado para -y a partir da junta
const limb = (len, r0, r1, n = 5) => blob([[-len - r1 * 0.6, 0], [-len, r1], [-len * 0.5, (r0 + r1) * 0.55], [0, r0], [r0 * 0.6, 0]], n, { col: limbCol, vRep: 2 });
// cone para +y (espinhos, garras, presas)
const cone = (len, r, c0, c1, n = 4, sz = 1) => blob([[-0.001, 0], [0, r], [len, 0]], n, { sz, col: t => mix3(c0, c1, t) });

// ovelha morta deitada de lado (a presa na clareira): corpo de lã, cara escura, patas esticadas
export function makeSheep() {
  const wool = ps1Material({ map: woolTexture() }), skin = ps1Material({ map: skinTexture() });
  const G = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); G.add(m); return m;
  };
  const FACE = [0.2, 0.17, 0.15], WOUND = [0.55, 0.06, 0.05];
  // corpo: elipsoide ao longo de +z, deitado (mais largo que alto); ferida perto do pescoço
  const body = blob([[-0.48, 0], [-0.44, 0.2], [-0.3, 0.3], [0, 0.33], [0.25, 0.3], [0.4, 0.22], [0.47, 0]], 8, { sx: 1.05, sz: 0.78, vRep: 2, uRep: 2, col: (t, a) => (t > 0.7 && Math.cos(a) > 0.3 ? WOUND : [0.96, 0.94, 0.88]) });
  body.rotateX(Math.PI / 2);
  add(body, wool, 0, 0.24, 0);
  // cabeça caída no chão
  const head = blob([[-0.12, 0], [-0.1, 0.08], [0.02, 0.09], [0.12, 0.06], [0.16, 0]], 6, { sz: 0.8, col: () => FACE });
  head.rotateX(Math.PI / 2);
  add(head, skin, 0.08, 0.1, 0.58, 0, 0.5, 0.2);
  for (const s of [-1, 1]) add(cone(0.1, 0.03, FACE, FACE, 4, 0.4), skin, 0.08 + s * 0.07, 0.17, 0.5, 0, 0, -s * 1.2 - 0.3);   // orelhas
  // patas esticadas para o lado
  for (const [z, d] of [[-0.28, 0], [-0.16, 0.2], [0.22, -0.1], [0.32, 0.15]]) {
    const leg = limb(0.42, 0.04, 0.03, 5);
    const m = add(leg, skin, 0.22, 0.14, z, 0, d, Math.PI / 2 + 0.15);
    m.geometry.attributes.color.array.fill(0.22);
  }
  G.traverse(o => { o.frustumCulled = false; });
  return G;
}

export class Chupacabra {
  // deps: { ctx, scene, effects, audio }
  constructor(deps) {
    Object.assign(this, deps);
    this.skin = ps1Material({ map: skinTexture() });
    this.eyeMat = ps1Material({ color: 0xff2a12, emissive: 0x501008, lit: false, fog: false });
    this.root = new THREE.Group();
    this.root.visible = false;
    this._build();
    this.scene.add(this.root);
    this._blood();
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.heading = 0; this.state = 'off'; this.active = false;
    this.hp = CHUPA_HP;
    this._t = new THREE.Vector3(); this._t2 = new THREE.Vector3();
    this.P = { crouch: 0, lean: 0.55, armF: 0.4, armOut: 0.15, elbow: 0.9, mouth: 0, headX: 0, headY: 0, tuck: 0 };
    this.phase = 0; this.lift = 0;
  }

  _mesh(geo, mat = this.skin) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; }

  _build() {
    const B = this.bones = {};
    const hips = B.hips = new THREE.Group(); this.root.add(hips);
    const torso = B.torso = new THREE.Group(); hips.add(torso);
    torso.add(this._mesh(blob([[-0.1, 0], [-0.07, 0.12], [0.04, 0.17], [0.2, 0.2], [0.36, 0.19], [0.48, 0.15], [0.56, 0.1], [0.6, 0]], 7, { sz: 0.82, col: bodyCol, vRep: 2 })));
    // espinhos ao longo das costas (-z), deitados para trás
    for (let i = 0; i < 7; i++) {
      const t = i / 6, y = 0.02 + t * 0.52, back = lerp(0.19, 0.1, t) * 0.82;
      const s = 0.14 + Math.sin(t * Math.PI) * 0.16;
      const sp = this._mesh(cone(s, 0.045, SPINE, SPINE_TIP, 4, 0.4));
      sp.position.set(0, y, -back + 0.02);
      sp.rotation.x = -(1.05 - t * 0.35);
      torso.add(sp);
    }
    // pescoço e cabeça
    const neck = B.neck = new THREE.Group(); neck.position.set(0, 0.55, 0.05); torso.add(neck);
    neck.add(this._mesh(blob([[-0.02, 0.075], [0.06, 0.068], [0.13, 0.06]], 5, { sz: 0.9, col: bodyCol })));
    const head = B.head = new THREE.Group(); head.position.set(0, 0.12, 0.0); neck.add(head);
    const hg = blob([[-0.12, 0], [-0.105, 0.085], [-0.03, 0.125], [0.06, 0.115], [0.14, 0.085], [0.2, 0.055], [0.245, 0.02], [0.25, 0]], 7, { sx: 1.05, sz: 0.8, col: (t, a) => mix3(BACK, SKIN, clamp(0.3 + t * 0.6 - Math.sin(a) * 0.2, 0, 1)) });
    hg.rotateX(Math.PI / 2); hg.translate(0, 0.03, 0.02);
    head.add(this._mesh(hg));
    // olhos grandes, amendoados e inclinados
    for (const s of [-1, 1]) {
      const eg = blob([[-0.062, 0], [-0.04, 0.04], [0, 0.05], [0.04, 0.04], [0.062, 0]], 6, { sz: 0.45 });
      eg.rotateZ(Math.PI / 2 + s * 0.42);
      const e = this._mesh(eg, this.eyeMat);
      e.position.set(0.078 * s, 0.07, 0.13);
      e.rotation.y = s * 0.62;
      head.add(e);
    }
    // espinhos da nuca
    for (let i = 0; i < 3; i++) {
      const sp = this._mesh(cone(0.07 + i * 0.015, 0.02, SPINE, SPINE_TIP, 4, 0.4));
      sp.position.set(0, 0.11 - i * 0.02, -0.04 - i * 0.05); sp.rotation.x = -0.9 - i * 0.2;
      head.add(sp);
    }
    // presas e mandíbula
    for (const s of [-1, 1]) {
      const f = this._mesh(cone(0.05, 0.01, [0.95, 0.92, 0.8], [1, 1, 0.95], 3));
      f.rotation.x = Math.PI; f.position.set(0.026 * s, -0.012, 0.225);
      head.add(f);
    }
    const jaw = B.jaw = new THREE.Group(); jaw.position.set(0, -0.02, 0.05); head.add(jaw);
    const jg = blob([[0, 0.01], [0.02, 0.05], [0.1, 0.045], [0.165, 0]], 5, { sx: 0.95, sz: 0.42, col: (t, a) => (Math.sin(a) > 0.3 ? [0.45, 0.08, 0.08] : SKIN) });
    jg.rotateX(Math.PI / 2); jg.translate(0, -0.02, 0);
    jaw.add(this._mesh(jg));
    // braços com três garras
    B.arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(0.16 * s, 0.46, 0.05); torso.add(sh);
      sh.add(this._mesh(limb(0.26, 0.055, 0.036)));
      const el = new THREE.Group(); el.position.y = -0.26; sh.add(el);
      el.add(this._mesh(limb(0.25, 0.036, 0.028)));
      const hand = new THREE.Group(); hand.position.y = -0.25; el.add(hand);
      hand.add(this._mesh(blob([[-0.06, 0], [-0.04, 0.035], [0, 0.03], [0.01, 0]], 5, { sz: 0.6, col: limbCol })));
      for (let k = -1; k <= 1; k++) {
        const cg = cone(0.13, 0.013, CLAW, [0.05, 0.04, 0.04], 3);
        cg.rotateX(Math.PI);
        const c = this._mesh(cg); c.position.set(k * 0.022, -0.05, 0.01); c.rotation.set(-0.35, 0, k * 0.22);
        hand.add(c);
      }
      B.arms.push({ sh, el, hand, s });
    }
    // pernas digitígradas
    B.legs = [];
    for (const s of [1, -1]) {
      const th = new THREE.Group(); th.position.set(0.12 * s, 0, 0); hips.add(th);
      th.add(this._mesh(limb(LEG[0], 0.09, 0.058, 6)));
      const kn = new THREE.Group(); kn.position.y = -LEG[0]; th.add(kn);
      kn.add(this._mesh(limb(LEG[1], 0.055, 0.035)));
      const an = new THREE.Group(); an.position.y = -LEG[1]; kn.add(an);
      an.add(this._mesh(limb(LEG[2], 0.035, 0.03)));
      const toes = new THREE.Group(); toes.position.y = -LEG[2]; an.add(toes);
      for (let k = -1; k <= 1; k++) {
        const tg = cone(0.15 - Math.abs(k) * 0.03, 0.022, SKIN, CLAW, 4, 0.6);
        tg.rotateX(Math.PI / 2);
        const t = this._mesh(tg); t.position.set(k * 0.02, 0.0, 0.0); t.rotation.y = k * 0.45;
        toes.add(t);
      }
      B.legs.push({ th, kn, an, toes, s });
    }
    // esferas de acerto (no espaço da junta)
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.spheres = [
      { bone: head, off: V(0, 0.04, 0.06), r: 0.15, part: 'head' },
      { bone: torso, off: V(0, 0.12, 0), r: 0.2, part: 'body' },
      { bone: torso, off: V(0, 0.38, 0.02), r: 0.2, part: 'body' },
      { bone: B.legs[0].th, off: V(0, -0.15, 0), r: 0.11, part: 'body' },
      { bone: B.legs[1].th, off: V(0, -0.15, 0), r: 0.11, part: 'body' },
    ];
  }

  // poças de sangue no chão (fuga e acertos)
  _blood() {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3));
    this.bloodMesh = new THREE.InstancedMesh(g, ps1Material({ map: bloodTexture(), cutout: true, polygonOffset: -3 }), 48);
    this.bloodMesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 48; i++) this.bloodMesh.setMatrixAt(i, zero);
    this.scene.add(this.bloodMesh);
    this.bloodNext = 0;
  }

  dropBlood(x, z, s = 0.3) {
    const y = this.ctx.groundAt(x, z, this.pos.y + 0.5) + 0.03;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU), new THREE.Vector3(s, 1, s));
    this.bloodMesh.setMatrixAt(this.bloodNext, m);
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    this.bloodNext = (this.bloodNext + 1) % 48;
  }

  clearBlood() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 48; i++) this.bloodMesh.setMatrixAt(i, zero);
    this.bloodMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- controle ----------
  // comendo a ovelha, de costas para a trilha
  spawnFeeding(x, z, heading) {
    this.pos.set(x, this.ctx.groundAt(x, z, 1000), z);
    this.heading = heading; this.vel.set(0, 0, 0);
    this.hp = CHUPA_HP; this.active = true; this.root.visible = true;
    this.provoked = false; this.lift = 0;
    this._set('feed');
    this._sync();
  }

  // continua a luta de um ponto (depois de o jogador cair)
  spawnFight(x, z, heading) {
    this.pos.set(x, this.ctx.groundAt(x, z, 1000), z);
    this.heading = heading; this.vel.set(0, 0, 0);
    this.hp = CHUPA_HP; this.active = true; this.root.visible = true; this.lift = 0;
    this._set('wait');   // alguns segundos de folga antes de voltar a atacar
  }

  hide() { this.active = false; this.root.visible = false; this.state = 'off'; }

  // levanta a cabeça e guincha (cena de encontro)
  alert() { if (this.state === 'feed') this._set('alert'); }
  fight() { if (this.active && this.state !== 'flee' && this.state !== 'gone') this._set('stalk'); }

  get fleeing() { return this.state === 'flee'; }
  get gone() { return this.state === 'gone'; }

  _set(s) {
    this.state = s; this.st = 0; this.hitDone = false;
    if (s === 'stalk') { this.stalkT = 2.2 + Math.random() * 1.8; this.orbit = Math.random() < 0.5 ? 1 : -1; this.radius = 6.5 + Math.random() * 2.5; }
  }

  // ---------- tiro ----------
  raycast(o, d, maxD) {
    if (!this.active || this.state === 'gone' || this.state === 'off') return null;
    this.root.updateMatrixWorld(true);
    let best = null;
    const c = this._t;
    for (const S of this.spheres) {
      S.bone.localToWorld(c.copy(S.off));
      const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
      const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - S.r * S.r;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxD) continue;
      if (!best || t < best.t) best = { t, target: { owner: this, part: S.part } };
    }
    return best;
  }

  // ponto para a mira assistida (controle e toque)
  aimPoint() {
    if (!this.active || this.state === 'gone' || this.state === 'off' || this.state === 'flee') return null;
    this.root.updateMatrixWorld(true);
    return this.bones.torso.localToWorld(this._t2.set(0, 0.3, 0.02));
  }

  hit(T, dir, p, from) {
    if (!this.active || this.state === 'flee' || this.state === 'gone') return;
    const dmg = T.part === 'head' ? 2 : 1;
    this.hp -= dmg;
    this.hits = (this.hits || 0) + 1;
    const dist = from ? from.distanceTo(p) : 10;
    // sangue escuro espirrando
    const rnd = () => Math.random() - 0.5;
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3(dir.x * 1.5 + rnd() * 2.4, 0.6 + Math.random() * 2.2, dir.z * 1.5 + rnd() * 2.4);
      const k = 0.7 + Math.random() * 0.5;
      this.effects.spawn({ p, v, life: 0.5 + Math.random() * 0.5, s0: 0.035 + Math.random() * 0.03, s1: 0.02, color: [0.42 * k, 0.03 * k, 0.03 * k], grav: 9.8, bounce: 0.1, drag: 0.6 });
    }
    for (let i = 0; i < 3; i++) this.effects.spawn({ p, v: new THREE.Vector3(rnd() * 0.6, 0.4, rnd() * 0.6), life: 0.35, s0: 0.06, s1: 0.18, color: [0.5, 0.06, 0.05], drag: 3 });
    this.dropBlood(this.pos.x + rnd() * 0.6, this.pos.z + rnd() * 0.6, 0.35);
    this.onHit?.(T.part, dmg);
    if (this.state === 'feed' || this.state === 'alert') { this.provoked = true; }
    if (this.hp <= 0) {
      ChupaAudio.screech(this.audio, dist, 1.1);
      this._set('flee');
      this.fleeDir = Math.atan2(this.pos.x - this.player.pos.x, this.pos.z - this.player.pos.z);
      return;
    }
    ChupaAudio.hurt(this.audio, dist);
    if (this.state === 'leap') { this.vel.x = dir.x * 1.5; this.vel.z = dir.z * 1.5; this.hitDone = true; return; }
    this._set('hurt');
    this.knock = { x: dir.x * 2.2, z: dir.z * 2.2 };
  }

  // ---------- IA ----------
  // env: { player, onHitPlayer(dmg, dx, dz), arena: {x, z}, playerAlive, playerVel }
  update(dt, env) {
    if (!this.active) return;
    const P = env.player.pos, ctx = this.ctx, A = this.audio;
    this.st += dt;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const ar = env.arena, fromArena = Math.hypot(P.x - ar.x, P.z - ar.z);
    let want = null, speed = 0, face = null, collide = true;

    switch (this.state) {
      case 'feed': {
        if (this.st > (this.chewT ?? 0)) { this.chewT = this.st + 0.25 + Math.random() * 0.35; ChupaAudio.chew(A, dist); }
        if (this.st > (this.growlT ?? 4)) { this.growlT = this.st + 7 + Math.random() * 5; ChupaAudio.growl(A, dist); }
        if (this.provoked) { this._set('alert'); ChupaAudio.screech(A, dist); }
        break;
      }
      case 'alert': {
        face = toP;
        if (this.provoked && this.st > 0.7) this._set('stalk');
        break;
      }
      case 'stalk': {
        if (!env.playerAlive) { this._set('gloat'); break; }
        if (fromArena > 30) { this._set('lurk'); break; }
        // orbita o jogador a uma distância segura
        const ang = Math.atan2(this.pos.x - P.x, this.pos.z - P.z) + this.orbit * 0.55;
        let tx = P.x + Math.sin(ang) * this.radius, tz = P.z + Math.cos(ang) * this.radius;
        // não se afasta demais da clareira
        const ta = Math.hypot(tx - ar.x, tz - ar.z);
        if (ta > 24) { tx = ar.x + (tx - ar.x) * 24 / ta; tz = ar.z + (tz - ar.z) * 24 / ta; }
        want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
        speed = Math.hypot(tx - this.pos.x, tz - this.pos.z) > 0.8 ? 4.2 : 0;
        if (this._stuck(dt, speed)) this.orbit *= -1;
        if (this.st > (this.hissT ?? 1.5)) { this.hissT = this.st + 2.5 + Math.random() * 2; if (Math.random() < 0.6) ChupaAudio.hiss(A, dist); else ChupaAudio.growl(A, dist); }
        if (dist < 1.6) this._set('swipe');
        else if (this.st > this.stalkT) { this._set('charge'); ChupaAudio.screech(A, dist, 0.6); }
        break;
      }
      case 'charge': {
        want = face = toP; speed = 7.4;
        if (!env.playerAlive) this._set('gloat');
        else if (dist < 4.3) { this._set('windup'); ChupaAudio.hiss(A, dist); }
        else if (this.st > 2.4 || fromArena > 32) this._set('stalk');
        break;
      }
      case 'windup': {
        face = toP;
        if (this.st > 0.6) {
          // bote no ponto previsto do jogador
          const pv = env.playerVel || { x: 0, z: 0 };
          let tx = P.x + pv.x * 0.32, tz = P.z + pv.z * 0.32;
          let lx = tx - this.pos.x, lz = tz - this.pos.z, L = Math.hypot(lx, lz) || 1;
          const reach = Math.min(L + 0.6, 6.2);
          lx = lx / L * reach; lz = lz / L * reach;
          const T = 0.55, gy = ctx.groundAt(this.pos.x + lx, this.pos.z + lz, this.pos.y + 1);
          this.vel.set(lx / T, (gy - this.pos.y) / T + GRAV * T / 2, lz / T);
          this.heading = Math.atan2(lx, lz);
          this._set('leap');
          ChupaAudio.screech(A, dist, 0.8); ChupaAudio.whoosh(A, dist);
        }
        break;
      }
      case 'leap': {
        collide = false;
        this.vel.y -= GRAV * dt;
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
        ctx.collision.resolve(this.pos, 0.25, 1.0);
        if (!this.hitDone && env.playerAlive && dist < 0.95 && Math.abs(P.y + 0.9 - (this.pos.y + 0.6)) < 1.2) {
          this.hitDone = true;
          const l = Math.hypot(this.vel.x, this.vel.z) || 1;
          env.onHitPlayer(22, this.vel.x / l, this.vel.z / l);
          this.vel.x *= -0.25; this.vel.z *= -0.25;
        }
        const g = ctx.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
        if (this.pos.y <= g && this.vel.y < 0) {
          this.pos.y = g; this.vel.set(0, 0, 0);
          ChupaAudio.thud(A, dist, 1.3);
          this._set('recover');
        }
        break;
      }
      case 'recover': {
        face = toP;
        if (this.st > 0.45) { this._set('retreat'); this.retreatT = 0.9 + Math.random() * 0.5; }
        break;
      }
      case 'retreat': {
        want = toP + Math.PI + (this.orbit || 1) * 0.5; speed = 6.5; face = null;
        if (this._stuck(dt, speed)) this.orbit = -(this.orbit || 1);
        const ta = Math.hypot(this.pos.x - ar.x, this.pos.z - ar.z);
        if (ta > 22) want = Math.atan2(ar.x - this.pos.x, ar.z - this.pos.z);
        if (this.st > this.retreatT || dist > 10) this._set('stalk');
        break;
      }
      case 'swipe': {
        face = toP;
        if (!this.hitDone && this.st > 0.24) {
          this.hitDone = true;
          ChupaAudio.claw(A);
          const fwd = Math.cos(wrapA(toP - this.heading));
          if (dist < 1.9 && fwd > 0.5 && env.playerAlive) env.onHitPlayer(12, dx / (dist || 1), dz / (dist || 1));
        }
        if (this.st > 0.55) { this._set('retreat'); this.retreatT = 0.8; }
        break;
      }
      case 'hurt': {
        if (this.knock) { this.pos.x += this.knock.x * dt; this.pos.z += this.knock.z * dt; this.knock.x *= 0.85; this.knock.z *= 0.85; }
        if (this.st > 0.38) {
          if (Math.random() < 0.6) { this._set('retreat'); this.retreatT = 0.9; } else this._set('stalk');
        }
        break;
      }
      case 'wait': {
        face = toP;
        if (this.st > 0.5 && !this.hissed) { this.hissed = true; ChupaAudio.hiss(A, dist); }
        if (this.st > 2.6) { this.hissed = false; this._set('stalk'); }
        break;
      }
      case 'lurk': {
        // jogador saiu da clareira: espera na borda, chiando
        const ang = Math.atan2(P.x - ar.x, P.z - ar.z);
        const tx = ar.x + Math.sin(ang) * 18, tz = ar.z + Math.cos(ang) * 18;
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) > 1) { want = Math.atan2(tx - this.pos.x, tz - this.pos.z); speed = 3.5; } else face = toP;
        if (this.st > (this.hissT ?? 1)) { this.hissT = this.st + 3 + Math.random() * 3; ChupaAudio.hiss(A, dist); }
        if (fromArena < 26 && env.playerAlive) this._set('stalk');
        break;
      }
      case 'gloat': {
        face = toP;
        if (this.st > 0.4 && !this.gloated) { this.gloated = true; ChupaAudio.screech(A, dist, 0.9); }
        if (env.playerAlive) { this.gloated = false; this._set('stalk'); }
        break;
      }
      case 'flee': {
        collide = false;
        // foge para longe do jogador, pela mata, aos pulos grandes
        want = this.fleeDir + Math.sin(this.st * 1.7) * 0.35; speed = 9.5;
        if (this.st > (this.dripT ?? 0)) { this.dripT = this.st + 0.22; this.dropBlood(this.pos.x, this.pos.z, 0.18 + Math.random() * 0.14); }
        if (this.st > 5 || (dist > 42 && this.st > 1.5)) { this.state = 'gone'; this.root.visible = false; this.active = false; }
        break;
      }
    }

    // passos/pulos no chão
    if (this.state !== 'leap') {
      if (want !== null && speed > 0) {
        this.heading += wrapA(want - this.heading) * Math.min(1, dt * 7);
        const ox = this.pos.x, oz = this.pos.z;
        const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
        const sp = speed * Math.min(1, Math.max(0.25, Math.cos(wrapA(want - this.heading))));
        this.pos.x += hx * sp * dt; this.pos.z += hz * sp * dt;
        if (collide) ctx.collision.resolve(this.pos, 0.32, 1.3);
        const b = PLAY_BOUNDS;
        this.pos.x = clamp(this.pos.x, b.x0, b.x1); this.pos.z = clamp(this.pos.z, b.z0, b.z1);
        const g = ctx.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
        if (ctx.isDeepWater(this.pos.x, this.pos.z, g)) { this.pos.x = ox; this.pos.z = oz; }
        this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
      } else {
        this.speed = damp(this.speed || 0, 0, 10, dt);
        if (face !== null) this.heading += wrapA(face - this.heading) * Math.min(1, dt * 8);
      }
      const g = ctx.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
      this.pos.y = damp(this.pos.y, g, 20, dt);
      // empurra o jogador para fora do corpo
      if (dist < 0.7 && dist > 1e-4 && env.playerAlive && this.state !== 'flee') {
        env.player.pos.x = this.pos.x + dx / dist * 0.7; env.player.pos.z = this.pos.z + dz / dist * 0.7;
      }
    }
    this._animate(dt, toP, dist);
    this._sync();
  }

  // preso numa árvore: troca de direção
  _stuck(dt, speed) {
    if (speed <= 0) { this.stuckT = 0; return false; }
    this.stuckT = (this.stuckT || 0) + (this.speed !== undefined && this.speed < speed * 0.25 ? dt : -dt);
    this.stuckT = Math.max(0, this.stuckT);
    if (this.stuckT > 0.6) { this.stuckT = 0; return true; }
    return false;
  }

  // ---------- animação ----------
  _animate(dt, toP, dist) {
    const P = this.P, s = this.state, t = this.st;
    let crouch = 0.15, lean = 0.6, armF = 0.5, armOut = 0.15, elbow = 0.9, mouth = 0, headX = 0, tuck = 0;
    const lookY = clamp(wrapA(toP - this.heading), -0.9, 0.9);
    let headY = dist < 30 ? lookY : 0;
    const moving = (this.speed || 0) > 0.5 && s !== 'leap';
    if (s === 'feed') {
      crouch = 0.95; lean = 1.25; headX = 0.55 + Math.sin(t * 7) * 0.12; mouth = 0.4 + Math.sin(t * 13) * 0.4; armF = 0.9 + Math.sin(t * 3) * 0.15; elbow = 1.3; headY = Math.sin(t * 0.9) * 0.2;
    } else if (s === 'alert') {
      crouch = 0.6; lean = 0.45; headX = -0.25; mouth = this.st > 0.35 ? 1 : 0.2; armF = 0.6; armOut = 0.45; elbow = 1.2;
    } else if (s === 'windup') {
      crouch = 1; lean = 0.95; headX = -0.45; mouth = 1; armF = -0.3; armOut = 0.6; elbow = 1.5;
    } else if (s === 'leap') {
      crouch = 0; tuck = 1; lean = 0.85; headX = -0.3; mouth = 1; armF = 1.5; armOut = 0.35; elbow = 0.3;
    } else if (s === 'recover') {
      crouch = 0.7; lean = 0.8; mouth = 0.5; armF = 0.8;
    } else if (s === 'swipe') {
      const k = clamp(t / 0.24, 0, 1);
      crouch = 0.4; lean = 0.8; mouth = 1; armF = lerp(-0.6, 1.8, k * k); armOut = lerp(0.7, 0.1, k); elbow = lerp(1.6, 0.4, k);
    } else if (s === 'hurt') {
      const k = Math.sin(clamp(t / 0.38, 0, 1) * Math.PI);
      crouch = 0.3; lean = 0.6 - 0.75 * k; headX = -0.6 * k; mouth = 1; armOut = 0.2 + 0.7 * k; armF = 0.4 + 0.5 * k; headY = 0;
    } else if (s === 'gloat') {
      crouch = 0.3; lean = 0.35; headX = -0.5; mouth = t > 0.4 && t < 1.5 ? 1 : 0.3; armOut = 0.6; armF = 0.9; elbow = 1.4;
    } else if (s === 'wait') {
      crouch = 0.45; lean = 0.7; headX = -0.2; mouth = 0.3 + Math.max(0, Math.sin(t * 3)) * 0.5; armF = 0.8; armOut = 0.4; elbow = 1.3;
    } else if (s === 'stalk' || s === 'lurk') {
      mouth = 0.15 + Math.max(0, Math.sin(t * 2.1)) * 0.25;
      armF = 0.75; armOut = 0.25; elbow = 1.1;
    } else if (s === 'flee') {
      lean = 1.05; headX = 0.1; armF = 0.2; mouth = 0.6;
    }
    // pulos: ciclo das duas pernas juntas (apoio, impulso, voo)
    let lift = 0;
    if (moving) {
      const v = this.speed;
      const f = clamp(v / 1.7, 1.7, 3.4);
      const before = this.phase;
      this.phase = (this.phase + dt * f) % 1;
      if (this.phase < before) ChupaAudio.thud(this.audio, dist, 0.45);
      const ph = this.phase, air = ph > 0.32;
      const hopH = clamp(v * 0.075, 0.1, 0.55);
      if (air) {
        const k = (ph - 0.32) / 0.68;
        lift = hopH * Math.sin(k * Math.PI);
        tuck = Math.max(tuck, Math.sin(k * Math.PI) * 0.8);
        crouch = Math.min(crouch, 0.1);
      } else {
        const k = ph / 0.32;
        crouch = Math.max(crouch, Math.sin(k * Math.PI) * 0.75);
      }
      lean += 0.25 + v * 0.03;
      armF += 0.25;
    } else if (s !== 'leap') {
      // respiração
      crouch += Math.sin(t * 2.4) * 0.03;
    }
    const k = 1 - Math.exp(-dt * 14);
    P.crouch += (crouch - P.crouch) * (moving ? 1 : k);
    P.tuck += (tuck - P.tuck) * (moving ? 1 : k);
    for (const [key, v] of [['lean', lean], ['armF', armF], ['armOut', armOut], ['elbow', elbow], ['mouth', mouth], ['headX', headX], ['headY', headY]]) P[key] += (v - P[key]) * k;
    this.lift = s === 'leap' ? 0 : damp(this.lift, lift, 30, dt);
    this._pose();
  }

  _pose() {
    const B = this.bones, P = this.P;
    const c = clamp(P.crouch, 0, 1.1), tk = P.tuck;
    let drop = 0;
    for (const L of B.legs) {
      const a1 = -0.75 - 0.5 * c - 0.65 * tk, a2 = 1.55 + 0.95 * c + 0.55 * tk, a3 = -1.05 - 0.4 * c - 0.2 * tk;
      L.th.rotation.set(a1, 0, L.s * (0.08 + 0.1 * c));
      L.kn.rotation.x = a2; L.an.rotation.x = a3;
      L.toes.rotation.x = -(a1 + a2 + a3) + tk * 0.6;
      drop = LEG[0] * Math.cos(a1) + LEG[1] * Math.cos(a1 + a2) + LEG[2] * Math.cos(a1 + a2 + a3);
    }
    B.hips.position.y = drop + 0.03;
    B.torso.rotation.x = P.lean;
    B.neck.rotation.set(-P.lean * 0.85 + P.headX * 0.5, P.headY * 0.6, 0);
    B.head.rotation.set(P.headX * 0.5, P.headY * 0.4, 0);
    B.jaw.rotation.x = P.mouth * 0.65;
    for (const A of B.arms) {
      A.sh.rotation.set(-P.lean - P.armF, 0, A.s * P.armOut);
      A.el.rotation.x = -P.elbow;
      A.hand.rotation.x = 0.25;
    }
  }

  _sync() {
    this.root.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
    this.root.rotation.y = this.heading;
  }
}
