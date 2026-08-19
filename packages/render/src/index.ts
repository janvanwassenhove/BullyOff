/**
 * @bullyoff/render — the PixiJS view layer. Reads MatchLog only (ADR-002);
 * metres → pixels happens here and only here; interpolates between frames of any
 * cadence (ADR-013); director camera; moments; audio hooks.
 */
export const PACKAGE_NAME = '@bullyoff/render' as const;
export { createMatchView, type MatchView, type MatchViewOptions, type ViewMode, type HudState } from './MatchView.js';
export { sampleAt, frameIndexAt, type Sample, type PlayerSample } from './interp.js';
export { cameraTarget, stepCamera, initialCamera, punch, type CameraState, type CameraTarget } from './camera.js';
export { AudioLayer } from './audio.js';
