// Monta as partes que se repetem nas páginas do site (site/*.html) a partir de tools/site/:
//   npm run site
// Cada página tem os marcadores <!-- cabeca:inicio --> ... <!-- cabeca:fim --> (dentro do
// <head>), <!-- topo:... --> e <!-- rodape:... -->; só o que está entre eles é reescrito.
// O título, a descrição e a imagem de cada página (buscadores e redes sociais) ficam em
// PAGINAS; o link da página atual no menu ganha aria-current="page".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const PARTES = path.join(ROOT, 'tools', 'site');
const JOGO = 'https://fabianokunst.github.io/Teewald-3d/';
const ENDERECO = JOGO + 'site/';

const PAGINAS = {
  'index.html': {
    titulo: 'Teewald — survival horror com cara de PS1',
    social: 'Teewald — alguma coisa anda no mato',
    descricao: 'Survival horror em terceira pessoa com visual de PlayStation 1, numa cidadezinha de colonos alemães na serra gaúcha. Grátis, no navegador.',
    imagem: 'capa',
  },
  'historia.html': {
    titulo: 'A história — Teewald',
    descricao: 'Teewald, o mato do chá: uma colônia de imigrantes do Hunsrück no Vale do Herval, um outubro de neblina e criação aparecendo morta sem uma gota de sangue.',
    imagem: 'enxaimel',
  },
  'cidade.html': {
    titulo: 'A cidade — Teewald',
    descricao: 'Os lugares de Teewald: o calçadão do Rio Cadeia, a Praça 10 de Abril, a Igreja Matriz, o pavilhão da Kartoffelfest, as casas de enxaimel e o mato. Uma cidade feita de mapas de verdade.',
    imagem: 'calcadao',
  },
  'personagens.html': {
    titulo: 'Personagens — Teewald',
    descricao: 'Os personagens de Teewald: o forasteiro e os 24 moradores com fala, com retrato, altura, roupa e jeito de cada um, tirados dos modelos do jogo.',
    imagem: 'valdir',
  },
  'jogo.html': {
    titulo: 'O jogo — Teewald',
    descricao: 'Como se joga Teewald: combate, inventário, arquivos, estilos visuais 3D LIMPO e PS1 RETRÔ, clima, controles no teclado, no controle e no toque, e perguntas frequentes.',
    imagem: 'mira',
  },
  'galeria.html': {
    titulo: 'Galeria — Teewald',
    descricao: 'Capturas de Teewald tiradas do próprio jogo: a Igreja Matriz, a praça à noite, o calçadão do Rio Cadeia, a Kartoffelfest, chuva, neblina e o visual PS1 RETRÔ.',
    imagem: 'praca-noite',
  },
  'design.html': {
    titulo: 'Sistema visual — Teewald',
    descricao: 'O sistema visual do site de Teewald: cores, letras, espaços, movimento e componentes.',
    imagem: 'mapa',
  },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const parte = nome => fs.readFileSync(path.join(PARTES, nome + '.html'), 'utf8').trimEnd();
const preenche = (html, v) => html.replace(/\{\{([a-z-]+)\}\}/g, (m, k) => (k in v ? v[k] : m));

let n = 0;
for (const [arq, p] of Object.entries(PAGINAS)) {
  const caminho = path.join(SITE, arq);
  if (!fs.existsSync(caminho)) { console.warn(`falta site/${arq}`); continue; }
  let s = fs.readFileSync(caminho, 'utf8');
  const troca = (nome, html) => {
    const a = `<!-- ${nome}:inicio -->`, b = `<!-- ${nome}:fim -->`;
    const i = s.indexOf(a), j = s.indexOf(b);
    if (i < 0 || j < i) throw new Error(`site/${arq}: faltam os marcadores ${a} e ${b}`);
    s = s.slice(0, i + a.length) + '\n' + html + '\n' + s.slice(j);
  };
  const v = {
    titulo: esc(p.titulo), 'titulo-social': esc(p.social || p.titulo), descricao: esc(p.descricao),
    imagem: `${ENDERECO}img/capturas/${p.imagem}.jpg`, url: ENDERECO + (arq === 'index.html' ? '' : arq), jogo: JOGO,
  };
  troca('cabeca', preenche(parte('cabeca'), v));
  troca('topo', preenche(parte('topo'), v).replace(`<a href="${arq}">`, `<a href="${arq}" aria-current="page">`));
  troca('rodape', preenche(parte('rodape'), v));
  fs.writeFileSync(caminho, s);
  n++;
}
console.log(`site/: ${n} páginas montadas`);
