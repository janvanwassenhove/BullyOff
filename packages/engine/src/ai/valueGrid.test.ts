import { describe, expect, it } from 'vitest';
import { CIRCLE_TOP_X, HALF_LENGTH, LINE_23_X, PENALTY_SPOT_X } from '@bullyoff/shared';
import { distanceOutsideCircle, goalAngle, pitchValue, shotQuality } from './valueGrid.js';

describe('the circle-warped value function', () => {
  it('value rises steeply at the circle: inside ≫ top of the D ≫ 23 m ≫ midfield ≫ own half', () => {
    const own = pitchValue({ x: -30, y: 0 }, 1);
    const mid = pitchValue({ x: 0, y: 0 }, 1);
    const at23 = pitchValue({ x: LINE_23_X + 0.5, y: 0 }, 1);
    const top = pitchValue({ x: CIRCLE_TOP_X - 0.5, y: 0 }, 1);
    const inD = pitchValue({ x: CIRCLE_TOP_X + 2, y: 0 }, 1);
    const spot = pitchValue({ x: PENALTY_SPOT_X, y: 0 }, 1);
    expect(own).toBeLessThan(mid);
    expect(mid).toBeLessThan(at23);
    expect(at23).toBeLessThan(top);
    expect(top).toBeLessThan(inD);
    expect(inD).toBeLessThan(spot);
    // the step into the circle is the biggest single jump on the pitch
    expect(inD - top).toBeGreaterThan(top - mid);
    // midfield possession is worth little compared with the D
    expect(mid).toBeLessThan(0.25 * spot);
  });
  it('is symmetric between the two ends and central beats wide inside the circle', () => {
    for (const [x, y] of [[10, 5], [35, -8], [40, 1], [-20, 12]] as [number, number][]) {
      expect(pitchValue({ x, y }, 1)).toBeCloseTo(pitchValue({ x: -x, y: -y }, -1), 12);
    }
    expect(pitchValue({ x: PENALTY_SPOT_X, y: 0 }, 1)).toBeGreaterThan(pitchValue({ x: PENALTY_SPOT_X, y: 10 }, 1));
  });
  it('shot quality: better from the spot than the top of the D, better with the keeper off-line, zero outside the circle', () => {
    const gk = { x: HALF_LENGTH - 1, y: 0 };
    expect(shotQuality({ x: PENALTY_SPOT_X, y: 0 }, 1, gk)).toBeGreaterThan(shotQuality({ x: CIRCLE_TOP_X + 0.5, y: 0 }, 1, gk));
    expect(shotQuality({ x: PENALTY_SPOT_X, y: 0 }, 1, { x: HALF_LENGTH - 1, y: 1.6 })).toBeGreaterThan(shotQuality({ x: PENALTY_SPOT_X, y: 0 }, 1, gk));
    expect(shotQuality({ x: CIRCLE_TOP_X - 1, y: 0 }, 1, gk)).toBe(0);
    expect(goalAngle({ x: PENALTY_SPOT_X, y: 0 }, 1)).toBeGreaterThan(goalAngle({ x: CIRCLE_TOP_X, y: 0 }, 1));
  });
  it('distance outside the circle is 0 inside and grows outside', () => {
    expect(distanceOutsideCircle({ x: PENALTY_SPOT_X, y: 0 }, 1)).toBe(0);
    expect(distanceOutsideCircle({ x: CIRCLE_TOP_X - 3, y: 0 }, 1)).toBeCloseTo(3, 6);
    expect(distanceOutsideCircle({ x: 0, y: 0 }, 1)).toBeGreaterThan(20);
  });
});
