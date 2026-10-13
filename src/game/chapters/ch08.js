import * as THREE from 'three';
import { places, nestMesh, Breakable, frame, front } from './common.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 8 — Asas da Noite. A bruxa aparece no telhado da igreja e some rindo.
// Os morcegos-vampiro gigantes fizeram ninhos pela cidade (pavilhão da festa, escola,
// salão paroquial): queimar ou explodir os três. Depois, a rainha deles na torre.

const PADRE = 'PADRE BERNARDO', MARLENE = 'MARLENE';

export default {
  n: 8, title: 'Asas da Noite', sub: 'Eles sangram o gado. E agora, a gente.',
  weather: 'noite',
  deathText: 'OS MORCEGOS TE SANGRARAM',
  start(G) { const y = places(G).churchYard; return { x: y.x - 4, z: y.z + 3, h: y.h }; },
  setup(G, S) {
    const P = places(G);
    // três ninhos nas fachadas
    const spots = [];
    const k = P.kartoffel, kf = frame(k.x, k.z, k.rot)(0, 11.5);
    spots.push({ x: kf[0], z: kf[1], name: 'PAVILHÃO' });
    if (P.escola) { const f = front(P.escola, 0.6); spots.push({ x: f.x, z: f.z, name: 'ESCOLA' }); }
    if (P.salao) { const f = front(P.salao, 0.6); spots.push({ x: f.x, z: f.z, name: 'SALÃO PAROQUIAL' }); }
    while (spots.length < 3) { const s = G.freeSpot(P.praca.x, P.praca.z, 10, 30) || [P.praca.x, P.praca.z]; spots.push({ x: s[0], z: s[1], name: 'PRAÇA' }); }
    S.nests = spots.map(s => {
      const y = G.y(s.x, s.z) + 3.4;
      const b = new Breakable(G, nestMesh(), s.x, y, s.z, { hp: 6, r: 1.0, name: 'NINHO', resist: { light: 3, explosion: 3, fire: 3, melee: 0.6, bullet: 1, ray: 1.2, silver: 1 }, onBreak: () => G.S.def.nestBroken(G, G.S) });
      G.combat.spawn(b);
      return { ...s, b, woke: false };
    });
    G.supplies([['shells', 8], ['ammo9', 12], ['oil', 1]], P.churchYard.x, P.churchYard.z, 20, { r0: 5 });
    G.supplies([['shells', 8], ['cuca', 1], ['dynamite', 1]], P.kartoffel.x, P.kartoffel.z, 25, { r0: 12 });
    G.supplies([['ammo9', 12], ['cha', 1], ['oil', 1]], P.praca.x, P.praca.z, 25, { r0: 6 });
    S.broken = 0;
  },
  // salvamento: ninhos já destruídos
  saveState(G, S) { return { broken: S.nests.map(n => n.b.dead) }; },
  loadState(G, S, c) {
    (c.broken || []).forEach((dead, i) => {
      const n = S.nests[i];
      if (!dead || !n) return;
      n.b.dead = true; n.b.removed = true; n.b.root.visible = false; n.woke = true;
    });
    S.broken = S.nests.filter(n => n.b.dead).length;
  },
  tick(G, dt, S) { for (const n of S.nests || []) if (!n.b.dead) G.atmo.light(n.x, n.b.pos.y - 0.5, n.z, [0.6, 0.18, 0.12], 6, 2); },
  steps: [
    {
      id: 'bruxa', obj: null,
      enter(G, S) {
        const t = places(G).gable, yd = places(G).churchYard;
        const w = G.spawn('witch', t.x, t.z, { y: t.y + 2, intro: false });
        w.untargetable = true; w.passive = true;
        w.think = function (dt) { this.pos.y = t.y + 2 + Math.sin(this.st * 1.5) * 0.3; this.face(dt, Math.atan2(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z)); };
        S.witchShow = w;
        G.after(0.6, () => SFX.cackle(G.audio, 20));
        G.cut({
          dur: 5, label: 'A BRUXA OTÍLIA',
          cam: (tt, cam, G2) => { const a = yd.h + Math.PI, x = yd.x + Math.sin(a) * 4, z = yd.z + Math.cos(a) * 4; G2.camAt(x, G2.y(x, z) + 1.6, z, t.x, t.y + 3 - tt * 0.1, t.z); },
          then: () => {
            // some numa revoada de morcegos
            for (let i = 0; i < 30; i++) G.effects.spawn({ p: new THREE.Vector3(t.x, t.y + 2, t.z), v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6), life: 1.2, s0: 0.15, s1: 0, color: [0.1, 0.08, 0.08], drag: 1 });
            S.witchShow.removed = true;
            G.wave([{ type: 'bat', n: 3, at: { x: t.x, z: t.z, r0: 2, r1: 8 } }]);
            G.after(2, () => G.talk([[PADRE, [
              'Tu viu? Era ela, em cima da igreja! Rindo da gente!',
              'Os morcegos vieram com ela. Os vampiros grandes. Fizeram ninhos pela cidade: no pavilhão da festa, na escola e no salão paroquial.',
              'Se deixar, eles vão sangrar o gado e a gente até o fim da noite. Queima os ninhos. Fogo, luz ou dinamite.',
            ], 150]], () => G.next()));
          },
        });
      },
    },
    {
      id: 'ninhos', obj: 'Destrua os ninhos de morcego (0/3)',
      marker: G => { const n = G.S.nests.filter(q => !q.b.dead).sort((a, b) => G.dist(a.x, a.z) - G.dist(b.x, b.z))[0]; return n ? [n.x, n.b.pos.y + 1.5, n.z] : null; },
      enter(G) { G.ambient({ types: { bat: 2, dog: 1 }, max: 3, every: [14, 22] }); },
      update(G, dt, S) {
        for (const n of S.nests) {
          if (n.woke || n.b.dead || !G.near(n.x, n.z, 22)) continue;
          n.woke = true;
          G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
          G.wave([{ type: 'bat', n: 3, at: { x: n.x, z: n.z, r0: 1, r1: 6 } }]);
          SFX.screech(G.audio, 10, 0.8);
          G.toast('NINHO: ' + n.name);
        }
        return S.broken >= 3;
      },
      onRespawn(G, S) { for (const n of S.nests) if (!n.b.dead) n.woke = false; },
    },
    {
      id: 'torre', obj: 'Vá até a torre da igreja',
      marker: G => { const y = places(G).churchYard; return [y.x, null, y.z]; },
      enter(G) { G.ambient({ types: { bat: 1, dog: 1 }, max: 2, every: [18, 26] }); },
      update(G, dt, S) {
        const y = places(G).churchYard, t = places(G).tower;
        if (!G.near(y.x, y.z, 12)) return false;
        G.ambient(null);
        G.checkpoint(y.x, y.z, y.h);
        S.boss = G.spawn('batQueen', t.x, t.z, { y: t.y + 3, perch: { x: t.x, y: t.y + 0.5, z: t.z }, arena: { x: y.x, z: y.z, r: 26 } });
        G.boss(S.boss, 'A RAINHA DOS MORCEGOS');
        SFX.screech(G.audio, 8, 0.5);
        G.combat.shake = 0.4;
        G.pickup('shells', y.x + 4, y.z - 3, { n: 6, respawn: 30 });
        G.pickup('ammo9', y.x - 4, y.z + 3, { n: 12, respawn: 30 });
        return true;
      },
    },
    {
      id: 'rainha', obj: 'Derrube a rainha dos morcegos', resumeAs: 'torre',
      update(G, dt, S) { return S.boss?.dead && S.boss.deadT > 2.5; },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.6); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        const y = places(G).churchYard;
        G.npcs.stage('marlene', { x: y.x + 2, z: y.z + 2, h: y.h + Math.PI });
        G.after(1.5, () => G.talk([
          [MARLENE, [
            'Tu tá vivo! Escuta: eu vi o chupacabras. Agora há pouco, atravessando a estrada, mancando de uma perna.',
            'Ia pro morro, pro lado da gruta, depois da clareira. Deixando rastro de sangue.',
          ], 330],
          [PADRE, [
            'O diário dizia: o bicho é o coração do feitiço. Enquanto ele estiver solto, ela não cansa.',
            'Se tu pegar o chupacabras vivo, a Otília fica fraca. Na agropecuária tem rifle de dardos pra boi bravo.',
          ], 150],
        ], () => G.complete()));
      },
    },
  ],
  nestBroken(G, S) {
    S.broken++;
    G.autosave('ninho', true);
    G.obj(`Destrua os ninhos de morcego (${S.broken}/3)`);
    SFX.screech(G.audio, 5, 0.7);
    G.toast('NINHO DESTRUÍDO ' + S.broken + '/3');
  },
};
