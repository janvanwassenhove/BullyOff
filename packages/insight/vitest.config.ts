import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'insight', environment: 'node', include: ['src/**/*.{test,spec}.ts'] },
});
