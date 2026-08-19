/**
 * The utility-based player AI (BRIEF §5.4) as a `Controller`.
 *
 * Per tick: for each team, find the ball carrier (or the players contesting a
 * loose ball); the carrier scores candidate actions {shoot, pass ×N, carry ×8,
 * clear} against the value function + risk + attributes; off-ball players move
 * to shape targets (attack: support/runs; defence: press/mark/drop); the keeper
 * runs its own model; restarts, PCs and strokes are handled explicitly.
 * Everything the AI knows comes from `RulesView`, `RulesState` and its own
 * squad data — never from MatchState (ADR-002).
 *
 * Deterministic: one Rng seeded per controller. Decisions for off-ball players
 * are re-evaluated every DECISION_EVERY ticks (5 Hz) to keep 10 000-match batches
 * cheap; the carrier and the nearest defender think every tick.
 */
import {
  CIRCLE_TOP_X, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, Rng, clamp, dmath, inCircle, in23,
  type End, type Scalar, type Vec2,
} from '@bullyoff/shared';
import { attackingEnd, type PlayerView, type RulesState, type RulesView, type TeamId } from '@bullyoff/rules';
import type { Command } from '../match/commands.js';
import type { Controller, PlayerSetup } from '../match/match.js';
import { attributesFor, norm, type Attributes, type Role } from '../player/attributes.js';
import { DEFAULT_TACTICS, FORMATION_433, shapeTarget, type Slot, type TeamTactics } from './tactics.js';
import { laneEntersCircle, pitchValue, shotQuality } from './valueGrid.js';
import { MENS, type Profile, type SurfaceState } from '../profile.js';
import { strikeSpeedFactor } from '../player/attributes.js';

const DECISION_EVERY = 4;

export interface SquadPlayer {
  id: number;
  role: Role;
  attrs: Attributes;
  /** Formation slot index (0 = GK). Bench players share the slot of the player they cover. */
  slot: number;
}

export interface AiTeam {
  team: TeamId;
  players: SquadPlayer[];
  tactics: TeamTactics;
}

/** Build AI squads from PlayerSetup (uses setup.role/attributes; slot = order within team). */
export function squadsFromSetup(setup: readonly PlayerSetup[], tactics: [TeamTactics, TeamTactics] = [DEFAULT_TACTICS, DEFAULT_TACTICS]): [AiTeam, AiTeam] {
  const mk = (team: TeamId): AiTeam => {
    const ps = setup.filter((p) => p.team === team).sort((a, b) => a.id - b.id);
    const starters = ps.filter((p) => p.onPitch ?? true);
    const bench = ps.filter((p) => !(p.onPitch ?? true));
    const players: SquadPlayer[] = starters.map((p, i) => ({
      id: p.id, role: p.role ?? (p.isGoalkeeper ? 'GK' : FORMATION_433[i]?.role ?? 'MID'), attrs: p.attributes ?? attributesFor(p.role ?? FORMATION_433[i]?.role ?? 'MID'), slot: i,
    }));
    bench.forEach((p, i) => {
      const role = p.role ?? 'MID';
      const cover = starters.findIndex((s, j) => (s.role ?? FORMATION_433[j]?.role) === role);
      players.push({ id: p.id, role, attrs: p.attributes ?? attributesFor(role), slot: cover >= 0 ? cover : 1 + (i % 10) });
    });
    return { team, players, tactics: tactics[team] };
  };
  return [mk(0), mk(1)];
}

interface PcRoles { key: number; injector: number | null; trapper: number | null; striker: number | null; injSide?: number; strikerArrivingUntil?: number }

interface Ctx {
  view: RulesView; rules: Readonly<RulesState>; tick: number; rng: Rng; pcRoles: PcRoles;
  team: AiTeam; end: End; opp: PlayerView[]; mine: PlayerView[]; onPitch: PlayerView[];
  ball: Vec2; ballZ: Scalar; ballSpeed: Scalar; ballVel: Vec2;
  keeperOpp: PlayerView | undefined; keeperMine: PlayerView | undefined;
  attrsOf(id: number): Attributes;
  slotOf(id: number): Slot;
  cmds: Command[];
  profile: Profile; surface: SurfaceState;
}

export interface AiOptions { profile?: Profile; surface?: SurfaceState }

/**
 * Launch speed for a rolling pass over distance d arriving at v_arr, under
 * decel a + k·v² (see ball.ts): d = ln((a + k v0²)/(a + k v_arr²)) / (2k).
 * The player's "feel" for the pitch — surface-aware, as a real player is.
 */
export function passSpeedFor(d: Scalar, vArr: Scalar, profile: Profile, surface: SurfaceState): Scalar {
  const a = profile.surfaces[surface].rollingDecel, k = profile.ball.airDrag;
  const v0sq = ((a + k * vArr * vArr) * dmath.exp(2 * k * d) - a) / k;
  return Math.sqrt(Math.max(vArr * vArr, v0sq));
}

