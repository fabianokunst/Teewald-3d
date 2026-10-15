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
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

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
  // k = pixels do atlas por unidade de REG (2 no protagonista, que é pintado em 256)
  sub(name, k = 1) {
    const [ox, oy, w, h] = REG[name].map(v => v * k), P = this;
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

// ---------- protagonista: atlas em 256 (o dobro de pixels em cada região) ----------
// Coordenadas dos pintores abaixo em pixels de 256. Couro com brilho, vincos e costuras
// pespontadas; suéter de tricô; cabelo penteado para trás fio a fio; rosto em supersample.
const HDK = 2;

// ruído de valor suave (manchas e vincos do couro)
function valueNoise(rnd, n = 32) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = rnd();
  const at = (x, y) => g[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// linha reta pixel a pixel (fn recebe x, y e a posição 0..1 ao longo dela)
function line(x0, y0, x1, y1, fn) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) fn(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), i / n);
}
// pesponto: tracinhos claros (linha de costura) ao longo de uma linha
const stitch = (p, x0, y0, x1, y1, k = 1.2, on = 2, off = 2) => {
  let i = 0;
  line(x0, y0, x1, y1, (x, y) => { if (i++ % (on + off) < on) p.mul(x, y, k); });
};
// costura: vinco escuro com uma beira clara ao lado (dx, dy)
const seam = (p, x0, y0, x1, y1, dx, dy, dark = 0.72, light = 1.1) =>
  line(x0, y0, x1, y1, (x, y) => { p.mul(x, y, dark); p.mul(x + dx, y + dy, light); });

