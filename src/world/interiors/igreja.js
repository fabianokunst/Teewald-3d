import * as THREE from 'three';
import { M } from '../../engine/materials.js';
import { ps1Material } from '../../engine/ps1material.js';
import { makeCanvas } from '../../engine/textures.js';
import { sampler, paint, finish, mul, tint } from '../../engine/archTextures.js';
import { FONT_UI } from '../../ui/overlay.js';
import { rng } from '../geo.js';
import { CHURCH, SACRISTY_DOOR_Z } from '../church.js';
import { makeKit, part, hash, softTex, glowMat, lightK, poolTex, UV1 } from './factory.js';
import { makeMats as cryptMats, chandelier, candleCluster, flame } from './crypt.js';

// Igreja Matriz por dentro (neogótica, 1910): vestíbulo sob a torre, nave com bancos
// e duas fileiras de colunas, abóbada ogival azul com estrelas douradas, coro com
// órgão sobre a entrada, presbitério elevado com mesa de comunhão, abside com o
// retábulo de Nossa Senhora Auxiliadora, sacristia e depósito dos lados do altar e,
// pela escada do coro, a torre com o sino. Vitrais acesos pela luz de fora (de dia,
// dourados com feixes de luz; de noite, quase apagados).
//
// Planta (metros locais, origem no meio da parede da fachada, por dentro): +z vai da
// porta ao altar; olhando para o altar, a direita é -x. Nave x -8,6..8,6, z 0..33,2;
// torre x -2,7..2,7, z 0..3,8; coro (y 4,4) z 0..6; presbitério e salas (y 0,54)
// z 26,6..33,2; abside raio 4,3 a partir de z 33,2. Sacristia à direita (x < -4,3),
// depósito à esquerda (x > 4,3). Torre: patamar 7,4 e piso do sino 10,4.

const HW = 8.6, NAVE_Z = 33.2, PRES_Z = 26.6, PRES_Y = 0.54;
const VW = 4.3, VS = 8, VH = 5.2;                 // abóbada: meia largura, nascença, flecha
const VC = (VH * VH - VW * VW) / (2 * VW), VR = VW + VC;
const CORO_Y = 4.4, CORO_Z = 6, TW = 2.7, TD = 3.8;
const LAND_Y = 7.4, BELL_Y = 10.4, TOWER_TOP = 16.4;
const APSE_R = 4.3, APSE_H = 7.8, APSE_N = 5;
const COLS_Z = [6, 10, 14, 18, 22];
// no escuro só fica o luar (torre e janela do depósito)
const DARK_LIGHTS = new Set(['torre', 'deposito']);
const WIN_Z = [9.6, 15.2, 20.8];
// porta da sacristia para fora (parede x = -8,6), no mesmo lugar da porta de fora da igreja
const SAC_DOOR = [CHURCH.L / 2 - SACRISTY_DOOR_Z - 0.55, CHURCH.L / 2 - SACRISTY_DOOR_Z + 0.55];
const SAC_IN = [27.4, 28.5];              // porta da sacristia para o presbitério (x = -4,3)
// imagens cobertas do depósito: [x a partir do meio do depósito, z, altura]
export const SHEETS = [[1.2, 32.4, 1.7], [0.1, 32.6, 1.4], [-1.3, 32.3, 1.9]];

// vulto de uma imagem coberta com lençol (base na origem), para o depósito e para o capítulo 9
export function sheetFigure(k, h) {
  const sh = gray(0.62);
  k.prism('int:i:sheet', [0, 0, 0], [0, h * 0.62, 0], 0.42, 0.25, 9, sh, false);
  k.prism('int:i:sheet', [0, h * 0.62, 0], [0, h * 0.74, 0], 0.25, 0.31, 9, sh, false);
  k.prism('int:i:sheet', [0, h * 0.74, 0], [0, h * 0.8, 0], 0.31, 0.13, 9, sh, false);
  k.prism('int:i:sheet', [0, h * 0.8, 0.02], [0, h * 0.95, 0], 0.16, 0.15, 8, sh, false);
  k.prism('int:i:sheet', [0, h * 0.95, 0], [0, h, 0], 0.15, 0.03, 8, sh, true);
}

// altura da abóbada ogival (dois arcos) na posição x
export const vaultY = x => {
  const a = Math.abs(x);
  return a >= VW ? VS : VS + Math.sqrt(Math.max(0, VR * VR - (a + VC) * (a + VC)));
};

const gray = k => [k, k, k];
const CREAM = [1.0, 0.95, 0.86], PINK = [1.0, 0.8, 0.72];

// ---------------------------------------------------------------------------
// texturas desenhadas (a pedra, o reboco e a madeira vêm da pasta)
// ---------------------------------------------------------------------------
function inArch(px, py, xl, xr, ys, i = 0) {
  const w = xr - xl;
  if (px < xl + i || px > xr - i) return false;
  if (py >= ys) return true;
  return Math.hypot(px - xr, py - ys) <= w - i && Math.hypot(px - xl, py - ys) <= w - i;
}

function makeMats() {
  if (M['int:i:tiles']) return;
  cryptMats();
  const granite = sampler('granite'), plaster = sampler('plChurch'), wood = sampler('woodDark'), marble = sampler('marble');
  // ladrilho hidráulico: quadrados com borda vermelha e losango, alternando as cores
  M['int:i:tiles'] = ps1Material({
    map: finish(paint(64, 64, (x, y) => {
      const tx = x % 16, ty = y % 16, alt = (Math.floor(x / 16) + Math.floor(y / 16)) % 2;
      const k = 0.82 + granite(x, y)[0] / 900;
      if (tx === 0 || ty === 0) return mul([70, 60, 52], k);
      const d = Math.abs(tx - 8) + Math.abs(ty - 8);
      const base = alt ? [196, 182, 150] : [128, 52, 38], line = alt ? [128, 52, 38] : [196, 182, 150];
      let c = base;
      if (tx <= 1 || ty <= 1 || tx >= 15 || ty >= 15) c = alt ? [52, 46, 42] : [160, 132, 86];
      else if (d < 3) c = [176, 140, 70];
      else if (d < 5) c = line;
      else if (d === 7 && (tx === 8 || ty === 8)) c = line;
      return mul(c, k);
    })),
  });
  // céu pintado: azul profundo com estrelas douradas
  M['int:i:sky'] = ps1Material({
    map: finish(paint(64, 64, (x, y) => {
      const p = plaster(x, y)[0] / 255;
      let c = mul([34, 46, 96], 0.8 + p * 0.3);
      for (let i = 0; i < 7; i++) {
        const sx = Math.floor(hash(i, 3) * 60) + 2, sy = Math.floor(hash(i, 5) * 60) + 2;
        const dx = Math.abs(x - sx), dy = Math.abs(y - sy);
        if ((dx === 0 && dy <= 2) || (dy === 0 && dx <= 2)) c = dx + dy === 0 ? [236, 206, 120] : [196, 160, 80];
        else if (dx === 1 && dy === 1) c = [120, 104, 70];
      }
      return c;
    })),
  });
  // vitral visto de dentro: duas lancetas com figuras e um óculo, chumbo escuro
  const PAL = [[60, 90, 170], [40, 64, 140], [170, 40, 40], [210, 170, 70], [60, 130, 80], [130, 70, 150]];
  const pane = (x, y, zone) => {
    if ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0) return [24, 20, 22];
    const a = Math.floor((x + y) / 6), b = Math.floor((x - y + 600) / 6);
    const h = ((a * 374761393 + b * 668265263 + zone * 977) ^ (a * b * 1274126177)) >>> 0;
    return PAL[(h >>> 7) % PAL.length];
  };
  const vitral = (w, h, sideK) => paint(w, h, (x, y) => {
    const px = x + 0.5, py = y + 0.5, ys = w;
    if (!inArch(px, py, 0, w, ys - 2)) return null;
    // moldura de pedra (fica fora da luz: desenhada escura)
    if (!inArch(px, py, 0, w, ys - 2, 2) || y > h - 3) return [48, 40, 36];
    const lancet = inArch(px, py, 3, w / 2 - 1, ys + 8) ? 1 : inArch(px, py, w / 2 + 1, w - 3, ys + 8) ? 2 : 0;
    const oc = Math.hypot(px - w / 2, py - (ys - 6)) < w * 0.17;
    if (oc) return Math.hypot(px - w / 2, py - (ys - 6)) < w * 0.07 ? [230, 190, 90] : pane(x, y, 9);
    if (!lancet) return [40, 34, 32];
    // figura de santo no meio de cada lanceta: manto, rosto e auréola
    const cx = lancet === 1 ? w / 4 : (3 * w) / 4, fy = y - (ys + 14);
    const rel = (px - cx) / (w / 4 - 2);
    if (fy > 8 && fy < h - ys - 26 && Math.abs(rel) < 0.55 + (fy - 8) * 0.01) return mul(lancet === 1 ? [150, 36, 40] : [44, 70, 150], sideK * (Math.abs(rel) > 0.4 ? 0.8 : 1));
    if (fy > 2 && fy <= 8 && Math.abs(rel) < 0.3) return [222, 184, 150];
    if (fy > -3 && fy <= 3 && Math.abs(rel) < 0.55 && Math.hypot(px - cx, fy - 3) > 2.6) return [226, 186, 84];
    if (y > h - 14) return pane(x, y, lancet + 4);
    return mul(pane(x, y, lancet), 0.85);
  });
  M['int:i:vitral'] = ps1Material({ map: finish(vitral(32, 96, 1), true), lit: false, cutout: true, affine: false, color: new THREE.Color(1, 1, 1) });
  // tapete vermelho com barra dourada
  M['int:i:carpet'] = ps1Material({
    map: finish(paint(32, 32, (x, y) => {
      if (x < 2 || x > 29) return [70, 24, 22];
      if (x === 3 || x === 28) return [176, 140, 70];
      const k = 0.85 + hash(x, y) * 0.15;
      return mul((x + y) % 8 === 0 ? [120, 34, 30] : [104, 28, 26], k);
    })),
  });
  // via-sacra: catorze quadros (atlas 4 x 4) com moldura, cena em relevo e o número
  {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
    for (let i = 0; i < 16; i++) {
      const ox = (i % 4) * 32, oy = Math.floor(i / 4) * 32;
      g.fillStyle = '#3a2618'; g.fillRect(ox, oy, 32, 32);
      g.fillStyle = '#8a6a3a'; g.fillRect(ox + 1, oy + 1, 30, 30);
      g.fillStyle = '#d8ccb0'; g.fillRect(ox + 3, oy + 3, 26, 21);
      g.fillStyle = '#a89878';
      // cruz e figuras em relevo (cada quadro um pouco diferente)
      const cx = ox + 8 + (hash(i, 2) * 14 | 0);
      g.fillRect(cx, oy + 6, 2, 15); g.fillRect(cx - 4, oy + 9, 10, 2);
      for (let f = 0; f < 3; f++) { const fx = ox + 5 + (hash(i, f) * 20 | 0); g.fillRect(fx, oy + 13, 3, 8); g.fillRect(fx, oy + 11, 3, 2); }
      g.fillStyle = '#2a1a10'; g.font = 'bold 8px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (i < 14) g.fillText(ROMAN[i], ox + 16, oy + 27);
    }
    M['int:i:via'] = ps1Material({ map: finish(c), affine: false });
  }
  // quadro dos cantos (hinário)
  {
    const c = makeCanvas(32, 48), g = c.getContext('2d');
    g.fillStyle = '#2c1c12'; g.fillRect(0, 0, 32, 48);
    g.fillStyle = '#1a120c'; g.fillRect(2, 2, 28, 44);
    g.fillStyle = '#e8e0cc'; g.font = 'bold 9px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['127', '384', '22', '516'].forEach((n, i) => g.fillText(n, 16, 8 + i * 10.5));
    M['int:i:hymn'] = ps1Material({ map: finish(c), affine: false });
  }
  // mural de avisos da paróquia
  {
    const c = makeCanvas(128, 96), g = c.getContext('2d');
    g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#b08a5a'; g.fillRect(3, 3, 122, 90);
    for (let i = 0; i < 400; i++) { g.fillStyle = hash(i, 1) < 0.5 ? '#9a7448' : '#c09a6a'; g.fillRect(3 + hash(i, 2) * 120, 3 + hash(i, 3) * 88, 1, 1); }
    const note = (x, y, w, h, rot, lines, color = '#ece4d0') => {
      g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot);
      g.fillStyle = color; g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = '#b02020'; g.fillRect(-1, -h / 2 + 1, 2, 2);
      g.fillStyle = '#2a2018'; g.textAlign = 'center'; g.textBaseline = 'top';
      lines.forEach(([t, s], i) => { g.font = `${s}px ${FONT_UI}`; g.fillText(t, 0, -h / 2 + 4 + i * (s + 1)); });
      g.restore();
    };
    note(6, 6, 56, 40, -0.03, [['MISSA DE FINADOS', 9], ['2 DE NOVEMBRO', 8], ['19 HORAS', 8], ['NO CEMITÉRIO', 8]]);
    note(66, 8, 56, 36, 0.04, [['KARTOFFELFEST', 9], ['CANCELADA', 10], ['A COMISSÃO', 7]], '#f0e2b8');
    note(10, 52, 54, 38, 0.02, [['TERÇO PELAS', 8], ['ALMAS', 9], ['TODA NOITE', 8], ['20 HORAS', 8]]);
    note(68, 50, 52, 40, -0.05, [['NÃO SAIAM', 9], ['DE CASA', 9], ['DEPOIS QUE', 8], ['ESCURECER', 8]], '#e8d8d0');
    M['int:i:aviso'] = ps1Material({ map: finish(c), affine: false });
  }
  // retábulo: fundo azul com estrelas e moldura dourada
  M['int:i:retab'] = ps1Material({
    map: finish(paint(32, 64, (x, y) => {
      const edge = x < 2 || x > 29 || y < 2;
      if (edge) return mul([176, 136, 64], 0.9 + hash(x, y) * 0.2);
      if (x < 4 || x > 27 || y < 4) return [96, 70, 34];
      const star = hash(x >> 2, y >> 2) < 0.1 && x % 4 === 1 && y % 4 === 1;
      return star ? [220, 190, 110] : mul([30, 44, 92], 0.85 + wood(x, y)[0] / 900);
    }), true), affine: false,
  });
  // luz dourada dos vitrais (de dia): feixe e mancha no chão
  M['int:i:ray'] = glowMat(softTex(16, 64, (x, y) => {
    const e = Math.min(1, Math.min(x, 15 - x) / 4);
    return [255, 255, 255, (1 - y / 64) * e * 120];
  }), [0.5, 0.36, 0.2]);
  M['int:i:raypool'] = glowMat(poolTex(), [0.3, 0.22, 0.12]);
  // lamparina do Santíssimo: vidro vermelho aceso e o brilho em volta
  M['int:i:redglass'] = ps1Material({ map: null, lit: false, color: new THREE.Color(1.0, 0.16, 0.1) });
  M['int:i:redglow'] = glowMat(poolTex(), [0.55, 0.06, 0.04]);
  M['int:i:glassOff'] = ps1Material({ map: null, color: new THREE.Color(0.32, 0.08, 0.06) });
  // olhos da gata (brilham no escuro)
  M['int:i:eyes'] = ps1Material({ map: null, lit: false, color: new THREE.Color(0.75, 1.0, 0.45) });
  // lençol sobre as imagens velhas do depósito
  // (um brilho pálido bem fraco: no escuro, os vultos claros aparecem)
  M['int:i:sheet'] = ps1Material({ map: finish(paint(16, 16, (x, y) => mul([214, 208, 196], 0.85 + marble(x * 4, y * 4)[0] / 1200))), emissive: 0x2a2a2e });
}

