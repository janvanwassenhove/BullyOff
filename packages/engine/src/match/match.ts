/**
 * Match state and the tick loop. `tick(state, commands)` advances exactly one
 * 20 Hz step and returns the events it emitted; the state object is opaque to
 * consumers (ADR-002). Mutates in place for speed — the *only* thing that may
 * hold a reference to it is the host that created it.
 */
import { Rng, dmath, type Scalar } from '@bullyoff/shared';
import { DT, ENGINE_VERSION, TICK_HZ } from '../constants.js';
import { createBall, launchBall, stepBall, type BallState } from '../ball/ball.js';
import { sweepBall, type BodyCollider } from '../ball/collide.js';
import { FRAME_PLAYER_STRIDE, type Frame, type MatchEvent, type MatchLog, type MatchLogHeader, type PlayerId, type TeamId } from '../events/events.js';
import { inCircle, LINE_23_X } from '../pitch/geometry.js';
import { createPlayer, stepPlayer, stickHead, type PlayerState } from '../player/player.js';
import { getProfile, type Profile, type ProfileId, type SurfaceState } from '../profile.js';
import type { Command } from './commands.js';

export interface PlayerSetup {
  id: PlayerId;
  team: TeamId;
  x: Scalar;
  y: Scalar;
  heading?: Scalar;
}

export interface MatchSetup {
  profile: ProfileId;
  surface: SurfaceState;
  players: PlayerSetup[];
  /** Record a kinematic frame every N ticks. Default 1. */
  frameEvery?: number;
}

export interface MatchState {
  readonly seed: number;
  readonly profile: Profile;
  readonly surface: SurfaceState;
  readonly rng: Rng;
  tick: number;
  ball: BallState;
  players: PlayerState[];        // stable order == header.playerIds
  playerIndex: Map<PlayerId, number>;
  inCircle: [boolean, boolean];  // ball membership per end [west, east]
  in23: [boolean, boolean];
  frameEvery: number;
  ended: boolean;
}

export function createMatch(setup: MatchSetup, seed: number): { state: MatchState; header: MatchLogHeader; events: MatchEvent[] } {
  const profile = getProfile(setup.profile);
  const players = [...setup.players]
    .sort((a, b) => a.id - b.id) // stable, explicit order (ADR-002)
    .map((p) => createPlayer(p.id, p.team, p.x, p.y, p.heading ?? 0));
  const playerIndex = new Map<PlayerId, number>();
  players.forEach((p, i) => playerIndex.set(p.id, i));
  const ball = createBall(0, 0);
  const state: MatchState = {
    seed, profile, surface: setup.surface, rng: new Rng(seed, 1),
    tick: 0, ball, players, playerIndex,
    inCircle: [inCircle(ball.pos, -1), inCircle(ball.pos, 1)],
    in23: [-ball.pos.x >= LINE_23_X, ball.pos.x >= LINE_23_X],
    frameEvery: Math.max(1, setup.frameEvery ?? 1),
    ended: false,
  };
  const header: MatchLogHeader = {
    format: 'bullyoff-replay', version: 1, engineVersion: ENGINE_VERSION,
    profile: setup.profile, surface: setup.surface, seed, tickHz: TICK_HZ,
    frameEvery: state.frameEvery,
    playerIds: players.map((p) => p.id), teams: players.map((p) => p.team),
  };
  const events: MatchEvent[] = [{ t: 'MatchStart', tick: 0, seed, profile: setup.profile, surface: setup.surface }];
  return { state, header, events };
}

/** Snapshot the kinematics for the renderer. */
export function captureFrame(s: MatchState): Frame {
  const players: number[] = new Array<number>(s.players.length * FRAME_PLAYER_STRIDE);
  s.players.forEach((p, i) => {
    const o = i * FRAME_PLAYER_STRIDE;
    players[o] = p.pos.x; players[o + 1] = p.pos.y; players[o + 2] = p.vel.x; players[o + 3] = p.vel.y;
    players[o + 4] = p.heading; players[o + 5] = p.stickAngle; players[o + 6] = p.stamina;
  });
  const b = s.ball;
  return { tick: s.tick, ball: [b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z], players };
}

