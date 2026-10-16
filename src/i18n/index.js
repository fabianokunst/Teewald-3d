// Idiomas do jogo. O texto continua escrito em português no código; na hora de desenhar
// (ui/overlay.js: textSprite e drawText) ele passa por tr(), que procura a tradução no
// dicionário do idioma escolhido (src/i18n/en.js, es.js, de.js). Sem tradução, fica o
// português. A lógica do jogo nunca vê o texto traduzido.
//
// Os dicionários são gerados e conferidos por `npm run traduzir` (tools/traduzir.mjs):
// a chave é o texto em português como está no código, '' = falta traduzir, null = não
// é texto do jogo. Texto montado no código vira chave com {1}, {2}...: 'CAPÍTULO {1}'.

export const LANGS = [
  { id: 'pt', name: 'PORTUGUÊS' },
  { id: 'en', name: 'ENGLISH' },
  { id: 'es', name: 'ESPAÑOL' },
  { id: 'de', name: 'DEUTSCH' },
];
const LOAD = { en: () => import('./en.js'), es: () => import('./es.js'), de: () => import('./de.js') };

let lang = 'pt';
let exact = new Map();   // texto → tradução
let upper = new Map();   // TEXTO EM MAIÚSCULAS → tradução (o código faz .toUpperCase() em títulos e nomes)
let pats = [];           // textos montados ('CAPÍTULO {1}')
let outs = new Set();    // traduções: texto que já está traduzido não passa de novo
const memo = new Map();
// textos que apareceram na tela sem tradução (o npm run teste mostra no fim)
export const missing = new Set();

export const getLang = () => lang;

// avisados quando o idioma muda (as texturas com texto do mundo 3D se repintam: engine/textures.js)
const changed = new Set();
export const onLangChange = fn => changed.add(fn);

// primeira vez: o idioma do navegador (o Chrome dos testes, sem janela, fica em português)
export function detectLang() {
  if (navigator.webdriver) return 'pt';
  for (const l of navigator.languages?.length ? navigator.languages : [navigator.language || '']) {
    const id = String(l).slice(0, 2).toLowerCase();
    if (id === 'pt' || LOAD[id]) return id;
  }
  return 'en';
}

export async function setLang(id) {
  let d = null;
  if (id !== 'pt' && LOAD[id]) {
    try { const m = await LOAD[id](); d = { ...m.default, ...m.extra }; } catch (e) { id = 'pt'; }
  } else id = 'pt';
  build(d);
  lang = id;
  memo.clear(); missing.clear();
  for (const fn of changed) fn(id);
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const letters = s => (s.match(/\p{L}/gu) || []).length;
const isUpper = s => s === s.toUpperCase() && s !== s.toLowerCase();

function build(d) {
  exact = new Map(); upper = new Map(); pats = []; outs = new Set(LANGS.map(l => l.name));
  for (const [k, v] of Object.entries(d || {})) {
    if (typeof v !== 'string' || !v) continue;
    outs.add(v);
    if (/\{\d+\}/.test(k)) { const p = compile(k, v); if (p) pats.push(p); continue; }
    exact.set(k, v);
    const ku = k.toUpperCase();
    if (ku !== k && !upper.has(ku)) upper.set(ku, v);
  }
  // os mais específicos primeiro
  pats.sort((a, b) => b.lit - a.lit);
}

// 'CRIATURAS {1}   QUEDAS {2}' → regex; o pedaço fixo mais longo serve de filtro rápido
function compile(k, v) {
  const parts = k.split(/\{(\d+)\}/), order = [];
  // a mesma regex em maiúsculas, para o texto que o código passou por .toUpperCase()
  let re = '', reU = '', lit = 0, chunk = '';
  parts.forEach((p, i) => {
    if (i % 2) { re += '(.*?)'; reU += '(.*?)'; order.push(+p); return; }
    re += esc(p); reU += esc(p.toUpperCase()); lit += letters(p);
    if (p.length > chunk.length) chunk = p;
  });
  if (lit < 3) return null;
  return { re: new RegExp('^' + re + '$', 's'), reU: new RegExp('^' + reU + '$', 's'), chunk, chunkU: chunk.toUpperCase(), order, v, lit };
}

// o valor de um {n}: número fica, palavra é traduzida se tiver tradução
function part(s) {
  if (!s || !/\p{L}{2}/u.test(s) || outs.has(s)) return s;
  const t = whole(s, 1);
  if (t == null) note(s);
  return t ?? s;
}

function whole(t, depth) {
  let v = exact.get(t);
  if (v != null) return v;
  const up = isUpper(t);
  if (up) { v = upper.get(t); if (v != null) return v.toUpperCase(); }
  if (depth > 1) return null;
  for (const p of pats) {
    let m = null, U = false;
    if (t.includes(p.chunk)) m = p.re.exec(t);
    if (!m && up && t.includes(p.chunkU)) { m = p.reU.exec(t); U = !!m; }
    if (!m) continue;
    const out = p.v.replace(/\{(\d+)\}/g, (s, n) => { const i = p.order.indexOf(+n); return i < 0 ? s : part(m[i + 1]); });
    return U ? out.toUpperCase() : out;
  }
  return null;
}

// texto juntado de pedaços ('3. A MOÇA DA FÁBRICA  [B]'): traduz cada pedaço
const SEP = /(\s{2,}|\s+·\s+|\s+[—–|]\s+|:\s+|\s*\(|\)\s*|\s*\[|\]\s*|^\d+\.\s+|\s+\/\s+|\s+-\s+|\s*×\s*)/;
function bySegments(text) {
  const parts = text.split(SEP);
  if (parts.length < 3) return null;
  let hit = false, miss = false;
  const out = parts.map((p, i) => {
    if (i % 2 || !/\p{L}{2}/u.test(p)) return p;
    const t = whole(p, 1);
    if (t != null) { hit = true; return t; }
    miss = true;
    return p;
  });
  return hit ? { s: out.join(''), miss } : null;
}

function note(text) {
  // endereço de site não se traduz
  if (missing.size < 3000 && /\p{L}{2}/u.test(text) && !/^[\w-]+(\.[\w-]+)+$/.test(text)) missing.add(text);
}

function find(text) {
  if (outs.has(text)) return text;
  const w = whole(text, 0);
  if (w != null) return w;
  // espaços nas pontas (alinhamento feito com espaço)
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (m[1] || m[3]) { const w2 = whole(m[2], 0); if (w2 != null) return m[1] + w2 + m[3]; }
  const s = bySegments(text);
  if (s) { if (s.miss) note(text); return s.s; }
  note(text);
  return text;
}

// a tradução do texto no idioma escolhido (ou o próprio texto)
export function tr(text) {
  if (lang === 'pt' || typeof text !== 'string' || !text) return text;
  let r = memo.get(text);
  if (r !== undefined) return r;
  r = find(text);
  if (memo.size > 5000) memo.clear();
  memo.set(text, r);
  return r;
}
