// Configurações do jogo (salvas no navegador)
const KEY = 'teewald.settings.v1';

export const DEFAULTS = {
  lang: null,           // idioma: 'pt' | 'en' | 'es' | 'de' (null = o do navegador; i18n/index.js)
  difficulty: 1,        // 0 fácil, 1 normal, 2 difícil (game/difficulty.js)
  visual: 'clean',      // 'clean' = 3D limpo (resolução da tela, sem pixel) | 'ps1' = retrô
  resolution: 240,      // só no estilo PS1: linhas internas (240 = PS1, 0 = nativa da tela)
  aspect: 'wide',       // 'wide' ocupa a tela toda, '4:3' usa barras laterais
  affine: 0,            // só no estilo PS1: distorção de textura (0 desligada, 1 sutil, 2 total)
  dither: true,         // só no estilo PS1: dithering + cor de 15 bits
  lighting: 'advanced', // 'advanced' = sol avermelhado, sombras projetadas, céu de estrelas | 'classic' = luz antiga
  drawDistance: 1,      // 0 curta, 1 média, 2 longa
  sensitivity: 5,       // 1..10
  invertY: false,
  aimAssist: 1,         // controle e toque: mira assistida (0 desligada, 1 normal, 2 forte)
  volume: 7,            // 0..10
  fps: 60,              // 30 ou 60
  minimap: true,        // minimapa no canto inferior direito (tecla M)
  touchSize: 1,         // celular: tamanho dos botões na tela (0 pequeno, 1 médio, 2 grande)
  vibrate: true,        // vibração: botões do celular (Android) e controle (tiros, golpes, dano)
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* sem armazenamento disponível */ }
  return { ...DEFAULTS };
}

export const settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignora */ }
}

// limites da área jogável (metros, x = leste, z = sul): a cidade e +1 km para cada lado
export const PLAY_BOUNDS = { x0: -1430, x1: 1580, z0: -1500, z1: 1470 };
// a área jogável de antes (só a cidade): o mato, os quintais e as casas dela continuam
// sorteados dentro destes limites, para a cidade não mudar com a área ampliada
export const TOWN_BOUNDS = { x0: -430, x1: 580, z0: -500, z1: 470 };
// os interiores (fábrica, cripta, gruta, igreja) ficam longe de tudo, a partir daqui (x e z)
export const INTERIOR_MIN = 8000;

// ponto inicial: calçadão do Rio Cadeia
export const START = { x: -322, z: 318, heading: 0.35 };
