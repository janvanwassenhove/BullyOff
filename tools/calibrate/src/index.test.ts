import { describe, expect, it } from 'vitest';
import type { Aggregate } from '@bullyoff/engine';
import { chiSquareSurvival, compare, poissonShape, TARGETS } from './index.js';

const agg = (over: Partial<Aggregate> = {}): Aggregate => ({
  profile: 'mens', matches: 100, goalsPerMatch: 5.4, drawRate: 0.11, homeWinRate: 0.45, pcPerMatch: 9, pcConversion: 0.2, pcGoalShare: 0.33,
  psPerMatch: 0.25, psConversion: 0.75, circleEntriesPerMatch: 36, shotsPerMatch: 24, shotsOnTargetShare: 0.45, greenPerMatch: 3, yellowPerMatch: 0.7,
  redPerMatch: 0.02, foulsPerMatch: 40, restartsPerMatch: 110, tacklesPerMatch: 80, substitutionsPerMatch: 12,
  teamGoalsHistogram: [13, 35, 47, 42, 29, 15, 19], scorelines: {}, ...over,
});

describe('calibration harness', () => {
  it('an aggregate on target passes every band and the shape test', () => {
    const r = compare(agg(), 'mens');
    expect(r.metrics.every((m) => m.pass)).toBe(true);
    expect(r.shape.pass).toBe(true);
    expect(r.allMeasuredPass).toBe(true);
  });
  it('a measured miss is flagged and fails allMeasuredPass; an EST miss does not', () => {
    const r1 = compare(agg({ goalsPerMatch: 7 }), 'mens');
    expect(r1.metrics.find((m) => m.key === 'goalsPerMatch')?.pass).toBe(false);
    expect(r1.allMeasuredPass).toBe(false);
    const r2 = compare(agg({ greenPerMatch: 9 }), 'mens');
    expect(r2.allMeasuredPass).toBe(true);
    expect(r2.failed).toBe(1);
  });
  it('chi-square: Poisson-shaped data passes; a lopsided histogram fails', () => {
    expect(poissonShape([13, 35, 47, 42, 29, 15, 19], 2.7, 200).pass).toBe(true);
    expect(poissonShape([120, 5, 5, 5, 5, 5, 55], 2.7, 200).pass).toBe(false);
    // survival function sanity: chi²=0 → 1; large → ≈0; χ²(df=6) 95 % quantile ≈ 12.59
    expect(chiSquareSurvival(0, 6)).toBeCloseTo(1, 6);
    expect(chiSquareSurvival(12.59, 6)).toBeCloseTo(0.05, 2);
    expect(chiSquareSurvival(60, 6)).toBeLessThan(1e-6);
  });
  it('targets exist for both profiles and use ±10 % on measured goals', () => {
    for (const p of ['mens', 'womens'] as const) {
      const g = TARGETS[p].find((t) => t.key === 'goalsPerMatch')!;
      expect(g.status).toBe('measured');
      expect(g.hi / g.target).toBeCloseTo(1.1, 6);
    }
  });
});
