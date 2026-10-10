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
import type { Command, Posture } from '../match/commands.js';
import type { Controller, PlayerSetup } from '../match/match.js';
import { attributesFor, norm, paceFactor, type Attributes, type Role } from '../player/attributes.js';
import { carrySideFactor, lateralOf, lateralOfDir, receiveSideFactor, strikeSideSpeed } from '../player/handedness.js';
import { jockeySpot, pressLineM, backLineM, entryPocket, DEFAULT_TACTICS, ENTRY_PATTERNS, FORMATION_433, FORMATIONS, PC_DEFENCES, PRESS_SYSTEMS, assignSlots, channelOf, lineOf, presetPatch, shapeTarget, slotToPitch, type EntryPatternId, type EntryTrigger, type PcDefenceSystem, type Pocket, type PressSystem, type Slot, type TeamTactics } from './tactics.js';
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

interface PcRoles {
  key: number; injector: number | null; trapper: number | null; striker: number | null; injSide?: number; strikerArrivingUntil?: number;
  /** the runners in pocket order: far post / deflector, rebounder, trailer, wide */
  runners?: number[];
  /** the defending castle, fixed per corner like the battery (§5) */
  defKey: number; flyer: number | null; second: number | null; postNear: number | null; postFar: number | null; defInjSide?: number;
}

interface Ctx {
  view: RulesView; rules: Readonly<RulesState>; tick: number; rng: Rng; pcRoles: PcRoles; attack: AttackState;
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

/**
 * Coach instructions (Phase 7): tick-stamped, serialisable, applied by the AI controller of the
 * instructed team at that tick. They are the *only* way a coach influences a match; the same list
 * with the same setup and seed reproduces the same log.
 */
export type CoachInstruction =
  /** Change tactical knobs (press, line, tempo, build-up, PC variant/battery, rotation threshold). */
  | { tick: number; team: TeamId; kind: 'tactics'; patch: Partial<TeamTactics> }
  /** Rolling substitution: `outId` jogs to the dugout and `inId` comes on there. Ignored if either is not eligible. */
  | { tick: number; team: TeamId; kind: 'substitute'; outId: number; inId: number }
  /** Swap the formation slots of two players (e.g. move a midfielder up front). */
  | { tick: number; team: TeamId; kind: 'swapSlots'; a: number; b: number };

export interface AiHandle {
  controller: Controller;
  /** Queue instructions; each is applied at its tick (instructions stamped in the past apply next tick). */
  instruct(ins: readonly CoachInstruction[]): void;
  /** Current tactics per team (read-only snapshot for UIs). */
  tactics(team: TeamId): Readonly<TeamTactics>;
  /** Formation slot per player id (read-only snapshot for UIs). */
  slotOf(id: number): Slot;
}

export function aiController(seed: number, squads: [AiTeam, AiTeam], opts: AiOptions = {}): Controller {
  return createAi(seed, squads, opts).controller;
}

export function createAi(seed: number, squads: [AiTeam, AiTeam], opts: AiOptions = {}): AiHandle {
  const rng = new Rng(seed, 11);
  const queue: CoachInstruction[] = [];
  const profile = opts.profile ?? MENS;
  const surface = opts.surface ?? 'watered';
  const attrsMap = new Map<number, Attributes>();
  const slotMap = new Map<number, Slot>();
  const roleMap = new Map<number, Role>();
  for (const t of squads) for (const p of t.players) {
    attrsMap.set(p.id, p.attrs); roleMap.set(p.id, p.role);
    slotMap.set(p.id, FORMATIONS[t.tactics.formation][p.slot] ?? FORMATION_433[p.slot] ?? { role: p.role, xp: 30, y: 0 });
  }
  /** Re-assign a team's slots to a formation from the players currently on the pitch (bench keeps covering by role). */
  const reshape = (team: AiTeam, view: RulesView): void => {
    const on = view.players.filter((p) => p.team === team.team && p.onPitch).map((p) => ({ id: p.id, role: roleMap.get(p.id) ?? 'MID', isGoalkeeper: p.isGoalkeeper }));
    const idx = assignSlots(team.tactics.formation, on);
    const slots = FORMATIONS[team.tactics.formation];
    for (const [id, i] of idx) { const s = slots[i]; if (s) slotMap.set(id, s); }
    for (const p of team.players) if (!idx.has(p.id)) { const role = roleMap.get(p.id) ?? 'MID'; slotMap.set(p.id, slots.find((s) => s.role === role) ?? slots[1] ?? { role, xp: 30, y: 0 }); }
  };
  const leaving = new Map<number, number>(); // outId → inId, players jogging to the dugout
  const lastTackleTick = new Map<number, number>();
  // sticky marking state, one per team (marks are handed over on a switch, not on a wobble)
  const defence: [DefenceState, DefenceState] = [newDefenceState(), newDefenceState()];
  // the attack's intention, one per team: the entry pattern it has committed to and who is running it
  const attack: [AttackState, AttackState] = [newAttackState(), newAttackState()];
  const pcRoles: PcRoles = { key: -1, injector: null, trapper: null, striker: null, defKey: -1, flyer: null, second: null, postNear: null, postFar: null };

  const apply = (view: RulesView, tick: number): void => {
    if (queue.length === 0) return;
    const due = queue.filter((i) => i.tick <= tick).sort((a, b) => a.tick - b.tick || a.team - b.team);
    if (due.length === 0) return;
    for (const i of due) queue.splice(queue.indexOf(i), 1);
    for (const i of due) {
      const team = squads[i.team];
      switch (i.kind) {
        case 'tactics': {
          const before = team.tactics.formation;
          Object.assign(team.tactics, presetPatch(i.patch));
          if (team.tactics.formation !== before) reshape(team, view);
          break;
        }
        case 'substitute': {
          const out = view.playerById(i.outId), inn = view.playerById(i.inId);
          if (out?.onPitch && inn && !inn.onPitch && out.team === i.team && inn.team === i.team && !leaving.has(i.outId) && !isLeavingTarget(leaving, i.inId)) leaving.set(i.outId, i.inId);
          break;
        }
        case 'swapSlots': {
          const sa = slotMap.get(i.a), sb = slotMap.get(i.b);
          if (sa && sb) { slotMap.set(i.a, sb); slotMap.set(i.b, sa); }
          break;
        }
      }
    }
  };
  const controller = (view: RulesView, rules: Readonly<RulesState>, tick: number): Command[] => {
    const cmds: Command[] = [];
    apply(view, tick);
    if (rules.phase !== 'inPlay') return cmds;
    const b = view.ball;
    const ball = { x: b.pos.x, y: b.pos.y };
    const ballVel = { x: b.vel.x, y: b.vel.y };
    const ballSpeed = Math.sqrt(ballVel.x ** 2 + ballVel.y ** 2);

    for (const squad of squads) {
      // Chasing the game: no coach leaves the sheet alone at 0–2 in the fourth quarter. A team a goal
      // or more down late throws men forward and presses higher; a team two up shuts the game out.
      // (Also what keeps scorelines honest: without it the sim's histogram grew fat tails of 0-x and
      // x-6 blowouts that real leagues do not show — the trailing side never pushed back.)
      const margin = rules.score[squad.team] - rules.score[squad.team === 0 ? 1 : 0];
      const chasing = (rules.quarter === 4 && margin < 0) || (rules.quarter === 3 && margin <= -2);
      const protecting = rules.quarter === 4 && margin >= 2;
      const team = chasing
        ? { ...squad, tactics: { ...squad.tactics, mentality: 'attacking' as const, pressHeight: Math.min(1, squad.tactics.pressHeight + 0.25) } }
        : protecting
          ? { ...squad, tactics: { ...squad.tactics, mentality: 'defensive' as const } }
          : squad;
      const end = attackingEnd(team.team);
      const onPitch = view.players.filter((p) => p.onPitch);
      const mine = onPitch.filter((p) => p.team === team.team);
      const opp = onPitch.filter((p) => p.team !== team.team);
      const ctx: Ctx = {
        view, rules, tick, rng, pcRoles, attack: attack[team.team], team, end, opp, mine, onPitch, ball, ballZ: b.pos.z, ballSpeed, ballVel,
        keeperOpp: opp.find((p) => p.isGoalkeeper), keeperMine: mine.find((p) => p.isGoalkeeper),
        attrsOf: (id) => attrsMap.get(id) ?? attributesFor(roleMap.get(id) ?? 'MID'),
        slotOf: (id) => slotMap.get(id) ?? { role: 'MID', xp: 30, y: 0 },
        cmds, profile, surface,
      };
      teamTick(ctx, leaving, lastTackleTick, defence[team.team]);
    }
    return cmds;
  };
  return {
    controller,
    instruct: (ins) => { queue.push(...ins); },
    tactics: (team) => squads[team].tactics,
    slotOf: (id) => slotMap.get(id) ?? { role: 'MID', xp: 30, y: 0 },
  };
}

// ── team-level ─────────────────────────────────────────────────────────────────

function teamTick(c: Ctx, leaving: Map<number, number>, lastTackleTick: Map<number, number>, defence: DefenceState): void {
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
          // 0.9 m inside the post, not 0.75: at 0.75 the error spread clipped the post or slid wide
          // ~20 % of the time and stroke conversion sat at 0.48 (real strokes convert ~0.75 — the
          // taker's job is placing it where the keeper's guess cannot reach, not painting the post)
          const aim = dmath.atan2(corner * (GOAL_HALF_WIDTH - 0.9) - ball.y, gx - ball.x);
          c.cmds.push({ tick, kind: 'strike', playerId: nearestMine.id, strike: 'flick', angle: aim, power: 0.9 });
        }
      }
    }
    // everyone else holds; keeper reacts in the GK model
    if (c.keeperMine && !restartMine) goalkeeper(c, c.keeperMine, null);
    return;
  }

  // ── restarts (free hits, side-ins, long corners, hit-outs, centre pass) ────
  // A centre pass is not an ordinary restart: after a goal (and at a quarter) BOTH teams take up
  // their kickoff shape in their own half first — nobody stands where the last attack left him, and
  // nobody creeps over the line before the whistle. The clock is stopped, so this walk costs no
  // playing time; it is what Jan saw missing ("play resumed with half the team still upfield").
  if (restart?.kind === 'centrePass') {
    for (const p of mine) {
      if (p.isGoalkeeper) continue;
      if (restartMine && p.id === nearestMine?.id) continue; // the taker walks to the ball below
      const slot = c.slotOf(p.id);
      // slot.xp is metres from our own backline; clamp to our own half (the law) with a stride spare
      moveTo(c, p, slotToPitch({ xp: Math.min(slot.xp, HALF_LENGTH - 2), y: slot.y }, end), 0.8);
    }
    if (c.keeperMine) goalkeeper(c, c.keeperMine, null);
    if (restartMine && nearestMine) {
      const taker = nearestMine;
      c.cmds.push({ tick, kind: 'move', playerId: taker.id, dx: ball.x - taker.pos.x, dy: ball.y - taker.pos.y, effort: 0.8 });
      if (tick >= restart.readyTick && dist(taker.pos, ball) < 1.3) issue(c, taker, bestOption(c, taker, true));
    }
    return;
  }
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
    trackPossession(c, carrier);
    entryPattern(c, carrier, ballXp, ballY);
    // carrier decides every tick
    const opt = bestOption(c, carrier, false);
    issue(c, carrier, opt);
    for (const p of mine) if (p.id !== carrier.id && !p.isGoalkeeper) supportRun(c, p, carrier, ballXp, ballY);
  } else if (carrier && carrier.team !== team.team) {
    // defending: nearest presses/tackles, second closes, others mark by shape
    defend(c, carrier, ballXp, ballY, lastTackleTick, defence);
  } else {
    // loose ball: nearest chases; if the ball is coming, trap it. Off the ball we still hold the system.
    looseBall(c, ballXp, ballY, inPossession, lastTackleTick, defence);
  }
  if (c.keeperMine) goalkeeper(c, c.keeperMine, carrier);

  // ── rolling substitutions: tired players jog off at the dugout ─────────────
  substitutions(c, leaving);
}

