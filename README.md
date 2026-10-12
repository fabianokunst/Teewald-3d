# Teewald

Jogo em terceira pessoa com visual de PlayStation 1, ambientado numa versão de
Santa Maria do Herval (RS) no outono. Roda no navegador (Three.js + Vite).

## Como rodar

Precisa do Node.js instalado.

- Dê dois cliques em `iniciar.bat`, **ou**
- no terminal: `npm install` (só na primeira vez) e depois `npm run dev`.

O navegador abre em `http://localhost:5173`.

## Controles

| Ação | Teclado / mouse | Controle | Toque (celular/tablet) |
|---|---|---|---|
| Andar | WASD ou setas | analógico esquerdo | arrastar no lado esquerdo |
| Correr | Shift | B / L3 / R2 | botão CORRER (liga/desliga) |
| Pular | Espaço | A | botão PULAR |
| Câmera | mouse (clique na tela para prender) · Q/E | analógico direito | arrastar no lado direito |
| Centralizar câmera | — | R3 | toque duplo no lado direito |
| Zoom | roda do mouse | direcional ↑↓ | pinça com dois dedos |
| Pausa | Esc ou P | Start | botão ❚❚ |
| Minimapa (liga/desliga) | M | Select | Opções |
| Tela cheia | F11 | — | botão ⛶ (Android e iPad) |
| Mostrar FPS | F3 | — | — |

Menus: setas/ENTER, direcional/A/B (segurar repete), clique ou toque. Na pausa,
START ou P de novo voltam ao jogo.

No celular o jogo entra em tela cheia ao tocar na tela inicial (Android) e fica
melhor deitado; em pé, a imagem fica em 4:3 no alto e os controles embaixo.
Dá para jogar no celular com controle Bluetooth: os botões da tela somem quando
o controle é usado e voltam ao tocar na tela.

## O que já existe

- **Mapa real**: ruas, Rio Cadeia, arroios, praça, campo, cemitério e prédios
  conhecidos vêm do OpenStreetMap; o relevo vem do SRTM (altitude real).
- **Igreja Matriz** modelada a partir de `texture/igreja.png`: rosácea, portal
  com arquivoltas, janelas ogivais com vitral e campanário com venezianas,
  desenhados em pixel art (`src/engine/archTextures.js`) com pedra, reboco e
  madeira da pasta `texture`. Posição e orientação conferidas em imagem de
  satélite: fachada a oeste, nave ao longo da Rua 12 de Maio, cemitério atrás.
- **Praça 10 de Abril**: fonte, hortênsias, bancos, lampiões e orelhão.
- **Calçadão do Rio Cadeia**: caminho, guarda-corpo, letreiro TEEWALD e
  Monumento ao Imigrante. O jogo começa aqui.
- Cemitério, Kartoffelfest, Sociedade, Prefeitura, Museu (enxaimel), Posto
  Calçadão, fábricas de calçados, escola, hospital e comércio.
- Cerca de 600 construções nos **contornos reais dos prédios** (Microsoft
  Building Footprints): alvenaria, madeira, enxaimel (vigas escuras com reboco
  branco, creme ou tijolo à vista, alinhadas com portas e janelas), comércio
  com placas e vitrines, e galpões.
- **Minimapa** no canto inferior direito, girando com a câmera (tecla M).
- **Protagonista** com ~1200 triângulos numa malha única com esqueleto
  (cotovelos e joelhos contínuos ao dobrar), sombreamento suave e um atlas de
  128x128 pintado a partir das texturas da pasta: jaqueta de lona com bolsos e
  zíper, calça marrom, botas com cadarço, cabelo loiro em mechas e olhos azuis.
- Milhares de árvores (araucárias, plátanos de outono, nativas, pinheiros,
  ciprestes) e folhas caindo.
- Efeitos de PS1: 320x240, tremor de vértices, dithering, cor de 15 bits,
  neblina e iluminação por vértice. Tudo isso pode ser ajustado em **Opções**.

## Estrutura

```
src/engine   motor: material PS1, texturas, renderizador, colisão, controles, som
src/world    cidade: relevo, ruas, rio, prédios, igreja, praça, calçadão, árvores
src/game     personagem, controle do jogador, câmera
src/ui       menu, HUD e textos
tools/       build-mapdata.mjs (regera os dados do mapa), capturas de teste
texture/     texturas do projeto (servidas como pasta pública)
```

Para mudar o mapa: `npm run mapdata` regera `src/world/mapdata.json` a partir
do cache em `tools/cache`. Com `-- --refresh`, baixa tudo de novo da internet.

Dados de mapa © colaboradores do OpenStreetMap (ODbL). Contornos de prédios:
Microsoft Global ML Building Footprints (ODbL).
