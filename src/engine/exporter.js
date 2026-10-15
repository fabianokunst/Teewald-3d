import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Character } from '../game/character.js';
import { makeHeroTexture } from '../game/heroTexture.js';
import { withTextureQuality } from './textures.js';

// Exporta o protagonista como .glb (abre no Blender com textura e esqueleto).
// Carregado só quando chamado (import dinâmico em main.js e em tools/exportar/), para
// não pesar no jogo. O modelo sai na pose de repouso, em metros, com a escala de jogo
// (0,95) e a cabeça menor já aplicadas na malha: todos os ossos ficam com escala 1.
// A animação é procedural (IK em código), então vai o esqueleto mas nenhum clipe.

// o personagem olha para +z e o +x é o lado esquerdo dele (sufixos .L/.R do Blender)
const SIDE = { '-1': 'R', 1: 'L' };

// o jogo trabalha em espaço de cor de tela; no glTF a cor do vértice é linear
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function heroModel() {
  // textura no 3D limpo (sem a cor de 15 bits do PS1), feita de novo só para o arquivo
  const map = withTextureQuality('clean', () => makeHeroTexture());
  map.colorSpace = THREE.SRGBColorSpace;
  map.name = 'protagonista';
  const mat = new THREE.MeshStandardMaterial({ name: 'protagonista', map, vertexColors: true, roughness: 0.9, metalness: 0 });
  const c = new Character({ hero: mat, blob: mat }, mat);
  const { root, mesh } = c;

  // a geometria é compartilhada com o jogo (Character.geo): mexe numa cópia
  const geo = mesh.geometry = mesh.geometry.clone();
  // cor do vértice = oclusão assada (cinza): passa para linear
  const col = geo.getAttribute('color').array;
  for (let i = 0; i < col.length; i++) col[i] = toLinear(col[i]);

  // aplica a pose de repouso do jogo na malha (escala 0,95 e cabeça a 93%)
  const s = root.scale.x, pos = geo.getAttribute('position'), v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  for (let i = 0; i < pos.count; i++) {
    mesh.applyBoneTransform(i, v.fromBufferAttribute(pos, i)).multiplyScalar(s);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const bones = mesh.skeleton.bones;
  for (const b of bones) { b.position.multiplyScalar(s); b.scale.setScalar(1); }
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  // malha e esqueleto soltos na raiz da cena (o glTF pede a malha com pele na raiz)
  const scene = new THREE.Scene();
  scene.name = 'Protagonista';
  scene.add(mesh, c.hips);

  // nomes legíveis no Blender
  mesh.name = 'protagonista';
  c.hips.name = 'quadril'; c.spine.name = 'coluna'; c.neck.name = 'pescoco'; c.head.name = 'cabeca';
  for (const a of c.arms) { const k = SIDE[a.side]; a.sh.name = 'ombro.' + k; a.el.name = 'cotovelo.' + k; a.hand.name = 'mao.' + k; }
  for (const l of c.legs) { const k = SIDE[l.side]; l.hip.name = 'coxa.' + k; l.knee.name = 'joelho.' + k; l.ankle.name = 'tornozelo.' + k; l.toe.name = 'dedos.' + k; }
  return scene;
}

function download(buf, name) {
  const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// devolve o .glb (ArrayBuffer); baixar: false só gera (usado por npm run exportar)
export async function exportHero({ baixar = true } = {}) {
  const glb = await new GLTFExporter().parseAsync(heroModel(), { binary: true });
  if (baixar) download(glb, 'teewald-protagonista.glb');
  return glb;
}
