/**
 * Player kinematics (Phase 1: no AI, no attributes — scripted inputs only).
 *
 * A player is a body (circle for ball collision) with heading, velocity, a stick
 * modelled as an oriented segment from the body centre, and stamina. Movement
 * is discrete per tick: players never approach tunnelling speeds at 20 Hz.
 */
import { dmath, type Radians, type Scalar, type Vec2 } from '@bullyoff/shared';
import type { PlayerId, TeamId } from '../events/events.js';
import type { PlayerParams } from '../profile.js';
import { accelFactor, attributesFor, paceFactor, staminaDrainFactor, type Attributes, type Role } from './attributes.js';

export interface PlayerState {
  id: PlayerId;
  team: TeamId;
  pos: Vec2;
  vel: Vec2;
  /** Facing direction, radians, (-π, π]. */
  heading: Radians;
  /** Absolute stick direction (where the head points), radians. */
  stickAngle: Radians;
  /** 0..1 */
  stamina: Scalar;
  /** Desired movement this tick: unit-ish direction and 0..1 effort. Set by commands. */
  wantDir: Vec2;
  wantEffort: Scalar;
  onPitch: boolean;
  role: Role;
  attrs: Attributes;
  /** After a failed trap/save the player is beaten: no new attempt until this tick. */
  trapCooldownUntil: number;
  /** Per-player kinematic params: profile × attribute factors. Computed once. */
  params: PlayerParams;
}

export function createPlayer(id: PlayerId, team: TeamId, x: Scalar, y: Scalar, heading: Radians, base: PlayerParams, role: Role = 'MID', attrs?: Attributes): PlayerState {
  const a = attrs ?? attributesFor(role);
  const params: PlayerParams = {
    ...base,
    maxSpeed: base.maxSpeed * paceFactor(a),
    accel: base.accel * accelFactor(a),
    staminaDrainAtMax: base.staminaDrainAtMax * staminaDrainFactor(a),
  };
  return {
    id, team, pos: { x, y }, vel: { x: 0, y: 0 }, heading, stickAngle: heading, stamina: 1,
    wantDir: { x: 0, y: 0 }, wantEffort: 0, onPitch: true, role, attrs: a, params, trapCooldownUntil: -1,
  };
}

/** Stick head position: reach along stickAngle from body centre. */
export function stickHead(p: PlayerState, reach: Scalar): Vec2 {
  return { x: p.pos.x + reach * dmath.cos(p.stickAngle), y: p.pos.y + reach * dmath.sin(p.stickAngle) };
}

/**
 * Advance one tick. Acceleration limited; stopping is quicker than starting;
 * fatigue scales top speed and acceleration (hockey reason: a tired player is
 * not slower to think but slower to get there — the substitution bar in Phase 7
 * lives off this curve).
 */
export function stepPlayer(p: PlayerState, dt: Scalar, params: PlayerParams = p.params): void {
  if (!p.onPitch) return;
  const fatigue = 0.6 + 0.4 * p.stamina; // 60 % of top speed when empty
  const maxSpeed = params.maxSpeed * fatigue * p.wantEffort;

  // desired velocity
  const dl = Math.sqrt(p.wantDir.x * p.wantDir.x + p.wantDir.y * p.wantDir.y);
  const dvx = dl > 0 ? (p.wantDir.x / dl) * maxSpeed : 0;
  const dvy = dl > 0 ? (p.wantDir.y / dl) * maxSpeed : 0;

  // accelerate towards it, limited
  const ax = dvx - p.vel.x, ay = dvy - p.vel.y;
  const al = Math.sqrt(ax * ax + ay * ay);
  const speedNow = Math.sqrt(p.vel.x * p.vel.x + p.vel.y * p.vel.y);
  const desiredSpeed = Math.sqrt(dvx * dvx + dvy * dvy);
  const limit = (desiredSpeed < speedNow ? params.decel : params.accel * fatigue) * dt;
  if (al > limit) {
    p.vel = { x: p.vel.x + (ax / al) * limit, y: p.vel.y + (ay / al) * limit };
  } else {
    p.vel = { x: dvx, y: dvy };
  }

  p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };

  // heading turns towards velocity direction (when moving) at a limited rate
  const v = Math.sqrt(p.vel.x * p.vel.x + p.vel.y * p.vel.y);
  if (v > 0.3) {
    const target = dmath.atan2(p.vel.y, p.vel.x);
    const d = dmath.angleDelta(p.heading, target);
    const maxTurn = params.turnRate * dt;
    p.heading = dmath.wrapAngle(p.heading + (Math.abs(d) <= maxTurn ? d : Math.sign(d) * maxTurn));
  }
  // stick follows heading unless a command aimed it this tick (commands set stickAngle directly)
  const sd = dmath.angleDelta(p.stickAngle, p.heading);
  const maxStick = params.turnRate * 2 * dt;
  p.stickAngle = dmath.wrapAngle(p.stickAngle + (Math.abs(sd) <= maxStick ? sd : Math.sign(sd) * maxStick));

  // stamina: drain ∝ (v/vmax)², recover when idle
  const load = v / params.maxSpeed;
  const drain = params.staminaDrainAtMax * load * load * dt;
  const recover = load < 0.2 ? params.staminaRecoverIdle * dt : 0;
  p.stamina = Math.min(1, Math.max(0, p.stamina - drain + recover));
}
