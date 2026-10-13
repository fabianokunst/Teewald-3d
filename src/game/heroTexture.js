import { IMG, HERO_FILES, makeCanvas, shrink, processPixels, canvasTex } from '../engine/textures.js';

// Atlas 128x128 do protagonista, pintado na carga: o grão dos tecidos vem das
// texturas da pasta (lona, tecido da calça, cabelo da foto de referência). O rosto
// do protagonista é pintado com pincel macio (realista); roupas e detalhes, em pixel art.
// Coordenadas em pixels do atlas, origem no canto superior esquerdo.
// As linhas (v) de cada anel do modelo estão em character.js e batem com a pintura daqui.
// Os moradores (npcs.js) usam a mesma malha com outro atlas: o `look` troca as
// cores e o tipo de roupa (suéter, camisa, batina, terno, jardineira, vestido...).

export const ATLAS = 128;
export const REG = {
  jacket: [0, 0, 64, 48],     // tronco: volta completa, costas nas bordas, frente na coluna 32
  sleeve: [64, 0, 32, 48],    // manga: ombro em cima, punho embaixo
  pants: [96, 0, 32, 64],     // perna: coxa em cima, barra embaixo
  pelvis: [0, 48, 64, 16],
  head: [0, 64, 64, 40],      // cabeça: mapa cilíndrico com mais pixels no rosto
  lock: [64, 64, 32, 32],     // mechas de cabelo
  boot: [96, 64, 32, 32],     // cano (8 linhas) + pé
  ear: [96, 96, 16, 16],
  skin: [112, 96, 16, 16],    // pescoço
  hand: [0, 104, 24, 24],
  thumb: [24, 104, 8, 8],
  collar: [32, 104, 32, 8],
  collarIn: [32, 112, 32, 8],
  shirt: [64, 104, 32, 8],
};