/**
 * Advance one tick. Order within a tick (fixed — changing it changes every log):
 *  1. apply commands stamped for this tick, sorted by (playerId, kind) for stability
 *  2. step players (kinematics)
 *  3. integrate the ball → swept segment → resolve collisions/line crossings
 *  4. tick++ and emit events
 */
export function tick(s: MatchState, commands: readonly Command[]): MatchEvent[] {
  if (s.ended) return [];
  const events: MatchEvent[] = [];
  const t = s.tick;
  const { profile, ball } = s;
  const surface = profile.surfaces[s.surface];
  let struckBy: PlayerId | null = null;

  // 1. commands — stable order regardless of arrival order
  const cmds = commands.filter((c) => c.tick === t).sort(compareCommands);
  for (const c of cmds) {
    switch (c.kind) {
      case 'move': {
        const p = playerOf(s, c.playerId); if (!p) break;
        p.wantDir = { x: c.dx, y: c.dy }; p.wantEffort = clamp01(c.effort);
        break;
      }
      case 'aim': {
        const p = playerOf(s, c.playerId); if (!p) break;
        p.stickAngle = dmath.wrapAngle(c.angle);
        break;
      }
      case 'strike': {
        const p = playerOf(s, c.playerId); if (!p) break;
        if (!ballInReach(s, p)) break;
        const power = clamp01(c.power);
        const st = profile.strike;
        let speed: Scalar, lift: Scalar;
        switch (c.strike) {
          case 'push': speed = st.pushSpeed * power; lift = 0; break;
          case 'slap': speed = st.slapSpeed * power; lift = st.hitLiftAngle; break;
          case 'hit': speed = st.hitSpeed * power; lift = st.hitLiftAngle; break;
          case 'flick': speed = st.flickSpeed * power; lift = st.flickLiftAngle; break;
          case 'aerial': speed = st.aerialSpeed * power; lift = st.aerialLiftAngle; break;
        }
        p.stickAngle = dmath.wrapAngle(c.angle);
        launchBall(ball, c.angle, speed, lift);
        ball.lastTouch = p.id; ball.inNet = false;
        struckBy = p.id;
        events.push({ t: 'BallStruck', tick: t, playerId: p.id, team: p.team, kind: c.strike, speed, lift });
        break;
      }
      case 'trap': {
        const p = playerOf(s, c.playerId); if (!p) break;
        if (!ballInReach(s, p)) break;
        const keep = profile.strike.trapRetain;
        ball.vel = { x: ball.vel.x * keep, y: ball.vel.y * keep, z: 0 };
        ball.pos = { ...ball.pos, z: 0 }; ball.grounded = true; ball.lastTouch = p.id;
        struckBy = p.id;
        events.push({ t: 'BallTrapped', tick: t, playerId: p.id, team: p.team });
        break;
      }
      case 'placeBall':
        ball.pos = { x: c.x, y: c.y, z: c.z }; ball.vel = { x: c.vx, y: c.vy, z: c.vz };
        ball.grounded = c.z <= 0 && c.vz <= 0; ball.inNet = false;
        s.inCircle = [inCircle(ball.pos, -1), inCircle(ball.pos, 1)];
        s.in23 = [-ball.pos.x >= LINE_23_X, ball.pos.x >= LINE_23_X];
        break;
      case 'placePlayer': {
        const p = playerOf(s, c.playerId); if (!p) break;
        p.pos = { x: c.x, y: c.y }; p.vel = { x: 0, y: 0 }; p.heading = dmath.wrapAngle(c.heading); p.stickAngle = p.heading;
        break;
      }
    }
  }

  // 2. players
  for (const p of s.players) stepPlayer(p, DT, profile.player);

  // 3. ball
  const step = stepBall(ball, DT, profile.ball, surface);
  if (step.bounced) events.push({ t: 'BallBounce', tick: t, x: step.next.pos.x, y: step.next.pos.y, speedBefore: step.speedBeforeBounce });
  const bodies: BodyCollider[] = s.players.filter((p) => p.onPitch).map((p) => ({ playerId: p.id, pos: p.pos, radius: profile.player.radius, height: profile.player.height }));
  const sw = sweepBall({
    tick: t, from: ball.pos, to: step.next.pos, vel: step.next.vel, grounded: step.next.grounded,
    ballRadius: profile.ball.radius, bodies, ignoreBody: struckBy, lastTouch: ball.lastTouch,
    wasInNet: ball.inNet, inCircleBefore: s.inCircle, in23Before: s.in23,
  }, DT);
  ball.pos = sw.pos; ball.vel = sw.vel; ball.grounded = sw.grounded; ball.inNet = sw.inNet;
  s.inCircle = sw.inCircleAfter; s.in23 = sw.in23After;
  events.push(...sw.events);
  if (step.stopped && sw.events.length === 0) events.push({ t: 'BallStopped', tick: t, x: ball.pos.x, y: ball.pos.y });

  // 4.
  s.tick = t + 1;
  return events;
}

