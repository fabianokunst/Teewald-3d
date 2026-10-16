// Estúdio de retratos: monta cada personagem com o modelo do jogo, sem cidade em volta,
// e fotografa o rosto e o corpo inteiro. Quem chama é tools/retratos.mjs (npm run retratos),
// que lê window.__retratos e grava as fichas do site (site/personagens.html).
import * as THREE from 'three';
import { loadTextures } from '../../src/engine/textures.js';
import { makeMaterials, M } from '../../src/engine/materials.js';
import { G } from '../../src/engine/ps1material.js';
import { NPC } from '../../src/game/npcs.js';
import { NPC_DEFS } from '../../src/game/npcData.js';
import { HEROI, CAMPANHA, CRIATURAS } from './outros.js';

const FACE = [320, 320], BODY = [220, 330];
const BG = 0x17130f;
const FOV = 24;
const SAT = 0.8;              // um pouco mais de cor que no jogo (0,6), para ler os detalhes

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
gl.outputColorSpace = THREE.LinearSRGBColorSpace;
gl.setPixelRatio(1);
gl.setClearColor(BG, 1);
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);

// luz de estúdio: sol quente pela frente e um pouco de cima, sem neblina nem sombra
G.uSunDir.value.set(0.45, 0.55, 0.72).normalize();
G.uSunColor.value.setRGB(0.86, 0.8, 0.72);
G.uAmbSky.value.setRGB(0.46, 0.47, 0.52);
G.uAmbGround.value.setRGB(0.24, 0.22, 0.21);
G.uFogNear.value = 900; G.uFogFar.value = 1000;
G.uShadowOn.value = 0;

// qualquer dependência que o retrato não usa (som, efeitos, luzes dinâmicas) vira um nada
const noop = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : noop),
  apply: () => noop, construct: () => noop,
});
const stub = base => new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });
const ctx = stub({
  groundAt: () => 0, indoor: null, interiorList: [], perches: [],
  terrain: stub({ heightAt: () => 0, waterAt: () => null }),
  collision: stub({ near: () => [] }),
  zones: stub({ insideBuilding: () => false }),
  playBounds: { x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 },
});
const audio = stub({ ctx: null, white: null });
const player = stub({ pos: new THREE.Vector3(0, 0, 6), hp: 100, dead: false });
const v = new THREE.Vector3(), box = new THREE.Box3();
// caixa só do que aparece (escudo desligado, efeitos escondidos ficam de fora)
function visibleBox(o, b = new THREE.Box3().makeEmpty()) {
  if (!o.visible) return b;
  if (o.isMesh) b.union(new THREE.Box3().setFromObject(o, true));
  else for (const c of o.children) visibleBox(c, b);
  return b;
}

// gradação parecida com a do jogo (renderer.js): menos saturação, leve verde-azulado
function grade(c, w, h) {
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d');
  g.drawImage(c, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = (l + (d[i] - l) * SAT) * 0.95; d[i + 1] = l + (d[i + 1] - l) * SAT; d[i + 2] = (l + (d[i + 2] - l) * SAT) * 0.98;
  }
  g.putImageData(img, 0, 0);
  return out.toDataURL('image/jpeg', 0.9);
}

// câmera mirando `at`, vinda da frente do personagem (+z) um pouco de lado; frameH = altura enquadrada
function shot(scene, at, frameH, [w, h], side = 0.32, depth = 0) {
  gl.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const d = frameH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) + depth;
  camera.position.set(at.x + Math.sin(side) * d, at.y + frameH * 0.04, at.z + Math.cos(side) * d);
  camera.lookAt(at);
  gl.render(scene, camera);
  return grade(canvas, w, h);
}

const sysFor = scene => ({
  M, scene, ctx, mode: 'play', dialogue: { open: false, chars: 0, pageText: '' },
  _v: new THREE.Vector3(), _v2: new THREE.Vector3(), _q: new THREE.Quaternion(), _x: new THREE.Vector3(1, 0, 0),
});

// morador: o mesmo NPC do jogo, de pé e parado, olhando para a frente
function npcShots(def) {
  const scene = new THREE.Scene(), sys = sysFor(scene);
  // no retrato ninguém fala ao telefone nem fotografa (a mão ficaria na frente do rosto)
  const d = { ...def, pose: ['phone', 'photo'].includes(def.pose) ? undefined : def.pose };
  const n = new NPC(d, sys);
  n.mode = 'stand'; n.pos.set(0, 0, 0); n.heading = 0; n.dist = 3; n.speed = 0;
  const dt = 1 / 30;
  for (let i = 0; i < 45; i++) {
    n.t += dt;
    n.ch.update(dt, 0, true, false);
    n._pose(dt, sys, 0);
    n.ch.root.position.copy(n.pos); n.ch.root.rotation.y = 0;
    n.ch.root.updateMatrixWorld(true);
    n._items(sys);
  }
  return humanShots(scene, n.ch);
}

