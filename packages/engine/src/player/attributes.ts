/**
 * Player attributes on a 1–20 scale (BRIEF §5.3) and their mapping onto engine
 * parameters. Every mapping is a pure function with a test asserting its effect
 * (CLAUDE.md rule 8). Attributes never appear in physics directly — they scale
 * the *inputs* to physics (strike speed, angular error, reach, top speed) and
 * the *quality* of decisions (AI). Hidden attributes drive development (Phase 6).
 */
import { clamp, type Scalar } from '@bullyoff/shared';

export interface TechnicalAttrs {
  firstTouch: number; trapping: number; push: number; slap: number; hit: number; dragFlick: number;
  skills3d: number; elimination: number; tackling: number;
}
export interface PhysicalAttrs { pace: number; acceleration: number; stamina: number; strength: number; agility: number }
export interface MentalAttrs { vision: number; decisions: number; positioning: number; composure: number; workRate: number; aggression: number; discipline: number }
export interface GoalkeeperAttrs { reflexes: number; positioning: number; kicking: number; aerial: number; oneOnOne: number; pcReading: number }
export interface HiddenAttrs { potential: number; injuryProneness: number; consistency: number; bigMatch: number; coachability: number; ambition: number; lifePressure: number }

export interface Attributes {
  technical: TechnicalAttrs;
  physical: PhysicalAttrs;
  mental: MentalAttrs;
  goalkeeper: GoalkeeperAttrs;
  hidden: HiddenAttrs;
}

export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';

const fill = <T extends object>(keys: (keyof T)[], v: number): T => Object.fromEntries(keys.map((k) => [k, v])) as T;
const TECH_KEYS: (keyof TechnicalAttrs)[] = ['firstTouch', 'trapping', 'push', 'slap', 'hit', 'dragFlick', 'skills3d', 'elimination', 'tackling'];
const PHYS_KEYS: (keyof PhysicalAttrs)[] = ['pace', 'acceleration', 'stamina', 'strength', 'agility'];
const MENT_KEYS: (keyof MentalAttrs)[] = ['vision', 'decisions', 'positioning', 'composure', 'workRate', 'aggression', 'discipline'];
const GK_KEYS: (keyof GoalkeeperAttrs)[] = ['reflexes', 'positioning', 'kicking', 'aerial', 'oneOnOne', 'pcReading'];
const HID_KEYS: (keyof HiddenAttrs)[] = ['potential', 'injuryProneness', 'consistency', 'bigMatch', 'coachability', 'ambition', 'lifePressure'];

/** Flat attributes at a level, with role emphasis. Level 12 ≈ a solid Belgian top-division player. */
export function attributesFor(role: Role, level = 12): Attributes {
  const a: Attributes = {
    technical: fill<TechnicalAttrs>(TECH_KEYS, level), physical: fill<PhysicalAttrs>(PHYS_KEYS, level), mental: fill<MentalAttrs>(MENT_KEYS, level),
    goalkeeper: fill<GoalkeeperAttrs>(GK_KEYS, role === 'GK' ? level : 3), hidden: fill<HiddenAttrs>(HID_KEYS, 10),
  };
  const up = (n: number): number => clamp(n + 3, 1, 20);
  switch (role) {
    case 'GK': a.technical.hit = clamp(level - 4, 1, 20); a.technical.dragFlick = 2; a.physical.pace = clamp(level - 3, 1, 20); break;
    case 'DEF': a.technical.tackling = up(level); a.technical.hit = up(level); a.mental.positioning = up(level); a.physical.strength = up(level); break;
    case 'MID': a.mental.vision = up(level); a.technical.push = up(level); a.physical.stamina = up(level); a.mental.workRate = up(level); break;
    case 'FWD': a.technical.elimination = up(level); a.technical.dragFlick = up(level); a.physical.pace = up(level); a.technical.firstTouch = up(level); break;
  }
  return a;
}

/** 1–20 → 0..1 */
export const norm = (v: number): Scalar => clamp((v - 1) / 19, 0, 1);

/** Strike speed multiplier vs profile maximum: a 20 hits at the profile max, a 1 at 55 %. */
export function strikeSpeedFactor(a: Attributes, kind: 'push' | 'slap' | 'hit' | 'flick' | 'aerial'): Scalar {
  const attr = kind === 'push' ? a.technical.push : kind === 'slap' ? a.technical.slap : kind === 'hit' ? a.technical.hit
    : kind === 'flick' ? a.technical.dragFlick : a.technical.skills3d;
  return 0.55 + 0.45 * norm(attr);
}

/**
 * Angular error (standard deviation, radians) of a strike. A 20 sprays ~1.5°,
 * a 1 ~9°. Composure and fatigue widen it (hockey reason: tired legs, wide hits).
 */
