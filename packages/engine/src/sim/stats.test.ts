import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { simulateMatch } from '../match/match.js';
import { aiMatchSetup } from '../sim/fixtures.js';
import { aiController, squadsFromSetup } from '../ai/brain.js';
import { MENS } from '../profile.js';
import { aggregate, matchStats } from './stats.js';

describe('match statistics', () => {
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST);
  const log = simulateMatch(setup, 42, aiController(42, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' }));
  const s = matchStats(log);

  it('reads goals, PCs, strokes, cards, restarts from the log consistently with the events', () => {
    const goals = log.events.filter((e): e is Extract<typeof e, { t: 'Goal' }> => e.t === 'Goal');
    expect(s.goals[0] + s.goals[1]).toBe(goals.length);
    expect(s.pcAwarded[0] + s.pcAwarded[1]).toBe(log.events.filter((e) => e.t === 'PenaltyCornerAwarded').length);
    expect(s.pcGoals[0] + s.pcGoals[1]).toBe(goals.filter((g) => g.fromPC).length);
    expect(s.cards.green + s.cards.yellow + s.cards.red).toBe(log.events.filter((e) => e.t === 'Card').length);
    expect(s.restarts).toBe(log.events.filter((e) => e.t === 'RestartAwarded').length);
    expect(s.shotsOnTarget[0]).toBeLessThanOrEqual(s.shots[0]);
    expect(s.shots[0] + s.shots[1]).toBeGreaterThan(5);
    // attacking circle entries only: never more than raw CircleEntry events
    expect(s.circleEntries[0] + s.circleEntries[1]).toBeLessThanOrEqual(log.events.filter((e) => e.t === 'CircleEntry').length);
  });

  it('aggregates rates and histograms', () => {
    const agg = aggregate([s, s]);
    expect(agg.matches).toBe(2);
    expect(agg.goalsPerMatch).toBeCloseTo(s.goals[0] + s.goals[1], 9);
    expect(agg.teamGoalsHistogram.reduce((a, b) => a + b, 0)).toBe(4);
    expect(agg.drawRate).toBe(s.goals[0] === s.goals[1] ? 1 : 0);
    expect(agg.pcConversion).toBeGreaterThanOrEqual(0);
    expect(agg.pcConversion).toBeLessThanOrEqual(1);
  });
});
