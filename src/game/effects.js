import * as THREE from 'three';
import { ps1Material, ensureColor } from '../engine/ps1material.js';
import { canvasTex, makeCanvas, processPixels } from '../engine/textures.js';

// Efeitos de tiro: partículas (poeira, faíscas, lascas, cacos, cápsulas), marcas
// de bala nas superfícies e o clarão do cano. Partículas são quadrados virados
// para a câmera que encolhem até sumir (sem transparência, como no PS1).

const MAX_P = 640, MAX_D = 60, MAX_R = 48;

// cores das partículas por superfície
const DUST = {
  wall: [[0.78, 0.74, 0.66], [0.6, 0.57, 0.5]],
  wood: [[0.5, 0.34, 0.2], [0.68, 0.5, 0.3]],
  metal: [[0.55, 0.55, 0.55], [0.4, 0.4, 0.42]],
  dirt: [[0.45, 0.36, 0.25], [0.35, 0.3, 0.2]],
  road: [[0.55, 0.55, 0.55], [0.42, 0.42, 0.44]],
  water: [[0.85, 0.9, 0.95], [0.7, 0.78, 0.82]],
};

function puffTexture() {
  const c = makeCanvas(16, 16), g = c.getContext('2d'), d = g.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5), i = (y * 16 + x) * 4;
    const v = 255 - r * 6;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = r < 7.2 - ((x * 7 + y * 13) % 3) * 0.6 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  return canvasTex(c, false);
}

function holeTexture() {
  const c = makeCanvas(16, 16), g = c.getContext('2d'), d = g.createImageData(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5), i = (y * 16 + x) * 4;
    const jag = 5.5 + Math.sin(Math.atan2(y - 7.5, x - 7.5) * 5) * 1.2;
    const v = r < 2.2 ? 14 : r < 3.6 ? 38 : 70;
    d.data[i] = v; d.data[i + 1] = v * 0.92; d.data[i + 2] = v * 0.85;
    d.data[i + 3] = r < jag ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  return canvasTex(c, false);
}

// marola: anel claro de borda macia (somado à água)
function ringTexture() {
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const r = Math.hypot(x - 15.5, y - 15.5), i = (y * 32 + x) * 4;
    const v = Math.max(0, 1 - Math.abs(r - 12.5) / 2.4) * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return canvasTex(c, false);
}

function flashTexture() {
  const c = makeCanvas(32, 32), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 32, 32);
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  rg.addColorStop(0, '#fffbe0'); rg.addColorStop(0.25, '#ffd860'); rg.addColorStop(0.6, '#c85a10'); rg.addColorStop(1, '#000');
  g.fillStyle = rg;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = i % 2 ? 6 : 15;
    g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  return canvasTex(processPixels(c), false);
}

export class Effects {
  constructor(scene) {
    // partículas
    const pg = ensureColor(new THREE.PlaneGeometry(1, 1));
    this.pMat = ps1Material({ map: puffTexture(), lit: false, cutout: true, side: THREE.DoubleSide });
    this.pMesh = new THREE.InstancedMesh(pg, this.pMat, MAX_P);
    this.pMesh.frustumCulled = false;
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_P; i++) { this.pMesh.setMatrixAt(i, zero); this.pMesh.setColorAt(i, col); this.parts.push({ life: 0 }); }
    scene.add(this.pMesh);
    this.pNext = 0;

    // marcas de bala
    const dg = ensureColor(new THREE.PlaneGeometry(1, 1));
    this.dMat = ps1Material({ map: holeTexture(), lit: false, cutout: true, polygonOffset: -4 });
    this.dMesh = new THREE.InstancedMesh(dg, this.dMat, MAX_D);
    this.dMesh.frustumCulled = false;
    for (let i = 0; i < MAX_D; i++) this.dMesh.setMatrixAt(i, zero);
    scene.add(this.dMesh);
    this.dNext = 0;

