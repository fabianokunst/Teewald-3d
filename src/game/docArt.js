import { chupaSketch } from './missionArt.js';

// Desenhos dos papéis (ui/paper.js): fotos antigas, fotos de jornal em retícula, o
// álbum da paróquia, desenho de criança a giz de cera, esboços a tinta e selo de carta.
// Tudo desenhado pixel a pixel, nada recortado de foto. docArt(nome) devolve um canvas
// (em cache) que o papel amplia sem suavizar.

const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// formas comuns: o filho define px(x, y, v); v pode ser função (x, y, antigo) => novo
class Plot {
  rect(x, y, w, h, v) {
    x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, v);
  }
  ell(cx, cy, rx, ry, v) {
    rx = Math.max(rx, 0.5); ry = Math.max(ry, 0.5);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, v);
    }
  }
  poly(pts, v) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.px(x, y, v);
    }
  }
  line(x0, y0, x1, y1, v, w = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (w <= 1) this.px(Math.round(x), Math.round(y), v); else this.rect(x - w / 2, y - w / 2, w, w, v);
    }
  }
}

// filme: tons de 0 (preto) a 1 (branco), revelados depois (sépia, preto e branco, retícula)
class Film extends Plot {
  constructor(w, h, v = 0.5) { super(); this.w = w; this.h = h; this.d = new Float32Array(w * h).fill(v); }
  px(x, y, v) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.d[i] = typeof v === 'function' ? v(x, y, this.d[i]) : v;
  }
  grad(y0, y1, v0, v1) { for (let y = y0; y < y1; y++) this.rect(0, y, this.w, 1, v0 + (v1 - v0) * (y - y0) / Math.max(1, y1 - y0 - 1)); }
  // fora de foco
  blur(x0, y0, x1, y1, n = 1) {
    const { w, d } = this;
    x0 = Math.max(1, x0); y0 = Math.max(1, y0); x1 = Math.min(this.w - 2, x1); y1 = Math.min(this.h - 2, y1);
    for (let k = 0; k < n; k++) {
      const s = d.slice();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let t = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) t += s[(y + j) * w + x + i];
        d[y * w + x] = t / 9;
      }
    }
  }
}

// cores: px(x, y, [r, g, b, a?]); com alfa < 255 mistura com o que já está lá
class Pix extends Plot {
  constructor(w, h) {
    super(); this.w = w; this.h = h;
    this.c = canvas(w, h); this.g = this.c.getContext('2d');
    this.img = this.g.createImageData(w, h); this.d = this.img.data;
  }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (typeof c === 'function') c = c(x, y);
    if (!c) return;
    const i = (y * this.w + x) * 4, a = c[3] ?? 255, d = this.d;
    if (a >= 255 || d[i + 3] === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.max(a, d[i + 3]); return; }
    const t = a / 255;
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
  clear(x, y) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[(y * this.w + x) * 4 + 3] = 0; }
  done() { this.g.putImageData(this.img, 0, 0); return this.c; }
}

const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f, c[3]];

// ---------- revelação ----------
// retícula de jornal: pontos que crescem do centro (no dobro da resolução do filme)
const DOTS = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14].map(v => (v + 0.5) / 16);
const SEPIA = v => [34 + 200 * v, 22 + 192 * Math.pow(v, 1.05), 14 + 164 * Math.pow(v, 1.15)];
const GRAY = v => [22 + 210 * v, 22 + 206 * v, 20 + 198 * v];
// cor desbotada dos anos 80: sombra arroxeada, luz alaranjada
const FADED = v => [44 + 196 * Math.pow(v, 0.95), 34 + 180 * v, 46 + 140 * Math.pow(v, 1.2)];
// retícula de jornal: tinta preta no papel (a mesma cor do papel 'news' em ui/paper.js)
const NEWS = v => (v ? [212, 207, 194] : [38, 36, 34]);

