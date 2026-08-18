/** Fixed simulation rate. Decided in BRIEF §4.3 — do not make configurable. */
export const TICK_HZ = 20 as const;
/** Seconds per tick. Elapsed time is always tick × DT, never a running sum. */
export const DT = 0.05 as const;
/** Bumped on any change that alters an event log for the same seed+inputs (ADR-007). */
export const ENGINE_VERSION = '0.1.0';
