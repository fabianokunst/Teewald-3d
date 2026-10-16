// teste temporário: o jogo rodando com o áudio ligado (sem exceções, som saindo)
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ch = process.argv[2] || '6', last = +(process.argv[3] || ch);
import fs from 'node:fs';
const server = await createServer({ root, logLevel: 'error', server: { port: 4323, strictPort: false, hmr: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=640,480'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => { errs.push(e.message); console.log('EXC', e.message); });
page.on('console', m => { if (m.type() === 'error') { errs.push(m.text()); console.log('ERR', m.text().slice(0, 300)); } });
await page.goto(`${url}?chapter=${ch}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__teewald && window.__teewald.campaign, { timeout: 600000, polling: 1000 });
const r = await page.evaluate(async () => {
  const T = window.__teewald, a = T.audio;
  a.start(); await a.ctx.resume();
  const an = a.ctx.createAnalyser(); an.fftSize = 2048; a.out_.connect(an);
  const buf = new Float32Array(2048);
  const peak = () => { an.getFloatTimeDomainData(buf); let p = 0, nan = 0; for (const v of buf) { if (Number.isNaN(v)) nan++; p = Math.max(p, Math.abs(v)); } return { p: +p.toFixed(4), nan }; };
  const out = {};
  T.simulate(3);
  await new Promise(r => setTimeout(r, 400));
  out.ambiente = peak();
  out.ctx = a.ctx.state; out.lis = a.lis; out.inside = a.inside; out.church = !!a.church;
  const G = await import('/src/game/gunAudio.js');
  const S = await import('/src/game/creatures/sfx.js');
  G.GunAudio.shot(a); await new Promise(r => setTimeout(r, 60)); out.tiro = peak();
  a.at = { x: a.lis.x + 10, z: a.lis.z }; S.SFX.snarl(a, 3); a.at = null;
  a.bell(); a.step('stone'); a.step('leaves', true); a.hurtSound(); a.crow(); a.bird(); a.frog(); a.creak(); a.dogBark(); a.duck();
  await new Promise(r => setTimeout(r, 300)); out.misturado = peak();
  // alguns segundos de jogo com o áudio ligado
  for (let i = 0; i < 4; i++) { T.simulate(2); await new Promise(r => setTimeout(r, 100)); }
  out.depois = peak();
  return out;
});
console.log(JSON.stringify(r, null, 1));
// o robô da campanha com o áudio ligado
await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools', 'campaign-bot.js'), 'utf8') });
let simT = 0, maxPeak = 0, nans = 0;
const t0 = Date.now();
while (simT < 900 * (last - +ch + 1)) {
  const q = await page.evaluate(step => {
    const T = window.__teewald, B = window.__bot, a = T.audio;
    try { T.simulate(step); } catch (e) { B.events.push({ t: B.t, kind: 'erro', msg: 'simulate: ' + e.message }); }
    try { B.tick(step); } catch (e) { B.events.push({ t: B.t, kind: 'erro', msg: 'robô: ' + e.message }); }
    if (!a._an) { a._an = a.ctx.createAnalyser(); a._an.fftSize = 2048; a.out_.connect(a._an); a._b = new Float32Array(2048); }
    a._an.getFloatTimeDomainData(a._b); let p = 0, nan = 0; for (const v of a._b) { if (Number.isNaN(v)) nan++; p = Math.max(p, Math.abs(v)); }
    return { key: B.key(), events: B.flush(), chapter: T.campaign.index, p, nan };
  }, 0.5);
  simT += 0.5; maxPeak = Math.max(maxPeak, q.p); nans += q.nan;
  for (const e of q.events) if (e.kind === 'etapa') console.log('  ', e.msg); else if (e.kind === 'erro') { errs.push(e.msg); console.log('  ERRO', e.msg); }
  if (q.key === 'fim' || q.chapter > last || q.key === last + ':concluído') break;
}
console.log('robô:', Math.round(simT), 's de jogo,', Math.round((Date.now() - t0) / 1000), 's reais; pico na saída', maxPeak.toFixed(3), '; NaN', nans);
console.log(errs.length ? `${errs.length} erro(s)` : 'sem erros');
await browser.close();
await server.close();
