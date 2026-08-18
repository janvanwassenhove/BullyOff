/**
 * @bullyoff/engine — the headless deterministic match simulation.
 *
 * Contract (ADR-002): `tick(state, commands) -> MatchEvent[]`. Pure w.r.t. inputs,
 * synchronous, no I/O, no timers, no wall clock, no Math.random, no Math
 * transcendentals (ADR-005). The only randomness is the injected Rng. The event
 * log (+ kinematic frames) is the ONLY thing consumers may read.
 */
export const PACKAGE_NAME = '@bullyoff/engine' as const;

export { TICK_HZ, DT, ENGINE_VERSION } from './constants.js';
export * from './profile.js';
export * from './events/events.js';
export * from './match/commands.js';
export { createMatch, tick, endMatch, simulate, simulateMatch, captureFrame, rulesView, dugout } from './match/match.js';
export type { MatchSetup, PlayerSetup, MatchState, Controller } from './match/match.js';
export { hashLog } from './sim/hash.js';
export * from './player/attributes.js';
export * from './ai/valueGrid.js';
export * from './ai/tactics.js';
export { aiController, squadsFromSetup, passSpeedFor, type AiTeam, type SquadPlayer, type AiOptions } from './ai/brain.js';
export * from './worker/protocol.js';
export { createEngineHost } from './worker/host.js';
