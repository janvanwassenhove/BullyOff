/**
 * Pitch geometry in metres (BRIEF §5.1). Origin at the centre spot; +x runs
 * towards the "east" goal (end = +1), −x towards the "west" goal (end = −1);
 * y across the pitch; z up. No pixels here, ever.
 *
 * FIH Rules of Hockey, field dimensions:
 *  - field 91.40 × 55.00 m
 *  - goal 3.66 m wide, 2.14 m high, backboards/sideboards 0.46 m high, ~1.20 m deep
 *  - shooting circle: quarter-circles of radius 14.63 m centred on each goalpost's
 *    inner edge, joined by a 3.66 m straight parallel to the backline
 *  - 23 m lines at 22.90 m from each backline
 *  - penalty spot 6.40 m from the goal line, centred
 */
import type { Metres, Scalar, Vec2, Vec3 } from '@bullyoff/shared';

export type End = 1 | -1;

/** Tolerance for "on the line" tests — 1 µm, far below anything hockey cares about. */
export const GEOM_EPS = 1e-6;

export const PITCH_LENGTH: Metres = 91.4;
export const PITCH_WIDTH: Metres = 55.0;
export const HALF_LENGTH: Metres = PITCH_LENGTH / 2;   // 45.7
export const HALF_WIDTH: Metres = PITCH_WIDTH / 2;     // 27.5
export const GOAL_WIDTH: Metres = 3.66;
export const GOAL_HALF_WIDTH: Metres = GOAL_WIDTH / 2; // 1.83
export const GOAL_HEIGHT: Metres = 2.14;
export const GOAL_DEPTH: Metres = 1.2;
export const BOARD_HEIGHT: Metres = 0.46;
export const POST_RADIUS: Metres = 0.025;              // 50 mm square posts, modelled round
export const CIRCLE_RADIUS: Metres = 14.63;
export const LINE_23_FROM_BACKLINE: Metres = 22.9;
export const LINE_23_X: Metres = HALF_LENGTH - LINE_23_FROM_BACKLINE; // 22.8
export const PENALTY_SPOT_FROM_GOAL: Metres = 6.4;
export const PENALTY_SPOT_X: Metres = HALF_LENGTH - PENALTY_SPOT_FROM_GOAL; // 39.3
export const CIRCLE_TOP_X: Metres = HALF_LENGTH - CIRCLE_RADIUS; // 31.07 — top of the D

/** Goal-line x for an end. */
export const goalLineX = (end: End): Metres => end * HALF_LENGTH;
/** Post positions (inner-edge centre) for an end. */
export const postPositions = (end: End): [Vec2, Vec2] => [
  { x: end * HALF_LENGTH, y: -GOAL_HALF_WIDTH },
  { x: end * HALF_LENGTH, y: GOAL_HALF_WIDTH },
];

/**
 * Inside the shooting circle at `end`? The D is the union of a rectangle
 * (between the posts, up to 14.63 m out) and two quarter-discs around the posts.
 * The circle line itself counts as inside — a ball ON the line is in the circle
 * (FIH: "the circle" includes its marking).
 */
export function inCircle(p: Vec2, end: End): boolean {
  const dx = HALF_LENGTH - end * p.x; // distance in from that end's backline (positive on the pitch side)
  if (dx < 0 || dx > CIRCLE_RADIUS + GEOM_EPS) return false;
  const ay = Math.abs(p.y);
  if (ay <= GOAL_HALF_WIDTH) return true;
  const py = ay - GOAL_HALF_WIDTH;
  return dx * dx + py * py <= CIRCLE_RADIUS * CIRCLE_RADIUS + GEOM_EPS;
}

/** Inside the 23 m area (between the 23 m line and the backline) at `end`? */
export function in23(p: Vec2, end: End): boolean {
  return end * p.x >= LINE_23_X;
}

/** Inside the field of play (lines count as in). */
export function inField(p: Vec2): boolean {
  return Math.abs(p.x) <= HALF_LENGTH && Math.abs(p.y) <= HALF_WIDTH;
}

/**
 * Parametric t ∈ [0,1] at which segment a→b crosses the plane x = px, or -1.
 * Direction-agnostic. Used on the swept ball path (BRIEF §5.2.1).
 */
export function segmentCrossX(ax: Scalar, bx: Scalar, px: Scalar): Scalar {
  const da = ax - px, db = bx - px;
  if (da === 0) return 0;
  if ((da > 0 && db >= 0) || (da < 0 && db <= 0)) return -1;
  return da / (da - db);
}
export function segmentCrossY(ay: Scalar, by: Scalar, py: Scalar): Scalar {
  return segmentCrossX(ay, by, py);
}

export const lerp3 = (a: Vec3, b: Vec3, t: Scalar): Vec3 => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});

/**
 * Does the swept path a→b change circle membership at `end`? Returns the
 * crossing parameter found by bisection (deterministic; 24 halvings ≈ 1e-7 m on
 * a 2 m sweep) and the direction, or null if membership is unchanged.
 * Bisection rather than analytic arc intersection: robust at the arc/straight
 * seam, and the ball moves ≤ 2 m/tick so one crossing per tick is the norm.
 */
export function sweptCircleCrossing(a: Vec2, b: Vec2, end: End): { t: Scalar; entering: boolean } | null {
  const ia = inCircle(a, end), ib = inCircle(b, end);
  if (ia === ib) return null;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    const pm = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
    if (inCircle(pm, end) === ia) lo = mid; else hi = mid;
  }
  return { t: hi, entering: ib };
}