// jaqueta de couro com lapelas largas, suéter cinza em V e camisa escura (região 128 x 96)
function paintHeroJacketHD(p, G, C, rnd, N) {
  const W = p.w, H = p.h, F = W / 2;
  fabric(p, G, C.jacket, 0.035);
  // couro: manchas largas, brilho no peito e nas omoplatas, sombra sob os braços e embaixo
  const band = (x, c, w) => Math.exp(-((x - c) ** 2) / w);
  p.each((x, y) => {
    const n = N(x / 7, y / 7) - 0.5, n2 = N(x / 2.5 + 40, y / 2.5) - 0.5;
    const sheen = 0.12 * (band(x, 44, 90) + band(x, 84, 90)) * Math.exp(-((y - 30) ** 2) / 700)
      + 0.08 * (band(x, 12, 110) + band(x, 116, 110)) * Math.exp(-((y - 24) ** 2) / 500);
    const pit = 0.12 * (band(x, 32, 30) + band(x, 96, 30)) * Math.exp(-((y - 12) ** 2) / 260);
    p.mul(x, y, (1 + n * 0.12 + n2 * 0.04 + sheen - pit) * (1 - (y / H) * 0.14));
  });
  // vincos: na cintura (horizontais, dos lados para a frente) e saindo das axilas
  const crease = (x0, y0, x1, y1) => { line(x0, y0, x1, y1, (x, y, t) => { const k = Math.sin(t * Math.PI); p.mul(x, y, 1 - 0.16 * k); p.mul(x, y - 1, 1 + 0.1 * k); }); };
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) { const y = 58 + i * 5 + Math.floor(rnd() * 3); crease(F + s * (34 + rnd() * 6), y, F + s * (14 + rnd() * 6), y + 1 + Math.floor(rnd() * 2)); }
    for (let i = 0; i < 3; i++) { const y = 18 + i * 6; crease(F + s * 30, y, F + s * (20 - i * 2), y + 7); }
  }
  for (let i = 0; i < 40; i++) {   // marcas de uso
    const x = Math.floor(rnd() * W), y = 8 + Math.floor(rnd() * 80);
    p.mul(x, y, 1.12); p.mul(x + 1, y, 1.06);
  }
  // abertura em V: suéter de tricô (canelado) com o decote em V da camisa escura
  const hw = y => (40 - y) * 0.36;           // meia largura da abertura entre as lapelas
  const lw = y => 12 * (1 - y / 44) + 2;     // largura da lapela
  for (let y = 0; y < 40; y++) {
    const h = hw(y);
    for (let x = Math.ceil(F - h); x <= Math.floor(F + h); x++) {
      const rib = (x + 1) % 3 === 0 ? 0.86 : (x % 3 === 0 ? 1.04 : 0.97);
      p.set(x, y, scale(C.sweater, rib * (0.95 + G(x, y) * 0.04) * (1 - 0.18 * Math.exp(-((Math.abs(x - F) - h) ** 2) / 6))));
    }
    // decote em V do suéter (barra canelada mais clara) e a camisa por dentro
    const sw = (18 - y) * 0.55;
    if (y < 19) {
      for (let x = Math.ceil(F - sw - 3); x <= Math.floor(F + sw + 3); x++) {
        const d = Math.abs(x - F) - sw;
        if (d < 0) p.set(x, y, scale(C.shirt, 0.9 + 0.25 * Math.exp(-(d * d) / 2)));
        else if (d < 3) p.set(x, y, scale(C.sweater, d < 1 ? 0.78 : (x + y) % 2 ? 1.12 : 1.04));
      }
    }
    // lapelas: dobra clara na beira de dentro, sombra na beira de fora e pesponto
    for (const s of [-1, 1]) {
      const x0 = F + s * h, L = lw(y);
      for (let d = 0; d <= L + 2; d++) {
        const x = Math.round(x0 + s * (d + 0.5));
        if (d < 1) p.mul(x, y, 0.55);                       // fresta entre a lapela e o suéter
        else if (d < 3) p.mul(x, y, 1.22);                  // dobra da lapela pegando luz
        else if (d < L) p.mul(x, y, 1.08 - 0.06 * (d / L)); // face da lapela
        else if (d < L + 1) p.mul(x, y, 0.62);              // borda
        else p.mul(x, y, 0.84);                             // sombra da lapela na jaqueta
      }
      if (y % 4 < 2 && y < 38) p.mul(Math.round(x0 + s * (L - 1.5)), y, 1.25);   // pesponto da beira
    }
  }
  // entalhe entre a gola e a lapela
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { p.mul(F + s * (16 + k), 8 + k, 0.5); p.mul(F + s * (16 + k), 9 + k, 0.75); }
  // fechamento: costura no meio, pesponto e três botões de chifre
  for (let y = 40; y < 88; y++) { p.mul(F, y, 0.62); p.mul(F + 1, y, 1.08); if (y % 4 < 2) p.mul(F - 3, y, 1.18); }
  for (const y of [46, 60, 74]) {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) p.set(F - 1 + i, y + j, scale(C.brass, 1 - 0.12 * (i + j) / 2));
    p.set(F - 2, y - 1, scale(C.brass, 1.7)); p.mul(F, y + 3, 0.7); p.mul(F - 1, y + 3, 0.7);
  }
  // bolsos com aba na altura do quadril
  for (const s of [-1, 1]) {
    const xa = F + s * 12, xb = F + s * 30, y0 = 66;
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
      p.mul(x, y0, 0.6); p.mul(x, y0 + 1, 1.15);
      for (let y = y0 + 2; y < y0 + 8; y++) p.mul(x, y, 1.04);
      p.mul(x, y0 + 8, 0.66); p.mul(x, y0 + 9, 0.82);
      if (x % 4 < 2) p.mul(x, y0 + 6, 1.18);
    }
    for (let y = y0; y < y0 + 9; y++) { p.mul(xa, y, 0.72); p.mul(xb, y, 0.72); }
  }
  // costuras laterais (com pesponto), meio das costas e pala nas costas
  for (const x of [32, 96]) { seam(p, x, 6, x, 86, 1, 0); stitch(p, x + 3, 6, x + 3, 86); }
  for (let y = 0; y < 86; y++) { p.mul(0, y, 0.74); p.mul(W - 1, y, 0.74); p.mul(1, y, 1.06); }
  for (let x = 0; x < W; x++) {
    const dx = Math.min(Math.abs(x - 0), Math.abs(x - W));
    if (dx > 30) continue;
    const y = Math.round(20 + dx * dx * 0.006);
    p.mul(x, y, 0.72); p.mul(x, y + 1, 1.1);
    if (x % 4 < 2) p.mul(x, y + 3, 1.18);
  }
  // barra dobrada com pesponto
  for (let x = 0; x < W; x++) {
    p.mul(x, 86, 0.66); p.mul(x, 87, 1.12);
    for (let y = 88; y < 95; y++) p.mul(x, y, 0.95);
    if (x % 4 < 2) p.mul(x, 90, 1.2);
    p.mul(x, 95, 0.7);
    if (rnd() < 0.18) p.mul(x, 93 + Math.floor(rnd() * 2), 1.18);   // beira gasta
  }
}

