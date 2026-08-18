/**
 * @bullyoff/shared — foundation types shared by every package.
 *
 * Phase 0: identity only. Phase 1 adds: `Rng` (PCG32, serialisable), `Scalar`,
 * SI unit brands (Metres, Seconds, MetresPerSecond), Vec2/Vec3, and the
 * deterministic math module under ./math (see ADR-005).
 */
export const PACKAGE_NAME = '@bullyoff/shared' as const;

export * from './math/index.js';
