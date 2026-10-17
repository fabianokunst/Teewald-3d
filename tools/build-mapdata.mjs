// Gera src/world/mapdata.json a partir do OpenStreetMap (ruas, rio, áreas, pontos)
// e do relevo SRTM 30m (OpenTopoData). Usa o cache em tools/cache se existir;
// rode com --refresh para baixar de novo a área ampliada.
//
// Coordenadas do jogo: metros a partir do centro da cidade.
//   x = leste, z = sul, y = altura.
//
// Duas camadas:
// - a cidade (camada 1): os caches de 11/10/2026 (osm.json, elev.json, buildings-ms.json),
//   recortados como sempre. Ficam congelados: a cidade, o sorteio das casas e das árvores
//   e o relevo dela não mudam. --refresh nunca toca neles.
// - a área ampliada (camada 2, +1 km para cada lado): caches *-amplo.json, só com o que fica
//   fora da camada 1 (ruas emendadas na ponta, prédios, áreas e pontos novos, relevo
//   médio e distante). Vai no fim de cada lista; mapdata.v1 diz quantos itens são da cidade.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, 'cache');
const outFile = path.join(here, '..', 'src', 'world', 'mapdata.json');
const refresh = process.argv.includes('--refresh');

const LAT0 = -29.4977269, LON0 = -50.9919419; // Santa Maria do Herval (centro)
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const toXZ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const toLatLon = (x, z) => [LAT0 - z / KZ, LON0 + x / KX];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// caixas [x0, z0, x1, z1]: ruas e o resto (áreas, pontos, prédios) de cada camada
const V1 = { ROAD_BOX: [-1100, -1100, 1200, 1100], AREA_BOX: [-800, -800, 900, 800] };
const V2 = { ROAD_BOX: [-1670, -1730, 1810, 1690], AREA_BOX: [-1660, -1720, 1800, 1680], OSM: 2000 };

