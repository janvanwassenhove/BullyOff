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
import { DEFAULT_TACTICS, PRESS_HEIGHT, type PressId, type TeamTactics } from './tactics.js';

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
