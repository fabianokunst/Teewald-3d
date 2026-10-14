import * as THREE from 'three';
import { G, NUM_LIGHTS, ps1Material, ensureColor } from '../engine/ps1material.js';
import { canvasTex, makeCanvas, SKY } from '../engine/textures.js';
import { M } from '../engine/materials.js';
import { FOG_FAR } from './sky.js';

// Hora do dia e clima de Teewald: tarde encoberta, anoitecer, noite, lua cheia,
// madrugada de neblina, chuva, tempestade com raios, lua de sangue, amanhecer e
// interiores escuros. Cada estado mexe na luz do sol/lua, no ambiente, na neblina,
// no céu, nos postes, na chuva e nos sons; a troca é suave.
// Também cuida das luzes dinâmicas: lanterna do jogador (foco), postes acesos
// perto da câmera e pedidos de outros sistemas (fogo, clarões, olhos que brilham).

const C = (r, g, b) => [r, g, b];
const BASE = {
  sun: [-0.62, 0.4, -0.68], sunC: C(0.5, 0.49, 0.47), sky: C(0.47, 0.49, 0.53), gnd: C(0.3, 0.28, 0.27),
  fog: SKY.horizon, fogK: 1, skyTint: C(1, 1, 1), sunGlow: 1, moon: 0, moonC: C(1, 1, 1), moonSize: 150, stars: 0,
  lamps: 0, rain: 0, storm: 0, wind: 0.2, flashlight: 0, night: 0, crickets: 0, indoor: 0,
  // só na luz avançada: sombra, neblina do lado do sol, sol que abraça o chão, saturação
  // e o céu calculado (zênite, brilho e disco do sol, nuvens, Via Láctea)
  shadow: 0, fogSun: SKY.horizon, fogSunK: 0, sunWrap: 0, sat: 0.6,
  zenith: C(0.27, 0.29, 0.32), glow: C(0, 0, 0), disc: C(0, 0, 0), cloudC: C(0.38, 0.39, 0.41), cloudLit: C(0, 0, 0),
  cover: 0.85, opaque: 1, milky: 0,
};
// direção da lua no céu (as noites claras usam ela como luz principal)
const MOON = [0.5, 0.45, -0.7];

