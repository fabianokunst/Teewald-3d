import * as THREE from 'three';
import { Character } from './character.js';
import { makeHeroTexture } from './heroTexture.js';
import { ps1Material, G } from '../engine/ps1material.js';
import { CollisionWorld } from '../engine/collision.js';
import { pointInPoly } from '../world/geo.js';
import { NPC_DEFS, GENERIC } from './npcData.js';
import { makeHat, makeHair, makeSkirt, makeItem, makeLine, makeThermos, makeStall } from './npcModels.js';
import { Dialogue } from '../ui/dialogue.js';
import { drawText, textSprite, panel, FONT_UI } from '../ui/overlay.js';

// Moradores de Teewald: andam pelo calçadão e pela praça, sentam nos bancos,
// pescam, vendem cuca... Chegando perto, cumprimentam e soltam comentários;
// com F / A / toque em FALAR abre a conversa. Tiro por perto assusta (agacham e
// fogem), arma apontada faz levantar as mãos. Ninguém se machuca.

const TAU = Math.PI * 2;
const TALK_R = 2.4;
const SIM_R = 140;          // além disso o morador fica parado (ninguém vê)
const UP = new THREE.Vector3(0, 1, 0);
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ponto livre para um morador (sem obstáculo, prédio ou água num raio r)
function clearAt(ctx, x, z, r) {
  const T = ctx.terrain;
  if (T.waterAt(x, z) || ctx.zones.insideBuilding(x, z, 0.2)) return false;
  const y = ctx.groundAt(x, z, T.heightAt(x, z) + 1);
  for (const it of ctx.collision.near(x, z, r + 2)) {
    if (it.walk || it.y1 < y + 0.25 || it.y0 > y + 1.8) continue;
    if (it.t === 'circle') { if (Math.hypot(x - it.x, z - it.z) < it.r + r) return false; continue; }
    const [lx, lz] = CollisionWorld.local(it, x, z);
    if (Math.hypot(Math.max(0, Math.abs(lx) - it.hx), Math.max(0, Math.abs(lz) - it.hz)) < r) return false;
  }
  return true;
}

// pontos de referência para posicionar os moradores (usados em npcData.js)
function makeSpots(ctx) {
  const L = ctx.landmarks, cd = L.calcadao, path = cd.path, n = path.length;
  const i0 = Math.floor(n * 0.72);      // onde o jogo começa (main.js: setupStart)
  const nearest = (arr, x, z) => {
    let b = null, bd = Infinity;
    for (const p of arr) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = p; } }
    return b;
  };
  const frame = (x, z, rot) => { const c = Math.cos(rot), s = Math.sin(rot); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };
  const free = (x, z, r = 0.45, max = 6) => {
    for (let d = 0; d <= max; d += 0.35) {
      const steps = d === 0 ? 1 : Math.ceil(d * 6);
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * TAU, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (clearAt(ctx, px, pz, r)) return [px, pz];
      }
    }
    return [x, z];
  };
  const used = new Set();
  const S = {
    ctx, L, i0, i0x: path[i0][0], i0z: path[i0][1], frame, free,
    face: (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]),
    // calçadão a `di` pontos do início (negativo = rumo à praça);
    // t: -1 beira do rio, 0 caminho, +1 lado da avenida
    calc(di, t = 0) {
      const i = clamp(i0 + di, 1, n - 2), p = path[i], a = path[i + 1], b = path[i - 1];
      const bk = nearest(cd.bank, p[0], p[1]), ed = nearest(cd.edge, p[0], p[1]);
      const q = t < 0 ? bk : ed, k = Math.abs(t);
      return {
        x: p[0] + (q[0] - p[0]) * k, z: p[1] + (q[1] - p[1]) * k,
        along: Math.atan2(b[0] - a[0], b[1] - a[1]), river: Math.atan2(bk[0] - p[0], bk[1] - p[1]),
      };
    },
    nearestCalc(x, z) {
      let bi = 0, bd = Infinity;
      path.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; bi = i; } });
      return bi - i0;
    },
    route(di0, di1, t = 0, step = 2) {
      const pts = [];
      for (let d = di0; d <= di1; d += step) { const p = S.calc(d, t); pts.push(free(p.x, p.z, 0.35, 2)); }
      return pts;
    },
    routeF: (f0, f1, t) => S.route(Math.round(f0 * n) - i0, Math.round(f1 * n) - i0, t),
    church(lx, lz) { const c = L.church; return frame(c.x, c.z, c.rot)(lx, lz); },
    // banco (ou parada de ônibus) livre mais perto
    seat(x, z, kind, poly) {
      let best = null, bd = Infinity;
      for (const s of ctx.seats || []) {
        if (s.kind !== kind || used.has(s) || (poly && !pointInPoly(s.x, s.z, poly))) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) used.add(best);
      return best;
    },
    phone(x, z) { const p = nearest((ctx.phones || []).map(q => [q.x, q.z, q]), x, z); return p && Math.hypot(p[0] - x, p[1] - z) < 60 ? p[2] : null; },
    building: re => [...(L.specials || []), ...ctx.buildings].find(b => typeof b.sign === 'string' && re.test(b.sign)),
    // na calçada em frente ao prédio, olhando para a rua
    front(b) {
      const q = ctx.roads.index.nearest(b.x, b.z, d => d.rank >= 2);
      let dx = 0, dz = 1;
      if (q.seg) {
        const s = q.seg, px = s.ax + (s.bx - s.ax) * q.t, pz = s.az + (s.bz - s.az) * q.t, l = Math.hypot(px - b.x, pz - b.z) || 1;
        dx = (px - b.x) / l; dz = (pz - b.z) / l;
      }
      let d = 0.5;
      while (d < 40 && ctx.zones.insideBuilding(b.x + dx * d, b.z + dz * d, 0.3)) d += 0.5;
      const [x, z] = free(b.x + dx * (d + 1.4), b.z + dz * (d + 1.4), 0.45, 3);
      return [x, z, Math.atan2(dx, dz)];
    },
    near(x, z) { const [px, pz] = free(x, z); return [px, pz, 0]; },
    // banca da praça: entre o centro e a borda, do lado da igreja
    stallSpot() {
      const pr = L.praca, [cx, cz] = pr.c;
      const toChurch = Math.atan2(L.church.x - cx, L.church.z - cz);
      for (let k = 0; k < 16; k++) {
        const a = toChurch + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
        const ux = Math.sin(a), uz = Math.cos(a);
        let edge = 0;
        while (edge < 60 && pointInPoly(cx + ux * edge, cz + uz * edge, pr.poly)) edge += 0.5;
        for (const f of [0.6, 0.5, 0.7]) {
          const x = cx + ux * edge * f, z = cz + uz * edge * f;
          const rot = Math.atan2(-ux, -uz), back = frame(x, z, rot)(0, -0.72);
          if (clearAt(ctx, x, z, 1.15) && clearAt(ctx, back[0], back[1], 0.45)) return { x, z, rot };
        }
      }
      const [x, z] = free(cx + 7, cz, 1.1);
      return { x, z, rot: Math.atan2(cx - x, cz - z) };
    },
    // calçada de uma rua (o lado com menos obstáculos), `len` metros em volta de (x, z)
    sidewalk(name, x, z, len) {
      let best = null, bd = Infinity;
      for (const r of ctx.roads.list) {
        if (r.name !== name || !r.sidewalk) continue;
        r.pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = { r, i }; } });
      }
      if (!best) return [];
      const { r, i } = best, P = r.pts, half = Math.round(len / 2 / 2.5);
      const sides = [1, -1].map(side => {
        const pts = [];
        for (let j = Math.max(1, i - half); j <= Math.min(P.length - 2, i + half); j++) {
          const tx = P[j + 1][0] - P[j - 1][0], tz = P[j + 1][1] - P[j - 1][1], l = Math.hypot(tx, tz) || 1;
          const px = P[j][0] - tz / l * (r.hw + 1) * side, pz = P[j][1] + tx / l * (r.hw + 1) * side;
          if (clearAt(ctx, px, pz, 0.35)) pts.push([px, pz]);
        }
        return pts;
      });
      return sides[0].length >= sides[1].length ? sides[0] : sides[1];
    },
    // beira do campo de futebol, olhando para o gramado
    sideline() {
      const f = L.field, poly = f.poly, [cx, cz] = f.c;
      let bestL = 0, ang = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l > bestL) { bestL = l; ang = Math.atan2(b[0] - a[0], b[1] - a[1]); }
      }
      const px = Math.cos(ang), pz = -Math.sin(ang);
      let m = 0;
      for (const p of poly) m = Math.max(m, (p[0] - cx) * px + (p[1] - cz) * pz);
      const [x, z] = free(cx + px * (m + 2.5) + Math.sin(ang) * 8, cz + pz * (m + 2.5) + Math.cos(ang) * 8);
      return [x, z, Math.atan2(cx - x, cz - z)];
    },
  };
  return S;
}

