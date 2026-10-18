// Textos dos extras: documentos espalhados pela cidade, fichas das lendas e as
// ligações dos orelhões. Tudo inventado (obra de ficção); os lugares são os do jogo.
//
// DOCS: { id, title, kind (cabeçalho do papel), paper, marks, pages } — o formato dos
//   blocos (letra à mão, carimbo, rasura, foto, desenho) está em ui/paper.js. O papel
//   mostra o que o documento tem: nada de "embaixo, alguém escreveu..."; o que alguém
//   escreveu aparece escrito, a foto aparece como foto (desenhos em game/docArt.js).
//   story: true = achado pela história (o capítulo mostra), não fica jogado na cidade.
// LEGENDS: { id, name, sub, types (tipos de criatura da campanha, game/campaign.js TYPES), text: [linhas] }
// CALLS: ligações por capítulo: { who, voice, lines }

export const DOCS = [
  {
    id: 'jornal1', kind: 'RECORTE DE JORNAL', title: 'Folha de Teewald, 3 de maio de 1997', paper: 'news',
    pages: [[
      { t: 'Folha de Teewald', s: 'mast', align: 'center' },
      { rule: true },
      { t: 'OVELHAS MORTAS NA LINHA SCHMITT', s: 'head' },
      { img: 'newsOvelhas', w: 0.6, h: 0.47 },
      { t: 'O potreiro dos Schmitt na manhã de domingo. (Foto: Marlene K.)', s: 'small', align: 'center' },
    ], [
      'Produtores do interior encontraram sete ovelhas mortas na madrugada de domingo. Os animais não tinham ferimentos grandes, só dois furos no pescoço, e estavam secos, sem sangue.',
      'A inspetoria veterinária fala em "ataque de cães". Os moradores não acreditam: cachorro come, e nenhuma ovelha foi comida.',
      'A Brigada pede que ninguém saia armado pelo mato à noite.',
    ]],
  },
  {
    id: 'cartaz_mimi', kind: 'CARTAZ NUM POSTE', title: 'Procura-se gata cinza', paper: 'white',
    pages: [[
      { t: 'PROCURA-SE', s: 'poster', align: 'center', color: '#8a1612' },
      { img: 'fotoMimi', w: 0.3, h: 0.42, float: 'left' },
      'Gata cinza, olhos verdes, atende por MIMI. Muito mansa. Sumiu segunda-feira de noite.',
      'Quem encontrar, por favor levar na casa da Dona Hilda, no calçadão. Dou recompensa.',
      { t: 'procura na igreja. os gatos sobem lá quando têm medo', s: 'pencil' },
    ]],
  },
  {
    id: 'cartaz_boris', kind: 'CARTAZ NA PONTE', title: 'Perdeu-se cachorro preto', paper: 'white', marks: ['torn', 'stain'],
    pages: [[
      { t: 'PERDEU-SE CACHORRO PRETO', s: 'head', align: 'center', color: '#1a1410' },
      { img: 'fotoBoris', w: 0.3, h: 0.42, float: 'left' },
      'Grande, coleira vermelha, nome BÓRIS. Arrebentou a corrente na noite de domingo.',
      'Recompensa. Falar com o Lucas, última casa antes da ponte.',
    ]],
  },
  {
    id: 'oficio', kind: 'OFÍCIO DA PREFEITURA', title: 'Comunicado nº 41', paper: 'white',
    pages: [[
      { t: 'PREFEITURA MUNICIPAL DE TEEWALD', s: 'type', align: 'center' },
      { t: 'Gabinete do Prefeito', s: 'type', align: 'center' },
      { rule: true },
      { t: 'COMUNICADO Nº 41', s: 'type' },
      { t: 'Comunicamos à população que a Kartoffelfest deste ano fica CANCELADA, em razão dos acontecimentos das últimas semanas.', s: 'type' },
      { t: 'O pavilhão permanece montado na Rua Beno Closs até segunda ordem. Pede-se que ninguém entre na área depois do anoitecer.', s: 'type' },
      { t: 'Os vigias municipais estão autorizados a fechar o comércio às dezoito horas.', s: 'type' },
      { scribble: true, label: 'Prefeito Municipal' },
      { stamp: 'PREFEITURA\nTEEWALD-RS', round: true, float: true, color: '#2a4a8a', align: 'center', rot: 0.2 },
    ]],
  },
  {
    id: 'programa', kind: 'PROGRAMA DA FESTA', title: 'Kartoffelfest, programação', paper: 'yellow',
    pages: [[
      { t: 'KARTOFFELFEST', s: 'poster', align: 'center' },
      { img: 'batata', w: 0.16, h: 0.26 },
      'SEXTA: abertura com a Bandinha Herval-Klänge. Escolha da Rainha da Batata.',
      'SÁBADO: almoço de batata recheada, concurso de descascar batata, baile.',
      'DOMINGO: missa campal e encerramento.',
    ], { label: 'VERSO', blocks: [
      { t: 'a bandinha toca mesmo sem ninguém. eu ouvi ontem. a valsa do ano em que a Elsa morreu.', s: 'pencil' },
    ] }],
  },
  {
    id: 'foto1910', kind: 'FOTOGRAFIA ANTIGA', title: 'Inauguração da Igreja Matriz, 1910',
    pages: [{ paper: 'album', blocks: [
      { img: 'foto1910', h: 1 },
    ] }, { paper: 'card', label: 'VERSO', blocks: [
      { t: 'Einweihung der Kirche, 1910', s: 'ink', size: 18 },
      { space: 40 },
      { t: 'Ninguém sabe quem é a mulher. Ela não estava lá.', s: 'hand' },
    ] }],
  },
  {
    id: 'wendt1', kind: 'PÁGINA SOLTA', title: 'Diário do Pastor Wendt, março de 1878',
    pages: [[
      { t: '12 de março.', s: 'ink' },
      { t: 'Mais duas vacas do Kranz amanheceram secas. O povo fala da Otília, a viúva que cura com ervas no fim da picada.', s: 'ink' },
      { t: 'Fui até a casa dela. Ofereceu chá. Tinha um bicho no canto, embaixo de um pano, que respirava alto. Ela disse que era um cachorro doente.', s: 'ink' },
      { img: 'olhos', w: 0.36, h: 0.3 },
      { t: 'Cachorro não tem aqueles olhos. Rezei o caminho inteiro de volta.', s: 'ink' },
    ]],
  },
  {
    id: 'wendt2', kind: 'PÁGINA SOLTA', title: 'Diário do Pastor Wendt, abril de 1878', marks: ['blot'],
    pages: [[
      { t: '3 de abril.', s: 'ink' },
      { t: 'Os homens decidiram sem mim. Levaram a Otília para o mato, cavaram a cova e puseram ela dentro, viva, gritando em hunsrik que voltaria.', s: 'ink' },
      { t: 'O ferreiro Hoffmann fez a cruz de ferro. Pregaram a cruz em cima da pedra.', s: 'ink' },
      { t: 'O bicho dela fugiu para o morro. Ninguém teve coragem de ir atrás.', s: 'ink' },
      { t: 'Deus me perdoe por ter ficado em casa.', s: 'ink' },
    ]],
  },
  {
    id: 'ata1879', kind: 'ATA DA COMUNIDADE', title: 'Livro de atas, 1879',
    pages: [[
      { t: 'Aos dez dias de janeiro de mil oitocentos e setenta e nove, reunida a comunidade na capela, ficou decidido:', s: 'ink' },
      { t: 'Primeiro: que ninguém mexa na pedra do mato nem na cruz que está sobre ela.', s: 'ink' },
      { t: 'Segundo: que o nome daquela mulher não seja escrito em livro nenhum desta comunidade.', s: 'ink' },
      { t: 'Terceiro: que o sino seja tocado toda noite às vinte horas, para que ela saiba que estamos acordados.', s: 'ink', strike: true },
      { t: 'sem efeito. agora temos luz elétrica. 1932', s: 'pencil', align: 'right' },
    ], [
      { t: 'E por estarem todos de acordo, assinam:', s: 'ink' },
      { sign: 'Johann Wendt, Pastor' },
      { sign: 'Heinrich Klein', align: 'left' },
      { sign: 'Peter Schmitt' },
      { sign: 'Wilhelm Hoffmann', align: 'left' },
    ]],
  },
  {
    id: 'jornal1983', kind: 'RECORTE DE JORNAL', title: 'Folha de Teewald, novembro de 1983', paper: 'news', marks: ['fold3'],
    pages: [[
      { t: 'Folha de Teewald', s: 'mast', align: 'center' },
      { rule: true },
      { t: 'TRAGÉDIA NA FÁBRICA DE CALÇADOS', s: 'head' },
      { img: 'newsFabrica', w: 0.6, h: 0.47 },
      { t: 'O que sobrou do depósito de cola na manhã de sexta.', s: 'small', align: 'center' },
    ], [
      'Quatro operárias morreram no incêndio que destruiu o depósito de cola da indústria na noite de quinta-feira. As portas estavam trancadas por fora.',
      'Entre as vítimas, Lúcia Weber, 19 anos, que casaria em dezembro. O capataz Kurt B. também morreu, tentando abrir o cadeado.',
      'O relógio de ponto parou às 23h47.',
    ]],
  },
  {
    id: 'boletim1978', kind: 'BOLETIM DE OCORRÊNCIA', title: 'Delegacia de Teewald, 1978', paper: 'white',
    pages: [[
      { t: 'DELEGACIA DE POLÍCIA DE TEEWALD', s: 'type', align: 'center' },
      { t: 'BOLETIM DE OCORRÊNCIA Nº 112/78', s: 'type', align: 'center' },
      { rule: true },
      { t: 'COMUNICANTE: Alfons R., agricultor.', s: 'type' },
      { t: 'FATO: Relata que na noite de 14 para 15 de maio viu uma "estrela" cair no morro atrás da gruta, com estrondo, e que a terra ficou quente por três dias.', s: 'type' },
      { t: 'DILIGÊNCIA AO LOCAL: pedra verde do tamanho de um carro, partida, que zumbia. Os cachorros da patrulha se recusaram a chegar perto.', s: 'type' },
    ], [
      { t: 'OBSERVAÇÃO DO DELEGADO:', s: 'type' },
      { t: 'Arquivar. Não comentar com a imprensa.', s: 'hand' },
      { sign: 'Kunz', s: 'hand' },
      { stamp: 'ARQUIVADO', color: '#a8261e', align: 'center', rot: -0.16 },
    ]],
  },
  {
    id: 'carta_rudi', kind: 'CARTA NÃO ENTREGUE', title: 'Carta para Rudi Hoffmann', paper: 'lined', marks: ['fold3'],
    pages: [[
      { t: 'Meu filho,', s: 'hand' },
      { t: 'a mãe escreve porque tu não atende o telefone.', s: 'hand' },
      { t: 'Tu sabe o que os velhos diziam do sétimo guri. O teu irmão Paulo nunca foi teu padrinho, foi o tio Arnaldo, e eu sempre tive medo disso.', s: 'hand' },
      { t: 'Em noite de lua cheia, fica em casa. Tranca a porta e me liga. Por favor.', s: 'hand' },
      { sign: 'Tua mãe', s: 'hand' },
    ], { paper: 'envelope', marks: ['selo'], postmark: 'CORREIOS\nTEEWALD-RS\n24 SET', blocks: [
      { space: 16 },
      { t: 'Sr. Rudi Hoffmann', s: 'hand', size: 17 },
      { t: 'Linha Hoffmann, s/nº  ·  Teewald - RS', s: 'hand' },
      { note: 'Rudi, essa é tua. Tá na tua caixinha aqui na agência faz três semanas. Leva pra casa!  Nelci', s: 'pencil', bg: '#e8d870' },
    ] }],
  },
  {
    id: 'redacao', kind: 'REDAÇÃO DA ESCOLA', title: '"O que eu vi da minha janela"', paper: 'lined',
    pages: [[
      { t: 'Joãozinho    4ª série', s: 'child' },
      { t: 'O que eu vi da minha janela', s: 'child', align: 'center' },
      { t: 'Eu vi um bixo no pátio da visinha. Ele anda pulando que nen canguru e tem espinho nas costa. Ele bebeu a galinha.', s: 'child', words: 'bixo visinha nen costa' },
      { t: 'Depois ele olhou pra minha janela e eu me escondi em baixo da coberta. A mãe disse que era sonho.', s: 'child', words: 'em baixo' },
      { t: 'Não era sonho porque de manhã tinha pegada no barro.', s: 'child' },
    ], [
      { img: 'pegada', w: 0.2, h: 0.4, float: 'left' },
      { t: 'Muito criativo! Cuidado com a ortografia: bicho, vizinha, nem, embaixo.', s: 'red' },
      { t: 'Nota: 7,5', s: 'red', align: 'right', size: 18 },
    ]],
  },
  {
    id: 'nota_agro', kind: 'NOTA DE BALCÃO', title: 'Agropecuária, pedido especial', paper: 'white',
    pages: [[
      { t: 'AGROPECUÁRIA  ·  NOTA DE PEDIDO Nº 0347', s: 'type' },
      { rule: true },
      { t: '1 un.   Rifle de dardos (veterinária)', s: 'hand' },
      { t: '12 un.  Dardos c/ sedativo p/ bovino', s: 'hand' },
      { t: 'Cliente: ____________     Pagamento: fiado', s: 'hand' },
      { rule: true },
      { t: 'Obs.: o homem queria pra pegar bicho do mato. Avisei que o sedativo só derruba animal cansado. Ele riu e disse que o bicho cansa, sim. Que já viu ele cansar.', s: 'pencil' },
    ]],
  },
  {
    id: 'caderno_romeu', kind: 'CADERNO DE CAMPO', title: 'Seu Romeu, contagem do potreiro', paper: 'lined',
    pages: [[
      { t: 'Segunda: 31 cabeças. Terça: 31. Quarta: 30, a mocha sumiu.', s: 'pencil' },
      { t: 'Quinta: 28. Cerca arrombada de dentro para fora. Pegadas do tamanho de um prato.', s: 'pencil' },
      { t: 'Sexta: não fui contar.', s: 'pencil' },
      { t: 'Sábado: 24. Alguma coisa ficou me olhando da neblina enquanto eu consertava a cerca. Era alta como um cavalo de pé.', s: 'shaky' },
    ]],
  },
  {
    id: 'receita', kind: 'PAPEL AMARELADO', title: 'Receita de benzedura',
    pages: [[
      { img: 'ervas', w: 0.42, h: 0.28 },
      { t: 'Para quebranto e cobreiro: arruda, alecrim, três folhas de guiné. Benzer com a mão esquerda.', s: 'ink', size: 14 },
      { t: 'Para quem fez mal à gente: o nome da pessoa escrito em papel, enterrado embaixo da porteira, com sangue de bicho que não tem nome.', s: 'ink', size: 14 },
      { sign: 'O. K.  1877' },
    ]],
  },
  {
    id: 'lista', kind: 'LISTA TELEFÔNICA', title: 'Página arrancada da lista', paper: 'white', marks: ['torn'],
    pages: [[
      { t: 'TEEWALD - RS   ·   H a K', s: 'small' },
      { entry: ['HAAS Edmundo', 'R. 12 de Maio, 210', '566-1087'] },
      { entry: ['HECK Lourenço', 'Linha Schmitt', '566-1312'] },
      { entry: ['HOFFMANN Arnaldo', 'Linha Hoffmann', '566-1142'], ring: true },
      { entry: ['HOFFMANN Rudi', 'Linha Hoffmann', '566-1203'], ring: true },
      { entry: ['JUNG Alvino', 'Av. Beno Closs, 45', '566-1260'] },
      { entry: ['KLEIN Ferragem', 'Pça. 10 de Abril', '566-1001'], ring: true },
      { entry: ['KLEIN Hilário', 'R. da Matriz, 30', '566-1018'], ring: true },
      { entry: ['KRANZ Otília', 'Fim da Picada', '1878'], ring: true },
      { t: 'não tem telefone. nunca teve.', s: 'pencil', align: 'right' },
      { t: 'mas ela liga mesmo assim', s: 'shaky' },
    ]],
  },
  {
    id: 'desenho', kind: 'DESENHO DE CRIANÇA', title: 'Desenho a giz de cera', paper: 'white',
    pages: [[
      { t: 'A MOÇA DO MATO E O CACHORRO DELA', s: 'child', align: 'center', color: '#2a2a8a' },
      { img: 'desenho', h: 0.82 },
    ]],
  },
  {
    id: 'wendt3', kind: 'DIÁRIO NA CRIPTA', title: 'Diário do Pastor Wendt, novembro de 1878', story: true,
    pages: [[
      { t: 'den 20. November 1878', s: 'ink' },
      { t: 'A Otília não morre por ferro nem por fogo. Só a cruz, posta sobre o peito dela quando estiver fraca, devolve ela para a terra.', s: 'ink' },
      { img: 'cruz', w: 0.14, h: 0.3 },
      { t: 'O bicho dela, o Blutsauger, é o coração do feitiço. Enquanto ele estiver solto, ela não cansa.', s: 'ink' },
    ], [
      { t: 'Que Deus nos perdoe o que fizemos com ela. E o que ela fez conosco.', s: 'ink' },
      { sign: 'J. Wendt' },
    ]],
  },
  {
    id: 'album', kind: 'ÁLBUM DA PARÓQUIA', title: 'Fotos da Igreja Matriz', paper: 'album', story: true,
    pages: [
      [{ img: 'album1910', h: 0.82, corners: true }, { t: 'Inauguração, 1910', s: 'chalk', align: 'center' }],
      [{ img: 'album1935', h: 0.82, corners: true }, { t: 'Corpus Christi, 1935', s: 'chalk', align: 'center' }],
      [{ img: 'album1957', h: 0.82, corners: true }, { t: 'Casamento Hoffmann, 1957', s: 'chalk', align: 'center' }],
      [{ img: 'album1983', h: 0.82, corners: true }, { t: 'Lúcia Weber, 1983', s: 'chalk', align: 'center' }],
      [{ img: 'albumNoite', h: 0.82, corners: true }],
    ],
  },
];

