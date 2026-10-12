import * as THREE from 'three';
import { G } from './ps1material.js';

// Renderiza em baixa resolução (ex.: 320x240) e amplia sem suavização.
// Passo final: dithering ordenado 4x4 + cor de 15 bits + fade.
export class Renderer {
  constructor(container) {
    this.container = container;
    const gl = this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    gl.setPixelRatio(1);
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    gl.setClearColor(0x000000, 1);
    this.canvas = gl.domElement;
    this.ui = document.createElement('canvas');
    this.uictx = this.ui.getContext('2d');
    for (const c of [this.canvas, this.ui]) {
      Object.assign(c.style, { position: 'absolute', imageRendering: 'pixelated', left: '0', top: '0' });
      container.appendChild(c);
    }
    this.ui.style.pointerEvents = 'none';
    this.rt = new THREE.WebGLRenderTarget(320, 240, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, uDither: { value: 1 }, uFade: { value: 0 }, uBars: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uDither; uniform float uFade; uniform float uBars;
        varying vec2 vUv;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          c *= 1.0 - uFade;
          if (uDither > 0.5) {
            c += (bayer4(gl_FragCoord.xy) - 0.5) / 31.0 * 1.4;
            c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
          }
          if (abs(vUv.y - 0.5) > 0.5 - uBars) c = vec3(0.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.postScene = new THREE.Scene();
    const quad = new THREE.Mesh(tri, this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lines = 240; this.aspect = 'wide';
    // celular em retrato: jogo em 4:3 no alto e controles de toque embaixo
    this.stackPortrait = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    window.addEventListener('resize', () => this.layout());
    // alguns aparelhos só informam o tamanho novo um pouco depois de girar
    window.addEventListener('orientationchange', () => { this.layout(); setTimeout(() => this.layout(), 250); setTimeout(() => this.layout(), 700); });
  }

  configure(settings) {
    this.lines = settings.resolution;
    this.aspect = settings.aspect;
    this.postMat.uniforms.uDither.value = settings.dither ? 1 : 0;
    G.uJitter.value = settings.jitter ? 1 : 0;
    G.uAffine.value = [0, 0.45, 1][settings.affine] ?? 0.45;
    this.layout();
  }

  layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let cssW, cssH, top = null;
    if (this.stackPortrait && vh > vw * 1.1) { cssW = vw; cssH = Math.round(vw * 3 / 4); top = 0; }
    else if (this.aspect === '4:3') { cssH = vh; cssW = Math.min(vw, vh * 4 / 3); cssH = cssW * 3 / 4; }
    else { cssW = vw; cssH = vh; }
    if (top === null) top = (vh - cssH) / 2;
    // 0 = nativa (pixels reais da tela); as demais nunca passam da nativa para não reduzir com serrilhado
    const native = Math.max(240, Math.round(cssH * (window.devicePixelRatio || 1)));
    const H = this.lines > 0 ? Math.min(this.lines, native) : native;
    const W = Math.max(2, Math.round((H * cssW / cssH) / 2) * 2);
    this.W = W; this.H = H;
    this.gl.setSize(W, H, false);
    this.rt.setSize(W, H);
    this.ui.width = W; this.ui.height = H;
    for (const c of [this.canvas, this.ui]) {
      c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
      c.style.left = (vw - cssW) / 2 + 'px'; c.style.top = top + 'px';
    }
    // grade de encaixe dos vértices sempre equivalente a 240 linhas
    G.uSnap.value.set((W * (240 / H)) / 2, 120);
    this.cssRect = { x: (vw - cssW) / 2, y: top, w: cssW, h: cssH };
    this.onLayout?.(W, H);
  }

  // converte coordenadas do mouse (CSS) para pixels internos
  toInternal(cx, cy) {
    const r = this.cssRect;
    return [((cx - r.x) / r.w) * this.W, ((cy - r.y) / r.h) * this.H];
  }

  render(scene, camera) {
    camera.aspect = this.W / this.H;
    camera.updateProjectionMatrix();
    this.gl.setRenderTarget(this.rt);
    this.gl.render(scene, camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }

  set fade(v) { this.postMat.uniforms.uFade.value = v; }
  get fade() { return this.postMat.uniforms.uFade.value; }
  set bars(v) { this.postMat.uniforms.uBars.value = v; }
}
