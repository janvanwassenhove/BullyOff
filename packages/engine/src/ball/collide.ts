/**
 * Swept (continuous) collision detection for the ball — BRIEF §5.2.1, ADR-004.
 *
 * At 20 Hz a 130 km/h hit moves 1.8 m per tick — deeper than the goal. So each
 * tick's motion is a segment a→b, tested against goal posts, crossbar, the goal
 * box (backboard/net) and player bodies. Collisions resolve at the earliest
 * time of impact; the remainder of the tick continues with the reflected
 * velocity; up to MAX_RESOLUTIONS per tick, then a CollisionCapHit event.
 *
 * Line crossings (goal line, sidelines, circle, 23 m) are then evaluated on the
 * *resolved* sub-segments, in temporal order — never on endpoint sampling.
 */
import type { Scalar, Vec2, Vec3 } from '@bullyoff/shared';
import {
  BOARD_HEIGHT, GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, HALF_LENGTH, HALF_WIDTH,
  LINE_23_X, POST_RADIUS, lerp3, postPositions, segmentCrossX, sweptCircleCrossing, type End,
} from '../pitch/geometry.js';
import type { CollisionSurface, MatchEvent, PlayerId } from '../events/events.js';

export const MAX_RESOLUTIONS = 4;
const REST_POST = 0.6;
const REST_CROSSBAR = 0.55;
const REST_BACKBOARD = 0.45;
const REST_PLAYER = 0.35;   // ball off a shin/pad: dead-ish
const NET_DAMPING = 0.35;   // fraction of velocity kept per tick while in the net
const EPS = 1e-9;

export interface BodyCollider {
  playerId: PlayerId;
  pos: Vec2;
  radius: Scalar;
  height: Scalar;
}

export interface SweepInput {
  tick: number;
  from: Vec3;
  to: Vec3;
  vel: Vec3;
  grounded: boolean;
  ballRadius: Scalar;
  bodies: readonly BodyCollider[];
  /** Player who struck the ball this tick — the ball starts inside their reach; don't collide with them. */
  ignoreBody: PlayerId | null;
  lastTouch: PlayerId | null;
  wasInNet: boolean;
  /** Circle/23 membership before the tick, per end index [west(-1), east(+1)]. */
  inCircleBefore: [boolean, boolean];
  in23Before: [boolean, boolean];
}

export interface SweepOutput {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  inNet: boolean;
  events: MatchEvent[];
  inCircleAfter: [boolean, boolean];
  in23After: [boolean, boolean];
}

interface Hit {
  t: Scalar;
  normal: Vec3;
  restitution: Scalar;
  surface: CollisionSurface;
  playerId?: PlayerId;
}

/** Earliest entering intersection of segment a→b with an infinite vertical cylinder (2D circle). */
function segmentCircle2D(a: Vec3, b: Vec3, c: Vec2, R: Scalar): Scalar | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - c.x, fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  if (A < EPS) return null;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - R * R;
  if (C < 0) return null; // starts inside: ignore (already resolved / just struck)
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  return t;
}

/** Earliest entering intersection with a horizontal cylinder along y at (x0, z0), radius R. */
function segmentCircleXZ(a: Vec3, b: Vec3, x0: Scalar, z0: Scalar, R: Scalar): Scalar | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  const fx = a.x - x0, fz = a.z - z0;
  const A = dx * dx + dz * dz;
  if (A < EPS) return null;
  const B = 2 * (fx * dx + fz * dz);
  const C = fx * fx + fz * fz - R * R;
  if (C < 0) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  return t;
}

