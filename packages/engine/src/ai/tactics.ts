/**
 * Team tactical instructions (BRIEF §8 Phase 3) and formation slots. These are
 * the knobs the coach turns (Phase 7 UI); the AI reads them every decision.
 */
import { HALF_LENGTH, clamp, dmath, type Radians, type Scalar, type Vec2 } from '@bullyoff/shared';
import type { Role } from '../player/attributes.js';

export type PcVariant = 'dragFlick' | 'lowHit' | 'slipRight' | 'slipLeft' | 'deflection';
/** Build-up: through the middle (possession), direct/over the top (long balls, aerials), via the flanks (wide). */
export type BuildUp = 'direct' | 'possession' | 'wide';
/** Playing systems a Belgian coach names on the board (GK + 10). */
export type FormationId = '4-3-3' | '3-4-3' | '4-4-2' | '5-3-2' | '3-3-3-1' | '4-2-3-1';
/**
 * Pressing systems: full = full-court press from the opponents' backline; half = half-court press (engage at the
 * halfway line); split = split press (first defender shepherds play to one side, the rest shift over);
 * zone = deep zonal block around own 23 m.
 */
export type PressId = 'full' | 'half' | 'split' | 'zone';
/** Mentality: how high the block sits and how many commit forward. */
export type Mentality = 'defensive' | 'balanced' | 'attacking';

/** Coach-chosen penalty-corner battery (Phase 7 PC designer). Players not on the pitch at the award are ignored and the AI picks. */
export interface PcBattery { injector?: number; trapper?: number; striker?: number }

export interface TeamTactics {
  /** Playing system. Slots come from FORMATIONS[formation]. */
  formation: FormationId;
  /** Pressing system; pressHeight is derived from it (PRESS_HEIGHT) unless set explicitly. */
  press: PressId;
  mentality: Mentality;
  /** 0 = deep block (press only in own 23 m), 1 = full press in the opponents' 23 m. */
  pressHeight: Scalar;
  /** 0 = defensive line on the edge of own circle, 1 = on the halfway line. */
  defensiveLine: Scalar;
  buildUp: BuildUp;
  /** Preferred PC variant; the AI rotates when it has been read (Phase 6+). */
  pcVariant: PcVariant;
  /** 0 = patient, 1 = quick tempo (fewer touches, earlier passes/shots). */
  tempo: Scalar;
  /** Substitute a player whose stamina falls below this if a fresh same-role player is on the bench. */
  rotateBelowStamina: Scalar;
  /** Preferred PC roles (ids). Optional; unset → the AI chooses by attributes. */
  pcBattery?: PcBattery;
  /** How the five behind the line defend a penalty corner (§5). The coach's call, like the battery. */
  pcDefence: PcDefenceId;
  /**
   * The first runner's body height, overriding the system's default: `low` blocks the hit and is
   * flicked over, `high` blocks the flick and the low hit goes under. Unset = the system's own value.
   */
  pcRunnerProfile?: RunnerProfile;
  /** Preferred way into the circle (§7). Unset = read the picture and pick the pattern with the best value. */
  entry?: EntryPatternId;
}

export const DEFAULT_TACTICS: TeamTactics = {
  formation: '4-3-3', press: 'half', mentality: 'balanced',
  pressHeight: 0.55, defensiveLine: 0.45, buildUp: 'possession', pcVariant: 'dragFlick', tempo: 0.5, rotateBelowStamina: 0.7,
  pcDefence: 'runnerLeads',
};

/**
 * A pressing system is a record of values, never a branch (CLAUDE.md rule 5 applies to systems too:
 * `if (press === 'full')` is the same mistake as branching on the profile id). Before Phase 11 the four systems
 * differed only by `pressHeight`, so they played identical hockey at four heights — a zone block is
 * not a low full press, because in a zone block *nobody chases*. These are the values that make them
 * different sports. See `docs/design/hockey-systems.md` §3.
 */

/** Which line of the team a slot belongs to. */
export type Line = 'front' | 'mid' | 'back';
/** Channels across the pitch in the team's own frame: -2 left … +2 right. */
export type Channel = -2 | -1 | 0 | 1 | 2;
/** Which way the first defender shows the carrier. `toReverse` is real handedness — see jockeySpot. */
export type Shepherd = 'toLine' | 'toInside' | 'toReverse';