class NPC {
  constructor(def, sys) {
    const { M, scene } = sys;
    this.def = def; this.id = def.id;
    this.ch = new Character(M, ps1Material({ map: makeHeroTexture(def.look) }));
    const s = 0.95 * (def.kid ? 0.62 : def.look.female ? 0.95 : 1), b = def.bulk || 1;
    this.scale = s;
    this.ch.root.scale.set(s * b, s, s * b);
    if (def.kid) this.ch.head.scale.setScalar(1.3);
    if (def.look.female) for (const a of this.ch.arms) a.sh.position.x *= 0.93;
    this.ch.blob.scale.setScalar(s * b);
    scene.add(this.ch.root, this.ch.blob);
    const hairMid = def.look.colors?.hair?.[1] || [206, 166, 100];
    if (def.hat) this.ch.head.add(makeHat(def.hat[0], def.hat[1], M));
    if (def.hair) this.ch.head.add(makeHair(def.hair, hairMid, M));
    if (def.skirt) this.ch.hips.add(makeSkirt(def.skirt.color, def.skirt.len ?? (def.skirt.long ? -0.66 : -0.46), M, def.skirt.apron));
    if (def.item) { this.item = makeItem(def.item, M, def.itemColor); this.item.scale.setScalar(s); scene.add(this.item); }
    if (def.item === 'vara') { this.line = makeLine(M); scene.add(this.line.group); }
    // mão que segura o objeto: cuia, caneca e bola na esquerda, o resto na direita
    this.itemArm = ['cuia', 'caneca', 'bola', 'livro', 'sacola', 'cesta'].includes(def.item) && def.pose !== 'cane' ? 1 : 0;
    if (def.pose === 'phone') this.itemArm = 1;

    this.pos = new THREE.Vector3();
    this.heading = 0; this.speed = 0; this.t = Math.random() * 10;
    this.talkIdx = 0; this.talking = false; this.afterTalk = 0;
    this.flinch = 0; this.fear = 0; this.aimedT = 0; this.handsT = 0; this.waveT = 0;
    this.bark = null; this.barkT = 4 + Math.random() * 10; this.greeted = false; this.gunNoted = false;
    this.pause = 0; this.wait = 0; this.stuck = 0; this.sip = 6 + Math.random() * 6;
    this.w = { pose: 1, sit: 0, talk: 0, wave: 0, hands: 0, flinch: 0, look: 0 };
    this.dist = 999; this.visible = true;
  }

