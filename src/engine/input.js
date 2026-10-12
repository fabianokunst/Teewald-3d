// Teclado, mouse (pointer lock) e controle (Gamepad API)
export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, x: -1, y: -1, clicked: false, moved: false };
    this.locked = false;
    this.pad = null;
    this.padPrev = {};
    this.padPressed = new Set();
    this.lastDevice = 'keyboard';
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => {
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true;
    });
    addEventListener('mousedown', e => { this.mouse.clicked = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.lastDevice = 'keyboard'; });
    addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.target; });
  }

  lock() { if (!this.locked && this.target.requestPointerLock) { try { const p = this.target.requestPointerLock(); p?.catch?.(() => {}); } catch (e) { /* ignora */ } } }
  unlock() { if (this.locked) document.exitPointerLock(); }

  // lê todos os controles conectados; um controle só conta depois de ser usado
  poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : [];
    this.padPressed.clear();
    const map = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, select: 8, start: 9, l3: 10, up: 12, down: 13, left: 14, right: 15 };
    let best = null, bestMag = -1;
    this.padHeld = new Set();
    for (const p of pads) {
      const st = (this.padState ||= {})[p.index] ||= { prev: null, active: false };
      const now = {};
      for (const [k, i] of Object.entries(map)) now[k] = !!(p.buttons[i] && p.buttons[i].pressed);
      if (st.prev) {
        for (const k of Object.keys(map)) if (now[k] && !st.prev[k]) { this.padPressed.add(k); st.active = true; this.lastDevice = 'pad'; }
      }
      st.prev = now;
      for (const k of Object.keys(map)) if (now[k]) this.padHeld.add(k);
      const ax = p.axes;
      const mag = Math.max(Math.hypot(ax[0] || 0, ax[1] || 0), Math.hypot(ax[2] || 0, ax[3] || 0));
      if (mag > 0.5) { st.active = true; this.lastDevice = 'pad'; }
      if (st.active && mag > bestMag) { bestMag = mag; best = p; }
    }
    this.pad = best;
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
    return { x, y };
  }

  look() {
    let x = this.mouse.dx, y = this.mouse.dy;
    let px = 0, py = 0;
    if (this.pad) {
      const ax = this.pad.axes, rx = ax[2] || 0, ry = ax[3] || 0;
      if (Math.abs(rx) > 0.15) px = rx;
      if (Math.abs(ry) > 0.15) py = ry;
    }
    return { mx: x, my: y, px, py };
  }

  running() {
    if (this.down('ShiftLeft', 'ShiftRight')) return true;
    if (this.padHeld && (this.padHeld.has('b') || this.padHeld.has('l3'))) return true;
    if (this.pad) { const b = this.pad.buttons; return !!(b[7] && b[7].value > 0.3); }
    return false;
  }

  jump() { return this.hit('Space') || this.padHit('a'); }
  pause() { return this.hit('Escape', 'KeyP') || this.padHit('start'); }
  confirm() { return this.hit('Enter', 'Space', 'NumpadEnter') || this.padHit('a', 'start'); }
  back() { return this.hit('Escape', 'Backspace') || this.padHit('b'); }
  up() { return this.hit('ArrowUp', 'KeyW') || this.padHit('up') || this._stickEdge('up'); }
  downNav() { return this.hit('ArrowDown', 'KeyS') || this.padHit('down') || this._stickEdge('down'); }
  left() { return this.hit('ArrowLeft', 'KeyA') || this.padHit('left') || this._stickEdge('left'); }
  right() { return this.hit('ArrowRight', 'KeyD') || this.padHit('right') || this._stickEdge('right'); }

  _stickEdge(dir) {
    if (!this.pad) return false;
    const ax = this.pad.axes, x = ax[0] || 0, y = ax[1] || 0;
    const now = { up: y < -0.6, down: y > 0.6, left: x < -0.6, right: x > 0.6 }[dir];
    const key = 'stick_' + dir;
    const was = this.padPrev[key];
    this.padPrev[key] = now;
    return now && !was;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; this.mouse.clicked = false; this.mouse.moved = false;
  }
}