function findEarliestHit(a: Vec3, b: Vec3, r: Scalar, bodies: readonly BodyCollider[], ignoreBody: PlayerId | null): Hit | null {
  let best: Hit | null = null;
  const consider = (h: Hit | null): void => { if (h && (!best || h.t < best.t)) best = h; };

  for (const end of [1, -1] as End[]) {
    // posts: vertical cylinders up to crossbar height
    for (const p of postPositions(end)) {
      const t = segmentCircle2D(a, b, p, POST_RADIUS + r);
      if (t !== null) {
        const hitP = lerp3(a, b, t);
        if (hitP.z <= GOAL_HEIGHT + r) {
          const nx = hitP.x - p.x, ny = hitP.y - p.y;
          const nl = Math.sqrt(nx * nx + ny * ny) || 1;
          consider({ t, normal: { x: nx / nl, y: ny / nl, z: 0 }, restitution: REST_POST, surface: 'post' });
        }
      }
    }
    // crossbar: horizontal cylinder along y between the posts
    const gx = end * HALF_LENGTH;
    const tc = segmentCircleXZ(a, b, gx, GOAL_HEIGHT, POST_RADIUS + r);
    if (tc !== null) {
      const hitP = lerp3(a, b, tc);
      if (Math.abs(hitP.y) <= GOAL_HALF_WIDTH + r) {
        const nx = hitP.x - gx, nz = hitP.z - GOAL_HEIGHT;
        const nl = Math.sqrt(nx * nx + nz * nz) || 1;
        consider({ t: tc, normal: { x: nx / nl, y: 0, z: nz / nl }, restitution: REST_CROSSBAR, surface: 'crossbar' });
      }
    }
  }

  // player bodies: vertical cylinders of given height
  for (const body of bodies) {
    if (body.playerId === ignoreBody) continue;
    const t = segmentCircle2D(a, b, body.pos, body.radius + r);
    if (t !== null) {
      const hitP = lerp3(a, b, t);
      if (hitP.z <= body.height) {
        const nx = hitP.x - body.pos.x, ny = hitP.y - body.pos.y;
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        consider({ t, normal: { x: nx / nl, y: ny / nl, z: 0 }, restitution: REST_PLAYER, surface: 'player', playerId: body.playerId });
      }
    }
  }
  return best;
}

function reflect(v: Vec3, n: Vec3, e: Scalar): Vec3 {
  const vn = v.x * n.x + v.y * n.y + v.z * n.z;
  if (vn >= 0) return v; // moving away already
  return { x: v.x - (1 + e) * vn * n.x, y: v.y - (1 + e) * vn * n.y, z: v.z - (1 + e) * vn * n.z };
}

/**
 * Resolve the tick's ball motion. `dt` is used to re-project the remainder of the
 * tick after a reflection.
 */
export function sweepBall(input: SweepInput, dt: Scalar): SweepOutput {
  const events: MatchEvent[] = [];
  const { tick, ballRadius: r } = input;
  const inNet = input.wasInNet;
  let vel = input.vel;
  let grounded = input.grounded;
  const segments: [Vec3, Vec3][] = [];

  if (inNet) {
    // In the net: heavy damping, clamp inside the goal box, backboard bounce for a low ball.
    const end: End = input.from.x > 0 ? 1 : -1;
    const backX = end * (HALF_LENGTH + GOAL_DEPTH);
    let to = { ...input.to };
    vel = { x: vel.x * NET_DAMPING, y: vel.y * NET_DAMPING, z: vel.z * NET_DAMPING };
    if (end * to.x > end * backX - r) {
      to = { ...to, x: backX - end * r };
      const surface: CollisionSurface = to.z <= BOARD_HEIGHT ? 'backboard' : 'net';
      vel = { ...vel, x: -vel.x * (surface === 'backboard' ? REST_BACKBOARD : 0.1) };
      events.push({ t: 'BallCollision', tick, surface, x: to.x, y: to.y, z: to.z });
    }
    if (Math.abs(to.y) > GOAL_HALF_WIDTH - r) {
      to = { ...to, y: Math.sign(to.y) * (GOAL_HALF_WIDTH - r) };
      vel = { ...vel, y: -vel.y * 0.1 };
    }
    if (end * to.x < HALF_LENGTH) to = { ...to, x: end * HALF_LENGTH }; // never back out through the line
    segments.push([input.from, to]);
    return finish(to, vel, grounded, inNet, events, segments, input);
  }

  let from = input.from;
  let to = input.to;
  let remaining = 1; // fraction of the tick left
  let resolutions = 0;
  for (;;) {
    const hit = findEarliestHit(from, to, r, input.bodies, input.ignoreBody);
    if (!hit) { segments.push([from, to]); break; }
    if (resolutions >= MAX_RESOLUTIONS) {
      events.push({ t: 'CollisionCapHit', tick });
      // park the ball at the contact point and kill velocity: guaranteed termination
      const p = lerp3(from, to, hit.t);
      segments.push([from, p]);
      to = p; vel = { x: 0, y: 0, z: 0 };
      break;
    }
    resolutions++;
    const contact = lerp3(from, to, hit.t);
    // nudge off the surface along the normal so we don't re-detect the same hit
    const nudged = { x: contact.x + hit.normal.x * 1e-4, y: contact.y + hit.normal.y * 1e-4, z: contact.z + hit.normal.z * 1e-4 };
    segments.push([from, contact]);
    const ev: MatchEvent = { t: 'BallCollision', tick, surface: hit.surface, x: contact.x, y: contact.y, z: contact.z };
    if (hit.playerId !== undefined) ev.playerId = hit.playerId;
    events.push(ev);
    vel = reflect(vel, hit.normal, hit.restitution);
    if (vel.z > 0 && grounded) grounded = false;
    remaining *= 1 - hit.t;
    from = nudged;
    to = { x: from.x + vel.x * dt * remaining, y: from.y + vel.y * dt * remaining, z: Math.max(0, from.z + vel.z * dt * remaining) };
  }

  return finish(to, vel, grounded, inNet, events, segments, input);
}

