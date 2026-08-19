/**
 * World creation: two tiers of fictional clubs with generated squads. This is a
 * Phase 6 *placeholder generator* — Phase 8 (worldgen) replaces names, colours,
 * history and the real-club blocklist. Everything is derived from the seed.
 */
import { Rng, clamp } from '@bullyoff/shared';
import { DEFAULT_TACTICS, attributesFor, type Attributes, type ProfileId, type Role } from '@bullyoff/engine';
import { TIER_SIZE, type Club, type ClubId, type Person, type World } from './model.js';
import { generateFixtures } from './fixtures.js';

// Fictional, deliberately generic pools (BRIEF §7): no real club may appear here — nor anything that reads like one
// (Phase 8's worldgen adds the proper real-club blocklist; until then the test greps a shortlist).
const TOWNS = ['Berkendael', 'Zavelberg', 'Molenhoek', 'Kruisveld', 'Lindehout', 'Waterheide', 'Hoogland', 'Steenakker', 'Roosbeke', 'Vaartzicht', 'Ekkerhout', 'Bosdaal', 'Meerlaan', 'Zilverberg', 'Kapelveld', 'Duinhoek', 'Ravelstein', 'Wolvendaal', 'Espenhof', 'Klaverdries', 'Heidebos', 'Zonneveld', 'Merelbroek', 'Torendaal'];
const SUFFIX = ['HC', 'Hockey', 'HC', 'Royal', 'HC', 'Club', 'HC', 'Athletic'];
const FIRST_M = ['Arthur', 'Louis', 'Victor', 'Noah', 'Lucas', 'Jules', 'Liam', 'Gabriel', 'Adam', 'Maxime', 'Thomas', 'Simon', 'Nathan', 'Emile', 'Felix', 'Cyriel', 'Wout', 'Tom', 'Tuur', 'Seppe', 'Milan', 'Nicolas', 'Antoine', 'Loïc'];
const FIRST_W = ['Emma', 'Louise', 'Olivia', 'Alice', 'Juliette', 'Marie', 'Lotte', 'Nora', 'Elise', 'Charlotte', 'Camille', 'Fien', 'Julie', 'Anna', 'Lena', 'Ambre', 'Margaux', 'Amber', 'Justine', 'Hanne', 'Lore', 'Sarah', 'Ella', 'Léa'];
const LAST = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Dupont', 'Martin', 'Simon', 'Laurent', 'Lemaire', 'Leroy', 'Vermeulen', 'Van den Berg', 'De Wilde', 'Hendrickx', 'Michiels', 'Vandenbroucke', 'Coppens', 'Vervoort', 'Segers', 'Aerts', 'Renard', 'Bertrand'];
const NAT = ['BEL', 'BEL', 'BEL', 'BEL', 'BEL', 'NED', 'FRA', 'GER', 'ESP', 'ARG'];

const ROLES_SQUAD: Role[] = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD', 'FWD'];

export interface WorldOptions {
  /** Squads per tier; default 12. */
  tierSize?: number;
  /** Mean club level in tier 1 (tier 2 ≈ 2.5 lower). */
  tier1Level?: number;
  /** Starting year label. */
  year?: number;
}

