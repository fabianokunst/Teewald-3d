# Teewald

Jogo de terror em terceira pessoa com visual de PlayStation 1, ambientado numa
versão de Santa Maria do Herval (RS) no outono: neblina, céu encoberto e uma
cidade com medo do que anda no mato. São doze capítulos: o chupacabras, os cães de
fogo, a moça da fábrica, os ETs de Varginha, a Fera da madrugada, os telefones que
chamam para o mato, o lobisomem, o cemitério em Finados, a mulher da fotografia, os
morcegos-vampiro e a bruxa Otília, com luta corpo a corpo,
armas especiais, noite, chuva, tempestade, neblina e lua cheia. Roda no navegador
(Three.js + Vite).

## Como rodar

Precisa do Node.js instalado.

- Dê dois cliques em `iniciar.bat`, **ou**
- no terminal: `npm install` (só na primeira vez) e depois `npm run dev`.

O navegador abre em `http://localhost:5173`.

Com o jogo rodando, `npm run audit` faz uma revisão técnica do mundo: lista
superfícies enterradas no terreno, pisos flutuando, objetos encaixados uns nos
outros, objetos no meio da pista e lugares onde os pés do jogador afundariam no
chão desenhado (ou flutuariam acima dele). Todo piso desenhado acima do terreno
precisa entrar no chão do jogador (`ctx.floors`, `ctx.walkways` ou uma caixa
caminhável), senão as pernas somem dentro dele.

`npm run teste` testa a campanha inteira sozinho: compila o jogo, abre num Chrome
sem janela e um robô passa por todas as etapas dos doze capítulos até os créditos
(pula falas e cenas, derruba as criaturas, usa os pontos da história). Em cada
etapa ele salva e volta pelo CONTINUAR, e uma vez por capítulo deixa o jogador cair,
conferindo se o jogo volta para a mesma etapa. No fim mostra onde travou e os erros
do console. `npm run teste -- 6` começa no capítulo 6, `npm run teste -- 6 6` testa só
ele e `--rapido` usa a última compilação (`tools/test-campaign.mjs` e
`tools/campaign-bot.js`).

## Controles

| Ação | Teclado / mouse | Controle | Toque (celular/tablet) |
|---|---|---|---|
| Andar | WASD ou setas | analógico esquerdo | arrastar no lado esquerdo |
| Correr | Shift | B (segurar) · L3 (liga até soltar o analógico) | botão CORRER (liga/desliga; desliga a mira) |
| Pular | Espaço | A | botão PULAR |
| Esquiva | C ou Ctrl | B (toque rápido; mirando, na hora) | botão ESQUIVA |
| Câmera | mouse (clique na tela para prender) · Q/E | analógico direito | arrastar no lado direito ou no ATIRAR |
| Centralizar câmera | — | R3 | toque duplo no lado direito |
| Distância da câmera | roda do mouse | direcional ↓ (perto, normal, longe) | pinça com dois dedos |
| Conversar (perto de um morador) | F | A | botão FALAR sobre o morador |
| Ler / examinar / pegar / entrar | F ou E | A | botão sobre o objeto (LER, PEGAR, ENTRAR...) |
| Inventário | I ou Tab | Y | botão INV |
| Golpe (soco, arma branca, arremesso) | V · botão esquerdo sem arma de fogo | RB | botão GOLPE |
| Trocar de arma | 1 a 8 (1 = mãos) | direcional ◀▶ | botão ARMA |
| Comer / beber (cura) | H | direcional ↑ | botão CURA (aparece ferido) · inventário |
| Mirar (com arma de fogo) | botão direito (segurar) | L2 ou LB (segurar) | botão MIRAR (liga/desliga) |
| Atirar (segurar: luz do lampião) | botão esquerdo | R2 (segurar: continua atirando) | botão ATIRAR (segurar: continua) |
| Recarregar / reabastecer | R | X | botão REC |
| Pausa | Esc ou P | Start | botão ❚❚ |
| Arquivos, lendas e pedidos | J | Start → ARQUIVOS | ❚❚ → ARQUIVOS |
| Minimapa (liga/desliga) | M | Select | Opções |
| Tela cheia | F11 | — | botão ⛶ (Android e iPad) |
| Mostrar FPS | F3 | — | — |

