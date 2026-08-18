import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'render', environment: 'node', include: ['src/**/*.{test,spec}.ts'] },
});
