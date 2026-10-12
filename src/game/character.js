import * as THREE from 'three';
import { MeshBuilder, geometryFromBuilder } from '../engine/builder.js';

// Protagonista: loiro, pele clara, roupas em tons de marrom.
// Modelo segmentado (como os personagens de PS1), ~300 triângulos.

function box8(B, mats, x0, x1, y0, y1, z0, z1, top = null) {
  // top: [w, d] no topo (afunila), centrado
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const tw = top ? top[0] / 2 : (x1 - x0) / 2, td = top ? top[1] / 2 : (z1 - z0) / 2;
  const FLb = [x0, y0, z1], FRb = [x1, y0, z1], BRb = [x1, y0, z0], BLb = [x0, y0, z0];
  const FLt = [cx - tw, y1, cz + td], FRt = [cx + tw, y1, cz + td], BRt = [cx + tw, y1, cz - td], BLt = [cx - tw, y1, cz - td];
  const m = k => (typeof mats === 'string' ? mats : (k in mats ? mats[k] : mats.all));
  B.quad(m('front'), FLb, FRb, FRt, FLt);
  B.quad(m('right'), FRb, BRb, BRt, FRt);
  B.quad(m('back'), BRb, BLb, BLt, BRt);
  B.quad(m('left'), BLb, FLb, FLt, BLt);
  if (m('top') !== null) B.quad(m('top'), FLt, FRt, BRt, BLt);
  if (m('bottom') !== null) B.quad(m('bottom'), FLb, BLb, BRb, FRb);
}

