// Gera as fichas da página de personagens do site (site/personagens.html): o retrato do rosto
// e o corpo inteiro de cada um, fotografados com os modelos do jogo (tools/retratos/studio.js).
//   npm run retratos
// Os moradores vêm de src/game/npcData.js (FICHAS); o protagonista, de tools/retratos/outros.js.
// O site não mostra spoiler: os personagens da campanha e as criaturas ficam de fora, e
// SEM_SPOILER troca o que a ficha de um morador entrega da história. O gerador só reescreve
// o trecho entre <!-- fichas:inicio --> e <!-- fichas:fim -->; o resto da página é do site.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const OUT = path.join(SITE, 'img', 'personagens');
const PAGINA = path.join(SITE, 'personagens.html');

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port: 5197, strictPort: false, open: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0] + 'tools/retratos/index.html';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: exe, headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let data;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[página]', e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__retratos, { timeout: 600000, polling: 500 });
  data = await page.evaluate(() => window.__retratos);
} finally {
  await browser.close();
  await server.close();
}
for (const e of data.erros) console.error('ERRO', e);
if (process.env.DEBUG) for (const it of data.itens) if (it.dbg) console.log(it.id, JSON.stringify(it.dbg, (k, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));

// só quem aparece no site
const NO_SITE = new Set(['protagonista', 'morador']);
const itens = data.itens.filter(i => NO_SITE.has(i.grupo));
const SEM_SPOILER = {
  rudi: { papel: 'Carteiro da cidade há quinze anos' },
};
for (const it of itens) Object.assign(it, SEM_SPOILER[it.id]);

// imagens
for (const dir of ['rostos', 'corpo']) {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  for (const f of fs.readdirSync(path.join(OUT, dir))) fs.rmSync(path.join(OUT, dir, f));
}
const save = (dir, id, dataUrl) => fs.writeFileSync(path.join(OUT, dir, id + '.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
for (const it of itens) { save('rostos', it.id, it.face); save('corpo', it.id, it.body); }

// fichas
const LOCAIS = [
  ['calcadao', 'Calçadão do Rio Cadeia', ['arno', 'hilda', 'lucas', 'marlene', 'edgar', 'lauro', 'katia', 'bruno']],
  ['praca', 'Praça 10 de Abril', ['valdir', 'erna', 'joao', 'ana', 'alfredo', 'wilma', 'paula', 'romeu']],
  ['igreja', 'Igreja Matriz e cemitério', ['bernardo', 'irma', 'rudi', 'otto']],
  ['kartoffelfest', 'Kartoffelfest e campo de futebol', ['ivo', 'gertrud', 'luana', 'tiago']],
];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const m = x => x.toFixed(2).replace('.', ',') + ' m';
const titulo = n => n.toLowerCase().replace(/(^|[\s,])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/\b(O|A|Da|De|Do|Dos|Das)\b/g, w => (w.length > 1 ? w.toLowerCase() : w));

function card(it, classe = 'ficha') {
  const dados = [];
  if (it.idade !== undefined) dados.push(['Idade', typeof it.idade === 'number' ? `${it.idade} anos` : it.idade]);
  if (it.altura) dados.push(['Altura', m(it.altura)]);
  else if (it.alturaMedida) dados.push(['Altura', '≈ ' + m(it.alturaMedida)]);
  if (it.porte) dados.push(['Porte', it.porte + (it.curvado ? ', curvado' : '')]);
  const desc = [['Rosto', it.rosto], ['Corpo', it.corpo], ['Roupa', it.roupa], ['Jeito', it.jeito]].filter(d => d[1]);
  const nome = titulo(it.nome);
  return `
          <article class="${classe}" id="${it.id}">
            <div class="fotos">
              <img class="rosto" src="img/personagens/rostos/${it.id}.jpg" width="320" height="320" alt="Rosto de ${esc(nome)}" loading="lazy">
              <img class="corpo" src="img/personagens/corpo/${it.id}.jpg" width="220" height="330" alt="${esc(nome)} de corpo inteiro" loading="lazy">
            </div>
            <div class="texto">
              <h3>${esc(it.nome)}</h3>
              ${it.papel ? `<p class="papel-ficha">${esc(it.papel)}</p>` : ''}
              ${dados.length ? `<dl class="dados">${dados.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
              <dl class="desc">${desc.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
            </div>
          </article>`;
}

const by = id => itens.find(i => i.id === id);
const heroi = itens.filter(i => i.grupo === 'protagonista');
const moradores = itens.filter(i => i.grupo === 'morador');
const usados = new Set(LOCAIS.flatMap(l => l[2]));
const locais = [...LOCAIS.map(([id, nome, ids]) => [id, nome, ids.map(by).filter(Boolean)]), ['outros', 'Outros moradores', moradores.filter(i => !usados.has(i.id))]].filter(l => l[2].length);

const fichas = `
    <section class="secao secao-fichas" id="protagonista">
      <div class="conteiner">
        <div class="secao-cab">
          <span class="rotulo">Protagonista</span>
          <h2>Você</h2>
          <hr class="regua">
        </div>
${heroi.map(it => card(it, 'ficha ficha-heroi')).join('\n')}
      </div>
    </section>

    <section class="secao secao-fichas" id="moradores">
      <div class="conteiner">
        <div class="secao-cab">
          <span class="rotulo">Moradores</span>
          <h2>Quem você vai encontrar</h2>
          <hr class="regua">
          <p class="intro">${moradores.length} moradores com fala, espalhados pela cidade. Altura, porte e postura de cada ficha valem no jogo, e os traços do rosto (rugas, olheiras, sardas, barba por fazer, pinta, cicatriz) estão pintados na textura.</p>
        </div>
${locais.map(([id, nome, lista]) => `        <h3 class="local-titulo" id="${id}">${esc(nome)}</h3>
        <div class="fichas">${lista.map(it => card(it)).join('')}
        </div>`).join('\n')}
      </div>
    </section>
`;
const pagina = fs.readFileSync(PAGINA, 'utf8');
const ini = '<!-- fichas:inicio -->', fim = '<!-- fichas:fim -->';
if (!pagina.includes(ini) || !pagina.includes(fim)) throw new Error(`${PAGINA} precisa ter ${ini} e ${fim}`);
fs.writeFileSync(PAGINA, pagina.slice(0, pagina.indexOf(ini) + ini.length) + '\n' + fichas + '    ' + pagina.slice(pagina.indexOf(fim)));
console.log(`site/personagens.html: ${itens.length} fichas, ${data.erros.length} erros`);
for (const it of itens) if (it.altura && it.alturaMedida) console.log(`  ${it.id.padEnd(9)} ficha ${m(it.altura)}  modelo ${m(it.alturaMedida)}`);
