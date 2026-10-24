// Peças do Instagram (pasta social/): fotos do jogo, posts, stories e o reels.
//   npm run social                      tudo (fotos, posts e reels)
//   npm run social -- fotos             só as fotos do jogo (social/fotos/)
//   npm run social -- fotos capa chuva  só essas fotos
//   npm run social -- posts             monta posts e stories com as fotos que já existem
//   npm run social -- reels             grava o reels (social/reels/)
// O plano da campanha, as legendas e a ordem de publicação ficam em social/CAMPANHA.md.
// Como o npm run capturas: abre o jogo num Chrome sem janela pela tela título (nada fica
// salvo) e usa a placa de vídeo (CHROME_SW=1 usa o SwiftShader, bem mais lento).
// Nada de spoiler: as mesmas regras do site (veja o CLAUDE.md).
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOTOS, FORMATOS } from './social/fotos.mjs';
import { POSTS, LETREIROS } from './social/posts.mjs';
import { mux } from './social/mp4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'social');
const argv = process.argv.slice(2);
const PARTES = ['fotos', 'posts', 'reels'];
const partes = argv.filter(a => PARTES.includes(a));
const so = argv.filter(a => !a.startsWith('--') && !PARTES.includes(a));
const faz = p => !partes.length || partes.includes(p);

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port: 5197, strictPort: false, open: false, hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const gpu = process.env.CHROME_SW
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: [...gpu, '--autoplay-policy=no-user-gesture-required'] });
const erros = [];
const espera = ms => new Promise(r => setTimeout(r, ms));
const grava = (arq, dataUrl) => { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, Buffer.from(dataUrl.split(',')[1], 'base64')); };

