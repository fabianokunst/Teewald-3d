import { HAIR, SKIN, EYES } from './heroTexture.js';

// Moradores de Teewald: aparência, onde ficam e o que falam.
// A cidade vive com medo: animais aparecem mortos e sem sangue, gente some do
// telefone, o sino toca sozinho. Ninguém brinca; uns falam baixo, outros encaram.
// look: roupa e cores do atlas (heroTexture.js) · hat/hair/skirt/item: peças extras (npcModels.js)
// spawn(S): posição e comportamento, com os pontos de referência de npcs.js (S)
//   stand { x, z, h } · sit { seat } · route { pts, speed } · wander { poly, speed } · follow { leader, off }
// stare: parado, vira o corpo devagar para acompanhar o jogador
// talks: conversas (uma por vez, em sequência) · barks: falas soltas quando o jogador passa perto
// hi: o que diz quando o jogador chega · scared: depois de um tiro · aimed: com a arma apontada
// gun: na primeira conversa com a arma na mão
// jeito (npcs.js + npcActs.js): idle = gestos de parado (ACTS), talkStyle = calm | lively | nervous | stiff,
//   greet = gesto do cumprimento, devout = se benze (susto, sino), barkActs = gesto junto de cada fala solta,
//   stops = onde olha nas paradas do caminho ('river' | 'house'), stopAct = o que faz nelas