export interface PressSystem {
  /** Which line steps first. */
  initiator: Line;
  /** How many players go to the ball, the presser included. `1` is what makes a zone block a block. */
  commit: 1 | 2 | 3;
  /** What everyone who is not on the ball does. */
  scheme: 'manToMan' | 'zonal' | 'hybrid';
  /**
   * Is there a spare defender behind the line? A full-court press has none — that is the bet:
   * one overhead over the top and you are numerically short goal-side.
   */
  freeMan: boolean;
  /** Forwards left high who do not defend. In a deep block they are the reason for the block. */
  restBreak: 0 | 1 | 2;
  /** 0 = hold width, 1 = slide the whole block into the ball's channel. */
  lateralShift: Scalar;
  /** Where we try to win it. */
  trap: 'touchline' | 'centre' | 'none';
  /** Which way the first defender shows the carrier. */
  shepherd: Shepherd;
}

/**
 * The four systems. `pressHeight` (above) still owns where we engage — that part already worked and
 * moving it would blur what this change is responsible for; these values own *who does what*.
 */
export const PRESS_SYSTEMS: Record<PressId, PressSystem> = {
  // Man-to-man from their backline. Nobody spare, nobody rests: you press their outlet to win the
  // ball in their 23, where a turnover is a circle entry, and you accept being 3-v-2 down if it breaks.
  full: { initiator: 'front', commit: 2, scheme: 'manToMan', freeMan: false, restBreak: 0, lateralShift: 0.40, trap: 'centre', shepherd: 'toLine' },
  // The block sets around halfway, the two nearest options are picked up, everyone behind holds zone.
  half: { initiator: 'mid', commit: 2, scheme: 'hybrid', freeMan: true, restBreak: 1, lateralShift: 0.50, trap: 'touchline', shepherd: 'toReverse' },
  // The first defender closes from the inside shoulder and the whole block slides across; the far
  // side is abandoned on purpose. You win it in the traffic on the touchline, you lose it to a switch.
  split: { initiator: 'front', commit: 2, scheme: 'hybrid', freeMan: true, restBreak: 1, lateralShift: 0.85, trap: 'touchline', shepherd: 'toLine' },
  // Deep block. `commit: 1` is the defining value: only the channel owner engages and nobody else
  // moves towards the ball. Two forwards stay high — they are what the conceded possession buys.
  zone: { initiator: 'back', commit: 1, scheme: 'zonal', freeMan: true, restBreak: 2, lateralShift: 0.60, trap: 'none', shepherd: 'toReverse' },
};

// ── penalty-corner defence (docs/design/hockey-systems.md §5) ───────────────────

export type PcDefenceId = 'runnerLeads' | 'keeperLeads' | 'doubleCharge' | 'block';
/**
 * What the first runner's body does on the way out. He cannot do both: lying low with the stick
 * along the turf blocks the hit and is flicked over; running upright with the stick up blocks the
 * rising flick and the low hit goes under or beside him. This is the second of the two things a
 * flyer guesses (the first is his line), and it is what an attacking coach reads.
 */
export type RunnerProfile = 'low' | 'high';

export interface PcDefenceSystem {
  /** Who attacks the striking point: the flyer, the keeper, two chargers, or nobody. */
  lead: 'runner' | 'gk' | 'both' | 'none';
  /** The flyer's LINE — the first of the two things he guesses. `split` is the two-runner version. */
  runnerLine: 'trap' | 'striker' | 'split';
  /** 0..1 how hard he commits: effort out, and how far past the striking point he keeps going. */
  chargeCommit: Scalar;
  /** The flyer's body height — the second guess (see RunnerProfile). */
  runnerProfile: RunnerProfile;
  /** Posts hold until the strike (and then close on the rebound), or step at the hit as the ball is stopped. */
  posts: 'hold' | 'stepOnHit';
  /**
   * The fifth man's job: cover a slip side, or the deflector/rebound at the top of the D. In a
   * doubleCharge he IS the second charger and this is the side he guesses.
   */
  freeDefender: 'slipLeft' | 'slipRight' | 'topOfD';
  /** The keeper's set: on his line, or out to the striking point behind the flyer. */
  gkSet: 'line' | 'advanced';
}

