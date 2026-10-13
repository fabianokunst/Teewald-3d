import * as THREE from 'three';
import { makeArchTextures } from './archTextures.js';
import { makeCarTextures } from './carTextures.js';

// Carrega as texturas da pasta "texture" do projeto e reduz para resolução de PS1
// (64/128 px, filtro nearest, cor de 15 bits).

const BASE = import.meta.env.BASE_URL;
export const TEX = {};
export const IMG = {};

export function loadImage(path) {
  if (IMG[path]) return Promise.resolve(IMG[path]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { IMG[path] = img; resolve(img); };
    img.onerror = () => reject(new Error('Falha ao carregar textura: ' + path));
    img.src = BASE + path.split('/').map(encodeURIComponent).join('/');
  });
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// qualidade das texturas: 'clean' (3D limpo: filtro suave, mipmaps, mais resolução)
// ou 'ps1' (64/128 px, filtro nearest, cor de 15 bits)
let QUALITY = 'ps1';
let ANISO = 1;
const ALL = new Set();
const DEF_TEX = {};
export function setAnisotropy(n) { ANISO = Math.max(1, Math.min(8, n || 1)); }

function applyFilter(t) {
  if (QUALITY === 'clean') {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = ANISO;
  } else {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.anisotropy = 1;
  }
}

export function canvasTex(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  applyFilter(t);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  ALL.add(t);
  return t;
}

// troca a qualidade de todas as texturas (as da pasta são refeitas no tamanho novo)
export function setTextureQuality(q) {
  QUALITY = q;
  const f = q === 'clean' ? 2 : 1;
  for (const [name, file, w, h, o] of DEFS) {
    const t = DEF_TEX[name], img = IMG[file];
    if (!t || !img) continue;
    const cw = o.crop ? o.crop[2] : img.width, ch = o.crop ? o.crop[3] : img.height;
    const c = shrink(img, Math.max(1, Math.min(Math.round(w * f), cw)), Math.max(1, Math.min(Math.round(h * f), ch)), o.crop);
    processPixels(c, o);
    t.dispose();
    t.image = c;
  }
  for (const t of ALL) { t.dispose(); applyFilter(t); t.needsUpdate = true; }
}

// reduz uma imagem (ou recorte) para w x h com média de área
export function shrink(img, w, h, crop) {
  const [sx, sy, sw, sh] = crop || [0, 0, img.width, img.height];
  let src = img, cx = sx, cy = sy, cw = sw, ch = sh;
  // reduz em etapas de 2x para uma média melhor
  while (cw / 2 >= w * 1.5 && ch / 2 >= h * 1.5) {
    const tmp = makeCanvas(Math.round(cw / 2), Math.round(ch / 2));
    const g = tmp.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, cx, cy, cw, ch, 0, 0, tmp.width, tmp.height);
    src = tmp; cx = 0; cy = 0; cw = tmp.width; ch = tmp.height;
  }
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, cx, cy, cw, ch, 0, 0, w, h);
  return c;
}

