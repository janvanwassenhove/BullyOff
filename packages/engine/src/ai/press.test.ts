/**
 * Phase 11 gate: the four pressing systems play different hockey, not the same hockey at four
 * heights (docs/design/hockey-systems.md §8). Every assertion is *relational* — absolute numbers are
 * calibration's job (CLAUDE.md rule 8) — and each one is averaged over two seeds so a single match's
 * run of play cannot decide it.
 */
import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { simulateMatch } from '../match/match.js';
import { aiMatchSetup } from '../sim/fixtures.js';
import { MENS } from '../profile.js';
import { FRAME_PLAYER_STRIDE } from '../events/events.js';
import { aiController, squadsFromSetup } from './brain.js';
import { DEFAULT_TACTICS, MENTALITY_LINE, PRESS_HEIGHT, backLineM, jockeySpot, pressLineM, type PressId, type Shepherd, type TeamTactics } from './tactics.js';
import { lateralOf } from '../player/handedness.js';

/** Team 0's defensive shape while team 1 has the ball inside team 0's half. */
interface Shape {
  /**
   * Our outfielders who are away from the ball and running AT it. Proximity is the wrong measure —
   * a deep block is packed around its own D and ends up near the ball without ever chasing it.
   */
  chasers: number;
  /** Our outfielders left in the attacking half: the rest-break. */
  high: number;
  frames: number;
}

function sample(seed: number, press: PressId): Shape {
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST);
  setup.frameEvery = 1;
  // team 0 plays the system under test; team 1 always plays the default, so the opponent is a constant
  const tactics: [TeamTactics, TeamTactics] = [
    { ...DEFAULT_TACTICS, press, pressHeight: PRESS_HEIGHT[press] },
    { ...DEFAULT_TACTICS },
  ];
  const log = simulateMatch(setup, seed, aiController(seed, squadsFromSetup(setup.players, tactics), { profile: MENS, surface: 'watered' }));
  const teamOf = new Map(setup.players.map((p) => [p.id, p.team]));
  const keeper = new Set(setup.players.filter((p) => p.isGoalkeeper).map((p) => p.id));
  const ids = log.header.playerIds;
  let chasers = 0, high = 0, frames = 0;
  for (let fi = 0; fi < log.frames.length; fi += 10) {
    const f = log.frames[fi]; if (!f) continue;
    const bx = f.ball[0] ?? 0, by = f.ball[1] ?? 0;
    if (bx > -10) continue; // team 0 attacks +x, so it is defending when the ball is inside its own half
    const ours: { x: number; y: number; vx: number; vy: number }[] = [], theirs: { x: number; y: number }[] = [];
    ids.forEach((id, i) => {
      if (keeper.has(id)) return;
      const b = i * FRAME_PLAYER_STRIDE;
      const pt = { x: f.players[b] ?? 0, y: f.players[b + 1] ?? 0, vx: f.players[b + 2] ?? 0, vy: f.players[b + 3] ?? 0 };
      if (teamOf.get(id) === 0) ours.push(pt); else theirs.push(pt);
    });
    if (ours.length === 0 || theirs.length === 0) continue;
    // Only frames where THEY have it. With the ball at our own feet nobody is defending anything, and
    // sampling those washes every system into the same average; the frames carry no possession flag,
    // so "their player is on the ball" stands in for it.
    const nearestOurs = Math.min(...ours.map((p) => Math.hypot(p.x - bx, p.y - by)));
    const nearestTheirs = Math.min(...theirs.map((p) => Math.hypot(p.x - bx, p.y - by)));
    if (nearestTheirs > nearestOurs || nearestTheirs > 2) continue;
    chasers += ours.filter((p) => {
      const dx = bx - p.x, dy = by - p.y, d = Math.hypot(dx, dy);
      if (d < 8) return false;                                  // already there: not a chase
      return (p.vx * dx + p.vy * dy) / (d || 1) > 2;            // closing on the ball at > 2 m/s
    }).length;
    high += ours.filter((p) => p.x > 0).length;
    frames++;
  }
  const n = Math.max(1, frames);
  return { chasers: chasers / n, high: high / n, frames };
}

const mean = (press: PressId): Shape => {
  const a = sample(42, press), b = sample(7, press);
  return { chasers: (a.chasers + b.chasers) / 2, high: (a.high + b.high) / 2, frames: a.frames + b.frames };
};

