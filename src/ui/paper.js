import { drawText, FONT_UI, FONT_TITLE, FONT_HAND, FONT_TYPE } from './overlay.js';
import { docArt } from '../game/docArt.js';
import { tr, getLang } from '../i18n/index.js';

// O papel na tela: documentos achados, fichas de lenda, o cartaz do capítulo 1, a ata,
// o diário e o álbum dos capítulos. O que o papel "tem" aparece desenhado, não descrito:
// letra à mão, carimbo, rasura, foto, desenho. O texto é traduzido antes de quebrar as linhas
// (i18n/index.js); nomes, assinaturas e a lista telefônica ficam como estão.
//
// doc = { kind, title, paper, marks, pages: [página] }
// página = [blocos] ou { paper, marks, label, blocks } (outro papel: verso, envelope)
// blocos:
//   'texto'                         parágrafo impresso
//   { t, s, align, color, size }    parágrafo num estilo de STYLE (letra à mão, máquina...)
//        strike: true               riscado
//        ring: true                 a linha circulada (caneta vermelha)
//        words: 'bixo visinha'      palavras circuladas (traduzidas junto com o texto)
//   { img, w, h, align, corners }   desenho de game/docArt.js (w, h = fração da largura/altura)
//   { stamp, color, round, rot, align }  carimbo ('\n' separa as linhas)
//   { sign, s, align }              assinatura com o traço embaixo
//   { scribble: true, label }       assinatura ilegível e o cargo embaixo
//   { note: 'texto', s, bg }        bilhete colado em cima (papel de outra cor)
//   { entry: [nome, endereço, número], ring }  linha de lista telefônica
//   { rule: true }                  traço
// marks: 'torn' (canto rasgado), 'stain' (mancha escura), 'blot' (borrão de tinta),
//        'fold3' (vincos de carta), 'selo' (selo no canto)

