import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// O site do jogo (pasta site/) é HTML estático, separado do jogo: no build ele vai inteiro,
// sem passar pelo Vite, para dist/site/ (no GitHub Pages: .../Teewald-3d/site/).
let saida = 'dist';
const copiaSite = {
  name: 'copia-site',
  apply: 'build',
  configResolved(c) { saida = path.resolve(c.root, c.build.outDir); },
  closeBundle() {
    fs.cpSync(fileURLToPath(new URL('./site', import.meta.url)), path.join(saida, 'site'), { recursive: true });
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
