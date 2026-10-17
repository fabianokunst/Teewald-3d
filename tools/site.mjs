// Monta o site (site/) a partir das páginas em português e de tools/site/:
//   npm run site                  monta tudo e diz quanto falta traduzir
//   npm run site -- --falta en    lista os trechos sem tradução em inglês
//   npm run site -- --confere     confere os dicionários (marcas HTML iguais às do original)
//
// Cada página tem os marcadores <!-- cabeca:inicio --> ... <!-- cabeca:fim --> (dentro do
// <head>), <!-- topo:... --> e <!-- rodape:... -->; só o que está entre eles é reescrito.
// O título, a descrição e a imagem de cada página ficam em tools/site/paginas.mjs; o link da
// página atual no menu ganha aria-current="page".
//
// Idiomas (os mesmos do jogo, tools/site/idiomas.mjs): as páginas de site/ são a fonte em
// português; site/en/, site/es/ e site/de/ são geradas a partir delas trocando cada trecho pelo
// dicionário tools/site/i18n/<idioma>.json (tools/site/traduz.mjs). Não edite as páginas
// geradas: mude o português ou o dicionário e rode de novo. Cada página ganha o seletor de
// idioma no topo e no rodapé e os links hreflang para os buscadores.
//
// Também faz o que buscadores e LLMs leem:
//   JSON-LD (schema.org) no <head> de cada página: o jogo, o site, o autor, as migalhas, as
//     perguntas frequentes (jogo.html) e as fotos (galeria.html), tirados do próprio HTML
//   site/sitemap.xml   páginas (nos quatro idiomas) e imagens; o build publica na raiz
//   *.html.md, llms.txt e llms-full.txt de cada idioma   (tools/site/markdown.mjs)
//   o <head> da página do jogo (index.html da raiz, entre <!-- seo:inicio --> e <!-- seo:fim -->)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JOGO, ENDERECO, AUTOR, VERIFICACAO, PAGINAS, indexadas } from './site/paginas.mjs';
import { IDIOMAS, TRADUZIDOS, PADRAO, traduzida, urlEm } from './site/idiomas.mjs';
import { lerHtml, todos, primeiro, texto, limpo, grandeDe, derivados, AVISO } from './site/markdown.mjs';
import { tradutor, grava as gravaDicionario, traduzHtml, reescreveLinks, confere } from './site/traduz.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const PARTES = path.join(ROOT, 'tools', 'site');
const args = process.argv.slice(2);

// ---- só conferir os dicionários
if (args.includes('--confere')) {
  let n = 0;
  for (const l of TRADUZIDOS) for (const p of confere(l)) { console.log(`[${l}] ${p}`); n++; }
  console.log(n ? `${n} problemas` : 'dicionários ok');
  process.exit(n ? 1 : 0);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const parte = nome => fs.readFileSync(path.join(PARTES, nome + '.html'), 'utf8').trimEnd();
const preenche = (html, v) => html.replace(/\{\{([a-z-]+)\}\}/g, (m, k) => (k in v ? v[k] : m));
const captura = nome => `${ENDERECO}img/capturas/${nome}.jpg`;
const grava = (arq, s) => {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  if (!fs.existsSync(arq) || fs.readFileSync(arq, 'utf8') !== s) fs.writeFileSync(arq, s);
};
function troca(s, nome, html, onde) {
  const a = `<!-- ${nome}:inicio -->`, b = `<!-- ${nome}:fim -->`;
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < i) throw new Error(`${onde}: faltam os marcadores ${a} e ${b}`);
  return s.slice(0, i + a.length) + '\n' + html + '\n' + s.slice(j);
}
const metaVerificacao = recuo => [
  VERIFICACAO.google && `<meta name="google-site-verification" content="${esc(VERIFICACAO.google)}"${recuo}>`,
  VERIFICACAO.bing && `<meta name="msvalidate.01" content="${esc(VERIFICACAO.bing)}"${recuo}>`,
].filter(Boolean).map(t => '\n  ' + t).join('');

