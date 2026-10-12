import { IMG, HERO_FILES, makeCanvas, shrink, processPixels, canvasTex } from '../engine/textures.js';

// Atlas 128x128 do protagonista, pintado na carga: o grão dos tecidos vem das
// texturas da pasta (lona da jaqueta, tecido da calça, cabelo da foto de
// referência) e os detalhes (rosto, bolsos, zíper, costuras, cadarço) são pixel art.
// Coordenadas em pixels do atlas, origem no canto superior esquerdo.
// As linhas (v) de cada anel do modelo estão em character.js e batem com a pintura daqui.

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
const C = {
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
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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

function paintJacket(P, G) {
  const p = P.sub('jacket');
  fabric(p, G, C.jacket, 0.07);
  p.each((x, y) => p.mul(x, y, 1 - (y / 48) * 0.08));
  // decote em V mostrando a camisa (frente = coluna 32)
  for (let y = 0; y < 8; y++) {
    const hw = Math.round((8 - y) * 0.6);
    for (let x = 32 - hw; x <= 32 + hw; x++) p.set(x, y, scale(C.shirt, 0.96 + G(x, y) * 0.03));
    p.mul(31 - hw, y, 0.7); p.mul(33 + hw, y, 0.7);
  }
  // zíper
  for (let y = 8; y < 44; y++) {
    p.set(32, y, y % 2 ? [76, 54, 40] : [152, 140, 118]);
    p.mul(31, y, 0.86); p.mul(33, y, 0.86);
  }
  // bolsos do peito com lapela e botão (fileiras 15–22 = entre os anéis do peito)
  for (const x0 of [22, 36]) {
    for (let y = 15; y < 23; y++) { p.mul(x0, y, 0.72); p.mul(x0 + 6, y, 0.72); }
    for (let x = x0; x <= x0 + 6; x++) { p.mul(x, 15, 0.8); p.mul(x, 16, 0.9); p.mul(x, 17, 0.9); p.mul(x, 18, 0.68); p.mul(x, 22, 0.72); }
    p.set(x0 + 3, 18, C.brass);
  }
  // bolsos inferiores (vivos inclinados)
  for (let i = 0; i < 6; i++) { p.mul(19 + i, 38 - (i >> 1), 0.62); p.mul(45 - i, 38 - (i >> 1), 0.62); }
  // costuras laterais e pala das costas
  for (let y = 0; y < 43; y++) { p.mul(16, y, 0.8); p.mul(48, y, 0.8); }
  for (let x = 0; x < 64; x++) if (x < 13 || x > 51) p.mul(x, 9, 0.8);
  rib(p, 44, 48);
}

function paintSleeve(P, G) {
  const p = P.sub('sleeve');
  fabric(p, G, C.jacket, 0.07);
  for (let x = 0; x < 32; x++) { p.mul(x, 4, 0.78); p.mul(x, 5, 0.94); }   // costura do ombro
  for (let y = 5; y < 42; y++) p.mul(24, y, 0.82);                         // costura do lado do corpo
  // rugas do cotovelo (parte de trás do braço = bordas da região)
  for (const [x, y] of [[1, 21], [2, 22], [30, 22], [31, 23], [0, 25], [1, 26], [29, 26], [30, 25], [3, 24], [28, 24], [2, 28], [30, 28]]) p.mul(x, y, 0.76);
  rib(p, 43, 48);
}

function paintPants(P, G, rnd) {
  const p = P.sub('pants');
  fabric(p, G, C.pants, 0.08);
  // costura externa (col. 8), interna (24) e vinco da frente (16)
  for (let y = 0; y < 64; y++) { p.mul(8, y, 0.78); p.mul(24, y, 0.8); if (y > 2 && y < 60) p.mul(16, y, 1.1); }
  for (let i = 0; i < 6; i++) p.mul(10 + (i >> 1), i, 0.7);  // abertura do bolso
  for (let i = 0; i < 14; i++) p.mul(Math.floor(rnd() * 32), 29 + Math.floor(rnd() * 7), 0.82); // rugas do joelho
  for (let x = 0; x < 32; x++) { p.mul(x, 60, 0.78); p.mul(x, 61, 0.9); p.mul(x, 62, 0.86); p.mul(x, 63, 0.86); }
}

function paintPelvis(P, G) {
  const p = P.sub('pelvis');
  fabric(p, G, C.pants, 0.08);
  for (let y = 2; y < 14; y++) p.mul(32, y, 0.72);                       // braguilha
  for (let y = 2; y < 10; y++) p.mul(34, y, 0.86);
  for (let y = 0; y < 16; y++) { p.mul(0, y, 0.8); p.mul(63, y, 0.8); p.mul(16, y, 0.82); p.mul(48, y, 0.82); }
  for (let y = 11; y < 16; y++) for (let x = 0; x < 64; x++) p.mul(x, y, 0.9);
}

function paintHead(P, hairAt, rnd) {
  const p = P.sub('head');
  const R = y => headRow(y) - REG.head[1];
  p.each((x, y) => p.set(x, y, scale(C.skin, 0.985 + rnd() * 0.03)));
  for (let y = 36; y < 40; y++) for (let x = 0; x < 64; x++) p.mul(x, y, 0.86);  // sob a mandíbula
  // cabelo acima da linha, com borda irregular; costeletas na frente das orelhas
  for (let x = 0; x < 64; x++) {
    const f = headF(x + 0.5);
    let edge = Math.round(R(hairline(f))) + (rnd() < 0.4 ? 1 : 0);
    if (x === 11 || x === 12 || x === 51 || x === 52) edge = Math.round(R(0.128));
    for (let y = 0; y < edge; y++) p.set(x, y, hairAt(x, y));
    p.mul(x, edge, 0.93);
  }
  // sobrancelhas (loiras, um pouco mais escuras que o cabelo)
  for (const [cx, out] of [[26, -1], [38, 1]]) {
    for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 15, C.brow);
    p.set(cx + out * 3, 16, scale(C.brow, 1.05));
    p.mul(cx - out * 2, 14, 0.96);
  }
  // olhos azuis: pálpebra, branco, íris e pupila
  for (const cx of [26, 38]) {
    for (let x = cx - 2; x <= cx + 2; x++) p.set(x, 18, C.lid);
    p.set(cx - 2, 19, C.white); p.set(cx - 1, 19, C.iris); p.set(cx, 19, C.pupil); p.set(cx + 1, 19, C.iris); p.set(cx + 2, 19, C.white);
    p.mul(cx - 2, 20, 0.92); p.set(cx - 1, 20, scale(C.white, 0.94)); p.set(cx, 20, C.irisLow); p.set(cx + 1, 20, scale(C.white, 0.94)); p.mul(cx + 2, 20, 0.92);
    p.mul(cx - 3, 18, 0.9); p.mul(cx + 3, 18, 0.9);
    for (let x = cx - 2; x <= cx + 2; x++) p.mul(x, 17, 0.94);
  }
  p.set(23, 18, scale(C.lid, 1.2)); p.set(41, 18, scale(C.lid, 1.2));
  // nariz: luz no dorso, sombra lateral, narinas
  for (let y = 18; y < 25; y++) p.mul(32, y, 1.04);
  for (let y = 21; y < 25; y++) p.mul(30, y, 0.93);
  p.set(30, 25, [156, 100, 90]); p.set(34, 25, [156, 100, 90]);
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
}

