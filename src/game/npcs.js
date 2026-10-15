import * as THREE from 'three';
import { Character } from './character.js';
import { makeHeroTexture } from './heroTexture.js';
import { ps1Material, G } from '../engine/ps1material.js';
import { CollisionWorld } from '../engine/collision.js';
import { pointInPoly } from '../world/geo.js';
import { NPC_DEFS, GENERIC } from './npcData.js';
import { makeHat, makeHair, makeSkirt, makeItem, makeLine, makeThermos, makeStall } from './npcModels.js';
import { ACTS, armIK, actWeight, defaultIdles } from './npcActs.js';
import { Dialogue } from '../ui/dialogue.js';
import { drawText, textSprite, panel, FONT_UI } from '../ui/overlay.js';

// Moradores de Teewald, com medo do que anda no mato: andam pelo calçadão e pela
// praça, sentam nos bancos, alguns ficam parados encarando quem passa. Chegando
// perto, murmuram alguma coisa; com F / A / toque em FALAR abre a conversa. Tiro
// por perto assusta (agacham, fogem para longe do estampido e depois ficam abalados),
// arma apontada faz levantar as mãos, arma na mão deixa todo mundo de olho. O sino
// faz todos olharem para a igreja. Parados, fazem pequenos gestos (npcActs.js); andando,
// desviam uns dos outros e às vezes param para olhar o rio ou o mato.
// Ninguém se machuca.

const TAU = Math.PI * 2;
const TALK_R = 2.4;
// porte da ficha → largura do corpo
const PORTE = { magro: 0.92, 'médio': 1, forte: 1.07, gordo: 1.14 };
const SIM_R = 140;          // além disso o morador fica parado (ninguém vê)
// murmúrios de quem está em transe (capítulo 6)
const TRANCE_BARKS = ['...vem...', '...tá chamando...', '...ja, ich komm...', '...o mato...'];
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _tq = new THREE.Quaternion(), _tv = new THREE.Vector3();
// poses de ofício que ocupam as duas mãos (gestos automáticos não interrompem)
const BUSY_POSES = ['fish', 'vendor', 'photo', 'rake', 'phone'];
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// altura em que um morador fica de pé no ponto: chão, calçada, piso ou o degrau
// mais alto (até 1,45 m acima do terreno) que esteja embaixo dele
// (dentro de um interior, como o padre no altar da igreja: o piso de baixo do interior)
const standY = (ctx, x, z) => {
  const d = ctx.interiorList?.find(q => x >= q.bounds.x0 && x <= q.bounds.x1 && z >= q.bounds.z0 && z <= q.bounds.z1);
  return ctx.groundAt(x, z, d ? d.floorY + 1.5 : ctx.terrain.heightAt(x, z) + 1);
};

