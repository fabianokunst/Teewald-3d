// Revisão técnica do mundo num Chrome headless: superfícies enterradas no terreno,
// pisos flutuando, objetos encaixados uns nos outros, objetos no meio da pista e
// lugares onde os pés do jogador afundam no desenho ou flutuam acima dele.
// uso: npm run dev (em outro terminal) e depois: npm run audit
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/?skip=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__teewald, { timeout: 240000, polling: 500 });

// superfícies viradas para cima abaixo do terreno (enterradas) ou pisos bem acima dele
const surfaces = await page.evaluate(() => {
  const T = window.__teewald, ctx = T.ctx, ter = ctx.terrain;
    const SKIP = new Set(['water', 'sky', 'leafFall']);
    const FLOOR = new Set(['concrete', 'concreteW', 'stonePath', 'sett', 'pavers', 'herring', 'asphalt', 'dirt', 'granite', 'marble', 'woodPlank', 'blob', 'paint', 'lawn', 'grass']);
    const buried = new Map(), floating = new Map();
    const add = (map, key, d, x, z) => { const e = map.get(key) || { n: 0, d: 0, x, z }; e.n++; if (Math.abs(d) > Math.abs(e.d)) { e.d = d; e.x = x; e.z = z; } map.set(key, e); };
    T.scene.traverse(o => {
      if (!o.isMesh || !o.name || SKIP.has(o.name) || o.isInstancedMesh) return;
      const p = o.geometry.getAttribute('position'), nr = o.geometry.getAttribute('normal');
      if (!p || !nr) return;
      for (let i = 0; i < p.count; i += 3) {
        if (nr.getY(i) < 0.85) continue;
        const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        if (!ter.inBounds(x, z)) continue;
        const h = ter.heightAt(x, z);
        const cell = o.name + '@' + Math.round(x / 15) * 15 + ',' + Math.round(z / 15) * 15;
        if (y < h - 0.05) add(buried, cell, y - h, x, z);
        else if (FLOOR.has(o.name) && o.name !== 'concreteW' && y > h + 0.35 && y < h + 2) add(floating, cell, y - h, x, z);
      }
    });
    const fmt = m => [...m.entries()].sort((a, b) => Math.abs(b[1].d) - Math.abs(a[1].d)).slice(0, 80).map(([k, e]) => `${k} n=${e.n} d=${e.d.toFixed(2)} @(${e.x.toFixed(0)},${e.z.toFixed(0)}) ${ctx.placeName(e.x, e.z) || ''}`);
    return { buried: fmt(buried), floating: fmt(floating) };
});
// objeto pequeno com o centro dentro de um maior (banco no canteiro, prédio sobre a igreja)
const overlaps = await page.evaluate(() => {
  const T = window.__teewald, ctx = T.ctx, C = ctx.collision, CW = C.constructor;
    const size = it => it.t === 'circle' ? it.r : Math.min(it.hx, it.hz);
    const inside = (big, x, z, pad) => {
      if (big.t === 'circle') return Math.hypot(x - big.x, z - big.z) < big.r - pad;
      const [lx, lz] = CW.local(big, x, z);
      return Math.abs(lx) < big.hx - pad && Math.abs(lz) < big.hz - pad;
    };
    const kind = it => it.t === 'circle' ? `circ r${it.r.toFixed(2)}` : `box ${(it.hx * 2).toFixed(1)}x${(it.hz * 2).toFixed(1)}${it.walk ? 'W' : ''}`;
    const out = new Map();
    for (const a of C.items) {
      if (a.walk) continue;
      for (const b of C.near(a.x, a.z, 1)) {
        if (b === a || b.walk) continue;
        if (size(b) <= size(a)) continue;                 // b é o maior
        if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) < 0.3) continue; // sem sobreposição vertical
        if (!inside(b, a.x, a.z, 0.05)) continue;
        const key = `${kind(a)} dentro de ${kind(b)} @(${a.x.toFixed(0)},${a.z.toFixed(0)}) ${ctx.placeName(a.x, a.z) || ''}`;
        out.set(key, 1);
      }
    }
    const trees = (ctx.trees || []).filter(t => !t.far).filter(t => {
      const near = C.near(t.x, t.z, 0.5).filter(b => !b.walk && b.t === 'box' && size(b) > 1.5);
      return near.some(b => inside(b, t.x, t.z, 0.3));
    }).map(t => `árvore ${t.t} dentro de caixa @(${t.x.toFixed(0)},${t.z.toFixed(0)}) ${ctx.placeName(t.x, t.z) || ''}`);
    return { n: out.size, items: [...out.keys()].slice(0, 120), trees: trees.slice(0, 60), nt: trees.length };
});
// árvores e objetos pequenos dentro da pista de alguma rua
const onRoad = await page.evaluate(() => {
  const T = window.__teewald, ctx = T.ctx, idx = ctx.roads.index;
    const lane = (x, z) => { const q = idx.clearance(x, z, d => d.rank >= 1); return q.seg ? q.d : 99; };
    const trees = ctx.trees.filter(t => !t.far && lane(t.x, t.z) < -0.2).map(t => `${t.t} @(${t.x.toFixed(0)},${t.z.toFixed(0)}) d=${lane(t.x, t.z).toFixed(1)} ${ctx.placeName(t.x, t.z) || ''}`);
    const small = ctx.collision.items.filter(it => !it.walk && ((it.t === 'circle' && it.r < 0.6) || (it.t === 'box' && Math.max(it.hx, it.hz) < 1.3)) && lane(it.x, it.z) < -0.3)
      .map(it => `${it.t} ${it.t === 'circle' ? it.r.toFixed(2) : (it.hx * 2).toFixed(1) + 'x' + (it.hz * 2).toFixed(1)} @(${it.x.toFixed(0)},${it.z.toFixed(0)}) d=${lane(it.x, it.z).toFixed(1)} ${ctx.placeName(it.x, it.z) || ''}`);
    return { trees: trees.slice(0, 60), nt: trees.length, small: small.slice(0, 60), ns: small.length };
});

