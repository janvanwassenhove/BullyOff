import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'season', environment: 'node', include: ['src/**/*.{test,spec}.ts'], testTimeout: 120_000 },
});
