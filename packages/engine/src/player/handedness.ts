/**
 * Handedness — Phase 11b (docs/design/hockey-systems.md §6).
 *
 * Every hockey stick is right-handed. A player's **open stick side is their right**; their
 * **reverse is their left**. That one fact is why hockey pressing angles are not football pressing
 * angles, why a tackle from the wrong side is a foul, and where the amateur game's turnovers
 * actually come from. Left-handed players do not exist in hockey: there is no attribute for one
 * here and there must not be (§6).
 *
 * Everything below is an *input* to physics — a scale on an attribute-derived number — never a
 * change to physics itself (Phase 3's rule). Pure and deterministic; no Rng, no state.
 *
 * `lateral` is the single primitive: the sine of the bearing to something, relative to where the
 * player faces.
 *
 *     −1 ── hard on the open stick (right) ── 0 straight ahead ── +1 hard on the reverse (left)
 *
 * A sine rather than a side flag on purpose: a ball half a metre off the front foot is barely a
 * reverse ball, and a step of the body turns it into a forehand one. Hockey is played in that
 * gradient, and a hard flag would make the model shout where the game whispers.
 */
import { clamp, dmath, type Radians, type Scalar, type Vec2 } from '@bullyoff/shared';
import { norm, type Attributes } from './attributes.js';

/** Where `to` lies relative to a player at `from` facing `heading`: −1 open stick … +1 reverse. */
export function lateralOf(heading: Radians, from: Vec2, to: Vec2): Scalar {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  return lateralOfDir(heading, dmath.atan2(dy, dx));
}

/** The same for a direction (a strike angle, a run): −1 open stick … +1 reverse. */
export function lateralOfDir(heading: Radians, angle: Radians): Scalar {
  return dmath.sin(dmath.angleDelta(heading, angle));
}

/** How far onto the reverse, 0..1 (0 anywhere on the open side — the forehand has no penalty). */
export const reverseness = (lateral: Scalar): Scalar => clamp(lateral, 0, 1);
/** How far onto the open stick, 0..1 — the clean side, where a tackle and a first touch are easy. */
export const openness = (lateral: Scalar): Scalar => clamp(-lateral, 0, 1);

const skillOf = (a: Attributes): Scalar => 0.5 * norm(a.technical.firstTouch) + 0.5 * norm(a.technical.trapping);

/**
 * Receiving. A ball arriving on the reverse costs a touch: the stick has to be turned over, and
 * the body cannot get behind it. A good player opens up onto their forehand and barely pays;
 * a weak one lets it run — which is exactly where the club game's turnovers live (§6.3).
 * Multiplies the trap-success probability.
 */
export function receiveSideFactor(a: Attributes, lateral: Scalar): Scalar {
  // 0.20: a reverse ball is a *cost*, not a turnover — the man usually still gets it away — but the
  // cost has to be big enough to see in a played match (sim/handedness.test.ts measures ~5 points of
  // clean control at matched ball speed). What the game loses in goals to this comes back through
  // gkSaveScale, which is exactly the provisional knob that was carrying the missing mechanism.
  // The skill term is deliberately shallow (0.3, not 0.7): the reverse is awkward for everyone, and
  // what a good player really has is the footwork to *avoid* being on it — which the AI models by
  // choosing better passes and better carries. A steep term made class compound into blowouts
  // (6+ goal team scores nearly doubled in the 96-match run), which is not the hockey either.
  return clamp(1 - 0.20 * reverseness(lateral) * (1 - 0.3 * skillOf(a)), 0.65, 1);
}

/** How much of each strike the reverse takes away: the reverse HIT is the weak one, a push barely notices. */
const SPEED_PENALTY: Record<'push' | 'slap' | 'hit' | 'flick' | 'aerial', number> = {
  push: 0.06, slap: 0.11, hit: 0.18, flick: 0.16, aerial: 0.12,
};
/** …and how much wider it sprays. A reverse hit is a swing across the body; a push is a push. */
const ERROR_PENALTY: Record<'push' | 'slap' | 'hit' | 'flick' | 'aerial', number> = {
  push: 0.20, slap: 0.38, hit: 0.60, flick: 0.50, aerial: 0.38,
};
const strikeSkill = (a: Attributes, kind: keyof typeof SPEED_PENALTY): Scalar =>
  norm(kind === 'push' ? a.technical.push : kind === 'slap' ? a.technical.slap : kind === 'hit' ? a.technical.hit
    : kind === 'flick' ? a.technical.dragFlick : a.technical.skills3d);

/** Striking. The reverse is weaker (§6.5) — multiplies the strike speed. */
export function strikeSideSpeed(a: Attributes, kind: keyof typeof SPEED_PENALTY, lateral: Scalar): Scalar {
  return clamp(1 - SPEED_PENALTY[kind] * reverseness(lateral) * (1 - 0.25 * strikeSkill(a, kind)), 0.6, 1);
}
/** …and less accurate — multiplies the angular error. */
export function strikeSideError(a: Attributes, kind: keyof typeof SPEED_PENALTY, lateral: Scalar): Scalar {
  return 1 + ERROR_PENALTY[kind] * reverseness(lateral) * (1 - 0.25 * strikeSkill(a, kind));
}

/**
 * Carrying and eliminating on the reverse is harder (§6.4), so shepherding a carrier onto it pays
 * in the value function and not only in the picture. Used by the AI to score a carry direction.
 */
export function carrySideFactor(a: Attributes, lateral: Scalar): Scalar {
  return clamp(1 - 0.35 * reverseness(lateral) * (1 - 0.6 * norm(a.technical.elimination)), 0.6, 1);
}

export interface TackleSide { win: Scalar; foulTackler: Scalar; shield: Scalar }

/**
 * The tackle side (§6.2). `lateral` is where the TACKLER stands relative to where the CARRIER
 * faces: on the carrier's open stick side the ball is right there and the tackle is the clean one;
 * coming across the body from the reverse side you reach through the man — which is a stick tackle
 * when you catch him and obstruction when he holds the shield. This is the right cause for club
 * hockey's penalty corners: they come from stick tackles and feet in the D, not from a foul rate.
 *
 * `shield` is the extra chance the contest is given the other way, as obstruction by the carrier.
 */
export function tackleSideOdds(base: { win: Scalar; foulTackler: Scalar }, a: Attributes, lateral: Scalar): TackleSide {
  const across = reverseness(lateral), clean = openness(lateral);
  // a disciplined tackler reaches through less often than a hot-headed one
  const rash = 1 - 0.45 * norm(a.mental.discipline) + 0.3 * norm(a.mental.aggression);
  const foulTackler = clamp(base.foulTackler * (1 - 0.35 * clean) + 0.13 * across * rash, 0.01, 0.45);
  // the two are cumulative thresholds on one uniform draw (match.ts): leave room to be beaten
  return {
    win: clamp(base.win * (1 - 0.35 * across + 0.20 * clean), 0.05, Math.min(0.85, 0.92 - foulTackler)),
    foulTackler,
    shield: 0.05 + 0.09 * across,
  };
}

/** The unit vector along a player's open stick side (their right) — where a shepherding defender stands. */
export function openStickDir(heading: Radians): Vec2 {
  return { x: dmath.sin(heading), y: -dmath.cos(heading) };
}