Menus: setas/ENTER, direcional/A/B (segurar repete), clique ou toque. Na pausa,
START ou P de novo voltam ao jogo.

Atirar sem mirar levanta a pistola, atira e mantém a mira por um instante.
Mirando, o personagem anda devagar em qualquer direção e a câmera vai para o
ombro direito, nivelada (a câmera normal olha de cima; sem isso a mira apontava
para o chão). O coice sobe a câmera e ela volta sozinha. Um aperto no intervalo
entre tiros fica guardado e sai assim que a arma deixa.

**Mira assistida** (`src/game/aimAssist.js`, só controle e toque; opção MIRA
ASSISTIDA: desligada, normal ou forte):
- L2 / MIRAR puxa a mira até o bicho mais perto do centro da tela.
- Atirar sem mirar trava no bicho à frente e o tiro vai nele.
- Sobre o alvo a câmera gira mais devagar e acompanha o bicho que anda (e o
  jogador que anda de lado); perto dele a mira escorrega até a esfera de acerto
  mais próxima, cabeça incluída.
- A bala que passaria raspando vai no ponto de acerto mais perto; se o tiro já
  pega em algo (a cabeça, por exemplo), vai onde está mirado.
- Segurar R2 / ATIRAR continua atirando, mais devagar do que apertando.

O analógico direito tem zona morta circular e curva de precisão: pouco inclinado
gira bem devagar (mira fina); segurado no máximo fora da mira, o giro acelera
para dar meia-volta. O controle vibra nos tiros, golpes, dano e explosões
(opção VIBRAÇÃO). No toque, arrastar o dedo que está no ATIRAR também gira a
câmera: mira e tiro com o mesmo polegar.

No celular o jogo entra em tela cheia ao tocar na tela inicial (Android) e fica
melhor deitado; em pé, a imagem fica em 4:3 no alto e os controles embaixo.
Dá para jogar no celular com controle Bluetooth: os botões da tela somem quando
o controle é usado e voltam ao tocar na tela.

Os menus no toque (`src/ui/touchMenu.js`) usam botões grandes na tela inteira:
o botão acende ao encostar e só age ao soltar em cima dele. Em Opções cada linha
tem ◀ e ▶ (deitado, em duas colunas; arrastar rola se não couber), e há opções
só do celular: **tamanho dos botões** (pequeno, médio, grande) e **vibração**
(Android; também aparece com controle que vibra). Sair da partida pela pausa
pede confirmação. Em pé, o inventário
mostra as ações do item em botões grandes na parte de baixo; em EXAMINAR,
arrastar gira o item.

## Campanha: a noite que não termina

O jogo tem doze capítulos. O primeiro é a caçada ao chupacabras numa tarde de
neblina. Depois dele, o sangue do bicho ferido escorre sobre um túmulo esquecido
no mato: o da **Bruxa Otília** (Otília Kranz, a curandeira que os colonos enterraram
viva em 1878 com uma cruz de ferro em cima). Ela acorda, e **o sol não nasce mais**
em Teewald. As criaturas que aparecem pela cidade, cada lenda com o seu capítulo,
são dela ou vêm atrás dela.

