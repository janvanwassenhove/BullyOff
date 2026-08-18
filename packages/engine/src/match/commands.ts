/**
 * Tick-stamped, serialisable input commands (ADR-002, ADR-005 guardrail 4).
 * These are the ONLY way anything outside the engine influences a match. The
 * same shapes travel over the worker boundary (ADR-008) and would travel over a
 * network (ADR-011). Plain objects; no functions, no class instances.
 */
import type { Radians, Scalar } from '@bullyoff/shared';
import type { PlayerId, StrikeKind } from '../events/events.js';

export type Command =
  /** Set a player's movement intent: direction (any length; normalised) and effort 0..1. Persists until changed. */
  | { tick: number; kind: 'move'; playerId: PlayerId; dx: Scalar; dy: Scalar; effort: Scalar }
  /** Aim the stick at an absolute angle this tick (otherwise it follows heading). */
  | { tick: number; kind: 'aim'; playerId: PlayerId; angle: Radians }
  /** Strike the ball if within reach: kind selects speed/lift from the profile; power 0..1 scales speed. */
  | { tick: number; kind: 'strike'; playerId: PlayerId; strike: StrikeKind; angle: Radians; power: Scalar }
  /** Trap/stop the ball if within reach. */
  | { tick: number; kind: 'trap'; playerId: PlayerId }
  /** Phase 1 sandbox helper: place the ball (tests, scenario setup). Not available to players in play. */
  | { tick: number; kind: 'placeBall'; x: Scalar; y: Scalar; z: Scalar; vx: Scalar; vy: Scalar; vz: Scalar }
  /** Phase 1 sandbox helper: teleport a player. */
  | { tick: number; kind: 'placePlayer'; playerId: PlayerId; x: Scalar; y: Scalar; heading: Radians };

export type CommandKind = Command['kind'];
