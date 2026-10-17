import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { derivados } from './tools/site/markdown.mjs';

// O site do jogo (pasta site/) é HTML estático, separado do jogo: no build ele vai inteiro,
// sem passar pelo Vite, para dist/site/ (no GitHub Pages: .../Teewald-3d/site/).
// As versões para LLMs (*.html.md, llms.txt, llms-full.txt) são refeitas do HTML publicado.
// O sitemap.xml e os llms*.txt também vão para a raiz (.../Teewald-3d/), onde o sitemap pode
// listar o jogo e o site juntos (um sitemap só vale para o que está na pasta dele ou abaixo).
let saida = 'dist';
const copiaSite = {
  name: 'copia-site',
  apply: 'build',
  configResolved(c) { saida = path.resolve(c.root, c.build.outDir); },
  closeBundle() {
    const site = fileURLToPath(new URL('./site', import.meta.url));
    const destino = path.join(saida, 'site');
    fs.cpSync(site, destino, { recursive: true, filter: f => path.relative(site, f) !== 'sitemap.xml' });
    const arquivos = derivados(site);
    for (const [nome, texto] of Object.entries(arquivos)) fs.writeFileSync(path.join(destino, nome), texto);
    for (const nome of ['llms.txt', 'llms-full.txt']) fs.writeFileSync(path.join(saida, nome), arquivos[nome]);
    fs.copyFileSync(path.join(site, 'sitemap.xml'), path.join(saida, 'sitemap.xml'));
  },
};

// A pasta "texture" do projeto é servida como pasta pública:
// "texture/Roofs/Roofs_04-256x256.png" fica acessível em "/Roofs/Roofs_04-256x256.png".
export default defineConfig({
  base: './',
  publicDir: 'texture',
  server: { port: 5173 },
  plugins: [copiaSite],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