// ── carrier decisions ──────────────────────────────────────────────────────────

type Option =
  | { kind: 'shoot'; angle: Scalar; strike: 'hit' | 'flick' | 'push'; power: Scalar; u: Scalar }
  | { kind: 'pass'; to: PlayerView; at?: Vec2; angle: Scalar; strike: 'push' | 'slap' | 'hit' | 'aerial'; power: Scalar; u: Scalar }
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
    // 0.35 inside the post: shooters go for the corner the keeper cannot reach and pay for it in
    // wide misses — at 0.5 the sim's on-target share sat at 0.62 where real hockey lives near 0.45
    const targetY = side * (GOAL_HALF_WIDTH - 0.35);
    const angle = dmath.atan2(targetY - ball.y, gx - ball.x);
    const flickPref = norm(a.technical.dragFlick) - norm(a.technical.hit);
    const strike = dGoal < 7 ? 'push' : flickPref > 0.1 && dGoal < 12 ? 'flick' : 'hit';
    // Shoot when the chance is decent; from a poor angle prefer to work the ball (carry/pass) unless pressed.
    // Hockey reason: a shot from the edge of the D at 30° is a turnover; the spot strip is where goals come from.
    // 0.04: measured at 0.0 and 0.02 the men's goals fell out of the (measured) band while the shots
    // count barely moved — the estimated shots band is not worth a measured-goals miss.
    // A shot swung out to the reverse is weaker and wider (§6.5): with time, a forward takes the
    // extra step to get it onto his forehand rather than shooting off the wrong stick side.
    // 0.2, not more: inside the D a forward shoots off whatever side the ball is on — the chance is
    // worth more than the stick face. Outside it he would take the extra touch; that is the carry.
    const shotSide = 0.2 * (1 - strikeSideSpeed(a, strike, lateralOf(me.heading, me.pos, ball)));
    const u = 0.04 + 1.4 * q + 0.25 * pressure * norm(a.mental.composure) - 0.15 * (1 - team.tactics.tempo) - shotSide + c.rng.gaussian(0, noise);
    options.push({ kind: 'shoot', angle, strike, power: strike === 'push' ? 0.9 : 1, u });
    // "Win the corner": a defender's feet inside the D are a target. A firm push/hit at a defender standing between
    // ball and goal is how most club-level PCs are won (FIH 13.3: feet in the circle → PC). Umpires give it; attackers know.
    const gvx = gx - ball.x, gvy = -ball.y; const gl = Math.sqrt(gvx * gvx + gvy * gvy) || 1;
    let feetTarget: PlayerView | null = null, feetD = 4.5;
    for (const o of opp) {
      if (o.isGoalkeeper) continue;
      const dx = o.pos.x - ball.x, dy = o.pos.y - ball.y;
      const along = (dx * gvx + dy * gvy) / gl; const perp = Math.abs(dx * gvy - dy * gvx) / gl;
      // any defender within 4 m in front of the ball and within a stride of the shooting line is a feet target
      if (along > 0.5 && along < feetD && perp < 1.8) { feetD = along; feetTarget = o; }
    }
    if (feetTarget) {
      const ang = dmath.atan2(feetTarget.pos.y - ball.y, feetTarget.pos.x - ball.x);
      // worth a lot when the clean shot is poor; a little composure noise so it is not automatic
      const uFeet = 0.95 - 0.55 * q + 0.1 * norm(a.mental.decisions) + c.rng.gaussian(0, noise);
      // 0.9, not 0.8: at 0.8 a weaker striker's ball arrived under the no-reaction-time threshold and
      // the defender calmly played it off the stick — the whole point of the ball is that he cannot
      options.push({ kind: 'shoot', angle: ang, strike: 'push', power: 0.9, u: uFeet });
    }
  }

  // Up-back-through (§7): a pressed man who has JUST received lays it back first time to the free
  // man behind him — and the free man plays through the line the press has just vacated. The
  // first is a one-touch window (0.6 s) under pressure; the second is a short window after a
  // lay-back in which a ball past where the pressed man stood is worth more than it looks.
  const st = c.attack;
  const oneTouch = c.tick - st.receivedAt < 12 && pressure > 0.45;
  const afterLayBack = st.layBackFrom !== null && c.tick - st.layBackAt < 30 ? st.layBackFrom : null;
  const ment = team.tactics.mentality === 'attacking' ? 0.12 : team.tactics.mentality === 'defensive' ? -0.08 : 0;

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
    // A pass INTO the circle is the most valuable object on the pitch (valueGrid): weight it like one.
    // 0.75: measured with 0.45 and 0.6 the safe recycle around the top of the D (u ≈ 0.4) still beat
    // the entry ball every time — 80 possessions a match died in the attacking quarter on 15 entries.
    // The entry pass has to WIN that comparison or the attack circulates forever.
    const intoD = laneEntersCircle(ball, lead, end) ? 0.9 + ment : (in23(lead, end) && !in23(ball, end) ? 0.2 + ment * 0.5 : 0);
    const isBack = end * (lead.x - ball.x) < -3;
    const layBack = oneTouch && isBack && open > 0.5 ? 0.35 : 0;
    // backwards passes are fine when pressed, poor otherwise
    const backwards = layBack > 0 ? 0 : end * (lead.x - ball.x) < -5 ? (pressure > 0.5 ? 0 : 0.12) : 0;
    const through = afterLayBack !== null && end * (lead.x - afterLayBack.x) > 4 ? 0.25 : 0;
    const vision = 0.15 * norm(a.mental.vision);
    // The receiving side (§6.3): the same pass is worth less arriving on a man's reverse, and a
    // passer with vision sees which shoulder he is putting it on.
    // …but not into the circle: an entry ball is worth taking on the reverse, and a hockey team that
    // only ever plays the comfortable one never enters the D at all.
    const arriveSide = (laneEntersCircle(ball, lead, end) ? 0.15 : 0.5)
      * (1 - receiveSideFactor(c.attrsOf(mate.id), lateralOf(mate.heading, lead, ball)));
    // never play a teammate the ball inside our own circle (the keeper aside as a last resort under real pressure)
    const intoOwnD = inCircle(lead, -end as End) ? (pressure > 0.7 ? 0.25 : 0.6) : 0;
    // Inside the attacking D a "risky" lane past a defender is a chance to hit a foot and win a PC — attackers take it.
    // The entry pass itself is also played tighter than a midfield ball: a lane into the D that might be cut
    // is still worth the attempt, because the alternative is recycling around the top forever.
    const riskW = inD ? 0.6 : laneEntersCircle(ball, lead, end) ? 0.8 : 1.4;
    let u = 0.15 + 1.2 * gain + 0.35 * open - riskW * risk - lengthPen + intoD - backwards + layBack + through + vision - intoOwnD - arriveSide + c.rng.gaussian(0, noise);
    if (restart) u += 0.2; // restarts want to be taken
    const angle = dmath.atan2(lead.y - ball.y, lead.x - ball.x);
    // Arrive firmly: on water a push is played to reach the receiver at 6.5–10 m/s (quicker when the receiver is
    // pressed and needs it early). Trapping costs nothing up to 8 m/s in the model and little at 10; the 5.5–8.5 m/s
    // of the first build read as training-ground rolls and made the game feel pedestrian (Jan, Phase 10.1).
    // Measured in tempo.test.ts: +0.9 m/s on the launch speed, more circle entries and shots, goals still in band.
    const vArr = 6.5 + 3.5 * (1 - open);
    const need = passSpeedFor(d, vArr, c.profile, c.surface);
    let strike: 'push' | 'slap' | 'hit' | 'aerial' = need <= c.profile.strike.pushSpeed * strikeSpeedFactor(a, 'push') ? 'push' : need <= c.profile.strike.slapSpeed * strikeSpeedFactor(a, 'slap') ? 'slap' : 'hit';
    // long ball over a press: aerial when the lane is blocked but the target is free
    if (d > 22 && risk > 0.5 && open > 0.6 && norm(a.technical.skills3d) > 0.4 && !restart) { strike = 'aerial'; u += 0.15; }
    const maxV = (strike === 'push' ? c.profile.strike.pushSpeed : strike === 'slap' ? c.profile.strike.slapSpeed : strike === 'hit' ? c.profile.strike.hitSpeed : c.profile.strike.aerialSpeed) * strikeSpeedFactor(a, strike);
    const power = strike === 'aerial' ? clamp(0.5 + d / 60, 0.5, 1) : clamp(need / maxV, 0.25, 1);
    options.push({ kind: 'pass', to: mate, angle, strike, power, u });
  }

  // Passing into space (§7): not to a teammate's feet but to a POINT ahead of a runner — the pattern's
  // pocket, or wherever a man already sprinting forward will be — scored by a pursuit test: can he
  // reach it before the nearest defender, given both their pace and when the ball gets there. This
  // is the difference between passing to feet and playing someone in.
  const targets: { mate: PlayerView; at: Vec2; bonus: Scalar }[] = [];
  if (st.pattern !== null && st.runner !== null && ENTRY_PATTERNS[st.pattern].passToPocket) {
    const mate = mine.find((m) => m.id === st.runner);
    if (mate && mate.id !== me.id) targets.push({ mate, at: pocketPitch(c, ENTRY_PATTERNS[st.pattern].pocket, end * ball.y), bonus: 0.2 });
  }
  for (const mate of mine) {
    if (mate.id === me.id || mate.isGoalkeeper || targets.some((t) => t.mate.id === mate.id)) continue;
    const sp = Math.sqrt(mate.vel.x ** 2 + mate.vel.y ** 2);
    if (sp < 2.5 || end * mate.vel.x < 1) continue; // only a man already running forward
    const lead = Math.min(10, sp * 1.4);
    targets.push({ mate, at: { x: mate.pos.x + (mate.vel.x / sp) * lead, y: mate.pos.y + (mate.vel.y / sp) * lead }, bonus: 0.1 });
  }
  for (const tg of targets.slice(0, 4)) {
    const at = tg.at;
    if (Math.abs(at.x) > HALF_LENGTH - 0.5 || Math.abs(at.y) > HALF_WIDTH - 0.5) continue;
    const d = dist(ball, at);
    if (d < 4 || d > 40) continue;
    const vArr = 7.5;
    const need = passSpeedFor(d, vArr, c.profile, c.surface);
    const tBall = d / ((need + vArr) / 2);
    if (!pursuitWins(c, tg.mate, at, tBall)) continue;
    const gain = pitchValue(at, end) - here;
    const risk = laneRisk(opp, ball, at);
    const open = clamp((nearestDist(opp, at) - 1.5) / 4, 0, 1);
    const entersD = laneEntersCircle(ball, at, end);
    const intoD = entersD ? 0.9 + ment : (in23(at, end) && !in23(ball, end) ? 0.2 + ment * 0.5 : 0);
    // The pull-back (baseline pattern): from the deep-wide pocket back to the spot is a ball from
    // inside the D to inside the D, which the entry term cannot see — yet it is the largest goal
    // source in the modern game, because the shot it sets up has the angle the pocket never had.
    const pullBack = inD && inBaselinePocket(ball, end) && inCircle(at, end) && Math.abs(at.y) < 4 && end * (at.x - ball.x) < 0 ? 0.45 : 0;
    const through = afterLayBack !== null && end * (at.x - afterLayBack.x) > 4 ? 0.25 : 0;
    const riskW = inD ? 0.6 : entersD ? 0.8 : 1.4;
    let u = 0.15 + 1.2 * gain + 0.35 * open - riskW * risk + intoD + pullBack + through + tg.bonus + 0.15 * norm(a.mental.vision) + c.rng.gaussian(0, noise);
    if (restart) u += 0.2;
    const angle = dmath.atan2(at.y - ball.y, at.x - ball.x);
    const strike: 'push' | 'slap' | 'hit' = need <= c.profile.strike.pushSpeed * strikeSpeedFactor(a, 'push') ? 'push' : need <= c.profile.strike.slapSpeed * strikeSpeedFactor(a, 'slap') ? 'slap' : 'hit';
    const maxV = (strike === 'push' ? c.profile.strike.pushSpeed : strike === 'slap' ? c.profile.strike.slapSpeed : c.profile.strike.hitSpeed) * strikeSpeedFactor(a, strike);
    options.push({ kind: 'pass', to: tg.mate, at, angle, strike, power: clamp(need / maxV, 0.25, 1), u });
  }

  // carries: 8 directions, 5 m ahead
  if (!restart || rules.restart?.kind !== 'penaltyStroke') {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * dmath.TWO_PI;
      const dir = { x: dmath.cos(ang), y: dmath.sin(ang) };
      const to = { x: ball.x + dir.x * 5, y: ball.y + dir.y * 5 };
      if (Math.abs(to.x) > HALF_LENGTH - 0.5 || Math.abs(to.y) > HALF_WIDTH - 0.5) continue;
      const gain = pitchValue(to, end) - here;
      const ahead = nearestDistAhead(opp, ball, dir, 6);
      const space = clamp((ahead - 1) / 4, 0, 1);
      const elim = 0.15 * norm(a.technical.elimination);
      // Carrying and eliminating on the reverse is harder (§6.4) — so being shepherded onto it
      // costs the carrier in the value function, not only in the picture.
      const carrySide = 0.25 * (1 - carrySideFactor(a, lateralOfDir(me.heading, ang)));
      let u = 0.05 + 1.0 * gain + 0.7 * space - 0.5 * pressure * (1 - elim) - carrySide + c.rng.gaussian(0, noise * 0.5);
      // Dribbling straight into a defender's stick hands them the ball (the turnover of the amateur game):
      // only a real eliminator takes that on; everyone else looks sideways or passes.
      if (ahead < 2.6) u -= 0.55 * (1 - norm(a.technical.elimination) * 0.6);
      if (restart) u -= 0.1; // self-pass is fine, but a pass usually beats it
      // don't carry into your own circle; do carry into theirs — elimination into the D is how PCs are won
      if (inCircle(to, -end as End)) u -= 0.4;
      if (inCircle(to, end) && !inD) u += 0.6 + 0.2 * norm(a.technical.elimination);
      else if (in23(to, end) && !in23(ball, end)) u += 0.1;
      options.push({ kind: 'carry', dir, u });
    }
  }

  // clear: from own 23 m under pressure, hit long and wide. In our own CIRCLE the first job is
  // always the clearance — "get it out of the D" is coached before anything else, because every
  // second the ball lives there is a rebound, a foot, a corner. Measured without the D override:
  // defenders tried to play through the scramble and matches ran to 56 shots and 9 goals.
  const ownEnd = -end as End;
  const inOwnD = inCircle(ball, ownEnd);
  if (inOwnD || (in23(ball, ownEnd) && pressure > 0.4)) {
    // aimed at the touchline on purpose: a clearance that goes out for a side-in is a GOOD clearance
    // (the defence resets); one that lands centrally is the next attack. Under real pressure it goes
    // INTO touch deliberately — "into the stands" is coached, not an accident.
    const side = ball.y >= 0 ? 1 : -1;
    const angle = dmath.atan2(side * (pressure > 0.25 ? 32 : 22) - ball.y, end * 35 - ball.x);
    const u = inOwnD
      ? 0.9 + 0.4 * pressure
      : 0.3 + 0.5 * pressure - 0.2 * team.tactics.tempo + (team.tactics.mentality === 'defensive' ? 0.15 : 0);
    options.push({ kind: 'clear', angle, u });
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
        // keep it on the stick when someone is close: a short touch, not a 5 m prod into their reach
        const near = nearestDist(c.opp, ball);
        c.cmds.push({ tick, kind: 'strike', playerId: me.id, strike: 'push', angle: ang, power: near < 2.5 ? 0.08 : near < 4 ? 0.15 : 0.24 });
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
  // The pattern's runner is already going (§7, layer D4): he attacks the pocket BEFORE the ball is
  // played, at a sprint, so that the pass has somewhere to arrive.
  const st = c.attack;
  if (st.pattern !== null && st.runner === p.id) {
    moveTo(c, p, pocketPitch(c, ENTRY_PATTERNS[st.pattern].pocket, ballY), 0.95);
    return;
  }
  let target = shapeTarget(c.slotOf(p.id), end, ballXp, ballY, true, c.team.tactics);
  const slot = c.slotOf(p.id);
  // forwards: attack the D — top-of-D staging or the far post when the ball is deep and wide
  if (slot.role === 'FWD' && ballXp > 50) {
    const side = Math.sign(slot.y) || 0; // -1 left winger, 0 centre forward, +1 right winger (team frame)
    if (ballXp > 55) {
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
  // A forward attacking the D sprints — possession near the circle lives a few seconds, and a pocket
  // reached too late is a pocket that never existed (measured: half an attacker in the D on average).
  moveTo(c, p, target, slot.role === 'FWD' && ballXp > 50 ? 0.9 : 0.65);
}

// ── the attack's intention (docs/design/hockey-systems.md §7) ──────────────────

/** What the attacking team has decided to do, as a team: the pattern it runs and who runs it. */
export interface AttackState {
  pattern: EntryPatternId | null;
  /** when the pattern was chosen — patterns are committed to for a few seconds, not re-picked at 20 Hz */
  since: number;
  runner: number | null;
  /** who has the ball, since when, and where he stood — for the one-touch lay-back */
  carrier: number | null;
  receivedAt: number;
  carrierPos: Vec2;
  /** the last first-time lay-back: when, and where the pressed man played it from */
  layBackAt: number;
  layBackFrom: Vec2 | null;
}
export const newAttackState = (): AttackState => ({ pattern: null, since: -99, runner: null, carrier: null, receivedAt: -99, carrierPos: { x: 0, y: 0 }, layBackAt: -99, layBackFrom: null });

/** Commit to a pattern for this long unless the picture has clearly changed. */
const PATTERN_COMMIT_TICKS = 60;
/** Below this the patterns are off: entry patterns are 23-metre ideas. */
const PATTERN_FROM_XP = 58;

/** Note who has the ball, and whether the last change of hands was a first-time lay-back. */
function trackPossession(c: Ctx, carrier: PlayerView): void {
  const st = c.attack;
  if (st.carrier === carrier.id) { st.carrierPos = carrier.pos; return; }
  // the previous man played it within a touch of receiving it, and backwards: a lay-back
  if (st.carrier !== null && c.tick - st.receivedAt <= 12 && c.end * (c.ball.x - st.carrierPos.x) < -3) { st.layBackAt = c.tick; st.layBackFrom = st.carrierPos; }
  st.carrier = carrier.id; st.receivedAt = c.tick; st.carrierPos = carrier.pos;
}

/** A pocket in pitch coordinates for this team, with `side` taken from the ball's own-frame y. */
function pocketPitch(c: Ctx, pocket: Pocket, ballY: Scalar): Vec2 {
  const pk = entryPocket(pocket, ballY >= 0 ? 1 : -1);
  return slotToPitch({ xp: HALF_LENGTH * 2 - pk.fromGoal, y: pk.y }, c.end);
}

/** The deep-wide pocket inside the D — pull-back territory (the value grid's 0.62 floor). */
function inBaselinePocket(p: Vec2, end: End): boolean {
  if (!inCircle(p, end)) return false;
  const d = Math.sqrt((end * HALF_LENGTH - p.x) ** 2 + p.y ** 2);
  return d > 10 && Math.abs(p.y) > 6;
}

/**
 * How strongly the picture asks for a trigger, 0..1. Geometry in the team's own frame: `ballXp`
 * metres from our own backline, `ballY` across.
 */
function triggerScore(c: Ctx, trig: EntryTrigger, ballXp: Scalar, ballY: Scalar): Scalar {
  const { end, ball, opp } = c;
  const ay = Math.abs(ballY);
  switch (trig) {
    case 'ballDeepWide': return clamp((ballXp - 78) / 5, 0, 1) * clamp((ay - 4) / 3, 0, 1);
    case 'ballTopCentral': return clamp(1 - Math.abs(ballXp - 75) / 7, 0, 1) * clamp(1 - ay / 8, 0, 1);
    case 'ballWideEarly': return clamp(1 - Math.abs(ballXp - 70) / 8, 0, 1) * clamp((ay - 8) / 5, 0, 1);
    case 'defenderOnLine': {
      if (!inCircle(ball, end)) return 0;
      const gx = end * HALF_LENGTH;
      const gvx = gx - ball.x, gvy = -ball.y; const gl = Math.sqrt(gvx * gvx + gvy * gvy) || 1;
      for (const o of opp) {
        if (o.isGoalkeeper) continue;
        const dx = o.pos.x - ball.x, dy = o.pos.y - ball.y;
        const along = (dx * gvx + dy * gvy) / gl, perp = Math.abs(dx * gvy - dy * gvx) / gl;
        if (along > 0.5 && along < 4.5 && perp < 1.8) return 1;
      }
      return 0;
    }
    case 'blockShifted': {
      // their block has slid across to the ball's side: the far side is there for the taking
      const defs = opp.filter((o) => !o.isGoalkeeper && end * o.pos.x + HALF_LENGTH > 66);
      if (defs.length < 3) return 0;
      const side = ballY >= 0 ? 1 : -1;
      const shift = defs.reduce((acc, o) => acc + side * end * o.pos.y, 0) / defs.length;
      return clamp((shift - 2) / 4, 0, 1) * clamp((ay - 4) / 4, 0, 1);
    }
  }
}

/** Who makes a pattern's run, from the formation: the roles are slots, never names. */
function pickRunner(c: Ctx, pattern: EntryPatternId, ballY: Scalar, carrierId: number): PlayerView | undefined {
  const want = ENTRY_PATTERNS[pattern].runner;
  const side = ballY >= 0 ? 1 : -1;
  const cands = c.mine.filter((p) => !p.isGoalkeeper && p.id !== carrierId);
  const fwds = cands.filter((p) => c.slotOf(p.id).role === 'FWD');
  const by = (ps: PlayerView[], score: (p: PlayerView) => number): PlayerView | undefined => [...ps].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
  switch (want) {
    case 'cf': return by(fwds, (p) => -Math.abs(c.slotOf(p.id).y));
    case 'farWinger': return by(fwds, (p) => -side * c.slotOf(p.id).y);
    case 'nearWinger': return by(fwds, (p) => side * c.slotOf(p.id).y);
    case 'mid': return by(cands.filter((p) => c.slotOf(p.id).role === 'MID'), (p) => c.slotOf(p.id).xp);
  }
}

/**
 * Choose the circle-entry pattern (§7): every pattern is scored against the picture (its trigger),
 * the value of its pocket and the space there, and the best one is committed to for a few seconds.
 * The coach's preferred entry is a thumb on the scale, not an order — a pull-back with nobody wide
 * is not a plan.
 */
function entryPattern(c: Ctx, carrier: PlayerView, ballXp: Scalar, ballY: Scalar): void {
  const st = c.attack;
  if ((c.tick + c.team.team) % DECISION_EVERY !== 0) return;
  if (ballXp < PATTERN_FROM_XP) { st.pattern = null; st.runner = null; return; }
  const score = (id: EntryPatternId): Scalar => {
    const pat = ENTRY_PATTERNS[id];
    const trig = triggerScore(c, pat.trigger, ballXp, ballY);
    if (trig <= 0) return 0;
    const at = pocketPitch(c, pat.pocket, ballY);
    const space = clamp((nearestDist(c.opp, at) - 1.0) / 5, 0.25, 1);
    return trig * (0.4 + pitchValue(at, c.end)) * space * (c.team.tactics.entry === id ? 1.4 : 1);
  };
  // commitment: keep the pattern while it still reads and the window is open
  if (st.pattern !== null && c.tick - st.since < PATTERN_COMMIT_TICKS && score(st.pattern) > 0.12) {
    if (st.runner === null || st.runner === carrier.id || !c.mine.some((p) => p.id === st.runner && p.onPitch)) st.runner = pickRunner(c, st.pattern, ballY, carrier.id)?.id ?? null;
    return;
  }
  let best: EntryPatternId | null = null, bs = 0.12;
  for (const id of Object.keys(ENTRY_PATTERNS) as EntryPatternId[]) { const v = score(id); if (v > bs) { bs = v; best = id; } }
  if (best !== st.pattern) st.since = c.tick;
  st.pattern = best;
  st.runner = best === null ? null : pickRunner(c, best, ballY, carrier.id)?.id ?? null;
}

/** Can `mate` reach `at` before the nearest opponent, given the ball arrives in `tBall` seconds? */
function pursuitWins(c: Ctx, mate: PlayerView, at: Vec2, tBall: Scalar): boolean {
  const vMax = c.profile.player.maxSpeed;
  const tMate = dist(mate.pos, at) / (vMax * paceFactor(c.attrsOf(mate.id)) * 0.9);
  let tDef = Infinity;
  for (const o of c.opp) { if (o.isGoalkeeper) continue; const t = dist(o.pos, at) / (vMax * paceFactor(c.attrsOf(o.id)) * 0.9); if (t < tDef) tDef = t; }
  return tMate <= tBall + 0.5 && tDef >= tMate - 0.2;
}

/**
 * One defender's job this phase (docs/design/hockey-systems.md §2). Distance to the ball is an
 * *input* to choosing jobs, never the job itself — that is what used to collapse the shape ball-side.
 */
type Assignment =
  | { kind: 'pressBall' }
  | { kind: 'cover'; rank: 1 | 2 }
  | { kind: 'markMan'; target: number }
  | { kind: 'markZone' }
  | { kind: 'free' }
  | { kind: 'restBreak' };

/** A mark is handed over only on a real switch, never on a geometry wobble (§4). */
const MARK_SWITCH_MARGIN = 2;   // metres a challenger must be closer by
const MARK_SWITCH_TICKS = 10;   // and for this long (0.5 s)

export interface DefenceState {
  /** runner id → the defender who has him. */
  markedBy: Map<number, number>;
  /** runner id → the defender trying to take him over, and since when. */
  challenge: Map<number, { by: number; since: number }>;
  /** Last resolved jobs, and what they were resolved for (see `jobsFor`). */
  jobs: Map<number, Assignment>;
  jobsTick: number;
  jobsKey: number;
}
export const newDefenceState = (): DefenceState => ({ markedBy: new Map(), challenge: new Map(), jobs: new Map(), jobsTick: -99, jobsKey: -1 });

/**
 * Assignments are a shape decision, and shape decisions are not taken at 20 Hz. Re-resolving every
 * tick cost ~40 % of a match's simulation time and bought nothing: a job that changes between two
 * ticks is a defender changing his mind mid-stride, which is the flicker §4's stickiness exists to
 * stop. Resolve on the same cadence as every other off-ball decision (DECISION_EVERY), and
 * immediately when the man on the ball changes — that *is* a new phase of play.
 */
function jobsFor(c: Ctx, target: PlayerView, sys: PressSystem, st: DefenceState, skip?: number): Map<number, Assignment> {
  // Keyed on possession, not on which opponent is nearest: while the ball travels, the nearest
  // opponent flickers between receivers and re-resolving on every change is what made this
  // expensive. Who we are defending against is a phase; who is momentarily closest is not.
  const key = target.team;
  if (c.tick - st.jobsTick < DECISION_EVERY && st.jobsKey === key && st.jobs.size > 0) return st.jobs;
  st.jobs = assign(c, target, sys, st, skip);
  st.jobsTick = c.tick;
  st.jobsKey = key;
  return st.jobs;
}

/**
 * Turn the pressing system into one job per outfielder. No branch per system: every difference
 * between full / half / split / zone is a value in PRESS_SYSTEMS.
 */
function assign(c: Ctx, carrier: PlayerView, sys: PressSystem, st: DefenceState, skip?: number): Map<number, Assignment> {
  const { end, mine, opp, ball, tick, team } = c;
  const out = new Map<number, Assignment>();
  const outfield = mine.filter((p) => !p.isGoalkeeper && p.id !== skip);
  const ballXp = end * ball.x + HALF_LENGTH;
  const ballChannel = channelOf(end * ball.y);
  const inOwn23 = in23(ball, -end as End);
  const engage = ballXp < pressLineM(team.tactics.pressHeight) || inOwn23;

  // Rest-break: the most advanced forwards do not defend — in a deep block they are the whole point
  // of conceding the ball. Once it reaches our own 23 nobody is exempt any more.
  const resting = new Set<number>();
  if (!inOwn23 && sys.restBreak > 0) {
    const fwd = outfield.filter((p) => c.slotOf(p.id).role === 'FWD').sort((a, b) => c.slotOf(b.id).xp - c.slotOf(a.id).xp || a.id - b.id);
    for (const p of fwd.slice(0, sys.restBreak)) { resting.add(p.id); out.set(p.id, { kind: 'restBreak' }); }
  }
  const available = outfield.filter((p) => !resting.has(p.id));
  const taken = new Set<number>();

  // The presser is the owner of the ball's channel on the initiating line — not the nearest body on
  // the pitch. A right half does not sprint across to a ball on the far left; he holds the inside slot.
  if (engage) {
    // Channel discipline is a build-up and midfield idea. Once the ball is in our own 23 it stops
    // applying: the nearest body goes, everyone else picks up a shirt. A back who holds his channel
    // while the ball sits on the spot is not disciplined, he is watching a goal.
    const score = (p: PlayerView): number => {
      if (inOwn23) return dist(p.pos, ball);
      const slot = c.slotOf(p.id);
      const dc = Math.abs(channelOf(slot.y) - ballChannel);
      const dl = lineOf(slot.xp) === sys.initiator ? 0 : 1;
      return dc * 100 + dl * 40 + dist(p.pos, ball);
    };
    const presser = [...available].sort((a, b) => score(a) - score(b) || a.id - b.id)[0];
    if (presser) {
      out.set(presser.id, { kind: 'pressBall' });
      taken.add(presser.id);
      // cover: `commit` players go to the ball in total, from the channels beside the presser
      const covers = available.filter((p) => !taken.has(p.id)).sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball) || a.id - b.id).slice(0, sys.commit - 1);
      covers.forEach((p, i) => { out.set(p.id, { kind: 'cover', rank: (i === 0 ? 1 : 2) }); taken.add(p.id); });
      // in our own circle a third body always joins: bodies in the D are what shots hit
      if (inCircle(ball, -end as End)) {
        const third = available.filter((p) => !taken.has(p.id)).sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball) || a.id - b.id)[0];
        if (third) { out.set(third.id, { kind: 'cover', rank: 2 }); taken.add(third.id); }
      }
    }
  }

  // Marking. Threat order: how close an opponent is to our goal, then to the ball.
  const ownGoal = { x: -end * HALF_LENGTH, y: 0 };
  const marks = sys.scheme === 'zonal' && !inOwn23 ? 0 : sys.scheme === 'manToMan' ? 99 : inOwn23 ? 99 : 2;
  if (marks > 0) {
    const threats = opp.filter((o) => !o.isGoalkeeper && o.id !== carrier.id)
      .filter((o) => sys.scheme === 'manToMan' ? end * o.pos.x < 0 || inOwn23 : in23(o.pos, -end as End) || inOwn23 || sys.scheme === 'hybrid')
      .sort((a, b) => dist(a.pos, ownGoal) - dist(b.pos, ownGoal) || dist(a.pos, ball) - dist(b.pos, ball) || a.id - b.id)
      .slice(0, marks);
    // Standing marks are reserved BEFORE anything new is handed out. Assigning in threat order and
    // taking "the nearest free man" each time lets an earlier runner steal the defender who is
    // already on someone, and then nobody arrives anywhere: the whole line spends the match
    // swapping men 10 Hz and never closing. Reserve first, fill second.
    const unheld: PlayerView[] = [];
    for (const r of threats) {
      const held = st.markedBy.get(r.id);
      const holder = held !== undefined ? available.find((p) => p.id === held && !taken.has(p.id)) : undefined;
      if (!holder) { unheld.push(r); continue; }
      // hand the mark over only when a teammate has been clearly closer for half a second
      const others = available.filter((p) => !taken.has(p.id) && p.id !== holder.id);
      const nearest = [...others].sort((a, b) => dist(a.pos, r.pos) - dist(b.pos, r.pos) || a.id - b.id)[0];
      let marker = holder;
      if (nearest && dist(holder.pos, r.pos) - dist(nearest.pos, r.pos) > MARK_SWITCH_MARGIN) {
        const ch = st.challenge.get(r.id);
        if (ch?.by === nearest.id) { if (tick - ch.since >= MARK_SWITCH_TICKS) { marker = nearest; st.challenge.delete(r.id); } }
        else st.challenge.set(r.id, { by: nearest.id, since: tick });
      } else st.challenge.delete(r.id);
      st.markedBy.set(r.id, marker.id);
      out.set(marker.id, { kind: 'markMan', target: r.id });
      taken.add(marker.id);
    }
    for (const r of unheld) {
      const free = available.filter((p) => !taken.has(p.id));
      const nearest = [...free].sort((a, b) => dist(a.pos, r.pos) - dist(b.pos, r.pos) || a.id - b.id)[0];
      if (!nearest) break;
      st.markedBy.set(r.id, nearest.id);
      out.set(nearest.id, { kind: 'markMan', target: r.id });
      taken.add(nearest.id);
    }
  }

  // The spare. A full-court press has none — that absence is the system's risk, not an oversight.
  if (sys.freeMan) {
    const rest = available.filter((p) => !taken.has(p.id));
    const spare = [...rest].sort((a, b) => dist(a.pos, ownGoal) - dist(b.pos, ownGoal) || a.id - b.id)[0];
    if (spare) { out.set(spare.id, { kind: 'free' }); taken.add(spare.id); }
  }
  for (const p of available) if (!taken.has(p.id)) out.set(p.id, { kind: 'markZone' });
  return out;
}

