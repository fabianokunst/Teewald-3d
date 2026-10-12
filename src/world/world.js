import * as THREE from 'three';
import mapdata from './mapdata.json';
import { Terrain } from './terrain.js';
import { prepareRoads, buildRoads, roadSurfaceAt } from './roads.js';
import { prepareRivers, buildWater } from './water.js';
import { Zones } from './zones.js';
import { defineLandmarks, buildLandmarks, placeStopSigns } from './landmarks.js';
import { placeTownBuildings, placeFootprintBuildings } from './buildings.js';
import { prepareFootprints } from './footprints.js';
import { scatterVegetation, buildVegetation } from './vegetation.js';
import { utilityLines } from './props.js';
import { buildChupaSites } from './chupaSites.js';
import { makeSky } from './sky.js';
import { FallingLeaves } from './leaves.js';
import { MeshBuilder } from '../engine/builder.js';
import { CollisionWorld } from '../engine/collision.js';
import { M } from '../engine/materials.js';
import { pointInPoly } from './geo.js';
import { PLAY_BOUNDS } from '../config.js';

const frame = () => new Promise(r => requestAnimationFrame(() => r()));

// Monta a cidade inteira. onStep(fração, texto) atualiza a tela de carregamento.
export async function buildWorld(scene, onStep) {
  const ctx = { mapdata, trees: [], floors: [], lights: [], playBounds: PLAY_BOUNDS };
  const step = async (f, t) => { onStep?.(f, t); await frame(); };

  await step(0.05, 'relevo');
  ctx.terrain = new Terrain(mapdata);
  ctx.roads = prepareRoads(mapdata);
  ctx.rivers = prepareRivers(mapdata, ctx.terrain);
  ctx.zones = new Zones(ctx);
  ctx.collision = new CollisionWorld(8);
  defineLandmarks(ctx);
  ctx.terrain.finalize(ctx.roads.index, ctx.rivers.index);

  await step(0.25, 'ruas e rio');
  const B = new MeshBuilder(200);
  const terrainMesh = ctx.terrain.buildMesh(M, ctx.zones);
  scene.add(terrainMesh);
  ctx.bridges = buildRoads(B, ctx);
  buildWater(B, ctx.rivers);

  await step(0.4, 'igreja, praça e calçadão');
  ctx.footprints = prepareFootprints(mapdata);
  buildLandmarks(B, ctx);

  await step(0.55, 'casas');
  // contornos reais de prédios; sem eles, casas geradas ao longo das ruas
  ctx.buildings = ctx.footprints.length ? placeFootprintBuildings(ctx, B) : placeTownBuildings(ctx, B);
  placeStopSigns(B, ctx);
  // missão do chupacabras: galinheiro, trilha, clareira e mural (antes das árvores)
  buildChupaSites(B, ctx);

  await step(0.7, 'postes e fios');
  const wires = utilityLines(ctx, B);
  scene.add(wires);

  await step(0.78, 'malhas');
  const statics = B.build(M);
  scene.add(statics);

  await step(0.85, 'árvores');
  scatterVegetation(ctx);
  const veg = buildVegetation(ctx, M);
  scene.add(veg);

  await step(0.95, 'céu');
  ctx.sky = makeSky(M);
  scene.add(ctx.sky);
  ctx.leaves = new FallingLeaves(M.leafFall, ctx.terrain);
  scene.add(ctx.leaves.mesh);

  // altura do chão para o jogador: terreno, ruas, calçadas, pisos e plataformas
  ctx.groundAt = (x, z, feetY) => {
    let y = ctx.terrain.heightAt(x, z);
    const r = roadSurfaceAt(ctx.roads, ctx.terrain, x, z);
    if (r !== null) y = Math.max(y, r);
    for (const f of ctx.floors) if (pointInPoly(x, z, f.poly)) y = Math.max(y, f.y);
    const fl = ctx.collision.floorAt(x, z, feetY + 0.45);
    if (fl > y) y = fl;
    return y;
  };
  ctx.isDeepWater = (x, z, y) => {
    const w = ctx.terrain.waterAt(x, z);
    return w && w.river.width > 5 && y < w.level + 0.2;
  };
  ctx.placeName = (x, z) => ctx.zones.placeAt(x, z);
  ctx.streetName = (x, z) => {
    const q = ctx.roads.index.nearest(x, z, d => d.name && d.rank >= 2);
    if (!q.seg || q.d > q.seg.data.hw + 4) return null;
    const n = q.seg.data.name;
    return /^[A-Z]{2,4}-\d+$/.test(n) ? 'Rodovia ' + n : n;
  };

  let tris = 0;
  scene.traverse(o => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry, n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      tris += n * (o.isInstancedMesh ? o.count : 1);
    }
  });
  ctx.stats = { triangles: Math.round(tris), buildings: ctx.buildings.length, trees: ctx.trees.length };
  console.info('Teewald:', ctx.stats);
  await step(1, 'pronto');
  return ctx;
}

export { THREE };