function part(fn, M) {
  const B = new MeshBuilder(0);
  fn(B);
  const g = new THREE.Group();
  for (const mat of new Set([...B.groups.values()].map(x => x.mat))) {
    const mesh = new THREE.Mesh(geometryFromBuilder(B, mat), M[mat]);
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}

export class Character {
  constructor(M) {
    this.root = new THREE.Group();
    const S = 0.95;
    this.root.scale.setScalar(S);
    const J = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
    const jacket = 'clothBrown', pants = 'clothDark', skin = 'skin';

    this.hips = J(this.root, 0, 0.93, 0);
    this.hips.add(part(B => box8(B, pants, -0.17, 0.17, -0.12, 0.06, -0.1, 0.1, [0.34, 0.21]), M));
    this.spine = J(this.hips, 0, 0.05, 0);
    this.spine.add(part(B => {
      box8(B, jacket, -0.18, 0.18, -0.1, 0.02, -0.12, 0.12, [0.36, 0.24]);           // barra da jaqueta
      box8(B, jacket, -0.17, 0.17, 0.02, 0.5, -0.11, 0.11, [0.44, 0.25]);            // tronco
      box8(B, { all: 'clothDark', top: null, bottom: null }, -0.07, 0.07, 0.44, 0.52, 0.06, 0.13, [0.16, 0.05]); // gola
    }, M));
    this.neck = J(this.spine, 0, 0.5, 0);
    this.neck.add(part(B => box8(B, skin, -0.05, 0.05, 0, 0.09, -0.05, 0.05), M));
    this.head = J(this.neck, 0, 0.08, 0.01);
    this.head.add(part(B => {
      box8(B, { all: skin, front: 'face' }, -0.09, 0.09, 0, 0.25, -0.1, 0.1, [0.2, 0.22]);
      // cabelo loiro: calota, nuca e franja
      box8(B, 'hair', -0.108, 0.108, 0.17, 0.3, -0.125, 0.115, [0.19, 0.2]);
      box8(B, { all: 'hair', top: null }, -0.105, 0.105, 0.06, 0.18, -0.13, -0.06);
      box8(B, { all: 'hair', bottom: null }, -0.1, 0.1, 0.19, 0.25, 0.1, 0.125, [0.2, 0.02]);
      box8(B, { all: 'hair', top: null }, -0.11, -0.085, 0.1, 0.2, -0.1, 0.06);
      box8(B, { all: 'hair', top: null }, 0.085, 0.11, 0.1, 0.2, -0.1, 0.06);
    }, M));

    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = J(this.spine, side * 0.25, 0.46, 0);
      sh.add(part(B => box8(B, jacket, -0.055, 0.055, -0.3, 0.03, -0.06, 0.06, [0.12, 0.12]), M));
      const el = J(sh, 0, -0.3, 0);
      el.add(part(B => box8(B, jacket, -0.045, 0.045, -0.25, 0, -0.05, 0.05, [0.1, 0.1]), M));
      const hand = J(el, 0, -0.25, 0);
      hand.add(part(B => box8(B, skin, -0.04, 0.04, -0.1, 0, -0.035, 0.045), M));
      this.arms.push({ sh, el, hand, side });
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = J(this.hips, side * 0.09, -0.06, 0);
      hip.add(part(B => box8(B, pants, -0.07, 0.07, -0.44, 0, -0.075, 0.075, [0.15, 0.16]), M));
      const knee = J(hip, 0, -0.44, 0);
      knee.add(part(B => box8(B, pants, -0.055, 0.055, -0.4, 0, -0.06, 0.06, [0.12, 0.13]), M));
      const ankle = J(knee, 0, -0.4, 0);
      ankle.add(part(B => box8(B, 'boot', -0.06, 0.06, -0.07, 0.06, -0.07, 0.19, [0.12, 0.2]), M));
      this.legs.push({ hip, knee, ankle, side });
    }
    // sombra redonda
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), M.blob);
    blob.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    this.blob = blob;

    this.phase = 0; this.walk = 0; this.run = 0; this.air = 0; this.t = 0;
    this.lastStepSign = 1;
    this.onStep = null;
  }

  update(dt, speed, grounded, running) {
    this.t += dt;
    const targetWalk = Math.min(1, speed / 1.6);
    const targetRun = Math.max(0, Math.min(1, (speed - 2.4) / 2.2));
    this.walk += (targetWalk - this.walk) * Math.min(1, dt * 8);
    this.run += (targetRun - this.run) * Math.min(1, dt * 6);
    this.air += ((grounded ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    const stride = 1.25 + this.run * 2.0;
    this.phase += (speed / stride) * Math.PI * 2 * dt * (grounded ? 1 : 0.2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const w = this.walk * (1 - this.air), r = this.run;
    const A = 0.42 * w + 0.32 * r * (1 - this.air);
    const K = 0.55 * w + 0.7 * r;
    const [L, Rr] = this.legs;
    L.hip.rotation.x = -s * A - this.air * 0.55;
    Rr.hip.rotation.x = s * A - this.air * 0.25;
    L.knee.rotation.x = Math.max(0, c) * K + 0.06 * w + this.air * 0.9;
    Rr.knee.rotation.x = Math.max(0, -c) * K + 0.06 * w + this.air * 0.5;
    L.ankle.rotation.x = -L.knee.rotation.x * 0.3; Rr.ankle.rotation.x = -Rr.knee.rotation.x * 0.3;
    const AA = 0.38 * w + 0.45 * r;
    const [aL, aR] = this.arms;
    const idle = (1 - w) * (1 - this.air);
    aL.sh.rotation.x = s * AA - this.air * 0.9; aR.sh.rotation.x = -s * AA - this.air * 0.9;
    aL.sh.rotation.z = -0.08 - this.air * 0.3 - idle * 0.03; aR.sh.rotation.z = 0.08 + this.air * 0.3 + idle * 0.03;
    aL.el.rotation.x = -0.2 - 0.9 * r - 0.15 * w; aR.el.rotation.x = -0.2 - 0.9 * r - 0.15 * w;
    this.hips.position.y = 0.93 - Math.abs(c) * 0.035 * w - Math.abs(c) * 0.05 * r + Math.sin(this.t * 1.6) * 0.004 * idle;
    this.spine.rotation.x = 0.04 * w + 0.22 * r + Math.sin(this.t * 1.6) * 0.012 * idle;
    this.spine.rotation.y = -s * 0.08 * w;
    this.hips.rotation.y = s * 0.06 * w;
    this.head.rotation.x = -0.1 * r + Math.sin(this.t * 0.7) * 0.02 * idle;
    this.head.rotation.y = Math.sin(this.t * 0.37) * 0.25 * idle * (Math.sin(this.t * 0.11) > 0.6 ? 1 : 0.2);
    // passos
    const sign = Math.sign(s) || 1;
    if (grounded && speed > 0.3 && sign !== this.lastStepSign) this.onStep?.(running);
    this.lastStepSign = sign;
  }
}
