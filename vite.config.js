import { defineConfig } from 'vite';

export default defineConfig({
  server: {
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