function paintHeroSleeveHD(p, G, C, rnd, N) {
  const W = p.w, H = p.h;
  fabric(p, G, C.jacket, 0.035);
  // brilho na frente do braço, manchas do couro, sombra na parte de dentro
  p.each((x, y) => {
    const n = N(x / 6 + 13, y / 6) - 0.5;
    p.mul(x, y, 1 + n * 0.12 + 0.1 * Math.exp(-((x - 28) ** 2) / 70) - 0.08 * Math.exp(-((x - 48) ** 2) / 50) - y / H * 0.06);
  });
  // costura do ombro e costura de dentro, com pesponto
  for (let x = 0; x < W; x++) { p.mul(x, 8, 0.66); p.mul(x, 9, 1.12); if (x % 4 < 2) p.mul(x, 12, 1.18); }
  seam(p, 48, 10, 48, 86, 1, 0, 0.7, 1.08);
  stitch(p, 51, 12, 51, 84);
  // dobras do cotovelo (atrás do braço, nas beiras da região) e do lado de dentro
  for (let i = 0; i < 5; i++) {
    const y = 42 + i * 4 + Math.floor(rnd() * 2);
    for (const [a, b] of [[0, 9 + i % 2 * 3], [W - 10 - i % 2 * 3, W - 1]]) line(a, y + (a ? 1 : 0), b, y + (a ? 0 : 1), (x, yy, t) => { p.mul(x, yy, 0.8 + 0.1 * t); p.mul(x, yy - 1, 1.08); });
  }
  for (let i = 0; i < 3; i++) line(36, 46 + i * 5, 46, 44 + i * 5, (x, y) => { p.mul(x, y, 0.86); p.mul(x, y + 1, 1.06); });
  // punho dobrado com pesponto
  for (let x = 0; x < W; x++) {
    p.mul(x, 86, 0.64); p.mul(x, 87, 1.12);
    if (x % 4 < 2) p.mul(x, 90, 1.18);
    for (let y = 88; y < H; y++) p.mul(x, y, 0.95);
  }
}

