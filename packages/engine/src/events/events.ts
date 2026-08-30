/**
 * The event log — the engine's ONLY output and the contract every consumer
 * reads (ADR-002). Append-only schema (ADR-007): add event types and optional
 * fields; never rename or re-type existing ones. Consumers must ignore unknown
 * event types.
 *
 * Every event is a plain serialisable object with a `t` (type) discriminator and
 * `tick`. Time in seconds is always derived as `tick * DT`, never stored.
 */
import type { Scalar } from '@bullyoff/shared';
import type { End } from '@bullyoff/shared';
import type { ProfileId, SurfaceState } from '../profile.js';
import type { CardColour, FoulKind, Restart, RestartKind } from '@bullyoff/rules';

export type PlayerId = number;
export type TeamId = 0 | 1; // 0 = home (attacks +x), 1 = away (attacks −x)

export type StrikeKind = 'push' | 'slap' | 'hit' | 'flick' | 'aerial';
export type CollisionSurface = 'post' | 'crossbar' | 'backboard' | 'net' | 'player';

export type MatchEvent =
  | { t: 'MatchStart'; tick: number; seed: number; profile: ProfileId; surface: SurfaceState }
  | { t: 'MatchEnd'; tick: number }
  /** A player's stick imparted velocity to the ball. */
  | { t: 'BallStruck'; tick: number; playerId: PlayerId; team: TeamId; kind: StrikeKind; speed: Scalar; lift: Scalar; x?: Scalar; y?: Scalar; angle?: Scalar }
  /** A player controlled/stopped the ball. */
  | { t: 'BallTrapped'; tick: number; playerId: PlayerId; team: TeamId; clean?: boolean }
  /** A tackle contest was resolved (Phase 3). */
  | { t: 'Tackle'; tick: number; tacklerId: PlayerId; tacklerTeam: TeamId; carrierId: PlayerId; outcome: 'won' | 'lost' | 'foulTackler' | 'foulCarrier' }
  /** Ball touched turf after being airborne (z hit 0 with downward velocity). */
  | { t: 'BallBounce'; tick: number; x: Scalar; y: Scalar; speedBefore: Scalar }
  /** Ball hit something rigid on its swept path this tick. */
  | { t: 'BallCollision'; tick: number; surface: CollisionSurface; x: Scalar; y: Scalar; z: Scalar; playerId?: PlayerId }
  /** Swept collision resolver hit its per-tick cap — a bug signal, not a hockey event. */
  | { t: 'CollisionCapHit'; tick: number }
  /** Ball crossed the circle line at `end` (swept detection). */
  | { t: 'CircleEntry'; tick: number; end: End; lastTouch: PlayerId | null }
  | { t: 'CircleExit'; tick: number; end: End }
  /**
   * Ball centre crossed the goal line at `end`. `inGoal` = between the posts and
   * under the crossbar at the crossing → Phase 2 rules decide whether it's a goal
   * (circle rule, attacker's stick, etc.). Outside the goal mouth = over the backline.
   */
  | { t: 'GoalLineCrossed'; tick: number; end: End; inGoal: boolean; y: Scalar; z: Scalar; lastTouch: PlayerId | null }
  /** Ball crossed a sideline. */
  | { t: 'SidelineCrossed'; tick: number; side: 1 | -1; x: Scalar; lastTouch: PlayerId | null }
  /** Ball came to rest (rolling speed reached zero). */
  | { t: 'BallStopped'; tick: number; x: Scalar; y: Scalar }
  /** Ball crossed a 23 m line. */
  | { t: 'Line23Crossed'; tick: number; end: End; entering: boolean; lastTouch: PlayerId | null }
  // ── rule events (Phase 2) ──────────────────────────────────────────────────
  | { t: 'QuarterStart'; tick: number; quarter: 1 | 2 | 3 | 4; centrePassTeam: TeamId }
  | { t: 'QuarterEnd'; tick: number; quarter: 1 | 2 | 3 | 4; score: [number, number] }
  | { t: 'FullTime'; tick: number; score: [number, number] }
  | { t: 'Clock'; tick: number; running: boolean; reason: string; matchClockTicks: number }
  | { t: 'Goal'; tick: number; team: TeamId; scorerId: PlayerId | null; end: End; fromPC: boolean; fromPS: boolean; score: [number, number] }
  | { t: 'Foul'; tick: number; foul: FoulKind; againstPlayer: PlayerId | null; againstTeam: TeamId; x: Scalar; y: Scalar; awards: RestartKind; toTeam: TeamId }
  | { t: 'Card'; tick: number; colour: CardColour; playerId: PlayerId; team: TeamId; suspensionTicks: number; reason: string }
  | { t: 'Suspended'; tick: number; playerId: PlayerId; untilMatchClockTick: number }
  | { t: 'Reinstated'; tick: number; playerId: PlayerId }
  | { t: 'BallDead'; tick: number; x: Scalar; y: Scalar }
  | { t: 'RestartAwarded'; tick: number; restart: Restart }
  /** A restart nobody took in time was given to the other team (FIH 12.1 delaying; engine safeguard). */
  | { t: 'RestartReversed'; tick: number; from: TeamId; to: TeamId; restart: Restart['kind'] }
  | { t: 'RestartTaken'; tick: number; kind: RestartKind; team: TeamId; playerId: PlayerId }
  | { t: 'PenaltyCornerAwarded'; tick: number; team: TeamId; end: End }
  | { t: 'PenaltyCornerTaken'; tick: number; team: TeamId; end: End }
  | { t: 'PenaltyCornerEnded'; tick: number; team: TeamId; end: End; outcome: string }
  | { t: 'PenaltyStrokeAwarded'; tick: number; team: TeamId; end: End }
  | { t: 'PenaltyStrokeTaken'; tick: number; team: TeamId; end: End; scored: boolean }
  | { t: 'Substitution'; tick: number; team: TeamId; outId: PlayerId; inId: PlayerId }
  | { t: 'PlayersPlaced'; tick: number; count: number };

export type MatchEventType = MatchEvent['t'];

/**
 * A kinematic frame — what the renderer interpolates between (ADR-013).
 * Flat numeric arrays keep it cheap to clone across the worker boundary and to
 * serialise. Layout documented here is part of the schema.
 */
export interface Frame {
  tick: number;
  /** [x, y, z, vx, vy, vz] */
  ball: number[];
  /** Per on-pitch player, in `playerIds` order: [x, y, vx, vy, heading, stickAngle, stamina] */
  players: number[];
}
export const FRAME_PLAYER_STRIDE = 7;

export interface MatchLogHeader {
  format: 'bullyoff-replay';
  version: 1;
  engineVersion: string;
  profile: ProfileId;
  surface: SurfaceState;
  seed: number;
  tickHz: number;
  /** Frames are recorded every N ticks (1 = every tick). */
  frameEvery: number;
  /** Player ids in frame order. */
  playerIds: PlayerId[];
  teams: TeamId[];
}

export interface MatchLog {
  header: MatchLogHeader;
  events: MatchEvent[];
  frames: Frame[];
}
