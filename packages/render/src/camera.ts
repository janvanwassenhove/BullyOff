/**
 * Director camera (ADR-013): frame the play, not the ball. Pure state machine —
 * `stepCamera(state, target, dt)` — so it scrubs and replays identically and is
 * testable without a canvas. Units: metres for position, "metres of pitch visible
 * across the viewport width" for zoom.
 */
import { HALF_LENGTH, HALF_WIDTH, LINE_23_X, inCircle } from '@bullyoff/shared';

export interface CameraState { x: number; y: number; vx: number; vy: number; width: number; vw: number }
export interface CameraTarget { x: number; y: number; width: number }

export const FULL_PITCH_WIDTH = 100;   // metres visible across the viewport when showing the whole pitch (91.4 + margins)
export const TIGHT_WIDTH = 42;         // inside the circle
export const MID_WIDTH = 60;           // 23 m area

export function initialCamera(): CameraState {
  return { x: 0, y: 0, vx: 0, vy: 0, width: FULL_PITCH_WIDTH, vw: 0 };
}

/**
 * Where should the camera want to be? Ball position with velocity lead; zoom by
 * where the ball is (tighter into the 23 m and the D, wide on the halfway line).
 * `mode` 'tactical' = fixed full pitch.
 */
export function cameraTarget(ball: { x: number; y: number; vx: number; vy: number }, mode: 'director' | 'tactical', aspect: number): CameraTarget {
  if (mode === 'tactical') return { x: 0, y: 0, width: FULL_PITCH_WIDTH };
  const lead = 0.6;
  const inD = inCircle(ball, 1) || inCircle(ball, -1);
  const in23 = Math.abs(ball.x) >= LINE_23_X;
  const width = inD ? TIGHT_WIDTH : in23 ? MID_WIDTH : 78;
  const height = width / aspect;
  // keep the frame on the pitch (with a small margin)
  const maxX = Math.max(0, HALF_LENGTH + 4 - width / 2), maxY = Math.max(0, HALF_WIDTH + 4 - height / 2);
  const x = Math.max(-maxX, Math.min(maxX, ball.x + ball.vx * lead));
  const y = Math.max(-maxY, Math.min(maxY, (ball.y + ball.vy * lead) * 0.6));
  return { x, y, width };
}

/** Critically-damped spring towards the target. `dt` seconds. */
export function stepCamera(s: CameraState, t: CameraTarget, dt: number, stiffness = 6): CameraState {
  const k = stiffness, c = 2 * Math.sqrt(k); // critical damping
  const ax = k * (t.x - s.x) - c * s.vx, ay = k * (t.y - s.y) - c * s.vy, aw = k * 0.6 * (t.width - s.width) - c * 0.77 * s.vw;
  const vx = s.vx + ax * dt, vy = s.vy + ay * dt, vw = s.vw + aw * dt;
  return { x: s.x + vx * dt, y: s.y + vy * dt, vx, vy, width: Math.max(20, s.width + vw * dt), vw };
}

/** A brief zoom punch (e.g. on a strike): returns a width multiplier decaying over `dur` seconds since `t0`. */
export function punch(sinceSeconds: number, dur = 0.35, amount = 0.08): number {
  if (sinceSeconds < 0 || sinceSeconds > dur) return 1;
  const u = sinceSeconds / dur;
  return 1 - amount * Math.sin(Math.PI * u);
}
