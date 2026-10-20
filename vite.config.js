import { defineConfig } from 'vite';
import { execFile } from 'node:child_process';

const checkTool = (name) => new Promise((resolve) => {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  execFile(lookup, [name], { timeout: 1500, windowsHide: true }, (error, stdout) => {
    resolve({ name, available: !error && Boolean(stdout.trim()) });
  });
});

function localEdaStatus() {
  return {
    name: 'local-eda-status',
    configureServer(server) {
      server.middlewares.use('/api/eda/status', async (_request, response) => {
        try {
          const tools = await Promise.all(['openlane', 'yosys', 'openroad', 'klayout', 'magic', 'docker', 'wsl'].map(checkTool));
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({ tools }));
        } catch {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: 'Could not inspect local EDA tools.' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [localEdaStatus()],
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
