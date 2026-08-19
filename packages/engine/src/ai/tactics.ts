/**
 * Team tactical instructions (BRIEF §8 Phase 3) and formation slots. These are
 * the knobs the coach turns (Phase 7 UI); the AI reads them every decision.
 */
import { HALF_LENGTH, clamp, type Scalar, type Vec2 } from '@bullyoff/shared';
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
}

export const DEFAULT_TACTICS: TeamTactics = {
  formation: '4-3-3', press: 'half', mentality: 'balanced',
  pressHeight: 0.55, defensiveLine: 0.45, buildUp: 'possession', pcVariant: 'dragFlick', tempo: 0.5, rotateBelowStamina: 0.7,
};

/** Numeric press height per pressing system (where the first defender engages, 0..1 of the pitch). */
export const PRESS_HEIGHT: Record<PressId, Scalar> = { full: 0.9, half: 0.55, split: 0.6, zone: 0.25 };
/** Defensive line per mentality (0 = edge of own D, 1 = halfway). */
export const MENTALITY_LINE: Record<Mentality, Scalar> = { defensive: 0.25, balanced: 0.45, attacking: 0.65 };

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
      const target = ballXp > 55 ? 76 : clamp(ballXp + lead, 45, 76);
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
    y = y * 0.7 + ballY * (t.press === 'split' ? 0.55 : 0.35);
  }
  return slotToPitch({ xp, y }, end);
}
