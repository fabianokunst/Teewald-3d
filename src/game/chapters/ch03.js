import { places } from './common.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 3 — A Moça da Fábrica. Chuva. A Kátia viu uma moça chorando perto do
// relógio de ponto da fábrica de calçados. É a Lúcia Weber, morta no incêndio de
// 1983, presa lá pelo fantasma do capataz que trancou as portas. Primeiro o lampião
// bento na sacristia; dentro da fábrica, as três coisas dela; depois o capataz; no
// fim, bater o ponto de saída que ela nunca bateu.

const PADRE = 'PADRE BERNARDO', KATIA = 'KÁTIA', LUCIA = 'LÚCIA';

// ponto do interior (com reserva, se o construtor não tiver)
export function ipt(G, name, key, dx = 0, dz = 0) {
  const d = G.interiors.defs[name];
  if (!d) return null;
  const p = d.points?.[key] || d.spawn;
  return { x: p.x + dx, z: p.z + dz, y: p.y ?? d.floorY, h: p.h ?? 0 };
}

export default {
  n: 3, key: 'fabrica', title: 'A Moça da Fábrica', sub: 'No relógio de ponto, a saída nunca foi batida.',
  weather: 'chuva',
  deathText: 'A FÁBRICA TE PRENDEU',
  start(G) { const y = places(G).churchYard; return { x: y.x - 3, z: y.z + 2, h: y.h }; },
  setup(G, S) {
    const P = places(G), y = P.churchYard;
    G.npcs.stage('katia', { x: y.x + 2.2, z: y.z - 1.5, h: y.h + Math.PI * 0.8, talks: [[
      'Eu tava no turno da noite na fábrica de calçados quando a luz caiu.',
      'As máquinas de costura começaram a costurar sozinhas. No escuro. Todas juntas.',
      'E tinha uma moça de avental perto do relógio de ponto, chorando. Ela virou pra mim... e não tinha olhos.',
      'Eu larguei tudo e corri até aqui. Não volto lá nem morta.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'katia') G.next(); } });
    const d = P.churchDoor;
    G.npcs.stage('bernardo', { x: d.x, z: d.z, h: d.h + Math.PI });
    G.supplies([['ammo9', 12], ['shells', 6], ['cuca', 1]], y.x, y.z, 20, { r0: 6 });
    G.supplies([['oil', 1], ['shells', 6], ['cha', 1]], P.factoryDoor.x, P.factoryDoor.z, 22, { r0: 6 });
    S.found = 0; S.foundIds = [];
  },
  // salvamento: quais objetos da Lúcia já foram achados
  saveState(G, S) { return { foundIds: S.foundIds }; },
  loadState(G, S, c) { S.foundIds = [...(c.foundIds || [])]; S.found = S.foundIds.length; },
  exitTo(G) { const f = places(G).factoryDoor; return { x: f.x + Math.sin(f.h + Math.PI) * 2.5, z: f.z + Math.cos(f.h + Math.PI) * 2.5, h: f.h + Math.PI }; },
  onExit(G, S) { if (S.flags.freed) G.complete(); },
  // luminária da portaria acesa (falhando) enquanto o jogador está do lado de fora
  tick(G, dt, S) {
    if (G.interiors.indoor) return;
    const d = places(G).factoryDoor, t = performance.now() / 1000;
    const k = Math.sin(t * 9) * Math.sin(t * 4.1 + 1) > 0.55 ? 0.25 : 1;
    G.atmo.light(d.x + Math.sin(d.h), (d.y ?? G.y(d.x, d.z)) + 2.2, d.z + Math.cos(d.h), [1.3 * k, 0.95 * k, 0.55 * k], 8, 2);
  },
  steps: [
    {
      id: 'katia', obj: 'Fale com a Kátia',
      marker: G => { const n = G.npcs.byId.katia; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
    },
    {
      id: 'padre', obj: null,
      enter(G) {
        G.talk([[PADRE, [
          'Lúcia Weber. Morreu no incêndio de 1983, na mesma fábrica. Tinha dezenove anos e ia casar em dezembro.',
          'O capataz, o Kurt, trancou as portas pra ninguém sair antes de fechar o pedido de botas. Pegou fogo no depósito de cola.',
          'A Lúcia e mais três não saíram. O Kurt morreu queimado tentando abrir o próprio cadeado.',
          'Se ela ainda está lá, é a Otília prendendo. A bruxa segura as almas que morreram com medo.',
          'Fantasma não sente bala, filho. Sente a luz de Deus. Tem um lampião bento na sacristia, ali do lado da igreja. Leva ele e o querosene.',
        ], 150]], () => G.next());
      },
    },
    {
      // a sacristia tem porta para fora, na lateral da igreja (extras.js cuida das portas)
      id: 'sacristia', obj: 'Pegue o lampião na sacristia',
      marker: G => {
        if (G.interiors.indoor?.name === 'igreja') { const p = ipt(G, 'igreja', 'lampiao'); return p ? { x: p.x, y: p.y + 0.8, z: p.z } : null; }
        const s = places(G).sacristy; return [s.x, null, s.z];
      },
      enter(G) {
        const p = ipt(G, 'igreja', 'lampiao') || { ...places(G).sacristy, y: G.y(places(G).sacristy.x, places(G).sacristy.z) };
        G.use('lamp', [p.x, p.y + 0.6, p.z], 1.8, 'PEGAR O LAMPIÃO', () => {
          G.give('lantern', 1, { fuel: 100 });
          G.give('oil', 2);
          G.guns.equip('lantern'); G.guns.teach();
          G.toast('LAMPIÃO BENTO');
          G.next();
        });
      },
    },
    {
      id: 'fantasmas', obj: 'Afaste os fantasmas com a luz do lampião',
      enter(G, S) {
        const P = G.player.pos;
        G.after(1.5, () => {
          SFX.wail(G.audio, 10);
          G.wave([{ type: 'ghost', n: 2, at: { x: P.x, z: P.z, r0: 9, r1: 13 } }], () => { S.flags.ghosts = true; });
        });
      },
      update(G, dt, S) { return S.flags.ghosts; },
      onRespawn(G, S) { G.combat.clearEnemies(); const P = G.player.pos; G.wave([{ type: 'ghost', n: 2, at: { x: P.x, z: P.z, r0: 9, r1: 13 } }], () => { S.flags.ghosts = true; }); },
    },
    {
      id: 'ida', obj: 'Vá até a fábrica de calçados',
      marker: G => { const d = places(G).factoryDoor; return [d.x, d.y != null ? d.y + 1.4 : null, d.z]; },
      enter(G) {
        G.ambient({ types: { dog: 2, ghost: 1 }, max: 3, every: [14, 24] });
        const d = places(G).factoryDoor;
        // a porta fica no alto da escadinha: dá para entrar já do pé dela
        G.use('entrar', [d.x, (d.y ?? G.y(d.x, d.z)) + 1.2, d.z], 3.5, 'ENTRAR NA FÁBRICA', () => {
          G.ambient(null);
          G.combat.clearEnemies();
          G.enter('fabrica', null, () => G.next());
        }, { once: false });
      },
    },
    {
      id: 'dentro', obj: 'Siga o choro',
      marker: G => { const p = ipt(G, 'fabrica', 'lucia1'); return p ? { x: p.x, y: p.y + 1.6, z: p.z } : null; },
      enter(G, S) {
        G.unuse('entrar');
        const sp = ipt(G, 'fabrica', 'spawn');
        if (sp) G.checkpoint(sp.x, sp.z, sp.h);
        const l1 = ipt(G, 'fabrica', 'lucia1');
        G.after(1.0, () => {
          S.lucia = G.spawn('lucia', l1.x, l1.z, { h: l1.h });
          S.lucia.appear?.(l1.x, l1.z, l1.h);
          S.lucia.cry?.();
        });
      },
      update(G, dt, S) {
        const l1 = ipt(G, 'fabrica', 'lucia1');
        if (S.lucia && G.near(l1.x, l1.z, 5)) {
          G.talk([[LUCIA, [
            '...não consigo sair... ele trancou... ele trancou a porta...',
            'Minhas coisas... a minha medalhinha... o sapato do meu casamento... o meu cartão...',
            'Sem elas eu não lembro o caminho de casa.',
          ], 330]], () => { S.lucia.vanish?.(); G.next(); });
          return false;
        }
      },
    },
    {
      id: 'coisas', obj: 'Encontre as coisas da Lúcia (0/3)',
      enter(G, S) {
        const items = [['medal', 'item1'], ['shoe', 'item2'], ['card', 'item3']];
        G.obj(`Encontre as coisas da Lúcia (${S.found}/3)`);
        for (const [id, key] of items) {
          if (S.foundIds.includes(id)) continue;
          const p = ipt(G, 'fabrica', key);
          G.pickup(id, p.x, p.z, { y: p.y, onPick: () => G.S.def.found(G, G.S, id) });
        }
      },
      update(G, dt, S) { if (S.found >= 3) return true; },
    },
    {
      id: 'capataz', obj: 'Sobreviva ao capataz',
      enter(G, S) {
        const b = ipt(G, 'fabrica', 'boss');
        G.checkpoint(b.x + 6, b.z, 0);
        // as luzes apagam; ele surge no meio do salão
        for (const l of G.interiors.defs.fabrica?.lightsAll || G.interiors.defs.fabrica?.lights || []) l.offSaved = l.off, l.off = Math.random() < 0.35;
        SFX.wail(G.audio, 4, 0.6, 3);
        G.combat.shake = 0.4;
        G.after(1.5, () => {
          const k = G.spawn('capataz', b.x, b.z, { arena: { x: b.x, z: b.z, r: 11 } });
          k.onScream = () => { for (const l of G.interiors.defs.fabrica?.lightsAll || G.interiors.defs.fabrica?.lights || []) l.off = Math.random() < 0.6; G.after(1.5, () => { for (const l of G.interiors.defs.fabrica?.lightsAll || G.interiors.defs.fabrica?.lights || []) l.off = false; }); };
          G.boss(k, 'O CAPATAZ');
          S.boss = k;
          G.toast('USE A LUZ DO LAMPIÃO NELE');
        });
        G.pickup('oil', b.x - 5, b.z + 3, { y: b.y, respawn: 30 });
      },
      update(G, dt, S) { return S.boss?.dead && S.boss.deadT > 1.5; },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, S.boss.maxHp * 0.6); },
    },
    {
      id: 'ponto', obj: 'Vá até o relógio de ponto',
      marker: G => { const p = ipt(G, 'fabrica', 'clock'); return p ? { x: p.x, y: p.y + 1.8, z: p.z } : null; },
      enter(G, S) {
        for (const l of G.interiors.defs.fabrica?.lightsAll || G.interiors.defs.fabrica?.lights || []) l.off = false;
        const c = ipt(G, 'fabrica', 'clock');
        G.after(1, () => {
          if (S.lucia && !S.lucia.removed) G.combat.remove(S.lucia);
          S.lucia = G.spawn('lucia', c.x + Math.sin(c.h) * 1.4, c.z + Math.cos(c.h) * 1.4, { h: c.h + Math.PI });
          S.lucia.appear?.(c.x + Math.sin(c.h) * 1.4, c.z + Math.cos(c.h) * 1.4, c.h + Math.PI);
        });
        G.use('ponto', [c.x, c.y + 1.3, c.z], 2.4, 'BATER O PONTO DE SAÍDA', () => {
          G.inventory.take('card', 1);
          G.audio.tone(1200, 0.08, 'square', 0.08); setTimeout(() => G.audio.tone(900, 0.2, 'square', 0.07), 90);
          G.toast('SAÍDA: 23H47');
          G.after(1.2, () => G.talk([[LUCIA, [
            'Vinte e três e quarenta e sete... Eu posso ir pra casa.',
            'Obrigada. A mãe deve estar me esperando com a janta.',
            'Cuidado. A velha está no morro. Ela segura todos nós aqui. Todos que morreram com medo.',
          ], 330]], () => {
            S.lucia?.free?.();
            S.flags.freed = true;
            G.after(5, () => G.next());
          }));
        });
      },
    },
    {
      id: 'saida', obj: 'Saia da fábrica',
      marker: G => { const d = G.interiors.defs.fabrica; const e = d?.exits?.[0]; return e ? { x: e.x, y: d.floorY + 1.6, z: e.z } : null; },
    },
  ],
  // um dos três objetos achado: susto e assombrações
  found(G, S, id) {
    S.found++;
    S.foundIds.push(id);
    G.autosave('item', true);
    G.obj(`Encontre as coisas da Lúcia (${S.found}/3)`);
    G.combat.shake = 0.25;
    SFX.whisper(G.audio, 3);
    const d = G.interiors.defs.fabrica;
    if (d) { d.dark = true; G.after(0.8, () => { d.dark = false; }); }
    const amb = ipt(G, 'fabrica', S.found % 2 ? 'ambush1' : 'ambush2');
    if (S.found < 3) {
      G.wave([{ type: 'ghost', n: S.found === 1 ? 2 : 3, at: { x: amb.x, z: amb.z, r0: 0, r1: 3 } }]);
      const lp = ipt(G, 'fabrica', 'lucia' + (S.found + 1));
      if (lp) G.after(2, () => { if (S.lucia) { G.combat.remove(S.lucia); } S.lucia = G.spawn('lucia', lp.x, lp.z, { h: lp.h }); S.lucia.appear?.(lp.x, lp.z, lp.h); S.lucia.cry?.(); G.after(6, () => S.lucia?.vanish?.()); });
    }
  },
};
