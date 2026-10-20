import { defineConfig } from 'vite';
import { createEdaPlugin } from './scripts/edaRunner.js';

export default defineConfig({
  plugins: [createEdaPlugin()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/')) return 'three-vendor';
        }
      }
    }
  }
});
