import { drawText, textSprite, FONT_TITLE } from './overlay.js';
import { tr } from '../i18n/index.js';
import { CREDITS, SITE, statusLine } from './menu.js';
import { buzz } from '../engine/touch.js';

// Menus no celular: botões grandes (≥ 44 px CSS) desenhados na camada de toque,
// que cobre a tela inteira (em pé, os botões ficam na parte de baixo, sob a imagem).
// O botão acende ao encostar o dedo e só age ao soltar em cima dele. Nenhum botão fica
// fora da tela, em pé ou deitado, em qualquer tamanho: a grade passa para 2 ou 3 colunas
// quando a tela é baixa e, se nem assim couber, a faixa dos botões rola com o dedo.
// Usa as mesmas telas e ações do Menu.

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
    this.zone = null;         // faixa que rola { y, h } (px CSS); arrastar só rola se começar nela
    this.clip = null;         // faixa sendo desenhada com rolagem
    this.screen = null;
  }

  _hit(x, y) { return this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); }
  _inZone(y) { const z = this.zone; return !!z && y >= z.y && y <= z.y + z.h; }

  // guarda a área de toque de um botão; dentro da faixa que rola, só a parte visível vale
  _push(id, x, y, w, h) {
    const c = this.clip;
    if (c) {
      const y1 = Math.max(y, c.y), y2 = Math.min(y + h, c.y + c.h);
      if (y2 - y1 < 12) return;
      if (y1 > y || y2 < y + h) { this.buttons.push({ id, x, y: y1, w, h: y2 - y1, cut: true }); return; }
    }
    this.buttons.push({ id, x, y, w, h });
  }

  // grade de n botões na faixa w × h: tenta 1, 2, 3 colunas (cada uma com pelo menos minW)
  // até os botões caberem com min px de altura ou mais; se nem assim couber, fica com a de
  // mais colunas e a faixa rola. Ordem: desce a coluna e passa para a próxima.
  _grid(n, w, h, { bh, gap, colW, minW = 135, maxCols = 3, min = 44 }) {
    let G = null;
    for (let cols = 1; cols <= Math.max(1, Math.min(maxCols, n)); cols++) {
      const cw = Math.min(colW, (w - (cols - 1) * gap) / cols);
      if (cols > 1 && cw < minW) break;
      const rows = Math.ceil(n / cols);
      // aperta o espaço entre os botões antes de encolher os botões
      let gp = gap, fh = (h - (rows - 1) * gp) / rows;
      if (fh < bh) { gp = gap * 0.7; fh = (h - (rows - 1) * gp) / rows; }
      G = { cols, rows, colW: cw, gap: gp, bh: Math.max(min, Math.min(bh, fh)) };
      if (fh >= min) break;
    }
    G.w = G.cols * G.colW + (G.cols - 1) * G.gap;
    G.h = G.rows * G.bh + (G.rows - 1) * G.gap;
    G.at = i => [Math.floor(i / G.rows) * (G.colW + G.gap), (i % G.rows) * (G.bh + G.gap)];
    return G;
  }

  // abre uma faixa da tela [y, y + h] com conteúdo de altura contentH: se não couber, recorta
  // o desenho na faixa e devolve quanto rolar (0 quando cabe)
  _scrollBegin(g, v, y, h, contentH) {
    this.zone = { y, h };
    this.scrollMax = Math.max(0, Math.ceil(contentH - h));
    this.scroll = Math.max(0, Math.min(this.scroll, this.scrollMax));
    if (!this.scrollMax) { this.clip = null; return 0; }
    this.clip = { y, h, contentH };
    g.save(); g.beginPath(); g.rect(0, Math.round(y / v.s), v.cw, Math.round(h / v.s)); g.clip();
    return this.scroll;
  }

  // fecha a faixa: barra de rolagem e setas avisando que tem mais em cima ou embaixo
  _scrollEnd(g, v) {
    const c = this.clip;
    if (!c) return;
    this.clip = null;
    g.restore();
    // tudo na margem direita (os botões nunca chegam nela): ▲, trilho com a barra, ▼
    const s = v.s, P = x => Math.round(x / s), a = 12, cx = v.vw - 6, bw = Math.max(1, P(4));
    const y0 = c.y + a + 4, h = c.h - 2 * (a + 4);
    const th = Math.max(Math.min(30, h), h * c.h / c.contentH), ty = y0 + (h - th) * (this.scroll / this.scrollMax);
    g.globalAlpha = 0.85; g.fillStyle = '#2a1f15'; g.fillRect(P(cx - 2), P(y0), bw, P(h));
    g.fillStyle = C.edge; g.fillRect(P(cx - 2), P(ty), bw, P(th)); g.globalAlpha = 1;
    const ap = Math.max(9, P(a));
    drawText(g, '▲', P(cx), P(c.y), ap, { align: 'center', color: C.gold, alpha: this.scroll > 1 ? 1 : 0.3, raw: true });
    drawText(g, '▼', P(cx), P(c.y + c.h - a * 1.15), ap, { align: 'center', color: C.gold, alpha: this.scroll < this.scrollMax - 1 ? 1 : 0.3, raw: true });
  }

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
    // arrastou na faixa que rola: rola a lista (se houver o que rolar) e cancela o botão
    if (tap && tap.moved && this.scrollMax > 0 && this._inZone(tap.y0)) {
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
    if (this.screen !== 'inventory') { this.screen = 'inventory'; this.press = null; this.tapId = null; this.scroll = this.scrollMax = 0; }
    const started = T.tap && T.tap.id !== this.tapId && this._hit(T.tap.x0, T.tap.y0);
    const id = this._track(T.tap, T.tapUp, T.tapDY);
    // toque que começou num botão daqui (ou que rola os botões) não vale como clique para a tela do inventário
    if (started || this.press || id || this.scrolled) { I.mouse.clicked = false; I.mouse.moved = false; }
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
    this.buttons = []; this.zone = null; this.scrollMax = 0;
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
    // faixa dos botões embaixo da dica; em celular baixo vira duas colunas ou rola
    const zt = top + m * 0.5 + 26, zh = v.vh - m * 0.5 - zt;
    const G = this._grid(list.length, vw - 2 * m, zh, { bh, gap, colW: Math.min(360, vw - 2 * m - 16), maxCols: 2 });
    const yy = zt + Math.max(0, (zh - G.h) * 0.4);
    const hint = inv.examine ? 'arraste a imagem para girar' : inv.menu ? 'o que fazer com o item?' : 'toque num espaço para escolher o item';
    drawText(g, hint, P(vw / 2), P(yy - 26), Math.max(10, R(P(15))), { align: 'center', color: C.soft });
    const off = this._scrollBegin(g, v, zt, zh, G.h), x0 = (vw - G.w) / 2;
    list.forEach(([id, label], i) => {
      const [dx, dy] = G.at(i), x = x0 + dx, y = yy + dy - off, bw = G.colW, bh2 = G.bh;
      this._push(id, x, y, bw, bh2);
      const on = this.press === id && this.pressInside, lw = Math.max(1, R(1.6 / s));
      g.globalAlpha = on ? 0.95 : 0.85; g.fillStyle = on ? C.gold : C.panel; g.fillRect(R(P(x)), R(P(y)), R(P(bw)), R(P(bh2))); g.globalAlpha = 1;
      g.strokeStyle = on ? C.gold : C.edge; g.lineWidth = lw; g.strokeRect(R(P(x)) + lw / 2, R(P(y)) + lw / 2, R(P(bw)) - lw, R(P(bh2)) - lw);
      let px = Math.max(10, R(P(bh2 * 0.4)));
      const tw = textSprite(label, px).w, room = P(bw - 10);
      if (tw > room) px = Math.max(9, Math.floor(px * room / tw));
      drawText(g, label, P(x + bw / 2), P(y + bh2 / 2) - px * 0.62, px, { align: 'center', color: on ? C.dark : C.text, shadow: on ? null : undefined });
    });
    this._scrollEnd(g, v);
  }

  // ---------- caderno (ARQUIVOS) em pé: abas, rolagem e ações em botões grandes embaixo ----------
  // devolve 'close' para fechar o caderno
  updateJournal(J) {
    const I = this.input, T = I.touch;
    if (this.screen !== 'journal') { this.screen = 'journal'; this.press = null; this.tapId = null; this.scroll = this.scrollMax = 0; }
    const started = T.tap && T.tap.id !== this.tapId && this._hit(T.tap.x0, T.tap.y0);
    const id = this._track(T.tap, T.tapUp, T.tapDY);
    if (started || this.press || id || this.scrolled) { I.mouse.clicked = false; I.mouse.moved = false; }
    if (T.tapUp && this.buttons.length && this._hit(T.tapUp.x0, T.tapUp.y0)) I.mouse.clicked = false;
    if (!id) return null;
    const kind = id.split(':')[1];
    if (kind === 'close') { this.audio.menuBack(); return 'close'; }
    J.touchAct(kind);
    return null;
  }

  drawJournal(g, v, J) {
    this.buttons = []; this.zone = null; this.scrollMax = 0;
    if (!v.portrait) return;
    const s = v.s, P = x => x / s, R = Math.round, vw = v.vw, gr = v.gr, u = v.u;
    const top = gr.y + gr.h, m = Math.max(14, 4 * u), bh = Math.max(48, Math.min(60, 13 * u)), gap = Math.max(10, 3 * u);
    const grd = g.createLinearGradient(0, R(P(top)), 0, v.ch);
    grd.addColorStop(0, '#1c140e'); grd.addColorStop(1, '#070504');
    g.fillStyle = grd; g.fillRect(0, R(P(top)), v.cw, v.ch - R(P(top)));
    // linhas de botões: [◀ aba ▶] [▲ ▼] [ABRIR] [FECHAR] (com o papel aberto: PRÓXIMA e VOLTAR)
    const more = J.paper.isOpen && J.paper.page < J.paper.pages.length - 1;
    const rows = J.paper.isOpen ? [...(more ? [[['jr:next', 'PRÓXIMA PÁGINA', 1]]] : []), [['jr:back', 'VOLTAR', 1]]]
      : [[['jr:prev', '◀ ABA', 0.5], ['jr:tab', '▶ ABA', 0.5]], [['jr:up', '▲', 0.5], ['jr:down', '▼', 0.5]], ...(J.canOpen() ? [[['jr:open', 'ABRIR', 1]]] : []), [['jr:close', 'FECHAR', 1]]];
    // em celular baixo os botões encolhem até 44 px e, se nem assim couber, a faixa rola
    const bw = Math.min(380, vw - 2 * m - 16), zt = top + m * 0.5, zh = v.vh - m * 0.5 - zt, n = rows.length;
    const gp = (zh - n * bh) / (n - 1 || 1) < gap ? gap * 0.7 : gap;
    const bh2 = Math.max(44, Math.min(bh, (zh - (n - 1) * gp) / n)), h = n * bh2 + (n - 1) * gp;
    const off = this._scrollBegin(g, v, zt, zh, h);
    const y0 = zt + Math.max(0, (zh - h) * 0.4) - off;
    rows.forEach((row, i) => {
      let x = (vw - bw) / 2;
      const y = y0 + i * (bh2 + gp);
      for (const [id, label, f] of row) {
        const w = bw * f - (row.length > 1 ? gp / 2 : 0);
        this._push(id, x, y, w, bh2);
        const on = this.press === id && this.pressInside, lw = Math.max(1, R(1.6 / s));
        g.globalAlpha = on ? 0.95 : 0.85; g.fillStyle = on ? C.gold : C.panel; g.fillRect(R(P(x)), R(P(y)), R(P(w)), R(P(bh2))); g.globalAlpha = 1;
        g.strokeStyle = on ? C.gold : C.edge; g.lineWidth = lw; g.strokeRect(R(P(x)) + lw / 2, R(P(y)) + lw / 2, R(P(w)) - lw, R(P(bh2)) - lw);
        let px = Math.max(10, R(P(bh2 * 0.4)));
        const tw = textSprite(label, px).w, room = P(w - 10);
        if (tw > room) px = Math.max(9, Math.floor(px * room / tw));
        drawText(g, label, P(x + w / 2), P(y + bh2 / 2) - px * 0.62, px, { align: 'center', color: on ? C.dark : C.text, shadow: on ? null : undefined });
        x += w + gp;
      }
    });
    this._scrollEnd(g, v);
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
    this.scrollMax = 0; this.zone = null; this.clip = null;
    const vw = v.vw, vh = v.vh, u = v.u, gr = v.gr;
    const m = Math.max(14, 4 * u);                       // margem
    const bh = Math.max(44, Math.min(60, 11.5 * u));     // altura dos botões
    const gap = Math.max(8, 2.6 * u);
    const lw = Math.max(1, Math.round(1.6 / s));
    const R = Math.round;

    const text = (str, x, y, size, color = C.text, o = {}) =>
      drawText(g, str, P(x), P(y), Math.max(9, R(P(size))), { color, align: o.align || 'left', font: o.font, alpha: o.alpha, shadow: o.shadow, raw: o.raw });
    const fill = (x, y, w, h, color, a = 1) => { g.globalAlpha = a; g.fillStyle = color; g.fillRect(R(P(x)), R(P(y)), R(P(w)), R(P(h))); g.globalAlpha = 1; };
    const frame = (x, y, w, h, color, a = 1) => {
      g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = lw;
      g.strokeRect(R(P(x)) + lw / 2, R(P(y)) + lw / 2, R(P(w)) - lw, R(P(h)) - lw); g.globalAlpha = 1;
    };
    // botão com relevo: fundo escuro, filete claro em cima, borda bege; aceso em dourado
    const button = (id, x, y, w, h, label, o = {}) => {
      this._push(id, x, y, w, h);
      const on = this.press === id && this.pressInside;
      fill(x, y, w, h, on ? C.gold : C.panel, on ? 0.95 : 0.82);
      if (!on) fill(x + 1.5 * s, y + 1.5 * s, w - 3 * s, Math.max(s, 2), C.hi, 0.9);
      frame(x, y, w, h, o.danger ? C.danger : on ? C.gold : C.edge, 0.85);
      const size = o.size || h * 0.42;
      let px = Math.max(9, R(P(size)));
      // o texto traduzido pode ser mais comprido: encolhe para caber no botão
      const tw = textSprite(label, px).w, room = P(w - 10);
      if (tw > room) px = Math.max(9, Math.floor(px * room / tw));
      drawText(g, label, P(x + w / 2), P(y + h / 2) - px * 0.62, px,
        { align: 'center', color: on ? C.dark : o.color || C.text, shadow: on ? null : undefined });
    };
    // n botões em grade na faixa [top, top + h], centrados na largura; align diz onde fica a
    // sobra de altura (0 = embaixo dos botões, 1 = em cima); se não couber, a faixa rola
    const grid = (n, top, h, o, align, each, G = this._grid(n, vw - 2 * m, h, { bh, gap, colW: bw, ...o })) => {
      const off = this._scrollBegin(g, v, top, h, G.h);
      const x0 = (vw - G.w) / 2, y0 = top + Math.max(0, (h - G.h) * align) - off;
      for (let i = 0; i < n; i++) { const [dx, dy] = G.at(i); each(i, x0 + dx, y0 + dy, G.colW, G.bh); }
      this._scrollEnd(g, v);
    };
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
        text('v0.1', vw - m * 0.6, vh - m * 0.6 - 12, 12, C.soft, { align: 'right' });
      } else {
        // em pé: na parte de baixo; deitado: embaixo do título, encostados no pé da tela
        const items = M.items();
        const top = v.portrait ? area.y + m * 0.5 : tY + tSize * 1.3 + gap;
        const h = (v.portrait ? vh - m * 0.5 : vh - m) - top;
        const G = this._grid(items.length, vw - 2 * m, h, { bh, gap, colW: bw });
        if (G.h <= h) text('v0.1', vw - m * 0.6, vh - m * 0.6 - 12, 12, C.soft, { align: 'right' });   // rolando, a seta ▼ fica ali
        grid(items.length, top, h, {}, v.portrait ? 0.42 : 1, (i, x, y, w, bh2) => button('item:' + i, x, y, w, bh2, items[i].label), G);
      }
      return;
    }

    if (M.screen === 'pause' || M.screen === 'confirm' || M.screen === 'erase') {
      dimAll(M.screen === 'pause' ? 0.55 : 0.72);
      lower();
      const items = M.items(), n = items.length;
      const confirm = M.screen === 'confirm' || M.screen === 'erase', erase = M.screen === 'erase';
      const headSize = confirm ? Math.max(20, 6.2 * u) : Math.max(30, 10 * u);
      const head = erase ? 'APAGAR TODO O PROGRESSO?' : confirm ? 'VOLTAR AO MENU PRINCIPAL?' : 'PAUSA';
      const sub = erase ? 'capítulos liberados, notas e status salvos' : confirm ? 'o progresso fica salvo para CONTINUAR' : '';
      const headH = headSize * 1.35 + (sub ? 26 : 0) + gap * 2;
      let hy, top, h, align, G;
      if (v.portrait) {
        hy = gr.y + gr.h * 0.5 - headSize * 0.7;
        top = area.y + m * 0.5; h = area.h - m; align = 0.42;
      } else {
        // título e botões centrados juntos; em tela baixa os botões rolam embaixo do título
        G = this._grid(n, vw - 2 * m, vh - 1.2 * m - headH, { bh, gap, colW: bw, maxCols: 2 });
        hy = Math.max(m * 0.6, (vh - headH - G.h) / 2);
        top = hy + headH; h = vh - m * 0.6 - top; align = 0;
      }
      text(head, vw / 2, hy, headSize, C.text, { align: 'center' });
      if (sub) text(sub, vw / 2, hy + headSize * 1.35, Math.max(14, 4.2 * u), C.soft, { align: 'center' });
      grid(n, top, h, { maxCols: 2 }, align, (i, x, y, w, bh2) =>
        button('item:' + i, x, y, w, bh2, items[i].label, items[i].act === 'quit' || items[i].act === 'erase' ? { danger: true } : {}), G);
      return;
    }

    if (M.screen === 'chapters') {
      // capítulos em grade (uma coluna em pé; deitado, duas ou três, e rola se não couber)
      dimAll(0.86);
      const hh = bh, top = m * 0.7, backW = Math.max(112, 30 * u);
      button('back', m * 0.7, top, backW, hh, '◀ VOLTAR', { size: hh * 0.4 });
      text('CAPÍTULOS', vw / 2, top + (hh - Math.max(22, hh * 0.55) * 1.15) / 2, Math.max(22, hh * 0.55), C.gold, { align: 'center' });
      const st = Math.max(12, 3.4 * u);
      text(statusLine(M.saved), vw / 2, top + hh + gap * 0.3, st, C.soft, { align: 'center' });
      const items = M.items().filter(it => it.act !== 'back');
      const y0 = top + hh + gap + st * 1.4, availH = vh - y0 - m * 0.6;
      grid(items.length, y0, availH, { gap: gap * 0.6, colW: 380, minW: 200, maxCols: v.portrait ? 2 : 3 }, 0, (i, x, y, cw, bh3) => {
        const it = items[i];
        button('item:' + i, x, y, cw, bh3, it.label, { size: Math.min(bh3 * 0.36, cw / (it.label.length * 0.52)), color: it.locked ? C.dim : undefined, danger: it.act === 'eraseAsk' });
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
      // texto em cima, botão do site do autor embaixo; a letra não fica miúda: em tela baixa, rola
      const lines = CREDITS;
      const step = Math.max(18, Math.min((availH - bh - gap) / (lines.length + 0.6), Math.max(18, 6 * u)));
      // a linha mais comprida tem que caber na largura (retrato); VT323 ≈ 0,4 em por letra
      const longest = Math.max(...lines.filter(([, st]) => st !== 'title').map(([l]) => l.length));
      const size = Math.min(step * 0.72, (vw - 2 * m) / (longest * 0.44));
      const textH = (lines.length + 0.6) * step;
      const off = this._scrollBegin(g, v, y0, availH, textH + gap + bh);
      lines.forEach(([line, style], i) => {
        if (!line) return;
        const y = y0 + (i + 0.6) * step - off;
        if (style === 'title') text(line, vw / 2, y - step * 0.6, step * 1.8, C.text, { align: 'center', font: FONT_TITLE, shadow: '#4a0d08' });
        else if (style === 'name') text(line, vw / 2, y, size * 1.15, C.text, { align: 'center' });
        else text(line, vw / 2, y, size, style === 'dim' ? C.soft : '#e8dcc0', { align: 'center' });
      });
      button('item:0', (vw - bw) / 2, y0 + textH + gap - off, bw, bh, SITE.label, { size: Math.min(bh * 0.38, bw / (SITE.label.length * 0.5)) });
      this._scrollEnd(g, v);
      return;
    }

    // ---- opções: linhas com [◀] valor [▶], em 1 ou 2 colunas ----
    // guarda o índice na lista completa do Menu (é o que as ações usam)
    const items = M.items().map((it, idx) => ({ ...it, idx })).filter(it => it.opt);
    const cols = vw >= 640 ? 2 : 1, colGap = 3 * u;
    const colW = Math.min(460, (vw - 2 * m - (cols - 1) * colGap) / cols);
    const x0 = (vw - (cols * colW + (cols - 1) * colGap)) / 2;
    const per = Math.ceil(items.length / cols);
    const rh = Math.max(50, Math.min(58, availH / per));
    const off = this._scrollBegin(g, v, y0, availH, per * rh);
    items.forEach((it, i) => {
      const col = Math.floor(i / per), row = i % per;
      const x = x0 + col * (colW + colGap), y = y0 + row * rh - off;
      if (y + rh < y0 || y > y0 + availH) return;
      if (row % 2 === 0) fill(x, y, colW, rh, '#2a1f15', 0.45);
      const o = it.opt, val = M.settings[o.key];
      const btn = Math.min(rh - 6, 48), valW = Math.max(88, Math.min(150, colW * 0.3));
      const gx = x + colW - (2 * btn + valW + 8);
      // nome da opção (encolhe ou quebra em duas linhas para caber)
      // traduzido antes de medir e quebrar; sai a tecla entre parênteses: '(TECLA M)'
      const label = tr(it.label).replace(/\s*\([^)]*\b[A-Z]\b[^)]*\)$/, '');
      const maxW = gx - x - 10;
      let size = Math.min(rh * 0.38, maxW / (label.length * 0.47));
      if (size >= 15 || !label.includes(' ')) text(label, x + 8, y + (rh - size * 1.2) / 2, size, C.text, { raw: true });
      else {
        const sp = label.lastIndexOf(' ', Math.ceil(label.length / 2) + 2);
        const a = sp > 0 ? label.slice(0, sp) : label, b = sp > 0 ? label.slice(sp + 1) : '';
        size = Math.min(rh * 0.32, maxW / (Math.max(a.length, b.length) * 0.47));
        text(a, x + 8, y + rh / 2 - size * 1.15, size, C.text, { raw: true });
        text(b, x + 8, y + rh / 2 + size * 0.05, size, C.text, { raw: true });
      }
      const by = y + (rh - btn) / 2;
      button(`opt:${it.idx}:-1`, gx, by, btn, btn, '◀', { size: btn * 0.5 });
      button(`opt:${it.idx}:1`, gx + btn + valW + 8, by, btn, btn, '▶', { size: btn * 0.5 });
      // valor: barrinha para volume/sensibilidade, texto para o resto (tocar avança)
      const vx = gx + btn + 4;
      this._push(`opt:${it.idx}:1`, vx, by, valW, btn);
      if (typeof val === 'number' && o.values.length >= 10) {
        const n = o.values.length - 1, sw = (valW - 8) / n;
        for (let j = 0; j < n; j++) fill(vx + 4 + j * sw + 1, by + btn * 0.3, sw - 2, btn * 0.4, j < val ? C.gold : '#3a2c1e', j < val ? 0.95 : 0.8);
      } else {
        const t = tr(o.fmt(val)).replace(' (PS1)', ' PS1');
        const ts = Math.min(btn * 0.46, (valW - 6) / (t.length * 0.47));
        text(t, vx + valW / 2, by + (btn - ts * 1.2) / 2, ts, '#fff2d0', { align: 'center', raw: true });
      }
    });
    this._scrollEnd(g, v);
  }
}