function finish(
  pos: Vec3, vel: Vec3, grounded: boolean, inNet: boolean, events: MatchEvent[],
  segments: [Vec3, Vec3][], input: SweepInput,
): SweepOutput {
  const { tick, lastTouch, ballRadius: r } = input;
  const inCircleAfter: [boolean, boolean] = [...input.inCircleBefore];
  const in23After: [boolean, boolean] = [...input.in23Before];

  for (const [a, b] of segments) {
    if (!inNet) {
      // goal-line / backline crossing, outward only
      for (const end of [-1, 1] as End[]) {
        const gx = end * HALF_LENGTH;
        const t = segmentCrossX(a.x, b.x, gx);
        if (t > 0 && end * (b.x - a.x) > 0 && end * a.x < HALF_LENGTH) {
          const p = lerp3(a, b, t);
          const inGoal = Math.abs(p.y) < GOAL_HALF_WIDTH - r * 0.5 && p.z < GOAL_HEIGHT - r * 0.5;
          events.push({ t: 'GoalLineCrossed', tick, end, inGoal, y: p.y, z: p.z, lastTouch });
          if (inGoal) inNet = true;
        }
      }
      // sidelines, outward only
      for (const side of [-1, 1] as (1 | -1)[]) {
        const sy = side * HALF_WIDTH;
        const t = segmentCrossX(a.y, b.y, sy);
        if (t > 0 && side * (b.y - a.y) > 0 && side * a.y < HALF_WIDTH) {
          const p = lerp3(a, b, t);
          events.push({ t: 'SidelineCrossed', tick, side, x: p.x, lastTouch });
        }
      }
    }
    // circle and 23 m membership per end
    for (const end of [-1, 1] as End[]) {
      const idx = end === -1 ? 0 : 1;
      const cross = sweptCircleCrossing({ x: a.x, y: a.y }, { x: b.x, y: b.y }, end);
      if (cross) {
        inCircleAfter[idx] = cross.entering;
        events.push(cross.entering ? { t: 'CircleEntry', tick, end, lastTouch } : { t: 'CircleExit', tick, end });
      }
      const wasIn23 = end * a.x >= LINE_23_X, isIn23 = end * b.x >= LINE_23_X;
      if (wasIn23 !== isIn23) {
        in23After[idx] = isIn23;
        events.push({ t: 'Line23Crossed', tick, end, entering: isIn23, lastTouch });
      }
    }
  }
  return { pos, vel, grounded, inNet, events, inCircleAfter, in23After };
}
