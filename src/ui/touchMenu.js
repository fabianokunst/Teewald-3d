import { drawText, FONT_TITLE } from './overlay.js';
import { CREDITS, SITE } from './menu.js';
import { buzz } from '../engine/touch.js';

// Menus no celular: botões grandes (≥ 44 px CSS) desenhados na camada de toque,
// que cobre a tela inteira (em pé, os botões ficam na parte de baixo, sob a imagem).
// O botão acende ao encostar o dedo e só age ao soltar em cima dele; arrastar
// rola as opções quando elas não cabem. Usa as mesmas telas e ações do Menu.

const C = {
  panel: '#0d0907', edge: '#d8c8a0', dim: '#6b5a40', hi: '#4a3a28', text: '#efe2c4',
  soft: '#a89878', gold: '#f2c879', dark: '#140c08', danger: '#e8a080',
};

export class TouchMenu {
  constructor(menu, input, audio) {
    this.menu = menu; this.input = input; this.audio = audio;
    this.buttons = [];        // { id, x, y, w, h } em px CSS, do último desenho
    this.press = null;        // id do botão sob o dedo
    this.tapId = null;
    this.scroll = 0; this.scrollMax = 0; this.scrolled = false;
    this.screen = null;
  }

  _hit(x, y) { return this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); }

  // devolve a ação do jogo: 'newgame' | 'resume' | 'quit' | null
  update(dt) {
    const M = this.menu, T = this.input.touch, tap = T.tap, up = T.tapUp;
    M.t += dt;
    if (M.screen !== this.screen) { this.screen = M.screen; this.scroll = 0; this.press = null; this.tapId = null; }
    if (M.screen === 'press') {
      if (up) { this.audio.start(); this.audio.menuOk(); M.open('main'); }
      return null;
    }
    const id = this._track(tap, up, T.tapDY);
    return id ? this._act(id) : null;
  }

  // segue o dedo sobre os botões; devolve o id do botão solto em cima dele
  _track(tap, up, dy) {
    // dedo novo: acende o botão onde encostou
    if (tap && tap.id !== this.tapId) {
      this.tapId = tap.id; this.scrolled = false;
      const b = this._hit(tap.x0, tap.y0);
      this.press = b ? b.id : null;
      if (b) buzz(6);
    }
    // arrastou: rola a lista (se houver o que rolar) e cancela o botão
    if (tap && tap.moved && this.scrollMax > 0) {
      this.scroll = Math.max(0, Math.min(this.scrollMax, this.scroll - dy));
      this.scrolled = true; this.press = null;
    }
    this.pressInside = !!(tap && this.press && this._hit(tap.x, tap.y)?.id === this.press);
    if (!up) return null;
    const id = this.press, b = this._hit(up.x, up.y);
    this.press = null; this.tapId = null;
    if (!id || this.scrolled || !b || b.id !== id) return null;
    return id;
  }

  // ---------- inventório em pé: ações em botões grandes na parte de baixo ----------
  // devolve 'close' para fechar o inventário
  updateInventory(inv) {
    const I = this.input, T = I.touch;
    if (this.screen !== 'inventory') { this.screen = 'inventory'; this.press = null; this.tapId = null; this.scrollMax = 0; }
    const started = T.tap && T.tap.id !== this.tapId && this._hit(T.tap.x0, T.tap.y0);
    const id = this._track(T.tap, T.tapUp, 0);
    // toque que começou num botão daqui não vale como clique para a tela do inventário
    if (started || this.press || id) { I.mouse.clicked = false; I.mouse.moved = false; }
    if (T.tapUp && this.buttons.length && this._hit(T.tapUp.x0, T.tapUp.y0)) I.mouse.clicked = false;
    if (!id) return null;
    const [, kind, si] = id.split(':');
    if (kind === 'close') { this.audio.menuBack(); return 'close'; }
    if (kind === 'back') { inv.examine = false; inv.menu = null; this.audio.menuBack(); }
    else if (kind === 'use' && inv.slot()) { inv.menu = inv.actions(inv.slot()); inv.menuSel = 0; this.audio.menuOk(); }
    else if (kind === 'act' && inv.menu?.[+si]) inv._do(inv.menu[+si].act);
    return null;
  }

  drawInventory(g, v, inv) {
    this.buttons = [];
    if (!v.portrait) return;
    const s = v.s, P = x => x / s, R = Math.round, vw = v.vw, gr = v.gr, u = v.u;
    const top = gr.y + gr.h, m = Math.max(14, 4 * u), bh = Math.max(48, Math.min(60, 13 * u)), gap = Math.max(10, 3 * u);
    const grd = g.createLinearGradient(0, R(P(top)), 0, v.ch);
    grd.addColorStop(0, '#1c140e'); grd.addColorStop(1, '#070504');
    g.fillStyle = grd; g.fillRect(0, R(P(top)), v.cw, v.ch - R(P(top)));
    const list = [];
    if (inv.examine) list.push(['inv:back', 'VOLTAR']);
    else if (inv.menu) { inv.menu.forEach((a, i) => list.push(['inv:act:' + i, a.label])); list.push(['inv:back', 'CANCELAR']); }
    else { if (inv.slot()) list.push(['inv:use', 'USAR / VER AÇÕES']); list.push(['inv:close', 'FECHAR INVENTÁRIO']); }
    const bw = Math.min(360, vw - 2 * m - 16), h = list.length * bh + (list.length - 1) * gap;
    const y0 = top + Math.max(m, (v.vh - top - h) * 0.4);
    const hint = inv.examine ? 'arraste a imagem para girar' : inv.menu ? 'o que fazer com o item?' : 'toque num espaço para escolher o item';
    drawText(g, hint, P(vw / 2), P(y0 - 26), Math.max(10, R(P(15))), { align: 'center', color: C.soft });
    list.forEach(([id, label], i) => {
      const x = (vw - bw) / 2, y = y0 + i * (bh + gap);
      this.buttons.push({ id, x, y, w: bw, h: bh });
      const on = this.press === id && this.pressInside, lw = Math.max(1, R(1.6 / s));
      g.globalAlpha = on ? 0.95 : 0.85; g.fillStyle = on ? C.gold : C.panel; g.fillRect(R(P(x)), R(P(y)), R(P(bw)), R(P(bh))); g.globalAlpha = 1;
      g.strokeStyle = on ? C.gold : C.edge; g.lineWidth = lw; g.strokeRect(R(P(x)) + lw / 2, R(P(y)) + lw / 2, R(P(bw)) - lw, R(P(bh)) - lw);
      const px = Math.max(10, R(P(bh * 0.4)));
      drawText(g, label, P(x + bw / 2), P(y + bh / 2) - px * 0.62, px, { align: 'center', color: on ? C.dark : C.text, shadow: on ? null : undefined });
    });
  }

  _act(id) {
    const M = this.menu, items = M.items();
    if (id === 'back') {
      if (M.screen === 'pause') { this.audio.menuBack(); return 'resume'; }
      this.audio.menuBack(); M.open(M.returnTo); return null;
    }
    const [kind, si, sd] = id.split(':'), i = +si, it = items[i];
    if (!it) return null;
    M.sel = i;
    if (kind === 'opt') { M.change(it.opt, +sd || 1); return null; }
    return M.activate(it);
  }

  // ---------- desenho ----------
  draw(g, v) {
    const M = this.menu, s = v.s, P = x => x / s;
    this.buttons = [];
    this.scrollMax = 0;
    const vw = v.vw, vh = v.vh, u = v.u, gr = v.gr;
    const m = Math.max(14, 4 * u);                       // margem
    const bh = Math.max(44, Math.min(60, 11.5 * u));     // altura dos botões
    const gap = Math.max(8, 2.6 * u);
    const lw = Math.max(1, Math.round(1.6 / s));
    const R = Math.round;

    const text = (str, x, y, size, color = C.text, o = {}) =>
      drawText(g, str, P(x), P(y), Math.max(9, R(P(size))), { color, align: o.align || 'left', font: o.font, alpha: o.alpha, shadow: o.shadow });
    const fill = (x, y, w, h, color, a = 1) => { g.globalAlpha = a; g.fillStyle = color; g.fillRect(R(P(x)), R(P(y)), R(P(w)), R(P(h))); g.globalAlpha = 1; };
    const frame = (x, y, w, h, color, a = 1) => {
      g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = lw;
      g.strokeRect(R(P(x)) + lw / 2, R(P(y)) + lw / 2, R(P(w)) - lw, R(P(h)) - lw); g.globalAlpha = 1;
    };
    // botão com relevo: fundo escuro, filete claro em cima, borda bege; aceso em dourado
    const button = (id, x, y, w, h, label, o = {}) => {
      this.buttons.push({ id, x, y, w, h });
      const on = this.press === id && this.pressInside;
      fill(x, y, w, h, on ? C.gold : C.panel, on ? 0.95 : 0.82);
      if (!on) fill(x + 1.5 * s, y + 1.5 * s, w - 3 * s, Math.max(s, 2), C.hi, 0.9);
      frame(x, y, w, h, o.danger ? C.danger : on ? C.gold : C.edge, 0.85);
      const size = o.size || h * 0.42;
      const px = Math.max(9, R(P(size)));
      drawText(g, label, P(x + w / 2), P(y + h / 2) - px * 0.62, px,
        { align: 'center', color: on ? C.dark : o.color || C.text, shadow: on ? null : undefined });
    };
    // pilha de botões centralizada
    const stack = (labels, x, y, w, ids, styles = []) => labels.forEach((l, i) => button(ids[i], x, y + i * (bh + gap), w, bh, l, styles[i]));
    const stackH = n => n * bh + (n - 1) * gap;
    const dimAll = a => fill(0, 0, vw, vh, '#000', a);
    // em pé: área de baixo como a parte de baixo de um portátil
    const lower = () => {
      if (!v.portrait) return;
      const top = gr.y + gr.h;
      const grd = g.createLinearGradient(0, R(P(top)), 0, v.ch);
      grd.addColorStop(0, '#1c140e'); grd.addColorStop(1, '#070504');
      g.fillStyle = grd; g.fillRect(0, R(P(top)), v.cw, v.ch - R(P(top)));
      fill(0, top, vw, s, C.dim, 1);
    };
    // área livre para botões: tela toda deitado; parte de baixo em pé
    const area = v.portrait ? { x: 0, y: gr.y + gr.h, w: vw, h: vh - gr.y - gr.h } : { x: 0, y: 0, w: vw, h: vh };
    const bw = Math.min(360, Math.max(220, v.portrait ? vw - 2 * m - 16 : vw * 0.42));

    if (M.screen === 'press' || M.screen === 'main') {
      // vinheta e título
      const grd = g.createLinearGradient(0, 0, 0, v.ch);
      grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.7)');
      g.fillStyle = grd; g.fillRect(0, 0, v.cw, v.ch);
      lower();
      const tSize = v.portrait ? gr.h * 0.26 : Math.min(vh * 0.22, vw * 0.11);
      const tY = v.portrait ? gr.y + gr.h * 0.18 : Math.max(m * 0.6, vh * 0.05);
      text('Teewald', vw / 2, tY, tSize, C.text, { align: 'center', font: FONT_TITLE, shadow: '#4a0d08' });
      fill(vw / 2 - tSize * 1.2, tY + tSize * 1.3, tSize * 2.4, Math.max(s, 1.5), '#b89a62', 1);
      if (M.screen === 'press') {
        const cy = v.portrait ? area.y + area.h * 0.45 : vh * 0.72;
        if (Math.floor(M.t * 1.6) % 2 === 0) text('TOQUE PARA COMEÇAR', vw / 2, cy, Math.max(20, 6 * u), '#f2e6c8', { align: 'center' });
      } else {
        const items = M.items();
        const n = items.length;
        // com CONTINUAR e CAPÍTULOS a pilha pode não caber: encolhe os botões
        const room = v.portrait ? area.h - 2 * m : vh - m - (tY + tSize * 1.3 + gap);
        const bh2 = Math.max(40, Math.min(bh, (room - (n - 1) * gap * 0.7) / n)), gap2 = bh2 < bh ? gap * 0.7 : gap;
        const h = n * bh2 + (n - 1) * gap2;
        const y0 = v.portrait ? area.y + (area.h - h) * 0.42 : Math.max(tY + tSize * 1.3 + gap, vh - m - h);
        items.forEach((it, i) => button('item:' + i, (vw - bw) / 2, y0 + i * (bh2 + gap2), bw, bh2, it.label));
      }
      text('v0.1', vw - m * 0.6, vh - m * 0.6 - 12, 12, C.soft, { align: 'right' });
      return;
    }

    if (M.screen === 'pause' || M.screen === 'confirm') {
      dimAll(M.screen === 'pause' ? 0.55 : 0.72);
      lower();
      const items = M.items(), n = items.length, h = stackH(n);
      const confirm = M.screen === 'confirm';
      const headSize = confirm ? Math.max(20, 6.2 * u) : Math.max(30, 10 * u);
      const head = confirm ? 'VOLTAR AO MENU PRINCIPAL?' : 'PAUSA';
      const sub = confirm ? 'o progresso desta partida será perdido' : '';
      let hy, y0;
      if (v.portrait) {
        hy = gr.y + gr.h * 0.5 - headSize * 0.7;
        y0 = area.y + (area.h - h) * 0.42;
      } else {
        const block = headSize * 1.35 + (sub ? 26 : 0) + gap * 2 + h;
        hy = Math.max(m * 0.6, (vh - block) / 2);
        y0 = hy + headSize * 1.35 + (sub ? 26 : 0) + gap * 2;
      }
      text(head, vw / 2, hy, headSize, C.text, { align: 'center' });
      if (sub) text(sub, vw / 2, hy + headSize * 1.35, Math.max(14, 4.2 * u), C.soft, { align: 'center' });
      stack(items.map(it => it.label), (vw - bw) / 2, y0, bw, items.map((_, i) => 'item:' + i),
        items.map(it => (it.act === 'quit' ? { danger: true } : {})));
      return;
    }

    if (M.screen === 'chapters') {
      // capítulos em grade (duas colunas deitado, uma em pé)
      dimAll(0.86);
      const hh = bh, top = m * 0.7, backW = Math.max(112, 30 * u);
      button('back', m * 0.7, top, backW, hh, '◀ VOLTAR', { size: hh * 0.4 });
      text('CAPÍTULOS', vw / 2, top + (hh - Math.max(22, hh * 0.55) * 1.15) / 2, Math.max(22, hh * 0.55), C.gold, { align: 'center' });
      const items = M.items().filter(it => it.act !== 'back');
      const cols = v.portrait ? 1 : 2, rows = Math.ceil(items.length / cols);
      const y0 = top + hh + gap, availH = vh - y0 - m * 0.6;
      const bh3 = Math.max(40, Math.min(bh, (availH - (rows - 1) * gap * 0.6) / rows));
      const cw = Math.min(380, (vw - 2 * m - (cols - 1) * gap) / cols), x0 = (vw - (cols * cw + (cols - 1) * gap)) / 2;
      items.forEach((it, i) => {
        const c = cols === 1 ? 0 : Math.floor(i / rows), r = cols === 1 ? i : i % rows;
        button('item:' + i, x0 + c * (cw + gap), y0 + r * (bh3 + gap * 0.6), cw, bh3, it.label, { size: Math.min(bh3 * 0.36, cw / (it.label.length * 0.52)) });
      });
      return;
    }

    // opções e créditos: painel na tela inteira, cabeçalho com VOLTAR
    dimAll(0.86);
    const hh = bh, top = m * 0.7;
    const backW = Math.max(112, 30 * u);
    button('back', m * 0.7, top, backW, hh, '◀ VOLTAR', { size: hh * 0.4 });
    const title = M.screen === 'options' ? 'OPÇÕES' : 'CRÉDITOS';
    const titleSize = Math.max(22, hh * 0.55);
    text(title, vw / 2, top + (hh - titleSize * 1.15) / 2, titleSize, C.gold, { align: 'center' });
    const y0 = top + hh + gap, availH = vh - y0 - m * 0.6;

    if (M.screen === 'credits') {
      // texto em cima, botão do site do autor embaixo
      const lines = CREDITS;
      const step = Math.min((availH - bh - gap) / lines.length, Math.max(18, 6 * u));
      const size = step * 0.72;
      lines.forEach(([line, style], i) => {
        if (!line) return;
        const y = y0 + i * step;
        if (style === 'title') text(line, vw / 2, y - step * 0.6, step * 1.8, C.text, { align: 'center', font: FONT_TITLE, shadow: '#4a0d08' });
        else if (style === 'name') text(line, vw / 2, y, size * 1.15, C.text, { align: 'center' });
        else text(line, vw / 2, y, size, style === 'dim' ? C.soft : '#e8dcc0', { align: 'center' });
      });
      const sy = Math.min(y0 + lines.length * step + gap, vh - m * 0.6 - bh);
      button('item:0', (vw - bw) / 2, sy, bw, bh, SITE.label, { size: Math.min(bh * 0.38, bw / (SITE.label.length * 0.5)) });
      return;
    }

    // ---- opções: linhas com [◀] valor [▶], em 1 ou 2 colunas ----
    // guarda o índice na lista completa do Menu (é o que as ações usam)
    const items = M.items().map((it, idx) => ({ ...it, idx })).filter(it => it.opt);
    const cols = vw >= 640 ? 2 : 1, colGap = 3 * u;
    const colW = Math.min(460, (vw - 2 * m - (cols - 1) * colGap) / cols);
    const x0 = (vw - (cols * colW + (cols - 1) * colGap)) / 2;
    const per = Math.ceil(items.length / cols);
    const rh = Math.max(40, Math.min(58, availH / per));
    const contentH = per * rh;
    this.scrollMax = Math.max(0, contentH - availH);
    this.scroll = Math.min(this.scroll, this.scrollMax);
    g.save();
    g.beginPath(); g.rect(0, R(P(y0)), v.cw, R(P(availH))); g.clip();
    items.forEach((it, i) => {
      const col = Math.floor(i / per), row = i % per;
      const x = x0 + col * (colW + colGap), y = y0 + row * rh - this.scroll;
      if (y + rh < y0 || y > y0 + availH) return;
      if (row % 2 === 0) fill(x, y, colW, rh, '#2a1f15', 0.45);
      const o = it.opt, val = M.settings[o.key];
      const btn = Math.min(rh - 8, 48), valW = Math.max(88, Math.min(150, colW * 0.3));
      const gx = x + colW - (2 * btn + valW + 8);
      // nome da opção (encolhe ou quebra em duas linhas para caber)
      const label = it.label.replace(/\s*\(TECLA.*\)/, '');
      const maxW = gx - x - 10;
      let size = Math.min(rh * 0.38, maxW / (label.length * 0.47));
      if (size >= 15 || !label.includes(' ')) text(label, x + 8, y + (rh - size * 1.2) / 2, size, C.text);
      else {
        const sp = label.lastIndexOf(' ', Math.ceil(label.length / 2) + 2);
        const a = sp > 0 ? label.slice(0, sp) : label, b = sp > 0 ? label.slice(sp + 1) : '';
        size = Math.min(rh * 0.32, maxW / (Math.max(a.length, b.length) * 0.47));
        text(a, x + 8, y + rh / 2 - size * 1.15, size, C.text);
        text(b, x + 8, y + rh / 2 + size * 0.05, size, C.text);
      }
      const by = y + (rh - btn) / 2;
      button(`opt:${it.idx}:-1`, gx, by, btn, btn, '◀', { size: btn * 0.5 });
      button(`opt:${it.idx}:1`, gx + btn + valW + 8, by, btn, btn, '▶', { size: btn * 0.5 });
      // valor: barrinha para volume/sensibilidade, texto para o resto (tocar avança)
      const vx = gx + btn + 4;
      this.buttons.push({ id: `opt:${it.idx}:1`, x: vx, y: by, w: valW, h: btn });
      if (typeof val === 'number' && o.values.length >= 10) {
        const n = o.values.length - 1, sw = (valW - 8) / n;
        for (let j = 0; j < n; j++) fill(vx + 4 + j * sw + 1, by + btn * 0.3, sw - 2, btn * 0.4, j < val ? C.gold : '#3a2c1e', j < val ? 0.95 : 0.8);
      } else {
        const t = o.fmt(val).replace(' (PS1)', ' PS1');
        const ts = Math.min(btn * 0.46, (valW - 6) / (t.length * 0.47));
        text(t, vx + valW / 2, by + (btn - ts * 1.2) / 2, ts, '#fff2d0', { align: 'center' });
      }
    });
    g.restore();
    // barra de rolagem
    if (this.scrollMax > 0) {
      const tr = availH, th = Math.max(30, tr * availH / contentH), ty = y0 + (tr - th) * (this.scroll / this.scrollMax);
      fill(vw - 6, y0, 3, tr, '#2a1f15', 0.8);
      fill(vw - 6, ty, 3, th, C.edge, 0.8);
    }
  }
}