// ---- cabeça ----
// u: fração da volta (0 = nuca, 0.5 = nariz) -> coluna; a frente (108°..252°) ganha 40 das 64 colunas
export const HEAD_H = 0.27;
const WARP = [[0, 0], [0.3, 12], [0.7, 52], [1, 64]];
const lerpTable = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) {
    const [x0, y0] = T[i - 1], [x1, y1] = T[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return T[T.length - 1][1];
};
export const headU = f => lerpTable(WARP, f);
const headF = x => lerpTable(WARP.map(([a, b]) => [b, a]), x);
export const headRow = y => REG.head[1] + (HEAD_H - y) / HEAD_H * REG.head[3];
// altura (m, a partir do queixo) da linha do cabelo; d = graus a partir da nuca
const HAIRLINE = [[0, 0.05], [60, 0.075], [95, 0.155], [130, 0.185], [180, 0.205]];
export const hairline = f => lerpTable(HAIRLINE, Math.min(f, 1 - f) * 360);

// ---- cores ----
// paleta do protagonista; o `look` de cada morador troca parte dela
const BASE = {
  jacket: [150, 98, 62],
  pants: [78, 60, 48],
  boot: [104, 66, 42],
  sole: [48, 38, 32],
  skin: [230, 186, 154],
  shirt: [220, 206, 178],
  hair: [[128, 88, 46], [206, 166, 100], [246, 222, 160]],
  brow: [150, 106, 60],
  lid: [100, 66, 50],
  white: [238, 234, 224],
  iris: [72, 122, 180],
  irisLow: [104, 152, 200],
  pupil: [26, 34, 50],
  lip: [146, 82, 74],
  lipLow: [206, 134, 118],
  brass: [200, 168, 96],
  stitch: [200, 164, 116],
  lace: [200, 170, 120],
};

// protagonista: loiro, tons sóbrios na roupa (jogo de terror), couro marrom, suéter cinza e camisa escura
const HERO_COLORS = {
  jacket: [92, 62, 44], pants: [56, 52, 50], boot: [58, 42, 32], sole: [34, 30, 28],
  skin: [194, 150, 122], shirt: [40, 40, 44], sweater: [96, 94, 90],
  hair: BASE.hair, brow: [112, 80, 48],
  lid: [58, 40, 34], white: [196, 186, 176], iris: [70, 84, 92], pupil: [20, 18, 18],
  lip: [150, 98, 90], lipLow: [172, 118, 106], brass: [52, 38, 30], lace: [96, 86, 72], stitch: [120, 96, 72],
};

export const HAIR = {
  blond: BASE.hair,
  brown: [[52, 34, 22], [98, 66, 40], [146, 104, 66]],
  dark: [[22, 18, 16], [46, 38, 32], [80, 68, 58]],
  gray: [[92, 90, 88], [148, 146, 142], [198, 196, 190]],
  white: [[150, 148, 144], [204, 202, 198], [240, 238, 232]],
  red: [[104, 42, 22], [166, 78, 38], [212, 126, 70]],
  auburn: [[64, 32, 22], [116, 58, 38], [162, 96, 64]],
};
export const SKIN = {
  fair: [230, 186, 154], rosy: [238, 190, 166], olive: [212, 168, 128],
  tan: [196, 146, 108], brown: [156, 108, 76], dark: [118, 80, 56],
};
export const EYES = {
  blue: [72, 122, 180], green: [84, 128, 90], brown: [96, 62, 38], gray: [112, 122, 132],
};

const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function palette(L) {
  const o = L.colors || {}, C = { ...BASE, ...o };
  if (o.hair && !o.brow) C.brow = mix(C.hair[0], C.hair[1], 0.35);
  if (o.iris && !o.irisLow) C.irisLow = mix(C.iris, C.white, 0.3);
  C.nostril = o.skin ? [o.skin[0] * 0.68, o.skin[1] * 0.54, o.skin[2] * 0.58] : [156, 100, 90];
  C.collarIn = o.collar ? scale(o.collar, 0.84) : scale(C.jacket, 0.8);
  C.collar ??= scale(C.jacket, 0.96);
  C.button ??= [214, 204, 184];
  C.sock ??= [60, 56, 52];
  C.tie ??= [122, 30, 30];
  return C;
}

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// buffer de pixels em ponto flutuante; sub() dá acesso relativo a uma região
class Pix {
  constructor(n) { this.n = n; this.d = new Float32Array(n * n * 3); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    const i = (y * this.n + x) * 3;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  }
  get(x, y) { const i = ((y | 0) * this.n + (x | 0)) * 3; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  mul(x, y, k) { this.set(x, y, scale(this.get(x, y), k)); }
  sub(name) {
    const [ox, oy, w, h] = REG[name], P = this;
    return {
      w, h,
      set: (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) P.set(ox + x, oy + y, c); },
      get: (x, y) => P.get(ox + x, oy + y),
      mul: (x, y, k) => { if (x >= 0 && y >= 0 && x < w && y < h) P.mul(ox + x, oy + y, k); },
      each(fn) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(x, y); },
    };
  }
  toCanvas() {
    const c = makeCanvas(this.n, this.n), g = c.getContext('2d'), img = g.createImageData(this.n, this.n);
    for (let i = 0; i < this.n * this.n; i++) {
      img.data[i * 4] = this.d[i * 3]; img.data[i * 4 + 1] = this.d[i * 3 + 1]; img.data[i * 4 + 2] = this.d[i * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

// variação de brilho de uma foto (média 0, desvio 1), repetida em mosaico
function grain(img, n, crop) {
  const d = shrink(img, n, n, crop).getContext('2d').getImageData(0, 0, n, n).data;
  const L = new Float32Array(n * n);
  let m = 0, dev = 0;
  for (let i = 0; i < n * n; i++) { L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; m += L[i]; }
  m /= n * n;
  for (let i = 0; i < n * n; i++) dev += (L[i] - m) ** 2;
  dev = Math.sqrt(dev / (n * n)) || 1;
  for (let i = 0; i < n * n; i++) L[i] = (L[i] - m) / dev;
  return (x, y) => L[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
}

const fabric = (p, G, base, amp) => p.each((x, y) => p.set(x, y, scale(base, 1 + G(x, y) * amp)));

// tecido canelado (barras e punhos)
function rib(p, y0, y1) {
  for (let x = 0; x < p.w; x++) {
    p.mul(x, y0 - 1, 0.72);
    for (let y = y0; y < y1; y++) p.mul(x, y, x % 2 ? 0.8 : 0.9);
  }
}

// estampas sobre o tecido: xadrez de flanela e listras
const PATTERNS = {
  plaid(p, a) {
    p.each((x, y) => {
      const bx = x % 8 < 3, by = y % 8 < 3;
      if (bx && by) p.set(x, y, mix(p.get(x, y), a, 0.75));
      else if (bx || by) p.set(x, y, mix(p.get(x, y), a, 0.42));
      if (x % 8 === 5 || y % 8 === 5) p.mul(x, y, 1.12);
    });
  },
  stripes(p, a) { p.each((x, y) => { if (y % 6 < 2) p.set(x, y, mix(p.get(x, y), a, 0.8)); }); },
};

// algarismos 3x5 (número da camisa de futebol)
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function number(p, text, cx, y0, color) {
  const w = text.length * 8 - 2;
  [...text].forEach((ch, i) => {
    const bits = DIGITS[+ch] || DIGITS[0];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (bits[r * 3 + c] !== '1') continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = (((cx - (w >> 1) + i * 8 + c * 2 + dx) % p.w) + p.w) % p.w;
        p.set(x, y0 + r * 2 + dy, color);
      }
    }
  });
}

// jaqueta de couro do protagonista com lapelas, suéter cinza em V e camisa escura por dentro
function paintHeroJacket(p, G, C, rnd) {
  const F = 32;
  fabric(p, G, C.jacket, 0.045);
  // brilho do couro: faixas verticais suaves no peito e nas costas
  const band = (x, c, w) => Math.exp(-((x - c) ** 2) / w);
  p.each((x, y) => p.mul(x, y, (1 + 0.08 * (band(x, 24, 16) + band(x, 40, 16)) + 0.05 * (band(x, 8, 20) + band(x, 56, 20))) * (1 - (y / 48) * 0.1)));
  // vincos do couro
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * 64), y = 6 + Math.floor(rnd() * 36), len = 2 + Math.floor(rnd() * 3);
    for (let j = 0; j < len; j++) p.mul(x + j, y + (j >> 1), 0.88);
  }
  for (let y = 0; y < 19; y++) {
    const hw = Math.round((19 - y) * 0.36);
    // abertura entre as lapelas: suéter de tricô
    for (let x = F - hw; x <= F + hw; x++) p.set(x, y, scale(C.sweater, ((x + y) % 2 ? 0.94 : 1) * (0.97 + G(x, y) * 0.03)));
    // decote do suéter com a camisa escura e as pontas da gola
    const sw = Math.round((8 - y) * 0.5);
    if (y < 8) for (let x = F - sw; x <= F + sw; x++) p.set(x, y, scale(C.shirt, Math.abs(x - F) === sw ? 1.35 : 1));
    if (y < 9) { p.mul(F - sw - 1, y, 0.8); p.mul(F + sw + 1, y, 0.8); }
    // lapelas: dobra clara junto à abertura, borda escura por fora
    for (const s of [-1, 1]) {
      p.mul(F + s * (hw + 1), y, 0.62);
      p.mul(F + s * (hw + 2), y, 1.14);
      p.mul(F + s * (hw + 3), y, 1.06);
      if (y < 15) p.mul(F + s * (hw + 6), y, 0.72);
    }
  }
  // entalhe das lapelas
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) p.mul(F + s * (9 + k), 4 + k, 0.62);
  // fechamento: costura no meio e dois botões de couro
  for (let y = 19; y < 45; y++) p.mul(F, y, 0.74);
  for (const y of [22, 31]) { p.set(F, y, C.brass); p.set(F + 1, y, scale(C.brass, 1.3)); p.mul(F, y + 1, 0.8); }
  // bolsos com lapela na altura do quadril
  for (const x0 of [19, 38]) {
    for (let x = x0; x < x0 + 8; x++) { p.mul(x, 34, 0.66); p.mul(x, 35, 1.08); p.mul(x, 37, 0.84); }
    for (let y = 34; y < 38; y++) { p.mul(x0, y, 0.76); p.mul(x0 + 7, y, 0.76); }
  }
  // costuras laterais, meio das costas e bainha dobrada
  for (let y = 0; y < 45; y++) { p.mul(16, y, 0.82); p.mul(48, y, 0.82); p.mul(0, y, 0.86); p.mul(63, y, 0.86); }
  for (let x = 0; x < 64; x++) { p.mul(x, 44, 0.78); p.mul(x, 45, 1.06); p.mul(x, 47, 0.84); }
}