export function createWorld(seed: number, profile: ProfileId, opts: WorldOptions = {}): World {
  const rng = new Rng(seed, 1001);
  const size = opts.tierSize ?? TIER_SIZE;
  const year = opts.year ?? 2026;
  const t1 = opts.tier1Level ?? 12.5;
  const towns = rng.shuffle([...TOWNS]).slice(0, size * 2);
  const clubs: Record<ClubId, Club> = {};
  const persons: Record<number, Person> = {};
  let nextPersonId = 1;
  towns.forEach((town, i) => {
    const tier = i < size ? 1 : 2;
    const level = clamp((tier === 1 ? t1 : t1 - 2.5) + rng.gaussian(0, 1.1), 6, 18);
    const id = `c${i + 1}`;
    const name = `${town} ${SUFFIX[rng.int(SUFFIX.length)] ?? 'HC'}`;
    clubs[id] = {
      id, name, short: town.slice(0, 3).toUpperCase(), colours: [rng.nextU32() & 0xffffff, rng.nextU32() & 0xffffff],
      tier, level, reputation: clamp(50 + (level - 12) * 8 + rng.gaussian(0, 6), 5, 95), facilities: clamp(Math.round(2.5 + (level - 12) * 0.4 + rng.gaussian(0, 0.5)), 1, 5),
      tactics: { ...DEFAULT_TACTICS, pressHeight: clamp(0.55 + rng.gaussian(0, 0.15), 0.1, 0.95), defensiveLine: clamp(0.45 + rng.gaussian(0, 0.15), 0.1, 0.9), tempo: clamp(0.5 + rng.gaussian(0, 0.15), 0.1, 0.9) },
      finances: { balance: Math.round(20000 + level * 5000 + rng.gaussian(0, 8000)), membershipIncome: 0, sponsorIncome: 0, facilityCosts: 0, travelCosts: 0, coachingCosts: 0 },
      surface: rng.chance(0.75) ? 'watered' : 'dry',
      seasonsInTier: 0,
    };
    // squad of 18 + 6 youth
    for (const role of ROLES_SQUAD) {
      const p = makePerson(nextPersonId++, rng, profile, role, level, year, false);
      p.club = id; persons[p.id] = p;
    }
    for (let y = 0; y < 6; y++) {
      const role: Role = (['DEF', 'MID', 'FWD', 'GK', 'MID', 'FWD'] as Role[])[y] ?? 'MID';
      const p = makePerson(nextPersonId++, rng, profile, role, level - 4, year, true);
      p.club = id; persons[p.id] = p;
    }
  });
  const world: World = {
    seed, profile, year, clubs, persons, nextPersonId, nextFixtureId: 1,
    season: null as unknown as World['season'], history: [], userClub: null,
  };
  world.season = generateFixtures(world);
  return world;
}

export function makePerson(id: number, rng: Rng, profile: ProfileId, role: Role, clubLevel: number, year: number, youth: boolean): Person {
  const age = youth ? 15 + rng.int(3) : Math.max(17, Math.round(clamp(rng.gaussian(24.5, 4.5), 17, 37)));
  const level = clamp(clubLevel + rng.gaussian(0, 1.4) - (youth ? 0 : Math.max(0, (age - 30) * 0.4)) - (age < 20 ? (20 - age) * 0.6 : 0), 3, 20);
  const attrs: Attributes = attributesFor(role, Math.round(level));
  // hidden attributes — the amateur-hockey story lives here (BRIEF §5.3)
  attrs.hidden.potential = clamp(Math.round(level + (age < 22 ? rng.range(0, 6) : rng.range(-1, 1))), 1, 20);
  attrs.hidden.injuryProneness = clamp(Math.round(rng.gaussian(10, 4)), 1, 20);
  attrs.hidden.consistency = clamp(Math.round(rng.gaussian(11, 3)), 1, 20);
  attrs.hidden.bigMatch = clamp(Math.round(rng.gaussian(10, 4)), 1, 20);
  attrs.hidden.coachability = clamp(Math.round(rng.gaussian(11, 4)), 1, 20);
  attrs.hidden.ambition = clamp(Math.round(rng.gaussian(10, 4)), 1, 20);
  // life pressure peaks at 17–18 (studies) and mid-20s (work/family) — drives drop-off
  const lp = age >= 17 && age <= 18 ? 13 : age >= 24 && age <= 27 ? 12 : 8;
  attrs.hidden.lifePressure = clamp(Math.round(lp + rng.gaussian(0, 3)), 1, 20);
  const firsts = profile === 'womens' ? FIRST_W : FIRST_M;
  return {
    id, first: firsts[rng.int(firsts.length)] ?? 'A', last: LAST[rng.int(LAST.length)] ?? 'B', born: year - age,
    nationality: NAT[rng.int(NAT.length)] ?? 'BEL', role, attrs, club: null, youth, injuredDays: 0,
    availability: clamp(1 - attrs.hidden.lifePressure / 40, 0.5, 1), minutes: 0, goals: 0, retired: false,
  };
}

export const ageOf = (p: Person, year: number): number => year - p.born;
export const clubPlayers = (w: World, club: ClubId, includeYouth = false): Person[] =>
  Object.values(w.persons).filter((p) => p.club === club && !p.retired && (includeYouth || !p.youth)).sort((a, b) => a.id - b.id);
