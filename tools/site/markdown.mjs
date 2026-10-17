// Versões do site para LLMs (padrão llms.txt, https://llmstxt.org), feitas a partir do HTML:
//   site/<página>.html.md   o conteúdo do <main> de cada página em markdown
//   site/llms.txt           o resumo do jogo (texto de tools/site/llms.md) e a lista das páginas
//   site/llms-full.txt      o resumo e todas as páginas num arquivo só
// Usado por tools/site.mjs (npm run site) e pelo build (vite.config.js), que refaz tudo a partir
// do HTML publicado. O que é enfeite (aria-hidden, abas, índice, fichas trancadas) fica de fora.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOGO, ENDERECO, PAGINAS, AUTOR, urlDaPagina, indexadas } from './paginas.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

export const AVISO = 'Obra de ficção: todos os nomes, personagens e histórias do jogo são inventados e não têm nenhuma relação real com a cidade de Santa Maria do Herval ou com seus moradores. Só o mapa (ruas, rio e relevo) vem da cidade de verdade.';

// ---- leitura do HTML: árvore simples { tag, attrs, filhos } / { texto }
const VAZIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…' };
const decodifica = s => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTIDADES[e.toLowerCase()] ?? m));

export function lerHtml(html) {
  const raiz = { tag: '#raiz', attrs: {}, filhos: [] };
  const pilha = [raiz];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</gi;
  let m;
  while ((m = re.exec(html))) {
    const topo = pilha[pilha.length - 1];
    if (m[1]) topo.filhos.push({ tag: m[1].toLowerCase(), attrs: atributos(m[2]), filhos: [{ texto: m[3] }] });
    else if (m[4]) {
      const tag = m[4].toLowerCase();
      const i = pilha.map(n => n.tag).lastIndexOf(tag);
      if (i > 0) pilha.length = i;
    } else if (m[5]) {
      const no = { tag: m[5].toLowerCase(), attrs: atributos(m[6]), filhos: [] };
      topo.filhos.push(no);
      if (!VAZIOS.has(no.tag) && !/\/\s*$/.test(m[6])) pilha.push(no);
    } else if (m[7] || m[0] === '<') topo.filhos.push({ texto: decodifica(m[7] || '<') });
  }
  return raiz;
}
function atributos(s) {
  const a = {};
  for (const m of s.matchAll(/([^\s"'=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g))
    a[m[1].toLowerCase()] = decodifica(m[2] ?? m[3] ?? m[4] ?? '');
  return a;
}

export const classes = n => (n.attrs?.class || '').split(/\s+/);
export const tem = (n, c) => classes(n).includes(c);
export function todos(n, teste, lista = []) {
  for (const f of n.filhos || []) {
    if (f.tag && teste(f)) lista.push(f);
    todos(f, teste, lista);
  }
  return lista;
}
export const primeiro = (n, teste) => todos(n, teste)[0];
export const texto = n => n.texto != null ? n.texto : (n.filhos || []).map(texto).join('');
export const limpo = s => s.replace(/\s+/g, ' ').trim();

// ---- HTML -> markdown
const BLOCOS = new Set(['article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dt', 'dd', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'ul']);
// enfeites e controles que não são conteúdo
const PULA_CLASSE = ['indice', 'trancadas', 'capa-rolar', 'pular', 'seta', 'nome', 'divisoria', 'dica'];
const pula = n => n.tag && (n.attrs['aria-hidden'] === 'true' || n.attrs.role === 'tablist'
  || ['script', 'style', 'svg', 'input', 'hr', 'template', 'noscript'].includes(n.tag) || PULA_CLASSE.some(c => tem(n, c)));
const escapa = s => s.replace(/([\\`*_[\]])/g, '\\$1');

function criaContexto(arq, raiz) {
  const ids = {};
  for (const n of todos(raiz, n => n.attrs.id)) ids[n.attrs.id] = n;
  return { base: urlDaPagina(arq), ids, nivel: 1, grande: null };
}
const absoluto = (href, ctx) => (!href || href.startsWith('#')) ? null : new URL(href, ctx.base).href;

function inline(n, ctx) {
  if (n.texto != null) return escapa(n.texto.replace(/\s+/g, ' '));
  if (pula(n)) return '';
  const dentro = (c = ctx) => juntaInline(n.filhos, c);
  switch (n.tag) {
    case 'br': return '\n';
    case 'em': case 'i': { const t = dentro().trim(); return t ? `*${t}*` : ''; }
    case 'strong': case 'b': { const t = dentro().trim(); return t ? `**${t}**` : ''; }
    case 'code': case 'kbd': return '`' + limpo(texto(n)) + '`';
    case 'img': return imagem(n, ctx);
    case 'button': return dentro({ ...ctx, grande: n.attrs['data-grande'] || null });
    case 'a': {
      const t = dentro().replace(/^\s*▶\s*/, '').trim();
      const url = absoluto(n.attrs.href, ctx);
      return !t ? '' : url ? `[${t}](${url})` : t;
    }
    case 'span':
      if (tem(n, 'tecla')) return '`' + limpo(texto(n)) + '`';
      if (tem(n, 'quando')) return `**${limpo(texto(n))}:**`;
      return dentro();
    default: return dentro();
  }
}
// elementos colados (<b>600</b><span>construções</span>, teclas lado a lado) ganham um espaço
function juntaInline(filhos, ctx) {
  let s = '', antesEraElemento = false;
  for (const f of filhos || []) {
    const t = inline(f, ctx);
    if (!t) continue;
    if (f.tag && antesEraElemento && s && !/\s$/.test(s) && !/^\s/.test(t)) s += ' ';
    s += t;
    antesEraElemento = !!f.tag;
  }
  return s;
}
function imagem(n, ctx) {
  const alt = limpo(n.attrs.alt || '');
  if (!alt) return '';
  return `![${escapa(alt)}](${absoluto(ctx.grande || n.attrs.src, ctx)})`;
}
const paragrafo = s => s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');

function blocos(n, ctx) {
  const saida = [];
  let corrida = [];
  const fecha = () => {
    const p = paragrafo(juntaInline(corrida, ctx));
    if (p) saida.push(p);
    corrida = [];
  };
  for (const f of n.filhos || []) {
    if (f.texto != null || !BLOCOS.has(f.tag) && !(f.tag === 'a' && tem(f, 'cartao-link'))) { corrida.push(f); continue; }
    fecha();
    if (!pula(f)) saida.push(...bloco(f, ctx));
  }
  fecha();
  return saida;
}

function bloco(n, ctx) {
  const tag = n.tag;
  if (/^h[1-6]$/.test(tag)) {
    const nivel = Math.min(6, +tag[1] + ctx.nivel);
    const t = paragrafo(juntaInline(n.filhos, ctx)).replace(/\n/g, ' ');
    return t ? ['#'.repeat(nivel) + ' ' + t] : [];
  }
  if (tag === 'p') {
    const t = paragrafo(juntaInline(n.filhos, ctx));
    if (!t) return [];
    return [tem(n, 'rotulo') ? `*${t}*` : t];
  }
  if (tag === 'blockquote') {
    const partes = [];
    for (const f of n.filhos) {
      if (!f.tag || pula(f)) continue;
      if (f.tag === 'footer') partes.push('— ' + paragrafo(juntaInline(f.filhos, ctx)));
      else partes.push(...bloco(f, ctx));
    }
    return [partes.join('\n\n').split('\n').map(l => l ? '> ' + l : '>').join('\n')];
  }
  if (tag === 'ul' || tag === 'ol') {
    const itens = n.filhos.filter(f => f.tag === 'li' && !pula(f)).map(li => blocos(li, ctx).join(' ').replace(/\n/g, ' '));
    if (!itens.length) return [];
    if (tem(n, 'fichinha')) return [(n.attrs['aria-label'] ? `**${n.attrs['aria-label']}:** ` : '') + itens.join(', ') + '.'];
    return [itens.map((t, i) => (tag === 'ol' ? `${i + 1}. ` : '- ') + t).join('\n')];
  }
  if (tag === 'dl') {
    const linhas = [];
    let termo = null;
    for (const f of todos(n, f => f.tag === 'dt' || f.tag === 'dd')) {
      const t = paragrafo(juntaInline(f.filhos, ctx)).replace(/\n/g, ' ');
      if (f.tag === 'dt') termo = t;
      else linhas.push(termo ? `- **${termo}:** ${t}` : `- ${t}`);
    }
    return linhas.length ? [linhas.join('\n')] : [];
  }
  if (tag === 'table') {
    const linhas = todos(n, f => f.tag === 'tr').map(tr => {
      const cel = tr.filhos.filter(c => c.tag === 'td' || c.tag === 'th').map(c => paragrafo(juntaInline(c.filhos, ctx)).replace(/\n/g, ' '));
      return cel.length > 1 ? `- **${cel[0]}:** ${cel.slice(1).join(' · ')}` : `- ${cel[0] || ''}`;
    });
    return linhas.length ? [linhas.join('\n')] : [];
  }
  if (tag === 'details') {
    const resumo = primeiro(n, f => f.tag === 'summary');
    const resto = blocos({ filhos: n.filhos.filter(f => f !== resumo) }, ctx);
    return [`**${limpo(texto(resumo || { texto: '' }))}**`, ...resto];
  }
  if (tag === 'figure') {
    const imgs = todos(n, f => f.tag === 'img' && !pula(f)).map(img => {
      const botao = todos(n, f => f.tag === 'button' && todos(f, g => g === img).length)[0];
      return imagem(img, { ...ctx, grande: botao?.attrs['data-grande'] || null });
    }).filter(Boolean);
    const leg = primeiro(n, f => f.tag === 'figcaption');
    const legenda = leg ? paragrafo(juntaInline(leg.filhos, ctx)) : '';
    const altDaPrimeira = imgs[0]?.match(/^!\[(.*)\]/)?.[1] || '';
    const linhas = [...imgs];
    if (legenda && legenda !== altDaPrimeira) linhas.push(`*${legenda}*`);
    return linhas.length ? [linhas.join('\n')] : [];
  }
  if (tag === 'a' && tem(n, 'cartao-link')) {
    const titulo = primeiro(n, f => /^h[1-6]$/.test(f.tag));
    const desc = primeiro(n, f => f.tag === 'p');
    const url = absoluto(n.attrs.href, ctx);
    return [`- [${limpo(texto(titulo || n))}](${url})` + (desc ? ': ' + limpo(texto(desc)) : '')];
  }
  if (tem(n, 'manchetes')) {
    const itens = todos(n, f => f.tag === 'span' && !tem(f, 'jornal') && !tem(f, 'manchetes-trilho')).map(f => limpo(texto(f)));
    return [`**${n.attrs['aria-label'] || 'Manchetes'}:** ` + itens.join(' · ') + '.'];
  }
  if (n.attrs.role === 'tabpanel') {
    const rotulo = ctx.ids[n.attrs['aria-labelledby']];
    return [...(rotulo ? [`**${limpo(texto(rotulo))}**`] : []), ...blocos(n, ctx)];
  }
  if (tem(n, 'ficha')) return blocos(n, { ...ctx, nivel: ctx.nivel + 1 });
  return blocos(n, ctx);
}

// ---- páginas
const lerPagina = (dir, arq) => fs.readFileSync(path.join(dir, arq), 'utf8');

export function paginaEmMarkdown(arq, html) {
  const p = PAGINAS[arq];
  const raiz = lerHtml(html);
  const main = primeiro(raiz, n => n.tag === 'main') || raiz;
  const corpo = blocos(main, criaContexto(arq, raiz)).join('\n\n');
  return [
    `# ${p.titulo}`,
    `> ${p.descricao}`,
    `Página: ${urlDaPagina(arq)}  \nJogar grátis no navegador: ${JOGO}`,
    corpo,
    '---',
    `*${AVISO}*`,
  ].join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

// llms.txt: o texto fixo de tools/site/llms.md com {{jogo}}, {{endereco}}, {{autor}}, {{paginas}}
export function llmsTxt() {
  const lista = indexadas().map(([arq, p]) => `- [${p.nome}](${ENDERECO}${arq}.md): ${p.descricao}`).join('\n');
  const v = { jogo: JOGO, endereco: ENDERECO, autor: AUTOR, paginas: lista, aviso: AVISO };
  return fs.readFileSync(path.join(AQUI, 'llms.md'), 'utf8').replace(/\{\{([a-z]+)\}\}/g, (m, k) => v[k] ?? m).trimEnd() + '\n';
}

// tudo que é gerado a partir das páginas de dir (site/): { 'historia.html.md': '...', 'llms.txt': '...', ... }
export function derivados(dir) {
  const arquivos = {};
  const paginas = [];
  for (const [arq] of indexadas()) {
    if (!fs.existsSync(path.join(dir, arq))) continue;
    const md = paginaEmMarkdown(arq, lerPagina(dir, arq));
    arquivos[arq + '.md'] = md;
    paginas.push(md);
  }
  const llms = llmsTxt();
  arquivos['llms.txt'] = llms;
  // llms-full.txt: o resumo (sem a lista de links) seguido do texto de todas as páginas
  const resumo = llms.split(/\n## /)[0].trimEnd();
  arquivos['llms-full.txt'] = [resumo, ...paginas.map(md => md.trimEnd())].join('\n\n---\n\n') + '\n';
  return arquivos;
}