  get mobile() { return this.mode !== 'sit'; }
  get busy() { return this.talking || this.flinch > 0 || this.handsT > 0; }

  place(spec, sys) {
    const ctx = sys.ctx;
    this.mode = spec.mode;
    if (spec.mode === 'sit' && !spec.seat) { spec = { mode: 'stand', x: sys.S.i0x + 3, z: sys.S.i0z, h: 0 }; this.mode = 'stand'; }
    if (spec.mode === 'sit') {
      const st = this.seat = spec.seat, at = sys.S.frame(st.x, st.z, st.rot);
      const [x, z] = at(this.def.thermos ? -0.3 : 0, 0.02);
      this.pos.set(x, st.y, z);
      this.heading = this.home = st.rot;
      if (this.def.thermos) {
        const th = makeThermos(sys.M), [tx, tz] = at(0.42, -0.04);
        th.position.set(tx, st.y + st.seat, tz);
        sys.scene.add(th);
      }
    } else if (spec.mode === 'stand') {
      this.homePos = [spec.x, spec.z];
      this.home = spec.h;
      this.heading = spec.h;
      this.pos.set(spec.x, ctx.groundAt(spec.x, spec.z, ctx.terrain.heightAt(spec.x, spec.z) + 1), spec.z);
    } else if (spec.mode === 'route') {
      this.pts = spec.pts; this.speedBase = spec.speed;
      this.ri = Math.floor(Math.random() * this.pts.length); this.dir = Math.random() < 0.5 ? 1 : -1;
      const p = this.pts[this.ri];
      this.pos.set(p[0], ctx.groundAt(p[0], p[1], ctx.terrain.heightAt(p[0], p[1]) + 1), p[1]);
    } else if (spec.mode === 'wander') {
      this.poly = spec.poly; this.speedBase = spec.speed; this.rest = spec.rest || [1, 4];
      const p = this._randomIn(sys) || sys.S.L.praca.c;
      this.pos.set(p[0], ctx.groundAt(p[0], p[1], ctx.terrain.heightAt(p[0], p[1]) + 1), p[1]);
      this.heading = Math.random() * TAU;
    } else if (spec.mode === 'follow') {
      this.leaderId = spec.leader; this.off = spec.off;
    }
    if (spec.stall) {
      const st = spec.stall, y = ctx.groundAt(st.x, st.z, ctx.terrain.heightAt(st.x, st.z) + 1);
      const m = makeStall(sys.M, st.text);
      m.position.set(st.x, y, st.z); m.rotation.y = st.rot;
      sys.scene.add(m);
      ctx.collision.addBox(st.x, st.z, 0.88, 0.38, st.rot, y, y + 0.9, { cam: false });
    }
  }

  _randomIn(sys) {
    const poly = this.poly;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    for (let k = 0; k < 30; k++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      if (pointInPoly(x, z, poly) && clearAt(sys.ctx, x, z, 0.5)) return [x, z];
    }
    return null;
  }

  say(text, sys, dur = 3.2) {
    if (!text) return;
    this.bark = { text, t: 0, dur };
    sys.barkCool = 1.4;
  }

  // a próxima conversa (com um comentário sobre a arma na primeira vez que ela aparece)
  nextTalk(sys) {
    if (this.fear > 0) return [pick(GENERIC.afraid)];
    const lines = [...this.def.talks[this.talkIdx++ % this.def.talks.length]];
    if (sys.pistol?.equipped && !this.gunNoted) { this.gunNoted = true; lines.unshift(this.def.gun || pick(GENERIC.gun)); }
    return lines;
  }

  scare(sys) {
    if (this.talking) return;
    this.flinch = 0.8 + Math.random() * 0.4;
    this.fear = this.mobile ? 5 + Math.random() * 2 : 4;
    this.pause = 0; this.wait = 0;
    if (this.mode === 'stand') this.returnTo = this.homePos;
    if (this.mode === 'route') this.returnTo = null;
  }

