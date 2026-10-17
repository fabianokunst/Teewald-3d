// Medidor da mixagem: toca cada som do jogo num Chrome sem janela (OfflineAudioContext,
// mais rápido que tempo real e sem caixa de som) e mede o volume que chega à saída.
// Serve para balancear os sons com números em vez de no ouvido cansado.
//
// uso: npm run sons                  (tabela de todos os sons)
//      npm run sons -- passo sino    (só os que têm "passo" ou "sino" no nome/grupo)
//      npm run sons -- --json saida.json   (grava os números para comparar depois)
//      npm run sons -- --cru         (sem o limitador da saída, o som cru da soma)
//
// Colunas (volume do jogo no máximo, sem o volume do menu):
//   pico   maior amostra (dBFS); 0 = encosta no teto
//   LUFS   sonoridade percebida (ITU BS.1770, janela de 400 ms, o pior momento);
//          para sons contínuos (vento, chuva...) é a média do trecho já estável
//   curto  igual, mas em janela de 100 ms: pesa mais os sons curtos (tiro, passo)
//   ref    diferença em dB para o tiro de pistola (a referência da mixagem)
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const jsonOut = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const raw = argv.includes('--cru');
const filters = argv.filter((a, i) => !a.startsWith('--') && !(jsonAt >= 0 && i === jsonAt + 1)).map(s => s.toLowerCase());

// dano no jogador: o mesmo som que combat.hurt toca
const HURT = 'a.hurtSound ? a.hurtSound() : (()=>{const c=a.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.type="triangle";o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(110,t+0.22);g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.25);o.connect(g).connect(a.master);o.start(t);o.stop(t+0.3);M.G.GunAudio.thump(a,"punch",0.8);})()';
const AMB = (w, extra = '') => `a.setAmbience(true); a.setWeather(Object.assign({ rain: 0, storm: 0, night: 0, crickets: 0, wind: 0.2, indoor: 0, calm: 0 }, ${JSON.stringify(w)})); a.nextOmen = 999; a.nextCricket = 999; ${extra} a.update(0.016, 0, ${w.river ?? 999});`;
// ouvinte na origem e a igreja a d metros (inside: null, 'casa' ou 'igreja')
const BELL = (d, inside = null) => `a.listen({ x: 0, z: 0 }, null, { x: ${d}, z: 0 }, ${JSON.stringify(inside)});`;
const seq = (code, n, gap, t0 = 0) => Array.from({ length: n }, (_, i) => [t0 + i * gap, code]);
// estado contínuo do carro (CarAudio.update), criando o carro na primeira vez
const CAR = o => `(a._car ||= new M.CA.CarAudio(a)).update(0.016, ${JSON.stringify({ on: true, rpm: 720, load: 0, speed: 0, skid: 0, surface: 'asphalt', inside: true, x: 0, z: 0, rain: 0, crank: 0, ...o })})`;

