import * as THREE from 'three';
import { settings } from '../config.js';
import { AIM_DROP } from './camera.js';

// Mira assistida no controle e no toque (no teclado e mouse nada muda):
// - puxão: ao começar a mirar (L2 / MIRAR) a mira vai até o bicho mais perto do centro;
//   atirando sem mirar, trava no bicho à frente e o tiro vai nele;
// - atrito: com a mira sobre o alvo, a câmera gira mais devagar;
// - acompanhamento: a mira segue o bicho que anda (e o jogador que anda de lado);
// - puxão leve: perto do alvo, a mira escorrega até a esfera de acerto mais próxima
//   (a cabeça também é uma: dá para mirar nela);
// - desvio da bala: o tiro que passaria raspando vai no ponto de acerto mais perto.
// A força vem da opção MIRA ASSISTIDA (desligada, normal, forte).

// snap/hip: cone de busca (rad) ao mirar / ao atirar sem mirar · range: alcance (m) ·
// fr: atrito · track: quanto segue o alvo · pull/pullIn: puxão parado / com o analógico
// ou o dedo mexendo (1/s) · zone: tamanho da área de ajuda · magnet: folga da bala (rad)
const LEVELS = [null,
  { snap: 0.42, hip: 0.6, range: 40, fr: 0.45, track: 0.85, pull: 2, pullIn: 4.5, zone: 1, magnet: 0.05 },
  { snap: 0.65, hip: 0.85, range: 52, fr: 0.6, track: 1, pull: 3.5, pullIn: 8, zone: 1.5, magnet: 0.085 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
// ângulos como a câmera usa: giro da câmera que olha nessa direção e inclinação (para baixo > 0)
const yawOf = (x, z) => Math.atan2(-x, -z);
const pitchOf = (y, len) => Math.asin(clamp(-y / (len || 1), -1, 1));
// folga angular entre a direção f (unitária) e a esfera (p, r) vista de o; < 0 = dentro
function gapTo(o, f, p, r) {
  const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, d = Math.hypot(dx, dy, dz);
  if (d < 0.3) return { gap: Infinity, d };
  return { gap: Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / d, -1, 1)) - Math.asin(Math.min(1, r / d)), d };
}

export class AimAssist {
  // o: { targets, camera, tpc, los(o, p) → true se nada tapa a linha }
  constructor(o) {
    Object.assign(this, o);
    this.list = [];
    this.pool = []; this.np = 0;
    this.snap = null;          // puxão em andamento { X, can, p, t }
    this.track = null;         // onde o alvo estava no quadro anterior (visto da cabeça)
    this.cur = null;           // alvo sob a mira neste quadro
    this.seen = new WeakMap(); // linha de visão guardada por alvo
    this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._e = { y: 0, p: 0 };
  }

  // força: 0 desligada (e sempre no teclado e mouse), 1 normal, 2 forte
  level(input) { return input.lastDevice === 'keyboard' ? 0 : (settings.aimAssist ?? 1); }

  reset() { this.snap = null; this.track = null; this.cur = null; }

  _vec() { return (this.pool[this.np++] ||= new THREE.Vector3()); }

  // alvos possíveis: criaturas pelas esferas de acerto e, sem bicho por perto, o estande.
  // Só o que está à frente do jogador (um bicho entre a câmera e ele faria o tiro voltar).
  _collect() {
    this.np = 0;
    const L = this.list, h = this.tpc.target, fx = -Math.sin(this.tpc.yaw), fz = -Math.cos(this.tpc.yaw);
    const ahead = p => (p.x - h.x) * fx + (p.z - h.z) * fz > 0.3;
    L.length = 0;
    let near = false;
    for (const X of this.targets.extra || []) {
      if (X.dead || X.removed || X.friendly || X.untargetable) continue;
      const b = X.aimPoint?.();     // também atualiza as juntas do bicho
      if (!b || !ahead(b)) continue;
      const body = this._vec().copy(b), pts = [], sp = X.spheres ?? X.c?.spheres;
      if (sp?.length) {
        const sc = X.root?.scale?.x || 1;
        for (const S of sp) pts.push({ p: S.bone.localToWorld(this._vec().copy(S.off)), r: S.r * sc });
      } else pts.push({ p: body, r: X.radius || 0.4 });
      L.push({ X, can: false, body, pts });
      if (body.distanceToSquared(h) < 35 * 35) near = true;
    }
    if (!near) this.targets.aimPoints?.((T, x, y, z, r) => { const p = this._vec().set(x, y, z); if (ahead(p)) L.push({ X: T, can: true, body: p, pts: [{ p, r }] }); });
    return L;
  }

