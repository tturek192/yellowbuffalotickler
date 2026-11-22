import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine's Web Workers (src/sim/worker.ts) are ES module workers, in development and in the build.
// base './' makes dist/ work from any sub-path.
export default defineConfig({ base: './', plugins: [react()], worker: { format: 'es' } });
