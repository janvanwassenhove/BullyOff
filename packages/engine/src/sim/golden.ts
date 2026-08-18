/**
 * Golden hash of the canonical sandbox fixture (seed 42, mens/watered, 600 ticks, sandbox mode).
 * History: 0.1.0 → 60abc0490dcdf885 · 0.2.0 → 4bd0c4840e5778f0 (body contact updates lastTouch).
 * Asserted in Node (determinism.test.ts) AND in Chromium/Firefox/WebKit
 * (browser/determinism.browser.test.ts). If an intentional engine change alters
 * the log, bump ENGINE_VERSION and update this value — never silently.
 */
export const SANDBOX_GOLDEN = { seed: 42, ticks: 600, profile: 'mens', surface: 'watered' } as const;
export const SANDBOX_GOLDEN_HASH = '4bd0c4840e5778f0';
