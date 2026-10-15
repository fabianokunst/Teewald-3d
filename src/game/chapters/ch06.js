import { places } from './common.js';
import { ipt } from './ch03.js';
import { DOCS } from '../lore.js';
import { SFX } from '../creatures/sfx.js';

// Capítulo 6 — A Linha Cruzada. Noite. Todos os telefones de Teewald tocam ao mesmo
// tempo; quem atende fica ouvindo uma voz de velha e sai andando para o mato. Os
// orelhões onde três moradores atenderam continuam tocando: atender de novo corta a
// ligação, e o sonâmbulo acorda (as almas rondam cada um). No livro de atas da
// paróquia, o padre acha o acordo de 1879: o sino às oito, toda noite, para ela saber
// que a cidade está acordada. Na torre, puxar a corda e aguentar enquanto o sino toca.

const PAULA = 'PAULA', PADRE = 'PADRE BERNARDO', VOZ = 'NO TELEFONE: ???';
const RING_TIME = 48;

// os três que atenderam: a voz que chama cada um e o que dizem ao acordar
const SLEEPERS = [
  {
    id: 'bruno',
    call: ['(uma voz de velha, muito perto do fone, falando devagar)', 'Bruno... o teu avô ajudou a cavar o buraco. Vem ver como ficou bonito.', 'Vem pelo mato. Eu deixei a porteira aberta.', '(a linha cai. Do outro lado, só o vento no mato.)'],
    wake: ['Hã...? Por que eu tô na rua?', 'O telefone tocou e era a voz da minha mãe. Mas a minha mãe morreu em 79.', 'Eu ia pro mato. Eu ia, e não sabia por quê.'],
  },
  {
    id: 'erna',
    call: ['Erna... Ernchen... tu sempre teve medo do mato.', 'Vem. Aqui o medo passa. Aqui tudo passa.', '(a linha cai. Do outro lado, alguém continua respirando.)'],
    wake: ['Credo em cruz... que frio.', 'Alguém falou o meu nome do jeito que a minha vó falava. Em hunsrik.', 'Vou pra casa. E não atendo mais telefone nenhum, nem que seja o Papa.'],
  },
  {
    id: 'joao',
    call: ['(uma canção de ninar em alemão, cantada baixinho)', 'Schlaf, Kindlein, schlaf...', 'Vem, piazinho. A vó do mato sabe onde o teu cusco tá.', '(a linha cai.)'],
    wake: ['(o guri pisca e começa a chorar)', 'A vó do mato disse que ia me mostrar onde o meu cusco tá.', 'Ela tem a voz bem velhinha. E ri igual corvo.'],
  },
];
const TRANCE = [['...', '(não responde. Está de olhos abertos, virado para o mato, ouvindo alguma coisa que tu não ouve.)']];

// alto da torre: onde as almas aparecem quando o sino toca (planta da igreja, interiors/igreja.js)
const TOWER = [[1.9, 0.7], [-2.0, 3.2], [1.9, 3.3], [-0.8, 3.3]];
const BELL_Y = 10.4;

const inChurch = G => G.interiors.indoor?.name === 'igreja';
const doorMarker = G => { const d = places(G).churchDoor; return [d.x, null, d.z]; };

