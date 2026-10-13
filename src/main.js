import * as THREE from 'three';
import { settings, saveSettings, START } from './config.js';
import { Renderer } from './engine/renderer.js';
import { loadTextures, setTextureQuality, setAnisotropy } from './engine/textures.js';
import { makeMaterials, M } from './engine/materials.js';
import { G, setMaterialStyle } from './engine/ps1material.js';
import { Input } from './engine/input.js';
import { fullscreen } from './engine/touch.js';
import { Audio } from './engine/audio.js';
import { buildWorld } from './world/world.js';
import { applyAtmosphere } from './world/sky.js';
import { Atmosphere } from './world/atmosphere.js';
import { Interiors } from './world/interiors.js';
import { Character } from './game/character.js';
import { Player } from './game/player.js';
import { ThirdPersonCamera } from './game/camera.js';
import { Menu } from './ui/menu.js';
import { TouchMenu } from './ui/touchMenu.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Inventory } from './game/items.js';
import { Pistol } from './game/weapon.js';
import { Effects } from './game/effects.js';
import { Combat } from './game/combat.js';
import { Targets } from './world/targets.js';
import { InventoryScreen } from './ui/inventory.js';
import { NPCs } from './game/npcs.js';
import { Mission } from './game/mission.js';
import { Campaign, loadCreatureTypes, loadInteriors } from './game/campaign.js';
import { CHAPTERS } from './game/chapters/index.js';
import { loadFonts, drawText, FONT_TITLE } from './ui/overlay.js';

const params = new URLSearchParams(location.search);
// estilo visual: 3D limpo (padrão) ou PS1 retrô; ?visual=ps1 força pela URL
if (params.get('visual')) settings.visual = params.get('visual') === 'ps1' ? 'ps1' : 'clean';
const visualMode = s => (s.visual === 'ps1' ? 'ps1' : 'clean');
setMaterialStyle(visualMode(settings));
const app = document.getElementById('app');
const R = new Renderer(app);
R.configure(settings);
const input = new Input(R.canvas);
const audio = new Audio();
audio.setVolume((settings.volume / 10) * 0.8);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.25, 2600);
const hud = new Hud();

// sol de fim de tarde vindo do noroeste (hemisfério sul)
G.uSunDir.value.set(-0.62, 0.4, -0.68).normalize();

let ctx, character, player, tpc, menu, minimap, touchMenu;
let inventory, pistol, effects, targets, invScreen, combat;
let npcs, mission, atmo, interiors, campaign;
let endingT = 0;
let state = 'loading';
let time = 0, stateT = 0, fade = 1, fadeTarget = 0, onFaded = null;
let introPath = null;

// Primeiro toque/tecla: libera o áudio (o iOS exige que seja dentro do evento).
// No celular, sair da tela "toque para começar" também entra em tela cheia.
let autoFullscreen = false;
input.onGesture = kind => {
  audio.start();
  if (kind === 'touch' && !autoFullscreen && state === 'title' && menu?.screen === 'press') {
    autoFullscreen = true;
    fullscreen.enter();
  }
};

// mantém a tela do celular acesa durante o jogo (útil jogando com controle)
let wakeLock = null;
function keepAwake() {
  if (!navigator.wakeLock || wakeLock || document.visibilityState !== 'visible') return;
  navigator.wakeLock.request('screen').then(l => {
    wakeLock = l;
    l.addEventListener('release', () => { wakeLock = null; });
  }).catch(() => {});
}

function pauseGame() { menu.open('pause'); setState('pause'); input.unlock(); }

// menus com botões grandes enquanto o último aparelho usado for o toque
const touchUI = () => input.lastDevice === 'touch';
// celular em pé (imagem em cima, área livre embaixo)
const invPanel = () => touchUI() && !!input.touch.L?.portrait;

// jogando: salva o status ao sair da aba ou fechar a página
const inGame = () => ['play', 'pause', 'inventory', 'read', 'cutscene', 'talk'].includes(state);
addEventListener('pagehide', () => { if (inGame()) campaign?.autosave('saiu', true); });

// trocou de aplicativo ou de aba: pausa, salva e silencia
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (inGame()) campaign?.autosave('saiu', true);
    if (state === 'play') pauseGame();
    audio.suspend();
  } else {
    audio.resume();
    if (state !== 'title' && state !== 'loading') keepAwake();
  }
});

