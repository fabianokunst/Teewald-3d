// Fotos do jogo para as peças do Instagram (npm run social -- fotos).
// Cada foto sai em social/fotos/<nome>.jpg, sem texto, no formato da peça e com o dobro de
// resolução (post 2160x2700, story 1620x2880): o jogo desenha em tamanho grande e a foto é
// reduzida na montagem, com as bordas lisas.
//
// cena: clima, câmera e alvo em [x, altura acima do chão, z] (interior: coordenadas absolutas),
// jogador [x, z, heading], fov, lanterna. brilho: clareia depois (as de noite).
// js: código rodado depois de montar a cena (C = window.__cap, T = window.__teewald).
// ui: mostra a interface do jogo. ps1: página com ?visual=ps1. formato: post (4:5), story (9:16),
// tela (4:3, para as telas do jogo com interface) ou celular (página de celular deitado, com toque).

// a câmera atrás do forasteiro, de lanterna acesa na chuva, na rua da praça
const CHUVA = C => {
  const h = Math.atan2(-166 - -182, 29 - 52), px = -182, pz = 52;
  C.cena({
    clima: 'chuva', lanterna: true, jogador: [px, pz, h], fov: 50,
    cam: [px - Math.sin(h) * 3.6 + Math.cos(h) * 0.5, 1.9, pz - Math.cos(h) * 3.6 - Math.sin(h) * 0.5],
    alvo: [px + Math.sin(h) * 20 - Math.cos(h) * 1.5, 0.6, pz + Math.cos(h) * 20 + Math.sin(h) * 1.5],
  });
};

