import * as THREE from 'three';

// mapa de sombra de 1x1 até as sombras existirem (o shader exige uma textura de profundidade com comparação)
const noShadow = new THREE.DepthTexture(1, 1);
noShadow.compareFunction = THREE.LessEqualCompare;
noShadow.needsUpdate = true;

// Uniforms compartilhados por todos os materiais PS1
export const G = {
  uTime: { value: 0 },
  uAffine: { value: 0 },
  uFogColor: { value: new THREE.Color(0.8, 0.7, 0.6) },
  uFogNear: { value: 40 },
  uFogFar: { value: 300 },
  uSunDir: { value: new THREE.Vector3(-0.6, 0.4, -0.6).normalize() },
  // luz fraca e fria de dia encoberto
  uSunColor: { value: new THREE.Color(0.5, 0.49, 0.47) },
  uAmbSky: { value: new THREE.Color(0.47, 0.49, 0.53) },
  uAmbGround: { value: new THREE.Color(0.3, 0.28, 0.27) },
  // luzes dinâmicas (lanterna, postes acesos, fogo, clarões): xyz = posição, w = alcance (0 = apagada)
  uLights: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLightCols: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0)) },
  // a luz 0 pode ser um foco (lanterna): xyz = direção, w = cosseno do corte (< -1.5 = luz redonda)
  uSpot: { value: new THREE.Vector4(0, 0, 1, -2) },
  // luz avançada (na clássica ficam todos zerados e a imagem é a mesma de antes):
  // neblina mais quente olhando para o sol, sol que "abraça" o chão quando está baixo
  uSunFog: { value: new THREE.Color(0.8, 0.7, 0.6) },
  uSunFogK: { value: 0 },
  uSunWrap: { value: 0 },
  // sombras projetadas (engine/shadows.js): mapa de profundidade visto do sol/lua
  uShadowMap: { value: noShadow },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },                                   // força da sombra (0 = desligada)
  uShadowFade: { value: new THREE.Vector4(0, 0, 30, 40) },   // xy = centro (x, z), z..w = some aos poucos
  uShadowTexel: { value: 1 / 2048 },
  uShadowBias: { value: new THREE.Vector2(0.06, 0.0001) },   // afastamento na normal (m), viés de profundidade
  // saturação do passo final (terror = 0.6)
  uSat: { value: 0.6 },
  // noite no passo final (0..1): levanta as sombras para o cenário escuro não virar preto puro
  uNightLift: { value: 0 },
};
export const NUM_LIGHTS = 8;

