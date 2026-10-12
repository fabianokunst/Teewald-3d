// Várias capturas numa mesma sessão: node tools/shots.mjs pasta_saida "?skip=1" shots.json
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [outDir, query = '?skip=1', file, w = '960', h = '540'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(file, 'utf8'));
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: exe, headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${w},${h}`],
  defaultViewport: { width: +w, height: +h },
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/' + query, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__teewald, { timeout: 240000, polling: 500 }).catch(() => logs.push('[timeout]'));
for (const s of shots) {
  if (s.keys) for (const k of s.keys) await page.keyboard.down(k);
  if (s.js) { try { const r = await page.evaluate(s.js); if (r !== undefined) logs.push(`[${s.name}] ` + JSON.stringify(r)); } catch (e) { logs.push(`[${s.name} erro] ${e.message}`); } }
  await new Promise(r => setTimeout(r, s.wait ?? 1200));
  if (s.keys) for (const k of s.keys) await page.keyboard.up(k);
  await page.screenshot({ path: path.join(outDir, s.name + '.png') });
}
console.log(logs.join('\n'));
await browser.close();
