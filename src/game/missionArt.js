import { makeCanvas, canvasTex, processPixels } from '../engine/textures.js';
import { FONT_UI } from '../ui/overlay.js';

// Texturas desenhadas pixel a pixel para a missão do chupacabras: pegada de três
// dedos, mancha de sangue, pele escamosa do bicho, cartaz de PROCURA-SE e
// bilhetes do mural da praça. Nada recortado de foto.

const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// texto nítido (alfa binário) desenhado num canvas
function crispText(g, text, x, y, size, color, align = 'center') {
  const m = makeCanvas(g.canvas.width, Math.ceil(size * 1.5) + 2), mg = m.getContext('2d');
  mg.font = `${size}px ${FONT_UI}`;
  mg.textBaseline = 'top';
  mg.textAlign = align;
  mg.fillStyle = color;
  mg.fillText(text, x, 1);
  const d = mg.getImageData(0, 0, m.width, m.height);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
  mg.putImageData(d, 0, 0);
  g.drawImage(m, 0, Math.round(y));
}

// pegada: três dedos com garras para cima (frente), calcanhar embaixo
export function trackTexture() {
  const c = makeCanvas(16, 16), g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const dark = '#20160e', mid = '#3a2a1a', claw = '#0c0806';
  // calcanhar (almofada)
  for (let y = 9; y < 14; y++) for (let x = 5; x < 11; x++) {
    const dx = (x - 7.5) / 3, dy = (y - 11.2) / 2.6;
    if (dx * dx + dy * dy < 1) px(x, y, (x + y) % 3 ? dark : mid);
  }
  // dedos: central reto, laterais abertos
  const toe = (x0, y0, x1, y1) => {
    for (let t = 0; t <= 1; t += 0.12) {
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      px(x, y, dark); px(x + (x1 >= x0 ? 1 : -1) * (t < 0.5 ? 1 : 0), y, mid);
    }
    px(Math.round(x1), Math.round(y1) - 1, claw);
  };
  toe(7.5, 9, 7.5, 2);
  toe(6, 9.5, 2.5, 4);
  toe(9, 9.5, 12.5, 4);
  return canvasTex(processPixels(c, { alpha: true }), false);
}

// barro remexido onde o bicho pisou (marca a trilha sobre as folhas)
export function mudTexture() {
  const c = makeCanvas(16, 16), g = c.getContext('2d'), d = g.createImageData(16, 16), R = rnd(41);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const r = Math.hypot((x - 7.5) / 7.2, (y - 7.5) / 7.6) + Math.sin(x * 1.3 + y * 0.7) * 0.08 + (R() - 0.5) * 0.18;
    const v = 0.78 + R() * 0.32 - (r > 0.75 ? 0.12 : 0);
    d.data[i] = 104 * v; d.data[i + 1] = 76 * v; d.data[i + 2] = 48 * v; d.data[i + 3] = r < 0.95 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  return canvasTex(processPixels(c, { alpha: true }), false);
}

// mancha de sangue com respingos
export function bloodTexture() {
  const c = makeCanvas(16, 16), g = c.getContext('2d'), d = g.createImageData(16, 16), R = rnd(99);
  const blobs = [[7.5, 7.5, 4.2]];
  for (let i = 0; i < 5; i++) { const a = R() * 6.28, r = 4 + R() * 3; blobs.push([7.5 + Math.cos(a) * r, 7.5 + Math.sin(a) * r, 0.8 + R() * 1.2]); }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const on = blobs.some(([bx, by, br]) => Math.hypot(x - bx, y - by) < br + Math.sin(Math.atan2(y - by, x - bx) * 5) * 0.5);
    const v = 0.8 + R() * 0.3;
    d.data[i] = 96 * v; d.data[i + 1] = 10 * v; d.data[i + 2] = 12 * v; d.data[i + 3] = on ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  return canvasTex(processPixels(c, { alpha: true }), false);
}

// pele do chupacabras: escamas pequenas e manchas (a cor vem dos vértices)
export function skinTexture() {
  const c = makeCanvas(32, 32), g = c.getContext('2d'), d = g.createImageData(32, 32), R = rnd(7);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    // escamas em losango
    const sx = (x + (Math.floor(y / 3) % 2) * 2) % 4, sy = y % 3;
    const edge = sx === 0 || sy === 0;
    const spot = Math.sin(x * 0.7) * Math.cos(y * 0.55) > 0.62;
    let v = 205 + R() * 30 - (edge ? 38 : 0) - (spot ? 45 : 0);
    d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v * 0.96; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return canvasTex(processPixels(c), true);
}

