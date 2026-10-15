// Exporta o protagonista como .glb para a pasta exportados/ (fora do repositório).
//   npm run exportar
// O modelo é gerado por src/engine/exporter.js numa página sem a cidade (tools/exportar/).
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'exportados');
const NAME = 'teewald-protagonista.glb';

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port: 5198, strictPort: false, open: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0] + 'tools/exportar/index.html';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new' });
let r;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[página]', e.message));
  page.on('console', m => m.type() === 'warn' && console.warn('[página]', m.text()));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__exportado, { timeout: 120000, polling: 200 });
  r = await page.evaluate(() => window.__exportado);
} finally {
  await browser.close();
  await server.close();
}
if (r.erro) { console.error(r.erro); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const buf = Buffer.from(r.glb, 'base64');
fs.writeFileSync(path.join(OUT, NAME), buf);
console.log(`exportados/${NAME}: ${(buf.length / 1024).toFixed(0)} KB`);