| # | Capítulo | Clima | O que acontece | Arma especial (conseguir faz parte da missão) |
|---|---|---|---|---|
| 1 | O Chupacabras | tarde, neblina | cartaz, galinheiro, pegadas e a luta na clareira | pistola 9 mm |
| 2 | Os Cães de Fogo | anoitecer → noite | o sino toca sozinho; cães em brasa; defender a igreja enquanto o padre toca o sino | espingarda de dois canos (armário dos atiradores, na Sociedade) |
| 3 | A Moça da Fábrica | chuva | dentro da fábrica de calçados: achar a medalhinha, o sapato de noiva e o cartão-ponto da Lúcia, enfrentar o capataz e bater o ponto de saída que ela nunca bateu | lampião bento (sacristia da igreja) |
| 4 | Luzes no Céu | tempestade | círculo queimado no campo, disco voador, ETs de Varginha; um raio derruba a nave no mato | pistola de raios (na nave caída) |
| 5 | A Fera da Madrugada | neblina fechada | o rastro do bicho enorme até a Prefeitura e a luta entre as colunas do pavilhão da Kartoffelfest (batendo nelas, ela fica tonta) | dinamite (almoxarifado da Prefeitura) |
| 6 | A Linha Cruzada | noite | todos os telefones da cidade tocam juntos; quem atende sai andando para o mato. Atender de novo os orelhões que chamam três sonâmbulos para acordá-los (as almas rondam cada um); no livro de atas de 1879, o acordo do sino às oito; tocar o sino da torre e aguentar as almas que sobem | — |
| 7 | Lua Cheia | lua cheia, céu limpo | o sétimo filho dos Hoffmann; revólver do museu, prata dos castiçais da igreja fundida na forja do Seu Arno; a caçada ao lobisomem | revólver .38 com balas de prata |
| 8 | Finados | garoa e neblina | acender as velas dos quatro fundadores com o cemitério cheio de fantasmas, descer à cripta e trazer a cruz de ferro | cruz de ferro (e a pá do coveiro) |
| 9 | A Mulher da Fotografia | chuva | o padre liga do orelhão: a mulher de preto da foto de 1910 saiu da foto. Na igreja apagada, as imagens cobertas andam quando ninguém olha; acender os castiçais e a lamparina, subir à torre e afastar o vulto com o lampião (ela foge para o telhado) | — |
| 10 | Asas da Noite | noite de vento | a bruxa aparece no telhado da igreja; queimar os três ninhos de morcegos-vampiro gigantes e derrubar a rainha deles na torre | — |
| 11 | O Covil | chuva | rifle de dardos na agropecuária, o rastro de sangue até a gruta, cansar o chupacabras e capturá-lo vivo; quebrar os cristais da pedra do céu | rifle de dardos (só derruba bicho cansado) |
| 12 | A Bruxa | lua de sangue | a última luta no túmulo dela: invocações, círculos de fogo, rituais; de joelhos e fraca, a cruz sela a bruxa. O amanhecer e os créditos | todas |

Entre os objetivos, de noite, criaturas soltas aparecem pela cidade (cães de fogo,
morcegos, fantasmas, ETs, conforme o capítulo). Derrotadas, às vezes largam munição,
cuca ou querosene. Cada capítulo termina com criaturas derrotadas, quedas, tempo e
uma avaliação (S, A, B, C). Morrendo, o jogador volta ao último ponto de retorno.

### Salvamento e capítulos

O status do jogador fica salvo no navegador (localStorage, chave `teewald.save.v1`):
vida, armas, munição, itens e arma branca, o capítulo e a **etapa** onde parou, a
posição (ou o último ponto de retorno, se houver criatura por perto), se está dentro
da fábrica, da cripta ou da gruta, e o que já foi feito na etapa (objetos da Lúcia,
velas acesas, ninhos queimados, cristais quebrados). Salva sozinho ao trocar de
etapa, em cada ponto de retorno, a cada 20 s, ao cair e ao fechar ou trocar de aba;
um ícone de disquete com PROGRESSO SALVO aparece no canto.

- **CONTINUAR** volta exatamente para onde parou. Lutas com chefe recomeçam pela
  chegada à arena.
- **CAPÍTULOS** mostra os doze: os liberados com a melhor nota (S, A, B, C) e os outros
  bloqueados, mais o tempo de jogo, as criaturas derrotadas e as quedas somadas.
  Dali dá para **apagar o progresso** (pede confirmação).