// ---------------------------------------------------------------- jogo
// vista: { w, h, dpr, celular }; ps1: ?visual=ps1
async function abreJogo(vista, ps1 = false, relogio = false) {
  const page = await browser.newPage();
  page.on('pageerror', e => erros.push(`[página] ${e.message}`));
  page.on('console', m => { if (m.text().startsWith('[rec]')) process.stdout.write('\r  ' + m.text().slice(6) + '   '); });
  await page.setViewport({ width: vista.w, height: vista.h, deviceScaleFactor: vista.dpr || 1, isMobile: !!vista.celular, hasTouch: !!vista.celular });
  if (relogio) await page.evaluateOnNewDocument(fs.readFileSync(path.join(ROOT, 'tools/social/relogio.js'), 'utf8'));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('teewald.settings.v1', JSON.stringify({ lang: 'pt', drawDistance: 2, minimap: false }));
  });
  const t0 = Date.now();
  await page.goto(`${base}?lang=pt${ps1 ? '&visual=ps1' : ''}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__teewald, { timeout: 900000, polling: 500 });
  await page.evaluate(() => document.fonts.ready);
  console.log(`jogo carregado em ${((Date.now() - t0) / 1000).toFixed(0)} s${ps1 ? ' (PS1 RETRÔ)' : ''}${vista.celular ? ' (celular)' : ''}`);
  await page.evaluate(instala, !ps1);
  return page;
}

// ajudante instalado na página: monta cada cena (o mesmo do npm run capturas, mais a resolução)
function instala(nativa) {
  const T = window.__teewald;
  T.settings.drawDistance = 2;
  if (T.atmo.setDrawDistance) T.atmo.setDrawDistance(2);
  T.ctx.leaves.mesh.material.visible = false;   // folhas caindo passam na frente da câmera
  window.__cap = {
    // sem vinheta e sem grão do jogo (o molde põe os seus)
    limpo() {
      const m = T.renderer.postMat;
      m.fragmentShader = m.fragmentShader.replace('c *= clamp(1.0 - dot(q, q) * 1.25, 0.0, 1.0);', '').replace('c += (n - 0.5) * 0.04;', '');
      m.needsUpdate = true;
    },
    // só sem o grão (o reels fica com a vinheta do jogo; o grão some na compressão)
    semGrao() {
      const m = T.renderer.postMat;
      m.fragmentShader = m.fragmentShader.replace('c += (n - 0.5) * 0.04;', '');
      m.needsUpdate = true;
    },
    // 3D LIMPO: desenha com os pixels todos da página (o jogo para em 1440 linhas)
    resolucao() {
      if (!nativa) return;
      T.renderer.lines = Math.round(innerHeight * devicePixelRatio);
      T.renderer.layout();
    },
    semInterface() { T.renderer.ui.style.visibility = 'hidden'; T.renderer.bars = 0; T.renderer.fade = 0; },
    interface() { T.renderer.ui.style.visibility = 'visible'; T.renderer.bars = 0; T.renderer.fade = 0; },
    armado() {
      if (!T.inventory.find('pistol')) { T.inventory.add('pistol', 1); T.inventory.add('ammo9', 36); T.inventory.add('cuca', 2); T.inventory.add('cha', 1); }
      T.pistol.equip('pistol');
      const s = T.inventory.find('pistol');
      if (s) (s.data ||= {}).mag = 12;
    },
    cena(o) {
      if (T.state === 'inventory') T.invScreen.close();
      if (T.npcs.dialogue.open) T.npcs.dialogue.open = false;
      const [nome, ponto] = o.interior || [];
      if (nome && (!T.ctx.indoor || T.ctx.indoor.name !== nome)) T.interiors.enter(nome, ponto);
      if (!nome && T.ctx.indoor) T.interiors.exit();
      if (o.clima) T.atmo.set(o.clima, 0);
      T.atmo.flashlightOn = !!o.lanterna;
      const chao = (x, z) => (nome ? 0 : T.ctx.surfaceAt(x, z));
      const [cx, cdy, cz] = o.cam, [lx, ldy, lz] = o.alvo;
      if (o.jogador) T.teleport(...o.jogador);
      else if (!nome) {
        const dx = cx - lx, dz = cz - lz, d = Math.hypot(dx, dz) || 1;
        T.teleport(cx + dx / d * 3, cz + dz / d * 3, Math.atan2(-dx, -dz));
      }
      T.view(cx, chao(cx, cz) + cdy, cz, lx, chao(lx, lz) + ldy, lz);
      T.camera.fov = o.fov || 50; T.camera.updateProjectionMatrix();
      this.semInterface();
    },
  };
}

// clareia (as fotos de noite) e grava em JPEG no tamanho da captura
async function revela(page, png, brilho = 1) {
  return page.evaluate(async (src, brilho) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    if (brilho !== 1) g.filter = `brightness(${brilho}) contrast(1.04)`;
    g.drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  }, 'data:image/png;base64,' + png, brilho);
}

async function fotos() {
  const lista = FOTOS.filter(f => !so.length || so.includes(f.nome));
  const grupos = [[false, false], [true, false], [false, true]];   // [ps1, celular]
  for (const [ps1, cel] of grupos) {
    const fs1 = lista.filter(f => !!f.ps1 === ps1 && (f.formato === 'celular') === cel);
    if (!fs1.length) continue;
    const page = await abreJogo(cel ? FORMATOS.celular : FORMATOS.post, ps1);
    await page.evaluate(() => window.__cap.limpo());
    let formato = cel ? 'celular' : 'post';
    for (const f of fs1) {
      if (f.formato !== formato) {
        const v = FORMATOS[f.formato];
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: v.dpr, isMobile: !!v.celular, hasTouch: !!v.celular });
        formato = f.formato;
        await espera(300);
      }
      await page.evaluate(() => window.__cap.resolucao());
      await page.evaluate(async (cena, js) => {
        const C = window.__cap, T = window.__teewald;
        if (cena) C.cena(cena);
        if (js) await (0, eval)('(' + js + ')')(C, T);
        if (!js || !/C\.interface\(\)/.test(js)) C.semInterface();
      }, f.cena || null, f.js ? f.js.toString() : null);
      await espera(f.espera ?? 1800);
      const png = await page.screenshot({ type: 'png', encoding: 'base64' });
      grava(path.join(OUT, 'fotos', f.nome + '.jpg'), await revela(page, png, f.brilho));
      console.log('  fotos/' + f.nome + '.jpg');
    }
    await page.close();
  }
}

// ---------------------------------------------------------------- molde (posts e letreiros)
async function abreMolde() {
  const page = await browser.newPage();
  await page.goto(`${base}tools/social/molde.html`, { waitUntil: 'networkidle0' });
  return page;
}

async function posts() {
  const page = await abreMolde();
  const lista = POSTS.filter(p => !so.length || so.some(s => p.arquivo.includes(s)));
  for (const p of lista) {
    const alto = { story: 1920, perfil: 1080 }[p.formato] || 1350;
    await page.setViewport({ width: 1080, height: alto, deviceScaleFactor: 1 });
    const foto = p.foto ? `/social/fotos/${p.foto}.jpg` : null;
    if (foto && !fs.existsSync(path.join(OUT, 'fotos', p.foto + '.jpg'))) { erros.push(`falta a foto ${p.foto} (npm run social -- fotos ${p.foto})`); continue; }
    await page.evaluate(o => window.monta(o), { ...p, alto, foto });
    fs.mkdirSync(path.dirname(path.join(OUT, p.arquivo)), { recursive: true });
    await page.screenshot({ path: path.join(OUT, p.arquivo), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1080, height: alto } });
    console.log('  ' + p.arquivo);
  }
  await page.close();
}

// ---------------------------------------------------------------- reels
async function reels() {
  const { ROTEIRO, REELS } = await import('./social/roteiro.mjs');
  // letreiros: PNGs transparentes de 1080x1920 feitos no molde
  const molde = await abreMolde();
  await molde.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const letreiros = {};
  for (const [nome, l] of Object.entries(LETREIROS)) {
    await molde.evaluate(o => window.monta(o), { ...l, alto: 1920, transparente: true, sombra: 'nenhuma' });
    letreiros[nome] = 'data:image/png;base64,' + await molde.screenshot({ type: 'png', omitBackground: true, encoding: 'base64' });
  }
  await molde.close();
  const page = await abreJogo({ w: REELS.w, h: REELS.h, dpr: 1 }, false, true);
  await page.evaluate(() => { window.__cap.semGrao(); window.__cap.resolucao(); window.__cap.semInterface(); });
  const v = [], a = [];
  await page.exposeFunction('__envia', (tipo, i, b64, key, pts) => { (tipo === 'v' ? v : a)[i] = { data: Buffer.from(b64, 'base64'), key, pts }; return true; });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'tools/social/gravador.js'), 'utf8') });
  await page.addScriptTag({ content: ROTEIRO });
  const t0 = Date.now();
  const r = await page.evaluate((o, letreiros) => window.__gravador.grava(window.__roteiro, { ...o, letreiros }), REELS, letreiros);
  console.log(`\n  brilho médio por segundo (conferência): ${r.luz.join(' ')}${r.vazios ? ` · ${r.vazios} quadros sem jogo` : ''}`);
  console.log(`  ${r.quadros} quadros em ${((Date.now() - t0) / 1000).toFixed(0)} s · pico do som ${(20 * Math.log10(r.pico)).toFixed(1)} dBFS, ganho ${(20 * Math.log10(r.ganho)).toFixed(1)} dB · AAC começa em ${r.aacInicio.join(', ')} µs`);
  // AAC: o primeiro pedaço tem amostras de preparo; o edts pula essa parte
  const skip = r.aacInicio[0] < 0 ? Math.round(-r.aacInicio[0] / 1e6 * 48000) : 0;
  const mp4 = mux({
    video: { width: REELS.w, height: REELS.h, fps: REELS.fps, avcC: Buffer.from(r.avcC, 'base64'), samples: v },
    audio: { rate: 48000, channels: 2, asc: Buffer.from(r.asc, 'base64'), samples: a, skip, bitrate: 192000 },
  });
  const arq = path.join(OUT, 'reels', REELS.arquivo);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, mp4);
  console.log(`  reels/${REELS.arquivo} (${(mp4.length / 1e6).toFixed(1)} MB)`);
  await page.close();
}

try {
  if (faz('fotos')) await fotos();
  if (faz('posts')) await posts();
  if (faz('reels')) await reels();
} finally {
  await browser.close();
  await server.close();
}
if (erros.length) console.log(erros.join('\n'));
