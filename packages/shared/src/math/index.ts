/**
 * Deterministic math for the engine.
 *
 * `Math.sin/cos/atan2/pow/exp/log` are implementation-defined in precision
 * (ECMA-262 §21.3.2) and are banned in packages/engine by ESLint. This module
 * is the only place allowed to touch them, and only to *build* lookup tables
 * or to serve as a test oracle. Phase 1 fills it in. See ADR-005.
 */
export const MATH_MODULE_READY = false as const;
