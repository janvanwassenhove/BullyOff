/**
 * Calibration harness. Phase 4 builds it. See BRIEF §6 and ADR-010.
 * Inputs: simcli aggregate JSON per profile (mens/womens, never pooled).
 * Targets: docs/rules/calibration-data.md. Output: pass/fail per metric with
 * ±10 % tolerance on frequencies and a chi-square shape test on scorelines.
 */
export const PACKAGE_NAME = '@bullyoff/calibrate' as const;