export const PRESETS = {
  // fim de tarde encoberto (o jogo começa assim)
  tarde: {},
  // sol baixo alaranjado atrás das nuvens
  anoitecer: {
    sun: [-0.8, 0.08, -0.55], sunC: C(0.55, 0.32, 0.2), sky: C(0.3, 0.26, 0.3), gnd: C(0.16, 0.13, 0.13),
    fog: C(0.36, 0.25, 0.22), fogK: 0.85, skyTint: C(0.72, 0.5, 0.45), sunGlow: 1.6, lamps: 0.6, night: 0.4, flashlight: 0,
  },
  // noite fechada, nublada
  noite: {
    sun: [0.5, 0.45, -0.7], sunC: C(0.09, 0.105, 0.16), sky: C(0.095, 0.105, 0.155), gnd: C(0.045, 0.045, 0.058),
    fog: C(0.035, 0.04, 0.06), fogK: 0.6, skyTint: C(0.11, 0.13, 0.19), sunGlow: 0, moon: 0.35, moonSize: 120, stars: 0.15,
    lamps: 1, night: 1, flashlight: 1, crickets: 0.6, wind: 0.25,
  },
  // céu limpo, lua cheia enorme, luz azulada (lobisomem)
  luaCheia: {
    sun: [0.45, 0.55, -0.7], sunC: C(0.2, 0.23, 0.32), sky: C(0.13, 0.15, 0.22), gnd: C(0.05, 0.055, 0.07),
    fog: C(0.08, 0.1, 0.15), fogK: 0.8, skyTint: C(0.2, 0.25, 0.38), sunGlow: 0, moon: 1, moonSize: 260, stars: 0.9,
    lamps: 1, night: 1, flashlight: 1, crickets: 1, wind: 0.15,
  },
  // madrugada: neblina baixa e muito fechada
  madrugada: {
    sun: [0.3, 0.3, 0.9], sunC: C(0.1, 0.11, 0.13), sky: C(0.13, 0.14, 0.16), gnd: C(0.07, 0.07, 0.08),
    fog: C(0.13, 0.14, 0.16), fogK: 0.26, skyTint: C(0.18, 0.19, 0.22), sunGlow: 0, moon: 0, stars: 0,
    lamps: 1, night: 1, flashlight: 1, crickets: 0.3, wind: 0.1,
  },
  // noite de chuva
  chuva: {
    sun: [0.5, 0.45, -0.7], sunC: C(0.075, 0.085, 0.12), sky: C(0.085, 0.095, 0.13), gnd: C(0.04, 0.045, 0.055),
    fog: C(0.055, 0.06, 0.075), fogK: 0.55, skyTint: C(0.1, 0.11, 0.15), sunGlow: 0, moon: 0, stars: 0,
    lamps: 1, rain: 0.65, storm: 0.15, night: 1, flashlight: 1, wind: 0.4,
  },
  // tempestade: chuva forte, vento e raios
  tempestade: {
    sun: [0.5, 0.45, -0.7], sunC: C(0.07, 0.08, 0.11), sky: C(0.08, 0.085, 0.12), gnd: C(0.04, 0.04, 0.05),
    fog: C(0.05, 0.055, 0.07), fogK: 0.5, skyTint: C(0.09, 0.1, 0.14), sunGlow: 0, moon: 0, stars: 0,
    lamps: 1, rain: 1, storm: 1, night: 1, flashlight: 1, wind: 0.75,
  },
  // garoa com neblina (cemitério)
  garoa: {
    sun: [0.5, 0.45, -0.7], sunC: C(0.07, 0.08, 0.11), sky: C(0.09, 0.1, 0.13), gnd: C(0.045, 0.045, 0.055),
    fog: C(0.1, 0.11, 0.13), fogK: 0.36, skyTint: C(0.14, 0.15, 0.19), sunGlow: 0, moon: 0.25, moonSize: 120, stars: 0,
    lamps: 1, rain: 0.25, night: 1, flashlight: 1, wind: 0.3, crickets: 0.2,
  },
  // lua de sangue (a última noite)
  luaSangue: {
    sun: [0.4, 0.5, -0.75], sunC: C(0.28, 0.07, 0.05), sky: C(0.14, 0.05, 0.05), gnd: C(0.06, 0.02, 0.02),
    fog: C(0.12, 0.03, 0.03), fogK: 0.6, skyTint: C(0.4, 0.1, 0.08), sunGlow: 0, moon: 1, moonC: C(1, 0.25, 0.15), moonSize: 300, stars: 0.3,
    lamps: 0.6, rain: 0, storm: 0.4, night: 1, flashlight: 1, wind: 0.6,
  },
  // amanhecer: o fim da noite sem fim
  amanhecer: {
    sun: [0.75, 0.16, 0.6], sunC: C(0.75, 0.55, 0.38), sky: C(0.52, 0.47, 0.5), gnd: C(0.3, 0.25, 0.22),
    fog: C(0.7, 0.58, 0.5), fogK: 1.2, skyTint: C(1.08, 0.86, 0.8), sunGlow: 2.2, moon: 0, stars: 0, lamps: 0, night: 0, crickets: 0, wind: 0.1,
  },
  // interior escuro (fábrica, cripta, gruta): só as luzes do lugar e a lanterna
  interior: {
    sun: [0.2, 0.9, 0.3], sunC: C(0.035, 0.035, 0.04), sky: C(0.055, 0.055, 0.065), gnd: C(0.03, 0.03, 0.035),
    fog: C(0.012, 0.012, 0.016), fogK: 0.2, skyTint: C(0, 0, 0), sunGlow: 0, moon: 0, stars: 0,
    lamps: 0, rain: 0, storm: 0, night: 1, flashlight: 1, wind: 0, crickets: 0, indoor: 1,
  },
  // dentro da igreja de noite: quase nada entra pelos vitrais, só as velas e a lamparina
  igreja: {
    sun: [0.3, 0.85, 0.4], sunC: C(0.06, 0.065, 0.09), sky: C(0.1, 0.1, 0.12), gnd: C(0.05, 0.045, 0.05),
    fog: C(0.016, 0.015, 0.02), fogK: 0.28, skyTint: C(0, 0, 0), sunGlow: 0, moon: 0, stars: 0,
    lamps: 0, rain: 0, storm: 0, night: 1, flashlight: 1, wind: 0, crickets: 0, indoor: 1,
  },
  // dentro da igreja no fim de tarde: luz dourada e fraca dos vitrais
  igrejaDia: {
    sun: [-0.6, 0.55, -0.55], sunC: C(0.26, 0.2, 0.15), sky: C(0.24, 0.22, 0.2), gnd: C(0.11, 0.095, 0.08),
    fog: C(0.1, 0.085, 0.07), fogK: 0.45, skyTint: C(0, 0, 0), sunGlow: 0, moon: 0, stars: 0,
    lamps: 0, rain: 0, storm: 0, night: 0, flashlight: 0, wind: 0, crickets: 0, indoor: 1,
  },
};
for (const k in PRESETS) PRESETS[k] = { ...BASE, ...PRESETS[k] };

