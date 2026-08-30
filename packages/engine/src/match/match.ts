/**
 * Match state and the tick loop. `tick(state, commands)` advances exactly one
 * 20 Hz step and returns the events it emitted; the state object is opaque to
 * consumers (ADR-002). Mutates in place for speed — the *only* thing that may
 * hold a reference to it is the host that created it.
 *
 * Phase 2: the laws live in @bullyoff/rules. The engine gates commands through
 * `gateCommand`, runs physics, hands the tick's signals to `stepRules`, and
 * executes the rulings (dead ball, placements, suspensions, score, clock).
 */
import { HALF_LENGTH, HALF_WIDTH, LINE_23_X, Rng, clamp, dmath, inCircle, type Scalar, type Vec2 } from '@bullyoff/shared';
import {
  FIH_OUTDOOR, createRulesState, forceAward, gateCommand, stepRules,
  type Laws, type PlayerView, type Ruling, type RulesState, type RulesView, type TickSignals,
} from '@bullyoff/rules';
import { DT, ENGINE_VERSION, TICK_HZ } from '../constants.js';
import { createBall, launchBall, stepBall, type BallState } from '../ball/ball.js';
import { sweepBall, type BodyCollider } from '../ball/collide.js';
import { FRAME_PLAYER_STRIDE, type Frame, type MatchEvent, type MatchLog, type MatchLogHeader, type PlayerId, type TeamId } from '../events/events.js';
import { createPlayer, stepPlayer, stickHead, type PlayerState } from '../player/player.js';
import { gkReach, gkSaveChance, gkStrokeSaveChance, strikeErrorSd, strikeSpeedFactor, tackleOdds, trapSuccess, type Attributes, type Role } from '../player/attributes.js';
import { getProfile, type Profile, type ProfileId, type SurfaceState } from '../profile.js';
import type { Command } from './commands.js';

export interface PlayerSetup {
  id: PlayerId;
  team: TeamId;
  x: Scalar;
  y: Scalar;
  heading?: Scalar;
  isGoalkeeper?: boolean;
  /** false = starts on the bench (rolling substitutions). Default true. */
  onPitch?: boolean;
  role?: Role;
  /** 1–20 attributes; default = attributesFor(role) at level 12. Ignored in sandbox mode (raw profile values, no Rng noise). */
  attributes?: Attributes;
}

export interface MatchSetup {
  profile: ProfileId;
  surface: SurfaceState;
  players: PlayerSetup[];
  /** Record a kinematic frame every N ticks. 0 = no frames. Default 1. */
  frameEvery?: number;
  /** Laws in force. Default FIH_OUTDOOR. */
  laws?: Laws;
  /** Team taking the first centre pass (coin toss). Default: decided by the seeded Rng. */
  firstCentrePass?: TeamId;
  /**
   * Phase 1 sandbox mode: no laws applied, no clock — pure physics with scripted commands.
   * Default false. Kept so the physics fixtures and the golden hash stay meaningful.
   */
  sandbox?: boolean;
  /** Scenario fixtures: start live in open play at a given quarter/clock/score, no kick-off. */
  startLive?: { quarter: 1 | 2 | 3 | 4; clockTicks: number; score?: [number, number] };
}

export interface MatchState {
  readonly seed: number;
  readonly profile: Profile;
  readonly surface: SurfaceState;
  readonly laws: Laws;
  readonly sandbox: boolean;
  readonly rng: Rng;
  tick: number;
  ball: BallState;
  /** Team of the last toucher (rules need it; the ball only knows the id). */
  lastTouchTeam: TeamId | null;
  /**
   * Team that last *struck* the ball (a trap or body clip does not change it). Distinguishes the
   * receiver of a pass — even one clipped en route by a defender's stick — from the defender lunging
   * into the lane: only the lunge gets the interception penalty.
   */
  lastStrikeTeam: TeamId | null;
  players: PlayerState[];        // stable order == header.playerIds
  playerIndex: Map<PlayerId, number>;
  goalkeepers: Set<PlayerId>;
  inCircle: [boolean, boolean];  // ball membership per end [west, east]
  in23: [boolean, boolean];
  frameEvery: number;
  rules: RulesState;
  ended: boolean;
}