// ---------------------------------------------------------------------------
// interior
// ---------------------------------------------------------------------------
export function build(ctx, B, o) {
  makeMats();
  const K = makeKit(ctx, B, { x: o.x + 10, y: o.y, z: o.z + 2 });
  const ox = o.x + 10, oz = o.z + 2;
  const R = rng(1910);
  const objects = new THREE.Group();
  objects.name = 'interior:igreja:pecas';
  const anim = [];
  const pt = (x, z, h = 0, y = 0) => ({ x: ox + x, y: o.y + y, z: oz + z, h });
  const plaster = { mat: 'plChurch', col: CREAM, band: 1.3, bandMat: 'woodDark', us: 2 };
  const sheets = [], sheetCols = [];
  const plasterP = { mat: 'plChurch', col: CREAM, band: PRES_Y + 1.3, bandMat: 'woodDark', us: 2 };
  const brick = { mat: 'brickOld', col: gray(0.62), us: 1.6 };

  // ---------------- luzes ----------------
  const LDEF = {
    vest: { x: 0, y: 3.6, z: 1.9, col: [1.1, 0.8, 0.48], range: 7 },
    lustre1: { x: 0, y: 8.0, z: 10, col: [1.9, 1.2, 0.62], range: 17, flicker: 0.08 },
    lustre2: { x: 0, y: 8.0, z: 16, col: [1.9, 1.2, 0.62], range: 17, flicker: 0.08 },
    lustre3: { x: 0, y: 8.0, z: 22, col: [1.9, 1.2, 0.62], range: 17, flicker: 0.08 },
    altar: { x: 0, y: 2.7, z: 35.4, col: [1.5, 0.9, 0.45], range: 9, flicker: 0.15 },
    lamparina: { x: -1.7, y: 3.0, z: 34.2, col: [1.3, 0.14, 0.07], range: 6, flicker: 0.1 },
    votivas: { x: 6.45, y: 1.3, z: 25.3, col: [1.4, 0.8, 0.38], range: 6.5, flicker: 0.3 },
    lateral: { x: -6.45, y: 1.8, z: 25.8, col: [1.2, 0.7, 0.35], range: 6, flicker: 0.25 },
    sacristia: { x: -6.45, y: 3.2, z: 29.9, col: [1.15, 0.88, 0.55], range: 7.5 },
    deposito: { x: 7.4, y: 3.2, z: 32, col: [0.22, 0.27, 0.42], range: 5 },
    coro: { x: 0, y: 6.6, z: 4.6, col: [0.9, 0.62, 0.36], range: 9, flicker: 0.12 },
    escada: { x: -2.0, y: 9.4, z: 2.4, col: [0.85, 0.62, 0.38], range: 6, flicker: 0.2 },
    torre: { x: 0, y: 13.8, z: 1.9, col: [0.3, 0.36, 0.55], range: 8 },
  };
  const L = {}, lights = [];
  for (const [name, l] of Object.entries(LDEF)) {
    const w = { name, x: ox + l.x, y: o.y + l.y, z: oz + l.z, col: l.col.slice(), range: l.range, flicker: l.flicker || 0, base: l.col.slice() };
    L[name] = w; lights.push(w);
  }

  // ---------------- pisos ----------------
  K.walk(0, NAVE_Z / 2, HW, NAVE_Z / 2, 0);
  K.floor('int:i:tiles', -HW, 0, HW, PRES_Z - 0.9, 0, 1.6, [gray(0.8), gray(0.85), gray(0.85), gray(0.8)]);
  K.floor('int:i:carpet', -0.75, 4.2, 0.75, PRES_Z - 0.9, 0.012, 1.5, null, 0);
  // degraus do presbitério e piso elevado (presbitério, sacristia, depósito, abside)
  for (let i = 0; i < 3; i++) {
    const z0 = PRES_Z - 0.9 + i * 0.3, y = (i + 1) * 0.18;
    K.walk(0, z0 + (NAVE_Z - z0) / 2, VW, (NAVE_Z - z0) / 2, y);
    K.box('marble', 0, 0, z0 + 0.15, VW * 2, y, 0.3, 0, { col: gray(0.82 - i * 0.04) });
    K.floor('int:i:carpet', -0.75, z0, 0.75, z0 + 0.3, y + 0.006, 1.5, null, 0);
  }
  for (const s of [-1, 1]) {
    K.floor('int:i:tiles', s < 0 ? -HW : VW, PRES_Z - 0.9, s < 0 ? -VW : HW, PRES_Z, 0, 1.6, [gray(0.75), gray(0.75), gray(0.75), gray(0.75)]);
    K.walk(s * (VW + HW) / 2, (PRES_Z + NAVE_Z) / 2, (HW - VW) / 2, (NAVE_Z - PRES_Z) / 2, PRES_Y);
  }
  K.floor('marble', -VW, PRES_Z, VW, NAVE_Z, PRES_Y, 2, [gray(0.8), gray(0.82), gray(0.85), gray(0.8)]);
  K.floor('int:i:carpet', -0.75, PRES_Z, 0.75, 34.3, PRES_Y + 0.006, 1.5, null, 0);
  K.floor('woodPlank', -HW, PRES_Z, -VW, NAVE_Z, PRES_Y, 1.5, [gray(0.6), gray(0.62), gray(0.6), gray(0.58)]);
  K.floor('woodPlank', VW, PRES_Z, HW, NAVE_Z, PRES_Y, 1.5, [gray(0.45), gray(0.48), gray(0.45), gray(0.42)]);
  // abside (meio decágono)
  const apse = Array.from({ length: APSE_N + 1 }, (_, k) => { const a = (k / APSE_N) * Math.PI; return [Math.cos(a) * APSE_R, NAVE_Z + Math.sin(a) * APSE_R]; });
  K.poly('marble', apse, PRES_Y, 2);
  K.walk(0, NAVE_Z + APSE_R / 2, APSE_R, APSE_R / 2, PRES_Y);
  // estrado do altar
  K.box('marble', 0, PRES_Y, 35.3, 3.6, 0.18, 2.0, 0, { col: gray(0.86) });
  K.walk(0, 35.3, 1.8, 1.0, PRES_Y + 0.18);

  // ---------------- paredes ----------------
  // laterais (a sacristia tem porta para fora) e frente com o portal
  K.wallRun(HW, 0, HW, NAVE_Z, 0, VS, { A: plaster });
  K.wallRun(-HW, NAVE_Z, -HW, 0, 0, VS, { A: plaster, holes: [[NAVE_Z - SAC_DOOR[1], NAVE_Z - SAC_DOOR[0], PRES_Y, PRES_Y + 2.3]] });
  K.wallRun(-HW, 0, HW, 0, 0, VS, { A: { ...plaster, band: 0 }, holes: [[HW - 1.5, HW + 1.5, 0, 4.2]] });
  // fundos das salas laterais
  K.wallRun(HW, NAVE_Z, VW, NAVE_Z, PRES_Y, VS, { A: plasterP });
  K.wallRun(-VW, NAVE_Z, -HW, NAVE_Z, PRES_Y, VS, { A: plasterP });
  // divisórias: sacristia (direita) e depósito (esquerda), com portas para o presbitério
  K.wallRun(-HW, PRES_Z, -VW, PRES_Z, 0, VS, { A: plasterP, B: plaster });
  K.wallRun(-VW, PRES_Z, -VW, NAVE_Z, PRES_Y, VS, { A: plasterP, B: plasterP, holes: [[SAC_IN[0] - PRES_Z, SAC_IN[1] - PRES_Z, PRES_Y, PRES_Y + 2.3]] });
  K.wallRun(VW, PRES_Z, HW, PRES_Z, 0, VS, { A: plasterP, B: plaster });
  K.wallRun(VW, NAVE_Z, VW, PRES_Z, PRES_Y, VS, { A: plasterP, B: plasterP, holes: [[NAVE_Z - SAC_IN[1], NAVE_Z - SAC_IN[0], PRES_Y, PRES_Y + 2.3]] });
  // tetos das salas (forro de madeira mais baixo)
  K.ceil('woodDark', -HW, PRES_Z, -VW, NAVE_Z, 3.9, 1.5, [gray(0.45), gray(0.45), gray(0.45), gray(0.45)]);
  K.ceil('woodDark', VW, PRES_Z, HW, NAVE_Z, 3.9, 1.5, [gray(0.35), gray(0.35), gray(0.35), gray(0.35)]);
  // portas das salas (batentes de madeira)
  for (const [x, z0, z1] of [[-VW, SAC_IN[0], SAC_IN[1]], [VW, SAC_IN[0], SAC_IN[1]], [-HW, SAC_DOOR[0], SAC_DOOR[1]]]) {
    const y0 = PRES_Y, s = x < 0 ? 1 : -1;
    K.box('woodDark', x + s * 0.17, y0, z0 - 0.06, 0.06, 2.36, 0.12, 0, { col: gray(0.4) });
    K.box('woodDark', x + s * 0.17, y0, z1 + 0.06, 0.06, 2.36, 0.12, 0, { col: gray(0.4) });
    K.box('woodDark', x + s * 0.17, y0 + 2.3, (z0 + z1) / 2, 0.06, 0.12, z1 - z0 + 0.24, 0, { col: gray(0.4) });
  }
  // porta de fora da sacristia: folha de madeira fechada por dentro
  K.face('woodDark', -HW + 0.17, PRES_Y, (SAC_DOOR[0] + SAC_DOOR[1]) / 2, SAC_DOOR[1] - SAC_DOOR[0], 2.3, Math.PI / 2, [[0, 0], [1, 0], [1, 2], [0, 2]], [gray(0.5), gray(0.5), gray(0.55), gray(0.55)]);
  K.box('iron', -HW + 0.2, PRES_Y + 1.05, SAC_DOOR[1] - 0.12, 0.05, 0.05, 0.12, 0, { col: gray(0.3) });

  // ---------------- tetos e abóbada ----------------
  K.ceil('int:i:sky', -HW, 0, -VW, NAVE_Z, VS, 2, [gray(0.75), gray(0.75), gray(0.75), gray(0.75)]);
  K.ceil('int:i:sky', VW, 0, HW, NAVE_Z, VS, 2, [gray(0.75), gray(0.75), gray(0.75), gray(0.75)]);
  for (const s of [-1, 1]) K.ceil('int:i:sky', s < 0 ? -VW : TW, 0, s < 0 ? -TW : VW, TD, VS, 2, [gray(0.7), gray(0.7), gray(0.7), gray(0.7)]);
  const NP = 9, prof = [];
  for (let i = 0; i <= NP * 2; i++) { const x = -VW + (i / (NP * 2)) * VW * 2; prof.push([x, vaultY(x)]); }
  const bays = [TD, ...COLS_Z.filter(z => z > TD), PRES_Z, NAVE_Z];
  for (let b = 0; b < bays.length - 1; b++) {
    const z0 = bays[b], z1 = bays[b + 1];
    let arc = 0;
    for (let i = 0; i < prof.length - 1; i++) {
      const [xa, ya] = prof[i], [xb, yb] = prof[i + 1], seg = Math.hypot(xb - xa, yb - ya);
      const xm = (xa + xb) / 2, ym = (ya + yb) / 2, k = 0.62 + 0.25 * Math.min(1, (ym - VS) / VH);
      K.quadOut('int:i:sky', [xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1], [-xm, VS + 1 - ym, 0],
        [[z0 / 2, arc / 2], [z0 / 2, (arc + seg) / 2], [z1 / 2, (arc + seg) / 2], [z1 / 2, arc / 2]], [gray(k), gray(k), gray(k), gray(k)]);
      arc += seg;
    }
  }
  // nervuras: arcos transversais em cada par de colunas e no arco da abside
  const rib = (z, w = 0.26, col = PINK) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [xa, ya] = prof[i], [xb, yb] = prof[i + 1];
      K.beam('plPink', [xa, ya - 0.04, z], [xb, yb - 0.04, z], w, 0.22, col, 1, '');
    }
  };
  for (const z of [...COLS_Z.filter(z => z > TD), PRES_Z]) rib(z);
  // arcadas longitudinais (ogivas entre as colunas) e cornija da nascença
  const archAlong = (x, z0, z1, ys, rise) => {
    const n = 8, half = (z1 - z0) / 2, c = (rise * rise - half * half) / (2 * half), r = half + c;
    const P = t => { const zz = z0 + t * (z1 - z0), a = Math.abs(zz - (z0 + half)); return [x, ys + Math.sqrt(Math.max(0, r * r - (a + c) * (a + c))), zz]; };
    for (let i = 0; i < n; i++) K.beam('plPink', P(i / n), P((i + 1) / n), 0.3, 0.2, PINK, 1, '');
  };
  for (const s of [-1, 1]) {
    for (let i = 0; i < COLS_Z.length - 1; i++) archAlong(s * VW, COLS_Z[i] + 0.35, COLS_Z[i + 1] - 0.35, 5.6, 2.1);
    archAlong(s * VW, COLS_Z[COLS_Z.length - 1] + 0.35, PRES_Z - 0.2, 5.6, 2.1);
    K.box('plPink', s * VW, VS - 0.28, (TD + NAVE_Z) / 2, 0.42, 0.28, NAVE_Z - TD, 0, { col: PINK });
    for (const x of [s * HW - s * 0.12]) K.box('plPink', x, VS - 0.32, NAVE_Z / 2, 0.24, 0.32, NAVE_Z, 0, { col: PINK });
  }
  // fim da abóbada: parede sobre o arco da abside (entre a abóbada e a meia cúpula)
  const domeEdge = x => APSE_H + Math.sqrt(Math.max(0, APSE_R * APSE_R - x * x));
  for (let i = 0; i < prof.length - 1; i++) {
    const [xa, ya] = prof[i], [xb, yb] = prof[i + 1];
    K.quadOut('plChurch', [xa, domeEdge(xa), NAVE_Z], [xb, domeEdge(xb), NAVE_Z], [xb, yb, NAVE_Z], [xa, ya, NAVE_Z], [0, 0, -1], UV1, [gray(0.7), gray(0.7), gray(0.6), gray(0.6)]);
  }
  // frente da abóbada ao lado da torre (a torre fecha o meio)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const xa = s * (TW + (i / 4) * (VW - TW)), xb = s * (TW + ((i + 1) / 4) * (VW - TW));
      K.quadOut('plChurch', [xa, VS, TD], [xb, VS, TD], [xb, vaultY(xb), TD], [xa, vaultY(xa), TD], [0, 0, 1], UV1, [gray(0.6), gray(0.6), gray(0.6), gray(0.6)]);
    }
  }

  // ---------------- colunas ----------------
  for (const s of [-1, 1]) for (const z of COLS_Z) column(K, s * VW, z);
  // pilastras nos cantos do presbitério
  for (const s of [-1, 1]) K.box('plPink', s * VW, 0, PRES_Z, 0.5, VS, 0.5, 0, { col: PINK });

  // ---------------- abside: paredes, janelas e meia cúpula ----------------
  for (let k = 0; k < APSE_N; k++) {
    const [ax, az] = apse[k], [bx, bz] = apse[k + 1];
    K.wallRun(ax, az, bx, bz, PRES_Y, APSE_H, { A: plasterP, t: 0.3 });
    if (k === 1 || k === 3) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, rot = Math.atan2(-mx, -(mz - NAVE_Z));
      const ix = mx - Math.sin(rot) * 0.17 * -1, iz = mz - Math.cos(rot) * 0.17 * -1;
      K.face('int:i:vitral', ix + Math.sin(rot) * 0.0, 2.2, iz, 1.3, 3.9, rot, UV1);
    }
  }
  {
    const NE = 5;
    for (let e = 0; e < NE; e++) for (let k = 0; k < APSE_N; k++) {
      const e0 = (e / NE) * Math.PI / 2, e1 = ((e + 1) / NE) * Math.PI / 2;
      const a0 = (k / APSE_N) * Math.PI, a1 = ((k + 1) / APSE_N) * Math.PI;
      const P = (a, el) => [Math.cos(a) * APSE_R * Math.cos(el), APSE_H + APSE_R * Math.sin(el), NAVE_Z + Math.sin(a) * APSE_R * Math.cos(el)];
      const kk = 0.55 + 0.25 * (e / NE);
      const m = P((a0 + a1) / 2, (e0 + e1) / 2);
      K.quadOut('int:i:sky', P(a0, e0), P(a1, e0), P(a1, e1), P(a0, e1), [-m[0], -(m[1] - APSE_H), NAVE_Z - m[2]], [[k * 1.2, e * 1.2], [(k + 1) * 1.2, e * 1.2], [(k + 1) * 1.2, (e + 1) * 1.2], [k * 1.2, (e + 1) * 1.2]], [gray(kk), gray(kk), gray(kk), gray(kk)]);
    }
    // arco da abside (nervura)
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI, a1 = ((i + 1) / 10) * Math.PI;
      K.beam('plPink', [Math.cos(a0) * APSE_R, APSE_H + Math.sin(a0) * APSE_R, NAVE_Z + 0.05], [Math.cos(a1) * APSE_R, APSE_H + Math.sin(a1) * APSE_R, NAVE_Z + 0.05], 0.3, 0.28, PINK, 1, '');
    }
  }

  // ---------------- vitrais das laterais e feixes de luz (de dia) ----------------
  const rays = new THREE.Group();
  for (const z of WIN_Z) {
    for (const s of [-1, 1]) {
      K.face('int:i:vitral', s * (HW - 0.17), 2.9, z, 1.6, 4.8, s > 0 ? -Math.PI / 2 : Math.PI / 2, UV1);
      // peitoril
      K.box('plPink', s * (HW - 0.25), 2.75, z, 0.16, 0.15, 1.9, 0, { col: PINK });
    }
    // feixe que desce das janelas da direita (luz da tarde) até o chão da nave
    const ray = part(ctx, k => {
      const top = [[0, 7.4, -0.75], [0, 7.4, 0.75]], bot = [[5.6, 0.02, -0.4], [5.6, 0.02, 1.6]];
      k.quad('int:i:ray', bot[0], bot[1], top[1], top[0], [[0, 1], [1, 1], [1, 0], [0, 0]]);
      k.floor('int:i:raypool', 4.4, -0.6, 7.2, 2.0, 0.025, 99, null, 0);
    }, ox - HW + 0.2, o.y, oz + z);
    rays.add(ray);
  }
  objects.add(rays);
  // janelas das salas (menores)
  K.face('int:i:vitral', -HW + 0.17, 1.6, 31.6, 1.2, 3.6, Math.PI / 2, UV1);
  K.face('int:i:vitral', HW - 0.17, 1.6, 31.6, 1.2, 3.6, -Math.PI / 2, UV1);

  // ---------------- vestíbulo (base da torre) e portal ----------------
  K.wallRun(-TW, 0, -TW, TD, 0, CORO_Y, { A: { ...plaster, band: 0 }, B: plaster, t: 0.3 });
  K.wallRun(TW, TD, TW, 0, 0, CORO_Y, { A: { ...plaster, band: 0 }, B: plaster, t: 0.3 });
  K.wallRun(-TW, TD, TW, TD, 0, CORO_Y, { A: plaster, B: { ...plaster, band: 0 }, holes: [[TW - 1.2, TW + 1.2, 0, 3.2]], t: 0.3 });
  K.ceil('woodDark', -TW, 0, TW, TD, CORO_Y - 0.15, 1.5, [gray(0.4), gray(0.4), gray(0.4), gray(0.4)]);
  // folhas do portal (fechadas por dentro) com ferragens
  for (const s of [-1, 1]) {
    K.box('woodDark', s * 0.75, 0, 0.16, 1.48, 4.1, 0.12, 0, { col: gray(0.55) });
    for (const y of [0.6, 2.0, 3.4]) K.box('iron', s * 0.75, y, 0.235, 1.3, 0.08, 0.02, 0, { col: gray(0.3) });
    K.box('iron', s * 0.12, 1.9, 0.24, 0.05, 0.4, 0.04, 0, { col: gray(0.35) });
  }
  K.box('woodDark', 0, 4.1, 0.15, 3.2, 0.25, 0.3, 0, { col: gray(0.4) });
  // pias de água benta na passagem para a nave
  for (const s of [-1, 1]) {
    const F = K.frame(s * 1.75, 0, TD + 0.2, 0);
    F.prism('granite', [0, 0, 0], [0, 0.8, 0], 0.09, 0.07, 6, gray(0.7), false);
    F.prism('marble', [0, 0.8, 0], [0, 1.0, 0], 0.14, 0.28, 8, gray(0.85), true);
    K.round(s * 1.75, TD + 0.2, 0.3, 0, 1.0);
  }
  // mural de avisos e cofre das esmolas
  K.face('int:i:aviso', -TW + 0.17, 1.15, 1.9, 1.6, 1.2, Math.PI / 2, UV1);
  K.box('woodDark', TW - 0.35, 0, 1.4, 0.4, 1.1, 0.4, 0, { col: gray(0.45) });
  K.box('iron', TW - 0.35, 1.1, 1.4, 0.36, 0.06, 0.36, 0, { col: gray(0.3) });
  K.hit(TW - 0.35, 1.4, 0.22, 0.22, 0, 0, 1.2);

  // ---------------- batistério (sob o coro, à direita) ----------------
  {
    const x = -5.6, z = 1.9;
    K.prism('granite', [x, 0, z], [x, 0.25, z], 0.62, 0.62, 8, gray(0.6), true);
    K.prism('granite', [x, 0.25, z], [x, 0.7, z], 0.24, 0.3, 8, gray(0.65), false);
    K.prism('granite', [x, 0.7, z], [x, 1.0, z], 0.62, 0.62, 8, gray(0.7), false);
    K.prism('woodDark', [x, 1.0, z], [x, 1.25, z], 0.64, 0.12, 8, gray(0.5), true);
    K.round(x, z, 0.7, 0, 1.2);
    // grade baixa em volta
    for (let i = 0; i < 7; i++) K.box('iron', -8.4 + i * 0.6, 0, TD - 0.1, 0.04, 0.9, 0.04, 0, { col: gray(0.28) });
    K.box('iron', -6.6, 0.85, TD - 0.1, 3.6, 0.05, 0.05, 0, { col: gray(0.28) });
    K.hit(-6.6, TD - 0.1, 1.85, 0.05, 0, 0, 0.95);
  }
  // sob o coro, à esquerda: estante dos hinários e banco
  K.box('woodDark', 6.2, 0, 0.45, 2.4, 1.6, 0.5, 0, { col: gray(0.42) });
  for (let i = 0; i < 3; i++) K.box('carPaint', 6.2, 0.3 + i * 0.5, 0.5, 2.2, 0.3, 0.3, 0, { col: i % 2 ? [0.35, 0.12, 0.1] : [0.18, 0.2, 0.3] });
  K.hit(6.2, 0.45, 1.25, 0.3, 0, 0, 1.6);

  // ---------------- coro ----------------
  const coroW = (x, z, hx, hz) => K.walk(x, z, hx, hz, CORO_Y);
  coroW(-(HW + TW) / 2 - 0.08, TD / 2, (HW - TW) / 2 - 0.1, TD / 2);
  coroW((HW + TW) / 2 + 0.08, TD / 2, (HW - TW) / 2 - 0.1, TD / 2);
  coroW(0, (TD + CORO_Z) / 2, HW, (CORO_Z - TD) / 2);
  K.floor('woodPlank', -HW, 0, -TW, TD, CORO_Y, 1.5, [gray(0.6), gray(0.6), gray(0.6), gray(0.6)]);
  K.floor('woodPlank', TW, 0, HW, TD, CORO_Y, 1.5, [gray(0.6), gray(0.6), gray(0.6), gray(0.6)]);
  K.floor('woodPlank', -HW, TD, HW, CORO_Z, CORO_Y, 1.5, [gray(0.62), gray(0.62), gray(0.62), gray(0.62)]);
  K.ceil('woodDark', -HW, 0, -TW, CORO_Z, CORO_Y - 0.2, 1.5, [gray(0.35), gray(0.35), gray(0.35), gray(0.35)]);
  K.ceil('woodDark', TW, 0, HW, CORO_Z, CORO_Y - 0.2, 1.5, [gray(0.35), gray(0.35), gray(0.35), gray(0.35)]);
  K.ceil('woodDark', -TW, TD, TW, CORO_Z, CORO_Y - 0.2, 1.5, [gray(0.35), gray(0.35), gray(0.35), gray(0.35)]);
  // frente do coro e balaustrada (aberta onde chega a escada)
  K.box('woodDark', -0.6, CORO_Y - 0.45, CORO_Z + 0.04, HW * 2 - 1.2, 0.45, 0.12, 0, { col: gray(0.5) });
  const BAL_X1 = 6.95;
  for (let x = -HW + 0.2; x < BAL_X1; x += 0.28) K.prism('woodDark', [x, CORO_Y, CORO_Z], [x, CORO_Y + 0.9, CORO_Z], 0.04, 0.04, 4, gray(0.5), false);
  K.box('woodDark', (-HW + BAL_X1) / 2, CORO_Y + 0.9, CORO_Z, BAL_X1 + HW, 0.08, 0.14, 0, { col: gray(0.55) });
  K.hit((-HW + BAL_X1) / 2, CORO_Z, (BAL_X1 + HW) / 2, 0.08, 0, CORO_Y, CORO_Y + 1.0);
  // órgão de tubos (à esquerda, contra a parede da fachada)
  {
    const x0 = 3.2, x1 = 8.2, z = 0.75, y = CORO_Y;
    K.box('woodDark', (x0 + x1) / 2, y, z, x1 - x0, 1.1, 1.1, 0, { col: gray(0.4) });
    K.hit((x0 + x1) / 2, z, (x1 - x0) / 2, 0.55, 0, y, y + 3.6);
    const towers = [[x0 + 0.6, 3.4], [(x0 + x1) / 2, 4.0], [x1 - 0.6, 3.4]];
    for (const [cx, h] of towers) {
      K.box('woodDark', cx, y + 1.1, z, 1.1, h - 1.1, 0.8, 0, { col: gray(0.35) });
      for (let i = 0; i < 5; i++) {
        const px = cx - 0.4 + i * 0.2, ph = h - 1.6 - Math.abs(i - 2) * 0.35;
        K.prism('metalWhite', [px, y + 1.2, z + 0.42], [px, y + 1.2 + ph, z + 0.42], 0.07, 0.07, 6, gray(0.8), true);
        K.prism('metalWhite', [px, y + 1.05, z + 0.42], [px, y + 1.2, z + 0.42], 0.02, 0.07, 6, gray(0.6), false);
      }
      K.prism('woodDark', [cx, y + h, z], [cx, y + h + 0.5, z], 0.5, 0.05, 4, gray(0.4), true, 1, Math.PI / 4);
    }
    // console com teclado e banco
    K.box('woodDark', 5.7, y, 1.8, 1.6, 1.0, 0.6, 0, { col: gray(0.45) });
    K.box('carPaint', 5.7, y + 0.82, 1.55, 1.3, 0.04, 0.16, 0, { col: [0.88, 0.86, 0.78] });
    K.box('woodDark', 5.7, y, 2.6, 1.4, 0.45, 0.35, 0, { col: gray(0.4) });
    K.hit(5.7, 2.1, 0.8, 0.65, 0, y, y + 1.0);
  }
  // cadeiras do coro
  for (let i = 0; i < 5; i++) chair(K, -7.8 + i * 1.0, 4.6, Math.PI, CORO_Y);

  // ---------------- escada do coro (encostada na parede esquerda) ----------------
  {
    const xa = 7.1, xb = 8.45, zTop = CORO_Z, zBot = 12.4, n = 16, run = (zBot - zTop) / n, rise = CORO_Y / n;
    K.ramp((xa + xb) / 2, (zTop + zBot) / 2, (xb - xa) / 2, (zBot - zTop) / 2, 0, CORO_Y, 0);
    for (let i = 0; i < n; i++) {
      const z1 = zBot - i * run, y = (i + 1) * rise;
      K.box('woodPlank', (xa + xb) / 2, y - 0.06, z1 - run / 2, xb - xa, 0.06, run + 0.02, 0, { col: gray(0.55) });
      K.box('woodDark', (xa + xb) / 2, y - rise, z1 - 0.02, xb - xa, rise, 0.03, 0, { col: gray(0.35) });
    }
    // longarina e corrimão do lado da nave
    K.beam('woodDark', [xa - 0.05, -0.1, zBot], [xa - 0.05, CORO_Y - 0.1, zTop], 0.08, 0.3, gray(0.4));
    K.beam('woodDark', [xa - 0.05, 0.95, zBot], [xa - 0.05, CORO_Y + 0.95, zTop], 0.06, 0.06, gray(0.5));
    for (let i = 0; i <= 8; i++) { const z = zBot - i * (zBot - zTop) / 8, y = CORO_Y * i / 8; K.beam('woodDark', [xa - 0.05, y, z], [xa - 0.05, y + 0.95, z], 0.04, 0.04, gray(0.45)); }
    K.hit(xa - 0.06, (zTop + zBot) / 2, 0.06, (zBot - zTop) / 2, 0, -0.5, CORO_Y + 1.0);
    // embaixo da escada: tábuas fechando
    K.quadOut('woodDark', [xa, 0, zBot], [xa, 0, zTop], [xa, CORO_Y - 0.1, zTop], [xa, 0, zBot], [-1, 0, 0], [[0, 0], [3, 0], [3, 2], [0, 0]], [gray(0.3), gray(0.3), gray(0.35), gray(0.3)]);
  }

  // ---------------- torre: poço da escada, patamar e câmara do sino ----------------
  {
    const ix0 = -TW + 0.15, ix1 = TW - 0.15, iz0 = 0.15, iz1 = TD - 0.15;
    // paredes do poço (tijolo à vista), da altura do coro ao forro do sino
    K.wallRun(-TW, 0, -TW, TD, CORO_Y, TOWER_TOP, { A: { ...plaster, band: 0 }, B: brick, t: 0.3 });
    K.wallRun(TW, TD, TW, 0, CORO_Y, TOWER_TOP, { A: { ...plaster, band: 0 }, B: brick, t: 0.3 });
    K.wallRun(-TW, TD, TW, TD, CORO_Y, TOWER_TOP, { A: { ...plaster, band: 0 }, B: brick, holes: [[TW + 1.2, TW + 2.3, CORO_Y, CORO_Y + 2.2]], t: 0.3 });
    K.wallRun(-TW, 0.02, TW, 0.02, VS, TOWER_TOP, { A: brick, t: 0.2, noCol: true });
    K.ceil('woodDark', -TW, 0, TW, TD, TOWER_TOP, 1.5, [gray(0.3), gray(0.3), gray(0.3), gray(0.3)]);
    // piso do poço na altura do coro
    // (vai até o meio da parede da porta: sem vão entre o piso do coro e o do poço)
    K.walk(0, (iz0 + TD + 0.1) / 2, TW - 0.15, (TD + 0.1 - iz0) / 2, CORO_Y);
    K.floor('woodPlank', ix0, iz0, ix1, iz1, CORO_Y, 1.5, [gray(0.45), gray(0.45), gray(0.45), gray(0.45)]);
    // lance A: ao longo de -x junto ao fundo do poço (z 2,45..3,65), do coro ao patamar
    const zA0 = 2.45, xA0 = 1.2, xA1 = -1.8;
    K.ramp((xA0 + xA1) / 2, (zA0 + iz1) / 2, (iz1 - zA0) / 2, (xA0 - xA1) / 2, Math.PI / 2, LAND_Y, CORO_Y);
    stairs(K, xA0, xA1, zA0, iz1, CORO_Y, LAND_Y, 'x');
    // patamar (lado direito do poço)
    K.walk((ix0 + xA1) / 2, TD / 2, (xA1 - ix0) / 2, TD / 2 - 0.15, LAND_Y);
    K.box('woodPlank', (ix0 + xA1) / 2, LAND_Y - 0.12, TD / 2, xA1 - ix0, 0.12, TD - 0.3, 0, { col: gray(0.5), bottom: true });
    // lance B: ao longo de +x junto à frente (z 0,15..1,35), do patamar ao piso do sino
    const zB1 = 1.35, xB0 = -1.8, xB1 = 1.2;
    K.ramp((xB0 + xB1) / 2, (iz0 + zB1) / 2, (zB1 - iz0) / 2, (xB1 - xB0) / 2, Math.PI / 2, LAND_Y, BELL_Y);
    stairs(K, xB0, xB1, iz0, zB1, LAND_Y, BELL_Y, 'x');
    // piso do sino (com o buraco da escada)
    K.walk((xB1 + ix1) / 2, TD / 2, (ix1 - xB1) / 2, TD / 2 - 0.15, BELL_Y);
    K.walk((ix0 + xB1) / 2, (zB1 + iz1) / 2, (xB1 - ix0) / 2, (iz1 - zB1) / 2, BELL_Y);
    K.box('woodPlank', (xB1 + ix1) / 2, BELL_Y - 0.14, TD / 2, ix1 - xB1, 0.14, TD - 0.3, 0, { col: gray(0.5), bottom: true });
    K.box('woodPlank', (ix0 + xB1) / 2, BELL_Y - 0.14, (zB1 + iz1) / 2, xB1 - ix0, 0.14, iz1 - zB1, 0, { col: gray(0.5), bottom: true });
    // guarda-corpo em volta do buraco
    K.box('woodDark', (ix0 + xB1) / 2 - 0.3, BELL_Y + 0.9, zB1, xB1 - ix0 - 0.6, 0.07, 0.07, 0, { col: gray(0.45) });
    for (let x = ix0 + 0.2; x < xB1 - 0.5; x += 0.5) K.box('woodDark', x, BELL_Y, zB1, 0.06, 0.9, 0.06, 0, { col: gray(0.45) });
    K.hit((ix0 + xB1) / 2 - 0.3, zB1, (xB1 - ix0) / 2 - 0.3, 0.06, 0, BELL_Y, BELL_Y + 1.0);
    // corrimão do lance A no lado aberto
    K.beam('woodDark', [xA0, CORO_Y + 0.95, zA0], [xA1, LAND_Y + 0.95, zA0], 0.05, 0.05, gray(0.45));
    K.hit((xA0 + xA1) / 2, zA0 - 0.04, (xA0 - xA1) / 2, 0.05, 0, CORO_Y + 0.4, LAND_Y + 1.0);
    // janelas do campanário (venezianas) nas quatro faces
    const wy = BELL_Y + 1.0, wh = 4.2;
    K.face('chTowerWin', 0, wy, iz0 + 0.04, 2.2, wh, 0, UV1, [gray(0.6), gray(0.6), gray(0.7), gray(0.7)]);
    K.face('chTowerWin', 0, wy, iz1 - 0.04, 2.2, wh, Math.PI, UV1, [gray(0.5), gray(0.5), gray(0.6), gray(0.6)]);
    K.face('chTowerWin', ix0 + 0.04, wy, TD / 2, 2.0, wh, Math.PI / 2, UV1, [gray(0.55), gray(0.55), gray(0.65), gray(0.65)]);
    K.face('chTowerWin', ix1 - 0.04, wy, TD / 2, 2.0, wh, -Math.PI / 2, UV1, [gray(0.55), gray(0.55), gray(0.65), gray(0.65)]);
    // estrutura do sino: dois esteios e a travessa
    for (const s of [-1, 1]) {
      K.box('woodDark', s * 1.6, BELL_Y, 2.5, 0.22, 4.2, 0.22, 0, { col: gray(0.4) });
      K.beam('woodDark', [s * 1.6, BELL_Y, 1.9], [s * 1.6, BELL_Y + 2.2, 2.45], 0.12, 0.12, gray(0.38));
      K.beam('woodDark', [s * 1.6, BELL_Y, 3.1], [s * 1.6, BELL_Y + 2.2, 2.55], 0.12, 0.12, gray(0.38));
      K.round(s * 1.6, 2.5, 0.2, BELL_Y, BELL_Y + 4.3);
    }
    K.box('woodDark', 0, BELL_Y + 4.2, 2.5, 3.6, 0.26, 0.3, 0, { col: gray(0.42) });
    // penas e sujeira de pombo no chão
    for (let i = 0; i < 18; i++) K.box('carPaint', ix0 + 0.3 + R() * 4.6, BELL_Y + 0.005, 1.5 + R() * 2.0, 0.08 + R() * 0.1, 0.01, 0.02 + R() * 0.05, R() * 3, { col: gray(0.6 + R() * 0.3) });
  }
  // o sino (peça que balança) e a corda
  const bell = part(ctx, k => {
    k.prism('bronze', [0, -0.15, 0], [0, -0.95, 0], 0.3, 0.6, 12, gray(0.8), false);
    k.prism('bronze', [0, -0.95, 0], [0, -1.08, 0], 0.6, 0.66, 12, gray(0.7), false);
    k.prism('bronze', [0, -1.08, 0], [0, -1.1, 0], 0.66, 0.45, 12, gray(0.4), false);
    k.prism('bronze', [0, -0.15, 0], [0, 0.0, 0], 0.3, 0.12, 12, gray(0.85), true);
    k.box('iron', 0, 0, 0, 0.12, 0.25, 0.12, 0, { col: gray(0.3) });
    k.beam('iron', [0, -0.2, 0], [0, -0.95, 0], 0.05, 0.05, gray(0.3));
    k.prism('iron', [0, -0.95, 0], [0, -1.05, 0], 0.08, 0.08, 6, gray(0.3), true);
    k.beam('woodDark', [0, 0.15, -0.1], [0, 0.15, 0.9], 0.08, 0.1, gray(0.4));
    k.beam('carPaint', [0, 0.1, 0.85], [0, -3.4, 0.85], 0.025, 0.025, [0.55, 0.48, 0.36]);
  }, ox + 0, o.y + BELL_Y + 4.1, oz + 2.5);
  objects.add(bell);
  const bellState = { t: 99, amp: 0 };
  anim.push((dt) => {
    bellState.t += dt;
    bellState.amp *= Math.exp(-dt * 0.35);
    bell.rotation.x = Math.sin(bellState.t * 3.1) * bellState.amp;
  });

  // ---------------- bancos ----------------
  for (let z = 7.4; z <= 24.2; z += 1.05) {
    for (const s of [-1, 1]) pew(K, s * 2.4, z, 3.2);
  }
  // confessionário (parede da direita)
  {
    const x = -HW + 0.55, z = 12.4, y = 0;
    K.box('woodDark', x, y, z, 0.9, 2.5, 2.4, 0, { col: gray(0.38) });
    K.box('woodDark', x, y + 2.5, z, 1.0, 0.18, 2.5, 0, { col: gray(0.32) });
    for (const dz of [-0.75, 0.75]) K.face('awnRed', x + 0.46, y + 0.25, z + dz, 0.6, 1.9, Math.PI / 2, [[0, 0], [1, 0], [1, 2], [0, 2]], [gray(0.45), gray(0.45), gray(0.5), gray(0.5)]);
    K.box('woodDark', x + 0.46, y, z, 0.04, 2.5, 0.12, 0, { col: gray(0.3) });
    K.prism('woodDark', [x, y + 2.68, z], [x, y + 3.1, z], 0.1, 0.02, 4, gray(0.35), true);
    K.hit(x, z, 0.5, 1.25, 0, y, y + 2.7);
  }
  // púlpito no pilar esquerdo, voltado para a nave
  {
    const x = VW + 0.75, z = 14, y = 1.9;
    K.prism('woodDark', [x, y, z], [x, y + 1.05, z], 0.6, 0.6, 6, gray(0.42), true);
    K.prism('woodDark', [x, y - 0.6, z], [x, y, z], 0.18, 0.6, 6, gray(0.38), false);
    K.prism('woodDark', [x, 0, z], [x, y - 0.6, z], 0.12, 0.12, 6, gray(0.36), false);
    K.prism('woodDark', [x, y + 2.6, z], [x, y + 2.75, z], 0.8, 0.8, 6, gray(0.36), true);
    K.prism('woodDark', [x, y + 2.75, z], [x, y + 3.3, z], 0.7, 0.05, 6, gray(0.38), true);
    K.beam('woodDark', [x + 0.55, y + 1.0, z], [x + 0.55, y + 2.6, z], 0.08, 0.08, gray(0.35));
    for (let i = 0; i < 6; i++) K.box('woodDark', x + 0.6 + 0.12 * 0, 0.05 + i * 0.3, z + 0.65 + i * 0.22, 0.6, 0.06, 0.24, 0, { col: gray(0.4) });
    K.round(x, z, 0.65, 0, y + 1.1);
    K.hit(x + 0.6, z + 1.25, 0.32, 0.65, 0, 0, 1.9);
  }
  // quadro dos cantos e a via-sacra
  K.face('int:i:hymn', -HW + 0.16, 1.9, 23.6, 0.55, 0.85, Math.PI / 2, UV1);
  const via = (x, z, rot, i) => {
    const u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 4;
    K.box('woodDark', x - Math.sin(rot) * 0.02, 2.85, z - Math.cos(rot) * 0.02, rot === 0 || rot === Math.PI ? 0.62 : 0.06, 0.62, rot === 0 || rot === Math.PI ? 0.06 : 0.62, 0, { col: gray(0.35) });
    K.face('int:i:via', x + Math.sin(rot) * 0.025, 2.88, z + Math.cos(rot) * 0.025, 0.55, 0.55, rot, [[u0, v0], [u0 + 0.25, v0], [u0 + 0.25, v0 + 0.25], [u0, v0 + 0.25]]);
  };
  [6.5, 7.6, 11.0, 13.6, 17.5, 18.9, 23.4].forEach((z, i) => via(-HW + 0.18, z, Math.PI / 2, i));
  [23.4, 18.9, 17.5, 13.6, 12.9].forEach((z, i) => via(HW - 0.18, z, -Math.PI / 2, 7 + i));
  via(VW + 0.6, PRES_Z - 0.06, Math.PI, 12);
  via(-VW - 0.6, PRES_Z - 0.06, Math.PI, 13);

  // ---------------- lustres da nave ----------------
  for (const [i, z] of [[1, 10], [2, 16], [3, 22]]) {
    K.beam('iron', [0, vaultY(0) - 0.1, z], [0, 9.6, z], 0.03, 0.03, gray(0.22));
    chandelier(ctx, objects, anim, { x: ox, y: o.y, z: oz }, 0, 9.6, z, L['lustre' + i]);
  }

  // ---------------- presbitério ----------------
  // mesa de comunhão (balaustrada de mármore) com abertura no meio
  for (const s of [-1, 1]) {
    const xa = s * 0.75, xb = s * VW, zr = PRES_Z + 0.2, y = PRES_Y;
    for (let x = Math.min(xa, xb) + 0.15; x < Math.max(xa, xb) - 0.05; x += 0.26) K.prism('marble', [x, y, zr], [x, y + 0.72, zr], 0.05, 0.07, 6, gray(0.85), false);
    K.box('marble', (xa + xb) / 2, y + 0.72, zr, Math.abs(xb - xa), 0.1, 0.3, 0, { col: gray(0.9) });
    K.box('marble', (xa + xb) / 2, y, zr, Math.abs(xb - xa), 0.08, 0.3, 0, { col: gray(0.8) });
    K.hit((xa + xb) / 2, zr, Math.abs(xb - xa) / 2, 0.16, 0, y - 0.2, y + 0.85);
  }
  // cadeira do padre e credência
  chair(K, -2.6, 31.2, Math.PI / 2, PRES_Y, true);
  K.box('woodDark', 2.8, PRES_Y, 31.6, 1.0, 0.85, 0.5, 0, { col: gray(0.42) });
  K.hit(2.8, 31.6, 0.5, 0.25, 0, PRES_Y, PRES_Y + 0.9);
  // ambão (estante de leitura) e o grande livro
  {
    const F = K.frame(2.2, PRES_Y, 28.3, -0.3);
    F.box('woodDark', 0, 0, 0, 0.18, 1.0, 0.18, gray(0.4));
    F.box('woodDark', 0, 1.0, 0, 0.6, 0.06, 0.45, gray(0.45));
    F.box('carPaint', 0, 1.06, 0, 0.42, 0.05, 0.3, [0.85, 0.82, 0.72]);
    K.round(2.2, 28.3, 0.3, PRES_Y, PRES_Y + 1.1);
  }
  // cruz triunfal pendurada no arco do presbitério
  {
    const z = PRES_Z + 0.1, y = 6.3;
    K.beam('iron', [0, vaultY(0) - 0.1, z], [0, y + 2.0, z], 0.025, 0.025, gray(0.25));
    K.box('woodDark', 0, y - 1.4, z, 0.16, 3.4, 0.14, 0, { col: gray(0.35) });
    K.box('woodDark', 0, y + 0.95, z, 1.8, 0.16, 0.14, 0, { col: gray(0.35) });
    const skin = [0.82, 0.72, 0.6];
    K.box('carPaint', 0, y - 0.25, z - 0.1, 0.2, 0.95, 0.1, 0, { col: skin });
    K.box('carPaint', 0, y + 0.72, z - 0.1, 0.15, 0.17, 0.12, 0, { col: skin });
    K.beam('carPaint', [-0.08, y + 0.6, z - 0.1], [-0.8, y + 0.98, z - 0.1], 0.06, 0.06, skin);
    K.beam('carPaint', [0.08, y + 0.6, z - 0.1], [0.8, y + 0.98, z - 0.1], 0.06, 0.06, skin);
    K.box('carPaint', 0, y - 0.25, z - 0.12, 0.24, 0.24, 0.1, 0, { col: [0.86, 0.84, 0.78] });
    K.beam('carPaint', [-0.05, y - 0.3, z - 0.1], [-0.03, y - 1.25, z - 0.1], 0.07, 0.07, skin);
    K.beam('carPaint', [0.05, y - 0.3, z - 0.1], [0.03, y - 1.25, z - 0.1], 0.07, 0.07, skin);
  }

  // ---------------- altar-mor e retábulo ----------------
  const AY = PRES_Y + 0.18;
  {
    // mesa do altar
    K.box('marble', 0, AY, 35.2, 2.6, 0.95, 1.0, 0, { col: gray(0.9) });
    K.box('marble', 0, AY + 0.95, 35.2, 2.8, 0.08, 1.15, 0, { col: gray(0.95) });
    K.box('awnCream', 0, AY + 1.03, 35.2, 2.7, 0.01, 1.1, 0, { col: [1, 1, 0.96] });
    K.face('carPaint', 0, AY + 0.6, 34.69, 2.0, 0.35, Math.PI, UV1, [[0.62, 0.48, 0.2], [0.62, 0.48, 0.2], [0.7, 0.55, 0.24], [0.7, 0.55, 0.24]]);
    K.hit(0, 35.2, 1.4, 0.58, 0, AY, AY + 1.1);
    // sacrário dourado no meio
    K.box('bronze', 0, AY + 1.04, 35.55, 0.55, 0.5, 0.4, 0, { col: [1.1, 0.95, 0.6] });
    K.prism('bronze', [0, AY + 1.54, 35.55], [0, AY + 1.8, 35.55], 0.32, 0.02, 4, [1.1, 0.95, 0.6], true, 1, Math.PI / 4);
    // retábulo neogótico contra o fundo da abside
    const zb = NAVE_Z + APSE_R * Math.sin((2 / APSE_N) * Math.PI) - 0.32;
    K.box('woodDark', 0, AY, zb, 2.6, 1.4, 0.5, 0, { col: gray(0.4) });
    K.hit(0, zb, 1.3, 0.3, 0, AY, AY + 6.5);
    for (const [x, w, h] of [[0, 1.0, 4.6], [-0.95, 0.75, 3.6], [0.95, 0.75, 3.6]]) {
      K.face('int:i:retab', x, AY + 1.4, zb - 0.26, w, h - 1.4, Math.PI, UV1);
      for (const s of [-1, 1]) K.box('bronze', x + s * (w / 2 + 0.05), AY + 1.4, zb - 0.22, 0.1, h - 1.4, 0.12, 0, { col: [1.05, 0.88, 0.5] });
      // arco e pináculo
      K.prism('bronze', [x, AY + h, zb - 0.2], [x, AY + h + 0.9 + (x === 0 ? 0.8 : 0), zb - 0.2], w / 2 + 0.08, 0.02, 4, [1.0, 0.84, 0.48], true, 1, Math.PI / 4);
      for (const s of [-1, 1]) K.prism('bronze', [x + s * (w / 2 + 0.05), AY + h - 0.1, zb - 0.2], [x + s * (w / 2 + 0.05), AY + h + 0.5, zb - 0.2], 0.07, 0.01, 4, [1.0, 0.84, 0.48], true);
    }
    // Nossa Senhora Auxiliadora no nicho do meio (manto azul, coroa, o Menino no colo)
    madonna(K, 0, AY + 1.45, zb - 0.45);
    // santos menores nos nichos laterais
    saint(K, -0.95, AY + 1.45, zb - 0.42, [0.45, 0.32, 0.22]);
    saint(K, 0.95, AY + 1.45, zb - 0.42, [0.32, 0.2, 0.16]);
    // velas altas atrás da mesa
    for (const x of [-2.0, 2.0]) {
      K.prism('bronze', [x, AY, 36.2], [x, AY + 1.3, 36.2], 0.06, 0.05, 6, [1.0, 0.85, 0.5], false);
      K.prism('bronze', [x, AY + 1.3, 36.2], [x, AY + 1.34, 36.2], 0.12, 0.12, 6, [1.0, 0.85, 0.5], true);
      K.prism('carPaint', [x, AY + 1.34, 36.2], [x, AY + 1.8, 36.2], 0.04, 0.04, 6, [0.92, 0.9, 0.82], true);
      flame(objects, anim, ctx, ox + x, o.y + AY + 1.8, oz + 36.2, 'altar', x * 3);
      K.round(x, 36.2, 0.15, AY, AY + 1.8);
    }
  }
  // os três castiçais de prata do altar (capítulo 6: o padre entrega)
  const silver = part(ctx, k => {
    for (const x of [-1.0, -0.55, 0.55, 1.0].filter((_, i) => i !== 1)) {
      k.prism('metalWhite', [x, 0, 0], [x, 0.05, 0], 0.11, 0.11, 8, gray(1.15), true);
      k.prism('metalWhite', [x, 0.05, 0], [x, 0.42, 0], 0.03, 0.025, 8, gray(1.2), false);
      k.prism('metalWhite', [x, 0.2, 0], [x, 0.26, 0], 0.05, 0.05, 8, gray(1.2), true);
      k.prism('metalWhite', [x, 0.42, 0], [x, 0.46, 0], 0.07, 0.07, 8, gray(1.2), true);
      k.prism('carPaint', [x, 0.46, 0], [x, 0.66, 0], 0.025, 0.025, 6, [0.92, 0.9, 0.82], true);
    }
  }, ox, o.y + AY + 1.04, oz + 35.05);
  objects.add(silver);
  const silverFlames = [];
  for (const x of [-1.0, 0.55, 1.0]) {
    const f = part(ctx, k => {
      k.quad('int:c:flame', [-0.04, 0, 0], [0.04, 0, 0], [0.04, 0.13, 0], [-0.04, 0.13, 0], UV1);
      k.quad('int:c:flame', [0, 0, -0.04], [0, 0, 0.04], [0, 0.13, 0.04], [0, 0.13, -0.04], UV1);
    }, ox + x, o.y + AY + 1.04 + 0.66, oz + 35.05);
    objects.add(f); silverFlames.push(f);
    (anim.flames ||= []).push({ obj: f, light: 'altar', ph: x * 5 });
  }
  // lamparina do Santíssimo (vidro vermelho pendurado; o vidro aceso e o brilho no chão
  // são uma peça à parte, que apaga quando a igreja fica no escuro)
  {
    const x = -1.7, z = 34.2, y = 3.0;
    K.beam('iron', [x, APSE_H + 2.5, z], [x, y + 0.35, z], 0.015, 0.015, gray(0.25));
    K.prism('bronze', [x, y + 0.35, z], [x, y + 0.2, z], 0.06, 0.14, 8, [0.9, 0.75, 0.45], false);
    K.prism('bronze', [x, y - 0.05, z], [x, y - 0.18, z], 0.08, 0.02, 8, [0.9, 0.75, 0.45], true);
    K.prism('int:i:glassOff', [x, y + 0.2, z], [x, y - 0.05, z], 0.118, 0.078, 8, gray(0.35), true);
  }
  const lamparina = part(ctx, k => {
    k.prism('int:i:redglass', [0, 0.2, 0], [0, -0.05, 0], 0.122, 0.082, 8, null, true);
    k.floor('int:i:redglow', -1.6, -1.6, 1.6, 1.6, PRES_Y - 3.0 + 0.02, 99, null, 0);
  }, ox - 1.7, o.y + 3.0, oz + 34.2);
  objects.add(lamparina);

  // ---------------- altares laterais e velas votivas ----------------
  for (const s of [-1, 1]) {
    const x = s * (HW + VW) / 2, z = PRES_Z - 0.35;
    K.box('marble', x, 0, z, 1.8, 0.95, 0.6, 0, { col: gray(0.85) });
    K.box('marble', x, 0.95, z, 1.95, 0.06, 0.7, 0, { col: gray(0.9) });
    K.box('woodDark', x, 1.0, z + 0.1, 1.5, 2.6, 0.25, 0, { col: gray(0.4) });
    K.face('int:i:retab', x, 1.2, z - 0.035, 1.1, 2.2, Math.PI, UV1);
    K.prism('bronze', [x, 3.6, z + 0.05], [x, 4.4, z + 0.05], 0.8, 0.02, 4, [1.0, 0.84, 0.48], true, 1, Math.PI / 4);
    if (s > 0) saint(K, x, 1.25, z - 0.12, [0.5, 0.36, 0.24]);        // São José (manto marrom)
    else heart(K, x, 1.25, z - 0.12);                                   // Sagrado Coração (manto vermelho)
    K.hit(x, z, 0.98, 0.36, 0, 0, 3.6);
  }
  {
    // estante de ferro com velas votivas na frente do altar de São José
    const x = (HW + VW) / 2, z = PRES_Z - 1.25;
    K.box('iron', x, 0, z, 1.4, 0.75, 0.5, 0, { col: gray(0.25) });
    K.box('iron', x, 0.75, z + 0.12, 1.4, 0.18, 0.26, 0, { col: gray(0.25) });
    K.hit(x, z, 0.72, 0.28, 0, 0, 1.0);
    for (let i = 0; i < 6; i++) candleCluster(K, objects, anim, x - 0.55 + i * 0.22, z - 0.12 + (i % 2) * 0.08, 0.75, 1, 'votivas');
    for (let i = 0; i < 5; i++) candleCluster(K, objects, anim, x - 0.45 + i * 0.22, z + 0.14, 0.93, 1, 'votivas');
  }
  // velas no altar do Sagrado Coração
  candleCluster(K, objects, anim, -(HW + VW) / 2 - 0.6, PRES_Z - 0.4, 1.01, 2, 'lateral');
  candleCluster(K, objects, anim, -(HW + VW) / 2 + 0.6, PRES_Z - 0.4, 1.01, 2, 'lateral');

  // ---------------- sacristia ----------------
  {
    const y = PRES_Y, cx = -(HW + VW) / 2;
    // armário dos paramentos contra o fundo
    K.box('woodDark', cx, y, NAVE_Z - 0.4, 3.4, 2.3, 0.6, 0, { col: gray(0.42) });
    for (let i = 0; i < 4; i++) K.box('woodDark', cx - 1.275 + i * 0.85, y + 0.15, NAVE_Z - 0.69, 0.8, 1.0, 0.03, 0, { col: gray(0.36) });
    for (let i = 0; i < 4; i++) K.box('bronze', cx - 1.275 + i * 0.85, y + 0.85, NAVE_Z - 0.72, 0.12, 0.03, 0.03, 0, { col: [0.9, 0.75, 0.45] });
    K.box('woodDark', cx, y + 2.3, NAVE_Z - 0.4, 3.6, 0.12, 0.7, 0, { col: gray(0.38) });
    K.hit(cx, NAVE_Z - 0.4, 1.7, 0.3, 0, y, y + 2.4);
    // mesa no meio: o lampião bento, um cálice e o missal
    // (pequena e sem cadeira: o caminho entre a porta do presbitério e a de fora fica livre)
    const tx = cx + 0.15, tz = 29.2;
    K.box('woodDark', tx, y + 0.78, tz, 1.4, 0.07, 0.7, 0, { col: gray(0.45) });
    for (const [dx, dz] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) K.box('woodDark', tx + dx, y, tz + dz, 0.07, 0.78, 0.07, 0, { col: gray(0.4) });
    K.hit(tx, tz, 0.71, 0.36, 0, y, y + 0.9);
    K.prism('bronze', [tx + 0.5, y + 0.85, tz - 0.12], [tx + 0.5, y + 1.05, tz - 0.12], 0.04, 0.07, 8, [1.0, 0.85, 0.5], true);
    K.box('carPaint', tx + 0.05, y + 0.85, tz + 0.12, 0.36, 0.06, 0.28, 0.2, { col: [0.45, 0.12, 0.1] });
    // crucifixo na parede, pia de lavar as mãos, cabide com a estola
    K.box('woodDark', -HW + 0.2, y + 1.4, 28.2, 0.05, 0.8, 0.07, 0, { col: gray(0.3) });
    K.box('woodDark', -HW + 0.2, y + 1.95, 28.2, 0.05, 0.07, 0.42, 0, { col: gray(0.3) });
    K.box('marble', cx + 1.2, y + 0.8, PRES_Z + 0.35, 0.6, 0.15, 0.4, 0, { col: gray(0.85) });
    K.box('iron', cx + 1.2, y + 1.05, PRES_Z + 0.2, 0.04, 0.2, 0.04, 0, { col: gray(0.4) });
    K.box('woodDark', cx - 1.4, y + 1.7, PRES_Z + 0.12, 0.6, 0.05, 0.05, 0, { col: gray(0.35) });
    K.face('carPaint', cx - 1.4, y + 0.9, PRES_Z + 0.16, 0.18, 0.8, 0, UV1, [[0.5, 0.1, 0.4], [0.5, 0.1, 0.4], [0.55, 0.12, 0.45], [0.55, 0.12, 0.45]]);
    // lâmpada pendurada
    K.beam('iron', [cx, 3.9, 29.9], [cx, 3.35, 29.9], 0.012, 0.012, gray(0.2));
    K.prism('glassLit', [cx, 3.35, 29.9], [cx, 3.15, 29.9], 0.08, 0.06, 6, gray(1.2), true);
  }
  // o lampião bento em cima da mesa (some quando o jogador pega)
  const lamp = part(ctx, k => {
    k.prism('iron', [0, 0, 0], [0, 0.03, 0], 0.09, 0.09, 6, gray(0.3), true);
    k.prism('glass', [0, 0.03, 0], [0, 0.24, 0], 0.07, 0.08, 6, gray(1.0), false);
    k.prism('iron', [0, 0.24, 0], [0, 0.31, 0], 0.09, 0.03, 6, gray(0.3), true);
    k.beam('iron', [-0.07, 0.31, 0], [0.07, 0.31, 0], 0.012, 0.012, gray(0.3));
    for (const s of [-1, 1]) k.beam('iron', [s * 0.08, 0.03, 0], [s * 0.08, 0.24, 0], 0.012, 0.012, gray(0.3));
  }, ox - (HW + VW) / 2 - 0.25, o.y + PRES_Y + 0.85, oz + 29.15);
  objects.add(lamp);

  // ---------------- depósito ----------------
  {
    const y = PRES_Y, cx = (HW + VW) / 2;
    // imagens velhas cobertas com lençol (peças à parte: no capítulo 9 elas saem andando)
    for (const [x, z, h] of SHEETS) {
      const g = part(ctx, k => sheetFigure(k, h), ox + cx + x, o.y + y, oz + z);
      objects.add(g); sheets.push(g);
      sheetCols.push(K.round(cx + x, z, 0.4, y, y + h));
    }
    // bancos quebrados empilhados e caixas
    for (let i = 0; i < 3; i++) K.box('woodDark', cx + 0.45, y + i * 0.42, 30.0, 3.0, 0.08, 0.4, 0.05 * i, { col: gray(0.35) });
    for (const dx of [-1.0, 0.4, 1.8]) K.box('woodDark', cx - 0.6 + dx, y, 30.0, 0.06, 0.84, 0.36, 0, { col: gray(0.3) });
    K.hit(cx + 0.45, 30.0, 1.5, 0.3, 0, y, y + 1.3);
    for (const [x, z, s] of [[cx + 1.4, 28.4, 0.7], [cx + 1.3, 29.2, 0.6], [cx + 1.45, 28.8, 0.5]]) {
      K.box('woodPlank', x, y + (z === 28.8 ? 0.7 : 0), z, s, s * 0.7, s * 0.7, 0.1, { col: gray(0.55) });
    }
    K.hit(cx + 1.4, 28.8, 0.45, 0.8, 0, y, y + 1.2);
  }

  // ---------------- a gata Mimi (pedido da Dona Hilda): escondida na torre ----------------
  const mimi = part(ctx, k => {
    const grayC = [0.42, 0.42, 0.44], dark = [0.28, 0.28, 0.3];
    k.box('carPaint', 0, 0.06, 0, 0.18, 0.16, 0.34, 0, { col: grayC });
    k.box('carPaint', 0, 0.12, 0.2, 0.16, 0.14, 0.14, 0, { col: grayC });
    for (const s of [-1, 1]) k.prism('carPaint', [s * 0.05, 0.26, 0.21], [s * 0.05, 0.32, 0.2], 0.03, 0.005, 3, dark, true);
    k.box('int:i:eyes', 0.035, 0.18, 0.272, 0.025, 0.02, 0.01, 0, {});
    k.box('int:i:eyes', -0.035, 0.18, 0.272, 0.025, 0.02, 0.01, 0, {});
    k.beam('carPaint', [0.05, 0.08, -0.16], [0.18, 0.06, -0.3], 0.035, 0.035, dark);
    k.beam('carPaint', [0.18, 0.06, -0.3], [0.12, 0.05, -0.42], 0.03, 0.03, dark);
    for (const [x, z] of [[-0.06, 0.13], [0.06, 0.13], [-0.06, -0.12], [0.06, -0.12]]) k.box('carPaint', x, 0, z, 0.05, 0.07, 0.05, 0, { col: dark });
  }, ox - 2.1, o.y + BELL_Y, oz + 3.25);
  mimi.rotation.y = 2.4;
  objects.add(mimi);
  anim.push((dt, t) => { mimi.children[0].position.y = Math.max(0, Math.sin(t * 1.3)) * 0.004; mimi.rotation.y = 2.4 + Math.sin(t * 0.4) * 0.15; });

  // ---------------- pontos ----------------
  const points = {
    spawn: pt(0, 2.6, 0),
    sacristyIn: pt(-HW + 2.0, (SAC_DOOR[0] + SAC_DOOR[1]) / 2, Math.PI / 2, PRES_Y),
    lampiao: pt(-(HW + VW) / 2 - 0.25, 29.15, 0, PRES_Y + 0.85),
    altar: pt(0, 34.1, 0, AY),
    padre: pt(0.95, 34.0, Math.PI, PRES_Y),
    castical: pt(0, 35.05, 0, AY + 1.04),
    nave: pt(0, 16, 0),
    corredor: pt(0, 21, Math.PI),
    coro: pt(0, 5.1, Math.PI, CORO_Y),
    sino: pt(0, 2.5, 0, BELL_Y),
    sinoPe: pt(1.9, 1.4, -1.2, BELL_Y),
    mimi: pt(-2.1, 3.25, 0, BELL_Y),
    agua: pt(1.75, TD + 0.2, Math.PI, 1.0),
    fotoAltar: pt(-(HW + VW) / 2 + 0.55, PRES_Z - 0.4, Math.PI, 1.01),
    sacristiaArmario: pt(-(HW + VW) / 2 + 1.2, NAVE_Z - 0.5, Math.PI, PRES_Y + 2.42),
    deposito: pt((HW + VW) / 2, 30.5, Math.PI, PRES_Y),
    // diante do confessionário (parede da direita), virado para a nave
    confessionario: pt(-HW + 1.55, 12.4, Math.PI / 2),
    // cantos do presbitério, atrás da mesa de comunhão; lamparina
    presbR: pt(-2.7, 28.0, 0, PRES_Y), presbL: pt(2.7, 28.0, 0, PRES_Y), lamparina: pt(-1.7, 34.2, 0, PRES_Y),
    // a escada da torre no coro e o pé da escada do coro
    coroTorre: pt(1.75, 4.8, Math.PI, CORO_Y), escadaCoro: pt(7.75, 13.0, Math.PI, 0),
    ambush1: pt(-2.5, 12, 0), ambush2: pt(3.0, 20, Math.PI), ambush3: pt(0, 25, Math.PI),
  };

  // ---------------- saídas: portal e porta da sacristia (para fora da igreja de verdade) ----------------
  const ch = ctx.landmarks.church, cc = Math.cos(ch.rot), cs = Math.sin(ch.rot), hl = CHURCH.L / 2;
  const cf = (lx, lz) => [ch.x + lx * cc + lz * cs, ch.z - lx * cs + lz * cc];
  const outMain = cf(0, hl + 2.4), outSac = cf(CHURCH.W / 2 + 1.6, SACRISTY_DOOR_Z);
  const exits = [
    { x: ox, z: oz + 0.75, r: 1.5, label: 'SAIR', to: { x: outMain[0], z: outMain[1], h: ch.rot } },
    { x: ox - HW + 0.75, z: oz + (SAC_DOOR[0] + SAC_DOOR[1]) / 2, r: 1.1, label: 'SAIR', to: { x: outSac[0], z: outSac[1], h: ch.rot + Math.PI / 2 } },
  ];

  // ---------------- animação, chamas e luz de dia/noite ----------------
  const flames = anim.flames || [];
  const vitralU = M['int:i:vitral'].uniforms.uColor.value;
  const def = {
    title: 'IGREJA MATRIZ',
    bounds: { x0: ox - HW - 0.2, x1: ox + HW + 0.2, z0: oz - 0.2, z1: oz + NAVE_Z + APSE_R + 0.2 },
    floorY: o.y,
    spawn: { x: points.spawn.x, z: points.spawn.z, h: 0, y: o.y },
    exits,
    lights,
    lightsAll: lights,
    light: name => L[name],
    points,
    objects,
    day: false,
    // de dia (a tarde do capítulo 1 e o amanhecer) entra a luz dourada dos vitrais
    atmoFor(outside) { def.day = outside === 'ensolarado' || outside === 'tarde' || outside === 'amanhecer' || outside === 'anoitecer'; return def.day ? 'igrejaDia' : 'igreja'; },
    // peças que a história mexe
    silver, silverFlames, lamp, mimi, lamparina, sheets,
    // de local (planta da igreja) para o mundo
    local: (x, z, y = 0) => ({ x: ox + x, y: o.y + y, z: oz + z }),
    // dark: velas, lustres e lamparina apagados (sobra o luar das janelas da torre e do depósito)
    dark: false,
    lamparinaLit: false,   // no escuro, a lamparina reacesa (capítulo 9)
    // imagens do depósito fora do lugar (o capítulo 9 usa as dele)
    sheetsAway(on) { for (const g of sheets) g.visible = !on; for (const c of sheetCols) { if (on) { c.y0s = c.y0; c.y1s = c.y1; c.y0 = c.y1 = -1e9; } else if (c.y0s !== undefined) { c.y0 = c.y0s; c.y1 = c.y1s; } } },
    hide(name, on = false) { const o2 = def[name]; if (o2) o2.visible = on; if (name === 'silver') for (const f of silverFlames) f.userData.off = !on; },
    ring() { bellState.t = 0; bellState.amp = Math.max(bellState.amp, 0.45); },
    update(dt, t, active) {
      if (!active) return;
      for (const f of anim) f(dt, t);
      const k = def.day ? 1.0 : def.dark ? 0.18 : 0.32;
      vitralU.setRGB(k, k * 0.95, k * (def.day ? 0.85 : 1.15));
      rays.visible = def.day && !def.dark;
      def.lights = def.dark ? lights.filter(l => DARK_LIGHTS.has(l.name)) : lights;
      lamparina.visible = !def.dark || def.lamparinaLit;
    },
  };
  anim.push((dt, t) => {
    for (const f of flames) {
      const l = f.light ? L[f.light] : null, kk = l ? lightK(l, t) : 1;
      const s = (0.85 + 0.15 * Math.sin(t * 9 + f.ph) + 0.08 * Math.sin(t * 23 + f.ph * 2)) * (0.5 + 0.5 * kk);
      f.obj.visible = !def.dark && !f.obj.userData.off;
      if (f.obj.parent?.visible !== false) f.obj.scale.set(s, s * (0.9 + 0.2 * Math.sin(t * 13 + f.ph)), s);
    }
  });
  return def;
}