// tradutores: o português passa direto
const PT = { idioma: 'pt', t: s => s, tt: s => s };
const trs = { pt: PT };
for (const l of TRADUZIDOS) trs[l] = tradutor(l);

// ---- dados estruturados
const ID = { site: ENDERECO + '#site', autor: ENDERECO + '#autor', jogo: JOGO + '#jogo' };
const AUTOR_LD = { '@type': 'Person', '@id': ID.autor, name: AUTOR };
const siteLD = tr => ({
  '@type': 'WebSite', '@id': ID.site, url: ENDERECO, name: 'Teewald', inLanguage: Object.values(IDIOMAS).map(i => i.html),
  description: tr.tt(PAGINAS['index.html'].descricao), publisher: { '@id': ID.autor }, about: { '@id': ID.jogo },
});
const jogoLD = tr => ({
  '@type': 'VideoGame', '@id': ID.jogo, name: 'Teewald', url: JOGO,
  description: tr.tt('Survival horror em terceira pessoa com visual de PlayStation 1, gratuito, que roda no navegador. Doze capítulos numa cidadezinha fictícia de colonos alemães na serra gaúcha, inspirada em Santa Maria do Herval (RS), onde a criação aparece morta sem uma gota de sangue.'),
  image: captura('capa'),
  screenshot: ['titulo', 'igreja', 'praca-noite', 'chuva', 'kartoffelfest', 'mira', 'inventario', 'estilo-ps1'].map(captura),
  genre: ['Survival horror', tr.tt('Terror'), tr.tt('Ação em terceira pessoa')],
  keywords: tr.tt('survival horror, jogo de terror, PS1, PlayStation 1, low poly, jogo de navegador, WebGL, lendas, chupacabras, serra gaúcha, colonização alemã, Hunsrück, Santa Maria do Herval'),
  gamePlatform: [tr.tt('Navegador web'), 'PC', tr.tt('Celular'), 'Tablet'],
  applicationCategory: 'GameApplication',
  operatingSystem: 'Windows, macOS, Linux, Android, iOS',
  softwareRequirements: tr.tt('Navegador atualizado com WebGL (Chrome, Edge, Firefox ou Safari)'),
  playMode: 'SinglePlayer',
  numberOfPlayers: { '@type': 'QuantitativeValue', value: 1 },
  inLanguage: Object.values(IDIOMAS).map(i => i.html),
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: JOGO },
  author: { '@id': ID.autor },
  gameLocation: {
    '@type': 'Place', name: 'Teewald',
    description: tr.tt('Cidade fictícia de colonos alemães no Vale do Herval, na serra gaúcha, inspirada no mapa de Santa Maria do Herval (RS). Os moradores e as histórias são inventados.'),
  },
  sameAs: [ENDERECO],
});
const imagemLD = (url, alt) => ({ '@type': 'ImageObject', url, contentUrl: url, width: 1920, height: 1080, caption: alt });

// imagens da página, na versão grande quando a miniatura abre uma maior (data-grande)
function imagens(raiz, base) {
  const lista = [];
  (function anda(n, grande) {
    for (const f of n.filhos || []) {
      if (!f.tag) continue;
      const g = f.tag === 'button' && f.attrs['data-grande'] ? f.attrs['data-grande'] : grande;
      if (f.tag === 'img' && f.attrs.src) lista.push({ url: new URL(grandeDe(g || f.attrs.src), base).href, mini: new URL(f.attrs.src, base).href, alt: limpo(f.attrs.alt || '') });
      anda(f, g);
    }
  })(raiz, null);
  return lista;
}

