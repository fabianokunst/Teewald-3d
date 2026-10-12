import { drawText, FONT_TITLE } from './overlay.js';

// Nome do lugar ao entrar numa área, dicas de controle e contador de FPS
export class Hud {
  constructor() {
    this.place = null; this.candidate = null; this.candT = 0;
    this.card = null; this.cardT = 0;
    this.hintT = 0;
    this.showFps = false; this.fps = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.intro = null;
  }

  setPlace(name, dt) {
    if (name === this.place) { this.candidate = null; return; }
    if (name !== this.candidate) { this.candidate = name; this.candT = 0; }
    this.candT += dt;
    if (this.candT > 0.7) {
      this.place = name;
      if (name) { this.card = name; this.cardT = 0; }
    }
  }

  showHints() { this.hintT = 0.001; }

  // aviso rápido no alto da tela (usa a mesma cartela do nome do lugar)
  toast(text) { this.card = text; this.cardT = 0; }

  setStreet(name, dt) {
    this.streetT = (this.streetT ?? 99) + dt;
    if (name && name !== this.street) { this.street = name; this.streetT = 0; }
  }

  update(dt) {
    if (this.card) { this.cardT += dt; if (this.cardT > 4.5) this.card = null; }
    if (this.hintT > 0) { this.hintT += dt; if (this.hintT > 11) this.hintT = 0; }
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
  }

  draw(g, W, H, o = {}) {
    const k = H / 240;
    if (this.card && !o.hideCard) {
      const t = this.cardT;
      const a = t < 0.6 ? t / 0.6 : t > 3.4 ? Math.max(0, 1 - (t - 3.4) / 1.1) : 1;
      g.globalAlpha = a * 0.85;
      g.fillStyle = '#e9dcc0';
      g.fillRect(Math.round(W / 2 - 60 * k), Math.round(30 * k), Math.round(120 * k), Math.max(1, Math.round(k)));
      g.globalAlpha = 1;
      drawText(g, this.card, W / 2, 14 * k, 14 * k, { align: 'center', alpha: a, color: '#f4e8cc' });
    }
    if (this.hintT > 0) {
      const t = this.hintT, a = t < 1 ? t : t > 9 ? Math.max(0, (11 - t) / 2) : 1;
      const lines = {
        pad: ['ANALÓGICO mover   B correr   A pular', 'ANALÓGICO DIR. câmera   R3 centralizar   ↑↓ zoom', 'SELECT mapa   START pausa'],
        touch: ['ESQUERDA mover   DIREITA girar câmera', 'PINÇA zoom   TOQUE DUPLO centraliza'],
        keyboard: ['WASD mover   SHIFT correr   ESPAÇO pular', 'MOUSE câmera (clique)   RODA zoom   ESC pausa'],
      }[o.device] || [];
      const hx = (W - (o.rightPad || 0)) / 2 + 4 * k, y0 = H - (20 + lines.length * 12) * k;
      lines.forEach((l, i) => drawText(g, l, hx, y0 + i * 12 * k, 11 * k, { align: 'center', alpha: a, color: '#e8dcc0' }));
    }
    if (this.street && this.streetT < 6 && !o.hideCard) {
      const a = Math.min(1, this.streetT * 2) * Math.min(1, Math.max(0, (6 - this.streetT) / 1.5));
      // no toque o canto esquerdo é do analógico: nome da rua vai para o centro
      if (o.device === 'touch') drawText(g, this.street, W / 2, H - 16 * k, 11 * k, { align: 'center', alpha: a, color: '#e0d2b4' });
      else drawText(g, this.street, 8 * k, H - 16 * k, 11 * k, { alpha: a, color: '#e0d2b4' });
    }
    if (o.lockHint) drawText(g, 'clique para controlar a câmera', W - 6 * k, 6 * k, 10 * k, { align: 'right', color: '#c8b898', alpha: 0.8 });
    // no toque o canto superior esquerdo tem os botões de pausa e tela cheia
    if (this.showFps) drawText(g, this.fps + ' FPS' + (o.stats ? '  ' + o.stats : ''), 6 * k, (o.device === 'touch' ? 34 : 6) * k, 10 * k, { color: '#9f9' });
  }

  // cartela da abertura
  drawIntro(g, W, H, t) {
    const k = H / 240;
    const a = t < 1.2 ? 0 : t < 2.4 ? (t - 1.2) / 1.2 : t > 6.2 ? Math.max(0, 1 - (t - 6.2) / 1.2) : 1;
    if (a <= 0) return;
    drawText(g, 'Teewald', W / 2, H * 0.62, 30 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#efe2c4', shadow: '#2a0806' });
    drawText(g, 'CALÇADÃO DO RIO CADEIA  ·  OUTONO', W / 2, H * 0.62 + 36 * k, 11 * k, { align: 'center', alpha: a, color: '#d8c8a8' });
  }
}