// lã: cachinhos claros com sombra embaixo
export function woolTexture() {
  const c = makeCanvas(32, 32), g = c.getContext('2d'), R = rnd(13);
  g.fillStyle = '#e0d8c6'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 70; i++) {
    const x = R() * 32, y = R() * 32, r = 1.5 + R() * 2;
    for (const [ox, oy] of [[0, 0], [-32, 0], [0, -32], [-32, -32]]) {
      g.fillStyle = '#b4ab98'; g.beginPath(); g.arc(x + ox + 0.6, y + oy + 0.8, r, 0, 6.28); g.fill();
      g.fillStyle = R() < 0.5 ? '#fffbf2' : '#f2ecdf'; g.beginPath(); g.arc(x + ox, y + oy, r * 0.8, 0, 6.28); g.fill();
    }
  }
  return canvasTex(processPixels(c), true);
}

// papel envelhecido com bordas rasgadas
function paper(g, w, h, R, base = [232, 220, 184]) {
  const d = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, n = R() * 18 - 9;
    const stain = Math.sin(x * 0.21 + y * 0.13) * Math.cos(y * 0.17) > 0.75 ? -18 : 0;
    d.data[i] = base[0] + n + stain; d.data[i + 1] = base[1] + n + stain; d.data[i + 2] = base[2] + n + stain * 1.4;
    const torn = (x < 1 || y < 1 || x > w - 2 || y > h - 2) && R() < 0.45;
    d.data[i + 3] = torn ? 0 : 255;
  }
  g.putImageData(d, 0, 0);
}

// cartaz de PROCURA-SE com o desenho do bicho
export function posterTexture() {
  const W = 64, H = 96, c = makeCanvas(W, H), g = c.getContext('2d'), R = rnd(31);
  paper(g, W, H, R);
  g.fillStyle = '#7a1410'; g.fillRect(3, 3, W - 6, 2); g.fillRect(3, H - 5, W - 6, 2);
  crispText(g, 'PROCURA-SE', W / 2, 5, 12, '#8a1612');
  // quadro do retrato
  g.fillStyle = '#c8bc98'; g.fillRect(8, 20, W - 16, 42);
  g.fillStyle = '#4a3a28'; g.fillRect(8, 20, W - 16, 1); g.fillRect(8, 61, W - 16, 1); g.fillRect(8, 20, 1, 42); g.fillRect(W - 9, 20, 1, 42);
  // silhueta: corpo curvado, espinhos nas costas, pernas de canguru, olhos vermelhos
  const ink = '#2a2420';
  g.fillStyle = ink;
  const ell = (cx, cy, rx, ry) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) g.fillRect(cx + x, cy + y, 1, 1); };
  ell(33, 41, 8, 10);          // tronco
  ell(25, 30, 6, 5);           // cabeça
  ell(37, 52, 5, 4);           // coxa
  g.fillRect(36, 55, 2, 5); g.fillRect(33, 59, 7, 1);   // perna e pé
  g.fillRect(22, 36, 2, 10); g.fillRect(20, 45, 4, 1);  // braço e garras
  g.fillRect(27, 37, 2, 8); g.fillRect(25, 44, 4, 1);
  for (let k = 0; k < 6; k++) { const sx = 30 + k * 2.4, sy = 26 + k * 3.2; g.fillRect(Math.round(sx + 3), Math.round(sy), 3, 1); g.fillRect(Math.round(sx + 5), Math.round(sy) - 1, 2, 1); }
  g.fillStyle = '#e0261a'; g.fillRect(21, 29, 3, 2); g.fillRect(26, 29, 3, 2);
  g.fillStyle = '#ffd0b0'; g.fillRect(22, 29, 1, 1); g.fillRect(27, 29, 1, 1);
  crispText(g, 'CHUPACABRAS', W / 2, 63, 11, '#2a2018');
  crispText(g, 'RECOMPENSA', W / 2, 74, 11, '#8a1612');
  g.fillStyle = '#6a5a48';
  for (let i = 0; i < 3; i++) g.fillRect(10 + (i % 2) * 3, 86 + i * 2, W - 22 - (i % 2) * 8, 1);
  return canvasTex(processPixels(c, { alpha: true, alphaCut: 10 }), false);
}

// bilhetes do mural: título curto e rabiscos
export function noteTexture(title, color, seed = 5, base) {
  const W = 32, H = 40, c = makeCanvas(W, H), g = c.getContext('2d'), R = rnd(seed);
  paper(g, W, H, R, base);
  crispText(g, title, W / 2, 3, 10, color);
  g.fillStyle = '#5a5048';
  for (let i = 0; i < 5; i++) g.fillRect(4, 17 + i * 4, W - 8 - Math.floor(R() * 10), 1);
  return canvasTex(processPixels(c, { alpha: true, alphaCut: 10 }), false);
}
