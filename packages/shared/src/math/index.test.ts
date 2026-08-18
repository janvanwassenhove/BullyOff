import { describe, expect, it } from 'vitest';
import * as M from './index.js';

const samples = (n: number, lo: number, hi: number): number[] =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

describe('deterministic math vs native oracle', () => {
  it('sin/cos within 1e-12 on |x| ≤ 4π', () => {
    for (const x of samples(4001, -4 * Math.PI, 4 * Math.PI)) {
      expect(Math.abs(M.sin(x) - Math.sin(x))).toBeLessThan(1e-12);
      expect(Math.abs(M.cos(x) - Math.cos(x))).toBeLessThan(1e-12);
    }
  });
  it('sin/cos hit exact values at multiples of π/2', () => {
    expect(M.sin(0)).toBe(0);
    expect(M.cos(0)).toBe(1);
    expect(Math.abs(M.sin(M.HALF_PI) - 1)).toBeLessThan(1e-15);
    expect(Math.abs(M.cos(M.PI) + 1)).toBeLessThan(1e-15);
  });
  it('atan2 within 1e-12 across all quadrants and axes', () => {
    for (const y of samples(41, -10, 10)) {
      for (const x of samples(41, -10, 10)) {
        expect(Math.abs(M.atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-12);
      }
    }
    expect(M.atan2(0, 0)).toBe(0);
    expect(M.atan2(1, 0)).toBe(M.HALF_PI);
    expect(M.atan2(-1, 0)).toBe(-M.HALF_PI);
  });
  it('exp within 1e-13 relative on [-50, 50]', () => {
    for (const x of samples(2001, -50, 50)) {
      const ref = Math.exp(x);
      expect(Math.abs(M.exp(x) - ref) / ref).toBeLessThan(1e-13);
    }
    expect(M.exp(0)).toBe(1);
  });
  it('log within 1e-13 on (1e-6, 1e6] and handles edges', () => {
    for (const x of samples(2001, 1e-6, 1e6)) {
      const ref = Math.log(x);
      expect(Math.abs(M.log(x) - ref)).toBeLessThan(1e-13 * Math.max(1, Math.abs(ref)));
    }
    expect(M.log(1)).toBe(0);
    expect(M.log(0)).toBe(-Infinity);
    expect(M.log(-1)).toBeNaN();
    // subnormal
    expect(Math.abs(M.log(5e-324) - Math.log(5e-324))).toBeLessThan(1e-9);
  });
  it('pow / powi', () => {
    expect(M.powi(2, 10)).toBe(1024);
    expect(M.powi(2, -2)).toBe(0.25);
    expect(M.pow2i(-3)).toBe(0.125);
    for (const a of [0.5, 1.7, 3, 9.81]) {
      for (const b of [0.5, 1.5, 2.25, -0.75]) {
        expect(Math.abs(M.pow(a, b) - Math.pow(a, b)) / Math.pow(a, b)).toBeLessThan(1e-12);
      }
    }
  });
  it('wrapAngle lands in (-π, π]', () => {
    for (const a of samples(1001, -30, 30)) {
      const w = M.wrapAngle(a);
      expect(w).toBeGreaterThan(-M.PI);
      expect(w).toBeLessThanOrEqual(M.PI);
      expect(Math.abs(M.sin(w) - Math.sin(a))).toBeLessThan(1e-11);
    }
    expect(M.angleDelta(3, -3)).toBeCloseTo(-6 + M.TWO_PI, 12);
  });
  it('is bit-stable: same input, same output, every call', () => {
    const xs = samples(97, -7, 7);
    const a = xs.map((x) => [M.sin(x), M.cos(x), M.exp(x), M.atan2(x, 1.3)]);
    const b = xs.map((x) => [M.sin(x), M.cos(x), M.exp(x), M.atan2(x, 1.3)]);
    expect(a).toEqual(b);
  });
});
