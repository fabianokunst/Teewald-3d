// Tradução do site, no mesmo espírito da do jogo (src/i18n): o texto fica escrito em português
// nas páginas de site/, e npm run site gera site/en/, site/es/ e site/de/ trocando cada trecho
// pelo que está no dicionário tools/site/i18n/<idioma>.json (chave = o trecho em português).
//
// Trecho = o conteúdo de cada elemento que tem texto próprio (um <p>, um <h2>, um <li>, um <td>,
// um <figcaption>...), com as marcas de dentro (<em>, <strong>, <a>, <span class="tecla">) e os
// espaços resumidos a um só. Também viram trechos os atributos alt, title, aria-label,
// data-legenda e placeholder. O que está dentro de translate="no" fica como está, e trecho sem
// letra nenhuma (números, ▶, ?) não é traduzido.
// Sem tradução (''), o trecho aparece em português e o npm run site avisa quantos faltam.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRADUZIDOS, IDIOMAS } from './idiomas.mjs';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n');
const ATRIBUTOS = ['alt', 'title', 'aria-label', 'data-legenda', 'placeholder'];
const VAZIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const LEIA = 'Tradução do site (npm run site). Chave = o trecho em português, como está no HTML de site/; valor = a tradução; "" = falta (aparece em português). Mantenha as marcas HTML (<em>, <strong>, <a href>, <span class>) com os mesmos atributos e siga src/i18n/GUIA.md. "antigos" guarda traduções de trechos que mudaram ou saíram do site, para consulta.';