function applySettings(s, key) {
  if (key === 'visual') {
    setMaterialStyle(visualMode(s));
    setTextureQuality(visualMode(s));
  }
  R.configure(s);
  if (atmo) atmo.setDrawDistance(s.drawDistance); else applyAtmosphere(s.drawDistance);
  audio.setVolume((s.volume / 10) * 0.8);
}

// ---------- carregamento ----------
let loadP = 0, loadLabel = 'texturas';
function drawLoading() {
  const g = R.uictx, W = R.W, H = R.H, k = H / 240;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  drawText(g, 'Teewald', W / 2, H / 2 - 52 * k, 34 * k, { align: 'center', font: FONT_TITLE, color: '#9a8a6a', shadow: null });
  drawText(g, 'CARREGANDO  ' + loadLabel.toUpperCase(), W / 2, H / 2 + 6 * k, 12 * k, { align: 'center', color: '#c8b898' });
  const bw = 160 * k, bh = 5 * k, x = W / 2 - bw / 2, y = H / 2 + 24 * k;
  g.strokeStyle = '#6b5a40'; g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(bw), Math.round(bh));
  g.fillStyle = '#c8a060'; g.fillRect(Math.round(x) + 2, Math.round(y) + 2, Math.round((bw - 3) * loadP), Math.round(bh - 3));
  // tela preta no 3D
  R.gl.setRenderTarget(null); R.gl.clear();
}

async function boot() {
  drawLoading();
  await loadFonts();
  drawLoading();
  setAnisotropy(R.gl.capabilities.getMaxAnisotropy());
  await loadTextures(p => { loadP = p * 0.25; drawLoading(); }, visualMode(settings));
  makeMaterials();
  applyAtmosphere(settings.drawDistance);
  ctx = await buildWorld(scene, (f, t) => { loadP = 0.25 + f * 0.75; loadLabel = t; drawLoading(); });
  minimap = new Minimap(ctx);
  character = new Character(M);
  scene.add(character.root, character.blob);
  player = new Player(ctx, character, audio);
  tpc = new ThirdPersonCamera(camera, ctx);
  // inventário (já com a pistola carregada e uma caixa de munição), arma e alvos
  effects = new Effects(scene);
  // hora do dia, clima e luzes dinâmicas
  atmo = new Atmosphere({ scene, sky: ctx.sky, audio, ctx });
  atmo.setDrawDistance(settings.drawDistance);
  atmo.effects = effects;
  inventory = new Inventory(16);
  targets = new Targets(scene, ctx, M, { effects, audio, inventory, hud });
  // combate: vida, soco, armas brancas, arremesso, explosões, itens no chão e criaturas
  combat = new Combat({ ctx, scene, audio, player, character, tpc, camera, inventory, effects, hud, input, atmo, M, targets, R });
  interiors = new Interiors({ ctx, scene, atmo, player, tpc, hud });
  pistol = new Pistol({ ctx, character, player, tpc, camera, inventory, effects, targets, audio, hud, input, M, atmo, combat });
  combat.guns = pistol;
  invScreen = new InventoryScreen(R, input, audio, inventory, pistol, M, combat);
  // moradores com falas (F / A / toque em FALAR para conversar)
  npcs = new NPCs({ ctx, scene, M, audio, player, tpc, camera, pistol, R });
  // missão 1: o chupacabras (cartaz, galinheiro, pegadas, luta na clareira)
  mission = new Mission({ ctx, scene, audio, input, player, character, tpc, camera, inventory, pistol, targets, effects, hud, R, npcs, combat, atmo });
  // campanha: capítulo 1 = a missão acima; do 2 ao 10, a noite que não termina
  await loadCreatureTypes();
  await loadInteriors(interiors);
  campaign = new Campaign({ ctx, scene, audio, input, player, character, tpc, camera, inventory, pistol, targets, effects, hud, R, npcs, combat, atmo, interiors, mission,
    fadeTo: (cb, speed = 1.6) => fadeTo(() => { cb(); fadeTarget = 0; fadeSpeed = 1.2; }, speed) });
  campaign.onEnding = () => { setState('ending'); endingT = 0; atmo.set('amanhecer', 0); fadeTarget = 0; };
  menu = new Menu(input, audio, settings, applySettings);
  menu.campaign = campaign; menu.chapterTitles = CHAPTERS.map(c => c?.title);
  // no toque, as mesmas telas com botões grandes na tela inteira
  touchMenu = new TouchMenu(menu, input, audio);
  setupStart();
  exposeDebug();
  if (params.get('chapter')) { startGame({ chapter: +params.get('chapter') }); fade = 0; }
  else if (params.get('skip') === '1') { startGame({ intro: false }); fade = 0; }
  else { setState('title'); atmo.set(titleWeather(), 0); fade = 1; fadeTarget = 0; }
  last = performance.now();
  requestAnimationFrame(loop);
}

