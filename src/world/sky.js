import * as THREE from 'three';
import { ensureColor, G } from '../engine/ps1material.js';
import { SKY } from '../engine/textures.js';

// Céu: domo low poly com a textura de nuvens da pasta (tingido pela hora do dia),
// sol pálido atrás das nuvens, lua (cheia, de sangue), estrelas nas noites limpas
// e o raio das tempestades. O clima (world/atmosphere.js) controla tudo.

function glowTex(stops, size = 32) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2;
  const rg = g.createRadialGradient(h, h, 1, h, h, h);
  for (const [t, col] of stops) rg.addColorStop(t, col);
  g.fillStyle = rg; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return tex;
}

// lua: disco claro com manchas (mares) e um halo largo
function moonTex() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), h = S / 2;
  const halo = g.createRadialGradient(h, h, 10, h, h, h);
  halo.addColorStop(0, 'rgba(255,255,255,0.35)'); halo.addColorStop(0.45, 'rgba(255,255,255,0.12)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo; g.fillRect(0, 0, S, S);
  const R = S * 0.22;
  const disc = g.createRadialGradient(h - 4, h - 4, 2, h, h, R);
  disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.8, '#e8e6dc'); disc.addColorStop(1, '#c8c4b4');
  g.fillStyle = disc; g.beginPath(); g.arc(h, h, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(120,118,110,0.45)';
  for (const [x, y, r] of [[-6, -5, 7], [5, 3, 6], [-2, 8, 4], [8, -7, 3], [-9, 4, 3], [2, -10, 3]]) { g.beginPath(); g.arc(h + x, h + y, r, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return tex;
}

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
  const sunMat = new THREE.MeshBasicMaterial({ map: glowTex([[0, 'rgba(120,118,112,0.5)'], [0.35, 'rgba(90,88,84,0.25)'], [1, 'rgba(60,60,60,0)']]), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), sunMat);
  sun.renderOrder = -9;
  sun.frustumCulled = false;
  // estrelas: pontos fixos no hemisfério de cima
  const sp = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, y = 0.12 + rnd() * 0.88, r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * r * 1500, y * 1500, Math.sin(a) * r * 1500);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(sg, starMat);
  stars.renderOrder = -9.5; stars.frustumCulled = false;
  // lua
  const moonMat = new THREE.MeshBasicMaterial({ map: moonTex(), transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMat);
  moon.renderOrder = -8.5; moon.frustumCulled = false;
  // raio: tira quebrada somada à cena (aparece por um instante nas tempestades)
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xdde6ff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.visible = false; bolt.frustumCulled = false; bolt.renderOrder = -8;

  const group = new THREE.Group();
  group.add(sky, stars, sun, moon, bolt);
  group.sun = sun; group.moon = moon; group.stars = stars; group.bolt = bolt;
  group.moonDir = new THREE.Vector3(0.5, 0.45, -0.7).normalize();
  group.moonSize = 160;
  group.update = (camera) => {
    group.position.copy(camera.position);
    sun.position.copy(G.uSunDir.value).multiplyScalar(1500);
    moon.position.copy(group.moonDir).multiplyScalar(1400);
    moon.scale.setScalar(group.moonSize);
    group.updateMatrixWorld();
    sun.lookAt(camera.position);
    moon.lookAt(camera.position);
  };
  // raio de (x, z) no horizonte até o alto, em coordenadas do céu
  group.makeBolt = (dirAngle) => {
    const pts = [], R = 1300;
    let x = Math.sin(dirAngle) * R, z = Math.cos(dirAngle) * R, y = 520;
    pts.push([x, y, z]);
    while (y > -40) {
      y -= 60 + Math.random() * 70;
      x += (Math.random() - 0.5) * 90; z += (Math.random() - 0.5) * 90;
      pts.push([x, y, z]);
    }
    const P = [], w = 7;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      // faixa voltada para o centro (onde está a câmera)
      const nx = -a[2], nz = a[0], l = Math.hypot(nx, nz) || 1, ox = nx / l * w, oz = nz / l * w;
      P.push(a[0] - ox, a[1], a[2] - oz, a[0] + ox, a[1], a[2] + oz, b[0] + ox, b[1], b[2] + oz);
      P.push(a[0] - ox, a[1], a[2] - oz, b[0] + ox, b[1], b[2] + oz, b[0] - ox, b[1], b[2] - oz);
    }
    bolt.geometry.dispose();
    bolt.geometry = new THREE.BufferGeometry();
    bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  };
  return group;
}

// neblina pela distância de visão escolhida (o clima multiplica pelo fator da hora)
export const FOG_FAR = [110, 160, 230];
export function applyAtmosphere(drawDistance) {
  const far = FOG_FAR[drawDistance] ?? 160;
  G.uFogNear.value = far * 0.04;
  G.uFogFar.value = far;
  G.uFogColor.value.setRGB(...SKY.horizon);
  return far;
}