/**
 * The four running-out systems. All four get played at Belgian club level (confirmed 2026-08-22),
 * and the point is that none of them dominates — each has a variant it loses to, which is what makes
 * the choice a coaching decision. The magnitudes are calibration's job; the *signs* are asserted in
 * ai/pcDefence.test.ts as relational claims (the counter matrix in §5):
 *
 *   · runnerLeads  — the flyer charges the trap spot to arrive as the strike leaves. Beats the straight
 *                    flick by pressure; beaten by the slip (he is committed to a line the ball no
 *                    longer travels) and by anything played where the charge is not.
 *   · keeperLeads  — the keeper comes out to the striking point and the flyer drops onto the line to
 *                    take the goal. Beats the low hit and the close deflection; beaten by the lift
 *                    over him and by any rebound, because the goal is guarded by an outfielder.
 *   · doubleCharge — two chargers, one at the trapper and one on the slip side the fifth man guesses.
 *                    Kills slips and hits; beaten by the straight flick over two bodies committed low.
 *   · block        — nobody charges; five bodies fill the goal and the near angles. Concedes the clean
 *                    strike but nothing catastrophic. What you play with slow runners, against an elite
 *                    flicker, or to protect a lead — and the honest fallback when nobody can run.
 */
export const PC_DEFENCES: Record<PcDefenceId, PcDefenceSystem> = {
  runnerLeads:  { lead: 'runner', runnerLine: 'trap',    chargeCommit: 0.9,  runnerProfile: 'high', posts: 'hold', freeDefender: 'topOfD',    gkSet: 'line' },
  keeperLeads:  { lead: 'gk',     runnerLine: 'striker', chargeCommit: 0.5,  runnerProfile: 'low',  posts: 'hold', freeDefender: 'topOfD',    gkSet: 'advanced' },
  doubleCharge: { lead: 'both',   runnerLine: 'split',   chargeCommit: 0.85, runnerProfile: 'low',  posts: 'hold', freeDefender: 'slipRight', gkSet: 'line' },
  block:        { lead: 'none',   runnerLine: 'trap',    chargeCommit: 0,    runnerProfile: 'high', posts: 'hold', freeDefender: 'topOfD',    gkSet: 'line' },
};

/**
 * Not every club can play every system (§5). The choice is gated on whether the players exist, the
 * way it is on a real touchline: a flyer needs pace, acceleration and the aggression to actually go;
 * an advancing keeper needs the one-on-one and the read, or he is caught halfway — the worst outcome
 * on the list; a double charge costs a body somewhere else, so it wants two flyers. Block needs
 * nothing, which is why it is the right default for a weak side.
 */
export function pcDefenceFor(outfield: readonly { physical: { pace: number; acceleration: number }; mental: { aggression: number; discipline: number } }[], keeper: { goalkeeper: { oneOnOne: number; pcReading: number } } | undefined): PcDefenceId {
  const flyers = outfield.map((a) => (a.physical.pace + a.physical.acceleration) / 2 + 0.5 * (a.mental.aggression - a.mental.discipline)).sort((x, y) => y - x);
  const best = flyers[0] ?? 0, second = flyers[1] ?? 0;
  const gkRead = keeper ? (keeper.goalkeeper.oneOnOne + keeper.goalkeeper.pcReading) / 2 : 0;
  if (gkRead >= 14 && gkRead > best) return 'keeperLeads';
  if (best >= 15 && second >= 13) return 'doubleCharge';
  if (best >= 12) return 'runnerLeads';
  return 'block';
}

// ── circle entry patterns (docs/design/hockey-systems.md §7) ─────────────────────

export type EntryPatternId = 'baseline' | 'switchAndSlip' | 'deepDiagonal' | 'drawTheFoot' | 'overload';

