import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Static site, deployed to GitHub Pages behind Cloudflare (BRIEF §8 Phase 9).
// `base` becomes '/bullyoff/' at Phase 9 if served from a project page.
export default defineConfig({
  plugins: [vue()],
  worker: { format: 'es' }, // the engine runs in a Web Worker (ADR-008)
  build: { target: 'es2022' },
});