function paintLocks(P, hairAt) {
  const p = P.sub('lock');
  p.each((x, y) => p.set(x, y, scale(hairAt(x * 2 + 1, y), y < 4 ? 0.82 : y > 24 ? 1.08 : 1)));
}

function paintBoots(P, rnd) {
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

function paintSkinParts(P, rnd) {
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

export function makeHeroTexture() {
  const P = new Pix(ATLAS), rnd = rng(1971);
  const gJacket = grain(IMG[HERO_FILES.jacket], 32);
  const gPants = grain(IMG[HERO_FILES.pants], 32);
  const gShirt = grain(IMG[HERO_FILES.shirt], 16);
  const gHair = grain(IMG[HERO_FILES.hair], 32, [236, 96, 128, 128]);
  // fios de cabelo: brilho por coluna + grão da foto, numa paleta loira
  const strand = Array.from({ length: 64 }, () => rnd() * 2 - 1);
  const hairAt = (x, y) => {
    const t = Math.max(0, Math.min(1, 0.5 + strand[x % 64] * 0.22 + gHair(x, y) * 0.16));
    return t < 0.5 ? mix(C.hair[0], C.hair[1], t * 2) : mix(C.hair[1], C.hair[2], (t - 0.5) * 2);
  };

  paintJacket(P, gJacket);
  paintSleeve(P, gJacket);
  paintPants(P, gPants, rnd);
  paintPelvis(P, gPants);
  paintHead(P, hairAt, rnd);
  paintLocks(P, hairAt);
  paintBoots(P, rnd);
  paintSkinParts(P, rnd);
  const col = P.sub('collar');
  fabric(col, gJacket, scale(C.jacket, 0.96), 0.07);
  for (let x = 0; x < 32; x++) { if (x % 2) col.mul(x, 6, 1.15); col.mul(x, 7, 0.8); }
  fabric(P.sub('collarIn'), gJacket, scale(C.jacket, 0.8), 0.06);
  fabric(P.sub('shirt'), gShirt, C.shirt, 0.05);

  return canvasTex(processPixels(P.toCanvas()), false);
}
