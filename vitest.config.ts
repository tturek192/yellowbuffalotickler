import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'tools/*',
      'scripts',
      // The engine's CPU budget (packages/engine/src/budget.test.ts): its own project in a later group, so it runs only
      // once every other project has finished and nothing else runs beside it to load the CPU.
      { test: { name: 'engine-budget', root: 'packages/engine', include: ['src/budget.test.ts'], sequence: { groupOrder: 1 } } },
    ],
  },
});
