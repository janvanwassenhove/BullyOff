/**
 * The pitch model and camera system (design handoff § "The pitch renderer").
 *
 * Pure maths, no Pixi: a real FIH pitch from metre coordinates (geometry from
 * @bullyoff/shared, same metres the engine uses — ADR-012 §4), plus the seven-angle
 * camera as a PROJECTION from pitch metres to screen pixels (ADR-013: presentation
 * only, never touches the log). The design's CSS `rotateX/rotateZ + perspective`
 * is reproduced as a homography so markers scale with depth and shadows lengthen
 * away from the light; nothing here is a CSS transform.
 *
 * Engine coordinates: x along the length (−45.7..45.7, + = east goal), y across
 * (−27.5..27.5). The design's regions are written top-left-based (0..91.4, 0..55)
 * and converted once here.
 */
import { CIRCLE_RADIUS, GOAL_DEPTH, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, LINE_23_X, PENALTY_SPOT_X } from '@bullyoff/shared';

export type CameraId = 'full' | 'half' | 'circle' | 'goalmouth' | 'broadcast' | 'lowAngle' | 'behindGoal' | 'cornerCam';
export type OverlayId = 'none' | 'press' | 'channels' | 'circle';
export type FitMode = 'contain' | 'cover';

export interface CameraSpec {
  /** Crop region in engine metres [x0, y0, x1, y1]. */
  region: [number, number, number, number];
  /** Broadcast tilt (rotateX) in degrees. 0 = top-down. */
  tilt: number;
  /** Yaw (rotateZ) in degrees. */
  yaw: number;
  /** i18n key of the camera label. */
  labelKey: string;
}

const L = 2 * HALF_LENGTH, W = 2 * HALF_WIDTH;
/** Design region (top-left based, 0..91.4 × 0..55) → engine region. */
const r = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [x0 - HALF_LENGTH, y0 - HALF_WIDTH, x1 - HALF_LENGTH, y1 - HALF_WIDTH];

/** The camera table from the handoff — regions in metres, tilt, yaw. */
export const CAMERAS: Record<CameraId, CameraSpec> = {
  full: { region: r(0, 0, L, W), tilt: 0, yaw: 0, labelKey: 'camera.full' },
  half: { region: r(42, 0, L, W), tilt: 0, yaw: 0, labelKey: 'camera.half' },
  circle: { region: r(64, 6, L, 49), tilt: 0, yaw: 0, labelKey: 'camera.circle' },
  goalmouth: { region: r(78, 14, L, 41), tilt: 0, yaw: 0, labelKey: 'camera.goalmouth' },
  broadcast: { region: r(8, -2, L, W + 2), tilt: 52, yaw: 0, labelKey: 'camera.broadcast' },
  lowAngle: { region: r(58, 2, L, 53), tilt: 64, yaw: 0, labelKey: 'camera.lowAngle' },
  behindGoal: { region: r(72, 10, L + 2, 45), tilt: 56, yaw: -90, labelKey: 'camera.behindGoal' },
  cornerCam: { region: r(66, 26, L + 2, 55), tilt: 60, yaw: -34, labelKey: 'camera.cornerCam' },
};
export const CAMERA_IDS: CameraId[] = ['full', 'half', 'circle', 'goalmouth', 'broadcast', 'lowAngle', 'behindGoal', 'cornerCam'];

/** A camera spec mirrored to the west end (the same angle on the other goal). */
export function mirrorCamera(spec: CameraSpec): CameraSpec {
  const [x0, y0, x1, y1] = spec.region;
  return { ...spec, region: [-x1, y0, -x0, y1], yaw: spec.yaw === 0 ? 180 : spec.yaw + 180 };
}

export interface Projected { x: number; y: number; /** perspective factor (1 = region centre) */ k: number }

