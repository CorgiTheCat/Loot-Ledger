import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { host: '0.0.0.0', cors: { origin: 'https://www.owlbear.rodeo' } },
  preview: { host: '0.0.0.0', cors: { origin: 'https://www.owlbear.rodeo' } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        background: resolve(process.cwd(), 'background.html'),
        loot: resolve(process.cwd(), 'loot.html'),
      },
    },
  },
});