// calça escura de sarja (perna: 64 x 128; frente na coluna 32, costuras em 16 e 48)
function paintHeroPantsHD(P, G, C, rnd, N) {
  const p = P.sub('pants', HDK), W = p.w, H = p.h;
  fabric(p, G, C.pants, 0.07);
  p.each((x, y) => {
    if ((x + y) % 3 === 0) p.mul(x, y, 0.96);                                  // sarja
    p.mul(x, y, 1 + (N(x / 5 + 70, y / 9) - 0.5) * 0.08 + 0.05 * Math.exp(-((x - 32) ** 2) / 90) - y / H * 0.05);
  });
  // costuras de fora e de dentro, vinco da frente
  seam(p, 16, 0, 16, 120, 1, 0, 0.7, 1.06); stitch(p, 18, 2, 18, 118, 1.14);
  seam(p, 48, 0, 48, 120, -1, 0, 0.74, 1.05);
  for (let y = 6; y < 116; y++) { p.mul(32, y, 1.1); p.mul(33, y, 0.95); }
  // boca do bolso e passador
  line(20, 0, 25, 13, (x, y) => { p.mul(x, y, 0.6); p.mul(x + 1, y, 1.1); });
  // rugas atrás do joelho e na frente da coxa
  for (let i = 0; i < 4; i++) {
    const y = 56 + i * 4;
    line(0, y, 10 - i, y + 2, (x, yy) => { p.mul(x, yy, 0.78); p.mul(x, yy + 1, 1.06); });
    line(W - 11 + i, y + 2, W - 1, y, (x, yy) => { p.mul(x, yy, 0.78); p.mul(x, yy + 1, 1.06); });
  }
  for (let i = 0; i < 3; i++) line(24, 20 + i * 7, 40, 23 + i * 7, (x, y, t) => p.mul(x, y, 1 - 0.1 * Math.sin(t * Math.PI)));
  // calça amassada em cima da bota e barra
  for (let i = 0; i < 3; i++) for (let x = 0; x < W; x++) {
    const y = Math.round(106 + i * 5 + Math.sin(x * 0.35 + i * 2) * 1.5);
    p.mul(x, y, 0.82); p.mul(x, y - 1, 1.07);
  }
  for (let x = 0; x < W; x++) { p.mul(x, 120, 0.7); p.mul(x, 121, 1.08); for (let y = 122; y < H; y++) p.mul(x, y, 0.88); }
}

function paintHeroPelvisHD(P, G, C, N) {
  const p = P.sub('pelvis', HDK), W = p.w;
  fabric(p, G, C.pants, 0.07);
  p.each((x, y) => { if ((x + y) % 3 === 0) p.mul(x, y, 0.96); p.mul(x, y, 1 + (N(x / 5, y / 5 + 30) - 0.5) * 0.08); });
  // braguilha com pesponto curvo, costuras de lado e do gancho
  seam(p, 64, 4, 64, 28, 1, 0, 0.62, 1.08);
  line(70, 4, 70, 20, (x, y) => { if (y % 4 < 2) p.mul(x, y, 1.15); });
  line(70, 20, 65, 26, (x, y) => { if (y % 3 < 2) p.mul(x, y, 1.15); });
  for (const x of [0, 32, 96, W - 1]) for (let y = 0; y < 32; y++) p.mul(x, y, 0.76);
  for (let y = 22; y < 32; y++) for (let x = 0; x < W; x++) p.mul(x, y, 0.9);
}

// botas de couro com cadarço, biqueira e solado costurado (64 x 64; cano nas linhas 0..15)
function paintHeroBootsHD(P, C, rnd, N) {
  const p = P.sub('boot', HDK), W = p.w, H = p.h;
  p.each((x, y) => p.set(x, y, scale(C.boot, 0.94 + rnd() * 0.06 + (N(x / 4 + 5, y / 4 + 50) - 0.5) * 0.14)));
  // brilho do couro no peito do pé e na biqueira (laterais e topo do pé: colunas 0..15 e 40..63)
  p.each((x, y) => { if (y > 16 && (x < 16 || x >= 40)) p.mul(x, y, 1 + 0.16 * Math.exp(-((y - 52) ** 2) / 60) + 0.06 * Math.exp(-((y - 30) ** 2) / 40)); });
  // cano: beira, ilhoses e cadarço cruzado na frente (coluna 32)
  for (let x = 0; x < W; x++) { p.mul(x, 0, 0.6); p.mul(x, 1, 0.8); p.mul(x, 14, 0.78); p.mul(x, 15, 0.9); }
  for (let y = 2; y < 15; y++) {
    const k = y % 4;
    p.set(30 + k, y, scale(C.lace, 1.1 - k * 0.05)); p.set(34 - k, y, scale(C.lace, 0.95));
    p.mul(26, y, 0.8); p.mul(38, y, 0.8);
  }
  for (const y of [3, 7, 11]) { p.set(26, y, [40, 38, 36]); p.set(38, y, [40, 38, 36]); p.set(27, y, [120, 110, 96]); p.set(39, y, [120, 110, 96]); }
  // solado (colunas 16..39) com vira costurada
  for (let y = 17; y < H; y++) {
    for (let x = 16; x < 40; x++) p.set(x, y, scale(C.sole, 0.9 + rnd() * 0.12 + ((x + y * 3) % 7 === 0 ? -0.1 : 0)));
    p.set(15, y, scale(C.stitch, 0.7)); p.set(40, y, scale(C.stitch, 0.7));
    if (y % 3 === 0) { p.set(14, y, C.stitch); p.set(41, y, C.stitch); }
    p.mul(13, y, 0.75); p.mul(42, y, 0.75);
  }
  // biqueira, contraforte do calcanhar e vinco do peito do pé
  for (let x = 0; x < W; x++) {
    if (x >= 16 && x < 40) continue;
    const y = Math.round(48 + Math.abs(((x + 12) % 64) - 32) * 0.12);
    p.mul(x, y, 0.62); p.mul(x, y + 1, 1.12); if (x % 3 === 0) p.mul(x, y - 2, 1.15);
    p.mul(x, 26, 0.7); p.mul(x, 27, 1.08);
    p.mul(x, 36, 0.86); p.mul(x, 37, 0.92);
  }
}

