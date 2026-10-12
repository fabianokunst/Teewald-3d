import { HAIR, SKIN, EYES } from './heroTexture.js';

// Moradores de Teewald: aparência, onde ficam e o que falam.
// look: roupa e cores do atlas (heroTexture.js) · hat/hair/skirt/item: peças extras (npcModels.js)
// spawn(S): posição e comportamento, com os pontos de referência de npcs.js (S)
//   stand { x, z, h } · sit { seat } · route { pts, speed } · wander { poly, speed } · follow { leader, off }
// talks: conversas (uma por vez, em sequência) · barks: falas soltas quando o jogador passa perto
// hi: cumprimento · scared: depois de um tiro · aimed: com a arma apontada · gun: com a arma na mão

export const NPC_DEFS = [
  // ---------------- Calçadão do Rio Cadeia ----------------
  {
    id: 'arno', name: 'SEU ARNO', voice: 118,
    look: { seed: 101, top: 'shirt', pattern: 'plaid', accent: [36, 24, 22], old: true, beard: 'full', colors: { jacket: [150, 44, 36], pants: [64, 70, 82], hair: HAIR.gray, skin: SKIN.rosy, boot: [66, 48, 36] } },
    hat: ['palha', [214, 186, 120]], item: 'vara', pose: 'fish',
    spawn: S => { const p = S.calc(-30, -0.82); return { mode: 'stand', x: p.x, z: p.z, h: p.river }; },
    hi: 'Opa, bom dia!',
    barks: ['Hoje dá peixe...', 'Psst, fala baixo.', 'Ô vento frio, tchê!'],
    talks: [
      ['Bah, chegou cedo hoje, piá.', 'O Rio Cadeia tá baixo nessa época. Os lambaris ficam tudo escondido debaixo das pedras.', 'Mas um jundiá ainda sai, se a gente tiver paciência.'],
      ['O meu Opa pescava aqui antes de ter calçadão.', 'Era tudo barranco e taquara. A gente descia com a lata de minhoca e voltava com a janta.'],
      ['Psst... fala baixo.', 'Peixe escuta passo, sabia?', '...', 'Pronto. Espantou.'],
    ],
    scared: 'Mein Gott! Espantou todos os peixes!',
    aimed: 'Ei, ei! Eu só tô pescando!',
    gun: 'Isso aí não serve pra pescar, guri. Guarda isso.',
  },
  {
    id: 'hilda', name: 'DONA HILDA', voice: 300,
    look: { seed: 102, top: 'sweater', female: true, old: true, glasses: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [128, 40, 52], pants: [70, 64, 66], hair: HAIR.gray, skin: SKIN.fair, boot: [60, 46, 40], lip: [150, 80, 84] } },
    hat: ['lenco', [116, 70, 136]], skirt: { color: [70, 64, 72], long: true },
    spawn: S => ({ mode: 'route', pts: S.route(-46, 16, 0.14), speed: 1.0 }),
    hi: 'Gude Morje!',
    barks: ['Mais uma volta...', 'Ai, os meus joelhos.', 'Que tapete de folha!'],
    talks: [
      ['Gude Morje! Ah, desculpa, é o costume.', 'Em Teewald muita gente ainda fala hunsrik em casa. Tu entende?', 'Não? Ah, aprende ligeiro. É só sentar perto das vós na missa.'],
      ['Dez voltas por dia, o doutor mandou.', 'Mas com esse tapete de folha de plátano, eu bem que faço onze.', 'Fica tão bonito no outono, né?'],
      ['Domingo tem cuca lá em casa. De uva, de banana e de schmier.', 'Se passar na frente, entra. Porta de colono nunca tá trancada!'],
    ],
    scared: 'Ai, Nossa Senhora! Que susto, guri!',
    aimed: 'Abaixa isso, menino! Eu conheço a tua avó!',
    gun: 'Credo, guri, andando armado no calçadão? Guarda isso.',
  },
  {
    id: 'lucas', name: 'LUCAS', voice: 190,
    look: { seed: 103, top: 'jacket', feet: 'sneaker', colors: { jacket: [40, 70, 150], collar: [236, 236, 230], pants: [32, 36, 60], hair: HAIR.brown, skin: SKIN.tan, iris: EYES.brown, boot: [236, 236, 230] } },
    hat: ['bone', [190, 40, 40]],
    spawn: S => ({ mode: 'route', pts: S.route(-130, 40, -0.16), speed: 3.3 }),
    hi: 'Opa!',
    barks: ['Licença!', 'Ufa... ufa...', 'Bom dia!'],
    talks: [
      ['Opa! Não posso parar muito, senão esfria.', 'Tô treinando. Do Monumento até a praça e volta, todo santo dia.'],
      ['Tu já subiu a ladeira da igreja correndo?', 'Não faz isso. Eu fiz uma vez e o padre veio me dar a extrema-unção.'],
      ['Dica: de tarde, a sombra dos plátanos aqui no calçadão é a melhor da cidade.', 'No verão ninguém corre sem ela.'],
    ],
    scared: 'Tá louco?! Achei que era tiro de largada!',
    aimed: 'Opa, opa! Calma aí!',
    gun: 'Bah, que é isso na tua mão? Me deixa fora dessa.',
  },
  {
    id: 'marlene', name: 'MARLENE', voice: 330,
    look: { seed: 104, top: 'jacket', female: true, feet: 'sneaker', colors: { jacket: [214, 176, 48], pants: [60, 84, 130], hair: HAIR.dark, skin: SKIN.olive, iris: EYES.brown, boot: [230, 228, 220], lip: [168, 70, 72] } },
    hair: 'rabo', item: 'camera', pose: 'photo',
    spawn: S => {
      const l = S.L.letreiro, at = S.frame(l.x, l.z, l.rot), [x, z] = S.free(...at(0.6, 5));
      return { mode: 'stand', x, z, h: S.face([x, z], [l.x, l.z]) };
    },
    hi: 'Oi! Tudo bem?',
    barks: ['Que lindo!', 'Mais uma foto...', 'Sorria!'],
    talks: [
      ['Com licença, tu tira uma foto minha com o letreiro?', '...', 'Ah, deixa. A câmera tá sem filme mesmo.'],
      ['Vim de Porto Alegre só pra ver as cores do outono.', 'Me disseram que Teewald quer dizer mato de erva-mate, em hunsrik. Que nome bonito!'],
      ['Já provei a cuca, a linguiça e o schmier.', 'Agora só falta voltar pra Kartoffelfest. Batata de tudo que é jeito, me disseram!'],
    ],
    scared: 'Socorro! Alguém chama a Brigada!',
    aimed: 'Ai! Leva a câmera, leva tudo!',
    gun: 'Ai, isso é de verdade? Que medo...',
  },
  {
    id: 'edgar', name: 'PROFESSOR EDGAR', voice: 140,
    look: { seed: 105, top: 'suit', old: true, glasses: [150, 140, 120], beard: 'mustache', feet: 'shoe', colors: { jacket: [96, 84, 62], pants: [74, 66, 56], hair: HAIR.white, skin: SKIN.fair, iris: EYES.gray, tie: [40, 60, 100], shirt: [228, 222, 206] } },
    hat: ['boina', [70, 72, 70]], item: 'livro', itemColor: [110, 40, 34],
    spawn: S => {
      const m = S.L.monumento, q = S.calc(S.nearestCalc(m.x, m.z), 0);
      const dx = q.x - m.x, dz = q.z - m.z, l = Math.hypot(dx, dz) || 1;
      const [x, z] = S.free(m.x + dx / l * 3.4 + dz / l * 1.2, m.z + dz / l * 3.4 - dx / l * 1.2);
      return { mode: 'stand', x, z, h: S.face([x, z], [m.x, m.z]) };
    },
    hi: 'Boa tarde, meu jovem.',
    barks: ['Hmm, interessante...', 'História é tudo, meu jovem.'],
    talks: [
      ['Este é o Monumento ao Imigrante.', 'As famílias vieram do Hunsrück, na Alemanha, atrás de terra pra plantar.', 'Abriram picada no mato com machado, enxada e muita teimosia.'],
      ['Sabe por que a cidade tem dois nomes?', 'Santa Maria do Herval, em português. Teewald, no dialeto dos colonos.', 'Herval é onde cresce a erva-mate. Tee, chá. Wald, mato.'],
      ['Quando o meu pai era guri, a escola era em alemão.', 'Na época da guerra proibiram. Muita gente desaprendeu a escrever, mas nunca a falar.'],
    ],
    scared: 'Isso não é jeito de fazer história, rapaz!',
    aimed: 'Calma, calma. Vamos conversar como gente civilizada.',
    gun: 'Uma arma? Meu jovem, a pena é mais forte que a espada.',
  },
  {
    id: 'lauro', name: 'SEU LAURO', voice: 128,
    look: { seed: 106, top: 'jacket', old: true, colors: { jacket: [80, 92, 70], pants: [90, 80, 64], hair: HAIR.gray, skin: SKIN.tan, iris: EYES.brown, boot: [50, 40, 34] } },
    hat: ['bone', [60, 90, 60]],
    spawn: S => ({ mode: 'sit', seat: S.seat(S.i0x, S.i0z, 'bus') }),
    hi: 'Boa tarde.',
    barks: ['Cadê esse ônibus...', 'Aaah... (bocejo)'],
    talks: [
      ['Tô esperando o ônibus pra Novo Hamburgo.', 'Passa às cinco. Ou às cinco e meia. Depende do humor do motorista.'],
      ['Antigamente, pra resolver qualquer coisa, tinha que ir até Dois Irmãos de carroça.', 'Hoje tem ônibus e asfalto... e a gente continua esperando do mesmo jeito.'],
    ],
    scared: 'Barbaridade! Nem o ônibus chegou e já tem tiroteio!',
    aimed: 'Opa! Não tenho nada, só a passagem!',
    gun: 'Hmm. Guarda isso aí antes que a Brigada passe.',
  },
  {
    id: 'katia', name: 'KÁTIA', voice: 320,
    look: { seed: 119, top: 'shirt', female: true, feet: 'shoe', colors: { jacket: [120, 160, 200], pants: [50, 64, 100], hair: HAIR.dark, skin: SKIN.brown, iris: EYES.brown, boot: [40, 34, 30], button: [240, 240, 240] } },
    hair: 'rabo', item: 'sacola', itemColor: [222, 218, 200],
    spawn: S => ({ mode: 'route', pts: S.routeF(0.02, 0.13, 0.12), speed: 1.25 }),
    hi: 'Oi!',
    barks: ['Que fome...', 'Ai, as minhas costas.', 'Só mais dez minutos...'],
    talks: [
      ['Tô no intervalo do almoço. Meia hora pra comer e esticar as pernas.', 'Trabalho na fábrica de calçados, no setor de costura.'],
      ['Sabia que muito sapato que vai pra fora sai aqui do vale?', 'A gente costura, e quem desfila com ele é a moça da novela.'],
      ['O meu sonho é abrir uma sapataria só minha.', 'Sapato sob medida, de couro bom, que dura vinte anos.'],
    ],
    scared: 'Ai! Que barulho é esse?!',
    aimed: 'Ei! Eu tô no meu intervalo, me deixa!',
    gun: 'Hmm... vou fingir que não vi isso.',
  },
  {
    id: 'bruno', name: 'SEU BRUNO', voice: 160,
    look: { seed: 120, top: 'overall', beard: 'mustache', glasses: true, colors: { jacket: [220, 214, 196], pants: [60, 110, 70], hair: HAIR.brown, skin: SKIN.fair, iris: EYES.green, boot: [70, 50, 36] } },
    item: 'regador', itemColor: [70, 130, 80],
    spawn: S => { const b = S.building(/FLORICULTURA/); const [x, z, h] = b ? S.front(b) : S.near(-235, 160); return { mode: 'stand', x, z, h }; },
    hi: 'Bom dia! Flores fresquinhas!',
    barks: ['Olha a hortênsia!', 'Flores fresquinhas!'],
    talks: [
      ['Hortênsia, crisântemo, violeta... e muda de araucária pra quem tem paciência.', 'Araucária que tu planta hoje dá pinhão pros teus netos.'],
      ['No outono sai muito crisântemo.', 'Finados tá chegando, e as senhoras daqui não deixam túmulo sem flor.'],
    ],
    scared: 'As minhas violetas! Para com isso!',
    aimed: 'Calma, calma! Quer uma flor? Leva uma flor!',
    gun: 'Troca isso aí por um vaso de violeta, rapaz. Faz melhor pra alma.',
  },

  // ---------------- Praça 10 de Abril ----------------
  {
    id: 'valdir', name: 'SEU VALDIR', voice: 110,
    look: { seed: 107, top: 'jacket', old: true, beard: 'mustache', colors: { jacket: [52, 44, 40], pants: [110, 100, 84], hair: HAIR.gray, skin: SKIN.tan, iris: EYES.brown, boot: [40, 32, 28], shirt: [180, 40, 34] } },
    hat: ['gaucho', [34, 30, 30]], item: 'cuia', pose: 'hold', thermos: true,
    spawn: S => ({ mode: 'sit', seat: S.seat(S.L.praca.c[0], S.L.praca.c[1], 'bench', S.L.praca.poly) }),
    hi: 'Buenas, tchê!',
    barks: ['Aceita um mate?', 'Mas bah...', 'Shhhlurrp...'],
    talks: [
      ['Senta aí, tchê. Aceita um mate?', '...', 'Não toma? Mas bah, que coisa!', 'Pois então eu tomo por nós dois.'],
      ['Essa praça é a sala de visita da cidade.', 'Aqui a gente fica sabendo de tudo antes do jornal.', 'Quem casou, quem brigou, quem vendeu a vaca...'],
      ['Tá vendo as araucárias? Logo começa a cair pinhão.', 'Pinhão cozido no fogão a lenha, com um mate do lado... Isso é que é vida.'],
    ],
    scared: 'Barbaridade! Quase derrubo a cuia!',
    aimed: 'Tchê, tu tá loco? Larga isso!',
    gun: 'Hmm, guri armado na praça... No meu tempo era só bodoque.',
  },
  {
    id: 'erna', name: 'DONA ERNA', voice: 280,
    look: { seed: 108, top: 'dress', female: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [70, 110, 80], pants: [200, 170, 150], hair: [[120, 104, 80], [176, 160, 130], [220, 208, 180]], skin: SKIN.rosy, apron: [236, 232, 220], boot: [70, 50, 40] } },
    hair: 'coque', skirt: { color: [70, 110, 80], long: true, apron: [236, 232, 220] }, pose: 'vendor',
    spawn: S => {
      const st = S.stallSpot();
      const at = S.frame(st.x, st.z, st.rot), [x, z] = at(0, -0.72);
      return { mode: 'stand', x, z, h: st.rot, stall: { ...st, text: 'PINHÃO E CUCA' } };
    },
    hi: 'Olha a cuca!',
    barks: ['Pinhão quentinho!', 'Cuca de uva, fresquinha!', 'Pão caseiro!'],
    talks: [
      ['Pinhão quentinho! Cuca de uva! Pão caseiro!', 'Tudo feito hoje de manhã, no forno de barro lá do sítio.'],
      ['O pinhão é das araucárias lá de casa.', 'Tem que juntar do chão, que subir na araucária ninguém sobe. É espinho pra tudo que é lado!'],
      ['Tu é neto de quem, mesmo?', 'Aqui todo mundo é parente de alguém.', 'Deixa, depois eu descubro. Eu sempre descubro.'],
    ],
    scared: 'Credo! Vai espantar a freguesia!',
    aimed: 'Leva a cuca, leva! Mas abaixa isso!',
    gun: 'Guri, com uma coisa dessas na mão tu não leva cuca nenhuma.',
  },
  {
    id: 'joao', name: 'JOÃOZINHO', voice: 520, kid: true,
    look: { seed: 109, top: 'polo', short: true, bottom: 'shorts', feet: 'sneaker', colors: { jacket: [230, 190, 40], collar: [40, 120, 60], pants: [50, 80, 150], sock: [232, 232, 226], hair: HAIR.brown, skin: SKIN.fair, iris: EYES.green, boot: [220, 218, 210] } },
    spawn: S => ({ mode: 'wander', poly: S.L.praca.poly, speed: 2.9, rest: [0.4, 1.6] }),
    hi: 'Oi, moço!',
    barks: ['Tu tá com ele!', 'Lá vem!', 'Hehehe!'],
    talks: [
      ['Tu viu o meu cusco? É um caramelo, desse tamanho!', 'Ele foge toda vez que o sino da igreja toca.'],
      ['Sabia que tem um peixe gigante no rio?', 'O Seu Arno diz que pegou um jundiá maior que ele!', 'Eu acho que é mentira. Mas é mentira das boa.'],
      ['Pega-pega! Tu tá com ele!', '...', 'Ah, tu não vai correr? Que chato.'],
    ],
    scared: 'MÃÃÃE!',
    aimed: 'Não vale! Eu não tô brincando!',
    gun: 'Uau, é de verdade? A mãe disse que não pode brincar com isso.',
  },
  {
    id: 'ana', name: 'ANA', voice: 360,
    look: { seed: 110, top: 'sweater', female: true, longHair: true, band: [150, 40, 60], feet: 'shoe', colors: { jacket: [200, 200, 210], pants: [40, 50, 90], hair: HAIR.auburn, skin: SKIN.fair, iris: EYES.green, boot: [40, 36, 34], lip: [176, 84, 90] } },
    hair: 'longo', item: 'livro', itemColor: [60, 90, 150], pose: 'phone',
    spawn: S => {
      const ph = S.phone(S.L.praca.c[0], S.L.praca.c[1]);
      if (!ph) { const [x, z] = S.free(S.L.praca.c[0] + 6, S.L.praca.c[1]); return { mode: 'stand', x, z, h: 0 }; }
      const [x, z] = S.frame(ph.x, ph.z, ph.rot)(0, 0.9);
      return { mode: 'stand', x, z, h: ph.rot + Math.PI };
    },
    hi: 'Oi.',
    barks: ['Atende, atende...', 'Alô? Alô?', 'Ai, caiu a ficha.'],
    talks: [
      ['Tô esperando a minha prima ligar de volta.', 'Comprei três fichas e ela fala, fala, fala...'],
      ['Ano que vem eu vou estudar em Novo Hamburgo.', 'Vou sentir falta daqui. Mas do ônibus das seis da manhã, não.'],
      ['Tu foi no baile do salão sábado?', 'A bandinha tocou até as três. A minha vó dançou mais que eu!'],
    ],
    scared: 'Ai! Tô ligando pra polícia, tá?',
    aimed: 'Para! Eu tô no telefone!',
    gun: 'Hã... tu tá bem? Por que tu tá com isso?',
  },
  {
    id: 'alfredo', name: 'SEU ALFREDO', voice: 120,
    look: { seed: 122, top: 'suit', old: true, feet: 'shoe', colors: { jacket: [96, 70, 50], pants: [80, 64, 50], hair: HAIR.white, skin: SKIN.fair, iris: EYES.blue, tie: [60, 50, 40], boot: [40, 30, 24] } },
    hat: ['chapeu', [70, 60, 50]], item: 'bengala', pose: 'cane',
    spawn: S => ({ mode: 'wander', poly: S.L.praca.poly, speed: 0.75, rest: [2, 5] }),
    hi: 'Boa tarde, moço.',
    barks: ['Devagar, Wilma...', 'Ai, a minha coluna.'],
    talks: [
      ['Cinquenta anos de casados, e ainda damos a volta na praça todo dia.', 'Ela anda na frente e eu obedeço. É o segredo do casamento.'],
      ['Quando eu era moço, eu levava a Wilma no baile de carroça.', 'Hoje é ela que me leva. De braço.'],
    ],
    scared: 'Wilma! Abaixa, Wilma!',
    aimed: 'Moço... eu tenho oitenta anos. Precisa disso?',
    gun: 'No meu tempo, a gente resolvia as coisas conversando, moço.',
  },
  {
    id: 'wilma', name: 'DONA WILMA', voice: 290,
    look: { seed: 123, top: 'sweater', female: true, old: true, glasses: true, band: [230, 220, 230], bottom: 'stockings', feet: 'shoe', colors: { jacket: [180, 150, 190], pants: [120, 110, 120], hair: HAIR.white, skin: SKIN.rosy, iris: EYES.blue, boot: [80, 60, 50] } },
    hair: 'coque', skirt: { color: [96, 80, 110], long: true }, item: 'sacola', itemColor: [200, 120, 140],
    spawn: () => ({ mode: 'follow', leader: 'alfredo', off: [0.72, 0.2] }),
    hi: 'Oi, querido!',
    barks: ['Vem, Alfredo!', 'Que vento!'],
    talks: [
      ['Não liga pro Alfredo. Ele conta isso pra todo mundo.', 'Mas é verdade, viu?'],
      ['Tu tá bem agasalhado? Esse vento de outono pega.', 'Põe um casaco, menino!'],
    ],
    scared: 'Alfredo! Alfredo, corre!',
    aimed: 'Que é isso, menino? Isso não se faz!',
    gun: 'Menino, a tua mãe sabe que tu anda com isso?',
  },
  {
    id: 'paula', name: 'PAULA', voice: 350,
    look: { seed: 121, top: 'polo', female: true, short: true, feet: 'shoe', colors: { jacket: [140, 30, 26], collar: [240, 230, 210], pants: [30, 30, 34], hair: HAIR.red, skin: SKIN.fair, iris: EYES.green, boot: [30, 28, 28], lip: [180, 70, 70] } },
    hair: 'rabo',
    spawn: S => { const b = S.building(/TEEWALD STORE/); const [x, z, h] = b ? S.front(b) : S.near(-165, 42); return { mode: 'stand', x, z, h }; },
    hi: 'Oi! Bem-vindo!',
    barks: ['Promoção de caneca!', 'Entra, entra!', 'Camiseta da Teewald!'],
    talks: [
      ['Bem-vindo à Teewald Store! Tem camiseta, boné, caneca, chaveiro...', 'Tudo com o letreiro da cidade. Os turistas adoram.'],
      ['A loja tá fechada pra balanço.', 'Então eu fico aqui fora, olhando o movimento. Que é nenhum.'],
    ],
    scared: 'Ai! Fecha a loja, fecha a loja!',
    aimed: 'O caixa tá vazio, juro!',
    gun: 'Ai, guarda isso, vai assustar os turistas!',
  },
  {
    id: 'romeu', name: 'SEU ROMEU', voice: 150,
    look: { seed: 115, top: 'suit', beard: 'mustache', feet: 'shoe', colors: { jacket: [70, 74, 80], pants: [62, 64, 70], hair: HAIR.dark, skin: SKIN.olive, iris: EYES.brown, tie: [130, 30, 34], boot: [26, 22, 20] } },
    item: 'livro', itemColor: [200, 170, 110],
    spawn: S => { const p = S.L.prefeitura; const [x, z, h] = p ? S.front(p) : S.near(-168, 176); return { mode: 'stand', x, z, h }; },
    hi: 'Bom dia, cidadão!',
    barks: ['Cadê o carimbo...', 'Bom dia, cidadão!', 'Protocolo, protocolo...'],
    talks: [
      ['Prefeitura Municipal, bom dia!', 'Alvará, certidão, segunda via do IPTU?', 'Não? Então tu é o primeiro que vem aqui só pra passear.'],
      ['O município é pequeno, mas o trabalho é grande.', 'Estrada de chão pra patrolar, ponte, escola, posto de saúde...'],
      ['A Kartoffelfest é a festa mais importante da cidade.', 'Vem gente de toda a serra comer batata. Frita, assada, recheada, pão de batata...'],
    ],
    scared: 'Isso é um absurdo! Vou registrar ocorrência!',
    aimed: 'Isso é desacato! Abaixa isso!',
    gun: 'O senhor tem porte pra isso aí? Deixa pra lá, nem quero saber.',
  },

  // ---------------- Igreja Matriz e cemitério ----------------
  {
    id: 'bernardo', name: 'PADRE BERNARDO', voice: 135,
    look: { seed: 111, top: 'cassock', old: true, glasses: [160, 150, 120], feet: 'shoe', colors: { jacket: [28, 26, 28], pants: [28, 26, 28], hair: HAIR.white, skin: SKIN.fair, button: [64, 62, 64], boot: [24, 22, 22] } },
    skirt: { color: [28, 26, 28], len: -0.8 },
    spawn: S => { const [x, z] = S.free(...S.church(-1.5, 21.5)); return { mode: 'stand', x, z, h: S.L.church.rot }; },
    hi: 'Deus te abençoe, meu filho.',
    barks: ['Paz e bem.', 'Deus te abençoe.'],
    talks: [
      ['Seja bem-vindo à Igreja Matriz de Nossa Senhora Auxiliadora.', 'A missa de domingo é em português...', '...mas o terço das senhoras ainda é rezado em alemão.'],
      ['O sino da torre tem mais idade que eu.', 'Quando ele toca, a cidade inteira para um instantinho. É bonito de ver.'],
      ['Dizem que os colonos traziam as pedras de carroça, cada família um pouco.', 'É assim que se constrói uma comunidade: cada um carregando o que pode.'],
    ],
    scared: 'Meu filho! Aqui é a casa de Deus!',
    aimed: 'Abaixa isso, meu filho. Ninguém aqui é teu inimigo.',
    gun: 'Meu filho, a casa de Deus não é lugar pra armas.',
  },
  {
    id: 'irma', name: 'DONA IRMA', voice: 270,
    look: { seed: 112, top: 'dress', female: true, old: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [34, 30, 34], pants: [40, 36, 40], hair: HAIR.white, skin: SKIN.fair, iris: EYES.gray, boot: [30, 26, 26] } },
    hat: ['lenco', [40, 36, 42]], skirt: { color: [34, 30, 34], long: true },
    spawn: S => ({ mode: 'sit', seat: S.seat(...S.church(9.5, 19.7), 'bench') }),
    hi: 'Hmpf. Boa tarde.',
    barks: ['Ave Maria, cheia de graça...', 'Hmpf.', 'Esses jovens de hoje...'],
    talks: [
      ['Vim acender uma vela pro meu falecido.', 'Quarenta e dois anos de casados. Brigamos todo santo dia, e eu sinto falta de cada briga.'],
      ['Tu é novo por aqui? Vai na missa domingo?', 'Senta do lado esquerdo. O direito é da família Schneider desde 1950.'],
      ['Cuidado com o Seu Valdir lá da praça.', 'Ele oferece um mate e depois conta a mesma história três vezes.'],
    ],
    scared: 'Valei-me, Nossa Senhora!',
    aimed: 'Que pouca vergonha! Abaixa isso já!',
    gun: 'Que pouca vergonha, armado na frente da igreja!',
  },
  {
    id: 'rudi', name: 'RUDI, O CARTEIRO', voice: 175,
    look: { seed: 114, top: 'polo', short: true, feet: 'shoe', colors: { jacket: [236, 196, 40], collar: [30, 70, 150], pants: [36, 60, 120], hair: HAIR.dark, skin: SKIN.brown, iris: EYES.brown, boot: [30, 28, 28] } },
    hat: ['bone', [30, 70, 150]], item: 'sacola', itemColor: [236, 196, 40],
    spawn: S => {
      const c = S.L.church, pts = S.sidewalk('Rua 12 de Maio', c.x, c.z, 90);
      if (pts.length > 2) return { mode: 'route', pts, speed: 1.45 };
      const [x, z] = S.free(...S.church(4, 24)); return { mode: 'stand', x, z, h: c.rot };
    },
    hi: 'Correio!',
    barks: ['Correio!', 'Mais uma rua...', 'Bom dia!'],
    talks: [
      ['Carta pra... não, não é pra ti.', 'Eu conheço cada portão desta cidade. E cada cachorro também.'],
      ['O pior cusco da cidade mora aqui na 12 de Maio.', 'Ele late, eu corro. Faz quinze anos que é assim.'],
      ['Chegou postal da Alemanha pra Dona Hilda.', 'Os primos de lá dizem que o hunsrik daqui é mais antigo que o deles!'],
    ],
    scared: 'Opa! Eu só entrego carta, não quero confusão!',
    aimed: 'Calma! É só correspondência!',
    gun: 'Hmm, isso aí não vai no envelope, né?',
  },
  {
    id: 'otto', name: 'SEU OTTO', voice: 105,
    look: { seed: 113, top: 'overall', pattern: 'plaid', accent: [40, 50, 60], old: true, beard: 'full', colors: { jacket: [120, 130, 150], pants: [44, 60, 96], hair: HAIR.gray, skin: SKIN.rosy, boot: [60, 44, 30] } },
    hat: ['bone', [70, 90, 60]], item: 'rastelo', pose: 'rake',
    spawn: S => { const c = S.L.cemetery.c, [x, z] = S.free(c[0], c[1], 0.5, 12); return { mode: 'stand', x, z, h: S.face([x, z], S.L.church ? [S.L.church.x, S.L.church.z] : c) }; },
    hi: 'Hm. Bom dia.',
    barks: ['Folha, folha, folha...', 'Hm.'],
    talks: [
      ['Aqui descansa muita gente boa.', 'Os nomes nas lápides são quase todos alemães: Schmitt, Klein, Becker, Müller...', 'É a história da cidade escrita em pedra.'],
      ['No outono o serviço é só folha.', 'Eu junto de manhã, o vento espalha tudo de tarde.', 'Mas não reclamo. Folha não discute.'],
      ['Dia de Finados isso aqui fica cheio de flor.', 'Crisântemo, cravo, vela... e muita conversa no portão.'],
    ],
    scared: 'Ei! Aqui só tem gente quieta. Deixa assim!',
    aimed: 'Rapaz... guarda isso. Aqui já tem gente demais.',
    gun: 'Arma no cemitério? Aqui ninguém mais precisa de susto.',
  },

  // ---------------- Kartoffelfest e campo ----------------
  {
    id: 'ivo', name: 'SEU IVO', voice: 112, bulk: 1.14,
    look: { seed: 116, top: 'shirt', pattern: 'plaid', accent: [240, 236, 226], beard: 'mustache', colors: { jacket: [176, 40, 36], pants: [96, 70, 44], hair: HAIR.red, skin: SKIN.rosy, iris: EYES.blue, boot: [70, 48, 30] } },
    hat: ['tirol', [56, 84, 54]], item: 'caneca', pose: 'hold',
    spawn: S => {
      const k = S.L.kartoffel, at = S.frame(k.x, k.z, k.rot), [x, z] = S.free(...at(-3, 9.5));
      return { mode: 'stand', x, z, h: k.rot };
    },
    hi: 'Prost! Bem-vindo!',
    barks: ['Prost!', 'Kartoffel!', 'Que festa vai ser!'],
    talks: [
      ['Bem-vindo ao pavilhão da Kartoffelfest!', 'Na festa isso aqui lota: bandinha, chope, dança e batata de todo jeito.', 'Kartoffel, em alemão. Grumbeer, como diziam os antigos.'],
      ['Batata frita, batata recheada, sopa de batata, pão de batata...', 'E de sobremesa? Cuca. Ninguém é de ferro.'],
      ['Tu já viu a barraca de tiro ali no canto?', 'Derruba as latas e ganha... bom, ganha o respeito do pessoal.', 'O prêmio era um pinguim de geladeira, mas acabou.'],
    ],
    scared: 'Calma, piá! A barraca de tiro é ali no canto!',
    aimed: 'Ô! Nas latas, não em mim!',
    gun: 'Opa, vai na barraca de tiro? É ali no canto, nas latas!',
  },
  {
    id: 'gertrud', name: 'DONA GERTRUD', voice: 260, bulk: 1.15,
    look: { seed: 117, top: 'dress', female: true, old: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [150, 40, 40], pants: [200, 170, 150], hair: HAIR.gray, skin: SKIN.rosy, iris: EYES.blue, apron: [240, 238, 230], boot: [60, 44, 36] } },
    hair: 'coque', skirt: { color: [150, 40, 40], long: true, apron: [240, 238, 230] }, item: 'cesta',
    spawn: S => {
      const k = S.L.kartoffel, at = S.frame(k.x, k.z, k.rot), [x, z] = S.free(...at(5, 3));
      return { mode: 'stand', x, z, h: k.rot + 0.6 };
    },
    hi: 'Oi, querido!',
    barks: ['Ai, que calor dessa cozinha.', 'Batata, batata...', 'Cadê a minha colher de pau?'],
    talks: [
      ['Só hoje eu descasquei três sacos de batata.', 'Os braços já não são os mesmos, mas a minha sopa continua a melhor da serra.'],
      ['O segredo do bolinho de batata?', 'Noz-moscada. Uma pitadinha.', 'Mas não conta pra ninguém, viu?'],
    ],
    scared: 'Mein Gott! Quase caiu a panela!',
    aimed: 'Ai, ai! Eu só cozinho, querido!',
    gun: 'Querido, larga isso e vem descascar batata, que é mais útil.',
  },
  {
    id: 'tiago', name: 'TIAGO', voice: 200,
    look: { seed: 118, top: 'jersey', short: true, number: '9', bottom: 'shorts', feet: 'cleat', colors: { jacket: [180, 30, 30], collar: [240, 240, 236], pants: [24, 24, 28], sock: [180, 30, 30], hair: HAIR.dark, skin: SKIN.brown, iris: EYES.brown, boot: [24, 24, 26] } },
    item: 'bola', pose: 'ball',
    spawn: S => { const [x, z, h] = S.sideline(); return { mode: 'stand', x, z, h }; },
    hi: 'E aí, beleza?',
    barks: ['Passa a bola!', 'Gooool!', 'Bora, bora!'],
    talks: [
      ['Domingo tem jogo contra o time do Morro Reuter.', 'Clássico da região. Ninguém quer perder pro vizinho.'],
      ['Eu era goleiro, mas virei centroavante.', 'Agora o time leva gol E não faz gol. Mas é divertido.'],
      ['No inverno esse campo vira uma lama só.', 'Aí não é mais futebol, é luta livre com bola.'],
    ],
    scared: 'Ô! Aqui é campo de futebol, não estande de tiro!',
    aimed: 'Ei! Eu só tenho a bola!',
    gun: 'Tchê, deixa isso aí no vestiário, né?',
  },
];

// reservas para quem não tem fala própria
export const GENERIC = {
  scared: ['Ai! Que foi isso?!', 'Socorro!', 'Tá louco?!'],
  aimed: ['Ei! Abaixa isso!', 'Calma, calma!'],
  gun: ['Hmm... guarda isso, tá?'],
  excuse: ['Com licença!', 'Opa, licença.', 'Dá licença?'],
  afraid: ['Me deixa em paz!', 'Sai de perto de mim!', 'Não chega perto!'],
};