  update(dt, sys) {
    const ctx = sys.ctx, F = sys.focusPos;
    this.t += dt;
    const dx = F.x - this.pos.x, dz = F.z - this.pos.z;
    this.dist = Math.hypot(dx, dz);
    if (this.bark) { this.bark.t += dt; if (this.bark.t > this.bark.dur) this.bark = null; }
    if (this.dist > SIM_R && this.mode !== 'follow') { this._show(false); return; }
    for (const k of ['flinch', 'fear', 'aimedT', 'afterTalk', 'waveT']) this[k] = Math.max(0, this[k] - dt);
    if (this.aimedT > 0) this.handsT = Math.max(this.handsT, 0.9); else this.handsT = Math.max(0, this.handsT - dt);
    if (this.handsT <= 0) this.aimBarked = false;
    const play = sys.mode === 'play';
    const toPlayer = Math.atan2(dx, dz);

    // ---------- para onde ir ----------
    let tx = null, tz = null, speed = 0;
    if (this.busy) { /* parado */ }
    else if (this.fear > 0 && this.mobile && this.flinch <= 0) {
      const l = this.dist || 1;
      tx = this.pos.x - dx / l * 6; tz = this.pos.z - dz / l * 6; speed = 4.3;
    } else if (this.returnTo) {
      [tx, tz] = this.returnTo; speed = 1.6;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.35) { this.returnTo = null; tx = null; }
    } else if (this.mode === 'route') {
      if (this.pause > 0) this.pause -= dt;
      else {
        const p = this.pts[this.ri];
        if (Math.hypot(p[0] - this.pos.x, p[1] - this.pos.z) < 0.9) {
          const nx = this.ri + this.dir;
          if (nx < 0 || nx >= this.pts.length) { this.dir *= -1; this.pause = 1.5 + Math.random() * 3; }
          else this.ri = nx;
        }
        const q = this.pts[this.ri];
        [tx, tz] = q; speed = this.speedBase;
      }
    } else if (this.mode === 'wander') {
      if (this.pause > 0) this.pause -= dt;
      else {
        if (!this.goal || Math.hypot(this.goal[0] - this.pos.x, this.goal[1] - this.pos.z) < 0.6) {
          if (this.goal) this.pause = this.rest[0] + Math.random() * (this.rest[1] - this.rest[0]);
          this.goal = this._randomIn(sys);
        }
        if (this.goal && this.pause <= 0) { [tx, tz] = this.goal; speed = this.speedBase; }
      }
    } else if (this.mode === 'follow' && this.leader) {
      const Ld = this.leader, c = Math.cos(Ld.heading), s = Math.sin(Ld.heading);
      const gx = Ld.pos.x + this.off[0] * c + this.off[1] * s, gz = Ld.pos.z - this.off[0] * s + this.off[1] * c;
      const d = Math.hypot(gx - this.pos.x, gz - this.pos.z);
      if (d > 0.25) { tx = gx; tz = gz; speed = clamp(Math.max(Ld.speed, 0.6) * (0.8 + d * 0.5), 0, 2.6); }
      else if (!Ld.busy && Ld.speed < 0.1) this.heading += wrapA(Ld.heading - this.heading) * Math.min(1, dt * 3);
    } else if (this.mode === 'stand' && this.homePos) {
      const [hx, hz] = this.homePos;
      if (Math.hypot(hx - this.pos.x, hz - this.pos.z) > 0.6) { tx = hx; tz = hz; speed = 1.4; }
    }

