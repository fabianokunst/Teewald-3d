import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, joint, mix3, lerp, clamp, wrapA, damp, smooth } from './shapes.js';
import { SFX, noise, tone, fall } from './sfx.js';
import { furTexture, tube, ik2 } from './fera.js';

// O Lobisomem: na lenda, o sétimo filho homem vira bicho nas noites de lua cheia.
// Bípede corcunda de 2,3 m, pernas de cachorro, braços compridos com garras,
// cabeça de lobo, olhos âmbar, restos de camisa xadrez e calça rasgadas. Corre de
// quatro, levanta para atacar (duas garradas), dá bote de longe e uiva quando
// chega à metade da vida. Bala comum quase não fere e a ferida fecha sozinha:
// só a prata segura a regeneração. Morto, cai de joelhos, tomba e volta a ser homem.

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const GRAV = 18;

const LEG = [0.55, 0.55, 0.32];
const ARM = [0.55, 0.55];
const SHY = 0.7;   // altura do ombro no tronco

// cores
const FUR = [0.36, 0.31, 0.26], FUR_D = [0.2, 0.17, 0.15], CHEST = [0.6, 0.55, 0.48], NOSE = [0.05, 0.04, 0.04];
const CLAW = [0.12, 0.1, 0.09], CLAW_TIP = [0.03, 0.03, 0.03], FANG = [0.88, 0.84, 0.72], GUM = [0.4, 0.08, 0.08];
const PANTS = [0.2, 0.22, 0.27], PANTS_D = [0.13, 0.14, 0.17];
const SHIRT = [0.4, 0.12, 0.09], SHIRT_D = [0.13, 0.06, 0.05], SHIRT_L = [0.46, 0.38, 0.28];
const SKIN = [0.76, 0.6, 0.5];

// pelo cinza-amarronzado, costas mais escuras, peito mais claro (a = π/2 é a frente)
const furCol = (t, a) => {
  const s = Math.sin(a), streak = Math.pow(Math.abs(Math.sin(t * 17 + a * 3)), 6);
  let c = s > 0 ? mix3(FUR, CHEST, s * s * 0.8) : mix3(FUR, FUR_D, s * s * 0.7);
  return mix3(c, FUR_D, streak * 0.35);
};
const limbFur = (t, a) => mix3(furCol(t, a), FUR_D, clamp(0.5 - t, 0, 0.5));
// calça: rasgada na canela
const pantsCol = (t, a) => mix3(PANTS, PANTS_D, Math.abs(Math.sin(a * 2 + t * 9)) * 0.5);
const shinCol = (t, a) => (t > 0.55 + Math.sin(a * 5) * 0.08 ? pantsCol(t, a) : limbFur(t, a));

const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// camisa xadrez rasgada: casca por cima do tronco, sem as faces arrancadas, xadrez por face
function shirtGeo(prof, n, sx, sz, tear, off = null) {
  const g = blob(prof, n, { sx, sz, off }).toNonIndexed();
  const pos = g.getAttribute('position'), col = g.getAttribute('color'), nor = g.getAttribute('normal');
  const keep = [];
  const tris = pos.count / 3;
  for (let f = 0; f < tris; f++) {
    const q = f >> 1, i = Math.floor(q / n), k = q % n;
    if (tear(i, k, prof.length - 1, n)) continue;
    // xadrez: listras escuras e claras cruzadas
    const a = k % 2 === 0, b = i % 2 === 0, l = k % 6 === 3;
    let c = a && b ? SHIRT_D : a || b ? mix3(SHIRT, SHIRT_D, 0.5) : SHIRT;
    if (l) c = mix3(c, SHIRT_L, 0.45);
    c = mix3(c, [0.3, 0.26, 0.22], hash(i, k) * 0.25);   // sujo, desbotado
    for (let v = 0; v < 3; v++) keep.push(f * 3 + v);
    for (let v = 0; v < 3; v++) col.setXYZ(f * 3 + v, c[0], c[1], c[2]);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of [['position', pos], ['normal', nor], ['color', col], ['uv', g.getAttribute('uv')]]) {
    const sz2 = attr.itemSize, arr = new Float32Array(keep.length * sz2);
    keep.forEach((src, j) => { for (let e = 0; e < sz2; e++) arr[j * sz2 + e] = attr.array[src * sz2 + e]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz2));
  }
  return out;
}

// passos macios (de quatro)
function pad(a, d, k = 1) {
  if (!a?.ctx || !a.white) return;
  const v = fall(d, 50) * k;
  if (v <= 0) return;
  noise(a, a.ctx.currentTime, 0.09, { f: 240, vol: 0.16 * v });
}

