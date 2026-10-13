import * as THREE from 'three';
import { Creature } from './base.js';
import { blob, limb, cone, joint, mix3, lerp, clamp, wrapA, damp, smooth } from './shapes.js';
import { SFX, noise, tone, fall } from './sfx.js';
import { makeCanvas, canvasTex, processPixels } from '../../engine/textures.js';

// A Fera: "o bicho da madrugada" que os colonos juram ter visto nos sítios de
// Teewald. Quadrúpede enorme (2,3 m de cernelha, 4 m de comprido), corcunda alta
// de pelo comprido e sujo, braços dianteiros grossos e mais longos que as patas
// (anda nos nós dos dedos, como um gorila), cabeça baixa entre boi e lobo, chifres
// curvos, presas e olhos amarelos. Ataques: investida (raspa o chão antes; se bater
// numa parede fica tonta), patada larga, pancada no chão (onda de choque: pular
// evita) e urro que treme tudo. Dinamite a derruba por uns segundos.

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// ---------- textura de pelo (fios ao longo do comprimento) ----------
let FUR = null;
export function furTexture() {
  if (FUR) return FUR;
  const N = 32, c = makeCanvas(N, N), g = c.getContext('2d'), d = g.createImageData(N, N);
  let s = 977;
  const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = [], ph = [], fr = [];
  for (let x = 0; x < N; x++) { base.push(R()); ph.push(R() * TAU); fr.push(1 + Math.floor(R() * 3)); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    // cada mecha clareia e escurece ao longo do fio
    const st = Math.sin((y / N) * TAU * fr[x] + ph[x]);
    let v = 170 + base[x] * 60 + st * 25 + (R() - 0.5) * 22;
    if (st > 0.85) v += 22;
    d.data[i] = v; d.data[i + 1] = v * 0.97; d.data[i + 2] = v * 0.93; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (FUR = canvasTex(processPixels(c), true));
}

// ---------- tubo por anéis: rings = [[x, y, z, rx, ry], ...] ----------
// segue o caminho (transporte paralelo, sem torcer); col(t, a): a = π/2 é "em cima"
export function tube(rings, n, col = () => [1, 1, 1], o = {}) {
  const L = rings.length, pos = [], uv = [], cl = [], idx = [];
  const P = rings.map(r => v3(r[0], r[1], r[2]));
  const T = v3(), N = v3(), B = v3();
  rings.forEach((r, i) => {
    T.subVectors(P[Math.min(L - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    if (i === 0) N.crossVectors(Math.abs(T.y) < 0.9 ? UP : v3(1, 0, 0), T).normalize();
    else N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU, ca = Math.cos(a) * r[3], sa = Math.sin(a) * r[4];
      pos.push(P[i].x + N.x * ca + B.x * sa, P[i].y + N.y * ca + B.y * sa, P[i].z + N.z * ca + B.z * sa);
      uv.push((k / n) * (o.uRep ?? 1), (i / (L - 1)) * (o.vRep ?? 1));
      const c = col(i / (L - 1), a);
      cl.push(c[0], c[1], c[2]);
    }
  });
  for (let i = 0; i < L - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * (n + 1) + k, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // costura: média das normais do primeiro e do último vértice de cada anel
  const nr = g.getAttribute('normal');
  for (let i = 0; i < L; i++) {
    const a = i * (n + 1), b = a + n;
    const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

// IK de dois ossos no plano (z à frente, y para cima); devolve [rot. do osso 1, rot. do osso 2]
// em ângulos de rotation.x (positivo = ponta para trás). back = cotovelo para trás
export function ik2(jy, jz, ty, tz, L1, L2, back) {
  const dz = tz - jz, dy = jy - ty;
  const D = clamp(Math.hypot(dz, dy), Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.001);
  const th = -Math.atan2(dz, dy);
  const al = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const ga = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  return back ? [th + al, -(Math.PI - ga)] : [th - al, Math.PI - ga];
}

// estrondo de batida (parede, árvore)
function crash(a, d) {
  if (!a?.ctx || !a.white) return;
  const v = fall(d, 90);
  if (v <= 0) return;
  const t = a.ctx.currentTime;
  tone(a, t, 0.55, { type: 'sine', f: 75, f1: 28, vol: 0.4 * v });
  noise(a, t, 0.45, { f: 900, f1: 180, vol: 0.4 * v });
  for (let i = 0; i < 5; i++) noise(a, t + 0.02 + i * 0.05 + Math.random() * 0.03, 0.08, { type: 'bandpass', f: 1200 + Math.random() * 1800, q: 2, vol: 0.13 * v });
}

// ---------- medidas ----------
const PIV_Y = 1.45, HIP_Z = -1.25;          // quadris (o corpo gira em volta deles ao empinar)
const LEG = [0.7, 0.62, 0.34], FOOT_H = 0.1, META_A = -0.3;
const ARM = [0.95, 0.82], HAND_H = 0.17;
const SH = [0.8, 0.08, 0.95];               // ombro, no espaço do tronco
const HIP = [0.62, -0.25, -1.25];
const FRONT_Z = 1.25, BACK_Z = -1.1;        // apoio das mãos e dos pés (no espaço da raiz)

// cores
const SOOT = [0.25, 0.235, 0.22], ASHG = [0.5, 0.48, 0.45], MUD = [0.52, 0.35, 0.21];
const HORN = [0.5, 0.46, 0.38], HORN_TIP = [0.1, 0.09, 0.07], CLAW = [0.08, 0.07, 0.06], CLAW_TIP = [0.02, 0.02, 0.02];
const BONE = [0.78, 0.72, 0.56], BONE_TIP = [0.95, 0.92, 0.82], GUM = [0.32, 0.07, 0.06], NOSE = [0.05, 0.04, 0.04];

// pelo preto-acinzentado com mechas marrons; barriga e cara mais escuras
const furCol = (t, a) => {
  const up = Math.sin(a);
  const streak = Math.pow(Math.abs(Math.sin(t * 13 + a * 3)), 6);
  let c = mix3(SOOT, ASHG, clamp(0.3 + up * 0.35 + Math.sin(t * 27 + a * 5) * 0.15, 0, 1));
  c = mix3(c, MUD, streak * 0.65);
  return up < -0.4 ? mix3(c, SOOT, 0.55) : c;
};
const limbCol = (t, a) => mix3(furCol(t * 0.6, a), SOOT, clamp(0.6 - t, 0, 0.6));

// tronco: anéis [x, y, z, rx, ry] com a corcunda sobre os ombros
const TORSO = [
  [0, -0.12, -1.66, 0, 0],
  [0, -0.1, -1.56, 0.3, 0.28],
  [0, -0.08, -1.3, 0.5, 0.42],
  [0, -0.02, -0.9, 0.58, 0.48],
  [0, 0.05, -0.4, 0.64, 0.55],
  [0, 0.12, 0.1, 0.72, 0.62],
  [0, 0.16, 0.6, 0.8, 0.67],
  [0, 0.1, 1.0, 0.78, 0.63],
  [0, 0.0, 1.3, 0.62, 0.52],
  [0, -0.05, 1.5, 0.4, 0.35],
  [0, -0.08, 1.6, 0, 0],
];

// ponto e normal na superfície do tronco (φ = 0 em cima)
function torsoAt(z, phi) {
  let i = 0;
  while (i < TORSO.length - 2 && TORSO[i + 1][2] < z) i++;
  const a = TORSO[i], b = TORSO[i + 1], t = clamp((z - a[2]) / (b[2] - a[2]), 0, 1);
  const y = lerp(a[1], b[1], t), rx = lerp(a[3], b[3], t), ry = lerp(a[4], b[4], t);
  const p = v3(Math.sin(phi) * rx, y + Math.cos(phi) * ry, z);
  const n = v3(Math.sin(phi) / Math.max(rx, 0.05), Math.cos(phi) / Math.max(ry, 0.05), 0).normalize();
  return { p, n };
}

export class Fera extends Creature {
  // o: { hp, arena: {x, z, r}, state: 'prowl' | 'roar' | 'lurk', wake (m, para 'lurk') }
  constructor(deps, o = {}) {
    super(deps, { name: 'A FERA', hp: o.hp ?? 60, radius: 1.1, height: 2.4, blood: [0.32, 0.04, 0.03], death: 'fall', resist: { bullet: 0.5, melee: 0.55, explosion: 2.0, light: 0.2, silver: 0.6, dart: 0.1 }, ...o });
    this.bossName = 'A FERA';
    this.heavy = true;
    this.arena = o.arena || null;
    this.wake = o.wake ?? 22;
    this.immuneColor = [0.5, 0.45, 0.4];
    this.scale = o.scale ?? 1;
    this.build();
    this.root.scale.setScalar(this.scale);
    this.P = { pitch: 0, drop: 0, headX: 0.15, headY: 0, headZ: 0, mouth: 0.1, run: 0, splay: 0, reach: 0, phase: 0, armW: [0, 0], ax: [0, 0], az: [0, 0], ael: [0, 0] };
    this.prevPh = [0, 0, 0, 0];
    this.cool = 1.2; this.roarCool = 10;
    this.breathT = 1; this.fxT = 0; this.growlT = 0;
    this.dP = 99; this.lookA = 0;
    this.stunDur = 2.5;
    this.wave = null;
    this._q = v3(); this._w = v3();
    this._set(o.state || 'prowl');
  }

  get stunned() { return this.state === 'stunned'; }
  get charging() { return this.state === 'charge'; }

  build() {
    const fur = this.mat({ map: furTexture() });
    const hard = this.mat({ map: null });
    const eye = this.eyeMat = this.mat({ map: null, color: 0xffd23a, lit: false, fog: false });
    const B = this.bones = {};
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = this.mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    // cone apontado na direção (dx, dy, dz)
    const spike = (parent, geo, mat, p, dx, dy, dz) => {
      const m = add(parent, geo, mat, p.x, p.y, p.z);
      m.quaternion.setFromUnitVectors(UP, v3(dx, dy, dz).normalize());
      return m;
    };
    let seed = 31;
    const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    B.pivot = joint(this.root, 0, PIV_Y, HIP_Z);
    B.body = joint(B.pivot, 0, 0.25, -HIP_Z);
    add(B.body, tube(TORSO, 10, furCol, { uRep: 2, vRep: 3 }), fur);
    // pescoço grosso descendo para a cabeça baixa
    add(B.body, tube([[0, 0.28, 0.95, 0.52, 0.52], [0, 0.14, 1.4, 0.45, 0.46], [0, -0.02, 1.72, 0.36, 0.36], [0, -0.1, 1.86, 0, 0]], 8, furCol, { vRep: 2 }), fur);

    // pelo comprido saindo das costas e dos ombros (mais alto na corcunda)
    // mechas deitadas para trás, caindo pelos lados; mais compridas e eriçadas na corcunda
    for (let z = -1.1; z <= 1.35; z += 0.2) {
      const hump = clamp(1 - Math.abs(z - 0.55) / 1.0, 0, 1);
      for (const ph of [-1.35, -0.75, -0.2, 0.3, 0.85, 1.4]) {
        if (R() < 0.18) continue;
        const a = ph + (R() - 0.5) * 0.35, { p, n } = torsoAt(z + (R() - 0.5) * 0.12, a);
        const len = 0.22 + hump * 0.4 + R() * 0.16, r = 0.07 + hump * 0.04;
        const tip = R() < 0.4 ? MUD : ASHG, side = Math.abs(Math.sin(a));
        spike(B.body, cone(len, r, SOOT, tip, 3, 0.5), fur, p.multiplyScalar(0.96), n.x * (0.25 + hump * 0.2) + (R() - 0.5) * 0.25, n.y * (0.25 + hump * 0.25) - side * 0.35, -1);
      }
    }
    // franja da barriga e dos lados, pendendo
    for (let i = 0; i < 10; i++) {
      const z = -0.9 + i * 0.22, s = i % 2 ? 1 : -1;
      const { p } = torsoAt(z, s * (1.95 + R() * 0.45));
      spike(B.body, cone(0.3 + R() * 0.18, 0.07, SOOT, MUD, 3, 0.5), fur, p.multiplyScalar(0.96), s * 0.2, -1, -0.4);
    }
    // crina no pescoço
    for (let i = 0; i < 7; i++) {
      const t = i / 6, s = i % 2 ? 1 : -1;
      spike(B.body, cone(0.32 + R() * 0.15, 0.08, SOOT, ASHG, 3, 0.5), fur, v3(s * 0.14, lerp(0.75, 0.36, t), lerp(1.0, 1.65, t)), s * 0.35, 0.3, -1);
    }

    // ---------- cabeça ----------
    B.head = joint(B.body, 0, -0.1, 1.8);
    B.head.rotation.order = 'YXZ';
    const headCol = (t, a) => (t > 0.86 ? NOSE : mix3(furCol(t, a), SOOT, clamp((t - 0.45) * 1.6, 0, 0.7)));
    add(B.head, tube([[0, 0.02, -0.32, 0, 0], [0, 0.04, -0.26, 0.2, 0.2], [0, 0.06, -0.1, 0.3, 0.27], [0, 0.05, 0.08, 0.31, 0.26], [0, 0.02, 0.24, 0.26, 0.22], [0, -0.04, 0.4, 0.2, 0.17], [0, -0.07, 0.58, 0.17, 0.14], [0, -0.08, 0.72, 0.14, 0.11], [0, -0.08, 0.78, 0.08, 0.07], [0, -0.08, 0.8, 0, 0]], 8, headCol, { vRep: 2 }), fur);
    // testa pesada sobre os olhos
    add(B.head, tube([[-0.27, 0.13, 0.2, 0, 0], [-0.2, 0.15, 0.24, 0.06, 0.05], [0, 0.17, 0.27, 0.08, 0.06], [0.2, 0.15, 0.24, 0.06, 0.05], [0.27, 0.13, 0.2, 0, 0]], 5, () => SOOT), fur);
    B.jaw = joint(B.head, 0, -0.14, 0.12);
    add(B.jaw, tube([[0, 0, -0.12, 0, 0], [0, 0, -0.08, 0.2, 0.09], [0, -0.02, 0.15, 0.17, 0.08], [0, -0.02, 0.4, 0.13, 0.06], [0, 0, 0.56, 0.08, 0.04], [0, 0.01, 0.6, 0, 0]], 7, (t, a) => (Math.sin(a) > 0.35 ? GUM : mix3(furCol(t, a), SOOT, 0.5))), fur);
    for (const s of [-1, 1]) {
      // chifres curvos: para fora, para cima e para a frente
      add(B.head, tube([[s * 0.17, 0.18, -0.08, 0.08, 0.08], [s * 0.33, 0.25, -0.1, 0.07, 0.07], [s * 0.48, 0.36, -0.03, 0.058, 0.058], [s * 0.56, 0.5, 0.09, 0.045, 0.045], [s * 0.52, 0.61, 0.23, 0.028, 0.028], [s * 0.45, 0.66, 0.33, 0, 0]], 6, t => mix3(HORN, HORN_TIP, t * t)), hard);
      // orelhas caídas para trás
      spike(B.head, cone(0.17, 0.06, SOOT, MUD, 4, 0.45), fur, v3(s * 0.26, 0.08, -0.14), s * 0.85, 0.15, -0.5);
      // olhos fundos, amarelos
      const e = add(B.head, blob([[-0.04, 0], [-0.012, 0.048], [0.025, 0.038], [0.04, 0]], 4, { sz: 0.7 }), eye, s * 0.2, 0.08, 0.27);
      e.quaternion.setFromUnitVectors(UP, v3(s * 0.55, 0.1, 0.83).normalize());
      // presas de cima e as de baixo (de javali)
      spike(B.head, cone(0.13, 0.026, BONE, BONE_TIP, 4), hard, v3(s * 0.09, -0.15, 0.66), s * 0.05, -1, 0.1);
      spike(B.jaw, cone(0.21, 0.036, BONE, BONE_TIP, 4), hard, v3(s * 0.12, 0.02, 0.38), s * 0.4, 1, 0.3);
    }
    // crina da nuca
    for (let i = 0; i < 4; i++) spike(B.head, cone(0.28, 0.08, SOOT, ASHG, 3, 0.5), fur, v3((i - 1.5) * 0.09, 0.22, -0.18), (i - 1.5) * 0.2, 0.45, -1);

    // ---------- braços (nós dos dedos no chão) ----------
    B.arms = [];
    for (const s of [1, -1]) {
      const sh = joint(B.body, s * SH[0], SH[1], SH[2]);
      add(sh, blob([[-0.34, 0], [-0.26, 0.28], [0, 0.36], [0.22, 0.28], [0.3, 0]], 6, { col: furCol }), fur);
      add(sh, limb(ARM[0], 0.31, 0.23, 6, limbCol), fur);
      for (let i = 0; i < 4; i++) spike(sh, cone(0.36 + R() * 0.18, 0.075, SOOT, i % 2 ? MUD : ASHG, 3, 0.5), fur, v3(s * (0.12 + R() * 0.1), -0.15 - i * 0.16, -0.12 - R() * 0.08), s * 0.3, -1, -0.45);
      const el = joint(sh, 0, -ARM[0], 0);
      add(el, limb(ARM[1], 0.24, 0.17, 6, limbCol), fur);
      const hand = joint(el, 0, -ARM[1], 0);
      add(hand, tube([[0, -0.08, -0.14, 0, 0], [0, -0.07, -0.12, 0.17, 0.1], [0, -0.06, 0.02, 0.21, 0.11], [0, -0.07, 0.14, 0.2, 0.09], [0, -0.09, 0.2, 0.15, 0.06], [0, -0.1, 0.22, 0, 0]], 7, () => mix3(SOOT, [0.06, 0.05, 0.05], 0.5)), fur);
      for (let k = 0; k < 4; k++) spike(hand, cone(0.17, 0.032, CLAW, CLAW_TIP, 4), hard, v3((k - 1.5) * 0.085, -0.12, 0.16), (k - 1.5) * 0.1, -0.55, 1);
      B.arms.push({ sh, el, hand, s });
    }
    // ---------- patas traseiras (digitígradas) ----------
    B.legs = [];
    for (const s of [1, -1]) {
      const th = joint(B.body, s * HIP[0], HIP[1], HIP[2]);
      add(th, blob([[-0.5, 0.12], [-0.25, 0.27], [0, 0.32], [0.2, 0.25], [0.3, 0]], 7, { col: furCol }), fur);
      add(th, limb(LEG[0], 0.28, 0.17, 7, limbCol), fur);
      const kn = joint(th, 0, -LEG[0], 0);
      add(kn, limb(LEG[1], 0.17, 0.1, 6, limbCol), fur);
      const an = joint(kn, 0, -LEG[1], 0);
      add(an, limb(LEG[2], 0.1, 0.08, 5, limbCol), fur);
      const ft = joint(an, 0, -LEG[2], 0);
      add(ft, tube([[0, -0.03, -0.1, 0, 0], [0, -0.03, -0.08, 0.11, 0.07], [0, -0.04, 0.08, 0.14, 0.06], [0, -0.05, 0.16, 0, 0]], 6, () => SOOT), fur);
      for (let k = -1; k <= 1; k++) spike(ft, cone(0.12, 0.03, CLAW, CLAW_TIP, 4), hard, v3(k * 0.07, -0.06, 0.14), k * 0.2, -0.3, 1);
      B.legs.push({ th, kn, an, ft, s });
    }
    // rabo de boi com tufo na ponta
    B.tail = joint(B.body, 0, 0.12, -1.55);
    add(B.tail, limb(0.85, 0.09, 0.04, 5, limbCol), fur);
    spike(B.tail, cone(0.32, 0.09, SOOT, MUD, 5, 0.8), fur, v3(0, -0.8, 0), 0, -1, 0);

    this.spheres = [
      { bone: B.body, off: v3(0, 0.1, 0.9), r: 0.75, part: 'body' },
      { bone: B.head, off: v3(0, 0, 0.25), r: 0.4, part: 'head' },
      { bone: B.body, off: v3(0, 0.1, -0.1), r: 0.7, part: 'body' },
      { bone: B.body, off: v3(0, -0.05, -1.05), r: 0.55, part: 'body' },
      { bone: B.body, off: v3(0, 0.62, 0.45), r: 0.45, part: 'body' },
      ...B.arms.map(A => ({ bone: A.sh, off: v3(0, -0.45, 0), r: 0.33, part: 'body' })),
      ...B.arms.map(A => ({ bone: A.el, off: v3(0, -0.4, 0), r: 0.25, part: 'body' })),
      ...B.legs.map(L => ({ bone: L.th, off: v3(0, -0.3, 0), r: 0.3, part: 'body' })),
    ];
  }

  _set(s) {
    this.state = s; this.st = 0; this.hitDone = false;
    const A = this.audio, d = this.dP;
    if (s === 'roar') SFX.roar(A, d, 0.85, 2.0);
    else if (s === 'paw') SFX.roar(A, d, 1.1, 1.0);
    else if (s === 'swipeUp') { SFX.growl(A, d, 0.55); this.swSide = this.swNext || 1; }
    else if (s === 'swipe') SFX.whoosh(A, d);
    else if (s === 'slamUp') SFX.roar(A, d, 1.3, 0.8);
  }

  // jogador do lado +x local?
  _side(env) {
    const P = env.player.pos, dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    return dx * Math.cos(this.heading) - dz * Math.sin(this.heading) >= 0 ? 1 : -1;
  }

  // ---------- IA ----------
  think(dt, env) {
    const C = env.combat, tp = this.toPlayer(env), d = tp.d, ang = tp.ang;
    this.dP = d; this.lookA = ang;
    this.cool -= dt; this.roarCool -= dt; this.growlT -= dt;
    const alive = env.playerAlive;
    const sm = this.hp < this.maxHp * 0.5 ? 1.15 : 1;   // enfurecida
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let moved = false;
    switch (this.state) {
      case 'lurk': {
        // parada no escuro, respirando, até o jogador chegar perto
        if (alive && d < this.wake) this._set('roar');
        break;
      }
      case 'idle': {
        if (alive) { this._set('prowl'); break; }
        this.face(dt, ang, 0.8);
        break;
      }
      case 'prowl': {
        if (!alive) { this._set('idle'); break; }
        if (this.pendingRoar) { this.pendingRoar = false; this._set('roar'); break; }
        const ar = this.arena;
        const away = ar && Math.hypot(env.player.pos.x - ar.x, env.player.pos.z - ar.z) > ar.r + 8;
        const da = Math.abs(wrapA(ang - this.heading));
        if (!away && this.cool <= 0) {
          const df = d - 1.7;   // da frente (ombros) até o jogador
          let act = null;
          if (df < 2.6) act = da < 0.8 ? (Math.random() < 0.6 ? 'swipeUp' : 'slamUp') : (df < 1.4 ? 'slamUp' : null);
          else if (df < 4.6) act = Math.random() < 0.5 ? 'slamUp' : null;
          else if (d > 7 && d < 26 && da < 0.6) act = this.roarCool <= 0 && Math.random() < 0.3 ? 'roar' : 'paw';
          if (act) { this.swNext = this._side(env); this._set(act); break; }
          this.cool = 0.3;
        }
        let tx = env.player.pos.x, tz = env.player.pos.z;
        if (away) { tx = ar.x; tz = ar.z; }
        const dd = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        if (this.detour > 0) {
          // desvia de um obstáculo
          this.detour -= dt;
          const a = this.heading += this.detourS * 1.6 * dt;
          this.step(dt, Math.sin(a) * 2.6, Math.cos(a) * 2.6, true);
          moved = true;
        } else if (dd > (away ? 2 : 3.6)) {
          this.moveToward(dt, tx, tz, (d > 12 ? 4.4 : 3.0) * sm, 2.2);
          moved = true;
          if (this.stuck) { this.detour = 1.1; this.detourS = Math.random() < 0.5 ? 1 : -1; }
        } else this.face(dt, ang, d < 5 ? 3.0 : 2.4);
        break;
      }
      case 'roar': {
        this.face(dt, ang, 1.5);
        if (this.st > 0.3 && this.st < 1.8) C.shake = Math.max(C.shake, 0.5 * fall(d, 40));
        if (this.st > 2.1) { this._set('prowl'); this.roarCool = 14 + Math.random() * 8; this.cool = 0.4; }
        break;
      }
      case 'paw': {
        // urra e raspa o chão com a pata: o aviso da investida
        if (this.st < 0.9) { this.face(dt, ang, 3.2); this.lockA = ang; }
        if (this.st > 1.15) {
          this.heading = this.lockA;   // direção travada no fim do aviso
          this._set('charge');
          this.chargeHit = false; this.chargeD = 0; this.chargeMax = Math.min(d + 7, 32);
          SFX.stomp(this.audio, d, 1);
        }
        break;
      }
      case 'charge': {
        const sp = 13 * sm * Math.min(1, 0.4 + this.st * 2.5);
        const ax = this.pos.x + fx * 2.4, az = this.pos.z + fz * 2.4;
        if (this.ctx.isDeepWater(ax, az, this.ctx.groundAt(ax, az, this.pos.y + 0.8))) { this._skid(sp); break; }
        const n = Math.max(1, Math.ceil(sp * dt / 0.25)), h = dt / n;
        let hit = false;
        for (let i = 0; i < n && !hit; i++) {
          const ox = this.pos.x, oz = this.pos.z;
          this.step(h, fx * sp, fz * sp, true);
          const prog = ((this.pos.x - ox) * fx + (this.pos.z - oz) * fz) / (sp * h);
          this.chargeD += Math.max(0, prog) * sp * h;
          if (!this.chargeHit) this._chargeHit(env, fx, fz);
          if (this.st > 0.1 && prog < 0.45) hit = true;
        }
        moved = true;
        if (hit) { this._impact(env); break; }
        this.speed = sp;
        const ar = this.arena;
        const out = ar && Math.hypot(this.pos.x - ar.x, this.pos.z - ar.z) > ar.r + 6;
        if (this.chargeD > this.chargeMax || this.st > 2.8 || out || (this.chargeHit && this.st > this.hitAt + 0.5)) this._skid(sp);
        break;
      }
      case 'skid': {
        // freia derrapando e vira
        this.skidV = Math.max(0, this.skidV - dt * 15);
        if (this.skidV > 0.2) {
          const ox = this.pos.x, oz = this.pos.z;
          this.step(dt, fx * this.skidV, fz * this.skidV, true);
          moved = true;
          const prog = ((this.pos.x - ox) * fx + (this.pos.z - oz) * fz) / (this.skidV * dt);
          if (this.skidV > 6 && prog < 0.35) { this._impact(env); break; }
          this.speed = this.skidV;
        }
        if (this.skidV < 5) this.face(dt, ang, 2.2);
        if (this.st > 1.35) { this._set('prowl'); this.cool = 0.7 / sm; }
        break;
      }
      case 'stunned': {
        if (this.st > this.stunDur) { this._set(Math.random() < 0.45 ? 'roar' : 'prowl'); this.cool = 0.5; }
        break;
      }
      case 'swipeUp': {
        this.face(dt, ang, 3);
        if (this.st > 0.6) this._set('swipe');
        break;
      }
      case 'swipe': {
        if (!this.hitDone && this.st > 0.12) { this.hitDone = true; this._swipeHit(env, fx, fz); }
        if (this.st > 0.75) { this._set('prowl'); this.cool = (1.1 + Math.random() * 0.6) / sm; }
        break;
      }
      case 'slamUp': {
        this.face(dt, ang, 1.6);
        if (this.st > 0.9) this._set('slam');
        break;
      }
      case 'slam': {
        if (!this.hitDone && this.st > 0.13) {
          this.hitDone = true;
          const x = this.pos.x + fx * 2.3, z = this.pos.z + fz * 2.3;
          this.wave = { x, z, r: 0.6, hit: false, acc: 0 };
          SFX.quake(this.audio, d);
          C.shake = Math.max(C.shake, 0.75 * fall(d, 45));
          const y = this.ctx.groundAt(x, z, this.pos.y + 1);
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * TAU, s = 1 + Math.random() * 3;
            this.effects.spawn({ p: v3(x, y + 0.2, z), v: v3(Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s), life: 0.9, s0: 0.05, s1: 0.03, color: [0.32, 0.26, 0.18], grav: 12, bounce: 0.2, spin: 10 });
          }
        }
        if (this.st > 1.3) { this._set('prowl'); this.cool = 1.3 / sm; }
        break;
      }
    }
    if (!moved) this.speed = damp(this.speed, 0, 8, dt);
    this.stickGround(dt, 14);
    this._waveTick(dt, env);
    this._fx(dt, env);
  }

  _skid(sp) { this._set('skid'); this.skidV = sp; }

  // investida acertou o jogador: joga longe para a frente e para o lado
  _chargeHit(env, fx, fz) {
    if (!env.playerAlive) return;
    const P = env.player.pos, dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
    if (along < -0.6 || along > 2.9 || Math.abs(lat) > 1.4 || Math.abs(P.y - this.pos.y) > 2) return;
    this.chargeHit = true; this.hitAt = this.st;
    const sg = Math.sign(lat) || 1, kx = fx * 0.8 + fz * sg * 0.6, kz = fz * 0.8 - fx * sg * 0.6, l = Math.hypot(kx, kz);
    if (env.combat.hurt(28, kx / l, kz / l, { knock: 22, invuln: 0.9 })) {
      SFX.stomp(this.audio, 0, 1);
      env.combat.shake = Math.max(env.combat.shake, 0.65);
    }
  }

  // bateu de cabeça numa parede ou árvore: fica tonta
  _impact(env) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x -= fx * 0.3; this.pos.z -= fz * 0.3;
    this.stunDur = 2.5;
    this._set('stunned');
    crash(this.audio, this.dP);
    SFX.growl(this.audio, this.dP, 0.5);
    env.combat.shake = Math.max(env.combat.shake, 0.6 * fall(this.dP, 35));
    const p = v3(this.pos.x + fx * 2.3, this.pos.y + 1.3, this.pos.z + fz * 2.3);
    for (let i = 0; i < 12; i++) this.effects.spawn({ p: p.clone(), v: v3(-fx * 2 + (Math.random() - 0.5) * 4, Math.random() * 2.5, -fz * 2 + (Math.random() - 0.5) * 4), life: 0.8 + Math.random() * 0.5, s0: 0.15, s1: 0.4, color: [0.45, 0.42, 0.36], drag: 2.2, grav: -0.3 });
    for (let i = 0; i < 10; i++) this.effects.spawn({ p: p.clone(), v: v3(-fx * 3 + (Math.random() - 0.5) * 5, 2 + Math.random() * 4, -fz * 3 + (Math.random() - 0.5) * 5), life: 1.1, s0: 0.05, s1: 0.04, sx: 0.5, color: [0.42, 0.3, 0.18], grav: 11, bounce: 0.25, spin: 14 });
  }

  // patada larga: arco de 120°, 3 m a partir dos ombros
  _swipeHit(env, fx, fz) {
    if (!env.playerAlive) return;
    const P = env.player.pos, ox = this.pos.x + fx * 1.6, oz = this.pos.z + fz * 1.6;
    const dx = P.x - ox, dz = P.z - oz, dd = Math.hypot(dx, dz);
    if (dd > 3.35 || Math.abs(P.y - this.pos.y) > 2.4) return;
    if (dd > 0.8 && (dx * fx + dz * fz) / dd < 0.5) return;
    if (env.combat.hurt(24, dx / (dd || 1), dz / (dd || 1), { knock: 10 })) SFX.stomp(this.audio, 0, 0.6);
  }

  // onda de choque da pancada no chão: anel de poeira; fere quem estiver no chão
  _waveTick(dt, env) {
    const W = this.wave;
    if (!W) return;
    W.r += 10.5 * dt;
    W.acc -= dt;
    if (W.acc <= 0) {
      W.acc = 0.05;
      const n = 10, y0 = this.ctx.groundAt(W.x, W.z, this.pos.y + 1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.random() * 0.5, x = W.x + Math.cos(a) * W.r, z = W.z + Math.sin(a) * W.r;
        this.effects.spawn({ p: v3(x, y0 + 0.15, z), v: v3(Math.cos(a) * 3, 1.2 + Math.random(), Math.sin(a) * 3), life: 0.5, s0: 0.22, s1: 0.45, color: [0.4, 0.36, 0.3], drag: 2.5 });
      }
    }
    if (!W.hit && env.playerAlive) {
      const P = env.player.pos, pd = Math.hypot(P.x - W.x, P.z - W.z);
      if (pd <= 5.5 && W.r >= pd - 0.3) {
        W.hit = true;
        // pulou (ou está esquivando): passa por baixo
        if (env.player.grounded) env.combat.hurt(18, (P.x - W.x) / (pd || 1), (P.z - W.z) / (pd || 1), { knock: 8 });
      }
    }
    if (W.r > 6.5) this.wave = null;
  }

  // efeitos contínuos: bafo, luz dos olhos, poeira, estrelinhas
  _fx(dt, env) {
    const B = this.bones, d = this.dP, s = this.state;
    this.root.updateMatrixWorld(true);
    const hp = B.head.localToWorld(this._q.set(0, 0.1, 0.3));
    this.atmo?.light(hp.x, hp.y, hp.z, [0.55, 0.45, 0.12], 3.2, 5);
    if (d > 40) return;
    // bafo no frio
    this.breathT -= dt;
    const rate = s === 'charge' || s === 'roar' || s === 'stunned' ? 0.8 : 1.7;
    if (this.breathT < 0) this.breathT = rate;
    if (this.breathT > rate - 0.45 && Math.random() < dt * 30) {
      const m = B.head.localToWorld(this._q.set(0, -0.12, 0.82)), f = B.head.localToWorld(this._w.set(0, -0.5, 2)).sub(m).normalize();
      this.effects.spawn({ p: m.clone(), v: v3(f.x * 1.3 + (Math.random() - 0.5) * 0.3, f.y * 1.3 + 0.2, f.z * 1.3 + (Math.random() - 0.5) * 0.3), life: 0.9 + Math.random() * 0.4, s0: 0.06, s1: 0.32, color: [0.27, 0.28, 0.3], drag: 1.6, grav: -0.25 });
    }
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.06;
    if (s === 'paw') {
      // poeira da pata raspando
      const p = B.arms[1].hand.localToWorld(this._q.set(0, -0.15, 0.1));
      for (let i = 0; i < 2; i++) this.effects.spawn({ p: p.clone(), v: v3((Math.random() - 0.5) * 1.5 - Math.sin(this.heading) * 1.5, 0.8 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5 - Math.cos(this.heading) * 1.5), life: 0.7, s0: 0.12, s1: 0.32, color: [0.4, 0.33, 0.24], drag: 1.8, grav: 1.5 });
    } else if (s === 'charge' || (s === 'skid' && this.skidV > 2)) {
      for (const L of B.legs) {
        const p = L.ft.localToWorld(this._q.set(0, 0, 0));
        this.effects.spawn({ p: p.clone(), v: v3((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5), life: 0.6, s0: 0.14, s1: 0.35, color: [0.38, 0.33, 0.26], drag: 2 });
      }
    } else if (s === 'stunned') {
      // pontinhos pálidos rodando sobre a cabeça e baba caindo
      const a = this.st * 7;
      const c = B.head.localToWorld(this._q.set(Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45));
      this.effects.spawn({ p: c.clone(), v: v3(-Math.sin(a) * 1.2, 0.2, Math.cos(a) * 1.2), life: 0.35, s0: 0.05, s1: 0, color: [0.62, 0.58, 0.4] });
      if (Math.random() < 0.3) this.effects.spawn({ p: B.head.localToWorld(this._q.set(0, -0.2, 0.6)).clone(), v: v3(0, -0.5, 0), life: 0.8, s0: 0.03, s1: 0.02, color: [0.75, 0.75, 0.7], grav: 6 });
    }
  }

  // ---------- dano ----------
  damage(amount, info = {}) {
    if (this.dead) return false;
    if (this.state === 'stunned') amount *= 1.6;   // tonta: apanha mais
    const ok = super.damage(amount, info);
    if (ok && !this.dead && info.kind === 'explosion') {
      // a dinamite derruba por uns segundos
      if (this.state !== 'stunned') { this._set('stunned'); this.stunDur = 2; }
      else this.stunDur = Math.max(this.stunDur, this.st + 2);
      SFX.growl(this.audio, this.dP, 0.5);
    }
    return ok;
  }

  onHurt(dmg) {
    if (this.state === 'lurk') { this._set('roar'); return; }
    if (this.growlT <= 0 && dmg > 0.4) { this.growlT = 1.2; SFX.growl(this.audio, this.dP, 0.45); }
    if (!this.halfRoar && this.hp < this.maxHp * 0.5) { this.halfRoar = true; this.pendingRoar = true; }
  }

  onDeath() {
    this.fallSide = Math.random() < 0.5 ? 1 : -1;
    SFX.roar(this.audio, this.dP, 0.6, 2.4);
    this.wave = null;
  }

  // desaba devagar: as pernas cedem e tomba de lado
  dying(dt) {
    const t = this.deadT;
    const k = smooth(clamp((t - 0.7) / 1.3, 0, 1));
    this.fallAngle = k * 1.32 * this.fallSide;
    this.stickGround(dt, 10);
    this.liftY = Math.sin(k * 1.32) * 0.55;
    if (!this.thud && t > 1.9) {
      this.thud = true;
      SFX.quake(this.audio, this.dP);
      if (this.combat) this.combat.shake = Math.max(this.combat.shake, 0.5 * fall(this.dP, 40));
      const c = this.aimPoint() || this.pos;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU;
        this.effects.spawn({ p: v3(c.x + Math.cos(a) * 1.5, this.pos.y + 0.2, c.z + Math.sin(a) * 1.5), v: v3(Math.cos(a) * 2.5, 0.8 + Math.random(), Math.sin(a) * 2.5), life: 0.9, s0: 0.2, s1: 0.5, color: [0.38, 0.34, 0.28], drag: 2 });
      }
    }
    // olhos apagando
    const e = clamp(1 - (t - 1) / 3, 0.08, 1);
    this.eyeMat.uniforms.uColor.value.setRGB(1 * e, 0.82 * e, 0.23 * e);
    if (t > 9) this.pos.y -= dt * 0.35;
    if (t > 12) { this.root.visible = false; this.removed = true; }
  }

  sync() {
    super.sync();
    if (this.liftY) this.root.position.y += this.liftY;
  }

  pushPlayer(env) {
    // corpo comprido: cápsula ao longo do rumo
    if (!env.playerAlive) return;
    const P = env.player.pos, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (Math.abs(P.y - this.pos.y) > 2.4) return;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    const al = clamp(dx * fx + dz * fz, -1.4, 1.9);
    const cx = this.pos.x + fx * al, cz = this.pos.z + fz * al, ex = P.x - cx, ez = P.z - cz, e = Math.hypot(ex, ez), m = 1.25;
    if (e < m && e > 1e-4) { P.x = cx + ex / e * m; P.z = cz + ez / e * m; }
  }

  // anda com colisão; testa também a frente (cabeça) e a traseira do corpo comprido
  step(dt, vx, vz, collide = true) {
    super.step(dt, vx, vz, collide);
    if (!collide || this.dead) return;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    for (const k of [1.55, -1.15]) {
      const q = this._w.set(this.pos.x + s * k, this.pos.y, this.pos.z + c * k), qx = q.x, qz = q.z;
      this.ctx.collision.resolve(q, 0.75, 1.8);
      this.pos.x += q.x - qx; this.pos.z += q.z - qz;
    }
  }

  // ---------- animação ----------
  animate(dt) {
    const P = this.P, B = this.bones, s = this.state, t = this.st;
    const breath = Math.sin(this.breathT / 1.7 * TAU) * 0.5 + 0.5;
    let pitch = 0, drop = 0, headX = 0.15, headZ = 0, mouth = 0.08 + breath * 0.1, splay = 0, reach = 0;
    let headY = clamp(wrapA(this.lookA - this.heading), -0.55, 0.55);
    const armW = [0, 0], ax = [0, 0], az = [0, 0], ael = [0, 0];
    let scrape = 0;
    const iS = this.swSide > 0 ? 0 : 1;   // braço do lado do jogador
    switch (s) {
      case 'roar': {
        const k = smooth(clamp(t / 0.4, 0, 1)) * (1 - smooth(clamp((t - 1.7) / 0.4, 0, 1)));
        pitch = -0.26 * k; headX = lerp(0.15, -0.55, k); mouth = lerp(mouth, 1, k); headY *= 1 - k;
        break;
      }
      case 'paw': {
        const k = smooth(clamp(t / 0.3, 0, 1));
        headX = t < 0.35 ? -0.3 : 0.45; mouth = t < 0.6 ? 0.9 : 0.4; drop = 0.12 * k; pitch = 0.05 * k;
        scrape = t > 0.2 ? 1 : 0;
        break;
      }
      case 'charge': pitch = 0.07; headX = 0.45; mouth = 0.6; headY = 0; break;
      case 'skid': pitch = -0.12; drop = 0.1; headX = 0.1; mouth = 0.5; break;
      case 'stunned': {
        const k = smooth(clamp(t / 0.3, 0, 1)) * (1 - smooth(clamp((t - this.stunDur + 0.4) / 0.4, 0, 1)));
        drop = 0.38 * k; pitch = 0.1 * k; splay = k;
        headX = lerp(0.15, 0.55 + Math.sin(t * 1.7) * 0.15, k); headZ = Math.sin(t * 2.3) * 0.35 * k; headY = Math.sin(t * 1.1) * 0.35 * k;
        mouth = lerp(mouth, 0.55, k);
        break;
      }
      case 'swipeUp': {
        const k = smooth(clamp(t / 0.45, 0, 1));
        pitch = -0.16 * k; armW[iS] = k; ax[iS] = -2.0; az[iS] = this.swSide * 1.15; ael[iS] = -1.2; mouth = 0.7; headX = -0.15;
        break;
      }
      case 'swipe': {
        const k = smooth(clamp(t / 0.16, 0, 1));
        pitch = lerp(-0.16, 0.05, k); armW[iS] = 1 - smooth(clamp((t - 0.3) / 0.4, 0, 1));
        ax[iS] = lerp(-2.0, -0.8, k); az[iS] = lerp(this.swSide * 1.15, -this.swSide * 0.55, k); ael[iS] = lerp(-1.2, -0.3, k);
        mouth = 1; headX = 0.1;
        break;
      }
      case 'slamUp': {
        const k = smooth(clamp(t / 0.6, 0, 1));
        pitch = -0.55 * k; armW[0] = armW[1] = k; ax[0] = ax[1] = -2.55; az[0] = 0.35; az[1] = -0.35; ael[0] = ael[1] = -0.7;
        headX = -0.45 * k; mouth = k; headY *= 1 - k;
        break;
      }
      case 'slam': {
        const k = smooth(clamp(t / 0.13, 0, 1)), r = smooth(clamp((t - 0.45) / 0.7, 0, 1));
        pitch = lerp(-0.55, 0.14, k) * (1 - r); armW[0] = armW[1] = 1 - k; ax[0] = ax[1] = -2.55; az[0] = 0.35; az[1] = -0.35; ael[0] = ael[1] = -0.7;
        reach = 0.55 * (1 - r); drop = 0.18 * k * (1 - r); headX = 0.35; mouth = 0.85 * (1 - r) + 0.1;
        break;
      }
      case 'dead': {
        const k = smooth(clamp(this.deadT / 1.1, 0, 1));
        drop = 0.65 * k; pitch = 0.12 * k; splay = k; headX = 0.15 + 0.5 * k; mouth = 0.35; headY = 0;
        break;
      }
      case 'lurk': headX = 0.3 + Math.sin(t * 0.7) * 0.08; headY = Math.sin(t * 0.4) * 0.4; break;
    }
    // suaviza
    const kk = 1 - Math.exp(-dt * 10);
    const fast = s === 'swipe' || s === 'slam' ? 1 - Math.exp(-dt * 30) : kk;
    P.pitch += (pitch - P.pitch) * fast; P.drop += (drop - P.drop) * kk; P.reach += (reach - P.reach) * fast;
    P.headX += (headX - P.headX) * kk; P.headY += (headY - P.headY) * kk; P.headZ += (headZ - P.headZ) * kk;
    P.mouth += (mouth - P.mouth) * fast; P.splay += (splay - P.splay) * kk;
    for (let i = 0; i < 2; i++) {
      P.armW[i] += (armW[i] - P.armW[i]) * fast;
      if (armW[i] > 0.01) { P.ax[i] = ax[i]; P.az[i] = az[i]; P.ael[i] = ael[i]; }
    }
    // passada: andar (patas alternadas) e galope (pares juntos)
    const v = this.dead ? 0 : this.speed;
    P.run += (clamp((v - 3.5) / 6, 0, 1) - P.run) * kk;
    const f = v > 0.15 ? 0.42 + v * 0.1 : 0;
    P.phase = (P.phase + dt * f) % 1;
    const beta = lerp(0.65, 0.42, P.run);
    const S = clamp(v * beta / Math.max(f, 0.3), 0, lerp(1.2, 2.0, P.run));
    const liftH = clamp(S / 0.6, 0, 1) * lerp(0.2, 0.42, P.run);
    const OFF = [[0.25, 0.75, 0, 0.5], [0, 0.08, 0.5, 0.58]];   // braço +x, braço -x, pata +x, pata -x
    const bob = P.run > 0.3 ? Math.sin(P.phase * TAU * 2) * 0.07 * P.run : Math.sin(P.phase * TAU * 2) * 0.025 * clamp(S, 0, 1);
    const rock = Math.sin(P.phase * TAU) * 0.07 * P.run;
    const py = PIV_Y - P.drop + bob, pz = HIP_Z, pt = P.pitch + rock;
    B.pivot.position.y = py;
    B.pivot.rotation.x = pt;
    const cp = Math.cos(pt), sp = Math.sin(pt);
    const cycle = (i) => {
      const ph = (P.phase + lerp(OFF[0][i], OFF[1][i], P.run)) % 1;
      // pisada: o pé desce no começo do apoio
      if (ph < this.prevPh[i] && S > 0.2 && !this.dead) this._footfall(i, P.run);
      this.prevPh[i] = ph;
      if (ph < beta) return [S / 2 - (ph / beta) * S, 0];
      const u = (ph - beta) / (1 - beta);
      return [-S / 2 + smooth(u) * S, Math.sin(u * Math.PI) * liftH];
    };
    // braços: IK até os nós dos dedos no chão (ou pose de golpe)
    const shy = SH[1] + 0.25, shz = SH[2] - HIP_Z;
    const sy = py + shy * cp - shz * sp, sz = pz + shy * sp + shz * cp;
    B.arms.forEach((A, i) => {
      let [oz, lift] = cycle(i);
      if (scrape && i === 1) { oz = Math.sin(t * TAU * 2.6) * 0.42; lift = Math.max(0, Math.cos(t * TAU * 2.6)) * 0.14; }
      const [a1, a2] = ik2(sy, sz, HAND_H + lift, FRONT_Z + P.reach + oz, ARM[0], ARM[1], true);
      const w = P.armW[i];
      A.sh.rotation.set(lerp(a1 - pt, P.ax[i], w), 0, lerp(A.s * (0.06 + 0.25 * P.splay), P.az[i], w));
      A.el.rotation.x = lerp(a2, P.ael[i], w);
      A.hand.rotation.x = lerp(-(a1 + a2), 0.4, w);
    });
    // patas traseiras: IK até o tornozelo, metatarso inclinado
    B.legs.forEach((L, j) => {
      const [oz, lift] = cycle(j + 2);
      const fy = FOOT_H + lift, fz = BACK_Z + oz;
      const ay = fy + LEG[2] * Math.cos(META_A), az2 = fz + LEG[2] * Math.sin(META_A);
      const [a1, a2] = ik2(py, pz, ay, az2, LEG[0], LEG[1], false);
      L.th.rotation.set(a1 - pt, 0, L.s * (0.04 + 0.22 * P.splay));
      L.kn.rotation.x = a2;
      L.an.rotation.x = META_A - (a1 + a2);
      L.ft.rotation.x = -META_A;
    });
    B.head.rotation.set(P.headX - pt * 0.6, P.headY, P.headZ);
    B.jaw.rotation.x = P.mouth * 0.62;
    B.tail.rotation.x = 0.45 + 0.6 * P.run + Math.sin(this.st * 1.3) * 0.08;
    B.tail.rotation.z = Math.sin(this.st * 0.9) * 0.25;
  }

  // passo pesado: som e poeira no pé que desce
  _footfall(i, run) {
    SFX.stomp(this.audio, this.dP, i < 2 ? 0.5 + run * 0.4 : 0.35 + run * 0.3);
    if (this.dP > 30) return;
    const B = this.bones, bone = i < 2 ? B.arms[i].hand : B.legs[i - 2].ft;
    const p = bone.localToWorld(this._q.set(0, -0.1, 0));
    for (let k = 0; k < 2 + Math.round(run * 2); k++) this.effects.spawn({ p: v3(p.x, this.pos.y + 0.08, p.z), v: v3((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.6), life: 0.5, s0: 0.1, s1: 0.26, color: [0.36, 0.32, 0.26], drag: 2.5 });
  }
}