// ---------------------------------------------------------------------------
// peças
// ---------------------------------------------------------------------------
function column(K, x, z) {
  K.box('granite', x, 0, z, 0.9, 0.35, 0.9, 0, { col: gray(0.7) });
  K.prism('granite', [x, 0.35, z], [x, 0.6, z], 0.42, 0.36, 8, gray(0.75), false);
  K.prism('plPink', [x, 0.6, z], [x, VS - 0.7, z], 0.32, 0.3, 8, PINK, false, 2);
  K.prism('plPink', [x, VS - 0.7, z], [x, VS - 0.35, z], 0.3, 0.46, 8, PINK.map(c => c * 1.05), false);
  K.box('plPink', x, VS - 0.35, z, 0.95, 0.35, 0.95, 0, { col: PINK });
  K.round(x, z, 0.42, 0, VS);
}

function pew(K, x, z, w) {
  const c = [0.4, 0.3, 0.24];
  K.box('woodBench', x, 0.42, z, w, 0.07, 0.42, 0, { col: c });
  K.box('woodBench', x, 0.12, z - 0.05, w - 0.1, 0.05, 0.14, 0, { col: c.map(v => v * 0.8) });
  const F = K.frame(x, 0.5, z + 0.22, 0, -0.12);
  F.box('woodBench', 0, 0, 0, w, 0.52, 0.06, c, 1, '');
  K.box('woodBench', x, 0.98, z - 0.3, w, 0.05, 0.12, 0, { col: c.map(v => v * 0.9) });
  for (const s of [-1, 1]) {
    K.box('woodBench', x + s * (w / 2 - 0.03), 0, z, 0.06, 1.02, 0.6, 0, { col: c.map(v => v * 0.85) });
    K.prism('woodBench', [x + s * (w / 2 - 0.03), 1.02, z], [x + s * (w / 2 - 0.03), 1.1, z], 0.05, 0.02, 4, c, true);
  }
  K.hit(x, z, w / 2, 0.32, 0, 0, 1.05);
}