function paintHeroSleeve(P, G, C) {
  const p = P.sub('sleeve');
  fabric(p, G, C.jacket, 0.045);
  p.each((x, y) => p.mul(x, y, 1 + 0.08 * Math.exp(-((x - 14) ** 2) / 14)));     // brilho na frente do braço
  for (let x = 0; x < 32; x++) { p.mul(x, 4, 0.78); p.mul(x, 5, 0.95); }        // costura do ombro
  for (let y = 5; y < 46; y++) p.mul(24, y, 0.82);                               // costura do lado do corpo
  for (const [x, y] of [[1, 21], [2, 22], [30, 22], [31, 23], [0, 25], [1, 26], [29, 26], [30, 25], [3, 24], [28, 24], [2, 28], [30, 28], [4, 26], [27, 27]]) p.mul(x, y, 0.8);
  for (let x = 0; x < 32; x++) { p.mul(x, 44, 0.74); p.mul(x, 45, 1.06); }       // punho dobrado, sem canelado
}

// Pincel macio em 4x: o rosto é pintado com sombras suaves e reduzido para a
// resolução do atlas, o que dá o aspecto de rosto fotográfico dos jogos de PS1.
class Soft {
  constructor(w, h, s = 4) { this.w = w; this.h = h; this.s = s; this.W = w * s; this.H = h * s; this.d = new Float32Array(this.W * this.H * 3); }
  fill(c) { for (let i = 0; i < this.W * this.H; i++) { this.d[i * 3] = c[0]; this.d[i * 3 + 1] = c[1]; this.d[i * 3 + 2] = c[2]; } }
  // mancha elíptica com queda gaussiana: cor (mistura) ou fator k (multiplica)
  _blob(x, y, rx, ry, fn) {
    const s = this.s, X = x * s, Y = y * s, RX = rx * s, RY = ry * s;
    const x0 = Math.max(0, Math.floor(X - RX * 1.6)), x1 = Math.min(this.W - 1, Math.ceil(X + RX * 1.6));
    const y0 = Math.max(0, Math.floor(Y - RY * 1.6)), y1 = Math.min(this.H - 1, Math.ceil(Y + RY * 1.6));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const q = ((i + 0.5 - X) / RX) ** 2 + ((j + 0.5 - Y) / RY) ** 2;
      if (q > 2.6) continue;
      fn((j * this.W + i) * 3, Math.exp(-2.2 * q));
    }
  }
  paint(x, y, rx, ry, c, a = 1) { this._blob(x, y, rx, ry, (o, w) => { const t = w * a; for (let k = 0; k < 3; k++) this.d[o + k] += (c[k] - this.d[o + k]) * t; }); }
  shade(x, y, rx, ry, k) { this._blob(x, y, rx, ry, (o, w) => { const f = 1 + (k - 1) * w; for (let q = 0; q < 3; q++) this.d[o + q] *= f; }); }
  // traço por uma polilinha (pts = [[x, y], ...])
  stroke(pts, width, c, a = 1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        if (Array.isArray(c)) this.paint(x, y, width / 2, width / 2, c, a * 0.35); else this.shade(x, y, width / 2, width / 2, 1 + (c - 1) * 0.35);
      }
    }
  }
  // espelha um traço/mancha do lado esquerdo do rosto (coluna 32 é o meio)
  static mirror(x) { return 64 - x; }
  // média de cada bloco s x s para a região do atlas
  resolve(p) {
    const s = this.s;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = [0, 0, 0];
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const o = ((y * s + j) * this.W + x * s + i) * 3; c[0] += this.d[o]; c[1] += this.d[o + 1]; c[2] += this.d[o + 2]; }
      p.set(x, y, scale(c, 1 / (s * s)));
    }
  }
}

