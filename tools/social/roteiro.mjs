// Roteiro do reels (npm run social -- reels): 30 s em 1080x1920, a 30 quadros por segundo.
// Do dia de sol à tempestade: a cidade, a Matriz, a neblina do calçadão, as pegadas, o
// forasteiro na chuva, a mira na beira do mato, o raio e o fim com os olhos no escuro.
// Os letreiros (o texto por cima) vêm de LETREIROS, em posts.mjs. O som é o do jogo.
// Nada de spoiler: nenhuma criatura aparece (só os olhos, como na capa do site).

export const REELS = { arquivo: 'teewald-reels.mp4', w: 1080, h: 1920, fps: 30, bitrate: 16e6, volume: 0.8, ganhoMax: 3 };

// roda dentro da página do jogo e deixa o roteiro em window.__roteiro (veja gravador.js)
function roteiro() {
  const T = window.__teewald, A = T.audio;
  const chao = (x, z) => T.ctx.surfaceAt(x, z);
  const ease = t => t * t * (3 - 2 * t);
  const mix = (a, b, k) => a + (b - a) * k;
  const mixv = (a, b, k) => a.map((v, i) => mix(v, b[i], k));
  // câmera em [x, altura acima do chão, z]
  const olha = (c, a, fov) => {
    T.view(c[0], chao(c[0], c[2]) + c[1], c[2], a[0], chao(a[0], a[2]) + a[1], a[2]);
    if (fov) { T.camera.fov = fov; T.camera.updateProjectionMatrix(); }
  };
  const trilho = (dur, c0, c1, a0, a1, fov) => t => { const k = ease(Math.min(1, t / dur)); olha(mixv(c0, c1, k), mixv(a0, a1, k), fov); };
  // letreiro: entra em de, sai em ate, com transição de f segundos
  const aparece = (de, ate, f = 0.35) => t => Math.max(0, Math.min(1, (t - de) / f, (ate - t) / f));
  // fundo preto: sobe do preto no começo (ini) e afunda no fim (fim), em segundos
  const preto = (dur, ini = 0, fim = 0) => t => Math.max(ini ? 1 - t / ini : 0, fim ? 1 - (dur - t) / fim : 0);
  const desarma = () => { T.pistol.equip(null); T.input.mouse.buttons = 0; T.npcs.focus = null; T.npcs.dialogue.open = false; };
  // caminhada automática do forasteiro (o mesmo da abertura do jogo)
  const anda = (pontos, h) => { T.teleport(pontos[0][0], pontos[0][1], h); T.player.auto = { path: pontos, i: 1 }; };
  const passo = dt => T.player.update(dt, T.tpc.yaw, null);
  const clima = (nome, lanterna = false) => { T.atmo.set(nome, 0); T.atmo.flashlightOn = lanterna; };
  // toca uma vez quando o tempo da cena passa de t0
  const uma = (G, chave, t, t0, fn) => { if (t >= t0 && !G[chave]) { G[chave] = true; fn(); } };

  // ---- cenas
  const A_dur = 3.2, B_dur = 3.4, C_dur = 3.0, D_dur = 3.0, E_dur = 3.6, F_dur = 2.6, G_dur = 3.4, H_dur = 2.4, I_dur = 4.8;
  // F: o forasteiro vindo na direção da câmera, na chuva (rumo da rua da praça)
  const hE = Math.atan2(-166 - -182, 29 - 52), fxE = Math.sin(hE), fzE = Math.cos(hE);
  window.__roteiro = [
    {
      // a cidade do alto, num dia de sol: o gancho
      dur: A_dur,
      prep: () => {
        desarma(); clima('ensolarado');
        T.ctx.leaves.mesh.material.visible = true;
        // os barramentos do jogo, um pouco mais cheios para o celular (o tiro segue o mais alto)
        for (const [k, db] of Object.entries({ amb: 8, omen: 6, steps: 9, bell: 4, creatures: 5, music: 7, fx: 4, car: 0 })) A.bus[k].gain.value *= Math.pow(10, db / 20);
        // o som vem de onde o forasteiro está: a uns 40 m da Matriz, o sino chega claro
        T.teleport(-80, 60, 0);
        A.bus.amb.gain.value *= 2.5;   // lá no alto venta mais (volta ao normal na cena seguinte)
      },
      quadro: (t, dt, G) => {
        trilho(A_dur, [-262, 78, 172], [-226, 58, 140], [-60, 5, 30], [-50, 8, 34], 55)(t);
        // o sino da Matriz, ouvido de longe
        uma(G, 'sinoA1', t, 0.05, () => A.bell(1.6));
        uma(G, 'sinoA2', t, 1.5, () => A.bell(1.6));
        uma(G, 'corvo1', t, 0.3, () => A.crow());
        uma(G, 'corvo2', t, 2.1, () => A.crow());
      },
      // o gancho já está na tela no primeiro quadro
      letreiros: [{ img: 'gancho', alfa: aparece(-1, 3.0, 0.25) }],
    },
    {
      // a Matriz no anoitecer, a câmera subindo; o sino toca
      dur: B_dur,
      prep: () => { clima('anoitecer'); T.teleport(-104, 70, 2.2); A.bus.amb.gain.value /= 2.5; },
      quadro: (t, dt, G) => {
        trilho(B_dur, [-113, 13, 67], [-106, 15, 60], [-44, 12, 16], [-44, 11, 18], 54)(t);
        uma(G, 'sino1', t, 0.0, () => A.bell(1.4));
        uma(G, 'sino2', t, 1.45, () => A.bell(1.4));
        uma(G, 'sino3', t, 2.9, () => A.bell(1.4));
      },
      letreiros: [{ img: 'lugar', alfa: aparece(0.35, 3.2), sobe: 18 }],
      escuro: preto(B_dur, 0.2, 0.15),
    },
    {
      // a neblina do calçadão: o forasteiro some caminhando, de lanterna acesa
      dur: C_dur,
      prep: () => {
        clima('madrugada', true);
        anda([[-319.2, 263.5], [-321.6, 276], [-324.4, 290], [-327, 304]], Math.atan2(-15, 72));
      },
      quadro: (t, dt) => {
        passo(dt);
        olha([mix(-318, -318.6, t / C_dur), 1.7, mix(258, 260.5, t / C_dur)], [-333, 1.4, 330], 56);
      },
      letreiros: [{ img: 'neblina', alfa: aparece(0.3, 2.85), sobe: 18 }],
      escuro: preto(C_dur, 0.15, 0.12),
    },
    {
      // as pegadas na beira do mato, sob a lua, até o bicho morto
      dur: D_dur,
      prep: () => { clima('luaCheia'); T.player.auto = null; T.teleport(-40, -40, 0); },
      quadro: trilho(D_dur, [20, 1.25, -4.5], [27, 0.95, -3.2], [60, 2.5, 0], [60, 1.2, 0], 58),
      letreiros: [{ img: 'criacao', alfa: aparece(0.3, 2.85), sobe: 18 }],
      escuro: preto(D_dur, 0.15, 0.12),
    },
    {
      // o forasteiro na chuva, rua da praça, a câmera atrás dele
      dur: E_dur,
      prep: () => {
        clima('chuva', true);
        anda([[-182, 52], [-182 + fxE * 4, 52 + fzE * 4], [-182 + fxE * 9, 52 + fzE * 9]], hE);
      },
      quadro: (t, dt) => {
        passo(dt);
        const p = T.player.pos, h = T.player.heading, fx = Math.sin(h), fz = Math.cos(h);
        olha([p.x - fx * 3.8 + fz * 0.6, 1.9, p.z - fz * 3.8 - fx * 0.6], [p.x + fx * 20 - fz * 1.2, 0.8, p.z + fz * 20 + fx * 1.2], 52);
      },
      letreiros: [{ img: 'escurece', alfa: aparece(0.4, 3.45), sobe: 18 }],
      escuro: preto(E_dur, 0.15, 0.12),
    },
    {
      // de frente: ele vem na direção da câmera, a lanterna acesa
      dur: F_dur,
      prep: () => {
        const x0 = -182 + fxE * 11, z0 = 52 + fzE * 11;
        anda([[x0, z0], [x0 - fxE * 4, z0 - fzE * 4], [x0 - fxE * 9, z0 - fzE * 9]], hE + Math.PI);
      },
      quadro: (t, dt) => {
        passo(dt);
        const p = T.player.pos, h = T.player.heading, fx = Math.sin(h), fz = Math.cos(h);
        olha([p.x + fx * 3.4 - fz * 0.5, 1.15, p.z + fz * 3.4 + fx * 0.5], [p.x, 1.45, p.z], 50);
      },
      letreiros: [{ img: 'menos', alfa: aparece(0.45, 2.5, 0.3), sobe: 12 }],
      escuro: preto(F_dur, 0.12, 0),
    },
    {
      // a mira na beira do mato, na garoa: alguma coisa grita lá dentro; dois tiros.
      // Câmera livre, de três quartos por trás; a arma e o corpo andam pelas funções do jogo
      dur: G_dur,
      prep: async (T_, G) => {
        T.player.auto = null;
        G.chupa = (await import('/src/game/chupacabra.js')).ChupaAudio;
        clima('garoa', true);
        if (!T.inventory.find('pistol')) { T.inventory.add('pistol', 1); T.inventory.add('ammo9', 36); }
        T.pistol.equip('pistol');
        const s = T.inventory.find('pistol'); if (s) (s.data ||= {}).mag = 12;
        const px = -276, pz = 54;
        G.hMira = Math.atan2(-330 - px, 0 - pz);
        T.teleport(px, pz, G.hMira);
        T.tpc.yaw = G.hMira + Math.PI;   // a pistola mira para onde o corpo olha
        T.input.mouse.buttons = 2;
      },
      quadro: (t, dt, G) => {
        A.tension = { k: Math.min(1, t / 0.6), boss: 0 };
        uma(G, 'grito', t, 0.7, () => G.chupa.screech(A, 38, 1));
        if ((t >= 2.05 && !G.tiro1 && (G.tiro1 = true)) || (t >= 2.55 && !G.tiro2 && (G.tiro2 = true))) T.input.touch.fireHit = true;
        T.pistol.pre(dt, T.input);
        T.player.update(dt, T.tpc.yaw, T.input);
        T.pistol.post(dt);
        const p = T.player.pos, h = G.hMira, fx = Math.sin(h), fz = Math.cos(h), k = ease(Math.min(1, t / G_dur));
        // atrás e um pouco à direita, chegando devagar
        // a direita de quem olha para (fx, fz) é (-fz, fx)
        const atras = mix(2.8, 2.35, k), lado = 0.5;
        olha([p.x - fx * atras - fz * lado, 1.55, p.z - fz * atras + fx * lado], [p.x + fx * 5 + fz * 0.4, 1.3, p.z + fz * 5 - fx * 0.4], 50);
      },
      escuro: preto(G_dur, 0.1, 0),
    },
    {
      // a tempestade: o raio cai ao lado da torre
      dur: H_dur,
      prep: () => {
        desarma(); A.tension = { k: 0, boss: 0 };
        clima('tempestade'); T.atmo.nextStrike = 99;
        T.teleport(-110, 64, 2.2);
      },
      quadro: (t, dt, G) => {
        trilho(H_dur, [-104.2, 15, 58.5], [-100.5, 14, 57.4], [-42.8, 13, 40.4], [-42.8, 14, 40.4], 50)(t);
        uma(G, 'raio', t, 0.35, () => { T.atmo.strike(true); T.ctx.sky.makeBolt(Math.atan2(-42.8 + 104.2, 40.4 - 58.5) - 0.1); });
      },
      escuro: preto(H_dur, 0, 0.45),
    },
    {
      // o fim: a beira do mato na lua cheia, os olhos no escuro e o nome do jogo
      dur: I_dur,
      prep: (T_, G) => { clima('luaCheia'); T.atmo.nextStrike = 99; T.teleport(-250, 80, 0); },
      quadro: (t, dt, G) => {
        olha([mix(-262, -263.2, t / I_dur), 1.7, mix(66, 64.8, t / I_dur)], [-320, 9, 6], 60);
        uma(G, 'grito2', t, 0.55, () => G.chupa.screech(A, 55, 0.8));
      },
      letreiros: [
        // os olhos acendem, piscam duas vezes e ficam
        { img: 'olhos', alfa: t => (t < 0.5 ? 0 : t < 0.62 ? (t - 0.5) / 0.12 : (t > 1.6 && t < 1.7) || (t > 1.85 && t < 1.95) ? 0 : 1) },
        { img: 'fim', alfa: aparece(1.2, 99, 0.5), sobe: 14 },
      ],
      escuro: preto(I_dur, 0.6, 0),
    },
  ];
}

export const ROTEIRO = '(' + roteiro.toString() + ')();';