export function createMatch(setup: MatchSetup, seed: number): { state: MatchState; header: MatchLogHeader; events: MatchEvent[] } {
  const profile = getProfile(setup.profile);
  const rng = new Rng(seed, 1);
  const players = [...setup.players]
    .sort((a, b) => a.id - b.id) // stable, explicit order (ADR-002)
    .map((p) => {
      const role: Role = p.role ?? (p.isGoalkeeper ? 'GK' : 'MID');
      const ps = createPlayer(p.id, p.team, p.x, p.y, p.heading ?? 0, profile.player, role, p.attributes);
      if (setup.sandbox) ps.params = profile.player; // sandbox: raw profile kinematics
      ps.onPitch = p.onPitch ?? true;
      if (!ps.onPitch) ps.pos = dugout(p.team);
      return ps;
    });
  const playerIndex = new Map<PlayerId, number>();
  players.forEach((p, i) => playerIndex.set(p.id, i));
  const goalkeepers = new Set<PlayerId>(setup.players.filter((p) => p.isGoalkeeper).map((p) => p.id));
  const ball = createBall(0, 0);
  const firstCentrePass: TeamId = setup.firstCentrePass ?? (rng.chance(0.5) ? 0 : 1);
  const state: MatchState = {
    seed, profile, surface: setup.surface, laws: setup.laws ?? FIH_OUTDOOR, sandbox: setup.sandbox ?? false, rng,
    tick: 0, ball, lastTouchTeam: null, lastStrikeTeam: null, players, playerIndex, goalkeepers,
    inCircle: [inCircle(ball.pos, -1), inCircle(ball.pos, 1)],
    in23: [-ball.pos.x >= LINE_23_X, ball.pos.x >= LINE_23_X],
    frameEvery: Math.max(0, setup.frameEvery ?? 1),
    rules: createRulesState(firstCentrePass, setup.startLive ? { live: setup.startLive } : {}),
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

/** Bench position: beside the halfway line, off the pitch. Team 0 south, team 1 north. */
export const dugout = (team: TeamId): Vec2 => ({ x: 0, y: (team === 0 ? -1 : 1) * (HALF_WIDTH + 2) });
const dugoutEntry = (team: TeamId): Vec2 => ({ x: 0, y: (team === 0 ? -1 : 1) * (HALF_WIDTH - 0.5) });

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

/** Read-only view for the rules (and for controllers). Built once per tick. */
export function rulesView(s: MatchState): RulesView {
  const players: PlayerView[] = s.players.map((p) => ({
    id: p.id, team: p.team, pos: p.pos, vel: p.vel, heading: p.heading, onPitch: p.onPitch, isGoalkeeper: s.goalkeepers.has(p.id), stamina: p.stamina,
  }));
  const byId = new Map<PlayerId, PlayerView>();
  for (const p of players) byId.set(p.id, p);
  const b = s.ball;
  return {
    tick: s.tick,
    ball: { pos: b.pos, vel: b.vel, speed: Math.sqrt(b.vel.x ** 2 + b.vel.y ** 2 + b.vel.z ** 2), lastTouch: b.lastTouch, lastTouchTeam: s.lastTouchTeam, inCircle: s.inCircle },
    players,
    playerById: (id) => byId.get(id),
  };
}

/**
 * Advance one tick. Order within a tick (fixed — changing it changes every log):
 *  1. apply commands stamped for this tick, sorted for stability; strikes/traps/subs gated by the rules
 *  2. step players (kinematics)
 *  3. integrate the ball (unless dead) → swept segment → collisions/line crossings
 *  4. rules: signals → rulings → executed (dead ball, placements, suspensions, score, clock)
 *  5. tick++ and emit events
 */
export function tick(s: MatchState, commands: readonly Command[]): MatchEvent[] {
  if (s.ended) return [];
  const events: MatchEvent[] = [];
  const t = s.tick;
  const { profile, ball, laws } = s;
  const surface = profile.surfaces[s.surface];
  let struckBy: PlayerId | null = null;
  const view0 = rulesView(s);
  const sig: TickSignals = {
    struck: [], trapped: [], bodyContacts: [], circleEntries: [], circleExits: [], goalLineCrossings: [], sidelineCrossings: [], tackles: [],
    ballFrom: { ...ball.pos }, stopped: false,
  };
  const ballDead = !s.sandbox && s.rules.ballDead;

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
        if (!s.sandbox && !gateCommand(s.rules, view0, 'strike', p.id, laws)) break;
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
        let angle = dmath.wrapAngle(c.angle);
        if (!s.sandbox) {
          // Attributes scale speed and add angular error (a 20 sprays ~1.5°, a 1 ~9°; fatigue and composure widen it).
          speed *= strikeSpeedFactor(p.attrs, c.strike);
          // A penalty stroke is a practiced strike off a stationary ball with the game stopped: half
          // the in-play spray. At full spray ±0.5 m the taker fed the keeper's body ~1 in 5 strokes
          // and conversion sat at 0.45–0.53 where real strokes convert ~0.75.
          const spray = strikeErrorSd(p.attrs, c.strike, p.stamina) * (s.rules.psActive ? 0.45 : 1);
          angle = dmath.wrapAngle(angle + s.rng.gaussian(0, spray));
          if (lift > 0) lift = Math.max(0.005, lift + s.rng.gaussian(0, lift * 0.25));
        }
        p.stickAngle = angle;
        // The stick brings the ball round in front of the body before it is played: you cannot hit *through* yourself.
        // If the ball sits behind the strike direction, move it to just ahead of the body along that direction.
        {
          const cx = dmath.cos(angle), sy = dmath.sin(angle);
          const ahead = (ball.pos.x - p.pos.x) * cx + (ball.pos.y - p.pos.y) * sy;
          if (ahead < 0.25) ball.pos = { x: p.pos.x + cx * 0.5, y: p.pos.y + sy * 0.5, z: ball.pos.z };
        }
        launchBall(ball, angle, speed, lift);
        ball.lastTouch = p.id; ball.inNet = false; s.lastTouchTeam = p.team; s.lastStrikeTeam = p.team;
        struckBy = p.id;
        events.push({ t: 'BallStruck', tick: t, playerId: p.id, team: p.team, kind: c.strike, speed, lift, x: ball.pos.x, y: ball.pos.y, angle });
        sig.struck.push({ playerId: p.id, team: p.team, kind: c.strike, face: c.face ?? 'flat', speed, lift, at: { x: ball.pos.x, y: ball.pos.y } });
        break;
      }
      case 'trap': {
        const p = playerOf(s, c.playerId); if (!p) break;
        if (!s.sandbox && !gateCommand(s.rules, view0, 'trap', p.id, laws)) break;
        const isGk = s.goalkeepers.has(p.id);
        if (t < p.trapCooldownUntil) break; // beaten a moment ago: no second bite at the same ball
        if (!ballInReach(s, p, isGk ? gkReach(p.attrs) : undefined, isGk ? 2.0 : undefined)) break;
        const incoming = Math.sqrt(ball.vel.x ** 2 + ball.vel.y ** 2 + ball.vel.z ** 2);
        // Cutting out an opponent's firm pass is not receiving: the ball crosses you at pace and you
        // get one stick-length lunge at it. Measured before this penalty existed: 146 passes a match
        // were cleanly cut (real hockey has perhaps 20–30 interceptions), possession churned every
        // 2–3 touches and attacks never reached the circle. Receiving your own team's pass is untouched.
        // the profile's tempo scale: speed thresholds tuned on the men's game (push 14) apply to the
        // women's game at its own ball speed, or every duel favours the defence (see trapSuccess)
        const speedRef = profile.strike.pushSpeed / 14;
        const intercepting = !isGk && s.lastStrikeTeam !== null && s.lastStrikeTeam !== p.team && incoming > 6 * speedRef;
        let clean = true;
        if (!s.sandbox) {
          const dxb = ball.pos.x - p.pos.x, dyb = ball.pos.y - p.pos.y;
          let pClean = isGk
            ? (s.rules.psActive && s.rules.restart === null ? gkStrokeSaveChance(p.attrs) : Math.min(0.97, profile.calibration.gkSaveScale * gkSaveChance(p.attrs, incoming, Math.sqrt(dxb * dxb + dyb * dyb))))
            : trapSuccess(p.attrs, incoming, ball.pos.z, speedRef);
          if (intercepting) pClean *= 0.45;
          clean = s.rng.chance(pClean);
        }
        if (clean) {
          const keep = profile.strike.trapRetain;
          ball.vel = { x: ball.vel.x * keep, y: ball.vel.y * keep, z: 0 };
          ball.pos = { ...ball.pos, z: 0 }; ball.grounded = true;
        } else if (isGk) {
          p.trapCooldownUntil = t + 10;
          // beaten: the ball is barely touched — it carries on with most of its speed, slightly deflected (a fingertip, a pad edge)
          const a0 = dmath.atan2(ball.vel.y, ball.vel.x);
          const a = a0 + s.rng.gaussian(0, 0.12);
          const vh = Math.sqrt(ball.vel.x ** 2 + ball.vel.y ** 2) * s.rng.range(0.7, 0.95);
          ball.vel = { x: vh * dmath.cos(a), y: vh * dmath.sin(a), z: ball.vel.z * 0.8 };
        } else if (intercepting) {
          p.trapCooldownUntil = t + 8;
          // a failed cut is a clip, not a stop: the pass carries on to where it was going, slightly
          // deflected and slowed — the receiver usually still gets it (why lanes get played through)
          const a0 = dmath.atan2(ball.vel.y, ball.vel.x);
          const a = a0 + s.rng.gaussian(0, 0.22);
          const v = incoming * s.rng.range(0.55, 0.85);
          ball.vel = { x: v * dmath.cos(a), y: v * dmath.sin(a), z: 0 };
          ball.pos = { ...ball.pos, z: 0 }; ball.grounded = true;
        } else {
          p.trapCooldownUntil = t + 6;
          // miscontrol: the ball skids off the stick face and carries on roughly onward (±70°) at reduced speed
          const a0 = incoming > 0.5 ? dmath.atan2(ball.vel.y, ball.vel.x) : p.heading;
          const a = a0 + s.rng.range(-1.2, 1.2);
          const v = Math.max(1.5, incoming * s.rng.range(0.25, 0.55));
          ball.vel = { x: v * dmath.cos(a), y: v * dmath.sin(a), z: 0 };
          ball.pos = { ...ball.pos, z: 0 }; ball.grounded = true;
        }
        ball.lastTouch = p.id; s.lastTouchTeam = p.team;
        struckBy = p.id;
        events.push({ t: 'BallTrapped', tick: t, playerId: p.id, team: p.team, clean });
        sig.trapped.push({ playerId: p.id, team: p.team, at: { x: ball.pos.x, y: ball.pos.y }, clean });
        break;
      }
      case 'tackle': {
        const p = playerOf(s, c.playerId), q = playerOf(s, c.targetId);
        if (!p || !q || p.team === q.team || !p.onPitch || !q.onPitch) break;
        if (!s.sandbox && !gateCommand(s.rules, view0, 'strike', p.id, laws)) break;
        // The carrier must actually have the ball (last touch, within reach); the tackler must reach it too.
        if (ball.lastTouch !== q.id || !ballInReach(s, q) || !ballInReach(s, p, profile.player.reach * 1.15)) break;
        const odds = tackleOdds(p.attrs, q.attrs);
        const u = s.rng.next();
        // Obstruction: the carrier's back is to the tackler while shielding (heading away by > 110°) — sometimes called.
        const toTackler = dmath.atan2(p.pos.y - q.pos.y, p.pos.x - q.pos.x);
        const shielding = Math.abs(dmath.angleDelta(q.heading, toTackler)) > 1.92;
        let outcome: 'won' | 'lost' | 'foulTackler' | 'foulCarrier';
        if (u < odds.foulTackler) outcome = 'foulTackler';
        else if (shielding && u < odds.foulTackler + 0.06) outcome = 'foulCarrier';
        else if (u < odds.foulTackler + odds.win) outcome = 'won';
        else outcome = 'lost';
        if (outcome === 'won') {
          // the ball comes off the carrier's stick onto the tackler's and stops there
          ball.vel = { x: 0, y: 0, z: 0 }; ball.pos = { ...ball.pos, z: 0 }; ball.grounded = true;
          ball.lastTouch = p.id; s.lastTouchTeam = p.team; struckBy = p.id;
        } else if (outcome === 'lost') {
          // beaten: the lunge kills the tackler's momentum (they must turn and chase)
          p.vel = { x: p.vel.x * 0.3, y: p.vel.y * 0.3 };
        }
        events.push({ t: 'Tackle', tick: t, tacklerId: p.id, tacklerTeam: p.team, carrierId: q.id, outcome });
        sig.tackles.push({ tacklerId: p.id, tacklerTeam: p.team, carrierId: q.id, carrierTeam: q.team, at: { x: ball.pos.x, y: ball.pos.y }, outcome });
        break;
      }
      case 'substitute': {
        const out = playerOf(s, c.outId), inn = playerOf(s, c.inId);
        if (!out || !inn || out.team !== c.team || inn.team !== c.team || !out.onPitch || inn.onPitch) break;
        if (!s.sandbox && !gateCommand(s.rules, view0, 'substitute', out.id, laws)) break;
        // The outgoing player must be within the dugout zone (FIH 2.3) — PROVISIONAL: we teleport both; Phase 3 AI runs them off.
        out.onPitch = false; out.pos = dugout(c.team); out.vel = { x: 0, y: 0 }; out.wantEffort = 0;
        inn.onPitch = true; inn.pos = dugoutEntry(c.team); inn.vel = { x: 0, y: 0 };
        if (s.goalkeepers.has(out.id) && !s.goalkeepers.has(inn.id)) { /* kicking back: no GK — allowed (FIH 2.2) */ }
        events.push({ t: 'Substitution', tick: t, team: c.team, outId: out.id, inId: inn.id });
        break;
      }
      case 'placeBall':
        ball.pos = { x: c.x, y: c.y, z: c.z }; ball.vel = { x: c.vx, y: c.vy, z: c.vz };
        ball.grounded = c.z <= 0 && c.vz <= 0; ball.inNet = false;
        s.inCircle = [inCircle(ball.pos, -1), inCircle(ball.pos, 1)];
        s.in23 = [-ball.pos.x >= LINE_23_X, ball.pos.x >= LINE_23_X];
        sig.ballFrom = { ...ball.pos };
        break;
      case 'placePlayer': {
        const p = playerOf(s, c.playerId); if (!p) break;
        p.pos = { x: c.x, y: c.y }; p.vel = { x: 0, y: 0 }; p.heading = dmath.wrapAngle(c.heading); p.stickAngle = p.heading;
        break;
      }
      case 'award': {
        if (s.sandbox) break;
        executeRulings(s, forceAward(s.rules, laws, view0, c.restart, c.team, c.y, c.x), events, t);
        break;
      }
    }
  }

  // 2. players (per-player params: profile × attributes)
  for (const p of s.players) stepPlayer(p, DT);

  // 3. ball (frozen while dead)
  if (!ballDead) {
    const step = stepBall(ball, DT, profile.ball, surface);
    if (step.bounced) events.push({ t: 'BallBounce', tick: t, x: step.next.pos.x, y: step.next.pos.y, speedBefore: step.speedBeforeBounce });
    const bodies: BodyCollider[] = s.players.filter((p) => p.onPitch).map((p) => ({ playerId: p.id, pos: p.pos, radius: profile.player.radius, height: profile.player.height }));
    // The last toucher's own body does not collide with the ball while it is slow at their feet (dribbling: it's on
    // the stick, not the boot) or moving AWAY from them (they just played it). Anyone else's body still collides → feet.
    let ignore: PlayerId | null = struckBy;
    if (ignore === null && ball.lastTouch !== null) {
      const lt = playerOf(s, ball.lastTouch);
      if (lt) {
        const vx = step.next.vel.x, vy = step.next.vel.y;
        const slow = vx * vx + vy * vy < 16;
        const away = vx * (ball.pos.x - lt.pos.x) + vy * (ball.pos.y - lt.pos.y) > 0;
        if (slow || away) ignore = lt.id;
      }
    }
    const sw = sweepBall({
      tick: t, from: ball.pos, to: step.next.pos, vel: step.next.vel, grounded: step.next.grounded,
      ballRadius: profile.ball.radius, bodies, ignoreBody: ignore, lastTouch: ball.lastTouch,
      wasInNet: ball.inNet, inCircleBefore: s.inCircle, in23Before: s.in23,
    }, DT);
    const speedBefore = Math.sqrt(step.next.vel.x ** 2 + step.next.vel.y ** 2 + step.next.vel.z ** 2);
    ball.pos = sw.pos; ball.vel = sw.vel; ball.grounded = sw.grounded; ball.inNet = sw.inNet;
    s.inCircle = sw.inCircleAfter; s.in23 = sw.in23After;
    for (const e of sw.events) {
      events.push(e);
      if (e.t === 'BallCollision') {
        if (e.surface === 'player' && e.playerId !== undefined) {
          const p = playerOf(s, e.playerId);
          if (p) {
            // A ball at a field player is not automatically a foot: real defenders get the stick to it
            // first — that is what all the low-stick work is for. Skill-dependent, and it fades with
            // ball speed (a drag flick at the body from 5 m is exactly the foot the attacker wanted;
            // measured without this, 49 of 62 fouls a match were feet and every pass through traffic
            // ended in a whistle). A stick save is a deflection: same physics, no body contact.
            // no reaction time point-blank: a firm ball from inside ~6 m reaches the body before the
            // stick does — that is exactly the "win the corner" ball attackers play at a defender's feet
            const striker = ball.lastTouch === null ? undefined : playerOf(s, ball.lastTouch);
            const svRef = profile.strike.pushSpeed / 14; // tempo scale, see trapSuccess
            const pointBlank = striker !== undefined && striker.team !== p.team && speedBefore > 8 * svRef
              && (striker.pos.x - e.x) ** 2 + (striker.pos.y - e.y) ** 2 < 36;
            // in his own circle a defender is stretched — lunging, turning, on the line — and the
            // umpire calls the thinnest contact there anyway (it is where corners come from)
            const inOwnCircle = inCircle({ x: e.x, y: e.y }, p.team === 0 ? -1 : 1);
            // and on his own goal line there is no saving it with the stick at all — the last-man
            // block on a goal-bound ball is the body, and that body is what the stroke is FOR
            const ownGx = (p.team === 0 ? -1 : 1) * HALF_LENGTH;
            const onLine = inOwnCircle && (e.x - ownGx) ** 2 + e.y ** 2 < 16;
            const stickSave = !s.sandbox && !s.goalkeepers.has(p.id)
              && s.rng.chance(clamp(0.35 + 0.4 * ((p.attrs.technical.trapping - 1) / 19) - (speedBefore - 6 * svRef) / (50 * svRef) - (pointBlank ? 0.28 : 0) - (inOwnCircle ? 0.17 : 0) - (onLine ? 0.2 : 0), 0.05, 0.65));
            if (!stickSave) sig.bodyContacts.push({ playerId: p.id, team: p.team, at: { x: e.x, y: e.y, z: e.z }, ballSpeed: speedBefore, ballHeight: e.z });
            ball.lastTouch = p.id; s.lastTouchTeam = p.team;
          }
        }
      } else if (e.t === 'CircleEntry') sig.circleEntries.push({ end: e.end });
      else if (e.t === 'CircleExit') sig.circleExits.push({ end: e.end });
      else if (e.t === 'GoalLineCrossed') sig.goalLineCrossings.push({ end: e.end, inGoal: e.inGoal, y: e.y, z: e.z });
      else if (e.t === 'SidelineCrossed') sig.sidelineCrossings.push({ side: e.side, x: e.x });
    }
    if (step.stopped && sw.events.length === 0) { events.push({ t: 'BallStopped', tick: t, x: ball.pos.x, y: ball.pos.y }); sig.stopped = true; }
  }

  // 4. rules
  if (!s.sandbox) {
    const view = rulesView(s);
    const rulings = stepRules(s.rules, laws, view, sig);
    executeRulings(s, rulings, events, t);
  }

  // 5.
  s.tick = t + 1;
  return events;
}