/**
 * Hold the pressing system's shape against `target` — the man who has the ball, or the man the ball
 * is travelling to. `skip` is a teammate already committed to the ball (the loose-ball chaser), who
 * gets no assignment because he has one.
 */
function defend(c: Ctx, target: PlayerView, ballXp: Scalar, ballY: Scalar, lastTackleTick: Map<number, number>, st: DefenceState, skip?: number): void {
  const { end, mine, tick, team, ball } = c;
  const sys = PRESS_SYSTEMS[team.tactics.press];
  const jobs = jobsFor(c, target, sys, st, skip);
  const outfield = mine.filter((p) => !p.isGoalkeeper && p.id !== skip);
  // only a man who actually has the ball can be tackled
  const tacklable = dist(target.pos, ball) < 1.6;
  const inOwnD = inCircle(ball, -end as End);
  const ownGoal = { x: -end * HALF_LENGTH, y: 0 };
  const gvx = ownGoal.x - ball.x, gvy = ownGoal.y - ball.y; const gl = Math.sqrt(gvx * gvx + gvy * gvy) || 1;
  // Shepherding: the first defender closes from the inside shoulder so the carrier's only way forward
  // is wide, and the block slides across behind him. `toReverse` (§6.1) is the hockey-specific one:
  // close the carrier's OPEN STICK channel, so the only way forward is on his reverse — where he
  // carries worse, eliminates worse and strikes worse. This is why a hockey pressing angle is not a
  // football pressing angle.
  const inside = ball.y > 0 ? -1 : 1;
  // captured before the loop: the case block below shadows `target` with the spot to stand on
  const carrierHeading = target.heading;


  for (const p of outfield) {
    const job = jobs.get(p.id);
    if (!job) { moveToShape(c, p, false, ballXp, ballY); continue; }
    // Whoever the ball actually arrives at challenges for it. Channel discipline decides who steps
    // OUT OF SHAPE to hunt the ball, not who is allowed to touch it at their feet: a defender
    // standing next to the ball and forbidden to tackle is not hockey, and it is where the fouls
    // that become penalty corners come from.
    if (tacklable) tryTackle(c, p, target, lastTackleTick, job.kind === 'pressBall' ? 1 : 0.6);
    switch (job.kind) {
      case 'pressBall': {
        // jockey 2 m goal-side (stick reach is 1.6 m; you tackle from there, you don't stand on the ball).
        // In our own circle the first defender gets ON the ball–goal line to block the shot with stick and
        // body — that is where most penalty corners come from (feet), and it is what real defenders do.
        const target = inOwnD
          ? { x: ball.x + (gvx / gl) * 1.7, y: ball.y + (gvy / gl) * 1.7 }
          : jockeySpot(sys.shepherd, ball, carrierHeading, end, inside, sys.trap === 'touchline');
        if (inOwnD) c.cmds.push({ tick, kind: 'move', playerId: p.id, dx: target.x - p.pos.x, dy: target.y - p.pos.y, effort: dist(p.pos, target) < 0.4 ? 0 : 1 });
        else moveTo(c, p, target, 1);
        break;
      }
      case 'cover': {
        // stacked towards our goal, staggered — a real D is crowded; in a trap the cover sits on the
        // touchline side ahead of the ball to spring it
        const back = job.rank === 1 ? 3.2 : 4.6;
        const target = inOwnD
          ? { x: ball.x + (gvx / gl) * back, y: ball.y + (gvy / gl) * back + (ball.y > 0 ? -1.0 : 1.0) * (job.rank === 1 ? 1 : -1) }
          : sys.trap === 'touchline'
            ? { x: ball.x - end * 6, y: ball.y - inside * 5 }
            : { x: ball.x - end * 5, y: ball.y + (ball.y > 0 ? -4 : 4) };
        moveTo(c, p, target, 1);
        break;
      }
      case 'markMan': {
        const r = c.view.playerById(job.target);
        if (r) markRunner(c, p, r); else moveToShape(c, p, false, ballXp, ballY);
        break;
      }
      case 'free': {
        // the spare: central, goal-side of the deepest attacker, on the defensive line
        const deepest = [...c.opp].filter((o) => !o.isGoalkeeper).sort((a, b) => dist(a.pos, ownGoal) - dist(b.pos, ownGoal) || a.id - b.id)[0];
        const line = backLineM(team.tactics.defensiveLine);
        const xp = deepest ? Math.min(line, end * deepest.pos.x + HALF_LENGTH - 4) : line;
        moveTo(c, p, { x: end * (clamp(xp, 6, HALF_LENGTH * 2 - 10) - HALF_LENGTH), y: end * clamp(ballY * 0.3, -8, 8) }, 0.85);
        break;
      }
      case 'restBreak': {
        // left high on purpose: hold between halfway and their 23 on the far side from the ball, ready
        // to go — no offside in hockey, and the whole point of resting him is the outlet and the sprint
        // into the D the moment the ball is won (at halfway he was 25 m too far from the circle to matter)
        moveTo(c, p, { x: end * 14, y: end * clamp(-ballY * 0.5, -16, 16) }, 0.45);
        break;
      }
      default:
        moveToShape(c, p, false, ballXp, ballY);
    }
  }
}

