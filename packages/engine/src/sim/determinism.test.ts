/**
 * Determinism harness (ADR-010 layer 2). Same seed + same script ⇒ identical log
 * hash, 100 times over. Also: different seeds differ; Rng round-trips.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../match/match.js';
import { hashLog } from './hash.js';
import { sandboxScript, sandboxSetup } from './fixtures.js';
import { SANDBOX_GOLDEN, SANDBOX_GOLDEN_HASH } from './golden.js';

describe('determinism harness', () => {
  it('100 runs of the sandbox fixture hash identically', () => {
    const setup = sandboxSetup('mens', 'watered');
    const script = sandboxScript(42, 600);
    const first = hashLog(simulate(setup, 42, script, 600));
    for (let i = 1; i < 100; i++) {
      expect(hashLog(simulate(setup, 42, script, 600))).toBe(first);
    }
  }, 60_000);

  it('is byte-identical after a JSON round trip of the log', () => {
    const setup = sandboxSetup('womens', 'dry');
    const script = sandboxScript(7, 300);
    const log = simulate(setup, 7, script, 300);
    const again = JSON.parse(JSON.stringify(log)) as typeof log;
    expect(hashLog(again)).toBe(hashLog(log));
  });

  it('a different seed or a different profile changes the log', () => {
    const script = sandboxScript(1, 200);
    const a = hashLog(simulate(sandboxSetup('mens', 'watered'), 1, script, 200));
    const b = hashLog(simulate(sandboxSetup('mens', 'watered'), 2, script, 200));
    const c = hashLog(simulate(sandboxSetup('womens', 'watered'), 1, script, 200));
    const d = hashLog(simulate(sandboxSetup('mens', 'dry'), 1, script, 200));
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('command arrival order does not matter (commands are sorted per tick)', () => {
    const setup = sandboxSetup();
    const script = sandboxScript(11, 200);
    const shuffled = [...script].reverse();
    expect(hashLog(simulate(setup, 11, shuffled, 200))).toBe(hashLog(simulate(setup, 11, script, 200)));
  });

  it('the sandbox produces a rich log (sanity: things actually happen)', () => {
    const log = simulate(sandboxSetup(), 42, sandboxScript(42, 600), 600);
    const types = new Set(log.events.map((e) => e.t));
    expect(types.has('BallStruck')).toBe(true);
    expect(types.has('BallCollision')).toBe(true);
    expect(log.frames.length).toBe(600);
    expect(log.events.some((e) => e.t === 'CollisionCapHit')).toBe(false);
  });
});

describe('golden hash (shared with the browser harness)', () => {
  it('matches SANDBOX_GOLDEN_HASH — if this fails after an intentional engine change, bump ENGINE_VERSION and update golden.ts', () => {
    const g = SANDBOX_GOLDEN;
    const h = hashLog(simulate(sandboxSetup(g.profile, g.surface), g.seed, sandboxScript(g.seed, g.ticks), g.ticks));
    expect(h).toBe(SANDBOX_GOLDEN_HASH);
  });
});