// pós-processo de pixels: tingimento, recorte de alfa (color key) e cor de 15 bits
export function processPixels(canvas, o = {}) {
  const g = canvas.getContext('2d');
  const d = g.getImageData(0, 0, canvas.width, canvas.height);
  const p = d.data;
  const tint = o.tint, sat = o.saturate ?? 1, bright = o.bright ?? 1, contrast = o.contrast ?? 1;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    if (sat !== 1) {
      const l = r * 0.3 + gg * 0.59 + b * 0.11;
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
    }
    if (contrast !== 1) { r = 128 + (r - 128) * contrast; gg = 128 + (gg - 128) * contrast; b = 128 + (b - 128) * contrast; }
    if (tint) { r *= tint[0]; gg *= tint[1]; b *= tint[2]; }
    r *= bright; gg *= bright; b *= bright;
    // 15 bits (5 por canal) só no estilo PS1
    const q = QUALITY === 'ps1' ? 8 : 1;
    p[i] = Math.min(255, Math.max(0, Math.round(r / q) * q));
    p[i + 1] = Math.min(255, Math.max(0, Math.round(gg / q) * q));
    p[i + 2] = Math.min(255, Math.max(0, Math.round(b / q) * q));
    if (o.alpha) p[i + 3] = p[i + 3] > (o.alphaCut ?? 120) ? 255 : 0;
    else p[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return canvas;
}

// [nome, arquivo, largura, altura, opções]
const DEFS = [
  // chão
  ['grass', 'Grass/Grass_11-256x256.png', 128, 128, { saturate: 0.85, tint: [1.05, 1, 0.85] }],
  ['grassDry', 'Grass/Grass_13-256x256.png', 128, 128, { tint: [1.05, 0.98, 0.85] }],
  ['lawn', 'Grass/Grass_02-256x256.png', 128, 128, { saturate: 0.8, tint: [1, 0.95, 0.8] }],
  ['leaves', 'ScatteredLeaves008_1K-JPG_Color.jpg', 128, 128, {}],
  ['dirt', 'Ground070_1K-JPG_Color.jpg', 128, 128, { saturate: 0.75, bright: 0.92 }],
  ['mud', 'Dirt/Dirt_09-256x256.png', 64, 64, { bright: 0.9 }],
  ['field', 'Grass/Grass_23-256x256.png', 128, 128, { saturate: 0.7, tint: [1.05, 1, 0.8] }],
  // ruas e calçadas
  ['asphalt', 'Asphalt026C_1K-JPG_Color.jpg', 128, 128, { bright: 1.45, saturate: 0.6 }],
  ['sett', 'PavingStones142_1K-JPG_Color.jpg', 128, 128, {}],
  ['pavers', 'Tile/Tile_01-256x256.png', 64, 64, { saturate: 0.45, bright: 1.05 }],
  ['stonePath', 'PavingStones138_1K-JPG_Color.jpg', 64, 128, {}],
  ['herring', 'tile2/Tile_17-256x256.png', 64, 64, { saturate: 0.85 }],
  ['concrete', 'Concrete/Mat_Concrete_Gray_01-256x256.png', 64, 64, {}],
  ['concreteW', 'Concrete/Mat_Concrete_White_01-256x256.png', 64, 64, {}],
  // paredes
  ['plWhite', 'Plaster/Mat_Plaster_White_01-256x256.png', 64, 64, {}],
  ['plCream', 'Plaster/Mat_Plaster_White_02-256x256.png', 64, 64, { tint: [1.04, 0.99, 0.84] }],
  ['plChurch', 'Plaster/Mat_Plaster_White_02-256x256.png', 64, 64, { tint: [1.06, 1.02, 0.92], bright: 1.05 }],
  ['plYellow', 'Plaster/Mat_Plaster_Yellow_01-256x256.png', 64, 64, { saturate: 0.8 }],
  ['plPink', 'Plaster/Mat_Plaster_Red_02-256x256.png', 64, 64, { saturate: 0.7, bright: 1.05 }],
  ['plGreen', 'Plaster/Plaster_11-256x256.png', 64, 64, { saturate: 0.45, bright: 1.15 }],
  ['plBlue', 'Plaster/Mat_Plaster_White_03-256x256.png', 64, 64, { tint: [0.8, 0.9, 1.0] }],
  ['plGray', 'Plaster/Mat_Plaster_Gray_02-256x256.png', 64, 64, {}],
  ['plBeige', 'Plaster/Mat_Plaster_White_04-256x256.png', 64, 64, { tint: [1.0, 0.92, 0.78] }],
  ['plOchre', 'Plaster/Plaster_07-256x256.png', 64, 64, { saturate: 0.8 }],
  ['brick', 'Bricks/Bricks_22-256x256.png', 64, 64, {}],
  ['brickOld', 'Murano-Bricks-Red-_B01.jpg', 64, 64, {}],
  ['stoneWall', 'Stone/Photoreal_Stone_03-512x512.png', 64, 64, { saturate: 0.7, bright: 1.1 }],
  ['stoneBase', 'Bricks/Bricks_17-256x256.png', 64, 64, {}],
  ['woodSiding', 'wood2/Wood_13-256x256.png', 64, 64, {}],
  ['woodPlank', 'wood2/Wood_07-256x256.png', 64, 64, {}],
  ['woodGray', 'Wood/Wood_17-256x256.png', 64, 64, {}],
  ['woodDark', 'Wood/Wood_09-256x256.png', 64, 64, {}],
  ['woodBench', 'Wood/Wood_13-256x256.png', 64, 64, { saturate: 0.8, bright: 0.85 }],
  ['woodBlue', 'Wood/Mat_Wood_White_01-256x256.png', 64, 64, { tint: [0.66, 0.8, 0.95] }],
  ['metalRoof', 'Metal/Metal_05-256x256.png', 64, 64, {}],
  ['metalWall', 'Metal/Metal_06-256x256.png', 64, 64, { bright: 1.1 }],
  ['metalGray', 'Metal/Metal_19-256x256.png', 64, 64, {}],
  ['metalWhite', 'Metal/Metal_01-256x256.png', 64, 64, {}],
  ['metalRust', 'Metal/Metal_23-256x256.png', 64, 64, { saturate: 0.8 }],
  ['grating', 'Grating/Grating_11-256x256.png', 64, 64, {}],
  ['awnRed', 'Cloth/Cloth_02-256x256.png', 32, 32, { saturate: 0.8 }],
  ['awnBlue', 'Cloth/Cloth_01-256x256.png', 32, 32, { saturate: 0.8 }],
  ['awnCream', 'Cloth/Cloth_03-256x256.png', 32, 32, {}],
  ['fenceGrid', 'gradeado.png', 64, 64, { alpha: true, repeat: true }],
  // telhados
  ['roofRed', 'Roofs/Roofs_10-256x256.png', 64, 64, { saturate: 0.85 }],
  ['roofOrange', 'Roofs/Roofs_05-256x256.png', 64, 64, { saturate: 0.8 }],
  ['roofBrown', 'Roofs/Roofs_09-256x256.png', 64, 64, {}],
  ['roofClay', '0e64b64e45869f79ed1652e4bb35367e.jpg', 64, 64, {}],
  ['roofOld', 'old-roof-tiles-MSUF00407.jpg', 64, 64, {}],
  ['roofDark', 'Roofs/Roofs_16-256x256.png', 64, 64, {}],
  ['roofSlate', 'Roofs/Roofs_19-256x256.png', 64, 64, { saturate: 0.6 }],
  ['roofTerra', 'RoofingTiles014C_1K-JPG_Color.jpg', 64, 64, {}],
  // vegetação
  ['araucaria', 'leaf/araucarua.png', 128, 128, { alpha: true }],
  ['araucariaBranch', 'araucaria-leafs copiar.png', 64, 64, { alpha: true }],
  ['crownAutumn', 'leaf/vecteezy_3d-top-view-green-trees-isolated-on-pngs-transparent_39095608.png', 128, 128, { alpha: true }],
  ['crownGreen', 'leaf/leaf1.png', 128, 128, { alpha: true, saturate: 0.85 }],
  ['bush', 'leaf/leaf2.png', 64, 64, { alpha: true, saturate: 0.8, tint: [1.05, 1, 0.8] }],
  ['hortensia', 'leaf/hortencias.png', 64, 64, { alpha: true }],
  ['pine', 'leaf/pinheiro.png', 64, 128, { alpha: true }],
  ['cypress', 'leaf/planta-vaso.png', 32, 128, { alpha: true, saturate: 0.8 }],
  ['mapleLeaf', 'leaf/xmapple-leaf.png.pagespeed.ic_old.png', 32, 32, { alpha: true }],
  ['hedge', 'leaf/arbusto.png', 64, 64, { saturate: 0.8, tint: [1.05, 1, 0.8] }],
  ['barkA', 'Bark004_1K-JPG_Color.jpg', 64, 64, {}],
  ['barkP', 'Trees/Photoreal_Trees_04-512x512.png', 64, 64, {}],
  ['barkD', 'Trees/Photoreal_Trees_08-512x512.png', 64, 64, {}],
  // céu e água
  ['clouds', 'Elements/Elements_05-256x256.png', 128, 128, {}],
  ['water', 'elements2/Elements_17-256x256.png', 64, 64, { saturate: 0.3, tint: [0.5, 0.52, 0.4], contrast: 0.9 }],
  // objetos
  ['pare', 'placa-pare.jpg', 64, 64, {}],
  ['marble', 'Marble/Mat_Marble_White_01-256x256.png', 64, 64, {}],
  ['granite', 'Stone/Mat_Stone_Gray_01-256x256.png', 64, 64, {}],
  ['stoneRock', 'Rocks025_1K-JPG_Color.jpg', 64, 64, {}],
  ['stoneWarm', 'Stone/Mat_Stone_Tan_01-256x256.png', 64, 64, {}],
];

// imagens usadas no atlas do protagonista (game/heroTexture.js)
export const HERO_FILES = {
  jacket: 'Cloth/Mat_Cloth_Canvas_01-256x256.png',
  pants: 'Cloth/Cloth_17-256x256.png',
  shirt: 'Cloth/Mat_Cloth_Canvas_05-256x256.png',
  hair: 'person1.jpg',
};

export async function loadTextures(onProgress, wanted = 'ps1') {
  const files = [...new Set([...DEFS.map(d => d[1]), ...Object.values(HERO_FILES)])];
  let done = 0;
  await Promise.all(files.map(f => loadImage(f).then(() => { done++; onProgress?.(done / files.length); })));
  // as texturas geradas (janelas, portas, enxaimel...) partem sempre das versões PS1
  const quality = wanted;
  QUALITY = 'ps1';
  for (const [name, file, w, h, o] of DEFS) {
    const c = shrink(IMG[file], w, h, o.crop);
    processPixels(c, o);
    TEX[name] = DEF_TEX[name] = canvasTex(c, !o.alpha || o.repeat);
  }
  generateTextures();
  makeArchTextures();
  makeCarTextures();
  if (quality !== 'ps1') setTextureQuality(quality);
  return TEX;
}

// ---------- texturas geradas (as que não existem na pasta) ----------

function pxRect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }

