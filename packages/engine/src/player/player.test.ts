import { describe, expect, it } from 'vitest';
import { DT } from '../constants.js';
import { MENS } from '../profile.js';
import { createPlayer, stepPlayer, stickHead } from './player.js';

describe('player kinematics', () => {
  it('accelerates to top speed under limited acceleration and stops faster than it starts', () => {
    const p = createPlayer(1, 0, 0, 0);
    p.wantDir = { x: 1, y: 0 }; p.wantEffort = 1;
    let ticksToTop = 0;
    let prev = -1;
    // run until speed stops increasing (fatigue trims the ceiling slightly during the run-up)
    while (p.vel.x > prev + 1e-6) { prev = p.vel.x; stepPlayer(p, DT, MENS.player); ticksToTop++; if (ticksToTop > 200) break; }
    expect(p.vel.x).toBeGreaterThan(MENS.player.maxSpeed * 0.96);
    expect(p.vel.x).toBeLessThanOrEqual(MENS.player.maxSpeed);
    // ~ maxSpeed / accel seconds
    expect(ticksToTop * DT).toBeCloseTo(MENS.player.maxSpeed / MENS.player.accel, 0);
    p.wantEffort = 0;
    let ticksToStop = 0;
    while (p.vel.x > 1e-9) { stepPlayer(p, DT, MENS.player); ticksToStop++; }
    expect(ticksToStop).toBeLessThan(ticksToTop);
  });

  it('turns towards its velocity at a limited rate and the stick follows', () => {
    const p = createPlayer(1, 0, 0, 0, 0);
    p.wantDir = { x: 0, y: 1 }; p.wantEffort = 1;
    stepPlayer(p, DT, MENS.player); stepPlayer(p, DT, MENS.player);
    expect(p.heading).toBeGreaterThan(0);
    expect(p.heading).toBeLessThan(Math.PI / 2);
    for (let i = 0; i < 40; i++) stepPlayer(p, DT, MENS.player);
    expect(p.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(p.stickAngle).toBeCloseTo(Math.PI / 2, 6);
    const head = stickHead(p, MENS.player.reach);
    expect(head.y - p.pos.y).toBeCloseTo(MENS.player.reach, 6);
  });

  it('sprinting drains stamina; idling recovers it; fatigue caps speed', () => {
    const p = createPlayer(1, 0, 0, 0);
    p.wantDir = { x: 1, y: 0 }; p.wantEffort = 1;
    for (let i = 0; i < 20 * 60; i++) stepPlayer(p, DT, MENS.player); // one minute flat out
    expect(p.stamina).toBeLessThan(0.75);
    const tiredTop = p.vel.x;
    expect(tiredTop).toBeLessThan(MENS.player.maxSpeed);
    p.wantEffort = 0;
    for (let i = 0; i < 20 * 60; i++) stepPlayer(p, DT, MENS.player);
    expect(p.stamina).toBeGreaterThan(0.75);
  });
});
