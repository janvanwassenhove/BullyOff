/**
 * Competition profiles — the ONLY place men's and women's hockey differ inside
 * the engine (BRIEF §5.0). No `if (isWomens)` anywhere; every difference is a
 * value here. Phase 4 tunes these against Belgian League + FIH Pro League data,
 * separately per profile, never pooled. Every number below is a Phase-1
 * placeholder with a hockey rationale; treat as provisional until calibrated.
 */
import type { Scalar } from '@bullyoff/shared';

export type ProfileId = 'mens' | 'womens';
export type SurfaceState = 'dry' | 'watered' | 'wet';

export interface SurfaceParams {
  /**
   * Rolling deceleration, m/s². A hockey ball on sand-dressed/water-based turf
   * slows roughly linearly. Watered turf is faster and truer (less decel); a
   * genuinely wet pitch (standing water) drags again.
   */
  rollingDecel: Scalar;
  /** Vertical coefficient of restitution on bounce. Water kills bounce. */
  restitution: Scalar;
  /** Fraction of horizontal speed lost per bounce (skid/friction impulse). */
  bounceFrictionLoss: Scalar;
  /** Below this vertical speed after a bounce the ball settles to rolling. */
  settleSpeed: Scalar;
}

export interface BallParams {
  mass: Scalar;      // kg
  radius: Scalar;    // m
  /** Quadratic air-drag coefficient k in a = -k·|v|·v (1/m). ~0.008 for a 72 mm ball. */
  airDrag: Scalar;
  gravity: Scalar;   // m/s²
}

export interface PlayerParams {
  /** Effective body radius for ball collision, m — legs, feet and a lunging stick, not just the torso (Phase 4 calibrated). */
  radius: Scalar;
  height: Scalar;          // above this the ball passes over a player, m
  maxSpeed: Scalar;        // m/s, elite sprint
  accel: Scalar;           // m/s²
  decel: Scalar;           // m/s² (stopping is quicker than starting)
  turnRate: Scalar;        // rad/s
  reach: Scalar;           // stick reach from body centre, m
  /** Stamina drain per second at max speed (fraction of full). ~0.006 → ~3 min flat-out. */
  staminaDrainAtMax: Scalar;
  staminaRecoverIdle: Scalar;
}

export interface StrikeParams {
  pushSpeed: Scalar;   // m/s
  slapSpeed: Scalar;   // m/s
  hitSpeed: Scalar;    // m/s — elite hit ≈ 130 km/h (m) / 110 km/h (w)
  flickSpeed: Scalar;  // m/s — drag flick
  flickLiftAngle: Scalar; // rad — typical drag-flick launch angle
  hitLiftAngle: Scalar;   // rad — a hit is meant to be flat; small residual lift
  aerialSpeed: Scalar;
  aerialLiftAngle: Scalar;
  /** Trap: fraction of incoming speed retained after a controlled stop. */
  trapRetain: Scalar;
}

/**
 * Phase 4 calibration knobs — profile-level scalars for effects the model does not
 * yet derive from first principles. Each is PROVISIONAL and documented in
 * docs/rules/calibration.md with the reason it exists; the goal is to retire them.
 */
export interface CalibrationParams {
  /**
   * Multiplier on the goalkeeper's save probability. 1.0 for the men's game. The women's
   * game concedes ~⅓ fewer goals per shot on target than shot speed alone explains
   * (keeper reach vs goal size, shot placement); until Phase 5/6 model that, this carries it.
   */
  gkSaveScale: Scalar;
}

export interface Profile {
  id: ProfileId;
  ball: BallParams;
  surfaces: Record<SurfaceState, SurfaceParams>;
  player: PlayerParams;
  strike: StrikeParams;
  calibration: CalibrationParams;
}

const BALL: BallParams = { mass: 0.16, radius: 0.036, airDrag: 0.008, gravity: 9.81 };

// Surface physics is a property of the pitch, not of who plays on it — shared
// between profiles by construction. Ball speeds differ; turf does not.
const SURFACES: Record<SurfaceState, SurfaceParams> = {
  // Rolling deceleration calibrated so a 30 m/s hit dies within ~60–80 m and a firm 10 m/s push travels ~20 m
  // (drag ∝ v² is applied on top — see ball.ts). Phase 4 tunes per real data.
  dry:     { rollingDecel: 3.2, restitution: 0.55, bounceFrictionLoss: 0.25, settleSpeed: 0.6 },
  watered: { rollingDecel: 2.3, restitution: 0.40, bounceFrictionLoss: 0.15, settleSpeed: 0.5 },
  wet:     { rollingDecel: 2.8, restitution: 0.30, bounceFrictionLoss: 0.30, settleSpeed: 0.4 },
};

export const MENS: Profile = {
  id: 'mens',
  ball: BALL,
  surfaces: SURFACES,
  player: {
    radius: 0.5, height: 1.85, maxSpeed: 8.6, accel: 4.5, decel: 7.0, turnRate: 6.0, reach: 1.6,
    staminaDrainAtMax: 0.006, staminaRecoverIdle: 0.004,
  },
  strike: {
    pushSpeed: 14, slapSpeed: 24, hitSpeed: 36.1, flickSpeed: 33, flickLiftAngle: 0.20,
    hitLiftAngle: 0.02, aerialSpeed: 22, aerialLiftAngle: 0.70, trapRetain: 0.05,
  },
  calibration: { gkSaveScale: 2.05 },
};

export const WOMENS: Profile = {
  id: 'womens',
  ball: BALL,
  surfaces: SURFACES,
  player: {
    radius: 0.47, height: 1.72, maxSpeed: 8.0, accel: 4.35, decel: 6.5, turnRate: 6.2, reach: 1.5,
    staminaDrainAtMax: 0.006, staminaRecoverIdle: 0.004,
  },
  strike: {
    pushSpeed: 12.5, slapSpeed: 21, hitSpeed: 30.5, flickSpeed: 26, flickLiftAngle: 0.20,
    hitLiftAngle: 0.02, aerialSpeed: 19, aerialLiftAngle: 0.70, trapRetain: 0.05,
  },
  calibration: { gkSaveScale: 1.88 },
};

export const PROFILES: Record<ProfileId, Profile> = { mens: MENS, womens: WOMENS };

export function getProfile(id: ProfileId): Profile {
  return PROFILES[id];
}