function chair(K, x, z, rot, y = 0, big = false) {
  const F = K.frame(x, y, z, rot), c = [0.4, 0.3, 0.22], h = big ? 1.5 : 0.95;
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) F.box('woodDark', dx, 0, dz, 0.05, 0.45, 0.05, c);
  F.box(big ? 'awnRed' : 'woodDark', 0, 0.45, 0, 0.48, 0.05, 0.48, big ? [0.55, 0.15, 0.12] : c);
  F.box('woodDark', 0, 0.45, -0.22, 0.48, h - 0.45, 0.05, c);
  K.round(x, z, 0.32, y, y + 1.0);
}

// degraus visuais de um lance ao longo de x (de xa a xb), entre za e zb, subindo de ya a yb
function stairs(K, xa, xb, za, zb, ya, yb, axis) {
  const n = Math.round((yb - ya) / 0.2), dx = (xb - xa) / n, dy = (yb - ya) / n;
  for (let i = 0; i < n; i++) {
    const x = xa + dx * (i + 0.5), y = ya + dy * (i + 1);
    K.box('woodPlank', x, y - 0.05, (za + zb) / 2, Math.abs(dx) + 0.02, 0.05, zb - za, 0, { col: gray(0.5) });
    K.box('woodDark', xa + dx * i, y - dy, (za + zb) / 2, 0.03, dy, zb - za, 0, { col: gray(0.32) });
  }
  K.beam('woodDark', [xa, ya - 0.15, za], [xb, yb - 0.15, za], 0.06, 0.25, gray(0.35));
  K.beam('woodDark', [xa, ya - 0.15, zb], [xb, yb - 0.15, zb], 0.06, 0.25, gray(0.35));
}

