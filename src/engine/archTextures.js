import { TEX, makeCanvas, canvasTex, processPixels } from './textures.js';

// Detalhes de arquitetura desenhados pixel a pixel: igreja (janelas ogivais,
// rosácea, portal), enxaimel, janelas, venezianas, portas, vitrines e janelas
// industriais. Pedra, reboco e madeira vêm das texturas da pasta; só a
// forma é desenhada aqui, sem recortes de fotos.

// lê uma textura já reduzida para amostrar com repetição; swap = veio na horizontal
export function sampler(name, scale = 1, swap = false) {
  const c = TEX[name].image, w = c.width, h = c.height;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  return (x, y) => {
    if (swap) [x, y] = [y, x];
    const u = ((Math.floor(x * scale) % w) + w) % w, v = ((Math.floor(y * scale) % h) + h) % h;
    const i = (v * w + u) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
}

export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const tint = (c, t) => [c[0] * t[0], c[1] * t[1], c[2] * t[2]];

// f(x, y) devolve [r, g, b] ou null (transparente)
export function paint(w, h, f) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), p = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y), i = (y * w + x) * 4;
    if (v) { p[i] = v[0]; p[i + 1] = v[1]; p[i + 2] = v[2]; p[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export const finish = (c, alpha) => canvasTex(processPixels(c, alpha ? { alpha: true } : {}), !alpha);

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

  // ---- janelas: moldura de reboco, caixilho recuado, vidro com reflexo e peitoril ----
  const trim = (x, y, k = 1) => mul(tint(plWhite(x, y), [1.04, 1.02, 0.98]), k);
  const woodG = sampler('woodGray'), plank = sampler('woodPlank');
  const windowTex = o => {
    const bar = (x, y) => x < 4 || x > 59 || y < 4 || y > 55 || o.bars(x, y);
    return finish(paint(64, 64, (x, y) => {
      if (y >= 56) return trim(x, y, y === 56 ? 1.28 : y === 63 ? 0.68 : 1); // peitoril
      if (x < 4 || x > 59 || y < 4) return trim(x, y, x === 0 || y === 0 ? 1.15 : x === 63 ? 0.8 : 1.02);
      if (bar(x, y)) {
        if (x === 4 || y === 4) return mul(o.frame(x, y), 0.55); // sombra do recuo
        const lit = !bar(x, y - 1) || !bar(x - 1, y), dark = !bar(x, y + 1) || !bar(x + 1, y);
        return mul(o.frame(x, y), lit && !dark ? 1.15 : dark && !lit ? 0.78 : 1);
      }
      const gy = y / 56;
      let c = [150 - gy * 104, 146 - gy * 98, 152 - gy * 92]; // céu refletido, escurece para baixo
      if (o.curtain?.(x, y)) c = mul([204, 190, 152], x % 3 === 0 ? 0.8 : 1);
      else if (o.blinds?.(x, y)) c = y % 3 === 0 ? [118, 116, 110] : [178, 176, 168];
      const r = (((x + Math.floor(y * 0.8)) % 41) + 41) % 41;
      if (r < 5) c = c.map(v => v + 40); else if (r < 7) c = c.map(v => v + 16);
      return bar(x, y - 1) || bar(x, y - 2) ? mul(c, 0.68) : c; // sombra sob o caixilho
    }), false);
  };
  const leafEdge = (x, y) => (x >= 8 && x <= 12) || (x >= 51 && x <= 55);
  // colonial: caixilho pintado de branco, duas folhas de seis vidros, cortina
  TEX.window1 = windowTex({
    frame: (x, y) => mul([226, 224, 216], 0.9 + 0.1 * woodG(x, y)[0] / 200),
    bars: (x, y) => x <= 7 || x >= 56 || y <= 7 || y >= 52 || (x >= 30 && x <= 33) || x === 18 || x === 19 || x === 44 || x === 45 || y === 22 || y === 23 || y === 37 || y === 38,
    curtain: leafEdge,
  });
  // alumínio: duas folhas de correr com persiana (comércio, hospital, galpões)
  TEX.window2 = windowTex({
    frame: (x, y) => tint(metal(x, y), [0.82, 0.85, 0.88]),
    bars: (x, y) => x <= 6 || x >= 57 || y <= 6 || y >= 53 || x === 31 || x === 32,
    blinds: (x, y) => y < 26,
  });
  // madeira: bandeira em cima e duas folhas de quatro vidros
  TEX.window3 = windowTex({
    frame: (x, y) => mul(plank(x, y), 0.95),
    bars: (x, y) => x <= 7 || x >= 56 || y <= 7 || y >= 52 || (y >= 20 && y <= 22) || (y < 20 ? x === 31 || x === 32 : (x >= 30 && x <= 33) || x === 18 || x === 19 || x === 44 || x === 45 || y === 36 || y === 37),
    curtain: (x, y) => y > 22 && leafEdge(x, y),
  });

  // ---- veneziana: quadro e palhetas (a cor vem da cor do vértice) ----
  TEX.shutter = finish(paint(32, 64, (x, y) => {
    const base = mul([214, 212, 204], 0.88 + 0.12 * woodG(x, y)[0] / 160);
    if (x < 3 || x > 28 || y < 3 || y > 60 || (y >= 30 && y <= 32)) return mul(base, x === 0 || y === 0 ? 1.12 : x === 31 || y === 63 ? 0.78 : 1);
    return mul(base, [1.12, 0.92, 0.92, 0.6][y % 4]);
  }), false);

  // ---- porta: batente, bandeira de vidro com grade, quatro almofadas ----
  TEX.door = finish(paint(32, 64, (x, y) => {
    if (x < 2 || x > 29 || y < 2) return trim(x, y, x === 0 || y === 0 ? 1.15 : 0.95);
    if (x === 2 || y === 2) return mul(wood(x, y), 0.45);
    const c = wood(x, y);
    if (y >= 5 && y <= 16 && x >= 6 && x <= 25) {
      if (x % 5 === 0) return [40, 38, 36];
      const g = [126 - y * 3, 122 - y * 3, 128 - y * 2];
      return (x + y) % 9 < 2 ? g.map(v => v + 40) : g;
    }
    for (const [x0, x1, y0, y1] of [[6, 14, 20, 38], [17, 25, 20, 38], [6, 14, 42, 59], [17, 25, 42, 59]]) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return mul(c, x === x0 || y === y0 ? 1.25 : x === x1 || y === y1 ? 0.6 : 1.08);
    }
    if ((x === 25 || x === 26) && (y === 40 || y === 41)) return [200, 164, 80]; // maçaneta
    return y === 63 ? mul(c, 0.6) : c;
  }), false);

  // ---- porta de enrolar: perfis de chapa ----
  const mg = sampler('metalGray');
  TEX.rollDoor = finish(paint(32, 32, (x, y) => mul([150, 154, 156], (0.8 + 0.2 * mg(x, y)[0] / 160) * [1.2, 1.0, 0.92, 0.68][y % 4])), false);

  // ---- janela industrial: grade de aço com vidro aramado e basculantes abertas ----
  const conc = sampler('concrete');
  TEX.winFactory = finish(paint(64, 32, (x, y) => {
    if (y <= 1 || y >= 30) return mul(conc(x, y), y === 0 || y === 30 ? 1.15 : 0.85);
    if (x % 8 === 0 || y % 7 === 2) return mul([92, 100, 98], x % 8 === 0 ? 1 : 1.12);
    const h = ((Math.floor(x / 8) + Math.floor((y - 2) / 7) * 8) * 2654435761) >>> 0;
    if ((h >>> 5) % 13 === 0) return [52, 56, 58]; // basculante aberta
    const c = [168 - y * 1.6, 178 - y * 1.6, 172 - y * 1.4]; // vidro aramado, mais claro em cima
    return (x + y) % 4 === 0 ? mul(c, 0.92) : c;
  }), false);

  // ---- orelhão: cúpula de fibra laranja e aparelho com teclado ----
  TEX.orelhaoShell = finish(paint(32, 32, (x, y) => {
    const k = y >= 29 ? 0.7 : 1.08 - y * 0.008 - (x % 8 === 0 ? 0.05 : 0); // borda escura embaixo, gomos
    const n = ((x * 29 + y * 53) % 5) - 2;
    return [232 * k + n, 118 * k + n, 28 * k];
  }), false);
  TEX.orelhaoPhone = finish(paint(32, 64, (x, y) => {
    const body = [168, 34, 30];
    if (x < 2 || x > 29 || y < 2 || y > 61) return mul(body, x === 0 || y === 0 ? 1.2 : 0.75);
    if (x >= 3 && x <= 8 && y >= 6 && y <= 52) return (x === 3 || y === 6 || y === 52) ? [60, 60, 62] : [22, 22, 24]; // monofone
    if (x >= 11 && x <= 27 && y >= 6 && y <= 13) return (x === 11 || x === 27 || y === 6 || y === 13) ? [40, 40, 42] : [120, 150, 100]; // visor
    if (x >= 13 && x <= 25 && y >= 16 && y <= 17) return [20, 20, 20]; // entrada do cartão
    const kx = x - 12, ky = y - 22;
    if (kx >= 0 && kx < 15 && ky >= 0 && ky < 24) { // teclado 3x4
      const bx = kx % 5, by = ky % 6;
      if (bx < 4 && by < 4) return by === 0 || bx === 0 ? [226, 226, 230] : [176, 178, 184];
      return mul(body, 0.8);
    }
    return mul(body, y < 4 ? 1.1 : 1);
  }), false);

  // ---- bomba de combustível: faixa da bandeira, visor, etiquetas, bicos e mangueiras ----
  const DIG = { 0: '111101101101111', 1: '010110010010111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 7: '111001001001001', 9: '111101111001111' };
  const digits = (x, y, x0, y0, str) => {
    const i = Math.floor((x - x0) / 4), gx = (x - x0) % 4, gy = y - y0;
    return i >= 0 && i < str.length && gx < 3 && gy >= 0 && gy < 5 && DIG[str[i]][gy * 3 + gx] === '1';
  };
  TEX.pump = finish(paint(32, 64, (x, y) => {
    const white = [222, 222, 218];
    if (y < 9) return y === 8 ? [120, 20, 18] : [196, 30, 26];
    if (x === 0 || x === 31) return mul(white, 0.8);
    if (x >= 5 && x <= 26 && y >= 12 && y <= 27) { // visor: preço e litros
      if (x === 5 || x === 26 || y === 12 || y === 27) return [60, 60, 64];
      if (digits(x, y, 9, 14, '479') || digits(x, y, 9, 21, '350')) return [240, 170, 40];
      return [24, 26, 24];
    }
    if (y >= 30 && y <= 33 && ((x >= 6 && x <= 13) || (x >= 18 && x <= 25))) return x < 16 ? [230, 190, 40] : [40, 150, 70]; // etiquetas
    for (const [h0, h1] of [[4, 9], [22, 27]]) { // bicos e mangueiras
      if (x >= h0 && x <= h1 && y >= 37 && y <= 44) return x === h0 || y === 37 ? [70, 70, 74] : [30, 30, 32];
      const hx = h0 + 2 + Math.round(Math.sin((y - 45) * 0.25) * 2);
      if (y > 44 && y < 58 && (x === hx || x === hx + 1)) return [18, 18, 18];
    }
    if (y >= 58) return mul([150, 152, 156], y === 58 ? 1.2 : 1);
    return white;
  }), false);
}