// mãos, polegar, pescoço com barba rala, orelhas
function paintHeroSkinHD(P, rnd, C) {
  const fill = p => p.each((x, y) => p.set(x, y, scale(C.skin, 0.97 + rnd() * 0.04)));
  const h = P.sub('hand', HDK);
  fill(h);
  // dorso e palma: dedos separados por vincos, nós dos dedos, unhas nas pontas
  h.each((x, y) => h.mul(x, y, 1 - 0.1 * (y / h.h)));
  for (const x of [4, 10, 14, 32, 38, 42]) for (let y = 24; y < 46; y++) { h.mul(x, y, 0.8); h.mul(x + 1, y, 0.92); }
  for (let x = 0; x < 22; x++) { h.mul(x, 22, 0.86); if (x % 6 < 3) h.mul(x, 20, 1.06); }
  for (let x = 28; x < 44; x++) { h.mul(x, 16, 0.86); h.mul(x, 17, 0.94); }
  for (let x = 0; x < h.w; x++) for (let y = 43; y < 47; y++) if (x % 6 > 1) h.set(x, y, mix(h.get(x, y), [222, 184, 170], 0.45));
  const t = P.sub('thumb', HDK);
  fill(t);
  for (let x = 2; x < 14; x++) for (let y = 11; y < 15; y++) t.set(x, y, mix(t.get(x, y), [222, 184, 170], 0.4));
  // pescoço: sombra sob o queixo, pomo de adão e a barba rala que desce do queixo
  const s = P.sub('skin', HDK);
  fill(s);
  s.each((x, y) => {
    s.mul(x, y, 0.8 + 0.2 * smoothstep(0, 12, y) - 0.06 * Math.exp(-((x - 16) ** 2) / 20) * Math.exp(-((y - 14) ** 2) / 10));
    const front = Math.exp(-((x - 16) ** 2) / 90);
    if (y < 14 && rnd() < front * (1 - y / 14)) s.set(x, y, mix(s.get(x, y), C.hair[0], 0.12 + rnd() * 0.1));
  });
  // orelha: aba clara, concha funda
  const e = P.sub('ear', HDK);
  fill(e);
  e.each((x, y) => {
    const d = Math.hypot(x - 15, y - 17);
    e.mul(x, y, 1 - 0.24 * Math.exp(-(d * d) / 26) + 0.07 * Math.exp(-((d - 10) ** 2) / 5) - 0.06 * Math.exp(-((d - 7) ** 2) / 2));
  });
}

