// Grava as texturas dos personagens em texture-templates/<personagem>/, para ver como são:
//   atlas.png           o atlas do jeito que o jogo usa (256 px no protagonista, 128 nos moradores)
//   atlas-ampliado.png  o mesmo em 1024 px, sem suavizar, para ver os pixels
//   mapa.png            o ampliado com o contorno e o nome de cada parte
//   partes/             cada parte recortada do ampliado (tronco, manga, cabeca...)
//   npm run texturas                   o protagonista (forasteiro)
//   npm run texturas -- arno hilda     moradores, pelo id de src/game/npcData.js
// O atlas é pintado por src/game/heroTexture.js numa página sem a cidade (tools/texturas/).
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'texture-templates');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['forasteiro'];

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port: 5199, strictPort: false, open: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0] + 'tools/texturas/index.html?ids=' + ids.map(encodeURIComponent).join(',');
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new' });
let r;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[página]', e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__texturas, { timeout: 120000, polling: 200 });
  r = await page.evaluate(() => window.__texturas);
} finally {
  await browser.close();
  await server.close();
}
for (const e of r.erros) console.error('ERRO', e);

const png = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
for (const it of r.itens) {
  const dir = path.join(OUT, it.id);
  fs.mkdirSync(path.join(dir, 'partes'), { recursive: true });
  png(path.join(dir, 'atlas.png'), it.atlas);
  png(path.join(dir, 'atlas-ampliado.png'), it.ampliado);
  png(path.join(dir, 'mapa.png'), it.mapa);
  for (const [nome, d] of Object.entries(it.partes)) png(path.join(dir, 'partes', nome + '.png'), d);
  console.log(`texture-templates/${it.id}/: atlas de ${it.lado} px e ${Object.keys(it.partes).length} partes`);
}
if (r.erros.length) process.exit(1);