    // clarão (somado à cena)
    this.flashMat = ps1Material({ map: flashTexture(), lit: false, fog: false, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.flashMat.blending = THREE.AdditiveBlending;

    // marolas: anéis deitados na água que abrem e apagam (somados à cena)
    const rg = ensureColor(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.rMat = ps1Material({ map: ringTexture(), lit: false, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.rMat.blending = THREE.AdditiveBlending;
    this.rMesh = new THREE.InstancedMesh(rg, this.rMat, MAX_R);
    this.rMesh.frustumCulled = false;
    this.rMesh.renderOrder = 3;
    this.rMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rips = [];
    for (let i = 0; i < MAX_R; i++) { this.rMesh.setMatrixAt(i, zero); this.rMesh.setColorAt(i, col); this.rips.push({ life: 0 }); }
    scene.add(this.rMesh);
    this.rNext = 0;

    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this._z = new THREE.Vector3(0, 0, 1);
  }

  // clarão do cano: 2 planos cruzados ao longo do cano (+z) e 1 de frente
  makeFlash() {
    const B = [];
    const L = 0.2, W = 0.075, F = 0.06;
    B.push(-W, 0, 0, W, 0, 0, W, 0, L, -W, 0, 0, W, 0, L, -W, 0, L);
    B.push(0, -W, 0, 0, W, 0, 0, W, L, 0, -W, 0, 0, W, L, 0, -W, L);
    B.push(-F, -F, 0.01, F, -F, 0.01, F, F, 0.01, -F, -F, 0.01, F, F, 0.01, -F, F, 0.01);
    const uv = [0, 0.5, 1, 0.5, 1, 1, 0, 0.5, 1, 1, 0, 1];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([...uv, ...uv, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(54).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    ensureColor(geo);
    const m = new THREE.Mesh(geo, this.flashMat);
    m.frustumCulled = false;
    m.renderOrder = 5;
    m.visible = false;
    return m;
  }

  // o: { p, v, life, s0, s1, sx, sy, color, grav, bounce, drag, spin, onBounce }
  spawn(o) {
    const idx = this.pNext, P = this.parts[idx];
    this.pNext = (idx + 1) % MAX_P;
    P.p = new THREE.Vector3().copy(o.p);
    P.v = new THREE.Vector3().copy(o.v || this._v.set(0, 0, 0));
    P.life = P.max = o.life ?? 0.5;
    P.s0 = o.s0 ?? 0.08; P.s1 = o.s1 ?? 0;
    P.sx = o.sx ?? 1; P.sy = o.sy ?? 1;
    P.grav = o.grav ?? 0; P.bounce = o.bounce ?? 0; P.drag = o.drag ?? 0;
    P.roll = Math.random() * 6.28; P.spin = o.spin ?? 0;
    P.onBounce = o.onBounce || null; P.bounced = 0;
    P.color = o.color;
    this.pMesh.setColorAt(idx, this._c.setRGB(o.color[0], o.color[1], o.color[2]));
    this.pMesh.instanceColor.needsUpdate = true;
    return P;
  }

  // impacto numa superfície: poeira na direção da normal, faíscas no metal, lascas na madeira
  impact(p, n, surface, decal = true) {
    const cols = DUST[surface] || DUST.wall;
    const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
    const nv = new THREE.Vector3(n[0], n[1], n[2]);
    const at = new THREE.Vector3(p[0], p[1], p[2]).addScaledVector(nv, 0.03);
    const puffs = surface === 'water' ? 9 : 5;
    for (let i = 0; i < puffs; i++) {
      const c = cols[i % 2], k = 0.9 + Math.random() * 0.2;
      const v = nv.clone().multiplyScalar(0.6 + Math.random() * 1.2).add(this._v.set(rnd(0.5), rnd(0.5) + (surface === 'water' ? 2.2 : 0.3), rnd(0.5)));
      this.spawn({ p: at, v, life: 0.35 + Math.random() * 0.35, s0: 0.05 + Math.random() * 0.05, s1: 0.14 + Math.random() * 0.08, color: [c[0] * k, c[1] * k, c[2] * k], drag: 3, grav: surface === 'water' ? 6 : -0.6 });
    }
    if (surface === 'metal' || surface === 'road') {
      for (let i = 0; i < (surface === 'metal' ? 7 : 3); i++) {
        const v = nv.clone().multiplyScalar(2 + Math.random() * 3).add(this._v.set(rnd(2.5), rnd(2) + 1, rnd(2.5)));
        this.spawn({ p: at, v, life: 0.18 + Math.random() * 0.2, s0: 0.03, s1: 0.01, color: [1, 0.85, 0.4], grav: 9, drag: 1 });
      }
    }
    if (surface === 'wood' || surface === 'dirt') {
      for (let i = 0; i < 4; i++) {
        const v = nv.clone().multiplyScalar(1.5 + Math.random() * 2).add(this._v.set(rnd(1.2), Math.random() * 2, rnd(1.2)));
        this.spawn({ p: at, v, life: 0.9, s0: 0.025, s1: 0.02, sx: 0.6, color: surface === 'wood' ? [0.62, 0.45, 0.26] : [0.36, 0.42, 0.2], grav: 9.8, bounce: 0.3, spin: 12 });
      }
    }
    if (surface !== 'water' && decal) this.decal(p, n);
  }

  // marola na superfície da água (y = nível da água); size = diâmetro final em metros
  ripple(x, y, z, size = 1, life = 1.1, bright = 0.3) {
    const R = this.rips[this.rNext];
    this.rNext = (this.rNext + 1) % MAX_R;
    R.x = x; R.y = y + 0.05; R.z = z;
    R.s0 = size * 0.2; R.s1 = size; R.life = R.max = life; R.b = bright;
  }

  // respingo: gotas para cima e uma marola; k = força (0,3 passo na água rasa, 1 queda, 2 mergulho)
  splash(x, y, z, k = 1) {
    const cols = DUST.water, rnd = a => (Math.random() - 0.5) * 2 * a;
    for (let i = 0, n = Math.round(3 + 9 * k); i < n; i++) {
      const c = cols[i % 2], up = (1.2 + Math.random() * 2.2) * Math.min(1.6, 0.5 + k * 0.6);
      this.spawn({ p: this._v.set(x + rnd(0.18 * k), y + 0.04, z + rnd(0.18 * k)), v: new THREE.Vector3(rnd(0.9 + k * 0.5), up, rnd(0.9 + k * 0.5)), life: 0.35 + Math.random() * 0.35, s0: 0.035 + Math.random() * 0.03 * k, s1: 0.015, color: c, grav: 9.8, drag: 0.6 });
    }
    this.ripple(x, y, z, 0.7 + k * 0.9, 0.9 + k * 0.4, 0.22 + 0.1 * Math.min(1, k));
  }

  // garrafa quebrando
  shatter(p, dir, color) {
    const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3(dir.x * 2 + rnd(2.2), 1 + Math.random() * 3, dir.z * 2 + rnd(2.2));
      const k = 0.8 + Math.random() * 0.5;
      this.spawn({ p: new THREE.Vector3(p.x + rnd(0.04), p.y + Math.random() * 0.2, p.z + rnd(0.04)), v, life: 1.2 + Math.random() * 0.6, s0: 0.03 + Math.random() * 0.025, s1: 0.015, sx: 0.5 + Math.random() * 0.5, color: [color[0] * k, color[1] * k, color[2] * k], grav: 9.8, bounce: 0.25, spin: 15, drag: 0.5 });
    }
    for (let i = 0; i < 3; i++) this.spawn({ p, v: new THREE.Vector3(rnd(0.4), 0.6 + Math.random() * 0.5, rnd(0.4)), life: 0.4, s0: 0.06, s1: 0.16, color: [0.85, 0.92, 0.88], drag: 3 });
  }

  // cápsula de latão ejetada
  casing(p, v, onBounce) {
    return this.spawn({ p, v, life: 2.2, s0: 0.016, s1: 0.016, sx: 0.55, sy: 1, color: [0.95, 0.75, 0.35], grav: 9.8, bounce: 0.35, spin: 25, drag: 0.3, onBounce });
  }

  decal(p, n) {
    const i = this.dNext;
    this.dNext = (this.dNext + 1) % MAX_D;
    const nv = this._v.set(n[0], n[1], n[2]).normalize();
    this._q.setFromUnitVectors(this._z, nv);
    this._q2.setFromAxisAngle(this._z, Math.random() * 6.28);
    this._q.multiply(this._q2);
    const s = 0.06 + Math.random() * 0.03;
    this._m.compose(this._s.set(p[0] + nv.x * 0.006, p[1] + nv.y * 0.006, p[2] + nv.z * 0.006), this._q, new THREE.Vector3(s, s, s));
    this.dMesh.setMatrixAt(i, this._m);
    this.dMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, camera, groundAt) {
    const cq = camera.quaternion;
    for (let i = 0; i < MAX_P; i++) {
      const P = this.parts[i];
      if (P.life <= 0) continue;
      P.life -= dt;
      if (P.life <= 0) { this._m.makeScale(0, 0, 0); this.pMesh.setMatrixAt(i, this._m); continue; }
      P.v.y -= P.grav * dt;
      if (P.drag) P.v.multiplyScalar(Math.max(0, 1 - P.drag * dt));
      P.p.addScaledVector(P.v, dt);
      P.roll += P.spin * dt;
      if (P.bounce) {
        const g = groundAt(P.p.x, P.p.z, P.p.y) + 0.01;
        if (P.p.y < g) {
          P.p.y = g;
          if (P.v.y < -0.6) { P.v.y = -P.v.y * P.bounce; P.v.x *= 0.6; P.v.z *= 0.6; P.spin *= 0.6; if (P.bounced++ < 2) P.onBounce?.(P); }
          else { P.v.set(0, 0, 0); P.spin = 0; }
        }
      }
      const t = 1 - P.life / P.max, s = P.s0 + (P.s1 - P.s0) * t;
      this._q2.setFromAxisAngle(this._z, P.roll);
      this._q.copy(cq).multiply(this._q2);
      this._m.compose(P.p, this._q, this._s.set(s * P.sx, s * P.sy, s));
      this.pMesh.setMatrixAt(i, this._m);
    }
    this.pMesh.instanceMatrix.needsUpdate = true;
    // marolas: abrem rápido no começo e apagam até sumir
    let live = false;
    for (let i = 0; i < MAX_R; i++) {
      const R = this.rips[i];
      if (R.life <= 0) continue;
      R.life -= dt;
      if (R.life <= 0) { this._m.makeScale(0, 0, 0); this.rMesh.setMatrixAt(i, this._m); live = true; continue; }
      const t = 1 - R.life / R.max, s = R.s0 + (R.s1 - R.s0) * (1 - (1 - t) * (1 - t)), b = R.b * (1 - t);
      this._m.makeScale(s, 1, s).setPosition(R.x, R.y, R.z);
      this.rMesh.setMatrixAt(i, this._m);
      this.rMesh.setColorAt(i, this._c.setRGB(b, b * 1.04, b * 1.06));
      live = true;
    }
    if (live) { this.rMesh.instanceMatrix.needsUpdate = true; this.rMesh.instanceColor.needsUpdate = true; }
  }
}