// golas: de couro (pespontada) e a camisa escura no decote
function paintHeroCollarsHD(P, G, Gs, C) {
  const c = P.sub('collar', HDK);
  fabric(c, G, C.collar, 0.05);
  c.each((x, y) => c.mul(x, y, 1.08 - y * 0.012));
  for (let x = 0; x < c.w; x++) { c.mul(x, 0, 1.2); c.mul(x, 1, 1.12); if (x % 4 < 2) c.mul(x, 12, 1.22); c.mul(x, 14, 0.72); c.mul(x, 15, 0.6); }
  const ci = P.sub('collarIn', HDK);
  fabric(ci, G, C.collarIn, 0.05);
  ci.each((x, y) => ci.mul(x, y, 0.82 + y * 0.012));
  const sh = P.sub('shirt', HDK);
  fabric(sh, Gs, C.shirt, 0.05);
  sh.each((x, y) => sh.mul(x, y, y < 3 ? 1.25 : 1));
}

// mechas: fios ao longo da mecha, raiz mais escura e pontas claras
function paintHeroLocksHD(P, hairStrand) {
  const p = P.sub('lock', HDK);
  p.each((x, y) => p.set(x, y, scale(hairStrand(x * 1.3, y * 0.15), y < 8 ? 0.8 : y > 48 ? 1.1 : 1)));
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
  // média de cada bloco para a região do atlas; k = pixels de saída por unidade (2 = dobro)
  resolve(p, k = 1) {
    const s = this.s / k;
    for (let y = 0; y < this.h * k; y++) for (let x = 0; x < this.w * k; x++) {
      const c = [0, 0, 0];
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const o = ((y * s + j) * this.W + x * s + i) * 3; c[0] += this.d[o]; c[1] += this.d[o + 1]; c[2] += this.d[o + 2]; }
      p.set(x, y, scale(c, 1 / (s * s)));
    }
  }
}

// cabelo penteado para trás: na frente e atrás da cabeça os fios sobem/descem (colunas
// do mapa), nos lados correm na horizontal por cima das orelhas até a nuca
function hairHD(C, gHair, rnd) {
  const n = 256, R = new Float32Array(n);
  for (let i = 0; i < n; i++) R[i] = rnd() * 2 - 1;
  const s1 = t => { t = ((t % n) + n) % n; const i = Math.floor(t), f = t - i, a = R[i], b = R[(i + 1) % n]; return a + (b - a) * f * f * (3 - 2 * f); };
  const pal = t => { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? mix(C.hair[0], C.hair[1], t * 2) : mix(C.hair[1], C.hair[2], (t - 0.5) * 2); };
  // a: atravessa os fios; b: ao longo deles
  const strand = (a, b) => pal(0.5 + s1(a) * 0.2 + s1(a * 2.7 + 31) * 0.13 + s1(b * 0.5 + a * 0.4 + 90) * 0.05 + gHair(Math.round(a * 2), Math.round(b * 2)) * 0.07);
  const at = (x, y) => {
    const u = (x + 0.5) / 128, side = smoothstep(0.3, 0.8, Math.sin(u * TAU) ** 2);   // 1 nos lados
    const c = mix(strand(x * 0.9, y), strand(y * 1.25 + 57, x * 0.5), side);
    // brilho no alto da cabeça, raiz mais escura embaixo (perto das orelhas e da nuca)
    return scale(c, 1 + 0.14 * Math.exp(-((y - 12) ** 2) / 70) - 0.16 * smoothstep(34, 64, y));
  };
  return { at, strand };
}