function generateTextures() {
  // cor lisa (pintada pela cor do vértice)
  const flat = makeCanvas(8, 8); pxRect(flat.getContext('2d'), 0, 0, 8, 8, '#ffffff');
  TEX.flat = canvasTex(flat);

  // vidro escuro com reflexo
  const gl = makeCanvas(32, 32), g1 = gl.getContext('2d');
  const grd = g1.createLinearGradient(0, 0, 32, 32);
  grd.addColorStop(0, '#5b6b78'); grd.addColorStop(0.5, '#2c3540'); grd.addColorStop(1, '#1d242c');
  g1.fillStyle = grd; g1.fillRect(0, 0, 32, 32);
  g1.fillStyle = 'rgba(255,255,255,0.18)'; g1.fillRect(4, 2, 6, 28); g1.fillRect(14, 2, 2, 28);
  TEX.glass = canvasTex(processPixels(gl));

  // céu: degradê de fim de tarde + nuvens da pasta + sol
  TEX.sky = canvasTex(makeSky(), true);
  TEX.sky.wrapT = THREE.ClampToEdgeWrapping;

  // sombra redonda
  const bl = makeCanvas(32, 32), g5 = bl.getContext('2d');
  const rg = g5.createRadialGradient(16, 16, 2, 16, 16, 15);
  rg.addColorStop(0, 'rgba(0,0,0,0.8)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g5.fillStyle = rg; g5.fillRect(0, 0, 32, 32);
  TEX.blob = canvasTex(bl, false);

  // vidro de lampião
  const lp = makeCanvas(16, 16), g6 = lp.getContext('2d');
  pxRect(g6, 0, 0, 16, 16, '#ffe9a8'); pxRect(g6, 0, 0, 16, 2, '#222'); pxRect(g6, 0, 14, 16, 2, '#222'); pxRect(g6, 7, 0, 2, 16, '#333');
  TEX.lamp = canvasTex(processPixels(lp));

  // faixa de sinalização
  const ln = makeCanvas(8, 8); pxRect(ln.getContext('2d'), 0, 0, 8, 8, '#e8e2d0');
  TEX.paint = canvasTex(ln);

  // bandeirolas da Kartoffelfest
  const fl = makeCanvas(64, 16), g7 = fl.getContext('2d');
  const cols = ['#c8102e', '#f2c100', '#1e7b3a', '#ffffff', '#1f4fa3', '#e87511'];
  for (let i = 0; i < 8; i++) {
    g7.fillStyle = cols[i % cols.length];
    g7.beginPath(); g7.moveTo(i * 8, 0); g7.lineTo(i * 8 + 8, 0); g7.lineTo(i * 8 + 4, 14); g7.closePath(); g7.fill();
  }
  TEX.flags = canvasTex(processPixels(fl, { alpha: true }), true);

  // cruz / lápide
  const cr = makeCanvas(32, 32), g8 = cr.getContext('2d');
  g8.drawImage(TEX.marble.image, 0, 0, 32, 32);
  g8.fillStyle = 'rgba(40,40,40,0.55)'; g8.fillRect(10, 8, 12, 1); g8.fillRect(8, 12, 16, 1); g8.fillRect(11, 16, 10, 1);
  TEX.headstone = canvasTex(processPixels(cr));

  // globo do monumento
  const gb = makeCanvas(64, 32), g9 = gb.getContext('2d');
  pxRect(g9, 0, 0, 64, 32, '#3c6f9a');
  g9.fillStyle = '#7a9a52';
  [[6, 6, 10, 8], [12, 14, 6, 10], [26, 5, 9, 7], [30, 13, 7, 12], [42, 6, 14, 9], [50, 18, 6, 5]].forEach(r => g9.fillRect(...r));
  g9.fillStyle = 'rgba(255,255,255,0.25)'; for (let x = 0; x < 64; x += 8) g9.fillRect(x, 0, 1, 32); for (let y = 0; y < 32; y += 8) g9.fillRect(0, y, 64, 1);
  TEX.globe = canvasTex(processPixels(gb));

  TEX.bronze = canvasTex(processPixels(noiseFill(16, 16, [120, 88, 52], 18)));
  TEX.iron = canvasTex(processPixels(noiseFill(16, 16, [38, 38, 40], 8)));
  TEX.carPaint = canvasTex(processPixels(noiseFill(16, 16, [235, 235, 235], 6)));
  TEX.tire = canvasTex(processPixels(noiseFill(16, 16, [28, 28, 28], 6)));
}

function noiseFill(w, h, [r, g, b], amp) {
  const c = makeCanvas(w, h), x = c.getContext('2d'), d = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (Math.random() - 0.5) * amp * 2;
    d.data[i * 4] = r + n; d.data[i * 4 + 1] = g + n; d.data[i * 4 + 2] = b + n; d.data[i * 4 + 3] = 255;
  }
  x.putImageData(d, 0, 0); return c;
}

