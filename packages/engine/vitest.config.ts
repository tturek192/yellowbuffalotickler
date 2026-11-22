import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The CPU budget runs in its own project, alone and after every other (vitest.config.ts at the root, engine-budget).
  test: { name: 'engine', include: ['src/**/*.test.ts'], exclude: ['src/budget.test.ts'] },
});
