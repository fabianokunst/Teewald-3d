import * as THREE from 'three';
import { places } from './common.js';
import { ipt } from './ch03.js';
import { SFX } from '../creatures/sfx.js';
import { DOCS } from '../lore.js';
import { part, UV1 } from '../../world/interiors/factory.js';
import { sheetFigure } from '../../world/interiors/igreja.js';

// Capítulo 9 — A Mulher da Fotografia. Chuva. O padre liga do orelhão: lendo o diário do
// Pastor Wendt, achou o álbum da paróquia, e a mulher de preto da foto de 1910 está em
// todas as fotos, cada vez mais perto. Agora ela saiu da foto e está dentro da igreja.
// Ela apagou as velas e a lamparina, e as imagens cobertas do depósito andam pela nave
// quando ninguém está olhando (encostar nelas machuca; perto de vela acesa elas não
// chegam). Acender as velas do presbitério e a lamparina, subir à torre e afastar o
// vulto com a luz do lampião. Ela foge rindo para o telhado (o capítulo seguinte).

const PADRE = 'PADRE BERNARDO';
const SPEED = 1.7;              // m/s das imagens quando ninguém olha
const SAFE_R = 3.4;             // raio da luz de uma vela acesa (as imagens não entram)
// as imagens do depósito já saíram de lá quando o jogador chega: duas no presbitério e
// duas nos corredores laterais (planta da igreja: x, z, altura)
const STATUES = [[3.4, 30.8, 1.7], [-3.2, 30.0, 1.4], [5.8, 22.0, 1.9], [-6.2, 18.0, 1.6]];
const BELL_Y = 10.4;
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();

const inChurch = G => G.interiors.indoor?.name === 'igreja';

// cômodo da igreja na planta (para as imagens acharem as portas)
const room = (lx, lz) => (lz > 26.6 && lx < -4.3 ? 'sac' : lz > 26.6 && lx > 4.3 ? 'dep' : lz > 26.75 ? 'pres' : 'nave');
// corredores da nave (x de cada um) e as passagens transversais (z): a de trás, perto do
// presbitério, e a da frente, embaixo do coro
const LANES = { dir: -6.4, meio: 0, esq: 6.6 };
const lane = lx => (lx < -2.6 ? 'dir' : lx > 2.6 ? 'esq' : 'meio');
const CROSS = [25.1, 4.85];
const nearCross = lz => CROSS.some(z => Math.abs(lz - z) < 0.9);

