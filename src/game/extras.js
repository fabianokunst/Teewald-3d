import * as THREE from 'three';
import { DOCS, LEGENDS, CALLS, CALL_SILENT } from './lore.js';
import { Dialogue } from '../ui/dialogue.js';
import { Paper } from '../ui/paper.js';
import { drawText, textSprite, panel, FONT_UI } from '../ui/overlay.js';
import { MeshBuilder } from '../engine/builder.js';
import { M } from '../engine/materials.js';
import { ps1Material } from '../engine/ps1material.js';
import { makeCanvas, canvasTex } from '../engine/textures.js';
import { orelhao } from '../world/props.js';
import { TYPES } from './campaign.js';
import { places } from './chapters/common.js';
import { chapterNo } from './chapters/index.js';
import { GunAudio } from './gunAudio.js';
import { Presence } from './presence.js';
import { GhostBand } from './ghostBand.js';

// Extras da cidade, valem em todos os capítulos:
// - documentos espalhados (ARQUIVOS) e fichas das criaturas vistas (LENDAS);
// - portas da igreja (entrar pela frente ou pela sacristia) e o que há lá dentro:
//   tocar o sino, água benta, a gata Mimi escondida na torre;
// - orelhões que tocam sozinhos de noite (ATENDER);
// - pedidos: a gata da Dona Hilda e o cachorro do Lucas;
// - a presença do chupacabras na neblina (presence.js) e a bandinha fantasma (ghostBand.js).
// O que foi achado fica salvo à parte do progresso (localStorage teewald.extras.v1).

const KEY = 'teewald.extras.v1';
const fresh = () => ({ docs: [], legends: [], quests: { mimi: 0, boris: 0 } });
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) return { ...fresh(), ...s, quests: { ...fresh().quests, ...(s.quests || {}) } }; } catch (e) { /* sem armazenamento */ }
  return fresh();
}

