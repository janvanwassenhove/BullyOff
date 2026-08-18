/**
 * @bullyoff/engine — the headless deterministic match simulation.
 *
 * Contract (ADR-002): `tick(state, inputs) -> { state, events }`.
 * Pure, synchronous, no I/O, no timers, no wall clock, no Math.random,
 * no Math transcendentals (ADR-005). The only randomness is the injected Rng.
 * The MatchEvent[] log is the ONLY thing consumers may read.
 *
 * Phase 0: identity only. Phase 1 adds pitch geometry, 2.5D ball with swept
 * collision detection, player kinematics, stick segment, tick loop, event log
 * types, and the determinism harness. 20 Hz, dt = 0.05 s. Decided.
 */
export const PACKAGE_NAME = '@bullyoff/engine' as const;

/** Fixed simulation rate. Decided in BRIEF §4.3 — do not make configurable. */
export const TICK_HZ = 20 as const;
/** Seconds per tick. Elapsed time is always tick × DT, never a running sum. */
export const DT = 0.05 as const;
