// Posts, stories e letreiros do reels (npm run social -- posts).
// Cada peça: arquivo (em social/), formato ('post' 1080x1350 ou 'story' 1080x1920), foto (de
// social/fotos/), sombra, hud e o html do texto, montado com o molde (tools/social/molde.html).
// A ordem e as legendas de cada peça estão em social/CAMPANHA.md. Nada de spoiler: só o que o
// jogador descobre logo que chega na cidade (as mesmas regras do site).

const LINK = 'fabianokunst.github.io/Teewald-3d';
const rotulo = t => `<p class="rotulo">${t}</p>`;
const regua = '<hr class="regua">';
const titulo = (t, cl = '') => `<h2 class="titulo ${cl}">${t}</h2>`;
const texto = t => `<p class="texto">${t}</p>`;
const frase = t => `<p class="frase">${t}</p>`;
const nota = t => `<p class="nota">${t}</p>`;
const alto = (h, cl = '') => `<div class="conteudo alto ${cl}">${h}</div>`;
const baixo = (h, cl = '') => `<div class="conteudo baixo ${cl}">${h}</div>`;
const meio = (h, cl = '') => `<div class="conteudo meio ${cl}">${h}</div>`;
const assina = (cl = '') => `<div class="assinatura ${cl}">Teewald</div>`;
const passa = (t = 'arraste ▸') => `<div class="passa">${t}</div>`;
const numero = (i, n) => `<div class="numero">${i}/${n}</div>`;
const papel = (img, topo, giro = '-1.5deg', largura = '900px') =>
  `<figure class="papel" style="top:${topo};--giro:${giro};--largura-papel:${largura}"><img src="/site/img/documentos/${img}.png" alt=""></figure>`;
// tela do jogo em 4:3 (com a interface), como num televisor
const tela = (foto, topo) => `<div class="tela-jogo" style="top:${topo};background-image:url('/social/fotos/${foto}.jpg')"></div>`;
const olhos = (x, y, escala = 1) => `<div class="olhos" style="left:${x}px;top:${y}px;transform:scale(${escala})"><i></i><i></i></div>`;

// cartão final dos carrosséis: chamada para jogar
const FIM = {
  formato: 'post', foto: 'mato', sombra: 'ambos', hud: true,
  html: meio(`<h1 class="logo medio">Teewald</h1>${regua}${frase('Alguma coisa anda no mato.')}
    <div style="height:56px"></div><span class="botao botao-grande"><span class="seta">▶</span> Jogar agora</span>
    ${nota('Grátis · no navegador · sem instalar nada')}${nota('link na bio')}`, 'centro'),
};

