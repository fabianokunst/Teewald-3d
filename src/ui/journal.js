import { drawText } from './overlay.js';
import { DOCS, LEGENDS } from '../game/lore.js';
import { Paper } from './paper.js';

// O caderno de ARQUIVOS, LENDAS e PEDIDOS (pausa → ARQUIVOS, tecla J); o papel aberto
// é o de ui/paper.js. O caderno funciona com teclado, controle, mouse e toque: ↑↓
// escolhe, ←→ (Q/E, LB/RB) troca de aba, ENTER/A abre, ESC/B volta.

// ---------- caderno ----------
const TABS = ['ARQUIVOS', 'LENDAS', 'PEDIDOS'];

export class Journal {
  // extras: estado salvo (docs, legends, quests)
  constructor(input, audio, extras) {
    this.input = input; this.audio = audio; this.extras = extras;
    this.tab = 0; this.sel = 0; this.scroll = 0; this.t = 0; this.rects = [];
    this.paper = new Paper();
  }

  open(tab = null) { if (tab !== null) this.tab = tab; this.sel = 0; this.scroll = 0; this.t = 0; this.paper.close(); this.audio.menuOk(); }

  rows() {
    const S = this.extras.state;
    if (this.tab === 0) return DOCS.filter(d => S.docs.includes(d.id)).map(d => ({ label: d.title, sub: d.kind, doc: d }));
    if (this.tab === 1) return LEGENDS.map(l => (S.legends.includes(l.id) ? { label: l.name, sub: l.sub, doc: { kind: 'LENDAS DO HERVAL', title: l.name, pages: [[l.sub.toUpperCase(), ...l.text]] } } : { label: '???', sub: 'ainda não vista', locked: true }));
    return this.extras.questRows().map(q => ({ label: q.label, sub: q.status, done: q.done }));
  }

  // botões grandes do celular em pé (touchMenu.drawJournal)
  canOpen() { const r = this.rows()[this.sel]; return !!r?.doc; }
  touchAct(kind) {
    const rows = this.rows(), n = rows.length;
    if (this.paper.isOpen) {
      if (kind === 'back') { this.paper.close(); this.audio.menuBack(); }
      else if (kind === 'next') { if (this.paper.page < this.paper.pages.length - 1) this.paper.page++; else this.paper.close(); this.audio.menuMove(); }
      return;
    }
    if (kind === 'prev' || kind === 'tab') { this.tab = (this.tab + (kind === 'tab' ? 1 : -1) + TABS.length) % TABS.length; this.sel = 0; this.scroll = 0; this.audio.menuMove(); }
    else if ((kind === 'up' || kind === 'down') && n) { this.sel = (this.sel + (kind === 'down' ? 1 : -1) + n) % n; this.audio.menuMove(); }
    else if (kind === 'open' && rows[this.sel]?.doc) { this.paper.open(rows[this.sel].doc); this.audio.menuOk(); }
  }

