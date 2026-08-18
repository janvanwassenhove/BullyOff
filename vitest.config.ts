import { defineConfig } from 'vitest/config';

// One root runner over every workspace package. Each package may add its own
// vitest.config.ts for environment overrides (e.g. jsdom for render/manager);
// the engine, rules, shared and worldgen packages must stay on the `node`
// environment so nothing DOM-shaped can accidentally leak into tick().
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'tools/*'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.d.ts'],
    },
  },
});
