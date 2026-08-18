/**
 * Phase 3 gate (automated part): with the utility AI, full matches are
 * deterministic, complete, reasonably fast, and show hockey shape in the log —
 * circle entries, shots from inside the D, penalty corners taken by the battery,
 * tackles, rotations. The *qualitative* judgement is Jan's (docs/handoff/phase-3.md).
 */
import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { inCircle } from '@bullyoff/shared';
import { simulateMatch } from '../match/match.js';
import { aiMatchSetup } from '../sim/fixtures.js';
import { hashLog } from '../sim/hash.js';
import { MENS } from '../profile.js';
import { aiController, passSpeedFor, squadsFromSetup } from './brain.js';
import { DEFAULT_TACTICS } from './tactics.js';
import type { MatchEvent } from '../events/events.js';

const count = (ev: readonly MatchEvent[], t: MatchEvent['t']): number => ev.filter((e) => e.t === t).length;

function play(seed: number, profile: 'mens' | 'womens' = 'mens'): ReturnType<typeof simulateMatch> {
  const setup = aiMatchSetup(profile, 'watered', FIH_OUTDOOR_FAST);
  setup.frameEvery = 1;
  return simulateMatch(setup, seed, aiController(seed, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' }));
}

describe('utility AI — full matches', { timeout: 120_000 }, () => {
  const logs = [play(42), play(7)];

  it('plays to full time, deterministically, in a few seconds', () => {
    for (const log of logs) {
      expect(count(log.events, 'FullTime')).toBe(1);
      expect(count(log.events, 'CollisionCapHit')).toBe(0);
    }
    // determinism + speed, without frames (the frames above are only for position lookups in these tests)
    const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST);
    const run = (): string => hashLog(simulateMatch(setup, 42, aiController(42, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' })));
    const t0 = performance.now();
    const h1 = run();
    const ms = performance.now() - t0;
    expect(run()).toBe(h1);
    expect(ms).toBeLessThan(6_000); // Phase 3 target: ≤ 5 s per match in Node (CI machines vary)
  }, 60_000);

  it('shows hockey shape: circle entries, shots from inside the D by both teams, keeper involvement', () => {
    for (const log of logs) {
      const ev = log.events;
      const frameAt = new Map(log.frames.map((f) => [f.tick, f]));
      const entries = count(ev, 'CircleEntry');
      expect(entries).toBeGreaterThan(20);
      expect(entries).toBeLessThan(200);
      const shotsBy = [0, 0];
      for (const e of ev) {
        if (e.t !== 'BallStruck' || (e.kind === 'push' && e.speed < 5)) continue;
        const f = frameAt.get(e.tick); if (!f) continue;
        const end = e.team === 0 ? 1 : -1;
        if (inCircle({ x: f.ball[0] ?? 0, y: f.ball[1] ?? 0 }, end)) shotsBy[e.team] = (shotsBy[e.team] ?? 0) + 1;
      }
      expect(shotsBy[0]).toBeGreaterThan(3);
      expect(shotsBy[1]).toBeGreaterThan(3);
      const gkTouches = ev.filter((e) => e.t === 'BallTrapped' && (e.playerId === 1 || e.playerId === 12)).length;
      expect(gkTouches).toBeGreaterThan(2);
    }
  });

  it('penalty corners are won and the battery runs them: injection → trap at the top → strike', () => {
    let pcs = 0, trapsAtTop = 0, strikesAfter = 0;
    for (const log of logs) {
      const ev = log.events;
      const frameAt = new Map(log.frames.map((f) => [f.tick, f]));
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        if (e?.t !== 'PenaltyCornerTaken') continue;
        pcs++;
        for (let j = i + 1; j < ev.length; j++) {
          const g = ev[j];
          if (!g || g.t === 'PenaltyCornerEnded') break;
          if (g.t === 'BallTrapped' && g.team === e.team) { const f = frameAt.get(g.tick); if (f && Math.abs(f.ball[0] ?? 0) > 28 && Math.abs(f.ball[0] ?? 0) < 34) trapsAtTop++; }
          if (g.t === 'BallStruck' && g.team === e.team && (g.kind === 'flick' || g.kind === 'hit') && g.speed > 15) { strikesAfter++; break; }
        }
      }
    }
    expect(pcs).toBeGreaterThan(3);
    expect(trapsAtTop).toBeGreaterThan(0);
    expect(strikesAfter).toBeGreaterThan(0);
  });

  it('defends: tackles happen with mixed outcomes; fouls stay in a plausible band; rolling substitutions occur', () => {
    for (const log of logs) {
      const ev = log.events;
      const tackles = ev.filter((e): e is Extract<MatchEvent, { t: 'Tackle' }> => e.t === 'Tackle');
      expect(tackles.length).toBeGreaterThan(30);
      expect(tackles.some((t) => t.outcome === 'won')).toBe(true);
      expect(tackles.some((t) => t.outcome === 'lost')).toBe(true);
      const fouls = count(ev, 'Foul');
      expect(fouls).toBeGreaterThan(5);
      expect(fouls).toBeLessThan(120);
      expect(count(ev, 'Substitution')).toBeGreaterThan(2);
    }
  });

  it('goals happen across seeds and obey the laws (centre pass by the conceding team afterwards)', () => {
    let goals = 0;
    for (const seed of [42, 7, 1234]) {
      const log = seed === 42 ? logs[0]! : seed === 7 ? logs[1]! : play(seed);
      const gs = log.events.filter((e): e is Extract<MatchEvent, { t: 'Goal' }> => e.t === 'Goal');
      goals += gs.length;
      for (const g of gs) {
        const i = log.events.indexOf(g);
        const next = log.events.slice(i + 1).find((e) => e.t === 'RestartAwarded');
        expect(next?.t === 'RestartAwarded' && next.restart.kind).toBe('centrePass');
        expect(next?.t === 'RestartAwarded' && next.restart.team).toBe(g.team === 0 ? 1 : 0);
      }
    }
    expect(goals).toBeGreaterThan(0);
    expect(goals).toBeLessThan(40);
  });

  it('women\'s profile plays too and produces a different log', () => {
    const w = play(42, 'womens');
    expect(count(w.events, 'FullTime')).toBe(1);
    expect(hashLog(w)).not.toBe(hashLog(logs[0]!));
  });
});

describe('AI helpers', () => {
  it('passSpeedFor: further passes need more pace; watered turf needs less than dry; short passes are pushes', () => {
    expect(passSpeedFor(20, 6, MENS, 'watered')).toBeGreaterThan(passSpeedFor(10, 6, MENS, 'watered'));
    expect(passSpeedFor(20, 6, MENS, 'watered')).toBeLessThan(passSpeedFor(20, 6, MENS, 'dry'));
    expect(passSpeedFor(10, 6, MENS, 'watered')).toBeLessThan(MENS.strike.pushSpeed);
  });
  it('squadsFromSetup assigns slots and tactics per team', () => {
    const [h, a] = squadsFromSetup(aiMatchSetup().players, [DEFAULT_TACTICS, { ...DEFAULT_TACTICS, pressHeight: 1 }]);
    expect(h.players.length).toBe(16);
    expect(a.tactics.pressHeight).toBe(1);
    expect(h.players.find((p) => p.id === 1)?.role).toBe('GK');
    expect(h.players.find((p) => p.id === 23)?.slot).toBeGreaterThan(0);
  });
});
