// Gera as fichas dos personagens: o retrato do rosto e o corpo inteiro de cada um, fotografados
// com os modelos do jogo (tools/retratos/studio.js), em dois lugares:
//   personagens/            a lista completa, separada do site: protagonista, moradores,
//                           personagens da campanha e criaturas. Vai com o jogo para
//                           .../Teewald-3d/personagens/, sem link no site e fora dos buscadores,
//                           porque tem spoiler.
//   site/personagens.html   só o protagonista e os moradores, sem spoiler: SEM_SPOILER troca o
//                           que a ficha de um morador entrega da história. Ali o gerador só
//                           reescreve o trecho entre <!-- fichas:inicio --> e <!-- fichas:fim -->.
//   npm run retratos
// Os moradores vêm de src/game/npcData.js (FICHAS); o resto, de tools/retratos/outros.js.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const PAGINA = path.join(SITE, 'personagens.html');
const PASTA = path.join(ROOT, 'personagens');

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

// só quem aparece no site, sem spoiler
const NO_SITE = new Set(['protagonista', 'morador']);
const SEM_SPOILER = {
  rudi: { papel: 'Carteiro da cidade há quinze anos' },
};
const itens = data.itens.filter(i => NO_SITE.has(i.grupo)).map(i => ({ ...i, ...SEM_SPOILER[i.id] }));

