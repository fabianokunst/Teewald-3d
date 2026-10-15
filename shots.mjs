// Renderiza cada página de cada documento num PNG (para conferir o papel desenhado).
// uso: node shots.mjs [altura=480] [ids separados por vírgula]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('C:/Users/fabiano.kunst/Documents/Teewald-3d/package.json');
const puppeteer = require('puppeteer-core');
const H = +(process.argv[2] || 480);
const only = process.argv[3] ? process.argv[3].split(',') : null;
const out = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'shots');
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
const logs = [];
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
await page.goto('http://localhost:5180/', { waitUntil: 'load', timeout: 120000 });
const shots = await page.evaluate(async (H, only) => {
  await Promise.all(['16px "Caveat"', '16px "Special Elite"', '16px "VT323"', '48px "Grenze Gotisch"'].map(f => document.fonts.load(f)));
  const { Paper } = await import('/src/ui/paper.js');
  const { DOCS } = await import('/src/game/lore.js');
  const extra = await import('/src/game/mission.js').then(() => null).catch(e => String(e));
  const P = new Paper(), res = [];
  const c = document.createElement('canvas'), W = Math.round(H * 16 / 9);
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (const d of DOCS) {
    if (only && !only.includes(d.id)) continue;
    P.open(d); P.key = ''; P._layout(W, H);
    for (let i = 0; i < P.pages.length; i++) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#4a5060'; g.fillRect(0, 0, W, H);
      P.t = 1; P.page = i; P.draw(g, W, H, 'kb');
      res.push({ name: `${d.id}-${i + 1}`, url: c.toDataURL('image/png') });
    }
  }
  return { res, extra };
}, H, only);
for (const s of shots.res) fs.writeFileSync(path.join(out, `${s.name}-${H}.png`), Buffer.from(s.url.split(',')[1], 'base64'));
console.log(shots.res.map(s => s.name).join(' '));
if (shots.extra) console.log('mission import:', shots.extra);
console.log(logs.join('\n'));
await browser.close();