// fichas das lendas (Lendas do Herval): liberadas ao ver a criatura de perto
export const LEGENDS = [
  {
    id: 'chupa', name: 'O CHUPACABRAS', sub: 'Blutsauger, o bicho da Otília',
    types: ['chupa'],
    text: [
      'Anda aos pulos, como um canguru magro, com espinhos nas costas e olhos vermelhos. Fura o pescoço do gado e bebe até secar.',
      'Os colonos o chamavam de Blutsauger. Era o familiar da bruxa Otília: enquanto ele vive, ela não cansa.',
      'Fraqueza: foge quando ferido; cansado, um dardo de sedativo derruba.',
    ],
  },
  {
    id: 'dog', name: 'CÃES DE FOGO', sub: 'os cachorrinhos da bruxa',
    types: ['dog'],
    text: [
      'Saem do chão em brasa, uivando, e caçam em bando. Dizem que são os cachorros dos colonos que ajudaram a enterrar a Otília.',
      'É o fogo que os mantém vivos. Em qualquer água, apagam e viram vapor.',
      'Fraqueza: água, chumbo grosso de perto, o som do sino benzido.',
    ],
  },
  {
    id: 'ghost', name: 'ALMAS PRESAS', sub: 'os que morreram com medo',
    types: ['ghost'],
    text: [
      'Vultos frios que atravessam paredes e roubam o calor de quem tocam. A bruxa segura aqui todos os que morreram com medo.',
      'Bala não fere o que já morreu.',
      'Fraqueza: a luz do lampião bento.',
    ],
  },
  {
    id: 'lucia', name: 'LÚCIA WEBER', sub: 'a moça da fábrica',
    types: ['lucia'],
    text: [
      'Operária de 19 anos, morta no incêndio da fábrica de calçados em 1983, um mês antes do casamento.',
      'Chora perto do relógio de ponto, procurando a medalhinha, o sapato de noiva e o cartão-ponto.',
      'Não faz mal a ninguém. Só quer bater a saída e ir para casa.',
    ],
  },
  {
    id: 'capataz', name: 'O CAPATAZ', sub: 'Kurt, o das chaves',
    types: ['capataz'],
    text: [
      'Trancou as portas da fábrica para fechar um pedido de botas e morreu queimado tentando abrir o próprio cadeado.',
      'Ainda guarda a fábrica, gritando, e as lâmpadas apagam quando ele grita.',
      'Fraqueza: a luz do lampião bento.',
    ],
  },
  {
    id: 'et', name: 'OS VISITANTES', sub: 'as luzes no céu',
    types: ['et', 'etLeader', 'Saucer'],
    text: [
      'Baixinhos, cabeçudos, de olhos enormes, como os de Varginha em 1996. Vieram atrás da pedra verde que caiu no morro em 1978.',
      'A bruxa usa a força da pedra; eles queriam a pedra de volta.',
      'Fraqueza: a própria arma deles, a pistola de raios.',
    ],
  },
  {
    id: 'fera', name: 'A FERA DA MADRUGADA', sub: 'maior que um touro',
    types: ['fera'],
    text: [
      'Anda na neblina das madrugadas, arromba potreiros e arrasta as vacas para o mato. Quem viu diz que é alta como um cavalo de pé.',
      'Investe de cabeça baixa e não sabe frear.',
      'Fraqueza: batendo em coluna ou parede, fica tonta. Dinamite.',
    ],
  },
  {
    id: 'wolf', name: 'O LOBISOMEM', sub: 'a sina do sétimo filho',
    types: ['werewolf'],
    text: [
      'O sétimo filho homem que não tem o irmão mais velho como padrinho vira lobisomem depois dos treze anos, em noite de lua cheia.',
      'Por baixo do pelo há uma pessoa. Matar a fera não precisa matar o homem.',
      'Fraqueza: prata. Bala comum só irrita.',
    ],
  },
  {
    id: 'bat', name: 'MORCEGOS-VAMPIRO GIGANTES', sub: 'asas da noite',
    types: ['bat'],
    text: [
      'Do tamanho de um homem de braços abertos. Fazem ninho nos forros e nos pavilhões, e mergulham em quem anda sozinho.',
      'Fraqueza: fogo e explosão nos ninhos; chumbo no ar.',
    ],
  },
  {
    id: 'queen', name: 'A RAINHA DOS MORCEGOS', sub: 'na torre da Matriz',
    types: ['batQueen'],
    text: [
      'Mãe de todos os ninhos. Pousa na torre da igreja e grita até os vidros tremerem.',
      'Fraqueza: derrubada do alto, fica no chão por um tempo.',
    ],
  },
  {
    id: 'witch', name: 'OTÍLIA KRANZ', sub: 'a bruxa do mato',
    types: ['witch'],
    text: [
      'Curandeira, viúva, enterrada viva pelos colonos em 1878 com uma cruz de ferro em cima. Jurou em hunsrik que voltaria.',
      'Acordou com o sangue do bicho dela e trouxe a noite junto. Invoca cães, almas e morcegos.',
      'Fraqueza: o bicho preso, os cristais quebrados e a cruz de ferro de volta no túmulo.',
    ],
  },
];