export interface Projector {
  /** Pitch metres (+ height) → screen pixels (origin top-left of the viewport). */
  project(x: number, y: number, z?: number): Projected;
  /** Pixels per metre at the region centre (before perspective). */
  readonly metre: number;
  readonly tilt: number;
  readonly spec: CameraSpec;
  readonly width: number;
  readonly height: number;
}

/**
 * Fit a camera to a viewport. `contain` shows the whole crop region; `cover` fills the
 * viewport with it. The homography follows the design's CSS reference:
 * yaw → scale → rotateX(tilt) with perspective P = effW·m·1.4 → compensating scale
 * min(1.45, 1 / (0.34 + 0.66·cos tilt)).
 */
export function makeProjector(spec: CameraSpec, width: number, height: number, fit: FitMode = 'contain', pad = 0): Projector {
  const [x0, y0, x1, y1] = spec.region;
  const rw = x1 - x0, rh = y1 - y0;
  const yaw = (spec.yaw * Math.PI) / 180, tilt = (spec.tilt * Math.PI) / 180;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const effW = Math.abs(rw * cosY) + Math.abs(rh * sinY);
  const effH = Math.abs(rw * sinY) + Math.abs(rh * cosY);
  const sx = Math.max(1, width - pad * 2) / effW, sy = Math.max(1, height - pad * 2) / effH;
  const m = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
  const P = effW * m * 1.4;
  const s = tilt ? Math.min(1.45, 1 / (0.34 + 0.66 * cosT)) : 1;
  const lift = 0.65 * cosT + 0.95 * sinT; // how much of a metre of height shows on screen
  return {
    metre: m, tilt: spec.tilt, spec, width, height,
    project(x, y, z = 0) {
      const dx = x - cx, dy = y - cy;
      const X = (dx * cosY - dy * sinY) * m;
      const Y = (dx * sinY + dy * cosY) * m;
      const z1 = Y * sinT;                 // positive Y (near edge) comes toward the viewer
      const k = tilt ? P / Math.max(1, P - z1) : 1;
      return { x: width / 2 + X * k * s, y: height / 2 + (Y * cosT - z * m * lift) * k * s, k: k * s };
    },
  };
}

/** A dynamic (director) camera: a region centred on a point with a given width in metres, at a broadcast tilt. */
export function directorCamera(x: number, y: number, widthM: number, aspect: number, tilt = 52): CameraSpec {
  const h = widthM / Math.max(0.5, aspect) * (tilt ? 1 / Math.max(0.45, Math.cos((tilt * Math.PI) / 180)) : 1);
  return { region: [x - widthM / 2, y - h / 2, x + widthM / 2, y + h / 2], tilt, yaw: 0, labelKey: 'camera.director' };
}

// ── geometry ──────────────────────────────────────────────────────────────────

export interface Polyline { points: [number, number][]; alpha: number; dashed?: boolean }

/** Every line of an FIH pitch as polylines in metres (arcs sampled every ~0.5 m so any projection stays smooth). */
export function pitchLines(): Polyline[] {
  const out: Polyline[] = [];
  const H = HALF_LENGTH, V = HALF_WIDTH;
  out.push({ points: [[-H, -V], [H, -V], [H, V], [-H, V], [-H, -V]], alpha: 0.55 });
  out.push({ points: [[0, -V], [0, V]], alpha: 0.5 });
  out.push({ points: [[LINE_23_X, -V], [LINE_23_X, V]], alpha: 0.5 });
  out.push({ points: [[-LINE_23_X, -V], [-LINE_23_X, V]], alpha: 0.5 });
  for (const end of [1, -1] as const) {
    const gx = end * H;
    out.push({ points: dShape(end, CIRCLE_RADIUS), alpha: 0.62 });
    out.push({ points: dShape(end, CIRCLE_RADIUS + 5), alpha: 0.26, dashed: true });
    // goal box (1.2 m deep behind the line) — the design draws it as a filled strip; lines here, fill in the renderer
    const gd = Math.max(GOAL_DEPTH, 1.2);
    out.push({ points: [[gx, -GOAL_HALF_WIDTH], [gx + end * gd, -GOAL_HALF_WIDTH], [gx + end * gd, GOAL_HALF_WIDTH], [gx, GOAL_HALF_WIDTH]], alpha: 0.8 });
  }
  // sideline hash marks every 5.5 m (0.3 m in)
  for (let y = -V + 5.5; y < V - 0.1; y += 5.5) {
    out.push({ points: [[-H, y], [-H + 0.3, y]], alpha: 0.4 });
    out.push({ points: [[H - 0.3, y], [H, y]], alpha: 0.4 });
  }
  return out;
}

