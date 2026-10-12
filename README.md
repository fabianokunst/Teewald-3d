# Teewald

Jogo em terceira pessoa com visual de PlayStation 1, ambientado numa versão de
Santa Maria do Herval (RS) no outono. Roda no navegador (Three.js + Vite).

## Como rodar

Precisa do Node.js instalado.

- Dê dois cliques em `iniciar.bat`, **ou**
- no terminal: `npm install` (só na primeira vez) e depois `npm run dev`.

O navegador abre em `http://localhost:5173`.

## Controles

| Ação | Teclado / mouse | Controle |
|---|---|---|
| Andar | WASD ou setas | analógico esquerdo |
| Correr | Shift | B / L3 / R2 |
| Pular | Espaço | A |
| Câmera | mouse (clique na tela para prender) · Q/E | analógico direito |
| Zoom | roda do mouse | — |
| Pausa | Esc ou P | Start |
| Mostrar FPS | F3 | — |

## O que já existe

- **Mapa real**: ruas, Rio Cadeia, arroios, praça, campo, cemitério e prédios
  conhecidos vêm do OpenStreetMap; o relevo vem do SRTM (altitude real).
- **Igreja Matriz** modelada a partir de `texture/igreja.png`: rosácea, portal
  e janelas recortados da foto.
- **Praça 10 de Abril**: fonte, hortênsias, bancos, lampiões e orelhão.
- **Calçadão do Rio Cadeia**: caminho, guarda-corpo, letreiro TEEWALD e
  Monumento ao Imigrante. O jogo começa aqui.
- Cemitério, Kartoffelfest, Sociedade, Prefeitura, Museu (enxaimel), Posto
  Calçadão, fábricas de calçados, escola, hospital e comércio.
- Cerca de 500 casas geradas ao longo das ruas: alvenaria, madeira, enxaimel
  (com as fotos de fachada da pasta `texture`) e comércio com placas.
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

Dados de mapa © colaboradores do OpenStreetMap (ODbL).
