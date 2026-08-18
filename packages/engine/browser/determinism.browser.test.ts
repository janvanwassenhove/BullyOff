/**
 * Cross-browser determinism (ADR-005 guardrail 3, ADR-010): the same fixture must
 * hash identically in Chromium, Firefox and WebKit as it does in Node.
 * Runs via `pnpm test:browsers` (Playwright). Not part of the default `pnpm test`.
 */
import { expect, it } from 'vitest';
import { hashLog, simulate } from '../src/index.js';
import { sandboxScript, sandboxSetup } from '../src/sim/fixtures.js';
import { SANDBOX_GOLDEN, SANDBOX_GOLDEN_HASH } from '../src/sim/golden.js';

it(`sandbox fixture hashes to the golden value in ${navigator.userAgent.slice(0, 40)}…`, () => {
  const g = SANDBOX_GOLDEN;
  const log = simulate(sandboxSetup(g.profile, g.surface), g.seed, sandboxScript(g.seed, g.ticks), g.ticks);
  expect(hashLog(log)).toBe(SANDBOX_GOLDEN_HASH);
});
