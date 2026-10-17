import { TEX } from './textures.js';
import { paint, mul, finish } from './archTextures.js';
import { makeHeroCarTextures } from './heroCarTextures.js';

// Texturas dos carros em pixel art. A lataria é clara e recebe a cor do carro
// pela cor do vértice; vidros, faróis, lanternas, placa e rodas não são tingidos.

// fonte 3x5 para a placa
const GLYPHS = {
  T: ['111', '010', '010', '010', '010'], E: ['111', '100', '110', '100', '111'], '-': ['000', '000', '111', '000', '000'],
  1: ['010', '110', '010', '010', '111'], 9: ['111', '101', '111', '001', '111'], 0: ['111', '101', '101', '101', '111'],
};

export function makeCarTextures() {
  // lataria: brilho no alto, sombra embaixo (curvatura da porta)
  TEX.carBody = finish(paint(16, 32, (x, y) => {
    const k = y <= 1 ? 1.12 : y < 12 ? 1 - y * 0.004 : 0.95 - (y - 12) * 0.018;
    const n = ((x * 37 + y * 91) % 7) - 3;
    return [236 * k + n, 236 * k + n, 236 * k + n];
  }), false);

  // vidro: céu refletido em cima, interior escuro embaixo, reflexo diagonal
  const glass = (x, y, h) => {
    const t = y / h;
    const c = [118 - t * 70, 128 - t * 74, 140 - t * 76];
    const r = (((x * 2 - y * 3) % 47) + 47) % 47;
    return r < 6 ? c.map(v => v + 34) : r < 9 ? c.map(v => v + 14) : c;
  };
  TEX.carGlass = finish(paint(32, 16, (x, y) => (y === 0 ? [30, 30, 32] : glass(x, y, 16))), false);
  const wiper = (x, y) => [[14, 30], [34, 50]].some(([a, b]) => x >= a && x <= b && y === Math.round(27 - (x - a) * 5 / 16));
  const shield = front => finish(paint(64, 32, (x, y) => {
    if (x < 2 || x > 61 || y < 2 || y > 29) return [26, 26, 28]; // borracha
    if (front && ((y < 7 && x >= 28 && x <= 35) || wiper(x, y))) return [20, 20, 22]; // retrovisor e limpadores
    return glass(x, y, 32);
  }), false);
  TEX.carWindshield = shield(true);
  TEX.carRearGlass = shield(false);

  // frente: faróis retangulares com aro cromado, piscas e grade preta com emblema
  TEX.carFront = finish(paint(64, 16, (x, y) => {
    const left = x >= 2 && x <= 15, right = x >= 48 && x <= 61;
    if ((left || right) && y >= 2 && y <= 13) {
      if (x === 2 || x === 15 || x === 48 || x === 61 || y === 2 || y === 13) return [190, 192, 196];
      const d = Math.hypot((x - (left ? 8.5 : 54.5)) / 1.6, y - 7.5);
      return d < 2.2 ? [255, 250, 230] : d < 4 ? [214, 220, 226] : [160, 168, 176];
    }
    if ((x === 16 || x === 17 || x === 46 || x === 47) && y >= 3 && y <= 12) return [230, 150, 40];
    if (x >= 19 && x <= 44 && y >= 3 && y <= 12) {
      if (x >= 30 && x <= 33 && y >= 6 && y <= 9) return [200, 200, 204];
      return y % 3 === 0 ? [70, 72, 76] : [22, 22, 24];
    }
    return [30, 30, 32];
  }), false);

  // traseira: lanternas de freio, pisca e ré em painel preto
  TEX.carRear = finish(paint(64, 16, (x, y) => {
    const left = x >= 1 && x <= 20, right = x >= 43 && x <= 62;
    if ((left || right) && y >= 2 && y <= 13) {
      if (y === 2 || y === 13) return [40, 20, 20];
      const e = left ? x - 1 : 62 - x; // distância da borda externa
      if (e < 9) return (x + y) % 3 === 0 ? [200, 50, 44] : [170, 32, 30];
      return e < 15 ? [226, 140, 40] : [220, 220, 214];
    }
    if (x >= 29 && x <= 34 && y >= 6 && y <= 9) return [200, 200, 204];
    return [30, 30, 32];
  }), false);

  // placa cinza antiga (TEE-1910)
  const text = 'TEE-1910', x0 = Math.floor((40 - text.length * 4 + 1) / 2);
  TEX.carPlate = finish(paint(40, 14, (x, y) => {
    if (x === 0 || x === 39 || y === 0 || y === 13) return [30, 30, 30];
    if (y >= 2 && y <= 3 && x >= 8 && x <= 31) return x % 2 ? [120, 122, 118] : [178, 180, 176]; // cidade
    const i = Math.floor((x - x0) / 4), gx = (x - x0) % 4, gy = y - 6;
    if (i >= 0 && i < text.length && gx < 3 && gy >= 0 && gy < 5 && GLYPHS[text[i]][gy][gx] === '1') return [26, 26, 26];
    return [178, 180, 176];
  }), false);

  // roda de aço: pneu, aro, furos, quatro parafusos e calota
  TEX.carWheel = finish(paint(32, 32, (x, y) => {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (r > 15) return [16, 16, 18];
    if (r > 10.5) return mul([42, 42, 44], r > 14 ? 0.8 : 1);
    if (r > 9.5) return [120, 122, 126];
    const k = 1 - 0.18 * (dx + dy) / 16;
    if (r < 3) return mul([150, 152, 156], k);
    for (let i = 0; i < 4; i++) {
      const b = Math.PI / 4 + i * Math.PI / 2;
      if (Math.hypot(dx - Math.cos(b) * 5, dy - Math.sin(b) * 5) < 1.2) return [60, 60, 64];
    }
    if (r > 6.5 && r < 8.5 && Math.cos(a * 6) > 0.4) return [30, 30, 32];
    return mul([186, 188, 192], k);
  }), false);

  // o carro do protagonista
  makeHeroCarTextures();
}