// pés do jogador: o desenho e o chão físico (ctx.groundAt) precisam coincidir.
// Afundando = superfície desenhada acima do chão onde se pisa; flutuando = o contrário
const feet = await page.evaluate(() => {
  const T = window.__teewald, ctx = T.ctx, ter = ctx.terrain, C = ctx.collision, CW = C.constructor, PB = ctx.playBounds;
  const SKIP = new Set(['water', 'sky', 'leafFall', 'blob']), CELL = 4, grid = new Map(), tris = [];
  T.scene.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.name || SKIP.has(o.name)) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const pos = o.geometry.getAttribute('position'), idx = o.geometry.index, n = idx ? idx.count : pos.count, m = o.matrixWorld.elements;
    for (let t = 0; t < n; t += 3) {
      const v = [];
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx.getX(t + k) : t + k, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        v.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
      const ax = v[3] - v[0], ay = v[4] - v[1], az = v[5] - v[2], bx = v[6] - v[0], by = v[7] - v[1], bz = v[8] - v[2];
      const ny = az * bx - ax * bz, nl = Math.hypot(ay * bz - az * by, ny, ax * by - ay * bx);
      if (nl < 1e-9 || ny / nl < 0.6) continue;   // só o que se pisa: virado para cima
      const x0 = Math.min(v[0], v[3], v[6]), x1 = Math.max(v[0], v[3], v[6]), z0 = Math.min(v[2], v[5], v[8]), z1 = Math.max(v[2], v[5], v[8]);
      if (x1 < PB.x0 || x0 > PB.x1 || z1 < PB.z0 || z0 > PB.z1) continue;
      const tri = { v, name: o.name, x0, x1, z0, z1 };
      tris.push(tri);
      for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = i * 100000 + j; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(tri);
      }
    }
  });
  const yIn = (v, x, z) => {
    const det = (v[5] - v[8]) * (v[0] - v[6]) + (v[6] - v[3]) * (v[2] - v[8]);
    if (Math.abs(det) < 1e-12) return null;
    const l0 = ((v[5] - v[8]) * (x - v[6]) + (v[6] - v[3]) * (z - v[8])) / det, l1 = ((v[8] - v[2]) * (x - v[6]) + (v[0] - v[6]) * (z - v[8])) / det, l2 = 1 - l0 - l1;
    return l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6 ? null : l0 * v[1] + l1 * v[4] + l2 * v[7];
  };
  // dá para estar ali com os pés em g? (nenhuma colisão em volta segura o corpo)
  const blocked = (x, z, g) => C.near(x, z, 0.6).some(it => {
    if (it.y0 >= g + 1.7) return false;
    const top = it.ramp ? CW.topAt(it, Math.max(-it.hz, Math.min(it.hz, CW.local(it, x, z)[1]))) : it.y1;
    if (top <= g + 0.45 && (it.walk || top <= g + 0.05)) return false;
    if (it.t === 'circle') return Math.hypot(x - it.x, z - it.z) < it.r + 0.3;
    const [lx, lz] = CW.local(it, x, z);
    return Math.abs(lx) < it.hx + 0.3 && Math.abs(lz) < it.hz + 0.3;
  });
  const add = (map, key, d, x, z) => { const e = map.get(key) || { n: 0, d: 0, x, z }; e.n++; if (d > e.d) { e.d = d; e.x = x; e.z = z; } map.set(key, e); };
  const sink = new Map(), float = new Map();
  for (const { v, name, x0, x1, z0, z1 } of tris) {
    for (let x = Math.ceil(x0 * 2) / 2; x <= x1; x += 0.5) for (let z = Math.ceil(z0 * 2) / 2; z <= z1; z += 0.5) {
      const y = yIn(v, x, z);
      if (y === null || y < ter.heightAt(x, z) - 0.02) continue;
      const g = ctx.groundAt(x, z, y), d = y - g;
      if (d < 0.06 || d > 0.7 || blocked(x, z, g) || ctx.isDeepWater(x, z, g)) continue;
      add(sink, name + '@' + Math.round(x / 8) * 8 + ',' + Math.round(z / 8) * 8, d, x, z);
    }
  }
  for (let x = PB.x0; x <= PB.x1; x += 1) for (let z = PB.z0; z <= PB.z1; z += 1) {
    const g = ctx.groundAt(x, z, ctx.surfaceAt(x, z));
    let vy = ter.heightAt(x, z), vn = 'terreno';
    for (const t of grid.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) || []) { const y = yIn(t.v, x, z); if (y !== null && y <= g + 0.03 && y > vy) { vy = y; vn = t.name; } }
    const d = g - vy;
    if (d < 0.06 || d > 1.2 || blocked(x, z, g) || ctx.isDeepWater(x, z, g)) continue;
    add(float, vn + '@' + Math.round(x / 8) * 8 + ',' + Math.round(z / 8) * 8, d, x, z);
  }
  const fmt = m => [...m.entries()].sort((a, b) => b[1].d * Math.sqrt(b[1].n) - a[1].d * Math.sqrt(a[1].n)).slice(0, 60).map(([k, e]) => `${k} n=${e.n} d=${e.d.toFixed(2)} @(${e.x.toFixed(1)},${e.z.toFixed(1)}) ${ctx.placeName(e.x, e.z) || ''}`);
  return { sink: fmt(sink), float: fmt(float) };
});

const list = (title, items) => { console.log(`
${title} (${items.length})`); for (const l of items) console.log('  ' + l); };
list('ENTERRADAS', surfaces.buried);
list('FLUTUANDO (pisos 0,35 a 2 m acima do terreno; telhados planos e pontes são normais)', surfaces.floating);
list('ENCAIXADOS (peças do mesmo objeto, como torre e igreja, são normais)', overlaps.items);
list('ÁRVORES NA PISTA', onRoad.trees);
list('OBJETOS NA PISTA', onRoad.small);
list('PÉS AFUNDANDO (desenho acima do chão físico; degrau de escada externa é normal)', feet.sink);
list('PÉS FLUTUANDO (chão físico acima do desenho; degraus de escada com rampa são normais)', feet.float);
await browser.close();