export const POSTS = [
  // 01 · capa da campanha (fixar no perfil)
  {
    arquivo: 'posts/01-capa.jpg', formato: 'post', foto: 'capa', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('Vale do Herval · RS · maio de 1997')}<h1 class="logo">Teewald</h1>${regua}${frase('Alguma coisa anda no mato.')}`)
      + baixo(`${texto('Um survival horror em terceira pessoa com cara de PlayStation 1, numa cidadezinha de colonos alemães na serra gaúcha.')}${nota('Grátis · no navegador · link na bio')}`),
  },
  // 02 · carrossel: uma cidade que existe
  {
    arquivo: 'posts/02-cidade-1.jpg', formato: 'post', foto: 'cidade', sombra: 'baixo', hud: true,
    html: baixo(`${rotulo('Santa Maria do Herval · RS')}${titulo('Uma cidade que existe.', 'grande')}${texto('Ruas, rio, praça e morros tirados de mapas de verdade, com cerca de 600 construções nos contornos reais.')}`) + passa(),
  },
  {
    arquivo: 'posts/02-cidade-2.jpg', formato: 'post', foto: 'igreja', sombra: 'baixo',
    html: baixo(`${rotulo('Igreja Matriz')}${titulo('A torre no lugar dela.')}${texto('A fachada virada para oeste, a nave ao longo da Rua 12 de Maio e o cemitério nos fundos, como na cidade.')}`) + numero(2, 7),
  },
  {
    arquivo: 'posts/02-cidade-3.jpg', formato: 'post', foto: 'igreja-dentro', sombra: 'baixo',
    html: baixo(`${rotulo('Igreja Matriz · por dentro')}${titulo('Pode entrar.')}${texto('A nave, o coro e a sacristia, com bancos, vitrais e o altar.')}`) + numero(3, 7),
  },
  {
    arquivo: 'posts/02-cidade-4.jpg', formato: 'post', foto: 'praca', sombra: 'baixo',
    html: baixo(`${rotulo('Praça 10 de Abril')}${titulo('A praça, o chafariz e o mural.')}${texto('É ali que estão pregando os cartazes.')}`) + numero(4, 7),
  },
  {
    arquivo: 'posts/02-cidade-5.jpg', formato: 'post', foto: 'calcadao', sombra: 'baixo',
    html: baixo(`${rotulo('Calçadão do Rio Cadeia')}${titulo('Por aqui você chega.')}${texto('Numa tarde de outono, pela beira do rio.')}`) + numero(5, 7),
  },
  {
    arquivo: 'posts/02-cidade-6.jpg', formato: 'post', foto: 'enxaimel', sombra: 'baixo',
    html: baixo(`${rotulo('Enxaimel, araucária e plátano')}${titulo('A serra gaúcha em polígonos.')}${texto('Casas de colono, morros de mato e um outono inteiro de folhas no chão.')}`) + numero(6, 7),
  },
  { ...FIM, arquivo: 'posts/02-cidade-7.jpg' },
  // 03 · a Folha de Teewald (o jornal da cidade, dentro do jogo)
  {
    arquivo: 'posts/03-jornal.jpg', formato: 'post', foto: 'praca', borrada: true, sombra: 'nenhuma', vinheta: false,
    html: alto(`${rotulo('Folha de Teewald · 3 de maio de 1997')}${titulo('Ovelhas mortas na Linha Schmitt.', 'menor')}`)
      + papel('jornal', '470px', '-1.2deg')
      + baixo(texto('A Prefeitura diz que é graxaim. A inspetoria veterinária fala em cachorro. A repórter que veio de Porto Alegre já contou onze casos em dez dias.')),
    vars: { '--margem-baixo': '110px' },
  },
  // 04 · o forasteiro
  {
    arquivo: 'posts/04-forasteiro.jpg', formato: 'post', foto: 'chuva', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('O forasteiro')}${titulo('Você não é daqui.', 'grande')}`)
      + baixo(`${texto('Chegou numa tarde de neblina e resolveu ficar para descobrir o que anda no mato. A cidade não gosta de perguntas.')}`) + assina(),
  },
  // 05 · o cartaz da praça
  {
    arquivo: 'posts/05-cartaz.jpg', formato: 'post', foto: 'praca-noite', borrada: true, sombra: 'nenhuma', vinheta: false,
    html: alto(`${rotulo('Mural da Praça 10 de Abril')}${titulo('Procura-se.', 'grande')}`)
      + papel('cartaz-chupacabras', '440px', '1.4deg')
      + baixo(texto('Galinhas, patos e até ovelhas. Todos com <b>dois furos no pescoço</b> e sem uma gota de sangue.')),
    vars: { '--margem-baixo': '110px' },
  },
  // 06 · carrossel: 3D LIMPO ou PS1 RETRÔ
  {
    arquivo: 'posts/06-estilo-1.jpg', formato: 'post', foto: 'estilo-limpo', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('Estilo visual · 3D limpo')}${titulo('Polígonos à vista.')}`)
      + baixo(texto('Resolução da tela, bordas lisas, sombras e o pôr do sol de outono.')) + passa(),
  },
  {
    arquivo: 'posts/06-estilo-2.jpg', formato: 'post', foto: 'estilo-ps1', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('Estilo visual · PS1 retrô')}${titulo('Ou do jeito de 1997.')}`)
      + baixo(texto('240 linhas, dithering e cor de 15 bits de verdade. Troca a qualquer hora, em OPÇÕES.')) + numero(2, 3),
  },
  {
    arquivo: 'posts/06-estilo-3.jpg', formato: 'post', foto: 'ps1-praca', sombra: 'baixo', hud: true,
    html: baixo(`${rotulo('PS1 retrô · Praça 10 de Abril')}${titulo('Qual você joga?', 'menor')}${texto('Conta nos comentários: 3D LIMPO ou PS1 RETRÔ.')}`) + numero(3, 3),
  },
  // 07 · a praça de noite
  {
    arquivo: 'posts/07-praca-noite.jpg', formato: 'post', foto: 'praca-noite', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('Praça 10 de Abril · nove da noite')}${titulo('Comércio fecha às 18 h.', 'grande')}`)
      + baixo(texto('Cada lampião é uma luz de verdade no jogo. Mesmo assim, ninguém fica na rua depois que escurece.')) + assina(),
  },
  // 08 · carrossel: os moradores
  {
    arquivo: 'posts/08-moradores-1.jpg', formato: 'post', foto: 'valdir', sombra: 'baixo',
    html: baixo(`${rotulo('Seu Valdir · banco da praça')}${titulo('Cada morador sabe um pedaço da história.', 'menor')}${texto('Ninguém quer falar com a repórter. Com você, quem sabe.')}`) + passa(),
  },
  {
    arquivo: 'posts/08-moradores-2.jpg', formato: 'post', foto: 'conversa', sombra: 'alto',
    html: alto(`${rotulo('Conversas')}${titulo('Pergunte para todo mundo.', 'menor')}`) + numero(2, 2),
  },
  // 09 · a fala do Seu Arno
  {
    arquivo: 'posts/09-arno.jpg', formato: 'post', foto: 'mato', sombra: 'baixo', hud: true,
    html: olhos(640, 520, 1.1)
      + baixo(`<blockquote class="citacao-peca"><p>Quando eu acendi a lanterna, os olhos brilharam vermelho. Aí sumiu no mato, aos pulos.</p><footer>Seu Arno, pescador do calçadão</footer></blockquote>`) + assina(),
  },
  // 10 · carrossel: survival horror
  {
    arquivo: 'posts/10-jogo-1.jpg', formato: 'post', foto: 'mira', borrada: true, sombra: 'nenhuma', vinheta: false,
    html: alto(`${rotulo('Survival horror')}${titulo('Munição contada.')}`)
      + tela('mira', '370px')
      + baixo(texto('Câmera por cima do ombro, lanterna e uma cidade inteira para atravessar no escuro.')) + passa(),
    vars: { '--margem-baixo': '150px' },
  },
  {
    arquivo: 'posts/10-jogo-2.jpg', formato: 'post', foto: 'mira', borrada: true, sombra: 'nenhuma', vinheta: false,
    html: alto(`${rotulo('Inventário')}${titulo('Cuca com chá de marcela.', 'menor')}`)
      + tela('inventario', '370px')
      + baixo(texto('O inventário pausa o jogo. As armas brancas gastam e quebram, e a cuca com chá remenda a vida.')) + numero(2, 3),
    vars: { '--margem-baixo': '150px' },
  },
  { ...FIM, arquivo: 'posts/10-jogo-3.jpg' },
  // 11 · lua cheia
  {
    arquivo: 'posts/11-lua.jpg', formato: 'post', foto: 'lua', sombra: 'baixo', hud: true,
    html: baixo(`${titulo('Ninguém sai de casa depois que escurece.')}${regua}${frase('Menos você.')}`) + assina('esquerda'),
    vars: { '--margem-baixo': '190px' },
  },
  // 12 · joga em qualquer lugar
  {
    arquivo: 'posts/12-celular.jpg', formato: 'post', foto: 'cidade', borrada: true, sombra: 'nenhuma', vinheta: false,
    html: alto(`${rotulo('PC · celular · tablet')}${titulo('Joga em qualquer lugar.', 'grande')}`, 'centro')
      + `<div class="celular deitado" style="top:520px"><div class="tela" style="background-image:url('/social/fotos/celular.jpg')"></div></div>`
      + baixo(`<ul class="lista"><li>Teclado e mouse</li><li>Controle</li><li>Toque</li></ul>${nota('Grátis · no navegador · sem instalar nada')}`, 'centro'),
    vars: { '--margem-baixo': '100px' },
  },
  // 13 · as pegadas
  {
    arquivo: 'posts/13-pegadas.jpg', formato: 'post', foto: 'pegadas', sombra: 'alto', hud: true,
    html: alto(`${rotulo('Beira do mato · lua cheia')}${titulo('Não é pegada de cachorro.', 'grande')}${texto('A inspetoria veterinária pode dizer o que quiser.')}`) + assina(),
  },
  // 14 · a tempestade
  {
    arquivo: 'posts/14-tempestade.jpg', formato: 'post', foto: 'tempestade', sombra: 'baixo', hud: true,
    html: baixo(`${rotulo('Neblina, chuva e trovão')}${titulo('A lanterna alcança poucos metros.')}${texto('E o som vem de todos os lados.')}`) + assina(),
  },
  // 15 · a Kartoffelfest
  {
    arquivo: 'posts/15-kartoffelfest.jpg', formato: 'post', foto: 'kartoffelfest', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('Folha de Teewald')}${titulo('Kartoffelfest cancelada.', 'grande')}`)
      + baixo(texto('O pavilhão ficou montado sobre a Rua Beno Closs, com as bandeirinhas e as mesas postas, esperando uma festa que não vai acontecer.')) + assina(),
  },
  // 16 · o carro do forasteiro
  {
    arquivo: 'posts/16-carro.jpg', formato: 'post', foto: 'carro', sombra: 'ambos', hud: true,
    html: alto(`${rotulo('O carro do forasteiro')}${titulo('Chegou numa tarde de outono.')}`)
      + baixo(texto('Um sedã preto de quatro portas do fim dos anos 60. Dá para dirigir pela cidade a qualquer hora.')) + assina(),
  },

  // ---------------------------------------------------------------- stories (1080x1920)
  // o Instagram cobre o alto (~250 px) e o pé (~340 px): o texto fica no meio, e sobra lugar
  // para a figurinha (link, enquete, teste) onde a CAMPANHA.md indica
  {
    arquivo: 'stories/01-chegou.jpg', formato: 'story', foto: 'capa-story', sombra: 'ambos', hud: true,
    vars: { '--margem-alto': '280px', '--margem-baixo': '520px' },
    html: alto(`${rotulo('Vale do Herval · maio de 1997')}<h1 class="logo">Teewald</h1>${regua}${frase('Alguma coisa anda no mato.')}`)
      + baixo(`${nota('Terror de PS1 · grátis no navegador')}${nota('toque no link ▾')}`, 'centro'),
  },
  {
    arquivo: 'stories/02-enquete.jpg', formato: 'story', foto: 'mato-story', sombra: 'alto', hud: true,
    vars: { '--margem-alto': '300px' },
    html: alto(`${rotulo('Pergunta séria')}${titulo('Você entraria no mato depois que escurece?', 'grande')}`) + olhos(620, 1010, 1.1),
  },
  {
    arquivo: 'stories/03-jornal.jpg', formato: 'story', foto: 'praca', borrada: true, sombra: 'nenhuma', vinheta: false,
    vars: { '--margem-alto': '280px', '--margem-baixo': '420px' },
    html: alto(`${rotulo('Folha de Teewald · edição de hoje')}${titulo('Onze casos em dez dias.')}`)
      + papel('jornal', '720px', '-1.2deg', '940px')
      + baixo(texto('A Prefeitura diz que é graxaim.')),
  },
  {
    arquivo: 'stories/04-estilo.jpg', formato: 'story', sombra: 'nenhuma',
    html: `<div class="foto" style="background-image:url('/social/fotos/estilo-limpo.jpg');bottom:50%;background-position:50% 62%"></div>
      <div class="foto" style="background-image:url('/social/fotos/estilo-ps1.jpg');top:50%;background-position:50% 62%"></div>
      <div class="sombra-alto" style="height:30%"></div>`
      + `<div class="conteudo" style="top:270px"><p class="rotulo fundo">3D limpo</p></div><div class="conteudo" style="top:1000px"><p class="rotulo fundo">PS1 retrô</p></div>`
      + `<div class="conteudo centro" style="top:820px"><span class="botao">Qual você joga?</span></div>`,
  },
  {
    arquivo: 'stories/05-hoje.jpg', formato: 'story', foto: 'chuva-story', sombra: 'ambos', hud: true,
    vars: { '--margem-alto': '300px', '--margem-baixo': '520px' },
    html: alto(`${rotulo('Hoje à noite')}${titulo('Leve a lanterna.', 'grande')}`)
      + baixo(`${nota('Grátis no navegador · PC, celular e controle')}${nota('toque no link ▾')}`, 'centro'),
  },
  // foto do perfil (o Instagram mostra num círculo): o T do logo, com o brilho do lampião
  {
    arquivo: 'perfil.jpg', formato: 'perfil', sombra: 'nenhuma',
    html: `<div class="foto" style="background:radial-gradient(circle at 50% 46%, #3d2a1a, var(--cor-fundo) 62%)"></div>`
      + `<div class="conteudo meio centro" style="left:0;right:0;margin-top:-30px"><h1 class="logo" style="font-size:820px;line-height:.78">T</h1></div>`,
  },
  // capa do reels (1080x1920; no perfil aparece o meio, em 3:4)
  {
    arquivo: 'reels/capa.jpg', formato: 'story', foto: 'capa-story', sombra: 'ambos', hud: true,
    vars: { '--margem-alto': '520px' },
    html: alto(`${rotulo('Terror de PS1 numa cidade gaúcha de verdade')}<h1 class="logo">Teewald</h1>${regua}${frase('Alguma coisa anda no mato.')}`, 'centro'),
  },
];