const VERT = /* glsl */`
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uLit;
uniform float uFoliage;
uniform float uFogMul;
uniform vec2 uScroll;
uniform float uWave;
uniform float uSway;
uniform float uSunFogK;
uniform float uSunWrap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform vec2 uShadowBias;

varying vec3 vUvAff;
varying vec2 vUv;
varying vec3 vLight;
varying vec3 vSun;
varying vec4 vShadow;
varying float vFog;
varying float vSunFog;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vBase;

#include <skinning_pars_vertex>

void main() {
  // malhas com esqueleto (protagonista): deforma posição e normal pelos ossos
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>

  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(transformed, 1.0);
  if (uWave > 0.0) {
    wp.y += sin(wp.x * 0.35 + uTime * 1.3) * cos(wp.z * 0.3 + uTime * 0.9) * uWave;
  }
  if (uSway > 0.0) {
    float h = max(transformed.y, 0.0);
    wp.x += sin(uTime * 1.1 + wp.z * 0.2) * uSway * h * 0.02;
    wp.z += cos(uTime * 0.9 + wp.x * 0.2) * uSway * h * 0.015;
  }
  vec3 n = normalize(mat3(m) * objectNormal);
  vec4 vp = viewMatrix * wp;
  vec4 cp = projectionMatrix * vp;
  gl_Position = cp;

  // iluminação por vértice (Gouraud); o sol fica separado para a sombra tirar só ele
  float ndl0 = dot(n, uSunDir);
  float lit = max(ndl0, 0.0);
  lit = mix(lit, sqrt(lit), uSunWrap);
  float ndl = mix(lit, 0.55 + 0.45 * abs(ndl0), uFoliage);
  float hemi = n.y * 0.5 + 0.5;
  vec3 amb = mix(uAmbGround, uAmbSky, mix(hemi, 0.75, uFoliage));
  vec3 vc = vec3(1.0);
  #ifdef USE_COLOR
    vc = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vc *= instanceColor;
  #endif
  vec3 base = vc * uColor;
  vLight = mix(vec3(1.0), amb, uLit) * base + uEmissive;
  vSun = uSunColor * ndl * base * uLit;
  // base para as luzes dinâmicas (materiais sem luz não recebem)
  vBase = base * uLit;
  vWP = wp.xyz;
  vN = n;
  // posição no mapa de sombra, afastada um pouco da superfície (evita manchas)
  vShadow = vec4(0.0);
  if (uShadowOn > 0.0) {
    vec3 sp = wp.xyz + n * (ndl0 >= 0.0 ? 1.0 : -1.0) * uShadowBias.x * (1.0 + uFoliage) + uSunDir * uShadowBias.x * 0.5;
    vShadow = uShadowMatrix * vec4(sp, 1.0);
  }

  // neblina por vértice (depth cueing)
  float d = length(vp.xyz);
  vFog = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogMul;
  #ifdef EDGE_FADE
    // relevo distante: o mapa acaba a 1,6 km; nos dias limpos a borda some na neblina
    vFog = max(vFog, smoothstep(1360.0, 1590.0, max(abs(wp.x), abs(wp.z))) * uFogMul);
  #endif
  vSunFog = 0.0;
  if (uSunFogK > 0.0) vSunFog = pow(max(dot(normalize(wp.xyz - cameraPosition), uSunDir), 0.0), 5.0) * uSunFogK;

  vec2 uv2 = uv + uScroll * uTime;
  vUv = uv2;
  vUvAff = vec3(uv2 * cp.w, cp.w);
}
`;

