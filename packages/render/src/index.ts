/**
 * @bullyoff/render — the PixiJS view layer. Reads MatchLog only (ADR-002);
 * metres → pixels happens here and only here; interpolates between frames of any
 * cadence (ADR-013); seven-angle camera projection; moments; audio hooks.
 */
export const PACKAGE_NAME = '@bullyoff/render' as const;
export { createMatchView, type MatchView, type MatchViewOptions, type ViewMode, type HudState, type CameraChoice } from './MatchView.js';
export { sampleAt, frameIndexAt, type Sample, type PlayerSample } from './interp.js';
export { cameraTarget, stepCamera, initialCamera, punch, type CameraState, type CameraTarget } from './camera.js';
export {
  CAMERAS, CAMERA_IDS, PITCH_COLOURS, PENALTY_SPOTS, makeProjector, directorCamera, mirrorCamera, pitchLines, dShape, mowStripes, overlayShapes,
  type CameraId, type CameraSpec, type OverlayId, type FitMode, type Projector, type Projected, type Polyline,
} from './pitch.js';
export { AudioLayer } from './audio.js';
