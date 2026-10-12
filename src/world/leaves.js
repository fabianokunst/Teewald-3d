import * as THREE from 'three';
import { ensureColor } from '../engine/ps1material.js';

// Folhas de plátano caindo em volta do jogador
export class FallingLeaves {
  constructor(material, terrain, count = 260) {
    this.terrain = terrain;
    const geo = ensureColor(new THREE.PlaneGeometry(0.32, 0.32));
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.frustumCulled = false;
    this.items = [];
    const cols = [[1, 1, 1], [1.15, 0.7, 0.45], [1.1, 0.9, 0.5], [0.85, 0.6, 0.35], [1.2, 0.55, 0.3]];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.items.push(this._spawn({}, 0, 0, 0, true));
      const k = cols[i % cols.length];
      this.mesh.setColorAt(i, c.setRGB(k[0], k[1], k[2]));
    }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
  }

  _spawn(it, cx, cy, cz, anywhere) {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 34;
    it.x = cx + Math.cos(a) * r; it.z = cz + Math.sin(a) * r;
    it.y = cy + (anywhere ? Math.random() * 14 : 9 + Math.random() * 6);
    it.vy = -(0.5 + Math.random() * 0.6);
    it.ph = Math.random() * 10; it.sp = 0.8 + Math.random() * 1.2;
    it.rx = Math.random() * 6; it.ry = Math.random() * 6; it.rest = 0;
    return it;
  }

  update(dt, center, t) {
    const T = this.terrain;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (Math.hypot(it.x - center.x, it.z - center.z) > 42) this._spawn(it, center.x, center.y, center.z, true);
      const g = T.heightAt(it.x, it.z) + 0.03;
      if (it.y > g) {
        it.y += it.vy * dt;
        it.x += Math.sin(t * it.sp + it.ph) * 0.6 * dt + 0.25 * dt;
        it.z += Math.cos(t * it.sp * 0.7 + it.ph) * 0.5 * dt;
        it.rx += dt * 2.1 * it.sp; it.ry += dt * 1.3;
      } else {
        it.y = g; it.rest += dt;
        if (it.rest > 6) this._spawn(it, center.x, center.y, center.z, false);
      }
      const onGround = it.y <= g + 0.001;
      this.e.set(onGround ? -Math.PI / 2 : it.rx, it.ry, onGround ? 0 : Math.sin(it.rx) * 0.8);
      this.q.setFromEuler(this.e);
      this.v.set(it.x, it.y, it.z);
      this.m4.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