// rosto realista e sério (protagonista): olhos fundos, sobrancelhas retas, maçãs
// marcadas, sulcos do nariz à boca, queixo definido e barba por fazer
function paintHeadReal(P, hairAt, rnd, C) {
  const p = P.sub('head'), F = new Soft(64, 40, 4);
  const R = y => headRow(y) - REG.head[1];
  const M = Soft.mirror;
  const both = fn => { fn(x => x, 1); fn(M, -1); };
  F.fill(C.skin);
  // volumes grandes
  F.shade(32, 11, 9, 3.5, 1.05);                                                 // testa
  both(m => F.shade(m(19), 13, 3.5, 5, 0.86));                                   // têmporas
  both(m => F.shade(m(16.5), 22, 2.8, 10, 0.86));                                // laterais do rosto
  both(m => F.paint(m(22.5), 23.5, 3, 2, [214, 150, 130], 0.12));                // um pouco de cor nas maçãs
  // olhos
  both(m => F.shade(m(26), 14.2, 3.2, 1, 1.05));                                 // arco da sobrancelha
  F.shade(32, 15.5, 1.2, 1.4, 1.03);
  both(m => F.shade(m(26.3), 18.6, 3.8, 2.4, 0.64));                             // órbita funda
  both(m => F.shade(m(29.3), 18.8, 1, 1.2, 0.86));                               // canto interno
  both(m => F.stroke([[m(23.4), 17.5], [m(26), 17.1], [m(28.8), 17.6]], 0.6, 0.78)); // dobra da pálpebra
  both(m => F.paint(m(26.1), 19.1, 2.1, 0.7, C.white, 0.6));
  both(m => F.paint(m(26.3), 19.05, 0.9, 0.85, C.iris, 1));
  both(m => F.paint(m(26.3), 19.05, 0.4, 0.4, C.pupil, 1));
  both(m => F.stroke([[m(23.6), 18.75], [m(26.1), 18.25], [m(28.7), 18.75]], 0.8, C.lid, 1)); // pálpebra de cima
  both(m => F.stroke([[m(24), 19.8], [m(26.2), 20.05], [m(28.4), 19.75]], 0.4, 0.88));      // pálpebra de baixo
  both(m => F.paint(m(23.6), 18.9, 0.5, 0.4, C.lid, 0.8));
  both(m => F.shade(m(26.2), 21, 2.4, 0.8, 0.9));                                // olheira
  // sobrancelhas retas e baixas (expressão séria)
  both(m => F.stroke([[m(22.7), 15.8], [m(25.5), 15.1], [m(28.9), 15.5]], 1.7, C.brow, 1));
  both(m => F.shade(m(26), 16.4, 3, 0.6, 0.9));                                  // sombra logo abaixo da sobrancelha
  // maçãs e bochecha cavada
  both(m => F.shade(m(21.8), 21.2, 2.6, 1.4, 1.05));
  both(m => F.shade(m(21.5), 25.8, 2.6, 2.8, 0.78));
  // nariz
  F.stroke([[32, 16.5], [32, 23.4]], 0.9, 1.07);
  F.stroke([[30.6, 18.5], [30.3, 23.8]], 1.2, 0.74);
  F.stroke([[33.4, 18.5], [33.7, 23.8]], 1.2, 0.8);
  F.shade(32, 24, 1.1, 0.9, 1.06);
  F.paint(32, 24, 1.2, 1, [214, 150, 130], 0.12);
  both(m => F.shade(m(30.4), 24.9, 0.9, 0.7, 0.82));
  both(m => F.shade(m(31), 25.3, 0.55, 0.35, 0.5));                              // narinas
  F.shade(32, 25.9, 1.8, 0.45, 0.82);
  // boca: lábios finos, cantos um pouco para baixo
  F.shade(32, 27.6, 0.6, 1.1, 0.93);
  both(m => F.shade(m(31.2), 27.6, 0.4, 1, 1.03));
  both(m => F.stroke([[m(30.1), 25.6], [m(29.2), 27.8], [m(28.8), 30]], 0.7, 0.82)); // sulco nasolabial
  F.paint(32, 30.25, 2.6, 0.55, C.lip, 0.45);
  F.stroke([[29, 31.3], [32, 30.9], [35, 31.3]], 0.6, [62, 38, 34], 1);
  F.paint(32, 31.75, 2.2, 0.55, C.lipLow, 0.35);
  F.shade(32, 31.7, 1.2, 0.3, 1.05);
  F.shade(32, 32.7, 2, 0.5, 0.86);
  // queixo e mandíbula
  F.shade(32, 34.6, 2.6, 1.5, 1.05);
  both(m => F.shade(m(21), 34, 2.5, 4, 0.8));
  F.shade(32, 39.5, 16, 2.6, 0.72);
  F.resolve(p);
  // poros e barba por fazer (no tamanho final, texel a texel)
  p.each((x, y) => {
    p.mul(x, y, 0.985 + rnd() * 0.03);
    const dx = Math.abs(x - 32);
    // queixo e mandíbula (abaixo de uma linha que sobe para as orelhas) e buço; lábios de fora
    const jaw = smoothstep(31.5 - dx * 0.35, 33.5 - dx * 0.35, y) * (1 - smoothstep(10, 13, dx));
    const lip = (1 - smoothstep(2.5, 4, dx)) * Math.max(0, 1 - Math.abs(y - 28.5) / 1.5);
    const w = Math.max(jaw, lip * 0.8) * (y >= 30 && y <= 32 && dx <= 3 ? 0 : 1);
    if (w > 0) p.set(x, y, mix(p.get(x, y), C.hair[0], w * (0.04 + rnd() * 0.08)));
  });
  // cabelo acima da linha, com transição de um texel; costeletas curtas
  for (let x = 0; x < 64; x++) {
    const f = headF(x + 0.5);
    let edge = Math.round(R(hairline(f)));
    if (x === 11 || x === 12 || x === 51 || x === 52) edge = Math.round(R(0.132));
    for (let y = 0; y < edge; y++) p.set(x, y, hairAt(x, y));
    p.set(x, edge, mix(p.get(x, edge), hairAt(x, edge), 0.45));
  }
}