export function strikeErrorSd(a: Attributes, kind: 'push' | 'slap' | 'hit' | 'flick' | 'aerial', stamina: Scalar): Scalar {
  const attr = kind === 'push' ? a.technical.push : kind === 'slap' ? a.technical.slap : kind === 'hit' ? a.technical.hit
    : kind === 'flick' ? a.technical.dragFlick : a.technical.skills3d;
  const base = 0.135 - 0.085 * norm(attr); // 7.7° → 2.9° (elite players are accurate, not lasers)
  const composure = 1.15 - 0.3 * norm(a.mental.composure);
  const fatigue = 1 + (1 - stamina) * 0.8;
  // A push is the accurate pass (the ball never leaves the stick); a hit is a swing; an aerial is a scoop.
  const kindF = kind === 'push' ? 0.5 : kind === 'slap' ? 0.8 : kind === 'flick' ? 0.9 : kind === 'aerial' ? 1.2 : 1;
  return base * composure * fatigue * kindF;
}

/** Probability a trap/stop is clean. Depends on trapping + first touch, incoming speed, ball height. */
/**
 * `speedRef` scales the speed thresholds to the profile's tempo (men = 1): the women's game is the
 * same sport played with a slower ball, and judging its passes against men's arrival speeds handed
 * every duel to the defence — the sim showed 22 circle entries and 4 corners a match where the
 * women's targets are 34 and 8.
 */
export function trapSuccess(a: Attributes, incomingSpeed: Scalar, ballHeight: Scalar, speedRef: Scalar = 1): Scalar {
  const skill = 0.5 * norm(a.technical.trapping) + 0.5 * norm(a.technical.firstTouch);
  // Receiving a firm flat pass is routine at club level — the first thing anyone is taught. At the old
  // base (0.55, penalty from 8 m/s) an average receiver spilled 29 % of ordinary 10 m/s passes and
  // possession lived 2.5 touches; attacks never built. 9 m/s easy; 39 m/s brutal (men's scale).
  const speedPenalty = clamp((incomingSpeed - 9 * speedRef) / (30 * speedRef), 0, 0.6);
  const heightPenalty = clamp(ballHeight / 0.6, 0, 0.5);
  return clamp(0.62 + 0.38 * skill - speedPenalty - heightPenalty, 0.05, 0.99);
}

/** Top-speed and acceleration factors vs profile (a 20 = profile max, a 1 = 75 %). */
export const paceFactor = (a: Attributes): Scalar => 0.75 + 0.25 * norm(a.physical.pace);
export const accelFactor = (a: Attributes): Scalar => 0.75 + 0.25 * norm(a.physical.acceleration);
/** Stamina drain multiplier: high stamina attribute drains slower. */
export const staminaDrainFactor = (a: Attributes): Scalar => 1.4 - 0.7 * norm(a.physical.stamina);

/**
 * Tackle contest: probability the tackler wins the ball cleanly, and that the
 * contest is a foul by the tackler (stick tackle) — from tackling vs elimination,
 * strength, aggression/discipline. Returns cumulative thresholds for one uniform draw.
 */
export function tackleOdds(tackler: Attributes, carrier: Attributes): { win: Scalar; foulTackler: Scalar } {
  const edge = norm(tackler.technical.tackling) - norm(carrier.technical.elimination) + 0.3 * (norm(tackler.physical.strength) - norm(carrier.physical.strength));
  // Base 0.28, not 0.35: at 0.35 an even contest turned over every third duel and possession churned
  // so fast (509 alternations, 23 attacking-23 entries a match) that attacks never reached the circle.
  // On turf the carrier protects the ball with body and stick; a clean steal is the exception.
  const win = clamp(0.28 + 0.35 * edge, 0.08, 0.75);
  // hockey reason: aggressive, ill-disciplined tacklers hit sticks; a mistimed lunge on a better carrier is a foul more often
  const foulTackler = clamp(0.06 + 0.12 * norm(tackler.mental.aggression) - 0.08 * norm(tackler.mental.discipline) - 0.06 * edge, 0.02, 0.35);
  return { win, foulTackler };
}

/** GK effective reach for a save attempt (metres from body centre), reflexes + agility. */
export const gkReach = (a: Attributes): Scalar => 1.1 + 0.9 * (0.6 * norm(a.goalkeeper.reflexes) + 0.4 * norm(a.physical.agility));
/** GK save probability given a shot at speed `v` arriving within reach; positioning narrows angles elsewhere. */
export function gkSaveChance(a: Attributes, shotSpeed: Scalar, distanceFromBody: Scalar): Scalar {
  const reflex = norm(a.goalkeeper.reflexes);
  const speedPenalty = clamp((shotSpeed - 12) / 45, 0, 0.5);
  const reachPenalty = clamp(distanceFromBody / gkReach(a), 0, 1) * 0.45;
  // Calibrated so an average keeper stops ≈ 50–55 % of on-target shots incl. touches (Phase 4: goals ≈ 22 % of all shots).
  return clamp(0.44 + 0.75 * reflex - speedPenalty - reachPenalty, 0.05, 0.95);
}
/** A penalty stroke gives the keeper ~0.25 s from 6.4 m: reflex-dominated, low. Elite conversion ≈ 75 %. */
export function gkStrokeSaveChance(a: Attributes): Scalar {
  // A stroke is the taker's to lose: ~70–75 % go in at every level (the keeper guesses).
  return clamp(0.1 + 0.16 * norm(a.goalkeeper.reflexes) + 0.08 * norm(a.goalkeeper.oneOnOne), 0.05, 0.4);
}
