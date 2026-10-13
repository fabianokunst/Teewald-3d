import * as THREE from 'three';
import { Dialogue } from '../ui/dialogue.js';
import { drawText, textSprite, panel, FONT_UI, FONT_TITLE } from '../ui/overlay.js';
import { Chupacabra, ChupaAudio, CHUPA_HP, makeSheep } from './chupacabra.js';
import { PISTOL_MAG } from './items.js';

// Missão 1: O Chupacabras. Cartaz de PROCURA-SE na praça -> galinheiro atacado perto
// da Igreja Matriz -> pegadas mata adentro -> o bicho comendo uma ovelha na clareira.
// Na luta ele dá botes (o jogador tem vida); ferido, foge e a missão termina com o
// gancho do jogo: pegar o chupacabras. Morrendo, volta para a trilha antes da clareira.

const OBJ = {
  poster: 'Leia o cartaz na Praça 10 de Abril',
  coop: 'Investigue o galinheiro perto da Igreja Matriz',
  trail: 'Siga as pegadas mata adentro',
  fight: 'Enfrente o chupacabras',
  back: 'Volte para a clareira',
  escaped: 'O chupacabras fugiu ferido...',
  done: 'Pegue o chupacabras  (continua)',
};

const TEXTS = {
  board: ['CARTAZ', [
    'PROCURA-SE: CHUPACABRAS!',
    'Nas últimas noites, galinhas, patos e até ovelhas apareceram mortos em Teewald. Todos com dois furos no pescoço e sem uma gota de sangue.',
    'Último ataque: um galinheiro perto da Igreja Matriz, na beira da mata.',
    'Não ande sozinho perto do mato. Quem souber de alguma coisa, procure a Prefeitura. Paga-se recompensa.',
  ], 150],
  coop: ['GALINHEIRO', [
    'A tela do cercado foi arrancada de fora para dentro.',
    'Cinco galinhas mortas. Cada uma com dois furinhos no pescoço... e nem uma gota de sangue.',
    'No barro, pegadas de três dedos com garras, sempre em pares. Esse bicho anda aos pulos.',
    'O rastro entra na mata.',
  ], 150],
  end: ['VOCÊ', [
    'Acertei ele... mas o bicho fugiu pra dentro da mata.',
    'O rastro de sangue some no meio das araucárias.',
    'Agora eu sei que ele existe, e que está ferido. Isso ainda não acabou.',
  ], 165],
};