/** Where a pattern's runner goes, named — the geometry is in `entryPocket`. */
export type Pocket = 'spot' | 'farPost' | 'nearPost' | 'weakSide' | 'rebound';
/** What the picture must show for the pattern to be on. Scored 0..1 by the AI, never branched on. */
export type EntryTrigger = 'ballDeepWide' | 'ballTopCentral' | 'ballWideEarly' | 'defenderOnLine' | 'blockShifted';

export interface EntryPattern {
  /** Who makes the run: the centre forward, the winger on the far side, the near winger, or the most advanced midfielder. */
  runner: 'cf' | 'farWinger' | 'nearWinger' | 'mid';
  /** The pocket he attacks. */
  pocket: Pocket;
  /** What the pattern needs to see. */
  trigger: EntryTrigger;
  /**
   * Whether the entry ball is a pass to the pocket (true) or the carrier's own action — drawing the
   * foot is a shot at a defender's feet, so its runner is only there for the rebound.
   */
  passToPocket: boolean;
}

/**
 * The attacking twin of the press systems, as data. Each names a runner, a pocket and a trigger; the
 * AI scores every pattern against the picture and the value grid and commits to the best one for a
 * few seconds, and the runner leaves BEFORE the pass (adaptive-play.md layer D4) — a pocket reached
 * after the ball is a pocket that never existed.
 *
 *   · baseline      — beat the back on the outside, get to the backline, pull back to the spot where
 *                     the runner arrives. The largest goal source in the modern game.
 *   · switchAndSlip — circulate across the top of the D to drag the block, then slip in behind the
 *                     collapsing defenders to the far post.
 *   · deepDiagonal  — the early ball from wide into the far-post pocket for a deflection.
 *   · drawTheFoot   — a firm ball at the feet of the defender on the line; the runner is at the rebound.
 *   · overload      — take the free side after the opponent's split press has slid across.
 */
export const ENTRY_PATTERNS: Record<EntryPatternId, EntryPattern> = {
  baseline:      { runner: 'cf',         pocket: 'spot',     trigger: 'ballDeepWide',   passToPocket: true },
  switchAndSlip: { runner: 'farWinger',  pocket: 'farPost',  trigger: 'ballTopCentral', passToPocket: true },
  deepDiagonal:  { runner: 'farWinger',  pocket: 'farPost',  trigger: 'ballWideEarly',  passToPocket: true },
  drawTheFoot:   { runner: 'nearWinger', pocket: 'rebound',  trigger: 'defenderOnLine', passToPocket: false },
  overload:      { runner: 'mid',        pocket: 'weakSide', trigger: 'blockShifted',   passToPocket: true },
};

/**
 * Where a pocket is, in the attacking team's own frame: metres in from the goal being attacked, and
 * y with `side` = the sign of the ball's y in that frame. The spot strip is where pull-backs are
 * finished; the far post is where slips and deflections arrive; the weak side is the top of the D
 * on the side a shifted block has left.
 */
export function entryPocket(pocket: Pocket, side: 1 | -1): { fromGoal: Scalar; y: Scalar } {
  switch (pocket) {
    case 'spot':     return { fromGoal: 7.0, y: side * 1.5 };
    case 'farPost':  return { fromGoal: 5.5, y: -side * 3.0 };
    case 'nearPost': return { fromGoal: 5.0, y: side * 4.0 };
    case 'weakSide': return { fromGoal: 13.5, y: -side * 9.0 };
    case 'rebound':  return { fromGoal: 8.0, y: side * 2.5 };
  }
}

/** Channel of a y coordinate in the team's own frame (the pitch is 55 m wide; five lanes of 11 m). */
export function channelOf(y: Scalar): Channel {
  const c = Math.round(clamp(y / 11, -2, 2));
  return (c < -2 ? -2 : c > 2 ? 2 : c) as Channel;
}

/** Which line a formation slot sits on (own-frame metres from our own goal line). */
export function lineOf(xp: Scalar): Line {
  return xp < 24 ? 'back' : xp < 44 ? 'mid' : 'front';
}

/** Numeric press height per pressing system (where the first defender engages, 0..1 of the pitch). */
export const PRESS_HEIGHT: Record<PressId, Scalar> = { full: 0.9, half: 0.55, split: 0.6, zone: 0.25 };
/** Defensive line per mentality (0 = edge of own D, 1 = halfway). */
export const MENTALITY_LINE: Record<Mentality, Scalar> = { defensive: 0.25, balanced: 0.45, attacking: 0.65 };

