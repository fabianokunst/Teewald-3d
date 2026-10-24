// Tira as capturas do site (site/img/capturas/): fotos do próprio jogo, sem HUD e sem spoiler.
//   npm run capturas                    todas
//   npm run capturas -- igreja praca    só essas
// Abre o jogo num Chrome sem janela pela tela título (nada fica salvo), põe a câmera livre
// (__teewald.view), o clima e as pessoas de cada foto. Cada captura sai em 1920x1080
// (img/capturas/<nome>.jpg) e em 960x540 (img/capturas/p/<nome>.jpg, para as grades do site).
// As fotos PS1 RETRÔ saem de uma segunda página aberta com ?visual=ps1.
// Usa a placa de vídeo; se não houver, CHROME_SW=1 usa o SwiftShader (bem mais lento).
//   npm run capturas -- --idioma=en,es,de titulo conversa inventario
// tira as fotos com o jogo em outro idioma (as que mostram texto da tela) e grava em
// img/capturas/<idioma>/ e img/capturas/p/<idioma>/; as páginas traduzidas do site
// (npm run site) usam essa versão quando ela existe.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'img', 'capturas');
const W = 1920, H = 1080;
const argv = process.argv.slice(2);
const opIdioma = argv.find(a => a.startsWith('--idioma='));
const IDIOMAS = opIdioma ? opIdioma.slice(9).split(',').filter(Boolean) : ['pt'];
const so = argv.filter(a => !a.startsWith('--'));