// Luz avançada: as mesmas horas, com sol de verdade, sombras e céu calculado
const ADV = {
  // entardecer: sol baixo e avermelhado no oeste, sombras compridas, céu em brasa do lado do sol
  tarde: {
    sun: [-0.86, 0.24, -0.45], sunC: C(1.0, 0.56, 0.32), sky: C(0.3, 0.31, 0.4), gnd: C(0.21, 0.17, 0.15),
    fog: C(0.47, 0.42, 0.44), fogSun: C(0.98, 0.6, 0.36), fogSunK: 0.9, fogK: 1.05,
    zenith: C(0.2, 0.23, 0.36), glow: C(0.85, 0.42, 0.18), disc: C(1.6, 0.85, 0.45),
    cloudC: C(0.3, 0.27, 0.33), cloudLit: C(0.95, 0.45, 0.2), cover: 0.85, opaque: 1,
    shadow: 0.85, sunWrap: 0.55, sat: 0.8,
  },
  // crepúsculo: o sol encostando no morro, vermelho; as primeiras estrelas e os postes acendendo
  anoitecer: {
    sun: [-0.9, 0.07, -0.42], sunC: C(0.9, 0.32, 0.16), sky: C(0.2, 0.19, 0.28), gnd: C(0.11, 0.09, 0.1),
    fog: C(0.27, 0.21, 0.26), fogSun: C(0.88, 0.36, 0.18), fogSunK: 1, fogK: 0.9,
    zenith: C(0.07, 0.08, 0.18), glow: C(0.75, 0.25, 0.1), disc: C(1.4, 0.5, 0.22),
    cloudC: C(0.15, 0.12, 0.16), cloudLit: C(0.9, 0.3, 0.12), cover: 0.8, opaque: 0.55, stars: 0.35,
    shadow: 0.7, sunWrap: 0.7, sat: 0.82,
  },
  // noite clara: lua, estrelas, Via Láctea; luar azulado com sombra suave
  noite: {
    sun: MOON, sunC: C(0.16, 0.2, 0.33), sky: C(0.07, 0.08, 0.125), gnd: C(0.032, 0.035, 0.048),
    fog: C(0.035, 0.045, 0.07), fogSun: C(0.11, 0.13, 0.19), fogSunK: 0.7, fogK: 0.65,
    zenith: C(0.008, 0.012, 0.032), glow: C(0.12, 0.14, 0.2), cloudC: C(0.045, 0.05, 0.07), cloudLit: C(0.2, 0.22, 0.28),
    cover: 0.5, opaque: 0, moon: 1, moonSize: 170, stars: 1, milky: 0.12,
    shadow: 0.55, sunWrap: 0.4, sat: 0.72,
  },
  // lua cheia enorme, céu quase limpo, sombras azuladas bem marcadas
  luaCheia: {
    sun: MOON, sunC: C(0.25, 0.29, 0.42), sky: C(0.095, 0.11, 0.165), gnd: C(0.04, 0.045, 0.06),
    fog: C(0.065, 0.085, 0.125), fogSun: C(0.2, 0.24, 0.33), fogSunK: 0.8,
    zenith: C(0.015, 0.025, 0.06), glow: C(0.22, 0.25, 0.33), cloudC: C(0.07, 0.08, 0.11), cloudLit: C(0.35, 0.38, 0.46),
    cover: 0.35, opaque: 0, moon: 1, moonSize: 260, stars: 0.85, milky: 0.07,
    shadow: 0.8, sunWrap: 0.4, sat: 0.72,
  },
  // neblina fechada: sem céu, os postes viram bolas de luz
  madrugada: {
    zenith: C(0.1, 0.11, 0.13), cloudC: C(0.12, 0.13, 0.15), cover: 1, opaque: 1, fogSun: C(0.13, 0.14, 0.16),
  },
  chuva: {
    zenith: C(0.05, 0.055, 0.075), cloudC: C(0.07, 0.075, 0.095), cloudLit: C(0.03, 0.03, 0.04), cover: 1, opaque: 1,
  },
  tempestade: {
    zenith: C(0.04, 0.045, 0.065), cloudC: C(0.06, 0.065, 0.085), cloudLit: C(0.03, 0.03, 0.04), cover: 1, opaque: 1,
  },
  // garoa: nuvens baixas com a lua aparecendo nos rasgos
  garoa: {
    sun: MOON, zenith: C(0.06, 0.065, 0.085), glow: C(0.08, 0.09, 0.11), cloudC: C(0.1, 0.11, 0.13), cloudLit: C(0.14, 0.15, 0.18),
    cover: 0.95, opaque: 0.2, moon: 0.6, stars: 0.15, shadow: 0.2, sunWrap: 0.3,
  },
  luaSangue: {
    sun: MOON, sunC: C(0.36, 0.08, 0.05), sky: C(0.12, 0.045, 0.045), gnd: C(0.05, 0.02, 0.02),
    fog: C(0.11, 0.03, 0.03), fogSun: C(0.3, 0.06, 0.04), fogSunK: 0.8,
    zenith: C(0.03, 0.006, 0.01), glow: C(0.35, 0.06, 0.04), cloudC: C(0.07, 0.02, 0.02), cloudLit: C(0.45, 0.08, 0.05),
    cover: 0.55, opaque: 0, stars: 0.45, milky: 0.02, shadow: 0.6, sunWrap: 0.4, sat: 0.85,
  },
  // amanhecer dourado (o fim)
  amanhecer: {
    sunC: C(1.0, 0.68, 0.45), sky: C(0.42, 0.42, 0.5), gnd: C(0.27, 0.23, 0.21),
    fog: C(0.66, 0.56, 0.54), fogSun: C(1.0, 0.75, 0.52), fogSunK: 0.9,
    zenith: C(0.3, 0.38, 0.56), glow: C(0.9, 0.55, 0.3), disc: C(1.6, 1.0, 0.6),
    cloudC: C(0.5, 0.42, 0.48), cloudLit: C(1.0, 0.62, 0.42), cover: 0.7, opaque: 1,
    shadow: 0.85, sunWrap: 0.5, sat: 0.85,
  },
  interior: { zenith: C(0, 0, 0), cloudC: C(0, 0, 0), opaque: 1 },
  igreja: { zenith: C(0, 0, 0), cloudC: C(0, 0, 0), opaque: 1 },
  igrejaDia: { zenith: C(0, 0, 0), cloudC: C(0, 0, 0), opaque: 1, sat: 0.75 },
};
const ADV_PRESETS = {};
for (const k in PRESETS) ADV_PRESETS[k] = { ...PRESETS[k], ...ADV[k] };