export function aiController(seed: number, squads: [AiTeam, AiTeam], opts: AiOptions = {}): Controller {
  const rng = new Rng(seed, 11);
  const profile = opts.profile ?? MENS;
  const surface = opts.surface ?? 'watered';
  const attrsMap = new Map<number, Attributes>();
  const slotMap = new Map<number, Slot>();
  const roleMap = new Map<number, Role>();
  for (const t of squads) for (const p of t.players) {
    attrsMap.set(p.id, p.attrs); roleMap.set(p.id, p.role);
    slotMap.set(p.id, FORMATION_433[p.slot] ?? { role: p.role, xp: 30, y: 0 });
  }
  const leaving = new Map<number, number>(); // outId → inId, players jogging to the dugout
  const lastTackleTick = new Map<number, number>();
  const pcRoles: PcRoles = { key: -1, injector: null, trapper: null, striker: null };

  return (view: RulesView, rules: Readonly<RulesState>, tick: number): Command[] => {
    const cmds: Command[] = [];
    if (rules.phase !== 'inPlay') return cmds;
    const b = view.ball;
    const ball = { x: b.pos.x, y: b.pos.y };
    const ballVel = { x: b.vel.x, y: b.vel.y };
    const ballSpeed = Math.sqrt(ballVel.x ** 2 + ballVel.y ** 2);

    for (const team of squads) {
      const end = attackingEnd(team.team);
      const onPitch = view.players.filter((p) => p.onPitch);
      const mine = onPitch.filter((p) => p.team === team.team);
      const opp = onPitch.filter((p) => p.team !== team.team);
      const ctx: Ctx = {
        view, rules, tick, rng, pcRoles, team, end, opp, mine, onPitch, ball, ballZ: b.pos.z, ballSpeed, ballVel,
        keeperOpp: opp.find((p) => p.isGoalkeeper), keeperMine: mine.find((p) => p.isGoalkeeper),
        attrsOf: (id) => attrsMap.get(id) ?? attributesFor(roleMap.get(id) ?? 'MID'),
        slotOf: (id) => slotMap.get(id) ?? { role: 'MID', xp: 30, y: 0 },
        cmds, profile, surface,
      };
      teamTick(ctx, leaving, lastTackleTick);
    }
    return cmds;
  };
}

// ── team-level ─────────────────────────────────────────────────────────────────

function teamTick(c: Ctx, leaving: Map<number, number>, lastTackleTick: Map<number, number>): void {
  const { view, rules, tick, team, end, mine, ball } = c;
  const restart = rules.restart;
  const restartMine = restart !== null && restart.team === team.team;
  const restartTheirs = restart !== null && restart.team !== team.team;

  // who has the ball?
  const carrier = findCarrier(c);
  const inPossession = carrier !== null ? carrier.team === team.team : (view.ball.lastTouchTeam === team.team);
  const nearestMine = nearestTo(mine.filter((p) => !p.isGoalkeeper), ball) ?? nearestTo(mine, ball);
  const ballXp = end * ball.x + HALF_LENGTH; // metres from our own goal line
  const ballY = end * ball.y;

  // ── penalty corner: scripted roles ─────────────────────────────────────────
  if (rules.pcActive && rules.pcTeam !== null) {
    if (rules.pcTeam === team.team) { pcAttack(c, restart !== null); return; }
    pcDefend(c, restart !== null); return;
  }
  // ── penalty stroke ─────────────────────────────────────────────────────────
  if (rules.psActive) {
    if (restartMine && nearestMine) {
      const gx = end * HALF_LENGTH;
      const dxp = gx - ball.x, dyp = -ball.y;
      const d = Math.sqrt(dxp * dxp + dyp * dyp);
      if (d < 20) {
        // the taker: pick a corner and flick
        c.cmds.push({ tick, kind: 'move', playerId: nearestMine.id, dx: ball.x - nearestMine.pos.x, dy: ball.y - nearestMine.pos.y, effort: 0.6 });
        if (dist(nearestMine.pos, ball) < 1.3) {
          const corner = c.rng.chance(0.5) ? 1 : -1;
          const aim = dmath.atan2(corner * (GOAL_HALF_WIDTH - 0.75) - ball.y, gx - ball.x);
          c.cmds.push({ tick, kind: 'strike', playerId: nearestMine.id, strike: 'flick', angle: aim, power: 0.9 });
        }
      }
    }
    // everyone else holds; keeper reacts in the GK model
    if (c.keeperMine && !restartMine) goalkeeper(c, c.keeperMine, null);
    return;
  }

  // ── restarts (free hits, side-ins, long corners, hit-outs, centre pass) ────
  if (restartMine && nearestMine) {
    const taker = nearestMine;
    c.cmds.push({ tick, kind: 'move', playerId: taker.id, dx: ball.x - taker.pos.x, dy: ball.y - taker.pos.y, effort: 0.8 });
    if (tick >= restart.readyTick && dist(taker.pos, ball) < 1.3) {
      const opt = bestOption(c, taker, /*restart*/ true);
      issue(c, taker, opt);
    }
    // teammates: shape for possession
    for (const p of mine) if (p.id !== taker.id) moveToShape(c, p, true, ballXp, ballY);
    return;
  }
  if (restartTheirs) {
    // defend the restart: shape, keeper set; nobody rushes the ball (5 m rule — the placement did that already)
    for (const p of mine) if (!p.isGoalkeeper) moveToShape(c, p, false, ballXp, ballY);
    if (c.keeperMine) goalkeeper(c, c.keeperMine, null);
    return;
  }

  // ── open play ──────────────────────────────────────────────────────────────
  if (carrier?.team === team.team) {
    // carrier decides every tick
    const opt = bestOption(c, carrier, false);
    issue(c, carrier, opt);
    for (const p of mine) if (p.id !== carrier.id && !p.isGoalkeeper) supportRun(c, p, carrier, ballXp, ballY);
  } else if (carrier && carrier.team !== team.team) {
    // defending: nearest presses/tackles, second closes, others mark by shape
    defend(c, carrier, ballXp, ballY, lastTackleTick);
  } else {
    // loose ball: nearest chases; if the ball is coming, trap it
    looseBall(c, ballXp, ballY, inPossession);
  }
  if (c.keeperMine) goalkeeper(c, c.keeperMine, carrier);

  // ── rolling substitutions: tired players jog off at the dugout ─────────────
  substitutions(c, leaving);
}

