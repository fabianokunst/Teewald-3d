import { PLAY_BOUNDS } from '../config.js';
import { drawText } from './overlay.js';
import { CHURCH } from '../world/church.js';

// Minimapa no canto inferior direito: o mapa da cidade é desenhado uma vez
// (1 px = 1 m) e depois recortado/girado em volta do jogador a cada quadro.
const COLORS = {
  ground: '#6e6538', forest: ['#4a4520', '#53461d', '#45482a'], water: '#3d6a78',
  asphalt: '#3b3a3a', sett: '#8a8274', concrete: '#9a968c', dirt: '#8c6c44', sidewalk: '#b4ab98',
  building: '#5e3b2c', buildingEdge: '#2e1c14', church: '#efe4c8', praca: '#a8704e', calcadao: '#b8aa90',
  field: '#4f7a2f', cemetery: '#8d8a7c', pavilion: '#7c7a74',
};

export class Minimap {
  constructor(ctx) {
    const m = 160;
    this.x0 = PLAY_BOUNDS.x0 - m; this.z0 = PLAY_BOUNDS.z0 - m;
    this.x1 = PLAY_BOUNDS.x1 + m; this.z1 = PLAY_BOUNDS.z1 + m;
    const W = Math.ceil(this.x1 - this.x0), H = Math.ceil(this.z1 - this.z0);
    const c = this.canvas = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const X = x => x - this.x0, Z = z => z - this.z0;
    g.fillStyle = COLORS.ground; g.fillRect(0, 0, W, H);
    // mata
    const step = 4;
    for (let z = this.z0; z < this.z1; z += step) for (let x = this.x0; x < this.x1; x += step) {
      if (!ctx.zones.isForest(x + step / 2, z + step / 2)) continue;
      g.fillStyle = COLORS.forest[(Math.floor(x / 12) * 7 + Math.floor(z / 12) * 3) % 3];
      g.fillRect(X(x), Z(z), step, step);
    }
    const poly = (pts, fill, stroke) => {
      g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    };
    const line = (pts, w, color) => {
      g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.lineWidth = w; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    };
    const L = ctx.landmarks;
    // áreas
    poly(L.field.poly, COLORS.field);
    poly(L.cemetery.poly, COLORS.cemetery);
    poly(L.calcadao.strip, '#7a7040');
    // rios
    for (const r of ctx.rivers.list) line(r.pts, r.width, COLORS.water);
    // ruas: calçada por baixo, depois o leito
    const roads = [...ctx.roads.list].sort((a, b) => a.rank - b.rank);
    for (const r of roads) if (r.sidewalk) line(r.pts, r.hw * 2 + 4, COLORS.sidewalk);
    for (const r of roads) line(r.pts, Math.max(1.5, r.hw * 2), COLORS[r.mat] || COLORS.sett);
    line(L.calcadao.path, 3.4, COLORS.calcadao);
    poly(L.praca.poly, COLORS.praca, '#5a3a24');
    // prédios
    for (const o of ctx.zones.obbs) {
      const c0 = Math.cos(o.rot), s0 = Math.sin(o.rot);
      const pts = [[-o.hx, -o.hz], [o.hx, -o.hz], [o.hx, o.hz], [-o.hx, o.hz]].map(([lx, lz]) => [o.x + lx * c0 + lz * s0, o.z - lx * s0 + lz * c0]);
      poly(pts, COLORS.building, COLORS.buildingEdge);
    }
    // pavilhão da Kartoffelfest
    {
      const k = L.kartoffel, c0 = Math.cos(k.rot), s0 = Math.sin(k.rot);
      poly([[-15, -9], [15, -9], [15, 9], [-15, 9]].map(([lx, lz]) => [k.x + lx * c0 + lz * s0, k.z - lx * s0 + lz * c0]), COLORS.pavilion, '#3a3a38');
    }
    // igreja (destacada, com cruz)
    {
      const ch = L.church, c0 = Math.cos(ch.rot), s0 = Math.sin(ch.rot);
      const P = (lx, lz) => [ch.x + lx * c0 + lz * s0, ch.z - lx * s0 + lz * c0];
      const hw = CHURCH.W / 2, hl = CHURCH.L / 2;
      poly([P(-hw, -hl), P(hw, -hl), P(hw, hl + 1.2), P(-hw, hl + 1.2)], COLORS.church, '#7a2a1c');
      this.church = P(0, 0);
    }
    this.size = 0;
  }

