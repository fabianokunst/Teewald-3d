// Fichas de quem não é morador: o protagonista, os personagens da campanha e as criaturas.
// make(deps) monta o modelo do jogo para o retrato (studio.js); a altura dessas fichas é
// medida no próprio modelo. Os moradores ficam em src/game/npcData.js (FICHAS).
import { Character } from '../../src/game/character.js';
import { Chupacabra } from '../../src/game/chupacabra.js';
import { FireDog } from '../../src/game/creatures/firedog.js';
import { GiantBat, BatQueen } from '../../src/game/creatures/bat.js';
import { Ghost, LuciaGhost, Capataz } from '../../src/game/creatures/ghost.js';
import { ET, ETLeader } from '../../src/game/creatures/et.js';
import { Fera } from '../../src/game/creatures/fera.js';
import { Werewolf } from '../../src/game/creatures/werewolf.js';
import { Witch } from '../../src/game/creatures/witch.js';

export const HEROI = {
  id: 'heroi', nome: 'O FORASTEIRO', grupo: 'protagonista', hero: true,
  make: ({ M }) => new Character(M),
  papel: 'Protagonista, sem nome. Chegou de fora e ficou para caçar o chupacabras.',
  idade: 33, altura: 1.75, porte: 'médio',
  rosto: 'Loiro, cabelo penteado para trás, olhos fundos, sobrancelhas retas e barba rala.',
  corpo: 'Estatura média e ombros largos.',
  roupa: 'Jaqueta de couro marrom com lapelas, suéter cinza de gola V, camisa escura, calça escura e botas.',
  jeito: 'Sério e calado. Não é da cidade, e todo mundo percebe.',
};

export const CAMPANHA = [
  {
    id: 'otilia', nome: 'OTÍLIA KRANZ', make: d => new Witch(d, { intro: false }), face: { h: 0.62, dy: 0.06 },
    papel: 'A bruxa do mato. Chefe do último capítulo.',
    idade: 'enterrada viva em 1878',
    rosto: 'Pele cinzenta e olhos verdes que brilham entre as mechas do cabelo branco, comprido e solto.',
    corpo: 'Velha alta e muito magra; flutua acima do chão.',
    roupa: 'Manto preto forrado de vermelho.',
    jeito: 'Curandeira viúva que jurou voltar. Invoca cães, almas e morcegos.',
  },
  {
    id: 'lucia', nome: 'LÚCIA WEBER', make: d => new LuciaGhost(d, {}), face: { h: 0.52, dy: 0.04 },
    papel: 'A moça da fábrica de calçados (capítulo 3).',
    idade: '19, morta no incêndio de 1983',
    rosto: 'Muito pálida, olhos escuros e tristes com olheiras e boca pequena; cabelo escuro com franja.',
    corpo: 'Magra e translúcida.',
    roupa: 'Vestido de operária azul-claro de bolinhas, avental encardido, gola branca e barra chamuscada.',
    jeito: 'Não ataca. Chora, aponta o caminho e só quer bater o ponto para ir para casa.',
  },
  {
    id: 'capataz', nome: 'O CAPATAZ', make: d => new Capataz(d, {}), luz: 2.6,
    papel: 'Kurt, o das chaves. Chefe da fábrica (capítulo 3).',
    idade: 'morto no incêndio de 1983',
    rosto: 'Pele carbonizada, preta e marrom, cortada por rachaduras em brasa.',
    corpo: 'Grande e pesado, bem maior que um homem.',
    roupa: 'Terno, colete, camisa e gravata queimados, com furos de borda em brasa. Chaves e corrente.',
    jeito: 'Grita e apaga as lâmpadas. Na luz do lampião, ajoelha.',
  },
  {
    id: 'coveiro', nome: 'O COVEIRO', make: d => new Ghost(d, { kind: 'colono', scale: 1.6 }),
    papel: 'Alma presa na cripta dos fundadores (capítulo 8).',
    idade: 'colono do século XIX',
    rosto: 'Crânio magro e pálido, órbitas fundas e boca aberta num lamento.',
    corpo: 'Um colono esticado a quase três metros, com braços compridos.',
    roupa: 'Camisa de colono com cinto e suspensórios, esfarrapada; acaba em fiapos no lugar das pernas.',
    jeito: 'Guarda a cruz de ferro. Agarra com um frio que fere.',
  },
  {
    id: 'mulher', nome: 'A MULHER DE PRETO', make: d => new Ghost(d, { kind: 'mulher', color: 0x5a4a5e, opacity: 0.9, scale: 1.15 }), face: { h: 0.62, dy: 0.03 },
    papel: 'O vulto da fotografia de 1910 (capítulo 9).',
    idade: 'desconhecida',
    rosto: 'Rosto cinzento e vazio sob o xale, com órbitas fundas e boca aberta.',
    corpo: 'Alta e magra, translúcida.',
    roupa: 'Vestido longo escuro e arroxeado e xale sobre a cabeça, acabando em fiapos.',
    jeito: 'Aparece em todas as fotos da paróquia, cada vez mais perto. Foge rindo para o telhado.',
  },
];

