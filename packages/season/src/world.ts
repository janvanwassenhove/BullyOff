/**
 * World creation (Phase 6 loop, Phase 8 identities): two tiers of fictional clubs
 * with generated squads, names from `@bullyoff/worldgen` (nationality-weighted,
 * gendered pools, invented towns, real-club blocklist), and optionally twenty
 * seasons of generated history. Everything is derived from the seed.
 */
import { Rng, clamp } from '@bullyoff/shared';
import { DEFAULT_TACTICS, MENTALITY_LINE, PRESS_HEIGHT, attributesFor, type Attributes, type FormationId, type Mentality, type PressId, type ProfileId, type Role, type TeamTactics } from '@bullyoff/engine';
import { generateClubIdentities, generatePersonName, type Country, type NameCountry, type RegionFlavour } from '@bullyoff/worldgen';
import { TIER_SIZE, type Club, type ClubId, type Person, type World } from './model.js';
import { generateFixtures } from './fixtures.js';
import { buildNations } from './nations.js';
import { newSeason, playSeason } from './season.js';
import { quickRunner } from './matchday.js';

const ROLES_SQUAD: Role[] = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD', 'FWD'];

export interface WorldOptions {
  /** Squads per tier; default 12. */
  tierSize?: number;
  /** Mean club level in tier 1 (tier 2 ≈ 2.5 lower). */
  tier1Level?: number;
  /** Starting year label (the year the career starts). */
  year?: number;
  /** Region flavour for names (nl/fr mix). Default 'mixed'. */
  flavour?: RegionFlavour;
  /**
   * Seasons of generated history before `year` (played with the labelled quick resolver, with the real
   * promotion/relegation, development and retirement rules, so the present squads grew out of that past).
   * Default 0 here; the app asks for 20.
   */
  historyYears?: number;
  /** The country whose league the user will coach in (that country gets two tiers; the others one). */
  country?: Country;
  /** Skip the four foreign leagues, Europe and the nations competition (small structural test worlds). */
  domesticOnly?: boolean;
}

/** Every league country and the strength its top flight is generated around (the Dutch league leads). */
export const LEAGUE_COUNTRIES: Country[] = ['BE', 'NL', 'EN', 'FR', 'DE'];
export const COUNTRY_LEVEL: Record<Country, number> = { NL: 12.4, DE: 12.0, BE: 11.5, EN: 11.0, FR: 10.4 };



export function createWorld(seed: number, profile: ProfileId, opts: WorldOptions = {}): World {
  const rng = new Rng(seed, 1001);
  const size = opts.tierSize ?? TIER_SIZE;
  const history = Math.max(0, Math.floor(opts.historyYears ?? 0));
  const year = (opts.year ?? 2026) - history;
  const flavour = opts.flavour ?? 'mixed';
  const home = opts.country ?? 'BE';
  const t1 = opts.tier1Level ?? COUNTRY_LEVEL[home];
  const clubs: Record<ClubId, Club> = {};
  const persons: Record<number, Person> = {};
  let nextPersonId = 1;
  let clubIndex = 0;
  // Shared reservations so no two clubs in the whole world (a European bracket!) share a town or code.
  const reserved = { towns: new Set<string>(), shorts: new Set<string>() };

  const buildLeague = (country: Country, tiers: 1 | 2, anchor: number): void => {
    const identities = generateClubIdentities(rng, size * tiers, flavour, opts.year ?? 2026, country, reserved).clubs;
    identities.forEach((ident, i) => {
      const tier = i < size ? 1 : 2;
      const level = clamp((tier === 1 ? anchor : anchor - 2.5) + rng.gaussian(0, 1.1), 6, 18);
      const id = `c${++clubIndex}`;
      clubs[id] = {
        id, name: ident.name, short: ident.short, colours: ident.colours, town: ident.town, lang: ident.lang, country, nickname: ident.nickname, badge: ident.badge, founded: ident.founded,
        honours: { titles: [], promotions: [] },
        tier, level, reputation: clamp(50 + (level - 12) * 8 + rng.gaussian(0, 6), 5, 95), facilities: clamp(Math.round(2.5 + (level - 12) * 0.4 + rng.gaussian(0, 0.5)), 1, 5),
        tactics: clubTactics(rng),
        lineup: null, pcBattery: null, captain: null,
        finances: { balance: Math.round(20000 + level * 5000 + rng.gaussian(0, 8000)), membershipIncome: 0, sponsorIncome: 0, facilityCosts: 0, travelCosts: 0, coachingCosts: 0 },
        surface: rng.chance(0.75) ? 'watered' : 'dry',
        seasonsInTier: 0,
      };
      // squad of 18 + 6 youth
      for (const role of ROLES_SQUAD) {
        const p = makePerson(nextPersonId++, rng, profile, role, level, year, false, flavour, country);
        p.club = id; persons[p.id] = p;
      }
      for (let y = 0; y < 6; y++) {
        const role: Role = (['DEF', 'MID', 'FWD', 'GK', 'MID', 'FWD'] as Role[])[y] ?? 'MID';
        const p = makePerson(nextPersonId++, rng, profile, role, level - 4, year, true, flavour, country);
        p.club = id; persons[p.id] = p;
      }
    });
  };

  // The user's country gets the full pyramid (two tiers, promotion and relegation); the other four
  // leagues are a single top flight each — deep enough for a European bracket and a transfer market,
  // shallow enough that a save stays a save.
  buildLeague(home, 2, t1);
  if (!opts.domesticOnly) {
    for (const c of LEAGUE_COUNTRIES) { if (c !== home) buildLeague(c, 1, COUNTRY_LEVEL[c]); }
  }
  const world: World = {
    seed, profile, flavour, year, clubs, persons, nextPersonId, nextFixtureId: 1,
    season: null as unknown as World['season'], history: [], userClub: null,
    country: home, nations: opts.domesticOnly ? [] : buildNations(persons, year),
  };
  world.season = generateFixtures(world);
  if (history > 0) generateHistory(world, history);
  return world;
}

