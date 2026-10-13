// Revisão técnica do mundo num Chrome headless: superfícies enterradas no terreno,
// pisos flutuando, objetos encaixados uns nos outros e objetos no meio da pista.
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

const list = (title, items) => { console.log(`
${title} (${items.length})`); for (const l of items) console.log('  ' + l); };
list('ENTERRADAS', surfaces.buried);
list('FLUTUANDO (pisos 0,35 a 2 m acima do terreno; telhados planos e pontes são normais)', surfaces.floating);
list('ENCAIXADOS (peças do mesmo objeto, como torre e igreja, são normais)', overlaps.items);
list('ÁRVORES NA PISTA', onRoad.trees);
list('OBJETOS NA PISTA', onRoad.small);
await browser.close();