// imagem de santo de gesso: túnica, ombros, braços com as mãos juntas, cabeça e auréola
function figure(K, x, y, z, robe, o = {}) {
  const skin = [0.88, 0.74, 0.62], gold = [1.05, 0.88, 0.45], mantle = o.mantle || robe, s = o.scale || 1, Y = v => y + v * s;
  K.prism('marble', [x, y, z], [x, Y(0.12), z], 0.24 * s, 0.24 * s, 8, gray(0.85), true);
  K.prism('carPaint', [x, Y(0.12), z], [x, Y(0.62), z], 0.21 * s, 0.15 * s, 10, robe, false);
  K.prism('carPaint', [x, Y(0.62), z], [x, Y(0.98), z], 0.15 * s, 0.17 * s, 10, mantle, false);
  K.prism('carPaint', [x, Y(0.98), z], [x, Y(1.04), z], 0.17 * s, 0.07 * s, 10, mantle, true);
  // braços dobrados para a frente e as mãos juntas no peito
  for (const sd of [-1, 1]) {
    K.beam('carPaint', [x + sd * 0.15 * s, Y(0.98), z], [x + sd * 0.13 * s, Y(0.72), z - 0.04 * s], 0.07 * s, 0.07 * s, mantle);
    K.beam('carPaint', [x + sd * 0.13 * s, Y(0.72), z - 0.04 * s], [x + sd * 0.03 * s, Y(0.8), z - 0.15 * s], 0.06 * s, 0.06 * s, mantle);
  }
  K.box('carPaint', x, Y(0.77), z - 0.17 * s, 0.07 * s, 0.11 * s, 0.05 * s, 0, { col: skin });
  // cabeça (véu ou cabelo atrás) e auréola dourada
  K.prism('carPaint', [x, Y(1.04), z], [x, Y(1.08), z], 0.05 * s, 0.05 * s, 6, skin, false);
  K.prism('carPaint', [x, Y(1.08), z], [x, Y(1.26), z], 0.08 * s, 0.07 * s, 8, skin, true);
  K.prism('carPaint', [x, Y(1.06), z + 0.03 * s], [x, Y(1.3), z + 0.03 * s], 0.095 * s, 0.07 * s, 8, o.veil || [0.3, 0.22, 0.16], true);
  K.box('carPaint', x, Y(1.12), z - 0.075 * s, 0.1 * s, 0.13 * s, 0.03 * s, 0, { col: skin });
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2, r = 0.15 * s, cy = Y(1.2);
    K.beam('bronze', [x + Math.cos(a0) * r, cy + Math.sin(a0) * r, z + 0.09 * s], [x + Math.cos(a1) * r, cy + Math.sin(a1) * r, z + 0.09 * s], 0.02 * s, 0.02 * s, gold);
  }
}