    // o jogador no caminho: espera, pede licença e, se não sair, dá meia-volta
    if (tx !== null && this.fear <= 0 && play) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const ahead = (dx * fx + dz * fz) / (this.dist || 1);
      if (this.dist < 1.25 && ahead > 0.45) {
        this.wait += dt;
        tx = null;
        if (this.wait > 1.0 && !this.excused && sys.barkCool <= 0) { this.excused = true; this.say(pick(GENERIC.excuse), sys, 2.2); }
        if (this.wait > 4) {
          this.wait = 0;
          if (this.mode === 'route') this.dir *= -1, this.ri = clamp(this.ri + this.dir, 0, this.pts.length - 1);
          if (this.mode === 'wander') this.goal = this._randomIn(sys);
        }
      } else { this.wait = 0; if (this.dist > 3) this.excused = false; }
    }

    this._move(dt, tx, tz, speed, sys);

    // ---------- para onde olhar parado ----------
    if (this.speed < 0.2) {
      let want = null;
      if (this.talking || this.handsT > 0 || this.afterTalk > 0 || (this.fear > 0 && !this.mobile)) want = toPlayer;
      else if (this.mode === 'stand' && !this.returnTo && this.home !== undefined) want = this.home;
      if (this.mode === 'sit') want = this.home;
      if (want !== null) this.heading += wrapA(want - this.heading) * Math.min(1, dt * 4);
    }

    // ---------- falas soltas ----------
    if (play && !this.talking) {
      if (this.dist < 4.5 && !this.greeted && this.fear <= 0 && sys.barkCool <= 0) {
        this.greeted = true; this.say(this.def.hi, sys, 2.6); this.waveT = 1.6;
      } else if (this.dist > 14) this.greeted = false;
      if (this.dist < 9) {
        this.barkT -= dt;
        if (this.barkT <= 0 && sys.barkCool <= 0 && !this.bark && this.fear <= 0) {
          this.say(pick(this.def.barks), sys);
          this.barkT = 10 + Math.random() * 14;
        }
      }
    }

    // ---------- animação ----------
    const far = G.uFogFar.value + 12;
    this._show(this.dist < far);
    if (!this.visible) return;
    this.ch.update(dt, this.speed, true, this.speed > 2.6);
    this._pose(dt, sys, toPlayer);
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.heading;
    this.ch.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
    this.ch.root.updateMatrixWorld(true);
    this._items(sys);
  }

  _show(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.ch.root.visible = this.ch.blob.visible = v;
    if (this.item) this.item.visible = v;
    if (this.line) this.line.group.visible = v;
  }

  _move(dt, tx, tz, speed, sys) {
    const ctx = sys.ctx, p = this.pos;
    if (tx === null) { this.speed = Math.max(0, this.speed - dt * 6); }
    else {
      const ddx = tx - p.x, ddz = tz - p.z, d = Math.hypot(ddx, ddz);
      const diff = wrapA(Math.atan2(ddx, ddz) - this.heading);
      this.heading += diff * Math.min(1, dt * (speed > 2.5 ? 8 : 5));
      const target = speed * clamp((Math.cos(diff) - 0.25) / 0.75, 0, 1) * clamp(d / 0.5, 0.3, 1);
      this.speed += clamp(target - this.speed, -dt * 6, dt * (speed > 2.5 ? 7 : 3));
    }
    if (this.speed < 0.01) { this.stuck = 0; return; }
    const ox = p.x, oz = p.z, step = this.speed * dt;
    p.x += Math.sin(this.heading) * step;
    p.z += Math.cos(this.heading) * step;
    ctx.collision.resolve(p, 0.28, 1.6);
    // não atravessa o jogador
    const P = sys.player.pos, ex = p.x - P.x, ez = p.z - P.z, e = Math.hypot(ex, ez), m = 0.62 * Math.min(1, this.scale / 0.9);
    if (sys.mode !== 'title' && e < m && e > 1e-4) { p.x = P.x + ex / e * m; p.z = P.z + ez / e * m; }
    const g = ctx.groundAt(p.x, p.z, p.y);
    if (ctx.isDeepWater(p.x, p.z, g) || g > p.y + 0.6) { p.x = ox; p.z = oz; }
    else p.y += (g - p.y) * Math.min(1, dt * 14);
    // empacou (quina de muro, árvore): troca de alvo
    const moved = Math.hypot(p.x - ox, p.z - oz);
    this.stuck = moved < step * 0.3 ? this.stuck + dt : Math.max(0, this.stuck - dt);
    if (this.stuck > 1.2) {
      this.stuck = 0;
      if (this.mode === 'route' && !this.returnTo) { this.ri = clamp(this.ri + this.dir, 0, this.pts.length - 1); }
      else if (this.mode === 'wander') this.goal = this._randomIn(sys);
      else if (this.returnTo && this.fear <= 0) { p.x = this.returnTo[0]; p.z = this.returnTo[1]; this.returnTo = null; }
    }
  }

  // poses por cima da animação de andar/parado do Character
  _pose(dt, sys, toPlayer) {
    const ch = this.ch, [Rr, Lf] = ch.arms, W = this.w, def = this.def, t = this.t;
    const ease = (k, on, rate = 6) => { W[k] += ((on ? 1 : 0) - W[k]) * Math.min(1, dt * rate); return W[k]; };
    const arm = (a, sx, sz, ex, k, hx = null) => {
      a.sh.rotation.x = lerp(a.sh.rotation.x, sx, k); a.sh.rotation.z = lerp(a.sh.rotation.z, sz, k);
      a.el.rotation.x = lerp(a.el.rotation.x, ex, k); if (hx !== null) a.hand.rotation.x = lerp(a.hand.rotation.x, hx, k);
    };
    const still = this.speed < 0.3;
    const speaking = this.talking && sys.dialogue.open && sys.dialogue.chars < sys.dialogue.pageText.length;

    // sentado: pernas dobradas, quadril no assento, mãos nas coxas
    if (this.mode === 'sit') {
      const sy = this.scale, hipsY = this.seat.seat / sy + 0.14, H = hipsY - 0.06;
      const th = Math.acos(clamp((H - 0.45) / 0.42, 0, 1));
      ch.hips.position.y = hipsY;
      ch.hips.rotation.y = 0; ch.spine.rotation.y = 0; ch.spine.rotation.x = -0.05;
      for (const l of ch.legs) { l.hip.rotation.x = -th; l.knee.rotation.x = th + 0.05; l.ankle.rotation.x = -0.05; }
      ch.legs[0].hip.rotation.z = 0.06; ch.legs[1].hip.rotation.z = -0.06;
      arm(Rr, -0.42, 0.06, -0.7, 1); arm(Lf, -0.42, -0.06, -0.7, 1);
    }

    // pose do ofício (some andando rápido ou com susto)
    const k = ease('pose', !this.busy && this.fear <= 0 && (still || ['cane', 'hold', 'fish'].includes(def.pose)) && !(this.talking && ['photo', 'phone', 'vendor', 'rake'].includes(def.pose)));
    this.photo = false;
    if (def.pose === 'fish') { arm(Rr, -0.95, -0.05, -0.5, k); arm(Lf, -0.72, -0.32, -0.85, k); }
    else if (def.pose === 'photo' && this.dist > 4.5) { arm(Rr, -1.35, 0.3, -1.8, k); arm(Lf, -1.35, -0.3, -1.8, k); ch.head.rotation.x = lerp(ch.head.rotation.x, 0.06, k); this.photo = k > 0.6; }
    else if (def.pose === 'hold') {
      this.sip -= dt;
      const sipping = this.sip < 0 && this.sip > -1.6;
      if (this.sip < -1.6) this.sip = 5 + Math.random() * 7;
      const s = (sipping && !this.talking) ? Math.min(1, Math.min(-this.sip, 1.6 + this.sip) * 3) : 0;
      arm(Lf, lerp(-0.32, -0.62, s), lerp(0.1, -0.28, s), lerp(-1.5, -2.25, s), k);
      if (s) ch.head.rotation.x = lerp(ch.head.rotation.x, -0.18, s);
    } else if (def.pose === 'cane') arm(Rr, -0.2, -0.12, -0.28, k);
    else if (def.pose === 'phone') { arm(Rr, -0.3, -0.42, -2.45, k, 0.3); ch.head.rotation.z = lerp(ch.head.rotation.z, -0.14, k); }
    else if (def.pose === 'vendor') { arm(Rr, -0.5, 0.12, -0.75, k); arm(Lf, -0.5, -0.12, -0.75, k); }
    else if (def.pose === 'rake') arm(Rr, -0.45, -0.12, -1.0, k);
    else if (def.pose === 'ball') arm(Lf, 0.05, 0.3, -1.15, k);
    else if (this.item && this.mode !== 'sit') {
      // objeto pendurado: braço um pouco aberto e balançando menos
      const a = ch.arms[this.itemArm];
      a.sh.rotation.x *= 0.5; a.sh.rotation.z += a.side * 0.12;
    }

    // conversa: gestos com o braço livre e cabeça acompanhando a fala
    const kt = ease('talk', speaking, 5);
    if (kt > 0.01) {
      const free = def.pose === 'fish' || def.pose === 'vendor' ? null : this.itemArm === 0 && this.item ? Lf : Rr;
      if (free) {
        const sd = free.side;
        arm(free, -0.38 + Math.sin(t * 2.3) * 0.2, sd * 0.1, -1.05 + Math.sin(t * 3.4) * 0.35, kt);
      }
      ch.head.rotation.x += Math.sin(t * 7) * 0.04 * kt;
    }
    // aceno de cumprimento (braço direito livre)
    const rFree = !['fish', 'photo', 'cane', 'rake', 'phone'].includes(def.pose) && !(this.item && this.itemArm === 0);
    const kw = ease('wave', this.waveT > 0 && rFree && !this.busy && this.mode !== 'sit' || (this.waveT > 0 && this.mode === 'sit' && rFree), 8);
    if (kw > 0.01) {
      arm(Rr, -0.25, -2.55, -0.35, kw);
      Rr.el.rotation.z = lerp(Rr.el.rotation.z, Math.sin(t * 11) * 0.45, kw);
    }
    // mãos para o alto (arma apontada)
    const kh = ease('hands', this.handsT > 0, 9);
    if (kh > 0.01) { arm(Rr, -2.75, -0.35, -0.35, kh); arm(Lf, -2.75, 0.35, -0.35, kh); }
    // susto: encolhe e protege a cabeça
    const kf = ease('flinch', this.flinch > 0, 12);
    if (kf > 0.01) {
      arm(Rr, -2.3, 0.5, -2.05, kf); arm(Lf, -2.3, -0.5, -2.05, kf);
      ch.spine.rotation.x = lerp(ch.spine.rotation.x, 0.42, kf);
      if (this.mode !== 'sit') {
        ch.hips.position.y -= 0.12 * kf;
        for (const l of ch.legs) { l.hip.rotation.x = lerp(l.hip.rotation.x, -0.45, kf); l.knee.rotation.x = lerp(l.knee.rotation.x, 0.85, kf); l.ankle.rotation.x = lerp(l.ankle.rotation.x, -0.35, kf); }
      }
    }
    // cabeça vira para o jogador quando ele chega perto
    const rel = wrapA(toPlayer - this.heading);
    const kl = ease('look', (this.dist < 6 && Math.abs(rel) < 2.0 && sys.mode !== 'title') || this.talking, 4);
    if (kl > 0.01) ch.head.rotation.y = lerp(ch.head.rotation.y, clamp(rel, -1.1, 1.1), kl);
  }

  // objetos de mão no mundo: seguem o punho e ficam de pé (exceto a vara)
  _items(sys) {
    if (!this.item) return;
    const v = sys._v, q = sys._q, hand = this.ch.arms[this.itemArm].hand;
    if (this.photo) this.ch.head.localToWorld(v.set(0, 0.12, 0.15));
    else hand.localToWorld(v.set(0, -0.075, 0.02));
    this.item.position.copy(v);
    this.item.quaternion.setFromAxisAngle(UP, this.heading);
    if (this.def.item === 'vara') {
      // vara inclinada para cima, para a frente; linha caindo da ponta até a água
      this.item.quaternion.multiply(q.setFromAxisAngle(sys._x, -0.6));
      const tip = sys._v2.set(0, 0, 2.5 * this.scale).applyQuaternion(this.item.quaternion).add(v);
      const w = sys.ctx.terrain.waterAt(tip.x, tip.z);
      const floor = w ? w.level : sys.ctx.terrain.heightAt(tip.x, tip.z);
      const len = Math.max(0.15, tip.y - floor + 0.04);
      this.line.group.position.copy(tip);
      this.line.line.scale.y = len;
      this.line.bob.position.y = -len + Math.sin(this.t * 1.7) * 0.015;
    }
  }
}