export default {
  n: 9, key: 'foto', title: 'A Mulher da Fotografia', sub: 'Em todas as fotos da paróquia, ela está lá.',
  weather: 'chuva',
  phones: true,
  deathText: 'AS IMAGENS TE PEGARAM',
  start(G) {
    const ph = G.extras.phones[0], P = places(G);
    const sp = G.freeSpot(ph.x, ph.z, 6, 9, 30) || [P.praca.x, P.praca.z];
    return { x: sp[0], z: sp[1], h: Math.atan2(ph.x - sp[0], ph.z - sp[1]) };
  },
  setup(G, S) {
    const C = G.interiors.defs.igreja;
    S.C = C;
    C.dark = true;
    C.lamparinaLit = false;
    // dois castiçais de ferro apagados nos cantos do presbitério, e a lamparina do Santíssimo
    S.candles = ['presbR', 'presbL', 'lamparina'].map(key => {
      const p = ipt(G, 'igreja', key), lamp = key === 'lamparina';
      const c = { key, x: p.x, z: p.z, y: p.y, lit: false, lamp, top: lamp ? p.y + 2.5 : p.y + 1.38 };
      if (!lamp) {
        G.build(B => {
          B.col = [0.25, 0.24, 0.24];
          B.box('iron', p.x, p.y, p.z, 0.5, 0.06, 0.5, 0.4, { uvScale: 1 });
          B.cylinder('iron', p.x, p.y + 0.06, p.z, 0.04, 0.04, 1.12, 6, { cap: true });
          B.cylinder('iron', p.x, p.y + 1.18, p.z, 0.13, 0.1, 0.05, 8, { cap: true });
          B.col = [0.9, 0.88, 0.8];
          B.cylinder('carPaint', p.x, p.y + 1.23, p.z, 0.05, 0.05, 0.15, 8, { cap: true });
          B.col = [1, 1, 1];
        });
        G.solidCircle(p.x, p.z, 0.3, p.y, p.y + 1.4);
      }
      // chama (aparece quando acende)
      c.flame = G.group(part(G.ctx, k => {
        k.quad('int:c:flame', [-0.05, 0, 0], [0.05, 0, 0], [0.05, 0.16, 0], [-0.05, 0.16, 0], UV1);
        k.quad('int:c:flame', [0, 0, -0.05], [0, 0, 0.05], [0, 0.16, 0.05], [0, 0.16, -0.05], UV1);
      }, p.x, c.top, p.z));
      c.flame.visible = false;
      return c;
    });
    S.statues = [];
    // munição e querosene dentro da igreja (luz é o que salva aqui)
    const nave = ipt(G, 'igreja', 'nave'), cf = ipt(G, 'igreja', 'confessionario');
    if (nave) { G.pickup('oil', nave.x - 5.8, nave.z + 2, { n: 2, y: nave.y + 0.04, respawn: 45 }); G.pickup('cuca', nave.x + 5.8, nave.z - 3, { y: nave.y + 0.04 }); }
    if (cf) G.pickup('cha', cf.x + 0.6, cf.z + 1.6, { y: cf.y + 0.04 });
    G.supplies([['oil', 1], ['ammo9', 12], ['cuca', 1]], places(G).churchYard.x, places(G).churchYard.z, 16, { r0: 5 });
  },
  saveState(G, S) { return { lit: S.candles.map(c => c.lit) }; },
  loadState(G, S, c) { (c.lit || []).forEach((on, i) => { if (on && S.candles[i]) S.def.light(G, S, S.candles[i], true); }); },
  resume(G, S, id) {
    // da torre em diante a igreja já está acesa
    if (['torre', 'mulher', 'fim'].includes(id)) { for (const c of S.candles) S.def.light(G, S, c, true); S.C.dark = false; }
  },
  cleanup(G, S) {
    const C = S.C;
    if (!C) return;
    C.dark = false; C.lamparinaLit = false; C.sheetsAway(false);
    for (const p of G.extras.phones) G.extras.forceRing(p, false);
  },
  tick(G, dt, S) {
    for (const c of S.candles || []) if (c.lit) G.atmo.light(c.x, c.top + 0.25, c.z, c.lamp ? [1.3, 0.16, 0.08] : [1.5, 0.95, 0.45], c.lamp ? 6 : 7, 3);
    if (S.statuesOn) S.def.moveStatues(G, dt, S);
  },
  steps: [
    {
      id: 'telefone', obj: 'Atenda o orelhão da praça',
      marker: G => { const p = G.extras.phones[0]; return [p.x, p.y + 2.4, p.z]; },
      enter(G) {
        const p = G.extras.phones[0];
        G.extras.forceRing(p, true);
        G.ambient({ types: { ghost: 1, dog: 1 }, max: 2, every: [22, 34] });
        G.use('atender', [p.x, p.y + 1.4, p.z], 2.2, 'ATENDER', () => {
          G.extras.forceRing(p, false);
          G.audio.tone(140, 0.08, 'square', 0.05);
          G.talk([['NO TELEFONE: ' + PADRE, [
            'Alô? Graças a Deus... Aqui é o padre Bernardo. Fala baixo.',
            'Eu estava na sacristia lendo o diário do Pastor Wendt e achei o álbum da paróquia. A foto da inauguração, de 1910. A mulher de preto, no canto...',
            'Ela está em todas as fotos. Em todas. E cada vez mais perto de quem tira.',
            'Ela não está mais na foto, filho. Está aqui dentro. Apagou as velas, apagou a lamparina...',
            'E as imagens velhas do depósito... elas andam quando a gente não olha. Eu me tranquei no confessionário.',
            'Entra pela sacristia. E não dá as costas pra elas.',
          ], 150]], () => G.next());
        });
      },
    },
    {
      id: 'entrar', obj: 'Entre na igreja pela sacristia',
      marker: G => { const s = places(G).sacristy; return [s.x, null, s.z]; },
      enter(G) {
        const s = places(G).sacristy;
        G.use('sacristia', [s.x, G.y(s.x, s.z) + 1.3, s.z], 2.2, 'ENTRAR NA SACRISTIA', () => { G.ambient(null); G.combat.clearEnemies(e => e.ambient); G.enter('igreja', 'sacristyIn'); }, { once: false });
      },
      update(G) {
        if (!inChurch(G)) return false;
        const p = ipt(G, 'igreja', 'sacristyIn');
        G.checkpoint(p.x, p.z, p.h, p.y);
        G.unuse('sacristia');
        return true;
      },
    },
    {
      id: 'album', obj: 'Veja o álbum de fotos na mesa da sacristia',
      marker: G => { const p = ipt(G, 'igreja', 'lampiao'); return p ? { x: p.x, y: p.y + 0.9, z: p.z } : null; },
      enter(G) {
        const p = ipt(G, 'igreja', 'lampiao');
        G.use('album', [p.x, p.y + 0.4, p.z], 1.9, 'VER O ÁLBUM', () => {
          G.extras.markDoc('album');
          G.showPaper(DOCS.find(d => d.id === 'album'), () => {
            G.sting();
            G.combat.shake = 0.3;
            G.after(0.6, () => SFX.whisper(G.audio, 2));
            G.next();
          });
        });
      },
    },
    {
      id: 'padre', obj: 'Ache o padre no confessionário. Não dê as costas às imagens',
      marker: G => { const n = G.npcs.byId.bernardo; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
      enter(G, S) {
        S.def.wakeStatues(G, S);
        const p = ipt(G, 'igreja', 'confessionario');
        G.npcs.stage('bernardo', { x: p.x, z: p.z, h: p.h, talks: [[
          'Tu veio... Elas ficaram em volta do confessionário a noite inteira. Eu ouvia o lençol arrastando no ladrilho.',
          'Ela apagou tudo. As velas, os lustres... e a lamparina do Santíssimo, que não apagava desde 1910.',
          'Na luz benta elas não chegam perto. Acende os castiçais do presbitério e a lamparina.',
          'Eu fico olhando pra elas daqui. Vai.',
        ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'padre') G.next(); } });
        G.hud.toast('AS IMAGENS SÓ ANDAM QUANDO NINGUÉM OLHA');
      },
    },
    {
      id: 'velas', obj: 'Acenda os castiçais e a lamparina (0/3)',
      marker: G => { const c = G.S.candles.filter(q => !q.lit).sort((a, b) => G.dist(a.x, a.z) - G.dist(b.x, b.z))[0]; return c ? { x: c.x, y: c.top + 0.6, z: c.z } : null; },
      enter(G, S) {
        S.def.wakeStatues(G, S);
        S.def.count(G, S);
        S.candles.forEach((c, i) => {
          G.use('vela' + i, [c.x, c.y + 1.2, c.z], 1.9, c.lamp ? 'ACENDER A LAMPARINA' : 'ACENDER A VELA', () => {
            S.def.light(G, S, c);
            S.def.count(G, S);
            G.autosave('vela', true);
          }, { hold: 1.6, cond: () => !c.lit });
        });
      },
      update(G, dt, S) {
        if (!S.candles.every(c => c.lit)) return false;
        S.def.collapse(G, S);
        return true;
      },
    },
    {
      id: 'torre', obj: 'Suba à torre do sino',
      // destino final (a marca vai por partes: escada do coro, porta da torre, sino)
      goal: G => { const b = ipt(G, 'igreja', 'sino'); return [b.x, b.y + 1, b.z]; },
      marker: G => {
        const b = ipt(G, 'igreja', 'sino');
        if (G.player.pos.y < b.y - 7) { const e = ipt(G, 'igreja', 'escadaCoro'); return { x: e.x, y: e.y + 1.8, z: e.z }; }
        if (G.player.pos.y < b.y - 3) { const t = ipt(G, 'igreja', 'coroTorre'); return { x: t.x, y: t.y + 1.8, z: t.z }; }
        return { x: b.x, y: b.y + 2.2, z: b.z };
      },
      enter(G) {
        const t = ipt(G, 'igreja', 'coroTorre');
        G.checkpoint(t.x, t.z, t.h, t.y);
      },
      update(G, dt, S) {
        const b = ipt(G, 'igreja', 'sino'), P = G.player.pos;
        if (P.y < b.y - 0.8 || !G.near(b.x, b.z, 4.5)) return false;
        const pe = ipt(G, 'igreja', 'sinoPe');
        G.checkpoint(pe.x, pe.z, pe.h, pe.y);
        // ela está atrás do sino, de costas
        const C = S.C, w = C.local(-1.2, 3.2, BELL_Y);
        S.boss = G.spawn('ghost', w.x, w.z, { y: w.y, kind: 'mulher', name: 'A MULHER DE PRETO', color: 0x5a4a5e, opacity: 0.9, scale: 1.15, hp: 16 });
        S.boss.speedBase *= 1.25;
        G.boss(S.boss, 'A MULHER DA FOTOGRAFIA');
        C.ring();
        G.audio.bell();
        SFX.cackle(G.audio, 3);
        G.combat.shake = 0.35;
        G.toast('A LUZ DO LAMPIÃO');
        return true;
      },
    },
    {
      id: 'mulher', obj: 'Afaste a mulher da fotografia com a luz do lampião', resumeAs: 'torre',
      update(G, dt, S) {
        const B = S.boss;
        if (!B) return false;
        // ferida, ela chama duas almas
        if (!S.called && B.hp < B.maxHp * 0.5) {
          S.called = true;
          SFX.wail(G.audio, 2, 1.1, 2.4);
          for (const [lx, lz] of [[1.9, 0.7], [1.9, 3.3]]) { const p = S.C.local(lx, lz, BELL_Y); G.spawn('ghost', p.x, p.z, { y: p.y }); }
        }
        // (o fantasma some ao morrer: removido também conta)
        return B.dead && (B.deadT > 1.5 || B.removed);
      },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.6); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        G.after(1.5, () => G.narrate([
          'O vulto se desfez entre as venezianas da torre, num cheiro de vela apagada.',
          'Na sacristia, a foto de 1910 estava caída no chão. No canto esquerdo da escadaria, agora, não havia ninguém.',
          'O padre guardou o álbum dentro do sacrário e trancou com a chave.',
          'Lá fora, em cima do telhado da igreja, alguém começou a rir.',
        ], () => G.complete(), { title: 'A MULHER DA FOTOGRAFIA' }));
      },
    },
  ],

  count(G, S) {
    const n = S.candles.filter(c => c.lit).length;
    if (G.S.def.steps[G.S.i]?.id === 'velas') G.obj(`Acenda os castiçais e a lamparina (${n}/3)`);
  },
  light(G, S, c, quiet = false) {
    if (c.lit) return;
    c.lit = true;
    c.flame.visible = !c.lamp;
    if (c.lamp) S.C.lamparinaLit = true;
    if (!quiet) { G.audio.tone(392, 0.4, 'sine', 0.05); G.toast(c.lamp ? 'A LAMPARINA ACENDEU' : 'A VELA ACENDEU'); }
  },

  // as imagens saem do depósito (as de lá somem do lugar)
  wakeStatues(G, S) {
    if (S.statues.length) return;
    const C = S.C;
    C.sheetsAway(true);
    S.statuesOn = true;
    for (const [x, z, h] of STATUES) {
      const p = C.local(x, z, 0);
      p.y = G.ctx.groundAt(p.x, p.z, p.y + 1);
      const obj = G.group(part(G.ctx, k => sheetFigure(k, h), p.x, p.y, p.z));
      // uns segundos parados antes de começar a andar
      S.statues.push({ obj, x: p.x, z: p.z, y: p.y, h, wait: 3 + Math.random() * 2, hurtT: 0, scrapeT: 0 });
    }
  },

  // quadro a quadro: andam quando ninguém olha (nem de lado, nem atrás de parede)
  moveStatues(G, dt, S) {
    const C = S.C, o = C.local(0, 0, 0), P = G.player.pos, cam = G.camera, ctx = G.ctx;
    if (!inChurch(G)) return;
    cam.getWorldDirection(v3);
    const pRoom = room(P.x - o.x, P.z - o.z), up = P.y - o.y > 2.5;
    for (const s of S.statues) {
      if (s.down) continue;
      s.hurtT = Math.max(0, s.hurtT - dt); s.wait = Math.max(0, s.wait - dt);
      const dx = P.x - s.x, dz = P.z - s.z, d = Math.hypot(dx, dz);
      // visto: na frente da câmera, perto o bastante e sem parede no meio
      v3b.set(s.x - cam.position.x, s.y + 1.0 - cam.position.y, s.z - cam.position.z);
      const dc = v3b.length();
      v3b.divideScalar(dc || 1);
      const seen = v3b.dot(v3) > 0.62 && dc < 30 && ctx.collision.raycast(cam.position.x, cam.position.y, cam.position.z, v3b.x, v3b.y, v3b.z, dc) > dc - 0.6;
      if (seen) { if (s.moving) { s.moving = false; scrape(G.audio, d, 0.5); } continue; }
      // jogador lá em cima (coro, torre): elas esperam
      if (up || s.wait > 0) continue;
      // destino: o jogador; se ele está noutro cômodo, a porta deste cômodo ou o vão da
      // mesa de comunhão (planta da igreja)
      const sl = { x: s.x - o.x, z: s.z - o.z }, sRoom = room(sl.x, sl.z);
      let fx = P.x - o.x, fz = P.z - o.z;
      const door = r => (r === 'sac' ? -3.6 : 3.6);
      if (sRoom === 'sac' || sRoom === 'dep') { if (pRoom !== sRoom) { fx = door(sRoom); fz = 27.95; } }
      else if (sRoom === 'pres') {
        if (pRoom === 'nave') { fx = 0; fz = 26.2; }
        else if ((pRoom === 'sac' || pRoom === 'dep') && Math.hypot(sl.x - door(pRoom), sl.z - 27.95) > 0.6) { fx = door(pRoom); fz = 27.95; }
      } else if (pRoom !== 'nave') { fx = 0; fz = 27.4; }
      // na nave, pelos corredores (bancos e colunas fecham o resto): noutro corredor, vai
      // pelo seu até a passagem de trás ou da frente e atravessa
      if (sRoom === 'nave') {
        const sLane = lane(sl.x), fLane = lane(fx);
        if (sLane !== fLane) {
          if (nearCross(sl.z)) { fx = LANES[fLane]; fz = sl.z; }
          else {
            const zc = Math.abs(sl.z - CROSS[0]) + Math.abs(fz - CROSS[0]) < Math.abs(sl.z - CROSS[1]) + Math.abs(fz - CROSS[1]) ? CROSS[0] : CROSS[1];
            fx = LANES[sLane]; fz = Math.abs(sl.x - LANES[sLane]) > 0.4 ? sl.z : zc;
          }
        }
      }
      const tx = o.x + fx, tz = o.z + fz;
      const ux = tx - s.x, uz = tz - s.z, l = Math.hypot(ux, uz) || 1;
      const nx = s.x + ux / l * SPEED * dt, nz = s.z + uz / l * SPEED * dt;
      // vela acesa por perto: não chegam
      if (S.candles.some(c => c.lit && Math.hypot(nx - c.x, nz - c.z) < SAFE_R)) continue;
      const pos = { x: nx, y: s.y, z: nz };
      ctx.collision.resolve(pos, 0.36, 1.6);
      s.x = pos.x; s.z = pos.z;
      s.y = ctx.groundAt(s.x, s.z, s.y + 0.4);
      s.obj.position.set(s.x, s.y, s.z);
      s.obj.rotation.y = Math.atan2(dx, dz);
      s.moving = true;
      s.scrapeT -= dt;
      if (s.scrapeT <= 0) { s.scrapeT = 0.9 + Math.random() * 0.6; scrape(G.audio, d, 0.35); }
      // encostou: machuca e para um pouco
      if (d < 0.95 && s.hurtT <= 0 && Math.abs(P.y - s.y) < 1.2) {
        s.hurtT = 1.4; s.wait = 1.2;
        G.combat.hurt(16, dx / (d || 1), dz / (d || 1), { knock: 6 });
        SFX.whisper(G.audio, 1);
      }
    }
  },

  // todas as luzes acesas: os lençóis caem vazios, a igreja acende sozinha e o sino toca
  collapse(G, S) {
    S.statuesOn = false;
    const fx = G.effects;
    for (const s of S.statues) {
      s.down = true;
      s.obj.visible = false;
      for (let i = 0; i < 14; i++) fx.spawn({ p: new THREE.Vector3(s.x, s.y + 0.4 + Math.random() * s.h, s.z), v: new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.2), life: 1.4, s0: 0.12, s1: 0.3, color: [0.55, 0.53, 0.5], drag: 1.5 });
      G.build(B => { B.col = [0.62, 0.62, 0.62]; B.box('int:i:sheet', s.x, s.y, s.z, 1.1, 0.06, 0.9, Math.random() * 3, { uvScale: 1 }); B.col = [1, 1, 1]; });
    }
    S.C.dark = false;
    SFX.whisper(G.audio, 1);
    G.combat.shake = 0.25;
    G.after(1.2, () => { for (let i = 0; i < 3; i++) setTimeout(() => { G.audio.bell(); S.C.ring(); }, i * 1500); G.toast('O SINO TOCOU SOZINHO'); });
  },
};

// pedra arrastando no ladrilho (ruído grave e curto)
function scrape(audio, d, k = 0.4) {
  const c = audio.ctx;
  if (!c || !audio.white || d > 22) return;
  const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = audio.white;
  f.type = 'bandpass'; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(260, t + 0.5); f.Q.value = 2.2;
  const v = k * 0.08 * Math.max(0, 1 - d / 22);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(f).connect(g).connect(audio.master);
  src.start(t, Math.random() * 1.5); src.stop(t + 0.6);
}