/**
 * Tackle: pick the moment (not every tick), and a beaten tackler is out of it for ~2 s — a lunge that
 * misses leaves you behind the play; that is what makes elimination skills matter. Midfield is
 * jockey-and-channel territory; committed tackles belong in the 23 and the D (a missed lunge at
 * halfway is how counters start).
 */
function tryTackle(c: Ctx, p: PlayerView, carrier: PlayerView, lastTackleTick: Map<number, number>, keenness: Scalar): void {
  const { end, tick, ball } = c;
  if (dist(p.pos, ball) >= 1.9 || tick - (lastTackleTick.get(p.id) ?? -99) < 60) return;
  const inOwnD = inCircle(ball, -end as End);
  // Midfield is jockey territory (0.06 base, 3 s between bites — 110 contests a match was a scrum);
  // the committed tackle belongs in the 23 and above all in the D, where it is worth a turnover.
  // A defender who has worked himself onto the carrier's open stick side goes; one still across
  // the body jockeys and waits, because that tackle is the one the umpire punishes (§6.2). In our
  // own D nobody waits — there the ball has to be stopped whatever side you are on.
  const side = lateralOf(carrier.heading, carrier.pos, p.pos);
  // 0.35, not more: real defenders do commit from the wrong side — that is precisely why
  // obstruction and stick offences exist at all, and starving them would starve the corners this
  // phase is meant to give the right cause.
  const sideKeen = inOwnD ? 1 : 1 - 0.35 * Math.max(0, side);
  const aggr = (0.02 + 0.06 * norm(c.attrsOf(p.id).technical.tackling) + 0.25 * (in23(ball, -end as End) ? 1 : 0) + 0.4 * (inOwnD ? 1 : 0)) * keenness * sideKeen;
  if (c.rng.chance(aggr)) { c.cmds.push({ tick, kind: 'tackle', playerId: p.id, targetId: carrier.id }); lastTackleTick.set(p.id, tick); }
}