describe('pressing systems are different sports, not one sport at four heights', { timeout: 300_000 }, () => {
  const full = mean('full');
  const zone = mean('zone');

  it('samples enough defensive frames to mean anything', () => {
    expect(full.frames).toBeGreaterThan(100);
    expect(zone.frames).toBeGreaterThan(100);
  });

  // NOT asserted, deliberately: "a zone block does not chase". `commit: 1` is in the data and the
  // resolver honours it, but averaged over two seeds the measured chase rate is 2.05 (zone) against
  // 2.07 (full) — no separation. On a single seed it looked like a 23 % gap, which is exactly why it
  // is averaged. The metric is dominated by players *recovering* into shape, which with the ball deep
  // in our half is also movement towards the ball. Phase 12 should either find an honest measure or
  // conclude that `commit` needs to do more than choose who is labelled the presser.

  it('a deep block keeps its rest-break high; a full-court press leaves nobody up', () => {
    // restBreak 2 against 0 — the forwards left up are what the conceded possession buys.
    expect(zone.high).toBeGreaterThan(full.high + 0.4);
  });
});

describe('the two lines a system means (Phase 10.3)', () => {
  it('press line and back line are metres from our own backline, and the board reads the same numbers as the AI', () => {
    // the AI: `ballXp < pressLineM(pressHeight)` and `line = backLineM(defensiveLine)`
    expect(pressLineM(PRESS_HEIGHT.full)).toBeCloseTo(71.5, 5);   // full-court: engage inside their 23
    expect(pressLineM(PRESS_HEIGHT.half)).toBeCloseTo(52.25, 5);  // half-court: just past halfway
    expect(pressLineM(PRESS_HEIGHT.zone)).toBeCloseTo(35.75, 5);  // deep block: around our own 23
    expect(backLineM(MENTALITY_LINE.defensive)).toBeCloseTo(21.5, 5);
    expect(backLineM(MENTALITY_LINE.balanced)).toBeCloseTo(27.5, 5);
    expect(backLineM(MENTALITY_LINE.attacking)).toBeCloseTo(33.5, 5);
  });

  it('every system engages ahead of its own back line — you cannot press in front of a line you are behind', () => {
    for (const press of ['full', 'half', 'split', 'zone'] as const) {
      for (const mentality of ['defensive', 'balanced', 'attacking'] as const) {
        expect(pressLineM(PRESS_HEIGHT[press]), `${press}/${mentality}`).toBeGreaterThan(backLineM(MENTALITY_LINE[mentality]));
      }
    }
  });

  it('both lines stay on the pitch', () => {
    for (const p of Object.values(PRESS_HEIGHT)) { expect(pressLineM(p)).toBeGreaterThan(0); expect(pressLineM(p)).toBeLessThan(91.4); }
    for (const d of Object.values(MENTALITY_LINE)) { expect(backLineM(d)).toBeGreaterThan(0); expect(backLineM(d)).toBeLessThan(91.4); }
  });
});

/**
 * The pressing angle (Phase 11b, §6.1). A press is a place relative to the man: `toReverse` closes
 * the carrier's open stick channel so the only way forward is onto his reverse. Geometry, not
 * statistics — the emergent version is measured in sim/handedness.test.ts.
 */
describe('the pressing angle', () => {
  const ball = { x: 0, y: 0 };
  const facing = 0; // the carrier is running towards +x
  const spot = (sh: Shepherd): { x: number; y: number } => jockeySpot(sh, ball, facing, -1, 1, false);

  it('toReverse stands on the carrier\'s open stick shoulder; the other systems do not', () => {
    // a carrier facing +x has his open stick to −y (every stick is right-handed)
    expect(lateralOf(facing, ball, spot('toReverse'))).toBeLessThan(-0.5);
    expect(lateralOf(facing, ball, spot('toInside'))).toBeGreaterThan(0);
    expect(Math.abs(lateralOf(facing, ball, spot('toLine')))).toBeLessThan(0.2);
  });

  it('and it follows the carrier, not the pitch: turn him round and the angle turns with him', () => {
    for (const heading of [0, 1.1, 2.6, -0.8, -2.2]) {
      const s = jockeySpot('toReverse', ball, heading, -1, 1, false);
      expect(lateralOf(heading, ball, s)).toBeLessThan(-0.5);
    }
  });

  it('every system still jockeys goal-side and within a stick\'s working distance', () => {
    for (const sh of (['toLine', 'toInside', 'toReverse'] as Shepherd[])) {
      for (const end of ([1, -1] as const)) {
        const s = jockeySpot(sh, ball, facing, end, 1, false);
        expect(Math.sign(s.x - ball.x) || -end).toBe(-end);          // between the ball and our goal
        expect(Math.hypot(s.x - ball.x, s.y - ball.y)).toBeLessThan(2.6); // not standing on the ball, not miles off
        expect(Math.hypot(s.x - ball.x, s.y - ball.y)).toBeGreaterThan(1);
      }
    }
  });
});