export const normaliza = s => s.replace(/\s+/g, ' ').trim();
const temLetra = s => /\p{L}/u.test(s.replace(/<[^>]*>/g, '').replace(/&[a-z#\d]+;/gi, ''));

// ---- dicionários
export function carrega(idioma) {
  const arq = path.join(PASTA, idioma + '.json');
  if (!fs.existsSync(arq)) return { textos: {}, antigos: {} };
  const d = JSON.parse(fs.readFileSync(arq, 'utf8'));
  return { textos: d.textos || {}, antigos: d.antigos || {} };
}

// tradutor de um idioma: t(trecho) devolve a tradução ou null; guarda a ordem das chaves usadas
export function tradutor(idioma) {
  const dic = carrega(idioma);
  const usadas = new Map();
  return {
    idioma, dic, usadas,
    t(trecho) {
      const k = normaliza(trecho);
      if (!k) return null;
      if (!usadas.has(k)) usadas.set(k, true);
      const v = dic.textos[k];
      return typeof v === 'string' && v !== '' ? v : null;
    },
    // texto que só se mostra se houver tradução (títulos, descrições): cai no português
    tt(trecho) { return this.t(trecho) ?? trecho; },
    faltam() { return [...usadas.keys()].filter(k => !dic.textos[k]); },
  };
}

// grava o dicionário: as chaves usadas agora, na ordem em que apareceram, com o que já havia;
// o que saiu do site vai para "antigos" (se tinha tradução)
export function grava(tr) {
  const textos = {}, antigos = { ...tr.dic.antigos };
  for (const k of tr.usadas.keys()) {
    textos[k] = tr.dic.textos[k] || '';
    delete antigos[k];
  }
  for (const [k, v] of Object.entries(tr.dic.textos)) if (!(k in textos) && v) antigos[k] = v;
  // mesmos trechos na mesma ordem: não regrava (quem estiver traduzindo não perde nada)
  const iguais = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
  if (iguais(Object.keys(textos), Object.keys(tr.dic.textos)) && iguais(Object.keys(antigos), Object.keys(tr.dic.antigos))) return;
  fs.mkdirSync(PASTA, { recursive: true });
  const arq = path.join(PASTA, tr.idioma + '.json');
  const json = JSON.stringify({ _leia: LEIA, idioma: IDIOMAS[tr.idioma].nome, textos, antigos }, null, 2) + '\n';
  if (!fs.existsSync(arq) || fs.readFileSync(arq, 'utf8') !== json) fs.writeFileSync(arq, json);
}

// ---- trechos de uma página: posições no HTML
const RE = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</gi;
const RE_ATRIB = /([^\s"'=\/]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;

export function trechos(html) {
  const ini = html.search(/<body[\s>]/i), fim = html.lastIndexOf('</body>');
  const pilha = [], unidades = [], atribs = [];
  const fecha = (el, pos) => {
    el.fim = pos;
    if (el.texto && !el.nao) unidades.push({ ini: el.ini, fim: el.fim });
  };
  RE.lastIndex = ini < 0 ? 0 : ini;
  let m;
  while ((m = RE.exec(html)) && m.index < fim) {
    const topo = pilha[pilha.length - 1];
    if (m[0].startsWith('<!--') || m[1]) continue;
    if (m[2]) {
      const tag = m[2].toLowerCase();
      let i = pilha.length - 1;
      while (i >= 0 && pilha[i].tag !== tag) i--;
      if (i < 0) continue;
      while (pilha.length > i) fecha(pilha.pop(), m.index);
    } else if (m[3]) {
      const tag = m[3].toLowerCase(), a = m[4];
      const nao = !!topo?.nao || /\btranslate\s*=\s*["']?no\b/i.test(a);
      const base = m.index + 1 + m[3].length;
      for (const x of a.matchAll(RE_ATRIB)) {
        if (!ATRIBUTOS.includes(x[1].toLowerCase())) continue;
        const valor = x[3] ?? x[4];
        if (nao || !temLetra(valor)) continue;
        const pos = base + x.index + x[1].length + x[2].length + 1;
        atribs.push({ ini: pos, fim: pos + valor.length, atrib: true });
      }
      if (!VAZIOS.has(tag) && !/\/\s*$/.test(a)) pilha.push({ tag, ini: m.index + m[0].length, texto: false, nao });
    } else if (topo && /\S/.test(m[0])) topo.texto = true;
  }
  // um trecho dentro de outro já vai junto com ele
  unidades.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const fora = [];
  for (const u of unidades) {
    if (fora.length && u.ini < fora[fora.length - 1].fim) continue;
    if (temLetra(html.slice(u.ini, u.fim))) fora.push(u);
  }
  const dentro = p => fora.some(u => p >= u.ini && p < u.fim);
  return [...fora, ...atribs.filter(a => !dentro(a.ini))].sort((a, b) => a.ini - b.ini);
}

// troca os trechos do <body> pelas traduções (o que falta fica em português)
export function traduzHtml(html, tr) {
  const lista = trechos(html);
  let s = '', ultimo = 0;
  for (const { ini, fim, atrib } of lista) {
    const original = html.slice(ini, fim);
    let v = tr.t(original);
    if (v == null) continue;
    if (atrib) v = v.replace(/"/g, '&quot;');
    const antes = original.match(/^\s*/)[0], depois = original.match(/\s*$/)[0];
    s += html.slice(ultimo, ini) + antes + v + depois;
    ultimo = fim;
  }
  return s + html.slice(ultimo);
}

// ---- conferência de um dicionário: as marcas HTML da tradução têm de ser as mesmas do original
const marcas = s => (s.match(/<\/?[a-zA-Z][^>]*>/g) || []).map(t => t.replace(/\s+/g, ' ')).sort();
export function confere(idioma) {
  const { textos } = carrega(idioma);
  const problemas = [];
  for (const [k, v] of Object.entries(textos)) {
    if (!v) continue;
    if (marcas(k).join('|') !== marcas(v).join('|')) problemas.push(`marcas diferentes: ${k}\n   → ${v}`);
  }
  return problemas;
}

// ---- endereços numa página traduzida (site/<idioma>/), que fica uma pasta abaixo do português
//   página traduzida (x.html, x.html.md)      fica igual: aponta para a do mesmo idioma
//   página só em português (design.html)      ../design.html
//   imagem com versão do idioma               ../img/documentos/<idioma>/x.png
//   o resto (css, js, img)                    ../
//   o jogo                                     ganha ?lang=<idioma> e abre no idioma do site
// Links com hreflang (seletor de idioma) já saem prontos e não mudam.
export function reescreveLinks(html, idioma, { traduzida, versaoDoIdioma, jogo }) {
  return html.replace(/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (tag, nome, attrs) => {
    if (/\bhreflang\s*=/.test(attrs)) return tag;
    const novos = attrs.replace(/(\s(?:href|src|data-grande)\s*=\s*")([^"]*)"/g, (m, a, url) => {
      if (url === jogo) return `${a}${jogo}?lang=${idioma}"`;
      if (!url || /^(#|[a-z][a-z\d+.-]*:|\/)/i.test(url)) return m;
      const corte = url.search(/[#?]/);
      const caminho = corte < 0 ? url : url.slice(0, corte), resto = corte < 0 ? '' : url.slice(corte);
      const pagina = caminho.replace(/\.md$/, '');
      if (/\.html$/.test(pagina)) return traduzida(pagina) ? m : `${a}../${url}"`;
      const proprio = versaoDoIdioma(caminho, idioma);
      return `${a}../${proprio || caminho}${resto}"`;
    });
    return `<${nome}${novos}>`;
  });
}

export { TRADUZIDOS };