// tronco dos moradores: o tipo de roupa vem do look.top
function paintTop(P, G, C, L) {
  const p = P.sub('jacket'), top = L.top || 'jacket', F = 32;
  fabric(p, G, C.jacket, top === 'sweater' ? 0.05 : 0.07);
  if (L.pattern) PATTERNS[L.pattern](p, L.accent);
  p.each((x, y) => p.mul(x, y, 1 - (y / 48) * 0.08));
  if (top === 'jacket') {
    for (let y = 0; y < 8; y++) {
      const hw = Math.round((8 - y) * 0.6);
      for (let x = F - hw; x <= F + hw; x++) p.set(x, y, scale(C.shirt, 0.96 + G(x, y) * 0.03));
      p.mul(F - 1 - hw, y, 0.7); p.mul(F + 1 + hw, y, 0.7);
    }
    for (let y = 8; y < 44; y++) { p.set(F, y, y % 2 ? scale(C.jacket, 0.5) : [152, 140, 118]); p.mul(F - 1, y, 0.86); p.mul(F + 1, y, 0.86); }
    for (let i = 0; i < 6; i++) { p.mul(19 + i, 38 - (i >> 1), 0.62); p.mul(45 - i, 38 - (i >> 1), 0.62); }
    rib(p, 44, 48);
  } else if (top === 'sweater') {
    p.each((x, y) => { if (x % 2) p.mul(x, y, 0.95); });
    // faixa de tricô com zigue-zague (suéter de lã da vó)
    if (L.band) for (let y = 17; y < 23; y++) for (let x = 0; x < 64; x++) {
      if (y === 17 || y === 22) p.set(x, y, scale(L.band, 0.8));
      else if ((x + Math.abs(y - 19.5) * 2) % 6 < 3) p.set(x, y, L.band);
    }
    for (let x = 0; x < 64; x++) for (let y = 0; y < 2; y++) p.mul(x, y, x % 2 ? 0.78 : 0.88);
    rib(p, 44, 48);
  } else if (top === 'shirt' || top === 'polo') {
    const polo = top === 'polo', end = polo ? 10 : 46;
    for (let y = 3; y < end; y++) { p.mul(F - 1, y, 0.84); p.mul(F + 1, y, 0.9); }
    for (let y = polo ? 5 : 7; y < end; y += polo ? 4 : 7) p.set(F, y, C.button);
    for (let y = 0; y < 4; y++) for (let x = F - (3 - y); x <= F + (3 - y); x++) p.set(x, y, polo ? scale(C.skin, 0.9) : C.shirt);
    if (polo) {
      // logotipo bordado no peito
      for (let y = 15; y < 19; y++) for (let x = 37; x < 42; x++) p.set(x, y, (x + y) % 3 ? C.collar : scale(C.collar, 0.7));
    } else {
      for (let y = 15; y < 21; y++) { p.mul(36, y, 0.78); p.mul(41, y, 0.78); }
      for (let x = 36; x <= 41; x++) { p.mul(x, 15, 0.8); p.mul(x, 20, 0.78); }
    }
    for (let x = 0; x < 64; x++) p.mul(x, 45, 0.8);
    for (let y = 0; y < 44; y++) { p.mul(16, y, 0.88); p.mul(48, y, 0.88); }
  } else if (top === 'cassock') {
    for (let y = 2; y < 48; y += 3) p.set(F, y, C.button);
    for (let y = 0; y < 48; y++) p.mul(F + 1, y, 0.8);
  } else if (top === 'suit') {
    // lapelas em V sobre a camisa, gravata e dois botões
    for (let y = 0; y < 22; y++) {
      const hw = Math.round((22 - y) * 0.32);
      for (let x = F - hw; x <= F + hw; x++) p.set(x, y, C.shirt);
      p.mul(F - hw - 1, y, 0.68); p.mul(F + hw + 1, y, 0.68);
    }
    for (let y = 1; y < 24; y++) {
      p.set(F, y, C.tie);
      if (y > 3) { p.set(F - 1, y, scale(C.tie, 0.85)); p.set(F + 1, y, scale(C.tie, 0.85)); }
    }
    p.set(F, 0, scale(C.tie, 0.8));
    for (let y = 22; y < 47; y++) p.mul(F + 1, y, 0.8);
    for (const y of [28, 36]) p.set(F, y, C.button);
    for (let x = 0; x < 7; x++) { p.mul(19 + x, 36, 0.7); p.mul(39 + x, 36, 0.7); }
    for (let x = 38; x < 43; x++) p.mul(x, 15, 0.75);
    for (let y = 0; y < 47; y++) { p.mul(16, y, 0.86); p.mul(48, y, 0.86); }
  } else if (top === 'overall') {
    // camisa (às vezes xadrez) com peitilho, alças e costas da jardineira na cor da calça
    const bib = (x, y) => p.set(x, y, scale(C.pants, 0.96 + G(x, y) * 0.06));
    for (let y = 13; y < 48; y++) for (let x = 23; x <= 41; x++) bib(x, y);
    for (let y = 0; y < 13; y++) for (const x of [24, 25, 39, 40]) bib(x, y);
    for (let y = 0; y < 30; y++) { const o = Math.round(y * 0.28); for (const x of [9 - o, 10 - o, 54 + o, 55 + o]) bib((x + 64) % 64, y); }
    for (let y = 30; y < 48; y++) for (let x = 0; x < 64; x++) if (x < 15 || x > 49) bib(x, y);
    for (let y = 13; y < 48; y++) { p.mul(23, y, 0.8); p.mul(41, y, 0.8); }
    for (let x = 23; x <= 41; x++) p.mul(x, 13, 0.8);
    for (let y = 20; y < 27; y++) { p.mul(28, y, 0.8); p.mul(36, y, 0.8); }
    for (let x = 28; x <= 36; x++) p.mul(x, 20, 0.75);
    p.set(24, 14, C.brass); p.set(40, 14, C.brass);
  } else if (top === 'dress') {
    for (let y = 0; y < 4; y++) for (let x = F - 6 + y; x <= F + 6 - y; x++) p.set(x, y, scale(C.skin, 0.92));
    for (let x = 0; x < 64; x++) { p.mul(x, 40, 0.75); p.mul(x, 41, 0.86); }
    if (C.apron) {
      const ap = (x, y) => p.set(x, y, scale(C.apron, 0.97 + G(x, y) * 0.03));
      for (let y = 14; y < 48; y++) for (let x = 24; x <= 40; x++) ap(x, y);
      for (let y = 3; y < 14; y++) { ap(25, y); ap(39, y); }
      for (let x = 0; x < 64; x++) if (x < 24 || x > 40) p.set(x, 40, scale(C.apron, 0.88));
      for (let y = 14; y < 48; y++) { p.mul(24, y, 0.86); p.mul(40, y, 0.86); }
      for (let x = 24; x <= 40; x++) p.mul(x, 14, 0.86);
    }
  } else if (top === 'jersey') {
    for (let y = 0; y < 7; y++) {
      const hw = Math.round((7 - y) * 0.7);
      for (let x = F - hw; x <= F + hw; x++) p.set(x, y, scale(C.skin, 0.92));
      p.set(F - hw - 1, y, C.collar); p.set(F + hw + 1, y, C.collar);
    }
    for (let y = 0; y < 48; y++) for (const x of [15, 16, 48, 49]) p.set(x, y, C.collar);
    if (L.number) number(p, L.number, 0, 12, C.collar);
  }
}