  // top: canto superior direito (controles de toque) em vez do inferior;
  // marker: { x, z } do objetivo (losango; fora do alcance, seta na borda)
  draw(g, W, H, player, camYaw, top = false, marker = null) {
    const k = H / 240;
    const size = Math.round(86 * k), r = size / 2, m = Math.round(6 * k);
    const cx = W - m - r, cy = top ? m + r : H - m - r;
    const meters = 95;                      // raio visível em metros
    const zoom = r / meters;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath();
    g.fillStyle = '#000'; g.fill();
    g.clip();
    g.imageSmoothingEnabled = false;
    g.translate(cx, cy);
    g.rotate(camYaw);
    g.scale(zoom, zoom);
    g.drawImage(this.canvas, -(player.pos.x - this.x0), -(player.pos.z - this.z0));
    // cruz da igreja (sempre de pé)
    g.restore();
    g.save();
    const rot = (x, z) => {
      const dx = (x - player.pos.x) * zoom, dz = (z - player.pos.z) * zoom;
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      return [cx + dx * c - dz * s, cy + dx * s + dz * c];
    };
    const [chx, chy] = rot(this.church[0], this.church[1]);
    const dch = Math.hypot(chx - cx, chy - cy);
    if (dch < r - 4 * k) {
      g.fillStyle = '#7a2a1c';
      g.fillRect(Math.round(chx - k), Math.round(chy - 3 * k), Math.max(2, Math.round(2 * k)), Math.round(6 * k));
      g.fillRect(Math.round(chx - 2.5 * k), Math.round(chy - 1.5 * k), Math.round(5 * k), Math.max(2, Math.round(1.6 * k)));
    }
    // objetivo da missão
    if (marker) {
      let [mx, my] = rot(marker.x, marker.z);
      let ex = mx - cx, ey = my - cy, e = Math.hypot(ex, ey);
      const lim = r - 6 * k, inside = e <= lim;
      if (!inside) { mx = cx + ex / e * lim; my = cy + ey / e * lim; }
      const s = Math.max(2, Math.round((inside ? 3.5 : 3) * k)), blink = Math.floor(performance.now() / 350) % 2;
      g.beginPath();
      if (inside) { g.moveTo(mx, my - s); g.lineTo(mx + s, my); g.lineTo(mx, my + s); g.lineTo(mx - s, my); }
      else {
        const ux = ex / e, uy = ey / e;
        g.moveTo(mx + ux * s * 1.4, my + uy * s * 1.4); g.lineTo(mx - uy * s - ux * s * 0.6, my + ux * s - uy * s * 0.6); g.lineTo(mx + uy * s - ux * s * 0.6, my - ux * s - uy * s * 0.6);
      }
      g.closePath();
      g.fillStyle = blink ? '#f2c879' : '#ffe7a0'; g.fill();
      g.lineWidth = 1; g.strokeStyle = '#140c08'; g.stroke();
    }
    // borda
    g.beginPath(); g.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    g.lineWidth = Math.max(1, Math.round(2 * k)); g.strokeStyle = '#d8c8a0'; g.stroke();
    g.beginPath(); g.arc(cx, cy, r + Math.max(1, k), 0, Math.PI * 2);
    g.lineWidth = Math.max(1, Math.round(k)); g.strokeStyle = '#140c08'; g.stroke();
    // jogador (seta)
    const a = player.heading - camYaw;
    const fx = Math.sin(a), fy = Math.cos(a);
    const L = 5 * k, Wd = 3.2 * k;
    g.beginPath();
    g.moveTo(cx + fx * L, cy + fy * L);
    g.lineTo(cx - fx * L * 0.6 + fy * Wd, cy - fy * L * 0.6 - fx * Wd);
    g.lineTo(cx - fx * L * 0.25, cy - fy * L * 0.25);
    g.lineTo(cx - fx * L * 0.6 - fy * Wd, cy - fy * L * 0.6 + fx * Wd);
    g.closePath();
    g.fillStyle = '#f2c879'; g.fill();
    g.lineWidth = 1; g.strokeStyle = '#140c08'; g.stroke();
    // norte
    const nx = cx + Math.sin(camYaw) * (r - 6 * k), ny = cy - Math.cos(camYaw) * (r - 6 * k);
    drawText(g, 'N', nx, ny - 6 * k, 10 * k, { align: 'center', color: '#f4e8cc' });
    g.restore();
  }
}