// céu encoberto de fim de tarde (terror): cinza frio, a neblina usa o horizonte
export const SKY = {
  top: [0.27, 0.29, 0.32],
  mid: [0.45, 0.46, 0.47],
  horizon: [0.56, 0.56, 0.54],
};

function makeSky() {
  const W = 256, H = 128;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const toCss = a => `rgb(${a.map(v => Math.round(v * 255)).join(',')})`;
  const grd = g.createLinearGradient(0, 0, 0, H);
  // v: topo da imagem = zênite, meio = horizonte
  grd.addColorStop(0, toCss(SKY.top));
  grd.addColorStop(0.32, toCss(SKY.mid));
  grd.addColorStop(0.5, toCss(SKY.horizon));
  grd.addColorStop(1, toCss(SKY.horizon));
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // nuvens da textura Elements_05: usa o brilho como máscara
  const cl = IMG['Elements/Elements_05-256x256.png'];
  if (cl) {
    const tmp = makeCanvas(W, 48), tg = tmp.getContext('2d');
    tg.drawImage(cl, 0, 0, 256, 96, 0, 0, W, 48);
    const d = tg.getImageData(0, 0, W, 48);
    const sky = g.getImageData(0, 8, W, 48);
    for (let i = 0; i < W * 48; i++) {
      const r = d.data[i * 4], gg = d.data[i * 4 + 1], b = d.data[i * 4 + 2];
      const white = Math.max(0, Math.min(1, ((r + gg) / 2 - b * 0.55) / 120));
      const y = Math.floor(i / W);
      const fade = Math.sin((y / 48) * Math.PI) * 0.85;
      const k = white * fade;
      // nuvens carregadas: mais escuras que o céu
      sky.data[i * 4] += (96 - sky.data[i * 4]) * k * 0.8;
      sky.data[i * 4 + 1] += (98 - sky.data[i * 4 + 1]) * k * 0.8;
      sky.data[i * 4 + 2] += (102 - sky.data[i * 4 + 2]) * k * 0.8;
    }
    g.putImageData(sky, 0, 8);
  }
  return processPixels(c);
}

// placa com texto (gerada)
export function signTexture(text, o = {}) {
  const w = o.w || 128, h = o.h || 32;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = o.bg || '#7a2a1c'; g.fillRect(0, 0, w, h);
  if (o.border !== false) { g.strokeStyle = o.borderColor || '#e8d8b0'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4); }
  g.fillStyle = o.fg || '#f2e6c8';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = o.size || Math.floor(h * 0.55);
  g.font = `bold ${size}px ${o.font || 'Georgia, serif'}`;
  while (g.measureText(text).width > w - 8 && size > 6) { size--; g.font = `bold ${size}px ${o.font || 'Georgia, serif'}`; }
  g.fillText(text, w / 2, h / 2 + 1);
  if (o.sub) { g.font = `${Math.floor(h * 0.22)}px Georgia, serif`; g.fillText(o.sub, w / 2, h * 0.84); }
  return canvasTex(processPixels(c), false);
}