let mctx = null;
export function measure(text, size, font = FONT_UI) {
  mctx ||= document.createElement('canvas').getContext('2d');
  mctx.font = `${Math.round(size)}px ${font}`;
  return mctx.measureText(text).width;
}
export function wrap(text, size, maxW, font = FONT_UI) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && measure(t, size, font) > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const norm = w => w.toLowerCase().replace(/[.,;:!?"()]/g, '');

// estilos de letra (tamanho e entrelinha em px de 240 linhas; sem cor = a tinta do papel)
const STYLE = {
  print: { font: FONT_UI, size: 12, lh: 11.5 },
  small: { font: FONT_UI, size: 10, lh: 9.5, color: '#5e5040' },
  head: { font: FONT_UI, size: 17, lh: 14 },
  poster: { font: FONT_UI, size: 23, lh: 18 },
  mast: { font: FONT_TITLE, size: 21, lh: 18 },
  type: { font: FONT_TYPE, size: 10.5, lh: 11 },
  hand: { font: FONT_HAND, size: 15, lh: 12.5, color: '#22306a' },    // caneta azul
  ink: { font: FONT_HAND, size: 15, lh: 12.5, color: '#43291a' },     // pena e tinta, desbotada
  pencil: { font: FONT_HAND, size: 15, lh: 12.5, color: '#55555e' },
  red: { font: FONT_HAND, size: 15, lh: 12.5, color: '#b2261c' },
  chalk: { font: FONT_HAND, size: 16, lh: 13, color: '#e8e2d2' },     // tinta branca no papel preto do álbum
  child: { font: FONT_HAND, size: 16, lh: 13.5, color: '#4c4c58', jitter: 1.3 },
  shaky: { font: FONT_HAND, size: 15, lh: 13, color: '#55555e', jitter: 0.8, shake: true },
};

// papéis: fundo, manchinhas, barra de baixo, cabeçalho, traço, tinta. row = pauta (caderno)
const PAPER = {
  old: { bg: '#d6c8a4', fleck: '#c4b38c', foot: '#b8a47a', kind: '#7a5634', title: '#2a1a10', rule: '#8a7250', ink: '#2a2018' },
  white: { bg: '#e2ded2', fleck: '#d4cfc0', foot: '#c8c0ac', kind: '#6a5a48', title: '#2a2420', rule: '#9a9080', ink: '#24201c' },
  news: { bg: '#d4cfc2', fleck: '#c6c0b2', foot: '#b8b2a2', kind: '#5a544a', title: '#1e1c1a', rule: '#3a3632', ink: '#26241f' },
  yellow: { bg: '#e0cc7c', fleck: '#d2bc6a', foot: '#c4ac5a', kind: '#6a5420', title: '#2a2010', rule: '#8a7030', ink: '#2a2010' },
  lined: { bg: '#e2ded2', fleck: '#d4cfc0', foot: '#c6c0b0', kind: '#5a5868', title: '#22222a', rule: '#8a90a8', ink: '#22222a', lines: '#a6b6cc', margin: '#cc8a84', row: 13 },
  card: { bg: '#d8ccb0', fleck: '#cabc9c', foot: '#bcab88', kind: '#6e5638', title: '#2a1c10', rule: '#8e7654', ink: '#2a2018' },
  envelope: { bg: '#cdb98e', fleck: '#bfa97c', foot: '#b09a6c', kind: '#5e4828', title: '#2a1e10', rule: '#7a6440', ink: '#2a2010' },
  album: { bg: '#1c1917', fleck: '#24201d', foot: '#121010', kind: '#a08868', title: '#e4d8c0', rule: '#4a4036', ink: '#e8e2d2' },
};

export class Paper {
  constructor() { this.doc = null; this.page = 0; this.t = 0; this.key = ''; this.pages = []; }

  open(doc) { this.doc = doc; this.page = 0; this.t = 0; this.key = ''; }
  get isOpen() { return !!this.doc; }
  close() { this.doc = null; }

  _box(W, H) {
    const k = H / 240, w = Math.min(W - 20 * k, 320 * k), h = Math.min(H - 24 * k, 206 * k);
    return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) - 4 * k, w: Math.round(w), h: Math.round(h) };
  }

  // monta as páginas da tela (cache por tamanho de tela): cada bloco vira itens com altura
  _layout(W, H) {
    const k = H / 240, key = W + 'x' + H + ':' + this.doc.title + ':' + getLang();
    if (this.key === key) return;
    this.key = key;
    const box = this._box(W, H), cw = box.w - 28 * k, ch = box.h - 62 * k;
    this.pages = [];
    for (const src of this.doc.pages) {
      let pages = this._lay(src, k, cw, ch, 1);
      // a tradução às vezes passa um pouco do papel: em vez de uma página com uma ou duas linhas,
      // a letra daquela página diminui um pouco até caber (o português fica como está)
      if (pages.length > 1 && pages[pages.length - 1].used <= ch * 0.3) {
        for (let f = 0.98; f > 0.83; f -= 0.02) {
          const p = this._lay(src, k, cw, ch, f);
          if (p.length < pages.length) { pages = p; break; }
        }
      }
      this.pages.push(...pages);
    }
    this.page = Math.min(this.page, this.pages.length - 1);
  }

  // uma página do documento em páginas da tela; f = escala da letra
  _lay(src, k, cw, ch, f) {
    const pg = Array.isArray(src) ? { blocks: src } : src;
    const paper = pg.paper || this.doc.paper || 'old', pal = PAPER[paper] || PAPER.old;
    const meta = { paper, marks: pg.marks || (pg.paper ? [] : this.doc.marks || []), label: pg.label || null, postmark: pg.postmark || null };
    const pages = [];
    // no caderno o parágrafo novo só começa na linha de baixo
    const gap = (pal.row ? 0 : 6.5) * k * f;
    let cur = [], used = 0, float = null, prev = null;
    const flush = () => { pages.push({ ...meta, items: cur, used }); cur = []; used = 0; float = null; };
    const place = it => {
      if (it.kind === 'gap' && !it.keep && !cur.length) return;
      if (cur.length && used + it.h > ch) {
        while (cur.length && cur[cur.length - 1].kind === 'gap') used -= cur.pop().h;
        flush();
        if (it.kind === 'gap') return;
      }
      cur.push(it); used += it.h;
    };
    // o que sobra da imagem ao lado do texto vira espaço
    const endFloat = () => { if (float && used < float.until) place({ kind: 'gap', h: float.until - used }); float = null; };
    for (const b0 of pg.blocks) {
      const b = typeof b0 === 'string' ? { t: b0 } : b0;
      if (prev && gap && !(prev.entry && b.entry)) place({ kind: 'gap', h: gap });
      prev = b;
      // imagem flutuante: o texto seguinte corre do lado dela
      if (b.img && b.float) {
        endFloat();
        const it = this._items(b, k, cw, ch, pal)[0];
        if (!it) continue;
        if (cur.length && used + it.ih > ch) flush();
        it.float = b.float; it.h = 0;
        place(it);
        float = { until: used + it.ih + 4 * k, w: it.w + 8 * k, side: b.float };
        prev = null;
        continue;
      }
      if (float && (b.t == null || used >= float.until)) endFloat();
      const side = float ? float.w : 0;
      for (const it of this._items(b, k, cw - side, ch, pal, f)) {
        if (float && it.kind === 'text') { it.narrow = side; if (float.side === 'left') it.indent = side; }
        place(it);
      }
    }
    endFloat();
    flush();
    return pages;
  }

  // f = escala da letra (texto, bilhete, lista); imagem, carimbo e assinatura não mudam
  _items(b, k, cw, ch, pal, f = 1) {
    if (typeof b === 'string') b = { t: b };
    const key = b.t || b.note || b.sign || b.img || (b.entry || []).join('') || b.label || '';
    const seed = hash(key.length * 1.37 + (key.charCodeAt(0) || 0) + (key.charCodeAt(key.length - 1) || 0) * 0.01);
    if (b.space) return [{ kind: 'gap', keep: true, h: b.space * k }];
    if (b.t != null) {
      const st = STYLE[b.s] || STYLE.print, sz = b.size || st.size, size = sz * k * f;
      // no caderno a letra à mão fica em cima da pauta
      const lh = (pal.row && st.font === FONT_HAND ? pal.row : st.lh * sz / st.size * f) * k;
      return wrap(tr(b.t), size, cw - 4 * k, st.font).map((text, i) => ({
        kind: 'text', text, st, size, font: st.font, color: b.color || st.color || pal.ink, h: lh,
        align: b.align, strike: b.strike, ring: b.ring, words: b.words && tr(b.words).split(' ').map(norm), seed: seed * 100 + i,
      }));
    }
    if (b.img) {
      const art = docArt(b.img);
      if (!art) return [];
      // ampliação em passos de meio pixel quando grande (os pixels ficam regulares)
      let s = Math.min(cw * (b.w || 1) / art.width, (ch * (b.h || 1) - 4 * k) / art.height);
      if (s >= 2) s = Math.floor(s * 2) / 2;
      return [{ kind: 'img', art, w: art.width * s, ih: art.height * s, h: art.height * s + 4 * k, align: b.align, corners: b.corners }];
    }
    if (b.stamp) {
      const lines = tr(b.stamp).split('\n'), size = (b.size || (lines.length > 1 ? 9 : 14)) * k, lh = size * 1.05;
      const w = Math.max(...lines.map(l => measure(l, size))) + 12 * k, bh = lines.length * lh + 7 * k;
      const r = w / 2 + 1 * k;
      // float: carimbado por cima do que vem antes (não ocupa linha)
      const h = b.float ? 0 : (b.round ? r * 2 : bh) + 4 * k;
      return [{ kind: 'stamp', lines, size, lh, w, bh, r, round: b.round, float: b.float, color: b.color || '#7a2a8a', rot: b.rot ?? -0.12, align: b.align || 'right', h }];
    }
    if (b.sign) {
      const st = STYLE[b.s] || STYLE.ink;
      return [{ kind: 'sign', text: b.sign, size: 19 * k, color: b.color || st.color, align: b.align || 'right', h: 22 * k }];
    }
    if (b.scribble) return [{ kind: 'scribble', label: b.label, color: b.color || pal.ink, seed, h: 30 * k }];
    if (b.note) {
      const st = STYLE[b.s] || STYLE.hand, size = st.size * k * f, lh = st.lh * k * f, w = cw * (b.w || 0.62), lines = wrap(tr(b.note), size, w - 12 * k, st.font);
      const bh = lines.length * lh + 9 * k;
      return [{ kind: 'note', lines, st, size, lh, w, bh, bg: b.bg || '#e6d468', h: bh + 6 * k }];
    }
    if (b.entry) {
      const [name, addr, num] = b.entry;
      return [{ kind: 'entry', name, addr, num, ring: b.ring, size: 10.5 * k * f, seed, h: 11 * k * f }];
    }
    if (b.rule) return [{ kind: 'rule', h: 6 * k }];
    return [];
  }

  // devolve 'close' quando o papel é fechado
  update(dt, input) {
    this.t += dt;
    if (!this.doc) return 'close';
    if (this.t < 0.25) return null;
    const adv = input.confirm() || input.mouse.clicked || input.hit('KeyF', 'KeyE') || input.padHit('a');
    if (input.back()) { this.close(); return 'close'; }
    if (input.right() && this.page < this.pages.length - 1) { this.page++; this.t = 0.1; return null; }
    if (input.left() && this.page > 0) { this.page--; this.t = 0.1; return null; }
    if (adv) {
      if (this.page < this.pages.length - 1) { this.page++; this.t = 0.1; return null; }
      this.close(); return 'close';
    }
    return null;
  }

  draw(g, W, H, device) {
    if (!this.doc) return;
    this._layout(W, H);
    const k = H / 240, b = this._box(W, H), a = Math.min(1, this.t / 0.2), P = this.pages[this.page] || this.pages[0];
    const pal = PAPER[P.paper] || PAPER.old, marks = P.marks || [];
    g.globalAlpha = 0.72 * a; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.save();
    this._sheet(g, b, k, a, pal, marks, P.postmark);
    const D = this.doc;
    drawText(g, D.kind || '', b.x + 14 * k, b.y + 8 * k, 9 * k, { color: pal.kind, shadow: null, alpha: a });
    if (P.label) drawText(g, P.label, b.x + b.w - 14 * k, b.y + 8 * k, 9 * k, { align: 'right', color: pal.kind, shadow: null, alpha: a });
    drawText(g, D.title || '', b.x + 14 * k, b.y + 18 * k, 15 * k, { font: FONT_TITLE, color: pal.title, shadow: null, alpha: a });
    g.globalAlpha = a; g.fillStyle = pal.rule; g.fillRect(Math.round(b.x + 14 * k), Math.round(b.y + 40 * k), Math.round(b.w - 28 * k), Math.max(1, Math.round(k)));
    const x0 = b.x + 14 * k, cw = b.w - 28 * k;
    let y = b.y + 46 * k;
    for (const it of P.items) { this._item(g, it, x0, y, cw, k, a, pal); y += it.h; }
    g.restore();
    g.globalAlpha = a;
    const more = this.page < this.pages.length - 1;
    if (this.pages.length > 1) drawText(g, `${this.page + 1}/${this.pages.length}`, b.x + b.w - 12 * k, b.y + b.h - 14 * k, 10 * k, { align: 'right', color: pal.kind, shadow: null, alpha: a });
    const hint = device === 'pad' ? (more ? 'A próxima página' : 'A fechar') : device === 'touch' ? (more ? 'toque: próxima página' : 'toque para fechar') : more ? 'ENTER próxima página' : 'ENTER fechar';
    drawText(g, hint, W / 2, b.y + b.h + 6 * k, 10 * k, { align: 'center', color: '#c8b898', alpha: a });
    g.globalAlpha = 1;
  }

  // a folha: borda, fundo, pauta, marcas. Deixa o recorte no formato da folha (canto rasgado)
  _sheet(g, b, k, a, pal, marks, postmark) {
    const R = Math.round, path = () => {
      g.beginPath();
      if (!marks.includes('torn')) { g.rect(b.x, b.y, b.w, b.h); return; }
      const cx = 36 * k, cy = 32 * k;
      g.moveTo(b.x, b.y); g.lineTo(b.x + b.w - cx, b.y);
      for (let i = 1; i < 9; i++) { const t = i / 9, j = (hash(i * 7.3) - 0.5) * 6 * k; g.lineTo(b.x + b.w - cx + cx * t + j, b.y + cy * t - j); }
      g.lineTo(b.x + b.w, b.y + cy); g.lineTo(b.x + b.w, b.y + b.h); g.lineTo(b.x, b.y + b.h); g.closePath();
    };
    g.globalAlpha = a;
    path(); g.lineWidth = 4; g.strokeStyle = '#2a1e14'; g.stroke();
    g.fillStyle = pal.bg; g.fill();
    g.clip();
    g.fillStyle = pal.fleck;
    for (let i = 0; i < 26; i++) { const r = ((i * 7919) % 97) / 97, s = ((i * 104729) % 89) / 89; g.fillRect(R(b.x + r * (b.w - 12 * k)), R(b.y + s * (b.h - 8 * k)), R((2 + (i % 5)) * k), Math.max(1, R(k))); }
    g.fillStyle = pal.foot; g.fillRect(b.x, b.y + b.h - R(3 * k), b.w, R(3 * k));
    // pauta de caderno: linhas azuis e a margem vermelha
    if (pal.lines) {
      g.fillStyle = pal.lines;
      for (let y = b.y + 46 * k + 14 * k; y < b.y + b.h - 6 * k; y += pal.row * k) g.fillRect(b.x, R(y), b.w, Math.max(1, R(0.7 * k)));
      g.fillStyle = pal.margin; g.fillRect(R(b.x + 9 * k), b.y, Math.max(1, R(0.8 * k)), b.h);
    }
    for (const m of marks) {
      if (m === 'stain') {
        // mancha escura, seca, perto do pé da folha
        const sx = b.x + b.w * 0.2, sy = b.y + b.h * 0.8;
        g.fillStyle = '#3a160e';
        // muitas manchinhas sobrepostas: mais escuro no meio, borda irregular
        for (let i = 0; i < 160; i++) {
          const ang = hash(i * 1.7) * 6.28, d = Math.pow(hash(i * 2.9), 1.3) * 20 * k, r = (1 + hash(i * 3.1) * 2.6) * k;
          g.globalAlpha = a * 0.11; g.beginPath(); g.ellipse(sx + Math.cos(ang) * d * 1.5, sy + Math.sin(ang) * d * 0.8, r * 1.3, r, ang, 0, 7); g.fill();
        }
        // respingos
        g.globalAlpha = a * 0.4;
        for (let i = 0; i < 7; i++) { const ang = hash(i * 6.1) * 6.28, d = (30 + hash(i * 2.3) * 16) * k; g.beginPath(); g.arc(sx + Math.cos(ang) * d, sy + Math.sin(ang) * d * 0.6, (0.6 + hash(i) * 1.1) * k, 0, 7); g.fill(); }
      } else if (m === 'blot') {
        const bx = b.x + b.w - 40 * k, by = b.y + 54 * k;
        g.globalAlpha = a * 0.85; g.fillStyle = '#2e1c12';
        g.beginPath(); g.ellipse(bx, by, 5 * k, 4 * k, 0.4, 0, 7); g.fill();
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(bx + (hash(i * 2.2) - 0.5) * 22 * k, by + (hash(i * 3.3) - 0.5) * 16 * k, (0.6 + hash(i * 7.7) * 1.2) * k, 0, 7); g.fill(); }
      } else if (m === 'fold3') {
        for (const f of [1 / 3, 2 / 3]) {
          const y = R(b.y + b.h * f);
          g.globalAlpha = a * 0.3; g.fillStyle = '#fff8e8'; g.fillRect(b.x, y, b.w, Math.max(1, R(k)));
          g.globalAlpha = a * 0.14; g.fillStyle = '#000'; g.fillRect(b.x, y + Math.max(1, R(k)), b.w, Math.max(1, R(k)));
        }
      } else if (m === 'selo') {
        const art = docArt('selo'), s = Math.max(1, R(k * 1.2));
        g.globalAlpha = a; g.imageSmoothingEnabled = false;
        const sx = R(b.x + b.w - art.width * s - 8 * k);
        g.drawImage(art, sx, R(b.y + 6 * k), art.width * s, art.height * s);
        // carimbo dos Correios em cima das ondas do selo
        if (postmark) {
          const it = this._items({ stamp: postmark, round: true, color: '#2a2a3a', rot: -0.25, size: 7.5 }, k, b.w, b.h, pal)[0];
          this._stampAt(g, it, sx + 4 * k, b.y + 8 * k + it.r, k, a, pal);
        }
      }
    }
    g.globalAlpha = a;
  }

  _item(g, it, x0, y, cw, k, a, pal) {
    const R = Math.round;
    if (it.kind === 'text') return this._text(g, it, x0, y, cw, k, a);
    if (it.kind === 'img') {
      const side = it.float || it.align, x = side === 'left' ? x0 : side === 'right' ? x0 + cw - it.w : x0 + (cw - it.w) / 2, iy = y + 2 * k;
      g.globalAlpha = a; g.imageSmoothingEnabled = false;
      g.drawImage(it.art, R(x), R(iy), R(it.w), R(it.ih));
      if (it.corners) {
        // cantoneiras de álbum
        const c = 7 * k;
        for (const [cx, cy, sx, sy] of [[x, iy, 1, 1], [x + it.w, iy, -1, 1], [x, iy + it.ih, 1, -1], [x + it.w, iy + it.ih, -1, -1]]) {
          g.fillStyle = '#0c0a09'; g.beginPath(); g.moveTo(cx - sx * k, cy - sy * k); g.lineTo(cx + sx * c, cy - sy * k); g.lineTo(cx - sx * k, cy + sy * c); g.closePath(); g.fill();
          g.strokeStyle = '#4a4038'; g.lineWidth = Math.max(1, R(0.7 * k)); g.beginPath(); g.moveTo(cx + sx * c, cy - sy * k); g.lineTo(cx - sx * k, cy + sy * c); g.stroke();
        }
      }
      return;
    }
    if (it.kind === 'stamp') {
      const cx = it.align === 'left' ? x0 + it.w / 2 + 6 * k : it.align === 'center' ? x0 + cw / 2 : x0 + cw - (it.round ? it.r : it.w / 2) - 8 * k;
      const cy = it.float ? y - (it.round ? it.r : it.bh / 2) * 0.7 : y + it.h / 2;
      this._stampAt(g, it, cx, cy, k, a, pal);
      return;
    }
    if (it.kind === 'sign') {
      const w = measure(it.text, it.size, FONT_HAND), x = it.align === 'left' ? x0 + 6 * k : x0 + cw - w - 10 * k;
      drawText(g, it.text, x, y, it.size, { font: FONT_HAND, color: it.color, shadow: null, alpha: a, raw: true });
      g.globalAlpha = a; g.strokeStyle = it.color; g.lineWidth = Math.max(1, R(0.9 * k));
      g.beginPath(); g.moveTo(x - 3 * k, y + it.size * 1.0); g.bezierCurveTo(x + w * 0.3, y + it.size * 1.12, x + w * 0.7, y + it.size * 0.86, x + w + 8 * k, y + it.size * 0.92); g.stroke();
      return;
    }
    if (it.kind === 'scribble') {
      const w = 70 * k, x = x0 + cw - w - 34 * k, yb = y + 13 * k;
      g.globalAlpha = a; g.strokeStyle = '#1e2c66'; g.lineWidth = Math.max(1, R(0.9 * k));
      g.beginPath(); g.moveTo(x, yb);
      let px = x;
      for (let i = 0; i < 9; i++) {
        const nx = px + w / 9, up = (hash(it.seed * 10 + i) * 9 + 3) * k;
        g.bezierCurveTo(px + 2 * k, yb - up, nx - 5 * k, yb - up * 0.3, nx - 2 * k, yb + (hash(i * 2.1) - 0.5) * 5 * k);
        px = nx;
      }
      g.stroke();
      g.fillStyle = it.color; g.fillRect(R(x - 6 * k), R(yb + 5 * k), R(w + 12 * k), Math.max(1, R(0.8 * k)));
      if (it.label) drawText(g, it.label, x + w / 2, yb + 7 * k, 9.5 * k, { font: FONT_TYPE, align: 'center', color: it.color, shadow: null, alpha: a });
      return;
    }
    if (it.kind === 'note') {
      g.save(); g.translate(R(x0 + cw - it.w / 2 - 4 * k), R(y + it.h / 2)); g.rotate(-0.035);
      g.globalAlpha = a * 0.3; g.fillStyle = '#000'; g.fillRect(-it.w / 2 + 2 * k, -it.bh / 2 + 2 * k, it.w, it.bh);
      g.globalAlpha = a; g.fillStyle = it.bg; g.fillRect(-it.w / 2, -it.bh / 2, it.w, it.bh);
      g.globalAlpha = a * 0.25; g.fillStyle = '#fff'; g.fillRect(-it.w / 2, -it.bh / 2, it.w, R(3 * k));
      it.lines.forEach((l, i) => drawText(g, l, -it.w / 2 + 6 * k, -it.bh / 2 + 4 * k + i * it.lh, it.size, { font: it.st.font, color: it.st.color, shadow: null, alpha: a, raw: true }));
      g.restore();
      return;
    }
    if (it.kind === 'entry') {
      const s = it.size, ink = pal.ink;
      drawText(g, it.name, x0, y, s, { color: ink, shadow: null, alpha: a, raw: true });
      const nw = measure(it.name, s), aw = measure(it.addr, s), numW = measure(it.num, s);
      drawText(g, it.addr, x0 + nw + 6 * k, y, s, { color: '#5a524a', shadow: null, alpha: a, raw: true });
      drawText(g, it.num, x0 + cw, y, s, { align: 'right', color: ink, shadow: null, alpha: a, raw: true });
      g.globalAlpha = a; g.fillStyle = '#7a7268';
      for (let x = x0 + nw + aw + 12 * k; x < x0 + cw - numW - 4 * k; x += 3 * k) g.fillRect(R(x), R(y + s * 0.62), Math.max(1, R(0.8 * k)), Math.max(1, R(0.8 * k)));
      if (it.ring) this._ring(g, x0 + nw / 2 + 1 * k, y + s * 0.56, nw / 2 + 6 * k, s * 0.55 + 1.5 * k, k, a, '#b2261c', it.seed);
      return;
    }
    if (it.kind === 'rule') { g.globalAlpha = a; g.fillStyle = pal.rule; g.fillRect(R(x0), R(y + 2 * k), R(cw), Math.max(1, R(k))); }
  }

  _text(g, it, x0, y, cw, k, a) {
    const { st, size, font, color } = it, R = Math.round;
    x0 += it.indent || 0; cw -= it.narrow || 0;
    const w = measure(it.text, size, font);
    const x = it.align === 'center' ? x0 + (cw - w) / 2 : it.align === 'right' ? x0 + cw - w - 4 * k : x0;
    const o = { font, color, shadow: null, alpha: a, raw: true };
    if (st.jitter || it.words) {
      // palavra por palavra: letra de criança (fora da linha) e palavras circuladas
      let wx = x;
      it.text.split(' ').forEach((wd, i) => {
        const sd = it.seed + i * 13.1, dy = (hash(sd) - 0.5) * 2 * (st.jitter || 0) * k;
        if (st.shake) {
          let cx = wx;
          [...wd].forEach((chr, j) => { drawText(g, chr, cx + (hash(sd + j) - 0.5) * 0.8 * k, y + dy + (hash(sd + j * 3.7) - 0.5) * 1.8 * k, size, o); cx += measure(chr, size, font); });
        } else drawText(g, wd, wx, y + dy, size, o);
        const ww = measure(wd, size, font);
        if (it.words?.includes(norm(wd))) this._ring(g, wx + ww / 2, y + dy + size * 0.6, ww / 2 + 3.5 * k, size * 0.42 + 1.5 * k, k, a, '#b2261c', sd);
        wx += measure(wd + ' ', size, font);
      });
    } else drawText(g, it.text, x, y, size, o);
    if (it.strike) {
      g.globalAlpha = a * 0.9; g.strokeStyle = '#2a1608'; g.lineWidth = Math.max(1, R(1.2 * k));
      g.beginPath(); g.moveTo(x - 2 * k, y + size * 0.62); g.lineTo(x + w + 3 * k, y + size * 0.56);
      g.moveTo(x - 1 * k, y + size * 0.7); g.lineTo(x + w + 2 * k, y + size * 0.66); g.stroke();
    }
    if (it.ring) this._ring(g, x + w / 2, y + size * 0.58, w / 2 + 7 * k, size * 0.5 + 2.5 * k, k, a, '#b2261c', it.seed);
  }

  // carimbo com centro em (cx, cy), com falhas na tinta
  _stampAt(g, it, cx, cy, k, a, pal) {
    const R = Math.round;
    g.save(); g.translate(R(cx), R(cy)); g.rotate(it.rot);
    g.globalAlpha = a * 0.82; g.strokeStyle = it.color; g.lineWidth = Math.max(1, R(1.4 * k));
    if (it.round) {
      g.beginPath(); g.arc(0, 0, it.r, 0, 7); g.stroke();
      g.beginPath(); g.arc(0, 0, it.r - 3 * k, 0, 7); g.stroke();
    } else {
      g.strokeRect(-it.w / 2, -it.bh / 2, it.w, it.bh);
      g.lineWidth = Math.max(1, R(0.7 * k)); g.strokeRect(-it.w / 2 + 2 * k, -it.bh / 2 + 2 * k, it.w - 4 * k, it.bh - 4 * k);
    }
    it.lines.forEach((l, i) => drawText(g, l, 0, -it.lines.length * it.lh / 2 + i * it.lh - 1.5 * k, it.size, { align: 'center', color: it.color, shadow: null, alpha: a * 0.85, raw: true }));
    g.globalAlpha = a; g.fillStyle = pal.bg;
    const hw = it.round ? it.r : it.w / 2, hh = it.round ? it.r : it.bh / 2;
    for (let i = 0; i < 18; i++) g.fillRect((hash(i * 1.3) * 2 - 1) * hw, (hash(i * 2.7) * 2 - 1) * hh, Math.max(1, R((1 + hash(i) * 2) * k)), Math.max(1, R(k)));
    g.restore();
  }

  // círculo feito à mão (passa um pouco do começo)
  _ring(g, cx, cy, rx, ry, k, a, color, seed) {
    g.globalAlpha = a * 0.9; g.strokeStyle = color; g.lineWidth = Math.max(1, Math.round(1.3 * k));
    g.beginPath(); g.ellipse(cx, cy, rx, ry, (hash(seed) - 0.5) * 0.12, 0.3, Math.PI * 2 + 0.75); g.stroke();
  }
}