function grafo(arq, p, raiz, idioma) {
  const tr = trs[idioma], url = urlEm(arq, idioma);
  const pagina = {
    '@type': p.tipo || 'WebPage', '@id': url + '#pagina', url, name: tr.tt(p.titulo), description: tr.tt(p.descricao),
    inLanguage: IDIOMAS[idioma].html, isPartOf: { '@id': ID.site },
    [arq === 'index.html' ? 'mainEntity' : 'about']: { '@id': ID.jogo },
    primaryImageOfPage: imagemLD(captura(p.imagem), tr.tt(p.alt)),
  };
  if (arq !== 'index.html') {
    pagina.breadcrumb = {
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Teewald', item: urlEm('index.html', idioma) },
        { '@type': 'ListItem', position: 2, name: tr.tt(p.nome), item: url },
      ],
    };
  }
  // jogo.html: as perguntas frequentes (<details>) viram FAQPage
  if (p.tipo === 'FAQPage') {
    pagina.mainEntity = todos(raiz, n => n.tag === 'details').map(d => {
      const resumo = primeiro(d, n => n.tag === 'summary');
      const resposta = d.filhos.filter(n => n !== resumo).map(texto).join(' ');
      return { '@type': 'Question', name: limpo(texto(resumo)), acceptedAnswer: { '@type': 'Answer', text: limpo(resposta) } };
    });
  }
  // galeria.html: cada captura com autor e crédito
  if (p.tipo === 'ImageGallery') {
    const galeria = primeiro(raiz, n => n.attrs.id === 'galeria');
    pagina.image = imagens(galeria, url).map(i => ({
      '@type': 'ImageObject', contentUrl: i.url, thumbnailUrl: i.mini, caption: i.alt,
      creator: { '@id': ID.autor }, creditText: `Teewald — ${AUTOR}`,
    }));
  }
  return { '@context': 'https://schema.org', '@graph': [pagina, jogoLD(tr), siteLD(tr), AUTOR_LD] };
}
const jsonld = (obj, recuo) => JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/').split('\n').map(l => recuo + l).join('\n');

// ---- seletor de idioma (topo e rodapé): leva à mesma página no outro idioma
const GLOBO = '<svg class="icone-globo" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 1h6v1H5zM3 2h2v1H3zM11 2h2v1h-2zM2 3h1v2H2zM13 3h1v2h-1zM1 5h1v6H1zM14 5h1v6h-1zM2 11h1v2H2zM13 11h1v2h-1zM3 13h2v1H3zM11 13h2v1h-2zM5 14h6v1H5zM2 7h12v2H2zM7 2h2v12H7zM4 4h1v8H4zM11 4h1v8h-1z"/></svg>';
function hrefIdioma(arq, de, para) {
  const alvo = traduzida(arq) ? arq : 'index.html';
  return (IDIOMAS[de].pasta ? '../' : '') + IDIOMAS[para].pasta + alvo;
}
const linkIdioma = (arq, idioma, l, rotulo) => {
  const o = IDIOMAS[l];
  return `<a href="${hrefIdioma(arq, idioma, l)}" hreflang="${o.hreflang}" lang="${o.html}" translate="no"${l === idioma ? ' aria-current="true"' : ''}>${rotulo}</a>`;
};
function seletor(arq, idioma) {
  const itens = Object.keys(IDIOMAS).map(l =>
    `          <li>${linkIdioma(arq, idioma, l, `<b>${IDIOMAS[l].sigla}</b> ${IDIOMAS[l].nome}`)}</li>`).join('\n');
  return [
    '      <details class="idiomas">',
    `        <summary><span class="so-leitor">Idioma:</span> ${GLOBO}<span translate="no">${IDIOMAS[idioma].sigla}</span></summary>`,
    '        <ul>', itens, '        </ul>',
    '      </details>',
  ].join('\n');
}
const seletorRodape = (arq, idioma) =>
  `          <li class="idiomas-rodape">${Object.keys(IDIOMAS).map(l => linkIdioma(arq, idioma, l, IDIOMAS[l].nome)).join(' · ')}</li>`;

