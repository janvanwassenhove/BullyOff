/**
 * Season/world data model (Phase 6). Plain serialisable objects — this is what
 * a save file contains (ADR-007). No class instances, no Maps.
 *
 * Two independent pyramids (men's, women's) are two independent Worlds; a save
 * holds one World (BRIEF §5.0: the coach picks a competition).
 */
import type { Attributes, MatchStats, ProfileId, Role, SurfaceState, ReplayFile } from '@bullyoff/engine';
import type { TeamTactics } from '@bullyoff/engine';

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

export interface Club {
  id: ClubId;
  name: string;
  short: string;
  colours: [number, number];
  /** Phase 8 identity (worldgen): invented town, language community, optional nickname, badge, founding year. */
  town: string;
  lang: 'nl' | 'fr';
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
  finances: Finances;
  /** Home surface state on match days (home club decision — BRIEF §5.2). */
  surface: SurfaceState;
  seasonsInTier: number;
}

export type FixturePhase = 'regular' | 'playoff-semi' | 'playoff-final' | 'playdown';

export interface Fixture {
  id: FixtureId;
  /** Match day index within the season (0-based). */
  day: number;
  tier: Tier;
  phase: FixturePhase;
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
  playoffs: { tier: Tier; semis: FixtureId[]; final: FixtureId[]; champion: ClubId | null }[];
  playdowns: { tier1Club: ClubId; tier2Club: ClubId; fixtures: FixtureId[]; winner: ClubId | null } | null;
  finished: boolean;
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
  /** Rng state is not stored: every random draw is seeded from (seed, year, fixture id / person id) so saves resume identically. */
}

export const TIER_SIZE = 12;
/** Regular season match days: 22 (double round-robin) + winter break gap. */
export const REGULAR_ROUNDS = 22;