// cena: clima, câmera e alvo em [x, altura acima do chão, z] (interior: coordenadas absolutas),
// jogador [x, z, heading] (sem ele, fica 3 m atrás da câmera, fora da foto), fov, lanterna.
// brilho: clareia a foto depois de tirada (as de noite ficam escuras demais nas miniaturas do site).
// js: código extra rodado depois de montar a cena (C = window.__cap, T = window.__teewald).
const FOTOS = [
  { nome: 'titulo', ui: true, titulo: true, espera: 3500 },
  { nome: 'capa', cena: { clima: 'anoitecer', cam: [-108, 14, 62], alvo: [-44, 10, 16], fov: 52 } },
  { nome: 'igreja', cena: { clima: 'tarde', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 } },
  // a cidade vista do alto: as ruas, o rio e os prédios saem de mapas de verdade
  { nome: 'mapa', cena: { clima: 'tarde', cam: [-110, 380, 95.01], alvo: [-110, -2, 95], fov: 52 } },
  { nome: 'lua', cena: { clima: 'luaCheia', cam: [-98, 2, 86], alvo: [-60, 14, 40], fov: 62 } },
  { nome: 'calcadao', cena: { clima: 'tarde', cam: [-318, 2.6, 258], alvo: [-333, 1.2, 330], fov: 55 } },
  { nome: 'letreiro', cena: { clima: 'tarde', cam: [-263.5, 1.9, 164.5], alvo: [-273.5, 1.5, 153.5], fov: 58 } },
  { nome: 'praca', cena: { clima: 'tarde', cam: [-190, 3.4, 52], alvo: [-176, 1.4, 70], fov: 56 } },
  { nome: 'praca-noite', cena: { clima: 'noite', cam: [-164.8, 3, 57.4], alvo: [-180.8, 1.2, 70.4], fov: 55 } },
  { nome: 'igreja-dentro', cena: { clima: 'tarde', interior: ['igreja', 'nave'], cam: [10110, 402.4, 9706], alvo: [10110, 401.8, 9736], fov: 60 } },
  { nome: 'kartoffelfest', cena: { clima: 'anoitecer', cam: [-236, 2.4, 171.5], alvo: [-200, 2.2, 201], fov: 60 } },
  { nome: 'kartoffelfest-portico', cena: { clima: 'noite', cam: [-253.1, 2, 157.7], alvo: [-225, 2.6, 181], fov: 56 } },
  { nome: 'enxaimel', cena: { clima: 'tarde', cam: [-150, 2, -116], alvo: [-128, 3, -103.6], fov: 55 } },
  { nome: 'cemiterio', brilho: 1.5, cena: { clima: 'garoa', cam: [42, 2.2, 36], alvo: [72, 1.4, 44], fov: 55 } },
  { nome: 'mato', brilho: 1.3, cena: { clima: 'madrugada', cam: [-270, 2, 60], alvo: [-330, 6, 0], fov: 58 } },
  { nome: 'pegadas', brilho: 1.35, cena: { clima: 'madrugada', cam: [22, 1.8, -6], alvo: [52, 2.5, -2], fov: 58 } },
  {
    // o forasteiro de lanterna acesa numa rua da praça, na chuva
    nome: 'chuva', js: C => {
      const h = Math.atan2(-166 - -182, 29 - 52), px = -182, pz = 52;
      C.cena({
        clima: 'chuva', lanterna: true, jogador: [px, pz, h], fov: 55,
        cam: [px - Math.sin(h) * 4 + Math.cos(h), 2, pz - Math.cos(h) * 4 - Math.sin(h)],
        alvo: [px + Math.sin(h) * 20, 1.2, pz + Math.cos(h) * 20],
      });
    },
  },
  { nome: 'tempestade', cena: { clima: 'tempestade', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 }, js: (C, T) => T.atmo.strike(true), espera: 40 },
  {
    // Seu Valdir no banco da praça, com a garrafa térmica
    nome: 'valdir', js: (C, T) => {
      const n = T.npcs.byId.valdir, h = n.heading, fx = Math.sin(h), fz = Math.cos(h);
      const cx = n.pos.x + fx * 2.8 + fz * 1.2, cz = n.pos.z + fz * 2.8 - fx * 1.2;
      C.cena({ clima: 'tarde', cam: [cx, 1.25, cz], alvo: [n.pos.x - fz * 0.3, 0.85, n.pos.z + fx * 0.3], fov: 40, jogador: [cx + fx * 6, cz + fz * 6, 0] });
    },
  },
  // estilo-limpo e estilo-ps1 (mais abaixo, na página PS1 RETRÔ) têm o mesmo enquadramento
  { nome: 'estilo-limpo', cena: { clima: 'anoitecer', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 } },
  {
    // mirando a pistola na beira do mato, na garoa (a câmera do jogo, por cima do ombro)
    nome: 'mira', brilho: 1.3, espera: 2500, js: (C, T) => {
      C.cena({ clima: 'garoa', lanterna: true, cam: [-270, 2, 60], alvo: [-330, 6, 0] });
      C.armado();
      const px = -276, pz = 54, h = Math.atan2(-330 - px, 0 - pz);
      T.teleport(px, pz, h);
      T.setState('play'); C.semInterface();
      T.input.mouse.buttons = 2;
      T.setYawPitch(h + Math.PI, 0, 3);
    },
  },
  {
    // conversa com o Seu Valdir: a caixa de diálogo do jogo aparece
    nome: 'conversa', ui: true, espera: 3000, js: (C, T) => {
      T.input.mouse.buttons = 0;
      C.cena({ clima: 'tarde', cam: [-190, 3.4, 52], alvo: [-176, 1.4, 70] });
      const n = T.npcs.byId.valdir, px = n.pos.x + 1.9, pz = n.pos.z - 0.8;
      T.teleport(px, pz, Math.atan2(n.pos.x - px, n.pos.z - pz));
      T.setState('play');
      T.npcs.focus = n; T.npcs.startTalk(); T.setState('talk');
      C.interface();
      setTimeout(() => { T.npcs.dialogue.chars = 400; }, 2000);
    },
  },
  {
    // o inventário do começo do jogo
    nome: 'inventario', ui: true, espera: 2500, js: (C, T) => {
      T.npcs.dialogue.open = false;
      C.cena({ clima: 'tarde', cam: [-318, 2.6, 258], alvo: [-333, 1.2, 330] });
      C.armado();
      T.teleport(-325, 290, 0); T.setState('play');
      T.invScreen.open(); T.setState('inventory');
      C.interface();
    },
  },
  // PS1 RETRÔ (segunda página, ?visual=ps1)
  { nome: 'estilo-ps1', ps1: true, cena: { clima: 'anoitecer', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 } },
  { nome: 'ps1-praca', ps1: true, cena: { clima: 'noite', cam: [-164.8, 3, 57.4], alvo: [-180.8, 1.2, 70.4], fov: 55 } },
  { nome: 'ps1-calcadao', ps1: true, cena: { clima: 'tarde', cam: [-318, 2.6, 258], alvo: [-333, 1.2, 330], fov: 55 } },
  { nome: 'ps1-igreja-dentro', ps1: true, cena: { clima: 'tarde', interior: ['igreja', 'nave'], cam: [10110, 402.4, 9706], alvo: [10110, 401.8, 9736], fov: 60 } },
];