// [grupo, nome, duração (s), eventos [[t, código]], janela estável [de, até] ou null]
const SONS = [
  ['armas', 'tiro de pistola', 2.5, [[0, 'M.G.GunAudio.shot(a)']]],
  ['armas', 'tiro de revólver', 2.5, [[0, 'M.G.GunAudio.revolver(a)']]],
  ['armas', 'tiro de espingarda', 3, [[0, 'M.G.GunAudio.shotgun(a)']]],
  ['armas', 'pistola, 3 tiros seguidos', 3, seq('M.G.GunAudio.shot(a)', 3, 0.28)],
  ['armas', 'raio do ET', 1, [[0, 'M.G.GunAudio.ray(a)']]],
  ['armas', 'dardo', 1, [[0, 'M.G.GunAudio.dart(a)']]],
  ['armas', 'dinamite a 10 m', 4, [[0, 'M.G.GunAudio.explosion(a, 10)']]],
  ['armas', 'golpe acertando (soco)', 1, [[0, 'M.G.GunAudio.thump(a, "punch", 1)']]],
  ['armas', 'golpe acertando (madeira)', 1, [[0, 'M.G.GunAudio.thump(a, "wood", 1)']]],
  ['armas', 'golpe no ar (pesado)', 1, [[0, 'M.G.GunAudio.swing(a, true)']]],
  ['armas', 'bala na parede a 10 m', 1, [[0, 'M.G.GunAudio.impact(a, "wall", 10)']]],
  ['armas', 'bala no metal a 10 m', 1, [[0, 'M.G.GunAudio.impact(a, "metal", 10)']]],
  ['armas', 'recarga (pente entrando)', 1, [[0, 'M.G.GunAudio.reload(a, "in")']]],
  ['armas', 'gatilho sem bala', 1, [[0, 'M.G.GunAudio.dry(a)']]],
  ['armas', 'cápsula caindo', 1, [[0, 'M.G.GunAudio.casing(a, 1)']]],
  ['armas', 'lata acertada a 10 m', 1, [[0, 'M.G.GunAudio.can(a, 10)']]],

  ['jogador', 'passo na grama', 1, [[0, 'a.step("grass")']]],
  ['jogador', 'passo na grama correndo', 1, [[0, 'a.step("grass", true)']]],
  ['jogador', 'passo na pedra', 1, [[0, 'a.step("stone")']]],
  ['jogador', 'passo na pedra correndo', 1, [[0, 'a.step("stone", true)']]],
  ['jogador', 'passo na madeira', 1, [[0, 'a.step("wood")']]],
  ['jogador', 'passo nas folhas', 1, [[0, 'a.step("leaves")']]],
  ['jogador', 'passo na água rasa', 1, [[0, 'a.step("water")']]],
  ['jogador', 'caminhando na pedra (4 s)', 4, seq('a.step("stone")', 8, 0.48)],
  ['jogador', 'correndo na grama (4 s)', 4, seq('a.step("grass", true)', 12, 0.32)],
  ['jogador', 'braçada nadando', 1, [[0, 'a.stroke(1)']]],
  ['jogador', 'mergulho', 2, [[0, 'a.splash(1.4)']]],
  ['jogador', 'jogador ferido', 1, [[0, HURT]]],

  ['criaturas', 'cão de fogo rosnando a 6 m', 1.5, [[0, 'M.S.SFX.growl(a, 6, 1.1)']]],
  ['criaturas', 'cão de fogo latindo a 6 m', 1, [[0, 'M.S.SFX.bark(a, 6, 1)']]],
  ['criaturas', 'cão de fogo morde (acerta)', 1, [[0, 'M.S.SFX.snarl(a, 0, 1.2)'], [0, HURT]]],
  ['criaturas', 'lobisomem bote (acerta)', 1, [[0, 'M.S.SFX.whoosh(a, 2)'], [0, 'M.S.SFX.snarl(a, 0, 1.1)'], [0, HURT]]],
  ['criaturas', 'lobisomem uivando a 20 m', 4, [[0, 'M.S.SFX.howl(a, 20, 0.95)']]],
  ['criaturas', 'lobisomem rosnando a 8 m', 1.5, [[0, 'M.S.SFX.growl(a, 8, 0.75)']]],
  ['criaturas', 'fera rugindo a 10 m', 3, [[0, 'M.S.SFX.roar(a, 10, 0.85, 2.0)']]],
  ['criaturas', 'fera patada a 4 m', 2, [[0, 'M.S.SFX.roar(a, 4, 1.1, 1.0)']]],
  ['criaturas', 'fera tremor a 6 m', 1.5, [[0, 'M.S.SFX.quake(a, 6)']]],
  ['criaturas', 'fera acerta o jogador', 1.5, [[0, 'M.S.SFX.stomp(a, 0, 1)'], [0, HURT]]],
  ['criaturas', 'fera passos (perto)', 1, [[0, 'M.S.SFX.stomp(a, 6, 0.8)']]],
  ['criaturas', 'morcego guinchando a 6 m', 1, [[0, 'M.S.SFX.screech(a, 6)']]],
  ['criaturas', 'morcego morde', 1, [[0, 'M.B.BSFX.bite(a, 0)'], [0, 'M.S.SFX.screech(a, 1, 1.15)'], [0, HURT]]],
  ['criaturas', 'rainha morcego guincho a 10 m', 1.5, [[0, 'M.B.BSFX.shriek(a, 10, 0.8)']]],
  ['criaturas', 'rainha morcego estouro a 6 m', 1.5, [[0, 'M.B.BSFX.blast(a, 6)']]],
  ['criaturas', 'rainha bate asas a 6 m', 1, [[0, 'M.B.BSFX.heavyFlap(a, 6)']]],
  ['criaturas', 'bruxa risada a 12 m', 2, [[0, 'M.S.SFX.cackle(a, 12)']]],
  ['criaturas', 'bruxa grito a 10 m', 2, [[0, 'M.W.SND.shriek(a, 10, 1.4)']]],
  ['criaturas', 'bruxa feitiço a 10 m', 1.5, [[0, 'M.S.SFX.spell(a, 10)']]],
  ['criaturas', 'bruxa labareda a 3 m', 1, [[0, 'M.W.SND.flare(a, 3)']]],
  ['criaturas', 'fantasma lamento a 8 m', 3, [[0, 'M.S.SFX.wail(a, 8)']]],
  ['criaturas', 'fantasma sussurro a 4 m', 1.5, [[0, 'M.S.SFX.whisper(a, 4)']]],
  ['criaturas', 'ET zumbido psíquico a 6 m', 1.5, [[0, 'M.S.SFX.psychic(a, 6)']]],
  ['criaturas', 'ET trinado a 6 m', 1, [[0, 'M.S.SFX.chirp(a, 6)']]],
  ['criaturas', 'nave a 20 m', 3.5, [[0, 'M.S.SFX.ufo(a, 20)']]],
  ['criaturas', 'chupacabra guincho a 10 m', 1.5, [[0, 'M.C.ChupaAudio.screech(a, 10, 1)']]],
  ['criaturas', 'chupacabra bote', 1.5, [[0, 'M.C.ChupaAudio.screech(a, 3, 0.8)'], [0, 'M.C.ChupaAudio.whoosh(a, 3)']]],
  ['criaturas', 'chupacabra garra (acerta)', 1, [[0, 'M.C.ChupaAudio.claw(a)'], [0, HURT]]],
  ['criaturas', 'chupacabra rosnando a 8 m', 1.5, [[0, 'M.C.ChupaAudio.growl(a, 8)']]],
  ['criaturas', 'chupacabra chiando a 4 m', 1, [[0, 'M.C.ChupaAudio.hiss(a, 4)']]],
  ['criaturas', 'chupacabra ferido a 8 m', 1, [[0, 'M.C.ChupaAudio.hurt(a, 8)']]],
  ['criaturas', 'criatura derrotada (vinheta)', 3, [[0, 'M.S.SFX.sting(a)']]],

  ['ambiente', 'vento (dia comum)', 11, [[0, AMB({ wind: 0.2 })]], [7, 11]],
  ['ambiente', 'vento forte', 11, [[0, AMB({ wind: 0.9 })]], [7, 11]],
  ['ambiente', 'folhas na rajada (só elas, vento forte)', 11, [[0, AMB({ wind: 0.9 }) + 'for (const g of [...a.winds.map(w => w.g), a.droneGain]) { g.gain.cancelScheduledValues(0); g.gain.value = 0; }']], [7, 11]],
  ['ambiente', 'tarde calma', 11, [[0, AMB({ wind: 0.1, calm: 1 })]], [7, 11]],
  ['ambiente', 'noite', 11, [[0, AMB({ wind: 0.3, night: 1 })]], [7, 11]],
  ['ambiente', 'dentro de casa', 11, [[0, AMB({ wind: 0.3, indoor: 1 })]], [7, 11]],
  ['ambiente', 'beira do rio (3 m)', 11, [[0, AMB({ wind: 0.2, river: 3 })]], [7, 11]],
  ['ambiente', 'chuva forte', 11, [[0, AMB({ wind: 0.6, rain: 1, storm: 1 })]], [7, 11]],
  ['ambiente', 'chuva vista de dentro', 11, [[0, AMB({ wind: 0.6, rain: 1, storm: 1, indoor: 1 })]], [7, 11]],
  ['ambiente', 'música de luta', 11, [[0, AMB({ wind: 0.2 }, 'a.setTension(1, 0);')]], [7, 11]],
  ['ambiente', 'música de chefe', 11, [[0, AMB({ wind: 0.2 }, 'a.setTension(1, 1);')]], [7, 11]],
  ['ambiente', 'grilo', 1, [[0, 'a.cricket()']]],
  ['ambiente', 'quero-quero', 2, [[0, 'a.queroQuero(false)']]],
  ['ambiente', 'bem-te-vi', 1.5, [[0, 'a.bemTeVi()']]],
  ['ambiente', 'pomba', 1.5, [[0, 'a.dove()']]],
  ['ambiente', 'sapo na beira do rio', 1, [[0, 'a.frog(1)']]],
  ['ambiente', 'cachorro latindo longe', 2, [[0, 'a.dogBark()']]],
  ['ambiente', 'madeira rangendo (dentro)', 1.5, [[0, 'a.creak()']]],
  ['ambiente', 'corvo', 2, [[0, 'a.crow()']]],
  ['ambiente', 'cachorro uivando longe', 4, [[0, 'a.howl()']]],
  ['ambiente', 'coruja ao longe', 1.5, [[0, 'a.owl()']]],
  ['ambiente', 'trovão perto', 5, [[0, 'a.thunder(1, false)']]],
  ['ambiente', 'trovão longe', 5, [[0, 'a.thunder(0.5, false)']]],

  ['sino', 'sino: na praça (30 m)', 7, [[0, BELL(30) + 'a.bell()']]],
  ['sino', 'sino: a 100 m', 7, [[0, BELL(100) + 'a.bell()']]],
  ['sino', 'sino: longe (300 m)', 7, [[0, BELL(300) + 'a.bell()']]],
  ['sino', 'sino: dentro de casa', 7, [[0, BELL(100, 'casa') + 'a.bell()']]],
  ['sino', 'sino: dentro da igreja', 7, [[0, BELL(0, 'igreja') + 'a.bell()']]],
  ['sino', 'sino: badalada solta ao longe (150 m)', 7, [[0, BELL(150) + 'a.bell(0.6)']]],
  ['sino', 'sino: alarme na praça, 4 em 0,7 s', 8, [[0, BELL(30)], ...seq('a.bell()', 4, 0.7)]],
  ['sino', 'sino: tocando sem parar a 60 m (3,6 s)', 14, [[0, BELL(60)], ...seq('a.bell()', 4, 3.6)]],

  ['mundo', 'telefone tocando a 6 m', 1.5, [[0, 'M.X.ringBurst(a, Math.pow(1 - 6 / 80, 1.6) * 0.9)']]],
  ['mundo', 'gata miando no colo', 1, [[0, 'M.X.meow(a)']]],
  ['mundo', 'pedra arrastando a 5 m', 1, [[0, 'M.C9.scrape(a, 5, 0.5)']]],
  ['mundo', 'suindara cantando a 20 m', 2.5, [[0, 'M.O.VOICES.suindara.song(a, M.O.spatial(a, 20, 0.3, 120), a.ctx.currentTime)']]],
  ['mundo', 'murucututu a 20 m', 3.5, [[0, 'M.O.VOICES.murucututu.song(a, M.O.spatial(a, 20, -0.3, 140), a.ctx.currentTime)']]],
  ['mundo', 'buraqueira a 12 m', 1.5, [[0, 'M.O.VOICES.buraqueira.song(a, M.O.spatial(a, 12, 0.5, 75), a.ctx.currentTime)']]],
  ['mundo', 'coruja voando perto (3 m)', 1.5, [[0, 'M.O.VOICES.suindara.flush(a, M.O.spatial(a, 3, 0, 30), a.ctx.currentTime)']]],
  ['mundo', 'banda fantasma a 15 m', 6, [[0, 'a._w = new M.GB.Waltz(a); a._w.start(); a._w.update(Math.pow(1 - 15 / 45, 1.4) * 0.55, 0)'], ...seq('a._w.update(Math.pow(1 - 15 / 45, 1.4) * 0.55, 0)', 22, 0.25, 0.25)], [2, 6]],
  ['interface', 'menu: mover', 1, [[0, 'a.menuMove()']]],
  ['interface', 'menu: confirmar', 1, [[0, 'a.menuOk()']]],
  ['interface', 'menu: voltar', 1, [[0, 'a.menuBack()']]],
  ['interface', 'item pego', 1, [[0, 'M.G.GunAudio.pickup(a)']]],
  ['interface', 'acerto no alvo (ding)', 1.5, [[0, 'M.G.GunAudio.ding(a)']]],
  ['interface', 'fala de NPC (bipe)', 1, seq('a.tone(1800, 0.025, "square", 0.03)', 6, 0.06)],

  // o carro (game/carAudio.js): estados contínuos medidos no trecho estável
  ['carro', 'motor em marcha lenta (dentro)', 3, [[0, CAR({ rpm: 720 })], ...seq(CAR({ rpm: 720 }), 10, 0.25, 0.25)], [1, 3]],
  ['carro', 'motor acelerando forte (dentro)', 3, [[0, CAR({ rpm: 3800, load: 1, speed: 8 })], ...seq(CAR({ rpm: 3800, load: 1, speed: 8 }), 10, 0.25, 0.25)], [1, 3]],
  ['carro', 'motor a 60 km/h no asfalto (dentro)', 3, [[0, CAR({ rpm: 2700, load: 0.4, speed: 17 })], ...seq(CAR({ rpm: 2700, load: 0.4, speed: 17 }), 10, 0.25, 0.25)], [1, 3]],
  ['carro', 'paralelepípedo a 40 km/h (dentro)', 3, [[0, CAR({ rpm: 2200, load: 0.3, speed: 11, surface: 'sett' })], ...seq(CAR({ rpm: 2200, load: 0.3, speed: 11, surface: 'sett' }), 10, 0.25, 0.25)], [1, 3]],
  ['carro', 'pneu cantando (dentro)', 3, [[0, CAR({ rpm: 2500, load: 0.6, speed: 15, skid: 1 })], ...seq(CAR({ rpm: 2500, load: 0.6, speed: 15, skid: 1 }), 10, 0.25, 0.25)], [1, 3]],
  ['carro', 'motor em marcha lenta a 10 m (fora)', 3, [[0, 'a.listen({ x: 0, z: 0 }); ' + CAR({ rpm: 720, inside: false, x: 10 })], ...seq(CAR({ rpm: 720, inside: false, x: 10 }), 10, 0.25, 0.25)], [1, 3]],
  ['carro', 'partida', 2, [[0, 'a._car = new M.CA.CarAudio(a); a._car.crank(0.62)']]],
  ['carro', 'porta batendo', 1, [[0, 'a._car = new M.CA.CarAudio(a); a._car.door(false)']]],
  ['carro', 'porta abrindo', 1, [[0, 'a._car = new M.CA.CarAudio(a); a._car.door(true)']]],
  ['carro', 'buzina', 1.5, [[0, 'a._car = new M.CA.CarAudio(a); a._car.horn(true)'], [1, 'a._car.horn(false)']]],
  ['carro', 'batida forte', 1.5, [[0, 'a._car = new M.CA.CarAudio(a); a._car.crash(1)']]],
  ['carro', 'atropelou um bicho', 1, [[0, 'a._car = new M.CA.CarAudio(a); a._car.thud(1)']]],
];