- Sair para o menu pela pausa não perde nada.
- Saves de quando o jogo tinha dez capítulos são convertidos sozinhos para a
  numeração nova (os capítulos 6 e 9 entraram no meio). O código que depende da
  história usa a chave do capítulo (`key`, em `src/game/chapters/index.js`), não o número.

Para testes: `?chapter=5` na URL começa direto num capítulo.

### Dificuldade

Em Opções, **DIFICULDADE** (fácil, normal, difícil) muda o dano que o jogador recebe,
o quanto as criaturas aguentam, a chance de largarem munição ou comida e a munição
devolvida depois de uma queda (`src/game/difficulty.js`).

Arquivos: `src/game/campaign.js` (objetivos, conversas, narração, cenas de câmera,
ondas, criaturas soltas, pontos de retorno, cartelas, salvamento) e
`src/game/chapters/` (um arquivo por capítulo; `common.js` tem os lugares da cidade
e peças de cenário).

## Combate

- **Soco** em combo de três golpes, sempre disponível. O golpe vira sozinho para a
  criatura mais perto à frente, dá um pequeno avanço e um tranco ao acertar.
- **Armas brancas** achadas no chão: pedaço de pau, cano de ferro, pá, foice e
  machado. Batem mais forte e mais longe, mas gastam e quebram (a barrinha embaixo
  do nome). Pegar outra larga a atual no chão.
- **Pedras e tijolos** para arremessar (o golpe joga; a pedra caída pode ser pega
  de novo). Com arma de fogo na mão, V / RB dá uma **coronhada**.
- **Esquiva** rápida com um instante de invencibilidade.
- **Armas de fogo e especiais**: pistola, espingarda (chumbo espalhado), revólver
  com prata, pistola de raios (a carga volta sozinha), rifle de dardos, lampião
  bento (segurar o gatilho solta a luz que queima fantasmas) e dinamite (acende e
  joga; a explosão fere tudo em volta, inclusive o jogador).
- Cada criatura resiste de um jeito: bala atravessa fantasma, só prata fere o
  lobisomem, o escudo do ET grande cai com a pistola de raios, a Fera sente a
  dinamite. Vida do jogador: 100, com cura por **cuca** e **chá de marcela**.
- Inventário com 16 espaços: EQUIPAR, CARREGAR (cada arma com sua munição), USAR
  (comida) e EXAMINAR.

Arquivos: `src/game/combat.js`, `src/game/weapon.js` (armas de fogo),
`src/game/items.js`, `src/game/itemModels.js` e `src/game/creatures/` (a base
`base.js` com movimento, acerto, resistências e morte, mais uma criatura por arquivo).

## Clima, hora e luz

`src/world/atmosphere.js` controla a hora e o clima: tarde encoberta, anoitecer,
noite, lua cheia (com estrelas e a lua enorme), madrugada de neblina fechada, chuva,
garoa, tempestade (raios com clarão e trovão que chega depois), lua de sangue,
amanhecer e interiores escuros. A troca é suave. O material PS1 ganhou **luzes
dinâmicas por pixel** (8 ao mesmo tempo): a lanterna do protagonista à noite (em
foco, seguindo a mira), os lampiões da praça acesos, o fogo dos cães, o clarão dos
tiros e das explosões, velas e cristais. A chuva tem gotas, respingos no chão e som
(abafado dentro de casa); de noite há grilos e coruja no lugar dos corvos.

Interiores (`src/world/interiors.js` e `src/world/interiors/`): a fábrica de
calçados, a cripta dos fundadores, a gruta do chupacabras e a Igreja Matriz são
montados longe da cidade, com colisão e luzes próprias; entrar e sair passa por uma
tela preta.

## A cidade de noite (extras)

Valem em todos os capítulos (`src/game/extras.js`; os textos estão em `src/game/lore.js`):