// ponto de partida: caminhando pelo calçadão rumo à praça
function setupStart() {
  const path = ctx.landmarks.calcadao.path;
  const i0 = Math.floor(path.length * 0.72);
  const seg = path.slice(Math.max(0, i0 - 26), i0 + 1).reverse();
  introPath = seg;
  const [x, z] = seg[0], [x1, z1] = seg[2];
  START.x = x; START.z = z; START.heading = Math.atan2(x1 - x, z1 - z);
}

function setState(s) { state = s; stateT = 0; }

// a tela título acompanha o progresso: depois da primeira noite, ela também é de noite
const titleWeather = () => ((campaign?.save?.unlocked || 1) > 1 ? 'noite' : 'tarde');

// o: { chapter (1..10), intro (abertura do capítulo 1), fromSave (inventário salvo) }
function startGame(o = {}) {
  const n = Math.max(1, Math.min(10, o.chapter || 1));
  hud.place = null; hud.card = null;
  audio.setAmbience(true);
  keepAwake();
  if (n > 1) {
    campaign.startChapter(n, { fromSave: o.fromSave });
    player.auto = null;
    setState('play');
    hud.showHints();
    return;
  }
  const r1 = campaign.startChapter(1, { fromSave: o.fromSave });
  // retomando o capítulo 1 salvo: sem a abertura
  const withIntro = o.intro !== false && !r1.resume;
  player.place(START.x, START.z, START.heading);
  tpc.snap(player);
  hud.place = null; hud.card = null;
  if (withIntro) {
    player.auto = { path: introPath, i: 1 };
    setState('intro');
    R.bars = 0.12;
  } else {
    player.auto = null;
    setState('play');
    hud.showHints();
    campaign.begin();
  }
}

function fadeTo(cb, speed = 1.6) { fadeTarget = 1; onFaded = cb; fadeSpeed = speed; }
let fadeSpeed = 1.6;

// ---------- laço principal ----------
let last = 0, acc = 0;
const aimDirV = new THREE.Vector3();
// simulação rápida para testes (sem desenhar): __teewald.simulate(segundos)
let noRender = false;
function loop(now) {
  requestAnimationFrame(loop);
  frame(now);
}

