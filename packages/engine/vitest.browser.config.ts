import { defineConfig } from 'vitest/config';

/** Cross-browser determinism harness. `pnpm test:browsers` — see ADR-005 / ADR-010. */
export default defineConfig({
  test: {
    name: 'engine-browser',
    include: ['browser/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