// ligações dos orelhões, pela chave do capítulo (no capítulo 1 é de tarde e os orelhões
// ficam quietos; nos capítulos em que o telefone é a história, a ligação vem do capítulo)
export const CALLS = {
  caes: { who: '???', voice: 95, lines: ['...', 'Kommst du mich besuchen, Bub?', 'Os meus cachorrinhos estão com fome. Tão com tanta fome...', '(uma risada baixa, e a linha cai)'] },
  fabrica: { who: '???', voice: 330, lines: ['(alguém chorando, longe)', '...o relógio... bate o ponto pra mim... eu não alcanço...', 'Tá tão escuro aqui dentro. Ele trancou a porta.'] },
  ets: { who: '???', voice: 120, lines: ['(chiado, e números ditos devagar)', 'Um. Nove. Sete. Oito.', 'A pedra ainda canta embaixo do morro. Eles vieram buscar.'] },
  fera: { who: 'SEU ROMEU', voice: 150, lines: ['Alô? É da Prefeitura? Alô!', 'Tem uma coisa no meu potreiro. Alta. Tá me olhando da neblina.', 'Ela tá vindo pra... (a ligação corta. É a voz do Seu Romeu, mas o Seu Romeu está em casa.)'] },
  lua: { who: '???', voice: 280, lines: ['Rudi? Rudi, é a mãe!', 'Filho, volta pra casa antes da lua subir. Por favor, filho.', 'Rudi, eu tô ouvindo tu respirar...'] },
  finados: { who: '???', voice: 105, lines: ['(uma voz velha, com sotaque alemão carregado)', 'Das Kreuz... a cruz... guardem a cruz embaixo dos fundadores.', 'Eu fiquei em casa. Eu fiquei em casa e deixei enterrarem ela viva.'] },
  asas: { who: '???', voice: 600, lines: ['(guinchos agudos, asas batendo dentro do fone)', '(e, no meio do barulho, uma mulher cantarolando uma canção de ninar em alemão)'] },
  covil: { who: '???', voice: 70, lines: ['(uma respiração molhada, bem perto do fone)', '(um rosnado baixo)', '(e o som de alguma coisa pulando para longe, no cascalho)'] },
  bruxa: { who: 'OTÍLIA', voice: 90, lines: ['Tu me acordou, Bub.', 'Agora vem me pôr pra dormir de novo. Se tiver coragem.', 'Eu tô te esperando no mato. Onde vocês me deixaram.'] },
};
// ligação de quando o orelhão toca de novo no mesmo capítulo: só respiração
export const CALL_SILENT = { who: '???', voice: 80, lines: ['...', '(ninguém fala. Só uma respiração, do outro lado.)', '(e o fone fica gelado na tua mão)'] };
