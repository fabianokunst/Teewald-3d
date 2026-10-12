import { TEX, makeCanvas, canvasTex, processPixels } from './textures.js';

// Detalhes de arquitetura desenhados pixel a pixel (janelas ogivais, rosácea,
// portal, enxaimel, vitrine). Pedra, reboco e madeira vêm das texturas da pasta; só a
// forma é desenhada aqui, sem recortes de fotos.

// lê uma textura já reduzida para amostrar com repetição; swap = veio na horizontal
function sampler(name, scale = 1, swap = false) {
  const c = TEX[name].image, w = c.width, h = c.height;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  return (x, y) => {
    if (swap) [x, y] = [y, x];
    const u = ((Math.floor(x * scale) % w) + w) % w, v = ((Math.floor(y * scale) % h) + h) % h;
    const i = (v * w + u) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
}

const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const tint = (c, t) => [c[0] * t[0], c[1] * t[1], c[2] * t[2]];

// f(x, y) devolve [r, g, b] ou null (transparente)
function paint(w, h, f) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), p = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y), i = (y * w + x) * 4;
    if (v) { p[i] = v[0]; p[i + 1] = v[1]; p[i + 2] = v[2]; p[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const finish = (c, alpha) => canvasTex(processPixels(c, alpha ? { alpha: true } : {}), !alpha);

// dentro de um arco ogival equilátero de xl a xr, nascença em ys, recuado i px
function inArch(x, y, xl, xr, ys, i = 0) {
  const px = x + 0.5, py = y + 0.5, w = xr - xl;
  if (px < xl + i || px > xr - i) return false;
  if (py >= ys) return true;
  return Math.hypot(px - xr, py - ys) <= w - i && Math.hypot(px - xl, py - ys) <= w - i;
}

// profundidade em degraus (0 = fora); bands = recuos crescentes
const archDepth = (x, y, a, bands) => {
  let d = 0;
  for (const i of bands) { if (inArch(x, y, a[0], a[1], a[2], i)) d++; else break; }
  return d;
};

// luz de cima/esquerda: no recuo, o lado de cima/esquerda fica na sombra
function stepShade(depthAt, x, y) {
  const a = depthAt(x - 1, y - 1), b = depthAt(x + 1, y + 1);
  return b > a ? 0.74 : a > b ? 1.12 : 1;
}

// vitral visto de fora: losangos com chumbo e reflexo
const GLASS = [[40, 52, 92], [52, 70, 112], [40, 52, 92], [52, 70, 112], [112, 44, 44], [150, 114, 54], [48, 80, 64]];
function glass(x, y, pal = GLASS) {
  if ((x + y) % 5 === 0 || (x - y + 1000) % 5 === 0) return [30, 28, 30];
  const a = Math.floor((x + y) / 5), b = Math.floor((x - y + 1000) / 5);
  const h = ((a * 374761393 + b * 668265263) ^ (a * b * 1274126177)) >>> 0;
  const c = pal[(h >>> 7) % pal.length];
  return (x * 2 + y) % 23 < 2 ? mul(c, 1.4) : c;
}

const circ = (x, y, cx, cy) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy);

export function makeArchTextures() {
  const pink = sampler('plPink'), cream = sampler('plChurch'), wood = sampler('woodDark'), woodH = sampler('woodDark', 1, true);
  const granite = sampler('granite');
  const PINK = [1.0, 0.82, 0.74], CREAM = [1.02, 0.97, 0.88];
  const pinkAt = (x, y, k = 1) => mul(tint(pink(x, y), PINK), k);
  const creamAt = (x, y, k = 1) => mul(tint(cream(x, y), CREAM), k);

  // ---- janela ogival da nave: moldura em dois degraus, duas lancetas e óculo ----
  TEX.chLancet = finish(paint(32, 96, (x, y) => {
    const A = [0, 32, 30], dep = (i, j) => archDepth(i, j, A, [0, 2, 4]);
    const d = dep(x, y);
    if (d === 0) return null;
    if (y >= 92) return pinkAt(x, y, y === 92 ? 1.25 : 1.05); // peitoril
    if (d === 1) return pinkAt(x, y, dep(x - 1, y - 1) === 0 ? 1.15 : 1);
    if (d === 2) return pinkAt(x, y, stepShade(dep, x, y) * 0.92);
    // rendilhado: duas lancetas e um óculo
    const lightAt = (i, j) => inArch(i, j, 4, 15, 40) || inArch(i, j, 17, 28, 40) || circ(i, j, 16, 22) < 3.6;
    if (lightAt(x, y)) {
      const shadow = !lightAt(x - 1, y) || !lightAt(x, y - 1);
      return mul(circ(x, y, 16, 22) < 3.6 ? glass(x, y, [[168, 126, 56], [132, 48, 46]]) : glass(x, y), shadow ? 0.6 : 1);
    }
    return creamAt(x, y, 0.88);
  }), true);

  // ---- aberturas do campanário: duas lancetas com venezianas de madeira ----
  TEX.chTowerWin = finish(paint(32, 64, (x, y) => {
    const A = [0, 32, 28], dep = (i, j) => archDepth(i, j, A, [0, 2, 4]);
    const d = dep(x, y);
    if (d === 0) return null;
    if (y >= 61) return pinkAt(x, y, y === 61 ? 1.25 : 1.05);
    if (d === 1) return pinkAt(x, y, dep(x - 1, y - 1) === 0 ? 1.15 : 1);
    if (d === 2) return pinkAt(x, y, stepShade(dep, x, y) * 0.92);
    const lightAt = (i, j) => inArch(i, j, 4, 15, 30) || inArch(i, j, 17, 28, 30);
    if (lightAt(x, y)) {
      const top = !lightAt(x, y - 1) || !lightAt(x, y - 2);
      const r = y % 4;
      const c = r === 0 ? mul(wood(x, y), 1.5) : r === 1 ? mul(wood(x, y), 0.9) : [26, 22, 20];
      return mul(c, top ? 0.55 : 1);
    }
    if (circ(x, y, 16, 14) < 2.8) return [24, 20, 20]; // óculo vazado
    return creamAt(x, y, circ(x, y, 16, 14) < 4 ? 1.05 : 0.88);
  }), true);

  // ---- rosácea: anel de pedra, raios, pétalas e vitral ----
  TEX.chRose = finish(paint(64, 64, (x, y) => {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32, r = Math.hypot(dx, dy);
    if (r > 31.5) return null;
    if (r > 29) return pinkAt(x, y, 1 - 0.14 * (dx + dy) / r);
    if (r > 26) return pinkAt(x, y, 0.92 + 0.22 * (dx + dy) / (r * 1.41));
    const N = 12, a = Math.atan2(dy, dx), step = Math.PI * 2 / N;
    const stone = (px, py) => {
      const ex = px + 0.5 - 32, ey = py + 0.5 - 32, rr = Math.hypot(ex, ey), aa = Math.atan2(ey, ex);
      if (rr > 26) return true;
      if (rr <= 5.2) return rr > 3.8;
      const k = Math.round(aa / step);
      if (rr * Math.abs(Math.sin(aa - k * step)) <= 0.9) return true; // raio
      const m = Math.floor(aa / step) * step + step / 2;
      return Math.abs(Math.hypot(ex - Math.cos(m) * 17, ey - Math.sin(m) * 17) - 5.4) <= 0.8; // pétala
    };
    if (stone(x, y)) return creamAt(x, y, r <= 5.2 ? 1.05 : 0.95);
    if (r < 3.8) return [190, 150, 64];
    const k = ((Math.floor(a / step) % N) + N) % N;
    const m = Math.floor(a / step) * step + step / 2;
    const inPetal = Math.hypot(dx - Math.cos(m) * 17, dy - Math.sin(m) * 17) < 5.4;
    let c = inPetal ? (k % 2 ? [168, 126, 56] : [58, 92, 72]) : (k % 2 ? [52, 70, 120] : [128, 46, 48]);
    if ((x * 2 + y) % 19 < 2) c = mul(c, 1.4);
    return mul(c, stone(x - 1, y - 1) ? 0.6 : 1);
  }), true);

  // ---- portal: arquivoltas em degraus, tímpano com óculo e porta de madeira ----
  TEX.chPortal = finish(paint(64, 128, (x, y) => {
    const A = [0, 64, 62], dep = (i, j) => archDepth(i, j, A, [0, 4, 8, 12]);
    const d = dep(x, y);
    if (d === 0) return null;
    if (d < 4) {
      if (y >= 120) return mul(granite(x, y), y === 120 ? 1.2 : 0.95); // base das colunas
      const k = (y >= 62 && y < 66) ? 1.18 : 1; // capitel
      if (d === 1) return pinkAt(x, y, k * (dep(x - 1, y - 1) === 0 ? 1.15 : 1));
      if (d === 2) return creamAt(x, y, k * stepShade(dep, x, y) * 0.95);
      return pinkAt(x, y, k * stepShade(dep, x, y) * 0.88);
    }
    if (y < 68) { // tímpano
      const r = circ(x, y, 32, 44);
      if (r < 6) return ((x === 31 || x === 32) || (y === 43 || y === 44)) ? creamAt(x, y, 0.9) : glass(x, y);
      if (r < 8) return pinkAt(x, y, 1 - 0.12 * (x + y - 76) / 8);
      return creamAt(x, y, y < 24 || x < 14 ? 0.7 : 0.82);
    }
    if (y < 72) return pinkAt(x, y, y === 68 ? 1.2 : 0.95); // verga
    // porta de duas folhas
    if (x === 31 || x === 32) return [22, 16, 12];
    let c = wood(x, y);
    if ((x - 12) % 5 === 0) c = mul(c, 0.7);
    for (const hy of [80, 100, 118]) {
      if ((y === hy || y === hy + 1) && (x < 26 || x > 37)) c = (x % 3 === 0 && y === hy) ? [92, 88, 84] : [44, 42, 42];
    }
    if ((x === 29 || x === 34) && (y === 97 || y === 98)) c = [176, 140, 66];
    let k = y < 75 ? 0.6 : 1;
    if (x < 15) k *= 0.75;
    return mul(c, k);
  }), true);

  // ---- enxaimel: um vão de janela por andar (a janela entra no meio) ----
  // linhas: frechal no alto, verga sobre a janela, peitoril e baldrame;
  // esteios nas bordas e mãos-francesas ao lado da janela
  const segs = [[15, 60, 2, 12], [48, 60, 61, 12]];
  const distSeg = (px, py, [ax, ay, bx, by]) => {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  };
  const beamAt = (x, y) => {
    if (x < 0 || x > 63 || y < 0 || y > 63) return 'h';
    if (y <= 2 || (y >= 11 && y <= 13) || (y >= 43 && y <= 45) || y >= 61) return 'h';
    if (x <= 1 || x >= 62) return 'v';
    for (const s of segs) if (distSeg(x + 0.5, y + 0.5, s) <= 1.4) return 'd';
    return null;
  };
  const enx = (fill, beam) => finish(paint(64, 64, (x, y) => {
    const b = beamAt(x, y);
    if (b) {
      const c = b === 'h' ? beam(x, y, true) : beam(x, y, false);
      return mul(c, beamAt(x, y + 1) ? 1 : 0.78);
    }
    const ao = beamAt(x, y - 1) || beamAt(x - 1, y) ? 0.8 : 1;
    return mul(fill(x, y), ao);
  }), false);
  const plWhite = sampler('plWhite'), brick = sampler('brickOld', 2);
  const woodBeam = (x, y, h) => h ? woodH(x, y) : wood(x, y);
  const darkBeam = (x, y, h) => tint(woodBeam(x, y, h), [0.72, 0.68, 0.66]);
  const redBeam = (x, y, h) => tint(woodBeam(x, y, h), [1.1, 0.8, 0.68]);
  TEX.enxBranco = enx((x, y) => tint(plWhite(x, y), [1.02, 1.0, 0.95]), darkBeam);
  TEX.enxCreme = enx((x, y) => creamAt(x, y), redBeam);
  TEX.enxTijolo = enx((x, y) => tint(brick(x, y), [1.0, 0.94, 0.9]), darkBeam);

  // ---- vitrine de loja: caixilho de alumínio, prateleiras com produtos e reflexo ----
  const metal = sampler('metalWhite'), shelf = sampler('woodPlank', 1, true);
  const ITEMS = [[170, 60, 50], [200, 160, 70], [70, 130, 80], [70, 100, 150], [210, 200, 180], [150, 80, 120], [220, 120, 60]];
  TEX.shop = finish(paint(64, 32, (x, y) => {
    const mx = x % 21; // três vidros por repetição
    if (y <= 1 || y >= 30 || mx <= 1) return mul(metal(x, y), mx === 1 || y === 1 || y === 30 ? 0.8 : 1.05);
    let c = y >= 25 ? mul(shelf(x, y), 0.5) : [34 + y * 0.4, 38 + y * 0.3, 44]; // balcão e fundo da loja
    for (const sy of [11, 21]) {
      if (y === sy) c = mul(shelf(x, y), 1.1);
      else if (y === sy + 1) c = mul(shelf(x, y), 0.55);
      else if (y < sy && y >= sy - 5 && (x + sy) % 3 !== 2) { // produtos
        const h = (Math.floor((x + sy) / 3) * 2654435761 + sy * 40503) >>> 0;
        if (sy - y <= 2 + (h >>> 3) % 4 && (h >>> 9) % 5) c = mul(ITEMS[(h >>> 13) % ITEMS.length], 0.75);
      }
    }
    const r = (((x - y * 1.3) % 37) + 37) % 37; // reflexo do céu
    return r < 4 ? c.map(v => v + 46) : r < 6 ? c.map(v => v + 20) : c;
  }), false);
}
