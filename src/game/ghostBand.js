import * as THREE from 'three';
import { MeshBuilder } from '../engine/builder.js';
import { M } from '../engine/materials.js';
import { ps1Material } from '../engine/ps1material.js';
import { SFX } from './creatures/sfx.js';

// A bandinha fantasma: nas noites sem sol, quando o jogador passa perto do pavilhão
// da Kartoffelfest (cancelada), três músicos translúcidos tocam uma valsa desafinada
// no palco vazio, com a luz do palco piscando. Chegando perto demais, a música para
// de repente, os músicos somem e alguém sussurra. Só volta no capítulo seguinte.
// A valsa é original (lá menor, 3/4), sintetizada como sanfona, tuba e clarinete.

const START_R = 78, STOP_R = 9, BEAT = 0.62;
// melodia: 16 compassos de 3 tempos (MIDI; 0 = segura a nota de antes)
const MEL = [
  [69, 72, 76], [76, 74, 72], [74, 77, 74], [72, 0, 69],
  [68, 71, 74], [76, 74, 71], [72, 71, 69], [64, 0, 0],
  [69, 74, 77], [77, 76, 74], [76, 72, 69], [72, 69, 65],
  [68, 71, 76], [74, 72, 71], [69, 0, 64], [69, 0, 0],
];
const AM = [57, 60, 64], DM = [57, 62, 65], E7 = [56, 59, 62], FM = [57, 60, 65];
const CHORD = [AM, AM, DM, AM, E7, E7, AM, AM, DM, DM, AM, FM, E7, E7, AM, AM];
const BASS = [45, 52, 50, 45, 40, 47, 45, 40, 50, 45, 45, 41, 40, 47, 45, 45];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

export class Waltz {
  constructor(audio) { this.a = audio; this.out = null; }
  get on() { return !!this.out; }
  start() {
    const c = this.a.ctx;
    if (!c || this.out) return;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 2200;
    this.pan = c.createStereoPanner ? c.createStereoPanner() : null;
    this.lp.connect(this.pan || this.out);
    if (this.pan) this.pan.connect(this.out);
    this.out.connect(this.a.master);
    this.next = c.currentTime + 0.15; this.beat = 0;
  }
  // corte seco (fast) ou sumindo devagar
  stop(fast = false) {
    if (!this.out) return;
    const c = this.a.ctx, g = this.out, t = c.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + (fast ? 0.06 : 1.5));
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* já desligado */ } }, fast ? 300 : 1800);
    this.out = null;
  }
  // voz: oscilador com envelope, desafinação lenta e (no clarinete) vibrato
  _note(type, f, t, dur, vol, o = {}) {
    const c = this.a.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    const warble = 1 + 0.011 * Math.sin(t * 0.7) + (o.detune || 0);
    osc.frequency.setValueAtTime(f * warble, t);
    if (o.drop) osc.frequency.exponentialRampToValueAtTime(f * warble * 0.985, t + dur);
    if (o.vib) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = f * 0.012;
      lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.03));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.band) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.band; bp.Q.value = 0.8; osc.connect(bp); node = bp; }
    node.connect(g).connect(this.lp);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  update(vol, pan) {
    if (!this.out) return;
    const c = this.a.ctx, t = c.currentTime;
    this.out.gain.setTargetAtTime(vol, t, 0.3);
    if (this.pan) this.pan.pan.setTargetAtTime(pan, t, 0.2);
    while (this.next < t + 0.3) {
      const b = this.beat, bar = Math.floor(b / 3) % 16, k = b % 3, at = this.next;
      if (k === 0) {
        this._note('triangle', hz(BASS[bar]), at, BEAT * 0.9, 0.16, { drop: true, attack: 0.02 });
        this._note('sine', hz(BASS[bar] - 12), at, BEAT * 0.8, 0.1, { attack: 0.02 });
      } else {
        for (const [i, m] of CHORD[bar].entries()) this._note('sawtooth', hz(m), at, BEAT * 0.55, 0.022, { band: 1100, detune: (i - 1) * 0.004, attack: 0.04 });
      }
      const m = MEL[bar][k];
      if (m) {
        // segura enquanto as próximas forem 0
        let len = 1;
        while (len < 3 && k + len < 3 && MEL[bar][k + len] === 0) len++;
        this._note('square', hz(m), at, BEAT * len * 0.92, 0.035, { vib: true, band: 1500, attack: 0.05 });
      }
      this.beat++;
      // a cada volta, um compasso arrastado (o fole cansando)
      this.next += BEAT * (bar === 15 && k === 2 ? 1.6 : 1);
    }
  }
}

