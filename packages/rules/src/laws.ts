/**
 * The laws of the game as DATA. Every number here is a rule of hockey (FIH Rules
 * of Hockey, outdoor) or a league-specific setting, never a physics tunable.
 * Where the current wording is ambiguous or league-dependent, the choice is
 * flagged `PROVISIONAL` and listed in KICKOFF.md for Jan.
 */
import type { Metres, Scalar } from '@bullyoff/shared';

export const TICK_HZ = 20;
const MIN = 60 * TICK_HZ;
const SEC = TICK_HZ;

export interface Laws {
  /** Playing time per quarter, ticks. FIH: 15 min. */
  quarterTicks: number;
  /** Break durations after Q1, Q2 (half-time), Q3 — in *sim ticks*; playing clock is stopped. FIH: 2 / 10 / 2 min real time. */
  breakTicks: [number, number, number];
  /** Sim ticks the engine idles while a restart is set up (clock stopped): centre pass after goal, PC, PS. */
  setupTicks: { centrePass: number; freeHit: number; penaltyCorner: number; penaltyStroke: number };
  /** Opponents must be at least this far from the ball at a free hit / restart. FIH: 5 m. */
  freeHitDistance: Metres;
  /**
   * PROVISIONAL — free hit inside the attacking 23 m: the ball must travel this
   * far (or be touched by another player) before it may enter the circle.
   */
  freeHit23TravelDistance: Metres;
  /** Long corner: attacking free hit taken on the 23 m line, in line with where the ball crossed. */
  longCornerOn23: boolean;
  /** Ball over the backline off an attacker: defence free hit this far out from the backline. FIH: up to 15 m. */
  hitOutDistance: Metres;
  /** PC: ball on the backline this far from the nearer post. FIH: 10 m. */
  pcInjectDistance: Metres;
  /** PC: max defenders behind the goal/backline (incl. GK). FIH: 5. Rest beyond the centre line. */
  pcDefenders: number;
  /** PC: a first *hit* shot must cross the goal line no higher than this (backboard height, 460 mm). */
  pcFirstHitMaxHeight: Metres;
  /** PS: ball on the penalty spot, 6.40 m; the stroke must be a push, flick or scoop — one touch. */
  strokeSpot: Metres;
  /** Dangerous play: a raised ball above this height, arriving within `dangerRange` of an opponent, is dangerous. PROVISIONAL knee ≈ 0.5 m. */
  dangerHeight: Metres;
  dangerRange: Metres;
  /** Card suspensions in ticks. PROVISIONAL for Belgian league: green 2 min, yellow 5 min (serious 10), red = rest of match. */
  cards: { green: number; yellow: number; yellowSerious: number };
  /** Persistent-fouling thresholds (an umpiring heuristic, not a law): nth personal foul → green, mth → yellow. PROVISIONAL. */
  persistentFoulGreenAt: number;
  persistentFoulYellowAt: number;
  /** Rolling substitutions: allowed at any time except between PC award and completion. FIH. */
  noSubsDuringPC: boolean;
  /** Dugout zone: |y| beyond the sideline where subs enter/leave, within ±this x of halfway. FIH: 3 m either side of centre line. */
  dugoutHalfWidthX: Metres;
  /**
   * Engine safeguard, not a law: a PC still "active" this many playing ticks after injection is ended as cleared.
   * Real PCs are over in seconds; this only guards against an AI stall keeping the quarter alive.
   */
  pcTimeoutTicks: number;
  /** Shoot-out: 8 s per attempt (FIH shoot-out competition). Phase 6 uses it. */
  shootOutTicks: number;
  /** After a goal, play restarts with a centre pass by the team that conceded. */
  centrePassByConceding: boolean;
  /** Ball is dead once it comes to rest after a whistle; ball must be stationary before a free hit is taken. */
  restartRequiresStationary: boolean;
  /** Minimum speed to consider the ball "stationary" for restarts. */
  stationarySpeed: Scalar;
}

export const FIH_OUTDOOR: Laws = {
  quarterTicks: 15 * MIN,
  breakTicks: [2 * MIN, 10 * MIN, 2 * MIN],
  setupTicks: { centrePass: 3 * SEC, freeHit: 1 * SEC, penaltyCorner: 6 * SEC, penaltyStroke: 6 * SEC },
  freeHitDistance: 5,
  freeHit23TravelDistance: 5,
  longCornerOn23: true,
  hitOutDistance: 15,
  pcInjectDistance: 10,
  pcDefenders: 5,
  pcFirstHitMaxHeight: 0.46,
  strokeSpot: 6.4,
  dangerHeight: 0.5,
  dangerRange: 5,
  cards: { green: 2 * MIN, yellow: 5 * MIN, yellowSerious: 10 * MIN },
  persistentFoulGreenAt: 3,
  persistentFoulYellowAt: 5,
  noSubsDuringPC: true,
  pcTimeoutTicks: 40 * SEC,
  dugoutHalfWidthX: 3,
  shootOutTicks: 8 * SEC,
  centrePassByConceding: true,
  restartRequiresStationary: true,
  stationarySpeed: 0.05,
};

/** Shorter breaks for batch simulation — same laws of play, less idle sim time. */
export const FIH_OUTDOOR_FAST: Laws = {
  ...FIH_OUTDOOR,
  breakTicks: [2 * SEC, 4 * SEC, 2 * SEC],
  setupTicks: { centrePass: 1 * SEC, freeHit: 10, penaltyCorner: 2 * SEC, penaltyStroke: 2 * SEC },
};
