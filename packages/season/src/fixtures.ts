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
import { REGULAR_ROUNDS, type ClubId, type Country, type Fixture, type NationId, type NationsFixture, type Season, type Tier, type World } from './model.js';

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

/** The leagues a world actually contains, in a stable order: (country, tier) pairs with clubs. */
export function leaguesOf(w: World): { country: Country; tier: Tier }[] {
  const out: { country: Country; tier: Tier }[] = [];
  const countries = [...new Set(Object.values(w.clubs).map((c) => c.country))];
  for (const country of countries) {
    for (const tier of [1, 2] as Tier[]) {
      if (Object.values(w.clubs).some((c) => c.country === country && c.tier === tier)) out.push({ country, tier });
    }
  }
  // the user's country first (its screens come first), then alphabetical — stable across saves
  return out.sort((a, b) => (a.country === w.country ? -1 : 0) - (b.country === w.country ? -1 : 0) || a.country.localeCompare(b.country) || a.tier - b.tier);
}

/** How many European places each league gets (8 entrants): the user's country sends two. */
export function europeanSlots(w: World): Partial<Record<Country, number>> {
  const countries = [...new Set(Object.values(w.clubs).map((c) => c.country))];
  if (countries.length < 2) return {};
  const slots: Partial<Record<Country, number>> = {};
  for (const c of countries) slots[c] = c === w.country ? 2 : 1;
  return slots;
}

export function generateFixtures(w: World): Season {
  const rng = new Rng(w.seed, 2000 + w.year);
  const fixtures: Fixture[] = [];
  const dayOf = (round: number): number => (round < REGULAR_ROUNDS / 2 ? round : round + (WINTER_BREAK[1] - WINTER_BREAK[0] + 1));
  for (const { country, tier } of leaguesOf(w)) {
    const clubs = rng.shuffle(Object.values(w.clubs).filter((c) => c.tier === tier && c.country === country).map((c) => c.id).sort());
    const first = roundRobin(clubs);
    const second = first.map((round) => round.map(([h, a]) => [a, h] as [ClubId, ClubId]));
    [...first, ...second].forEach((round, r) => {
      for (const [home, away] of round) {
        fixtures.push({ id: w.nextFixtureId++, day: dayOf(r), tier, phase: 'regular', country, home, away, played: false, seed: rng.nextU32() });
      }
    });
  }
  const regularDays = dayOf(REGULAR_ROUNDS - 1) + 1;
  const season: Season = {
    year: w.year, days: regularDays + 4, day: 0, winterBreak: WINTER_BREAK, fixtures,
    regularDone: false, playoffs: [], playdowns: null,
    europe: null, nations: null, finished: false,
  };
  // The European knockout: eight entrants, quarter-finals in the winter break (real European hockey
  // plays its KO in a block, not in midweeks) — semis and final follow on the next break days.
  const slots = europeanSlots(w);
  if (Object.keys(slots).length > 0) {
    const entrants: ClubId[] = [];
    for (const [country, n] of Object.entries(slots)) {
      const best = Object.values(w.clubs).filter((c) => c.country === country && c.tier === 1)
        .sort((a, b) => europeanRank(w, b.id) - europeanRank(w, a.id) || a.id.localeCompare(b.id)).slice(0, n);
      entrants.push(...best.map((c) => c.id));
    }
    // fill to eight with the best of the rest, league-wide
    const rest = Object.values(w.clubs).filter((c) => c.tier === 1 && !entrants.includes(c.id))
      .sort((a, b) => europeanRank(w, b.id) - europeanRank(w, a.id) || a.id.localeCompare(b.id));
    while (entrants.length < 8 && rest.length) { const c = rest.shift(); if (c) entrants.push(c.id); }
    if (entrants.length === 8) {
      const seeded = [...entrants].sort((a, b) => europeanRank(w, b) - europeanRank(w, a) || a.localeCompare(b));
      const quarters: Fixture[] = [0, 1, 2, 3].map((i) => ({
        id: w.nextFixtureId++, day: WINTER_BREAK[0] + 1, tier: 1, phase: 'eu-quarter' as const, country: w.country,
        home: seeded[i] ?? '', away: seeded[7 - i] ?? '', played: false, seed: rng.nextU32(), tieId: 100 + i,
      }));
      fixtures.push(...quarters);
      season.europe = { entrants, quarters: quarters.map((f) => f.id), semis: [], final: [], champion: null };
    }
  }
  // The nations competition: nine national sides, double round robin (Pro League format — no tiers,
  // no relegation, the table decides). Its rounds run alongside the club season and are resolved
  // off-screen; a round on a break day simply waits for the calendar to pass it.
  if (w.nations.length >= 4) {
    const nrng = new Rng(w.seed, 2500 + w.year);
    const ids = w.nations.map((n) => n.id);
    const rounds = nationsRoundRobin(ids);
    const all = [...rounds, ...rounds.map((r) => r.map(([h, a]) => [a, h] as [NationId, NationId]))];
    const nfx: NationsFixture[] = [];
    all.forEach((round, r) => {
      const day = Math.min(regularDays - 1, Math.round((r * (regularDays - 1)) / Math.max(1, all.length - 1)));
      for (const [home, away] of round) nfx.push({ day, home, away, played: false, seed: nrng.nextU32() });
    });
    season.nations = { fixtures: nfx, champion: null };
  }
  return season;
}