export class GhostBand {
  // o: { ctx, scene, audio, atmo, player, camera, campaign, combat }
  constructor(o) {
    Object.assign(this, o);
    this.waltz = new Waltz(o.audio);
    this.chapter = 0; this.silenced = false; this.playing = false; this.vis = 0; this.t = 0;
    const K = o.ctx.landmarks.kartoffel;
    this.ok = !!K;
    if (!this.ok) return;
    const c = Math.cos(K.rot), s = Math.sin(K.rot);
    this.W = (lx, lz) => [K.x + lx * c + lz * s, K.z - lx * s + lz * c];
    // palco na ponta da Prefeitura, virado para o começo da rua (-x local)
    const [sx, sz] = this.W(K.hl - 2.5, 0);
    this.stage = { x: sx, z: sz, y: o.ctx.groundAt(sx, sz, 1000) };
    const front = this.W(K.hl - 6, 0);
    this.front = { x: front[0], z: front[1] };
    this.face = Math.atan2(front[0] - sx, front[1] - sz);
    this.group = new THREE.Group();
    this.group.visible = false;
    o.scene.add(this.group);
    this.mat = ps1Material({ map: null, lit: false, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(0.6, 0.75, 0.9), opacity: 0.8 });
    this.mat.blending = THREE.AdditiveBlending;
    M.ghostBand = this.mat;
    this.players = [[-0.2, -1.5, 'sanfona'], [-0.7, 0.1, 'tuba'], [0.1, 1.5, 'clarinete']].map(([dx, lz, kind]) => {
      const [x, z] = this.W(K.hl - 2.5 + dx, lz);
      const g = this._musician(kind);
      g.position.set(x, o.ctx.groundAt(x, z, 1000), z);
      g.rotation.y = this.face;
      this.group.add(g);
      return { g, kind, ph: Math.random() * 6 };
    });
    // brilho frio em volta dos três (aparece de longe, na neblina)
    const hc = document.createElement('canvas'); hc.width = hc.height = 32;
    const hg = hc.getContext('2d'), grd = hg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(170,205,235,0.9)'); grd.addColorStop(1, 'rgba(170,205,235,0)');
    hg.fillStyle = grd; hg.fillRect(0, 0, 32, 32);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.halo.scale.set(5.5, 3.4, 1);
    this.halo.position.set(sx, this.stage.y + 1.2, sz);
    this.group.add(this.halo);
  }

  _musician(kind) {
    const B = new MeshBuilder(0), m = 'ghostBand', col = [1, 1, 1];
    B.col = col;
    B.cylinder(m, 0, 0, 0, 0.26, 0.2, 1.1, 8, { cap: true });            // calça e casaco
    B.cylinder(m, 0, 1.1, 0, 0.22, 0.24, 0.42, 8, { cap: true });        // peito
    B.cylinder(m, 0, 1.52, 0, 0.11, 0.11, 0.24, 8, { cap: true });       // cabeça
    B.cylinder(m, 0, 1.74, 0, 0.2, 0.2, 0.03, 10, { cap: true });        // aba do chapéu
    B.cylinder(m, 0, 1.76, 0, 0.12, 0.1, 0.14, 8, { cap: true });        // copa
    B.box(m, 0.11, 1.84, -0.02, 0.02, 0.18, 0.03, -0.4);                 // pena
    if (kind === 'sanfona') {
      B.box(m, 0, 1.0, 0.28, 0.5, 0.36, 0.22, 0);
      for (let i = 0; i < 4; i++) B.box(m, -0.2 + i * 0.13, 1.0, 0.4, 0.02, 0.36, 0.02, 0);
    } else if (kind === 'tuba') {
      B.cylinder(m, 0.05, 0.9, 0.25, 0.12, 0.14, 0.5, 8, { cap: true });
      B.cylinder(m, 0.05, 1.4, 0.25, 0.14, 0.32, 0.3, 10, { cap: false });
    } else {
      B.cylinder(m, 0, 1.0, 0.28, 0.03, 0.06, 0.55, 6, { cap: true });
    }
    const g = B.build(M);
    const pivot = new THREE.Group(); pivot.add(g);
    return pivot;
  }