const FRAG = /* glsl */`
uniform sampler2D map;
uniform float uAffine;
uniform float uAffineMat;
uniform float uAlphaTest;
uniform vec3 uFogColor;
uniform float uOpacity;
uniform float uFoliage;
uniform vec4 uLights[8];
uniform vec3 uLightCols[8];
uniform vec4 uSpot;
uniform vec3 uSunFog;
uniform sampler2DShadow uShadowMap;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform vec4 uShadowFade;
#ifdef USE_GLOW
uniform sampler2D glowMap;
uniform float uGlow;
#endif
#ifdef USE_GLOSS
// lataria envernizada, cromado e vidro: x = reflexo do ambiente, y = brilho do sol e das
// luzes, z = expoente do brilho (maior = mais fino), w = reflexo olhando de frente (fresnel)
uniform vec4 uGloss;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
#endif

varying vec3 vUvAff;
varying vec2 vUv;
varying vec3 vLight;
varying vec3 vSun;
varying vec4 vShadow;
varying float vFog;
varying float vSunFog;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vBase;

// sombra suave: 4 amostras com comparação por hardware (cada uma já filtra 2x2)
float sunShadow() {
  vec3 s = vShadow.xyz;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float d = uShadowTexel * 1.25;
  float k = texture(uShadowMap, vec3(s.xy + vec2(-d, -0.35 * d), s.z));
  k += texture(uShadowMap, vec3(s.xy + vec2(0.35 * d, -d), s.z));
  k += texture(uShadowMap, vec3(s.xy + vec2(d, 0.35 * d), s.z));
  k += texture(uShadowMap, vec3(s.xy + vec2(-0.35 * d, d), s.z));
  // some aos poucos longe do jogador (a borda do mapa nunca aparece)
  float fade = smoothstep(uShadowFade.z, uShadowFade.w, length(vWP.xz - uShadowFade.xy));
  return mix(k * 0.25, 1.0, fade);
}

void main() {
  // mapeamento afim (sem correção de perspectiva), como no PS1
  vec2 uvA = vUvAff.xy / vUvAff.z;
  vec2 uv = mix(vUv, uvA, uAffine * uAffineMat);
  vec4 t = texture2D(map, uv);
  if (t.a < uAlphaTest) discard;
  // luzes dinâmicas por pixel (queda quadrática; folhagem ilumina dos dois lados)
  vec3 dyn = vec3(0.0);
  if (vBase.r + vBase.g + vBase.b > 0.0) {
    vec3 N = normalize(vN);
    for (int i = 0; i < 8; i++) {
      vec4 Lp = uLights[i];
      if (Lp.w <= 0.0) continue;
      vec3 dv = Lp.xyz - vWP;
      float d = length(dv);
      if (d >= Lp.w) continue;
      vec3 l = dv / max(d, 1e-4);
      float att = 1.0 - d / Lp.w;
      att *= att;
      float ndl = mix(max(dot(N, l), 0.0) * 0.8 + 0.2, 0.85, uFoliage);
      if (i == 0 && uSpot.w > -1.5) att *= smoothstep(uSpot.w, uSpot.w + 0.1, dot(-l, uSpot.xyz));
      dyn += uLightCols[i] * att * ndl;
    }
  }
  float sh = 1.0;
  // na folhagem a sombra pesa menos (as folhas se sombreiam entre si e virariam manchas)
  if (uShadowOn > 0.0 && vSun.r + vSun.g + vSun.b > 0.002) sh = mix(1.0, sunShadow(), uShadowOn * (1.0 - 0.45 * uFoliage));
  vec3 c = min(t.rgb * (vLight + vSun * sh + dyn * vBase), vec3(1.0));
  float alpha = t.a * uOpacity;
  #ifdef USE_GLOSS
  {
    // reflexo de mentira, sem mapa de ambiente: chão escuro embaixo, a névoa no horizonte
    // (com uma faixa clara, o "risco" do cromado) e o céu em cima; o sol e as luzes por perto
    // viram pontos de brilho. A sombra apaga o brilho do sol
    vec3 N = normalize(vN), V = normalize(cameraPosition - vWP);
    if (dot(N, V) < 0.0) N = -N;
    vec3 Rf = reflect(-V, N);
    float fres = mix(uGloss.w, 1.0, pow(1.0 - max(dot(N, V), 0.0), 4.0));
    float up = Rf.y;
    vec3 sky = mix(uFogColor, uAmbSky * 1.3, smoothstep(0.06, 0.75, up));
    vec3 env = mix(uAmbGround * 0.22, sky, smoothstep(-0.14, 0.03, up));
    env += (uFogColor * 0.55 + 0.05) * (1.0 - smoothstep(0.0, 0.08, abs(up - 0.02)));
    vec3 refl = env * uGloss.x * fres + uSunColor * pow(max(dot(Rf, uSunDir), 0.0), uGloss.z) * uGloss.y * sh;
    for (int i = 0; i < 8; i++) {
      vec4 Lp = uLights[i];
      if (Lp.w <= 0.0) continue;
      vec3 dv = Lp.xyz - vWP;
      float d = length(dv);
      if (d >= Lp.w * 1.6) continue;
      float att = 1.0 - d / (Lp.w * 1.6);
      if (i == 0 && uSpot.w > -1.5) att *= smoothstep(uSpot.w - 0.2, uSpot.w + 0.1, dot(-dv / max(d, 1e-4), uSpot.xyz));
      refl += uLightCols[i] * pow(max(dot(Rf, dv / max(d, 1e-4)), 0.0), uGloss.z * 0.6) * att * att * uGloss.y * 0.7;
    }
    c = min(c + refl, vec3(1.0));
    // vidro: de lado ele espelha mais e deixa ver menos o que tem dentro
    alpha = min(1.0, alpha + fres * uGloss.x * 0.5);
  }
  #endif
  c = mix(c, mix(uFogColor, uSunFog, vSunFog), vFog);
  #ifdef USE_GLOW
  // luz própria (janela acesa): somada depois da neblina, que a apaga mais devagar
  if (uGlow > 0.0) c = min(c + texture2D(glowMap, uv).rgb * uGlow * (1.0 - vFog * vFog), vec3(1.0));
  #endif
  gl_FragColor = vec4(c, alpha);
}
`;

let white = null;
export function whiteTex() {
  if (!white) {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
    white = new THREE.CanvasTexture(c);
    white.magFilter = white.minFilter = THREE.NearestFilter;
    white.generateMipmaps = false;
  }
  return white;
}

// cor "crua": o hexadecimal vai direto para o shader, sem conversão sRGB -> linear
// (o jogo trabalha todo em espaço de cor de tela, como o PS1)
export function rawColor(c) {
  if (c instanceof THREE.Color) return c;
  return new THREE.Color().setHex(c, THREE.LinearSRGBColorSpace);
}

