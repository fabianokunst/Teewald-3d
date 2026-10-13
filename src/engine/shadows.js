import * as THREE from 'three';
import { G } from './ps1material.js';

// Sombras projetadas da luz avançada (sol de fim de tarde, luar).
// Um mapa de profundidade visto do sol cobre um quadrado em volta do jogador.
// Para ficar leve, a parte fixa da cidade (prédios, árvores, postes) vai para um
// mapa guardado, refeito só quando o jogador anda alguns metros ou o sol muda.
// A cada quadro esse mapa é copiado e só o que se mexe (personagem, moradores,
// criaturas, objetos) é desenhado por cima.
//
// Raízes da cena: userData.shadowStatic = parte fixa, userData.noShadow = não projeta
// (terreno, céu, folhas caindo). O resto é dinâmico. Cada material PS1 diz se projeta
// (userData.caster): opacos e iluminados sim; decalques, água, vidro e efeitos não.

const STATIC_LAYER = 29, DYN_LAYER = 30;

// mesma deformação dos materiais PS1 (ossos, instâncias, ondas, balanço), só a profundidade
const DEPTH_VERT = /* glsl */`
uniform float uTime;
uniform float uWave;
uniform float uSway;
uniform vec2 uScroll;
varying vec2 vUv;
#include <skinning_pars_vertex>
void main() {
  vec3 transformed = position;
  #include <skinbase_vertex>
  #include <skinning_vertex>
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(transformed, 1.0);
  if (uWave > 0.0) wp.y += sin(wp.x * 0.35 + uTime * 1.3) * cos(wp.z * 0.3 + uTime * 0.9) * uWave;
  if (uSway > 0.0) {
    float h = max(transformed.y, 0.0);
    wp.x += sin(uTime * 1.1 + wp.z * 0.2) * uSway * h * 0.02;
    wp.z += cos(uTime * 0.9 + wp.x * 0.2) * uSway * h * 0.015;
  }
  gl_Position = projectionMatrix * viewMatrix * wp;
  vUv = uv + uScroll * uTime;
}`;

// folhagem recortada: o furo da textura também fura a sombra
const DEPTH_FRAG = /* glsl */`
uniform sampler2D map;
uniform float uAlphaTest;
varying vec2 vUv;
void main() {
  if (uAlphaTest > 0.0 && texture2D(map, vUv).a < max(uAlphaTest, 0.4)) discard;
  gl_FragColor = vec4(1.0);
}`;

const casts = m => !!(m && m.userData?.caster && !m.transparent && m.visible !== false && m.uniforms?.map);

export class Shadows {
  // size: lado do mapa em pixels; radius: metros cobertos em volta do jogador
  constructor(gl, { size = 2048, radius = 50 } = {}) {
    this.gl = gl;
    this.size = size;
    this.radius = radius;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 600);
    this.center = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.dirty = true;
    this.frame = 0; this.lastStatic = -99;
    this.variants = new WeakMap();
    this.swapped = [];
    this.statics = []; this.dynamics = [];
    this._r = new THREE.Vector3(); this._u = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    // cópia do mapa fixo para o mapa do quadro (escreve só profundidade)
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main(){ gl_FragDepth = texture2D(tDepth, vUv).r; gl_FragColor = vec4(1.0); }',
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = new THREE.Mesh(tri, this.copyMat);
    quad.frustumCulled = false;
    this.copyScene = new THREE.Scene();
    this.copyScene.add(quad);
    this.copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // força refazer o mapa fixo no próximo quadro
  invalidate() { this.dirty = true; }

