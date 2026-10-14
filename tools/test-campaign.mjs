// Teste da campanha inteira num Chrome sem janela.
// Compila o jogo, serve a cópia compilada, abre no capítulo pedido e deixa o robô
// (tools/campaign-bot.js) passar pelas etapas até o fim do capítulo 10. Mostra cada
// etapa, os testes de CONTINUAR e de queda, os erros do console e onde o jogo travou.
//
// uso: npm run teste            (do capítulo 1 até o fim)
//      npm run teste -- 6       (do capítulo 6 até o fim)
//      npm run teste -- 6 6     (só o capítulo 6)
//      npm run teste -- 1 10 --rapido   (usa a última compilação, sem compilar de novo)
import puppeteer from 'puppeteer-core';
import { build, preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const first = Math.max(1, Math.min(10, +(args[0] || 1)));
const last = Math.max(first, Math.min(10, +(args[1] || 10)));
const outDir = path.join(root, 'node_modules', '.teewald-teste');
const STEP = 0.5;                 // segundos de jogo por passo do robô
const STUCK = 240;                // segundos de jogo na mesma etapa = travou
const LIMIT = 900 * (last - first + 1);

const t0 = Date.now();
const clock = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const say = (...a) => console.log(clock(), ...a);

if (!flags.has('--rapido') || !fs.existsSync(path.join(outDir, 'index.html'))) {
  say('compilando...');
  await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
}
const server = await preview({ root, logLevel: 'error', build: { outDir }, preview: { port: 4317, strictPort: false, open: false } });
const url = server.resolvedUrls.local[0];

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', protocolTimeout: 600000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,480', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 480 });
const problems = [];
page.on('pageerror', e => { problems.push('exceção: ' + e.message); say('  ✖ exceção:', e.message.split('\n')[0]); });
page.on('console', m => {
  if (m.type() !== 'error' && !/não montou/.test(m.text())) return;
  const t = m.text();
  if (/favicon|404/.test(t)) return;
  problems.push('console: ' + t);
  say('  ✖ console:', t.slice(0, 200));
});

say(`abrindo o jogo no capítulo ${first} (${url})`);
await page.goto(`${url}?chapter=${first}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__teewald && window.__teewald.campaign, { timeout: 600000, polling: 1000 });
await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools', 'campaign-bot.js'), 'utf8') });
say('mundo carregado; o robô começou');

const stuck = [];
let simT = 0, lastKey = null, keyT = 0, finished = false;
while (simT < LIMIT) {
  const r = await page.evaluate(step => {
    const T = window.__teewald, B = window.__bot;
    try { T.simulate(step); } catch (e) { B.events.push({ t: B.t, kind: 'erro', msg: 'simulate: ' + e.message }); }
    try { B.tick(step); } catch (e) { B.events.push({ t: B.t, kind: 'erro', msg: 'robô: ' + e.message + ' ' + (e.stack || '').split('\n')[1] }); }
    return { key: B.key(), state: T.state, events: B.flush(), chapter: T.campaign.index };
  }, STEP);
  simT += STEP;
  for (const e of r.events) {
    if (e.kind === 'etapa') say(`[${e.t.toFixed(0).padStart(5)}] ${e.msg}`);
    else if (e.kind === 'erro') { problems.push(e.msg); say('  ✖', e.msg); }
    else say(`        · ${e.kind}: ${e.msg}`);
  }
  if (r.key === 'fim' || (r.chapter > last) || (last < 10 && r.key === `${last}:concluído`)) { finished = true; break; }
  if (r.key !== lastKey) { lastKey = r.key; keyT = 0; }
  else if ((keyT += STEP) > STUCK) {
    const st = await page.evaluate(() => window.__bot.status());
    stuck.push(st);
    say('  ✖ TRAVOU em', r.key, JSON.stringify(st));
    // travou de novo na mesma etapa depois de pular: não adianta continuar
    if (stuck.filter(s => s.key === r.key).length > 1) break;
    await page.evaluate(() => window.__bot.force());
    keyT = 0;
  }
}

say('');
say(finished ? 'CHEGOU AO FIM' : 'NÃO CHEGOU AO FIM (tempo esgotado)', `· ${Math.round(simT)} s de jogo simulados`);
say(`travamentos: ${stuck.length} · problemas: ${problems.length}`);
for (const s of stuck) say('  - travou:', s.key, '·', s.obj || '', '· pontos', s.points.join(','), '· bichos', s.foes.join(','));
for (const p of [...new Set(problems)]) say('  - ', p.slice(0, 300));
await browser.close();
await server.close();
process.exit(finished && !stuck.length && !problems.length ? 0 : 1);
