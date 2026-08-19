import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { simulateMatch } from '../match/match.js';
import { aiMatchSetup } from '../sim/fixtures.js';
import { aiController, squadsFromSetup } from '../ai/brain.js';
import { MENS } from '../profile.js';
import { decodeReplay, encodeReplay } from './codec.js';

describe('replay codec (events + 5 Hz quantised keyframes)', () => {
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST); setup.frameEvery = 1;
  const log = simulateMatch(setup, 42, aiController(42, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' }), 20 * 60 * 5); // 5 minutes
  const file = encodeReplay(log, 4);
  const back = decodeReplay(file);

  it('round-trips events verbatim and positions to within a centimetre / a milliradian', () => {
    expect(back.events).toEqual(log.events);
    expect(back.header.frameEvery).toBe(4);
    expect(back.frames.length).toBe(Math.ceil(log.frames.length / 4));
    for (let i = 0; i < back.frames.length; i += 37) {
      const kf = back.frames[i]!; const src = log.frames.find((f) => f.tick === kf.tick)!;
      expect(Math.abs((kf.ball[0] ?? 0) - (src.ball[0] ?? 0))).toBeLessThan(0.006);
      expect(Math.abs((kf.players[4] ?? 0) - (src.players[4] ?? 0))).toBeLessThan(0.0006);
    }
  });
  it('is small: a full match projects to under 20 MB of JSON before gzip (vs ~250 MB for full-tick frames; ADR-007 gzips on export)', () => {
    const bytes = JSON.stringify(file).length;
    const perTick = bytes / log.frames.length;
    const fullMatch = perTick * 20 * 60 * 70;
    expect(fullMatch).toBeLessThan(20 * 1024 * 1024);
    const raw = JSON.stringify(log).length / log.frames.length * 20 * 60 * 70;
    expect(fullMatch).toBeLessThan(raw / 15);
  });
  it('rejects foreign files', () => {
    expect(() => decodeReplay({ ...file, format: 'nope' } as unknown as typeof file)).toThrow();
  });
});
