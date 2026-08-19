/**
 * Fixture generation — TWO modes from day one (BRIEF Phase 6): a double round
 * robin per tier (circle method, home/away alternation, winter break gap), and
 * bracket generation seeded from final standings (title play-offs) plus the
 * play-down between tier 1's second-last and tier 2's runner-up.
 *
 * Belgian-shaped format (2024–25 pages; open question #4 to confirm):
 *   men:   top 4 → semis (single) + final (single); bottom 2 relegated
 *   women: top 4 → semis (single) + two-leg final; bottom 2 relegated
 * We model: top 4 semis + final (two-leg final for the women's profile),
 * bottom club relegated automatically, second-last plays a two-leg play-down
 * against tier 2's runner-up; tier 2 champion promoted automatically.
 */
import { Rng } from '@bullyoff/shared';
import { REGULAR_ROUNDS, type ClubId, type Fixture, type Season, type Tier, type World } from './model.js';

/** Circle-method single round robin for an even number of clubs → rounds of pairs. */
export function roundRobin(clubs: readonly ClubId[]): [ClubId, ClubId][][] {
  const n = clubs.length;
  const arr = [...clubs];
  const rounds: [ClubId, ClubId][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [ClubId, ClubId][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a === undefined || b === undefined) continue;
      // alternate home/away by round parity so no club plays home three times in a row
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    // rotate all but the first
    const last = arr.pop(); if (last !== undefined) arr.splice(1, 0, last);
  }
  return rounds;
}

/** Winter break days: after round 11 (of 22) — a real interval, not a gap in the list. */
export const WINTER_BREAK: [number, number] = [11, 14]; // days 11–14 have no fixtures (training/recovery block)

export function generateFixtures(w: World): Season {
  const rng = new Rng(w.seed, 2000 + w.year);
  const fixtures: Fixture[] = [];
  const dayOf = (round: number): number => (round < REGULAR_ROUNDS / 2 ? round : round + (WINTER_BREAK[1] - WINTER_BREAK[0] + 1));
  for (const tier of [1, 2] as Tier[]) {
    const clubs = rng.shuffle(Object.values(w.clubs).filter((c) => c.tier === tier).map((c) => c.id).sort());
    const first = roundRobin(clubs);
    const second = first.map((round) => round.map(([h, a]) => [a, h] as [ClubId, ClubId]));
    [...first, ...second].forEach((round, r) => {
      for (const [home, away] of round) {
        fixtures.push({ id: w.nextFixtureId++, day: dayOf(r), tier, phase: 'regular', home, away, played: false, seed: rng.nextU32() });
      }
    });
  }
  const regularDays = dayOf(REGULAR_ROUNDS - 1) + 1;
  return {
    year: w.year, days: regularDays + 4, day: 0, winterBreak: WINTER_BREAK, fixtures,
    regularDone: false, playoffs: [], playdowns: null, finished: false,
  };
}

/** Bracket from standings: 1v4, 2v3 semis (higher seed at home), final. `twoLegFinal` per profile. */
export function generatePlayoffs(w: World, tier: Tier, standings: ClubId[], twoLegFinal: boolean): { semis: Fixture[]; nextDay: number } {
  const rng = new Rng(w.seed, 3000 + w.year + tier);
  const s = w.season;
  const day = s.day; // play-offs start on the day after the regular phase ends (caller sets)
  const [c1, c2, c3, c4] = standings;
  if (!c1 || !c2 || !c3 || !c4) return { semis: [], nextDay: day };
  const semis: Fixture[] = [
    { id: w.nextFixtureId++, day, tier, phase: 'playoff-semi', home: c1, away: c4, played: false, seed: rng.nextU32(), tieId: 1 },
    { id: w.nextFixtureId++, day, tier, phase: 'playoff-semi', home: c2, away: c3, played: false, seed: rng.nextU32(), tieId: 2 },
  ];
  void twoLegFinal;
  return { semis, nextDay: day + 1 };
}

export function generateFinal(w: World, tier: Tier, a: ClubId, b: ClubId, day: number, twoLeg: boolean): Fixture[] {
  const rng = new Rng(w.seed, 3100 + w.year + tier);
  if (!twoLeg) return [{ id: w.nextFixtureId++, day, tier, phase: 'playoff-final', home: a, away: b, played: false, seed: rng.nextU32(), tieId: 3 }];
  return [
    { id: w.nextFixtureId++, day, tier, phase: 'playoff-final', home: b, away: a, played: false, seed: rng.nextU32(), tieId: 3, leg: 1 },
    { id: w.nextFixtureId++, day: day + 1, tier, phase: 'playoff-final', home: a, away: b, played: false, seed: rng.nextU32(), tieId: 3, leg: 2 },
  ];
}

export function generatePlaydown(w: World, tier1Club: ClubId, tier2Club: ClubId, day: number): Fixture[] {
  const rng = new Rng(w.seed, 3200 + w.year);
  return [
    { id: w.nextFixtureId++, day, tier: 1, phase: 'playdown', home: tier2Club, away: tier1Club, played: false, seed: rng.nextU32(), tieId: 4, leg: 1 },
    { id: w.nextFixtureId++, day: day + 1, tier: 1, phase: 'playdown', home: tier1Club, away: tier2Club, played: false, seed: rng.nextU32(), tieId: 4, leg: 2 },
  ];
}
