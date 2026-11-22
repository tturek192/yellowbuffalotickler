import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine's Web Workers (src/sim/worker.ts) are ES module workers, in development and in the build.
export default defineConfig({ plugins: [react()], worker: { format: 'es' } });