  // devolve 'close' para sair do caderno
  update(dt, input, mouse) {
    this.t += dt;
    if (this.paper.isOpen) { this.paper.update(dt, input); return null; }
    const rows = this.rows();
    let click = null;
    if (mouse && (input.mouse.moved || input.mouse.clicked)) {
      const [mx, my] = mouse;
      for (const r of this.rects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'row' && input.mouse.moved && this.sel !== r.i) { this.sel = r.i; this.audio.menuMove(); }
        if (input.mouse.clicked) click = r;
      }
    }
    if (click?.kind === 'close' || input.back() || input.hit('KeyJ')) { this.audio.menuBack(); return 'close'; }
    const tabTo = t => { this.tab = (t + TABS.length) % TABS.length; this.sel = 0; this.scroll = 0; this.audio.menuMove(); };
    if (click?.kind === 'tab') { tabTo(click.i); return null; }
    if (input.left() || input.hit('KeyQ') || input.padHit('lb')) { tabTo(this.tab - 1); return null; }
    if (input.right() || input.hit('KeyE') || input.padHit('rb')) { tabTo(this.tab + 1); return null; }
    if (rows.length) {
      if (input.up()) { this.sel = (this.sel - 1 + rows.length) % rows.length; this.audio.menuMove(); }
      if (input.downNav()) { this.sel = (this.sel + 1) % rows.length; this.audio.menuMove(); }
      const openIt = i => { const r = rows[i]; if (r?.doc) { this.paper.open(r.doc); this.audio.menuOk(); } else if (r?.locked) this.audio.menuBack(); };
      if (click?.kind === 'row') { this.sel = click.i; openIt(click.i); }
      else if (input.confirm()) openIt(this.sel);
    }
    return null;
  }

  draw(g, W, H, device) {
    const k = H / 240, R = Math.round, touch = device === 'touch';
    this.rects = [];
    g.globalAlpha = 0.93; g.fillStyle = '#080605'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    const pw = Math.min(W - 16 * k, 320 * k), px = R((W - pw) / 2), top = 8 * k, th = (touch ? 26 : 20) * k;
    // abas
    const S = this.extras.state;
    const counts = [`${S.docs.length}/${DOCS.length}`, `${S.legends.length}/${LEGENDS.length}`, ''];
    const tw = pw / TABS.length;
    TABS.forEach((t, i) => {
      const x = px + i * tw, on = i === this.tab;
      g.fillStyle = on ? '#3a2a18' : '#18120c'; g.fillRect(R(x + 2 * k), R(top), R(tw - 4 * k), R(th));
      g.strokeStyle = on ? '#f2c879' : '#6b5a40'; g.lineWidth = 1; g.strokeRect(R(x + 2 * k) + 0.5, R(top) + 0.5, R(tw - 4 * k) - 1, R(th) - 1);
      drawText(g, t + (counts[i] ? '  ' + counts[i] : ''), x + tw / 2, top + th / 2 - 6 * k, 12 * k, { align: 'center', color: on ? '#f2c879' : '#a89878' });
      this.rects.push({ kind: 'tab', i, x, y: top, w: tw, h: th + 2 * k });
    });
    // lista
    const rows = this.rows(), rh = (touch ? 28 : 18) * k, ly = top + th + 8 * k, lh = H - ly - 26 * k;
    const vis = Math.max(1, Math.floor(lh / rh));
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + vis) this.scroll = this.sel - vis + 1;
    if (!rows.length) {
      const empty = this.tab === 0 ? 'Nenhum documento achado ainda. Procure papéis pela cidade.' : 'Nada por aqui ainda.';
      drawText(g, empty, W / 2, ly + 30 * k, 11 * k, { align: 'center', color: '#8a7a60' });
    }
    rows.slice(this.scroll, this.scroll + vis).forEach((r, j) => {
      const i = this.scroll + j, y = ly + j * rh, on = i === this.sel;
      if (on) { g.globalAlpha = 0.8; g.fillStyle = '#2a1f15'; g.fillRect(px, R(y), R(pw), R(rh - 2 * k)); g.globalAlpha = 1; }
      const col = r.locked ? '#5e5444' : r.done ? '#8fae78' : on ? '#f2c879' : '#e0d2b4';
      drawText(g, (on ? '▶ ' : '  ') + r.label, px + 4 * k, y + (touch ? 3 : 1) * k, 12 * k, { color: col });
      if (r.sub) drawText(g, r.sub, px + pw - 4 * k, y + (touch ? 15 : 3) * k, 9 * k, { align: 'right', color: r.locked ? '#4a4236' : '#9a8a6a' });
      this.rects.push({ kind: 'row', i, x: px, y, w: pw, h: rh });
    });
    if (this.scroll > 0) drawText(g, '▲', px + pw / 2, ly - 8 * k, 9 * k, { align: 'center', color: '#a89878' });
    if (this.scroll + vis < rows.length) drawText(g, '▼', px + pw / 2, ly + vis * rh - 4 * k, 9 * k, { align: 'center', color: '#a89878' });
    // fechar (no toque, um botão de verdade)
    const bw = 30 * k, bh = 18 * k, bx = R(W - bw - 6 * k), by = R(H - bh - 4 * k);
    if (touch) {
      g.globalAlpha = 0.9; g.fillStyle = '#18120c'; g.fillRect(bx, by, R(bw), R(bh)); g.globalAlpha = 1;
      g.strokeStyle = '#d8c8a0'; g.strokeRect(bx + 0.5, by + 0.5, R(bw) - 1, R(bh) - 1);
      drawText(g, '✕', bx + bw / 2, by + 2 * k, 13 * k, { align: 'center', color: '#efe2c4' });
      this.rects.push({ kind: 'close', x: bx - 4 * k, y: by - 4 * k, w: bw + 8 * k, h: bh + 8 * k });
    }
    const hint = device === 'pad' ? '↑↓ escolher   LB/RB aba   A abrir   B voltar' : touch ? 'toque na aba ou no item' : '↑↓ escolher   ←→ aba   ENTER abrir   ESC voltar';
    drawText(g, hint, touch ? 8 * k : W / 2, H - 16 * k, 10 * k, { align: touch ? 'left' : 'center', color: '#a89878' });
    this.paper.draw(g, W, H, device);
  }
}