function frame(now) {
  // o carimbo do quadro pode vir antes do último (primeiro quadro, aba voltando): nunca negativo
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = Math.max(last, now);
  // 30 FPS quando escolhido; no celular, telas de 90/120 Hz ficam em 60 (bateria e calor)
  const cap = settings.fps === 30 ? 30 : input.touchPrimary ? 60 : 0;
  if (cap) { acc += dt; if (acc < 1 / cap - 0.002) return; dt = Math.min(0.1, acc); acc = 0; }
  input.poll();
  time += dt; stateT += dt;
  G.uTime.value = time;
  if (input.hit('F3')) hud.showFps = !hud.showFps;
  if (input.toggleMap() && (state === 'play' || state === 'pause')) { settings.minimap = !settings.minimap; saveSettings(); }
  if (input.padJoined && state === 'play') hud.toast('CONTROLE CONECTADO');

  // fade
  if (fade !== fadeTarget) {
    fade += Math.sign(fadeTarget - fade) * Math.min(Math.abs(fadeTarget - fade), dt * fadeSpeed);
    if (fade === fadeTarget && onFaded) { const cb = onFaded; onFaded = null; cb(); }
  }
  R.fade = fade;

  const mouseInt = R.toInternal(input.mouse.x, input.mouse.y);
  if (state === 'title') {
    titleCamera(dt);
    const act = touchUI() ? touchMenu.update(dt) : menu.update(dt, mouseInt);
    if (act === 'newgame' && !onFaded) fadeTo(() => { startGame({ chapter: 1, intro: true }); fadeTarget = 0; fadeSpeed = 0.5; });
    if (act === 'erase') { campaign.eraseSave(); menu.open('main'); audio.menuBack(); }
    if (act === 'continue' && !onFaded) fadeTo(() => { startGame({ chapter: campaign.save.chapter || 1, fromSave: true }); fadeTarget = 0; fadeSpeed = 0.6; });
    if (typeof act === 'string' && act.startsWith('chapter:') && !onFaded) { const n = +act.slice(8); fadeTo(() => { startGame({ chapter: n, intro: n === 1 }); fadeTarget = 0; fadeSpeed = 0.6; }); }
  } else if (state === 'intro') {
    playIntro(dt);
  } else if (state === 'play') {
    if (input.pause()) pauseGame();
    else if (input.inventory()) { invScreen.open(); setState('inventory'); input.unlock(); }
    else if (npcs.talkHit(input)) { npcs.startTalk(); setState('talk'); }
    else if (campaign.interactHit(input)) { campaign.startRead(); setState('read'); }
    else {
      combat.pickHit(input);
      if (input.mouse.clicked && !input.locked && input.lastDevice === 'keyboard') input.lock();
      pistol.pre(dt, input);
      combat.pre(dt, input);
      const r = player.update(dt, tpc.yaw, input);
      pistol.post(dt);
      combat.post(dt);
      npcs.pushPlayer();
      combat.afterPlayer(dt);
      campaign.afterPlayer(dt);
      tpc.update(dt, player, input, settings, r.moving);
      R.bars = npcs.applyCamera(dt) * 0.1;
      combat.afterCamera();
      campaign.afterCamera();
    }
  } else if (state === 'talk') {
    // conversa: o jogador para e vira para o morador; câmera de lado e tarjas
    const done = npcs.updateTalk(dt, input) === 'close';
    player.update(dt, tpc.yaw, null);
    tpc.update(dt, player, null, settings, false);
    R.bars = npcs.applyCamera(dt) * 0.1;
    if (done) setState('play');
  } else if (state === 'read') {
    // lendo o cartaz / examinando o galinheiro
    const done = campaign.updateRead(dt, input) === 'close';
    player.update(dt, tpc.yaw, null);
    tpc.update(dt, player, null, settings, false);
    if (done) setState('play');
  } else if (state === 'cutscene' || state === 'dying') {
    // encontro com o chupacabras (a missão move a câmera) ou jogador caído
    player.update(dt, tpc.yaw, null);
    if (state === 'dying') { tpc.update(dt, player, null, settings, false); combat.afterCamera(); }
  } else if (state === 'inventory') {
    // em pé no celular, as ações do item viram botões grandes na parte de baixo
    const panelClose = invPanel() && touchMenu.updateInventory(invScreen) === 'close';
    if (panelClose || invScreen.update(dt, mouseInt) === 'close') { invScreen.close(); setState('play'); }
  } else if (state === 'pause') {
    // START (ou P) de novo retoma o jogo, qualquer que seja o item marcado
    const resume = menu.screen === 'pause' && (input.padHit('start') || input.hit('KeyP'));
    const act = resume ? 'resume' : touchUI() ? touchMenu.update(dt) : menu.update(dt, mouseInt);
    if (act === 'resume') { setState('play'); }
    if (act === 'quit') campaign.autosave('menu', true);
    if (act === 'quit') fadeTo(() => { if (ctx.indoor) interiors.exit(); menu.open('main'); setState('title'); audio.setAmbience(false); atmo.set(titleWeather(), 0); fadeTarget = 0; fadeSpeed = 1.2; });
  } else if (state === 'ending') {
    endingT += dt;
    titleCamera(dt);
    if (endingT > 3 && !onFaded && (input.confirm() || input.pause() || input.mouse.clicked || endingT > 75)) fadeTo(() => { menu.open('main'); setState('title'); audio.setAmbience(false); atmo.set(titleWeather(), 0); fadeTarget = 0; fadeSpeed = 1.2; });
  }

  // mundo
  const focus = state === 'title' || state === 'ending' ? camera.position : player.pos;
  if (state !== 'title' && state !== 'ending') {
    hud.setPlace(state === 'intro' ? hud.place : ctx.placeName(player.pos.x, player.pos.z), dt);
    if (state === 'play') hud.setStreet(ctx.streetName(player.pos.x, player.pos.z), dt);
    if (ctx.indoor) hud.street = null;
    const rv = ctx.rivers.index.nearest(player.pos.x, player.pos.z);
    // música de tensão: criaturas por perto e chefe
    const boss = combat.boss && !combat.boss.dead ? 1 : 0;
    audio.setTension(state === 'play' || state === 'dying' ? (combat.inFight ? 1 : 0) : 0, boss);
    audio.update(dt, time, rv.seg ? rv.d : 999);
  } else audio.update(dt, time, 999);
  ctx.leaves.mesh.visible = !ctx.indoor;
  if (!ctx.indoor) ctx.leaves.update(dt, focus, time);
  interiors.update(dt);
  if (state !== 'inventory' && state !== 'pause') {
    targets.update(dt, player, state === 'play');
    combat.update(dt, state);
    pistol.lights(dt);
    npcs.update(dt, state);
    const ev = state === 'ending' ? null : campaign.update(dt, state);
    if (ev === 'cutscene' || ev === 'read' || ev === 'play') setState(ev);
    else if (ev === 'dead') {
      setState('dying');
      fadeTo(() => { campaign.respawn(); setState('play'); fadeTarget = 0; fadeSpeed = 1.2; }, 0.45);
    }
    effects.update(dt, camera, ctx.groundAt);
  }
  atmo.update(dt, camera, state === 'title' ? null : player, pistol.aim > 0.5 ? camera.getWorldDirection(aimDirV) : null);
  ctx.sky.update(camera);
  hud.update(dt);
  character.root.visible = character.blob.visible = state !== 'title' && state !== 'ending';

  if (noRender) { input.endFrame(); return; }
  R.render(scene, camera);
  drawUI();
  // controles de toque só no jogo; nos menus e na abertura um toque vale um clique
  input.touch.setMode(state === 'play' ? 'play' : 'menu');
  input.touch.weapon = pistol.equipped;
  const menuOnTouch = touchUI() && (state === 'title' || state === 'pause');
  input.touch.draw(R, state === 'play' && input.lastDevice === 'touch', input.touchPrimary,
    menuOnTouch ? (g, v) => touchMenu.draw(g, v)
      : state === 'inventory' && invPanel() ? (g, v) => touchMenu.drawInventory(g, v, invScreen) : null);
  input.endFrame();
}

