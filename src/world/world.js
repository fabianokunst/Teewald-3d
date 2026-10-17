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
import { defineCountryside, buildCountryside } from './countryside.js';
import { makeSky } from './sky.js';
import { FallingLeaves } from './leaves.js';
import { MeshBuilder } from '../engine/builder.js';
import { CollisionWorld } from '../engine/collision.js';
import { M } from '../engine/materials.js';
import { pointInPoly, SegmentIndex, distSeg } from './geo.js';
import { PLAY_BOUNDS, INTERIOR_MIN } from '../config.js';

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

// miudezas que nem aparecem de longe: somem a partir desta distância (m) da borda do pedaço
const LOD_NEAR = 330;
// (janelas, portas e placas da cidade também: de longe são um ou dois pixels)
const DETAIL = {
  milho: 380, arame: 260, fardo: 300, fardoEnd: 300, silagem: 300, barnDoor: 500, arbusto: 420, hortensia: 300,
  door: 450, window1: 450, window2: 450, window3: 450, window1Lit: 700, window2Lit: 700, window3Lit: 700, shutter: 350,
  stonePath: 400, pavers: 450, herring: 400, picket: 300, fenceGrid: 300, lampLens: 400, grating: 300, awnRed: 450,
  awnBlue: 450, awnCream: 450, rollDoor: 500, winFactory: 600, shop: 500, shopLit: 700,
};
const detailFar = name => DETAIL[name] ?? (name.startsWith('sign:') ? 400 : Infinity);

// Monta a cidade inteira. onStep(fração, texto) atualiza a tela de carregamento.
export async function buildWorld(scene, onStep) {
  // perches: onde as corujas pousam (postes, lampiões, chaminés, cumeeiras)
  const ctx = { mapdata, trees: [], floors: [], lights: [], perches: [], playBounds: PLAY_BOUNDS };
  const step = async (f, t) => { onStep?.(f, t); await frame(); };

  await step(0.05, 'relevo');
  ctx.terrain = new Terrain(mapdata);
  ctx.roads = prepareRoads(mapdata);
  ctx.rivers = prepareRivers(mapdata, ctx.terrain);
  ctx.zones = new Zones(ctx);
  ctx.collision = new CollisionWorld(8);
  ctx.walkways = new SegmentIndex(10, 3);
  defineLandmarks(ctx);
  // interior da área ampliada: represa, usina (reserva as áreas e escava o terreno)
  defineCountryside(ctx);
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
  // no interior, pedaços de 400 m (menos chamadas de desenho); miudezas do campo ficam
  // em 200 m, que somem antes (DETAIL)
  if (ctx.terrain.ring) B.chunkFor = (mat, x, z) => (DETAIL[mat] || ctx.terrain.inNear(x, z) ? 200 : 400);
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
  // interior: represa e barragem, usina, cercas, milharais e fardos (antes das árvores)
  buildCountryside(B, ctx);

  await step(0.7, 'postes e fios');
  const wires = utilityLines(ctx, B);
  wires.userData.noShadow = true;
  scene.add(wires);

  await step(0.78, 'malhas 3D');
  const statics = B.build(M);
  // parte fixa da cidade: a sombra dela fica guardada (engine/shadows.js)
  statics.userData.shadowStatic = true;
  scene.add(statics);

  await step(0.85, 'árvores');
  scatterVegetation(ctx);
  const veg = buildVegetation(ctx, M);
  veg.userData.shadowStatic = true;
  scene.add(veg);

  // pedaços de 200 m do chão, da cidade e das árvores inteiros além da neblina nem são
  // desenhados (a câmera vê até 2,6 km; com a área ampliada seria o mapa quase todo)
  const cull = [];
  for (const root of [terrainMesh, statics, veg]) root.traverse(o => {
    if (!o.isMesh) return;
    const s = (o.isInstancedMesh && o.boundingSphere) || o.geometry.boundingSphere;
    if (s && s.radius < 1500) cull.push({ o, x: s.center.x, z: s.center.z, r: s.radius, max: detailFar(o.name), lod: o.userData.lod });
  });
  // árvores do interior: a versão completa até LOD_NEAR metros da borda do pedaço, depois a simples
  ctx.cull = (cx, cz, far) => {
    for (const c of cull) {
      const d = Math.hypot(c.x - cx, c.z - cz) - c.r;
      c.o.visible = d < Math.min(far, c.max) && (c.lod === 'near' ? d < LOD_NEAR : c.lod !== 'far' || d >= LOD_NEAR);
    }
  };

  await step(0.95, 'céu');
  ctx.sky = makeSky(M);
  scene.add(ctx.sky);
  ctx.leaves = new FallingLeaves(M.leafFall, ctx.terrain);
  ctx.leaves.mesh.userData.noShadow = true;
  scene.add(ctx.leaves.mesh);

  // altura do chão para o jogador: terreno, ruas, calçadas, pisos e plataformas
  ctx.indoor = null;   // interior atual (world/interiors.js)
  // interior que contém o ponto (os interiores ficam longe de tudo, x >= INTERIOR_MIN)
  const interiorAt = (x, z) => x > INTERIOR_MIN && ctx.interiorList?.find(d => x >= d.bounds.x0 && x <= d.bounds.x1 && z >= d.bounds.z0 && z <= d.bounds.z1);
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
  // superfície da água sobre o ponto (null fora d'água e nos interiores) e quanto de
  // água há acima da altura y (0 = seco)
  ctx.waterLevel = (x, z) => (ctx.indoor ? null : ctx.terrain.waterLevel(x, z));
  ctx.waterDepth = (x, z, y) => {
    const l = ctx.waterLevel(x, z);
    return l === null ? 0 : Math.max(0, l - y);
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
