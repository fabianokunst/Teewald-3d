import * as THREE from 'three';
import { places, crate, frame } from './common.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 5 — A Fera da Madrugada. Neblina fechada. Uma coisa maior que um touro
// arrombou o potreiro do Seu Romeu e arrastou duas vacas. Seguir o rastro, ver a Fera
// passar na neblina, buscar dinamite no almoxarifado da Prefeitura e enfrentá-la entre
// as colunas do pavilhão da Kartoffelfest (batendo nelas ela fica tonta).

const ROMEU = 'SEU ROMEU';

export default {
  n: 5, title: 'A Fera da Madrugada', sub: 'Urra feito boi e anda apoiada nas mãos.',
  weather: 'madrugada',
  deathText: 'A FERA TE ESMAGOU',
  start(G) {
    // no meio da Rua Benno Closs, rua acima do pavilhão
    const s = places(G).kartoffel.start;
    return { x: s.x, z: s.z, h: s.h };
  },
  setup(G, S) {
    const P = places(G), st = G.player.pos, k = P.kartoffel;
    G.npcs.stage('romeu', { x: st.x + 1.8, z: st.z + 1.2, h: Math.atan2(-1.8, -1.2), talks: [[
      'Tu é o moço que anda caçando essas coisas? Então escuta.',
      'Hoje de madrugada uma coisa arrombou o meu potreiro. Grande. Maior que um touro.',
      'Urrava feito boi e andava apoiada nas mãos, feito gente. Levou duas vacas inteiras, arrastando pela estrada.',
      'O meu pai contava de uma fera assim na Linha Nova, nos anos setenta. Ninguém acreditava. Eu dei um tiro de espingarda nela e a bala voltou.',
      'O rastro vai pelo lado da Prefeitura. Vai com Deus.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'romeu') G.next(); } });
    // rastro: da Benno Closs até os fundos da Prefeitura, com pegadas enormes, sangue e tábuas quebradas
    const a = { x: st.x, z: st.z }, b = P.prefeituraBack;
    S.trail = [];
    for (let i = 1; i <= 3; i++) {
      const t = i / 3.6;
      const sp = G.freeSpot(lerp(a.x, b.x, t), lerp(a.z, b.z, t), 0, 10, 30, {}) || [lerp(a.x, b.x, t), lerp(a.z, b.z, t)];
      S.trail.push({ x: sp[0], z: sp[1] });
    }
    G.build(B => {
      let prev = a;
      for (const w of [...S.trail, b]) {
        const n = Math.max(2, Math.floor(Math.hypot(w.x - prev.x, w.z - prev.z) / 3));
        for (let i = 0; i < n; i++) {
          const t = i / n, x = lerp(prev.x, w.x, t), z = lerp(prev.z, w.z, t), ang = Math.atan2(w.x - prev.x, w.z - prev.z);
          for (const s of [-1, 1]) {
            const px = x + Math.cos(ang) * 0.7 * s, pz = z - Math.sin(ang) * 0.7 * s, y = G.y(px, pz) + 0.035;
            const f2 = frame(px, pz, ang + s * 0.2), q = (u, v) => { const r = f2(u, v); return [r[0], y, r[1]]; };
            B.quad('chupa:track', q(-0.55, -0.6), q(-0.55, 0.6), q(0.55, 0.6), q(0.55, -0.6));
          }
          if (i % 3 === 1) { const y = G.y(x, z) + 0.03, f3 = frame(x + 1, z, ang), q = (u, v) => { const r = f3(u, v); return [r[0], y, r[1]]; }; B.quad('chupa:blood', q(-0.6, -0.6), q(-0.6, 0.6), q(0.6, 0.6), q(0.6, -0.6)); }
        }
        // tábuas de cerca quebradas
        for (let j = 0; j < 4; j++) B.box('woodGray', w.x + (Math.random() - 0.5) * 3, G.y(w.x, w.z) + 0.02, w.z + (Math.random() - 0.5) * 3, 0.12, 0.06, 1.4, Math.random() * 3, { uvScale: 1 });
        prev = w;
      }
    });
    G.supplies([['ammo9', 12], ['shells', 8], ['cuca', 1]], k.x, k.z, 30, { r0: 14 });
    G.supplies([['ammo9', 12], ['cha', 1], ['cano', 1]], b.x, b.z, 20, { r0: 5 });
  },
  steps: [
    {
      id: 'romeu', obj: 'Fale com o Seu Romeu',
      marker: G => { const n = G.npcs.byId.romeu; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
    },
    {
      id: 'rastro', obj: 'Siga o rastro da Fera',
      marker: G => { const S = G.S, w = S.trail[S.flags.wp || 0]; return w ? [w.x, null, w.z] : null; },
      enter(G) { G.ambient({ types: { dog: 2 }, max: 2, every: [20, 32] }); },
      update(G, dt, S) {
        const i = S.flags.wp || 0, w = S.trail[i];
        if (!w || !G.near(w.x, w.z, 6)) return false;
        S.flags.wp = i + 1;
        if (i === 1) {
          // a Fera cruza a estrada na neblina, longe, e some
          const P = G.player.pos, h = G.player.heading;
          const sx = P.x + Math.sin(h) * 22 + Math.cos(h) * 20, sz = P.z + Math.cos(h) * 22 - Math.sin(h) * 20;
          const ex = P.x + Math.sin(h) * 22 - Math.cos(h) * 24, ez = P.z + Math.cos(h) * 22 + Math.sin(h) * 24;
          const f = G.spawn('fera', sx, sz, { h: Math.atan2(ex - sx, ez - sz) });
          f.untargetable = true; f.passive = true; f.scripted = { x: ex, z: ez };
          f.think = function (dt2) { this.moveToward(dt2, this.scripted.x, this.scripted.z, 11, 4); this.stickGround(dt2); if (Math.hypot(this.pos.x - this.scripted.x, this.pos.z - this.scripted.z) < 2) this.removed = true; };
          SFX.roar(G.audio, 20);
          G.combat.shake = 0.35;
          G.after(3, () => G.toast('GRANDE DEMAIS PARA BALA...'));
        }
        return S.flags.wp >= S.trail.length;
      },
    },
    {
      id: 'dinamite', obj: 'Pegue a dinamite no almoxarifado da Prefeitura',
      marker: G => { const b = places(G).prefeituraBack; return [b.x, null, b.z]; },
      enter(G, S) {
        const b = places(G).prefeituraBack;
        G.build(B => { crate(B, G, b.x, b.z, b.h, 0.9, 'PERIGO'); crate(B, G, b.x + 1.2, b.z + 0.4, b.h + 0.3, 0.7); });
        G.use('dinamite', [b.x, G.y(b.x, b.z) + 1, b.z], 2.8, 'PEGAR A DINAMITE', () => {
          G.give('dynamite', 5);
          G.guns.equip('dynamite'); G.guns.teach();
          G.toast('DINAMITE ×5');
          G.checkpoint(b.x, b.z, b.h);
          G.after(1.2, () => { const P = G.player.pos; G.wave([{ type: 'dog', n: 3, at: { x: P.x, z: P.z, r0: 12, r1: 18 } }]); });
          G.next();
        });
      },
    },
    {
      id: 'pavilhao', obj: 'Atraia a Fera para o pavilhão da Kartoffelfest',
      marker: G => { const k = places(G).kartoffel; return [k.x, null, k.z]; },
      enter(G) { G.ambient({ types: { dog: 1 }, max: 2, every: [20, 30] }); G.hud.showHints({ keyboard: ['A Fera fica tonta se bater numa coluna', 'Dinamite também a derruba'], pad: ['A Fera fica tonta se bater numa coluna', 'Dinamite também a derruba'], touch: ['A Fera fica tonta se bater numa coluna', 'Dinamite também a derruba'] }); },
      update(G, dt, S) {
        const k = places(G).kartoffel;
        if (!G.near(k.x, k.z, 20)) return false;
        G.ambient(null);
        G.combat.clearEnemies(e => e.ambient);
        G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
        // a Fera chega pelo lado do estacionamento da Prefeitura e entra entre os postes
        // (pelas pontas, os cavaletes e o palco fecham a passagem)
        const fs = frame(k.x, k.z, k.rot)(-2, -17), f = G.freeSpot(fs[0], fs[1], 0, 6, 30) || fs;
        S.boss = G.spawn('fera', f[0], f[1], { arena: { x: k.x, z: k.z, r: 30 } });
        G.boss(S.boss, 'A FERA');
        SFX.roar(G.audio, 10, 0.9, 2.2);
        G.combat.shake = 0.6;
        // caixa de dinamite que volta
        const c = frame(k.x, k.z, k.rot)(-10.5, -4);
        G.pickup('dynamite', c[0], c[1], { n: 2, respawn: 22 });
        G.pickup('cuca', c[0] + 1, c[1] + 1, { respawn: 50 });
        return true;
      },
    },
    {
      id: 'fera', obj: 'Derrube a Fera', resumeAs: 'pavilhao',
      update(G, dt, S) { return S.boss?.dead && S.boss.deadT > 2.5; },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.6); if (G.inventory.count('dynamite') < 2) G.give('dynamite', 2 - G.inventory.count('dynamite')); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        G.narrate([
          'A Fera desabou entre as colunas do pavilhão e não levantou mais.',
          'Nas costas dela, cravado no couro, um caco de pedra verde ainda brilhava. A mesma luz dos cristais da nave.',
          'Fosse o que fosse antes, um boi, um bugio, um bicho do mato, a pedra fez daquilo uma fera. E a bruxa soltou ela em cima da gente.',
        ], () => G.complete(), { title: 'A FERA' });
      },
    },
  ],
};

function lerp(a, b, t) { return a + (b - a) * t; }
