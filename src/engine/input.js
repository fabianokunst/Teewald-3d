import { TouchControls } from './touch.js';

// Teclado, mouse (pointer lock), controle (Gamepad API) e toque
const PAD_MAP = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 };
const DIRS = ['up', 'down', 'left', 'right'];

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, x: -1, y: -1, clicked: false, moved: false, buttons: 0, leftHit: false };
    this.trig = { l: 0, r: 0, rHit: false };   // gatilhos analógicos L2/R2
    this.locked = false;
    this.pad = null;
    this.padState = {};
    this.padPressed = new Set();
    this.padHeld = new Set();
    this.nav = new Set();            // direções de menu (com repetição ao segurar)
    this.navState = {};
    this.padLost = false;            // controle em uso foi desconectado
    this.padJoined = false;          // controle novo detectado
    // celular/tablet: começa mostrando os controles de toque
    this.touchPrimary = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) && 'ontouchstart' in window;
    this.lastDevice = this.touchPrimary ? 'touch' : 'keyboard';
    this.onGesture = null;           // chamado dentro de eventos do usuário (libera áudio etc.)
    this.touch = new TouchControls(this, target.parentElement || document.body);
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      // setas repetem nos menus quando seguradas
      if (!e.repeat || e.code.startsWith('Arrow')) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      if (e.code !== 'Escape') this.onGesture?.('key');
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    addEventListener('mousemove', e => {
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true;
    });
    addEventListener('mouseup', e => { this.mouse.buttons = e.buttons; });
    addEventListener('mousedown', e => { this.mouse.buttons = e.buttons; if (e.button === 0) this.mouse.leftHit = true; this.mouse.clicked = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.lastDevice = 'keyboard'; this.onGesture?.('mouse'); });
    addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('gesturestart', e => e.preventDefault());   // pinça do Safari
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.target; });
    addEventListener('gamepadconnected', e => {
      // o navegador só revela o controle depois de um botão apertado: já conta como usado
      (this.padState[e.gamepad.index] ||= { prev: null, active: false }).active = true;
      this.lastDevice = 'pad'; this.padJoined = true;
    });
    addEventListener('gamepaddisconnected', e => {
      const st = this.padState[e.gamepad.index];
      if (st?.active && this.lastDevice === 'pad') this.padLost = true;
      delete this.padState[e.gamepad.index];
    });
  }

  lock() { if (!this.locked && this.target.requestPointerLock) { try { const p = this.target.requestPointerLock(); p?.catch?.(() => {}); } catch (e) { /* ignora */ } } }
  unlock() { if (this.locked) document.exitPointerLock(); }

  // lê todos os controles conectados; um controle só conta depois de ser usado
  poll() {
    let pads = [];
    try { pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : []; } catch (e) { /* sem permissão */ }
    this.padPressed.clear();
    this.padHeld.clear();
    let best = null, bestMag = -1;
    for (const p of pads) {
      const st = this.padState[p.index] ||= { prev: null, active: false };
      const now = {};
      for (const [k, i] of Object.entries(PAD_MAP)) now[k] = !!(p.buttons[i] && p.buttons[i].pressed);
      if (st.prev) {
        for (const k in PAD_MAP) if (now[k] && !st.prev[k]) { this.padPressed.add(k); st.active = true; this.lastDevice = 'pad'; }
      }
      st.prev = now;
      if (st.active) for (const k in PAD_MAP) if (now[k]) this.padHeld.add(k);
      const ax = p.axes;
      const mag = Math.max(Math.hypot(ax[0] || 0, ax[1] || 0), Math.hypot(ax[2] || 0, ax[3] || 0));
      if (mag > 0.5) { st.active = true; this.lastDevice = 'pad'; }
      if (st.active && mag > bestMag) { bestMag = mag; best = p; }
    }
    this.pad = best;
    // B: toque curto (solto em menos de 0,25 s) = esquiva; segurado = corre
    this.bTap = false;
    const tNow = performance.now();
    if (this.padPressed.has('b')) this.bDownAt = tNow;
    if (this.bDownAt && !this.padHeld.has('b')) { if (tNow - this.bDownAt < 250) this.bTap = true; this.bDownAt = 0; }
    // gatilhos: L2 mira, R2 atira (com borda, para um tiro por aperto)
    const tb = best ? best.buttons : [];
    const tl = tb[6] ? tb[6].value : 0, tr = tb[7] ? tb[7].value : 0;
    this.trig.rHit = tr > 0.5 && this.trig.r <= 0.5;
    this.trig.l = tl; this.trig.r = tr;
    // direções de menu: direcional ou analógico esquerdo, repetindo ao segurar
    const ax = best ? best.axes : [], sx = ax[0] || 0, sy = ax[1] || 0;
    const held = { up: this.padHeld.has('up') || sy < -0.6, down: this.padHeld.has('down') || sy > 0.6, left: this.padHeld.has('left') || sx < -0.6, right: this.padHeld.has('right') || sx > 0.6 };
    const t = performance.now();
    this.nav.clear();
    for (const d of DIRS) {
      const st = this.navState[d] ||= { on: false, next: 0 };
      if (!held[d]) { st.on = false; continue; }
      if (!st.on) { st.on = true; st.next = t + 380; this.nav.add(d); }
      else if (t >= st.next) { st.next = t + 110; this.nav.add(d); }
    }
  }

  down(...codes) { return codes.some(c => this.keys.has(c)); }
  hit(...codes) { return codes.some(c => this.pressed.has(c)); }
  padHit(...k) { return k.some(x => this.padPressed.has(x)); }

  // eixo de movimento (x: direita, y: frente)
  move() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    let mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    if (this.pad) {
      const ax = this.pad.axes, px = ax[0] || 0, py = -(ax[1] || 0);
      const m = Math.hypot(px, py);
      if (m > 0.18) { const k = Math.min(1, (m - 0.18) / 0.82) / m; x = px * k; y = py * k; }
    }
    const tv = this.touch.vec;
    if (this.touch.stickActive && (tv.x || tv.y)) { x = tv.x; y = tv.y; }
    return { x, y };
  }

  look() {
    // arrasto do dedo vale como movimento do mouse (um pouco mais sensível)
    const x = this.mouse.dx + this.touch.look.dx * 1.9, y = this.mouse.dy + this.touch.look.dy * 1.9;
    let px = 0, py = 0;
    if (this.pad) {
      const ax = this.pad.axes, rx = ax[2] || 0, ry = ax[3] || 0;
      if (Math.abs(rx) > 0.15) px = rx;
      if (Math.abs(ry) > 0.15) py = ry;
    }
    return { mx: x, my: y, px, py };
  }

  // variação da distância da câmera: roda do mouse, pinça, direcional ↑↓
  zoom(dt) {
    let z = this.mouse.wheel * 0.5 + this.touch.zoom;
    if (this.padHeld.has('up')) z -= dt * 5;
    if (this.padHeld.has('down')) z += dt * 5;
    return z;
  }

  running() {
    if (this.down('ShiftLeft', 'ShiftRight')) return true;
    if (this.padHeld.has('b') || this.padHeld.has('l3')) return true;
    return this.lastDevice === 'touch' && this.touch.runOn;
  }

  jump() { return this.hit('Space') || this.padHit('a') || this.touch.jumpHit; }
  // consome um aperto (ex.: A usado para pegar um item não pula)
  eat(...k) { for (const x of k) { this.padPressed.delete(x); this.pressed.delete(x); } }
  pause() { return this.hit('Escape', 'KeyP') || this.padHit('start') || this.touch.pauseHit || this.padLost; }
  recenter() { return this.padHit('r3') || this.touch.recenterHit; }
  toggleMap() { return this.hit('KeyM') || this.padHit('select'); }
  // arma: botão direito / L2 / LB mira; esquerdo (com o mouse preso) / R2 atira; RB / V golpe
  aimHeld() { return !!(this.mouse.buttons & 2) || this.trig.l > 0.3 || this.padHeld.has('lb') || !!this.touch.aimOn; }
  fireHit() { return (this.mouse.leftHit && this.locked) || this.trig.rHit || !!this.touch.fireHit; }
  fireHeld() { return (!!(this.mouse.buttons & 1) && this.locked) || this.trig.r > 0.5 || !!this.touch.fireHeld; }
  meleeHit() { return this.hit('KeyV') || this.padHit('rb') || !!this.touch.meleeHit; }
  dodgeHit() { return this.hit('KeyC', 'ControlLeft') || this.bTap || !!this.touch.dodgeHit; }
  // troca de arma: ◀▶ no direcional, ARMA no toque (1) · teclas 1-8 escolhem direto (weaponKey)
  weaponCycle() { return this.padHit('right') || this.touch.weaponHit ? 1 : this.padHit('left') ? -1 : 0; }
  weaponKey() { for (let i = 1; i <= 8; i++) if (this.pressed.has('Digit' + i) || this.pressed.has('Numpad' + i)) return i; return 0; }
  reloadHit() { return this.hit('KeyR') || this.padHit('x') || !!this.touch.reloadHit; }
  inventory() { return this.hit('KeyI', 'Tab') || this.padHit('y') || !!this.touch.invHit; }
  confirm() { return this.hit('Enter', 'Space', 'NumpadEnter') || this.padHit('a', 'start'); }
  back() { return this.hit('Escape', 'Backspace') || this.padHit('b'); }
  up() { return this.hit('ArrowUp', 'KeyW') || this.nav.has('up'); }
  downNav() { return this.hit('ArrowDown', 'KeyS') || this.nav.has('down'); }
  left() { return this.hit('ArrowLeft', 'KeyA') || this.nav.has('left'); }
  right() { return this.hit('ArrowRight', 'KeyD') || this.nav.has('right'); }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; this.mouse.clicked = false; this.mouse.moved = false; this.mouse.leftHit = false;
    this.padLost = false; this.padJoined = false;
    this.touch.endFrame();
  }
}