const lerp = (a, b, t) => a + (b - a) * t;
const mixV = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

function streakTex() {
  const c = makeCanvas(4, 32), g = c.getContext('2d'), d = g.createImageData(4, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 4; x++) {
    const i = (y * 4 + x) * 4, a = Math.sin((y / 31) * Math.PI) * (x === 1 || x === 2 ? 1 : 0.35);
    d.data[i] = 200; d.data[i + 1] = 210; d.data[i + 2] = 225; d.data[i + 3] = Math.round(a * 200);
  }
  g.putImageData(d, 0, 0);
  return canvasTex(c, false);
}

// halo quente em volta dos lampiões acesos (luz avançada): placas viradas para a câmera,
// somadas à imagem e apagadas pela neblina. Luz [x, y, z, tipo]: 0 = lampião da praça,
// 1 = poste de rua (sódio: halo maior e mais alaranjado)
function lampHalos(lights) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(lights.flatMap(l => [l[0], l[1], l[2]])), 3));
  g.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(lights.map(l => l[3] || 0)), 1));
  g.instanceCount = lights.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uFogNear: G.uFogNear, uFogFar: G.uFogFar },
    vertexShader: /* glsl */`
      attribute vec3 aPos;
      attribute float aKind;
      uniform float uK, uFogNear, uFogFar;
      varying vec2 vP; varying float vK; varying float vKind;
      void main() {
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        float d = length(mv.xyz);
        vK = uK * (1.0 - clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0)) * smoothstep(1.0, 4.0, d);
        mv.xyz += normalize(-mv.xyz) * 0.4;
        mv.xy += position.xy * mix(1.6, 2.2, aKind);
        vP = position.xy;
        vKind = aKind;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; varying float vK; varying float vKind;
      void main() {
        float r2 = dot(vP, vP);
        float a = (exp(-r2 * 9.0) * 0.7 + exp(-r2 * 2.5) * 0.3) * clamp(1.0 - r2, 0.0, 1.0);
        gl_FragColor = vec4(mix(vec3(1.0, 0.7, 0.4), vec3(1.0, 0.58, 0.26), vKind) * a * vK, 1.0);
      }`,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  mesh.userData.noShadow = true;
  return mesh;
}

