/**
 * @bullyoff/shared — foundation shared by every package. Depends on nothing.
 *
 * - `Scalar` and SI unit aliases, Vec2/Vec3 helpers (ADR-005 guardrail 2)
 * - `Rng`: PCG32, seeded, serialisable, injected (ADR-002)
 * - deterministic elementary math (ADR-005 guardrail 1) — see ./math
 * - `hashString`: FNV-1a 64 over strings, for event-log hashing without crypto
 */
export const PACKAGE_NAME = '@bullyoff/shared' as const;

export * from './scalar.js';
export * from './rng.js';
export * from './hash.js';
export * as dmath from './math/index.js';
export * from './pitch.js';