// ── carrier decisions ──────────────────────────────────────────────────────────

type Option =
  | { kind: 'shoot'; angle: Scalar; strike: 'hit' | 'flick' | 'push'; power: Scalar; u: Scalar }
  | { kind: 'pass'; to: PlayerView; angle: Scalar; strike: 'push' | 'slap' | 'hit' | 'aerial'; power: Scalar; u: Scalar }
  | { kind: 'carry'; dir: Vec2; u: Scalar }
  | { kind: 'clear'; angle: Scalar; u: Scalar };

function bestOption(c: Ctx, me: PlayerView, restart: boolean): Option {
  const { end, ball, opp, mine, rules, team } = c;
  const a = c.attrsOf(me.id);
  const noise = 0.18 * (1 - norm(a.mental.decisions));
  const options: Option[] = [];
  const here = pitchValue(ball, end);
  const pressure = pressureAt(opp, ball, 4);
  const gx = end * HALF_LENGTH;
  const inD = inCircle(ball, end);
  const canShootNow = inD && !restart;

  // shoot
  if (canShootNow) {
    const q = shotQuality(ball, end, c.keeperOpp?.pos ?? null);
    const dGoal = Math.sqrt((gx - ball.x) ** 2 + ball.y ** 2);
    // aim: the far post side away from the keeper, a bit inside the post
    const keeperY = c.keeperOpp?.pos.y ?? 0;
    const side = keeperY > ball.y * 0.3 ? -1 : 1;
    const targetY = side * (GOAL_HALF_WIDTH - 0.5);
    const angle = dmath.atan2(targetY - ball.y, gx - ball.x);
    const flickPref = norm(a.technical.dragFlick) - norm(a.technical.hit);
    const strike = dGoal < 7 ? 'push' : flickPref > 0.1 && dGoal < 12 ? 'flick' : 'hit';
    // Shoot when the chance is decent; from a poor angle prefer to work the ball (carry/pass) unless pressed.
    // Hockey reason: a shot from the edge of the D at 30° is a turnover; the spot strip is where goals come from.
    const u = 0.2 + 1.4 * q + 0.25 * pressure * norm(a.mental.composure) - 0.15 * (1 - team.tactics.tempo) + c.rng.gaussian(0, noise);
    options.push({ kind: 'shoot', angle, strike, power: strike === 'push' ? 0.9 : 1, u });
  }

  // passes
  for (const mate of mine) {
    if (mate.id === me.id || mate.isGoalkeeper) continue;
    const lead = { x: mate.pos.x + mate.vel.x * 0.6, y: mate.pos.y + mate.vel.y * 0.6 };
    const d = dist(ball, lead);
    if (d < 3 || d > 45) continue;
    const gain = pitchValue(lead, end) - here;
    const risk = laneRisk(opp, ball, lead);
    const open = clamp((nearestDist(opp, lead) - 1.5) / 4, 0, 1);
    const lengthPen = d > 28 ? (d - 28) / 30 : d < 7 ? (7 - d) / 10 : 0;
    const intoD = laneEntersCircle(ball, lead, end) ? 0.25 : 0;
    // backwards passes are fine when pressed, poor otherwise
    const backwards = end * (lead.x - ball.x) < -5 ? (pressure > 0.5 ? 0 : 0.12) : 0;
    const vision = 0.15 * norm(a.mental.vision);
    // Inside the attacking D a "risky" lane past a defender is a chance to hit a foot and win a PC — attackers take it.
    const riskW = inD ? 0.6 : 1.4;
    let u = 0.15 + 1.2 * gain + 0.35 * open - riskW * risk - lengthPen + intoD - backwards + vision + c.rng.gaussian(0, noise);
    if (restart) u += 0.2; // restarts want to be taken
    const angle = dmath.atan2(lead.y - ball.y, lead.x - ball.x);
    // arrive at a trappable ~6 m/s (a bit quicker when the receiver is pressed and needs it early)
    const vArr = 5.5 + 3 * (1 - open);
    const need = passSpeedFor(d, vArr, c.profile, c.surface);
    let strike: 'push' | 'slap' | 'hit' | 'aerial' = need <= c.profile.strike.pushSpeed * strikeSpeedFactor(a, 'push') ? 'push' : need <= c.profile.strike.slapSpeed * strikeSpeedFactor(a, 'slap') ? 'slap' : 'hit';
    // long ball over a press: aerial when the lane is blocked but the target is free
    if (d > 22 && risk > 0.5 && open > 0.6 && norm(a.technical.skills3d) > 0.4 && !restart) { strike = 'aerial'; u += 0.15; }
    const maxV = (strike === 'push' ? c.profile.strike.pushSpeed : strike === 'slap' ? c.profile.strike.slapSpeed : strike === 'hit' ? c.profile.strike.hitSpeed : c.profile.strike.aerialSpeed) * strikeSpeedFactor(a, strike);
    const power = strike === 'aerial' ? clamp(0.5 + d / 60, 0.5, 1) : clamp(need / maxV, 0.25, 1);
    options.push({ kind: 'pass', to: mate, angle, strike, power, u });
  }

  // carries: 8 directions, 5 m ahead
  if (!restart || rules.restart?.kind !== 'penaltyStroke') {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * dmath.TWO_PI;
      const dir = { x: dmath.cos(ang), y: dmath.sin(ang) };
      const to = { x: ball.x + dir.x * 5, y: ball.y + dir.y * 5 };
      if (Math.abs(to.x) > HALF_LENGTH - 0.5 || Math.abs(to.y) > HALF_WIDTH - 0.5) continue;
      const gain = pitchValue(to, end) - here;
      const space = clamp((nearestDistAhead(opp, ball, dir, 6) - 1) / 4, 0, 1);
      const elim = 0.15 * norm(a.technical.elimination);
      let u = 0.05 + 1.0 * gain + 0.7 * space - 0.5 * pressure * (1 - elim) + c.rng.gaussian(0, noise * 0.5);
      if (restart) u -= 0.1; // self-pass is fine, but a pass usually beats it
      // don't carry into your own circle
      if (inCircle(to, -end as End)) u -= 0.4;
      options.push({ kind: 'carry', dir, u });
    }
  }

  // clear: from own 23 m under pressure, hit long and wide
  const ownEnd = -end as End;
  if (in23(ball, ownEnd) && pressure > 0.4) {
    const side = ball.y >= 0 ? 1 : -1;
    const angle = dmath.atan2(side * 18 - ball.y, end * 35 - ball.x);
    options.push({ kind: 'clear', angle, u: 0.3 + 0.5 * pressure - 0.2 * team.tactics.tempo });
  }

  // tempo: quick teams shave carry utility
  for (const o of options) if (o.kind === 'carry') o.u -= 0.1 * team.tactics.tempo;

  let best = options[0] ?? { kind: 'carry' as const, dir: { x: end, y: 0 }, u: 0 };
  for (const o of options) if (o.u > best.u) best = o;
  return best;
}

