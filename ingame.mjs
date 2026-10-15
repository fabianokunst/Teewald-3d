// Abre o jogo de verdade e testa: o cartaz do capítulo 1 (mission.startRead('board')),
// um documento lido na rua (extras._readDoc) e o álbum via campanha (showPaper).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('C:/Users/fabiano.kunst/Documents/Teewald-3d/package.json');
const puppeteer = require('puppeteer-core');
const out = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'shots');
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
});
const page = await browser.newPage();
const logs = [];
page.on('pageerror', e => logs.push('[pageerror] ' + (e.stack || e.message).split(String.fromCharCode(10)).slice(0, 4).join(' | ')));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
await page.goto('http://localhost:5180/?skip=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__teewald, { timeout: 240000, polling: 500 });
const shot = async name => { await new Promise(r => setTimeout(r, 700)); await page.screenshot({ path: path.join(out, name + '.png') }); };
const ev = async (fn, ...a) => { try { return await page.evaluate(fn, ...a); } catch (e) { logs.push('[eval] ' + e.message); } };

await ev(() => window.__teewald.startGame(false)); await new Promise(r => setTimeout(r, 4000)); logs.push('estado inicial: ' + await ev(() => window.__teewald.state));
// 1) cartaz do capítulo 1
logs.push('board: ' + await ev(() => { const T = window.__teewald; T.mission.startRead('board'); T.setState('read'); return T.state; }));
await shot('ingame-board');
// avança as duas páginas e fecha
for (let i = 0; i < 2; i++) await ev(() => { const T = window.__teewald; T.mission.paper.page = Math.min(T.mission.paper.page + 1, T.mission.paper.pages.length - 1); });
await shot('ingame-board2');
logs.push('fechou: ' + await ev(() => { const T = window.__teewald; T.mission.paper.close(); return new Promise(r => { const t0 = performance.now(); const f = () => (T.state !== 'read' || performance.now() - t0 > 20000) ? r(T.state + ' step=' + T.mission.step + ' em ' + Math.round(performance.now() - t0) + 'ms') : setTimeout(f, 100); f(); }); }));
// 2) documento lido na rua
logs.push('doc: ' + await ev(() => { const T = window.__teewald, X = T.extras, D = X.docs.find(d => d.d.id === 'desenho'); X._readDoc(D); T.setState('extra'); return X.modal + ' ' + X.docs.length + ' docs no mundo'; }));
await shot('ingame-doc');
await ev(() => { window.__teewald.extras.paper.close(); });
await ev(() => new Promise(r => { const t0 = performance.now(); const f = () => (window.__teewald.state !== 'extra' || performance.now() - t0 > 20000) ? r() : setTimeout(f, 100); f(); }));
logs.push('estado: ' + await ev(() => window.__teewald.state));
console.log(logs.join('\n'));
await browser.close();
