import { drawText } from '../ui/overlay.js';

// Controles de toque (celular e tablet). No jogo: analógico flutuante à esquerda,
// arrastar no resto da tela gira a câmera, pinça com dois dedos dá zoom, toque
// duplo recentra; botões PULAR, CORRER (liga/desliga), pausa e tela cheia.
// Nos menus e na abertura um toque vale um clique do mouse.

const doc = document, root = doc.documentElement;

export const fullscreen = {
  supported: !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled),
  active: () => !!(doc.fullscreenElement || doc.webkitFullscreenElement),
  enter() {
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req || this.active()) return;
    try {
      const p = req.call(root, { navigationUI: 'hide' });
      // no Android a tela cheia permite travar em paisagem
      const lock = () => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (e) { /* ignora */ } };
      if (p && p.then) p.then(lock, () => {}); else lock();
    } catch (e) { /* ignora */ }
  },
  exit() {
    const ex = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (ex && this.active()) { try { ex.call(doc)?.catch?.(() => {}); } catch (e) { /* ignora */ } }
  },
  toggle() { if (this.active()) this.exit(); else this.enter(); },
};

// margens seguras (entalhe, barra do iPhone), lidas do CSS
let probe = null;
function safeInsets() {
  if (!probe) {
    probe = doc.createElement('div');
    Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', visibility: 'hidden', pointerEvents: 'none' });
    probe.style.padding = 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    doc.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  return { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
}

const near = (p, x, y, r) => p && Math.hypot(x - p.x, y - p.y) <= r;
const inRect = (r, x, y, pad = 0) => r && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
const inZone = (z, x, y) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;

export class TouchControls {
  constructor(input, container) {
    this.input = input;
    this.mode = 'menu';             // 'menu': toque = clique · 'play': controles
    this.touches = new Map();       // id -> { role, x, y, x0, y0, t0, moved }
    this.stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.vec = { x: 0, y: 0 };      // saída do analógico (x: direita, y: frente)
    this.look = { dx: 0, dy: 0 };   // arrasto da câmera em px CSS
    this.zoom = 0;
    this.pinchD = 0;
    this.runOn = false;
    this.jumpHit = false; this.pauseHit = false; this.recenterHit = false;
    this.lastTap = { t: -1e9, x: 0, y: 0 };
    this.L = null;
    const c = this.canvas = doc.createElement('canvas');
    Object.assign(c.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', imageRendering: 'pixelated', display: 'none' });
    container.appendChild(c);
    this.g = c.getContext('2d');
    const opt = { passive: false };
    addEventListener('touchstart', e => this._start(e), opt);
    addEventListener('touchmove', e => this._move(e), opt);
    addEventListener('touchend', e => this._end(e, false), opt);
    addEventListener('touchcancel', e => this._end(e, true), opt);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    // dedos que já estavam na tela não valem para o novo modo
    for (const T of this.touches.values()) T.role = 'ignore';
    this._releaseStick();
    this.look.dx = this.look.dy = 0; this.zoom = 0; this.pinchD = 0;
  }

  // posições em px CSS; recalculadas quando a tela muda de tamanho
  _layout(R) {
    const vw = innerWidth, vh = innerHeight, gr = R.cssRect;
    const key = [vw, vh, gr.x, gr.y, gr.w, gr.h, R.H].join();
    if (this.L && this.L.key === key) return this.L;
    const ins = safeInsets();
    const portrait = gr.y + gr.h < vh - 60;      // jogo em cima, controles embaixo
    const u = Math.max(300, Math.min(520, Math.min(vw, vh))) / 100;
    const m = 4 * u, Rs = 15 * u, Rj = 10 * u, Rr = 7.5 * u, S = 9 * u;
    const left = ins.left, right = vw - ins.right, bottom = vh - ins.bottom;
    let stick, jump, stickZone;
    if (portrait) {
      const top = gr.y + gr.h, mid = top + (bottom - top) * 0.52;
      stick = { x: left + Math.max(m + Rs + 2 * u, vw * 0.27), y: mid };
      jump = { x: right - m - Rj - 2 * u, y: mid + Rj * 0.5 };
      stickZone = { x0: 0, y0: top, x1: vw * 0.5, y1: vh };
    } else {
      stick = { x: left + m + Rs + 3 * u, y: bottom - m - Rs };
      jump = { x: right - m - Rj, y: bottom - m - Rj };
      stickZone = { x0: 0, y0: Math.max(gr.y, ins.top) + m + S + 2 * u, x1: vw * 0.42, y1: vh };
    }
    const run = { x: jump.x - Rj - Rr - 2.5 * u, y: jump.y - Rj * 0.55 };
    const bx = Math.max(gr.x, left) + m * 0.6, by = Math.max(gr.y, ins.top) + m * 0.6;
    const pause = { x: bx, y: by, w: S, h: S };
    const fs = fullscreen.supported ? { x: bx + S + 2.5 * u, y: by, w: S, h: S } : null;
    this.L = { key, s: gr.h / R.H, portrait, gr, u, Rs, Rj, Rr, stick, jump, run, pause, fs, stickZone };
    // mantém o analógico ativo dentro da tela nova
    if (this.stick.id === null) { this.stick.cx = stick.x; this.stick.cy = stick.y; }
    return this.L;
  }

  _start(e) {
    e.preventDefault();
    const I = this.input, L = this.L;
    I.lastDevice = 'touch';
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY, now = performance.now();
      const T = { role: 'tap', x, y, x0: x, y0: y, t0: now, moved: false };
      this.touches.set(t.identifier, T);
      if (this.mode !== 'play' || !L) {
        // menus: o item sob o dedo fica selecionado; o clique vem ao soltar
        I.mouse.x = x; I.mouse.y = y; I.mouse.moved = true;
        continue;
      }
      if (inRect(L.pause, x, y, 2 * L.u)) { T.role = 'pause'; this.pauseHit = true; }
      else if (inRect(L.fs, x, y, 2 * L.u)) T.role = 'fs';
      else if (near(L.jump, x, y, L.Rj * 1.3)) { T.role = 'jump'; this.jumpHit = true; }
      else if (near(L.run, x, y, L.Rr * 1.3)) { T.role = 'run'; this.runOn = !this.runOn; }
      else if (this.stick.id === null && inZone(L.stickZone, x, y)) {
        T.role = 'stick';
        const s = this.stick, R = L.Rs;
        s.id = t.identifier;
        // a base nasce onde o dedo tocou, sem sair da tela
        s.cx = Math.max(R, Math.min(innerWidth - R, x));
        s.cy = Math.max(R, Math.min(innerHeight - R, y));
        this._stickTo(x, y);
      } else {
        T.role = 'look';
        const lt = this.lastTap;
        if (now - lt.t < 330 && Math.hypot(x - lt.x, y - lt.y) < 12 * L.u) { this.recenterHit = true; lt.t = -1e9; }
        this.pinchD = 0;
      }
    }
  }

  _move(e) {
    e.preventDefault();
    const I = this.input;
    const looks = [];
    for (const T of this.touches.values()) if (T.role === 'look') looks.push(T);
    for (const t of e.changedTouches) {
      const T = this.touches.get(t.identifier);
      if (!T) continue;
      const x = t.clientX, y = t.clientY, dx = x - T.x, dy = y - T.y;
      T.x = x; T.y = y;
      if (Math.hypot(x - T.x0, y - T.y0) > 10) T.moved = true;
      if (T.role === 'tap') { I.mouse.x = x; I.mouse.y = y; I.mouse.moved = true; }
      else if (T.role === 'stick') this._stickTo(x, y);
      else if (T.role === 'look' && looks.length === 1) { this.look.dx += dx; this.look.dy += dy; }
    }
    // pinça com dois dedos na área da câmera: afastar aproxima
    if (looks.length >= 2) {
      const d = Math.hypot(looks[0].x - looks[1].x, looks[0].y - looks[1].y);
      if (this.pinchD) this.zoom += (this.pinchD - d) * 0.025;
      this.pinchD = d;
    }
  }

  _end(e, cancel) {
    e.preventDefault();
    const I = this.input, L = this.L, now = performance.now();
    for (const t of e.changedTouches) {
      const T = this.touches.get(t.identifier);
      if (!T) continue;
      this.touches.delete(t.identifier);
      if (cancel) { if (T.role === 'stick') this._releaseStick(); continue; }
      if (T.role === 'tap') { I.mouse.x = T.x; I.mouse.y = T.y; I.mouse.clicked = true; }
      else if (T.role === 'stick') this._releaseStick();
      else if (T.role === 'fs' && inRect(L?.fs, T.x, T.y, 4 * L.u)) fullscreen.toggle();
      else if (T.role === 'look') {
        this.pinchD = 0;
        if (!T.moved && now - T.t0 < 260) this.lastTap = { t: now, x: T.x, y: T.y };
      }
    }
    // soltar o dedo conta como gesto do usuário (áudio no iOS, tela cheia)
    if (!cancel) I.onGesture?.('touch');
  }

  _stickTo(x, y) {
    const s = this.stick, R = this.L.Rs;
    let dx = x - s.cx, dy = y - s.cy, d = Math.hypot(dx, dy);
    // passou da borda: a base acompanha o dedo
    if (d > R) { s.cx += dx * (1 - R / d); s.cy += dy * (1 - R / d); dx = x - s.cx; dy = y - s.cy; d = R; }
    s.x = x; s.y = y;
    const m = d / R, dz = 0.12;
    const k = m < dz ? 0 : ((m - dz) / (1 - dz)) / m;
    this.vec.x = (dx / R) * k;
    this.vec.y = -(dy / R) * k;
  }

  _releaseStick() {
    const s = this.stick;
    s.id = null; this.vec.x = 0; this.vec.y = 0;
    if (this.L) { s.cx = this.L.stick.x; s.cy = this.L.stick.y; }
  }

  get stickActive() { return this.stick.id !== null; }

  endFrame() {
    this.look.dx = 0; this.look.dy = 0; this.zoom = 0;
    this.jumpHit = false; this.pauseHit = false; this.recenterHit = false;
  }

  // controls: desenha os controles do jogo · hint: aviso para girar (retrato, menus)
  draw(R, controls, hint) {
    const c = this.canvas;
    const L = this._layout(R);
    if (!controls && !(hint && L.portrait)) { if (c.style.display !== 'none') c.style.display = 'none'; return; }
    const s = L.s, g = this.g;
    const cw = Math.ceil(innerWidth / s), ch = Math.ceil(innerHeight / s);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw; c.height = ch;
      c.style.width = cw * s + 'px'; c.style.height = ch * s + 'px';
    }
    c.style.display = '';
    g.clearRect(0, 0, cw, ch);
    const P = v => v / s;
    const lw = Math.max(1, Math.round(1.6 / s));
    const ring = (x, y, r, fill, fa, stroke = '#d8c8a0', sa = 0.6) => {
      g.beginPath(); g.arc(P(x), P(y), P(r), 0, Math.PI * 2);
      if (fill) { g.globalAlpha = fa; g.fillStyle = fill; g.fill(); }
      if (stroke) { g.globalAlpha = sa; g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
      g.globalAlpha = 1;
    };
    const label = (text, x, y, size, color, alpha = 0.9) => {
      const px = Math.max(8, Math.round(P(size)));
      // texto escuro (botão aceso) vai sem sombra, senão vira um borrão
      drawText(g, text, P(x), P(y) - px * 0.66, px, { align: 'center', color, alpha, shadow: color === '#140c08' ? null : undefined });
    };

    if (!controls) {
      const top = L.gr.y + L.gr.h, cy = (top + innerHeight) / 2;
      label('GIRE O APARELHO', innerWidth / 2, cy - 4 * L.u, 5 * L.u, '#c8b898', 0.8);
      label('para jogar em tela cheia', innerWidth / 2, cy + 3 * L.u, 4 * L.u, '#a89878', 0.8);
      return;
    }

    // analógico
    const st = this.stick, on = st.id !== null;
    ring(st.cx, st.cy, L.Rs, '#0d0907', on ? 0.4 : 0.22, '#d8c8a0', on ? 0.7 : 0.35);
    let kx = st.cx, ky = st.cy;
    if (on) { const dx = st.x - st.cx, dy = st.y - st.cy, d = Math.hypot(dx, dy), k = d > L.Rs ? L.Rs / d : 1; kx += dx * k; ky += dy * k; }
    ring(kx, ky, L.Rs * 0.45, '#e9dcc0', on ? 0.6 : 0.3, '#140c08', on ? 0.6 : 0.3);

    // pular
    let held = false;
    for (const T of this.touches.values()) if (T.role === 'jump') held = true;
    ring(L.jump.x, L.jump.y, L.Rj, held ? '#f2c879' : '#0d0907', held ? 0.6 : 0.35);
    label('PULAR', L.jump.x, L.jump.y, L.Rj * 0.5, held ? '#140c08' : '#efe2c4');
    // correr (liga/desliga)
    ring(L.run.x, L.run.y, L.Rr, this.runOn ? '#c8a060' : '#0d0907', this.runOn ? 0.65 : 0.35, this.runOn ? '#f2c879' : '#d8c8a0');
    label('CORRER', L.run.x, L.run.y, L.Rr * 0.48, this.runOn ? '#140c08' : '#efe2c4');

    // pausa e tela cheia
    const box = (r) => {
      g.globalAlpha = 0.35; g.fillStyle = '#0d0907'; g.fillRect(Math.round(P(r.x)), Math.round(P(r.y)), Math.round(P(r.w)), Math.round(P(r.h)));
      g.globalAlpha = 0.6; g.strokeStyle = '#d8c8a0'; g.lineWidth = lw;
      g.strokeRect(Math.round(P(r.x)) + 0.5, Math.round(P(r.y)) + 0.5, Math.round(P(r.w)) - 1, Math.round(P(r.h)) - 1);
      g.globalAlpha = 0.9; g.fillStyle = '#efe2c4';
    };
    const pr = L.pause, a = P(pr.w);
    box(pr);
    const bw = Math.max(1, Math.round(a * 0.16)), bh = Math.round(a * 0.5), by = Math.round(P(pr.y) + a * 0.25);
    g.fillRect(Math.round(P(pr.x) + a * 0.3), by, bw, bh);
    g.fillRect(Math.round(P(pr.x) + a * 0.7) - bw, by, bw, bh);
    if (L.fs) {
      const f = L.fs, x0 = P(f.x), y0 = P(f.y);
      box(f);
      const i0 = a * 0.24, i1 = a * 0.76, len = Math.round(a * 0.2), t = Math.max(1, Math.round(a * 0.1));
      for (const [cx, cy, sx, sy] of [[i0, i0, 1, 1], [i1, i0, -1, 1], [i0, i1, 1, -1], [i1, i1, -1, -1]]) {
        const X = Math.round(x0 + cx), Y = Math.round(y0 + cy);
        g.fillRect(sx > 0 ? X : X - len, sy > 0 ? Y : Y - t, len, t);
        g.fillRect(sx > 0 ? X : X - t, sy > 0 ? Y : Y - len, t, len);
      }
    }
    g.globalAlpha = 1;
  }
}