// lutas perto da igreja: nessas etapas a porta fica fechada
const CHURCH_BLOCK = { caes: ['defesa'], asas: ['torre', 'rainha'] };
// orelhões novos (além do da praça): perto do ponto real de telefone, dos Correios, do hospital e da escola
const PHONE_SPOTS = [[-138, -103], [-86, 13], [223, 59], [119, -28]];
const RING_FIRST = [40, 90], RING_EVERY = [150, 240], RING_LEN = 32;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Extras {
  // o: { ctx, scene, audio, input, player, camera, tpc, hud, R, npcs, combat, campaign, mission, interiors, inventory, atmo, effects, pistol }
  constructor(o) {
    Object.assign(this, o);
    this.state = load();
    this.dialogue = new Dialogue(o.audio);
    this.paper = new Paper();
    this.modal = null;              // 'paper' | 'talk' (o jogo fica no estado 'extra')
    this.focus = null; this.chip = null; this.touchHit = false;
    this.notes = [];                // avisos pequenos (nova lenda, arquivo guardado)
    this.chapter = 0; this.perChapter = {};
    this.church = o.interiors.defs.igreja || null;
    this._v = new THREE.Vector3();
    this.presence = new Presence({ ctx: o.ctx, scene: o.scene, effects: o.effects, audio: o.audio, player: o.player, camera: o.camera, combat: o.combat, campaign: o.campaign, atmo: o.atmo, pistol: o.pistol });
    this.band = new GhostBand({ ctx: o.ctx, scene: o.scene, audio: o.audio, atmo: o.atmo, player: o.player, camera: o.camera, campaign: o.campaign, combat: o.combat });
    this._layout();
    addEventListener('touchstart', e => {
      const c = this.chip;
      if (!c) return;
      for (const t of e.changedTouches) {
        const [x, y] = this.R.toInternal(t.clientX, t.clientY), pad = 6 * (this.R.H / 240);
        if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) this.touchHit = true;
      }
    }, { passive: true });
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* sem armazenamento */ } }
  erase() { this.state = fresh(); this.save(); for (const d of this.docs) d.grp.visible = true; }

  // ---------- montagem: documentos, orelhões, coleira, casas dos pedidos ----------
  _layout() {
    const ctx = this.ctx, P = places(this.campaign), S = this.npcs.S, L = ctx.landmarks;
    this.P = P;
    // lugar livre no chão perto de (x, z)
    const free = (x, z, r = 0.6, max = 7) => {
      for (let k = 0; k < 90; k++) {
        const a = k * 2.39996, d = Math.sqrt(k / 90) * max, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (ctx.zones.insideBuilding(px, pz, 0.4)) continue;
        const y = ctx.groundAt(px, pz, 1000);
        if (ctx.waterDepth(px, pz, y) > 0) continue;
        let ok = true;
        for (const it of ctx.collision.near(px, pz, r + 1)) {
          if (it.walk || it.y1 < y + 0.1 || it.y0 > y + 1.8) continue;
          if (it.t === 'circle' ? Math.hypot(px - it.x, pz - it.z) < it.r + r : Math.abs((px - it.x) * it.c - (pz - it.z) * it.s) < it.hx + r && Math.abs((px - it.x) * it.s + (pz - it.z) * it.c) < it.hz + r) { ok = false; break; }
        }
        if (ok) return { x: px, z: pz, y };
      }
      return { x, z, y: ctx.groundAt(x, z, 1000) };
    };
    const K = L.kartoffel, kf = K ? ((lx, lz) => { const c = Math.cos(K.rot), s = Math.sin(K.rot); return [K.x + lx * c + lz * s, K.z - lx * s + lz * c]; }) : null;
    // diante da frente do prédio (a frente é o +z local), como em chapters/common.js
    const front = (b, k = 2.5) => { const c = Math.cos(b.rot), s = Math.sin(b.rot), lz = (b.d || 8) / 2 + k; return [b.x + lz * s, b.z + lz * c]; };
    const C = this.church?.points;
    const calc = (di, t) => { const p = S.calc(di, t); return [p.x, p.z]; };
    // pontos de referência
    const bridgeNear = (x, z) => (ctx.bridges || []).reduce((b, q) => (!b || Math.hypot(q.x - x, q.z - z) < Math.hypot(b.x - x, b.z - z) ? q : b), null);
    const [lx, lz] = calc(40, 0), bridge = bridgeNear(lx, lz);
    const nearestHouse = (x, z) => {
      let best = null, bd = 70;
      for (const b of ctx.buildings || []) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd && !b.sign) { bd = d; best = b; } }
      return best;
    };
    // casas dos pedidos (de noite, os dois ficam na porta)
    {
      const [hx, hz] = calc(-46, 0.8), hb = nearestHouse(hx, hz), hf = hb ? S.front(hb) : [hx, hz, 0];
      this.home = { hilda: { x: hf[0], z: hf[1], h: hf[2] } };
      const bx = bridge ? bridge.x : lx, bz = bridge ? bridge.z : lz;
      // última casa antes da ponte, do lado do calçadão
      const lb = nearestHouse(bx + (lx - bx) * 0.2, bz + (lz - bz) * 0.2), lf = lb ? S.front(lb) : [lx, lz, 0];
      this.home.lucas = { x: lf[0], z: lf[1], h: lf[2] };
    }
    // ---- documentos ----
    const at = {
      jornal1: () => free(P.praca.x + 4, P.praca.z + 3),
      cartaz_mimi: () => { const [x, z] = calc(-40, 0.85); return this._pole(x, z) || free(x, z); },
      cartaz_boris: () => { const x = bridge ? bridge.x : lx, z = bridge ? bridge.z : lz; return this._pole(x, z, 14) || free(x + 4, z + 4); },
      oficio: () => (kf ? free(...kf(-K.hl - 2.5, 2.2), 0.5, 4) : free(P.praca.x - 6, P.praca.z)),
      programa: () => (kf ? (() => { const [x, z] = kf(K.hl - 3.8, -1.9); return { x, z, y: ctx.groundAt(x, z, 1000) }; })() : free(P.praca.x, P.praca.z + 6)),
      foto1910: () => C && { ...C.fotoAltar, y: C.fotoAltar.y, indoor: true },
      wendt1: () => C && { x: C.lampiao.x + 0.35, z: C.lampiao.z - 0.2, y: C.lampiao.y, indoor: true },
      wendt2: () => free(P.cemetery.x + 3, P.cemetery.z - 2),
      ata1879: () => (P.salao ? free(...front(P.salao)) : free(P.church.x + 20, P.church.z)),
      jornal1983: () => free(P.factoryDoor.x + 2, P.factoryDoor.z + 2),
      boletim1978: () => free(P.museuDoor.x + 1.5, P.museuDoor.z + 1),
      carta_rudi: () => free(-86, 13, 0.6, 9),
      redacao: () => (P.escola ? free(...front(P.escola)) : free(119, -28, 0.6, 9)),
      nota_agro: () => free(P.agroDoor.x + 1.5, P.agroDoor.z + 1.5),
      caderno_romeu: () => free(P.prefeituraBack.x + 2, P.prefeituraBack.z + 1),
      receita: () => free(P.grave.x + 3, P.grave.z + 2, 0.6, 5),
      lista: () => { const ph = (ctx.phones || [])[0]; return ph ? free(ph.x + Math.sin(ph.rot) * 1.6 + Math.cos(ph.rot) * 0.8, ph.z + Math.cos(ph.rot) * 1.6 - Math.sin(ph.rot) * 0.8, 0.3, 2) : free(P.praca.x, P.praca.z); },
      desenho: () => free(P.coop.x + 3, P.coop.z + 3),
    };
    const paperMat = this._paperMat();
    // brilho próprio dos papéis (o dos itens do chão é de outro material)
    this.docGlint = this.combat.glintMat.clone();
    this.docs = [];
    for (const d of DOCS) {
      // papéis da história (diário da cripta, álbum da paróquia): só o capítulo mostra
      if (d.story) continue;
      let p = null;
      try { p = at[d.id]?.(); } catch (e) { p = null; }
      if (!p) p = free(P.praca.x + (this.docs.length % 5) * 2, P.praca.z - 4);
      const grp = new THREE.Group();
      const B = new MeshBuilder(0);
      B.col = [1, 1, 1];
      if (p.pole) {
        // cartaz grampeado no poste, virado para fora
        const c = Math.cos(p.rot), s = Math.sin(p.rot), w = 0.17;
        const q = (lx2, y) => [p.x + lx2 * c + p.r * s, y, p.z - lx2 * s + p.r * c];
        B.quad('extras:paper', q(-w, p.y + 1.35), q(w, p.y + 1.35), q(w, p.y + 1.78), q(-w, p.y + 1.78));
      } else {
        const r = (DOCS.indexOf(d) * 1.7) % 6.28, c = Math.cos(r), s = Math.sin(r), hw = 0.11, hh = 0.15, y = p.y + 0.012;
        const q = (a, b) => [p.x + a * c + b * s, y, p.z - a * s + b * c];
        B.quad('extras:paper', q(-hw, hh), q(hw, hh), q(hw, -hh), q(-hw, -hh));
      }
      M['extras:paper'] = paperMat;
      grp.add(B.build(M));
      const glint = new THREE.Sprite(this.docGlint);
      glint.scale.setScalar(0.45);
      glint.position.set(p.x, p.y + (p.pole ? 1.6 : 0.3), p.z);
      grp.add(glint);
      grp.visible = !this.state.docs.includes(d.id);
      this.scene.add(grp);
      this.docs.push({ d, p, grp, glint, ph: Math.random() * 6 });
    }
    // ---- orelhões novos ----
    const B = new MeshBuilder(0);
    for (const [x, z] of PHONE_SPOTS) {
      const s = this._sidewalk(x, z);
      if (s) orelhao(B, ctx, s.x, s.z, s.rot);
    }
    this.scene.add(B.build(M));
    this.phones = (ctx.phones || []).map(p => ({ ...p, rang: false }));
    // ---- coleira do Bóris: no mato, perto da clareira do chupacabras ----
    {
      const cl = P.clearing, tr = P.trail || [];
      const q = tr[Math.floor(tr.length * 0.75)] || [cl.x + 8, cl.z + 8];
      const s = free(q[0] + 4, q[1] - 3, 0.4, 6);
      this.collar = { x: s.x, z: s.z, y: s.y };
      const g = new THREE.Group(), m = makeCollar();
      m.position.set(s.x, s.y + 0.02, s.z); m.rotation.y = 0.7;
      const gl = new THREE.Sprite(this.combat.glintMat); gl.scale.setScalar(0.4); gl.position.set(s.x, s.y + 0.3, s.z);
      g.add(m, gl);
      this.collar.grp = g; this.collar.glint = gl;
      this.scene.add(g);
    }
  }

  // poste fino perto de (x, z) para grampear um cartaz (devolve o lado de fora, virado para a rua)
  _pole(x, z, r = 10) {
    const ctx = this.ctx;
    let best = null, bd = r;
    for (const it of ctx.collision.near(x, z, r)) {
      if (it.t !== 'circle' || it.r > 0.25 || it.y1 - it.y0 < 2.2 || it.walk) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return null;
    const q = ctx.roads.index.nearest(best.x, best.z);
    let rot = 0;
    if (q.seg) { const s = q.seg, px = s.ax + (s.bx - s.ax) * q.t, pz = s.az + (s.bz - s.az) * q.t; rot = Math.atan2(px - best.x, pz - best.z); }
    return { x: best.x, z: best.z, y: ctx.groundAt(best.x, best.z, 1000), pole: true, rot, r: best.r + 0.01 };
  }

  // calçada perto de (x, z) para um orelhão, com o aparelho virado para a rua
  _sidewalk(x, z) {
    const ctx = this.ctx;
    let best = null, bd = Infinity;
    for (let k = 0; k < 220; k++) {
      const a = k * 2.39996, d = Math.sqrt(k / 220) * 26, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const rc = ctx.roads.index.clearance(px, pz);
      if (!rc.seg || rc.d < 0.7 || rc.d > 2.6) continue;
      if (ctx.zones.insideBuilding(px, pz, 1.0)) continue;
      const y = ctx.groundAt(px, pz, 1000);
      if (ctx.waterDepth(px, pz, y) > 0) continue;
      if (ctx.collision.near(px, pz, 1.4).some(it => !it.walk && it.y1 > y + 0.3 && (it.t === 'circle' ? Math.hypot(px - it.x, pz - it.z) < it.r + 1.0 : Math.abs((px - it.x) * it.c - (pz - it.z) * it.s) < it.hx + 1.0 && Math.abs((px - it.x) * it.s + (pz - it.z) * it.c) < it.hz + 1.0))) continue;
      if (ctx.trees.some(t => Math.hypot(t.x - px, t.z - pz) < 1.8)) continue;
      if (d < bd) { bd = d; best = { x: px, z: pz }; }
    }
    if (!best) return null;
    const q = ctx.roads.index.nearest(best.x, best.z), s = q.seg;
    const px = s.ax + (s.bx - s.ax) * q.t, pz = s.az + (s.bz - s.az) * q.t;
    return { ...best, rot: Math.atan2(px - best.x, pz - best.z) };
  }

  _paperMat() {
    const c = makeCanvas(16, 24), g = c.getContext('2d');
    g.fillStyle = '#d8ccae'; g.fillRect(0, 0, 16, 24);
    g.fillStyle = '#5a4a3a';
    for (let y = 4; y < 22; y += 3) g.fillRect(2, y, 10 + ((y * 7) % 3), 1);
    g.fillStyle = '#b8a888'; g.fillRect(0, 22, 16, 2);
    return ps1Material({ map: canvasTex(c, false), affine: false, side: THREE.DoubleSide });
  }

  // ---------- lendas: liberadas ao ver a criatura de perto ----------
  _typeOf(e) {
    if (e === this.mission.creature) return 'chupa';
    for (const [k, cls] of Object.entries(TYPES)) if (cls && e.constructor === cls) return k;
    return null;
  }

  _legends() {
    const P = this.player.pos;
    for (const e of this.combat.enemies) {
      if (e.removed || !e.pos || (e.dead && e !== this.mission.creature)) continue;
      if (e === this.mission.creature && !e.active) continue;
      if (Math.hypot(e.pos.x - P.x, e.pos.z - P.z) > 28) continue;
      const t = this._typeOf(e);
      if (!t) continue;
      const L = LEGENDS.find(l => l.types.includes(t));
      if (L && !this.state.legends.includes(L.id)) {
        this.state.legends.push(L.id); this.save();
        this.note('LENDAS DO HERVAL: ' + L.name);
      }
    }
  }

  note(text) { this.notes.push({ text, t: 0 }); if (this.notes.length > 3) this.notes.shift(); }

  // ---------- pedidos ----------
  questRows() {
    const q = this.state.quests;
    return [
      { label: 'A gata da Dona Hilda', status: ['procurar a Mimi', 'levar a Mimi até a Dona Hilda', 'entregue'][q.mimi], done: q.mimi === 2 },
      { label: 'O cachorro do Lucas', status: ['procurar o Bóris', 'levar a coleira até o Lucas', 'entregue'][q.boris], done: q.boris === 2 },
    ];
  }

  _quests() {
    const N = this.npcs, q = this.state.quests, night = this.campaign.index > 1;
    const deliver = {
      hilda: q.mimi === 1 && {
        talks: [[
          'Mimi! Minha Mimi! Onde tu tava, coisa ruim?',
          'Na torre da igreja? Lá em cima, com o sino... Ela sempre teve juízo. Lá o bicho não alcança.',
          'Toma. Chá de marcela da minha horta e uma cuca. E não conta pra ninguém que eu chorei.',
        ]],
        done: () => { q.mimi = 2; this.save(); this.campaign.give('cha', 1); this.campaign.give('cuca', 1); this.hud.toast('A MIMI VOLTOU PARA CASA'); },
      },
      lucas: q.boris === 1 && this.inventory.has('coleira') && {
        talks: [[
          'Isso é... é a coleira do Bóris.',
          '...',
          'Eu sabia. Eu sabia desde que ele parou de latir. Arrebentada pra fora, que nem a corrente.',
          'Obrigado por trazer. Pelo menos agora eu sei. Toma, era do meu pai. Ele não ia querer que ficasse parado na gaveta.',
        ]],
        done: () => {
          q.boris = 2; this.save(); this.inventory.take('coleira', 1);
          if (this.inventory.has('shotgun')) this.campaign.give('shells', 8); else this.campaign.give('ammo9', 18);
          this.hud.toast('O LUCAS FICOU COM A COLEIRA');
        },
      },
    };
    for (const id of ['hilda', 'lucas']) {
      const n = N.byId[id], D = deliver[id];
      if (!n) continue;
      // entregue: de dia volta a andar; de noite entra em casa quando o jogador se afasta
      if (!D) {
        if (n._quest && (!night || Math.hypot(n.pos.x - this.player.pos.x, n.pos.z - this.player.pos.z) > 25)) { n._quest = false; if (night) n.hidden = true; n.storyTalks = null; n.onTalkEnd = null; }
        continue;
      }
      // de noite: na porta de casa; de dia: onde estiver andando
      if (night && n.hidden) { const h = this.home[id]; N.stage(id, { x: h.x, z: h.z, h: h.h }); n._quest = true; }
      if (!n.storyTalks && !n.hidden) {
        n._quest = true;
        n.storyTalks = D.talks; n.storyIdx = 0;
        n.onTalkEnd = () => { D.done(); n.storyTalks = null; n.onTalkEnd = null; };
      }
    }
  }

  // ---------- pontos de interação ----------
  _churchOpen() {
    const C = this.campaign, cb = this.combat;
    if (cb.inFight || (cb.boss && !cb.boss.dead) || C.S?.cut || C.S?.narr) return false;
    if (C.index === 1) return !['fight', 'escaped'].includes(this.mission.step);
    const st = C.S?.def.steps[C.S.i]?.id;
    return !(CHURCH_BLOCK[C.S?.def.key] || []).includes(st);
  }

  _points() {
    const pts = [], ctx = this.ctx, C = this.campaign, ch = this.church, inCh = ch && ctx.indoor === ch;
    const ring = this.ring;
    if (!ctx.indoor) {
      for (const D of this.docs) if (!D.p.indoor && D.grp.visible) pts.push({ id: 'doc:' + D.d.id, p: [D.p.x, D.p.y + (D.p.pole ? 1.55 : 0.3), D.p.z], r: 1.6, label: 'LER', run: () => this._readDoc(D) });
      if (ch && this._churchOpen()) {
        const d = this.P.churchDoor, s = this.P.sacristy;
        pts.push({ id: 'igreja', p: [d.x, ctx.groundAt(d.x, d.z, 1000) + 1.3, d.z], r: 2.4, label: 'ENTRAR NA IGREJA', run: () => C.enter('igreja') });
        pts.push({ id: 'sacristia', p: [s.x, ctx.groundAt(s.x, s.z, 1000) + 1.3, s.z], r: 2.0, label: 'ENTRAR NA SACRISTIA', run: () => C.enter('igreja', 'sacristyIn') });
      }
      if (ring && !ring.answered) pts.push({ id: 'fone', p: [ring.phone.x, ring.phone.y + 1.4, ring.phone.z], r: 2.2, label: 'ATENDER', prio: 3, run: () => this._answer() });
      if (this.state.quests.boris === 0 && this.collar) pts.push({ id: 'coleira', p: [this.collar.x, this.collar.y + 0.3, this.collar.z], r: 1.6, label: 'PEGAR', run: () => this._takeCollar() });
    } else if (inCh) {
      const P = ch.points;
      for (const D of this.docs) if (D.p.indoor && D.grp.visible) pts.push({ id: 'doc:' + D.d.id, p: [D.p.x, D.p.y + 0.2, D.p.z], r: 1.5, label: 'LER', run: () => this._readDoc(D) });
      pts.push({ id: 'sino', p: [P.sino.x, P.sino.y + 1.2, P.sino.z], r: 2.4, label: 'TOCAR O SINO', run: () => this._ringBell() });
      const pc = this.perChapter;
      if (!pc.blessed && this.combat.hp < this.combat.maxHp) pts.push({ id: 'agua', p: [P.agua.x, P.agua.y, P.agua.z], r: 1.4, label: 'BENZER-SE', run: () => this._bless() });
      if (this.state.quests.mimi === 0) pts.push({ id: 'mimi', p: [P.mimi.x, P.mimi.y + 0.3, P.mimi.z], r: 1.5, label: 'PEGAR A GATA', run: () => this._takeCat() });
      // no capítulo 1 a missão não cuida das portas de dentro (do 2 em diante, a campanha cuida)
      if (C.index === 1) for (const e of ch.exits) pts.push({ id: 'sair:' + e.label, p: [e.x, this.player.pos.y + 1.2, e.z], r: e.r + 0.4, label: e.label, run: () => C.leave(e.to) });
    }
    return pts;
  }

  _findFocus() {
    this.focus = null;
    const C = this.campaign;
    if (this.npcs.focus || this.combat.pickFocus || (C.index === 1 ? this.mission.focus : C.focus)) return;
    const P = this.player, fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    let bd = Infinity;
    for (const it of this._points()) {
      const ex = it.p[0] - P.pos.x, ez = it.p[2] - P.pos.z, d = Math.hypot(ex, ez);
      if (d > it.r || Math.abs(it.p[1] - 1 - P.pos.y) > 1.8) continue;
      if ((ex * fx + ez * fz) / (d || 1) < -0.2 && d > 1.0) continue;
      // prioridade: o telefone tocando ganha do papel caído do lado
      const score = d - (it.prio || 0);
      if (score < bd) { bd = score; this.focus = it; }
    }
  }

  // F / A / toque: devolve true quando abre um papel ou uma conversa (estado 'extra')
  interactHit(input) {
    const pressed = input.hit('KeyF', 'KeyE') || input.padHit('a') || this.touchHit;
    this.touchHit = false;
    if (!this.focus || !pressed) return false;
    input.eat('a');
    this.focus.run();
    this.focus = null;
    return !!this.modal;
  }

  // ---------- ações ----------
  _readDoc(D) {
    D.grp.visible = false;
    if (!this.state.docs.includes(D.d.id)) { this.state.docs.push(D.d.id); this.save(); }
    GunAudio.pickup(this.audio);
    this.paper.open(D.d);
    this.modal = 'paper';
    const n = this.state.docs.length;
    this.note(`ARQUIVO GUARDADO ${n}/${DOCS.length}`);
    if (n === 1) this.note(this.input.lastDevice === 'pad' ? 'RELEIA NA PAUSA → ARQUIVOS' : this.input.lastDevice === 'touch' ? 'RELEIA EM PAUSA → ARQUIVOS' : 'RELEIA COM A TECLA J');
  }

  // documento achado pela história (o capítulo mostra o texto do jeito dele)
  markDoc(id) {
    const D = this.docs.find(q => q.d.id === id);
    if (D) D.grp.visible = false;
    if (!this.state.docs.includes(id)) { this.state.docs.push(id); this.save(); this.note(`ARQUIVO GUARDADO ${this.state.docs.length}/${DOCS.length}`); }
  }

  _takeCollar() {
    this.state.quests.boris = 1; this.save();
    this.collar.grp.visible = false;
    this.campaign.give('coleira', 1);
    this.paper.open({ kind: 'ACHADO NO MATO', title: 'Coleira vermelha', pages: [['Uma coleira de couro vermelho, arrebentada no meio. Na plaquinha de metal: BÓRIS.', 'O couro está duro de sangue seco. Em volta, no barro, marcas de alguma coisa arrastada mato adentro.', 'O Lucas mora na última casa antes da ponte.']] });
    this.modal = 'paper';
  }

  _takeCat() {
    this.state.quests.mimi = 1; this.save();
    meow(this.audio);
    this.hud.toast('A MIMI ESTÁ COM VOCÊ');
    this.note('LEVE A MIMI PARA A DONA HILDA');
  }

  _ringBell() {
    const a = this.audio;
    this.church.ring();
    for (let i = 0; i < 3; i++) setTimeout(() => a.bell(), i * 1300);
    this.combat.shake = Math.max(this.combat.shake, 0.15);
    const L = this.ctx.landmarks.church;
    this.ctx.scare?.(L.x, L.z, 90, 'bell');
  }

  _bless() {
    this.perChapter.blessed = true;
    const n = Math.round(this.combat.heal(25));
    this.audio.tone(392, 0.4, 'sine', 0.05); setTimeout(() => this.audio.tone(523, 0.6, 'sine', 0.04), 160);
    this.hud.toast(`ÁGUA BENTA  +${n} VIDA`);
  }

  // ---------- orelhões ----------
  // capítulo que usa o orelhão na história: toca até o capítulo mandar parar (o ATENDER é do capítulo)
  forceRing(phone, on = true) { phone.forced = on; phone.burstT = 0; }

  _phones(dt) {
    const C = this.campaign, n = C.index, P = this.player.pos, cb = this.combat;
    for (const p of this.phones) {
      if (!p.forced || this.ctx.indoor) continue;
      p.burstT -= dt;
      const d = Math.hypot(P.x - p.x, P.z - p.z);
      if (p.burstT <= 0) { p.burstT = 3.4; ringBurst(this.audio, clamp(1 - d / 80, 0, 1) ** 1.6 * 0.9); }
      this.atmo.light(p.x, p.y + 2.4, p.z, [0.8, 0.62, 0.36].map(c => c * (Math.sin(performance.now() / 55) > 0 ? 1 : 0.4)), 4, 1);
    }
    if (C.S?.def.phones) return;   // os orelhões são do capítulo: nada de toque solto
    const pc = this.perChapter;
    if (pc.ringT === undefined) pc.ringT = RING_FIRST[0] + Math.random() * (RING_FIRST[1] - RING_FIRST[0]);
    const quiet = !this.ctx.indoor && !cb.inFight && !(cb.boss && !cb.boss.dead) && !C.S?.cut && !C.S?.narr && cb.alive() === 0;
    const R = this.ring;
    if (R) {
      R.t += dt;
      const d = Math.hypot(P.x - R.phone.x, P.z - R.phone.z);
      // toca em rajadas, alto perto e fraco longe
      R.burst -= dt;
      if (!R.answered && R.burst <= 0) { R.burst = 3.4; ringBurst(this.audio, clamp(1 - d / 70, 0, 1) ** 1.6 * 0.9); }
      if (!R.answered) this.atmo.light(R.phone.x, R.phone.y + 2.4, R.phone.z, [0.8, 0.62, 0.36].map(c => c * (Math.sin(R.t * 18) > 0 ? 1 : 0.4)), 4, 1);
      if (R.answered || R.t > RING_LEN || this.ctx.indoor || C.index !== R.chapter) {
        if (!R.answered && R.t > RING_LEN) this.note('O TELEFONE PAROU DE TOCAR');
        this.ring = null;
        pc.ringT = RING_EVERY[0] + Math.random() * (RING_EVERY[1] - RING_EVERY[0]);
      }
      return;
    }
    if (n < 2 || !C.S || C.S.done || !this.atmo.isNight || !quiet || (pc.rings || 0) >= 2) return;
    pc.ringT -= dt;
    if (pc.ringT > 0) return;
    // um orelhão nem perto nem longe demais (dá para ouvir e ir até lá)
    const cands = this.phones.filter(p => { const d = Math.hypot(P.x - p.x, P.z - p.z); return d > 10 && d < 55; });
    if (!cands.length) { pc.ringT = 12; return; }
    const phone = cands[Math.floor(Math.random() * cands.length)];
    this.ring = { phone, t: 0, burst: 0, answered: false, chapter: n };
    pc.rings = (pc.rings || 0) + 1;
  }

  _answer() {
    const R = this.ring;
    if (!R) return;
    R.answered = true;
    this.audio.tone(140, 0.08, 'square', 0.05);
    const key = this.campaign.S?.def.key, call = !this.perChapter.heard && CALLS[key] ? CALLS[key] : CALL_SILENT;
    this.perChapter.heard = true;
    this.dialogue.start('NO TELEFONE: ' + call.who, call.lines, call.voice);
    this.modal = 'talk';
    this.player.aimYaw = null; this.tpc.aimWant = false;
  }

  // ---------- quadro a quadro ----------
  update(dt, state) {
    const C = this.campaign;
    // capítulo novo (ou recomeçado): zera o que é de cada capítulo
    const key = C.index + ':' + (C.S ? C.S.def.n : 'm');
    if (key !== this.chapter || (C.S && C.S !== this._S)) { this.chapter = key; this._S = C.S; this.perChapter = {}; this.ring = null; for (const p of this.phones) p.forced = false; }
    for (const N of this.notes) N.t += dt;
    this.notes = this.notes.filter(N => N.t < 4);
    // tela título e créditos: nada de bandinha nem de bicho na neblina
    if (state === 'title' || state === 'ending') { if (!this._idle) { this._idle = true; this.band.silence(); this.presence.reset(); this.ring = null; } return; }
    this._idle = false;
    if (state !== 'play' && state !== 'extra' && state !== 'talk' && state !== 'read' && state !== 'cutscene') return;
    // peças da igreja que a história mexe
    const ch = this.church;
    if (ch) {
      ch.hide('lamp', !this.inventory.has('lantern'));
      ch.hide('mimi', this.state.quests.mimi === 0);
      // os castiçais saem do altar no capítulo da lua cheia (a prata vira bala)
      const lua = chapterNo('lua');
      let silver = C.index < lua;
      if (C.index === lua && C.S) { const i = C.S.def.steps.findIndex(s => s.id === 'prata'); silver = C.S.i <= i && !this.inventory.has('silverware'); }
      ch.hide('silver', silver);
    }
    // documentos brilhando
    const t = performance.now() / 1000;
    this.docGlint.opacity = 0.65 + 0.35 * Math.sin(t * 3);
    if (this.collar) this.collar.grp.visible = this.state.quests.boris === 0;
    // coleira achada mas fora do inventário (capítulo começado pela seleção): volta para a mão
    if (this.state.quests.boris === 1 && !this.inventory.has('coleira') && !this.inventory.add('coleira', 1)) { this.state.quests.boris = 0; this.save(); }
    this._legends();
    this._quests();
    this.presence.update(dt);
    this.band.update(dt);
    if (state === 'play') { this._phones(dt); this._findFocus(); } else this.focus = null;
  }

  // estado 'extra': papel ou conversa no telefone
  updateModal(dt, input) {
    if (this.modal === 'paper') {
      if (this.paper.update(dt, input) === 'close') { this.modal = null; return 'close'; }
      return null;
    }
    if (this.modal === 'talk') {
      if (this.dialogue.update(dt, input) === 'close') { this.modal = null; this.audio.tone(90, 0.25, 'square', 0.03); return 'close'; }
      return null;
    }
    return 'close';
  }

  drawModal(g, W, H, device) {
    if (this.modal === 'paper') this.paper.draw(g, W, H, device);
    else if (this.modal === 'talk') this.dialogue.draw(g, W, H, device);
  }

  _screen(x, y, z, W, H) {
    const v = this._v.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  }

  drawHud(g, W, H, device) {
    const k = H / 240, touch = device === 'touch';
    // avisos pequenos no alto à direita (no toque, no meio)
    this.notes.forEach((N, i) => {
      const a = Math.min(1, N.t * 3, (4 - N.t) / 0.8);
      drawText(g, N.text, touch ? W / 2 : W - 8 * k, (touch ? 48 : 30) * k + i * 11 * k, 10 * k, { align: touch ? 'center' : 'right', color: '#d8c8a0', alpha: Math.max(0, a) });
    });
    this.chip = null;
    const f = this.focus;
    if (!f) return;
    const s = this._screen(f.p[0], f.p[1] + 0.5, f.p[2], W, H);
    if (!s) return;
    const label = f.label;
    if (touch) {
      const sp = textSprite(label, Math.round(12 * k), FONT_UI, '#140c08', null, true);
      const w = Math.max(56 * k, sp.w + 16 * k), h = 18 * k, x = Math.round(s[0] - w / 2), y = Math.round(s[1] - h - 8 * k);
      g.globalAlpha = 0.85; g.fillStyle = '#f2c879'; g.fillRect(x, y, w, h); g.globalAlpha = 1;
      g.strokeStyle = '#140c08'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      drawText(g, label, x + w / 2, y + 3 * k, 12 * k, { align: 'center', color: '#140c08', shadow: null });
      this.chip = { x, y, w, h };
      return;
    }
    const size = Math.round(10 * k), key = device === 'pad' ? 'A' : 'F';
    const sp = textSprite(label, size, FONT_UI, '#f4ead2', '#140c08', true);
    const kw = 11 * k, w = kw + 4 * k + sp.w + 4 * k, h = 13 * k;
    const x = Math.round(s[0] - w / 2), y = Math.round(s[1] - h - 6 * k);
    panel(g, x, y, w, h, 0.7);
    g.fillStyle = device === 'pad' ? '#3c8a3c' : '#e9dcc0';
    g.fillRect(Math.round(x + 2 * k), Math.round(y + 2 * k), Math.round(kw - 2 * k), Math.round(h - 4 * k));
    drawText(g, key, x + 2 * k + (kw - 2 * k) / 2, y + 1.5 * k, size, { align: 'center', color: device === 'pad' ? '#f4ead2' : '#140c08', shadow: null });
    drawText(g, label, x + kw + 3 * k, y + 1 * k, size, { color: '#f4ead2' });
  }
}

