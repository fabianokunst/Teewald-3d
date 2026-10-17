// Renderiza cada página de cada documento (os papéis de game/lore.js e o cartaz do capítulo 1)
// num PNG Full HD, em todos os idiomas: shots/<idioma>/<id>-<página>.png (para conferir o papel).
// Precisa do jogo rodando (npm run dev, porta 5173; outra porta: PORT=5174 node shots.mjs).
// uso: node shots.mjs [idiomas=pt,en,es,de] [ids separados por vírgula]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const W = 1920, H = 1080;
const langs = (process.argv[2] || 'pt,en,es,de').split(',');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
const logs = [];
page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
await page.goto(`http://localhost:${process.env.PORT || 5173}/`,{ waitUntil: 'load', timeout: 120000 });
// espera o jogo terminar de carregar (no começo ele mesmo escolhe o idioma)
await page.waitForFunction(() => window.__teewald, { timeout: 120000 });
const ids = await page.evaluate(async (W, H) => {
  await Promise.all(['16px "Caveat"', '16px "Special Elite"', '16px "VT323"', '48px "Grenze Gotisch"'].map(f => document.fonts.load(f)));
  const { Paper } = await import('/src/ui/paper.js');
  const { DOCS } = await import('/src/game/lore.js');
  const { BOARD } = await import('/src/game/mission.js');
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  window.__shots = { P: new Paper(), c, docs: [...DOCS, { id: 'cartaz_chupacabras', ...BOARD }] };
  return window.__shots.docs.map(d => d.id);
}, W, H);

for (const lang of langs) {
  await page.evaluate(l => window.__teewald.i18n.setLang(l), lang);
  const out = path.join(root, lang);
  fs.mkdirSync(out, { recursive: true });
  const names = [];
  for (const id of ids) {
    if (only && !only.includes(id)) continue;
    // um documento por vez: as páginas voltam como PNG em base64
    const urls = await page.evaluate((id, W, H) => {
      const { P, c, docs } = window.__shots, g = c.getContext('2d'), res = [];
      P.open(docs.find(d => d.id === id)); P._layout(W, H);
      for (let i = 0; i < P.pages.length; i++) {
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#4a5060'; g.fillRect(0, 0, W, H);
        P.t = 1; P.page = i; P.draw(g, W, H, 'kb');
        res.push(c.toDataURL('image/png'));
      }
      return res;
    }, id, W, H);
    // tira páginas de uma rodada anterior (o documento pode ter ficado mais curto)
    for (const f of fs.readdirSync(out)) if (new RegExp(`^${id}-\\d+\\.png$`).test(f)) fs.unlinkSync(path.join(out, f));
    urls.forEach((url, i) => {
      fs.writeFileSync(path.join(out, `${id}-${i + 1}.png`), Buffer.from(url.split(',')[1], 'base64'));
      names.push(`${id}-${i + 1}`);
    });
  }
  console.log(`${lang}: ${names.length} páginas`);
}
console.log(logs.join('\n'));
await browser.close();