// letreiros do reels: PNGs transparentes de 1080x1920, por cima do vídeo.
// O Instagram cobre o alto (~220 px), o pé (~420 px) e a coluna da direita (~150 px):
// os letreiros ficam no terço de cima, entre 300 e 900 px.
const leg = (h, topo = 330, cl = '') => ({ html: `<div class="conteudo centro ${cl}" style="top:${topo}px;right:150px;left:110px">${h}</div>` });
export const LETREIROS = {
  gancho: leg(titulo('Uma cidade gaúcha de verdade virou um jogo de terror de PS1.')),
  lugar: leg(`${rotulo('Santa Maria do Herval · RS')}${titulo('Maio de 1997.', 'grande')}`),
  neblina: leg(titulo('A neblina não levanta.')),
  criacao: leg(titulo('A criação aparece seca no potreiro.')),
  escurece: leg(titulo('Ninguém sai de casa depois que escurece.')),
  menos: leg(titulo('Menos você.', 'grande')),
  fim: leg(`<h1 class="logo">Teewald</h1>${regua}${frase('Alguma coisa anda no mato.')}<div style="height:60px"></div>${nota('Grátis no navegador')}${nota('PC · celular · controle')}${nota('link na bio')}`, 300, 'fundo-escuro'),
  // os olhos no vão escuro entre as árvores do último plano
  olhos: { html: olhos(556, 1028, 0.85) },
};

export { LINK };