- **Igreja Matriz por dentro** (`src/world/interiors/igreja.js`): entra-se pelo portal
  ou pela porta lateral da sacristia. Lá dentro há vestíbulo sob a torre, nave com
  bancos e colunas, abóbada azul com estrelas, vitrais (de tarde, com feixes de luz
  dourada; de noite, quase apagados), púlpito, confessionário, via-sacra, coro com
  órgão, presbitério com mesa de comunhão, retábulo de Nossa Senhora Auxiliadora,
  lamparina vermelha, altares laterais com velas votivas, sacristia e um depósito
  com imagens cobertas. Subindo pela escada do coro chega-se à torre, onde dá para
  TOCAR O SINO. A água benta cura um pouco, uma vez por capítulo. Nas lutas ao lado
  da igreja (a defesa do capítulo 2 e a rainha dos morcegos no 10) a porta fica
  fechada. No capítulo 3 o lampião bento está na mesa da sacristia. No 7 o padre
  entrega os castiçais de prata no altar, e depois disso eles somem de lá.
- **Arquivos**: 18 documentos espalhados pela cidade e dentro da igreja: recortes
  da Folha de Teewald, páginas do diário do Pastor Wendt, cartas, cartazes e fotos.
  Brilham no chão ou presos em postes; LER abre o papel, que fica guardado.
- **Lendas do Herval**: uma ficha para cada criatura, liberada ao vê-la de perto.
- **Pedidos**: a gata Mimi da Dona Hilda (escondida na torre da igreja) e o
  cachorro Bóris do Lucas (a coleira está no mato, perto da clareira). De noite,
  os dois esperam na porta de casa, e a entrega rende chá, cuca ou munição.
- **Orelhões que tocam sozinhos**: de noite, um orelhão perto toca (até duas vezes
  por capítulo). ATENDER traz uma voz diferente em cada capítulo. Além do orelhão
  da praça, há orelhões perto do ponto de telefone real, dos Correios, do hospital
  e da escola.
- **A presença** (`src/game/presence.js`): do capítulo 2 ao 10, de vez em quando o
  chupacabras aparece na beira da neblina comendo uma ovelha. Quando o jogador chega
  perto, mira nele ou fica olhando muito tempo, ele guincha e foge aos pulos,
  deixando sangue.
- **A bandinha fantasma** (`src/game/ghostBand.js`): de noite, perto do pavilhão
  da Kartoffelfest, três músicos translúcidos tocam uma valsa desafinada no palco
  vazio. Quando o jogador chega perto demais, a música para e alguém sussurra.

Documentos, lendas e pedidos ficam salvos à parte (localStorage
`teewald.extras.v1`) e aparecem em ARQUIVOS, na pausa, na tela título e com a
tecla J. APAGAR PROGRESSO também apaga esses.

## Missão 1: O Chupacabras

O foco do jogo é pegar o chupacabras. Animais aparecem mortos e sem sangue em
Teewald, e a primeira missão começa assim que a abertura no calçadão termina:

1. **Cartaz de PROCURA-SE** no mural da Praça 10 de Abril, ao lado do fim do calçadão.
2. **Galinheiro atacado** perto da Igreja Matriz (no terreno atrás da escola, na
   beira da mata): tela arrancada, galinhas mortas, penas e sangue.
3. **Pegadas de três dedos**, sempre em pares (o bicho anda aos pulos), entram na mata.
4. Na **clareira** ao norte do cemitério, o chupacabras come uma ovelha. Ao
   chegar perto, uma cena curta mostra o bicho se virando e guinchando.
5. **Luta**: ele rodeia, investe, agacha chiando (o aviso) e dá o bote; um tiro
   durante o aviso cancela o bote. Na cabeça o tiro vale o dobro. O jogador tem
   vida (recupera devagar longe do perigo); se cair, volta para a trilha antes
   da clareira.
6. Ferido, o bicho **foge mata adentro** deixando rastro de sangue: missão
   cumprida, com o gancho para as próximas.

