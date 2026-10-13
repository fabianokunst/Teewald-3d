import * as THREE from 'three';
import { ensureColor, G } from '../engine/ps1material.js';
import { SKY, IMG, makeCanvas } from '../engine/textures.js';

// Céu: domo low poly com a textura de nuvens da pasta (tingido pela hora do dia),
// sol pálido atrás das nuvens, lua (cheia, de sangue), estrelas nas noites limpas
// e o raio das tempestades. O clima (world/atmosphere.js) controla tudo.
// Na luz avançada o domo troca de material: degradê calculado por pixel, brilho em
// volta do sol, disco do sol avermelhado, nuvens (da mesma textura) iluminadas por
// baixo, e por trás delas um céu de estrelas com Via Láctea e uma lua detalhada.

// ---------- luz avançada ----------

// máscara de nuvem: a textura Elements_05 da pasta (branco = nuvem, azul = céu)
function cloudMask() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const img = IMG['Elements/Elements_05-256x256.png'];
  if (img) g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const r = d.data[i * 4], b = d.data[i * 4 + 2];
    const k = img ? Math.max(0, Math.min(1, 1 - (b - r - 8) / 70)) : 0;
    const v = Math.round(k * k * (3 - 2 * k) * 255);
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// domo avançado: a cor sai daqui; alpha = o quanto tapa as estrelas e a lua desenhadas antes
// (mistura: cor + fundo * (1 - alpha))
function skyAdvMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uClouds: { value: cloudMask() },
      uSunDir: G.uSunDir, uFogColor: G.uFogColor, uSunFog: G.uSunFog, uSunFogK: G.uSunFogK, uTime: G.uTime,
      uZenith: { value: new THREE.Color(0.2, 0.22, 0.3) },
      uGlow: { value: new THREE.Color(0, 0, 0) },
      uDisc: { value: new THREE.Color(0, 0, 0) },
      uCloudC: { value: new THREE.Color(0.3, 0.3, 0.32) },
      uCloudLit: { value: new THREE.Color(0, 0, 0) },
      uCover: { value: 0.8 },
      uOpaque: { value: 1 },
      uMilky: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uClouds;
      uniform vec3 uSunDir, uFogColor, uSunFog, uZenith, uGlow, uDisc, uCloudC, uCloudLit;
      uniform float uSunFogK, uTime, uCover, uOpaque, uMilky, uFlash;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        float sd = max(dot(d, uSunDir), 0.0);
        // horizonte = cor da neblina (o chão some nela sem emenda), mais quente do lado do sol
        vec3 hor = mix(uFogColor, uSunFog, pow(sd, 5.0) * uSunFogK);
        vec3 sky = mix(hor, uZenith, smoothstep(0.0, 0.6, pow(h, 0.65)));
        sky += uGlow * (pow(sd, 6.0) * 0.55 + pow(sd, 60.0) * 0.9);
        // Via Láctea: faixa difusa e manchada atravessando o céu
        vec3 mwN = normalize(vec3(0.55, 0.3, 0.78));
        float band = exp(-pow(dot(d, mwN) / 0.16, 2.0));
        vec2 mp = d.xz / (d.y + 0.35);
        float mott = texture2D(uClouds, mp * 0.9 + 0.3).r * 0.6 + texture2D(uClouds, mp * 2.3).r * 0.4;
        sky += uMilky * band * (0.35 + mott) * vec3(0.55, 0.6, 0.75) * smoothstep(0.03, 0.3, h);
        // disco do sol (as nuvens passam na frente)
        sky += uDisc * smoothstep(0.99905, 0.99935, sd);
        // nuvens numa camada plana, deslizando com o vento; somem perto do horizonte
        vec2 p = d.xz / (d.y + 0.11);
        vec2 w = vec2(uTime * 0.0035, uTime * 0.0012);
        float cl = texture2D(uClouds, p * 0.16 + w).r * 0.65 + texture2D(uClouds, p * 0.41 - w * 1.7 + 0.37).r * 0.35;
        // cobertura: com pouca nuvem só as partes densas ficam (o resto do céu abre)
        cl = smoothstep(mix(0.72, 0.16, uCover), 0.86, cl) * smoothstep(0.0, 0.16, d.y);
        // nuvens acesas por baixo do lado do sol (ou da lua), bordas mais claras
        float lit = pow(sd, 3.0) * 1.1 + 0.35 * pow(1.0 - h, 2.0) * (0.3 + 0.7 * sd);
        vec3 cc = uCloudC + uCloudLit * lit * (1.25 - cl * 0.6);
        vec3 col = mix(sky, cc, cl);
        // perto do horizonte tudo se desfaz na neblina (emenda com os morros distantes)
        col = mix(col, hor, pow(1.0 - h, 10.0) * 0.85);
        col += uFlash * vec3(0.55, 0.6, 0.78) * (0.35 + cl);
        gl_FragColor = vec4(col, max(cl, uOpaque));
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