async function fetchOSM(R) {
  const [s, w] = toLatLon(-R, R), [n, e] = toLatLon(R, -R);
  const bb = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  const q = `[out:json][timeout:180];(way["highway"](${bb});way["waterway"](${bb});way["building"](${bb});
    way["leisure"](${bb});way["landuse"](${bb});way["natural"](${bb});way["amenity"](${bb});
    node["name"](${bb});node["amenity"](${bb});node["tourism"](${bb}););out body;>;out skel qt;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
  return r.json();
}

async function fetchElevation(grids) {
  const out = {};
  for (const g of grids) {
    const pts = [];
    for (let z = g.z0; z <= g.z1; z += g.step) for (let x = g.x0; x <= g.x1; x += g.step) pts.push([x, z]);
    const h = new Array(pts.length).fill(null);
    for (let i = 0; i < pts.length; i += 100) {
      const locs = pts.slice(i, i + 100).map(([x, z]) => toLatLon(x, z).map(v => v.toFixed(6)).join(',')).join('|');
      for (let tryN = 0; ; tryN++) {
        const r = await fetch('https://api.opentopodata.org/v1/srtm30m', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: locs, interpolation: 'bilinear' }),
        });
        if (r.ok) { const j = await r.json(); j.results.forEach((res, k) => { h[i + k] = res.elevation; }); break; }
        if (tryN > 5) throw new Error('relevo: ' + r.status);
        await sleep(3000);
      }
      process.stdout.write(`\r  relevo ${g.name}: ${Math.min(pts.length, i + 100)}/${pts.length}`);
      await sleep(1100);
    }
    process.stdout.write('\n');
    out[g.name] = { ...g, nx: Math.round((g.x1 - g.x0) / g.step) + 1, nz: Math.round((g.z1 - g.z0) / g.step) + 1, h };
  }
  return out;
}

// contornos de prédios (Microsoft Global ML Building Footprints, ODbL)
async function fetchBuildings(box) {
  const zlib = await import('node:zlib');
  const quadkey = '210312133';
  const links = await (await fetch('https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv')).text();
  const row = links.split('\n').find(l => l.startsWith('Brazil,' + quadkey + ','));
  const url = row.split(',')[2];
  const gz = Buffer.from(await (await fetch(url)).arrayBuffer());
  const lines = zlib.gunzipSync(gz).toString('utf8').split('\n');
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let f; try { f = JSON.parse(line); } catch { continue; }
    if (f.geometry?.type !== 'Polygon') continue;
    const pts = f.geometry.coordinates[0].map(([lon, lat]) => toXZ(lat, lon).map(r1));
    pts.pop();
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    if (cx < box[0] || cx > box[2] || cz < box[1] || cz > box[3]) continue;
    out.push({ p: pts, h: f.properties?.height ?? -1, c: f.properties?.confidence ?? -1 });
  }
  return out;
}

// cache[name] ou baixa; fixed = nunca baixa de novo (a cidade)
async function cached(name, fn, fixed = false) {
  const f = path.join(cacheDir, name);
  if ((fixed || !refresh) && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  if (fixed) throw new Error('falta o cache da cidade: ' + name);
  console.log('  baixando ' + name + '...');
  const data = await fn();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data));
  return data;
}

// recorta uma polilinha numa caixa, devolvendo os trechos internos
function clipPolyline(pts, b) {
  const inside = ([x, z]) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
  const parts = []; let cur = [];
  for (let i = 0; i < pts.length; i++) {
    if (inside(pts[i])) { cur.push(pts[i]); continue; }
    // mantém um ponto de fora para a rua não terminar antes da borda
    if (cur.length) { cur.push(pts[i]); parts.push(cur); cur = []; }
    else if (i + 1 < pts.length && inside(pts[i + 1])) cur.push(pts[i]);
  }
  if (cur.length) parts.push(cur);
  return parts.filter(p => p.length > 1);
}

// o resto da polilinha fora da cidade: os trechos com as duas pontas fora da caixa da
// camada 1 (o que cruza a borda já está lá, com o primeiro ponto de fora) e dentro da
// caixa nova. A emenda fica no mesmo ponto
function outerParts(pts, inner, outer) {
  const inI = ([x, z]) => x >= inner[0] && x <= inner[2] && z >= inner[1] && z <= inner[3];
  const parts = [];
  let cur = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (inI(a) || inI(b)) { if (cur.length > 1) parts.push(cur); cur = []; continue; }
    if (!cur.length) cur.push(a);
    cur.push(b);
  }
  if (cur.length > 1) parts.push(cur);
  return parts.flatMap(p => clipPolyline(p, outer));
}

const r1 = v => Math.round(v * 10) / 10;
const inBox = ([x, z], b) => x > b[0] && x < b[2] && z > b[1] && z < b[3];
const centroid = pts => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);

// ---------- camada 1: a cidade (igual a sempre) ----------
const osm = await cached('osm.json', null, true);
const elev = await cached('elev.json', null, true);
const msb = await cached('buildings-ms.json', null, true);

function layer(osm, B, keep) {
  const nodes = new Map();
  for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, e);
  const wayPts = w => w.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => toXZ(n.lat, n.lon).map(r1));
  const roads = [], rivers = [], areas = [], pois = [];
  for (const w of osm.elements) {
    if (w.type !== 'way' || !w.tags) continue;
    const t = w.tags, pts = wayPts(w);
    if (t.highway && t.highway !== 'dummy') {
      for (const p of keep.road(pts, B)) roads.push({ n: t.name || '', t: t.highway, s: t.surface || '', b: t.bridge === 'yes' ? 1 : 0, p });
    } else if (t.waterway === 'river' || t.waterway === 'stream') {
      if (keep.rivers) for (const p of clipPolyline(pts, [-1700, -1700, 1700, 1700])) rivers.push({ n: t.name || '', k: t.waterway, p });
    } else if (t.natural === 'water') {
      if (keep.area(centroid(pts))) areas.push({ k: 'water', n: t.name || '', p: pts });
    } else {
      const k = t.leisure || t.landuse || (t.amenity === 'fuel' ? 'fuel' : null) || (t.building ? 'building' : null) || t.natural;
      if (!k) continue;
      const c = centroid(pts);
      if (c[0] < B.AREA_BOX[0] || c[0] > B.AREA_BOX[2] || c[1] < B.AREA_BOX[1] || c[1] > B.AREA_BOX[3]) continue;
      if (!keep.area(c)) continue;
      areas.push({ k, n: t.name || '', a: t.amenity || t.tourism || '', p: pts });
    }
  }
  for (const e of osm.elements) {
    if (e.type !== 'node' || !e.tags) continue;
    const t = e.tags;
    const k = t.amenity || t.tourism || t.shop || t.man_made || t.place || t.natural || t.healthcare;
    if (!k) continue;
    const [x, z] = toXZ(e.lat, e.lon);
    if (x < B.AREA_BOX[0] || x > B.AREA_BOX[2] || z < B.AREA_BOX[1] || z > B.AREA_BOX[3]) continue;
    if (!keep.area([x, z])) continue;
    pois.push({ k, n: t.name || '', x: r1(x), z: r1(z) });
  }
  return { roads, rivers, areas, pois };
}

const A = layer(osm, V1, { road: (pts, B) => clipPolyline(pts, B.ROAD_BOX), area: () => true, rivers: true });
const buildingsA = msb.filter(b => b.p.every(([x, z]) => x > V1.AREA_BOX[0] && x < V1.AREA_BOX[2] && z > V1.AREA_BOX[1] && z < V1.AREA_BOX[3])).map(b => b.p);

// ---------- camada 2: a área ampliada ----------
const osm2 = await cached('osm-amplo.json', () => fetchOSM(V2.OSM));
const elev2 = await cached('elev-amplo.json', () => fetchElevation([
  // relevo médio (50 m, os mesmos pontos da grade fina da cidade) e o distante (100 m, até
  // onde a vista alcança nos dias limpos)
  { name: 'mid', x0: -1950, x1: 2050, z0: -2000, z1: 1950, step: 50 },
  { name: 'far', x0: -3600, x1: 3600, z0: -3600, z1: 3600, step: 100 },
]));
const msb2 = await cached('buildings-ms-amplo.json', () => fetchBuildings([-2000, -2000, 2100, 2000]));

const B2 = layer(osm2, V2, {
  road: (pts, B) => outerParts(pts, V1.ROAD_BOX, B.ROAD_BOX),
  area: c => !inBox(c, V1.AREA_BOX),
  rivers: false,
});
const inside1 = b => b.every(([x, z]) => x > V1.AREA_BOX[0] && x < V1.AREA_BOX[2] && z > V1.AREA_BOX[1] && z < V1.AREA_BOX[3]);
const inside2 = b => b.every(([x, z]) => x > V2.AREA_BOX[0] && x < V2.AREA_BOX[2] && z > V2.AREA_BOX[1] && z < V2.AREA_BOX[3]);
const buildingsB = msb2.filter(b => inside2(b.p) && !inside1(b.p)).map(b => b.p);

const data = {
  attribution: 'Dados de mapa © colaboradores do OpenStreetMap (ODbL). Prédios: Microsoft Global ML Building Footprints (ODbL). Relevo: SRTM 30m (NASA) via OpenTopoData.',
  origin: { lat: LAT0, lon: LON0 },
  // quantos itens de cada lista são da cidade (camada 1); o resto é a área ampliada
  v1: { roads: A.roads.length, areas: A.areas.length, pois: A.pois.length, buildings: buildingsA.length },
  roads: [...A.roads, ...B2.roads],
  rivers: A.rivers,
  areas: [...A.areas, ...B2.areas],
  pois: [...A.pois, ...B2.pois],
  buildings: [...buildingsA, ...buildingsB],
  elev: {
    fine: { ...elev.fine, h: elev.fine.h.map(v => Math.round(v * 10) / 10) },
    wide: { ...elev.wide, h: elev.wide.h.map(v => Math.round(v * 10) / 10) },
    mid: { ...elev2.mid, h: elev2.mid.h.map(v => Math.round(v * 10) / 10) },
    far: { ...elev2.far, h: elev2.far.h.map(v => Math.round(v * 10) / 10) },
  },
};
fs.writeFileSync(outFile, JSON.stringify(data));
const n = (a, k) => `${a.length} (${data.v1[k]} da cidade)`;
console.log(`mapdata.json: ${n(data.roads, 'roads')} ruas, ${data.rivers.length} rios, ${n(data.areas, 'areas')} áreas, ${n(data.pois, 'pois')} pontos, ${n(data.buildings, 'buildings')} prédios`);