// rosto realista e sério (protagonista): olhos fundos, sobrancelhas retas, maçãs
// marcadas, sulcos do nariz à boca, queixo definido e barba por fazer. Pintado em
// coordenadas da região de 64 x 40 com supersample de 8x e reduzido para 128 x 80.
function paintHeadRealHD(P, hairAt, rnd, C) {
  const p = P.sub('head', HDK), F = new Soft(64, 40, 8);
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
  for (const x of [26.65, M(26.3) + 0.35]) F.paint(x, 18.8, 0.2, 0.2, [236, 232, 224], 0.85);   // reflexo nos olhos
  both(m => F.stroke([[m(23.6), 18.75], [m(26.1), 18.25], [m(28.7), 18.75]], 0.8, C.lid, 1)); // pálpebra de cima
  both(m => F.stroke([[m(24), 19.8], [m(26.2), 20.05], [m(28.4), 19.75]], 0.4, 0.88));      // pálpebra de baixo
  both(m => F.paint(m(23.6), 18.9, 0.5, 0.4, C.lid, 0.8));
  both(m => F.shade(m(26.2), 21, 2.4, 0.8, 0.9));                                // olheira
  // sobrancelhas retas e baixas (expressão séria)
  both(m => F.stroke([[m(22.7), 15.8], [m(25.5), 15.1], [m(28.9), 15.5]], 1.7, C.brow, 1));
  both(m => F.shade(m(26), 16.4, 3, 0.6, 0.9));                                  // sombra logo abaixo da sobrancelha
  // maçãs e bochecha cavada
  both(m => F.shade(m(21.8), 21.2, 2.6, 1.4, 1.05));
  both(m => F.shade(m(21), 26, 3.6, 3.8, 0.9));
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
  both(m => F.shade(m(20), 33.5, 3.6, 5, 0.9));
  F.shade(32, 39.5, 16, 2.6, 0.72);
  F.resolve(p, HDK);
  // poros, fios das sobrancelhas e barba por fazer (texel a texel, em coordenadas de 64 x 40)
  p.each((x, y) => {
    const lx = (x + 0.5) / HDK, ly = (y + 0.5) / HDK, dx = Math.abs(lx - 32);
    p.mul(x, y, 0.985 + rnd() * 0.03);
    if (((dx - 6.2) / 3.4) ** 2 + ((ly - 15.45) / 0.9) ** 2 < 1) p.mul(x, y, 0.88 + rnd() * 0.2);
    // queixo e mandíbula (abaixo de uma linha que sobe para as orelhas) e buço; lábios de fora
    const jaw = smoothstep(31.5 - dx * 0.35, 33.5 - dx * 0.35, ly) * (1 - smoothstep(10, 13, dx));
    const lip = (1 - smoothstep(2.5, 4, dx)) * Math.max(0, 1 - Math.abs(ly - 28.5) / 1.5);
    const w = Math.max(jaw, lip * 0.8) * (ly >= 30 && ly <= 32 && dx <= 3 ? 0 : 1);
    if (w > 0 && rnd() < 0.6) p.set(x, y, mix(p.get(x, y), C.hair[0], w * (0.04 + rnd() * 0.1)));
  });
  // cabelo acima da linha, com raiz mais escura e transição de dois texels; costeletas curtas
  for (let x = 0; x < 64 * HDK; x++) {
    const lx = (x + 0.5) / HDK, f = headF(lx);
    let edge = R(hairline(f)) * HDK + (rnd() < 0.5 ? 0 : 1);
    if ((lx > 10.5 && lx < 13) || (lx > 51 && lx < 53.5)) edge = R(0.132) * HDK;
    edge = Math.round(edge);
    for (let y = 0; y < edge; y++) p.set(x, y, scale(hairAt(x, y), y > edge - 3 ? 0.86 : 1));
    p.set(x, edge, mix(p.get(x, edge), hairAt(x, edge), 0.5));
    p.set(x, edge + 1, mix(p.get(x, edge + 1), scale(hairAt(x, edge + 1), 0.8), 0.18));
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
  // traços de cada morador (ficha em npcData.js); só pintura, a malha é a mesma
  if (L.old === 2) {
    // velhice funda: sulco do nariz até a boca, testa marcada e papada
    for (let x = 26; x <= 38; x++) if (x % 3) p.mul(x, 12, 0.93);
    for (let y = 25; y < 32; y++) { p.mul(27, y, 0.92); p.mul(37, y, 0.92); }
    for (let x = 28; x <= 36; x++) p.mul(x, 35, 0.9);
  }
  if (L.brows === 'grossas') for (const cx of [26, 38]) for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 14, scale(C.brow, 1.08));
  if (L.bags) for (const cx of [26, 38]) for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 21, mix(p.get(x, 21), [118, 82, 96], 0.32));
  if (L.ruddy) {
    // queimado de sol / corado: bochechas e ponta do nariz vermelhas
    for (const x0 of [21, 40]) for (let y = 22; y < 26; y++) for (let x = x0; x < x0 + 4; x++) p.set(x, y, mix(p.get(x, y), [214, 110, 92], 0.28));
    for (let x = 31; x <= 33; x++) p.set(x, 24, mix(p.get(x, 24), [214, 110, 92], 0.3));
  }
  if (L.freckles) {
    for (let y = 20; y < 27; y++) for (let x = 21; x <= 43; x++) {
      if (Math.abs(x - 32) > 9 && y > 24) continue;
      if (rnd() < 0.2) p.set(x, y, mix(p.get(x, y), [150, 86, 52], 0.42));
    }
  }
  if (L.stubble) {
    // barba por fazer: pontinhos escuros na mandíbula, no queixo e no buço
    const dark = mix(C.hair[0], C.skin, 0.35);
    for (let x = 0; x < 64; x++) {
      const a = Math.abs(headF(x + 0.5) - 0.5);
      if (a > 0.22) continue;
      for (let y = a > 0.15 ? 25 : 28; y < 39; y++) {
        if (y < 31 && y > 28 && Math.abs(x - 32) > 4 && a < 0.15) continue;
        if (y >= 31 && y <= 32 && Math.abs(x - 32) <= 3) continue;
        if (rnd() < 0.55) p.set(x, y, mix(p.get(x, y), dark, 0.38));
      }
    }
  }
  if (L.mole) p.set(L.mole > 0 ? 41 : 23, 27, scale(C.skin, 0.55));
  if (L.scar === 'cheek') for (let k = 0; k < 5; k++) p.set(41 + (k >> 1), 22 + k, mix(p.get(41 + (k >> 1), 22 + k), [236, 206, 196], 0.55));
  if (L.scar === 'brow') for (let y = 13; y < 18; y++) p.set(24, y, mix(scale(C.skin, 1.02), [236, 206, 196], 0.5));
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