O objetivo atual aparece no canto da tela, com uma marca na tela e no minimapa.
O chupacabras (`src/game/chupacabra.js`) é um bípede corcunda com espinhos nas
costas, garras e olhos vermelhos que brilham, montado em peças rígidas como nos
primeiros jogos de PS1, com animação, IA e sons (guincho, chiado, rosnado)
feitos em código. O cenário fica em `src/world/chupaSites.js` e a missão em
`src/game/mission.js`.

## O que já existe

- **Mapa real**: ruas, Rio Cadeia, arroios, praça, campo, cemitério e prédios
  conhecidos vêm do OpenStreetMap; o relevo vem do SRTM (altitude real). Perto
  dos rios o terreno usa uma grade 4x mais fina, com taludes que se alargam
  onde a margem é alta (sem paredões) e o arroio desaguando no nível do rio.
- **Igreja Matriz** modelada a partir de `texture/igreja.png`: rosácea, portal
  com arquivoltas, janelas ogivais com vitral e campanário com venezianas,
  desenhados em pixel art (`src/engine/archTextures.js`) com pedra, reboco e
  madeira da pasta `texture`. Posição e orientação conferidas em imagem de
  satélite: fachada a oeste, nave ao longo da Rua 12 de Maio, cemitério atrás.
- **Praça 10 de Abril**: fonte, hortênsias, bancos, lampiões e orelhão.
- **Calçadão do Rio Cadeia**: na margem do lado da VRS-873, entre o rio e a
  avenida, sem cruzar a água; caminho, guarda-corpo, letreiro TEEWALD e
  Monumento ao Imigrante. O jogo começa aqui.
- **Mobiliário organizado** (`spotFree`/`benchFits` em `src/world/props.js`):
  nenhuma peça entra encaixada em outra nem em cima do caminho. Banco só com a
  frente livre até o caminho (sem poste, lixeira, canteiro ou grade no meio), e
  a frente dos bancos, das mesas, da parada e do letreiro fica reservada:
  árvores, postes e placas posteriores desviam dela.
- Cemitério, Sociedade, Prefeitura, Museu (enxaimel), Posto Calçadão, fábricas
  de calçados, escola, hospital e comércio.
- **Pavilhão da Kartoffelfest** montado em cima da Rua Beno Closs, a rua da
  Prefeitura: uns 70 m de lona listrada com bambinela, do começo da rua (cruzamento
  com a VRS-873) até a saída do estacionamento da Prefeitura. A rua está fechada
  com cavaletes nas duas pontas ("RUA FECHADA – ENTRADA SÓ A PÉ"). Entrando pelo
  pórtico enxaimel: batata do produtor, café colonial, barraca de tiro, salsichão,
  mesas compridas com toalha xadrez, Kartoffelhaus com sacos de batata, chope,
  pista de dança e palco das bandinhas, com bandeirolas e varais de lâmpadas que
  acendem à noite. É uma subtrama paralela: a festa deste ano foi cancelada (faixa
  CANCELADA nos letreiros), e o vigia, a cozinheira, a rainha da festa e a
  Prefeitura falam disso sem mexer na história dos capítulos.
- **Carros** low poly (`src/world/vehicles.js`): sedã de quatro portas e hatch
  de duas, com vidros, faróis, lanternas, placa cinza, para-choques, frisos e
  rodas de aço desenhados em pixel art (`src/engine/carTextures.js`).
- Cerca de 600 construções nos **contornos reais dos prédios** (Microsoft
  Building Footprints): alvenaria, madeira, enxaimel (vigas escuras com reboco
  branco, creme ou tijolo à vista, alinhadas com portas e janelas), comércio
  com placas e vitrines, fábricas com janelas industriais e portão de enrolar,
  e galpões. Janelas (colonial, madeira com bandeira, alumínio), venezianas e
  portas são desenhadas em pixel art; casas rebocadas têm barrado na base.
  Lotes com muro rebocado, mureta com grade, tijolo, pedra ou cerca de ripas,
  sempre com portão diante da porta, calçadinha até a entrada e laterais que
  voltam até os fundos da casa.