// ponto livre para um morador (sem obstáculo, prédio ou água num raio r)
function clearAt(ctx, x, z, r) {
  const T = ctx.terrain;
  if (T.waterAt(x, z) || ctx.zones.insideBuilding(x, z, 0.2)) return false;
  const y = standY(ctx, x, z);
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
    building: re => [...(L.specials || []), ...ctx.buildings].find(b => re.test(typeof b.sign === 'string' ? b.sign : b.signText || '')),
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

// (exportado para o estúdio de retratos: tools/retratos)
export class NPC {
  constructor(def, sys) {
    const { M, scene } = sys;
    this.def = def; this.id = def.id;
    this.ch = new Character(M, ps1Material({ map: makeHeroTexture(def.look) }));
    // altura e porte da ficha (npcData.js): a malha mede 1,84 m em escala 1 (criança, com a cabeça maior, 1,92 m)
    const f = def.ficha || {};
    const s = f.altura ? f.altura / (def.kid ? 1.92 : 1.84) : 0.95 * (def.kid ? 0.62 : def.look.female ? 0.95 : 1);
    const b = def.bulk || PORTE[f.porte] || 1;
    this.scale = s;
    this.stoop = f.curvado ? 0.16 : 0;
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
    this.flinch = 0; this.fear = 0; this.aimedT = 0; this.handsT = 0;
    this.bark = null; this.barkT = 6 + Math.random() * 14; this.greeted = false; this.gunNoted = false;
    this.pause = 0; this.wait = 0; this.stuck = 0; this.sip = 6 + Math.random() * 6;
    this.w = { pose: 1, sit: 0, talk: 0, hands: 0, flinch: 0, look: 0, rake: 0, back: 0, listen: 0, cam: 1 };
    this.dist = 999; this.visible = true;
    // gestos: ação em curso (npcActs.js) e tempo até a próxima, parado
    this.act = null; this.actT = 3 + Math.random() * 6;
    this.idles = (def.idle || defaultIdles(def)).filter(id => ACTS[id]);
    // passo curto dos velhos e ligeiro das crianças; velho balança menos os braços
    this.ch.cad = def.kid ? 1.22 : def.look.old ? 1.12 : 1;
    this.swing = def.look.old ? 0.55 : 1;
    this.talkStyle = def.talkStyle || (def.look.old ? 'calm' : 'lively');
    // susto: de onde veio, para onde foge; abalado depois; desconfiado por um tempo
    this.fleeAng = 0; this.shaken = 0; this.wary = 0; this.backing = false; this.lookSide = Math.random() < 0.5 ? -1 : 1;
    this.alert = null;            // sino: { x, z, t, delay }
    this.stopT = 12 + Math.random() * 20; this.stopLook = null;   // paradas no caminho
    this.gunSeen = 0; this.chatK = 0; this.nodT = 0; this.spoke = false;
    // ofícios: pescaria, fotos, rastelo, regador, livro, bengala
    this.fishT = 5 + Math.random() * 8; this.rodLift = 0; this.bobDip = 0;
    this.shotT = 2 + Math.random() * 3; this.shots = 0; this.camDown = 0;
    this.reading = 0; this.pour = 0; this.dripT = 0; this.cane = null; this.caneU = 0; this._dt = 0;
  }

  get mobile() { return this.mode !== 'sit'; }
  get busy() { return this.talking || this.flinch > 0 || this.handsT > 0; }

  // braço livre para gestos de uma mão (o direito, se não estiver segurando nada)
  get freeArm() {
    if (BUSY_POSES.includes(this.def.pose)) return null;
    return this.ch.arms[this.item ? 1 - this.itemArm : 0];
  }

  // pode fazer este gesto agora? (listed: está na lista própria do morador, que vale
  // mesmo com as mãos ocupadas pelo ofício)
  canAct(id, listed = false) {
    const A = ACTS[id];
    if (!A) return false;
    const sit = this.mode === 'sit';
    if ((sit && !A.sit) || (A.sitOnly && !sit) || (this.speed > 0.3 && !A.walk)) return false;
    if (listed || A.hands === 0) return true;
    if (A.item) return !!this.item;
    if (A.hands === 2) return !this.item && !BUSY_POSES.includes(this.def.pose);
    return !!this.freeArm;
  }

  startAct(id, o = {}) {
    if (!this.canAct(id, o.listed)) return false;
    const A = ACTS[id];
    // a anterior sai enquanto a nova entra
    if (this.act && this.act.w > 0.02) { this.act.stop = true; this.prevAct = this.act; }
    this.act = { id, t: 0, w: 0, dur: A.dur[0] + Math.random() * (A.dur[1] - A.dur[0]), side: o.side ?? (Math.random() < 0.5 ? -1 : 1), stop: false };
    return true;
  }

  // termina a ação em curso sem cortar (o peso desce suave até zero)
  stopAct() { if (this.act) this.act.stop = true; }

  place(spec, sys) {
    const ctx = sys.ctx;
    this.mode = spec.mode;
    if (spec.mode === 'sit' && !spec.seat) { spec = { mode: 'stand', x: sys.S.i0x + 3, z: sys.S.i0z, h: 0 }; this.mode = 'stand'; }
    if (spec.mode === 'sit') {
      const st = this.seat = spec.seat, at = sys.S.frame(st.x, st.z, st.rot);
      const [x, z] = at(this.def.thermos ? -0.3 : 0, 0.02);
      this.pos.set(x, st.y, z);
      this.heading = this.home = st.rot;
      if (this.def.luggage) {
        const mala = makeItem('mala', sys.M, [74, 52, 38]), [mx, mz] = at(0.62, 0.32);
        mala.position.set(mx, st.y, mz); mala.rotation.y = st.rot + 0.2;
        sys.scene.add(mala);
      }
      if (this.def.thermos) {
        const th = makeThermos(sys.M), [tx, tz] = at(0.42, -0.04);
        th.position.set(tx, st.y + st.seat, tz);
        sys.scene.add(th);
      }
    } else if (spec.mode === 'stand') {
      this.homePos = [spec.x, spec.z];
      this.home = spec.h;
      this.heading = spec.h;
      this.pos.set(spec.x, standY(ctx, spec.x, spec.z), spec.z);
    } else if (spec.mode === 'route') {
      this.pts = spec.pts; this.speedBase = spec.speed;
      this.ri = Math.floor(Math.random() * this.pts.length); this.dir = Math.random() < 0.5 ? 1 : -1;
      const p = this.pts[this.ri];
      this.pos.set(p[0], standY(ctx, p[0], p[1]), p[1]);
    } else if (spec.mode === 'wander') {
      this.poly = spec.poly; this.speedBase = spec.speed; this.rest = spec.rest || [1, 4];
      const p = this._randomIn(sys) || sys.S.L.praca.c;
      this.pos.set(p[0], standY(ctx, p[0], p[1]), p[1]);
      this.heading = Math.random() * TAU;
    } else if (spec.mode === 'follow') {
      this.leaderId = spec.leader; this.off = spec.off;
    }
    if (spec.stall) {
      const st = spec.stall, y = standY(ctx, st.x, st.z);
      const m = makeStall(sys.M, st.text, st.closed);
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

  // fala solta sobre a cabeça; act: gesto junto (chamar o cachorro, rezar...)
  say(text, sys, dur = 3.2, act = null) {
    if (!text) return;
    this.bark = { text, t: 0, dur };
    sys.barkCool = 1.4;
    if (act && !this.busy && this.fear <= 0) this.startAct(act, { listed: true });
  }

  // a próxima conversa (com um comentário sobre a arma na primeira vez que ela aparece)
  nextTalk(sys) {
    // falas da campanha (capítulos 2 a 10)
    if (this.storyTalks) return [...this.storyTalks[Math.min(this.storyIdx++, this.storyTalks.length - 1)]];
    if (this.fear > 0) return [pick(GENERIC.afraid)];
    const lines = [...this.def.talks[this.talkIdx++ % this.def.talks.length]];
    if (sys.pistol?.equipped && !this.gunNoted) { this.gunNoted = true; lines.unshift(this.def.gun || pick(GENERIC.gun)); }
    return lines;
  }

  // susto (tiro, explosão em sx, sz): encolhe, foge para longe do estampido e fica desconfiado
  scare(sys, sx, sz) {
    if (this.talking || this.trance) return;
    this.flinch = 0.8 + Math.random() * 0.4;
    this.fear = this.mobile ? 5 + Math.random() * 2 : 4;
    this.pause = 0; this.wait = 0; this.shaken = 0; this.wary = 45;
    this.stopAct();
    if (this.mode === 'stand') this.returnTo = this.homePos;
    if (this.mode === 'route') this.returnTo = null;
    const P = sys.player?.pos, ox = sx ?? P?.x ?? this.pos.x, oz = sz ?? P?.z ?? this.pos.z;
    const base = Math.hypot(this.pos.x - ox, this.pos.z - oz) > 0.5 ? Math.atan2(this.pos.x - ox, this.pos.z - oz) : this.heading + Math.PI;
    this.fleeAng = this._openDir(sys, base);
  }

  // direção mais aberta perto de `base` (raio na altura do peito)
  _openDir(sys, base) {
    const col = sys.ctx.collision, y = this.pos.y + 1.0;
    let best = base, bd = -1;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const a = base + off, d = col.raycast(this.pos.x, y, this.pos.z, Math.sin(a), 0, Math.cos(a), 8);
      if (d >= 7.5) return a;
      if (d > bd) { bd = d; best = a; }
    }
    return best;
  }

  // para onde olhar numa parada do caminho: o rio (calçadão), a casa (carteiro) ou o mato
  _interest(sys) {
    const ctx = sys.ctx, p = this.pos, kind = this.def.stops;
    if (kind === 'house') {
      let best = null, bd = 16;
      for (const b of ctx.buildings) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
      if (best) return Math.atan2(best.x - p.x, best.z - p.z);
    }
    if (kind === 'river') {
      const q = ctx.rivers?.index?.nearest(p.x, p.z);
      if (q?.seg && q.d < 45) { const s = q.seg; return Math.atan2(s.ax + (s.bx - s.ax) * q.t - p.x, s.az + (s.bz - s.az) * q.t - p.z); }
    }
    return this.heading + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.8);
  }

  update(dt, sys) {
    const ctx = sys.ctx, F = sys.focusPos;
    this.t += dt;
    const dx = F.x - this.pos.x, dz = F.z - this.pos.z;
    this.dist = Math.hypot(dx, dz);
    if (this.bark) { this.bark.t += dt; if (this.bark.t > this.bark.dur) this.bark = null; }
    // de noite os moradores ficam em casa (a campanha esconde)
    if (this.hidden) { this._show(false); this.dist = 999; return; }
    if (this.dist > SIM_R && this.mode !== 'follow') { this._show(false); return; }
    const wasFear = this.fear > 0;
    for (const k of ['flinch', 'fear', 'aimedT', 'afterTalk', 'wary', 'gunSeen', 'nodT']) this[k] = Math.max(0, this[k] - dt);
    if (this.aimedT > 0) this.handsT = Math.max(this.handsT, 0.9); else this.handsT = Math.max(0, this.handsT - dt);
    if (this.handsT <= 0) this.aimBarked = false;
    const play = sys.mode === 'play';
    const toPlayer = Math.atan2(dx, dz);
    const gunOut = play && !!sys.pistol?.equipped && !this.trance;

    // passou o medo: fica parado um pouco, abalado (os religiosos se benzem)
    if (wasFear && this.fear <= 0 && !this.talking) {
      this.shaken = 2.5 + Math.random() * 2;
      if (!(this.def.devout && this.startAct('sign', { listed: true }))) this.startAct(pick(['glance', 'hug', 'wring'])) || this.startAct('glance');
    }
    if (this.shaken > 0 && !this.busy) this.shaken -= dt;
    // sino: todo mundo para e olha para a igreja (o som chega com atraso)
    const al = this.alert;
    if (al) {
      if (al.delay > 0) al.delay -= dt;
      else {
        if (!al.started) {
          al.started = true;
          if (al.bark) this.say(al.bark, sys, 2.8);
          if (this.def.devout) this.startAct('sign', { listed: true });
          if (this.mode === 'route' || this.mode === 'wander') this.pause = Math.max(this.pause, al.t);
        }
        if ((al.t -= dt) <= 0) this.alert = null;
      }
    }
    const alertOn = !!this.alert && this.alert.started;

    // ---------- para onde ir ----------
    let tx = null, tz = null, speed = 0;
    this.backing = false;
    if (this.busy || this.shaken > 0) { /* parado */ }
    else if (this.fear > 0 && this.mobile && this.flinch <= 0) {
      tx = this.pos.x + Math.sin(this.fleeAng) * 6; tz = this.pos.z + Math.cos(this.fleeAng) * 6; speed = 4.3;
    } else if (this.wary > 0 && gunOut && this.dist < 2.2 && this.mobile && this.mode !== 'follow') {
      // desconfiado, com a arma chegando perto: recua de frente para o jogador
      const l = this.dist || 1;
      tx = this.pos.x - dx / l * 2; tz = this.pos.z - dz / l * 2; speed = 0.9; this.backing = true;
    } else if (this.returnTo) {
      [tx, tz] = this.returnTo; speed = 1.6;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.35) { this.returnTo = null; tx = null; }
    } else if (this.mode === 'route') {
      if (this.pause > 0) this.pause -= dt;
      else {
        const p = this.pts[this.ri];
        if (Math.hypot(p[0] - this.pos.x, p[1] - this.pos.z) < 0.9) {
          const nx = this.ri + this.dir;
          if (nx < 0 || nx >= this.pts.length) { this.dir *= -1; this.pause = 1.5 + Math.random() * 3; this.stopLook = null; }
          else this.ri = nx;
        }
        const q = this.pts[this.ri];
        [tx, tz] = q; speed = this.speedBase;
        // de vez em quando para no caminho: olha o rio, o mato, entrega uma carta
        if ((this.stopT -= dt) <= 0) {
          this.stopT = 18 + Math.random() * 30;
          if (this.dist > 5 && !this.storyTalks) {
            this.pause = 3 + Math.random() * 4;
            this.stopLook = this._interest(sys);
            this.stopDo = this.def.stopAct ? pick([].concat(this.def.stopAct)) : pick(['glance', null]);
            tx = null;
          }
        }
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

    // os outros moradores no caminho: desvia (de frente, cada um para a sua direita)
    if (tx !== null && this.mode !== 'follow' && !this.backing) [tx, tz] = this._steer(tx, tz, sys);
    this._move(dt, tx, tz, speed, sys);

    // ---------- para onde olhar parado ----------
    if (this.speed < 0.2) {
      let want = null, rate = 4;
      // de olho: os que encaram; com a arma à mostra ou depois de um susto, todos
      const watch = (this.def.stare || (gunOut && this.dist < 6) || (this.wary > 0 && this.dist < 7)) && !this.trance && this.dist < 9 && sys.mode !== 'title' && this.fear <= 0 && !this.returnTo;
      if (this.talking || this.handsT > 0 || this.afterTalk > 0 || (this.fear > 0 && !this.mobile)) want = toPlayer;
      else if (alertOn) { want = Math.atan2(this.alert.x - this.pos.x, this.alert.z - this.pos.z); rate = 2.5; }
      // os que encaram viram o corpo devagar, acompanhando quem passa
      else if (watch) { want = toPlayer; rate = 1.1; }
      // o casal parado: um vira para o outro
      else if (this.chatWith) { want = Math.atan2(this.chatWith.pos.x - this.pos.x, this.chatWith.pos.z - this.pos.z); rate = 2; }
      else if (this.mode === 'route' && this.pause > 0 && this.stopLook !== null) { want = this.stopLook; rate = 2.5; }
      else if (this.mode === 'stand' && !this.returnTo && this.home !== undefined) { want = this.home; rate = 1.5; }
      if (this.mode === 'sit') want = this.home;
      if (want !== null) this.heading += wrapA(want - this.heading) * Math.min(1, dt * rate);
    }

    // ---------- gestos ----------
    // susto, conversa e mãos para o alto interrompem; andando, só os gestos de andar
    const A = this.act && ACTS[this.act.id];
    if (A && (this.busy || this.fear > 0 || (this.speed > 0.3 && !A.walk))) this.stopAct();
    if (this.stopDo !== undefined && this.stopDo !== null && this.speed < 0.3 && this.pause > 0) { this.startAct(this.stopDo, { listed: true }); this.stopDo = null; }
    if (!this.act && !this.busy && this.fear <= 0 && this.shaken <= 0 && !this.trance) {
      if ((this.actT -= dt) <= 0) {
        this.actT = 4 + Math.random() * 9;
        const opts = this.idles.filter(id => this.canAct(id, true));
        if (opts.length && (this.speed < 0.3 || Math.random() < 0.35)) this.startAct(pick(opts), { listed: true });
      }
    }

    // ---------- falas soltas ----------
    if (play && !this.talking) {
      // em transe (atendeu o telefone da bruxa): não cumprimenta, só murmura
      if (this.trance) {
        if (this.dist < 10 && (this.barkT -= dt) <= 0 && !this.bark) { this.say(pick(TRANCE_BARKS), sys, 2.8); this.barkT = 7 + Math.random() * 6; }
      } else if (this.dist < 3.5 && !this.greeted && this.fear <= 0 && sys.barkCool <= 0) {
        this.greeted = true; this.say(this.def.hi, sys, 2.4);
        // cumprimento com gesto: a aba do chapéu, um aceno ou só a cabeça
        const g = this.def.greet || (this.def.hat && this.def.hat[0] !== 'lenco' ? 'tip' : this.def.look.old ? 'nod' : 'wave');
        if (!this.act || this.act.stop || ACTS[this.act.id].hands === 0) { this.stopAct(); this.startAct(g) || this.startAct('nod'); }
      } else if (this.dist > 14) this.greeted = false;
      // arma na mão chegando perto: alguém comenta, os nervosos esfregam as mãos
      if (gunOut && this.dist < 5 && this.gunSeen <= 0 && this.fear <= 0 && this.handsT <= 0) {
        this.gunSeen = 50;
        if (sys.barkCool <= 0 && !this.bark && Math.random() < 0.5) this.say(pick(GENERIC.gunOut), sys, 2.4);
        if (this.talkStyle === 'nervous' && !this.act) this.startAct('wring');
      }
      if (this.dist < 10) {
        this.barkT -= dt;
        if (this.barkT <= 0 && sys.barkCool <= 0 && !this.bark && this.fear <= 0) {
          const i = Math.floor(Math.random() * this.def.barks.length);
          this.say(this.def.barks[i], sys, 3.2, this.def.barkActs?.[i]);
          this.barkT = 16 + Math.random() * 20;
        }
      }
    }

    // ---------- animação ----------
    // no dia limpo a neblina vai a 1,6 km: os moradores continuam aparecendo só até onde já apareciam
    const far = Math.min(G.uFogFar.value, 230) + 12;
    this._show(this.dist < far);
    if (!this.visible) return;
    this.ch.update(dt, this.speed, true, this.speed > 2.6, this.backing ? { mz: -1 } : undefined);
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

  // desvio de outro morador à frente: puxa o alvo para o lado oposto ao dele
  // (vindo de frente, cada um para a sua direita)
  _steer(tx, tz, sys) {
    const p = this.pos, fx = tx - p.x, fz = tz - p.z, fl = Math.hypot(fx, fz) || 1;
    const ux = fx / fl, uz = fz / fl, lx = uz, lz = -ux;   // l = esquerda de quem anda
    let side = 0;
    for (const o of sys.list) {
      if (o === this || o.hidden || o === this.chatWith) continue;
      const rx = o.pos.x - p.x, rz = o.pos.z - p.z;
      if (Math.abs(rx) > 3.2 || Math.abs(rz) > 3.2) continue;
      const d = Math.hypot(rx, rz), ahead = rx * ux + rz * uz;
      if (d > 3.2 || ahead <= 0.05) continue;
      const lat = rx * lx + rz * lz, need = 0.8 - Math.abs(lat);
      if (need <= 0) continue;
      side += (Math.abs(lat) < 0.12 ? -1 : -Math.sign(lat)) * need * (1 - d / 3.2) * 2.4;
    }
    if (!side) return [tx, tz];
    const look = Math.min(fl, 2.5);
    return [p.x + ux * look + lx * side, p.z + uz * look + lz * side];
  }

  _move(dt, tx, tz, speed, sys) {
    const ctx = sys.ctx, p = this.pos;
    // recuando: o corpo fica de frente para o jogador e anda de costas
    const back = this.backing ? Math.PI : 0;
    if (tx === null) { this.speed = Math.max(0, this.speed - dt * 6); }
    else {
      const ddx = tx - p.x, ddz = tz - p.z, d = Math.hypot(ddx, ddz);
      const diff = wrapA(Math.atan2(ddx, ddz) + back - this.heading);
      this.heading += diff * Math.min(1, dt * (speed > 2.5 ? 8 : 5));
      const target = speed * clamp((Math.cos(diff) - 0.25) / 0.75, 0, 1) * clamp(d / 0.5, 0.3, 1);
      this.speed += clamp(target - this.speed, -dt * 6, dt * (speed > 2.5 ? 7 : 3));
    }
    if (this.speed < 0.01) { this.stuck = 0; return; }
    const ox = p.x, oz = p.z, step = this.speed * dt * (back ? -1 : 1);
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
    this.stuck = moved < Math.abs(step) * 0.3 ? this.stuck + dt : Math.max(0, this.stuck - dt);
    // fugindo contra um muro: tenta outro lado
    if (this.fear > 0 && this.stuck > 0.4) { this.fleeAng = this._openDir(sys, this.fleeAng + 1.2); this.stuck = 0; }
    if (this.stuck > 1.2) {
      this.stuck = 0;
      if (this.mode === 'route' && !this.returnTo) { this.ri = clamp(this.ri + this.dir, 0, this.pts.length - 1); }
      else if (this.mode === 'wander') this.goal = this._randomIn(sys);
      else if (this.returnTo && this.fear <= 0) {
        // volta direto para o lugar, na altura de lá: vindo pelo lado da escadaria da
        // igreja ele empaca nos degraus altos e, com a altura do chão de baixo, ficava
        // enterrado dentro deles
        p.x = this.returnTo[0]; p.z = this.returnTo[1]; this.returnTo = null;
        p.y = standY(ctx, p.x, p.z);
      }
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
    this._dt = dt; this.reading = 0; this.pour = 0;

    // velho: passo miúdo e braços quase parados
    if (this.swing < 1 && this.mode !== 'sit') {
      for (const a of ch.arms) { a.sh.rotation.x = lerp(-0.035, a.sh.rotation.x, this.swing); a.el.rotation.x = lerp(-0.3, a.el.rotation.x, this.swing); }
    }

    // sentado: pernas dobradas, quadril no assento, mãos nas coxas
    if (this.mode === 'sit') {
      const sy = this.scale, hipsY = this.seat.seat / sy + 0.14, H = hipsY - 0.06;
      const th = Math.acos(clamp((H - 0.45) / 0.42, 0, 1));
      ch.hips.position.set(0, hipsY, 0);
      ch.hips.rotation.set(0, 0, 0); ch.spine.rotation.set(-0.05, 0, 0);
      for (const l of ch.legs) {
        l.hip.rotation.set(-th, 0, -l.side * 0.06); l.knee.rotation.set(th + 0.05, 0, 0);
        l.ankle.rotation.set(-0.05, 0, 0); l.toe.rotation.set(0, 0, 0);
      }
      arm(Rr, -0.42, 0.06, -0.7, 1); arm(Lf, -0.42, -0.06, -0.7, 1);
    }

    // pose do ofício (some andando rápido ou com susto)
    const k = ease('pose', !this.busy && this.fear <= 0 && (still || ['cane', 'hold', 'fish'].includes(def.pose)) && !(this.talking && ['photo', 'phone', 'vendor', 'rake'].includes(def.pose)));
    this.photo = false;
    if (def.pose === 'fish') this._fish(dt, k, arm);
    else if (def.pose === 'photo') {
      // fotografa em séries (com flash), depois abaixa a câmera e olha em volta
      this.camDown = Math.max(0, this.camDown - dt);
      const kc = k * ease('cam', this.dist > 4.5 && this.camDown <= 0, 4);
      arm(Rr, -1.35, 0.3, -1.8, kc); arm(Lf, -1.35, -0.3, -1.8, kc); ch.head.rotation.x = lerp(ch.head.rotation.x, 0.06, kc);
      this.photo = kc > 0.6;
      if (this.photo && !this.busy && (this.shotT -= dt) <= 0) {
        this.shotT = 1.6 + Math.random() * 2.5;
        this._flash(sys);
        if (++this.shots >= 2 + Math.floor(Math.random() * 3)) { this.shots = 0; this.camDown = 3 + Math.random() * 3; this.startAct('glance'); }
      }
    } else if (def.pose === 'hold') {
      this.sip -= dt;
      const sipping = this.sip < 0 && this.sip > -1.6;
      if (this.sip < -1.6) this.sip = 5 + Math.random() * 7;
      const s = (sipping && !this.talking) ? Math.min(1, Math.min(-this.sip, 1.6 + this.sip) * 3) : 0;
      arm(Lf, lerp(-0.32, -0.62, s), lerp(0.1, -0.28, s), lerp(-1.5, -2.25, s), k);
      if (s) ch.head.rotation.x = lerp(ch.head.rotation.x, -0.18, s);
    } else if (def.pose === 'cane') arm(Rr, -0.2, -0.12, -0.28, k);
    else if (def.pose === 'phone') { arm(Rr, -0.3, -0.42, -2.45, k, 0.3); ch.head.rotation.z = lerp(ch.head.rotation.z, -0.14, k); }
    else if (def.pose === 'vendor') { arm(Rr, -0.5, 0.12, -0.75, k); arm(Lf, -0.5, -0.12, -0.75, k); }
    else if (def.pose === 'rake') {
      // rasteleia sozinho; com alguém perto, para e se apoia no cabo
      const kr = k * ease('rake', this.dist > 5 && still && !this.talking, 2);
      arm(Rr, -0.45, -0.12, -1.0, k * (1 - kr));
      if (kr > 0.01) {
        const p = Math.sin(t * 2.3);
        armIK(Rr, -0.05, -0.08 + 0.02 * p, 0.3 + 0.13 * p, -1, -0.3, -0.4, kr, 0.3);
        armIK(Lf, 0.03, 0.12 + 0.02 * p, 0.22 + 0.11 * p, 1, -0.3, -0.4, kr, 0.3);
        ch.spine.rotation.x += 0.3 * kr; ch.spine.rotation.y += p * 0.05 * kr; ch.head.rotation.x += 0.25 * kr;
      }
      this.raking = kr;
    } else if (def.pose === 'ball') arm(Lf, 0.05, 0.3, -1.15, k);
    else if (this.item && this.mode !== 'sit') {
      // objeto pendurado: braço um pouco aberto e balançando menos
      const a = ch.arms[this.itemArm];
      a.sh.rotation.x *= 0.5; a.sh.rotation.z += a.side * 0.12;
    }

    // cabeça acompanha o jogador de longe, devagar, olhando nos olhos (a criança e quem está
    // sentado olham para cima); com o sino, olha para a torre
    const al = this.alert?.started ? this.alert : null;
    const rel = wrapA((al ? Math.atan2(al.x - this.pos.x, al.z - this.pos.z) : toPlayer) - this.heading);
    const kl = ease('look', al || (this.dist < 11 && Math.abs(rel) < 2.0 && sys.mode !== 'title') || this.talking, al ? 3 : 2);
    if (kl > 0.01) {
      ch.head.rotation.y = lerp(ch.head.rotation.y, clamp(rel, -1.15, 1.15), kl);
      const P = sys.player?.pos;
      if (al) ch.head.rotation.x -= 0.15 * kl;
      else if (P && sys.mode !== 'title') {
        const eye = this.pos.y + (this.mode === 'sit' ? 1.12 : 1.62) * this.scale;
        ch.head.rotation.x += clamp(Math.atan2(eye - P.y - 1.55, Math.max(this.dist, 0.6)), -0.45, 0.3) * kl;
      }
    }

    // gesto em curso (npcActs.js)
    this._acts(dt);

    // conversa: gestos conforme o jeito de cada um; ouvindo, acena com a cabeça no fim de
    // cada fala. O casal parado conversa entre si (sem texto)
    const kt = ease('talk', speaking || this.chatK > 0, 5);
    if (kt > 0.01) this._talkGesture(kt, t);
    if (this.talking && this.spoke && !speaking) this.nodT = 0.9;
    this.spoke = speaking;
    if (this.nodT > 0) ch.head.rotation.x += 0.18 * Math.max(0, Math.sin((0.9 - this.nodT) * 10.5));
    const kn = ease('listen', this.talking && !speaking && this.talkStyle === 'nervous' && !this.item, 4);
    if (kn > 0.01) ACTS.wring.fn({ ch, R: Rr, L: Lf, w: kn * 0.8, t, n: this });

    // fugindo: olha para trás
    const kb = ease('back', this.fear > 0 && this.speed > 2 && Math.sin(t * 1.8) > 0.55, 5);
    if (kb > 0.01) { ch.head.rotation.y += this.lookSide * 1.1 * kb; ch.spine.rotation.y += this.lookSide * 0.3 * kb; }

    // mãos para o alto (arma apontada), tremendo
    const kh = ease('hands', this.handsT > 0, 9);
    if (kh > 0.01) { const tr = Math.sin(t * 31) * 0.035; arm(Rr, -2.75 + tr, -0.35, -0.35, kh); arm(Lf, -2.75 - tr, 0.35, -0.35, kh); }
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
    // velho curvado: tronco para frente, a cabeça compensa para continuar olhando adiante
    if (this.stoop) {
      const s = this.stoop * (this.mode === 'sit' ? 0.6 : 1);
      ch.spine.rotation.x += s; ch.neck.rotation.x -= s * 0.45; ch.head.rotation.x -= s * 0.4;
    }
  }

  // avança e aplica a ação em curso (e a anterior, saindo)
  _acts(dt) {
    for (const a of [this.prevAct, this.act]) {
      if (!a) continue;
      const A = ACTS[a.id];
      a.t += dt;
      if (a.t >= a.dur) a.stop = true;
      a.w += ((a.stop ? 0 : actWeight(a.t, a.dur, A.quick)) - a.w) * Math.min(1, dt * (a.stop ? 7 : 12));
      if (a.stop && a.w < 0.02) { if (a === this.act) this.act = null; else this.prevAct = null; continue; }
      const free = A.item ? this.ch.arms[this.itemArm] : this.freeArm || this.ch.arms[0];
      A.fn({ ch: this.ch, R: this.ch.arms[0], L: this.ch.arms[1], free, s: free.side, w: a.w, t: a.t, dur: a.dur, side: a.side, n: this });
    }
  }

  // gestos de quem está falando: calmo (uma mão), animado (as duas), nervoso (esfrega as
  // mãos) ou formal (mãos juntas, de vez em quando uma explica)
  _talkGesture(k, t) {
    const ch = this.ch, [Rr, Lf] = ch.arms, st = this.talkStyle;
    // (a pose do ofício sai durante a conversa: as mãos ficam livres, menos a que segura o objeto)
    const off = !BUSY_POSES.includes(this.def.pose) || this.w.pose < 0.2;
    const both = !this.item && off, one = this.freeArm || (off ? ch.arms[this.item ? 1 - this.itemArm : 0] : null);
    if (st === 'nervous' && both) ACTS.wring.fn({ ch, R: Rr, L: Lf, w: k, t, n: this });
    else if (st === 'stiff' && both) {
      for (const A of ch.arms) { const s = A.side; armIK(A, s * 0.035, -0.02, 0.2, s, -0.3, -0.4, k, 0.3); }
      const g = Math.max(0, Math.sin(t * 0.9) - 0.4) / 0.6;
      if (g > 0) armIK(Rr, -0.2, 0.12 + Math.sin(t * 2.6) * 0.04, 0.3, -1, -0.6, -0.3, k * g, -0.3);
    } else if (st === 'lively' && both) {
      for (const A of ch.arms) {
        const s = A.side, ph = t * (2.1 + s * 0.3) + s;
        armIK(A, s * (0.2 + Math.sin(ph) * 0.05), 0.13 + Math.sin(ph * 1.3) * 0.08, 0.3 + Math.sin(ph * 0.7) * 0.05, s, -0.6, -0.3, k, -0.35);
      }
      ch.spine.rotation.y += Math.sin(t * 1.3) * 0.06 * k;
    } else if (one) {
      const s = one.side;
      armIK(one, s * (0.2 + Math.sin(t * 1.9) * 0.03), 0.09 + Math.sin(t * 2.3) * 0.05, 0.27 + Math.sin(t * 1.6) * 0.04, s, -0.7, -0.3, k * 0.9, -0.25);
    }
    ch.head.rotation.x += Math.sin(t * 7) * 0.035 * k;
    ch.head.rotation.z += Math.sin(t * 1.7) * 0.04 * k;
  }

  // pescaria: a boia belisca, ele dá o puxão e recolhe a linha (e nada de peixe)
  _fish(dt, k, arm) {
    const [Rr, Lf] = this.ch.arms;
    let lift = 0, reel = 0;
    this.bobDip = 0;
    if (!this.busy && (this.fishT -= dt) < 0) {
      const u = -this.fishT;
      if (u < 1.6) this.bobDip = Math.sin(u * 17) > 0.3 ? 0.035 : 0;
      else if (u < 2.2) lift = clamp((u - 1.6) / 0.12, 0, 1);
      else if (u < 5) { lift = 1 - clamp((u - 2.2) / 2.8, 0, 1); reel = 1; }
      else this.fishT = 7 + Math.random() * 14;
    }
    this.rodLift += (lift - this.rodLift) * Math.min(1, dt * 14);
    const r = this.rodLift, sp = reel ? this.t * 13 : 0;
    arm(Rr, -0.95 - 0.45 * r, -0.05, -0.5 - 0.3 * r, k);
    arm(Lf, -0.72 - 0.3 * r + (reel ? Math.sin(sp) * 0.12 : 0), -0.32, -0.85 + (reel ? Math.cos(sp) * 0.18 : 0), k);
    this.ch.spine.rotation.x -= 0.08 * r * k;
  }

  // clique da câmera da repórter: clarão e o estalo do obturador (de perto)
  _flash(sys) {
    const v = sys._v2;
    this.ch.head.localToWorld(v.set(0, 0.12, 0.26));
    sys.effects?.spawn({ p: v, life: 0.09, s0: 0.34, s1: 0.06, color: [1, 1, 0.94] });
    if (this.dist < 14) sys.audio?.tone(1800, 0.025, 'square', 0.03 * (1 - this.dist / 14));
  }

  // objetos de mão no mundo: seguem o punho e ficam de pé (exceto a vara); a bengala e o
  // rastelo apoiam a ponta no chão; o regador inclina quando rega
  _items(sys) {
    if (!this.item) return;
    const v = sys._v, q = sys._q, hand = this.ch.arms[this.itemArm].hand, it = this.def.item;
    if (this.photo) this.ch.head.localToWorld(v.set(0, 0.12, 0.15));
    else hand.localToWorld(v.set(0, -0.075, 0.02));
    this.item.position.copy(v);
    this.item.quaternion.setFromAxisAngle(UP, this.heading);
    if (it === 'vara') {
      // vara inclinada para cima, para a frente (sobe no puxão); linha caindo da ponta até a água
      this.item.quaternion.multiply(q.setFromAxisAngle(sys._x, -0.6 - 0.45 * this.rodLift));
      const tip = sys._v2.set(0, 0, 2.5 * this.scale).applyQuaternion(this.item.quaternion).add(v);
      const w = sys.ctx.terrain.waterAt(tip.x, tip.z);
      const floor = w ? w.level : sys.ctx.terrain.heightAt(tip.x, tip.z);
      const len = Math.max(0.15, tip.y - floor + 0.04 - this.bobDip);
      this.line.group.position.copy(tip);
      this.line.line.scale.y = len;
      this.line.bob.position.y = -len + Math.sin(this.t * 1.7) * 0.015;
    } else if (it === 'bengala' || (it === 'rastelo' && this.raking > 0.02)) {
      // ponta no chão à frente da mão; andando, a bengala finca junto com o pé esquerdo
      // e fica parada no chão enquanto o corpo passa
      const L = (it === 'bengala' ? 0.86 : 1.0) * this.scale, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const h = Math.max(0.1, v.y - this.pos.y), hd = Math.sqrt(Math.max(0.01, L * L - h * h));
      let tx = v.x + fx * hd, tz = v.z + fz * hd, ty = this.pos.y;
      if (it === 'bengala') {
        const c = this.cane ||= { x: tx, z: tz };
        if (this.speed > 0.15) {
          const u = (this.ch.cyc + 0.5) % 1, ahead = hd * 0.6 + this.speed * 0.32;
          const nx = v.x + fx * ahead, nz = v.z + fz * ahead;
          if (u < this.caneU) { c.x = nx; c.z = nz; }
          this.caneU = u;
          if (u < 0.62) { tx = c.x; tz = c.z; }
          else { const f = (u - 0.62) / 0.38, e = f * f * (3 - 2 * f); tx = lerp(c.x, nx, e); tz = lerp(c.z, nz, e); ty += Math.sin(Math.PI * f) * 0.07; }
        } else {
          const kk = Math.min(1, this._dt * 4);
          c.x = lerp(c.x, v.x + fx * hd * 0.8, kk); c.z = lerp(c.z, v.z + fz * hd * 0.8, kk);
          tx = c.x; tz = c.z;
        }
      }
      const d = sys._v2.set(tx - v.x, ty - v.y, tz - v.z).normalize();
      const tilt = _tq.setFromUnitVectors(DOWN, d);
      if (it === 'rastelo') this.item.quaternion.slerp(tilt.multiply(q.setFromAxisAngle(UP, this.heading)), this.raking);
      else this.item.quaternion.premultiply(tilt);
    } else if (it === 'regador' && this.pour > 0.01) {
      // bico para baixo, pingando água (o regador é ~0,3 m à frente da mão)
      this.item.quaternion.multiply(q.setFromAxisAngle(sys._x, this.pour * 0.9));
      if (this.pour > 0.6 && sys.effects && (this.dripT -= this._dt) <= 0) {
        this.dripT = 0.06;
        const tip = sys._v2.set(0, -0.26, 0.29).multiplyScalar(this.scale).applyQuaternion(this.item.quaternion).add(v);
        sys.effects.spawn({ p: tip, v: _tv.set(Math.sin(this.heading) * 0.4, -0.4, Math.cos(this.heading) * 0.4), life: 0.45, s0: 0.022, s1: 0.016, color: [0.62, 0.7, 0.82], grav: 9.8 });
      }
    }
  }
}

export class NPCs {
  // deps: { ctx, scene, M, audio, player, tpc, camera, pistol, R, effects }
  constructor(deps) {
    Object.assign(this, deps);
    this.list = [];
    this.byId = {};
    this.S = makeSpots(this.ctx);
    this.dialogue = new Dialogue(this.audio);
    this.mode = 'title'; this.focusPos = this.player.pos;
    this.focus = null; this.talkNpc = null; this.camNpc = null; this.camK = 0; this.camSide = 1;
    this.barkCool = 0; this.touchTalk = false; this.chip = null;
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
    // tiros, explosões e o sino (weapon.js, combat.js, extras.js): encadeado com as corujas
    const prevScare = this.ctx.scare;
    this.ctx.scare = (x, z, r, kind) => { prevScare?.(x, z, r, kind); this._alarm(x, z, r, kind); };
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
    if (mode === 'play') this._aimCheck();
    for (const n of this.list) if (n.mode !== 'follow') n.update(dt, this);
    for (const n of this.list) if (n.mode === 'follow') n.update(dt, this);
    this._pairs();
    this._separate();
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

  // campanha: esconde todos (noite) menos os da cena; stage põe um morador num lugar com falas próprias
  hideAll(except = []) {
    for (const n of this.list) { n.hidden = !except.includes(n.id); n.trance = false; if (n.hidden) { n.storyTalks = null; n.onTalkEnd = null; } }
  }

  showAll() { for (const n of this.list) { n.hidden = false; n.trance = false; n.storyTalks = null; n.onTalkEnd = null; } }

  stage(id, o = {}) {
    const n = this.byId[id];
    if (!n) return null;
    n.hidden = false;
    if (o.x !== undefined) { n.place({ mode: 'stand', x: o.x, z: o.z, h: o.h ?? 0 }, this); n.fear = 0; n.shaken = 0; n.wary = 0; n.alert = null; }
    if (o.talks) { n.storyTalks = o.talks; n.storyIdx = 0; }
    n.onTalkEnd = o.onTalkEnd || null;
    return n;
  }

  // estampido ou explosão em (x, z): quem está perto se assusta e foge para longe dali;
  // o sino ('bell'): todo mundo para, olha para a torre e os religiosos se benzem
  _alarm(x, z, r, kind) {
    const live = this.list.filter(n => !n.hidden && !n.trance);
    const from = n => Math.hypot(n.pos.x - x, n.pos.z - z);
    let barks = 0;
    if (kind === 'bell') {
      for (const n of live.sort((a, b) => a.dist - b.dist)) {
        const d = from(n);
        if (d > 240 || n.talking) continue;
        n.alert = { x, z, t: 3.5 + Math.random() * 2.5, delay: d / 340 + Math.random() * 0.5, bark: barks < 2 && n.dist < 20 && ++barks ? pick(GENERIC.bell) : null };
      }
      return;
    }
    const R = Math.min(r * 0.6, 34);
    for (const n of live.filter(q => from(q) < R).sort((a, b) => a.dist - b.dist)) {
      const was = n.fear > 0;
      n.scare(this, x, z);
      if (!was && barks < 2 && n.dist < 22) { barks++; n.say(n.def.scared || pick(GENERIC.scared), this, 2.8); }
    }
  }

  // o casal (quem segue e quem é seguido): parados juntos, um vira para o outro e
  // conversam baixinho, cada um na sua vez
  _pairs() {
    for (const n of this.list) {
      if (n.mode !== 'follow' || !n.leader) continue;
      const L = n.leader, d = Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z);
      const chat = !n.hidden && !L.hidden && L.pause > 0.6 && L.speed < 0.15 && n.speed < 0.15 && d < 1.6 &&
        !L.busy && !n.busy && L.fear <= 0 && n.fear <= 0 && !L.alert && !n.alert && !L.storyTalks;
      L.chatWith = chat ? n : null; n.chatWith = chat ? L : null;
      const ph = Math.sin(L.t * 0.55);
      L.chatK = chat && ph > 0.3 ? 1 : 0; n.chatK = chat && ph < -0.3 ? 1 : 0;
    }
  }

  // ninguém atravessa ninguém: separa quem se encostou (quem está sentado não sai do lugar)
  _separate() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.hidden || a.dist > SIM_R) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.hidden || b.dist > SIM_R) continue;
        const ex = b.pos.x - a.pos.x, ez = b.pos.z - a.pos.z;
        if (Math.abs(ex) > 1 || Math.abs(ez) > 1 || Math.abs(a.pos.y - b.pos.y) > 1.2) continue;
        const m = 0.27 * (a.scale + b.scale), e = Math.hypot(ex, ez);
        if (e >= m || e < 1e-4) continue;
        const wa = a.mobile ? (b.mobile ? 0.5 : 1) : 0, wb = b.mobile ? 1 - wa : 0, push = (m - e) / e;
        a.pos.x -= ex * push * wa; a.pos.z -= ez * push * wa;
        b.pos.x += ex * push * wb; b.pos.z += ez * push * wb;
      }
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
      n.onTalkEnd?.(n);
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
      // falas soltas em voz baixa: texto apagado sobre fundo bem leve
      const size = Math.round(10 * k), sp = textSprite(b.text, size, FONT_UI, '#c4bcae', '#140c08', true);
      const x = Math.round(clamp(s[0] - sp.w / 2, 4 * k, W - sp.w - 4 * k)), y = Math.round(Math.max(4 * k, s[1] - sp.h - 4 * k));
      g.globalAlpha = 0.42 * a; g.fillStyle = '#0d0907';
      g.fillRect(x - 3 * k, y - 1 * k, sp.w + 6 * k, sp.h + 1 * k);
      g.globalAlpha = 1;
      drawText(g, b.text, x, y, size, { color: '#c4bcae', alpha: a });
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