/**
 * Twenty years of a past (Phase 8): play `years` seasons with the labelled quick resolver and the real
 * season rules — champions, play-off finals, promotions and relegations, development, retirements, youth
 * intake, finances — so today's squads and tables are the product of that history. The replays of those
 * seasons are not kept (results and summaries are).
 */
export function generateHistory(world: World, years: number): void {
  for (let i = 0; i < years; i++) {
    playSeason(world, quickRunner);
    newSeason(world);
  }
}

/** A club's board: system, press, mentality, tempo — drawn from what Belgian club sides actually play (4-3-3 dominant). */
function clubTactics(rng: Rng): TeamTactics {
  const formations: FormationId[] = ['4-3-3', '4-3-3', '4-3-3', '3-4-3', '4-4-2', '5-3-2', '3-3-3-1', '4-2-3-1'];
  const presses: PressId[] = ['half', 'half', 'full', 'split', 'zone'];
  const mentalities: Mentality[] = ['balanced', 'balanced', 'attacking', 'defensive'];
  const press = presses[rng.int(presses.length)] ?? 'half';
  const mentality = mentalities[rng.int(mentalities.length)] ?? 'balanced';
  return {
    ...DEFAULT_TACTICS,
    formation: formations[rng.int(formations.length)] ?? '4-3-3', press, mentality,
    pressHeight: clamp(PRESS_HEIGHT[press] + rng.gaussian(0, 0.06), 0.1, 0.95),
    defensiveLine: clamp(MENTALITY_LINE[mentality] + rng.gaussian(0, 0.06), 0.1, 0.9),
    tempo: clamp(0.5 + rng.gaussian(0, 0.15), 0.1, 0.9),
  };
}

export function makePerson(id: number, rng: Rng, profile: ProfileId, role: Role, clubLevel: number, year: number, youth: boolean, flavour: RegionFlavour = 'mixed', country: NameCountry = 'BE'): Person {
  const age = youth ? 15 + rng.int(3) : Math.max(17, Math.round(clamp(rng.gaussian(24.5, 4.5), 17, 37)));
  const level = clamp(clubLevel + rng.gaussian(0, 1.4) - (youth ? 0 : Math.max(0, (age - 30) * 0.4)) - (age < 20 ? (20 - age) * 0.6 : 0), 3, 20);
  const attrs: Attributes = attributesFor(role, Math.round(level));
  // hidden attributes — the amateur-hockey story lives here (BRIEF §5.3)
  attrs.hidden.potential = clamp(Math.round(level + (youth ? rng.range(1, 7) : age < 22 ? rng.range(0, 6) : rng.range(-1, 1))), 1, 20);
  attrs.hidden.injuryProneness = clamp(Math.round(rng.gaussian(10, 4)), 1, 20);
  attrs.hidden.consistency = clamp(Math.round(rng.gaussian(11, 3)), 1, 20);
  attrs.hidden.bigMatch = clamp(Math.round(rng.gaussian(10, 4)), 1, 20);
  attrs.hidden.coachability = clamp(Math.round(rng.gaussian(11, 4)), 1, 20);
  attrs.hidden.ambition = clamp(Math.round(rng.gaussian(10, 4)), 1, 20);
  // life pressure peaks at 17–18 (studies) and mid-20s (work/family) — drives drop-off
  const lp = age >= 17 && age <= 18 ? 13 : age >= 24 && age <= 27 ? 12 : 8;
  attrs.hidden.lifePressure = clamp(Math.round(lp + rng.gaussian(0, 3)), 1, 20);
  const nm = generatePersonName(rng, profile === 'womens' ? 'w' : 'm', flavour, country);
  return {
    id, first: nm.first, last: nm.last, born: year - age,
    nationality: nm.nationality, role, attrs, club: null, youth, injuredDays: 0,
    availability: clamp(1 - attrs.hidden.lifePressure / 40, 0.5, 1), minutes: 0, goals: 0, retired: false,
  };
}

export const ageOf = (p: Person, year: number): number => year - p.born;
export const clubPlayers = (w: World, club: ClubId, includeYouth = false): Person[] =>
  Object.values(w.persons).filter((p) => p.club === club && !p.retired && (includeYouth || !p.youth)).sort((a, b) => a.id - b.id);