/** The D at one end: arc from the backline around each post, joined by the straight at the top. */
export function dShape(end: 1 | -1, radius: number): [number, number][] {
  const gx = end * HALF_LENGTH;
  const pts: [number, number][] = [];
  const steps = Math.max(12, Math.round((Math.PI / 2) * radius / 0.5));
  // lower arc: from backline at y = -(G + r) up to the straight at y = -G
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2); // 0 = on the backline, 90° = at the straight
    pts.push([gx - end * radius * Math.sin(a), -GOAL_HALF_WIDTH - radius * Math.cos(a)]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push([gx - end * radius * Math.sin(a), GOAL_HALF_WIDTH + radius * Math.cos(a)]);
  }
  return pts;
}

/** Penalty spots. */
export const PENALTY_SPOTS: [number, number][] = [[PENALTY_SPOT_X, 0], [-PENALTY_SPOT_X, 0]];

/** 5 m mow stripes across the length as quads in metres (alternate tint on the odd ones). */
export function mowStripes(): { quad: [number, number][]; alt: boolean }[] {
  const out: { quad: [number, number][]; alt: boolean }[] = [];
  let i = 0;
  for (let x = -HALF_LENGTH; x < HALF_LENGTH - 0.001; x += 5, i++) {
    const x1 = Math.min(HALF_LENGTH, x + 5);
    out.push({ quad: [[x, -HALF_WIDTH], [x1, -HALF_WIDTH], [x1, HALF_WIDTH], [x, HALF_WIDTH]], alt: i % 2 === 1 });
  }
  return out;
}

/** Overlay shapes in metres for a team attacking `end` (press line at the halfway line, three channels, the attacking D). */
export function overlayShapes(overlay: OverlayId, end: 1 | -1): { quad: [number, number][]; colour: number; alpha: number; edge?: [number, number][] }[] {
  const H = HALF_LENGTH, V = HALF_WIDTH;
  if (overlay === 'press') {
    return [{ quad: end === 1 ? [[0, -V], [H, -V], [H, V], [0, V]] : [[-H, -V], [0, -V], [0, V], [-H, V]], colour: 0x1f9a63, alpha: 0.13, edge: [[0, -V], [0, V]] }];
  }
  if (overlay === 'channels') {
    const lane = W / 3;
    return [0, 1, 2].map((i) => ({ quad: [[-H, -V + i * lane], [H, -V + i * lane], [H, -V + (i + 1) * lane], [-H, -V + (i + 1) * lane]], colour: i === 1 ? 0x1f9a63 : 0xf0fff8, alpha: i === 1 ? 0.1 : 0.03 }));
  }
  if (overlay === 'circle') {
    return [{ quad: dShape(end, CIRCLE_RADIUS).concat([[end * H, GOAL_HALF_WIDTH + CIRCLE_RADIUS]]), colour: 0xf1c40f, alpha: 0.1 }];
  }
  return [];
}

/** Design colours for the pitch (kept here so the Pixi layer and any 2D export agree). */
export const PITCH_COLOURS = {
  turf: 0x0f2b23, turfAlt: 0x123227, line: 0xf0fff8, ball: 0xf4f1e8,
  homeRing: { colour: 0xf0fff8, alpha: 0.85 }, awayRing: { colour: 0x0a0d10, alpha: 0.6 },
  shadow: { colour: 0x000000, alpha: 0.34 },
} as const;