/**
 * Where a system puts the two lines, in metres from our own backline. The AI reads these and so does
 * the tactics board: a press is a place on the pitch, and both have to mean the same place.
 */
export const pressLineM = (pressHeight: Scalar): Scalar => 22 + pressHeight * 55;
export const backLineM = (defensiveLine: Scalar): Scalar => 14 + defensiveLine * 30;

/**
 * Where the first defender stands to jockey a carrier (Phase 11b, §6.1). A pressing angle is a
 * *place relative to the man*, not a distance: you take away one side and leave the other open.
 *
 *  · `toLine`     — square him up and show him the touchline; the block slides behind.
 *  · `toInside`   — close from the inside shoulder so his only way forward is wide.
 *  · `toReverse`  — the hockey-specific one: close his OPEN STICK channel, so the only way forward
 *                   is on his reverse, where he carries, eliminates and strikes worse. Every stick is
 *                   right-handed, so that channel is his right — and this is why a hockey pressing
 *                   angle is not a football pressing angle.
 *
 * `end` is the goal the DEFENDING side attacks (so −end is the goal it defends, and standing at
 * `ball − end` is standing goal-side); `inside` is +1/−1 towards the middle of the pitch.
 */
export function jockeySpot(shepherd: Shepherd, ball: Vec2, carrierHeading: Radians, end: 1 | -1, inside: 1 | -1, trapTouchline: boolean): Vec2 {
  if (shepherd === 'toReverse') {
    // goal-side of him AND on his forehand shoulder: the ball can only go left, onto his reverse
    const open = { x: dmath.sin(carrierHeading), y: -dmath.cos(carrierHeading) };
    return { x: ball.x - end * 1.1 + open.x * 1.3, y: ball.y + open.y * 1.3 };
  }
  if (shepherd === 'toInside' || trapTouchline) return { x: ball.x - end * 1.6, y: ball.y + inside * 1.4 };
  return { x: ball.x - end * 2.0, y: ball.y };
}

/** Apply a preset choice (press/mentality) to the numeric knobs — what the UI and the AI both use. */
export function presetPatch(p: Partial<TeamTactics>): Partial<TeamTactics> {
  const out: Partial<TeamTactics> = { ...p };
  if (p.press && p.pressHeight === undefined) out.pressHeight = PRESS_HEIGHT[p.press];
  if (p.mentality && p.defensiveLine === undefined) out.defensiveLine = MENTALITY_LINE[p.mentality];
  return out;
}

/** Formation slot in the team's own frame: x' metres from own goal line (0..91.4), y across. */
export interface Slot { role: Role; xp: Scalar; y: Scalar; }

/** 4-3-3 with a sweeping GK. Index i ↔ the i-th player of the team in id order. */
export const FORMATION_433: Slot[] = [
  { role: 'GK', xp: 3, y: 0 },
  { role: 'DEF', xp: 18, y: -17 }, { role: 'DEF', xp: 15, y: -6 }, { role: 'DEF', xp: 15, y: 6 }, { role: 'DEF', xp: 18, y: 17 },
  { role: 'MID', xp: 33, y: -12 }, { role: 'MID', xp: 30, y: 0 }, { role: 'MID', xp: 33, y: 12 },
  { role: 'FWD', xp: 48, y: -15 }, { role: 'FWD', xp: 52, y: 0 }, { role: 'FWD', xp: 48, y: 15 },
];

