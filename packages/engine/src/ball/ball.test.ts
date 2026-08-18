import { describe, expect, it } from 'vitest';
import { DT } from '../constants.js';
import { MENS } from '../profile.js';
import { createBall, stepBall } from './ball.js';

function rollUntilStopped(v0: number, surface: 'dry' | 'watered' | 'wet', airDrag = MENS.ball.airDrag): { dist: number; ticks: number } {
  const b = createBall(0, 0);
  b.vel = { x: v0, y: 0, z: 0 };
  let ticks = 0;
  const params = { ...MENS.ball, airDrag };
  for (;;) {
    const r = stepBall(b, DT, params, MENS.surfaces[surface]);
    b.pos = r.next.pos; b.vel = r.next.vel; b.grounded = r.next.grounded;
    ticks++;
    if (r.stopped) return { dist: b.pos.x, ticks };
    if (ticks > 10_000) throw new Error('never stopped');
  }
}

describe('ball physics', () => {
  it('with air drag off, a rolled ball stops where constant deceleration says it should: d = v²/(2a)', () => {
    for (const surface of ['dry', 'watered', 'wet'] as const) {
      const a = MENS.surfaces[surface].rollingDecel;
      for (const v0 of [3, 8, 15]) {
        const { dist } = rollUntilStopped(v0, surface, 0);
        const expected = (v0 * v0) / (2 * a);
        // exact integration inside the tick → analytic within 1e-9
        expect(Math.abs(dist - expected)).toBeLessThan(1e-9);
      }
    }
  });

  it('with drag, a hard hit (30 m/s) dies within 50–90 m on watered turf and a firm push (10 m/s) rolls 15–30 m', () => {
    const hit = rollUntilStopped(30, 'watered').dist;
    expect(hit).toBeGreaterThan(50);
    expect(hit).toBeLessThan(90);
    const push = rollUntilStopped(10, 'watered').dist;
    expect(push).toBeGreaterThan(15);
    expect(push).toBeLessThan(30);
  });

  it('a watered pitch is faster than dry: same push travels further', () => {
    expect(rollUntilStopped(8, 'watered').dist).toBeGreaterThan(rollUntilStopped(8, 'dry').dist);
    expect(rollUntilStopped(8, 'wet').dist).toBeLessThan(rollUntilStopped(8, 'watered').dist);
  });

  it('a lofted ball follows a parabola, bounces with restitution, and settles', () => {
    const b = createBall(0, 0);
    b.pos = { x: 0, y: 0, z: 0.001 }; b.vel = { x: 10, y: 0, z: 6 }; b.grounded = false;
    let maxZ = 0, bounces = 0, ticks = 0;
    for (;;) {
      const r = stepBall(b, DT, MENS.ball, MENS.surfaces.dry);
      b.pos = r.next.pos; b.vel = r.next.vel; b.grounded = r.next.grounded;
      maxZ = Math.max(maxZ, b.pos.z);
      if (r.bounced) bounces++;
      ticks++;
      if (b.grounded && r.stopped) break;
      if (ticks > 2000) throw new Error('did not settle');
    }
    // apex ≈ v²/2g = 1.83 m (less drag)
    expect(maxZ).toBeGreaterThan(1.5);
    expect(maxZ).toBeLessThan(1.9);
    expect(bounces).toBeGreaterThanOrEqual(2);
    expect(b.pos.z).toBe(0);
  });

  it('bounce inside a tick keeps the ball moving after touchdown (no lost tick)', () => {
    const b = createBall(0, 0);
    b.pos = { x: 0, y: 0, z: 0.05 }; b.vel = { x: 20, y: 0, z: -3 }; b.grounded = false;
    const r = stepBall(b, DT, MENS.ball, MENS.surfaces.watered);
    expect(r.bounced).toBe(true);
    // horizontal progress ≈ 20 m/s × 0.05 s (minus a little bounce loss on the remainder)
    expect(r.next.pos.x).toBeGreaterThan(0.85);
    expect(r.next.pos.z).toBeGreaterThan(0); // still airborne after the bounce
  });
});
