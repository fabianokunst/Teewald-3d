import * as THREE from 'three';
import { places, caveMouth, witchGrave } from './common.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 10 — A Bruxa. Lua de sangue. Com o bicho amarrado e os cristais quebrados,
// a Otília cansa. No túmulo dela, mata adentro, a última luta: ela invoca cães,
// fantasmas e morcegos; quando cai de joelhos, fraca, a cruz de ferro sela de novo.
// Depois, o amanhecer.

const PADRE = 'PADRE BERNARDO', EDGAR = 'PROFESSOR EDGAR';

export default {
  n: 10, title: 'A Bruxa', sub: 'A última noite de Teewald.',
  weather: 'luaSangue',
  deathText: 'A BRUXA TE LEVOU',
  start(G) {
    const P = places(G), m = P.caveMouth, cl = P.clearing;
    const a = Math.atan2(cl.x - m.x, cl.z - m.z);
    return { x: m.x + Math.sin(a) * 6, z: m.z + Math.cos(a) * 6, h: a };
  },
  setup(G, S) {
    const P = places(G), m = P.caveMouth, cl = P.clearing, g = P.grave;
    G.build(B => { caveMouth(B, G, m.x, m.z, Math.atan2(cl.x - m.x, cl.z - m.z)); witchGrave(B, G, g.x, g.z); });
    // o padre e o professor esperam na clareira
    G.npcs.stage('bernardo', { x: cl.x - 2, z: cl.z + 1, h: Math.atan2(g.x - cl.x, g.z - cl.z), talks: [[
      'Tu conseguiu. O bicho amarrado, os cristais quebrados... Ouve como o mato ficou quieto.',
      'Ela está no túmulo, te esperando. Mais furiosa do que nunca, mas sem o bicho ela cansa.',
      'Quando ela cair de joelhos, sem forças, põe a cruz de ferro sobre o peito dela. É o único jeito.',
      'Leva isso. Chá de marcela da Dona Gertrud e o resto da munição da cidade. Que Deus vá contigo.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'padre') { G.give('cha', 2); G.give('shells', 10); G.give('silver', 6); G.give('ammo9', 24); G.give('oil', 1); G.toast('CHÁ, MUNIÇÃO E QUEROSENE'); G.next(); } } });
    G.npcs.stage('edgar', { x: cl.x + 1.5, z: cl.z + 2, h: Math.atan2(g.x - cl.x, g.z - cl.z) + 0.4, talks: [['Eu escrevi tudo, meu jovem. Se a gente não voltar, alguém vai saber o que aconteceu em Teewald.']] });
    G.supplies([['ammo9', 12], ['shells', 8], ['cuca', 1]], (m.x + cl.x) / 2, (m.z + cl.z) / 2, 14, { r0: 3 });
  },
  tick(G, dt, S) {
    const g = places(G).grave;
    if (!S.flags.sealed) G.atmo.light(g.x, G.y(g.x, g.z) + 1, g.z, [0.5, 1.0, 0.35], 8, 2);
    if (Math.random() < dt * 6 && !S.flags.sealed) G.effects.spawn({ p: new THREE.Vector3(g.x + (Math.random() - 0.5) * 3, G.y(g.x, g.z) + 0.2, g.z + (Math.random() - 0.5) * 3), v: new THREE.Vector3(0, 1 + Math.random(), 0), life: 1.5, s0: 0.08, s1: 0, color: [0.4, 1, 0.3], drag: 0.5 });
  },
  steps: [
    {
      id: 'padre', obj: 'Fale com o padre na clareira',
      marker: G => { const n = G.npcs.byId.bernardo; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
      enter(G) { G.after(1, () => SFX.cackle(G.audio, 40)); },
    },
    {
      id: 'tumulo', obj: 'Vá até o túmulo da bruxa',
      marker: G => { const g = places(G).grave; return [g.x, null, g.z]; },
      enter(G) { G.ambient({ types: { dog: 2, ghost: 2, bat: 1 }, max: 4, every: [7, 12], r: [16, 24] }); },
      update(G, dt, S) {
        const g = places(G).grave;
        if (!G.near(g.x, g.z, 12)) return false;
        G.ambient(null);
        G.combat.clearEnemies();
        G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
        S.def.spawnWitch(G, S);
        return true;
      },
    },
    {
      id: 'bruxa', obj: 'Enfraqueça a bruxa e use a cruz',
      update(G, dt, S) {
        const w = S.boss;
        if (!w) return false;
        // botão da cruz quando ela está de joelhos e fraca
        const ready = (w.canSeal ?? (w.exhausted && w.hp <= w.maxHp * 0.34)) && !w.sealing && !w.sealed;
        if (ready && !S.flags.crossOn) {
          S.flags.crossOn = true;
          G.toast('AGORA! A CRUZ!');
          G.use('cruz', () => [w.pos.x, w.pos.y + 1.2, w.pos.z], 3.2, 'USAR A CRUZ DE FERRO', () => {
            G.inventory.take('cross', 1);
            w.seal?.();
            S.flags.sealing = true;
            G.combat.clearEnemies(e => e !== w);
            G.cut({ dur: 4.6, label: null, cam: (t, cam, G2) => { const p = w.pos, P = G2.player.pos; const a = t * 0.4; G2.camAt(p.x + Math.sin(a) * 5, p.y + 1.8 + t * 0.3, p.z + Math.cos(a) * 5, p.x, p.y + 1.2 + t * 0.4, p.z); } });
          }, { cond: () => w.exhausted && !w.sealing });
        } else if (!ready && S.flags.crossOn && !S.flags.sealing) { S.flags.crossOn = false; G.unuse('cruz'); }
        if (w.exhausted && w.hp > w.maxHp * 0.34 && !S.flags.hintWeak) { S.flags.hintWeak = true; G.toast('ELA CAIU! ATAQUE AGORA!'); }
        return !!(w.sealed || (w.dead && S.flags.sealing));
      },
      onRespawn(G, S) {
        S.flags.crossOn = false; G.unuse('cruz');
        if (!G.inventory.has('cross')) G.give('cross', 1);
        if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.5);
      },
    },
    {
      id: 'amanhecer', obj: null,
      enter(G, S) {
        S.flags.sealed = true;
        G.combat.boss = null;
        G.combat.clearEnemies();
        G.weather('amanhecer', 14);
        G.after(2, () => G.narrate([
          'A cruz afundou no peito dela como se fosse terra mole. O grito durou até o fôlego acabar.',
          'Depois veio o silêncio. E, atrás do morro, um risco cinza. Depois laranja.',
          'Pela primeira vez em muitos dias, o sol nasceu sobre Teewald.',
        ], () => {
          const g = places(G).grave;
          G.cut({ dur: 7, label: 'AMANHECER', cam: (t, cam, G2) => { const P = G2.player.pos; G2.camAt(P.x + 4 - t * 0.3, P.y + 2 + t * 0.6, P.z + 4, g.x, G2.y(g.x, g.z) + 1 + t * 1.2, g.z); }, then: () => G.complete() });
        }, { title: 'O SELO' }));
      },
    },
  ],
  spawnWitch(G, S) {
    const g = places(G).grave;
    SFX.cackle(G.audio, 10);
    G.combat.shake = 0.6;
    G.atmo.strike(true);
    const w = G.spawn('witch', g.x, g.z, { arena: { x: g.x, z: g.z, r: 18 }, intro: true });
    // invocações da bruxa: cães, fantasmas e morcegos em volta do jogador
    w.summon = (type, x, z) => {
      if (G.combat.alive(e => e !== w && !e.passive) >= 5) return null;
      const t = type === 'dog' || type === 'ghost' || type === 'bat' ? type : 'dog';
      const sp = G.freeSpot(x, z, 0, 3, 10) || [x, z];
      return G.spawn(t, sp[0], sp[1], {});
    };
    G.boss(w, 'A BRUXA OTÍLIA');
    S.boss = w;
    G.cut({ dur: 4, label: 'A BRUXA OTÍLIA', cam: (t, cam, G2) => { const p = w.pos, P = G2.player.pos; G2.camAt(P.x + (p.x - P.x) * 0.3 - 1.5, P.y + 1.2, P.z + (p.z - P.z) * 0.3 - 1.5, p.x, p.y + 1.6 + t * 0.3, p.z); } });
    // munição que volta perto do túmulo
    G.pickup('shells', g.x + 8, g.z + 6, { n: 6, respawn: 30 });
    G.pickup('ammo9', g.x - 8, g.z - 6, { n: 12, respawn: 30 });
    G.pickup('cuca', g.x + 9, g.z - 7, { respawn: 60 });
  },
};