  _targets() {
    if (this.rtMain) return;
    const S = this.size;
    const mk = compare => {
      const dt = new THREE.DepthTexture(S, S, THREE.UnsignedIntType);
      dt.minFilter = dt.magFilter = compare ? THREE.LinearFilter : THREE.NearestFilter;
      if (compare) dt.compareFunction = THREE.LessEqualCompare;
      return new THREE.WebGLRenderTarget(S, S, { format: THREE.RedFormat, depthBuffer: true, depthTexture: dt, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    };
    this.rtStatic = mk(false);
    this.rtMain = mk(true);
    this.copyMat.uniforms.tDepth.value = this.rtStatic.depthTexture;
    G.uShadowTexel.value = 1 / S;
    this.dirty = true;
  }

  // enquadra a câmera do sol: largura 2R e altura só o necessário para o chão em volta
  // (com o sol baixo o quadrado vira um retângulo achatado e a resolução no chão dobra)
  _fit(focus, L) {
    const R = this.radius, S = this.size, cam = this.cam;
    const sinE = Math.max(0.05, L.y), cosE = Math.sqrt(Math.max(0, 1 - sinE * sinE));
    const top = R * sinE + 45 * cosE, bottom = -R * sinE - 22 * cosE;
    // base do sol: direita e cima vistas de lá
    const right = this._r.set(-L.z, 0, L.x);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = this._u.crossVectors(L, right).normalize();
    if (up.y < 0) { up.negate(); right.negate(); }
    // centro preso à grade de texels: refazer o mapa não faz a borda das sombras tremer
    const c = this._c.copy(focus);
    const tx = (2 * R) / S, ty = (top - bottom) / S;
    const cx = c.dot(right), cy = c.dot(up);
    c.addScaledVector(right, Math.round(cx / tx) * tx - cx).addScaledVector(up, Math.round(cy / ty) * ty - cy);
    const D = 260;
    cam.position.copy(c).addScaledVector(L, D);
    cam.up.copy(up);
    cam.lookAt(c);
    cam.left = -R; cam.right = R; cam.top = top; cam.bottom = bottom;
    cam.near = 0.5; cam.far = D + R + 140;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    G.uShadowMatrix.value.copy(this._bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // afastamento na normal: ~1,5 texel no chão
    G.uShadowBias.value.set(Math.max(tx, ty) * 1.5, 0.00012);
    this.center.copy(focus);
    this.lastDir.copy(L);
  }

  // marca quem projeta (camada própria, só durante a passada) e troca o material pelo de profundidade
  _prep(roots, layer) {
    const bit = 1 << layer, list = this.swapped;
    this.bit = bit;
    for (const r of roots) r.traverseVisible(o => {
      if (!o.isMesh) return;
      const m = o.material;
      if (Array.isArray(m) || o.userData.noShadow || !casts(m)) return;
      o.layers.mask |= bit;
      list.push(o, m);
      o.material = this._variant(m);
    });
  }

  _restore() {
    const l = this.swapped, clear = ~this.bit;
    this.drawn = l.length / 2;
    for (let i = 0; i < l.length; i += 2) { l[i].material = l[i + 1]; l[i].layers.mask &= clear; }
    l.length = 0;
  }

  _variant(m) {
    let v = this.variants.get(m);
    if (!v) {
      const u = m.uniforms;
      v = new THREE.ShaderMaterial({
        uniforms: { map: u.map, uAlphaTest: u.uAlphaTest, uTime: G.uTime, uWave: u.uWave || { value: 0 }, uSway: u.uSway || { value: 0 }, uScroll: u.uScroll || { value: new THREE.Vector2() } },
        vertexShader: DEPTH_VERT,
        fragmentShader: DEPTH_FRAG,
        side: THREE.DoubleSide,
      });
      this.variants.set(m, v);
    }
    return v;
  }

  // strength: força da sombra do clima atual (0 = sem sombra, nem desenha o mapa)
  update(scene, focus, strength) {
    this.frame++;
    if (!(strength > 0.01)) { G.uShadowOn.value = 0; this.dirty = true; return; }
    this._targets();
    const L = G.uSunDir.value;
    const moved = Math.hypot(focus.x - this.center.x, focus.z - this.center.z) > this.radius * 0.15 || Math.abs(focus.y - this.center.y) > 8;
    // sol mudando (troca de clima): refaz no máximo a cada 6 quadros; troca brusca, na hora
    const dd = 1 - L.dot(this.lastDir);
    const turned = dd > 0.003 || (dd > 2e-6 && this.frame - this.lastStatic >= 6);
    this.statics.length = 0; this.dynamics.length = 0;
    for (const o of scene.children) {
      if (!o.visible || o.userData.noShadow) continue;
      (o.userData.shadowStatic ? this.statics : this.dynamics).push(o);
    }
    const gl = this.gl, prevTarget = gl.getRenderTarget(), prevAuto = gl.autoClear;
    gl.autoClear = false;
    if (this.dirty || moved || turned) {
      this.dirty = false; this.lastStatic = this.frame;
      this._fit(focus, L);
      this._prep(this.statics, STATIC_LAYER);
      gl.setRenderTarget(this.rtStatic);
      gl.clear(false, true, false);
      this.cam.layers.set(STATIC_LAYER);
      gl.render(scene, this.cam);
      this._restore();
    }
    // mapa do quadro = mapa fixo + o que se mexe
    gl.setRenderTarget(this.rtMain);
    gl.clear(false, true, false);
    gl.render(this.copyScene, this.copyCam);
    this._prep(this.dynamics, DYN_LAYER);
    this.cam.layers.set(DYN_LAYER);
    gl.render(scene, this.cam);
    this._restore();
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAuto;
    G.uShadowMap.value = this.rtMain.depthTexture;
    G.uShadowOn.value = strength;
    G.uShadowFade.value.set(focus.x, focus.z, this.radius * 0.6, this.radius * 0.8);
  }
}
