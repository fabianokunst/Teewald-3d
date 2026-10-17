// Monta as partes que se repetem nas páginas do site (site/*.html) a partir de tools/site/:
//   npm run site
// Cada página tem os marcadores <!-- cabeca:inicio --> ... <!-- cabeca:fim --> (dentro do
// <head>), <!-- topo:... --> e <!-- rodape:... -->; só o que está entre eles é reescrito.
// O título, a descrição e a imagem de cada página (buscadores e redes sociais) ficam em
// tools/site/paginas.mjs; o link da página atual no menu ganha aria-current="page".
// Também faz o que buscadores e LLMs leem:
//   JSON-LD (schema.org) no <head> de cada página: o jogo, o site, o autor, as migalhas, as
//     perguntas frequentes (jogo.html) e as fotos (galeria.html), tirados do próprio HTML
//   site/sitemap.xml   páginas e imagens; o build publica na raiz (…/Teewald-3d/sitemap.xml)
//   site/*.html.md, site/llms.txt, site/llms-full.txt   (tools/site/markdown.mjs)
//   o <head> da página do jogo (index.html da raiz, entre <!-- seo:inicio --> e <!-- seo:fim -->)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JOGO, ENDERECO, AUTOR, VERIFICACAO, PAGINAS, urlDaPagina, indexadas } from './site/paginas.mjs';
import { lerHtml, todos, primeiro, texto, limpo, grandeDe, derivados } from './site/markdown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const PARTES = path.join(ROOT, 'tools', 'site');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const parte = nome => fs.readFileSync(path.join(PARTES, nome + '.html'), 'utf8').trimEnd();
const preenche = (html, v) => html.replace(/\{\{([a-z-]+)\}\}/g, (m, k) => (k in v ? v[k] : m));
const captura = nome => `${ENDERECO}img/capturas/${nome}.jpg`;
const grava = (arq, s) => { if (!fs.existsSync(arq) || fs.readFileSync(arq, 'utf8') !== s) fs.writeFileSync(arq, s); };
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

// ---- dados estruturados
const ID = { site: ENDERECO + '#site', autor: ENDERECO + '#autor', jogo: JOGO + '#jogo' };
const AUTOR_LD = { '@type': 'Person', '@id': ID.autor, name: AUTOR };
const SITE_LD = {
  '@type': 'WebSite', '@id': ID.site, url: ENDERECO, name: 'Teewald', inLanguage: 'pt-BR',
  description: PAGINAS['index.html'].descricao, publisher: { '@id': ID.autor }, about: { '@id': ID.jogo },
};
const JOGO_LD = {
  '@type': 'VideoGame', '@id': ID.jogo, name: 'Teewald', url: JOGO,
  description: 'Survival horror em terceira pessoa com visual de PlayStation 1, gratuito, que roda no navegador. Doze capítulos numa cidadezinha fictícia de colonos alemães na serra gaúcha, inspirada em Santa Maria do Herval (RS), onde a criação aparece morta sem uma gota de sangue.',
  image: captura('capa'),
  screenshot: ['titulo', 'igreja', 'praca-noite', 'chuva', 'kartoffelfest', 'mira', 'inventario', 'estilo-ps1'].map(captura),
  genre: ['Survival horror', 'Terror', 'Ação em terceira pessoa'],
  keywords: 'survival horror, jogo de terror, PS1, PlayStation 1, low poly, jogo de navegador, WebGL, lendas, chupacabras, serra gaúcha, colonização alemã, Hunsrück, Santa Maria do Herval',
  gamePlatform: ['Navegador web', 'PC', 'Celular', 'Tablet'],
  applicationCategory: 'GameApplication',
  operatingSystem: 'Windows, macOS, Linux, Android, iOS',
  softwareRequirements: 'Navegador atualizado com WebGL (Chrome, Edge, Firefox ou Safari)',
  playMode: 'SinglePlayer',
  numberOfPlayers: { '@type': 'QuantitativeValue', value: 1 },
  inLanguage: ['pt-BR', 'en', 'es', 'de'],
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: JOGO },
  author: { '@id': ID.autor },
  gameLocation: {
    '@type': 'Place', name: 'Teewald',
    description: 'Cidade fictícia de colonos alemães no Vale do Herval, na serra gaúcha, inspirada no mapa de Santa Maria do Herval (RS). Os moradores e as histórias são inventados.',
  },
  sameAs: [ENDERECO],
};
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