function issue(c: Ctx, me: PlayerView, o: Option): void {
  const { tick, ball } = c;
  switch (o.kind) {
    case 'shoot': c.cmds.push({ tick, kind: 'strike', playerId: me.id, strike: o.strike, angle: o.angle, power: o.power }); break;
    case 'pass': c.cmds.push({ tick, kind: 'strike', playerId: me.id, strike: o.strike, angle: o.angle, power: o.power }); break;
    case 'clear': c.cmds.push({ tick, kind: 'strike', playerId: me.id, strike: 'hit', angle: o.angle, power: 0.7 }); break;
    case 'carry': {
      // dribble: move that way; nudge the ball ahead with a soft push when it's at the feet
      c.cmds.push({ tick, kind: 'move', playerId: me.id, dx: o.dir.x, dy: o.dir.y, effort: 0.85 });
      if (c.ballSpeed < 1.5 && dist(me.pos, ball) < 1.3) {
        const ang = dmath.atan2(o.dir.y, o.dir.x);
        c.cmds.push({ tick, kind: 'strike', playerId: me.id, strike: 'push', angle: ang, power: 0.24 });
      }
      break;
    }
  }
}

// ── off-ball ───────────────────────────────────────────────────────────────────

function moveToShape(c: Ctx, p: PlayerView, inPossession: boolean, ballXp: Scalar, ballY: Scalar): void {
  if (p.isGoalkeeper) return;
  if ((c.tick + p.id) % DECISION_EVERY !== 0) return;
  const target = shapeTarget(c.slotOf(p.id), c.end, ballXp, ballY, inPossession, c.team.tactics);
  moveTo(c, p, target, inPossession ? 0.6 : 0.7);
}

function supportRun(c: Ctx, p: PlayerView, carrier: PlayerView, ballXp: Scalar, ballY: Scalar): void {
  if ((c.tick + p.id) % DECISION_EVERY !== 0) return;
  const { end } = c;
  let target = shapeTarget(c.slotOf(p.id), end, ballXp, ballY, true, c.team.tactics);
  const slot = c.slotOf(p.id);
  // forwards: attack the D — top-of-D staging or the far post when the ball is deep and wide
  if (slot.role === 'FWD' && ballXp > 50) {
    const side = Math.sign(slot.y) || 0; // -1 left winger, 0 centre forward, +1 right winger (team frame)
    if (ballXp > 62) {
      // ball in the 23: get INTO the circle — CF on the spot strip, wingers at the near/far post pockets.
      // Hockey reason: nothing scores from outside the D; the lead into the circle is the whole game.
      const ballSideTeam = end * c.ball.y;
      if (side === 0) target = { x: end * (HALF_LENGTH - 8), y: end * clamp(ballSideTeam * 0.3, -2, 2) };
      else if (side === Math.sign(ballSideTeam || 1)) target = { x: end * (HALF_LENGTH - 5), y: end * side * 5 };  // near-post pocket
      else target = { x: end * (HALF_LENGTH - 7), y: end * side * 3 };                                             // far post
    } else {
      // staging at the top of the D, spread
      target = { x: end * (CIRCLE_TOP_X - 1.5), y: end * side * 9 };
    }
  }
  // midfielders: offer a safe option 8–14 m behind/beside the carrier
  if (slot.role === 'MID' && dist(p.pos, carrier.pos) > 22) {
    target = { x: carrier.pos.x - end * 8, y: clamp(carrier.pos.y + Math.sign(slot.y || 1) * 10, -HALF_WIDTH + 3, HALF_WIDTH - 3) };
  }
  // don't crowd the carrier
  if (dist(target, carrier.pos) < 5) target = { x: target.x - end * 6, y: target.y };
  moveTo(c, p, target, 0.65);
}

