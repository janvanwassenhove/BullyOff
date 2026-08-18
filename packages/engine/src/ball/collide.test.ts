/**
 * Phase 1 acceptance tests (BRIEF §5.2.1):
 *  - a ball fired at 130 km/h from 14 m registers a goal on every tested angle
 *  - a ball fired at the post rebounds rather than passing through
 * plus tunnelling/regression cases for the swept path.
 */
import { describe, expect, it } from 'vitest';
import { dmath } from '@bullyoff/shared';
import { createMatch, tick } from '../match/match.js';
import type { Command } from '../match/commands.js';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT, HALF_LENGTH } from '../pitch/geometry.js';
import type { MatchEvent } from '../events/events.js';

const KMH = 1 / 3.6;

function fire(from: { x: number; y: number; z?: number }, vel: { x: number; y: number; z: number }, ticks = 40, extra: Command[] = []): MatchEvent[] {
  const { state } = createMatch({ profile: 'mens', surface: 'watered', players: [] }, 1);
  const cmds: Command[] = [
    { tick: 0, kind: 'placeBall', x: from.x, y: from.y, z: from.z ?? 0, vx: vel.x, vy: vel.y, vz: vel.z },
    ...extra,
  ];
  const events: MatchEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...tick(state, cmds));
  return events;
}