const RAIN_MAX = 1100, BOX = 12, TOP = 7;

export class Atmosphere {
  // o: { scene, sky, audio, ctx }
  constructor(o) {
    Object.assign(this, o);
    this.name = 'tarde';
    this.cur = { ...PRESETS.tarde, sun: [...PRESETS.tarde.sun] };
    this.from = null; this.to = null; this.t = 0; this.dur = 0;
    this.drawDistance = 1;
    this.flash = 0; this.nextStrike = 8; this.thunderQ = [];
    this.flashlightOn = true;
    this.requests = [];
    this.effects = null;
    this._v = new THREE.Vector3();
    // chuva: riscos verticais que acompanham a câmera
    const geo = ensureColor(new THREE.PlaneGeometry(0.03, 0.95));
    this.rainMat = ps1Material({ map: streakTex(), lit: false, transparent: true, depthWrite: false, color: 0xb4c0d0, opacity: 0.7 });
    this.rainMesh = new THREE.InstancedMesh(geo, this.rainMat, RAIN_MAX);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.count = 0;
    this.rainMesh.renderOrder = 4;
    this.drops = [];
    for (let i = 0; i < RAIN_MAX; i++) this.drops.push([(Math.random() - 0.5) * BOX * 2, Math.random() * TOP * 2 - TOP, (Math.random() - 0.5) * BOX * 2, 15 + Math.random() * 6]);
    this.scene.add(this.rainMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new THREE.Vector3(1, 1, 1);
    // luz avançada (opção ILUMINAÇÃO): sombras, céu calculado, halos dos postes
    this.adv = false;
    this.shadowStrength = 0;
    this.viewH = 720;
    if (this.ctx?.lights?.length) { this.halos = lampHalos(this.ctx.lights); this.scene.add(this.halos); }
    this._apply();
  }

  _preset(name) { return (this.adv ? ADV_PRESETS : PRESETS)[name]; }

  // liga/desliga a luz avançada (troca na hora, mantendo a hora do dia atual)
  setAdvanced(on) {
    on = !!on;
    if (this.adv === on) return;
    this.adv = on;
    this.sky?.setAdvanced?.(on);
    const p = this._preset(this.name);
    this.cur = { ...p, sun: [...p.sun] }; this.to = null;
    this._apply();
  }

  // troca o clima (em segundos; 0 = na hora)
  set(name, dur = 4) {
    const p = this._preset(name);
    if (!p) return;
    this.name = name;
    if (dur <= 0) { this.cur = { ...p, sun: [...p.sun] }; this.to = null; this._apply(); return; }
    this.from = { ...this.cur }; this.to = p; this.t = 0; this.dur = dur;
  }

  setDrawDistance(d) { this.drawDistance = d; this._apply(); }

  get isNight() { return this.cur.night > 0.5; }
  get indoor() { return this.cur.indoor > 0.5; }

  // pedido de luz para este quadro: prioridade maior ganha; depois, a mais perto da câmera
  light(x, y, z, col, range, prio = 0) { this.requests.push({ x, y, z, col, range, prio }); }

  _apply() {
    const c = this.cur, flash = this.flash;
    G.uSunDir.value.set(...c.sun).normalize();
    const fl = flash * 0.9;
    G.uSunColor.value.setRGB(c.sunC[0] + fl * 0.5, c.sunC[1] + fl * 0.55, c.sunC[2] + fl * 0.7);
    G.uAmbSky.value.setRGB(c.sky[0] + fl * 0.45, c.sky[1] + fl * 0.5, c.sky[2] + fl * 0.6);
    G.uAmbGround.value.setRGB(c.gnd[0] + fl * 0.15, c.gnd[1] + fl * 0.16, c.gnd[2] + fl * 0.2);
    const far = (FOG_FAR[this.drawDistance] ?? 160) * c.fogK * (1 + flash * 0.6);
    G.uFogFar.value = Math.max(18, far);
    G.uFogNear.value = G.uFogFar.value * (c.indoor > 0.5 ? 0.15 : 0.04);
    G.uFogColor.value.setRGB(c.fog[0] + flash * 0.25, c.fog[1] + flash * 0.27, c.fog[2] + flash * 0.33);
    if (M.sky) M.sky.uniforms.uColor.value.setRGB(c.skyTint[0] + flash * 0.6, c.skyTint[1] + flash * 0.65, c.skyTint[2] + flash * 0.8);
    // postes: o vidro do lampião acende
    if (M.lamp) M.lamp.uniforms.uEmissive.value.setRGB(lerp(0.133, 0.95, c.lamps), lerp(0.125, 0.82, c.lamps), lerp(0.094, 0.55, c.lamps));
    if (M.glassLit) M.glassLit.uniforms.uEmissive.value.setRGB(lerp(0.06, 0.32, c.lamps), lerp(0.06, 0.25, c.lamps), lerp(0.06, 0.12, c.lamps));
    if (M.lampLens) M.lampLens.uniforms.uEmissive.value.setRGB(1.05 * c.lamps, 0.68 * c.lamps, 0.3 * c.lamps);
    // janelas e vitrines acesas: a luz dos cômodos acompanha a dos postes
    this.glowMats ||= Object.values(M).filter(m => m.uniforms?.uGlow);
    for (const m of this.glowMats) m.uniforms.uGlow.value = c.lamps * 0.9;
    // luz avançada: neblina do lado do sol, sol baixo que ainda ilumina o chão, saturação, sombra
    const adv = this.adv, out = c.indoor < 0.5;
    G.uSunFogK.value = adv ? c.fogSunK : 0;
    G.uSunFog.value.setRGB(c.fogSun[0] + flash * 0.25, c.fogSun[1] + flash * 0.27, c.fogSun[2] + flash * 0.33);
    G.uSunWrap.value = adv ? c.sunWrap : 0;
    G.uSat.value = adv ? c.sat : 0.6;
    this.shadowStrength = adv && out ? c.shadow * (1 - Math.min(1, c.rain * 2)) * (this.shadowDip ?? 1) : 0;
    const S = this.sky;
    if (S) {
      const stars = c.stars * (1 - Math.min(1, c.rain * 3));
      S.sun.material.opacity = Math.min(1, c.sunGlow);
      S.sun.scale.setScalar(Math.max(0.5, c.sunGlow));
      S.sun.visible = !adv && c.sunGlow > 0.01 && out;
      S.moon.material.opacity = c.moon * (out ? 1 : 0);
      S.moon.visible = !adv && c.moon > 0.01 && out;
      S.moon.material.color.setRGB(...c.moonC);
      S.moonSize = c.moonSize;
      S.stars.material.opacity = stars;
      S.stars.visible = !adv && c.stars > 0.01 && out;
      if (S.adv) {
        S.starsHD.visible = adv && stars > 0.01 && out;
        S.starsHD.material.uniforms.uStars.value = stars;
        S.starsHD.material.uniforms.uScale.value = Math.max(0.6, this.viewH / 720);
        S.moonHD.visible = adv && c.moon > 0.01 && out;
        S.moonHD.material.opacity = Math.min(1, c.moon);
        S.moonHD.material.color.setRGB(...c.moonC);
        const u = S.adv.uniforms;
        u.uZenith.value.setRGB(...c.zenith); u.uGlow.value.setRGB(...c.glow); u.uDisc.value.setRGB(...c.disc);
        u.uCloudC.value.setRGB(...c.cloudC); u.uCloudLit.value.setRGB(...c.cloudLit);
        u.uCover.value = c.cover; u.uOpaque.value = c.opaque; u.uMilky.value = c.milky * (1 - Math.min(1, c.rain * 3)); u.uFlash.value = flash;
      }
    }
    if (this.halos) {
      const k = adv && out ? c.lamps : 0;
      this.halos.material.uniforms.uK.value = k;
      this.halos.visible = k > 0.01;
    }
    this.audio?.setWeather?.({ rain: c.rain, storm: c.storm, night: c.night, crickets: c.crickets, wind: c.wind, indoor: c.indoor });
  }

  // player: posição/direção da lanterna (o jogador), camera: para a chuva e os postes
  update(dt, camera, player, aimDir = null) {
    this.shadowDip = 1;
    if (this.to) {
      this.t += dt;
      const k = Math.min(1, this.t / this.dur), e = k * k * (3 - 2 * k);
      for (const key of Object.keys(this.to)) {
        const a = this.from[key], b = this.to[key];
        this.cur[key] = Array.isArray(b) ? mixV(a, b, e) : typeof b === 'number' ? lerp(a, b, e) : b;
      }
      // a luz troca de lado (sol se pondo, lua nascendo): a sombra some no meio em vez de girar
      const f = this.from.sun, t = this.to.sun;
      const cos = (f[0] * t[0] + f[1] * t[1] + f[2] * t[2]) / (Math.hypot(...f) * Math.hypot(...t) || 1);
      this.shadowDip = 1 - Math.sin(Math.PI * e) * Math.min(1, Math.max(0, (1 - cos) * 1.5));
      if (k >= 1) this.to = null;
    }
    this._storm(dt);
    this._apply();
    this._rain(dt, camera, player);
    this._lights(camera, player, aimDir);
  }

  // ---------- raios ----------
  _storm(dt) {
    const c = this.cur;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.flashSeq) {
      this.flashSeq.t += dt;
      const s = this.flashSeq;
      // dois ou três clarões rápidos
      for (const p of s.pulses) if (!p.done && s.t >= p.at) { p.done = true; this.flash = Math.max(this.flash, p.k); }
      if (s.t > 0.8) { this.flashSeq = null; if (this.sky) this.sky.bolt.visible = false; }
      else if (this.sky) this.sky.bolt.visible = this.flash > 0.35 && !this.indoor;
    }
    for (let i = this.thunderQ.length - 1; i >= 0; i--) {
      const q = this.thunderQ[i];
      q.t -= dt;
      if (q.t <= 0) { this.audio?.thunder?.(q.k, this.indoor); this.thunderQ.splice(i, 1); }
    }
    if (c.storm <= 0.05) return;
    this.nextStrike -= dt * c.storm;
    if (this.nextStrike <= 0) { this.strike(); this.nextStrike = 5 + Math.random() * 14; }
  }