function cabeca(arq, p, idioma, raiz) {
  const tr = trs[idioma], I = IDIOMAS[idioma];
  const indexar = p.indexar !== false;
  const alternativos = traduzida(arq) ? [
    ...Object.entries(IDIOMAS).map(([l, o]) => `<link rel="alternate" hreflang="${o.hreflang}" href="${urlEm(arq, l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${urlEm(arq, PADRAO)}">`,
  ].map(t => '\n  ' + t).join('') : '';
  const ogAlternativos = traduzida(arq) ? Object.entries(IDIOMAS).filter(([l]) => l !== idioma)
    .map(([, o]) => `\n  <meta property="og:locale:alternate" content="${o.og}">`).join('') : '';
  const titulo = tr.tt(p.titulo);
  const v = {
    titulo: esc(titulo), 'titulo-social': esc(p.social ? tr.tt(p.social) : titulo), descricao: esc(tr.tt(p.descricao)),
    imagem: captura(p.imagem), 'imagem-alt': esc(tr.tt(p.alt)), url: urlEm(arq, idioma), jogo: JOGO, autor: esc(AUTOR),
    robots: indexar ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, follow',
    markdown: indexar ? `\n  <link rel="alternate" type="text/markdown" href="${arq}.md" title="${esc(titulo)} (markdown)">` : '',
    alternativos, 'og-locale': I.og, 'og-alternativos': ogAlternativos,
    raiz: I.pasta ? '../' : '',
    verificacao: metaVerificacao(''),
    jsonld: jsonld(grafo(arq, p, raiz, idioma), '  '),
  };
  return preenche(parte('cabeca'), v);
}
const topo = (arq, idioma) => preenche(parte('topo'), { jogo: JOGO, idiomas: seletor(arq, idioma) })
  .replace(`<a href="${arq}">`, `<a href="${arq}" aria-current="page">`);
const rodape = (arq, idioma) => preenche(parte('rodape'), { jogo: JOGO, 'idiomas-rodape': seletorRodape(arq, idioma) });

// imagem com versão do idioma (img/documentos/en/jornal.png, img/capturas/en/titulo.jpg...)
function versaoDoIdioma(caminho, idioma) {
  const d = path.posix.dirname(caminho), b = path.posix.basename(caminho);
  const proprio = `${d}/${idioma}/${b}`;
  return fs.existsSync(path.join(SITE, proprio)) ? proprio : null;
}

// ---- páginas
let n = 0;
for (const [arq, p] of Object.entries(PAGINAS)) {
  const caminho = path.join(SITE, arq);
  if (!fs.existsSync(caminho)) { console.warn(`falta site/${arq}`); continue; }
  let s = fs.readFileSync(caminho, 'utf8');
  s = troca(s, 'topo', topo(arq, 'pt'), `site/${arq}`);
  s = troca(s, 'rodape', rodape(arq, 'pt'), `site/${arq}`);
  s = troca(s, 'cabeca', cabeca(arq, p, 'pt', lerHtml(s)), `site/${arq}`);
  grava(caminho, s);
  n++;
  if (!traduzida(arq)) continue;
  for (const l of TRADUZIDOS) {
    let t = troca(s, 'topo', topo(arq, l), arq);
    t = troca(t, 'rodape', rodape(arq, l), arq);
    t = traduzHtml(t, trs[l]);
    t = reescreveLinks(t, l, { traduzida, versaoDoIdioma, jogo: JOGO });
    t = troca(t, 'cabeca', cabeca(arq, p, l, lerHtml(t)), arq);
    t = t.replace(/<html lang="[^"]*">/, `<html lang="${IDIOMAS[l].html}">`)
      .replace(/^<!doctype html>\n/i, m => `${m}<!-- Gerada por npm run site a partir de site/${arq} e de tools/site/i18n/${l}.json: não edite aqui. -->\n`);
    grava(path.join(SITE, IDIOMAS[l].pasta, arq), t);
    n++;
  }
}
console.log(`site/: ${n} páginas montadas (${Object.keys(IDIOMAS).join(', ')})`);

// ---- página do jogo (index.html da raiz): o que aparece no buscador e na prévia dos links
{
  const caminho = path.join(ROOT, 'index.html');
  const v = {
    jogo: JOGO, autor: esc(AUTOR), imagem: captura('capa'), 'imagem-alt': esc(PAGINAS['index.html'].alt),
    verificacao: metaVerificacao(' /'),
    jsonld: jsonld({
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebPage', '@id': JOGO + '#pagina', url: JOGO, name: 'Teewald', inLanguage: 'pt-BR', mainEntity: { '@id': ID.jogo } },
        jogoLD(PT), AUTOR_LD,
      ],
    }, '  '),
  };
  grava(caminho, troca(fs.readFileSync(caminho, 'utf8'), 'seo', preenche(parte('cabeca-jogo'), v), 'index.html'));
  console.log('index.html: cabeça do jogo montada');
}