export function endMatch(s: MatchState): MatchEvent[] {
  if (s.ended) return [];
  s.ended = true;
  return [{ t: 'MatchEnd', tick: s.tick }];
}

/** Convenience: run a whole scripted scenario and return the complete log. */
export function simulate(setup: MatchSetup, seed: number, script: readonly Command[], ticks: number): MatchLog {
  const { state, header, events } = createMatch(setup, seed);
  const frames: Frame[] = [];
  const byTick = new Map<number, Command[]>();
  for (const c of script) { const arr = byTick.get(c.tick); if (arr) arr.push(c); else byTick.set(c.tick, [c]); }
  for (let i = 0; i < ticks; i++) {
    if (state.tick % state.frameEvery === 0) frames.push(captureFrame(state));
    events.push(...tick(state, byTick.get(state.tick) ?? []));
  }
  events.push(...endMatch(state));
  return { header, events, frames };
}

// ── helpers ──────────────────────────────────────────────────────────────────

const clamp01 = (v: Scalar): Scalar => (v < 0 ? 0 : v > 1 ? 1 : v);

function playerOf(s: MatchState, id: PlayerId): PlayerState | undefined {
  const i = s.playerIndex.get(id);
  return i === undefined ? undefined : s.players[i];
}

/** Ball is playable if it's within stick reach of the body and not above knee height... roughly. */
function ballInReach(s: MatchState, p: PlayerState): boolean {
  const reach = s.profile.player.reach;
  const b = s.ball;
  const head = stickHead(p, reach * 0.6);
  const dxb = b.pos.x - p.pos.x, dyb = b.pos.y - p.pos.y;
  const dxh = b.pos.x - head.x, dyh = b.pos.y - head.y;
  const nearBody = dxb * dxb + dyb * dyb <= reach * reach;
  const nearHead = dxh * dxh + dyh * dyh <= (reach * 0.8) * (reach * 0.8);
  return (nearBody || nearHead) && b.pos.z <= 0.6;
}

const KIND_ORDER: Record<Command['kind'], number> = { placeBall: 0, placePlayer: 1, move: 2, aim: 3, trap: 4, strike: 5 };
function compareCommands(a: Command, b: Command): number {
  const ka = KIND_ORDER[a.kind], kb = KIND_ORDER[b.kind];
  if (ka !== kb) return ka - kb;
  const pa = 'playerId' in a ? a.playerId : -1, pb = 'playerId' in b ? b.playerId : -1;
  return pa - pb;
}