// o: { grain, vignette, halftone, lift (tira o preto puro), scratches, seed }
function develop(F, pal, o = {}) {
  if (o.halftone) return halftone(F, pal, o);
  const c = canvas(F.w, F.h), g = c.getContext('2d'), img = g.createImageData(F.w, F.h), R = rnd(o.seed || 7);
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    const i = y * F.w + x;
    let v = F.d[i];
    if (o.grain) v += (R() - 0.5) * o.grain;
    if (o.vignette) { const dx = x / (F.w - 1) * 2 - 1, dy = y / (F.h - 1) * 2 - 1; v -= o.vignette * Math.max(0, (dx * dx + dy * dy) * 0.5 - 0.18); }
    v = clamp01(v);
    if (o.lift) v = o.lift + v * (1 - o.lift);
    const p = pal(v);
    img.data[i * 4] = p[0]; img.data[i * 4 + 1] = p[1]; img.data[i * 4 + 2] = p[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // riscos claros e pontos de poeira
  if (o.scratches) {
    g.fillStyle = 'rgba(255, 244, 220, 0.55)';
    for (let i = 0; i < o.scratches; i++) { const x = Math.floor(R() * F.w), y = Math.floor(R() * F.h * 0.6); g.fillRect(x, y, 1, 6 + Math.floor(R() * F.h * 0.4)); }
    for (let i = 0; i < o.scratches * 3; i++) g.fillRect(Math.floor(R() * F.w), Math.floor(R() * F.h), 1, 1);
  }
  return c;
}

function halftone(F, pal, o) {
  const W = F.w * 2, H = F.h * 2, c = canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), R = rnd(o.seed || 7);
  const at = (x, y) => F.d[Math.min(F.h - 1, Math.max(0, y)) * F.w + Math.min(F.w - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x / 2 - 0.25, fy = y / 2 - 0.25, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    let v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    v = clamp01(v + (R() - 0.5) * 0.06);
    const p = pal(v > DOTS[(y & 3) * 4 + (x & 3)] ? 1 : 0), i = (y * W + x) * 4;
    img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// borda branca de foto; o: { col, deckle (borda serrilhada dos anos 50), tape (fita nos cantos), seed }
function framed(src, b, o = {}) {
  const W = src.width + b * 2, H = src.height + b * 2, P = new Pix(W, H), R = rnd(o.seed || 3), col = o.col || [232, 226, 210];
  P.rect(0, 0, W, H, () => shade(col, 0.95 + R() * 0.06));
  if (o.deckle) for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge === 0 && (x + y) % 3 === 0) P.clear(x, y);
  }
  P.done();
  P.g.drawImage(src, b, b);
  if (o.tape) {
    P.g.fillStyle = 'rgba(226, 214, 176, 0.62)';
    P.g.save(); P.g.translate(5, 4); P.g.rotate(-0.6); P.g.fillRect(-8, -3, 16, 6); P.g.restore();
    P.g.save(); P.g.translate(W - 5, 4); P.g.rotate(0.6); P.g.fillRect(-8, -3, 16, 6); P.g.restore();
  }
  return P.c;
}

// ---------- gente e árvores das fotos ----------
// cabeça em (x, y); s = escala (1 = multidão ao longe). o: { hat, eyes, dark }
function folk(F, x, y, kind, s, R, o = {}) {
  const face = 0.8 + R() * 0.08, hat = o.hat ?? true;
  const eyes = () => { if (!o.eyes) return; const e = Math.max(1, Math.round(0.25 * s)), ex = Math.max(1, Math.round(0.42 * s)), ey = Math.round(y); F.rect(Math.round(x) - ex, ey, e, e, 0.42); F.rect(Math.round(x) + ex - e + 1, ey, e, e, 0.42); };
  if (kind === 'kid') {
    F.rect(x - 0.9 * s, y + 1 * s, 2 * s, 3 * s, 0.6 + R() * 0.3);
    F.rect(x - 0.7 * s, y + 4 * s, 1.6 * s, 1.5 * s, 0.3);
    F.ell(x, y, Math.max(1, 0.8 * s), Math.max(1, 0.9 * s), face);
    if (R() < 0.4) F.rect(x - 0.9 * s, y - 1 * s, 2 * s, Math.max(1, 0.6 * s), 0.25);
    return;
  }
  if (kind === 'man') {
    const suit = o.dark ? 0.08 + R() * 0.06 : 0.1 + R() * 0.14;
    F.rect(x - 1.4 * s, y + 1 * s, 3 * s, 5 * s, suit);
    F.rect(x - 1.1 * s, y + 6 * s, 2.4 * s, 2.6 * s, suit * 0.8);
    if (s >= 2) F.poly([[x - 0.5 * s, y + 1 * s], [x + 0.5 * s, y + 1 * s], [x, y + 2.6 * s]], 0.9);
    F.ell(x, y, Math.max(1, 0.9 * s), Math.max(1, 1.1 * s), face);
    if (hat && R() < 0.75) { F.rect(x - 1.5 * s, y - 1.1 * s, 3.2 * s, Math.max(1, 0.5 * s), 0.1); F.rect(x - 0.9 * s, y - 2 * s, 1.9 * s, 1 * s, 0.12); }
    else F.rect(x - 0.9 * s, y - 1.1 * s, 1.9 * s, Math.max(1, 0.6 * s), 0.22);
    eyes();
    return;
  }
  if (kind === 'lady') {
    // mulher dos anos 50 a 80: cabelo, vestido com cintura
    const dress = o.dark ? 0.1 + R() * 0.08 : 0.4 + R() * 0.3;
    F.poly([[x - 1.2 * s, y + 1 * s], [x + 1.2 * s, y + 1 * s], [x + 0.9 * s, y + 4 * s], [x + 1.9 * s, y + 8 * s], [x - 1.9 * s, y + 8 * s], [x - 0.9 * s, y + 4 * s]], dress);
    F.ell(x, y - 0.3 * s, Math.max(1, 1.15 * s), Math.max(1, 1.2 * s), 0.12 + R() * 0.3);
    F.ell(x, y + 0.2 * s, Math.max(1, 0.8 * s), Math.max(1, 1 * s), face);
    if (hat && R() < 0.5) F.rect(x - 1 * s, y - 1.5 * s, 2 * s, Math.max(1, 0.6 * s), 0.15);
    eyes();
    return;
  }
  // mulher de 1910: lenço claro e vestido comprido
  const dress = 0.25 + R() * 0.3;
  F.poly([[x - 1.3 * s, y + 1 * s], [x + 1.3 * s, y + 1 * s], [x + 2 * s, y + 8.5 * s], [x - 2 * s, y + 8.5 * s]], dress);
  F.ell(x, y - 0.2 * s, Math.max(1, 1.3 * s), Math.max(1, 1.4 * s), 0.86 + R() * 0.08);
  F.ell(x, y + 0.3 * s, Math.max(1, 0.7 * s), Math.max(1, 0.8 * s), face);
}

// a mulher de preto: vestido preto comprido, rosto branco demais, olhando para a câmera.
// o.hand = [x, y]: o braço estendido até ali (a mão em cima do caixão)
function blackLady(F, x, y, s, o = {}) {
  x = Math.round(x); y = Math.round(y);
  F.poly([[x - 1.5 * s, y + 1 * s], [x + 1.5 * s, y + 1 * s], [x + 2.6 * s, y + 10 * s], [x - 2.6 * s, y + 10 * s]], 0.03);
  if (o.hand) {
    const [hx, hy] = o.hand;
    F.line(x - 1.2 * s, y + 2 * s, hx, hy, 0.03, Math.max(1, 0.7 * s));
    F.ell(hx, hy, Math.max(1, 0.5 * s), Math.max(1, 0.35 * s), 0.96);
  }
  if (s < 1.6) {
    F.rect(x - 1, y - 2, 3, 1, 0.03);
    F.rect(x - 1, y - 1, 3, 3, 0.97);
    F.px(x - 1, y, 0.02); F.px(x + 1, y, 0.02);
    return;
  }
  F.ell(x, y - 0.25 * s, 1.3 * s, 1.5 * s, 0.03);
  F.ell(x, y + 0.15 * s, 0.95 * s, 1.15 * s, 0.97);
  const e = Math.max(1, Math.round(0.3 * s)), ex = Math.max(1, Math.round(0.42 * s)), ey = Math.round(y + 0.05 * s);
  F.rect(x - ex - e + 1, ey, e, e, 0.02); F.rect(x + ex, ey, e, e, 0.02);
}

// araucária: tronco reto e a copa em candelabro, com as pontas para cima
function araucaria(F, x, top, base, r, v, R) {
  F.line(x, top + 2, x, base, v, r > 9 ? 2 : 1);
  for (let t = 0; t < 3; t++) {
    const y = top + t * 3.5, half = r * (1 - t * 0.22);
    for (let dx = -half; dx <= half; dx++) { const u = dx / half; F.rect(x + dx, y - u * u * 3.2, 1, 2, v); }
    F.ell(x - half, y - 3, 1.5, 1.4, v); F.ell(x + half, y - 3, 1.5, 1.4, v);
  }
}

// ---------- 1910: inauguração da Matriz (a foto dobrada e a primeira do álbum) ----------
function scene1910(F, R) {
  F.grad(0, 60, 0.92, 0.84);
  F.poly([[0, 58], [30, 52], [70, 55], [110, 50], [160, 56], [160, 72], [0, 72]], 0.72);
  araucaria(F, 32, 28, 74, 11, 0.3, R);
  araucaria(F, 138, 24, 72, 13, 0.28, R);
  araucaria(F, 154, 38, 72, 8, 0.36, R);
  F.rect(0, 70, F.w, F.h - 70, () => 0.6 + R() * 0.06);
  // fachada rebocada; a torre ainda no tijolo
  F.rect(52, 34, 56, 38, () => 0.76 + R() * 0.03);
  F.poly([[50, 35], [80, 21], [110, 35]], 0.66);
  F.line(50, 35, 80, 21, 0.4); F.line(80, 21, 110, 35, 0.4);
  for (const wx of [57, 65, 93, 101]) { F.rect(wx, 44, 4, 11, 0.22); F.ell(wx + 1.5, 44, 2, 2, 0.22); }
  F.rect(72, 12, 16, 60, (x, y) => { const row = y >> 1; if (y % 2 === 0) return 0.62; return (x + (row % 2) * 2) % 4 === 0 ? 0.6 : 0.4 + R() * 0.08; });
  F.poly([[71, 12.5], [89, 12.5], [80, 4]], 0.36);
  F.line(80, 0, 80, 4, 0.2); F.line(78, 1, 82, 1, 0.2);
  F.rect(77, 18, 6, 7, 0.12); F.ell(79.5, 18, 3, 2, 0.12);
  F.rect(75, 57, 10, 15, 0.1); F.ell(79.5, 57, 5, 4, 0.1);
  for (let j = 0; j < 8; j++) F.rect(44 - j * 2, 72 + j * 2, 72 + j * 4, 2, j % 2 ? 0.6 : 0.7);
  // o povo na escadaria: homens de chapéu, mulheres de lenço, as crianças na frente
  for (const [y0, x0, x1, step] of [[67, 50, 110, 4], [72, 46, 114, 4], [77, 42, 118, 4], [82, 40, 120, 4.5]]) {
    for (let x = x0; x <= x1; x += step) {
      if (y0 < 70 && x > 73 && x < 87) continue;
      folk(F, x + R() * 1.6 - 0.8, y0 + R() * 1.2, R() < 0.55 ? 'man' : 'woman', 1, R);
    }
  }
  for (let x = 46; x <= 114; x += 5) folk(F, x + R() * 2 - 1, 90 + R(), 'kid', 1, R);
  // no canto esquerdo, longe de todos
  blackLady(F, 12, 80, 1.2);
}

// dobrada em quatro: vinco claro com sombra e a emulsão rachada
function folds(F, R) {
  const cx = Math.floor(F.w / 2), cy = Math.floor(F.h / 2);
  for (let y = 0; y < F.h; y++) { F.px(cx, y, (x2, y2, o) => Math.min(1, o + 0.34)); F.px(cx + 1, y, (x2, y2, o) => o * 0.86); }
  for (let x = 0; x < F.w; x++) { F.px(x, cy, (x2, y2, o) => Math.min(1, o + 0.34)); F.px(x, cy + 1, (x2, y2, o) => o * 0.86); }
  for (let i = 0; i < 40; i++) { const along = R() < 0.5; F.px(along ? cx + Math.round((R() - 0.5) * 3) : R() * F.w, along ? R() * F.h : cy + Math.round((R() - 0.5) * 3), 0.97); }
}

function foto1910() {
  const F = new Film(160, 104), R = rnd(1910);
  scene1910(F, R);
  folds(F, rnd(19));
  return framed(develop(F, SEPIA, { grain: 0.08, vignette: 0.5, scratches: 5, seed: 11 }), 4, { col: [222, 208, 178], seed: 5 });
}

// ---------- o álbum da paróquia ----------
function album1910() {
  const F = new Film(160, 104), R = rnd(1910);
  scene1910(F, R);
  return framed(develop(F, SEPIA, { grain: 0.07, vignette: 0.45, scratches: 2, seed: 12 }), 4, { col: [226, 214, 186], seed: 6 });
}

// 1935: procissão de Corpus Christi, tapete de serragem na rua
function album1935() {
  const F = new Film(136, 88), R = rnd(1935);
  F.grad(0, 30, 0.9, 0.82);
  // a Matriz lá no fim da rua, já rebocada
  F.rect(56, 14, 24, 24, 0.74); F.poly([[55, 15], [68, 8], [81, 15]], 0.66);
  F.rect(64, 4, 8, 34, 0.72); F.poly([[63, 4.5], [73, 4.5], [68, -1]], 0.4);
  F.rect(66, 28, 4, 10, 0.15);
  // casas dos dois lados
  F.poly([[0, 6], [46, 24], [46, 46], [0, 52]], () => 0.6 + R() * 0.03);
  F.poly([[136, 6], [90, 24], [90, 46], [136, 52]], () => 0.55 + R() * 0.03);
  for (let i = 0; i < 3; i++) { F.rect(5 + i * 13, 20 + i * 4, 5, 9 - i * 2, 0.2); F.rect(126 - i * 13, 20 + i * 4, 5, 9 - i * 2, 0.2); }
  // a rua e o tapete de flores e serragem
  F.poly([[0, 52], [46, 46], [90, 46], [136, 52], [136, 88], [0, 88]], () => 0.6 + R() * 0.05);
  F.poly([[58, 46], [78, 46], [100, 88], [36, 88]], (x, y) => {
    const v = (y - 46) / 42, xl = 58 - 22 * v, xr = 78 + 22 * v, u = (x - xl) / (xr - xl);
    const a = Math.abs(((u * 4) % 1) - 0.5) + Math.abs(((Math.pow(v, 0.7) * 5) % 1) - 0.5);
    return a < 0.32 ? 0.32 : 0.8;
  });
  // o povo nas calçadas
  for (const [y, n, s] of [[47, 6, 1.3], [53, 6, 1.6], [61, 5, 2], [70, 4, 2.4]]) {
    for (let i = 0; i < n; i++) {
      folk(F, 4 + i * (34 / n) + R() * 2, y + R() * 2, R() < 0.5 ? 'man' : 'woman', s, R);
      folk(F, 132 - i * (34 / n) - R() * 2, y + R() * 2, R() < 0.5 ? 'man' : 'woman', s, R);
    }
  }
  // atrás do andor, no meio do povo
  for (const x of [58, 62, 74, 86, 90]) folk(F, x, 44 + R() * 2, R() < 0.5 ? 'man' : 'woman', 1.3, R);
  blackLady(F, 80, 43, 1.7);
  // a imagem do santo no andor, carregado por quatro homens
  F.poly([[65, 40], [71, 40], [73, 54], [63, 54]], 0.88);
  F.ell(68, 37, 1.8, 2, 0.9);
  for (let a = 0; a < 6.28; a += 0.4) F.px(68 + Math.cos(a) * 3.4, 37 + Math.sin(a) * 3.4, 0.98);
  F.rect(55, 54, 26, 2, 0.26);
  for (const x of [56, 80]) F.ell(x, 52, 1.5, 1.5, 0.55);
  for (const x of [59, 65, 71, 77]) folk(F, x, 58, 'man', 1.8, R, { hat: false });
  return framed(develop(F, SEPIA, { grain: 0.07, vignette: 0.4, lift: 0.08, scratches: 2, seed: 13 }), 4, { col: [228, 218, 192], seed: 7 });
}

// 1957: casamento na porta da igreja; ela entre os padrinhos
function album1957() {
  const F = new Film(136, 88), R = rnd(1957);
  F.rect(0, 0, 136, 60, (x, y) => (y % 8 === 0 || (x + (y >> 3) * 6) % 14 === 0 ? 0.6 : 0.69 + R() * 0.04));
  F.rect(48, 12, 40, 48, 0.15); F.ell(68, 12, 20, 10, 0.15);
  for (let x = 52; x < 86; x += 6) F.rect(x, 10, 1, 50, 0.2);
  for (let j = 0; j < 4; j++) F.rect(0, 60 + j * 7, 136, 7, j % 2 ? 0.6 : 0.7);
  const s = 2.6, y = 34;
  folk(F, 12, y + 1, 'lady', s, R, { eyes: true });
  folk(F, 25, y, 'man', s, R, { hat: false, eyes: true });
  folk(F, 38, y + 1, 'lady', s, R, { eyes: true });
  // noivo
  folk(F, 55, y - 1, 'man', s, R, { hat: false, eyes: true, dark: true });
  // noiva: vestido branco, véu e buquê
  const bx = 70, by = y;
  F.poly([[bx - 1.4 * s, by + 1 * s], [bx + 1.4 * s, by + 1 * s], [bx + 1 * s, by + 4 * s], [bx + 6, by + 22], [bx - 6, by + 22], [bx - 1 * s, by + 4 * s]], 0.95);
  F.poly([[bx - 3, by - 2], [bx + 3, by - 2], [bx + 5, by + 9], [bx - 5, by + 9]], 0.9);
  F.ell(bx, by - 0.5, 3.2, 3.4, 0.93);
  F.ell(bx, by + 0.5, 2.1, 2.6, 0.84);
  F.rect(bx - 1, by, 1, 1, 0.42); F.rect(bx + 1, by, 1, 1, 0.42);
  F.ell(bx, by + 10, 2.4, 2, 0.5); F.px(bx - 1, by + 9, 0.85); F.px(bx + 1, by + 11, 0.85);
  folk(F, 88, y, 'man', s, R, { hat: false, eyes: true });
  folk(F, 114, y + 1, 'lady', s, R, { eyes: true });
  folk(F, 127, y, 'man', s, R, { hat: false, eyes: true });
  // um pouco mais perto que os outros, e olhando para a câmera
  blackLady(F, 101, y + 1, 3.1);
  return framed(develop(F, GRAY, { grain: 0.06, vignette: 0.3, seed: 14 }), 4, { col: [238, 236, 228], deckle: true, seed: 8 });
}

// 1983: o enterro da Lúcia Weber; ela do lado do caixão, com a mão na tampa
function album1983() {
  const F = new Film(136, 88), R = rnd(1983);
  F.grad(0, 28, 0.8, 0.74);
  F.rect(0, 26, 136, 10, 0.5);
  for (const x of [8, 30, 110, 128]) F.poly([[x, 4], [x + 4, 30], [x - 4, 30]], 0.25);
  for (let i = 0; i < 9; i++) {
    const x = 6 + i * 15 + R() * 4;
    if (R() < 0.5) { F.rect(x, 28, 1.5, 9, 0.85); F.rect(x - 2, 30, 5.5, 1.5, 0.85); }
    else { F.rect(x - 2, 30, 5, 7, 0.62); F.ell(x + 0.5, 30, 2.5, 1.5, 0.62); }
  }
  F.rect(0, 36, 136, 52, () => 0.46 + R() * 0.08);
  // gente de luto, alguns de guarda-chuva
  for (const x of [12, 26, 40, 54, 68, 82, 124]) {
    const y = 40 + R() * 2;
    folk(F, x, y, R() < 0.5 ? 'man' : 'lady', 2.4, R, { hat: false, dark: true });
    if (R() < 0.45) { for (let dx = -6; dx <= 6; dx++) { const h = Math.sqrt(1 - (dx / 6.5) ** 2) * 3.5; F.rect(x + dx, y - 3 - h, 1, h, 0.08); } F.line(x, y - 3, x, y + 2, 0.1); }
  }
  // caixão branco nos cavaletes, com flores
  for (const x of [34, 40, 86, 92]) F.line(x, 70, x + (x < 60 ? -2 : 2), 84, 0.2);
  F.poly([[24, 66], [102, 64], [100, 72], [26, 74]], 0.74);
  F.poly([[28, 58], [98, 56], [102, 64], [24, 66]], 0.92);
  for (let x = 34; x < 96; x += 10) F.rect(x, 69, 2, 1, 0.35);
  for (const [fx, fy, v] of [[58, 60, 0.55], [62, 59, 0.35], [55, 61, 0.7], [65, 60, 0.6], [60, 61, 0.3]]) F.ell(fx, fy, 1.6, 1.2, v);
  blackLady(F, 114, 36, 3.8, { hand: [99, 59] });
  return framed(develop(F, FADED, { grain: 0.07, vignette: 0.35, seed: 15 }), 4, { col: [236, 232, 222], seed: 9 });
}

// sem data: a nave desta igreja, de noite, tirada lá do altar; ela bem na frente da câmera
function albumNoite() {
  const F = new Film(136, 88, 0.04), R = rnd(66);
  const vx = 50, vy = 36;
  F.rect(vx - 3, vy - 9, 6, 9, 0.12);
  F.poly([[vx - 3, vy], [vx + 3, vy], [76, 88], [20, 88]], (x, y) => 0.05 + (y - vy) / 52 * 0.12);
  for (let i = 0; i < 9; i++) {
    const t = Math.pow(i / 8, 1.6), y = vy + 2 + t * 50, lit = 0.08 + t * 0.42, th = 1 + t * 3;
    const el = vx - 3 - (vx - 3 - 20) * (y - vy) / 52, er = vx + 3 + (76 - vx - 3) * (y - vy) / 52;
    F.rect(el - 8 - t * 44, y, 6 + t * 44, th, lit); F.rect(el - 8 - t * 44, y + th, 6 + t * 44, Math.max(1, th * 0.6), lit * 0.4);
    F.rect(er + 2, y, 6 + t * 44, th, lit); F.rect(er + 2, y + th, 6 + t * 44, Math.max(1, th * 0.6), lit * 0.4);
  }
  for (const t of [0.25, 0.55, 0.9]) { F.rect(vx - 10 - t * 50, vy - 30 * t - 6, 1 + t * 4, 90, 0.08 + t * 0.12); F.rect(vx + 9 + t * 50, vy - 30 * t - 6, 1 + t * 4, 90, 0.08 + t * 0.12); }
  // o rosto, colado na lente, estourado pelo flash e fora de foco
  const fx = 102, fy = 54;
  F.ell(fx, fy, 38, 52, 0.02);
  F.ell(fx, fy, 26, 34, (x, y) => 0.98 - (Math.abs(x - fx) / 26) ** 2 * 0.22 - (Math.abs(y - fy) / 34) ** 2 * 0.16);
  F.ell(fx - 10, fy - 7, 5.5, 4, 0.02); F.ell(fx + 10, fy - 7, 5.5, 4, 0.02);
  F.line(fx, fy - 4, fx - 1, fy + 6, 0.8); F.px(fx - 2, fy + 7, 0.45); F.px(fx + 2, fy + 7, 0.45);
  F.ell(fx, fy + 17, 5, 1.6, 0.14);
  F.blur(64, 0, 135, 87, 2);
  return framed(develop(F, GRAY, { grain: 0.14, vignette: 0.7, seed: 16 }), 4, { col: [236, 234, 226], seed: 10 });
}

// ---------- fotos de jornal (retícula) ----------
function sheep(F, x, y, dir) {
  F.line(x - 3, y + 3, x - 6, y + 7, 0.22); F.line(x - 1, y + 3, x - 2, y + 7, 0.22);
  F.line(x + 2, y + 3, x + 4, y + 7, 0.22); F.line(x + 4, y + 2, x + 8, y + 5, 0.22);
  F.ell(x, y, 7, 3.8, 0.95);
  F.ell(x + dir * 7, y + 1.5, 2.2, 1.6, 0.3);
  F.ell(x + dir * 5, y + 0.5, 1.2, 1, 0.15);
}

function newsOvelhas() {
  const F = new Film(96, 56), R = rnd(31);
  F.grad(0, 24, 0.9, 0.82);
  for (const x of [6, 18, 30, 50, 66, 80, 92]) araucaria(F, x, 8 + R() * 4, 26, 5 + R() * 3, 0.52 + R() * 0.08, R);
  F.rect(0, 24, 96, 32, (x, y) => 0.7 - (y - 24) * 0.004 + R() * 0.1);
  for (let i = 0; i < 7; i++) F.rect(4 + i * 15, 21 + i * 0.3, 1.5, 12, 0.22);
  F.line(0, 24, 96, 23, 0.32); F.line(0, 28, 96, 27, 0.32);
  sheep(F, 24, 42, 1); sheep(F, 56, 37, -1); sheep(F, 74, 48, 1);
  folk(F, 88, 30, 'man', 2.2, R);
  return develop(F, NEWS, { halftone: true, seed: 32 });
}

function newsFabrica() {
  const F = new Film(96, 56), R = rnd(83);
  F.grad(0, 30, 0.86, 0.92);
  // fumaça subindo do telhado que caiu
  for (let i = 0; i < 6; i++) F.ell(46 + i * 4 + R() * 3, 20 - i * 4, 6 + i * 2, 4 + i, (x, y, o) => Math.min(o, 0.5 + i * 0.05 + R() * 0.06));
  F.rect(0, 46, 96, 10, () => 0.78 + R() * 0.1);
  // pavilhão de tijolo, telhado em dente de serra
  F.rect(8, 26, 80, 21, (x, y) => (y % 3 === 0 ? 0.48 : 0.6 + R() * 0.05));
  for (let i = 0; i < 6; i++) {
    const x = 8 + i * 13.3;
    if (i === 2 || i === 3) { F.poly([[x, 26], [x + 5, 22], [x + 9, 26]], 0.1); F.line(x + 2, 26, x + 9, 19, 0.1); continue; }
    F.poly([[x, 26], [x + 13.3, 26], [x + 13.3, 17]], 0.42);
  }
  F.rect(8, 26, 80, 3, (x, y) => (x > 32 && x < 62 ? 0.08 : 0.3));
  for (let i = 0; i < 7; i++) { F.rect(11 + i * 11, 32, 6, 7, 0.06); F.rect(11 + i * 11, 28, 6, 4, (x, y, o) => o * 0.45); }
  F.rect(70, 37, 9, 10, 0.05);
  for (const x of [18, 24, 86]) folk(F, x, 41, 'man', 1.7, R);
  return develop(F, NEWS, { halftone: true, seed: 84 });
}

// ---------- fotos coloridas dos cartazes ----------
function fotoMimi() {
  const P = new Pix(56, 44), R = rnd(5);
  P.rect(0, 0, 56, 44, (x, y) => shade([128, 62, 48], 0.85 + R() * 0.12 - (y < 26 ? 0 : 0.08)));
  P.rect(0, 26, 56, 1, [96, 44, 36]);
  P.ell(28, 39, 23, 7, (x, y) => ((x + y) % 3 === 0 ? [200, 196, 184] : [238, 234, 222]));
  const gray = (cx, cy, ry) => (x, y) => shade([132, 132, 140], 1.12 - (y - cy) / ry * 0.18 + (R() - 0.5) * 0.08);
  P.ell(41, 37, 9, 3, [96, 96, 104]);
  P.ell(28, 28, 11, 11, gray(28, 28, 11));
  P.ell(28, 31, 5, 7, [176, 176, 182]);
  P.poly([[19, 13], [21, 3], [27, 9]], [120, 120, 128]); P.poly([[29, 9], [35, 3], [37, 13]], [120, 120, 128]);
  P.poly([[21, 11], [22, 6], [25, 9]], [210, 150, 150]); P.poly([[31, 9], [34, 6], [35, 11]], [210, 150, 150]);
  P.ell(28, 15, 8.5, 7.5, gray(28, 15, 7.5));
  for (const sx of [26, 28, 30]) P.rect(sx, 8, 1, 3, [92, 92, 100]);
  P.rect(22, 14, 4, 2, [96, 176, 84]); P.rect(30, 14, 4, 2, [96, 176, 84]);
  P.rect(23, 14, 1, 2, [12, 12, 12]); P.rect(32, 14, 1, 2, [12, 12, 12]);
  P.px(22, 14, [230, 255, 220]); P.px(30, 14, [230, 255, 220]);
  P.rect(27, 18, 2, 1, [220, 140, 150]); P.px(27, 19, [60, 50, 50]); P.px(28, 19, [60, 50, 50]);
  for (const [a, b] of [[18, 17], [18, 20]]) { P.line(21, 18, 13, a, [228, 228, 228, 200]); P.line(35, 18, 43, b, [228, 228, 228, 200]); }
  P.ell(23, 38, 3, 2, [176, 176, 182]); P.ell(33, 38, 3, 2, [176, 176, 182]);
  return framed(P.done(), 3, { col: [240, 238, 232], tape: true, seed: 2 });
}

function fotoBoris() {
  const P = new Pix(56, 44), R = rnd(9);
  P.rect(0, 0, 56, 26, (x, y) => shade(x % 7 === 0 ? [96, 70, 44] : [150, 112, 72], 0.9 + R() * 0.12));
  P.rect(0, 26, 56, 18, () => shade([72, 112, 52], 0.85 + R() * 0.25));
  const black = (cx, cy, ry) => (x, y) => shade([34, 30, 32], 1.25 - (y - cy) / ry * 0.3 + (R() - 0.5) * 0.15);
  P.ell(30, 31, 12, 11, black(30, 31, 11));
  P.rect(23, 32, 4, 10, [26, 24, 26]); P.rect(32, 32, 4, 10, [26, 24, 26]);
  P.rect(22, 41, 6, 2, [44, 40, 40]); P.rect(31, 41, 6, 2, [44, 40, 40]);
  P.ell(20, 15, 3, 6.5, [20, 18, 20]); P.ell(37, 15, 3, 6.5, [20, 18, 20]);
  P.ell(28.5, 14, 8, 7, black(28, 14, 7));
  P.ell(28.5, 19, 4.5, 3, [48, 42, 40]);
  P.rect(27, 16, 3, 2, [8, 8, 8]); P.px(28, 16, [120, 120, 120]);
  P.ell(29, 22.5, 1.6, 2, [214, 104, 116]);
  P.px(24, 12, [130, 86, 40]); P.px(32, 12, [130, 86, 40]); P.px(24, 11, [220, 220, 220]); P.px(32, 11, [220, 220, 220]);
  P.rect(21, 23, 16, 2, [192, 28, 24]); P.rect(28, 25, 2, 2, [214, 188, 92]);
  for (let i = 0; i < 9; i++) P.rect(37 + i * 2, 24 + i * 1.6, 1, 1, [170, 170, 176]);
  return framed(P.done(), 3, { col: [240, 238, 232], tape: true, seed: 4 });
}

// ---------- impressos e esboços ----------
// batata de chapéu tirolês, do panfleto da festa (impresso numa cor só)
function batata() {
  const P = new Pix(36, 36), ink = [30, 24, 14];
  P.ell(18, 21, 12, 10, [0, 0, 0, 0]);
  for (let a = 0; a < 6.3; a += 0.03) { const r = 1 + Math.sin(a * 3) * 0.07 + Math.sin(a * 5 + 1) * 0.05; P.px(18 + Math.cos(a) * 12 * r, 22 + Math.sin(a) * 10 * r, ink); }
  for (const [x, y] of [[10, 26], [25, 29], [27, 17], [12, 18]]) P.px(x, y, ink);
  for (let y = 24; y < 31; y++) for (let x = 20; x < 30; x++) if ((x + y) % 3 === 0 && (x - 18) ** 2 / 144 + (y - 22) ** 2 / 100 < 0.9) P.px(x, y, ink);
  P.rect(14, 19, 2, 2, ink); P.rect(21, 19, 2, 2, ink);
  for (let x = 14; x <= 22; x++) P.px(x, 24 + Math.round(Math.sin((x - 14) / 8 * Math.PI) * 1.5), ink);
  P.rect(9, 11, 18, 2, ink); P.poly([[12, 11], [24, 11], [22, 4], [14, 4]], ink); P.rect(13, 9, 10, 1, [236, 220, 160]);
  P.line(23, 6, 29, 0, ink); P.line(24, 6, 30, 1, ink);
  return P.done();
}

// o bicho do cartaz de PROCURA-SE, num quadro
function chupa() {
  const c = canvas(44, 48), g = c.getContext('2d');
  g.fillStyle = '#c8bc98'; g.fillRect(0, 0, 44, 48);
  g.fillStyle = '#4a3a28'; g.fillRect(0, 0, 44, 1); g.fillRect(0, 47, 44, 1); g.fillRect(0, 0, 1, 48); g.fillRect(43, 0, 1, 48);
  chupaSketch(g, -12, -17);
  return c;
}

// tinta de pena: os olhos embaixo do pano (diário do Pastor Wendt)
function olhos() {
  const P = new Pix(64, 26), ink = [62, 38, 22, 230];
  const inEye = (x, y) => [[22, 14], [40, 14]].some(([cx, cy]) => Math.abs(x - cx) < 7 && Math.abs(y - cy) < Math.sin((1 - Math.abs(x - cx) / 7) * Math.PI / 2) * 3.4);
  for (let x = 3; x < 61; x++) P.px(x, 5 + Math.round(Math.sin(x * 0.35) * 1.2), ink);
  P.line(3, 5, 1, 24, ink); P.line(61, 6, 63, 24, ink);
  for (let y = 7; y < 24; y++) for (let x = 4; x < 61; x++) if ((x + y) % 3 === 0 && !inEye(x, y)) P.px(x, y, [62, 38, 22, 150]);
  for (const cx of [22, 40]) {
    for (let t = 0; t <= 14; t++) { const x = cx - 7 + t, dy = Math.sin(t / 14 * Math.PI) * 3.4; P.px(x, 14 - dy, ink); P.px(x, 14 + dy, ink); }
    P.rect(cx, 11, 1, 6, ink); P.px(cx - 1, 13, ink); P.px(cx + 1, 14, ink);
  }
  return P.done();
}

// arruda, alecrim e guiné, desenhadas na receita
function ervas() {
  const P = new Pix(72, 30), ink = [70, 44, 26, 230];
  P.line(12, 29, 13, 4, ink);
  for (let y = 6; y < 26; y += 4) { P.ell(9, y + 1, 1.6, 1.1, ink); P.ell(16, y, 1.6, 1.1, ink); }
  P.line(36, 29, 36, 3, ink);
  for (let y = 4; y < 27; y += 2) { P.line(36, y, 33, y - 2, ink); P.line(36, y, 39, y - 2, ink); }
  P.line(60, 29, 58, 5, ink);
  for (let y = 8; y < 26; y += 5) { P.line(59, y + 2, 52, y - 3, ink); P.line(59, y + 4, 67, y - 1, ink); }
  return P.done();
}

// a cruz de ferro, desenhada no diário
function cruz() {
  const P = new Pix(36, 44), ink = [58, 36, 20, 235], hatch = [58, 36, 20, 140];
  const body = (x, y) => (x >= 15 && x <= 20 && y >= 4 && y <= 41) || (y >= 13 && y <= 18 && x >= 5 && x <= 30);
  for (let y = 0; y < 44; y++) for (let x = 0; x < 36; x++) {
    if (!body(x, y)) continue;
    const edge = !body(x - 1, y) || !body(x + 1, y) || !body(x, y - 1) || !body(x, y + 1);
    if (edge) P.px(x, y, ink); else if ((x - y) % 3 === 0) P.px(x, y, hatch);
  }
  for (let a = 0; a < 6.3; a += 0.12) P.px(17.5 + Math.cos(a) * 7, 15.5 + Math.sin(a) * 7, ink);
  for (const [x, y] of [[17.5, 3], [17.5, 42], [4, 15.5], [31, 15.5]]) for (let a = 0; a < 6.3; a += 0.4) P.px(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, ink);
  return P.done();
}

// a pegada que o Joãozinho desenhou na redação (lápis)
function pegada() {
  const P = new Pix(30, 30), R = rnd(4), lead = () => [78, 78, 86, 150 + R() * 90];
  P.ell(15, 22, 6, 5, (x, y) => ((x + y) % 2 === 0 || R() < 0.4 ? lead() : null));
  for (const [x1, y1] of [[15, 4], [6, 8], [24, 8]]) { P.line(15, 18, x1, y1, lead(), 2); P.line(x1, y1, x1 + (x1 - 15) * 0.15, y1 - 3, [40, 40, 46, 255]); }
  return P.done();
}

// selo e o carimbo de obliteração (envelope da carta)
function selo() {
  const P = new Pix(54, 28), R = rnd(8);
  P.rect(32, 2, 20, 24, [238, 232, 218]);
  for (let x = 32; x < 52; x++) { if (x % 2 === 0) { P.clear(x, 2); P.clear(x, 25); } }
  for (let y = 2; y < 26; y++) { if (y % 2 === 0) { P.clear(32, y); P.clear(51, y); } }
  P.rect(35, 5, 14, 15, (x, y) => [150 + R() * 10, 186, 214]);
  P.rect(35, 16, 14, 4, [84, 130, 62]);
  P.line(42, 8, 42, 18, [70, 46, 30]);
  for (let t = 0; t < 3; t++) for (let dx = -4 + t; dx <= 4 - t; dx++) P.px(42 + dx, 9 + t * 2 - (dx * dx) / 6, [40, 92, 46]);
  P.rect(36, 21, 6, 2, [60, 40, 40]); P.rect(44, 21, 4, 2, [60, 40, 40]);
  for (const y0 of [8, 12, 16]) for (let x = 0; x < 48; x++) P.px(x, y0 + Math.round(Math.sin(x * 0.45) * 1.2), [30, 28, 40, 200]);
  return P.done();
}

// ---------- desenho a giz de cera ----------
function desenho() {
  const P = new Pix(176, 116), R = rnd(77);
  const C = { green: [70, 150, 60], dgreen: [30, 96, 44], brown: [124, 72, 32], black: [26, 24, 30], red: [214, 32, 30], gray: [134, 134, 146], yellow: [240, 200, 40], blue: [44, 52, 150], white: [246, 246, 240] };
  const jit = c => [c[0] + (R() - 0.5) * 24, c[1] + (R() - 0.5) * 24, c[2] + (R() - 0.5) * 24];
  const line = (x0, y0, x1, y1, c, w = 2) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.4) || 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      for (let j = 0; j < w; j++) for (let k = 0; k < w; k++) if (R() < 0.78) P.px(x + j - w / 2, y + k - w / 2, jit(c));
    }
  };
  const path = (pts, c, w) => { for (let i = 0; i + 1 < pts.length; i++) line(...pts[i], ...pts[i + 1], c, w); };
  // risco de giz: listras na diagonal, com falhas
  const fill = (inside, x0, y0, x1, y1, c, dens = 0.65) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inside(x, y) && R() < dens && ((x + y) % 3 !== 0 || R() < 0.3)) P.px(x, y, jit(c));
  };
  const circ = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  // céu de noite e a lua
  fill((x, y) => y < 16 + Math.sin(x * 0.1) * 3, 0, 0, 176, 22, C.blue, 0.42);
  fill(circ(152, 13, 8), 142, 3, 162, 23, C.yellow, 0.85);
  // chão
  fill((x, y) => y > 98 + Math.sin(x * 0.15) * 2, 0, 92, 176, 116, C.green, 0.66);
  // a igreja com uma cruz grande
  fill((x, y) => x > 9 && x < 37 && y > 57 && y < 99, 8, 56, 38, 100, C.gray, 0.3);
  path([[9, 99], [9, 57], [37, 57], [37, 99]], C.gray);
  path([[6, 58], [23, 40], [40, 58]], C.brown);
  line(23, 41, 23, 12, C.black, 3); line(13, 21, 33, 21, C.black, 3);
  path([[19, 99], [19, 83], [27, 83], [27, 99]], C.brown);
  for (let a = 0; a < 6.3; a += 0.3) P.px(23 + Math.cos(a) * 3, 68 + Math.sin(a) * 3, jit(C.brown));
  // o galinheiro, com uma galinha dentro e outra caída
  path([[46, 99], [46, 76], [74, 76], [74, 99]], C.brown);
  path([[43, 77], [60, 65], [77, 77]], C.brown);
  for (let x = 50; x < 74; x += 4) line(x, 77, x, 98, C.gray, 1);
  for (let y = 80; y < 98; y += 4) line(47, y, 73, y, C.gray, 1);
  fill(circ(60, 91, 3.5), 55, 86, 66, 96, C.white, 1); P.rect(60, 86, 2, 2, C.red);
  fill(circ(84, 100, 3), 80, 96, 89, 104, C.white, 1);
  for (const [x, y] of [[80, 103], [88, 98], [86, 104]]) P.rect(x, y, 2, 1, C.red);
  // o mato
  for (const x of [130, 150, 168]) {
    line(x, 99, x, 50, C.brown, 2);
    for (let t = 0; t < 3; t++) { const y = 52 + t * 8, h = 12 - t * 2; path([[x - h, y - 4], [x - h / 2, y], [x + h / 2, y], [x + h, y - 4]], C.dgreen, 2); }
  }
  // o bicho: preto, espinhos nas costas, olhos vermelhos
  fill((x, y) => ((x - 98) / 8) ** 2 + ((y - 80) / 11) ** 2 < 1, 88, 68, 108, 92, C.black, 0.85);
  fill(circ(92, 64, 6), 85, 57, 99, 71, C.black, 0.85);
  path([[95, 57], [99, 58], [99, 62], [103, 63], [102, 67], [107, 69], [105, 73], [110, 76], [107, 80]], C.black, 2);
  path([[101, 89], [104, 97], [111, 98]], C.black, 2); path([[95, 90], [94, 98], [99, 99]], C.black, 2);
  line(91, 75, 86, 84, C.black, 2);
  fill(circ(89, 63, 2.2), 86, 60, 92, 66, C.red, 1); fill(circ(95, 63, 2.2), 92, 60, 98, 66, C.red, 1);
  // a moça do mato, bem comprida, de vestido preto, segurando o bicho pela mão
  fill((x, y) => y > 37 && y < 99 && Math.abs(x - 124) < 3 + (y - 37) * 0.2, 108, 36, 140, 100, C.black, 0.78);
  for (let a = 0; a < 6.3; a += 0.25) P.px(124 + Math.cos(a) * 5, 30 + Math.sin(a) * 5.5, jit(C.black));
  line(120, 27, 116, 48, C.black, 2); line(128, 27, 132, 48, C.black, 2);
  P.rect(121, 29, 2, 2, C.black); P.rect(126, 29, 2, 2, C.black);
  line(121, 33, 127, 33, C.red, 1);
  path([[119, 42], [112, 58], [104, 70]], C.black, 2);
  path([[98, 74], [104, 70]], C.black, 2);
  path([[129, 42], [136, 66]], C.black, 2);
  return P.done();
}

const ART = {
  foto1910, album1910, album1935, album1957, album1983, albumNoite,
  newsOvelhas, newsFabrica, fotoMimi, fotoBoris,
  batata, chupa, olhos, ervas, cruz, pegada, selo, desenho,
};

const cache = new Map();
export function docArt(name) {
  if (!cache.has(name)) cache.set(name, ART[name] ? ART[name]() : null);
  return cache.get(name);
}
