/**
 * @bullyoff/season — the season loop: clubs, squads, fixtures (round-robin +
 * play-off brackets), tables, match days through the engine, development,
 * injuries, finances, promotion/relegation, versioned saves.
 */
export const PACKAGE_NAME = '@bullyoff/season' as const;
export * from './model.js';
export { createWorld, makePerson, ageOf, clubPlayers, type WorldOptions } from './world.js';
export { generateFixtures, roundRobin, WINTER_BREAK } from './fixtures.js';
export { standings, tieAggregate } from './table.js';
export { engineRunner, quickRunner, playFixture, selectSquad, resolveShootOut, applyInjuries, type MatchRunner, type MatchOutcome } from './matchday.js';
export { advanceDay, newSeason, playSeason, fixturesToday, inWinterBreak, type AdvanceOptions } from './season.js';
export { developSeason, recomputeClubLevels, overall } from './develop.js';
export { seasonFinances } from './finance.js';
export { serialize, deserialize, SAVE_VERSION, MIGRATIONS, type SaveFile } from './save.js';
