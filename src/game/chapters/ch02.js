import { places, crate, frame } from './common.js';

// Capítulo 2 — Os Cães de Fogo. A primeira noite: o sino toca sozinho, cães em brasa
// saem do chão. O padre explica a bruxa e pede tempo para tocar o sino benzido; a
// espingarda dos atiradores fica na Sociedade. No fim, defender a igreja.

const PADRE = 'PADRE BERNARDO', V = 150;
const DEFENSE = 75;

export default {
  n: 2, key: 'caes', title: 'Os Cães de Fogo', sub: 'O sino tocou sozinho. Ninguém subiu na torre.',
  weather: 'anoitecer',
  deathText: 'OS CÃES TE PEGARAM',
  start(G) {
    const P = places(G), c = P.coop, d = P.churchDoor;
    return { x: c.x - 5, z: c.z + 6, h: Math.atan2(d.x - c.x, d.z - c.z) };
  },
  setup(G, S) {
    // o resto da luz do dia vai embora devagar
    G.after(0.5, () => G.weather('noite', 40));
    const P = places(G), d = P.churchDoor;
    G.npcs.stage('bernardo', { x: d.x + Math.sin(d.h + Math.PI) * 1.2, z: d.z + Math.cos(d.h + Math.PI) * 1.2, h: d.h + Math.PI, talks: [[
      'Tu ouviu? O sino tocou sozinho. Três vezes. E ninguém subiu na torre.',
    ]] });
    // armas brancas e munição pelo caminho
    const c = P.coop;
    G.pickup('pau', c.x - 2, c.z + 3.5);
    G.pickup('pedra', c.x - 6, c.z + 2, { n: 3 });
    G.supplies([['ammo9', 12], ['cuca', 1], ['cano', 1]], P.churchYard.x, P.churchYard.z, 18, { r0: 6 });
    G.supplies([['ammo9', 12], ['pedra', 3]], P.praca.x, P.praca.z, 25);
    G.supplies([['ammo9', 12], ['cha', 1]], (P.church.x + P.sociedadeDoor.x) / 2, (P.church.z + P.sociedadeDoor.z) / 2, 30);
  },
  steps: [
    {
      id: 'sino', obj: 'Vá até a Igreja Matriz',
      marker: G => { const d = places(G).churchDoor; return [d.x, null, d.z]; },
      enter(G) {
        for (let i = 0; i < 3; i++) setTimeout(() => G.audio.bell(), 600 + i * 1800);
        G.after(1.2, () => G.toast('O SINO TOCOU SOZINHO'));
        G.after(5, () => {
          const P = G.player.pos, d = places(G).churchDoor;
          const a = Math.atan2(d.x - P.x, d.z - P.z);
          G.wave([{ type: 'dog', n: 2, at: { x: P.x + Math.sin(a) * 14, z: P.z + Math.cos(a) * 14, r0: 0, r1: 5 } }]);
          G.hud.showHints({
            keyboard: ['V golpe   C esquiva   1-8 troca de arma', 'H come ou bebe para curar   F pega itens'],
            pad: ['RB golpe   B (toque rápido) esquiva', '◀▶ troca de arma   A pega itens'],
            touch: ['GOLPE soca   ESQUIVA desvia', 'ARMA troca de arma'],
          });
        });
      },
      update(G) { const d = places(G).churchDoor; return G.near(d.x, d.z, 7) && G.S.stepT > 6; },
    },
    {
      id: 'padre', obj: 'Fale com o Padre Bernardo',
      marker: G => { const n = G.npcs.byId.bernardo; return n ? [n.pos.x, n.pos.y + 2.3, n.pos.z] : null; },
      enter(G) {
        G.ambient({ types: { dog: 1 }, max: 2, every: [18, 30] });
        G.npcs.stage('bernardo', {
          talks: [[
            'Tu ouviu? O sino tocou sozinho. Três vezes. E ninguém subiu na torre.',
            'Os antigos diziam em hunsrik: quando o sino toca sem mão, die Hex ist wach. A bruxa acordou.',
            'Otília Kranz. Curandeira. Em 1878 os colonos acusaram ela de matar o gado e enterraram ela viva no mato, com uma cruz de ferro em cima.',
            'O gado quem matava era o bicho dela. O Blutsauger. Ele fugiu pra mata e ficou lá esse tempo todo, esperando.',
            'Tu feriu o bicho hoje. O sangue dele correu até o túmulo... e ela voltou. Trouxe a noite junto.',
            'Esses cães de fogo são dela. Se eu tocar o sino com a reza certa, eles fogem. Mas vou precisar de tempo lá em cima, e eles vão vir.',
            'Na Sociedade fica a sala dos atiradores do Schützenfest. As espingardas estão no armário dos troféus. Toma a chave. Traz uma e volta pra cá.',
          ]],
          onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'padre') { G.give('key', 1); G.toast('CHAVE DA SALA DE TIRO'); G.next(); } },
        });
      },
    },
    {
      id: 'sociedade', obj: 'Pegue a espingarda na Sociedade',
      marker: G => { const d = places(G).sociedadeDoor; return [d.x, null, d.z]; },
      enter(G) {
        const d = places(G).sociedadeDoor;
        G.ambient({ types: { dog: 1 }, max: 3, every: [14, 24] });
        G.build(B => crate(B, G, d.x + Math.sin(d.h) * -0.3, d.z + Math.cos(d.h) * -0.3, d.h, 1.0, 'TIRO'));
        G.use('armario', [d.x, G.y(d.x, d.z) + 1, d.z], 2.8, 'ABRIR O ARMÁRIO', () => {
          G.inventory.take('key', 1);
          G.give('shotgun', 1, { mag: 2 });
          G.give('shells', 16);
          G.guns.equip('shotgun'); G.guns.teach();
          G.toast('ESPINGARDA DE DOIS CANOS');
          G.next();
        });
      },
    },
    {
      id: 'emboscada', obj: 'Sobreviva aos cães',
      enter(G) {
        G.ambient(null);
        const P = G.player.pos;
        G.checkpoint(P.x, P.z, G.player.heading);
        G.after(1.2, () => {
          G.sting();
          G.wave([{ type: 'dog', n: 4, at: { x: P.x, z: P.z, r0: 10, r1: 16 } }], () => { G.S.flags.ambushDone = true; });
        });
      },
      update(G, dt, S) { return S.flags.ambushDone; },
      onRespawn(G, S) { S.flags.ambushDone = false; G.combat.clearEnemies(); const P = G.player.pos; G.wave([{ type: 'dog', n: 3, at: { x: P.x, z: P.z, r0: 12, r1: 16 } }], () => { S.flags.ambushDone = true; }); },
    },
    {
      id: 'volta', obj: 'Volte para a igreja',
      marker: G => { const d = places(G).churchYard; return [d.x, null, d.z]; },
      enter(G) { G.ambient({ types: { dog: 1 }, max: 3, every: [12, 22] }); },
      update(G) { const d = places(G).churchYard; return G.near(d.x, d.z, 9); },
    },
    {
      id: 'defesa', obj: 'Defenda a igreja enquanto o sino toca',
      enter(G, S) {
        G.ambient(null);
        const y = places(G).churchYard;
        G.checkpoint(y.x, y.z, y.h);
        S.def.startDefense(G, S);
      },
      update(G, dt, S) {
        const D = S.defense;
        D.t += dt;
        S.progress = { label: 'O SINO', f: D.t / DEFENSE, keep: true };
        D.bell -= dt;
        if (D.bell <= 0) { D.bell = 4.2; G.audio.bell(); }
        const y = places(G).churchYard;
        for (const w of D.plan) {
          if (!w.done && D.t >= w.at) {
            w.done = true;
            G.wave(w.list.map(l => ({ ...l, at: { x: y.x, z: y.z, r0: 18, r1: 26 } })));
            if (w.at > 0) G.toast('MAIS CÃES!');
          }
        }
        if (D.t >= DEFENSE) {
          // o sino benzido: os cães se desfazem
          S.progress = null;
          for (const e of G.combat.enemies) if (!e.dead) e.die({});
          for (let i = 0; i < 4; i++) setTimeout(() => G.audio.bell(), i * 700);
          G.combat.shake = 0.3;
          return true;
        }
      },
      onRespawn(G, S) { G.combat.clearEnemies(); S.def.startDefense(G, S); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        G.after(2.5, () => G.talk([
          [PADRE, [
            'Ouviu como eles fugiram? O sino ainda tem força.',
            'Mas olha o céu. Era pra estar clareando. Não vai clarear.',
            'Enquanto a Otília estiver solta, o sol não volta pra Teewald.',
            'O Pastor Wendt, que enterrou ela, deixou diários. Vou procurar na casa paroquial. Descansa um pouco, se tu conseguir.',
          ], V],
        ], () => G.complete()));
      },
    },
  ],
  startDefense(G, S) {
    S.defense = {
      t: 0, bell: 0.5,
      plan: [
        { at: 1, list: [{ type: 'dog', n: 3 }] },
        { at: 20, list: [{ type: 'dog', n: 4 }] },
        { at: 40, list: [{ type: 'dog', n: 3 }, { type: 'bat', n: 2, o: {} }] },
        { at: 58, list: [{ type: 'dog', n: 4 }] },
      ],
    };
  },
};
