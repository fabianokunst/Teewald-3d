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
import { pointInPoly, SegmentIndex, distSeg } from './geo.js';
import { PLAY_BOUNDS } from '../config.js';

const frame = () => new Promise(r => requestAnimationFrame(() => r()));

// piso desenhado por cima do chão: { poly, y (número ou função (x, z)), surface }
function floorHeight(f, x, z) {
  const b = f.bb || (f.bb = f.poly.reduce((m, [px, pz]) => [Math.min(m[0], px), Math.min(m[1], pz), Math.max(m[2], px), Math.max(m[3], pz)], [Infinity, Infinity, -Infinity, -Infinity]));
  if (x < b[0] || x > b[2] || z < b[1] || z > b[3] || !pointInPoly(x, z, f.poly)) return null;
  return typeof f.y === 'function' ? f.y(x, z) : f.y;
}

// caminho elevado (lajotas do calçadão): quanto fica acima do terreno no ponto, ou null.
// data = { hw, dy, edge, edgeDy }: meia largura e altura do piso, largura e altura da borda
function walkwayLift(index, x, z) {
  let best = null;
  for (const id of index.candidates(x, z)) {
    const s = index.segs[id], w = s.data;
    const [d, t] = distSeg(x, z, s.ax, s.az, s.bx, s.bz);
    if (d > w.hw + w.edge) continue;
    // depois da ponta do caminho não há lajota (a distância ali é a de um semicírculo)
    if ((t <= 0 && s.i === 0) || (t >= 1 && s.i === s.n - 1)) continue;
    const dy = d <= w.hw ? w.dy : w.dy + (w.edgeDy - w.dy) * (d - w.hw) / w.edge;
    if (best === null || dy > best) best = dy;
  }
  return best;
}

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
  ctx.walkways = new SegmentIndex(10, 3);
  defineLandmarks(ctx);
  ctx.terrain.finalize(ctx.roads.index, ctx.rivers.index);
  // superfície onde um objeto se apoia: terreno, rua, calçada, caminho ou piso
  // (praça, adro, campo, pátio). Tudo que é desenhado acima do terreno e se pisa
  // precisa estar aqui, senão os pés do jogador afundam nele
  ctx.surfaceAt = (x, z) => {
    const h = ctx.terrain.heightAt(x, z);
    let y = h;
    const r = roadSurfaceAt(ctx.roads, ctx.terrain, x, z);
    if (r !== null) y = Math.max(y, r);
    const w = walkwayLift(ctx.walkways, x, z);
    if (w !== null) y = Math.max(y, h + w);
    for (const f of ctx.floors) { const fy = floorHeight(f, x, z); if (fy !== null && fy > y) y = fy; }
    return y;
  };

  await step(0.25, 'ruas e rio');
  const B = new MeshBuilder(200);
  const terrainMesh = ctx.terrain.buildMesh(M, ctx.zones);
  // o chão recebe sombra mas não projeta (o relevo já escurece pela inclinação)
  terrainMesh.userData.noShadow = true;
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
  wires.userData.noShadow = true;
  scene.add(wires);

  await step(0.78, 'malhas');
  const statics = B.build(M);
  // parte fixa da cidade: a sombra dela fica guardada (engine/shadows.js)
  statics.userData.shadowStatic = true;
  scene.add(statics);

  await step(0.85, 'árvores');
  scatterVegetation(ctx);
  const veg = buildVegetation(ctx, M);
  veg.userData.shadowStatic = true;
  scene.add(veg);

  await step(0.95, 'céu');
  ctx.sky = makeSky(M);
  scene.add(ctx.sky);
  ctx.leaves = new FallingLeaves(M.leafFall, ctx.terrain);
  ctx.leaves.mesh.userData.noShadow = true;
  scene.add(ctx.leaves.mesh);

  // altura do chão para o jogador: terreno, ruas, calçadas, pisos e plataformas
  ctx.indoor = null;   // interior atual (world/interiors.js)
  // interior que contém o ponto (os interiores ficam longe da cidade, x >= 1200)
  const interiorAt = (x, z) => x > 1000 && ctx.interiorList?.find(d => x >= d.bounds.x0 && x <= d.bounds.x1 && z >= d.bounds.z0 && z <= d.bounds.z1);
  ctx.groundAt = (x, z, feetY) => {
    // o interior atual, ou o de um bicho que ficou lá dentro com o jogador fora
    const ind = ctx.indoor || interiorAt(x, z);
    if (ind) {
      const f = ctx.collision.floorAt(x, z, feetY + 0.45);
      // interior com chão irregular (gruta): a altura exata da malha desenhada
      if (ind.ground) return Math.max(f, ind.ground(x, z));
      return f > -Infinity ? f : ind.floorY;
    }
    let y = ctx.surfaceAt(x, z);
    const fl = ctx.collision.floorAt(x, z, feetY + 0.45);
    if (fl > y) y = fl;
    return y;
  };
  ctx.isDeepWater = (x, z, y) => {
    if (ctx.indoor) return false;
    const w = ctx.terrain.waterAt(x, z);
    return w && w.river.width > 5 && y < w.level + 0.2;
  };
  ctx.placeName = (x, z) => (ctx.indoor ? ctx.indoor.title : ctx.zones.placeAt(x, z));
  ctx.streetName = (x, z) => {
    if (ctx.indoor) return null;
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