/**
 * Marking in our 23 for the loose-ball case (hockey: zonal shape until the ball reaches the 23, then
 * every attacker who gets into the D is picked up goal-side — a free forward on the spot is a goal).
 */
function assignMarks(c: Ctx, outfield: readonly PlayerView[], busy: Set<number | undefined>, carrierId: number | null): Map<number, PlayerView> {
  const { end, ball } = c;
  const marks = new Map<number, PlayerView>();
  if (!in23(ball, -end as End)) return marks;
  const runners = c.opp.filter((o) => !o.isGoalkeeper && o.id !== carrierId && in23(o.pos, -end as End)).sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball));
  const free = outfield.filter((p) => !busy.has(p.id));
  for (const r of runners) {
    let best: PlayerView | null = null, bd = 14;
    for (const p of free) if (!marks.has(p.id)) { const d = dist(p.pos, r.pos); if (d < bd) { bd = d; best = p; } }
    if (best) marks.set(best.id, r);
  }
  return marks;
}
function markRunner(c: Ctx, p: PlayerView, r: PlayerView): void {
  const { end, ball } = c;
  const ownGoal = { x: -end * HALF_LENGTH, y: 0 };
  const gvx = ownGoal.x - r.pos.x, gvy = ownGoal.y - r.pos.y; const gl = Math.sqrt(gvx * gvx + gvy * gvy) || 1;
  // goal-side and a touch ball-side: between the runner and the goal, stick to the ball
  moveTo(c, p, { x: r.pos.x + (gvx / gl) * 1.4, y: r.pos.y + (gvy / gl) * 1.4 + (ball.y > r.pos.y ? 0.4 : -0.4) }, 1);
}

/**
 * Take the ball if it is arriving. No reaction time: a ball fired from inside ~4 m at pace reaches you
 * before the stick does — the body takes it (that is the feet foul the attacker was after). Only a
 * deliberate stop from distance is a trap; a slow ball within reach is a controlled pick-up.
 */
function trapIfArriving(c: Ctx, p: PlayerView): void {
  const { ball, tick } = c;
  const d = dist(p.pos, ball);
  const lt = c.view.ball.lastTouch === null ? undefined : c.view.playerById(c.view.ball.lastTouch);
  const pointBlank = c.ballSpeed > 8 && lt !== undefined && lt.team !== p.team && dist(lt.pos, p.pos) < 4;
  if (d < 1.4 && c.ballSpeed > 3.5 && approaching(c, p) && !pointBlank) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
  else if (d < 1.3 && c.ballSpeed <= 3.5 && c.view.ball.lastTouch !== p.id) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
}

