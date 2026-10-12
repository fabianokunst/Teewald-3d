import * as THREE from 'three';
import { ensureColor, G } from '../engine/ps1material.js';
import { SKY } from '../engine/textures.js';

// Céu de fim de tarde de outono: domo low poly com a textura de nuvens da pasta
export function makeSky(M) {
  const geo = new THREE.SphereGeometry(1800, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  ensureColor(geo);
  // remapeia o v para o degradê (topo da textura = zênite, meio = horizonte)
  const uv = geo.getAttribute('uv'), pos = geo.getAttribute('position');
  for (let i = 0; i < uv.count; i++) {
    const y = pos.getY(i) / 1800;
    uv.setY(i, 1 - Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI);
  }
  const sky = new THREE.Mesh(geo, M.sky);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  // sol
  const sunC = document.createElement('canvas'); sunC.width = sunC.height = 32;
  const g = sunC.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,248,220,1)'); rg.addColorStop(0.3, 'rgba(255,220,150,0.9)'); rg.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(sunC);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sun.renderOrder = -9;
  sun.frustumCulled = false;
  const group = new THREE.Group();
  group.add(sky, sun);
  group.update = (camera) => {
    group.position.copy(camera.position);
    sun.position.copy(G.uSunDir.value).multiplyScalar(1500);
    group.updateMatrixWorld();
    sun.lookAt(camera.position);
  };
  return group;
}

export function applyAtmosphere(drawDistance) {
  const far = [190, 300, 460][drawDistance] ?? 300;
  G.uFogNear.value = far * 0.12;
  G.uFogFar.value = far;
  G.uFogColor.value.setRGB(...SKY.horizon);
  return far;
}
