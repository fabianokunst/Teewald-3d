import * as THREE from 'three';
import { ps1Material } from './ps1material.js';
import { TEX, signTexture } from './textures.js';
import { GLOW } from './archTextures.js';
import { makeHeroTexture } from '../game/heroTexture.js';

// Um material PS1 para cada textura carregada, com ajustes por tipo
const CUTOUT = ['araucaria', 'araucariaBranch', 'crownAutumn', 'crownGreen', 'bush', 'hortensia', 'pine', 'cypress', 'mapleLeaf', 'flags', 'awnValance', 'chLancet', 'chRose', 'chPortal', 'chTowerWin', 'picket'];
const FOLIAGE = ['araucaria', 'araucariaBranch', 'crownAutumn', 'crownGreen', 'bush', 'hortensia', 'pine', 'cypress', 'hedge'];
const NO_AFFINE = ['paint'];

export const M = {};

export function makeMaterials() {
  for (const [name, tex] of Object.entries(TEX)) {
    const cut = CUTOUT.includes(name);
    const double = name.startsWith('roof') || name.startsWith('awn') || name === 'metalRoof' || name === 'metalRust' || name === 'fenceGrid';
    M[name] = ps1Material({
      map: tex,
      cutout: cut || name === 'fenceGrid',
      foliage: FOLIAGE.includes(name),
      affine: !NO_AFFINE.includes(name),
      side: cut || double ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  M.water = ps1Material({ map: TEX.water, scroll: [0.02, -0.18], wave: 0.04, shadow: false });
  M.sky = ps1Material({ map: TEX.sky, lit: false, fog: false, side: THREE.BackSide, depthWrite: false, affine: false });
  M.lamp = ps1Material({ map: TEX.lamp, lit: false, emissive: 0x222018 });
  M.farForest = ps1Material({ map: TEX.grassDry, color: 0xd0c098, edgeFade: true });
  M.blob = ps1Material({ map: TEX.blob, lit: false, transparent: true, fog: true, polygonOffset: -2 });
  M.paint = ps1Material({ map: TEX.paint, affine: false, polygonOffset: -1 });
  M.leafFall = ps1Material({ map: TEX.mapleLeaf, cutout: true, foliage: true });
  M.glassLit = ps1Material({ map: TEX.glass, emissive: 0x101010 });
  M.hero = ps1Material({ map: makeHeroTexture() });
  M.letter = ps1Material({ map: TEX.carPaint, color: new THREE.Color(1.5, 1.5, 1.5), emissive: 0x141414 });
  // janelas e vitrines acesas à noite: mesma textura + brilho do vidro (world/atmosphere.js acende)
  for (const name of Object.keys(GLOW)) M[name + 'Lit'] = ps1Material({ map: TEX[name], glowMap: GLOW[name] });
  // lente leitosa da luminária dos postes de rua (o brilho também vem da atmosfera)
  M.lampLens = ps1Material({ color: 0xa8a69e });
  return M;
}

const signCache = new Map();
// material de placa com texto, criado sob demanda
export function signMaterial(text, o = {}) {
  const key = text + JSON.stringify(o);
  if (!signCache.has(key)) {
    const name = 'sign:' + key;
    M[name] = ps1Material({ map: signTexture(text, o), affine: false });
    signCache.set(key, name);
  }
  return signCache.get(key);
}