function defend(c: Ctx, carrier: PlayerView, ballXp: Scalar, ballY: Scalar, lastTackleTick: Map<number, number>): void {
  const { end, mine, tick, team, ball } = c;
  const outfield = mine.filter((p) => !p.isGoalkeeper);
  // press line: how far up the pitch (from our goal) we engage
  const pressLine = 22 + team.tactics.pressHeight * 55;
  const engage = ballXp < pressLine || in23(ball, -end as End);
  const byDist = [...outfield].sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball));
  const first = byDist[0], second = byDist[1], third = byDist[2];
  const inOwnDNow = inCircle(ball, -end as End);
  for (const p of outfield) {
    if (engage && (p.id === first?.id || p.id === second?.id || (inOwnDNow && p.id === third?.id))) {
      // close down: run at the ball, tackle when in reach; second man covers the pass inside
      // jockey 2 m goal-side (stick reach is 1.6 m; you tackle from there, you don't stand on the ball).
      // In our own circle the first defender gets ON the ball–goal line to block the shot with stick and body —
      // that is where most penalty corners come from (feet), and it is what real defenders do.
      const inOwnD = inCircle(ball, -end as End);
      const ownGoal = { x: -end * HALF_LENGTH, y: 0 };
      const gvx = ownGoal.x - ball.x, gvy = ownGoal.y - ball.y; const gl = Math.sqrt(gvx * gvx + gvy * gvy) || 1;
      const goalSide = inOwnD
        ? { x: ball.x + (gvx / gl) * 1.7, y: ball.y + (gvy / gl) * 1.7 }
        : { x: ball.x - end * 2.0, y: ball.y + (p.pos.y > ball.y ? 0.5 : -0.5) };
      // second and third defenders stack the line towards goal, slightly staggered — a real D is crowded
      const cover = inOwnD ? { x: ball.x + (gvx / gl) * 3.2, y: ball.y + (gvy / gl) * 3.2 + (ball.y > 0 ? -1.0 : 1.0) } : { x: ball.x - end * 5, y: ball.y + (ball.y > 0 ? -4 : 4) };
      const cover3 = { x: ball.x + (gvx / gl) * 4.6, y: ball.y + (gvy / gl) * 4.6 + (ball.y > 0 ? 1.0 : -1.0) };
      const target = p.id === first?.id ? goalSide : p.id === second?.id ? cover : cover3;
      if (inOwnD) c.cmds.push({ tick, kind: 'move', playerId: p.id, dx: target.x - p.pos.x, dy: target.y - p.pos.y, effort: dist(p.pos, target) < 0.4 ? 0 : 1 });
      else moveTo(c, p, target, 1);
      const d = dist(p.pos, ball);
      // Tackle: pick the moment (not every tick), and a beaten tackler is out of it for ~2 s — a lunge that misses
      // leaves you behind the play; that is what makes elimination skills matter.
      if (p.id === first?.id && d < 1.9 && tick - (lastTackleTick.get(p.id) ?? -99) >= 40) {
        const aggr = 0.08 + 0.2 * norm(c.attrsOf(p.id).technical.tackling) + 0.2 * (in23(ball, -end as End) ? 1 : 0) + 0.2 * (inOwnD ? 1 : 0);
        if (c.rng.chance(aggr)) { c.cmds.push({ tick, kind: 'tackle', playerId: p.id, targetId: carrier.id }); lastTackleTick.set(p.id, tick); }
      }
    } else {
      moveToShape(c, p, false, ballXp, ballY);
    }
  }
}

function looseBall(c: Ctx, ballXp: Scalar, ballY: Scalar, inPossession: boolean): void {
  const { mine, ball, tick } = c;
  const outfield = mine.filter((p) => !p.isGoalkeeper);
  const chaser = nearestTo(outfield, ball);
  for (const p of outfield) {
    if (p.id === chaser?.id) {
      // meet the ball where it will be
      const t = clamp(dist(p.pos, ball) / 6, 0, 1.2);
      const meet = { x: ball.x + c.ballVel.x * t * 0.6, y: ball.y + c.ballVel.y * t * 0.6 };
      moveTo(c, p, meet, 1);
      const d = dist(p.pos, ball);
      if (d < 1.4 && c.ballSpeed > 3.5 && approaching(c, p)) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
      // collect: a slow ball within reach goes onto the stick (a controlled pick-up, not a stop)
      else if (d < 1.3 && c.ballSpeed <= 3.5 && c.view.ball.lastTouch !== p.id) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
    } else {
      moveToShape(c, p, inPossession, ballXp, ballY);
    }
  }
}

function goalkeeper(c: Ctx, gk: PlayerView, carrier: PlayerView | null): void {
  const { end, ball, tick } = c;
  const ownGoal = { x: -end * HALF_LENGTH, y: 0 };
  const dGoal = dist(ball, ownGoal);
  const a = c.attrsOf(gk.id);
  // Position on the ball–goal line, off the line by an amount that narrows the angle but keeps the near post covered.
  const off = clamp(1.2 + (dGoal - 6) * 0.12 * (0.7 + 0.6 * norm(a.goalkeeper.positioning)), 0.6, 5.5);
  const dx = ball.x - ownGoal.x, dy = ball.y - ownGoal.y;
  const dl = Math.sqrt(dx * dx + dy * dy) || 1;
  let target = { x: ownGoal.x + (dx / dl) * off, y: clamp(ownGoal.y + (dy / dl) * off, -GOAL_HALF_WIDTH - 0.5, GOAL_HALF_WIDTH + 0.5) };
  // ball far away: sweep up towards the top of the circle
  if (dGoal > 40) target = { x: -end * (HALF_LENGTH - 8), y: clamp(ball.y * 0.2, -4, 4) };
  moveTo(c, gk, target, 0.9);
  // Save: ball moving towards our goal and coming within reach → trap (pads/stick); then clear.
  const towardGoal = end * c.ballVel.x < -3;
  if (towardGoal && dist(gk.pos, ball) < 2.6 && c.ballZ < 2.0) c.cmds.push({ tick, kind: 'trap', playerId: gk.id });
  // Clearance when the ball is at the keeper's feet and slow: hit it wide, away from the middle
  if (dist(gk.pos, ball) < 1.3 && c.ballSpeed < 3 && (carrier === null || carrier.id === gk.id) && c.view.ball.lastTouch === gk.id) {
    const side = ball.y >= 0 ? 1 : -1;
    const angle = dmath.atan2(side * 20 - ball.y, end * (-HALF_LENGTH + 30) - ball.x);
    c.cmds.push({ tick, kind: 'strike', playerId: gk.id, strike: 'hit', angle, power: 0.8 });
  }
}

