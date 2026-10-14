import * as THREE from 'three';
import { Dialogue } from '../ui/dialogue.js';
import { drawText, textSprite, panel, FONT_UI, FONT_TITLE } from '../ui/overlay.js';
import { MeshBuilder } from '../engine/builder.js';
import { M } from '../engine/materials.js';
import { FireDog } from './creatures/firedog.js';
import { ChupaCapture } from './creatures/chupacapture.js';
import * as BatM from './creatures/bat.js';
import * as GhostM from './creatures/ghost.js';
import * as EtM from './creatures/et.js';
import * as FeraM from './creatures/fera.js';
import * as WolfM from './creatures/werewolf.js';
import * as WitchM from './creatures/witch.js';
import { build as buildFactory } from '../world/interiors/factory.js';
import { build as buildCrypt } from '../world/interiors/crypt.js';
import { build as buildCave } from '../world/interiors/cave.js';
import { SFX } from './creatures/sfx.js';
import { GunAudio } from './gunAudio.js';
import { ITEMS } from './items.js';
import { CHAPTERS } from './chapters/index.js';

// Campanha: os dez capítulos de Teewald. O capítulo 1 (o chupacabras na tarde de
// neblina) é a missão original (game/mission.js); do 2 em diante, a noite que não
// acaba, com um capítulo por lenda (game/chapters/*.js).
// Daqui saem: objetivo e marca na tela, pontos de interação (ler, pegar, entrar),
// conversas, narração em tela preta, cenas de câmera, ondas de criaturas, criaturas
// soltas pela cidade de noite, pontos de retorno, cartelas e o progresso salvo.

// Progresso salvo no navegador (localStorage):
//   chapter / unlocked / ranks / finished — capítulo onde parou, maior liberado, melhores notas, fim visto
//   inv / melee — inventário e arma branca (o status do jogador)
//   run — onde parou dentro do capítulo: etapa, posição, ponto de retorno, interior, vida,
//         o que já foi feito na etapa (flags e estado próprio do capítulo) e os números da partida
//   totals — criaturas derrotadas, quedas e tempo de jogo somados
const SAVE_KEY = 'teewald.save.v1';
export function loadSave() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
export function writeSave(o) {
  try { o.updated = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
}
export function eraseSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* sem armazenamento */ }
}
const freshSave = () => ({ chapter: 1, unlocked: 1, ranks: {}, totals: { kills: 0, deaths: 0, time: 0 }, run: null });

// tipos de criatura (os arquivos são carregados no começo; faltando um, vira cão de fogo)
export const TYPES = { dog: FireDog, chupa: ChupaCapture };
export async function loadCreatureTypes() {
  const m = { bat: BatM, ghost: GhostM, et: EtM, fera: FeraM, werewolf: WolfM, witch: WitchM };
  Object.assign(TYPES, {
    bat: m.bat.GiantBat, batQueen: m.bat.BatQueen,
    ghost: m.ghost.Ghost, lucia: m.ghost.LuciaGhost, capataz: m.ghost.Capataz,
    et: m.et.ET, etLeader: m.et.ETLeader, Saucer: m.et.Saucer,
    fera: m.fera.Fera, werewolf: m.werewolf.Werewolf, witch: m.witch.Witch,
  });
}

// interiores (fábrica, cripta, gruta): montados no começo, longe da cidade
export async function loadInteriors(interiors) {
  for (const [name, build] of [['fabrica', buildFactory], ['cripta', buildCrypt], ['gruta', buildCave]]) {
    try { interiors.add(name, build); } catch (e) { console.warn('interior não montou:', name, e); }
  }
}

