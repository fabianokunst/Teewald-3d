import { drawText, textSprite } from '../ui/overlay.js';
import { settings } from '../config.js';

// Controles de toque (celular e tablet). No jogo: analógico flutuante à esquerda,
// arrastar no resto da tela gira a câmera, pinça com dois dedos dá zoom, toque
// duplo recentra; botões PULAR, CORRER (liga/desliga), pausa, tela cheia, INV
// (inventário) e CURA (ferido, com comida ou chá); com a arma na mão, também
// ATIRAR, MIRAR (liga/desliga) e REC. Arrastar o dedo no ATIRAR também gira a
// câmera (mira e tiro com o mesmo polegar, como nos jogos de tiro de celular).
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

// vibração curta ao apertar botões (Android; o iPhone não tem a API)
export function buzz(ms = 8) {
  if (settings.vibrate === false || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch (e) { /* ignora */ }
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
    this.invHit = false; this.fireHit = false; this.reloadHit = false; this.aimOn = false;
    this.meleeHit = false; this.dodgeHit = false; this.weaponHit = false; this.healHit = false;
    this.weapon = false;            // o jogo liga quando uma arma de fogo está na mão
    this.heal = 0;                  // itens de cura (o botão CURA só aparece ferido e com algum)
    this.uiHit = null;              // (x, y) → true se o dedo caiu num botão do jogo (PEGAR, FALAR...)
    this.lastTap = { t: -1e9, x: 0, y: 0 };
    // menus: dedo na tela (tap), dedo solto neste quadro (tapUp) e arrasto acumulado
    this.tap = null; this.tapUp = null; this.tapDX = 0; this.tapDY = 0;
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
    this.tap = null;
    this._releaseStick();
    this.look.dx = this.look.dy = 0; this.zoom = 0; this.pinchD = 0;
  }

  // posições em px CSS; recalculadas quando a tela muda de tamanho
  _layout(R) {
    const vw = innerWidth, vh = innerHeight, gr = R.cssRect;
    const size = settings.touchSize ?? 1;
    const key = [vw, vh, gr.x, gr.y, gr.w, gr.h, R.H, size].join();
    if (this.L && this.L.key === key) return this.L;
    const ins = safeInsets();
    const portrait = gr.y + gr.h < vh - 60;      // jogo em cima, controles embaixo
    // unidade de tamanho; a opção TAMANHO DOS BOTÕES aumenta ou diminui tudo
    const u = Math.max(300, Math.min(520, Math.min(vw, vh))) / 100 * [0.85, 1, 1.18][size];
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
    // em pé, pausa / tela cheia / INV vão para a área dos controles e deixam a imagem livre
    const bx = Math.max(gr.x, left) + m * 0.6;
    const by = portrait ? gr.y + gr.h + m * 0.6 : Math.max(gr.y, ins.top) + m * 0.6;
    const pause = { x: bx, y: by, w: S, h: S };
    const fs = fullscreen.supported ? { x: bx + S + 2.5 * u, y: by, w: S, h: S } : null;
    const inv = { x: bx + (S + 2.5 * u) * (fs ? 2 : 1), y: by, w: S * 1.3, h: S };
    // arma: ATIRAR acima de PULAR, MIRAR à esquerda dele, REC pequeno acima
    const fire = { x: jump.x, y: jump.y - Rj * 2.55 };
    const aim = { x: fire.x - Rj - Rr - 2.5 * u, y: fire.y + Rj * 0.35 };
    const reload = { x: fire.x - Rj * 0.2, y: fire.y - Rj - Rr * 0.95 };
    // golpe: sem arma de fogo fica no lugar do ATIRAR; com arma, pequeno acima do MIRAR
    const melee2 = { x: aim.x - Rr * 0.3, y: aim.y - Rr * 2.5 };
    // em pé, embaixo do CORRER (longe do analógico); deitado, à esquerda dele
    const dodge = portrait ? { x: run.x, y: run.y + Rr * 2.3 } : { x: run.x - Rr * 2.3, y: run.y + Rr * 0.7 };
    const weap = { x: inv.x + inv.w + 2.5 * u, y: by, w: S * 1.6, h: S };
    const heal = { x: weap.x + weap.w + 2.5 * u, y: by, w: S * 1.75, h: S };
    this.L = { key, s: gr.h / R.H, portrait, gr, u, Rs, Rj, Rr, stick, jump, run, pause, fs, inv, fire, aim, reload, melee2, dodge, weap, heal, stickZone };
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
        // mesmo id de novo = o dedo anterior já saiu (fim perdido): começa outro toque
        if (!this.tap || this.tap.id === t.identifier || !this.touches.has(this.tap.id)) this.tap = { id: t.identifier, x, y, x0: x, y0: y, moved: false };
        continue;
      }
      if (inRect(L.pause, x, y, 2 * L.u)) { T.role = 'pause'; this.pauseHit = true; buzz(); }
      else if (inRect(L.inv, x, y, 2 * L.u)) { T.role = 'inv'; this.invHit = true; buzz(); }
      else if (inRect(L.weap, x, y, 2 * L.u)) { T.role = 'weap'; this.weaponHit = true; buzz(); }
      else if (this.heal > 0 && inRect(L.heal, x, y, 2 * L.u)) { T.role = 'heal'; this.healHit = true; buzz(); }
      else if (this.weapon && near(L.fire, x, y, L.Rj * 1.25)) { T.role = 'fire'; this.fireHit = true; buzz(14); }
      else if (!this.weapon && near(L.fire, x, y, L.Rj * 1.25)) { T.role = 'melee'; this.meleeHit = true; buzz(14); }
      else if (this.weapon && near(L.melee2, x, y, L.Rr * 1.1)) { T.role = 'melee'; this.meleeHit = true; buzz(12); }
      else if (near(L.dodge, x, y, L.Rr * 1.1)) { T.role = 'dodge'; this.dodgeHit = true; buzz(10); }
      else if (this.weapon && near(L.aim, x, y, L.Rr * 1.3)) { T.role = 'aim'; this.aimOn = !this.aimOn; buzz(); }
      else if (this.weapon && near(L.reload, x, y, L.Rr * 0.9)) { T.role = 'reload'; this.reloadHit = true; buzz(); }
      else if (inRect(L.fs, x, y, 2 * L.u)) T.role = 'fs';
      else if (near(L.jump, x, y, L.Rj * 1.3)) { T.role = 'jump'; this.jumpHit = true; buzz(); }
      // mirando não dá para correr: CORRER desliga a mira (e liga a corrida)
      else if (near(L.run, x, y, L.Rr * 1.3)) { T.role = 'run'; if (this.aimOn) { this.aimOn = false; this.runOn = true; } else this.runOn = !this.runOn; buzz(); }
      // botão do jogo sobre a imagem (PEGAR, FALAR, LER...): não mexe na câmera nem anda
      else if (this.uiHit?.(x, y)) T.role = 'ignore';
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
      if (T.role === 'tap') {
        I.mouse.x = x; I.mouse.y = y; I.mouse.moved = true;
        const tp = this.tap;
        if (tp && tp.id === t.identifier) {
          tp.x = x; tp.y = y; this.tapDX += dx; this.tapDY += dy;
          if (T.moved) tp.moved = true;
        }
      } else if (T.role === 'stick') this._stickTo(x, y);
      else if (T.role === 'look' && looks.length === 1) { this.look.dx += dx; this.look.dy += dy; }
      // dedo no ATIRAR que arrasta: gira a câmera (passada uma folga, para o toque não tremer a mira)
      else if (T.role === 'fire' && (T.aimDrag || Math.hypot(x - T.x0, y - T.y0) > 6)) { T.aimDrag = true; this.look.dx += dx; this.look.dy += dy; }
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
      const tp = this.tap;
      if (tp && tp.id === t.identifier) {
        this.tap = null;
        if (!cancel) this.tapUp = { x: T.x, y: T.y, x0: tp.x0, y0: tp.y0, moved: tp.moved };
      }
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
  // dedo segurando ATIRAR (lampião)
  get fireHeld() { for (const T of this.touches.values()) if (T.role === 'fire') return true; return false; }

  endFrame() {
    this.look.dx = 0; this.look.dy = 0; this.zoom = 0;
    this.jumpHit = false; this.pauseHit = false; this.recenterHit = false;
    this.invHit = false; this.fireHit = false; this.reloadHit = false;
    this.meleeHit = false; this.dodgeHit = false; this.weaponHit = false; this.healHit = false;
    if (!this.weapon) this.aimOn = false;
    this.tapUp = null; this.tapDX = 0; this.tapDY = 0;
  }

  // controls: desenha os controles do jogo · hint: aviso para girar (retrato, menus)
  // menu(g, view): menu de toque desenhado na tela inteira, no lugar dos controles
  draw(R, controls, hint, menu = null) {
    const c = this.canvas;
    const L = this._layout(R);
    if (!controls && !menu && !(hint && L.portrait)) { if (c.style.display !== 'none') c.style.display = 'none'; return; }
    // menus têm muito texto: grade de pixels mais fina (1 px CSS) para ficar legível
    const s = menu ? Math.min(L.s, 1) : L.s, g = this.g;
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
    const label = (text, x, y, size, color, alpha = 0.95) => {
      let px = Math.max(10, Math.round(P(size)));
      // tradução mais comprida que o português: letra menor, para caber no botão
      const w0 = textSprite(text, px, undefined, color, null, true, true).w, w1 = textSprite(text, px, undefined, color, null, true).w;
      if (w1 > w0 * 1.08) px = Math.max(8, Math.floor(px * w0 * 1.08 / w1));
      // texto escuro (botão aceso) vai sem sombra, senão vira um borrão
      drawText(g, text, P(x), P(y) - px * 0.66, px, { align: 'center', color, alpha, shadow: color === '#140c08' ? null : undefined });
    };

    if (menu) {
      menu(g, { s, cw, ch, vw: innerWidth, vh: innerHeight, gr: L.gr, portrait: L.portrait, u: L.u / [0.85, 1, 1.18][settings.touchSize ?? 1] });
      return;
    }

    // em pé: fundo da área dos controles, como a parte de baixo de um portátil
    if (L.portrait) {
      const top = Math.round(P(L.gr.y + L.gr.h));
      const grd = g.createLinearGradient(0, top, 0, ch);
      grd.addColorStop(0, '#1c140e'); grd.addColorStop(1, '#070504');
      g.fillStyle = grd; g.fillRect(0, top, cw, ch - top);
      g.fillStyle = '#6b5a40'; g.fillRect(0, top, cw, Math.max(1, Math.round(lw)));
    }

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

    // golpe e esquiva
    let punching = false;
    for (const T of this.touches.values()) if (T.role === 'melee') punching = true;
    if (!this.weapon) {
      ring(L.fire.x, L.fire.y, L.Rj, punching ? '#f2c879' : '#3a1208', punching ? 0.7 : 0.4, '#e8a080');
      label('GOLPE', L.fire.x, L.fire.y, L.Rj * 0.45, punching ? '#140c08' : '#efe2c4');
    } else {
      ring(L.melee2.x, L.melee2.y, L.Rr * 0.8, punching ? '#f2c879' : '#0d0907', punching ? 0.65 : 0.35);
      label('GOLPE', L.melee2.x, L.melee2.y, L.Rr * 0.38, punching ? '#140c08' : '#efe2c4');
    }
    let dodging = false;
    for (const T of this.touches.values()) if (T.role === 'dodge') dodging = true;
    ring(L.dodge.x, L.dodge.y, L.Rr * 0.8, dodging ? '#f2c879' : '#0d0907', dodging ? 0.65 : 0.3);
    label('ESQUIVA', L.dodge.x, L.dodge.y, L.Rr * 0.32, dodging ? '#140c08' : '#efe2c4');

    // arma
    if (this.weapon) {
      let firing = false;
      for (const T of this.touches.values()) if (T.role === 'fire') firing = true;
      ring(L.fire.x, L.fire.y, L.Rj, firing ? '#f2c879' : '#3a1208', firing ? 0.7 : 0.4, '#e8a080');
      label('ATIRAR', L.fire.x, L.fire.y, L.Rj * 0.45, firing ? '#140c08' : '#efe2c4');
      ring(L.aim.x, L.aim.y, L.Rr, this.aimOn ? '#c8a060' : '#0d0907', this.aimOn ? 0.65 : 0.35, this.aimOn ? '#f2c879' : '#d8c8a0');
      label('MIRAR', L.aim.x, L.aim.y, L.Rr * 0.48, this.aimOn ? '#140c08' : '#efe2c4');
      ring(L.reload.x, L.reload.y, L.Rr * 0.7, '#0d0907', 0.35);
      label('REC', L.reload.x, L.reload.y, L.Rr * 0.42, '#efe2c4');
    }

    // pausa, tela cheia e inventário
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
    {
      const r = L.inv;
      box(r);
      label('INV', r.x + r.w / 2, r.y + r.h / 2, r.h * 0.5, '#efe2c4');
      const w = L.weap;
      box(w);
      label('ARMA', w.x + w.w / 2, w.y + w.h / 2, w.h * 0.45, '#efe2c4');
      // cura rápida (ferido, com comida ou chá no inventário)
      if (this.heal > 0) {
        const h = L.heal;
        let on = false;
        for (const T of this.touches.values()) if (T.role === 'heal') on = true;
        box(h);
        if (on) { g.globalAlpha = 0.7; g.fillStyle = '#f2c879'; g.fillRect(Math.round(P(h.x)), Math.round(P(h.y)), Math.round(P(h.w)), Math.round(P(h.h))); }
        label('CURA ' + this.heal, h.x + h.w / 2, h.y + h.h / 2, h.h * 0.4, on ? '#140c08' : '#f2c879');
      }
    }
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
