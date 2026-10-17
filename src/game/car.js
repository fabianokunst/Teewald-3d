import * as THREE from 'three';
import { buildHeroCar, CAR } from './carModel.js';
import { CarAudio } from './carAudio.js';
import { roadMatAt } from '../world/roads.js';
import { pointInPoly } from '../world/geo.js';
import { ps1Material, G as U } from '../engine/ps1material.js';
import { drawText, textSprite, panel, FONT_UI } from '../ui/overlay.js';
import { INTERIOR_MIN } from '../config.js';

// O carro do protagonista (um só, dirigível a qualquer hora, sem combustível).
// Física de fliperama, sem biblioteca: modelo de bicicleta com derrapagem (a velocidade de
// lado morre pela aderência do piso, então no piso liso ou no freio de mão a traseira sai),
// tração e freio limitados pela aderência, câmbio automático de três marchas, ladeiras
// (a gravidade puxa ao longo do carro), suspensão em mola (o corpo afunda no meio-fio, mergulha
// na freada, levanta na arrancada e inclina na curva) e pulos nas lombadas do morro.
// Batidas: o contorno do carro contra as caixas e círculos do mundo, com impulso no ponto de
// contato (bater de quina faz o carro girar). Moradores pulam para fora do caminho; se não der,
// o carro para neles como num poste, sem ferir ninguém. Criaturas são atropeladas (as grandes
// seguram o carro). Entrar e sair têm animação: a porta abre, ele se abaixa e senta, fecha a
// porta, põe as mãos no volante e dá a partida (e o contrário, ao sair).
// Eixos do carro: +z para a frente, +x para a esquerda (o lado do motorista).

const G = 9.8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
const easeIn = t => { t = clamp(t, 0, 1); return t * t; };
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const wrapA = a => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

// desempenho e pisos
const ACCEL = 5.6, VMAX = 34, REV_MAX = 8, BRAKE = 7.8, DRAG = 0.0027, ROLL = 0.3;
const GRIP = { asphalt: 1, concrete: 0.95, walk: 0.9, sett: 0.8, dirt: 0.64, grass: 0.55, leaves: 0.5, water: 0.4 };
const RESIST = { asphalt: 0, concrete: 0, walk: 0.1, sett: 0.12, dirt: 0.45, grass: 1.0, leaves: 1.7, water: 2.5 };
const GEARS = [290, 172, 118];          // rpm por m/s em cada marcha
const IDLE = 720, SHIFT_UP = 4100, SHIFT_DOWN = 1500;
const HL = 2.74, HW = 1.02, INERTIA = 2.9;
const SUBSTEP = 0.22;                   // passo máximo (m) por iteração: não atravessa poste nem parede fina
const FLOOR = CAR.seat[1];              // assoalho (altura no carro)
const OUT = { x: 1.38, z: -0.7 };       // onde o motorista fica em pé do lado de fora (fora do arco da porta)
const WATER_START = 0.55;               // água (m) acima da qual o motor não pega: parado ali, o carro fica preso
const WATER_FLOOD = 0.75;               // água (m) acima da qual o motor afoga andando
const SEAT = { x: CAR.seat[0], z: CAR.seat[2] };
const EDGE = { x: 1.0, z: -0.42 };      // sentado na beira da porta (entrando e saindo)
// postura no banco: altura do quadril acima do assoalho, avanço e o quanto o tronco reclina.
// Sentado baixo e reclinado: o alto da cabeça fica a ~1,27 m, abaixo do forro (1,33) e do teto
const SEAT_POSE = { hips: [0.19, 0.08], lean: 0.42 };

const DRIVE_HINTS = {
  keyboard: ['W acelerar   S freio e ré   A D volante   ESPAÇO freio de mão', 'G buzina   L farol   C olhar para trás   F sair do carro'],
  pad: ['R2 acelerar   L2 freio e ré   ANALÓGICO volante   B freio de mão', 'X buzina   ↑ farol   LB olhar para trás   A sair do carro'],
  touch: ['ESQUERDA volante   ACELERAR   FREIO e ré', 'F. DE MÃO   BUZINA   FAROL   SAIR'],
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const _hand = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

// brilho redondo dos faróis e lanternas (somado à cena)
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,250,230,0.85)'); gr.addColorStop(0.45, 'rgba(255,230,180,0.25)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(c);
  return GLOW_TEX;
}

// facho do farol (cone somado à cena: aparece na neblina e na chuva)
function beamMesh(len, r) {
  const n = 12, pos = [], col = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a0) * r, Math.sin(a0) * r * 0.6, len, Math.cos(a1) * r, Math.sin(a1) * r * 0.6, len);
    col.push(1, 1, 1, 0, 0, 0, 0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, color: 0x000000 }));
  m.frustumCulled = false; m.renderOrder = 6;
  return m;
}

