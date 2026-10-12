import { drawText, panel, FONT_TITLE, FONT_UI } from './overlay.js';
import { saveSettings } from '../config.js';

// Tela título, menu principal, opções, créditos e pausa
const OPTIONS = [
  { key: 'resolution', label: 'RESOLUÇÃO', values: [240, 360, 480, 720, 1080, 0], fmt: v => (v === 0 ? 'NATIVA' : v + 'p' + (v === 240 ? ' (PS1)' : '')) },
  { key: 'aspect', label: 'PROPORÇÃO', values: ['wide', '4:3'], fmt: v => (v === 'wide' ? 'TELA CHEIA' : '4:3') },
  { key: 'jitter', label: 'TREMOR DE VÉRTICES', values: [true, false], fmt: v => (v ? 'LIGADO' : 'DESLIGADO') },
  { key: 'affine', label: 'DISTORÇÃO DE TEXTURA', values: [0, 1, 2], fmt: v => ['DESLIGADA', 'SUTIL', 'TOTAL'][v] },
  { key: 'dither', label: 'DITHERING', values: [true, false], fmt: v => (v ? 'LIGADO' : 'DESLIGADO') },
  { key: 'drawDistance', label: 'DISTÂNCIA DE VISÃO', values: [0, 1, 2], fmt: v => ['CURTA', 'MÉDIA', 'LONGA'][v] },
  { key: 'sensitivity', label: 'SENSIBILIDADE', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fmt: v => '▮'.repeat(v) + '▯'.repeat(10 - v) },
  { key: 'invertY', label: 'INVERTER EIXO Y', values: [false, true], fmt: v => (v ? 'SIM' : 'NÃO') },
  { key: 'volume', label: 'VOLUME', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fmt: v => '▮'.repeat(v) + '▯'.repeat(10 - v) },
  { key: 'fps', label: 'QUADROS POR SEGUNDO', values: [60, 30], fmt: v => v + ' FPS' },
];

const CREDITS = [
  ['Teewald', 'title'],
  ['', ''],
  ['protótipo 0.1', 'dim'],
  ['Cidade inspirada em', 'dim'],
  ['Santa Maria do Herval - RS', ''],
  ['', ''],
  ['Ruas, rio e prédios', 'dim'],
  ['© colaboradores do OpenStreetMap (ODbL)', ''],
  ['Relevo: SRTM 30m (NASA) via OpenTopoData', ''],
  ['', ''],
  ['Texturas: biblioteca do projeto', ''],
  ['Motor: Three.js', ''],
];

export class Menu {
  constructor(input, audio, settings, onChange) {
    this.input = input; this.audio = audio; this.settings = settings; this.onChange = onChange;
    this.screen = 'press';
    this.sel = 0;
    this.t = 0;
    this.rects = [];
    this.returnTo = 'main';
  }

  open(screen) {
    if (screen === 'options' || screen === 'credits') this.returnTo = this.screen === 'pause' ? 'pause' : 'main';
    this.screen = screen; this.sel = 0; this.t = 0;
  }

  items() {
    if (this.screen === 'main') return [{ label: 'NOVO JOGO', act: 'newgame' }, { label: 'OPÇÕES', act: 'options' }, { label: 'CRÉDITOS', act: 'credits' }];
    if (this.screen === 'pause') return [{ label: 'CONTINUAR', act: 'resume' }, { label: 'OPÇÕES', act: 'options' }, { label: 'MENU PRINCIPAL', act: 'quit' }];
    if (this.screen === 'options') return [...OPTIONS.map(o => ({ label: o.label, opt: o })), { label: 'VOLTAR', act: 'back' }];
    if (this.screen === 'credits') return [{ label: 'VOLTAR', act: 'back' }];
    return [];
  }

  change(opt, dir) {
    const i = opt.values.indexOf(this.settings[opt.key]);
    const n = opt.values.length;
    this.settings[opt.key] = opt.values[((i < 0 ? 0 : i) + dir + n) % n];
    saveSettings();
    this.onChange(this.settings, opt.key);
    this.audio.menuMove();
  }

  // devolve uma ação: 'newgame' | 'resume' | 'quit' | null
  update(dt, mouseInternal) {
    this.t += dt;
    const I = this.input;
    if (this.screen === 'press') {
      if (I.confirm() || I.mouse.clicked || I.padHit('a', 'start')) { this.audio.start(); this.audio.menuOk(); this.open('main'); }
      return null;
    }
    const items = this.items();
    if (I.up()) { this.sel = (this.sel - 1 + items.length) % items.length; this.audio.menuMove(); }
    if (I.downNav()) { this.sel = (this.sel + 1) % items.length; this.audio.menuMove(); }
    // mouse
    if (mouseInternal && (I.mouse.moved || I.mouse.clicked)) {
      const [mx, my] = mouseInternal;
      this.rects.forEach((r, i) => {
        if (mx >= r[0] && mx <= r[0] + r[2] && my >= r[1] && my <= r[1] + r[3]) {
          if (this.sel !== i && I.mouse.moved) { this.sel = i; this.audio.menuMove(); }
          if (I.mouse.clicked) { this.sel = i; this._click = r[4]; }
        }
      });
    }
    const it = items[this.sel];
    if (it?.opt) {
      if (I.left()) this.change(it.opt, -1);
      if (I.right()) this.change(it.opt, 1);
    }
    let activate = I.confirm() || (this._click !== undefined);
    const clickDir = this._click; this._click = undefined;
    if (activate && it) {
      if (it.opt) { this.change(it.opt, clickDir === 'left' ? -1 : 1); return null; }
      this.audio.menuOk();
      if (it.act === 'options' || it.act === 'credits') { this.open(it.act); return null; }
      if (it.act === 'back') { this.audio.menuBack(); this.open(this.returnTo); return null; }
      return it.act;
    }
    if (I.back()) {
      if (this.screen === 'options' || this.screen === 'credits') { this.audio.menuBack(); this.open(this.returnTo); }
      else if (this.screen === 'pause') { this.audio.menuBack(); return 'resume'; }
    }
    return null;
  }