function looseBall(c: Ctx, ballXp: Scalar, ballY: Scalar, inPossession: boolean, lastTackleTick: Map<number, number>, st: DefenceState): void {
  const { mine, ball } = c;
  const outfield = mine.filter((p) => !p.isGoalkeeper);
  const chaser = nearestTo(outfield, ball);
  // Off the ball the system still governs. A ball in flight is most of a hockey match; if the shape
  // only applied while an opponent was physically dribbling, the pressing system would be steering a
  // fraction of the game and everyone else would be standing in their formation slot.
  if (!inPossession) {
    const receiver = nearestTo(c.opp.filter((o) => !o.isGoalkeeper), ball);
    if (receiver) {
      if (chaser) {
        const t = clamp(dist(chaser.pos, ball) / 6, 0, 1.2);
        moveTo(c, chaser, { x: ball.x + c.ballVel.x * t * 0.6, y: ball.y + c.ballVel.y * t * 0.6 }, 1);
        trapIfArriving(c, chaser);
      }
      defend(c, receiver, ballXp, ballY, lastTackleTick, st, chaser?.id);
      return;
    }
  }
  const marks = inPossession ? new Map<number, PlayerView>() : assignMarks(c, outfield, new Set([chaser?.id]), null);
  for (const p of outfield) {
    if (p.id === chaser?.id) {
      // meet the ball where it will be
      const t = clamp(dist(p.pos, ball) / 6, 0, 1.2);
      const meet = { x: ball.x + c.ballVel.x * t * 0.6, y: ball.y + c.ballVel.y * t * 0.6 };
      moveTo(c, p, meet, 1);
      trapIfArriving(c, p);
    } else if (marks.has(p.id)) {
      const r = marks.get(p.id);
      if (r) markRunner(c, p, r);
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

/** The castle: who is who among the five behind the line, fixed once per corner like the battery. */
interface Castle { flyer: PlayerView | undefined; second: PlayerView | undefined; postNear: PlayerView | undefined; postFar: PlayerView | undefined }

/** Attack-frame geometry of a corner: where the trap, the strike and the slips happen (pitch coords). */
function pcSpots(theirEnd: End, injSide: number): { topX: Scalar; trap: Vec2; strike: Vec2; slipL: Vec2; slipR: Vec2 } {
  const topX = theirEnd * (CIRCLE_TOP_X - 0.6);
  return {
    topX,
    trap: { x: topX, y: injSide * 1.5 },
    strike: { x: topX - theirEnd * 1.2, y: injSide * 0.2 },
    // the slip spots in the attack's own words: slipRight is away from the injector. INSIDE the
    // circle, a stride in from the line — a hitter outside it is a corner that ends on the pass.
    slipR: { x: topX + theirEnd * 1.2, y: -injSide * 3.0 },
    slipL: { x: topX + theirEnd * 1.2, y: injSide * 3.0 },
  };
}

/**
 * The angle to strike `target` from where the stick will actually meet the ball: the ball itself if
 * it already sits in front of the body along that line, else half a stride ahead of the body (the
 * engine brings the ball round before a strike — match.ts). Aiming from the ball when the ball is
 * at your heel moves the launch point a metre, and a metre at the launch is a metre at the post.
 */
function aimFrom(p: PlayerView, ball: Vec2, target: Vec2): Scalar {
  const ux0 = target.x - p.pos.x, uy0 = target.y - p.pos.y; const ul = Math.sqrt(ux0 * ux0 + uy0 * uy0) || 1;
  const ux = ux0 / ul, uy = uy0 / ul;
  const ahead = (ball.x - p.pos.x) * ux + (ball.y - p.pos.y) * uy;
  const from = ahead >= 0.25 ? ball : { x: p.pos.x + ux * 0.5, y: p.pos.y + uy * 0.5 };
  return dmath.atan2(target.y - from.y, target.x - from.x);
}

/** The point `back` metres goal-side of `t` on the line from `t` to the goal at `goal`. */
function goalSideOf(t: Vec2, goal: Vec2, back: Scalar): Vec2 {
  const dx = goal.x - t.x, dy = goal.y - t.y; const l = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: t.x + (dx / l) * back, y: t.y + (dy / l) * back };
}

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
    // (the slip hitter who has just stopped the slipped ball is in the same scripted moment: with the
    // open-play logic in charge he passed it straight back to the trapper)
    const scriptedMoment = carrier !== null && (carrier.id === c.pcRoles.trapper || carrier.id === c.pcRoles.striker) && (c.pcRoles.strikerArrivingUntil ?? 0) >= tick;
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
  const injSideNow = ball.y >= 0 ? 1 : -1;
  const key = rules.pcTakenTick ?? (rules.restart?.readyTick ?? -2) * -1 - 1000; // pending: negative key from readyTick; taken: playing tick
  if (!pending && c.pcRoles.key !== key && c.pcRoles.injector !== null) c.pcRoles.key = key; // injection happened: keep the roles
  if (c.pcRoles.key !== key && pending) {
    const want = c.team.tactics.pcBattery;
    const pick = (id: number | undefined, from: PlayerView[]): PlayerView | undefined => (id === undefined ? undefined : from.find((p) => p.id === id));
    const inj = pick(want?.injector, outfield) ?? nearestTo(outfield, ball);
    const trapSpot0 = pcSpots(end, injSideNow).trap;
    const rest = outfield.filter((p) => p.id !== inj?.id);
    const striker = pick(want?.striker, rest) ?? [...rest].sort((a, b) => norm(c.attrsOf(b.id).technical.dragFlick) - norm(c.attrsOf(a.id).technical.dragFlick) || a.id - b.id)[0];
    const trapper = pick(want?.trapper, rest.filter((p) => p.id !== striker?.id)) ?? nearestTo(rest.filter((p) => p.id !== striker?.id), trapSpot0);
    c.pcRoles.key = key; c.pcRoles.injector = inj?.id ?? null; c.pcRoles.trapper = trapper?.id ?? null; c.pcRoles.striker = striker?.id ?? null;
    c.pcRoles.injSide = injSideNow;
  }
  if (pending) {
    // the runners take the pocket nearest to where they stand on the line, so nobody's route to
    // his pocket crosses the shooting lane as the strike leaves (own feet = free hit out). Resolved
    // every waiting tick and frozen at the injection: the umpire's placement lands a tick after
    // the roles are first set, and a pocket handed out from the pre-placement picture sent a
    // midfielder standing outside the D to the far post.
    const injS = c.pcRoles.injSide ?? injSideNow;
    const gx0 = end * HALF_LENGTH, topX0 = end * (CIRCLE_TOP_X - 0.6);
    const pockets = [{ x: gx0 - end * 5.5, y: -injS * 5 }, { x: topX0 - end * 2.5, y: injS * 4.5 }, { x: topX0 - end * 4.5, y: -injS * 6 }, { x: topX0 - end * 3, y: injS * 9 }];
    const pool = outfield.filter((p) => p.id !== c.pcRoles.injector && p.id !== c.pcRoles.striker && p.id !== c.pcRoles.trapper);
    const order: number[] = [];
    for (const pk of pockets) { const n = nearestTo(pool.filter((p) => !order.includes(p.id)), pk); if (n) order.push(n.id); }
    c.pcRoles.runners = order;
  }
  const injSide = c.pcRoles.injSide ?? injSideNow;
  const spots = pcSpots(end, injSide);
  const { topX, trap: trapSpot, strike: strikeSpot } = spots;
  const injector = outfield.find((p) => p.id === c.pcRoles.injector);
  const trapper = outfield.find((p) => p.id === c.pcRoles.trapper);
  const bestFlicker = outfield.find((p) => p.id === c.pcRoles.striker);
  const order = c.pcRoles.runners ?? [];
  const others = outfield.filter((p) => p.id !== injector?.id && p.id !== trapper?.id && p.id !== bestFlicker?.id)
    .sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 99) - (order.includes(b.id) ? order.indexOf(b.id) : 99) || a.id - b.id);
  const variant = c.team.tactics.pcVariant;
  const slip = variant === 'slipRight' || variant === 'slipLeft';
  // the battery is "set" when trapper and striker are on their marks (or we've waited 4 s — don't stall)
  // The striker stands off the TRAPPER, not off a chalk mark: the ball stops where the trapper
  // slides to, and a striker a stride away strikes within half a second of the stop. (Measured off
  // the fixed mark he was 1.5 m short and the strike came a full second after the trap — the
  // flyer's race is against that half-second.)
  const strikerSpot = variant === 'slipRight' ? spots.slipR : variant === 'slipLeft' ? spots.slipL
    : trapper && !pending ? { x: trapper.pos.x - end * 1.1, y: trapper.pos.y - injSide * 0.4 } : strikeSpot;
  const batterySet = (!!trapper && dist(trapper.pos, trapSpot) < 1.6) && (!!bestFlicker && dist(bestFlicker.pos, strikerSpot) < 1.8);
  const waitedLong = rules.restart !== null && tick - rules.restart.readyTick > 160; // 8 s: clock is stopped, nothing lost
  const firstShotGone = rules.pcFirstShot !== null;
  // the second ball: the strike has gone and the ball is loose near the goal (a deflection PASS
  // counts as the first shot to the umpire, so the runners wait for it to be slow or close)
  const reboundPhase = firstShotGone && (c.ballSpeed < 6 || dist(ball, { x: gx, y: 0 }) < 8);
  // The runners' pattern per variant (§5 attack gap 1): a deflector at the far post who MAKES CONTACT,
  // a rebounder at the top of the D, a trailer, and a wide man — not four fixed spots. The far post
  // is on the side away from the injector, because that is where a ball struck across the goal ends.
  // The deflector's pocket is wide of the far post, not on it: the lane from the top to the post
  // itself runs straight past the flyer's line. From 4.5 m wide the touch still has the whole goal.
  const deflectorSpot = { x: gx - end * 5.5, y: -injSide * 4.5 };
  const runnerSpots: Vec2[] = [
    // the far-post runner stands OFF the far-corner lane unless the ball is meant for him: a
    // strike into your own man's feet is a free hit out
    variant === 'deflection' ? deflectorSpot : { x: gx - end * 6, y: -injSide * 6 },
    { x: topX - end * 2.5, y: injSide * 4.5 },     // rebounder at the top of the D
    { x: topX - end * 4.5, y: -injSide * 6 },      // trailer
    { x: topX - end * 3, y: injSide * 9 },         // wide, the outlet if the ball is cleared our way
  ];
  for (const p of outfield) {
    if (p.id === injector?.id) {
      moveTo(c, p, { x: gx - end * 0.4, y: ball.y + injSide * 0.5 }, 0.8);
      if (pending && rules.restart && tick >= rules.restart.readyTick && dist(p.pos, ball) < 1.3 && trapper && (batterySet || waitedLong)) {
        // injection: a firm push to the trapper, arriving at ~12 m/s — the stop is drilled (the
        // engine knows it: see the trapper's bonus in match.ts), and a slow injection hands the
        // flyer the race. Measured at 8 m/s the sequence took 3 s and he was on the striker's toes.
        // A slap, not a push: a push tops out around 11 m/s for a club player and cannot get there.
        const angle = dmath.atan2(trapSpot.y - ball.y, trapSpot.x - ball.x);
        const need = passSpeedFor(dist(ball, trapSpot), 12, c.profile, c.surface);
        const maxV = c.profile.strike.slapSpeed * strikeSpeedFactor(c.attrsOf(p.id), 'slap');
        c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'slap', angle, power: clamp(need / maxV, 0.4, 1) });
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
      if (!pending && c.ballSpeed < 3 && c.view.ball.lastTouch === p.id && !slip) { c.cmds.push({ tick, kind: 'move', playerId: p.id, dx: 0, dy: 0, effort: 0 }); }
      // slip variants: trapper plays it to the side for a hitter
      if (!pending && dist(p.pos, ball) < 1.3 && c.ballSpeed < 3 && c.view.ball.lastTouch === p.id && slip) {
        // a short, weighted push to the hitter's stick — a slip that rolls 8 m past him is a corner
        // given away, which is what the fixed half-power push used to do
        const at = bestFlicker ? bestFlicker.pos : (variant === 'slipRight' ? spots.slipR : spots.slipL);
        const need = passSpeedFor(Math.max(1, dist(ball, at)), 5, c.profile, c.surface);
        const maxV = c.profile.strike.pushSpeed * strikeSpeedFactor(c.attrsOf(p.id), 'push');
        c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'push', angle: dmath.atan2(at.y - ball.y, at.x - ball.x), power: clamp(need / maxV, 0.2, 1) });
      }
    } else if (p.id === bestFlicker?.id) {
      // the ball is stopped and it is his: the striker goes to it. The slip hitter holds his spot
      // until the slipped ball has reached him (a stop at full stick reach leaves it a stride away).
      const stopped = !pending && c.ballSpeed < 3 && c.view.ball.lastTouchTeam === c.team.team;
      const trapped = stopped && (slip ? dist(p.pos, ball) < 3.5 : c.view.ball.lastTouch === trapper?.id);
      moveTo(c, p, trapped ? ball : strikerSpot, 1);
      // the slipped ball is stopped first — a first-time sweep at a rolling ball went wide half the time
      if (slip && !pending && dist(p.pos, ball) < 1.6 && c.ballSpeed > 1.5 && approaching(c, p)) { c.cmds.push({ tick, kind: 'trap', playerId: p.id }); c.pcRoles.strikerArrivingUntil = tick + 25; }
      // strike when the ball is stopped at the top of the D
      if (!pending && dist(p.pos, ball) < 1.4 && c.ballSpeed < 4 && (slip ? c.view.ball.lastTouch === p.id || c.view.ball.lastTouch === trapper?.id : c.view.ball.lastTouch !== p.id) && c.view.ball.lastTouchTeam === c.team.team) {
        if (variant === 'deflection') {
          // The deflection is a PASS, not a shot: a firm ball along the turf to the far-post runner's
          // stick, struck so it arrives as he does. Before this the "deflection" was a straight
          // strike with a different name and nobody ever touched it.
          const deflector = others[0];
          const at = deflector ? { x: deflector.pos.x + deflector.vel.x * 0.3, y: deflector.pos.y + deflector.vel.y * 0.3 } : deflectorSpot;
          const angle = dmath.atan2(at.y - ball.y, at.x - ball.x);
          const need = passSpeedFor(dist(ball, at), 14, c.profile, c.surface);
          const maxV = c.profile.strike.slapSpeed * strikeSpeedFactor(c.attrsOf(p.id), 'slap');
          c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'slap', angle, power: clamp(need / maxV, 0.5, 1) });
        } else {
          // Pick the corner with the clearest lane, not just the one away from the keeper: the first
          // runner is ON the shooting line by design, and a flick into his shins is a cleared corner.
          // A drag flicker's whole craft is releasing around the runner — measured with the keeper-only
          // aim, 59 % of corners ended "cleared" and 5 % scored.
          const keeperY = c.keeperOpp?.pos.y ?? 0;
          // our own runners in the D block a lane just as surely — into their feet is a free hit out
          const blockers = [...c.opp.filter((o) => !o.isGoalkeeper), ...outfield.filter((o) => o.id !== p.id && inCircle(o.pos, end))];
          let targetY = (keeperY > 0 ? -1 : 1) * (GOAL_HALF_WIDTH - 0.45);
          let bestClear = -1;
          for (const cand of [-(GOAL_HALF_WIDTH - 0.45), GOAL_HALF_WIDTH - 0.45]) {
            const rx = gx - ball.x, ry = cand - ball.y; const rl = Math.sqrt(rx * rx + ry * ry) || 1;
            let clear = 99;
            for (const b of blockers) {
              const bx = b.pos.x - ball.x, by = b.pos.y - ball.y;
              const along = (bx * rx + by * ry) / rl;
              if (along < 0.5 || along > rl) continue;
              clear = Math.min(clear, Math.abs(bx * ry - by * rx) / rl);
            }
            // keeper still matters: his side is a worse corner, all else equal
            const score = clear - (Math.sign(cand) === Math.sign(keeperY || 1) ? 0.3 : 0);
            if (score > bestClear) { bestClear = score; targetY = cand; }
          }
          const angle = aimFrom(p, ball, { x: gx, y: targetY });
          const strike = variant === 'lowHit' ? 'hit' : 'flick';
          c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike, angle, power: 1 });
        }
      }
    } else {
      const i = others.indexOf(p);
      // Nobody enters the circle before the injection (FIH 13.3: attackers outside the D until the
      // ball is played). The placement put them on the line; they wait there.
      if (pending) { c.cmds.push({ tick, kind: 'move', playerId: p.id, dx: 0, dy: 0, effort: 0 }); continue; }
      if (i === 0) {
        // the deflector: attack the far post as the strike leaves, and TOUCH it — a lifted touch
        // off a ball arriving across him is the deflection variant; off any other variant he is
        // the far-post rebound. While the ball is coming his way he meets it on its line, like the
        // trapper does — chasing it is how the first version never touched one.
        // only the ball played from the top is his — the injection also travels "towards" him and
        // took him to its line instead of his pocket
        const comingToMe = firstShotGone && c.ballSpeed > 4 && approaching(c, p) && c.view.ball.lastTouchTeam === c.team.team;
        let spot = reboundPhase ? goalSideOf(ball, { x: gx, y: 0 }, -1.5) : (runnerSpots[0] ?? deflectorSpot);
        if (comingToMe) {
          const vv = c.ballVel.x ** 2 + c.ballVel.y ** 2;
          const t = clamp(((p.pos.x - ball.x) * c.ballVel.x + (p.pos.y - ball.y) * c.ballVel.y) / (vv || 1), 0, 1.5);
          spot = { x: ball.x + c.ballVel.x * t, y: ball.y + c.ballVel.y * t };
        }
        moveTo(c, p, spot, 1);
        if (dist(p.pos, ball) < 1.5 && comingToMe && c.ballZ < 0.6 && c.view.ball.lastTouch !== p.id) {
          // a deflection is a redirect with a lift: the keeper is set low for the ball along the
          // turf, and the touch takes it over him, well inside the far post (the ball is moving
          // under the stick, so the touch is aimed from where the man stands, with margin)
          const keeperY = c.keeperOpp?.pos.y ?? 0;
          const aim = aimFrom(p, ball, { x: gx, y: (keeperY > 0 ? -1 : 1) * (GOAL_HALF_WIDTH - 0.9) });
          // 0.75: enough lift to clear a man on the line as well as the keeper who has left it
          c.cmds.push({ tick, kind: 'strike', playerId: p.id, strike: 'flick', angle: aim, power: 0.75 });
        }
      } else if (reboundPhase) {
        // The rebound is a phase, not an accident (§5 attack gap 3): most club-level PC goals are the
        // second ball. The rebounder and the trailer arrive on it; the wide man holds the outlet.
        if (i < 3) moveTo(c, p, goalSideOf(ball, { x: gx, y: 0 }, -2.0), 1);
        else moveTo(c, p, runnerSpots[3] ?? strikeSpot, 0.7);
      } else {
        moveTo(c, p, runnerSpots[i] ?? strikeSpot, 0.9);
      }
    }
  }
}

