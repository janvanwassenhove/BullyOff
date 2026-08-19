import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// Static site (BRIEF §8 Phase 9): GitHub Pages project page → base '/BullyOff/' (override with BASE_PATH).
// Everything is local after first load: the app shell, the engine worker and the season worker are
// precached; there are no external requests to cache (ADR-006: no telemetry, no CDN).
const base = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BULLY OFF — hockey coach',
        short_name: 'BULLY OFF',
        description: 'Field-hockey coach/manager on a deterministic match engine. Fictional world, fully offline.',
        theme_color: '#0e1116',
        background_color: '#0e1116',
        display: 'standalone',
        orientation: 'any',
        lang: 'en',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // the engine+season worker chunks are large-ish
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' }, // the engine runs in a Web Worker (ADR-008)
  build: { target: 'es2022' },
});
