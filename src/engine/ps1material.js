import * as THREE from 'three';

// Uniforms compartilhados por todos os materiais PS1
export const G = {
  uTime: { value: 0 },
  uSnap: { value: new THREE.Vector2(160, 120) },
  uJitter: { value: 1 },
  uAffine: { value: 0.55 },
  uFogColor: { value: new THREE.Color(0.8, 0.7, 0.6) },
  uFogNear: { value: 40 },
  uFogFar: { value: 300 },
  uSunDir: { value: new THREE.Vector3(-0.6, 0.4, -0.6).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.82, 0.6) },
  uAmbSky: { value: new THREE.Color(0.52, 0.55, 0.62) },
  uAmbGround: { value: new THREE.Color(0.42, 0.36, 0.3) },
};

const VERT = /* glsl */`
uniform vec2 uSnap;
uniform float uJitter;
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

varying vec3 vUvAff;
varying vec2 vUv;
varying vec3 vLight;
varying float vFog;

void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  if (uWave > 0.0) {
    wp.y += sin(wp.x * 0.35 + uTime * 1.3) * cos(wp.z * 0.3 + uTime * 0.9) * uWave;
  }
  if (uSway > 0.0) {
    float h = max(position.y, 0.0);
    wp.x += sin(uTime * 1.1 + wp.z * 0.2) * uSway * h * 0.02;
    wp.z += cos(uTime * 0.9 + wp.x * 0.2) * uSway * h * 0.015;
  }
  vec3 n = normalize(mat3(m) * normal);
  vec4 vp = viewMatrix * wp;
  vec4 cp = projectionMatrix * vp;

  // tremor de vértices: encaixa na grade de pixels do PS1
  if (uJitter > 0.5 && cp.w > 0.0) {
    cp.xy = floor(cp.xy / cp.w * uSnap + 0.5) / uSnap * cp.w;
  }
  gl_Position = cp;

  // iluminação por vértice (Gouraud)
  float ndl = dot(n, uSunDir);
  ndl = mix(max(ndl, 0.0), 0.55 + 0.45 * abs(ndl), uFoliage);
  float hemi = n.y * 0.5 + 0.5;
  vec3 L = mix(uAmbGround, uAmbSky, mix(hemi, 0.75, uFoliage)) + uSunColor * ndl;
  vec3 vc = vec3(1.0);
  #ifdef USE_COLOR
    vc = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vc *= instanceColor;
  #endif
  vLight = mix(vec3(1.0), L, uLit) * vc * uColor + uEmissive;

  // neblina por vértice (depth cueing)
  float d = length(vp.xyz);
  vFog = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogMul;

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

varying vec3 vUvAff;
varying vec2 vUv;
varying vec3 vLight;
varying float vFog;

void main() {
  // mapeamento afim (sem correção de perspectiva), como no PS1
  vec2 uvA = vUvAff.xy / vUvAff.z;
  vec2 uv = mix(vUv, uvA, uAffine * uAffineMat);
  vec4 t = texture2D(map, uv);
  if (t.a < uAlphaTest) discard;
  vec3 c = min(t.rgb * vLight, vec3(1.0));
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, uOpacity);
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

export function ps1Material(o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...G,
      map: { value: o.map || whiteTex() },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
      uLit: { value: o.lit === false ? 0 : 1 },
      uFoliage: { value: o.foliage ? 1 : 0 },
      uFogMul: { value: o.fog === false ? 0 : 1 },
      uScroll: { value: new THREE.Vector2(...(o.scroll || [0, 0])) },
      uWave: { value: o.wave || 0 },
      uSway: { value: o.sway || 0 },
      uAlphaTest: { value: o.alphaTest ?? (o.cutout ? 0.5 : 0) },
      uAffineMat: { value: o.affine === false ? 0 : 1 },
      uOpacity: { value: o.opacity ?? 1 },
    },
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
    uniforms: { ...G, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      uniform vec2 uSnap; uniform float uJitter; uniform float uFogNear; uniform float uFogFar;
      varying float vFog;
      void main() {
        vec4 vp = modelViewMatrix * vec4(position, 1.0);
        vec4 cp = projectionMatrix * vp;
        if (uJitter > 0.5 && cp.w > 0.0) cp.xy = floor(cp.xy / cp.w * uSnap + 0.5) / uSnap * cp.w;
        gl_Position = cp;
        vFog = clamp((length(vp.xyz) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uFogColor; varying float vFog;
      void main() { gl_FragColor = vec4(mix(uColor, uFogColor, vFog), 1.0); }`,
  });
}
