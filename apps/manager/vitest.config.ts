import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: { name: 'manager', environment: 'node', include: ['src/**/*.{test,spec}.ts'] },
});