/** European seeding: last season's champion outranks everyone from its league, then club level. */
function europeanRank(w: World, id: ClubId): number {
  const c = w.clubs[id];
  if (!c) return 0;
  const last = w.history[w.history.length - 1];
  const wasChampion = last && (last.champion === id || Object.values(last.foreignChampions ?? {}).includes(id));
  return c.level + (wasChampion ? 5 : 0);
}

/** Circle-method round robin for an odd team count (one bye per round). */
function nationsRoundRobin(ids: readonly NationId[]): [NationId, NationId][][] {
  const arr: (NationId | null)[] = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const n = arr.length;
  const rounds: [NationId, NationId][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [NationId, NationId][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a === null || a === undefined || b === null || b === undefined) continue;
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    const last = arr.pop(); if (last !== undefined) arr.splice(1, 0, last);
  }
  return rounds;
}

/** Bracket from standings: 1v4, 2v3 semis (higher seed at home), final. `twoLegFinal` per profile. */
export function generatePlayoffs(w: World, tier: Tier, country: Country, standings: ClubId[], twoLegFinal: boolean): { semis: Fixture[]; nextDay: number } {
  const rng = new Rng(w.seed, 3000 + w.year + tier);
  const s = w.season;
  const day = s.day; // play-offs start on the day after the regular phase ends (caller sets)
  const [c1, c2, c3, c4] = standings;
  if (!c1 || !c2 || !c3 || !c4) return { semis: [], nextDay: day };
  const semis: Fixture[] = [
    { id: w.nextFixtureId++, day, tier, phase: 'playoff-semi', country, home: c1, away: c4, played: false, seed: rng.nextU32(), tieId: 1 },
    { id: w.nextFixtureId++, day, tier, phase: 'playoff-semi', country, home: c2, away: c3, played: false, seed: rng.nextU32(), tieId: 2 },
  ];
  void twoLegFinal;
  return { semis, nextDay: day + 1 };
}

export function generateFinal(w: World, tier: Tier, country: Country, a: ClubId, b: ClubId, day: number, twoLeg: boolean): Fixture[] {
  const rng = new Rng(w.seed, 3100 + w.year + tier);
  if (!twoLeg) return [{ id: w.nextFixtureId++, day, tier, phase: 'playoff-final', country, home: a, away: b, played: false, seed: rng.nextU32(), tieId: 3 }];
  return [
    { id: w.nextFixtureId++, day, tier, phase: 'playoff-final', country, home: b, away: a, played: false, seed: rng.nextU32(), tieId: 3, leg: 1 },
    { id: w.nextFixtureId++, day: day + 1, tier, phase: 'playoff-final', country, home: a, away: b, played: false, seed: rng.nextU32(), tieId: 3, leg: 2 },
  ];
}

export function generatePlaydown(w: World, country: Country, tier1Club: ClubId, tier2Club: ClubId, day: number): Fixture[] {
  const rng = new Rng(w.seed, 3200 + w.year);
  return [
    { id: w.nextFixtureId++, day, tier: 1, phase: 'playdown', country, home: tier2Club, away: tier1Club, played: false, seed: rng.nextU32(), tieId: 4, leg: 1 },
    { id: w.nextFixtureId++, day: day + 1, tier: 1, phase: 'playdown', country, home: tier1Club, away: tier2Club, played: false, seed: rng.nextU32(), tieId: 4, leg: 2 },
  ];
}