function paintSleeve(P, G, C, L) {
  const p = P.sub('sleeve'), top = L.top || 'jacket';
  fabric(p, G, C.jacket, 0.07);
  if (L.pattern) PATTERNS[L.pattern](p, L.accent);
  for (let x = 0; x < 32; x++) { p.mul(x, 4, 0.78); p.mul(x, 5, 0.94); }   // costura do ombro
  for (let y = 5; y < 42; y++) p.mul(24, y, 0.82);                         // costura do lado do corpo
  if (L.short) {
    // manga curta: barra acima do cotovelo, braço de fora
    for (let y = 16; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, scale(C.skin, (y < 18 ? 0.86 : 0.97) + ((x * 7 + y * 3) % 5) * 0.008));
    for (let x = 0; x < 32; x++) { p.mul(x, 14, 0.8); p.mul(x, 15, 0.9); }
    return;
  }
  if (top === 'jacket') {
    // rugas do cotovelo (parte de trás do braço = bordas da região)
    for (const [x, y] of [[1, 21], [2, 22], [30, 22], [31, 23], [0, 25], [1, 26], [29, 26], [30, 25], [3, 24], [28, 24], [2, 28], [30, 28]]) p.mul(x, y, 0.76);
    rib(p, 43, 48);
  } else if (top === 'sweater') {
    p.each((x, y) => { if (x % 2) p.mul(x, y, 0.95); });
    rib(p, 43, 48);
  } else {
    // punho liso (camisa com botão)
    for (let x = 0; x < 32; x++) { p.mul(x, 42, 0.8); for (let y = 43; y < 48; y++) p.mul(x, y, 0.94); }
    if (top === 'shirt' || top === 'overall') p.set(8, 45, C.button);
  }
}

function paintPants(P, G, C, L, rnd) {
  const p = P.sub('pants'), b = L.bottom || 'pants';
  if (b === 'stockings') {
    // meia grossa por baixo da saia
    p.each((x, y) => p.set(x, y, scale(C.pants, 0.97 + G(x, y) * 0.03 + (x === 16 ? 0.04 : 0))));
    return;
  }
  fabric(p, G, C.pants, 0.08);
  // costura externa (col. 8), interna (24) e vinco da frente (16)
  for (let y = 0; y < 64; y++) { p.mul(8, y, 0.78); p.mul(24, y, 0.8); if (y > 2 && y < 60) p.mul(16, y, 1.1); }
  for (let i = 0; i < 6; i++) p.mul(10 + (i >> 1), i, 0.7);  // abertura do bolso
  for (let i = 0; i < 14; i++) p.mul(Math.floor(rnd() * 32), 29 + Math.floor(rnd() * 7), 0.82); // rugas do joelho
  for (let x = 0; x < 32; x++) { p.mul(x, 60, 0.78); p.mul(x, 61, 0.9); p.mul(x, 62, 0.86); p.mul(x, 63, 0.86); }
  if (b === 'shorts') {
    // calção, joelho de fora e meião
    for (let y = 19; y < 64; y++) for (let x = 0; x < 32; x++) {
      p.set(x, y, y < 41 ? scale(C.skin, 0.96 + rnd() * 0.03) : scale(C.sock, 0.95 + rnd() * 0.06));
    }
    for (let x = 0; x < 32; x++) {
      p.mul(x, 18, 0.75); p.mul(x, 41, 0.85);
      p.set(x, 45, C.collar); p.set(x, 46, C.collar);
    }
    for (let y = 30; y < 34; y++) for (let x = 12; x < 21; x++) p.mul(x, y, 0.94);
  }
}

function paintPelvis(P, G, C, L) {
  const p = P.sub('pelvis');
  fabric(p, G, C.pants, 0.08);
  if (L.bottom === 'stockings') return;
  for (let y = 2; y < 14; y++) p.mul(32, y, 0.72);                       // braguilha
  for (let y = 2; y < 10; y++) p.mul(34, y, 0.86);
  for (let y = 0; y < 16; y++) { p.mul(0, y, 0.8); p.mul(63, y, 0.8); p.mul(16, y, 0.82); p.mul(48, y, 0.82); }
  for (let y = 11; y < 16; y++) for (let x = 0; x < 64; x++) p.mul(x, y, 0.9);
}