/**
 * Defending a penalty corner with a SYSTEM (hockey-systems.md §5). The five behind the line have
 * named jobs — flyer, second charger, near post, far post, free defender — and what each does is a
 * value in PC_DEFENCES, never a branch per system. The law holds everyone behind the line until the
 * injection (and the AI does not cheat it); after it, the castle runs the system and the halfway
 * five come back as the second wave.
 */
function pcDefend(c: Ctx, pending: boolean): void {
  const { end, mine, ball, tick, team, rules } = c;
  const gx = -end * HALF_LENGTH; // our goal
  const goal = { x: gx, y: 0 };
  const theirEnd = -end as End;
  const sys = PC_DEFENCES[team.tactics.pcDefence];
  const profile = team.tactics.pcRunnerProfile ?? sys.runnerProfile;
  const outfield = mine.filter((p) => !p.isGoalkeeper);
  const injSide = c.pcRoles.defInjSide ?? (ball.y >= 0 ? 1 : -1);
  const spots = pcSpots(theirEnd, injSide);
  // the castle is fixed once per corner, like the battery: the flyer is the man who can actually fly
  const key = rules.pcTakenTick ?? (rules.restart?.readyTick ?? -2) * -1 - 1000;
  if (!pending && c.pcRoles.defKey !== key && c.pcRoles.flyer !== null) c.pcRoles.defKey = key;
  if (c.pcRoles.defKey !== key && pending) {
    const behind = outfield.filter((p) => Math.abs(p.pos.x - gx) < 2);
    const flyScore = (p: PlayerView): number => { const a = c.attrsOf(p.id); return norm(a.physical.pace) + norm(a.physical.acceleration) + 0.5 * (norm(a.mental.aggression) - norm(a.mental.discipline)); };
    const byFly = [...behind].sort((a, b) => flyScore(b) - flyScore(a) || a.id - b.id);
    const flyer = byFly[0], second = byFly[1];
    const rest = behind.filter((p) => p.id !== flyer?.id && p.id !== second?.id).sort((a, b) => a.id - b.id);
    // four outfielders behind the line (the fifth is the keeper): flyer, second (the second charger
    // in a doubleCharge, the free defender otherwise), and the two posts
    const postNear = rest[0], postFar = rest[1];
    c.pcRoles.defKey = key; c.pcRoles.flyer = flyer?.id ?? null; c.pcRoles.second = second?.id ?? null;
    c.pcRoles.postNear = postNear?.id ?? null; c.pcRoles.postFar = postFar?.id ?? null;
    c.pcRoles.defInjSide = ball.y >= 0 ? 1 : -1;
  }
  const byId = (id: number | null): PlayerView | undefined => (id === null ? undefined : outfield.find((p) => p.id === id));
  const castle: Castle = { flyer: byId(c.pcRoles.flyer), second: byId(c.pcRoles.second), postNear: byId(c.pcRoles.postNear), postFar: byId(c.pcRoles.postFar) };
  const castleIds = new Set([castle.flyer?.id, castle.second?.id, castle.postNear?.id, castle.postFar?.id]);
  const rest = outfield.filter((p) => !castleIds.has(p.id));

  const firstShotGone = rules.pcFirstShot !== null;
  const carrier = findCarrier(c);
  const theirCarrier = carrier !== null && carrier.team !== team.team ? carrier : null;
  // the ball has been stopped at the top and the strike is about to come
  const stopped = !pending && c.ballSpeed < 3 && c.view.ball.lastTouchTeam !== team.team && inCircle(ball, theirEnd);
  const slipSide = (which: 'slipLeft' | 'slipRight'): Vec2 => (which === 'slipRight' ? spots.slipR : spots.slipL);
  const chargeTarget = (line: 'trap' | 'striker'): Vec2 => (line === 'striker' ? spots.strike : spots.trap);

  /** A charger: out to the shooting line goal-side of the target, then onto the ball if committed. */
  const charge = (p: PlayerView, target: Vec2, commit: Scalar): void => {
    // once the ball is stopped and the striker is on it, the charge goes to the BALL (that is what
    // "arrive as the strike leaves" means); until then, to the line the system has guessed
    // 2.5 m, not a stick length: a flyer who ends up on the striker's toes takes the ball on the
    // shin (a corner again) — the block is made on the line, a stride or two out
    const at = stopped && commit > 0.6 ? ball : target;
    moveTo(c, p, goalSideOf(at, goal, 2.5), 0.7 + 0.3 * commit, profile);
    if (dist(p.pos, ball) < 1.7 && theirCarrier !== null) c.cmds.push({ tick, kind: 'tackle', playerId: p.id, targetId: theirCarrier.id });
    if (dist(p.pos, ball) < (profile === 'low' ? 1.9 : 1.4) && c.ballSpeed > 3 && approaching(c, p)) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
  };
  /**
   * A man on the line or at a post: hold, take what comes at him, close the rebound after the shot.
   * `posture` is what his body does while he waits — a post man lying low with the stick along the
   * turf is the block's answer to the hit; an upright man with the stick up is its answer to the flick.
   */
  const hold = (p: PlayerView, spot: Vec2, posture?: Posture): void => {
    moveTo(c, p, firstShotGone && c.ballSpeed < 6 && dist(ball, goal) < 12 ? ball : spot, 1, posture);
    if (dist(p.pos, ball) < (posture === 'low' ? 1.9 : 1.4) && c.ballSpeed > 3 && approaching(c, p)) c.cmds.push({ tick, kind: 'trap', playerId: p.id });
    if (dist(p.pos, ball) < 1.7 && theirCarrier !== null && firstShotGone) c.cmds.push({ tick, kind: 'tackle', playerId: p.id, targetId: theirCarrier.id });
  };

  // ON the post, not inside the goal: a post man a stride inside the frame is a body in the
  // keeper's way, and the ball inside the post is the keeper's — the post covers the angle outside it.
  // The block is the exception: its posts step inside the frame and lie low, stick along the turf,
  // because filling the goal IS the system — the keeper takes what is lifted over them.
  const inFrame = sys.lead === 'none';
  // (2.3, not 2.1: a body at 2.1 still catches the ball a hand inside the post with its hip — and a
  // body stop of a goal-bound ball on the line is a stroke, which is what the posts play with the stick to avoid)
  const linePost = (side: number): Vec2 => ({ x: gx + end * 0.5, y: side * (inFrame ? 1.5 : 2.3) });
  const postPosture: Posture | undefined = inFrame ? 'low' : undefined;
  for (const p of outfield) {
    if (!castleIds.has(p.id)) continue;
    // The law: nobody leaves the line before the ball is played. (The AI could; it does not.)
    if (pending) { c.cmds.push({ tick, kind: 'move', playerId: p.id, dx: 0, dy: 0, effort: 0 }); continue; }
    if (p.id === castle.flyer?.id) {
      if (sys.lead === 'runner' || sys.lead === 'both') charge(p, chargeTarget(sys.runnerLine === 'split' ? 'trap' : sys.runnerLine), sys.chargeCommit);
      // keeperLeads: the flyer takes the goal while the keeper goes
      else if (sys.lead === 'gk') hold(p, { x: gx + end * 0.4, y: 0 });
      // block: the flyer is the first blocker — a few metres out on the ball line, stick up for the flick
      else hold(p, goalSideOf(spots.trap, goal, dist(spots.trap, goal) - 3.0), 'high');
    } else if (p.id === castle.second?.id) {
      // doubleCharge: the second man charges the slip side the system guessed — that body is the
      // free defender the system has spent. Otherwise he IS the free defender: on the slip line he
      // is told to cover, or at the top-of-D rebound/deflector spot.
      if (sys.lead === 'both') charge(p, sys.freeDefender === 'topOfD' ? spots.strike : slipSide(sys.freeDefender), sys.chargeCommit);
      // in a block nobody is spare: he is the second body in front of the keeper, off the flyer's shoulder
      else if (sys.lead === 'none') hold(p, { x: gx + end * 3.0, y: -injSide * 1.6 }, 'high');
      else if (sys.freeDefender === 'topOfD') hold(p, { x: gx + end * 6, y: injSide * 4.5 });
      else hold(p, goalSideOf(slipSide(sys.freeDefender), goal, 4));
    } else if (p.id === castle.postNear?.id) {
      hold(p, sys.posts === 'stepOnHit' && stopped ? goalSideOf(ball, goal, dist(ball, goal) - 3.5) : linePost(-injSide), postPosture);
    } else if (p.id === castle.postFar?.id) {
      hold(p, sys.posts === 'stepOnHit' && stopped ? goalSideOf(ball, goal, dist(ball, goal) - 3.5) : linePost(injSide), postPosture);
    }
  }
  // The halfway group is not decoration: the law only holds them beyond the centre line until the
  // injection. Once the ball is in play, the recoverers SPRINT back into the second-phase zone at
  // the top of our D (rebounds and slipped balls are theirs), while two stay wide around halfway as
  // the counter outlets — exactly where our clearance is aimed.
  // (`end` is the goal WE attack, so `end * 3` is three metres into the half we attack — beyond the
  // centre line, where the law puts them. The first version had the sign wrong and parked them in
  // our own half, which no umpire would allow.)
  const restSorted = [...rest].sort((a, b) => a.id - b.id);
  restSorted.forEach((p, i) => {
    if (pending) { moveTo(c, p, { x: end * 3, y: clamp(-18 + i * 9, -20, 20) }, 0.6); return; }
    if (i < 2) moveTo(c, p, { x: end * 2, y: (i === 0 ? -1 : 1) * 20 }, 0.7); // outlets for the clear
    else moveTo(c, p, { x: -end * (CIRCLE_TOP_X - 6), y: (i - 3) * 8 }, 0.95); // recoverers join the defence
  });
  // fallback: a loose ball in our circle after the injection → nearest defender clears it
  if (!pending) {
    if (carrier?.team === team.team) { issue(c, carrier, bestOption(c, carrier, false)); }
    else if (!carrier && c.ballSpeed < 3) { const ch = nearestTo(outfield, ball); if (ch) moveTo(c, ch, ball, 1); }
    else if (carrier) { const ch = nearestTo(outfield, ball); if (ch && dist(ch.pos, ball) < 1.7 && c.rng.chance(0.4)) c.cmds.push({ tick, kind: 'tackle', playerId: ch.id, targetId: carrier.id }); }
  }
  if (c.keeperMine) pcKeeper(c, c.keeperMine, sys, pending, spots.trap, firstShotGone);
}