let grains = null, grainsHD = null;

// protagonista: tudo em 256 (o grão das fotos também vem com o dobro de detalhe)
function paintHeroHD(P, C, rnd) {
  grainsHD ||= {
    jacket: grain(IMG[HERO_FILES.jacket], 64),
    pants: grain(IMG[HERO_FILES.pants], 64),
    shirt: grain(IMG[HERO_FILES.shirt], 32),
    hair: grain(IMG[HERO_FILES.hair], 64, [236, 96, 128, 128]),
  };
  const G = grainsHD, N = valueNoise(rnd), hair = hairHD(C, G.hair, rnd);
  paintHeroJacketHD(P.sub('jacket', HDK), G.jacket, C, rnd, N);
  paintHeroSleeveHD(P.sub('sleeve', HDK), G.jacket, C, rnd, N);
  paintHeroPantsHD(P, G.pants, C, rnd, N);
  paintHeroPelvisHD(P, G.pants, C, N);
  paintHeadRealHD(P, hair.at, rnd, C);
  paintHeroLocksHD(P, hair.strand);
  paintHeroBootsHD(P, C, rnd, N);
  paintHeroSkinHD(P, rnd, C);
  paintHeroCollarsHD(P, G.jacket, G.shirt, C);
}

// look = {} pinta o protagonista; os moradores passam roupa, cores e detalhes (ver npcData.js)
export function makeHeroTexture(look = {}) {
  // sem look.top é o protagonista: paleta, jaqueta e rosto realista próprios, em 256
  if (!look.top) {
    const P = new Pix(ATLAS * HDK);
    paintHeroHD(P, palette({ ...look, colors: { ...HERO_COLORS, ...look.colors } }), rng(look.seed ?? 1971));
    return canvasTex(processPixels(P.toCanvas()), false);
  }
  const C = palette(look);
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

  paintTop(P, gJacket, C, look); paintSleeve(P, gJacket, C, look);
  paintPants(P, gPants, C, look, rnd);
  paintPelvis(P, gPants, C, look);
  paintHead(P, hairAt, rnd, C, look);
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