export class Werewolf extends Creature {
  // o: { hp, arena: {x, z, r}, state: 'chase' | 'lurk' | 'howl', wake (m, para 'lurk'), keepBody (s) }
  constructor(deps, o = {}) {
    super(deps, { name: 'O LOBISOMEM', hp: o.hp ?? 40, radius: 0.5, height: 2.2, blood: [0.4, 0.04, 0.03], death: 'fall', resist: { bullet: 0.12, melee: 0.2, silver: 1.6, explosion: 0.5, light: 0.3, fire: 0.8, dart: 0.1 }, ...o });
    this.bossName = 'O LOBISOMEM';
    this.arena = o.arena || null;
    this.wake = o.wake ?? 18;
    this.keepBody = o.keepBody ?? 30;
    this.humanized = false;
    this.build();
    this.P = { crouch: 0.15, lean: 0.4, four: 0, armF: 0.35, armOut: 0.18, elbow: 0.5, mouth: 0.1, headX: 0, headY: 0, tuck: 0, twist: 0, kneel: 0, phase: 0, run: 0, att: [0, 0], ax: [0, 0], az: [0, 0], ael: [0, 0] };
    this.prevPh = [0, 0, 0, 0];
    this.silverT = 99; this.cool = 0.5; this.pounceCool = 1.5; this.evadeCool = 0; this.growlT = 0; this.fxT = 0;
    this.hitLog = [];
    this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.dP = 99; this.lookA = 0;
    this._q = v3();
    this._set(o.state || 'chase');
  }

  get regenerating() { return this.regen; }

  build() {
    const fur = this.mat({ map: furTexture() });
    const hard = this.mat({ map: null });
    const cloth = this.mat({ map: null, side: THREE.DoubleSide });
    const eye = this.eyeMat = this.mat({ map: null, color: 0xffa21c, lit: false, fog: false });
    const B = this.bones = {};
    this.furMeshes = [];
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = this.mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
      if (mat === fur) this.furMeshes.push(m);
      return m;
    };
    const spike = (parent, geo, mat, p, dx, dy, dz) => {
      const m = add(parent, geo, mat, p.x, p.y, p.z);
      m.quaternion.setFromUnitVectors(UP, v3(dx, dy, dz).normalize());
      return m;
    };
    this.claws = []; this.ears = [];

