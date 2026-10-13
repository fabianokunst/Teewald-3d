import * as THREE from 'three';
import { drawText, panel } from './overlay.js';
import { ITEMS, PISTOL_MAG } from '../game/items.js';
import { makeItemModel } from '../game/itemModels.js';
import { G } from '../engine/ps1material.js';

// Tela de inventário (pausa o jogo): 8 espaços, item selecionado girando em 3D,
// nome, descrição e ações (equipar, guardar, carregar, examinar).
// A prévia 3D é desenhada pelo Renderer num recorte da tela (R.overlay).

const COLS = 4, ROWS = 2;
const ICON = 48;

export class InventoryScreen {
  constructor(R, input, audio, inventory, pistol, M) {
    this.R = R; this.input = input; this.audio = audio; this.inv = inventory; this.pistol = pistol;
    this.sel = 0; this.menu = null; this.menuSel = 0; this.examine = false;
    this.t = 0; this.rot = { x: 0.25, y: 0 }; this.rects = [];
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1.2, 0.02, 20);
    // câmera do lado do sol, para o item aparecer iluminado
    const sun = G.uSunDir.value;
    this.cam.position.set(sun.x, 0.35, sun.z).normalize().multiplyScalar(0.62);
    this.cam.lookAt(0, 0, 0);
    this.yaw0 = Math.atan2(sun.x, sun.z);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.models = {};
    for (const id of Object.keys(ITEMS)) {
      const m = makeItemModel(id, M), box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const wrap = new THREE.Group();
      m.position.sub(c);
      wrap.add(m);
      wrap.scale.setScalar(0.24 / Math.max(size.x, size.y, size.z));
      wrap.userData.tilt = id === 'pistol' ? -Math.PI / 2 : 0;   // pistola de lado
      this.models[id] = wrap;
    }
    this.icons = this._makeIcons();
  }

  // ícones: cada modelo renderizado uma vez num quadro de 48x48 com fundo transparente
  _makeIcons() {
    const gl = this.R.gl, rt = new THREE.WebGLRenderTarget(ICON, ICON, { depthBuffer: true });
    const buf = new Uint8Array(ICON * ICON * 4), out = {};
    const cam = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
    cam.position.copy(this.cam.position).multiplyScalar(0.85); cam.lookAt(0, 0, 0);
    for (const [id, m] of Object.entries(this.models)) {
      this.pivot.clear(); this.pivot.add(m);
      this.pivot.rotation.set(0, this.yaw0 + m.userData.tilt + 0.5, 0);
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0); gl.clear();
      gl.render(this.scene, cam);
      gl.readRenderTargetPixels(rt, 0, 0, ICON, ICON, buf);
      const c = document.createElement('canvas'); c.width = c.height = ICON;
      const g = c.getContext('2d'), img = g.createImageData(ICON, ICON);
      for (let y = 0; y < ICON; y++) img.data.set(buf.subarray((ICON - 1 - y) * ICON * 4, (ICON - y) * ICON * 4), y * ICON * 4);
      g.putImageData(img, 0, 0);
      out[id] = c;
    }
    gl.setRenderTarget(null); gl.setClearColor(0x000000, 1);
    rt.dispose();
    this.pivot.clear();
    return out;
  }

  open() {
    const first = this.inv.slots.findIndex(s => s);
    this.sel = first < 0 ? 0 : first;
    this.menu = null; this.examine = false; this.t = 0;
    this.audio.menuOk();
  }

  close() { this.R.overlay = null; this.pistol.teach(); }

  slot() { return this.inv.slots[this.sel]; }

  actions(s) {
    if (!s) return [];
    const p = this.pistol, list = [];
    if (s.id === 'pistol') {
      list.push(this.inv.equipped === 'pistol' ? { label: 'GUARDAR', act: 'unequip' } : { label: 'EQUIPAR', act: 'equip' });
      if (p.mag < PISTOL_MAG && p.ammo > 0) list.push({ label: 'CARREGAR', act: 'load' });
    }
    if (s.id === 'ammo9' && this.inv.find('pistol') && p.mag < PISTOL_MAG) list.push({ label: 'CARREGAR PISTOLA', act: 'load' });
    list.push({ label: 'EXAMINAR', act: 'examine' });
    return list;
  }

  _do(act) {
    const p = this.pistol;
    if (act === 'equip') p.equip(true);
    else if (act === 'unequip') p.equip(false);
    else if (act === 'load') { if (!p.reloadNow()) this.audio.menuBack(); }
    else if (act === 'examine') { this.examine = true; this.rot = { x: 0.25, y: 0 }; this.audio.menuOk(); }
    this.menu = null;
  }

  // devolve 'close' para voltar ao jogo
  update(dt, mouse) {
    const I = this.input;
    this.t += dt;
    if (this.examine) {
      if (I.left()) this.rot.y -= 0.35;
      if (I.right()) this.rot.y += 0.35;
      if (I.up()) this.rot.x -= 0.3;
      if (I.downNav()) this.rot.x += 0.3;
      // toque: arrastar gira o item; um toque sem arrastar volta
      const T = I.touch;
      if (T.tap) { this.rot.y += T.tapDX * 0.012; this.rot.x = Math.max(-1.4, Math.min(1.4, this.rot.x + T.tapDY * 0.01)); }
      else this.rot.y += dt * 0.5;
      const dragged = T.tapUp && T.tapUp.moved;
      if (I.back() || I.confirm() || I.inventory() || (I.mouse.clicked && !dragged)) { this.examine = false; this.audio.menuBack(); }
      return null;
    }
    // mouse/toque: passar por cima seleciona, clique confirma
    let click = null;
    if (mouse && (I.mouse.moved || I.mouse.clicked)) {
      const [mx, my] = mouse;
      for (const r of this.rects) {
        if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
        if (r.kind === 'slot' && I.mouse.moved && !this.menu && this.sel !== r.i) { this.sel = r.i; this.audio.menuMove(); }
        if (r.kind === 'menu' && I.mouse.moved && this.menuSel !== r.i) { this.menuSel = r.i; this.audio.menuMove(); }
        if (I.mouse.clicked) click = r;
      }
    }
    if (click?.kind === 'close') { this.audio.menuBack(); return 'close'; }
    if (this.menu) {
      const n = this.menu.length;
      if (I.up()) { this.menuSel = (this.menuSel - 1 + n) % n; this.audio.menuMove(); }
      if (I.downNav()) { this.menuSel = (this.menuSel + 1) % n; this.audio.menuMove(); }
      if (click?.kind === 'menu') { this._do(this.menu[click.i].act); return null; }
      if (click?.kind === 'slot') { this.menu = null; this.sel = click.i; return null; }
      // clique/toque fora das ações cancela
      if (I.mouse.clicked && !click) { this.menu = null; this.audio.menuBack(); return null; }
      if (I.confirm()) { this._do(this.menu[this.menuSel].act); return null; }
      if (I.back()) { this.menu = null; this.audio.menuBack(); }
      if (I.inventory()) { this.audio.menuBack(); return 'close'; }
      return null;
    }
    const c = this.sel % COLS, r = Math.floor(this.sel / COLS);
    let nc = c, nr = r;
    if (I.left()) nc = (c - 1 + COLS) % COLS;
    if (I.right()) nc = (c + 1) % COLS;
    if (I.up()) nr = (r - 1 + ROWS) % ROWS;
    if (I.downNav()) nr = (r + 1) % ROWS;
    if (nc !== c || nr !== r) { this.sel = nr * COLS + nc; this.audio.menuMove(); }
    const openMenu = () => { if (this.slot()) { this.menu = this.actions(this.slot()); this.menuSel = 0; this.audio.menuOk(); } };
    if (click?.kind === 'slot') { if (click.i === this.sel) openMenu(); else { this.sel = click.i; this.audio.menuMove(); } }
    else if (I.confirm()) openMenu();
    if (I.back() || I.inventory()) { this.audio.menuBack(); return 'close'; }
    return null;
  }

  draw(g, W, H) {
    const k = H / 240, R = Math.round;
    this.rects = [];
    g.globalAlpha = 0.6; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    const pw = 300 * k, ph = 196 * k, px = R((W - pw) / 2), py = R((H - ph) / 2);
    panel(g, px, py, pw, ph, 0.85);
    const s = this.slot(), def = s ? ITEMS[s.id] : null;
    const device = this.input.lastDevice;

    // prévia 3D girando
    const box = this.examine ? [px + 10 * k, py + 26 * k, 280 * k, 128 * k] : [px + 10 * k, py + 26 * k, 128 * k, 100 * k];
    g.strokeStyle = '#6b5a40'; g.lineWidth = 1;
    g.strokeRect(R(box[0]) - 0.5, R(box[1]) - 0.5, R(box[2]) + 1, R(box[3]) + 1);
    this.pivot.clear();
    if (s) {
      const m = this.models[s.id];
      this.pivot.add(m);
      if (this.examine) this.pivot.rotation.set(this.rot.x, this.yaw0 + m.userData.tilt + this.rot.y, 0);
      else this.pivot.rotation.set(0.15 + Math.sin(this.t * 0.7) * 0.08, this.yaw0 + m.userData.tilt + this.t * 0.9, 0);
      this.R.overlay = { scene: this.scene, camera: this.cam, rect: box.map(R), clear: 0x231a12 };
    } else {
      this.R.overlay = { scene: this.scene, camera: this.cam, rect: box.map(R), clear: 0x231a12 };
      drawText(g, 'VAZIO', box[0] + box[2] / 2, box[1] + box[3] / 2 - 6 * k, 12 * k, { align: 'center', color: '#6b5a40' });
    }

    // a prévia 3D fica no canvas de baixo: abre um buraco no painel
    g.clearRect(R(box[0]), R(box[1]), R(box[2]), R(box[3]));
    drawText(g, this.examine ? 'EXAMINAR' : 'INVENTÁRIO', px + 10 * k, py + 6 * k, 16 * k, { color: '#f2c879' });
    // fechar (útil no toque)
    if (device === 'touch') {
      // no toque, um botão de verdade para fechar
      const bw = 28 * k, bh = 20 * k, bx = R(px + pw - bw - 5 * k), by = R(py + 4 * k);
      g.globalAlpha = 0.9; g.fillStyle = '#18120c'; g.fillRect(bx, by, R(bw), R(bh)); g.globalAlpha = 1;
      g.strokeStyle = '#d8c8a0'; g.strokeRect(bx + 0.5, by + 0.5, R(bw) - 1, R(bh) - 1);
      drawText(g, '✕', bx + bw / 2, by + 3 * k, 14 * k, { align: 'center', color: '#efe2c4' });
      this.rects.push({ kind: 'close', x: bx - 6 * k, y: py - 4 * k, w: bw + 12 * k, h: bh + 12 * k });
    } else {
      const cs = drawText(g, '✕', px + pw - 8 * k, py + 5 * k, 14 * k, { align: 'right', color: '#c8b898' });
      this.rects.push({ kind: 'close', x: px + pw - 8 * k - cs.w - 4 * k, y: py, w: cs.w + 12 * k, h: 22 * k });
    }

    // texto do item
    const ty = this.examine ? py + 160 * k : py + 132 * k;
    if (def) {
      drawText(g, def.name, px + 10 * k, ty, 14 * k, { color: '#f2e6c8' });
      def.desc.forEach((l, i) => drawText(g, l, px + 10 * k, ty + (16 + i * 11) * k, 11 * k, { color: '#c8b898' }));
      const info = s.id === 'pistol' ? `BALAS ${this.pistol.mag}/${PISTOL_MAG}` + (this.inv.equipped === 'pistol' ? '  ·  NA MÃO' : '')
        : `QUANTIDADE ${s.n}`;
      drawText(g, info, px + 10 * k, ty + 40 * k, 11 * k, { color: '#f2c879' });
    }
    if (this.examine) {
      const hint = device === 'pad' ? 'DIRECIONAL girar   B voltar' : device === 'touch' ? 'arraste para girar   toque para voltar' : '←→↑↓ girar   ESC voltar';
      drawText(g, hint, W / 2, py + ph + 3 * k, 10 * k, { align: 'center', color: '#a89878' });
      return;
    }

    // grade
    const sz = 33 * k, gap = 3 * k, gx = px + 150 * k, gy = py + 28 * k;
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = R(gx + (i % COLS) * (sz + gap)), y = R(gy + Math.floor(i / COLS) * (sz + gap)), w = R(sz);
      const on = i === this.sel, sl = this.inv.slots[i];
      g.globalAlpha = 0.7; g.fillStyle = on ? '#3a2a18' : '#18120c'; g.fillRect(x, y, w, w); g.globalAlpha = 1;
      g.strokeStyle = on ? '#f2c879' : '#6b5a40';
      g.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);
      if (sl) {
        g.imageSmoothingEnabled = false;
        g.drawImage(this.icons[sl.id], x + 1, y + 1, w - 2, w - 2);
        if (ITEMS[sl.id].stack) drawText(g, String(sl.n), x + w - 2 * k, y + w - 11 * k, 10 * k, { align: 'right', color: '#f2e6c8' });
        if (sl.id === 'pistol') drawText(g, String(this.pistol.mag), x + w - 2 * k, y + w - 11 * k, 10 * k, { align: 'right', color: this.pistol.mag ? '#9fe08a' : '#ff7060' });
        if (this.inv.equipped === sl.id) drawText(g, 'E', x + 3 * k, y + 2 * k, 10 * k, { color: '#f2c879' });
      }
      this.rects.push({ kind: 'slot', i, x, y, w, h: w });
    }
    // mão
    const eq = this.inv.equipped ? ITEMS[this.inv.equipped].name : 'NADA';
    drawText(g, 'NA MÃO: ' + eq, gx, gy + 2 * (sz + gap) + 4 * k, 10 * k, { color: '#a89878' });

    // ações do item
    if (this.menu && device === 'touch') {
      // no toque, cada ação é um botão alto (dá para acertar com o dedo)
      const mx = gx, my = gy + 2 * (sz + gap) + 18 * k, mw = 141 * k, bh = 21 * k, step = 24 * k;
      this.menu.forEach((it, i) => {
        const y = R(my + i * step);
        g.globalAlpha = 0.92; g.fillStyle = '#18120c'; g.fillRect(R(mx), y, R(mw), R(bh)); g.globalAlpha = 1;
        g.fillStyle = '#4a3a28'; g.fillRect(R(mx) + 1, y + 1, R(mw) - 2, Math.max(1, R(k)));
        g.strokeStyle = '#d8c8a0'; g.strokeRect(R(mx) + 0.5, y + 0.5, R(mw) - 1, R(bh) - 1);
        drawText(g, it.label, mx + mw / 2, y + 4 * k, 13 * k, { align: 'center', color: '#efe2c4' });
        this.rects.push({ kind: 'menu', i, x: mx, y, w: mw, h: bh });
      });
    } else if (this.menu) {
      const mx = gx, my = gy + 2 * (sz + gap) + 20 * k, mw = 141 * k, mh = (this.menu.length * 14 + 6) * k;
      panel(g, mx, my, mw, mh, 0.9);
      this.menu.forEach((it, i) => {
        const y = my + (4 + i * 14) * k, on = i === this.menuSel;
        drawText(g, (on ? '▶ ' : '  ') + it.label, mx + 6 * k, y, 12 * k, { color: on ? '#f2c879' : '#c8b898' });
        this.rects.push({ kind: 'menu', i, x: mx, y, w: mw, h: 14 * k });
      });
    }
    const hint = device === 'pad' ? 'DIRECIONAL escolher   A usar   B / Y fechar'
      : device === 'touch' ? (this.menu ? 'toque na ação · fora para cancelar' : 'toque no item para ver o que fazer')
        : '↑↓←→ escolher   ENTER usar   ESC / I fechar';
    drawText(g, hint, W / 2, py + ph + 3 * k, 10 * k, { align: 'center', color: '#a89878' });
  }
}