function executeRulings(s: MatchState, rulings: readonly Ruling[], events: MatchEvent[], t: number): void {
  const { ball } = s;
  for (const r of rulings) {
    switch (r.kind) {
      case 'deadBall':
        ball.pos = { x: r.at.x, y: r.at.y, z: 0 }; ball.vel = { x: 0, y: 0, z: 0 }; ball.grounded = true; ball.inNet = false; ball.spin = 0;
        s.inCircle = [inCircle(ball.pos, -1), inCircle(ball.pos, 1)];
        s.in23 = [-ball.pos.x >= LINE_23_X, ball.pos.x >= LINE_23_X];
        events.push({ t: 'BallDead', tick: t, x: r.at.x, y: r.at.y });
        break;
      case 'placePlayers':
        for (const pl of r.placements) {
          const p = playerOf(s, pl.playerId); if (!p) continue;
          p.pos = { x: pl.x, y: pl.y }; p.vel = { x: 0, y: 0 }; p.heading = dmath.wrapAngle(pl.heading); p.stickAngle = p.heading; p.wantEffort = 0;
        }
        events.push({ t: 'PlayersPlaced', tick: t, count: r.placements.length });
        break;
      case 'suspend': {
        const p = playerOf(s, r.playerId); if (!p) break;
        p.onPitch = false; p.pos = dugout(p.team); p.vel = { x: 0, y: 0 }; p.wantEffort = 0;
        events.push({ t: 'Suspended', tick: t, playerId: r.playerId, untilMatchClockTick: r.untilTick });
        break;
      }
      case 'reinstate': {
        const p = playerOf(s, r.playerId); if (!p) break;
        p.onPitch = true; p.pos = dugoutEntry(p.team); p.vel = { x: 0, y: 0 };
        events.push({ t: 'Reinstated', tick: t, playerId: r.playerId });
        break;
      }
      case 'restart': events.push({ t: 'RestartAwarded', tick: t, restart: r.restart }); break;
      case 'goal': events.push({ t: 'Goal', tick: t, team: r.team, scorerId: r.scorerId, end: r.end, fromPC: r.fromPC, fromPS: r.fromPS, score: [s.rules.score[0], s.rules.score[1]] }); break;
      case 'foul': events.push({ t: 'Foul', tick: t, foul: r.foul, againstPlayer: r.againstPlayer, againstTeam: r.againstTeam, x: r.at.x, y: r.at.y, awards: r.awards, toTeam: r.toTeam }); break;
      case 'card': events.push({ t: 'Card', tick: t, colour: r.colour, playerId: r.playerId, team: r.team, suspensionTicks: r.suspensionTicks, reason: r.reason }); break;
      case 'clock': events.push({ t: 'Clock', tick: t, running: r.running, reason: r.reason, matchClockTicks: s.rules.matchClockTicks }); break;
      case 'quarterStart': events.push({ t: 'QuarterStart', tick: t, quarter: r.quarter, centrePassTeam: r.centrePassTeam }); break;
      case 'quarterEnd': events.push({ t: 'QuarterEnd', tick: t, quarter: r.quarter, score: [s.rules.score[0], s.rules.score[1]] }); break;
      case 'fullTime': events.push({ t: 'FullTime', tick: t, score: r.score }); events.push({ t: 'MatchEnd', tick: t }); s.ended = true; break;
      case 'penaltyCornerAwarded': events.push({ t: 'PenaltyCornerAwarded', tick: t, team: r.team, end: r.end }); break;
      case 'penaltyCornerTaken': events.push({ t: 'PenaltyCornerTaken', tick: t, team: r.team, end: r.end }); break;
      case 'penaltyCornerEnded': events.push({ t: 'PenaltyCornerEnded', tick: t, team: r.team, end: r.end, outcome: r.outcome }); break;
      case 'restartReversed': events.push({ t: 'RestartReversed', tick: t, from: r.from, to: r.to, restart: r.restart }); break;
      case 'penaltyStrokeAwarded': events.push({ t: 'PenaltyStrokeAwarded', tick: t, team: r.team, end: r.end }); break;
      case 'penaltyStrokeTaken': events.push({ t: 'PenaltyStrokeTaken', tick: t, team: r.team, end: r.end, scored: r.scored }); break;
      case 'substitution': events.push({ t: 'Substitution', tick: t, team: r.team, outId: r.outId, inId: r.inId }); break;
    }
  }
}

