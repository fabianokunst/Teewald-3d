import { defineConfig } from 'vite';

// A pasta "texture" do projeto é servida como pasta pública:
// "texture/Roofs/Roofs_04-256x256.png" fica acessível em "/Roofs/Roofs_04-256x256.png".
export default defineConfig({
  base: './',
  publicDir: 'texture',
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
