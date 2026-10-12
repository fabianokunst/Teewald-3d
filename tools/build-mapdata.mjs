// Gera src/world/mapdata.json a partir do OpenStreetMap (ruas, rio, áreas, pontos)
// e do relevo SRTM 30m (OpenTopoData). Usa o cache em tools/cache se existir;
// rode com --refresh para baixar tudo de novo.
//
// Coordenadas do jogo: metros a partir do centro da cidade.
//   x = leste, z = sul, y = altura.
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

async function fetchOSM() {
  const [s, w] = toLatLon(-1300, 1300), [n, e] = toLatLon(1300, -1300);
  const bb = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  const q = `[out:json][timeout:90];(way["highway"](${bb});way["waterway"](${bb});way["building"](${bb});
    way["leisure"](${bb});way["landuse"](${bb});way["natural"](${bb});way["amenity"](${bb});
    node["name"](${bb});node["amenity"](${bb});node["tourism"](${bb}););out body;>;out skel qt;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
  return r.json();
}

async function fetchElevation() {
  const grids = [
    { name: 'wide', x0: -1600, x1: 1600, z0: -1600, z1: 1600, step: 100 },
    { name: 'fine', x0: -500, x1: 800, z0: -700, z1: 650, step: 50 },
  ];
  const out = {};
  for (const g of grids) {
    const pts = [];
    for (let z = g.z0; z <= g.z1; z += g.step) for (let x = g.x0; x <= g.x1; x += g.step) pts.push([x, z]);
    const h = new Array(pts.length).fill(null);
    for (let i = 0; i < pts.length; i += 100) {
      const locs = pts.slice(i, i + 100).map(([x, z]) => toLatLon(x, z).map(v => v.toFixed(6)).join(',')).join('|');
      const r = await fetch('https://api.opentopodata.org/v1/srtm30m', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: locs, interpolation: 'bilinear' }),
      });
      const j = await r.json();
      j.results.forEach((res, k) => { h[i + k] = res.elevation; });
      await sleep(1100);
    }
    out[g.name] = { ...g, nx: Math.round((g.x1 - g.x0) / g.step) + 1, nz: Math.round((g.z1 - g.z0) / g.step) + 1, h };
  }
  return out;
}

async function cached(name, fn) {
  const f = path.join(cacheDir, name);
  if (!refresh && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
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

const r1 = v => Math.round(v * 10) / 10;

const osm = await cached('osm.json', fetchOSM);
const elev = await cached('elev.json', fetchElevation);

const nodes = new Map();
for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, e);
const wayPts = w => w.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => toXZ(n.lat, n.lon).map(r1));

const ROAD_BOX = [-1100, -1100, 1200, 1100];
const AREA_BOX = [-800, -800, 900, 800];
const roads = [], rivers = [], areas = [], pois = [];

for (const w of osm.elements) {
  if (w.type !== 'way' || !w.tags) continue;
  const t = w.tags, pts = wayPts(w);
  if (t.highway && t.highway !== 'dummy') {
    for (const p of clipPolyline(pts, ROAD_BOX)) roads.push({ n: t.name || '', t: t.highway, s: t.surface || '', b: t.bridge === 'yes' ? 1 : 0, p });
  } else if (t.waterway === 'river' || t.waterway === 'stream') {
    for (const p of clipPolyline(pts, [-1700, -1700, 1700, 1700])) rivers.push({ n: t.name || '', k: t.waterway, p });
  } else if (t.natural === 'water') {
    areas.push({ k: 'water', n: t.name || '', p: pts });
  } else {
    const k = t.leisure || t.landuse || (t.amenity === 'fuel' ? 'fuel' : null) || (t.building ? 'building' : null) || t.natural;
    if (!k) continue;
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    if (c[0] < AREA_BOX[0] || c[0] > AREA_BOX[2] || c[1] < AREA_BOX[1] || c[1] > AREA_BOX[3]) continue;
    areas.push({ k, n: t.name || '', a: t.amenity || t.tourism || '', p: pts });
  }
}
for (const e of osm.elements) {
  if (e.type !== 'node' || !e.tags) continue;
  const t = e.tags;
  const k = t.amenity || t.tourism || t.shop || t.man_made || t.place || t.natural || t.healthcare;
  if (!k) continue;
  const [x, z] = toXZ(e.lat, e.lon);
  if (x < AREA_BOX[0] || x > AREA_BOX[2] || z < AREA_BOX[1] || z > AREA_BOX[3]) continue;
  pois.push({ k, n: t.name || '', x: r1(x), z: r1(z) });
}

const data = {
  attribution: 'Dados de mapa © colaboradores do OpenStreetMap (ODbL). Relevo: SRTM 30m (NASA) via OpenTopoData.',
  origin: { lat: LAT0, lon: LON0 },
  roads, rivers, areas, pois,
  elev: {
    fine: { ...elev.fine, h: elev.fine.h.map(v => Math.round(v * 10) / 10) },
    wide: { ...elev.wide, h: elev.wide.h.map(v => Math.round(v * 10) / 10) },
  },
};
fs.writeFileSync(outFile, JSON.stringify(data));
console.log(`mapdata.json: ${roads.length} ruas, ${rivers.length} rios, ${areas.length} áreas, ${pois.length} pontos`);