export const FOTOS = [
  // a capa: a Igreja Matriz no anoitecer
  { nome: 'capa', formato: 'post', cena: { clima: 'anoitecer', cam: [-108, 14, 62], alvo: [-44, 10, 16], fov: 52 } },
  { nome: 'capa-story', formato: 'story', cena: { clima: 'anoitecer', cam: [-112, 14, 66], alvo: [-44, 13, 16], fov: 58 } },
  // a cidade do alto: igreja, praça e o morro atrás
  { nome: 'cidade', formato: 'post', cena: { clima: 'ensolarado', cam: [-250, 70, 160], alvo: [-60, 5, 30], fov: 55 } },
  { nome: 'igreja', formato: 'post', cena: { clima: 'tarde', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 } },
  { nome: 'praca', formato: 'post', cena: { clima: 'tarde', cam: [-190, 3.4, 52], alvo: [-176, 1.4, 70], fov: 56 } },
  { nome: 'calcadao', formato: 'post', cena: { clima: 'tarde', cam: [-318, 2.6, 258], alvo: [-333, 1.2, 330], fov: 55 } },
  { nome: 'enxaimel', formato: 'post', cena: { clima: 'tarde', cam: [-152, 2, -120], alvo: [-128, 4, -103.6], fov: 50 } },
  {
    // o carro do forasteiro estacionado na beira do calçadão
    nome: 'carro', formato: 'post', js: (C, T) => {
      const x = -317.08, z = 371.63, h = 0.1748, fx = Math.sin(h), fz = Math.cos(h);
      T.car.place(x, z, h);
      C.cena({ clima: 'anoitecer', fov: 40, cam: [x + fx * 7.2 + fz * 4.6, 0.95, z + fz * 7.2 - fx * 4.6], alvo: [x + fx * 0.4, 1.15, z + fz * 0.4], jogador: [x + fx * 1.2 + fz * 1.45, z + fz * 1.2 - fx * 1.45, h + 2.0] });
    },
  },
  { nome: 'chuva', formato: 'post', espera: 2500, js: CHUVA },
  { nome: 'chuva-story', formato: 'story', espera: 2500, js: CHUVA },
  { nome: 'praca-noite', formato: 'post', cena: { clima: 'noite', cam: [-164.8, 3, 57.4], alvo: [-180.8, 1.2, 70.4], fov: 55 } },
  { nome: 'lua', formato: 'post', brilho: 1.1, cena: { clima: 'luaCheia', cam: [-98, 2, 86], alvo: [-60, 14, 40], fov: 62 } },
  {
    // Seu Valdir no banco da praça, com a garrafa térmica
    nome: 'valdir', formato: 'post', js: (C, T) => {
      const n = T.npcs.byId.valdir, h = n.heading, fx = Math.sin(h), fz = Math.cos(h);
      const cx = n.pos.x + fx * 2.8 + fz * 1.2, cz = n.pos.z + fz * 2.8 - fx * 1.2;
      C.cena({ clima: 'tarde', cam: [cx, 1.25, cz], alvo: [n.pos.x - fz * 0.3, 0.85, n.pos.z + fx * 0.3], fov: 40, jogador: [cx + fx * 6, cz + fz * 6, 0] });
    },
  },
  {
    // mirando a pistola na beira do mato, na garoa (a câmera do jogo, por cima do ombro)
    nome: 'mira', formato: 'tela', brilho: 1.4, espera: 2500, js: (C, T) => {
      T.npcs.focus = null;
      C.cena({ clima: 'garoa', lanterna: true, cam: [-270, 2, 60], alvo: [-330, 6, 0] });
      C.armado();
      const px = -276, pz = 54, h = Math.atan2(-330 - px, 0 - pz);
      T.teleport(px, pz, h);
      T.setState('play'); C.semInterface();
      T.input.mouse.buttons = 2;
      T.setYawPitch(h + Math.PI, 0, 3);
    },
  },
  {
    // conversa com o Seu Valdir: a caixa de diálogo do jogo aparece
    nome: 'conversa', formato: 'post', ui: true, espera: 3000, js: (C, T) => {
      T.input.mouse.buttons = 0;
      T.pistol.equip(null);   // desarmado: o Seu Valdir convida para sentar
      C.cena({ clima: 'tarde', cam: [-190, 3.4, 52], alvo: [-176, 1.4, 70] });
      const n = T.npcs.byId.valdir, px = n.pos.x + 1.9, pz = n.pos.z - 0.8;
      T.teleport(px, pz, Math.atan2(n.pos.x - px, n.pos.z - pz));
      T.setState('play');
      T.npcs.focus = n; T.npcs.startTalk(); T.setState('talk');
      C.interface();
      setTimeout(() => { T.npcs.dialogue.chars = 400; }, 2000);
    },
  },
  {
    // o inventário do começo do jogo
    nome: 'inventario', formato: 'tela', ui: true, espera: 2500, js: (C, T) => {
      T.input.mouse.buttons = 0;
      T.npcs.dialogue.open = false; T.npcs.focus = null;
      C.cena({ clima: 'tarde', cam: [-318, 2.6, 258], alvo: [-333, 1.2, 330] });
      C.armado();
      T.teleport(-325, 290, 0); T.setState('play');
      T.invScreen.open(); T.setState('inventory');
      C.interface();
    },
  },
  // a trilha de pegadas entrando no mato, sob a lua cheia
  { nome: 'pegadas', formato: 'post', brilho: 1.25, cena: { clima: 'luaCheia', cam: [20, 1.7, -4], alvo: [60, 8, 0], fov: 60 } },
  // a beira do mato de noite (fundo da fala do Seu Arno e dos cartões de chamada)
  { nome: 'mato', formato: 'post', brilho: 1.2, cena: { clima: 'luaCheia', cam: [-262, 1.7, 66], alvo: [-320, 9, 6], fov: 60 } },
  { nome: 'mato-story', formato: 'story', brilho: 1.2, cena: { clima: 'luaCheia', cam: [-262, 1.7, 66], alvo: [-320, 9, 6], fov: 64 } },
  { nome: 'cemiterio', formato: 'post', brilho: 1.5, cena: { clima: 'garoa', cam: [42, 2.2, 36], alvo: [72, 1.4, 44], fov: 55 } },
  {
    // tempestade: o raio cai à esquerda da torre
    nome: 'tempestade', formato: 'post', espera: 45, js: (C, T) => {
      C.cena({ clima: 'tempestade', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 });
      return new Promise(r => setTimeout(() => {
        T.atmo.strike(true);
        T.ctx.sky.makeBolt(Math.atan2(-42.8 + 104.2, 40.4 - 58.5) - 0.2);
        r();
      }, 1500));
    },
  },
  { nome: 'kartoffelfest', formato: 'post', espera: 2500, cena: { clima: 'anoitecer', cam: [-236, 2.4, 171.5], alvo: [-200, 2.2, 201], fov: 60 } },
  { nome: 'igreja-dentro', formato: 'post', espera: 3000, cena: { clima: 'tarde', interior: ['igreja', 'nave'], cam: [10110, 402.4, 9706], alvo: [10110, 401.8, 9736], fov: 60 } },
  // o mesmo enquadramento nos dois estilos visuais
  { nome: 'estilo-limpo', formato: 'post', cena: { clima: 'anoitecer', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 } },
  { nome: 'estilo-ps1', formato: 'post', ps1: true, cena: { clima: 'anoitecer', cam: [-104.2, 15, 58.5], alvo: [-42.8, 13, 40.4], fov: 50 } },
  { nome: 'ps1-praca', formato: 'post', ps1: true, cena: { clima: 'noite', cam: [-164.8, 3, 57.4], alvo: [-180.8, 1.2, 70.4], fov: 55 } },
  {
    // celular deitado: o jogo com os controles de toque, na rua da praça
    nome: 'celular', formato: 'celular', ui: true, espera: 2500, js: (C, T) => {
      C.cena({ clima: 'tarde', cam: [-190, 3.4, 52], alvo: [-176, 1.4, 70] });
      C.armado();
      T.teleport(-186, 58, 0.6);
      T.input.lastDevice = 'touch';
      T.setState('play');
      T.setYawPitch(0.6 + Math.PI, 0.12, 4.6);
      C.interface();
    },
  },
];

// tamanho da página (CSS) e escala de cada formato
export const FORMATOS = {
  post: { w: 1080, h: 1350, dpr: 2 },
  story: { w: 1080, h: 1920, dpr: 1.5 },
  tela: { w: 1440, h: 1080, dpr: 1.5 },
  celular: { w: 844, h: 390, dpr: 3, celular: true },
};
