// npm run traduzir — mantém os dicionários de tradução (src/i18n/en.js, es.js, de.js).
//
// Lê todo o src/ com o analisador do Vite (rolldown), acha os textos que aparecem na
// tela e atualiza cada dicionário: guarda o que já foi traduzido, acrescenta o que é
// novo (com '') e tira o que sumiu do código. No fim mostra quanto falta.
//
//   npm run traduzir                      atualiza e mostra o resumo
//   npm run traduzir -- --lista en        mostra os textos que faltam em inglês
//   npm run traduzir -- --exportar pasta  separa o que falta em lotes (pasta/en-01.json...)
//   npm run traduzir -- --importar pasta  junta as traduções dos lotes (pasta/en-01.trad.json)
//   npm run traduzir -- --vistos a.json   acrescenta textos achados na tela (lista do npm run teste)
//
// Lote: { lang, itens: { "1": { arq, pt } } }. Tradução do lote: { "1": "texto traduzido" }.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src'), DIR = path.join(SRC, 'i18n');
const LANGS = { en: 'ENGLISH', es: 'ESPAÑOL', de: 'DEUTSCH' };
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const rel = f => path.relative(root, f).replace(/\\/g, '/');

// ---------- 1. os textos do código ----------
function files(d) {
  return fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return p === DIR ? [] : files(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const KEYS = /^(Key[A-Z]|Digit\d|Arrow[A-Z]|Numpad|Shift|Control|Alt|Meta|Escape|Enter|Space|Tab|Backspace|Pause|F\d{1,2}$)/;
// é texto de tela? (fora ids, caminhos, cores, fontes, código de shader...)
function isText(key) {
  const bare = key.replace(/\{\d+\}/g, ' '), t = key.trim();
  if (!/\p{L}{2}/u.test(bare) || (bare.match(/\p{L}/gu) || []).length < 3 && /\{\d+\}/.test(key)) return false;
  if (/^[a-z][\w$]*$/.test(t)) return false;                         // id, camelCase
  if (/_/.test(t) && !/\s/.test(t)) return false;                    // CONSTANTE_ID, snake_case
  if (/^[A-Za-z]\w*[a-z][A-Z]\w*$/.test(t)) return false;            // PascalCase, camelCase
  // uma palavra só com ':', '{' ou '!' no meio: id de peça, textura, ação ('int:f:clock', 'ombro.{1}')
  if (!/\s/.test(t) && /[:{}!]/.test(t.replace(/[.!?…:]+$/, '')) && t !== t.toUpperCase()) return false;
  if (KEYS.test(t) || t === 'Arrow') return false;
  if (/\.(png|jpe?g|webp|gif|glb|gltf|json|m?js|bin|mp3|ogg|wav|svg|html|css|txt)$/i.test(t)) return false;
  if (/^(https?:|data:|blob:|\/\/|#|rgba?\(|hsla?\(|url\(|env\(|\(\w+:)/.test(t)) return false;
  if (/,\s*(serif|sans-serif|monospace|cursive)$/.test(t)) return false;     // fonte
  if (/^[a-z0-9]+([-/.][a-z0-9]+)+$/i.test(t)) return false;           // caminho, kebab-case
  if (/\d(px|em|rem|vh|vw|%)\b|\bpx\b/.test(bare)) return false;       // fonte, css
  if (/[;{}]|=>|\bvec[234]\b|\bgl_|\buniform\b|\bvarying\b|#include|\bvoid\b|\bfloat\b/.test(bare)) return false;
  if (/^(source-over|multiply|lighter|screen|destination-\w+|evenodd|anonymous|use-credentials)$/.test(t)) return false;
  return true;
}

function extract() {
  const found = new Map();   // chave → arquivo onde aparece primeiro
  for (const f of files(SRC)) {
    const code = fs.readFileSync(f, 'utf8'), file = rel(f);
    let ast;
    try { ast = parseAst(code, { sourceType: 'module' }); } catch (e) { console.warn(`! não consegui ler ${file}: ${e.message}`); continue; }
    const add = key => { if (isText(key) && !found.has(key)) found.set(key, file); };
    const concat = n => {
      const ops = [], flat = x => (x.type === 'BinaryExpression' && x.operator === '+' ? (flat(x.left), flat(x.right)) : ops.push(x));
      flat(n);
      let key = '', k = 0;
      for (const op of ops) {
        if (op.type === 'Literal' && (typeof op.value === 'string' || typeof op.value === 'number')) key += op.value;
        else if (op.type === 'TemplateLiteral') op.quasis.forEach((q, i) => { key += q.value.cooked ?? q.value.raw; if (i < op.expressions.length) key += '{' + ++k + '}'; });
        else key += '{' + ++k + '}';
      }
      add(key);
      for (const op of ops) {
        if (op.type === 'TemplateLiteral') op.expressions.forEach(walk);
        else if (op.type !== 'Literal') walk(op);
      }
    };
    const kids = n => { for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c)); else if (v && typeof v.type === 'string') walk(v); } };
    function walk(n) {
      switch (n.type) {
        case 'ImportDeclaration': case 'ExportAllDeclaration': case 'ImportExpression': return;
        case 'ExportNamedDeclaration': if (n.declaration) walk(n.declaration); return;
        case 'Literal': if (typeof n.value === 'string') add(n.value); return;
        case 'TemplateLiteral': {
          let key = '';
          n.quasis.forEach((q, i) => { key += q.value.cooked ?? q.value.raw; if (i < n.expressions.length) key += '{' + (i + 1) + '}'; });
          add(key); n.expressions.forEach(walk); return;
        }
        case 'TaggedTemplateExpression': return;
        case 'BinaryExpression':
          if (n.operator === '+' && hasStr(n)) { concat(n); return; }
          break;
        // a chave de um objeto ou método não é texto de tela
        case 'Property': case 'PropertyDefinition': case 'MethodDefinition':
          if (n.computed) walk(n.key);
          if (n.value) walk(n.value);
          return;
        case 'MemberExpression':
          walk(n.object); if (n.computed && n.property.type !== 'Literal') walk(n.property); return;
        case 'CallExpression': {
          const c = n.callee;
          if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'console') return;
          break;
        }
        case 'NewExpression': if (n.callee.type === 'Identifier' && /Error$|^RegExp$|^Worker$|^URL$/.test(n.callee.name)) return; break;
      }
      kids(n);
    }
    const hasStr = n => (n.type === 'BinaryExpression' && n.operator === '+' ? hasStr(n.left) || hasStr(n.right) : (n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral');
    walk(ast);
  }
  return found;
}

// ---------- 2. os dicionários ----------
const dictFile = l => path.join(DIR, l + '.js');
async function readDict(l) {
  const f = dictFile(l);
  if (!fs.existsSync(f)) return { main: {}, extra: {} };
  const m = await import(pathToFileURL(f).href + '?v=' + Date.now());
  return { main: m.default || {}, extra: m.extra || {} };
}
const LS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
const q = s => (s == null ? 'null' : "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(LS, c => '\\u' + c.charCodeAt(0).toString(16)) + "'");

function writeDict(l, found, main, extra) {
  const out = [
    `// Tradução: ${LANGS[l]}. Atualizado por \`npm run traduzir\` (tools/traduzir.mjs).`,
    '// Chave = o texto em português como está no código. Valor: a tradução; \'\' = falta',
    '// traduzir (aparece em português); null = não é texto do jogo (fica como está).',
    '// {1}, {2}... = pedaços que o código encaixa (números, nomes); podem mudar de ordem.',
    '// Pode editar as traduções à vontade: o npm run traduzir guarda o que já foi traduzido.',
    '// Nomes de pessoas e lugares e frases em hunsrik/alemão ficam como estão.',
    'export default {',
  ];
  let last = null;
  for (const [k, file] of found) {
    if (file !== last) { out.push(`  // ── ${file}`); last = file; }
    out.push(`  ${q(k)}: ${q(main[k] === undefined ? '' : main[k])},`);
  }
  out.push('};', '', '// textos que só aparecem montados na tela (achados pelo npm run teste); guardados à mão', 'export const extra = {');
  for (const [k, v] of Object.entries(extra)) if (!found.has(k)) out.push(`  ${q(k)}: ${q(v)},`);
  out.push('};', '');
  fs.writeFileSync(dictFile(l), out.join('\n'));
}

// ---------- 3. rodando ----------
const found = extract();
const dicts = {};
for (const l of Object.keys(LANGS)) dicts[l] = await readDict(l);

// --vistos lista.json: textos que o npm run teste viu na tela sem tradução
const vistos = arg('--vistos');
if (vistos) {
  const list = JSON.parse(fs.readFileSync(vistos, 'utf8'));
  let n = 0;
  for (const l of Object.keys(LANGS)) for (const s of list[l] || list) {
    if (typeof s !== 'string' || found.has(s) || s in dicts[l].extra) continue;
    dicts[l].extra[s] = ''; n++;
  }
  console.log(`+ ${n} textos vistos na tela acrescentados em "extra"`);
}

// --importar pasta: lotes traduzidos
const imp = arg('--importar');
if (imp) {
  let n = 0, lost = 0;
  for (const f of fs.readdirSync(imp).filter(f => f.endsWith('.trad.json'))) {
    const src = JSON.parse(fs.readFileSync(path.join(imp, f.replace('.trad.json', '.json')), 'utf8'));
    const tr = JSON.parse(fs.readFileSync(path.join(imp, f), 'utf8')), D = dicts[src.lang];
    for (const [id, v] of Object.entries(tr)) {
      const it = src.itens[id];
      if (!it || (typeof v !== 'string' && v !== null)) { lost++; continue; }
      if (found.has(it.pt)) D.main[it.pt] = v; else D.extra[it.pt] = v;
      n++;
    }
  }
  console.log(`+ ${n} traduções importadas${lost ? `, ${lost} ignoradas (id desconhecido)` : ''}`);
}

for (const l of Object.keys(LANGS)) writeDict(l, found, dicts[l].main, dicts[l].extra);

// resumo
const total = found.size;
console.log(`\n${total} textos no código (${new Set(found.values()).size} arquivos)\n`);
const pend = {};
for (const l of Object.keys(LANGS)) {
  const { main, extra } = dicts[l];
  const miss = [...found.keys()].filter(k => !main[k] && main[k] !== null);
  const missX = Object.keys(extra).filter(k => !found.has(k) && extra[k] === '');
  pend[l] = [...miss.map(k => [k, found.get(k)]), ...missX.map(k => [k, 'extra (visto na tela)'])];
  const gone = Object.keys(main).filter(k => !found.has(k)).length;
  console.log(`  ${LANGS[l].padEnd(9)} ${String(total - miss.length).padStart(5)} traduzidos · ${String(pend[l].length).padStart(5)} faltando${gone ? ` · ${gone} saíram do código` : ''}`);
}

const lista = arg('--lista');
if (lista && pend[lista]) {
  console.log(`\nfaltando em ${LANGS[lista]}:`);
  let last = null;
  for (const [k, f] of pend[lista]) { if (f !== last) { console.log(`  ${f}`); last = f; } console.log('    ' + q(k)); }
}

// --exportar pasta [--tamanho 9000]: lotes do que falta, na ordem dos arquivos
const exp = arg('--exportar');
if (exp) {
  fs.mkdirSync(exp, { recursive: true });
  const max = +(arg('--tamanho') || 9000);
  let files = 0;
  for (const l of Object.keys(LANGS)) {
    let lot = null, size = 0, n = 0, id = 0;
    const flush = () => { if (lot && Object.keys(lot.itens).length) { fs.writeFileSync(path.join(exp, `${l}-${String(++n).padStart(2, '0')}.json`), JSON.stringify(lot, null, 1)); files++; } lot = { lang: l, itens: {} }; size = 0; };
    flush();
    for (const [k, f] of pend[l]) {
      if (size > max) flush();
      lot.itens[++id] = { arq: f, pt: k }; size += k.length;
    }
    flush();
  }
  console.log(`\n${files} lotes em ${exp}`);
}