function humanShots(scene, ch) {
  ch.blob.visible = false;
  scene.updateMatrixWorld(true);
  const head = ch.head, hs = head.getWorldScale(new THREE.Vector3()).y;
  const face = shot(scene, head.localToWorld(v.set(0, 0.11, 0)).clone(), 0.64 * hs, FACE);
  // corpo inteiro na mesma escala para todos (dá para comparar as alturas)
  const body = shot(scene, new THREE.Vector3(0, 1.02, 0), 2.2, BODY, 0.42);
  // altura medida: topo da cabeça (ou do chapéu)
  box.setFromObject(ch.root, true);
  return { face, body, alturaMedida: box.max.y };
}

// criatura: o modelo da luta, parado; enquadra a cabeça (bones.head) e o corpo todo
function creatureShots(spec) {
  const scene = new THREE.Scene();
  const deps = { ctx, scene, audio, player, effects: noop, atmo: noop, combat: noop, M };
  const e = spec.make(deps);
  const dt = 1 / 30;
  if (spec.chupa) {
    e.pos.set(0, 0, 0); e.heading = 0; e.state = 'fight'; e.active = true; e.root.visible = true;
    for (let i = 0; i < 30; i++) { e.st = (e.st || 0) + dt; try { e._animate(dt, 0, 6); } catch (err) { /* pose base */ } e._pose(); e._sync(); }
  } else {
    if (e.place) e.place(0, 0, 0); else e.root.visible = true;
    for (let i = 0; i < 30; i++) {
      e.st = (e.st || 0) + dt;
      try { e.animate?.(dt, { player, ctx }); } catch (err) { /* pose base */ }
      e.sync?.();
    }
  }
  e.root.visible = true;
  spec.prep?.(e);
  scene.updateMatrixWorld(true);
  // luz extra para quem é escuro demais (carvão, pelo preto)
  const k = spec.luz || 1, cols = [G.uSunColor.value, G.uAmbSky.value, G.uAmbGround.value];
  for (const c of cols) c.multiplyScalar(k);
  try {
    // rosto: caixa da cabeça; cabelo comprido e véus esticam a caixa, então quem tem
    // usa spec.face = { h: altura enquadrada, dy: acima do osso da cabeça } (metros)
    const hp = e.bones.head.getWorldPosition(new THREE.Vector3());
    const hb = visibleBox(e.bones.head);
    const hc = hb.getCenter(new THREE.Vector3()), hsz = hb.getSize(new THREE.Vector3());
    const face = spec.face
      ? shot(scene, hp.clone().add(new THREE.Vector3(0, spec.face.dy, 0)), spec.face.h, FACE, 0.32, spec.face.h * 0.3)
      : shot(scene, hc, Math.max(hsz.y, hsz.x) * 1.9, FACE, 0.32, hsz.z / 2);
    const bb = visibleBox(e.root);
    const bc = bb.getCenter(new THREE.Vector3()), bs = bb.getSize(new THREE.Vector3());
    const body = shot(scene, bc, Math.max(bs.y, bs.x * BODY[1] / BODY[0], 0.6) * 1.12, BODY, 0.6, Math.max(bs.x, bs.z) / 2);
    return { face, body, alturaMedida: bs.y, envergadura: Math.max(bs.x, bs.z), dbg: { head: hp.toArray(), hb: [hb.min.toArray(), hb.max.toArray()], bb: [bb.min.toArray(), bb.max.toArray()] } };
  } finally {
    for (const c of cols) c.multiplyScalar(1 / k);
  }
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const TEXT = ['voa', 'asa', 'papel', 'idade', 'altura', 'porte', 'curvado', 'rosto', 'corpo', 'roupa', 'jeito'];

async function run() {
  await loadTextures(() => {}, 'clean');
  makeMaterials();
  const out = { itens: [], erros: [] };
  const go = (base, fn) => {
    try { out.itens.push({ ...base, ...fn() }); } catch (err) { out.erros.push(`${base.id}: ${err.message}\n${err.stack}`); }
  };
  go({ id: HEROI.id, nome: HEROI.nome, grupo: 'protagonista', ...pick(HEROI, TEXT) }, () => {
    const scene = new THREE.Scene(), ch = HEROI.make({ M });
    scene.add(ch.root, ch.blob);
    for (let i = 0; i < 45; i++) { ch.update(1 / 30, 0, true, false); ch.root.updateMatrixWorld(true); }
    return humanShots(scene, ch);
  });
  for (const def of NPC_DEFS) go({ id: def.id, nome: def.name, grupo: 'morador', ...pick(def.ficha || {}, TEXT) }, () => npcShots(def));
  for (const c of CAMPANHA) go({ id: c.id, nome: c.nome, grupo: 'campanha', ...pick(c, TEXT) }, () => creatureShots(c));
  for (const c of CRIATURAS) go({ id: c.id, nome: c.nome, grupo: 'criatura', ...pick(c, TEXT) }, () => creatureShots(c));
  window.__retratos = out;
}

run().catch(err => { window.__retratos = { itens: [], erros: [String(err.stack || err)] }; });
