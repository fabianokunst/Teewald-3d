// Pinta o atlas de cada personagem pedido (?ids=forasteiro,arno) como o jogo pinta, sem montar a
// cidade (só as fotos que o atlas usa), e entrega as imagens em window.__texturas (data URLs).
// Quem chama é tools/texturas.mjs (npm run texturas).
import { loadImage, HERO_FILES, makeCanvas, withTextureQuality } from '../../src/engine/textures.js';
import { makeHeroTexture, ATLAS, REG } from '../../src/game/heroTexture.js';
import { NPC_DEFS } from '../../src/game/npcData.js';

const LADO = 1024;   // lado do atlas ampliado (mapa, partes)

// região do atlas -> [arquivo, rótulo no mapa]
const PARTES = {
  jacket: ['tronco', 'tronco'], sleeve: ['manga', 'manga'], pants: ['perna', 'perna'],
  pelvis: ['quadril', 'quadril'], head: ['cabeca', 'cabeça'], lock: ['mechas', 'mechas'],
  boot: ['calcado', 'calçado'], ear: ['orelha', 'orelha'], skin: ['pescoco', 'pescoço'],
  hand: ['mao', 'mão'], thumb: ['polegar', 'polegar'], collar: ['gola', 'gola'],
  collarIn: ['gola-por-dentro', 'gola (dentro)'], shirt: ['camisa', 'camisa'],
};

// copia (x, y, w, h) da imagem para um canvas novo, ampliado k vezes sem suavizar
function amplia(img, k, x = 0, y = 0, w = img.width, h = img.height) {
  const c = makeCanvas(w * k, h * k), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, w, h, 0, 0, w * k, h * k);
  return c;
}

function mapa(atlas, k, u) {
  const c = amplia(atlas, k), g = c.getContext('2d');
  g.font = 'bold 13px sans-serif';
  g.textBaseline = 'top';
  for (const [nome, [x, y, w, h]] of Object.entries(REG)) {
    const X = x * u * k, Y = y * u * k, W = w * u * k, H = h * u * k, rot = PARTES[nome][1];
    g.lineWidth = 3; g.strokeStyle = 'rgba(0, 0, 0, 0.8)'; g.strokeRect(X + 1.5, Y + 1.5, W - 3, H - 3);
    g.lineWidth = 1; g.strokeStyle = '#ffd24a'; g.strokeRect(X + 1.5, Y + 1.5, W - 3, H - 3);
    const tw = g.measureText(rot).width;
    g.fillStyle = 'rgba(0, 0, 0, 0.75)'; g.fillRect(X + 3, Y + 3, tw + 8, 18);
    g.fillStyle = '#ffd24a'; g.fillText(rot, X + 7, Y + 5);
  }
  return c;
}

const ids = (new URLSearchParams(location.search).get('ids') || 'forasteiro').split(',');
const itens = [], erros = [];
try {
  await Promise.all(Object.values(HERO_FILES).map(loadImage));
  for (const id of ids) {
    const def = NPC_DEFS.find(d => d.id === id);
    if (id !== 'forasteiro' && !def) { erros.push(`"${id}" não existe (use forasteiro ou um id de npcData.js: ${NPC_DEFS.map(d => d.id).join(', ')})`); continue; }
    // look vazio = protagonista (atlas de 256); os moradores saem em 128
    const atlas = withTextureQuality('ps1', () => makeHeroTexture(def?.look)).image;
    const u = atlas.width / ATLAS, k = LADO / atlas.width;
    const partes = {};
    for (const [nome, [x, y, w, h]] of Object.entries(REG)) partes[PARTES[nome][0]] = amplia(atlas, k, x * u, y * u, w * u, h * u).toDataURL();
    itens.push({
      id, lado: atlas.width,
      atlas: atlas.toDataURL(), ampliado: amplia(atlas, k).toDataURL(), mapa: mapa(atlas, k, u).toDataURL(), partes,
    });
  }
} catch (e) {
  erros.push(String(e.stack || e));
}
window.__texturas = { itens, erros };