// ── penalty corners ────────────────────────────────────────────────────────────

function pcAttack(c: Ctx, pending: boolean): void {
  const { end, mine, ball, tick, rules } = c;
  const gx = end * HALF_LENGTH;
  const outfield = mine.filter((p) => !p.isGoalkeeper);
  // Fallback once the ball is live: if the ball is slow and the nearest attacker has it, play normally (shoot/pass) —
  // the scripted battery only covers the designed sequence; rebounds and scrambles are open play.
  if (!pending) {
    const carrier = findCarrier(c);
    // The designed sequence has priority: while the trapper has just stopped the ball at the top and the striker is
    // arriving, do NOT let open-play logic take over. Otherwise (rebounds, scrambles) play normally.
    const scriptedMoment = carrier !== null && carrier.id === c.pcRoles.trapper && (c.pcRoles.strikerArrivingUntil ?? 0) >= tick;
    if (carrier?.team === c.team.team && !scriptedMoment) {
      issue(c, carrier, bestOption(c, carrier, false));
      for (const p of outfield) if (p.id !== carrier.id) supportRun(c, p, carrier, end * ball.x + HALF_LENGTH, end * ball.y);
      return;
    }
    if (c.ballSpeed < 2 && !carrier) {
      const chaser = nearestTo(outfield, ball);
      if (chaser) moveTo(c, chaser, ball, 1);
    }
  }
  // Roles are assigned ONCE per PC (keyed by the award's restart readyTick) — the injector stays the injector after
  // the ball has left them, the trapper stays the trapper.
  const topX = end * (CIRCLE_TOP_X - 0.6);
  const key = rules.pcTakenTick ?? (rules.restart?.readyTick ?? -2) * -1 - 1000; // pending: negative key from readyTick; taken: playing tick
  const injSideNow = ball.y >= 0 ? 1 : -1;
  if (!pending && c.pcRoles.key !== key && c.pcRoles.injector !== null) c.pcRoles.key = key; // injection happened: keep the roles
  if (c.pcRoles.key !== key && pending) {
    const inj = nearestTo(outfield, ball);
    const trapSpot0 = { x: topX, y: injSideNow * 1.5 };
    const rest = outfield.filter((p) => p.id !== inj?.id);
    const striker = [...rest].sort((a, b) => norm(c.attrsOf(b.id).technical.dragFlick) - norm(c.attrsOf(a.id).technical.dragFlick) || a.id - b.id)[0];
    const trapper = nearestTo(rest.filter((p) => p.id !== striker?.id), trapSpot0);
    c.pcRoles.key = key; c.pcRoles.injector = inj?.id ?? null; c.pcRoles.trapper = trapper?.id ?? null; c.pcRoles.striker = striker?.id ?? null;
    c.pcRoles.injSide = injSideNow;
  }
  const injSide = c.pcRoles.injSide ?? injSideNow;
  const trapSpot = { x: topX, y: injSide * 1.5 };
  const strikeSpot = { x: topX - end * 1.2, y: injSide * 0.2 };
  const injector = outfield.find((p) => p.id === c.pcRoles.injector);
  const trapper = outfield.find((p) => p.id === c.pcRoles.trapper);
  const bestFlicker = outfield.find((p) => p.id === c.pcRoles.striker);
  const others = outfield.filter((p) => p.id !== injector?.id).sort((a, b) => a.id - b.id);
  const variant = c.team.tactics.pcVariant;
  // the battery is "set" when trapper and striker are on their marks (or we've waited 4 s — don't stall)
  const strikerSpot = (variant === 'slipRight' || variant === 'slipLeft') ? { x: topX - end * 1.5, y: (variant === 'slipRight' ? -injSide : injSide) * 3.5 } : strikeSpot;
  const batterySet = (!!trapper && dist(trapper.pos, trapSpot) < 1.6) && (!!bestFlicker && dist(bestFlicker.pos, strikerSpot) < 1.8);
  const waitedLong = rules.restart !== null && tick - rules.restart.readyTick > 160; // 8 s: clock is stopped, nothing lost
  for (const p of outfield) {
    if (p.id === injector?.id) {
      moveTo(c, p, { x: gx - end * 0.4, y: ball.y + injSide * 0.5 }, 0.8);
      if (pending && rules.restart && tick >= rules.restart.readyTick && dist(p.pos, ball) < 1.3 && trapper && (batterySet || waitedLong)) {
        // injection: firm push to the trapper, arriving at a stoppable ~8 m/s
        const angle = dmath.atan2(trapSpot.y - ball.y, trapSpot.x - ball.x);
        const need = passSpeedFor(dist(ball, trapSpot), 8, c.profile, c.surface);
        const maxV = c.profile.strike.pushSpeed * strikeSpeedFactor(c.attrsOf(p.id), 'push');
        c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'push', angle, power: clamp(need / maxV, 0.5, 1) });
      } else if (!pending) {
        // after injecting: run to the near post for rebounds
        moveTo(c, p, { x: gx - end * 3, y: injSide * 3 }, 0.9);
      }
    } else if (p.id === trapper?.id) {
      // on the mark; once the ball is coming, slide across to its line
      let spot = trapSpot;
      if (!pending && c.ballSpeed > 2 && approaching(c, p)) {
        const t = (trapSpot.x - ball.x) / (c.ballVel.x || 1e-6);
        if (t > 0) spot = { x: trapSpot.x, y: ball.y + c.ballVel.y * t };
      }
      moveTo(c, p, spot, 1);
      if (!pending && dist(p.pos, ball) < 1.6 && c.ballSpeed > 1 && approaching(c, p)) { c.cmds.push({ tick, kind: 'trap', playerId: p.id }); c.pcRoles.strikerArrivingUntil = tick + 25; }
      // having stopped it: stand still and leave it for the striker (a slip variant plays it sideways instead)
      if (!pending && c.ballSpeed < 3 && c.view.ball.lastTouch === p.id && !(variant === 'slipRight' || variant === 'slipLeft')) { c.cmds.push({ tick, kind: 'move', playerId: p.id, dx: 0, dy: 0, effort: 0 }); }
      // slip variants: trapper plays it to the side for a hitter
      if (!pending && dist(p.pos, ball) < 1.3 && c.ballSpeed < 3 && c.view.ball.lastTouch === p.id && (variant === 'slipRight' || variant === 'slipLeft')) {
        const side = variant === 'slipRight' ? -injSide : injSide;
        c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'push', angle: dmath.atan2(side * 3, -end * 0.5), power: 0.5 });
      }
    } else if (p.id === bestFlicker?.id) {
      const trapped = !pending && c.ballSpeed < 3 && c.view.ball.lastTouch === trapper?.id;
      moveTo(c, p, trapped ? ball : strikerSpot, 1);
      // strike when the ball is stopped at the top of the D
      if (!pending && dist(p.pos, ball) < 1.4 && c.ballSpeed < 4 && c.view.ball.lastTouch !== p.id) {
        const keeperY = c.keeperOpp?.pos.y ?? 0;
        const side = keeperY > 0 ? -1 : 1;
        const targetY = side * (GOAL_HALF_WIDTH - 0.45);
        const angle = dmath.atan2(targetY - ball.y, gx - ball.x);
        const strike = variant === 'lowHit' ? 'hit' : variant === 'deflection' ? 'push' : 'flick';
        c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike, angle, power: 1 });
      }
    } else {
      // runners/rebounders: post positions and the top of the D
      const i = others.indexOf(p);
      const spots = [{ x: gx - end * 4, y: -injSide * 3.5 }, { x: gx - end * 7, y: injSide * 6 }, { x: topX - end * 3, y: -injSide * 5 }, { x: topX - end * 4, y: injSide * 8 }];
      moveTo(c, p, spots[i % spots.length] ?? strikeSpot, 0.85);
    }
  }
}