export class NPCs {
  // deps: { ctx, scene, M, audio, player, tpc, camera, pistol, R }
  constructor(deps) {
    Object.assign(this, deps);
    this.list = [];
    this.byId = {};
    this.S = makeSpots(this.ctx);
    this.dialogue = new Dialogue(this.audio);
    this.mode = 'title'; this.focusPos = this.player.pos;
    this.focus = null; this.talkNpc = null; this.camNpc = null; this.camK = 0; this.camSide = 1;
    this.barkCool = 0; this.lastRecoil = 0; this.touchTalk = false; this.chip = null;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._x = new THREE.Vector3(1, 0, 0);
    this._d = new THREE.Vector3();
    for (const def of NPC_DEFS) {
      try {
        const n = new NPC(def, this);
        n.place(def.spawn(this.S), this);
        this.list.push(n); this.byId[def.id] = n;
      } catch (e) { console.warn('Morador não posicionado:', def.id, e); }
    }
    for (const n of this.list) {
      if (n.mode !== 'follow') continue;
      n.leader = this.byId[n.leaderId];
      if (!n.leader) { n.mode = 'stand'; n.homePos = [n.pos.x, n.pos.z]; continue; }
      const L = n.leader.pos;
      n.pos.set(L.x + n.off[0], L.y, L.z + n.off[1]);
    }
    // toque no botão FALAR (o resto do toque continua com os controles do jogo)
    addEventListener('touchstart', e => {
      const c = this.chip;
      if (!c) return;
      for (const t of e.changedTouches) {
        const [x, y] = this.R.toInternal(t.clientX, t.clientY), pad = 6 * (this.R.H / 240);
        if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) this.touchTalk = true;
      }
    }, { passive: true });
    console.info('Teewald: moradores', this.list.length);
  }

  // mode: 'title' | 'intro' | 'play' | 'talk'
  update(dt, mode) {
    dt = Math.max(0, dt);   // o primeiro quadro pode vir com dt negativo
    this.mode = mode;
    this.focusPos = mode === 'title' ? this.camera.position : this.player.pos;
    this.barkCool = Math.max(0, this.barkCool - dt);
    if (mode === 'play') {
      // tiro: o coice da pistola salta para 1 a cada disparo
      const rec = this.pistol?.recoil ?? 0;
      if (rec > this.lastRecoil + 0.3) this._onShot();
      this.lastRecoil = rec;
      this._aimCheck();
    }
    for (const n of this.list) if (n.mode !== 'follow') n.update(dt, this);
    for (const n of this.list) if (n.mode === 'follow') n.update(dt, this);
    // quem está ao alcance para conversar
    this.focus = null;
    if (mode === 'play') {
      let bd = Infinity;
      const P = this.player, fx = Math.sin(P.heading), fz = Math.cos(P.heading);
      for (const n of this.list) {
        if (!n.visible || n.busy || (n.fear > 0 && n.mobile) || n.dist > TALK_R * (n.def.kid ? 0.85 : 1)) continue;
        const ex = n.pos.x - P.pos.x, ez = n.pos.z - P.pos.z;
        if ((ex * fx + ez * fz) / (n.dist || 1) < -0.3 && n.dist > 1.3) continue;
        if (Math.abs(n.pos.y - P.pos.y) > 1.2) continue;
        if (n.dist < bd) { bd = n.dist; this.focus = n; }
      }
    }
    if (!this.focus) this.chip = null;
    if (mode !== 'play') this.touchTalk = false;
  }

  _onShot() {
    let barks = 0;
    const near = this.list.filter(n => n.dist < 32).sort((a, b) => a.dist - b.dist);
    for (const n of near) {
      const was = n.fear > 0;
      n.scare(this);
      if (!was && barks < 2 && n.dist < 22) { barks++; n.say(n.def.scared || pick(GENERIC.scared), this, 2.8); }
    }
  }

  // arma apontada para alguém (raio da câmera passando perto do peito)
  _aimCheck() {
    const p = this.pistol;
    if (!p || !p.equipped || !p.aiming || p.aim < 0.6) return;
    const o = this.camera.position, d = this.camera.getWorldDirection(this._d), c = this._v;
    for (const n of this.list) {
      if (n.dist > 20 || !n.visible) continue;
      c.set(n.pos.x, n.pos.y + (n.mode === 'sit' ? 0.85 : 1.2) * n.scale, n.pos.z).sub(o);
      const t = c.dot(d);
      if (t < 0) continue;
      if (c.addScaledVector(d, -t).length() < 0.42 + 0.02 * t) {
        n.aimedT = 0.3;
        if (!n.aimBarked) { n.aimBarked = true; n.say(n.def.aimed || pick(GENERIC.aimed), this, 2.6); }
      }
    }
  }

  // empurra o jogador para fora dos moradores (depois do movimento dele)
  pushPlayer() {
    const P = this.player, p = P.pos;
    for (const n of this.list) {
      if (n.dist > 1.5 || !n.visible) continue;
      const ex = p.x - n.pos.x, ez = p.z - n.pos.z, e = Math.hypot(ex, ez), m = 0.6 * Math.min(1, n.scale / 0.9) + (n.mode === 'sit' ? 0.15 : 0);
      if (e >= m || e < 1e-4 || Math.abs(p.y - n.pos.y) > 1.4) continue;
      p.x = n.pos.x + ex / e * m; p.z = n.pos.z + ez / e * m;
      P.ch.root.position.x = p.x; P.ch.root.position.z = p.z;
      P.ch.blob.position.x = p.x; P.ch.blob.position.z = p.z;
    }
  }

  talkHit(input) {
    const hit = !!this.focus && (input.hit('KeyF') || input.padHit('a') || this.touchTalk);
    this.touchTalk = false;
    return hit;
  }

  startTalk() {
    const n = this.focus;
    if (!n) return;
    this.talkNpc = this.camNpc = n;
    n.talking = true; n.bark = null; n.pause = Math.max(n.pause, 0.5);
    this.dialogue.start(n.def.name, n.nextTalk(this), n.def.voice);
    this.player.aimYaw = null;
    if (this.tpc) this.tpc.aimWant = false;
    // câmera de conversa: do lado em que a câmera já está
    const p = this.player.pos, ux = n.pos.x - p.x, uz = n.pos.z - p.z, cam = this.camera.position;
    const mx = (p.x + n.pos.x) / 2, mz = (p.z + n.pos.z) / 2;
    this.camSide = (-uz * (cam.x - mx) + ux * (cam.z - mz)) >= 0 ? 1 : -1;
    this.audio.menuOk();
  }

  updateTalk(dt, input) {
    const n = this.talkNpc, P = this.player;
    if (!n) return 'close';
    const want = Math.atan2(n.pos.x - P.pos.x, n.pos.z - P.pos.z);
    P.heading += wrapA(want - P.heading) * Math.min(1, dt * 6);
    if (this.dialogue.update(dt, input) === 'close') {
      n.talking = false; n.afterTalk = 2.5; n.barkT = Math.max(n.barkT, 12);
      this.talkNpc = null;
      return 'close';
    }
    return null;
  }

  // enquadra jogador e morador de lado durante a conversa; devolve 0..1 (para as tarjas)
  applyCamera(dt) {
    const on = !!this.talkNpc;
    this.camK += ((on ? 1 : 0) - this.camK) * Math.min(1, dt * (on ? 3.2 : 4));
    if (!on && this.camK < 0.004) { this.camK = 0; return 0; }
    const n = this.camNpc, p = this.player.pos, cam = this.camera, ctx = this.ctx;
    const k = this.camK * this.camK * (3 - 2 * this.camK);
    let ux = n.pos.x - p.x, uz = n.pos.z - p.z;
    const sep = Math.hypot(ux, uz) || 1; ux /= sep; uz /= sep;
    const mx = (p.x + n.pos.x) / 2, mz = (p.z + n.pos.z) / 2;
    const my = (p.y + 1.45 + n.pos.y + (n.mode === 'sit' ? 1.0 : 1.45) * n.scale / 0.95) / 2;
    const px = -uz * this.camSide, pz = ux * this.camSide;
    let cx = px * (1.6 + sep * 0.55) - ux * 1.0, cy = 0.28, cz = pz * (1.6 + sep * 0.55) - uz * 1.0;
    let L = Math.hypot(cx, cy, cz);
    cx /= L; cy /= L; cz /= L;
    const hit = ctx.collision.raycast(mx, my, mz, cx, cy, cz, L + 0.3);
    if (hit < L + 0.3) L = Math.max(0.7, hit - 0.3);
    const tx = mx + cx * L, tz = mz + cz * L;
    const ty = Math.max(my + cy * L, ctx.terrain.heightAt(tx, tz) + 0.4);
    const t = this.tpc.target;
    cam.position.set(lerp(cam.position.x, tx, k), lerp(cam.position.y, ty, k), lerp(cam.position.z, tz, k));
    cam.lookAt(lerp(t.x, mx, k), lerp(t.y - 0.1, my - 0.05, k), lerp(t.z, mz, k));
    return this.camK;
  }

  _screen(n, yOff, W, H) {
    const v = this._v.set(n.pos.x, n.pos.y + yOff, n.pos.z).project(this.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null;
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  }

  // falas soltas sobre as cabeças e o aviso para conversar
  drawHud(g, W, H, device) {
    const k = H / 240;
    for (const n of this.list) {
      if (!n.bark || !n.visible || n.dist > 16) continue;
      const head = (n.mode === 'sit' ? 1.45 : 2.02) * n.scale / 0.95 * (n.def.kid ? 1.12 : 1);
      const s = this._screen(n, head, W, H);
      if (!s) continue;
      const b = n.bark, a = Math.min(1, b.t * 5, (b.dur - b.t) * 3) * clamp((16 - n.dist) / 4, 0, 1);
      if (a <= 0) continue;
      const size = Math.round(10 * k), sp = textSprite(b.text, size, FONT_UI, '#f4ead2', '#140c08', true);
      const x = Math.round(clamp(s[0] - sp.w / 2, 4 * k, W - sp.w - 4 * k)), y = Math.round(Math.max(4 * k, s[1] - sp.h - 4 * k));
      g.globalAlpha = 0.55 * a; g.fillStyle = '#0d0907';
      g.fillRect(x - 3 * k, y - 1 * k, sp.w + 6 * k, sp.h + 1 * k);
      g.globalAlpha = 1;
      drawText(g, b.text, x, y, size, { color: '#f4ead2', alpha: a });
    }
    const f = this.focus;
    this.chip = null;
    if (!f) return;
    const s = this._screen(f, (f.mode === 'sit' ? 1.3 : 1.86) * f.scale / 0.95 * (f.def.kid ? 1.12 : 1), W, H);
    if (!s) return;
    const label = 'CONVERSAR', size = Math.round(10 * k), lift = f.bark ? 15 * k : 0;   // acima do balão de fala
    if (device === 'touch') {
      const sp = textSprite('FALAR', Math.round(12 * k), FONT_UI, '#140c08', null, true);
      const w = Math.max(48 * k, sp.w + 16 * k), h = 18 * k, x = Math.round(s[0] - w / 2), y = Math.round(s[1] - h - 18 * k - lift);
      g.globalAlpha = 0.85; g.fillStyle = '#f2c879'; g.fillRect(x, y, w, h); g.globalAlpha = 1;
      g.strokeStyle = '#140c08'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      drawText(g, 'FALAR', x + w / 2, y + 3 * k, 12 * k, { align: 'center', color: '#140c08', shadow: null });
      this.chip = { x, y, w, h };
      return;
    }
    const key = device === 'pad' ? 'A' : 'F';
    const sp = textSprite(label, size, FONT_UI, '#f4ead2', '#140c08', true);
    const kw = 11 * k, w = kw + 4 * k + sp.w + 4 * k, h = 13 * k;
    const x = Math.round(s[0] - w / 2), y = Math.round(s[1] - h - 16 * k - lift);
    panel(g, x, y, w, h, 0.7);
    g.fillStyle = device === 'pad' ? '#3c8a3c' : '#e9dcc0';
    g.fillRect(Math.round(x + 2 * k), Math.round(y + 2 * k), Math.round(kw - 2 * k), Math.round(h - 4 * k));
    drawText(g, key, x + 2 * k + (kw - 2 * k) / 2, y + 1.5 * k, size, { align: 'center', color: device === 'pad' ? '#f4ead2' : '#140c08', shadow: null });
    drawText(g, label, x + kw + 3 * k, y + 1 * k, size, { color: '#f4ead2' });
  }

  drawTalk(g, W, H, device) { this.dialogue.draw(g, W, H, device); }
}