export const NPC_DEFS = [
  // ---------------- Calçadão do Rio Cadeia ----------------
  {
    id: 'arno', name: 'SEU ARNO', voice: 118,
    idle: ['glance', 'sky'], talkStyle: 'calm', greet: 'nod',
    look: { seed: 101, top: 'shirt', pattern: 'plaid', accent: [36, 24, 22], old: true, beard: 'full', colors: { jacket: [118, 46, 40], pants: [58, 62, 70], hair: HAIR.gray, skin: SKIN.rosy, boot: [62, 46, 36] } },
    hat: ['palha', [170, 150, 104]], item: 'vara', pose: 'fish',
    spawn: S => { const p = S.calc(-30, -0.82); return { mode: 'stand', x: p.x, z: p.z, h: p.river }; },
    hi: 'Hm.',
    barks: ['O rio tá quieto demais.', 'Nem um peixe hoje...', '...'],
    talks: [
      ['Não pego nada faz uma semana.', 'Os peixes sumiram. Ou alguma coisa tá comendo eles antes de mim.'],
      ['Domingo de noite eu vi uma coisa bebendo água ali na outra margem.', 'Agachada. Do tamanho de um piá.', 'Quando eu acendi a lanterna, os olhos brilharam vermelho. Aí sumiu no mato, aos pulos.'],
      ['Agora eu só pesco de dia.', 'E tu devia fazer o mesmo. Antes de escurecer, pra casa.'],
    ],
    scared: 'Mein Gott! Que foi isso?!',
    aimed: 'Abaixa isso... eu não sou o bicho.',
    gun: 'Arma, é? Bom. Mas não sei se bala resolve.',
  },
  {
    id: 'hilda', name: 'DONA HILDA', voice: 300,
    idle: ['hug', 'glance', 'sign'], talkStyle: 'nervous', devout: true, stops: 'river', stopAct: ['call1', 'glance'], barkActs: ['call1', 'call1'],
    look: { seed: 102, top: 'sweater', female: true, old: true, glasses: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [98, 44, 52], pants: [64, 60, 62], hair: HAIR.gray, skin: SKIN.fair, boot: [56, 44, 38], lip: [140, 84, 86] } },
    hat: ['lenco', [84, 64, 96]], skirt: { color: [62, 58, 64], long: true },
    spawn: S => ({ mode: 'route', pts: S.route(-46, 16, 0.14), speed: 0.85 }),
    hi: 'Tu não viu uma gata?',
    barks: ['Mimi... Mimi?', 'Psst, psst... Mimi?', 'Ela sempre volta pra janta...'],
    talks: [
      ['Tu não viu uma gata cinza por aí? A Mimi.', 'Saiu segunda de noite e não voltou.', 'Ela nunca dormiu fora. Nunca.'],
      ['A vizinha achou o gato dela atrás do galpão.', 'Duro. Com dois furinhos no pescoço.', 'Não... a Mimi não. A Mimi tá escondida. Tá com medo, só isso.'],
      ['A minha vó contava dessas coisas em hunsrik, perto do fogão.', 'Eu achava que era só pra assustar criança.'],
    ],
    scared: 'Ai, Nossa Senhora!',
    aimed: 'Não, menino... por favor.',
    gun: 'Armado... Tu também tá com medo, né?',
  },
  {
    id: 'lucas', name: 'LUCAS', voice: 190,
    idle: ['hips', 'glance', 'scratch'], talkStyle: 'lively', stops: 'river', stopAct: ['call', 'glance'], barkActs: ['call', 'call', 'call1'],
    look: { seed: 103, top: 'jacket', feet: 'sneaker', colors: { jacket: [44, 58, 92], collar: [150, 150, 146], pants: [34, 36, 46], hair: HAIR.brown, skin: SKIN.tan, iris: EYES.brown, boot: [150, 148, 140] } },
    hat: ['bone', [96, 40, 36]],
    spawn: S => ({ mode: 'route', pts: S.route(-130, 40, -0.16), speed: 1.5 }),
    hi: 'Ei! Tu viu um cachorro preto?',
    barks: ['Bóris! Ô, Bóris!', 'Bóris! Vem cá!', 'Fiuuu... Bóris!'],
    talks: [
      ['Tu viu um cachorro preto, grande, de coleira vermelha? O Bóris.', 'Ele arrebentou a corrente ontem de noite. Latia pro mato feito louco.', 'Depois parou de latir. Parou de repente.'],
      ['A corrente tava arrebentada pra fora do pátio, não pra dentro.', 'Ele não fugiu. Alguma coisa puxou ele.'],
      ['Se tu achar ele... mesmo que...', 'Me avisa, tá? Eu moro na última casa antes da ponte.'],
    ],
    scared: 'Que foi isso?! Bóris?!',
    aimed: 'Ei! Calma! Eu só tô procurando o meu cachorro!',
    gun: 'Tu tá armado. Ótimo. Se ver o bicho, não pensa duas vezes.',
  },
  {
    id: 'marlene', name: 'MARLENE', voice: 330,
    idle: ['glance'], talkStyle: 'lively',
    look: { seed: 104, top: 'jacket', female: true, feet: 'sneaker', colors: { jacket: [184, 156, 58], pants: [52, 66, 92], hair: HAIR.dark, skin: SKIN.olive, iris: EYES.brown, boot: [150, 146, 138], lip: [140, 74, 74] } },
    hair: 'rabo', item: 'camera', pose: 'photo',
    spawn: S => {
      const l = S.L.letreiro, at = S.frame(l.x, l.z, l.rot), [x, z] = S.free(...at(0.6, 5));
      return { mode: 'stand', x, z, h: S.face([x, z], [l.x, l.z]) };
    },
    hi: 'Oi. Tu é daqui?',
    barks: ['Ninguém quer falar...', 'Mais uma foto.', 'Essa cidade tá escondendo alguma coisa.'],
    talks: [
      ['Sou repórter de um jornal de Porto Alegre. Vim por causa dos animais mortos.', 'Já são onze casos em dez dias. Ovelha, cabrito, galinha, cachorro.', 'Todos sem sangue. Nenhuma gota.'],
      ['Aqui ninguém quer falar comigo.', 'Fecham a janela quando eu passo. A Prefeitura diz que é cachorro do mato.', 'Cachorro do mato não bebe o sangue e deixa a carne.'],
      ['Revelei um filme ontem.', 'Na foto da beira do mato tem uma coisa agachada entre as araucárias.', 'Eu não vi nada na hora.'],
    ],
    scared: 'Meu Deus! Que foi isso?!',
    aimed: 'Calma... eu sou só jornalista. Abaixa isso.',
    gun: 'Tu anda armado... Tu também viu alguma coisa, né?',
  },
  {
    id: 'edgar', name: 'PROFESSOR EDGAR', voice: 140, stare: true,
    idle: ['read', 'back', 'glance'], talkStyle: 'calm',
    look: { seed: 105, top: 'suit', old: true, glasses: [150, 140, 120], beard: 'mustache', feet: 'shoe', colors: { jacket: [74, 68, 56], pants: [62, 58, 52], hair: HAIR.white, skin: SKIN.fair, iris: EYES.gray, tie: [44, 50, 70], shirt: [210, 206, 194] } },
    hat: ['boina', [56, 58, 56]], item: 'livro', itemColor: [84, 36, 32],
    spawn: S => {
      const m = S.L.monumento, q = S.calc(S.nearestCalc(m.x, m.z), 0);
      const dx = q.x - m.x, dz = q.z - m.z, l = Math.hypot(dx, dz) || 1;
      const [x, z] = S.free(m.x + dx / l * 3.4 + dz / l * 1.2, m.z + dz / l * 3.4 - dx / l * 1.2);
      return { mode: 'stand', x, z, h: S.face([x, z], [m.x, m.z]) };
    },
    hi: 'Boa tarde, meu jovem.',
    barks: ['Já aconteceu antes...', 'Os antigos sabiam.'],
    talks: [
      ['Os primeiros colonos vieram do Hunsrück e abriram picada nesse mato.', 'Nos diários deles tem uma coisa que ninguém gosta de lembrar.', 'Criação morta na beira da roça, sem sangue. Eles chamavam de Blutsauger. O chupador de sangue.'],
      ['Em setenta e oito aconteceu de novo. Eu era moço.', 'Morreu criação em três linhas. Depois parou, do nada.', 'Os jornais nem chegaram a saber. A cidade preferiu esquecer.'],
      ['Herval vem de erva-mate. Teewald, em hunsrik: mato do chá.', 'Bonito, não é? Mas os antigos tinham outro respeito por esse mato.', 'Ninguém entrava nele depois do sol posto.'],
    ],
    scared: 'Isso não vai resolver nada, rapaz!',
    aimed: 'Calma. Eu sou só um velho com um livro.',
    gun: 'Uma arma. Os colonos também tinham espingarda. Não adiantou muito.',
  },
  {
    id: 'lauro', name: 'SEU LAURO', voice: 128,
    idle: ['watch', 'road', 'lean', 'glance'], talkStyle: 'calm', greet: 'nod',
    look: { seed: 106, top: 'jacket', old: true, colors: { jacket: [66, 74, 60], pants: [76, 70, 58], hair: HAIR.gray, skin: SKIN.tan, iris: EYES.brown, boot: [46, 38, 32] } },
    hat: ['bone', [52, 66, 52]], luggage: true,
    spawn: S => ({ mode: 'sit', seat: S.seat(S.i0x, S.i0z, 'bus') }),
    hi: 'Hm.',
    barks: ['Esse ônibus não vem...', 'Eu vou embora daqui.'],
    talks: [
      ['Tô esperando o ônibus pra Novo Hamburgo. Desde o meio-dia.', 'Ontem também não passou. Ninguém sabe dizer por quê.'],
      ['As ovelhas do meu cunhado amanheceram no potreiro, todas deitadas em fila.', 'Sem um arranhão. Só dois furos no pescoço.', 'Eu vou pra casa da minha filha. Não volto tão cedo.'],
    ],
    scared: 'Barbaridade! Que foi isso?',
    aimed: 'Não atira... Eu só quero ir embora.',
    gun: 'Faz bem andar armado. Eu também andaria, se tivesse coragem de ficar.',
  },
  {
    id: 'katia', name: 'KÁTIA', voice: 320,
    idle: ['glance', 'scratch'], talkStyle: 'nervous', stops: 'river', stopAct: ['glance', 'hug'],
    look: { seed: 119, top: 'shirt', female: true, feet: 'shoe', colors: { jacket: [100, 124, 146], pants: [46, 54, 76], hair: HAIR.dark, skin: SKIN.brown, iris: EYES.brown, boot: [40, 34, 30], button: [200, 200, 200] } },
    hair: 'rabo', item: 'sacola', itemColor: [170, 166, 150],
    spawn: S => ({ mode: 'route', pts: S.routeF(0.02, 0.13, 0.12), speed: 1.35 }),
    hi: 'Oi...',
    barks: ['Eu não volto mais a pé de noite.', 'Tu ouviu isso?'],
    talks: [
      ['Eu trabalho no turno da noite, na fábrica de calçados.', 'Voltava a pé pelo calçadão, uma da manhã. Voltava.'],
      ['Terça, no meio do caminho, eu ouvi alguma coisa me acompanhando pelo mato, do outro lado do rio.', 'Parava quando eu parava. Pulava quando eu andava.', 'Eu corri até a praça e não olhei pra trás.'],
      ['Agora o meu irmão me busca de carro.', 'E deixa o farol aceso até eu entrar em casa.'],
    ],
    scared: 'Ai! Que foi isso?!',
    aimed: 'Não! Por favor!',
    gun: 'Tu anda armado... Faz bem. Faz bem.',
  },
  {
    id: 'bruno', name: 'SEU BRUNO', voice: 160, stare: true,
    idle: ['water', 'water', 'glance', 'scratch'], talkStyle: 'calm',
    look: { seed: 120, top: 'overall', beard: 'mustache', glasses: true, colors: { jacket: [180, 176, 164], pants: [52, 80, 58], hair: HAIR.brown, skin: SKIN.fair, iris: EYES.green, boot: [62, 46, 34] } },
    item: 'regador', itemColor: [62, 96, 70],
    spawn: S => { const b = S.building(/FLORICULTURA/); const [x, z, h] = b ? S.front(b) : S.near(-235, 160); return { mode: 'stand', x, z, h }; },
    hi: 'Boa tarde.',
    barks: ['Mais uma coroa...', 'Crisântemo. Só crisântemo.'],
    talks: [
      ['Encomendaram uma coroa de flores pra amanhã cedo.', 'Pagaram adiantado. Não quiseram dizer pra quem era.'],
      ['As flores do canteiro dos fundos amanheceram pisoteadas.', 'Pegadas fundas, de três dedos. Não é de bicho que eu conheça.'],
    ],
    scared: 'Meu Deus! O que foi isso?',
    aimed: 'Calma... calma. Não tem nada aqui pra levar.',
    gun: 'Se for pro mato com isso, leva uma lanterna também.',
  },

  // ---------------- Praça 10 de Abril ----------------
  {
    id: 'valdir', name: 'SEU VALDIR', voice: 110,
    idle: ['lean', 'glance', 'sky'], talkStyle: 'calm',
    look: { seed: 107, top: 'jacket', old: true, beard: 'mustache', colors: { jacket: [46, 40, 38], pants: [86, 80, 70], hair: HAIR.gray, skin: SKIN.tan, iris: EYES.brown, boot: [38, 30, 26], shirt: [120, 40, 34] } },
    hat: ['gaucho', [30, 28, 28]], item: 'cuia', pose: 'hold', thermos: true,
    spawn: S => ({ mode: 'sit', seat: S.seat(S.L.praca.c[0], S.L.praca.c[1], 'bench', S.L.praca.poly) }),
    hi: 'Buenas.',
    barks: ['Vai escurecer cedo hoje.', 'Hmm...', 'Shhhlurrp...'],
    talks: [
      ['Senta aí. Não tem mais ninguém na praça mesmo.', 'Antes, a essa hora, tava cheia. Hoje o povo se tranca às cinco.'],
      ['Em setenta e oito foi igual. Eu tinha a tua idade.', 'Morria criação, sumia cachorro, e os velhos não deixavam a gente sair de noite.', 'Um dia parou. Ninguém nunca explicou.'],
      ['Tá vendo a beira do mato, lá pros lados da igreja?', 'Eu não chego perto. Nem de dia.'],
    ],
    scared: 'Barbaridade! Que foi isso?',
    aimed: 'Tchê, abaixa isso. Eu sou velho, mas não sou bobo.',
    gun: 'Arma na cinta. Bom. Se aparecer, mira na cabeça.',
  },
  {
    id: 'erna', name: 'DONA ERNA', voice: 280,
    idle: ['pack', 'pack', 'sign', 'hug'], talkStyle: 'calm', devout: true, greet: 'nod',
    look: { seed: 108, top: 'dress', female: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [58, 76, 62], pants: [160, 140, 126], hair: [[110, 100, 84], [160, 150, 128], [200, 192, 172]], skin: SKIN.rosy, apron: [196, 192, 182], boot: [62, 46, 38] } },
    hair: 'coque', skirt: { color: [58, 76, 62], long: true, apron: [196, 192, 182] }, pose: 'vendor',
    spawn: S => {
      const st = S.stallSpot();
      const at = S.frame(st.x, st.z, st.rot), [x, z] = at(0, -0.72);
      return { mode: 'stand', x, z, h: st.rot, stall: { ...st, text: 'FECHADO', closed: true } };
    },
    hi: 'Já fechei.',
    barks: ['Fechado. Hoje não.', 'Tenho que chegar antes de escurecer.'],
    talks: [
      ['Hoje não vendo nada. Tô só recolhendo as coisas.', 'Ninguém sai pra comprar cuca com o que tá acontecendo.'],
      ['Mataram as minhas galinhas. Todas as doze, numa noite só.', 'Nem um pio. O cachorro nem latiu.', 'De manhã ele tava encolhido embaixo da escada, tremendo.'],
      ['Tu não é daqui, é? Então escuta uma velha.', 'Não entra no mato. Nem atrás de bicho, nem atrás de gente.'],
    ],
    scared: 'Credo em cruz!',
    aimed: 'Não... Eu não tenho nada.',
    gun: 'Arma não assusta o que anda no mato, guri.',
  },
  {
    id: 'joao', name: 'JOÃOZINHO', voice: 480, kid: true, stare: true,
    talkStyle: 'nervous', greet: 'nod',
    look: { seed: 109, top: 'sweater', bottom: 'shorts', feet: 'shoe', colors: { jacket: [92, 86, 74], pants: [44, 50, 66], sock: [170, 166, 156], hair: HAIR.brown, skin: SKIN.fair, iris: EYES.green, boot: [50, 40, 34] } },
    spawn: S => {
      const c = S.L.praca.c, [x, z] = S.free(c[0] + 3.6, c[1] - 1.8, 0.4);
      return { mode: 'stand', x, z, h: S.face([x, z], c) };
    },
    hi: '...',
    barks: ['Hm hm hm hm...', 'Ele tá olhando.', '...'],
    talks: [
      ['...', 'A mãe disse pra eu não falar com estranho.'],
      ['O meu cusco não volta mais.', 'Eu vi pela janela. Ele foi pro mato atrás do bicho.', 'O bicho chamou ele. Fazia um barulhinho igual piá chorando.'],
      ['Tu vai entrar no mato?', 'Então não olha nos olhos dele. O Seu Valdir disse.'],
    ],
    scared: 'MÃE!',
    aimed: 'Não...',
    gun: 'Isso mata ele?',
  },
  {
    id: 'ana', name: 'ANA', voice: 360,
    idle: ['glance'], talkStyle: 'nervous',
    look: { seed: 110, top: 'sweater', female: true, longHair: true, band: [96, 40, 50], feet: 'shoe', colors: { jacket: [160, 160, 166], pants: [40, 46, 70], hair: HAIR.auburn, skin: SKIN.fair, iris: EYES.green, boot: [38, 34, 32], lip: [150, 84, 90] } },
    hair: 'longo', item: 'livro', itemColor: [52, 66, 96], pose: 'phone',
    spawn: S => {
      const ph = S.phone(S.L.praca.c[0], S.L.praca.c[1]);
      if (!ph) { const [x, z] = S.free(S.L.praca.c[0] + 6, S.L.praca.c[1]); return { mode: 'stand', x, z, h: 0 }; }
      const [x, z] = S.frame(ph.x, ph.z, ph.rot)(0, 0.9);
      return { mode: 'stand', x, z, h: ph.rot + Math.PI };
    },
    hi: '...',
    barks: ['Atende... atende...', 'Alô? Tia?', 'Só chia...'],
    talks: [
      ['Tô ligando pra minha tia, que mora lá em cima, na beira do mato.', 'Desde ontem ninguém atende.'],
      ['Agora a linha só chia.', 'Teve uma hora que parecia que alguém tava respirando do outro lado.', 'Não falou nada. Só respirava.'],
      ['O meu pai foi lá de manhã ver como ela tá.', 'Ainda não voltou.'],
    ],
    scared: 'Ai! O que foi isso?',
    aimed: 'Não! Para!',
    gun: 'Tu vai pro mato? Se passar pela casa da minha tia, bate na porta. Por favor.',
  },
  {
    id: 'alfredo', name: 'SEU ALFREDO', voice: 120,
    idle: ['glance', 'sky'], talkStyle: 'calm',
    look: { seed: 122, top: 'suit', old: true, feet: 'shoe', colors: { jacket: [74, 60, 48], pants: [66, 56, 46], hair: HAIR.white, skin: SKIN.fair, iris: EYES.blue, tie: [52, 44, 38], boot: [36, 28, 24] } },
    hat: ['chapeu', [56, 50, 44]], item: 'bengala', pose: 'cane',
    spawn: S => ({ mode: 'wander', poly: S.L.praca.poly, speed: 0.7, rest: [4, 9] }),
    hi: 'Boa tarde.',
    barks: ['Vamos pra casa, Wilma.', 'Já vai escurecer.'],
    talks: [
      ['A gente dá a volta na praça todo dia, faz cinquenta anos.', 'Hoje é a última volta. Depois, pra casa: porta trancada e tramela.'],
      ['Essa noite alguma coisa arranhou a nossa janela.', 'Devagar. Como quem experimenta.', 'Eu fiquei a noite inteira sentado na cozinha com o facão no colo.'],
    ],
    scared: 'Wilma! Abaixa!',
    aimed: 'Moço... por favor.',
    gun: 'Tu vai atrás dele? Que Deus te acompanhe.',
  },
  {
    id: 'wilma', name: 'DONA WILMA', voice: 290,
    idle: ['hug', 'glance'], talkStyle: 'calm', devout: true,
    look: { seed: 123, top: 'sweater', female: true, old: true, glasses: true, band: [170, 164, 170], bottom: 'stockings', feet: 'shoe', colors: { jacket: [120, 104, 126], pants: [96, 90, 96], hair: HAIR.white, skin: SKIN.rosy, iris: EYES.blue, boot: [70, 56, 48] } },
    hair: 'coque', skirt: { color: [70, 62, 80], long: true }, item: 'sacola', itemColor: [130, 96, 106],
    spawn: () => ({ mode: 'follow', leader: 'alfredo', off: [0.72, 0.2] }),
    hi: 'Boa tarde, querido.',
    barks: ['Vamos, Alfredo...', 'Ai, que frio.'],
    talks: [
      ['Não liga. O Alfredo não dorme direito desde a janela.', 'Ele acha que eu não percebo. Eu também não durmo.'],
      ['Volta pra casa antes de escurecer, querido.', 'Aqui ninguém abre a porta depois das seis. Nem pra conhecido.'],
    ],
    scared: 'Alfredo! Alfredo!',
    aimed: 'Que é isso, menino? Abaixa isso.',
    gun: 'Que Deus guarde a tua mão, menino.',
  },
  {
    id: 'paula', name: 'PAULA', voice: 350, stare: true,
    idle: ['cross', 'watch', 'glance', 'hips'], talkStyle: 'lively',
    look: { seed: 121, top: 'polo', female: true, short: true, feet: 'shoe', colors: { jacket: [100, 34, 30], collar: [180, 172, 158], pants: [30, 30, 34], hair: HAIR.red, skin: SKIN.fair, iris: EYES.green, boot: [30, 28, 28], lip: [150, 74, 74] } },
    hair: 'rabo',
    spawn: S => { const b = S.building(/TEEWALD STORE/); const [x, z, h] = b ? S.front(b) : S.near(-165, 42); return { mode: 'stand', x, z, h }; },
    hi: 'Já tô fechando.',
    barks: ['Vou fechar mais cedo.', 'Cadê a chave...'],
    talks: [
      ['A loja vai fechar mais cedo hoje. Ordem do dono.', 'Turista não vem mais. Ninguém vem.'],
      ['Na segunda de manhã tinha marca de unha na porta de ferro.', 'Três riscos fundos. Na altura do meu rosto.'],
    ],
    scared: 'Ai! O que foi isso?!',
    aimed: 'O caixa tá vazio, juro...',
    gun: 'Ainda bem que alguém aqui anda armado.',
  },
  {
    id: 'romeu', name: 'SEU ROMEU', voice: 150, stare: true,
    idle: ['watch', 'read', 'glance'], talkStyle: 'stiff', greet: 'nod',
    look: { seed: 115, top: 'suit', beard: 'mustache', feet: 'shoe', colors: { jacket: [60, 62, 66], pants: [54, 56, 60], hair: HAIR.dark, skin: SKIN.olive, iris: EYES.brown, tie: [96, 32, 34], boot: [26, 22, 20] } },
    item: 'livro', itemColor: [150, 130, 92],
    spawn: S => { const p = S.L.prefeitura; const [x, z, h] = p ? S.front(p) : S.near(-168, 176); return { mode: 'stand', x, z, h }; },
    hi: 'Boa tarde.',
    barks: ['Está tudo sob controle.', 'Não há motivo para pânico.'],
    talks: [
      ['A Prefeitura está acompanhando os casos. Não há motivo para pânico.', 'Muito provavelmente um cachorro do mato. Ou um graxaim.'],
      ['A recompensa do cartaz? Sim, é verdade.', 'Mas não comente com a moça do jornal. Já basta a Kartoffelfest cancelada. A cidade vive dela.'],
      ['O pavilhão fica montado aí na frente. Desmontar também custa.', 'Quando isso passar, a gente faz a festa. Nem que seja no inverno.'],
      ['Eu? Eu não acredito nessas histórias de colono.', '...', 'Mas deixo a luz da varanda acesa a noite inteira.'],
    ],
    scared: 'Meu Deus! Que foi isso?!',
    aimed: 'O senhor está louco? Abaixe isso!',
    gun: 'Porte de arma... deixa pra lá. Nessas circunstâncias, deixa pra lá.',
  },

  // ---------------- Igreja Matriz e cemitério ----------------
  {
    id: 'bernardo', name: 'PADRE BERNARDO', voice: 135, stare: true,
    idle: ['back', 'pray', 'sign', 'glance'], talkStyle: 'stiff', devout: true, greet: 'nod',
    look: { seed: 111, top: 'cassock', old: true, glasses: [160, 150, 120], feet: 'shoe', colors: { jacket: [28, 26, 28], pants: [28, 26, 28], hair: HAIR.white, skin: SKIN.fair, button: [64, 62, 64], boot: [24, 22, 22] } },
    skirt: { color: [28, 26, 28], len: -0.8 },
    spawn: S => { const [x, z] = S.free(...S.church(-1.5, 21.5)); return { mode: 'stand', x, z, h: S.L.church.rot }; },
    hi: 'Deus te guarde, meu filho.',
    barks: ['Deus tenha piedade.', 'Pai nosso, que estais no céu...'],
    talks: [
      ['O sino tocou sozinho na madrugada de terça. Três badaladas.', 'A torre estava trancada. A chave estava comigo.'],
      ['As senhoras vêm acender vela e rezar o terço em alemão, como as avós delas rezavam.', 'Pedem proteção pra casa, pros filhos e pra criação.', 'Eu rezo junto. E tranco a igreja antes de anoitecer.'],
      ['Nem tudo o que anda no mato é obra de Deus, meu filho.', 'Se tu for lá, vai de dia. E não vai sozinho.'],
    ],
    scared: 'Meu filho! O que foi isso?',
    aimed: 'Abaixa isso, meu filho. Eu não sou o teu inimigo.',
    gun: 'Arma na casa de Deus... Bom. Talvez hoje Ele perdoe.',
  },
  {
    id: 'irma', name: 'DONA IRMA', voice: 270,
    idle: ['pray', 'sign', 'glance'], talkStyle: 'stiff', devout: true, greet: 'nod', barkActs: ['pray', null, 'pray'],
    look: { seed: 112, top: 'dress', female: true, old: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [34, 30, 34], pants: [40, 36, 40], hair: HAIR.white, skin: SKIN.fair, iris: EYES.gray, boot: [30, 26, 26] } },
    hat: ['lenco', [40, 36, 42]], skirt: { color: [34, 30, 34], long: true },
    spawn: S => ({ mode: 'sit', seat: S.seat(...S.church(9.5, 19.7), 'bench') }),
    hi: 'Hmpf.',
    barks: ['Ave Maria, cheia de graça...', 'É castigo.', 'Rogai por nós...'],
    talks: [
      ['Isso é castigo.', 'A cidade esqueceu de Deus, e Deus esqueceu da cidade.'],
      ['Na terça de noite, alguma coisa arranhou a minha porta.', 'Eu rezei o terço inteiro em voz alta. Quando acabei, parou.', 'De manhã tinha pena no capacho. Eu não crio galinha.'],
      ['Cuidado com a beira do mato atrás da igreja.', 'Os galinheiros lá do fundo foram os primeiros.'],
    ],
    scared: 'Valei-me, Nossa Senhora!',
    aimed: 'Pode atirar. Eu tô com Deus.',
    gun: 'Arma não protege alma, menino.',
  },
  {
    id: 'rudi', name: 'RUDI, O CARTEIRO', voice: 175,
    idle: ['glance'], talkStyle: 'lively', stops: 'house', stopAct: 'deliver',
    look: { seed: 114, top: 'polo', short: true, feet: 'shoe', colors: { jacket: [176, 150, 52], collar: [36, 56, 100], pants: [36, 50, 84], hair: HAIR.dark, skin: SKIN.brown, iris: EYES.brown, boot: [30, 28, 28] } },
    hat: ['bone', [36, 56, 100]], item: 'sacola', itemColor: [170, 146, 60],
    spawn: S => {
      const c = S.L.church, pts = S.sidewalk('Rua 12 de Maio', c.x, c.z, 90);
      if (pts.length > 2) return { mode: 'route', pts, speed: 1.45 };
      const [x, z] = S.free(...S.church(4, 24)); return { mode: 'stand', x, z, h: c.rot };
    },
    hi: 'Tarde.',
    barks: ['Ninguém atende...', 'Mais uma casa fechada.', 'Silêncio demais...'],
    talks: [
      ['Na linha de cima tem três casas onde a correspondência tá acumulando.', 'Ninguém atende. As janelas tão fechadas.'],
      ['Faz quinze anos que eu entrego carta aqui, e todo cachorro late pra mim.', 'Essa semana nenhum late. Ficam encolhidos no fundo do pátio, olhando pro mato.'],
      ['Hoje eu termino a rota antes das quatro.', 'Carta que sobrar fica pra amanhã. Que me desculpem.'],
    ],
    scared: 'Opa! Que foi isso?',
    aimed: 'Calma! Eu sou o carteiro!',
    gun: 'Tu vai lá pra cima? Então olha as caixas de correio. Me diz se alguém pegou as cartas.',
  },
  {
    id: 'otto', name: 'SEU OTTO', voice: 105, stare: true,
    idle: ['glance'], talkStyle: 'calm', greet: 'nod',
    look: { seed: 113, top: 'overall', pattern: 'plaid', accent: [40, 46, 52], old: true, beard: 'full', colors: { jacket: [100, 106, 118], pants: [42, 52, 76], hair: HAIR.gray, skin: SKIN.rosy, boot: [56, 42, 30] } },
    hat: ['bone', [58, 70, 52]], item: 'rastelo', pose: 'rake',
    spawn: S => { const c = S.L.cemetery.c, [x, z] = S.free(c[0], c[1], 0.5, 12); return { mode: 'stand', x, z, h: S.face([x, z], S.L.church ? [S.L.church.x, S.L.church.z] : c) }; },
    hi: 'Hm.',
    barks: ['Terra mexida de novo...', 'Hm.'],
    talks: [
      ['Trinta anos cuidando desse cemitério.', 'Nunca precisei trancar o portão. Agora tranco.'],
      ['Lá no fundo, perto do muro da mata, a terra amanheceu mexida.', 'Nenhuma cova aberta, graças a Deus. Mas cavaram. E desistiram.'],
      ['Tem uma cova sem nome lá no canto, de setenta e oito.', 'Ninguém sabe quem tá ali. Ou ninguém quer dizer.'],
    ],
    scared: 'Aqui não, rapaz! Respeita os mortos!',
    aimed: 'Rapaz... guarda isso. Aqui já tem gente demais.',
    gun: 'Arma no cemitério. Aqui ninguém mais precisa de susto.',
  },

  // ---------------- Kartoffelfest (pavilhão na Rua Benno Closs) e campo ----------------
  // Subtrama: o pavilhão já estava montado e a rua fechada quando a comissão cancelou
  // a festa deste ano. Só conversa e cenário; não mexe na história dos capítulos.
  {
    id: 'ivo', name: 'SEU IVO', voice: 112, stare: true,
    idle: ['glance', 'sky', 'scratch'], talkStyle: 'lively',
    look: { seed: 116, top: 'shirt', pattern: 'plaid', accent: [180, 176, 166], beard: 'mustache', colors: { jacket: [112, 38, 34], pants: [80, 62, 42], hair: HAIR.red, skin: SKIN.rosy, iris: EYES.blue, boot: [62, 44, 30] } },
    hat: ['chapeu', [48, 46, 40]], item: 'caneca', pose: 'hold',
    // na entrada do pavilhão, no começo da rua, de olho na rodovia
    spawn: S => {
      const k = S.L.kartoffel, at = S.frame(k.x, k.z, k.rot), [x, z] = S.free(...at(-k.hl + 1.6, -2.8));
      return { mode: 'stand', x, z, h: k.rot - Math.PI / 2 };
    },
    hi: 'Boa tarde.',
    barks: ['Esse ano não tem festa.', 'Montaram tudo pra nada...', 'Carro não passa. Só a pé.'],
    talks: [
      ['Esse ano não vai ter Kartoffelfest. A comissão cancelou.', 'A lona já tava montada, o palco pronto, o chope encomendado.', 'Mas com bicho sangrando criação, quem é que traz a família pra cá de noite?'],
      ['A rua ficou fechada assim mesmo. Ninguém veio desmontar.', 'Eu fico cuidando do pavilhão de noite. Deixo as lâmpadas acesas.', 'Ontem ouvi alguma coisa andando em cima da lona. Pesada. Aos pulos.'],
      ['Grumbeer, como diziam os antigos. Batata.', 'A festa existe pra lembrar a fome que os colonos passaram aqui.', 'Parece que o mato também lembra.'],
    ],
    scared: 'Mein Gott! Que foi isso?',
    aimed: 'Ô! Calma! Calma!',
    gun: 'Se for atrás do bicho, a barraca de tiro ainda tá montada lá no fundo. Treina antes.',
  },
  {
    id: 'gertrud', name: 'DONA GERTRUD', voice: 260,
    idle: ['stir', 'stir', 'sign', 'glance'], talkStyle: 'lively', devout: true,
    look: { seed: 117, top: 'dress', female: true, old: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [100, 40, 40], pants: [160, 140, 126], hair: HAIR.gray, skin: SKIN.rosy, iris: EYES.blue, apron: [200, 196, 188], boot: [56, 42, 34] } },
    hair: 'coque', skirt: { color: [100, 40, 40], long: true, apron: [200, 196, 188] }, item: 'cesta',
    // atrás do balcão da Kartoffelhaus, do lado da panela
    spawn: S => {
      const k = S.L.kartoffel, at = S.frame(k.x, k.z, k.rot), [x, z] = S.free(...at(k.hl - 13, 4.2));
      return { mode: 'stand', x, z, h: k.rot + Math.PI };
    },
    hi: 'Oi, querido.',
    barks: ['Sopa pra quem vai procurar...', 'Ai, meu Deus...', 'Batata não falta.'],
    talks: [
      ['As batatas da festa já tinham chegado quando cancelaram. Saco e mais saco.', 'Eu não vou deixar apodrecer.', 'Tô fazendo sopa pros homens que vão procurar no mato hoje de noite.'],
      ['O meu neto jura que viu o bicho no telhado do pavilhão.', 'Corcunda, com espinho nas costas, os olhos brilhando vermelho.', 'Eu mandei ele rezar. E rezei junto.'],
      ['Desde a primeira festa eu frito Kartoffelpuffer nessa barraca.', 'Só não teve no ano da enchente.', 'E agora esse.'],
    ],
    scared: 'Mein Gott!',
    aimed: 'Ai, não... Eu só cozinho, querido.',
    gun: 'Come alguma coisa antes de ir. Ninguém entra no mato de barriga vazia.',
  },
  {
    id: 'luana', name: 'LUANA', voice: 370,
    idle: ['chin', 'glance', 'sky'], talkStyle: 'nervous', greet: 'wave',
    look: { seed: 124, top: 'dress', female: true, longHair: true, bottom: 'stockings', feet: 'shoe', colors: { jacket: [46, 82, 60], pants: [226, 220, 206], hair: HAIR.blond, skin: SKIN.fair, iris: EYES.blue, apron: [214, 206, 188], boot: [40, 32, 28], lip: [160, 90, 92] } },
    hair: 'longo', skirt: { color: [46, 82, 60], apron: [214, 206, 188] },
    // a rainha da festa, sozinha numa das mesas compridas, de vestido típico
    spawn: S => ({ mode: 'sit', seat: S.seat(S.L.kartoffel.x, S.L.kartoffel.z, 'festa') }),
    hi: 'Oi.',
    barks: ['Era pra ser sábado...', 'Tanto ensaio.'],
    talks: [
      ['Eu sou a rainha da Kartoffelfest. Ia ser coroada no sábado, ali no palco.', 'A mãe costurou o vestido. Seis semanas.', 'Agora não tem mais festa.'],
      ['A comissão diz que é só esse ano. Que no ano que vem tem.', 'Vim sentar aqui porque em casa ninguém fala de outra coisa.'],
      ['De noite as lâmpadas ficam acesas e não tem ninguém. Só o Seu Ivo.', 'Eu vou pra casa antes de escurecer. Prometi pra mãe.'],
    ],
    scared: 'Ai! O que foi isso?',
    aimed: 'Não! Por favor!',
    gun: 'Tu vai atrás do bicho? ...Toma cuidado.',
  },
  {
    id: 'tiago', name: 'TIAGO', voice: 200, stare: true,
    idle: ['stretch', 'hips', 'cross', 'glance'], talkStyle: 'lively', greet: 'wave',
    look: { seed: 118, top: 'jersey', short: true, number: '9', bottom: 'shorts', feet: 'cleat', colors: { jacket: [112, 34, 32], collar: [176, 172, 164], pants: [24, 24, 28], sock: [112, 34, 32], hair: HAIR.dark, skin: SKIN.brown, iris: EYES.brown, boot: [24, 24, 26] } },
    spawn: S => { const [x, z, h] = S.sideline(); return { mode: 'stand', x, z, h }; },
    hi: 'E aí.',
    barks: ['Ninguém veio pro treino.', 'Que silêncio...'],
    talks: [
      ['Cancelaram o jogo de domingo. Cancelaram o treino.', 'Eu vim mesmo assim. Fiquei sozinho.'],
      ['Ontem, quando tava escurecendo, uma coisa atravessou o campo de um gol ao outro.', 'Em três pulos. Três.', 'Nenhum bicho daqui pula assim.'],
    ],
    scared: 'Que foi isso?!',
    aimed: 'Ei! Ei! Sou eu!',
    gun: 'Se tu for atrás daquilo, eu vou junto. Mentira. Não vou.',
  },
];

