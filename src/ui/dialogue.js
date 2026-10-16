import { drawText, panel, FONT_UI } from './overlay.js';
import { tr, getLang } from '../i18n/index.js';

// Caixa de diálogo no pé da tela: nome de quem fala, texto letra a letra, devagar,
// com "voz" de bipes graves e abafados (cada morador tem um tom) e setinha no fim da página.
// Falas longas quebram em páginas de até 3 linhas (já traduzidas: i18n/index.js).

const SPEED = 32;       // letras por segundo
const LINES = 3;

let measureCtx = null;
function measure(text, size) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${Math.round(size)}px ${FONT_UI}`;
  return measureCtx.measureText(text).width;
}

function wrap(text, size, maxW) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && measure(t, size) > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export class Dialogue {
  constructor(audio) {
    this.audio = audio;
    this.open = false;
  }

  // lines: lista de falas; voice: frequência base do bipe (Hz)
  start(name, lines, voice = 200) {
    this.name = name; this.lines = lines; this.voice = voice;
    this.i = 0; this.pages = null; this.page = 0; this.chars = 0; this.t = 0; this.lastBlip = 0;
    this.layoutKey = '';
    this.open = true;
  }

  _layout(W, H) {
    const k = H / 240, key = W + 'x' + H + ':' + this.i + ':' + getLang();
    if (this.layoutKey === key) return;
    this.layoutKey = key;
    const size = 13 * k, boxW = Math.min(W - 24 * k, 340 * k);
    const rows = wrap(tr(this.lines[this.i]), size, boxW - 22 * k);
    this.pages = [];
    for (let i = 0; i < rows.length; i += LINES) this.pages.push(rows.slice(i, i + LINES));
    this.page = Math.min(this.page, this.pages.length - 1);
  }

  get pageText() { return this.pages ? this.pages[this.page].join(' ') : ''; }

  // devolve 'close' quando a conversa termina
  update(dt, input) {
    if (!this.open) return 'close';
    this.t += dt;
    const total = this.pageText.length;
    if (this.chars < total) {
      const before = Math.floor(this.chars);
      this.chars = Math.min(total, this.chars + dt * SPEED);
      const now = Math.floor(this.chars);
      // um bipe a cada duas letras (espaços e pontuação ficam mudos)
      if (now !== before && now - this.lastBlip >= 2 && /[\p{L}\d]/u.test(this.pageText[now - 1] || '')) {
        this.lastBlip = now;
        this.audio.tone(this.voice * 0.72 * (0.92 + Math.random() * 0.16), 0.06, 'triangle', 0.035);
      }
    }
    if (input.back()) { this.open = false; this.audio.menuBack(); return 'close'; }
    const adv = input.hit('KeyF', 'Enter', 'Space', 'NumpadEnter', 'KeyE') || input.padHit('a') || input.mouse.clicked;
    if (!adv || this.t < 0.15) return null;
    if (this.chars < total) { this.chars = total; return null; }
    this.audio.menuMove();
    if (this.pages && this.page < this.pages.length - 1) { this.page++; this.chars = 0; this.lastBlip = 0; return null; }
    if (this.i < this.lines.length - 1) { this.i++; this.page = 0; this.chars = 0; this.lastBlip = 0; this.layoutKey = ''; return null; }
    this.open = false;
    return 'close';
  }

  draw(g, W, H, device) {
    if (!this.open) return;
    this._layout(W, H);
    const k = H / 240, size = 13 * k;
    const boxW = Math.min(W - 24 * k, 340 * k), boxH = (LINES * 14 + 14) * k;
    const x0 = Math.round((W - boxW) / 2), y0 = Math.round(H - boxH - 12 * k);
    panel(g, x0, y0, boxW, boxH, 0.92);
    // plaquinha com o nome
    const nameSize = 11 * k, name = tr(this.name);
    panel(g, x0 + 8 * k, y0 - 12 * k, measure(name, nameSize) + 14 * k, 15 * k, 0.9);
    drawText(g, name, x0 + 13 * k, y0 - 11 * k, nameSize, { color: '#b8a890', raw: true });
    // texto até a letra atual, linha a linha
    let left = Math.floor(this.chars);
    this.pages[this.page].forEach((row, r) => {
      if (left <= 0) return;
      const part = row.slice(0, left);
      left -= row.length + 1;
      drawText(g, part, x0 + 11 * k, y0 + 8 * k + r * 14 * k, size, { color: '#ded6c6', raw: true });
    });
    // setinha piscando quando a página terminou
    if (this.chars >= this.pageText.length && Math.floor(this.t * 2.5) % 2 === 0) {
      const ax = Math.round(x0 + boxW - 14 * k), ay = Math.round(y0 + boxH - 10 * k), s = Math.max(1, Math.round(k));
      g.fillStyle = '#8a2a20';
      for (let i = 0; i < 4; i++) g.fillRect(ax - (3 - i) * s, ay + i * s, (7 - 2 * i) * s, s);
    }
    const hint = device === 'pad' ? 'A  continuar   B  sair' : device === 'touch' ? 'toque para continuar' : 'F  continuar   ESC  sair';
    drawText(g, hint, x0 + boxW - 22 * k, y0 + boxH + 1 * k, 9 * k, { align: 'right', color: '#7a7064' });
  }
}
