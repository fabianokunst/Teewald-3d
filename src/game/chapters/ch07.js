import * as THREE from 'three';
import { places, grave, candle, frame } from './common.js';
import { pointInPoly } from '../../world/geo.js';
import { ipt } from './ch03.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 7 — Finados. Garoa e neblina. O diário do Pastor Wendt diz que a cruz de
// ferro que selava a bruxa foi guardada na cripta dos fundadores, embaixo do cemitério.
// A cripta só abre com as quatro velas dos fundadores acesas, e o cemitério está cheio
// de mortos que não descansam. Lá embaixo, a cruz, o diário e o coveiro.

const PADRE = 'PADRE BERNARDO', OTTO = 'SEU OTTO';
const FOUNDERS = ['WENDT 1851', 'SCHMITT 1853', 'KLEIN 1856', 'HOFFMANN 1858'];

export default {
  n: 7, title: 'Finados', sub: 'Os mortos de Teewald não estão dormindo.',
  weather: 'garoa',
  deathText: 'OS MORTOS TE LEVARAM',
  start(G) { const d = places(G).churchDoor; return { x: d.x + Math.sin(d.h + Math.PI) * 3, z: d.z + Math.cos(d.h + Math.PI) * 3, h: d.h }; },
  setup(G, S) {
    const P = places(G), C = P.cemetery, poly = C.poly;
    const inside = (x, z, m = 2) => pointInPoly(x, z, poly) && [[m, 0], [-m, 0], [0, m], [0, -m]].every(([a, b]) => pointInPoly(x + a, z + b, poly));
    const spot = (r0, r1) => { for (let k = 0; k < 60; k++) { const s = G.freeSpot(C.x, C.z, r0, r1, 1); if (s && inside(s[0], s[1])) return s; } return [C.x + (Math.random() - 0.5) * 10, C.z + (Math.random() - 0.5) * 10]; };
    // mausoléu da cripta, quatro túmulos dos fundadores
    const m = spot(0, 10);
    S.mauso = { x: m[0], z: m[1], h: Math.atan2(P.churchDoor.x - m[0], P.churchDoor.z - m[1]) };
    S.graves = [];
    G.build(B => {
      const { x, z, h } = S.mauso, y = G.y(x, z) - 0.1, f = frame(x, z, h);
      B.box('stoneWall', x, y, z, 3.6, 3.2, 3.6, h, { uvScale: 2 });
      B.box('granite', x, y + 3.2, z, 4.0, 0.4, 4.0, h, { uvScale: 2 });
      const tip = f(0, 0);
      B.box('granite', tip[0], y + 3.6, tip[1], 0.25, 1.0, 0.25, h, { uvScale: 1 });
      B.box('granite', tip[0], y + 4.15, tip[1], 0.8, 0.22, 0.25, h, { uvScale: 1 });
      const d = f(0, 1.81), c = Math.cos(h), s = Math.sin(h);
      B.col = [0.08, 0.06, 0.05];
      B.quad('woodDark', [d[0] - c * 0.7, y, d[1] + s * 0.7], [d[0] + c * 0.7, y, d[1] - s * 0.7], [d[0] + c * 0.7, y + 2.2, d[1] - s * 0.7], [d[0] - c * 0.7, y + 2.2, d[1] + s * 0.7]);
      B.col = [1, 1, 1];
      G.solid(x, z, 1.8, 1.8, h, y, y + 4.6);
      for (let i = 0; i < 4; i++) {
        const g = spot(5, 22), hd = grave(B, G, g[0], g[1], Math.random() * 6.28, FOUNDERS[i]);
        candle(B, hd.x + 0.35, hd.y - 0.75, hd.z);
        S.graves.push({ x: g[0], z: g[1], cx: hd.x + 0.35, cy: hd.y - 0.5, cz: hd.z, lit: false });
      }
    });
    const gate = spot(16, 30);
    S.gate = { x: gate[0], z: gate[1] };
    G.npcs.stage('otto', { x: gate[0], z: gate[1], h: Math.atan2(C.x - gate[0], C.z - gate[1]), talks: [[
      'Acendi as velas de finados nos túmulos dos fundadores e elas apagaram todas, de uma vez. Sem vento.',
      'Tem gente andando entre os túmulos. Gente que eu mesmo enterrei. A dona Elfrida, o velho Klein...',
      'A cripta dos fundadores só abre com as quatro velas acesas. Coisa dos antigos, ninguém sabe explicar.',
      'Toma a minha pá. Bala não adianta com eles. A luz do teu lampião, sim.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'otto') { G.pickup('pa', G.player.pos.x + 0.8, G.player.pos.z + 0.6); G.next(); } } });
    G.supplies([['oil', 1], ['ammo9', 12], ['cuca', 1]], C.x, C.z, 25, { r0: 8, respawn: 60 });
    G.supplies([['oil', 1], ['cha', 1]], P.churchYard.x, P.churchYard.z, 15, { r0: 4 });
    S.lit = 0;
  },
  tick(G, dt, S) {
    for (const g of S.graves || []) if (g.lit) G.atmo.light(g.cx, g.cy + 0.3, g.cz, [1.1, 0.75, 0.35], 4.5, 3);
    // névoa rasteira no cemitério
    const C = places(G).cemetery;
    if (!G.ctx.indoor && Math.random() < dt * 8) G.effects.spawn({ p: new THREE.Vector3(C.x + (Math.random() - 0.5) * 50, G.y(C.x, C.z) + 0.2, C.z + (Math.random() - 0.5) * 40), v: new THREE.Vector3(0.3, 0.05, 0.1), life: 3, s0: 0.6, s1: 1.4, color: [0.32, 0.34, 0.38], drag: 0.2 });
  },
  exitTo(G, name) { const m = G.S.mauso; const f = frame(m.x, m.z, m.h)(0, 3.5); return { x: f[0], z: f[1], h: m.h }; },
  onExit(G, S) { if (S.flags.cross) G.goto('diario'); },
  steps: [
    {
      id: 'padre', obj: null,
      enter(G) {
        G.after(0.8, () => G.talk([[PADRE, [
          'Achei o diário do Pastor Wendt, o que enterrou a Otília. Está em alemão antigo, mas dá pra entender o principal.',
          'Em 1950 tiraram a cruz de ferro de cima do túmulo dela e guardaram na cripta dos fundadores, embaixo do cemitério. Alguém achou que cruz no meio do mato não ficava bem.',
          'Sem a cruz não tem como selar a bruxa de novo. Mas hoje é noite de finados, e o Seu Otto diz que os mortos estão inquietos.',
          'Fala com ele no cemitério. E leva o lampião aceso.',
        ], 150]], () => G.next()));
      },
    },
    {
      id: 'otto', obj: 'Fale com o Seu Otto no cemitério',
      marker: G => { const n = G.npcs.byId.otto; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
      enter(G) { G.ambient({ types: { ghost: 2, dog: 1 }, max: 2, every: [18, 30] }); },
    },
    {
      id: 'velas', obj: 'Acenda as velas dos fundadores (0/4)',
      marker: G => { const g = G.S.graves.find(q => !q.lit); return g ? [g.cx, g.cy + 1.2, g.cz] : null; },
      enter(G, S) {
        G.ambient(null);
        G.checkpoint(S.gate.x, S.gate.z, 0);
        S.graves.forEach((g, i) => {
          G.use('vela' + i, [g.cx, g.cy + 0.6, g.cz], 2.2, 'ACENDER A VELA', () => {
            g.lit = true; S.lit++;
            G.obj(`Acenda as velas dos fundadores (${S.lit}/4)`);
            SFX.wail(G.audio, 8, 0.8);
            G.toast(FOUNDERS[i].split(' ')[0] + ' — ' + S.lit + '/4');
          }, { hold: 2.5 });
        });
        S.ghostT = 2;
        SFX.wail(G.audio, 12);
      },
      update(G, dt, S) {
        // os mortos não param de levantar enquanto houver vela apagada
        S.ghostT -= dt;
        const C = places(G).cemetery;
        if (S.ghostT <= 0) {
          S.ghostT = 4 + Math.random() * 4;
          if (G.combat.alive(e => !e.passive) < 6) {
            const kinds = ['colono', 'mulher', 'crianca'];
            const P = G.player.pos, sp = G.freeSpot(P.x, P.z, 8, 15) || [C.x, C.z];
            G.spawn('ghost', sp[0], sp[1], { kind: kinds[Math.floor(Math.random() * 3)] });
          }
        }
        return S.lit >= 4;
      },
    },
    {
      id: 'cripta', obj: 'Entre na cripta',
      marker: G => { const m = G.S.mauso; return [m.x, null, m.z]; },
      enter(G, S) {
        for (const e of G.combat.enemies) if (!e.dead) e.die({});
        G.combat.shake = 0.4;
        G.audio.thunder?.(0.6);
        G.toast('A CRIPTA SE ABRIU');
        const m = S.mauso, f = frame(m.x, m.z, m.h)(0, 2.4);
        G.use('entrar', [f[0], G.y(f[0], f[1]) + 1.2, f[1]], 2.6, 'DESCER À CRIPTA', () => {
          G.combat.clearEnemies();
          G.enter('cripta', null, () => G.next());
        }, { once: false });
      },
    },
    {
      id: 'dentro', obj: 'Encontre a cruz de ferro',
      marker: G => { const p = ipt(G, 'cripta', 'cross'); return p ? { x: p.x, y: p.y + 1.5, z: p.z } : null; },
      enter(G, S) {
        G.unuse('entrar');
        const sp = ipt(G, 'cripta', 'spawn');
        G.checkpoint(sp.x, sp.z, sp.h);
        S.amb = [false, false, false];
        const c = ipt(G, 'cripta', 'cross');
        G.pickup('cross', c.x, c.z, { y: c.y + 0.05, onPick: () => {
          G.give('diary', 1);
          S.flags.cross = true;
          G.toast('CRUZ DE FERRO E O DIÁRIO DO PASTOR');
          G.after(1.5, () => G.next());
        } });
      },
      update(G, dt, S) {
        for (let i = 0; i < 3; i++) {
          if (S.amb[i]) continue;
          const a = ipt(G, 'cripta', 'ambush' + (i + 1));
          if (a && G.near(a.x, a.z, 7)) { S.amb[i] = true; G.wave([{ type: 'ghost', n: 2 + (i > 0 ? 1 : 0), at: { x: a.x, z: a.z, r0: 0, r1: 3 } }]); SFX.wail(G.audio, 4); }
        }
      },
    },
    {
      id: 'coveiro', obj: 'Derrote o coveiro',
      enter(G, S) {
        const c = ipt(G, 'cripta', 'cross');
        SFX.wail(G.audio, 3, 0.55, 3);
        G.combat.shake = 0.35;
        const sp = G.freeSpot(c.x, c.z, 3, 6, 20) || [c.x + 3, c.z];
        S.boss = G.spawn('ghost', sp[0], sp[1], { kind: 'colono', scale: 1.6, hp: 12, name: 'O COVEIRO' });
        S.boss.baseScale = 1.6;
        G.boss(S.boss, 'O COVEIRO');
      },
      update(G, dt, S) { return S.boss?.dead; },
      onRespawn(G, S) { if (S.boss && !S.boss.dead) S.boss.hp = Math.max(S.boss.hp, 8); },
    },
    {
      id: 'sair', obj: 'Saia da cripta',
      marker: G => { const d = G.interiors.defs.cripta, e = d?.exits?.[0]; return e ? { x: e.x, y: d.floorY + 1.6, z: e.z } : null; },
    },
    {
      id: 'diario', obj: null,
      enter(G) {
        G.after(0.6, () => G.narrate([
          'Diário do Pastor Johann Wendt, novembro de 1878.',
          '"A Otília não morre por ferro nem por fogo. Só a cruz, posta sobre o peito dela quando estiver fraca, devolve ela para a terra."',
          '"O bicho dela, o Blutsauger, é o coração do feitiço. Enquanto ele estiver solto, ela não cansa."',
          '"Que Deus nos perdoe o que fizemos com ela. E o que ela fez conosco."',
        ], () => G.complete(), { title: 'O DIÁRIO' }));
      },
    },
  ],
};
