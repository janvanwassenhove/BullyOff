/**
 * @bullyoff/season — the season loop: clubs, squads, fixtures (round-robin +
 * play-off brackets), tables, match days through the engine, development,
 * injuries, finances, promotion/relegation, versioned saves.
 */
export const PACKAGE_NAME = '@bullyoff/season' as const;
export * from './model.js';
export { createWorld, generateHistory, makePerson, ageOf, clubPlayers, LEAGUE_COUNTRIES, COUNTRY_LEVEL, type WorldOptions } from './world.js';
export { buildNations, NATION_COLOURS, NATION_BASE } from './nations.js';
export { generateFixtures, roundRobin, WINTER_BREAK , leaguesOf, europeanSlots} from './fixtures.js';
export { standings, tieAggregate } from './table.js';
export { teamSheet, availableFor, squadSeed, FORMATION_ROLES, engineRunner, engineRunnerWith, quickRunner, playFixture, recordFixture, fixtureSetup, selectSquad, resolveShootOut, applyInjuries, type MatchRunner, type MatchOutcome } from './matchday.js';
export { advanceDay, newSeason, playSeason, recordCoachedFixture, fixturesToday, inWinterBreak, type AdvanceOptions , nationsTable} from './season.js';
export { developSeason, recomputeClubLevels, regulateSquads, normaliseLevels, overall, SQUAD_MIN, SQUAD_MAX, TIER1_ANCHOR, TIER2_ANCHOR } from './develop.js';
export { seasonFinances } from './finance.js';
export { serialize, deserialize, SAVE_VERSION, MIGRATIONS, type SaveFile } from './save.js';