// câmera da tela título: passeia lentamente diante da fachada da igreja
let titleT = 0;
function titleCamera(dt) {
  const c = ctx.landmarks.church;
  titleT += dt;
  const a = c.rot + 0.35 + Math.sin(titleT * 0.045) * 0.55;
  const r = 64;
  const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
  camera.position.set(x, Math.max(ctx.terrain.heightAt(x, z) + 6, c.y + 15 + Math.sin(titleT * 0.08) * 3), z);
  camera.lookAt(c.x, c.y + 13, c.z);
}

function playIntro(dt) {
  const T = stateT, dur = 8.5;
  const skip = T > 1.2 && (Math.hypot(input.move().x, input.move().y) > 0.3 || input.confirm() || input.mouse.clicked || input.pause());
  player.update(dt, tpc.yaw, null);
  // câmera: começa de frente para o personagem e gira até ficar atrás
  const e = Math.min(1, T / (dur - 1.5)), ease = e * e * (3 - 2 * e);
  tpc.yaw = player.heading + 0.5 + (Math.PI - 0.5) * ease;
  tpc.pitch = 0.08 + 0.24 * ease;
  tpc.dist = 3.6 + 1.0 * ease;
  tpc.update(dt, player, null, settings, false);
  R.bars = 0.12 * (T < dur - 0.8 ? 1 : Math.max(0, (dur - T) / 0.8));
  if (T > dur || skip) {
    R.bars = 0;
    player.auto = null;
    tpc.dist = 4.6;
    setState('play');
    hud.showHints();
    campaign.begin();
  }
}

function drawUI() {
  const g = R.uictx, W = R.W, H = R.H;
  g.clearRect(0, 0, W, H);
  if (state === 'title' || state === 'pause') {
    // no toque o menu é desenhado na camada de toque (input.touch.draw)
    if (!touchUI()) menu.draw(g, W, H);
  } else if (state === 'inventory') {
    invScreen.draw(g, W, H);
  } else if (state === 'intro') {
    hud.drawIntro(g, W, H, stateT);
  } else if (state === 'talk') {
    npcs.drawTalk(g, W, H, input.lastDevice);
  } else if (state === 'read') {
    campaign.drawRead(g, W, H, input.lastDevice);
  } else if (state === 'cutscene') {
    campaign.drawCutscene(g, W, H);
  } else if (state === 'dying') {
    campaign.drawDying(g, W, H);
  } else if (state === 'ending') {
    drawEnding(g, W, H);
  } else if (state === 'play') {
    const showMap = settings.minimap !== false && !ctx.indoor;
    const device = input.lastDevice, touch = device === 'touch';
    // no toque o minimapa vai para o alto, longe dos polegares
    npcs.drawHud(g, W, H, device);
    if (showMap) minimap.draw(g, W, H, player, tpc.yaw, touch, campaign.marker);
    pistol.drawHud(g, W, H, device);
    combat.drawHud(g, W, H, device);
    hud.draw(g, W, H, {
      device,
      lockHint: !input.locked && device === 'keyboard' && stateT > 1,
      stats: hud.showFps ? `${ctx.stats.triangles} tri` : '',
      rightPad: showMap && !touch ? 96 * (H / 240) : 0,
    });
    campaign.drawHud(g, W, H, device);
  }
}