export const CRIATURAS = [
  {
    id: 'chupa', nome: 'O CHUPACABRAS', chupa: true, make: d => new Chupacabra(d),
    papel: 'Blutsauger, o bicho da Otília. O alvo da caçada do começo ao fim.',
    rosto: 'Cabeça de réptil, boca cheia de presas e olhos vermelhos enormes que brilham no escuro.',
    corpo: 'Bípede corcunda de pele verde-acinzentada; anda aos pulos com pernas de canguru, tem espinhos vermelhos nas costas e garras compridas.',
    jeito: 'Rodeia, chia agachado e dá o bote. Ferido, foge mato adentro.',
  },
  {
    id: 'cao', nome: 'CÃO DE FOGO', make: d => new FireDog(d, {}), luz: 1.25,
    papel: 'Höllenhund, os cachorrinhos da bruxa.',
    rosto: 'Cabeça de cachorro magro, orelhas em pé, presas e olhos amarelos.',
    corpo: 'Magro e preto, com rachaduras em brasa e fogo saindo das costas.',
    jeito: 'Caça em matilha. Apaga em qualquer água.',
  },
  {
    id: 'et', nome: 'O VISITANTE PEQUENO', make: d => new ET(d, {}),
    papel: 'Os ETs de Varginha, atrás da pedra verde do morro.',
    rosto: 'Cabeçorra com três calombos e olhos vermelhos enormes.',
    corpo: 'Uns 1,2 m, pele marrom e oleosa.',
    jeito: 'Anda em bando, de lado, e joga orbes pelas mãos. Apanhando, pisca e some.',
  },
  {
    id: 'etchefe', nome: 'O VISITANTE', make: d => new ETLeader(d, {}), prep: e => { e.shield.visible = false; },
    papel: 'O chefe dos ETs (capítulo 4).',
    rosto: 'Cabeça grande e lisa, olhos vermelhos.',
    corpo: 'Alto, cinza-arroxeado, com colar de metal verde.',
    jeito: 'Levanta escudo psíquico, solta onda de choque e chama os pequenos.',
  },
  {
    id: 'fera', nome: 'A FERA DA MADRUGADA', make: d => new Fera(d, {}),
    papel: 'O bicho da madrugada dos sítios (capítulo 5).',
    rosto: 'Cabeça baixa entre boi e lobo, chifres curvos, presas e olhos amarelos.',
    corpo: 'Quadrúpede de 2,3 m de cernelha e 4 m de comprido; corcunda de pelo sujo, anda nos nós dos dedos.',
    jeito: 'Investe de cabeça baixa e não sabe frear.',
  },
  {
    id: 'lobisomem', nome: 'O LOBISOMEM', make: d => new Werewolf(d, {}),
    papel: 'A sina do sétimo filho (capítulo 7). Por baixo do pelo, um morador.',
    rosto: 'Cabeça de lobo e olhos âmbar.',
    corpo: 'Bípede corcunda, com pernas de cachorro e braços compridos com garras.',
    roupa: 'Restos de camisa xadrez e calça rasgada.',
    jeito: 'Corre de quatro e levanta para atacar. Só a prata segura a ferida.',
  },
  {
    id: 'morcego', nome: 'MORCEGO-VAMPIRO GIGANTE', voa: true, asa: 1.8, make: d => new GiantBat(d, {}),
    papel: 'Desmodus do tamanho de um cachorro (capítulo 10).',
    rosto: 'Focinho achatado, orelhas pontudas e dentes à mostra.',
    corpo: 'Do tamanho de um cachorro, pelo marrom e asas de couro.',
    jeito: 'Rodeia no alto, guincha e mergulha para morder.',
  },
  {
    id: 'rainha', nome: 'A RAINHA DOS MORCEGOS', voa: true, asa: 4.7, make: d => new BatQueen(d, {}),
    papel: 'Mãe de todos os ninhos, na torre da Matriz (capítulo 10).',
    rosto: 'O mesmo focinho, bem maior.',
    corpo: 'Uma morcega 2,6 vezes maior, com um rasgo na asa direita.',
    jeito: 'Rasantes longos e guincho que derruba. Cansada, pendura-se para tomar fôlego.',
  },
  {
    id: 'alma', nome: 'ALMA PRESA', make: d => new Ghost(d, { kind: 'colono', scale: 1 }),
    papel: 'Os que morreram com medo, presos pela bruxa.',
    rosto: 'Crânio magro e pálido, sem olhos.',
    corpo: 'Figura translúcida que flutua, com braços compridos.',
    roupa: 'Roupa de colono esfarrapada, acabando em fiapos.',
    jeito: 'Atravessa paredes e rouba o calor de quem toca. Só a luz do lampião mata.',
  },
];
