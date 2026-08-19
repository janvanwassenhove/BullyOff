import { describe, expect, it } from 'vitest';
import { FRAME_PLAYER_STRIDE, type Frame } from '@bullyoff/engine';
import { cameraTarget, initialCamera, punch, stepCamera } from './camera.js';
import { frameIndexAt, sampleAt } from './interp.js';

const frame = (tick: number, ball: number[], players: number[]): Frame => ({ tick, ball, players });
const P = (x: number, y: number, h: number, s = h): number[] => [x, y, 0, 0, h, s, 1];

describe('interpolation buffer', () => {
  const frames: Frame[] = [
    frame(0, [0, 0, 0, 0, 0, 0], P(0, 0, 0)),
    frame(4, [4, 0, 1, 0, 0, 0], P(2, 0, 3.0)),
    frame(8, [8, 0, 0, 0, 0, 0], P(4, 0, -3.0)),
  ];
  it('finds the bracketing frame by tick with binary search', () => {
    expect(frameIndexAt(frames, -1)).toBe(0);
    expect(frameIndexAt(frames, 0)).toBe(0);
    expect(frameIndexAt(frames, 3.9)).toBe(0);
    expect(frameIndexAt(frames, 4)).toBe(1);
    expect(frameIndexAt(frames, 7.99)).toBe(1);
    expect(frameIndexAt(frames, 100)).toBe(2);
    expect(frameIndexAt([], 3)).toBe(-1);
  });
  it('lerps positions between sparse keyframes and clamps at the ends', () => {
    expect(sampleAt(frames, 2, 1)?.ball.x).toBeCloseTo(2, 9);
    expect(sampleAt(frames, 2, 1)?.players[0]?.x).toBeCloseTo(1, 9);
    expect(sampleAt(frames, 6, 1)?.ball.x).toBeCloseTo(6, 9);
    expect(sampleAt(frames, 99, 1)?.ball.x).toBeCloseTo(8, 9);
    expect(sampleAt(frames, -5, 1)?.ball.x).toBeCloseTo(0, 9);
  });
  it('takes the shortest arc for headings (3.0 → −3.0 goes through π, not through 0)', () => {
    const h = sampleAt(frames, 6, 1)?.players[0]?.heading ?? 0;
    expect(Math.abs(Math.abs(h) - Math.PI)).toBeLessThan(0.15);
  });
  it('gives the ball a parabolic arc between airborne keyframes (never below the turf)', () => {
    const z2 = sampleAt(frames, 2, 1)?.ball.z ?? 0;
    expect(z2).toBeGreaterThan(0.5); // above the straight line (0.5) — a lob peaks mid-way
    expect(sampleAt(frames, 7.9, 1)?.ball.z).toBeGreaterThanOrEqual(0);
    expect(FRAME_PLAYER_STRIDE).toBe(7);
  });
});

describe('director camera', () => {
  it('zooms tighter inside the circle than in midfield, and stays on the pitch', () => {
    const mid = cameraTarget({ x: 0, y: 0, vx: 0, vy: 0 }, 'director', 16 / 9);
    const d = cameraTarget({ x: 40, y: 0, vx: 0, vy: 0 }, 'director', 16 / 9);
    expect(d.width).toBeLessThan(mid.width);
    const corner = cameraTarget({ x: 45, y: 27, vx: 20, vy: 20 }, 'director', 16 / 9);
    expect(corner.x).toBeLessThan(45 + 4);
    expect(cameraTarget({ x: 40, y: 0, vx: 0, vy: 0 }, 'tactical', 16 / 9).width).toBeGreaterThan(90);
  });
  it('the spring converges without overshoot and a punch is a brief zoom-in that returns to 1', () => {
    let s = initialCamera();
    const t = { x: 30, y: 5, width: 42 };
    let maxX = -Infinity;
    for (let i = 0; i < 400; i++) { s = stepCamera(s, t, 1 / 60); maxX = Math.max(maxX, s.x); }
    expect(s.x).toBeCloseTo(30, 1);
    expect(s.width).toBeCloseTo(42, 0);
    expect(maxX).toBeLessThan(30.5); // critically damped: no meaningful overshoot
    expect(punch(0.15)).toBeLessThan(1);
    expect(punch(0.15)).toBeGreaterThan(0.9);
    expect(punch(1)).toBe(1);
    expect(punch(-1)).toBe(1);
  });
});
