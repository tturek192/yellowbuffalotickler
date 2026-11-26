import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// The engine's Web Workers (src/sim/worker.ts) are ES module workers, in development and in the build.
// base './' makes dist/ work from any sub-path. Two pages: the Vimy simulator (index.html) and the sandbox (sandbox.html).
export default defineConfig({
  base: './', plugins: [react()], worker: { format: 'es' },
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), sandbox: resolve(__dirname, 'sandbox.html') } } },
});
