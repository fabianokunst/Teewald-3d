// Configurações do jogo (salvas no navegador)
const KEY = 'teewald.settings.v1';

export const DEFAULTS = {
  resolution: 240,      // linhas internas (240 = PS1, 0 = nativa da tela)
  aspect: 'wide',       // 'wide' ocupa a tela toda, '4:3' usa barras laterais
  jitter: true,         // tremor de vértices
  affine: 0,            // distorção de textura: 0 desligada, 1 sutil, 2 total
  dither: true,         // dithering + cor de 15 bits
  drawDistance: 1,      // 0 curta, 1 média, 2 longa
  sensitivity: 5,       // 1..10
  invertY: false,
  volume: 7,            // 0..10
  fps: 60,              // 30 ou 60
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

// limites da área jogável (metros, x = leste, z = sul)
export const PLAY_BOUNDS = { x0: -430, x1: 580, z0: -500, z1: 470 };

// ponto inicial: calçadão do Rio Cadeia
export const START = { x: -322, z: 318, heading: 0.35 };
