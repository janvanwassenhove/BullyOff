/**
 * @bullyoff/render — the PixiJS view layer.
 *
 * Reads MatchEvent[] and nothing else (ADR-002). Converts metres to pixels
 * here and only here. Interpolates between 20 Hz ticks for 60+ fps drawing
 * (ADR-013). Phase 0: identity only. Phase 5 builds it.
 */
export const PACKAGE_NAME = '@bullyoff/render' as const;