/** Every system on the board. Slot order: GK, defenders (left→right), midfield, forwards. */
export const FORMATIONS: Record<FormationId, Slot[]> = {
  '4-3-3': FORMATION_433,
  '3-4-3': [
    { role: 'GK', xp: 3, y: 0 },
    { role: 'DEF', xp: 16, y: -12 }, { role: 'DEF', xp: 14, y: 0 }, { role: 'DEF', xp: 16, y: 12 },
    { role: 'MID', xp: 32, y: -20 }, { role: 'MID', xp: 29, y: -6 }, { role: 'MID', xp: 29, y: 6 }, { role: 'MID', xp: 32, y: 20 },
    { role: 'FWD', xp: 49, y: -14 }, { role: 'FWD', xp: 53, y: 0 }, { role: 'FWD', xp: 49, y: 14 },
  ],
  '4-4-2': [
    { role: 'GK', xp: 3, y: 0 },
    { role: 'DEF', xp: 18, y: -17 }, { role: 'DEF', xp: 15, y: -6 }, { role: 'DEF', xp: 15, y: 6 }, { role: 'DEF', xp: 18, y: 17 },
    { role: 'MID', xp: 34, y: -19 }, { role: 'MID', xp: 30, y: -6 }, { role: 'MID', xp: 30, y: 6 }, { role: 'MID', xp: 34, y: 19 },
    { role: 'FWD', xp: 50, y: -7 }, { role: 'FWD', xp: 50, y: 7 },
  ],
  '5-3-2': [
    { role: 'GK', xp: 3, y: 0 },
    { role: 'DEF', xp: 20, y: -20 }, { role: 'DEF', xp: 15, y: -10 }, { role: 'DEF', xp: 13, y: 0 }, { role: 'DEF', xp: 15, y: 10 }, { role: 'DEF', xp: 20, y: 20 },
    { role: 'MID', xp: 33, y: -12 }, { role: 'MID', xp: 31, y: 0 }, { role: 'MID', xp: 33, y: 12 },
    { role: 'FWD', xp: 50, y: -8 }, { role: 'FWD', xp: 50, y: 8 },
  ],
  '3-3-3-1': [
    { role: 'GK', xp: 3, y: 0 },
    { role: 'DEF', xp: 16, y: -13 }, { role: 'DEF', xp: 14, y: 0 }, { role: 'DEF', xp: 16, y: 13 },
    { role: 'MID', xp: 29, y: -15 }, { role: 'MID', xp: 27, y: 0 }, { role: 'MID', xp: 29, y: 15 },
    { role: 'MID', xp: 42, y: -16 }, { role: 'MID', xp: 40, y: 0 }, { role: 'MID', xp: 42, y: 16 },
    { role: 'FWD', xp: 55, y: 0 },
  ],
  '4-2-3-1': [
    { role: 'GK', xp: 3, y: 0 },
    { role: 'DEF', xp: 18, y: -17 }, { role: 'DEF', xp: 15, y: -6 }, { role: 'DEF', xp: 15, y: 6 }, { role: 'DEF', xp: 18, y: 17 },
    { role: 'MID', xp: 28, y: -7 }, { role: 'MID', xp: 28, y: 7 },
    { role: 'MID', xp: 42, y: -17 }, { role: 'MID', xp: 41, y: 0 }, { role: 'MID', xp: 42, y: 17 },
    { role: 'FWD', xp: 55, y: 0 },
  ],
};

/**
 * Assign on-pitch players to a formation's slots: keepers to GK, then each slot takes the best unassigned
 * player of its role (by id order — deterministic), else the best remaining. Returns id → slot index.
 */
export function assignSlots(formation: FormationId, players: readonly { id: number; role: Role; isGoalkeeper: boolean }[]): Map<number, number> {
  const slots = FORMATIONS[formation];
  const out = new Map<number, number>();
  const free = [...players].sort((a, b) => a.id - b.id);
  const take = (pred: (p: { id: number; role: Role; isGoalkeeper: boolean }) => boolean): { id: number } | undefined => { const i = free.findIndex(pred); return i >= 0 ? free.splice(i, 1)[0] : undefined; };
  slots.forEach((s, i) => {
    const p = s.role === 'GK' ? (take((q) => q.isGoalkeeper) ?? take((q) => q.role === 'GK')) : take((q) => q.role === s.role && !q.isGoalkeeper);
    if (p) out.set(p.id, i);
  });
  // leftovers (role mismatch): fill the remaining slots in order
  slots.forEach((_, i) => { if (![...out.values()].includes(i)) { const p = free.shift(); if (p) out.set(p.id, i); } });
  return out;
}

