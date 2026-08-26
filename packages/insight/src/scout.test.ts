/**
 * The scouting report has to be honest: every line must follow from a match that was actually
 * played, and the counter it suggests must follow from a line in the report. A report that invents
 * a threat is worse than no report — the coach would plan against a ghost.
 *
 * The fixtures here are filled in by hand rather than played through the engine: what is under test
 * is the reading of a season, not the season itself, and a hand-filled result is exact.
 */
import { describe, expect, it } from 'vitest';
import { createWorld, type ClubId, type World } from '@bullyoff/season';
import type { MatchStats } from '@bullyoff/engine';
import { pcCandidates, scoutOpponent } from './scout.js';

const stats = (over: Partial<MatchStats> = {}): MatchStats => ({
  seed: 1, profile: 'mens', goals: [1, 1], pcAwarded: [3, 3], pcGoals: [1, 1], psAwarded: [0, 0], psGoals: [0, 0],
  circleEntries: [12, 12], shots: [8, 8], shotsOnTarget: [4, 4], cards: { green: 0, yellow: 0, red: 0 },
  fouls: 14, restarts: 40, tackles: 30, substitutions: 4, ticks: 84000, ...over,
});

/**
 * Play `results` for `them` by hand: [goalsFor, goalsAgainst] per match day, most recent last.
 * `their` is stated from their side and mirrored onto the right half of the stats, because a club
 * is home in one fixture and away in the next — the same mistake the report itself must not make.
 */
function withResults(results: [number, number][], their: { pc?: [number, number]; fouls?: number } = {}): { w: World; them: ClubId } {
  const w = createWorld(7, 'mens');
  const them = Object.keys(w.clubs)[0] ?? 'c1';
  const theirs = w.season.fixtures.filter((f) => f.home === them || f.away === them).sort((a, b) => a.day - b.day);
  results.forEach(([gf, ga], i) => {
    const f = theirs[i];
    if (!f) return;
    const home = f.home === them;
    f.played = true;
    f.result = { home: home ? gf : ga, away: home ? ga : gf };
    const pcA = their.pc?.[0] ?? 3, pcG = their.pc?.[1] ?? 1;
    f.stats = stats({
      goals: [home ? gf : ga, home ? ga : gf],
      pcAwarded: home ? [pcA, 2] : [2, pcA],
      pcGoals: home ? [pcG, 0] : [0, pcG],
      ...(their.fouls === undefined ? {} : { fouls: their.fouls }),
    });
  });
  return { w, them };
}

describe('scouting the opposition', () => {
  it('an opponent nobody has seen yet gets one honest line and no plan', () => {
    const w = createWorld(3, 'mens');
    const them = Object.keys(w.clubs)[1] ?? 'c2';
    const r = scoutOpponent(w, them);
    expect(r.played).toBe(0);
    expect(r.lines.map((l) => l.i18nKey)).toEqual(['scout.unseen']);
    expect(r.plan).toBeNull();
  });

  it('counts only matches that were played, adds the goals up, and reads the form most recent first', () => {
    const { w, them } = withResults([[3, 1], [0, 2], [2, 2]]);
    const r = scoutOpponent(w, them);
    expect(r.played).toBe(3);
    expect(r.goalsFor).toBe(5);
    expect(r.goalsAgainst).toBe(5);
    expect(r.form).toEqual(['D', 'L', 'W']); // most recent first
    for (const l of r.lines) expect(l.i18nKey.startsWith('scout.')).toBe(true);
  });

  it('a side that lives off corners is flagged, and the counter is to stop giving them away', () => {
    const { w, them } = withResults([[2, 1], [3, 0]], { pc: [8, 3] });
    const r = scoutOpponent(w, them);
    const pc = r.lines.find((l) => l.kind === 'pcThreat');
    expect(pc?.strong).toBe(true);
    expect(pc?.params['pcs']).toBe(8);
    expect(pc?.params['share']).toBe(38); // 3 of 8
    expect(r.plan?.i18nKey).toBe('scout.plan.disciplineInD');
    expect(r.plan?.from).toBe('pcThreat');
  });

  it('a leaky defence is flagged and argues for attacking early', () => {
    const { w, them } = withResults([[1, 4], [0, 3], [2, 5]], { pc: [1, 0] });
    const r = scoutOpponent(w, them);
    expect(r.lines.some((l) => l.kind === 'leaky')).toBe(true);
    expect(r.plan?.i18nKey).toBe('scout.plan.attackEarly');
  });

  it('with nothing loud in the numbers the plan follows their pressing system', () => {
    const { w, them } = withResults([[1, 1], [2, 2]], { pc: [2, 0], fouls: 10 });
    const club = w.clubs[them];
    if (!club) throw new Error('no club');
    club.tactics.press = 'full';
    expect(scoutOpponent(w, them).plan?.i18nKey).toBe('scout.plan.overTheTop');
    club.tactics.press = 'zone';
    expect(scoutOpponent(w, them).plan?.i18nKey).toBe('scout.plan.patientWide');
  });

  it('the counter always follows from a line that is in the report', () => {
    for (const results of [[[3, 1]], [[0, 4], [1, 5]], [[2, 2], [1, 1], [0, 0]]] as [number, number][][]) {
      const { w, them } = withResults(results);
      const r = scoutOpponent(w, them);
      if (!r.plan) continue;
      expect(r.lines.some((l) => l.kind === r.plan?.from)).toBe(true);
    }
  });
});

describe('the penalty-corner read', () => {
  const player = (id: number, name: string, tech: Partial<Record<'dragFlick' | 'hit' | 'elimination' | 'push' | 'skills3d' | 'firstTouch', number>>) =>
    ({ id, name, attrs: { technical: { dragFlick: 5, hit: 5, elimination: 5, push: 5, skills3d: 5, firstTouch: 5, ...tech } } });

  it('names the flicker for a drag flick and the striker of the ball for a low hit', () => {
    const out = pcCandidates([player(1, 'Flicker', { dragFlick: 18 }), player(2, 'Hitter', { hit: 17 }), player(3, 'Plain', {})]);
    expect(out.find((c) => c.variant === 'dragFlick')?.name).toBe('Flicker');
    expect(out.find((c) => c.variant === 'lowHit')?.name).toBe('Hitter');
    expect(out.find((c) => c.variant === 'dragFlick')?.rating).toBe(90); // 18 of 20
  });

  it('is sorted best first, so the top option is the routine these players can actually play', () => {
    const out = pcCandidates([player(1, 'Deflector', { skills3d: 19, firstTouch: 19 }), player(2, 'Plain', {})]);
    expect(out[0]?.variant).toBe('deflection');
    expect(out.map((c) => c.rating)).toEqual([...out.map((c) => c.rating)].sort((a, b) => b - a));
  });

  it('an empty pitch names nobody rather than guessing', () => {
    for (const c of pcCandidates([])) { expect(c.playerId).toBeNull(); expect(c.rating).toBe(0); }
  });
});