// Nossa Senhora Auxiliadora: vestido rosa, manto e véu azuis, coroa, o Menino no braço
function madonna(K, x, y, z) {
  const blue = [0.2, 0.3, 0.62], rose = [0.82, 0.56, 0.56], gold = [1.05, 0.88, 0.45];
  figure(K, x, y, z, rose, { mantle: blue, veil: blue, scale: 1.25 });
  K.prism('bronze', [x, y + 1.62, z + 0.02], [x, y + 1.76, z + 0.02], 0.08, 0.1, 8, gold, false);
  K.prism('carPaint', [x + 0.17, y + 0.95, z - 0.12], [x + 0.17, y + 1.18, z - 0.12], 0.07, 0.06, 6, [0.95, 0.92, 0.85], true);
  K.prism('carPaint', [x + 0.17, y + 1.18, z - 0.12], [x + 0.17, y + 1.29, z - 0.12], 0.05, 0.05, 6, [0.88, 0.74, 0.62], true);
}

function saint(K, x, y, z, robe) { figure(K, x, y, z, robe); }

// Sagrado Coração: manto vermelho, coração dourado no peito
function heart(K, x, y, z) {
  figure(K, x, y, z, [0.86, 0.84, 0.78], { mantle: [0.62, 0.14, 0.14] });
  K.box('bronze', x, y + 0.86, z - 0.17, 0.09, 0.09, 0.03, 0, { col: [1.25, 0.75, 0.25] });
}
