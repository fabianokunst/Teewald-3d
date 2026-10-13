// Texto em pixels nítidos (estilo PS1) desenhado num canvas 2D na resolução interna.
// Cada texto vira um "sprite" com alfa binário e fica em cache.

import { VISUAL } from '../engine/ps1material.js';

const cache = new Map();
export const FONT_TITLE = '"UnifrakturMaguntia", "Old English Text MT", Georgia, serif';
export const FONT_UI = '"VT323", "Lucida Console", monospace';

export async function loadFonts() {
  if (!document.fonts) return;
  try {
    await Promise.race([
      Promise.all([document.fonts.load('48px "UnifrakturMaguntia"'), document.fonts.load('16px "VT323"')]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* usa fontes reserva */ }
}

export function textSprite(text, size, font = FONT_UI, color = '#e8dcc0', shadow = '#140c08', crisp = true) {
  const key = [text, size, font, color, shadow, crisp].join('|');
  let s = cache.get(key);
  if (s) return s;
  const m = document.createElement('canvas').getContext('2d');
  m.font = `${size}px ${font}`;
  const w = Math.ceil(m.measureText(text).width) + 4, h = Math.ceil(size * 1.35) + 4;
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = h;
  const g = c.getContext('2d');
  g.font = `${size}px ${font}`;
  g.textBaseline = 'top';
  if (shadow) { g.fillStyle = shadow; g.fillText(text, 2, 2 + size * 0.08); g.fillText(text, 1, 2 + size * 0.08); }
  g.fillStyle = color;
  g.fillText(text, 1, 1 + size * 0.08);
  if (crisp) {
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 96 ? 255 : 0;
    g.putImageData(d, 0, 0);
  }
  s = { c, w: c.width, h: c.height };
  cache.set(key, s);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return s;
}

// desenha texto; align: 'left' | 'center' | 'right'
export function drawText(g, text, x, y, size, o = {}) {
  // pixels nítidos no estilo PS1; no 3D limpo o texto fica suavizado
  const crisp = o.crisp ?? VISUAL.mode === 'ps1';
  const s = textSprite(text, Math.round(size), o.font || FONT_UI, o.color || '#e8dcc0', o.shadow === undefined ? '#140c08' : o.shadow, crisp);
  let dx = x;
  if (o.align === 'center') dx = x - s.w / 2;
  else if (o.align === 'right') dx = x - s.w;
  g.globalAlpha = o.alpha ?? 1;
  g.drawImage(s.c, Math.round(dx), Math.round(y));
  g.globalAlpha = 1;
  return s;
}

export function panel(g, x, y, w, h, alpha = 0.7) {
  g.globalAlpha = alpha;
  g.fillStyle = '#0d0907';
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  g.globalAlpha = 1;
  g.strokeStyle = '#6b5a40';
  g.lineWidth = 1;
  g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}