describe('swept collision — goal detection', () => {
  it('130 km/h from 14 m registers a goal on every tested angle (no tunnelling)', () => {
    const speed = 130 * KMH; // 36.1 m/s → 1.8 m per tick
    const startX = HALF_LENGTH - 14;
    // aim at 21 points across the goal mouth, at 3 heights, from 3 lateral start positions
    for (const y0 of [-6, 0, 5]) {
      for (const targetY of Array.from({ length: 21 }, (_, i) => -1.7 + (3.4 * i) / 20)) {
        for (const targetZ of [0.05, 0.9, 1.9]) {
          const dx = HALF_LENGTH - startX, dy = targetY - y0;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const flight = dist / speed;
          // choose vz so the ball is at targetZ at the line (ignoring drag): z = vz t − ½ g t²
          const vz = (targetZ + 0.5 * 9.81 * flight * flight) / flight;
          const horiz = speed;
          const events = fire({ x: startX, y: y0, z: 0.001 }, { x: (dx / dist) * horiz, y: (dy / dist) * horiz, z: vz }, 30);
          const crossed = events.filter((e) => e.t === 'GoalLineCrossed');
          expect(crossed.length, `y0=${y0} ty=${targetY} tz=${targetZ}`).toBeGreaterThanOrEqual(1);
          const first = crossed[0];
          expect(first?.t === 'GoalLineCrossed' && first.inGoal, `y0=${y0} ty=${targetY} tz=${targetZ} → ${JSON.stringify(first)}`).toBe(true);
          // and no post/crossbar collision on the way in
          expect(events.some((e) => e.t === 'BallCollision' && (e.surface === 'post' || e.surface === 'crossbar'))).toBe(false);
        }
      }
    }
  });

  it('a ball fired straight at the post rebounds and never crosses the line', () => {
    const speed = 110 * KMH;
    for (const side of [-1, 1]) {
      const events = fire({ x: HALF_LENGTH - 10, y: side * GOAL_HALF_WIDTH, z: 0.02 }, { x: speed, y: 0, z: 0 }, 40);
      const post = events.find((e) => e.t === 'BallCollision' && e.surface === 'post');
      expect(post, `side ${side}`).toBeDefined();
      expect(events.some((e) => e.t === 'GoalLineCrossed' && e.inGoal)).toBe(false);
    }
  });

  it('a ball on the crossbar rebounds; just under it is a goal', () => {
    const speed = 100 * KMH;
    const d = 5; // close enough that drag doesn't move the aim by more than the bar radius
    const flight = d / speed;
    const zAt = (zLine: number): number => (zLine + 0.5 * 9.81 * flight * flight) / flight;
    const bar = fire({ x: HALF_LENGTH - d, y: 0, z: 0.001 }, { x: speed, y: 0, z: zAt(GOAL_HEIGHT) }, 30);
    expect(bar.some((e) => e.t === 'BallCollision' && e.surface === 'crossbar')).toBe(true);
    const under = fire({ x: HALF_LENGTH - d, y: 0, z: 0.001 }, { x: speed, y: 0, z: zAt(GOAL_HEIGHT - 0.15) }, 30);
    expect(under.some((e) => e.t === 'GoalLineCrossed' && e.inGoal)).toBe(true);
    const over = fire({ x: HALF_LENGTH - d, y: 0, z: 0.001 }, { x: speed, y: 0, z: zAt(GOAL_HEIGHT + 0.4) }, 30);
    expect(over.some((e) => e.t === 'GoalLineCrossed' && !e.inGoal)).toBe(true);
  });

  it('a wide shot crosses the backline outside the goal', () => {
    const events = fire({ x: HALF_LENGTH - 10, y: 8, z: 0 }, { x: 25, y: 0, z: 0 }, 40);
    const c = events.find((e) => e.t === 'GoalLineCrossed');
    expect(c?.t === 'GoalLineCrossed' && !c.inGoal).toBe(true);
  });

  it('a ball in the net stays in the net (no re-crossing, backboard collision once)', () => {
    const events = fire({ x: HALF_LENGTH - 5, y: 0, z: 0 }, { x: 25, y: 0, z: 0 }, 60);
    expect(events.filter((e) => e.t === 'GoalLineCrossed').length).toBe(1);
    expect(events.filter((e) => e.t === 'BallCollision' && (e.surface === 'backboard' || e.surface === 'net')).length).toBeGreaterThanOrEqual(1);
  });

  it('sideline crossing detected on the swept path', () => {
    const events = fire({ x: 0, y: 26.5, z: 0 }, { x: 0, y: 30, z: 0 }, 5);
    expect(events.some((e) => e.t === 'SidelineCrossed' && e.side === 1)).toBe(true);
  });

  it('circle entry is detected on a fast ball that jumps the line in one tick', () => {
    // 36 m/s across the top of the D: 1.8 m per tick straddles the line
    const events = fire({ x: 30.2, y: 0, z: 0 }, { x: 36, y: 0, z: 0 }, 2);
    expect(events.some((e) => e.t === 'CircleEntry' && e.end === 1)).toBe(true);
  });

  it('a ball hitting a player body rebounds off it, and the striker is not hit by their own strike', () => {
    const { state } = createMatch({ profile: 'mens', surface: 'watered', players: [
      { id: 1, team: 0, x: 0, y: 0 }, { id: 2, team: 1, x: 6, y: 0 },
    ] }, 1);
    const cmds: Command[] = [
      { tick: 0, kind: 'placeBall', x: 0.9, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      { tick: 0, kind: 'strike', playerId: 1, strike: 'hit', angle: 0, power: 0.7 },
    ];
    let vxAfterHit: number | null = null;
    const events: MatchEvent[] = [];
    for (let i = 0; i < 20; i++) {
      const ev = tick(state, cmds);
      events.push(...ev);
      if (vxAfterHit === null && ev.some((e) => e.t === 'BallCollision' && e.surface === 'player')) vxAfterHit = state.ball.vel.x;
    }
    const hits = events.filter((e) => e.t === 'BallCollision' && e.surface === 'player');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.t === 'BallCollision' && hits[0].playerId).toBe(2);
    expect(vxAfterHit ?? 1).toBeLessThan(0); // came back off the defender
  });

  it('never emits CollisionCapHit in the busy sandbox and terminates', () => {
    const { state } = createMatch({ profile: 'mens', surface: 'dry', players: [
      { id: 1, team: 0, x: HALF_LENGTH - 0.3, y: 0.5 }, { id: 2, team: 0, x: HALF_LENGTH - 0.6, y: -0.6 },
    ] }, 3);
    const cmds: Command[] = [{ tick: 0, kind: 'placeBall', x: HALF_LENGTH - 2, y: 0, z: 0.5, vx: 30, vy: 2, vz: 4 }];
    const events: MatchEvent[] = [];
    for (let i = 0; i < 40; i++) events.push(...tick(state, cmds));
    // The cap exists as a bug signal; if it fires here we want to know, so assert it doesn't.
    expect(events.some((e) => e.t === 'CollisionCapHit')).toBe(false);
  });

  it('a strike aims the stick and launches with the profile speed', () => {
    const { state } = createMatch({ profile: 'womens', surface: 'watered', players: [{ id: 7, team: 0, x: 0, y: 0 }] }, 5);
    const ev = tick(state, [
      { tick: 0, kind: 'placeBall', x: 0.8, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      { tick: 0, kind: 'strike', playerId: 7, strike: 'flick', angle: dmath.HALF_PI, power: 1 },
    ]);
    const struck = ev.find((e) => e.t === 'BallStruck');
    expect(struck?.t === 'BallStruck' && struck.speed).toBeCloseTo(26, 6);
    expect(state.ball.vel.z).toBeGreaterThan(0);
    expect(state.ball.vel.y).toBeGreaterThan(20);
  });
});
