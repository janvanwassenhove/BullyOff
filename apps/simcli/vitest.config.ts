import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'simcli', environment: 'node', include: ['src/**/*.{test,spec}.ts'] },
});