- **Minimapa** no canto inferior direito, girando com a câmera (tecla M).
- **Inventário** de 8 espaços no estilo dos survival horror de PS1 (pausa o
  jogo): item girando em 3D, ícones renderizados do próprio modelo, ações
  EQUIPAR / GUARDAR / CARREGAR / EXAMINAR. Começa com uma **pistola 9 mm**
  (pente de 12) e uma caixa com 36 balas.
- **Pistola**: mira por cima do ombro, tiro calculado contra prédios, postes,
  árvores, chão e água (poeira, faíscas, lascas, respingos e marcas de bala),
  clarão, cápsulas ejetadas, coice, recarga animada e sons sintetizados com eco.
- **Tiro ao alvo**: latas e garrafas em três estandes (Calçadão, perto do início;
  barraca no Pavilhão da Kartoffelfest; atrás de um gol do campo). Lata voa e
  quica, garrafa quebra; o estande limpo se remonta. Ao lado de cada estande há
  uma caixa de munição (+12), que reaparece depois de um minuto.
- **24 moradores com falas** (`src/game/npcData.js`), todos com medo e cada um
  com um pedaço da história: o pescador que viu olhos vermelhos na outra margem,
  a senhora procurando a gata, o rapaz atrás do cachorro que sumiu, a repórter
  de Porto Alegre, o professor que conta do Blutsauger dos colonos e de 1978,
  Seu Valdir sozinho na praça com o chimarrão, a banca de cuca fechada, o piá
  parado na fonte, a moça ligando para a tia que não atende, o casal que teve a
  janela arranhada, o padre do sino que tocou sozinho, a beata, o zelador do
  cemitério, o carteiro das casas que ninguém atende, a Prefeitura que diz que
  é graxaim, a Kartoffelfest cancelada (o vigia, a cozinheira e a rainha da
  festa sentada sozinha no pavilhão), o campo vazio, a floricultura e a loja fechando
  cedo. Roupa própria no mesmo esqueleto do protagonista (suéter, camisa xadrez,
  batina, terno, jardineira, vestido com avental, uniforme), chapéu, lenço,
  cabelo comprido ou objeto na mão. Andam, sentam, murmuram quando o jogador
  passa e alguns ficam parados encarando; a conversa abre com câmera de lado,
  texto lento letra a letra e voz grave em bipes. Com a pistola na mão eles
  comentam; mirada, levantam as mãos; um tiro por perto os faz encolher e
  fugir. Ninguém se machuca.
- **Protagonista** com ~1200 triângulos numa malha única com esqueleto
  (cotovelos e joelhos contínuos ao dobrar), sombreamento suave com oclusão
  assada nos vértices e visual sério, no estilo dos survival horror de PS1:
  textura própria em 256 px, rosto realista pintado com pincel macio (olhos
  fundos, sobrancelhas retas, barba por fazer), cabelo loiro penteado para trás
  fio a fio, jaqueta de couro marrom pespontada com lapelas sobre suéter cinza
  em V, calça escura e botas.
- **Animação** procedural com IK nas pernas: o pé apoiado fica plantado no chão
  e rola do calcanhar para a ponta, o quadril sobe e desce com a passada e o
  tronco gira ao contrário; corrida inclinada com braços a 90°; inclina nas
  curvas, dá passos ao girar no lugar, encolhe as pernas no pulo e amortece o
  pouso; mirando, anda de lado e de costas; parado, respira, troca o apoio
  entre as pernas e olha desconfiado em volta. Os moradores usam o mesmo
  esqueleto e a mesma caminhada.
- Milhares de árvores (araucárias, plátanos de outono, nativas, pinheiros,
  ciprestes) e folhas caindo.
- **Clima de terror**: céu encoberto, neblina fechada, luz fria, cores sem
  saturação, bordas escuras e grão de filme; som de vento, zumbido grave e, ao
  longe, corvos, cachorro uivando e o sino da igreja.