export function endMatch(s: MatchState): MatchEvent[] {
  if (s.ended) return [];
  s.ended = true;
  return [{ t: 'MatchEnd', tick: s.tick }];
}

/** Convenience: run a scripted scenario for N ticks and return the complete log. */
export function simulate(setup: MatchSetup, seed: number, script: readonly Command[], ticks: number): MatchLog {
  const { state, header, events } = createMatch(setup, seed);
  const frames: Frame[] = [];
  const byTick = new Map<number, Command[]>();
  for (const c of script) { const arr = byTick.get(c.tick); if (arr) arr.push(c); else byTick.set(c.tick, [c]); }
  for (let i = 0; i < ticks && !state.ended; i++) {
    if (state.frameEvery > 0 && state.tick % state.frameEvery === 0) frames.push(captureFrame(state));
    events.push(...tick(state, byTick.get(state.tick) ?? []));
  }
  events.push(...endMatch(state));
  return { header, events, frames };
}

/** A controller decides commands each tick from the read-only view — scripted (tests), AI (Phase 3) or human (arcade). */
export type Controller = (view: RulesView, rules: Readonly<RulesState>, tick: number) => Command[];

/** Run a full match under the laws until full time (or maxTicks) with a controller. */
export function simulateMatch(setup: MatchSetup, seed: number, controller: Controller, maxTicks = 200_000): MatchLog {
  const { state, header, events } = createMatch(setup, seed);
  const frames: Frame[] = [];
  for (let i = 0; i < maxTicks && !state.ended; i++) {
    if (state.frameEvery > 0 && state.tick % state.frameEvery === 0) frames.push(captureFrame(state));
    const cmds = controller(rulesView(state), state.rules, state.tick);
    events.push(...tick(state, cmds));
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

/** Ball is playable if it's within stick reach of the body and not above waist height. */
function ballInReach(s: MatchState, p: PlayerState, reachOverride?: Scalar, maxHeight = 0.6): boolean {
  if (!p.onPitch) return false;
  const reach = reachOverride ?? s.profile.player.reach;
  const b = s.ball;
  const head = stickHead(p, reach * 0.6);
  const dxb = b.pos.x - p.pos.x, dyb = b.pos.y - p.pos.y;
  const dxh = b.pos.x - head.x, dyh = b.pos.y - head.y;
  const nearBody = dxb * dxb + dyb * dyb <= reach * reach;
  const nearHead = dxh * dxh + dyh * dyh <= (reach * 0.8) * (reach * 0.8);
  return (nearBody || nearHead) && b.pos.z <= maxHeight;
}

const KIND_ORDER: Record<Command['kind'], number> = { placeBall: 0, placePlayer: 1, award: 2, substitute: 3, move: 4, aim: 5, tackle: 6, trap: 7, strike: 8 };
function compareCommands(a: Command, b: Command): number {
  const ka = KIND_ORDER[a.kind], kb = KIND_ORDER[b.kind];
  if (ka !== kb) return ka - kb;
  const pa = 'playerId' in a ? a.playerId : 'outId' in a ? a.outId : -1;
  const pb = 'playerId' in b ? b.playerId : 'outId' in b ? b.outId : -1;
  return pa - pb;
}