// ---- dicionários: os textos fixos dos arquivos para LLMs também entram, e se grava o que foi usado
for (const l of TRADUZIDOS) {
  for (const s of ['Página:', 'Jogar grátis no navegador:', AVISO]) trs[l].tt(s);
  gravaDicionario(trs[l]);
}

// ---- versões para LLMs
const arquivos = derivados(SITE);
for (const [nome, conteudo] of Object.entries(arquivos)) grava(path.join(SITE, nome), conteudo);
console.log(`site/: ${Object.keys(arquivos).length} arquivos para LLMs (.md, llms.txt, llms-full.txt)`);

// ---- sitemap (depois de gravar as páginas: a data é a do último commit, ou hoje se mudou agora)
const hoje = new Date().toLocaleDateString('sv-SE');
function data(...caminhos) {
  try {
    const git = (...a) => execFileSync('git', [...a, '--', ...caminhos], { cwd: ROOT, encoding: 'utf8' }).trim();
    return git('status', '--porcelain') ? hoje : git('log', '-1', '--format=%cs') || hoje;
  } catch { return hoje; }
}
const entrada = (loc, mod, imgs, alternativos = []) => [
  '  <url>', `    <loc>${esc(loc)}</loc>`, `    <lastmod>${mod}</lastmod>`,
  ...alternativos.map(([h, u]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${esc(u)}"/>`),
  ...[...new Set(imgs)].map(i => `    <image:image><image:loc>${esc(i)}</image:loc></image:image>`),
  '  </url>',
].join('\n');
const entradas = [entrada(JOGO, data('index.html', 'src'), [captura('titulo'), captura('capa')])];
for (const [arq] of indexadas()) {
  const alternativos = [...Object.entries(IDIOMAS).map(([l, o]) => [o.hreflang, urlEm(arq, l)]), ['x-default', urlEm(arq, PADRAO)]];
  for (const l of Object.keys(IDIOMAS)) {
    const local = path.join(SITE, IDIOMAS[l].pasta, arq);
    if (!fs.existsSync(local)) continue;
    const url = urlEm(arq, l);
    const raiz = lerHtml(fs.readFileSync(local, 'utf8'));
    const main = primeiro(raiz, x => x.tag === 'main') || raiz;
    entradas.push(entrada(url, data(path.relative(ROOT, local).replace(/\\/g, '/')), imagens(main, url).map(i => i.url), alternativos));
  }
}
grava(path.join(SITE, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- gerado por npm run site (tools/site.mjs); publicado em ' + JOGO + 'sitemap.xml -->',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ...entradas, '</urlset>', '',
].join('\n'));
console.log(`site/sitemap.xml: ${entradas.length} endereços`);

// ---- o que falta traduzir
const lista = args.includes('--falta') ? args[args.indexOf('--falta') + 1] : null;
for (const l of TRADUZIDOS) {
  const faltam = trs[l].faltam();
  console.log(`${IDIOMAS[l].nome}: ${faltam.length ? `faltam ${faltam.length} de ${trs[l].usadas.size} trechos (tools/site/i18n/${l}.json)` : `tudo traduzido (${trs[l].usadas.size} trechos)`}`);
  if (lista === l) for (const k of faltam) console.log('  ' + k);
}