const list = SONS.filter(([g, n]) => !filters.length || filters.some(f => (g + ' ' + n).toLowerCase().includes(f)));
if (!list.some(s => s[1] === 'tiro de pistola')) list.unshift(SONS[0]);

// página vazia servida pelo próprio Vite, para importar os módulos do jogo
const server = await createServer({
  root, logLevel: 'error', server: { port: 4321, strictPort: false, hmr: false },
  plugins: [{ name: 'sons', configureServer(s) { s.middlewares.use('/__sons', (q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><meta charset="utf-8"><title>sons</title>'); }); } }],
});
await server.listen();
const url = server.resolvedUrls.local[0];
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--mute-audio'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('  ✖', e.message));
await page.goto(url + '__sons', { waitUntil: 'load' });

const results = await page.evaluate(async (list, raw) => {
  const M = {
    A: await import('/src/engine/audio.js'),
    G: await import('/src/game/gunAudio.js'),
    S: await import('/src/game/creatures/sfx.js'),
    C: await import('/src/game/chupacabra.js'),
    B: await import('/src/game/creatures/bat.js'),
    W: await import('/src/game/creatures/witch.js'),
    X: await import('/src/game/extras.js'),
    O: await import('/src/game/owls.js'),
    GB: await import('/src/game/ghostBand.js'),
    C9: await import('/src/game/chapters/ch09.js'),
    CA: await import('/src/game/carAudio.js'),
  };
  const SR = 48000;
  // o limitador do Chrome aperta demais no começo do contexto: os sons só entram depois
  // de meio segundo (no jogo o contexto já está rodando há muito tempo)
  const LEAD = 0.5;
  // filtro K da BS.1770 (para 48 kHz): prateleira de agudos + passa-altas
  const KS = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1, -2, 1, -1.99004745483398, 0.99007225036621]];
  function kWeight(x) {
    let y = x;
    for (const [b0, b1, b2, a1, a2] of KS) {
      const o = new Float32Array(y.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v; }
      y = o;
    }
    return y;
  }
  const lufs = ms => ms > 1e-12 ? -0.691 + 10 * Math.log10(ms) : -99;
  function analyze(buf, win) {
    const ch = [0, 1].map(i => buf.getChannelData(i).subarray(LEAD * SR));
    let peak = 0;
    for (const d of ch) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const kw = ch.map(kWeight);
    const sq = new Float64Array(kw[0].length + 1);   // soma acumulada dos quadrados (L + R)
    for (let i = 0; i < kw[0].length; i++) sq[i + 1] = sq[i] + kw[0][i] * kw[0][i] + kw[1][i] * kw[1][i];
    const maxWin = w => { const n = Math.round(w * SR), hop = Math.round(0.01 * SR); let m = 0; for (let i = 0; i + n <= kw[0].length; i += hop) m = Math.max(m, (sq[i + n] - sq[i]) / n); return m; };
    const out = { peak: peak > 0 ? 20 * Math.log10(peak) : -99, M: lufs(maxWin(0.4)), S: lufs(maxWin(0.1)) };
    if (win) { const i0 = Math.round(win[0] * SR), i1 = Math.min(kw[0].length, Math.round(win[1] * SR)); out.M = out.S = lufs((sq[i1] - sq[i0]) / (i1 - i0)); }
    return out;
  }
  const res = [];
  for (const [group, name, dur, events, win] of list) {
    const Real = window.AudioContext;
    window.AudioContext = function () { return new OfflineAudioContext(2, Math.ceil(SR * (dur + LEAD)), SR); };
    const a = new M.A.Audio();
    a.start(); a.setVolume(1);
    if (raw && a.mix) { a.mix.disconnect(); a.mix.connect(a.out_); }
    window.AudioContext = Real;
    const run = code => new Function('a', 'M', code)(a, M);
    const at = new Map();   // eventos agrupados por instante (na ordem da lista)
    for (const [t, code] of events) { const q = Math.round((t + LEAD) * SR / 128) * 128 / SR; at.set(q, [...(at.get(q) || []), code]); }
    for (const [q, codes] of at) a.ctx.suspend(q).then(() => { codes.forEach(run); a.ctx.resume(); });
    const buf = await a.ctx.startRendering();
    res.push({ group, name, ...analyze(buf, win), steady: !!win });
  }
  return res;
}, list, raw);

await browser.close();
await server.close();

const ref = results.find(r => r.name === 'tiro de pistola');
const f1 = v => (v <= -98 ? '   —' : v.toFixed(1).padStart(6));
let last = '';
console.log('\n' + 'som'.padEnd(38) + '  pico   LUFS  curto    ref');
for (const r of results) {
  if (r.group !== last) { console.log(`\n[${r.group}]`); last = r.group; }
  const d = r.M - ref.M;
  console.log(('  ' + r.name + (r.steady ? ' ~' : '')).padEnd(38) + f1(r.peak) + f1(r.M) + f1(r.S) + ((d >= 0 ? ' +' : ' ') + d.toFixed(1)).padStart(7) + (r.peak > -0.1 ? '  ESTOURA' : ''));
}
console.log('\n~ = som contínuo (média do trecho estável)');
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1)); console.log('gravado em', jsonOut); }