// créditos do fim: amanhecer sobre a igreja e o texto subindo
const ENDING = [
  ['Teewald', 'title'], ['', ''],
  ['O sol nasceu atrás do morro às 6h12.', ''], ['Os galos cantaram pela primeira vez em muitos dias.', ''], ['', ''],
  ['O chupacabras foi levado numa jaula para a universidade, em Porto Alegre.', 'dim'],
  ['O Rudi carteiro voltou a entregar as cartas. Nunca mais saiu em noite de lua cheia.', 'dim'],
  ['Na fábrica, o relógio de ponto marca 23h47. Ninguém teve coragem de mexer.', 'dim'],
  ['A cruz de ferro voltou para cima de uma pedra no mato, presa com cimento.', 'dim'],
  ['E a Marlene publicou a reportagem. Ninguém acreditou.', 'dim'], ['', ''],
  ['FIM', 'title2'], ['', ''],
  ['Uma história de Santa Maria do Herval - RS', ''], ['', ''],
  ['Ruas, rio e lugares: © OpenStreetMap (ODbL)', 'dim'], ['Prédios: Microsoft Building Footprints (ODbL)', 'dim'], ['Relevo: SRTM 30m (NASA)', 'dim'], ['', ''],
  ['Criado por Fabiano Kunst', 'name'],
];
function drawEnding(g, W, H) {
  const k = H / 240, t = endingT;
  g.globalAlpha = 0.45; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  const y0 = H + 10 * k - t * 14 * k;
  ENDING.forEach(([line, st], i) => {
    const y = y0 + i * 16 * k;
    if (!line || y < -40 * k || y > H + 20 * k) return;
    if (st === 'title' || st === 'title2') drawText(g, line, W / 2, y, (st === 'title' ? 34 : 26) * k, { align: 'center', font: FONT_TITLE, color: '#efe2c4', shadow: '#4a0d08' });
    else drawText(g, line, W / 2, y, (st === 'name' ? 14 : 11) * k, { align: 'center', color: st === 'dim' ? '#d8c8a8' : '#f2e6c8' });
  });
  if (t > 3) drawText(g, input.lastDevice === 'pad' ? 'A  menu' : input.lastDevice === 'touch' ? 'toque para voltar' : 'ENTER  menu', W - 8 * k, H - 14 * k, 10 * k, { align: 'right', color: '#a89878' });
}

function exposeDebug() {
  window.__teewald = {
    ctx, player, camera, tpc, settings, atmo, combat, interiors, audio, character, scene, renderer: R, G, input, menu, touchMenu, inventory, pistol, targets, effects, invScreen, npcs, mission,
    get state() { return state; },
    setState: s => setState(s),
    startGame: (intro = false) => { startGame({ intro }); fade = 0; fadeTarget = 0; },
    chapter: (n) => { startGame({ chapter: n }); fade = 0; fadeTarget = 0; },
    campaign,
    simulate: (secs, step = 1 / 30) => { noRender = true; try { for (let t = 0; t < secs; t += step) { last -= step * 1000; frame(performance.now()); } } finally { noRender = false; } return state; },
    teleport: (x, z, heading = 0) => { player.place(x, z, heading); tpc.snap(player); },
    view: (x, y, z, lx, ly, lz, fogFar) => {
      state = 'debug'; camera.position.set(x, y, z); camera.lookAt(lx, ly, lz);
      if (fogFar) { G.uFogFar.value = fogFar; G.uFogNear.value = fogFar * 0.5; }
    },
    setYawPitch: (yaw, pitch, dist) => { tpc.yaw = yaw; tpc.pitch = pitch; if (dist) tpc.dist = dist; tpc.snap(player); tpc.yaw = yaw; tpc.pitch = pitch; tpc._place(1); },
  };
}

boot().catch(err => {
  console.error(err);
  const g = R.uictx;
  g.fillStyle = '#000'; g.fillRect(0, 0, R.W, R.H);
  g.fillStyle = '#f66'; g.font = '10px monospace';
  String(err.stack || err).split('\n').slice(0, 12).forEach((l, i) => g.fillText(l.slice(0, 90), 4, 12 + i * 11));
});
