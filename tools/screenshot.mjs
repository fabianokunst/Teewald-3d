// Tira capturas do jogo num Chrome headless (para testes).
// uso: node tools/screenshot.mjs saida.png "?skip=1" "js para executar antes" [espera_ms] [largura] [altura]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [out = 'shot.png', query = '?skip=1', script = '', wait = '1500', w = '960', h = '540'] = process.argv.slice(2);
const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromes.find(p => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${w},${h}`],
  defaultViewport: { width: +w, height: +h },
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/' + query, { waitUntil: 'load', timeout: 120000 });
const t0 = Date.now();
try {
  await page.waitForFunction(() => window.__teewald, { timeout: 240000, polling: 500 });
} catch (e) { logs.push('[timeout] mundo não carregou'); }
logs.push(`[info] carregado em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (script) {
  try { const r = await page.evaluate(script); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); }
  catch (e) { logs.push('[evalerror] ' + e.message); }
}
await new Promise(r => setTimeout(r, +wait));
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