    B.hips = joint(this.root, 0, 1.2, 0);
    // quadril com a calça
    add(B.hips, blob([[-0.22, 0], [-0.19, 0.16], [-0.07, 0.23], [0.06, 0.23], [0.13, 0.19]], 9, { sx: 1.15, sz: 0.85, col: pantsCol }), fur);
    // tronco corcunda e largo, peito claro
    B.torso = joint(B.hips, 0, 0.02, 0);
    B.torso.rotation.order = 'YXZ';
    const TP = [[-0.1, 0], [-0.06, 0.2], [0.08, 0.23], [0.3, 0.26], [0.5, 0.32], [0.66, 0.34], [0.78, 0.28], [0.86, 0.16], [0.9, 0]];
    const hunch = (y, a) => { const b = Math.max(0, 1 - Math.abs(y - 0.6) / 0.3); return [0, Math.min(0, Math.sin(a)) * b * 0.12]; };
    add(B.torso, blob(TP, 12, { sx: 1.2, sz: 0.85, col: furCol, off: hunch, vRep: 2 }), fur);
    // restos da camisa: aberta na frente, estourada nas costas, barra esfarrapada
    const SP = [[0.04, 0.245], [0.18, 0.265], [0.34, 0.285], [0.5, 0.34], [0.64, 0.36], [0.76, 0.305], [0.84, 0.19]];
    add(B.torso, shirtGeo(SP, 12, 1.2, 0.85, (i, k, I, n) => {
      const ka = (k + 0.5) / n * TAU, front = Math.sin(ka), side = Math.cos(ka);
      if (front > 0.8 && i >= 1) return true;                     // aberta no peito
      if (front < -0.75 && i >= 3) return true;                   // rasgada nas costas
      if (i === 0 && hash(k, 3) < 0.5) return true;               // barra
      if (i === I - 1 && Math.abs(side) < 0.5) return true;       // gola
      return hash(i, k) < 0.13;                                   // buracos
    }, hunch), cloth);
    // pelo saindo pelo rasgo das costas, deitado para trás
    for (let i = 0; i < 4; i++) {
      const t = i / 3, s = i % 2 ? 1 : -1;
      spike(B.torso, cone(0.12 + Math.sin(t * Math.PI) * 0.05, 0.06, FUR_D, FUR, 3, 0.45), fur, v3(s * 0.06, 0.45 + t * 0.3, -0.3 - Math.sin(t * Math.PI) * 0.07), s * 0.3, -0.6, -1);
    }
    // pescoço grosso com juba
    B.neck = joint(B.torso, 0, 0.8, 0.06);
    add(B.neck, blob([[-0.08, 0.16], [0.06, 0.15], [0.17, 0.12]], 7, { sz: 0.9, col: furCol }), fur);
    for (let i = 0; i < 6; i++) {
      const a = (i / 5 - 0.5) * 2.6;
      spike(B.neck, cone(0.2, 0.06, FUR_D, FUR, 3, 0.45), fur, v3(Math.sin(a) * 0.13, 0.06, -Math.cos(a) * 0.1), Math.sin(a) * 0.6, -0.3, -1);
    }
    // cabeça de lobo: crânio largo, focinho comprido
    B.head = joint(B.neck, 0, 0.17, 0.04);
    const headCol = (t, a) => (t > 0.9 ? NOSE : mix3(furCol(t, a), FUR_D, clamp((t - 0.55) * 1.5, 0, 0.5)));
    add(B.head, tube([[0, 0, -0.16, 0, 0], [0, 0.01, -0.13, 0.12, 0.11], [0, 0.03, -0.03, 0.155, 0.135], [0, 0.03, 0.07, 0.14, 0.12], [0, 0.0, 0.15, 0.1, 0.09], [0, -0.035, 0.24, 0.078, 0.07], [0, -0.045, 0.34, 0.064, 0.055], [0, -0.05, 0.41, 0.048, 0.04], [0, -0.05, 0.44, 0, 0]], 8, headCol, { vRep: 2 }), fur);
    // testa sobre os olhos
    add(B.head, tube([[-0.13, 0.09, 0.07, 0, 0], [-0.09, 0.105, 0.105, 0.03, 0.026], [0, 0.11, 0.12, 0.04, 0.03], [0.09, 0.105, 0.105, 0.03, 0.026], [0.13, 0.09, 0.07, 0, 0]], 4, () => FUR_D), fur);
    // bochechas peludas
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) spike(B.head, cone(0.13, 0.045, FUR, CHEST, 3, 0.5), fur, v3(s * 0.12, -0.03 - i * 0.045, -0.03), s * 0.8, -0.25, -0.6);
    B.jaw = joint(B.head, 0, -0.08, 0.06);
    add(B.jaw, tube([[0, 0, -0.06, 0, 0], [0, 0, -0.03, 0.095, 0.04], [0, -0.01, 0.13, 0.072, 0.035], [0, -0.01, 0.3, 0.045, 0.022], [0, 0, 0.34, 0, 0]], 6, (t, a) => (Math.sin(a) > 0.35 ? GUM : furCol(t, a))), fur);
    for (const s of [-1, 1]) {
      // orelhas em pé
      this.ears.push(spike(B.head, cone(0.18, 0.055, FUR, FUR_D, 4, 0.45), fur, v3(s * 0.085, 0.11, -0.06), s * 0.3, 1, -0.25));
      // olhos âmbar
      const e = add(B.head, blob([[-0.022, 0], [0, 0.026], [0.022, 0]], 5, { sz: 0.6 }), eye, s * 0.098, 0.055, 0.13);
      e.quaternion.setFromUnitVectors(UP, v3(s * 0.5, 0.1, 0.86).normalize());
      spike(B.head, cone(0.06, 0.012, FANG, [1, 1, 0.95], 3), hard, v3(s * 0.036, -0.08, 0.36), 0, -1, 0.1);
      spike(B.jaw, cone(0.05, 0.011, FANG, [1, 1, 0.95], 3), hard, v3(s * 0.03, 0.0, 0.26), 0, 1, -0.1);
    }

    // músculo: membro com barriga (bíceps, coxa)
    const muscle = (len, r0, rm, r1, n, col) => blob([[-len - r1 * 0.6, 0], [-len, r1], [-len * 0.7, rm * 0.85], [-len * 0.35, rm], [0, r0], [r0 * 0.6, 0]], n, { col, vRep: 2 });
    // braços compridos e grossos, com garras
    B.arms = [];
    for (const s of [1, -1]) {
      const sh = joint(B.torso, s * 0.3, SHY, 0.0);
      add(sh, blob([[-0.15, 0], [-0.08, 0.14], [0.05, 0.15], [0.13, 0]], 6, { col: furCol }), fur);
      add(sh, muscle(ARM[0], 0.12, 0.125, 0.08, 6, limbFur), fur);
      // manga rasgada
      add(sh, shirtGeo([[-0.24, 0.13], [-0.1, 0.14], [0.03, 0.155]], 8, 1, 1, (i, k) => i === 0 && hash(k, s) < 0.45), cloth);
      const el = joint(sh, 0, -ARM[0], 0);
      add(el, muscle(ARM[1], 0.085, 0.1, 0.06, 6, limbFur), fur);
      const hand = joint(el, 0, -ARM[1], 0);
      add(hand, blob([[-0.13, 0], [-0.1, 0.06], [0, 0.068], [0.03, 0]], 5, { sz: 0.6, col: () => FUR_D }), fur);
      for (let k = 0; k < 4; k++) this.claws.push(spike(hand, cone(0.19, 0.018, CLAW, CLAW_TIP, 3), hard, v3((k - 1.5) * 0.034, -0.11, 0.02), (k - 1.5) * 0.1, -1, 0.35));
      B.arms.push({ sh, el, hand, s });
    }
    // pernas digitígradas (calça até a canela)
    B.legs = [];
    for (const s of [1, -1]) {
      const th = joint(B.hips, s * 0.16, -0.02, 0);
      add(th, muscle(LEG[0], 0.16, 0.17, 0.1, 6, pantsCol), fur);
      const kn = joint(th, 0, -LEG[0], 0);
      add(kn, muscle(LEG[1], 0.1, 0.1, 0.06, 6, shinCol), fur);
      const an = joint(kn, 0, -LEG[1], 0);
      add(an, limb(LEG[2], 0.06, 0.045, 5, limbFur), fur);
      const toes = joint(an, 0, -LEG[2], 0);
      for (let k = -1; k <= 1; k++) {
        const tg = cone(0.14, 0.035, FUR_D, CLAW, 4, 0.6);
        tg.rotateX(Math.PI / 2);
        const tm = add(toes, tg, fur, k * 0.04, 0, 0); tm.rotation.y = k * 0.3;
      }
      B.legs.push({ th, kn, an, toes, s });
    }
    // rabo peludo
    B.tail = joint(B.hips, 0, 0.04, -0.19);
    add(B.tail, blob([[-0.65, 0], [-0.58, 0.07], [-0.32, 0.11], [-0.08, 0.085], [0, 0.055], [0.04, 0]], 6, { col: (t, a) => mix3(FUR_D, FUR, t), vRep: 2 }), fur);

    this.spheres = [
      { bone: B.torso, off: v3(0, 0.55, 0.03), r: 0.34, part: 'body' },
      { bone: B.head, off: v3(0, 0.0, 0.12), r: 0.19, part: 'head' },
      { bone: B.torso, off: v3(0, 0.18, 0), r: 0.28, part: 'body' },
      ...B.legs.map(L => ({ bone: L.th, off: v3(0, -0.25, 0), r: 0.16, part: 'body' })),
      ...B.legs.map(L => ({ bone: L.kn, off: v3(0, -0.25, 0), r: 0.1, part: 'body' })),
      ...B.arms.map(A => ({ bone: A.sh, off: v3(0, -0.28, 0), r: 0.13, part: 'body' })),
    ];
  }

  _set(s) {
    this.state = s; this.st = 0; this.hitDone = 0;
    const A = this.audio, d = this.dP;
    if (s === 'howl') SFX.howl(A, d, 0.95);
    else if (s === 'crouch') SFX.snarl(A, d, 0.75);
    else if (s === 'combo') { SFX.snarl(A, d, 0.9); this.comboSide = Math.random() < 0.5 ? 1 : -1; }
    else if (s === 'circle') this.circleT = 1.3 + Math.random() * 1.2;
  }

  // salto balístico até (tx, tz) em T segundos
  _leap(tx, tz, T, state) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    this.jump = { vx: dx / T, vz: dz / T, vy: GRAV * T / 2, done: false };
    this.heading = state === 'evade' ? this.heading : Math.atan2(dx, dz);
    this._set(state);
  }

  // ---------- IA ----------
  think(dt, env) {
    const C = env.combat, tp = this.toPlayer(env), d = tp.d, ang = tp.ang, A = this.audio;
    this.dP = d; this.lookA = ang;
    this.silverT += dt; this.cool -= dt; this.pounceCool -= dt; this.evadeCool -= dt; this.growlT -= dt;
    const alive = env.playerAlive;
    // regenera se não leva prata há 4 s (o uivo deixa vulnerável)
    this.regen = this.silverT > 4 && this.hp < this.maxHp && this.state !== 'howl';
    if (this.regen) this.hp = Math.min(this.maxHp, this.hp + 1.5 * dt);
    if (this.growlT <= 0 && d < 25) { this.growlT = 2.5 + Math.random() * 2.5; SFX.growl(A, d, 0.75); }
    const ar = this.arena;
    const away = ar && Math.hypot(env.player.pos.x - ar.x, env.player.pos.z - ar.z) > ar.r + 8;
    let want = null, speed = 0, turn = 8;
    switch (this.state) {
      case 'lurk': {
        if (alive && d < this.wake) { SFX.snarl(A, d, 0.8); this._set('chase'); }
        break;
      }
      case 'idle': {
        if (alive) { this._set('chase'); break; }
        if (this.st > 1.5 && !this.idleHowl) { this.idleHowl = true; this._set('howl'); }
        break;
      }
      case 'chase': {
        if (!alive) { this._set('idle'); break; }
        if (this.pendingHowl) { this.pendingHowl = false; this._set('howl'); break; }
        if (away) {
          // jogador fugiu da arena: volta e espera
          const dd = Math.hypot(ar.x - this.pos.x, ar.z - this.pos.z);
          if (dd > 2) { want = Math.atan2(ar.x - this.pos.x, ar.z - this.pos.z); speed = 5; }
          break;
        }
        want = ang; speed = 8.5;
        const da = Math.abs(wrapA(ang - this.heading));
        if (d < 2.5) { if (this.cool <= 0) { this._set('combo'); break; } want = null; this.face(dt, ang, 8); break; }
        if (d > 5.5 && d < 8.5 && this.pounceCool <= 0 && da < 0.5) { this._set('crouch'); break; }
        if (this.stuck) { this.orbit *= -1; this._set('circle'); }
        break;
      }
      case 'circle': {
        if (!alive) { this._set('idle'); break; }
        const a = Math.atan2(this.pos.x - env.player.pos.x, this.pos.z - env.player.pos.z) + this.orbit * 0.7;
        const tx = env.player.pos.x + Math.sin(a) * 7, tz = env.player.pos.z + Math.cos(a) * 7;
        want = Math.atan2(tx - this.pos.x, tz - this.pos.z); speed = 7;
        if (this.stuck) this.orbit *= -1;
        if (this.st > this.circleT) {
          if (d > 5.5 && d < 8.5 && this.pounceCool <= 0) { this.heading = ang; this._set('crouch'); }
          else this._set('chase');
        }
        break;
      }
      case 'combo': {
        // fica de pé: garrada de um braço, depois do outro
        const t = this.st;
        this.face(dt, ang, t < 0.35 ? 9 : 4);
        if ((t > 0.35 && t < 0.5) || (t > 0.7 && t < 0.85)) { if (d > 1.1) { want = this.heading; speed = 3; turn = 0; } }
        if (t > 0.42 && this.hitDone === 0) { this.hitDone = 1; SFX.whoosh(A, d); if (this._claw(env, 4.5)) SFX.snarl(A, 0, 1.1); }
        if (t > 0.77 && this.hitDone === 1) { this.hitDone = 2; SFX.whoosh(A, d); if (this._claw(env, 5.5)) SFX.snarl(A, 0, 1.1); }
        if (t > 1.25) { this._set(Math.random() < 0.55 ? 'circle' : 'chase'); this.cool = 0.9; }
        break;
      }
      case 'crouch': {
        // agacha rosnando: o aviso do bote
        this.face(dt, ang, 10);
        if (this.st > 0.6) {
          const pv = env.playerVel, P = env.player.pos;
          let tx = P.x + pv.x * 0.35, tz = P.z + pv.z * 0.35;
          const dx = tx - this.pos.x, dz = tz - this.pos.z, L = Math.hypot(dx, dz) || 1;
          const D = clamp(L + 0.3, 6, 8);
          tx = this.pos.x + dx / L * D; tz = this.pos.z + dz / L * D;
          this._leap(tx, tz, 0.62, 'pounce');
          this.pounceCool = 3 + Math.random() * 2;
          SFX.snarl(A, d, 1.15);
        }
        break;
      }
      case 'pounce':
      case 'evade': {
        const J = this.jump;
        J.vy -= GRAV * dt;
        this.step(dt, J.vx, J.vz, true);
        this.pos.y += J.vy * dt;
        if (this.state === 'pounce' && !J.done && alive) {
          const P = env.player.pos, hx = P.x - this.pos.x, hz = P.z - this.pos.z;
          if (Math.hypot(hx, hz) < 1.25 && Math.abs(P.y + 0.9 - (this.pos.y + 0.9)) < 1.6) {
            J.done = true;
            const l = Math.hypot(J.vx, J.vz) || 1;
            if (C.hurt(20, J.vx / l, J.vz / l, { knock: 9 })) SFX.snarl(A, 0, 1.2);
          }
        }
        const g = this.ground();
        if (this.pos.y <= g && J.vy < 0) { this.pos.y = g; this._set('land'); pad(A, d, 1.5); }
        else if (this.st > 1.5) { this.pos.y = g; this._set('land'); }
        this._fx(dt, env);
        return;
      }
      case 'land': {
        if (this.st > 0.45) this._set(Math.random() < 0.5 ? 'circle' : 'chase');
        break;
      }
      case 'howl': {
        // para e uiva: vulnerável
        if (this.st > 2) { this._set('chase'); this.pounceCool = 0.5; }
        break;
      }
      case 'hurt': {
        if (this.st > 0.3) this._set('chase');
        break;
      }
    }
    if (want !== null && speed > 0) {
      if (turn) this.heading += wrapA(want - this.heading) * Math.min(1, dt * turn);
      const sp = speed * this.speedMul * clamp(Math.cos(wrapA(want - this.heading)), 0.3, 1);
      this.step(dt, Math.sin(this.heading) * sp, Math.cos(this.heading) * sp, true);
    } else this.speed = damp(this.speed, 0, 10, dt);
    this.stickGround(dt);
    this._fx(dt, env);
  }

  // garrada: 10 de dano à frente; invencibilidade curta para a segunda garrada valer
  _claw(env, knock) {
    if (!env.playerAlive) return false;
    const { dx, dz, d, dy } = this.toPlayer(env);
    if (d > 2.3 || Math.abs(dy) > 2) return false;
    if (d > 0.3 && (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / d < 0.25) return false;
    return env.combat.hurt(10, dx / (d || 1), dz / (d || 1), { knock, invuln: 0.25 });
  }

  // olhos, vapor da ferida fechando
  _fx(dt, env) {
    this.root.updateMatrixWorld(true);
    const h = this.bones.head.localToWorld(this._q.set(0, 0.05, 0.15));
    this.atmo?.light(h.x, h.y, h.z, [0.5, 0.3, 0.06], 2.2, 5);
    this.fxT -= dt;
    if (this.fxT > 0 || !this.regen || this.dP > 30) return;
    this.fxT = 0.18;
    const p = this.bones.torso.localToWorld(this._q.set((Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.6, 0.1));
    this.effects.spawn({ p: p.clone(), v: v3((Math.random() - 0.5) * 0.3, 0.7, (Math.random() - 0.5) * 0.3), life: 0.9, s0: 0.05, s1: 0.16, color: [0.42, 0.38, 0.36], drag: 1.5, grav: -0.3 });
  }

  // ---------- dano ----------
  damage(amount, info = {}) {
    if (this.dead) return false;
    if (this.state === 'howl') amount *= 1.5;
    const ok = super.damage(amount, info);
    if (!ok || this.dead) return ok;
    const kind = info.kind || 'bullet';
    if (kind === 'silver') this.silverT = 0;
    if (!info.beam) {
      // muitos tiros seguidos: salta para longe
      const now = performance.now() / 1000;
      this.hitLog = this.hitLog.filter(t => now - t < 1.2);
      this.hitLog.push(now);
      const air = this.state === 'pounce' || this.state === 'evade' || this.state === 'howl';
      if (this.hitLog.length >= 4 && this.evadeCool <= 0 && !air && this.combat?.player) {
        this.hitLog.length = 0; this.evadeCool = 3;
        const P = this.combat.player.pos;
        const a = Math.atan2(this.pos.x - P.x, this.pos.z - P.z) + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.5);
        this._leap(this.pos.x + Math.sin(a) * 6.5, this.pos.z + Math.cos(a) * 6.5, 0.55, 'evade');
        SFX.snarl(this.audio, this.dP, 1.2);
      }
    }
    return ok;
  }

  onHurt(dmg, info) {
    const kind = info.kind || 'bullet';
    if (this.state === 'lurk') { this._set('chase'); return; }
    if (kind === 'silver') {
      SFX.yelp(this.audio, this.dP, 0.55);
      // prata durante o aviso cancela o golpe
      const s = this.state;
      if (s === 'chase' || s === 'circle' || s === 'land' || (s === 'combo' && this.st < 0.35) || s === 'crouch') this._set('hurt');
    }
    if (!this.howled && this.hp < this.maxHp * 0.5) { this.howled = true; this.pendingHowl = true; }
  }

  onDeath() {
    this.fallSide = Math.random() < 0.5 ? 1 : -1;
    SFX.yelp(this.audio, this.dP, 0.45);
    this.jump = null;
  }

  // cai de joelhos, tomba de lado e o pelo clareia: volta a ser homem
  dying(dt) {
    const t = this.deadT;
    const k = smooth(clamp((t - 0.9) / 0.8, 0, 1));
    this.fallAngle = k * 1.42 * this.fallSide;
    this.liftY = k * 0.12;
    this.stickGround(dt, 10);
    if (!this.thud && t > 1.7) {
      this.thud = true;
      pad(this.audio, this.dP, 2);
      const c = this.aimPoint() || this.pos;
      for (let i = 0; i < 8; i++) this.effects.spawn({ p: v3(c.x + (Math.random() - 0.5), this.pos.y + 0.1, c.z + (Math.random() - 0.5)), v: v3((Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2), life: 0.7, s0: 0.12, s1: 0.3, color: [0.36, 0.33, 0.28], drag: 2 });
    }
    // vira homem: pelo clareando, focinho, orelhas, garras e rabo encolhendo
    const h = smooth(clamp((t - 1.6) / 2.2, 0, 1));
    if (h > 0 && !this.humanDone) {
      if (!this.origCols) this.origCols = this.furMeshes.map(m => m.geometry.getAttribute('color').array.slice());
      this.furMeshes.forEach((m, i) => {
        const c = m.geometry.getAttribute('color'), o = this.origCols[i];
        for (let j = 0; j < o.length; j += 3) {
          const l = (o[j] + o[j + 1] + o[j + 2]) / 3;
          for (let e = 0; e < 3; e++) c.array[j + e] = lerp(o[j + e], SKIN[e] * (0.75 + l * 0.6), h * 0.85);
        }
        c.needsUpdate = true;
      });
      this.root.scale.setScalar(1 - 0.14 * h);
      this.bones.head.scale.set(1, 1, 1 - 0.3 * h);
      for (const e of this.ears) e.scale.setScalar(1 - 0.6 * h);
      for (const c of this.claws) c.scale.setScalar(1 - 0.75 * h);
      this.bones.tail.scale.setScalar(1 - 0.85 * h);
      const e = 1 - h;
      this.eyeMat.uniforms.uColor.value.setRGB(1 * e + 0.08, 0.64 * e + 0.06, 0.11 * e + 0.05);
      if (h >= 1) this.humanDone = true;
    }
    if (t > 3.2) this.humanized = true;
    if (t > this.keepBody) this.pos.y -= dt * 0.3;
    if (t > this.keepBody + 3) { this.root.visible = false; this.removed = true; }
  }

  sync() {
    super.sync();
    if (this.liftY) this.root.position.y += this.liftY;
  }

  // ---------- animação ----------
  animate(dt) {
    const P = this.P, B = this.bones, s = this.state, t = this.st;
    let crouch = 0.15, lean = 0.42, four = 0, armF = 0.45, armOut = 0.2, elbow = 0.55, mouth = 0.15 + Math.max(0, Math.sin(t * 2.2)) * 0.15, headX = 0, tuck = 0, twist = 0, kneel = 0;
    let headY = clamp(wrapA(this.lookA - this.heading), -0.8, 0.8);
    const att = [0, 0], ax = [0, 0], az = [0, 0], ael = [0, 0];
    const moving = this.speed > 1;
    switch (s) {
      case 'chase': case 'circle':
        if (moving) { four = 1; crouch = 0.6; lean = 1.28; mouth = 0.55; headX = -0.1; }
        else { crouch = 0.35; lean = 0.7; mouth = 0.5; armF = 0.6; armOut = 0.35; elbow = 0.9; }
        break;
      case 'lurk': crouch = 0.3; lean = 0.6; headX = 0.2 + Math.sin(t * 0.6) * 0.1; headY = Math.sin(t * 0.35) * 0.6; mouth = 0.1; break;
      case 'combo': {
        // braço 0 sobe e corta; depois o braço 1
        const i0 = this.comboSide > 0 ? 0 : 1, i1 = 1 - i0;
        const up0 = smooth(clamp(t / 0.3, 0, 1)), cut0 = smooth(clamp((t - 0.35) / 0.12, 0, 1)), rel0 = smooth(clamp((t - 0.55) / 0.3, 0, 1));
        const up1 = smooth(clamp((t - 0.5) / 0.18, 0, 1)), cut1 = smooth(clamp((t - 0.7) / 0.12, 0, 1)), rel1 = smooth(clamp((t - 0.95) / 0.3, 0, 1));
        const sd0 = B.arms[i0].s, sd1 = B.arms[i1].s;
        att[i0] = up0 * (1 - rel0); ax[i0] = lerp(-2.7, -0.2, cut0); az[i0] = lerp(sd0 * 0.55, -sd0 * 0.4, cut0); ael[i0] = lerp(1.0, 0.25, cut0);
        att[i1] = up1 * (1 - rel1); ax[i1] = lerp(-2.7, -0.2, cut1); az[i1] = lerp(sd1 * 0.55, -sd1 * 0.4, cut1); ael[i1] = lerp(1.0, 0.25, cut1);
        twist = (cut0 - up1 * 0.5 - cut1) * 0.35 * this.comboSide + up0 * (1 - cut0) * -0.25 * this.comboSide;
        crouch = 0.3; lean = 0.55 + 0.25 * (cut0 + cut1) * 0.5; mouth = 1; headX = -0.1;
        break;
      }
      case 'crouch': crouch = 1.05; lean = 0.95; armF = -0.3; armOut = 0.55; elbow = 1.3; mouth = 1; headX = -0.15; break;
      case 'pounce': tuck = 1; crouch = 0; lean = 0.9; armF = 1.9; armOut = 0.4; elbow = 0.25; mouth = 1; headX = -0.25; break;
      case 'evade': tuck = 1; crouch = 0; lean = 0.5; armF = 0.6; armOut = 0.5; elbow = 0.8; mouth = 0.6; break;
      case 'land': crouch = 0.9; lean = 0.95; armF = 0.9; armOut = 0.4; elbow = 0.6; mouth = 0.6; break;
      case 'howl': {
        const k = smooth(clamp(t / 0.4, 0, 1)) * (1 - smooth(clamp((t - 1.7) / 0.3, 0, 1)));
        crouch = 0.1; lean = lerp(0.42, 0.05, k); headX = -1.1 * k; headY *= 1 - k; mouth = lerp(mouth, 0.95, k); armF = 0.15; armOut = 0.45; elbow = 0.8;
        break;
      }
      case 'hurt': {
        const k = Math.sin(clamp(t / 0.3, 0, 1) * Math.PI);
        lean = 0.42 - 0.5 * k; headX = -0.6 * k; mouth = 1; armOut = 0.3 + 0.6 * k; armF = 0.3 + 0.4 * k; headY = 0;
        break;
      }
      case 'idle': crouch = 0.2; lean = 0.5; headX = 0.3; break;
      case 'dead': {
        const k = smooth(clamp(this.deadT / 0.7, 0, 1));
        kneel = k; lean = 0.25 + 0.3 * k; headX = 0.6 * k; mouth = 0.4; armF = 0.1; armOut = 0.15; elbow = 0.2; headY = 0;
        break;
      }
    }
    const kk = 1 - Math.exp(-dt * 12), fast = s === 'combo' ? 1 - Math.exp(-dt * 30) : kk;
    for (const [key, v] of [['crouch', crouch], ['lean', lean], ['four', four], ['armF', armF], ['armOut', armOut], ['elbow', elbow], ['mouth', mouth], ['headX', headX], ['headY', headY], ['tuck', tuck], ['kneel', kneel]]) P[key] += (v - P[key]) * kk;
    P.twist += (twist - P.twist) * fast;
    for (let i = 0; i < 2; i++) {
      P.att[i] += (att[i] - P.att[i]) * fast;
      if (att[i] > 0.01) { P.ax[i] = ax[i]; P.az[i] = az[i]; P.ael[i] = ael[i]; }
    }
    // passada: de quatro (galope) ou de pé (passos)
    const v = this.dead || s === 'pounce' || s === 'evade' ? 0 : this.speed;
    P.run += (clamp(v / 7, 0, 1) - P.run) * kk;
    const f = v > 0.3 ? 0.8 + v * 0.13 : 0;
    P.phase = (P.phase + dt * f) % 1;
    const OFF = [[0.5, 0, 0.25, 0.75], [0.08, 0, 0.5, 0.6]];   // braço +x, braço -x, perna +x, perna -x
    const ph = i => (P.phase + lerp(OFF[0][i], OFF[1][i], P.four)) % 1;
    const c = clamp(P.crouch, 0, 1.1), tk = P.tuck, kn = P.kneel;
    // pernas: ângulos (e o quanto o quadril desce)
    const legA = (sw, lift) => [
      lerp(-0.55 - 0.45 * c - 0.6 * tk + sw, -0.15, kn),
      lerp(1.35 + 0.8 * c + 0.5 * tk + lift * 0.7, 1.75, kn),
      lerp(-0.95 - 0.35 * c - 0.2 * tk - lift * 0.35, -0.2, kn),
    ];
    const [b1, b2, b3] = legA(0, 0);
    const drop = LEG[0] * Math.cos(b1) + LEG[1] * Math.cos(b1 + b2) + LEG[2] * Math.cos(b1 + b2 + b3);
    const amp = P.run * lerp(0.45, 0.6, P.four);
    B.legs.forEach((L, j) => {
      const p = ph(j + 2), cyc = p * TAU;
      if (v > 1 && !this.dead) { const half = (p + 0.5) % 1; if (half < this.prevPh[j + 2]) pad(this.audio, this.dP, 0.4 + P.four * 0.4); this.prevPh[j + 2] = half; }
      const [a1, a2, a3] = legA(Math.cos(cyc) * amp, Math.max(0, Math.sin(cyc)) * P.run);
      L.th.rotation.set(a1, 0, L.s * (0.06 + 0.06 * c));
      L.kn.rotation.x = a2; L.an.rotation.x = a3;
      L.toes.rotation.x = -(a1 + a2 + a3) + tk * 0.6;
    });
    const bob = Math.abs(Math.sin(P.phase * TAU)) * 0.06 * P.run;
    const hy = drop + 0.04 + bob;
    B.hips.position.y = hy;
    const lean2 = P.lean + Math.sin(P.phase * TAU) * 0.06 * P.four;
    B.torso.rotation.set(lean2, P.twist, 0);
    B.neck.rotation.set(-lean2 * 0.85 + P.headX * 0.5, P.headY * 0.6, 0);
    B.head.rotation.set(P.headX * 0.5, P.headY * 0.4, 0);
    B.jaw.rotation.x = P.mouth * 0.6;
    // braços: de pé (pose ou golpe) ou de quatro (IK até o chão)
    const sy = hy + 0.02 + SHY * Math.cos(lean2), sz = SHY * Math.sin(lean2);
    B.arms.forEach((Ar, i) => {
      let x = -P.armF, z = Ar.s * P.armOut, el = -P.elbow, hd = 0.2;
      const w = P.att[i];
      x = lerp(x, P.ax[i], w); z = lerp(z, P.az[i], w); el = lerp(el, -P.ael[i], w);
      if (P.four > 0.01) {
        const p = ph(i) * TAU;
        if (v > 1 && !this.dead) { const half = (ph(i) + 0.5) % 1; if (half < this.prevPh[i]) pad(this.audio, this.dP, 0.3 + P.four * 0.3); this.prevPh[i] = half; }
        const [a1, a2] = ik2(sy, sz, 0.12 + Math.max(0, Math.sin(p)) * 0.25 * P.run, sz + 0.12 - Math.cos(p) * 0.5 * P.run, ARM[0], ARM[1], true);
        x = lerp(x, a1, P.four); el = lerp(el, a2, P.four); z = lerp(z, Ar.s * 0.12, P.four); hd = lerp(hd, -(a1 + a2) + 0.4, P.four);
      }
      Ar.sh.rotation.set(-lean2 + x, 0, z);
      Ar.el.rotation.x = el;
      Ar.hand.rotation.x = hd;
    });
    B.tail.rotation.x = 0.45 + 0.75 * P.four + 0.5 * tk + Math.sin(this.st * 2.5) * 0.1;
    B.tail.rotation.z = Math.sin(this.st * 1.7) * 0.3 * (1 - P.four * 0.5);
  }
}
