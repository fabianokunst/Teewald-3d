# Teewald

Jogo de terror em terceira pessoa com visual de PlayStation 1, ambientado numa
versão de Santa Maria do Herval (RS) no outono: neblina, céu encoberto e uma
cidade com medo do que anda no mato. São dez capítulos: o chupacabras, os cães de
fogo, a moça da fábrica, os ETs de Varginha, a Fera da madrugada, o lobisomem, o
cemitério em Finados, os morcegos-vampiro e a bruxa Otília, com luta corpo a corpo,
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

## Controles

| Ação | Teclado / mouse | Controle | Toque (celular/tablet) |
|---|---|---|---|
| Andar | WASD ou setas | analógico esquerdo | arrastar no lado esquerdo |
| Correr | Shift | B (segurar) / L3 | botão CORRER (liga/desliga) |
| Pular | Espaço | A | botão PULAR |
| Esquiva | C ou Ctrl | B (toque rápido) | botão ESQUIVA |
| Câmera | mouse (clique na tela para prender) · Q/E | analógico direito | arrastar no lado direito |
| Centralizar câmera | — | R3 | toque duplo no lado direito |
| Zoom | roda do mouse | direcional ↑↓ | pinça com dois dedos |
| Conversar (perto de um morador) | F | A | botão FALAR sobre o morador |
| Ler / examinar / pegar / entrar | F ou E | A | botão sobre o objeto (LER, PEGAR, ENTRAR...) |
| Inventário | I ou Tab | Y | botão INV |
| Golpe (soco, arma branca, arremesso) | V · botão esquerdo sem arma de fogo | RB | botão GOLPE |
| Trocar de arma | 1 a 8 (1 = mãos) | direcional ◀▶ | botão ARMA |
| Comer / beber (cura) | H | inventário | inventário |
| Mirar (com arma de fogo) | botão direito (segurar) | L2 ou LB (segurar) | botão MIRAR (liga/desliga) |
| Atirar (segurar: luz do lampião) | botão esquerdo | R2 | botão ATIRAR |
| Recarregar / reabastecer | R | X | botão REC |
| Pausa | Esc ou P | Start | botão ❚❚ |
| Minimapa (liga/desliga) | M | Select | Opções |
| Tela cheia | F11 | — | botão ⛶ (Android e iPad) |
| Mostrar FPS | F3 | — | — |

Menus: setas/ENTER, direcional/A/B (segurar repete), clique ou toque. Na pausa,
START ou P de novo voltam ao jogo.

Atirar sem mirar levanta a pistola, atira e mantém a mira por um instante.
Mirando, o personagem anda devagar em qualquer direção e a câmera vai para o
ombro direito. No controle e no toque, a mira puxa de leve para alvos próximos.

No celular o jogo entra em tela cheia ao tocar na tela inicial (Android) e fica
melhor deitado; em pé, a imagem fica em 4:3 no alto e os controles embaixo.
Dá para jogar no celular com controle Bluetooth: os botões da tela somem quando
o controle é usado e voltam ao tocar na tela.

Os menus no toque (`src/ui/touchMenu.js`) usam botões grandes na tela inteira:
o botão acende ao encostar e só age ao soltar em cima dele. Em Opções cada linha
tem ◀ e ▶ (deitado, em duas colunas; arrastar rola se não couber), e há opções
só do celular: **tamanho dos botões** (pequeno, médio, grande) e **vibração**
(Android). Sair da partida pela pausa pede confirmação. Em pé, o inventário
mostra as ações do item em botões grandes na parte de baixo; em EXAMINAR,
arrastar gira o item.

## Campanha: a noite que não termina

O jogo tem dez capítulos. O primeiro é a caçada ao chupacabras numa tarde de
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
| 6 | Lua Cheia | lua cheia, céu limpo | o sétimo filho dos Hoffmann; revólver do museu, prata dos castiçais da igreja fundida na forja do Seu Arno; a caçada ao lobisomem | revólver .38 com balas de prata |
| 7 | Finados | garoa e neblina | acender as velas dos quatro fundadores com o cemitério cheio de fantasmas, descer à cripta e trazer a cruz de ferro | cruz de ferro (e a pá do coveiro) |
| 8 | Asas da Noite | noite de vento | a bruxa aparece no telhado da igreja; queimar os três ninhos de morcegos-vampiro gigantes e derrubar a rainha deles na torre | — |
| 9 | O Covil | chuva | rifle de dardos na agropecuária, o rastro de sangue até a gruta, cansar o chupacabras e capturá-lo vivo; quebrar os cristais da pedra do céu | rifle de dardos (só derruba bicho cansado) |
| 10 | A Bruxa | lua de sangue | a última luta no túmulo dela: invocações, círculos de fogo, rituais; de joelhos e fraca, a cruz sela a bruxa. O amanhecer e os créditos | todas |

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
- **CAPÍTULOS** mostra os dez: os liberados com a melhor nota (S, A, B, C) e os outros
  bloqueados, mais o tempo de jogo, as criaturas derrotadas e as quedas somadas.
  Dali dá para **apagar o progresso** (pede confirmação).
- Sair para o menu pela pausa não perde nada.

Para testes: `?chapter=5` na URL começa direto num capítulo.

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
calçados, a cripta dos fundadores e a gruta do chupacabras são montados longe da
cidade, com colisão e luzes próprias; entrar e sair passa por uma tela preta.

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
- Cemitério, Kartoffelfest, Sociedade, Prefeitura, Museu (enxaimel), Posto
  Calçadão, fábricas de calçados, escola, hospital e comércio.
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
- **23 moradores com falas** (`src/game/npcData.js`), todos com medo e cada um
  com um pedaço da história: o pescador que viu olhos vermelhos na outra margem,
  a senhora procurando a gata, o rapaz atrás do cachorro que sumiu, a repórter
  de Porto Alegre, o professor que conta do Blutsauger dos colonos e de 1978,
  Seu Valdir sozinho na praça com o chimarrão, a banca de cuca fechada, o piá
  parado na fonte, a moça ligando para a tia que não atende, o casal que teve a
  janela arranhada, o padre do sino que tocou sozinho, a beata, o zelador do
  cemitério, o carteiro das casas que ninguém atende, a Prefeitura que diz que
  é graxaim, a festa adiada, o campo vazio, a floricultura e a loja fechando
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

## Estrutura

```
src/engine   motor: material PS1 (com luzes dinâmicas), texturas, renderizador, colisão, controles, som
src/world    cidade: relevo, ruas, rio, prédios, igreja, praça, calçadão, árvores, alvos, cenário da missão,
             clima e hora (atmosphere.js), interiores (interiors.js e interiors/: fábrica, cripta, gruta)
src/game     personagem, controle do jogador, câmera, itens, armas, combate, efeitos, moradores, missão 1,
             campanha (campaign.js) e capítulos (chapters/)
src/game/creatures  chupacabras na gruta, cão de fogo, morcegos, fantasmas, ETs e disco, Fera, lobisomem, bruxa
src/ui       menu, HUD, inventário, diálogo e textos
tools/       build-mapdata.mjs (regera os dados do mapa), capturas de teste
texture/     texturas do projeto (servidas como pasta pública)
```

Para mudar o mapa: `npm run mapdata` regera `src/world/mapdata.json` a partir
do cache em `tools/cache`. Com `-- --refresh`, baixa tudo de novo da internet.

Dados de mapa © colaboradores do OpenStreetMap (ODbL). Contornos de prédios:
Microsoft Global ML Building Footprints (ODbL).
