// Dados do site usados por tools/site.mjs (npm run site) e pelo build (vite.config.js):
// endereços, autor e, para cada página, o título, a descrição e a imagem que buscadores,
// redes sociais e LLMs veem.
//   nome      como a página aparece nas migalhas (JSON-LD) e no llms.txt
//   imagem    captura de img/capturas/ (1920x1080) usada na prévia das redes sociais
//   alt       descrição dessa imagem
//   tipo      tipo schema.org da página (WebPage, FAQPage, ImageGallery, CollectionPage)
//   indexar   false: fica fora dos buscadores (noindex), do sitemap e do llms.txt
export const JOGO = 'https://fabianokunst.github.io/Teewald-3d/';
export const ENDERECO = JOGO + 'site/';
export const AUTOR = 'Fabiano Kunst';

// Códigos de verificação do Google Search Console e do Bing Webmaster Tools (a parte do
// content="..." da meta tag que eles pedem). Vazio: a meta tag não é gerada.
export const VERIFICACAO = { google: '', bing: '' };

export const PAGINAS = {
  'index.html': {
    nome: 'Início',
    titulo: 'Teewald — survival horror com cara de PS1',
    social: 'Teewald — alguma coisa anda no mato',
    descricao: 'Survival horror em terceira pessoa com visual de PlayStation 1, numa cidadezinha de colonos alemães na serra gaúcha. Grátis, no navegador.',
    imagem: 'capa',
    alt: 'A Igreja Matriz de Teewald ao anoitecer, com neblina',
    tipo: 'WebPage',
  },
  'historia.html': {
    nome: 'A história',
    titulo: 'A história — Teewald',
    descricao: 'Teewald, o mato do chá: uma colônia de imigrantes do Hunsrück no Vale do Herval, um outubro de neblina e criação aparecendo morta sem uma gota de sangue.',
    imagem: 'enxaimel',
    alt: 'O Museu de Teewald, uma casa de enxaimel',
    tipo: 'WebPage',
  },
  'cidade.html': {
    nome: 'A cidade',
    titulo: 'A cidade — Teewald',
    descricao: 'Os lugares de Teewald: o calçadão do Rio Cadeia, a Praça 10 de Abril, a Igreja Matriz, o pavilhão da Kartoffelfest, as casas de enxaimel e o mato. Uma cidade feita de mapas de verdade.',
    imagem: 'calcadao',
    alt: 'O calçadão na beira do Rio Cadeia',
    tipo: 'WebPage',
  },
  'personagens.html': {
    nome: 'Personagens',
    titulo: 'Personagens — Teewald',
    descricao: 'Os personagens de Teewald: o forasteiro e os 24 moradores com fala, com retrato, altura, roupa e jeito de cada um, tirados dos modelos do jogo.',
    imagem: 'valdir',
    alt: 'Seu Valdir sentado no banco da praça com o chimarrão',
    tipo: 'CollectionPage',
  },
  'jogo.html': {
    nome: 'O jogo',
    titulo: 'O jogo — Teewald',
    descricao: 'Como se joga Teewald: combate, inventário, arquivos, estilos visuais 3D LIMPO e PS1 RETRÔ, clima, controles no teclado, no controle e no toque, e perguntas frequentes.',
    imagem: 'mira',
    alt: 'O protagonista mirando a pistola na neblina',
    tipo: 'FAQPage',
  },
  'galeria.html': {
    nome: 'Galeria',
    titulo: 'Galeria — Teewald',
    descricao: 'Capturas de Teewald tiradas do próprio jogo: a Igreja Matriz, a praça à noite, o calçadão do Rio Cadeia, a Kartoffelfest, chuva, neblina e o visual PS1 RETRÔ.',
    imagem: 'praca-noite',
    alt: 'A Praça 10 de Abril à noite, com os lampiões acesos',
    tipo: 'ImageGallery',
  },
  'design.html': {
    nome: 'Sistema visual',
    titulo: 'Sistema visual — Teewald',
    descricao: 'O sistema visual do site de Teewald: cores, letras, espaços, movimento e componentes.',
    imagem: 'mapa',
    alt: 'Teewald vista do alto',
    tipo: 'WebPage',
    indexar: false, // guia interno de estilo: não interessa a quem procura o jogo
  },
};

export const urlDaPagina = arq => ENDERECO + (arq === 'index.html' ? '' : arq);
export const indexadas = () => Object.entries(PAGINAS).filter(([, p]) => p.indexar !== false);