// coleira vermelha caída (o mesmo desenho do item)
function makeCollar() {
  const B = new MeshBuilder(0);
  B.col = [0.62, 0.08, 0.06];
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
    if (i === 5) continue;   // arrebentada
    B.box('carPaint', Math.cos(a0) * 0.12, 0, Math.sin(a0) * 0.12, 0.07, 0.025, 0.035, -a0 - Math.PI / 2 + (a1 - a0) / 2);
  }
  B.col = [0.8, 0.78, 0.7];
  B.box('carPaint', 0.12, 0, 0.01, 0.03, 0.04, 0.05, 0);
  B.col = [1, 1, 1];
  return B.build(M);
}

// toque de telefone antigo: dois tons batendo rápido, num envelope de um segundo
export function ringBurst(audio, vol) {
  if (!audio.ctx || vol <= 0.01) return;
  const c = audio.ctx, t = c.currentTime;
  const g = c.createGain(), am = c.createGain(), lfo = c.createOscillator(), bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
  lfo.type = 'square'; lfo.frequency.value = 22;
  const lg = c.createGain(); lg.gain.value = 0.5; am.gain.value = 0.5;
  lfo.connect(lg).connect(am.gain);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 * vol, t + 0.02);
  g.gain.setValueAtTime(0.03 * vol, t + 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
  for (const f of [1150, 1390]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 1.1); }
  bp.connect(am).connect(g).connect(audio.master);
  lfo.start(t); lfo.stop(t + 1.1);
}

// miado (gata assustada no colo)
export function meow(audio) {
  if (!audio.ctx) return;
  const c = audio.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter();
  o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 2;
  o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.18); o.frequency.exponentialRampToValueAtTime(560, t + 0.6);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  o.connect(bp).connect(g).connect(audio.master); o.start(t); o.stop(t + 0.7);
}