export default {
  n: 6, key: 'linha', title: 'A Linha Cruzada', sub: 'Todos os telefones da cidade tocaram ao mesmo tempo.',
  weather: 'noite',
  phones: true,          // os orelhões são da história (sem toque solto dos extras)
  deathText: 'A LINHA FICOU MUDA',
  start(G) {
    const ph = G.extras.phones[0], P = places(G);
    const sp = G.freeSpot(ph.x, ph.z, 4, 7, 30) || [P.praca.x, P.praca.z];
    return { x: sp[0], z: sp[1], h: Math.atan2(ph.x - sp[0], ph.z - sp[1]) };
  },
  setup(G, S) {
    const E = G.extras, P = places(G), ph0 = E.phones[0];
    // os três orelhões mais perto da praça (fora o da praça) são os que chamam
    const others = E.phones.slice(1).sort((a, b) => Math.hypot(a.x - ph0.x, a.z - ph0.z) - Math.hypot(b.x - ph0.x, b.z - ph0.z));
    S.sleepers = SLEEPERS.map((s, i) => {
      const phone = others[i % Math.max(1, others.length)] || ph0;
      const sp = G.freeSpot(phone.x, phone.z, 5, 9, 40, { notForest: true }) || [phone.x + 6, phone.z];
      // de costas para o orelhão, andando para longe da rua
      return { ...s, phone, x: sp[0], z: sp[1], h: Math.atan2(sp[0] - phone.x, sp[1] - phone.z), answered: false, woke: false, ambushed: false };
    });
    const st = G.player.pos;
    G.npcs.stage('paula', { x: st.x + 1.6, z: st.z - 1.2, h: Math.atan2(-1.6, 1.2), talks: [[
      'Tu ouviu? Todos os telefones da cidade tocaram juntos. Os orelhões, o da loja, os das casas. Tudo ao mesmo tempo.',
      'O Seu Bruno atendeu um orelhão. Ficou um tempão ouvindo, sem dizer nada... e saiu andando. De pantufa, no meio da noite.',
      'Depois foi a Dona Erna. E eu vi o Joãozinho passar de pijama, sozinho, com aquele olhar parado.',
      'Os orelhões onde eles atenderam continuam tocando. Como se alguém ainda estivesse chamando eles.',
    ]], onTalkEnd: () => { if (G.S.def.steps[G.S.i]?.id === 'paula') G.next(); } });
    for (const q of S.sleepers) if (!q.woke) { const n = G.npcs.stage(q.id, { x: q.x, z: q.z, h: q.h, talks: TRANCE }); if (n) n.trance = true; }
    G.supplies([['oil', 1], ['ammo9', 12], ['cuca', 1]], P.praca.x, P.praca.z, 22, { r0: 6 });
    G.supplies([['oil', 1], ['shells', 6], ['cha', 1]], P.churchYard.x, P.churchYard.z, 15, { r0: 4 });
    // óleo para o lampião no coro, para a hora do sino
    const coro = ipt(G, 'igreja', 'coro');
    if (coro) G.pickup('oil', coro.x + 1.5, coro.z - 0.5, { n: 2, y: coro.y + 0.04, respawn: 40 });
  },
  // salvamento: quem já teve a ligação cortada e quem acordou
  saveState(G, S) { return { s: S.sleepers.map(q => [q.answered, q.woke]) }; },
  loadState(G, S, c) {
    (c.s || []).forEach(([a, w], i) => {
      const q = S.sleepers[i];
      if (!q) return;
      q.answered = a; q.woke = w; q.ambushed = a;
      if (w) { const n = G.npcs.stage(q.id, { x: q.x, z: q.z, h: q.h + Math.PI, talks: [q.wake.slice(-1)] }); if (n) n.trance = false; }
      else if (a) S.def.wakeable(G, S, q);
    });
  },
  cleanup(G) { for (const p of G.extras.phones) G.extras.forceRing(p, false); },
  steps: [
    {
      id: 'paula', obj: 'Fale com a Paula',
      marker: G => { const n = G.npcs.byId.paula; return n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : null; },
      enter(G, S) {
        // todos os orelhões tocam juntos; depois, só os dos três que atenderam
        for (const p of G.extras.phones) G.extras.forceRing(p, true);
        G.after(6, () => { for (const p of G.extras.phones) G.extras.forceRing(p, S.sleepers.some(q => q.phone === p && !q.answered)); });
        G.after(1.5, () => G.toast('TODOS OS TELEFONES TOCARAM'));
      },
    },
    {
      id: 'sonambulos', obj: 'Acorde quem atendeu o telefone (0/3)',
      marker: G => {
        const q = G.S.sleepers.filter(s => !s.woke).sort((a, b) => G.dist(a.x, a.z) - G.dist(b.x, b.z))[0];
        if (!q) return null;
        return q.answered ? [q.x, G.y(q.x, q.z) + 2.3, q.z] : [q.phone.x, q.phone.y + 2.4, q.phone.z];
      },
      enter(G, S) {
        G.ambient({ types: { ghost: 1, dog: 1 }, max: 2, every: [20, 32] });
        S.def.count(G, S);
        S.sleepers.forEach((q, i) => {
          if (!q.answered) G.extras.forceRing(q.phone, true);
          G.use('fone' + i, [q.phone.x, q.phone.y + 1.4, q.phone.z], 2.2, 'ATENDER', () => {
            q.answered = true;
            G.extras.forceRing(q.phone, false);
            G.audio.tone(140, 0.08, 'square', 0.05);
            G.talk([[VOZ, q.call, 85]], () => { S.def.wakeable(G, S, q); G.autosave('fone', true); });
          }, { cond: () => !q.answered });
        });
      },
      update(G, dt, S) {
        // as almas rondam cada sonâmbulo: aparecem quando o jogador chega perto
        for (const q of S.sleepers) {
          if (q.ambushed || q.woke || !G.near(q.x, q.z, 18)) continue;
          q.ambushed = true;
          G.checkpoint(G.player.pos.x, G.player.pos.z, G.player.heading);
          SFX.wail(G.audio, 10);
          G.wave([{ type: 'ghost', n: 2, at: { x: q.x, z: q.z, r0: 3, r1: 7 } }]);
        }
        return S.sleepers.every(q => q.woke);
      },
      onRespawn(G, S) { for (const q of S.sleepers) if (!q.woke) q.ambushed = false; },
    },
    {
      id: 'padre', obj: 'Fale com o padre, na igreja',
      marker: G => { const n = G.npcs.byId.bernardo; return inChurch(G) && n ? [n.pos.x, n.pos.y + 2.2, n.pos.z] : doorMarker(G); },
      enter(G) {
        G.ambient({ types: { ghost: 1 }, max: 1, every: [24, 36] });
        const p = ipt(G, 'igreja', 'padre'), d = places(G).churchDoor;
        G.use('entrar', [d.x, G.y(d.x, d.z) + 1.3, d.z], 2.4, 'ENTRAR NA IGREJA', () => { G.ambient(null); G.combat.clearEnemies(e => e.ambient); G.enter('igreja'); }, { once: false, cond: () => !inChurch(G) });
        G.npcs.stage('bernardo', { x: p.x, z: p.z, h: p.h, talks: [[
          'Os telefones? Aqui também tocou. O da casa paroquial, o da sacristia. Eu não atendi.',
          'Olha o que eu achei no livro de atas da comunidade. Foi escrito um ano depois de enterrarem a Otília.',
        ]], onTalkEnd: () => {
          if (G.S.def.steps[G.S.i]?.id !== 'padre') return;
          const ata = DOCS.find(d2 => d2.id === 'ata1879');
          G.extras.markDoc('ata1879');
          G.showPaper(ata, () => G.talk([[PADRE, [
            'Eles tocavam o sino às oito, toda noite. Pra ela saber que a cidade estava acordada.',
            'Pararam quando chegou a luz elétrica. Ninguém lembrava mais por quê.',
            'Ela está chamando a cidade pra dormir no mato. Sobe na torre e toca o sino. Toca até a cidade inteira acordar.',
            'A escada da torre sai do coro. Leva querosene: lá em cima não tem luz.',
          ], 150]], () => G.next()));
        } });
      },
    },
    {
      id: 'sino', obj: 'Suba na torre e toque o sino',
      marker: G => {
        if (!inChurch(G)) return doorMarker(G);
        const b = ipt(G, 'igreja', 'sino');
        // no térreo, a marca leva primeiro à escada do coro
        if (G.player.pos.y < b.y - 7) { const e = ipt(G, 'igreja', 'escadaCoro'); return { x: e.x, y: e.y + 1.8, z: e.z }; }
        if (G.player.pos.y < b.y - 3) { const t = ipt(G, 'igreja', 'coroTorre'); return { x: t.x, y: t.y + 1.8, z: t.z }; }
        return { x: b.x, y: b.y + 2.2, z: b.z };
      },
      enter(G) {
        const d = places(G).churchDoor, b = ipt(G, 'igreja', 'sino');
        G.use('entrar', [d.x, G.y(d.x, d.z) + 1.3, d.z], 2.4, 'ENTRAR NA IGREJA', () => G.enter('igreja'), { once: false, cond: () => !inChurch(G) });
        G.use('tocar', [b.x, b.y + 1.2, b.z], 2.4, 'PUXAR A CORDA DO SINO', () => G.next(), { hold: 1.2 });
      },
    },
    {
      id: 'badaladas', obj: 'Aguente enquanto o sino toca',
      enter(G, S) {
        G.unuse('entrar');
        const p = ipt(G, 'igreja', 'sinoPe');
        G.checkpoint(p.x, p.z, p.h, p.y);
        S.def.startRing(G, S);
      },
      update(G, dt, S) {
        const R = S.ring;
        R.t += dt;
        S.progress = { label: 'O SINO', f: R.t / RING_TIME, keep: true };
        R.bell -= dt;
        if (R.bell <= 0) { R.bell = 3.6; G.audio.bell(); G.interiors.defs.igreja?.ring(); G.combat.shake = Math.max(G.combat.shake, 0.08); }
        for (const w of R.plan) {
          if (w.done || R.t < w.at) continue;
          w.done = true;
          S.def.towerGhosts(G, w.n);
          if (w.at > 0) G.toast('ELAS SOBEM PELA TORRE');
        }
        if (R.t >= RING_TIME) {
          S.progress = null;
          for (const e of G.combat.enemies) if (!e.dead) e.die({});
          for (const p of G.extras.phones) G.extras.forceRing(p, false);
          for (let i = 0; i < 4; i++) setTimeout(() => G.audio.bell(), i * 700);
          return true;
        }
      },
      onRespawn(G, S) { G.combat.clearEnemies(); S.def.startRing(G, S); },
    },
    {
      id: 'fim', obj: null,
      enter(G) {
        G.after(2.5, () => G.narrate([
          'As badaladas desceram a rua inteira, de casa em casa, como nos tempos dos colonos.',
          'Um por um, os telefones de Teewald pararam de tocar.',
          'Na central telefônica, a última luz acesa no painel apagou sozinha. Era de uma linha que nunca foi instalada: KRANZ, no fim da picada.',
          'Lá no mato, alguém desligou. Devagar.',
        ], () => G.complete(), { title: 'A LINHA CRUZADA' }));
      },
    },
  ],
  // orelhão atendido: o sonâmbulo pode ser acordado
  wakeable(G, S, q) {
    G.npcs.stage(q.id, { x: q.x, z: q.z, h: q.h, talks: [q.wake], onTalkEnd: () => {
      if (q.woke) return;
      q.woke = true;
      const n = G.npcs.stage(q.id, { talks: [q.wake.slice(-1)] });
      if (n) n.trance = false;
      S.def.count(G, S);
      G.autosave('acordou', true);
    } });
  },
  count(G, S) {
    const n = S.sleepers.filter(q => q.woke).length;
    if (G.S.def.steps[G.S.i]?.id === 'sonambulos') G.obj(`Acorde quem atendeu o telefone (${n}/3)`);
    if (n > 0) G.toast(`ACORDADOS ${n}/3`);
  },
  startRing(G, S) {
    S.ring = { t: 0, bell: 0.3, plan: [{ at: 3, n: 2 }, { at: 16, n: 3 }, { at: 30, n: 3 }] };
    for (const p of G.extras.phones) G.extras.forceRing(p, false);
  },
  // almas no alto da torre (atravessam as paredes; ficam no andar do sino)
  towerGhosts(G, n) {
    const C = G.interiors.defs.igreja;
    if (!C) return;
    SFX.wail(G.audio, 3, 1, 2.6);
    for (let i = 0; i < n; i++) {
      const [lx, lz] = TOWER[(i + Math.floor(Math.random() * TOWER.length)) % TOWER.length];
      const p = C.local(lx, lz, BELL_Y);
      G.spawn('ghost', p.x, p.z, { y: p.y });
    }
  },
};
