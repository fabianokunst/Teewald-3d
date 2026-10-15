// Capítulo 9: o passo do álbum abre o papel pela campanha (showPaper) e segue a história ao fechar.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('C:/Users/fabiano.kunst/Documents/Teewald-3d/package.json');
const puppeteer = require('puppeteer-core');
const out = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'shots');
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'],
  defaultViewport: { width: 960, height: 540 },
});
const page = await browser.newPage();
const logs = [];
page.on('pageerror', e => logs.push('[pageerror] ' + (e.stack || e.message).split(String.fromCharCode(10)).slice(0, 4).join(' | ')));
await page.goto('http://localhost:5180/?skip=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__teewald, { timeout: 240000, polling: 500 });
const ev = async (fn, ...a) => { try { return await page.evaluate(fn, ...a); } catch (e) { logs.push('[eval] ' + e.message); } };
const waitFor = (fn, ms = 30000) => page.waitForFunction(fn, { timeout: ms, polling: 200 }).then(() => true, () => false);

await ev(() => window.__teewald.chapter(9));
await waitFor(() => window.__teewald.campaign?.S?.def?.n === 9 && window.__teewald.state === 'play', 60000);
logs.push('capítulo: ' + await ev(() => { const C = window.__teewald.campaign; return C.S.def.n + ' passo ' + C.S.def.steps[C.S.i].id + ' estado ' + window.__teewald.state; }));
// pula até o passo do álbum e aciona o ponto VER O ÁLBUM
await ev(() => { const C = window.__teewald.campaign; C.goto('album'); });
await waitFor(() => window.__teewald.campaign.S.def.steps[window.__teewald.campaign.S.i].id === 'album');
logs.push('ponto: ' + await ev(() => { const C = window.__teewald.campaign, p = C.S.points.find(x => x.id === 'album'); if (!p) return 'sem ponto'; p.run(); return 'acionado'; }));
await waitFor(() => window.__teewald.state === 'cutscene');
logs.push('estado: ' + await ev(() => window.__teewald.state + ' papel=' + !!window.__teewald.campaign.S.narr?.paper + ' arquivo=' + window.__teewald.extras.state.docs.includes('album')));
for (let i = 0; i < 5; i++) {
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: path.join(out, `ingame-album-${i + 1}.png`) });
  await page.keyboard.press('Enter');
}
const ok = await waitFor(() => window.__teewald.campaign.S.def.steps[window.__teewald.campaign.S.i].id !== 'album', 20000);
logs.push('depois de fechar: ' + await ev(() => { const C = window.__teewald.campaign; return 'passo ' + C.S.def.steps[C.S.i].id + ' estado ' + window.__teewald.state; }) + (ok ? '' : ' (não avançou)'));
console.log(logs.join('\n'));
await browser.close();