function grafo(arq, p, raiz) {
  const url = urlDaPagina(arq);
  const pagina = {
    '@type': p.tipo || 'WebPage', '@id': url + '#pagina', url, name: p.titulo, description: p.descricao,
    inLanguage: 'pt-BR', isPartOf: { '@id': ID.site },
    [arq === 'index.html' ? 'mainEntity' : 'about']: { '@id': ID.jogo },
    primaryImageOfPage: imagemLD(captura(p.imagem), p.alt),
  };
  if (arq !== 'index.html') {
    pagina.breadcrumb = {
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Teewald', item: ENDERECO },
        { '@type': 'ListItem', position: 2, name: p.nome, item: url },
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
  return { '@context': 'https://schema.org', '@graph': [pagina, JOGO_LD, SITE_LD, AUTOR_LD] };
}
const jsonld = (obj, recuo) => JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/').split('\n').map(l => recuo + l).join('\n');

// ---- páginas do site
let n = 0;
for (const [arq, p] of Object.entries(PAGINAS)) {
  const caminho = path.join(SITE, arq);
  if (!fs.existsSync(caminho)) { console.warn(`falta site/${arq}`); continue; }
  let s = fs.readFileSync(caminho, 'utf8');
  const indexar = p.indexar !== false;
  const v = {
    titulo: esc(p.titulo), 'titulo-social': esc(p.social || p.titulo), descricao: esc(p.descricao),
    imagem: captura(p.imagem), 'imagem-alt': esc(p.alt), url: urlDaPagina(arq), jogo: JOGO, autor: esc(AUTOR),
    robots: indexar ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, follow',
    markdown: indexar ? `\n  <link rel="alternate" type="text/markdown" href="${arq}.md" title="${esc(p.titulo)} (markdown)">` : '',
    verificacao: metaVerificacao(''),
    jsonld: jsonld(grafo(arq, p, lerHtml(s)), '  '),
  };
  s = troca(s, 'cabeca', preenche(parte('cabeca'), v), `site/${arq}`);
  s = troca(s, 'topo', preenche(parte('topo'), v).replace(`<a href="${arq}">`, `<a href="${arq}" aria-current="page">`), `site/${arq}`);
  s = troca(s, 'rodape', preenche(parte('rodape'), v), `site/${arq}`);
  grava(caminho, s);
  n++;
}
console.log(`site/: ${n} páginas montadas`);

// ---- página do jogo (index.html da raiz): o que aparece no buscador e na prévia dos links
{
  const caminho = path.join(ROOT, 'index.html');
  const v = {
    jogo: JOGO, autor: esc(AUTOR), imagem: captura('capa'), 'imagem-alt': esc(PAGINAS['index.html'].alt),
    verificacao: metaVerificacao(' /'),
    jsonld: jsonld({
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebPage', '@id': JOGO + '#pagina', url: JOGO, name: 'Teewald', inLanguage: 'pt-BR', mainEntity: { '@id': ID.jogo } },
        JOGO_LD, AUTOR_LD,
      ],
    }, '  '),
  };
  grava(caminho, troca(fs.readFileSync(caminho, 'utf8'), 'seo', preenche(parte('cabeca-jogo'), v), 'index.html'));
  console.log('index.html: cabeça do jogo montada');
}

// ---- versões para LLMs
const arquivos = derivados(SITE);
for (const [nome, conteudo] of Object.entries(arquivos)) grava(path.join(SITE, nome), conteudo);
console.log(`site/: ${Object.keys(arquivos).join(', ')}`);

// ---- sitemap (depois de gravar as páginas: a data é a do último commit, ou hoje se mudou agora)
const hoje = new Date().toLocaleDateString('sv-SE');
function data(...caminhos) {
  try {
    const git = (...a) => execFileSync('git', [...a, '--', ...caminhos], { cwd: ROOT, encoding: 'utf8' }).trim();
    return git('status', '--porcelain') ? hoje : git('log', '-1', '--format=%cs') || hoje;
  } catch { return hoje; }
}
const entrada = (loc, mod, imgs) => [
  '  <url>', `    <loc>${esc(loc)}</loc>`, `    <lastmod>${mod}</lastmod>`,
  ...[...new Set(imgs)].map(i => `    <image:image><image:loc>${esc(i)}</image:loc></image:image>`),
  '  </url>',
].join('\n');
const entradas = [entrada(JOGO, data('index.html', 'src'), [captura('titulo'), captura('capa')])];
for (const [arq] of indexadas()) {
  const url = urlDaPagina(arq);
  const raiz = lerHtml(fs.readFileSync(path.join(SITE, arq), 'utf8'));
  const main = primeiro(raiz, x => x.tag === 'main') || raiz;
  entradas.push(entrada(url, data(`site/${arq}`), imagens(main, url).map(i => i.url)));
}
grava(path.join(SITE, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- gerado por npm run site (tools/site.mjs); publicado em ' + JOGO + 'sitemap.xml -->',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ...entradas, '</urlset>', '',
].join('\n'));
console.log(`site/sitemap.xml: ${entradas.length} endereços`);
