import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'tools/*',
      'scripts',
      // The engine's CPU budget (packages/engine/src/budget.test.ts): its own project in a later group, so nothing runs
      // beside it. It is skipped unless BUDGET=1: `npm run test:budget` runs it on its own.
      { test: { name: 'engine-budget', root: 'packages/engine', include: ['src/budget.test.ts'], sequence: { groupOrder: 1 } } },
    ],
  },
});
