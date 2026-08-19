import { defineConfig } from 'vitest/config';

/** MatchView in real browsers. `pnpm test:browsers`. */
export default defineConfig({
  test: {
    name: 'render-browser',
    include: ['browser/**/*.browser.test.ts'],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      screenshotFailures: false,
      viewport: { width: 1280, height: 720 },
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