function pcDefend(c: Ctx, pending: boolean): void {
  const { end, mine, ball, tick } = c;
  const gx = -end * HALF_LENGTH; // our goal
  const outfield = mine.filter((p) => !p.isGoalkeeper);
  const behind = outfield.filter((p) => Math.abs(p.pos.x - gx) < 2).sort((a, b) => a.id - b.id);
  const rest = outfield.filter((p) => !behind.includes(p));
  const injSide = ball.y >= 0 ? 1 : -1;
  behind.forEach((p, i) => {
    if (pending) return; // wait for the injection
    // first runner charges the top of the D; postmen hold the posts; one covers the injector's side
    if (i === 0) moveTo(c, p, { x: -end * (CIRCLE_TOP_X - 1), y: 0 }, 1);
    else if (i === 1) moveTo(c, p, { x: gx + end * 0.5, y: -injSide * 1.4 }, 1);
    else if (i === 2) moveTo(c, p, { x: gx + end * 0.5, y: injSide * 1.4 }, 1);
    else moveTo(c, p, { x: gx + end * 5, y: injSide * 5 }, 1);
    // tackle the striker if we get there
    if (i === 0 && dist(p.pos, ball) < 1.7 && c.view.ball.lastTouch !== null) {
      const carrier = c.view.playerById(c.view.ball.lastTouch);
      if (carrier && carrier.team !== c.team.team) c.cmds.push({ tick, kind: 'tackle', playerId: p.id, targetId: carrier.id });
    }
    if (dist(p.pos, ball) < 1.4 && c.ballSpeed > 3 && approaching(c, p)) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
  });
  for (const p of rest) moveTo(c, p, { x: -end * 5, y: p.pos.y }, 0.5);
  // fallback: a loose ball in our circle after the injection → nearest defender clears it
  if (!pending) {
    const carrier = findCarrier(c);
    if (carrier?.team === c.team.team) { issue(c, carrier, bestOption(c, carrier, false)); }
    else if (!carrier && c.ballSpeed < 3) { const ch = nearestTo(outfield, ball); if (ch) moveTo(c, ch, ball, 1); }
    else if (carrier) { const ch = nearestTo(outfield, ball); if (ch && dist(ch.pos, ball) < 1.7 && c.rng.chance(0.4)) c.cmds.push({ tick, kind: 'tackle', playerId: ch.id, targetId: carrier.id }); }
  }
  if (c.keeperMine) goalkeeper(c, c.keeperMine, null);
}

// ── substitutions ──────────────────────────────────────────────────────────────

