import { drawText, panel, FONT_TITLE, FONT_UI } from './overlay.js';
import { saveSettings } from '../config.js';
import { DIFFICULTY_NAMES } from '../game/difficulty.js';
import { LAST_CHAPTER } from '../game/chapters/index.js';

// Tela título, menu principal, opções, créditos e pausa
const ps1Only = s => s.visual === 'ps1';
const OPTIONS = [
  // dano recebido, resistência dos bichos, o que eles largam e munição depois de cair
  { key: 'difficulty', label: 'DIFICULDADE', values: [0, 1, 2], fmt: v => DIFFICULTY_NAMES[v] ?? 'NORMAL' },
  { key: 'visual', label: 'ESTILO VISUAL', values: ['clean', 'ps1'], fmt: v => (v === 'ps1' ? 'PS1 RETRÔ' : '3D LIMPO') },
  { key: 'resolution', label: 'RESOLUÇÃO (PS1)', values: [240, 360, 480, 720, 1080, 0], fmt: v => (v === 0 ? 'NATIVA' : v + 'p' + (v === 240 ? ' (PS1)' : '')), needs: ps1Only },
  { key: 'aspect', label: 'PROPORÇÃO', values: ['wide', '4:3'], fmt: v => (v === 'wide' ? 'TELA CHEIA' : '4:3') },
  { key: 'affine', label: 'DISTORÇÃO DE TEXTURA', values: [0, 1, 2], fmt: v => ['DESLIGADA', 'SUTIL', 'TOTAL'][v], needs: ps1Only },
  { key: 'dither', label: 'DITHERING', values: [true, false], fmt: v => (v ? 'LIGADO' : 'DESLIGADO'), needs: ps1Only },
  { key: 'lighting', label: 'ILUMINAÇÃO', values: ['advanced', 'classic'], fmt: v => (v === 'classic' ? 'CLÁSSICA' : 'AVANÇADA') },
  { key: 'drawDistance', label: 'DISTÂNCIA DE VISÃO', values: [0, 1, 2], fmt: v => ['CURTA', 'MÉDIA', 'LONGA'][v] },
  { key: 'sensitivity', label: 'SENSIBILIDADE', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fmt: v => '▮'.repeat(v) + '▯'.repeat(10 - v) },
  { key: 'invertY', label: 'INVERTER EIXO Y', values: [false, true], fmt: v => (v ? 'SIM' : 'NÃO') },
  // controle e toque: puxa a mira para o bicho, segura sobre ele e acompanha
  { key: 'aimAssist', label: 'MIRA ASSISTIDA', values: [0, 1, 2], fmt: v => ['DESLIGADA', 'NORMAL', 'FORTE'][v] ?? 'NORMAL' },
  { key: 'volume', label: 'VOLUME', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fmt: v => '▮'.repeat(v) + '▯'.repeat(10 - v) },
  { key: 'fps', label: 'QUADROS POR SEGUNDO', values: [60, 30], fmt: v => v + ' FPS' },
  { key: 'minimap', label: 'MINIMAPA (TECLA M)', values: [true, false], fmt: v => (v ? 'LIGADO' : 'DESLIGADO') },
  // só no celular/tablet
  { key: 'touchSize', label: 'TAMANHO DOS BOTÕES', values: [0, 1, 2], fmt: v => ['PEQUENO', 'MÉDIO', 'GRANDE'][v], touchOnly: true },
  // celular com vibração (Android) ou controle com vibração
  { key: 'vibrate', label: 'VIBRAÇÃO', values: [true, false], fmt: v => (v ? 'LIGADA' : 'DESLIGADA'), needs: (s, I) => (I.touchPrimary && !!navigator.vibrate) || I.padRumble },
];

// tempo de jogo, criaturas e quedas somados (tela de capítulos)
export function statusLine(sv) {
  const t = Math.round(sv?.totals?.time || 0), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  const time = h ? h + 'h' + String(m).padStart(2, '0') : m + ' min';
  return `TEMPO DE JOGO ${time}   ·   CRIATURAS ${sv?.totals?.kills || 0}   ·   QUEDAS ${sv?.totals?.deaths || 0}`;
}