// estrelas com tamanho, brilho e cor variados, piscando; metade concentrada na Via Láctea
function starFieldHD() {
  const pos = [], size = [], bright = [], col = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mwN = new THREE.Vector3(0.55, 0.3, 0.78).normalize();
  const a1 = new THREE.Vector3(0, 1, 0).cross(mwN).normalize(), a2 = mwN.clone().cross(a1);
  const v = new THREE.Vector3();
  const add = (x, y, z, s, b) => {
    v.set(x, y, z).normalize();
    if (v.y < 0.02) return;
    pos.push(v.x * 1500, v.y * 1500, v.z * 1500);
    size.push(s); bright.push(b);
    const t = rnd();
    // a maioria branca; algumas azuladas, outras amareladas
    col.push(...(t < 0.18 ? [0.75, 0.85, 1] : t > 0.86 ? [1, 0.88, 0.7] : [0.95, 0.96, 1]));
  };
  for (let i = 0; i < 1700; i++) {
    const a = rnd() * Math.PI * 2, y = rnd(), r = Math.sqrt(1 - y * y);
    const k = Math.pow(rnd(), 5);
    add(Math.cos(a) * r, y, Math.sin(a) * r, 1.5 + k * 2.6, 0.35 + k * 0.65);
  }
  for (let i = 0; i < 1600; i++) {
    const a = rnd() * Math.PI * 2, off = (rnd() + rnd() + rnd() - 1.5) * 0.14;
    v.copy(a1).multiplyScalar(Math.cos(a)).addScaledVector(a2, Math.sin(a)).addScaledVector(mwN, off);
    add(v.x, v.y, v.z, 1.0 + rnd() * 0.8, 0.18 + rnd() * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: G.uTime, uStars: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aBright; attribute vec3 aCol;
      uniform float uTime, uStars, uScale;
      varying vec3 vC;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float ph = fract(position.x * 0.0137 + position.z * 0.0291) * 6.2832;
        float tw = 0.72 + 0.28 * sin(uTime * (1.3 + ph * 0.5) + ph * 7.0);
        float h = normalize(position).y;
        vC = aCol * aBright * tw * uStars * 2.2 * smoothstep(0.02, 0.22, h);
        gl_PointSize = max(1.0, aSize * uScale);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.25, 1.0, r);
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
    depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -12;
  return pts;
}

// lua detalhada: borda mais escura, mares irregulares e crateras com raios
function moonTexHD() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'), h = S / 2, R = S * 0.46;
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.save();
  g.beginPath(); g.arc(h, h, R, 0, Math.PI * 2); g.clip();
  const disc = g.createRadialGradient(h - R * 0.15, h - R * 0.15, R * 0.1, h, h, R);
  disc.addColorStop(0, '#fbf8ee'); disc.addColorStop(0.75, '#e6e1d2'); disc.addColorStop(1, '#a9a395');
  g.fillStyle = disc; g.fillRect(0, 0, S, S);
  // mares: manchas grandes e suaves
  for (const [x, y, r, a] of [[-0.3, -0.25, 0.32, 0.3], [0.12, -0.32, 0.24, 0.26], [0.25, 0.05, 0.3, 0.24], [-0.12, 0.2, 0.22, 0.22], [-0.42, 0.18, 0.16, 0.2], [0.05, 0.42, 0.14, 0.16]]) {
    for (let k = 0; k < 7; k++) {
      const px = h + (x + (rnd() - 0.5) * r * 0.8) * R, py = h + (y + (rnd() - 0.5) * r * 0.8) * R, pr = r * R * (0.45 + rnd() * 0.5);
      const m = g.createRadialGradient(px, py, 0, px, py, pr);
      m.addColorStop(0, `rgba(92,90,88,${a})`); m.addColorStop(1, 'rgba(92,90,88,0)');
      g.fillStyle = m; g.fillRect(0, 0, S, S);
    }
  }
  // crateras: anel claro com centro escuro
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.92, cr = 1.5 + Math.pow(rnd(), 3) * 9;
    const x = h + Math.cos(a) * d, y = h + Math.sin(a) * d;
    g.fillStyle = 'rgba(70,68,64,0.28)'; g.beginPath(); g.arc(x + cr * 0.15, y + cr * 0.15, cr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,253,245,0.35)'; g.lineWidth = Math.max(0.8, cr * 0.25); g.beginPath(); g.arc(x, y, cr, 0, Math.PI * 2); g.stroke();
  }
  // Tycho: cratera com raios claros
  const tx = h + R * 0.18, ty = h + R * 0.58;
  g.strokeStyle = 'rgba(255,252,240,0.12)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, l = R * (0.3 + rnd() * 0.6); g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * l, ty + Math.sin(a) * l); g.stroke(); }
  g.fillStyle = '#fffdf4'; g.beginPath(); g.arc(tx, ty, 3.5, 0, Math.PI * 2); g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

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

  // luz avançada: domo calculado, estrelas e lua desenhadas antes dele (as nuvens passam na frente)
  const advMat = skyAdvMaterial();
  const starsHD = starFieldHD();
  starsHD.visible = false;
  const moonHD = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: moonTexHD(), depthWrite: false, fog: false, opacity: 0,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  moonHD.renderOrder = -11.5; moonHD.frustumCulled = false; moonHD.visible = false;

  const group = new THREE.Group();
  group.add(sky, stars, sun, moon, bolt, starsHD, moonHD);
  group.sun = sun; group.moon = moon; group.stars = stars; group.bolt = bolt;
  group.dome = sky; group.adv = advMat; group.starsHD = starsHD; group.moonHD = moonHD;
  group.userData.noShadow = true;
  group.moonDir = new THREE.Vector3(0.5, 0.45, -0.7).normalize();
  group.moonSize = 160;
  group.setAdvanced = on => { sky.material = on ? advMat : M.sky; };
  group.update = (camera) => {
    group.position.copy(camera.position);
    sun.position.copy(G.uSunDir.value).multiplyScalar(1500);
    moon.position.copy(group.moonDir).multiplyScalar(1400);
    moon.scale.setScalar(group.moonSize);
    moonHD.position.copy(moon.position);
    moonHD.scale.setScalar(group.moonSize * 0.48);
    group.updateMatrixWorld();
    sun.lookAt(camera.position);
    moon.lookAt(camera.position);
    moonHD.lookAt(camera.position);
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
