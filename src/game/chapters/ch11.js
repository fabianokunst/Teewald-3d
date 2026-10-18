import * as THREE from 'three';
import { places, crate, caveMouth, Breakable } from './common.js';
import { makeItemModel } from '../itemModels.js';
import { ipt } from './ch03.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 11 — O Covil. Chuva. O chupacabras fugiu mancando para a gruta do morro.
// O rifle de dardos fica na agropecuária, do outro lado da cidade. Depois, o rastro de
// sangue até a gruta, a luta e a captura: cansar o bicho e dar dois dardos. No fundo da
// gruta, os cristais da pedra que caiu do céu: quebrar os três enfraquece a bruxa.

export default {
  n: 11, key: 'covil', title: 'O Covil', sub: 'Pegar o chupacabras. Vivo.',
  weather: 'chuva',
  deathText: 'O CHUPACABRAS TE PEGOU',
  start(G) { const y = places(G).churchYard; return { x: y.x - 3, z: y.z, h: y.h }; },
  setup(G, S) {
    const P = places(G), m = P.caveMouth, cl = P.clearing;
    S.mouth = m;
    S.mouthRot = Math.atan2(cl.x - m.x, cl.z - m.z);
    G.build(B => {
      const e = caveMouth(B, G, m.x, m.z, S.mouthRot);
      S.entry = e;
      // rastro de sangue da clareira até a gruta
      const n = Math.floor(Math.hypot(m.x - cl.x, m.z - cl.z) / 2.5);
      for (let i = 1; i < n; i++) {
        const t = i / n, x = cl.x + (m.x - cl.x) * t + Math.sin(i * 1.7) * 0.8, z = cl.z + (m.z - cl.z) * t + Math.cos(i * 1.3) * 0.8;
        const y = G.y(x, z) + 0.03, s = 0.18 + Math.random() * 0.2, a = Math.random() * 6;
        const c = Math.cos(a) * s, sn = Math.sin(a) * s;
        B.quad('chupa:blood', [x - c - sn, y, z + sn - c], [x - c + sn, y, z + sn + c], [x + c + sn, y, z - sn + c], [x + c - sn, y, z - sn - c]);
      }
    });
    G.supplies([['ammo9', 12], ['shells', 8], ['cuca', 1]], P.churchYard.x, P.churchYard.z, 20, { r0: 5 });
    G.supplies([['ammo9', 12], ['shells', 6], ['cha', 1], ['oil', 1]], (P.church.x + P.agroDoor.x) / 2, (P.church.z + P.agroDoor.z) / 2, 40);
    G.supplies([['ammo9', 12], ['cuca', 1]], cl.x, cl.z, 12, { r0: 3 });
    S.crystals = 0;
  },
  // salvamento: cristais já quebrados
  saveState(G, S) { return { cr: (S.cr || []).map(b => b.dead) }; },
  loadState(G, S, c) { S.crSaved = c.cr || []; },
  // retomando na hora de amarrar: o bicho já dorme no covil
  resume(G, S, id) {
    if (id !== 'amarrar') return;
    const a = ipt(G, 'gruta', 'arena'), n = ipt(G, 'gruta', 'nest') || a;
    S.boss = G.spawn('chupa', n.x, n.z, { arena: { x: a.x, z: a.z, r: 10 } });
    S.boss.place(n.x, n.z, 0);
    S.boss.sleep();
  },
  exitTo(G) { const e = G.S.entry; return { x: e.x - Math.sin(G.S.mouthRot) * 1.5, z: e.z - Math.cos(G.S.mouthRot) * 1.5, h: G.S.mouthRot + Math.PI }; },
  onExit(G, S) { if (S.crystals >= 3) G.complete(); },
  steps: [
    {
      id: 'dardos', obj: 'Pegue o rifle de dardos na agropecuária',
      marker: G => { const d = places(G).agroDoor; return [d.x, null, d.z]; },
      enter(G) {
        G.ambient({ types: { dog: 2, bat: 1, ghost: 1 }, max: 4, every: [12, 20] });
        const d = places(G).agroDoor;
        G.build(B => crate(B, G, d.x, d.z, d.h, 0.9, 'VETERINÁRIA'));
        G.use('rifle', [d.x, G.y(d.x, d.z) + 1, d.z], 2.8, 'PEGAR O RIFLE DE DARDOS', () => {
          G.give('dartgun', 1, { mag: 1 });
          G.give('darts', 6);
          G.toast('RIFLE DE DARDOS');
          G.hud.showHints({ keyboard: ['O dardo só derruba o bicho cansado', 'Canse o chupacabras primeiro (7 troca de arma)'], pad: ['O dardo só derruba o bicho cansado', 'Canse o chupacabras primeiro'], touch: ['O dardo só derruba o bicho cansado', 'Canse o chupacabras primeiro'] });
          G.checkpoint(d.x, d.z, d.h + Math.PI);
          G.next();
        });
      },
    },
    {
      id: 'rastro', obj: 'Siga o rastro de sangue até a gruta, depois da clareira',
      marker: G => { const S = G.S, cl = places(G).clearing; return G.near(cl.x, cl.z, 14) || S.flags.passed ? [S.mouth.x, null, S.mouth.z] : [cl.x, null, cl.z]; },
      enter(G) { G.ambient({ types: { dog: 2, bat: 1, ghost: 1 }, max: 4, every: [12, 20] }); },
      update(G, dt, S) {
        const cl = places(G).clearing;
        if (G.near(cl.x, cl.z, 14)) S.flags.passed = true;
        const e = S.entry;
        if (!G.near(e.x, e.z, 10)) return false;
        return true;
      },
    },
    {
      id: 'gruta', obj: 'Entre na gruta',
      marker: G => { const e = G.S.entry; return [e.x, null, e.z]; },
      enter(G, S) {
        const e = S.entry;
        G.use('entrar', [e.x, G.y(e.x, e.z) + 1.2, e.z], 3.5, 'ENTRAR NA GRUTA', () => {
          G.ambient(null);
          G.combat.clearEnemies();
          G.enter('gruta', null, () => G.next());
        }, { once: false });
      },
    },
    {
      id: 'covil', obj: 'Encontre o covil',
      marker: G => { const p = ipt(G, 'gruta', 'arena'); return p ? { x: p.x, y: p.y + 1.5, z: p.z } : null; },
      enter(G, S) {
        G.unuse('entrar');
        const sp = ipt(G, 'gruta', 'spawn');
        G.checkpoint(sp.x, sp.z, sp.h);
        G.after(2, () => { G.wave([{ type: 'bat', n: 2, at: { x: sp.x, z: sp.z, r0: 4, r1: 8 }, o: { y: sp.y + 3 } }]); SFX.screech(G.audio, 6); });
      },
      update(G, dt, S) {
        const a = ipt(G, 'gruta', 'arena');
        if (!a || !G.near(a.x, a.z, 9)) return false;
        G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
        const n = ipt(G, 'gruta', 'nest') || a;
        S.boss = G.spawn('chupa', n.x, n.z, { arena: { x: a.x, z: a.z, r: 10 } });
        S.boss.place(n.x, n.z, Math.atan2(G.player.pos.x - n.x, G.player.pos.z - n.z));
        S.boss.onTired = () => G.toast('ELE ESTÁ CANSADO! OS DARDOS!');
        S.boss.onDartWasted = () => G.toast('FORTE DEMAIS PARA O DARDO');
        S.boss.onDart = () => G.toast('MAIS UM DARDO!');
        S.boss.onSleep = () => G.toast('O CHUPACABRAS DORMIU');
        G.boss(S.boss, 'O CHUPACABRAS');
        G.cut({ dur: 2.6, label: 'CHUPACABRAS', cam: (t, cam, G2) => { const p = S.boss.pos, P = G2.player.pos; G2.camAt(P.x + (p.x - P.x) * 0.35 + 1.2, P.y + 1.4, P.z + (p.z - P.z) * 0.35 + 1.2, p.x, p.y + 0.8, p.z); } });
        G.pickup('darts', a.x + 3, a.z - 3, { y: a.y + 0.04, n: 2, respawn: 25 });
        return true;
      },
    },
    {
      id: 'captura', obj: 'Canse o chupacabras e acerte dois dardos', resumeAs: 'covil',
      update(G, dt, S) { return S.boss?.asleep; },
      onRespawn(G, S) { if (S.boss && !S.boss.asleep) { S.boss.hp = Math.max(S.boss.hp, 4); S.boss.tired = false; S.boss.darts = 0; } if (G.inventory.count('darts') < 2) G.give('darts', 2 - G.inventory.count('darts')); },
    },
    {
      id: 'amarrar', obj: 'Amarre o chupacabras',
      marker: G => { const p = G.S.boss.pos; return { x: p.x, y: p.y + 1.2, z: p.z }; },
      enter(G, S) {
        G.combat.boss = null;
        G.use('amarrar', () => { const p = S.boss.pos; return [p.x, p.y + 0.8, p.z]; }, 2.6, 'AMARRAR O CHUPACABRAS', () => {
          G.narrate([
            'Amarrei o bicho com a corda da agropecuária: pés, mãos e o focinho. Ele respirava devagar, os olhos vermelhos meio fechados.',
            'No pescoço, uma coleira de couro velho, quase podre. Gravadas a fogo, duas letras: O.K.',
            'Otília Kranz. Cento e dezenove anos esperando a dona no mato.',
          ], () => G.next(), { title: 'CAPTURADO' });
        });
      },
    },
    {
      id: 'cristais', obj: 'Quebre os cristais da pedra do céu (0/3)',
      marker: G => { const S = G.S; for (let i = 1; i <= 3; i++) if (!S.cr?.[i - 1]?.dead) { const p = ipt(G, 'gruta', 'crystal' + i); if (p) return { x: p.x, y: p.y + 2, z: p.z }; } return null; },
      enter(G, S) {
        S.cr = [];
        S.crystals = (S.crSaved || []).filter(Boolean).length;
        G.obj(`Quebre os cristais da pedra do céu (${S.crystals}/3)`);
        for (let i = 1; i <= 3; i++) {
          const p = ipt(G, 'gruta', 'crystal' + i);
          if (!p || S.crSaved?.[i - 1]) { S.cr.push({ dead: true, pos: p || { x: 0, y: 0, z: 0 } }); continue; }
          const m = makeItemModel('crystal');
          m.scale.setScalar(7);
          const b = new Breakable(G, m, p.x, p.y + 0.2, p.z, { hp: 5, r: 0.7, name: 'CRISTAL', color: [0.5, 1, 0.55], resist: { light: 0, melee: 1.5 }, onBreak: () => S.def.crystalBroken(G, S) });
          b.hitY0 = 0; b.height = 1.2;
          G.combat.spawn(b);
          S.cr.push(b);
        }
      },
      update(G, dt, S) {
        for (const b of S.cr) if (!b.dead) G.atmo.light(b.pos.x, b.pos.y + 0.8, b.pos.z, [0.3, 1.0, 0.4], 5, 3);
        return S.crystals >= 3;
      },
    },
    {
      id: 'sair', obj: 'Saia da gruta',
      marker: G => { const d = G.interiors.defs.gruta, e = d?.exits?.[0]; return e ? { x: e.x, y: d.floorY + 1.6, z: e.z } : null; },
    },
  ],
  crystalBroken(G, S) {
    S.crystals++;
    G.autosave('cristal', true);
    G.obj(`Quebre os cristais da pedra do céu (${S.crystals}/3)`);
    G.combat.shake = 0.3;
    SFX.wail(G.audio, 30, 0.5, 2.5);
    G.toast(S.crystals < 3 ? 'UM GRITO LONGE, NO MATO...' : 'A BRUXA SENTIU');
  },
};