// estilo visual atual ('clean' = 3D limpo, 'ps1' = retrô) e todos os materiais criados,
// para trocar o recorte das folhagens quando o estilo muda
export const VISUAL = { mode: 'clean' };
const CUTOUT_MATS = new Set();
const cutoutTest = () => (VISUAL.mode === 'clean' ? 0.32 : 0.5);

export function setMaterialStyle(mode) {
  VISUAL.mode = mode;
  for (const m of CUTOUT_MATS) {
    m.uniforms.uAlphaTest.value = cutoutTest();
    m.alphaToCoverage = mode === 'clean';
    m.needsUpdate = true;
  }
}

export function ps1Material(o = {}) {
  const cutout = o.alphaTest === undefined && !!o.cutout;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...G,
      map: { value: o.map || whiteTex() },
      uColor: { value: rawColor(o.color ?? 0xffffff) },
      uEmissive: { value: rawColor(o.emissive ?? 0x000000) },
      uLit: { value: o.lit === false ? 0 : 1 },
      uFoliage: { value: o.foliage ? 1 : 0 },
      uFogMul: { value: o.fog === false ? 0 : 1 },
      uScroll: { value: new THREE.Vector2(...(o.scroll || [0, 0])) },
      uWave: { value: o.wave || 0 },
      uSway: { value: o.sway || 0 },
      uAlphaTest: { value: o.alphaTest ?? (o.cutout ? cutoutTest() : 0) },
      uAffineMat: { value: o.affine === false ? 0 : 1 },
      uOpacity: { value: o.opacity ?? 1 },
      ...(o.glowMap ? { glowMap: { value: o.glowMap }, uGlow: { value: 0 } } : {}),
      ...(o.gloss ? { uGloss: { value: new THREE.Vector4(...o.gloss) } } : {}),
    },
    defines: { ...(o.glowMap ? { USE_GLOW: '' } : {}), ...(o.edgeFade ? { EDGE_FADE: '' } : {}), ...(o.gloss ? { USE_GLOSS: '' } : {}) },
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    side: o.side ?? (o.cutout ? THREE.DoubleSide : THREE.FrontSide),
    transparent: !!o.transparent,
    depthWrite: o.depthWrite ?? !o.transparent,
    depthTest: o.depthTest ?? true,
  });
  if (o.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = o.polygonOffset;
    mat.polygonOffsetUnits = o.polygonOffset;
  }
  // projeta sombra na luz avançada: só os opacos iluminados (decalques, água e efeitos não)
  mat.userData.caster = o.shadow ?? (!o.transparent && o.lit !== false && !o.polygonOffset);
  // folhagem recortada: no 3D limpo usa a cobertura do antisserrilhado (bordas suaves)
  if (cutout && !o.transparent) {
    mat.alphaToCoverage = VISUAL.mode === 'clean';
    CUTOUT_MATS.add(mat);
  }
  return mat;
}

// garante atributo de cor (os materiais usam vertexColors)
export function ensureColor(geo, rgb = [1, 1, 1]) {
  if (!geo.getAttribute('color')) {
    const n = geo.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = rgb[0]; a[i * 3 + 1] = rgb[1]; a[i * 3 + 2] = rgb[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return geo;
}

// material para linhas (fios de luz)
export function ps1LineMaterial(color = 0x1a1a1a) {
  return new THREE.ShaderMaterial({
    uniforms: { ...G, uColor: { value: rawColor(color) } },
    vertexShader: /* glsl */`
      uniform float uFogNear; uniform float uFogFar; uniform vec3 uSunDir; uniform float uSunFogK;
      varying float vFog; varying float vSunFog;
      void main() {
        vec4 vp = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * vp;
        vFog = clamp((length(vp.xyz) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vSunFog = uSunFogK > 0.0 ? pow(max(dot(normalize(wp - cameraPosition), uSunDir), 0.0), 5.0) * uSunFogK : 0.0;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uFogColor; uniform vec3 uSunFog; varying float vFog; varying float vSunFog;
      void main() { gl_FragColor = vec4(mix(uColor, mix(uFogColor, uSunFog, vSunFog), vFog), 1.0); }`,
  });
}
