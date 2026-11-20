import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'scenario', include: ['src/**/*.test.ts'] },
});