function paintHead(P, hairAt, rnd, C, L) {
  const p = P.sub('head');
  const R = y => headRow(y) - REG.head[1];
  p.each((x, y) => p.set(x, y, scale(C.skin, 0.985 + rnd() * 0.03)));
  for (let y = 36; y < 40; y++) for (let x = 0; x < 64; x++) p.mul(x, y, 0.86);  // sob a mandíbula
  // cabelo acima da linha, com borda irregular; costeletas na frente das orelhas
  for (let x = 0; x < 64; x++) {
    const f = headF(x + 0.5);
    let edge = Math.round(R(hairline(f))) + (rnd() < 0.4 ? 1 : 0);
    if (x === 11 || x === 12 || x === 51 || x === 52) edge = Math.round(R(0.128));
    // cabelo comprido: desce pela nuca e pelos lados até o pescoço, emoldurando o rosto
    if (L.longHair) { const a = Math.abs(f - 0.5); if (a > 0.2) edge = 40; else if (a > 0.135) edge = Math.max(edge, Math.round(R(0.08))); }
    for (let y = 0; y < edge; y++) p.set(x, y, hairAt(x, y));
    p.mul(x, edge, 0.93);
  }
  // sobrancelhas (loiras, um pouco mais escuras que o cabelo)
  for (const [cx, out] of [[26, -1], [38, 1]]) {
    for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 15, C.brow);
    p.set(cx + out * 3, 16, scale(C.brow, 1.05));
    p.mul(cx - out * 2, 14, 0.96);
  }
  // olhos: pálpebra, branco, íris e pupila
  for (const cx of [26, 38]) {
    for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 18, C.lid);
    p.set(cx - 2, 19, C.white); p.set(cx - 1, 19, C.iris); p.set(cx, 19, C.pupil); p.set(cx + 1, 19, C.iris); p.set(cx + 2, 19, C.white);
    p.mul(cx - 2, 20, 0.92); p.set(cx - 1, 20, scale(C.white, 0.94)); p.set(cx, 20, C.irisLow); p.set(cx + 1, 20, scale(C.white, 0.94)); p.mul(cx + 2, 20, 0.92);
    p.mul(cx - 3, 18, 0.9); p.mul(cx + 3, 18, 0.9);
    for (let x = cx - 2; x <= cx + 2; x++) p.mul(x, 17, 0.94);
  }
  p.set(23, 18, scale(C.lid, 1.2)); p.set(41, 18, scale(C.lid, 1.2));
  if (L.female) {
    // cílios: pálpebra mais escura com a ponta virada para fora
    for (const [cx, out] of [[26, -1], [38, 1]]) {
      for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 18, [54, 34, 30]);
      p.set(cx + out * 3, 17, [54, 34, 30]);
    }
  }
  // nariz: luz no dorso, sombra lateral, narinas
  for (let y = 18; y < 25; y++) p.mul(32, y, 1.04);
  for (let y = 21; y < 25; y++) p.mul(30, y, 0.93);
  p.set(30, 25, C.nostril); p.set(34, 25, C.nostril);
  for (let x = 31; x <= 33; x++) p.mul(x, 26, 0.9);
  // boca
  for (let x = 30; x <= 34; x++) p.mul(x, 30, 0.93);
  for (let x = 29; x <= 35; x++) p.set(x, 31, C.lip);
  p.mul(29, 31, 0.85); p.mul(35, 31, 0.85);
  for (let x = 30; x <= 34; x++) p.set(x, 32, C.lipLow);
  for (let x = 30; x <= 34; x++) p.mul(x, 34, 0.93);
  // laterais do rosto e ângulo da mandíbula um pouco mais escuros
  for (let y = 10; y < 36; y++) for (const x of [16, 17, 18, 46, 47, 48]) p.mul(x, y, 0.96);
  for (let y = 32; y < 36; y++) for (const x of [19, 20, 21, 43, 44, 45]) p.mul(x, y, 0.92);
  // bochechas levemente rosadas
  for (const x0 of [22, 40]) for (let y = 23; y < 25; y++) for (let x = x0; x < x0 + 3; x++) p.set(x, y, mix(p.get(x, y), [240, 168, 146], 0.3));
  if (L.old) {
    // rugas na testa, pés de galinha e bigode chinês
    for (let x = 27; x <= 37; x++) { if (x % 2) p.mul(x, 11, 0.92); else p.mul(x, 13, 0.93); }
    for (const x of [22, 42]) { p.mul(x, 19, 0.88); p.mul(x, 20, 0.9); }
    for (let y = 26; y < 30; y++) { p.mul(28, y, 0.9); p.mul(36, y, 0.9); }
  }
  if (L.beard) {
    // barba cheia cobre queixo e mandíbula; bigode logo acima do lábio
    const beardAt = (x, y) => scale(hairAt(x, y + 20), 0.92);
    if (L.beard === 'full') {
      for (let x = 0; x < 64; x++) {
        const a = Math.abs(headF(x + 0.5) - 0.5);
        if (a > 0.24) continue;
        const top = a > 0.17 ? 22 : a > 0.08 ? 27 : 33;
        for (let y = top; y < 40; y++) if (!(y < 33 && Math.abs(x - 32) <= 3)) p.set(x, y, beardAt(x, y));
      }
    }
    for (let x = 28; x <= 36; x++) { p.set(x, 29, beardAt(x, 29)); p.set(x, 30, beardAt(x, 30)); }
    p.set(28, 31, beardAt(28, 31)); p.set(36, 31, beardAt(36, 31));
  }
  if (L.glasses) {
    // armação em volta dos olhos, ponte e hastes
    const fr = Array.isArray(L.glasses) ? L.glasses : [44, 34, 30];
    for (const cx of [26, 38]) {
      for (let x = cx - 3; x <= cx + 3; x++) { p.set(x, 16, fr); p.set(x, 21, fr); }
      for (let y = 16; y <= 21; y++) { p.set(cx - 3, y, fr); p.set(cx + 3, y, fr); }
    }
    for (let x = 30; x <= 34; x++) p.set(x, 17, fr);
    for (let x = 18; x < 23; x++) p.set(x, 17, fr);
    for (let x = 42; x < 47; x++) p.set(x, 17, fr);
  }
}

function paintLocks(P, hairAt) {
  const p = P.sub('lock');
  p.each((x, y) => p.set(x, y, scale(hairAt(x * 2 + 1, y), y < 4 ? 0.82 : y > 24 ? 1.08 : 1)));
}