  // relâmpago (as missões também chamam, para os sustos)
  strike(close = Math.random() < 0.35) {
    const k = close ? 1 : 0.55 + Math.random() * 0.25;
    this.flashSeq = { t: 0, pulses: [{ at: 0, k }, { at: 0.09 + Math.random() * 0.05, k: k * 0.5 }, { at: 0.22 + Math.random() * 0.1, k: k * 0.85 }] };
    if (this.sky) this.sky.makeBolt(Math.random() * Math.PI * 2);
    this.thunderQ.push({ t: close ? 0.15 : 0.8 + Math.random() * 1.8, k: close ? 1 : 0.6 });
  }

  // ---------- chuva ----------
  _rain(dt, camera, player) {
    const c = this.cur, n = c.indoor > 0.5 ? 0 : Math.round(RAIN_MAX * c.rain);
    this.rainMesh.count = n;
    if (!n) return;
    const cp = camera.position, wind = c.wind;
    this._e.set(0, 0, 0);
    const yaw = Math.atan2(cp.x - (player?.pos.x ?? cp.x), cp.z - (player?.pos.z ?? cp.z));
    const tilt = wind * 0.35;
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d[1] -= d[3] * dt;
      d[0] += wind * 4 * dt;
      if (d[1] < -TOP) { d[1] += TOP * 2; d[0] = (Math.random() - 0.5) * BOX * 2; d[2] = (Math.random() - 0.5) * BOX * 2; }
      // a caixa de gotas acompanha a câmera (cada gota "dá a volta" ao sair)
      let x = d[0] + Math.floor((cp.x - d[0]) / (BOX * 2) + 0.5) * BOX * 2;
      let z = d[2] + Math.floor((cp.z - d[2]) / (BOX * 2) + 0.5) * BOX * 2;
      this._e.set(0, yaw, tilt);
      this._q.setFromEuler(this._e);
      this._m.compose(this._v.set(x, cp.y + d[1], z), this._q, this._s);
      this.rainMesh.setMatrixAt(i, this._m);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
    // respingos no chão perto do jogador
    if (this.effects && player && this.ctx) {
      const k = c.rain * dt * 40;
      for (let i = 0; i < k + (Math.random() < k % 1 ? 1 : 0); i++) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 7;
        const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
        const y = this.ctx.groundAt(x, z, player.pos.y + 1) + 0.03;
        this.effects.spawn({ p: this._v.set(x, y, z), v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6), life: 0.22, s0: 0.035, s1: 0.0, color: [0.62, 0.66, 0.72], grav: 9.8 });
      }
    }
  }

  // ---------- luzes dinâmicas ----------
  _lights(camera, player, aimDir) {
    const L = G.uLights.value, LC = G.uLightCols.value, spot = G.uSpot.value, c = this.cur;
    // postes acesos mais perto de um ponto um pouco à frente da câmera; o último vai
    // apagando conforme o próximo se aproxima, para a luz não "pular" no chão na troca
    if (c.lamps > 0.05 && this.ctx?.lights) {
      const cp = camera.position, fw = camera.getWorldDirection(this._fw ||= new THREE.Vector3());
      const fx = cp.x + fw.x * 8, fz = cp.z + fw.z * 8, near = [];
      for (const l of this.ctx.lights) {
        const d = Math.hypot(l[0] - fx, l[2] - fz);
        if (d < 70) near.push([d, l]);
      }
      near.sort((a, b) => a[0] - b[0]);
      const N = 4, cut = near[N]?.[0] ?? Infinity;
      for (let i = 0; i < Math.min(N, near.length); i++) {
        const l = near[i][1], k = c.lamps * Math.min(1, (cut - near[i][0]) / 6);
        if (l[3] === 1) this.light(l[0], l[1], l[2], [2.3 * k, 1.46 * k, 0.68 * k], 19, 1);
        else this.light(l[0], l[1] - 0.3, l[2], [1.25 * k, 0.95 * k, 0.6 * k], 13, 1);
      }
    }
    // lanterna (luz 0, em foco) + luz fraca em volta do jogador
    let slot = 0;
    const lantern = c.flashlight > 0.05 && this.flashlightOn && player;
    if (lantern) {
      const P = player.pos, h = player.heading;
      let dx, dy, dz;
      if (aimDir) { dx = aimDir.x; dy = aimDir.y; dz = aimDir.z; }
      else { dx = Math.sin(h); dz = Math.cos(h); dy = -0.16; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; }
      const k = c.flashlight;
      L[0].set(P.x + Math.sin(h) * 0.3, P.y + 1.3, P.z + Math.cos(h) * 0.3, 26);
      LC[0].set(1.7 * k, 1.6 * k, 1.35 * k);
      spot.set(dx, dy, dz, 0.9);
      this.light(P.x, P.y + 1.6, P.z, [0.3 * k, 0.3 * k, 0.36 * k], 5, 3);
      slot = 1;
    } else {
      spot.w = -2;
    }
    // demais pedidos
    const cp = camera.position;
    const reqs = this.requests.sort((a, b) => (b.prio - a.prio) || (Math.hypot(a.x - cp.x, a.z - cp.z) - Math.hypot(b.x - cp.x, b.z - cp.z)));
    for (const r of reqs) {
      if (slot >= NUM_LIGHTS) break;
      L[slot].set(r.x, r.y, r.z, r.range);
      LC[slot].set(r.col[0], r.col[1], r.col[2]);
      slot++;
    }
    for (; slot < NUM_LIGHTS; slot++) L[slot].w = 0;
    this.requests.length = 0;
  }

  // apaga as luzes (prévia do inventário, telas)
  clearLights() {
    for (const l of G.uLights.value) l.w = 0;
    G.uSpot.value.w = -2;
  }
}
