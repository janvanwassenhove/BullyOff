/**
 * Team tactical instructions (BRIEF §8 Phase 3) and formation slots. These are
 * the knobs the coach turns (Phase 7 UI); the AI reads them every decision.
 */
import { HALF_LENGTH, clamp, type Scalar, type Vec2 } from '@bullyoff/shared';
import type { Role } from '../player/attributes.js';

export type PcVariant = 'dragFlick' | 'lowHit' | 'slipRight' | 'slipLeft' | 'deflection';
export type BuildUp = 'direct' | 'possession' | 'wide';

/** Coach-chosen penalty-corner battery (Phase 7 PC designer). Players not on the pitch at the award are ignored and the AI picks. */
export interface PcBattery { injector?: number; trapper?: number; striker?: number }

export interface TeamTactics {
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
  pressHeight: 0.55, defensiveLine: 0.45, buildUp: 'possession', pcVariant: 'dragFlick', tempo: 0.5, rotateBelowStamina: 0.7,
};

/** Formation slot in the team's own frame: x' metres from own goal line (0..91.4), y across. */
export interface Slot { role: Role; xp: Scalar; y: Scalar; }

/** 4-3-3 with a sweeping GK. Index i ↔ the i-th player of the team in id order. */
export const FORMATION_433: Slot[] = [
  { role: 'GK', xp: 3, y: 0 },
  { role: 'DEF', xp: 18, y: -17 }, { role: 'DEF', xp: 15, y: -6 }, { role: 'DEF', xp: 15, y: 6 }, { role: 'DEF', xp: 18, y: 17 },
  { role: 'MID', xp: 33, y: -12 }, { role: 'MID', xp: 30, y: 0 }, { role: 'MID', xp: 33, y: 12 },
  { role: 'FWD', xp: 48, y: -15 }, { role: 'FWD', xp: 52, y: 0 }, { role: 'FWD', xp: 48, y: 15 },
];

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
      // forwards work the top of the D and the posts, not the corner flags
      const target = ballXp > 55 ? 76 : clamp(ballXp + 18, 45, 76);
      xp = Math.max(xp, target);
      y = clamp(slot.y * 0.75, -13, 13);
    }
    if (slot.role === 'DEF') xp = Math.min(xp, ballXp - 12);
    // squeeze 25 % towards the ball's side
    y = y * 0.85 + ballY * 0.25 * (t.buildUp === 'wide' ? 0.6 : 1);
  } else {
    // defensive block: line height from tactics, compress towards the ball
    const line = 14 + t.defensiveLine * 30; // 14..44 m from own goal
    const drop = clamp(ballXp - 40, -20, 15) * 0.6;
    xp = clamp(slot.xp - (60 - Math.min(ballXp, 60)) * 0.35 + drop, slot.role === 'DEF' ? line - 4 : line, HALF_LENGTH * 2 - 10);
    if (slot.role === 'FWD') xp = Math.min(xp, ballXp + 8);
    y = y * 0.7 + ballY * 0.35;
  }
  return slotToPitch({ xp, y }, end);
}