/**
 * The keeper's set at a corner (§5): on his line until the strike, or — keeperLeads — out to the
 * striking point behind the flyer the moment the ball is played, low, to smother the hit and the
 * close deflection. What he gives up by going is the lift over him and the empty goal behind.
 */
function pcKeeper(c: Ctx, gk: PlayerView, sys: PcDefenceSystem, pending: boolean, trapSpot: Vec2, firstShotGone: boolean): void {
  const { end, ball, tick } = c;
  const gx = -end * HALF_LENGTH;
  const goal = { x: gx, y: 0 };
  if (firstShotGone || pending) {
    // rebound phase and the wait: the ordinary keeper model (set on the line, react, clear)
    if (pending) moveTo(c, gk, { x: gx + end * 0.5, y: clamp(ball.y * 0.1, -0.8, 0.8) }, 0.8);
    else goalkeeper(c, gk, null);
    return;
  }
  if (sys.gkSet === 'advanced') moveTo(c, gk, goalSideOf(trapSpot, goal, dist(trapSpot, goal) - 4.5), 1, 'low');
  else moveTo(c, gk, { x: gx + end * 0.6, y: clamp(ball.y * 0.15, -1, 1) }, 0.9);
  // Save: ball moving towards our goal and coming within reach → trap (pads/stick)
  const towardGoal = end * c.ballVel.x < -3;
  if (towardGoal && dist(gk.pos, ball) < 2.6 && c.ballZ < 2.0) c.cmds.push({ tick, kind: 'trap', playerId: gk.id });
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
  // Rotation policy (Phase 7): stamina is in the view. Rotate the most tired outfield player below the
  // tactics threshold when a clearly fresher same-role (else any outfield) player sits on the bench.
  const outfield = mine.filter((p) => !p.isGoalkeeper && !leaving.has(p.id));
  if (bench.length === 0 || outfield.length === 0) return;
  const tired = [...outfield].filter((p) => p.stamina < team.tactics.rotateBelowStamina).sort((a, b) => a.stamina - b.stamina || a.id - b.id)[0];
  if (!tired) return;
  const role = c.slotOf(tired.id).role;
  const fresh = bench.filter((p) => !p.isGoalkeeper && p.stamina > tired.stamina + 0.2).sort((a, b) => b.stamina - a.stamina || a.id - b.id);
  const inn = fresh.find((p) => c.slotOf(p.id).role === role) ?? fresh[0];
  if (inn) leaving.set(tired.id, inn.id);
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

function moveTo(c: Ctx, p: PlayerView, target: Vec2, effort: Scalar, posture?: Posture): void {
  const dx = target.x - p.pos.x, dy = target.y - p.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  // brake before the target: stopping distance at current speed (decel ≈ 7 m/s²) plus a stride
  const v = Math.sqrt(p.vel.x ** 2 + p.vel.y ** 2);
  const brake = (v * v) / 14 + 0.6;
  const e = d < 0.6 ? 0 : d < brake ? Math.min(effort, 0.25) : d < 3 ? effort * 0.6 : effort;
  const cmd: Extract<Command, { kind: 'move' }> = { tick: c.tick, kind: 'move', playerId: p.id, dx, dy, effort: e };
  if (posture !== undefined) cmd.posture = posture;
  c.cmds.push(cmd);
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