- **Estilo visual** (em **Opções**):
  - **3D LIMPO** (padrão): resolução da própria tela, antisserrilhado, texturas
    suaves com o dobro da resolução e sem pixel nem dithering; os polígonos
    low poly aparecem nítidos.
  - **PS1 RETRÔ**: 320x240 ampliado sem suavização, dithering, cor de 15 bits e,
    se quiser, distorção de textura.
  - O tremor de vértices (a malha "se mexendo") foi removido do jogo. Dá para
    forçar o estilo pela URL com `?visual=ps1` ou `?visual=clean`.
- **Iluminação** (em **Opções**, vale para os dois estilos):
  - **AVANÇADA** (padrão): entardecer com sol baixo e avermelhado no oeste,
    céu em brasa do lado do sol, nuvens acesas por baixo e neblina dourada
    olhando para o sol; crepúsculo vermelho no capítulo 2. Sombras projetadas
    do sol e do luar (prédios, árvores, postes, personagem, moradores e
    criaturas). Noites claras com lua detalhada, estrelas que piscam, Via
    Láctea e nuvens passando na frente; halos quentes nos lampiões. Chuva,
    neblina fechada e interiores ficam sem sombra.
  - **CLÁSSICA**: a luz antiga, encoberta e sem sombras.
  - Para ficar leve, a sombra da parte fixa da cidade é guardada e só refeita
    a cada poucos metros andados; por quadro só o que se mexe é desenhado de
    novo (no celular o mapa de sombra é menor). Pela URL: `?light=classic` ou
    `?light=advanced`.

## Exportar modelos

O protagonista sai como arquivo `.glb` (glTF binário), que abre no Blender
(Arquivo → Importar → glTF 2.0) com textura e esqueleto:

- `npm run exportar` grava `exportados/teewald-protagonista.glb` (a pasta fica fora
  do repositório);
- com o jogo aberto, `__teewald.exportar()` no console do navegador baixa o mesmo arquivo.

O modelo vem na pose de repouso, em metros (1,73 m, pés em y = 0, olhando para +z),
com a textura do 3D limpo (256 px) e 18 ossos nomeados com `.L`/`.R` (`ombro.L`,
`joelho.R`...). A sombra de oclusão vai na cor dos vértices; se ela não aparecer no
Blender, ligue um nó *Color Attribute* multiplicando a *Base Color*. **Limite:** a
animação do jogo é procedural (IK em código), então o arquivo leva o esqueleto mas
nenhum clipe de animação. O código fica em `src/engine/exporter.js`, carregado só
quando chamado.

## Estrutura

```
src/engine   motor: material PS1 (com luzes dinâmicas), sombras (shadows.js), texturas, renderizador, colisão, controles, som
src/world    cidade: relevo, ruas, rio, prédios, igreja, praça, calçadão, árvores, alvos, cenário da missão,
             clima e hora (atmosphere.js), interiores (interiors.js e interiors/: fábrica, cripta, gruta)
src/game     personagem, controle do jogador, câmera, itens, armas, mira assistida, combate, efeitos,
             moradores, missão 1, campanha (campaign.js) e capítulos (chapters/)
src/game/creatures  chupacabras na gruta, cão de fogo, morcegos, fantasmas, ETs e disco, Fera, lobisomem, bruxa
src/ui       menu, HUD, inventário, diálogo e textos
tools/       build-mapdata.mjs (regera os dados do mapa), exportar.mjs (modelos .glb), capturas de teste
texture/     texturas do projeto (servidas como pasta pública)
```

Para mudar o mapa: `npm run mapdata` regera `src/world/mapdata.json` a partir
do cache em `tools/cache`. Com `-- --refresh`, baixa tudo de novo da internet.

Dados de mapa © colaboradores do OpenStreetMap (ODbL). Contornos de prédios:
Microsoft Global ML Building Footprints (ODbL).

**Obra de ficção.** Todos os nomes, personagens e histórias do jogo são
inventados e não têm nenhuma relação real com a cidade de Santa Maria do Herval
ou com seus moradores. Teewald é um trabalho independente de Fabiano Kunst.
