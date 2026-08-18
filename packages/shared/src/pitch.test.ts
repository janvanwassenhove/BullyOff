import { describe, expect, it } from 'vitest';
import {
  CIRCLE_RADIUS, CIRCLE_TOP_X, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, LINE_23_X,
  in23, inCircle, inField, segmentCrossX, sweptCircleCrossing,
} from './pitch.js';

describe('pitch geometry', () => {
  it('has FIH dimensions', () => {
    expect(HALF_LENGTH * 2).toBeCloseTo(91.4, 10);
    expect(HALF_WIDTH * 2).toBeCloseTo(55.0, 10);
    expect(LINE_23_X).toBeCloseTo(22.8, 10);
    expect(CIRCLE_TOP_X).toBeCloseTo(31.07, 10);
  });

  it('circle: straight section between the posts, arcs outside, symmetric per end', () => {
    // top of the D, dead centre: on the line → in
    expect(inCircle({ x: CIRCLE_TOP_X, y: 0 }, 1)).toBe(true);
    expect(inCircle({ x: CIRCLE_TOP_X - 0.01, y: 0 }, 1)).toBe(false);
    // straight section extends to |y| = 1.83 at full radius
    expect(inCircle({ x: CIRCLE_TOP_X, y: GOAL_HALF_WIDTH }, 1)).toBe(true);
    // just outside the straight, the arc is closer to the backline
    expect(inCircle({ x: CIRCLE_TOP_X, y: GOAL_HALF_WIDTH + 0.5 }, 1)).toBe(false);
    // point on the arc: post + 14.63 at 45°
    const d = CIRCLE_RADIUS * Math.SQRT1_2;
    expect(inCircle({ x: HALF_LENGTH - d + 1e-9, y: GOAL_HALF_WIDTH + d - 1e-9 }, 1)).toBe(true);
    expect(inCircle({ x: HALF_LENGTH - d - 1e-6, y: GOAL_HALF_WIDTH + d + 1e-6 }, 1)).toBe(false);
    // widest point of the D on the backline: 1.83 + 14.63 = 16.46
    expect(inCircle({ x: HALF_LENGTH, y: 16.45 }, 1)).toBe(true);
    expect(inCircle({ x: HALF_LENGTH, y: 16.47 }, 1)).toBe(false);
    // other end mirrors
    expect(inCircle({ x: -CIRCLE_TOP_X, y: 0 }, -1)).toBe(true);
    expect(inCircle({ x: -CIRCLE_TOP_X, y: 0 }, 1)).toBe(false);
    // behind the backline is not in the circle
    expect(inCircle({ x: HALF_LENGTH + 0.1, y: 0 }, 1)).toBe(false);
  });

  it('23 m area and field bounds', () => {
    expect(in23({ x: 30, y: 0 }, 1)).toBe(true);
    expect(in23({ x: 20, y: 0 }, 1)).toBe(false);
    expect(in23({ x: -30, y: 0 }, -1)).toBe(true);
    expect(inField({ x: 45.7, y: 27.5 })).toBe(true);
    expect(inField({ x: 45.71, y: 0 })).toBe(false);
  });

  it('segmentCrossX finds the parametric crossing regardless of direction', () => {
    expect(segmentCrossX(0, 10, 2.5)).toBeCloseTo(0.25, 12);
    expect(segmentCrossX(10, 0, 2.5)).toBeCloseTo(0.75, 12);
    expect(segmentCrossX(0, 10, 11)).toBe(-1);
    expect(segmentCrossX(3, 3, 3)).toBe(0);
  });

  it('swept circle crossing detects entry across the arc even when both endpoints are far apart', () => {
    // A 1.9 m sweep that starts outside and ends inside near the arc seam
    const r = sweptCircleCrossing({ x: 29.5, y: 3.0 }, { x: 31.4, y: 3.0 }, 1);
    expect(r).not.toBeNull();
    expect(r?.entering).toBe(true);
    const t = r?.t ?? 0;
    const px = 29.5 + 1.9 * t;
    // crossing point must sit on the arc: distance from post ≈ 14.63
    const dx = HALF_LENGTH - px, dy = 3.0 - GOAL_HALF_WIDTH;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(CIRCLE_RADIUS, 5);
    expect(sweptCircleCrossing({ x: 10, y: 0 }, { x: 12, y: 0 }, 1)).toBeNull();
    const out = sweptCircleCrossing({ x: 40, y: 0 }, { x: 30, y: 0 }, 1);
    expect(out?.entering).toBe(false);
  });
});