const MAX_HP = 100;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Mission {
  // o: { ctx, scene, audio, input, player, character, tpc, camera, inventory, pistol, targets, effects, hud, R, npcs }
  constructor(o) {
    Object.assign(this, o);   // inclui combat (vida do jogador, golpes)
    this.site = this.ctx.chupa;
    this.dialogue = new Dialogue(this.audio);
    this.creature = new Chupacabra({ ctx: this.ctx, scene: this.scene, effects: this.effects, audio: this.audio, player: this.player });
    this.creature.onHit = () => { this.stats.hits++; };
    this.combat.spawn(this.creature);
    // a presa na clareira
    if (this.site) {
      const s = this.site.sheep, sheep = makeSheep();
      sheep.position.set(s.x, this.ctx.groundAt(s.x, s.z, 1000) - 0.06, s.z);
      sheep.rotation.y = s.rot;
      this.scene.add(sheep);
    }
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    this.touchHit = false; this.chip = null;
    // toque no botão EXAMINAR / LER
    addEventListener('touchstart', e => {
      const c = this.chip;
      if (!c) return;
      for (const t of e.changedTouches) {
        const [x, y] = this.R.toInternal(t.clientX, t.clientY), pad = 6 * (this.R.H / 240);
        if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) this.touchHit = true;
      }
    }, { passive: true });
    this.reset();
  }

  reset() {
    this.step = null; this.t = 0; this.stepT = 0;
    this.card = null; this.cut = null; this.dying = 0; this.escT = 0; this.teased = false;
    this.focus = null; this.reading = null; this.far = false;
    this.trailI = 0; this.lastRecoil = 0; this.prevPos = null; this.pvel = { x: 0, z: 0 };
    this.stats = { shots: 0, hits: 0, t0: 0, t1: 0, deaths: 0 };
    this.creature.hide(); this.creature.clearBlood();
    this.character.root.rotation.x = 0;
    if (!this.combat.enemies.has(this.creature)) this.combat.spawn(this.creature);
  }

  // depois da abertura: cartela da missão e o bicho já na clareira
  begin() {
    if (!this.site) return;
    this.reset();
    this.setStep('poster', false);
    this.card = { kind: 'mission', t: -1.2 };
    const f = this.site.feed;
    this.creature.spawnFeeding(f.x, f.z, f.heading);
    // um pedaço de pau e pedras perto do galinheiro, e munição pelo caminho
    const c = this.site.coop, tr = this.site.trail, cp = this.site.checkpoint;
    this.combat.addPickup('pau', c.x - 2.5, c.z + 3.2);
    this.combat.addPickup('pedra', c.x + 2.8, c.z + 3.5, { n: 3 });
    const mid = tr[Math.floor(tr.length * 0.6)];
    this.combat.addPickup('ammo9', mid[0] + 1.2, mid[1] + 0.8, { n: 12 });
    this.combat.addPickup('cuca', cp.x + 1, cp.z + 1);
    this._sting();
  }

  setStep(s, ding = true) {
    this.step = s; this.stepT = 0;
    if (ding) { this.audio.tone(660, 0.12, 'triangle', 0.06); setTimeout(() => this.audio.tone(990, 0.22, 'triangle', 0.05), 110); }
  }

  get objective() { return this.step === 'fight' && this.far ? OBJ.back : OBJ[this.step] || null; }

  // ---------- interação (F / A / toque) ----------
  _points() {
    const S = this.site, out = [];
    if (S.board) out.push({ id: 'board', p: S.board.look, r: 2.6, label: 'LER' });
    if (this.step === 'poster' || this.step === 'coop' || this.step === 'trail') out.push({ id: 'coop', p: S.coop.look, r: 3.3, label: 'EXAMINAR' });
    return out;
  }

  _findFocus() {
    this.focus = null;
    if (!this.step || this.step === 'fight' || this.npcs?.focus) return;
    const P = this.player, fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    let bd = Infinity;
    for (const it of this._points()) {
      const ex = it.p[0] - P.pos.x, ez = it.p[2] - P.pos.z, d = Math.hypot(ex, ez);
      if (d > it.r || Math.abs(it.p[1] - 1 - P.pos.y) > 2) continue;
      if ((ex * fx + ez * fz) / (d || 1) < -0.2 && d > 1.2) continue;
      if (d < bd) { bd = d; this.focus = it; }
    }
  }

  interactHit(input) {
    const hit = !!this.focus && (input.hit('KeyF', 'KeyE') || input.padHit('a') || this.touchHit);
    this.touchHit = false;
    return hit;
  }

  startRead(id = this.focus?.id) {
    const [name, lines, voice] = TEXTS[id];
    this.reading = id;
    this.dialogue.start(name, lines, voice);
    this.player.aimYaw = null; this.tpc.aimWant = false;
    if (id !== 'end') this.audio.menuOk();
  }

  // devolve 'close' quando a leitura termina
  updateRead(dt, input) {
    const id = this.reading, P = this.player;
    const it = this._points().find(p => p.id === id);
    if (it) P.heading += wrapA(Math.atan2(it.p[0] - P.pos.x, it.p[2] - P.pos.z) - P.heading) * Math.min(1, dt * 6);
    if (this.dialogue.update(dt, input) !== 'close') return null;
    this.reading = null;
    if (id === 'board' && this.step === 'poster') this.setStep('coop');
    else if (id === 'coop' && (this.step === 'poster' || this.step === 'coop')) this.setStep('trail');
    else if (id === 'end') this._complete();
    return 'close';
  }

  // ---------- luta ----------
  _startFight() {
    const C = this.creature, P = this.player;
    this.cut = null;
    this.R.bars = 0;
    this.setStep('fight', false);
    C.fight();
    // arma na mão
    if (!this.inventory.find('pistol')) this.inventory.add('pistol', 1, { mag: PISTOL_MAG });
    if (!this.pistol.equipped) { this.pistol.equip(true); this.pistol.teach(); }
    this._ammoAtLeast(24);
    P.heading = Math.atan2(C.pos.x - P.pos.x, C.pos.z - P.pos.z);
    P.sync();
    this.tpc.snap(P);
    this.stats.t0 = this.t; this.stats.shots = 0; this.stats.hits = 0;
  }

  _ammoAtLeast(n) {
    const have = this.pistol.mag + this.inventory.count('ammo9');
    if (have < n) this.inventory.add('ammo9', n - have);
  }

  // a vida do jogador é do sistema de combate
  get hp() { return this.combat.hp; }
  get shake() { return this.combat.shake; }
  set shake(v) { this.combat.shake = Math.max(this.combat.shake, v); }

  _hitPlayer(dmg, dx, dz) {
    if (this.combat.hurt(dmg, dx, dz)) ChupaAudio.claw(this.audio);
  }

  // empurrão e tremor ficam no combate
  afterPlayer() {}
  afterCamera() {}

  // caiu: volta na trilha antes da clareira, com vida cheia
  respawn() {
    const cp = this.site.checkpoint, C = this.creature, cl = this.site.clearing;
    this.character.root.rotation.x = 0;
    this.combat.revive(); this.dying = 0;
    this.player.place(cp.x, cp.z, cp.heading);
    this.tpc.snap(this.player);
    this._ammoAtLeast(30);
    if (!this.pistol.equipped) this.pistol.equip(true);
    // o bicho volta para o outro lado da clareira
    const a = Math.atan2(cl.x - cp.x, cl.z - cp.z);
    C.spawnFight(cl.x + Math.sin(a) * 6, cl.z + Math.cos(a) * 6, a + Math.PI);
    this.setStep('fight', false);
    this.hud.toast('VOCÊ CAIU...');
  }

  _complete() {
    this.setStep('done', false);
    this.card = { kind: 'complete', t: 0 };
    // vinheta de vitória
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.audio.tone(f, 0.35, 'triangle', 0.06), i * 140));
  }

  _sting() {
    // acorde menor grave e um agudo arrepiante
    setTimeout(() => {
      [110, 130.8, 164.8].forEach(f => this.audio.tone(f, 2.6, 'triangle', 0.07));
      this.audio.tone(1244, 1.8, 'sine', 0.018, -300);
    }, 1200);
  }

  // ---------- cena do encontro ----------
  _cutscene(dt) {
    const c = this.cut, C = this.creature, P = this.player, cam = this.camera;
    c.t += dt;
    const cp = C.pos, pp = P.pos;
    let ux = cp.x - pp.x, uz = cp.z - pp.z;
    const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
    const sx = -uz, sz = ux;
    P.heading += wrapA(Math.atan2(ux, uz) - P.heading) * Math.min(1, dt * 4);
    P.sync();
    const place = (x, y, z, lx, ly, lz) => {
      // não deixa a câmera atrás de tronco
      let dx = x - lx, dy = y - ly, dz = z - lz;
      const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
      const hit = this.ctx.collision.raycast(lx, ly, lz, dx, dy, dz, d);
      const k = Math.max(0.6, Math.min(d, hit - 0.25));
      const gx = lx + dx * k, gz = lz + dz * k;
      cam.position.set(gx, Math.max(ly + dy * k, this.ctx.terrain.heightAt(gx, gz) + 0.3), gz);
      cam.lookAt(lx, ly, lz);
    };
    if (c.t < 1.9) {
      // plano 1: de lado, bem perto do bicho comendo
      const k = c.t / 1.9;
      place(cp.x + sx * 2.3 - ux * (0.9 - k * 0.4), cp.y + 0.7, cp.z + sz * 2.3 - uz * (0.9 - k * 0.4), cp.x + ux * 0.3, cp.y + 0.45, cp.z + uz * 0.3);
    } else {
      // plano 2: por cima do ombro, o bicho se vira e guincha
      if (!c.alerted) { c.alerted = true; C.alert(); }
      if (c.t > 2.3 && !c.screech) { c.screech = true; ChupaAudio.screech(this.audio, L * 0.5, 1.1); this.shake = 0.25; }
      const k = clamp((c.t - 1.9) / 2, 0, 1), e = k * k * (3 - 2 * k);
      place(pp.x - ux * lerp(2.6, 2.0, e) + sx * 0.8, pp.y + 1.75, pp.z - uz * lerp(2.6, 2.0, e) + sz * 0.8, cp.x, cp.y + 0.75, cp.z);
    }
    this.combat.afterCamera();
    const end = 4.4;
    this.R.bars = 0.12 * Math.min(1, c.t / 0.4, Math.max(0, (end - c.t) / 0.4));
    const skip = c.t > 1.2 && (this.input.confirm() || this.input.mouse.clicked || this.input.pause());
    if (c.t > end || skip) { this._startFight(); return 'play'; }
    return null;
  }

  // ---------- quadro a quadro ----------
  // state: estado do jogo em main.js; devolve 'cutscene' | 'read' | 'dead' | 'play' quando o jogo deve mudar de estado
  update(dt, state) {
    if (!this.step || !this.site || state === 'title') return null;
    this.t += dt; this.stepT += dt;
    if (this.card) { this.card.t += dt; if (this.card.t > (this.card.kind === 'complete' ? 8 : 6.5)) this.card = null; }
    const P = this.player, S = this.site, C = this.creature;
    // velocidade do jogador (para o bicho prever o bote)
    if (this.prevPos && dt > 0) { this.pvel.x = lerp(this.pvel.x, (P.pos.x - this.prevPos.x) / dt, 0.3); this.pvel.z = lerp(this.pvel.z, (P.pos.z - this.prevPos.z) / dt, 0.3); }
    this.prevPos = { x: P.pos.x, z: P.pos.z };

    C.update(dt, {
      player: P, playerVel: this.pvel, arena: S.clearing, playerAlive: this.hp > 0,
      onHitPlayer: (d, x, z) => this._hitPlayer(d, x, z),
    });

    if (state === 'cutscene' && this.cut) return this._cutscene(dt);
    if (state === 'dying') {
      this.dying += dt;
      const k = clamp(this.dying / 0.7, 0, 1);
      this.character.root.rotation.x = -k * k * 1.45;
      return null;
    }
    if (state !== 'play') return null;

    this._findFocus();
    const dc = Math.hypot(P.pos.x - S.clearing.x, P.pos.z - S.clearing.z);
    // tiros (para as estatísticas)
    const rec = this.pistol.recoil ?? 0;
    if (rec > this.lastRecoil + 0.3 && this.step === 'fight') this.stats.shots++;
    this.lastRecoil = rec;

    if (this.step === 'poster' || this.step === 'coop' || this.step === 'trail') {
      // progresso na trilha (para a marca de objetivo)
      const tr = S.trail;
      let bi = this.trailI, bd = Infinity;
      for (let i = 0; i < tr.length; i++) { const d = Math.hypot(tr[i][0] - P.pos.x, tr[i][1] - P.pos.z); if (d < bd) { bd = d; bi = i; } }
      if (bd < 6) this.trailI = Math.max(this.trailI, bi);
      if (this.step === 'trail' && !this.teased && this.trailI > tr.length * 0.45) { this.teased = true; ChupaAudio.growl(this.audio, dc * 0.6); }
      // chegou na clareira (ou atirou no bicho): encontro
      if (C.provoked) { this._startFight(); this.hud.toast('CHUPACABRAS!'); return null; }
      if (dc < 15.5) {
        this.cut = { t: 0 };
        this.focus = null;
        this.pistol.aiming = false; P.aimYaw = null; this.tpc.aimWant = false;
        return 'cutscene';
      }
    } else if (this.step === 'fight') {
      this.far = dc > 34;
      if (C.gone) { this.setStep('escaped', false); this.escT = 0; this.stats.t1 = this.t; }
      if (this.combat.dead) { this.stats.deaths++; this.dying = 0.0001; return 'dead'; }
      if (this.pistol.mag + this.inventory.count('ammo9') < 4) this._ammoAtLeast(12);
    } else if (this.step === 'escaped') {
      this.escT += dt;
      if (this.escT > 1.4) { this.startRead('end'); return 'read'; }
    }
    return null;
  }

  // ---------- marca do objetivo ----------
  get marker() {
    const S = this.site;
    if (!S) return null;
    switch (this.step) {
      case 'poster': return S.board ? { x: S.board.x, z: S.board.z, y: S.board.y + 2.6 } : null;
      case 'coop': return { x: S.coop.look[0], z: S.coop.look[2], y: S.coop.y + 2.4 };
      case 'trail': {
        const tr = S.trail, P = this.player.pos;
        const near = tr.some(p => Math.hypot(p[0] - P.x, p[1] - P.z) < 14);
        const p = near ? tr[Math.min(tr.length - 1, this.trailI + 8)] : tr[0];
        return { x: p[0], z: p[1], y: this.ctx.terrain.heightAt(p[0], p[1]) + 1.2 };
      }
      case 'fight': return this.far ? { x: S.clearing.x, z: S.clearing.z, y: S.clearing.y + 1.5 } : null;
      default: return null;
    }
  }

  _screen(x, y, z, W, H) {
    const v = this._v.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1];
  }

  // ---------- tela ----------
  drawHud(g, W, H, device) {
    if (!this.step) return;
    const k = H / 240, touch = device === 'touch';
    const fightBar = this.step === 'fight' && this.creature.active && !this.creature.fleeing && !this.far;
    // objetivo (escondido enquanto uma cartela grande está na tela)
    const obj = this.objective;
    if (obj && !(touch && fightBar) && !(this.card && this.card.t > -0.5)) {
      const blink = this.stepT < 2 && Math.floor(this.stepT * 4) % 2 === 0;
      const col = blink ? '#ffe7a0' : '#f4ead2';
      if (touch) {
        drawText(g, obj, W / 2, 34 * k, 10 * k, { align: 'center', color: col });
      } else {
        // até duas linhas estreitas, para não encostar no nome do lugar (no alto, no meio)
        const size = Math.round(11 * k), maxW = 112 * k, lines = [];
        let line = '';
        for (const w of obj.split(' ')) {
          const t = line ? line + ' ' + w : w;
          if (line && textSprite(t, size, FONT_UI, col).w > maxW) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const tw = Math.max(...lines.map(l => textSprite(l, size, FONT_UI, col).w));
        // abaixo da munição (no alto à esquerda) ou do nome do lugar
        const y0 = (this.pistol.equipped ? 46 : this.hud.card ? 34 : 6) * k;
        panel(g, 6 * k, y0, tw + 12 * k, (15 + lines.length * 10) * k, 0.55);
        drawText(g, 'OBJETIVO', 11 * k, y0 + 1 * k, 9 * k, { color: '#f2c879' });
        lines.forEach((l, i) => drawText(g, l, 11 * k, y0 + (10 + i * 10) * k, size, { color: col }));
      }
    }
    // marca na tela
    const m = this.marker;
    if (m) {
      const s = this._screen(m.x, m.y, m.z, W, H);
      const d = Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z);
      if (s && s[2] && d > 3) {
        const x = Math.round(s[0]), y = Math.round(s[1] + Math.sin(this.t * 3) * 2 * k), r = Math.round(4 * k);
        g.fillStyle = '#140c08';
        g.beginPath(); g.moveTo(x, y - r - 1); g.lineTo(x + r + 1, y); g.lineTo(x, y + r + 1); g.lineTo(x - r - 1, y); g.closePath(); g.fill();
        g.fillStyle = '#f2c879';
        g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
        drawText(g, Math.round(d) + ' m', x, y + r + 2 * k, 9 * k, { align: 'center', color: '#f4ead2' });
      }
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
    }
    // vida do bicho
    if (fightBar) {
      const bw = Math.round(150 * k), bh = Math.max(3, Math.round(4 * k)), x = Math.round(W / 2 - bw / 2), y = Math.round(48 * k);
      drawText(g, 'CHUPACABRAS', W / 2, y - 12 * k, 11 * k, { align: 'center', color: '#e8c0b0' });
      g.fillStyle = '#140c08'; g.fillRect(x - 1, y - 1, bw + 2, bh + 2);
      g.fillStyle = '#3a1010'; g.fillRect(x, y, bw, bh);
      g.fillStyle = '#c02818'; g.fillRect(x, y, Math.round(bw * Math.max(0, this.creature.hp) / CHUPA_HP), bh);
    }
    this._drawCard(g, W, H, k);
  }

  _drawHp(g, W, H, k, touch) {
    // toque: embaixo da munição; teclado/controle: canto de baixo, acima do nome da rua
    const x = Math.round(8 * k), y = Math.round(touch ? 72 * k : H - 30 * k);
    const bw = Math.round(64 * k), bh = Math.max(3, Math.round(4 * k));
    const f = this.hp / MAX_HP;
    drawText(g, 'VIDA', x, y - 10 * k, 9 * k, { color: '#a89878' });
    g.fillStyle = '#140c08'; g.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    g.fillStyle = '#2a2018'; g.fillRect(x, y, bw, bh);
    g.fillStyle = f > 0.6 ? '#6aa84a' : f > 0.3 ? '#d8b040' : (Math.floor(this.t * 4) % 2 ? '#c83020' : '#f05030');
    g.fillRect(x, y, Math.round(bw * f), bh);
  }

  // cartelas grandes no meio da tela
  _drawCard(g, W, H, k) {
    const c = this.card;
    if (!c || c.t < 0) return;
    const dur = c.kind === 'complete' ? 8 : 6.5;
    const a = Math.min(1, c.t / 0.8, Math.max(0, (dur - c.t) / 1));
    if (a <= 0) return;
    const y = H * 0.3;
    g.globalAlpha = a * 0.5; g.fillStyle = '#0d0907'; g.fillRect(0, Math.round(y - 22 * k), W, Math.round(78 * k)); g.globalAlpha = 1;
    if (c.kind === 'mission') {
      drawText(g, 'MISSÃO 1', W / 2, y - 16 * k, 11 * k, { align: 'center', alpha: a, color: '#f2c879' });
      drawText(g, 'O Chupacabras', W / 2, y - 4 * k, 28 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#efe2c4', shadow: '#2a0806' });
      drawText(g, 'Animais aparecem mortos, sem sangue, em Teewald.', W / 2, y + 34 * k, 11 * k, { align: 'center', alpha: a, color: '#d8c8a8' });
    } else {
      const s = this.stats, secs = Math.max(0, Math.round((s.t1 || this.t) - s.t0));
      const acc = s.hits ? Math.round(100 * s.hits / Math.max(s.shots, s.hits)) : 0;
      drawText(g, 'MISSÃO CUMPRIDA', W / 2, y - 16 * k, 11 * k, { align: 'center', alpha: a, color: '#f2c879' });
      drawText(g, 'O Chupacabras', W / 2, y - 4 * k, 28 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#efe2c4', shadow: '#2a0806' });
      drawText(g, `TIROS ${s.shots}   ACERTOS ${s.hits}   PRECISÃO ${acc}%   LUTA ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, W / 2, y + 34 * k, 10 * k, { align: 'center', alpha: a, color: '#d8c8a8' });
      drawText(g, 'CONTINUA...', W / 2, y + 46 * k, 10 * k, { align: 'center', alpha: a, color: '#c86848' });
    }
  }

  drawRead(g, W, H, device) { this.dialogue.draw(g, W, H, device); }

  // nome do bicho na tarja de baixo durante o encontro
  drawCutscene(g, W, H) {
    const c = this.cut;
    if (!c || c.t < 2.4) return;
    const k = H / 240, a = Math.min(1, (c.t - 2.4) / 0.4, Math.max(0, (4.2 - c.t) / 0.4));
    drawText(g, 'CHUPACABRAS', W / 2, H - 26 * k, 20 * k, { align: 'center', font: FONT_TITLE, alpha: a, color: '#e8d8c0', shadow: '#3a0606' });
  }

  drawDying(g, W, H) {
    const k = H / 240, a = clamp(this.dying / 0.6, 0, 1);
    g.globalAlpha = a * 0.35; g.fillStyle = '#5a0404'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    drawText(g, 'O CHUPACABRAS TE PEGOU', W / 2, H * 0.42, 16 * k, { align: 'center', alpha: a, color: '#f0d0c0', shadow: '#2a0202' });
  }
}
