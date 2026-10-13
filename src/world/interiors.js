import * as THREE from 'three';
import { MeshBuilder } from '../engine/builder.js';
import { M } from '../engine/materials.js';

// Interiores (fábrica de calçados, cripta do cemitério, gruta do chupacabras).
// Cada interior é montado longe da cidade (x, z >= 1200), numa altura fixa, com
// colisão própria no mesmo mundo de colisão; entrar/sair troca o jogador de lugar
// com uma passagem em preto, liga o clima de interior e as luzes do lugar.
//
// Contrato de um construtor de interior: build(ctx, B, o) → def
//   o = { x, y, z }: canto de origem do interior (piso em y)
//   B = MeshBuilder (materiais por nome, como no resto da cidade)
//   def = {
//     title: 'FÁBRICA DE CALÇADOS',
//     bounds: { x0, x1, z0, z1 },        // área jogável (coordenadas do mundo)
//     floorY: y,                          // piso padrão (onde não há caixa caminhável)
//     spawn: { x, z, h },                 // onde o jogador aparece ao entrar
//     exits: [{ x, z, r, label }],        // porta de saída (o jogo mostra SAIR)
//     lights: [{ x, y, z, col: [r,g,b], range, flicker: 0..1 }],
//     points: { nome: { x, y, z, h } },   // lugares para a missão (itens, chefe...)
//     objects: THREE.Object3D (opcional)  // peças com animação (máquinas, ventiladores)
//     update(dt, t) (opcional)            // anima as peças
//   }

export const INTERIOR_Y = 400;
const ORIGINS = { fabrica: [1300, 1300], cripta: [1700, 1300], gruta: [1300, 1700], torre: [1700, 1700] };

export class Interiors {
  // o: { ctx, scene, atmo, player, tpc, hud }
  constructor(o) {
    Object.assign(this, o);
    this.defs = {};
    this.cur = null;
    this.t = 0;
    this.outside = null;
    this.savedBounds = null;
  }

  // monta um interior com o construtor dado (uma vez)
  add(name, builder) {
    if (this.defs[name]) return this.defs[name];
    const [x, z] = ORIGINS[name] || [2100, 1300 + Object.keys(this.defs).length * 400];
    const B = new MeshBuilder(0);
    const def = builder(this.ctx, B, { x, y: INTERIOR_Y, z });
    const group = B.build(M);
    group.name = 'interior:' + name;
    this.scene.add(group);
    if (def.objects) this.scene.add(def.objects);
    def.name = name; def.group = group;
    this.defs[name] = def;
    return def;
  }

  get indoor() { return this.cur; }

  // entra; at = nome de um ponto (def.points) ou a entrada padrão
  enter(name, at = null) {
    const d = this.defs[name];
    if (!d) return;
    const P = this.player;
    if (!this.cur) this.outside = { x: P.pos.x, z: P.pos.z, h: P.heading + Math.PI, preset: this.atmo.name };
    this.cur = d;
    this.ctx.indoor = d;
    const b = this.ctx.playBounds;
    if (!this.savedBounds) this.savedBounds = { ...b };
    Object.assign(b, d.bounds);
    this.atmo.set(d.atmo || 'interior', 0);
    const s = at && d.points?.[at] ? d.points[at] : d.spawn;
    P.place(s.x, s.z, s.h ?? 0);
    this.tpc.snap(P);
    this.hud.place = null;
  }

  // sai; para = { x, z, h } fora (padrão: onde entrou), preset = clima de fora
  exit(to = null, preset = null) {
    if (!this.cur) return;
    this.cur = null;
    this.ctx.indoor = null;
    if (this.savedBounds) { Object.assign(this.ctx.playBounds, this.savedBounds); this.savedBounds = null; }
    const o = to || this.outside;
    this.atmo.set(preset || this.outside?.preset || 'noite', 0);
    if (o) { this.player.place(o.x, o.z, o.h ?? 0); this.tpc.snap(this.player); }
    this.hud.place = null;
  }

  // saída mais perto do jogador (para o botão SAIR)
  nearExit() {
    const d = this.cur;
    if (!d) return null;
    const P = this.player.pos;
    for (const e of d.exits || []) if (Math.hypot(e.x - P.x, e.z - P.z) < (e.r || 1.6)) return e;
    return null;
  }

  update(dt) {
    this.t += dt;
    const d = this.cur;
    for (const k in this.defs) this.defs[k].update?.(dt, this.t, this.defs[k] === d);
    if (!d) return;
    // luzes do lugar: as mais perto do jogador (lâmpadas piscando)
    const P = this.player.pos;
    const ls = (d.lights || []).filter(l => !l.off).map(l => [Math.hypot(l.x - P.x, l.z - P.z), l]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    for (const [, l] of ls) {
      let k = 1;
      if (l.flicker) {
        const n = Math.sin(this.t * 13 + l.x) * Math.sin(this.t * 7.3 + l.z * 3) + Math.sin(this.t * 31 + l.x * 2) * 0.3;
        k = n > 0.7 - l.flicker * 0.6 ? 1 : n < -0.6 ? 0.05 : 0.85;
      }
      this.atmo.light(l.x, l.y, l.z, l.col.map(c => c * k), l.range, 1);
    }
  }
}

// caixa sólida (parede, máquina) com colisão; y0..y1 em metros
export function solid(ctx, B, mat, x, y0, z, sx, sy, sz, rot = 0, o = {}) {
  B.box(mat, x, y0, z, sx, sy, sz, rot, o);
  if (o.noCollide) return;
  ctx.collision.addBox(x, z, sx / 2, sz / 2, rot, y0, y0 + sy, { cam: o.cam !== false, walk: !!o.walk });
}

// piso caminhável (para o chão do interior e mezaninos)
export function floorBox(ctx, x, z, hx, hz, y, rot = 0) {
  ctx.collision.addBox(x, z, hx, hz, rot, y - 0.5, y, { walk: true, cam: false });
}

export { THREE };
