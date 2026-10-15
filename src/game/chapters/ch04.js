import * as THREE from 'three';
import { places, spotInForest, crate } from './common.js';
import { TYPES } from '../campaign.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 4 — Luzes no Céu. Tempestade. A repórter viu luzes descendo sobre o campo
// da Sociedade, como em Varginha em 96. No campo, um círculo queimado na grama, o disco
// voador e os ETs. Um raio derruba a nave no mato; de lá sai a pistola de raios e o
// líder deles. Antes de morrer, ele conta da pedra que caiu em 1978.

const MARLENE = 'MARLENE';

export default {
  n: 4, key: 'ets', title: 'Luzes no Céu', sub: 'Igual Varginha, em 96. Só que aqui.',
  weather: 'tempestade',
  deathText: 'OS VISITANTES TE LEVARAM',
  start(G) { const f = places(G).factoryDoor; return { x: f.x + Math.sin(f.h + Math.PI) * 4, z: f.z + Math.cos(f.h + Math.PI) * 4, h: f.h + Math.PI }; },
  setup(G, S) {
    const P = places(G), st = G.player.pos;
    G.npcs.stage('marlene', { x: st.x + 2, z: st.z + 1.5, h: Math.atan2(-2, -1.5), talks: [[
      'Tu também viu? Antes de a chuva apertar, umas luzes desceram em cima do campo da Sociedade.',
      'Verdes, vermelhas, girando, sem fazer barulho nenhum. Igual Varginha, em 96, lembra? Os bichinhos marrons de olho vermelho.',
      'A minha câmera travou na hora. O relógio parou. Olha: onze e cinquenta e dois.',
      'Eu ia contigo... mentira, não vou. Mas tu vai lá. Alguém tem que ver.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'marlene') G.next(); } });
    // círculo queimado no campo
    const f = P.field;
    G.build(B => {
      B.col = [0.12, 0.1, 0.08];
      const y = G.y(f.x, f.z) + 0.04;
      for (let ring = 0; ring < 3; ring++) {
        const r = 7 + ring * 3.2, w = ring === 0 ? 0.9 : 0.5;
        for (let i = 0; i < 40; i++) {
          const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2;
          const P0 = (a, rr) => [f.x + Math.cos(a) * rr, y, f.z + Math.sin(a) * rr];
          B.quad('carPaint', P0(a0, r - w), P0(a0, r + w), P0(a1, r + w), P0(a1, r - w));
        }
      }
      B.col = [1, 1, 1];
    });
    // lugar da queda da nave: mato ao lado do campo
    const ang = (f.ang || 0) + Math.PI / 2;
    S.crash = spotInForest(G, f.x + Math.sin(ang) * 75, f.z + Math.cos(ang) * 75, 7) || spotInForest(G, f.x - 70, f.z, 7) || { x: f.x + 60, z: f.z };
    G.supplies([['ammo9', 12], ['shells', 8], ['cuca', 1]], f.x, f.z, 30, { r0: 12 });
    G.supplies([['ammo9', 12], ['cha', 1], ['pedra', 4]], (st.x + f.x) / 2, (st.z + f.z) / 2, 30);
  },
  tick(G, dt, S) { S.saucer?.update(dt); if (S.fire) { const c = S.crash; if (Math.random() < dt * 30) G.effects.spawn({ p: new THREE.Vector3(c.x + (Math.random() - 0.5) * 6, G.y(c.x, c.z) + 1, c.z + (Math.random() - 0.5) * 6), v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6), life: 1.6, s0: 0.3, s1: 1.2, color: [0.2, 0.2, 0.2], drag: 0.6, grav: -0.4 }); G.atmo.light(c.x, G.y(c.x, c.z) + 2, c.z, [1.2, 0.6, 0.25], 14, 4); } },
  // retomando depois da queda: a nave já está caída no mato; durante a luta no campo, pairando
  resume(G, S, id) {
    const Sc = TYPES.Saucer, order = ['marlene', 'campo', 'ets', 'nave', 'guardas', 'arma', 'lider', 'fim'];
    const k = order.indexOf(id), f = places(G).field, c = S.crash;
    if (!Sc || k < 2) return;
    S.saucer = new Sc({ scene: G.scene, atmo: G.atmo, effects: G.effects, audio: G.audio, ctx: G.ctx, player: G.player, combat: G.combat });
    if (k === 2) { S.saucer.show(f.x, G.y(f.x, f.z) + 22, f.z); S.saucer.beam?.(true); return; }
    S.saucer.show(c.x, G.y(c.x, c.z) + 2, c.z);
    S.saucer.crash?.(c.x, c.z, true);
    const y = G.y(c.x, c.z);
    G.solidCircle(c.x, c.z, 5.2, y - 1, y + 3.5);
  },
  cleanup(G, S) { if (S.saucer) { S.saucer.dispose ? S.saucer.dispose() : S.saucer.hide?.(); S.saucer = null; } },
  steps: [
    {
      id: 'marlene', obj: 'Fale com a Marlene',
      marker: G => { const n = G.npcs.byId.marlene; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
    },
    {
      id: 'campo', obj: 'Vá até o campo da Sociedade',
      marker: G => { const f = places(G).field; return [f.x, null, f.z]; },
      enter(G) { G.ambient({ types: { dog: 2, ghost: 1 }, max: 2, every: [18, 30] }); },
      update(G, dt, S) {
        const f = places(G).field;
        if (!G.near(f.x, f.z, 24)) return false;
        G.ambient(null);
        // o disco desce com o raio de luz
        const Sc = TYPES.Saucer;
        if (Sc && !S.saucer) {
          S.saucer = new Sc({ scene: G.scene, atmo: G.atmo, effects: G.effects, audio: G.audio, ctx: G.ctx, player: G.player, combat: G.combat });
          S.saucer.show(f.x, G.y(f.x, f.z) + 60, f.z);
          S.saucer.flyTo?.(f.x, G.y(f.x, f.z) + 22, f.z, 10);
          G.after(2.5, () => S.saucer?.beam?.(true));
        }
        SFX.ufo(G.audio, 30, 5);
        G.cut({
          dur: 5.5, label: 'LUZES NO CÉU',
          cam: (t, cam, G2) => { const P = G2.player.pos, y = G2.y(f.x, f.z); G2.camAt(P.x + 3, P.y + 1.6, P.z + 3, f.x, y + 10 + t * 2, f.z); },
          then: () => G.next(),
        });
        return false;
      },
    },
    {
      id: 'ets', obj: 'Enfrente os visitantes',
      enter(G, S) {
        const f = places(G).field;
        G.checkpoint(f.x + 14, f.z, 0);
        G.wave([{ type: 'et', n: 3, at: { x: f.x, z: f.z, r0: 0, r1: 5 } }], () => {
          G.toast('MAIS DELES!');
          G.wave([{ type: 'et', n: 4, at: { x: f.x, z: f.z, r0: 4, r1: 10 } }], () => { S.flags.etsDone = true; });
        });
      },
      update(G, dt, S) {
        if (!S.flags.etsDone) return false;
        // um raio acerta o disco e ele cai no mato
        S.flags.etsDone = false;
        G.atmo.strike(true);
        G.combat.shake = 0.6;
        const c = S.crash, f = places(G).field;
        S.saucer?.beam?.(false);
        S.saucer?.flyTo?.(c.x, G.y(c.x, c.z) + 2, c.z, 22);
        G.cut({
          dur: 4.5, label: null,
          cam: (t, cam, G2) => { const P = G2.player.pos; G2.camAt(P.x - 2, P.y + 2.2, P.z - 2, (f.x + c.x) / 2 + (c.x - f.x) * Math.min(1, t / 3) * 0.5, G2.y(c.x, c.z) + 20 - t * 4, (f.z + c.z) / 2 + (c.z - f.z) * Math.min(1, t / 3) * 0.5); },
          then: () => { S.saucer?.crash?.(c.x, c.z); const y = G.y(c.x, c.z); G.solidCircle(c.x, c.z, 5.2, y - 1, y + 3.5); S.fire = !S.saucer; G.combat.shake = 0.5; G.next(); },
        });
      },
      onRespawn(G, S) { G.combat.clearEnemies(); const f = places(G).field; G.wave([{ type: 'et', n: 4, at: { x: f.x, z: f.z, r0: 4, r1: 10 } }], () => { S.flags.etsDone = true; }); },
    },
    {
      id: 'nave', obj: 'Siga a fumaça até a nave caída',
      marker: G => { const c = G.S.crash; return [c.x, null, c.z]; },
      enter(G) { G.ambient({ types: { et: 2, dog: 1 }, max: 3, every: [12, 20] }); },
      update(G, dt, S) {
        const c = S.crash;
        if (!G.near(c.x, c.z, 16)) return false;
        G.ambient(null);
        G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
        G.wave([{ type: 'et', n: 4, at: { x: c.x, z: c.z, r0: 7, r1: 12 } }], () => { S.flags.guards = true; });
        return true;
      },
    },
    {
      id: 'guardas', obj: 'Derrote os guardas da nave', resumeAs: 'nave',
      update(G, dt, S) { return S.flags.guards; },
      onRespawn(G, S) { G.combat.clearEnemies(); const c = S.crash; G.wave([{ type: 'et', n: 3, at: { x: c.x, z: c.z, r0: 4, r1: 9 } }], () => { S.flags.guards = true; }); },
    },
    {
      id: 'arma', obj: 'Examine a nave',
      marker: G => { const c = G.S.crash; return [c.x, null, c.z]; },
      enter(G, S) {
        const c = S.crash;
        G.use('nave', [c.x, G.y(c.x, c.z) + 1.2, c.z], 7, 'EXAMINAR A NAVE', () => {
          G.give('raygun', 1, { mag: 8 });
          G.give('crystal', 1);
          G.guns.equip('raygun'); G.guns.teach();
          G.toast('PISTOLA DE RAIOS');
          G.next();
        });
      },
    },
    {
      id: 'lider', obj: 'Derrote o líder dos visitantes',
      enter(G, S) {
        const c = S.crash;
        G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
        SFX.psychic(G.audio, 5);
        G.after(1.5, () => {
          const sp = G.freeSpot(c.x, c.z, 7, 10) || [c.x + 8, c.z];
          const L = G.spawn('etLeader', sp[0], sp[1], { arena: { x: c.x, z: c.z, r: 16 }, state: 'descend' });
          G.boss(L, 'O VISITANTE');
          S.boss = L;
          G.toast('O ESCUDO CAI COM A PISTOLA DE RAIOS');
        });
      },
      update(G, dt, S) { return S.boss?.dead && S.boss.deadT > 1.8; },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.6); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        G.talk([['???', [
          'A... PEDRA... NOSSA.',
          'CAIU... DO CÉU... NESTE MATO. NO ANO QUE VOCÊS... CHAMAM... 1978.',
          'VIEMOS... BUSCAR. A VELHA... DO MORRO... BEBE A LUZ DELA. FICA FORTE.',
          'VOCÊS... NÃO SABEM... O QUE ACORDARAM.',
        ], 90]], () => G.complete());
      },
    },
  ],
};