/** Convert a slot (own frame) to pitch coordinates for a team attacking `end`. */
export function slotToPitch(s: { xp: Scalar; y: Scalar }, end: 1 | -1): Vec2 {
  return { x: end * (s.xp - HALF_LENGTH), y: end * s.y };
}

/**
 * Where a player *wants* to be given the ball, possession and tactics — the
 * team's shape. Attack: push up and squeeze towards the ball side; forwards make
 * for the top of the D. Defence: drop to the defensive line, compress laterally
 * towards the ball, stay goal-side.
 */
export function shapeTarget(slot: Slot, end: 1 | -1, ballXp: Scalar, ballY: Scalar, inPossession: boolean, t: TeamTactics): Vec2 {
  let xp = slot.xp;
  let y = slot.y;
  if (inPossession) {
    // team pushes up with the ball, forwards ahead of it; the whole block moves with the ball's x' (capped)
    const push = clamp((ballXp - 30) * 0.5, -10, 22);
    xp = clamp(slot.xp + push, 3, HALF_LENGTH * 2 - 6);
    if (slot.role === 'FWD') {
      // forwards work the top of the D and the posts, not the corner flags; an attacking mentality commits them earlier
      const lead = t.mentality === 'attacking' ? 22 : t.mentality === 'defensive' ? 14 : 18;
      // 78, not 76: the top of the D is 76.8, and a forward "at the top" is a forward OUTSIDE the
      // circle — the pocket he must occupy to receive the entry ball is a stride inside it
      const target = ballXp > 55 ? 78 : clamp(ballXp + lead, 45, 78);
      xp = Math.max(xp, target);
      y = clamp(slot.y * 0.75, -13, 13);
    }
    // defenders stay behind the ball but OUT of their own circle: the outlet shape is the 23 m line, backs wide,
    // centre backs split either side of the D — a back pass received inside your own D is a turnover waiting to happen
    if (slot.role === 'DEF') { xp = clamp(Math.min(xp, ballXp - 12), 17, HALF_LENGTH * 2 - 6); if (ballXp < 32) y = slot.y * 1.35; }
    // squeeze 25 % towards the ball's side
    y = y * 0.85 + ballY * 0.25 * (t.buildUp === 'wide' ? 0.6 : 1);
  } else {
    // defensive block: line height from tactics, compress towards the ball
    const line = 14 + t.defensiveLine * 30; // 14..44 m from own goal
    const drop = clamp(ballXp - 40, -20, 15) * 0.6;
    xp = clamp(slot.xp - (60 - Math.min(ballXp, 60)) * 0.35 + drop, slot.role === 'DEF' ? line - 4 : line, HALF_LENGTH * 2 - 10);
    if (slot.role === 'FWD') xp = Math.min(xp, ballXp + 8);
    // The ball in our 23: the line does not hold at the top of the D — backs collapse goal-side of the ball onto the
    // posts/spot, midfielders sit on the top of the D. Bodies in the D are what shots hit (and what PCs are made of).
    if (ballXp < 24 && slot.role === 'DEF' && Math.abs(slot.y) < 10) {
      // the centre backs get ON the ball–goal line: the near one 3.5 m goal-side (the body a shot hits — feet = PC),
      // the far one 6.5 m goal-side and a stride across, covering the post
      const d = Math.sqrt(ballXp * ballXp + ballY * ballY) || 1;
      const near = Math.sign(slot.y || 1) === Math.sign(ballY || 1);
      const back = near ? 3.5 : 6.5;
      const t = clamp(1 - back / d, 0.2, 1);
      xp = clamp(ballXp * t, 4, 20); y = ballY * t + (near ? 0 : (ballY >= 0 ? -2.2 : 2.2));
    }
    // split press: the whole block shifts across to the ball side (the far side is left open on purpose)
    // How far the whole block slides into the ball's channel. A split press concedes the far side on
    // purpose (0.85): the shape stops holding its width and overloads the ball side. A zone block
    // shifts less and keeps its lanes. This has to be a real displacement or the value is decoration.
    const shift = PRESS_SYSTEMS[t.press].lateralShift;
    y = y * (1 - 0.5 * shift) + ballY * (0.15 + 0.6 * shift);
  }
  return slotToPitch({ xp, y }, end);
}