// imagens
function grava(out, lista) {
  for (const dir of ['rostos', 'corpo']) {
    fs.mkdirSync(path.join(out, dir), { recursive: true });
    for (const f of fs.readdirSync(path.join(out, dir))) fs.rmSync(path.join(out, dir, f));
  }
  const save = (dir, id, dataUrl) => fs.writeFileSync(path.join(out, dir, id + '.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  for (const it of lista) { save('rostos', it.id, it.face); save('corpo', it.id, it.body); }
}
grava(path.join(SITE, 'img', 'personagens'), itens);
grava(PASTA, data.itens);

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

// fotos: onde ficam rostos/ e corpo/, a partir da página
function card(it, classe = 'ficha', fotos = 'img/personagens/') {
  const dados = [];
  if (it.idade !== undefined) dados.push(['Idade', typeof it.idade === 'number' ? `${it.idade} anos` : it.idade]);
  if (it.voa) dados.push(['Envergadura', it.asa ? m(it.asa) : '≈ ' + m(it.envergadura)]);
  else if (it.altura) dados.push(['Altura', m(it.altura)]);
  else if (it.alturaMedida) dados.push(['Altura', '≈ ' + m(it.alturaMedida)]);
  if (it.porte) dados.push(['Porte', it.porte + (it.curvado ? ', curvado' : '')]);
  const desc = [['Rosto', it.rosto], ['Corpo', it.corpo], ['Roupa', it.roupa], ['Jeito', it.jeito]].filter(d => d[1]);
  const nome = titulo(it.nome);
  return `
          <article class="${classe}" id="${it.id}">
            <div class="fotos">
              <img class="rosto" src="${fotos}rostos/${it.id}.jpg" width="320" height="320" alt="Rosto de ${esc(nome)}" loading="lazy">
              <img class="corpo" src="${fotos}corpo/${it.id}.jpg" width="220" height="330" alt="${esc(nome)} de corpo inteiro" loading="lazy">
            </div>
            <div class="texto">
              <h3>${esc(it.nome)}</h3>
              ${it.papel ? `<p class="papel-ficha">${esc(it.papel)}</p>` : ''}
              ${dados.length ? `<dl class="dados">${dados.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
              <dl class="desc">${desc.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
            </div>
          </article>`;
}

// os moradores agrupados pelo lugar onde ficam
function porLocal(lista) {
  const by = id => lista.find(i => i.id === id && i.grupo === 'morador');
  const usados = new Set(LOCAIS.flatMap(l => l[2]));
  const resto = lista.filter(i => i.grupo === 'morador' && !usados.has(i.id));
  return [...LOCAIS.map(([id, nome, ids]) => [id, nome, ids.map(by).filter(Boolean)]), ['outros', 'Outros moradores', resto]].filter(l => l[2].length);
}
const heroi = itens.filter(i => i.grupo === 'protagonista');
const moradores = itens.filter(i => i.grupo === 'morador');
const locais = porLocal(itens);

const fichas = `
    <section class="secao secao-fichas" id="protagonista">
      <div class="conteiner">
        <div class="secao-cab" data-revela>
          <p class="rotulo">Protagonista</p>
          <h2>Você</h2>
          <hr class="regua">
        </div>
        <div data-revela-filhos>${heroi.map(it => card(it, 'ficha ficha-heroi')).join('\n')}
        </div>
      </div>
    </section>

    <section class="secao secao-fichas" id="moradores">
      <div class="conteiner">
        <div class="secao-cab" data-revela>
          <p class="rotulo">Moradores</p>
          <h2>Quem você vai encontrar</h2>
          <hr class="regua">
          <p class="intro">${moradores.length} moradores com fala, espalhados pela cidade. Altura, porte e postura de cada ficha valem no jogo, e os traços do rosto (rugas, olheiras, sardas, barba por fazer, pinta, cicatriz) estão pintados na textura.</p>
        </div>
${locais.map(([id, nome, lista]) => `        <h3 class="local-titulo" id="${id}" data-revela>${esc(nome)}</h3>
        <div class="fichas" data-revela-filhos>${lista.map(it => card(it)).join('')}
        </div>`).join('\n')}
      </div>
    </section>
`;
const pagina = fs.readFileSync(PAGINA, 'utf8');
const ini = '<!-- fichas:inicio -->', fim = '<!-- fichas:fim -->';
if (!pagina.includes(ini) || !pagina.includes(fim)) throw new Error(`${PAGINA} precisa ter ${ini} e ${fim}`);
fs.writeFileSync(PAGINA, pagina.slice(0, pagina.indexOf(ini) + ini.length) + '\n' + fichas + '    ' + pagina.slice(pagina.indexOf(fim)));
console.log(`site/personagens.html: ${itens.length} fichas, ${data.erros.length} erros`);

// a pasta personagens/: todo mundo, com spoiler
const grupo = g => data.itens.filter(i => i.grupo === g);
const secoes = [
  ['protagonista', 'Protagonista', null, [['', '', grupo('protagonista')]]],
  ['moradores', 'Moradores', `${grupo('morador').length} moradores com fala, espalhados pela cidade. Altura, porte e postura de cada ficha valem no jogo, e os traços do rosto (rugas, olheiras, sardas, barba por fazer, pinta, cicatriz) estão pintados na textura.`, porLocal(data.itens)],
  ['campanha', 'Personagens da campanha', 'Os mortos e a bruxa que aparecem nos capítulos.', [['', '', grupo('campanha')]]],
  ['criaturas', 'Criaturas', 'O que anda no mato. Altura medida no modelo do jogo.', [['', '', grupo('criatura')]]],
];
const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Personagens de Teewald</title>
  <meta name="description" content="Fichas de todos os personagens de Teewald, criaturas incluídas: rosto, corpo, roupa e jeito de cada um.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #110e0c; --card: #1b1613; --line: #33291f; --text: #e8dfd2; --muted: #a8998a;
      --gold: #d8a050; --red: #b3463a;
    }
    * { box-sizing: border-box; }
    html { background: var(--bg); }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font: 16px/1.5 'Source Sans 3', system-ui, sans-serif;
    }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 32px 16px 64px; }
    header h1 {
      font: 600 clamp(36px, 7vw, 60px)/1.05 'Grenze Gotisch', serif; color: var(--gold);
      margin: 0 0 8px; letter-spacing: 0.01em;
    }
    header p { color: var(--muted); margin: 0 0 20px; max-width: 70ch; }
    header .aviso { color: var(--red); margin-top: -12px; }
    nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    nav a {
      color: var(--text); text-decoration: none; border: 1px solid var(--line); border-radius: 999px;
      padding: 8px 14px; min-height: 44px; display: inline-flex; align-items: center; background: var(--card);
    }
    nav a:hover, nav a:focus-visible { border-color: var(--gold); color: var(--gold); }
    section { margin-top: 48px; }
    h2 {
      font: 600 34px/1.1 'Grenze Gotisch', serif; color: var(--gold); margin: 0 0 6px;
      border-bottom: 1px solid var(--line); padding-bottom: 8px;
    }
    #criaturas h2 { color: var(--red); }
    .intro { color: var(--muted); margin: 8px 0 0; max-width: 75ch; }
    h4 { font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-size: 13px; margin: 28px 0 12px; }
    .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 16px; margin-top: 16px; }
    .ficha {
      display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start;
      background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px;
    }
    .fotos { display: grid; grid-template-columns: 150px 66px; gap: 6px; align-items: end; }
    .fotos img { display: block; width: 100%; height: auto; border-radius: 4px; background: #17130f; }
    .texto { min-width: 0; }
    h3 { margin: 0; font-size: 19px; letter-spacing: 0.04em; }
    .papel-ficha { margin: 2px 0 10px; color: var(--muted); }
    .dados { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 0 10px; }
    .dados div { display: flex; gap: 6px; }
    .dados dt { color: var(--gold); font-weight: 600; }
    .dados dd { margin: 0; }
    .desc { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; }
    .desc dt { color: var(--muted); font-weight: 600; }
    .desc dd { margin: 0; }
    footer { margin-top: 56px; color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); padding-top: 16px; }
    @media (max-width: 560px) {
      .ficha { grid-template-columns: 1fr; }
      .fotos { grid-template-columns: 1fr 0.44fr; max-width: 340px; }
      .desc { grid-template-columns: 1fr; gap: 0; }
      .desc dd { margin-bottom: 6px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Personagens de Teewald</h1>
      <p>Quem vive, assombra e caça em Santa Maria do Herval. Retratos tirados dos modelos do jogo; as figuras de corpo inteiro das pessoas estão todas na mesma escala.</p>
      <p class="aviso">Lista completa, com spoiler: os personagens dos capítulos e todas as criaturas.</p>
      <nav>${secoes.map(([id, nome]) => `<a href="#${id}">${nome}</a>`).join('')}</nav>
    </header>
${secoes.map(([id, nome, intro, grupos]) => `
    <section id="${id}">
      <h2>${nome}</h2>
      ${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
${grupos.map(([gid, g, lista]) => `      ${g ? `<h4 id="${gid}">${esc(g)}</h4>` : ''}
      <div class="grade">${lista.map(it => card(it, 'ficha', '')).join('')}
      </div>`).join('\n')}
    </section>`).join('\n')}
    <footer>Gerado por <code>npm run retratos</code> a partir de <code>src/game/npcData.js</code> e <code>tools/retratos/outros.js</code>. Todos os nomes, personagens e histórias são inventados.</footer>
  </div>
</body>
</html>
`;
fs.writeFileSync(path.join(PASTA, 'index.html'), html);
console.log(`personagens/: ${data.itens.length} fichas`);
for (const it of itens) if (it.altura && it.alturaMedida) console.log(`  ${it.id.padEnd(9)} ficha ${m(it.altura)}  modelo ${m(it.alturaMedida)}`);