  draw(g, W, H) {
    const k = H / 240;
    this.rects = [];
    const pad = this.input.lastDevice === 'pad';
    if (this.screen === 'pause') {
      g.globalAlpha = 0.55; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      drawText(g, 'PAUSA', W / 2, 62 * k, 26 * k, { align: 'center', color: '#e9dcc0' });
      this._list(g, W, H, k, 112 * k);
      return;
    }
    // vinheta
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.05)'); grd.addColorStop(0.7, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    if (this.screen === 'options' || this.screen === 'credits') {
      panel(g, W / 2 - 150 * k, 20 * k, 300 * k, 200 * k, 0.78);
      drawText(g, this.screen === 'options' ? 'OPÇÕES' : 'CRÉDITOS', W / 2, 26 * k, 20 * k, { align: 'center', color: '#f2c879' });
      if (this.screen === 'options') this._options(g, W, H, k);
      else {
        CREDITS.forEach(([line, style], i) => {
          if (!line) return;
          if (style === 'title') drawText(g, line, W / 2, 44 * k, 26 * k, { align: 'center', font: FONT_TITLE, color: '#e9dcc0', shadow: '#4a0d08' });
          else drawText(g, line, W / 2, 52 * k + i * 11.5 * k, 12 * k, { align: 'center', color: style === 'dim' ? '#a89878' : '#e8dcc0' });
        });
        this._list(g, W, H, k, 196 * k);
      }
      return;
    }
    // título
    const ty = 44 * k + Math.sin(this.t * 0.8) * 1.5 * k;
    drawText(g, 'Teewald', W / 2, ty, 58 * k, { align: 'center', font: FONT_TITLE, color: '#efe2c4', shadow: '#4a0d08' });
    g.fillStyle = '#b89a62';
    g.fillRect(Math.round(W / 2 - 70 * k), Math.round(ty + 74 * k), Math.round(140 * k), Math.max(1, Math.round(k)));
    if (this.screen === 'press') {
      if (Math.floor(this.t * 1.6) % 2 === 0) drawText(g, pad ? 'PRESSIONE START' : 'PRESSIONE ENTER', W / 2, 168 * k, 16 * k, { align: 'center', color: '#f2e6c8' });
    } else {
      this._list(g, W, H, k, 140 * k);
      drawText(g, pad ? 'DIRECIONAL escolher   A confirmar' : '↑↓ escolher   ENTER confirmar', 6 * k, H - 14 * k, 10 * k, { color: '#a89878' });
    }
    drawText(g, 'v0.1', W - 6 * k, H - 14 * k, 10 * k, { align: 'right', color: '#a89878' });
  }

  _list(g, W, H, k, y0) {
    this.items().forEach((it, i) => {
      const y = y0 + i * 17 * k, on = i === this.sel;
      const s = drawText(g, it.label, W / 2, y, 16 * k, { align: 'center', color: on ? '#f2c879' : '#b8a888' });
      if (on) drawText(g, '▶', W / 2 - s.w / 2 - 12 * k, y, 16 * k, { color: '#f2c879' });
      this.rects.push([W / 2 - s.w / 2 - 14 * k, y, s.w + 28 * k, 16 * k]);
    });
  }

  _options(g, W, H, k) {
    const items = this.items();
    items.forEach((it, i) => {
      const y = 52 * k + i * 14 * k, on = i === this.sel;
      const color = on ? '#f2c879' : '#c8b898';
      if (it.opt) {
        drawText(g, it.label, W / 2 - 140 * k, y, 13 * k, { color });
        const v = it.opt.fmt(this.settings[it.opt.key]);
        drawText(g, (on ? '◀ ' : '') + v + (on ? ' ▶' : ''), W / 2 + 140 * k, y, 13 * k, { align: 'right', color: on ? '#fff2d0' : '#a89878', font: FONT_UI });
        this.rects.push([W / 2 - 140 * k, y, 280 * k, 13 * k, 'right']);
      } else {
        const s = drawText(g, it.label, W / 2, y + 6 * k, 15 * k, { align: 'center', color });
        this.rects.push([W / 2 - s.w / 2, y + 6 * k, s.w, 15 * k]);
      }
    });
  }
}