// marcas de pneu: faixas escuras no chão, num anel (as mais velhas são reaproveitadas)
class Skids {
  constructor(scene, n = 360) {
    this.n = n; this.i = 0;
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 18).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 12), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 18).fill(1), 3));
    this.mesh = new THREE.Mesh(g, ps1Material({ color: 0x0a0908, lit: false, transparent: true, opacity: 0.5, polygonOffset: -3 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.userData.noShadow = true;
    scene.add(this.mesh);
  }
  // pedaço de a até b (cada um { x, y, z }), largura w
  add(a, b, w = 0.2) {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    if (l < 0.05) return;
    const px = -dz / l * w / 2, pz = dx / l * w / 2;
    const P = this.geo.getAttribute('position'), o = this.i * 6;
    const q = [[a.x + px, a.y, a.z + pz], [b.x + px, b.y, b.z + pz], [b.x - px, b.y, b.z - pz], [a.x - px, a.y, a.z - pz]];
    for (const [k, j] of [[0, 0], [1, 1], [2, 2], [3, 0], [4, 2], [5, 3]]) P.setXYZ(o + k, ...q[j]);
    P.needsUpdate = true;
    this.i = (this.i + 1) % this.n;
  }
}

export class Car {
  // deps: { ctx, scene, audio, effects, atmo, input, player, character, combat, npcs, hud, camera, tpc, R }
  constructor(deps) {
    Object.assign(this, deps);
    const m = this.model = buildHeroCar();
    this.root = m.root; this.bodyG = m.body;
    this.scene.add(this.root);
    this.sound = new CarAudio(this.audio);
    this.skids = new Skids(this.scene);
    this.pos = new THREE.Vector3();
    this.heading = 0; this.vx = 0; this.vz = 0; this.yawRate = 0; this.steer = 0;
    this.vLong = 0; this.vLat = 0; this.accLong = 0; this.latAcc = 0;
    this.body = { y: 0, vy: 0, p: 0, vp: 0, r: 0, vr: 0 };
    this.air = 0; this.gF = 0; this.gR = 0; this.gL = 0; this.gRt = 0; this.ground = [0, 0, 0, 0];
    this.slope = 0; this.surface = 'asphalt'; this.water = 0;
    this.rpm = 0; this.gear = 0; this.engine = false; this.crankT = 0; this.flooded = false;
    this.reverse = false; this.revT = 0; this.throttle = 0; this.brake = 0; this.hand = false;
    this.lightsOn = false; this.lightsManual = null; this.lightK = 0; this.brakeK = 0;
    this.mode = 'parked';            // parked | approach | enter | drive | exit
    this.anim = null; this.ai = null; this.ctl = null;
    this.door = 0;                   // 0 fechada ... 1 aberta
    this.damage = 0; this.smokeT = 0; this.exhT = 0; this.dustT = 0;
    this.skid = 0; this.skidPrev = [null, null];
    this.focus = false; this.chip = null; this.touchHit = false;
    this.lastGood = null; this.goodT = 0; this.hidden = false;
    this.box = this.ctx.collision.addBox(0, 0, HW, HL - 0.04, 0, -100, -99, { dynamic: true, cam: false, owner: this });
    // faróis: lentes acesas, brilho e fachos
    const gm = c => new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.headGlow = CAR.heads.map(([x, y]) => { const s = new THREE.Sprite(gm(0xfff2d8)); s.position.set(x, y, 2.72); s.scale.setScalar(0.01); this.bodyG.add(s); return s; });
    this.tailGlow = CAR.tails.map(([x, y]) => { const s = new THREE.Sprite(gm(0xff2a18)); s.position.set(x, y, -2.68); s.scale.setScalar(0.01); this.bodyG.add(s); return s; });
    this.beams = [0.69, -0.69].map(x => { const b = beamMesh(22, 4.2); b.position.set(x, 0.62, 2.72); b.rotation.x = 0.07; this.bodyG.add(b); return b; });
    addEventListener('touchstart', e => {
      const c = this.chip;
      if (!c) return;
      for (const t of e.changedTouches) {
        const [x, y] = this.R.toInternal(t.clientX, t.clientY), pad = 6 * (this.R.H / 240);
        if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) this.touchHit = true;
      }
    }, { passive: true });
    this.place(0, 0, 0);
  }

  get driving() { return this.player.vehicle === this; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  // câmera de carro: dirigindo e nas animações de entrar e sair
  get camActive() { return this.driving; }

  // ---------- posição ----------
  // ponto do carro (lx, lz) no mundo
  world(lx, lz, out = [0, 0]) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    out[0] = this.pos.x + lx * c + lz * s; out[1] = this.pos.z - lx * s + lz * c;
    return out;
  }

  place(x, z, heading) {
    this.pos.set(x, 0, z); this.heading = heading;
    this.vx = this.vz = 0; this.yawRate = 0; this.steer = 0; this.vLong = this.vLat = 0;
    this.air = 0; this.reverse = false;
    this._sampleGround(true);
    const b = this.body;
    b.y = this.pos.y; b.vy = 0; b.p = this.pTarget; b.vp = 0; b.r = this.rTarget; b.vr = 0;
    this.skidPrev = [null, null];
    this._sync();
  }

  // estaciona na beira da rua mais perto de (x, z), longe pelo menos `min` m do ponto
  parkNear(x, z, min = 7, max = 70) {
    const s = this._parkSpot(x, z, min, max);
    if (s) this.place(s[0], s[1], s[2]);
    return !!s;
  }

  // a vaga de parkNear: [x, z, rumo] ou null
  _parkSpot(x, z, min, max) {
    const ctx = this.ctx, best = [];
    for (const r of ctx.roads.list) {
      if (r.rank < 2 || r.pts.length < 3) continue;
      for (let i = 1; i < r.pts.length - 1; i++) {
        const p = r.pts[i], d = Math.hypot(p[0] - x, p[1] - z);
        if (d < min || d > max) continue;
        best.push([d, r, i]);
      }
    }
    best.sort((a, b) => a[0] - b[0]);
    for (const [, r, i] of best.slice(0, 80)) {
      const a = r.pts[i - 1], b = r.pts[i + 1], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
      // reto o bastante para caber o carro
      const a2 = r.pts[Math.max(0, i - 2)], b2 = r.pts[Math.min(r.pts.length - 1, i + 2)];
      const t2x = b2[0] - a2[0], t2z = b2[1] - a2[1];
      if ((tx * t2x + tz * t2z) / (tl * (Math.hypot(t2x, t2z) || 1)) < 0.97) continue;
      for (const dir of [1, -1]) {
        const h = Math.atan2(tx * dir, tz * dir);
        // lado direito de quem anda na mão (o carro estaciona encostado)
        const off = Math.max(0, r.hw - 1.2), rx = -Math.cos(h), rz = Math.sin(h);
        const px = r.pts[i][0] + rx * off, pz = r.pts[i][1] + rz * off;
        if (this._clearAt(px, pz, h)) return [px, pz, h];
      }
    }
    return null;
  }

  // cabe ali? (sem muro, poste, água funda e sem desnível grande)
  _clearAt(x, z, h) {
    const ctx = this.ctx, c = Math.cos(h), s = Math.sin(h);
    const ys = [];
    for (const [lx, lz] of [[0.8, 1.7], [-0.8, 1.7], [0.8, -1.4], [-0.8, -1.4], [0, 0]]) {
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c, g = ctx.groundAt(wx, wz, 1000);
      if ((ctx.waterDepth?.(wx, wz, g) || 0) > 0.2) return false;
      ys.push(g);
    }
    if (Math.max(...ys) - Math.min(...ys) > 0.5) return false;
    for (const it of ctx.collision.near(x, z, 4)) {
      if (it === this.box || it.y1 < Math.min(...ys) + 0.35) continue;
      if (this._overlapItem(it, x, z, h, 0.25)) return false;
    }
    return true;
  }

  _overlapItem(it, x, z, h, pad = 0) {
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    if (it.t === 'circle') {
      const dx = it.x - x, dz = it.z - z, dl = dx * fx + dz * fz, ds = dx * lx + dz * lz;
      const ql = clamp(dl, -HL, HL), qs = clamp(ds, -HW, HW);
      return Math.hypot(dl - ql, ds - qs) < it.r + pad;
    }
    return this._sat(it, x, z, fx, fz, lx, lz, pad) !== null;
  }

  // ---------- chão e suspensão ----------
  _sampleGround(snap = false) {
    const ctx = this.ctx, P = this.pos, W = this.model.wheels;
    const pts = this._wp ||= [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      this.world(w.x, w.z, pts[i]);
      const ref = snap ? 1000 : (this.ground[i] ?? P.y) - 0.15;
      this.ground[i] = ctx.groundAt(pts[i][0], pts[i][1], ref);
    }
    const g = this.ground;
    this.gF = (g[0] + g[1]) / 2; this.gR = (g[2] + g[3]) / 2;
    this.gL = (g[0] + g[2]) / 2; this.gRt = (g[1] + g[3]) / 2;
    P.y = (g[0] + g[1] + g[2] + g[3]) / 4;
    this.slope = Math.atan2(this.gF - this.gR, CAR.base);
    this.pTarget = -this.slope;
    this.rTarget = Math.atan2(this.gL - this.gRt, CAR.track * 2);
    // água: profundidade no meio do carro
    const wl = ctx.waterLevel?.(P.x, P.z);
    this.water = wl == null ? 0 : Math.max(0, wl - P.y);
    this.waterY = wl;
    this.surface = this.water > 0.25 ? 'water' : this._surfaceAt(P.x, P.z);
  }

  _surfaceAt(x, z) {
    const ctx = this.ctx;
    const m = roadMatAt(ctx.roads, ctx.terrain, x, z);
    if (m) return m;
    for (const f of ctx.floors) if (pointInPoly(x, z, f.poly)) return 'concrete';
    if (ctx.zones?.isForest(x, z)) return 'leaves';
    return 'grass';
  }

  _suspension(dt) {
    const b = this.body, tgt = this.pos.y;
    // a mola empurra para cima à vontade, mas para baixo só cai com a gravidade (pulos)
    let a = 170 * (tgt - b.y) - 2 * Math.sqrt(170) * 0.72 * b.vy;
    if (tgt < b.y) a = Math.max(a, -G * 1.15);
    const was = this.air;
    b.vy += a * dt; b.y += b.vy * dt;
    if (b.y < tgt - 0.1) { b.y = tgt - 0.1; if (b.vy < 0) b.vy = 0; }
    this.air = b.y > tgt + 0.12 ? Math.min(1, this.air + dt * 6) : 0;
    // pouso depois de um pulo (ou caindo de um degrau)
    if (was > 0.5 && !this.air && this._fallV < -2.5) {
      const k = clamp(-this._fallV / 8, 0, 1);
      this.sound.clunk(k); this._shake(0.15 + k * 0.4); this.input.rumble(0.3 + k * 0.6, 0.4, 140);
      b.vp += -this.vLong * 0.02;
    }
    this._fallV = b.vy;
    // inclinação: o chão + a arrancada (levanta a frente) / freada (mergulha) e a curva
    const pt = clamp(this.pTarget - this.accLong * 0.0075, -0.5, 0.5);
    const rt = clamp(this.rTarget + this.latAcc * 0.011, -0.4, 0.4);
    b.vp += (110 * (pt - b.p) - 2 * Math.sqrt(110) * 0.55 * b.vp) * dt; b.p += b.vp * dt;
    b.vr += (110 * (rt - b.r) - 2 * Math.sqrt(110) * 0.5 * b.vr) * dt; b.r += b.vr * dt;
  }

  // ---------- controles ----------
  _controls(input) {
    const t = input.driveThrottle(), br = input.driveBrake();
    return { throttle: t, brake: br, steer: input.driveSteer(), hand: input.driveHandbrake() };
  }

  // ---------- física ----------
  _step(dt, ctl) {
    if (dt <= 0) return;
    this.time = (this.time || 0) + dt;
    const P = this.pos, h0 = this.heading;
    let fx = Math.sin(h0), fz = Math.cos(h0), lx = Math.cos(h0), lz = -Math.sin(h0);
    let vL = this.vx * fx + this.vz * fz, vS = this.vx * lx + this.vz * lz;
    const rain = this.atmo?.cur?.rain || 0;
    const wet = this.surface === 'sett' ? 1 - 0.32 * rain : this.surface === 'asphalt' || this.surface === 'concrete' ? 1 - 0.2 * rain : 1 - 0.12 * rain;
    const onGround = this.air < 0.5;
    const mu = (GRIP[this.surface] ?? 0.6) * wet * (onGround ? 1 : 0.05);
    const c = ctl || { throttle: 0, brake: 0, steer: 0, hand: false };
    const running = this.engine && !this.flooded;
    let thr = running ? c.throttle : 0, brk = c.brake;
    // ré: parado e segurando o freio por um instante; acelerando, volta para a frente
    const sp = Math.abs(vL);
    if (!this.reverse && sp < 0.6 && brk > 0.3 && thr < 0.1) { this.revT += dt; if (this.revT > 0.22) this.reverse = true; }
    else if (this.reverse && sp < 0.6 && thr > 0.3 && brk < 0.1) { this.revT += dt; if (this.revT > 0.12) this.reverse = false; }
    else this.revT = 0;
    // de ré os pedais trocam (o freio acelera para trás); c.stop = só frear, para qualquer lado
    if (this.reverse && !c.stop) [thr, brk] = [running ? brk : 0, thr];
    // alguém parado na frente que não vai sair: o carro freia sozinho (ninguém é atropelado)
    if (this._assist > 0) { this._assist -= dt; thr = 0; brk = 1; }
    this.throttle = thr; this.brake = brk; this.hand = !!c.hand;
    // direção: mais curta com velocidade; volta ao centro sozinha
    const maxSt = 0.62 / (1 + sp / 9);
    this.steer += (c.steer * maxSt - this.steer) * Math.min(1, dt * (c.steer ? 5.5 : 7));
    // força para a frente: motor (limitado pela aderência), freio, rolagem, ar e ladeira
    const dirSign = this.reverse ? -1 : 1;
    const limp = this.damage >= 90 ? 0.45 : 1;
    const top = (this.reverse ? REV_MAX : VMAX * limp);
    const vDir = vL * dirSign;
    let a = 0;
    if (thr > 0 && vDir < top) a += dirSign * Math.min(thr * ACCEL * limp * (1 - (Math.max(0, vDir) / top) ** 2), mu * G * 0.85);
    let decel = ROLL + (RESIST[this.surface] ?? 0.5) + DRAG * vL * vL;
    if (brk > 0) decel += brk * BRAKE * Math.min(1, mu + 0.15);
    if (this.hand) decel += 5 * Math.max(0.3, mu);
    // parado sem acelerar: segura (como o pé no freio)
    if (thr < 0.05 && sp < 0.35) decel += 6;
    if (this.water > 0.3) decel += this.water * 4;
    a += -G * Math.sin(this.slope) * (onGround ? 1 : 0);
    // a desaceleração nunca inverte o sentido
    vL += a * dt;
    const dv = decel * dt * (onGround ? 1 : 0.1);
    vL = Math.abs(vL) <= dv ? 0 : vL - Math.sign(vL) * dv;
    this.accLong = (vL - (this._vLprev ?? vL)) / dt; this._vLprev = vL;
    // giro (bicicleta) limitado pela aderência; no freio de mão a traseira escapa
    let rT = vL * Math.tan(this.steer) / CAR.base;
    const lim = mu * G * 0.95 / Math.max(Math.abs(vL), 2);
    rT = clamp(rT, -lim, lim);
    if (this.hand && sp > 3) rT *= 1.7;
    this.yawRate += (rT - this.yawRate) * Math.min(1, dt * (onGround ? 3 + 7 * mu : 0.3));
    this.heading = wrapA(this.heading + this.yawRate * dt);
    // a velocidade guarda a direção do mundo: o que sobrou de lado vira derrapagem
    const wx = fx * vL + lx * vS, wz = fz * vL + lz * vS, h1 = this.heading;
    fx = Math.sin(h1); fz = Math.cos(h1); lx = Math.cos(h1); lz = -Math.sin(h1);
    vL = wx * fx + wz * fz; vS = wx * lx + wz * lz;
    const latGrip = !onGround ? 0.2 : this.hand ? 1.3 : 8 * mu;
    vS *= Math.exp(-latGrip * dt);
    this.vx = fx * vL + lx * vS; this.vz = fz * vL + lz * vS;
    this.vLong = vL; this.vLat = vS; this.latAcc = vL * this.yawRate;
    // derrapagem (som, fumaça, marcas): de lado, freada forte e arrancada patinando
    this.skid = clamp((Math.abs(vS) - 1.2) / 3, 0, 1)
      + (brk > 0.8 && sp > 7 && mu > 0.7 ? 0.5 : 0) + (this.hand && sp > 3 ? 0.6 : 0)
      + (thr > 0.85 && sp < 5 && running && !this.reverse ? 0.45 : 0);
    // anda em passos curtos, batendo
    const dist = Math.hypot(this.vx, this.vz) * dt, n = Math.max(1, Math.ceil(dist / SUBSTEP));
    for (let i = 0; i < n; i++) {
      P.x += this.vx * dt / n; P.z += this.vz * dt / n;
      this._collideWorld();
      this._collideNpcs();
      this._collideCreatures();
    }
    const b = this.ctx.playBounds;
    if (b) {
      if (P.x < b.x0 + 2 || P.x > b.x1 - 2) { P.x = clamp(P.x, b.x0 + 2, b.x1 - 2); this.vx *= -0.2; }
      if (P.z < b.z0 + 2 || P.z > b.z1 - 2) { P.z = clamp(P.z, b.z0 + 2, b.z1 - 2); this.vz *= -0.2; }
    }
    this._sampleGround();
    this._suspension(dt);
    this._engine(dt);
  }

  // motor: rotação pela marcha (ou acelerando parado), troca automática, afogado na água
  _engine(dt) {
    const sp = Math.abs(this.vLong);
    if (this.crankT > 0) {
      this.crankT -= dt;
      this.rpm = 180 + Math.sin(this.crankT * 60) * 40;
      if (this.crankT <= 0) {
        if (this.water > WATER_START) { this.hud.toast('O MOTOR NÃO PEGA NA ÁGUA'); this.rpm = 0; }
        else { this.engine = true; this.flooded = false; this.rpm = 1500; this._puff(1.4); }
      }
      return;
    }
    if (!this.engine) { this.rpm = Math.max(0, this.rpm - dt * 2500); return; }
    if (this.water > WATER_FLOOD && !this.flooded) {
      this.flooded = true; this.engine = false;
      this.sound.stop(); this.hud.toast('O MOTOR AFOGOU');
      return;
    }
    if (this.reverse) this.gear = 0;
    let g = this.gear;
    const wheel = sp * GEARS[g];
    if (!this.reverse) {
      if (wheel > SHIFT_UP && g < GEARS.length - 1 && this.throttle > 0.1) { this.gear = ++g; this.sound.shift(); this._shiftDip = 0.25; }
      else if (wheel < SHIFT_DOWN && g > 0) this.gear = --g;
    }
    // patinando, acelerando parado ou no ar: o motor sobe solto
    const free = IDLE + this.throttle * (this.air ? 3600 : sp < 2 ? 2600 : 900);
    const want = Math.max(IDLE + this.throttle * 400, sp * GEARS[this.gear], sp < 3 || this.air ? free * (sp < 3 ? 1 - sp / 3 : 1) : 0);
    this._shiftDip = Math.max(0, (this._shiftDip || 0) - dt);
    this.rpm += (Math.min(5200, want) * (1 - (this._shiftDip || 0) * 0.6) - this.rpm) * Math.min(1, dt * 7);
  }

  // ---------- batidas ----------
  // SAT entre o carro e uma caixa: devolve { n: [x, z] (da caixa para o carro), d, c: contato } ou null
  _sat(it, x, z, fx, fz, lx, lz, pad = 0) {
    const ux = [it.c, -it.s], uz = [it.s, it.c];
    const dx = x - it.x, dz = z - it.z;
    let best = Infinity, bn = null;
    for (const ax of [[fx, fz], [lx, lz], ux, uz]) {
      const rc = HL * Math.abs(fx * ax[0] + fz * ax[1]) + HW * Math.abs(lx * ax[0] + lz * ax[1]) + pad;
      const rb = it.hx * Math.abs(ux[0] * ax[0] + ux[1] * ax[1]) + it.hz * Math.abs(uz[0] * ax[0] + uz[1] * ax[1]);
      const dd = dx * ax[0] + dz * ax[1];
      const o = rc + rb - Math.abs(dd);
      if (o <= 0) return null;
      if (o < best) { best = o; bn = dd >= 0 ? ax : [-ax[0], -ax[1]]; }
    }
    // contato: a quina do carro mais enfiada na caixa (ou a da caixa mais enfiada no carro)
    const sf = Math.sign(-(bn[0] * fx + bn[1] * fz)) || 1, sl = Math.sign(-(bn[0] * lx + bn[1] * lz)) || 1;
    let cx = x + fx * HL * sf + lx * HW * sl, cz = z + fz * HL * sf + lz * HW * sl;
    const [ql, qz] = [(cx - it.x) * it.c - (cz - it.z) * it.s, (cx - it.x) * it.s + (cz - it.z) * it.c];
    if (Math.abs(ql) > it.hx + 0.05 || Math.abs(qz) > it.hz + 0.05) {
      const su = Math.sign(bn[0] * ux[0] + bn[1] * ux[1]) || 1, sw = Math.sign(bn[0] * uz[0] + bn[1] * uz[1]) || 1;
      cx = it.x + ux[0] * it.hx * su + uz[0] * it.hz * sw; cz = it.z + ux[1] * it.hx * su + uz[1] * it.hz * sw;
    }
    return { n: bn, d: best, cx, cz };
  }

  // círculo (centro, raio) contra o contorno do carro
  _circle(px, pz, r) {
    const P = this.pos, h = this.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const dx = px - P.x, dz = pz - P.z, dl = dx * fx + dz * fz, ds = dx * lx + dz * lz;
    if (Math.abs(dl) > HL + r || Math.abs(ds) > HW + r) return null;
    const ql = clamp(dl, -HL, HL), qs = clamp(ds, -HW, HW);
    let ex = ql - dl, es = qs - ds, d = Math.hypot(ex, es);
    if (d >= r) return null;
    let nl, ns, pen;
    if (d < 1e-5) {
      // o centro dentro do carro: sai pelo lado mais perto
      const al = HL - Math.abs(dl), as = HW - Math.abs(ds);
      if (al < as) { nl = -Math.sign(dl) || 1; ns = 0; pen = al + r; } else { nl = 0; ns = -Math.sign(ds) || 1; pen = as + r; }
    } else { nl = ex / d; ns = es / d; pen = r - d; }
    const cx = P.x + fx * ql + lx * qs, cz = P.z + fz * ql + lz * qs;
    return { n: [fx * nl + lx * ns, fz * nl + lz * ns], d: pen, cx, cz };
  }

  _collideWorld() {
    const P = this.pos, h = this.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const high = this.body.y + 1.4;
    for (const it of this.ctx.collision.near(P.x, P.z, 3.4)) {
      if (it === this.box || it.y0 >= high) continue;
      if (it.y1 <= this.pos.y + 0.3) continue;   // baixo: as rodas passam por cima
      if (it.walk && it.y1 <= this.pos.y + 0.32) continue;
      const hit = it.t === 'circle' ? this._circle(it.x, it.z, it.r) : this._sat(it, P.x, P.z, fx, fz, lx, lz);
      if (!hit) continue;
      P.x += hit.n[0] * hit.d; P.z += hit.n[1] * hit.d;
      const s = this._impulse(hit.n[0], hit.n[1], hit.cx, hit.cz, 0.18, 0.3);
      this._crash(s, hit.cx, hit.cz);
    }
  }

  // impulso no ponto de contato (n aponta do obstáculo para o carro); devolve a velocidade da batida
  _impulse(nx, nz, cx, cz, e = 0.18, fric = 0.3, k = 1) {
    const rx = cx - this.pos.x, rz = cz - this.pos.z, w = this.yawRate;
    const vcx = this.vx + w * rz, vcz = this.vz - w * rx;
    const vn = vcx * nx + vcz * nz;
    if (vn >= 0) return 0;
    const rn = rz * nx - rx * nz;
    const j = -(1 + e) * vn / (1 + rn * rn / INERTIA) * k;
    this.vx += j * nx; this.vz += j * nz;
    this.yawRate += rn * j / INERTIA * 0.75;
    const tx = -nz, tz = nx, vt = vcx * tx + vcz * tz, jt = clamp(-vt * 0.45, -fric * j, fric * j);
    this.vx += jt * tx; this.vz += jt * tz;
    return -vn;
  }

  _crash(s, cx, cz) {
    if (s < 1.2) return;
    if (this.time - (this._crashT ?? -9) < 0.12) return;
    this._crashT = this.time;
    if (s < 3) { this.sound.bump(s / 3); return; }
    const k = clamp((s - 3) / 12, 0, 1.3);
    this.sound.crash(k);
    this._shake(0.2 + k * 0.6);
    this.input.rumble(0.4 + k * 0.6, 0.6, 160 + k * 200);
    if (s > 4.5) this.damage = Math.min(100, this.damage + (s - 4.5) * 2.2);
    const y = this.body.y + 0.5;
    for (let i = 0; i < 6 + k * 10; i++) {
      this.effects.spawn({ p: _v.set(cx, y + Math.random() * 0.3, cz), v: _v2.set((Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5), life: 0.3 + Math.random() * 0.3, s0: 0.035, s1: 0.0, color: [1, 0.78, 0.35], grav: 9.8, bounce: 0.3, drag: 0.5 });
    }
    if (s > 6) this.ctx.scare?.(cx, cz, 18 + k * 20, 'crash');
  }

  _shake(k) { this.combat.shake = Math.max(this.combat.shake || 0, k); }

  // moradores: saem da frente; se não der, o carro para neles (sem machucar)
  _collideNpcs() {
    const P = this.pos, h = this.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const v = this.vLong, sp = Math.abs(v);
    for (const n of this.npcs.list) {
      if (n.hidden || !n.visible) continue;
      const dx = n.pos.x - P.x, dz = n.pos.z - P.z;
      if (Math.abs(dx) > 14 || Math.abs(dz) > 14 || Math.abs(n.pos.y - P.y) > 2) continue;
      const dl = dx * fx + dz * fz, ds = dx * lx + dz * lz;
      // no caminho: pula para o lado (o mais perto) antes do carro chegar
      if (sp > 1.5) {
        const ahead = (v > 0 ? dl : -dl) - HL, tti = ahead / sp;
        if (ahead > -0.6 && tti < 1.7 && Math.abs(ds) < HW + 1.3) {
          const side = Math.abs(ds) > 0.15 ? Math.sign(ds) : (n.id.charCodeAt(0) % 2 ? 1 : -1);
          const ax = lx * side, az = lz * side;
          const ok = n.dodgeCar?.(this.npcs, Math.atan2(ax, az), sp > 6);
          // não saiu (sentado, conversando, já pulou e voltou): freia
          if (!ok && n.fear <= 0.2 && tti < 1.1 && Math.abs(ds) < HW + 0.5) this._assist = 0.25;
        }
      }
      const r = 0.34 * Math.min(1.1, n.scale / 0.9 || 1) + (n.mode === 'sit' ? 0.15 : 0);
      const hit = this._circle(n.pos.x, n.pos.z, r);
      if (!hit) continue;
      if (sp < 1.6 && n.mode !== 'sit') {
        // devagar: empurra de leve (ele sai do caminho resmungando)
        n.pos.x -= hit.n[0] * hit.d; n.pos.z -= hit.n[1] * hit.d;
        n.dodgeCar?.(this.npcs, Math.atan2(-hit.n[0], -hit.n[1]), false);
      } else {
        P.x += hit.n[0] * hit.d; P.z += hit.n[1] * hit.d;
        const s = this._impulse(hit.n[0], hit.n[1], hit.cx, hit.cz, 0, 0.6, 1.2);
        if (s > 0.6) { this.sound.bump(Math.min(1, s / 4)); n.bumpedByCar?.(this.npcs, s); this._shake(0.12); }
      }
    }
  }

  // criaturas: atropela (as grandes seguram o carro); devagar, só empurra
  _collideCreatures() {
    for (const e of this.combat.enemies) {
      if (e.dead || e.removed || e.ghost || e.friendly || e.untargetable || !e.root?.visible) continue;
      const P = this.pos, dx = e.pos.x - P.x, dz = e.pos.z - P.z;
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
      const by = this.body.y;
      if (e.pos.y > by + 1.45 || e.pos.y + (e.height || 1) < by + 0.15) continue;
      const hit = this._circle(e.pos.x, e.pos.z, (e.radius || 0.45) * 0.9);
      if (!hit) continue;
      const nx = hit.n[0], nz = hit.n[1];
      const rx = hit.cx - P.x, rz = hit.cz - P.z;
      const vn = (this.vx + this.yawRate * rz) * nx + (this.vz - this.yawRate * rx) * nz, s = -vn;
      e._carT = e._carT || 0;
      if (s > 3 && e._carT <= 0) {
        e._carT = 0.6;
        const sp = this.speed || 1, dir = _v.set(this.vx / sp * 0.7 - nx * 0.3, 0.25, this.vz / sp * 0.7 - nz * 0.3).normalize();
        const dmg = (s - 2) * 0.62 * (e.heavy ? 0.4 : 1);
        e.damage?.(dmg, { kind: 'car', dir: dir.clone(), p: new THREE.Vector3(hit.cx, by + 0.6, hit.cz), knock: e.heavy ? 1.2 : Math.min(15, s * 0.95) });
        e.stun = Math.max(e.stun || 0, e.heavy ? 0.5 : 1.4);
        if (e.heavy) {
          P.x += nx * hit.d; P.z += nz * hit.d;
          this._impulse(nx, nz, hit.cx, hit.cz, 0.3, 0.3, 0.85);
          this.damage = Math.min(100, this.damage + s * 0.8);
          this.sound.crash(clamp(s / 14, 0.3, 1));
        } else {
          // o bicho voa; o carro perde um pouco
          this.vx *= 0.88; this.vz *= 0.88;
          this.yawRate += (Math.random() - 0.5) * 0.4;
        }
        this.sound.thud(clamp(s / 12, 0.4, 1.2));
        this._shake(0.25 + clamp(s / 20, 0, 0.5));
        this.input.rumble(0.7, 0.5, 200);
        this.combat.lastFight = 0;
      } else if (e.heavy || e.external) {
        P.x += nx * hit.d; P.z += nz * hit.d;
        this._impulse(nx, nz, hit.cx, hit.cz, 0.1, 0.4, 0.7);
      } else {
        e.pos.x -= nx * hit.d; e.pos.z -= nz * hit.d;
      }
    }
  }

  // ---------- entrar e sair ----------
  // a pé, perto do carro: ENTRAR (F / A / toque)
  findFocus() {
    this.focus = false;
    const P = this.player;
    if (P.vehicle || P.swimming || this.hidden || this.ctx.indoor || this.mode !== 'parked') return;
    const hit = this._circle(P.pos.x, P.pos.z, 1.3);
    if (!hit || Math.abs(P.pos.y - this.pos.y) > 1.2) return;
    this.focus = true;
  }

  enterHit(input) {
    const pressed = input.hit('KeyF', 'KeyE') || input.padHit('a') || this.touchHit;
    this.touchHit = false;
    if (!this.focus || !pressed) return false;
    input.eat('a');
    this.startApproach();
    return true;
  }

  // anda até a porta do motorista (dando a volta pela frente ou por trás) e entra
  startApproach() {
    const P = this.player, Pp = P.pos;
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const dx = Pp.x - this.pos.x, dz = Pp.z - this.pos.z, dl = dx * fx + dz * fz, ds = dx * lx + dz * lz;
    const path = [[Pp.x, Pp.z]];
    if (ds < 0.6) {
      // do outro lado: contorna pela ponta mais perto
      const end = dl > 0 ? HL + 0.75 : -HL - 0.75;
      path.push(this.world(ds < 0 ? -HW - 0.7 : HW + 0.7, end), this.world(HW + 0.75, end));
    }
    path.push(this.world(OUT.x + 0.05, OUT.z));
    this.mode = 'approach';
    this.anim = { t: 0, path };
    P.auto = { path, i: 1 };
  }

  _approach(dt) {
    const P = this.player, A = this.anim;
    A.t += dt;
    const end = A.path[A.path.length - 1], d = Math.hypot(P.pos.x - end[0], P.pos.z - end[1]);
    // mexeu no analógico: desiste
    const mv = this.input.move();
    if ((Math.hypot(mv.x, mv.y) > 0.5 && A.t > 0.25) || A.t > 6) { P.auto = null; this.mode = 'parked'; this.anim = null; return; }
    if (d < 0.35 || (P.auto && P.auto.i >= A.path.length - 1 && d < 0.6)) { P.auto = null; this.startEnter(); }
  }

  startEnter() {
    const P = this.player;
    P.auto = null; P.vehicle = this; P.speed = 0;
    this.mode = 'enter';
    this.anim = { t: 0, sound: {} };
    this.ch = P.ch;
    // de onde ele vem (para o corpo não pular): posição e rumo no espaço do carro
    const h = this.heading, dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    this.anim.x0 = dx * Math.cos(h) - dz * Math.sin(h);
    this.anim.z0 = dx * Math.sin(h) + dz * Math.cos(h);
    this.anim.yaw0 = wrapA(P.heading - h);
  }

  // dirigindo: F / A / SAIR. Correndo, freia antes
  startExit() {
    if (this.mode !== 'drive') return;
    this.mode = 'exit';
    this.anim = { t: 0, wait: 0, sound: {} };
  }

  // tira o jogador do carro na hora (morte, cena, teletransporte). place: põe ao lado do carro
  eject(place = true) {
    const P = this.player;
    if (P.vehicle !== this) return;
    P.vehicle = null; P.auto = null;
    this.mode = 'parked'; this.anim = null; this.ai = null;
    this.door = 0;
    if (this.engine) { this.engine = false; this.sound.stop(); }
    this.sound.horn(false);
    P.ch.root.rotation.set(0, P.heading, 0);
    if (place) {
      const [x, z] = this._exitSpot();
      P.place(x, z, this.heading);
    }
  }

  // onde o motorista desce: do lado da porta; preso num muro, do outro lado ou atrás
  _exitSpot() {
    for (const [lx, lz] of [[OUT.x, OUT.z], [-OUT.x, OUT.z], [0, -HL - 0.8], [0, HL + 0.8]]) {
      const [x, z] = this.world(lx, lz);
      let ok = true;
      for (const it of this.ctx.collision.near(x, z, 1.2)) {
        if (it === this.box || it.y1 < this.pos.y + 0.45) continue;
        if (it.t === 'circle' ? Math.hypot(x - it.x, z - it.z) < it.r + 0.35 : (() => { const dx = x - it.x, dz = z - it.z, a = dx * it.c - dz * it.s, b = dx * it.s + dz * it.c; return Math.abs(a) < it.hx + 0.35 && Math.abs(b) < it.hz + 0.35; })()) { ok = false; break; }
      }
      if (ok) return [x, z];
    }
    return this.world(OUT.x, OUT.z);
  }

  // ---------- quadro do motorista (Player.update chama enquanto ele está no carro) ----------
  ride(dt, camYaw, input) {
    const P = this.player, ch = P.ch;
    let ctl = null;
    if (this.mode === 'drive') {
      if (this.ai) ctl = this.ai(dt, this);
      else if (input) {
        ctl = this._controls(input);
        if (input.driveExit()) this.startExit();
        if (input.driveLights()) { this.lightsManual = !this.lightsOn; this.audio.tone?.(1400, 0.03, 'square', 0.02); }
        this.sound.horn(input.driveHorn());
        if (input.driveHorn()) this._honk();
      }
    } else this.sound.horn(false);
    if (this.mode === 'exit' && this.anim.t === 0 && this.speed > 1.2) ctl = { throttle: 0, brake: 1, steer: 0, hand: false, stop: true };
    this._step(dt, ctl);
    this._animate(dt);
    this._sync();
    // acabou de descer (_finishExit já o pôs em pé do lado de fora): posar de novo no banco
    // copiava a inclinação do carro para a raiz e ele ficava torto (ou virado para o lado errado)
    if (P.vehicle !== this) return { moving: false };
    // o corpo: parado sentado, depois a pose do banco por cima
    ch.update(dt, 0, true, false, { still: true, seated: true });
    this._pose();
    // o jogador "está" no banco (criaturas, moradores, câmera, minimapa)
    ch.root.getWorldPosition(P.pos);
    P.heading = this.heading;
    P.grounded = true; P.speed = 0; P.vel.set(0, 0, 0); P.swimming = false; P.wade = 0; P.waterY = null;
    ch.blob.scale.setScalar(0.001);
    return { moving: this.speed > 0.6 };
  }

  _honk() {
    if (this.time - (this._honkT ?? -9) < 0.5) return;
    this._honkT = this.time;
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    for (const n of this.npcs.list) {
      if (n.hidden || !n.visible) continue;
      const dx = n.pos.x - this.pos.x, dz = n.pos.z - this.pos.z, dl = dx * fx + dz * fz, ds = dx * lx + dz * lz;
      if (dl > 0 && dl < 14 && Math.abs(ds) < 3) n.dodgeCar?.(this.npcs, Math.atan2(lx * Math.sign(ds || 1), lz * Math.sign(ds || 1)), false);
    }
  }

  // linha do tempo de entrar e sair: porta, corpo, mãos, partida
  _animate(dt) {
    const A = this.anim;
    if (!A) return;
    const S = A.sound;
    const once = (k, fn) => { if (!S[k]) { S[k] = true; fn(); } };
    if (this.mode === 'enter') {
      A.t += dt;
      const t = A.t;
      this.door = t < 1.3 ? easeOut(seg(t, 0.12, 0.55)) : 1 - easeIn(seg(t, 1.3, 1.62));
      if (t > 0.12) once('open', () => this.sound.door(true));
      if (t > 1.62) once('close', () => { this.sound.door(false); this._shake(0.05); });
      if (t > 1.85) once('crank', () => { if (!this.engine) { this.crankT = 0.62; this.sound.crank(0.62); } });
      if (t > 1.75) {
        this.mode = 'drive'; this.anim = { t: 1.75, tail: true, sound: S };
        // as duas primeiras vezes: como dirigir
        if ((this.taught = (this.taught || 0) + 1) <= 2) this.hud.showHints(DRIVE_HINTS);
      }
    } else if (this.mode === 'drive' && A.tail) {
      // as mãos ainda indo para o volante
      A.t += dt;
      if (A.t > 1.85) once('crank', () => { if (!this.engine) { this.crankT = 0.62; this.sound.crank(0.62); } });
      if (A.t > 2.3) this.anim = null;
    } else if (this.mode === 'exit') {
      // correndo: freia primeiro
      if (A.t === 0 && this.speed > 1.2) { A.wait += dt; if (A.wait < 4) return; }
      A.t += dt;
      const t = A.t;
      if (t > 0.02) once('off', () => { if (this.engine) { this.engine = false; this.sound.stop(); } });
      this.door = t < 1.15 ? easeOut(seg(t, 0.28, 0.62)) : 1 - easeIn(seg(t, 1.18, 1.5));
      if (t > 0.28) once('open', () => this.sound.door(true));
      if (t > 1.5) once('close', () => { this.sound.door(false); this._shake(0.04); });
      if (t > 1.58) this._finishExit();
    }
  }

  _finishExit() {
    const P = this.player, [x, z] = this.world(OUT.x, OUT.z);
    P.vehicle = null;
    this.mode = 'parked'; this.anim = null;
    this.door = 0;
    P.ch.root.rotation.set(0, this.heading, 0);
    // em pé do lado da porta, de frente para onde o carro aponta (a câmera continua de onde estava)
    P.place(x, z, wrapA(this.heading + (this._exitYaw || 0)));
    if (this.stuck) this.hud.toast('DEPOIS UM COLONO PUXA O CARRO');
    this.onExit?.();
  }

  // pose do motorista em cada momento (espaço do carro, depois no mundo)
  _pose() {
    const ch = this.ch || this.player.ch, A = this.anim, mode = this.mode;
    // posição da raiz no carro (x, y, z), rumo, sentado, pernas dentro, abaixado, mãos
    let x = SEAT.x, y = FLOOR, z = SEAT.z, yaw = 0, k = 1, legs = 1, duck = 0;
    let hR = 1, hL = 1, doorHand = 0;   // mãos no volante; doorHand: mão esquerda na porta
    const gOut = this._groundLocal(OUT.x, OUT.z);
    if (mode === 'enter') {
      const t = A.t;
      // 0 → 0,45: na porta, abrindo; 0,45 → 0,88: vira, se curva e senta na beira da porta (a
      // cabeça ainda fora); 0,9 → 1,25: desliza para o banco já sentado e reclinado, a cabeça
      // abaixo do teto (curvar ali levantaria a cabeça: o tronco reclinado passaria pela vertical);
      // 1,25 → 1,62: puxa a porta
      const x0 = lerp(A.x0, OUT.x, ease(seg(t, 0, 0.35))), z0 = lerp(A.z0, OUT.z, ease(seg(t, 0, 0.35)));
      const e1 = ease(seg(t, 0.45, 0.85)), e2 = ease(seg(t, 0.9, 1.25));
      x = lerp(lerp(x0, EDGE.x, e1), SEAT.x, e2); z = lerp(lerp(z0, EDGE.z, e1), SEAT.z, e2);
      y = lerp(gOut, FLOOR, ease(seg(t, 0.5, 0.85)));
      yaw = lerp(lerp(A.yaw0, -Math.PI / 2, ease(seg(t, 0, 0.3))), 0, ease(seg(t, 0.45, 0.75)));
      k = ease(seg(t, 0.5, 0.85));
      legs = ease(seg(t, 0.92, 1.3));
      duck = Math.sin(Math.PI * seg(t, 0.45, 0.88));
      hR = ease(seg(t, 1.55, 1.85)); hL = ease(seg(t, 1.62, 1.95));
      doorHand = t < 0.6 ? Math.sin(Math.PI * seg(t, 0.05, 0.55)) : Math.sin(Math.PI * seg(t, 1.18, 1.66));
      this._exitYaw = 0;
    } else if (mode === 'drive' && A?.tail) {
      hR = ease(seg(A.t, 1.55, 1.85)); hL = ease(seg(A.t, 1.62, 1.95));
    } else if (mode === 'exit' && A) {
      const t = A.t;
      // 0 → 0,6: solta o volante e abre a porta; 0,4 → 0,8: pernas para fora e desliza sentado e
      // reclinado até a beira da porta; 0,82 → 1,15: se curva e levanta do lado de fora;
      // 1,15 → 1,55: fecha a porta
      const e1 = ease(seg(t, 0.45, 0.8)), e2 = ease(seg(t, 0.84, 1.12));
      x = lerp(lerp(SEAT.x, EDGE.x, e1), OUT.x, e2); z = lerp(lerp(SEAT.z, EDGE.z, e1), OUT.z, e2);
      y = lerp(FLOOR, gOut, ease(seg(t, 0.85, 1.1)));
      legs = 1 - ease(seg(t, 0.4, 0.75));
      k = 1 - ease(seg(t, 0.86, 1.14));
      duck = Math.sin(Math.PI * seg(t, 0.8, 1.2));
      yaw = lerp(0, 0.35, ease(seg(t, 1.1, 1.5)));
      hR = 1 - ease(seg(t, 0.0, 0.25)); hL = 1 - ease(seg(t, 0.05, 0.3));
      doorHand = t < 0.7 ? Math.sin(Math.PI * seg(t, 0.12, 0.66)) : Math.sin(Math.PI * seg(t, 1.12, 1.52));
      this._exitYaw = 0.35;
    }
    // raiz no mundo: transformação da carroceria × posição no banco
    this.bodyG.updateMatrixWorld(true);
    _q.setFromEuler(_e.set(0, yaw, 0));
    _m2.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    _m.multiplyMatrices(this.bodyG.matrixWorld, _m2);
    _m.decompose(ch.root.position, ch.root.quaternion, _v);
    ch.root.scale.setScalar(0.95);
    // pés: no chão de fora ou nos pedais, passando por cima da soleira
    const lift = Math.sin(Math.PI * legs) * 0.32;
    const feet = [-1, 1].map(s => {
      const out = [OUT.x + s * 0.11, gOut + 0.07, OUT.z + 0.04];
      const inn = [SEAT.x + s * 0.15, FLOOR + 0.1, SEAT.z + 0.66];
      const px = lerp(out[0], inn[0], legs), py = lerp(out[1], inn[1], legs) + lift, pz = lerp(out[2], inn[2], legs);
      // para o espaço da raiz (posição e rumo)
      const dx = px - x, dz = pz - z, c = Math.cos(yaw), sn = Math.sin(yaw);
      return [dx * c - dz * sn, py - y, dx * sn + dz * c, legs > 0.5 ? 0.25 : 0];
    });
    // mãos: aro do volante (10 e 2 horas) e a maçaneta da porta
    const W = this.model.steer, r = CAR.wheel.r;
    W.updateMatrixWorld(true);
    W.localToWorld(_hand[0].set(-0.86 * r, 0.5 * r, -0.02));
    W.localToWorld(_hand[1].set(0.86 * r, 0.5 * r, -0.02));
    const hands = [_hand[0], _hand[1]], handK = [hR, hL];
    if (doorHand > 0.01) {
      // a mão esquerda no ponto da porta mais perto do ombro: por fora, a face de fora (larga
      // quando a porta abre além do alcance); por dentro, a face de dentro (estica para puxar)
      const inside = x < 1.05, D = this.model.door;
      D.updateMatrixWorld(true);
      const sh = _p.copy(ch.root.position);
      sh.y += lerp(1.32, 0.78, k);
      sh.x += Math.cos(this.heading + yaw) * 0.18; sh.z -= Math.sin(this.heading + yaw) * 0.18;
      let best = Infinity;
      for (let q = 0.15; q <= 1.0; q += 0.05) {
        const pnt = D.localToWorld(_v2.set(inside ? -0.15 : 0.03, 0.84, -q)), d = pnt.distanceTo(sh);
        if (d < best) { best = d; _hand[2].copy(pnt); }
      }
      const K = doorHand * (inside ? 1 : clamp((0.9 - best) / 0.3, 0, 1));
      // com a mão ainda no volante, ela vai saindo dele até a porta
      if (K > 0.01) { const wk = handK[1]; hands[1] = wk > 0.01 ? _hand[3].copy(_hand[1]).lerp(_hand[2], K) : _hand[2]; handK[1] = Math.max(wk, K); }
    }
    if (k > 0.002 || legs > 0.002) {
      const P0 = SEAT_POSE;
      ch.seatPose({ k: Math.max(k, 0.0001), hips: P0.hips, lean: P0.lean, duck, feet, pole: [0, 0.75, 1], hands, handK, look: this._look() });
    } else {
      // em pé do lado de fora: só a mão na porta
      ch.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) if (handK[i] > 0.01 && hands[i]) ch.reach?.(i, hands[i], handK[i]);
    }
  }

  // altura do chão num ponto do carro, no espaço da carroceria (aprox.: sem a inclinação)
  _groundLocal(lx, lz) {
    const [x, z] = this.world(lx, lz);
    return this.ctx.groundAt(x, z, this.pos.y + 0.5) - this.body.y;
  }

  // para onde ele olha dirigindo: na direção da curva; de ré, por cima do ombro
  _look() {
    if (this.mode !== 'drive') return 0;
    if (this.reverse && Math.abs(this.vLong) > 0.3) return 1.25;
    return clamp(this.steer * 1.4, -0.6, 0.6);
  }

  // ---------- aparência ----------
  _sync() {
    const b = this.body, R = this.root;
    R.position.set(this.pos.x, b.y, this.pos.z);
    R.rotation.set(0, this.heading, 0);
    this.bodyG.rotation.set(b.p, 0, b.r);
    // rodas: cada uma no chão dela (com o limite da suspensão), girando e esterçando
    const sp = Math.sin(b.p), sr = Math.sin(b.r);
    for (let i = 0; i < 4; i++) {
      const w = this.model.wheels[i];
      const at = -w.z * sp + w.x * sr;
      w.turn.position.y = clamp(this.ground[i] - b.y, at - 0.16, at + 0.1) + CAR.wheelR;
      w.spinA = (w.spinA || 0) + this.vLong * (this._dt || 0) / CAR.wheelR;
      w.spin.rotation.x = w.spinA * w.dir;
      w.turn.rotation.y = w.front ? this.steer : 0;
    }
    this.model.steer.rotation.z = -this.steer * 7;
    this.model.door.rotation.y = CAR.doorOpen * this.door;
    // sombra de contato no chão
    this.model.blob.position.y = this.pos.y - b.y + 0.05;
    this.box && this.ctx.collision.moveBox(this.box, this.pos.x, this.pos.z, this.heading, b.y + 0.15, b.y + 1.38);
  }

  // ---------- quadro (main.js chama sempre, com ou sem motorista) ----------
  update(dt, state) {
    this._dt = dt;
    const P = this.player;
    if (P.vehicle === this && this.combat.dead) this.eject(true);
    if (this.mode === 'approach') this._approach(dt);
    // sem motorista: termina de parar (desceu com o carro andando devagar)
    if (!this.driving && (this.speed > 0.05 || this.air)) { this._step(dt, null); this._sync(); }
    else if (!this.driving) this._engine(dt);
    if (state === 'play' && !P.vehicle) this.findFocus(); else this.focus = false;
    this._lights(dt);
    this._fx(dt);
    this._audio(dt);
    this._recover(dt);
    for (const e of this.combat.enemies) if (e._carT > 0) e._carT -= dt;
  }

  // faróis acesos de noite, na neblina e na chuva (ou como o jogador mandar)
  _lights(dt) {
    const c = this.atmo?.cur || {}, dark = Math.max(c.night || 0, (c.lamps || 0) * 0.8, (c.rain || 0) * 0.7);
    const auto = dark > 0.35;
    if (this.lightsManual !== null && this._autoWas !== auto) this.lightsManual = null;
    this._autoWas = auto;
    const want = (this.engine || this.crankT > 0 || this.introLights) && (this.lightsManual ?? auto);
    this.lightsOn = want;
    this.lightK += ((want ? 1 : 0) - this.lightK) * Math.min(1, dt * (want ? 9 : 4));
    const L = this.lightK, M = this.model.mats;
    const flick = this.damage > 65 && Math.random() < 0.04 ? 0.4 : 1;
    M.headLens.uniforms.uEmissive.value.setRGB(1.2 * L * flick, 1.12 * L * flick, 0.92 * L * flick);
    this.brakeK += (((this.brake > 0.1 && this.engine) || this.hand ? 1 : 0) - this.brakeK) * Math.min(1, dt * 14);
    const tail = L * 0.5 + this.brakeK * 0.6;
    M.tailLens.uniforms.uEmissive.value.setRGB(0.95 * tail, 0.1 * tail, 0.07 * tail);
    // brilho e facho: mais fortes no escuro e na neblina
    const fogK = clamp(1 - U.uFogFar.value / 260, 0, 1);
    const night = clamp(dark, 0, 1);
    for (const s of this.headGlow) { s.scale.setScalar(0.18 + 0.62 * L * (0.35 + 0.65 * night)); s.material.opacity = L * (0.3 + 0.45 * night) * flick; s.visible = L > 0.01; }
    for (const s of this.tailGlow) { s.scale.setScalar(0.1 + 0.32 * tail * (0.4 + 0.6 * night)); s.material.opacity = Math.min(1, tail) * (0.25 + 0.5 * night); s.visible = tail > 0.01; }
    const bk = L * (0.015 + 0.035 * night + 0.06 * fogK) * flick;
    for (const b of this.beams) { b.material.color.setRGB(bk, bk * 0.95, bk * 0.8); b.visible = bk > 0.004; }
    // luz no chão: foco à frente (a luz 0 do shader, a mesma da lanterna) e o vermelho atrás
    if (this.atmo) {
      if (L > 0.05 && !this.hidden) {
        const [x, z] = this.world(0, 2.3), h = this.heading;
        const dy = -0.09 - this.body.p * 0.8;
        this.atmo.carLight = { x, y: this.body.y + 0.75, z, dx: Math.sin(h), dy, dz: Math.cos(h), k: L * flick };
        if (tail > 0.05) { const [rx, rz] = this.world(0, -3.0); this.atmo.light(rx, this.body.y + 0.6, rz, [0.7 * tail, 0.06 * tail, 0.04 * tail], 5.5, 2); }
      } else this.atmo.carLight = null;
    }
  }

  // fumaça do escapamento, derrapagem, poeira, água e o motor batido
  _fx(dt) {
    const E = this.effects, by = this.body.y, sp = this.speed, rnd = () => Math.random() - 0.5;
    if (this.engine) {
      this.exhT -= dt * (0.6 + this.throttle * 3);
      if (this.exhT <= 0) {
        this.exhT = 0.3;
        const [x, z] = this.world(-0.56, -2.8);
        const k = 0.35 + this.throttle * 0.4;
        E.spawn({ p: _v.set(x, by + 0.26, z), v: _v2.set(-this.vx * 0.2 + rnd() * 0.3, 0.25 + Math.random() * 0.2, -this.vz * 0.2 + rnd() * 0.3), life: 0.9, s0: 0.05, s1: 0.22, color: [0.42 * k + 0.2, 0.42 * k + 0.2, 0.44 * k + 0.22], drag: 1.5, grav: -0.3 });
      }
    }
    // marcas e fumaça de pneu (rodas de trás)
    const paved = this.surface === 'asphalt' || this.surface === 'concrete' || this.surface === 'sett' || this.surface === 'walk';
    for (let i = 0; i < 2; i++) {
      const w = this.model.wheels[2 + i], [x, z] = this.world(w.x, w.z), g = this.ground[2 + i];
      const mark = this.skid > 0.45 && this.air < 0.5 && sp > 1 && this.surface !== 'water';
      const cur = { x, y: g + 0.03, z };
      if (mark && this.skidPrev[i]) this.skids.add(this.skidPrev[i], cur, 0.22);
      this.skidPrev[i] = mark ? cur : null;
      if (mark && paved && Math.random() < dt * 14 * this.skid) E.spawn({ p: _v.set(x, g + 0.15, z), v: _v2.set(rnd() * 0.6, 0.4 + Math.random() * 0.4, rnd() * 0.6), life: 1.0, s0: 0.12, s1: 0.5, color: [0.62, 0.62, 0.63], drag: 1.6, grav: -0.4 });
      // poeira e torrões na terra e no capim
      if (!paved && this.surface !== 'water' && sp > 3 && Math.random() < dt * (sp * 0.7 + this.skid * 12)) {
        const c = this.surface === 'dirt' ? [0.45, 0.36, 0.25] : this.surface === 'leaves' ? [0.4, 0.28, 0.14] : [0.32, 0.3, 0.18];
        E.spawn({ p: _v.set(x, g + 0.1, z), v: _v2.set(-this.vx * 0.15 + rnd(), 0.6 + Math.random(), -this.vz * 0.15 + rnd()), life: 0.8, s0: 0.08, s1: 0.32, color: c, drag: 1.4, grav: 0.6 });
      }
    }
    // água: espirra nas rodas
    if (this.water > 0.04 && this.waterY != null && sp > 1.5) {
      this.splashT = (this.splashT || 0) - dt * sp;
      if (this.splashT <= 0) {
        this.splashT = 1.2;
        for (const w of this.model.wheels) { const [x, z] = this.world(w.x, w.z); E.splash(x, this.waterY, z, clamp(sp / 8, 0.3, 1.4)); }
        this.audio.splash?.(clamp(sp / 10, 0.3, 1));
      }
    }
    // motor batido: fumaça saindo do capô
    if (this.damage > 55 && (this.engine || this.damage > 85)) {
      this.smokeT -= dt * (this.damage > 85 ? 7 : 3);
      if (this.smokeT <= 0) {
        this.smokeT = 1;
        const [x, z] = this.world(rnd() * 0.6, 1.6 + rnd() * 0.4), dk = this.damage > 85 ? 0.18 : 0.45;
        E.spawn({ p: _v.set(x, by + 0.95, z), v: _v2.set(rnd() * 0.4 - this.vx * 0.3, 0.8 + Math.random() * 0.5, rnd() * 0.4 - this.vz * 0.3), life: 1.6, s0: 0.1, s1: 0.55, color: [dk, dk, dk + 0.02], drag: 1.2, grav: -0.5 });
      }
    }
  }

  // pufe do escapamento na partida
  _puff(k = 1) {
    const [x, z] = this.world(-0.56, -2.8);
    for (let i = 0; i < 6 * k; i++) this.effects.spawn({ p: _v.set(x, this.body.y + 0.26, z), v: _v2.set((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.5, -0.6 - Math.random()), life: 1.4, s0: 0.08, s1: 0.4, color: [0.55, 0.56, 0.6], drag: 1.3, grav: -0.25 });
  }

  _audio(dt) {
    const inside = this.driving && (this.mode === 'drive' || (this.mode === 'enter' && this.anim?.t > 1.6) || (this.mode === 'exit' && this.anim?.t < 0.3));
    this.sound.update(dt, {
      on: this.engine, crank: this.crankT, rpm: this.rpm, load: this.engine ? this.throttle : 0, speed: this.speed,
      skid: this.air > 0.5 ? 0 : this.skid, surface: this.air > 0.5 ? 'air' : this.surface, inside, x: this.pos.x, z: this.pos.z, rain: this.atmo?.cur?.rain || 0,
    });
    this.audio.setMuffle?.(inside ? 1 : 0);
  }

  // ---------- preso na água ----------
  // profundidade da água no meio do carro agora (0 fora do rio e nos interiores)
  _depth() {
    const wl = this.ctx.waterLevel?.(this.pos.x, this.pos.z);
    return wl == null ? 0 : Math.max(0, wl - this.pos.y);
  }

  // desligado onde o motor não pega: sozinho, o carro não sai mais dali
  get stuck() { return !this.engine && this.crankT <= 0 && this._depth() > WATER_START; }

  // o jogador veria este ponto? (perto, ou a meia distância e dentro da tela)
  _inView(x, z) {
    const P = this.player.pos, d = Math.hypot(P.x - x, P.z - z);
    if (d > 70) return false;
    if (d < 25) return true;
    const v = _v.set(x, this.ctx.groundAt(x, z, 1000) + 0.8, z).project(this.camera);
    return v.z <= 1 && v.z >= -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
  }

  // para onde o colono puxa o carro: a rua mais perto do rio; senão o último lugar onde ele
  // ficou parado no seco; senão uma rua perto do jogador
  _rescueSpot() {
    const g = this.lastGood, P = this.player.pos;
    return this._parkSpot(this.pos.x, this.pos.z, 0, 160)
      || (g && this._clearAt(g.x, g.z, g.h) ? [g.x, g.z, g.h] : null)
      || this._parkSpot(P.x, P.z, 30, 250);
  }

  _rescue([x, z, h]) {
    this.place(x, z, h);
    this.engine = false; this.flooded = false; this.crankT = 0;
    this.lastGood = { x, z, h }; this.goodT = 0;
  }

  // preso na água funda: um colono puxa o carro com o trator até a rua, quando o jogador não
  // está olhando (nem para o rio, nem para a rua aonde ele vai)
  _recover(dt) {
    if (this.ctx.indoor) return;
    if (this.water < 0.3 && this.air < 0.5 && this.speed < 0.5) {
      this.goodT += dt;
      if (this.goodT > 2 && this.surface !== 'water') { this.lastGood = { x: this.pos.x, z: this.pos.z, h: this.heading }; this.goodT = 0; }
    }
    if (this.driving || this.mode !== 'parked') return;
    if ((this._rescueT = (this._rescueT || 0) - dt) > 0) return;
    this._rescueT = 0.5;
    if (!this.stuck || this._inView(this.pos.x, this.pos.z)) return;
    const s = this._rescueSpot();
    if (!s || this._inView(s[0], s[1])) return;
    this._rescue(s);
    this.hud.toast('TIRARAM O CARRO DA ÁGUA');
  }

  // ---------- HUD ----------
  _screen(x, y, z, W, H) {
    const v = _v.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  }

  drawHud(g, W, H, device) {
    const k = H / 240;
    this.chip = null;
    if (!this.focus) return;
    const [x, z] = this.world(HW + 0.1, -0.1), s = this._screen(x, this.body.y + 1.5, z, W, H);
    if (!s) return;
    const label = 'ENTRAR NO CARRO', size = Math.round(10 * k);
    if (device === 'touch') {
      const sp = textSprite(label, Math.round(12 * k), FONT_UI, '#140c08', null, true);
      const w = Math.max(56 * k, sp.w + 16 * k), hh = 18 * k, cx = Math.round(s[0] - w / 2), cy = Math.round(s[1] - hh - 8 * k);
      g.globalAlpha = 0.85; g.fillStyle = '#f2c879'; g.fillRect(cx, cy, w, hh); g.globalAlpha = 1;
      g.strokeStyle = '#140c08'; g.lineWidth = 1; g.strokeRect(cx + 0.5, cy + 0.5, w - 1, hh - 1);
      drawText(g, label, cx + w / 2, cy + 3 * k, 12 * k, { align: 'center', color: '#140c08', shadow: null });
      this.chip = { x: cx, y: cy, w, h: hh };
      return;
    }
    const key = device === 'pad' ? 'A' : 'F';
    const sp = textSprite(label, size, FONT_UI, '#f4ead2', '#140c08', true);
    const kw = 11 * k, w = kw + 4 * k + sp.w + 4 * k, hh = 13 * k;
    const cx = Math.round(s[0] - w / 2), cy = Math.round(s[1] - hh - 6 * k);
    panel(g, cx, cy, w, hh, 0.7);
    g.fillStyle = device === 'pad' ? '#3c8a3c' : '#e9dcc0';
    g.fillRect(Math.round(cx + 2 * k), Math.round(cy + 2 * k), Math.round(kw - 2 * k), Math.round(hh - 4 * k));
    drawText(g, key, cx + 2 * k + (kw - 2 * k) / 2, cy + 1.5 * k, size, { align: 'center', color: device === 'pad' ? '#f4ead2' : '#140c08', shadow: null });
    drawText(g, label, cx + kw + 3 * k, cy + 1 * k, size, { color: '#f4ead2' });
  }

  // começo de capítulo: retomando, onde ficou; capítulo novo, onde foi deixado se for perto da
  // partida (senão, estacionado perto dela) e consertado (o protagonista cuida dele entre as noites)
  chapterStart(n, st, resume, saved) {
    this.mode = 'parked'; this.anim = null; this.ai = null; this.introLights = false;
    this.engine = false; this.crankT = 0; this.flooded = false;
    if (resume && saved && this.load(saved)) return;
    const near = saved && st && Math.hypot(saved.x - st.x, saved.z - st.z) < 90;
    if (saved && (near || !st) && this.load(saved)) { this.damage = 0; return; }
    this.damage = 0;
    if (st && !(st.x > INTERIOR_MIN)) this.parkNear(st.x, st.z);
  }

  // piloto automático por uma rota [{ x, z, s }] (s = distância acumulada): segue a linha e para no fim
  drive(route, o = {}) {
    const R = route, end = R[R.length - 1].s, vmax = o.speed ?? 12.5, dec = o.decel ?? 2.4;
    let k = 0;
    this.ai = (dt, car) => {
      // ponto da rota mais perto (procura para a frente)
      let best = Infinity;
      for (let i = k; i < Math.min(R.length, k + 25); i++) {
        const d = Math.hypot(R[i].x - car.pos.x, R[i].z - car.pos.z);
        if (d < best) { best = d; k = i; }
      }
      const s = R[k].s, left = end - s, v = car.vLong;
      const ld = Math.max(4.5, Math.abs(v) * 0.85);
      let j = k;
      while (j < R.length - 1 && R[j].s < s + ld) j++;
      const tx = R[j].x - car.pos.x, tz = R[j].z - car.pos.z;
      const a = wrapA(Math.atan2(tx, tz) - car.heading), dl = Math.hypot(tx, tz) || 1;
      const ang = Math.atan(2 * CAR.base * Math.sin(a) / dl), maxSt = 0.62 / (1 + Math.abs(v) / 9);
      const want = Math.min(vmax, Math.sqrt(2 * dec * Math.max(0, left - 0.4)));
      const err = want - v;
      // parou um pouco antes do fim (a freada é suave): chegou
      this._aiStall = Math.abs(v) < 0.3 && left < 3 ? (this._aiStall || 0) + dt : 0;
      const done = (left < 0.6 && Math.abs(v) < 0.4) || this._aiStall > 0.7;
      if (done && !this._aiDone) { this._aiDone = true; o.onArrive?.(); }
      // parado, sem pedal: o carro segura sozinho (o freio segurado engataria a ré)
      return { throttle: done ? 0 : clamp(err * 0.35, 0, 1), brake: done || Math.abs(v) < 0.5 ? 0 : clamp(-err * 0.6, 0, 1), steer: clamp(ang / maxSt, -1, 1), hand: false };
    };
    this._aiDone = false;
  }

  // ---------- salvar ----------
  // preso na água, o jogo guarda o carro já na rua (o colono puxa enquanto o jogo está fechado)
  serialize() {
    const [x, z, h] = (this.stuck && !this.driving && this._rescueSpot()) || [this.pos.x, this.pos.z, this.heading];
    return { x: +x.toFixed(2), z: +z.toFixed(2), h: +h.toFixed(3), dmg: Math.round(this.damage) };
  }

  load(o) {
    if (!o || !Number.isFinite(o.x)) return false;
    this.place(o.x, o.z, o.h || 0);
    this.damage = clamp(o.dmg || 0, 0, 100);
    // save antigo com o carro dentro do rio
    const s = this.stuck && this._rescueSpot();
    if (s) this._rescue(s);
    return true;
  }
}
