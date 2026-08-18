/**
 * @bullyoff/rules — the laws of the game, separable from physics.
 * Pure: depends only on @bullyoff/shared. The engine calls `gateCommand` before
 * physics and `stepRules` after, and executes the returned rulings.
 */
export const PACKAGE_NAME = '@bullyoff/rules' as const;
export * from './types.js';
export * from './laws.js';
export { createRulesState, stepRules, gateCommand, forceAward, centrePassTeamForQuarter, type GateKind, type RulesStartOptions } from './rules.js';
export { placementsFor, longCornerSpot, hitOutSpot, pcSpot, strokeSpot, centreSpot } from './placements.js';
