# Teewald

Jogo de terror em terceira pessoa com visual de PlayStation 1, ambientado numa
versão de Santa Maria do Herval (RS) no outono: neblina, céu encoberto e uma
cidade com medo do que anda no mato. Roda no navegador (Three.js + Vite).

## Como rodar

Precisa do Node.js instalado.

- Dê dois cliques em `iniciar.bat`, **ou**
- no terminal: `npm install` (só na primeira vez) e depois `npm run dev`.

O navegador abre em `http://localhost:5173`.

Com o jogo rodando, `npm run audit` faz uma revisão técnica do mundo: lista
superfícies enterradas no terreno, pisos flutuando, objetos encaixados uns nos
outros e objetos no meio da pista.

## Controles

| Ação | Teclado / mouse | Controle | Toque (celular/tablet) |
|---|---|---|---|
| Andar | WASD ou setas | analógico esquerdo | arrastar no lado esquerdo |
| Correr | Shift | B / L3 / R2 | botão CORRER (liga/desliga) |
| Pular | Espaço | A | botão PULAR |
| Câmera | mouse (clique na tela para prender) · Q/E | analógico direito | arrastar no lado direito |
| Centralizar câmera | — | R3 | toque duplo no lado direito |
| Zoom | roda do mouse | direcional ↑↓ | pinça com dois dedos |
| Conversar (perto de um morador) | F | A | botão FALAR sobre o morador |
| Ler / examinar (cartaz, pistas) | F ou E | A | botão LER / EXAMINAR |
| Inventário | I ou Tab | Y | botão INV |
| Mirar (com a pistola na mão) | botão direito (segurar) | L2 ou LB (segurar) | botão MIRAR (liga/desliga) |
| Atirar | botão esquerdo | R2 mirando · RB | botão ATIRAR |
| Recarregar | R | X | botão REC |
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
  (cotovelos e joelhos contínuos ao dobrar), sombreamento suave e visual sério,
  no estilo dos survival horror de PS1: rosto realista pintado com pincel macio
  (olhos fundos, sobrancelhas retas, barba por fazer), cabelo loiro
  penteado para trás, jaqueta de couro marrom com lapelas sobre suéter cinza em V,
  calça escura e botas.
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
src/engine   motor: material PS1, texturas, renderizador, colisão, controles, som
src/world    cidade: relevo, ruas, rio, prédios, igreja, praça, calçadão, árvores, alvos, cenário da missão
src/game     personagem, controle do jogador, câmera, itens, pistola, efeitos de tiro, moradores, missão e chupacabras
src/ui       menu, HUD, inventário, diálogo e textos
tools/       build-mapdata.mjs (regera os dados do mapa), capturas de teste
texture/     texturas do projeto (servidas como pasta pública)
```

Para mudar o mapa: `npm run mapdata` regera `src/world/mapdata.json` a partir
do cache em `tools/cache`. Com `-- --refresh`, baixa tudo de novo da internet.

Dados de mapa © colaboradores do OpenStreetMap (ODbL). Contornos de prédios:
Microsoft Global ML Building Footprints (ODbL).