export const CREDITS = [
  ['Teewald', 'title'],
  ['', ''],
  ['protótipo 0.1', 'dim'],
  ['Cidade inspirada em Santa Maria do Herval - RS', ''],
  ['', ''],
  ['Ruas, rio e lugares: © OpenStreetMap (ODbL)', 'dim'],
  ['Prédios: Microsoft Building Footprints (ODbL)', 'dim'],
  ['Relevo: SRTM 30m (NASA) via OpenTopoData', 'dim'],
  ['', ''],
  // aviso de ficção
  ['Obra de ficção: todos os nomes, personagens e histórias', 'note'],
  ['são inventados e não têm nenhuma relação real com a cidade.', 'note'],
  ['', ''],
  ['Um trabalho independente de Fabiano Kunst', 'name'],
];

// site do autor: abre numa aba nova a partir dos créditos
export const SITE = { label: 'fabianokunst.fkweb.com.br', url: 'https://fabianokunst.fkweb.com.br' };

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
    if (screen === 'options' || screen === 'credits' || screen === 'chapters') this.returnTo = this.screen === 'pause' ? 'pause' : 'main';
    if (screen === 'erase') this.returnTo = 'chapters';
    if (screen === 'confirm') this.returnTo = 'pause';
    // nos créditos começa no VOLTAR, para ENTER não abrir o site sem querer
    this.screen = screen; this.sel = screen === 'credits' ? 1 : 0; this.t = 0;
  }

  options() {
    return OPTIONS.filter(o => (!o.touchOnly || this.input.touchPrimary) && (!o.needs || o.needs(this.settings, this.input)));
  }

  // progresso salvo (capítulo onde parou e o maior capítulo já liberado)
  get saved() { return this.campaign?.save || { chapter: 1, unlocked: 1 }; }

  items() {
    if (this.screen === 'main') {
      const sv = this.saved, list = [];
      if ((sv.chapter || 1) > 1 || sv.run) list.push({ label: 'CONTINUAR  · CAP. ' + (sv.chapter || 1), act: 'continue' });
      list.push({ label: 'NOVO JOGO', act: 'newgame' });
      list.push({ label: 'CAPÍTULOS', act: 'chapters' });
      // documentos e lendas já achados (relidos fora do jogo)
      const ex = this.extras?.state;
      if (ex && (ex.docs.length || ex.legends.length)) list.push({ label: 'ARQUIVOS', act: 'journal' });
      list.push({ label: 'OPÇÕES', act: 'options' }, { label: 'CRÉDITOS', act: 'credits' });
      return list;
    }
    // os capítulos: liberados com a melhor nota, os outros bloqueados
    if (this.screen === 'chapters') {
      const n = Math.min(LAST_CHAPTER, this.saved.unlocked || 1), t = this.chapterTitles || [];
      const list = [];
      const rk = this.saved.ranks || {};
      for (let i = 1; i <= LAST_CHAPTER; i++) {
        if (i <= n) list.push({ label: i + '. ' + (t[i] || 'Capítulo ' + i).toUpperCase() + (rk[i] ? '  [' + rk[i] + ']' : ''), act: 'chapter:' + i });
        else list.push({ label: i + '. ???   BLOQUEADO', act: 'locked', locked: true });
      }
      if (this.saved.updated) list.push({ label: 'APAGAR PROGRESSO', act: 'eraseAsk' });
      list.push({ label: 'VOLTAR', act: 'back' });
      return list;
    }
    if (this.screen === 'erase') return [{ label: 'NÃO, VOLTAR', act: 'back' }, { label: 'APAGAR TUDO', act: 'erase' }];
    if (this.screen === 'pause') return [{ label: 'CONTINUAR', act: 'resume' }, { label: 'ARQUIVOS', act: 'journal' }, { label: 'OPÇÕES', act: 'options' }, { label: 'MENU PRINCIPAL', act: 'confirm' }];
    // sair da partida pede confirmação (o item marcado de início é o seguro)
    if (this.screen === 'confirm') return [{ label: 'CONTINUAR JOGANDO', act: 'back' }, { label: 'SAIR PARA O MENU', act: 'quit' }];
    if (this.screen === 'options') return [...this.options().map(o => ({ label: o.label, opt: o })), { label: 'VOLTAR', act: 'back' }];
    if (this.screen === 'credits') return [{ label: SITE.label, act: 'site' }, { label: 'VOLTAR', act: 'back' }];
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

  // item de ação escolhido (teclado, controle, mouse ou toque); devolve a ação do jogo
  activate(it) {
    this.audio.menuOk();
    if (it.act === 'options' || it.act === 'credits' || it.act === 'confirm' || it.act === 'chapters') { this.open(it.act); return null; }
    if (it.act === 'eraseAsk') { this.open('erase'); return null; }
    if (it.act === 'locked') { this.audio.menuBack(); return null; }
    if (it.act === 'back') { this.audio.menuBack(); this.open(this.returnTo); return null; }
    if (it.act === 'site') { window.open(SITE.url, '_blank', 'noopener'); return null; }
    return it.act;
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
          if (I.mouse.clicked) {
            this.sel = i;
            // linha de opção: metade esquerda do valor diminui, o resto aumenta
            const z = r[4];
            this._click = z && typeof z === 'object' ? (mx >= z.lo && mx < z.mid ? 'left' : 'right') : (z || 'click');
          }
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
      return this.activate(it);
    }
    if (I.back()) {
      if (this.screen === 'options' || this.screen === 'credits' || this.screen === 'confirm' || this.screen === 'chapters' || this.screen === 'erase') { this.audio.menuBack(); this.open(this.returnTo); }
      else if (this.screen === 'pause') { this.audio.menuBack(); return 'resume'; }
    }
    return null;
  }

  draw(g, W, H) {
    const k = H / 240;
    this.rects = [];
    const dev = this.input.lastDevice, pad = dev === 'pad', touch = dev === 'touch';
    const help = (pd, kb, tc) => {
      const t = pad ? pd : touch ? tc : kb;
      if (t) drawText(g, t, 6 * k, H - 14 * k, 10 * k, { color: '#a89878' });
    };
    if (this.screen === 'pause') {
      g.globalAlpha = 0.55; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      drawText(g, 'PAUSA', W / 2, 62 * k, 26 * k, { align: 'center', color: '#e9dcc0' });
      this._list(g, W, H, k, 112 * k);
      help('DIRECIONAL escolher   A confirmar   START continuar', '↑↓ escolher   ENTER confirmar   ESC continuar', '');
      return;
    }
    if (this.screen === 'erase') {
      g.globalAlpha = 0.85; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      drawText(g, 'APAGAR TODO O PROGRESSO?', W / 2, 70 * k, 18 * k, { align: 'center', color: '#e9dcc0' });
      drawText(g, 'capítulos liberados, notas e status salvos', W / 2, 92 * k, 11 * k, { align: 'center', color: '#a89878' });
      this._list(g, W, H, k, 124 * k);
      help('DIRECIONAL escolher   A confirmar   B voltar', '↑↓ escolher   ENTER confirmar   ESC voltar', '');
      return;
    }
    if (this.screen === 'confirm') {
      g.globalAlpha = 0.7; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      drawText(g, 'VOLTAR AO MENU PRINCIPAL?', W / 2, 70 * k, 18 * k, { align: 'center', color: '#e9dcc0' });
      drawText(g, 'o progresso fica salvo para CONTINUAR', W / 2, 92 * k, 11 * k, { align: 'center', color: '#a89878' });
      this._list(g, W, H, k, 124 * k);
      help('DIRECIONAL escolher   A confirmar   B voltar', '↑↓ escolher   ENTER confirmar   ESC voltar', '');
      return;
    }
    // vinheta
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.05)'); grd.addColorStop(0.7, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);

    if (this.screen === 'chapters') {
      panel(g, W / 2 - 150 * k, 20 * k, 300 * k, 200 * k, 0.78);
      drawText(g, 'CAPÍTULOS', W / 2, 24 * k, 18 * k, { align: 'center', color: '#f2c879' });
      drawText(g, statusLine(this.saved), W / 2, 42 * k, 9 * k, { align: 'center', color: '#a89878' });
      const items = this.items(), step = Math.min(15, 150 / items.length) * k;
      items.forEach((it, i) => {
        const y = 56 * k + i * step, on = i === this.sel;
        const s2 = drawText(g, it.label, W / 2, y, 12 * k, { align: 'center', color: it.locked ? (on ? '#8a7a60' : '#5e5444') : on ? '#f2c879' : '#c8b898' });
        if (on) drawText(g, '▶', W / 2 - s2.w / 2 - 12 * k, y, 13 * k, { color: '#f2c879' });
        this.rects.push([W / 2 - s2.w / 2 - 14 * k, y, s2.w + 28 * k, step]);
      });
      help('↑↓ escolher   A começar   B voltar', '↑↓ escolher   ENTER começar   ESC voltar', '');
      return;
    }
    if (this.screen === 'options' || this.screen === 'credits') {
      panel(g, W / 2 - 150 * k, 20 * k, 300 * k, 200 * k, 0.78);
      drawText(g, this.screen === 'options' ? 'OPÇÕES' : 'CRÉDITOS', W / 2, 26 * k, 20 * k, { align: 'center', color: '#f2c879' });
      if (this.screen === 'options') {
        this._options(g, W, H, k, touch);
        help('↑↓ escolher   ◀▶ mudar   B voltar', '↑↓ escolher   ←→ mudar   ESC voltar', 'toque à esquerda do valor diminui, à direita aumenta');
      } else {
        // cada estilo tem seu tamanho; linha vazia só afasta um pouco os blocos
        let y = 70 * k;
        CREDITS.forEach(([line, style]) => {
          if (style === 'title') { drawText(g, line, W / 2, 44 * k, 26 * k, { align: 'center', font: FONT_TITLE, color: '#e9dcc0', shadow: '#4a0d08' }); return; }
          if (!line) { y += 5 * k; return; }
          const size = style === 'name' ? 13 : style === 'dim' || style === 'note' ? 11 : 12;
          drawText(g, line, W / 2, y, size * k, { align: 'center', color: style === 'name' ? '#efe2c4' : style === 'dim' ? '#a89878' : style === 'note' ? '#d8c8a8' : '#e8dcc0' });
          y += (size - 0.5) * k;
        });
        // site do autor (clicável) e VOLTAR
        this._list(g, W, H, k, 183 * k);
      }
      return;
    }
    // título
    // logo parado (a flutuação de 1,5 px virava um pulo de pixel de vez em quando)
    const ty = 44 * k;
    drawText(g, 'Teewald', W / 2, ty, 58 * k, { align: 'center', font: FONT_TITLE, color: '#efe2c4', shadow: '#4a0d08' });
    g.fillStyle = '#b89a62';
    g.fillRect(Math.round(W / 2 - 70 * k), Math.round(ty + 74 * k), Math.round(140 * k), Math.max(1, Math.round(k)));
    if (this.screen === 'press') {
      const prompt = pad ? 'PRESSIONE START' : touch ? 'TOQUE PARA COMEÇAR' : 'PRESSIONE ENTER';
      if (Math.floor(this.t * 1.6) % 2 === 0) drawText(g, prompt, W / 2, 168 * k, 16 * k, { align: 'center', color: '#f2e6c8' });
    } else {
      const n = this.items().length;
      this._list(g, W, H, k, (n > 3 ? 132 - (n - 3) * 7 : 140) * k);
      help('DIRECIONAL escolher   A confirmar', '↑↓ escolher   ENTER confirmar', 'TOQUE para escolher');
    }
    drawText(g, 'v0.1', W - 6 * k, H - 14 * k, 10 * k, { align: 'right', color: '#a89878' });
  }

  _list(g, W, H, k, y0) {
    const items = this.items(), step = items.length > 3 ? 15 : 17;
    items.forEach((it, i) => {
      const y = y0 + i * step * k, on = i === this.sel;
      const s = drawText(g, it.label, W / 2, y, 16 * k, { align: 'center', color: on ? '#f2c879' : '#b8a888' });
      if (on) drawText(g, '▶', W / 2 - s.w / 2 - 12 * k, y, 16 * k, { color: '#f2c879' });
      this.rects.push([W / 2 - s.w / 2 - 14 * k, y, s.w + 28 * k, 16 * k]);
    });
  }

  // touch: setas em todas as linhas, para tocar direto no lado que quer mudar
  _options(g, W, H, k, touch = false) {
    const items = this.items();
    // lista grande (estilo PS1, opções do celular ou do controle): aperta as linhas e a letra
    const step = Math.min(13, 154 / (items.length - 1)) * k, fs = Math.min(13 * k, step), y0 = (step < 12 * k ? 46 : 50) * k;
    items.forEach((it, i) => {
      const y = y0 + i * step, on = i === this.sel;
      const color = on ? '#f2c879' : '#c8b898';
      if (it.opt) {
        drawText(g, it.label, W / 2 - 140 * k, y, fs, { color });
        const v = it.opt.fmt(this.settings[it.opt.key]), arrows = on || touch;
        const s = drawText(g, (arrows ? '◀ ' : '') + v + (arrows ? ' ▶' : ''), W / 2 + 140 * k, y, fs, { align: 'right', color: on ? '#fff2d0' : '#a89878', font: FONT_UI });
        const right = W / 2 + 140 * k;
        this.rects.push([W / 2 - 140 * k, y, 280 * k, step, { lo: right - s.w - 10 * k, mid: right - s.w / 2 }]);
      } else {
        const s = drawText(g, it.label, W / 2, y + 4 * k, 15 * k, { align: 'center', color });
        this.rects.push([W / 2 - s.w / 2, y + 4 * k, s.w, 15 * k]);
      }
    });
  }
}
