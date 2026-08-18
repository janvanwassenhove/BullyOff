/**
 * 2.5D ball (ADR-004): position and velocity in x, y, z; gravity, quadratic air
 * drag, bounce with surface-dependent restitution, rolling deceleration by
 * surface state. Integration produces a swept segment per tick which the
 * collision module resolves against goal furniture and player bodies before the
 * position is committed (BRIEF §5.2.1).
 */
import { dmath, type Scalar, type Vec3 } from '@bullyoff/shared';
import type { BallParams, SurfaceParams } from '../profile.js';
import type { PlayerId } from '../events/events.js';

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  /** Reserved scalar spin (ADR-004): not yet used by physics; carried for the renderer. */
  spin: Scalar;
  /** True while resting/rolling on the turf (z == 0, no upward velocity). */
  grounded: boolean;
  /** Last player to strike or trap the ball, or null. Rules (Phase 2) lean on this. */
  lastTouch: PlayerId | null;
  /** True once the ball has crossed into the goal net (stops it re-crossing the line every tick). */
  inNet: boolean;
}

export const createBall = (x = 0, y = 0): BallState => ({
  pos: { x, y, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: 0, grounded: true, lastTouch: null, inNet: false,
});

export const ballSpeed2D = (b: BallState): Scalar => Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);
export const ballSpeed3D = (b: BallState): Scalar =>
  Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y + b.vel.z * b.vel.z);

export interface BallStepResult {
  /** Proposed end-of-tick state before collision resolution. */
  next: { pos: Vec3; vel: Vec3; grounded: boolean };
  /** The ball touched down this tick (was airborne, reached z=0 moving down). */
  bounced: boolean;
  speedBeforeBounce: Scalar;
  /** Rolling ball reached zero speed this tick. */
  stopped: boolean;
}

/**
 * Advance the ball by `dt` under gravity/drag (airborne) or rolling friction
 * (grounded). Returns the *proposed* next state; the caller sweeps the segment
 * pos→next.pos for collisions and may shorten/deflect it.
 *
 * Bounce inside a tick: if the airborne ball would cross z=0 within the tick we
 * split at the touchdown time, apply restitution, and integrate the remainder
 * — so a low drag-flick skidding off the turf on its way to goal is handled in
 * the same tick, not one tick late.
 */
export function stepBall(b: BallState, dt: Scalar, ball: BallParams, surface: SurfaceParams): BallStepResult {
  let { x, y, z } = b.pos;
  let { x: vx, y: vy, z: vz } = b.vel;
  let grounded = b.grounded;
  let bounced = false;
  let stopped = false;
  let speedBeforeBounce = 0;
  let remaining = dt;

  if (!grounded) {
    // ── airborne: gravity + quadratic drag, semi-implicit Euler ────────────
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const dragK = ball.airDrag * speed;
    vx -= dragK * vx * remaining;
    vy -= dragK * vy * remaining;
    vz -= (ball.gravity + dragK * vz) * remaining;

    // time to reach z = 0 (only if descending)
    if (vz < 0 && z + vz * remaining <= 0) {
      const tHit = z > 0 ? Math.min(remaining, z / -vz) : 0;
      x += vx * tHit; y += vy * tHit; z = 0;
      remaining -= tHit;
      bounced = true;
      speedBeforeBounce = Math.sqrt(vx * vx + vy * vy + vz * vz);
      // restitution + horizontal skid loss
      vz = -vz * surface.restitution;
      vx *= 1 - surface.bounceFrictionLoss;
      vy *= 1 - surface.bounceFrictionLoss;
      if (vz < surface.settleSpeed) {
        // not enough bounce left to leave the turf: settle to rolling
        vz = 0;
        grounded = true;
      } else {
        // continue airborne for the rest of the tick
        x += vx * remaining; y += vy * remaining; z += vz * remaining;
        remaining = 0;
      }
    } else {
      x += vx * remaining; y += vy * remaining; z += vz * remaining;
      remaining = 0;
    }
  }

  if (grounded && remaining > 0) {
    // ── rolling: constant deceleration opposing velocity ───────────────────
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 0) {
      const decel = surface.rollingDecel;
      const tStop = speed / decel;
      if (tStop <= remaining) {
        // stops within the tick: travel the stopping distance along the direction
        const dist = speed * tStop - 0.5 * decel * tStop * tStop;
        x += (vx / speed) * dist; y += (vy / speed) * dist;
        vx = 0; vy = 0;
        stopped = true;
      } else {
        const newSpeed = speed - decel * remaining;
        const dist = (speed + newSpeed) * 0.5 * remaining;
        x += (vx / speed) * dist; y += (vy / speed) * dist;
        vx = (vx / speed) * newSpeed; vy = (vy / speed) * newSpeed;
      }
    }
    z = 0; vz = 0;
  }

  return { next: { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, grounded }, bounced, speedBeforeBounce, stopped };
}

/** Give the ball a velocity from a strike: speed along `heading` with `lift` (rad) above horizontal. */
export function launchBall(b: BallState, heading: Scalar, speed: Scalar, lift: Scalar): void {
  const horiz = speed * dmath.cos(lift);
  b.vel = { x: horiz * dmath.cos(heading), y: horiz * dmath.sin(heading), z: speed * dmath.sin(lift) };
  if (b.vel.z > 0) { b.grounded = false; if (b.pos.z <= 0) b.pos = { ...b.pos, z: 1e-6 }; }
}