// ajudante instalado na página: monta cada cena
function instala() {
  const T = window.__teewald;
  T.settings.drawDistance = 2;
  if (T.atmo.setDrawDistance) T.atmo.setDrawDistance(2);
  T.ctx.leaves.mesh.material.visible = false;   // folhas caindo passam na frente da câmera
  window.__cap = {
    // sem vinheta e sem grão do jogo (o site põe os seus)
    limpo() {
      const m = T.renderer.postMat;
      m.fragmentShader = m.fragmentShader.replace('c *= clamp(1.0 - dot(q, q) * 1.25, 0.0, 1.0);', '').replace('c += (n - 0.5) * 0.04;', '');
      m.needsUpdate = true;
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
  window.__cap.limpo();
}

// reduz uma captura para a versão das grades do site
async function reduz(page, png, w, h, brilho = 1) {
  return page.evaluate(async (src, w, h, brilho) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (brilho !== 1) g.filter = `brightness(${brilho}) contrast(1.04)`;
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.84);
  }, 'data:image/png;base64,' + png, w, h, brilho);
}

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port: 5198, strictPort: false, open: false }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const args = process.env.CHROME_SW
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: [...args, `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });

const erros = [];

async function abre(ps1, idioma) {
  const page = await browser.newPage();
  page.on('pageerror', e => erros.push(`[página] ${e.message}`));
  await page.evaluateOnNewDocument(idioma => {
    localStorage.setItem('teewald.settings.v1', JSON.stringify({ lang: idioma, drawDistance: 2, minimap: false }));
  }, idioma);
  const t0 = Date.now();
  await page.goto(`${base}?lang=${idioma}${ps1 ? '&visual=ps1' : ''}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__teewald, { timeout: 900000, polling: 500 });
  const gpu = await page.evaluate(() => {
    try { const c = window.__teewald.renderer.gl.getContext(); return c.getParameter(c.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); } catch (e) { return '?'; }
  });
  console.log(`jogo carregado em ${((Date.now() - t0) / 1000).toFixed(0)} s ${ps1 ? '(PS1 RETRÔ) ' : ''}[${idioma}] · ${gpu}`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const quais = FOTOS.filter(f => !so.length || so.includes(f.nome));
for (const idioma of IDIOMAS) for (const ps1 of [false, true]) {
  const lista = quais.filter(f => !!f.ps1 === ps1);
  if (!lista.length) continue;
  const sub = idioma === 'pt' ? '' : idioma;
  fs.mkdirSync(path.join(OUT, sub), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'p', sub), { recursive: true });
  const page = await abre(ps1, idioma);
  let instalado = false;
  for (const f of lista) {
    if (f.titulo) await new Promise(r => setTimeout(r, f.espera));
    if (!instalado && !f.titulo) { await page.evaluate(instala); instalado = true; }
    if (!f.titulo) {
      await page.evaluate((cena, js) => {
        const C = window.__cap, T = window.__teewald;
        if (cena) C.cena(cena);
        if (js) (0, eval)('(' + js + ')')(C, T);
      }, f.cena || null, f.js ? f.js.toString() : null);
      await new Promise(r => setTimeout(r, f.espera ?? 1800));
    }
    const png = await page.screenshot({ type: 'png', encoding: 'base64' });
    const grande = await reduz(page, png, W, H, f.brilho);
    const pequena = await reduz(page, png, 960, 540, f.brilho);
    fs.writeFileSync(path.join(OUT, sub, f.nome + '.jpg'), Buffer.from(grande.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, 'p', sub, f.nome + '.jpg'), Buffer.from(pequena.split(',')[1], 'base64'));
    console.log('  ' + (sub ? sub + '/' : '') + f.nome);
  }
  await page.close();
}
await browser.close();
await server.close();
if (erros.length) console.log(erros.join('\n'));
console.log(`site/img/capturas/: ${quais.length * IDIOMAS.length} fotos`);