  // linha livre da cabeça do jogador até o alvo (guardada por 0,15 s)
  _visible(X, p) {
    const now = performance.now(), c = this.seen.get(X);
    if (c && now - c.t < 150) return c.v;
    const v = this.los(this.tpc.target, p);
    this.seen.set(X, { t: now, v });
    return v;
  }

  // quanto girar a câmera (giro, inclinação) para o centro da tela cair em p
  _err(o, p, fYaw, fPitch) {
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, e = this._e;
    e.y = wrapA(yawOf(dx, dz) - fYaw); e.p = pitchOf(dy, Math.hypot(dx, dy, dz)) - fPitch;
    return e;
  }

  // melhor alvo perto de onde a mira vai olhar e começa o puxão até ele;
  // kind: 'snap' (L2 / MIRAR) ou 'hip' (atirou sem mirar). Devolve o alvo ou null.
  pick(input, kind, range = 99) {
    const lv = LEVELS[this.level(input)];
    if (!lv) return null;
    const T = this.tpc, o = T.target, c0 = T.camPos, cone = lv[kind], maxD = Math.min(range, lv.range);
    // referência: de lado, o centro da tela como o jogador vê (da câmera); na altura, a
    // câmera já nivelada da mira (a câmera normal olha de cima), vista da cabeça
    const yaw = T.yaw, pitch = T.pitch - AIM_DROP + 0.06;
    let best = null, bs = Infinity;
    for (const c of this._collect()) {
      const p = c.body, dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.4 || d > (c.can ? Math.min(maxD, 25) : maxD)) continue;
      const k = c.can ? 0.5 : 1;
      const ay = Math.abs(wrapA(yawOf(p.x - c0.x, p.z - c0.z) - yaw)), ap = Math.abs(pitchOf(dy, d) - pitch);
      if (ay > cone * k || ap > (cone * 1.6 + 0.3) * k) continue;
      const s = Math.hypot(ay, ap * 0.6) + d * 0.006;
      if (s < bs && this._visible(c.X, p)) { bs = s; best = c; }
    }
    if (!best) return null;
    this.snap = { X: best.X, can: best.can, p: best.can ? best.body.clone() : null, t: 0 };
    this.track = null;
    return best.X;
  }

  // mirando, quadro a quadro (antes da câmera): puxão, atrito, acompanhamento e puxão leve.
  // Escreve na câmera: tpc.lookScale (atrito) e tpc.assistYaw / assistPitch (giro extra).
  update(dt, input) {
    const lv = LEVELS[this.level(input)], T = this.tpc;
    this.cur = null;
    if (!lv) { this.reset(); return; }
    const o = T.camPos, f = this.camera.getWorldDirection(this._f);
    // direção da mira sem o coice (ele volta sozinho)
    const fYaw = yawOf(f.x, f.z) - T.kickY, fPitch = Math.asin(clamp(-f.y, -1, 1)) + T.kickP;
    const l = input.look(), mv = input.move();
    const stick = Math.hypot(l.px, l.py), drag = Math.min(1, Math.hypot(l.mx, l.my) / 10);
    const inp = Math.max(stick, drag, Math.hypot(mv.x, mv.y) * 0.7);
    const list = this._collect();
    // puxão de começo: até o corpo do alvo escolhido; mexer forte na câmera cancela
    const S = this.snap;
    if (S) {
      S.t += dt;
      const p = S.can ? S.p : !S.X.dead && S.X.aimPoint?.();
      if (!p || S.t > 0.5 || (S.t > 0.08 && (stick > 0.7 || drag > 0.6))) this.snap = null;
      else {
        const e = this._err(o, p, fYaw, fPitch), k = 1 - Math.exp(-dt * 16);
        T.assistYaw += e.y * k; T.assistPitch += e.p * k;
        if (Math.hypot(e.y, e.p) < 0.012 && T.aim > 0.9) this.snap = null;
        this.track = null;
        return;
      }
    }
    // alvo sob a mira: menor folga (relativa à área de ajuda) até uma esfera de acerto
    let best = null, bp = null, bg = Infinity, bgap = 0, bd = 0;
    for (const c of list) {
      const dist = c.body.distanceTo(o);
      if (dist > lv.range + 5) continue;
      const zone = (c.can ? clamp(0.25 / dist, 0.012, 0.05) : clamp(0.55 / dist, 0.03, 0.14)) * lv.zone;
      for (const s of c.pts) {
        const { gap, d } = gapTo(o, f, s.p, s.r);
        if (gap / zone < bg) { bg = gap / zone; bgap = gap; best = c; bp = s; bd = d; }
      }
    }
    if (!best || bg >= 1 || !this._visible(best.X, best.body)) { this.track = null; return; }
    this.cur = best;
    const w = 1 - clamp(bg, 0, 1), wc = best.can ? 0.5 : 1;
    // atrito: sobre o alvo a câmera gira mais devagar
    T.lookScale = 1 - lv.fr * w * wc;
    // acompanhamento: quanto o alvo andou (visto da cabeça do jogador) desde o quadro anterior
    if (!best.can) {
      const h = T.target, b = best.body, dx = b.x - h.x, dy = b.y - h.y, dz = b.z - h.z;
      const ty = yawOf(dx, dz), tp = pitchOf(dy, Math.hypot(dx, dy, dz)), tr = this.track;
      if (tr && tr.X === best.X) {
        const g = lv.track * Math.min(1, 0.3 + w * 1.5);
        T.assistYaw += clamp(wrapA(ty - tr.yaw), -0.08, 0.08) * g;
        T.assistPitch += clamp(tp - tr.pitch, -0.08, 0.08) * g;
      }
      this.track = { X: best.X, yaw: ty, pitch: tp };
    } else this.track = null;
    // puxão leve até a esfera mais perto, mais forte com o analógico ou o dedo mexendo
    if (bgap > 0) {
      const e = this._err(o, bp.p, fYaw, fPitch), m = Math.hypot(e.y, e.p) || 1;
      const frac = Math.max(0, 1 - Math.asin(Math.min(1, bp.r / bd)) * 0.6 / m);
      const k = (1 - Math.exp(-dt * (lv.pull + lv.pullIn * inp))) * frac * wc;
      T.assistYaw += e.y * k; T.assistPitch += e.p * k;
    }
  }

  // direção do tiro saindo de o na direção f: no alvo travado (tiro sem mirar) ou, se a
  // bala passaria raspando, no ponto de acerto mais perto. null = segue a mira.
  shotDir(input, o, f, lock, range) {
    const lv = LEVELS[this.level(input)];
    if (!lv) return null;
    const list = this._collect();
    if (lock) {
      const c = list.find(c => c.X === lock);
      if (c && c.body.distanceTo(o) < range + 3 && this._visible(c.X, c.body)) return this._u.copy(c.body).sub(o).normalize();
    }
    // o raio já pega num alvo (cabeça, asa...): vai onde está mirado
    if (this.targets.raycast(o, f, range)) return null;
    let best = null, bg = Infinity;
    for (const c of list) {
      const cone = c.can ? lv.magnet * 0.6 : lv.magnet;
      for (const s of c.pts) {
        const { gap, d } = gapTo(o, f, s.p, s.r);
        if (d > Math.min(range, 50) || gap >= cone || gap / cone >= bg) continue;
        bg = gap / cone; best = { c, s };
      }
    }
    if (!best || !this._visible(best.c.X, best.c.body)) return null;
    return this._u.copy(best.s.p).sub(o).normalize();
  }
}