function substitutions(c: Ctx, leaving: Map<number, number>): void {
  const { tick, team, mine, view } = c;
  const bench = view.players.filter((p) => p.team === team.team && !p.onPitch && !isLeavingTarget(leaving, p.id));
  // Players already jogging off: keep going; swap when at the dugout entry
  for (const [outId, inId] of [...leaving.entries()]) {
    const p = view.playerById(outId);
    if (!p?.onPitch) { leaving.delete(outId); continue; }
    const entry = { x: 0, y: (team.team === 0 ? -1 : 1) * (HALF_WIDTH - 0.5) };
    if (p.team !== team.team) continue;
    moveTo(c, p, entry, 0.75);
    if (dist(p.pos, entry) < 3) { c.cmds.push({ tick, kind: 'substitute', team: team.team, outId, inId }); }
  }
  if (tick % 100 !== team.team * 50) return;
  // Rotation policy: stamina isn't in the view yet (Phase 7 exposes it); use minutes played as a proxy:
  // every ~9 min of playing time rotate the most-run outfield players in the FWD/MID lines.
  const outfield = mine.filter((p) => !p.isGoalkeeper && !leaving.has(p.id));
  if (bench.length === 0 || outfield.length === 0) return;
  const q = c.rules.matchClockTicks;
  if (q > 0 && q % (9 * 60 * 20) < 100) {
    const candidates = outfield.filter((p) => { const s = c.slotOf(p.id); return s.role === 'FWD' || s.role === 'MID'; });
    const out = candidates[c.rng.int(Math.max(1, candidates.length))];
    const inn = bench.find((b) => c.slotOf(b.id).role === (out ? c.slotOf(out.id).role : 'MID')) ?? bench[0];
    if (out && inn) leaving.set(out.id, inn.id);
  }
}
const isLeavingTarget = (leaving: Map<number, number>, id: number): boolean => [...leaving.values()].includes(id);

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Who has the ball? The last toucher if it is still at their stick (dribbling speed), else the nearest player
 * if the ball is slow enough to be "at the feet" — a ball rolling past at 6 m/s belongs to nobody yet.
 */
function findCarrier(c: Ctx): PlayerView | null {
  const { view, ball, onPitch } = c;
  if (c.ballZ > 0.5) return null;
  const lt = view.ball.lastTouch;
  const last = lt === null ? undefined : view.playerById(lt);
  if (last?.onPitch && dist(last.pos, ball) < 1.6 && c.ballSpeed < 6) return last;
  if (c.ballSpeed > 3) return null;
  const n = nearestTo(onPitch, ball);
  return n && dist(n.pos, ball) < 1.2 ? n : null;
}

function moveTo(c: Ctx, p: PlayerView, target: Vec2, effort: Scalar): void {
  const dx = target.x - p.pos.x, dy = target.y - p.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  // brake before the target: stopping distance at current speed (decel ≈ 7 m/s²) plus a stride
  const v = Math.sqrt(p.vel.x ** 2 + p.vel.y ** 2);
  const brake = (v * v) / 14 + 0.6;
  const e = d < 0.6 ? 0 : d < brake ? Math.min(effort, 0.25) : d < 3 ? effort * 0.6 : effort;
  c.cmds.push({ tick: c.tick, kind: 'move', playerId: p.id, dx, dy, effort: e });
}

const dist = (a: Vec2, b: Vec2): Scalar => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
/** Is the ball moving towards this player (so a trap is a reception, not killing your own pass)? */
function approaching(c: Ctx, p: PlayerView): boolean {
  const dx = p.pos.x - c.ball.x, dy = p.pos.y - c.ball.y;
  return c.ballVel.x * dx + c.ballVel.y * dy > 0 && c.view.ball.lastTouch !== p.id;
}
function nearestTo(ps: readonly PlayerView[], to: Vec2): PlayerView | undefined {
  let best: PlayerView | undefined; let bd = Infinity;
  for (const p of ps) { const d = dist(p.pos, to); if (d < bd) { bd = d; best = p; } }
  return best;
}
function nearestDist(ps: readonly PlayerView[], to: Vec2): Scalar {
  let bd = Infinity;
  for (const p of ps) { const d = dist(p.pos, to); if (d < bd) bd = d; }
  return bd;
}
/** Nearest opponent within a cone ahead of `from` along `dir`, up to `range`. */
function nearestDistAhead(ps: readonly PlayerView[], from: Vec2, dir: Vec2, range: Scalar): Scalar {
  let bd = range;
  for (const p of ps) {
    const dx = p.pos.x - from.x, dy = p.pos.y - from.y;
    const along = dx * dir.x + dy * dir.y;
    if (along < 0 || along > range) continue;
    const perp = Math.abs(dx * dir.y - dy * dir.x);
    if (perp < 1.6 && along < bd) bd = along;
  }
  return bd;
}
/** 0..1 how pressed a point is (opponents within `r`). */
function pressureAt(ps: readonly PlayerView[], at: Vec2, r: Scalar): Scalar {
  let s = 0;
  for (const p of ps) { const d = dist(p.pos, at); if (d < r) s += 1 - d / r; }
  return clamp(s, 0, 1);
}
/** 0..1 interception risk of a ground pass from a to b (opponents near the lane, ahead of the ball). */
function laneRisk(ps: readonly PlayerView[], a: Vec2, b: Vec2): Scalar {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / L, uy = dy / L;
  let risk = 0;
  for (const p of ps) {
    const px = p.pos.x - a.x, py = p.pos.y - a.y;
    const along = px * ux + py * uy;
    if (along < 0.5 || along > L + 1) continue;
    const perp = Math.abs(px * uy - py * ux);
    // reach ≈ 1.6 m stick + a stride; risk falls off over ~2.5 m
    risk = Math.max(risk, clamp(1 - (perp - 1.2) / 2.5, 0, 1));
  }
  return risk;
}