// armas e itens mínimos ao começar cada capítulo pela seleção (o progresso salvo guarda o inventário)
const LOADOUT = [
  null,
  { pistol: 1, ammo9: 36 },
  { pistol: 1, ammo9: 36, cuca: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 12, cuca: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 10, lantern: 1, oil: 1, cuca: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 10, lantern: 1, oil: 1, raygun: 1, cuca: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 10, lantern: 1, oil: 1, raygun: 1, dynamite: 2, cuca: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 10, lantern: 1, oil: 2, raygun: 1, revolver: 1, silver: 6, cuca: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 12, lantern: 1, oil: 1, raygun: 1, revolver: 1, silver: 6, dynamite: 2, cross: 1, cha: 1 },
  { pistol: 1, ammo9: 30, shotgun: 1, shells: 12, lantern: 1, oil: 1, raygun: 1, revolver: 1, silver: 6, dynamite: 2, cross: 1, cha: 1 },
  { pistol: 1, ammo9: 36, shotgun: 1, shells: 14, lantern: 1, oil: 2, raygun: 1, revolver: 1, silver: 12, dynamite: 3, dartgun: 1, darts: 2, cross: 1, cha: 2 },
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Campaign {
  // o: { ctx, scene, audio, input, player, character, tpc, camera, inventory, pistol, targets,
  //      effects, hud, R, npcs, combat, atmo, interiors, mission, fadeTo }
  constructor(o) {
    Object.assign(this, o);
    this.guns = this.pistol;
    this.dialogue = new Dialogue(this.audio);
    this.deps = { ctx: this.ctx, scene: this.scene, effects: this.effects, audio: this.audio, player: this.player, atmo: this.atmo };
    this.index = 1;            // capítulo atual (1 = missão original)
    this.S = null;             // estado do capítulo 2..10
    this.chip = null; this.touchHit = false;
    this._v = v3();
    this.save = { ...freshSave(), ...(loadSave() || {}) };
    this.save.totals ||= { kills: 0, deaths: 0, time: 0 };
    this.saveT = 0; this.saveShow = 0;
    // relâmpagos dentro da fábrica: trovão abafado
    for (const d of Object.values(this.interiors.defs)) if ('onFlash' in d || d.lightning) d.onFlash = k => this.audio.thunder?.(k, true);
    this.combat.onKill = (e) => {
      if (e.static || e.friendly) return;
      this.save.totals.kills++;
      if (this.S) { this.S.stats.kills++; this._drop(e); }
    };
    addEventListener('touchstart', e => {
      const c = this.chip;
      if (!c) return;
      for (const t of e.changedTouches) {
        const [x, y] = this.R.toInternal(t.clientX, t.clientY), pad = 6 * (this.R.H / 240);
        if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) this.touchHit = true;
      }
    }, { passive: true });
    addEventListener('touchend', () => { this._touchHolding = false; }, { passive: true });
  }

  get L() { return this.ctx.landmarks; }
  get chapter() { return this.index; }

  // criatura derrotada às vezes larga alguma coisa (munição das armas que o jogador tem, comida, querosene)
  _drop(e) {
    if (e.static || e.passive || !e.pos || Math.random() > 0.4) return;
    const inv = this.inventory, opts = [['ammo9', 6, 4]];
    if (inv.has('shotgun')) opts.push(['shells', 3, 3]);
    if (inv.has('revolver')) opts.push(['silver', 2, 2]);
    if (inv.has('lantern')) opts.push(['oil', 1, 1]);
    if (inv.has('dartgun')) opts.push(['darts', 1, 1]);
    opts.push(['cuca', 1, 1.5], ['pedra', 2, 1]);
    const tot = opts.reduce((a, o) => a + o[2], 0);
    let r = Math.random() * tot;
    for (const [id, n, w] of opts) {
      if ((r -= w) > 0) continue;
      const y = this.ctx.groundAt(e.pos.x, e.pos.z, e.pos.y + 1) + 0.04;
      this.combat.addPickup(id, e.pos.x, e.pos.z, { n, y, life: 45 });
      break;
    }
  }

  // ---------- começo de capítulo ----------
  // n = 1..10; opts.fromSave retoma o progresso salvo (inventário, vida e a etapa onde parou)
  startChapter(n, opts = {}) {
    const run = opts.fromSave && this.save.run && this.save.run.chapter === n ? this.save.run : null;
    // seguindo direto de um capítulo para o outro, o inventário vai junto
    const carry = opts.carry ? { inv: this.inventory.serialize(), melee: this.combat.melee ? { ...this.combat.melee } : null } : null;
    this._cleanup();
    this.index = n;
    this.combat.reset();
    this.inventory.slots.fill(null); this.inventory.equipped = null;
    const saved = opts.fromSave && this.save.inv && this.save.chapter === n ? this.save : null;
    if (saved || carry) {
      const src = saved || carry;
      this.inventory.load(src.inv);
      if (src.melee) this.combat.setMelee(src.melee.id, src.melee);
      // itens de passagem do capítulo anterior saem; armas e munição mínimas entram
      // (retomando no meio do capítulo, o inventário volta exatamente como estava)
      if (!run) for (const id of ['key', 'medal', 'shoe', 'card', 'silverware', 'crystal']) this.inventory.take(id, 99);
      if (!run) for (const [id, k] of Object.entries(LOADOUT[n] || {})) {
        if (!ITEMS[id]) continue;
        const have = this.inventory.count(id);
        if (!ITEMS[id].stack) { if (!have) this.inventory.add(id, 1, id === 'pistol' ? { mag: 12 } : id === 'shotgun' ? { mag: 2 } : id === 'revolver' ? { mag: 6 } : null); }
        else if (ITEMS[id].kind === 'ammo' && have < Math.ceil(k / 2)) this.inventory.add(id, Math.ceil(k / 2) - have);
      }
      this.inventory.equipped = null;
    } else {
      for (const [id, k] of Object.entries(LOADOUT[n] || LOADOUT[1])) {
        if (!ITEMS[id]) continue;
        this.inventory.add(id, k, id === 'pistol' ? { mag: 12 } : id === 'shotgun' ? { mag: 2 } : id === 'revolver' ? { mag: 6 } : null);
      }
    }
    this.guns.reloadT = 0; this.guns.aim = 0;
    this.player.aimYaw = null; this.tpc.aimWant = false; this.tpc.aim = 0;
    if (n === 1) {
      this._ch1Done = false;
      this.npcs.showAll();
      this.atmo.set('tarde', 0);
      this.mission.reset();
      // a missão 1 retoma depois do begin() (main.js chama begin sem a abertura)
      this._resume1 = run;
      if (!run) this._writeSave(1);
      return { mission: true, resume: !!run };
    }
    // capítulos da noite: o chupacabras da missão 1 some, os moradores ficam em casa
    this.mission.reset();
    this.mission.step = null;
    this.mission.creature.hide();
    this.npcs.hideAll();
    const def = CHAPTERS[n];
    const S = this.S = {
      def, n, t: 0, i: -1, stepT: 0, flags: {}, obj: null, marker: null, points: [], timers: [], groups: [],
      checkpoint: null, ambient: null, cols: [], ambT: 6, waves: [], card: { kind: 'start', t: -0.6 }, cut: null, narr: null,
      stats: { kills: 0, deaths: 0, t0: 0 }, progress: null, done: false,
    };
    this.atmo.set(def.weather || 'noite', 0);
    const st = def.start(this);
    this.player.place(st.x, st.z, st.h ?? 0);
    this.tpc.snap(this.player);
    S.checkpoint = { x: st.x, z: st.z, h: st.h ?? 0 };
    def.setup?.(this, S);
    if (run) { this._resume(S, run); return { mission: false, resume: true }; }
    this._writeSave(n);
    this.next();
    return { mission: false };
  }

  // começo de capítulo: progresso zerado dentro dele
  _writeSave(n) {
    this.save.chapter = n;
    this.save.unlocked = Math.max(this.save.unlocked || 1, n);
    this.save.inv = n > 1 ? this.inventory.serialize() : null;
    this.save.melee = this.combat.melee ? { ...this.combat.melee } : null;
    this.save.run = null;
    writeSave(this.save);
  }

  // volta para a etapa salva: estado do capítulo, interior, posição, vida e números
  _resume(S, R) {
    const def = S.def;
    S.flags = { ...(R.flags || {}) };
    S.stats = { kills: R.stats?.kills || 0, deaths: R.stats?.deaths || 0, t0: 0 };
    S.t = R.stats?.t || 0;
    S.card = null;
    def.loadState?.(this, S, R.custom || {});
    if (R.indoor && this.interiors.defs[R.indoor]) this.interiors.enter(R.indoor);
    const p = R.pos || R.cp;
    if (p) { this.player.place(p.x, p.z, p.h ?? 0); this.tpc.snap(this.player); }
    if (R.cp) S.checkpoint = { ...R.cp };
    // etapas que dependem de algo criado na etapa anterior (um chefe, por exemplo) recomeçam por ela
    let id = R.step;
    const st = def.steps.find(q => q.id === id);
    if (st?.resumeAs) id = st.resumeAs;
    let k = def.steps.findIndex(q => q.id === id);
    if (k < 0) k = 0;
    def.resume?.(this, S, def.steps[k].id);
    S.i = k - 1;
    this.next();
    this.combat.hp = Math.max(30, Math.min(this.combat.maxHp, R.hp ?? this.combat.maxHp));
    this.hud.toast('PROGRESSO CARREGADO');
  }

  // missão 1: depois do begin(), pula para a etapa salva
  _resumeMission(R) {
    const M = this.mission, site = this.ctx.chupa;
    let step = R.step;
    if (step === 'fight') step = 'trail';
    if (['coop', 'trail'].includes(step)) M.setStep(step, false);
    M.card = null;
    let p = R.pos;
    if (R.step === 'fight' && site?.checkpoint) p = { x: site.checkpoint.x, z: site.checkpoint.z, h: site.checkpoint.heading };
    if (p) { this.player.place(p.x, p.z, p.h ?? 0); this.tpc.snap(this.player); }
    this.combat.hp = Math.max(30, Math.min(this.combat.maxHp, R.hp ?? this.combat.maxHp));
    this.hud.toast('PROGRESSO CARREGADO');
  }

  // ---------- salvamento automático ----------
  // grava o status do jogador e onde ele está; why = motivo (só para depuração)
  autosave(why = '', force = false) {
    if (!force && this.saveT < 2) return false;
    const sv = this.save, P = this.player, C = this.combat;
    if (C.dead) return false;
    // posição segura: a atual se não houver perigo; senão, o último ponto de retorno
    const safe = !C.inFight && P.grounded && !(C.boss && !C.boss.dead);
    const here = { x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), h: +P.heading.toFixed(3) };
    sv.inv = this.inventory.serialize();
    sv.melee = C.melee ? { ...C.melee } : null;
    if (this.index === 1) {
      const M = this.mission;
      if (!M.step) return false;
      if (M.step === 'escaped' || M.step === 'done') { sv.chapter = 2; sv.unlocked = Math.max(sv.unlocked || 1, 2); sv.run = null; }
      else {
        sv.chapter = 1;
        sv.run = { chapter: 1, step: M.step, pos: safe ? here : null, hp: Math.round(C.hp) };
      }
    } else {
      const S = this.S;
      if (!S) return false;
      if (S.done) {
        // capítulo terminado: o próximo começa do início
        if (S.n < 10) { sv.chapter = S.n + 1; sv.unlocked = Math.max(sv.unlocked || 1, S.n + 1); }
        sv.run = null;
      } else {
        const st = S.def.steps[Math.max(0, S.i)];
        const flags = {};
        for (const [k, v] of Object.entries(S.flags)) if (['number', 'boolean', 'string'].includes(typeof v)) flags[k] = v;
        sv.chapter = S.n;
        sv.run = {
          chapter: S.n, step: st?.id || null,
          pos: safe ? here : null, cp: S.checkpoint ? { ...S.checkpoint } : null,
          indoor: this.interiors.indoor?.name || null,
          hp: Math.round(C.hp), flags, custom: S.def.saveState?.(this, S) || null,
          stats: { kills: S.stats.kills, deaths: S.stats.deaths, t: Math.round(S.t) },
        };
      }
    }
    this.saveT = 0;
    if (writeSave(sv) && why !== 'quiet') this.saveShow = 1.6;
    return true;
  }

  eraseSave() {
    eraseSave();
    this.save = freshSave();
  }

  // capítulo 1 → interlúdio → capítulo 2 (chamado quando a missão original termina)
  _cleanup() {
    const S = this.S;
    if (S) {
      S.def.cleanup?.(this, S);
      for (const g of S.groups) { this.scene.remove(g); g.traverse?.(o => { if (o.isMesh) o.geometry?.dispose(); }); }
      for (const it of S.cols) { it.y0 = it.y1 = -1e9; it.ramp = null; }
    }
    if (this.interiors.indoor) this.interiors.exit();
    this.combat.clearEnemies(e => e !== this.mission.creature);
    this.combat.clearPickups();
    this.combat.boss = null;
    this.dialogue.open = false;
    this.reading = null;
    this.S = null;
    this.R.bars = 0;
  }

  // ---------- passos ----------
  next() {
    const S = this.S;
    if (!S) return;
    const prev = S.def.steps[S.i];
    prev?.exit?.(this, S);
    S.points = S.points.filter(p => p.keep);
    S.i++; S.stepT = 0;
    const st = S.def.steps[S.i];
    if (!st) return;
    S.obj = st.obj || null;
    S.marker = st.marker || null;
    for (const u of st.use || []) this.use(u.id, u.at, u.r, u.label, u.run, u);
    st.enter?.(this, S);
    if (S.i > 0) { this.ding(); this._saveSoon = 0.6; }
  }

  goto(id) {
    const S = this.S, k = S.def.steps.findIndex(s => s.id === id);
    if (k >= 0) { S.i = k - 1; this.next(); }
  }

  obj(text, marker = undefined) { this.S.obj = text; if (marker !== undefined) this.S.marker = marker; }

  // ponto de interação (F / A / toque): at = [x, y, z] ou função
  use(id, at, r = 2, label = 'EXAMINAR', run = null, o = {}) {
    const S = this.S;
    S.points = S.points.filter(p => p.id !== id);
    S.points.push({ id, at, r, label, run, once: o.once !== false, keep: !!o.keep, hold: o.hold || 0, held: 0, cond: o.cond || null });
  }
  unuse(id) { this.S.points = this.S.points.filter(p => p.id !== id); }

  // ---------- conversa e narração ----------
  // talk([[nome, [falas], voz], ...], depois)
  talk(list, then = null) {
    this.reading = { list: [...list], then };
    const [name, lines, voice] = this.reading.list.shift();
    this.dialogue.start(name, lines, voice || 150);
    this.pendingRead = true;
  }
  say(name, lines, voice, then) { this.talk([[name, lines, voice]], then); }
  get narrating() { return !!this.S?.narr; }

  // tela preta com texto (entre capítulos, cartas, diários)
  narrate(lines, then = null, o = {}) {
    this.S.narr = { lines, i: 0, t: 0, chars: 0, then, title: o.title || null };
    this.pendingCut = true;
  }

  // cena de câmera: cam(t, camera, G) posiciona; dur em s; then ao fim
  cut(o) {
    this.S.cut = { t: 0, dur: o.dur || 3, cam: o.cam, then: o.then, skip: o.skip !== false, bars: o.bars !== false, label: o.label || null };
    this.pendingCut = true;
    this.guns.aiming = false; this.player.aimYaw = null; this.tpc.aimWant = false;
  }

  // câmera olhando de (x,y,z) para (lx,ly,lz) sem atravessar paredes
  camAt(x, y, z, lx, ly, lz) {
    const cam = this.camera;
    let dx = x - lx, dy = y - ly, dz = z - lz;
    const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
    const hit = this.ctx.collision.raycast(lx, ly, lz, dx, dy, dz, d);
    const k = Math.max(0.6, Math.min(d, hit - 0.25));
    const gx = lx + dx * k, gz = lz + dz * k;
    const gy = this.ctx.indoor ? ly + dy * k : Math.max(ly + dy * k, this.ctx.terrain.heightAt(gx, gz) + 0.3);
    cam.position.set(gx, gy, gz);
    cam.lookAt(lx, ly, lz);
  }

  // ---------- criaturas ----------
  spawn(type, x, z, o = {}) {
    const C = TYPES[type] || FireDog;
    // voadores nascem no alto
    if ((type === 'bat' || type === 'batQueen') && o.y == null) o = { ...o, y: this.y(x, z) + (type === 'bat' ? 7 : 12) };
    const e = new C(this.deps, o);
    const P = this.player.pos;
    e.place(x, z, o.h ?? Math.atan2(P.x - x, P.z - z), o.y ?? null);
    if (o.ambient) e.ambient = true;
    this.combat.spawn(e);
    // entrada: cão sai do chão em brasa, fantasma surge da névoa
    const p = e.pos;
    if (type === 'dog') { for (let i = 0; i < 18; i++) this.effects.spawn({ p: v3(p.x, p.y + 0.1, p.z), v: v3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2), life: 0.7, s0: 0.1, s1: 0, color: [1, 0.5, 0.12], drag: 1.5 }); if (o.howl !== false) e.state = 'howl'; }
    if (type === 'ghost') for (let i = 0; i < 12; i++) this.effects.spawn({ p: v3(p.x, p.y + 1, p.z), v: v3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5), life: 0.9, s0: 0.18, s1: 0, color: [0.7, 0.8, 0.95], drag: 1 });
    return e;
  }

  // lugar livre perto de (cx, cz): fora de prédios, água e obstáculos
  freeSpot(cx, cz, r0 = 20, r1 = 32, tries = 24, o = {}) {
    const ctx = this.ctx, b = ctx.playBounds;
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (x < b.x0 + 2 || x > b.x1 - 2 || z < b.z0 + 2 || z > b.z1 - 2) continue;
      if (!ctx.indoor) {
        if (ctx.zones.insideBuilding(x, z, 1)) continue;
        const g = ctx.groundAt(x, z, 1000);
        if (ctx.isDeepWater(x, z, g)) continue;
        if (o.notForest && ctx.zones.isForest(x, z)) continue;
      }
      let ok = true;
      for (const it of ctx.collision.near(x, z, 1.5)) {
        if (it.walk) continue;
        if (it.t === 'circle') { if (Math.hypot(x - it.x, z - it.z) < it.r + 0.8) { ok = false; break; } continue; }
        const dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
        if (Math.abs(lx) < it.hx + 0.8 && Math.abs(lz) < it.hz + 0.8) { ok = false; break; }
      }
      if (ok) return [x, z];
    }
    return null;
  }

  // onda: lista de { type, n, at: {x, z, r0, r1} | null (perto do jogador), o: opções }
  wave(list, onClear = null, o = {}) {
    const S = this.S, P = this.player.pos, members = [];
    for (const w of list) {
      for (let i = 0; i < (w.n || 1); i++) {
        const c = w.at || { x: P.x, z: P.z, r0: 12, r1: 20 };
        const sp = this.freeSpot(c.x, c.z, c.r0 ?? 0, c.r1 ?? 6, 30) || [c.x + (Math.random() - 0.5) * 2, c.z + (Math.random() - 0.5) * 2];
        members.push(this.spawn(w.type, sp[0], sp[1], { ...(w.o || {}) }));
      }
    }
    const wv = { members, onClear, done: false, tag: o.tag };
    S.waves.push(wv);
    return wv;
  }

  // criaturas soltas pela cidade: { types: { dog: 3, ghost: 1 }, max, every: [a, b], r: [r0, r1] }
  ambient(cfg) { if (this.S) { this.S.ambient = cfg; this.S.ambT = cfg ? 4 + Math.random() * 4 : 0; } }

  _ambient(dt) {
    const S = this.S, cfg = S.ambient;
    if (!cfg || this.ctx.indoor || S.cut || S.narr) return;
    const P = this.player.pos;
    // as soltas que ficaram longe somem
    for (const e of this.combat.enemies) if (e.ambient && !e.dead && Math.hypot(e.pos.x - P.x, e.pos.z - P.z) > 80) e.removed = true;
    S.ambT -= dt;
    if (S.ambT > 0) return;
    const [a, b] = cfg.every || [14, 26];
    S.ambT = a + Math.random() * (b - a);
    const alive = this.combat.alive(e => e.ambient);
    if (alive >= (cfg.max ?? 4)) return;
    const types = Object.entries(cfg.types || { dog: 1 }).filter(([t]) => TYPES[t]);
    if (!types.length) return;
    const tot = types.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * tot, type = types[0][0];
    for (const [t, w] of types) { if ((r -= w) <= 0) { type = t; break; } }
    const [r0, r1] = cfg.r || [22, 32];
    const n = type === 'dog' ? 1 + (Math.random() < 0.6 ? 1 : 0) : 1;
    for (let i = 0; i < n; i++) {
      const sp = this.freeSpot(P.x, P.z, r0, r1, 24);
      if (!sp) continue;
      const o = { ambient: true };
      if (type === 'bat') o.y = this.ctx.groundAt(sp[0], sp[1], 1000) + 8;
      this.spawn(type, sp[0], sp[1], o);
    }
  }

  // itens espalhados: list = [[id, n], ...] em lugares livres em volta de (x, z)
  supplies(list, x, z, r = 25, o = {}) {
    const out = [];
    for (const [id, n] of list) {
      const sp = this.freeSpot(x, z, o.r0 ?? 3, r, 30);
      if (!sp) continue;
      out.push(this.combat.addPickup(id, sp[0], sp[1], { n, respawn: o.respawn ?? (ITEMS[id]?.kind === 'ammo' ? 75 : 0) }));
    }
    return out;
  }

  pickup(id, x, z, o = {}) { return this.combat.addPickup(id, x, z, o); }

  boss(e, name = null) { this.combat.boss = e; if (name) e.bossName = name; return e; }

  checkpoint(x, z, h = 0) { this.S.checkpoint = { x, z, h }; this._saveSoon = 0.4; }

  after(secs, fn) { this.S.timers.push({ t: secs, fn }); }

  near(x, z, r) { const P = this.player.pos; return Math.hypot(P.x - x, P.z - z) < r; }

  dist(x, z) { const P = this.player.pos; return Math.hypot(P.x - x, P.z - z); }

  toast(t) { this.hud.toast(t); }

  weather(name, dur = 4) { this.atmo.set(name, dur); }

  give(id, n = 1, data = null) {
    const got = this.inventory.add(id, n, data);
    if (got) GunAudio.pickup(this.audio);
    return got;
  }

  // colisão do capítulo (desligada no fim)
  solid(x, z, hx, hz, rot, y0, y1, o = {}) {
    const it = this.ctx.collision.addBox(x, z, hx, hz, rot, y0, y1, o);
    this.S?.cols.push(it);
    return it;
  }

  solidCircle(x, z, r, y0, y1) {
    const it = this.ctx.collision.addCircle(x, z, r, y0, y1, { cam: true });
    this.S?.cols.push(it);
    return it;
  }

  // objetos de cena do capítulo (somem no fim)
  group(obj) { this.scene.add(obj); this.S.groups.push(obj); return obj; }
  build(fn) {
    const B = new MeshBuilder(0);
    fn(B);
    return this.group(B.build(M));
  }

  ding() { this.audio.tone(660, 0.12, 'triangle', 0.06); setTimeout(() => this.audio.tone(990, 0.22, 'triangle', 0.05), 110); }
  sting() { SFX.sting(this.audio); }
  y(x, z) { return this.ctx.groundAt(x, z, 1000); }

  // entra num interior com passagem em preto
  enter(name, point = null, then = null) {
    this.fadeTo(() => { this.interiors.enter(name, point); this.S?.def.onEnter?.(this, name); then?.(); }, 1.8);
  }
  leave(to = null, preset = null, then = null) {
    this.fadeTo(() => { this.interiors.exit(to, preset || this.S?.def.weather); then?.(); }, 1.8);
  }

  // fim do capítulo: cartela com números e depois o próximo
  complete() {
    const S = this.S;
    if (!S || S.done) return;
    S.done = true;
    S.stats.t1 = S.t;
    S.obj = null; S.marker = null;
    S.card = { kind: 'complete', t: 0 };
    this.ambient(null);
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.audio.tone(f, 0.35, 'triangle', 0.06), i * 140));
    // melhor avaliação do capítulo (aparece na seleção de capítulos)
    const st = S.stats, rank = st.deaths === 0 && st.kills >= 12 ? 'S' : st.deaths === 0 ? 'A' : st.deaths <= 2 ? 'B' : 'C';
    const order = 'SABC', ranks = this.save.ranks ||= {};
    if (!ranks[S.n] || order.indexOf(rank) < order.indexOf(ranks[S.n])) ranks[S.n] = rank;
    if (S.n < 10) this.save.unlocked = Math.max(this.save.unlocked || 1, S.n + 1);
    else this.save.finished = true;
    writeSave(this.save);
    this.autosave('fim', true);
  }

  // ---------- respostas do main.js (mesma interface da missão 1) ----------
  begin() {
    if (this.index !== 1) return;
    this.mission.begin();
    if (this._resume1) { this._resumeMission(this._resume1); this._resume1 = null; }
  }
  reset() { if (this.index === 1) this.mission.reset(); }

  get marker() {
    if (this.index === 1) return this.mission.marker;
    const S = this.S;
    if (!S || !S.marker) return null;
    const m = typeof S.marker === 'function' ? S.marker(this) : S.marker;
    if (!m) return null;
    return Array.isArray(m) ? { x: m[0], y: m[1] ?? this.y(m[0], m[2]) + 1.5, z: m[2] } : m;
  }

  _findFocus() {
    const S = this.S;
    this.focus = null;
    if (!S || this.npcs.focus || this.combat.pickFocus) return;
    const P = this.player, fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    let bd = Infinity;
    const pts = [...S.points];
    // saída do interior
    const ex = this.interiors.nearExit();
    if (ex) pts.push({ id: '__exit', at: [ex.x, P.pos.y + 1.2, ex.z], r: (ex.r || 1.6) + 0.5, label: ex.label || 'SAIR', run: () => this._exitInterior(ex) });
    for (const it of pts) {
      if (it.cond && !it.cond(this)) continue;
      const p = typeof it.at === 'function' ? it.at(this) : it.at;
      if (!p) continue;
      const ex2 = p[0] - P.pos.x, ez = p[2] - P.pos.z, d = Math.hypot(ex2, ez);
      if (d > it.r || Math.abs(p[1] - 1 - P.pos.y) > 2.5) continue;
      if ((ex2 * fx + ez * fz) / (d || 1) < -0.2 && d > 1.2) continue;
      if (d < bd) { bd = d; this.focus = { ...it, p }; }
    }
  }

  _exitInterior(ex) {
    const S = this.S, d = S?.def;
    const to = d?.exitTo?.(this, this.interiors.indoor?.name) || null;
    this.leave(to, null, () => d?.onExit?.(this, S));
  }

  interactHit(input) {
    if (this.index === 1) return this.mission.interactHit(input);
    const f = this.focus;
    const pressed = input.hit('KeyF', 'KeyE') || input.padHit('a') || this.touchHit;
    this.touchHit = false;
    if (!f) return false;
    if (f.hold) {
      // segurar (acender vela, tocar o sino...)
      const held = input.down('KeyF', 'KeyE') || input.padHeld.has('a') || (input.lastDevice === 'touch' && this._touchHolding);
      if (pressed) this._touchHolding = input.lastDevice === 'touch';
      if (held || this._touchHolding) {
        const it = this.S.points.find(p => p.id === f.id);
        if (it) {
          it.held += this.lastDt || 0.016;
          this.S.progress = { label: f.label, f: it.held / it.hold };
          if (it.held >= it.hold) { it.held = 0; this.S.progress = null; this._touchHolding = false; this._runPoint(it); }
        }
      } else { const it = this.S.points.find(p => p.id === f.id); if (it) it.held = Math.max(0, it.held - 0.05); this.S.progress = null; }
      input.eat('a');
      return false;
    }
    if (!pressed) return false;
    input.eat('a');
    const it = this.S.points.find(p => p.id === f.id) || f;
    this._runPoint(it);
    return false;
  }

  _runPoint(it) {
    if (it.once && it.id !== '__exit') this.unuse(it.id);
    it.run?.(this, it);
  }

  startRead() { if (this.index === 1) this.mission.startRead(); }

  updateRead(dt, input) {
    if (this.index === 1) return this.mission.updateRead(dt, input);
    if (this.dialogue.update(dt, input) !== 'close') return null;
    const R = this.reading;
    if (R && R.list.length) {
      const [name, lines, voice] = R.list.shift();
      this.dialogue.start(name, lines, voice || 150);
      return null;
    }
    this.reading = null;
    R?.then?.(this);
    return 'close';
  }

  drawRead(g, W, H, device) {
    if (this.index === 1) return this.mission.drawRead(g, W, H, device);
    this.dialogue.draw(g, W, H, device);
  }

  afterPlayer(dt) { if (this.index === 1) this.mission.afterPlayer(dt); }
  afterCamera() { if (this.index === 1) this.mission.afterCamera(); }

  respawn() {
    if (this.index === 1) { this.mission.respawn(); return; }
    const S = this.S, cp = S.checkpoint;
    this.combat.revive();
    this.character.root.rotation.x = 0;
    S.dying = 0;
    S.stats.deaths++;
    // as criaturas soltas e as das ondas vão embora; o capítulo remonta o encontro
    this.combat.clearEnemies(e => e.ambient);
    if (this.combat.projectiles) this.combat.projectiles.length = 0;
    this.player.place(cp.x, cp.z, cp.h ?? 0);
    this.tpc.snap(this.player);
    S.def.steps[S.i]?.onRespawn?.(this, S);
    S.def.onRespawn?.(this, S);
    // munição mínima para não ficar sem saída
    for (const [id, min] of [['ammo9', 24], ['shells', 6], ['silver', 6], ['oil', 1]]) {
      const gun = ITEMS[id].for;
      if (this.inventory.find(gun) && this.inventory.count(id) < min) this.inventory.add(id, min - this.inventory.count(id));
    }
    this.hud.toast('VOCÊ CAIU...');
    this.save.totals.deaths++;
    this.autosave('queda', true);
  }

  // ---------- quadro a quadro ----------
  // devolve 'cutscene' | 'read' | 'dead' | 'play' quando o jogo deve trocar de estado
  update(dt, state) {
    this.lastDt = dt;
    this.saveT += dt;
    this.saveShow = Math.max(0, this.saveShow - dt);
    if (state === 'play' || state === 'read' || state === 'cutscene') this.save.totals.time += dt;
    if (state === 'play') {
      if (this._saveSoon !== undefined) { this._saveSoon -= dt; if (this._saveSoon <= 0) { this._saveSoon = undefined; this.autosave('etapa', true); } }
      else if (this.saveT > 20) this.autosave('relógio');
    }
    if (this.index === 1) {
      if (this.mission.step && this.mission.step !== this._lastStep1) { this._lastStep1 = this.mission.step; this._saveSoon = 0.6; }
      const ev = this.mission.update(dt, state);
      // fim da missão 1: interlúdio e a primeira noite
      if (this.mission.step === 'done' && !this._ch1Done && this.mission.card?.kind === 'complete' && this.mission.card.t > 3.2) {
        this._ch1Done = true;
        this.save.unlocked = Math.max(this.save.unlocked || 1, 2); writeSave(this.save);
        this.fadeTo(() => { this.startChapter(2, { carry: true }); this._interlude = true; }, 0.6);
      }
      return ev;
    }
    const S = this.S;
    if (!S || state === 'title') return null;
    S.t += dt; S.stepT += dt;
    if (S.card) { S.card.t += dt; if (S.card.t > (S.card.kind === 'complete' ? 4.5 : 6)) { const k = S.card.kind; S.card = null; if (k === 'complete') this._nextChapter(); } }
    if (this._interlude) { this._interlude = false; this._interludeNarration(); }
    if (state === 'cutscene') return this._cutscene(dt);
    if (state === 'dying') {
      S.dying = (S.dying || 0) + dt;
      const k = clamp(S.dying / 0.7, 0, 1);
      this.character.root.rotation.x = -k * k * 1.45;
      return null;
    }
    if (state !== 'play') return null;
    // timers e ondas
    for (let i = S.timers.length - 1; i >= 0; i--) { const tm = S.timers[i]; tm.t -= dt; if (tm.t <= 0) { S.timers.splice(i, 1); tm.fn(this); } }
    for (const w of S.waves) if (!w.done && w.members.every(e => e.dead || e.removed)) { w.done = true; w.onClear?.(this); }
    S.waves = S.waves.filter(w => !w.done);
    this._ambient(dt);
    const st = S.def.steps[S.i];
    if (st && !S.done) { const r = st.update?.(this, dt, S); if (r === true) this.next(); }
    S.def.tick?.(this, dt, S);
    this._findFocus();
    if (!this.focus) S.progress = S.progress && S.progress.keep ? S.progress : null;
    if (this.combat.dead) { S.dying = 0.0001; return 'dead'; }
    if (this.pendingCut) { this.pendingCut = false; return 'cutscene'; }
    if (this.pendingRead) { this.pendingRead = false; return 'read'; }
    return null;
  }

  _nextChapter() {
    const S = this.S;
    if (!S) return;
    if (S.n >= 10) { this.fadeTo(() => this.onEnding?.(), 0.5); return; }
    this.fadeTo(() => { this.startChapter(S.n + 1, { carry: true }); }, 0.6);
  }

  // texto entre o capítulo 1 e o 2
  _interludeNarration() {
    this.narrate([
      'O rastro de sangue entrava fundo na mata, além da clareira.',
      'Terminava numa pedra coberta de musgo, com uma cruz de ferro arrancada do lugar.',
      'Ninguém em Teewald lembrava daquele túmulo. O sangue do bicho escorreu pela pedra... e a terra bebeu.',
      'Naquela tarde o sol se pôs atrás do morro. E não nasceu mais.',
    ], null, { title: 'A NOITE QUE NÃO TERMINA' });
  }

  _cutscene(dt) {
    const S = this.S;
    if (S.narr) {
      const N = S.narr;
      N.t += dt;
      const total = N.lines[N.i].length;
      N.chars = Math.min(total, N.chars + dt * 34);
      const adv = N.t > 0.4 && (this.input.confirm() || this.input.mouse.clicked || this.input.hit('KeyF') || this.input.padHit('a'));
      this.R.bars = 0;
      if (this.input.pause()) { S.narr = null; N.then?.(this); return S.cut ? null : 'play'; }
      if (adv) {
        if (N.chars < total) N.chars = total;
        else if (N.i < N.lines.length - 1) { N.i++; N.chars = 0; N.t = 0; this.audio.menuMove(); }
        else { S.narr = null; N.then?.(this); return S.cut || this.pendingCut ? (this.pendingCut = false, null) : 'play'; }
      }
      return null;
    }
    const c = S.cut;
    if (!c) return 'play';
    c.t += dt;
    c.cam?.(c.t, this.camera, this);
    this.combat.afterCamera();
    if (c.bars) this.R.bars = 0.12 * Math.min(1, c.t / 0.4, Math.max(0, (c.dur - c.t) / 0.4));
    const skip = c.skip && c.t > 1 && (this.input.confirm() || this.input.mouse.clicked || this.input.pause());
    if (c.t > c.dur || skip) {
      S.cut = null; this.R.bars = 0;
      this.tpc.snap(this.player);
      c.then?.(this);
      if (S.narr) return null;
      if (this.pendingCut) { this.pendingCut = false; return null; }
      if (this.pendingRead) { this.pendingRead = false; return 'read'; }
      return 'play';
    }
    return null;
  }

  _screen(x, y, z, W, H) {
    const v = this._v.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1];
  }

  // ---------- tela ----------
  // ícone de disquete e "PROGRESSO SALVO" (some sozinho)
  _drawSaved(g, W, H, device) {
    if (this.saveShow <= 0) return;
    const k = H / 240, a = Math.min(1, this.saveShow / 0.4), touch = device === 'touch';
    const x = touch ? W / 2 + 34 * k : W - 8 * k, y = touch ? H - 30 * k : (this.input.locked ? 6 : 18) * k;
    const s = drawText(g, 'PROGRESSO SALVO', x, y, 9 * k, { align: touch ? 'center' : 'right', alpha: a, color: '#c8b898' });
    const ix = Math.round((touch ? x - s.w / 2 : x - s.w) - 10 * k), iy = Math.round(y + 1 * k), d = Math.round(7 * k);
    g.globalAlpha = a; g.fillStyle = '#c8b898'; g.fillRect(ix, iy, d, d);
    g.fillStyle = '#140c08'; g.fillRect(ix + Math.round(d * 0.25), iy, Math.round(d * 0.5), Math.round(d * 0.35)); g.fillRect(ix + Math.round(d * 0.2), iy + Math.round(d * 0.6), Math.round(d * 0.6), Math.round(d * 0.3));
    g.globalAlpha = 1;
  }

  drawHud(g, W, H, device) {
    this._drawSaved(g, W, H, device);
    if (this.index === 1) { this.mission.drawHud(g, W, H, device); return; }
    const S = this.S;
    if (!S) return;
    const k = H / 240, touch = device === 'touch';
    const bossOn = !!this.combat.boss && !this.combat.boss.dead;
    // objetivo
    const obj = S.obj;
    if (obj && !(touch && bossOn) && !(S.card && S.card.t > -0.5)) {
      const blink = S.stepT < 2 && Math.floor(S.stepT * 4) % 2 === 0;
      const col = blink ? '#ffe7a0' : '#f4ead2';
      if (touch) drawText(g, obj, W / 2, 34 * k, 10 * k, { align: 'center', color: col });
      else {
        const size = Math.round(11 * k), maxW = 118 * k, lines = [];
        let line = '';
        for (const w of obj.split(' ')) {
          const t = line ? line + ' ' + w : w;
          if (line && textSprite(t, size, FONT_UI, col).w > maxW) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const tw = Math.max(...lines.map(l => textSprite(l, size, FONT_UI, col).w));
        const y0 = (this.guns.equipped ? 46 : this.hud.card ? 34 : 6) * k;
        panel(g, 6 * k, y0, tw + 12 * k, (15 + lines.length * 10) * k, 0.55);
        drawText(g, 'OBJETIVO', 11 * k, y0 + 1 * k, 9 * k, { color: '#f2c879' });
        lines.forEach((l, i) => drawText(g, l, 11 * k, y0 + (10 + i * 10) * k, size, { color: col }));
      }
    }
    // marca
    const m = this.marker;
    if (m) {
      const s = this._screen(m.x, m.y, m.z, W, H);
      const d = Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z);
      if (s && s[2] && d > 3) {
        const x = Math.round(s[0]), y = Math.round(s[1] + Math.sin(S.t * 3) * 2 * k), r = Math.round(4 * k);
        g.fillStyle = '#140c08';
        g.beginPath(); g.moveTo(x, y - r - 1); g.lineTo(x + r + 1, y); g.lineTo(x, y + r + 1); g.lineTo(x - r - 1, y); g.closePath(); g.fill();
        g.fillStyle = '#f2c879';
        g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
        drawText(g, Math.round(d) + ' m', x, y + r + 2 * k, 9 * k, { align: 'center', color: '#f4ead2' });
      }
    }
    // barra de progresso (segurar o botão, sino tocando...)
    if (S.progress) {
      const bw = Math.round(120 * k), bh = Math.max(3, Math.round(5 * k)), bx = Math.round(W / 2 - bw / 2), by = Math.round(H * 0.68);
      drawText(g, S.progress.label, W / 2, by - 12 * k, 10 * k, { align: 'center', color: '#f2e6c8' });
      g.fillStyle = '#140c08'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      g.fillStyle = '#2a2018'; g.fillRect(bx, by, bw, bh);
      g.fillStyle = '#f2c879'; g.fillRect(bx, by, Math.round(bw * clamp(S.progress.f, 0, 1)), bh);
    }
    // botão de interação
    this.chip = null;
    if (this.focus) {
      const f = this.focus, s = this._screen(f.p[0], f.p[1] + 0.5, f.p[2], W, H);
      if (s) {
        const label = f.label, size = Math.round(10 * k);
        if (touch) {
          const sp = textSprite(label, Math.round(12 * k), FONT_UI, '#140c08', null, true);
          const w = Math.max(56 * k, sp.w + 16 * k), h = 18 * k, x = Math.round(s[0] - w / 2), y = Math.round(s[1] - h - 8 * k);
          g.globalAlpha = 0.85; g.fillStyle = '#f2c879'; g.fillRect(x, y, w, h); g.globalAlpha = 1;
          g.strokeStyle = '#140c08'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
          drawText(g, label, x + w / 2, y + 3 * k, 12 * k, { align: 'center', color: '#140c08', shadow: null });
          this.chip = { x, y, w, h };
        } else {
          const key = device === 'pad' ? 'A' : 'F';
          const txt = f.hold ? label + ' (SEGURE)' : label;
          const sp = textSprite(txt, size, FONT_UI, '#f4ead2', '#140c08', true);
          const kw = 11 * k, w = kw + 4 * k + sp.w + 4 * k, h = 13 * k;
          const x = Math.round(s[0] - w / 2), y = Math.round(s[1] - h - 6 * k);
          panel(g, x, y, w, h, 0.7);
          g.fillStyle = device === 'pad' ? '#3c8a3c' : '#e9dcc0';
          g.fillRect(Math.round(x + 2 * k), Math.round(y + 2 * k), Math.round(kw - 2 * k), Math.round(h - 4 * k));
          drawText(g, key, x + 2 * k + (kw - 2 * k) / 2, y + 1.5 * k, size, { align: 'center', color: device === 'pad' ? '#f4ead2' : '#140c08', shadow: null });
          drawText(g, txt, x + kw + 3 * k, y + 1 * k, size, { color: '#f4ead2' });
        }
      }
    }
    S.def.drawHud?.(this, g, W, H, k, S);
    this._drawCard(g, W, H, k);
  }

  _drawCard(g, W, H, k) {
    const S = this.S, c = S.card;
    if (!c || c.t < 0) return;
    const dur = c.kind === 'complete' ? 4.5 : 6;
    const a = Math.min(1, c.t / 0.8, Math.max(0, (dur - c.t) / 1));
    if (a <= 0) return;
    const y = H * 0.3;
    g.globalAlpha = a * 0.5; g.fillStyle = '#0d0907'; g.fillRect(0, Math.round(y - 22 * k), W, Math.round(78 * k)); g.globalAlpha = 1;
    const def = S.def;
    if (c.kind === 'start') {
      drawText(g, 'CAPÍTULO ' + S.n, W / 2, y - 16 * k, 11 * k, { align: 'center', alpha: a, color: '#f2c879' });
      drawText(g, def.title, W / 2, y - 4 * k, 26 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#efe2c4', shadow: '#2a0806' });
      drawText(g, def.sub || '', W / 2, y + 34 * k, 11 * k, { align: 'center', alpha: a, color: '#d8c8a8' });
    } else {
      const st = S.stats, secs = Math.max(0, Math.round((st.t1 ?? S.t) - st.t0));
      drawText(g, 'CAPÍTULO ' + S.n + ' CONCLUÍDO', W / 2, y - 16 * k, 11 * k, { align: 'center', alpha: a, color: '#f2c879' });
      drawText(g, def.title, W / 2, y - 4 * k, 26 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#efe2c4', shadow: '#2a0806' });
      const rank = st.deaths === 0 && st.kills >= 12 ? 'S' : st.deaths === 0 ? 'A' : st.deaths <= 2 ? 'B' : 'C';
      drawText(g, `CRIATURAS ${st.kills}   QUEDAS ${st.deaths}   TEMPO ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}   AVALIAÇÃO ${rank}`, W / 2, y + 34 * k, 10 * k, { align: 'center', alpha: a, color: '#d8c8a8' });
      if (S.n >= 10) drawText(g, 'FIM', W / 2, y + 46 * k, 10 * k, { align: 'center', alpha: a, color: '#c86848' });
    }
  }

  drawCutscene(g, W, H) {
    if (this.index === 1) return this.mission.drawCutscene(g, W, H);
    const S = this.S;
    if (!S) return;
    if (S.narr) {
      const N = S.narr, k = H / 240;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (N.title) drawText(g, N.title, W / 2, H * 0.2, 14 * k, { align: 'center', color: '#c86848' });
      // texto quebrado em linhas, letra a letra
      const size = Math.round(13 * k), maxW = Math.min(W - 40 * k, 300 * k), words = N.lines[N.i].slice(0, Math.floor(N.chars)).split(' ');
      const rows = [];
      let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w; if (line && textSprite(t, size, FONT_UI).w > maxW) { rows.push(line); line = w; } else line = t; }
      rows.push(line);
      const y0 = H * 0.42 - rows.length * 7 * k;
      rows.forEach((r, i) => drawText(g, r, W / 2, y0 + i * 15 * k, size, { align: 'center', color: '#e6dccb' }));
      if (N.chars >= N.lines[N.i].length && Math.floor(N.t * 2.5) % 2 === 0) drawText(g, '▼', W / 2, H * 0.78, 10 * k, { align: 'center', color: '#8a2a20' });
      return;
    }
    const c = S.cut;
    if (c?.label && c.t > 0.8) {
      const k = H / 240, a = Math.min(1, (c.t - 0.8) / 0.4, Math.max(0, (c.dur - 0.2 - c.t) / 0.4));
      drawText(g, c.label, W / 2, H - 26 * k, 20 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#e8d8c0', shadow: '#3a0606' });
    }
  }

  drawDying(g, W, H) {
    if (this.index === 1) return this.mission.drawDying(g, W, H);
    const S = this.S, k = H / 240, a = clamp((S?.dying || 0) / 0.6, 0, 1);
    g.globalAlpha = a * 0.35; g.fillStyle = '#5a0404'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    drawText(g, S?.def.deathText || 'A NOITE TE ENGOLIU', W / 2, H * 0.42, 16 * k, { align: 'center', alpha: a, color: '#f0d0c0', shadow: '#2a0202' });
  }
}
