/**
 * Season/world data model (Phase 6). Plain serialisable objects — this is what
 * a save file contains (ADR-007). No class instances, no Maps.
 *
 * Two independent pyramids (men's, women's) are two independent Worlds; a save
 * holds one World (BRIEF §5.0: the coach picks a competition).
 */
import type { Attributes, MatchStats, ProfileId, Role, SurfaceState, ReplayFile } from '@bullyoff/engine';
import type { TeamTactics } from '@bullyoff/engine';
import type { Country, ClubLang } from '@bullyoff/worldgen';

export type { Country, ClubLang } from '@bullyoff/worldgen';
/** The nine nations of the nations competition (Pro League format). Codes match Person.nationality. */
export type NationId = 'BEL' | 'NED' | 'GER' | 'GBR' | 'FRA' | 'ESP' | 'ARG' | 'AUS' | 'IND';

export type ClubId = string;
export type PersonId = number;
export type FixtureId = number;
export type Tier = 1 | 2;

export interface Person {
  id: PersonId;
  first: string;
  last: string;
  /** Birth year (season index space, e.g. 2008). */
  born: number;
  nationality: string;
  role: Role;
  attrs: Attributes;
  club: ClubId | null;
  /** Youth academy member (not first squad) */
  youth: boolean;
  /** Match-days unavailable due to injury (0 = fit). */
  injuredDays: number;
  /** Availability this season 0..1 (studies/work/family — BRIEF §5.3 life pressure). */
  availability: number;
  /** Cumulative match minutes this season (rotation bookkeeping). */
  minutes: number;
  /** Season goals. */
  goals: number;
  retired: boolean;
}

export interface Finances {
  balance: number;       // €
  membershipIncome: number;
  sponsorIncome: number;
  facilityCosts: number;
  travelCosts: number;
  coachingCosts: number;
}

export interface ClubBadge { shape: string; motif: string; split: string }

/** A coach's team sheet: person ids in formation-slot order (GK first), and the bench. */
export interface Lineup { starters: number[]; bench: number[] }

/** Penalty-corner roles as person ids; null = let the assistant pick that role. */
export interface PcBatteryPicks { injector: number | null; trapper: number | null; striker: number | null }

export interface Club {
  id: ClubId;
  name: string;
  short: string;
  colours: [number, number];
  /** Phase 8 identity (worldgen): invented town, language community, optional nickname, badge, founding year. */
  town: string;
  lang: ClubLang;
  /** Which national league the club plays in. */
  country: Country;
  nickname: string | null;
  badge: ClubBadge;
  founded: number;
  /** Titles and promotions from generated history onwards (season years). */
  honours: { titles: number[]; promotions: number[] };
  tier: Tier;
  /** Squad quality anchor 1–20; players are generated around it. */
  level: number;
  reputation: number;   // 0..100
  facilities: number;   // 1..5
  tactics: TeamTactics;
  /** The coach's team sheet. null = the assistant picks on form and fitness. */
  lineup: Lineup | null;
  /** Penalty-corner battery, so it holds for simulated match days too. */
  pcBattery: PcBatteryPicks | null;
  /** The captain: a name on the team sheet — the armband has no powers the engine models. */
  captain: number | null;
  finances: Finances;
  /** Home surface state on match days (home club decision — BRIEF §5.2). */
  surface: SurfaceState;
  seasonsInTier: number;
}

export type FixturePhase = 'regular' | 'playoff-semi' | 'playoff-final' | 'playdown' | 'eu-quarter' | 'eu-semi' | 'eu-final';

export interface Fixture {
  id: FixtureId;
  /** Match day index within the season (0-based). */
  day: number;
  tier: Tier;
  phase: FixturePhase;
  /** Which national league the fixture belongs to; the European rounds carry the user country as a label only. */
  country: Country;
  home: ClubId;
  away: ClubId;
  /** For two-legged ties: 1 or 2; the tie id groups both legs. */
  leg?: 1 | 2;
  tieId?: number;
  played: boolean;
  seed: number;
  result?: { home: number; away: number; shootOut?: [number, number] };
  stats?: MatchStats;
  /** Full replay kept only for the user's fixtures (size). */
  replay?: ReplayFile;
}

export interface TableRow { club: ClubId; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }

export interface SeasonSummary {
  year: number;
  champion: ClubId;
  regularWinner: ClubId;
  playoffFinal: [ClubId, ClubId, string];
  promoted: ClubId[];
  relegated: ClubId[];
  /** Phase 12: champions of the foreign leagues, the European knockout and the nations competition. */
  foreignChampions?: Partial<Record<Country, ClubId>>;
  europeChampion?: ClubId | null;
  nationsChampion?: NationId | null;
  topScorer: { person: PersonId; goals: number } | null;
}

export interface Season {
  year: number;
  /** Total match days incl. play-offs. */
  days: number;
  day: number;
  /** Winter break: no fixtures scheduled between these days (inclusive) — training/recovery block. */
  winterBreak: [number, number];
  fixtures: Fixture[];
  /** Filled at the end of the regular phase. */
  regularDone: boolean;
  playoffs: { tier: Tier; country: Country; semis: FixtureId[]; final: FixtureId[]; champion: ClubId | null }[];
  playdowns: { tier1Club: ClubId; tier2Club: ClubId; fixtures: FixtureId[]; winner: ClubId | null } | null;
  /** The European club knockout, played in the winter break (EHL-style block). null before Phase 12. */
  europe: { entrants: ClubId[]; quarters: FixtureId[]; semis: FixtureId[]; final: FixtureId[]; champion: ClubId | null } | null;
  /** The nations competition: a double round robin in a Pro League-like format, resolved off-screen. */
  nations: { fixtures: NationsFixture[]; champion: NationId | null } | null;
  finished: boolean;
}

/** One nations-competition match: no engine, no clubs — resolved from nation strength on its day. */
export interface NationsFixture {
  day: number;
  home: NationId;
  away: NationId;
  played: boolean;
  seed: number;
  result?: { home: number; away: number };
}

/** A national side in the nations competition: named by its country code, strength refreshed each season. */
export interface Nation {
  id: NationId;
  level: number;
  colours: [number, number];
}

export interface World {
  seed: number;
  profile: ProfileId;
  /** Region flavour used for names (worldgen). */
  flavour: 'mixed' | 'vlaanderen' | 'wallonie' | 'bruxelles';
  year: number;
  clubs: Record<ClubId, Club>;
  persons: Record<PersonId, Person>;
  nextPersonId: number;
  nextFixtureId: number;
  season: Season;
  history: SeasonSummary[];
  userClub: ClubId | null;
  /** The country whose league the user coaches in (its fixtures run through the real engine). */
  country: Country;
  /** The nine national sides of the nations competition. */
  nations: Nation[];
  /** Rng state is not stored: every random draw is seeded from (seed, year, fixture id / person id) so saves resume identically. */
}

export const TIER_SIZE = 12;
/** Regular season match days: 22 (double round-robin) + winter break gap. */
export const REGULAR_ROUNDS = 22;