// reservas para quem não tem fala própria
export const GENERIC = {
  scared: ['O que foi isso?!', 'Meu Deus!', 'Socorro!'],
  aimed: ['Não... por favor.', 'Abaixa isso.'],
  gun: ['Tu anda armado... Faz bem.'],
  excuse: ['Licença.', 'Com licença.'],
  afraid: ['Me deixa.', 'Não chega perto.', 'Vai embora.'],
  // arma na mão, chegando perto
  gunOut: ['Cuidado com isso aí.', 'Pra que essa arma?', 'Guarda isso, guri.'],
  // o sino tocou (todo mundo olha para a torre)
  bell: ['O sino...', 'Quem tá tocando o sino?', 'Credo... o sino de novo.', 'Mein Gott, o sino!'],
  // o carro vindo para cima (pula fora) e encostando nele
  car: ['Olha o carro!', 'Ei! Devagar!', 'Cuidado!', 'Tá louco?!'],
  carHit: ['Ai! Olha por onde anda!', 'Quase me atropela!', 'Tá cego?!', 'Mas que coisa!'],
};

// Fichas dos moradores. Vão para o modelo e para a página de personagens do site (npm run retratos):
// altura (m) e porte (magro · médio · forte · gordo) dão a escala do corpo; curvado inclina
// o tronco; tracos entram no look e pintam o rosto (heroTexture.js: old 2, brows, bags,
// ruddy, freckles, stubble, mole, scar). O resto é descrição.
const FICHAS = {
  arno: {
    papel: 'Ferreiro aposentado; pesca no calçadão do Rio Cadeia', idade: 68, altura: 1.70, porte: 'forte',
    tracos: { ruddy: true, brows: 'grossas' },
    rosto: 'Queimado de sol, barba cheia grisalha e sobrancelhas grossas.',
    corpo: 'Baixo e atarracado, braços e mãos grossos de quem bateu ferro a vida inteira.',
    roupa: 'Camisa xadrez vermelha, calça cinza, botas e chapéu de palha. Vara de pescar.',
    jeito: 'Fala pouco e desconfia de todo mundo. Agora só pesca de dia.',
  },
  hilda: {
    papel: 'Viúva do calçadão; procura a gata Mimi', idade: 74, altura: 1.55, porte: 'magro', curvado: true,
    tracos: { old: 2, bags: true },
    rosto: 'Rugas fundas, olheiras e óculos; cabelo grisalho sob um lenço roxo.',
    corpo: 'Miúda e magra, um pouco curvada.',
    roupa: 'Suéter vinho, saia comprida cinza, meia-calça e sapatos.',
    jeito: 'Aflita, mas educada. Chama pela Mimi o tempo todo.',
  },
  lucas: {
    papel: 'Procura o cachorro Bóris; mora na última casa antes da ponte', idade: 19, altura: 1.81, porte: 'magro',
    tracos: { stubble: true },
    rosto: 'Pele morena, barba rala e olhos castanhos.',
    corpo: 'Alto e magro, anda depressa.',
    roupa: 'Jaqueta azul de gola cinza, calça escura, tênis claros e boné vermelho.',
    jeito: 'Agitado; assobia e grita pelo Bóris.',
  },
  marlene: {
    papel: 'Repórter de um jornal de Porto Alegre', idade: 31, altura: 1.68, porte: 'médio',
    tracos: { mole: 1 },
    rosto: 'Pele morena-clara, olhos castanhos e uma pinta na bochecha; cabelo preto em rabo de cavalo.',
    corpo: 'Estatura média, ágil.',
    roupa: 'Jaqueta mostarda, calça jeans e tênis. Câmera fotográfica na mão.',
    jeito: 'Insistente e curiosa. Ninguém na cidade quer falar com ela.',
  },
  edgar: {
    papel: 'Professor de história aposentado; conhece os diários dos colonos', idade: 79, altura: 1.76, porte: 'magro', curvado: true,
    tracos: { old: 2, brows: 'grossas' },
    rosto: 'Cabelo e bigode brancos, óculos de aro claro, sobrancelhas grossas e rugas fundas.',
    corpo: 'Alto e magro, curvado pela idade.',
    roupa: 'Terno marrom gasto, camisa clara, gravata azul e boina cinza. Sempre com um livro.',
    jeito: 'Fala devagar, como em sala de aula. Encara quem passa.',
  },
  lauro: {
    papel: 'Espera o ônibus para Novo Hamburgo desde o meio-dia', idade: 66, altura: 1.72, porte: 'médio',
    tracos: { stubble: true, bags: true },
    rosto: 'Grisalho, barba por fazer e olheiras de quem não dorme.',
    corpo: 'Estatura média, ombros caídos.',
    roupa: 'Jaqueta verde-oliva, calça cáqui, botas e boné verde. Mala do lado.',
    jeito: 'Cansado e decidido a ir embora da cidade.',
  },
  katia: {
    papel: 'Operária do turno da noite na fábrica de calçados', idade: 27, altura: 1.62, porte: 'magro',
    tracos: { bags: true },
    rosto: 'Pele morena, olhos castanhos e olheiras do turno da noite; cabelo preto em rabo de cavalo.',
    corpo: 'Magra, de estatura mediana.',
    roupa: 'Camisa azul-clara, calça azul-marinho e sapatos. Sacola de pano.',
    jeito: 'Assustada; olha para trás enquanto anda.',
  },
  bruno: {
    papel: 'Dono da floricultura', idade: 56, altura: 1.77, porte: 'forte',
    tracos: {},
    rosto: 'Cabelo castanho, bigode, óculos e olhos verdes.',
    corpo: 'Encorpado, com a barriga de quem passou dos cinquenta.',
    roupa: 'Macacão verde sobre camisa clara e botas. Regador na mão.',
    jeito: 'Calado e observador; encara quem passa.',
  },
  valdir: {
    papel: 'Gaúcho aposentado; toma chimarrão no banco da praça', idade: 72, altura: 1.71, porte: 'magro',
    tracos: { brows: 'grossas', scar: 'cheek' },
    rosto: 'Pele curtida, bigode grisalho, sobrancelhas grossas e uma cicatriz antiga na bochecha.',
    corpo: 'Magro e rijo apesar da idade.',
    roupa: 'Chapéu de aba preto, jaqueta escura, camisa vermelha e calça clara. Cuia e garrafa térmica.',
    jeito: 'De poucas palavras. Viveu o caso de 1978 e não esqueceu.',
  },
  erna: {
    papel: 'Vende cuca na banca da praça', idade: 63, altura: 1.58, porte: 'gordo',
    tracos: { ruddy: true },
    rosto: 'Bochechas coradas e cabelo loiro-acinzentado preso em coque.',
    corpo: 'Baixa e cheinha.',
    roupa: 'Vestido verde, avental branco, meia-calça e sapatos.',
    jeito: 'Prática e direta. Perdeu as doze galinhas numa noite só.',
  },
  joao: {
    papel: 'Aluno da 4ª série; o cachorro dele sumiu no mato', idade: 9, altura: 1.30, porte: 'magro',
    tracos: { freckles: true },
    rosto: 'Cabelo castanho, olhos verdes e sardas no nariz.',
    corpo: 'Franzino.',
    roupa: 'Suéter marrom, bermuda azul-marinho, meias claras e sapatos.',
    jeito: 'Quieto; fala pouco e fica olhando fixo.',
  },
  ana: {
    papel: 'Tenta ligar para a tia que mora na beira do mato', idade: 22, altura: 1.66, porte: 'magro',
    tracos: { bags: true },
    rosto: 'Cabelo ruivo-escuro comprido, olhos verdes e olheiras de choro.',
    corpo: 'Magra, de estatura mediana.',
    roupa: 'Suéter cinza-claro com uma faixa bordada vinho, calça azul-marinho e sapatos.',
    jeito: 'Ansiosa; não larga o orelhão.',
  },
  alfredo: {
    papel: 'Aposentado; dá a volta na praça com a esposa há cinquenta anos', idade: 81, altura: 1.69, porte: 'magro', curvado: true,
    tracos: { old: 2, bags: true },
    rosto: 'Cabelo branco, olhos azuis, rosto muito enrugado e olheiras.',
    corpo: 'Magro e curvado; anda de bengala.',
    roupa: 'Terno marrom, gravata e chapéu de feltro.',
    jeito: 'Educado e protetor com a Wilma. Não dorme desde que arranharam a janela.',
  },
  wilma: {
    papel: 'Esposa do Seu Alfredo', idade: 78, altura: 1.53, porte: 'médio', curvado: true,
    tracos: { old: 2 },
    rosto: 'Cabelo branco em coque, óculos e olhos azuis.',
    corpo: 'Baixinha e um pouco curvada.',
    roupa: 'Suéter lilás com faixa bordada, saia comprida roxa e meia-calça. Sacola na mão.',
    jeito: 'Carinhosa; chama todo mundo de querido.',
  },
  paula: {
    papel: 'Atendente da Teewald Store', idade: 24, altura: 1.71, porte: 'magro',
    tracos: { freckles: true },
    rosto: 'Ruiva de rabo de cavalo, sardas e olhos verdes.',
    corpo: 'Alta e magra.',
    roupa: 'Camisa polo vinho do uniforme, calça preta e sapatos.',
    jeito: 'Apressada para fechar a loja. Encara quem chega.',
  },
  romeu: {
    papel: 'Funcionário da Prefeitura; tem um potreiro fora da cidade', idade: 52, altura: 1.75, porte: 'gordo',
    tracos: { brows: 'grossas' },
    rosto: 'Cabelo preto penteado, bigode aparado e sobrancelhas grossas.',
    corpo: 'Corpulento, com barriga sob o paletó.',
    roupa: 'Terno cinza, gravata vermelha e sapatos engraxados. Pasta de couro.',
    jeito: 'Fala como em discurso oficial e diz que está tudo sob controle.',
  },
  bernardo: {
    papel: 'Pároco da Igreja Matriz', idade: 70, altura: 1.78, porte: 'magro',
    tracos: { bags: true },
    rosto: 'Cabelo branco curto, óculos de aro dourado e olheiras de quem reza à noite.',
    corpo: 'Alto e magro, postura reta.',
    roupa: 'Batina preta com colarinho clerical e sapatos pretos.',
    jeito: 'Calmo e firme. Tranca a igreja antes de anoitecer.',
  },
  irma: {
    papel: 'Beata; reza o terço todo dia na igreja', idade: 76, altura: 1.52, porte: 'magro', curvado: true,
    tracos: { old: 2, mole: -1 },
    rosto: 'Cabelo branco sob lenço preto, olhos cinzentos e uma pinta perto da boca.',
    corpo: 'Pequena, magra e curvada.',
    roupa: 'Vestido preto de luto, lenço preto, meia-calça e sapatos.',
    jeito: 'Severa; acha que tudo é castigo de Deus.',
  },
  rudi: {
    papel: 'Carteiro da cidade há quinze anos; caçula de uma família de sete irmãos', idade: 38, altura: 1.79, porte: 'forte',
    tracos: { stubble: true },
    rosto: 'Pele morena, cabelo preto curto, barba por fazer e olhos castanhos.',
    corpo: 'Forte, com as pernas de quem anda o dia inteiro.',
    roupa: 'Camisa polo amarela de gola azul, calça azul, boné azul e sacola de cartas.',
    jeito: 'Prestativo, mas nervoso esta semana.',
  },
  otto: {
    papel: 'Zelador do cemitério há trinta anos', idade: 69, altura: 1.74, porte: 'forte',
    tracos: { brows: 'grossas', scar: 'brow' },
    rosto: 'Barba cheia grisalha, sobrancelhas grossas e uma cicatriz cortando a sobrancelha.',
    corpo: 'Largo e forte, mãos calejadas.',
    roupa: 'Macacão azul-marinho sobre camisa xadrez, botas e boné verde. Rastelo na mão.',
    jeito: 'Fala pouco; respeita os mortos e não gosta de barulho.',
  },
  ivo: {
    papel: 'Da comissão da Kartoffelfest; vigia o pavilhão de noite', idade: 58, altura: 1.80, porte: 'gordo',
    tracos: { ruddy: true },
    rosto: 'Ruivo, de bigode ruivo, olhos azuis e rosto corado.',
    corpo: 'Grande e pesado.',
    roupa: 'Camisa xadrez vermelha, calça marrom, botas e chapéu. Caneca de chope na mão.',
    jeito: 'Sério e prestativo; cuida do pavilhão vazio.',
  },
  gertrud: {
    papel: 'Cozinheira da Kartoffelhaus desde a primeira festa', idade: 71, altura: 1.60, porte: 'gordo',
    tracos: { old: 2, ruddy: true },
    rosto: 'Rosto redondo e corado, cabelo grisalho em coque e olhos azuis.',
    corpo: 'Baixa e robusta.',
    roupa: 'Vestido vermelho-escuro com avental branco, meia-calça e sapatos. Cesta no braço.',
    jeito: 'Maternal; dá comida a todo mundo.',
  },
  luana: {
    papel: 'Rainha da Kartoffelfest deste ano', idade: 18, altura: 1.67, porte: 'magro',
    tracos: {},
    rosto: 'Loira de cabelo comprido e olhos azuis.',
    corpo: 'Magra, de estatura mediana.',
    roupa: 'Vestido típico verde com avental claro, meia-calça e sapatos.',
    jeito: 'Tristonha; prometeu à mãe voltar antes de escurecer.',
  },
  tiago: {
    papel: 'Centroavante do time de futebol da cidade', idade: 17, altura: 1.78, porte: 'médio',
    tracos: {},
    rosto: 'Pele morena, cabelo preto curto e olhos castanhos.',
    corpo: 'Atlético.',
    roupa: 'Camisa vermelha número 9, calção preto, meias vermelhas e chuteiras.',
    jeito: 'Fala pouco; ficou sozinho no campo.',
  },
};
for (const d of NPC_DEFS) {
  d.ficha = FICHAS[d.id];
  if (d.ficha) Object.assign(d.look, d.ficha.tracos);
}