function paintBoots(P, rnd, C) {
  const p = P.sub('boot');
  p.each((x, y) => p.set(x, y, scale(C.boot, 0.94 + rnd() * 0.1)));
  for (let i = 0; i < 18; i++) p.mul(Math.floor(rnd() * 32), Math.floor(rnd() * 32), 0.86);
  // cano: borda, cadarço cruzado e ilhoses (frente = coluna 16)
  for (let x = 0; x < 32; x++) { p.mul(x, 0, 0.68); p.mul(x, 7, 0.85); }
  for (let y = 1; y < 8; y++) { p.set(15 + (y % 2), y, C.lace); p.set(17 - (y % 2), y, C.lace); }
  for (const y of [2, 4, 6]) { p.set(13, y, [44, 40, 38]); p.set(19, y, [44, 40, 38]); }
  // pé: solado (colunas 8–19) com costura, biqueira e vinco do peito do pé
  for (let y = 8; y < 32; y++) {
    for (let x = 8; x < 20; x++) p.set(x, y, scale(C.sole, 0.92 + rnd() * 0.12));
    if (y % 2) { p.set(8, y, C.stitch); p.set(19, y, C.stitch); }
  }
  for (let x = 0; x < 32; x++) if (x < 8 || x >= 20) { p.mul(x, 25, 0.74); p.mul(x, 18, 0.88); }
  for (let y = 26; y < 32; y++) for (let x = 0; x < 32; x++) if (x < 8 || x >= 20) p.mul(x, y, 1.06);
}

// sapato baixo, tênis ou chuteira: o cano vira meia
function paintShoes(P, rnd, C, L) {
  const p = P.sub('boot'), kind = L.feet;
  p.each((x, y) => p.set(x, y, scale(C.boot, 0.95 + rnd() * 0.06)));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) p.set(x, y, scale(L.bottom === 'stockings' ? C.pants : C.sock, 0.95 + rnd() * 0.05));
  for (let x = 0; x < 32; x++) { p.mul(x, 8, 0.6); p.mul(x, 9, 0.8); }
  const sole = kind === 'sneaker' ? [226, 222, 214] : C.sole;
  for (let y = 9; y < 32; y++) for (let x = 8; x < 20; x++) p.set(x, y, scale(sole, 0.92 + rnd() * 0.1));
  if (kind === 'sneaker' || kind === 'cleat') {
    // três listras nas laterais
    const st = kind === 'cleat' ? [236, 236, 230] : C.collar;
    for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) { p.set(2 + k * 2 + (i >> 1), 13 + i, st); p.set(29 - k * 2 - (i >> 1), 13 + i, st); }
  }
  for (let x = 0; x < 32; x++) if (x < 8 || x >= 20) p.mul(x, 25, 0.8);
}

function paintSkinParts(P, rnd, C) {
  const skinFill = p => p.each((x, y) => p.set(x, y, scale(C.skin, 0.98 + rnd() * 0.03)));
  // mãos: dedos (linhas no dorso e na palma), nós dos dedos e vinco da palma
  const h = P.sub('hand');
  skinFill(h);
  for (let y = 12; y < 23; y++) for (const x of [2, 5, 7, 16, 19, 21]) h.mul(x, y, 0.82);
  for (let x = 0; x < 11; x++) h.mul(x, 11, 0.9);
  for (let x = 15; x < 21; x++) h.mul(x, 8, 0.88);
  skinFill(P.sub('thumb'));
  const s = P.sub('skin');
  skinFill(s);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) s.mul(x, y, 0.88 + y * 0.03);
  // orelha: concha mais escura
  const e = P.sub('ear');
  skinFill(e);
  e.each((x, y) => { const d = Math.hypot(x - 8, y - 8); if (d < 3.2) e.mul(x, y, 0.8); else if (d < 5) e.mul(x, y, 1.04); });
}

let grains = null;

// look = {} pinta o protagonista; os moradores passam roupa, cores e detalhes (ver npcData.js)
export function makeHeroTexture(look = {}) {
  // sem look.top é o protagonista: paleta, jaqueta e rosto realista próprios
  const hero = !look.top;
  const C = palette(hero ? { ...look, colors: { ...HERO_COLORS, ...look.colors } } : look);
  const P = new Pix(ATLAS), rnd = rng(look.seed ?? 1971);
  grains ||= {
    jacket: grain(IMG[HERO_FILES.jacket], 32),
    pants: grain(IMG[HERO_FILES.pants], 32),
    shirt: grain(IMG[HERO_FILES.shirt], 16),
    hair: grain(IMG[HERO_FILES.hair], 32, [236, 96, 128, 128]),
  };
  const gJacket = grains.jacket, gPants = grains.pants, gHair = grains.hair;
  // fios de cabelo: brilho por coluna + grão da foto, na paleta do cabelo
  const strand = Array.from({ length: 64 }, () => rnd() * 2 - 1);
  const hairAt = (x, y) => {
    const t = Math.max(0, Math.min(1, 0.5 + strand[x % 64] * 0.22 + gHair(x, y) * 0.16));
    return t < 0.5 ? mix(C.hair[0], C.hair[1], t * 2) : mix(C.hair[1], C.hair[2], (t - 0.5) * 2);
  };

  if (hero) { paintHeroJacket(P.sub('jacket'), gJacket, C, rnd); paintHeroSleeve(P, gJacket, C); }
  else { paintTop(P, gJacket, C, look); paintSleeve(P, gJacket, C, look); }
  paintPants(P, gPants, C, look, rnd);
  paintPelvis(P, gPants, C, look);
  if (hero) paintHeadReal(P, hairAt, rnd, C);
  else paintHead(P, hairAt, rnd, C, look);
  paintLocks(P, hairAt);
  if (look.feet && look.feet !== 'boot') paintShoes(P, rnd, C, look);
  else paintBoots(P, rnd, C);
  paintSkinParts(P, rnd, C);
  const col = P.sub('collar');
  fabric(col, gJacket, C.collar, 0.07);
  for (let x = 0; x < 32; x++) { if (x % 2) col.mul(x, 6, 1.15); col.mul(x, 7, 0.8); }
  fabric(P.sub('collarIn'), gJacket, C.collarIn, 0.06);
  const sh = P.sub('shirt');
  fabric(sh, grains.shirt, C.shirt, 0.05);
  // batina: colarinho clerical (só a plaquinha branca na frente)
  if (look.top === 'cassock') sh.each((x, y) => sh.set(x, y, Math.abs(x - 16) <= 2 && y < 6 ? [236, 234, 226] : scale(C.jacket, 0.9)));

  return canvasTex(processPixels(P.toCanvas()), false);
}
