import { places, crate, frame } from './common.js';
import { ipt } from './ch03.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 6 — Lua Cheia. O céu abre e a lua cheia aparece. O professor conta a lenda
// do sétimo filho: o Rudi carteiro é o sétimo guri dos Hoffmann. Bala comum não mata
// lobisomem: o revólver do delegado no museu, a prata dos castiçais da igreja e a forja
// do Seu Arno. Depois, a caçada. No fim, no lugar da fera, o Rudi, vivo.

const EDGAR = 'PROFESSOR EDGAR', PADRE = 'PADRE BERNARDO', ARNO = 'SEU ARNO';

export default {
  n: 6, title: 'Lua Cheia', sub: 'O sétimo filho homem não dorme em noite de lua cheia.',
  weather: 'luaCheia',
  deathText: 'O LOBISOMEM TE PEGOU',
  start(G) { const p = places(G).praca; return { x: p.x + 4, z: p.z - 6, h: 0 }; },
  setup(G, S) {
    const P = places(G), st = G.player.pos;
    G.npcs.stage('edgar', { x: st.x - 1.8, z: st.z + 1.5, h: Math.atan2(1.8, -1.5), talks: [[
      'Lua cheia. Escuta esse uivo. Isso não é cachorro, meu jovem.',
      'Os velhos daqui contavam: o sétimo filho homem, se o irmão mais velho não for padrinho dele, vira lobisomem depois dos treze anos.',
      'Os Hoffmann tiveram sete guris. O mais novo é o Rudi, o carteiro. Ninguém viu o Rudi desde que escureceu.',
      'Bala comum não mata lobisomem. Tem que ser prata. O revólver do delegado Kunz está no museu, na vitrine da sala de entrada.',
      'A prata, a igreja tem: os castiçais do altar. E o Seu Arno era ferreiro antes de se aposentar. A forja dele fica perto do calçadão.',
      'Por favor... se puder, não mate o rapaz. Mate a maldição.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'edgar') G.next(); } });
    // forja do Seu Arno, perto do calçadão
    const path = P.calcadao, q = path[Math.floor(path.length * 0.55)];
    const sp = G.freeSpot(q[0], q[1], 4, 12, 40) || [q[0] + 6, q[1]];
    S.forge = { x: sp[0], z: sp[1] };
    G.build(B => {
      const x = sp[0], z = sp[1], y = G.y(x, z);
      B.box('brickOld', x, y - 0.05, z, 1.4, 0.9, 1.0, 0.4, { uvScale: 1 });            // fornalha
      B.col = [0.2, 0.05, 0.02]; B.box('carPaint', x, y + 0.85, z, 1.0, 0.08, 0.6, 0.4, { uvScale: 1 }); B.col = [1, 1, 1];
      const f = frame(x, z, 0.4), a = f(1.5, 0.4);
      B.box('iron', a[0], y - 0.02, a[1], 0.3, 0.55, 0.3, 0.4, { uvScale: 1 });            // bigorna
      B.box('iron', a[0], y + 0.53, a[1], 0.7, 0.18, 0.28, 0.4, { uvScale: 1 });
      G.solid(x, z, 0.75, 0.55, 0.4, y - 0.1, y + 1);
      G.solid(a[0], a[1], 0.35, 0.18, 0.4, y, y + 0.7);
    });
    G.supplies([['ammo9', 12], ['shells', 8], ['cuca', 1]], P.praca.x, P.praca.z, 25, { r0: 6 });
    G.supplies([['ammo9', 12], ['oil', 1], ['cha', 1]], P.museuDoor.x, P.museuDoor.z, 20, { r0: 5 });
  },
  tick(G, dt, S) {
    const f = S.forge;
    if (f) G.atmo.light(f.x, G.y(f.x, f.z) + 1.3, f.z, S.flags.forgeHot ? [1.8, 0.8, 0.3] : [0.8, 0.35, 0.12], S.flags.forgeHot ? 9 : 5, 3);
    // uivos de vez em quando
    S.howlT = (S.howlT ?? 6) - dt;
    if (S.howlT <= 0 && !S.boss) { S.howlT = 14 + Math.random() * 12; SFX.howl(G.audio, 70 + Math.random() * 40); }
  },
  steps: [
    {
      id: 'edgar', obj: 'Fale com o Professor Edgar',
      marker: G => { const n = G.npcs.byId.edgar; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
      enter(G) { G.after(1.5, () => SFX.howl(G.audio, 60)); },
    },
    {
      id: 'museu', obj: 'Pegue o revólver no Museu',
      marker: G => { const d = places(G).museuDoor; return [d.x, null, d.z]; },
      enter(G, S) {
        G.ambient({ types: { dog: 2 }, max: 3, every: [16, 26] });
        const d = places(G).museuDoor;
        G.build(B => crate(B, G, d.x, d.z, d.h, 0.8, 'MUSEU'));
        G.use('vitrine', [d.x, G.y(d.x, d.z) + 1, d.z], 2.8, 'ABRIR A VITRINE', () => {
          G.give('revolver', 1, { mag: 0 });
          G.toast('REVÓLVER .38 — SEM BALAS DE PRATA');
          // o lobisomem passa correndo ao longe
          const P = G.player.pos, h = G.player.heading;
          const sx = P.x - Math.sin(h) * 26 + Math.cos(h) * 18, sz = P.z - Math.cos(h) * 26 - Math.sin(h) * 18;
          const w = G.spawn('werewolf', sx, sz, {});
          w.untargetable = true; w.passive = true;
          const ex = sx - Math.cos(h) * 40, ez = sz + Math.sin(h) * 40;
          w.think = function (dt) { this.state = 'run'; this.moveToward(dt, ex, ez, 10, 5); this.stickGround(dt); if (Math.hypot(this.pos.x - ex, this.pos.z - ez) < 2 || this.st > 6) this.removed = true; };
          SFX.howl(G.audio, 25);
          G.next();
        });
      },
    },
    {
      // o padre espera no altar, dentro da igreja (os castiçais estão em cima dele)
      id: 'prata', obj: 'Peça a prata ao padre, no altar da igreja',
      marker: G => {
        const n = G.npcs.byId.bernardo;
        if (G.interiors.indoor?.name === 'igreja' && n) return [n.pos.x, n.pos.y + 2.2, n.pos.z];
        const d = places(G).churchDoor; return [d.x, null, d.z];
      },
      enter(G) {
        const p = ipt(G, 'igreja', 'padre'), d = places(G).churchDoor;
        G.npcs.stage('bernardo', { ...(p ? { x: p.x, z: p.z, h: p.h } : { x: d.x, z: d.z, h: d.h + Math.PI }), talks: [[
          'Os castiçais do altar? São da primeira capela, de 1880. Prata de verdade, trazida da Alemanha.',
          'Se é pra salvar o Rudi, Deus entende. Leva os três. E volta inteiro.',
        ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'prata') { G.give('silverware', 3); G.toast('CASTIÇAIS DE PRATA'); G.next(); } } });
      },
    },
    {
      id: 'forja', obj: 'Leve a prata à forja do Seu Arno',
      marker: G => { const f = G.S.forge; return [f.x, null, f.z]; },
      enter(G, S) {
        const f = S.forge;
        G.npcs.stage('arno', { x: f.x - 1.6, z: f.z + 1.4, h: Math.atan2(1.6, -1.4), talks: [[
          'Prata, é? Faz quarenta anos que eu não acendo essa forja. Mas a mão não esquece.',
          'Põe os castiçais aí no cadinho e segura o fole. Quando a prata ficar vermelha, a gente despeja no molde.',
        ]] });
        G.use('fundir', [f.x, G.y(f.x, f.z) + 1, f.z], 2.8, 'FUNDIR A PRATA', () => {
          G.inventory.take('silverware', 3);
          G.give('silver', 12);
          G.guns.equip('revolver'); G.guns.reloadGun('revolver'); G.guns.teach();
          G.toast('BALAS DE PRATA ×12');
          S.flags.forgeHot = false;
          G.next();
        }, { hold: 4, cond: () => G.inventory.count('silverware') > 0 });
      },
      update(G, dt, S) { S.flags.forgeHot = G.S.progress?.f > 0; },
    },
    {
      id: 'lobisomem', obj: 'Cace o lobisomem',
      enter(G, S) {
        G.ambient(null);
        const f = S.forge;
        G.checkpoint(f.x + 3, f.z, 0);
        // munição de prata que volta, perto da forja
        G.pickup('silver', f.x + 2, f.z - 1.5, { n: 6, respawn: 35 });
        G.after(2, () => {
          SFX.howl(G.audio, 15);
          G.combat.shake = 0.3;
          const sp = G.freeSpot(f.x, f.z, 14, 20) || [f.x + 15, f.z];
          S.boss = G.spawn('werewolf', sp[0], sp[1], { arena: { x: f.x, z: f.z, r: 30 } });
          G.boss(S.boss, 'O LOBISOMEM');
          G.toast('SÓ A PRATA FERE DE VERDADE');
        });
      },
      update(G, dt, S) { return S.boss?.dead && (S.boss.humanized || S.boss.deadT > 4); },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.6); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        G.narrate([
          'A fera caiu de joelhos na grama molhada de orvalho. O pelo foi clareando, caindo, até não sobrar nada.',
          'No lugar do lobisomem estava o Rudi, o carteiro. Tremendo, encolhido, vivo.',
          'A prata não matou o homem. Matou a maldição. E lá no morro, alguém gritou de raiva.',
        ], () => G.complete(), { title: 'LUA CHEIA' });
      },
    },
  ],
};
