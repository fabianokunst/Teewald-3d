// Textos dos extras: documentos espalhados pela cidade, fichas das lendas e as
// ligações dos orelhões. Tudo inventado (obra de ficção); os lugares são os do jogo.
//
// DOCS: { id, title, kind (cabeçalho do papel), at (onde fica, ver extras.js), pages: [[linhas]] }
// LEGENDS: { id, name, sub, types (tipos de criatura da campanha, game/campaign.js TYPES), text: [linhas] }
// CALLS: ligações por capítulo: { who, voice, lines }

export const DOCS = [
  {
    id: 'jornal1', kind: 'RECORTE DE JORNAL', title: 'Folha de Teewald, 3 de outubro',
    pages: [[
      'OVELHAS MORTAS NA LINHA SCHMITT',
      'Produtores do interior encontraram sete ovelhas mortas na madrugada de domingo. Os animais não tinham ferimentos grandes, só dois furos no pescoço, e estavam secos, sem sangue.',
      'A inspetoria veterinária fala em "ataque de cães". Os moradores não acreditam: cachorro come, e nenhuma ovelha foi comida.',
      'A Brigada pede que ninguém saia armado pelo mato à noite.',
    ]],
  },
  {
    id: 'cartaz_mimi', kind: 'CARTAZ NUM POSTE', title: 'Procura-se gata cinza',
    pages: [[
      'PROCURA-SE',
      'Gata cinza, olhos verdes, atende por MIMI. Muito mansa. Sumiu segunda-feira de noite.',
      'Quem encontrar, por favor levar na casa da Dona Hilda, no calçadão. Dou recompensa.',
      'Embaixo, alguém escreveu a lápis: "procura na igreja. os gatos sobem lá quando têm medo".',
    ]],
  },
  {
    id: 'cartaz_boris', kind: 'CARTAZ NA PONTE', title: 'Perdeu-se cachorro preto',
    pages: [[
      'PERDEU-SE CACHORRO PRETO',
      'Grande, coleira vermelha, nome BÓRIS. Arrebentou a corrente na noite de domingo.',
      'Recompensa. Falar com o Lucas, última casa antes da ponte.',
      'A folha está rasgada no canto e manchada de alguma coisa escura.',
    ]],
  },
  {
    id: 'oficio', kind: 'OFÍCIO DA PREFEITURA', title: 'Comunicado nº 41',
    pages: [[
      'PREFEITURA MUNICIPAL',
      'Comunicamos à população que a Kartoffelfest deste ano fica CANCELADA, em razão dos acontecimentos das últimas semanas.',
      'O pavilhão permanece montado na Rua Beno Closs até segunda ordem. Pede-se que ninguém entre na área depois do anoitecer.',
      'Os vigias municipais estão autorizados a fechar o comércio às dezoito horas.',
    ]],
  },
  {
    id: 'programa', kind: 'PROGRAMA DA FESTA', title: 'Kartoffelfest, programação',
    pages: [[
      'SEXTA: abertura com a Bandinha Herval-Klänge. Escolha da Rainha da Batata.',
      'SÁBADO: almoço de batata recheada, concurso de descascar batata, baile.',
      'DOMINGO: missa campal e encerramento.',
      'Atrás, a lápis, com outra letra: "a bandinha toca mesmo sem ninguém. eu ouvi ontem. a valsa do ano em que a Elsa morreu."',
    ]],
  },
  {
    id: 'foto1910', kind: 'FOTOGRAFIA ANTIGA', title: 'Inauguração da Igreja Matriz, 1910',
    pages: [[
      'Uma foto marrom, dobrada em quatro. A igreja nova, ainda sem reboco na torre, e o povo todo na escadaria: os homens de chapéu, as mulheres de lenço, as crianças na frente.',
      'No canto esquerdo, longe de todos, uma mulher de preto olha direto para a câmera.',
      'Atrás, a tinta: "Einweihung der Kirche, 1910". E embaixo, em letra mais nova: "Ninguém sabe quem é a mulher. Ela não estava lá."',
    ]],
  },
  {
    id: 'wendt1', kind: 'PÁGINA SOLTA', title: 'Diário do Pastor Wendt, março de 1878',
    pages: [[
      '12 de março. Mais duas vacas do Kranz amanheceram secas. O povo fala da Otília, a viúva que cura com ervas no fim da picada.',
      'Fui até a casa dela. Ofereceu chá. Tinha um bicho no canto, embaixo de um pano, que respirava alto. Ela disse que era um cachorro doente.',
      'Cachorro não tem aqueles olhos. Rezei o caminho inteiro de volta.',
    ]],
  },
  {
    id: 'wendt2', kind: 'PÁGINA SOLTA', title: 'Diário do Pastor Wendt, abril de 1878',
    pages: [[
      '3 de abril. Os homens decidiram sem mim. Levaram a Otília para o mato, cavaram a cova e puseram ela dentro, viva, gritando em hunsrik que voltaria.',
      'O ferreiro Hoffmann fez a cruz de ferro. Pregaram a cruz em cima da pedra.',
      'O bicho dela fugiu para o morro. Ninguém teve coragem de ir atrás.',
      'Deus me perdoe por ter ficado em casa.',
    ]],
  },
  {
    id: 'ata1879', kind: 'ATA DA COMUNIDADE', title: 'Livro de atas, 1879',
    pages: [[
      'Aos dez dias de janeiro de mil oitocentos e setenta e nove, reunida a comunidade na capela, ficou decidido:',
      'Primeiro: que ninguém mexa na pedra do mato nem na cruz que está sobre ela.',
      'Segundo: que o nome daquela mulher não seja escrito em livro nenhum desta comunidade.',
      'Terceiro: que o sino seja tocado toda noite às vinte horas, para que ela saiba que estamos acordados.',
      'A última frase está riscada. Ninguém mais tocou o sino às oito.',
    ]],
  },
  {
    id: 'jornal1983', kind: 'RECORTE DE JORNAL', title: 'Folha de Teewald, novembro de 1983',
    pages: [[
      'TRAGÉDIA NA FÁBRICA DE CALÇADOS',
      'Quatro operárias morreram no incêndio que destruiu o depósito de cola da indústria na noite de quinta-feira. As portas estavam trancadas por fora.',
      'Entre as vítimas, Lúcia Weber, 19 anos, que casaria em dezembro. O capataz Kurt B. também morreu, tentando abrir o cadeado.',
      'O relógio de ponto parou às 23h47.',
    ]],
  },
  {
    id: 'boletim1978', kind: 'BOLETIM DE OCORRÊNCIA', title: 'Delegacia de Teewald, 1978',
    pages: [[
      'Comunicante: Alfons R., agricultor. Relata que na noite de 14 para 15 de maio viu uma "estrela" cair no morro atrás da gruta, com estrondo, e que a terra ficou quente por três dias.',
      'Diligência ao local: pedra verde do tamanho de um carro, partida, que zumbia. Os cachorros da patrulha se recusaram a chegar perto.',
      'Observação do delegado Kunz: arquivar. Não comentar com a imprensa.',
    ]],
  },
  {
    id: 'carta_rudi', kind: 'CARTA NÃO ENTREGUE', title: 'Carta para Rudi Hoffmann',
    pages: [[
      'Meu filho, a mãe escreve porque tu não atende o telefone.',
      'Tu sabe o que os velhos diziam do sétimo guri. O teu irmão Paulo nunca foi teu padrinho, foi o tio Arnaldo, e eu sempre tive medo disso.',
      'Em noite de lua cheia, fica em casa. Tranca a porta e me liga. Por favor.',
      'O carimbo dos Correios é de três semanas atrás. A carta nunca saiu da agência.',
    ]],
  },
  {
    id: 'redacao', kind: 'REDAÇÃO DA ESCOLA', title: '"O que eu vi da minha janela"',
    pages: [[
      'Joãozinho, 4ª série.',
      'Eu vi um bicho no pátio da vizinha. Ele anda pulando que nem canguru e tem espinho nas costas. Ele bebeu a galinha.',
      'Depois ele olhou para a minha janela e eu me escondi embaixo da coberta. A mãe disse que era sonho.',
      'Não era sonho porque de manhã tinha pegada no barro.',
      'A professora escreveu em vermelho: "Muito criativo. Cuidado com a ortografia."',
    ]],
  },
  {
    id: 'nota_agro', kind: 'NOTA DE BALCÃO', title: 'Agropecuária, pedido especial',
    pages: [[
      'Rifle de dardos (veterinária), 1 unid.',
      'Dardos com sedativo para bovino, 12 unid.',
      'Cliente: ____. Pagamento: fiado.',
      'Obs. do balconista: "o homem queria para pegar bicho do mato. Avisei que o sedativo só derruba animal cansado. Ele riu e disse que o bicho cansa, sim. Que já viu ele cansar."',
    ]],
  },
  {
    id: 'caderno_romeu', kind: 'CADERNO DE CAMPO', title: 'Seu Romeu, contagem do potreiro',
    pages: [[
      'Segunda: 31 cabeças. Terça: 31. Quarta: 30, a mocha sumiu.',
      'Quinta: 28. Cerca arrombada de dentro para fora. Pegadas do tamanho de um prato.',
      'Sexta: não fui contar.',
      'Sábado: 24. Alguma coisa ficou me olhando da neblina enquanto eu consertava a cerca. Era alta como um cavalo de pé.',
    ]],
  },
  {
    id: 'receita', kind: 'PAPEL AMARELADO', title: 'Receita de benzedura',
    pages: [[
      'Para quebranto e cobreiro: arruda, alecrim, três folhas de guiné. Benzer com a mão esquerda.',
      'Para quem fez mal à gente: o nome da pessoa escrito em papel, enterrado embaixo da porteira, com sangue de bicho que não tem nome.',
      'A letra é miúda e caprichada. No pé da folha, a assinatura: O. K., 1877.',
    ]],
  },
  {
    id: 'lista', kind: 'LISTA TELEFÔNICA', title: 'Página arrancada da lista',
    pages: [[
      'Uma página da lista telefônica de Teewald, letras H a K.',
      'Os nomes HOFFMANN, KLEIN e KRANZ estão circulados de vermelho. Ao lado de KRANZ, alguém escreveu "não tem telefone. nunca teve."',
      'Embaixo, em letra trêmula: "mas ela liga mesmo assim".',
    ]],
  },
  {
    id: 'desenho', kind: 'DESENHO DE CRIANÇA', title: 'Desenho a giz de cera',
    pages: [[
      'Um galinheiro, uma igreja com uma cruz grande e, no meio do mato, um bicho preto com olhos vermelhos e espinhos nas costas.',
      'Do lado do bicho, uma mulher bem comprida, de vestido preto, segurando ele pela mão.',
      'Escrito em cima, com letra de criança: "A MOÇA DO MATO E O CACHORRO DELA".',
    ]],
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

// ligações dos orelhões (uma por capítulo; o capítulo 1 é de tarde, os orelhões ficam quietos)
export const CALLS = {
  2: { who: '???', voice: 95, lines: ['...', 'Kommst du mich besuchen, Bub?', 'Os meus cachorrinhos estão com fome. Tão com tanta fome...', '(uma risada baixa, e a linha cai)'] },
  3: { who: '???', voice: 330, lines: ['(alguém chorando, longe)', '...o relógio... bate o ponto pra mim... eu não alcanço...', 'Tá tão escuro aqui dentro. Ele trancou a porta.'] },
  4: { who: '???', voice: 120, lines: ['(chiado, e números ditos devagar)', 'Um. Nove. Sete. Oito.', 'A pedra ainda canta embaixo do morro. Eles vieram buscar.'] },
  5: { who: 'SEU ROMEU', voice: 150, lines: ['Alô? É da Prefeitura? Alô!', 'Tem uma coisa no meu potreiro. Alta. Tá me olhando da neblina.', 'Ela tá vindo pra... (a ligação corta. É a voz do Seu Romeu, mas o Seu Romeu está em casa.)'] },
  6: { who: '???', voice: 280, lines: ['Rudi? Rudi, é a mãe!', 'Filho, volta pra casa antes da lua subir. Por favor, filho.', 'Rudi, eu tô ouvindo tu respirar...'] },
  7: { who: '???', voice: 105, lines: ['(uma voz velha, com sotaque alemão carregado)', 'Das Kreuz... a cruz... guardem a cruz embaixo dos fundadores.', 'Eu fiquei em casa. Eu fiquei em casa e deixei enterrarem ela viva.'] },
  8: { who: '???', voice: 600, lines: ['(guinchos agudos, asas batendo dentro do fone)', '(e, no meio do barulho, uma mulher cantarolando uma canção de ninar em alemão)'] },
  9: { who: '???', voice: 70, lines: ['(uma respiração molhada, bem perto do fone)', '(um rosnado baixo)', '(e o som de alguma coisa pulando para longe, no cascalho)'] },
  10: { who: 'OTÍLIA', voice: 90, lines: ['Tu me acordou, Bub.', 'Agora vem me pôr pra dormir de novo. Se tiver coragem.', 'Eu tô te esperando no mato. Onde vocês me deixaram.'] },
};
// ligação de quando o orelhão toca de novo no mesmo capítulo: só respiração
export const CALL_SILENT = { who: '???', voice: 80, lines: ['...', '(ninguém fala. Só uma respiração, do outro lado.)', '(e o fone fica gelado na tua mão)'] };
