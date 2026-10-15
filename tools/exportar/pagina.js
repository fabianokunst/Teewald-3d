// Gera o .glb do protagonista sem montar a cidade (só as fotos que o atlas usa) e entrega
// os bytes em window.__exportado (base64). Quem chama é tools/exportar.mjs (npm run exportar).
import { loadImage, HERO_FILES } from '../../src/engine/textures.js';
import { exportHero } from '../../src/engine/exporter.js';

try {
  await Promise.all(Object.values(HERO_FILES).map(loadImage));
  const glb = new Uint8Array(await exportHero({ baixar: false }));
  let s = '';
  for (let i = 0; i < glb.length; i += 0x8000) s += String.fromCharCode(...glb.subarray(i, i + 0x8000));
  window.__exportado = { glb: btoa(s) };
} catch (e) {
  window.__exportado = { erro: String(e.stack || e) };
}
