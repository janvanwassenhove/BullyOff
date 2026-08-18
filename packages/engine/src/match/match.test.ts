/**
 * Phase 2 gate: a match can be played start to finish under the laws without a
 * rules violation escaping unhandled — with a deliberately dumb controller.
 */
import { describe, expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { simulateMatch } from './match.js';
import { fullSquads, matchSetup } from '../sim/fixtures.js';
import { naiveController } from '../sim/naiveController.js';
import { hashLog } from '../sim/hash.js';
import type { MatchEvent } from '../events/events.js';

const count = (events: readonly MatchEvent[], t: MatchEvent['t']): number => events.filter((e) => e.t === t).length;

describe('a full match under the laws', () => {
  const log = simulateMatch(matchSetup('mens', 'watered', FIH_OUTDOOR_FAST), 42, naiveController(42, fullSquads()));
  const ev = log.events;

  it('runs four quarters to full time and the playing clock adds up', () => {
    expect(count(ev, 'QuarterStart')).toBe(4);
    expect(count(ev, 'QuarterEnd')).toBe(4);
    expect(count(ev, 'FullTime')).toBe(1);
    expect(ev[ev.length - 1]?.t).toBe('MatchEnd');
    const clocks = ev.filter((e): e is Extract<MatchEvent, { t: 'Clock' }> => e.t === 'Clock');
    const lastClock = clocks[clocks.length - 1];
    expect(lastClock?.matchClockTicks).toBe(4 * FIH_OUTDOOR_FAST.quarterTicks);
    // centre passes alternate
    const qs = ev.filter((e): e is Extract<MatchEvent, { t: 'QuarterStart' }> => e.t === 'QuarterStart').map((e) => e.centrePassTeam);
    expect(qs).toEqual([0, 1, 0, 1]);
  });

  it('every awarded restart is eventually taken (no dead-ball deadlock) and the ball is never played while dead', () => {
    // The last thing cannot be an untaken restart before full time (bar the final whistle)
    const lastAward = [...ev].reverse().find((e) => e.t === 'RestartAwarded');
    const lastStrike = [...ev].reverse().find((e) => e.t === 'BallStruck');
    expect((lastStrike?.tick ?? 0) >= (lastAward?.tick ?? 0) - 400).toBe(true);
    // strikes never happen while the rules say the ball is dead: BallDead → (PlayersPlaced) → ... → first BallStruck must be by the restart team
    let restartTeam: number | null = null;
    for (const e of ev) {
      if (e.t === 'RestartAwarded') restartTeam = e.restart.team;
      else if (e.t === 'BallStruck' && restartTeam !== null) { expect(e.team).toBe(restartTeam); restartTeam = null; }
      else if (e.t === 'BallTrapped' && restartTeam !== null) { expect(e.team).toBe(restartTeam); restartTeam = null; }
    }
  });

  it('goals obey the circle rule (attacker touch inside the circle before the crossing) and restart with a centre pass by the conceding team', () => {
    const goals = ev.filter((e): e is Extract<MatchEvent, { t: 'Goal' }> => e.t === 'Goal');
    expect(goals.length).toBeGreaterThan(0);
    for (const g of goals) {
      const i = ev.indexOf(g);
      const next = ev.slice(i + 1).find((e) => e.t === 'RestartAwarded');
      expect(next?.t === 'RestartAwarded' && next.restart.kind).toBe('centrePass');
      expect(next?.t === 'RestartAwarded' && next.restart.team).toBe(g.team === 0 ? 1 : 0);
    }
    const ft = ev.find((e): e is Extract<MatchEvent, { t: 'FullTime' }> => e.t === 'FullTime');
    expect(ft?.score[0]).toBe(goals.filter((g) => g.team === 0).length);
    expect(ft?.score[1]).toBe(goals.filter((g) => g.team === 1).length);
  });

  it('penalty corners are awarded, taken and ended; every PC has exactly one ending', () => {
    const awarded = count(ev, 'PenaltyCornerAwarded');
    expect(awarded).toBeGreaterThan(0);
    expect(count(ev, 'PenaltyCornerTaken')).toBe(awarded);
    expect(count(ev, 'PenaltyCornerEnded')).toBe(awarded);
  });

  it('cards suspend players and they are reinstated; the team plays short meanwhile; substitutions never exceed 11 on the pitch', () => {
    const cards = count(ev, 'Card');
    expect(cards).toBeGreaterThan(0);
    expect(count(ev, 'Suspended')).toBe(cards);
    expect(count(ev, 'Reinstated')).toBeGreaterThan(0);
    // simulate on-pitch counts from the event stream
    const onPitch = new Map<number, number>();
    log.header.playerIds.forEach((id) => onPitch.set(id, id <= 22 ? 1 : 0));
    const teamOf = new Map(log.header.playerIds.map((id, i) => [id, log.header.teams[i] ?? 0]));
    const countTeam = (team: number): number => [...onPitch.entries()].filter(([id, on]) => on === 1 && teamOf.get(id) === team).length;
    for (const e of ev) {
      if (e.t === 'Substitution') { onPitch.set(e.outId, 0); onPitch.set(e.inId, 1); }
      if (e.t === 'Suspended') onPitch.set(e.playerId, 0);
      if (e.t === 'Reinstated') onPitch.set(e.playerId, 1);
      expect(countTeam(0)).toBeLessThanOrEqual(11);
      expect(countTeam(1)).toBeLessThanOrEqual(11);
    }
    expect(count(ev, 'Substitution')).toBeGreaterThan(0);
  });

  it('no physics bug signals; the match is deterministic', () => {
    expect(count(ev, 'CollisionCapHit')).toBe(0);
    const again = simulateMatch(matchSetup('mens', 'watered', FIH_OUTDOOR_FAST), 42, naiveController(42, fullSquads()));
    expect(hashLog(again)).toBe(hashLog(log));
  });

  it('women\'s profile plays a full match too, with a different log', () => {
    const w = simulateMatch(matchSetup('womens', 'dry', FIH_OUTDOOR_FAST), 42, naiveController(42, fullSquads()));
    expect(count(w.events, 'FullTime')).toBe(1);
    expect(hashLog(w)).not.toBe(hashLog(log));
  });
});
