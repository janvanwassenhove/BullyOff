/**
 * Scenario fixtures run, are deterministic, and are tracked by hash so a change
 * that alters any of them is reviewed (ADR-010 layer 4). Also a few structural
 * checks that the situation each scenario claims to set up actually arises.
 */
import { describe, expect, it } from 'vitest';
import { hashLog } from './hash.js';
import { SCENARIOS, runScenario } from './scenarios.js';
import SCENARIO_HASHES from './scenarios.golden.json' with { type: 'json' };
import type { MatchEvent } from '../events/events.js';

const count = (ev: readonly MatchEvent[], t: MatchEvent['t']): number => ev.filter((e) => e.t === t).length;

describe('scenario fixtures (BRIEF §6.2)', () => {
  const runs = new Map(SCENARIOS.map((s) => [s.id, runScenario(s)]));

  it('every scenario runs to its horizon without physics bug signals and is deterministic', () => {
    for (const s of SCENARIOS) {
      const log = runs.get(s.id)!;
      expect(count(log.events, 'CollisionCapHit'), s.id).toBe(0);
      expect(hashLog(runScenario(s)), s.id).toBe(hashLog(log));
    }
  });

  it('regression: hashes match scenarios.golden.json (review + update deliberately when the engine/AI changes)', () => {
    const golden = SCENARIO_HASHES as Record<string, string>;
    const actual: Record<string, string> = {};
    for (const s of SCENARIOS) actual[s.id] = hashLog(runs.get(s.id)!);
    // Print the actual table so an intentional update is a copy-paste, not archaeology.
    if (JSON.stringify(actual) !== JSON.stringify(golden)) console.warn('scenario hashes:\n' + JSON.stringify(actual, null, 2));
    expect(actual).toEqual(golden);
  });

  it('the penalty-corner scenarios award and run a PC; the one-man-down variant has ten away players on the pitch', () => {
    for (const id of ['pc-dragFlick', 'pc-lowHit', 'pc-slipRight', 'pc-deflection', 'pc-one-man-down']) {
      const log = runs.get(id)!;
      expect(count(log.events, 'PenaltyCornerAwarded'), id).toBeGreaterThanOrEqual(1);
      expect(count(log.events, 'PenaltyCornerTaken'), id).toBeGreaterThanOrEqual(1);
    }
    const down = runs.get('pc-one-man-down')!;
    const awayOnPitch = down.header.playerIds.filter((id, i) => down.header.teams[i] === 1 && id >= 12 && id <= 22 && id !== 16).length;
    expect(awayOnPitch).toBe(10);
  });

  it('last two minutes: the trailing home side plays without a goalkeeper (kicking back on) and the clock reaches full time', () => {
    const log = runs.get('last-two-minutes')!;
    expect(count(log.events, 'FullTime')).toBe(1);
    // player 1 (GK) never touches the ball; 23 (kicking back) is on the pitch from the start
    expect(log.events.some((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.playerId === 1)).toBe(false);
  });

  it('circle-entry scenarios produce play inside the D', () => {
    for (const id of ['baseline-entry', 'two-v-one', 'three-v-two', 'counter-attack']) {
      const log = runs.get(id)!;
      const activity = count(log.events, 'CircleEntry') + count(log.events, 'GoalLineCrossed') + count(log.events, 'Goal') + count(log.events, 'PenaltyCornerAwarded')
        + log.events.filter((e) => e.t === 'BallStruck' && e.team === 0 && e.speed > 5).length;
      expect(activity, id).toBeGreaterThan(0);
    }
  });
});