  silence() { this.playing = false; this.waltz.stop(false); this.vis = 0; if (this.group) this.group.visible = false; }

  get allowed() {
    const C = this.campaign;
    // no capítulo da Fera ela é atraída para o pavilhão: a bandinha fica quieta
    return this.ok && C.index >= 2 && C.S?.def.key !== 'fera' && !!C.S && !C.S.done && !this.ctx.indoor && this.atmo.isNight;
  }

  update(dt) {
    if (!this.ok) return;
    this.t += dt;
    const n = this.campaign.index;
    if (n !== this.chapter) { this.chapter = n; this.silenced = false; }
    const P = this.player.pos, st = this.stage, d = Math.hypot(P.x - st.x, P.z - st.z);
    const cb = this.combat, quiet = !cb.inFight && !(cb.boss && !cb.boss.dead) && !this.campaign.S?.cut && !this.campaign.S?.narr;
    const want = this.allowed && quiet && !this.silenced && d < START_R;
    // (o som pode começar depois: o navegador só libera o áudio no primeiro toque)
    if (want && !this.playing) this.playing = true;
    if (!want && this.playing) { this.playing = false; this.waltz.stop(false); }
    if (this.playing && !this.waltz.on) this.waltz.start();
    // chegou perto demais: corte seco, os músicos somem, sussurro
    if (this.playing && d < STOP_R) {
      this.playing = false;
      this.waltz.stop(true);
      this.silenced = true;
      SFX.whisper(this.audio, 2);
      this.vis = Math.min(this.vis, 0.6);
      this.cut = 0.5;
    }
    if (this.playing && this.waltz.on) {
      const v = Math.pow(Math.max(0, 1 - d / START_R), 1.4) * 0.55;
      const cam = this.camera, dx = st.x - cam.position.x, dz = st.z - cam.position.z;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const pan = Math.max(-0.8, Math.min(0.8, (dx * right.x + dz * right.z) / (Math.hypot(dx, dz) || 1)));
      this.waltz.update(v, pan);
    }
    // aparecem com a música (de longe, um vulto; de perto, mais nítidos)
    this.cut = Math.max(0, (this.cut || 0) - dt);
    const target = this.playing ? 1 : 0;
    this.vis += (target - this.vis) * Math.min(1, dt * (target ? 0.8 : 6));
    this.group.visible = this.vis > 0.02;
    if (this.group.visible) {
      this.mat.uniforms.uOpacity.value = 0.8 * this.vis * (0.75 + 0.25 * Math.sin(this.t * 3.1));
      this.halo.material.opacity = 0.55 * this.vis;
      for (const p of this.players) {
        // balanço em três tempos
        const ph = (this.t / (BEAT * 3)) * Math.PI * 2 + p.ph;
        p.g.rotation.z = Math.sin(ph) * 0.06;
        p.g.position.y = this.stage.y + Math.abs(Math.sin(ph * 1.5)) * 0.05;
      }
      // luz do palco piscando, fria
      const k = this.vis * (Math.sin(this.t * 17) > -0.6 ? 1 : 0.2);
      this.atmo.light(st.x, st.y + 3.2, st.z, [0.45 * k, 0.6 * k, 0.75 * k], 12, 2);
    }
    if (this.cut > 0) this.atmo.light(st.x, st.y + 3.2, st.z, [0.9, 0.9, 1.0], 14, 3);
  }
}
